// The Helios swarm: collector production, self-replicating industry, cohorts,
// power transmission and the solar energy economy.
import type { GameState, CollectorDesign, SwarmCohort, Settlement } from '../types';
import { FACILITY } from '../content/facilities';
import { SITE } from '../content/sites';
import { clamp, nextId } from '../core/util';
import { mods } from './modifiers';
import { computeCollectorStats, type CollectorStats } from '../physics/dysonCalc';
import { addHistory, credit, settlementList, popOf, known } from './helpers';
import { yearOf } from '../core/time';
import { price, mercuryCapPerYear } from './settlements';
import { addFacility } from './factory';
import { BD, setExplain } from '../core/breakdown';

const statsCache = new Map<string, { key: string; st: CollectorStats }>();

export function collectorMods(s: GameState) {
  const m = mods(s);
  return {
    tempBonus: m.collectorTemp ?? 0,
    failureMult: Math.max(0.1, 1 + (m.collectorFailure ?? 0)),
    densityMult: Math.max(0.2, 1 + (m.collectorDensity ?? 0)),
  };
}

export function collectorStats(s: GameState, d: CollectorDesign): CollectorStats {
  const cm = collectorMods(s);
  const key = `${JSON.stringify(d)}|${cm.tempBonus}|${cm.failureMult}|${cm.densityMult}|${Object.values(s.tech).filter((t) => t.known).length}`;
  const c = statsCache.get(d.id);
  if (c && c.key === key) return c.st;
  const st = computeCollectorStats(d, (t) => !!s.tech[t]?.known, cm);
  statsCache.set(d.id, { key, st });
  return st;
}

export function defaultCollectorDesign(s: GameState): CollectorDesign {
  return {
    id: nextId(s, 'col'),
    name: 'Helios-I',
    owner: 'une',
    radiusAU: 0.3,
    areaM2: 1e6,
    cell: 'pv_basic',
    structure: 'nanotube',
    radiatorRatio: 0.5,
    stationKeeping: 'sail',
    transmission: 'microwave',
    computeFraction: 0.1,
    repair: 'none',
    created: s.day,
  };
}

export function dysonMonthly(s: GameState): void {
  const sw = s.swarm;
  if (known(s, 'dyson_collectors') && Object.keys(sw.designs).length === 0) {
    const d = defaultCollectorDesign(s);
    sw.designs[d.id] = d;
    sw.activeDesign = d.id;
  }
  replicate(s);
  produceCollectors(s);
  updateCohorts(s);
  distributePower(s);
}

