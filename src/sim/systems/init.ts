// Creates a new campaign state for 1 January 2048.
import type { GameState, Nation, Faction, Corporation, InstitutionState, RegionMarket } from '../types';
import { NATIONS, FACTIONS, CORPORATIONS, INSTITUTIONS, COMPETENCIES, AXES } from '../content/actors';
import { GOODS } from '../content/goods';
import { TECHS } from '../content/techs';
import { hashSeed, gaussian, rand } from '../core/rng';
import { clamp } from '../core/util';
import { dayFromCivil } from '../core/time';
import { makeCharacter } from './characters';
import { BASE_LAUNCH_PRICE } from './logistics';
import { createSettlement, addFacility, addAdults, createDesignFromTemplate, createFleet, createRoute } from './factory';
import { addHistory } from './helpers';
import { runAssemblyElection, formGovernment, initFactionSupport } from './politics';
import { initStats } from './stats';

export const SAVE_VERSION = 1;

// National launch capacities in the content tables are relative weights; 2048
// sees daily fully reusable heavy launches from about a dozen spaceports.
const LAUNCH_SCALE = 3;

const REGIONS = ['earth', 'earthOrbit', 'luna', 'nea', 'mars', 'venus', 'mercury', 'belt', 'jupiter', 'saturn', 'outer'];

const START_KNOWN = ['reusable_launch', 'chemical_rocketry', 'electric_propulsion', 'autonomous_flight', 'basic_life_support', 'cryogenic_depots', 'laser_communications', 'autonomous_robotics'];

