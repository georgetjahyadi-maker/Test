// Spacecraft engineering: design statistics, physical validation and route planning.
import { COMPONENT, STRUCTURE } from '../content/components';
import { G0, BODY } from '../content/bodies';
import type { Stock, VehicleDesign } from '../types';
import { shortestPath, reverseEdge, edgeDv, getGraph, type DvEdge, type PathOptions } from './deltav';

export interface DesignStats {
  dryMass: number;
  structureMass: number;
  tankCapacity: Record<string, number>;
  propType: string | null;
  propCapacity: number;
  payload: number;
  crew: number;
  endurance: number;
  spinGravity: boolean;
  thrust: number; // kN
  isp: number;
  ve: number; // km/s
  dvEmpty: number;
  dvFull: number;
  accelFull: number; // m/s^2
  accelEmpty: number;
  powerGen: number;
  solarGen: number;
  powerReq: number;
  heatGen: number;
  radiatorCap: number;
  reliability: number;
  cost: number;
  goods: Stock;
  complexity: number;
  buildMonths: number;
  maintenancePerYear: number;
  aeroCapacity: number;
  navLevel: number;
  commRange: 'none' | 'orbital' | 'cislunar' | 'interplanetary';
  docking: boolean;
  transferSpeed: number;
  combat: number;
  defense: number;
  sensor: number;
  combatRating: number;
  lowThrust: boolean;
  propellantless: boolean;
  beamSail: boolean;
  fusionFuelRate: number;
  shielding: number;
  role: string;
  errors: string[];
  warnings: string[];
  techMissing: string[];
  counts: Record<string, number>;
}

const COMM_RANK = { none: 0, orbital: 1, cislunar: 2, interplanetary: 3 } as const;

