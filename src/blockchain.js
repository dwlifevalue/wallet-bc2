import { BLOCKCHAIN_CONFIG } from './blockchain-config.js';
import { rpcManager } from './rpc-manager.js';
import { getTranslation, sleep } from './config.js';
import { eventBus, EVENTS, requestWalletInfo } from './events.js';

// === CONFIGURATION SHORTCUTS ===
const NODE_CONFIG = {
  ERROR_500_DELAY: 2000,
  MAX_RETRIES: 5,
  RETRY_DELAY: 2000,
  NO_503_BACKOFF_METHODS: new Set(['getrawmempool', 'getrawtransaction', 'getmempoolinfo'])
};

const HD_CONFIG = BLOCKCHAIN_CONFIG.HD_CONFIG;
const TRANSACTION_CONFIG = BLOCKCHAIN_CONFIG.TRANSACTION;
const VALIDATION_PATTERNS = BLOCKCHAIN_CONFIG.VALIDATION;
const NETWORK = BLOCKCHAIN_CONFIG.NETWORK;

// === CACHING AND STATE ===
const CACHE_CONFIG = {
  UTXO: {
    DURATION: 300000,
    MAX_SIZE: 5000,
    PRIORITY: 'high'
  },
  BALANCE: {
    DURATION: 300000,
    MAX_SIZE: 5000,
    PRIORITY: 'normal'
  },
  RAW_TX: {
    DURATION: 300000,
    MAX_SIZE: 5000,
    PRIORITY: 'normal'
  }
};

class SmartCache {
  constructor(config) {
    this.cache = new Map();
    this.config = config;
  }

  set(key, value) {
    if (this.cache.size >= this.config.MAX_SIZE) {
      console.warn(`[CACHE] Max size (${this.config.MAX_SIZE}) reached for ${this.config.PRIORITY} priority cache - cleaning up`);
      this.cleanup();
    }
    
    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
      hits: 0
    });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > this.config.DURATION) {
      this.cache.delete(key);
      return null;
    }

    entry.hits++;
    return entry.data;
  }

  has(key) {
    return this.get(key) !== null;
  }

  cleanup() {
    if (this.config.PRIORITY === 'high') {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp > this.config.DURATION) {
          this.cache.delete(key);
        }
      }
      return;
    }

    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].hits - b[1].hits)
      .slice(0, Math.floor(this.config.MAX_SIZE * 0.3));
    
    entries.forEach(([key]) => this.cache.delete(key));
  }

  clear(selective = false) {
    if (selective && this.config.PRIORITY === 'high') {
      return;
    }
    this.cache.clear();
  }

  invalidate(key) {
    this.cache.delete(key);
  }
}

const SMART_UTXO_CACHE = new SmartCache(CACHE_CONFIG.UTXO);
const SMART_BALANCE_CACHE = new SmartCache(CACHE_CONFIG.BALANCE);
const SMART_TX_CACHE = new SmartCache(CACHE_CONFIG.RAW_TX);
const SMART_RAWTX_CACHE = new SmartCache({
  DURATION: 300000,
  MAX_SIZE: 100,
  PRIORITY: 'low'
});

// === UNIFIED CACHE MANAGER ===
export class CacheManager {
  static invalidateAddress(address, isHD = false) {
    const cacheKeyUTXO = `utxos:${address}:${isHD}`;
    const cacheKeyBalance = `balance:${address}:${isHD}`;
    
    SMART_UTXO_CACHE.invalidate(cacheKeyUTXO);
    SMART_BALANCE_CACHE.invalidate(cacheKeyBalance);
    
    console.log(`[CACHE] ${getTranslation('loading.cache_clearing', 'Clearing caches...')} ${address.substring(0, 10)}...`);
  }
  
