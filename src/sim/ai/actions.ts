// Primitive actions shared by AI actors and player commands.
import type { GameState, Settlement, CommandResult } from '../types';
import { FACILITY } from '../content/facilities';
import { SITE } from '../content/sites';
import { nextId } from '../core/util';
import { queueConstruction, createRoute, createFleet } from '../systems/factory';
import { capitalCost, actorFunds, debit, regionOf, popOf, actorName } from '../systems/helpers';
import { mod } from '../systems/modifiers';
import { designStats } from '../systems/designs';
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
  const funds = actorFunds(s, actor);
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

/** Route capacity (t/yr) currently serving a destination, including ships on order. */
export function supplyCapacity(s: GameState, destId: string): { tonnes: number; passengers: number } {
  let t = 0, p = 0;
  for (const r of Object.values(s.routes)) {
    if (!r.active || r.destination !== destId) continue;
    const rt = routeRuntime.get(r.id);
    if (rt) for (const x of rt.plans) if (x.plan.feasible) {
      t += x.plan.capacityPerShipYear * x.fleet.count;
      p += x.plan.passengers * x.plan.tripsPerYear * x.fleet.count;
    }
    for (const o of s.shipOrders) if (o.routeId === r.id) t += (r.stats.capacityYear / Math.max(1, fleetCount(s, r.id))) * o.count;
  }
  return { tonnes: t, passengers: p };
}

function fleetCount(s: GameState, routeId: string): number {
  let n = 0;
  for (const f of Object.values(s.fleets)) if (f.routeId === routeId) n += f.count;
  return n;
}

export function annualNeed(st: Settlement): { tonnes: number; passengers: number } {
  let t = 0;
  for (const g in st.demand) t += st.demand[g];
  // demand is a stock gap; convert to an annual flow estimate
  let flow = 0;
  for (const g in st.consumption) flow += Math.max(0, (st.consumption[g] ?? 0) - (st.production[g] ?? 0));
  for (const p of st.construction) for (const g in p.materials) flow += Math.max(0, p.materials[g]) / Math.max(1, p.monthsTotal) * 1.5;
  return { tonnes: Math.max(t * 0.5, flow * 12), passengers: ((st.flags.migrationDemand as number) ?? 0) * 12 };
}

/** Make sure a settlement has enough supply capacity. Creates or grows a route owned by `owner`. */
export function ensureSupply(s: GameState, st: Settlement, owner: string, budget: number): CommandResult {
  const hub = earthHub(s);
  if (!hub || hub.id === st.id) return { ok: false, error: 'No hub.' };
  const need = annualNeed(st);
  const cap = supplyCapacity(s, st.id);
  const far = !['earthOrbit', 'luna'].includes(regionOf(st));
  const wantPax = far && need.passengers > cap.passengers * 1.1;
  if (cap.tonnes >= need.tonnes * 1.25 && !wantPax) return { ok: true, info: 'Adequate' };
  const origin = hub;
  const oNode = SITE[origin.siteId].node;
  const dNode = SITE[st.siteId].node;
  const choice = bestDesignFor(s, oNode, dNode, owner, wantPax);
  if (!choice) return { ok: false, error: `No available design can serve ${st.name}.` };
  let route = Object.values(s.routes).find((r) => r.active && r.owner === owner && r.destination === st.id && r.origin === origin.id);
  if (!route) route = createRoute(s, `${origin.name} → ${st.name}`, owner, origin.id, st.id, 'supply', far ? 4 : 3);
  const gap = Math.max(need.tonnes * 1.3 - cap.tonnes, 0);
  let ships = Math.ceil(gap / Math.max(1, choice.plan.capacityPerShipYear));
  if (wantPax && choice.plan.passengers > 0) ships = Math.max(ships, Math.ceil((need.passengers - cap.passengers) / Math.max(1, choice.plan.passengers * choice.plan.tripsPerYear)));
  ships = Math.max(1, Math.min(far ? 4 : 3, ships));
  const cost = shipOrderCost(s, choice.designId, ships, 'earth');
  if (cost > budget) {
    ships = Math.floor(budget / Math.max(1, cost / ships));
    if (ships < 1) return { ok: false, error: 'Budget too small for new ships.' };
  }
  return orderShips(s, owner, choice.designId, ships, 'earth', route.id);
}

export function describeActor(s: GameState, id: string): string {
  return actorName(s, id);
}

export { popOf, createFleet, totalCost };
