// The Secretariat advisor: automates UNE domains the player delegates.
// Also drives the UNE in headless balance runs.
import type { GameState } from '../types';
import { TECHS, TECH, techCost } from '../content/techs';
import { LAW } from '../content/laws';
import { SITE } from '../content/sites';
import { INSTITUTION } from '../content/actors';
import { popOf, settlementList, regionOf, isGoverned, isIndependent, offworldPopulation, STATUS_ORDER, known } from '../systems/helpers';
import { annualRevenue } from '../systems/politics';
import { scaleFor } from '../systems/une';
import { availableTechs } from '../systems/research';
import { lawAvailable, proposeBill, projectVote, lobby, pledge } from '../systems/legislature';
import { suggestFacilities, totalCost, aiFrontierOpen } from './planner';
import { invest, ensureSupply } from './actions';
import { foundingPlan, foundSettlement, grantStatus, statusRequirements } from '../systems/colonies';
import { currentEra } from '../systems/milestones';
import { civilFromDay } from '../core/time';
import { GRAND_PROJECT } from '../content/misc';
import { projectAvailability, startGrandProject } from '../systems/projects';
import { collectorStats } from '../systems/dyson';
import { CELL_TYPES, COLLECTOR_STRUCTURES, TRANSMISSION, REPAIR } from '../physics/dysonCalc';
import type { CollectorDesign } from '../types';
import { nextId } from '../core/util';
import { addHistory } from '../systems/helpers';

export function advisorMonthly(s: GameState): void {
  const d = s.une.delegation;
  if (d.budget) budgetAdvisor(s);
  if (d.research) researchAdvisor(s);
  if (d.logistics) logisticsAdvisor(s);
  if (d.construction) constructionAdvisor(s);
  const month = civilFromDay(s.day).m;
  if (d.construction && month === 3) {
    grandProjectAdvisor(s);
    collectorAdvisor(s);
  }
  if (d.expansion && month % 6 === 1) expansionAdvisor(s);
  if (d.legislation && month % 2 === 0) legislationAdvisor(s);
}

const CAPITAL_CATEGORIES = new Set(['Construction', 'Construction materials', 'Settlement founding', 'Shipbuilding', 'Planetary defense missions', 'Grand projects', 'Programs', 'Technology licenses', 'Cancelled projects', 'Debt repayment']);

/** Last year's federal accounts: revenue (without borrowing), spending, recurring operations and the balance. */
export function fiscal(s: GameState): { R: number; E: number; ops: number; surplus: number } {
  const u = s.une;
  const R = annualRevenue(s);
  let E = 0, ops = 0;
  const src = Object.keys(u.expenseLastYear).length ? u.expenseLastYear : u.expenseYTD;
  const k12 = src === u.expenseYTD ? 12 / Math.max(1, civilFromDay(s.day).m) : 1;
  for (const k in src) {
    const v = src[k] * k12;
    E += v;
    if (!k.startsWith('Agency:') && !CAPITAL_CATEGORIES.has(k)) ops += v;
  }
  return { R, E, ops, surplus: R - E };
}

export function budgetAdvisor(s: GameState): void {
  const u = s.une;
  const R = annualRevenue(s);
  let target = 0;
  for (const id of Object.keys(u.institutions).sort()) {
    const inst = u.institutions[id];
    if (!inst.active) continue;
    target += (INSTITUTION[id]?.baseFunding ?? 1e9) * scaleFor(s, id);
  }
  // Agencies get what is left after recurring operations (fleets, settlement support, subsidies)
  const f = fiscal(s);
  const room = Math.max(R * 0.3, Math.min(R * 0.72, R - f.ops * 1.05 - R * 0.08));
  const k = target > room ? room / target : 1;
  const rich = u.treasury > R * 0.6 ? 1.1 : u.treasury < R * 0.08 ? 0.92 : 1;
  for (const id of Object.keys(u.institutions).sort()) {
    const inst = u.institutions[id];
    if (!inst.active) continue;
    const base = (INSTITUTION[id]?.baseFunding ?? 1e9) * scaleFor(s, id);
    const boost = id === 'isd' ? (rich > 1 ? 1.35 : 1.1) : 1;
    u.funding[id] = base * k * rich * boost;
  }
  if (u.debt > 0 && u.treasury > R * 0.8) {
    const repay = Math.min(u.debt, u.treasury - R * 0.5);
    u.debt -= repay;
    u.treasury -= repay;
  }
}

