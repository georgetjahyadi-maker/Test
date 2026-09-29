// Primitive actions shared by AI actors and player commands.
import type { GameState, Settlement, CommandResult, Route } from '../types';
import { FACILITY } from '../content/facilities';
import { SITE } from '../content/sites';
import { nextId } from '../core/util';
import { queueConstruction, createRoute, createFleet } from '../systems/factory';
import { capitalCost, actorFunds, debit, regionOf, popOf, actorName } from '../systems/helpers';
import { mod } from '../systems/modifiers';
import { designStats, planFor, netProducer, settlementAtNode } from '../systems/designs';
import type { RoutePlan } from '../physics/engineering';
import { shortestPath } from '../physics/deltav';
import { earthHub, shipOrderCost } from '../systems/logistics';
import { canBuild, totalCost, bestDesignFor } from './planner';
import { routeRuntime } from '../systems/logistics';

/** Queue construction of facilities, paying the build cost up front. Materials are bought as they are consumed. */
export function invest(s: GameState, actor: string, st: Settlement, type: string, count: number, check = true): CommandResult {
  const def = FACILITY[type];
  if (!def) return { ok: false, error: 'Unknown facility.' };
  if (check && !canBuild(s, st, actor, type)) return { ok: false, error: `${def.name} cannot be built here (technology, site type or resources).` };
  if (def.maxPerSettlement && countAll(st, type) + count > def.maxPerSettlement) return { ok: false, error: 'Limit reached for this settlement.' };
  let cost = def.buildCost * count;
  const sda = actor === 'une' ? s.une.institutions.sda?.effectiveness ?? 1 : 1;
  if (actor === 'une') cost *= 1 - Math.min(0.25, (sda - 0.5) * 0.2);
  // UNE matching funds for lunar industry
  const lunarMatch = mod(s, 'lunarFund');
  let match = 0;
  if (lunarMatch > 0 && actor !== 'une' && regionOf(st) === 'luna' && def.category !== 'habitat') match = cost * lunarMatch;
  const funds = actorFunds(s, actor) + (s.settlements[actor] ? Math.max(5e8, s.settlements[actor].economy.gdp) : 0);
  if (funds < cost - match && !(actor === 'une' && s.une.bondsAuthorized)) return { ok: false, error: `Insufficient funds: needs ${(cost / 1e9).toFixed(2)}B cr.` };
  capitalCost(s, actor, cost - match, 'Construction');
  if (match > 0) debit(s, 'une', match, 'Lunar Industrialization Fund');
  queueConstruction(s, st, type, actor, count, 1);
  if (actor !== 'une' && s.nations[actor]) s.nations[actor].spaceInvestYear += cost;
  // Sponsors: investors gain a stake in un-governed settlements
  if (!st.sponsors[actor] && ['outpost', 'territory'].includes(st.status) && (s.nations[actor] || s.corporations[actor])) {
    st.sponsors[actor] = 0.05;
  } else if (st.sponsors[actor] !== undefined && ['outpost', 'territory'].includes(st.status)) {
    st.sponsors[actor] = Math.min(3, st.sponsors[actor] + cost / 5e11);
  }
  return { ok: true };
}

function countAll(st: Settlement, type: string): number {
  let n = 0;
  for (const f of st.facilities) if (f.type === type) n += f.count;
  for (const p of st.construction) if (p.type === type) n += p.count;
  return n;
}

export function orderShips(s: GameState, owner: string, designId: string, count: number, shipyard = 'earth', routeId?: string): CommandResult {
  const d = s.designs[designId];
  if (!d) return { ok: false, error: 'Unknown design.' };
  const st = designStats(s, d);
  if (st.errors.length) return { ok: false, error: `Design is not flightworthy: ${st.errors[0]}` };
  if (st.techMissing.length) return { ok: false, error: `Design uses unavailable technology: ${st.techMissing.join(', ')}` };
  if (shipyard !== 'earth') {
    const y = s.settlements[shipyard];
    if (!y || y.shipyardCapacity <= 0) return { ok: false, error: 'That settlement has no shipyard.' };
  }
  const cost = shipOrderCost(s, designId, count, shipyard);
  if (actorFunds(s, owner) < cost && !(owner === 'une' && s.une.bondsAuthorized)) return { ok: false, error: `Needs ${(cost / 1e9).toFixed(2)}B cr.` };
  capitalCost(s, owner, cost, 'Shipbuilding');
  const materials: Record<string, number> = {};
  if (shipyard !== 'earth') for (const g in st.goods) materials[g] = st.goods[g] * count;
  s.shipOrders.push({ id: nextId(s, 'so'), owner, designId, count, shipyard, progress: 0, monthsTotal: Math.max(2, Math.round(st.buildMonths)), cost, materials, routeId });
  return { ok: true };
}

