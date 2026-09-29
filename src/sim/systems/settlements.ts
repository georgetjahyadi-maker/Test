// Monthly simulation of every settlement: energy, industry, life support,
// maintenance, construction, population, closure and local economy.
import type { GameState, Settlement, FacilityGroup, Stock } from '../types';
import { FACILITY, SKILLED_OCCUPATIONS } from '../content/facilities';
import { GOOD, PER_CAPITA } from '../content/goods';
import { solarFluxFactor, BODY } from '../content/bodies';
import { SITE } from '../content/sites';
import { clamp } from '../core/util';
import { rand, chance } from '../core/rng';
import { mods } from './modifiers';
import { popOf, regionOf, siteOf, credit, debit, addAlert, addHistory, isGoverned, known } from './helpers';
import { addFacility, BAND_COUNT } from './factory';
import { lightDelaySeconds } from '../physics/orbits';
import { BD, setExplain } from '../core/breakdown';

const DT = 1 / 12;
const LIFE_RESERVED = new Set(['water', 'oxygen', 'food']);

// Annual mortality by 5-year band (0-4 ... 80+)
const BASE_MORTALITY = [0.004, 0.0003, 0.0003, 0.0006, 0.0008, 0.0009, 0.0011, 0.0015, 0.002, 0.003, 0.0045, 0.007, 0.011, 0.017, 0.028, 0.045, 0.14];

const CATEGORY_ORDER: Record<string, number> = { energy: 0, mining: 1, processing: 2, food: 3, lifeSupport: 4, manufacturing: 5, infrastructure: 6, science: 7, civic: 8, security: 9, habitat: 10, dyson: 11 };
const ESSENTIAL = new Set(['habitat', 'lifeSupport', 'civic', 'food']);
const CRITICAL_UPKEEP = new Set(['lifeSupport', 'energy', 'food', 'habitat']);
/** Plants that win residents' water and air get spare parts first too. */
const LIFE_PLANTS = new Set(['iceMine', 'electrolysisPlant', 'regolithRefinery', 'atmosphereProcessor']);
const PROPELLANT_GOODS = new Set(['propellant', 'hydrogen', 'argon']);

export function localIdentity(st: Settlement): string {
  const site = SITE[st.siteId];
  if (site.kind === 'orbital' && (site.region === 'earthOrbit' || site.region === 'luna')) return 'habitatBorn';
  switch (site.region) {
    case 'luna': return 'lunar';
    case 'mars': return 'martian';
    case 'nea':
    case 'belt': return 'belt';
    case 'mercury': return 'mercurian';
    case 'venus': return 'habitatBorn';
    case 'jupiter': return 'jovian';
    case 'saturn': return 'saturnian';
    case 'outer': return 'freeSpacer';
    default: return 'habitatBorn';
  }
}

export function price(s: GameState, st: Settlement, g: string): number {
  return s.markets[regionOf(st)]?.prices[g] ?? GOOD[g]?.price ?? 0;
}

function take(st: Settlement, g: string, amt: number): number {
  const have = st.stock[g] ?? 0;
  const t = Math.min(have, Math.max(0, amt));
  if (t > 0) {
    st.stock[g] = have - t;
    st.consumption[g] = (st.consumption[g] ?? 0) + t;
  }
  return t;
}

/** Take what is available and record the rest as a shortfall that logistics will try to fill. */
function takeOrWant(st: Settlement, g: string, amt: number): number {
  const got = take(st, g, amt);
  if (amt - got > 1e-9) (st.shortfall ??= {})[g] = (st.shortfall![g] ?? 0) + (amt - got);
  return got;
}

function put(st: Settlement, g: string, amt: number): void {
  if (!(amt > 0)) return;
  st.stock[g] = (st.stock[g] ?? 0) + amt;
  st.production[g] = (st.production[g] ?? 0) + amt;
}

function jobsOf(def: (typeof FACILITY)[string]): { total: number; skilled: number } {
  let total = 0, skilled = 0;
  for (const k in def.jobs) {
    const v = (def.jobs as any)[k] ?? 0;
    total += v;
    if (SKILLED_OCCUPATIONS.has(k)) skilled += v;
  }
  return { total, skilled };
}

export function mercuryCapPerYear(s: GameState): number {
  const v = mods(s).mercuryCap ?? 0;
  if (v <= -1) return 0;
  if (v < 1) return 2e9;
  if (v < 2) return 1e13;
  return Infinity;
}

export function wageFor(st: Settlement): number {
  const pop = popOf(st);
  return 60000 + 300000 * Math.exp(-pop / 4000);
}

export function settlementsMonthly(s: GameState): void {
  const ids = Object.keys(s.settlements).sort();
  // Mercury extraction cap shared among Mercury mining settlements
  let mercurySites = 0;
  for (const id of ids) if (SITE[s.settlements[id].siteId].body === 'mercury') mercurySites++;
  s.events.flags.mercuryShare = mercurySites > 0 ? 1 / mercurySites : 1;
  for (const id of ids) updateSettlement(s, s.settlements[id]);
}

