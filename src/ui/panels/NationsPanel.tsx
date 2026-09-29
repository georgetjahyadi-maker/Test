import React from 'react';
import { useGame } from '../../client/client';
import { Panel, Bar, PageTitle, useNav, StackBar } from '../components';
import { AXES, FACTION } from '../../sim/content/actors';
import { fmtNum, fmtPct, fmtMoney } from '../../sim/core/format';
import { formatDate } from '../../sim/core/time';
import { Avatar } from '../avatar';
import { settlementList } from '../../sim/systems/helpers';
import { nationLawInterest } from '../../sim/systems/politics';
import { LAW } from '../../sim/content/laws';

export function NationsPanel() {
  const s = useGame()!;
  const nav = useNav();
  const sel = nav.selection.nations ?? 'usa';
  const n = s.nations[sel] ?? Object.values(s.nations)[0];
  const list = Object.values(s.nations).sort((a, b) => b.gdp - a.gdp);
  const leader = s.characters[n.leaderId];
  const sponsored = settlementList(s).filter((st) => (st.sponsors[n.id] ?? 0) > 0);
  return (
    <div className="page">
      <PageTitle title="Member States" sub="Sovereign actors that pursue their own interests inside the Compact" />
      <Panel title="Delegations" accent="politics">
        <div className="scroll">
          <table className="t">
            <thead>
              <tr><th>State / bloc</th><th className="n">States</th><th className="n">Population</th><th className="n">GDP</th><th className="n">Growth</th><th>UNE support</th><th>Public opinion</th><th className="n">Stability</th><th className="n">Space budget</th><th className="n">Unemployment</th></tr>
            </thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.id} className={`click ${x.id === n.id ? 'sel' : ''}`} onClick={() => nav.select('nations', x.id)} style={{ opacity: x.member ? 1 : 0.5 }}>
                  <td><i style={{ display: 'inline-block', width: 9, height: 9, background: x.color, marginRight: 6 }} />{x.name}{!x.member && <span className="tag c-bad" style={{ marginLeft: 6 }}>withdrawn</span>}</td>
                  <td className="n">{x.states}</td>
                  <td className="n">{fmtNum(x.population)}</td>
                  <td className="n">{fmtMoney(x.gdp)}</td>
                  <td className="n" style={{ color: x.gdpGrowth < 0 ? 'var(--c-bad)' : undefined }}>{fmtPct(x.gdpGrowth)}</td>
                  <td style={{ width: 100 }}><Bar value={x.uneSupport} color={x.uneSupport < 0.35 ? 'var(--c-bad)' : undefined} /></td>
                  <td style={{ width: 100 }}><Bar value={x.publicOpinion} color="var(--c-population)" /></td>
                  <td className="n">{fmtPct(x.stability, 0)}</td>
                  <td className="n">{fmtMoney(x.gdp * x.spaceBudgetShare)}/yr</td>
                  <td className="n">{fmtPct(x.unemployment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid g3" style={{ marginTop: 12 }}>
        <Panel title={n.name} accent="politics">
          <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
            {leader && <Avatar id={leader.id} size={56} />}
            <div className="col" style={{ gap: 2 }}>
              <div className="hl">{leader?.name}</div>
              <div className="small muted">Head of government · {leader?.background}</div>
              <div className="small muted">Next transition: {formatDate(n.nextLeadershipDay)}</div>
            </div>
          </div>
          <div className="small" style={{ margin: '8px 0' }}>{n.description}</div>
          <div className="kv small">
            <span className="k">Member states represented</span><span className="v">{n.states}</span>
            <span className="k">Science output</span><span className="v">{fmtNum(n.science)} RP/yr</span>
            <span className="k">Launch capacity</span><span className="v">{fmtNum(n.launchCapacity)} t/yr</span>
            <span className="k">Military index</span><span className="v">{fmtNum(n.military)}</span>
            <span className="k">Debt / GDP</span><span className="v">{fmtPct(n.debtRatio, 0)}</span>
            <span className="k">Space funds available</span><span className="v">{fmtMoney(n.spaceFunds)}</span>
            <span className="k">Grievances</span><span className="v" style={{ color: n.grievances > 0.5 ? 'var(--c-bad)' : undefined }}>{n.grievances.toFixed(2)}</span>
            <span className="k">Compliance with UNE law</span><span className="v">{fmtPct(n.compliance, 0)}</span>
            <span className="k">Integration preference</span><span className="v">{n.integrationPref > 0.2 ? 'Deeper union' : n.integrationPref < -0.2 ? 'Looser union' : 'Neutral'}</span>
          </div>
        </Panel>
        <Panel title="Government ideology & public mood" accent="politics">
          {AXES.map((a, i) => {
            const [pos, neg] = a.split(' ↔ ');
            const v = n.ideology[i] ?? 0;
            return (
              <div key={a} style={{ marginBottom: 6 }}>
                <div className="row tiny"><span className="muted">{neg}</span><span style={{ marginLeft: 'auto' }} className="muted">{pos}</span></div>
                <div className="bar" style={{ height: 8 }}>
                  <i style={{ left: `${50 + Math.min(0, v) * 50}%`, width: `${Math.abs(v) * 50}%`, background: v > 0 ? 'var(--c-politics)' : 'var(--c-industry)' }} />
                </div>
              </div>
            );
          })}
          <div className="hr" />
          <div className="tiny muted" style={{ marginBottom: 4 }}>FACTION SUPPORT AMONG CITIZENS</div>
          <StackBar parts={Object.keys(n.factionSupport).sort((a, b) => n.factionSupport[b] - n.factionSupport[a]).map((f) => ({ label: FACTION[f]?.name ?? f, value: n.factionSupport[f], color: s.factions[f]?.color ?? '#888' }))} />
          <div className="legend">
            {Object.keys(n.factionSupport).sort((a, b) => n.factionSupport[b] - n.factionSupport[a]).slice(0, 8).map((f) => (
              <span className="chip" key={f}><i style={{ background: s.factions[f]?.color }} />{FACTION[f]?.short} {fmtPct(n.factionSupport[f], 0)}</span>
            ))}
          </div>
        </Panel>
        <Panel title="Interests & presence" accent="politics">
          <div className="tiny muted" style={{ marginBottom: 4 }}>VIEW OF LAWS IN FORCE</div>
          {Object.keys(s.laws).length === 0 && <div className="small muted">No UNE laws enacted yet.</div>}
          {Object.keys(s.laws).map((id) => {
            const v = nationLawInterest(s, n.id, id);
            return (
              <div key={id} className="row small" style={{ justifyContent: 'space-between' }}>
                <span>{LAW[id]?.name}</span>
                <span style={{ color: v > 0.15 ? 'var(--c-good)' : v < -0.15 ? 'var(--c-bad)' : 'var(--c-dim)' }}>{v > 0.15 ? 'favours' : v < -0.15 ? 'opposes' : 'neutral'}</span>
              </div>
            );
          })}
          <div className="hr" />
          <div className="tiny muted" style={{ marginBottom: 4 }}>STAKES IN SETTLEMENTS</div>
          {sponsored.length === 0 && <div className="small muted">None.</div>}
          {sponsored.map((st) => (
            <div key={st.id} className="row small click" style={{ justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => nav.go('colonies', st.id)}>
              <span>{st.name}</span>
              <span className="muted">{fmtPct(st.sponsors[n.id] / Object.values(st.sponsors).reduce((a, v) => a + v, 0), 0)}</span>
            </div>
          ))}
          <div className="hr" />
          <div className="tiny muted" style={{ marginBottom: 4 }}>RELATIONS</div>
          {Object.keys(n.relations).sort((a, b) => n.relations[b] - n.relations[a]).slice(0, 5).concat(Object.keys(n.relations).sort((a, b) => n.relations[a] - n.relations[b]).slice(0, 3)).map((id, i) => (
            <div key={id + i} className="row small" style={{ justifyContent: 'space-between' }}>
              <span>{s.nations[id]?.short}</span>
              <span style={{ color: n.relations[id] > 0.3 ? 'var(--c-good)' : n.relations[id] < 0 ? 'var(--c-bad)' : undefined }}>{n.relations[id].toFixed(2)}</span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
