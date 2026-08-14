import { ethers } from 'ethers';
import { CHESS_WAGER, TOKENS, TIME_PRESETS, inviteUrl } from './config.js';
import {
  connectWallet, wagerRead, wagerWrite, tokenContract, tokenByAddress,
  shortAddr, ensurePulseChain, getInjected
} from './lib/wallet.js';
import {
  startingChess, chessFromFen, packedFromChess, hashPackedBoard,
  promoToCode, resultFromChess, FEN_TO_CODE, algebraicToIndex
} from './lib/board.js';
import { signTyped, verifyTyped, normalizeState, serializeState, structHashGameState } from './lib/eip712.js';
import { GameChannel } from './lib/p2p.js';
import { relayOn, relayReset, relayPost, relayPull, relayRegister, relayPresence, relayGetPresence } from './lib/relay.js';
import { fmtAmount, parseAmount, fmtClock } from './lib/format.js';
import { pieceImg } from './lib/pieces.js';

const ZERO = ethers.ZeroAddress;
const channel = new GameChannel();

const state = {
  account: null,
  signer: null,
  balances: { MAGIC: 0n, POISON: 0n },
  tokenKey: 'MAGIC',
  amount: '100',
  timeSec: 300,
  lobby: [],
  game: null,
  preview: startingChess(),
  selected: null,
  legal: [],
  lastMove: null,
  promo: null,
  showInfo: false,
  showLicense: false,
  err: '',
  busy: false,
  peerOn: false,
  presence: []
};

let clockTimer = null;
let relayTimer = null;
let hushRender = false;

function publish(msg) {
  channel.send(msg);
  if (state.game?.id) relayPost(state.game.id, msg).catch((e) => console.warn(e));
}

function paint() {
  if (!hushRender) render();
}

function startRelay(gameId) {
  stopRelay();
  if (!relayOn() || !gameId) return;
  relayReset();
  const tick = async () => {
    if (!state.game || String(state.game.id) !== String(gameId)) return;
    try {
      const evs = await relayPull(gameId);
      if (evs.length) {
        hushRender = true;
        for (const ev of evs) onPeer(ev.payload || ev);
        hushRender = false;
        if (state.signer && state.account && state.game.states.last) {
          const seq = Number(state.game.states.sequence || 0);
          if (!seqSigs(seq)[state.account.toLowerCase()]) {
            ensureOurStateSig(seq, state.game.states.last).catch(() => {});
          }
        }
        render();
      }
      if (state.account) await relayPresence(gameId, state.account);
      state.presence = await relayGetPresence(gameId);
      const el = document.getElementById('presence-line');
      if (el) el.outerHTML = presenceHtml();
    } catch (e) {
      console.warn(e);
    }
  };
  tick();
  relayTimer = setInterval(tick, 2000);
}

function stopRelay() {
  if (relayTimer) clearInterval(relayTimer);
  relayTimer = null;
}

function $(sel) { return document.querySelector(sel); }

export function mount(root) {
  root.innerHTML = `
    <div class="app">
      <header class="top">
        <div class="brand">
          <div class="logo-mark">♔</div>
          <div>
            <h1>Chess Wager</h1>
            <p>Play chess. Winner takes the pot.</p>
          </div>
        </div>
        <div class="wallet" id="wallet-box"></div>
      </header>
      <div id="main"></div>
      <button class="license-tab" data-act="license" type="button">License</button>
      <div id="modal"></div>
      <div id="toast" class="toast hidden"></div>
    </div>
  `;
  bind(root);
  refreshLobby();
  setInterval(refreshLobby, 20000);
  const q = new URLSearchParams(location.search).get('game');
  if (q) openGame(q).catch(setErr);
  const eth = getInjected();
  eth?.on?.('accountsChanged', () => location.reload());
  eth?.on?.('chainChanged', () => location.reload());
  channel.onMessage(onPeer);
  startClocks();
  window.addEventListener('online', () => {
    if (state.game?.id && state.account) {
      flushProofs();
      startRelay(state.game.id);
    }
  });
  render();
}

function bind(root) {
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    try {
      state.err = '';
      if (act === 'connect') await doConnect();
      else if (act === 'info') { state.showInfo = !state.showInfo; render(); }
      else if (act === 'close-info') { state.showInfo = false; render(); }
      else if (act === 'license') { state.showLicense = !state.showLicense; render(); }
      else if (act === 'close-license') { state.showLicense = false; render(); }
      else if (act === 'token') { state.tokenKey = btn.dataset.token; render(); }
      else if (act === 'time') { state.timeSec = Number(btn.dataset.sec); render(); }
      else if (act === 'create') await createGame();
      else if (act === 'refresh') await refreshLobby();
      else if (act === 'accept') await acceptGame(btn.dataset.id);
      else if (act === 'cancel') await cancelGame(btn.dataset.id);
      else if (act === 'open') await openGame(btn.dataset.id);
      else if (act === 'leave') leaveGame();
      else if (act === 'copy') {
        await navigator.clipboard.writeText(btn.dataset.text);
        toast('Link copied. Send it to your opponent.');
      }
      else if (act === 'resign') await resign();
      else if (act === 'draw') await offerDraw();
      else if (act === 'collect') await submitSettle();
      else if (act === 'sign-result') await signCurrentResult();
      else if (act === 'claim-win') await claimWinOnChain();
      else if (act === 'claim-timeout') await claimTimeoutOnChain();
      else if (act === 'finalize') await finalizeOnChain();
      else if (act === 'challenge-move') await challengeMoveOnChain();
      else if (act === 'challenge-state') await challengeStateOnChain();
      else if (act === 'promo') await finishMove(state.promo.from, state.promo.to, btn.dataset.p);
    } catch (err) {
      setErr(err);
    }
  });
  root.addEventListener('input', (e) => {
    if (e.target.id === 'amount') state.amount = e.target.value;
  });
}

async function doConnect() {
  const { signer, address } = await connectWallet();
  state.signer = signer;
  state.account = address;
  await loadBalances();
  render();
  await refreshLobby();
}

async function loadBalances() {
  if (!state.account) return;
  for (const key of Object.keys(TOKENS)) {
    try {
      state.balances[key] = await tokenContract(TOKENS[key].address).balanceOf(state.account);
    } catch {
      state.balances[key] = 0n;
    }
  }
}

async function refreshLobby() {
  try {
    const c = wagerRead();
    const next = Number(await c.nextGameId());
    const start = Math.max(1, next - 30);
    const items = [];
    for (let id = next - 1; id >= start; id--) {
      const g = await c.getGame(id);
      items.push({ id, ...plainGame(g) });
    }
    state.lobby = items;
    if (state.game) {
      const live = items.find((x) => String(x.id) === String(state.game.id));
      if (live) {
        state.game.onchain = live;
        if (live.status === 1 && !state.game.linked && state.account) {
          await bootPlay(live);
        }
      }
    }
    render();
  } catch (e) {
    console.warn(e);
  }
}