function updateSettlement(s: GameState, st: Settlement): void {
  const m = mods(s);
  const site = siteOf(st);
  const body = BODY[site.body];
  const pop = popOf(st);
  const prevUse: Stock = {};
  for (const g in st.consumption) prevUse[g] = (prevUse[g] ?? 0) + st.consumption[g];
  for (const g in st.exports) prevUse[g] = (prevUse[g] ?? 0) + st.exports[g];
  for (const g in st.routeDraw) prevUse[g] = (prevUse[g] ?? 0) + st.routeDraw[g];
  st.production = {};
  st.consumption = {};
  st.shortfall = {};
  const idle: Stock = (st.idleCapacity = {});
  const flux = solarFluxFactor(site.body);
  const outputValueByOwner: Record<string, number> = {};
  let royaltyBase = 0;

  // ---------------------------------------------------------------- Aggregates
  let housing = 0, shieldH = 0, gravH = 0, storage = 2000, propStore = 500, landing = 0, massDriver = 0, shipyard = 0;
  let medical = 0, civic = 0, security = 0, beam = 0, lsCap = 0, storageMWh = 0, education = 0, hubs = 0, jobsRaw = 0, skilledRaw = 0;
  for (const f of st.facilities) {
    const def = FACILITY[f.type];
    if (!def || f.count <= 0) continue;
    const n = f.count;
    if (def.housing) {
      const h = def.housing * n * (f.condition > 0.2 ? 1 : 0.5);
      housing += h;
      shieldH += h * (def.shielding ?? 0);
      gravH += h * (def.gravity ?? 0);
    }
    storage += (def.storage ?? 0) * n;
    propStore += (def.propellantStorage ?? 0) * n;
    landing += (def.landing ?? 0) * n;
    massDriver += (def.massDriver ?? 0) * n * f.condition;
    shipyard += (def.shipyard ?? 0) * n * f.condition;
    medical += (def.medical ?? 0) * n;
    civic += (def.civic ?? 0) * n;
    security += (def.security ?? 0) * n;
    beam += (def.beamReceiveMW ?? 0) * n;
    lsCap += (def.lifeSupportCapacity ?? 0) * n * f.condition;
    storageMWh += (def.storageMWh ?? 0) * n;
    education += (def.education ?? 0) * n;
    if (f.type === 'automationHub') hubs += n;
    if (f.enabled) {
      const j = jobsOf(def);
      jobsRaw += j.total * n;
      skilledRaw += j.skilled * n;
    }
  }
  st.housing = housing;
  st.shielding = housing > 0 ? shieldH / housing : 0;
  st.gravityCountermeasure = housing > 0 ? clamp(gravH / housing, 0, 1) : 0;
  st.storageCap = storage;
  st.propellantCap = propStore;
  st.landingCapacity = landing;
  st.massDriverCapacity = massDriver;
  st.shipyardCapacity = shipyard;
  st.medical = medical;
  st.civic = civic;
  st.security = security;
  st.beamCapacity = beam;
  st.lifeSupport.capacity = lsCap;

  // ---------------------------------------------------------------- Labor
  const b = st.pop.bands;
  let working = 0, elders = 0;
  for (let i = 3; i <= 12; i++) working += b[i];
  for (let i = 13; i < BAND_COUNT; i++) elders += b[i];
  const workforce = working * 0.8 + elders * 0.05;
  const autoMax = Math.max(1, Math.min(6, m.automationMax ?? 1));
  const hubFactor = clamp(0.35 + (hubs * 3000) / Math.max(300, jobsRaw), 0, 1);
  const automation = Math.min(autoMax, 1 + (autoMax - 1) * hubFactor);
  st.automation = automation;
  const jobFactor = Math.max(0.08, 1 - 0.14 * (automation - 1));
  const jobs = jobsRaw * jobFactor;
  const skilledJobs = skilledRaw * jobFactor;
  // Services, construction, administration, education and health employ much of the population
  const serviceJobs = workforce * 0.75;
  const laborRatio = jobs > 0 ? Math.min(1, workforce / jobs) : 1;
  const skilledWorkers = workforce * st.pop.educated;
  const skillRatio = skilledJobs > 0 ? Math.min(1, skilledWorkers / skilledJobs) : 1;
  st.jobs = jobs;
  st.workforce = workforce;
  st.employed = Math.min(workforce, jobs + serviceJobs);
  st.pop.unemployment = workforce > 0 ? Math.max(0, (workforce - jobs - serviceJobs) / workforce) : 0;
  const wage = wageFor(st);
  st.economy.wage = wage;

  // ---------------------------------------------------------------- Energy
  const sorted = [...st.facilities].sort((a, b2) => (CATEGORY_ORDER[FACILITY[a.type]?.category] ?? 20) - (CATEGORY_ORDER[FACILITY[b2.type]?.category] ?? 20) || (a.id < b2.id ? -1 : 1));
  // Output nobody uses piles up; plants throttle back once a good is overstocked
  const overstocked = (g: string) => (st.stock[g] ?? 0) > Math.max(300, (prevUse[g] ?? 0) * 8 + (st.demand[g] ?? 0) * 2);
  // Facilities that cannot run for lack of inputs, or whose output is not needed, draw little power
  const runFactor = (f: FacilityGroup): number => {
    const def = FACILITY[f.type];
    if (!def) return 0;
    let r = 1;
    if (def.recipe && !def.gen) {
      for (const g in def.recipe.in) {
        const need = def.recipe.in[g] * f.count * DT;
        if (need > 0) r = Math.min(r, (st.stock[g] ?? 0) / need);
      }
      const outs = Object.keys(def.recipe.out);
      if (outs.length && outs.every((g) => overstocked(g))) r = Math.min(r, 0.15);
    } else if (def.mining) {
      // Mines idle down (and draw little) when everything they would dig is overstocked
      const dep = st.deposits.filter((d) => def.mining!.depositTypes.includes(d.type) && d.reserve > 0).sort((a, b2) => b2.grade / b2.difficulty - a.grade / a.difficulty)[0];
      if (!dep) r = 0.05;
      else if (!Object.keys(dep.yields).some((g) => dep.yields[g] > 0.002 && !overstocked(g))) r = 0.15;
    }
    return clamp(r, 0.05, 1);
  };
  let essentialDemand = pop * 0.003;
  let industrialDemand = 0;
  for (const f of st.facilities) {
    const def = FACILITY[f.type];
    if (!def || !f.enabled || f.count <= 0) continue;
    const p = def.power * f.count * runFactor(f);
    if (ESSENTIAL.has(def.category)) essentialDemand += p;
    else industrialDemand += p;
  }
  const bySource: Record<string, number> = {};
  let gen = 0;
  const demandTotal = essentialDemand + industrialDemand;
  // Storage only has to carry the share of demand that solar serves through the night
  let solarRaw = 0;
  for (const f of st.facilities) {
    const def = FACILITY[f.type];
    if (def?.genType === 'solar' && f.enabled && f.count > 0) solarRaw += def.gen! * f.count * f.condition * flux * site.illumination * (site.body === 'titan' ? 0.3 : 1);
  }
  const storageNeed = site.illumination < 0.7 ? Math.min(demandTotal, solarRaw) * 24 * 7 : 0;
  const batteryUse = storageMWh > 0 ? Math.min(1, storageNeed / storageMWh) : 0;
  for (const f of sorted) {
    const def = FACILITY[f.type];
    if (!def || !def.gen || !f.enabled || f.count <= 0) continue;
    let out = def.gen * f.count * f.condition;
    if (def.genType === 'solar') {
      out *= flux * site.illumination;
      if (site.illumination < 0.7) {
        const need = Math.max(1e-6, storageNeed);
        out *= 0.55 + 0.45 * Math.min(1, storageMWh / need);
      }
      if (site.body === 'titan') out *= 0.3;
    } else if (def.recipe && Object.keys(def.recipe.in).length) {
      // fuel-burning plant
      const effMult = def.genType === 'fusion' ? Math.max(0.3, 1 - (m.fusionEfficiency ?? 0)) : 1;
      let ratio = 1;
      for (const g in def.recipe.in) {
        const need = def.recipe.in[g] * f.count * DT * effMult;
        const got = takeOrWant(st, g, need);
        ratio = Math.min(ratio, need > 0 ? got / need : 1);
      }
      if (def.genType === 'fusion') out *= 1 + (m.fusionEfficiency ?? 0) * 0.3;
      out *= ratio;
      f.limiting = ratio < 0.99 ? 'Fuel shortage' : undefined;
    }
    const laborR = jobsOf(def).total > 0 ? laborRatio : 1;
    out *= Math.min(1, 0.5 + laborR * 0.5);
    f.utilization = def.gen > 0 ? out / Math.max(1e-9, def.gen * f.count) : 1;
    gen += out;
    const key = def.genType ?? 'other';
    bySource[key] = (bySource[key] ?? 0) + out;
  }
  const beamMW = Math.min(beam, (st.flags.beamMW as number) ?? 0);
  if (beamMW > 0) {
    gen += beamMW;
    bySource.beamed = beamMW;
  }
  const essRatio = essentialDemand > 0 ? Math.min(1, gen / essentialDemand) : 1;
  const indRatio = industrialDemand > 0 ? clamp((gen - essentialDemand) / industrialDemand, 0, 1) : 1;
  st.energy = { gen, demand: demandTotal, storage: storageMWh, ratio: demandTotal > 0 ? Math.min(1, gen / demandTotal) : 1, bySource };

  // ---------------------------------------------------------------- Operations
  // Industry may not eat into three months of the residents' own water, oxygen and food
  const lsServed0 = pop > 0 ? Math.min(pop, lsCap) / pop : 1;
  const rW0 = clamp(m.lsWater ?? 0.93, 0, 0.995), rO0 = clamp(m.lsOxygen ?? 0.45, 0, 0.99);
  const lifeReserve: Stock = {
    water: 3 * pop * PER_CAPITA.water * DT * (lsServed0 * (1 - rW0) + (1 - lsServed0)),
    oxygen: 3 * pop * PER_CAPITA.oxygen * DT * (lsServed0 * (1 - rO0) + (1 - lsServed0)),
    food: 3 * pop * PER_CAPITA.food * DT,
  };
  const availFor = (g: string) => Math.max(0, (st.stock[g] ?? 0) - (lifeReserve[g] ?? 0));
  const capYear = site.body === 'mercury' ? mercuryCapPerYear(s) * ((s.events.flags.mercuryShare as number) ?? 1) : Infinity;
  let mercuryMonthLeft = capYear / 12;
  const priceOf = (g: string) => price(s, st, g);
  for (const f of sorted) {
    const def = FACILITY[f.type];
    if (!def || f.count <= 0 || def.gen) continue;
    if (!f.enabled) {
      f.utilization = 0;
      continue;
    }
    const energyR = def.power <= 0 ? 1 : ESSENTIAL.has(def.category) ? essRatio : indRatio;
    const j = jobsOf(def);
    let laborR = j.total > 0 ? laborRatio : 1;
    if (j.skilled > 0) laborR *= Math.pow(skillRatio, j.skilled / j.total);
    const condR = Math.min(1, f.condition * 1.1);
    let util = Math.min(energyR, laborR, condR);
    if (def.storageMWh) util = Math.min(util, batteryUse);
    let limiting: string | undefined = util === energyR && energyR < 0.99 ? 'Power shortage' : util === laborR && laborR < 0.99 ? 'Labor shortage' : util === condR && condR < 0.99 ? 'Poor condition' : undefined;
    let outValue = 0, inValue = 0;
    if (def.mining && f.type !== 'autoFactory') {
      const allowCore = (m.mercuryCap ?? 0) >= 2;
      const deps = st.deposits.filter((d) => def.mining!.depositTypes.includes(d.type) && d.reserve > 0 && (d.type !== 'core' || allowCore));
      if (deps.length === 0) {
        util = 0;
        limiting = 'No suitable deposit';
      } else {
        deps.sort((a, b2) => b2.grade / b2.difficulty - a.grade / a.difficulty);
        const dep = deps[0];
        // Idle down when everything this deposit yields is already overstocked
        const yieldsWanted = Object.keys(dep.yields).some((g) => dep.yields[g] > 0.002 && !overstocked(g));
        if (!yieldsWanted) {
          util *= 0.15;
          limiting = 'Output not needed (storage full)';
        }
        let ore = (def.mining.orePerYear * f.count * util * DT) / Math.sqrt(dep.difficulty);
        if (site.body === 'mercury') {
          if (ore > mercuryMonthLeft) {
            limiting = 'Mercury extraction cap';
            ore = Math.max(0, mercuryMonthLeft);
          }
          mercuryMonthLeft -= ore;
        }
        ore = Math.min(ore, dep.reserve);
        dep.reserve -= ore;
        dep.survey = Math.min(1, dep.survey + 0.002 * f.count);
        for (const g in dep.yields) {
          const amt = ore * dep.yields[g] * dep.grade;
          put(st, g, amt);
          outValue += amt * priceOf(g);
        }
        royaltyBase += outValue;
        util = def.mining.orePerYear > 0 ? util * (ore / Math.max(1e-9, (def.mining.orePerYear * f.count * util * DT) / Math.sqrt(dep.difficulty))) : 0;
      }
    } else if (def.recipe && (Object.keys(def.recipe.in).length || Object.keys(def.recipe.out).length)) {
      // Avoid producing goods nobody needs when storage is full
      const outs = Object.keys(def.recipe.out);
      if (outs.length && outs.every((g) => overstocked(g))) {
        // Held-back output still counts as local supply, so imports do not crowd it out
        for (const g of outs) idle[g] = (idle[g] ?? 0) + def.recipe.out[g] * f.count * util * 0.85 * DT;
        util *= 0.15;
        limiting = 'Output not needed (storage full)';
      }
      const scale = f.count * util * DT;
      let ratio = 1;
      let worst = '';
      for (const g in def.recipe.in) {
        const need = def.recipe.in[g] * scale;
        if (need <= 0) continue;
        const r = Math.min(1, availFor(g) / need);
        if (r < ratio) {
          ratio = r;
          worst = g;
        }
      }
      // Workshops ask for inputs too while residents go short of supplies
      const critical = def.category === 'food' || def.category === 'lifeSupport' || f.type === 'loxPlant' || (f.type === 'fabShop' && ((st.flags.shortSupplies as number) ?? 0) > 0.02);
      for (const g in def.recipe.in) {
        const t = take(st, g, def.recipe.in[g] * scale * ratio);
        inValue += t * priceOf(g);
        // Farms and life-support plants ask logistics for the inputs they lacked
        if (critical && ratio < 0.999) (st.shortfall ??= {})[g] = (st.shortfall![g] ?? 0) + def.recipe.in[g] * scale * (1 - ratio);
      }
      for (const g in def.recipe.out) {
        const amt = def.recipe.out[g] * scale * ratio;
        put(st, g, amt);
        outValue += amt * priceOf(g);
        // A liquefaction plant waiting on hydrogen still makes this a refuelling point to plan around
        if (f.type === 'loxPlant' && ratio < 0.999) idle[g] = (idle[g] ?? 0) + def.recipe.out[g] * scale * (1 - ratio);
      }
      if (ratio < 0.99 && scale > 0) limiting = LIFE_RESERVED.has(worst) && (st.stock[worst] ?? 0) > 0 ? `${GOOD[worst]?.name ?? worst} reserved for residents` : `Short of ${GOOD[worst]?.name ?? worst}`;
      util *= ratio;
    }
    f.utilization = util;
    f.limiting = limiting;
    // Owner economics
    const opex = def.opex * f.count * DT * (1 + (m.settlementCost ?? 0));
    const labor = j.total * f.count * jobFactor * Math.min(1, laborRatio) * wage * DT;
    let net = outValue - inValue - opex - labor;
    let fees = 0;
    if (def.housing && housing > 0) fees += (def.housing * f.count / housing) * Math.min(pop, housing) * 18000 * DT;
    if (def.lifeSupportCapacity && lsCap > 0) fees += (def.lifeSupportCapacity * f.count / lsCap) * Math.min(pop, lsCap) * 6000 * DT;
    net += fees;
    st.economy.treasury -= fees;
    outputValueByOwner[f.owner] = (outputValueByOwner[f.owner] ?? 0) + net;
    // Settlement market buys outputs and sells inputs
    st.economy.treasury += inValue - outValue;
  }

  // ---------------------------------------------------------------- Maintenance (critical)
  // Spare parts go to life support, power, farms and habitats before anything else
  const mm = 1 + (m.maintenance ?? 0);
  const critical = (f: FacilityGroup) => CRITICAL_UPKEEP.has(FACILITY[f.type]?.category) || LIFE_PLANTS.has(f.type);
  const maintain = (f: FacilityGroup) => {
    const def = FACILITY[f.type];
    if (!def || f.count <= 0) return;
    if (!f.enabled) {
      // Mothballed plant needs no upkeep but slowly deteriorates
      f.condition = Math.max(0.05, f.condition - 0.001);
      return;
    }
    let ratio = 1;
    // Idle equipment wears more slowly than equipment at work
    const wear = def.housing || def.lifeSupportCapacity ? 1 : Math.max(0.2, Math.min(1, f.utilization ?? 1));
    for (const g in def.maintenance) {
      const nd = def.maintenance[g] * f.count * DT * mm * wear;
      if (nd <= 0) continue;
      const got = takeOrWant(st, g, nd);
      debit(s, f.owner, got * priceOf(g), 'Facility maintenance');
      st.economy.treasury += got * priceOf(g);
      ratio = Math.min(ratio, got / nd);
    }
    if (ratio >= 0.95) f.condition = Math.min(1, f.condition + (1 - f.condition) * 0.12);
    else f.condition = Math.max(0.05, f.condition - 0.02 * (1 - ratio) - 0.001);
    f.condition = Math.max(0.05, f.condition - 0.0004);
  };
  for (const f of sorted) if (critical(f)) maintain(f);

  // ---------------------------------------------------------------- Life support
  const lsServed = Math.min(pop, lsCap);
  const served = pop > 0 ? lsServed / pop : 1;
  const rW = clamp(m.lsWater ?? 0.93, 0, 0.995);
  const rO = clamp(m.lsOxygen ?? 0.45, 0, 0.99);
  const need: Stock = {
    water: pop * PER_CAPITA.water * DT * (served * (1 - rW) + (1 - served)),
    oxygen: pop * PER_CAPITA.oxygen * DT * (served * (1 - rO) + (1 - served)),
    food: pop * PER_CAPITA.food * DT,
    supplies: pop * PER_CAPITA.supplies * DT,
  };
  const short: Record<string, number> = {};
  let lifeValue = 0;
  for (const g in need) {
    const got = take(st, g, need[g]);
    short[g] = need[g] > 0 ? 1 - got / need[g] : 0;
    lifeValue += got * priceOf(g);
    const daily = need[g] / (365.25 / 12);
    st.lifeSupport.reserveDays[g] = daily > 0 ? (st.stock[g] ?? 0) / daily : 999;
  }
  st.lifeSupport.waterRecovery = rW * served;
  st.lifeSupport.oxygenRecovery = rO * served;
  const foodProd = st.production.food ?? 0;
  st.lifeSupport.foodSelf = need.food > 0 ? clamp(foodProd / need.food, 0, 5) : 0;
  st.flags.shortO2 = short.oxygen;
  st.flags.shortWater = short.water;
  st.flags.shortFood = short.food;
  st.flags.shortSupplies = short.supplies;

  // ---------------------------------------------------------------- Maintenance (everything else)
  for (const f of sorted) if (!critical(f)) maintain(f);

  // ---------------------------------------------------------------- Construction
  const done: string[] = [];
  for (const p of st.construction) {
    const def = FACILITY[p.type];
    const perMonth = 1 / Math.max(1, p.monthsTotal);
    let drawRatio = 1;
    let worst = '';
    for (const g in p.materialsTotal) {
      const want = Math.min(p.materials[g] ?? 0, p.materialsTotal[g] * perMonth);
      if (want <= 1e-9) continue;
      const r = Math.min(1, (st.stock[g] ?? 0) / want);
      if (r < drawRatio) {
        drawRatio = r;
        worst = g;
      }
    }
    const laborF = Math.max(0.35, laborRatio);
    const energyF = indRatio >= 0.5 ? 1 : 0.5 + indRatio;
    const step = perMonth * drawRatio * laborF * energyF;
    if (step > 0) {
      for (const g in p.materialsTotal) {
        const amt = Math.min(p.materials[g] ?? 0, p.materialsTotal[g] * step);
        const got = take(st, g, amt);
        p.materials[g] = (p.materials[g] ?? 0) - got;
        const v = got * priceOf(g);
        debit(s, p.owner, v, 'Construction materials');
        st.economy.treasury += v;
      }
      p.progress = Math.min(1, p.progress + step);
    }
    p.stalled = drawRatio < 0.999 ? `Waiting for ${GOOD[worst]?.name ?? worst}` : laborF < 0.99 ? 'Short of workers' : undefined;
    let remaining = 0;
    for (const g in p.materials) remaining += Math.max(0, p.materials[g]);
    if (p.progress >= 0.999 || (remaining <= 1e-6 && p.progress >= 0.95)) {
      addFacility(st, p.type, p.owner, p.count, s.day);
      done.push(p.id);
      if (def && (def.buildCost >= 1e10 || def.category === 'dyson' || p.type === 'massDriver' || p.type === 'fusionPlant' || p.type === 'semiconductorFab' || p.type === 'oneillCylinder' || p.type === 'stanfordTorus')) {
        addHistory(s, `${def.name} completed at ${st.name}`, `${p.count > 1 ? p.count + ' × ' : ''}${def.name} ${p.count > 1 ? 'enter' : 'enters'} service at ${st.name}.`, 'industry', def.buildCost >= 1e11 ? 3 : 2, [st.id]);
      }
    }
  }
  if (done.length) st.construction = st.construction.filter((p) => !done.includes(p.id));

  // ---------------------------------------------------------------- Storage limits
  let total = 0, propTotal = 0;
  for (const g in st.stock) {
    if (PROPELLANT_GOODS.has(g)) propTotal += st.stock[g];
    else total += st.stock[g];
  }
  // Tanks bound what can be held, though ships docked for fuel take some straight from arriving tankers
  let draws = 0;
  for (const g of PROPELLANT_GOODS) draws += prevUse[g] ?? 0;
  const propLimit = st.propellantCap + draws * 0.5;
  if (propTotal > propLimit) {
    const k = propLimit / propTotal;
    for (const g of PROPELLANT_GOODS) if (st.stock[g]) st.stock[g] *= k;
  }
  if (total > st.storageCap) {
    // Discard lowest-value bulk first, but residents' water, air, food and supplies last
    const keep = (g: string) => (LIFE_RESERVED.has(g) || g === 'supplies' ? 1 : 0);
    const goods = Object.keys(st.stock).filter((g) => !PROPELLANT_GOODS.has(g)).sort((a, c) => keep(a) - keep(c) || (GOOD[a]?.price ?? 0) - (GOOD[c]?.price ?? 0));
    let excess = total - st.storageCap;
    for (const g of goods) {
      if (excess <= 0) break;
      const cut = Math.min(st.stock[g], excess);
      st.stock[g] -= cut;
      excess -= cut;
    }
  }
  for (const g in st.stock) if (!(st.stock[g] > 1e-6)) delete st.stock[g];

  // ---------------------------------------------------------------- Population
  updatePopulation(s, st, { short, served, housing, jobs, workforce, laborRatio });

  // ---------------------------------------------------------------- Closure & science
  let dVal = 0, pVal = 0;
  const demandAll: Stock = {};
  for (const g in st.consumption) demandAll[g] = (demandAll[g] ?? 0) + st.consumption[g];
  for (const g in demandAll) {
    const pr = GOOD[g]?.price ?? 0;
    const d = demandAll[g];
    dVal += d * pr;
    pVal += Math.min(d, st.production[g] ?? 0) * pr;
  }
  const closureNow = dVal > 0 ? pVal / dVal : 0;
  st.closure = st.closure * 0.85 + closureNow * 0.15;
  let science = 0;
  for (const f of st.facilities) {
    const def = FACILITY[f.type];
    if (def?.science) science += def.science * f.count * (f.utilization ?? 1);
  }
  if (SITE[st.siteId].features.includes('radioQuiet')) science *= 1.3;
  st.science = science;
  st.kind = classifyKind(st);

  // ---------------------------------------------------------------- Economy
  // Residents contribute from wages; royalties flow to the UNE
  const employedNow = Math.min(workforce, jobs + serviceJobs);
  const contributions = employedNow * wage * 0.38 * DT;
  st.economy.treasury += contributions;
  const royaltyRate = (m.royaltyRate ?? 0) * (s.une.competencies.resourcePolicy === 'national' ? 0 : 1);
  const royalty = royaltyBase * royaltyRate;
  if (royalty > 0) {
    credit(s, 'une', royalty, 'Resource royalties');
    (s.events.flags as any).royaltyYTD = ((s.events.flags as any).royaltyYTD ?? 0) + royalty;
  }
  // Pay facility owners their operating result (royalty deducted proportionally)
  const totalPos = Object.values(outputValueByOwner).reduce((a, v) => a + Math.max(0, v), 0);
  for (const owner of Object.keys(outputValueByOwner).sort()) {
    let v = outputValueByOwner[owner];
    if (v > 0 && totalPos > 0) v -= royalty * (v / totalPos);
    if (v >= 0) credit(s, owner, v, 'Facility income');
    else debit(s, owner, -v, 'Facility operations');
  }
  // Output at local prices plus the value added by everyone at work
  const gdp = sumValue(s, st, st.production) * 12 + employedNow * wage * 1.4 + pop * 5000;
  st.economy.gdp = gdp;
  // Local taxes for governed settlements
  if (isGoverned(st)) {
    const tax = gdp * 0.08 * DT;
    st.economy.taxes = tax * 12;
    st.economy.treasury += tax;
  }
  settleAccounts(s, st, lifeValue);
}

