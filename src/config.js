import { 
  BLOCKCHAIN_CONFIG, 
  getLegacyNetworkConfig,
  getValidationPatterns,
  getHDConfig,
  getTransactionConfig 
} from './blockchain-config.js';

// === VERSION INFORMATION ===
export const VERSION = {
  MAJOR: 3,
  MINOR: 0,
  PATCH: 0,
  BUILD: Date.now(),
  STRING: '3.0.0'
};

// === NETWORK CONFIGURATION ===
export const NITO_NETWORK = getLegacyNetworkConfig();

// === NODE CONFIGURATION ===
export const NODE_CONFIG = {
  DEBUG: false,
  TIMEOUT: 30000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000,
  ERROR_500_DELAY: 2000,
  NO_503_BACKOFF_METHODS: new Set(['getrawmempool', 'getrawtransaction', 'getmempoolinfo'])
};

// === HD WALLET CONFIGURATION ===
export const HD_CONFIG = getHDConfig();

// === TRANSACTION CONFIGURATION ===
export const TRANSACTION_CONFIG = getTransactionConfig();

// === UTXO VALUE CONSTANTS ===
export const UTXO_VALUES = BLOCKCHAIN_CONFIG.UTXO_VALUES;

// === SECURITY CONFIGURATION ===
export const SECURITY_CONFIG = {
  SESSION_TIMEOUT: 600000,
  INACTIVITY_TIMEOUT: 600000,
  CLEANUP_INTERVAL: 600000,
  MAX_MEMORY_KEYS: 10,
  BLUR_TIMEOUT: 600000,
  PBKDF2_ITERATIONS: 200000,
  AES_KEY_SIZE: 32,
  AES_IV_SIZE: 12,
  RATE_LIMIT_ATTEMPTS: 5,
  RATE_LIMIT_WINDOW: 600000,
  AUTO_RELOAD_ON_CLEAR: true,
  GENERATION_KEY_TIMEOUT: 600000
};

// === UI CONFIGURATION ===
export const UI_CONFIG = {
  LANGUAGES: ['fr', 'en', 'de', 'es', 'nl', 'ru', 'zh'],
  THEMES: ['light', 'dark'],
  DEFAULT_THEME: 'light',
  AUTO_REFRESH_DELAY: 3000,
  POPUP_DURATION: 5000,
  NOTIFICATION_TIMEOUT: 60000,
  PROGRESS_UPDATE_INTERVAL: 100,
  CONFIRMATION_CHECK_INTERVAL: 10000,
  TRANSLATION_RETRY_ATTEMPTS: 3,
  TRANSLATION_RETRY_DELAY: 1000
};

// === API CONFIGURATION ===
export const API_CONFIG = {
  COUNTER_GET_URL: BLOCKCHAIN_CONFIG.API.counterGet,
  COUNTER_INCREMENT_URL: BLOCKCHAIN_CONFIG.API.counterIncrement,
  EXPLORER_PRIMARY: BLOCKCHAIN_CONFIG.EXPLORERS.primary,
  EXPLORER_FALLBACK: BLOCKCHAIN_CONFIG.EXPLORERS.fallback,
  REQUEST_TIMEOUT: 10000,
  MAX_RETRIES: 3
};

// === DOM ELEMENT IDS ===
export const ELEMENT_IDS = {
  LOADING_SPINNER: 'loadingSpinner',
  THEME_TOGGLE: 'themeToggle',
  LANGUAGE_SELECT: 'languageSelect',
  
  GENERATE_BUTTON: 'generateButton',
  HD_MASTER_KEY: 'hdMasterKey',
  MNEMONIC_PHRASE: 'mnemonicPhrase',
  REVEAL_HD_KEY: 'revealHdKey',
  REVEAL_MNEMONIC: 'revealMnemonic',
  COPY_HD_KEY: 'copyHdKey',
  COPY_MNEMONIC: 'copyMnemonic',
  GENERATED_ADDRESS: 'generatedAddress',
  INACTIVITY_TIMER: 'inactivityTimer',
  KEY_COUNTER: 'keyCounter',
  
  IMPORT_WALLET_BUTTON: 'importWalletButton',
  CONNECT_EMAIL_BUTTON: 'connectEmailButton',
  EMAIL_SEED_BUTTON: 'emailSeedButton',
  PRIVATE_KEY_WIF: 'privateKeyWIF',
  EMAIL_INPUT: 'emailInput',
  PASSWORD_INPUT: 'passwordInput',
  EMAIL_INPUTS: 'emailInputs',
  EMAIL_FORM: 'emailForm',
  KEY_FORM: 'keyForm',
  TAB_EMAIL: 'tabEmail',
  TAB_KEY: 'tabKey',
  
  WALLET_ADDRESS: 'walletAddress',
  REFRESH_BALANCE_BUTTON: 'refreshBalanceButton',
  BECH32_ADDRESS: 'bech32Address',
  TAPROOT_ADDRESS: 'taprootAddress',
  
  DESTINATION_ADDRESS: 'destinationAddress',
  AMOUNT_NITO: 'amountNito',
  FEE_NITO: 'feeNito',
  MAX_BUTTON: 'maxButton',
  DEBIT_ADDRESS_TYPE: 'debitAddressType',
  SEND_TAB_BALANCE: 'sendTabBalance',
  REFRESH_SEND_TAB_BALANCE: 'refreshSendTabBalance',
  PREPARE_TX_BUTTON: 'prepareTxButton',
  BROADCAST_TX_BUTTON: 'broadcastTxButton',
  CANCEL_TX_BUTTON: 'cancelTxButton',
  SIGNED_TX: 'signedTx',
  TX_HEX_CONTAINER: 'txHexContainer',
  COPY_TX_HEX: 'copyTxHex',
  CONSOLIDATE_BUTTON: 'consolidateButton'
};

