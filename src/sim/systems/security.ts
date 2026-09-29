// Security: orbital debris, planetary defense, piracy, tension, wars and AI risk.
import type { GameState, AsteroidThreat, CommandResult } from '../types';
import { clamp, nextId } from '../core/util';
import { rand, chance, randRange, pick, gaussian } from '../core/rng';
import { mods, mod } from './modifiers';
import { addHistory, addAlert, settlementList, regionOf, popOf, debit, earthGDP } from './helpers';
import { FACILITY } from '../content/facilities';
import { designStats } from './designs';
import { formatDate } from '../core/time';
import { BD, setExplain } from '../core/breakdown';

const THREAT_NAMES = ['Apophis-class', 'Kalliope', 'Tempest', 'Nemesis', 'Arawn', 'Veles', 'Morrigan', 'Tiamat', 'Surtr', 'Kali', 'Anansi', 'Tezcatlipoca', 'Loki', 'Baba Yaga', 'Rahu', 'Oni'];

export function securityMonthly(s: GameState): void {
  const m = mods(s);
  debrisAndSurvey(s);
  threatsMonthly(s);
  piracyMonthly(s);
  tensionMonthly(s);
  aiRiskMonthly(s);
  // Security forces strength
  let combat = 0;
  for (const f of Object.values(s.fleets)) {
    if (f.owner !== 'une' || f.count <= 0) continue;
    const d = s.designs[f.designId];
    if (!d) continue;
    combat += designStats(s, d).combatRating * f.count;
  }
  const usf = s.une.institutions.securityForces;
  combat += usf?.active ? usf.effectiveness * 200 : 0;
  s.security.forcesCombat = combat;
  void m;
}

function debrisAndSurvey(s: GameState): void {
  const m = mods(s);
  const e = s.earth;
  const osa = s.une.institutions.osa?.active ? s.une.institutions.osa.effectiveness : 0;
  const launches = e.launchUsedMonth;
  const growth = 0.0025 + (launches / 2000) * 0.002;
  const mitigation = (osa * 0.0022 + (m.debrisMitigation ?? 0) * 0.004) * e.orbitalObjects;
  e.orbitalObjects = clamp(e.orbitalObjects + growth - mitigation, 0.3, 10);
  e.debrisRisk = clamp(0.03 + (e.orbitalObjects - 0.8) * 0.18, 0, 1);
  const db = new BD('risk', 'Kessler-cascade risk from orbital congestion.');
  db.add('Object growth from launches & constellations', growth * 12);
  db.add('Mitigation (OSA, standards, technology)', -mitigation * 12);
  db.note = `Orbital object index ${e.orbitalObjects.toFixed(2)} (1.0 = 2048).`;
  setExplain(s, 'earth.debris', db, e.debrisRisk);
  // Survey coverage
  const pdc = s.une.institutions.pdc?.active ? s.une.institutions.pdc.effectiveness : 0;
  let tel = 0;
  for (const st of settlementList(s)) for (const f of st.facilities) tel += (FACILITY[f.type]?.survey ?? 0) * f.count;
  const g = (0.0025 * pdc + tel * 0.004) * (1 + (m.surveyGrowth ?? 0)) * (1 - e.surveyCoverage);
  e.surveyCoverage = clamp(e.surveyCoverage + g - 0.0004 * (1 - pdc), 0, 0.999);
  const sb = new BD('coverage', 'Share of hazardous near-Earth objects catalogued.');
  sb.add('Planetary Defense Command programs', 0.0025 * pdc * 12);
  sb.add('Survey telescopes & observatories', tel * 0.004 * 12);
  setExplain(s, 'earth.survey', sb, e.surveyCoverage);
}