function sumValue(s: GameState, st: Settlement, goods: Stock): number {
  let v = 0;
  for (const g in goods) v += goods[g] * price(s, st, g);
  return v;
}

function classifyKind(st: Settlement): string {
  const w: Record<string, number> = {};
  for (const f of st.facilities) {
    const def = FACILITY[f.type];
    if (!def) continue;
    const k = def.category === 'mining' ? 'mining' : def.category === 'processing' || def.category === 'manufacturing' ? 'industrial' : def.category === 'science' ? 'research' : def.category === 'energy' ? 'energy' : def.category === 'dyson' ? 'dyson' : def.category === 'habitat' ? 'habitat' : 'civic';
    w[k] = (w[k] ?? 0) + def.buildCost * f.count;
  }
  let best = 'research', bv = 0;
  for (const k of Object.keys(w).sort()) {
    if (k === 'habitat' || k === 'civic') continue;
    if (w[k] > bv) {
      bv = w[k];
      best = k;
    }
  }
  if ((w.habitat ?? 0) > bv * 1.5) best = 'habitat';
  return best;
}

/** Cover deficits through sponsors, or pass surpluses to sponsors/local treasury. */
function settleAccounts(s: GameState, st: Settlement, lifeValue: number): void {
  const bal = st.economy.treasury;
  st.economy.subsidy = 0;
  st.economy.uneTransfer = 0;
  if (isGoverned(st)) {
    // Governed settlements may run modest debts; the UNE (ETSA) cushions small colonies,
    // and the powers that founded them keep paying their share of what it costs to supply them.
    if (bal < 0 && st.status !== 'independent' && st.status !== 'associated') {
      const pop = popOf(st);
      const support = Math.min(-bal, pop * 60000 * DT + 5e7 * DT);
      debit(s, 'une', support, 'Settlement support');
      st.economy.treasury += support;
      st.economy.uneTransfer = support;
      st.economy.subsidy = support * 12;
      const deficit = -st.economy.treasury;
      if (deficit > 0) {
        let totalShare = 0;
        for (const k in st.sponsors) totalShare += st.sponsors[k];
        let paid = 0;
        for (const k of Object.keys(st.sponsors).sort()) {
          const want = deficit * (st.sponsors[k] / Math.max(1e-9, totalShare));
          const n = s.nations[k];
          // Sponsors pay out of their space budgets, never more than a slice of what they hold
          const can = n ? Math.max(0, n.spaceFunds) * 0.05 : k === 'une' ? Math.max(0, s.une.treasury) * 0.01 : 0;
          const amt = Math.min(want, can);
          if (amt <= 0) continue;
          debit(s, k, amt, 'Colonial support');
          if (k === 'une') st.economy.uneTransfer += amt;
          paid += amt;
        }
        st.economy.treasury += paid;
        st.economy.subsidy += paid * 12;
      }
    }
    st.economy.balance = st.economy.treasury;
    return;
  }
  if (bal < 0) {
    const deficit = -bal;
    let totalShare = 0;
    for (const k in st.sponsors) totalShare += st.sponsors[k];
    for (const k of Object.keys(st.sponsors).sort()) {
      const share = st.sponsors[k] / Math.max(1e-9, totalShare);
      const amt = deficit * share;
      const kind = s.nations[k] ? 'nation' : s.corporations[k] ? 'corp' : k === 'une' ? 'une' : 'other';
      if (kind === 'other') continue;
      debit(s, k, amt, 'Settlement support');
      if (k === 'une') st.economy.uneTransfer += amt;
    }
    st.economy.subsidy = deficit * 12;
    st.economy.treasury = 0;
  } else if (bal > 1e6) {
    // Surpluses from territories flow to sponsors (territorial revenue)
    const payout = bal * 0.8;
    let totalShare = 0;
    for (const k in st.sponsors) totalShare += st.sponsors[k];
    for (const k of Object.keys(st.sponsors).sort()) {
      const amt = payout * (st.sponsors[k] / Math.max(1e-9, totalShare));
      credit(s, k, amt, 'Territorial revenue');
    }
    st.economy.treasury -= payout;
    st.flags.extracted = ((st.flags.extracted as number) ?? 0) * 0.95 + payout;
  }
  st.economy.balance = st.economy.treasury;
}

