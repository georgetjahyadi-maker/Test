import React, { useMemo, useState } from 'react';
import { useGame, run, toast } from '../../client/client';
import { Panel, Stat, Bar, PageTitle, useNav, Tabs, NumberInput, PixelCanvas, X } from '../components';
import { SITE } from '../../sim/content/sites';
import { GOOD } from '../../sim/content/goods';
import { fmtNum, fmtMoney, fmtPct, fmtTonnes, fmtDays } from '../../sim/core/format';
import { formatDate } from '../../sim/core/time';
import { settlementList, actorName, popOf } from '../../sim/systems/helpers';
import { monthlyLaunchCap, shipOrderCost } from '../../sim/systems/logistics';
import { designStats, planFor } from '../../sim/systems/designs';
import { nodeLabel, type RoutePlan } from '../../sim/physics/engineering';
import { REGION_NAME } from '../../sim/systems/markets';
import { shipSprite } from '../../render/ships';
import type { GameState, Route, VehicleDesign } from '../../sim/types';

type Tab = 'routes' | 'fleets' | 'shipyards' | 'shipments';

export function LogisticsPanel() {
  const s = useGame()!;
  const [tab, setTab] = useState<Tab>('routes');
  const cap = monthlyLaunchCap(s);
  let ships = 0, uneShips = 0;
  for (const f of Object.values(s.fleets)) {
    ships += f.count;
    if (f.owner === 'une') uneShips += f.count;
  }
  let inFlight = 0;
  for (const sh of s.shipments) for (const g in sh.goods) inFlight += sh.goods[g];
  return (
    <div className="page">
      <PageTitle title="Logistics" sub="Every tonne must be lifted, pushed and caught. Delta-v, propellant and launch windows decide what is possible." />
      <div className="stats" style={{ marginBottom: 12 }}>
        <Stat label="Earth launch capacity" value={`${fmtNum(cap * 12)} t/yr`} sub={`${fmtPct(s.earth.launchUsedMonth / Math.max(1, cap), 0)} used last month`} />
        <Stat label="Launch price to LEO" value={`${fmtMoney(s.earth.launchPrice)}/t`} explain="earth.launchPrice" />
        <Stat label="Demand for launch" value={`${fmtNum(s.earth.launchDemandMonth * 12)} t/yr`} color={s.earth.launchDemandMonth > cap ? 'var(--c-warn)' : undefined} />
        <Stat label="Spacecraft" value={fmtNum(ships)} sub={`${fmtNum(uneShips)} UNE-owned`} />
        <Stat label="Routes" value={String(Object.keys(s.routes).length)} sub={`${Object.values(s.routes).filter((r) => r.owner === 'une').length} UNE-operated`} />
        <Stat label="Cargo in flight" value={fmtTonnes(inFlight)} sub={`${s.shipments.length} shipments`} />
      </div>
      <Tabs tabs={[{ id: 'routes', label: 'Routes' }, { id: 'fleets', label: 'Fleets' }, { id: 'shipyards', label: `Shipyards${s.shipOrders.length ? ` (${s.shipOrders.length})` : ''}` }, { id: 'shipments', label: 'Shipments' }]} value={tab} onChange={setTab} />
      {tab === 'routes' && <Routes />}
      {tab === 'fleets' && <Fleets />}
      {tab === 'shipyards' && <Shipyards />}
      {tab === 'shipments' && <Shipments />}
    </div>
  );
}