export function computeDesignStats(design: Pick<VehicleDesign, 'components' | 'structure'>, knownTech?: (id: string) => boolean): DesignStats {
  const errors: string[] = [];
  const warnings: string[] = [];
  const techMissing: string[] = [];
  const structure = STRUCTURE[design.structure] ?? STRUCTURE.aluminium;
  if (structure.tech && knownTech && !knownTech(structure.tech)) techMissing.push(structure.tech);
  let compMass = 0, cost = 0, complexity = 0;
  let reliability = structure.reliability;
  const goods: Stock = {};
  const tankCapacity: Record<string, number> = {};
  const engines: { id: string; n: number }[] = [];
  let payload = 0, crew = 0, endurance = Infinity, spin = false;
  let powerGen = 0, solarGen = 0, powerReqOther = 0, powerReqEngines = 0, heat = 0, radiator = 0;
  let aero = 0, nav = 0, docking = false, transferSpeed = 1, combat = 0, defense = 0, sensor = 0, shielding = 0;
  let comm: DesignStats['commRange'] = 'none';
  let engineCount = 0;
  const counts: Record<string, number> = {};
  for (const id in design.components) {
    const n = Math.max(0, Math.floor(design.components[id] ?? 0));
    if (n <= 0) continue;
    const c = COMPONENT[id];
    if (!c) continue;
    counts[id] = n;
    if (c.tech && knownTech && !knownTech(c.tech) && !techMissing.includes(c.tech)) techMissing.push(c.tech);
    compMass += c.mass * n;
    cost += c.cost * n;
    complexity += c.complexity * n;
    reliability *= Math.pow(c.reliability, n);
    for (const g in c.goods) goods[g] = (goods[g] ?? 0) + c.goods[g] * n;
    if (c.category === 'propulsion') {
      engines.push({ id, n });
      engineCount += n;
      powerReqEngines += (c.powerReq ?? 0) * n;
    } else {
      powerReqOther += (c.powerReq ?? 0) * n;
    }
    if (c.tankCapacity && c.tankType) tankCapacity[c.tankType] = (tankCapacity[c.tankType] ?? 0) + c.tankCapacity * n;
    if (c.cargo) payload += c.cargo * n;
    if (c.crew) {
      crew += c.crew * n;
      endurance = Math.min(endurance, c.enduranceDays ?? 0);
    }
    if (c.spinGravity) spin = true;
    if (c.powerGen) {
      powerGen += c.powerGen * n;
      if (c.solar) solarGen += c.powerGen * n;
    }
    if (c.heat) heat += c.heat * n;
    if (c.radiator) radiator += c.radiator * n;
    if (c.aeroshell) aero += 300 * n;
    if (c.navLevel) nav = Math.max(nav, c.navLevel);
    if (c.commRange && COMM_RANK[c.commRange] > COMM_RANK[comm]) comm = c.commRange;
    if (c.docking) docking = true;
    if (c.transferSpeed) transferSpeed = Math.min(transferSpeed, c.transferSpeed);
    if (c.combat) combat += c.combat * n;
    if (c.defense) defense += c.defense * n;
    if (c.sensor) sensor += c.sensor * n;
    if (c.shielding) shielding = Math.max(shielding, c.shielding);
  }
  const structureMass = compMass * structure.massFraction;
  for (const g in structure.goods) goods[g] = (goods[g] ?? 0) + structure.goods[g] * structureMass;
  const dryMass = compMass + structureMass;
  cost = cost * structure.costMult + structureMass * 60000;
  cost *= 1.15; // integration and test

  // Propulsion
  let propType: string | null = null;
  let thrust = 0, ispWeighted = 0, fusionFuelRate = 0;
  let beamSail = false;
  let propellantless = false;
  const types = new Set<string>();
  for (const e of engines) {
    const c = COMPONENT[e.id];
    if (c.propellant) types.add(c.propellant);
    thrust += (c.thrust ?? 0) * e.n;
    ispWeighted += (c.thrust ?? 0) * e.n * (c.isp ?? 0);
    if (c.fusionFuelRate) fusionFuelRate = Math.max(fusionFuelRate, c.fusionFuelRate);
    if (c.beamSail) beamSail = true;
    if ((c.isp ?? 0) >= 1e6) propellantless = true;
  }
  if (engines.length === 0) errors.push('No propulsion installed.');
  const nonSail = engines.filter((e) => (COMPONENT[e.id].isp ?? 0) < 1e6);
  if (nonSail.length > 0 && propellantless) {
    errors.push('Sails cannot be combined with rocket engines on the same hull.');
  }
  if (types.size > 1 && !propellantless) {
    errors.push(`Mixed propellants: engines need ${[...types].join(' and ')}. All engines must share one propellant.`);
  }
  propType = types.size >= 1 ? [...types][0] : null;
  const isp = thrust > 0 ? ispWeighted / thrust : 0;
  // Power-limited electric thrust
  let thrustEff = thrust;
  const powerAvail = powerGen;
  const powerNeeded = powerReqEngines + powerReqOther;
  if (powerReqEngines > 0 && powerAvail < powerNeeded) {
    const frac = Math.max(0, (powerAvail - powerReqOther) / powerReqEngines);
    thrustEff = thrust * Math.min(1, frac);
    errors.push(`Power deficit: systems need ${fmt(powerNeeded)} MW but only ${fmt(powerAvail)} MW is generated.`);
  } else if (powerNeeded > powerAvail + 1e-9) {
    errors.push(`Power deficit: ${fmt(powerNeeded)} MW required, ${fmt(powerAvail)} MW available.`);
  }
  if (solarGen > 0 && powerReqEngines > 0) warnings.push(`Solar power falls with distance: ${fmt(solarGen * 0.43)} MW at Mars, ${fmt(solarGen * 0.037)} MW at Jupiter.`);
  // Electric engines dump inefficiency heat (included in component heat)
  const heatGen = heat;
  if (heatGen > radiator + 1e-9) {
    errors.push(`Radiators can reject ${fmt(radiator)} MW of the ${fmt(heatGen)} MW of waste heat. Add radiators or the ship overheats.`);
  }
  const propCapacity = propellantless ? 0 : propType ? tankCapacity[propType] ?? 0 : 0;
  if (!propellantless && propType && propCapacity <= 0) errors.push(`No ${propType === 'propellant' ? 'chemical propellant' : propType} tanks for the engines.`);
  for (const t in tankCapacity) if (t !== propType && !propellantless) warnings.push(`Tanks for ${t} are not used by the engines. Their capacity counts as dead weight.`);
  if (nav < 1) errors.push('No avionics: every ship needs a navigation system.');
  if (crew === 0 && nav < 2) errors.push('Uncrewed ships need an autonomous flight system or AI navigation.');
  if (comm === 'none') errors.push('No communications system.');
  if (!docking) errors.push('No docking port: cargo and propellant cannot be transferred.');
  if (payload <= 0 && crew <= 0 && combat <= 0 && sensor <= 0) warnings.push('Carries no cargo, passengers or mission equipment.');
  const ve = (isp * G0) / 1000;
  const wetEmpty = dryMass + propCapacity;
  const wetFull = dryMass + propCapacity + payload;
  const dvEmpty = propellantless ? 60 : ve > 0 && dryMass > 0 ? ve * Math.log(wetEmpty / dryMass) : 0;
  const dvFull = propellantless ? 40 : ve > 0 && dryMass + payload > 0 ? ve * Math.log(wetFull / (dryMass + payload)) : 0;
  const accelFull = wetFull > 0 ? thrustEff / wetFull : 0; // kN / t = m/s^2
  const accelEmpty = wetEmpty > 0 ? thrustEff / wetEmpty : 0;
  if (aero > 0 && aero < wetFull) warnings.push(`Aeroshell protects ${fmt(aero)} t of ${fmt(wetFull)} t entry mass. Aerobraking is unavailable at full load.`);
  // Electric and sail propulsion (millimetres per second squared) must spiral;
  // fusion torches (centimetres per second squared) fly powered trajectories.
  const lowThrust = accelFull < 0.005;
  const buildMonths = Math.min(36, 3 + complexity / 8);
  const maintenancePerYear = cost * 0.04;
  const combatRating = (combat + defense * 0.6 + sensor * 0.5) * (1 + Math.min(1, dvEmpty / 20)) * (1 + Math.min(1, accelEmpty / 5) * 0.5) * reliability;
  const stats: DesignStats = {
    dryMass, structureMass, tankCapacity, propType, propCapacity, payload, crew,
    endurance: crew > 0 ? endurance : Infinity, spinGravity: spin, thrust: thrustEff, isp, ve, dvEmpty, dvFull,
    accelFull, accelEmpty, powerGen, solarGen, powerReq: powerNeeded, heatGen, radiatorCap: radiator,
    reliability, cost, goods, complexity, buildMonths, maintenancePerYear, aeroCapacity: aero, navLevel: nav,
    commRange: comm, docking, transferSpeed, combat, defense, sensor, combatRating, lowThrust, propellantless,
    beamSail, fusionFuelRate, shielding, role: 'general', errors, warnings, techMissing, counts,
  };
  stats.role = classifyRole(stats);
  return stats;
}