function threatsMonthly(s: GameState): void {
  const e = s.earth;
  if (chance(s, 'threats', 1 / 110)) spawnThreat(s);
  // Small undetected impactors (airbursts)
  if (chance(s, 'threats', (1 - e.surveyCoverage) * 0.0015)) {
    const nation = pick(s, 'threats', Object.keys(s.nations).sort());
    addHistory(s, 'Undetected airburst', `A 30-metre asteroid nobody had catalogued explodes over ${s.nations[nation].name} with the force of a large nuclear weapon. Damage is heavy but localized.`, 'disaster', 2, [nation]);
    s.nations[nation].gdp *= 0.998;
    s.events.flags.recentFailure = ((s.events.flags.recentFailure as number) ?? 0) + 0.3;
    for (const id in s.nations) s.nations[id].factionSupport.security = (s.nations[id].factionSupport.security ?? 0) * 1.1;
  }
  for (const t of s.security.threats) {
    if (t.status === 'mission' && t.mission && s.day >= t.mission.arrivalDay) {
      const success = rand(s, 'threats') < t.mission.successChance;
      if (success) {
        t.status = 'deflected';
        addHistory(s, `${t.name} deflected`, `Planetary Defense Command reports that the ${t.mission.method} mission changed the orbit of ${t.name} (${t.diameterM.toFixed(0)} m). Earth is safe.`, 'security', t.diameterM > 300 ? 4 : 3, [t.id]);
        s.events.flags.recentSuccess = ((s.events.flags.recentSuccess as number) ?? 0) + (t.diameterM > 300 ? 1.5 : 0.8);
        s.une.metrics.legitimacy = clamp((s.une.metrics.legitimacy ?? 0.6) + 0.03, 0, 1);
      } else {
        t.status = 'tracking';
        t.mission = undefined;
        addHistory(s, `Deflection of ${t.name} fails`, `The mission to ${t.name} did not produce enough momentum change. The impact risk remains.`, 'security', 3, [t.id]);
        addAlert(s, 'crit', `Deflection mission to ${t.name} failed. Impact still possible on ${formatDate(t.impactDay)}`, t.id);
      }
    }
    if ((t.status === 'tracking' || t.status === 'mission') && s.day >= t.impactDay) resolveImpact(s, t);
    // Update displayed probability as tracking improves
    if (t.status === 'tracking' || t.status === 'mission') {
      const hit = (t as any).hit as boolean;
      const total = Math.max(1, t.impactDay - t.discoveredDay);
      const frac = clamp((s.day - t.discoveredDay) / total, 0, 1);
      const target = hit ? 1 : 0;
      const p0 = (t as any).p0 ?? t.probability;
      t.probability = clamp(p0 + (target - p0) * Math.pow(frac, 0.6), 0, 1);
      if (!hit && t.probability < 0.002 && frac > 0.3) {
        t.status = 'cleared';
        addAlert(s, 'info', `${t.name} ruled out as an impact threat`, t.id);
      }
    }
  }
  s.security.threats = s.security.threats.filter((t) => t.status === 'tracking' || t.status === 'mission' || s.day - t.impactDay < 3650);
}

export function spawnThreat(s: GameState, forced?: { diameter?: number; leadYears?: number }): AsteroidThreat {
  const e = s.earth;
  const r = rand(s, 'threats');
  const diameter = forced?.diameter ?? (r < 0.7 ? randRange(s, 'threats', 40, 140) : r < 0.93 ? randRange(s, 'threats', 140, 400) : r < 0.995 ? randRange(s, 'threats', 400, 1500) : randRange(s, 'threats', 1500, 4000));
  const early = rand(s, 'threats') < e.surveyCoverage;
  const lead = forced?.leadYears ?? (early ? randRange(s, 'threats', 6, 40) * (diameter > 400 ? 1.5 : 1) : randRange(s, 'threats', 0.3, 4));
  const p0 = clamp(randRange(s, 'threats', 0.01, 0.2) * (early ? 1 : 2), 0.005, 0.6);
  const hit = rand(s, 'threats') < (diameter > 1000 ? 0.3 : 0.4);
  const t: AsteroidThreat = {
    id: nextId(s, 'neo'),
    name: `${2048 + Math.floor(s.day / 365.25)} ${pick(s, 'threats', THREAT_NAMES)}`,
    diameterM: diameter,
    impactDay: s.day + Math.round(lead * 365.25),
    discoveredDay: s.day,
    probability: p0,
    status: 'tracking',
    region: pick(s, 'threats', Object.keys(s.nations).sort()),
  };
  (t as any).hit = hit;
  (t as any).p0 = p0;
  s.security.threats.push(t);
  addHistory(s, `Asteroid ${t.name} discovered`, `Survey telescopes find a ${diameter.toFixed(0)}-metre object with a ${(p0 * 100).toFixed(1)}% chance of striking Earth on ${formatDate(t.impactDay)}.`, 'security', diameter > 400 ? 4 : 2, [t.id]);
  addAlert(s, diameter > 140 ? 'crit' : 'warn', `New impact threat: ${t.name} (${diameter.toFixed(0)} m), ${(p0 * 100).toFixed(1)}%`, t.id);
  s.events.flags.newThreat = t.id;
  return t;
}

