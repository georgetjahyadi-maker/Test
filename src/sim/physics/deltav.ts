// Delta-v transport network built from patched-conic approximations.
import { BODY, AU_KM } from '../content/bodies';
import { SITES } from '../content/sites';

const MU_SUN = 1.32712e11;

export interface DvNode {
  id: string;
  body: string;
  kind: 'surface' | 'orbit' | 'high';
  label: string;
  siteId?: string;
}

export interface DvEdge {
  from: string;
  to: string;
  dv: number; // km/s, impulsive, no aerobraking
  dvAero?: number; // km/s with aeroshell (aerobraking, aerocapture or aero-entry)
  dvLowThrust?: number; // km/s for low-thrust spirals; undefined = impossible
  days: number;
  kind: 'surface' | 'local' | 'helio';
  gravity?: number; // g at the surface end
  ascent?: boolean;
  synodicDays?: number;
  waitDays?: number; // stay at destination until return window (Hohmann)
  distanceKm?: number;
  aeroNeedsTech?: boolean; // aerocapture (vs. entry) needs the aerocapture tech
}

export interface DvGraph {
  nodes: Record<string, DvNode>;
  adj: Record<string, DvEdge[]>;
}

const vcirc = (mu: number, r: number) => Math.sqrt(mu / r);

// Low orbit node per body
export const ORBIT_NODE: Record<string, string> = {
  earth: 'leo',
  moon: 'llo',
  mars: 'lmo',
  venus: 'lvo',
  mercury: 'lmeo',
  ceres: 'ceres_orbit',
};

function orbitNodeFor(body: string): string {
  return ORBIT_NODE[body] ?? `${body}_lo`;
}

interface Hub {
  node: string;
  planet: string; // heliocentric body
  mode: 'low' | 'earthHigh' | 'moon' | 'high' | 'small';
  body?: string; // the body whose low orbit it is (moon or planet)
  rKm?: number; // radius around planet for 'high' / moon orbit
  extra?: number; // extra delta-v for earthHigh (drop to perigee and back)
}

const HUBS: Hub[] = [
  { node: 'leo', planet: 'earth', mode: 'low', body: 'earth' },
  { node: 'eml1', planet: 'earth', mode: 'earthHigh', extra: 0.7 },
  { node: 'eml5', planet: 'earth', mode: 'earthHigh', extra: 0.8 },
  { node: 'llo', planet: 'earth', mode: 'earthHigh', extra: 0.9 },
  { node: 'lvo', planet: 'venus', mode: 'low', body: 'venus' },
  { node: 'lmeo', planet: 'mercury', mode: 'low', body: 'mercury' },
  { node: 'lmo', planet: 'mars', mode: 'low', body: 'mars' },
  { node: 'phobos', planet: 'mars', mode: 'high', rKm: 9376 },
  { node: 'deimos', planet: 'mars', mode: 'high', rKm: 23463 },
  { node: 'nea_bennu', planet: 'bennu', mode: 'small' },
  { node: 'nea_ryugu', planet: 'ryugu', mode: 'small' },
  { node: 'nea_amun', planet: 'amun', mode: 'small' },
  { node: 'ceres_orbit', planet: 'ceres', mode: 'low', body: 'ceres' },
  { node: 'vesta_lo', planet: 'vesta', mode: 'low', body: 'vesta' },
  { node: 'psyche', planet: 'psyche', mode: 'low', body: 'psyche' },
  { node: 'callisto_lo', planet: 'jupiter', mode: 'moon', body: 'callisto' },
  { node: 'ganymede_lo', planet: 'jupiter', mode: 'moon', body: 'ganymede' },
  { node: 'europa_lo', planet: 'jupiter', mode: 'moon', body: 'europa' },
  { node: 'io_lo', planet: 'jupiter', mode: 'moon', body: 'io' },
  { node: 'titan_lo', planet: 'saturn', mode: 'moon', body: 'titan' },
  { node: 'enceladus_lo', planet: 'saturn', mode: 'moon', body: 'enceladus' },
  { node: 'saturn_orbit', planet: 'saturn', mode: 'high', rKm: 1.2e6 },
  { node: 'uranus_orbit', planet: 'uranus', mode: 'high', rKm: 3.0e5 },
  { node: 'triton_lo', planet: 'neptune', mode: 'moon', body: 'triton' },
  { node: 'pluto_lo', planet: 'pluto', mode: 'low', body: 'pluto' },
];

function lowOrbitRadius(body: string): number {
  const b = BODY[body];
  return b.radiusKm + b.lowOrbitAltKm;
}

