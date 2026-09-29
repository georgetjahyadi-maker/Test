import React, { useMemo, useState } from 'react';
import { useGame, run, toast } from '../../client/client';
import { Panel, PageTitle, Tabs, PixelCanvas } from '../components';
import { COMPONENTS, COMPONENT, STRUCTURES, STRUCTURE } from '../../sim/content/components';
import { DESIGN_TEMPLATES } from '../../sim/content/templates';
import { TECH } from '../../sim/content/techs';
import { G0 } from '../../sim/content/bodies';
import { fmtNum, fmtMoney, fmtPct, fmtTonnes, fmtPower, fmtSci } from '../../sim/core/format';
import { formatDate } from '../../sim/core/time';
import { actorName } from '../../sim/systems/helpers';
import { computeDesignStats, planRoute } from '../../sim/physics/engineering';
import { getGraph } from '../../sim/physics/deltav';
import { designStats, refuelPredicate } from '../../sim/systems/designs';
import { mod } from '../../sim/systems/modifiers';
import { collectorMods } from '../../sim/systems/dyson';
import { computeCollectorStats, CELL_TYPES, COLLECTOR_STRUCTURES, TRANSMISSION, STATION_KEEPING, REPAIR } from '../../sim/physics/dysonCalc';
import { shipSprite } from '../../render/ships';
import { makeCanvas, ctx2d } from '../../render/pixel';
import { PlanView } from './LogisticsPanel';
import type { CollectorDesign, ComponentCategory, GameState } from '../../sim/types';

type Tab = 'designer' | 'designs' | 'collectors';

interface Draft {
  name: string;
  structure: string;
  components: Record<string, number>;
}

const CATEGORY_ORDER: { id: ComponentCategory; label: string }[] = [
  { id: 'propulsion', label: 'Propulsion' },
  { id: 'tank', label: 'Tanks' },
  { id: 'power', label: 'Power' },
  { id: 'thermal', label: 'Thermal' },
  { id: 'habitation', label: 'Habitation' },
  { id: 'shielding', label: 'Shielding' },
  { id: 'cargo', label: 'Cargo' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'communication', label: 'Communication' },
  { id: 'docking', label: 'Docking' },
  { id: 'aero', label: 'Aero' },
  { id: 'weapon', label: 'Weapons' },
  { id: 'sensor', label: 'Sensors' },
];

export function EngineeringPanel() {
  const [tab, setTab] = useState<Tab>('designer');
  const [draft, setDraft] = useState<Draft>({ name: 'New design', structure: 'aluminium', components: { eng_methalox: 1, tank_small: 2, cargo_bay: 1, nav_auto: 1, comm_radio: 1, dock_port: 1, pwr_solar: 1 } });
  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <PageTitle title="Engineering" sub="Designs obey the rocket equation, thermodynamics and orbital mechanics. Every number shown is computed, not assigned." />
      <Tabs tabs={[{ id: 'designer', label: 'Ship designer' }, { id: 'designs', label: 'Design registry' }, { id: 'collectors', label: 'Helios collectors' }]} value={tab} onChange={setTab} />
      {tab === 'designer' && <Designer draft={draft} setDraft={setDraft} />}
      {tab === 'designs' && <Designs onEdit={(d) => { setDraft(d); setTab('designer'); }} />}
      {tab === 'collectors' && <Collectors />}
    </div>
  );
}

function techName(id: string): string {
  return TECH[id]?.name ?? id.replace(/_/g, ' ');
}