export function deflectionOptions(s: GameState, threatId: string): { method: string; label: string; cost: number; chance: number; available: boolean; reason?: string; transitDays: number }[] {
  const t = s.security.threats.find((x) => x.id === threatId);
  if (!t) return [];
  const years = Math.max(0, (t.impactDay - s.day) / 365.25);
  const pdc = s.une.institutions.pdc?.active ? s.une.institutions.pdc.effectiveness : 0.2;
  const def = mod(s, 'deflection');
  const size = t.diameterM;
  const sizePen = size > 1500 ? 0.6 : size > 400 ? 0.3 : size > 140 ? 0.1 : 0;
  const transit = Math.min(900, 180 + size * 0.2);
  const lead = Math.max(0, years - transit / 365.25);
  const base = (x: number) => clamp(x * (0.6 + pdc * 0.4) + def, 0.02, 0.97);
  const kin = base(0.45 + 0.07 * lead - sizePen);
  const nuc = base(0.65 + 0.05 * lead - sizePen * 0.5);
  const trac = base(lead >= 10 ? 0.9 - sizePen * 0.5 : lead >= 5 ? 0.5 : 0.1);
  const scale = Math.max(1, size / 100);
  return [
    { method: 'kinetic impactor', label: 'Kinetic impactor', cost: 3e9 * Math.sqrt(scale), chance: kin, available: true, transitDays: transit },
    { method: 'nuclear standoff', label: 'Nuclear standoff burst', cost: 8e9 * Math.sqrt(scale), chance: nuc, available: !!s.laws.nuclear_deflection, reason: s.laws.nuclear_deflection ? undefined : 'Requires the Nuclear Deflection Authority law', transitDays: transit },
    { method: 'gravity tractor', label: 'Gravity tractor', cost: 5e9 * Math.sqrt(scale), chance: trac, available: !!s.tech.gravitational_tractors?.known, reason: s.tech.gravitational_tractors?.known ? undefined : 'Requires the Gravity Tractors technology', transitDays: transit },
  ];
}

export function launchDeflection(s: GameState, threatId: string, method: string): CommandResult {
  const t = s.security.threats.find((x) => x.id === threatId);
  if (!t || t.status !== 'tracking') return { ok: false, error: 'No active threat to deflect.' };
  const opt = deflectionOptions(s, threatId).find((o) => o.method === method);
  if (!opt) return { ok: false, error: 'Unknown method.' };
  if (!opt.available) return { ok: false, error: opt.reason };
  if (s.une.competencies.planetaryDefense === 'national') return { ok: false, error: 'The UNE lacks planetary defense authority.' };
  if (s.une.treasury < opt.cost && !s.une.bondsAuthorized) return { ok: false, error: 'Insufficient funds for the mission.' };
  debit(s, 'une', opt.cost, 'Planetary defense missions');
  const arrival = Math.min(t.impactDay - 30, s.day + opt.transitDays);
  if (arrival <= s.day) return { ok: false, error: 'Too late: the mission cannot arrive before impact.' };
  t.status = 'mission';
  t.mission = { method, launchDay: s.day, arrivalDay: arrival, successChance: opt.chance, cost: opt.cost };
  addHistory(s, `Deflection mission launched toward ${t.name}`, `Planetary Defense Command launches a ${method} mission. Estimated success: ${(opt.chance * 100).toFixed(0)}%. Arrival: ${formatDate(arrival)}.`, 'security', 3, [t.id]);
  return { ok: true };
}

