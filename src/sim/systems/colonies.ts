// Founding settlements and changing their constitutional status.
import type { GameState, CommandResult, Settlement } from '../types';
import { SITE } from '../content/sites';
import { FACILITY, facilityJobs } from '../content/facilities';
import { SETTLEMENT_NAMES } from '../content/misc';
import { mod } from './modifiers';
import { createSettlement, addFacility, addAdults } from './factory';
import { addHistory, debit, actorFunds, known, usable, popOf, STATUS_ORDER, STATUS_LABEL, settlementList } from './helpers';
import { initSettlementFactions, changeStatus } from './politics';
import { earthHub } from './logistics';
import { planFor } from './designs';
import { freightEstimate } from './markets';
import { SOLAR_CONSTANT } from '../content/bodies';
import { solarFluxFactor } from '../content/bodies';

export interface FoundingPlan {
  ok: boolean;
  error?: string;
  facilities: { type: string; count: number }[];
  mass: number;
  cost: number;
  transport: number;
  crew: number;
  reachableBy?: string;
}

function packageFor(s: GameState, siteId: string, actor: string): { type: string; count: number }[] {
  const site = SITE[siteId];
  const pkg: { type: string; count: number }[] = [];
  const orbital = site.kind === 'orbital';
  if (orbital) pkg.push({ type: 'orbitalStation', count: 1 });
  else if (site.kind === 'atmospheric') pkg.push({ type: usable(s, actor, 'aerostat_habitats') ? 'aerostatHab' : 'habModule', count: 1 });
  else if (site.features.includes('iceShell') && usable(s, actor, 'ice_shell_habitats') && site.radiation > 1000) pkg.push({ type: 'iceHab', count: 1 });
  else pkg.push({ type: site.radiation > 5000 && usable(s, actor, 'regolith_construction') ? 'buriedHab' : 'habModule', count: site.radiation > 5000 ? 1 : 2 });
  pkg.push({ type: 'lifeSupport', count: 1 });
  const flux = solarFluxFactor(site.body) * site.illumination;
  if (flux >= 0.15) {
    pkg.push({ type: 'solarArray', count: Math.max(2, Math.ceil(3 / Math.max(0.3, flux))) });
    if (site.illumination < 0.7) pkg.push({ type: 'batteryBank', count: 2 });
  } else if (usable(s, actor, 'surface_fission')) {
    pkg.push({ type: 'fissionReactor', count: 1 });
  } else {
    pkg.push({ type: 'solarArray', count: 8 });
  }
  if (!orbital) pkg.push({ type: 'landingPad', count: 1 });
  pkg.push({ type: 'greenhouse', count: 1 });
  if (site.features.includes('radioQuiet')) pkg.push({ type: 'observatory', count: 1 });
  else pkg.push({ type: 'researchLab', count: 1 });
  return pkg;
}

