// Research: UNE programs, national science commons, corporate R&D and diffusion.
import type { GameState } from '../types';
import { TECHS, TECH, techCost } from '../content/techs';
import { DESIGN_TEMPLATES } from '../content/templates';
import { CORP_TEMPLATES } from '../content/actors';
import { mods, invalidateModifiers } from './modifiers';
import { addHistory, addAlert, credit } from './helpers';
import { createDesignFromTemplate } from './factory';
import { BD, setExplain } from '../core/breakdown';
import { chance, pick } from '../core/rng';
import { spawnCorporation } from './corporations';

export function availableTechs(s: GameState): string[] {
  return TECHS.filter((t) => !s.tech[t.id]?.known && t.prereqs.every((p) => s.tech[p]?.known)).map((t) => t.id);
}

export function researchRates(s: GameState): { une: number; commons: number; labs: number; compute: number; total: number } {
  const m = mods(s);
  const mult = 1 + (m.researchMult ?? 0);
  const isd = s.une.institutions.isd;
  const funding = isd?.active ? s.une.funding.isd ?? 0 : 0;
  const corruption = s.une.metrics.corruption ?? 0.12;
  const une = (funding / 2.5e7) * (1 - corruption * 0.3) * mult;
  let commons = 0;
  const share = 0.22 * (1 + (m.researchCommons ?? 0));
  for (const id in s.nations) {
    const n = s.nations[id];
    if (!n.member) continue;
    commons += n.science * share * (0.6 + n.uneSupport * 0.6);
  }
  commons *= mult;
  let labs = 0;
  for (const id in s.settlements) labs += s.settlements[id].science;
  labs *= mult;
  const compute = s.swarm.computeW * 2e-13 * (1 + (m.computeResearch ?? 0));
  return { une, commons, labs, compute, total: une + commons + labs + compute };
}

export function researchMonthly(s: GameState): void {
  const r = researchRates(s);
  const bd = new BD('RP/yr', 'Research points available to UNE programs.');
  bd.add('ISD budget', r.une).add('National science commons', r.commons).add('Settlement laboratories', r.labs);
  if (r.compute > 0) bd.add('Helios swarm computing', r.compute);
  setExplain(s, 'research.rate', bd);
  let rp = r.total / 12;
  s.research.rpMonth = rp;
  s.research.rpLastYear = r.total;
  // Allocate to queue
  s.research.queue = s.research.queue.filter((id) => TECH[id] && !s.tech[id]?.known);
  let guard = 0;
  while (rp > 1e-6 && guard++ < 10) {
    let target = s.research.queue.find((id) => TECH[id].prereqs.every((p) => s.tech[p]?.known));
    if (!target) {
      const avail = availableTechs(s).sort((a, b) => techCost(TECH[a]) - techCost(TECH[b]) || (a < b ? -1 : 1));
      target = avail[0];
      if (!target) break;
    }
    const t = s.tech[target];
    const need = techCost(TECH[target]) - t.progress;
    const use = Math.min(need, rp);
    t.progress += use;
    rp -= use;
    if (t.progress >= techCost(TECH[target]) - 1e-6) completeTech(s, target, undefined);
  }
  // Diffusion from independent national research (world science)
  let world = 0;
  for (const id in s.nations) world += s.nations[id].science * 0.25;
  world /= 12;
  const avail = availableTechs(s).filter((id) => !s.research.queue.includes(id)).sort((a, b) => techCost(TECH[a]) - techCost(TECH[b]) || (a < b ? -1 : 1));
  if (avail.length) {
    const target = avail[0];
    s.tech[target].progress += world;
    if (s.tech[target].progress >= techCost(TECH[target])) completeTech(s, target, undefined, 'World research');
  }
  corporateResearch(s);
}

