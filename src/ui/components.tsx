import React, { useEffect, useRef, useState, createContext, useContext } from 'react';
import type { Breakdown, GameState } from '../sim/types';
import { fmtNum, fmtPct, fmtMoney, fmtPower } from '../sim/core/format';

// ---------------------------------------------------------------- Navigation
export type PanelId =
  | 'map' | 'une' | 'politics' | 'nations' | 'economy' | 'corporations' | 'population' | 'colonies'
  | 'logistics' | 'engineering' | 'research' | 'security' | 'dyson' | 'history' | 'stats' | 'system';

export interface NavState {
  panel: PanelId;
  go: (p: PanelId, sel?: string) => void;
  selection: Record<string, string | undefined>;
  select: (panel: PanelId, id: string | undefined) => void;
}

export const NavContext = createContext<NavState>({ panel: 'map', go: () => {}, selection: {}, select: () => {} });
export const useNav = () => useContext(NavContext);

// ---------------------------------------------------------------- Explain
interface ExplainReq {
  key: string;
  title: string;
  x: number;
  y: number;
}
let explainListener: ((r: ExplainReq | null) => void) | null = null;
export function openExplain(key: string, title: string, e: React.MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  explainListener?.({ key, title, x: r.left, y: r.bottom + 6 });
  e.stopPropagation();
}

export function ExplainLayer({ s }: { s: GameState | null }) {
  const [req, setReq] = useState<ExplainReq | null>(null);
  useEffect(() => {
    explainListener = setReq;
    const close = () => setReq(null);
    window.addEventListener('click', close);
    return () => {
      explainListener = null;
      window.removeEventListener('click', close);
    };
  }, []);
  if (!req || !s) return null;
  const b: Breakdown | undefined = s.explain[req.key];
  const left = Math.min(req.x, window.innerWidth - 500);
  const top = Math.min(req.y, window.innerHeight - 300);
  return (
    <div className="explain" style={{ left, top }} onClick={(e) => e.stopPropagation()}>
      <h4>{req.title}</h4>
      {!b ? (
        <div className="muted small">No breakdown recorded yet. Advance time by one month.</div>
      ) : (
        <>
          {b.note && <div className="note">{b.note}</div>}
          <table className="t">
            <tbody>
              {b.parts.map((p, i) => (
                <tr key={i}>
                  <td>{p.label}</td>
                  <td className="n" style={{ color: p.value < 0 ? 'var(--c-bad)' : undefined }}>{fmtUnit(p.value, b.unit)}</td>
                </tr>
              ))}
              <tr>
                <td className="hl">Total</td>
                <td className="n hl">{fmtUnit(b.total, b.unit)}</td>
              </tr>
            </tbody>
          </table>
          <div className="tiny muted" style={{ marginTop: 6 }}>Unit: {b.unit}</div>
        </>
      )}
    </div>
  );
}

export function fmtUnit(v: number, unit: string): string {
  if (unit === 'W') return fmtPower(v);
  if (unit === 'MW') return fmtPower(v * 1e6);
  if (unit.startsWith('cr')) return fmtMoney(v);
  if (unit === 'pts' || unit === 'index' || unit === 'risk' || unit === 'coverage' || unit === 'pressure') return v.toFixed(3);
  return fmtNum(v);
}

