import { formatUnits, parseUnits } from 'ethers';

export function fmtAmount(raw, decimals, maxFrac = 4) {
  const n = Number(formatUnits(raw, decimals));
  if (!Number.isFinite(n)) return '0';
  if (n === 0) return '0';
  if (n >= 1000) return n.toLocaleString('nl-NL', { maximumFractionDigits: 0 });
  return n.toLocaleString('nl-NL', { maximumFractionDigits: maxFrac });
}

export function parseAmount(input, decimals) {
  const clean = String(input).trim().replace(',', '.');
  if (!clean) throw new Error('Enter an amount');
  return parseUnits(clean, decimals);
}

export function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds)));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function fmtJoinClock(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(Number(ts) * 1000).toLocaleString();
}
