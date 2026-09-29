// Factions, public opinion, legitimacy, elections, government formation and
// colonial autonomy.
import type { GameState, Settlement } from '../types';
import { FACTION, AX } from '../content/actors';
import { LAW } from '../content/laws';
import { clamp, dot } from '../core/util';
import { gaussian, rand, chance } from '../core/rng';
import { dayFromCivil, yearOf } from '../core/time';
import { mods, mod } from './modifiers';
import { popOf, offworldPopulation, earthPopulation, addHistory, addAlert, STATUS_LABEL, settlementList, isIndependent } from './helpers';
import { makeCharacter } from './characters';
import { BD, setExplain } from '../core/breakdown';
import { lightDelaySeconds } from '../physics/orbits';
import { SITE } from '../content/sites';
import { dominantCulture } from './settlements';

// -----------------------------------------------------------------------------
// Faction support
// -----------------------------------------------------------------------------
export function initFactionSupport(s: GameState): void {
  for (const id of Object.keys(s.nations)) normalize(s.nations[id].factionSupport, s);
  for (const st of settlementList(s)) initSettlementFactions(s, st);
  computeFactionTotals(s);
}

export function initSettlementFactions(s: GameState, st: Settlement): void {
  const fs: Record<string, number> = {};
  let tot = 0;
  for (const k in st.sponsors) {
    const n = s.nations[k];
    const w = st.sponsors[k];
    if (n) {
      for (const f in n.factionSupport) fs[f] = (fs[f] ?? 0) + n.factionSupport[f] * w;
      tot += w;
    }
  }
  if (tot <= 0) Object.assign(fs, { expansionists: 0.25, industrialists: 0.2, science: 0.2, corporate: 0.15, federalists: 0.1, labor: 0.1 });
  if (s.factions.colonial.active) fs.colonial = (fs.colonial ?? 0) + 0.05;
  st.politics.factionSupport = fs;
  normalize(st.politics.factionSupport, s);
}

function normalize(fs: Record<string, number>, s: GameState): void {
  let t = 0;
  for (const k in fs) {
    if (!s.factions[k]?.active) {
      delete fs[k];
      continue;
    }
    fs[k] = Math.max(0, fs[k]);
    t += fs[k];
  }
  if (t <= 0) return;
  for (const k in fs) fs[k] /= t;
}

function computeFactionTotals(s: GameState): void {
  const totals: Record<string, number> = {};
  let pop = 0;
  for (const id in s.nations) {
    const n = s.nations[id];
    for (const f in n.factionSupport) totals[f] = (totals[f] ?? 0) + n.factionSupport[f] * n.population;
    pop += n.population;
  }
  for (const st of settlementList(s)) {
    const p = popOf(st);
    for (const f in st.politics.factionSupport) totals[f] = (totals[f] ?? 0) + st.politics.factionSupport[f] * p;
    pop += p;
  }
  for (const id in s.factions) s.factions[id].support = pop > 0 ? (totals[id] ?? 0) / pop : 0;
}

/** Global forces that push faction support up or down this month. */
function factionMomentum(s: GameState): Record<string, number> {
  const m = mods(s);
  const mo: Record<string, number> = {};
  const add = (f: string, v: number) => (mo[f] = (mo[f] ?? 0) + v);
  const legit = s.une.metrics.legitimacy ?? 0.6;
  add('federalists', (legit - 0.55) * 0.6);
  add('sovereigntists', (0.55 - legit) * 0.6);
  const growth = avgGrowth(s);
  add('labor', (0.02 - growth) * 6 + ((s.events.flags.globalUnemployment as number) ?? 0.05) * 2 - 0.1);
  add('corporate', (growth - 0.02) * 4 - (s.events.flags.corpScandal ? 0.3 : 0));
  add('security', s.security.threats.filter((t) => t.status === 'tracking' || t.status === 'mission').length * 0.08 + s.security.incidentsYear * 0.01 + s.security.wars.length * 0.3 - 0.05);
  add('preservationists', (s.earth.climateStress - 0.4) * 0.8 + (m.mercuryCap ?? 0) * 0.08);
  const off = offworldPopulation(s);
  add('expansionists', Math.log10(1 + off) * 0.03 - 0.05 + ((s.events.flags.recentMilestone as number) ?? 0) * 0.2);
  add('industrialists', Math.log10(1 + off) * 0.02 - 0.06);
  add('science', (s.research.rpMonth > 0 ? 0.02 : 0) - 0.01);
  add('decentralists', (s.une.emergency ? 0.3 : 0) + ((s.une.metrics.corruption ?? 0.1) - 0.1));
  add('machineIntegration', ((s.events.flags.globalAutomation as number) ?? 1) * 0.04 - 0.08);
  add('humanPreservation', (m.enhancementPermitted ?? 0) * 0.2 + (m.aiRisk ?? 0) * 0.5);
  add('transhumanists', (m.enhancementPermitted ?? 0) * 0.1 + 0.02);
  add('solarFederalists', (off / Math.max(1, off + earthPopulation(s))) * 2);
  return mo;
}

