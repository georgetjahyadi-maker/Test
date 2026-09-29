// Bills, vote projection, votes, ratification and the effects of enacting laws.
import type { GameState, Bill, VoteTally, CommandResult, CompetencyLevel } from '../types';
import { LAW, LAWS } from '../content/laws';
import { LEVEL_RANK, AX, FACTION, INSTITUTION } from '../content/actors';
import { clamp, dot, norm, sigmoid, nextId } from '../core/util';
import { gaussian, rand } from '../core/rng';
import { mod, invalidateModifiers } from './modifiers';
import { addHistory, addAlert, offworldPopulation, earthPopulation, settlementList, popOf, known } from './helpers';
import { nationLawInterest, executiveAlignment, formGovernment } from './politics';
import { SITE } from '../content/sites';

export function lawAvailable(s: GameState, lawId: string, action: 'enact' | 'repeal' = 'enact'): { ok: boolean; reason?: string } {
  const law = LAW[lawId];
  if (!law) return { ok: false, reason: 'Unknown law.' };
  if (s.bills.some((b) => b.lawId === lawId && b.stage !== 'done')) return { ok: false, reason: 'A bill on this law is already before the legislature.' };
  if (action === 'repeal') {
    if (!s.laws[lawId]) return { ok: false, reason: 'This law is not in force.' };
    if (!law.repealable) return { ok: false, reason: 'Constitutional amendments cannot be repealed by ordinary legislation.' };
    return { ok: true };
  }
  if (s.laws[lawId]) return { ok: false, reason: 'Already in force.' };
  const r = law.requires;
  if (r?.competency) {
    const [comp, lvl] = r.competency;
    if (LEVEL_RANK[s.une.competencies[comp] ?? 'national'] < LEVEL_RANK[lvl]) return { ok: false, reason: `Requires UNE competency “${comp}” at level ${lvl}. A constitutional amendment is needed.` };
  }
  if (r?.tech && !known(s, r.tech)) return { ok: false, reason: `Requires technology: ${r.tech.replace(/_/g, ' ')}.` };
  if (r?.laws) for (const l of r.laws) if (!s.laws[l]) return { ok: false, reason: `Requires ${LAW[l]?.name ?? l} to be in force first.` };
  if (r?.notLaws) for (const l of r.notLaws) if (s.laws[l]) return { ok: false, reason: `Incompatible with ${LAW[l]?.name ?? l}.` };
  if (r?.offworldShare) {
    const off = offworldPopulation(s);
    const share = off / Math.max(1, off + earthPopulation(s));
    if (share < r.offworldShare) return { ok: false, reason: `Requires ${(r.offworldShare * 100).toFixed(0)}% of humanity living off Earth (now ${(share * 100).toFixed(2)}%).` };
  }
  if (r?.condition) {
    const c = conditionMet(s, r.condition);
    if (!c.ok) return c;
  }
  if (law.amendment) {
    for (const k in law.amendment) {
      if (law.amendment[k] === (s.une.competencies[k] as CompetencyLevel) && Object.keys(law.amendment).length === 1 && k !== 'citizenship') return { ok: false, reason: 'The Compact already grants this power.' };
    }
  }
  return { ok: true };
}

function conditionMet(s: GameState, cond: string): { ok: boolean; reason?: string } {
  switch (cond) {
    case 'mercuryReached':
      return settlementList(s).some((st) => SITE[st.siteId].body === 'mercury') ? { ok: true } : { ok: false, reason: 'Requires a settlement on or around Mercury.' };
    case 'mercuryIndustrial':
      return s.laws.mercury_extensive || settlementList(s).some((st) => SITE[st.siteId].body === 'mercury' && popOf(st) > 1000) ? { ok: true } : { ok: false, reason: 'Requires the Mercury Industrial Charter or a large Mercury settlement.' };
    case 'offworldPopulation':
      return offworldPopulation(s) >= 20000 ? { ok: true } : { ok: false, reason: 'Requires at least 20,000 people living off Earth.' };
    default:
      return { ok: true };
  }
}

