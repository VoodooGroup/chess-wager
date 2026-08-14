import { Chess } from 'chess.js';
import { ethers } from 'ethers';

export const PIECE = {
  EMPTY: 0,
  W_PAWN: 1,
  W_KNIGHT: 2,
  W_BISHOP: 3,
  W_ROOK: 4,
  W_QUEEN: 5,
  W_KING: 6,
  B_PAWN: 9,
  B_KNIGHT: 10,
  B_BISHOP: 11,
  B_ROOK: 12,
  B_QUEEN: 13,
  B_KING: 14,
  NO_EP: 64
};

const FEN_TO_CODE = {
  P: 1, N: 2, B: 3, R: 4, Q: 5, K: 6,
  p: 9, n: 10, b: 11, r: 12, q: 13, k: 14
};

const CODE_TO_FEN = {
  1: 'P', 2: 'N', 3: 'B', 4: 'R', 5: 'Q', 6: 'K',
  9: 'p', 10: 'n', 11: 'b', 12: 'r', 13: 'q', 14: 'k'
};

export function algebraicToIndex(sq) {
  const file = sq.charCodeAt(0) - 97;
  const rank = Number(sq[1]) - 1;
  return rank * 8 + file;
}

export function indexToAlgebraic(i) {
  return String.fromCharCode(97 + (i % 8)) + String(Math.floor(i / 8) + 1);
}

export function promoToCode(color, promo) {
  if (!promo) return 0;
  const p = String(promo).toLowerCase();
  if (color === 'w') {
    if (p === 'q') return PIECE.W_QUEEN;
    if (p === 'r') return PIECE.W_ROOK;
    if (p === 'b') return PIECE.W_BISHOP;
    if (p === 'n') return PIECE.W_KNIGHT;
  } else {
    if (p === 'q') return PIECE.B_QUEEN;
    if (p === 'r') return PIECE.B_ROOK;
    if (p === 'b') return PIECE.B_BISHOP;
    if (p === 'n') return PIECE.B_KNIGHT;
  }
  return 0;
}

export function packedFromChess(chess) {
  const squares = new Array(64).fill(0);
  for (let i = 0; i < 64; i++) {
    const sq = indexToAlgebraic(i);
    const piece = chess.get(sq);
    if (piece) {
      const letter = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
      squares[i] = FEN_TO_CODE[letter] || 0;
    }
  }
  const fen = chess.fen().split(' ');
  const turn = fen[1];
  const castle = fen[2];
  const ep = fen[3];
  let rights = 0;
  if (castle.includes('K')) rights |= 1;
  if (castle.includes('Q')) rights |= 2;
  if (castle.includes('k')) rights |= 4;
  if (castle.includes('q')) rights |= 8;
  return {
    squares,
    whiteToMove: turn === 'w',
    castlingRights: rights,
    enPassantSquare: ep === '-' ? PIECE.NO_EP : algebraicToIndex(ep),
    halfmoveClock: Number(fen[4] || 0)
  };
}

export function hashPackedBoard(board) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(
    coder.encode(
      ['uint8[64]', 'bool', 'uint8', 'uint8', 'uint16'],
      [
        board.squares,
        board.whiteToMove,
        board.castlingRights,
        board.enPassantSquare,
        board.halfmoveClock
      ]
    )
  );
}

export function startingChess() {
  return new Chess();
}

export function chessFromFen(fen) {
  return new Chess(fen);
}

export function cloneChess(chess) {
  return new Chess(chess.fen());
}

export function resultFromChess(chess, whiteAddr, blackAddr) {
  if (chess.isCheckmate()) {
    return {
      winner: chess.turn() === 'w' ? blackAddr : whiteAddr,
      resultType: 1
    };
  }
  if (chess.isStalemate() || chess.isDraw() || chess.isInsufficientMaterial() || chess.isThreefoldRepetition()) {
    return { winner: ethers.ZeroAddress, resultType: 4 };
  }
  return { winner: ethers.ZeroAddress, resultType: 0 };
}

export { CODE_TO_FEN, FEN_TO_CODE };
