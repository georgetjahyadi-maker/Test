# HELIOS: DAWN OF A NEW ERA — Development Plan

This plan turns the design blueprint (sections 1–132) into a buildable sequence of work.
It covers technical architecture, core simulation models, content pipeline, a phased
roadmap with exit criteria, testing strategy, and the main risks.

The guiding rule comes from blueprint §122: **build playable vertical slices, never the
whole vision at once.** Every phase must end with something that can be played start to
finish, saved, reloaded, and explained.

---

## 1. Planning Principles

1. **Simulation first, headless first.** The simulation is a pure TypeScript library
   that runs in Node with no browser. It can be tested, fast-forwarded 200 years in CI,
   and balanced by scripts before any art exists.
2. **Explainability is infrastructure, not a UI feature.** Every derived number is
   computed as a *breakdown* of named contributions from day one (§95, §130). Retrofitting
   this later is close to impossible.
3. **Natural constraints over caps.** No `MAX_COLLECTORS`. Limits come from stocks,
   flows, capacity, energy, labor, capital, and politics (§121). Constants we do need
   (physical ones, recipe coefficients) live in data files.
4. **Aggregation is the scaling strategy.** Populations are always statistical; ships
   become fleets; collectors become cohorts; identical facilities merge (§115). The
   data model must support both "one of" and "N of" from the start.
5. **Data-driven content.** Resources, components, technologies, nations, factions,
   events, laws, and competencies live in validated data files, not in code (§117–118).
   Our own content is authored the way mods will be.
6. **Deterministic simulation.** Seeded random streams, a fixed tick, stable iteration
   order (§116).
7. **Visuals derive from state.** Ships, colonies, and the swarm are generated from
   simulation data (§50, §89, §129). No hand-drawn art that can fall out of sync.

---

## 2. Technology Stack

| Concern | Choice | Reason |
|---|---|---|
| Language | TypeScript (strict) | Blueprint §109; shared types across worker/UI |
| Build | Vite | Fast dev loop, native worker bundling |
| UI panels | React 19 | Data-dense panels, tables, forms |
| UI state | Zustand | Small, works outside React (renderer can read it) |
| Rendering | PixiJS v8 (WebGL/WebGPU) | 2D pixel art at scale, batching, render textures |
| Charts | A light chart layer (e.g. uPlot for time series, custom SVG for Sankey/pyramids) | Performance with long time series |
| Worker RPC | Comlink | Typed calls into the simulation worker |
| Persistence | IndexedDB via `idb` | Large saves, multiple slots |
| Compression | `fflate` | Compress saves before storage/export |
| Content validation | `zod` schemas | Validate data files and mods at load time |
| Unit/sim tests | Vitest | Runs the headless simulation in Node |
| E2E tests | Playwright (pre-installed Chromium) | UI smoke tests, screenshot checks |
| Lint/format | ESLint (with import-boundary rules) + Prettier | Enforce sim/render/UI separation |

No backend in phases 0–5. Cloud saves, multiplayer, and a mod workshop are optional later
additions (§109).

---

## 3. Repository Layout

A single Vite app with enforced module boundaries. (It can be split into packages later
if needed; the boundaries are what matter now.)

```
/src
  /sim                  # PURE simulation. No DOM, no Pixi, no React imports.
    /core               # ids, rng, time, scheduler, breakdown, state container
    /systems            # one file per system (see §5)
      astronomy.ts
      orbitalMechanics.ts
      resources.ts
      industry.ts
      energy.ts
      economy.ts
      logistics.ts
      population.ts
      colonies.ts
      nations.ts
      corporations.ts
      politics.ts
      federalism.ts
      research.ts
      engineering.ts
      security.ts
      events.ts
      dyson.ts
      history.ts
      statistics.ts
    /commands           # player/AI intents -> validated state changes
    /ai                 # nation, corporation, faction decision-making
    index.ts            # createGame(seed, scenario), step(), applyCommand()
  /worker               # Web Worker host: owns the sim, exposes Comlink API
  /render               # Pixi scenes; reads snapshots; no sim logic
    /solarSystem
    /ships              # procedural sprite pipeline
    /colonies
    /facilities
    /dyson
    /pixel              # palette, primitives, dithering, sprite atlas cache
  /ui                   # React panels
    /shell              # top bar, nav, time controls, alerts
    /politics /economy /engineering /research /colonies /history /stats ...
    /explain            # generic breakdown inspector used everywhere
  /save                 # serialization, versioned migrations, IndexedDB slots
/content                # data files (JSON/YAML), validated by zod schemas
  celestialBodies/ resources/ recipes/ components/ technologies/
  nations/ corporations/ factions/ institutions/ competencies/
  laws/ events/ scenarios/ governmentTypes/
/tools                  # headless runners, balance scripts, content linters
/tests                  # sim tests, golden-run tests, e2e
/docs
```