// === VALIDATION PATTERNS ===
export const VALIDATION_PATTERNS = getValidationPatterns();

// === ERROR CODES ===
export const ERROR_CODES = {
  WALLET_NOT_INITIALIZED: 'WALLET_NOT_INITIALIZED',
  INVALID_PRIVATE_KEY: 'INVALID_PRIVATE_KEY',
  INVALID_MNEMONIC: 'INVALID_MNEMONIC',
  INVALID_XPRV: 'INVALID_XPRV',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  DUST_AMOUNT: 'DUST_AMOUNT',
  NO_UTXOS: 'NO_UTXOS',
  UTXO_OPRETURN_CONSOLIDATE: 'UTXO_OPRETURN_CONSOLIDATE',
  RPC_ERROR: 'RPC_ERROR',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  NODE_CONNECTION: 'NODE_CONNECTION',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  ENCRYPTION_ERROR: 'ENCRYPTION_ERROR',
  IMPORT_FIRST: 'IMPORT_FIRST',
  ELEMENT_NOT_FOUND: 'ELEMENT_NOT_FOUND',
  REVEAL_TO_COPY: 'REVEAL_TO_COPY',
  NOTHING_TO_COPY: 'NOTHING_TO_COPY',
  COPY_ERROR: 'COPY_ERROR',
  INVALID_FIELDS: 'INVALID_FIELDS',
  FILL_ALL_FIELDS: 'FILL_ALL_FIELDS',
  INVALID_BECH32: 'INVALID_BECH32',
  TAPROOT_NOT_SUPPORTED: 'TAPROOT_NOT_SUPPORTED',
  OPERATION_IN_PROGRESS: 'OPERATION_IN_PROGRESS'
};

// === FEATURE FLAGS ===
export const FEATURE_FLAGS = {
  HD_WALLET_ENABLED: BLOCKCHAIN_CONFIG.FEATURES.hdWallet,
  TAPROOT_ENABLED: BLOCKCHAIN_CONFIG.FEATURES.taproot,
  CONSOLIDATION_ENABLED: BLOCKCHAIN_CONFIG.FEATURES.consolidation,
  DEBUG_MODE: false,
  VERBOSE_LOGGING: true,
  REQUIRE_SIGNATURE_VERIFICATION: true,
  AUTO_CLEANUP_ENABLED: true,
  LOG_ADDRESSES: true,
  AUTO_RELOAD_ON_KEY_CLEAR: true
};

// === OPERATIONAL STATE TRACKING ===
export const OPERATION_STATE = {
  activeOperations: new Set(),
  isTransactionInProgress: false,
  isConsolidationInProgress: false,
  isBalanceRefreshInProgress: false
};

// === UNIFIED CONFIGURATION EXPORT ===
export const CONFIG = {
  VERSION,
  NETWORK: NITO_NETWORK,
  BLOCKCHAIN: BLOCKCHAIN_CONFIG,
  NODE: NODE_CONFIG,
  HD: HD_CONFIG,
  TRANSACTION: TRANSACTION_CONFIG,
  SECURITY: SECURITY_CONFIG,
  UI: UI_CONFIG,
  API: API_CONFIG,
  ELEMENT_IDS,
  VALIDATION: VALIDATION_PATTERNS,
  ERRORS: ERROR_CODES,
  FEATURES: FEATURE_FLAGS,
  OPERATIONS: OPERATION_STATE,
  UTXO_VALUES
};

// === UTILITY FUNCTIONS ===
export function sleep(ms) { 
  return new Promise(resolve => setTimeout(resolve, ms)); 
}

export async function sleepJitter(baseMs = 1, maxJitterMs = 300, active = false) {
  const extra = active ? Math.floor(Math.random() * (maxJitterMs + 1)) : 0;
  await sleep(baseMs + extra);
}

export function getTranslation(key, fallback, params = {}) {
  const t = (window.i18next && typeof window.i18next.t === 'function') 
    ? window.i18next.t 
    : () => fallback || key;
  return t(key, { ...params, defaultValue: fallback });
}

// === GLOBAL COMPATIBILITY ===
if (typeof window !== 'undefined') {
  if (!window.NITO_NETWORK) {
    window.NITO_NETWORK = NITO_NETWORK;
  }
  if (!window.DYNAMIC_FEE_RATE) {
    window.DYNAMIC_FEE_RATE = TRANSACTION_CONFIG.DYNAMIC_FEE_RATE;
  }
  window.BLOCKCHAIN_CONFIG = BLOCKCHAIN_CONFIG;
  window.getTranslation = getTranslation;
  window.sleep = sleep;
  window.sleepJitter = sleepJitter;
}

console.log(`${BLOCKCHAIN_CONFIG.NAME} Wallet Config loaded - Version ${VERSION.STRING}`);