/** Delta-v to go from a hub to a hyperbolic excess v∞ (km/s) relative to its planet (or back). */
function hubEscape(h: Hub, vinf: number): { dv: number; lowThrust: number } {
  const planet = BODY[h.planet];
  switch (h.mode) {
    case 'low': {
      const b = BODY[h.body!];
      const r = lowOrbitRadius(h.body!);
      const dv = Math.sqrt(vinf * vinf + (2 * b.mu) / r) - vcirc(b.mu, r);
      return { dv, lowThrust: vcirc(b.mu, r) + vinf * 0.3 };
    }
    case 'earthHigh': {
      const rLeo = lowOrbitRadius('earth');
      const vesc = Math.sqrt((2 * BODY.earth.mu) / rLeo);
      const dv = h.extra! + (Math.sqrt(vinf * vinf + vesc * vesc) - vesc);
      return { dv, lowThrust: 1.2 + vinf * 0.3 };
    }
    case 'high': {
      const r = h.rKm!;
      const v = vcirc(planet.mu, r);
      const dv = Math.sqrt(vinf * vinf + (2 * planet.mu) / r) - v;
      return { dv, lowThrust: v * 0.9 + vinf * 0.3 };
    }
    case 'moon': {
      const moon = BODY[h.body!];
      const rm = moon.a;
      const vm = vcirc(planet.mu, rm);
      const vNeeded = Math.sqrt(vinf * vinf + (2 * planet.mu) / rm);
      const vinfMoon = Math.abs(vNeeded - vm) * 0.8; // moon flybys / gravity assists
      const rlo = lowOrbitRadius(h.body!);
      const dv = Math.sqrt(vinfMoon * vinfMoon + (2 * moon.mu) / rlo) - vcirc(moon.mu, rlo);
      return { dv, lowThrust: vm * 0.6 + vcirc(moon.mu, rlo) + vinf * 0.3 };
    }
    case 'small':
    default:
      return { dv: vinf, lowThrust: vinf * 1.1 };
  }
}

function hubAtmosphere(h: Hub): 'none' | 'thin' | 'thick' {
  if (h.mode === 'low' && h.body) return BODY[h.body].atmosphere;
  if (h.mode === 'moon' && h.body) return BODY[h.body].atmosphere;
  return 'none';
}

function planetOf(h: Hub) {
  return BODY[h.planet];
}

function synodic(p1: number, p2: number): number {
  const d = Math.abs(1 / p1 - 1 / p2);
  return d < 1e-9 ? 1e9 : 1 / d;
}

function waitForReturn(p1: number, p2: number, tH: number): number {
  const n1 = (2 * Math.PI) / p1;
  const n2 = (2 * Math.PI) / p2;
  const TWO_PI = 2 * Math.PI;
  let target = (TWO_PI - 2 * n1 * tH) % TWO_PI;
  if (target < 0) target += TWO_PI;
  const rate = n1 - n2;
  if (Math.abs(rate) < 1e-12) return 0;
  const w = rate > 0 ? target / rate : (target - TWO_PI) / rate;
  return Math.max(0, w);
}

function addEdge(g: DvGraph, e: DvEdge) {
  (g.adj[e.from] ??= []).push(e);
}

function addPair(g: DvGraph, a: DvEdge, backDv?: number, backAero?: number, backLT?: number) {
  addEdge(g, a);
  addEdge(g, {
    ...a,
    from: a.to,
    to: a.from,
    dv: backDv ?? a.dv,
    dvAero: backAero,
    dvLowThrust: backLT ?? a.dvLowThrust,
    ascent: a.kind === 'surface' ? !a.ascent : undefined,
  });
}

let GRAPH: DvGraph | null = null;