export function createGame(seed: string): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    seed,
    day: 0,
    rng: {},
    nextId: 0,
    une: {
      name: 'United Nations of Earth',
      short: 'UNE',
      constitution: 'Earth Compact',
      treasury: 4.0e10,
      debt: 0,
      creditRating: 0.75,
      interestRate: 0.035,
      funding: {},
      institutions: {},
      competencies: {},
      metrics: {},
      politicalCapital: 40,
      sgId: '',
      councilIds: [],
      coalition: [],
      nextElection: dayFromCivil(2052, 5, 1),
      lastElection: 0,
      assembly: { seats: {}, total: 750, offworldSeats: 0, byConstituency: {} },
      upperHouse: 'Chamber of Nations',
      lowerHouse: 'Assembly of Humanity',
      directSG: false,
      emergency: null,
      revenueYTD: {},
      expenseYTD: {},
      revenueLastYear: {},
      expenseLastYear: {},
      delegation: { logistics: true, budget: true, research: false, construction: false, expansion: false, legislation: false, events: false },
      bondsAuthorized: false,
      citizenship: 'national',
      fragmentation: 0,
    },
    nations: {},
    factions: {},
    corporations: {},
    settlements: {},
    designs: {},
    fleets: {},
    routes: {},
    shipments: [],
    shipOrders: [],
    markets: {},
    earth: {
      launchCapacity: 0,
      launchPrice: BASE_LAUNCH_PRICE,
      launchUsedMonth: 0,
      launchDemandMonth: 0,
      prices: {},
      spaceSupply: {},
      spaceDeliveries: {},
      climateStress: 0.35,
      energyDemandTW: 32,
      cleanShare: 0.55,
      debrisRisk: 0.12,
      orbitalObjects: 1,
      surveyCoverage: 0.55,
      beamedTW: 0,
    },
    tech: {},
    research: { queue: [], rpLastYear: 0, rpMonth: 0 },
    laws: {},
    bills: [],
    characters: {},
    swarm: { designs: {}, cohorts: [], activeDesign: null, totalCollectors: 0, totalPowerW: 0, transmittedW: 0, computeW: 0, localUseW: 0, builtYear: 0, failedYear: 0, energyPrice: 60, revenueYear: 0 },
    security: { piracy: {}, threats: [], tension: 0.25, aiRisk: 0.05, wars: [], incidentsYear: 0, forcesCombat: 0 },
    events: { pending: [], lastFired: {}, counts: {}, flags: {} },
    history: [],
    stats: { yearlyStart: 2048, yearly: {}, monthlyStart: 0, monthly: {} },
    milestones: {},
    explain: {},
    alerts: [],
    grandProjects: [],
    settings: { autoPause: { crisis: true, decision: true, election: true, milestone: false }, difficulty: 1 },
  };
  // seed the RNG namespace eagerly for determinism
  s.rng.main = hashSeed(seed);

  // --- Institutions & competencies ---------------------------------------
  for (const def of INSTITUTIONS) {
    const inst: InstitutionState = { id: def.id, name: def.name, short: def.short, active: def.initiallyActive, effectiveness: 1, founded: 0, description: def.description };
    s.une.institutions[def.id] = inst;
    s.une.funding[def.id] = def.initiallyActive ? def.baseFunding : 0;
  }
  for (const c of COMPETENCIES) s.une.competencies[c.id] = c.initial;

  // --- Technology --------------------------------------------------------
  for (const t of TECHS) s.tech[t.id] = { progress: 0, known: START_KNOWN.includes(t.id) || t.tier === 0, knownDay: 0 };
  s.research.queue = ['isru_propellant', 'regolith_construction', 'surface_fission'];

  // --- Factions ----------------------------------------------------------
  for (const f of FACTIONS) {
    const fs: Faction = { id: f.id, name: f.name, short: f.short, color: f.color, axes: [...f.axes], description: f.description, active: f.initiallyActive, founded: f.initiallyActive ? 0 : -1, radicalism: 0.2, support: 0, seats: 0 };
    s.factions[f.id] = fs;
  }

  // --- Nations -----------------------------------------------------------
  for (const d of NATIONS) {
    const ideology = AXES.map((_, i) => {
      let v = 0, w = 0;
      for (const fid in d.factionSupport) {
        v += d.factionSupport[fid] * (s.factions[fid]?.axes[i] ?? 0);
        w += d.factionSupport[fid];
      }
      return clamp((v / Math.max(1e-9, w)) * 2 + gaussian(s, 'init') * 0.08, -1, 1);
    });
    const n: Nation = {
      id: d.id, name: d.name, short: d.short, color: d.color, states: d.states, description: d.description, member: true,
      population: d.population, popGrowth: d.popGrowth, gdp: d.gdp, gdpGrowth: d.baseGrowth, baseGrowth: d.baseGrowth,
      industry: d.gdp / 1e12, energyTW: d.energyTW, science: d.science, launchCapacity: d.launchCapacity * LAUNCH_SCALE, military: d.military,
      debtRatio: d.debtRatio, ideology, publicOpinion: d.publicOpinion, uneSupport: d.uneSupport, integrationPref: d.integrationPref,
      stability: d.stability, spaceBudgetShare: d.spaceBudgetShare, spaceFunds: d.gdp * d.spaceBudgetShare * 0.5, relations: {},
      factionSupport: { ...d.factionSupport }, leaderId: '', nextLeadershipDay: Math.floor(rand(s, 'init') * d.leadershipCycle * 365),
      leadershipCycle: d.leadershipCycle, unemployment: 0.05, grievances: 0, compliance: 1,
      offworldInterest: Math.min(1, d.spaceBudgetShare * 700), nameCulture: d.nameCulture, emigrantsYear: 0, spaceInvestYear: 0,
    };
    s.nations[n.id] = n;
    s.earth.launchCapacity += n.launchCapacity;
  }
  const nids = Object.keys(s.nations).sort();
  for (const a of nids) {
    for (const b of nids) {
      if (a === b) continue;
      if (s.nations[b].relations[a] !== undefined) {
        s.nations[a].relations[b] = s.nations[b].relations[a];
        continue;
      }
      s.nations[a].relations[b] = clamp(0.3 + gaussian(s, 'init') * 0.2, -0.4, 0.8);
    }
  }
  for (const id of nids) {
    const n = s.nations[id];
    const leader = makeCharacter(s, 'leader', { nationId: id, ideology: n.ideology.map((v) => clamp(v + gaussian(s, 'init') * 0.1, -1, 1)) });
    n.leaderId = leader.id;
  }

  // --- Corporations --------------------------------------------------------
  for (const d of CORPORATIONS) {
    const c: Corporation = {
      id: d.id, name: d.name, short: d.short, sector: d.sector, home: d.home, structure: d.structure, color: d.color,
      cash: d.cash, debt: 0, valuation: d.cash * 3, revenue: d.cash * 0.3, profit: d.cash * 0.03, revenueYTD: 0, profitYTD: 0,
      influence: d.influence, reputation: d.reputation, workforce: 20000, techs: [], ceoId: '', founded: 0, alive: true,
      riskAppetite: d.riskAppetite, focus: [...d.focus], distress: 0, description: d.description,
    };
    s.corporations[c.id] = c;
    const ceo = makeCharacter(s, 'ceo', { nationId: d.home ?? undefined, roleRef: c.id, factionId: 'corporate' });
    c.ceoId = ceo.id;
  }

  // --- Markets -----------------------------------------------------------
  for (const g of GOODS) s.earth.prices[g.id] = g.price;
  for (const r of REGIONS) {
    const m: RegionMarket = { prices: {}, ceiling: {}, floor: {}, supply: {}, demand: {} };
    for (const g of GOODS) {
      const p = r === 'earth' ? g.price : g.price + s.earth.launchPrice * (r === 'earthOrbit' ? 1 : 4);
      m.prices[g.id] = p;
      m.ceiling[g.id] = p;
      m.floor[g.id] = g.price * 0.05;
    }
    s.markets[r] = m;
  }

  // --- Starting settlements ------------------------------------------------
  const leo = createSettlement(s, 'leo', 'Gateway LEO', 'argent', { argent: 0.35, une: 0.25, usa: 0.2, eu: 0.1, jpn: 0.1 }, 'outpost');
  addAdults(leo.pop, 140);
  addFacility(leo, 'orbitalStation', 'argent', 2, 0);
  addFacility(leo, 'orbitalStation', 'une', 1, 0);
  addFacility(leo, 'orbitalStation', 'usa', 1, 0);
  addFacility(leo, 'lifeSupport', 'une', 2, 0);
  addFacility(leo, 'solarArray', 'argent', 5, 0);
  addFacility(leo, 'propellantDepot', 'argent', 1, 0);
  addFacility(leo, 'propellantDepot', 'une', 1, 0);
  addFacility(leo, 'warehouse', 'une', 1, 0);
  addFacility(leo, 'researchLab', 'usa', 1, 0);
  leo.stock = { oxygen: 40, water: 300, food: 60, supplies: 30, propellant: 3000, hydrogen: 100, argon: 100 };
  leo.flags.earthHub = true;

  const gw = createSettlement(s, 'luna_gateway', 'Lunar Gateway', 'une', { une: 0.4, usa: 0.3, eu: 0.1, jpn: 0.1, oms: 0.1 }, 'outpost');
  addAdults(gw.pop, 6);
  addFacility(gw, 'orbitalStation', 'une', 1, 0);
  addFacility(gw, 'lifeSupport', 'une', 1, 0);
  addFacility(gw, 'solarArray', 'une', 1, 0);
  addFacility(gw, 'propellantDepot', 'une', 1, 0);
  gw.stock = { oxygen: 4, water: 25, food: 4, supplies: 3, propellant: 2500 };

  const sh = createSettlement(s, 'luna_shackleton', 'Shackleton Station', 'usa', { usa: 0.4, eu: 0.2, jpn: 0.15, ind: 0.1, kor: 0.1, une: 0.05 }, 'outpost');
  addAdults(sh.pop, 16);
  addFacility(sh, 'habModule', 'usa', 1, 0);
  addFacility(sh, 'habModule', 'eu', 1, 0);
  addFacility(sh, 'lifeSupport', 'usa', 1, 0);
  addFacility(sh, 'solarArray', 'usa', 2, 0);
  addFacility(sh, 'solarArray', 'jpn', 2, 0);
  addFacility(sh, 'batteryBank', 'jpn', 3, 0);
  addFacility(sh, 'greenhouse', 'eu', 1, 0);
  addFacility(sh, 'landingPad', 'usa', 1, 0);
  addFacility(sh, 'researchLab', 'ind', 1, 0);
  sh.stock = { oxygen: 4, water: 30, food: 6, supplies: 3, propellant: 40, nitrogen: 2, phosphorus: 1 };

  const gh = createSettlement(s, 'luna_malapert', 'Guanghan Station', 'chn', { chn: 0.8, rus: 0.1, apg: 0.1 }, 'outpost');
  addAdults(gh.pop, 12);
  addFacility(gh, 'habModule', 'chn', 1, 0);
  addFacility(gh, 'lifeSupport', 'chn', 1, 0);
  addFacility(gh, 'solarArray', 'chn', 3, 0);
  addFacility(gh, 'batteryBank', 'chn', 2, 0);
  addFacility(gh, 'landingPad', 'chn', 1, 0);
  addFacility(gh, 'researchLab', 'chn', 1, 0);
  gh.stock = { oxygen: 3, water: 25, food: 5, supplies: 3, propellant: 30 };

  // --- Designs, fleets and routes ------------------------------------------
  const aquila = createDesignFromTemplate(s, 'aquila')!;
  const selene = createDesignFromTemplate(s, 'selene')!;
  const seleneCrew = createDesignFromTemplate(s, 'selene_crew')!;
  createDesignFromTemplate(s, 'hall_tug');
  createDesignFromTemplate(s, 'tanker');
  const r1 = createRoute(s, 'LEO–Gateway Freight', 'argent', leo.id, gw.id, 'supply', 2);
  createFleet(s, 'argent', aquila.id, 2, r1.id);
  const r2 = createRoute(s, 'Shackleton Supply', 'argent', leo.id, sh.id, 'supply', 3);
  createFleet(s, 'argent', selene.id, 2, r2.id);
  createFleet(s, 'argent', seleneCrew.id, 1, r2.id);
  const r3 = createRoute(s, 'Guanghan Supply', 'longwei', leo.id, gh.id, 'supply', 3);
  createFleet(s, 'longwei', selene.id, 2, r3.id);
  createFleet(s, 'longwei', seleneCrew.id, 1, r3.id);

  // --- People ------------------------------------------------------------
  makeCharacter(s, 'judge', { culture: 'european', background: 'President of the Earth Compact Court', ageMin: 55, ageMax: 68 });
  makeCharacter(s, 'admiral', { culture: 'indian', background: 'Commander, Planetary Defense Command', ageMin: 50, ageMax: 60 });
  makeCharacter(s, 'scientist', { culture: 'african', background: 'Director, International Science Directorate', ageMin: 45, ageMax: 62 });

  // --- Politics ------------------------------------------------------------
  initFactionSupport(s);
  runAssemblyElection(s, true);
  formGovernment(s, true);

  initStats(s);
  addHistory(s, 'The Earth Compact is ratified', 'After decades of negotiation, the nations of Earth ratify the Earth Compact. The United Nations of Earth is established, with permanent authority over humanity\'s common interests beyond Earth.', 'constitution', 5);
  return s;
}