const CATEGORY_WEIGHT: Record<string, number> = {
  manufacturing: 1.3, lifeSupport: 1.2, nuclear: 1.25, propulsion: 1.25, energy: 1.15, robotics: 1.2, orbital: 1.1, materials: 1.05,
  computing: 1.1, medicine: 0.95, astronomy: 0.85, security: 0.7, genetics: 0.75, communications: 0.85, megastructure: 1.5,
};

export function researchAdvisor(s: GameState): void {
  const q = s.research.queue.filter((id) => !s.tech[id]?.known);
  if (q.length >= 4) {
    s.research.queue = q;
    return;
  }
  const avail = availableTechs(s).filter((id) => !q.includes(id));
  avail.sort((a, b) => score(s, b) - score(s, a) || (a < b ? -1 : 1));
  for (const id of avail) {
    if (q.length >= 4) break;
    q.push(id);
  }
  s.research.queue = q;
}

function score(s: GameState, id: string): number {
  const t = TECH[id];
  const cost = techCost(t);
  let w = CATEGORY_WEIGHT[t.category] ?? 1;
  if (['isru_propellant', 'regolith_construction', 'surface_fission', 'molten_regolith_electrolysis', 'nuclear_thermal_propulsion', 'aerocapture', 'fusion_power', 'self_replicating_industry', 'dyson_collectors', 'partial_self_replication'].includes(id)) w *= 1.6;
  return w / Math.sqrt(cost);
}

export function logisticsAdvisor(s: GameState): void {
  const f = fiscal(s);
  const strained = f.surplus < 0 || s.une.debt > f.R * 0.5;
  const budgetTotal = strained ? Math.min(Math.max(0, s.une.treasury) * 0.1, 1e10) : Math.min(Math.max(0, s.une.treasury) * 0.25, 4e10);
  let budget = budgetTotal;
  const list = settlementList(s).filter((st) => !st.flags.earthHub && !isIndependent(st));
  list.sort((a, b) => (b.sponsors.une ?? 0) - (a.sponsors.une ?? 0) || popOf(b) - popOf(a));
  for (const st of list) {
    if (budget < 1e9) break;
    const uneShare = st.sponsors.une ?? 0;
    const critical = (st.lifeSupport.reserveDays.oxygen ?? 999) < 90 || (st.lifeSupport.reserveDays.food ?? 999) < 60 || (st.lifeSupport.reserveDays.water ?? 999) < 90;
    if (uneShare < 0.2 && !critical && st.founder !== 'une') continue;
    if (strained && !critical) continue;
    const r = ensureSupply(s, st, 'une', budget * 0.5);
    if (r.ok && !r.info) budget -= Math.min(budget, 3e9);
  }
}

export function constructionAdvisor(s: GameState): void {
  const R = annualRevenue(s);
  const reserve = R * 0.12;
  const f = fiscal(s);
  const essentialOnly = f.surplus < 0 || s.une.debt > R * 0.5;
  let projects = 0;
  const list = settlementList(s).filter((st) => (st.sponsors.une ?? 0) >= 0.3 && !isGoverned(st));
  list.sort((a, b) => popOf(b) - popOf(a));
  for (const st of list) {
    if (projects >= 3) break;
    if (st.construction.filter((p) => p.owner === 'une').length > 3 + popOf(st) / 5000) continue;
    const sug = suggestFacilities(s, st, 'une').filter((x) => !essentialOnly || x.priority >= 8);
    for (const sg of sug.slice(0, 3)) {
      const cost = totalCost(s, st, sg.type, sg.count);
      if (s.une.treasury - cost < reserve) continue;
      const r = invest(s, 'une', st, sg.type, sg.count);
      if (r.ok) {
        projects++;
        break;
      }
    }
  }
}

