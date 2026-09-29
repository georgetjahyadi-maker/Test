import React, { useState } from 'react';
import { useGame, run, toast } from '../../client/client';
import { Panel, Stat, Bar, PageTitle, useNav, X } from '../components';
import { TECHS, TECH, TECH_CATEGORIES, TIER_COST, techCost } from '../../sim/content/techs';
import { fmtNum, fmtMoney, fmtPct } from '../../sim/core/format';
import { formatDate } from '../../sim/core/time';
import { researchRates, availableTechs } from '../../sim/systems/research';
import { actorName } from '../../sim/systems/helpers';
import { CATEGORY_COLOR } from '../../render/palette';
import type { GameState } from '../../sim/types';

function withPrereqs(s: GameState, id: string, out: string[] = []): string[] {
  const t = TECH[id];
  if (!t || s.tech[id]?.known || out.includes(id)) return out;
  for (const p of t.prereqs) withPrereqs(s, p, out);
  if (!out.includes(id)) out.push(id);
  return out;
}

export function ResearchPanel() {
  const s = useGame()!;
  const nav = useNav();
  const [cat, setCat] = useState('all');
  const [hideKnown, setHideKnown] = useState(false);
  const sel = nav.selection.research ?? s.research.queue[0] ?? availableTechs(s)[0];
  const rates = researchRates(s);
  const avail = new Set(availableTechs(s));
  const known = TECHS.filter((t) => s.tech[t.id]?.known).length;
  const queue = s.research.queue;
  const setQueue = (q: string[]) => run({ type: 'setResearchQueue', queue: q });
  const enqueue = (id: string) => {
    const add = withPrereqs(s, id).filter((x) => !queue.includes(x));
    if (add.length === 0) return;
    if (queue.length + add.length > 12) {
      toast('The research queue holds 12 projects.', 'warn');
      return;
    }
    setQueue([...queue, ...add]);
  };
  const target = queue.find((id) => TECH[id]?.prereqs.every((p) => s.tech[p]?.known));
  const eta = (id: string) => {
    // rough: sum of remaining costs ahead in queue / monthly RP
    let acc = 0;
    for (const q of queue) {
      acc += Math.max(0, techCost(TECH[q]) - (s.tech[q]?.progress ?? 0));
      if (q === id) break;
    }
    return rates.total > 0 ? acc / rates.total : Infinity;
  };
  const tiers = [...new Set(TECHS.map((t) => t.tier))].sort((a, b) => a - b);
  const selDef = sel ? TECH[sel] : undefined;
  const selState = sel ? s.tech[sel] : undefined;
  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <PageTitle title="Research" sub="Institutions, nations, corporations and computing all advance knowledge. The UNE directs only its own programs." />
      <div className="stats" style={{ marginBottom: 12 }}>
        <Stat label="Research output" value={`${fmtNum(rates.total)} RP/yr`} explain="research.rate" />
        <Stat label="ISD programs" value={`${fmtNum(rates.une)} RP/yr`} sub="set by the ISD budget" />
        <Stat label="National science commons" value={`${fmtNum(rates.commons)} RP/yr`} />
        <Stat label="Settlement labs" value={`${fmtNum(rates.labs)} RP/yr`} />
        {rates.compute > 0 && <Stat label="Swarm computing" value={`${fmtNum(rates.compute)} RP/yr`} />}
        <Stat label="Technologies known" value={`${known} / ${TECHS.length}`} />
        <Stat label="Proprietary" value={String(TECHS.filter((t) => s.tech[t.id]?.known && s.tech[t.id]?.owner).length)} sub="corporate-owned technologies" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 360px' }}>
        <Panel title="Technology" accent="science" right={
          <span className="row">
            <select value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">All fields</option>
              {TECH_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="row small"><input type="checkbox" checked={hideKnown} onChange={(e) => setHideKnown(e.target.checked)} /> hide known</label>
          </span>
        }>
          {tiers.map((tier) => {
            const list = TECHS.filter((t) => t.tier === tier && (cat === 'all' || t.category === cat) && (!hideKnown || !s.tech[t.id]?.known));
            if (list.length === 0) return null;
            return (
              <div key={tier} style={{ marginBottom: 10 }}>
                <div className="tiny muted" style={{ marginBottom: 4 }}>TIER {tier} · {fmtNum(TIER_COST[tier] ?? 0)} RP{tier > 0 ? ` · ~${fmtNum((TIER_COST[tier] ?? 0) / Math.max(1, rates.total), 1)} yr at current output` : ''}</div>
                <div className="techgrid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
                  {list.map((t) => {
                    const st = s.tech[t.id];
                    const k = st?.known;
                    const q = queue.includes(t.id);
                    const a = avail.has(t.id);
                    const cls = k ? 'known' : q ? 'queued' : a ? 'avail' : 'locked';
                    return (
                      <div key={t.id} className={`tech ${cls} ${st?.owner ? 'prop' : ''}`} onClick={() => nav.select('research', t.id)} style={{ outline: sel === t.id ? '1px solid #fff' : undefined }}>
                        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                          <span className="nm">{t.name}</span>
                          {q && <span className="tag c-science">#{queue.indexOf(t.id) + 1}</span>}
                        </div>
                        <div className="tiny" style={{ color: CATEGORY_COLOR[t.category] ?? 'var(--c-dim)' }}>{t.category}{st?.owner ? ` · ${actorName(s, st.owner)}` : ''}</div>
                        {!k && (st?.progress ?? 0) > 0 && <Bar value={(st?.progress ?? 0) / techCost(t)} thin color="var(--c-science)" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Panel>
        <div className="col" style={{ gap: 12 }}>
          <Panel title={`Research queue (${queue.length}/12)`} accent="science">
            {queue.length === 0 && <div className="small muted">Empty. Programs pick the cheapest available technology.</div>}
            {queue.map((id, i) => {
              const t = TECH[id];
              const st = s.tech[id];
              const blocked = !t.prereqs.every((p) => s.tech[p]?.known);
              return (
                <div key={id} style={{ marginBottom: 6 }}>
                  <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                    <span className={`small ${id === target ? 'hl' : ''}`} style={{ cursor: 'pointer' }} onClick={() => nav.select('research', id)}>{i + 1}. {t.name}</span>
                    <span className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
                      <button className="btn small ghost" disabled={i === 0} onClick={() => { const q = [...queue]; [q[i - 1], q[i]] = [q[i], q[i - 1]]; setQueue(q); }}>▲</button>
                      <button className="btn small ghost" disabled={i === queue.length - 1} onClick={() => { const q = [...queue]; [q[i + 1], q[i]] = [q[i], q[i + 1]]; setQueue(q); }}>▼</button>
                      <button className="btn small ghost" onClick={() => setQueue(queue.filter((x) => x !== id))}>✕</button>
                    </span>
                  </div>
                  <Bar value={(st?.progress ?? 0) / techCost(t)} thin color="var(--c-science)" />
                  <div className="tiny muted">{fmtNum(st?.progress ?? 0)} / {fmtNum(techCost(t))} RP{blocked ? ' · waiting for prerequisites' : ` · ~${fmtNum(eta(id), 1)} yr`}</div>
                </div>
              );
            })}
          </Panel>
          {selDef && (
            <Panel title={selDef.name} accent="science">
              <div className="row" style={{ marginBottom: 6 }}>
                <span className="tag" style={{ borderColor: CATEGORY_COLOR[selDef.category], color: CATEGORY_COLOR[selDef.category] }}>{selDef.category}</span>
                <span className="tag">tier {selDef.tier}</span>
                <span className="tag">era {selDef.era}</span>
                {selState?.known && <span className="tag c-good">known {selState.knownDay !== undefined ? formatDate(selState.knownDay) : ''}</span>}
              </div>
              <div className="small">{selDef.description}</div>
              {selDef.prereqs.length > 0 && (
                <>
                  <div className="tiny muted" style={{ margin: '8px 0 2px' }}>REQUIRES</div>
                  {selDef.prereqs.map((p) => <div key={p} className={`small ${s.tech[p]?.known ? 'good' : 'warn'}`} style={{ cursor: 'pointer' }} onClick={() => nav.select('research', p)}>{s.tech[p]?.known ? '✓' : '·'} {TECH[p]?.name}</div>)}
                </>
              )}
              {selDef.unlocks.length > 0 && (
                <>
                  <div className="tiny muted" style={{ margin: '8px 0 2px' }}>UNLOCKS</div>
                  {selDef.unlocks.map((u, i) => <div key={i} className="small">• {u}</div>)}
                </>
              )}
              {(() => {
                const leads = TECHS.filter((t) => t.prereqs.includes(selDef.id));
                return leads.length > 0 ? (
                  <>
                    <div className="tiny muted" style={{ margin: '8px 0 2px' }}>LEADS TO</div>
                    <div className="small">{leads.map((t, i) => <span key={t.id} style={{ cursor: 'pointer' }} onClick={() => nav.select('research', t.id)}>{i > 0 ? ', ' : ''}{t.name}</span>)}</div>
                  </>
                ) : null;
              })()}
              <div className="hr" />
              {!selState?.known ? (
                <div className="row">
                  <span className="small muted">{fmtNum(selState?.progress ?? 0)} / {fmtNum(techCost(selDef))} RP</span>
                  {!queue.includes(selDef.id) && <button className="btn small primary" onClick={() => enqueue(selDef.id)}>Queue{withPrereqs(s, selDef.id).length > 1 ? ` with ${withPrereqs(s, selDef.id).length - 1} prerequisites` : ''}</button>}
                </div>
              ) : selState.owner ? (
                <div className="col">
                  <div className="small warn">Proprietary: owned by {actorName(s, selState.owner)}. Only the owner can use it.</div>
                  <button className="btn small primary" onClick={async () => { const r = await run({ type: 'licenseTech', techId: selDef.id }); if (r.ok) toast(`${selDef.name} licensed for common use`, 'ok'); }}>Buy universal license · {fmtMoney(techCost(selDef) * 4e6)}</button>
                </div>
              ) : (
                <div className="small good">Available to all.</div>
              )}
            </Panel>
          )}
          <div className="note small">Tip: <X k="research.rate" title="Research output">research output</X> rises with ISD funding, member-state support, settlement laboratories and, eventually, swarm computing. The Research Commons Act puts corporate discoveries in the public domain.</div>
          <div className="tiny muted">{fmtPct(known / TECHS.length, 0)} of the tree discovered.</div>
        </div>
      </div>
    </div>
  );
}