function avgGrowth(s: GameState): number {
  let g = 0, w = 0;
  for (const id in s.nations) {
    g += s.nations[id].gdpGrowth * s.nations[id].gdp;
    w += s.nations[id].gdp;
  }
  return w > 0 ? g / w : 0.02;
}

function activateFactions(s: GameState): void {
  const off = offworldPopulation(s);
  const total = off + earthPopulation(s);
  const activate = (id: string, why: string) => {
    const f = s.factions[id];
    if (f.active) return;
    f.active = true;
    f.founded = s.day;
    addHistory(s, `${f.name} founded`, `${why} ${f.description}`, 'politics', 2, [id]);
    // seed support
    for (const nid in s.nations) s.nations[nid].factionSupport[id] = 0.02;
    for (const st of settlementList(s)) st.politics.factionSupport[id] = 0.05;
  };
  const big = settlementList(s).some((st) => popOf(st) >= 300 && st.status !== 'outpost');
  if (big) activate('colonial', 'Settlers beyond Earth organize to demand a voice in the laws that govern them.');
  if (off / Math.max(1, total) > 0.002 || off > 2e6) activate('solarFederalists', 'A movement for a federation of all worlds takes shape.');
  if (s.tech.gene_therapy?.known) {
    activate('transhumanists', 'Gene therapy has opened the question of human enhancement.');
    activate('humanPreservation', 'Opponents of enhancement unite to defend a shared human nature.');
  }
  if (s.tech.industrial_ai?.known && ((s.events.flags.globalAutomation as number) ?? 1) >= 2.5) activate('machineIntegration', 'Advocates of human–machine partnership form a political movement.');
}

export function politicsMonthly(s: GameState): void {
  activateFactions(s);
  const mo = factionMomentum(s);
  // Nations
  for (const id of Object.keys(s.nations).sort()) {
    const n = s.nations[id];
    const fs = n.factionSupport;
    for (const f in s.factions) {
      if (!s.factions[f].active) continue;
      const cur = fs[f] ?? 0.01;
      const noise = gaussian(s, 'politics') * 0.02;
      fs[f] = cur * Math.exp((mo[f] ?? 0) * 0.05 + noise * 0.3);
    }
    normalize(fs, s);
    // Public opinion of the UNE
    const target = clamp(0.35 + (s.une.metrics.legitimacy ?? 0.6) * 0.3 + (fs.federalists ?? 0) - (fs.sovereigntists ?? 0) * 0.8 + (mod(s, 'citizenSupport')) - n.grievances * 0.2 + ((s.events.flags.recentMilestone as number) ?? 0) * 0.05, 0.05, 0.95);
    n.publicOpinion += (target - n.publicOpinion) * 0.04;
    // Government support: opinion, leader ideology, interests
    const leader = s.characters[n.leaderId];
    const fed = leader ? leader.ideology[AX.FED] : 0;
    const interest = lawInterestFor(s, id);
    const govTarget = clamp(n.publicOpinion * 0.6 + 0.2 + fed * 0.15 + interest * 0.15 - n.grievances * 0.3 + mod(s, 'stateSupport'), 0.02, 0.98);
    n.uneSupport += (govTarget - n.uneSupport) * 0.05;
    n.grievances = Math.max(0, n.grievances * 0.97);
    n.compliance = clamp(0.4 + n.uneSupport * 0.8, 0, 1);
    // Ideology drift toward faction mix
    for (let i = 0; i < n.ideology.length; i++) {
      let v = 0;
      for (const f in fs) v += fs[f] * (s.factions[f]?.axes[i] ?? 0);
      n.ideology[i] = clamp(n.ideology[i] + (v * 2.2 - n.ideology[i]) * 0.01, -1, 1);
    }
  }
  // Settlements
  for (const st of settlementList(s)) updateSettlementPolitics(s, st, mo);
  computeFactionTotals(s);
  updateLegitimacy(s);
  // Political capital
  const sec = s.une.institutions.secretariat?.effectiveness ?? 1;
  const sg = s.characters[s.une.sgId];
  const gain = 2.5 + 5 * (s.une.metrics.legitimacy ?? 0.5) * sec + (sg ? sg.skills.admin * 0.2 : 0);
  s.une.politicalCapital = Math.min(200, s.une.politicalCapital + gain);
  // Emergency expiry
  if (s.une.emergency && s.day >= s.une.emergency.expiresDay) endEmergency(s, 'expired');
}