export function getGraph(): DvGraph {
  if (GRAPH) return GRAPH;
  const g: DvGraph = { nodes: {}, adj: {} };
  // Nodes from sites
  for (const s of SITES) {
    g.nodes[s.node] = { id: s.node, body: s.body, kind: s.kind === 'surface' || s.kind === 'atmospheric' ? 'surface' : 'orbit', label: s.name, siteId: s.id };
  }
  // Implicit orbit nodes for bodies with surface sites
  for (const s of SITES) {
    if (s.kind === 'surface' || s.kind === 'atmospheric') {
      const on = orbitNodeFor(s.body);
      if (!g.nodes[on]) g.nodes[on] = { id: on, body: s.body, kind: 'orbit', label: `Low ${BODY[s.body].name} Orbit` };
    }
  }
  for (const h of HUBS) {
    if (!g.nodes[h.node]) g.nodes[h.node] = { id: h.node, body: h.body ?? h.planet, kind: h.mode === 'low' ? 'orbit' : 'high', label: h.node };
  }

  // --- Surface <-> orbit ---------------------------------------------------
  for (const s of SITES) {
    if (s.kind !== 'surface' && s.kind !== 'atmospheric') continue;
    const b = BODY[s.body];
    const on = orbitNodeFor(s.body);
    const r = lowOrbitRadius(s.body);
    let factor = 1.14;
    if (b.atmosphere === 'thin') factor = 1.2;
    if (b.atmosphere === 'thick') factor = s.kind === 'atmospheric' ? 1.12 : 1.4;
    const up = vcirc(b.mu, r) * factor;
    const aeroFactor = b.atmosphere === 'thick' ? 0.06 : b.atmosphere === 'thin' ? 0.22 : undefined;
    const days = b.id === 'moon' || b.type === 'moon' ? 1 : 2;
    // descent (orbit -> surface)
    addEdge(g, { from: on, to: s.node, dv: up, dvAero: aeroFactor !== undefined ? up * aeroFactor : undefined, days, kind: 'surface', gravity: s.gravity, ascent: false });
    // ascent (surface -> orbit)
    addEdge(g, { from: s.node, to: on, dv: up, days, kind: 'surface', gravity: s.gravity, ascent: true });
  }

  // --- Local cislunar and Mars-system edges --------------------------------
  const local = (a: string, b: string, dv: number, days: number, lt: number, backAero?: number, backDv?: number) =>
    addPair(g, { from: a, to: b, dv, days, kind: 'local', dvLowThrust: lt }, backDv, backAero, lt);
  local('leo', 'geo', 3.9, 1, 4.7, 1.6);
  local('leo', 'eml1', 3.77, 4, 6.8, 0.9);
  local('leo', 'eml5', 4.0, 5, 7.0, 1.1);
  local('leo', 'llo', 4.04, 4, 7.1, 1.0);
  local('eml1', 'llo', 0.64, 2, 0.8);
  local('eml1', 'eml5', 0.35, 12, 0.4);
  local('geo', 'eml1', 1.4, 3, 2.0);
  local('lmo', 'phobos', 1.1, 1, 1.4, 0.4);
  local('lmo', 'deimos', 1.4, 1.5, 1.8, 0.5);
  local('phobos', 'deimos', 0.75, 2, 0.9);

  // Planet-centric transfers between hubs orbiting the same giant planet
  const groups: Record<string, Hub[]> = {};
  for (const h of HUBS) if (h.mode === 'moon' || h.mode === 'high') (groups[h.planet] ??= []).push(h);
  for (const planet in groups) {
    const list = groups[planet];
    const P = BODY[planet];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        const rA = A.mode === 'moon' ? BODY[A.body!].a : A.rKm!;
        const rB = B.mode === 'moon' ? BODY[B.body!].a : B.rKm!;
        const at = (rA + rB) / 2;
        const vA = vcirc(P.mu, rA), vB = vcirc(P.mu, rB);
        const vtA = Math.sqrt(P.mu * (2 / rA - 1 / at)), vtB = Math.sqrt(P.mu * (2 / rB - 1 / at));
        const vinfA = Math.abs(vtA - vA), vinfB = Math.abs(vB - vtB);
        const cost = (h: Hub, vinf: number) => {
          if (h.mode === 'moon') {
            const m = BODY[h.body!];
            const rlo = lowOrbitRadius(h.body!);
            return Math.sqrt(vinf * vinf + (2 * m.mu) / rlo) - vcirc(m.mu, rlo);
          }
          return vinf;
        };
        const dv = (cost(A, vinfA) + cost(B, vinfB)) * 0.85;
        const days = (Math.PI * Math.sqrt(at ** 3 / P.mu)) / 86400;
        addPair(g, { from: A.node, to: B.node, dv, days: Math.max(2, days), kind: 'local', dvLowThrust: Math.abs(vA - vB) * 1.1 + 0.5 });
      }
    }
  }

  // --- Heliocentric transfers ------------------------------------------------
  for (let i = 0; i < HUBS.length; i++) {
    for (let j = 0; j < HUBS.length; j++) {
      if (i === j) continue;
      const A = HUBS[i], B = HUBS[j];
      if (A.planet === B.planet) continue;
      const PA = planetOf(A), PB = planetOf(B);
      const r1 = PA.a * AU_KM, r2 = PB.a * AU_KM;
      const at = (r1 + r2) / 2;
      const vp1 = vcirc(MU_SUN, r1), vp2 = vcirc(MU_SUN, r2);
      const vt1 = Math.sqrt(MU_SUN * (2 / r1 - 1 / at));
      const vt2 = Math.sqrt(MU_SUN * (2 / r2 - 1 / at));
      const vinf1 = Math.abs(vt1 - vp1);
      const vinf2 = Math.abs(vp2 - vt2);
      const di = Math.abs(PA.i - PB.i) * (Math.PI / 180);
      const plane = 2 * Math.min(vt1, vt2) * Math.sin(di / 2) * 0.35;
      const dep = hubEscape(A, vinf1);
      const arr = hubEscape(B, vinf2);
      let dv = dep.dv + arr.dv + plane;
      const outer = PA.a > 4 || PB.a > 4;
      if (outer) dv *= 0.85; // gravity assists
      // Aerocapture at destination
      const atmo = hubAtmosphere(B);
      let dvAero: number | undefined;
      if (atmo !== 'none' && (B.mode === 'low' || B.mode === 'moon')) dvAero = dep.dv + plane + 0.3;
      const tH = (Math.PI * Math.sqrt(at ** 3 / MU_SUN)) / 86400;
      let syn = synodic(PA.period, PB.period);
      if (PA.type === 'asteroid' || PB.type === 'asteroid') syn = Math.min(syn, 1100);
      const wait = waitForReturn(PA.period, PB.period, tH);
      const lt = dep.lowThrust + Math.abs(vp1 - vp2) + arr.lowThrust + plane * 1.2;
      addEdge(g, {
        from: A.node,
        to: B.node,
        dv,
        dvAero,
        aeroNeedsTech: true,
        dvLowThrust: lt,
        days: tH,
        kind: 'helio',
        synodicDays: syn,
        waitDays: Math.min(wait, syn),
        distanceKm: Math.sqrt(r1 * r1 + r2 * r2),
      });
    }
  }
  GRAPH = g;
  return g;
}

