// Public entry point of the simulation library.
import { createGame as createBase } from './systems/init';
import { monthlyTick, stepDay } from './step';
import type { GameState } from './types';
import { resetLogisticsRuntime } from './systems/logistics';

export function createGame(seed: string): GameState {
  resetLogisticsRuntime();
  const s = createBase(seed);
  // Process January 2048 immediately so every metric is populated.
  monthlyTick(s, 1);
  return s;
}

export function advanceDays(s: GameState, days: number, stopOnPause = false): number {
  let n = 0;
  for (let i = 0; i < days; i++) {
    if (s.gameOver) break;
    const before = s.events.pending.length;
    stepDay(s);
    n++;
    if (stopOnPause && s.events.pending.length > before) break;
  }
  return n;
}

export { stepDay, monthlyTick };
export { applyCommand } from './commands';
export type { Command } from './commands';
export { serialize, deserialize } from './save';
export * from './types';