function plainGame(g) {
  return {
    playerWhite: g.playerWhite,
    playerBlack: g.playerBlack,
    wagerToken: g.wagerToken,
    wagerAmount: g.wagerAmount,
    createdAt: Number(g.createdAt),
    startedAt: Number(g.startedAt),
    challengeExpiresAt: Number(g.challengeExpiresAt),
    timeControlSeconds: Number(g.timeControlSeconds),
    status: Number(g.status),
    winner: g.winner,
    resultType: Number(g.resultType),
    disputeDeadline: Number(g.disputeDeadline || 0),
    highestSequence: Number(g.highestSequence || 0)
  };
}

async function createGame() {
  if (!state.signer) await doConnect();
  if (!state.signer) throw new Error('Connect your wallet first.');
  await ensurePulseChain();
  const tok = TOKENS[state.tokenKey];
  const amount = parseAmount(state.amount, tok.decimals);
  if (amount <= 0n) throw new Error('Enter an amount greater than 0.');
  state.busy = true; render();
  const erc = tokenContract(tok.address, state.signer);
  const allow = await erc.allowance(state.account, CHESS_WAGER);
  if (allow < amount) {
    toast('Your wallet will ask: allow this game to use your tokens.');
    await (await erc.approve(CHESS_WAGER, ethers.MaxUint256)).wait();
  }
  toast('Confirm in your wallet to start the game.');
  const w = wagerWrite(state.signer);
  const tx = await w.createGame(tok.address, amount, ZERO, state.timeSec);
  const rec = await tx.wait();
  let gameId = null;
  for (const log of rec.logs) {
    try {
      const parsed = w.interface.parseLog(log);
      if (parsed?.name === 'GameCreated') gameId = parsed.args.gameId.toString();
    } catch { /* */ }
  }
  if (!gameId) gameId = ((await wagerRead().nextGameId()) - 1n).toString();
  state.busy = false;
  toast('Game started. Send the link to your opponent.');
  await openGame(gameId);
}

async function acceptGame(id) {
  if (!state.signer) await doConnect();
  if (!state.signer) throw new Error('Connect your wallet first.');
  await ensurePulseChain();
  const g = await wagerRead().getGame(id);
  const tok = tokenByAddress(g.wagerToken);
  if (!tok) throw new Error('This game uses an unknown token.');
  state.busy = true; render();
  const erc = tokenContract(tok.address, state.signer);
  const allow = await erc.allowance(state.account, CHESS_WAGER);
  if (allow < g.wagerAmount) {
    toast('Your wallet will ask: allow this game to use your tokens.');
    await (await erc.approve(CHESS_WAGER, ethers.MaxUint256)).wait();
  }
  toast('Confirm in your wallet to join.');
  await (await wagerWrite(state.signer).acceptGame(id)).wait();
  state.busy = false;
  toast('You are in. White moves first.');
  await openGame(id);
}

async function cancelGame(id) {
  if (!state.signer) throw new Error('Connect your wallet first.');
  state.busy = true; render();
  await (await wagerWrite(state.signer).cancelGame(id)).wait();
  state.busy = false;
  toast('Game cancelled. Your tokens come back.');
  leaveGame();
  await refreshLobby();
}

async function openGame(id) {
  const g = plainGame(await wagerRead().getGame(id));
  if (g.playerWhite === ZERO) throw new Error('That game does not exist.');
  const saved = loadLocal(id);
  state.game = {
    id: String(id),
    onchain: g,
    chess: saved?.fen ? chessFromFen(saved.fen) : startingChess(),
    linked: false,
    states: saved || { sequence: 0, fen: startingChess().fen(), sigs: {}, resultSigs: {} }
  };
  state.preview = state.game.chess;
  state.selected = null;
  state.legal = [];
  history.replaceState({}, '', `?game=${id}`);
  relayRegister({ id, ...g }).catch(() => {});
  render();
  if (g.status === 1 && state.account) await bootPlay(g);
}

function leaveGame() {
  stopRelay();
  channel.close();
  state.game = null;
  state.preview = startingChess();
  state.selected = null;
  state.legal = [];
  state.lastMove = null;
  state.peerOn = false;
  history.replaceState({}, '', location.pathname);
  render();
}

async function bootPlay(g) {
  if (!state.game) return;
  state.game.linked = true;
  const isWhite = meIs(g.playerWhite);
  const isPlayer = isWhite || meIs(g.playerBlack);
  if (isPlayer) {
    await ensureOpeningProof();
    await channel.connect(state.game.id, isWhite);
    relayRegister({ id: state.game.id, ...g }).catch(() => {});
    startRelay(state.game.id);
    flushProofs();
  }
  render();
}

function flushProofs() {
  if (!state.game || !state.account) return;
  publish({
    type: 'hello',
    from: state.account,
    fen: state.game.chess.fen(),
    history: state.game.chess.history({ verbose: true }),
    states: state.game.states
  });
}

function seqStore() {
  const g = state.game;
  if (!g.states.seq) g.states.seq = {};
  return g.states.seq;
}

function saveSeq(sequence, extra = {}) {
  const key = String(sequence);
  const box = seqStore();
  box[key] = { sigs: {}, ...(box[key] || {}), ...extra };
  if (extra.sigs) box[key].sigs = { ...(box[key].sigs || {}), ...extra.sigs };
  return box[key];
}

function saveStateSig(sequence, addr, sig) {
  if (!addr || !sig) return;
  const row = saveSeq(sequence);
  row.sigs = row.sigs || {};
  row.sigs[String(addr).toLowerCase()] = sig;
}

function seqSigs(sequence) {
  return seqStore()[String(sequence)]?.sigs || {};
}

function bothStateSigs(sequence) {
  const g = state.game;
  const s = seqSigs(sequence);
  return !!(s[g.onchain.playerWhite.toLowerCase()] && s[g.onchain.playerBlack.toLowerCase()]);
}

function openingStateNorm() {
  const g = state.game;
  return normalizeState({
    gameId: g.id,
    sequence: 0,
    boardHash: hashPackedBoard(packedFromChess(startingChess())),
    currentPlayer: g.onchain.playerWhite,
    whiteTimeRemaining: g.onchain.timeControlSeconds,
    blackTimeRemaining: g.onchain.timeControlSeconds,
    lastActionTimestamp: g.onchain.startedAt || Math.floor(Date.now() / 1000),
    previousStateHash: ethers.ZeroHash
  });
}