  static invalidateWallet(walletInfo) {
    if (!walletInfo || !walletInfo.addresses) return;
    
    const isHD = walletInfo.importType === 'hd';
    
    if (isHD) {
      if (walletInfo.addresses.bech32) {
        this.invalidateAddress(walletInfo.addresses.bech32, true);
      }
      if (walletInfo.addresses.taproot) {
        this.invalidateAddress(walletInfo.addresses.taproot, true);
      }
    } else {
      if (walletInfo.addresses.bech32) {
        this.invalidateAddress(walletInfo.addresses.bech32, false);
      }
    }
  }
  
  static invalidateAll() {
    SMART_UTXO_CACHE.clear(false);
    SMART_BALANCE_CACHE.clear(false);
    SMART_TX_CACHE.clear(false);
    
    console.log(`[CACHE] ${getTranslation('loading.balance_updated', 'Balance updated!')}`);
  }
}

// === TRANSACTION DETAIL CACHE ===
export async function getTxDetailCached(txid) {
  const cached = SMART_RAWTX_CACHE.get(`tx:${txid}`);
  if (cached) return cached;
  
  const tx = await handleError500WithRetry(async () => {
    return await rpcManager.call('getrawtransaction', [txid, true]);
  });
  
  SMART_RAWTX_CACHE.set(`tx:${txid}`, tx);
  return tx;
}

// === OP_RETURN DATA EXTRACTION ===
export function extractOpReturnData(scriptHex) {
  if (!scriptHex || typeof scriptHex !== 'string') return null;
  if (!VALIDATION_PATTERNS.scriptHex.test(scriptHex)) return null;
  
  const script = scriptHex.toLowerCase();
  
  if (script.startsWith('6a4c')) {
    const lengthByte = parseInt(script.substring(4, 6), 16);
    if (lengthByte <= 75) {
      const dataHex = script.substring(6, 6 + lengthByte * 2);
      return dataHex;
    }
  }
  
  if (script.startsWith('6a')) {
    const lengthByte = parseInt(script.substring(2, 4), 16);
    if (lengthByte > 0 && lengthByte <= 75) {
      const dataHex = script.substring(4, 4 + lengthByte * 2);
      return dataHex;
    }
  }
  
  return null;
}

// === TRANSACTION SENDER ADDRESS ===
export async function getTransactionSenderAddress(txid) {
  try {
    const tx = await handleError500WithRetry(async () => {
      return await rpcManager.call('getrawtransaction', [txid, true]);
    });
    
    if (!tx || !tx.vin || !tx.vin[0]) return null;
    
    const firstInput = tx.vin[0];
    if (firstInput.coinbase) return null;
    
    const prevTxid = firstInput.txid;
    const prevVout = firstInput.vout;
    
    const prevTx = await handleError500WithRetry(async () => {
      return await rpcManager.call('getrawtransaction', [prevTxid, true]);
    });
    
    if (!prevTx || !prevTx.vout || !prevTx.vout[prevVout]) return null;
    
    const output = prevTx.vout[prevVout];
    if (!output.scriptPubKey || !output.scriptPubKey.addresses) return null;
    
    return output.scriptPubKey.addresses[0] || null;
  } catch (error) {
    console.error(`[BLOCKCHAIN] ${getTranslation('explorer.checking_explorer', 'Error while checking explorer:')}`, error);
    return null;
  }
}

// === TRANSACTION CONFIRMATION WAITER ===
export async function waitForConfirmation(txid, maxWait = 600000, progressCallback = null) {
  const startTime = Date.now();
  const checkInterval = 10000;
  
  while (Date.now() - startTime < maxWait) {
    try {
      const tx = await rpcManager.call('getrawtransaction', [txid, true]);
      
      if (tx && tx.confirmations && tx.confirmations >= 1) {
        if (progressCallback) progressCallback(100);
        return true;
      }
      
      if (progressCallback) {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(95, Math.round((elapsed / maxWait) * 100));
        progressCallback(progress);
      }
      
      await sleep(checkInterval);
    } catch (error) {
      await sleep(checkInterval);
    }
  }
  
  if (progressCallback) progressCallback(0);
  return false;
}

