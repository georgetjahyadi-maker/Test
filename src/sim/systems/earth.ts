// Earth: national economies, demography, climate, energy and launch industry.
import type { GameState } from '../types';
import { clamp } from '../core/util';
import { mods } from './modifiers';
import { spaceGDP, earthGDP, addHistory, known } from './helpers';
import { BD, setExplain } from '../core/breakdown';
import { gaussian } from '../core/rng';

export function earthMonthly(s: GameState): void {
  const m = mods(s);
  const egdp = earthGDP(s);
  const sgdp = spaceGDP(s);
  const autoLevel = (s.events.flags.globalAutomation as number) ?? 1;
  const war = s.security.wars.length > 0 ? 1 : 0;
  const shock = m.gdpShock ?? 0;
  let totalPop = 0;
  for (const id of Object.keys(s.nations).sort()) {
    const n = s.nations[id];
    // Demographic transition: growth rates decline slowly toward a plateau
    const floorG = -0.004;
    n.popGrowth = n.popGrowth + (floorG - n.popGrowth) * (0.012 / 12);
    n.population *= 1 + n.popGrowth / 12;
    totalPop += n.population;
    // Economic growth: convergence, climate, automation and space spillovers
    const perCap = n.gdp / n.population;
    const convergence = clamp(0.02 * Math.log(60000 / Math.max(2000, perCap)), -0.01, 0.03);
    const climate = -Math.max(0, s.earth.climateStress - 0.3) * 0.015;
    const automation = (autoLevel - 1) * 0.0025;
    const spill = Math.min(0.01, (sgdp / Math.max(1, egdp)) * 0.04);
    const drag = -(m.gdpDrag ?? 0);
    const warHit = war && s.security.wars.some((w) => w.a === id || w.b === id) ? -0.04 : 0;
    const g = n.baseGrowth * 0.35 + convergence + climate + automation + spill + drag + shock + warHit + gaussian(s, 'economy') * 0.002;
    n.gdpGrowth = n.gdpGrowth * 0.9 + g * 0.1;
    n.gdp *= 1 + n.gdpGrowth / 12;
    n.science *= 1 + (n.gdpGrowth * 0.9 + 0.004) / 12;
    n.energyTW *= 1 + (n.gdpGrowth * 0.5) / 12;
    if (n.member) n.spaceFunds += (n.gdp * n.spaceBudgetShare) / 12;
    // Unemployment responds to automation and transition support
    const target = 0.045 + Math.max(0, autoLevel - 2) * 0.025 * (1 + (m.automationUnrest ?? 0)) - spill * 2;
    n.unemployment += (clamp(target, 0.02, 0.35) - n.unemployment) * 0.03;
    n.stability = clamp(n.stability + (0.7 - n.stability) * 0.01 - Math.max(0, n.unemployment - 0.08) * 0.02 - warHit * 0.5 + (n.gdpGrowth - 0.01) * 0.1, 0.1, 1);
  }
  // Climate & energy
  const years = s.day / 365.25;
  const cleanTarget = clamp(0.55 + years * 0.004 + (m.climateMitigation ?? 0) * 0.1, 0, 1);
  s.earth.cleanShare += (cleanTarget - s.earth.cleanShare) * 0.02;
  const beamShare = s.earth.energyDemandTW > 0 ? s.earth.beamedTW / s.earth.energyDemandTW : 0;
  const clean = clamp(s.earth.cleanShare + beamShare, 0, 1);
  const forcing = 0.012 * (1 - clean) - 0.004 - 0.006 * (m.climateMitigation ?? 0) - (known(s, 'fusion_power') ? 0.003 : 0);
  s.earth.climateStress = clamp(s.earth.climateStress + forcing / 12, 0, 1.5);
  s.earth.energyDemandTW = 32 * Math.pow(Math.max(1, egdp) / 2.1e14, 0.6);
  const cb = new BD('index', 'Climate stress: 1.0 is a catastrophic threshold.');
  cb.add('Emissions forcing (non-clean share)', 0.012 * (1 - clean) * 12);
  cb.add('Natural drawdown & adaptation', -0.004 * 12);
  cb.add('Climate policy', -0.006 * (m.climateMitigation ?? 0) * 12);
  cb.add('Fusion displacement', known(s, 'fusion_power') ? -0.036 : 0);
  cb.note = `Current stress ${s.earth.climateStress.toFixed(3)}. Annual change shown below.`;
  setExplain(s, 'earth.climate', cb, s.earth.climateStress);
  if (s.earth.climateStress > 0.8 && !s.events.flags.climateWarned) {
    s.events.flags.climateWarned = true;
    addHistory(s, 'Climate emergency declared', 'Cascading heat waves, crop failures and sea-level surges push Earth\'s climate system toward tipping points.', 'disaster', 4);
  }
  void totalPop;
}

/** Leadership turnover and ideological drift. */
export function nationsLeadership(s: GameState, changeLeader: (nationId: string) => void): void {
  for (const id of Object.keys(s.nations).sort()) {
    const n = s.nations[id];
    if (s.day >= n.nextLeadershipDay) {
      n.nextLeadershipDay = s.day + Math.round(n.leadershipCycle * 365.25);
      changeLeader(id);
    }
  }
}
