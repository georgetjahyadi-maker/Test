// Grand engineering projects.
import type { GameState, CommandResult } from '../types';
import { GRAND_PROJECT } from '../content/misc';
import { SITE } from '../content/sites';
import { nextId } from '../core/util';
import { invalidateModifiers } from './modifiers';
import { addHistory, debit, known, actorFunds } from './helpers';
import { price } from './settlements';

export function projectAvailability(s: GameState, defId: string, settlementId?: string): { ok: boolean; reason?: string } {
  const def = GRAND_PROJECT[defId];
  if (!def) return { ok: false, reason: 'Unknown project.' };
  if (!known(s, def.tech)) return { ok: false, reason: `Requires ${def.tech.replace(/_/g, ' ')}.` };
  if (!def.repeatable && s.grandProjects.some((g) => g.defId === defId)) return { ok: false, reason: 'Already built or under way.' };
  if (def.bodies) {
    const st = settlementId ? s.settlements[settlementId] : undefined;
    if (!st || !def.bodies.includes(SITE[st.siteId].body)) return { ok: false, reason: `Must be built at a settlement on ${def.bodies.join(' or ')}.` };
  }
  if (actorFunds(s, 'une') < def.cost * 0.25 && !s.une.bondsAuthorized) return { ok: false, reason: 'Insufficient funds for the first tranche.' };
  return { ok: true };
}

export function startGrandProject(s: GameState, defId: string, settlementId?: string): CommandResult {
  const av = projectAvailability(s, defId, settlementId);
  if (!av.ok) return { ok: false, error: av.reason };
  const def = GRAND_PROJECT[defId];
  s.grandProjects.push({ id: nextId(s, 'gp'), defId, settlementId: def.bodies ? settlementId : undefined, startedDay: s.day, progress: 0, materials: { ...def.materials }, materialsTotal: { ...def.materials }, paid: 0 });
  addHistory(s, `${def.name} begins`, `Work begins on the ${def.name}. ${def.description}`, 'project', 3);
  return { ok: true };
}

export function grandProjectsMonthly(s: GameState): void {
  for (const gp of s.grandProjects) {
    if (gp.completedDay !== undefined) continue;
    const def = GRAND_PROJECT[gp.defId];
    if (!def) continue;
    const perMonth = 1 / def.months;
    let ratio = 1;
    const st = gp.settlementId ? s.settlements[gp.settlementId] : undefined;
    if (st) {
      for (const g in gp.materialsTotal) {
        const want = Math.min(gp.materials[g] ?? 0, gp.materialsTotal[g] * perMonth);
        if (want <= 0) continue;
        ratio = Math.min(ratio, (st.stock[g] ?? 0) / want);
      }
      ratio = Math.max(0, Math.min(1, ratio));
      for (const g in gp.materialsTotal) {
        const amt = Math.min(gp.materials[g] ?? 0, gp.materialsTotal[g] * perMonth * ratio);
        st.stock[g] = (st.stock[g] ?? 0) - amt;
        gp.materials[g] -= amt;
        debit(s, 'une', amt * price(s, st, g), 'Grand projects');
        st.economy.treasury += amt * price(s, st, g);
      }
      gp.stalled = ratio < 0.99 ? 'Waiting for materials' : undefined;
    }
    // Money is paid as work actually advances
    const tranche = Math.min(def.cost * perMonth * ratio, Math.max(0, def.cost - gp.paid));
    debit(s, 'une', tranche, 'Grand projects');
    gp.paid += tranche;
    gp.progress = Math.min(1, gp.progress + perMonth * ratio);
    if (gp.progress >= 0.999) {
      gp.completedDay = s.day;
      invalidateModifiers();
      addHistory(s, `${def.name} completed`, `${def.name} is complete. ${def.effectsText}`, 'project', 4);
      s.events.flags.recentSuccess = ((s.events.flags.recentSuccess as number) ?? 0) + 1;
    }
  }
}
