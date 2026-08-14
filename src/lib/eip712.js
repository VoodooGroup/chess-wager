import { ethers } from 'ethers';
import { EIP712_DOMAIN } from '../config.js';

export const EIP712_TYPES = {
  GameState: [
    { name: 'gameId', type: 'uint256' },
    { name: 'sequence', type: 'uint256' },
    { name: 'boardHash', type: 'bytes32' },
    { name: 'currentPlayer', type: 'address' },
    { name: 'whiteTimeRemaining', type: 'uint256' },
    { name: 'blackTimeRemaining', type: 'uint256' },
    { name: 'lastActionTimestamp', type: 'uint256' },
    { name: 'previousStateHash', type: 'bytes32' }
  ],
  SignedMove: [
    { name: 'gameId', type: 'uint256' },
    { name: 'sequence', type: 'uint256' },
    { name: 'previousStateHash', type: 'bytes32' },
    { name: 'newBoardHash', type: 'bytes32' },
    { name: 'from', type: 'uint8' },
    { name: 'to', type: 'uint8' },
    { name: 'promotion', type: 'uint8' }
  ],
  GameResult: [
    { name: 'gameId', type: 'uint256' },
    { name: 'winner', type: 'address' },
    { name: 'resultType', type: 'uint8' },
    { name: 'finalBoardHash', type: 'bytes32' },
    { name: 'finalSequence', type: 'uint256' }
  ],
  Resignation: [
    { name: 'gameId', type: 'uint256' },
    { name: 'player', type: 'address' },
    { name: 'nonce', type: 'uint256' }
  ]
};

const GAME_STATE_TYPEHASH = ethers.keccak256(
  ethers.toUtf8Bytes(
    'GameState(uint256 gameId,uint256 sequence,bytes32 boardHash,address currentPlayer,uint256 whiteTimeRemaining,uint256 blackTimeRemaining,uint256 lastActionTimestamp,bytes32 previousStateHash)'
  )
);

export function structHashGameState(state) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(
    coder.encode(
      ['bytes32', 'uint256', 'uint256', 'bytes32', 'address', 'uint256', 'uint256', 'uint256', 'bytes32'],
      [
        GAME_STATE_TYPEHASH,
        state.gameId,
        state.sequence,
        state.boardHash,
        state.currentPlayer,
        state.whiteTimeRemaining,
        state.blackTimeRemaining,
        state.lastActionTimestamp,
        state.previousStateHash
      ]
    )
  );
}

export function normalizeState(state) {
  return {
    gameId: BigInt(state.gameId),
    sequence: BigInt(state.sequence),
    boardHash: state.boardHash,
    currentPlayer: ethers.getAddress(state.currentPlayer),
    whiteTimeRemaining: BigInt(state.whiteTimeRemaining),
    blackTimeRemaining: BigInt(state.blackTimeRemaining),
    lastActionTimestamp: BigInt(state.lastActionTimestamp),
    previousStateHash: state.previousStateHash
  };
}

export function serializeState(state) {
  return {
    gameId: state.gameId.toString(),
    sequence: state.sequence.toString(),
    boardHash: state.boardHash,
    currentPlayer: state.currentPlayer,
    whiteTimeRemaining: state.whiteTimeRemaining.toString(),
    blackTimeRemaining: state.blackTimeRemaining.toString(),
    lastActionTimestamp: state.lastActionTimestamp.toString(),
    previousStateHash: state.previousStateHash
  };
}

export async function signTyped(signer, primaryType, value) {
  const types = { [primaryType]: EIP712_TYPES[primaryType] };
  return signer.signTypedData(EIP712_DOMAIN, types, value);
}

export function verifyTyped(primaryType, value, signature) {
  const types = { [primaryType]: EIP712_TYPES[primaryType] };
  return ethers.verifyTypedData(EIP712_DOMAIN, types, value, signature);
}