function lawInterestFor(s: GameState, nationId: string): number {
  const n = s.nations[nationId];
  let v = 0;
  for (const id in s.laws) {
    const law = LAW[id];
    if (!law) continue;
    v += nationLawInterest(s, n.id, law.id) * 0.25;
  }
  return clamp(v, -1, 1);
}

export function nationLawInterest(s: GameState, nationId: string, lawId: string): number {
  const n = s.nations[nationId];
  const law = LAW[lawId];
  if (!n || !law) return 0;
  const i = law.interests;
  const perCap = n.gdp / n.population;
  const developing = perCap < 25000 ? 1 : perCap < 45000 ? 0.4 : -0.3;
  const spacefaring = clamp(n.spaceBudgetShare * 700 - 0.3, -0.5, 1);
  let corpShare = 0;
  for (const c of Object.values(s.corporations)) if (c.home === nationId && c.alive) corpShare += c.valuation;
  const corpTies = clamp(corpShare / 2e11, 0, 1);
  let v = 0;
  v += (i.earth ?? 0) * 0.6;
  v += (i.developing ?? 0) * developing;
  v += (i.spacefaring ?? 0) * spacefaring;
  v += (i.corporate ?? 0) * corpTies * 0.8;
  v += (i.labor ?? 0) * (n.factionSupport.labor ?? 0) * 2;
  v += (i.offworld ?? 0) * 0.1;
  return clamp(v, -1.5, 1.5);
}

function updateSettlementPolitics(s: GameState, st: Settlement, mo: Record<string, number>): void {
  const p = popOf(st);
  const fs = st.politics.factionSupport;
  const m = mods(s);
  if (Object.keys(fs).length === 0) initSettlementFactions(s, st);
  const site = SITE[st.siteId];
  const delayMin = lightDelaySeconds('earth', site.body, s.day) / 60;
  // Grievances
  const shortage = ((st.flags.shortO2 as number) ?? 0) + ((st.flags.shortWater as number) ?? 0) + ((st.flags.shortFood as number) ?? 0) * 0.5;
  const extracted = ((st.flags.extracted as number) ?? 0) / Math.max(1, p * 20000);
  const unrepresented = st.politics.represented || isIndependent(st) ? 0 : clamp(Math.log10(1 + p) / 6, 0, 1);
  const g = shortage * 2 + clamp(extracted, 0, 1) * 0.6 + unrepresented * 0.5 + st.pop.unemployment * 0.8 + (1 - st.pop.wellbeing) * 0.3;
  const gMod = 1 + (m.colonialGrievance ?? 0);
  st.politics.grievances = clamp(st.politics.grievances * 0.95 + g * 0.05 * gMod, 0, 2);
  // Local identity strengthens colonial and solar-federal factions
  const localShare = 1 - (st.pop.cultures.terran ?? 0);
  for (const f in s.factions) {
    if (!s.factions[f].active) continue;
    let v = (mo[f] ?? 0) * 0.6;
    if (f === 'colonial') v += st.politics.grievances * 0.6 + localShare * 0.4 + Math.min(1, delayMin / 20) * 0.3 - 0.2;
    if (f === 'solarFederalists') v += localShare * 0.2 + (st.politics.represented ? 0.2 : 0);
    if (f === 'sovereigntists') v -= 0.3;
    const cur = fs[f] ?? 0.01;
    fs[f] = cur * Math.exp(v * 0.05 + gaussian(s, 'politics') * 0.01);
  }
  normalize(fs, s);
  // Sentiment toward the UNE and autonomy pressure
  const fedSupport = (fs.federalists ?? 0) + (fs.solarFederalists ?? 0) * 0.5;
  const sentTarget = clamp(0.5 + fedSupport - (fs.colonial ?? 0) * 1.2 - st.politics.grievances * 0.4 + (st.economy.uneTransfer > 0 ? 0.05 : 0), -1, 1);
  st.politics.sentiment += (sentTarget - st.politics.sentiment) * 0.05;
  const self = clamp(st.closure, 0, 1);
  const sizeF = clamp(Math.log10(1 + p) / 6, 0, 1);
  const autonomy = clamp(sizeF * 0.35 + self * 0.25 + Math.min(1, delayMin / 30) * 0.15 + (fs.colonial ?? 0) * 0.6 + st.politics.grievances * 0.2 + localShare * 0.1 - (m.selfGovFramework ?? 0) * 0.05, 0, 1);
  st.politics.autonomy += (autonomy - st.politics.autonomy) * 0.05;
  st.politics.represented = !!(m.offworldRepresentation && p >= 1000) || st.status === 'member';
  const b = new BD('pressure', 'Autonomy pressure toward self-rule or independence.');
  b.add('Population scale', sizeF * 0.35).add('Industrial self-sufficiency', self * 0.25).add('Communication delay', Math.min(1, delayMin / 30) * 0.15).add('Colonial Autonomist support', (fs.colonial ?? 0) * 0.6).add('Grievances', st.politics.grievances * 0.2).add('Local identity', localShare * 0.1);
  setExplain(s, `set:${st.id}:autonomy`, b, st.politics.autonomy);
}