export function X({ k, title, children }: { k: string; title: string; children: React.ReactNode }) {
  return (
    <span data-explain="1" onClick={(e) => openExplain(k, title, e)}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- Layout
export function Panel(props: { title: React.ReactNode; accent?: string; right?: React.ReactNode; children: React.ReactNode; className?: string; style?: React.CSSProperties; bodyStyle?: React.CSSProperties }) {
  return (
    <div className={`panel ${props.accent ? 'accent-' + props.accent : ''} ${props.className ?? ''}`} style={props.style}>
      <div className="ph">
        <h2>{props.title}</h2>
        {props.right && <div className="r">{props.right}</div>}
      </div>
      <div className="pb" style={props.bodyStyle}>{props.children}</div>
    </div>
  );
}

export function Stat({ label, value, sub, explain, color }: { label: string; value: React.ReactNode; sub?: React.ReactNode; explain?: string; color?: string }) {
  return (
    <div className={`stat ${explain ? 'x' : ''}`} onClick={explain ? (e) => openExplain(explain, label, e) : undefined}>
      <div className="k">{label}</div>
      <div className="v" style={{ color }}>{value}</div>
      {sub && <div className="d">{sub}</div>}
    </div>
  );
}

export function Bar({ value, color, thin, title }: { value: number; color?: string; thin?: boolean; title?: string }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={`bar ${thin ? 'thin' : ''}`} title={title}>
      <i style={{ width: `${v * 100}%`, background: color }} />
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={t.id === value ? 'on' : ''} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function PageTitle({ title, sub, right }: { title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="page-title">
      <h1>{title}</h1>
      {sub && <span className="sub">{sub}</span>}
      {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Canvas display
export function PixelCanvas({ source, scale = 2, className, style }: { source: HTMLCanvasElement | null; scale?: number; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !source) return;
    c.width = source.width * scale;
    c.height = source.height * scale;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(source, 0, 0, c.width, c.height);
  }, [source, scale]);
  return <canvas ref={ref} className={`pixel ${className ?? ''}`} style={style} />;
}

// ---------------------------------------------------------------- Charts
export interface Series {
  label: string;
  color: string;
  data: number[];
}

export function LineChart({ series, x0, xStep = 1, height = 180, log = false, format = fmtNum, xLabel = (x: number) => String(Math.round(x)), stacked = false }: { series: Series[]; x0: number; xStep?: number; height?: number; log?: boolean; format?: (v: number) => string; xLabel?: (x: number) => string; stacked?: boolean }) {
  const W = 640, H = height, L = 58, R = 10, T = 10, B = 22;
  const n = Math.max(0, ...series.map((s) => s.data.length));
  if (n < 2) return <div className="muted small">Not enough data yet. Time must pass before history accumulates.</div>;
  let data = series.map((s) => s.data);
  if (stacked) {
    const acc = new Array(n).fill(0);
    data = series.map((s) => s.data.map((v, i) => (acc[i] += v || 0)));
  }
  let lo = Infinity, hi = -Infinity;
  for (const d of data) for (const v of d) {
    if (!Number.isFinite(v)) continue;
    if (log && v <= 0) continue;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  if (!Number.isFinite(lo)) return <div className="muted small">No data.</div>;
  if (!log) lo = Math.min(0, lo);
  if (hi === lo) hi = lo + 1;
  const tf = (v: number) => (log ? Math.log10(Math.max(v, lo)) : v);
  const tlo = tf(lo), thi = tf(hi);
  const sx = (i: number) => L + (i / (n - 1)) * (W - L - R);
  const sy = (v: number) => T + (1 - (tf(v) - tlo) / (thi - tlo || 1)) * (H - T - B);
  const ticks = 4;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H }}>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const tv = thi - ((thi - tlo) * i) / ticks;
        const v = log ? Math.pow(10, tv) : tv;
        const y = sy(v);
        return (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y} y2={y} stroke="#18222f" />
            <text x={L - 4} y={y + 3} textAnchor="end">{format(v)}</text>
          </g>
        );
      })}
      {Array.from({ length: 6 }, (_, i) => {
        const idx = Math.round(((n - 1) * i) / 5);
        return <text key={i} x={sx(idx)} y={H - 6} textAnchor="middle">{xLabel(x0 + idx * xStep)}</text>;
      })}
      {data.map((d, si) => {
        const pts = d.map((v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
        return <polyline key={si} points={pts} fill="none" stroke={series[si].color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span className="chip" key={it.label}>
          <i style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function Sparkline({ data, color = '#4da3ff', w = 90, h = 22 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (data.length < 2) return <svg width={w} height={h} />;
  const lo = Math.min(...data), hi = Math.max(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - lo) / (hi - lo || 1)) * (h - 2) - 1}`).join(' ');
  return (
    <svg width={w} height={h}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.2} />
    </svg>
  );
}

export function Hemicycle({ groups, total }: { groups: { id: string; label: string; color: string; seats: number }[]; total: number }) {
  const rows = 9;
  const dots: { x: number; y: number; c: string }[] = [];
  const W = 420, H = 220, cx = W / 2, cy = H - 10;
  const radii = Array.from({ length: rows }, (_, i) => 80 + i * 13);
  const circ = radii.map((r) => Math.PI * r);
  const sumC = circ.reduce((a, v) => a + v, 0);
  const perRow = circ.map((c) => Math.max(1, Math.round((c / sumC) * total)));
  let diff = total - perRow.reduce((a, v) => a + v, 0);
  perRow[rows - 1] += diff;
  const slots: { a: number; r: number }[] = [];
  radii.forEach((r, i) => {
    for (let k = 0; k < perRow[i]; k++) slots.push({ a: Math.PI - (k + 0.5) * (Math.PI / perRow[i]), r });
  });
  slots.sort((p, q) => q.a - p.a);
  let k = 0;
  for (const g of groups) {
    for (let i = 0; i < g.seats && k < slots.length; i++, k++) {
      const s = slots[k];
      dots.push({ x: cx + Math.cos(s.a) * s.r, y: cy - Math.sin(s.a) * s.r, c: g.color });
    }
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: 230 }}>
      {dots.map((d, i) => (
        <rect key={i} x={d.x - 2.2} y={d.y - 2.2} width={4.4} height={4.4} fill={d.c} />
      ))}
      <text x={cx} y={cy - 20} textAnchor="middle" fill="#fff" style={{ fontSize: 22, fontFamily: 'var(--mono)' }}>{total}</text>
      <text x={cx} y={cy - 4} textAnchor="middle" fill="#7d8b99" style={{ fontSize: 10, fontFamily: 'var(--mono)' }}>SEATS</text>
    </svg>
  );
}

export function Pyramid({ bands }: { bands: number[] }) {
  const max = Math.max(1, ...bands);
  const H = 17 * 11;
  return (
    <svg viewBox={`0 0 300 ${H + 12}`} style={{ width: '100%', maxHeight: 220 }}>
      {bands.map((v, i) => {
        const y = H - (i + 1) * 11;
        const w = (v / max) * 120;
        return (
          <g key={i}>
            <rect x={150 - w} y={y} width={w} height={9} fill="#5fd38a" opacity={0.8} />
            <rect x={150} y={y} width={w * 0.98} height={9} fill="#4da3ff" opacity={0.8} />
            {i % 2 === 0 && <text x={4} y={y + 8} fill="#7d8b99" style={{ fontSize: 8, fontFamily: 'var(--mono)' }}>{i === 16 ? '80+' : `${i * 5}`}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function StackBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const tot = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  return (
    <div style={{ display: 'flex', height: 12, border: '1px solid var(--border)', background: '#0a1019' }}>
      {parts.map((p) => (
        <div key={p.label} title={`${p.label}: ${fmtPct(p.value / tot)}`} style={{ width: `${(Math.max(0, p.value) / tot) * 100}%`, background: p.color }} />
      ))}
    </div>
  );
}

export function NumberInput({ value, onChange, min, max, step, width = 90 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; width?: number }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <input
      type="number"
      value={v}
      min={min}
      max={max}
      step={step}
      style={{ width }}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = Number(v);
        if (Number.isFinite(n)) onChange(n);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function useInterval(fn: () => void, ms: number) {
  const r = useRef(fn);
  r.current = fn;
  useEffect(() => {
    const id = setInterval(() => r.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}
