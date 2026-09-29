// Core type definitions for the HELIOS simulation.
// Everything in GameState is plain JSON-serializable data.

export type GoodId = string;
export type ActorId = string; // 'une' | nation id | corporation id | settlement id
export type Stock = Record<GoodId, number>;

export type RegionId =
  | 'earth'
  | 'earthOrbit'
  | 'luna'
  | 'nea'
  | 'mars'
  | 'venus'
  | 'mercury'
  | 'belt'
  | 'jupiter'
  | 'saturn'
  | 'outer';

export interface BreakdownPart {
  label: string;
  value: number;
  ref?: string;
}

export interface Breakdown {
  total: number;
  unit: string;
  parts: BreakdownPart[];
  note?: string;
}

export type CompetencyLevel = 'national' | 'limited' | 'shared' | 'exclusive';

export type SettlementStatus =
  | 'outpost'
  | 'territory'
  | 'selfGoverning'
  | 'commonwealth'
  | 'member'
  | 'associated'
  | 'independent';

export type Occupation =
  | 'scientists'
  | 'engineers'
  | 'technicians'
  | 'industrial'
  | 'miners'
  | 'agricultural'
  | 'medical'
  | 'administrators'
  | 'service'
  | 'security';

// ---------------------------------------------------------------------------
// Content definitions (static data)
// ---------------------------------------------------------------------------

export interface GoodDef {
  id: GoodId;
  name: string;
  price: number; // Earth reference price, credits per tonne
  category: 'volatile' | 'propellant' | 'raw' | 'material' | 'manufactured' | 'life' | 'fuel';
  description: string;
  earthDemand?: number; // t/yr Earth demand for space-sourced supply (for price response)
  elasticity?: number;
}

export type BodyStyle =
  | 'star'
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'moon'
  | 'mars'
  | 'asteroid'
  | 'metal'
  | 'gas'
  | 'saturn'
  | 'ice'
  | 'io'
  | 'europa'
  | 'titan'
  | 'rock';

export interface BodyDef {
  id: string;
  name: string;
  type: 'star' | 'planet' | 'dwarf' | 'moon' | 'asteroid';
  parent: string | null;
  a: number; // semi-major axis: AU for heliocentric bodies, km for moons
  e: number;
  i: number; // inclination (deg)
  L0: number; // mean longitude at J2000 (deg)
  w: number; // longitude of perihelion (deg)
  period: number; // days
  radiusKm: number;
  mu: number; // km^3/s^2
  atmosphere: 'none' | 'thin' | 'thick';
  style: BodyStyle;
  colors: string[];
  surfaceG: number;
  description: string;
  lowOrbitAltKm: number;
}

export interface DepositDef {
  type: string;
  name: string;
  reserve: number; // tonnes of ore
  grade: number; // multiplier on yields
  yields: Stock; // tonnes of output per tonne of ore
  difficulty: number; // 1 = easy
}

export interface SiteDef {
  id: string;
  name: string;
  body: string;
  kind: 'surface' | 'orbital' | 'atmospheric' | 'asteroid';
  region: RegionId;
  gravity: number; // g
  radiation: number; // mSv/yr unshielded
  illumination: number; // fraction of sunlight usable (polar peaks ~0.85, equatorial ~0.5)
  deposits: DepositDef[];
  features: string[];
  description: string;
  node: string; // delta-v graph node id
}

export type FacilityCategory =
  | 'habitat'
  | 'lifeSupport'
  | 'food'
  | 'energy'
  | 'mining'
  | 'processing'
  | 'manufacturing'
  | 'infrastructure'
  | 'science'
  | 'civic'
  | 'security'
  | 'dyson';

