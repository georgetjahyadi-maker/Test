import { describe, it, expect, beforeAll } from 'vitest';
import { createGame, advanceDays, type GameState } from '../src/sim/index';
import { popOf, offworldPopulation } from '../src/sim/systems/helpers';

let s: GameState;

beforeAll(() => {
  s = createGame('invariants');
  for (const k of Object.keys(s.une.delegation)) s.une.delegation[k] = true;
  advanceDays(s, 365 * 25);
});

describe('invariants after 25 simulated years', () => {
  it('keeps every stockpile finite and non-negative', () => {
    for (const st of Object.values(s.settlements)) {
      for (const [g, v] of Object.entries(st.stock)) {
        expect(Number.isFinite(v), `${st.name} ${g}`).toBe(true);
        expect(v, `${st.name} ${g}`).toBeGreaterThanOrEqual(-1e-6);
      }
    }
  });

  it('keeps populations non-negative and age bands finite', () => {
    for (const st of Object.values(s.settlements)) {
      for (const b of st.pop.bands) {
        expect(Number.isFinite(b)).toBe(true);
        expect(b).toBeGreaterThanOrEqual(0);
      }
      expect(popOf(st)).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps finances and politics numeric', () => {
    expect(Number.isFinite(s.une.treasury)).toBe(true);
    expect(Number.isFinite(s.une.debt)).toBe(true);
    for (const n of Object.values(s.nations)) expect(Number.isFinite(n.spaceFunds), n.id).toBe(true);
    for (const f of Object.values(s.factions)) {
      expect(f.support).toBeGreaterThanOrEqual(0);
      expect(f.support).toBeLessThanOrEqual(1);
    }
    for (const v of Object.values(s.une.metrics)) expect(Number.isFinite(v)).toBe(true);
  });

  it('keeps facility condition and utilization in range', () => {
    for (const st of Object.values(s.settlements)) {
      for (const f of st.facilities) {
        expect(f.condition).toBeGreaterThanOrEqual(0);
        expect(f.condition).toBeLessThanOrEqual(1);
        expect(f.utilization).toBeGreaterThanOrEqual(0);
        expect(f.utilization).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it('keeps fleets whole', () => {
    for (const f of Object.values(s.fleets)) {
      expect(Number.isInteger(f.count)).toBe(true);
      expect(f.count).toBeGreaterThan(0);
    }
  });

  it('grows a permanent presence beyond Earth', () => {
    expect(offworldPopulation(s)).toBeGreaterThan(1000);
    expect(s.milestones.une_lunar_base).toBeDefined();
  });
});
