import React, { useState } from 'react';
import { useGame, run, toast } from '../../client/client';
import { Panel, Stat, Bar, PageTitle, NumberInput, X, Tabs } from '../components';
import { COMPETENCIES, INSTITUTION, FACTION } from '../../sim/content/actors';
import { GRAND_PROJECTS } from '../../sim/content/misc';
import { fmtMoney, fmtPct, fmtNum } from '../../sim/core/format';
import { formatDate } from '../../sim/core/time';
import { annualRevenue } from '../../sim/systems/politics';
import { scaleFor, totalFunding } from '../../sim/systems/une';
import { projectAvailability } from '../../sim/systems/projects';
import { Avatar } from '../avatar';

const LEVEL_COLOR: Record<string, string> = { national: '#7d8b99', limited: '#ffb347', shared: '#4da3ff', exclusive: '#5fd38a' };

export function UNEPanel() {
  const s = useGame()!;
  const u = s.une;
  const [tab, setTab] = useState<'overview' | 'budget' | 'competencies' | 'projects'>('overview');
  const sg = s.characters[u.sgId];
  const rev = annualRevenue(s);
  return (
    <div className="page">
      <PageTitle title={u.name} sub={`${u.constitution} · ${u.upperHouse} + ${u.lowerHouse}`} />
      <Tabs tabs={[{ id: 'overview', label: 'Overview' }, { id: 'budget', label: 'Budget & Institutions' }, { id: 'competencies', label: 'Competencies' }, { id: 'projects', label: 'Grand Projects' }]} value={tab} onChange={setTab} />
      {tab === 'overview' && (
        <div className="grid g2">
          <Panel title="Executive" accent="politics">
            <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              {sg && <Avatar id={sg.id} size={64} />}
              <div className="col" style={{ gap: 2 }}>
                <div className="hl" style={{ fontSize: 15 }}>{sg?.name ?? '—'}</div>
                <div className="muted small">Secretary-General · {sg?.background}</div>
                <div className="small">{FACTION[sg?.factionId ?? '']?.name ?? ''}</div>
                <div className="small muted">Coalition: {u.coalition.map((f) => FACTION[f]?.short ?? f).join(' · ')}</div>
                <div className="small muted">{u.directSG ? 'Directly elected' : 'Chosen by the Assembly'} · next election {formatDate(u.nextElection)}</div>
              </div>
            </div>
            <div className="hr" />
            <div className="muted tiny" style={{ marginBottom: 4 }}>EXECUTIVE COUNCIL</div>
            <div className="row" style={{ gap: 10 }}>
              {u.councilIds.map((id) => {
                const c = s.characters[id];
                if (!c) return null;
                return (
                  <div key={id} className="col" style={{ alignItems: 'center', width: 80, gap: 2 }} title={`${c.name} — ${c.background}`}>
                    <Avatar id={c.id} size={40} />
                    <div className="tiny" style={{ textAlign: 'center' }}>{c.name.split(' ').slice(-1)[0]}</div>
                    <div className="tiny muted">{FACTION[c.factionId ?? '']?.short}</div>
                  </div>
                );
              })}
            </div>
          </Panel>
          <Panel title="Federal finances" accent="politics">
            <div className="stats">
              <Stat label="Treasury" value={fmtMoney(u.treasury)} color={u.treasury < 0 ? 'var(--c-bad)' : undefined} explain="une.revenue" />
              <Stat label="Debt" value={fmtMoney(u.debt)} sub={`${fmtPct(u.interestRate)} interest`} />
              <Stat label="Credit rating" value={fmtPct(u.creditRating, 0)} sub={u.bondsAuthorized ? 'Borrowing authorized' : 'No borrowing authority'} />
              <Stat label="Annual revenue" value={fmtMoney(rev)} explain="une.revenue" />
              <Stat label="Agency budgets" value={fmtMoney(totalFunding(s))} sub="per year" explain="une.expenses" />
              <Stat label="Political capital" value={Math.floor(u.politicalCapital)} sub="spent on bills and reforms" />
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn small" disabled={u.debt <= 0 || u.treasury <= 0} onClick={() => run({ type: 'repayDebt', amount: Math.min(u.debt, u.treasury * 0.5) })}>Repay debt</button>
              <button className="btn small" disabled={!u.bondsAuthorized} onClick={() => run({ type: 'issueBonds', amount: rev * 0.25 })}>Issue bonds ({fmtMoney(rev * 0.25)})</button>
            </div>
          </Panel>
          <Panel title="Delegation to the Secretariat" accent="politics">
            <div className="muted small" style={{ marginBottom: 8 }}>Delegated domains are managed automatically by the Secretariat each month. You can still act in them yourself.</div>
            {[
              ['budget', 'Budget: fund agencies at their growing baseline and repay debt'],
              ['logistics', 'Logistics: keep UNE settlements supplied, create routes and order ships'],
              ['construction', 'Construction: build what UNE settlements need'],
              ['research', 'Research: keep the research queue filled'],
              ['expansion', 'Expansion: found new UNE settlements'],
              ['legislation', 'Legislation: propose useful laws and advance colony status'],
              ['events', 'Decisions: resolve events automatically (no pauses)'],
            ].map(([k, label]) => (
              <label key={k} className="row" style={{ marginBottom: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!u.delegation[k]} onChange={(e) => run({ type: 'setDelegation', domain: k, value: e.target.checked })} />
                <span className="small">{label}</span>
              </label>
            ))}
          </Panel>
          <Panel title="Emergency powers" accent="security">
            {u.emergency ? (
              <>
                <div className="note bad">In force since {formatDate(u.emergency.declaredDay)}: {u.emergency.reason}. Expires {formatDate(u.emergency.expiresDay)}.</div>
                <div className="small" style={{ margin: '6px 0' }}>Expanded competencies: {Object.entries(u.emergency.powers).map(([k, v]) => `${k} → ${v}`).join(', ')}</div>
                <button className="btn" onClick={() => run({ type: 'endEmergency' })}>Surrender emergency powers</button>
              </>
            ) : (
              <>
                <div className="muted small">In a crisis the Executive may temporarily expand federal authority over security, migration and resources. Emergencies erode constitutional stability, and powers that are not surrendered change the Union permanently.</div>
                <button className="btn danger" style={{ marginTop: 8 }} onClick={() => run({ type: 'declareEmergency', reason: 'Executive declaration' })}>Declare an emergency (40 PC)</button>
              </>
            )}
          </Panel>
        </div>
      )}
      {tab === 'budget' && <BudgetTab />}
      {tab === 'competencies' && (
        <Panel title="Distribution of authority (the Compact)" accent="politics">
          <table className="t">
            <thead>
              <tr><th>Policy area</th><th>Group</th><th>UNE authority</th><th>Meaning</th></tr>
            </thead>
            <tbody>
              {COMPETENCIES.map((c) => {
                const lvl = u.competencies[c.id];
                return (
                  <tr key={c.id}>
                    <td className="hl">{c.name}</td>
                    <td className="muted">{c.group}</td>
                    <td><span className="tag" style={{ borderColor: LEVEL_COLOR[lvl], color: LEVEL_COLOR[lvl] }}>{lvl}</span>{u.emergency?.powers[c.id] && <span className="tag c-bad">emergency</span>}</td>
                    <td className="muted small">{c.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="note small" style={{ marginTop: 8 }}>Competencies change only through constitutional amendments (see Politics → Propose). Amendments need supermajorities in both chambers and ratification by two-thirds of member states.</div>
        </Panel>
      )}
      {tab === 'projects' && <ProjectsTab />}
    </div>
  );
}

function BudgetTab() {
  const s = useGame()!;
  const u = s.une;
  const revLast = u.revenueLastYear, expLast = u.expenseLastYear;
  const keys = (o: Record<string, number>) => Object.keys(o).sort((a, b) => o[b] - o[a]);
  return (
    <div className="grid g2">
      <Panel title="Institutions and agency budgets" accent="politics" className="" style={{ gridColumn: '1 / -1' }}>
        <table className="t">
          <thead>
            <tr><th>Institution</th><th className="n">Budget (cr/yr)</th><th className="n">Baseline</th><th>Effectiveness</th><th>Role</th></tr>
          </thead>
          <tbody>
            {Object.values(u.institutions).filter((i) => i.active).map((inst) => {
              const base = (INSTITUTION[inst.id]?.baseFunding ?? 1e9) * scaleFor(s, inst.id);
              return (
                <tr key={inst.id}>
                  <td><span className="hl">{inst.name}</span> <span className="muted tiny">{inst.short}</span></td>
                  <td className="n">
                    <NumberInput value={Math.round((u.funding[inst.id] ?? 0) / 1e8) / 10} step={0.5} min={0} onChange={(v) => run({ type: 'setFunding', institution: inst.id, amount: v * 1e9 })} width={80} /> B
                  </td>
                  <td className="n muted">{fmtMoney(base)}</td>
                  <td style={{ width: 140 }}><Bar value={inst.effectiveness / 1.4} color={inst.effectiveness < 0.7 ? 'var(--c-bad)' : undefined} title={fmtPct(inst.effectiveness)} /> <span className="tiny muted">{fmtPct(inst.effectiveness, 0)}</span></td>
                  <td className="muted small">{inst.description}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      <Panel title="Revenue">
        <table className="t">
          <thead><tr><th>Source</th><th className="n">This year</th><th className="n">Last year</th></tr></thead>
          <tbody>
            {[...new Set([...keys(u.revenueYTD), ...keys(revLast)])].map((k) => (
              <tr key={k}><td>{k}</td><td className="n">{fmtMoney(u.revenueYTD[k] ?? 0)}</td><td className="n muted">{fmtMoney(revLast[k] ?? 0)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="small muted" style={{ marginTop: 6 }}><X k="une.assessments" title="Member assessments">Assessments by member state</X></div>
      </Panel>
      <Panel title="Expenditure">
        <table className="t">
          <thead><tr><th>Purpose</th><th className="n">This year</th><th className="n">Last year</th></tr></thead>
          <tbody>
            {[...new Set([...keys(u.expenseYTD), ...keys(expLast)])].map((k) => (
              <tr key={k}><td>{k}</td><td className="n">{fmtMoney(u.expenseYTD[k] ?? 0)}</td><td className="n muted">{fmtMoney(expLast[k] ?? 0)}</td></tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function ProjectsTab() {
  const s = useGame()!;
  const [site, setSite] = useState<Record<string, string>>({});
  return (
    <div className="grid g2">
      {GRAND_PROJECTS.map((p) => {
        const gp = s.grandProjects.find((g) => g.defId === p.id);
        const candidates = p.bodies ? Object.values(s.settlements).filter((st) => p.bodies!.includes(siteBody(st.siteId))) : [];
        const sel = site[p.id] ?? candidates[0]?.id;
        const av = projectAvailability(s, p.id, sel);
        return (
          <Panel key={p.id} title={p.name} accent="industry" right={gp ? (gp.completedDay !== undefined ? <span className="tag c-good">complete</span> : <span className="tag c-warn">{fmtPct(gp.progress, 0)}</span>) : undefined}>
            <div className="small" style={{ marginBottom: 6 }}>{p.description}</div>
            <div className="small muted">{p.effectsText}</div>
            <div className="kv small" style={{ marginTop: 6 }}>
              <span className="k">Cost</span><span className="v">{fmtMoney(p.cost)}</span>
              <span className="k">Duration</span><span className="v">{(p.months / 12).toFixed(1)} years</span>
              <span className="k">Materials</span><span className="v">{Object.entries(p.materials).map(([g, v]) => `${fmtNum(v)} t ${g}`).join(', ')}</span>
            </div>
            {gp ? (
              gp.completedDay === undefined && <div style={{ marginTop: 6 }}><Bar value={gp.progress} />{gp.stalled && <div className="tiny warn">{gp.stalled}</div>}</div>
            ) : (
              <div className="row" style={{ marginTop: 8 }}>
                {p.bodies && (
                  <select value={sel} onChange={(e) => setSite({ ...site, [p.id]: e.target.value })}>
                    {candidates.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                  </select>
                )}
                <button className="btn primary" disabled={!av.ok} onClick={async () => { const r = await run({ type: 'startProject', projectId: p.id, settlementId: sel }); if (r.ok) toast(`${p.name} begins`, 'ok'); }}>Begin</button>
                {!av.ok && <span className="tiny warn">{av.reason}</span>}
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}

import { SITE } from '../../sim/content/sites';
function siteBody(siteId: string): string {
  return SITE[siteId]?.body ?? '';
}