export interface FacilityDef {
  id: string;
  name: string;
  category: FacilityCategory;
  description: string;
  tech?: string;
  allowed: SiteDef['kind'][];
  requiresFeature?: string;
  buildCost: number;
  buildMass: Stock;
  buildMonths: number;
  jobs: Partial<Record<Occupation, number>>;
  power: number; // MW consumed (continuous)
  gen?: number; // MW generated at 1 AU full illumination (solar) or nameplate
  genType?: 'solar' | 'fission' | 'fusion' | 'beamed';
  storageMWh?: number;
  housing?: number;
  shielding?: number; // 0..1 radiation reduction
  gravity?: number; // artificial gravity provided (g)
  recipe?: { in: Stock; out: Stock }; // per unit per year
  mining?: { depositTypes: string[]; orePerYear: number };
  lifeSupportCapacity?: number; // people served
  maintenance: Stock; // goods per unit per year
  opex: number; // credits per unit per year
  science?: number; // research points per year
  storage?: number; // tonnes
  propellantStorage?: number;
  landing?: number; // tonnes/yr surface traffic capacity
  massDriver?: number; // tonnes/yr launch capacity
  shipyard?: number; // tonnes/yr of dry mass construction
  medical?: number; // people served
  civic?: number; // people served (psych health)
  security?: number;
  automation?: number; // automation level provided
  survey?: number; // planetary defense coverage contribution
  collectorMassPerYear?: number; // dyson collector fabrication capacity (t/yr)
  beamReceiveMW?: number;
  replicator?: boolean;
  education?: number;
  maxPerSettlement?: number;
  heat?: number;
}

export interface StructureDef {
  id: string;
  name: string;
  massFraction: number;
  costMult: number;
  reliability: number;
  goods: Stock; // per tonne of structure
  tech?: string;
  description: string;
}

export type ComponentCategory =
  | 'propulsion'
  | 'tank'
  | 'power'
  | 'thermal'
  | 'habitation'
  | 'cargo'
  | 'navigation'
  | 'communication'
  | 'docking'
  | 'shielding'
  | 'weapon'
  | 'sensor'
  | 'aero';

export interface ComponentDef {
  id: string;
  name: string;
  category: ComponentCategory;
  description: string;
  tech?: string;
  mass: number; // tonnes dry
  cost: number; // credits
  reliability: number;
  complexity: number;
  goods: Stock; // manufacturing materials
  thrust?: number; // kN
  isp?: number; // s
  propellant?: GoodId;
  powerReq?: number; // MW consumed while operating
  powerGen?: number; // MW generated (solar at 1 AU)
  solar?: boolean;
  heat?: number; // MW waste heat produced
  radiator?: number; // MW heat rejected
  tankCapacity?: number; // tonnes
  tankType?: GoodId;
  crew?: number;
  enduranceDays?: number;
  spinGravity?: boolean;
  cargo?: number; // tonnes
  navLevel?: number;
  commRange?: 'orbital' | 'cislunar' | 'interplanetary';
  docking?: boolean;
  transferSpeed?: number;
  shielding?: number;
  combat?: number;
  defense?: number;
  sensor?: number;
  aeroshell?: boolean;
  fusionFuelRate?: number; // tonnes fusion fuel per tonne propellant
  beamSail?: boolean;
}

export interface TechDef {
  id: string;
  name: string;
  category: string;
  tier: number;
  prereqs: string[];
  description: string;
  unlocks: string[]; // human readable list of what it unlocks (derived + authored)
  effects?: Record<string, number>; // modifier contributions
  era: number;
  proprietarySector?: string; // sector of corporations likely to develop it privately
}

export interface NationDef {
  id: string;
  name: string;
  short: string;
  color: string;
  states: number;
  description: string;
  population: number;
  gdp: number;
  baseGrowth: number;
  popGrowth: number;
  science: number;
  launchCapacity: number;
  military: number;
  debtRatio: number;
  ideology: number[];
  publicOpinion: number;
  uneSupport: number;
  integrationPref: number;
  stability: number;
  spaceBudgetShare: number;
  energyTW: number;
  factionSupport: Record<string, number>;
  nameCulture: string;
  leadershipCycle: number;
}

export interface FactionDef {
  id: string;
  name: string;
  short: string;
  color: string;
  axes: number[];
  description: string;
  initiallyActive: boolean;
}

export interface CorporationDef {
  id: string;
  name: string;
  short: string;
  sector: string;
  home: string | null;
  structure: string;
  color: string;
  cash: number;
  influence: number;
  reputation: number;
  focus: string[];
  riskAppetite: number;
  description: string;
}

export interface InstitutionDef {
  id: string;
  name: string;
  short: string;
  description: string;
  baseFunding: number; // credits/yr for full effectiveness
  initiallyActive: boolean;
  role: string;
}

