// Corporate accounting, taxation, valuation, distress and new-firm formation.
import type { GameState, Corporation } from '../types';
import { FACILITY } from '../content/facilities';
import { clamp, nextId } from '../core/util';
import { weightedPick, rand, pick } from '../core/rng';
import { mods } from './modifiers';
import { credit, debit, addHistory, settlementList } from './helpers';
import { makeCharacter } from './characters';
import { designStats } from './designs';

export function corporationsMonthly(s: GameState): void {
  for (const id of Object.keys(s.corporations).sort()) {
    const c = s.corporations[id];
    if (!c.alive) continue;
    const rate = 0.045 + (1 - c.reputation) * 0.05;
    const interest = c.debt * rate / 12;
    c.cash -= interest;
    c.profitYTD -= interest;
    // Automatic credit lines
    const limit = Math.max(2e9, c.valuation * 0.6);
    if (c.cash < 0) {
      const borrow = Math.min(-c.cash, Math.max(0, limit - c.debt));
      c.debt += borrow;
      c.cash += borrow;
    } else if (c.debt > 0 && c.cash > c.revenue * 0.3) {
      const repay = Math.min(c.debt, c.cash - c.revenue * 0.3);
      c.debt -= repay;
      c.cash -= repay;
    }
    if (c.cash < 0 || c.debt > limit * 1.05) c.distress += 1;
    else c.distress = Math.max(0, c.distress - 0.5);
  }
}

export function assetValue(s: GameState, corpId: string): number {
  let v = 0;
  for (const st of settlementList(s)) {
    for (const f of st.facilities) if (f.owner === corpId) v += (FACILITY[f.type]?.buildCost ?? 0) * f.count * f.condition;
  }
  for (const f of Object.values(s.fleets)) {
    if (f.owner !== corpId) continue;
    const d = s.designs[f.designId];
    if (d) v += designStats(s, d).cost * f.count * f.condition;
  }
  return v;
}

export function corporationsAnnual(s: GameState): void {
  const m = mods(s);
  let totalVal = 0;
  const alive = Object.keys(s.corporations).sort().map((k) => s.corporations[k]).filter((c) => c.alive);
  for (const c of alive) {
    c.revenue = c.revenueYTD;
    c.profit = c.profitYTD;
    c.revenueYTD = 0;
    c.profitYTD = 0;
    // Federal corporate tax
    const tax = (m.corporateTax ?? 0) * Math.max(0, c.profit);
    if (tax > 0) {
      debit(s, c.id, tax, 'Corporate tax');
      credit(s, 'une', tax, 'Corporate tax');
    }
    const assets = assetValue(s, c.id);
    c.valuation = Math.max(5e8, Math.max(0, c.profit) * 11 + assets * 0.7 + c.cash - c.debt);
    totalVal += c.valuation;
    let jobs = 0;
    for (const st of settlementList(s)) for (const f of st.facilities) if (f.owner === c.id) {
      const def = FACILITY[f.type];
      for (const k in def.jobs) jobs += ((def.jobs as any)[k] ?? 0) * f.count;
    }
    c.workforce = 15000 + jobs * 8;
  }
  for (const c of alive) {
    const share = totalVal > 0 ? c.valuation / totalVal : 0;
    c.influence = clamp(c.influence * 0.7 + (0.08 + share * 1.2) * 0.3, 0, 1);
    c.reputation = clamp(c.reputation + (0.65 - c.reputation) * 0.05 - (c.distress > 3 ? 0.05 : 0), 0.05, 1);
  }
}

export function spawnCorporation(s: GameState, sector: string, name: string, focus: string[], home?: string): Corporation | undefined {
  if (Object.values(s.corporations).some((c) => c.name === name)) return undefined;
  const nations = Object.keys(s.nations).sort().map((k) => s.nations[k]);
  const homeId = home ?? weightedPick(s, 'corps', nations, (n) => n.gdp)?.id ?? null;
  const structure = pick(s, 'corps', ['public', 'public', 'family', 'cooperative', 'ppp', 'mutual']);
  const palette = ['#7fd1b9', '#f6ae2d', '#86bbd8', '#f26419', '#c4a1ff', '#9bc53d', '#e55934', '#5bc0eb', '#fde74c', '#c3423f'];
  const c: Corporation = {
    id: nextId(s, 'corp'),
    name,
    short: name.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase(),
    sector,
    home: homeId,
    structure,
    color: pick(s, 'corps', palette),
    cash: 4e9 + rand(s, 'corps') * 1.6e10,
    debt: 0,
    valuation: 2e10,
    revenue: 0,
    profit: 0,
    revenueYTD: 0,
    profitYTD: 0,
    influence: 0.1,
    reputation: 0.6,
    workforce: 5000,
    techs: [],
    ceoId: '',
    founded: s.day,
    alive: true,
    riskAppetite: 0.4 + rand(s, 'corps') * 0.4,
    focus,
    distress: 0,
    description: `A ${sector} company founded in the wake of new technology.`,
  };
  s.corporations[c.id] = c;
  const ceo = makeCharacter(s, 'ceo', { nationId: homeId ?? undefined, roleRef: c.id, factionId: 'corporate', ageMin: 35, ageMax: 55 });
  c.ceoId = ceo.id;
  addHistory(s, `${name} founded`, `A new ${sector} corporation, ${name}, raises capital to pursue opportunities opened by new technology.`, 'corporate', 1, [c.id]);
  return c;
}

/** Liquidate or transfer the assets of a failed company. */
export function dissolveCorporation(s: GameState, corpId: string, successor: string, how: 'bankruptcy' | 'merger' | 'nationalized'): void {
  const c = s.corporations[corpId];
  if (!c) return;
  c.alive = false;
  for (const st of settlementList(s)) {
    for (const f of st.facilities) if (f.owner === corpId) f.owner = successor;
    for (const p of st.construction) if (p.owner === corpId) p.owner = successor;
    if (st.sponsors[corpId]) {
      st.sponsors[successor] = (st.sponsors[successor] ?? 0) + st.sponsors[corpId];
      delete st.sponsors[corpId];
    }
  }
  for (const f of Object.values(s.fleets)) if (f.owner === corpId) f.owner = successor;
  for (const r of Object.values(s.routes)) if (r.owner === corpId) r.owner = successor;
  for (const t of Object.values(s.tech)) if (t.owner === corpId) t.owner = how === 'merger' && s.corporations[successor] ? successor : undefined;
  const succ = s.corporations[successor];
  if (succ) {
    succ.cash += Math.max(0, c.cash);
    succ.debt += c.debt;
  }
}