/** Grand projects worth starting, in order, with the condition that makes each one pay. */
const PROJECT_PRIORITY: { id: string; when: (s: GameState) => boolean }[] = [
  { id: 'pd_array', when: (s) => s.security.threats.length > 0 || s.day > 365 * 40 },
  { id: 'lunar_mass_driver_network', when: (s) => settlementList(s).some((st) => SITE[st.siteId].body === 'moon' && st.flags.collectorLimit === 'launch') || settlementList(s).filter((st) => SITE[st.siteId].body === 'moon').reduce((a, st) => a + popOf(st), 0) > 2e5 },
  { id: 'launch_loop', when: (s) => s.earth.launchDemandMonth > (s.earth.launchCapacity / 12) * 0.8 },
  { id: 'mercury_mass_driver_network', when: (s) => settlementList(s).some((st) => SITE[st.siteId].body === 'mercury' && st.facilities.some((f) => f.type === 'autoFactory' || f.type === 'collectorFactory')) },
  { id: 'sgl_telescope', when: () => true },
  { id: 'mars_shield', when: (s) => settlementList(s).filter((st) => SITE[st.siteId].body === 'mars').reduce((a, st) => a + popOf(st), 0) > 20000 },
  { id: 'orbital_ring', when: (s) => s.earth.launchDemandMonth > (s.earth.launchCapacity / 12) * 0.8 },
  { id: 'mars_elevator', when: (s) => settlementList(s).filter((st) => SITE[st.siteId].body === 'mars').reduce((a, st) => a + popOf(st), 0) > 100000 },
  { id: 'interstellar_probe', when: (s) => s.swarm.totalPowerW > 1e15 },
  { id: 'venus_sunshade', when: (s) => settlementList(s).some((st) => SITE[st.siteId].body === 'venus' && popOf(st) > 1000) },
];

/** Start one grand project a year when the federal budget can carry it comfortably. */
export function grandProjectAdvisor(s: GameState): void {
  const R = annualRevenue(s);
  const f = fiscal(s);
  if (f.surplus < R * 0.05 || s.une.debt > R * 0.25) return;
  if (s.grandProjects.some((g) => g.completedDay === undefined)) return;
  for (const p of PROJECT_PRIORITY) {
    const def = GRAND_PROJECT[p.id];
    if (!def || !p.when(s)) continue;
    if (def.cost > s.une.treasury * 0.8 || def.cost / Math.max(1, def.months / 12) > f.surplus * 0.8) continue;
    // Body-bound projects go to the largest settlement there
    let where: string | undefined;
    if (def.bodies) {
      const host = settlementList(s).filter((st) => def.bodies!.includes(SITE[st.siteId].body)).sort((a, b) => popOf(b) - popOf(a))[0];
      if (!host) continue;
      where = host.id;
    }
    if (!projectAvailability(s, p.id, where).ok) continue;
    if (startGrandProject(s, p.id, where).ok) return;
  }
}

/**
 * Keep the Secretariat's collector design current: every few years, try the combinations
 * the known technologies allow and adopt one that delivers clearly more energy over its
 * life per tonne of material. Player-made designs are left alone.
 */
