// Simplified Keplerian orbital positions (2D ecliptic projection).
import { BODY, BODIES, AU_KM, C_KM_S } from '../content/bodies';
import type { BodyDef } from '../types';

const J2000_OFFSET = 17531.5; // days from J2000.0 to 2048-01-01 00:00
const DEG = Math.PI / 180;

export function solveKepler(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 12; k++) {
    const f = E - e * Math.sin(E) - M;
    const d = 1 - e * Math.cos(E);
    const dE = f / d;
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/** Position of a body relative to its parent. Units: AU for heliocentric, km for moons. */
export function relativePosition(b: BodyDef, day: number): { x: number; y: number; r: number; angle: number } {
  if (!b.parent) return { x: 0, y: 0, r: 0, angle: 0 };
  const t = J2000_OFFSET + day;
  const L = (b.L0 + (360 * t) / b.period) * DEG;
  const varpi = b.w * DEG;
  let M = (L - varpi) % (2 * Math.PI);
  if (M < 0) M += 2 * Math.PI;
  const E = solveKepler(M, b.e);
  const nu = 2 * Math.atan2(Math.sqrt(1 + b.e) * Math.sin(E / 2), Math.sqrt(1 - b.e) * Math.cos(E / 2));
  const r = b.a * (1 - b.e * Math.cos(E));
  const retro = b.i > 90 ? -1 : 1;
  const angle = retro * nu + varpi;
  return { x: r * Math.cos(angle), y: r * Math.sin(angle), r, angle };
}

/** Heliocentric position in AU (moons include their offset from the parent). */
export function helioPosition(bodyId: string, day: number): { x: number; y: number } {
  const b = BODY[bodyId];
  if (!b || !b.parent) return { x: 0, y: 0 };
  const rel = relativePosition(b, day);
  if (b.parent === 'sun') return { x: rel.x, y: rel.y };
  const p = helioPosition(b.parent, day);
  return { x: p.x + rel.x / AU_KM, y: p.y + rel.y / AU_KM };
}

export function distanceAU(a: string, b: string, day: number): number {
  const pa = helioPosition(a, day);
  const pb = helioPosition(b, day);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

/** One-way light delay in seconds between two bodies. */
export function lightDelaySeconds(a: string, b: string, day: number): number {
  if (a === b) return 0;
  const A = BODY[a], B = BODY[b];
  // Earth-Moon special case
  if ((A?.parent === b || B?.parent === a) && (A?.type === 'moon' || B?.type === 'moon')) {
    const moon = A.type === 'moon' ? A : B;
    return moon.a / C_KM_S;
  }
  return (distanceAU(a, b, day) * AU_KM) / C_KM_S;
}

export function systemRoot(bodyId: string): string {
  const b = BODY[bodyId];
  if (!b) return bodyId;
  if (b.type === 'moon' && b.parent) return b.parent;
  return bodyId;
}

export const HELIO_BODIES = BODIES.filter((b) => b.parent === 'sun');
export const MOONS_OF: Record<string, BodyDef[]> = {};
for (const b of BODIES) {
  if (b.type === 'moon' && b.parent) (MOONS_OF[b.parent] ??= []).push(b);
}
