// The command API: every state change requested by the player goes through here.
import type { GameState, CommandResult, CollectorDesign, Settlement } from './types';
import { FACILITY } from './content/facilities';
import { COMPONENT, STRUCTURE } from './content/components';
import { TECH } from './content/techs';
import { INSTITUTION } from './content/actors';
import { nextId, clamp } from './core/util';
import { createDesign, createRoute } from './systems/factory';
import { proposeBill, lobby, pledge, withdrawBill } from './systems/legislature';
import { resolveEvent } from './systems/events';
import { launchDeflection } from './systems/security';
import { licenseTech } from './systems/research';
import { foundSettlement, grantStatus } from './systems/colonies';
import { declareEmergency, endEmergency } from './systems/politics';
import { startGrandProject } from './systems/projects';
import { invest, orderShips } from './ai/actions';
import { invalidateModifiers } from './systems/modifiers';
import { addHistory, credit } from './systems/helpers';
import { computeDesignStats } from './physics/engineering';
import { collectorStats } from './systems/dyson';

export type Command =
  | { type: 'setFunding'; institution: string; amount: number }
  | { type: 'setDelegation'; domain: string; value: boolean }
  | { type: 'setResearchQueue'; queue: string[] }
  | { type: 'proposeBill'; lawId: string; action: 'enact' | 'repeal' }
  | { type: 'lobby'; billId: string; target: string }
  | { type: 'pledge'; billId: string; nationId: string; amount: number }
  | { type: 'withdrawBill'; billId: string }
  | { type: 'build'; settlementId: string; facility: string; count: number }
  | { type: 'cancelConstruction'; settlementId: string; projectId: string }
  | { type: 'toggleFacility'; settlementId: string; groupId: string; enabled: boolean }
  | { type: 'foundSettlement'; siteId: string; name?: string }
  | { type: 'grantStatus'; settlementId: string; status: Settlement['status'] }
  | { type: 'renameSettlement'; settlementId: string; name: string }
  | { type: 'setFamilies'; settlementId: string; allowed: boolean }
  | { type: 'createDesign'; name: string; structure: string; components: Record<string, number> }
  | { type: 'retireDesign'; designId: string }
  | { type: 'orderShips'; designId: string; count: number; shipyard: string; routeId?: string }
  | { type: 'createRoute'; origin: string; destination: string; mode: 'supply' | 'export' | 'both'; name?: string }
  | { type: 'deleteRoute'; routeId: string }
  | { type: 'setRoute'; routeId: string; mode?: 'supply' | 'export' | 'both'; priority?: number; active?: boolean }
  | { type: 'assignFleet'; fleetId: string; routeId: string | null; count?: number }
  | { type: 'patrol'; fleetId: string; region: string | null }
  | { type: 'scrapFleet'; fleetId: string }
  | { type: 'resolveEvent'; instanceId: string; optionId: string }
  | { type: 'deflect'; threatId: string; method: string }
  | { type: 'licenseTech'; techId: string }
  | { type: 'declareEmergency'; reason: string }
  | { type: 'endEmergency' }
  | { type: 'saveCollectorDesign'; design: Omit<CollectorDesign, 'id' | 'created' | 'owner'> & { id?: string } }
  | { type: 'setActiveCollector'; designId: string }
  | { type: 'startProject'; projectId: string; settlementId?: string }
  | { type: 'setAutoPause'; category: string; value: boolean }
  | { type: 'repayDebt'; amount: number }
  | { type: 'issueBonds'; amount: number };