export function collectorAdvisor(s: GameState): void {
  const sw = s.swarm;
  const cur = sw.activeDesign ? sw.designs[sw.activeDesign] : undefined;
  if (!cur || cur.owner !== 'une' || !/^Helios-/.test(cur.name)) return;
  if (s.day - cur.created < 365 * 5) return;
  const knownTech = (id: string) => !!s.tech[id]?.known;
  const score = (d: CollectorDesign) => {
    const cs = collectorStats(s, d);
    if (cs.errors.length || cs.techMissing.length) return 0;
    return ((cs.transmitted + cs.compute) * cs.lifetime) / Math.max(1, cs.mass);
  };
  let best = cur, bestScore = score(cur);
  for (const cell of Object.keys(CELL_TYPES)) {
    if (CELL_TYPES[cell].tech && !knownTech(CELL_TYPES[cell].tech!)) continue;
    for (const structure of Object.keys(COLLECTOR_STRUCTURES)) {
      if (COLLECTOR_STRUCTURES[structure].tech && !knownTech(COLLECTOR_STRUCTURES[structure].tech!)) continue;
      for (const transmission of ['microwave', 'laser']) {
        if (TRANSMISSION[transmission].tech && !knownTech(TRANSMISSION[transmission].tech!)) continue;
        for (const repair of Object.keys(REPAIR)) {
          if (REPAIR[repair].tech && !knownTech(REPAIR[repair].tech!)) continue;
          for (const radiusAU of [0.3, 0.5, 0.7]) {
            for (const radiatorRatio of [0.5, 1.5]) {
              const d: CollectorDesign = { ...cur, cell, structure, transmission, repair, radiusAU, radiatorRatio, stationKeeping: 'sail' };
              const sc = score(d);
              if (sc > bestScore) {
                best = d;
                bestScore = sc;
              }
            }
          }
        }
      }
    }
  }
  if (best === cur || bestScore < score(cur) * 1.15) return;
  const n = Object.values(sw.designs).filter((d) => d.owner === 'une' && /^Helios-/.test(d.name)).length + 1;
  const numeral = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n - 1] ?? String(n);
  const d: CollectorDesign = { ...best, id: nextId(s, 'col'), name: `Helios-${numeral}`, created: s.day };
  sw.designs[d.id] = d;
  sw.activeDesign = d.id;
  addHistory(s, `${d.name} collector adopted`, `The Secretariat moves Helios production to the ${d.name}: ${CELL_TYPES[d.cell].name.toLowerCase()} on ${COLLECTOR_STRUCTURES[d.structure].name.toLowerCase()} at ${d.radiusAU} AU, beaming by ${TRANSMISSION[d.transmission].name.toLowerCase()}.`, 'dyson', 2);
}

const EXPANSION_ORDER = [
  'luna_tranquillitatis', 'eml1', 'luna_procellarum', 'nea_ryugu', 'mars_orbit', 'mars_arcadia', 'phobos', 'eml5', 'luna_daedalus', 'mars_jezero', 'ceres', 'nea_amun', 'mercury_prokofiev', 'mercury_caloris', 'vesta', 'psyche', 'venus_clouds', 'callisto', 'titan', 'mercury_orbit', 'ceres_orbit', 'saturn_orbit', 'uranus_orbit', 'ganymede', 'mars_hellas', 'mars_nili', 'triton', 'pluto',
];

export function expansionAdvisor(s: GameState): void {
  const R = annualRevenue(s);
  if (s.une.treasury < R * 0.3) return;
  // Only expand what the budget can keep alive
  const f = fiscal(s);
  if (f.surplus < R * 0.05 || s.une.debt > R * 0.25) return;
  // One new UNE settlement at a time, and none while an existing one is struggling
  const last = (s.events.flags.lastUneFounding as number) ?? -Infinity;
  if (s.day - last < 365 * 3) return;
  const mine = settlementList(s).filter((st) => st.founder === 'une' && popOf(st) >= 50);
  const inTrouble = mine.filter((st) => {
    const rd = st.lifeSupport.reserveDays;
    return Math.min(rd.water ?? 999, rd.oxygen ?? 999, rd.food ?? 999) < 20 || st.energy.ratio < 0.7 || st.pop.wellbeing < 0.4;
  });
  if (mine.length > 0 && inTrouble.length * 2 > mine.length) return;
  const taken = new Set(settlementList(s).map((st) => st.siteId));
  for (const site of EXPANSION_ORDER) {
    if (taken.has(site)) continue;
    if (!aiFrontierOpen(s, site)) continue;
    const plan = foundingPlan(s, site, 'une');
    if (!plan.ok) continue;
    if (plan.cost + plan.transport > s.une.treasury * 0.4) continue;
    foundSettlement(s, site, 'une');
    s.events.flags.lastUneFounding = s.day;
    return;
  }
}

