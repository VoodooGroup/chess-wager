import { BrowserProvider, Contract, JsonRpcProvider } from 'ethers';
import { CHAIN, CHESS_WAGER, CHESS_LIB, TOKENS } from '../config.js';
import wagerAbi from '../abi/chessWager.json';
import libAbi from '../abi/chessLib.json';
import { ERC20_ABI } from '../abi/erc20.js';

export const readProvider = new JsonRpcProvider(CHAIN.rpcUrls[0], CHAIN.id);

const VOODOO_RDNS = 'app.voodoowallet';
export const VOODOO_INSTALL_URL = 'https://github.com/Voodoo-Token/voodoo-pulse-extension';

export function getInjected() {
  return window.ethereum || null;
}

export function isVoodooProvider(provider) {
  if (!provider) return false;
  if (provider.isVoodooWallet === true || provider._isVoodooWallet === true) return true;
  if (provider === window.voodooEthereum || provider === window.VoodooWalletProvider) return true;
  const rdns = String(provider.providerInfo?.rdns || '').toLowerCase();
  return rdns === VOODOO_RDNS;
}

function listInjectedProviders() {
  if (typeof window === 'undefined') return [];
  if (window.location.protocol === 'file:') return [];
  const found = [];
  const push = (p) => {
    if (p && !found.includes(p)) found.push(p);
  };
  push(window.voodooEthereum);
  push(window.VoodooWalletProvider);
  const { ethereum } = window;
  if (ethereum) {
    if (Array.isArray(ethereum.providers) && ethereum.providers.length) {
      ethereum.providers.forEach(push);
    }
    push(ethereum);
  }
  return found;
}

function findVoodooSync() {
  if (window.voodooEthereum && isVoodooProvider(window.voodooEthereum)) {
    return window.voodooEthereum;
  }
  if (window.VoodooWalletProvider && isVoodooProvider(window.VoodooWalletProvider)) {
    return window.VoodooWalletProvider;
  }
  return listInjectedProviders().find(isVoodooProvider) || null;
}

function discoverVoodooViaEip6963(timeoutMs = 900) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }
    let found = null;
    let settled = false;
    function finish(provider) {
      if (settled) return;
      settled = true;
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      resolve(provider || null);
    }
    function onAnnounce(event) {
      const detail = event.detail;
      const info = detail?.info;
      const provider = detail?.provider;
      if (!provider) return;
      const rdns = String(info?.rdns || '').toLowerCase();
      const name = String(info?.name || '');
      if (rdns === VOODOO_RDNS || /voodoo\s*wallet/i.test(name) || isVoodooProvider(provider)) {
        found = provider;
        finish(found);
      }
    }
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    try {
      window.dispatchEvent(new Event('eip6963:requestProvider'));
    } catch { /* ignore */ }
    setTimeout(() => finish(found), timeoutMs);
  });
}

let voodooPrefetch = null;

export async function getVoodooWalletProvider() {
  const sync = findVoodooSync();
  if (sync) return sync;
  return discoverVoodooViaEip6963(900);
}

export function prefetchVoodooProvider() {
  if (!voodooPrefetch) voodooPrefetch = getVoodooWalletProvider();
  return voodooPrefetch;
}

function voodooMissingError() {
  const err = new Error(
    'Voodoo Wallet was not detected. Install the extension, open it and sign in, then refresh this page and try again.'
  );
  err.code = 'VOODOO_NOT_FOUND';
  err.installUrl = VOODOO_INSTALL_URL;
  return err;
}

function requestVoodooAccounts(ethereum, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (ok, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      if (ok) resolve(val);
      else reject(val);
    };
    const hardTimer = setTimeout(() => {
      const err = new Error('Voodoo Wallet did not respond. Open the extension, unlock it, then click Voodoo Wallet again.');
      err.code = 'VOODOO_TIMEOUT';
      finish(false, err);
    }, timeoutMs);
    ethereum
      .request({ method: 'eth_requestAccounts' })
      .then((accs) => finish(true, accs || []))
      .catch((err) => finish(false, err));
  });
}

export async function connectVoodooWallet() {
  if (window.location.protocol === 'file:') {
    throw new Error('Open this site over https (or http://localhost). Browser extensions do not work on file:// pages.');
  }
  const eth = findVoodooSync() || await prefetchVoodooProvider() || await getVoodooWalletProvider();
  if (!eth) throw voodooMissingError();

  let accounts;
  try {
    accounts = await requestVoodooAccounts(eth);
  } catch (err) {
    const code = err?.code;
    const msg = String(err?.message || err || '');
    if (code === 4001 || /user rejected|rejected the request/i.test(msg)) {
      throw new Error('Connection was cancelled in your wallet.');
    }
    if (code === 4100 || /unlock voodoo wallet first|wallet locked/i.test(msg)) {
      throw new Error('Voodoo Wallet is locked. Open the extension, unlock it, then try connecting again.');
    }
    if (code === 'VOODOO_TIMEOUT' || /no response|timed out|timeout/i.test(msg)) {
      throw err instanceof Error ? err : new Error(msg);
    }
    throw err instanceof Error ? err : new Error(msg);
  }
  if (!accounts?.length) {
    throw new Error('No account was returned by the wallet. Open the extension, unlock it, and try again.');
  }

  await ensurePulseChain(eth);
  const provider = new BrowserProvider(eth, { name: CHAIN.name, chainId: CHAIN.id });
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, signer, address, ethereum: eth, walletKind: 'voodoo' };
}

export async function connectWallet() {
  const eth = getInjected();
  if (!eth) throw new Error('No wallet found. Install MetaMask or Rabby.');
  const provider = new BrowserProvider(eth, 'any');
  await provider.send('eth_requestAccounts', []);
  await ensurePulseChain(eth);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, signer, address, ethereum: eth, walletKind: 'injected' };
}

export async function ensurePulseChain(eth = getInjected()) {
  if (!eth) throw new Error('No wallet');
  const current = await eth.request({ method: 'eth_chainId' });
  if (current === CHAIN.hexId) return;
  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN.hexId }]
    });
  } catch (err) {
    if (err.code === 4902 || String(err.message || '').includes('Unrecognized')) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: CHAIN.hexId,
          chainName: CHAIN.name,
          nativeCurrency: CHAIN.nativeCurrency,
          rpcUrls: CHAIN.rpcUrls,
          blockExplorerUrls: [CHAIN.explorer]
        }]
      });
      return;
    }
    throw err;
  }
}

export function wagerRead() {
  return new Contract(CHESS_WAGER, wagerAbi, readProvider);
}

export function libRead() {
  return new Contract(CHESS_LIB, libAbi, readProvider);
}

export function wagerWrite(signer) {
  return new Contract(CHESS_WAGER, wagerAbi, signer);
}

export function tokenContract(address, runner = readProvider) {
  return new Contract(address, ERC20_ABI, runner);
}

export function tokenByAddress(addr) {
  const a = String(addr).toLowerCase();
  return Object.values(TOKENS).find((t) => t.address.toLowerCase() === a) || null;
}

export function shortAddr(a) {
  if (!a) return '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function explorerAddr(a) {
  return `${CHAIN.explorer}/address/${a}`;
}

export function explorerTx(h) {
  return `${CHAIN.explorer}/tx/${h}`;
}
