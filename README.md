# HELIOS: Dawn of a New Era

A browser-based hard-science-fiction grand strategy and civilization simulator. You lead
the United Nations of Earth from the 2048 Earth Compact, through the first lunar bases,
Mars and the asteroid belt, to a Dyson swarm around the Sun.

The UNE is an institution, not a ruler. Member states, corporations and colonies act on
their own. You set common policy: laws and constitutional reform, the federal budget, UNE
settlements and fleets, research, and the Helios collector program. Physics decides what
is possible, engineering decides what is practical, economics decides what gets built and
politics decides who decides.

- [Development plan](docs/DEVELOPMENT_PLAN.md): architecture, simulation models, phased
  roadmap and risks.

## Running it

Requires Node.js 20 or later.

```sh
npm install
npm run dev        # development server at http://localhost:5173
npm run build      # typecheck and production build into dist/
npm run preview    # serve the production build
npm test           # Vitest: determinism, invariants, physics, ship templates
npm run headless -- --years=150 --seed=helios --every=10 --verbose
```

`npm run headless` plays a campaign with the Secretariat in charge of every domain and
prints a summary every few years, the milestones reached, the union's final shape, the
runtime and the save size.

### Controls

- **Space** pauses and resumes. **1–5** set the speed (day, week, month, quarter, year
  per second).
- Underlined numbers open an explanation of how they were computed.
- Drag to pan and scroll to zoom on the map. Double-click a planet for its local system.
- The game autosaves every in-game year. **Game / Saves** holds save slots, export and
  import of `.helios` files, audio settings and a colour-blind palette.

## What is in the game

- **Orbital mechanics.** Kepler orbits for the planets and major moons, a patched-conic
  delta-v graph with launch windows, aerocapture and light delay.
- **Ship design.** 57 components across propulsion, tanks, power, thermal, habitation,
  shielding, cargo, navigation, communication, docking, aero and weapons. Every design is
  checked against the rocket equation, thrust-to-weight on each surface, power and waste
  heat, crew endurance and reliability. Routes are planned leg by leg with refuelling
  points, and ships are drawn procedurally from their components.
- **Industry and logistics.** 32 goods and 64 facility types, with mining from finite
  deposits, recipes, maintenance, power, labour and construction that waits for its
  materials. Routes carry freight and passengers under launch capacity, spaceport and
  propellant limits. Transfer hubs forward goods and travellers to surface bases, and
  regional markets price goods between import parity and export netback.
- **Population.** Age bands, births, deaths, migration, radiation, low-gravity health,
  education, wellbeing and local identity for every settlement.
- **Politics.** The Assembly of Humanity and the Chamber of Nations with whipped votes on
  58 laws and amendments, 15 factions, 15 member blocs, elections, legitimacy and
  federalism. Colonies move from outpost to territory, self-government, commonwealth,
  full membership or independence.
- **Actors.** Nations, 7 corporations and colonial governments plan, invest, found
  settlements and run their own fleets. The UNE Secretariat can take over any domain the
  player delegates.
- **Research.** 97 technologies in tiers, funded by the UNE, member states, corporations,
  settlement laboratories and, late on, swarm computing.
- **Security.** Asteroid threats and deflection, orbital debris and the Kessler risk,
  piracy, patrol fleets, war and AI risk.
- **The Helios swarm.** A collector designer (radius, area, cells, structure, radiators,
  station-keeping, transmission and computing), cohort ageing and failure, power beamed
  to Earth and colonies, the Solar Energy Trust and self-replicating industry.
- **History.** About 50 authored and systemic events with choices, 21 milestones, a
  chronicle of the campaign by era, and a long-term statistics archive.

## Architecture

```
src/sim       Pure TypeScript simulation: no DOM, no rendering, runs in Node or a worker
  core        RNG streams, calendar, breakdowns (explanations), formatting
  content     Data: goods, facilities, components, templates, techs, laws, events, actors
  physics     Orbits, delta-v graph, ship engineering, collector physics
  systems     Settlements, logistics, markets, politics, legislature, research, security,
              Dyson swarm, events, milestones, statistics
  ai          Planner, actions and the actors (nations, corporations, colonial
              governments, the UNE Secretariat)
src/worker    The simulation worker: time control and state snapshots
src/client    Worker client and IndexedDB save storage (gzip)
src/render    Canvas 2D pixel rendering: solar map, planets, ships, colonies
src/ui        React panels
tests         Vitest suites
tools         Headless campaign runner
```

