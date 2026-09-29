import React, { useState } from 'react';
import { useGame, run, toast } from '../../client/client';
import { Panel, Stat, Bar, PageTitle, Hemicycle, Tabs, X, NumberInput } from '../components';
import { LAWS, LAW } from '../../sim/content/laws';
import { AXES, FACTION } from '../../sim/content/actors';
import { fmtPct, fmtNum, fmtMoney } from '../../sim/core/format';
import { formatDate } from '../../sim/core/time';
import { lawAvailable, proposalCost } from '../../sim/systems/legislature';
import type { Bill } from '../../sim/types';

const CAT_LABEL: Record<string, string> = { fiscal: 'Fiscal', industry: 'Industry', settlement: 'Settlement', research: 'Research & IP', citizenship: 'Citizenship & Representation', politics: 'Governance', security: 'Security', environment: 'Environment & Health', genetics: 'Genetics', ai: 'Artificial Intelligence', transport: 'Transport', energy: 'Energy', constitutional: 'Constitutional Amendments' };

export function PoliticsPanel() {
  const s = useGame()!;
  const [tab, setTab] = useState<'overview' | 'bills' | 'propose' | 'laws' | 'factions'>('overview');
  const active = s.bills.filter((b) => b.stage !== 'done');
  return (
    <div className="page">
      <PageTitle title="Politics" sub={`Next Assembly election ${formatDate(s.une.nextElection)} · ${Math.floor(s.une.politicalCapital)} political capital`} />
      <Tabs tabs={[{ id: 'overview', label: 'Legitimacy & Chambers' }, { id: 'bills', label: `Bills (${active.length})` }, { id: 'propose', label: 'Propose Legislation' }, { id: 'laws', label: `Laws in Force (${Object.keys(s.laws).length})` }, { id: 'factions', label: 'Factions' }]} value={tab} onChange={setTab} />
      {tab === 'overview' && <Overview />}
      {tab === 'bills' && (
        <div className="col" style={{ gap: 12 }}>
          {active.length === 0 && <div className="note">No bills before the legislature. Propose legislation from the catalog.</div>}
          {active.map((b) => <BillCard key={b.id} b={b} />)}
          <Panel title="Recent votes">
            <table className="t">
              <thead><tr><th>Bill</th><th>Result</th><th className="n">States</th><th className="n">Assembly</th><th>Date</th></tr></thead>
              <tbody>
                {s.bills.filter((b) => b.stage === 'done').slice(-15).reverse().map((b) => (
                  <tr key={b.id}>
                    <td>{b.action === 'repeal' ? 'Repeal: ' : ''}{LAW[b.lawId]?.name}</td>
                    <td><span className={`tag ${b.result === 'passed' || b.result === 'ratified' ? 'c-good' : 'c-bad'}`}>{b.result}</span></td>
                    <td className="n">{b.tally ? fmtPct(b.tally.nations.yesStates / Math.max(1, b.tally.nations.totalStates), 0) : '—'}</td>
                    <td className="n">{b.tally ? fmtPct(b.tally.assembly.yes / Math.max(1, b.tally.assembly.total), 0) : '—'}</td>
                    <td className="muted">{formatDate(b.voteDay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      )}
      {tab === 'propose' && <Propose />}
      {tab === 'laws' && (
        <Panel title="Laws in force" accent="politics">
          <table className="t">
            <thead><tr><th>Law</th><th>Since</th><th>Effects</th><th /></tr></thead>
            <tbody>
              {Object.values(s.laws).sort((a, b) => a.enactedDay - b.enactedDay).map((l) => {
                const def = LAW[l.id];
                if (!def) return null;
                return (
                  <tr key={l.id}>
                    <td className="hl">{def.name}{def.amendment && <span className="tag c-politics" style={{ marginLeft: 6 }}>amendment</span>}</td>
                    <td className="muted">{formatDate(l.enactedDay)}</td>
                    <td className="small muted">{def.effectsText.join(' · ')}</td>
                    <td>{def.repealable && <button className="btn small" onClick={() => run({ type: 'proposeBill', lawId: l.id, action: 'repeal' })}>Propose repeal ({proposalCost(s, l.id, 'repeal')} PC)</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
      {tab === 'factions' && <Factions />}
    </div>
  );
}

function Overview() {
  const s = useGame()!;
  const m = s.une.metrics;
  const seats = s.une.assembly.seats;
  const groups = Object.keys(seats).filter((f) => seats[f] > 0).sort((a, b) => (s.factions[b].axes[0] - s.factions[a].axes[0])).map((f) => ({ id: f, label: s.factions[f].name, color: s.factions[f].color, seats: seats[f] }));
  const total = groups.reduce((a, g) => a + g.seats, 0);
  const nations = Object.values(s.nations).sort((a, b) => b.states - a.states || b.population - a.population);
  const totalStates = nations.filter((n) => n.member).reduce((a, n) => a + n.states, 0);
  return (
    <div className="grid g2">
      <Panel title="Federal legitimacy" accent="politics" style={{ gridColumn: '1 / -1' }}>
        <div className="stats">
          <Stat label="Legitimacy" value={fmtPct(m.legitimacy ?? 0, 0)} explain="une.legitimacy" />
          <Stat label="State support" value={fmtPct(m.stateSupport ?? 0, 0)} explain="une.stateSupport" />
          <Stat label="Citizen support" value={fmtPct(m.citizenSupport ?? 0, 0)} />
          <Stat label="Institutional trust" value={fmtPct(m.institutionalTrust ?? 0, 0)} />
          <Stat label="Federal capacity" value={fmtPct(m.federalCapacity ?? 0, 0)} />
          <Stat label="Constitutional stability" value={fmtPct(m.constitutionalStability ?? 0, 0)} />
          <Stat label="Polarization" value={fmtPct(m.polarization ?? 0, 0)} />
          <Stat label="Corruption" value={fmtPct(m.corruption ?? 0, 0)} color={(m.corruption ?? 0) > 0.18 ? 'var(--c-bad)' : undefined} />
          <Stat label="Transparency" value={fmtPct(m.transparency ?? 0, 0)} />
          <Stat label="Corporate influence" value={fmtPct(m.corporateInfluence ?? 0, 0)} />
          <Stat label="Military influence" value={fmtPct(m.militaryInfluence ?? 0, 0)} />
          <Stat label="Scientific influence" value={fmtPct(m.scientificInfluence ?? 0, 0)} />
        </div>
        <div className="note small" style={{ marginTop: 8 }}>No political configuration is universally better. Stronger federal power buys capacity at the cost of state support. Wider representation builds legitimacy but makes coalitions more complex.</div>
      </Panel>
      <Panel title={s.une.lowerHouse} accent="politics" right={<span className="muted small">{total} seats{s.une.assembly.offworldSeats ? ` · ${s.une.assembly.offworldSeats} off-world` : ''}</span>}>
        <Hemicycle groups={groups} total={total} />
        <div className="legend">
          {groups.map((g) => (
            <span className="chip" key={g.id}><i style={{ background: g.color }} />{FACTION[g.id]?.short ?? g.id} {g.seats}{s.une.coalition.includes(g.id) ? ' ★' : ''}</span>
          ))}
        </div>
        <div className="tiny muted">★ governing coalition. Seats are apportioned by population^0.7, so small states keep a meaningful voice.</div>
      </Panel>
      <Panel title={s.une.upperHouse} accent="politics" right={<span className="muted small">{totalStates} member states</span>}>
        <table className="t">
          <thead><tr><th>Delegation</th><th className="n">States</th><th className="n">Population</th><th>UNE support</th></tr></thead>
          <tbody>
            {nations.map((n) => (
              <tr key={n.id} style={{ opacity: n.member ? 1 : 0.4 }}>
                <td><i style={{ display: 'inline-block', width: 8, height: 8, background: n.color, marginRight: 6 }} />{n.short}{!n.member && ' (withdrawn)'}</td>
                <td className="n">{n.states}</td>
                <td className="n">{fmtNum(n.population)}</td>
                <td style={{ width: 120 }}><Bar value={n.uneSupport} color={n.uneSupport < 0.35 ? 'var(--c-bad)' : undefined} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="tiny muted" style={{ marginTop: 4 }}>Qualified majority: 55% of states and 65% of population. Supermajority: two-thirds of states and 60% of population.</div>
      </Panel>
    </div>
  );
}

function BillCard({ b }: { b: Bill }) {
  const s = useGame()!;
  const law = LAW[b.lawId];
  const t = b.tally;
  const [pledgeAmt, setPledgeAmt] = useState(2);
  if (!law || !t) return null;
  const nShare = t.nations.yesStates / Math.max(1, t.nations.totalStates);
  const pShare = t.nations.yesPop / Math.max(1, t.nations.totalPop);
  const aShare = t.assembly.yes / Math.max(1, t.assembly.total);
  const needN = law.nationsThreshold === 'simple' ? 0.5 : law.nationsThreshold === 'qualified' ? 0.55 : law.nationsThreshold === 'super' ? 2 / 3 : 1;
  const needA = law.assemblyThreshold === 'super' ? 2 / 3 : 0.5;
  return (
    <Panel title={`${b.action === 'repeal' ? 'Repeal: ' : ''}${law.name}`} accent="politics" right={<span className="small">{b.stage === 'ratification' ? `Ratification until ${formatDate(b.ratifyDeadline ?? 0)}` : `Vote on ${formatDate(b.voteDay)}`}</span>}>
      <div className="small" style={{ marginBottom: 6 }}>{law.description}</div>
      <div className="small muted" style={{ marginBottom: 8 }}>{law.effectsText.join(' · ')}</div>
      <div className="grid g3" style={{ marginBottom: 8 }}>
        <div>
          <div className="tiny muted">CHAMBER OF NATIONS: STATES ({law.nationsThreshold}, needs {fmtPct(needN, 0)})</div>
          <Bar value={nShare} color={nShare >= needN ? 'var(--c-good)' : 'var(--c-bad)'} /> <span className="small">{fmtPct(nShare, 0)}</span>
        </div>
        <div>
          <div className="tiny muted">POPULATION REPRESENTED {law.nationsThreshold === 'qualified' ? '(needs 65%)' : law.nationsThreshold === 'super' ? '(needs 60%)' : ''}</div>
          <Bar value={pShare} color={t.nations.passed ? 'var(--c-good)' : 'var(--c-warn)'} /> <span className="small">{fmtPct(pShare, 0)}</span>
        </div>
        <div>
          <div className="tiny muted">ASSEMBLY ({law.assemblyThreshold}, needs {fmtPct(needA, 0)})</div>
          <Bar value={aShare} color={aShare >= needA ? 'var(--c-good)' : 'var(--c-bad)'} /> <span className="small">{fmtPct(aShare, 0)}</span>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 6 }}>
        <span className={`tag ${t.nations.passed && t.assembly.passed ? 'c-good' : 'c-bad'}`}>{t.nations.passed && t.assembly.passed ? 'Projected to pass' : 'Projected to fail'}</span>
        {b.stage === 'debate' && <button className="btn small danger" onClick={() => run({ type: 'withdrawBill', billId: b.id })}>Withdraw</button>}
      </div>
      {b.stage === 'debate' && (
        <div className="grid g2">
          <div>
            <div className="tiny muted" style={{ marginBottom: 4 }}>DELEGATIONS — lobby (8 PC) or pledge development funds</div>
            <table className="t">
              <tbody>
                {Object.keys(t.byNation).sort((a, c) => t.byNation[a] - t.byNation[c]).map((id) => {
                  const n = s.nations[id];
                  const p = t.byNation[id];
                  return (
                    <tr key={id}>
                      <td>{n.short} <span className="tiny muted">({n.states})</span></td>
                      <td style={{ width: 70 }}><Bar value={p} color={p >= 0.5 ? 'var(--c-good)' : 'var(--c-bad)'} /></td>
                      <td className="tiny muted">{t.reasons[id]}</td>
                      <td>
                        <button className="btn small" disabled={(b.lobbying[id] ?? 0) >= 3} onClick={() => run({ type: 'lobby', billId: b.id, target: id })}>Lobby</button>
                        <button className="btn small" onClick={() => run({ type: 'pledge', billId: b.id, nationId: id, amount: pledgeAmt * 1e9 })}>+{pledgeAmt}B</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="row tiny" style={{ marginTop: 4 }}>Pledge size <NumberInput value={pledgeAmt} min={0.5} step={0.5} onChange={setPledgeAmt} width={60} /> B cr</div>
          </div>
          <div>
            <div className="tiny muted" style={{ marginBottom: 4 }}>ASSEMBLY FACTIONS</div>
            <table className="t">
              <tbody>
                {Object.keys(t.byFaction).sort((a, c) => (s.une.assembly.seats[c] ?? 0) - (s.une.assembly.seats[a] ?? 0)).map((f) => (
                  <tr key={f}>
                    <td><i style={{ display: 'inline-block', width: 8, height: 8, background: s.factions[f]?.color, marginRight: 6 }} />{s.factions[f]?.name}</td>
                    <td className="n">{s.une.assembly.seats[f]}</td>
                    <td style={{ width: 80 }}><Bar value={t.byFaction[f]} color={t.byFaction[f] >= 0.5 ? 'var(--c-good)' : 'var(--c-bad)'} /></td>
                    <td><button className="btn small" disabled={(b.lobbying[f] ?? 0) >= 3} onClick={() => run({ type: 'lobby', billId: b.id, target: f })}>Lobby</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {b.stage === 'ratification' && <div className="note small">Member states are deciding whether to ratify. Amendments need two-thirds of states and 60% of the population represented.</div>}
    </Panel>
  );
}

function Propose() {
  const s = useGame()!;
  const [open, setOpen] = useState<string | null>(null);
  const cats = [...new Set(LAWS.map((l) => l.category))];
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="note small">Proposing a bill costs political capital: less if the Secretary-General's ideology agrees with it, more if it does not. Debate lasts 60 days (120 for amendments). You can lobby delegations or pledge funds before the vote.</div>
      {cats.map((cat) => (
        <Panel key={cat} title={CAT_LABEL[cat] ?? cat} accent="politics">
          <table className="t">
            <tbody>
              {LAWS.filter((l) => l.category === cat).map((l) => {
                const inForce = !!s.laws[l.id];
                const av = lawAvailable(s, l.id, 'enact');
                const cost = proposalCost(s, l.id, 'enact');
                return (
                  <React.Fragment key={l.id}>
                    <tr className="click" onClick={() => setOpen(open === l.id ? null : l.id)}>
                      <td className="hl" style={{ width: '30%' }}>{l.name}</td>
                      <td className="small muted">{l.effectsText[0]}</td>
                      <td style={{ width: 230, textAlign: 'right' }}>
                        {inForce ? <span className="tag c-good">in force</span> : av.ok ? (
                          <button className="btn small primary" disabled={s.une.politicalCapital < cost} onClick={async (e) => { e.stopPropagation(); const r = await run({ type: 'proposeBill', lawId: l.id, action: 'enact' }); if (r.ok) toast(`${l.name} introduced`, 'ok'); }}>Propose ({cost} PC)</button>
                        ) : <span className="tiny muted">{av.reason}</span>}
                      </td>
                    </tr>
                    {open === l.id && (
                      <tr>
                        <td colSpan={3} style={{ background: '#0a1019' }}>
                          <div className="small" style={{ margin: '4px 0' }}>{l.description}</div>
                          <div className="small">{l.effectsText.map((e) => <div key={e}>• {e}</div>)}</div>
                          <div className="tiny muted" style={{ marginTop: 4 }}>Thresholds: Chamber {l.nationsThreshold}, Assembly {l.assemblyThreshold}{l.amendment ? ' · requires ratification' : ''}{l.group ? ` · replaces other laws in group “${l.group}”` : ''}</div>
                          <div className="row tiny" style={{ marginTop: 4 }}>
                            {l.axes.map((v, i) => v !== 0 && <span key={i} className="tag">{AXES[i].split(' ↔ ')[v > 0 ? 0 : 1]} {Math.abs(v).toFixed(1)}</span>)}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </Panel>
      ))}
    </div>
  );
}

function Factions() {
  const s = useGame()!;
  const list = Object.values(s.factions).sort((a, b) => Number(b.active) - Number(a.active) || b.support - a.support);
  return (
    <Panel title="Political factions" accent="politics">
      <table className="t">
        <thead><tr><th>Faction</th><th className="n">Support</th><th className="n">Seats</th><th>Position</th><th>Description</th></tr></thead>
        <tbody>
          {list.map((f) => (
            <tr key={f.id} style={{ opacity: f.active ? 1 : 0.4 }}>
              <td><i style={{ display: 'inline-block', width: 9, height: 9, background: f.color, marginRight: 6 }} /><span className="hl">{f.name}</span>{!f.active && <span className="tiny muted"> (not yet formed)</span>}{s.une.coalition.includes(f.id) && <span className="tag c-politics" style={{ marginLeft: 6 }}>coalition</span>}</td>
              <td className="n">{f.active ? fmtPct(f.support, 1) : '—'}</td>
              <td className="n">{f.seats || ''}</td>
              <td className="tiny muted" style={{ maxWidth: 260 }}>{f.axes.map((v, i) => (Math.abs(v) >= 0.5 ? AXES[i].split(' ↔ ')[v > 0 ? 0 : 1] : null)).filter(Boolean).join(', ')}</td>
              <td className="small muted">{f.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

export { X, fmtMoney };