/** Autonomous industrial complexes: mine, refine, manufacture, and build copies of themselves. */
function replicate(s: GameState): void {
  const m = mods(s);
  const repPolicy = m.replication ?? 0; // -1 banned, 0 licensed, 1 open
  for (const st of settlementList(s)) {
    const auto = st.facilities.filter((f) => f.type === 'autoFactory' && f.count > 0);
    if (auto.length === 0) continue;
    const count = auto.reduce((a, f) => a + f.count, 0);
    const site = SITE[st.siteId];
    // Mining + conversion of raw materials into manufactured goods
    const def = FACILITY.autoFactory;
    const energyR = st.energy.ratio;
    const deposits = st.deposits.filter((d) => def.mining!.depositTypes.includes(d.type) && d.reserve > 0 && (d.type !== 'core' || (m.mercuryCap ?? 0) >= 2));
    if (deposits.length === 0) continue;
    deposits.sort((a, b) => b.reserve - a.reserve);
    let ore = def.mining!.orePerYear * count * energyR / 12;
    if (site.body === 'mercury') {
      const cap = mercuryCapPerYear(s) * ((s.events.flags.mercuryShare as number) ?? 1) / 12;
      const used = (st.production.oxygen ?? 0) + (st.production.silicon ?? 0) + (st.production.iron ?? 0);
      ore = Math.min(ore, Math.max(0, cap - used * 1.5));
    }
    const dep = deposits[0];
    // Idle down when the main products are already piling up unused
    const use = (g: string) => (st.consumption[g] ?? 0) + (st.exports[g] ?? 0) + (st.demand[g] ?? 0);
    const glut = ['alloys', 'photovoltaics', 'machinery'].every((g) => (st.stock[g] ?? 0) > 2e5 + use(g) * 12);
    if (glut) ore *= 0.1;
    ore = Math.min(ore, dep.reserve);
    dep.reserve -= ore;
    const raw: Record<string, number> = {};
    for (const g in dep.yields) raw[g] = ore * dep.yields[g] * dep.grade;
    const metals = (raw.iron ?? 0) + (raw.nickel ?? 0) + (raw.aluminium ?? 0) + (raw.titanium ?? 0);
    const si = raw.silicon ?? 0;
    const out: Record<string, number> = {
      alloys: metals * 0.85,
      photovoltaics: si * 0.5,
      machinery: metals * 0.12,
      electronics: si * 0.015,
      semiconductors: si * 0.002,
      superconductors: metals * 0.0006,
      ceramics: si * 0.2,
      composites: (raw.carbon ?? 0) * 0.8 + si * 0.02,
      oxygen: raw.oxygen ?? 0,
      sulfur: raw.sulfur ?? 0,
      water: raw.water ?? 0,
      pgm: raw.pgm ?? 0,
    };
    for (const g in out) {
      if (!(out[g] > 0)) continue;
      st.stock[g] = (st.stock[g] ?? 0) + out[g];
      st.production[g] = (st.production[g] ?? 0) + out[g];
    }
    // Value the output for the owners
    let value = 0;
    for (const g in out) value += out[g] * price(s, st, g) * 0.3;
    const owners: Record<string, number> = {};
    for (const f of auto) owners[f.owner] = (owners[f.owner] ?? 0) + f.count;
    for (const o of Object.keys(owners).sort()) credit(s, o, value * (owners[o] / count), 'Autonomous industry');
    st.storageCap = Math.max(st.storageCap, count * 5e5);
    // Replication: build copies from local goods, bundled with solar power. Copies are only
    // worth making where collector output is held back by fabrication capacity or materials.
    if (repPolicy <= -1) continue;
    if ((m.automationMax ?? 1) < 5.5) continue;
    const limit = st.flags.collectorLimit as string | undefined;
    if (glut || (limit ? limit === 'launch' || limit === 'none' : count >= 20)) continue;
    const rate = (repPolicy >= 1 ? 0.5 : 0.25) / 12;
    const desired = count * rate;
    const bm = def.buildMass;
    const flux = 1 / Math.pow(SITE[st.siteId].body === 'mercury' ? 0.387 : 1, 2);
    const solarPer = Math.ceil(def.power / Math.max(0.5, 2 * flux * SITE[st.siteId].illumination * 0.8));
    const solarDef = FACILITY.autoSolar;
    let can = desired;
    for (const g in bm) can = Math.min(can, (st.stock[g] ?? 0) / (bm[g] + (solarDef.buildMass[g] ?? 0) * solarPer));
    can = Math.max(0, can);
    if (can <= 1e-6) continue;
    for (const g in bm) st.stock[g] -= (bm[g] + (solarDef.buildMass[g] ?? 0) * solarPer) * can;
    const owner = auto.sort((a, b) => b.count - a.count)[0].owner;
    addFacility(st, 'autoFactory', owner, can, s.day);
    addFacility(st, 'autoSolar', owner, can * solarPer, s.day);
    s.events.flags.replicated = ((s.events.flags.replicated as number) ?? 0) + can;
  }
}

function produceCollectors(s: GameState): void {
  const sw = s.swarm;
  const design = sw.activeDesign ? sw.designs[sw.activeDesign] : undefined;
  if (!design) return;
  const cs = collectorStats(s, design);
  if (cs.errors.length > 0 || cs.techMissing.length > 0) return;
  const massDriverNet = s.grandProjects.some((g) => g.defId === 'mercury_mass_driver_network' && g.completedDay !== undefined);
  let built = 0;
  for (const st of settlementList(s)) {
    st.flags.collectorLimit = 'none';
    let cap = 0;
    for (const f of st.facilities) if (f.type === 'collectorFactory') cap += (FACILITY.collectorFactory.collectorMassPerYear ?? 0) * f.count * f.utilization;
    // Autonomous factories can also print collectors when replication is mature
    const autos = st.facilities.filter((f) => f.type === 'autoFactory').reduce((a, f) => a + f.count, 0);
    cap += autos * 4000;
    if (cap <= 0) continue;
    let n = cap / 12 / cs.mass;
    let limit = 'capacity';
    for (const g in cs.goods) {
      const per = cs.goods[g];
      if (per <= 0) continue;
      const m2 = (st.stock[g] ?? 0) / per;
      if (m2 < n) {
        n = m2;
        limit = 'materials';
      }
    }
    // Launch constraint from surfaces
    if (SITE[st.siteId].kind === 'surface') {
      const launchT = massDriverNet ? Infinity : st.massDriverCapacity / 12;
      if (launchT / cs.mass < n) {
        n = launchT / cs.mass;
        limit = 'launch';
      }
    }
    st.flags.collectorLimit = limit;
    n = Math.max(0, n);
    if (n < 1e-6) continue;
    for (const g in cs.goods) st.stock[g] = (st.stock[g] ?? 0) - cs.goods[g] * n;
    built += n;
    const owner = st.facilities.find((f) => f.type === 'collectorFactory')?.owner ?? st.facilities.find((f) => f.type === 'autoFactory')?.owner ?? 'une';
    addToCohort(s, design, n, owner);
  }
  sw.builtYear = sw.builtYear * (11 / 12) + built;
  if (built > 0 && !s.milestones.first_collector) s.events.flags.firstCollector = s.day;
}

