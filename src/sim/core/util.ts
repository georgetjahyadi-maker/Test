import type { GameState, Stock } from '../types';

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
export const safeDiv = (a: number, b: number, fallback = 0) => (b === 0 || !Number.isFinite(b) ? fallback : a / b);

export function nextId(s: GameState, prefix: string): string {
  s.nextId += 1;
  return `${prefix}_${s.nextId.toString(36)}`;
}

export function addStock(target: Stock, add: Stock, mult = 1): void {
  for (const k in add) {
    const v = (target[k] ?? 0) + add[k] * mult;
    target[k] = v;
  }
}

export function stockTotal(st: Stock): number {
  let t = 0;
  for (const k in st) t += st[k];
  return t;
}

export function scaleStock(st: Stock, m: number): Stock {
  const o: Stock = {};
  for (const k in st) o[k] = st[k] * m;
  return o;
}

export function cleanStock(st: Stock, eps = 1e-6): void {
  for (const k in st) {
    if (!Number.isFinite(st[k]) || Math.abs(st[k]) < eps) delete st[k];
  }
}

export function dot(a: number[], b: number[]): number {
  let t = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) t += a[i] * b[i];
  return t;
}

export function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

export function cosine(a: number[], b: number[]): number {
  const na = norm(a), nb = norm(b);
  if (na < 1e-9 || nb < 1e-9) return 0;
  return dot(a, b) / (na * nb);
}

export function sortedKeys<T>(rec: Record<string, T>): string[] {
  return Object.keys(rec).sort();
}

export function sum(arr: number[]): number {
  let t = 0;
  for (const x of arr) t += x;
  return t;
}

export function smooth(prev: number, next: number, alpha: number): number {
  return prev + (next - prev) * alpha;
}
