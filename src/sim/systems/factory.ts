// Constructors for settlements, facilities, designs, fleets and routes.
import type { GameState, Settlement, PopulationState, FacilityGroup, ConstructionProject, VehicleDesign, Fleet, Route, SettlementStatus, Stock } from '../types';
import { SITE } from '../content/sites';
import { FACILITY } from '../content/facilities';
import { DESIGN_TEMPLATE } from '../content/templates';
import { nextId } from '../core/util';
import { makeCharacter } from './characters';

export const BAND_COUNT = 17;

export function emptyPopulation(): PopulationState {
  return {
    bands: new Array(BAND_COUNT).fill(0),
    cultures: { terran: 1 },
    educated: 0.8,
    health: 0.85,
    psych: 0.75,
    radiation: 0,
    gravityDebt: 0,
    lifeExpectancy: 80,
    births: 0,
    deaths: 0,
    immigrants: 0,
    emigrants: 0,
    localBorn: 0,
    unemployment: 0,
    wellbeing: 0.7,
    familiesAllowed: false,
  };
}

/** Add adults spread over working ages (bands 5..10 = 25..54). */
export function addAdults(pop: PopulationState, n: number): void {
  const shares = [0, 0, 0, 0, 0.05, 0.2, 0.25, 0.22, 0.15, 0.09, 0.04, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < BAND_COUNT; i++) pop.bands[i] += n * shares[i];
}

export function createSettlement(
  s: GameState,
  siteId: string,
  name: string,
  founder: string,
  sponsors: Record<string, number>,
  status: SettlementStatus = 'outpost',
): Settlement {
  const site = SITE[siteId];
  const st: Settlement = {
    id: nextId(s, 'set'),
    name,
    siteId,
    founded: s.day,
    founder,
    status,
    statusSince: s.day,
    sponsors,
    facilities: [],
    construction: [],
    stock: {},
    pop: emptyPopulation(),
    housing: 0,
    jobs: 0,
    jobsByOcc: {},
    workforce: 0,
    employed: 0,
    energy: { gen: 0, demand: 0, storage: 0, ratio: 1, bySource: {} },
    lifeSupport: { waterRecovery: 0, oxygenRecovery: 0, foodSelf: 0, capacity: 0, reserveDays: {} },
    production: {},
    consumption: {},
    imports: {},
    exports: {},
    demand: {},
    surplus: {},
    inTransit: {},
    routeDraw: {},
    forward: {},
    shortfall: {},
    idleCapacity: {},
    closure: 0,
    automation: 1,
    science: 0,
    economy: { treasury: 0, gdp: 0, importsValue: 0, exportsValue: 0, subsidy: 0, taxes: 0, wage: 0, balance: 0, uneTransfer: 0 },
    politics: { factionSupport: {}, sentiment: 0.4, autonomy: 0, grievances: 0, represented: false },
    flags: {},
    storageCap: 2000,
    propellantCap: 500,
    shielding: 0,
    gravityCountermeasure: 0,
    landingCapacity: 0,
    massDriverCapacity: 0,
    shipyardCapacity: 0,
    medical: 0,
    civic: 0,
    security: 0,
    beamCapacity: 0,
    kind: 'research',
    deposits: site.deposits.map((d) => ({
      type: d.type,
      name: d.name,
      reserve: d.reserve,
      initial: d.reserve,
      grade: d.grade,
      yields: { ...d.yields },
      difficulty: d.difficulty,
      survey: 0.25,
      estimateError: 0.6,
    })),
  };
  s.settlements[st.id] = st;
  const gov = makeCharacter(s, 'governor', { roleRef: st.id, culture: 'offworld', ageMin: 35, ageMax: 58 });
  st.governorId = gov.id;
  return st;
}

export function addFacility(st: Settlement, type: string, owner: string, count: number, day: number): FacilityGroup {
  const existing = st.facilities.find((f) => f.type === type && f.owner === owner);
  if (existing) {
    existing.count += count;
    return existing;
  }
  const g: FacilityGroup = { id: `${st.id}:${type}:${owner}`, type, owner, count, condition: 1, utilization: 1, built: day, enabled: true };
  st.facilities.push(g);
  return g;
}

export function queueConstruction(s: GameState, st: Settlement, type: string, owner: string, count: number, costMult = 1): ConstructionProject {
  const def = FACILITY[type];
  const materials: Stock = {};
  for (const g in def.buildMass) materials[g] = def.buildMass[g] * count;
  const p: ConstructionProject = {
    id: nextId(s, 'cp'),
    type,
    owner,
    count,
    monthsTotal: def.buildMonths,
    progress: 0,
    materials: { ...materials },
    materialsTotal: materials,
    cost: def.buildCost * count * costMult,
    paid: def.buildCost * count * costMult,
    queuedDay: s.day,
  };
  st.construction.push(p);
  return p;
}

export function createDesign(s: GameState, name: string, owner: string, structure: string, components: Record<string, number>, role = 'general'): VehicleDesign {
  const d: VehicleDesign = { id: nextId(s, 'dsn'), name, owner, created: s.day, structure, components: { ...components }, role };
  s.designs[d.id] = d;
  return d;
}

export function createDesignFromTemplate(s: GameState, templateId: string, owner = 'public'): VehicleDesign | undefined {
  const t = DESIGN_TEMPLATE[templateId];
  if (!t) return undefined;
  const existing = Object.values(s.designs).find((d) => d.name === t.name && d.owner === owner);
  if (existing) return existing;
  const d = createDesign(s, t.name, owner, t.structure, t.components);
  (d as any).template = templateId;
  return d;
}

export function createFleet(s: GameState, owner: string, designId: string, count: number, routeId?: string): Fleet {
  // New ships join an existing fleet of the same design on the same assignment
  for (const id of Object.keys(s.fleets).sort()) {
    const f = s.fleets[id];
    if (f.owner === owner && f.designId === designId && f.routeId === routeId && !f.patrolRegion) {
      f.condition = (f.condition * f.count + count) / Math.max(1, f.count + count);
      // The merged fleet's age is the average of its hulls
      f.built = Math.round((f.built * f.count + s.day * count) / Math.max(1, f.count + count));
      f.count += count;
      return f;
    }
  }
  const f: Fleet = { id: nextId(s, 'flt'), owner, designId, count, routeId, condition: 1, built: s.day };
  s.fleets[f.id] = f;
  return f;
}

export function createRoute(s: GameState, name: string, owner: string, origin: string, destination: string, mode: Route['mode'] = 'supply', priority = 5): Route {
  const r: Route = {
    id: nextId(s, 'rt'),
    name,
    owner,
    origin,
    destination,
    mode,
    priority,
    active: true,
    created: s.day,
    stats: { deliveredMonth: 0, deliveredYear: 0, returnedMonth: 0, passengersYear: 0, costPerTonne: 0, utilization: 0, lostYear: 0, propellantMonth: 0, capacityYear: 0 },
  };
  s.routes[r.id] = r;
  return r;
}