// -----------------------------------------------------------------------------
// Legitimacy
// -----------------------------------------------------------------------------
export function updateLegitimacy(s: GameState): void {
  const u = s.une;
  const m = mods(s);
  let ss = 0, sc = 0;
  let cs = 0, cp = 0;
  for (const id in s.nations) {
    const n = s.nations[id];
    if (!n.member) continue;
    ss += n.uneSupport * n.states;
    sc += n.states;
    cs += n.publicOpinion * n.population;
    cp += n.population;
  }
  for (const st of settlementList(s)) {
    if (isIndependent(st)) continue;
    const p = popOf(st);
    cs += clamp(0.5 + st.politics.sentiment * 0.5, 0, 1) * p;
    cp += p;
  }
  const stateSupport = sc > 0 ? ss / sc : 0.5;
  const citizenSupport = cp > 0 ? cs / cp : 0.5;
  let effSum = 0, effN = 0;
  for (const id in u.institutions) {
    const inst = u.institutions[id];
    if (!inst.active) continue;
    effSum += inst.effectiveness;
    effN++;
  }
  const effectiveness = effN > 0 ? effSum / effN : 1;
  const corruption = clamp((u.metrics.corruption ?? 0.12) + (0.12 * (1 + (m.corruption ?? 0)) - (u.metrics.corruption ?? 0.12)) * 0.05 + (u.emergency ? 0.002 : 0), 0.01, 0.8);
  const transparency = clamp(0.55 + (m.transparency ?? 0) - corruption * 0.4, 0, 1);
  const trust = clamp(0.35 + effectiveness * 0.3 + transparency * 0.25 - corruption * 0.5 + ((s.events.flags.recentSuccess as number) ?? 0) * 0.1 - ((s.events.flags.recentFailure as number) ?? 0) * 0.15 + (m.trust ?? 0), 0, 1);
  const stability = clamp((u.metrics.constitutionalStability ?? 0.75) + (0.75 + (m.stability ?? 0) - (u.metrics.constitutionalStability ?? 0.75)) * 0.03 - (u.emergency ? 0.004 : 0) - u.fragmentation * 0.01, 0, 1);
  const fiscal = clamp(0.5 + (u.treasury > 0 ? 0.2 : -0.2) - (u.debt / Math.max(1, annualRevenue(s))) * 0.1, 0, 1);
  const shares = Object.values(s.factions).filter((f) => f.active).map((f) => f.support);
  const hhi = shares.reduce((a, v) => a + v * v, 0);
  const polarization = clamp(1 - hhi * 4 + (m.polarization ?? 0), 0, 1) * 0.6 + (Math.abs((s.factions.federalists?.support ?? 0) - (s.factions.sovereigntists?.support ?? 0))) * 0.4;
  const bd = new BD('pts', 'Federal legitimacy: support from states and citizens, institutional trust and constitutional stability.');
  bd.add('State support × 0.35', stateSupport * 0.35).add('Citizen support × 0.35', citizenSupport * 0.35).add('Institutional trust × 0.2', trust * 0.2).add('Constitutional stability × 0.1', stability * 0.1);
  if (m.legitimacy) bd.add('Grand projects & prestige', m.legitimacy);
  const legitimacy = clamp(bd.total, 0, 1);
  setExplain(s, 'une.legitimacy', bd, legitimacy);
  const sb = new BD('pts', 'Average member-government support for the UNE (weighted by number of states).');
  for (const id of Object.keys(s.nations).sort()) {
    const n = s.nations[id];
    if (n.member) sb.add(`${n.short} (${n.states} states)`, (n.uneSupport * n.states) / Math.max(1, sc), id);
  }
  setExplain(s, 'une.stateSupport', sb, stateSupport);
  u.metrics = {
    ...u.metrics,
    legitimacy,
    stateSupport,
    citizenSupport,
    institutionalTrust: trust,
    federalCapacity: clamp(effectiveness * 0.6 + fiscal * 0.4, 0, 1.2),
    polarization,
    constitutionalStability: stability,
    corruption,
    transparency,
    bureaucraticEffectiveness: effectiveness,
    fiscalCapacity: fiscal,
    corporateInfluence: corpInfluence(s),
    militaryInfluence: clamp(0.1 + (s.factions.security?.support ?? 0) + (u.emergency ? 0.2 : 0), 0, 1),
    scientificInfluence: clamp(0.1 + (s.factions.science?.support ?? 0) * 2, 0, 1),
    regionalAutonomy: clamp(1 - (u.metrics.federalCapacity ?? 0.6) * 0.5 + u.fragmentation, 0, 1),
  };
  s.events.flags.recentSuccess = Math.max(0, ((s.events.flags.recentSuccess as number) ?? 0) * 0.9);
  s.events.flags.recentFailure = Math.max(0, ((s.events.flags.recentFailure as number) ?? 0) * 0.9);
  s.events.flags.recentMilestone = Math.max(0, ((s.events.flags.recentMilestone as number) ?? 0) * 0.9);
}

