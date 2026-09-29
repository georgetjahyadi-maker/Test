// Helios collector engineering model.
import { SOLAR_CONSTANT, SOLAR_LUMINOSITY, AU_KM } from '../content/bodies';
import type { CollectorDesign, Stock } from '../types';

const SIGMA = 5.670374419e-8;

export const CELL_TYPES: Record<string, { name: string; eff: number; tmax: number; density: number; tech?: string; description: string }> = {
  pv_basic: { name: 'Thin-film silicon', eff: 0.22, tmax: 400, density: 0.004, description: 'Cheap amorphous-silicon cells. Efficiency drops sharply above 400 K.' },
  pv_multi: { name: 'Multi-junction film', eff: 0.34, tmax: 430, density: 0.003, tech: 'thin_film_collectors', description: 'Stacked junctions harvest more of the spectrum.' },
  pv_hot: { name: 'High-temperature cells', eff: 0.26, tmax: 650, density: 0.004, tech: 'statite_collectors', description: 'Wide-bandgap cells that tolerate a near-solar environment.' },
  thermal: { name: 'Solar-dynamic turbine', eff: 0.38, tmax: 950, density: 0.012, tech: 'liquid_droplet_radiators', description: 'Mirrors concentrate sunlight onto Brayton turbines. Heavy, but heat-tolerant.' },
};

export const COLLECTOR_STRUCTURES: Record<string, { name: string; areal: number; tech?: string; goods: string; description: string }> = {
  foil: { name: 'Aluminium foil membrane', areal: 0.02, goods: 'alloys', description: '20 g/m² aluminized membrane on a light truss.' },
  nanotube: { name: 'Nanotube lattice', areal: 0.006, tech: 'graphene_structures', goods: 'composites', description: '6 g/m² nanotube mesh.' },
  gossamer: { name: 'Gossamer film', areal: 0.002, tech: 'thin_film_collectors', goods: 'composites', description: '2 g/m² ultralight film for maximum area per tonne.' },
};

export const TRANSMISSION: Record<string, { name: string; eff: number; kgPerKW: number; tech?: string; description: string }> = {
  none: { name: 'None (local use)', eff: 0, kgPerKW: 0, description: 'Power is used on board for computing or station keeping only.' },
  microwave: { name: 'Microwave phased array', eff: 0.62, kgPerKW: 0.25, tech: 'beamed_power', description: 'Beams power to rectennas on settlements and Earth.' },
  laser: { name: 'Laser array', eff: 0.45, kgPerKW: 0.12, tech: 'laser_sails', description: 'Tight beams that reach the outer Solar System and push sails.' },
};

export const STATION_KEEPING: Record<string, { name: string; massFrac: number; failure: number; description: string }> = {
  none: { name: 'Passive', massFrac: 0, failure: 2.0, description: 'No control. Orbits decay and collisions become common as the swarm grows.' },
  sail: { name: 'Sail trim vanes', massFrac: 0.04, failure: 1.0, description: 'Uses light pressure to hold slot and attitude.' },
  ion: { name: 'Ion thrusters', massFrac: 0.03, failure: 0.8, description: 'Active station keeping. Needs argon resupply.' },
};

export const REPAIR: Record<string, { name: string; life: number; massFrac: number; tech?: string; description: string }> = {
  none: { name: 'None', life: 1, massFrac: 0, description: 'Fly until failure.' },
  autonomous: { name: 'Self-maintaining', life: 2, massFrac: 0.03, tech: 'self_maintaining_systems', description: 'On-board robots repair micrometeoroid damage.' },
  swarm: { name: 'Swarm repair tenders', life: 3.2, massFrac: 0.05, tech: 'swarm_coordination', description: 'Tender drones cannibalize dead collectors for parts.' },
};

export interface CollectorStats {
  flux: number; // W/m^2
  incident: number; // W
  electrical: number; // W
  transmitted: number; // W delivered after transmission losses
  compute: number; // W for computing
  heat: number; // W absorbed as heat
  temperature: number; // K
  tmax: number;
  mass: number; // tonnes
  goods: Stock; // per collector
  cost: number;
  lifetime: number; // years
  failureRate: number; // per year
  specificPower: number; // W/kg
  errors: string[];
  warnings: string[];
  techMissing: string[];
  interceptFraction: number; // fraction of solar luminosity intercepted per collector
}