export interface PathOptions {
  aero: boolean; // design has sufficient aeroshell
  aerocaptureTech: boolean;
  lowThrust: boolean; // electric / sail propulsion: surface edges impossible
}

export function edgeDv(e: DvEdge, o: PathOptions): number | null {
  if (o.lowThrust) {
    if (e.kind === 'surface') return null;
    return e.dvLowThrust ?? null;
  }
  let dv = e.dv;
  if (o.aero && e.dvAero !== undefined && (!e.aeroNeedsTech || o.aerocaptureTech)) dv = Math.min(dv, e.dvAero);
  return dv;
}

export interface PathResult {
  nodes: string[];
  edges: DvEdge[];
  dv: number;
}

const pathCache = new Map<string, PathResult | null>();

export function shortestPath(from: string, to: string, o: PathOptions): PathResult | null {
  const key = `${from}|${to}|${o.aero ? 1 : 0}${o.aerocaptureTech ? 1 : 0}${o.lowThrust ? 1 : 0}`;
  if (pathCache.has(key)) return pathCache.get(key)!;
  const g = getGraph();
  if (from === to) {
    const r = { nodes: [from], edges: [], dv: 0 };
    pathCache.set(key, r);
    return r;
  }
  const dist: Record<string, number> = { [from]: 0 };
  const prev: Record<string, DvEdge | undefined> = {};
  const visited = new Set<string>();
  const nodes = Object.keys(g.nodes);
  while (true) {
    let best: string | null = null;
    let bd = Infinity;
    for (const n of nodes) {
      if (visited.has(n)) continue;
      const d = dist[n];
      if (d !== undefined && d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best === null) break;
    if (best === to) break;
    visited.add(best);
    for (const e of g.adj[best] ?? []) {
      const w = edgeDv(e, o);
      if (w === null) continue;
      // Penalize multi-leg helio chains slightly so direct transfers are preferred
      const nd = bd + w + (e.kind === 'helio' ? 0.05 : 0.01);
      if (dist[e.to] === undefined || nd < dist[e.to]) {
        dist[e.to] = nd;
        prev[e.to] = e;
      }
    }
  }
  if (dist[to] === undefined) {
    pathCache.set(key, null);
    return null;
  }
  const edges: DvEdge[] = [];
  let cur = to;
  while (cur !== from) {
    const e = prev[cur]!;
    edges.unshift(e);
    cur = e.from;
  }
  let total = 0;
  for (const e of edges) total += edgeDv(e, o) ?? 0;
  const res = { nodes: [from, ...edges.map((e) => e.to)], edges, dv: total };
  pathCache.set(key, res);
  return res;
}

/** Reverse-direction edge (for the return trip). */
export function reverseEdge(e: DvEdge): DvEdge | undefined {
  const g = getGraph();
  return (g.adj[e.to] ?? []).find((x) => x.to === e.from && x.kind === e.kind);
}