function corpInfluence(s: GameState): number {
  let v = 0;
  for (const c of Object.values(s.corporations)) if (c.alive) v += c.influence;
  return clamp((v / 5) * (1 + mod(s, 'corpInfluence')), 0, 1);
}

export function annualRevenue(s: GameState): number {
  let t = 0;
  for (const k in s.une.revenueLastYear) t += s.une.revenueLastYear[k];
  if (t <= 0) for (const k in s.une.revenueYTD) t += s.une.revenueYTD[k] * 12;
  return Math.max(t, 1e9);
}

// -----------------------------------------------------------------------------
// Assembly elections & government formation
// -----------------------------------------------------------------------------
interface Constituency {
  id: string;
  name: string;
  pop: number;
  support: Record<string, number>;
}

export function constituencies(s: GameState): Constituency[] {
  const list: Constituency[] = [];
  for (const id of Object.keys(s.nations).sort()) {
    const n = s.nations[id];
    if (!n.member) continue;
    list.push({ id, name: n.short, pop: n.population, support: n.factionSupport });
  }
  const m = mods(s);
  if (m.offworldRepresentation) {
    for (const st of settlementList(s)) {
      if (isIndependent(st)) continue;
      const p = popOf(st);
      if (p < 1000) continue;
      list.push({ id: st.id, name: st.name, pop: p, support: st.politics.factionSupport });
    }
  }
  return list;
}

export function apportion(s: GameState, cons: Constituency[], total: number): Record<string, number> {
  // Degressive proportionality: seats ∝ population^0.7, minimum 3
  const w = cons.map((c) => Math.pow(Math.max(1, c.pop), 0.7));
  const wsum = w.reduce((a, v) => a + v, 0);
  const out: Record<string, number> = {};
  let used = 0;
  cons.forEach((c, i) => {
    const seats = Math.max(3, Math.floor((w[i] / wsum) * total));
    out[c.id] = seats;
    used += seats;
  });
  // distribute remainder to largest weights
  const order = cons.map((c, i) => ({ id: c.id, w: w[i] })).sort((a, b) => b.w - a.w);
  let k = 0;
  while (used < total && order.length) {
    out[order[k % order.length].id]++;
    used++;
    k++;
  }
  return out;
}

