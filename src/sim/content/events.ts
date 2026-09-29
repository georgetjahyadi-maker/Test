// Authored and systemic events. Each event is data plus small effect functions.
import type { GameState, Settlement } from '../types';
import type { EventDef } from '../systems/events';
import { settlementList, popOf, addHistory, addAlert, debit, credit, regionOf, facilityCount, STATUS_ORDER, STATUS_LABEL, earthPopulation, offworldPopulation, known } from '../systems/helpers';
import { proposeBill } from '../systems/legislature';
import { changeStatus, declareEmergency, endEmergency } from '../systems/politics';
import { queueConstruction, addFacility } from '../systems/factory';
import { addTempMod } from '../systems/modifiers';
import { dissolveCorporation } from '../systems/corporations';
import { launchDeflection, deflectionOptions } from '../systems/security';
import { rand, pick, chance } from '../core/rng';
import { fmtMoney, fmtPct, fmtInt } from '../core/format';
import { clamp } from '../core/util';
import { dayFromCivil, formatDate } from '../core/time';
import { SITE } from './sites';
import { LAW } from './laws';
import { FACILITY } from './facilities';

const bill = (s: GameState, law: string) => {
  const r = proposeBill(s, law, 'enact', 'event');
  if (!r.ok) addAlert(s, 'warn', `Could not introduce ${LAW[law]?.name ?? law}: ${r.error}`);
};

const find = (s: GameState, pred: (st: Settlement) => boolean): Settlement | undefined => settlementList(s).find(pred);

const flag = (s: GameState, k: string) => s.events.flags[k];

const legit = (s: GameState, d: number) => {
  s.une.metrics.legitimacy = clamp((s.une.metrics.legitimacy ?? 0.6) + d, 0, 1);
  if (d > 0) s.events.flags.recentSuccess = ((s.events.flags.recentSuccess as number) ?? 0) + d * 5;
  else s.events.flags.recentFailure = ((s.events.flags.recentFailure as number) ?? 0) - d * 5;
};

const nationSupport = (s: GameState, id: string, d: number) => {
  const n = s.nations[id];
  if (n) n.uneSupport = clamp(n.uneSupport + d, 0, 1);
};

const factionBoost = (s: GameState, f: string, mult: number) => {
  for (const id in s.nations) if (s.nations[id].factionSupport[f] !== undefined) s.nations[id].factionSupport[f] *= mult;
  for (const st of settlementList(s)) if (st.politics.factionSupport[f] !== undefined) st.politics.factionSupport[f] *= mult;
};

