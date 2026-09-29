import React, { useEffect, useMemo, useRef, useState } from 'react';
import { client, useClient, useGame, SPEEDS, onToast, type Toast, toast, run } from '../client/client';
import { listSaves, readSave, putSave, readFile, type SaveMeta } from '../client/storage';
import { NavContext, type PanelId, ExplainLayer, openExplain } from './components';
import { formatDate, yearOf, civilFromDay } from '../sim/core/time';
import { fmtMoney, fmtNum, fmtPower, fmtPct } from '../sim/core/format';
import { offworldPopulation, earthPopulation } from '../sim/systems/helpers';
import { planetSprite } from '../render/planets';
import { BODIES } from '../sim/content/bodies';
import { helioPosition } from '../sim/physics/orbits';
import { audio } from '../audio/audio';
import { MapPanel } from './panels/MapPanel';
import { UNEPanel } from './panels/UNEPanel';
import { PoliticsPanel } from './panels/PoliticsPanel';
import { NationsPanel } from './panels/NationsPanel';
import { EconomyPanel } from './panels/EconomyPanel';
import { CorporationsPanel } from './panels/CorporationsPanel';
import { PopulationPanel } from './panels/PopulationPanel';
import { ColoniesPanel } from './panels/ColoniesPanel';
import { LogisticsPanel } from './panels/LogisticsPanel';
import { EngineeringPanel } from './panels/EngineeringPanel';
import { ResearchPanel } from './panels/ResearchPanel';
import { SecurityPanel } from './panels/SecurityPanel';
import { DysonPanel } from './panels/DysonPanel';
import { HistoryPanel } from './panels/HistoryPanel';
import { StatsPanel } from './panels/StatsPanel';
import { SystemPanel } from './panels/SystemPanel';
import { currentEra } from '../sim/systems/milestones';
import { ERAS } from '../sim/content/misc';

const NAV: { id: PanelId; label: string; color: string; sep?: boolean }[] = [
  { id: 'map', label: 'Solar System', color: '#e6edf3' },
  { id: 'une', label: 'UNE', color: '#4da3ff', sep: true },
  { id: 'politics', label: 'Politics', color: '#4da3ff' },
  { id: 'nations', label: 'Member States', color: '#4da3ff' },
  { id: 'economy', label: 'Economy', color: '#ff9f43', sep: true },
  { id: 'corporations', label: 'Corporations', color: '#ff9f43' },
  { id: 'population', label: 'Population', color: '#5fd38a' },
  { id: 'colonies', label: 'Colonies', color: '#5fd38a' },
  { id: 'logistics', label: 'Logistics', color: '#ff9f43', sep: true },
  { id: 'engineering', label: 'Engineering', color: '#ff9f43' },
  { id: 'research', label: 'Research', color: '#b98cff' },
  { id: 'security', label: 'Security', color: '#ff5c5c' },
  { id: 'dyson', label: 'Dyson Swarm', color: '#ffd84d' },
  { id: 'history', label: 'History', color: '#e6edf3', sep: true },
  { id: 'stats', label: 'Statistics', color: '#e6edf3' },
  { id: 'system', label: 'Game / Saves', color: '#7d8b99' },
];

export const INTRO = `2048.

Humanity remains divided among sovereign states, but the space beyond Earth has begun to outgrow the institutions created to govern it.

Permanent lunar activity is becoming economically viable. Private corporations are preparing to exploit extraterrestrial resources. Orbital infrastructure is becoming essential to the global economy.

Asteroid defense, orbital congestion, resource claims, artificial intelligence, and the first permanent off-world settlements can no longer be managed through temporary agreements alone.

After decades of negotiation, the nations of Earth ratify the Earth Compact.

The Compact creates the United Nations of Earth.

The UNE is neither a world government nor merely an alliance. Its members remain sovereign. But they have permanently delegated authority over the common interests of humanity beyond Earth to federal institutions.

For the first time in history, humanity possesses a constitutional system capable of governing beyond its home planet.

Yet the Compact leaves fundamental questions unanswered.

Who owns another world?
Who represents children born beyond Earth?
How much authority should common institutions possess?
Can a civilization separated by millions of kilometres remain politically united?
And if humanity one day surrounds its star with machines, who will control the power of the Sun?

The answers will not be determined by technology alone.

They will be determined by history.`;

