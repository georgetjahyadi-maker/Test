import React, { useState } from 'react';
import { useGame } from '../../client/client';
import { Panel, Stat, PageTitle, X } from '../components';
import { GOODS, GOOD } from '../../sim/content/goods';
import { REGION_NAME } from '../../sim/systems/markets';
import { SITE } from '../../sim/content/sites';
import { fmtNum, fmtMoney, fmtPct } from '../../sim/core/format';
import { earthGDP, spaceGDP, settlementList, popOf } from '../../sim/systems/helpers';
import { monthlyLaunchCap } from '../../sim/systems/logistics';

const KEY_GOODS = ['water', 'oxygen', 'propellant', 'hydrogen', 'food', 'supplies', 'alloys', 'machinery', 'electronics', 'semiconductors', 'photovoltaics', 'pgm', 'fusionFuel'];

export function EconomyPanel() {
  const s = useGame()!;
  const [showAll, setShowAll] = useState(false);
  const regions = Object.keys(s.markets).filter((r) => r === 'earth' || settlementList(s).some((st) => SITE[st.siteId].region === r));
  const goods = showAll ? GOODS.map((g) => g.id) : KEY_GOODS;
  const flows: Record<string, number> = {};
  for (const r of Object.values(s.routes)) {
    const o = s.settlements[r.origin], d = s.settlements[r.destination];
    if (!o || !d) continue;
    const key = `${REGION_NAME[SITE[o.siteId].region]} → ${REGION_NAME[SITE[d.siteId].region]}`;
    flows[key] = (flows[key] ?? 0) + r.stats.deliveredYear;
  }
  const maxFlow = Math.max(1, ...Object.values(flows));
  const cap = monthlyLaunchCap(s) * 12;
  return (
    <div className="page">
      <PageTitle title="Economy" sub="Physical goods, regional prices and the cost of moving mass through gravity wells" />
      <div className="stats" style={{ marginBottom: 12 }}>
        <Stat label="Earth GDP" value={fmtMoney(earthGDP(s))} explain="top.gdp" />
        <Stat label="Off-world GDP" value={fmtMoney(spaceGDP(s))} sub={fmtPct(spaceGDP(s) / Math.max(1, earthGDP(s)), 2) + ' of Earth'} explain="top.gdp" />
        <Stat label="Launch price to LEO" value={`${fmtMoney(s.earth.launchPrice)}/t`} explain="earth.launchPrice" />
        <Stat label="Launch capacity" value={`${fmtNum(cap)} t/yr`} sub={`${fmtPct(s.earth.launchUsedMonth * 12 / Math.max(1, cap), 0)} used last month`} />
        <Stat label="Solar energy price" value={`${s.swarm.energyPrice.toFixed(1)} cr/MWh`} />
        <Stat label="Climate stress" value={s.earth.climateStress.toFixed(2)} explain="earth.climate" color={s.earth.climateStress > 0.7 ? 'var(--c-bad)' : undefined} />
      </div>
      <Panel title="Regional prices (cr per tonne)" accent="industry" right={<button className="btn small" onClick={() => setShowAll(!showAll)}>{showAll ? 'Key goods' : 'All goods'}</button>}>
        <div className="scroll">
          <table className="t">
            <thead>
              <tr><th>Good</th>{regions.map((r) => <th key={r} className="n">{REGION_NAME[r]}</th>)}</tr>
            </thead>
            <tbody>
              {goods.map((g) => (
                <tr key={g}>
                  <td className="hl" title={GOOD[g].description}>{GOOD[g].name}</td>
                  {regions.map((r) => {
                    const m = s.markets[r];
                    const p = m.prices[g];
                    const high = r !== 'earth' && p >= (m.ceiling[g] ?? p) * 0.98;
                    const low = r !== 'earth' && p <= (m.floor[g] ?? 0) * 1.05;
                    return <td key={r} className="n" style={{ color: high ? 'var(--c-warn)' : low ? 'var(--c-good)' : undefined }} title={r === 'earth' ? '' : `ceiling ${fmtNum(m.ceiling[g])} · floor ${fmtNum(m.floor[g])} · supply ${fmtNum(m.supply[g] ?? 0)} t/mo · demand ${fmtNum(m.demand[g] ?? 0)} t/mo`}>{fmtNum(p)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="note small" style={{ marginTop: 8 }}>
          Off-world prices sit between <b className="warn">import parity</b> (the Earth price plus the cost of lifting and flying it there) and <b className="good">export netback</b> (what the goods fetch elsewhere, minus freight). Water at the lunar pole is worth a fortune until someone mines it. <X k="market.luna.water" title="Luna water price">Luna water price breakdown</X>
        </div>
      </Panel>
      <div className="grid g2" style={{ marginTop: 12 }}>
        <Panel title="Freight flows (t/yr)" accent="industry">
          {Object.keys(flows).length === 0 && <div className="muted small">No freight flows yet.</div>}
          {Object.entries(flows).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <div key={k} style={{ marginBottom: 6 }}>
              <div className="row small" style={{ justifyContent: 'space-between' }}><span>{k}</span><span>{fmtNum(v)}</span></div>
              <div className="bar"><i style={{ width: `${(Math.log10(v + 1) / Math.log10(maxFlow + 1)) * 100}%`, background: 'var(--c-industry)' }} /></div>
            </div>
          ))}
        </Panel>
        <Panel title="Settlement economies" accent="industry">
          <table className="t">
            <thead><tr><th>Settlement</th><th className="n">GDP</th><th className="n">Imports/yr</th><th className="n">Exports/yr</th><th className="n">Subsidy/yr</th></tr></thead>
            <tbody>
              {settlementList(s).sort((a, b) => b.economy.gdp - a.economy.gdp).map((st) => (
                <tr key={st.id}>
                  <td>{st.name} <span className="tiny muted">{fmtNum(popOf(st))}</span></td>
                  <td className="n">{fmtMoney(st.economy.gdp)}</td>
                  <td className="n">{fmtMoney(st.economy.importsValue)}</td>
                  <td className="n">{fmtMoney(st.economy.exportsValue)}</td>
                  <td className="n" style={{ color: st.economy.subsidy > 0 ? 'var(--c-warn)' : undefined }}>{fmtMoney(st.economy.subsidy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Earth prices for space-sourced goods" accent="industry">
          <table className="t">
            <thead><tr><th>Good</th><th className="n">Earth price</th><th className="n">2048 price</th><th className="n">Space supply</th></tr></thead>
            <tbody>
              {GOODS.filter((g) => g.earthDemand).map((g) => (
                <tr key={g.id}>
                  <td>{g.name}</td>
                  <td className="n">{fmtMoney(s.earth.prices[g.id])}/t</td>
                  <td className="n muted">{fmtMoney(g.price)}/t</td>
                  <td className="n">{fmtNum(s.earth.spaceSupply[g.id] ?? 0)} t/yr</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Earth" accent="industry">
          <div className="kv small">
            <span className="k">Primary energy demand</span><span className="v">{s.earth.energyDemandTW.toFixed(1)} TW</span>
            <span className="k">Clean energy share</span><span className="v">{fmtPct(s.earth.cleanShare)}</span>
            <span className="k">Beamed solar power received</span><span className="v">{s.earth.beamedTW.toFixed(2)} TW</span>
            <span className="k">Climate stress</span><span className="v"><X k="earth.climate" title="Climate stress">{s.earth.climateStress.toFixed(3)}</X></span>
            <span className="k">Orbital debris risk</span><span className="v"><X k="earth.debris" title="Debris risk">{fmtPct(s.earth.debrisRisk)}</X></span>
          </div>
        </Panel>
      </div>
    </div>
  );
}