/**
 * Route capacity (t/yr and passengers/yr) serving a destination, including
 * ships still on order. With `originId`, only routes from that origin count.
 */
export function supplyCapacity(s: GameState, destId: string, originId?: string): { tonnes: number; passengers: number } {
  let t = 0, p = 0;
  const dest = s.settlements[destId];
  if (!dest) return { tonnes: 0, passengers: 0 };
  for (const r of Object.values(s.routes)) {
    if (!r.active || r.destination !== destId) continue;
    if (originId && r.origin !== originId) continue;
    const origin = s.settlements[r.origin];
    if (!origin) continue;
    const oNode = SITE[origin.siteId].node, dNode = SITE[dest.siteId].node;
    const rt = routeRuntime.get(r.id);
    if (rt) {
      for (const x of rt.plans) if (x.plan.feasible) {
        t += x.plan.capacityPerShipYear * x.fleet.count;
        p += x.plan.passengers * x.plan.tripsPerYear * x.fleet.count;
      }
    } else {
      // No runtime yet (e.g. just loaded): plan the assigned fleets directly
      for (const f of Object.values(s.fleets)) {
        if (f.routeId !== r.id || !s.designs[f.designId]) continue;
        const plan = planFor(s, s.designs[f.designId], oNode, dNode);
        if (plan.feasible) {
          t += plan.capacityPerShipYear * f.count;
          p += plan.passengers * plan.tripsPerYear * f.count;
        }
      }
    }
    for (const o of s.shipOrders) {
      if (o.routeId !== r.id || !s.designs[o.designId]) continue;
      const plan = planFor(s, s.designs[o.designId], oNode, dNode);
      if (!plan.feasible) continue;
      t += plan.capacityPerShipYear * o.count;
      p += plan.passengers * plan.tripsPerYear * o.count;
    }
  }
  return { tonnes: t, passengers: p };
}

/** Put idle or misassigned ships of `owner` onto a route they can fly. Returns capacity added (t/yr). */
function reassignFleets(s: GameState, owner: string, route: Route, wantTonnes: number): number {
  const origin = s.settlements[route.origin], dest = s.settlements[route.destination];
  if (!origin || !dest) return 0;
  const oNode = SITE[origin.siteId].node, dNode = SITE[dest.siteId].node;
  let added = 0;
  for (const f of Object.values(s.fleets).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (added >= wantTonnes) break;
    if (f.owner !== owner || f.count <= 0 || f.patrolRegion) continue;
    const d = s.designs[f.designId];
    if (!d || designStats(s, d).combatRating > 0) continue;
    if (f.routeId === route.id) continue;
    if (f.routeId) {
      // only take ships whose current route is unusable for them
      const cur = s.routes[f.routeId];
      const co = cur && s.settlements[cur.origin], cd = cur && s.settlements[cur.destination];
      if (cur && cur.active && co && cd && planFor(s, d, SITE[co.siteId].node, SITE[cd.siteId].node).feasible) continue;
    }
    const plan = planFor(s, d, oNode, dNode);
    if (!plan.feasible || plan.capacityPerShipYear <= 0) continue;
    f.routeId = route.id;
    added += plan.capacityPerShipYear * f.count;
  }
  return added;
}

const pathDvCache = new Map<string, number>();
/** Impulsive delta-v between two graph nodes (km/s), no aerobraking. */
export function pathDv(from: string, to: string): number {
  const key = `${from}|${to}`;
  const c = pathDvCache.get(key);
  if (c !== undefined) return c;
  const p = shortestPath(from, to, { aero: false, aerocaptureTech: false, lowThrust: false });
  const v = p ? p.dv : Infinity;
  pathDvCache.set(key, v);
  return v;
}

/**
 * Settlements that could supply part of what `st` needs more cheaply than the
 * Earth hub (lower delta-v), with the tonnage per month they could cover.
 * Only goods the source actually produces beyond its own use count, so that
 * construction materials passing through a settlement do not create routes.
 */
export function localSources(s: GameState, st: Settlement): { src: Settlement; tonnes: number; dv: number; goods: string[] }[] {
  const hub = earthHub(s);
  const dNode = SITE[st.siteId].node;
  const hubDv = hub ? pathDv(SITE[hub.siteId].node, dNode) : Infinity;
  const out: { src: Settlement; tonnes: number; dv: number; goods: string[] }[] = [];
  for (const src of Object.values(s.settlements).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (src.id === st.id || src.flags.earthHub) continue;
    const dv = pathDv(SITE[src.siteId].node, dNode);
    if (!(dv < hubDv - 0.3)) continue;
    let t = 0;
    const goods: string[] = [];
    for (const g of Object.keys(st.demand).sort()) {
      const want = st.demand[g];
      if (!(want > 0)) continue;
      const netProd = (src.production[g] ?? 0) - (src.consumption[g] ?? 0) - (src.routeDraw[g] ?? 0);
      if (netProd < 2) continue;
      const give = Math.min(want, netProd * 1.5);
      t += give;
      goods.push(g);
    }
    if (t < 10) continue;
    out.push({ src, tonnes: t, dv, goods });
  }
  return out.sort((a, b) => b.tonnes / (1 + b.dv) - a.tonnes / (1 + a.dv));
}