**Boundary rules (enforced by ESLint):**
- `sim/**` may import only `sim/**` and content types.
- `render/**` and `ui/**` may import sim *types* and read-only selectors, never mutate state.
- All state changes go through `commands/`, which the worker executes.

---

## 4. Engine Architecture

### 4.1 Three kinds of state (§110)

| State | Owner | Contents |
|---|---|---|
| **Simulation state** | Worker | The universe: entities, stocks, laws, history. Serializable. |
| **Render state** | Main thread | Camera, zoom level, sprite caches, interpolated positions. |
| **UI state** | Main thread | Open panels, selections, filters, map mode. |

### 4.2 Simulation state shape

Normalized tables keyed by stable string IDs, plain JSON-serializable objects:

```ts
interface SimState {
  version: number;
  seed: string;
  date: SimDate;                 // integer days since 2048-01-01
  rng: RngStreams;               // named stream states
  bodies: Table<CelestialBody>;
  nations: Table<Nation>;
  institutions: Table<UNEInstitution>;
  competencies: Table<ConstitutionalCompetency>;
  factions: Table<PoliticalFaction>;
  corporations: Table<Corporation>;
  settlements: Table<Settlement>;
  facilities: Table<FacilityGroup>;   // count-aware: { type, count, condition, owner }
  deposits: Table<ResourceDeposit>;
  stockpiles: Table<Stockpile>;       // per node: resource -> tonnes
  vehicleDesigns: Table<VehicleDesign>;
  fleets: Table<Fleet>;               // a single ship is a fleet of 1
  routes: Table<LogisticsRoute>;
  contracts: Table<FreightContract>;
  technologies: Table<TechState>;
  laws: Table<Law>;
  treaties: Table<Treaty>;
  characters: Table<Character>;
  swarmDesigns: Table<SwarmDesign>;
  swarmCohorts: Table<SwarmCohort>;
  pendingDecisions: Table<Decision>;
  history: HistoryLog;
  stats: StatsArchive;
}
```

Iteration always goes in sorted-ID order so results are deterministic.

### 4.3 Time and scheduling (§97, §113)

- The base tick is **one simulated day**. Faster speeds run more days per real second.
- A scheduler runs systems at their cadence:

| Cadence | Systems |
|---|---|
| Daily | orbital positions (analytic), logistics movement, fleet transit, stockpile consumption, emergency checks |
| Weekly | markets and prices, corporation operations, contract bidding |
| Monthly | politics, factions, population, research, industry output reconciliation, event rolls, Dyson aggregates |
| Quarterly | budgets, elections calendar, nation AI strategy review |
| Annual | demography (ageing, cohorts), culture drift, big statistics snapshot |

- **Auto-pause:** any system can raise a `Decision`. If the player has auto-pause on for
  that category, the worker stops advancing and notifies the UI.
- Time speeds: Pause / Day / Week / Month / Quarter / Year. At Year speed the worker runs
  as fast as it can while still yielding snapshots to the UI.

### 4.4 Worker ↔ main thread protocol (§114)

- The worker owns `SimState` and runs the scheduler loop.
- The main thread sends **commands** (`{ type: 'ProposeBill', ... }`) and **queries**
  (`explain(metricRef)`, `getTimeSeries(ids, range)`).
- The worker publishes a **snapshot** at most ~10 times per second: date, top-bar
  metrics, alerts, and a *dirty-set* of changed entity IDs. The UI fetches details for
  what is on screen only.
- Orbital positions are computed analytically from orbital elements and the date, so the
  renderer computes them itself at 60 FPS and interpolates between days. No position
  streaming needed.

### 4.5 Determinism (§116)

- PRNG: a small, fast, seedable generator (e.g. sfc32 or xoshiro128\*\*) with **named
  streams** (`events`, `politics`, `corporations`, `discovery`, ...). Adding a new random
  call in one system does not shift results in another.
- Forbidden in `sim/`: `Math.random`, `Date.now`, `performance.now`, unordered object
  iteration for logic. Enforced by lint rule.
