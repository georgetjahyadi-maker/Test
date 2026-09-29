// Procedural spacecraft sprites generated from engineering designs (§50–51).
// Identical designs always produce identical sprites.
import { COMPONENT } from '../sim/content/components';
import type { VehicleDesign } from '../sim/types';
import { makeCanvas, ctx2d, hashStr, prng } from './pixel';

const HULL: Record<string, { body: string; light: string; dark: string }> = {
  aluminium: { body: '#b9c3cf', light: '#e4ebf2', dark: '#7a8795' },
  steel: { body: '#c9d3dc', light: '#f2f6fa', dark: '#8a96a3' },
  titanium: { body: '#8d96a3', light: '#b8c1cc', dark: '#5b6470' },
  composite: { body: '#3f454e', light: '#646c78', dark: '#23272d' },
  nanotube: { body: '#2a2d33', light: '#4c5360', dark: '#15171b' },
};

interface Part {
  kind: string;
  w: number;
  h: number;
  draw: (g: CanvasRenderingContext2D, x: number, y: number) => void;
}

const cache = new Map<string, HTMLCanvasElement>();

function px(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

export function shipSprite(d: Pick<VehicleDesign, 'components' | 'structure' | 'id'>): HTMLCanvasElement {
  const key = `${d.structure}|${JSON.stringify(Object.keys(d.components).sort().map((k) => [k, d.components[k]]))}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const hull = HULL[d.structure] ?? HULL.aluminium;
  const rnd = prng(hashStr(key));
  const count = (id: string) => Math.max(0, Math.floor(d.components[id] ?? 0));
  const byCat = (cat: string) => Object.keys(d.components).sort().filter((id) => COMPONENT[id]?.category === cat && count(id) > 0);

  // ---- Section lists (aft → fore)
  const engines = byCat('propulsion');
  const tanks = byCat('tank');
  const cargo = byCat('cargo');
  const habs = byCat('habitation').concat(byCat('shielding'));
  const power = byCat('power');
  const thermal = byCat('thermal');
  const weapons = byCat('weapon');
  const sensors = byCat('sensor');
  const comms = byCat('communication');
  const aero = count('aeroshell');
  const docking = count('dock_port') + count('dock_transfer');

  const parts: Part[] = [];
  const H = 13; // spine half-height budget
  // Engines
  const engCount = engines.reduce((a, id) => a + count(id), 0);
  if (engCount > 0) {
    const id = engines[0];
    const c = COMPONENT[id];
    const isElectric = (c.powerReq ?? 0) > 0 && (c.isp ?? 0) > 1500 && (c.isp ?? 0) < 1e6;
    const isFusion = id.startsWith('eng_fusion');
    const isNTR = id.includes('ntr') || id.includes('bimodal');
    const isSail = (c.isp ?? 0) >= 1e6;
    const shown = Math.min(engCount, 5);
    if (isSail) {
      parts.push({
        kind: 'sail', w: 4, h: 30,
        draw: (g, x, y) => {
          px(g, x, y - 14, 1, 28, '#9aa7b8');
          for (let i = 0; i < 26; i++) px(g, x - 3 - Math.floor(Math.sin(i / 8) * 2), y - 13 + i, 2, 1, i % 3 === 0 ? '#e8f4ff' : '#bcd4f0');
        },
      });
    } else {
      const bellW = isFusion ? 9 : isNTR ? 8 : isElectric ? 3 : 6;
      const bellH = isFusion ? 12 : isElectric ? 3 : 5;
      const span = Math.min(2 * H, shown * (bellH + 1));
      parts.push({
        kind: 'engines', w: bellW + 2, h: span + 2,
        draw: (g, x, y) => {
          for (let i = 0; i < shown; i++) {
            const yy = y - span / 2 + i * (span / shown) + (span / shown - bellH) / 2;
            if (isElectric) {
              px(g, x + 1, yy, bellW, bellH, '#4a5563');
              px(g, x, yy + 1, 1, bellH - 2, '#8fd3ff');
            } else if (isFusion) {
              px(g, x + 2, yy, bellW - 2, bellH, '#39414c');
              px(g, x, yy + 2, 3, bellH - 4, '#ff7ac8');
              px(g, x - 2, yy + 4, 2, bellH - 8, '#ffd6f2');
              px(g, x + 4, yy - 1, 2, bellH + 2, '#b98cff');
            } else {
              for (let k = 0; k < bellW; k++) {
                const hh = Math.max(1, Math.round(bellH * (0.45 + (0.55 * (bellW - k)) / bellW)));
                px(g, x + k, yy + (bellH - hh) / 2, 1, hh, k === 0 ? '#2a2f36' : isNTR ? '#6b5d52' : '#4d5561');
              }
              if (isNTR) px(g, x + bellW, yy + bellH / 2 - 1, 2, 2, '#7cf0c8');
            }
          }
        },
      });
    }
  }
  // Reactors with shadow shields and radiators
  const reactors = power.filter((id) => !COMPONENT[id].solar && (COMPONENT[id].powerGen ?? 0) >= 1);
  const radCount = thermal.reduce((a, id) => a + count(id), 0);
  if (reactors.length || radCount) {
    const rc = reactors.reduce((a, id) => a + count(id), 0);
    const len = 6 + Math.min(4, rc) * 3;
    const fins = Math.min(6, Math.ceil(radCount / 2));
    parts.push({
      kind: 'reactor', w: len, h: 10 + fins * 4,
      draw: (g, x, y) => {
        for (let f = 0; f < fins; f++) {
          const fx = x + 1 + (f * (len - 2)) / Math.max(1, fins);
          px(g, fx, y - 6 - fins * 2, 2, fins * 2 + 1, '#d9dee6');
          px(g, fx, y + 5, 2, fins * 2 + 1, '#d9dee6');
          px(g, fx + 1, y - 6 - fins * 2, 1, fins * 2 + 1, '#aab3bf');
          px(g, fx + 1, y + 5, 1, fins * 2 + 1, '#aab3bf');
        }
        if (rc > 0) {
          px(g, x, y - 3, len - 3, 6, '#6c7480');
          px(g, x + 1, y - 2, len - 5, 1, '#9aa3ad');
          px(g, x + len - 3, y - 4, 2, 8, '#3b4048');
          px(g, x + 2, y - 1, 2, 2, '#7cf0c8');
        } else {
          px(g, x, y - 1, len, 2, hull.dark);
        }
      },
    });
  }
  // Tanks
  const tankUnits: { big: boolean; color: string; len: number; r: number }[] = [];
  for (const id of tanks) {
    const c = COMPONENT[id];
    const n = count(id);
    const cap = c.tankCapacity ?? 50;
    const color = c.tankType === 'hydrogen' ? '#f2f5f8' : c.tankType === 'argon' ? '#9fb7c9' : '#e6d9c2';
    for (let i = 0; i < Math.min(n, 6); i++) tankUnits.push({ big: cap >= 400, color, len: cap >= 1500 ? 22 : cap >= 400 ? 14 : 7, r: cap >= 1500 ? 7 : cap >= 400 ? 6 : c.tankType === 'hydrogen' ? 5 : 4 });
  }
  if (tankUnits.length) {
    const rows = tankUnits.length > 3 ? 2 : 1;
    const perRow = Math.ceil(tankUnits.length / rows);
    const rowLen = Math.max(...Array.from({ length: rows }, (_, r) => tankUnits.slice(r * perRow, (r + 1) * perRow).reduce((a, t) => a + t.len + 1, 0)));
    const maxR = Math.max(...tankUnits.map((t) => t.r));
    parts.push({
      kind: 'tanks', w: rowLen + 1, h: rows * maxR * 2 + 2,
      draw: (g, x, y) => {
        for (let r = 0; r < rows; r++) {
          let xx = x;
          const row = tankUnits.slice(r * perRow, (r + 1) * perRow);
          const cy = rows === 1 ? y : y + (r === 0 ? -maxR : maxR);
          for (const t of row) {
            const top = cy - t.r;
            px(g, xx, top + 1, t.len, t.r * 2 - 2, t.color);
            px(g, xx + 1, top, t.len - 2, t.r * 2, t.color);
            px(g, xx + 1, top + 1, t.len - 2, 1, '#ffffff');
            px(g, xx + 1, top + t.r * 2 - 2, t.len - 2, 1, '#9b9486');
            for (let b = 3; b < t.len - 1; b += 5) px(g, xx + b, top, 1, t.r * 2, '#b3a893');
            xx += t.len + 1;
          }
        }
        px(g, x, y, rowLen, 1, hull.dark);
      },
    });
  }
  // Cargo
  const cargoUnits = cargo.reduce((a, id) => a + Math.min(4, count(id)) * ((COMPONENT[id].cargo ?? 40) >= 4000 ? 3 : (COMPONENT[id].cargo ?? 40) >= 400 ? 2 : 1), 0);
  if (cargoUnits > 0) {
    const cols = Math.min(8, Math.ceil(cargoUnits / 2));
    const rowsC = Math.min(3, Math.ceil(cargoUnits / cols));
    const colors = ['#ff9f43', '#4da3ff', '#c9d3dc', '#5fd38a', '#ffd84d'];
    parts.push({
      kind: 'cargo', w: cols * 5 + 2, h: rowsC * 5 + 2,
      draw: (g, x, y) => {
        px(g, x, y - (rowsC * 5) / 2 - 1, cols * 5 + 1, rowsC * 5 + 2, hull.dark);
        for (let i = 0; i < cols; i++) for (let j = 0; j < rowsC; j++) {
          const c = colors[Math.floor(rnd() * colors.length)];
          px(g, x + 1 + i * 5, y - (rowsC * 5) / 2 + j * 5, 4, 4, c);
          px(g, x + 1 + i * 5, y - (rowsC * 5) / 2 + j * 5, 4, 1, '#ffffff33');
        }
      },
    });
  }
  // Solar wings attach midship
  const solar = power.filter((id) => COMPONENT[id].solar).reduce((a, id) => a + count(id) * ((COMPONENT[id].powerGen ?? 0) >= 5 ? 2 : 1), 0);
  // Habitation
  for (const id of habs) {
    const c = COMPONENT[id];
    const n = Math.min(3, count(id));
    for (let i = 0; i < n; i++) {
      if (c.spinGravity) {
        parts.push({
          kind: 'spin', w: 10, h: 26,
          draw: (g, x, y) => {
            g.strokeStyle = hull.light;
            g.lineWidth = 1;
            for (let k = 0; k < 40; k++) {
              const a = (k / 40) * Math.PI * 2;
              px(g, x + 5 + Math.cos(a) * 4, y + Math.sin(a) * 12, 1, 1, k % 5 === 0 ? '#ffd84d' : hull.light);
            }
            px(g, x + 4, y - 1, 3, 2, hull.body);
          },
        });
      } else if (id === 'shield_water') {
        parts.push({ kind: 'shield', w: 4, h: 10, draw: (g, x, y) => { px(g, x, y - 5, 4, 10, '#3d7bd9'); px(g, x + 1, y - 4, 1, 8, '#7fb6ff'); } });
      } else {
        const big = (c.crew ?? 0) >= 80;
        const len = big ? 16 : (c.crew ?? 0) >= 12 ? 10 : 7;
        const r = big ? 6 : 4;
        parts.push({
          kind: 'hab', w: len, h: r * 2,
          draw: (g, x, y) => {
            px(g, x, y - r + 1, len, r * 2 - 2, hull.light);
            px(g, x + 1, y - r, len - 2, r * 2, hull.light);
            px(g, x + 1, y + r - 2, len - 2, 1, hull.dark);
            for (let w = 2; w < len - 1; w += 3) px(g, x + w, y - 1, 1, 1, '#ffd84d');
            if (big) for (let w = 2; w < len - 1; w += 3) px(g, x + w, y + 2, 1, 1, '#ffd84d');
          },
        });
      }
    }
  }
  // Nose: aeroshell / docking
  parts.push({
    kind: 'nose', w: 5 + (aero ? 3 : 0), h: 10,
    draw: (g, x, y) => {
      px(g, x, y - 2, 3, 4, hull.body);
      px(g, x + 3, y - 1, 2, 2, hull.light);
      if (docking) px(g, x + 4, y - 2, 1, 4, '#9aa7b8');
      if (aero) {
        for (let k = 0; k < 9; k++) px(g, x + 5 + Math.abs(4 - k) * 0.4, y - 4 + k, 2, 1, '#6b4a2f');
      }
    },
  });

  // ---- Layout
  const margin = 4;
  let totalW = margin * 2;
  let maxH = 20;
  for (const p of parts) {
    totalW += p.w + 1;
    maxH = Math.max(maxH, p.h);
  }
  const extraH = solar > 0 ? 16 + Math.min(4, solar) * 3 : 0;
  const hgt = Math.max(maxH + 8, 24) + extraH;
  const cv = makeCanvas(totalW, hgt);
  const g = ctx2d(cv);
  const cy = Math.floor(hgt / 2);
  // spine / truss
  px(g, margin, cy - 1, totalW - margin * 2, 2, hull.dark);
  for (let x = margin; x < totalW - margin; x += 3) px(g, x, cy - 1, 1, 2, hull.body);
  let x = margin;
  const partX: number[] = [];
  for (const p of parts) {
    partX.push(x);
    x += p.w + 1;
  }
  // solar wings before parts so they sit behind
  if (solar > 0) {
    const idx = Math.max(0, parts.findIndex((p) => p.kind === 'tanks' || p.kind === 'cargo'));
    const wx = partX[idx] + Math.floor((parts[idx]?.w ?? 8) / 2);
    const wl = 6 + Math.min(4, solar) * 3;
    const ww = Math.min(4, solar) + 3;
    px(g, wx, cy - wl - 4, 1, wl * 2 + 8, '#7d8b99');
    for (const dir of [-1, 1]) {
      for (let i = 0; i < wl; i++) for (let j = 0; j < ww; j++) {
        px(g, wx - Math.floor(ww / 2) + j, dir < 0 ? cy - 5 - i : cy + 4 + i, 1, 1, (i + j) % 3 === 0 ? '#2d5aa0' : '#3d7bd9');
      }
    }
  }
  parts.forEach((p, i) => p.draw(g, partX[i], cy));
  // antennas and sensors on top
  const top = comms.concat(sensors);
  let ax = totalW - margin - 14;
  for (const id of top.slice(0, 3)) {
    const dish = id === 'comm_dish';
    px(g, ax, cy - 6, 1, 5, '#9aa7b8');
    if (dish) {
      px(g, ax - 2, cy - 8, 5, 1, '#e6edf3');
      px(g, ax - 1, cy - 9, 3, 1, '#e6edf3');
    } else px(g, ax - 1, cy - 8, 2, 2, id.startsWith('sensor') ? '#ff5c5c' : '#7cf0c8');
    ax -= 5;
  }
  // weapons
  let wx2 = Math.floor(totalW / 2);
  for (const id of weapons.slice(0, 3)) {
    const n = Math.min(3, count(id));
    for (let i = 0; i < n; i++) {
      px(g, wx2, cy + 5, 3, 2, '#5b6470');
      px(g, wx2 + 3, cy + 5, id === 'wpn_laser' ? 5 : 3, 1, id === 'wpn_laser' ? '#ff5c5c' : '#c9d3dc');
      wx2 += 7;
    }
  }
  if (cache.size > 300) cache.clear();
  cache.set(key, cv);
  return cv;
}
