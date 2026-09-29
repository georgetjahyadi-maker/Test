// Deterministic seeded random streams (sfc32). Each named stream keeps its own
// state so adding random calls in one system does not shift another system.
import type { GameState } from '../types';

export type RngTuple = [number, number, number, number];

export function hashSeed(str: string): RngTuple {
  // cyrb128
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export function sfc32(t: RngTuple): number {
  let [a, b, c, d] = t;
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
  let r = (a + b) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  d = (d + 1) | 0;
  r = (r + d) | 0;
  c = (c + r) | 0;
  t[0] = a >>> 0; t[1] = b >>> 0; t[2] = c >>> 0; t[3] = d >>> 0;
  return (r >>> 0) / 4294967296;
}

function stream(s: GameState, name: string): RngTuple {
  let t = s.rng[name];
  if (!t) {
    t = hashSeed(s.seed + '::' + name);
    for (let i = 0; i < 12; i++) sfc32(t);
    s.rng[name] = t;
  }
  return t;
}

export function rand(s: GameState, name: string): number {
  return sfc32(stream(s, name));
}

export function randRange(s: GameState, name: string, lo: number, hi: number): number {
  return lo + (hi - lo) * rand(s, name);
}

export function randInt(s: GameState, name: string, lo: number, hiInclusive: number): number {
  return Math.floor(lo + (hiInclusive - lo + 1) * rand(s, name));
}

export function chance(s: GameState, name: string, p: number): boolean {
  if (p <= 0) return false;
  if (p >= 1) return true;
  return rand(s, name) < p;
}

export function pick<T>(s: GameState, name: string, arr: readonly T[]): T {
  return arr[Math.floor(rand(s, name) * arr.length) % arr.length];
}

export function weightedPick<T>(s: GameState, name: string, items: readonly T[], weight: (t: T) => number): T | undefined {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return undefined;
  let r = rand(s, name) * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

export function gaussian(s: GameState, name: string): number {
  const u = Math.max(1e-12, rand(s, name));
  const v = rand(s, name);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Stateless deterministic hash noise for procedural graphics. */
export function hashNoise(seed: number, x: number, y = 0): number {
  let h = (seed * 374761393 + x * 668265263 + y * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
