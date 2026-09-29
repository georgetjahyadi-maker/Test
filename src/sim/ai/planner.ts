// Shared planning heuristics used by nations, corporations, colonial governments
// and the UNE advisor.
import type { GameState, Settlement } from '../types';
import { FACILITY, FACILITIES, facilityJobs } from '../content/facilities';
import { SITE } from '../content/sites';
import { GOOD } from '../content/goods';
import { solarFluxFactor } from '../content/bodies';
import { popOf, pendingCount, facilityCount, usable, regionOf } from '../systems/helpers';
import { price, wageFor } from '../systems/settlements';
import { designStats, planFor } from '../systems/designs';
import type { RoutePlan } from '../physics/engineering';
import { mod } from '../systems/modifiers';

export interface Suggestion {
  type: string;
  count: number;
  reason: string;
  priority: number;
}

export function canBuild(s: GameState, st: Settlement, actor: string, type: string): boolean {
  const def = FACILITY[type];
  if (!def) return false;
  const site = SITE[st.siteId];
  if (!def.allowed.includes(site.kind)) return false;
  if (def.requiresFeature && !site.features.includes(def.requiresFeature)) return false;
  if (!usable(s, actor, def.tech)) return false;
  if (def.mining) {
    const ok = st.deposits.some((d) => def.mining!.depositTypes.includes(d.type) && d.reserve > 0 && (d.type !== 'core' || mod(s, 'mercuryCap') >= 2));
    if (!ok) return false;
  }
  if (type === 'massDriver' && site.gravity > 0.4) return false;
  if (type === 'gasScoop' && !site.features.includes('gasGiant')) return false;
  if (type === 'he3Harvester' && !st.deposits.some((d) => d.type === 'he3')) return false;
  if (type === 'autoFactory' && mod(s, 'replication') <= -1) return false;
  return true;
}

export function materialCost(s: GameState, st: Settlement, type: string, count = 1): number {
  const def = FACILITY[type];
  let v = 0;
  for (const g in def.buildMass) v += def.buildMass[g] * count * price(s, st, g);
  return v;
}

export function totalCost(s: GameState, st: Settlement, type: string, count = 1): number {
  return FACILITY[type].buildCost * count + materialCost(s, st, type, count);
}

function housingPending(st: Settlement): number {
  let h = 0;
  for (const p of st.construction) h += (FACILITY[p.type]?.housing ?? 0) * p.count;
  return h;
}

function genPending(s: GameState, st: Settlement): number {
  const site = SITE[st.siteId];
  let g = 0;
  for (const p of st.construction) {
    const def = FACILITY[p.type];
    if (!def?.gen) continue;
    g += def.gen * p.count * (def.genType === 'solar' ? solarFluxFactor(site.body) * site.illumination : 1);
  }
  return g;
}

function bestHabitat(s: GameState, st: Settlement, actor: string, deficit: number): Suggestion | null {
  const site = SITE[st.siteId];
  const pop = popOf(st);
  const options: string[] = [];
  if (site.kind === 'orbital') options.push('megaHabitat', 'oneillCylinder', 'stanfordTorus', 'rotatingHab', 'orbitalStation');
  else if (site.kind === 'atmospheric') options.push('aerostatHab', 'habModule');
  else if (site.kind === 'asteroid') options.push('asteroidHab', 'rotatingHab', 'buriedHab', 'habModule');
  else options.push('arcology', 'domeDistrict', 'iceHab', 'lavaTubeHab', 'buriedHab', 'habModule');
  for (const t of options) {
    if (!canBuild(s, st, actor, t)) continue;
    const h = FACILITY[t].housing ?? 1;
    // Don't build something vastly larger than the settlement can fill
    if (h > Math.max(pop * 3, deficit * 4, 60) && t !== 'habModule' && t !== 'orbitalStation') continue;
    if (site.radiation > 5000 && (FACILITY[t].shielding ?? 0) < 0.99) continue;
    const count = Math.max(1, Math.min(t === 'habModule' || t === 'orbitalStation' ? 4 : 2, Math.ceil(deficit / h)));
    return { type: t, count, reason: `Housing short by ${Math.round(deficit)}`, priority: 9 };
  }
  return null;
}