export function foundingPlan(s: GameState, siteId: string, actor: string): FoundingPlan {
  const site = SITE[siteId];
  const fail = (e: string): FoundingPlan => ({ ok: false, error: e, facilities: [], mass: 0, cost: 0, transport: 0, crew: 0 });
  if (!site) return fail('Unknown site.');
  if (settlementList(s).some((st) => st.siteId === siteId)) return fail('A settlement already exists at this site.');
  if (site.features.includes('machinesOnly')) return fail('Radiation here is lethal within hours. Only autonomous machines can work at this site.');
  if (s.laws.planetary_protection && site.features.includes('biosignatureCandidate')) return fail('The Planetary Protection Act forbids settlement at this site.');
  if (actor !== 'une') {
    if (s.nations[actor] && !mod(s, 'nationalSettlements')) return fail('Member states may not register settlements without the National Settlement Registration law.');
    if (s.corporations[actor] && !mod(s, 'corpCharters')) return fail('Corporations may not found settlements without Corporate Settlement Charters.');
  }
  const pkg = packageFor(s, siteId, actor);
  for (const p of pkg) if (!usable(s, actor, FACILITY[p.type].tech)) return fail(`The founding package needs ${FACILITY[p.type].name}, which requires unavailable technology.`);
  // Reachability: some public or owned design must be able to deliver cargo
  const hub = earthHub(s);
  if (!hub) return fail('No Earth orbit hub.');
  const designs = Object.values(s.designs).filter((d) => !d.obsolete && (d.owner === 'public' || d.owner === actor || d.owner === 'une')).sort((a, b) => (a.id < b.id ? -1 : 1));
  const hubNode = SITE[hub.siteId].node;
  let reachableBy = designs.find((d) => {
    const plan = planFor(s, d, hubNode, site.node);
    return plan.feasible && plan.payload >= 10;
  })?.name;
  let crewExtra = 0;
  if (!reachableBy) {
    // One-way delivery: landers refuel for the trip home from a propellant plant the expedition builds
    const oneWay = designs.find((d) => {
      const plan = planFor(s, d, hubNode, site.node, undefined, [site.node]);
      return plan.feasible && plan.payload >= 10;
    });
    const isru = oneWay ? isruPackage(s, siteId, actor) : null;
    if (!oneWay) return fail('No existing ship design can deliver cargo there from Earth orbit. Design a capable ship or research better propulsion.');
    if (!isru) return fail(`Ships cannot fly home from ${site.name} without refuelling there, and no local propellant production is possible yet (it needs water ice or an atmosphere and the right technology).`);
    reachableBy = `${oneWay.name} (one-way, refuelled by local ISRU)`;
    for (const p of isru) {
      pkg.push(p);
      crewExtra += facilityJobs(FACILITY[p.type]) * p.count;
    }
  }
  let mass = 0, cost = 0;
  for (const p of pkg) {
    const def = FACILITY[p.type];
    for (const g in def.buildMass) mass += def.buildMass[g] * p.count;
    cost += def.buildCost * p.count * 0.7;
  }
  mass += 25; // consumables and spares
  const perT = s.earth.launchPrice + freightEstimate(s, 'earthOrbit', site.region, s.earth.prices.propellant + s.earth.launchPrice);
  const transport = mass * perT * 1.3;
  let discount = 1 - (actor === 'une' ? (s.une.institutions.sda?.effectiveness ?? 1) * 0.1 : 0);
  if (site.region === 'mars') discount *= 1 - (mod(s, 'marsDiscount') ?? 0);
  return { ok: true, facilities: pkg, mass, cost: cost * discount, transport: transport * discount, crew: (site.kind === 'orbital' ? 6 : 8) + Math.ceil(crewExtra), reachableBy };
}

/** Local propellant production for a base that ships must refuel at, with the power to run it. */
function isruPackage(s: GameState, siteId: string, actor: string): { type: string; count: number }[] | null {
  const site = SITE[siteId];
  const out: { type: string; count: number }[] = [];
  let power = 0;
  if (site.deposits.some((d) => d.type === 'ice') && usable(s, actor, FACILITY.propellantPlant.tech) && FACILITY.iceMine.allowed.includes(site.kind)) {
    out.push({ type: 'iceMine', count: 1 }, { type: 'propellantPlant', count: 1 });
    power = FACILITY.iceMine.power + FACILITY.propellantPlant.power;
  } else if (site.deposits.some((d) => d.type === 'atmosphere') && usable(s, actor, 'atmospheric_isru')) {
    out.push({ type: 'atmosphereProcessor', count: 1 }, { type: 'sabatierReactor', count: 1 });
    power = FACILITY.atmosphereProcessor.power + FACILITY.sabatierReactor.power;
  } else return null;
  const flux = solarFluxFactor(site.body) * site.illumination;
  if (usable(s, actor, 'surface_fission')) out.push({ type: 'fissionReactor', count: 1 });
  else out.push({ type: 'solarArray', count: Math.ceil((power * 1.2) / Math.max(0.05, 2 * flux)) });
  return out;
}