async function ensureOpeningProof() {
  const g = state.game;
  const opening = openingStateNorm();
  saveSeq(0, { state: serializeState(opening), board: packedFromChess(startingChess()), fen: startingChess().fen() });
  if (!g.states.last) g.states.last = serializeState(opening);
  const me = state.account.toLowerCase();
  if (!seqSigs(0)[me]) {
    toast('Confirm the start position. This protects you if they later refuse to pay.');
    const sig = await signTyped(state.signer, 'GameState', opening);
    saveStateSig(0, state.account, sig);
    saveLocal(g.id, g.states);
  }
}

function onPeer(msg) {
  if (!msg || !state.game) return;
  if (msg.type === 'move' && msg.mover && meIs(msg.mover)
    && Number(msg.sequence || 0) <= Number(state.game.states.sequence || 0)) return;
  if (msg.type === 'result' && msg.from && meIs(msg.from)
    && state.game.states.resultSigs?.[state.account.toLowerCase()]) return;
  if (msg.type === 'hello' && msg.from && meIs(msg.from)) return;
  if (msg.type === 'peer-open') {
    state.peerOn = true;
    toast('Opponent is here.');
    paint();
    return;
  }
  if (msg.type === 'hello') {
    state.peerOn = true;
    if (msg.states?.seq) {
      const box = seqStore();
      for (const [k, v] of Object.entries(msg.states.seq)) {
        const cur = box[k] || { sigs: {} };
        box[k] = { ...cur, ...v, sigs: { ...(cur.sigs || {}), ...((v && v.sigs) || {}) } };
      }
    }
    if (msg.fen && state.game.chess.history().length === 0 && (msg.states?.sequence || 0) > 0) {
      state.game.chess = chessFromFen(msg.fen);
      state.preview = state.game.chess;
      state.game.states = { ...state.game.states, seq: state.game.states.seq, ...msg.states };
    }
    paint();
    return;
  }
  if (msg.type === 'move') {
    applyRemoteMove(msg);
    return;
  }
  if (msg.type === 'result') {
    state.game.states.result = msg.result;
    state.game.states.resultSigs = state.game.states.resultSigs || {};
    if (msg.sig && msg.from) state.game.states.resultSigs[String(msg.from).toLowerCase()] = msg.sig;
    saveLocal(state.game.id, state.game.states);
    toast('Opponent confirmed the result. Confirm yours to get paid.');
    paint();
  }
}

function applyRemoteMove(msg) {
  if (msg.state && msg.stateSig && msg.mover) {
    try {
      const rec = verifyTyped('GameState', normalizeState(msg.state), msg.stateSig);
      if (String(rec).toLowerCase() !== String(msg.mover).toLowerCase()) return;
    } catch {
      return;
    }
  }
  const seq = Number(msg.sequence || 0);
  const have = Number(state.game.states.sequence || 0);
  if (msg.prevState) saveSeq(msg.prevState.sequence, { state: msg.prevState, board: msg.prevBoard });
  if (msg.state) saveSeq(seq, { state: msg.state, board: msg.newBoard });
  if (msg.stateSig && msg.mover) saveStateSig(seq, msg.mover, msg.stateSig);
  if (msg.finalMove) state.game.states.finalMove = msg.finalMove;
  if (msg.from && msg.to) saveSeq(seq, { from: msg.from, to: msg.to, promo: msg.promo, move: msg.move || null });

  if (seq && seq <= have) {
    saveLocal(state.game.id, state.game.states);
    return;
  }

  const chess = state.game.chess;
  const move = chess.move({ from: msg.from, to: msg.to, promotion: msg.promo || undefined });
  if (!move) {
    saveLocal(state.game.id, state.game.states);
    return;
  }
  saveSeq(seq || have + 1, { state: msg.state, board: msg.newBoard, fen: chess.fen() });
  state.game.states.fen = chess.fen();
  state.game.states.sequence = seq || have + 1;
  if (msg.state) state.game.states.last = msg.state;
  saveLocal(state.game.id, state.game.states);
  state.lastMove = { from: msg.from, to: msg.to };
  state.selected = null;
  state.legal = [];
  state.preview = chess;
  if (chess.isGameOver()) maybePrepareEnd();
  if (!hushRender && state.signer && msg.state) {
    ensureOurStateSig(state.game.states.sequence, msg.state).catch(() => {});
  }
  paint();
}

function meIs(addr) {
  return !!(state.account && addr && addr.toLowerCase() === state.account.toLowerCase());
}

function myColor() {
  const g = state.game;
  if (!g || !state.account) return null;
  if (meIs(g.onchain.playerWhite)) return 'w';
  if (meIs(g.onchain.playerBlack)) return 'b';
  return null;
}

function isLive() {
  return !!(state.game && state.game.onchain.status === 1);
}

function isMyTurn() {
  if (!isLive() || !state.account) return false;
  const turn = state.game.chess.turn();
  return (turn === 'w' && myColor() === 'w') || (turn === 'b' && myColor() === 'b');
}

function activeChess() {
  return state.game ? state.game.chess : state.preview;
}

function clickSquare(sq) {
  const chess = activeChess();
  const playingMoney = isLive();
  if (playingMoney && !isMyTurn()) return;
  if (state.game && state.game.onchain.status === 0 && myColor() === 'w') return;
  if (state.game && [3, 4].includes(state.game.onchain.status)) return;

  if (state.selected) {
    const legal = chess.moves({ square: state.selected, verbose: true }).find((m) => m.to === sq);
    if (legal) {
      if (legal.promotion) {
        state.promo = { from: state.selected, to: sq };
        render();
        return;
      }
      finishMove(state.selected, sq, null);
      return;
    }
  }
  const piece = chess.get(sq);
  const canMove = playingMoney ? piece && piece.color === myColor() && piece.color === chess.turn()
    : piece && piece.color === chess.turn();
  if (canMove) {
    state.selected = sq;
    state.legal = chess.moves({ square: sq, verbose: true }).map((m) => m.to);
  } else {
    state.selected = null;
    state.legal = [];
  }
  render();
}