export function proposalCost(s: GameState, lawId: string, action: 'enact' | 'repeal'): number {
  const law = LAW[lawId];
  const align = executiveAlignment(s, action === 'repeal' ? law.axes.map((v) => -v) : law.axes);
  return Math.round(law.capitalCost * (1.35 - 0.45 * align));
}

export function proposeBill(s: GameState, lawId: string, action: 'enact' | 'repeal', sponsor = 'executive'): CommandResult {
  const av = lawAvailable(s, lawId, action);
  if (!av.ok) return { ok: false, error: av.reason };
  const law = LAW[lawId];
  const cost = sponsor === 'executive' ? proposalCost(s, lawId, action) : 0;
  if (s.une.politicalCapital < cost) return { ok: false, error: `Needs ${cost} political capital (you have ${Math.floor(s.une.politicalCapital)}).` };
  s.une.politicalCapital -= cost;
  const debate = law.amendment ? 120 : 60;
  const b: Bill = { id: nextId(s, 'bill'), lawId, action, proposedDay: s.day, voteDay: s.day + debate, stage: 'debate', lobbying: {}, pledges: {}, sponsor };
  s.bills.push(b);
  b.tally = projectVote(s, b);
  return { ok: true, id: b.id };
}

export function projectVote(s: GameState, bill: Bill): VoteTally {
  const law = LAW[bill.lawId];
  const dir = bill.action === 'repeal' ? -1 : 1;
  const axes = law.axes.map((v) => v * dir);
  const an = Math.max(0.3, norm(axes));
  const byNation: Record<string, number> = {};
  const reasons: Record<string, string> = {};
  let yesStates = 0, totalStates = 0, yesPop = 0, totalPop = 0;
  let allYes = true;
  const corpInf = (s.une.metrics.corporateInfluence ?? 0.3) * (1 + mod(s, 'corpInfluence'));
  for (const id of Object.keys(s.nations).sort()) {
    const n = s.nations[id];
    if (!n.member) continue;
    const ideo = dot(n.ideology, axes) / an;
    const interest = nationLawInterest(s, id, law.id) * dir;
    const fedPush = axes[AX.FED] * (n.uneSupport - 0.5) * 0.8 + axes[AX.FED] * n.integrationPref * 0.3;
    const lobby = (bill.lobbying[id] ?? 0) * 0.12;
    const pledge = Math.min(0.35, (bill.pledges[id] ?? 0) / Math.max(1, n.gdp * 0.0004));
    const corp = (law.interests.corporate ?? 0) * dir * corpInf * 0.25;
    const score = ideo * 0.35 + interest * 0.45 + fedPush + lobby + pledge + corp + 0.05;
    const p = sigmoid(4 * score);
    byNation[id] = p;
    const parts: [string, number][] = [['ideology', ideo * 0.35], ['national interest', interest * 0.45], ['view of the UNE', fedPush], ['lobbying', lobby + pledge], ['corporate pressure', corp]];
    parts.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    reasons[id] = parts.slice(0, 2).map(([k, v]) => `${v >= 0 ? '+' : '−'} ${k}`).join(', ');
    totalStates += n.states;
    totalPop += n.population;
    const yesShare = n.states > 1 ? p : p >= 0.5 ? 1 : 0;
    yesStates += n.states * yesShare;
    yesPop += n.population * yesShare;
    if (p < 0.5) allYes = false;
  }
  const byFaction: Record<string, number> = {};
  let yes = 0, total = 0;
  const coalition = new Set(s.une.coalition);
  for (const f of Object.keys(s.une.assembly.seats).sort()) {
    const seats = s.une.assembly.seats[f];
    if (!seats) continue;
    const fa = s.factions[f];
    const ideo = dot(fa.axes, axes) / an;
    let special = 0;
    const i = law.interests;
    if (f === 'colonial' || f === 'solarFederalists') special += (i.offworld ?? 0) * dir * 0.6;
    if (f === 'labor') special += (i.labor ?? 0) * dir * 0.6;
    if (f === 'corporate') special += (i.corporate ?? 0) * dir * 0.6;
    if (f === 'sovereigntists') special += (i.earth ?? 0) * dir * 0.4;
    const disc = coalition.has(f) && bill.sponsor === 'executive' ? 0.18 : 0;
    const lobby = (bill.lobbying[f] ?? 0) * 0.12;
    const p = sigmoid(4.5 * (ideo * 0.6 + special + disc + lobby + 0.02));
    byFaction[f] = p;
    yes += seats * p;
    total += seats;
  }
  const nt = law.nationsThreshold;
  const stateShare = totalStates > 0 ? yesStates / totalStates : 0;
  const popShare = totalPop > 0 ? yesPop / totalPop : 0;
  let nPassed = false;
  if (nt === 'simple') nPassed = stateShare > 0.5;
  else if (nt === 'qualified') nPassed = stateShare >= 0.55 && popShare >= 0.65;
  else if (nt === 'super') nPassed = stateShare >= 2 / 3 && popShare >= 0.6;
  else nPassed = allYes;
  const at = law.assemblyThreshold;
  const aShare = total > 0 ? yes / total : 0;
  const aPassed = at === 'super' ? aShare >= 2 / 3 : aShare > 0.5;
  return {
    nations: { yesStates, noStates: totalStates - yesStates, totalStates, yesPop, totalPop, passed: nPassed, threshold: nt },
    assembly: { yes, no: total - yes, total, passed: aPassed, threshold: at },
    byNation,
    byFaction,
    reasons,
  };
}

