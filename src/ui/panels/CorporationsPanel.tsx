import React from 'react';
import { useGame } from '../../client/client';
import { Panel, Bar, PageTitle, useNav, Stat } from '../components';
import { FACILITY } from '../../sim/content/facilities';
import { TECH } from '../../sim/content/techs';
import { fmtMoney, fmtNum, fmtPct } from '../../sim/core/format';
import { formatDate } from '../../sim/core/time';
import { settlementList } from '../../sim/systems/helpers';
import { Avatar } from '../avatar';

export function CorporationsPanel() {
  const s = useGame()!;
  const nav = useNav();
  const list = Object.values(s.corporations).sort((a, b) => Number(b.alive) - Number(a.alive) || b.valuation - a.valuation);
  const sel = s.corporations[nav.selection.corporations ?? ''] ?? list[0];
  const assets: { st: string; type: string; count: number; stId: string }[] = [];
  for (const st of settlementList(s)) for (const f of st.facilities) if (f.owner === sel?.id) assets.push({ st: st.name, stId: st.id, type: f.type, count: f.count });
  const fleets = Object.values(s.fleets).filter((f) => f.owner === sel?.id);
  const routes = Object.values(s.routes).filter((r) => r.owner === sel?.id);
  const total = list.filter((c) => c.alive).reduce((a, c) => a + c.valuation, 0);
  return (
    <div className="page">
      <PageTitle title="Corporations" sub="Independent strategic actors: they invest where they expect profits, lobby, merge and fail" />
      <Panel title="Companies" accent="industry">
        <div className="scroll">
          <table className="t">
            <thead><tr><th>Company</th><th>Sector</th><th>Home</th><th>Structure</th><th className="n">Valuation</th><th className="n">Revenue/yr</th><th className="n">Profit/yr</th><th className="n">Cash</th><th className="n">Debt</th><th>Influence</th><th className="n">Share</th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className={`click ${c.id === sel?.id ? 'sel' : ''}`} onClick={() => nav.select('corporations', c.id)} style={{ opacity: c.alive ? 1 : 0.4 }}>
                  <td><i style={{ display: 'inline-block', width: 9, height: 9, background: c.color, marginRight: 6 }} />{c.name}{!c.alive && ' (defunct)'}</td>
                  <td>{c.sector}</td>
                  <td>{c.home ? s.nations[c.home]?.short : '—'}</td>
                  <td className="muted">{c.structure}</td>
                  <td className="n">{fmtMoney(c.valuation)}</td>
                  <td className="n">{fmtMoney(c.revenue)}</td>
                  <td className="n" style={{ color: c.profit < 0 ? 'var(--c-bad)' : undefined }}>{fmtMoney(c.profit)}</td>
                  <td className="n">{fmtMoney(c.cash)}</td>
                  <td className="n">{fmtMoney(c.debt)}</td>
                  <td style={{ width: 90 }}><Bar value={c.influence} color="var(--c-industry)" /></td>
                  <td className="n">{c.alive ? fmtPct(c.valuation / Math.max(1, total), 0) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {sel && (
        <div className="grid g3" style={{ marginTop: 12 }}>
          <Panel title={sel.name} accent="industry">
            <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              {s.characters[sel.ceoId] && <Avatar id={sel.ceoId} size={48} />}
              <div className="col" style={{ gap: 2 }}>
                <div className="hl">{s.characters[sel.ceoId]?.name}</div>
                <div className="tiny muted">Chief executive · {s.characters[sel.ceoId]?.background}</div>
                <div className="tiny muted">Founded {formatDate(sel.founded)}</div>
              </div>
            </div>
            <div className="small" style={{ margin: '8px 0' }}>{sel.description}</div>
            <div className="stats">
              <Stat label="Reputation" value={fmtPct(sel.reputation, 0)} />
              <Stat label="Workforce" value={fmtNum(sel.workforce)} />
              <Stat label="Risk appetite" value={fmtPct(sel.riskAppetite, 0)} />
              <Stat label="Distress" value={sel.distress.toFixed(1)} color={sel.distress > 3 ? 'var(--c-bad)' : undefined} />
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>Focus: {sel.focus.join(', ')}</div>
          </Panel>
          <Panel title="Assets" accent="industry">
            {assets.length === 0 && <div className="small muted">No facilities.</div>}
            <table className="t">
              <tbody>
                {assets.map((a, i) => (
                  <tr key={i} className="click" onClick={() => nav.go('colonies', a.stId)}>
                    <td>{FACILITY[a.type]?.name}</td>
                    <td className="muted">{a.st}</td>
                    <td className="n">{fmtNum(a.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="hr" />
            <div className="small">{fleets.reduce((a, f) => a + f.count, 0)} ships in {fleets.length} fleets · {routes.length} routes</div>
          </Panel>
          <Panel title="Intellectual property" accent="science">
            {sel.techs.length === 0 && <div className="small muted">No proprietary technologies.</div>}
            {sel.techs.map((t) => (
              <div key={t} className="row small" style={{ justifyContent: 'space-between' }}>
                <span>{TECH[t]?.name}</span>
                <span className={s.tech[t]?.owner === sel.id ? 'warn' : 'muted'}>{s.tech[t]?.owner === sel.id ? 'proprietary' : 'licensed / public'}</span>
              </div>
            ))}
            <div className="note small" style={{ marginTop: 8 }}>Proprietary technologies can only be used by their owner unless the UNE buys a license (Research panel) or passes the Compulsory Licensing Act.</div>
          </Panel>
        </div>
      )}
    </div>
  );
}
