import { describe, it, expect } from 'vitest';
import { createGame, advanceDays, serialize, deserialize, type GameState } from '../src/sim/index';

/** A campaign in which the Secretariat runs every domain, so the AI is exercised too. */
function autoGame(seed: string): GameState {
  const s = createGame(seed);
  for (const k of Object.keys(s.une.delegation)) s.une.delegation[k] = true;
  return s;
}

// The simulation is a pure function of seed and commands: same inputs, same history.
describe('determinism', () => {
  it('gives the same history for the same seed', () => {
    const a = autoGame('determinism');
    advanceDays(a, 365 * 10);
    const b = autoGame('determinism');
    advanceDays(b, 365 * 10);
    expect(serialize(b)).toBe(serialize(a));
  });

  it('gives different histories for different seeds', () => {
    const a = autoGame('seed-one');
    const b = autoGame('seed-two');
    advanceDays(a, 365);
    advanceDays(b, 365);
    expect(serialize(a)).not.toBe(serialize(b));
  });

  it('continues identically after a save and load', () => {
    const a = autoGame('roundtrip');
    advanceDays(a, 365 * 3);
    const saved = serialize(a);
    advanceDays(a, 365 * 2);
    const b = deserialize(saved);
    advanceDays(b, 365 * 2);
    expect(serialize(b)).toBe(serialize(a));
  });
});
