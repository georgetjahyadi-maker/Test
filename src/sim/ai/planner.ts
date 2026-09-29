// Shared planning heuristics used by nations, corporations, colonial governments
// and the UNE advisor.
import type { GameState, Settlement } from '../types';
import { FACILITY, FACILITIES, facilityJobs } from '../content/facilities';
import { SITE } from '../content/sites';
import { GOOD } from '../content/goods';
import { solarFluxFactor } from '../content/bodies';
import { popOf, pendingCount, facilityCount, usable, regionOf } from '../systems/helpers';
import { price, wageFor } from '../systems/settlements';
import { designStats, planFor, settlementAtNode } from '../systems/designs';
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
  if (type === 'autoSolar') return false;
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
    // Megastructures are raised from local material: the region must supply the bulk within about five years
    const mass = FACILITY[t].buildMass;
    let total = 0, bulkGood = '', bulk = 0;
    for (const g in mass) {
      total += mass[g];
      if (mass[g] > bulk) {
        bulk = mass[g];
        bulkGood = g;
      }
    }
    if (total > 100000 && regionalOutput(s, regionOf(st), bulkGood) * 60 < bulk) continue;
    // Don't build something vastly larger than the settlement can fill
    if (h > Math.max(pop * 3, deficit * 4, 60) && t !== 'habModule' && t !== 'orbitalStation') continue;
    if (site.radiation > 5000 && (FACILITY[t].shielding ?? 0) < 0.99) continue;
    const count = Math.max(1, Math.min(t === 'habModule' || t === 'orbitalStation' ? 4 : 2, Math.ceil(deficit / h)));
    return { type: t, count, reason: `Housing short by ${Math.round(deficit)}`, priority: 9 };
  }
  return null;
}

/** Tonnes per month of a good made (or held back for want of buyers) across a region. */
function regionalOutput(s: GameState, region: string, g: string): number {
  let t = 0;
  for (const o of Object.values(s.settlements)) if (regionOf(o) === region) t += (o.production[g] ?? 0) + (o.idleCapacity?.[g] ?? 0);
  return t;
}

/** Reactor fuel is light: any settlement with a working supply route can get it. */
function hasFuelSupply(s: GameState, st: Settlement): boolean {
  return st.flags.earthHub === true || Object.values(s.routes).some((r) => r.active && r.destination === st.id && r.stats.deliveredYear > 10);
}

/** Can this settlement keep a fuel-burning plant running? */
function hasFuel(st: Settlement, g: string, perYear: number): boolean {
  return (st.production[g] ?? 0) * 12 >= perYear * 0.8 || (st.stock[g] ?? 0) >= perYear * 2;
}