export function runAssemblyElection(s: GameState, initial = false): void {
  const cons = constituencies(s);
  const u = s.une;
  const byCons = apportion(s, cons, u.assembly.total);
  const seats: Record<string, number> = {};
  let offSeats = 0;
  for (const c of cons) {
    const n = byCons[c.id];
    // Largest-remainder PR with noise
    const shares: [string, number][] = Object.keys(c.support).sort().map((f) => [f, Math.max(0, c.support[f] * (initial ? 1 : 1 + gaussian(s, 'elections') * 0.08))]);
    const tot = shares.reduce((a, [, v]) => a + v, 0) || 1;
    const alloc = shares.map(([f, v]) => ({ f, exact: (v / tot) * n, seats: Math.floor((v / tot) * n) }));
    let used = alloc.reduce((a, x) => a + x.seats, 0);
    alloc.sort((a, b) => b.exact - b.seats - (a.exact - a.seats));
    let i = 0;
    while (used < n && alloc.length) {
      alloc[i % alloc.length].seats++;
      used++;
      i++;
    }
    for (const a of alloc) seats[a.f] = (seats[a.f] ?? 0) + a.seats;
    if (s.settlements[c.id]) offSeats += n;
  }
  const prev = { ...u.assembly.seats };
  u.assembly.seats = seats;
  u.assembly.byConstituency = byCons;
  u.assembly.offworldSeats = offSeats;
  for (const f in s.factions) s.factions[f].seats = seats[f] ?? 0;
  u.lastElection = s.day;
  u.nextElection = dayFromCivil(yearOf(s.day) + 5, 5, 1);
  if (!initial) {
    const ranked = Object.keys(seats).sort((a, b) => seats[b] - seats[a]);
    const top = ranked.slice(0, 3).map((f) => `${FACTION[f]?.name ?? f} ${seats[f]}`).join(', ');
    const swing = ranked.map((f) => ({ f, d: (seats[f] ?? 0) - (prev[f] ?? 0) })).sort((a, b) => b.d - a.d)[0];
    addHistory(s, `Assembly of Humanity elections`, `Citizens elect a new Assembly. Leading factions: ${top}.${swing && swing.d > 10 ? ` ${FACTION[swing.f]?.name} gained ${swing.d} seats.` : ''}${offSeats > 0 ? ` Off-world constituencies return ${offSeats} members.` : ''}`, 'politics', 3);
    formGovernment(s, false);
  }
}

export function formGovernment(s: GameState, initial: boolean): void {
  const u = s.une;
  const seats = u.assembly.seats;
  const total = Object.values(seats).reduce((a, v) => a + v, 0);
  const ranked = Object.keys(seats).filter((f) => seats[f] > 0).sort((a, b) => seats[b] - seats[a] || (a < b ? -1 : 1));
  if (ranked.length === 0) return;
  const lead = ranked[0];
  const coalition = [lead];
  let have = seats[lead];
  const leadAxes = s.factions[lead].axes;
  const rest = ranked.slice(1).sort((a, b) => distance(s.factions[a].axes, leadAxes) - distance(s.factions[b].axes, leadAxes));
  for (const f of rest) {
    if (have > total / 2) break;
    coalition.push(f);
    have += seats[f];
  }
  u.coalition = coalition;
  // Secretary-General
  const old = s.characters[u.sgId];
  let sgFaction = lead;
  if (u.directSG) {
    // popular vote: faction with highest global support among the largest three
    sgFaction = Object.keys(s.factions).filter((f) => s.factions[f].active).sort((a, b) => s.factions[b].support - s.factions[a].support)[0] ?? lead;
  }
  const keep = !initial && old?.alive && old.factionId === sgFaction && chance(s, 'elections', 0.6);
  if (!keep) {
    const sg = makeCharacter(s, 'sg', { factionId: sgFaction, ageMin: 50, ageMax: 68 });
    u.sgId = sg.id;
    if (!initial) addHistory(s, `${sg.name} becomes Secretary-General`, `${sg.name} (${FACTION[sgFaction]?.name}), ${sg.background.toLowerCase()}, leads a coalition of ${coalition.map((f) => FACTION[f]?.short).join('–')}.`, 'politics', 3, [sg.id]);
  }
  // Executive Council: 7 seats across coalition
  const council: string[] = [];
  for (let i = 0; i < 7; i++) {
    const f = coalition[i % coalition.length];
    const existing = u.councilIds.map((id) => s.characters[id]).find((c) => c && c.alive && c.factionId === f && !council.includes(c.id));
    if (existing && !initial && chance(s, 'elections', 0.5)) council.push(existing.id);
    else council.push(makeCharacter(s, 'council', { factionId: f }).id);
  }
  u.councilIds = council;
}