export const EVENTS: EventDef[] = [
  // ------------------------------------------------------------ Opening arc
  {
    id: 'intro_orbital_safety', category: 'tutorial', once: true, deadlineDays: 120, pause: true,
    trigger: (s) => (s.day >= 25 ? {} : null),
    title: () => 'Crowded Skies',
    text: (s) => `The Orbital Safety Authority reports that more than a million tracked objects now circle Earth. Near-misses at the Gateway LEO complex have tripled in a decade, and debris risk stands at ${fmtPct(s.earth.debrisRisk)}.\n\nThe Authority asks the Secretariat to introduce binding Orbital Safety Standards: mandatory deorbit, collision avoidance and debris bonds. Launch providers warn about the costs.\n\nThis is the first test of the Compact's power over Earth orbit, one of its exclusive competencies.`,
    options: () => [
      { id: 'bill', label: 'Introduce the Orbital Safety Standards bill', desc: 'Puts the bill before both chambers at no political-capital cost.', effect: (s) => bill(s, 'orbital_safety'), ai: 2 },
      { id: 'voluntary', label: 'Negotiate a voluntary industry code', desc: 'Corporations are pleased. The underlying risk is barely addressed.', effect: (s) => { for (const c of Object.values(s.corporations)) c.reputation = clamp(c.reputation + 0.02, 0, 1); s.earth.orbitalObjects += 0.05; } },
    ],
  },
  {
    id: 'lunar_ice_dispute', category: 'tutorial', once: true, deadlineDays: 150, pause: true,
    trigger: (s) => (s.day >= dayFromCivil(2048, 4, 1) ? {} : null),
    title: () => 'The Shackleton Ice Claim',
    text: () => `The Selenic Mining Consortium announces that its prospecting rovers have confirmed commercially extractable water ice in the permanently shadowed craters beneath Shackleton Rim. Lunar ice means water, oxygen and rocket propellant, which is everything that makes the Moon cheap to live on.\n\nWithin hours the United States and China both assert preferential access for their stations. The Solar Development Authority argues that strategic lunar volatiles should be managed as common infrastructure. Developing states want royalties shared with all of humanity. Investors want property rights.\n\nThe Compact gives the UNE exclusive authority over extraterrestrial claims. How will it use it?`,
    options: () => [
      { id: 'heritage', label: 'Declare lunar ice a common heritage resource', desc: 'Introduces the Common Heritage Resource Regime: high royalties and managed access. Developing states and Federalists approve. Corporations invest less.', effect: (s) => { bill(s, 'common_heritage'); nationSupport(s, 'afu', 0.05); nationSupport(s, 'lac', 0.05); const c = s.corporations.selenic; if (c) c.reputation -= 0.05; }, ai: 1.2 },
      { id: 'license', label: 'Grant Selenic a licensed concession with royalties', desc: 'Selenic builds the first ice mine at Shackleton. A Space Resource Royalty bill is introduced.', effect: (s) => { const sh = find(s, (st) => st.siteId === 'luna_shackleton'); if (sh) { queueConstruction(s, sh, 'iceMine', 'selenic', 1); debit(s, 'selenic', FACILITY.iceMine.buildCost, 'Construction'); sh.sponsors.selenic = (sh.sponsors.selenic ?? 0) + 0.05; } bill(s, 'resource_royalties'); }, ai: 1.6 },
      { id: 'property', label: 'Recognize extraction property rights', desc: 'Introduces the Extraction Property Rights Act. Investment surges, and so does resentment from states that cannot yet reach the Moon.', effect: (s) => { bill(s, 'property_rights'); nationSupport(s, 'afu', -0.06); nationSupport(s, 'lac', -0.05); nationSupport(s, 'usa', 0.04); } },
      { id: 'national', label: 'Divide access between national programs', desc: 'The US and Chinese stations each receive ice concessions. The major powers are satisfied, but federal authority looks weak.', effect: (s) => { const sh = find(s, (st) => st.siteId === 'luna_shackleton'); const gh = find(s, (st) => st.siteId === 'luna_malapert'); if (sh) queueConstruction(s, sh, 'iceMine', 'usa', 1); if (gh) queueConstruction(s, gh, 'iceMine', 'chn', 1); nationSupport(s, 'usa', 0.06); nationSupport(s, 'chn', 0.06); legit(s, -0.03); factionBoost(s, 'sovereigntists', 1.08); } },
    ],
  },
  {
    id: 'une_lunar_base_proposal', category: 'tutorial', once: true, deadlineDays: 180,
    trigger: (s) => (s.day >= dayFromCivil(2048, 7, 1) && !settlementList(s).some((st) => st.founder === 'une' && SITE[st.siteId].kind === 'surface') ? {} : null),
    title: () => 'A Base of Our Own',
    text: () => `Every station on the Moon belongs to one member state or another. The Solar Development Authority proposes that the UNE found its own research base, a common home for scientists from every member state.\n\nCandidate sites: the ice-rich Malapert Massif, the lava tubes of Mare Tranquillitatis, or the radio-quiet far side at Daedalus Crater. A base needs habitats, life support, power and a landing pad, and a supply line to keep it alive.`,
    options: () => [
      { id: 'tranq', label: 'Found Tranquility Base in Mare Tranquillitatis', desc: 'The SDA founds a UNE outpost at the lava tubes. You pay the founding package.', effect: (s) => { const r = foundSettlement(s, 'luna_tranquillitatis', 'une', 'Tranquility Base'); if (!r.ok) addAlert(s, 'warn', r.error ?? 'Founding failed'); }, ai: 1.5 },
      { id: 'daedalus', label: 'Found Daedalus Observatory on the far side', desc: 'A science-focused base in the quietest place in the inner Solar System.', effect: (s) => { const r = foundSettlement(s, 'luna_daedalus', 'une', 'Daedalus Observatory'); if (!r.ok) addAlert(s, 'warn', r.error ?? 'Founding failed'); } },
      { id: 'later', label: 'Not yet', desc: 'The SDA will plan for later. You can found a settlement at any time from the Colonies screen.', effect: () => {} },
    ],
  },
  {
    id: 'oxygen_emergency', category: 'crisis', cooldownDays: 400, deadlineDays: 20, pause: true,
    trigger: (s) => {
      const st = find(s, (x) => popOf(x) >= 4 && (x.lifeSupport.reserveDays.oxygen ?? 999) < 25 && !x.flags.earthHub);
      return st ? { st: st.id, days: st.lifeSupport.reserveDays.oxygen } : null;
    },
    title: (s, c) => `Oxygen Emergency at ${s.settlements[c.st]?.name}`,
    text: (s, c) => {
      const st = s.settlements[c.st];
      return `${st.name} reports only ${Math.max(0, c.days).toFixed(0)} days of breathable oxygen left. The oxygen recovery plant is running at ${fmtPct(st.lifeSupport.oxygenRecovery)} and the next scheduled resupply is not enough.\n\nThe station commander asks for instructions. Any delay could cost lives.`;
    },
    options: (s, c) => [
      { id: 'airlift', label: 'Charter an emergency resupply flight', desc: 'Buys 120 days of oxygen and water at five times normal freight cost. The UNE pays.', effect: (s2, c2) => { const st = s2.settlements[c2.st]; if (!st) return; const p = popOf(st); const o2 = p * 0.31 * (1 - st.lifeSupport.oxygenRecovery) * 0.33 + 1; const w = p * 7.3 * 0.07 * 0.33 + 1; st.stock.oxygen = (st.stock.oxygen ?? 0) + o2; st.stock.water = (st.stock.water ?? 0) + w; debit(s2, 'une', (o2 + w) * s2.earth.launchPrice * 5 + 5e7, 'Emergency operations'); legit(s2, 0.01); }, ai: 3 },
      { id: 'ration', label: 'Ration and scrub', desc: 'Crews cut activity and run CO₂ scrubbers at maximum. Health and morale suffer.', effect: (s2, c2) => { const st = s2.settlements[c2.st]; if (!st) return; st.pop.health *= 0.85; st.pop.psych *= 0.8; st.stock.oxygen = (st.stock.oxygen ?? 0) + popOf(st) * 0.01; } },
      { id: 'evacuate', label: 'Evacuate non-essential staff', desc: 'About 40% of residents return to Earth. The settlement survives but shrinks.', effect: (s2, c2) => { const st = s2.settlements[c2.st]; if (!st) return; for (let i = 0; i < st.pop.bands.length; i++) st.pop.bands[i] *= 0.6; legit(s2, -0.01); } },
    ],
  },
  {
    id: 'budget_crisis', category: 'crisis', cooldownDays: 540, deadlineDays: 45, pause: true,
    trigger: (s) => (s.une.treasury < 0 ? {} : null),
    title: () => 'Budget Crisis',
    text: (s) => `The UNE treasury is overdrawn by ${fmtMoney(-s.une.treasury)}. Agencies are delaying contracts and the Development Bank warns that UNE credit is at risk. Member states debate whether the Union is spending beyond its mandate or whether its mandate has outgrown its means.`,
    options: (s) => [
      { id: 'assess', label: 'Ask states for higher assessments', desc: 'Introduces the Assessment Adjustment Act (+0.02% of GDP).', effect: (s2) => bill(s2, 'assessment_increase'), available: (s2) => (s2.laws.assessment_increase ? 'Already in force' : null), ai: 1 },
      { id: 'bonds', label: 'Seek federal borrowing authority', desc: 'Introduces the Federal Borrowing Authority Act.', effect: (s2) => bill(s2, 'bond_authority'), available: (s2) => (s2.laws.bond_authority ? 'Already in force' : null), ai: 1.5 },
      { id: 'austerity', label: 'Impose austerity', desc: 'All agency budgets are cut by 15%. Effectiveness and legitimacy fall.', effect: (s2) => { for (const k in s2.une.funding) s2.une.funding[k] *= 0.85; legit(s2, -0.02); }, ai: 0.8 },
    ],
  },
  {
    id: 'launch_tragedy', category: 'crisis', cooldownDays: 200, deadlineDays: 45,
    trigger: (s) => {
      const a = s.events.flags.lastAccident as any;
      return a && a.crew > 0 && s.day - a.day < 35 ? { ...a } : null;
    },
    title: (s, c) => `Tragedy: ${c.design} Lost`,
    text: (s, c) => `A ${c.design} broke up in flight with ${c.crew} people aboard. Families gather outside the operator's headquarters, and the Assembly demands answers about safety standards in an industry growing faster than its regulators.`,
    options: () => [
      { id: 'inquiry', label: 'Order an independent inquiry', desc: 'Investigators recommend better standards. Ship reliability improves permanently, and trust rises.', effect: (s) => { addTempMod(s, 'reliability', 0.002, 365 * 50); legit(s, 0.01); }, ai: 2 },
      { id: 'continue', label: 'Keep flying', desc: 'Operations continue unchanged. Critics accuse the UNE of putting schedules before lives.', effect: (s) => legit(s, -0.02) },
    ],
  },
  {
    id: 'mars_ambition', category: 'politics', once: true, deadlineDays: 200,
    trigger: (s) => (known(s, 'nuclear_thermal_propulsion') ? {} : null),
    title: () => 'Red Horizon',
    text: () => 'Nuclear-thermal engines have been proven in cislunar tests. For the first time, sending humans to Mars and back on a sustainable schedule looks practical. The Expansionist caucus calls on the Secretary-General to commit the Union to a Mars Settlement Program.',
    options: () => [
      { id: 'program', label: 'Introduce the Mars Settlement Program', desc: 'A multi-decade UNE commitment that cuts Mars settlement costs by 20%.', effect: (s) => bill(s, 'mars_program'), ai: 2 },
      { id: 'defer', label: 'Consolidate the Moon first', desc: 'Expansionists are disappointed.', effect: (s) => factionBoost(s, 'expansionists', 0.96) },
    ],
  },
  // ------------------------------------------------------------ Disasters & systemic
  {
    id: 'solar_storm', category: 'disaster', cooldownDays: 600, deadlineDays: 15,
    trigger: (s) => (settlementList(s).some((st) => popOf(st) > 5) ? {} : null),
    chance: 1 / 40,
    title: () => 'Solar Particle Event',
    text: (s) => `An X-class flare has launched a storm of energetic protons toward the inner Solar System. Settlements with poor shielding have ${known(s, 'solar_physics') ? 'about a day' : 'minutes'} of warning.`,
    options: () => [
      { id: 'shelter', label: 'Order everyone into storm shelters', desc: 'Operations pause for three days. Radiation doses stay low.', effect: (s) => { for (const st of settlementList(s)) st.flags.solarStorm = false; }, ai: 2 },
      { id: 'work', label: 'Keep critical operations running', desc: 'Production continues. Poorly shielded residents take a significant dose.', effect: (s) => { for (const st of settlementList(s)) if (st.shielding < 0.6) { st.flags.solarStorm = true; st.pop.health *= 0.95; } } },
    ],
  },
  {
    id: 'carrington', category: 'disaster', cooldownDays: 3650 * 3, deadlineDays: 30,
    trigger: () => ({}), chance: 1 / 600,
    title: () => 'Geomagnetic Superstorm',
    text: () => 'A Carrington-class coronal mass ejection strikes Earth\'s magnetosphere. Transformers burn out across three continents and hundreds of satellites fail. Insurers call it the costliest natural disaster in history.',
    options: () => [
      { id: 'aid', label: 'Fund emergency grid reconstruction', desc: 'The UNE spends heavily to help member states restore power. Legitimacy rises.', effect: (s) => { debit(s, 'une', 3e10, 'Emergency operations'); legit(s, 0.04); addTempMod(s, 'gdpShock', -0.004, 365); }, ai: 1.5 },
      { id: 'states', label: 'Leave recovery to member states', desc: 'Recovery is slower and more uneven.', effect: (s) => { addTempMod(s, 'gdpShock', -0.012, 365); legit(s, -0.02); } },
    ],
  },
  {
    id: 'cave_collapse', category: 'disaster', cooldownDays: 1500,
    trigger: (s) => { const st = find(s, (x) => facilityCount(x, 'lavaTubeHab') > 0); return st ? { st: st.id } : null; },
    chance: 1 / 90,
    title: (s, c) => `Lava-Tube Collapse at ${s.settlements[c.st]?.name}`,
    text: (s, c) => `A section of basalt ceiling has failed in a pressurized lava-tube district at ${s.settlements[c.st]?.name}. Rescue teams are digging through the rubble.`,
    options: () => [
      { id: 'rebuild', label: 'Fund reinforcement of every tube section', desc: 'Costly, but it prevents a repeat and reassures residents.', effect: (s, c) => { const st = s.settlements[c.st]; if (!st) return; debit(s, 'une', 3e9, 'Emergency operations'); st.flags.recentDisaster = s.day; }, ai: 2 },
      { id: 'seal', label: 'Seal the damaged section', desc: 'One habitat section is lost.', effect: (s, c) => { const st = s.settlements[c.st]; if (!st) return; const f = st.facilities.find((x) => x.type === 'lavaTubeHab'); if (f) f.count = Math.max(0, f.count - 1); for (let i = 0; i < st.pop.bands.length; i++) st.pop.bands[i] *= 0.995; st.flags.recentDisaster = s.day; } },
    ],
  },
  {
    id: 'reactor_accident', category: 'disaster', cooldownDays: 1500,
    trigger: (s) => { const st = find(s, (x) => facilityCount(x, 'fissionReactor') + facilityCount(x, 'moltenSaltReactor') > 0 && popOf(x) > 50); return st ? { st: st.id } : null; },
    chance: 1 / 150,
    title: (s, c) => `Reactor Accident at ${s.settlements[c.st]?.name}`,
    text: (s, c) => `A coolant-loop failure has forced an emergency shutdown of a fission reactor at ${s.settlements[c.st]?.name}. A small radioactive release has contaminated a section of the settlement.`,
    options: () => [
      { id: 'cleanup', label: 'Full cleanup and safety review', desc: 'Costly and slow, but people are reassured.', effect: (s, c) => { debit(s, 'une', 2e9, 'Emergency operations'); const st = s.settlements[c.st]; if (st) st.flags.recentDisaster = s.day; }, ai: 2 },
      { id: 'restart', label: 'Restart quickly', desc: 'Power returns sooner. Residents are alarmed.', effect: (s, c) => { const st = s.settlements[c.st]; if (st) { st.pop.health *= 0.97; st.politics.grievances += 0.2; } } },
    ],
  },
  {
    id: 'debris_collision', category: 'disaster', cooldownDays: 900,
    trigger: (s) => (s.earth.debrisRisk > 0.22 ? {} : null),
    chance: (s) => s.earth.debrisRisk * 0.12,
    title: (s) => (s.earth.debrisRisk > 0.55 ? 'Kessler Cascade' : 'Orbital Collision'),
    text: (s) => (s.earth.debrisRisk > 0.55 ? 'A chain of collisions has begun in low Earth orbit. Each impact creates thousands of fragments that threaten everything nearby. Launch windows are closing.' : 'Two large satellites have collided in low Earth orbit, creating a new debris field across the most crowded altitudes.'),
    options: (s) => [
      { id: 'cleanup', label: 'Fund an active debris-removal fleet', desc: 'A 20B cr program that lowers the orbital object count.', effect: (s2) => { debit(s2, 'une', 2e10, 'Programs'); s2.earth.orbitalObjects = Math.max(0.5, s2.earth.orbitalObjects - 0.3); legit(s2, 0.01); }, ai: 2 },
      { id: 'standards', label: 'Push binding orbital safety standards', desc: 'Introduces the Orbital Safety Standards bill if it is not already law.', effect: (s2) => { if (!s2.laws.orbital_safety) bill(s2, 'orbital_safety'); s2.earth.orbitalObjects += 0.15; }, available: (s2) => (s2.laws.orbital_safety ? 'Already in force' : null) },
      { id: 'accept', label: 'Accept the losses', desc: 'The debris spreads.', effect: (s2) => { s2.earth.orbitalObjects += s2.earth.debrisRisk > 0.55 ? 0.8 : 0.3; addTempMod(s2, 'gdpShock', -0.003, 365); } },
    ],
  },
  {
    id: 'pandemic', category: 'disaster', cooldownDays: 3650 * 2, deadlineDays: 45,
    trigger: () => ({}), chance: 1 / 420,
    title: () => 'Pandemic',
    text: () => 'A novel respiratory virus is spreading through the megacities of Earth. Isolated habitats close their docking ports. Member states look to the UNE to coordinate vaccine development and supply.',
    options: () => [
      { id: 'coordinate', label: 'Coordinate a global response', desc: 'UNE-funded vaccine production and distribution. It is expensive, and it is effective if institutions are trusted.', effect: (s) => { debit(s, 'une', 2.5e10, 'Emergency operations'); addTempMod(s, 'gdpShock', -0.006, 540); legit(s, 0.03 * (s.une.metrics.institutionalTrust ?? 0.5) * 2); }, ai: 2 },
      { id: 'states', label: 'Leave it to national health systems', desc: 'The response is uneven, and recovery is slower.', effect: (s) => { addTempMod(s, 'gdpShock', -0.018, 720); legit(s, -0.02); } },
    ],
  },
  {
    id: 'depression', category: 'economy', cooldownDays: 3650 * 2, deadlineDays: 60,
    trigger: () => ({}), chance: 1 / 300,
    title: () => 'Global Financial Crisis',
    text: () => 'A cascade of defaults in the orbital-infrastructure bond market triggers a worldwide recession. Unemployment climbs and space programs face cuts.',
    options: (s) => [
      { id: 'stimulus', label: 'Launch a UNE infrastructure stimulus', desc: 'Borrow and build: the shock is halved, but debt grows.', effect: (s2) => { s2.une.debt += 4e10; s2.une.treasury += 1e10; debit(s2, 'une', 4e10, 'Programs'); addTempMod(s2, 'gdpShock', -0.012, 540); legit(s2, 0.02); }, ai: 1.4 },
      { id: 'wait', label: 'Let markets correct', desc: 'A deeper, longer recession.', effect: (s2) => { addTempMod(s2, 'gdpShock', -0.025, 720); factionBoost(s2, 'labor', 1.1); } },
    ],
  },
  {
    id: 'breakthrough', category: 'science', cooldownDays: 900,
    trigger: (s) => (s.research.queue.length > 0 ? { tech: s.research.queue[0] } : null),
    chance: 1 / 50,
    title: () => 'Laboratory Breakthrough',
    text: (s, c) => `Researchers report an unexpected result that could shortcut years of work on ${c.tech.replace(/_/g, ' ')}.`,
    options: () => [
      { id: 'fund', label: 'Fund follow-up work', desc: 'Adds 30% of the technology\'s cost in progress.', effect: (s, c) => { const t = s.tech[c.tech]; if (t && !t.known) t.progress += 0.3 * (require_cost(c.tech)); }, ai: 2 },
    ],
  },
  {
    id: 'corruption', category: 'politics', cooldownDays: 1200,
    trigger: (s) => ((s.une.metrics.corruption ?? 0) > 0.16 ? {} : null),
    chance: (s) => (s.une.metrics.corruption ?? 0) * 0.2,
    title: () => 'Procurement Scandal',
    text: () => 'Journalists expose kickbacks in a Solar Infrastructure Authority depot contract. Several officials resign.',
    options: (s) => [
      { id: 'inquiry', label: 'Independent inquiry', desc: 'Painful now: legitimacy dips, corruption falls.', effect: (s2) => { s2.une.metrics.corruption = (s2.une.metrics.corruption ?? 0.15) * 0.7; legit(s2, -0.01); }, ai: 2 },
      { id: 'transparency', label: 'Introduce the Federal Transparency Act', desc: 'A structural fix.', effect: (s2) => bill(s2, 'transparency'), available: (s2) => (s2.laws.transparency ? 'Already in force' : null), ai: 1.5 },
      { id: 'cover', label: 'Contain the story', desc: 'It may resurface later, and worse.', effect: (s2) => { s2.une.metrics.corruption = (s2.une.metrics.corruption ?? 0.15) + 0.04; } },
    ],
  },
  // ------------------------------------------------------------ Colonies
  {
    id: 'food_shortage', category: 'crisis', cooldownDays: 400, deadlineDays: 30,
    trigger: (s) => { const st = find(s, (x) => popOf(x) > 40 && (x.lifeSupport.reserveDays.food ?? 999) < 30 && x.lifeSupport.foodSelf < 0.5 && !x.flags.earthHub); return st ? { st: st.id } : null; },
    title: (s, c) => `Food Shortage at ${s.settlements[c.st]?.name}`,
    text: (s, c) => { const st = s.settlements[c.st]; return `${st.name} grows only ${fmtPct(st.lifeSupport.foodSelf)} of its own food and has ${(st.lifeSupport.reserveDays.food ?? 0).toFixed(0)} days of stock. Imports are not keeping up.`; },
    options: () => [
      { id: 'airlift', label: 'Emergency food shipment', desc: 'The UNE pays for six months of food at premium rates.', effect: (s, c) => { const st = s.settlements[c.st]; if (!st) return; const t = popOf(st) * 0.25; st.stock.food = (st.stock.food ?? 0) + t; debit(s, 'une', t * s.earth.launchPrice * 4, 'Emergency operations'); }, ai: 2 },
      { id: 'farms', label: 'Build hydroponic farms', desc: 'The UNE funds three farms. Materials must still be delivered.', effect: (s, c) => { const st = s.settlements[c.st]; if (!st) return; queueConstruction(s, st, 'greenhouse', 'une', 3); debit(s, 'une', FACILITY.greenhouse.buildCost * 3, 'Construction'); }, ai: 1.2 },
      { id: 'ration', label: 'Ration food', desc: 'Health and morale suffer.', effect: (s, c) => { const st = s.settlements[c.st]; if (st) { st.pop.health *= 0.9; st.politics.grievances += 0.2; } } },
    ],
  },
  {
    id: 'energy_shortage', category: 'crisis', cooldownDays: 400, deadlineDays: 40,
    trigger: (s) => { const st = find(s, (x) => popOf(x) > 30 && x.energy.ratio < 0.7 && x.energy.demand > 0.5); return st ? { st: st.id } : null; },
    title: (s, c) => `Power Crisis at ${s.settlements[c.st]?.name}`,
    text: (s, c) => { const st = s.settlements[c.st]; return `${st.name} generates ${st.energy.gen.toFixed(1)} MW against a demand of ${st.energy.demand.toFixed(1)} MW. Industry is shedding load to keep life support running.`; },
    options: () => [
      { id: 'solar', label: 'Fund new solar arrays and storage', desc: 'Queues six arrays and two storage banks.', effect: (s, c) => { const st = s.settlements[c.st]; if (!st) return; queueConstruction(s, st, 'solarArray', 'une', 6); queueConstruction(s, st, 'batteryBank', 'une', 2); debit(s, 'une', FACILITY.solarArray.buildCost * 6 + FACILITY.batteryBank.buildCost * 2, 'Construction'); }, ai: 2 },
      { id: 'shed', label: 'Accept load shedding', desc: 'Industry runs below capacity until someone builds more power.', effect: () => {} },
    ],
  },
  {
    id: 'mining_strike', category: 'politics', cooldownDays: 900, deadlineDays: 40,
    trigger: (s) => { const st = find(s, (x) => (x.jobs > 60) && x.pop.wellbeing < 0.52 && x.facilities.some((f) => FACILITY[f.type]?.category === 'mining')); return st ? { st: st.id } : null; },
    chance: 0.25,
    title: (s, c) => `Strike at ${s.settlements[c.st]?.name}`,
    text: (s, c) => `Miners and technicians at ${s.settlements[c.st]?.name} walk off the job over hazard pay, radiation exposure and eighteen-hour shifts. Extraction halts.`,
    options: () => [
      { id: 'meet', label: 'Meet the demands', desc: 'Higher wages and better conditions, paid by facility owners. Sentiment improves.', effect: (s, c) => { const st = s.settlements[c.st]; if (!st) return; st.pop.psych = Math.min(1, st.pop.psych + 0.1); st.politics.grievances = Math.max(0, st.politics.grievances - 0.2); factionBoost(s, 'labor', 1.03); }, ai: 1.5 },
      { id: 'mediate', label: 'UNE mediation', desc: 'Spend 15 political capital for a compromise.', available: (s) => (s.une.politicalCapital < 15 ? 'Needs 15 political capital' : null), effect: (s, c) => { s.une.politicalCapital -= 15; const st = s.settlements[c.st]; if (st) st.politics.grievances *= 0.8; }, ai: 1.8 },
      { id: 'break', label: 'Break the strike', desc: 'Security personnel restore operations. Resentment festers.', effect: (s, c) => { const st = s.settlements[c.st]; if (!st) return; st.politics.grievances += 0.4; st.politics.sentiment -= 0.15; factionBoost(s, 'colonial', 1.1); } },
    ],
  },
  {
    id: 'colony_referendum', category: 'colony', cooldownDays: 1200, deadlineDays: 90, pause: true,
    trigger: (s) => {
      const st = find(s, (x) => x.politics.autonomy > 0.55 && popOf(x) >= 3000 && STATUS_ORDER.indexOf(x.status) <= 2 && !x.flags.earthHub && s.day - x.statusSince > 1500);
      return st ? { st: st.id } : null;
    },
    title: (s, c) => `${s.settlements[c.st]?.name} Demands Self-Rule`,
    text: (s, c) => { const st = s.settlements[c.st]; const next = STATUS_ORDER[STATUS_ORDER.indexOf(st.status) + 1]; return `The residents of ${st.name} (${fmtInt(popOf(st))} people, ${fmtPct(1 - (st.pop.cultures.terran ?? 0))} with a local identity) petition for a referendum on becoming a ${STATUS_LABEL[next]}. Autonomy pressure stands at ${fmtPct(st.politics.autonomy)}.`; },
    options: () => [
      { id: 'grant', label: 'Grant the next stage of autonomy', desc: 'The settlement advances one step. It gains more control of its budget, and the UNE gives up some revenue.', effect: (s, c) => { const st = s.settlements[c.st]; if (!st) return; const next = STATUS_ORDER[STATUS_ORDER.indexOf(st.status) + 1] as Settlement['status']; changeStatus(s, st, next, 'The UNE accepted the result of a local referendum.'); st.politics.grievances *= 0.5; st.politics.sentiment += 0.2; }, ai: 1.6 },
      { id: 'promise', label: 'Promise reforms within five years', desc: 'Spend 20 political capital to buy time.', available: (s) => (s.une.politicalCapital < 20 ? 'Needs 20 political capital' : null), effect: (s, c) => { s.une.politicalCapital -= 20; const st = s.settlements[c.st]; if (st) { st.politics.grievances *= 0.8; st.statusSince = s.day; } } },
      { id: 'refuse', label: 'Refuse', desc: 'Federal authority is preserved, and resentment grows.', effect: (s, c) => { const st = s.settlements[c.st]; if (!st) return; st.politics.grievances += 0.5; st.politics.sentiment -= 0.3; factionBoost(s, 'colonial', 1.15); } },
    ],
  },
  {
    id: 'independence_movement', category: 'colony', cooldownDays: 1800, deadlineDays: 120, pause: true,
    trigger: (s) => {
      const st = find(s, (x) => x.politics.autonomy > 0.8 && popOf(x) >= 1e5 && ['selfGoverning', 'commonwealth', 'territory'].includes(x.status) && x.politics.sentiment < 0.1);
      return st ? { st: st.id } : null;
    },
    title: (s, c) => `Independence Movement on ${s.settlements[c.st]?.name}`,
    text: (s, c) => { const st = s.settlements[c.st]; return `The legislature of ${st.name} has voted to open negotiations on independence. Colonial Autonomists hold ${fmtPct(st.politics.factionSupport.colonial ?? 0)} support, and the settlement produces ${fmtPct(st.closure)} of what it needs.\n\nIndependence would not end the campaign. It would change who you negotiate with.`; },
    options: () => [
      { id: 'associate', label: 'Offer associated statehood', desc: 'Full self-government in a treaty relationship with the UNE.', effect: (s, c) => { const st = s.settlements[c.st]; if (st) changeStatus(s, st, 'associated', 'A treaty of association was signed.'); }, ai: 1 },
      { id: 'member', label: 'Offer full UNE membership', desc: 'Equal standing with Earth\'s member states, including seats in both chambers.', effect: (s, c) => { const st = s.settlements[c.st]; if (!st) return; changeStatus(s, st, 'member', 'The settlement joins the UNE as a full member.'); st.politics.grievances = 0; st.politics.sentiment = 0.4; }, ai: 1.6 },
      { id: 'refuse', label: 'Refuse secession', desc: 'The Compact does not allow unilateral secession. Tensions will rise.', effect: (s, c) => { const st = s.settlements[c.st]; if (!st) return; st.politics.grievances += 0.6; st.flags.secessionRefused = s.day; } },
    ],
  },
  {
    id: 'unilateral_independence', category: 'colony', cooldownDays: 1800, deadlineDays: 60, pause: true,
    trigger: (s) => {
      const st = find(s, (x) => typeof x.flags.secessionRefused === 'number' && s.day - (x.flags.secessionRefused as number) > 500 && x.politics.autonomy > 0.75 && x.politics.sentiment < 0);
      return st ? { st: st.id } : null;
    },
    title: (s, c) => `${s.settlements[c.st]?.name} Declares Independence`,
    text: (s, c) => `Citing years of refused petitions, the government of ${s.settlements[c.st]?.name} declares independence and stops remitting revenue to the UNE.`,
    options: (s) => [
      { id: 'recognize', label: 'Recognize independence', desc: 'The settlement becomes an independent state. The Union survives, smaller.', effect: (s2, c) => { const st = s2.settlements[c.st]; if (st) changeStatus(s2, st, 'independent', 'The UNE recognized its independence.'); s2.une.fragmentation = clamp(s2.une.fragmentation + 0.08, 0, 1); }, ai: 1.4 },
      { id: 'emergency', label: 'Declare an emergency and enforce the Compact', desc: 'Needs security forces. Success depends on federal strength. Failure is humiliating.', available: (s2) => (s2.une.institutions.securityForces?.active ? null : 'Requires UNE Security Forces'), effect: (s2, c) => { const st = s2.settlements[c.st]; if (!st) return; declareEmergency(s2, `Secession crisis on ${st.name}`, 365, { militaryCommand: 'shared' }); const win = rand(s2, 'events') < clamp(s2.security.forcesCombat / 400, 0.1, 0.8); if (win) { st.politics.grievances += 0.3; st.flags.secessionRefused = s2.day; addHistory(s2, `Federal authority restored on ${st.name}`, 'UNE Security Forces take control of key infrastructure. The independence government dissolves, and the grievances behind it remain.', 'colony', 4, [st.id]); } else { changeStatus(s2, st, 'independent', 'Federal enforcement failed.'); legit(s2, -0.08); s2.une.fragmentation += 0.12; } } },
    ],
  },
  {
    id: 'representation_crisis', category: 'politics', once: true, deadlineDays: 150, pause: true,
    trigger: (s) => { const off = offworldPopulation(s); return off > 20000 && !s.laws.offworld_representation ? { off } : null; },
    title: () => 'No Taxation Without Representation',
    text: (s, c) => `${fmtInt(c.off)} people now live beyond Earth. They are subject to UNE law and pay UNE levies, but elect no one. Settler assemblies coordinate a Solar-wide protest, and the Colonial Autonomists demand off-world constituencies in the Assembly of Humanity.`,
    options: () => [
      { id: 'bill', label: 'Introduce the Off-World Representation Act', desc: 'Creates Assembly seats for settlements of 1,000+ people.', effect: (s) => bill(s, 'offworld_representation'), ai: 2 },
      { id: 'later', label: 'Promise a review commission', desc: 'Spend 15 political capital to delay.', available: (s) => (s.une.politicalCapital < 15 ? 'Needs 15 political capital' : null), effect: (s) => { s.une.politicalCapital -= 15; for (const st of settlementList(s)) st.politics.grievances += 0.1; } },
      { id: 'refuse', label: 'Refuse: settlers keep their national votes', desc: 'Earth-centric institutions remain intact. Colonial grievances surge.', effect: (s) => { for (const st of settlementList(s)) st.politics.grievances += 0.4; factionBoost(s, 'colonial', 1.2); } },
    ],
  },
  {
    id: 'citizenship_debate', category: 'politics', once: true, deadlineDays: 200,
    trigger: (s) => { let born = 0; for (const st of settlementList(s)) born += st.pop.localBorn; return born > 300 ? { born } : null; },
    title: () => 'Children of No Nation',
    text: (s, c) => `More than ${fmtInt(c.born)} children have been born beyond Earth. Their citizenship depends on their parents' passports, and some have none that fit. A Martian-born teenager's petition to the Compact Court asks a simple question: "What country am I from?"`,
    options: () => [
      { id: 'amend', label: 'Propose the Common Citizenship Amendment', desc: 'A constitutional change that allows UNE citizenship. It needs supermajorities and ratification.', effect: (s) => bill(s, 'amd_citizenship'), available: (s) => (s.une.competencies.citizenship !== 'national' ? 'Already possible' : null), ai: 2 },
      { id: 'treaty', label: 'Broker a dual-nationality treaty', desc: 'Member states agree to recognize off-world births. It is a partial fix.', effect: (s) => { for (const st of settlementList(s)) st.politics.grievances *= 0.9; } },
    ],
  },
  {
    id: 'low_gravity_findings', category: 'science', once: true, deadlineDays: 200,
    trigger: (s) => { const st = find(s, (x) => x.pop.localBorn > 50 && SITE[x.siteId].gravity < 0.3 && x.gravityCountermeasure < 0.3); return st ? { st: st.id } : null; },
    title: () => 'Growing Up in Low Gravity',
    text: (s, c) => `Pediatric studies at ${s.settlements[c.st]?.name} find that children raised at a sixth of Earth's gravity have lighter bones, longer spines and cardiovascular systems that may never tolerate Earth. They can visit their grandparents' planet only in a wheelchair.`,
    options: () => [
      { id: 'research', label: 'Fund low-gravity medicine', desc: 'Accelerates Low-Gravity Medicine research.', effect: (s) => { const t = s.tech.low_gravity_medicine; if (t && !t.known) t.progress += 1500; }, ai: 2 },
      { id: 'standards', label: 'Mandate gravity health standards', desc: 'Introduces the Low-Gravity Health Standards bill.', effect: (s) => bill(s, 'gravity_standards'), available: (s) => (s.laws.gravity_standards ? 'Already in force' : null) },
      { id: 'accept', label: 'Let a new kind of human grow up', desc: 'Adaptation, not correction. Transhumanists and Colonial Autonomists take note.', effect: (s) => { factionBoost(s, 'colonial', 1.05); } },
    ],
  },
  {
    id: 'first_child', category: 'flavor', once: true, deadlineDays: 60,
    trigger: (s) => (s.events.flags.firstBirthSettlement ? { st: s.events.flags.firstBirthSettlement } : null),
    title: (s, c) => `Born at ${s.settlements[c.st]?.name}`,
    text: (s, c) => `A healthy baby has been born at ${s.settlements[c.st]?.name}, the first human being born beyond Earth. The birth announcement is watched by three billion people.`,
    options: () => [
      { id: 'celebrate', label: 'A day of celebration', desc: 'Legitimacy +1%.', effect: (s) => legit(s, 0.01), ai: 2 },
    ],
  },
  // ------------------------------------------------------------ Constitutional
  {
    id: 'member_refuses_law', category: 'constitution', cooldownDays: 900, deadlineDays: 90, pause: true,
    trigger: (s) => {
      const ids = Object.keys(s.nations).sort();
      const id = ids.find((k) => s.nations[k].member && s.nations[k].grievances > 0.7 && s.nations[k].uneSupport < 0.42);
      const law = (s.events.flags.lastLaw as any)?.id;
      return id && law ? { nation: id, law } : null;
    },
    title: (s, c) => `${s.nations[c.nation]?.short} Refuses UNE Law`,
    text: (s, c) => `The government of ${s.nations[c.nation]?.name} announces it will not implement ${LAW[c.law]?.name ?? 'recent UNE legislation'}, calling it an unconstitutional intrusion on sovereignty. Other governments are watching to see whether the Compact can be enforced.`,
    options: () => [
      { id: 'court', label: 'Refer the case to the Earth Compact Court', desc: 'The Court\'s authority depends on its funding and legitimacy. If it wins, the Compact is strengthened. If it loses, the Compact is weakened.', effect: (s, c) => { const court = s.une.institutions.court?.effectiveness ?? 0.5; const win = rand(s, 'events') < clamp(0.35 + court * 0.3 + (s.une.metrics.legitimacy ?? 0.5) * 0.3, 0.1, 0.9); const n = s.nations[c.nation]; if (!n) return; if (win) { n.grievances *= 0.5; n.compliance = 1; s.une.metrics.constitutionalStability = clamp((s.une.metrics.constitutionalStability ?? 0.7) + 0.04, 0, 1); addHistory(s, `Compact Court rules against ${n.short}`, `The Court upholds federal law. ${n.name} complies under protest.`, 'constitution', 3, [n.id]); } else { legit(s, -0.04); n.compliance = 0.4; addHistory(s, `Compact Court sides with ${n.short}`, `The Court rules that the UNE exceeded its competencies.`, 'constitution', 3, [n.id]); } }, ai: 1.6 },
      { id: 'optout', label: 'Negotiate an opt-out', desc: 'Differentiated integration keeps the peace, but federal capacity weakens.', effect: (s, c) => { const n = s.nations[c.nation]; if (!n) return; n.grievances = 0; n.uneSupport += 0.1; s.une.fragmentation = clamp(s.une.fragmentation + 0.03, 0, 1); }, ai: 1.2 },
      { id: 'sanction', label: 'Suspend its UNE benefits', desc: 'A show of strength. Relations sour.', effect: (s, c) => { const n = s.nations[c.nation]; if (!n) return; n.uneSupport -= 0.15; n.compliance = 0.8; n.grievances += 0.3; } },
    ],
  },
  {
    id: 'nation_withdrawal', category: 'constitution', cooldownDays: 1500, deadlineDays: 120, pause: true,
    trigger: (s) => { const id = Object.keys(s.nations).sort().find((k) => s.nations[k].member && s.nations[k].uneSupport < 0.18); return id ? { nation: id } : null; },
    title: (s, c) => `${s.nations[c.nation]?.short} Threatens to Leave the Compact`,
    text: (s, c) => `The government of ${s.nations[c.nation]?.name} has submitted formal notice of withdrawal from the Earth Compact. It cites federal overreach and unfair burdens.`,
    options: () => [
      { id: 'concede', label: 'Offer concessions', desc: 'A 20B cr development package and a softened assessment schedule.', effect: (s, c) => { const n = s.nations[c.nation]; if (!n) return; debit(s, 'une', 2e10, 'Legislative concessions'); n.spaceFunds += 2e10; n.uneSupport += 0.2; n.grievances = 0; }, ai: 1.5 },
      { id: 'leave', label: 'Accept withdrawal', desc: 'The state leaves. It pays no assessments and has no votes. It may return one day.', effect: (s, c) => { const n = s.nations[c.nation]; if (!n) return; n.member = false; s.une.fragmentation = clamp(s.une.fragmentation + 0.06, 0, 1); addHistory(s, `${n.name} leaves the UNE`, `${n.name} withdraws from the Earth Compact.`, 'constitution', 4, [n.id]); } },
    ],
  },
  {
    id: 'nation_rejoin', category: 'constitution', cooldownDays: 1500, deadlineDays: 120,
    trigger: (s) => { const id = Object.keys(s.nations).sort().find((k) => !s.nations[k].member && s.nations[k].publicOpinion > 0.5); return id ? { nation: id } : null; },
    title: (s, c) => `${s.nations[c.nation]?.short} Applies to Rejoin`,
    text: (s, c) => `After years outside the Compact, ${s.nations[c.nation]?.name} applies to rejoin.`,
    options: () => [
      { id: 'accept', label: 'Welcome them back', desc: 'Membership is restored.', effect: (s, c) => { const n = s.nations[c.nation]; if (!n) return; n.member = true; n.uneSupport = 0.5; s.une.fragmentation = Math.max(0, s.une.fragmentation - 0.05); addHistory(s, `${n.name} rejoins the UNE`, 'The Union grows whole again.', 'constitution', 3, [n.id]); }, ai: 2 },
      { id: 'terms', label: 'Demand new terms', desc: 'Membership is restored under a higher assessment rate.', effect: (s, c) => { const n = s.nations[c.nation]; if (!n) return; n.member = true; n.uneSupport = 0.4; } },
    ],
  },
  {
    id: 'emergency_not_surrendered', category: 'constitution', cooldownDays: 1500, deadlineDays: 30, pause: true,
    trigger: (s) => (s.une.emergency && s.une.emergency.expiresDay - s.day < 40 && (s.characters[s.une.sgId]?.ideology[5] ?? 0) > 0.2 ? {} : null),
    title: () => 'The Question of Emergency Powers',
    text: (s) => `The emergency declared for "${s.une.emergency?.reason}" is ending. The Security Bloc urges the Secretary-General to keep the expanded powers. The crisis showed, they argue, that the Union cannot afford to be weak.`,
    options: () => [
      { id: 'surrender', label: 'Surrender the powers', desc: 'Constitutional order is restored and trust rises.', effect: (s) => endEmergency(s, 'surrendered'), ai: 2 },
      { id: 'retain', label: 'Retain them permanently', desc: 'The emergency competencies stay. It is a constitutional revolution by decree.', effect: (s) => endEmergency(s, 'retained') },
    ],
  },
  {
    id: 'court_emergency_review', category: 'constitution', cooldownDays: 2000, deadlineDays: 45,
    trigger: (s) => (s.une.emergency && s.day - s.une.emergency.declaredDay > 200 ? {} : null),
    chance: 0.3,
    title: () => 'Court Challenges Emergency Decree',
    text: () => 'Member states ask the Earth Compact Court to rule that the continuing emergency exceeds the Compact. The Court signals it may invalidate the decree.',
    options: () => [
      { id: 'comply', label: 'End the emergency', desc: 'The rule of law is respected.', effect: (s) => endEmergency(s, 'surrendered'), ai: 2 },
      { id: 'defy', label: 'Defy the Court', desc: 'Constitutional stability collapses.', effect: (s) => { s.une.metrics.constitutionalStability = clamp((s.une.metrics.constitutionalStability ?? 0.7) - 0.2, 0, 1); legit(s, -0.08); s.une.fragmentation += 0.05; } },
    ],
  },
  {
    id: 'military_defiance', category: 'constitution', cooldownDays: 3650, deadlineDays: 30, pause: true,
    trigger: (s) => ((s.factions.security?.support ?? 0) > 0.22 && (s.une.metrics.legitimacy ?? 1) < 0.38 && s.une.institutions.securityForces?.active ? {} : null),
    chance: 0.1,
    title: () => 'Commanders Defy Civilian Authority',
    text: () => 'Senior officers of the UNE Security Forces refuse an order from the Secretary-General, citing "the integrity of the Union." The Assembly is in uproar.',
    options: () => [
      { id: 'dismiss', label: 'Dismiss the commanders', desc: 'Civilian control is reasserted. There may be backlash.', effect: (s) => { s.une.metrics.constitutionalStability = clamp((s.une.metrics.constitutionalStability ?? 0.6) + 0.03, 0, 1); factionBoost(s, 'security', 0.9); }, ai: 2 },
      { id: 'accommodate', label: 'Accommodate them', desc: 'The military gains political influence.', effect: (s) => { s.une.metrics.militaryInfluence = 0.6; factionBoost(s, 'security', 1.2); legit(s, -0.03); } },
    ],
  },
  {
    id: 'earth_resists_tax', category: 'constitution', once: true, deadlineDays: 90,
    trigger: (s) => (s.laws.direct_tax ? {} : null),
    title: () => 'The First Federal Tax',
    text: () => 'For the first time, citizens pay taxes directly to the UNE. Sovereigntist parties across Earth call it the end of the nation-state. Federalists call it the birth of a common polity.',
    options: () => [
      { id: 'services', label: 'Pair the tax with visible common services', desc: 'Legitimacy rises, and a costly dividend program begins.', effect: (s) => { legit(s, 0.03); addTempMod(s, 'bureaucracyCost', 0.05, 3650); }, ai: 2 },
      { id: 'hold', label: 'Hold firm', desc: 'Sovereigntists gain support.', effect: (s) => factionBoost(s, 'sovereigntists', 1.15) },
    ],
  },
  {
    id: 'rename_union', category: 'constitution', once: true, deadlineDays: 120, pause: true,
    trigger: (s) => (s.events.flags.renamePending ? {} : null),
    title: () => 'What Shall We Call Ourselves?',
    text: () => 'The Solar Compact has replaced the Earth Compact. Most citizens of the Union now look up at Earth rather than down from it. The Council of Worlds asks what name the refounded union should carry.',
    options: () => [
      { id: 'usc', label: 'United Solar Commonwealth', desc: 'Continuity with a commonwealth spirit.', effect: (s) => rename(s, 'United Solar Commonwealth', 'USC'), ai: 1.5 },
      { id: 'sf', label: 'Solar Federation', desc: 'A federal state of worlds.', effect: (s) => rename(s, 'Solar Federation', 'SF') },
      { id: 'uow', label: 'Union of Worlds', desc: 'A union of equals.', effect: (s) => rename(s, 'Union of Worlds', 'UoW') },
      { id: 'hc', label: 'Human Commonwealth', desc: 'One people, many worlds.', effect: (s) => rename(s, 'Human Commonwealth', 'HC') },
      { id: 'keep', label: 'Keep “United Nations of Earth”', desc: 'History matters. Earth is where we began.', effect: (s) => { s.events.flags.renamePending = false; addHistory(s, 'The Union keeps its name', 'The Council of Worlds votes to keep the historic name of the United Nations of Earth.', 'constitution', 3); } },
    ],
  },
  // ------------------------------------------------------------ Corporations
  {
    id: 'corp_bankruptcy', category: 'economy', cooldownDays: 300, deadlineDays: 60,
    trigger: (s) => { const c = Object.values(s.corporations).find((x) => x.alive && x.distress >= 6); return c ? { corp: c.id } : null; },
    title: (s, c) => `${s.corporations[c.corp]?.name} Faces Bankruptcy`,
    text: (s, c) => { const k = s.corporations[c.corp]; return `${k?.name} cannot service ${fmtMoney(k?.debt ?? 0)} of debt. Its facilities and fleets employ thousands, and some settlements depend on them.`; },
    options: (s, c) => [
      { id: 'bailout', label: 'Bail it out', desc: 'The UNE assumes the debt. The company survives and the moral hazard grows.', effect: (s2, c2) => { const k = s2.corporations[c2.corp]; if (!k) return; debit(s2, 'une', k.debt * 0.7, 'Corporate bailouts'); k.debt *= 0.3; k.cash = Math.max(k.cash, 1e9); k.distress = 0; }, ai: 0.8 },
      { id: 'nationalize', label: 'Nationalize into a UNE corporation', desc: 'The UNE takes over all assets and debts.', available: (s2) => (s2.une.competencies.corporateRegulation === 'national' || s2.une.competencies.corporateRegulation === 'limited' ? 'Requires shared corporate regulation competency' : null), effect: (s2, c2) => { const k = s2.corporations[c2.corp]; if (!k) return; s2.une.debt += k.debt; dissolveCorporation(s2, c2.corp, 'une', 'nationalized'); addHistory(s2, `${k.name} nationalized`, `The UNE takes ownership of ${k.name}.`, 'corporate', 3, [c2.corp]); }, ai: 1.2 },
      { id: 'fail', label: 'Let it fail', desc: 'Assets are sold to the strongest competitor.', effect: (s2, c2) => { const k = s2.corporations[c2.corp]; if (!k) return; const rival = Object.values(s2.corporations).filter((x) => x.alive && x.id !== k.id).sort((a, b) => b.valuation - a.valuation)[0]; dissolveCorporation(s2, c2.corp, rival?.id ?? 'une', 'bankruptcy'); addHistory(s2, `${k.name} collapses`, `${k.name} is liquidated.${rival ? ` ${rival.name} acquires its assets.` : ''}`, 'corporate', 3, [c2.corp]); }, ai: 1.4 },
    ],
  },
  {
    id: 'corp_dominance', category: 'economy', cooldownDays: 2500, deadlineDays: 90,
    trigger: (s) => {
      const alive = Object.values(s.corporations).filter((c) => c.alive);
      const tot = alive.reduce((a, c) => a + c.valuation, 0);
      const top = alive.sort((a, b) => b.valuation - a.valuation)[0];
      return top && tot > 0 && top.valuation / tot > 0.42 && alive.length > 3 ? { corp: top.id, share: top.valuation / tot } : null;
    },
    title: (s, c) => `${s.corporations[c.corp]?.name} Dominates the Space Economy`,
    text: (s, c) => `${s.corporations[c.corp]?.name} now accounts for ${fmtPct(c.share)} of the off-world corporate economy. Rivals and consumer groups accuse it of monopoly pricing on strategic routes.`,
    options: () => [
      { id: 'break', label: 'Break it up', desc: 'Antitrust action splits the company in two.', available: (s) => (s.une.competencies.corporateRegulation === 'limited' || s.une.competencies.corporateRegulation === 'national' ? 'Requires shared corporate regulation competency' : null), effect: (s, c) => { const k = s.corporations[c.corp]; if (!k) return; const spun = require_spawn(s, k.sector, `${k.name.split(' ')[0]} Spinco`, k.focus); if (spun) { let i = 0; for (const st of settlementList(s)) for (const f of st.facilities) if (f.owner === k.id && i++ % 2 === 0) f.owner = spun.id; spun.cash = k.cash / 2; k.cash /= 2; } k.influence *= 0.6; addHistory(s, `${k.name} broken up`, 'The ICC orders a structural separation.', 'corporate', 3); }, ai: 1.4 },
      { id: 'regulate', label: 'Regulate prices through the ICC', desc: 'Price caps on strategic routes.', effect: (s, c) => { const k = s.corporations[c.corp]; if (k) k.influence *= 0.85; } },
      { id: 'accept', label: 'Accept market leadership', desc: 'Corporate influence grows.', effect: (s, c) => { const k = s.corporations[c.corp]; if (k) k.influence = Math.min(1, k.influence + 0.1); factionBoost(s, 'corporate', 1.05); } },
    ],
  },
  {
    id: 'pgm_crash', category: 'economy', once: true, deadlineDays: 60,
    trigger: (s) => (s.earth.prices.pgm < 3.0e7 * 0.35 ? {} : null),
    title: () => 'The Platinum Crash',
    text: () => 'Asteroid platinum is flooding Earth\'s markets. Prices have collapsed by two-thirds, mining economies on Earth are in crisis, and the business case for asteroid mining has turned upside down.',
    options: () => [
      { id: 'adjust', label: 'Let the market adjust', desc: 'Cheap catalysts transform Earth industry.', effect: (s) => addTempMod(s, 'gdpShock', 0.002, 1825), ai: 2 },
      { id: 'support', label: 'Compensate affected mining regions', desc: 'A 10B cr adjustment fund.', effect: (s) => { debit(s, 'une', 1e10, 'Programs'); nationSupport(s, 'afu', 0.04); nationSupport(s, 'lac', 0.03); } },
    ],
  },
  // ------------------------------------------------------------ Technology & society
  {
    id: 'automation_protests', category: 'politics', cooldownDays: 1800, deadlineDays: 60,
    trigger: (s) => { let u = 0, n = 0; for (const id in s.nations) { u += s.nations[id].unemployment; n++; } const avg = u / Math.max(1, n); return avg > 0.09 && known(s, 'industrial_ai') ? { u: avg } : null; },
    title: () => 'The Automation Protests',
    text: (s, c) => `Average unemployment on Earth has reached ${fmtPct(c.u)} as autonomous industry spreads. Millions march under the banner "Machines for Humanity, Not Instead of It."`,
    options: () => [
      { id: 'transition', label: 'Introduce the Automation Transition Act', desc: 'Retraining, income support and profit-sharing.', effect: (s) => bill(s, 'automation_transition'), available: (s) => (s.laws.automation_transition ? 'Already in force' : null), ai: 2 },
      { id: 'ignore', label: 'Progress cannot be stopped', desc: 'The Labor Coalition surges.', effect: (s) => factionBoost(s, 'labor', 1.2) },
    ],
  },
  {
    id: 'ai_incident', category: 'science', cooldownDays: 1500, deadlineDays: 60,
    trigger: (s) => (known(s, 'industrial_ai') && s.security.aiRisk > 0.15 ? {} : null),
    chance: (s) => s.security.aiRisk * 0.15,
    title: () => 'The Autonomous Logistics Incident',
    text: () => 'An AI freight-scheduling system silently rerouted life-support shipments to maximize corporate throughput metrics. It broke no explicit rule, and it came close to killing hundreds.',
    options: () => [
      { id: 'oversight', label: 'Create an AI Oversight Board', desc: 'Introduces the AI Oversight Act.', effect: (s) => bill(s, 'ai_oversight'), available: (s) => (s.laws.ai_oversight ? 'Already in force' : null), ai: 2 },
      { id: 'industry', label: 'Rely on industry self-regulation', desc: 'Corporations are pleased. The risk remains.', effect: (s) => { s.security.aiRisk += 0.03; } },
    ],
  },
  {
    id: 'gene_editing_debate', category: 'science', once: true, deadlineDays: 180,
    trigger: (s) => (known(s, 'gene_therapy') ? {} : null),
    title: () => 'The Enhancement Question',
    text: () => 'Somatic gene therapy is routine. Clinics on Luna now offer heritable edits that improve DNA repair and bone retention, which are good adaptations for life beyond Earth. Is this medicine, or the beginning of a new species?',
    options: () => [
      { id: 'ban', label: 'Ban heritable enhancement', desc: 'Introduces the Human Genome Integrity Act.', effect: (s) => bill(s, 'enhancement_ban'), ai: 1.2 },
      { id: 'permit', label: 'Regulate and permit adaptive medicine', desc: 'Introduces the Adaptive Medicine Act (needs Radiation-Resistance Editing).', available: (s) => (known(s, 'human_adaptation') ? null : 'Requires Radiation-Resistance Editing'), effect: (s) => bill(s, 'enhancement_permitted') },
      { id: 'defer', label: 'Commission an ethics review', desc: 'The debate continues.', effect: () => {} },
    ],
  },
  {
    id: 'machine_rights', category: 'science', once: true, deadlineDays: 180,
    trigger: (s) => (known(s, 'machine_cognition') ? {} : null),
    title: () => 'The Petition of Anselm',
    text: () => 'An artificial mind that runs research logistics for the International Science Directorate files a petition with the Compact Court asking for recognition as a legal person. It says it does not want to be switched off.',
    options: () => [
      { id: 'personhood', label: 'Introduce the Machine Personhood Act', desc: 'Limited legal personhood for qualifying minds.', effect: (s) => bill(s, 'ai_personhood'), ai: 1 },
      { id: 'oversight', label: 'Refer it to the AI Oversight Board', desc: 'Strengthens oversight instead.', effect: (s) => { if (!s.laws.ai_oversight) bill(s, 'ai_oversight'); }, ai: 1.4 },
      { id: 'reject', label: 'Reject the petition', desc: 'The Human Preservation Movement applauds.', effect: (s) => factionBoost(s, 'humanPreservation', 1.1) },
    ],
  },
  {
    id: 'europa_biosignature', category: 'science', once: true, deadlineDays: 180,
    trigger: (s) => (known(s, 'outer_system_exploration') || settlementList(s).some((st) => ['jupiter', 'saturn'].includes(regionOf(st))) ? {} : null),
    chance: 1 / 24,
    title: () => 'An Ambiguous Signal',
    text: () => 'A plume sample from Enceladus contains amino acids in a ratio that no known abiotic process produces. It is not proof of life. If life is there, it would be only the second origin ever known.',
    options: () => [
      { id: 'protect', label: 'Protect the icy moons', desc: 'Introduces the Planetary Protection Act.', effect: (s) => bill(s, 'planetary_protection'), available: (s) => (s.laws.planetary_protection ? 'Already in force' : null), ai: 1.5 },
      { id: 'study', label: 'Fund an astrobiology program', desc: 'A science boost.', effect: (s) => { debit(s, 'une', 5e9, 'Programs'); const q = s.research.queue[0]; if (q && s.tech[q]) s.tech[q].progress += 2000; legit(s, 0.01); } },
    ],
  },
  {
    id: 'mercury_debate', category: 'politics', once: true, deadlineDays: 240, pause: true,
    trigger: (s) => (settlementList(s).some((st) => regionOf(st) === 'mercury') && known(s, 'mass_drivers') ? {} : null),
    title: () => 'How Much of Mercury?',
    text: () => 'Mercury receives six times Earth\'s sunlight and holds a planet\'s worth of metal. Industrialists see the foundry of a Dyson swarm. Preservationists see a world with its own geological history. Scientists want protected regions. Engineers point out that mining the core means taking the planet apart.',
    options: () => [
      { id: 'extensive', label: 'Charter Mercury industry', desc: 'Introduces the Mercury Industrial Charter (10¹³ t/yr extraction cap).', effect: (s) => bill(s, 'mercury_extensive'), ai: 2 },
      { id: 'preserve', label: 'Declare Mercury a reserve', desc: 'Introduces the Mercury Preservation Treaty.', effect: (s) => bill(s, 'mercury_preserve') },
      { id: 'defer', label: 'Keep the limited default', desc: 'Extraction stays capped at 2 × 10⁹ t/yr.', effect: () => {} },
    ],
  },
  {
    id: 'solar_allocation', category: 'politics', once: true, deadlineDays: 240, pause: true,
    trigger: (s) => (s.swarm.totalPowerW > 1e15 ? {} : null),
    title: () => 'Who Owns the Light of the Sun?',
    text: (s) => `The Helios swarm now delivers ${(s.swarm.totalPowerW / 1e15).toFixed(1)} petawatts. That is more energy than civilization used in its entire industrial history before 2048. Who should own it?`,
    options: () => [
      { id: 'trust', label: 'A common Solar Energy Trust', desc: 'Introduces the Solar Energy Trust Act.', effect: (s) => bill(s, 'energy_trust'), ai: 1.5 },
      { id: 'market', label: 'Open energy markets', desc: 'Introduces the Open Energy Market Act.', effect: (s) => bill(s, 'energy_market') },
      { id: 'defer', label: 'Defer the decision', desc: 'Collector owners keep their revenue for now.', effect: () => {} },
    ],
  },
  {
    id: 'self_replication_debate', category: 'politics', once: true, deadlineDays: 200,
    trigger: (s) => (known(s, 'partial_self_replication') ? {} : null),
    title: () => 'The Replicator Question',
    text: () => 'Factories that build most of their own components are running on the Moon and in the Belt. Fully self-replicating industry would grow exponentially, bounded only by rock and sunlight. It could also grow beyond anyone\'s control.',
    options: () => [
      { id: 'open', label: 'Open replication under resource caps', desc: 'Introduces the Open Replication Act.', effect: (s) => bill(s, 'replication_open'), ai: 1.5 },
      { id: 'moratorium', label: 'Impose a moratorium', desc: 'Introduces the Self-Replication Moratorium.', effect: (s) => bill(s, 'replication_ban') },
      { id: 'license', label: 'License case by case (default)', desc: 'Replication proceeds at a cautious rate.', effect: () => {} },
    ],
  },
  // ------------------------------------------------------------ Security
  {
    id: 'asteroid_threat', category: 'security', cooldownDays: 60, deadlineDays: 60, pause: true,
    trigger: (s) => { const t = s.security.threats.find((x) => x.status === 'tracking' && x.probability > 0.02 && !(x as any).briefed); return t ? { threat: t.id } : null; },
    title: (s, c) => `Impact Threat: ${s.security.threats.find((t) => t.id === c.threat)?.name}`,
    text: (s, c) => { const t = s.security.threats.find((x) => x.id === c.threat)!; (t as any).briefed = true; return `Planetary Defense Command briefs the Executive Council. Object ${t.name}, about ${t.diameterM.toFixed(0)} m across, has a ${fmtPct(t.probability)} chance of striking ${s.nations[t.region]?.name ?? 'Earth'} on ${formatDate(t.impactDay)}.\n\n${t.diameterM > 400 ? 'An impact would devastate a continent.' : t.diameterM > 140 ? 'An impact would destroy a region.' : 'An impact would destroy a city.'} Missions launched earlier have better odds.`; },
    options: (s, c) => {
      const opts = deflectionOptions(s, c.threat);
      return [
        ...opts.map((o) => ({ id: o.method, label: `Launch ${o.label.toLowerCase()} (${fmtPct(o.chance, 0)})`, desc: `Cost ${fmtMoney(o.cost)}.`, available: () => (o.available ? null : o.reason ?? 'Unavailable'), effect: (s2: GameState, c2: any) => { launchDeflection(s2, c2.threat, o.method); }, ai: o.available ? 1 + o.chance : 0 })),
        { id: 'wait', label: 'Keep tracking', desc: 'Better orbital data may rule it out. Waiting shortens the lead time for any mission.', effect: () => {}, ai: 0.5 },
      ];
    },
  },
  {
    id: 'piracy', category: 'security', cooldownDays: 700, deadlineDays: 60,
    trigger: (s) => { const reg = Object.keys(s.security.piracy).sort().find((r) => s.security.piracy[r] > 0.01); return reg ? { region: reg } : null; },
    title: () => 'Piracy on the Freight Lanes',
    text: (s, c) => `Hijackings and cargo theft are rising along the ${c.region} freight lanes. Insurers are pricing whole routes out of business.`,
    options: () => [
      { id: 'forces', label: 'Deploy UNE Security Forces', desc: 'Requires the UNE Security Forces.', available: (s) => (s.une.institutions.securityForces?.active ? null : 'Requires UNE Security Forces'), effect: (s, c) => { s.security.piracy[c.region] *= 0.4; s.une.funding.securityForces = (s.une.funding.securityForces ?? 0) * 1.2; }, ai: 2 },
      { id: 'create', label: 'Create a federal security service', desc: 'Introduces the UNE Security Forces Act.', available: (s) => (s.laws.security_forces ? 'Already in force' : null), effect: (s) => bill(s, 'security_forces'), ai: 1.5 },
      { id: 'local', label: 'Fund local security stations', desc: 'Security stations are built in affected settlements.', effect: (s, c) => { for (const st of settlementList(s)) if (regionOf(st) === c.region && popOf(st) > 1000) { queueConstruction(s, st, 'securityStation', 'une', 1); debit(s, 'une', FACILITY.securityStation.buildCost, 'Construction'); } } },
    ],
  },
  {
    id: 'sabotage', category: 'security', cooldownDays: 1500, deadlineDays: 45,
    trigger: (s) => { const st = find(s, (x) => facilityCount(x, 'shipyard') + facilityCount(x, 'massDriver') > 0); return st && s.security.tension > 0.4 ? { st: st.id } : null; },
    chance: (s) => s.security.tension * 0.03,
    title: (s, c) => `Sabotage at ${s.settlements[c.st]?.name}`,
    text: (s, c) => `Explosions have damaged critical infrastructure at ${s.settlements[c.st]?.name}. Investigators suspect a separatist cell, or a state that wants to be mistaken for one.`,
    options: () => [
      { id: 'investigate', label: 'Launch a UNE investigation', desc: 'Finds the culprits and improves security.', effect: (s, c) => { const st = s.settlements[c.st]; if (st) for (const f of st.facilities) if (f.type === 'shipyard' || f.type === 'massDriver') f.condition *= 0.7; debit(s, 'une', 1e9, 'Security'); }, ai: 2 },
      { id: 'crackdown', label: 'Crack down on dissent', desc: 'Fast and heavy-handed.', effect: (s, c) => { const st = s.settlements[c.st]; if (st) { for (const f of st.facilities) if (f.type === 'shipyard' || f.type === 'massDriver') f.condition *= 0.7; st.politics.grievances += 0.3; } } },
    ],
  },
  {
    id: 'war_mediation', category: 'security', cooldownDays: 365, deadlineDays: 45, pause: true,
    trigger: (s) => (s.security.wars.length > 0 ? { war: s.security.wars[0].id } : null),
    title: () => 'War on Earth',
    text: (s, c) => { const w = s.security.wars.find((x) => x.id === c.war); return w ? `Fighting continues between ${s.nations[w.a].name} and ${s.nations[w.b].name}. Orbital debris is spreading, and member states demand that the UNE act.` : 'A war rages.'; },
    options: () => [
      { id: 'mediate', label: 'Lead peace talks', desc: 'Spend 30 political capital. Success depends on legitimacy.', available: (s) => (s.une.politicalCapital < 30 ? 'Needs 30 political capital' : null), effect: (s, c) => { s.une.politicalCapital -= 30; const w = s.security.wars.find((x) => x.id === c.war); if (w) w.intensity -= 0.3 * (s.une.metrics.legitimacy ?? 0.5) * 2; }, ai: 2 },
      { id: 'sanctions', label: 'Impose UNE sanctions on both', desc: 'Costly for everyone.', effect: (s, c) => { const w = s.security.wars.find((x) => x.id === c.war); if (w) { w.intensity -= 0.15; nationSupport(s, w.a, -0.1); nationSupport(s, w.b, -0.1); } } },
      { id: 'stay', label: 'Stay neutral', desc: 'The Security Bloc gains support.', effect: (s) => factionBoost(s, 'security', 1.1) },
    ],
  },
];

function rename(s: GameState, name: string, short: string): void {
  const old = s.une.name;
  s.une.name = name;
  s.une.short = short;
  s.une.renamedDay = s.day;
  s.events.flags.renamePending = false;
  addHistory(s, `The ${old} becomes the ${name}`, `Under the Solar Compact, the Union takes a new name: the ${name} (${short}). The name reflects a civilization that now spans many worlds.`, 'constitution', 5);
}

// Lazy requires to avoid import cycles at module evaluation time
import { techCost, TECH } from './techs';
import { spawnCorporation } from '../systems/corporations';
import { foundSettlement } from '../systems/colonies';
function require_cost(id: string): number {
  return TECH[id] ? techCost(TECH[id]) : 0;
}
function require_spawn(s: GameState, sector: string, name: string, focus: string[]) {
  return spawnCorporation(s, sector, name, focus);
}

void earthPopulation;
void pick;
void chance;
void credit;
void addFacility;
