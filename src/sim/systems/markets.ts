// Regional price formation between import-parity ceilings and export-netback floors.
import type { GameState } from '../types';
import { GOODS, GOOD } from '../content/goods';
import { SITE } from '../content/sites';
import { clamp } from '../core/util';
import { shortestPath } from '../physics/deltav';
import { BD, setExplain } from '../core/breakdown';
import { known } from './helpers';

export const REGION_NODE: Record<string, string> = {
  earthOrbit: 'leo',
  luna: 'luna_shackleton',
  nea: 'nea_ryugu',
  mars: 'mars_arcadia',
  venus: 'venus_clouds',
  mercury: 'mercury_caloris',
  belt: 'ceres',
  jupiter: 'callisto',
  saturn: 'titan',
  outer: 'triton',
};

export const REGION_NAME: Record<string, string> = {
  earth: 'Earth',
  earthOrbit: 'Earth Orbit',
  luna: 'Luna',
  nea: 'Near-Earth Asteroids',
  mars: 'Mars',
  venus: 'Venus',
  mercury: 'Mercury',
  belt: 'Main Belt',
  jupiter: 'Jupiter System',
  saturn: 'Saturn System',
  outer: 'Outer System',
};

export function bestExhaustVelocity(s: GameState): number {
  if (known(s, 'advanced_fusion_drives')) return 400;
  if (known(s, 'fusion_drives')) return 150;
  if (known(s, 'nuclear_electric_propulsion')) return 25;
  if (known(s, 'nuclear_thermal_propulsion')) return 8.5;
  return 3.7;
}

let dvCache: { key: string; table: Record<string, number> } | null = null;

export function regionDv(s: GameState, from: string, to: string): number {
  const key = `${known(s, 'aerocapture') ? 1 : 0}`;
  if (!dvCache || dvCache.key !== key) dvCache = { key, table: {} };
  const k = `${from}>${to}`;
  if (dvCache.table[k] !== undefined) return dvCache.table[k];
  const a = REGION_NODE[from], b = REGION_NODE[to];
  let dv = 0;
  if (a && b && a !== b) {
    const p = shortestPath(a, b, { aero: true, aerocaptureTech: known(s, 'aerocapture'), lowThrust: false });
    dv = p ? p.dv : 30;
  }
  dvCache.table[k] = dv;
  return dv;
}

/** Estimated cost to move one tonne between regions with the best common technology. */
export function freightEstimate(s: GameState, from: string, to: string, propPrice: number): number {
  if (from === to) return 5000;
  const dv = regionDv(s, from === 'earth' ? 'earthOrbit' : from, to === 'earth' ? 'earthOrbit' : to);
  const ve = bestExhaustVelocity(s);
  const k = Math.exp(Math.min(12, dv / ve)) - 1;
  const oneWay = propPrice * k * 1.35 + 8000;
  return oneWay;
}