export function foundSettlement(s: GameState, siteId: string, actor: string, name?: string): CommandResult {
  const plan = foundingPlan(s, siteId, actor);
  if (!plan.ok) return { ok: false, error: plan.error };
  const total = plan.cost + plan.transport;
  const funds = actorFunds(s, actor);
  if (funds < total && !(actor === 'une' && s.une.bondsAuthorized)) return { ok: false, error: `Founding costs ${(total / 1e9).toFixed(1)}B cr, and the available funds are ${(funds / 1e9).toFixed(1)}B cr.` };
  debit(s, actor, total, 'Settlement founding');
  const site = SITE[siteId];
  const nm = name ?? SETTLEMENT_NAMES[siteId]?.[0] ?? `${site.name} Settlement`;
  const sponsors: Record<string, number> = { [actor]: 1 };
  const st = createSettlement(s, siteId, nm, actor, sponsors, 'outpost');
  for (const p of plan.facilities) addFacility(st, p.type, actor, p.count, s.day);
  addAdults(st.pop, plan.crew);
  // Twelve months of consumables, plus seed hydrogen for Sabatier propellant production
  st.stock = { oxygen: plan.crew * 0.35, water: plan.crew * 2.5, food: plan.crew * 0.5, supplies: plan.crew * 0.15, nitrogen: 1, phosphorus: 0.5 };
  if (plan.facilities.some((p) => p.type === 'sabatierReactor')) st.stock.hydrogen = 20;
  if (plan.facilities.some((p) => p.type === 'propellantPlant' || p.type === 'sabatierReactor')) st.stock.propellant = 150;
  const reactors = plan.facilities.filter((p) => p.type === 'fissionReactor').reduce((a, p) => a + p.count, 0);
  if (reactors > 0) st.stock.reactorFuel = reactors * (FACILITY.fissionReactor.recipe?.in.reactorFuel ?? 0.05) * 5;
  initSettlementFactions(s, st);
  const who = actor === 'une' ? 'The Solar Development Authority' : s.nations[actor]?.name ?? s.corporations[actor]?.name ?? actor;
  addHistory(s, `${nm} founded`, `${who} establishes ${nm} at ${site.name}. It is delivered by ${plan.reachableBy} and staffed by ${plan.crew} pioneers.`, 'colony', site.region === 'luna' || site.region === 'earthOrbit' ? 2 : 3, [st.id]);
  return { ok: true, id: st.id };
}

export function statusRequirements(s: GameState, st: Settlement, next: string): { ok: boolean; reason?: string; cost: number } {
  const pop = popOf(st);
  switch (next) {
    case 'territory':
      return pop >= 40 ? { ok: true, cost: 5 } : { ok: false, reason: 'Needs at least 40 permanent residents.', cost: 5 };
    case 'selfGoverning':
      return pop >= 1000 ? { ok: true, cost: s.laws.self_government ? 10 : 25 } : { ok: false, reason: 'Needs at least 1,000 residents.', cost: 25 };
    case 'commonwealth':
      return pop >= 20000 ? { ok: true, cost: 35 } : { ok: false, reason: 'Needs at least 20,000 residents.', cost: 35 };
    case 'member':
      if (!s.laws.offworld_representation) return { ok: false, reason: 'Requires the Off-World Representation Act.', cost: 50 };
      return pop >= 100000 ? { ok: true, cost: 50 } : { ok: false, reason: 'Needs at least 100,000 residents.', cost: 50 };
    case 'associated':
    case 'independent':
      return { ok: true, cost: 0 };
    default:
      return { ok: false, reason: 'Unknown status.', cost: 0 };
  }
}

export function grantStatus(s: GameState, settlementId: string, status: Settlement['status']): CommandResult {
  const st = s.settlements[settlementId];
  if (!st) return { ok: false, error: 'Unknown settlement.' };
  const cur = STATUS_ORDER.indexOf(st.status);
  const nxt = STATUS_ORDER.indexOf(status);
  if (status !== 'independent' && status !== 'associated' && nxt !== cur + 1) return { ok: false, error: 'Status can only advance one step at a time.' };
  const req = statusRequirements(s, st, status);
  if (!req.ok) return { ok: false, error: req.reason };
  if (s.une.politicalCapital < req.cost) return { ok: false, error: `Needs ${req.cost} political capital.` };
  s.une.politicalCapital -= req.cost;
  changeStatus(s, st, status, 'The Executive Council approved the change.');
  st.politics.grievances *= 0.6;
  st.politics.sentiment = Math.min(1, st.politics.sentiment + 0.15);
  return { ok: true };
}

export { STATUS_LABEL, SOLAR_CONSTANT, known };
