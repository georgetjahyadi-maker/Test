// Procedural pixel-art planet sprites with lighting, dithering and rotation.
import { BODY } from '../sim/content/bodies';
import type { BodyDef } from '../sim/types';
import { makeCanvas, ctx2d, hex, type RGB, rampDither, fbm3, noise3, hashStr, mix, BAYER4 } from './pixel';

const TEX_W = 128;
const TEX_H = 64;

interface Texture {
  value: Float32Array; // 0..1 surface value -> ramp position
  extra: Float32Array; // clouds / ice mask
  ramp: RGB[];
  extraColor: RGB | null;
}

const texCache = new Map<string, Texture>();
const spriteCache = new Map<string, HTMLCanvasElement>();

function texture(b: BodyDef): Texture {
  const c = texCache.get(b.id);
  if (c) return c;
  const seed = hashStr(b.id);
  const colors = b.style === 'mars' || b.id === 'ceres' ? b.colors.slice(0, 4) : b.style === 'saturn' ? b.colors.slice(0, 4) : b.colors;
  const ramp = colors.map(hex);
  const value = new Float32Array(TEX_W * TEX_H);
  const extra = new Float32Array(TEX_W * TEX_H);
  let extraColor: RGB | null = null;
  for (let y = 0; y < TEX_H; y++) {
    const lat = (y / (TEX_H - 1) - 0.5) * Math.PI;
    for (let x = 0; x < TEX_W; x++) {
      const lon = (x / TEX_W) * Math.PI * 2;
      const px = Math.cos(lat) * Math.cos(lon), py = Math.sin(lat), pz = Math.cos(lat) * Math.sin(lon);
      let v = 0.4, e = 0;
      switch (b.style) {
        case 'earth': {
          const n = fbm3(px * 1.6, py * 1.6, pz * 1.6, seed, 5);
          const land = n > 0.52;
          v = land ? 0.62 + (n - 0.52) * 1.2 : 0.2 + n * 0.25;
          const cl = fbm3(px * 2.5 + 7, py * 3.5, pz * 2.5, seed + 3, 4);
          e = cl > 0.58 ? Math.min(1, (cl - 0.58) * 4) : 0;
          if (Math.abs(lat) > 1.2) e = 1;
          extraColor = [240, 246, 255];
          break;
        }
        case 'mars': {
          const n = fbm3(px * 2, py * 2, pz * 2, seed, 5);
          v = 0.25 + n * 0.6;
          if (Math.abs(lat) > 1.25) e = 1;
          extraColor = [244, 244, 244];
          break;
        }
        case 'venus': {
          const n = fbm3(px * 1.2, py * 6, pz * 1.2, seed, 4);
          v = 0.15 + n * 0.5 + Math.sin(lat * 7 + n * 3) * 0.08;
          break;
        }
        case 'gas':
        case 'saturn': {
          const turb = fbm3(px * 3, py * 3, pz * 3, seed, 3);
          const band = Math.sin(lat * (b.style === 'saturn' ? 14 : 18) + turb * 2.4);
          v = 0.35 + band * 0.22 + (turb - 0.5) * 0.3;
          if (b.id === 'jupiter') {
            const dx = lon - 4.2, dy = lat + 0.38;
            const d = Math.sqrt(dx * dx * 0.3 + dy * dy * 4);
            if (d < 0.18) v = 0.78;
          }
          break;
        }
        case 'ice': {
          const n = fbm3(px * 2, py * 4, pz * 2, seed, 3);
          v = 0.2 + n * 0.35 + Math.sin(lat * 6) * 0.05;
          break;
        }
        case 'io': {
          const n = fbm3(px * 3, py * 3, pz * 3, seed, 4);
          v = 0.15 + n * 0.5;
          const spot = noise3(px * 9, py * 9, pz * 9, seed + 9);
          if (spot > 0.8) v = 0.9;
          break;
        }
        case 'europa': {
          const n = fbm3(px * 2, py * 2, pz * 2, seed, 3);
          v = 0.1 + n * 0.25;
          const line = Math.abs(Math.sin((px * 7 + pz * 5) * 3 + fbm3(px * 4, py * 4, pz * 4, seed + 1) * 6));
          if (line < 0.08) v = 0.75;
          break;
        }
        case 'titan': {
          const n = fbm3(px * 1.5, py * 5, pz * 1.5, seed, 3);
          v = 0.25 + n * 0.3 + lat * 0.05;
          break;
        }
        case 'star': {
          const n = fbm3(px * 6, py * 6, pz * 6, seed, 3);
          v = 0.05 + n * 0.35;
          break;
        }
        default: {
          // cratered rock: moon, mercury, asteroids, metal worlds
          const n = fbm3(px * 2.2, py * 2.2, pz * 2.2, seed, 5);
          v = 0.25 + n * 0.5;
          const cr = noise3(px * 7, py * 7, pz * 7, seed + 5);
          if (cr > 0.78) v -= 0.25;
          else if (cr > 0.72) v += 0.12;
          if (b.style === 'moon') {
            const mare = fbm3(px * 1.3 + 3, py * 1.3, pz * 1.3, seed + 2, 3);
            if (mare > 0.58) v += 0.25;
          }
        }
      }
      value[y * TEX_W + x] = Math.max(0, Math.min(1, v));
      extra[y * TEX_W + x] = e;
    }
  }
  const t: Texture = { value, extra, ramp, extraColor };
  texCache.set(b.id, t);
  return t;
}