function corporateResearch(s: GameState): void {
  const m = mods(s);
  const sectorCats: Record<string, string[]> = {
    launch: ['propulsion', 'orbital'],
    logistics: ['propulsion', 'computing'],
    habitat: ['orbital', 'lifeSupport'],
    mining: ['manufacturing', 'robotics'],
    manufacturing: ['manufacturing', 'materials', 'robotics'],
    energy: ['energy', 'nuclear'],
    biotech: ['medicine', 'genetics', 'lifeSupport'],
    ai: ['computing', 'robotics'],
    dyson: ['megastructure', 'energy'],
  };
  for (const id of Object.keys(s.corporations).sort()) {
    const c = s.corporations[id];
    if (!c.alive) continue;
    const budget = Math.max(0, c.revenue) * 0.05 * (1 + (m.corpRnD ?? 0));
    if (budget <= 0) continue;
    const rp = budget / 1.5e7 / 12;
    const cats = sectorCats[c.sector] ?? ['manufacturing'];
    const avail = availableTechs(s).filter((t) => cats.includes(TECH[t].category)).sort((a, b) => techCost(TECH[a]) - techCost(TECH[b]) || (a < b ? -1 : 1));
    const target = avail[0];
    if (!target) continue;
    const prog = ((c as any).techProgress ??= {}) as Record<string, number>;
    prog[target] = (prog[target] ?? 0) + rp;
    if (prog[target] >= techCost(TECH[target]) * 0.8) {
      delete prog[target];
      completeTech(s, target, c.id);
    }
  }
}

export function completeTech(s: GameState, id: string, corp: string | undefined, via?: string): void {
  const t = s.tech[id];
  const def = TECH[id];
  if (!t || t.known) return;
  t.known = true;
  t.knownDay = s.day;
  t.progress = techCost(def);
  const m = mods(s);
  if (corp && !(m.researchCommons > 0)) {
    t.owner = corp;
    t.licensees = [];
    const c = s.corporations[corp];
    if (c) {
      c.techs.push(id);
      c.reputation = Math.min(1, c.reputation + 0.02);
    }
  }
  invalidateModifiers();
  const owner = corp ? s.corporations[corp]?.name : undefined;
  if (def.tier >= 3 || corp) {
    addHistory(s, `Breakthrough: ${def.name}`, `${owner ? `${owner} develops` : via ? `${via} delivers` : 'UNE research delivers'} ${def.name}. ${def.description}${t.owner ? ' The technology is proprietary.' : ''}`, 'science', def.tier >= 7 ? 4 : def.tier >= 5 ? 3 : 2, [id]);
  }
  addAlert(s, 'info', `Technology acquired: ${def.name}${t.owner ? ` (proprietary: ${owner})` : ''}`, id);
  s.events.flags.newTech = { id, day: s.day };
  // Design bureaus publish standard designs
  for (const tpl of DESIGN_TEMPLATES) {
    if (tpl.techs.length && tpl.techs.includes(id) && tpl.techs.every((x) => s.tech[x]?.known)) createDesignFromTemplate(s, tpl.id, 'public');
  }
  // New industries spawn new corporations
  for (const tpl of CORP_TEMPLATES) {
    if (tpl.tech === id && chance(s, 'corps', 0.8)) spawnCorporation(s, tpl.sector, pick(s, 'corps', tpl.names), tpl.focus);
  }
}

export function licenseTech(s: GameState, techId: string): { ok: boolean; error?: string } {
  const t = s.tech[techId];
  if (!t?.known || !t.owner) return { ok: false, error: 'This technology is not proprietary.' };
  const fee = techCost(TECH[techId]) * 4e6;
  if (s.une.treasury < fee) return { ok: false, error: 'Insufficient treasury for the license fee.' };
  s.une.treasury -= fee;
  s.une.expenseYTD['Technology licenses'] = (s.une.expenseYTD['Technology licenses'] ?? 0) + fee;
  credit(s, t.owner, fee, 'License fees');
  t.owner = undefined;
  addHistory(s, `${TECH[techId].name} licensed for common use`, `The UNE buys a universal license for ${TECH[techId].name}.`, 'science', 1, [techId]);
  return { ok: true };
}
