// Physical logistics: Earth launch, route dispatch, propellant, freight economics
// and ship construction.
import type { GameState, Settlement, Route, Stock, Fleet } from '../types';
import { GOOD, GOOD_PRIORITY, LIFE_GOODS, PROPELLANTS } from '../content/goods';
import { SITE } from '../content/sites';
import { FACILITY } from '../content/facilities';
import { clamp } from '../core/util';
import { rand } from '../core/rng';
import { mods } from './modifiers';
import { credit, debit, addAlert, addHistory, regionOf, popOf, actorName } from './helpers';
import { designStats, planFor, settlementAtNode } from './designs';
import { immigrate, price } from './settlements';
import { createFleet } from './factory';
import { nextId } from '../core/util';
import { BD, setExplain } from '../core/breakdown';
import type { RoutePlan } from '../physics/engineering';

const DAYS_MONTH = 365.25 / 12;

export function earthHub(s: GameState): Settlement | undefined {
  for (const id of Object.keys(s.settlements).sort()) if (s.settlements[id].flags.earthHub) return s.settlements[id];
  return undefined;
}

export function launchPrice(s: GameState): number {
  const m = mods(s);
  const base = 250000 * Math.max(0.03, 1 + (m.launchCost ?? 0));
  const cap = monthlyLaunchCap(s);
  const util = cap > 0 ? s.earth.launchDemandMonth / cap : 1;
  const crowd = 1 + 1.5 * Math.max(0, util - 0.85);
  const debris = 1 + Math.max(0, s.earth.debrisRisk - 0.3) * 1.5;
  return base * crowd * debris;
}

export function monthlyLaunchCap(s: GameState): number {
  return (s.earth.launchCapacity * (1 + (mods(s).launchCapacity ?? 0))) / 12;
}

/** Buy goods on Earth and launch them to LEO. Returns tonnes actually launched. */
function launchFromEarth(s: GameState, tonnes: number): number {
  const cap = monthlyLaunchCap(s);
  const avail = Math.max(0, cap - s.earth.launchUsedMonth);
  const t = Math.min(tonnes, avail);
  s.earth.launchUsedMonth += t;
  return t;
}

function distributeLaunchRevenue(s: GameState, amount: number): void {
  if (!(amount > 0)) return;
  const shares: [string, number][] = [['argent', 0.42], ['longwei', 0.26], ['vyoma', 0.08]];
  let used = 0;
  for (const [id, sh] of shares) {
    if (s.corporations[id]?.alive) {
      credit(s, id, amount * sh, 'Launch services');
      used += sh;
    }
  }
  const rest = amount * (1 - used);
  let totalCap = 0;
  for (const id in s.nations) totalCap += s.nations[id].launchCapacity;
  for (const id of Object.keys(s.nations).sort()) credit(s, id, rest * (s.nations[id].launchCapacity / Math.max(1, totalCap)), 'Launch services');
}

// ----------------------------------------------------------------------------
// Daily: shipment arrivals
// ----------------------------------------------------------------------------
export function logisticsDaily(s: GameState): void {
  if (s.shipments.length === 0) return;
  const keep = [];
  for (const sh of s.shipments) {
    if (sh.arriveDay > s.day) {
      keep.push(sh);
      continue;
    }
    const dest = s.settlements[sh.to];
    if (!dest) continue;
    for (const g in sh.goods) {
      dest.stock[g] = (dest.stock[g] ?? 0) + sh.goods[g];
      dest.imports[g] = (dest.imports[g] ?? 0) + sh.goods[g];
    }
    if (sh.passengers > 0) {
      const from = s.settlements[sh.from];
      const culture = from && !from.flags.earthHub ? dominantOrigin(from) : 'terran';
      immigrate(dest, sh.passengers, culture);
      dest.pop.immigrants += sh.passengers;
    }
  }
  s.shipments = keep;
}

function dominantOrigin(st: Settlement): string {
  let best = 'terran', bv = -1;
  for (const k of Object.keys(st.pop.cultures).sort()) if (st.pop.cultures[k] > bv) { bv = st.pop.cultures[k]; best = k; }
  return best;
}

// ----------------------------------------------------------------------------
// Monthly
// ----------------------------------------------------------------------------
interface RouteRuntime {
  plans: { fleet: Fleet; plan: RoutePlan }[];
}