// === UNIFIED ERROR HANDLING ===
export async function handleError500WithRetry(operation, maxRetries = 3) {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      const errorMsg = String(error.message || error);
      
      if (errorMsg.includes('500') || errorMsg.includes('Internal Server Error') || errorMsg.includes('Scan already in progress')) {
        attempt++;
        
        if (errorMsg.includes('Scan already in progress')) {
          try {
            await rpcManager.call('scantxoutset', ['abort']);
            await sleep(1000);
          } catch (abortError) {
            console.warn(`[BLOCKCHAIN] ${getTranslation('explorer.checking_explorer', 'Error while checking explorer:')}`, abortError);
          }
        }
        
        if (attempt < maxRetries) {
          await sleep(NODE_CONFIG.ERROR_500_DELAY);
          continue;
        } else {
          console.error(`[BLOCKCHAIN] ${getTranslation('errors.broadcast_failed', 'Broadcast failed')} ${maxRetries} attempts`);
        }
      }
      
      throw error;
    }
  }
}

// === ADDRESS MANAGEMENT ===
export class AddressManager {
  static getAddressType(address) {
    try {
      if (!address || typeof address !== 'string') return 'unknown';
      
      const bech32Prefix = NETWORK.bech32;
      if (address.startsWith(`${bech32Prefix}1p`)) return 'p2tr';
      if (address.startsWith(`${bech32Prefix}1`)) return 'p2wpkh';
      if (address.startsWith('3')) return 'p2sh';
      if (address.startsWith('1')) return 'p2pkh';
      
      return 'unknown';
    } catch (error) {
      console.error(`[BLOCKCHAIN] ${getTranslation('explorer.checking_explorer', 'Error while checking explorer:')}`, error);
      return 'unknown';
    }
  }

  static detectScriptType(scriptPubKey) {
    try {
      if (!scriptPubKey || typeof scriptPubKey !== 'string') {
        return 'unknown';
      }

      if (!VALIDATION_PATTERNS || !VALIDATION_PATTERNS.scriptHex) {
        console.error('[BLOCKCHAIN] VALIDATION_PATTERNS.scriptHex is undefined');
        return 'unknown';
      }

      if (!VALIDATION_PATTERNS.scriptHex.test(scriptPubKey)) {
        return 'unknown';
      }

      const script = Buffer.from(scriptPubKey, 'hex');
      
      if (script.length === 25 && 
          script[0] === 0x76 && script[1] === 0xa9 && script[2] === 0x14 && 
          script[23] === 0x88 && script[24] === 0xac) {
        return 'p2pkh';
      }
      
      if (script.length === 22 && script[0] === 0x00 && script[1] === 0x14) {
        return 'p2wpkh';
      }
      
      if (script.length === 23 && script[0] === 0xa9 && script[1] === 0x14 && script[22] === 0x87) {
        return 'p2sh';
      }
      
      if (script.length === 34 && script[0] === 0x51 && script[1] === 0x20) {
        return 'p2tr';
      }

      return 'unknown';
    } catch (error) {
      console.error(`[BLOCKCHAIN] ${getTranslation('explorer.checking_explorer', 'Error while checking explorer:')}`, error);
      return 'unknown';
    }
  }

  static async validateAddress(address) {
    try {
      const result = await rpcManager.call('validateaddress', [address]);
      return result && result.isvalid;
    } catch (error) {
      console.error(`[BLOCKCHAIN] ${getTranslation('explorer.checking_explorer', 'Error while checking explorer:')}`, error);
      return false;
    }
  }
}

// === TAPROOT UTILITIES ===
export class TaprootUtils {
  static toXOnly(pubkey) {
    if (!pubkey || pubkey.length < 33) {
      throw new Error(getTranslation('wallet.invalid_pubkey_conversion', 'Invalid public key for X-only conversion'));
    }
    
    const buf = Buffer.isBuffer(pubkey) ? pubkey : Buffer.from(pubkey);
    return Buffer.from(buf.subarray(1, 33));
  }