async function finishMove(from, to, promo) {
  const chess = activeChess();
  const live = !!(state.game && isLive());
  const prev = live ? currentStateObj() : null;
  const prevBoard = live ? packedFromChess(chess) : null;
  const prevSer = live ? serializeState(prev) : null;
  const mv = chess.move({ from, to, promotion: promo || undefined });
  if (!mv) throw new Error('That move is not allowed.');
  state.promo = null;
  state.selected = null;
  state.legal = [];
  state.lastMove = { from, to };

  if (live) {
    const now = Math.floor(Date.now() / 1000);
    const elapsed = Math.max(0, now - Number(prev.lastActionTimestamp));
    let wRem = Number(prev.whiteTimeRemaining);
    let bRem = Number(prev.blackTimeRemaining);
    if (mv.color === 'w') wRem = Math.max(0, wRem - elapsed);
    else bRem = Math.max(0, bRem - elapsed);
    const packed = packedFromChess(chess);
    const prevHash = structHashGameState(prev);
    const newState = normalizeState({
      gameId: state.game.id,
      sequence: Number(prev.sequence) + 1,
      boardHash: hashPackedBoard(packed),
      currentPlayer: chess.turn() === 'w' ? state.game.onchain.playerWhite : state.game.onchain.playerBlack,
      whiteTimeRemaining: wRem,
      blackTimeRemaining: bRem,
      lastActionTimestamp: now,
      previousStateHash: prevHash
    });
    const movePayload = {
      gameId: state.game.id,
      sequence: Number(newState.sequence),
      previousStateHash: prevHash,
      newBoardHash: newState.boardHash,
      from: algebraicToIndex(from),
      to: algebraicToIndex(to),
      promotion: promoToCode(mv.color, promo)
    };
    saveSeq(Number(prev.sequence), { state: prevSer, board: prevBoard });
    saveSeq(Number(newState.sequence), {
      state: serializeState(newState),
      board: packed,
      fen: chess.fen(),
      move: movePayload,
      from,
      to,
      promo
    });

    toast('Confirm this position. Needed if they later refuse to pay.');
    const stateSig = await signTyped(state.signer, 'GameState', newState);
    saveStateSig(Number(newState.sequence), state.account, stateSig);

    let finalMove = null;
    if (chess.isCheckmate() || chess.isStalemate()) {
      toast('Confirm the last move on-chain.');
      const moveSig = await signTyped(state.signer, 'SignedMove', movePayload);
      finalMove = { move: movePayload, sig: moveSig, mover: state.account };
      state.game.states.finalMove = finalMove;
    }

    state.game.states.fen = chess.fen();
    state.game.states.sequence = Number(newState.sequence);
    state.game.states.last = serializeState(newState);
    saveLocal(state.game.id, state.game.states);
    publish({
      type: 'move',
      from, to, promo, san: mv.san,
      sequence: Number(newState.sequence),
      state: state.game.states.last,
      stateSig,
      mover: state.account,
      prevState: prevSer,
      prevBoard,
      newBoard: packed,
      move: movePayload,
      finalMove
    });
    if (chess.isGameOver()) await maybePrepareEnd();
  }
  render();
}

function currentStateObj() {
  const g = state.game;
  if (g.states.last) return normalizeState(g.states.last);
  const packed = packedFromChess(g.chess.history().length ? g.chess : startingChess());
  return {
    gameId: BigInt(g.id),
    sequence: 0n,
    boardHash: hashPackedBoard(packedFromChess(startingChess())),
    currentPlayer: g.onchain.playerWhite,
    whiteTimeRemaining: BigInt(g.onchain.timeControlSeconds),
    blackTimeRemaining: BigInt(g.onchain.timeControlSeconds),
    lastActionTimestamp: BigInt(g.onchain.startedAt || Math.floor(Date.now() / 1000)),
    previousStateHash: ethers.ZeroHash
  };
}

function endFromBoard() {
  const g = state.game;
  return resultFromChess(g.chess, g.onchain.playerWhite, g.onchain.playerBlack);
}

async function maybePrepareEnd() {
  const end = endFromBoard();
  if (!end.resultType) return;
  state.game.states.pendingEnd = end;
}

async function signCurrentResult() {
  if (!state.signer || !state.game) throw new Error('Connect your wallet first.');
  const end = state.game.states.pendingEnd || endFromBoard();
  if (!end.resultType) throw new Error('The game is not finished yet.');
  const result = {
    gameId: state.game.id,
    winner: end.winner,
    resultType: end.resultType,
    finalBoardHash: hashPackedBoard(packedFromChess(state.game.chess)),
    finalSequence: state.game.states.sequence || 0
  };
  toast('Confirm the result in your wallet.');
  const sig = await signTyped(state.signer, 'GameResult', result);
  state.game.states.result = result;
  state.game.states.resultSigs = state.game.states.resultSigs || {};
  state.game.states.resultSigs[state.account.toLowerCase()] = sig;
  saveLocal(state.game.id, state.game.states);
  publish({ type: 'result', result, sig, from: state.account });
  toast('Saved. When both players confirm, collect the tokens.');
  render();
}

async function offerDraw() {
  if (!state.game) return;
  state.game.states.pendingEnd = { winner: ZERO, resultType: 5 };
  await signCurrentResult();
}

async function resign() {
  if (!state.signer || !state.game) throw new Error('Connect your wallet first.');
  const nonce = await wagerRead().sessionNonceOf(state.game.id, state.account);
  const res = { gameId: state.game.id, player: state.account, nonce };
  toast('Confirm giving up in your wallet.');
  const sig = await signTyped(state.signer, 'Resignation', res);
  await (await wagerWrite(state.signer).resignWithSignature(state.game.id, res, sig)).wait();
  toast('You gave up. Opponent gets the pot.');
  await refreshLobby();
  await openGame(state.game.id);
}

async function submitSettle() {
  const g = state.game;
  if (!g?.states?.result) throw new Error('Both players must confirm the result first.');
  const white = g.onchain.playerWhite.toLowerCase();
  const black = g.onchain.playerBlack.toLowerCase();
  const sigs = g.states.resultSigs || {};
  if (!sigs[white] || !sigs[black]) throw new Error('Waiting for the other player to confirm.');
  toast('Confirm in your wallet to send the tokens.');
  await (await wagerWrite(state.signer).settleGame(g.id, g.states.result, sigs[white], sigs[black])).wait();
  toast('Done. Tokens are sent.');
  await loadBalances();
  await refreshLobby();
  await openGame(g.id);
}

function packBoardArg(board) {
  return {
    squares: board.squares,
    whiteToMove: board.whiteToMove,
    castlingRights: board.castlingRights,
    enPassantSquare: board.enPassantSquare,
    halfmoveClock: board.halfmoveClock
  };
}

async function ensureOurStateSig(sequence, stateObj) {
  const me = state.account.toLowerCase();
  if (seqSigs(sequence)[me]) return seqSigs(sequence)[me];
  toast('Confirm this board position in your wallet.');
  const sig = await signTyped(state.signer, 'GameState', normalizeState(stateObj));
  saveStateSig(sequence, state.account, sig);
  saveLocal(state.game.id, state.game.states);
  return sig;
}