- Scope: determinism is guaranteed for the same build on the same JS engine. Saves store
  full state (not replays), so small cross-engine float differences do not break saves.
- A **golden-run test** runs a fixed seed for N years and compares a hash of key outputs.

### 4.6 The Breakdown primitive (explainability)

Every important metric is produced as a `Breakdown`, not a bare number:

```ts
interface Breakdown {
  total: number;
  unit: string;                   // "t/yr", "W", "%", "UNE credits"
  parts: { label: string; value: number; source: EntityRef | RuleRef }[];
  trend?: number;                 // e.g. annual % change, from StatsArchive
}
```

- Systems compute breakdowns during their tick and keep only the latest one per metric.
- The UI's generic **Explain inspector** can open any breakdown, and click through to the
  source entity or rule. This one component gives us §95 everywhere.
- Events and decisions record `causes: EntityRef[]` so the History screen can answer
  "why did this happen?" (§108).

### 4.7 Commands

- All mutations from the player and from AI actors are commands with a validator and an
  apply function. The validator returns a reason when a command is illegal
  ("Insufficient UNE competency: Direct taxation is *Limited*").
- AI actors use the same commands as the player. This keeps rules consistent and makes
  the AI debuggable.

---

## 5. Core Simulation Models

These are the first-pass models. Each is deliberately simple and replaceable, but the
*interfaces* are designed to hold the later, richer versions.

### 5.1 Astronomy and orbital mechanics (§41–45)

- Bodies carry Keplerian elements (a, e, i, Ω, ω, M₀ at epoch). Position = solve
  Kepler's equation (Newton iteration) from the date. Moons are relative to their parent.
  Positions are drawn on a 2D ecliptic projection.
- Solar flux: `F = 1361 W/m² × (1 AU / r)²`.
- Transfers: Hohmann Δv and transit time from patched conics; transfer windows from
  synodic period and phase angle. A **porkchop-lite** grid search (departure date ×
  flight time using a Lambert solver) is added in Phase 2 for Mars.
- A static **Δv map** between nodes (LEO, GEO, EML1, LLO, lunar surface, ...) covers
  cislunar space in Phase 1. Interplanetary legs are computed on demand.
- Light-time delay = distance / c, available to politics and security systems.

### 5.2 Resources, stockpiles, and industry (§32–37)

- **Nodes:** every place that can hold stuff (a settlement, a depot, an orbit, a ship).
- **Stockpiles:** `node × resource → tonnes`.
- **Recipes (processes):** data-defined transformations, e.g.

  ```yaml
  id: regolith_oxygen_extraction
  inputs:   { regolith: 1000 }       # tonnes
  outputs:  { oxygen: 40, iron: 25, silicon: 20, slag: 915 }
  energy_mwh: 110
  labor:    { technicians: 0.2, industrial_workers: 0.5 }  # person-years
  capacity_type: bulk_refining
  requires_tech: [molten_regolith_electrolysis]
  ```

- **Facilities** provide a capacity type (mining, bulk refining, electronics, ...) and run
  recipes up to their capacity, limited by inputs, energy, labor, and condition. The
  shortfall is recorded as a breakdown ("Output 62%: limited by energy (38% short)").
- **Industrial Closure Ratio** (§37): for each settlement, the share (by value) of the
  inputs needed to build and maintain its own facilities that can be produced locally.
  It comes from the recipe graph, so it rises only when real local capacity exists.
- **Deposits** have estimated vs. true reserve, grade, difficulty, and required tech.
  Exploration narrows the estimate (§34).

### 5.3 Energy (§40–42)

- Per grid (a settlement or linked network): generation by source, storage, demand, and
  losses. When demand exceeds supply, loads shed by priority: life support first, then
  industry.
- Solar output scales with local flux. Thermal limits: facilities and ship designs have a
  waste-heat term, with radiator area from Stefan–Boltzmann
  (`A = Q / (ε σ (T⁴ − T_env⁴))`).

### 5.4 Economy and markets (§32)

- Market regions (Earth, cislunar, later Mars, Belt, ...) with a price per tradeable
  resource.
- **Weekly price update** by bounded tatonnement: price moves with the ratio of demand
  to supply, then is dampened. Transport cost links regional prices.
- Actors (nations, corporations, settlements, the UNE) hold cash and debt, and make
  buy/sell/invest decisions from prices.
- GDP is modeled at the nation level (aggregate growth model driven by energy,
  industrial capacity, and research, plus a space-sector share that the simulation
  computes directly).

### 5.5 Logistics (§46–47)