/**
 * Render a lit, rotating sphere. `rot` is rotation in turns; light comes from `lightAngle` (radians, screen space).
 */
export function planetSprite(bodyId: string, diameter: number, rot: number, lightAngle: number): HTMLCanvasElement {
  const d = Math.max(3, Math.round(diameter));
  const rs = Math.round((rot % 1) * 48) % 48;
  const ls = Math.round(((lightAngle / (Math.PI * 2)) % 1) * 32) % 32;
  const key = `${bodyId}:${d}:${rs}:${ls}`;
  const c = spriteCache.get(key);
  if (c) return c;
  const b = BODY[bodyId];
  const tex = texture(b);
  const cv = makeCanvas(d, d);
  const g = ctx2d(cv);
  const img = g.createImageData(d, d);
  const r = d / 2;
  const la = (ls / 32) * Math.PI * 2;
  const L = [Math.cos(la) * 0.9, Math.sin(la) * 0.9, 0.45];
  const ln = Math.hypot(L[0], L[1], L[2]);
  L[0] /= ln; L[1] /= ln; L[2] /= ln;
  const rotRad = (rs / 48) * Math.PI * 2;
  const star = b.style === 'star';
  for (let y = 0; y < d; y++) {
    for (let x = 0; x < d; x++) {
      const nx = (x + 0.5 - r) / r;
      const ny = (y + 0.5 - r) / r;
      const rr = nx * nx + ny * ny;
      if (rr > 1) continue;
      const nz = Math.sqrt(1 - rr);
      const lat = Math.asin(-ny);
      let lon = Math.atan2(nx, nz) + rotRad;
      lon = ((lon % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const tx = Math.floor((lon / (Math.PI * 2)) * TEX_W) % TEX_W;
      const ty = Math.max(0, Math.min(TEX_H - 1, Math.floor(((lat + Math.PI / 2) / Math.PI) * (TEX_H - 1))));
      const v = tex.value[ty * TEX_W + tx];
      let col: RGB;
      if (star) {
        const limb = 1 - Math.pow(1 - nz, 1.5);
        col = rampDither(tex.ramp, v + (1 - limb) * 0.55, x, y);
      } else {
        const lambert = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        const lit = Math.min(1, 0.08 + lambert * 1.05);
        const t = 0;
        if (b.style === 'earth') {
          if (v >= 0.6) {
            const land = mix(hex('#3f9a55'), hex('#c9b27a'), Math.min(1, (v - 0.6) * 2.5));
            col = rampDither([mix(land, [255, 255, 255], 0.15), land, mix(land, [10, 20, 16], 0.55), [8, 12, 12]], 1 - lit, x, y);
          } else {
            col = rampDither([hex('#6fb8ff'), hex('#2f7be0'), hex('#1b4f9a'), [6, 14, 34]], Math.max(0, Math.min(1, 1 - lit * 0.9 - v * 0.2)), x, y);
          }
        } else {
          // map surface value + darkness into the ramp (index 0 = lightest)
          col = rampDither(tex.ramp, Math.max(0, Math.min(1, 1 - (v * 0.5 + lit * 0.5))), x, y);
        }
        const e = tex.extra[ty * TEX_W + tx];
        if (e > 0 && tex.extraColor) {
          const th = BAYER4[y & 3][x & 3];
          if (e > th) col = mix(tex.extraColor, [20, 24, 32], 1 - Math.min(1, lit + 0.1));
        }
        if (lit < 0.12) col = mix(col, [4, 6, 10], 0.6);
        void t;
      }
      const k = (y * d + x) * 4;
      img.data[k] = col[0];
      img.data[k + 1] = col[1];
      img.data[k + 2] = col[2];
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  if (spriteCache.size > 900) spriteCache.clear();
  spriteCache.set(key, cv);
  return cv;
}

export function drawRings(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, front: boolean, color = '#d8c7a0') {
  // Saturn-style rings, drawn as a flattened ellipse split into back and front halves
  const rx = r * 2.1, ry = r * 0.55;
  g.save();
  g.beginPath();
  if (front) g.rect(cx - rx - 2, cy, rx * 2 + 4, ry + 2);
  else g.rect(cx - rx - 2, cy - ry - 2, rx * 2 + 4, ry + 2);
  g.clip();
  g.strokeStyle = color;
  g.lineWidth = Math.max(1, r * 0.25);
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(160,140,100,0.8)';
  g.lineWidth = 1;
  g.beginPath();
  g.ellipse(cx, cy, rx * 0.82, ry * 0.82, 0, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}