function addToCohort(s: GameState, d: CollectorDesign, n: number, owner: string): void {
  const year = yearOf(s.day);
  const decade = Math.floor(year / 10) * 10;
  let c = s.swarm.cohorts.find((x) => x.designId === d.id && x.owner === owner && Math.floor(yearOf(x.deployedDay) / 10) * 10 === decade);
  if (!c) {
    c = { id: nextId(s, 'coh'), designId: d.id, count: 0, meanAge: 0, radiusAU: d.radiusAU, deployedDay: s.day, owner } as SwarmCohort;
    s.swarm.cohorts.push(c);
  }
  const total = c.count + n;
  c.meanAge = total > 0 ? (c.meanAge * c.count) / total : 0;
  c.count = total;
}

function updateCohorts(s: GameState): void {
  const sw = s.swarm;
  let total = 0, power = 0, tx = 0, compute = 0, failed = 0;
  for (const c of sw.cohorts) {
    const d = sw.designs[c.designId];
    if (!d) continue;
    const cs = collectorStats(s, d);
    const aging = 1 + Math.max(0, c.meanAge / Math.max(1, cs.lifetime) - 0.8) * 2;
    const f = c.count * (cs.failureRate * aging) / 12;
    c.count = Math.max(0, c.count - f);
    failed += f;
    c.meanAge += 1 / 12;
    total += c.count;
    power += c.count * cs.electrical;
    tx += c.count * cs.transmitted;
    compute += c.count * cs.compute;
  }
  sw.cohorts = sw.cohorts.filter((c) => c.count >= 0.5);
  sw.totalCollectors = total;
  sw.totalPowerW = power;
  sw.transmittedW = tx;
  sw.computeW = compute;
  sw.failedYear = sw.failedYear * (11 / 12) + failed;
}

/** Beam power to settlements with rectennas and to Earth; sell it. */
function distributePower(s: GameState): void {
  const sw = s.swarm;
  const m = mods(s);
  let remaining = sw.transmittedW;
  for (const st of settlementList(s)) st.flags.beamMW = 0;
  // Settlements with receivers take what they can use
  const receivers = settlementList(s).filter((st) => st.beamCapacity > 0).sort((a, b) => b.beamCapacity - a.beamCapacity);
  let toSettlements = 0;
  for (const st of receivers) {
    const want = Math.min(st.beamCapacity, Math.max(0, st.energy.demand * 1.2)) * 1e6;
    const give = Math.min(want, remaining);
    st.flags.beamMW = give / 1e6;
    remaining -= give;
    toSettlements += give;
  }
  // Earth absorbs beamed power up to a growing demand
  const earthCap = s.earth.energyDemandTW * 1e12 * 0.5 * clamp((s.day / 365.25 - 150) / 100, 0.05, 3);
  const toEarth = Math.min(remaining, earthCap);
  s.earth.beamedTW = toEarth / 1e12;
  remaining -= toEarth;
  sw.localUseW = sw.totalPowerW - sw.transmittedW + remaining;
  // Energy price falls as supply grows relative to demand
  const demandW = s.earth.energyDemandTW * 1e12;
  sw.energyPrice = clamp(60 / Math.pow(1 + (toEarth + toSettlements) / Math.max(1, demandW), 0.8), 0.5, 60);
  const revenue = ((toEarth + toSettlements) / 1e6) * 8766 * sw.energyPrice; // cr per year
  sw.revenueYear = revenue;
  const monthly = revenue / 12;
  if (monthly > 0) {
    const trust = s.une.institutions.energyTrust?.active ? m.energyTrust ?? 0 : 0;
    const tax = m.energyTax ?? 0;
    const uneShare = trust + (1 - trust) * tax;
    credit(s, 'une', monthly * uneShare, trust > 0 ? 'Solar Energy Trust' : 'Solar energy levy');
    // Remaining revenue goes to cohort owners by power
    const byOwner: Record<string, number> = {};
    let tot = 0;
    for (const c of sw.cohorts) {
      const d = sw.designs[c.designId];
      if (!d) continue;
      const p = c.count * collectorStats(s, d).transmitted;
      byOwner[c.owner] = (byOwner[c.owner] ?? 0) + p;
      tot += p;
    }
    for (const o of Object.keys(byOwner).sort()) credit(s, o, monthly * (1 - uneShare) * (byOwner[o] / Math.max(1, tot)), 'Energy sales');
  }
  const b = new BD('W', 'Helios swarm power and where it goes.');
  b.add('Beamed to settlements', toSettlements).add('Beamed to Earth', toEarth).add('Used in the swarm (compute, industry, losses)', sw.totalPowerW - toSettlements - toEarth);
  setExplain(s, 'swarm.power', b, sw.totalPowerW);
  void popOf;
}

export function swarmTotals(s: GameState) {
  return { collectors: s.swarm.totalCollectors, power: s.swarm.totalPowerW };
}

export type { Settlement };
