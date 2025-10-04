// === BLOCKCHAIN CONFIGURATION ===
// Centralized configuration for blockchain adaptation

export const BLOCKCHAIN_CONFIG = {
  // === BLOCKCHAIN IDENTITY ===
  NAME: 'BC2',
  NAME_LOWER: 'bc2',
  NAME_FULL: 'BC2 Network',
  
  // === VISUAL ASSETS ===
  LOGO_PATH: './bc2.png',
  FAVICON_PATH: './bc2.png',
  
  // === NETWORK PARAMETERS ===
  NETWORK: {
    messagePrefix: '\x18BC2 Signed Message:\b',
    bech32: 'bc',
    bip32: {
      public: 0x0488B21E,
      private: 0x0488ADE4
    },
    pubKeyHash: 0x00,
    scriptHash: 0x05,
    wif: 0x80
  },
  
  // === RPC NODES (with automatic failover) ===
  RPC_NODES: [
    {
      url: '/api/',
      priority: 1,
      timeout: 2000
    },
    {
      url: '/api-custom/',
      priority: 2,
      timeout: 2000
    }
  ],
  
  // === BLOCKCHAIN EXPLORERS ===
  EXPLORERS: {
    primary: 'https://bitcoinii.ddns.net/explorer',
    fallback: 'https://bitcoinii.space/fr',
    txPath: '/tx/',
    addressPath: '/address/'
  },
  
  // === TRANSACTION PARAMETERS ===
  TRANSACTION: {
    minFeeRate: 0.00001,
    dynamicFeeRate: 0.00001,
    maxUtxosPerBatch: 100,
    maxTxVbytes: 99000,
    dustAmounts: {
      p2pkh: 546,
      p2wpkh: 294,
      p2sh: 540,
      p2tr: 330
    },
    minConsolidationFee: 0.00005,
    dustRelayAmount: 3000
  },
  
  // === STANDARD UTXO VALUES ===
  UTXO_VALUES: {
    minTransaction: 777,
    dustRelay: 3000,
    minConsolidation: 546
  },
  
  // === HD DERIVATION PATHS ===
  HD_PATHS: {
    legacy: "m/44'/0'/0'",
    p2sh: "m/49'/0'/0'",
    bech32: "m/84'/0'/0'",
    taproot: "m/86'/0'/0'"
  },
  
  // === HD WALLET CONFIGURATION ===
  HD_CONFIG: {
    startRange: 512,
    maxRange: 50000,
    rangeSafety: 16,
    scanChunk: 50,
    scanMaxChunks: 40,
    defaultWordCount: 12
  },
  
  // === VALIDATION PATTERNS ===
  VALIDATION: {
    bech32Address: /^bc1[02-9ac-hj-np-z]{6,87}$/,
    bech32mAddress: /^bc1p[02-9ac-hj-np-z]{6,87}$/,
    legacyAddress: /^[13][1-9A-HJ-NP-Za-km-z]{25,39}$/,
    wif: /^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/,
    hexPrivateKey: /^[0-9a-fA-F]{64}$/,
    xprv: /^xprv[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/,
    scriptHex: /^[0-9a-fA-F]*$/,
    txid: /^[0-9a-fA-F]{64}$/,
    amount: /^\d+(\.\d{1,8})?$/,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  
  // === API ENDPOINTS ===
  API: {
    counterGet: '/api/get-counter.php',
    counterIncrement: '/api/get-counter.php'
  },
  
  // === UNITS AND DISPLAY ===
  UNITS: {
    symbol: 'BC2',
    decimals: 8,
    satoshiName: 'satoshi'
  },
  
  // === FOOTER CONFIGURATION ===
  FOOTER: {
    githubUrl: 'https://github.com/biigbang0001/wallet-bc2',
    officialSiteUrl: 'https://bitcoin-ii.org/',
    officialSiteText: 'bitcoin-ii.org 🚀',
    version: 'V3.0.0'
  },
  
  // === ENABLED FEATURES ===
  FEATURES: {
    hdWallet: true,
    taproot: true,
    consolidation: true,
    emailLogin: true,
    multiLanguage: true
  }
};

// === LEGACY COMPATIBILITY EXPORTS ===
export function getLegacyNetworkConfig() {
  return BLOCKCHAIN_CONFIG.NETWORK;
}

export function getValidationPatterns() {
  return BLOCKCHAIN_CONFIG.VALIDATION;
}

export function getHDConfig() {
  return {
    DERIVATION_PATHS: BLOCKCHAIN_CONFIG.HD_PATHS,
    START_RANGE: BLOCKCHAIN_CONFIG.HD_CONFIG.startRange,
    MAX_RANGE: BLOCKCHAIN_CONFIG.HD_CONFIG.maxRange,
    RANGE_SAFETY: BLOCKCHAIN_CONFIG.HD_CONFIG.rangeSafety,
    SCAN_CHUNK: BLOCKCHAIN_CONFIG.HD_CONFIG.scanChunk,
    SCAN_MAX_CHUNKS: BLOCKCHAIN_CONFIG.HD_CONFIG.scanMaxChunks,
    DEFAULT_WORD_COUNT: BLOCKCHAIN_CONFIG.HD_CONFIG.defaultWordCount
  };
}

export function getTransactionConfig() {
  return {
    MIN_FEE_RATE: BLOCKCHAIN_CONFIG.TRANSACTION.minFeeRate,
    DYNAMIC_FEE_RATE: BLOCKCHAIN_CONFIG.TRANSACTION.dynamicFeeRate,
    MAX_UTXOS_PER_BATCH: BLOCKCHAIN_CONFIG.TRANSACTION.maxUtxosPerBatch,
    MAX_TX_VBYTES: BLOCKCHAIN_CONFIG.TRANSACTION.maxTxVbytes,
    DUST_AMOUNT: BLOCKCHAIN_CONFIG.TRANSACTION.dustAmounts,
    MIN_CONSOLIDATION_FEE: BLOCKCHAIN_CONFIG.TRANSACTION.minConsolidationFee,
    DUST_RELAY_AMOUNT: BLOCKCHAIN_CONFIG.TRANSACTION.dustRelayAmount
  };
}

// === TEMPLATE HELPERS ===
export function replacePlaceholders(text) {
  if (!text) return text;
  return text
    .replace(/\{BLOCKCHAIN_NAME\}/g, BLOCKCHAIN_CONFIG.NAME)
    .replace(/\{blockchain_name\}/g, BLOCKCHAIN_CONFIG.NAME_LOWER)
    .replace(/\{BLOCKCHAIN_FULL\}/g, BLOCKCHAIN_CONFIG.NAME_FULL)
    .replace(/\{SYMBOL\}/g, BLOCKCHAIN_CONFIG.UNITS.symbol);
}

export function getBlockchainName() {
  return BLOCKCHAIN_CONFIG.NAME;
}

export function getBlockchainSymbol() {
  return BLOCKCHAIN_CONFIG.UNITS.symbol;
}

// === GLOBAL EXPORTS ===
if (typeof window !== 'undefined') {
  window.BLOCKCHAIN_CONFIG = BLOCKCHAIN_CONFIG;
  window.getBlockchainName = getBlockchainName;
  window.getBlockchainSymbol = getBlockchainSymbol;
  window.replacePlaceholders = replacePlaceholders;
}

console.log(`Blockchain Config loaded: ${BLOCKCHAIN_CONFIG.NAME_FULL} v${BLOCKCHAIN_CONFIG.UNITS.symbol}`);