export const routeRuntime = new Map<string, RouteRuntime>();

export function logisticsMonthly(s: GameState): void {
  s.earth.launchUsedMonth = 0;
  s.earth.launchDemandMonth = 0;
  clearMonthlyFlags(s);
  for (const id in s.settlements) {
    const st = s.settlements[id];
    st.imports = {};
    st.exports = {};
  }
  computeInTransit(s);
  computeNeeds(s);
  // record route propellant draws fresh each month
  for (const id in s.settlements) s.settlements[id].routeDraw = {};
  supplyEarthHub(s);
  const routes = Object.values(s.routes).filter((r) => r.active).sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : 1));
  for (const r of routes) runRoute(s, r);
  progressShipOrders(s);
  s.earth.launchPrice = launchPrice(s);
  const lb = new BD('cr/t', 'Earth launch price to low Earth orbit.');
  lb.add('Base price (reusable launch)', 250000);
  lb.add('Technology & law modifiers', 250000 * (mods(s).launchCost ?? 0));
  lb.add('Congestion & debris surcharges', s.earth.launchPrice - 250000 * Math.max(0.03, 1 + (mods(s).launchCost ?? 0)));
  setExplain(s, 'earth.launchPrice', lb, s.earth.launchPrice);
}

function computeInTransit(s: GameState): void {
  for (const id in s.settlements) s.settlements[id].inTransit = {};
  for (const sh of s.shipments) {
    const d = s.settlements[sh.to];
    if (!d) continue;
    for (const g in sh.goods) d.inTransit[g] = (d.inTransit[g] ?? 0) + sh.goods[g];
  }
}

function reserveMonths(st: Settlement, g: string): number {
  const region = regionOf(st);
  const far = region !== 'earthOrbit' && region !== 'luna';
  if (LIFE_GOODS.includes(g)) return far ? 20 : 5;
  if (PROPELLANTS.includes(g)) return far ? 6 : 2;
  return far ? 8 : 2;
}

export function computeNeeds(s: GameState): void {
  for (const id of Object.keys(s.settlements).sort()) {
    const st = s.settlements[id];
    const need: Stock = {};
    const surplus: Stock = {};
    const cons: Stock = { ...st.consumption };
    // route propellant draws count as consumption for depots
    for (const g in st.routeDraw) cons[g] = (cons[g] ?? 0) + st.routeDraw[g];
    const constr: Stock = {};
    for (const p of st.construction) {
      const months = Math.max(1, p.monthsTotal);
      for (const g in p.materials) {
        const rem = Math.max(0, p.materials[g]);
        const soon = Math.min(rem, (p.materialsTotal[g] ?? 0) * (6 / months) + (p.progress === 0 ? rem * 0.5 : 0));
        constr[g] = (constr[g] ?? 0) + soon;
      }
    }
    for (const so of s.shipOrders) {
      if (so.shipyard !== st.id) continue;
      for (const g in so.materials) constr[g] = (constr[g] ?? 0) + Math.max(0, so.materials[g]);
    }
    const goods = new Set([...Object.keys(cons), ...Object.keys(st.production), ...Object.keys(st.stock), ...Object.keys(constr)]);
    for (const g of [...goods].sort()) {
      const net = (cons[g] ?? 0) - (st.production[g] ?? 0);
      const reserve = reserveMonths(st, g);
      const target = Math.max(0, net) * (reserve + 1) + (constr[g] ?? 0);
      const have = (st.stock[g] ?? 0) + (st.inTransit[g] ?? 0);
      const n = target - have;
      if (n > 1e-3) need[g] = n;
      const spare = (st.stock[g] ?? 0) - Math.max(0, net) * reserve - (constr[g] ?? 0);
      if (spare > 1e-3) surplus[g] = spare;
    }
    // Ensure new settlements with no history keep minimum life reserves
    const pop = popOf(st);
    if (pop > 0) {
      const minRes: Stock = { oxygen: pop * 0.03, water: pop * 0.2, food: pop * 0.06, supplies: pop * 0.02 };
      for (const g in minRes) {
        const have = (st.stock[g] ?? 0) + (st.inTransit[g] ?? 0);
        if (have < minRes[g]) need[g] = Math.max(need[g] ?? 0, minRes[g] - have);
      }
    }
    st.demand = need;
    st.surplus = surplus;
  }
}

