// The simulation scheduler. One call to stepDay advances the world one day.
import type { GameState } from './types';
import { civilFromDay } from './core/time';
import { settlementsMonthly, explainSettlement } from './systems/settlements';
import { logisticsDaily, logisticsMonthly } from './systems/logistics';
import { marketsMonthly } from './systems/markets';
import { earthMonthly, nationsLeadership } from './systems/earth';
import { researchMonthly } from './systems/research';
import { corporationsMonthly, corporationsAnnual } from './systems/corporations';
import { uneMonthly, uneAnnual } from './systems/une';
import { politicsMonthly, runAssemblyElection } from './systems/politics';
import { legislatureDaily } from './systems/legislature';
import { securityMonthly } from './systems/security';
import { dysonMonthly } from './systems/dyson';
import { eventsDaily, eventsMonthly, registerEvents } from './systems/events';
import { milestonesMonthly } from './systems/milestones';
import { recordStats } from './systems/stats';
import { charactersAnnual } from './systems/characters';
import { grandProjectsMonthly } from './systems/projects';
import { nationsQuarterly, corporationsQuarterly, localGovernmentsMonthly, changeNationLeader } from './ai/actors';
import { advisorMonthly } from './ai/advisor';
import { EVENTS } from './content/events';
import { settlementList, earthGDP, popOf, addHistory, offworldPopulation, earthPopulation, spaceGDP } from './systems/helpers';
import { BD, setExplain } from './core/breakdown';
import { known } from './systems/helpers';

registerEvents(EVENTS);

export function stepDay(s: GameState): void {
  if (s.gameOver) return;
  s.day += 1;
  logisticsDaily(s);
  legislatureDaily(s);
  eventsDaily(s);
  if (s.day >= s.une.nextElection) runAssemblyElection(s);
  const c = civilFromDay(s.day);
  if (c.d === 1) monthlyTick(s, c.m);
}

export function monthlyTick(s: GameState, month: number): void {
  settlementsMonthly(s);
  logisticsMonthly(s);
  marketsMonthly(s);
  earthMonthly(s);
  researchMonthly(s);
  corporationsMonthly(s);
  uneMonthly(s);
  politicsMonthly(s);
  securityMonthly(s);
  dysonMonthly(s);
  grandProjectsMonthly(s);
  localGovernmentsMonthly(s);
  advisorMonthly(s);
  eventsMonthly(s);
  milestonesMonthly(s);
  globalIndicators(s);
  recordStats(s);
  if (month === 1 || month === 4 || month === 7 || month === 10) {
    nationsQuarterly(s);
    corporationsQuarterly(s);
    nationsLeadership(s, (id) => changeNationLeader(s, id));
  }
  if (month === 1) {
    uneAnnual(s);
    corporationsAnnual(s);
    charactersAnnual(s);
  }
  checkFailures(s);
}

function globalIndicators(s: GameState): void {
  let auto = 1;
  if (known(s, 'autonomous_robotics')) auto += 0.6;
  if (known(s, 'industrial_ai')) auto += 0.9;
  if (known(s, 'self_maintaining_systems')) auto += 0.9;
  if (known(s, 'partial_self_replication')) auto += 0.9;
  if (known(s, 'self_replicating_industry')) auto += 0.9;
  const prev = (s.events.flags.globalAutomation as number) ?? 1;
  s.events.flags.globalAutomation = prev + (auto - prev) * 0.03;
  let u = 0, n = 0;
  for (const id in s.nations) {
    u += s.nations[id].unemployment;
    n++;
  }
  s.events.flags.globalUnemployment = n ? u / n : 0.05;
  // Top-bar explanations
  const pop = new BD('people', 'Humanity by location.');
  pop.add('Earth', earthPopulation(s));
  for (const st of settlementList(s)) {
    const p = popOf(st);
    if (p >= 1) pop.add(st.name, p, st.id);
  }
  setExplain(s, 'top.population', pop);
  const gdp = new BD('cr/yr', 'Economic output.');
  gdp.add('Earth (member states)', earthGDP(s));
  gdp.add('Off-world settlements', spaceGDP(s));
  setExplain(s, 'top.gdp', gdp);
  const en = new BD('W', 'Civilization power use.');
  en.add('Earth primary energy', s.earth.energyDemandTW * 1e12);
  let off = 0;
  for (const st of settlementList(s)) off += st.energy.gen * 1e6;
  en.add('Off-world generation', off);
  en.add('Helios swarm (not beamed to Earth)', Math.max(0, s.swarm.totalPowerW - s.earth.beamedTW * 1e12));
  setExplain(s, 'top.energy', en);
  let ind = 0;
  const ib = new BD('t/yr', 'Off-world industrial output by settlement (all goods).');
  for (const st of settlementList(s)) {
    let t = 0;
    for (const g in st.production) t += st.production[g] * 12;
    ind += t;
    if (t > 0) ib.add(st.name, t, st.id);
  }
  setExplain(s, 'top.industry', ib);
  for (const st of settlementList(s)) explainSettlement(s, st);
  const peak = Math.max((s.events.flags.peakGDP as number) ?? 0, earthGDP(s));
  s.events.flags.peakGDP = peak;
  void offworldPopulation;
  void ind;
}

function checkFailures(s: GameState): void {
  if (s.gameOver) return;
  if (s.earth.climateStress >= 1.2) {
    s.gameOver = { day: s.day, title: 'Catastrophic Ecological Collapse', reason: 'Earth\'s climate crossed irreversible tipping points. Agriculture failed across the tropics and the global economy collapsed.' };
  }
  const peak = (s.events.flags.peakGDP as number) ?? 0;
  if (!s.gameOver && peak > 0 && earthGDP(s) < peak * 0.35) {
    s.gameOver = { day: s.day, title: 'Irreversible Economic Collapse', reason: 'Earth\'s economy lost two-thirds of its output. The industrial base that supported expansion into space has broken down.' };
  }
  if (s.gameOver) addHistory(s, s.gameOver.title, s.gameOver.reason, 'disaster', 5);
}