export interface CompetencyDef {
  id: string;
  name: string;
  group: 'exclusive' | 'shared' | 'reserved';
  initial: CompetencyLevel;
  description: string;
}

export type Threshold = 'simple' | 'qualified' | 'super' | 'unanimous';

export interface LawDef {
  id: string;
  name: string;
  category: string;
  description: string;
  effectsText: string[];
  requires?: {
    competency?: [string, CompetencyLevel];
    tech?: string;
    laws?: string[];
    notLaws?: string[];
    offworldShare?: number;
    condition?: string; // named condition evaluated by legislature system
  };
  amendment?: Record<string, CompetencyLevel>;
  nationsThreshold: Threshold;
  assemblyThreshold: 'simple' | 'absolute' | 'super';
  axes: number[];
  interests: {
    corporate?: number;
    earth?: number;
    offworld?: number;
    labor?: number;
    spacefaring?: number; // nations with big space programs
    developing?: number; // lower income nations
  };
  modifiers?: Record<string, number>;
  group?: string; // mutually exclusive group
  capitalCost: number;
  annualCost?: number;
  repealable: boolean;
}

export interface GrandProjectDef {
  id: string;
  name: string;
  description: string;
  tech: string;
  cost: number;
  months: number;
  materials: Stock;
  site?: string; // required site / body
  bodies?: string[];
  modifiers: Record<string, number>;
  effectsText: string;
  repeatable?: boolean;
}

// ---------------------------------------------------------------------------
// Simulation state
// ---------------------------------------------------------------------------

export interface PopulationState {
  bands: number[]; // 17 five-year age bands (0-4, ..., 80+)
  cultures: Record<string, number>;
  educated: number;
  health: number;
  psych: number;
  radiation: number;
  gravityDebt: number;
  lifeExpectancy: number;
  births: number; // last 12 months
  deaths: number;
  immigrants: number;
  emigrants: number;
  localBorn: number;
  unemployment: number;
  wellbeing: number;
  familiesAllowed: boolean;
}

export interface FacilityGroup {
  id: string;
  type: string;
  owner: ActorId;
  count: number;
  condition: number;
  utilization: number;
  built: number;
  limiting?: string;
  enabled: boolean;
}

export interface ConstructionProject {
  id: string;
  type: string;
  owner: ActorId;
  count: number;
  monthsTotal: number;
  progress: number;
  materials: Stock; // remaining
  materialsTotal: Stock;
  cost: number;
  paid: number;
  stalled?: string;
  queuedDay: number;
}

export interface SettlementEconomy {
  treasury: number;
  gdp: number;
  importsValue: number;
  exportsValue: number;
  subsidy: number;
  taxes: number;
  wage: number;
  balance: number;
  uneTransfer: number;
}

export interface SettlementPolitics {
  factionSupport: Record<string, number>;
  sentiment: number; // -1..1 attitude toward UNE
  autonomy: number; // 0..1 autonomy pressure
  grievances: number;
  represented: boolean;
  lastReferendumDay?: number;
  demands?: string;
}

export interface Settlement {
  id: string;
  name: string;
  siteId: string;
  founded: number;
  founder: ActorId;
  status: SettlementStatus;
  statusSince: number;
  sponsors: Record<ActorId, number>;
  governorId?: string;
  facilities: FacilityGroup[];
  construction: ConstructionProject[];
  stock: Stock;
  pop: PopulationState;
  housing: number;
  jobs: number;
  jobsByOcc: Partial<Record<Occupation, number>>;
  workforce: number;
  employed: number;
  energy: { gen: number; demand: number; storage: number; ratio: number; bySource: Record<string, number> };
  lifeSupport: {
    waterRecovery: number;
    oxygenRecovery: number;
    foodSelf: number;
    capacity: number;
    reserveDays: Record<string, number>;
  };
  production: Stock; // tonnes last month
  consumption: Stock;
  imports: Stock;
  exports: Stock;
  demand: Stock; // outstanding needs for logistics
  surplus: Stock;
  inTransit: Stock;
  routeDraw: Stock; // propellant requested by visiting ships last month
  forward?: Stock; // goods that distribution legs departing here could not fill last month
  shortfall?: Stock; // fuel, spare parts and life-critical inputs facilities needed but lacked last month
  idleCapacity?: Stock; // output plants held back last month because their products were overstocked
  closure: number;
  automation: number;
  science: number;
  economy: SettlementEconomy;
  politics: SettlementPolitics;
  flags: Record<string, number | boolean | string>;
  storageCap: number;
  propellantCap: number;
  shielding: number;
  gravityCountermeasure: number;
  landingCapacity: number;
  massDriverCapacity: number;
  shipyardCapacity: number;
  medical: number;
  civic: number;
  security: number;
  beamCapacity: number;
  kind: string;
  deposits: DepositState[];
}