function holdVote(s: GameState, b: Bill): void {
  const law = LAW[b.lawId];
  const proj = projectVote(s, b);
  // Actual vote: noisy around projections
  let yesStates = 0, totalStates = 0, yesPop = 0, totalPop = 0;
  let allYes = true;
  for (const id of Object.keys(proj.byNation).sort()) {
    const n = s.nations[id];
    const p = clamp(proj.byNation[id] + gaussian(s, 'votes') * 0.06, 0, 1);
    const share = n.states > 1 ? p : rand(s, 'votes') < p ? 1 : 0;
    yesStates += n.states * share;
    yesPop += n.population * share;
    totalStates += n.states;
    totalPop += n.population;
    if (share < 0.5) allYes = false;
    proj.byNation[id] = share;
  }
  let yes = 0, total = 0;
  for (const f in proj.byFaction) {
    const seats = s.une.assembly.seats[f] ?? 0;
    const p = clamp(proj.byFaction[f] + gaussian(s, 'votes') * 0.05, 0, 1);
    yes += seats * p;
    total += seats;
  }
  const nt = law.nationsThreshold;
  const ss = totalStates ? yesStates / totalStates : 0;
  const ps = totalPop ? yesPop / totalPop : 0;
  const nPassed = nt === 'simple' ? ss > 0.5 : nt === 'qualified' ? ss >= 0.55 && ps >= 0.65 : nt === 'super' ? ss >= 2 / 3 && ps >= 0.6 : allYes;
  const aShare = total ? yes / total : 0;
  const aPassed = law.assemblyThreshold === 'super' ? aShare >= 2 / 3 : aShare > 0.5;
  b.tally = { ...proj, nations: { ...proj.nations, yesStates, noStates: totalStates - yesStates, yesPop, passed: nPassed }, assembly: { ...proj.assembly, yes, no: total - yes, passed: aPassed } };
  const verb = b.action === 'repeal' ? 'Repeal of ' : '';
  if (nPassed && aPassed) {
    if (law.amendment && b.action === 'enact') {
      b.stage = 'ratification';
      b.ratifyDeadline = s.day + 365;
      b.ratifications = {};
      addHistory(s, `${law.name} passes the legislature`, `Both chambers approve ${law.name}. It now goes to member states for ratification.`, 'constitution', 3);
      addAlert(s, 'info', `${law.name} sent to member states for ratification`);
    } else {
      b.stage = 'done';
      b.result = 'passed';
      if (b.action === 'enact') enactLaw(s, law.id, b);
      else repealLaw(s, law.id);
    }
  } else {
    b.stage = 'done';
    b.result = 'failed';
    const why = !nPassed && !aPassed ? 'both chambers' : !nPassed ? 'the Chamber of Nations' : 'the Assembly of Humanity';
    addHistory(s, `${verb}${law.name} defeated`, `The bill fails in ${why} (${(ss * 100).toFixed(0)}% of states, ${(aShare * 100).toFixed(0)}% of the Assembly).`, 'politics', 2);
    addAlert(s, 'warn', `${verb}${law.name} was defeated in ${why}`);
    s.events.flags.recentFailure = ((s.events.flags.recentFailure as number) ?? 0) + 0.2;
  }
}