- **Routes:** origin, destination, cargo manifest, assigned fleet, schedule, and cost.
  Recurring routes repeat automatically.
- A trip consumes propellant according to the ship design's Δv budget for that leg. The
  propellant must actually exist at the departure node, so depots matter.
- **Freight contracts:** posted by any actor. Corporations bid weekly based on their
  fleet, cost, and margin. The UNE can assign its own fleet, subsidize, or tender.
- Reliability: per-trip failure chance from design reliability and maintenance state.

### 5.6 Population (§25–28)

- Statistical **cohorts** per settlement: age band × occupation × cultural identity.
  Five-year age bands are enough.
- Monthly: births, deaths, migration flows (a gravity-style model driven by wages,
  housing, safety, and policy), and job matching to facility labor demand.
- Wellbeing inputs (food, housing, healthcare, radiation dose, gravity, isolation) feed
  health, productivity, and political sentiment.
- Gravity biology (§28): low-gravity residence accumulates a physiology debt, reduced by
  countermeasures (centrifuges, medicine). Low-gravity births are tracked separately
  from Phase 2, since they drive the citizenship and identity storylines.

### 5.7 Settlements and life support (§53–57)

- Settlement tier comes from population (Outpost → Planetary society).
- Life-support loops for water, oxygen, and food use recycling efficiencies from
  installed technology. Net import demand becomes logistics demand automatically.
- **Days of reserve** for each critical resource is always computed and shown. This is
  the main input to systemic emergencies (§69).

### 5.8 Politics and federalism (§4–24)

**Competency table.** The core of UNE authority is the data-driven competency list:

```yaml
- id: planetary_defense
  level: exclusive          # exclusive | shared | limited | national
  unlocks: [cmd_fund_pdc, cmd_emergency_deflection]
- id: direct_taxation
  level: limited
  unlocks: []               # grows when reformed
```

Commands check competency levels. A constitutional amendment changes the level, and
that changes which commands are legal. Reform has real mechanical effects (§12).

**Legislature.**
- *Chamber of Nations:* one delegation per member (with weighting rules from data).
- *Assembly of Humanity:* seats apportioned by population with a floor and ceiling
  (degressive proportionality).
- Bills have a policy area, and the area decides the threshold (simple / qualified /
  super / unanimous) in each chamber.
- **Vote model:** each delegation or seat bloc supports a bill with probability based on
  (faction ideology · bill effects) + national interest + public opinion + deals made. The UI
  shows a projected whip count with reasons *before* the vote. The player can trade
  concessions (amendments, funding promises, carve-outs).

**Factions (§18).** Each faction has a position vector over a small set of axes
(federal ↔ sovereign, expansion ↔ preservation, market ↔ public, augmentation ↔
preservation of human baseline, AI integration, security, colonial autonomy). Support per
constituency moves monthly in response to conditions. Splits happen when internal
variance gets too high; merges happen when two factions are close and both are weak.

**Legitimacy metrics (§13).** Federal legitimacy, state support, citizen support,
institutional trust, etc., each as a breakdown. Legitimacy changes the probability that
states comply with UNE law and changes UNE borrowing costs.

**Executive and elections (§8, §19).** The Secretary-General and Executive Council are
characters with ideology and skills. Elections run on the constitutional calendar. A new
SG changes which policies the executive will propose and how easy votes are. The player
is the institution, so the player keeps control, but a hostile government raises the
cost of acting.

**Constitutional crises and emergency powers (§20–21).** Crises are triggered by
systemic conditions (e.g. a member state rejects a law while legitimacy is below a
threshold). They are presented as decisions whose options change competencies, laws,
or institutions. Emergency powers are temporary competency upgrades with an expiry. The
player may try to extend them, at a legitimacy cost.

**Off-world status ladder (§22).** Each settlement has a political status. Promotion or
secession pressure comes from population, closure ratio, light-time delay, cultural
divergence, and grievances.

### 5.9 Nations and corporations as AI actors (§10–11, §29–31)

- **Nations:** utility-based AI with weights that drift with government and public
  opinion. Each quarter they choose from actions: fund programs, bid for UNE projects,
  lobby, comply or resist, invest, and negotiate treaties.
- **Corporations:** a simple firm model. They evaluate expected ROI on candidate
  projects (mines, fleets, contracts, research) with their cost of capital, and take the
  best ones they can finance. Ownership type changes their objective (a cooperative
  weighs employment, a state enterprise weighs national goals).
