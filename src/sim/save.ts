// Serialization and versioned migration of saved campaigns.
import type { GameState } from './types';
import { SAVE_VERSION } from './systems/init';
import { invalidateModifiers } from './systems/modifiers';

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

type Migration = (raw: any) => any;

// Migration chain: MIGRATIONS[v] upgrades a save from version v to v+1.
const MIGRATIONS: Record<number, Migration> = {};

export function deserialize(json: string): GameState {
  let raw = JSON.parse(json);
  if (!raw || typeof raw !== 'object' || typeof raw.day !== 'number') throw new Error('Not a HELIOS save file.');
  let v = raw.version ?? 0;
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`Cannot migrate save from version ${v}.`);
    raw = m(raw);
    v++;
    raw.version = v;
  }
  if (v > SAVE_VERSION) throw new Error(`Save is from a newer version (${v}).`);
  invalidateModifiers();
  return raw as GameState;
}

export function registerMigration(from: number, fn: Migration): void {
  MIGRATIONS[from] = fn;
}
