// Time-series archive: monthly (recent 20 years) and yearly (whole campaign).
import type { GameState } from '../types';
import { offworldPopulation, earthPopulation, earthGDP, spaceGDP, settlementList, popOf } from './helpers';
import { monthIndex, civilFromDay } from '../core/time';
import { interceptedFraction } from './milestones';

export const SERIES: { key: string; label: string; unit: string; group: string }[] = [
  { key: 'population', label: 'Total population', unit: 'people', group: 'Population' },
  { key: 'earthPop', label: 'Earth population', unit: 'people', group: 'Population' },
  { key: 'offworldPop', label: 'Off-world population', unit: 'people', group: 'Population' },
  { key: 'settlements', label: 'Settlements', unit: 'count', group: 'Population' },
  { key: 'earthGDP', label: 'Earth GDP', unit: 'cr/yr', group: 'Economy' },
  { key: 'spaceGDP', label: 'Off-world GDP', unit: 'cr/yr', group: 'Economy' },
  { key: 'treasury', label: 'UNE treasury', unit: 'cr', group: 'UNE' },
  { key: 'debt', label: 'UNE debt', unit: 'cr', group: 'UNE' },
  { key: 'legitimacy', label: 'Federal legitimacy', unit: '0-1', group: 'UNE' },
  { key: 'stateSupport', label: 'State support', unit: '0-1', group: 'UNE' },
  { key: 'citizenSupport', label: 'Citizen support', unit: '0-1', group: 'UNE' },
  { key: 'polarization', label: 'Polarization', unit: '0-1', group: 'UNE' },
  { key: 'research', label: 'Research output', unit: 'RP/yr', group: 'Science' },
  { key: 'techs', label: 'Technologies known', unit: 'count', group: 'Science' },
  { key: 'launchPrice', label: 'Earth launch price', unit: 'cr/t', group: 'Logistics' },
  { key: 'launchCapacity', label: 'Earth launch capacity', unit: 't/yr', group: 'Logistics' },
  { key: 'freight', label: 'Freight delivered', unit: 't/yr', group: 'Logistics' },
  { key: 'offworldPower', label: 'Off-world generation', unit: 'W', group: 'Energy' },
  { key: 'swarmPower', label: 'Helios swarm power', unit: 'W', group: 'Energy' },
  { key: 'collectors', label: 'Active collectors', unit: 'count', group: 'Energy' },
  { key: 'capture', label: 'Solar luminosity intercepted', unit: 'fraction', group: 'Energy' },
  { key: 'closure', label: 'Best industrial closure', unit: '0-1', group: 'Industry' },
  { key: 'industry', label: 'Off-world industrial output', unit: 't/yr', group: 'Industry' },
  { key: 'climate', label: 'Climate stress', unit: 'index', group: 'Earth' },
  { key: 'debris', label: 'Debris risk', unit: '0-1', group: 'Earth' },
  { key: 'aiRisk', label: 'AI risk', unit: '0-1', group: 'Security' },
  { key: 'tension', label: 'International tension', unit: '0-1', group: 'Security' },
];

export function initStats(s: GameState): void {
  s.stats = { yearlyStart: 2048, yearly: {}, monthlyStart: 0, monthly: {} };
  for (const k of SERIES) {
    s.stats.yearly[k.key] = [];
    s.stats.monthly[k.key] = [];
  }
  recordStats(s, true);
}

function snapshot(s: GameState): Record<string, number> {
  const off = offworldPopulation(s);
  const ep = earthPopulation(s);
  let freight = 0;
  for (const r of Object.values(s.routes)) freight += r.stats.deliveredYear;
  let power = 0, closure = 0, industry = 0;
  for (const st of settlementList(s)) {
    power += st.energy.gen * 1e6;
    if (popOf(st) > 100) closure = Math.max(closure, st.closure);
    for (const g in st.production) industry += st.production[g] * 12;
  }
  let techs = 0;
  for (const id in s.tech) if (s.tech[id].known) techs++;
  const fs: Record<string, number> = {};
  for (const f of Object.values(s.factions)) fs['faction:' + f.id] = f.active ? f.support : 0;
  return {
    population: off + ep,
    earthPop: ep,
    offworldPop: off,
    settlements: Object.keys(s.settlements).length,
    earthGDP: earthGDP(s),
    spaceGDP: spaceGDP(s),
    treasury: s.une.treasury,
    debt: s.une.debt,
    legitimacy: s.une.metrics.legitimacy ?? 0,
    stateSupport: s.une.metrics.stateSupport ?? 0,
    citizenSupport: s.une.metrics.citizenSupport ?? 0,
    polarization: s.une.metrics.polarization ?? 0,
    research: s.research.rpLastYear,
    techs,
    launchPrice: s.earth.launchPrice,
    launchCapacity: s.earth.launchCapacity,
    freight,
    offworldPower: power,
    swarmPower: s.swarm.totalPowerW,
    collectors: s.swarm.totalCollectors,
    capture: interceptedFraction(s),
    closure,
    industry,
    climate: s.earth.climateStress,
    debris: s.earth.debrisRisk,
    aiRisk: s.security.aiRisk,
    tension: s.security.tension,
    ...fs,
  };
}

export function recordStats(s: GameState, force = false): void {
  const snap = snapshot(s);
  const mi = monthIndex(s.day);
  if (s.stats.monthly.population?.length === 0) s.stats.monthlyStart = mi;
  for (const k in snap) {
    const arr = (s.stats.monthly[k] ??= []);
    arr.push(round(snap[k]));
    if (arr.length > 240) arr.shift();
  }
  const firstLen = s.stats.monthly.population?.length ?? 0;
  s.stats.monthlyStart = mi - firstLen + 1;
  const c = civilFromDay(s.day);
  if (c.m === 1 || force) {
    const idx = c.y - s.stats.yearlyStart;
    for (const k in snap) {
      const arr = (s.stats.yearly[k] ??= []);
      while (arr.length < idx) arr.push(arr.length ? arr[arr.length - 1] : 0);
      arr[idx] = round(snap[k]);
    }
  }
}

function round(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (Math.abs(x) >= 1000) return Math.round(x);
  return Math.round(x * 10000) / 10000;
}