async function claimWinOnChain() {
  if (!state.signer || !state.game) throw new Error('Connect your wallet first.');
  const g = state.game;
  const lastSeq = Number(g.states.sequence || 0);
  if (lastSeq < 1) throw new Error('No last move to prove yet.');
  const mutualSeq = lastSeq - 1;
  const mutualRow = seqStore()[String(mutualSeq)];
  const lastRow = seqStore()[String(lastSeq)];
  if (!mutualRow?.state || !mutualRow?.board) throw new Error('Missing the last shared board. Play needs a live link.');
  let finalMove = g.states.finalMove;
  if (!finalMove) throw new Error('Missing the signed last move. The player who delivered mate must claim.');

  const mutualState = normalizeState(mutualRow.state);
  const white = g.onchain.playerWhite.toLowerCase();
  const black = g.onchain.playerBlack.toLowerCase();
  const sigs = { ...(mutualRow.sigs || {}) };
  if (!sigs[state.account.toLowerCase()]) {
    sigs[state.account.toLowerCase()] = await ensureOurStateSig(mutualSeq, mutualState);
  }
  if (!sigs[white] || !sigs[black]) {
    throw new Error('Need the other player’s position confirm from earlier in the game. They must have made their last move in this app.');
  }

  const claim = {
    gameId: g.id,
    lastMutualState: mutualState,
    sigWhite: sigs[white],
    sigBlack: sigs[black],
    boardAtMutualState: packBoardArg(mutualRow.board),
    finalMove: finalMove.move,
    finalMoveSignature: finalMove.sig
  };
  toast('Confirm claim on PulseChain. They cannot block this.');
  await (await wagerWrite(state.signer).claimTerminalPosition(claim)).wait();
  toast('Claimed. After 1 hour tap Collect.');
  await refreshLobby();
  await openGame(g.id);
}

async function claimTimeoutOnChain() {
  if (!state.signer || !state.game) throw new Error('Connect your wallet first.');
  const g = state.game;
  const seq = Number(g.states.sequence || 0);
  const row = seqStore()[String(seq)] || { state: g.states.last, sigs: seqSigs(seq) };
  if (!row.state) throw new Error('No signed position yet.');
  const st = normalizeState(row.state);
  const white = g.onchain.playerWhite.toLowerCase();
  const black = g.onchain.playerBlack.toLowerCase();
  const sigs = { ...(row.sigs || {}) };
  if (!sigs[state.account.toLowerCase()]) {
    sigs[state.account.toLowerCase()] = await ensureOurStateSig(seq, st);
  }
  if (!sigs[white] || !sigs[black]) {
    throw new Error('Timeout needs both players to have confirmed this position earlier.');
  }
  toast('Confirm timeout claim.');
  await (await wagerWrite(state.signer).claimTimeout(g.id, st, sigs[white], sigs[black])).wait();
  toast('Timeout claimed. After 1 hour tap Collect.');
  await refreshLobby();
  await openGame(g.id);
}

async function finalizeOnChain() {
  if (!state.signer || !state.game) throw new Error('Connect your wallet first.');
  toast('Confirm collect. The 1 hour wait is over.');
  await (await wagerWrite(state.signer).finalizeDispute(state.game.id)).wait();
  toast('Done. Tokens are sent.');
  await loadBalances();
  await refreshLobby();
  await openGame(state.game.id);
}

function normalizeMove(m) {
  return {
    gameId: m.gameId,
    sequence: m.sequence,
    previousStateHash: m.previousStateHash,
    newBoardHash: m.newBoardHash,
    from: Number(m.from),
    to: Number(m.to),
    promotion: Number(m.promotion || 0)
  };
}

function canChallengeMove() {
  const g = state.game;
  if (!g) return false;
  const lastSeq = Number(g.states.sequence || 0);
  if (lastSeq < 1) return false;
  const mutual = seqStore()[String(lastSeq - 1)];
  const last = seqStore()[String(lastSeq)];
  return !!(mutual?.state && mutual?.board && bothStateSigs(lastSeq - 1) && (g.states.finalMove || last?.move));
}

function canChallengeState() {
  const g = state.game;
  if (!g) return false;
  const chainSeq = Number(g.onchain.highestSequence || 0);
  for (const [k, row] of Object.entries(seqStore())) {
    if (Number(k) > chainSeq && row.state && bothStateSigs(Number(k))) return true;
  }
  return false;
}

async function challengeMoveOnChain() {
  if (!state.signer || !state.game) throw new Error('Connect your wallet first.');
  const g = state.game;
  const lastSeq = Number(g.states.sequence || 0);
  if (lastSeq < 1) throw new Error('No later move to prove.');
  const mutualSeq = lastSeq - 1;
  const mutualRow = seqStore()[String(mutualSeq)];
  const lastRow = seqStore()[String(lastSeq)];
  if (!mutualRow?.state || !mutualRow?.board) throw new Error('Missing the last shared board.');

  const mutualState = normalizeState(mutualRow.state);
  const white = g.onchain.playerWhite.toLowerCase();
  const black = g.onchain.playerBlack.toLowerCase();
  const sigs = { ...(mutualRow.sigs || {}) };
  if (!sigs[state.account.toLowerCase()]) {
    sigs[state.account.toLowerCase()] = await ensureOurStateSig(mutualSeq, mutualState);
  }
  if (!sigs[white] || !sigs[black]) {
    throw new Error('Need both players’ confirm on the earlier position.');
  }

  let finalMove = g.states.finalMove;
  if (!finalMove && lastRow?.move) {
    const mover = mutualState.currentPlayer;
    if (!meIs(mover)) throw new Error('The player who made that move must have signed it.');
    toast('Confirm that move in your wallet.');
    const signed = normalizeMove(lastRow.move);
    const moveSig = await signTyped(state.signer, 'SignedMove', signed);
    finalMove = { move: signed, sig: moveSig, mover: state.account };
    g.states.finalMove = finalMove;
    saveLocal(g.id, g.states);
  }
  if (!finalMove) throw new Error('Missing a signed later move.');

  toast('Confirm challenge on PulseChain.');
  await (await wagerWrite(state.signer).challengeWithMove(
    g.id,
    mutualState,
    sigs[white],
    sigs[black],
    packBoardArg(mutualRow.board),
    normalizeMove(finalMove.move),
    finalMove.sig
  )).wait();
  toast('Challenge sent. The 1 hour wait restarts.');
  await refreshLobby();
  await openGame(g.id);
}

async function challengeStateOnChain() {
  if (!state.signer || !state.game) throw new Error('Connect your wallet first.');
  const g = state.game;
  const chainSeq = Number(g.onchain.highestSequence || 0);
  let best = null;
  for (const [k, row] of Object.entries(seqStore())) {
    const seq = Number(k);
    if (seq > chainSeq && row.state && bothStateSigs(seq)) {
      if (!best || seq > best.seq) best = { seq, row };
    }
  }
  if (!best) throw new Error('Need a later position that both of you already confirmed.');
  const st = normalizeState(best.row.state);
  const white = g.onchain.playerWhite.toLowerCase();
  const black = g.onchain.playerBlack.toLowerCase();
  const sigs = best.row.sigs;
  toast('Confirm challenge on PulseChain.');
  await (await wagerWrite(state.signer).challengeDispute(g.id, st, sigs[white], sigs[black])).wait();
  toast('Challenge sent. The 1 hour wait restarts.');
  await refreshLobby();
  await openGame(g.id);
}