export interface DepositState {
  type: string;
  name: string;
  reserve: number;
  initial: number;
  grade: number;
  yields: Stock;
  difficulty: number;
  survey: number; // 0..1 knowledge
  estimateError: number;
}

export interface Nation {
  id: string;
  name: string;
  short: string;
  color: string;
  states: number;
  description: string;
  member: boolean;
  population: number;
  popGrowth: number;
  gdp: number;
  gdpGrowth: number;
  baseGrowth: number;
  industry: number;
  energyTW: number;
  science: number;
  launchCapacity: number;
  military: number;
  debtRatio: number;
  ideology: number[];
  publicOpinion: number;
  uneSupport: number;
  integrationPref: number;
  stability: number;
  spaceBudgetShare: number;
  spaceFunds: number;
  relations: Record<string, number>;
  factionSupport: Record<string, number>;
  /** Long-run partisan alignment that support reverts toward (realigns slowly). */
  factionBase?: Record<string, number>;
  leaderId: string;
  nextLeadershipDay: number;
  leadershipCycle: number;
  unemployment: number;
  grievances: number;
  compliance: number;
  offworldInterest: number;
  nameCulture: string;
  emigrantsYear: number;
  spaceInvestYear: number;
}

export interface Corporation {
  id: string;
  name: string;
  short: string;
  sector: string;
  home: string | null;
  structure: string;
  color: string;
  cash: number;
  debt: number;
  valuation: number;
  revenue: number;
  profit: number;
  revenueYTD: number;
  profitYTD: number;
  influence: number;
  reputation: number;
  workforce: number;
  techs: string[];
  ceoId: string;
  founded: number;
  alive: boolean;
  riskAppetite: number;
  focus: string[];
  distress: number;
  description: string;
}

export interface Faction {
  id: string;
  name: string;
  short: string;
  color: string;
  axes: number[];
  description: string;
  active: boolean;
  founded: number;
  radicalism: number;
  support: number; // population-weighted global support
  seats: number;
}

export interface Character {
  id: string;
  name: string;
  born: number; // year (fractional)
  role: string;
  roleRef?: string;
  nationId?: string;
  factionId?: string;
  skills: { admin: number; diplomacy: number; science: number; military: number; business: number };
  ideology: number[];
  popularity: number;
  alive: boolean;
  died?: number;
  background: string;
}

export interface VehicleDesign {
  id: string;
  name: string;
  owner: ActorId;
  created: number;
  structure: string;
  components: Record<string, number>;
  role: string;
  obsolete?: boolean;
}

export interface Fleet {
  id: string;
  owner: ActorId;
  designId: string;
  count: number;
  routeId?: string;
  patrolRegion?: RegionId;
  condition: number;
  built: number;
}

export interface RouteStats {
  deliveredMonth: number;
  deliveredYear: number;
  returnedMonth: number;
  passengersYear: number;
  costPerTonne: number;
  utilization: number;
  lostYear: number;
  propellantMonth: number;
  capacityYear: number;
  limiting?: string;
}

export interface Route {
  id: string;
  name: string;
  owner: ActorId;
  origin: string; // settlement id
  destination: string; // settlement id
  mode: 'supply' | 'export' | 'both';
  priority: number;
  active: boolean;
  created: number;
  stats: RouteStats;
  contract?: { payer: ActorId; ratePerTonne: number };
  /** Distribution leg from a transfer hub: unmet needs are forwarded to the origin as demand. */
  transship?: boolean;
  lastLossLogged?: number; // day the chronicle last recorded a ship lost on this route
  /** Consecutive months a local route's origin has not produced its ships' propellant. */
  badMonths?: number;
}