export function App() {
  const s = useGame();
  const [intro, setIntro] = useState(false);
  if (!s) return <MainMenu onStarted={(isNew) => setIntro(isNew)} />;
  return <GameShell intro={intro} closeIntro={() => setIntro(false)} />;
}

// ---------------------------------------------------------------------------
function MainMenu({ onStarted }: { onStarted: (isNew: boolean) => void }) {
  const [seed, setSeed] = useState(() => `helios-${Math.floor(Math.random() * 1e6)}`);
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    listSaves().then(setSaves);
  }, []);
  const start = () => {
    audio.unlock();
    client.newGame(seed.trim() || 'helios');
    onStarted(true);
  };
  const load = async (id: string) => {
    audio.unlock();
    const json = await readSave(id);
    if (json) {
      client.load(json);
      onStarted(false);
    }
  };
  return (
    <div className="menu">
      <div className="hero">
        <MenuOrrery />
        <div className="title">
          <h1>HELIOS</h1>
          <h2>DAWN OF A NEW ERA</h2>
          <div className="muted small" style={{ marginTop: 14, maxWidth: 520, lineHeight: 1.6 }}>
            A hard-science-fiction grand strategy game. Lead the United Nations of Earth from the first lunar bases of 2048 to a civilization that captures the light of the Sun.
          </div>
        </div>
      </div>
      <div className="panel2">
        <h3>New campaign</h3>
        <div className="col">
          <label className="small muted">World seed (the same seed gives the same history)</label>
          <input type="text" value={seed} onChange={(e) => setSeed(e.target.value)} />
          <button className="btn primary" style={{ padding: '9px 12px', fontSize: 14 }} onClick={start}>
            Ratify the Earth Compact — 1 January 2048
          </button>
        </div>
        <h3>Continue</h3>
        {saves.length === 0 && <div className="muted small">No saved campaigns in this browser.</div>}
        <div className="col">
          {saves.slice(0, 8).map((sv) => (
            <button key={sv.id} className="btn" style={{ textAlign: 'left', padding: '7px 10px' }} onClick={() => load(sv.id)}>
              <div className="hl">{sv.name}{sv.auto ? ' (autosave)' : ''}</div>
              <div className="tiny muted">{sv.gameDate} · {sv.union} · saved {new Date(sv.savedAt).toLocaleString()}</div>
            </button>
          ))}
        </div>
        <h3>Import</h3>
        <input ref={fileRef} type="file" accept=".helios,.json,application/json" style={{ display: 'none' }} onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const json = await readFile(f);
            client.load(json);
            onStarted(false);
          } catch (err: any) {
            toast(`Could not read save: ${err?.message ?? err}`, 'crit');
          }
        }} />
        <button className="btn" onClick={() => fileRef.current?.click()}>Import a .helios save file…</button>
        <h3>About</h3>
        <div className="small muted" style={{ lineHeight: 1.6 }}>
          Physics determines what is possible. Engineering determines what is practical. Economics determines what gets built. Politics determines who decides. Culture determines what civilization wants to become.
        </div>
      </div>
      <Toasts />
    </div>
  );
}