/** The Earth hub in LEO is supplied directly by surface launches. */
function supplyEarthHub(s: GameState): void {
  const hub = earthHub(s);
  if (!hub) return;
  const lp = s.earth.launchPrice;
  const goods = Object.keys(hub.demand).sort((a, b) => (GOOD_PRIORITY[a] ?? 5) - (GOOD_PRIORITY[b] ?? 5));
  let cost = 0, launchFees = 0;
  for (const g of goods) {
    const want = hub.demand[g];
    s.earth.launchDemandMonth += want;
    const t = launchFromEarth(s, want);
    if (t <= 0) continue;
    hub.stock[g] = (hub.stock[g] ?? 0) + t;
    hub.imports[g] = (hub.imports[g] ?? 0) + t;
    hub.demand[g] -= t;
    cost += t * ((s.earth.prices[g] ?? GOOD[g].price) + lp);
    launchFees += t * lp;
  }
  hub.economy.treasury -= cost;
  hub.economy.importsValue = cost * 12;
  distributeLaunchRevenue(s, launchFees);
}

function sourcePrice(s: GameState, origin: Settlement, g: string): number {
  if (origin.flags.earthHub) return (s.earth.prices[g] ?? GOOD[g].price) + s.earth.launchPrice;
  return price(s, origin, g);
}

/** Take goods from an origin. Earth hub can buy from Earth (launch-limited). */
function takeFromOrigin(s: GameState, origin: Settlement, g: string, want: number, launched: { t: number; fees: number }): number {
  if (want <= 0) return 0;
  if (origin.flags.earthHub) {
    const fromStock = Math.min(want, Math.max(0, (origin.surplus[g] ?? 0)));
    if (fromStock > 0) {
      origin.stock[g] = (origin.stock[g] ?? 0) - fromStock;
      origin.surplus[g] -= fromStock;
    }
    const rest = want - fromStock;
    s.earth.launchDemandMonth += rest;
    const t = launchFromEarth(s, rest);
    launched.t += t;
    launched.fees += t * s.earth.launchPrice;
    return fromStock + t;
  }
  const avail = Math.max(0, Math.min(origin.surplus[g] ?? 0, origin.stock[g] ?? 0));
  const t = Math.min(want, avail);
  if (t > 0) {
    origin.stock[g] -= t;
    origin.surplus[g] -= t;
    origin.exports[g] = (origin.exports[g] ?? 0) + t;
  }
  return t;
}

/** Draw propellant for ships at a node. Returns fraction available. */
function propAvailability(s: GameState, node: string, good: string, amount: number): number {
  if (amount <= 0) return 1;
  const id = settlementAtNode(s, node);
  if (!id) return 0;
  const st = s.settlements[id];
  if (st.flags.earthHub) {
    const cap = monthlyLaunchCap(s) - s.earth.launchUsedMonth + Math.max(0, st.stock[good] ?? 0);
    return clamp(cap / amount, 0, 1);
  }
  return clamp((st.stock[good] ?? 0) / amount, 0, 1);
}

function drawPropellant(s: GameState, node: string, good: string, amount: number, payer: string): number {
  if (amount <= 0) return 0;
  const id = settlementAtNode(s, node);
  if (!id) return 0;
  const st = s.settlements[id];
  let cost = 0;
  let got = Math.min(amount, st.stock[good] ?? 0);
  st.stock[good] = (st.stock[good] ?? 0) - got;
  cost += got * price(s, st, good);
  if (st.flags.earthHub && got < amount) {
    s.earth.launchDemandMonth += amount - got;
    const t = launchFromEarth(s, amount - got);
    cost += t * ((s.earth.prices[good] ?? 0) + s.earth.launchPrice);
    distributeLaunchRevenue(s, t * s.earth.launchPrice);
    got += t;
  } else {
    st.economy.treasury += got * price(s, st, good);
  }
  st.routeDraw[good] = (st.routeDraw[good] ?? 0) + got;
  debit(s, payer, cost, 'Fleet propellant');
  return got;
}