export function marketsMonthly(s: GameState): void {
  // --- Earth prices for goods supplied from space --------------------------
  for (const g of GOODS) {
    const del = s.earth.spaceDeliveries[g.id] ?? 0;
    s.earth.spaceSupply[g.id] = (s.earth.spaceSupply[g.id] ?? 0) * (11 / 12) + del;
    if (g.earthDemand) {
      let demand = g.earthDemand;
      if (g.id === 'fusionFuel' && known(s, 'fusion_power')) demand = 60 + ((s.events.flags.fusionYears as number) ?? 0) * 25;
      const supply = s.earth.spaceSupply[g.id];
      const pr = g.price * Math.pow(1 + supply / Math.max(1, demand), -1 / (g.elasticity ?? 1));
      s.earth.prices[g.id] = Math.max(g.price * 0.02, pr);
    } else {
      s.earth.prices[g.id] = g.price;
    }
  }
  s.earth.spaceDeliveries = {};
  if (known(s, 'fusion_power')) s.events.flags.fusionYears = ((s.events.flags.fusionYears as number) ?? 0) + 1 / 12;

  // --- Regional aggregates --------------------------------------------------
  const regions = Object.keys(s.markets).filter((r) => r !== 'earth').sort();
  const agg: Record<string, { supply: Record<string, number>; demand: Record<string, number>; prod: Record<string, number>; use: Record<string, number>; count: number }> = {};
  for (const r of regions) agg[r] = { supply: {}, demand: {}, prod: {}, use: {}, count: 0 };
  for (const id of Object.keys(s.settlements).sort()) {
    const st = s.settlements[id];
    const r = SITE[st.siteId].region;
    const a = agg[r];
    if (!a) continue;
    a.count++;
    for (const g in st.production) a.supply[g] = (a.supply[g] ?? 0) + st.production[g];
    for (const g in st.imports) a.supply[g] = (a.supply[g] ?? 0) + st.imports[g];
    for (const g in st.consumption) a.demand[g] = (a.demand[g] ?? 0) + st.consumption[g];
    for (const g in st.exports) a.demand[g] = (a.demand[g] ?? 0) + st.exports[g];
    // Ships refuelling here buy propellant too
    for (const g in st.routeDraw) a.demand[g] = (a.demand[g] ?? 0) + st.routeDraw[g];
    for (const g in st.demand) a.demand[g] = (a.demand[g] ?? 0) + st.demand[g] * 0.25;
    // What the region makes (or could make at once) against what it uses
    for (const g in st.production) a.prod[g] = (a.prod[g] ?? 0) + st.production[g];
    for (const g in st.idleCapacity ?? {}) a.prod[g] = (a.prod[g] ?? 0) + st.idleCapacity![g];
    for (const g in st.consumption) a.use[g] = (a.use[g] ?? 0) + st.consumption[g];
    for (const g in st.routeDraw) a.use[g] = (a.use[g] ?? 0) + st.routeDraw[g];
    for (const g in st.shortfall ?? {}) a.use[g] = (a.use[g] ?? 0) + st.shortfall![g];
  }
  const earthOrbitPrice = (g: string) => (s.earth.prices[g] ?? GOOD[g].price) + s.earth.launchPrice;
  for (const r of regions) {
    const m = s.markets[r];
    const a = agg[r];
    const propLocal = r === 'earthOrbit' ? earthOrbitPrice('propellant') : Math.min(m.prices.propellant ?? 1e6, earthOrbitPrice('propellant'));
    // Freight actually billed on deliveries into the region, when there is enough traffic to tell
    const fi = m.freightIn;
    const observed = fi && fi.t > 200 ? Math.min(fi.cost / fi.t, earthOrbitPrice('propellant') * 20) : 0;
    const inbound = Math.max(freightEstimate(s, 'earthOrbit', r, earthOrbitPrice('propellant')), observed);
    for (const g of GOODS) {
      const id = g.id;
      const earthP = s.earth.prices[id] ?? g.price;
      // import parity from Earth
      const fromEarth = r === 'earthOrbit' ? earthOrbitPrice(id) : earthOrbitPrice(id) + inbound;
      let ceiling = fromEarth;
      // import parity from other regions with surplus
      for (const q of regions) {
        if (q === r) continue;
        const aq = agg[q];
        if ((aq.supply[id] ?? 0) <= (aq.demand[id] ?? 0) * 1.05) continue;
        const cand = s.markets[q].prices[id] + freightEstimate(s, q, r, s.markets[q].prices.propellant ?? propLocal);
        if (cand < ceiling) ceiling = cand;
      }
      // export netback floor
      let floor = earthP * 0.03;
      const toEarth = earthP - freightEstimate(s, r, 'earthOrbit', propLocal) * 0.5 - (r === 'earthOrbit' ? 0 : 20000);
      if (toEarth > floor) floor = toEarth;
      for (const q of regions) {
        if (q === r) continue;
        const aq = agg[q];
        if ((aq.demand[id] ?? 0) <= (aq.supply[id] ?? 0)) continue;
        const nb = s.markets[q].prices[id] - freightEstimate(s, r, q, propLocal);
        if (nb > floor) floor = nb;
      }
      if (floor > ceiling) floor = ceiling * 0.95;
      // Import parity while the region relies on imports, export netback once it makes a surplus
      const P = a.prod[id] ?? 0;
      const U = a.use[id] ?? 0;
      let target: number;
      if (P + U <= 1e-9) target = ceiling * 0.85;
      else {
        const w = clamp((P / Math.max(1e-9, U) - 0.8) / 0.6, 0, 1);
        target = ceiling + (floor - ceiling) * w;
      }
      let p = m.prices[id] ?? ceiling;
      p = p + (target - p) * 0.3;
      m.prices[id] = clamp(p, floor, ceiling);
      m.ceiling[id] = ceiling;
      m.floor[id] = floor;
    }
    m.supply = a.supply;
    m.demand = a.demand;
    if (fi) {
      fi.t *= 11 / 12;
      fi.cost *= 11 / 12;
    }
  }
  const em = s.markets.earth;
  for (const g of GOODS) {
    em.prices[g.id] = s.earth.prices[g.id];
    em.ceiling[g.id] = s.earth.prices[g.id];
    em.floor[g.id] = s.earth.prices[g.id];
  }
  const w = new BD('cr/t', 'Luna water price between import parity (ceiling) and export netback (floor).');
  w.add('Import parity from Earth (ceiling)', s.markets.luna.ceiling.water);
  w.add('Export netback (floor)', s.markets.luna.floor.water);
  setExplain(s, 'market.luna.water', w, s.markets.luna.prices.water);
}