function Designer({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) {
  const s = useGame()!;
  const knownCount = Object.values(s.tech).filter((t) => t.known).length;
  const known = (t: string) => !!s.tech[t]?.known;
  const stats = useMemo(() => computeDesignStats({ structure: draft.structure, components: draft.components }, known), [draft, knownCount]);
  const sprite = useMemo(() => shipSprite({ id: 'draft', structure: draft.structure, components: draft.components }), [draft.structure, draft.components]);
  const [cat, setCat] = useState<ComponentCategory>('propulsion');
  const set = (id: string, n: number) => {
    const c = { ...draft.components };
    if (n <= 0) delete c[id];
    else c[id] = Math.min(64, n);
    setDraft({ ...draft, components: c });
  };
  const nodes = useMemo(() => {
    const g = getGraph();
    return Object.values(g.nodes).sort((a, b) => a.label.localeCompare(b.label));
  }, []);
  const [from, setFrom] = useState('leo');
  const [to, setTo] = useState('llo');
  const plan = useMemo(() => planRoute(stats, from, to, {
    aerocaptureTech: known('aerocapture'),
    refuelAt: refuelPredicate(s, stats.propellantless ? null : stats.propType, from),
    beamNetworkW: s.swarm.transmittedW,
    reliabilityBonus: mod(s, 'reliability'),
  }), [stats, from, to, s.day - (s.day % 30)]);
  const wetFull = stats.dryMass + stats.propCapacity + stats.payload;
  const twr = (gs: number) => (wetFull > 0 ? stats.thrust / (wetFull * gs * G0) : 0);
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 360px) minmax(0, 1fr) minmax(0, 380px)' }}>
      <Panel title="Components" accent="science">
        <div className="row" style={{ marginBottom: 6 }}>
          <span className="small muted">Hull</span>
          <select value={draft.structure} onChange={(e) => setDraft({ ...draft, structure: e.target.value })}>
            {STRUCTURES.map((st) => <option key={st.id} value={st.id} disabled={!!st.tech && !known(st.tech)}>{st.name}{st.tech && !known(st.tech) ? ' (locked)' : ''}</option>)}
          </select>
        </div>
        <div className="tiny muted" style={{ marginBottom: 6 }}>{STRUCTURE[draft.structure]?.description} Structure mass {fmtPct(STRUCTURE[draft.structure]?.massFraction ?? 0, 1)} of components.</div>
        <div className="row" style={{ gap: 3, marginBottom: 6 }}>
          {CATEGORY_ORDER.map((c) => <button key={c.id} className={`btn small ${cat === c.id ? 'primary' : ''}`} onClick={() => setCat(c.id)}>{c.label}</button>)}
        </div>
        <div className="col" style={{ gap: 4, maxHeight: 520, overflow: 'auto' }}>
          {COMPONENTS.filter((c) => c.category === cat).map((c) => {
            const locked = !!c.tech && !known(c.tech);
            const n = draft.components[c.id] ?? 0;
            return (
              <div key={c.id} style={{ border: '1px solid var(--border)', padding: '5px 7px', opacity: locked ? 0.5 : 1, background: n > 0 ? '#101d2e' : undefined }}>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                  <span className="hl small" title={c.description}>{c.name}</span>
                  <span className="row" style={{ flexWrap: 'nowrap', gap: 3 }}>
                    <button className="btn small" disabled={n <= 0} onClick={() => set(c.id, n - 1)}>−</button>
                    <span style={{ minWidth: 18, textAlign: 'center' }}>{n}</span>
                    <button className="btn small" disabled={locked} onClick={() => set(c.id, n + 1)}>+</button>
                  </span>
                </div>
                <div className="tiny muted">{componentSummary(c.id)}</div>
                {locked && <div className="tiny warn">Requires {techName(c.tech!)}</div>}
              </div>
            );
          })}
        </div>
      </Panel>
      <div className="col" style={{ gap: 12 }}>
        <Panel title="Blueprint" accent="science" right={<span className="tag c-science">{stats.role}</span>}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: 10, background: '#05080d', border: '1px solid var(--border)' }}>
            <PixelCanvas source={sprite} scale={Math.max(2, Math.min(5, Math.floor(420 / Math.max(1, sprite.width))))} />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ flex: 1 }} />
            <button className="btn primary" disabled={stats.errors.length > 0} onClick={async () => { const r = await run({ type: 'createDesign', name: draft.name, structure: draft.structure, components: draft.components }); if (r.ok) toast(`Design registered: ${draft.name}`, 'ok'); }}>Register design</button>
            <select value="" onChange={(e) => {
              const t = DESIGN_TEMPLATES.find((x) => x.id === e.target.value);
              if (t) setDraft({ name: `${t.name} (variant)`, structure: t.structure, components: { ...t.components } });
            }}>
              <option value="">start from template…</option>
              {DESIGN_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {stats.errors.map((e, i) => <div key={i} className="note bad small" style={{ marginTop: 6 }}>{e}</div>)}
          {stats.techMissing.length > 0 && <div className="note warn small" style={{ marginTop: 6 }}>Uses technology not yet available: {stats.techMissing.map(techName).join(', ')}</div>}
          {stats.warnings.map((e, i) => <div key={i} className="note warn small" style={{ marginTop: 6 }}>{e}</div>)}
        </Panel>
        <Panel title="Route analysis" accent="science">
          <div className="row">
            <select value={from} onChange={(e) => setFrom(e.target.value)}>{nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}</select>
            <span className="muted">→</span>
            <select value={to} onChange={(e) => setTo(e.target.value)}>{nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}</select>
          </div>
          <PlanView plan={plan} />
          <div className="tiny muted" style={{ marginTop: 6 }}>Refuelling is assumed wherever an existing settlement stocks this design's propellant (the Earth hub always does).</div>
        </Panel>
      </div>
      <Panel title="Performance" accent="science">
        <div className="kv small">
          <span className="k">Dry mass</span><span className="v">{fmtTonnes(stats.dryMass)}</span>
          <span className="k">Propellant capacity</span><span className="v">{fmtTonnes(stats.propCapacity)} {stats.propType ?? ''}</span>
          <span className="k">Payload</span><span className="v">{fmtTonnes(stats.payload)}</span>
          <span className="k">Crew / passengers</span><span className="v">{stats.crew} / {stats.crew > 2 ? stats.crew - 2 : 0}</span>
          <span className="k">Wet mass (full)</span><span className="v">{fmtTonnes(wetFull)}</span>
          <span className="k">Specific impulse</span><span className="v">{fmtNum(stats.isp)} s</span>
          <span className="k">Exhaust velocity</span><span className="v">{stats.ve.toFixed(2)} km/s</span>
          <span className="k">Δv empty</span><span className="v hl">{stats.dvEmpty.toFixed(2)} km/s</span>
          <span className="k">Δv full load</span><span className="v hl">{stats.dvFull.toFixed(2)} km/s</span>
          <span className="k">Thrust</span><span className="v">{fmtNum(stats.thrust)} kN</span>
          <span className="k">Acceleration (full)</span><span className="v">{stats.accelFull < 0.01 ? `${(stats.accelFull * 1000).toFixed(2)} mm/s²` : `${stats.accelFull.toFixed(2)} m/s²`}</span>
          <span className="k">TWR on the Moon / Mars</span><span className="v">{twr(0.1654).toFixed(2)} / {twr(0.3794).toFixed(2)}</span>
          <span className="k">Low-thrust</span><span className="v">{stats.lowThrust ? 'yes (spirals, no landings)' : 'no'}</span>
          <span className="k">Power generated / needed</span><span className="v" style={{ color: stats.powerReq > stats.powerGen + 1e-9 ? 'var(--c-bad)' : undefined }}>{stats.powerGen.toFixed(2)} / {stats.powerReq.toFixed(2)} MW</span>
          <span className="k">Waste heat / radiators</span><span className="v" style={{ color: stats.heatGen > stats.radiatorCap + 1e-9 ? 'var(--c-bad)' : undefined }}>{stats.heatGen.toFixed(2)} / {stats.radiatorCap.toFixed(2)} MW</span>
          <span className="k">Aeroshell capacity</span><span className="v">{stats.aeroCapacity > 0 ? fmtTonnes(stats.aeroCapacity) : 'none'}</span>
          <span className="k">Crew endurance</span><span className="v">{Number.isFinite(stats.endurance) ? `${stats.endurance} days` : 'n/a'}</span>
          <span className="k">Spin gravity</span><span className="v">{stats.spinGravity ? 'yes' : 'no'}</span>
          <span className="k">Radiation shielding</span><span className="v">{fmtPct(stats.shielding, 0)}</span>
          <span className="k">Reliability per mission</span><span className="v">{fmtPct(stats.reliability, 2)}</span>
          <span className="k">Combat rating</span><span className="v">{stats.combatRating > 0 ? stats.combatRating.toFixed(1) : '—'}</span>
          <span className="k">Unit cost</span><span className="v">{fmtMoney(stats.cost)}</span>
          <span className="k">Cost incl. launch to LEO</span><span className="v">{fmtMoney(stats.cost + stats.dryMass * s.earth.launchPrice)}</span>
          <span className="k">Build time</span><span className="v">{Math.round(stats.buildMonths)} months</span>
          <span className="k">Maintenance</span><span className="v">{fmtMoney(stats.maintenancePerYear)}/yr</span>
        </div>
        <div className="hr" />
        <div className="tiny muted" style={{ marginBottom: 4 }}>MATERIALS TO BUILD ONE</div>
        <div className="small">{Object.entries(stats.goods).filter(([, v]) => v > 0.01).sort((a, b) => b[1] - a[1]).map(([g, v]) => `${g} ${fmtNum(v)} t`).join(' · ')}</div>
        <div className="hr" />
        <div className="tiny muted">Δv = vₑ · ln(m_wet / m_dry). Payload lowers Δv, and every tonne of propellant also has to be pushed. Engines, reactors and electronics all dump waste heat that radiators must reject.</div>
      </Panel>
    </div>
  );
}

