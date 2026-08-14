import { RELAY_URL } from '../config.js';

let lastId = 0;

export function relayOn() {
  return !!RELAY_URL;
}

export function relayReset() {
  lastId = 0;
}

function path(p) {
  return `${RELAY_URL}${p}`;
}

export async function relayPost(gameId, msg) {
  if (!RELAY_URL || !gameId) return;
  const res = await fetch(path(`/games/${encodeURIComponent(gameId)}/events`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: msg.type || 'event', payload: msg })
  });
  if (!res.ok) throw new Error('Could not save move to the site.');
}

export async function relayPull(gameId) {
  if (!RELAY_URL || !gameId) return [];
  const res = await fetch(path(`/games/${encodeURIComponent(gameId)}/events?after=${lastId}`));
  if (!res.ok) return [];
  const data = await res.json();
  const items = Array.isArray(data.events) ? data.events : [];
  if (items.length) lastId = Number(items[items.length - 1].id) || lastId;
  return items;
}

export async function relayRegister(info) {
  if (!RELAY_URL || !info?.id) return;
  await fetch(path('/games'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId: info.id,
      white: info.playerWhite || info.white || '',
      black: info.playerBlack || info.black || '',
      token: info.wagerToken || info.token || '',
      amount: String(info.wagerAmount ?? info.amount ?? ''),
      status: info.status ?? 0
    })
  }).catch(() => {});
}

export async function relayPresence(gameId, address) {
  if (!RELAY_URL || !gameId || !address) return;
  await fetch(path(`/games/${encodeURIComponent(gameId)}/presence`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address })
  }).catch(() => {});
}

export async function relayGetPresence(gameId) {
  if (!RELAY_URL || !gameId) return [];
  const res = await fetch(path(`/games/${encodeURIComponent(gameId)}/presence`));
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.players) ? data.players : [];
}