- Both use the same command API as the player.

### 5.10 Research (§58–61)

- A **technology graph** where techs unlock things: components, recipes, facility types,
  life-support efficiencies, laws, and project types. Avoid flat +X% bonuses (§59).
- Research actors (UNE labs, national labs, corporations, universities) put funding and
  scientists into projects. Progress is stochastic around an expected cost.
- Knowledge has an access state (public, proprietary, classified, licensed). Who can
  *use* a tech depends on it, and the IP policy commands (§61) change it.

### 5.11 Engineering: ship designer (§48–51)

- A design is a list of components with counts and attachment slots. Each component
  comes from data: mass, cost, power produced/used, heat, thrust, Isp, volume, crew,
  reliability, and complexity.
- The **stats calculator** is pure and shared by the UI and the simulation:
  - Δv = Isp · g₀ · ln(m_wet / m_dry) (per stage)
  - Thrust-to-weight, acceleration, power balance, waste heat vs. radiator capacity,
    crew endurance from life-support mass, cargo volume
  - Reliability = product of component reliabilities with redundancy
  - Build cost and a manufacturing requirement per capacity type
- **Validation reports physical failure**, not penalties: "Power deficit 1.2 MW",
  "Radiators reject 3.1 MW of 4.4 MW waste heat", "Cannot reach LLO: Δv 3.1 of 3.9 km/s".
- A **mission check** tests the design against a planned route using the Δv map.

### 5.12 Events (§68–69)

- Events are data: trigger conditions (expressions over state), weight, cooldown,
  options, and effects. Two kinds share one engine:
  - **Systemic:** conditions like `food_self_sufficiency < 0.4 && imports_disrupted &&
    reserve_days < 30` raise the hazard rate.
  - **Authored:** story beats gated by conditions and dates (the lunar ice dispute,
    §103).
- A small, safe **condition DSL** (parsed expressions over whitelisted selectors) keeps
  events moddable without running arbitrary code.
- Tutorial beats are events (§104), not popups.

### 5.13 History and statistics (§72, §120)

- **History log:** significant events with date, title, description, involved entities,
  and `causes` links. A significance score decides whether an entry shows in the
  summary timeline.
- **Stats archive:** time series at multiple resolutions (monthly for the last 20 years,
  annual beyond that) to keep saves small over centuries.

### 5.14 Dyson swarm (§76–84) — designed now, built in Phase 5

- `SwarmDesign` has the parameters in §77. A pure calculator gives mass, power, heat,
  equilibrium temperature at the design radius, and lifetime.
- `SwarmCohort`: `{ designId, count, orbitBand, meanAge, failureRate, powerOutput }`.
  Production adds to cohorts, attrition removes from them, and replacement is logistics
  demand. Cost is O(cohorts), not O(collectors).
- Kardashev-style readouts come from total power and captured luminosity.

---

## 6. Rendering and Procedural Art

### 6.1 Pixel pipeline (§50–51, §86–89)

- Render the game world into a **low-resolution render texture** (e.g. 480×270 or
  640×360) with nearest-neighbour upscaling to integer multiples. UI text stays at native
  resolution for legibility (§87).
- A fixed, curated **palette** (about 32–64 colors) plus a set of functional color ramps
  (§88: blue politics, green life, orange industry, yellow energy, purple science, red
  security). Provide a colorblind-safe alternative palette and always pair color with an
  icon or pattern.
- **Procedural ship sprites:**
  `VehicleDesign → layout solver → primitive shapes → pixel raster → palette → texture`.
  - The layout solver places components along a spine (thrust axis): engines at the aft,
    tanks and reactors in the middle, habitats and command forward. Radiators extend
    sideways as paired fins, and solar panels as wings.
  - Each component type has a small generator (tank = capsule with bands, radiator =
    ribbed panel, etc.) sized from its real volume or area.
  - Seeded by the design hash, so the same design always produces the same sprite.
    Textures are cached by hash in an atlas.
- **Procedural settlements:** a tile grid per settlement. Each facility group places its
  structures (pits, conveyors, tanks, domes, towers) based on its type and count. The
  view grows as the settlement grows (§90, §129).
- **Swarm rendering:** cohorts are drawn as particle streams on their orbital bands.
  Particle density maps to log(count), so a trillion collectors looks different from a
  million.

### 6.2 Zoom levels (§93)

Solar System → Planetary System → Orbital Space → Settlement → Facility → Blueprint.
Each level is its own Pixi scene with a shared camera controller. Moving between levels
fades from one scene to the next.