export interface Shipment {
  id: string;
  routeId: string;
  from: string;
  to: string;
  goods: Stock;
  passengers: number;
  /** Passengers who will change ships here for a settlement further down the line. */
  transitPax?: number;
  departDay: number;
  arriveDay: number;
  owner: ActorId;
}

export interface ShipOrder {
  id: string;
  owner: ActorId;
  designId: string;
  count: number;
  shipyard: string; // settlement id or 'earth'
  progress: number;
  monthsTotal: number;
  cost: number;
  materials: Stock;
  routeId?: string;
}

export interface TechState {
  progress: number;
  known: boolean;
  knownDay?: number;
  owner?: string;
  licensees?: string[];
}

export interface ResearchState {
  queue: string[];
  rpLastYear: number;
  rpMonth: number;
}

export interface LawState {
  id: string;
  enactedDay: number;
}

export interface VoteTally {
  nations: {
    yesStates: number;
    noStates: number;
    totalStates: number;
    yesPop: number;
    totalPop: number;
    passed: boolean;
    threshold: Threshold;
  };
  assembly: { yes: number; no: number; total: number; passed: boolean; threshold: string };
  byNation: Record<string, number>;
  byFaction: Record<string, number>;
  reasons: Record<string, string>;
}

export interface Bill {
  id: string;
  lawId: string;
  action: 'enact' | 'repeal';
  proposedDay: number;
  voteDay: number;
  stage: 'debate' | 'ratification' | 'done';
  lobbying: Record<string, number>;
  pledges: Record<string, number>;
  result?: 'passed' | 'failed' | 'ratified' | 'rejected' | 'withdrawn';
  tally?: VoteTally;
  ratifyDeadline?: number;
  ratifications?: Record<string, boolean>;
  sponsor: string;
}

export interface InstitutionState {
  id: string;
  name: string;
  short: string;
  active: boolean;
  effectiveness: number;
  founded: number;
  headId?: string;
  custom?: boolean;
  description: string;
}

export interface EmergencyState {
  reason: string;
  declaredDay: number;
  expiresDay: number;
  extensions: number;
  powers: Record<string, CompetencyLevel>;
  previous: Record<string, CompetencyLevel>;
}

export interface UNEState {
  name: string;
  short: string;
  constitution: string;
  treasury: number;
  debt: number;
  creditRating: number;
  interestRate: number;
  funding: Record<string, number>;
  institutions: Record<string, InstitutionState>;
  competencies: Record<string, CompetencyLevel>;
  metrics: Record<string, number>;
  politicalCapital: number;
  sgId: string;
  councilIds: string[];
  coalition: string[];
  nextElection: number;
  lastElection: number;
  assembly: { seats: Record<string, number>; total: number; offworldSeats: number; byConstituency: Record<string, number> };
  upperHouse: string;
  lowerHouse: string;
  directSG: boolean;
  emergency: EmergencyState | null;
  revenueYTD: Record<string, number>;
  expenseYTD: Record<string, number>;
  revenueLastYear: Record<string, number>;
  expenseLastYear: Record<string, number>;
  delegation: Record<string, boolean>;
  bondsAuthorized: boolean;
  citizenship: 'national' | 'dual' | 'une';
  fragmentation: number;
  renamedDay?: number;
}

export interface EarthState {
  launchCapacity: number; // t/yr
  launchPrice: number; // cr/t to LEO
  launchUsedMonth: number;
  launchDemandMonth: number;
  prices: Record<GoodId, number>;
  spaceSupply: Stock; // t/yr delivered from space (smoothed)
  spaceDeliveries: Stock; // tonnes delivered to Earth this month
  climateStress: number;
  energyDemandTW: number;
  cleanShare: number;
  debrisRisk: number;
  orbitalObjects: number;
  surveyCoverage: number;
  beamedTW: number;
}

export interface RegionMarket {
  prices: Record<GoodId, number>;
  ceiling: Record<GoodId, number>;
  floor: Record<GoodId, number>;
  supply: Stock;
  demand: Stock;
  /** Decaying totals of freight billed on deliveries into the region from elsewhere. */
  freightIn?: { t: number; cost: number };
}