function presenceHtml() {
  if (!state.game) return '';
  if (!relayOn()) {
    return `<p class="muted presence" id="presence-line">This page is not on your WordPress site yet. If someone loses internet, moves can disappear.</p>`;
  }
  const them = meIs(state.game.onchain.playerWhite)
    ? state.game.onchain.playerBlack
    : state.game.onchain.playerWhite;
  if (!them || them === ZERO) {
    return `<p class="ok presence" id="presence-line">This game is saved on the site.</p>`;
  }
  const row = (state.presence || []).find((p) => String(p.address).toLowerCase() === them.toLowerCase());
  const seen = row ? Number(row.seen ? row.seen * 1000 : Date.parse(row.last_seen || row.lastSeen || 0)) : 0;
  const online = seen && (Date.now() - seen) < 20000;
  return online
    ? `<p class="ok presence" id="presence-line">Opponent is online. Game is saved on this site.</p>`
    : `<p class="muted presence" id="presence-line">Opponent may be offline. Your moves are saved here — they see them when they come back.</p>`;
}

function startClocks() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    const el = document.getElementById('clocks');
    if (el) el.innerHTML = clocksHtml();
    const turn = document.getElementById('turn-banner');
    if (turn) turn.innerHTML = turnText();
    const wait = document.getElementById('dispute-wait');
    if (wait && state.game?.onchain?.status === 2) {
      const left = Math.max(0, (state.game.onchain.disputeDeadline || 0) - Math.floor(Date.now() / 1000));
      wait.textContent = left > 0 ? `Wait ${fmtClock(left)} then tap Collect.` : 'You can collect now.';
    }
  }, 250);
}

function remainingNow() {
  const g = state.game;
  if (!g) return { w: state.timeSec, b: state.timeSec, turn: activeChess().turn() };
  const base = g.states.last;
  const tc = g.onchain.timeControlSeconds;
  let w = tc;
  let b = tc;
  let last = g.onchain.startedAt || Math.floor(Date.now() / 1000);
  let turn = g.chess.turn();
  if (base) {
    w = Number(base.whiteTimeRemaining);
    b = Number(base.blackTimeRemaining);
    last = Number(base.lastActionTimestamp);
  }
  if (g.onchain.status === 1) {
    const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - last);
    if (turn === 'w') w = Math.max(0, w - elapsed);
    else b = Math.max(0, b - elapsed);
  }
  return { w, b, turn };
}

function render() {
  const wallet = $('#wallet-box');
  if (wallet) wallet.innerHTML = walletHtml();
  const main = $('#main');
  if (main) main.innerHTML = mainHtml();
  const modal = $('#modal');
  if (modal) {
    modal.innerHTML = (state.showInfo ? infoHtml() : '')
      + (state.showLicense ? licenseHtml() : '')
      + (state.promo ? promoHtml() : '');
  }
  bindBoard();
}

function walletHtml() {
  return `
    <div class="wallet-row">
      ${state.account ? `
        <div class="pill bal"><img src="${TOKENS.MAGIC.icon}" alt="" /><span class="pill-amt">${fmtAmount(state.balances.MAGIC, 18)}</span> MAGIC</div>
        <div class="pill bal"><img src="${TOKENS.POISON.icon}" alt="" /><span class="pill-amt">${fmtAmount(state.balances.POISON, 9)}</span> POISON</div>
      ` : ''}
      <button class="info-btn" data-act="info" title="How it works" aria-label="How it works">i</button>
      ${state.account
        ? `<div class="pill addr">${shortAddr(state.account)}</div>`
        : `<button class="btn" data-act="connect">Connect wallet</button>`}
    </div>
  `;
}

function mainHtml() {
  return `
    <div class="layout">
      <section class="card board-card">
        ${boardPanel()}
      </section>
      <section class="card side-card">
        ${sidePanel()}
        ${state.err ? `<div class="err">${esc(state.err)}</div>` : ''}
      </section>
    </div>
  `;
}

function boardPanel() {
  return `
    <div class="players">
      ${playerBlock('Black', state.game?.onchain.playerBlack, 'b')}
      <div id="clocks">${clocksHtml()}</div>
      ${playerBlock('White', state.game?.onchain.playerWhite, 'w')}
    </div>
    <div class="turn-banner" id="turn-banner">${turnText()}</div>
    <div class="board-wrap">
      <div class="board-frame">
        <div class="board" id="board">${boardHtml()}</div>
      </div>
    </div>
    <div class="moves">${moveList()}</div>
  `;
}

function playerBlock(label, addr, color) {
  let name = label;
  if (state.account && addr && addr !== ZERO) {
    name = meIs(addr) ? `${label} · you` : label;
  }
  return `<div class="player ${color === 'w' ? 'right' : ''}"><div class="who">${name}</div></div>`;
}

function clocksHtml() {
  if (!state.game || state.game.onchain.status === 0) {
    return `<div class="clock">${fmtClock(state.game?.onchain.timeControlSeconds || state.timeSec)}</div>`;
  }
  const { w, b, turn } = remainingNow();
  return `
    <div class="row">
      <div class="clock ${turn === 'b' ? 'on' : ''}">${fmtClock(b)}</div>
      <div class="clock ${turn === 'w' ? 'on' : ''}">${fmtClock(w)}</div>
    </div>
  `;
}

function turnText() {
  const chess = activeChess();
  if (!state.game) return '';
  if (state.game.onchain.status === 3) {
    const w = state.game.onchain.winner;
    if (!w || w === ZERO) return 'Draw';
    return meIs(w) ? 'You won' : 'Opponent won';
  }
  if (state.game.onchain.status === 4) return 'Cancelled';
  if (state.game.onchain.status === 0) return state.account && meIs(state.game.onchain.playerWhite) ? 'Send the link to start' : 'Waiting to join';
  if (chess.isCheckmate()) return 'Checkmate';
  if (chess.isDraw()) return 'Draw';
  if (chess.isCheck()) return 'Check';
  if (isLive() && isMyTurn()) return 'Your turn';
  if (isLive()) return 'Opponent to move';
  return '';
}

function sidePanel() {
  if (!state.game) return createPanel();
  const s = state.game.onchain.status;
  if (s === 0) return waitingPanel();
  if (s === 1) return playingPanel();
  if (s === 2) return disputedPanel();
  if (s === 3) return finishedPanel();
  return `
    <h2>This game ended</h2>
    <p class="lead">It was cancelled or already finished.</p>
    <button class="btn big" data-act="leave">Back to start</button>
  `;
}

