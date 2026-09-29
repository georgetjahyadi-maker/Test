import React from 'react';
import { useGame, run, toast } from '../../client/client';
import { Panel, Stat, Bar, PageTitle, X, useNav } from '../components';
import { fmtNum, fmtMoney, fmtPct } from '../../sim/core/format';
import { formatDate } from '../../sim/core/time';
import { deflectionOptions } from '../../sim/systems/security';
import { designStats } from '../../sim/systems/designs';
import { REGION_NAME } from '../../sim/systems/markets';
import { actorName } from '../../sim/systems/helpers';

export function SecurityPanel() {
  const s = useGame()!;
  const nav = useNav();
  const sec = s.security;
  const active = sec.threats.filter((t) => t.status === 'tracking' || t.status === 'mission').sort((a, b) => a.impactDay - b.impactDay);
  const past = sec.threats.filter((t) => !(t.status === 'tracking' || t.status === 'mission')).sort((a, b) => b.impactDay - a.impactDay);
  const patrols = Object.values(s.fleets).filter((f) => f.patrolRegion);
  const warships = Object.values(s.fleets).filter((f) => f.owner === 'une' && s.designs[f.designId] && designStats(s, s.designs[f.designId]).combatRating > 0);
  const piracy = Object.entries(sec.piracy).filter(([, v]) => v > 0.0001).sort((a, b) => b[1] - a[1]);
  return (
    <div className="page">
      <PageTitle title="Security" sub="Planetary defense, orbital debris, piracy, war and the governance of machine intelligence" />
      <div className="stats" style={{ marginBottom: 12 }}>
        <Stat label="NEO survey coverage" value={fmtPct(s.earth.surveyCoverage, 0)} explain="earth.survey" />
        <Stat label="Kessler risk" value={fmtPct(s.earth.debrisRisk, 1)} explain="earth.debris" color={s.earth.debrisRisk > 0.4 ? 'var(--c-bad)' : undefined} />
        <Stat label="Orbital object index" value={s.earth.orbitalObjects.toFixed(2)} sub="1.00 = 2048" />
        <Stat label="Global tension" value={fmtPct(sec.tension, 0)} color={sec.tension > 0.6 ? 'var(--c-bad)' : undefined} />
        <Stat label="AI risk" value={fmtPct(sec.aiRisk, 0)} color={sec.aiRisk > 0.6 ? 'var(--c-bad)' : sec.aiRisk > 0.35 ? 'var(--c-warn)' : undefined} />
        <Stat label="UNE security forces" value={fmtNum(sec.forcesCombat)} sub="combat rating" />
        <Stat label="Piracy incidents (12 mo)" value={fmtNum(sec.incidentsYear)} />
        <Stat label="Planetary defense" value={s.une.competencies.planetaryDefense ?? 'national'} sub="UNE competency" />
      </div>
      <div className="grid g2">
        <Panel title={`Impact threats (${active.length})`} accent="security" style={{ gridColumn: '1 / -1' }}>
          {active.length === 0 && <div className="small muted">No objects currently threaten Earth. Survey coverage decides how much warning the next one gives.</div>}
          {active.map((t) => {
            const opts = deflectionOptions(s, t.id);
            const years = (t.impactDay - s.day) / 365.25;
            return (
              <div key={t.id} style={{ border: '1px solid var(--border)', padding: 10, marginBottom: 8, background: t.diameterM > 400 ? '#1a0d0d' : undefined }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="hl" style={{ fontSize: 14 }}>{t.name}</span>
                  <span className={`tag ${t.status === 'mission' ? 'c-science' : 'c-bad'}`}>{t.status === 'mission' ? 'mission en route' : 'tracking'}</span>
                </div>
                <div className="kv small" style={{ margin: '6px 0' }}>
                  <span className="k">Diameter</span><span className="v">{fmtNum(t.diameterM)} m ({t.diameterM >= 1500 ? 'civilization-ending' : t.diameterM >= 400 ? 'continental catastrophe' : t.diameterM >= 140 ? 'regional devastation' : 'city-killer'})</span>
                  <span className="k">Impact probability</span><span className="v" style={{ color: t.probability > 0.3 ? 'var(--c-bad)' : undefined }}>{fmtPct(t.probability, 1)}</span>
                  <span className="k">Closest approach</span><span className="v">{formatDate(t.impactDay)} ({years.toFixed(1)} years)</span>
                  <span className="k">Impact corridor</span><span className="v">{s.nations[t.region]?.name ?? t.region}</span>
                  <span className="k">Discovered</span><span className="v">{formatDate(t.discoveredDay)}</span>
                </div>
                <Bar value={t.probability} color="var(--c-security)" />
                {t.mission ? (
                  <div className="note small" style={{ marginTop: 8 }}>{t.mission.method} mission launched {formatDate(t.mission.launchDay)}. It arrives {formatDate(t.mission.arrivalDay)} with an estimated {fmtPct(t.mission.successChance, 0)} chance of success.</div>
                ) : (
                  <table className="t" style={{ marginTop: 8 }}>
                    <thead><tr><th>Deflection method</th><th className="n">Success chance</th><th className="n">Transit</th><th className="n">Cost</th><th /></tr></thead>
                    <tbody>
                      {opts.map((o) => (
                        <tr key={o.method} style={{ opacity: o.available ? 1 : 0.5 }}>
                          <td>{o.label}</td>
                          <td className="n">{fmtPct(o.chance, 0)}</td>
                          <td className="n">{Math.round(o.transitDays)} d</td>
                          <td className="n">{fmtMoney(o.cost)}</td>
                          <td>{o.available ? <button className="btn small primary" onClick={async () => { const r = await run({ type: 'deflect', threatId: t.id, method: o.method }); if (r.ok) toast(`Deflection mission launched toward ${t.name}`, 'ok'); }}>Launch</button> : <span className="tiny warn">{o.reason}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
          <div className="tiny muted">Earlier missions have better odds: a small push years ahead moves the arrival point by thousands of kilometres. If a deflection fails, another mission can be sent while time remains.</div>
        </Panel>
        <Panel title="Wars & tension" accent="security">
          {sec.wars.length === 0 && <div className="small muted">No active interstate wars.</div>}
          {sec.wars.map((w) => (
            <div key={w.id} style={{ marginBottom: 8 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="hl">{s.nations[w.a]?.name} vs {s.nations[w.b]?.name}</span>
                <span className="tiny muted">since {formatDate(w.startDay)}</span>
              </div>
              <Bar value={w.intensity} color="var(--c-security)" title="intensity" />
            </div>
          ))}
          <div className="hr" />
          <div className="small">Tension rises with national grievances, weak UNE legitimacy, climate stress and resource scrambles. Above 72% wars become possible. An arms-control regime reduces the risk of nuclear escalation.</div>
          <div className="hr" />
          <div className="tiny muted" style={{ marginBottom: 4 }}>WORST BILATERAL RELATIONS</div>
          {(() => {
            const pairs: [string, string, number][] = [];
            const ids = Object.keys(s.nations).sort();
            for (const a of ids) for (const b of ids) if (a < b) pairs.push([a, b, s.nations[a].relations[b] ?? 0]);
            return pairs.sort((x, y) => x[2] - y[2]).slice(0, 5).map(([a, b, v]) => (
              <div key={a + b} className="row small" style={{ justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => nav.go('nations', a)}>
                <span>{s.nations[a].short} – {s.nations[b].short}</span>
                <span style={{ color: v < 0 ? 'var(--c-bad)' : undefined }}>{v.toFixed(2)}</span>
              </div>
            ));
          })()}
        </Panel>
        <Panel title="Artificial intelligence" accent="security">
          <Bar value={sec.aiRisk} color={sec.aiRisk > 0.6 ? 'var(--c-bad)' : 'var(--c-warn)'} />
          <div className="small" style={{ marginTop: 8 }}>Machine cognition, self-replicating industry and high automation drive risk up. The AI Safety Board and alignment research bring it down. Above 92%, loss of control becomes possible.</div>
          <div className="kv small" style={{ marginTop: 8 }}>
            <span className="k">AI Safety Board</span><span className="v">{s.une.institutions.aiBoard?.active ? fmtPct(s.une.institutions.aiBoard.effectiveness, 0) + ' effective' : 'not established'}</span>
            <span className="k">Machine cognition</span><span className="v">{s.tech.machine_cognition?.known ? 'developed' : 'not yet'}</span>
            <span className="k">Self-replicating industry</span><span className="v">{s.tech.self_replicating_industry?.known ? 'developed' : 'not yet'}</span>
          </div>
        </Panel>
        <Panel title="Piracy & patrols" accent="security">
          {piracy.length === 0 && <div className="small muted">Shipping lanes are quiet.</div>}
          {piracy.map(([reg, v]) => (
            <div key={reg} style={{ marginBottom: 6 }}>
              <div className="row small" style={{ justifyContent: 'space-between' }}><span>{REGION_NAME[reg] ?? reg}</span><span>{fmtPct(v, 2)} per shipment</span></div>
              <Bar value={v * 4} color="var(--c-security)" thin />
            </div>
          ))}
          <div className="hr" />
          <div className="tiny muted" style={{ marginBottom: 4 }}>PATROLS</div>
          {patrols.length === 0 && <div className="small muted">No patrols assigned. Assign warships to a region in Logistics → Fleets.</div>}
          {patrols.map((f) => (
            <div key={f.id} className="row small" style={{ justifyContent: 'space-between' }}>
              <span>{f.count} × {s.designs[f.designId]?.name} ({actorName(s, f.owner)})</span>
              <span className="muted">{REGION_NAME[f.patrolRegion!]}</span>
            </div>
          ))}
          <div className="tiny muted" style={{ marginTop: 6 }}>{warships.reduce((a, f) => a + f.count, 0)} UNE warships in service. Piracy grows where trade is rich, policing is thin and settlers are poor.</div>
        </Panel>
        <Panel title="Orbital environment" accent="security">
          <div className="small">Every launch adds objects to Earth orbit. The Orbital Safety Authority, traffic-management standards and debris-removal technology remove them. <X k="earth.debris" title="Debris risk">Breakdown</X></div>
          <div style={{ marginTop: 8 }}><Bar value={s.earth.debrisRisk} color={s.earth.debrisRisk > 0.4 ? 'var(--c-bad)' : 'var(--c-warn)'} /></div>
          <div className="tiny muted" style={{ marginTop: 4 }}>A Kessler cascade raises launch prices and can close low orbit entirely.</div>
        </Panel>
        {past.length > 0 && (
          <Panel title="Resolved threats" accent="security">
            <table className="t">
              <tbody>
                {past.slice(0, 12).map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td className="n">{fmtNum(t.diameterM)} m</td>
                    <td className={t.status === 'impacted' ? 'bad' : t.status === 'deflected' ? 'good' : 'muted'}>{t.status}</td>
                    <td className="small muted">{formatDate(t.impactDay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </div>
    </div>
  );
}
