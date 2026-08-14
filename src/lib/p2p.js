import { Peer } from 'peerjs';

const TAB_ID = Math.random().toString(36).slice(2, 10);

export function roomIds(gameId) {
  const g = String(gameId);
  return { white: `cw369g${g}w`, black: `cw369g${g}b` };
}

export class GameChannel {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.handlers = new Set();
    this.ready = false;
    this.bc = null;
  }

  onMessage(fn) {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  _emit(msg) {
    if (!msg || msg._tab === TAB_ID) return;
    for (const fn of this.handlers) fn(msg);
  }

  async connect(gameId, isWhite) {
    this.close();
    this.bc = new BroadcastChannel(`chess-wager-${gameId}`);
    this.bc.onmessage = (e) => this._emit(e.data);

    const ids = roomIds(gameId);
    const myId = isWhite ? ids.white : ids.black;
    const theirId = isWhite ? ids.black : ids.white;

    try {
      this.peer = new Peer(myId, {
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 4000);
        this.peer.on('open', () => { clearTimeout(t); resolve(); });
        this.peer.on('error', () => { clearTimeout(t); resolve(); });
      });
      this.peer.on('connection', (c) => this._bind(c));
      const c = this.peer.connect(theirId, { reliable: true });
      this._bind(c);
    } catch {
      /* BroadcastChannel still works for two tabs */
    }
  }

  _bind(conn) {
    if (!conn) return;
    this.conn = conn;
    conn.on('open', () => {
      this.ready = true;
      this._emit({ type: 'peer-open', _tab: 'peer' });
    });
    conn.on('data', (data) => {
      try {
        this._emit(typeof data === 'string' ? JSON.parse(data) : data);
      } catch { /* ignore */ }
    });
    conn.on('close', () => { this.ready = false; });
  }

  send(msg) {
    const payload = { ...msg, _tab: TAB_ID };
    try { this.bc?.postMessage(payload); } catch { /* */ }
    if (this.conn && this.conn.open) {
      this.conn.send(payload);
      this.ready = true;
      return true;
    }
    return false;
  }

  close() {
    try { this.conn?.close(); } catch { /* */ }
    try { this.peer?.destroy(); } catch { /* */ }
    try { this.bc?.close(); } catch { /* */ }
    this.conn = null;
    this.peer = null;
    this.bc = null;
    this.ready = false;
  }
}