function createPanel() {
  const tok = TOKENS[state.tokenKey];
  const open = state.lobby.filter((g) => g.status === 0 && !meIs(g.playerWhite));
  return `
    <h2>Start a game</h2>
    <p class="lead">Pick a token and a bet, then send the link.</p>
    <div class="field">
      <label>Play with</label>
      <div class="token-pick">
        ${Object.keys(TOKENS).map((k) => `
          <button data-act="token" data-token="${k}" class="${state.tokenKey === k ? 'active' : ''}">
            <img src="${TOKENS[k].icon}" alt="" /> ${k}
          </button>`).join('')}
      </div>
    </div>
    <div class="field">
      <label>Your bet <span class="hint">both players put in this amount</span></label>
      <input id="amount" value="${esc(state.amount)}" inputmode="decimal" />
    </div>
    <div class="field">
      <label>Time each player gets</label>
      <div class="time-pick">
        ${TIME_PRESETS.map((t) => `
          <button data-act="time" data-sec="${t.seconds}" class="${state.timeSec === t.seconds ? 'active' : ''}">${t.label}</button>
        `).join('')}
      </div>
    </div>
    <button class="btn big" data-act="create" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Please wait…' : `Start game with ${tok.symbol}`}</button>
    <h2 style="margin-top:22px">Or join a game</h2>
    <div class="game-list">
      ${open.length === 0 ? `<p class="muted">No open games right now.</p>` : open.map(joinRow).join('')}
    </div>
  `;
}

function joinRow(g) {
  const tok = tokenByAddress(g.wagerToken);
  const amt = tok ? fmtAmount(g.wagerAmount, tok.decimals) : '?';
  return `
    <div class="game-row">
      <p><strong>#${g.id}</strong><br><span class="muted">${amt} ${tok?.symbol || ''} · ${g.timeControlSeconds / 60} min</span></p>
      <button class="btn" data-act="accept" data-id="${g.id}">Join</button>
    </div>
  `;
}

function waitingPanel() {
  const g = state.game;
  const tok = tokenByAddress(g.onchain.wagerToken);
  const amt = tok ? fmtAmount(g.onchain.wagerAmount, tok.decimals) : '';
  const invite = inviteUrl(g.id);
  const mine = meIs(g.onchain.playerWhite);
  return `
    <h2>${mine ? 'Waiting for opponent' : 'Join this game'}</h2>
    <p class="lead">${amt} ${tok?.symbol || ''} each · ${g.onchain.timeControlSeconds / 60} minutes per player</p>
    ${mine ? `
      <div class="step">
        <strong>Send this link to your opponent</strong>
        They open it, tap Join, and the game starts.
        <div class="invite">
          <input readonly value="${invite}" />
          <button class="btn" data-act="copy" data-text="${invite}">Copy</button>
        </div>
      </div>
      <button class="btn danger big" data-act="cancel" data-id="${g.id}">Cancel and get my tokens back</button>
      ${relayOn() ? `<p class="muted presence">This invite is saved on the site. They can open the link later.</p>` : ''}
    ` : `
      <p class="lead">You put in the same bet. Then you play as Black.</p>
      <button class="btn big" data-act="accept" data-id="${g.id}">Join this game</button>
    `}
    <button class="btn ghost big" style="margin-top:8px" data-act="leave">Back</button>
  `;
}

function playingPanel() {
  const g = state.game;
  const tok = tokenByAddress(g.onchain.wagerToken);
  const amt = tok ? fmtAmount(g.onchain.wagerAmount, tok.decimals) : '';
  const over = g.chess.isGameOver();
  const both = bothSigned();
  const iSigned = state.account && g.states.resultSigs?.[state.account.toLowerCase()];
  const canForce = over && (g.chess.isCheckmate() || g.chess.isStalemate()) && !!g.states.finalMove;
  const { w, b, turn } = remainingNow();
  const oppTimedOut = !over && ((turn === 'w' && w <= 0) || (turn === 'b' && b <= 0)) && !isMyTurn();
  return `
    <h2>${over ? 'Game finished' : 'Game on'}</h2>
    <p class="lead">${amt} ${tok?.symbol || ''} each. Click a piece, then click where it should go.</p>
    ${over ? `
      <div class="step">
        <strong>${turnText()}</strong>
        Fast way: both tap Confirm, then Collect.
      </div>
      ${!iSigned ? `<button class="btn big" data-act="sign-result">Confirm the result</button>` : `<p class="ok">You confirmed. Waiting for the other player.</p>`}
      ${both ? `<button class="btn big" data-act="collect">Collect tokens</button>` : ''}
      ${!both ? refuseHelpHtml(canForce) : ''}
      ${!both && canForce ? `<button class="btn secondary big" data-act="claim-win">They refuse? Claim win on-chain</button>` : ''}
    ` : `
      <p class="muted">${isMyTurn() ? 'It is your turn.' : 'Wait for your opponent.'}</p>
      <div class="row">
        <button class="btn secondary" data-act="draw">Offer draw</button>
        <button class="btn danger" data-act="resign">I give up</button>
      </div>
      ${oppTimedOut ? `<button class="btn big" style="margin-top:8px" data-act="claim-timeout">They ran out of time</button>` : ''}
    `}
    ${presenceHtml()}
  `;
}

function refuseHelpHtml(canForce) {
  return `
    <div class="step refuse-help">
      <strong>If they will not sign</strong>
      <ol>
        <li>You still tap <em>Confirm the result</em> in your wallet.</li>
        <li>If they ignore it, tap <em>They refuse? Claim win on-chain</em>.</li>
        <li>Wait 1 hour. They cannot block this.</li>
        <li>Then tap <em>Collect tokens</em>.</li>
      </ol>
      ${canForce
        ? `<p class="muted">You already have the last-move proof. You can claim without them.</p>`
        : `<p class="muted">Claim win only works after checkmate or stalemate, and you must have confirmed the last position during the game.</p>`}
    </div>
  `;
}

function disputedPanel() {
  const g = state.game;
  const left = Math.max(0, (g.onchain.disputeDeadline || 0) - Math.floor(Date.now() / 1000));
  return `
    <h2>Win claimed</h2>
    <p class="lead">They refused to sign. The contract is holding the pot. They cannot block this.</p>
    <div class="step refuse-help">
      <strong>What you do now</strong>
      <ol>
        <li>Wait the 1 hour. Keep this game link.</li>
        <li>When the timer is done, tap Collect tokens.</li>
        <li>Confirm in your wallet. The pot minus 5% is sent to you.</li>
      </ol>
    </div>
    ${left > 0
      ? `<div class="step" id="dispute-wait">Wait <strong>${fmtClock(left)}</strong> then tap Collect.</div>`
      : `<button class="btn big" data-act="finalize">Collect tokens</button>`}
    ${canChallengeMove() ? `<button class="btn secondary big" style="margin-top:8px" data-act="challenge-move">This claim is wrong — prove a later move</button>` : ''}
    ${canChallengeState() ? `<button class="btn secondary big" style="margin-top:8px" data-act="challenge-state">This claim is wrong — prove a later position</button>` : ''}
    ${presenceHtml()}
  `;
}

