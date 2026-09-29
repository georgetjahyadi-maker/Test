import React from 'react';
import { useGame } from '../../client/client';
import { Panel, Stat, PageTitle, Pyramid, useNav, StackBar, X } from '../components';
import { fmtNum, fmtPct } from '../../sim/core/format';
import { settlementList, popOf, earthPopulation, offworldPopulation, tierOf } from '../../sim/systems/helpers';
import { cultureName } from '../../sim/systems/politics';
import { SITE } from '../../sim/content/sites';

const CULTURE_COLOR: Record<string, string> = { terran: '#4da3ff', lunar: '#c9d3dc', martian: '#e0763c', belt: '#9aa7b8', mercurian: '#ffb347', jovian: '#d9b48a', saturnian: '#e6cf9a', habitatBorn: '#5fd38a', freeSpacer: '#b98cff' };

export function PopulationPanel() {
  const s = useGame()!;
  const nav = useNav();
  const sts = settlementList(s).sort((a, b) => popOf(b) - popOf(a));
  const sel = s.settlements[nav.selection.population ?? ''] ?? sts[0];
  const off = offworldPopulation(s);
  const earth = earthPopulation(s);
  const cultures: Record<string, number> = { terran: earth };
  let births = 0, deaths = 0, imm = 0, localBorn = 0;
  for (const st of sts) {
    const p = popOf(st);
    for (const k in st.pop.cultures) cultures[k] = (cultures[k] ?? 0) + st.pop.cultures[k] * p;
    births += st.pop.births;
    deaths += st.pop.deaths;
    imm += st.pop.immigrants;
    localBorn += st.pop.localBorn;
  }
  const offCult: Record<string, number> = {};
  for (const st of sts) for (const k in st.pop.cultures) offCult[k] = (offCult[k] ?? 0) + st.pop.cultures[k] * popOf(st);
  return (
    <div className="page">
      <PageTitle title="Population" sub="Statistical cohorts: ages, health, migration, identity" />
      <div className="stats" style={{ marginBottom: 12 }}>
        <Stat label="Humanity" value={fmtNum(off + earth)} explain="top.population" />
        <Stat label="Earth" value={fmtNum(earth)} />
        <Stat label="Beyond Earth" value={fmtNum(off)} sub={fmtPct(off / Math.max(1, off + earth), 4)} />
        <Stat label="Born beyond Earth" value={fmtNum(localBorn)} />
        <Stat label="Off-world births (12 mo)" value={fmtNum(births * 12)} />
        <Stat label="Off-world deaths (12 mo)" value={fmtNum(deaths * 12)} />
        <Stat label="Arrivals (12 mo)" value={fmtNum(imm * 12)} />
      </div>
      <div className="grid g2">
        <Panel title="Settlements" accent="population">
          <div className="scroll" style={{ maxHeight: 460 }}>
            <table className="t">
              <thead><tr><th>Settlement</th><th className="n">Population</th><th>Tier</th><th className="n">Wellbeing</th><th className="n">Health</th><th className="n">Dose mSv/yr</th><th className="n">Gravity debt</th><th className="n">Unemp.</th></tr></thead>
              <tbody>
                {sts.map((st) => (
                  <tr key={st.id} className={`click ${st.id === sel?.id ? 'sel' : ''}`} onClick={() => nav.select('population', st.id)}>
                    <td>{st.name}</td>
                    <td className="n">{fmtNum(popOf(st))}</td>
                    <td className="muted small">{tierOf(popOf(st))}</td>
                    <td className="n"><X k={`set:${st.id}:wellbeing`} title={`${st.name} wellbeing`}>{fmtPct(st.pop.wellbeing, 0)}</X></td>
                    <td className="n">{fmtPct(st.pop.health, 0)}</td>
                    <td className="n" style={{ color: st.pop.radiation > 100 ? 'var(--c-bad)' : undefined }}>{fmtNum(st.pop.radiation)}</td>
                    <td className="n">{fmtPct(st.pop.gravityDebt, 0)}</td>
                    <td className="n">{fmtPct(st.pop.unemployment, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Identities" accent="population">
          <div className="tiny muted">HUMANITY</div>
          <StackBar parts={Object.keys(cultures).map((k) => ({ label: cultureName(k), value: cultures[k], color: CULTURE_COLOR[k] ?? '#888' }))} />
          <div className="tiny muted" style={{ marginTop: 10 }}>BEYOND EARTH</div>
          <StackBar parts={Object.keys(offCult).map((k) => ({ label: cultureName(k), value: offCult[k], color: CULTURE_COLOR[k] ?? '#888' }))} />
          <div className="legend">
            {Object.keys(offCult).sort((a, b) => offCult[b] - offCult[a]).map((k) => (
              <span className="chip" key={k}><i style={{ background: CULTURE_COLOR[k] }} />{cultureName(k)} {fmtNum(offCult[k])}</span>
            ))}
          </div>
          <div className="note small" style={{ marginTop: 8 }}>Identities shift with birthplace, isolation, gravity and shared history. They affect political preferences probabilistically, not deterministically.</div>
        </Panel>
        {sel && (
          <Panel title={`${sel.name}: age structure`} accent="population">
            <Pyramid bands={sel.pop.bands} />
            <div className="kv small">
              <span className="k">Life expectancy</span><span className="v">{sel.pop.lifeExpectancy.toFixed(0)} years</span>
              <span className="k">Families permitted</span><span className="v">{sel.pop.familiesAllowed ? 'yes' : 'no (outpost, medical or radiation limits)'}</span>
              <span className="k">Tertiary educated</span><span className="v">{fmtPct(sel.pop.educated, 0)}</span>
              <span className="k">Psychological health</span><span className="v">{fmtPct(sel.pop.psych, 0)}</span>
              <span className="k">Effective gravity</span><span className="v">{(SITE[sel.siteId].gravity * (1 - sel.gravityCountermeasure) + sel.gravityCountermeasure).toFixed(2)} g</span>
              <span className="k">Radiation shielding</span><span className="v">{fmtPct(sel.shielding, 0)}</span>
            </div>
          </Panel>
        )}
        {sel && (
          <Panel title={`${sel.name}: workforce`} accent="population">
            <div className="kv small">
              <span className="k">Workforce</span><span className="v">{fmtNum(sel.workforce)}</span>
              <span className="k">Facility jobs</span><span className="v">{fmtNum(sel.jobs)}</span>
              <span className="k">Employed</span><span className="v">{fmtNum(sel.employed)}</span>
              <span className="k">Automation level</span><span className="v">{sel.automation.toFixed(1)} / 6</span>
              <span className="k">Wage</span><span className="v">{fmtNum(sel.economy.wage)} cr/yr</span>
              <span className="k">Housing</span><span className="v">{fmtNum(sel.housing)}</span>
              <span className="k">Waiting to migrate here</span><span className="v">{fmtNum((sel.flags.migrationDemand as number) ?? 0)}/mo</span>
            </div>
            <div className="note small" style={{ marginTop: 8 }}>Automation reduces labour demand per facility (level 6 needs about 30% of the original crew). Displaced workers push Labor Coalition support up on Earth unless transition policies exist.</div>
          </Panel>
        )}
      </div>
    </div>
  );
}
