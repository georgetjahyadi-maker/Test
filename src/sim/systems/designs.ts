import type { GameState, Settlement, VehicleDesign } from '../types';
import { computeDesignStats, planRoute, type DesignStats, type RoutePlan } from '../physics/engineering';
import { SITE } from '../content/sites';
import { mod } from './modifiers';

const statsCache = new Map<string, { key: string; stats: DesignStats }>();

const techMemo = new WeakMap<GameState, { n: number; key: string }>();

/** Fingerprint of the known technologies (knowledge only grows, so the count detects change). */
function techKey(s: GameState): string {
  let n = 0;
  for (const id in s.tech) if (s.tech[id].known) n++;
  const m = techMemo.get(s);
  if (m && m.n === n) return m.key;
  const key = Object.keys(s.tech).filter((id) => s.tech[id].known).sort().join(',');
  techMemo.set(s, { n, key });
  return key;
}

export function designStats(s: GameState, d: VehicleDesign): DesignStats {
  const key = `${d.id}:${techKey(s)}:${JSON.stringify(d.components)}:${d.structure}`;
  const c = statsCache.get(d.id);
  if (c && c.key === key) return c.stats;
  const st = computeDesignStats(d, (t) => !!s.tech[t]?.known);
  statsCache.set(d.id, { key, stats: st });
  return st;
}

export function settlementAtNode(s: GameState, node: string): string | undefined {
  for (const id of Object.keys(s.settlements).sort()) {
    if (SITE[s.settlements[id].siteId].node === node) return id;
  }
  return undefined;
}

/**
 * Where a design can plan to refuel. Depots (large propellant storage) and
 * producers are treated as refuelling points even when temporarily empty, so
 * that plans stay stable. Shortages then limit trips instead of making the
 * route infeasible, and the unmet draw becomes demand for the supply chain.
 */
export function refuelPredicate(s: GameState, propType: string | null, extraOrigin?: string): (node: string) => boolean {
  return (node: string) => {
    if (!propType) return true;
    if (node === extraOrigin) return true;
    const id = settlementAtNode(s, node);
    if (!id) return false;
    return isRefuelPoint(s.settlements[id], propType);
  };
}

/** Makes more of this propellant than it uses itself (t per month). */
export function netProducer(st: Settlement, g: string): boolean {
  // Output held back for want of buyers still counts: the plant can run up at once
  const potential = (st.production[g] ?? 0) + (st.idleCapacity?.[g] ?? 0);
  // A settlement that must import the good for its own needs is no producer
  return potential - (st.consumption[g] ?? 0) > 1 && (st.demand[g] ?? 0) < potential * 0.5;
}

export function isRefuelPoint(st: Settlement, propType: string): boolean {
  if (st.flags.earthHub) return true;
  if (st.propellantCap >= 5000) return true;
  if ((st.production[propType] ?? 0) > 1) return true;
  return (st.stock[propType] ?? 0) > 30;
}

/**
 * Plan a design on a route. `noRefuel` removes refuelling stops (depots that are
 * short this month); `forceRefuel` adds them (e.g. a founding mission that brings
 * its own propellant plant to the destination).
 */
export function planFor(s: GameState, d: VehicleDesign, originNode: string, destNode: string, noRefuel?: string[], forceRefuel?: string[]): RoutePlan {
  const stats = designStats(s, d);
  const propType = stats.propellantless ? null : stats.propType;
  const base = refuelPredicate(s, propType, originNode);
  // Refuel at the destination only where propellant is made there. Otherwise the route
  // would have to deliver its own return propellant, which feeds back on itself.
  const destId = settlementAtNode(s, destNode);
  const dest = destId ? s.settlements[destId] : undefined;
  const destOk = !propType || !dest || !!dest.flags.earthHub || netProducer(dest, propType);
  const refuelAt = (n: string) => n === originNode || (!!forceRefuel && forceRefuel.includes(n)) || (!(noRefuel && noRefuel.includes(n)) && (n !== destNode || destOk) && base(n));
  return planRoute(stats, originNode, destNode, {
    aerocaptureTech: !!s.tech.aerocapture?.known,
    refuelAt,
    beamNetworkW: s.swarm.transmittedW,
    reliabilityBonus: mod(s, 'reliability'),
  });
}