interface PopCtx {
  short: Record<string, number>;
  served: number;
  housing: number;
  jobs: number;
  workforce: number;
  laborRatio: number;
}

function updatePopulation(s: GameState, st: Settlement, c: PopCtx): void {
  const m = mods(s);
  const site = siteOf(st);
  const p = st.pop;
  const b = p.bands;
  const pop = b.reduce((a, v) => a + v, 0);
  if (pop <= 0.5) {
    for (let i = 0; i < BAND_COUNT; i++) b[i] = 0;
    // An emptied base with working habitats and life support asks for a new crew
    const habitable = c.housing > 0 && st.lifeSupport.capacity > 0 && st.energy.gen >= 1;
    st.flags.migrationDemand = habitable ? Math.min(c.housing, Math.max(8, c.jobs * 0.5)) * 0.25 : 0;
    const region = regionOf(st);
    if (habitable && (region === 'earthOrbit' || region === 'luna')) immigrate(st, Math.min(12, c.housing), 'terran');
    return;
  }
  // Aging (1/60 of each 5-year band per month)
  for (let i = BAND_COUNT - 1; i >= 1; i--) {
    const move = b[i - 1] / 60;
    b[i - 1] -= move;
    b[i] += move;
  }
  // Environment
  let radMult = 1;
  let dose = site.radiation * (1 - st.shielding);
  if (site.body === 'mars' && (m.marsRadiation ?? 0) < 0) dose *= 1 + (m.marsRadiation ?? 0);
  const storms = st.flags.solarStorm ? 1 : 0;
  dose *= 1 + storms;
  p.radiation = dose;
  radMult = 1 + (Math.max(0, dose - 20) / 400) * Math.max(0.1, 1 + (m.radiationHealth ?? 0));
  const gEff = (1 - st.gravityCountermeasure) * site.gravity + st.gravityCountermeasure * 1;
  const gHealth = Math.max(0.1, 1 + (m.gravityHealth ?? 0));
  p.gravityDebt = clamp(p.gravityDebt + ((Math.max(0, 0.8 - gEff) * 0.04 * gHealth) - 0.01) * DT, 0, 1);
  const gravMult = 1 + p.gravityDebt * 0.8;
  const shortMult = 1 + c.short.oxygen * 40 + c.short.water * 12 + c.short.food * 4;
  const medCov = pop > 0 ? Math.min(1, st.medical / pop) : 1;
  const medMult = 1.25 - 0.35 * medCov;
  const hMult = radMult * gravMult * shortMult * medMult * (1 - (m.healthBonus ?? 0));
  const lifeBonus = m.lifeExpectancy ?? 0;
  let deaths = 0;
  for (let i = 0; i < BAND_COUNT; i++) {
    const rate = Math.min(0.9, BASE_MORTALITY[i] * hMult * (i >= 13 ? Math.max(0.3, 1 - lifeBonus / 40) : 1));
    const d = b[i] * rate * DT;
    b[i] -= d;
    deaths += d;
  }
  if (c.short.oxygen > 0.5) {
    // acute asphyxiation emergency
    const k = 0.15 * c.short.oxygen;
    for (let i = 0; i < BAND_COUNT; i++) {
      const d = b[i] * k;
      b[i] -= d;
      deaths += d;
    }
    if (!st.flags.o2Disaster) {
      st.flags.o2Disaster = s.day;
      addHistory(s, `Life-support disaster at ${st.name}`, `Oxygen reserves at ${st.name} ran out. ${Math.round(deaths)} people died before emergency supplies arrived.`, 'disaster', 4, [st.id]);
      addAlert(s, 'crit', `${st.name}: oxygen exhausted — people are dying`, st.id);
    }
  }
  // Families & births
  const lowG = (m.lowGBirths ?? 0) > 0;
  const permanent = st.status !== 'outpost' && pop >= 80 && medCov >= 0.5 && (dose < 150 || st.shielding > 0.7);
  p.familiesAllowed = permanent && st.flags.familiesBanned !== true;
  let births = 0;
  if (p.familiesAllowed) {
    const gravF = gEff >= 0.3 ? 0.95 : lowG ? 0.85 : 0.35;
    const housingF = pop < c.housing ? 1 : 0.5;
    const tfr = 2.2 * (0.6 + 0.8 * p.wellbeing) * housingF * gravF;
    let women = 0;
    for (let i = 3; i <= 9; i++) women += b[i] * 0.5;
    births = (women * tfr / 35) * DT;
    b[0] += births;
    p.localBorn += births;
    if (births > 0 && !s.milestones.first_offworld_birth && p.localBorn >= 1) {
      s.events.flags.firstBirthSettlement = st.id;
    }
  }
  // Culture: births take local identity; slow drift of long-term residents
  const local = localIdentity(st);
  if (births > 0) addCulture(p.cultures, local, births / Math.max(1, pop));
  const delayMin = lightDelaySeconds('earth', site.body, s.day) / 60;
  addCulture(p.cultures, local, 0.0012 * (1 + Math.min(3, delayMin / 5)));

  // Migration
  const popNow = b.reduce((a, v) => a + v, 0);
  const room = Math.max(0, c.housing * 0.98 - popNow);
  const vacancy = Math.max(0, c.jobs - c.workforce);
  const shortage = c.short.oxygen + c.short.water + c.short.food > 0.05;
  const attract = clamp(p.wellbeing * (1 - p.unemployment) * (shortage ? 0.2 : 1), 0, 1);
  // Newcomers only while life support, supplies and spare parts keep up
  const rdays = st.lifeSupport.reserveDays;
  const partsShort = (st.shortfall?.machinery ?? 0) + (st.shortfall?.supplies ?? 0) > 1 + popNow * 0.0005;
  const secure = Math.min(rdays.water ?? 999, rdays.oxygen ?? 999, rdays.food ?? 999, rdays.supplies ?? 999) > 30 && !partsShort;
  const baseDemand = secure ? Math.min(room, vacancy * 1.25 + (st.status !== 'outpost' ? room * 0.04 : 0)) : 0;
  const migrationDemand = baseDemand * (0.4 + attract) * (1 + (m.migration ?? 0));
  st.flags.migrationDemand = migrationDemand;
  // Commercial crew service in cislunar space
  const region = regionOf(st);
  let arrivals = 0;
  if ((region === 'earthOrbit' || region === 'luna') && migrationDemand > 0.1) {
    const scale = Math.max(1, s.earth.launchCapacity / 25000);
    arrivals = Math.min(migrationDemand, 12 * scale + popNow * 0.02);
    const cost = arrivals * 2.5e6 / Math.sqrt(scale);
    st.economy.treasury -= cost;
    immigrate(st, arrivals, 'terran');
  }
  p.immigrants = p.immigrants * (11 / 12) + arrivals;
  // Emigration when life is poor
  let leaving = 0;
  if (p.wellbeing < 0.38 || p.unemployment > 0.25) {
    leaving = popNow * clamp((0.38 - p.wellbeing) * 0.06 + Math.max(0, p.unemployment - 0.25) * 0.05, 0, 0.05);
    if (region !== 'earthOrbit' && region !== 'luna') leaving *= 0.3;
    const k = leaving / Math.max(1, popNow);
    for (let i = 0; i < BAND_COUNT; i++) b[i] *= 1 - k;
  }
  // Overcrowding beyond housing forces departures
  const after = b.reduce((a, v) => a + v, 0);
  if (after > c.housing * 1.1 && c.housing > 0) {
    const k = 1 - (c.housing * 1.1) / after;
    for (let i = 0; i < BAND_COUNT; i++) b[i] *= 1 - k * 0.3;
    leaving += after * k * 0.3;
  }
  p.emigrants = p.emigrants * (11 / 12) + leaving;
  p.births = p.births * (11 / 12) + births;
  p.deaths = p.deaths * (11 / 12) + deaths;

  // Education
  const eduCov = popNow > 0 ? Math.min(1, (st.civic * 0.3 + (st.facilities.find((f) => f.type === 'university') ? 1 : 0) * 10000) / popNow) : 0;
  const eduTarget = 0.35 + 0.45 * eduCov + (st.status === 'outpost' ? 0.3 : 0);
  p.educated = clamp(p.educated + (eduTarget - p.educated) * 0.01, 0.1, 0.95);

  // Health and wellbeing
  const civCov = popNow > 0 ? Math.min(1, st.civic / popNow) : 1;
  const crowd = c.housing > 0 ? Math.max(0, popNow / c.housing - 0.95) : 1;
  const isolation = Math.min(0.2, delayMin / 120);
  const shortPain = c.short.oxygen * 2 + c.short.water + c.short.food * 0.8 + c.short.supplies * 0.4;
  p.health = clamp(1.05 - (radMult - 1) * 0.6 - p.gravityDebt * 0.4 - shortPain - (1 - medCov) * 0.2, 0, 1);
  p.psych = clamp(0.55 + civCov * 0.3 + (popNow > 1000 ? 0.08 : 0) - crowd * 2 - isolation - shortPain * 0.5 - (st.flags.recentDisaster ? 0.15 : 0), 0, 1);
  p.wellbeing = clamp(0.35 * p.health + 0.35 * p.psych + 0.2 * (1 - p.unemployment) + 0.1 * (1 - c.short.supplies), 0, 1);
  p.lifeExpectancy = clamp(82 / Math.sqrt(hMult) + lifeBonus, 30, 160);
  const bd = new BD('pts', 'Wellbeing blends health, psychological health, employment and supply.');
  bd.add('Health × 0.35', 0.35 * p.health).add('Psychological health × 0.35', 0.35 * p.psych).add('Employment × 0.2', 0.2 * (1 - p.unemployment)).add('Supplies × 0.1', 0.1 * (1 - c.short.supplies));
  setExplain(s, `set:${st.id}:wellbeing`, bd);
}