  static tapTweakHash(pubKey, h = Buffer.alloc(0)) {
    if (!window.bitcoin || !window.bitcoin.crypto) {
      throw new Error(getTranslation('wallet.bitcoin_library_unavailable', 'Bitcoin library unavailable'));
    }
    
    const xonly = TaprootUtils.toXOnly(pubKey);
    const hBuf = Buffer.isBuffer(h) ? h : Buffer.from(h);
    
    return window.bitcoin.crypto.taggedHash(
      'TapTweak',
      Buffer.concat([xonly, hBuf])
    );
  }

  static tweakSigner(signer, opts = {}) {
    if (!window.ecc || typeof window.ecc.privateAdd !== 'function') {
      throw new Error(getTranslation('wallet.ecc_library_unavailable', 'ECC library unavailable for tweakSigner'));
    }

    const privateKeyBuf = Buffer.isBuffer(signer.privateKey) ? signer.privateKey : Buffer.from(signer.privateKey);
    const publicKeyBuf = Buffer.isBuffer(signer.publicKey) ? signer.publicKey : Buffer.from(signer.publicKey);
    
    let d = Uint8Array.from(privateKeyBuf);
    const P = Uint8Array.from(publicKeyBuf);

    if (P[0] === 3) {
      d = window.ecc.privateNegate(d);
    }

    const tweakHash = opts.tweakHash ? Buffer.from(opts.tweakHash) : Buffer.alloc(0);
    const tweak = Uint8Array.from(TaprootUtils.tapTweakHash(publicKeyBuf, tweakHash));

    const dTweak = window.ecc.privateAdd(d, tweak);
    if (!dTweak) {
      throw new Error(getTranslation('wallet.invalid_tweaked_key', 'Invalid tweaked private key'));
    }

    const PTweak = window.ecc.pointFromScalar(dTweak, true);
    if (!PTweak) {
      throw new Error(getTranslation('wallet.tweaked_pubkey_error', 'Failed to compute tweaked public key'));
    }

    return {
      publicKey: Buffer.from(PTweak),
      privateKey: Buffer.from(dTweak),
      sign: (hash) => {
        const signature = window.ecc.sign(hash, dTweak);
        return Buffer.from(signature);
      },
      signSchnorr: (hash) => {
        const auxRand = crypto.getRandomValues(new Uint8Array(32));
        const signature = window.ecc.signSchnorr(hash, dTweak, auxRand);
        return Buffer.from(signature);
      }
    };
  }

  static async createTaprootAddress(publicKey, network) {
    if (!window.bitcoin || !window.bitcoin.payments) {
      throw new Error(getTranslation('wallet.bitcoin_library_unavailable', 'Bitcoin library unavailable'));
    }
    const internalPubkey = TaprootUtils.toXOnly(publicKey);
    const payment = window.bitcoin.payments.p2tr({ internalPubkey, network });
    return { address: payment.address, output: payment.output, internalPubkey };
  }

  static async prepareTaprootUtxo(utxo) {
    try {
      if (utxo && utxo.tapInternalKey && utxo.keyPair && utxo.scriptType === 'p2tr') {
        return utxo;
      }
      
      let kp = null;
      if (typeof window.getTaprootKeyPair === 'function') {
        kp = await window.getTaprootKeyPair();
      }
      if (!kp && window.hdManager && typeof window.hdManager.getTaprootKeyPair === 'function') {
        try { kp = await window.hdManager.getTaprootKeyPair(); } catch (_) {}
      }
      if (!kp || !kp.publicKey) {
        throw new Error(getTranslation('transactions.missing_keypair', 'Missing keypair for UTXO {{index}}', { index: 0 }));
      }
      
      const xonly = TaprootUtils.toXOnly(Buffer.from(kp.publicKey));
      const enriched = { 
        ...utxo, 
        keyPair: kp, 
        tapInternalKey: xonly,
        scriptType: (utxo.scriptType || 'p2tr') 
      };
      
      return enriched;
    } catch (e) {
      throw e;
    }
  }
}