function bestEnergy(s: GameState, st: Settlement, actor: string, deficitMW: number): Suggestion | null {
  const site = SITE[st.siteId];
  const flux = solarFluxFactor(site.body) * site.illumination * (site.body === 'titan' ? 0.3 : 1);
  const opts: { t: string; per: number }[] = [];
  if (canBuild(s, st, actor, 'fusionPlant') && deficitMW > 300) opts.push({ t: 'fusionPlant', per: 2000 });
  if (canBuild(s, st, actor, 'moltenSaltReactor') && deficitMW > 60 && flux < 0.5) opts.push({ t: 'moltenSaltReactor', per: 200 });
  if (flux >= 0.15) opts.push({ t: 'solarArray', per: 2 * flux * (site.illumination < 0.7 ? 0.75 : 1) });
  if (canBuild(s, st, actor, 'fissionReactor')) opts.push({ t: 'fissionReactor', per: 10 });
  if (opts.length === 0) opts.push({ t: 'solarArray', per: 2 * Math.max(0.01, flux) });
  const o = opts[0];
  const count = Math.max(1, Math.min(o.t === 'solarArray' ? 60 : 4, Math.ceil((deficitMW * 1.2) / o.per)));
  const out: Suggestion = { type: o.t, count, reason: `Power deficit ${deficitMW.toFixed(1)} MW`, priority: 8 };
  return out;
}

