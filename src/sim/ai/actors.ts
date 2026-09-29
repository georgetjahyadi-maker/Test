// AI for member states, corporations and self-governing settlements.
import type { GameState, Settlement } from '../types';
import { SITE, SITES } from '../content/sites';
import { FACILITY } from '../content/facilities';
import { clamp } from '../core/util';
import { rand, chance, gaussian, pick } from '../core/rng';
import { mod } from '../systems/modifiers';
import { popOf, settlementList, regionOf, isGoverned, isIndependent, addHistory, known } from '../systems/helpers';
import { suggestFacilities, estimateROI, canBuild, totalCost, industrialSuggestion, inputsAvailable } from './planner';
import { invest, ensureSupply } from './actions';
import { foundingPlan, foundSettlement } from '../systems/colonies';
import { makeCharacter } from '../systems/characters';
import { SETTLEMENT_NAMES } from '../content/misc';
import { monthlyLaunchCap } from '../systems/logistics';

// ---------------------------------------------------------------------------
// Member states (quarterly)
// ---------------------------------------------------------------------------
export function nationsQuarterly(s: GameState): void {
  const util = monthlyLaunchCap(s) > 0 ? s.earth.launchDemandMonth / monthlyLaunchCap(s) : 0;
  for (const id of Object.keys(s.nations).sort()) {
    const n = s.nations[id];
    if (!n.member) continue;
    n.spaceInvestYear *= 0.75;
    let budget = n.spaceFunds * 0.6;
    if (budget < 5e8) continue;
    // Sponsored settlements: fill needs
    const targets = settlementList(s)
      .filter((st) => !isIndependent(st) && ((st.sponsors[id] ?? 0) >= 0.08 || (mod(s, 'openSettlements') > 0.5 && (st.sponsors.une ?? 0) > 0 && n.offworldInterest > 0.4)))
      .sort((a, b) => (b.sponsors[id] ?? 0) - (a.sponsors[id] ?? 0));
    let actions = 0;
    for (const st of targets) {
      if (actions >= 2 + Math.floor(n.offworldInterest * 3)) break;
      const sug = suggestFacilities(s, st, id);
      for (const sg of sug.slice(0, 2)) {
        const cost = totalCost(s, st, sg.type, sg.count);
        if (cost > budget) continue;
        if (st.construction.length > 6 + popOf(st) / 2000) break;
        const r = invest(s, id, st, sg.type, sg.count);
        if (r.ok) {
          budget -= cost;
          actions++;
        }
        break;
      }
      // keep national settlements supplied (national fleets are contracted through the hub)
      if ((st.sponsors[id] ?? 0) >= 0.5 && budget > 3e9) {
        const r = ensureSupply(s, st, id, Math.min(budget * 0.4, 2e10));
        if (r.ok && !r.info) budget -= 2e9;
      }
    }
    // National settlements
    if (mod(s, 'nationalSettlements') > 0 && n.spaceFunds > 3e10 && n.offworldInterest > 0.3 && chance(s, 'nations', 0.08 * n.offworldInterest)) {
      const site = pickExpansionSite(s, id);
      if (site) {
        const name = SETTLEMENT_NAMES[site]?.[1] ?? SETTLEMENT_NAMES[site]?.[0];
        const r = foundSettlement(s, site, id, name ? `${name}` : undefined);
        if (r.ok) actions++;
      }
    }
    void util;
    // Space budget drifts with ideology and success
    const exp = n.ideology[1] ?? 0;
    n.spaceBudgetShare = clamp(n.spaceBudgetShare * (1 + (exp * 0.01 + ((s.events.flags.recentMilestone as number) ?? 0) * 0.005 - Math.max(0, -n.gdpGrowth) * 0.5) / 4), 0.00005, 0.01);
    n.offworldInterest = clamp(n.spaceBudgetShare * 700, 0, 1);
  }
}

