import React, { useMemo, useState } from 'react';
import { useGame, run, toast } from '../../client/client';
import { Panel, Stat, Bar, PageTitle, useNav, Tabs, PixelCanvas, X, StackBar, NumberInput } from '../components';
import { FACILITIES, FACILITY, facilityJobs } from '../../sim/content/facilities';
import { GOOD } from '../../sim/content/goods';
import { SITE, SITES } from '../../sim/content/sites';
import { BODY } from '../../sim/content/bodies';
import { fmtNum, fmtPct, fmtMoney, fmtDays, fmtTonnes } from '../../sim/core/format';
import { formatDate } from '../../sim/core/time';
import { settlementList, popOf, STATUS_LABEL, STATUS_ORDER, tierOf, actorName, usable } from '../../sim/systems/helpers';
import { canBuild, totalCost, suggestFacilities, estimateROI } from '../../sim/ai/planner';
import { foundingPlan, statusRequirements } from '../../sim/systems/colonies';
import { cultureName } from '../../sim/systems/politics';
import { colonyScene } from '../../render/colonies';
import { STATUS_COLOR } from '../../render/palette';
import { lightDelaySeconds } from '../../sim/physics/orbits';
import { Avatar } from '../avatar';
import type { Settlement } from '../../sim/types';

type Tab = 'overview' | 'facilities' | 'build' | 'goods' | 'politics' | 'resources';

export function ColoniesPanel() {
  const s = useGame()!;
  const nav = useNav();
  const sts = settlementList(s).sort((a, b) => popOf(b) - popOf(a));
  const [founding, setFounding] = useState(false);
  const sel = s.settlements[nav.selection.colonies ?? ''] ?? sts[0];
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <PageTitle title="Colonies" sub={`${sts.length} settlements · ${fmtNum(sts.reduce((a, st) => a + popOf(st), 0))} people`} right={<button className="btn primary" onClick={() => setFounding(!founding)}>{founding ? 'Close site survey' : 'Found a settlement…'}</button>} />
      {founding && <FoundPanel onDone={(id) => { setFounding(false); if (id) nav.select('colonies', id); }} />}
      <div className="split">
        <div className="list">
          {sts.map((st) => (
            <div key={st.id} className={`it ${st.id === sel?.id ? 'on' : ''}`} onClick={() => nav.select('colonies', st.id)}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="hl">{st.name}</span>
                <span className="small">{fmtNum(popOf(st))}</span>
              </div>
              <div className="row tiny muted" style={{ justifyContent: 'space-between' }}>
                <span><i style={{ display: 'inline-block', width: 7, height: 7, background: STATUS_COLOR[st.status], marginRight: 4 }} />{SITE[st.siteId].name}</span>
                <span>{(st.lifeSupport.reserveDays.oxygen ?? 999) < 60 ? <span className="bad">O₂ low</span> : st.construction.length ? `${st.construction.length} building` : st.kind}</span>
              </div>
            </div>
          ))}
        </div>
        {sel && (
          <div className="col" style={{ gap: 10, minWidth: 0 }}>
            <Header st={sel} />
            <Tabs tabs={[{ id: 'overview', label: 'Overview' }, { id: 'facilities', label: `Facilities (${sel.facilities.length})` }, { id: 'build', label: `Build${sel.construction.length ? ` (${sel.construction.length})` : ''}` }, { id: 'goods', label: 'Goods & Flows' }, { id: 'politics', label: 'Politics & Culture' }, { id: 'resources', label: 'Resources' }]} value={tab} onChange={setTab} />
            {tab === 'overview' && <Overview st={sel} />}
            {tab === 'facilities' && <Facilities st={sel} />}
            {tab === 'build' && <Build st={sel} />}
            {tab === 'goods' && <Goods st={sel} />}
            {tab === 'politics' && <Politics st={sel} />}
            {tab === 'resources' && <Resources st={sel} />}
          </div>
        )}
      </div>
    </div>
  );
}

