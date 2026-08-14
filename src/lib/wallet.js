import { BrowserProvider, Contract, JsonRpcProvider } from 'ethers';
import { CHAIN, CHESS_WAGER, CHESS_LIB, TOKENS } from '../config.js';
import wagerAbi from '../abi/chessWager.json';
import libAbi from '../abi/chessLib.json';
import { ERC20_ABI } from '../abi/erc20.js';

export const readProvider = new JsonRpcProvider(CHAIN.rpcUrls[0], CHAIN.id);

export function getInjected() {
  return window.ethereum || null;
}

export async function connectWallet() {
  const eth = getInjected();
  if (!eth) throw new Error('No wallet found. Install MetaMask or Rabby.');
  const provider = new BrowserProvider(eth, 'any');
  await provider.send('eth_requestAccounts', []);
  await ensurePulseChain(eth);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, signer, address };
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