/** Need-driven suggestions for a settlement, in priority order. */
export function suggestFacilities(s: GameState, st: Settlement, actor: string): Suggestion[] {
  const out: Suggestion[] = [];
  const site = SITE[st.siteId];
  const pop = popOf(st);
  const growth = Math.max(8, ((st.flags.migrationDemand as number) ?? 0) * 3 + pop * 0.06);
  const housing = st.housing + housingPending(st);
  if (housing < pop + growth) {
    const h = bestHabitat(s, st, actor, pop + growth - housing);
    if (h) out.push(h);
  }
  const lsPending = pendingCount(st, 'lifeSupport') * 100;
  if (st.lifeSupport.capacity + lsPending < Math.max(pop, Math.min(housing, pop + growth)) * 1.05) {
    const need = Math.max(pop, Math.min(housing, pop + growth)) * 1.1 - st.lifeSupport.capacity - lsPending;
    out.push({ type: 'lifeSupport', count: Math.max(1, Math.min(20, Math.ceil(need / 100))), reason: 'Life-support capacity', priority: 10 });
  }
  const gen = st.energy.gen + genPending(s, st);
  let pendingDemand = 0;
  for (const p of st.construction) pendingDemand += (FACILITY[p.type]?.power ?? 0) * p.count;
  const demand = st.energy.demand + pendingDemand + growth * 0.003;
  if (gen < demand * 1.1) {
    const e = bestEnergy(s, st, actor, demand * 1.15 - gen);
    if (e) out.push(e);
  }
  if (site.illumination < 0.7 && facilityCount(st, 'solarArray') > 0 && st.energy.storage + pendingCount(st, 'batteryBank') * 60 < st.energy.demand * 24 * 5 && canBuild(s, st, actor, 'batteryBank')) {
    out.push({ type: 'batteryBank', count: Math.min(10, Math.ceil((st.energy.demand * 24 * 5 - st.energy.storage) / 60)), reason: 'Night-time energy storage', priority: 6 });
  }
  if ((site.kind === 'surface' || site.kind === 'asteroid' || site.kind === 'atmospheric') && st.landingCapacity <= 0 && pendingCount(st, 'landingPad') === 0) out.push({ type: 'landingPad', count: 1, reason: 'No spaceport', priority: 10 });
  if (pop > 15 && st.lifeSupport.foodSelf < 0.9) {
    const foodNeed = pop * 0.5 * (1 - st.lifeSupport.foodSelf);
    const pend = pendingCount(st, 'greenhouse') * 25 + pendingCount(st, 'algaeFarm') * 80 + pendingCount(st, 'proteinVats') * 1000;
    if (pend < foodNeed) {
      if (foodNeed > 800 && canBuild(s, st, actor, 'proteinVats')) out.push({ type: 'proteinVats', count: Math.min(10, Math.ceil((foodNeed - pend) / 1000)), reason: 'Food self-sufficiency', priority: 7 });
      else if (foodNeed > 60 && canBuild(s, st, actor, 'algaeFarm')) out.push({ type: 'algaeFarm', count: Math.min(12, Math.ceil((foodNeed - pend) / 80)), reason: 'Food self-sufficiency', priority: 7 });
      else out.push({ type: 'greenhouse', count: Math.min(12, Math.max(1, Math.ceil((foodNeed - pend) / 25))), reason: 'Food self-sufficiency', priority: 7 });
    }
  }
  if (pop > 60 && st.medical + pendingCount(st, 'hospital') * 2000 < pop) out.push({ type: 'hospital', count: Math.min(10, Math.ceil((pop - st.medical) / 2000)), reason: 'Medical coverage', priority: 7 });
  if (pop > 150 && st.civic + pendingCount(st, 'civicCenter') * 3000 < pop) out.push({ type: 'civicCenter', count: Math.min(10, Math.ceil((pop - st.civic) / 3000)), reason: 'Civic facilities', priority: 5 });
  let stockT = 0;
  for (const g in st.stock) stockT += st.stock[g];
  if (stockT > st.storageCap * 0.75 && pendingCount(st, 'warehouse') === 0) out.push({ type: 'warehouse', count: 1, reason: 'Storage nearly full', priority: 5 });
  // Water and propellant from local ice
  if (canBuild(s, st, actor, 'iceMine')) {
    const water = (st.consumption.water ?? 0) + (st.routeDraw.propellant ?? 0) * 1.3;
    const prod = st.production.water ?? 0;
    if (facilityCount(st, 'iceMine') + pendingCount(st, 'iceMine') === 0 || (prod < water * 1.2 && pendingCount(st, 'iceMine') === 0)) out.push({ type: 'iceMine', count: 1, reason: 'Local water', priority: 6 });
  }
  if (canBuild(s, st, actor, 'atmosphereProcessor') && facilityCount(st, 'atmosphereProcessor') + pendingCount(st, 'atmosphereProcessor') < Math.max(1, pop / 400)) out.push({ type: 'atmosphereProcessor', count: 1, reason: 'Atmospheric resources', priority: 6 });
  if (canBuild(s, st, actor, 'propellantPlant') && (st.production.water ?? 0) > 20 && facilityCount(st, 'propellantPlant') + pendingCount(st, 'propellantPlant') < 1 + Math.floor((st.production.water ?? 0) / 150)) out.push({ type: 'propellantPlant', count: 1, reason: 'Propellant production', priority: 5 });
  if (canBuild(s, st, actor, 'electrolysisPlant') && (st.production.water ?? 0) > 10 && (st.lifeSupport.reserveDays.oxygen ?? 999) < 200 && pendingCount(st, 'electrolysisPlant') === 0 && facilityCount(st, 'electrolysisPlant') < 1 + pop / 500) out.push({ type: 'electrolysisPlant', count: 1, reason: 'Local oxygen', priority: 6 });
  if (pop >= 40 && st.science < pop * 0.02 + 20 && pendingCount(st, 'researchLab') === 0 && facilityCount(st, 'researchLab') < 1 + pop / 2000) out.push({ type: 'researchLab', count: 1, reason: 'Science output', priority: 3 });
  if (pop > 20000 && facilityCount(st, 'university') + pendingCount(st, 'university') < pop / 200000 + 1) out.push({ type: 'university', count: 1, reason: 'Education', priority: 4 });
  if (canBuild(s, st, actor, 'automationHub') && pop > 800 && facilityCount(st, 'automationHub') + pendingCount(st, 'automationHub') < Math.max(1, st.jobs / 3000)) out.push({ type: 'automationHub', count: 1, reason: 'Automation', priority: 4 });
  if (site.kind === 'orbital' && canBuild(s, st, actor, 'propellantDepot') && facilityCount(st, 'propellantDepot') + pendingCount(st, 'propellantDepot') === 0) out.push({ type: 'propellantDepot', count: 1, reason: 'Refuelling hub', priority: 5 });
  // Industrial chain: substitute the most valuable imports
  const ind = industrialSuggestion(s, st, actor);
  if (ind) out.push(ind);
  if (pop > 2000 && canBuild(s, st, actor, 'shipyard') && facilityCount(st, 'shipyard') + pendingCount(st, 'shipyard') === 0 && st.closure > 0.4) out.push({ type: 'shipyard', count: 1, reason: 'Local shipbuilding', priority: 3 });
  if (canBuild(s, st, actor, 'massDriver') && facilityCount(st, 'massDriver') + pendingCount(st, 'massDriver') === 0 && totalExportsYear(st) > 20000) out.push({ type: 'massDriver', count: 1, reason: 'Bulk exports', priority: 4 });
  return out.sort((a, b) => b.priority - a.priority);
}

function totalExportsYear(st: Settlement): number {
  let t = 0;
  for (const g in st.exports) t += st.exports[g];
  return t * 12;
}