function runRoute(s: GameState, r: Route): void {
  const origin = s.settlements[r.origin];
  const dest = s.settlements[r.destination];
  r.stats.deliveredMonth = 0;
  r.stats.returnedMonth = 0;
  r.stats.propellantMonth = 0;
  r.stats.limiting = undefined;
  if (!origin || !dest) {
    r.active = false;
    return;
  }
  const oNode = SITE[origin.siteId].node;
  const dNode = SITE[dest.siteId].node;
  const fleets = Object.values(s.fleets).filter((f) => f.routeId === r.id && f.count > 0).sort((a, b) => (a.id < b.id ? -1 : 1));
  const rt: RouteRuntime = { plans: [] };
  routeRuntime.set(r.id, rt);
  if (fleets.length === 0) {
    r.stats.limiting = 'No ships assigned';
    r.stats.capacityYear = 0;
    return;
  }
  const m = mods(s);
  // Surface landing capacity
  const surfaceLimit = (st: Settlement) => {
    const kind = SITE[st.siteId].kind;
    if (kind === 'orbital') return Infinity;
    return st.landingCapacity / 12 + (st.massDriverCapacity > 0 ? st.massDriverCapacity / 12 : 0);
  };
  let landingLeft = Math.min(surfaceLimit(origin), surfaceLimit(dest));
  if (landingLeft <= 0) r.stats.limiting = 'No spaceport at a surface endpoint';
  let capYear = 0;
  // Demand to carry outbound
  const outboundNeeds = r.mode === 'export' ? exportList(s, origin, dest) : supplyList(dest);
  const paxWanted = r.mode === 'export' ? 0 : Math.max(0, ((dest.flags.migrationDemand as number) ?? 0) - ((dest.flags.paxBooked as number) ?? 0));
  let paxLeft = paxWanted;
  const shipGoods: Stock = {};
  let shipPax = 0;
  let transitDays = 0;
  let totalCost = 0;
  let tonnesOut = 0;
  let limiting: string | undefined;
  const launched = { t: 0, fees: 0 };
  for (const fleet of fleets) {
    const design = s.designs[fleet.designId];
    if (!design) continue;
    const plan = planFor(s, design, oNode, dNode);
    rt.plans.push({ fleet, plan });
    if (!plan.feasible) {
      limiting = plan.issues[0] ?? 'Route infeasible for this design';
      continue;
    }
    const stats = designStats(s, design);
    transitDays = Math.max(transitDays, plan.transitDays);
    let tripsMax = (fleet.count * Math.min(1, fleet.condition + 0.1) * DAYS_MONTH) / Math.max(1, plan.rttDays);
    capYear += tripsMax * 12 * plan.payload;
    // Propellant availability limits
    const propGood = plan.propType;
    if (propGood) {
      for (const node in plan.propDraw) {
        const f = propAvailability(s, node, propGood, plan.propDraw[node] * tripsMax);
        if (f < 1) {
          tripsMax *= f;
          limiting = `Propellant shortage at ${nodeName(s, node)}`;
        }
      }
    }
    if (tripsMax <= 1e-6) continue;
    // Load cargo
    let capLeft = Math.min(tripsMax * plan.payload, landingLeft);
    let loaded = 0;
    for (const item of outboundNeeds) {
      if (capLeft <= 1e-6) break;
      const want = Math.min(item.amount, capLeft);
      const got = takeFromOrigin(s, origin, item.good, want, launched);
      if (got <= 0) continue;
      item.amount -= got;
      shipGoods[item.good] = (shipGoods[item.good] ?? 0) + got;
      capLeft -= got;
      loaded += got;
      totalCost += got * sourcePrice(s, origin, item.good);
    }
    // Passengers
    let paxTrips = 0;
    if (plan.passengers > 0 && paxLeft > 0) {
      const paxCap = tripsMax * plan.passengers;
      const p = Math.min(paxCap, paxLeft);
      paxLeft -= p;
      shipPax += p;
      paxTrips = p / plan.passengers;
    }
    const cargoTrips = plan.payload > 0 ? loaded / plan.payload : 0;
    let tripsUsed = Math.min(tripsMax, Math.max(cargoTrips, paxTrips));
    if (tripsUsed <= 0) continue;
    // Minimum crew-rotation flight each quarter for crewed outposts
    landingLeft -= loaded;
    tonnesOut += loaded;
    // Propellant draws
    let propUsed = 0;
    if (propGood) {
      for (const node of Object.keys(plan.propDraw).sort()) propUsed += drawPropellant(s, node, propGood, plan.propDraw[node] * tripsUsed, r.owner);
    }
    if (plan.fusionFuelPerTrip > 0) {
      const ff = plan.fusionFuelPerTrip * tripsUsed;
      const got = Math.min(ff, origin.stock.fusionFuel ?? 0);
      origin.stock.fusionFuel = (origin.stock.fusionFuel ?? 0) - got;
      debit(s, r.owner, (ff - got) * (s.earth.prices.fusionFuel ?? 2e9) + got * price(s, origin, 'fusionFuel'), 'Fleet propellant');
    }
    r.stats.propellantMonth += propUsed;
    // Operating costs
    debit(s, r.owner, plan.opexPerTrip * tripsUsed * Math.max(0.5, 1 + (m.freightCost ?? 0)), 'Fleet operations');
    // Wear and accidents
    fleet.condition = clamp(fleet.condition - 0.0005, 0.6, 1);
    const expectLoss = tripsUsed * plan.lossChance;
    const lost = Math.floor(expectLoss) + (rand(s, 'accidents') < expectLoss - Math.floor(expectLoss) ? 1 : 0);
    if (lost > 0 && fleet.count > 0) {
      const n = Math.min(lost, fleet.count);
      fleet.count -= n;
      r.stats.lostYear += n;
      const frac = Math.min(1, n / Math.max(1, tripsUsed));
      for (const g in shipGoods) shipGoods[g] *= 1 - frac * 0.5;
      const crewLost = design && stats.crew > 0 ? Math.round(Math.min(stats.crew, 2 + shipPax * frac)) : 0;
      shipPax = Math.max(0, shipPax * (1 - frac));
      s.events.flags.lastAccident = { route: r.id, day: s.day, crew: crewLost, design: design.name };
      addAlert(s, 'warn', `${design.name} lost on ${r.name}${crewLost > 0 ? ` with ${crewLost} aboard` : ''}`, r.id);
      if (crewLost > 0) addHistory(s, `Spacecraft lost on ${r.name}`, `A ${design.name} operated by ${actorName(s, r.owner)} was destroyed in flight. ${crewLost} people died.`, 'disaster', 2, [r.id]);
    }
  }
  if (launched.fees > 0) distributeLaunchRevenue(s, launched.fees);
  // Dispatch outbound shipment
  let total = 0;
  for (const g in shipGoods) total += shipGoods[g];
  const exportToEarth = r.mode === 'export' && !!dest.flags.earthHub;
  const toHub: Stock = {};
  const toEarth: Stock = {};
  if (exportToEarth) {
    for (const g in shipGoods) {
      const hubNeed = Math.max(0, dest.demand[g] ?? 0);
      const h = Math.min(shipGoods[g], hubNeed);
      if (h > 0) toHub[g] = h;
      if (shipGoods[g] - h > 1e-9) toEarth[g] = shipGoods[g] - h;
    }
  }
  const cargo = exportToEarth ? toHub : shipGoods;
  let cargoT = 0;
  for (const g in cargo) cargoT += cargo[g];
  if (cargoT > 1e-6 || shipPax > 0.01) {
    const arrive = s.day + Math.max(1, Math.round(transitDays));
    s.shipments.push({ id: nextId(s, 'shp'), routeId: r.id, from: origin.id, to: dest.id, goods: cargo, passengers: shipPax, departDay: s.day, arriveDay: arrive, owner: r.owner });
    for (const g in cargo) dest.demand[g] = Math.max(0, (dest.demand[g] ?? 0) - cargo[g]);
    dest.flags.paxBooked = ((dest.flags.paxBooked as number) ?? 0) + shipPax;
  }
  void total;
  // Economics: freight and goods payments
  const freightRate = estimateFreightRate(s, r, tonnesOut, rt);
  const freight = (tonnesOut + shipPax * 1.5) * freightRate;
  r.stats.costPerTonne = freightRate;
  const markup = s.corporations[r.owner] ? 1.2 : 1;
  const destPays = totalCost + freight * markup;
  if (exportToEarth) {
    // Merchant sells to the LEO hub what it needs and the rest down to Earth
    let revenue = 0;
    for (const g in toHub) {
      const v = toHub[g] * price(s, dest, g);
      revenue += v;
      dest.economy.treasury -= v;
    }
    for (const g in toEarth) {
      revenue += toEarth[g] * ((s.earth.prices[g] ?? GOOD[g].price) - 20000);
      s.earth.spaceDeliveries[g] = (s.earth.spaceDeliveries[g] ?? 0) + toEarth[g];
    }
    for (const g in shipGoods) origin.economy.treasury += shipGoods[g] * price(s, origin, g);
    credit(s, r.owner, Math.max(0, revenue), 'Export sales');
    debit(s, r.owner, totalCost, 'Export purchases');
    origin.economy.exportsValue = totalCost * 12;
  } else {
    dest.economy.treasury -= destPays;
    dest.economy.importsValue = destPays * 12;
    if (!origin.flags.earthHub) origin.economy.treasury += totalCost;
    credit(s, r.owner, freight * markup, 'Freight revenue');
    const subsidy = (m.freightSubsidy ?? 0) * freight * markup;
    if (subsidy > 0) {
      debit(s, 'une', subsidy, 'Freight subsidy');
      dest.economy.treasury += subsidy;
    }
  }
  // Interplanetary commerce levy
  const levy = (m.commercialLevy ?? 0) * totalCost * (rt.plans.some((p) => p.plan.helio) ? 1 : 0.3);
  if (levy > 0) {
    credit(s, 'une', levy, 'Commerce levy');
    dest.economy.treasury -= levy;
  }
  r.stats.deliveredMonth = tonnesOut;
  r.stats.deliveredYear = r.stats.deliveredYear * (11 / 12) + tonnesOut;
  r.stats.passengersYear = r.stats.passengersYear * (11 / 12) + shipPax;
  r.stats.capacityYear = capYear;
  r.stats.utilization = capYear > 0 ? clamp((tonnesOut * 12) / capYear, 0, 1) : 0;
  r.stats.limiting = limiting ?? r.stats.limiting;
  // Return leg for two-way routes
  if (r.mode === 'both' && rt.plans.some((p) => p.plan.feasible)) {
    const back = supplyList(origin);
    const retGoods: Stock = {};
    let capLeft = rt.plans.reduce((a, p) => a + (p.plan.feasible ? (p.fleet.count * DAYS_MONTH) / Math.max(1, p.plan.rttDays) * p.plan.payload : 0), 0);
    let value = 0;
    for (const item of back) {
      if (capLeft <= 1e-6) break;
      if (dest.flags.earthHub) continue;
      const avail = Math.max(0, Math.min(dest.surplus[item.good] ?? 0, dest.stock[item.good] ?? 0));
      const t = Math.min(avail, item.amount, capLeft);
      if (t <= 0) continue;
      dest.stock[item.good] -= t;
      dest.surplus[item.good] -= t;
      dest.exports[item.good] = (dest.exports[item.good] ?? 0) + t;
      retGoods[item.good] = t;
      capLeft -= t;
      value += t * price(s, dest, item.good);
    }
    let tot = 0;
    for (const g in retGoods) tot += retGoods[g];
    if (tot > 0) {
      s.shipments.push({ id: nextId(s, 'shp'), routeId: r.id, from: dest.id, to: origin.id, goods: retGoods, passengers: 0, departDay: s.day, arriveDay: s.day + Math.max(1, Math.round(transitDays)), owner: r.owner });
      dest.economy.treasury += value;
      origin.economy.treasury -= value + tot * freightRate * markup;
      credit(s, r.owner, tot * freightRate * markup, 'Freight revenue');
      r.stats.returnedMonth = tot;
    }
  }
}