/** A route whose last month was held back by propellant or port limits gains nothing from more ships. */
function propellantLimited(s: GameState, destId: string, originId: string): boolean {
  return Object.values(s.routes).some((r) => r.active && r.destination === destId && r.origin === originId && !!r.stats.limiting && /Propellant shortage|No spaceport/.test(r.stats.limiting));
}

interface LegOptions {
  priority: number;
  transship?: boolean;
  passengers?: number; // passengers per year wanted
  accept?: (plan: RoutePlan) => boolean;
  maxShips?: number;
}

/**
 * Make sure a route origin → dest owned by `owner` has capacity for `needT`
 * tonnes per year (and passengers). Reuses idle ships before ordering new ones.
 * Returns ok without `info` when it spent money.
 */
function ensureLeg(s: GameState, origin: Settlement, dest: Settlement, owner: string, budget: number, needT: number, o: LegOptions): CommandResult {
  const cap = supplyCapacity(s, dest.id, origin.id);
  const wantPax = !!o.passengers && o.passengers > cap.passengers * 1.1;
  if (cap.tonnes >= needT * 1.2 && !wantPax) return { ok: true, info: 'Adequate' };
  if (propellantLimited(s, dest.id, origin.id) && !wantPax) return { ok: true, info: 'Propellant-limited' };
  const oNode = SITE[origin.siteId].node, dNode = SITE[dest.siteId].node;
  const choice = bestDesignFor(s, oNode, dNode, owner, wantPax, o.accept);
  if (!choice) return { ok: false, error: `No available design can fly ${origin.name} → ${dest.name}.` };
  let route = Object.values(s.routes).find((r) => r.active && r.owner === owner && r.destination === dest.id && r.origin === origin.id);
  const fresh = !route;
  if (!route) route = createRoute(s, `${origin.name} → ${dest.name}`, owner, origin.id, dest.id, 'supply', o.priority);
  if (o.transship) route.transship = true;
  const want = Math.max(0, needT * 1.3 - cap.tonnes);
  const gap = want - reassignFleets(s, owner, route, want);
  let ships = Math.ceil(Math.max(0, gap) / Math.max(1, choice.plan.capacityPerShipYear));
  if (wantPax && choice.plan.passengers > 0) ships = Math.max(ships, Math.ceil((o.passengers! - cap.passengers) / Math.max(1, choice.plan.passengers * choice.plan.tripsPerYear)));
  if (ships <= 0) return { ok: true, info: 'Reassigned' };
  ships = Math.max(1, Math.min(o.maxShips ?? 3, ships));
  const cost = shipOrderCost(s, choice.designId, ships, 'earth');
  if (cost > budget) ships = Math.floor(budget / Math.max(1, cost / ships));
  if (ships < 1) {
    if (fresh && !Object.values(s.fleets).some((f) => f.routeId === route!.id)) delete s.routes[route.id];
    return { ok: false, error: 'Budget too small for new ships.' };
  }
  return orderShips(s, owner, choice.designId, ships, 'earth', route.id);
}

/** Make sure the best local source is connected to `st`. */
export function ensureLocalSupply(s: GameState, st: Settlement, owner: string, budget: number): CommandResult {
  const hub = earthHub(s);
  const srcs = localSources(s, st);
  if (srcs.length === 0) return { ok: true, info: 'No local source' };
  const { src, tonnes } = srcs[0];
  // One local feeder per destination: keep using an existing one from another source
  const otherLocal = Object.values(s.routes).find((r) => r.active && !r.transship && r.destination === st.id && r.origin !== src.id && r.origin !== hub?.id && (r.stats.deliveredYear > 0 || s.day - r.created < 240));
  if (otherLocal) return { ok: true, info: 'Local feeder exists' };
  const oNode = SITE[src.siteId].node, dNode = SITE[st.siteId].node;
  // Only a net producer of the ships' propellant can run a local route (imported stock would
  // just pull more propellant up from Earth), and the ships must not refuel anywhere else
  const makes = (g: string) => (src.production[g] ?? 0) - (src.consumption[g] ?? 0) > 5;
  const selfFuelled = (plan: RoutePlan) => Object.keys(plan.propDraw).every((n) => n === oNode || (n === dNode && !!plan.propType && netProducer(st, plan.propType)));
  const r = ensureLeg(s, src, st, owner, budget, tonnes * 12, { priority: 1, accept: (plan) => !plan.propType || (makes(plan.propType) && selfFuelled(plan)) });
  return r.ok || r.error?.startsWith('No available design') ? { ok: true, info: r.info ?? 'No self-fuelled design' } : r;
}

