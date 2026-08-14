import { libRead } from './wallet.js';
import { hashPackedBoard } from './board.js';

export async function assertMoveMatchesLib(prevBoard, from, to, promotion, newBoard) {
  const lib = libRead();
  let after;
  try {
    after = await lib.applyMove(prevBoard, from, to, promotion);
  } catch {
    throw new Error('The on-chain chess rules reject that move.');
  }
  const onChain = String(await lib.hashBoard(after)).toLowerCase();
  const local = String(hashPackedBoard(newBoard)).toLowerCase();
  if (onChain !== local) {
    throw new Error('This move does not match the contract board. It was not sent.');
  }
}