function nodeName(s: GameState, node: string): string {
  const id = settlementAtNode(s, node);
  return id ? s.settlements[id].name : node;
}

function supplyList(dest: Settlement): { good: string; amount: number }[] {
  return Object.keys(dest.demand)
    .filter((g) => dest.demand[g] > 1e-3)
    .sort((a, b) => (GOOD_PRIORITY[a] ?? 5) - (GOOD_PRIORITY[b] ?? 5) || (a < b ? -1 : 1))
    .map((g) => ({ good: g, amount: dest.demand[g] }));
}

function exportList(s: GameState, origin: Settlement, dest: Settlement): { good: string; amount: number }[] {
  const items: { good: string; amount: number; v: number }[] = [];
  for (const g of Object.keys(origin.surplus).sort()) {
    const amt = origin.surplus[g];
    if (!(amt > 1e-3)) continue;
    let v: number;
    if (dest.flags.earthHub) {
      // Deliver what the LEO hub needs first, then what Earth values
      const hubNeed = dest.demand[g] ?? 0;
      v = hubNeed > 0 ? price(s, dest, g) : s.earth.prices[g] ?? 0;
      const take = hubNeed > 0 ? Math.min(amt, hubNeed + amt) : amt;
      items.push({ good: g, amount: take, v });
    } else {
      const want = dest.demand[g] ?? 0;
      if (want <= 0) continue;
      v = price(s, dest, g);
      items.push({ good: g, amount: Math.min(amt, want), v });
    }
  }
  items.sort((a, b) => b.v - a.v);
  return items;
}