// === EXPLORER UTILITIES ===
export async function getExplorerUrl(txid) {
  const primaryUrl = `${BLOCKCHAIN_CONFIG.EXPLORERS.primary}${BLOCKCHAIN_CONFIG.EXPLORERS.txPath}${txid}`;
  const fallbackUrl = `${BLOCKCHAIN_CONFIG.EXPLORERS.fallback}${BLOCKCHAIN_CONFIG.EXPLORERS.txPath}${txid}`;
  
  try {
    const res = await fetch(BLOCKCHAIN_CONFIG.EXPLORERS.primary, { method: 'HEAD', mode: 'cors' });
    if (res.ok) return primaryUrl;
    console.warn(`[BLOCKCHAIN] ${getTranslation('explorer.primary_unavailable', 'Primary explorer unavailable, using fallback explorer')}`);
    return fallbackUrl;
  } catch (e) {
    console.warn(`[BLOCKCHAIN] ${getTranslation('explorer.primary_unavailable', 'Primary explorer unavailable, using fallback explorer')}`);
    return fallbackUrl;
  }
}

export async function checkTransactionConfirmation(txid) {
  const primaryApi = `${BLOCKCHAIN_CONFIG.EXPLORERS.primary}/ext/gettx/${txid}`;
  const fallbackApi = `${BLOCKCHAIN_CONFIG.EXPLORERS.fallback}/ext/gettx/${txid}`;
  
  try {
    const res = await fetch(primaryApi);
    if (res.ok) {
      const data = await res.json();
      return data.confirmations >= 1;
    }
    const fallbackRes = await fetch(fallbackApi);
    if (fallbackRes.ok) {
      const fallbackData = await fallbackRes.json();
      return fallbackData.confirmations >= 1;
    }
    return false;
  } catch (e) {
    return false;
  }
}

// === UTXO MATURITY VERIFICATION ===
async function checkUtxoMaturity(txid, vout) {
  try {
    const utxoInfo = await rpcManager.call('gettxout', [txid, vout, true]);
    if (!utxoInfo) return null;
    
    const confirmations = utxoInfo.confirmations || 0;
    const isCoinbase = utxoInfo.coinbase || false;
    
    if (isCoinbase && confirmations < 100) return null;
    if (!isCoinbase && confirmations < 1) return null;
    
    return {
      spendable: true,
      confirmations,
      coinbase: isCoinbase
    };
  } catch (error) {
    console.error(`[BLOCKCHAIN] UTXO maturity check failed for ${txid}:${vout}:`, error);
    return null;
  }
}

export async function filterMatureUtxos(utxoList) {
  if (!Array.isArray(utxoList) || !utxoList.length) return [];
  
  const BATCH_SIZE = 5;
  const matureUtxos = [];
  
  for (let i = 0; i < utxoList.length; i += BATCH_SIZE) {
    const batch = utxoList.slice(i, i + BATCH_SIZE);
    
    const results = await Promise.allSettled(
      batch.map(async (utxo) => {
        const maturityInfo = await checkUtxoMaturity(utxo.txid, utxo.vout);
        return maturityInfo ? utxo : null;
      })
    );
    
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        matureUtxos.push(result.value);
      }
    });
    
    if (i + BATCH_SIZE < utxoList.length) {
      await sleep(50);
    }
  }
  
  return matureUtxos;
}

// === HD WALLET UTXO SCANNER ===
export class HDUTXOScanner {
  constructor(rpc) {
    this.rpc = rpc;
    this.cache = new Map();
  }

  async scanHDUTXOsWithDescriptors(hdWallet, addressFamily) {
    const descriptor = this.createDescriptor(hdWallet, addressFamily);
    const scan = await this.rpc.call('scantxoutset', [
      'start', 
      [{ desc: descriptor, range: HD_CONFIG.startRange }]
    ]);
    
    if (!scan || !scan.success || !scan.unspents) return [];
    
    return this.enrichUTXOs(scan.unspents, hdWallet, addressFamily);
  }