export interface CollectorDesign {
  id: string;
  name: string;
  owner: ActorId;
  radiusAU: number;
  areaM2: number;
  cell: string;
  structure: string;
  radiatorRatio: number;
  stationKeeping: string;
  transmission: string;
  computeFraction: number;
  repair: string;
  created: number;
}

export interface SwarmCohort {
  id: string;
  designId: string;
  count: number;
  meanAge: number; // years
  radiusAU: number;
  deployedDay: number;
  owner: ActorId;
}

export interface SwarmState {
  designs: Record<string, CollectorDesign>;
  cohorts: SwarmCohort[];
  activeDesign: string | null;
  totalCollectors: number;
  totalPowerW: number;
  transmittedW: number;
  computeW: number;
  localUseW: number;
  builtYear: number;
  failedYear: number;
  energyPrice: number; // cr per MWh
  revenueYear: number;
}

export interface AsteroidThreat {
  id: string;
  name: string;
  diameterM: number;
  impactDay: number;
  discoveredDay: number;
  probability: number;
  status: 'tracking' | 'mission' | 'deflected' | 'impacted' | 'missed' | 'cleared';
  mission?: { method: string; launchDay: number; arrivalDay: number; successChance: number; cost: number };
  region: string;
}

export interface SecurityState {
  piracy: Record<string, number>;
  threats: AsteroidThreat[];
  tension: number;
  aiRisk: number;
  wars: { id: string; a: string; b: string; startDay: number; intensity: number }[];
  incidentsYear: number;
  forcesCombat: number;
}

export interface EventOptionView {
  id: string;
  label: string;
  desc: string;
  disabled?: string;
}

export interface EventInstance {
  id: string;
  defId: string;
  day: number;
  ctx: Record<string, any>;
  deadline: number;
  title: string;
  text: string;
  category: string;
  options: EventOptionView[];
}

export interface EventState {
  pending: EventInstance[];
  lastFired: Record<string, number>;
  counts: Record<string, number>;
  flags: Record<string, any>;
}

export interface HistoryEntry {
  id: string;
  day: number;
  title: string;
  text: string;
  category: string;
  significance: number;
  refs: string[];
  causes: string[];
}

export interface StatsArchive {
  yearlyStart: number;
  yearly: Record<string, number[]>;
  monthlyStart: number; // absolute month index of first entry
  monthly: Record<string, number[]>;
}

export interface Alert {
  id: string;
  day: number;
  severity: 'info' | 'warn' | 'crit';
  text: string;
  ref?: string;
}

export interface GrandProjectState {
  id: string;
  defId: string;
  settlementId?: string;
  startedDay: number;
  progress: number;
  materials: Stock;
  materialsTotal: Stock;
  paid: number;
  completedDay?: number;
  stalled?: string;
}

export interface GameState {
  version: number;
  seed: string;
  day: number;
  rng: Record<string, [number, number, number, number]>;
  nextId: number;
  une: UNEState;
  nations: Record<string, Nation>;
  factions: Record<string, Faction>;
  corporations: Record<string, Corporation>;
  settlements: Record<string, Settlement>;
  designs: Record<string, VehicleDesign>;
  fleets: Record<string, Fleet>;
  routes: Record<string, Route>;
  shipments: Shipment[];
  shipOrders: ShipOrder[];
  markets: Record<string, RegionMarket>;
  earth: EarthState;
  tech: Record<string, TechState>;
  research: ResearchState;
  laws: Record<string, LawState>;
  bills: Bill[];
  characters: Record<string, Character>;
  swarm: SwarmState;
  security: SecurityState;
  events: EventState;
  history: HistoryEntry[];
  stats: StatsArchive;
  milestones: Record<string, number>;
  explain: Record<string, Breakdown>;
  alerts: Alert[];
  grandProjects: GrandProjectState[];
  gameOver?: { day: number; reason: string; title: string };
  settings: { autoPause: Record<string, boolean>; difficulty: number };
}

export interface CommandResult {
  ok: boolean;
  error?: string;
  id?: string;
  info?: string;
}
