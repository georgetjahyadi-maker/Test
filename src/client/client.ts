// Main-thread client: talks to the simulation worker and exposes a React store.
import { useSyncExternalStore } from 'react';
import type { GameState, CommandResult, StatsArchive, HistoryEntry, Command } from '../sim/index';

export const SPEEDS = [
  { label: 'Pause', days: 0 },
  { label: 'Day', days: 1 },
  { label: 'Week', days: 7 },
  { label: 'Month', days: 30 },
  { label: 'Quarter', days: 91 },
  { label: 'Year', days: 365 },
];

export interface ClientState {
  s: GameState | null;
  running: boolean;
  speed: number; // index into SPEEDS (1..5)
  pausedReason?: string;
  error?: string;
  version: number;
}

type Listener = () => void;

class SimClient {
  private worker: Worker | null = null;
  private listeners = new Set<Listener>();
  private pending = new Map<number, (v: any) => void>();
  private nextId = 1;
  state: ClientState = { s: null, running: false, speed: 2, version: 0 };

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => this.onMessage(e.data);
    w.onerror = (e) => this.set({ error: String(e.message ?? e) });
    this.worker = w;
    w.postMessage({ type: 'speed', daysPerSecond: SPEEDS[this.state.speed].days });
    return w;
  }

  private onMessage(m: any) {
    switch (m.type) {
      case 'snapshot':
        this.set({ s: m.state, running: m.running });
        break;
      case 'paused':
        this.set({ running: false, pausedReason: m.reason });
        break;
      case 'result':
      case 'data': {
        const r = this.pending.get(m.id);
        if (r) {
          this.pending.delete(m.id);
          r(m.type === 'result' ? m.result : m.data);
        }
        break;
      }
      case 'error':
        console.error('[sim]', m.message);
        this.set({ error: m.message });
        break;
    }
  }

  private set(p: Partial<ClientState>) {
    this.state = { ...this.state, ...p, version: this.state.version + 1 };
    for (const l of this.listeners) l();
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getState = () => this.state;

  newGame(seed: string) {
    this.ensure().postMessage({ type: 'new', seed });
  }

  load(json: string) {
    this.ensure().postMessage({ type: 'load', json });
  }

  setSpeed(i: number) {
    if (i <= 0) return this.pause();
    this.state = { ...this.state, speed: i };
    this.ensure().postMessage({ type: 'speed', daysPerSecond: SPEEDS[i].days });
    this.resume();
  }

  pause() {
    this.ensure().postMessage({ type: 'pause' });
    this.set({ running: false });
  }

  resume() {
    this.ensure().postMessage({ type: 'resume' });
    this.set({ running: true, pausedReason: undefined });
  }

  toggle() {
    if (this.state.running) this.pause();
    else this.resume();
  }

  step(days: number) {
    this.ensure().postMessage({ type: 'step', days });
  }

  private request<T>(msg: any): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve) => {
      this.pending.set(id, resolve);
      this.ensure().postMessage({ ...msg, id });
    });
  }

  command(cmd: Command): Promise<CommandResult> {
    return this.request<CommandResult>({ type: 'command', cmd });
  }

  stats(): Promise<StatsArchive | null> {
    return this.request({ type: 'getStats' });
  }

  history(): Promise<HistoryEntry[]> {
    return this.request({ type: 'getHistory' });
  }

  saveJson(): Promise<string | null> {
    return this.request({ type: 'getSave' });
  }

  clearError() {
    this.set({ error: undefined });
  }
}

export const client = new SimClient();

export function useClient<T>(sel: (c: ClientState) => T): T {
  return useSyncExternalStore(client.subscribe, () => sel(client.getState()));
}

export function useGame(): GameState | null {
  return useSyncExternalStore(client.subscribe, () => client.getState().s);
}

export async function run(cmd: Command, onError?: (msg: string) => void): Promise<CommandResult> {
  const r = await client.command(cmd);
  if (!r.ok) {
    if (onError) onError(r.error ?? 'Failed');
    else toast(r.error ?? 'Command failed', 'warn');
  }
  return r;
}

// ---------------------------------------------------------------------------
// Tiny toast bus
// ---------------------------------------------------------------------------
export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'warn' | 'crit' | 'ok';
}
let toastId = 1;
const toastListeners = new Set<(t: Toast) => void>();
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const t = { id: toastId++, text, kind };
  for (const l of toastListeners) l(t);
}
export function onToast(l: (t: Toast) => void) {
  toastListeners.add(l);
  return () => {
    toastListeners.delete(l);
  };
}