function MenuOrrery() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const c = ref.current!;
    const draw = (t: number) => {
      const scale = 3;
      const W = Math.ceil(c.clientWidth / scale), H = Math.ceil(c.clientHeight / scale);
      if (c.width !== W * scale) {
        c.width = W * scale;
        c.height = H * scale;
      }
      const low = document.createElement('canvas');
      low.width = W;
      low.height = H;
      const g = low.getContext('2d')!;
      g.fillStyle = '#03050a';
      g.fillRect(0, 0, W, H);
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 260; i++) {
        g.fillStyle = rnd() > 0.9 ? '#fff' : '#3a4452';
        g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H), 1, 1);
      }
      const cx = W * 0.62, cy = H * 0.42;
      const day = t * 0.02;
      const scaleR = Math.min(W, H) * 0.09;
      for (const b of BODIES) {
        if (b.parent !== 'sun' || b.type !== 'planet') continue;
        const r = Math.sqrt(b.a) * scaleR;
        g.fillStyle = 'rgba(80,100,130,0.5)';
        for (let k = 0; k < 200; k += 2) g.fillRect(Math.round(cx + Math.cos((k / 200) * 6.283) * r), Math.round(cy + Math.sin((k / 200) * 6.283) * r * 0.55), 1, 1);
      }
      const grd = g.createRadialGradient(cx, cy, 2, cx, cy, 40);
      grd.addColorStop(0, 'rgba(255,220,120,0.6)');
      grd.addColorStop(1, 'rgba(255,150,40,0)');
      g.fillStyle = grd;
      g.fillRect(cx - 40, cy - 40, 80, 80);
      // swarm hint
      for (let i = 0; i < 700; i++) {
        const a = (i / 700) * 6.283 + day * 0.02;
        const rr = scaleR * 0.52 + Math.sin(i * 12.9) * 3;
        g.fillStyle = i % 3 ? '#8a7430' : '#ffd84d';
        g.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr * 0.55), 1, 1);
      }
      g.drawImage(planetSprite('sun', 20, t * 0.00001, 0), Math.round(cx - 10), Math.round(cy - 10));
      for (const b of BODIES) {
        if (b.parent !== 'sun' || b.type !== 'planet') continue;
        const p = helioPosition(b.id, day);
        const ang = Math.atan2(p.y, p.x);
        const r = Math.sqrt(b.a) * scaleR;
        const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r * 0.55;
        const sz = b.id === 'jupiter' ? 11 : b.id === 'saturn' ? 9 : b.id === 'earth' ? 6 : 5;
        g.drawImage(planetSprite(b.id, sz, t * 0.00005, Math.atan2(cy - y, cx - x)), Math.round(x - sz / 2), Math.round(y - sz / 2));
      }
      const out = c.getContext('2d')!;
      out.imageSmoothingEnabled = false;
      out.drawImage(low, 0, 0, c.width, c.height);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} />;
}