const LAW_PRIORITY: { id: string; when: (s: GameState) => boolean }[] = [
  { id: 'orbital_safety', when: () => true },
  { id: 'resource_royalties', when: (s) => settlementList(s).some((st) => st.facilities.some((f) => f.type === 'iceMine' || f.type === 'regolithRefinery')) },
  { id: 'bond_authority', when: () => true },
  { id: 'lunar_fund', when: (s) => settlementList(s).filter((st) => regionOf(st) === 'luna').length >= 2 },
  { id: 'research_commons', when: () => true },
  { id: 'pd_network', when: (s) => s.earth.surveyCoverage < 0.8 || s.security.threats.length > 0 },
  { id: 'open_settlements', when: (s) => s.day > 365 * 3 },
  { id: 'mars_program', when: () => true },
  { id: 'amd_citizenship', when: (s) => settlementList(s).reduce((a, st) => a + st.pop.localBorn, 0) > 100 },
  { id: 'une_citizenship', when: () => true },
  { id: 'offworld_representation', when: () => true },
  { id: 'self_government', when: (s) => settlementList(s).some((st) => popOf(st) > 800) },
  { id: 'national_settlements', when: (s) => s.day > 365 * 8 },
  { id: 'amd_taxation', when: (s) => s.une.debt > annualRevenue(s) * 0.5 || s.day > 365 * 30 },
  { id: 'corporate_tax', when: () => true },
  { id: 'transparency', when: (s) => (s.une.metrics.corruption ?? 0) > 0.14 },
  { id: 'security_forces', when: (s) => Object.values(s.security.piracy).some((v) => v > 0.004) || offworldPopulation(s) > 2e5 },
  { id: 'automation_transition', when: () => true },
  { id: 'ai_oversight', when: (s) => s.security.aiRisk > 0.12 },
  { id: 'gravity_standards', when: (s) => settlementList(s).some((st) => st.pop.localBorn > 50) },
  { id: 'climate_compact', when: (s) => s.earth.climateStress > 0.45 },
  { id: 'freight_subsidy', when: (s) => settlementList(s).some((st) => st.politics.grievances > 0.4) },
  { id: 'arms_control', when: (s) => s.security.tension > 0.45 },
  { id: 'mercury_extensive', when: () => true },
  { id: 'replication_open', when: (s) => s.security.aiRisk < 0.5 },
  { id: 'energy_trust', when: () => true },
  { id: 'amd_solar_compact', when: () => true },
  { id: 'mercury_disassembly', when: (s) => s.swarm.totalCollectors > 1e7 },
  { id: 'amd_emergency', when: (s) => s.day > 365 * 20 },
];

const COSTLY_LAWS = new Set(['freight_subsidy', 'lunar_fund']);