export function computeCollectorStats(d: CollectorDesign, known: (t: string) => boolean, mods: { tempBonus: number; failureMult: number; densityMult: number }): CollectorStats {
  const errors: string[] = [];
  const warnings: string[] = [];
  const techMissing: string[] = [];
  const cell = CELL_TYPES[d.cell] ?? CELL_TYPES.pv_basic;
  const st = COLLECTOR_STRUCTURES[d.structure] ?? COLLECTOR_STRUCTURES.foil;
  const tx = TRANSMISSION[d.transmission] ?? TRANSMISSION.none;
  const sk = STATION_KEEPING[d.stationKeeping] ?? STATION_KEEPING.sail;
  const rp = REPAIR[d.repair] ?? REPAIR.none;
  for (const t of [cell.tech, st.tech, tx.tech, rp.tech]) if (t && !known(t) && !techMissing.includes(t)) techMissing.push(t);
  if (!known('dyson_collectors')) techMissing.push('dyson_collectors');
  const r = Math.max(0.05, d.radiusAU);
  const area = Math.max(1e3, d.areaM2);
  const flux = SOLAR_CONSTANT / (r * r);
  const incident = flux * area;
  const tmax = cell.tmax + mods.tempBonus;
  const radRatio = Math.max(0, d.radiatorRatio);
  let eff = cell.eff;
  // equilibrium temperature (front + back + radiators)
  const absorbed = incident * 0.9;
  let electrical = absorbed * eff;
  let heat = absorbed - electrical;
  const radArea = area * (2 + radRatio * 2);
  let T = Math.pow(heat / (0.85 * SIGMA * radArea), 0.25);
  if (T > tmax) {
    const over = (T - tmax) / 100;
    eff = cell.eff * Math.max(0.05, 1 - over * 0.5);
    electrical = absorbed * eff;
    heat = absorbed - electrical;
    T = Math.pow(heat / (0.85 * SIGMA * radArea), 0.25);
    warnings.push(`Operating at ${T.toFixed(0)} K, above the ${tmax.toFixed(0)} K cell limit. Efficiency and lifetime suffer.`);
    if (T > tmax + 200) errors.push(`Collector would reach ${T.toFixed(0)} K and burn out. Move it outward, add radiators or use heat-tolerant cells.`);
  }
  const compute = electrical * Math.min(1, Math.max(0, d.computeFraction));
  const exportable = electrical - compute;
  const transmitted = exportable * tx.eff;
  if (tx.eff === 0 && d.computeFraction < 0.5) warnings.push('No transmitter: power that is not used for computing is wasted.');
  // mass (tonnes)
  const structure = (area * st.areal * mods.densityMult) / 1000;
  const cells = (area * cell.density * mods.densityMult) / 1000;
  const radiators = (area * radRatio * 0.004) / 1000;
  const txMass = ((exportable / 1000) * tx.kgPerKW) / 1000;
  const computeMass = ((compute / 1000) * 0.05) / 1000;
  const base = structure + cells + radiators + txMass + computeMass;
  const mass = base * (1 + sk.massFrac + rp.massFrac) + 0.05;
  const goods: Stock = {};
  goods[st.goods] = (goods[st.goods] ?? 0) + structure + radiators;
  goods.photovoltaics = cells;
  goods.electronics = txMass * 0.4 + computeMass * 0.8 + mass * 0.01;
  goods.alloys = (goods.alloys ?? 0) + txMass * 0.6 + base * (sk.massFrac + rp.massFrac);
  if (d.cell === 'thermal') goods.machinery = cells * 0.5;
  let cost = 0;
  const PRICE: Record<string, number> = { alloys: 4500, composites: 35000, photovoltaics: 90000, electronics: 400000, machinery: 50000 };
  for (const g in goods) cost += goods[g] * (PRICE[g] ?? 10000);
  cost *= 1.3;
  // lifetime
  let life = 25 * rp.life;
  if (T > tmax * 0.85) life *= Math.max(0.15, 1 - (T - tmax * 0.85) / tmax);
  if (r < 0.2) life *= 0.8;
  const failureRate = Math.min(0.9, (1 / life) * sk.failure * mods.failureMult);
  const sphere = 4 * Math.PI * Math.pow(r * AU_KM * 1000, 2);
  const interceptFraction = area / sphere;
  if (area * st.areal < 1) warnings.push('A very small collector has high overhead mass per watt.');
  return {
    flux, incident, electrical, transmitted, compute, heat, temperature: T, tmax, mass, goods, cost,
    lifetime: 1 / Math.max(1e-6, failureRate), failureRate, specificPower: electrical / (mass * 1000),
    errors, warnings, techMissing, interceptFraction,
  };
}

export function luminosityFraction(watts: number): number {
  return watts / SOLAR_LUMINOSITY;
}
