import type { Breakdown, GameState } from '../types';

export class BD {
  parts: { label: string; value: number; ref?: string }[] = [];
  constructor(public unit: string, public note?: string) {}
  add(label: string, value: number, ref?: string): this {
    if (!Number.isFinite(value)) value = 0;
    this.parts.push({ label, value, ref });
    return this;
  }
  get total(): number {
    let t = 0;
    for (const p of this.parts) t += p.value;
    return t;
  }
  build(total?: number): Breakdown {
    return { total: total ?? this.total, unit: this.unit, parts: this.parts, note: this.note };
  }
}

export function setExplain(s: GameState, key: string, b: BD | Breakdown, total?: number): number {
  const bd = b instanceof BD ? b.build(total) : b;
  s.explain[key] = bd;
  return bd.total;
}