function estimateFreightRate(s: GameState, r: Route, tonnes: number, rt: RouteRuntime): number {
  // Cost per tonne from plans: propellant + opex per payload tonne
  let best = Infinity;
  for (const { fleet, plan } of rt.plans) {
    if (!plan.feasible || plan.payload <= 0) continue;
    const design = s.designs[fleet.designId];
    if (!design) continue;
    let propCost = 0;
    const g = plan.propType;
    if (g) {
      for (const node in plan.propDraw) {
        const id = settlementAtNode(s, node);
        const st = id ? s.settlements[id] : undefined;
        const pr = st ? (st.flags.earthHub && (st.stock[g] ?? 0) < plan.propDraw[node] ? (s.earth.prices[g] ?? 0) + s.earth.launchPrice : price(s, st, g)) : 0;
        propCost += plan.propDraw[node] * pr;
      }
    }
    const perT = (propCost + plan.opexPerTrip) / plan.payload;
    best = Math.min(best, perT);
  }
  return Number.isFinite(best) ? best : 0;
}

// ----------------------------------------------------------------------------
// Shipyards
// ----------------------------------------------------------------------------
function progressShipOrders(s: GameState): void {
  const done: string[] = [];
  for (const o of s.shipOrders) {
    const design = s.designs[o.designId];
    if (!design) {
      done.push(o.id);
      continue;
    }
    const stats = designStats(s, design);
    let step = 1 / Math.max(1, o.monthsTotal);
    if (o.shipyard === 'earth') {
      const mass = (stats.dryMass * o.count) / Math.max(1, o.monthsTotal);
      s.earth.launchDemandMonth += mass;
      const t = launchFromEarth(s, mass);
      step *= mass > 0 ? t / mass : 1;
    } else {
      const yard = s.settlements[o.shipyard];
      if (!yard) {
        done.push(o.id);
        continue;
      }
      const capRatio = yard.shipyardCapacity > 0 ? Math.min(1, (yard.shipyardCapacity / 12) / Math.max(1, (stats.dryMass * o.count) / o.monthsTotal)) : 0;
      let matRatio = 1;
      for (const g in o.materials) {
        const want = Math.min(o.materials[g], (stats.goods[g] ?? 0) * o.count * step);
        if (want <= 0) continue;
        matRatio = Math.min(matRatio, (yard.stock[g] ?? 0) / want);
      }
      matRatio = clamp(matRatio, 0, 1);
      step *= Math.min(capRatio, matRatio);
      for (const g in o.materials) {
        const amt = Math.min(o.materials[g], (stats.goods[g] ?? 0) * o.count * step);
        const got = Math.min(amt, yard.stock[g] ?? 0);
        yard.stock[g] = (yard.stock[g] ?? 0) - got;
        o.materials[g] -= got;
        yard.economy.treasury += got * price(s, yard, g);
        debit(s, o.owner, got * price(s, yard, g), 'Shipbuilding materials');
      }
    }
    o.progress += step;
    if (o.progress >= 0.999) {
      createFleet(s, o.owner, o.designId, o.count, o.routeId);
      done.push(o.id);
      if (o.owner === 'une') addAlert(s, 'info', `${o.count} × ${design.name} delivered`, o.routeId);
    }
  }
  if (done.length) s.shipOrders = s.shipOrders.filter((o) => !done.includes(o.id));
}

export function shipOrderCost(s: GameState, designId: string, count: number, shipyard: string): number {
  const d = s.designs[designId];
  if (!d) return 0;
  const st = designStats(s, d);
  if (shipyard === 'earth') return (st.cost + st.dryMass * s.earth.launchPrice) * count;
  return st.cost * 0.7 * count;
}

export function clearMonthlyFlags(s: GameState): void {
  for (const id in s.settlements) s.settlements[id].flags.paxBooked = 0;
}

export { FACILITY };