function componentSummary(id: string): string {
  const c = COMPONENT[id];
  const p: string[] = [`${c.mass} t`, fmtMoney(c.cost)];
  if (c.thrust) p.push(`${fmtNum(c.thrust)} kN`);
  if (c.isp) p.push(c.isp >= 1e6 ? 'no propellant' : `Isp ${fmtNum(c.isp)} s`);
  if (c.propellant && (c.isp ?? 0) < 1e6) p.push(c.propellant);
  if (c.tankCapacity) p.push(`${c.tankCapacity} t ${c.tankType}`);
  if (c.powerGen) p.push(`+${c.powerGen} MW${c.solar ? ' @1 AU' : ''}`);
  if (c.powerReq) p.push(`−${c.powerReq} MW`);
  if (c.heat) p.push(`${c.heat} MW heat`);
  if (c.radiator) p.push(`rejects ${c.radiator} MW`);
  if (c.crew) p.push(`${c.crew} people, ${c.enduranceDays} d`);
  if (c.cargo) p.push(`${fmtNum(c.cargo)} t cargo`);
  if (c.navLevel) p.push(`nav L${c.navLevel}`);
  if (c.commRange) p.push(c.commRange);
  if (c.combat) p.push(`attack ${c.combat}`);
  if (c.defense) p.push(`defense ${c.defense}`);
  if (c.sensor) p.push(`sensor ${c.sensor}`);
  if (c.shielding) p.push(`${Math.round(c.shielding * 100)}% shield`);
  return p.join(' · ');
}