function Header({ st }: { st: Settlement }) {
  const s = useGame()!;
  const site = SITE[st.siteId];
  const scene = useMemo(() => colonyScene(st, 320, 120), [st.id, st.facilities.length, st.construction.length, Math.round(Math.log2(popOf(st) + 1)), st.facilities.reduce((a, f) => a + Math.round(Math.log2(f.count + 1)), 0)]);
  const gov = s.characters[st.governorId ?? ''];
  return (
    <div className="panel" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,640px) 1fr', gap: 0 }}>
      <PixelCanvas source={scene} scale={2} style={{ width: '100%', maxWidth: 640, display: 'block' }} />
      <div style={{ padding: 12 }}>
        <div className="row"><h2 style={{ margin: 0, fontSize: 18, color: '#fff', letterSpacing: '0.04em' }}>{st.name}</h2></div>
        <div className="muted small">{site.name} · {BODY[site.body].name} · founded {formatDate(st.founded)} by {actorName(s, st.founder)}</div>
        <div className="row" style={{ margin: '6px 0' }}>
          <span className="tag" style={{ borderColor: STATUS_COLOR[st.status], color: STATUS_COLOR[st.status] }}>{STATUS_LABEL[st.status]}</span>
          <span className="tag">{tierOf(popOf(st))}</span>
          <span className="tag c-industry">{st.kind}</span>
        </div>
        {gov && (
          <div className="row small" style={{ gap: 8 }}>
            <Avatar id={gov.id} size={32} />
            <div><div>{gov.name}</div><div className="tiny muted">Governor · {gov.background}</div></div>
          </div>
        )}
        <div className="tiny muted" style={{ marginTop: 6 }}>{site.description}</div>
      </div>
    </div>
  );
}

