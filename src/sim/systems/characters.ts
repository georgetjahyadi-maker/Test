import type { Character, GameState } from '../types';
import { NAME_POOLS } from '../content/misc';
import { rand, pick, randInt, gaussian, chance } from '../core/rng';
import { nextId, clamp } from '../core/util';
import { yearFrac } from '../core/time';
import { FACTION } from '../content/actors';
import { mod } from './modifiers';
import { addHistory } from './helpers';

const BACKGROUNDS: Record<string, string[]> = {
  sg: ['Former foreign minister', 'Career diplomat', 'Former prime minister', 'Constitutional lawyer', 'Former astronaut and senator', 'Economist and central banker'],
  council: ['Diplomat', 'Economist', 'Engineer', 'Former governor', 'Labor organizer', 'Former admiral', 'Physician', 'Planetary scientist'],
  leader: ['Career politician', 'Former mayor', 'Economist', 'Union leader', 'Former general', 'Lawyer', 'Entrepreneur', 'Physician'],
  ceo: ['Aerospace engineer', 'Investment banker', 'Mining engineer', 'Company founder', 'Operations executive', 'Former astronaut'],
  governor: ['Base commander', 'Mission engineer', 'Colonial administrator', 'Physician', 'Mining engineer', 'Local organizer'],
  scientist: ['Astrophysicist', 'Materials scientist', 'Plasma physicist', 'Geneticist', 'Roboticist', 'Planetary geologist'],
  judge: ['Constitutional judge', 'International lawyer'],
  admiral: ['Planetary Defense commander', 'Fleet admiral'],
};

export function makeName(s: GameState, culture: string): string {
  const pool = NAME_POOLS[culture] ?? NAME_POOLS.mixed;
  const given = pick(s, 'names', pool.given);
  const family = pick(s, 'names', pool.family);
  return `${given} ${family}`;
}

export function makeCharacter(
  s: GameState,
  role: string,
  opts: { culture?: string; nationId?: string; factionId?: string; ideology?: number[]; roleRef?: string; ageMin?: number; ageMax?: number; background?: string } = {},
): Character {
  const culture = opts.culture ?? (opts.nationId ? s.nations[opts.nationId]?.nameCulture : undefined) ?? 'mixed';
  const age = randInt(s, 'characters', opts.ageMin ?? 40, opts.ageMax ?? 64);
  let ideology = opts.ideology;
  if (!ideology) {
    const base = opts.factionId ? FACTION[opts.factionId]?.axes ?? [0, 0, 0, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0, 0];
    ideology = base.map((v) => clamp(v * 0.8 + gaussian(s, 'characters') * 0.2, -1, 1));
  }
  const bgList = BACKGROUNDS[role] ?? BACKGROUNDS.council;
  const sk = () => randInt(s, 'characters', 2, 10);
  const c: Character = {
    id: nextId(s, 'ch'),
    name: makeName(s, culture),
    born: yearFrac(s.day) - age - rand(s, 'characters'),
    role,
    roleRef: opts.roleRef,
    nationId: opts.nationId,
    factionId: opts.factionId,
    skills: { admin: sk(), diplomacy: sk(), science: sk(), military: sk(), business: sk() },
    ideology,
    popularity: 0.4 + rand(s, 'characters') * 0.3,
    alive: true,
    background: opts.background ?? pick(s, 'characters', bgList),
  };
  s.characters[c.id] = c;
  return c;
}

export function ageOf(s: GameState, c: Character): number {
  return yearFrac(s.day) - c.born;
}

/** Annual mortality and retirement of named characters. */
export function charactersAnnual(s: GameState): void {
  const lifeBonus = mod(s, 'lifeExpectancy');
  for (const id of Object.keys(s.characters).sort()) {
    const c = s.characters[id];
    if (!c.alive) continue;
    const age = ageOf(s, c);
    const q = Math.min(0.9, 0.00018 * Math.exp(0.086 * (age - lifeBonus * 0.8)));
    let leaves = false;
    let reason = '';
    if (chance(s, 'characters', q)) {
      leaves = true;
      reason = 'died';
    } else if ((c.role === 'ceo' || c.role === 'council' || c.role === 'judge' || c.role === 'admiral' || c.role === 'scientist') && age > 72 + lifeBonus * 0.5 && chance(s, 'characters', 0.35)) {
      leaves = true;
      reason = 'retired';
    }
    if (!leaves) continue;
    if (reason === 'died') {
      c.alive = false;
      c.died = yearFrac(s.day);
    }
    handleVacancy(s, c, reason);
    if (reason === 'retired') {
      c.role = 'retired';
    }
  }
  // Prune long-dead minor characters to keep saves small
  const cutoff = yearFrac(s.day) - 60;
  for (const id of Object.keys(s.characters)) {
    const c = s.characters[id];
    if (!c.alive && (c.died ?? 0) < cutoff && c.role !== 'sg') delete s.characters[id];
  }
}

function handleVacancy(s: GameState, c: Character, reason: string): void {
  const verb = reason === 'died' ? 'has died' : 'has retired';
  switch (c.role) {
    case 'sg': {
      const fac = s.une.coalition[0] ?? 'federalists';
      const nc = makeCharacter(s, 'sg', { factionId: fac, ageMin: 50, ageMax: 68 });
      s.une.sgId = nc.id;
      addHistory(s, `Secretary-General ${c.name} ${verb}`, `${c.name} ${verb} in office. The Assembly confirms ${nc.name} (${FACTION[fac]?.name ?? fac}) as Secretary-General.`, 'politics', 3, [c.id, nc.id]);
      break;
    }
    case 'council': {
      const idx = s.une.councilIds.indexOf(c.id);
      const fac = c.factionId ?? s.une.coalition[0] ?? 'federalists';
      const nc = makeCharacter(s, 'council', { factionId: fac });
      if (idx >= 0) s.une.councilIds[idx] = nc.id;
      break;
    }
    case 'leader': {
      const n = c.nationId ? s.nations[c.nationId] : undefined;
      if (n) {
        const nc = makeCharacter(s, 'leader', { nationId: n.id, ideology: n.ideology.map((v) => clamp(v + gaussian(s, 'characters') * 0.15, -1, 1)) });
        n.leaderId = nc.id;
        if (n.population > 2e8) addHistory(s, `${n.short}: leader ${verb}`, `${c.name}, leader of ${n.name}, ${verb}. ${nc.name} takes office.`, 'politics', 1, [n.id]);
      }
      break;
    }
    case 'ceo': {
      const corp = c.roleRef ? s.corporations[c.roleRef] : undefined;
      if (corp && corp.alive) {
        const nc = makeCharacter(s, 'ceo', { nationId: corp.home ?? undefined, roleRef: corp.id, factionId: 'corporate' });
        corp.ceoId = nc.id;
      }
      break;
    }
    case 'governor': {
      const st = c.roleRef ? s.settlements[c.roleRef] : undefined;
      if (st) {
        const nc = makeCharacter(s, 'governor', { roleRef: st.id, culture: 'offworld' });
        st.governorId = nc.id;
      }
      break;
    }
    case 'judge':
    case 'admiral':
    case 'scientist': {
      makeCharacter(s, c.role, { culture: 'mixed', roleRef: c.roleRef });
      break;
    }
  }
}

export function characterOf(s: GameState, id: string | undefined): Character | undefined {
  return id ? s.characters[id] : undefined;
}
