import type { GameState, Settlement, HistoryEntry, SiteDef, RegionId, Stock } from '../types';
import { SITE } from '../content/sites';
import { BODY } from '../content/bodies';
import { FACILITY } from '../content/facilities';
import { nextId } from '../core/util';
import { mod } from './modifiers';
import { NATION } from '../content/actors';

export function known(s: GameState, techId: string | undefined): boolean {
  if (!techId) return true;
  return !!s.tech[techId]?.known;
}

export function usable(s: GameState, actor: string, techId: string | undefined): boolean {
  if (!techId) return true;
  const t = s.tech[techId];
  if (!t?.known) return false;
  if (!t.owner) return true;
  if (t.owner === actor) return true;
  if (t.licensees?.includes(actor)) return true;
  if (mod(s, 'compulsoryLicensing') > 0) return true;
  return false;
}

export function siteOf(st: Settlement): SiteDef {
  return SITE[st.siteId];
}

export function regionOf(st: Settlement): RegionId {
  return SITE[st.siteId].region;
}

export function nodeOf(st: Settlement): string {
  return SITE[st.siteId].node;
}

export function bodyOf(st: Settlement) {
  return BODY[SITE[st.siteId].body];
}

export function popOf(st: Settlement): number {
  let t = 0;
  for (const b of st.pop.bands) t += b;
  return t;
}

export function offworldPopulation(s: GameState): number {
  let t = 0;
  for (const id in s.settlements) t += popOf(s.settlements[id]);
  return t;
}

export function earthPopulation(s: GameState): number {
  let t = 0;
  for (const id in s.nations) t += s.nations[id].population;
  return t;
}

export function earthGDP(s: GameState): number {
  let t = 0;
  for (const id in s.nations) t += s.nations[id].gdp;
  return t;
}

export function spaceGDP(s: GameState): number {
  let t = 0;
  for (const id in s.settlements) t += s.settlements[id].economy.gdp;
  return t;
}

export function settlementList(s: GameState): Settlement[] {
  return Object.keys(s.settlements)
    .sort()
    .map((k) => s.settlements[k]);
}

export function facilityCount(st: Settlement, type: string): number {
  let n = 0;
  for (const f of st.facilities) if (f.type === type) n += f.count;
  return n;
}

export function facilityCountOwned(st: Settlement, type: string, owner: string): number {
  let n = 0;
  for (const f of st.facilities) if (f.type === type && f.owner === owner) n += f.count;
  return n;
}

export function pendingCount(st: Settlement, type: string): number {
  let n = 0;
  for (const p of st.construction) if (p.type === type) n += p.count;
  return n;
}

export function tierOf(pop: number): string {
  if (pop < 100) return 'Outpost';
  if (pop < 1000) return 'Base';
  if (pop < 10000) return 'Permanent Settlement';
  if (pop < 1e6) return 'City';
  if (pop < 1e8) return 'Metropolis';
  return 'Planetary Society';
}

export const STATUS_LABEL: Record<string, string> = {
  outpost: 'Research Outpost',
  territory: 'Federal Extraterrestrial Territory',
  selfGoverning: 'Self-Governing Territory',
  commonwealth: 'Autonomous Commonwealth',
  member: 'Full UNE Member',
  associated: 'Independent Associated State',
  independent: 'Independent State',
};

export const STATUS_ORDER = ['outpost', 'territory', 'selfGoverning', 'commonwealth', 'member', 'associated', 'independent'];

export function actorName(s: GameState, id: string): string {
  if (id === 'une') return s.une.short;
  if (s.nations[id]) return s.nations[id].short;
  if (s.corporations[id]) return s.corporations[id].name;
  if (s.settlements[id]) return s.settlements[id].name;
  if (NATION[id]) return NATION[id].short;
  return id;
}

export function actorKind(s: GameState, id: string): 'une' | 'nation' | 'corp' | 'settlement' | 'unknown' {
  if (id === 'une') return 'une';
  if (s.nations[id]) return 'nation';
  if (s.corporations[id]) return 'corp';
  if (s.settlements[id]) return 'settlement';
  return 'unknown';
}