function Designs({ onEdit }: { onEdit: (d: Draft) => void }) {
  const s = useGame()!;
  const [show, setShow] = useState<'mine' | 'all'>('all');
  const list = Object.values(s.designs).filter((d) => show === 'all' || d.owner === 'une').sort((a, b) => Number(!!a.obsolete) - Number(!!b.obsolete) || b.created - a.created);
  const inService = (id: string) => Object.values(s.fleets).filter((f) => f.designId === id).reduce((a, f) => a + f.count, 0);
  return (
    <Panel title="Design registry" accent="science" right={<select value={show} onChange={(e) => setShow(e.target.value as any)}><option value="all">All designs</option><option value="mine">UNE designs</option></select>}>
      <table className="t">
        <thead><tr><th /><th>Design</th><th>Owner</th><th>Role</th><th className="n">Payload</th><th className="n">Crew</th><th className="n">Δv empty</th><th className="n">Unit cost</th><th className="n">In service</th><th>Registered</th><th /></tr></thead>
        <tbody>
          {list.map((d) => {
            const st = designStats(s, d);
            return (
              <tr key={d.id} style={{ opacity: d.obsolete ? 0.45 : 1 }}>
                <td><PixelCanvas source={shipSprite(d)} scale={1} /></td>
                <td className="hl">{d.name}{st.techMissing.length > 0 && <span className="tag c-warn" style={{ marginLeft: 6 }}>tech missing</span>}{st.errors.length > 0 && <span className="tag c-bad" style={{ marginLeft: 6 }}>invalid</span>}</td>
                <td className="muted">{d.owner === 'public' ? 'Public (design bureaus)' : actorName(s, d.owner)}</td>
                <td>{st.role}</td>
                <td className="n">{fmtNum(st.payload)} t</td>
                <td className="n">{st.crew || ''}</td>
                <td className="n">{st.dvEmpty.toFixed(1)} km/s</td>
                <td className="n">{fmtMoney(st.cost)}</td>
                <td className="n">{inService(d.id) || ''}</td>
                <td className="small muted">{formatDate(d.created)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn small" onClick={() => onEdit({ name: `${d.name} Mk II`, structure: d.structure, components: { ...d.components } })}>Derive</button>
                  {d.owner === 'une' && !d.obsolete && <button className="btn small danger" onClick={() => run({ type: 'retireDesign', designId: d.id })}>Retire</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Helios collector designer
// ---------------------------------------------------------------------------
type CDraft = Omit<CollectorDesign, 'id' | 'created' | 'owner'> & { id?: string };

function Collectors() {
  const s = useGame()!;
  const designs = Object.values(s.swarm.designs).sort((a, b) => b.created - a.created);
  const base = designs[0];
  const [d, setD] = useState<CDraft>(() => base ? { ...base } : { name: 'Helios-I', radiusAU: 0.3, areaM2: 1e6, cell: 'pv_basic', structure: 'foil', radiatorRatio: 0.5, stationKeeping: 'sail', transmission: 'microwave', computeFraction: 0.1, repair: 'none' });
  const known = (t: string) => !!s.tech[t]?.known;
  const cm = collectorMods(s);
  const st = useMemo(() => computeCollectorStats({ ...d, id: d.id ?? 'draft', owner: 'une', created: s.day } as CollectorDesign, known, cm), [d, cm.tempBonus, cm.failureMult, cm.densityMult, Object.values(s.tech).filter((t) => t.known).length]);
  const upd = (p: Partial<CDraft>) => setD({ ...d, ...p });
  const diagram = useMemo(() => collectorDiagram(d.radiusAU, st.temperature, st.tmax), [d.radiusAU, Math.round(st.temperature), st.tmax]);
  const logArea = Math.log10(d.areaM2);
  const sel = (label: string, value: string, opts: Record<string, { name: string; tech?: string; description: string }>, key: keyof CDraft) => (
    <div className="col" style={{ gap: 2 }}>
      <span className="tiny muted">{label}</span>
      <select value={value} onChange={(e) => upd({ [key]: e.target.value } as Partial<CDraft>)}>
        {Object.entries(opts).map(([id, o]) => <option key={id} value={id}>{o.name}{o.tech && !known(o.tech) ? ' (locked)' : ''}</option>)}
      </select>
      <span className="tiny muted">{opts[value]?.description}</span>
    </div>
  );
  return (
    <div className="grid g3">
      <Panel title="Collector design" accent="energy">
        {!known('dyson_collectors') && <div className="note warn small" style={{ marginBottom: 8 }}>Collector manufacturing requires {techName('dyson_collectors')}. You can still explore the design space.</div>}
        <div className="col">
          <input type="text" value={d.name} onChange={(e) => upd({ name: e.target.value })} />
          <div className="col" style={{ gap: 2 }}>
            <span className="tiny muted">Orbital radius: {d.radiusAU.toFixed(2)} AU (flux {fmtNum(st.flux)} W/m², {(1 / (d.radiusAU * d.radiusAU)).toFixed(1)}× Earth)</span>
            <input type="range" min={0.05} max={1.5} step={0.01} value={d.radiusAU} onChange={(e) => upd({ radiusAU: Number(e.target.value) })} />
          </div>
          <div className="col" style={{ gap: 2 }}>
            <span className="tiny muted">Collector area: {fmtSci(d.areaM2)} m² ({fmtNum(Math.sqrt(d.areaM2) / 1000)} km square)</span>
            <input type="range" min={3} max={10} step={0.1} value={logArea} onChange={(e) => upd({ areaM2: Math.pow(10, Number(e.target.value)) })} />
          </div>
          {sel('Photovoltaic cells', d.cell, CELL_TYPES, 'cell')}
          {sel('Structure', d.structure, COLLECTOR_STRUCTURES, 'structure')}
          <div className="col" style={{ gap: 2 }}>
            <span className="tiny muted">Radiator area ratio: {d.radiatorRatio.toFixed(2)} × collector area</span>
            <input type="range" min={0} max={4} step={0.05} value={d.radiatorRatio} onChange={(e) => upd({ radiatorRatio: Number(e.target.value) })} />
          </div>
          {sel('Power transmission', d.transmission, TRANSMISSION, 'transmission')}
          <div className="col" style={{ gap: 2 }}>
            <span className="tiny muted">Share of power used for on-board computing: {fmtPct(d.computeFraction, 0)}</span>
            <input type="range" min={0} max={1} step={0.01} value={d.computeFraction} onChange={(e) => upd({ computeFraction: Number(e.target.value) })} />
          </div>
          {sel('Station keeping', d.stationKeeping, STATION_KEEPING, 'stationKeeping')}
          {sel('Maintenance', d.repair, REPAIR, 'repair')}
          <div className="row">
            <button className="btn primary" disabled={st.errors.length > 0} onClick={async () => { const r = await run({ type: 'saveCollectorDesign', design: { ...d, id: undefined } }); if (r.ok) toast(`Collector design saved: ${d.name}`, 'ok'); }}>Save as new design</button>
            {d.id && s.swarm.designs[d.id] && <button className="btn" onClick={async () => { const r = await run({ type: 'saveCollectorDesign', design: d }); if (r.ok) toast('Design updated', 'ok'); }}>Update</button>}
          </div>
        </div>
      </Panel>
      <Panel title="Physics" accent="energy">
        <PixelCanvas source={diagram} scale={2} style={{ width: '100%' }} />
        {st.errors.map((e, i) => <div key={i} className="note bad small" style={{ marginTop: 6 }}>{e}</div>)}
        {st.techMissing.length > 0 && <div className="note warn small" style={{ marginTop: 6 }}>Requires {st.techMissing.map(techName).join(', ')}</div>}
        {st.warnings.map((e, i) => <div key={i} className="note warn small" style={{ marginTop: 6 }}>{e}</div>)}
        <div className="kv small" style={{ marginTop: 8 }}>
          <span className="k">Incident sunlight</span><span className="v">{fmtPower(st.incident)}</span>
          <span className="k">Equilibrium temperature</span><span className="v" style={{ color: st.temperature > st.tmax ? 'var(--c-bad)' : undefined }}>{st.temperature.toFixed(0)} K (limit {st.tmax.toFixed(0)} K)</span>
          <span className="k">Electrical output</span><span className="v hl">{fmtPower(st.electrical)}</span>
          <span className="k">Transmitted power</span><span className="v">{fmtPower(st.transmitted)}</span>
          <span className="k">Computing power</span><span className="v">{fmtPower(st.compute)}</span>
          <span className="k">Waste heat</span><span className="v">{fmtPower(st.heat)}</span>
          <span className="k">Mass</span><span className="v">{fmtTonnes(st.mass)}</span>
          <span className="k">Specific power</span><span className="v">{fmtNum(st.specificPower)} W/kg</span>
          <span className="k">Unit cost</span><span className="v">{fmtMoney(st.cost)}</span>
          <span className="k">Mean lifetime</span><span className="v">{st.lifetime.toFixed(1)} years</span>
          <span className="k">Failure rate</span><span className="v">{fmtPct(st.failureRate, 2)}/yr</span>
          <span className="k">Share of the Sun per collector</span><span className="v">{fmtSci(st.interceptFraction)}</span>
          <span className="k">Collectors for 1% of the Sun</span><span className="v">{fmtSci(0.01 / Math.max(1e-30, st.interceptFraction))}</span>
        </div>
        <div className="hr" />
        <div className="tiny muted">MATERIALS PER COLLECTOR</div>
        <div className="small">{Object.entries(st.goods).filter(([, v]) => v > 1e-6).map(([g, v]) => `${g} ${fmtNum(v)} t`).join(' · ')}</div>
        <div className="tiny muted" style={{ marginTop: 6 }}>Flux scales as 1/r². Closer orbits collect more power but run hotter, and temperature follows (absorbed heat / σ·radiating area)^¼.</div>
      </Panel>
      <Panel title="Registered collector designs" accent="energy">
        {designs.length === 0 && <div className="small muted">No collector designs yet.</div>}
        {designs.map((x) => {
          const xs = computeCollectorStats(x, known, cm);
          const active = s.swarm.activeDesign === x.id;
          return (
            <div key={x.id} style={{ border: '1px solid var(--border)', padding: 7, marginBottom: 6, background: active ? '#1a1a0d' : undefined }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="hl">{x.name}</span>
                {active ? <span className="tag c-energy">in production</span> : <button className="btn small" onClick={() => run({ type: 'setActiveCollector', designId: x.id })}>Produce</button>}
              </div>
              <div className="tiny muted">{x.radiusAU.toFixed(2)} AU · {fmtSci(x.areaM2)} m² · {CELL_TYPES[x.cell]?.name} · {TRANSMISSION[x.transmission]?.name}</div>
              <div className="small">{fmtPower(xs.electrical)} · {fmtTonnes(xs.mass)} · {xs.lifetime.toFixed(0)} yr life · {xs.temperature.toFixed(0)} K</div>
              <button className="btn small ghost" onClick={() => setD({ ...x })}>Load into designer</button>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

function collectorDiagram(rAU: number, T: number, tmax: number): HTMLCanvasElement {
  const W = 200, H = 60;
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  g.fillStyle = '#04070c';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = i % 3 ? '#1b2533' : '#39485c';
    g.fillRect((i * 53) % W, (i * 29) % H, 1, 1);
  }
  // Sun
  const cy = H / 2;
  for (let y = -18; y <= 18; y++) for (let x = -18; x <= 0; x++) {
    const d = Math.sqrt(x * x + y * y);
    if (d > 18) continue;
    g.fillStyle = d > 15 ? '#ff9f43' : d > 10 ? '#ffd84d' : '#fff3b0';
    g.fillRect(x + 12, cy + y, 1, 1);
  }
  // orbit scale: 0..1.5 AU across the width
  const px = (au: number) => 14 + (au / 1.5) * (W - 24);
  g.fillStyle = '#2d3d52';
  for (let x = 14; x < W - 6; x += 2) g.fillRect(x, cy, 1, 1);
  for (const [au, label] of [[0.387, 'Me'], [0.723, 'V'], [1, 'E']] as const) {
    g.fillStyle = '#7d8b99';
    g.fillRect(Math.round(px(au)), cy - 3, 1, 7);
    g.fillStyle = '#9aa7b8';
    g.font = '6px monospace';
    g.fillText(label, Math.round(px(au)) - 2, cy + 12);
  }
  // collector
  const hot = Math.max(0, Math.min(1, (T - 250) / Math.max(1, tmax - 150)));
  const col = T > tmax + 200 ? '#ff5c5c' : T > tmax ? '#ffb347' : hot > 0.6 ? '#ffd84d' : '#4da3ff';
  const x = Math.round(px(rAU));
  g.fillStyle = col;
  g.fillRect(x - 1, cy - 8, 2, 16);
  g.fillStyle = '#e6edf3';
  g.fillRect(x, cy - 1, 1, 2);
  return c;
}

export type { GameState };