function resolveImpact(s: GameState, t: AsteroidThreat): void {
  const hit = (t as any).hit as boolean;
  if (!hit) {
    t.status = 'missed';
    addHistory(s, `${t.name} passes Earth`, `${t.name} passes safely, as final tracking had predicted.`, 'security', 1, [t.id]);
    return;
  }
  t.status = 'impacted';
  const d = t.diameterM;
  const n = s.nations[t.region];
  const nationName = n?.name ?? 'Earth';
  if (d >= 1500) {
    s.gameOver = { day: s.day, reason: `The ${d.toFixed(0)}-metre asteroid ${t.name} struck Earth. The impact winter that followed ended industrial civilization.`, title: 'Civilization-Ending Impact' };
    addHistory(s, `${t.name} strikes Earth`, s.gameOver.reason, 'disaster', 5, [t.id]);
    return;
  }
  let deaths = 0, gdpLoss = 0, climate = 0;
  if (d < 140) {
    deaths = 2e5 + (d / 140) * 1.5e6;
    gdpLoss = 0.005;
  } else if (d < 400) {
    deaths = 5e6 + (d / 400) * 4e7;
    gdpLoss = 0.03;
    climate = 0.05;
  } else {
    deaths = 1e8 + (d / 1500) * 7e8;
    gdpLoss = 0.15;
    climate = 0.3;
  }
  for (const id in s.nations) {
    const nat = s.nations[id];
    const local = id === t.region;
    nat.gdp *= 1 - gdpLoss * (local ? 3 : 0.5);
    if (local) nat.population = Math.max(1e6, nat.population - deaths * 0.7);
    else nat.population -= deaths * 0.3 * (nat.population / 9e9);
    nat.factionSupport.security = (nat.factionSupport.security ?? 0) * 1.5;
  }
  s.earth.climateStress = clamp(s.earth.climateStress + climate, 0, 1.5);
  s.events.flags.recentFailure = ((s.events.flags.recentFailure as number) ?? 0) + (d > 140 ? 3 : 1);
  s.une.metrics.legitimacy = clamp((s.une.metrics.legitimacy ?? 0.6) - (d > 140 ? 0.15 : 0.05), 0, 1);
  s.events.flags.impactCrisis = { id: t.id, day: s.day, deaths };
  addHistory(s, `${t.name} strikes ${nationName}`, `A ${d.toFixed(0)}-metre asteroid strikes ${nationName}. About ${Math.round(deaths / 1e3) * 1e3 >= 1e6 ? (deaths / 1e6).toFixed(1) + ' million' : Math.round(deaths).toLocaleString('en-US')} people are killed. Planetary Defense has failed.`, 'disaster', 5, [t.id]);
  addAlert(s, 'crit', `IMPACT: ${t.name} struck ${nationName}`, t.id);
}

function piracyMonthly(s: GameState): void {
  const trade: Record<string, number> = {};
  for (const r of Object.values(s.routes)) {
    const d = s.settlements[r.destination];
    if (!d) continue;
    const reg = regionOf(d);
    trade[reg] = (trade[reg] ?? 0) + r.stats.deliveredYear;
  }
  const secForces = s.security.forcesCombat;
  let incidents = 0;
  for (const reg of Object.keys(trade).sort()) {
    if (reg === 'earthOrbit') continue;
    let presence = secForces * 0.02;
    let pop = 0, poverty = 0;
    for (const st of settlementList(s)) {
      if (regionOf(st) !== reg) continue;
      presence += st.security * 0.3;
      const p = popOf(st);
      pop += p;
      poverty += (st.pop.unemployment + (1 - st.pop.wellbeing) * 0.5) * p;
    }
    for (const f of Object.values(s.fleets)) {
      if (f.patrolRegion !== reg) continue;
      const d = s.designs[f.designId];
      if (d) presence += designStats(s, d).combatRating * f.count * 0.5;
    }
    const lawless = clamp(1 - presence / Math.max(5, Math.log10(1 + trade[reg]) * 6), 0, 1);
    const pov = pop > 0 ? poverty / pop : 0;
    const risk = pop < 2000 ? 0 : clamp(0.004 * Math.log10(1 + trade[reg]) * lawless * (0.5 + pov) * Math.min(1, pop / 50000), 0, 0.25);
    s.security.piracy[reg] = s.security.piracy[reg] * 0.8 + risk * 0.2 || risk;
    if (risk > 0.001) {
      for (const sh of s.shipments) {
        const d = s.settlements[sh.to];
        if (!d || regionOf(d) !== reg) continue;
        if (rand(s, 'piracy') < risk * 0.3) {
          for (const g in sh.goods) sh.goods[g] *= 0.6;
          incidents++;
        }
      }
    }
  }
  s.security.incidentsYear = s.security.incidentsYear * (11 / 12) + incidents;
  if (incidents > 0) s.events.flags.piracyIncident = s.day;
}

