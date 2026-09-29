import type { GameState, VehicleDesign } from '../types';
import { computeDesignStats, planRoute, type DesignStats, type RoutePlan } from '../physics/engineering';
import { SITE } from '../content/sites';
import { mod } from './modifiers';

const statsCache = new Map<string, { key: string; stats: DesignStats }>();

function techKey(s: GameState): number {
  let n = 0;
  for (const id in s.tech) if (s.tech[id].known) n++;
  return n;
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

export function refuelPredicate(s: GameState, propType: string | null, extraOrigin?: string): (node: string) => boolean {
  return (node: string) => {
    if (!propType) return true;
    if (node === extraOrigin) return true;
    const id = settlementAtNode(s, node);
    if (!id) return false;
    const st = s.settlements[id];
    if (st.flags.earthHub) return true;
    return (st.stock[propType] ?? 0) > 30;
  };
}

export function planFor(s: GameState, d: VehicleDesign, originNode: string, destNode: string): RoutePlan {
  const stats = designStats(s, d);
  return planRoute(stats, originNode, destNode, {
    aerocaptureTech: !!s.tech.aerocapture?.known,
    refuelAt: refuelPredicate(s, stats.propellantless ? null : stats.propType, originNode),
    beamNetworkW: s.swarm.transmittedW,
    reliabilityBonus: mod(s, 'reliability'),
  });
}