export function immigrate(st: Settlement, n: number, culture: string): void {
  if (!(n > 0)) return;
  const shares = [0, 0, 0, 0, 0.1, 0.3, 0.3, 0.18, 0.08, 0.04, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < BAND_COUNT; i++) st.pop.bands[i] += n * shares[i];
  const pop = st.pop.bands.reduce((a, v) => a + v, 0);
  addCulture(st.pop.cultures, culture, n / Math.max(1, pop));
  st.pop.educated = clamp((st.pop.educated * (pop - n) + n * 0.75) / Math.max(1, pop), 0, 0.95);
}

export function addCulture(cul: Record<string, number>, id: string, frac: number): void {
  frac = clamp(frac, 0, 1);
  for (const k in cul) cul[k] *= 1 - frac;
  cul[id] = (cul[id] ?? 0) + frac;
  let t = 0;
  for (const k in cul) t += cul[k];
  if (t > 0) for (const k in cul) cul[k] /= t;
  for (const k of Object.keys(cul)) if (cul[k] < 0.001) delete cul[k];
}

export function dominantCulture(st: Settlement): string {
  let best = 'terran', bv = -1;
  for (const k of Object.keys(st.pop.cultures).sort()) {
    if (st.pop.cultures[k] > bv) {
      bv = st.pop.cultures[k];
      best = k;
    }
  }
  return best;
}

export function explainSettlement(s: GameState, st: Settlement): void {
  // Food self-sufficiency breakdown
  const food = new BD('t/yr', 'Food consumption versus local production and imports.');
  food.add('Local production', (st.production.food ?? 0) * 12);
  food.add('Imports (12-month)', (st.imports.food ?? 0) * 12);
  food.add('Consumption', -(st.consumption.food ?? 0) * 12);
  setExplain(s, `set:${st.id}:food`, food);
  const en = new BD('MW', 'Generation by source against demand.');
  for (const k of Object.keys(st.energy.bySource).sort()) en.add(`Generation: ${k}`, st.energy.bySource[k]);
  en.add('Demand', -st.energy.demand);
  setExplain(s, `set:${st.id}:energy`, en);
}

export { known };
