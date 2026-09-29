import React, { useEffect, useState } from 'react';
import { client, useGame } from '../../client/client';
import { Panel, PageTitle, LineChart, Legend } from '../components';
import { SERIES } from '../../sim/systems/stats';
import { MONTH_NAMES, START_YEAR } from '../../sim/core/time';
import { fmtNum, fmtPct, fmtPower, fmtMoney, fmtSci } from '../../sim/core/format';
import type { StatsArchive } from '../../sim/types';

const COLORS = ['#4da3ff', '#5fd38a', '#ff9f43', '#ffd84d', '#b98cff', '#ff5c5c', '#6ee7ff', '#ff7ac8', '#c9d3dc', '#9aa7b8'];
const DEFAULT = ['population', 'offworldPop', 'earthGDP', 'spaceGDP', 'treasury', 'legitimacy', 'research', 'launchPrice', 'freight', 'swarmPower'];

function formatter(unit: string): (v: number) => string {
  switch (unit) {
    case 'cr':
    case 'cr/yr':
    case 'cr/t':
      return fmtMoney;
    case 'W':
      return fmtPower;
    case '0-1':
      return (v) => fmtPct(v, 0);
    case 'fraction':
      return (v) => (v > 0 ? fmtSci(v, 1) : '0');
    default:
      return (v) => fmtNum(v);
  }
}

export function StatsPanel() {
  const s = useGame()!;
  const [arch, setArch] = useState<StatsArchive | null>(null);
  const [res, setRes] = useState<'monthly' | 'yearly'>('yearly');
  const [sel, setSel] = useState<string[]>(DEFAULT);
  const [log, setLog] = useState<Record<string, boolean>>({ population: false, offworldPop: true, spaceGDP: true, swarmPower: true, collectors: true });
  const month = Math.floor(s.day / 30);
  useEffect(() => {
    let alive = true;
    client.stats().then((a) => {
      if (alive) setArch(a);
    });
    return () => {
      alive = false;
    };
  }, [month]);
  if (!arch) return <div className="page"><PageTitle title="Statistics" /><div className="muted">Loading archive…</div></div>;
  const data = res === 'monthly' ? arch.monthly : arch.yearly;
  const len = Math.max(0, ...Object.values(data).map((a) => a.length));
  const x0 = res === 'monthly' ? arch.monthlyStart : START_YEAR;
  const xLabel = res === 'monthly' ? (m: number) => `${MONTH_NAMES[((m % 12) + 12) % 12]} ${START_YEAR + Math.floor(m / 12)}` : (y: number) => String(Math.round(y));
  const series = (key: string) => {
    const arr = data[key] ?? [];
    // right-align shorter series (e.g. factions that appeared later) on the monthly ring
    if (res === 'monthly' && arr.length < len) return new Array(len - arr.length).fill(0).concat(arr);
    return arr;
  };
  const factionKeys = Object.keys(data).filter((k) => k.startsWith('faction:'));
  const groups = [...new Set(SERIES.map((x) => x.group))];
  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <PageTitle title="Statistics" sub="The long-term statistical archive (§104)" right={
        <span className="row">
          <button className={`btn small ${res === 'yearly' ? 'primary' : ''}`} onClick={() => setRes('yearly')}>Yearly · whole campaign</button>
          <button className={`btn small ${res === 'monthly' ? 'primary' : ''}`} onClick={() => setRes('monthly')}>Monthly · last 20 years</button>
        </span>
      } />
      <div className="grid" style={{ gridTemplateColumns: '240px minmax(0, 1fr)' }}>
        <Panel title="Series" accent="politics">
          {groups.map((g) => (
            <div key={g} style={{ marginBottom: 8 }}>
              <div className="tiny muted" style={{ marginBottom: 2 }}>{g.toUpperCase()}</div>
              {SERIES.filter((x) => x.group === g).map((x) => (
                <label key={x.key} className="row small" style={{ gap: 6 }}>
                  <input type="checkbox" checked={sel.includes(x.key)} onChange={(e) => setSel(e.target.checked ? [...sel, x.key] : sel.filter((k) => k !== x.key))} />
                  {x.label}
                </label>
              ))}
            </div>
          ))}
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={sel.includes('factions')} onChange={(e) => setSel(e.target.checked ? [...sel, 'factions'] : sel.filter((k) => k !== 'factions'))} />
            Faction support
          </label>
        </Panel>
        <div className="grid g2">
          {SERIES.filter((x) => sel.includes(x.key)).map((x, i) => {
            const d = series(x.key);
            const last = d.length ? d[d.length - 1] : 0;
            const fmt = formatter(x.unit);
            return (
              <Panel key={x.key} title={x.label} accent="politics" right={
                <span className="row">
                  <span className="small hl">{x.unit === 'count' || x.unit === 'people' ? fmtNum(last) : fmt(last)}</span>
                  <label className="row tiny muted" style={{ gap: 3 }}><input type="checkbox" checked={!!log[x.key]} onChange={(e) => setLog({ ...log, [x.key]: e.target.checked })} />log</label>
                </span>
              }>
                <LineChart series={[{ label: x.label, color: COLORS[i % COLORS.length], data: d }]} x0={x0} xLabel={xLabel} log={!!log[x.key]} format={fmt} height={150} />
              </Panel>
            );
          })}
          {sel.includes('factions') && factionKeys.length > 0 && (
            <Panel title="Faction support (share of electorate)" accent="politics" style={{ gridColumn: '1 / -1' }}>
              <LineChart series={factionKeys.map((k) => ({ label: s.factions[k.slice(8)]?.short ?? k, color: s.factions[k.slice(8)]?.color ?? '#888', data: series(k) }))} x0={x0} xLabel={xLabel} format={(v) => fmtPct(v, 0)} height={220} />
              <Legend items={factionKeys.map((k) => ({ label: s.factions[k.slice(8)]?.name ?? k, color: s.factions[k.slice(8)]?.color ?? '#888' }))} />
            </Panel>
          )}
        </div>
      </div>
      <div className="tiny muted" style={{ marginTop: 8 }}>Archive: {len} {res === 'monthly' ? 'months' : 'years'} of data. Yearly points are recorded each January.</div>
    </div>
  );
}