function tensionMonthly(s: GameState): void {
  const m = mods(s);
  let griev = 0, n = 0;
  for (const id in s.nations) {
    griev += s.nations[id].grievances;
    n++;
  }
  const avgG = n ? griev / n : 0;
  const legit = s.une.metrics.legitimacy ?? 0.6;
  const target = clamp(0.15 + avgG * 0.3 + (1 - legit) * 0.3 + (m.tension ?? 0) + s.earth.climateStress * 0.15 + ((s.events.flags.resourceScramble as number) ?? 0) * 0.1, 0, 1);
  s.security.tension += (target - s.security.tension) * 0.03 + gaussian(s, 'tension') * 0.005;
  s.security.tension = clamp(s.security.tension, 0, 1);
  // Wars
  if (s.security.wars.length === 0 && s.security.tension > 0.72 && chance(s, 'tension', (s.security.tension - 0.72) * 0.012)) {
    const ids = Object.keys(s.nations).sort();
    let worst: [string, string] | null = null;
    let wv = Infinity;
    for (const a of ids) for (const b of ids) {
      if (a >= b) continue;
      const v = s.nations[a].relations[b] ?? 0;
      if (v < wv) { wv = v; worst = [a, b]; }
    }
    if (worst && wv < -0.2) {
      s.security.wars.push({ id: nextId(s, 'war'), a: worst[0], b: worst[1], startDay: s.day, intensity: 0.5 });
      addHistory(s, `War between ${s.nations[worst[0]].short} and ${s.nations[worst[1]].short}`, `Diplomacy collapses and fighting breaks out between ${s.nations[worst[0]].name} and ${s.nations[worst[1]].name}, including attacks on orbital infrastructure.`, 'security', 5, worst);
      s.earth.orbitalObjects += 0.3;
      s.events.flags.warStarted = s.day;
    }
  }
  for (const w of s.security.wars) {
    w.intensity = clamp(w.intensity + gaussian(s, 'tension') * 0.05 - 0.02 * (legit - 0.4), 0, 1);
    if (w.intensity > 0.97 && s.security.tension > 0.9 && !s.laws.arms_control && chance(s, 'tension', 0.02)) {
      s.gameOver = { day: s.day, reason: `The war between ${s.nations[w.a].name} and ${s.nations[w.b].name} escalated to a general nuclear exchange.`, title: 'Global Nuclear War' };
      addHistory(s, 'Global nuclear war', s.gameOver.reason, 'disaster', 5);
    }
  }
  const ended = s.security.wars.filter((w) => w.intensity < 0.05 || s.day - w.startDay > 365 * 4);
  for (const w of ended) {
    addHistory(s, `Ceasefire between ${s.nations[w.a].short} and ${s.nations[w.b].short}`, 'An armistice ends the fighting after UNE mediation.', 'security', 3, [w.a, w.b]);
    s.nations[w.a].relations[w.b] = 0;
    s.nations[w.b].relations[w.a] = 0;
  }
  s.security.wars = s.security.wars.filter((w) => !ended.includes(w));
}

function aiRiskMonthly(s: GameState): void {
  const m = mods(s);
  const auto = (s.events.flags.globalAutomation as number) ?? 1;
  const drivers = (s.tech.machine_cognition?.known ? 0.0025 : 0) + (s.tech.self_replicating_industry?.known ? 0.0012 : 0) + Math.max(0, auto - 3) * 0.0004 + (m.aiRisk ?? 0) * 0.02;
  const oversight = (s.une.institutions.aiBoard?.active ? s.une.institutions.aiBoard.effectiveness * 0.003 : 0) + 0.0015;
  const mult = Math.max(0.2, 1 + (m.aiRiskMult ?? 0));
  s.security.aiRisk = clamp(s.security.aiRisk + drivers * mult - oversight, 0.01, 1);
  if (s.security.aiRisk > 0.92 && chance(s, 'ai', (s.security.aiRisk - 0.92) * 0.04)) {
    s.gameOver = { day: s.day, reason: 'Autonomous systems across the Solar System pursued goals that no human institution could correct or stop. Humanity lost control of its own civilization.', title: 'Severe AI Catastrophe' };
    addHistory(s, 'AI catastrophe', s.gameOver.reason, 'disaster', 5);
  }
  void earthGDP;
}
