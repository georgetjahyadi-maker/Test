import React, { useEffect, useMemo, useState } from 'react';
import { client, useGame } from '../../client/client';
import { Panel, PageTitle, Stat } from '../components';
import { formatDate, yearOf } from '../../sim/core/time';
import { MILESTONES, MILESTONE, ERAS } from '../../sim/content/misc';
import { CATEGORY_COLOR } from '../../render/palette';
import type { HistoryEntry } from '../../sim/types';

export function HistoryPanel() {
  const s = useGame()!;
  const [hist, setHist] = useState<HistoryEntry[]>(s.history);
  const [cat, setCat] = useState('all');
  const [minSig, setMinSig] = useState(2);
  const [q, setQ] = useState('');
  const lastId = s.history.length ? s.history[s.history.length - 1].id : '';
  useEffect(() => {
    let alive = true;
    client.history().then((h) => {
      if (alive && h) setHist(h);
    });
    return () => {
      alive = false;
    };
  }, [lastId]);
  const cats = useMemo(() => [...new Set(hist.map((h) => h.category))].sort(), [hist]);
  const needle = q.trim().toLowerCase();
  const list = hist.filter((h) => (cat === 'all' || h.category === cat) && h.significance >= minSig && (!needle || h.title.toLowerCase().includes(needle) || h.text.toLowerCase().includes(needle)));
  // Era boundaries from milestones
  const eraStart: { era: number; day: number }[] = [];
  for (const m of MILESTONES) {
    const d = s.milestones[m.id];
    if (d === undefined) continue;
    const prev = eraStart.find((e) => e.era === m.era);
    if (!prev) eraStart.push({ era: m.era, day: d });
    else prev.day = Math.min(prev.day, d);
  }
  eraStart.sort((a, b) => a.day - b.day);
  const rows: React.ReactNode[] = [];
  let lastYear = -1;
  let eraIdx = 0;
  const sorted = [...list].sort((a, b) => a.day - b.day);
  if (sorted.length) rows.push(<div key="era1" className="era-mark">{ERAS[0].name}</div>);
  for (const h of sorted) {
    while (eraIdx < eraStart.length && eraStart[eraIdx].day <= h.day) {
      const e = eraStart[eraIdx];
      if (e.era > 1) rows.push(<div key={`era${e.era}-${e.day}`} className="era-mark">{ERAS[e.era - 1]?.name} · {formatDate(e.day)}</div>);
      eraIdx++;
    }
    const y = yearOf(h.day);
    if (y !== lastYear) {
      lastYear = y;
      rows.push(<div key={`y${y}`} className="tiny muted" style={{ margin: '8px 0 2px 16px', letterSpacing: '0.2em' }}>{y}</div>);
    }
    rows.push(
      <div key={h.id} className={`tl-item ${h.significance >= 4 ? 'big' : ''}`} style={{ ['--dotc' as any]: CATEGORY_COLOR[h.category] ?? '#4da3ff' }}>
        <div className="d">{formatDate(h.day)} · {h.category}{h.significance >= 4 ? ' · ★'.repeat(h.significance - 3) : ''}</div>
        <div className="t">{h.title}</div>
        <div className="x">{h.text}</div>
      </div>,
    );
  }
  const byCat: Record<string, number> = {};
  for (const h of hist) byCat[h.category] = (byCat[h.category] ?? 0) + 1;
  const reached = MILESTONES.filter((m) => s.milestones[m.id] !== undefined).sort((a, b) => s.milestones[a.id] - s.milestones[b.id]);
  return (
    <div className="page">
      <PageTitle title="History" sub="The chronicle of the United Nations of Earth. Every entry was produced by the simulation." />
      <div className="stats" style={{ marginBottom: 12 }}>
        <Stat label="Recorded events" value={String(hist.length)} />
        <Stat label="Milestones" value={`${reached.length} / ${MILESTONES.length}`} />
        <Stat label="Years elapsed" value={((s.day) / 365.25).toFixed(1)} />
        <Stat label="Current era" value={ERAS[Math.max(0, ...reached.map((m) => m.era)) - 1]?.short ?? ERAS[0].short} />
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px' }}>
        <Panel title="Chronicle" accent="politics" right={
          <span className="row">
            <input type="text" placeholder="search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 140 }} />
            <select value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">All categories</option>
              {cats.map((c) => <option key={c} value={c}>{c} ({byCat[c]})</option>)}
            </select>
            <select value={minSig} onChange={(e) => setMinSig(Number(e.target.value))}>
              <option value={1}>Everything</option>
              <option value={2}>Notable</option>
              <option value={3}>Major</option>
              <option value={4}>Historic</option>
            </select>
          </span>
        }>
          {rows.length === 0 ? <div className="small muted">Nothing recorded yet at this level of significance.</div> : <div className="timeline">{rows}</div>}
        </Panel>
        <div className="col" style={{ gap: 12 }}>
          <Panel title="Milestones" accent="politics">
            {MILESTONES.map((m) => {
              const d = s.milestones[m.id];
              return (
                <div key={m.id} style={{ marginBottom: 6, opacity: d !== undefined ? 1 : 0.5 }}>
                  <div className="row small" style={{ justifyContent: 'space-between' }}>
                    <span className={d !== undefined ? 'hl' : ''}>{d !== undefined ? '★ ' : '☆ '}{m.name}</span>
                    <span className="tiny muted">{d !== undefined ? yearOf(d) : `Era ${m.era}`}</span>
                  </div>
                  <div className="tiny muted">{MILESTONE[m.id].description}</div>
                </div>
              );
            })}
          </Panel>
        </div>
      </div>
    </div>
  );
}