The simulation advances one day at a time, and settlement, logistics, market and
political systems run monthly, quarterly or yearly. All randomness comes from named sfc32
streams seeded from the world seed. Iteration order is always stable, so the same seed
and the same commands give the same history, and a loaded save continues exactly as the
original would have. The tests check both.

### Where the build differs from the development plan

The plan's technology choices were a starting point. The build uses lighter equivalents:

| Plan | Build | Why |
|---|---|---|
| PixiJS v8 | Canvas 2D with integer-scaled pixel buffers | The pixel style needs no GPU batching at current scene sizes, and it removes a dependency |
| Zustand | A small external store read through React's `useSyncExternalStore` | The UI only reads worker snapshots |
| Comlink | A typed `postMessage` protocol | Only a handful of message types |
| `idb` and `fflate` | IndexedDB directly and the browser's `CompressionStream` (gzip) | Built into modern browsers |
| `zod` content schemas | TypeScript-typed content modules | No mod loading yet, so compile-time checking is enough |
| uPlot charts | Small SVG charts | Yearly and monthly series are short |
| ESLint boundary rules | Not set up | The simulation imports nothing from `render` or `ui`, which is checked by review only |

The whole game ships in this one build, not as the plan's separate phased releases.

## Balance status

These results come from the headless autoplayer (every domain delegated, seed `helios`):

| Milestone | Year | Plan target |
|---|---|---|
| UNE Lunar Base | 2048 | |
| Cislunar Propellant Economy | 2050 | |
| Permanent Lunar Civilization | 2065 | 2058–2070 |
| First Asteroid Mine | 2079 | |
| Humans on Mars | 2084 | 2080–2110 |
| Beyond the Snow Line | 2110 | |
| First Light (first Helios collector) | 2148 | |
| Autonomous Industrial Civilization | 2163 | |
| One Million Beyond Earth | 2175 | |
| Million Dyson Collectors | 2190 | |

- Seeds `alpha`, `beta` and `gamma` put Permanent Lunar Civilization in 2066–2067 and
  Humans on Mars in 2080–2090. They pass a million people beyond Earth between 2145 and
  2185.
- The off-world population grows every decade: about 40,000 by 2087, 220,000 by 2107,
  1.2 million by 2187 and 15 million by 2297. There are no system-wide collapses, and UNE
  and colonial finances stay bounded.
- The Secretariat completes six grand projects by 2240: the planetary defense array,
  the Lunar Export Network, a launch loop, the solar gravitational lens telescope, an
  orbital ring and an interstellar probe. Launch prices fall from 150,000 to about 5,000
  credits a tonne.
- The Helios swarm passes a million collectors around 2190 and reaches about 18 million
  collectors and 90 PW by 2270, where new production balances failures. The Secretariat
  redesigns its collector as technology improves.
- A 250-year campaign runs headless in about two and a half minutes. Its save is about
  1.8 MB of JSON, or about 340 KB gzipped.

Known weaknesses:

- Most people end up in cislunar space. Mars, the belt and the outer system grow slowly
  because interplanetary freight costs 0.3–1 million credits a tonne. Many far outposts
  stay small or empty.
- Equatorial lunar bases such as Tranquility and Procellarum go through recurring power
  and supply crises and have poor wellbeing late in the game.
- The swarm captures only about 10⁻¹⁰ of the Sun's output by 2300. Collector output is
  limited by lunar launch capacity and by electronics, and Mercury industry rarely
  develops.
- Off-world GDP swings with the regional price regime. Goods that are dear while imported
  become nearly free once a region makes a surplus.
- In a hands-off game, where the player keeps only the default delegation, growth is much
  slower than for the autoplayer. That is intended: the player is expected to found
  settlements and pass laws.