/** Actor pays money. Returns amount actually paid. */
export function debit(s: GameState, actor: string, amount: number, category: string): number {
  if (!(amount > 0)) return 0;
  if (actor === 'une') {
    s.une.treasury -= amount;
    s.une.expenseYTD[category] = (s.une.expenseYTD[category] ?? 0) + amount;
    return amount;
  }
  const n = s.nations[actor];
  if (n) {
    n.spaceFunds -= amount;
    return amount;
  }
  const c = s.corporations[actor];
  if (c) {
    c.cash -= amount;
    c.profitYTD -= amount;
    return amount;
  }
  const st = s.settlements[actor];
  if (st) {
    st.economy.treasury -= amount;
    return amount;
  }
  return 0;
}

export function credit(s: GameState, actor: string, amount: number, category: string): void {
  if (!(amount > 0)) return;
  if (actor === 'une') {
    s.une.treasury += amount;
    s.une.revenueYTD[category] = (s.une.revenueYTD[category] ?? 0) + amount;
    return;
  }
  const n = s.nations[actor];
  if (n) {
    n.spaceFunds += amount;
    return;
  }
  const c = s.corporations[actor];
  if (c) {
    c.cash += amount;
    c.revenueYTD += amount;
    c.profitYTD += amount;
    return;
  }
  const st = s.settlements[actor];
  if (st) st.economy.treasury += amount;
}

export function capitalCost(s: GameState, actor: string, amount: number, category: string): void {
  // Capital spending: not counted against corporate operating profit
  if (!(amount > 0)) return;
  const c = s.corporations[actor];
  if (c) {
    c.cash -= amount;
    return;
  }
  debit(s, actor, amount, category);
}

export function actorFunds(s: GameState, actor: string): number {
  if (actor === 'une') return s.une.treasury;
  if (s.nations[actor]) return s.nations[actor].spaceFunds;
  if (s.corporations[actor]) return s.corporations[actor].cash;
  if (s.settlements[actor]) return s.settlements[actor].economy.treasury;
  return 0;
}

export function addHistory(
  s: GameState,
  title: string,
  text: string,
  category: string,
  significance = 2,
  refs: string[] = [],
  causes: string[] = [],
): HistoryEntry {
  const e: HistoryEntry = { id: nextId(s, 'h'), day: s.day, title, text, category, significance, refs, causes };
  s.history.push(e);
  return e;
}

export function addAlert(s: GameState, severity: 'info' | 'warn' | 'crit', text: string, ref?: string): void {
  s.alerts.push({ id: nextId(s, 'a'), day: s.day, severity, text, ref });
  if (s.alerts.length > 80) s.alerts.splice(0, s.alerts.length - 80);
}

export function maxStorage(st: Settlement): number {
  return st.storageCap;
}

export function stockValue(s: GameState, st: Settlement, goods: Stock): number {
  let v = 0;
  const m = s.markets[regionOf(st)];
  for (const g in goods) v += goods[g] * (m?.prices[g] ?? 0);
  return v;
}

export function facilityDef(type: string) {
  return FACILITY[type];
}

export function isUneSettlement(st: Settlement): boolean {
  return (st.sponsors.une ?? 0) >= 0.5 || st.founder === 'une';
}

export function mainSponsor(st: Settlement): string {
  let best = 'une', bv = -1;
  for (const k of Object.keys(st.sponsors).sort()) {
    if (st.sponsors[k] > bv) {
      bv = st.sponsors[k];
      best = k;
    }
  }
  return best;
}

export function isGoverned(st: Settlement): boolean {
  // Settlements whose own government manages their budget
  return st.status === 'selfGoverning' || st.status === 'commonwealth' || st.status === 'member' || st.status === 'associated' || st.status === 'independent';
}

export function isIndependent(st: Settlement): boolean {
  return st.status === 'independent' || st.status === 'associated';
}