function Overview({ st }: { st: Settlement }) {
  const s = useGame()!;
  const pop = popOf(st);
  const rd = st.lifeSupport.reserveDays;
  const sug = suggestFacilities(s, st, 'une');
  const site = SITE[st.siteId];
  return (
    <div className="grid g2">
      <Panel title="Vital signs" accent="population">
        <div className="stats">
          <Stat label="Population" value={fmtNum(pop)} sub={`housing ${fmtNum(st.housing)}`} />
          <Stat label="Wellbeing" value={fmtPct(st.pop.wellbeing, 0)} explain={`set:${st.id}:wellbeing`} />
          <Stat label="Oxygen reserve" value={fmtDays(rd.oxygen ?? 0)} color={(rd.oxygen ?? 999) < 60 ? 'var(--c-bad)' : undefined} />
          <Stat label="Water reserve" value={fmtDays(rd.water ?? 0)} color={(rd.water ?? 999) < 60 ? 'var(--c-bad)' : undefined} />
          <Stat label="Food reserve" value={fmtDays(rd.food ?? 0)} color={(rd.food ?? 999) < 60 ? 'var(--c-bad)' : undefined} />
          <Stat label="Food self-sufficiency" value={fmtPct(st.lifeSupport.foodSelf, 0)} explain={`set:${st.id}:food`} />
          <Stat label="Water recovery" value={fmtPct(st.lifeSupport.waterRecovery, 1)} sub={`life support for ${fmtNum(st.lifeSupport.capacity)}`} />
          <Stat label="O₂ recovery" value={fmtPct(st.lifeSupport.oxygenRecovery, 1)} />
          <Stat label="Power" value={`${st.energy.gen.toFixed(1)} MW`} sub={`demand ${st.energy.demand.toFixed(1)} MW`} explain={`set:${st.id}:energy`} color={st.energy.ratio < 0.95 ? 'var(--c-bad)' : undefined} />
          <Stat label="Industrial closure" value={fmtPct(st.closure, 0)} sub="share of needs made locally" />
          <Stat label="Automation" value={`L${st.automation.toFixed(1)}`} />
          <Stat label="Science" value={`${fmtNum(st.science)} RP/yr`} />
        </div>
      </Panel>
      <Panel title="Economy" accent="industry">
        <div className="kv small">
          <span className="k">GDP</span><span className="v">{fmtMoney(st.economy.gdp)}/yr</span>
          <span className="k">Imports</span><span className="v">{fmtMoney(st.economy.importsValue)}/yr</span>
          <span className="k">Exports</span><span className="v">{fmtMoney(st.economy.exportsValue)}/yr</span>
          <span className="k">Sponsor subsidy</span><span className="v">{fmtMoney(st.economy.subsidy)}/yr</span>
          <span className="k">Local treasury</span><span className="v">{fmtMoney(st.economy.treasury)}</span>
          <span className="k">Wage level</span><span className="v">{fmtNum(st.economy.wage)} cr/yr</span>
          <span className="k">Light delay to Earth</span><span className="v">{(lightDelaySeconds('earth', site.body, s.day) / 60).toFixed(1)} min</span>
          <span className="k">Storage</span><span className="v">{fmtTonnes(Object.values(st.stock).reduce((a, v) => a + v, 0))} / {fmtTonnes(st.storageCap)}</span>
          <span className="k">Spaceport capacity</span><span className="v">{fmtTonnes(st.landingCapacity)}/yr</span>
          {st.massDriverCapacity > 0 && <><span className="k">Mass driver</span><span className="v">{fmtTonnes(st.massDriverCapacity)}/yr</span></>}
        </div>
        <div className="hr" />
        <div className="tiny muted" style={{ marginBottom: 4 }}>SPONSORS (share of costs and surpluses)</div>
        <StackBar parts={Object.keys(st.sponsors).map((k, i) => ({ label: actorName(s, k), value: st.sponsors[k], color: ['#4da3ff', '#ff9f43', '#5fd38a', '#b98cff', '#ffd84d', '#ff5c5c', '#9aa7b8'][i % 7] }))} />
        <div className="legend">{Object.keys(st.sponsors).map((k, i) => <span className="chip" key={k}><i style={{ background: ['#4da3ff', '#ff9f43', '#5fd38a', '#b98cff', '#ffd84d', '#ff5c5c', '#9aa7b8'][i % 7] }} />{actorName(s, k)}</span>)}</div>
      </Panel>
      <Panel title="Planning advice" accent="politics" style={{ gridColumn: '1 / -1' }}>
        {sug.length === 0 && <div className="small muted">No urgent needs.</div>}
        <table className="t">
          <tbody>
            {sug.slice(0, 6).map((sg) => (
              <tr key={sg.type}>
                <td className="hl">{FACILITY[sg.type].name} × {sg.count}</td>
                <td className="muted small">{sg.reason}</td>
                <td className="n small">{fmtMoney(totalCost(s, st, sg.type, sg.count))}</td>
                <td><button className="btn small primary" onClick={async () => { const r = await run({ type: 'build', settlementId: st.id, facility: sg.type, count: sg.count }); if (r.ok) toast(`Construction queued: ${FACILITY[sg.type].name}`, 'ok'); }}>Build</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="tiny muted" style={{ marginTop: 6 }}>Building costs money up front. Materials must still be delivered, and a project stalls until they arrive.</div>
      </Panel>
    </div>
  );
}

function Facilities({ st }: { st: Settlement }) {
  const s = useGame()!;
  const groups = [...st.facilities].sort((a, b) => (FACILITY[a.type]?.category ?? '').localeCompare(FACILITY[b.type]?.category ?? '') || a.type.localeCompare(b.type));
  return (
    <Panel title="Facilities" accent="industry">
      <table className="t">
        <thead><tr><th>Facility</th><th>Owner</th><th className="n">Count</th><th>Utilization</th><th>Condition</th><th>Limiting factor</th><th /></tr></thead>
        <tbody>
          {groups.map((f) => (
            <tr key={f.id} style={{ opacity: f.enabled ? 1 : 0.5 }}>
              <td className="hl" title={FACILITY[f.type]?.description}>{FACILITY[f.type]?.name}</td>
              <td className="muted">{actorName(s, f.owner)}</td>
              <td className="n">{fmtNum(f.count)}</td>
              <td style={{ width: 100 }}><Bar value={f.utilization} color={f.utilization < 0.6 ? 'var(--c-warn)' : 'var(--c-good)'} /></td>
              <td style={{ width: 80 }}><Bar value={f.condition} color={f.condition < 0.6 ? 'var(--c-bad)' : undefined} /></td>
              <td className="small warn">{f.limiting ?? ''}</td>
              <td>{f.owner === 'une' && <button className="btn small" onClick={() => run({ type: 'toggleFacility', settlementId: st.id, groupId: f.id, enabled: !f.enabled })}>{f.enabled ? 'Idle' : 'Resume'}</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Build({ st }: { st: Settlement }) {
  const s = useGame()!;
  const [cat, setCat] = useState('all');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const cats = ['all', ...new Set(FACILITIES.map((f) => f.category))];
  const site = SITE[st.siteId];
  const list = FACILITIES.filter((f) => (cat === 'all' || f.category === cat) && f.allowed.includes(site.kind) && (!f.requiresFeature || site.features.includes(f.requiresFeature)));
  return (
    <div className="grid g2">
      <Panel title="Construction queue" accent="industry" style={{ gridColumn: '1 / -1' }}>
        {st.construction.length === 0 && <div className="small muted">Nothing under construction.</div>}
        <table className="t">
          <tbody>
            {st.construction.map((p) => {
              const rem = Object.entries(p.materials).filter(([, v]) => v > 0.01);
              return (
                <tr key={p.id}>
                  <td className="hl">{FACILITY[p.type]?.name} × {fmtNum(p.count)}</td>
                  <td className="muted small">{actorName(s, p.owner)}</td>
                  <td style={{ width: 160 }}><Bar value={p.progress} /> <span className="tiny">{fmtPct(p.progress, 0)}</span></td>
                  <td className="small">{p.stalled ? <span className="warn">{p.stalled}</span> : <span className="good">progressing</span>}</td>
                  <td className="tiny muted">{rem.slice(0, 4).map(([g, v]) => `${GOOD[g]?.name} ${fmtNum(v)} t`).join(', ')}</td>
                  <td>{p.owner === 'une' && <button className="btn small danger" onClick={() => run({ type: 'cancelConstruction', settlementId: st.id, projectId: p.id })}>Cancel</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      <Panel title="Build facilities (UNE-owned)" accent="industry" style={{ gridColumn: '1 / -1' }} right={<select value={cat} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>}>
        <table className="t">
          <thead><tr><th>Facility</th><th>Provides</th><th className="n">Jobs</th><th className="n">Power</th><th className="n">Materials</th><th className="n">Months</th><th className="n">Cost (1)</th><th className="n">Est. ROI</th><th /></tr></thead>
          <tbody>
            {list.map((f) => {
              const ok = canBuild(s, st, 'une', f.id);
              const n = counts[f.id] ?? 1;
              const reason = !usable(s, 'une', f.tech) ? `Needs ${f.tech?.replace(/_/g, ' ')}` : !ok ? (f.mining ? 'No suitable deposit' : 'Not possible here') : '';
              const roi = ok && (f.mining || f.recipe) ? estimateROI(s, st, f.id).roi : null;
              let mass = 0;
              for (const g in f.buildMass) mass += f.buildMass[g];
              return (
                <tr key={f.id} style={{ opacity: ok ? 1 : 0.45 }}>
                  <td className="hl" title={f.description}>{f.name}</td>
                  <td className="small muted" style={{ maxWidth: 300 }}>{provides(f.id)}</td>
                  <td className="n">{fmtNum(facilityJobs(f))}</td>
                  <td className="n">{f.gen ? `+${f.gen}` : f.power ? `−${f.power}` : ''}</td>
                  <td className="n">{fmtNum(mass)} t</td>
                  <td className="n">{f.buildMonths}</td>
                  <td className="n">{fmtMoney(totalCost(s, st, f.id, 1))}</td>
                  <td className="n" style={{ color: roi !== null ? (roi > 0.1 ? 'var(--c-good)' : roi < 0 ? 'var(--c-bad)' : undefined) : undefined }}>{roi !== null ? fmtPct(roi, 0) : ''}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {ok ? (
                      <>
                        <NumberInput value={n} min={1} step={1} width={52} onChange={(v) => setCounts({ ...counts, [f.id]: Math.max(1, Math.floor(v)) })} />
                        <button className="btn small primary" onClick={async () => { const r = await run({ type: 'build', settlementId: st.id, facility: f.id, count: n }); if (r.ok) toast(`Queued ${n} × ${f.name}`, 'ok'); }}>Build</button>
                      </>
                    ) : <span className="tiny warn">{reason}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function provides(type: string): string {
  const f = FACILITY[type];
  const p: string[] = [];
  if (f.housing) p.push(`houses ${fmtNum(f.housing)}${f.gravity ? `, ${f.gravity} g` : ''}${f.shielding ? `, ${Math.round(f.shielding * 100)}% shield` : ''}`);
  if (f.lifeSupportCapacity) p.push(`life support for ${f.lifeSupportCapacity}`);
  if (f.gen) p.push(`${f.gen} MW ${f.genType}`);
  if (f.storageMWh) p.push(`${f.storageMWh} MWh storage`);
  if (f.recipe) {
    const out = Object.entries(f.recipe.out).map(([g, v]) => `${fmtNum(v)} t ${GOOD[g]?.name ?? g}`).join(', ');
    const inn = Object.entries(f.recipe.in).map(([g, v]) => `${fmtNum(v)} ${GOOD[g]?.name ?? g}`).join(', ');
    if (out) p.push(`${out}/yr${inn ? ` from ${inn}` : ''}`);
  }
  if (f.mining) p.push(`mines ${fmtNum(f.mining.orePerYear)} t ore/yr (${f.mining.depositTypes.join(', ')})`);
  if (f.science) p.push(`${f.science} RP/yr`);
  if (f.medical) p.push(`medical care for ${fmtNum(f.medical)}`);
  if (f.civic) p.push(`civic space for ${fmtNum(f.civic)}`);
  if (f.landing) p.push(`${fmtNum(f.landing)} t/yr landings`);
  if (f.massDriver) p.push(`launches ${fmtNum(f.massDriver)} t/yr`);
  if (f.shipyard) p.push(`${fmtNum(f.shipyard)} t/yr shipbuilding`);
  if (f.propellantStorage) p.push(`${fmtNum(f.propellantStorage)} t propellant storage`);
  if (f.storage) p.push(`${fmtNum(f.storage)} t storage`);
  if (f.security) p.push('security');
  if (f.survey) p.push('asteroid survey');
  if (f.automation) p.push('automation');
  if (f.beamReceiveMW) p.push(`receives ${fmtNum(f.beamReceiveMW)} MW beamed power`);
  if (f.collectorMassPerYear) p.push(`fabricates ${fmtNum(f.collectorMassPerYear)} t/yr of Helios collectors`);
  if (f.replicator) p.push('mines, refines, manufactures and self-replicates');
  return p.join('; ');
}

function Goods({ st }: { st: Settlement }) {
  const s = useGame()!;
  const goods = [...new Set([...Object.keys(st.stock), ...Object.keys(st.production), ...Object.keys(st.consumption), ...Object.keys(st.demand), ...Object.keys(st.imports), ...Object.keys(st.inTransit)])].sort();
  const m = s.markets[SITE[st.siteId].region];
  return (
    <Panel title="Goods, production and trade (tonnes per month)" accent="industry">
      <table className="t">
        <thead><tr><th>Good</th><th className="n">Stock</th><th className="n">Produced</th><th className="n">Consumed</th><th className="n">Imported</th><th className="n">Exported</th><th className="n">In transit</th><th className="n">Unmet need</th><th className="n">Local price</th></tr></thead>
        <tbody>
          {goods.map((g) => (
            <tr key={g}>
              <td className="hl">{GOOD[g]?.name ?? g}</td>
              <td className="n">{fmtNum(st.stock[g] ?? 0)}</td>
              <td className="n good">{st.production[g] ? fmtNum(st.production[g]) : ''}</td>
              <td className="n">{st.consumption[g] ? fmtNum(st.consumption[g]) : ''}</td>
              <td className="n">{st.imports[g] ? fmtNum(st.imports[g]) : ''}</td>
              <td className="n">{st.exports[g] ? fmtNum(st.exports[g]) : ''}</td>
              <td className="n muted">{st.inTransit[g] ? fmtNum(st.inTransit[g]) : ''}</td>
              <td className="n warn">{st.demand[g] ? fmtNum(st.demand[g]) : ''}</td>
              <td className="n muted">{m ? fmtNum(m.prices[g] ?? 0) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Politics({ st }: { st: Settlement }) {
  const s = useGame()!;
  const idx = STATUS_ORDER.indexOf(st.status);
  const fs = st.politics.factionSupport;
  return (
    <div className="grid g2">
      <Panel title="Constitutional status" accent="politics">
        <div className="col" style={{ gap: 4 }}>
          {STATUS_ORDER.map((k, i) => {
            const req = i === idx + 1 ? statusRequirements(s, st, k) : null;
            return (
              <div key={k} className="row" style={{ opacity: i <= idx ? 1 : 0.6 }}>
                <span className="tag" style={{ borderColor: STATUS_COLOR[k], color: i === idx ? '#fff' : STATUS_COLOR[k], background: i === idx ? '#13243a' : undefined }}>{i === idx ? '▶ ' : ''}{STATUS_LABEL[k]}</span>
                {req && k !== 'associated' && k !== 'independent' && (
                  req.ok ? <button className="btn small primary" onClick={() => run({ type: 'grantStatus', settlementId: st.id, status: k as any })}>Grant ({req.cost} PC)</button> : <span className="tiny muted">{req.reason}</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          {idx >= 2 && st.status !== 'independent' && st.status !== 'associated' && <button className="btn small danger" onClick={() => { if (confirm(`Grant ${st.name} full independence? This cannot be undone.`)) run({ type: 'grantStatus', settlementId: st.id, status: 'independent' }); }}>Grant independence</button>}
          <label className="row small"><input type="checkbox" checked={st.flags.familiesBanned !== true} onChange={(e) => run({ type: 'setFamilies', settlementId: st.id, allowed: e.target.checked })} /> Families permitted</label>
        </div>
        <div className="note small" style={{ marginTop: 8 }}>Territories send surpluses to their sponsors and have deficits covered by them. Self-governing settlements keep their own budgets and invest them. Full members sit in both chambers.</div>
      </Panel>
      <Panel title="Mood" accent="politics">
        <div className="stats">
          <Stat label="Sentiment to UNE" value={st.politics.sentiment.toFixed(2)} color={st.politics.sentiment < 0 ? 'var(--c-bad)' : undefined} />
          <Stat label="Autonomy pressure" value={fmtPct(st.politics.autonomy, 0)} explain={`set:${st.id}:autonomy`} />
          <Stat label="Grievances" value={st.politics.grievances.toFixed(2)} color={st.politics.grievances > 0.5 ? 'var(--c-bad)' : undefined} />
          <Stat label="Represented" value={st.politics.represented ? 'yes' : 'no'} />
        </div>
        <div className="tiny muted" style={{ margin: '8px 0 4px' }}>FACTIONS</div>
        <StackBar parts={Object.keys(fs).map((f) => ({ label: s.factions[f]?.name ?? f, value: fs[f], color: s.factions[f]?.color ?? '#888' }))} />
        <div className="legend">{Object.keys(fs).sort((a, b) => fs[b] - fs[a]).slice(0, 7).map((f) => <span className="chip" key={f}><i style={{ background: s.factions[f]?.color }} />{s.factions[f]?.short} {fmtPct(fs[f], 0)}</span>)}</div>
        <div className="tiny muted" style={{ margin: '8px 0 4px' }}>IDENTITY</div>
        <div className="legend">{Object.keys(st.pop.cultures).sort((a, b) => st.pop.cultures[b] - st.pop.cultures[a]).map((c) => <span className="chip" key={c}>{cultureName(c)} {fmtPct(st.pop.cultures[c], 0)}</span>)}</div>
      </Panel>
    </div>
  );
}

function Resources({ st }: { st: Settlement }) {
  return (
    <Panel title="Resource deposits" accent="industry">
      <table className="t">
        <thead><tr><th>Deposit</th><th>Type</th><th className="n">Estimated reserve (ore)</th><th className="n">Depleted</th><th className="n">Grade</th><th>Yields per tonne of ore</th><th className="n">Survey</th></tr></thead>
        <tbody>
          {st.deposits.map((d, i) => {
            const err = d.estimateError * (1 - d.survey);
            return (
              <tr key={i}>
                <td className="hl">{d.name}</td>
                <td>{d.type}</td>
                <td className="n">{fmtTonnes(d.reserve)} ± {fmtPct(err, 0)}</td>
                <td className="n">{fmtPct(1 - d.reserve / Math.max(1, d.initial), 3)}</td>
                <td className="n">{d.grade.toFixed(2)}</td>
                <td className="small muted">{Object.entries(d.yields).map(([g, v]) => `${GOOD[g]?.name ?? g} ${v >= 0.01 ? (v * 100).toFixed(1) + '%' : (v * 1e6).toFixed(1) + ' ppm'}`).join(', ')}</td>
                <td className="n">{fmtPct(d.survey, 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function FoundPanel({ onDone }: { onDone: (id?: string) => void }) {
  const s = useGame()!;
  const [names, setNames] = useState<Record<string, string>>({});
  const taken = new Set(settlementList(s).map((st) => st.siteId));
  const sites = SITES.filter((x) => !taken.has(x.id));
  return (
    <Panel title="Site survey: where can the UNE found a settlement?" accent="population" style={{ marginBottom: 12 }}>
      <table className="t">
        <thead><tr><th>Site</th><th>Body</th><th>Kind</th><th className="n">Gravity</th><th className="n">Radiation</th><th>Resources</th><th className="n">Founding cost</th><th /></tr></thead>
        <tbody>
          {sites.map((site) => {
            const plan = foundingPlan(s, site.id, 'une');
            return (
              <tr key={site.id} style={{ opacity: plan.ok ? 1 : 0.5 }}>
                <td className="hl" title={site.description}>{site.name}</td>
                <td>{BODY[site.body].name}</td>
                <td className="muted">{site.kind}</td>
                <td className="n">{site.gravity.toFixed(3)}</td>
                <td className="n">{fmtNum(site.radiation)}</td>
                <td className="tiny muted">{site.deposits.map((d) => d.type).join(', ')}</td>
                <td className="n">{plan.ok ? fmtMoney(plan.cost + plan.transport) : ''}</td>
                <td>
                  {plan.ok ? (
                    <span className="row" style={{ flexWrap: 'nowrap' }}>
                      <input type="text" placeholder="name" style={{ width: 110 }} value={names[site.id] ?? ''} onChange={(e) => setNames({ ...names, [site.id]: e.target.value })} />
                      <button className="btn small primary" onClick={async () => { const r = await run({ type: 'foundSettlement', siteId: site.id, name: names[site.id] }); if (r.ok) { toast(`Settlement founded at ${site.name}`, 'ok'); onDone(r.id); } }}>Found</button>
                    </span>
                  ) : <span className="tiny warn">{plan.error}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

export { X };