### 6.3 Map modes (§92)

Overlays are shader tints or icon layers that read the same data as the panels:
political, jurisdiction, population, industry, resources, energy, trade, transport,
science, military, communications, migration, Dyson.

---

## 7. UI Plan

- **Shell (§94):** top bar (date, treasury, legitimacy, population, energy, research,
  industrial output, alerts), left navigation, time controls, and an alert/decision queue.
- **Panels:** each nav item is a React route. Tables are virtualized for large lists.
- **Explain everywhere:** any number with a breakdown is clickable and opens the Explain
  inspector (§95, §130).
- **Decision modal:** used for events and crises. Shows options, projected consequences
  as breakdown deltas, and which constituencies support or oppose each option.
- **Charts (§96):** line/area series from the stats archive, Sankey for resource flows,
  population pyramids, a parliament hemicycle for chamber composition, and ownership
  treemaps.
- **Accessibility:** scalable UI text, keyboard navigation for the core loop,
  colorblind palette, reduced-motion option.

---

## 8. Save System (§119)

- Saves are the full `SimState` serialized to JSON, compressed with fflate, and stored in
  IndexedDB. Time series use typed arrays to save space.
- Every save carries `version`. A **migration chain** (`v1 → v2 → ...`) runs on load. Each
  migration comes with a test fixture save.
- Autosave on a rotating set of slots (e.g. every in-game year and before major
  decisions). Manual saves and import/export as a `.helios` file.
- Target: a 300-year save stays under ~20 MB compressed (enabled by aggregation and
  multi-resolution stats).

---

## 9. Content Pipeline (§117–118)

- All content in `/content` as JSON/YAML, validated by zod schemas at build time (CI
  fails on invalid content) and at runtime (for mods).
- Content IDs are namespaced (`core:lunar_ice`, `mymod:helium3`) so mods cannot collide.
- A **mod manifest** lists files to add or override. Load order is explicit.
- Tooling: a content linter that finds broken references (a recipe using an unknown
  resource, a tech unlocking a missing component) and a graph report (the tech tree and
  recipe graph as generated diagrams).

---

## 10. Testing and Balancing Strategy

| Layer | What we test |
|---|---|
| Unit | Kepler solver, Δv and rocket equation, radiator sizing, price updates, vote math |
| System | Each system with a hand-built mini state (e.g. "a lunar base with 20 days of O₂ and a broken route triggers an emergency") |
| Golden runs | Fixed seed → 50/100/200 years headless → hash plus key metrics within tolerance |
| Invariants | Mass conservation in recipes and logistics; no negative stockpiles; population ≥ 0; budget identities balance |
| Balance harness | A scripted "autoplayer" policy runs many seeds headless; reports when milestones are reached (lunar base, Mars, closure 80%, ...) as distributions |
| E2E | Playwright: start new game, advance time, propose a bill, design a ship, save, reload |
| Performance | Budget per simulated year at each era's scale; fail CI on large regressions |

The balance harness is how we confirm §105's era dates emerge from the simulation rather
than being scripted.

---

## 11. Phased Roadmap

Each phase ends with a playable build and explicit exit criteria. Timings are rough
guesses for a small team (2–4 people) and mainly show relative size.

### Phase 0 — Technical Prototype (§123) · ~2–3 months

**Goal:** prove the architecture end to end.

Milestones:
1. **Project skeleton:** Vite + TS + React + Pixi, lint boundaries, Vitest, Playwright,
   CI.
2. **Sim core:** SimDate, scheduler, seeded RNG streams, state tables, commands,
   Breakdown type, headless runner (`tools/run.ts --years 50 --seed abc`).
3. **Worker host:** Comlink API, snapshot publishing, time controls
   (pause → year speed).
4. **Earth–Moon orbital model:** Kepler propagation, 2D solar and cislunar views,
   zoom between them, pixel render texture and palette.
5. **Toy economy:** 4 resources, 2 recipes, 1 facility type, 1 market price, 1 route.
6. **Save/load:** IndexedDB slots, export/import, `version` plus a first migration test.
7. **Procedural ship sprite v0:** tank, engine, radiator, and habitat generators
   from a design.
8. **Explain inspector v0:** click a number and see its breakdown.

**Exit criteria**
- Run 100 simulated years headless in under a few seconds. Same seed gives the same hash.
- In the browser: time runs at all speeds with a steady 60 FPS UI, Moon orbits
  correctly, save → reload → identical state hash.