function classifyRole(s: DesignStats): string {
  if (s.combat > 0) return 'warship';
  if (s.crew >= 40 && s.payload < s.crew * 2) return 'passenger';
  if (s.lowThrust && s.payload > 0) return 'tug';
  const twrMoon = s.accelFull / (0.165 * G0);
  if (twrMoon > 1.3 && s.dvFull > 3.5 && s.payload > 0) return 'lander';
  if (s.payload > 0 && s.payload < s.propCapacity * 0.2) return 'tanker';
  if (s.payload > 0) return 'freighter';
  if (s.sensor > 0) return 'survey';
  return 'general';
}

function fmt(x: number): string {
  if (!Number.isFinite(x)) return '∞';
  if (Math.abs(x) >= 100) return x.toFixed(0);
  if (Math.abs(x) >= 10) return x.toFixed(1);
  return x.toFixed(2);
}

// ---------------------------------------------------------------------------
// Route planning
// ---------------------------------------------------------------------------

export interface RouteSegment {
  start: string;
  end: string;
  dvOut: number;
  dvBack: number;
  propOut: number; // loaded at start for the outbound
  propBack: number; // loaded at end (if refuel) or carried from start
  refuelAtEnd: boolean;
  payloadMax: number;
}

export interface RoutePlan {
  feasible: boolean;
  issues: string[];
  path: string[];
  edges: DvEdge[];
  segments: RouteSegment[];
  dvOneWay: number;
  dvReturn: number;
  payload: number;
  passengers: number;
  transitDays: number;
  rttDays: number;
  tripsPerYear: number;
  capacityPerShipYear: number;
  propDraw: Record<string, number>; // per round trip, by node
  propType: string | null;
  fusionFuelPerTrip: number;
  opexPerTrip: number;
  helio: boolean;
  fast: boolean;
  lossChance: number;
  surfaceNodes: string[];
}

