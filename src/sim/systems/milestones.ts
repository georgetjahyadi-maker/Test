// Civilization milestones (informational, not mandatory victory conditions).
import type { GameState } from '../types';
import { MILESTONES, MILESTONE } from '../content/misc';
import { SITE } from '../content/sites';
import { settlementList, popOf, offworldPopulation, spaceGDP, earthGDP, facilityCount, addHistory, addAlert } from './helpers';
import { SOLAR_LUMINOSITY } from '../content/bodies';

export function milestoneChecks(s: GameState): Record<string, boolean> {
  const sts = settlementList(s);
  const region = (id: string) => SITE[s.settlements[id].siteId].region;
  const off = offworldPopulation(s);
  let prop = 0, marsPop = 0, beltMax = 0, fusion = 0, auto = 0;
  for (const st of sts) {
    const r = SITE[st.siteId].region;
    if (!st.flags.earthHub) prop += (st.production.propellant ?? 0) * 12;
    if (r === 'mars') marsPop += popOf(st);
    if (r === 'belt') beltMax = Math.max(beltMax, popOf(st));
    fusion += facilityCount(st, 'fusionPlant');
    auto += facilityCount(st, 'autoFactory');
  }
  const frac = s.swarm.totalPowerW / SOLAR_LUMINOSITY;
  const captureFrac = s.swarm.totalPowerW > 0 ? interceptedFraction(s) : 0;
  void region;
  return {
    une_lunar_base: sts.some((st) => st.founder === 'une' && SITE[st.siteId].region === 'luna' && SITE[st.siteId].kind === 'surface'),
    lunar_permanent: sts.some((st) => SITE[st.siteId].region === 'luna' && popOf(st) >= 1000 && st.pop.familiesAllowed),
    propellant_economy: prop >= 10000,
    first_offworld_birth: sts.some((st) => st.pop.localBorn >= 1),
    asteroid_mining: sts.some((st) => ['nea', 'belt'].includes(SITE[st.siteId].region) && st.facilities.some((f) => (f.type === 'asteroidMiner' || f.type === 'autoMiner') && f.utilization > 0.05)),
    mars_landing: sts.some((st) => SITE[st.siteId].body === 'mars' && SITE[st.siteId].kind === 'surface'),
    multiplanetary: marsPop >= 10000,
    independent_industry: sts.some((st) => st.closure >= 0.8 && popOf(st) >= 1000),
    million_offworld: off >= 1e6,
    fusion_age: fusion > 0,
    belt_capital: beltMax >= 1e5,
    solar_economy: spaceGDP(s) >= 0.1 * earthGDP(s),
    outer_system: sts.some((st) => ['jupiter', 'saturn', 'outer'].includes(SITE[st.siteId].region)),
    billion_offworld: off >= 1e9,
    autonomous_civilization: auto >= 1,
    first_collector: s.swarm.totalCollectors >= 1,
    million_collectors: s.swarm.totalCollectors >= 1e6,
    billion_collectors: s.swarm.totalCollectors >= 1e9,
    capture_0001: captureFrac >= 1e-4,
    capture_001: captureFrac >= 1e-3,
    capture_01: captureFrac >= 1e-2,
  };
  void frac;
}

/** Fraction of solar luminosity intercepted by the swarm's collecting area. */
export function interceptedFraction(s: GameState): number {
  let area = 0;
  for (const c of s.swarm.cohorts) {
    const d = s.swarm.designs[c.designId];
    if (!d) continue;
    const r = d.radiusAU * 1.495978707e11;
    area += (c.count * d.areaM2) / (4 * Math.PI * r * r);
  }
  return Math.min(1, area);
}

export function milestonesMonthly(s: GameState): void {
  const checks = milestoneChecks(s);
  for (const m of MILESTONES) {
    if (s.milestones[m.id] !== undefined) continue;
    if (!checks[m.id]) continue;
    s.milestones[m.id] = s.day;
    addHistory(s, `Milestone: ${m.name}`, m.description, 'milestone', m.era >= 5 ? 5 : 4);
    addAlert(s, 'info', `Milestone reached: ${m.name}`);
    s.events.flags.recentMilestone = ((s.events.flags.recentMilestone as number) ?? 0) + 1;
    s.events.flags.newMilestone = { id: m.id, day: s.day };
  }
}

export function currentEra(s: GameState): number {
  let era = 1;
  for (const id in s.milestones) {
    const m = MILESTONE[id];
    if (m && m.era > era) era = m.era;
  }
  return era;
}
