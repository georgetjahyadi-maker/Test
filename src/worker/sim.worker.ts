/// <reference lib="webworker" />
// Web Worker that owns the simulation state and advances time off the UI thread.
import { createGame, stepDay, applyCommand, serialize, deserialize, type GameState, type Command } from '../sim/index';
import { eventDef } from '../sim/systems/events';
import { collectorStats } from '../sim/systems/dyson';

type InMsg =
  | { type: 'new'; seed: string }
  | { type: 'load'; json: string }
  | { type: 'speed'; daysPerSecond: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'step'; days: number }
  | { type: 'command'; id: number; cmd: Command }
  | { type: 'getStats'; id: number }
  | { type: 'getHistory'; id: number }
  | { type: 'getSave'; id: number }
  | { type: 'setAutoPause'; enabled: boolean };

let state: GameState | null = null;
let running = false;
let daysPerSecond = 7;
let carry = 0;
let lastTick = 0;
let lastPost = 0;
let dirty = true;
let autoPauseEnabled = true;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function snapshot(): GameState | null {
  if (!state) return null;
  const s = state;
  return { ...s, stats: { yearlyStart: s.stats.yearlyStart, yearly: {}, monthlyStart: s.stats.monthlyStart, monthly: {} }, history: s.history.slice(-40) } as GameState;
}

function post(force = false) {
  const now = performance.now();
  if (!force && now - lastPost < 110) return;
  lastPost = now;
  dirty = false;
  ctx.postMessage({ type: 'snapshot', state: snapshot(), running });
}

function pauseFor(reason: string) {
  running = false;
  ctx.postMessage({ type: 'paused', reason });
  post(true);
}

function loop() {
  if (!state) return;
  const now = performance.now();
  if (running && !state.gameOver) {
    const dt = Math.min(0.25, (now - lastTick) / 1000);
    carry += dt * daysPerSecond;
    let n = Math.floor(carry);
    carry -= n;
    const t0 = performance.now();
    while (n > 0 && running) {
      const pendingBefore = state.events.pending.length;
      const milestonesBefore = Object.keys(state.milestones).length;
      stepDay(state);
      dirty = true;
      n--;
      if (state.gameOver) {
        pauseFor('gameover');
        break;
      }
      if (autoPauseEnabled && state.events.pending.length > pendingBefore) {
        const inst = state.events.pending[state.events.pending.length - 1];
        const def = eventDef(inst.defId);
        const ap = state.settings.autoPause;
        const crisis = inst.category === 'crisis' || inst.category === 'security' || inst.category === 'disaster';
        if ((def?.pause && ap.decision) || (crisis && ap.crisis)) {
          carry = 0;
          pauseFor('decision');
          break;
        }
      }
      if (autoPauseEnabled && state.settings.autoPause.milestone && Object.keys(state.milestones).length > milestonesBefore) {
        carry = 0;
        pauseFor('milestone');
        break;
      }
      if (performance.now() - t0 > 80) {
        carry = 0;
        break;
      }
    }
  }
  lastTick = now;
  if (dirty) post();
  setTimeout(loop, 16);
}

ctx.onmessage = (e: MessageEvent<InMsg>) => {
  const m = e.data;
  try {
    switch (m.type) {
      case 'new':
        state = createGame(m.seed);
        running = false;
        lastTick = performance.now();
        post(true);
        break;
      case 'load':
        state = deserialize(m.json);
        running = false;
        lastTick = performance.now();
        post(true);
        break;
      case 'speed':
        daysPerSecond = m.daysPerSecond;
        break;
      case 'pause':
        running = false;
        post(true);
        break;
      case 'resume':
        if (state && !state.gameOver) {
          running = true;
          lastTick = performance.now();
          carry = 0;
        }
        post(true);
        break;
      case 'setAutoPause':
        autoPauseEnabled = m.enabled;
        break;
      case 'step':
        if (state) {
          for (let i = 0; i < m.days && !state.gameOver; i++) stepDay(state);
          post(true);
        }
        break;
      case 'command': {
        if (!state) {
          ctx.postMessage({ type: 'result', id: m.id, result: { ok: false, error: 'No game loaded.' } });
          break;
        }
        const result = applyCommand(state, m.cmd);
        ctx.postMessage({ type: 'result', id: m.id, result });
        post(true);
        break;
      }
      case 'getStats':
        ctx.postMessage({ type: 'data', id: m.id, data: state?.stats ?? null });
        break;
      case 'getHistory':
        ctx.postMessage({ type: 'data', id: m.id, data: state?.history ?? [] });
        break;
      case 'getSave':
        ctx.postMessage({ type: 'data', id: m.id, data: state ? serialize(state) : null });
        break;
    }
  } catch (err: any) {
    ctx.postMessage({ type: 'error', message: String(err?.message ?? err) });
    if ('id' in m) ctx.postMessage({ type: 'result', id: (m as any).id, result: { ok: false, error: String(err?.message ?? err) } });
  }
};

void collectorStats;
setTimeout(loop, 16);