export interface PlanContext {
  aerocaptureTech: boolean;
  refuelAt: (node: string) => boolean; // propellant of this design's type available at node
  beamNetworkW: number;
  reliabilityBonus: number;
}

function emptyPlan(issue: string): RoutePlan {
  return {
    feasible: false, issues: [issue], path: [], edges: [], segments: [], dvOneWay: 0, dvReturn: 0, payload: 0, passengers: 0,
    transitDays: 0, rttDays: 0, tripsPerYear: 0, capacityPerShipYear: 0, propDraw: {}, propType: null, fusionFuelPerTrip: 0,
    opexPerTrip: 0, helio: false, fast: false, lossChance: 0, surfaceNodes: [],
  };
}

export function planRoute(stats: DesignStats, fromNode: string, toNode: string, ctx: PlanContext): RoutePlan {
  if (stats.errors.length > 0) return emptyPlan(`Design is not flightworthy: ${stats.errors[0]}`);
  if (fromNode === toNode) return emptyPlan('Origin and destination are the same place.');
  const wetFull = stats.dryMass + stats.propCapacity + stats.payload;
  const opts: PathOptions = { aero: stats.aeroCapacity >= wetFull * 0.6 && stats.aeroCapacity > 0, aerocaptureTech: ctx.aerocaptureTech, lowThrust: stats.lowThrust };
  const path = shortestPath(fromNode, toNode, opts);
  if (!path) {
    if (stats.lowThrust) return emptyPlan('Low-thrust propulsion cannot land on or lift off from a surface. Use a lander for surface legs.');
    return emptyPlan('No trajectory exists between these locations.');
  }
  const issues: string[] = [];
  const edges = path.edges;
  const helio = edges.some((e) => e.kind === 'helio');
  if (stats.beamSail) {
    if (ctx.beamNetworkW < 1e12) return emptyPlan('Beam-riding sails need at least 1 TW of transmitted Helios power.');
  }
  // Communications requirement
  const needComm = helio ? 3 : edges.some((e) => e.from !== 'leo' || e.to !== 'leo') ? 2 : 1;
  if (COMM_RANK[stats.commRange] < needComm) issues.push(helio ? 'Interplanetary flight needs a high-gain dish or laser terminal.' : 'Cislunar flight needs at least an S-band radio.');

  const ve = stats.ve;
  // Refuel points
  const refuel = path.nodes.map((n, idx) => idx === 0 || ctx.refuelAt(n));
  const segs: RouteSegment[] = [];
  let segStart = 0;
  for (let i = 1; i < path.nodes.length; i++) {
    if (refuel[i] || i === path.nodes.length - 1) {
      const segEdges = edges.slice(segStart, i);
      let dvOut = 0, dvBack = 0;
      for (const e of segEdges) {
        dvOut += edgeDv(e, opts) ?? 0;
        const r = reverseEdge(e);
        dvBack += r ? edgeDv(r, opts) ?? e.dv : e.dv;
      }
      segs.push({ start: path.nodes[segStart], end: path.nodes[i], dvOut, dvBack, propOut: 0, propBack: 0, refuelAtEnd: refuel[i], payloadMax: 0 });
      segStart = i;
    }
  }
  const dry = stats.dryMass;
  const cap = stats.propCapacity;
  let payloadMax = stats.payload;
  for (const s of segs) {
    if (stats.propellantless) {
      s.payloadMax = stats.payload;
      continue;
    }
    const kOut = ve > 0 ? Math.exp(s.dvOut / ve) - 1 : Infinity;
    const kBack = ve > 0 ? Math.exp(s.dvBack / ve) - 1 : Infinity;
    const mBack = dry * kBack;
    let pmax: number;
    if (s.refuelAtEnd) {
      if (mBack > cap) pmax = -1;
      else pmax = kOut > 0 ? cap / kOut - dry : Infinity;
    } else {
      pmax = kOut > 0 ? (cap - mBack) / kOut - dry - mBack : cap - mBack >= 0 ? Infinity : -1;
    }
    s.payloadMax = pmax;
    payloadMax = Math.min(payloadMax, pmax);
  }
  if (!(payloadMax > 0) && (stats.payload > 0 || stats.crew === 0)) {
    const worst = segs.reduce((a, b) => (a.payloadMax < b.payloadMax ? a : b));
    const need = worst.dvOut;
    issues.push(`Not enough delta-v: the ${nodeLabel(worst.start)} → ${nodeLabel(worst.end)} leg needs ${need.toFixed(2)} km/s out and ${worst.dvBack.toFixed(2)} km/s back${worst.refuelAtEnd ? '' : ' with no refuelling at the far end'}. This design has ${stats.dvEmpty.toFixed(2)} km/s empty.`);
  }
  const payload = Math.max(0, Math.min(stats.payload, payloadMax));
  // Propellant draws per round trip
  const propDraw: Record<string, number> = {};
  if (!stats.propellantless) {
    for (const s of segs) {
      const kOut = Math.exp(s.dvOut / ve) - 1;
      const kBack = Math.exp(s.dvBack / ve) - 1;
      const mBack = dry * kBack;
      if (s.refuelAtEnd) {
        s.propOut = (dry + payload) * kOut;
        s.propBack = mBack;
        propDraw[s.start] = (propDraw[s.start] ?? 0) + s.propOut;
        propDraw[s.end] = (propDraw[s.end] ?? 0) + s.propBack;
      } else {
        s.propOut = (dry + payload + mBack) * kOut + mBack;
        s.propBack = mBack;
        propDraw[s.start] = (propDraw[s.start] ?? 0) + s.propOut;
      }
    }
  }
  // Thrust-to-weight checks on surface legs
  const surfaceNodes: string[] = [];
  const g = getGraph();
  for (const e of edges) {
    if (e.kind !== 'surface') continue;
    const surf = e.ascent ? e.from : e.to;
    surfaceNodes.push(surf);
    const node = g.nodes[surf];
    const body = BODY[node.body];
    const gAcc = (e.gravity ?? body.surfaceG) * G0;
    if (!e.ascent && body.id === 'venus' && opts.aero) continue; // aerostat entry floats
    const seg = segs.find((s) => s.start === e.from || s.end === e.to) ?? segs[0];
    const mass = dry + payload + Math.min(cap, seg.propOut + seg.propBack);
    const twr = gAcc > 0 ? stats.thrust / (mass * gAcc) : 99;
    if (twr < 1.15) {
      issues.push(`Insufficient thrust to ${e.ascent ? 'lift off from' : 'land on'} ${node.label}: TWR ${twr.toFixed(2)} (needs 1.15).`);
      break;
    }
  }
  // Transit timing
  let transit = 0;
  let wait = 0;
  let syn = 0;
  let helioDays = 0;
  let helioDist = 0;
  for (const e of edges) {
    if (e.kind === 'helio') {
      helioDays += e.days;
      wait = Math.max(wait, e.waitDays ?? 0);
      syn = Math.max(syn, e.synodicDays ?? 0);
      helioDist += e.distanceKm ?? 0;
    } else transit += e.days;
  }
  let fast = false;
  if (helio) {
    if (stats.lowThrust) {
      const spiral = stats.accelFull > 0 ? (path.dv * 1000) / stats.accelFull / 86400 / 3 : 9999;
      transit += helioDays * 1.35 + spiral;
    } else {
      // Excess delta-v shortens the transfer (torch ships ignore launch windows)
      const vBudget = stats.propellantless ? 40 : ve * Math.log((dry + payload + cap) / (dry + payload));
      const excess = vBudget - (segs.length ? Math.max(...segs.map((s) => s.dvOut)) : 0);
      if (excess > 4 && stats.accelFull > 0.003) {
        const vCruise = excess / 2;
        const tAcc = (excess * 1000) / stats.accelFull; // seconds of burning, split in two
        const tCruise = (helioDist * 0.75) / (vCruise + 8); // seconds
        const tFast = (tAcc + tCruise) / 86400;
        if (tFast < helioDays) {
          transit += tFast;
          fast = tFast < helioDays * 0.5;
          // fast transits burn most of the tank
          for (const s of segs) {
            const extra = cap * 0.5;
            propDraw[s.start] = (propDraw[s.start] ?? 0) + extra;
          }
        } else transit += helioDays;
      } else transit += helioDays;
    }
  }
  const turnaround = 8 * stats.transferSpeed + surfaceNodes.length * 2;
  let rtt = 2 * transit + turnaround;
  if (helio && !fast) {
    const raw = 2 * transit + wait + turnaround;
    rtt = syn > 0 ? Math.ceil(raw / syn - 0.02) * syn : raw;
    rtt = Math.max(rtt, raw);
  }
  // Crew endurance: crews wait for the return window at the destination settlement
  if (stats.crew > 0 && stats.endurance < transit) issues.push(`Crew endurance ${stats.endurance.toFixed(0)} days is shorter than the ${transit.toFixed(0)}-day transit.`);
  const tripsPerYear = rtt > 0 ? 365.25 / rtt : 0;
  const fusionFuelPerTrip = stats.fusionFuelRate > 0 ? Object.values(propDraw).reduce((a, b) => a + b, 0) * stats.fusionFuelRate : 0;
  const crewCost = stats.crew > 0 ? Math.min(stats.crew, 12) * 1.5e6 : 0;
  const opexPerTrip = (stats.maintenancePerYear + crewCost) * (rtt / 365.25) + stats.cost * 0.002;
  const burns = edges.length * 2;
  const rel = Math.min(0.99995, stats.reliability + ctx.reliabilityBonus);
  // Component reliability is per mission cycle; reusable vehicles with abort modes lose a
  // small fraction of that as hulls (about 1 in 500 flights for a typical 2048 freighter)
  const lossChance = Math.min(0.05, (1 - rel) * 0.1 * (1 + burns * 0.1));
  const feasible = issues.length === 0 && (payload > 0 || stats.crew > 0);
  if (issues.length === 0 && payload <= 0 && stats.crew <= 0) issues.push('The ship cannot carry any payload on this route.');
  return {
    feasible, issues, path: path.nodes, edges, segments: segs,
    dvOneWay: segs.reduce((a, s) => a + s.dvOut, 0), dvReturn: segs.reduce((a, s) => a + s.dvBack, 0),
    payload, passengers: stats.crew > 2 ? stats.crew - 2 : 0, transitDays: transit, rttDays: rtt, tripsPerYear,
    capacityPerShipYear: payload * tripsPerYear, propDraw, propType: stats.propellantless ? null : stats.propType,
    fusionFuelPerTrip, opexPerTrip, helio, fast, lossChance, surfaceNodes,
  };
}

export function nodeLabel(node: string): string {
  const g = getGraph();
  const n = g.nodes[node];
  if (!n) return node;
  if (n.label && n.label !== node) return n.label;
  const b = BODY[n.body];
  return b ? `${b.name} orbit` : node;
}
