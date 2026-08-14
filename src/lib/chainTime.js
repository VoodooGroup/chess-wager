import { readProvider } from './wallet.js';

let offset = 0;
let lastSync = 0;

export function nowTs() {
  return Math.floor(Date.now() / 1000) + offset;
}

export async function syncChainTime() {
  if (Date.now() - lastSync < 15000) return nowTs();
  try {
    const block = await readProvider.getBlock('latest');
    if (block?.timestamp) {
      offset = Number(block.timestamp) - Math.floor(Date.now() / 1000);
      lastSync = Date.now();
    }
  } catch {
    /* keep last offset */
  }
  return nowTs();
}