export function applyCommand(s: GameState, cmd: Command): CommandResult {
  if (s.gameOver && cmd.type !== 'setAutoPause') return { ok: false, error: 'The campaign has ended.' };
  switch (cmd.type) {
    case 'setFunding': {
      const inst = s.une.institutions[cmd.institution];
      if (!inst?.active) return { ok: false, error: 'Unknown or inactive institution.' };
      s.une.funding[cmd.institution] = clamp(cmd.amount, 0, (INSTITUTION[cmd.institution]?.baseFunding ?? 1e9) * 50);
      return { ok: true };
    }
    case 'setDelegation':
      s.une.delegation[cmd.domain] = cmd.value;
      return { ok: true };
    case 'setResearchQueue':
      s.research.queue = cmd.queue.filter((id) => TECH[id] && !s.tech[id]?.known).slice(0, 12);
      return { ok: true };
    case 'proposeBill':
      return proposeBill(s, cmd.lawId, cmd.action);
    case 'lobby':
      return lobby(s, cmd.billId, cmd.target);
    case 'pledge':
      return pledge(s, cmd.billId, cmd.nationId, cmd.amount);
    case 'withdrawBill':
      return withdrawBill(s, cmd.billId);
    case 'build': {
      const st = s.settlements[cmd.settlementId];
      if (!st) return { ok: false, error: 'Unknown settlement.' };
      if (!FACILITY[cmd.facility]) return { ok: false, error: 'Unknown facility.' };
      const n = Math.max(1, Math.min(1e12, Math.floor(cmd.count)));
      return invest(s, 'une', st, cmd.facility, n);
    }
    case 'cancelConstruction': {
      const st = s.settlements[cmd.settlementId];
      if (!st) return { ok: false, error: 'Unknown settlement.' };
      const p = st.construction.find((x) => x.id === cmd.projectId);
      if (!p) return { ok: false, error: 'No such project.' };
      if (p.owner !== 'une') return { ok: false, error: 'You can only cancel UNE projects.' };
      st.construction = st.construction.filter((x) => x.id !== p.id);
      credit(s, 'une', p.paid * (1 - p.progress) * 0.5, 'Cancelled projects');
      return { ok: true };
    }
    case 'toggleFacility': {
      const st = s.settlements[cmd.settlementId];
      const g = st?.facilities.find((f) => f.id === cmd.groupId);
      if (!g) return { ok: false, error: 'Unknown facility group.' };
      if (g.owner !== 'une') return { ok: false, error: 'You can only operate UNE-owned facilities.' };
      g.enabled = cmd.enabled;
      return { ok: true };
    }
    case 'foundSettlement':
      return foundSettlement(s, cmd.siteId, 'une', cmd.name?.trim() || undefined);
    case 'grantStatus':
      return grantStatus(s, cmd.settlementId, cmd.status);
    case 'renameSettlement': {
      const st = s.settlements[cmd.settlementId];
      if (!st) return { ok: false, error: 'Unknown settlement.' };
      const name = cmd.name.trim().slice(0, 40);
      if (!name) return { ok: false, error: 'Name required.' };
      st.name = name;
      return { ok: true };
    }
    case 'setFamilies': {
      const st = s.settlements[cmd.settlementId];
      if (!st) return { ok: false, error: 'Unknown settlement.' };
      st.flags.familiesBanned = !cmd.allowed;
      return { ok: true };
    }
    case 'createDesign': {
      if (!STRUCTURE[cmd.structure]) return { ok: false, error: 'Unknown structure.' };
      const comps: Record<string, number> = {};
      for (const k in cmd.components) if (COMPONENT[k] && cmd.components[k] > 0) comps[k] = Math.min(64, Math.floor(cmd.components[k]));
      const stats = computeDesignStats({ structure: cmd.structure, components: comps });
      const name = cmd.name.trim().slice(0, 40) || 'Untitled design';
      const d = createDesign(s, name, 'une', cmd.structure, comps, stats.role);
      return { ok: true, id: d.id };
    }
    case 'retireDesign': {
      const d = s.designs[cmd.designId];
      if (!d) return { ok: false, error: 'Unknown design.' };
      d.obsolete = true;
      return { ok: true };
    }
    case 'orderShips':
      return orderShips(s, 'une', cmd.designId, Math.max(1, Math.min(200, Math.floor(cmd.count))), cmd.shipyard, cmd.routeId);
    case 'createRoute': {
      const o = s.settlements[cmd.origin], d = s.settlements[cmd.destination];
      if (!o || !d) return { ok: false, error: 'Choose an origin and a destination.' };
      if (o.id === d.id) return { ok: false, error: 'Origin and destination must differ.' };
      const r = createRoute(s, cmd.name?.trim() || `${o.name} → ${d.name}`, 'une', o.id, d.id, cmd.mode, 3);
      return { ok: true, id: r.id };
    }
    case 'deleteRoute': {
      const r = s.routes[cmd.routeId];
      if (!r) return { ok: false, error: 'Unknown route.' };
      if (r.owner !== 'une') return { ok: false, error: 'You can only manage UNE routes.' };
      for (const f of Object.values(s.fleets)) if (f.routeId === r.id) f.routeId = undefined;
      delete s.routes[r.id];
      return { ok: true };
    }
    case 'setRoute': {
      const r = s.routes[cmd.routeId];
      if (!r) return { ok: false, error: 'Unknown route.' };
      if (r.owner !== 'une') return { ok: false, error: 'You can only manage UNE routes.' };
      if (cmd.mode) r.mode = cmd.mode;
      if (cmd.priority !== undefined) r.priority = clamp(Math.round(cmd.priority), 0, 9);
      if (cmd.active !== undefined) r.active = cmd.active;
      return { ok: true };
    }
    case 'assignFleet': {
      const f = s.fleets[cmd.fleetId];
      if (!f) return { ok: false, error: 'Unknown fleet.' };
      if (f.owner !== 'une') return { ok: false, error: 'You can only assign UNE ships.' };
      if (cmd.routeId && !s.routes[cmd.routeId]) return { ok: false, error: 'Unknown route.' };
      const n = cmd.count !== undefined ? Math.max(1, Math.min(f.count, Math.floor(cmd.count))) : f.count;
      if (n < f.count) {
        f.count -= n;
        const nf = { ...f, id: nextId(s, 'flt'), count: n, routeId: cmd.routeId ?? undefined, patrolRegion: undefined };
        s.fleets[nf.id] = nf;
      } else {
        f.routeId = cmd.routeId ?? undefined;
        f.patrolRegion = undefined;
      }
      return { ok: true };
    }
    case 'patrol': {
      const f = s.fleets[cmd.fleetId];
      if (!f || f.owner !== 'une') return { ok: false, error: 'Unknown UNE fleet.' };
      f.patrolRegion = (cmd.region ?? undefined) as any;
      if (cmd.region) f.routeId = undefined;
      return { ok: true };
    }
    case 'scrapFleet': {
      const f = s.fleets[cmd.fleetId];
      if (!f || f.owner !== 'une') return { ok: false, error: 'Unknown UNE fleet.' };
      delete s.fleets[f.id];
      return { ok: true };
    }
    case 'resolveEvent':
      return resolveEvent(s, cmd.instanceId, cmd.optionId);
    case 'deflect':
      return launchDeflection(s, cmd.threatId, cmd.method);
    case 'licenseTech':
      return licenseTech(s, cmd.techId);
    case 'declareEmergency': {
      if (s.une.emergency) return { ok: false, error: 'An emergency is already in force.' };
      if (s.une.politicalCapital < 40) return { ok: false, error: 'Declaring an emergency needs 40 political capital.' };
      s.une.politicalCapital -= 40;
      declareEmergency(s, cmd.reason || 'Executive declaration', 365, { militaryCommand: 'shared', offworldMigration: 'exclusive', resourcePolicy: 'exclusive' });
      return { ok: true };
    }
    case 'endEmergency':
      if (!s.une.emergency) return { ok: false, error: 'No emergency in force.' };
      endEmergency(s, 'surrendered');
      return { ok: true };
    case 'saveCollectorDesign': {
      const id = cmd.design.id && s.swarm.designs[cmd.design.id] ? cmd.design.id : nextId(s, 'col');
      const d: CollectorDesign = { ...cmd.design, id, owner: 'une', created: s.day } as CollectorDesign;
      d.radiusAU = clamp(d.radiusAU, 0.05, 1.5);
      d.areaM2 = clamp(d.areaM2, 1e3, 1e10);
      d.radiatorRatio = clamp(d.radiatorRatio, 0, 4);
      d.computeFraction = clamp(d.computeFraction, 0, 1);
      s.swarm.designs[id] = d;
      const cs = collectorStats(s, d);
      if (!s.swarm.activeDesign && cs.errors.length === 0) s.swarm.activeDesign = id;
      return { ok: true, id };
    }
    case 'setActiveCollector': {
      const d = s.swarm.designs[cmd.designId];
      if (!d) return { ok: false, error: 'Unknown collector design.' };
      const cs = collectorStats(s, d);
      if (cs.errors.length) return { ok: false, error: cs.errors[0] };
      if (cs.techMissing.length) return { ok: false, error: `Requires ${cs.techMissing.join(', ')}` };
      s.swarm.activeDesign = d.id;
      addHistory(s, `Collector production switches to ${d.name}`, `All fabrication lines now build the ${d.name} design.`, 'dyson', 1);
      return { ok: true };
    }
    case 'startProject':
      return startGrandProject(s, cmd.projectId, cmd.settlementId);
    case 'setAutoPause':
      s.settings.autoPause[cmd.category] = cmd.value;
      return { ok: true };
    case 'repayDebt': {
      const amt = Math.min(cmd.amount, s.une.debt, Math.max(0, s.une.treasury));
      if (amt <= 0) return { ok: false, error: 'Nothing to repay.' };
      s.une.debt -= amt;
      s.une.treasury -= amt;
      return { ok: true };
    }
    case 'issueBonds': {
      if (!s.une.bondsAuthorized) return { ok: false, error: 'Requires the Federal Borrowing Authority Act.' };
      const amt = Math.max(0, cmd.amount);
      s.une.debt += amt;
      s.une.treasury += amt;
      s.une.revenueYTD['Bond issuance'] = (s.une.revenueYTD['Bond issuance'] ?? 0) + amt;
      return { ok: true };
    }
    default:
      return { ok: false, error: 'Unknown command.' };
  }
}

export { invalidateModifiers };