// ---------------------------------------------------------------------------
function GameShell({ intro, closeIntro }: { intro: boolean; closeIntro: () => void }) {
  const s = useGame()!;
  const [panel, setPanel] = useState<PanelId>('map');
  const [selection, setSelection] = useState<Record<string, string | undefined>>({});
  const nav = useMemo(
    () => ({
      panel,
      go: (p: PanelId, sel?: string) => {
        setPanel(p);
        if (sel !== undefined) setSelection((x) => ({ ...x, [p]: sel }));
      },
      selection,
      select: (p: PanelId, id: string | undefined) => setSelection((x) => ({ ...x, [p]: id })),
    }),
    [panel, selection],
  );
  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        client.toggle();
      } else if (/^Digit[1-5]$/.test(e.code)) client.setSpeed(Number(e.code.slice(5)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // autosave every in-game year
  const lastYear = useRef(yearOf(s.day));
  useEffect(() => {
    const y = yearOf(s.day);
    if (y !== lastYear.current) {
      lastYear.current = y;
      if (localStorageGet('helios.autosave', '1') === '1') {
        client.saveJson().then((json) => {
          if (!json) return;
          const slot = `auto-${y % 3}`;
          putSave({ id: slot, name: `Autosave ${y}`, savedAt: Date.now(), gameDate: formatDate(s.day), union: s.une.short, auto: true }, json).catch(() => {});
        });
      }
      audio.setEra(currentEra(s));
    }
  }, [s.day]);
  // alerts become toasts
  const seenAlert = useRef(s.alerts.length ? s.alerts[s.alerts.length - 1].id : '');
  useEffect(() => {
    const idx = s.alerts.findIndex((a) => a.id === seenAlert.current);
    const fresh = s.alerts.slice(idx + 1);
    if (fresh.length) {
      seenAlert.current = s.alerts[s.alerts.length - 1].id;
      for (const a of fresh.slice(-3)) {
        toast(a.text, a.severity === 'crit' ? 'crit' : a.severity === 'warn' ? 'warn' : 'info');
        if (a.severity === 'crit') audio.alarm();
        else audio.blip();
      }
    }
  }, [s.alerts]);
  const Panel = PANELS[panel];
  return (
    <NavContext.Provider value={nav}>
      <div className="app">
        <TopBar />
        <div className="main">
          <nav className="nav">
            {NAV.map((n) => (
              <React.Fragment key={n.id}>
                {n.sep && <div className="sep" />}
                <button className={panel === n.id ? 'on' : ''} style={{ ['--accent' as any]: n.color }} onClick={() => { setPanel(n.id); audio.click(); }}>
                  <i className="ico" style={{ background: n.color }} />
                  {n.label}
                  {n.id === 'politics' && s.bills.some((b) => b.stage !== 'done') && <span className="tag c-politics" style={{ marginLeft: 'auto' }}>{s.bills.filter((b) => b.stage !== 'done').length}</span>}
                  {n.id === 'security' && s.security.threats.some((t) => t.status === 'tracking') && <span className="tag c-bad" style={{ marginLeft: 'auto' }}>!</span>}
                </button>
              </React.Fragment>
            ))}
            <div className="sep" />
            <div className="tiny muted" style={{ padding: '4px 12px', lineHeight: 1.6 }}>
              {ERAS[currentEra(s) - 1]?.name}
              <br />Space: pause · 1–5: speed
              <br />Click underlined numbers for explanations
            </div>
          </nav>
          <div className="content">
            <Panel />
          </div>
        </div>
      </div>
      <EventModal />
      <ExplainLayer s={s} />
      <Toasts />
      {intro && <IntroModal onClose={closeIntro} />}
      {s.gameOver && <GameOverModal />}
    </NavContext.Provider>
  );
}

const PANELS: Record<PanelId, React.ComponentType> = {
  map: MapPanel,
  une: UNEPanel,
  politics: PoliticsPanel,
  nations: NationsPanel,
  economy: EconomyPanel,
  corporations: CorporationsPanel,
  population: PopulationPanel,
  colonies: ColoniesPanel,
  logistics: LogisticsPanel,
  engineering: EngineeringPanel,
  research: ResearchPanel,
  security: SecurityPanel,
  dyson: DysonPanel,
  history: HistoryPanel,
  stats: StatsPanel,
  system: SystemPanel,
};

function localStorageGet(k: string, d: string): string {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
}

function TopBar() {
  const s = useGame()!;
  const running = useClient((c) => c.running);
  const speed = useClient((c) => c.speed);
  const off = offworldPopulation(s);
  const pop = off + earthPopulation(s);
  let offPower = 0;
  for (const st of Object.values(s.settlements)) offPower += st.energy.gen * 1e6;
  const power = s.earth.energyDemandTW * 1e12 + offPower + Math.max(0, s.swarm.totalPowerW - s.earth.beamedTW * 1e12);
  let industry = 0;
  for (const st of Object.values(s.settlements)) for (const g in st.production) industry += st.production[g] * 12;
  const crit = s.alerts.filter((a) => a.severity === 'crit' && s.day - a.day < 60).length;
  const pending = s.events.pending.length;
  const c = civilFromDay(s.day);
  const item = (k: string, v: React.ReactNode, key?: string, title?: string) => (
    <div className="tb-item" onClick={key ? (e) => openExplain(key, title ?? k, e) : undefined}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
  return (
    <div className="topbar">
      <div className="brand">
        <div className="t">HELIOS</div>
        <div className="s">{s.une.name}</div>
      </div>
      <div className="tb-item tb-date">
        <div className="k">Date</div>
        <div className="v">{formatDate(s.day)}</div>
      </div>
      {item('Treasury', <span style={{ color: s.une.treasury < 0 ? 'var(--c-bad)' : undefined }}>{fmtMoney(s.une.treasury)}</span>, 'une.revenue', 'UNE revenue this year')}
      {item('Legitimacy', fmtPct(s.une.metrics.legitimacy ?? 0, 0), 'une.legitimacy', 'Federal legitimacy')}
      {item('Pol. capital', Math.floor(s.une.politicalCapital))}
      {item('Population', fmtNum(pop), 'top.population', 'Population')}
      {item('Off-world', fmtNum(off), 'top.population', 'Population')}
      {item('Energy', fmtPower(power), 'top.energy', 'Energy')}
      {item('Research', `${fmtNum(s.research.rpLastYear)} RP/yr`, 'research.rate', 'Research output')}
      {item('Industry', `${fmtNum(industry)} t/yr`, 'top.industry', 'Off-world industrial output')}
      <div className="tb-spacer" />
      {pending > 0 && (
        <div className="tb-item alerts-btn" onClick={() => document.dispatchEvent(new CustomEvent('helios:open-events'))}>
          <div className="k">Decisions</div>
          <div className="v warn">{pending} pending</div>
        </div>
      )}
      {crit > 0 && (
        <div className="tb-item">
          <div className="k">Alerts</div>
          <div className="v bad">{crit} critical</div>
        </div>
      )}
      <div className="speed">
        <button className={!running ? 'on' : ''} onClick={() => client.pause()} title="Pause (Space)">❚❚</button>
        {SPEEDS.slice(1).map((sp, i) => (
          <button key={sp.label} className={running && speed === i + 1 ? 'on' : ''} onClick={() => client.setSpeed(i + 1)} title={`${sp.days} day(s) per second (${i + 1})`}>
            {sp.label}
          </button>
        ))}
        <span className="tiny muted" style={{ marginLeft: 6, width: 46 }}>{running ? '▶ run' : '■ paused'}</span>
      </div>
      <span className="tiny muted" style={{ alignSelf: 'center', padding: '0 8px' }}>{c.y}</span>
    </div>
  );
}

function EventModal() {
  const s = useGame()!;
  const [openIdx, setOpenIdx] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  useEffect(() => {
    const h = () => setDismissed(new Set());
    document.addEventListener('helios:open-events', h);
    return () => document.removeEventListener('helios:open-events', h);
  }, []);
  const pending = s.events.pending.filter((p) => !dismissed.has(p.id));
  if (pending.length === 0) return null;
  const inst = pending[Math.min(openIdx, pending.length - 1)];
  return (
    <div className="overlay">
      <div className="modal">
        <div className="mh">
          <span className="tag c-warn">{inst.category}</span>
          <h2>{inst.title}</h2>
          <span className="muted small" style={{ marginLeft: 'auto' }}>{formatDate(inst.day)} · decide by {formatDate(inst.deadline)}</span>
        </div>
        <div className="mb">{inst.text}</div>
        <div className="mf">
          {inst.options.map((o) => (
            <button key={o.id} className="option" disabled={!!o.disabled} onClick={async () => {
              audio.click();
              const r = await run({ type: 'resolveEvent', instanceId: inst.id, optionId: o.id });
              if (r.ok) setOpenIdx(0);
            }}>
              <div>{o.label}</div>
              <div className="d">{o.disabled ? `Unavailable: ${o.disabled}` : o.desc}</div>
            </button>
          ))}
          <div className="row" style={{ marginTop: 6 }}>
            {pending.length > 1 && <span className="muted small">{pending.length} decisions pending</span>}
            <button className="btn ghost small" style={{ marginLeft: 'auto' }} onClick={() => setDismissed(new Set([...dismissed, inst.id]))}>Decide later</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IntroModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2>HELIOS — Dawn of a New Era</h2>
        </div>
        <div className="mb intro">{INTRO}</div>
        <div className="mf">
          <div className="note small">
            You are the leadership of the United Nations of Earth, the institution itself rather than any one ruler. Member states, corporations and colonies act on their own. You set common policy: laws, budgets, UNE settlements and fleets, research, and constitutional reform. Time is paused. Press Space or pick a speed to begin.
          </div>
          <button className="btn primary" style={{ padding: 9 }} onClick={onClose}>Begin</button>
        </div>
      </div>
    </div>
  );
}

function GameOverModal() {
  const s = useGame()!;
  const go = s.gameOver!;
  return (
    <div className="overlay">
      <div className="modal gameover">
        <div className="mh">
          <h2>{go.title}</h2>
        </div>
        <div className="mb">
          {go.reason}
          {'\n\n'}The campaign ended on {formatDate(go.day)}. The history archive preserves everything that led here.
        </div>
        <div className="mf">
          <button className="btn" onClick={() => location.reload()}>Return to the main menu</button>
        </div>
      </div>
    </div>
  );
}

function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(
    () =>
      onToast((t) => {
        setList((l) => [...l.slice(-4), t]);
        setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), t.kind === 'crit' ? 9000 : 5000);
      }),
    [],
  );
  return (
    <div className="toasts">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
      ))}
    </div>
  );
}