export function annualNeed(st: Settlement): { tonnes: number; passengers: number } {
  let t = 0;
  for (const g in st.demand) t += st.demand[g];
  // demand is a stock gap; convert to an annual flow estimate
  let own = 0;
  const goods = new Set([...Object.keys(st.consumption), ...Object.keys(st.shortfall ?? {})]);
  for (const g of goods) own += Math.max(0, (st.consumption[g] ?? 0) + (st.shortfall?.[g] ?? 0) - (st.production[g] ?? 0));
  // construction materials: spread over at least a year
  for (const p of st.construction) for (const g in p.materials) own += Math.max(0, p.materials[g]) / Math.max(12, p.monthsTotal);
  own *= 12;
  // Small outposts don't justify fleets sized for a city
  const pop = popOf(st);
  if (pop < 200) own = Math.min(own, 300 + pop * 15);
  // Throughput for others: ships refuelling here and goods forwarded down distribution legs
  let through = 0;
  for (const g in st.routeDraw) through += Math.max(0, st.routeDraw[g] - (st.production[g] ?? 0));
  for (const g in st.forward ?? {}) through += st.forward![g];
  return { tonnes: Math.max(t * 0.5, own + through * 12), passengers: ((st.flags.migrationDemand as number) ?? 0) * 12 };
}

/**
 * The orbital settlement a surface destination is best supplied through: the
 * nearest settlement on the trajectory from the Earth hub (the Lunar Gateway
 * for the Moon, a Mars orbital station for Mars).
 */
export function transferHub(s: GameState, st: Settlement): Settlement | undefined {
  const site = SITE[st.siteId];
  if (site.kind === 'orbital') return undefined;
  const hub = earthHub(s);
  if (!hub) return undefined;
  const path = shortestPath(SITE[hub.siteId].node, site.node, { aero: false, aerocaptureTech: false, lowThrust: false });
  if (!path || path.nodes.length < 3) return undefined;
  for (let i = path.nodes.length - 2; i >= 1; i--) {
    const id = settlementAtNode(s, path.nodes[i]);
    if (!id) continue;
    const via = s.settlements[id];
    if (via.id === st.id || via.flags.earthHub || SITE[via.siteId].kind !== 'orbital' || isIndependentish(via)) continue;
    return via;
  }
  return undefined;
}

function isIndependentish(st: Settlement): boolean {
  return st.status === 'independent' || st.status === 'associated';
}

/**
 * Make sure a settlement has enough supply capacity. Nearby producers are
 * connected first (cheaper delta-v than Earth). Surface bases are then served
 * through their transfer hub where one exists (tugs to orbit, landers down);
 * otherwise directly from the Earth hub. Returns ok without `info` when it spent money.
 */
export function ensureSupply(s: GameState, st: Settlement, owner: string, budget: number): CommandResult {
  const hub = earthHub(s);
  if (!hub || hub.id === st.id) return { ok: false, error: 'No hub.' };
  const local = ensureLocalSupply(s, st, owner, budget * 0.5);
  const spentLocal = local.ok && !local.info;
  if (spentLocal) budget *= 0.5;
  const need = annualNeed(st);
  let localDelivered = 0;
  for (const r of Object.values(s.routes)) if (r.active && !r.transship && r.destination === st.id && r.origin !== hub.id) localDelivered += r.stats.deliveredYear;
  need.tonnes = Math.max(need.tonnes * 0.25, need.tonnes - localDelivered);
  const far = !['earthOrbit', 'luna'].includes(regionOf(st));
  const pax = far || need.passengers > 50 ? need.passengers : 0;
  const done = (r: CommandResult): CommandResult => (spentLocal && !(r.ok && !r.info) ? { ok: true } : r);
  // Via the transfer hub: a distribution leg down, and the hub leg up to the transfer point
  const via = transferHub(s, st);
  if (via) {
    const leg = ensureLeg(s, via, st, owner, budget * 0.6, need.tonnes, { priority: 2, transship: true, passengers: pax });
    if (leg.ok || !leg.error?.startsWith('No available design')) {
      const up = ensureSupply(s, via, owner, budget * 0.4);
      return done(leg.ok && !leg.info ? leg : up.ok && !up.info ? up : leg);
    }
  }
  return done(ensureLeg(s, hub, st, owner, budget, need.tonnes, { priority: far ? 4 : 3, passengers: pax, maxShips: far ? 4 : 3 }));
}

export function describeActor(s: GameState, id: string): string {
  return actorName(s, id);
}

export { popOf, createFleet, totalCost };
