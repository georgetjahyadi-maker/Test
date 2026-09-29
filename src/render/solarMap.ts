// The strategic Solar System map: a pixel-art canvas renderer with zoom levels,
// map modes, orbits, settlements, routes and the Helios swarm.
import type { GameState } from '../sim/types';
import { BODIES, BODY, AU_KM } from '../sim/content/bodies';
import { SITE } from '../sim/content/sites';
import { helioPosition, relativePosition, MOONS_OF } from '../sim/physics/orbits';
import { planetSprite, drawRings } from './planets';
import { makeCanvas, ctx2d, prng } from './pixel';
import { STATUS_COLOR } from './palette';

export type MapMode = 'political' | 'population' | 'industry' | 'resources' | 'energy' | 'trade' | 'science' | 'military' | 'communications' | 'migration' | 'dyson';

export const MAP_MODES: { id: MapMode; label: string }[] = [
  { id: 'political', label: 'Political' },
  { id: 'population', label: 'Population' },
  { id: 'industry', label: 'Industry' },
  { id: 'resources', label: 'Resources' },
  { id: 'energy', label: 'Energy' },
  { id: 'trade', label: 'Trade' },
  { id: 'science', label: 'Science' },
  { id: 'military', label: 'Security' },
  { id: 'communications', label: 'Comms delay' },
  { id: 'migration', label: 'Migration' },
  { id: 'dyson', label: 'Dyson swarm' },
];

const PLANET_SIZE: Record<string, number> = { sun: 22, mercury: 5, venus: 7, earth: 8, mars: 6, jupiter: 15, saturn: 13, uranus: 10, neptune: 10, ceres: 4, vesta: 3, psyche: 3, pluto: 3, bennu: 2, ryugu: 2, amun: 2 };

interface Hit {
  x: number;
  y: number;
  r: number;
  kind: 'body' | 'settlement';
  id: string;
}