const INDUSTRIAL = ['regolithRefinery', 'asteroidMiner', 'crustalMine', 'smelter', 'ceramicsWorks', 'chemicalPlant', 'fabShop', 'machineShop', 'electronicsFactory', 'semiconductorFab', 'pvFactory', 'superconductorPlant', 'fuelPlant', 'he3Harvester', 'gasScoop', 'deuteriumPlant', 'autoMiner', 'collectorFactory', 'autoFactory'];

/** Pick the industrial facility that substitutes the most valuable imports with local inputs. */
export function industrialSuggestion(s: GameState, st: Settlement, actor: string): Suggestion | null {
  let best: Suggestion | null = null;
  let bestScore = 0;
  for (const t of INDUSTRIAL) {
    if (!canBuild(s, st, actor, t)) continue;
    if (pendingCount(st, t) > 0) continue;
    const roi = estimateROI(s, st, t);
    if (roi.roi > bestScore && roi.roi > 0.04) {
      bestScore = roi.roi;
      best = { type: t, count: 1, reason: `ROI ${(roi.roi * 100).toFixed(0)}%/yr`, priority: 4 };
    }
  }
  return best;
}

export interface ROI {
  revenue: number;
  cost: number;
  capex: number;
  roi: number;
}

/** Annual profit estimate for one unit of a facility type at this settlement. */
export function estimateROI(s: GameState, st: Settlement, type: string): ROI {
  const def = FACILITY[type];
  const region = regionOf(st);
  const m = s.markets[region];
  const pr = (g: string) => m?.prices[g] ?? GOOD[g]?.price ?? 0;
  // value outputs conservatively: use the floor when the region already has surplus
  const val = (g: string, amt: number) => {
    const sup = m?.supply[g] ?? 0;
    const dem = m?.demand[g] ?? 0;
    const p = sup > dem * 1.2 ? m?.floor[g] ?? pr(g) : pr(g);
    const cap = Math.max(amt, dem * 12);
    return Math.min(amt, cap) * p;
  };
  let revenue = 0, cost = 0;
  if (def.mining) {
    const dep = st.deposits.filter((d) => def.mining!.depositTypes.includes(d.type) && d.reserve > 0).sort((a, b) => b.grade - a.grade)[0];
    if (dep) {
      const ore = def.mining.orePerYear / Math.sqrt(dep.difficulty);
      for (const g in dep.yields) revenue += val(g, ore * dep.yields[g] * dep.grade);
      revenue *= 1 - (mod(s, 'royaltyRate') ?? 0);
    }
  }
  if (def.recipe) {
    let inputsOk = 1;
    for (const g in def.recipe.in) {
      const need = def.recipe.in[g];
      const localProd = (st.production[g] ?? 0) * 12 + (st.stock[g] ?? 0);
      if (localProd < need * 0.3 && !st.flags.earthHub) inputsOk = Math.min(inputsOk, 0.35);
      cost += need * pr(g);
    }
    for (const g in def.recipe.out) revenue += val(g, def.recipe.out[g]) * inputsOk;
    cost *= inputsOk;
  }
  if (type === 'collectorFactory' || type === 'autoFactory') revenue += def.buildCost * 0.2;
  cost += def.opex + facilityJobs(def) * wageFor(st);
  for (const g in def.maintenance) cost += def.maintenance[g] * pr(g);
  const capex = def.buildCost + materialCost(s, st, type);
  const profit = revenue - cost;
  return { revenue, cost, capex, roi: capex > 0 ? profit / capex : 0 };
}

// ---------------------------------------------------------------------------
// Transport planning
// ---------------------------------------------------------------------------
export interface DesignChoice {
  designId: string;
  plan: RoutePlan;
  score: number;
  shipCost: number;
}

export function bestDesignFor(s: GameState, originNode: string, destNode: string, owner: string, needPassengers = false): DesignChoice | null {
  let best: DesignChoice | null = null;
  for (const d of Object.values(s.designs).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (d.obsolete) continue;
    if (d.owner !== 'public' && d.owner !== owner) continue;
    const st = designStats(s, d);
    if (st.errors.length || st.techMissing.length) continue;
    if (st.combat > 0) continue;
    const plan = planFor(s, d, originNode, destNode);
    if (!plan.feasible) continue;
    const shipCost = st.cost + st.dryMass * s.earth.launchPrice;
    const cap = plan.capacityPerShipYear + (needPassengers ? plan.passengers * plan.tripsPerYear * 2 : 0);
    const score = cap / (shipCost + plan.opexPerTrip * plan.tripsPerYear * 5);
    if (!best || score > best.score) best = { designId: d.id, plan, score, shipCost };
  }
  return best;
}
