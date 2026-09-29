// Procedural settlement scenes: what you see reflects what actually exists (§90, §129).
import type { Settlement } from '../sim/types';
import { SITE } from '../sim/content/sites';
import { BODY } from '../sim/content/bodies';
import { FACILITY } from '../sim/content/facilities';
import { makeCanvas, ctx2d, hex, mix, rgbStr, ditherGradient, prng, hashStr, fbm3, type RGB } from './pixel';

function px(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

const SKY: Record<string, [string, string]> = {
  mars: ['#c98b5a', '#f0c9a0'],
  venus: ['#fff2c4', '#e8c47a'],
  titan: ['#8a5a22', '#d99a45'],
  earth: ['#0a1a3a', '#33598f'],
};

function visCount(n: number, k = 1.6, max = 12): number {
  if (n <= 0) return 0;
  return Math.max(1, Math.min(max, Math.round(Math.log2(n + 1) * k)));
}

export function colonyScene(st: Settlement, w = 320, h = 128, dayPhase = 0): HTMLCanvasElement {
  const site = SITE[st.siteId];
  const body = BODY[site.body];
  const cv = makeCanvas(w, h);
  const g = ctx2d(cv);
  const rnd = prng(hashStr(st.id));
  const counts: Record<string, number> = {};
  for (const f of st.facilities) counts[f.type] = (counts[f.type] ?? 0) + f.count;
  const cons: Record<string, number> = {};
  for (const p of st.construction) cons[p.type] = (cons[p.type] ?? 0) + p.count;
  const pop = st.pop.bands.reduce((a, v) => a + v, 0);
  const orbital = site.kind === 'orbital';
  const bodyColors = body.colors.map(hex);
  // ------------------------------------------------------------ Sky
  const sky = SKY[site.body];
  if (sky && !orbital) ditherGradient(g, 0, 0, w, h, hex(sky[0]), hex(sky[1]), 6);
  else {
    px(g, 0, 0, w, h, '#03050a');
    for (let i = 0; i < 90; i++) px(g, rnd() * w, rnd() * h * 0.8, 1, 1, rnd() > 0.85 ? '#ffffff' : '#7d8b99');
  }
  if (orbital) return orbitalScene(g, st, w, h, counts, cons, pop, rnd, bodyColors);
  // Earth in the sky for lunar sites
  if (site.body === 'moon' && site.features.includes('earthView') || site.region === 'luna') {
    const ex = w * 0.8, ey = h * 0.18;
    g.fillStyle = '#2f7be0';
    g.beginPath();
    g.arc(ex, ey, 6, 0, Math.PI * 2);
    g.fill();
    px(g, ex - 3, ey - 2, 3, 2, '#3f9a55');
    px(g, ex + 1, ey + 1, 2, 1, '#e9f4ff');
  }
  if (site.body === 'mars') {
    px(g, w * 0.15, h * 0.12, 2, 2, '#e8e0d0');
  }
  // ------------------------------------------------------------ Ground
  const groundY = Math.floor(h * 0.68);
  const base = bodyColors[Math.min(1, bodyColors.length - 1)];
  const dark = bodyColors[Math.min(3, bodyColors.length - 1)];
  const seed = hashStr(site.id);
  for (let x = 0; x < w; x++) {
    const hgt = Math.round(fbm3(x / 40, 0.5, seed % 97, seed, 3) * 10 - 4);
    const hills = Math.round(fbm3(x / 90, 3.1, seed % 13, seed + 1, 3) * 22 - 8);
    // far hills
    for (let y = groundY - 18 - hills; y < groundY; y++) {
      const c = mix(dark, base, 0.25);
      px(g, x, y, 1, 1, rgbStr(mix(c, [0, 0, 0], 0.25)));
    }
    for (let y = groundY + hgt; y < h; y++) {
      const t = (y - groundY) / (h - groundY);
      const c = mix(base, dark, Math.min(1, t * 0.8 + ((x * 7 + y * 3) % 5 === 0 ? 0.15 : 0)));
      px(g, x, y, 1, 1, rgbStr(c));
    }
  }
  // craters on airless worlds
  if (body.atmosphere === 'none') {
    for (let i = 0; i < 6; i++) {
      const cx = rnd() * w, cy = groundY + 8 + rnd() * (h - groundY - 12), r = 2 + rnd() * 5;
      g.strokeStyle = rgbStr(mix(dark, [0, 0, 0], 0.3));
      g.beginPath();
      g.ellipse(Math.round(cx), Math.round(cy), r * 1.6, r * 0.5, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  // ------------------------------------------------------------ Structures
  let x = 6;
  const floor = groundY + 2;
  const lit = (a: number) => (a > rnd() ? '#ffd84d' : '#6b5a2a');
  const step = (wd: number) => {
    const at = x;
    x += wd + 3;
    return at;
  };
  // landing pad with a lander
  if ((counts.landingPad ?? 0) > 0) {
    const at = step(26);
    px(g, at, floor + 2, 26, 2, '#9aa7b8');
    px(g, at + 1, floor + 1, 24, 1, '#c9d3dc');
    px(g, at + 10, floor - 12, 6, 12, '#e4ebf2');
    px(g, at + 11, floor - 15, 4, 3, '#c9d3dc');
    px(g, at + 9, floor - 2, 2, 3, '#7a8795');
    px(g, at + 15, floor - 2, 2, 3, '#7a8795');
  }
  // habitats
  const hab = ['habModule', 'buriedHab', 'lavaTubeHab', 'domeDistrict', 'arcology', 'iceHab', 'aerostatHab', 'asteroidHab'];
  for (const t of hab) {
    const n = counts[t] ?? 0;
    if (!n) continue;
    const v = visCount(n, t === 'habModule' ? 2 : 1.4, t === 'arcology' ? 4 : 10);
    for (let i = 0; i < v; i++) {
      if (x > w - 20) break;
      if (t === 'habModule') {
        const at = step(10);
        px(g, at, floor - 6, 10, 6, '#e4ebf2');
        px(g, at + 1, floor - 7, 8, 1, '#ffffff');
        px(g, at + 2, floor - 4, 1, 1, lit(0.7));
        px(g, at + 5, floor - 4, 1, 1, lit(0.7));
      } else if (t === 'buriedHab') {
        const at = step(18);
        g.fillStyle = rgbStr(mix(base, [0, 0, 0], 0.15));
        g.beginPath();
        g.ellipse(at + 9, floor, 9, 6, 0, Math.PI, 0);
        g.fill();
        px(g, at + 7, floor - 2, 4, 2, '#3a3f47');
        px(g, at + 8, floor - 1, 2, 1, lit(0.8));
      } else if (t === 'lavaTubeHab') {
        const at = step(24);
        px(g, at, floor, 24, 4, '#1d1f24');
        for (let k = 2; k < 22; k += 3) px(g, at + k, floor + 1, 1, 1, lit(0.8));
        px(g, at + 8, floor - 3, 8, 3, '#5b6470');
      } else if (t === 'domeDistrict' || t === 'iceHab') {
        const at = step(30);
        g.fillStyle = t === 'iceHab' ? '#bfe3ff' : '#9fd3ff';
        g.beginPath();
        g.ellipse(at + 15, floor, 15, 12, 0, Math.PI, 0);
        g.fill();
        g.fillStyle = '#e6f4ff';
        g.fillRect(at + 5, floor - 9, 3, 2);
        for (let k = 0; k < 8; k++) px(g, at + 5 + k * 3, floor - 4 - (k % 3) * 2, 2, 3, lit(0.6));
        px(g, at + 8, floor - 6, 3, 5, '#3f9a55');
        px(g, at + 18, floor - 5, 3, 4, '#3f9a55');
      } else if (t === 'arcology') {
        const at = step(26);
        px(g, at + 4, floor - 52, 18, 52, '#7a8795');
        px(g, at + 7, floor - 60, 12, 8, '#9aa7b8');
        px(g, at + 11, floor - 66, 4, 6, '#c9d3dc');
        for (let yy = floor - 50; yy < floor - 2; yy += 3) for (let xx = at + 6; xx < at + 20; xx += 3) px(g, xx, yy, 1, 1, lit(0.65));
      } else if (t === 'aerostatHab') {
        const at = step(34);
        g.fillStyle = '#f7f1e0';
        g.beginPath();
        g.ellipse(at + 17, floor - 34, 17, 10, 0, 0, Math.PI * 2);
        g.fill();
        px(g, at + 8, floor - 24, 18, 4, '#9aa7b8');
        for (let k = 0; k < 5; k++) px(g, at + 10 + k * 3, floor - 23, 1, 1, lit(0.8));
      } else {
        const at = step(20);
        g.fillStyle = rgbStr(dark);
        g.beginPath();
        g.ellipse(at + 10, floor - 8, 10, 8, 0, 0, Math.PI * 2);
        g.fill();
        for (let k = 0; k < 6; k++) px(g, at + 4 + k * 2, floor - 9, 1, 1, lit(0.8));
      }
    }
  }
  // greenhouses and life support
  const farm = (counts.greenhouse ?? 0) + (counts.algaeFarm ?? 0) + (counts.proteinVats ?? 0) * 10;
  for (let i = 0; i < visCount(farm, 1.3, 6); i++) {
    if (x > w - 16) break;
    const at = step(12);
    px(g, at, floor - 5, 12, 5, '#2d6e3e');
    px(g, at + 1, floor - 6, 10, 1, '#7ee39a');
    for (let k = 1; k < 11; k += 2) px(g, at + k, floor - 4, 1, 3, '#5fd38a');
  }
  const ls = counts.lifeSupport ?? 0;
  for (let i = 0; i < visCount(ls, 1, 4); i++) {
    if (x > w - 10) break;
    const at = step(7);
    px(g, at, floor - 8, 7, 8, '#8a96a3');
    px(g, at + 2, floor - 10, 3, 2, '#c9d3dc');
    px(g, at + 1, floor - 5, 5, 1, '#5fd38a');
  }
  // mining & processing
  const mining = ['iceMine', 'regolithRefinery', 'asteroidMiner', 'crustalMine', 'he3Harvester', 'autoMiner', 'atmosphereProcessor'];
  for (const t of mining) {
    const n = counts[t] ?? 0;
    for (let i = 0; i < visCount(n, 1.2, 4); i++) {
      if (x > w - 24) break;
      if (t === 'atmosphereProcessor') {
        const at = step(10);
        px(g, at + 2, floor - 16, 3, 16, '#7a8795');
        px(g, at, floor - 18, 7, 2, '#c9d3dc');
        px(g, at + 5, floor - 6, 5, 6, '#9aa7b8');
      } else {
        const at = step(22);
        px(g, at, floor + 1, 14, 3, '#1b1d22');
        px(g, at + 1, floor + 2, 12, 1, rgbStr(dark));
        px(g, at + 14, floor - 6, 8, 6, '#ffb347');
        px(g, at + 15, floor - 9, 3, 3, '#ffb347');
        px(g, at + 4, floor - 4, 10, 1, '#5b6470');
      }
    }
  }
  const proc = (counts.electrolysisPlant ?? 0) + (counts.propellantPlant ?? 0) * 2 + (counts.smelter ?? 0) * 2 + (counts.chemicalPlant ?? 0) * 2 + (counts.ceramicsWorks ?? 0) + (counts.fuelPlant ?? 0) * 2 + (counts.deuteriumPlant ?? 0) * 2;
  for (let i = 0; i < visCount(proc, 1.3, 6); i++) {
    if (x > w - 16) break;
    const at = step(14);
    px(g, at, floor - 10, 5, 10, '#d9dee6');
    px(g, at + 1, floor - 11, 3, 1, '#ffffff');
    px(g, at + 6, floor - 7, 5, 7, '#e6d9c2');
    px(g, at + 5, floor - 5, 1, 1, '#ff9f43');
    px(g, at + 11, floor - 12, 2, 12, '#7a8795');
  }
  const manu = (counts.fabShop ?? 0) + (counts.machineShop ?? 0) * 2 + (counts.electronicsFactory ?? 0) * 3 + (counts.semiconductorFab ?? 0) * 4 + (counts.pvFactory ?? 0) * 2 + (counts.superconductorPlant ?? 0) * 3 + (counts.shipyard ?? 0) * 3;
  for (let i = 0; i < visCount(manu, 1.2, 6); i++) {
    if (x > w - 20) break;
    const at = step(18);
    px(g, at, floor - 12, 18, 12, '#5b6470');
    px(g, at, floor - 13, 18, 1, '#8a96a3');
    for (let k = 2; k < 16; k += 4) px(g, at + k, floor - 9, 2, 2, lit(0.75));
    px(g, at + 14, floor - 18, 2, 6, '#8a96a3');
  }
  // energy
  const solar = counts.solarArray ?? 0;
  for (let i = 0; i < visCount(solar, 1.6, 10); i++) {
    if (x > w - 10) break;
    const at = step(8);
    px(g, at + 3, floor - 7, 1, 7, '#7a8795');
    for (let k = 0; k < 8; k++) px(g, at + k, floor - 10 + Math.floor(k / 3), 1, 3, k % 2 ? '#2d5aa0' : '#3d7bd9');
  }
  const reactors = (counts.fissionReactor ?? 0) + (counts.moltenSaltReactor ?? 0) * 3 + (counts.fusionPlant ?? 0) * 8;
  for (let i = 0; i < visCount(reactors, 1.2, 4); i++) {
    if (x > w - 24) break;
    const fusion = (counts.fusionPlant ?? 0) > 0 && i === 0;
    const at = step(22);
    px(g, at + 6, floor - (fusion ? 18 : 10), fusion ? 12 : 8, fusion ? 18 : 10, fusion ? '#39414c' : '#6c7480');
    if (fusion) px(g, at + 9, floor - 12, 6, 3, '#ff7ac8');
    else px(g, at + 8, floor - 7, 3, 2, '#7cf0c8');
    for (let k = 0; k < 4; k++) px(g, at + k * 2, floor - 16 + k, 1, 16 - k, '#d9dee6');
  }
  // science
  const sci = (counts.researchLab ?? 0) + (counts.observatory ?? 0) * 2 + (counts.university ?? 0) * 2 + (counts.commArray ?? 0);
  for (let i = 0; i < visCount(sci, 1.3, 5); i++) {
    if (x > w - 14) break;
    const at = step(12);
    if (i % 2 === 0) {
      px(g, at + 5, floor - 8, 2, 8, '#9aa7b8');
      g.fillStyle = '#e6edf3';
      g.beginPath();
      g.ellipse(at + 6, floor - 11, 6, 3, -0.4, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = '#c9d3dc';
      g.beginPath();
      g.arc(at + 6, floor, 6, Math.PI, 0);
      g.fill();
      px(g, at + 5, floor - 6, 2, 2, '#b98cff');
    }
  }
  // Dyson era industry
  const dy = (counts.collectorFactory ?? 0) * 3 + (counts.autoFactory ?? 0);
  for (let i = 0; i < visCount(dy, 1.5, 8); i++) {
    if (x > w - 26) break;
    const at = step(24);
    px(g, at, floor - 16, 24, 16, '#2a2d33');
    for (let k = 0; k < 24; k += 3) px(g, at + k, floor - 16, 2, 1, '#ffd84d');
    px(g, at + 3, floor - 10, 18, 2, '#ff9f43');
  }
  // Mass driver rail
  if ((counts.massDriver ?? 0) > 0) {
    for (let k = 0; k < 90; k++) px(g, w - 95 + k, floor - k * 0.45, 2, 1, k % 6 === 0 ? '#ffd84d' : '#c9d3dc');
  }
  // Construction cranes for queued projects
  const building = Object.values(cons).reduce((a, v) => a + v, 0);
  for (let i = 0; i < Math.min(3, building > 0 ? 1 + Math.floor(Math.log2(building)) : 0); i++) {
    const at = Math.min(w - 16, x + i * 14);
    px(g, at + 4, floor - 22, 1, 22, '#ffb347');
    px(g, at, floor - 22, 12, 1, '#ffb347');
    px(g, at + 10, floor - 21, 1, 5, '#9aa7b8');
  }
  // dust / people activity lights proportional to population
  const lights = Math.min(40, Math.round(Math.log10(pop + 1) * 8));
  for (let i = 0; i < lights; i++) px(g, rnd() * (x - 4) + 2, floor + 3 + rnd() * 4, 1, 1, '#ffd84d');
  void FACILITY;
  void dayPhase;
  return cv;
}

function orbitalScene(g: CanvasRenderingContext2D, st: Settlement, w: number, h: number, counts: Record<string, number>, cons: Record<string, number>, pop: number, rnd: () => number, bodyColors: RGB[]): HTMLCanvasElement {
  const site = SITE[st.siteId];
  // Planet curve at the bottom
  const planet = site.body;
  const pr = w * 1.4;
  const pc = bodyColors[1] ?? [80, 120, 200];
  g.fillStyle = rgbStr(pc);
  g.beginPath();
  g.arc(w / 2, h + pr - 22, pr, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = rgbStr(mix(pc, [255, 255, 255], 0.4));
  g.fillRect(0, h - 22 + (planet === 'earth' ? 0 : 1), w, 1);
  const cy = Math.floor(h * 0.42);
  let x = 20;
  // central truss
  g.fillStyle = '#7a8795';
  g.fillRect(12, cy, w - 24, 2);
  const put = (wd: number) => {
    const at = x;
    x += wd + 4;
    return at;
  };
  const lit = () => (rnd() > 0.3 ? '#ffd84d' : '#6b5a2a');
  for (let i = 0; i < Math.min(6, Math.ceil((counts.orbitalStation ?? 0) * 1.5)); i++) {
    const at = put(14);
    px(g, at, cy - 5, 14, 12, '#e4ebf2');
    px(g, at + 1, cy - 6, 12, 1, '#ffffff');
    for (let k = 2; k < 12; k += 3) px(g, at + k, cy, 1, 1, lit());
  }
  const rot = (counts.rotatingHab ?? 0) + (counts.stanfordTorus ?? 0) * 3;
  for (let i = 0; i < Math.min(3, Math.ceil(Math.log2(rot + 1))); i++) {
    const at = put(30);
    g.strokeStyle = '#c9d3dc';
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(at + 15, cy + 1, 14, 20, 0, 0, Math.PI * 2);
    g.stroke();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      px(g, at + 15 + Math.cos(a) * 14, cy + 1 + Math.sin(a) * 20, 1, 1, lit());
    }
    px(g, at + 14, cy - 18, 2, 38, '#9aa7b8');
  }
  const cyl = (counts.oneillCylinder ?? 0) + (counts.megaHabitat ?? 0) * 10;
  for (let i = 0; i < Math.min(2, Math.ceil(Math.log2(cyl + 1))); i++) {
    const at = put(60);
    px(g, at, cy - 12, 60, 26, '#8a96a3');
    for (let k = 0; k < 3; k++) px(g, at + 2, cy - 9 + k * 8, 56, 3, k === 1 ? '#3f9a55' : '#5fb3ff');
    px(g, at, cy - 13, 60, 1, '#c9d3dc');
  }
  // depots & shipyards
  for (let i = 0; i < Math.min(4, (counts.propellantDepot ?? 0) + (counts.warehouse ?? 0)); i++) {
    const at = put(12);
    px(g, at, cy - 8, 12, 7, '#e6d9c2');
    px(g, at, cy + 3, 12, 7, '#e6d9c2');
    px(g, at + 1, cy - 8, 10, 1, '#ffffff');
  }
  if ((counts.shipyard ?? 0) > 0) {
    const at = put(34);
    g.strokeStyle = '#ffb347';
    g.lineWidth = 1;
    g.strokeRect(at, cy - 14, 34, 30);
    px(g, at + 6, cy - 2, 20, 5, '#c9d3dc');
  }
  // solar wings
  const solar = counts.solarArray ?? 0;
  for (let i = 0; i < Math.min(8, Math.ceil(Math.log2(solar + 1) * 2)); i++) {
    const sx = 14 + ((i * 37) % (w - 40));
    for (let k = 0; k < 10; k++) {
      px(g, sx + k, cy - 22 - (i % 2) * 3, 1, 8, k % 2 ? '#2d5aa0' : '#3d7bd9');
      px(g, sx + k, cy + 16 + (i % 2) * 3, 1, 8, k % 2 ? '#2d5aa0' : '#3d7bd9');
    }
  }
  if (Object.keys(cons).length) {
    px(g, w - 30, cy - 20, 1, 40, '#ffb347');
    px(g, w - 40, cy - 20, 20, 1, '#ffb347');
  }
  void pop;
  return g.canvas as HTMLCanvasElement;
}