export class SolarMapRenderer {
  private low: HTMLCanvasElement;
  private lg: CanvasRenderingContext2D;
  private stars: { x: number; y: number; b: number }[] = [];
  private beltDots: { a: number; r: number; p: number }[] = [];
  private kuiperDots: { a: number; r: number }[] = [];
  scale = 1; // pixel scale factor (low-res upscaling)
  zoom = 1;
  panX = 0;
  panY = 0;
  focus: string | null = null; // planet in planetary view
  mode: MapMode = 'political';
  selected: string | null = null;
  hits: Hit[] = [];
  private w = 0;
  private h = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.low = makeCanvas(10, 10);
    this.lg = ctx2d(this.low);
    const r = prng(12345);
    for (let i = 0; i < 700; i++) this.stars.push({ x: r(), y: r(), b: r() });
    for (let i = 0; i < 900; i++) this.beltDots.push({ a: r() * Math.PI * 2, r: 2.1 + r() * 1.2 + (r() - 0.5) * 0.2, p: r() });
    for (let i = 0; i < 500; i++) this.kuiperDots.push({ a: r() * Math.PI * 2, r: 36 + r() * 14 });
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.scale = cssW > 1400 ? 3 : 2;
    this.canvas.width = Math.floor(cssW * dpr);
    this.canvas.height = Math.floor(cssH * dpr);
    this.w = Math.ceil(cssW / this.scale);
    this.h = Math.ceil(cssH / this.scale);
    this.low.width = this.w;
    this.low.height = this.h;
    this.lg = ctx2d(this.low);
  }

  /** Radial compression so the whole system fits: display radius ∝ sqrt(r). */
  private project(xAU: number, yAU: number): [number, number] {
    const r = Math.hypot(xAU, yAU);
    const rd = Math.sqrt(r);
    const k = r > 0 ? rd / r : 0;
    const base = Math.min(this.w, this.h) * 0.46 / Math.sqrt(32);
    const s = base * this.zoom;
    return [this.w / 2 + this.panX + xAU * k * s, this.h / 2 + this.panY - yAU * k * s];
  }

  private radiusPx(rAU: number): number {
    const base = Math.min(this.w, this.h) * 0.46 / Math.sqrt(32);
    return Math.sqrt(rAU) * base * this.zoom;
  }

  render(s: GameState | null, day: number, t: number) {
    const g = this.lg;
    const W = this.w, H = this.h;
    g.fillStyle = '#03050a';
    g.fillRect(0, 0, W, H);
    for (const st of this.stars) {
      const tw = st.b > 0.93 ? (Math.sin(t * 0.002 + st.x * 90) > 0.6 ? '#ffffff' : '#8fa0b5') : st.b > 0.7 ? '#556070' : '#2a3140';
      g.fillStyle = tw;
      g.fillRect(Math.floor(st.x * W), Math.floor(st.y * H), 1, 1);
    }
    this.hits = [];
    if (this.focus) this.renderPlanetary(s, day, t);
    else this.renderSystem(s, day, t);
    // upscale
    const out = this.canvas.getContext('2d')!;
    out.imageSmoothingEnabled = false;
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.drawImage(this.low, 0, 0, W * this.scale * (this.canvas.width / (W * this.scale)), H * this.scale * (this.canvas.height / (H * this.scale)));
    this.drawLabels(out, s, day);
  }

  private labels: { x: number; y: number; text: string; color: string; bold?: boolean }[] = [];

  private renderSystem(s: GameState | null, day: number, t: number) {
    const g = this.lg;
    this.labels = [];
    const sun = this.project(0, 0);
    // Energy mode: flux rings
    if (this.mode === 'energy' || this.mode === 'dyson') {
      for (const [r, lbl] of [[0.1, '136 kW/m²'], [0.2, '34 kW/m²'], [0.39, '9 kW/m²'], [1, '1.4 kW/m²'], [5.2, '50 W/m²']] as [number, string][]) {
        this.circle(sun[0], sun[1], this.radiusPx(r), 'rgba(255,216,77,0.25)', true);
        this.labels.push({ x: sun[0] + this.radiusPx(r) * 0.72, y: sun[1] - this.radiusPx(r) * 0.72, text: lbl, color: '#b89a2e' });
      }
    }
    // Communications mode: light-delay rings around Earth
    if (this.mode === 'communications') {
      const e = helioPosition('earth', day);
      for (const [lm, lbl] of [[3, '3 light-min'], [10, '10'], [20, '20'], [45, '45'], [90, '90'], [240, '4 light-h']] as [number, string][]) {
        const rAU = (lm * 60 * 299792.458) / AU_KM;
        g.fillStyle = 'rgba(110,231,255,0.5)';
        let lx = 0, ly = 0;
        for (let k = 0; k < 160; k++) {
          const a = (k / 160) * Math.PI * 2;
          const [px, py] = this.project(e.x + Math.cos(a) * rAU, e.y + Math.sin(a) * rAU);
          if (k % 2 === 0) g.fillRect(Math.round(px), Math.round(py), 1, 1);
          if (k === 20) { lx = px; ly = py; }
        }
        this.labels.push({ x: lx, y: ly, text: lbl, color: '#6ee7ff' });
      }
    }
    // Orbits
    for (const b of BODIES) {
      if (b.parent !== 'sun') continue;
      const sel = this.selected === b.id;
      const color = sel ? 'rgba(230,237,243,0.6)' : b.type === 'planet' ? 'rgba(90,110,140,0.55)' : 'rgba(70,80,100,0.4)';
      g.fillStyle = color;
      const steps = b.type === 'planet' ? 360 : 180;
      for (let k = 0; k < steps; k++) {
        if (k % (b.type === 'planet' ? 2 : 3) !== 0) continue;
        const pos = orbitPoint(b.id, k / steps);
        const [x, y] = this.project(pos.x, pos.y);
        g.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
    // Asteroid belt and Kuiper belt
    for (const d of this.beltDots) {
      const a = d.a + day * 0.0006 * (1 / Math.pow(d.r, 1.5));
      const [x, y] = this.project(Math.cos(a) * d.r, Math.sin(a) * d.r);
      g.fillStyle = d.p > 0.8 ? '#6b6f78' : '#3d414a';
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    for (const d of this.kuiperDots) {
      const [x, y] = this.project(Math.cos(d.a) * d.r, Math.sin(d.a) * d.r);
      g.fillStyle = '#2a3140';
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    // Swarm
    if (s) this.drawSwarm(s, day, t);
    // Sun glow
    const glowR = 26 * Math.min(2, Math.max(0.6, this.zoom));
    const grd = g.createRadialGradient(sun[0], sun[1], 2, sun[0], sun[1], glowR);
    grd.addColorStop(0, 'rgba(255,230,140,0.55)');
    grd.addColorStop(1, 'rgba(255,160,40,0)');
    g.fillStyle = grd;
    g.fillRect(sun[0] - glowR, sun[1] - glowR, glowR * 2, glowR * 2);
    const sunSize = Math.round(PLANET_SIZE.sun * Math.min(1.6, Math.max(0.7, this.zoom * 0.8)));
    g.drawImage(planetSprite('sun', sunSize, t * 0.00002, 0), Math.round(sun[0] - sunSize / 2), Math.round(sun[1] - sunSize / 2));
    this.hits.push({ x: sun[0], y: sun[1], r: sunSize / 2 + 2, kind: 'body', id: 'sun' });
    // Routes
    if (s) this.drawRoutes(s, day, t);
    // Bodies
    for (const b of BODIES) {
      if (b.parent !== 'sun') continue;
      const p = helioPosition(b.id, day);
      const [x, y] = this.project(p.x, p.y);
      const size = Math.max(2, Math.round((PLANET_SIZE[b.id] ?? 3) * Math.min(1.8, Math.max(0.8, this.zoom * 0.7))));
      const light = Math.atan2(-(y - sun[1]), -(x - sun[0]));
      if (b.style === 'saturn') drawRings(g, x, y, size / 2, false);
      g.drawImage(planetSprite(b.id, size, t * 0.00004 + (b.id.length * 0.13), light + Math.PI), Math.round(x - size / 2), Math.round(y - size / 2));
      if (b.style === 'saturn') drawRings(g, x, y, size / 2, true);
      this.hits.push({ x, y, r: Math.max(5, size / 2 + 3), kind: 'body', id: b.id });
      if (this.selected === b.id) this.bracket(x, y, size / 2 + 3, '#e6edf3');
      // The Moon as a small companion dot near Earth
      for (const m of MOONS_OF[b.id] ?? []) {
        if (m.id !== 'moon' && this.zoom < 2.5) continue;
        const rel = relativePosition(m, day);
        const off = 4 + Math.log10(m.a / 1000 + 1) * 3 * Math.min(2, this.zoom * 0.6);
        const ang = Math.atan2(rel.y, rel.x);
        const mx = x + Math.cos(ang) * (size / 2 + off), my = y - Math.sin(ang) * (size / 2 + off);
        g.fillStyle = m.id === 'moon' ? '#d0d0d0' : '#9aa7b8';
        g.fillRect(Math.round(mx), Math.round(my), 1, 1);
        this.hits.push({ x: mx, y: my, r: 3, kind: 'body', id: m.id });
      }
      if (b.type === 'planet' || this.zoom > 1.6 || b.id === 'ceres') this.labels.push({ x, y: y + size / 2 + 4, text: b.name, color: this.selected === b.id ? '#ffffff' : '#8fa0b5' });
    }
    // Settlements
    if (s) this.drawSettlementMarkers(s, day, t);
  }

  private settlementColor(s: GameState, stId: string): string {
    const st = s.settlements[stId];
    const pop = st.pop.bands.reduce((a, v) => a + v, 0);
    switch (this.mode) {
      case 'population': return pop > 1e6 ? '#5fd38a' : pop > 1e4 ? '#8fe0a8' : pop > 100 ? '#c9f0d4' : '#7d8b99';
      case 'industry': return st.closure > 0.8 ? '#ff9f43' : st.closure > 0.5 ? '#ffb96e' : st.closure > 0.2 ? '#ffd3a1' : '#7d8b99';
      case 'science': return st.science > 500 ? '#b98cff' : st.science > 50 ? '#cfb2ff' : '#7d8b99';
      case 'energy': return st.energy.ratio < 0.9 ? '#ff5c5c' : '#ffd84d';
      case 'military': return (s.security.piracy[SITE[st.siteId].region] ?? 0) > 0.01 ? '#ff5c5c' : '#9aa7b8';
      case 'migration': return st.pop.immigrants > st.pop.emigrants ? '#5fd38a' : '#ff5c5c';
      default: return STATUS_COLOR[st.status] ?? '#9aa7b8';
    }
  }

  private drawSettlementMarkers(s: GameState, day: number, t: number) {
    const g = this.lg;
    const byBody: Record<string, string[]> = {};
    for (const id of Object.keys(s.settlements).sort()) {
      const b = SITE[s.settlements[id].siteId].body;
      const root = BODY[b].type === 'moon' ? BODY[b].parent! : b;
      (byBody[root] ??= []).push(id);
    }
    for (const root in byBody) {
      const p = helioPosition(root, day);
      const [x, y] = this.project(p.x, p.y);
      const list = byBody[root];
      const ring = (PLANET_SIZE[root] ?? 3) / 2 + 5;
      list.forEach((id, i) => {
        const st = s.settlements[id];
        const a = -Math.PI / 2 + (i / Math.max(1, list.length)) * Math.PI * 2;
        const mx = Math.round(x + Math.cos(a) * ring), my = Math.round(y + Math.sin(a) * ring);
        const pop = st.pop.bands.reduce((q, v) => q + v, 0);
        const sz = this.mode === 'population' ? Math.max(1, Math.min(4, Math.round(Math.log10(pop + 1) - 1))) : pop > 1e5 ? 2 : 1;
        g.fillStyle = '#03050a';
        g.fillRect(mx - sz, my - sz, sz * 2 + 1, sz * 2 + 1);
        g.fillStyle = this.settlementColor(s, id);
        g.fillRect(mx - sz + 1, my - sz + 1, sz * 2 - 1, sz * 2 - 1);
        if (st.construction.length && Math.floor(t / 400) % 2 === 0) {
          g.fillStyle = '#ffb347';
          g.fillRect(mx + sz, my - sz, 1, 1);
        }
        this.hits.push({ x: mx, y: my, r: 3, kind: 'settlement', id });
        if (this.selected === id) this.bracket(mx, my, sz + 2, '#ffffff');
      });
    }
  }

  private drawRoutes(s: GameState, day: number, t: number) {
    const g = this.lg;
    for (const r of Object.values(s.routes)) {
      if (!r.active) continue;
      const o = s.settlements[r.origin], d = s.settlements[r.destination];
      if (!o || !d) continue;
      const ob = rootBody(SITE[o.siteId].body), db = rootBody(SITE[d.siteId].body);
      if (ob === db) continue;
      const pa = helioPosition(ob, day), pb = helioPosition(db, day);
      const [x1, y1] = this.project(pa.x, pa.y);
      const [x2, y2] = this.project(pb.x, pb.y);
      const vol = r.stats.deliveredYear;
      const strong = this.mode === 'trade' ? Math.min(3, Math.max(1, Math.round(Math.log10(vol + 1) - 1))) : 1;
      const col = r.owner === 'une' ? '77,163,255' : '255,159,67';
      const len = Math.hypot(x2 - x1, y2 - y1);
      const n = Math.max(2, Math.floor(len / 2));
      // curved path
      const mx = (x1 + x2) / 2 - (y2 - y1) * 0.12, my = (y1 + y2) / 2 + (x2 - x1) * 0.12;
      for (let k = 0; k <= n; k++) {
        if (k % 3 !== 0) continue;
        const u = k / n;
        const px = (1 - u) * (1 - u) * x1 + 2 * (1 - u) * u * mx + u * u * x2;
        const py = (1 - u) * (1 - u) * y1 + 2 * (1 - u) * u * my + u * u * y2;
        g.fillStyle = `rgba(${col},${this.mode === 'trade' ? 0.7 : 0.35})`;
        g.fillRect(Math.round(px), Math.round(py), strong, strong);
      }
      // moving ships
      if (vol > 0) {
        const ships = Math.min(4, 1 + Math.floor(Math.log10(vol + 1)));
        for (let k = 0; k < ships; k++) {
          const u = ((t * 0.00012 + k / ships + (r.id.length % 7) * 0.1) % 1);
          const px = (1 - u) * (1 - u) * x1 + 2 * (1 - u) * u * mx + u * u * x2;
          const py = (1 - u) * (1 - u) * y1 + 2 * (1 - u) * u * my + u * u * y2;
          g.fillStyle = r.owner === 'une' ? '#9fd0ff' : '#ffd3a1';
          g.fillRect(Math.round(px), Math.round(py), 2, 1);
        }
      }
    }
  }

  private drawSwarm(s: GameState, day: number, t: number) {
    const g = this.lg;
    const sw = s.swarm;
    if (sw.totalCollectors < 1) return;
    const emph = this.mode === 'dyson' || this.mode === 'energy';
    for (const c of sw.cohorts) {
      const d = sw.designs[c.designId];
      if (!d) continue;
      const n = Math.min(2600, Math.round(20 * Math.pow(Math.log10(c.count + 1), 1.8)));
      const r = prng(c.id.length * 997 + c.count.toString().length);
      const period = Math.pow(d.radiusAU, 1.5) * 365.25;
      for (let i = 0; i < n; i++) {
        const a0 = r() * Math.PI * 2;
        const jitter = (r() - 0.5) * 0.04 * d.radiusAU;
        const incl = (r() - 0.5) * 0.35;
        const a = a0 + ((day + t * 0.0003) / period) * Math.PI * 2;
        const rad = d.radiusAU + jitter;
        const x = Math.cos(a) * rad;
        const y = Math.sin(a) * rad * (1 - Math.abs(incl) * 0.4);
        const [px, py] = this.project(x, y);
        g.fillStyle = emph ? (i % 5 === 0 ? '#fff2a8' : '#ffd84d') : i % 4 === 0 ? '#e0c060' : '#8a7430';
        g.fillRect(Math.round(px), Math.round(py), 1, 1);
      }
    }
  }

  // ---------------------------------------------------------------- Planetary view
  private renderPlanetary(s: GameState | null, day: number, t: number) {
    const g = this.lg;
    const b = BODY[this.focus!];
    this.labels = [];
    const cx = this.w / 2 + this.panX, cy = this.h / 2 + this.panY;
    const size = Math.round(Math.min(this.w, this.h) * 0.28 * Math.min(2.5, this.zoom));
    const sunDir = (() => {
      const p = helioPosition(b.id, day);
      return Math.atan2(p.y, -p.x) + Math.PI;
    })();
    const moons = MOONS_OF[b.id] ?? [];
    const maxA = Math.max(1, ...moons.map((m) => m.a));
    const orbitR = (a: number) => size / 2 + 10 + (Math.log10(a / 1000 + 1) / Math.log10(maxA / 1000 + 1)) * Math.min(this.w, this.h) * 0.36 * this.zoom;
    // moon orbits
    for (const m of moons) {
      const rr = orbitR(m.a);
      this.circle(cx, cy, rr, this.selected === m.id ? 'rgba(230,237,243,0.5)' : 'rgba(90,110,140,0.5)', true);
    }
    // Orbital nodes: low orbit ring, GEO, L1/L5 markers for Earth
    const nodes: { label: string; r: number; site?: string }[] = [];
    if (b.id === 'earth') {
      nodes.push({ label: 'LEO', r: size / 2 + 4, site: 'leo' }, { label: 'GEO', r: size / 2 + 10, site: 'geo' });
    } else if (b.lowOrbitAltKm) nodes.push({ label: 'Low orbit', r: size / 2 + 4 });
    for (const n of nodes) this.circle(cx, cy, n.r, 'rgba(77,163,255,0.45)', true);
    if (b.style === 'saturn') drawRings(g, cx, cy, size / 2, false);
    g.drawImage(planetSprite(b.id, size, t * 0.00003, sunDir), Math.round(cx - size / 2), Math.round(cy - size / 2));
    if (b.style === 'saturn') drawRings(g, cx, cy, size / 2, true);
    this.hits.push({ x: cx, y: cy, r: size / 2, kind: 'body', id: b.id });
    this.labels.push({ x: cx, y: cy + size / 2 + 8, text: b.name, color: '#e6edf3', bold: true });
    for (const m of moons) {
      const rel = relativePosition(m, day);
      const ang = Math.atan2(rel.y, rel.x);
      const rr = orbitR(m.a);
      const mx = cx + Math.cos(ang) * rr, my = cy - Math.sin(ang) * rr;
      const ms = Math.max(4, Math.round(size * 0.12 * Math.min(2, Math.max(0.5, m.radiusKm / 1500))));
      g.drawImage(planetSprite(m.id, ms, t * 0.00003, sunDir), Math.round(mx - ms / 2), Math.round(my - ms / 2));
      this.hits.push({ x: mx, y: my, r: ms / 2 + 3, kind: 'body', id: m.id });
      this.labels.push({ x: mx, y: my + ms / 2 + 4, text: m.name, color: this.selected === m.id ? '#ffffff' : '#8fa0b5' });
      if (this.selected === m.id) this.bracket(mx, my, ms / 2 + 3, '#ffffff');
      if (s) this.placeSites(s, m.id, mx, my, ms / 2 + 5, t);
    }
    if (b.id === 'earth') {
      // Lagrange points relative to the Moon
      const moon = moons.find((m) => m.id === 'moon');
      if (moon) {
        const rel = relativePosition(moon, day);
        const ang = Math.atan2(rel.y, rel.x);
        const rr = orbitR(moon.a);
        const pts: [string, number, number][] = [['L1', ang, rr * 0.84], ['L5', ang - Math.PI / 3, rr]];
        for (const [lbl, a, r] of pts) {
          const lx = cx + Math.cos(a) * r, ly = cy - Math.sin(a) * r;
          g.fillStyle = '#4da3ff';
          g.fillRect(Math.round(lx) - 1, Math.round(ly), 3, 1);
          g.fillRect(Math.round(lx), Math.round(ly) - 1, 1, 3);
          this.labels.push({ x: lx, y: ly - 5, text: `EM-${lbl}`, color: '#4da3ff' });
          if (s) {
            const siteId = lbl === 'L1' ? 'eml1' : 'eml5';
            this.placeSiteAt(s, siteId, lx + 4, ly);
          }
        }
      }
    }
    if (s) this.placeSites(s, b.id, cx, cy, size / 2 + 6, t);
    // Routes inside the planetary system: draw between site markers
    if (s) {
      for (const r of Object.values(s.routes)) {
        const o = s.settlements[r.origin], d = s.settlements[r.destination];
        if (!o || !d) continue;
        const ho = this.hits.find((h) => h.kind === 'settlement' && h.id === o.id);
        const hd = this.hits.find((h) => h.kind === 'settlement' && h.id === d.id);
        if (!ho || !hd) continue;
        const n = Math.max(2, Math.floor(Math.hypot(hd.x - ho.x, hd.y - ho.y) / 2));
        for (let k = 0; k <= n; k += 3) {
          const u = k / n;
          g.fillStyle = r.owner === 'une' ? 'rgba(77,163,255,0.6)' : 'rgba(255,159,67,0.6)';
          g.fillRect(Math.round(ho.x + (hd.x - ho.x) * u), Math.round(ho.y + (hd.y - ho.y) * u), 1, 1);
        }
        const u = (t * 0.0002 + r.id.length * 0.1) % 1;
        g.fillStyle = '#ffffff';
        g.fillRect(Math.round(ho.x + (hd.x - ho.x) * u), Math.round(ho.y + (hd.y - ho.y) * u), 2, 1);
      }
    }
  }

  private placeSiteAt(s: GameState, siteId: string, x: number, y: number) {
    const st = Object.values(s.settlements).find((q) => q.siteId === siteId);
    const g = this.lg;
    if (st) {
      g.fillStyle = '#03050a';
      g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
      g.fillStyle = this.settlementColor(s, st.id);
      g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
      this.hits.push({ x, y, r: 4, kind: 'settlement', id: st.id });
      this.labels.push({ x: x + 16, y, text: st.name, color: '#c9d3dc' });
      if (this.selected === st.id) this.bracket(x, y, 4, '#ffffff');
    }
  }

  private placeSites(s: GameState, bodyId: string, cx: number, cy: number, r: number, t: number) {
    const g = this.lg;
    const sites = Object.values(SITE).filter((x) => x.body === bodyId && !['eml1', 'eml5'].includes(x.id));
    sites.forEach((site, i) => {
      const a = -Math.PI * 0.75 + (i / Math.max(1, sites.length)) * Math.PI * 1.5;
      const orbital = site.kind === 'orbital';
      const rr = orbital ? r + 6 : r - 4;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      const st = Object.values(s.settlements).find((q) => q.siteId === site.id);
      if (st) {
        g.fillStyle = '#03050a';
        g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
        g.fillStyle = this.settlementColor(s, st.id);
        g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
        this.hits.push({ x, y, r: 4, kind: 'settlement', id: st.id });
        this.labels.push({ x, y: y - 6, text: st.name, color: '#e6edf3' });
        if (this.selected === st.id) this.bracket(x, y, 4, '#ffffff');
      } else {
        g.fillStyle = this.mode === 'resources' && site.deposits.length ? '#ff9f43' : '#3a4452';
        g.fillRect(Math.round(x), Math.round(y), 1, 1);
        if (this.mode === 'resources' || this.zoom > 1.3) this.labels.push({ x, y: y - 5, text: site.name, color: '#556070' });
        this.hits.push({ x, y, r: 3, kind: 'body', id: 'site:' + site.id });
      }
    });
    void t;
  }

  // ---------------------------------------------------------------- helpers
  private circle(cx: number, cy: number, r: number, color: string, dotted: boolean) {
    const g = this.lg;
    g.fillStyle = color;
    const n = Math.max(16, Math.floor(r * 4));
    for (let k = 0; k < n; k++) {
      if (dotted && k % 2) continue;
      const a = (k / n) * Math.PI * 2;
      g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
    }
  }

  private bracket(x: number, y: number, r: number, color: string) {
    const g = this.lg;
    g.fillStyle = color;
    const R = Math.round(r + 1);
    const X = Math.round(x), Y = Math.round(y);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.fillRect(X + dx * R - (dx > 0 ? 1 : 0), Y + dy * R - (dy > 0 ? 1 : 0), 2, 1);
      g.fillRect(X + dx * R - (dx > 0 ? 0 : 0), Y + dy * R - (dy > 0 ? 1 : 0), 1, 2);
    }
  }

  private drawLabels(out: CanvasRenderingContext2D, s: GameState | null, day: number) {
    const k = this.canvas.width / this.w;
    out.textAlign = 'center';
    out.textBaseline = 'top';
    const fs = Math.max(10, Math.round(10 * (this.canvas.width / (this.w * this.scale))));
    for (const l of this.labels) {
      out.font = `${l.bold ? '600 ' : ''}${fs}px "IBM Plex Mono", ui-monospace, monospace`;
      out.fillStyle = 'rgba(3,5,10,0.7)';
      const tw = out.measureText(l.text).width;
      out.fillRect(l.x * k - tw / 2 - 2, l.y * k - 1, tw + 4, fs + 2);
      out.fillStyle = l.color;
      out.fillText(l.text, l.x * k, l.y * k);
    }
    void s;
    void day;
  }

  hitTest(cssX: number, cssY: number): Hit | null {
    const x = cssX / this.scale, y = cssY / this.scale;
    let best: Hit | null = null;
    let bd = Infinity;
    for (const h of this.hits) {
      const d = Math.hypot(h.x - x, h.y - y);
      const slack = h.kind === 'settlement' ? 1.5 : 0;
      if (d <= h.r + 2 + slack && (d < bd || (h.kind === 'settlement' && best?.kind !== 'settlement' && d < bd + 3))) {
        bd = d;
        best = h;
      }
    }
    return best;
  }

  zoomAt(cssX: number, cssY: number, factor: number) {
    const x = cssX / this.scale - this.w / 2 - this.panX;
    const y = cssY / this.scale - this.h / 2 - this.panY;
    const nz = Math.max(0.5, Math.min(12, this.zoom * factor));
    const f = nz / this.zoom;
    this.panX -= x * (f - 1);
    this.panY -= y * (f - 1);
    this.zoom = nz;
  }

  pan(dxCss: number, dyCss: number) {
    this.panX += dxCss / this.scale;
    this.panY += dyCss / this.scale;
  }

  resetView() {
    this.zoom = this.focus ? 1 : 1;
    this.panX = 0;
    this.panY = 0;
  }
}

const orbitCache = new Map<string, { x: number; y: number }[]>();
function orbitPoint(bodyId: string, u: number): { x: number; y: number } {
  let pts = orbitCache.get(bodyId);
  if (!pts) {
    const b = BODY[bodyId];
    pts = [];
    for (let k = 0; k < 360; k++) {
      const M = (k / 360) * Math.PI * 2;
      // solve for position using eccentric anomaly approximation
      let E = M;
      for (let i = 0; i < 8; i++) E = E - (E - b.e * Math.sin(E) - M) / (1 - b.e * Math.cos(E));
      const nu = 2 * Math.atan2(Math.sqrt(1 + b.e) * Math.sin(E / 2), Math.sqrt(1 - b.e) * Math.cos(E / 2));
      const r = b.a * (1 - b.e * Math.cos(E));
      const ang = nu + (b.w * Math.PI) / 180;
      pts.push({ x: r * Math.cos(ang), y: r * Math.sin(ang) });
    }
    orbitCache.set(bodyId, pts);
  }
  return pts[Math.floor(u * 360) % 360];
}

function rootBody(b: string): string {
  const d = BODY[b];
  return d && d.type === 'moon' && d.parent ? d.parent : b;
}
