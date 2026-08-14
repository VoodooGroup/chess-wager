const WP = typeof window !== 'undefined' ? window.CHESS_WAGER_CFG : null;
const ENV_RELAY = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_RELAY_URL)
  ? String(import.meta.env.VITE_RELAY_URL)
  : '';

export const ASSET_BASE = (WP && WP.assets) ? String(WP.assets).replace(/\/?$/, '/') : './';
export const RELAY_URL = (WP && WP.relay)
  ? String(WP.relay).replace(/\/?$/, '')
  : ENV_RELAY.replace(/\/?$/, '');

export const CHAIN = {
  id: 369,
  hexId: '0x171',
  name: 'PulseChain',
  rpcUrls: ['https://rpc.pulsechain.com'],
  explorer: 'https://scan.pulsechain.com',
  nativeCurrency: { name: 'Pulse', symbol: 'PLS', decimals: 18 }
};

export const CHESS_WAGER = '0xD328573B46F6a8D3a5920aC85654e945639A645E';
export const CHESS_LIB = '0xfFDc6Fb47DA0A0C28db802Fa07568d5862314d18';

export const TOKENS = {
  MAGIC: {
    address: '0xD63b9d8D6E38cb7fBfDcEEde3cE92F97f5Aea7Ac',
    symbol: 'MAGIC',
    decimals: 18,
    icon: `${ASSET_BASE}magic-token.png`
  },
  POISON: {
    address: '0xB8c8761FeD2AaD5C0A75561bC604531a42c452E6',
    symbol: 'POISON',
    decimals: 9,
    icon: `${ASSET_BASE}poison-token.png`
  }
};

export const EIP712_DOMAIN = {
  name: 'ChessWagerPulse',
  version: '5',
  chainId: CHAIN.id,
  verifyingContract: CHESS_WAGER
};

export const GAME_STATUS = ['Waiting', 'Active', 'Disputed', 'Finished', 'Cancelled'];
export const RESULT_TYPE = ['None', 'Checkmate', 'Resignation', 'Timeout', 'Draw', 'AgreedDraw'];

export const TIME_PRESETS = [
  { label: '3 min', seconds: 180 },
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 }
];

export const PLATFORM_FEE_BPS = 500;
