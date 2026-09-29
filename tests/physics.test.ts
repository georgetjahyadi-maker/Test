import { describe, it, expect } from 'vitest';
import { solveKepler, helioPosition, distanceAU, lightDelaySeconds } from '../src/sim/physics/orbits';
import { shortestPath } from '../src/sim/physics/deltav';
import { computeDesignStats } from '../src/sim/physics/engineering';
import { G0 } from '../src/sim/content/bodies';
import { COMPONENT, STRUCTURE } from '../src/sim/content/components';

describe('orbits', () => {
  it("solves Kepler's equation", () => {
    for (const e of [0, 0.1, 0.5, 0.9]) {
      for (const M of [0.1, 1, 2.5, 5]) {
        const E = solveKepler(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 9);
      }
    }
  });

  it('keeps Earth about one AU from the Sun', () => {
    for (const day of [0, 100, 200, 300]) {
      const p = helioPosition('earth', day);
      expect(Math.hypot(p.x, p.y)).toBeGreaterThan(0.98);
      expect(Math.hypot(p.x, p.y)).toBeLessThan(1.02);
    }
  });

  it('puts Mars between 0.37 and 2.7 AU from Earth with matching light delay', () => {
    for (let day = 0; day < 800; day += 50) {
      const d = distanceAU('earth', 'mars', day);
      expect(d).toBeGreaterThan(0.37);
      expect(d).toBeLessThan(2.7);
      expect(lightDelaySeconds('earth', 'mars', day)).toBeCloseTo((d * 1.495978707e11) / 299792458, -1);
    }
  });
});

describe('delta-v graph', () => {
  const opts = { aero: false, aerocaptureTech: false, lowThrust: false };
  it('finds plausible cislunar transfers', () => {
    const toLlo = shortestPath('leo', 'llo', opts)!;
    expect(toLlo).not.toBeNull();
    expect(toLlo.dv).toBeGreaterThan(3.5);
    expect(toLlo.dv).toBeLessThan(4.5);
  });

  it('costs more to reach Mars orbit than lunar orbit', () => {
    const moon = shortestPath('leo', 'llo', opts)!;
    const mars = shortestPath('leo', 'lmo', opts)!;
    expect(mars.dv).toBeGreaterThan(moon.dv);
  });

  it('keeps low-thrust ships off planetary surfaces', () => {
    expect(shortestPath('leo', 'luna_shackleton', { ...opts, lowThrust: true })).toBeNull();
  });
});

describe('rocket equation', () => {
  it('matches Tsiolkovsky for a simple stage', () => {
    const design = { structure: 'aluminium', components: { eng_methalox: 1, tank_small: 2, nav_basic: 1, comm_radio: 1, pwr_solar: 1 } };
    for (const id of Object.keys(design.components)) expect(COMPONENT[id], id).toBeDefined();
    expect(STRUCTURE[design.structure]).toBeDefined();
    const st = computeDesignStats(design, () => true);
    const ve = (COMPONENT.eng_methalox.isp! * G0) / 1000;
    expect(st.ve).toBeCloseTo(ve, 3);
    const wet = st.dryMass + st.propCapacity;
    expect(st.dvEmpty).toBeCloseTo(ve * Math.log(wet / st.dryMass), 3);
  });
});