- A ship design changes on screen when a component is added.

### Phase 1 — Earth–Moon Vertical Slice (§124) · ~6–9 months

**Goal:** a complete, playable 2048–~2075 campaign whose central question is *"Can we
afford — and sustain — a permanent Moon base?"*

Content scope (deliberately small):
- **~8 Earth blocs/states** as AI nations (fictional-but-plausible configurations of
  real regions), each with the §11 attributes.
- **UNE institutions:** Secretariat, Chamber of Nations, Assembly of Humanity, Compact
  Court (simple rulings), Solar Development Authority, Planetary Defense Command,
  Orbital Safety Authority, Development Bank.
- **Competency table** with the starting levels from §12. At least **5 amendable
  competencies** with real mechanical effects (e.g. direct taxation, space-resource
  royalties, lunar territorial administration).
- **~8 factions**, **3 corporations** (e.g. a launch provider, a lunar mining firm, a
  habitat builder) with different ownership types.
- **Nodes:** Earth surface, LEO, GEO, EML1, low lunar orbit, lunar south pole, one
  lunar equatorial site.
- **~15 resources**, **~25 recipes** (ice mining, water electrolysis, regolith oxygen,
  propellant production, habitat assembly, ...), **~10 facility types**.
- **Ship designer** with **~30 components** (chemical and methalox engines, early
  nuclear thermal, tanks, solar, fission, radiators, habitats, cargo, docking).
- **Budget:** member assessments, orbital licensing, royalties; UNE bonds with interest
  that depends on legitimacy.
- **Legislature:** bills, thresholds by area, projected whip counts, concessions.
- **Elections** for the Assembly and SG on a calendar.
- **~40 events:** the authored lunar ice dispute (§103), lunar oxygen emergency,
  budget crisis, launch accident, and first asteroid alert (tutorial through events,
  §104), plus systemic ones (shortages, strikes, debris collisions, solar flares,
  corruption scandals).
- **Early objectives (§102)** shown as a goals panel, not a checklist that must be
  completed.
- **History screen** and **statistics** charts.

**Exit criteria**
- A new player can go from 2048 to a sustainable lunar settlement (food, O₂, water
  reserves stable without emergency imports for 5 years) without outside help, learning
  through events.
- Every top-bar number and every settlement metric can be explained.
- At least three meaningfully different outcomes happen across seeds (for example,
  corporate-led vs. UNE-led lunar industry, a strengthened vs. weakened UNE).
- Autoplayer: the lunar settlement milestone lands in a reasonable range (e.g. 2058–2070)
  across 100 seeds, and no system runs away to infinity or collapses to zero.
- Playtests: players can answer the four questions in §130 for any crisis they face.

### Phase 2 — Mars and Near-Earth Asteroids (§125) · ~6–9 months

- Interplanetary transfers, launch windows, a porkchop-lite planner, and light-time
  delay in the UI.
- Mars nodes (orbit, Phobos/Deimos hubs, 2–3 surface sites), NEA mining targets.
- Passenger transport and migration between worlds.
- Colonial culture (identity drift per settlement) and gravity biology.
- UNE citizenship debate as a constitutional storyline; the off-world status ladder
  (outpost → self-governing territory).
- Corporate competition: mergers, bankruptcies, lobbying, lawsuits.
- Interplanetary markets (a separate Mars price region linked by transport cost).
- Research deepens: IP policy commands, research actors beyond the UNE.
- **Exit:** a first Mars settlement emerges plausibly (autoplayer ~2080–2110), and a
  Martian representation or citizenship dispute can occur from the simulation.

### Phase 3 — The Belt and Large Habitats (§126) · ~6–9 months

- Belt region, Ceres and Vesta, more asteroid types.
- Rotating habitats (torus, cylinder) as settlement types with their own construction
  chains.
- Automation levels 0–4 (§38) changing labor demand and politics (Labor Coalition
  storylines).
- Advanced federalism: differentiated integration, courts ruling on competency
  disputes, the representation reform from §24.
- Fleet aggregation, and facility aggregation at scale.
- Hard-SF security v1 (§64–66): detection, trajectories, interceptors, piracy and
  sabotage. War is expensive and creates debris.
- **Exit:** a performance run with ~1,000 settlements and ~10⁴ fleets stays within
  budget. Off-world populations can cause a real constitutional reform.

### Phase 4 — Outer and Inner System (§127) · ~6–9 months