  createDescriptor(hdWallet, family) {
    if (!hdWallet || !hdWallet.derivePath) {
      throw new Error(getTranslation('wallet.hd_wallet_not_initialized', 'HD wallet not initialized'));
    }

    const derivationPath = BLOCKCHAIN_CONFIG.HD_PATHS[family];
    if (!derivationPath) {
      throw new Error(getTranslation('wallet.unknown_address_family', 'Unknown address family: {{family}}', { family }));
    }

    try {
      const account = hdWallet.derivePath(derivationPath);
      const xpub = account.neutered().toBase58();
      
      const prefixes = {
        'legacy': 'pkh',
        'p2sh': 'sh(wpkh',
        'bech32': 'wpkh',
        'taproot': 'tr'
      };
      
      const prefix = prefixes[family];
      if (!prefix) throw new Error(getTranslation('wallet.unknown_address_family', 'Unknown address family: {{family}}', { family }));
      
      if (family === 'p2sh') {
        return `${prefix}(${xpub}/0/*))`;
      }
      return `${prefix}(${xpub}/0/*)`;
    } catch (error) {
      console.error(`[BLOCKCHAIN] Descriptor creation failed for ${family}:`, error);
      throw error;
    }
  }

  enrichUTXOs(unspents, hdWallet, family) {
    return unspents.map(utxo => {
      const scriptType = AddressManager.detectScriptType(utxo.scriptPubKey);
      
      return {
        txid: utxo.txid,
        vout: utxo.vout,
        amount: utxo.amount,
        scriptPubKey: utxo.scriptPubKey,
        scriptType,
        family,
        desc: utxo.desc
      };
    });
  }

  async scanAllFamilies(hdWallet) {
    const families = ['bech32', 'p2sh', 'legacy'];
    const allUtxos = [];
    const seen = new Set();
    
    for (const family of families) {
      const familyUtxos = await this.scanHDUTXOsWithDescriptors(hdWallet, family);
      
      console.log(`[BLOCKCHAIN] Found ${familyUtxos.length} UTXOs for ${family}`);
      
      for (const utxo of familyUtxos) {
        const key = `${utxo.txid}:${utxo.vout}`;
        if (!seen.has(key)) {
          seen.add(key);
          allUtxos.push(utxo);
        }
      }
    }
    
    return allUtxos;
  }

  async scanSpecificFamily(hdWallet, family) {
    const familyUtxos = await this.scanHDUTXOsWithDescriptors(hdWallet, family);
    return familyUtxos;
  }
}

