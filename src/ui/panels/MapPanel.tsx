import React, { useEffect, useRef, useState } from 'react';
import { client, useClient, useGame, run, toast } from '../../client/client';
import { SolarMapRenderer, MAP_MODES, type MapMode } from '../../render/solarMap';
import { BODY } from '../../sim/content/bodies';
import { SITE, SITES } from '../../sim/content/sites';
import { useNav, Bar } from '../components';
import { popOf, STATUS_LABEL, tierOf } from '../../sim/systems/helpers';
import { fmtNum, fmtMoney, fmtPct, fmtDays } from '../../sim/core/format';
import { foundingPlan } from '../../sim/systems/colonies';
import { lightDelaySeconds } from '../../sim/physics/orbits';
import { STATUS_COLOR } from '../../render/palette';
import { SPEEDS } from '../../client/client';

export function MapPanel() {
  const s = useGame()!;
  const wrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SolarMapRenderer | null>(null);
  const stateRef = useRef(s);
  stateRef.current = s;
  const running = useClient((c) => c.running);
  const speed = useClient((c) => c.speed);
  const timing = useRef({ day: s.day, at: performance.now(), running, dps: SPEEDS[speed].days });
  if (timing.current.day !== s.day) timing.current = { day: s.day, at: performance.now(), running, dps: SPEEDS[speed].days };
  timing.current.running = running;
  timing.current.dps = SPEEDS[speed].days;
  const [mode, setMode] = useState<MapMode>('political');
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const nav = useNav();

  useEffect(() => {
    const canvas = canvasRef.current!;
    const r = new SolarMapRenderer(canvas);
    rendererRef.current = r;
    let raf = 0;
    const resize = () => {
      const el = wrap.current!;
      r.resize(el.clientWidth, el.clientHeight, window.devicePixelRatio || 1);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap.current!);
    const loop = (t: number) => {
      const tm = timing.current;
      const extra = tm.running ? Math.min(3, ((performance.now() - tm.at) / 1000) * tm.dps) : 0;
      r.render(stateRef.current, tm.day + Math.min(extra, tm.dps * 0.2), t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // interaction
    let drag: { x: number; y: number; moved: boolean } | null = null;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, moved: false };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.moved) {
        canvas.classList.add('dragging');
        r.pan(dx, dy);
        drag.x = e.clientX;
        drag.y = e.clientY;
      }
    };
    const up = (e: PointerEvent) => {
      canvas.classList.remove('dragging');
      if (drag && !drag.moved) {
        const rect = canvas.getBoundingClientRect();
        const hit = r.hitTest(e.clientX - rect.left, e.clientY - rect.top);
        if (hit) {
          r.selected = hit.id.startsWith('site:') ? null : hit.id;
          setSelected(hit.id);
        } else {
          r.selected = null;
          setSelected(null);
        }
      }
      drag = null;
    };
    const dbl = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const hit = r.hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (hit?.kind === 'body' && !hit.id.startsWith('site:')) {
        const b = BODY[hit.id];
        const target = b.type === 'moon' && b.parent ? b.parent : hit.id;
        if (target !== 'sun') {
          r.focus = target;
          r.resetView();
          setFocus(target);
        }
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      r.zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('dblclick', dbl);
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('dblclick', dbl);
      canvas.removeEventListener('wheel', wheel);
    };
  }, []);

  useEffect(() => {
    if (rendererRef.current) rendererRef.current.mode = mode;
  }, [mode]);

  const back = () => {
    const r = rendererRef.current!;
    r.focus = null;
    r.resetView();
    setFocus(null);
  };

  return (
    <div className="mapwrap">
      <div className="mapcanvas" ref={wrap}>
        <canvas ref={canvasRef} />
        <div className="map-modes">
          {MAP_MODES.map((m) => (
            <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="map-zoom">
          {focus && <button className="btn small" onClick={back}>← Solar System</button>}
          <button className="btn small" onClick={() => rendererRef.current?.zoomAt((wrap.current!.clientWidth) / 2, wrap.current!.clientHeight / 2, 1.3)}>+</button>
          <button className="btn small" onClick={() => rendererRef.current?.zoomAt(wrap.current!.clientWidth / 2, wrap.current!.clientHeight / 2, 1 / 1.3)}>−</button>
          <button className="btn small" onClick={() => rendererRef.current?.resetView()}>Reset</button>
          <span className="tiny muted" style={{ alignSelf: 'center', marginLeft: 6 }}>Drag to pan · wheel to zoom · double-click a planet for its system</span>
        </div>
        <MapLegend mode={mode} />
      </div>
      <aside className="side">
        <SideInfo id={selected} focus={focus} onFocus={(b) => { const r = rendererRef.current!; r.focus = b; r.resetView(); setFocus(b); }} goColony={(id) => nav.go('colonies', id)} />
      </aside>
    </div>
  );
}

function MapLegend({ mode }: { mode: MapMode }) {
  const items: [string, string][] =
    mode === 'political' ? Object.entries(STATUS_COLOR).map(([k, v]) => [STATUS_LABEL[k] ?? k, v])
    : mode === 'population' ? [['> 1 million', '#5fd38a'], ['> 10,000', '#8fe0a8'], ['> 100', '#c9f0d4'], ['smaller', '#7d8b99']]
    : mode === 'industry' ? [['Closure > 80%', '#ff9f43'], ['> 50%', '#ffb96e'], ['> 20%', '#ffd3a1'], ['dependent', '#7d8b99']]
    : mode === 'energy' ? [['Power shortage', '#ff5c5c'], ['Adequate power', '#ffd84d'], ['Solar flux rings', '#b89a2e']]
    : mode === 'military' ? [['Piracy risk', '#ff5c5c'], ['Secure', '#9aa7b8']]
    : mode === 'migration' ? [['Net immigration', '#5fd38a'], ['Net emigration', '#ff5c5c']]
    : mode === 'trade' ? [['UNE routes', '#4da3ff'], ['Private routes', '#ff9f43']]
    : mode === 'communications' ? [['Light-delay rings from Earth', '#6ee7ff']]
    : mode === 'dyson' ? [['Helios collectors', '#ffd84d']]
    : mode === 'resources' ? [['Unsettled resource sites (planet view)', '#ff9f43']]
    : [['Science output', '#b98cff']];
  return (
    <div className="map-legend">
      {items.map(([l, c]) => (
        <div className="chip" key={l}><i style={{ background: c }} />{l}</div>
      ))}
    </div>
  );
}

function SideInfo({ id, focus, onFocus, goColony }: { id: string | null; focus: string | null; onFocus: (b: string) => void; goColony: (id: string) => void }) {
  const s = useGame()!;
  if (!id) {
    const sts = Object.values(s.settlements).sort((a, b) => popOf(b) - popOf(a));
    return (
      <div>
        <h3>{focus ? BODY[focus].name + ' System' : 'The Solar System'}</h3>
        <div className="muted small" style={{ marginBottom: 10 }}>
          {focus ? BODY[focus].description : 'Select a world or settlement. Everything here moves on real orbits: launch windows open and close, and light delay grows as worlds drift apart.'}
        </div>
        <div className="muted tiny" style={{ marginBottom: 4 }}>SETTLEMENTS</div>
        <table className="t">
          <tbody>
            {sts.map((st) => (
              <tr key={st.id} className="click" onClick={() => goColony(st.id)}>
                <td><span className="tag" style={{ borderColor: STATUS_COLOR[st.status], color: STATUS_COLOR[st.status] }}>{st.status.slice(0, 4)}</span>{st.name}</td>
                <td className="n">{fmtNum(popOf(st))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (id.startsWith('site:')) return <SiteInfo siteId={id.slice(5)} />;
  const st = s.settlements[id];
  if (st) {
    const site = SITE[st.siteId];
    const pop = popOf(st);
    return (
      <div>
        <h3>{st.name}</h3>
        <div className="muted small">{site.name} · {BODY[site.body].name}</div>
        <div className="row" style={{ margin: '6px 0' }}>
          <span className="tag" style={{ borderColor: STATUS_COLOR[st.status], color: STATUS_COLOR[st.status] }}>{STATUS_LABEL[st.status]}</span>
          <span className="tag">{tierOf(pop)}</span>
        </div>
        <div className="kv small">
          <span className="k">Population</span><span className="v">{fmtNum(pop)}</span>
          <span className="k">Housing</span><span className="v">{fmtNum(st.housing)}</span>
          <span className="k">Power</span><span className="v">{st.energy.gen.toFixed(1)} / {st.energy.demand.toFixed(1)} MW</span>
          <span className="k">O₂ reserve</span><span className="v">{fmtDays(st.lifeSupport.reserveDays.oxygen ?? 0)}</span>
          <span className="k">Food self-sufficiency</span><span className="v">{fmtPct(st.lifeSupport.foodSelf)}</span>
          <span className="k">Industrial closure</span><span className="v">{fmtPct(st.closure)}</span>
          <span className="k">Autonomy pressure</span><span className="v">{fmtPct(st.politics.autonomy)}</span>
          <span className="k">Light delay to Earth</span><span className="v">{(lightDelaySeconds('earth', site.body, s.day) / 60).toFixed(1)} min</span>
        </div>
        <div className="hr" />
        <button className="btn primary" onClick={() => goColony(st.id)}>Open colony</button>
      </div>
    );
  }
  const b = BODY[id];
  if (!b) return null;
  const sites = SITES.filter((x) => x.body === id);
  const parent = b.type === 'moon' ? b.parent : null;
  return (
    <div>
      <h3>{b.name}</h3>
      <div className="muted small" style={{ marginBottom: 8 }}>{b.description}</div>
      <div className="kv small">
        {b.parent === 'sun' && <><span className="k">Orbit</span><span className="v">{b.a.toFixed(3)} AU · {(b.period / 365.25).toFixed(2)} yr</span></>}
        {b.type === 'moon' && <><span className="k">Orbit</span><span className="v">{fmtNum(b.a)} km</span></>}
        <span className="k">Surface gravity</span><span className="v">{b.surfaceG.toFixed(3)} g</span>
        <span className="k">Radius</span><span className="v">{fmtNum(b.radiusKm)} km</span>
        <span className="k">Atmosphere</span><span className="v">{b.atmosphere}</span>
        {b.id !== 'sun' && <><span className="k">Solar flux</span><span className="v">{(1361 / Math.pow(parent ? BODY[parent].a : b.a, 2)).toFixed(0)} W/m²</span></>}
        {b.id !== 'earth' && b.id !== 'sun' && <><span className="k">Light delay</span><span className="v">{(lightDelaySeconds('earth', id, s.day) / 60).toFixed(1)} min</span></>}
      </div>
      {b.id !== 'sun' && b.type !== 'moon' && <div className="row" style={{ marginTop: 8 }}><button className="btn" onClick={() => onFocus(id)}>View planetary system</button></div>}
      {sites.length > 0 && (
        <>
          <div className="hr" />
          <div className="muted tiny" style={{ marginBottom: 4 }}>SITES</div>
          {sites.map((site) => <SiteInfo key={site.id} siteId={site.id} compact />)}
        </>
      )}
    </div>
  );
}

function SiteInfo({ siteId, compact }: { siteId: string; compact?: boolean }) {
  const s = useGame()!;
  const nav = useNav();
  const site = SITE[siteId];
  const st = Object.values(s.settlements).find((x) => x.siteId === siteId);
  const [name, setName] = useState('');
  const plan = st ? null : foundingPlan(s, siteId, 'une');
  return (
    <div style={{ border: '1px solid var(--border)', padding: 8, marginBottom: 6, background: '#0b1119' }}>
      <div className="row">
        <span className="hl">{site.name}</span>
        <span className="tag">{site.kind}</span>
      </div>
      {!compact && <div className="muted small" style={{ margin: '4px 0' }}>{site.description}</div>}
      <div className="tiny muted">
        g {site.gravity.toFixed(3)} · radiation {fmtNum(site.radiation)} mSv/yr · light {fmtPct(site.illumination, 0)}
      </div>
      {site.deposits.length > 0 && <div className="tiny" style={{ marginTop: 3 }}>{site.deposits.map((d) => <span key={d.name} className="tag c-industry">{d.name}</span>)}</div>}
      {st ? (
        <button className="btn small" style={{ marginTop: 6 }} onClick={() => nav.go('colonies', st.id)}>{st.name} ({fmtNum(popOf(st))}) →</button>
      ) : plan && (
        <div style={{ marginTop: 6 }}>
          {plan.ok ? (
            <>
              <div className="tiny">Founding: {fmtMoney(plan.cost + plan.transport)} ({fmtNum(plan.mass)} t delivered by {plan.reachableBy})</div>
              <div className="row" style={{ marginTop: 4 }}>
                <input type="text" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 140 }} />
                <button className="btn small primary" onClick={async () => {
                  const r = await run({ type: 'foundSettlement', siteId, name });
                  if (r.ok) toast(`Settlement founded at ${site.name}`, 'ok');
                }}>Found UNE settlement</button>
              </div>
            </>
          ) : (
            <div className="tiny warn">{plan.error}</div>
          )}
        </div>
      )}
    </div>
  );
}

export { Bar, client };
