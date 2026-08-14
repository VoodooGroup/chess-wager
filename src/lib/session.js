import { ethers } from 'ethers';
import { signTyped } from './eip712.js';
import { wagerRead, wagerWrite } from './wallet.js';
import { nowTs } from './chainTime.js';

function key(gameId) {
  return `cw-session-${gameId}`;
}

export function loadSession(gameId) {
  try {
    const raw = localStorage.getItem(key(gameId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.privateKey) return null;
    return {
      wallet: new ethers.Wallet(data.privateKey),
      authorized: !!data.authorized,
      expiresAt: Number(data.expiresAt || 0)
    };
  } catch {
    return null;
  }
}

export function sessionReady(gameId) {
  const s = loadSession(gameId);
  return !!(s && s.authorized && s.expiresAt > nowTs() + 60);
}

export async function ensureSession(gameId, player, signer) {
  let s = loadSession(gameId);
  if (s && s.authorized && s.expiresAt > nowTs() + 60) return s.wallet;

  const wallet = s?.wallet || ethers.Wallet.createRandom();
  const nonce = await wagerRead().sessionNonceOf(gameId, player);
  const expiresAt = nowTs() + 7 * 24 * 3600;
  const auth = {
    gameId,
    player,
    sessionKey: wallet.address,
    expiresAt,
    nonce
  };
  const sig = await signTyped(signer, 'SessionAuthorization', auth);
  await (await wagerWrite(signer).authorizeSessionKey(auth, sig)).wait();
  localStorage.setItem(key(gameId), JSON.stringify({
    privateKey: wallet.privateKey,
    authorized: true,
    expiresAt
  }));
  return wallet;
}

export function sessionAddress(gameId) {
  return loadSession(gameId)?.wallet?.address || '';
}
