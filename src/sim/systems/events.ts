// Event engine: systemic and authored events with player decisions.
import type { GameState, EventInstance, CommandResult } from '../types';
import { rand } from '../core/rng';
import { nextId } from '../core/util';
import { addHistory } from './helpers';

export interface EventOption {
  id: string;
  label: string;
  desc: string;
  available?: (s: GameState, ctx: Record<string, any>) => string | null;
  effect: (s: GameState, ctx: Record<string, any>) => void;
  ai?: number;
}

export interface EventDef {
  id: string;
  category: string;
  once?: boolean;
  cooldownDays?: number;
  deadlineDays?: number;
  pause?: boolean;
  trigger: (s: GameState) => Record<string, any> | null;
  chance?: number | ((s: GameState, ctx: Record<string, any>) => number);
  title: (s: GameState, ctx: Record<string, any>) => string;
  text: (s: GameState, ctx: Record<string, any>) => string;
  options: (s: GameState, ctx: Record<string, any>) => EventOption[];
}

const REGISTRY: EventDef[] = [];
const BY_ID: Record<string, EventDef> = {};

export function registerEvents(defs: EventDef[]): void {
  for (const d of defs) {
    if (BY_ID[d.id]) continue;
    REGISTRY.push(d);
    BY_ID[d.id] = d;
  }
  REGISTRY.sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function eventDef(id: string): EventDef | undefined {
  return BY_ID[id];
}

export function eventsMonthly(s: GameState): void {
  if (s.gameOver) return;
  const ev = s.events;
  let fired = 0;
  for (const def of REGISTRY) {
    if (fired >= 3) break;
    if (def.once && ev.counts[def.id]) continue;
    const last = ev.lastFired[def.id];
    if (last !== undefined && def.cooldownDays && s.day - last < def.cooldownDays) continue;
    if (ev.pending.some((p) => p.defId === def.id)) continue;
    let ctx: Record<string, any> | null = null;
    try {
      ctx = def.trigger(s);
    } catch (e) {
      ctx = null;
    }
    if (!ctx) continue;
    const p = typeof def.chance === 'function' ? def.chance(s, ctx) : def.chance ?? 1;
    if (rand(s, 'events') >= p) continue;
    fire(s, def, ctx);
    fired++;
  }
}

export function fire(s: GameState, def: EventDef, ctx: Record<string, any>): EventInstance {
  const inst: EventInstance = {
    id: nextId(s, 'ev'),
    defId: def.id,
    day: s.day,
    ctx,
    deadline: s.day + (def.deadlineDays ?? 90),
    title: def.title(s, ctx),
    text: def.text(s, ctx),
    category: def.category,
    options: def.options(s, ctx).map((o) => ({ id: o.id, label: o.label, desc: o.desc, disabled: o.available?.(s, ctx) ?? undefined })),
  };
  s.events.pending.push(inst);
  s.events.lastFired[def.id] = s.day;
  s.events.counts[def.id] = (s.events.counts[def.id] ?? 0) + 1;
  if (s.une.delegation.events) {
    const choice = aiChoice(s, inst);
    if (choice) resolveEvent(s, inst.id, choice, true);
  }
  return inst;
}

export function fireById(s: GameState, id: string, ctx: Record<string, any> = {}): EventInstance | undefined {
  const def = BY_ID[id];
  if (!def) return undefined;
  return fire(s, def, ctx);
}

export function aiChoice(s: GameState, inst: EventInstance): string | undefined {
  const def = BY_ID[inst.defId];
  if (!def) return inst.options[0]?.id;
  const opts = def.options(s, inst.ctx);
  let best: string | undefined;
  let bv = -Infinity;
  for (const o of opts) {
    if (o.available?.(s, inst.ctx)) continue;
    const w = (o.ai ?? 1) + rand(s, 'advisor') * 0.2;
    if (w > bv) {
      bv = w;
      best = o.id;
    }
  }
  return best;
}

export function resolveEvent(s: GameState, instanceId: string, optionId: string, auto = false): CommandResult {
  const idx = s.events.pending.findIndex((p) => p.id === instanceId);
  if (idx < 0) return { ok: false, error: 'This decision is no longer pending.' };
  const inst = s.events.pending[idx];
  const def = BY_ID[inst.defId];
  if (!def) {
    s.events.pending.splice(idx, 1);
    return { ok: true };
  }
  const opt = def.options(s, inst.ctx).find((o) => o.id === optionId);
  if (!opt) return { ok: false, error: 'Unknown option.' };
  const why = opt.available?.(s, inst.ctx);
  if (why) return { ok: false, error: why };
  s.events.pending.splice(idx, 1);
  try {
    opt.effect(s, inst.ctx);
  } catch (e) {
    // effects must never crash the simulation
  }
  if (def.category !== 'flavor') addHistory(s, inst.title, `${auto ? 'The Secretariat decided' : 'Decision'}: ${opt.label}. ${opt.desc}`, `decision:${def.category}`, 1, [inst.id]);
  return { ok: true };
}

export function eventsDaily(s: GameState): void {
  if (s.events.pending.length === 0) return;
  for (const inst of [...s.events.pending]) {
    if (s.day >= inst.deadline) {
      const choice = aiChoice(s, inst) ?? inst.options[0]?.id;
      if (choice) resolveEvent(s, inst.id, choice, true);
      else s.events.pending = s.events.pending.filter((p) => p.id !== inst.id);
    }
  }
}
