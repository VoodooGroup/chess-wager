import { ASSET_BASE } from '../config.js';

const KIND = {
  1: 'w-p', 2: 'w-n', 3: 'w-b', 4: 'w-r', 5: 'w-q', 6: 'w-k',
  9: 'b-p', 10: 'b-n', 11: 'b-b', 12: 'b-r', 13: 'b-q', 14: 'b-k'
};

export const SQUARE_LIGHT = '#c9a27a';
export const SQUARE_DARK = '#7a4a32';

export function pieceSrc(code) {
  const key = KIND[code];
  return key ? `${ASSET_BASE}pieces/${key}.png` : '';
}

export function pieceImg(code) {
  const src = pieceSrc(code);
  if (!src) return '';
  return `<img class="piece" src="${src}" alt="" draggable="false" />`;
}