// === MAIN UTXO AND BALANCE FUNCTIONS ===
export async function utxos(address, isHD = false, hdWallet = null) {
  try {
    const cacheKey = `utxos:${address}:${isHD}`;
    
    const cachedData = SMART_UTXO_CACHE.get(cacheKey);
    if (cachedData) {
      console.log(`[UTXO-CACHE] ✅ ${getTranslation('loading.balance_updated', 'Balance updated!')} ${address.substring(0, 10)}...`);
      return cachedData;
    }

    console.log(`[UTXO-CACHE] ${getTranslation('loading.blockchain_scan', 'Scanning blockchain...')} ${address.substring(0, 10)}...`);

    let result;

    if (isHD && hdWallet) {
      const scanner = new HDUTXOScanner(rpcManager);
      const addressType = AddressManager.getAddressType(address);
      
      if (addressType === 'p2wpkh') {
        console.log('[UTXO] Bech32 selected: scanning cumulative UTXOs (bech32 + legacy + p2sh)');
        const allUtxos = await scanner.scanAllFamilies(hdWallet);
        const cumulativeUtxos = allUtxos.filter(utxo => 
          ['p2wpkh', 'p2pkh', 'p2sh'].includes(utxo.scriptType)
        );
        console.log(`[UTXO] Found ${cumulativeUtxos.length} cumulative UTXOs (p2wpkh: ${allUtxos.filter(u => u.scriptType === 'p2wpkh').length}, p2pkh: ${allUtxos.filter(u => u.scriptType === 'p2pkh').length}, p2sh: ${allUtxos.filter(u => u.scriptType === 'p2sh').length})`);
        result = await filterMatureUtxos(cumulativeUtxos);
      } else if (addressType === 'p2tr') {
        console.log('[UTXO] Taproot selected: scanning isolated UTXOs (p2tr only)');
        const taprootUtxos = await scanner.scanSpecificFamily(hdWallet, 'taproot');
        console.log(`[UTXO] Found ${taprootUtxos.length} Taproot UTXOs`);
        result = await filterMatureUtxos(taprootUtxos);
      } else {
        let familyMap = {
          'p2sh': 'p2sh',
          'p2pkh': 'legacy'
        };
        
        const family = familyMap[addressType];
        if (family) {
          const hdUtxos = await scanner.scanSpecificFamily(hdWallet, family);
          result = await filterMatureUtxos(hdUtxos);
        } else {
          console.warn(`[UTXO] ${getTranslation('wallet.unknown_address_family', 'Unknown address family: {{family}}', { family: addressType })}`);
          result = [];
        }
      }
    } else {
      const scan = await rpcManager.call('scantxoutset', ['start', [`addr(${address})`]]);
      if (!scan || !scan.success || !scan.unspents) {
        result = [];
      } else {
        const validUtxos = scan.unspents.map(utxo => {
          if (!VALIDATION_PATTERNS.scriptHex.test(utxo.scriptPubKey)) {
            throw new Error(`Invalid scriptPubKey for UTXO ${utxo.txid}:${utxo.vout}`);
          }
          
          const scriptType = AddressManager.detectScriptType(utxo.scriptPubKey);
          if (scriptType === 'unknown') {
            console.warn(`[BLOCKCHAIN] Unknown script type for UTXO ${utxo.txid}:${utxo.vout}`);
          }
          
          return {
            txid: utxo.txid,
            vout: utxo.vout,
            amount: utxo.amount,
            scriptPubKey: utxo.scriptPubKey,
            scriptType
          };
        });
        
        result = await filterMatureUtxos(validUtxos);
      }
    }

    SMART_UTXO_CACHE.set(cacheKey, result);

    eventBus.emit(EVENTS.UTXO_UPDATED, { address, count: result.length });
    
    return result;
    
  } catch (error) {
    console.error(`[UTXO] ${getTranslation('transactions.failed_to_fetch_utxos', 'Failed to fetch UTXOs')}`, error);
    throw new Error(getTranslation('transactions.failed_to_fetch_utxos', 'Failed to fetch UTXOs') + `: ${error.message}`);
  }
}

export async function balance(address, isHD = false, hdWallet = null) {
  try {
    const cacheKey = `balance:${address}:${isHD}`;
    
    const cachedBalance = SMART_BALANCE_CACHE.get(cacheKey);
    if (cachedBalance !== null) {
      console.log(`[BALANCE-CACHE] ✅ ${getTranslation('loading.balance_updated', 'Balance updated!')} ${address.substring(0, 10)}...`);
      return cachedBalance;
    }

    console.log(`[BALANCE-CACHE] ${getTranslation('loading.calculating', 'Calculating...')} ${address.substring(0, 10)}...`);

    let result;

    if (isHD && hdWallet) {
      const utxoList = await utxos(address, true, hdWallet);
      result = utxoList.reduce((sum, utxo) => sum + (utxo.amount || 0), 0);
    } else {
      const scan = await rpcManager.call('scantxoutset', ['start', [`addr(${address})`]]);
      result = (scan && scan.total_amount) || 0;
    }

    SMART_BALANCE_CACHE.set(cacheKey, result);

    eventBus.emit(EVENTS.WALLET_BALANCE_UPDATED, { address, balance: result });

    return result;
  } catch (error) {
    console.error(`[BALANCE] ${getTranslation('ui.refresh_error', 'Refresh error: {{error}}', { error: error.message })}`);
    throw new Error(getTranslation('ui.refresh_error', 'Refresh error: {{error}}', { error: error.message }));
  }
}