function finishedPanel() {
  const g = state.game;
  const w = g.onchain.winner;
  let line = 'The tokens are already sent.';
  if (!w || w === ZERO) line = 'It was a draw. Both got their bet back.';
  else if (meIs(w)) line = 'You won. The pot was sent to you.';
  else line = 'Opponent won this one.';
  return `
    <h2>Game over</h2>
    <p class="lead">${line}</p>
    <button class="btn big" data-act="leave">Play again</button>
  `;
}

function bothSigned() {
  const g = state.game;
  if (!g?.states?.resultSigs) return false;
  const a = g.onchain.playerWhite.toLowerCase();
  const b = g.onchain.playerBlack.toLowerCase();
  return !!(g.states.resultSigs[a] && g.states.resultSigs[b]);
}

function boardHtml() {
  const chess = activeChess();
  const flip = myColor() === 'b';
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
  const orderFiles = flip ? [...files].reverse() : files;
  const orderRanks = flip ? [...ranks].reverse() : ranks;
  const checkSq = chess.isCheck() ? kingSquare(chess, chess.turn()) : null;
  let html = '';
  for (const r of orderRanks) {
    for (const f of orderFiles) {
      const sq = `${f}${r}`;
      const fileIdx = f.charCodeAt(0) - 97;
      const dark = (fileIdx + r) % 2 === 1;
      const piece = chess.get(sq);
      const code = piece ? FEN_TO_CODE[piece.color === 'w' ? piece.type.toUpperCase() : piece.type] : 0;
      const cls = [
        'sq',
        dark ? 'dark' : 'light',
        state.selected === sq ? 'sel' : '',
        state.lastMove && (state.lastMove.from === sq || state.lastMove.to === sq) ? 'last' : '',
        checkSq === sq ? 'check' : ''
      ].join(' ');
      const mark = state.legal.includes(sq)
        ? (piece ? '<span class="cap"></span>' : '<span class="dot"></span>')
        : '';
      const showFile = r === orderRanks[orderRanks.length - 1];
      const showRank = f === orderFiles[0];
      html += `<div class="${cls}" data-sq="${sq}">
        ${pieceImg(code)}${mark}
        ${showFile ? `<span class="file-lab">${f}</span>` : ''}
        ${showRank ? `<span class="rank-lab">${r}</span>` : ''}
      </div>`;
    }
  }
  return html;
}

function kingSquare(chess, color) {
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.type === 'k' && p.color === color) return `${String.fromCharCode(97 + f)}${8 - r}`;
    }
  }
  return null;
}

function bindBoard() {
  const board = document.getElementById('board');
  if (!board) return;
  board.onclick = (e) => {
    const sq = e.target.closest('[data-sq]')?.dataset.sq;
    if (!sq) return;
    try { clickSquare(sq); } catch (err) { setErr(err); }
  };
}

function moveList() {
  const hist = activeChess().history() || [];
  if (!hist.length) return '';
  const out = [];
  for (let i = 0; i < hist.length; i += 2) {
    out.push(`${Math.floor(i / 2) + 1}. ${hist[i]}${hist[i + 1] ? ' ' + hist[i + 1] : ''}`);
  }
  return out.join(' · ');
}

function promoHtml() {
  const chess = activeChess();
  const color = chess.turn();
  const pieces = color === 'w' ? [[5, 'q'], [4, 'r'], [3, 'b'], [2, 'n']] : [[13, 'q'], [12, 'r'], [11, 'b'], [10, 'n']];
  return `<div class="overlay"><div class="sheet">
    <h2>Pick a piece</h2>
    <div class="promo-box">${pieces.map(([code, p]) =>
      `<button class="btn secondary" data-act="promo" data-p="${p}">${pieceImg(code)}</button>`
    ).join('')}</div>
  </div></div>`;
}

function licenseHtml() {
  return `
    <div class="overlay" data-act="close-license">
      <div class="sheet license-sheet" onclick="event.stopPropagation()">
        <h2>License</h2>
        <p class="lead">JohnPablok's improved Cburnett chess set.</p>
        <div class="close-row"><button class="btn big" data-act="close-license">Close</button></div>
      </div>
    </div>
  `;
}

function infoHtml() {
  return `
    <div class="overlay" data-act="close-info">
      <div class="sheet" onclick="event.stopPropagation()">
        <h2>How this works</h2>
        <ol>
          <li><strong>Connect your wallet</strong> on PulseChain.</li>
          <li><strong>Start a game</strong> with MAGIC or POISON. That amount is locked.</li>
          <li><strong>Send the link</strong> to a friend. They put in the same amount.</li>
          <li><strong>Play chess</strong> on the board. Click a piece, then click a square.</li>
          <li><strong>When the game ends</strong> both tap Confirm, then Collect.</li>
          <li><strong>If they will not sign:</strong> you still Confirm → tap Claim win → wait 1 hour → Collect. They cannot block the payout.</li>
        </ol>
        <p class="lead" style="margin-top:12px">A draw sends both bets back. If you tap “I give up”, the other player wins. If someone loses internet, reopen the same game link on this site — moves stay saved.</p>
        <div class="close-row"><button class="btn big" data-act="close-info">Got it</button></div>
      </div>
    </div>
  `;
}

function saveLocal(id, data) {
  localStorage.setItem(`cw-${id}`, JSON.stringify(data));
}
function loadLocal(id) {
  try { return JSON.parse(localStorage.getItem(`cw-${id}`) || 'null'); } catch { return null; }
}

function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 4200);
}

function setErr(err) {
  const raw = err?.shortMessage || err?.reason || err?.message || String(err);
  const map = [
    [/user rejected|denied/i, 'You cancelled in the wallet.'],
    [/insufficient/i, 'Not enough tokens in this wallet.'],
    [/unsupported token/i, 'This game only accepts MAGIC or POISON.'],
    [/challengeexpired|expired/i, 'This invite is too old. Start a new game.'],
    [/notplayer|not creator/i, 'This action is only for the two players.'],
    [/invalidstatus|alreadyfinished/i, 'This game already moved on.']
  ];
  let msg = raw;
  for (const [re, nice] of map) if (re.test(raw)) { msg = nice; break; }
  state.err = msg;
  state.busy = false;
  console.error(err);
  render();
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