function distance(a: number[], b: number[]): number {
  let t = 0;
  for (let i = 0; i < a.length; i++) t += (a[i] - b[i]) ** 2;
  return Math.sqrt(t);
}

export function executiveAlignment(s: GameState, axes: number[]): number {
  const sg = s.characters[s.une.sgId];
  if (!sg) return 0;
  return clamp(dot(sg.ideology, axes) / Math.max(0.5, Math.sqrt(dot(axes, axes))), -1, 1);
}

// -----------------------------------------------------------------------------
// Emergency powers
// -----------------------------------------------------------------------------
export function declareEmergency(s: GameState, reason: string, days: number, powers: Record<string, 'limited' | 'shared' | 'exclusive'>): void {
  const u = s.une;
  if (u.emergency) {
    u.emergency.expiresDay = Math.max(u.emergency.expiresDay, s.day + days);
    return;
  }
  const previous: Record<string, any> = {};
  for (const k in powers) {
    previous[k] = u.competencies[k];
    u.competencies[k] = powers[k];
  }
  u.emergency = { reason, declaredDay: s.day, expiresDay: s.day + days, extensions: 0, powers, previous };
  const cost = mod(s, 'emergencyFramework') > 0 ? 0.01 : 0.03;
  u.metrics.constitutionalStability = clamp((u.metrics.constitutionalStability ?? 0.75) - cost, 0, 1);
  addHistory(s, 'State of emergency declared', `The Executive Council invokes emergency powers: ${reason}.`, 'constitution', 3);
  addAlert(s, 'warn', `Emergency powers in force: ${reason}`);
}

export function endEmergency(s: GameState, how: 'expired' | 'surrendered' | 'retained'): void {
  const u = s.une;
  const e = u.emergency;
  if (!e) return;
  if (how !== 'retained') {
    for (const k in e.previous) u.competencies[k] = e.previous[k];
    if (how === 'surrendered') {
      u.metrics.constitutionalStability = clamp((u.metrics.constitutionalStability ?? 0.7) + 0.03, 0, 1);
      s.events.flags.recentSuccess = ((s.events.flags.recentSuccess as number) ?? 0) + 0.5;
    }
    addHistory(s, 'Emergency powers end', how === 'surrendered' ? 'The Executive voluntarily surrenders its emergency powers. The Compact Court praises the restoration of normal order.' : 'Emergency powers lapse under their sunset clause.', 'constitution', 2);
  } else {
    u.metrics.constitutionalStability = clamp((u.metrics.constitutionalStability ?? 0.7) - 0.12, 0, 1);
    u.fragmentation = clamp(u.fragmentation + 0.05, 0, 1);
    for (const id in s.nations) s.nations[id].grievances += 0.2;
    addHistory(s, 'Emergency powers made permanent', 'The Executive keeps its emergency authority beyond the crisis. Critics call it a quiet constitutional revolution.', 'constitution', 4);
  }
  u.emergency = null;
}

// -----------------------------------------------------------------------------
// Colonial status
// -----------------------------------------------------------------------------
export function changeStatus(s: GameState, st: Settlement, status: Settlement['status'], cause: string): void {
  const prev = st.status;
  if (prev === status) return;
  st.status = status;
  st.statusSince = s.day;
  if (status === 'independent' || status === 'associated') {
    delete st.sponsors.une;
  }
  addHistory(s, `${st.name}: ${STATUS_LABEL[status]}`, `${st.name} becomes a${/^[AEIOU]/.test(STATUS_LABEL[status]) ? 'n' : ''} ${STATUS_LABEL[status]}. ${cause}`, 'colony', status === 'independent' || status === 'member' ? 4 : 3, [st.id]);
}

export function totalSeats(s: GameState): number {
  return Object.values(s.une.assembly.seats).reduce((a, v) => a + v, 0);
}

export function cultureName(id: string): string {
  const map: Record<string, string> = { terran: 'Terran', lunar: 'Lunar', martian: 'Martian', belt: 'Belter', mercurian: 'Mercurian', jovian: 'Jovian', saturnian: 'Saturnian', habitatBorn: 'Habitat-born', freeSpacer: 'Free Spacer' };
  return map[id] ?? id;
}

export { dominantCulture, rand };