// === RAW TRANSACTION HANDLING ===
export async function fetchRawTxHex(txid) {
  if (!VALIDATION_PATTERNS.txid.test(txid)) {
    throw new Error(getTranslation('transactions.invalid_destination', 'Invalid destination address'));
  }

  const cached = SMART_RAWTX_CACHE.get(`hex:${txid}`);
  if (cached) return cached;
  
  try {
    const rawTx = await rpcManager.call('getrawtransaction', [txid, true]);
    const hex = rawTx && rawTx.hex;
    
    if (!hex) {
      throw new Error(`Raw transaction hex not found for ${txid}`);
    }
    
    SMART_RAWTX_CACHE.set(`hex:${txid}`, hex);
    return hex;
  } catch (error) {
    console.error(`[BLOCKCHAIN] Failed to fetch raw tx ${txid}:`, error);
    throw error;
  }
}

// === UTXO FILTERING ===
export async function filterOpReturnUtxos(utxos) {
  if (!Array.isArray(utxos)) return [];

  const filteredUtxos = utxos.filter(utxo => 
    utxo && 
    typeof utxo.amount === 'number' && 
    utxo.amount >= TRANSACTION_CONFIG.minConsolidationFee
  );
  
  return filteredUtxos;
}

// === CACHE MANAGEMENT ===
export function clearBlockchainCaches() {
  console.log(`[CACHE] ${getTranslation('loading.cache_clearing', 'Clearing caches...')}`);
  
  SMART_UTXO_CACHE.clear(false);
  SMART_BALANCE_CACHE.clear(false);
  SMART_TX_CACHE.clear(false);
  SMART_RAWTX_CACHE.clear(false);
  
  rpcManager.clearCache();
  
  console.log(`[CACHE] ${getTranslation('loading.balance_updated', 'Balance updated!')}`);
}

export async function refreshUTXOCache(address, isHD = false, hdWallet = null) {
  CacheManager.invalidateAddress(address, isHD);
  return await utxos(address, isHD, hdWallet);
}

// === RPC COMPATIBILITY ===
export const rpcClient = rpcManager;

export async function rpc(method, params = []) {
  return rpcManager.call(method, params);
}

// === EVENT LISTENERS ===
eventBus.on(EVENTS.WALLET_INFO_REQUEST, async () => {
  try {
    const walletInfo = await requestWalletInfo();
    eventBus.emit(EVENTS.WALLET_INFO_RESPONSE, walletInfo);
  } catch (error) {
    eventBus.emit(EVENTS.WALLET_INFO_RESPONSE, { address: '', isReady: false });
  }
});

// === GLOBAL COMPATIBILITY ===
if (typeof window !== 'undefined') {
  window.CacheManager = CacheManager;
  window.rpc = rpc;
  window.utxos = utxos;
  window.balance = balance;
  window.fetchRawTxHex = fetchRawTxHex;
  window.filterOpReturnUtxos = filterOpReturnUtxos;
  window.filterMatureUtxos = filterMatureUtxos;
  window.clearBlockchainCaches = clearBlockchainCaches;
  window.refreshUTXOCache = refreshUTXOCache;
  window.TaprootUtils = TaprootUtils;
  window.AddressManager = AddressManager;
  window.getExplorerUrl = getExplorerUrl;
  window.checkTransactionConfirmation = checkTransactionConfirmation;
  window.handleError500WithRetry = handleError500WithRetry;
  window.getTxDetailCached = getTxDetailCached;
  window.extractOpReturnData = extractOpReturnData;
  window.getTransactionSenderAddress = getTransactionSenderAddress;
  window.waitForConfirmation = waitForConfirmation;
  window.SMART_BALANCE_CACHE = SMART_BALANCE_CACHE;
}