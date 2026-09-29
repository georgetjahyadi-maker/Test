import React, { useMemo } from 'react';
import { useGame, run } from '../../client/client';
import { Panel, Stat, Bar, PageTitle, PixelCanvas, useNav, X } from '../components';
import { fmtNum, fmtMoney, fmtPct, fmtPower, fmtSci, fmtTonnes } from '../../sim/core/format';
import { formatDate } from '../../sim/core/time';
import { FACILITY } from '../../sim/content/facilities';
import { LAW } from '../../sim/content/laws';
import { SOLAR_LUMINOSITY } from '../../sim/content/bodies';
import { collectorStats } from '../../sim/systems/dyson';
import { interceptedFraction } from '../../sim/systems/milestones';
import { mercuryCapPerYear } from '../../sim/systems/settlements';
import { settlementList, actorName } from '../../sim/systems/helpers';
import { mod } from '../../sim/systems/modifiers';
import { makeCanvas, ctx2d, prng } from '../../render/pixel';
import type { GameState } from '../../sim/types';

export function DysonPanel() {
  const s = useGame()!;
  const nav = useNav();
  const sw = s.swarm;
  const frac = sw.totalPowerW / SOLAR_LUMINOSITY;
  const capture = interceptedFraction(s);
  const factories = settlementList(s).map((st) => ({
    st,
    fac: st.facilities.filter((f) => f.type === 'collectorFactory').reduce((a, f) => a + f.count, 0),
    auto: st.facilities.filter((f) => f.type === 'autoFactory').reduce((a, f) => a + f.count, 0),
  })).filter((x) => x.fac > 0 || x.auto > 0);
  const active = sw.activeDesign ? sw.designs[sw.activeDesign] : undefined;
  const activeStats = active ? collectorStats(s, active) : null;
  const cap = mercuryCapPerYear(s);
  const mercuryLaw = ['mercury_preserve', 'mercury_extensive', 'mercury_disassembly'].find((id) => s.laws[id]);
  const view = useMemo(() => swarmView(s), [Math.round(Math.log10(sw.totalCollectors + 1) * 10), sw.cohorts.length, s.day - (s.day % 365)]);
  const known = !!s.tech.dyson_collectors?.known;
  const replication = mod(s, 'replication');
  return (
    <div className="page">
      <PageTitle title="Helios Swarm" sub="Collectors in solar orbit, the industry that builds them and the energy economy they create" />
      {!known && (
        <div className="note warn" style={{ marginBottom: 12 }}>
          The Helios swarm is a late-game project. It needs the <b>Dyson Collectors</b> technology, an off-world industrial base able to make photovoltaics, alloys and composites, and ideally Mercury, whose metals and sunlight make it the natural foundry. <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => nav.go('research', 'dyson_collectors')}>View the technology</span>
        </div>
      )}
      <div className="stats" style={{ marginBottom: 12 }}>
        <Stat label="Collectors" value={fmtSci(sw.totalCollectors)} />
        <Stat label="Electrical output" value={fmtPower(sw.totalPowerW)} explain="swarm.power" />
        <Stat label="Share of solar output" value={frac > 0 ? fmtSci(frac) : '0'} sub="electrical / 3.83×10²⁶ W" />
        <Stat label="Sunlight intercepted" value={capture > 0 ? fmtPct(capture, capture < 0.001 ? 5 : 3) : '0%'} />
        <Stat label="Beamed to Earth" value={`${s.earth.beamedTW.toFixed(2)} TW`} sub={`Earth uses ${s.earth.energyDemandTW.toFixed(0)} TW`} />
        <Stat label="Computing" value={fmtPower(sw.computeW)} />
        <Stat label="Built (12 mo)" value={fmtSci(sw.builtYear)} />
        <Stat label="Failed (12 mo)" value={fmtSci(sw.failedYear)} color={sw.failedYear > sw.builtYear && sw.builtYear > 0 ? 'var(--c-bad)' : undefined} />
        <Stat label="Energy price" value={`${sw.energyPrice.toFixed(2)} cr/MWh`} />
        <Stat label="Energy revenue" value={`${fmtMoney(sw.revenueYear)}/yr`} />
      </div>
      <div className="grid g2">
        <Panel title="The swarm" accent="energy">
          <div style={{ display: 'flex', justifyContent: 'center', background: '#020306', border: '1px solid var(--border)' }}>
            <PixelCanvas source={view} scale={2} />
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>Each dot stands for a share of the collectors in a cohort. Rings sit at the cohort orbits, with Mercury, Venus and Earth orbits for scale.</div>
        </Panel>
        <Panel title="Capture milestones" accent="energy">
          {[
            ['first_collector', 'First light', sw.totalCollectors >= 1 ? 1 : 0],
            ['million_collectors', 'Million collectors', Math.log10(sw.totalCollectors + 1) / 6],
            ['billion_collectors', 'Billion collectors', Math.log10(sw.totalCollectors + 1) / 9],
            ['capture_0001', '0.01% of the Sun', capture > 0 ? Math.max(0, (Math.log10(capture) + 10) / 6) : 0],
            ['capture_001', '0.1% of the Sun', capture > 0 ? Math.max(0, (Math.log10(capture) + 10) / 7) : 0],
            ['capture_01', '1% of the Sun', capture > 0 ? Math.max(0, (Math.log10(capture) + 10) / 8) : 0],
          ].map(([id, label, p]) => (
            <div key={id as string} style={{ marginBottom: 8 }}>
              <div className="row small" style={{ justifyContent: 'space-between' }}>
                <span className={s.milestones[id as string] !== undefined ? 'good' : ''}>{label}</span>
                <span className="muted">{s.milestones[id as string] !== undefined ? formatDate(s.milestones[id as string]) : ''}</span>
              </div>
              <Bar value={s.milestones[id as string] !== undefined ? 1 : Math.min(0.99, p as number)} color="var(--c-energy)" thin />
            </div>
          ))}
          <div className="tiny muted">Progress bars for capture milestones use a logarithmic scale. Every tenfold increase in collectors is a big step.</div>
        </Panel>
        <Panel title="Production" accent="energy">
          <div className="kv small">
            <span className="k">Active design</span><span className="v">{active ? active.name : 'none'}{active && <span className="muted"> · {fmtPower(activeStats!.electrical)} · {fmtTonnes(activeStats!.mass)}</span>}</span>
            <span className="k">Self-replication policy</span><span className="v">{replication <= -1 ? 'banned' : replication >= 1 ? 'open' : 'licensed'}</span>
            <span className="k">Mercury extraction</span><span className="v">{mercuryLaw ? LAW[mercuryLaw].name : 'default cap'} · {Number.isFinite(cap) ? `${fmtNum(cap)} t/yr` : 'unlimited'}</span>
          </div>
          {activeStats && (activeStats.errors.length > 0 || activeStats.techMissing.length > 0) && <div className="note bad small" style={{ marginTop: 6 }}>The active design cannot be produced: {activeStats.errors[0] ?? `requires ${activeStats.techMissing.join(', ')}`}</div>}
          <div className="hr" />
          {factories.length === 0 && <div className="small muted">No collector factories or autonomous complexes yet. Build {FACILITY.collectorFactory?.name ?? 'collector factories'} at an industrial settlement, ideally on Mercury.</div>}
          <table className="t">
            <tbody>
              {factories.map(({ st, fac, auto }) => (
                <tr key={st.id} className="click" onClick={() => nav.go('colonies', st.id)}>
                  <td className="hl">{st.name}</td>
                  <td className="n small">{fac > 0 ? `${fmtNum(fac)} factories` : ''}</td>
                  <td className="n small">{auto > 0 ? `${fmtNum(auto)} autonomous` : ''}</td>
                  <td className="n small muted">{fmtTonnes((fac * (FACILITY.collectorFactory?.collectorMassPerYear ?? 0)) + auto * 4000)}/yr</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={() => nav.go('engineering')}>Collector designer</button>
            <button className="btn small" onClick={() => nav.go('politics')}>Mercury & replication laws</button>
          </div>
        </Panel>
        <Panel title="Cohorts" accent="energy">
          {sw.cohorts.length === 0 && <div className="small muted">No collectors deployed.</div>}
          <table className="t">
            <thead><tr><th>Design</th><th>Owner</th><th className="n">Collectors</th><th className="n">Orbit</th><th className="n">Mean age</th><th className="n">Output</th></tr></thead>
            <tbody>
              {[...sw.cohorts].sort((a, b) => b.count - a.count).slice(0, 20).map((c) => {
                const d = sw.designs[c.designId];
                const cs = d ? collectorStats(s, d) : null;
                return (
                  <tr key={c.id}>
                    <td>{d?.name}</td>
                    <td className="muted small">{actorName(s, c.owner)}</td>
                    <td className="n">{fmtSci(c.count)}</td>
                    <td className="n">{c.radiusAU.toFixed(2)} AU</td>
                    <td className="n" style={{ color: cs && c.meanAge > cs.lifetime * 0.8 ? 'var(--c-warn)' : undefined }}>{c.meanAge.toFixed(1)} yr</td>
                    <td className="n">{cs ? fmtPower(cs.electrical * c.count) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
        <Panel title="Energy economy" accent="energy" style={{ gridColumn: '1 / -1' }}>
          <div className="small">
            Beamed power is sold to settlements with rectennas and to Earth. The price falls as supply grows relative to demand. <X k="swarm.power" title="Where swarm power goes">Where the power goes</X>. Revenue goes to collector owners, minus the UNE solar levy and any Solar Energy Trust share.
          </div>
          <div className="kv small" style={{ marginTop: 8 }}>
            <span className="k">Transmitted</span><span className="v">{fmtPower(sw.transmittedW)}</span>
            <span className="k">Beamed to Earth</span><span className="v">{fmtPower(s.earth.beamedTW * 1e12)}</span>
            <span className="k">Used within the swarm</span><span className="v">{fmtPower(sw.localUseW)}</span>
            <span className="k">UNE solar levy</span><span className="v">{fmtPct(mod(s, 'energyTax'), 0)}</span>
            <span className="k">Solar Energy Trust share</span><span className="v">{s.une.institutions.energyTrust?.active ? fmtPct(mod(s, 'energyTrust'), 0) : 'not established'}</span>
          </div>
          {!s.laws.energy_trust && LAW.energy_trust && (
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn small" onClick={() => run({ type: 'proposeBill', lawId: 'energy_trust', action: 'enact' })}>Propose the {LAW.energy_trust.name}</button>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function swarmView(s: GameState): HTMLCanvasElement {
  const W = 260, H = 200;
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  g.fillStyle = '#020306';
  g.fillRect(0, 0, W, H);
  const rnd = prng(12345);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = rnd() < 0.2 ? '#3a4658' : '#1a2230';
    g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H), 1, 1);
  }
  const cx = W / 2, cy = H / 2;
  const scale = 88; // px per AU
  // planetary orbits
  for (const [au, col] of [[0.387, '#3a3020'], [0.723, '#2e2a1e'], [1, '#1c2a3c']] as const) {
    g.fillStyle = col;
    for (let k = 0; k < 360; k += 2) {
      const a = (k / 180) * Math.PI;
      g.fillRect(Math.round(cx + Math.cos(a) * au * scale), Math.round(cy + Math.sin(a) * au * scale * 0.55), 1, 1);
    }
  }
  // collectors
  for (const coh of s.swarm.cohorts) {
    const n = Math.min(900, Math.round(Math.log10(coh.count + 1) * 70));
    const r0 = coh.radiusAU * scale;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = r0 * (1 + (rnd() - 0.5) * 0.06);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.55 + (rnd() - 0.5) * 3;
      g.fillStyle = rnd() < 0.3 ? '#fff3b0' : '#ffd84d';
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
  // Sun
  const glow = Math.min(1, Math.log10(s.swarm.totalCollectors + 1) / 12);
  for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) {
    const d = Math.sqrt(x * x + y * y);
    if (d > 12) continue;
    g.fillStyle = d > 10 ? '#ff9f43' : d > 7 ? '#ffd84d' : '#fffbe0';
    g.fillRect(cx + x, cy + y, 1, 1);
  }
  if (glow > 0) {
    g.globalAlpha = glow * 0.5;
    g.fillStyle = '#ffd84d';
    for (let k = 0; k < 360; k += 3) {
      const a = (k / 180) * Math.PI;
      g.fillRect(Math.round(cx + Math.cos(a) * 16), Math.round(cy + Math.sin(a) * 16), 1, 1);
    }
    g.globalAlpha = 1;
  }
  return c;
}