function Routes() {
  const s = useGame()!;
  const nav = useNav();
  const routes = Object.values(s.routes).sort((a, b) => Number(b.owner === 'une') - Number(a.owner === 'une') || b.stats.deliveredYear - a.stats.deliveredYear);
  const sel = s.routes[nav.selection.logistics ?? ''] ?? routes[0];
  return (
    <div className="col" style={{ gap: 12 }}>
      <NewRoute />
      <Panel title="Routes" accent="industry">
        <div className="scroll" style={{ maxHeight: 380 }}>
          <table className="t">
            <thead><tr><th>Route</th><th>Operator</th><th>Mode</th><th className="n">Ships</th><th className="n">Delivered/yr</th><th className="n">Capacity/yr</th><th>Use</th><th className="n">Cost/t</th><th>Limiting factor</th></tr></thead>
            <tbody>
              {routes.map((r) => {
                const n = Object.values(s.fleets).filter((f) => f.routeId === r.id).reduce((a, f) => a + f.count, 0);
                return (
                  <tr key={r.id} className={`click ${r.id === sel?.id ? 'sel' : ''}`} onClick={() => nav.select('logistics', r.id)} style={{ opacity: r.active ? 1 : 0.5 }}>
                    <td className="hl">{r.name}</td>
                    <td className="muted">{actorName(s, r.owner)}</td>
                    <td>{r.mode}</td>
                    <td className="n">{n}</td>
                    <td className="n">{fmtNum(r.stats.deliveredYear)} t</td>
                    <td className="n">{fmtNum(r.stats.capacityYear)} t</td>
                    <td style={{ width: 70 }}><Bar value={r.stats.utilization} /></td>
                    <td className="n">{r.stats.costPerTonne > 0 ? fmtMoney(r.stats.costPerTonne) : ''}</td>
                    <td className="small warn">{r.stats.limiting ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      {sel && <RouteDetail r={sel} />}
    </div>
  );
}

function NewRoute() {
  const s = useGame()!;
  const sts = settlementList(s).sort((a, b) => popOf(b) - popOf(a));
  const hub = sts.find((st) => st.flags.earthHub);
  const [o, setO] = useState(hub?.id ?? '');
  const [d, setD] = useState('');
  const [mode, setMode] = useState<Route['mode']>('supply');
  return (
    <Panel title="Open a new route" accent="industry">
      <div className="row">
        <span className="small muted">From</span>
        <select value={o} onChange={(e) => setO(e.target.value)}>
          <option value="">choose origin…</option>
          {sts.map((st) => <option key={st.id} value={st.id}>{st.name} ({REGION_NAME[SITE[st.siteId].region]})</option>)}
        </select>
        <span className="small muted">to</span>
        <select value={d} onChange={(e) => setD(e.target.value)}>
          <option value="">choose destination…</option>
          {sts.filter((st) => st.id !== o).map((st) => <option key={st.id} value={st.id}>{st.name} ({REGION_NAME[SITE[st.siteId].region]})</option>)}
        </select>
        <select value={mode} onChange={(e) => setMode(e.target.value as Route['mode'])}>
          <option value="supply">Supply: carry what the destination needs</option>
          <option value="export">Export: carry origin surpluses to buyers</option>
          <option value="both">Two-way: supply out, surpluses back</option>
        </select>
        <button className="btn primary" disabled={!o || !d} onClick={async () => { const r = await run({ type: 'createRoute', origin: o, destination: d, mode }); if (r.ok) toast('Route opened. Assign ships to it next.', 'ok'); }}>Open route</button>
      </div>
      <div className="tiny muted" style={{ marginTop: 6 }}>A route needs ships. Pick a design and a shipyard in the Shipyards tab, or reassign an existing fleet. Each design is checked against the route's delta-v, thrust, endurance and refuelling points.</div>
    </Panel>
  );
}

function RouteDetail({ r }: { r: Route }) {
  const s = useGame()!;
  const o = s.settlements[r.origin], d = s.settlements[r.destination];
  const fleets = Object.values(s.fleets).filter((f) => f.routeId === r.id);
  const mine = r.owner === 'une';
  const [testDesign, setTestDesign] = useState('');
  const designs = usableDesigns(s);
  const oNode = o ? SITE[o.siteId].node : '';
  const dNode = d ? SITE[d.siteId].node : '';
  const plans = useMemo(() => fleets.map((f) => ({ f, plan: s.designs[f.designId] && o && d ? planFor(s, s.designs[f.designId], oNode, dNode) : null })), [s.day - (s.day % 30), r.id, fleets.length]);
  const test = testDesign && s.designs[testDesign] && o && d ? planFor(s, s.designs[testDesign], oNode, dNode) : null;
  if (!o || !d) return null;
  return (
    <div className="grid g2">
      <Panel title={r.name} accent="industry" right={mine && (
        <span className="row">
          <select value={r.mode} onChange={(e) => run({ type: 'setRoute', routeId: r.id, mode: e.target.value as Route['mode'] })}>
            <option value="supply">supply</option><option value="export">export</option><option value="both">two-way</option>
          </select>
          <span className="tiny muted">priority</span>
          <NumberInput value={r.priority} min={0} max={9} step={1} width={44} onChange={(v) => run({ type: 'setRoute', routeId: r.id, priority: v })} />
          <button className="btn small" onClick={() => run({ type: 'setRoute', routeId: r.id, active: !r.active })}>{r.active ? 'Suspend' : 'Resume'}</button>
          <button className="btn small danger" onClick={() => { if (confirm(`Close ${r.name}? Assigned ships become idle.`)) run({ type: 'deleteRoute', routeId: r.id }); }}>Close</button>
        </span>
      )}>
        <div className="kv small">
          <span className="k">Operator</span><span className="v">{actorName(s, r.owner)}</span>
          <span className="k">Origin</span><span className="v">{o.name} · {nodeLabel(oNode)}</span>
          <span className="k">Destination</span><span className="v">{d.name} · {nodeLabel(dNode)}</span>
          <span className="k">Delivered this month</span><span className="v">{fmtTonnes(r.stats.deliveredMonth)}</span>
          <span className="k">Delivered (12-mo rolling)</span><span className="v">{fmtTonnes(r.stats.deliveredYear)}</span>
          <span className="k">Returned cargo this month</span><span className="v">{fmtTonnes(r.stats.returnedMonth)}</span>
          <span className="k">Passengers (12-mo)</span><span className="v">{fmtNum(r.stats.passengersYear)}</span>
          <span className="k">Propellant burned this month</span><span className="v">{fmtTonnes(r.stats.propellantMonth)}</span>
          <span className="k">Ships lost (12-mo)</span><span className="v" style={{ color: r.stats.lostYear > 0 ? 'var(--c-bad)' : undefined }}>{r.stats.lostYear}</span>
          <span className="k">Freight cost</span><span className="v">{fmtMoney(r.stats.costPerTonne)}/t</span>
        </div>
        {r.stats.limiting && <div className="note warn small" style={{ marginTop: 8 }}>{r.stats.limiting}</div>}
        <div className="hr" />
        <div className="tiny muted" style={{ marginBottom: 4 }}>TEST A DESIGN ON THIS ROUTE</div>
        <select value={testDesign} onChange={(e) => setTestDesign(e.target.value)}>
          <option value="">choose design…</option>
          {designs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        {test && <PlanView plan={test} />}
      </Panel>
      <Panel title="Assigned fleets & flight plans" accent="industry">
        {fleets.length === 0 && <div className="small muted">No ships assigned.</div>}
        {plans.map(({ f, plan }) => {
          const design = s.designs[f.designId];
          return (
            <div key={f.id} style={{ marginBottom: 10 }}>
              <div className="row">
                {design && <PixelCanvas source={shipSprite(design)} scale={2} />}
                <span className="hl">{f.count} × {design?.name}</span>
                <span className="tiny muted">condition {fmtPct(f.condition, 0)}</span>
              </div>
              {plan && <PlanView plan={plan} />}
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

export function PlanView({ plan }: { plan: RoutePlan }) {
  return (
    <div className="small" style={{ marginTop: 6 }}>
      {plan.feasible ? <span className="tag c-good">feasible</span> : <span className="tag c-bad">infeasible</span>}
      {plan.helio && <span className="tag c-science">interplanetary</span>}
      {plan.fast && <span className="tag c-energy">brachistochrone</span>}
      {plan.issues.map((i, k) => <div key={k} className="bad small">{i}</div>)}
      {plan.path.length > 0 && <div className="tiny muted" style={{ margin: '4px 0' }}>{plan.path.map(nodeLabel).join(' → ')}</div>}
      {plan.path.length > 0 && (
        <div className="kv small">
          <span className="k">Delta-v out / back</span><span className="v">{plan.dvOneWay.toFixed(2)} / {plan.dvReturn.toFixed(2)} km/s</span>
          <span className="k">Payload per trip</span><span className="v">{fmtTonnes(plan.payload)}{plan.passengers > 0 ? ` + ${plan.passengers} pax` : ''}</span>
          <span className="k">Transit / round trip</span><span className="v">{fmtDays(plan.transitDays)} / {fmtDays(plan.rttDays)}</span>
          <span className="k">Capacity per ship</span><span className="v">{fmtNum(plan.capacityPerShipYear)} t/yr</span>
          <span className="k">Propellant per round trip</span><span className="v">{Object.entries(plan.propDraw).map(([n, v]) => `${fmtNum(v)} t at ${nodeLabel(n)}`).join('; ') || 'none'}</span>
          <span className="k">Refuelling legs</span><span className="v">{plan.segments.length}</span>
          <span className="k">Loss chance per trip</span><span className="v">{fmtPct(plan.lossChance, 3)}</span>
          <span className="k">Operating cost per trip</span><span className="v">{fmtMoney(plan.opexPerTrip)}</span>
        </div>
      )}
    </div>
  );
}

function usableDesigns(s: GameState): VehicleDesign[] {
  return Object.values(s.designs).filter((d) => !d.obsolete && (d.owner === 'une' || d.owner === 'public')).sort((a, b) => a.name.localeCompare(b.name));
}

function Fleets() {
  const s = useGame()!;
  const [owner, setOwner] = useState<'une' | 'all'>('une');
  const fleets = Object.values(s.fleets).filter((f) => owner === 'all' || f.owner === 'une').sort((a, b) => (a.owner === b.owner ? b.count - a.count : a.owner === 'une' ? -1 : 1));
  const routes = Object.values(s.routes).filter((r) => r.owner === 'une');
  const regions = ['earthOrbit', 'luna', 'nea', 'mars', 'belt', 'jupiter', 'saturn'];
  return (
    <Panel title="Fleets" accent="industry" right={<select value={owner} onChange={(e) => setOwner(e.target.value as any)}><option value="une">UNE fleets</option><option value="all">All operators</option></select>}>
      {fleets.length === 0 && <div className="small muted">No ships.</div>}
      <table className="t">
        <thead><tr><th /><th>Design</th><th>Owner</th><th className="n">Ships</th><th>Condition</th><th>Role</th><th>Assignment</th><th /></tr></thead>
        <tbody>
          {fleets.map((f) => {
            const d = s.designs[f.designId];
            const st = d ? designStats(s, d) : null;
            const mine = f.owner === 'une';
            return (
              <tr key={f.id}>
                <td>{d && <PixelCanvas source={shipSprite(d)} scale={1} />}</td>
                <td className="hl">{d?.name ?? '?'}</td>
                <td className="muted">{actorName(s, f.owner)}</td>
                <td className="n">{f.count}</td>
                <td style={{ width: 80 }}><Bar value={f.condition} color={f.condition < 0.7 ? 'var(--c-warn)' : undefined} /></td>
                <td className="muted">{st?.role}</td>
                <td>
                  {mine ? (
                    <span className="row" style={{ flexWrap: 'nowrap' }}>
                      <select value={f.routeId ?? (f.patrolRegion ? `patrol:${f.patrolRegion}` : '')} onChange={(e) => {
                        const v = e.target.value;
                        if (v.startsWith('patrol:')) run({ type: 'patrol', fleetId: f.id, region: v.slice(7) });
                        else run({ type: 'assignFleet', fleetId: f.id, routeId: v || null });
                      }}>
                        <option value="">idle</option>
                        {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        {(st?.combatRating ?? 0) > 0 && regions.map((g) => <option key={g} value={`patrol:${g}`}>patrol {REGION_NAME[g]}</option>)}
                      </select>
                    </span>
                  ) : (
                    <span className="small muted">{f.routeId ? s.routes[f.routeId]?.name : f.patrolRegion ? `patrol ${REGION_NAME[f.patrolRegion]}` : 'idle'}</span>
                  )}
                </td>
                <td>{mine && <button className="btn small danger" onClick={() => { if (confirm(`Scrap ${f.count} × ${d?.name}?`)) run({ type: 'scrapFleet', fleetId: f.id }); }}>Scrap</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function Shipyards() {
  const s = useGame()!;
  const designs = usableDesigns(s).filter((d) => {
    const st = designStats(s, d);
    return st.errors.length === 0;
  });
  const yards = settlementList(s).filter((st) => st.shipyardCapacity > 0);
  const [designId, setDesign] = useState('');
  const [count, setCount] = useState(1);
  const [yard, setYard] = useState('earth');
  const [routeId, setRoute] = useState('');
  const d = s.designs[designId];
  const st = d ? designStats(s, d) : null;
  const cost = d ? shipOrderCost(s, d.id, count, yard) : 0;
  return (
    <div className="grid g2">
      <Panel title="Order spacecraft" accent="industry">
        <div className="col">
          <select value={designId} onChange={(e) => setDesign(e.target.value)}>
            <option value="">choose design…</option>
            {designs.map((x) => {
              const xs = designStats(s, x);
              return <option key={x.id} value={x.id}>{x.name} · {xs.role} · {fmtNum(xs.payload)} t{xs.techMissing.length ? ' (tech missing)' : ''}</option>;
            })}
          </select>
          <div className="row">
            <span className="small muted">Ships</span>
            <NumberInput value={count} min={1} max={200} step={1} width={60} onChange={(v) => setCount(Math.max(1, Math.min(200, Math.floor(v))))} />
            <span className="small muted">Built at</span>
            <select value={yard} onChange={(e) => setYard(e.target.value)}>
              <option value="earth">Earth (launched to LEO)</option>
              {yards.map((y) => <option key={y.id} value={y.id}>{y.name} ({fmtNum(y.shipyardCapacity)} t/yr)</option>)}
            </select>
          </div>
          <div className="row">
            <span className="small muted">Assign on delivery</span>
            <select value={routeId} onChange={(e) => setRoute(e.target.value)}>
              <option value="">keep idle</option>
              {Object.values(s.routes).filter((r) => r.owner === 'une').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          {d && st && (
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <PixelCanvas source={shipSprite(d)} scale={3} />
              <div className="kv small" style={{ flex: 1 }}>
                <span className="k">Dry mass</span><span className="v">{fmtTonnes(st.dryMass)}</span>
                <span className="k">Delta-v empty / full</span><span className="v">{st.dvEmpty.toFixed(2)} / {st.dvFull.toFixed(2)} km/s</span>
                <span className="k">Build time</span><span className="v">{Math.round(st.buildMonths)} months</span>
                <span className="k">Total cost</span><span className="v">{fmtMoney(cost)}</span>
              </div>
            </div>
          )}
          {st?.techMissing.length ? <div className="bad small">Requires {st.techMissing.join(', ')}</div> : null}
          <button className="btn primary" disabled={!d || !!st?.techMissing.length} onClick={async () => { const r = await run({ type: 'orderShips', designId, count, shipyard: yard, routeId: routeId || undefined }); if (r.ok) toast(`Ordered ${count} × ${d?.name}`, 'ok'); }}>Place order{d ? ` · ${fmtMoney(cost)}` : ''}</button>
          <div className="tiny muted">Earth-built ships must be launched to orbit, so their dry mass competes for launch capacity. Orbital and lunar yards need their materials delivered.</div>
        </div>
      </Panel>
      <Panel title="Orders in progress" accent="industry">
        {s.shipOrders.length === 0 && <div className="small muted">No ships on order.</div>}
        <table className="t">
          <tbody>
            {s.shipOrders.map((o) => (
              <tr key={o.id}>
                <td className="hl">{o.count} × {s.designs[o.designId]?.name}</td>
                <td className="muted small">{actorName(s, o.owner)}</td>
                <td className="small">{o.shipyard === 'earth' ? 'Earth' : s.settlements[o.shipyard]?.name}</td>
                <td style={{ width: 120 }}><Bar value={o.progress} /></td>
                <td className="n tiny">{fmtPct(o.progress, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function Shipments() {
  const s = useGame()!;
  const list = [...s.shipments].sort((a, b) => a.arriveDay - b.arriveDay).slice(0, 300);
  return (
    <Panel title={`Shipments in flight (${s.shipments.length})`} accent="industry">
      <div className="scroll" style={{ maxHeight: 600 }}>
        <table className="t">
          <thead><tr><th>From</th><th>To</th><th>Operator</th><th>Cargo</th><th className="n">Tonnes</th><th className="n">Passengers</th><th>Departed</th><th>Arrives</th></tr></thead>
          <tbody>
            {list.map((sh) => {
              let t = 0;
              for (const g in sh.goods) t += sh.goods[g];
              const top = Object.entries(sh.goods).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g, v]) => `${GOOD[g]?.name ?? g} ${fmtNum(v)}`).join(', ');
              return (
                <tr key={sh.id}>
                  <td>{s.settlements[sh.from]?.name}</td>
                  <td className="hl">{s.settlements[sh.to]?.name}</td>
                  <td className="muted small">{actorName(s, sh.owner)}</td>
                  <td className="tiny muted">{top}</td>
                  <td className="n">{fmtNum(t)}</td>
                  <td className="n">{sh.passengers > 0 ? fmtNum(sh.passengers) : ''}</td>
                  <td className="small muted">{formatDate(sh.departDay)}</td>
                  <td className="small">{formatDate(sh.arriveDay)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export { X };