/** Work the votes on executive bills that are falling short: lobby swing delegations, offer pledges. */
function whipBills(s: GameState): void {
  for (const b of s.bills) {
    if (b.stage !== 'debate' || b.sponsor !== 'executive') continue;
    const t = projectVote(s, b);
    if (t.nations.passed && t.assembly.passed) continue;
    if (!t.nations.passed) {
      // What is missing: member states or population?
      const need = THRESHOLD_SHARE[t.nations.threshold] ?? { states: 0.5, pop: 0.5 };
      const stateGap = need.states * t.nations.totalStates - t.nations.yesStates;
      const popGap = need.pop * t.nations.totalPop - t.nations.yesPop;
      const weight = (id: string) => {
        const n = s.nations[id];
        return (stateGap > 0 ? n.states / Math.max(1, t.nations.totalStates) : 0) + (popGap > 0 ? n.population / Math.max(1, t.nations.totalPop) : 0);
      };
      const swing = Object.keys(t.byNation).filter((id) => s.nations[id]?.member && t.byNation[id] < 0.5 && t.byNation[id] > 0.2 && (b.lobbying[id] ?? 0) < 3)
        .sort((a, c) => (0.5 - t.byNation[a]) / Math.max(1e-6, weight(a)) - (0.5 - t.byNation[c]) / Math.max(1e-6, weight(c)) || (a < c ? -1 : 1));
      for (const id of swing.slice(0, 2)) {
        if (s.une.politicalCapital < 30) break;
        lobby(s, b.id, id);
      }
      const f = fiscal(s);
      if (swing.length && f.surplus > 0 && s.une.treasury > f.R * 0.3) {
        const id = swing[0];
        const amt = Math.min(s.nations[id].gdp * 0.0004 * 0.5, f.R * 0.02);
        if (amt > 1e8 && (b.pledges[id] ?? 0) < amt) pledge(s, b.id, id, amt);
      }
    }
    if (!t.assembly.passed) {
      const swingF = Object.keys(t.byFaction).filter((id) => t.byFaction[id] < 0.5 && t.byFaction[id] > 0.25 && (b.lobbying[id] ?? 0) < 3)
        .sort((a, c) => (s.factions[c]?.seats ?? 0) - (s.factions[a]?.seats ?? 0) || (a < c ? -1 : 1));
      for (const id of swingF.slice(0, 2)) {
        if (s.une.politicalCapital < 30) break;
        lobby(s, b.id, id);
      }
    }
  }
}

const THRESHOLD_SHARE: Record<string, { states: number; pop: number }> = {
  simple: { states: 0.5, pop: 0 },
  qualified: { states: 0.55, pop: 0.65 },
  super: { states: 2 / 3, pop: 0.6 },
  unanimous: { states: 1, pop: 0 },
};

export function legislationAdvisor(s: GameState): void {
  // Advance colonies that ask for it
  for (const st of settlementList(s)) {
    if (isIndependent(st)) continue;
    const idx = STATUS_ORDER.indexOf(st.status);
    const next = STATUS_ORDER[idx + 1];
    if (!next || next === 'associated' || next === 'independent') continue;
    const req = statusRequirements(s, st, next);
    if (req.ok && (next === 'territory' || st.politics.autonomy > 0.35) && s.une.politicalCapital >= req.cost + 20) grantStatus(s, st.id, next as any);
  }
  whipBills(s);
  if (s.bills.filter((b) => b.stage !== 'done').length >= 2) return;
  const failed = (s.events.flags.failedLaws ??= {}) as Record<string, number>;
  for (const b of s.bills) if (b.result === 'failed' || b.result === 'rejected') failed[b.lawId] = Math.max(failed[b.lawId] ?? 0, b.voteDay);
  // Within a group of alternative laws, never step back from the one listed later
  const rank = new Map(LAW_PRIORITY.map((x, i) => [x.id, i]));
  const inForceRank = (group: string) => {
    let r = -1;
    for (const id in s.laws) if (LAW[id]?.group === group) r = Math.max(r, rank.get(id) ?? -1);
    return r;
  };
  for (const item of LAW_PRIORITY) {
    if (s.laws[item.id]) continue;
    const group = LAW[item.id]?.group;
    if (group && inForceRank(group) > (rank.get(item.id) ?? 0)) continue;
    if (failed[item.id] && s.day - failed[item.id] < 365 * 4) continue;
    if (!item.when(s)) continue;
    if (COSTLY_LAWS.has(item.id) && fiscal(s).surplus < annualRevenue(s) * 0.1) continue;
    const av = lawAvailable(s, item.id, 'enact');
    if (!av.ok) continue;
    const r = proposeBill(s, item.id, 'enact');
    if (r.ok) return;
  }
}

export { LAW, SITE, known, currentEra, TECHS };
