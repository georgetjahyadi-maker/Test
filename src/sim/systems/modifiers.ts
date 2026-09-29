// Aggregates modifiers from enacted laws, known technologies, grand projects
// and temporary event effects.
import type { GameState } from '../types';
import { LAW } from '../content/laws';
import { TECH } from '../content/techs';
import { GRAND_PROJECT } from '../content/misc';

const DEFAULTS: Record<string, number> = {
  assessmentRate: 0.0004,
  licensingMult: 0,
  royaltyRate: 0,
  commercialLevy: 0,
  corporateTax: 0,
  directTax: 0,
  energyTax: 0,
  debtCeiling: 0,
  openSettlements: 0.3,
  corpInvestment: 0,
  researchCommons: 0,
  corpRnD: 0,
  replication: 0,
  mercuryCap: 0,
  automationMax: 1,
  lsWater: 0.93,
  lsOxygen: 0.45,
  launchCost: 0,
  launchCapacity: 0,
  freightCost: 0,
  reliability: 0,
  researchMult: 0,
};

interface Cache {
  day: number;
  version: number;
  mods: Record<string, number>;
}

const cache = new WeakMap<GameState, Cache>();
let globalVersion = 0;

export function invalidateModifiers(): void {
  globalVersion++;
}

export function computeModifiers(s: GameState): Record<string, number> {
  const m: Record<string, number> = { ...DEFAULTS };
  const add = (k: string, v: number) => {
    m[k] = (m[k] ?? 0) + v;
  };
  for (const id in s.laws) {
    const law = LAW[id];
    if (!law?.modifiers) continue;
    for (const k in law.modifiers) add(k, law.modifiers[k]);
  }
  for (const id in s.tech) {
    if (!s.tech[id].known) continue;
    const t = TECH[id];
    if (!t?.effects) continue;
    for (const k in t.effects) add(k, t.effects[k]);
  }
  for (const gp of s.grandProjects) {
    if (gp.completedDay === undefined) continue;
    const def = GRAND_PROJECT[gp.defId];
    if (!def) continue;
    for (const k in def.modifiers) add(k, def.modifiers[k]);
  }
  const temp = (s.events.flags.tempMods ?? []) as { key: string; value: number; until: number }[];
  for (const t of temp) if (t.until > s.day) add(t.key, t.value);
  // Emergency powers boost federal capacity
  if (s.une.emergency) add('bureaucracy', 0.1);
  return m;
}

export function mods(s: GameState): Record<string, number> {
  const c = cache.get(s);
  if (c && c.day === s.day && c.version === globalVersion) return c.mods;
  const m = computeModifiers(s);
  cache.set(s, { day: s.day, version: globalVersion, mods: m });
  return m;
}

export function mod(s: GameState, key: string): number {
  return mods(s)[key] ?? 0;
}

export function addTempMod(s: GameState, key: string, value: number, days: number): void {
  const list = ((s.events.flags.tempMods ??= []) as { key: string; value: number; until: number }[]);
  list.push({ key, value, until: s.day + days });
  // prune
  s.events.flags.tempMods = list.filter((t) => t.until > s.day);
  invalidateModifiers();
}