- Mercury, Venus (atmospheric habitats), Jupiter and Saturn systems.
- Mature fusion, automation levels 5–6, and self-replicating industry via the closure
  ratio reaching 99%+.
- Major political evolution: successor institutions, renaming by history (§24, §73),
  secession and associated states.
- Communication delay drives local autonomy and AI delegation mechanics.
- **Exit:** a campaign can reach 2250 with the UNE transformed, fragmented, or
  deepened, and all three stay playable.

### Phase 5 — Helios Era (§128) · ~6–9 months

- Dyson collector designer and cohort simulation.
- Mercury industrialization (mass drivers, solar smelters) and the preservation vs.
  disassembly decisions (§81–82).
- Solar energy economy and power-allocation politics (§83).
- Kardashev readouts, milestone screen (§106), and endless continuation.
- Solar-scale visualization of particle streams and the "final zoom-out" (§132).
- Music and sound by era (§98–99).
- **Exit:** a 500-year campaign runs within performance and save-size budgets, and the
  history archive tells a coherent causal story from 2048 to the swarm.

---

## 12. Cross-Cutting Workstreams

Run alongside the phases rather than as their own phase:

- **Content writing:** event text, institution descriptions, characters. Grows with
  each phase.
- **Audio:** interface tones and telemetry from Phase 1; music and ambience in Phases
  3–5.
- **UX research:** playtest every phase with players who have not seen the game. The
  measure is §130: can they tell what is happening and why?
- **Performance:** profiling budgets per era, checked in CI.
- **Modding:** keep our own content in the mod format. Publish mod docs once Phase 2's
  schemas stabilize.

---

## 13. Key Risks and Mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Scope explosion** | The blueprint is enormous | Strict vertical slices; each phase ships a playable campaign; defer ideas to later phases |
| **Opaque simulation** | Players cannot see why things happen, so choices feel random | Breakdown primitive from Phase 0; cause links in history; Explain inspector everywhere |
| **Political sim feels arbitrary** | Votes and faction swings need to feel earned | Show projected whip counts with reasons before votes; keep faction axes few and legible |
| **Runaway or dead economy** | Coupled feedback loops explode or collapse | Invariant tests, dampened price updates, balance harness across many seeds |
| **Performance at scale** | Centuries and trillions of machines | Aggregation built into the data model (counts everywhere); multi-resolution stats; profile per era |
| **Save bloat and migration pain** | 300+ year campaigns across versions | Versioned migrations with fixtures from Phase 0; compact time series |
| **Procedural art looks generic** | Code-driven sprites can look samey | Invest early in a small, strong primitive set and palette; art direction review each phase |
| **Sensitive real-world politics** | Real nations and ideologies | Use blocs and dynamic ideologies, avoid fixed stereotypes (§11, §27); present every system with trade-offs, no "correct" politics (§13, §74) |
| **Too much micromanagement** | The player might end up running every factory | The player sets policy; nations and corporations execute (§10). Automation of recurring routes and contracts |

---

## 14. Immediate Next Steps (first 4–6 weeks)

1. Scaffold the project (Vite, TS strict, React, Pixi, Vitest, Playwright, ESLint
   boundaries, CI).
2. Implement `sim/core`: `SimDate`, RNG streams, `Table<T>`, scheduler, command bus,
   `Breakdown`.
3. Write zod schemas for `celestialBodies`, `resources`, `recipes`, `components` and
   add the first data files (Sun, Earth, Moon; 4 resources; 2 recipes; 8 components).
4. Kepler propagation, with tests against known Moon ephemeris values (within game
   tolerance).
5. Headless runner plus the first golden-run test.
6. Worker host plus a minimal shell UI (date, speed controls, one Explain-able metric).
7. Pixi solar and cislunar views with a pixel render target and palette.
8. Ship stats calculator plus procedural sprite v0.
9. Save/load to IndexedDB with version 1 and a migration test harness.

---

## 15. Open Questions for the Team

1. **Team and timeline:** solo developer or a team? This changes the phase durations above.
2. **Real vs. fictional nations:** real named countries (with dynamic politics) or
   fictional blocs based on real regions? Fictional blocs lower sensitivity risk.
3. **Platform targets:** browser only, or also a desktop wrapper (Tauri/Electron) for
   Steam distribution?
4. **Starting scenario variants:** one 2048 start only, or also alternate starts (a weak
   Compact, a corporate-dominated orbit)?
5. **Art direction:** exact pixel resolution and palette size. A short art spike in
   Phase 0 should decide this.