function bestEnergy(s: GameState, st: Settlement, actor: string, deficitMW: number): Suggestion | null {
  const site = SITE[st.siteId];
  const flux = solarFluxFactor(site.body) * site.illumination * (site.body === 'titan' ? 0.3 : 1);
  const opts: { t: string; per: number }[] = [];
  const fusionFuelled = hasFuel(st, 'fusionFuel', 0.45) || facilityCount(st, 'deuteriumPlant') + pendingCount(st, 'deuteriumPlant') > 0 || facilityCount(st, 'he3Harvester') > 0;
  if (canBuild(s, st, actor, 'fusionPlant') && deficitMW > 300 && fusionFuelled) opts.push({ t: 'fusionPlant', per: 2000 });
  if (canBuild(s, st, actor, 'moltenSaltReactor') && deficitMW > 60 && flux < 0.5) opts.push({ t: 'moltenSaltReactor', per: 200 });
  // Long nights make batteries heavy; reactors win where they are available and actually get fuel
  const nights = site.illumination < 0.7;
  let rn = 0, ru = 0;
  for (const f of st.facilities) if (f.type === 'fissionReactor' && f.count > 0) {
    rn += f.count;
    ru += f.utilization * f.count;
  }
  const fissionFed = rn === 0 || ru / rn >= 0.6;
  if (nights && canBuild(s, st, actor, 'fissionReactor') && hasFuelSupply(s, st) && fissionFed) opts.push({ t: 'fissionReactor', per: 10 });
  if (flux >= 0.15) opts.push({ t: 'solarArray', per: 2 * flux * (nights ? 0.75 : 1) });
  if (!nights && canBuild(s, st, actor, 'fissionReactor') && fissionFed) opts.push({ t: 'fissionReactor', per: 10 });
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
  // Attractive, established settlements plan for faster growth
  const thriving = st.status !== 'outpost' && st.pop.wellbeing > 0.6 && st.energy.ratio > 0.9;
  const growth = Math.max(8, ((st.flags.migrationDemand as number) ?? 0) * 3 + pop * (thriving ? 0.15 : 0.06));
  const housing = st.housing + housingPending(st);
  // Only grow what can be kept alive: no new housing while life-support reserves are thin
  const rd = st.lifeSupport.reserveDays;
  const partsShort = (st.shortfall?.machinery ?? 0) + (st.shortfall?.supplies ?? 0) > 1 + pop * 0.0005;
  const secure = Math.min(rd.water ?? 999, rd.oxygen ?? 999, rd.food ?? 999, rd.supplies ?? 999) > 45 && !partsShort;
  if (housing < pop + (secure ? growth : 0)) {
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
  // Storage only for the load that solar carries through the night
  const storeNeed = Math.min(st.energy.demand, st.energy.bySource.solar ?? 0) * 24 * 5;
  if (site.illumination < 0.7 && facilityCount(st, 'solarArray') > 0 && st.energy.storage + pendingCount(st, 'batteryBank') * 60 < storeNeed && canBuild(s, st, actor, 'batteryBank')) {
    out.push({ type: 'batteryBank', count: Math.min(10, Math.ceil((storeNeed - st.energy.storage) / 60)), reason: 'Night-time energy storage', priority: 6 });
  }
  if ((site.kind === 'surface' || site.kind === 'asteroid' || site.kind === 'atmospheric') && st.landingCapacity <= 0 && pendingCount(st, 'landingPad') === 0) out.push({ type: 'landingPad', count: 1, reason: 'No spaceport', priority: 10 });
  else if (st.flags.portLimited && pendingCount(st, 'landingPad') === 0) out.push({ type: 'landingPad', count: Math.max(1, Math.ceil(facilityCount(st, 'landingPad') * 0.5)), reason: 'Spaceport congested', priority: 9 });
  if (pop > 15 && st.lifeSupport.foodSelf < 0.9) {
    const foodNeed = pop * 0.5 * (1 - st.lifeSupport.foodSelf);
    const pend = pendingCount(st, 'greenhouse') * 25 + pendingCount(st, 'algaeFarm') * 80 + pendingCount(st, 'proteinVats') * 1000;
    if (pend < foodNeed) {
      const carbon = (st.production.carbon ?? 0) * 12;
      if (foodNeed > 800 && carbon > 380 * 0.8 && canBuild(s, st, actor, 'proteinVats')) out.push({ type: 'proteinVats', count: Math.min(10, Math.ceil((foodNeed - pend) / 1000), Math.floor(carbon / 380)), reason: 'Food self-sufficiency', priority: 7 });
      else if (foodNeed > 60 && carbon > 20 && canBuild(s, st, actor, 'algaeFarm')) out.push({ type: 'algaeFarm', count: Math.min(12, Math.ceil((foodNeed - pend) / 80), Math.max(1, Math.floor(carbon / 20))), reason: 'Food self-sufficiency', priority: 7 });
      else out.push({ type: 'greenhouse', count: Math.min(12, Math.max(1, Math.ceil((foodNeed - pend) / 25))), reason: 'Food self-sufficiency', priority: 7 });
    }
  }
  if (pop > 60 && st.medical + pendingCount(st, 'hospital') * 2000 < pop) out.push({ type: 'hospital', count: Math.min(10, Math.ceil((pop - st.medical) / 2000)), reason: 'Medical coverage', priority: 7 });
  // Consumables and spare parts: local workshops once a settlement is big enough to run one
  const suppliesNeed = (pop * 0.15) / 12 + (st.shortfall?.supplies ?? 0);
  const suppliesMade = (st.production.supplies ?? 0) + (pendingCount(st, 'fabShop') * 70 + pendingCount(st, 'metalWorks') * 60) / 12;
  if (pop > 300 && suppliesMade < suppliesNeed * 0.8) {
    // Workshops need carbon for polymers; where carbon is scarce, metal and glass goods fill the gap
    if (canBuild(s, st, actor, 'fabShop') && inputsAvailable(s, st, 'fabShop')) out.push({ type: 'fabShop', count: Math.min(10, Math.max(1, Math.ceil((suppliesNeed - suppliesMade) / (70 / 12)))), reason: 'Local supplies and spare parts', priority: 8 });
    else if (canBuild(s, st, actor, 'metalWorks') && inputsAvailable(s, st, 'metalWorks')) out.push({ type: 'metalWorks', count: Math.min(10, Math.max(1, Math.ceil((suppliesNeed - suppliesMade) / (60 / 12)))), reason: 'Local supplies from metal and glass', priority: 8 });
  }
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
  // Water for the region: ice-rich sites sell to their dry neighbours when water is dear
  if (canBuild(s, st, actor, 'iceMine') && pendingCount(st, 'iceMine') === 0) {
    const m = s.markets[regionOf(st)];
    const waterPrice = m?.prices.water ?? 0;
    const regional = Object.values(s.settlements).some((o) => o.id !== st.id && regionOf(o) === regionOf(st) && (o.demand.water ?? 0) > 200);
    if (regional && waterPrice > (GOOD.water?.price ?? 0) * 5 && (st.surplus.water ?? 0) < 2000) out.push({ type: 'iceMine', count: 2, reason: 'Water for the region', priority: 6 });
  }
  if (canBuild(s, st, actor, 'atmosphereProcessor') && facilityCount(st, 'atmosphereProcessor') + pendingCount(st, 'atmosphereProcessor') < Math.max(1, pop / 400)) out.push({ type: 'atmosphereProcessor', count: 1, reason: 'Atmospheric resources', priority: 6 });
  if (canBuild(s, st, actor, 'propellantPlant') && (st.production.water ?? 0) > 20 && facilityCount(st, 'propellantPlant') + pendingCount(st, 'propellantPlant') < 1 + Math.floor((st.production.water ?? 0) / 150)) out.push({ type: 'propellantPlant', count: 1, reason: 'Propellant production', priority: 5 });
  // Oxygen-rich sites without much ice make hydrolox from their oxygen and a little imported hydrogen
  const o2Spare = (st.production.oxygen ?? 0) + (st.idleCapacity?.oxygen ?? 0) - (st.consumption.oxygen ?? 0);
  const propMade = (st.production.propellant ?? 0) + (st.idleCapacity?.propellant ?? 0);
  if (canBuild(s, st, actor, 'loxPlant') && st.landingCapacity > 0 && o2Spare > 150 && propMade < 400 + (st.routeDraw.propellant ?? 0) && pendingCount(st, 'loxPlant') === 0 && facilityCount(st, 'loxPlant') < 1 + o2Spare / 900) out.push({ type: 'loxPlant', count: 1, reason: 'Propellant from local oxygen', priority: 6 });
  if (canBuild(s, st, actor, 'electrolysisPlant') && (st.production.water ?? 0) > 10 && (st.lifeSupport.reserveDays.oxygen ?? 999) < 200 && pendingCount(st, 'electrolysisPlant') === 0 && facilityCount(st, 'electrolysisPlant') < 1 + pop / 500) out.push({ type: 'electrolysisPlant', count: 1, reason: 'Local oxygen', priority: 6 });
  if (pop >= 40 && st.science < pop * 0.02 + 20 && pendingCount(st, 'researchLab') === 0 && facilityCount(st, 'researchLab') < 1 + pop / 2000) out.push({ type: 'researchLab', count: 1, reason: 'Science output', priority: 3 });
  if (pop > 20000 && facilityCount(st, 'university') + pendingCount(st, 'university') < pop / 200000 + 1) out.push({ type: 'university', count: 1, reason: 'Education', priority: 4 });
  if (canBuild(s, st, actor, 'automationHub') && pop > 800 && facilityCount(st, 'automationHub') + pendingCount(st, 'automationHub') < Math.max(1, st.jobs / 3000)) out.push({ type: 'automationHub', count: 1, reason: 'Automation', priority: 4 });
  if (site.kind === 'orbital' && canBuild(s, st, actor, 'propellantDepot') && facilityCount(st, 'propellantDepot') + pendingCount(st, 'propellantDepot') === 0) out.push({ type: 'propellantDepot', count: 1, reason: 'Refuelling hub', priority: 5 });
  // Tankage for the fuel ships take on here each month
  const throughput = (st.routeDraw.propellant ?? 0) + (st.routeDraw.hydrogen ?? 0);
  if (!st.flags.earthHub && throughput > st.propellantCap * 0.8 && canBuild(s, st, actor, 'propellantDepot') && pendingCount(st, 'propellantDepot') === 0) {
    out.push({ type: 'propellantDepot', count: Math.max(1, Math.min(4, Math.ceil((throughput * 1.2 - st.propellantCap) / 6000))), reason: 'Refuelling throughput', priority: 7 });
  }
  // Industrial chain: substitute the most valuable imports
  const ind = industrialSuggestion(s, st, actor);
  if (ind) out.push(ind);
  if (pop > 2000 && canBuild(s, st, actor, 'shipyard') && facilityCount(st, 'shipyard') + pendingCount(st, 'shipyard') === 0 && st.closure > 0.4) out.push({ type: 'shipyard', count: 1, reason: 'Local shipbuilding', priority: 3 });
  if (canBuild(s, st, actor, 'massDriver') && facilityCount(st, 'massDriver') + pendingCount(st, 'massDriver') === 0 && totalExportsYear(st) > 20000) out.push({ type: 'massDriver', count: 1, reason: 'Bulk exports', priority: 4 });
  // Collector factories on a surface are held back by how much they can throw into orbit
  else if (st.flags.collectorLimit === 'launch' && canBuild(s, st, actor, 'massDriver') && pendingCount(st, 'massDriver') === 0) out.push({ type: 'massDriver', count: 1, reason: 'Launching collectors', priority: 6 });
  // Fusion plants short of fuel need a deuterium plant (water feedstock) before anything else
  if (facilityCount(st, 'fusionPlant') > 0 && (st.shortfall?.fusionFuel ?? 0) > 0 && pendingCount(st, 'deuteriumPlant') === 0 && canBuild(s, st, actor, 'deuteriumPlant')) {
    out.push({ type: 'deuteriumPlant', count: Math.max(1, Math.ceil(facilityCount(st, 'fusionPlant') * 2.25)), reason: 'Fusion fuel', priority: 9 });
  }
  out.sort((a, b) => b.priority - a.priority);
  // Don't add more of a facility whose existing units stand idle or decay for want of supplies
  const healthy = (type: string) => {
    let n = 0, util = 0, cond = 0;
    for (const f of st.facilities) if (f.type === type && f.count > 0) {
      n += f.count;
      util += f.utilization * f.count;
      cond += f.condition * f.count;
    }
    if (n === 0) return true;
    const def = FACILITY[type];
    if (cond / n < 0.55) return false;
    if ((def.recipe && !def.gen) || def.mining) return util / n >= 0.45;
    // Power plants standing cold for want of fuel
    if (def.gen && def.recipe && Object.keys(def.recipe.in).length) return util / n >= 0.45;
    return true;
  };
  for (let i = out.length - 1; i >= 0; i--) if (!healthy(out[i].type)) out.splice(i, 1);
  // Don't pile up projects faster than materials can arrive: only essentials when the backlog is long
  const { backlog, rate } = constructionBacklog(s, st);
  let list = backlog > Math.max(80, rate * 8) ? out.filter((x) => x.priority >= 8) : out;
  // Fix power first: no new power-hungry industry while the grid is short
  if (st.energy.ratio < 0.9) list = list.filter((x) => x.priority >= 8 || (FACILITY[x.type]?.power ?? 0) <= 0.1 || !!FACILITY[x.type]?.gen);
  return list;
}

/** Construction materials still to arrive (t) and how fast material reaches the settlement (t/month). */
export function constructionBacklog(s: GameState, st: Settlement): { backlog: number; rate: number } {
  let backlog = 0;
  for (const p of st.construction) for (const g in p.materials) backlog += Math.max(0, p.materials[g]);
  let rate = 0;
  for (const r of Object.values(s.routes)) if (r.active && r.destination === st.id) rate += r.stats.deliveredYear / 12;
  for (const g in st.production) if (!LIFE.has(g)) rate += st.production[g] * 0.5;
  return { backlog, rate };
}

const LIFE = new Set(['oxygen', 'water', 'food', 'supplies', 'propellant', 'hydrogen']);

function totalExportsYear(st: Settlement): number {
  let t = 0;
  for (const g in st.exports) t += st.exports[g];
  return t * 12;
}

const INDUSTRIAL = ['regolithRefinery', 'asteroidMiner', 'crustalMine', 'smelter', 'ceramicsWorks', 'chemicalPlant', 'fabShop', 'metalWorks', 'machineShop', 'electronicsFactory', 'semiconductorFab', 'pvFactory', 'superconductorPlant', 'fuelPlant', 'he3Harvester', 'gasScoop', 'deuteriumPlant', 'autoMiner', 'collectorFactory', 'autoFactory'];

/** Pick the industrial facility that substitutes the most valuable imports with local inputs. */
export function industrialSuggestion(s: GameState, st: Settlement, actor: string): Suggestion | null {
  let best: Suggestion | null = null;
  let bestScore = 0;
  for (const t of INDUSTRIAL) {
    if (!canBuild(s, st, actor, t)) continue;
    if (pendingCount(st, t) > 0) continue;
    if (!inputsAvailable(s, st, t)) continue;
    const roi = estimateROI(s, st, t);
    if (roi.roi > bestScore && roi.roi > 0.04) {
      bestScore = roi.roi;
      best = { type: t, count: 1, reason: `ROI ${(roi.roi * 100).toFixed(0)}%/yr`, priority: 4 };
    }
  }
  return best;
}

/**
 * Can a new recipe plant be fed from spare local output, stock, or the region's spare
 * supply? Industry built without its inputs just stands idle.
 */
export function inputsAvailable(s: GameState, st: Settlement, type: string, count = 1): boolean {
  const def = FACILITY[type];
  if (!def?.recipe || st.flags.earthHub) return true;
  // Farms, life support and liquefaction plants have their small inputs shipped in
  if (def.category === 'food' || def.category === 'lifeSupport' || type === 'loxPlant') return true;
  const m = s.markets[regionOf(st)];
  for (const g in def.recipe.in) {
    const need = def.recipe.in[g] * count;
    if (need <= 0) continue;
    const local = Math.max(0, (st.production[g] ?? 0) + (st.idleCapacity?.[g] ?? 0) - (st.consumption[g] ?? 0)) * 12 + (st.stock[g] ?? 0) * 0.5;
    const regional = m ? Math.max(0, (m.supply[g] ?? 0) - (m.demand[g] ?? 0)) * 12 * 0.5 : 0;
    if (local + regional < need * 0.6) return false;
  }
  return true;
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

export function bestDesignFor(s: GameState, originNode: string, destNode: string, owner: string, needPassengers = false, accept?: (plan: RoutePlan) => boolean): DesignChoice | null {
  let best: DesignChoice | null = null;
  const originId = settlementAtNode(s, originNode);
  const region = originId ? regionOf(s.settlements[originId]) : 'earthOrbit';
  for (const d of Object.values(s.designs).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (d.obsolete) continue;
    if (d.owner !== 'public' && d.owner !== owner) continue;
    const st = designStats(s, d);
    if (st.errors.length || st.techMissing.length) continue;
    if (st.combat > 0) continue;
    const plan = planFor(s, d, originNode, destNode);
    if (!plan.feasible) continue;
    if (accept && !accept(plan)) continue;
    const shipCost = st.cost + st.dryMass * s.earth.launchPrice;
    const cap = plan.capacityPerShipYear + (needPassengers ? plan.passengers * plan.tripsPerYear * 2 : 0);
    // Running costs over five years, including the propellant every trip burns
    let prop = 0;
    for (const n in plan.propDraw) prop += plan.propDraw[n];
    const propPrice = plan.propType ? s.markets[region]?.prices[plan.propType] ?? GOOD[plan.propType]?.price ?? 0 : 0;
    const running = (plan.opexPerTrip + prop * propPrice) * plan.tripsPerYear * 5;
    const score = cap / (shipCost + running);
    if (!best || score > best.score) best = { designId: d.id, plan, score, shipCost };
  }
  return best;
}