function ratify(s: GameState, b: Bill): void {
  const law = LAW[b.lawId];
  let yesStates = 0, total = 0, yesPop = 0, totalPop = 0;
  const proj = projectVote(s, b);
  for (const id of Object.keys(s.nations).sort()) {
    const n = s.nations[id];
    if (!n.member) continue;
    const p = clamp(proj.byNation[id] * 0.9 + n.publicOpinion * 0.15 + gaussian(s, 'votes') * 0.05, 0, 1);
    const share = n.states > 1 ? p : rand(s, 'votes') < p ? 1 : 0;
    b.ratifications![id] = share >= 0.5;
    yesStates += n.states * share;
    total += n.states;
    yesPop += n.population * share;
    totalPop += n.population;
  }
  b.stage = 'done';
  if (yesStates / Math.max(1, total) >= 2 / 3 && yesPop / Math.max(1, totalPop) >= 0.6) {
    b.result = 'ratified';
    enactLaw(s, law.id, b);
  } else {
    b.result = 'rejected';
    addHistory(s, `${law.name} fails ratification`, `Only ${((yesStates / Math.max(1, total)) * 100).toFixed(0)}% of member states ratify ${law.name}. The amendment dies.`, 'constitution', 3);
    addAlert(s, 'warn', `${law.name} failed ratification`);
    s.events.flags.recentFailure = ((s.events.flags.recentFailure as number) ?? 0) + 0.3;
  }
}

export function legislatureDaily(s: GameState): void {
  for (const b of s.bills) {
    if (b.stage === 'debate' && s.day >= b.voteDay) holdVote(s, b);
    else if (b.stage === 'ratification' && s.day >= (b.ratifyDeadline ?? 0)) ratify(s, b);
  }
  // refresh projections occasionally and prune old bills
  if (s.day % 7 === 0) {
    for (const b of s.bills) if (b.stage === 'debate') b.tally = projectVote(s, b);
    const cutoff = s.day - 365 * 3;
    s.bills = s.bills.filter((b) => b.stage !== 'done' || b.voteDay > cutoff);
  }
}

