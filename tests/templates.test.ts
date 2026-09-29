import { describe, it, expect } from 'vitest';
import { DESIGN_TEMPLATES } from '../src/sim/content/templates';
import { computeDesignStats, planRoute } from '../src/sim/physics/engineering';

// Every published design must be flightworthy once its technologies are known.
describe('design templates', () => {
  const allKnown = () => true;
  for (const t of DESIGN_TEMPLATES) {
    it(`${t.name} is flightworthy`, () => {
      const st = computeDesignStats({ structure: t.structure, components: t.components }, allKnown);
      expect(st.errors, st.errors.join('; ')).toEqual([]);
      expect(st.dryMass).toBeGreaterThan(0);
    });
  }

  it('each non-combat template can fly some cislunar or interplanetary route', () => {
    const legs: [string, string][] = [['leo', 'eml1'], ['leo', 'llo'], ['llo', 'luna_shackleton'], ['leo', 'lmo'], ['lmo', 'mars_arcadia'], ['leo', 'ceres_orbit']];
    for (const t of DESIGN_TEMPLATES) {
      const st = computeDesignStats({ structure: t.structure, components: t.components }, allKnown);
      if (st.combat > 0) continue;
      const ok = legs.some(([a, b]) => planRoute(st, a, b, { aerocaptureTech: true, refuelAt: () => true, beamNetworkW: 1e15, reliabilityBonus: 0 }).feasible);
      expect(ok, t.name).toBe(true);
    }
  });
});
