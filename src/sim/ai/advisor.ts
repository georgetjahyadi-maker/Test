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
import { lawAvailable, proposeBill } from '../systems/legislature';
import { suggestFacilities, totalCost } from './planner';
import { invest, ensureSupply } from './actions';
import { foundingPlan, foundSettlement, grantStatus, statusRequirements } from '../systems/colonies';
import { currentEra } from '../systems/milestones';
import { civilFromDay } from '../core/time';

export function advisorMonthly(s: GameState): void {
  const d = s.une.delegation;
  if (d.budget) budgetAdvisor(s);
  if (d.research) researchAdvisor(s);
  if (d.logistics) logisticsAdvisor(s);
  if (d.construction) constructionAdvisor(s);
  const month = civilFromDay(s.day).m;
  if (d.expansion && month % 6 === 1) expansionAdvisor(s);
  if (d.legislation && month % 2 === 0) legislationAdvisor(s);
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
  const room = R * 0.72;
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
  const budgetTotal = Math.min(Math.max(0, s.une.treasury) * 0.25, 4e10);
  let budget = budgetTotal;
  const list = settlementList(s).filter((st) => !st.flags.earthHub && !isIndependent(st));
  list.sort((a, b) => (b.sponsors.une ?? 0) - (a.sponsors.une ?? 0) || popOf(b) - popOf(a));
  for (const st of list) {
    if (budget < 1e9) break;
    const uneShare = st.sponsors.une ?? 0;
    const critical = (st.lifeSupport.reserveDays.oxygen ?? 999) < 90 || (st.lifeSupport.reserveDays.food ?? 999) < 60 || (st.lifeSupport.reserveDays.water ?? 999) < 90;
    if (uneShare < 0.2 && !critical && st.founder !== 'une') continue;
    const r = ensureSupply(s, st, 'une', budget * 0.5);
    if (r.ok && !r.info) budget -= Math.min(budget, 3e9);
  }
}

export function constructionAdvisor(s: GameState): void {
  const R = annualRevenue(s);
  const reserve = R * 0.12;
  let projects = 0;
  const list = settlementList(s).filter((st) => (st.sponsors.une ?? 0) >= 0.3 && !isGoverned(st));
  list.sort((a, b) => popOf(b) - popOf(a));
  for (const st of list) {
    if (projects >= 3) break;
    if (st.construction.filter((p) => p.owner === 'une').length > 3 + popOf(st) / 5000) continue;
    const sug = suggestFacilities(s, st, 'une');
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

const EXPANSION_ORDER = [
  'luna_tranquillitatis', 'eml1', 'luna_procellarum', 'nea_ryugu', 'mars_orbit', 'mars_arcadia', 'phobos', 'eml5', 'luna_daedalus', 'mars_jezero', 'ceres', 'nea_amun', 'mercury_prokofiev', 'mercury_caloris', 'vesta', 'psyche', 'venus_clouds', 'callisto', 'titan', 'mercury_orbit', 'ceres_orbit', 'saturn_orbit', 'uranus_orbit', 'ganymede', 'mars_hellas', 'mars_nili', 'triton', 'pluto',
];

export function expansionAdvisor(s: GameState): void {
  const R = annualRevenue(s);
  if (s.une.treasury < R * 0.3) return;
  const taken = new Set(settlementList(s).map((st) => st.siteId));
  for (const site of EXPANSION_ORDER) {
    if (taken.has(site)) continue;
    const plan = foundingPlan(s, site, 'une');
    if (!plan.ok) continue;
    if (plan.cost + plan.transport > s.une.treasury * 0.4) continue;
    foundSettlement(s, site, 'une');
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
  if (s.bills.filter((b) => b.stage !== 'done').length >= 2) return;
  const failed = (s.events.flags.failedLaws ??= {}) as Record<string, number>;
  for (const b of s.bills) if (b.result === 'failed' || b.result === 'rejected') failed[b.lawId] = Math.max(failed[b.lawId] ?? 0, b.voteDay);
  for (const item of LAW_PRIORITY) {
    if (s.laws[item.id]) continue;
    if (failed[item.id] && s.day - failed[item.id] < 365 * 4) continue;
    if (!item.when(s)) continue;
    const av = lawAvailable(s, item.id, 'enact');
    if (!av.ok) continue;
    const r = proposeBill(s, item.id, 'enact');
    if (r.ok) return;
  }
}

export { LAW, SITE, known, currentEra, TECHS };