export function enactLaw(s: GameState, lawId: string, b?: Bill): void {
  const law = LAW[lawId];
  if (!law) return;
  // Mutually exclusive groups
  if (law.group) {
    for (const other of LAWS) {
      if (other.id !== lawId && other.group === law.group && s.laws[other.id]) delete s.laws[other.id];
    }
  }
  s.laws[lawId] = { id: lawId, enactedDay: s.day };
  if (law.amendment) {
    for (const k in law.amendment) {
      const lvl = law.amendment[k];
      if (s.une.emergency && s.une.emergency.previous[k] !== undefined) s.une.emergency.previous[k] = lvl;
      s.une.competencies[k] = lvl;
    }
  }
  const activate = (inst: string) => {
    const i = s.une.institutions[inst];
    if (i && !i.active) {
      i.active = true;
      i.founded = s.day;
      s.une.funding[inst] = INSTITUTION[inst]?.baseFunding ?? 1e9;
      addHistory(s, `${i.name} established`, `${i.name} begins operations. ${i.description}`, 'institution', 2);
    }
  };
  switch (lawId) {
    case 'security_forces': activate('securityForces'); break;
    case 'energy_trust': activate('energyTrust'); break;
    case 'mercury_extensive':
    case 'mercury_disassembly': activate('mercuryAuthority'); break;
    case 'ai_oversight': activate('aiBoard'); break;
    case 'bond_authority': s.une.bondsAuthorized = true; break;
    case 'une_citizenship': s.une.citizenship = 'dual'; break;
    case 'amd_direct_sg': s.une.directSG = true; break;
    case 'amd_solar_compact':
      activate('councilWorlds');
      s.une.constitution = 'Solar Compact';
      s.une.upperHouse = 'Council of Worlds';
      s.une.lowerHouse = "People's Assembly";
      s.une.citizenship = 'une';
      s.events.flags.renamePending = true;
      break;
    case 'amd_devolution':
      s.une.fragmentation = clamp(s.une.fragmentation + 0.1, 0, 1);
      break;
  }
  invalidateModifiers();
  const how = b?.result === 'ratified' ? 'is ratified and enters into force' : 'enters into force';
  addHistory(s, `${law.name} ${law.amendment ? 'ratified' : 'enacted'}`, `${law.name} ${how}. ${law.description}`, law.amendment ? 'constitution' : 'law', law.amendment ? 4 : 2, [lawId]);
  // Reactions: strongly opposed member states accumulate grievances
  for (const id of Object.keys(s.nations).sort()) {
    const n = s.nations[id];
    const interest = nationLawInterest(s, id, lawId);
    if (interest < -0.4) n.grievances += Math.abs(interest) * 0.3;
    if (interest > 0.4) n.uneSupport = clamp(n.uneSupport + 0.02, 0, 1);
  }
  s.events.flags.lastLaw = { id: lawId, day: s.day };
}

export function repealLaw(s: GameState, lawId: string): void {
  const law = LAW[lawId];
  if (!s.laws[lawId]) return;
  delete s.laws[lawId];
  if (lawId === 'bond_authority') s.une.bondsAuthorized = false;
  if (lawId === 'une_citizenship') s.une.citizenship = 'national';
  invalidateModifiers();
  addHistory(s, `${law?.name ?? lawId} repealed`, `The legislature repeals ${law?.name ?? lawId}.`, 'law', 2, [lawId]);
}

export function lobby(s: GameState, billId: string, target: string): CommandResult {
  const b = s.bills.find((x) => x.id === billId);
  if (!b || b.stage !== 'debate') return { ok: false, error: 'No such bill in debate.' };
  const cost = 8;
  if (s.une.politicalCapital < cost) return { ok: false, error: `Lobbying needs ${cost} political capital.` };
  if ((b.lobbying[target] ?? 0) >= 3) return { ok: false, error: 'Further lobbying of this delegation would backfire.' };
  s.une.politicalCapital -= cost;
  b.lobbying[target] = (b.lobbying[target] ?? 0) + 1;
  b.tally = projectVote(s, b);
  return { ok: true };
}

export function pledge(s: GameState, billId: string, nationId: string, amount: number): CommandResult {
  const b = s.bills.find((x) => x.id === billId);
  if (!b || b.stage !== 'debate') return { ok: false, error: 'No such bill in debate.' };
  if (!s.nations[nationId]) return { ok: false, error: 'Unknown member state.' };
  if (s.une.treasury < amount) return { ok: false, error: 'Insufficient treasury.' };
  s.une.treasury -= amount;
  s.une.expenseYTD['Legislative concessions'] = (s.une.expenseYTD['Legislative concessions'] ?? 0) + amount;
  s.nations[nationId].spaceFunds += amount;
  b.pledges[nationId] = (b.pledges[nationId] ?? 0) + amount;
  b.tally = projectVote(s, b);
  return { ok: true };
}

export function withdrawBill(s: GameState, billId: string): CommandResult {
  const b = s.bills.find((x) => x.id === billId);
  if (!b || b.stage !== 'debate') return { ok: false, error: 'No such bill in debate.' };
  b.stage = 'done';
  b.result = 'withdrawn';
  return { ok: true };
}

export { FACTION, formGovernment };