function pickExpansionSite(s: GameState, actor: string): string | undefined {
  const taken = new Set(settlementList(s).map((st) => st.siteId));
  const order = ['luna_procellarum', 'luna_tranquillitatis', 'luna_daedalus', 'eml1', 'eml5', 'nea_ryugu', 'nea_bennu', 'phobos', 'mars_orbit', 'mars_arcadia', 'mars_jezero', 'mars_hellas', 'mars_nili', 'mars_arsia', 'ceres', 'ceres_orbit', 'vesta', 'psyche', 'nea_amun', 'venus_clouds', 'mercury_prokofiev', 'mercury_caloris', 'callisto', 'titan', 'ganymede', 'saturn_orbit', 'uranus_orbit', 'enceladus', 'europa', 'triton', 'pluto'];
  for (const id of order) {
    if (taken.has(id)) continue;
    const plan = foundingPlan(s, id, actor);
    if (plan.ok) return id;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Corporations (quarterly)
// ---------------------------------------------------------------------------
export function corporationsQuarterly(s: GameState): void {
  const util = monthlyLaunchCap(s) > 0 ? s.earth.launchDemandMonth / monthlyLaunchCap(s) : 0;
  const open = mod(s, 'openSettlements');
  const appetite = 1 + mod(s, 'corpInvestment');
  for (const id of Object.keys(s.corporations).sort()) {
    const c = s.corporations[id];
    if (!c.alive) continue;
    if (c.cash < 5e8 && c.debt > c.valuation * 0.3) continue;
    let budget = Math.max(0, c.cash * 0.5 + Math.max(0, c.valuation * 0.35 - c.debt) * 0.4) * appetite;
    void util;
    // Logistics: serve settlements with unmet demand
    if (c.focus.includes('logistics') || c.sector === 'launch' || c.sector === 'logistics') {
      const hungry = settlementList(s).filter((st) => !st.flags.earthHub && Object.keys(st.demand).length > 0).sort((a, b) => popOf(b) - popOf(a));
      let n = 0;
      for (const st of hungry) {
        if (n >= 2 || budget < 2e9) break;
        const r = ensureSupply(s, st, id, Math.min(budget * 0.4, 1.5e10));
        if (r.ok && !r.info) {
          n++;
          budget -= 2e9;
        }
      }
    }
    // Industrial investment by ROI
    const hurdle = 0.14 - c.riskAppetite * 0.06;
    const candidates: { st: Settlement; type: string; roi: number; cost: number }[] = [];
    for (const st of settlementList(s)) {
      if (isIndependent(st) && !st.sponsors[id]) continue;
      const allowed = (st.sponsors[id] ?? 0) > 0 || (st.founder === id) || rand(s, 'corps') < open || isGoverned(st);
      if (!allowed) continue;
      for (const f of focusTypes(c.focus)) {
        if (!canBuild(s, st, id, f)) continue;
        if (!inputsAvailable(s, st, f)) continue;
        if (st.energy.ratio < 0.9 && (FACILITY[f]?.power ?? 0) > 0.1 && !FACILITY[f]?.gen) continue;
        // A plant that would swamp the local grid waits until someone builds the power for it
        if (!FACILITY[f]?.gen && (FACILITY[f]?.power ?? 0) > Math.max(2, (st.energy.gen - st.energy.demand) * 0.8)) continue;
        if (st.construction.some((p) => p.type === f && p.owner === id)) continue;
        const roi = estimateROI(s, st, f);
        if (roi.roi >= hurdle) candidates.push({ st, type: f, roi: roi.roi, cost: roi.capex });
      }
    }
    candidates.sort((a, b) => b.roi - a.roi);
    let n = 0;
    for (const cand of candidates) {
      if (n >= 2) break;
      if (cand.cost > budget) continue;
      const r = invest(s, id, cand.st, cand.type, 1);
      if (r.ok) {
        n++;
        budget -= cand.cost;
      }
    }
    // Company towns
    if (mod(s, 'corpCharters') > 0 && c.cash > 2e10 && chance(s, 'corps', 0.05 * c.riskAppetite)) {
      const site = pickResourceSite(s, id);
      if (site) foundSettlement(s, site, id, `${c.name.split(' ')[0]} ${pick(s, 'corps', ['Works', 'Station', 'Camp', 'Holdings'])}`);
    }
  }
}

function focusTypes(focus: string[]): string[] {
  const map: Record<string, string[]> = {
    mining: ['iceMine', 'regolithRefinery', 'asteroidMiner', 'crustalMine', 'he3Harvester', 'autoMiner', 'atmosphereProcessor', 'gasScoop'],
    processing: ['propellantPlant', 'loxPlant', 'electrolysisPlant', 'smelter', 'ceramicsWorks', 'chemicalPlant', 'fuelPlant', 'deuteriumPlant'],
    manufacturing: ['fabShop', 'metalWorks', 'machineShop', 'electronicsFactory', 'semiconductorFab', 'pvFactory', 'superconductorPlant'],
    energy: ['solarArray', 'fissionReactor', 'moltenSaltReactor', 'fusionPlant', 'beamReceiver'],
    habitat: ['habModule', 'buriedHab', 'domeDistrict', 'rotatingHab', 'stanfordTorus', 'oneillCylinder', 'aerostatHab'],
    lifeSupport: ['lifeSupport', 'greenhouse', 'algaeFarm'],
    food: ['greenhouse', 'algaeFarm', 'proteinVats'],
    shipyard: ['shipyard'],
    dyson: ['collectorFactory', 'autoFactory', 'pvFactory'],
    science: ['researchLab'],
    logistics: ['propellantDepot', 'propellantPlant', 'loxPlant'],
    launch: ['propellantDepot'],
  };
  const out = new Set<string>();
  for (const f of focus) for (const t of map[f] ?? []) out.add(t);
  return [...out];
}

function pickResourceSite(s: GameState, actor: string): string | undefined {
  const taken = new Set(settlementList(s).map((st) => st.siteId));
  const cands = SITES.filter((x) => !taken.has(x.id) && x.deposits.length > 0 && x.region !== 'earthOrbit');
  cands.sort((a, b) => a.id.localeCompare(b.id));
  for (const site of cands) {
    const plan = foundingPlan(s, site.id, actor);
    if (plan.ok) return site.id;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Self-governing settlements invest their own budgets (monthly)
// ---------------------------------------------------------------------------
export function localGovernmentsMonthly(s: GameState): void {
  for (const st of settlementList(s)) {
    if (!isGoverned(st)) continue;
    // Local governments may borrow for investment up to about a year of their output
    const room = st.economy.treasury + Math.max(5e8, st.economy.gdp);
    if (room < 1e8) continue;
    if (st.construction.length > 4 + popOf(st) / 20000) continue;
    const sug = suggestFacilities(s, st, st.id);
    for (const sg of sug.slice(0, 2)) {
      const cost = totalCost(s, st, sg.type, sg.count);
      if (cost > room * 0.5) continue;
      invest(s, st.id, st, sg.type, sg.count);
      break;
    }
    if (isIndependent(st) && st.economy.treasury > 5e9) ensureSupply(s, st, st.id, st.economy.treasury * 0.2);
  }
}

// ---------------------------------------------------------------------------
// Leadership change
// ---------------------------------------------------------------------------
export function changeNationLeader(s: GameState, nationId: string): void {
  const n = s.nations[nationId];
  const old = s.characters[n.leaderId];
  const ideology = n.ideology.map((v) => clamp(v + gaussian(s, 'nations') * 0.25, -1, 1));
  const c = makeCharacter(s, 'leader', { nationId, ideology });
  n.leaderId = c.id;
  if (old) old.role = 'former leader';
  const fed = ideology[0];
  if (n.population > 3e8 || Math.abs(fed - (old?.ideology[0] ?? 0)) > 0.35) {
    addHistory(s, `New government in ${n.short}`, `${c.name} takes office in ${n.name}${fed > 0.3 ? ', promising closer cooperation with the UNE' : fed < -0.3 ? ', promising to defend national sovereignty against the UNE' : ''}.`, 'politics', 1, [nationId, c.id]);
  }
}

export { FACILITY, SITE, regionOf, known, industrialSuggestion };
