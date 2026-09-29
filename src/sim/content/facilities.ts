import type { FacilityDef } from '../types';

const ANY_SOLID: FacilityDef['allowed'] = ['surface', 'asteroid'];
const ANYWHERE: FacilityDef['allowed'] = ['surface', 'asteroid', 'orbital', 'atmospheric'];

export const FACILITIES: FacilityDef[] = [
  // ---------------------------------------------------------------- Habitats
  {
    id: 'habModule', name: 'Habitat Module', category: 'habitat', allowed: ANYWHERE,
    description: 'A pressurized habitat module for a dozen people. It is light, but offers little radiation protection.',
    buildCost: 4.0e8, buildMass: { alloys: 18, composites: 6, electronics: 1, machinery: 2 }, buildMonths: 5,
    jobs: {}, power: 0.06, housing: 12, shielding: 0.35, maintenance: { supplies: 0.4, machinery: 0.1 }, opex: 2e6,
  },
  {
    id: 'buriedHab', name: 'Regolith-Shielded Habitat', category: 'habitat', allowed: ANY_SOLID, tech: 'regolith_construction',
    description: 'Modules buried under metres of sintered regolith. Cosmic-ray dose drops by 85%.',
    buildCost: 1.4e9, buildMass: { alloys: 50, composites: 10, ceramics: 30, machinery: 5, electronics: 2 }, buildMonths: 10,
    jobs: { technicians: 1 }, power: 0.4, housing: 120, shielding: 0.85, maintenance: { supplies: 1, machinery: 0.3 }, opex: 8e6,
  },
  {
    id: 'lavaTubeHab', name: 'Lava-Tube Settlement Section', category: 'habitat', allowed: ['surface'], requiresFeature: 'lavaTubes', tech: 'lava_tube_engineering',
    description: 'A sealed and pressurized section of an ancient lava tube, with natural shielding under tens of metres of basalt.',
    buildCost: 1.1e10, buildMass: { alloys: 700, ceramics: 500, composites: 120, machinery: 60, electronics: 20 }, buildMonths: 22,
    jobs: { technicians: 8, service: 20 }, power: 5, housing: 2400, shielding: 0.96, maintenance: { supplies: 12, machinery: 3 }, opex: 6e7,
  },
  {
    id: 'domeDistrict', name: 'Pressurized District', category: 'habitat', allowed: ['surface'], tech: 'large_pressure_structures',
    description: 'Interconnected shielded vaults and domes housing twenty thousand residents.',
    buildCost: 5.5e10, buildMass: { alloys: 11000, ceramics: 9000, composites: 2500, machinery: 700, electronics: 180 }, buildMonths: 34,
    jobs: { technicians: 40, service: 400, administrators: 30 }, power: 55, housing: 20000, shielding: 0.9, maintenance: { supplies: 80, machinery: 20 }, opex: 3e8,
  },
  {
    id: 'arcology', name: 'Arcology', category: 'habitat', allowed: ['surface'], tech: 'arcology_design',
    description: 'A self-contained megastructure city for half a million people, with integrated farms, industry and transit.',
    buildCost: 7.0e11, buildMass: { alloys: 260000, ceramics: 240000, composites: 50000, machinery: 18000, electronics: 5000 }, buildMonths: 60,
    jobs: { technicians: 800, service: 9000, administrators: 700, medical: 400 }, power: 1100, housing: 500000, shielding: 0.95, maintenance: { supplies: 1500, machinery: 300 }, opex: 5e9,
  },
  {
    id: 'iceHab', name: 'Subsurface Ice Habitat', category: 'habitat', allowed: ['surface'], requiresFeature: 'iceShell', tech: 'ice_shell_habitats',
    description: 'Caverns melted into an icy crust. Kilometres of ice give near-total radiation shelter, even inside Jupiter\'s belts.',
    buildCost: 3.0e10, buildMass: { alloys: 3000, composites: 800, machinery: 400, electronics: 80 }, buildMonths: 30,
    jobs: { technicians: 25, service: 120 }, power: 30, housing: 8000, shielding: 0.99998, maintenance: { supplies: 30, machinery: 8 }, opex: 1.5e8,
  },
  {
    id: 'orbitalStation', name: 'Orbital Station', category: 'habitat', allowed: ['orbital'],
    description: 'A modular zero-g station for crews, tourists and workers.',
    buildCost: 1.3e9, buildMass: { alloys: 55, composites: 20, electronics: 4, machinery: 6 }, buildMonths: 10,
    jobs: { technicians: 2 }, power: 0.3, housing: 40, shielding: 0.5, maintenance: { supplies: 1.5, machinery: 0.3 }, opex: 1.5e7,
  },
  {
    id: 'rotatingHab', name: 'Rotating Habitat', category: 'habitat', allowed: ['orbital', 'asteroid'], tech: 'rotating_habitats',
    description: 'A spinning wheel providing Earth-normal gravity for three thousand people.',
    buildCost: 3.6e10, buildMass: { alloys: 18000, ceramics: 9000, composites: 2000, machinery: 400, electronics: 100 }, buildMonths: 34,
    jobs: { technicians: 20, service: 60 }, power: 14, housing: 3000, shielding: 0.9, gravity: 1, maintenance: { supplies: 12, machinery: 4 }, opex: 1.2e8,
  },
  {
    id: 'stanfordTorus', name: 'Stanford Torus', category: 'habitat', allowed: ['orbital'], tech: 'torus_habitats',
    description: 'A 1.8-km wheel for 100,000 people behind a slag radiation shield.',
    buildCost: 1.1e12, buildMass: { alloys: 280000, ceramics: 1000000, composites: 50000, machinery: 5000, electronics: 1200 }, buildMonths: 70,
    jobs: { technicians: 300, service: 2000, administrators: 150, medical: 80 }, power: 380, housing: 100000, shielding: 0.97, gravity: 1, maintenance: { supplies: 250, machinery: 60 }, opex: 1.2e9,
  },
  {
    id: 'oneillCylinder', name: "O'Neill Cylinder", category: 'habitat', allowed: ['orbital'], tech: 'oneill_cylinders',
    description: 'A pair of counter-rotating cylinders 32 km long, with sunlit valleys, forests and lakes for five million people.',
    buildCost: 2.8e13, buildMass: { alloys: 2.5e7, ceramics: 4.5e7, composites: 1e6, machinery: 1e5, electronics: 3e4 }, buildMonths: 120,
    jobs: { technicians: 12000, service: 90000, administrators: 6000, medical: 4000 }, power: 18000, housing: 5000000, shielding: 0.98, gravity: 1, maintenance: { supplies: 12000, machinery: 2500 }, opex: 5e10,
  },
  {
    id: 'asteroidHab', name: 'Hollowed Asteroid Habitat', category: 'habitat', allowed: ['asteroid'], tech: 'asteroid_hollowing',
    description: 'A spun-up asteroid interior for fifty thousand people inside a natural rock shield.',
    buildCost: 1.3e11, buildMass: { alloys: 18000, ceramics: 8000, machinery: 1800, electronics: 400 }, buildMonths: 56,
    jobs: { technicians: 150, service: 900, administrators: 60 }, power: 190, housing: 50000, shielding: 0.99, gravity: 0.7, maintenance: { supplies: 120, machinery: 30 }, opex: 6e8,
  },
  {
    id: 'aerostatHab', name: 'Cloud Habitat', category: 'habitat', allowed: ['atmospheric'], tech: 'aerostat_habitats',
    description: 'A floating city lifted by breathable air, drifting 52 km above Venus with 0.9 g of natural gravity.',
    buildCost: 6.0e10, buildMass: { composites: 7000, alloys: 1800, ceramics: 400, machinery: 300, electronics: 80 }, buildMonths: 34,
    jobs: { technicians: 60, service: 150 }, power: 18, housing: 5000, shielding: 0.99, gravity: 0.9, maintenance: { supplies: 20, machinery: 5, composites: 20 }, opex: 2.5e8,
  },
  {
    id: 'megaHabitat', name: 'Free-Space Megahabitat', category: 'habitat', allowed: ['orbital'], tech: 'megastructure_habitats',
    description: 'A kilometre-scale rotating structure with a continent\'s worth of living area for two hundred million people.',
    buildCost: 6.0e14, buildMass: { alloys: 2e9, ceramics: 3e9, composites: 1e8, machinery: 5e6, electronics: 1.5e6 }, buildMonths: 180,
    jobs: { technicians: 200000, service: 3000000, administrators: 150000, medical: 100000 }, power: 700000, housing: 200000000, shielding: 0.99, gravity: 1, maintenance: { supplies: 400000, machinery: 80000 }, opex: 1e12,
  },
  // ---------------------------------------------------- Life support & food
  {
    id: 'lifeSupport', name: 'Life Support Plant', category: 'lifeSupport', allowed: ANYWHERE,
    description: 'Water recovery and CO₂ reduction (Sabatier and electrolysis) for 100 people. Its recovery rates improve with technology.',
    buildCost: 3.0e8, buildMass: { machinery: 6, electronics: 2, alloys: 4 }, buildMonths: 4,
    jobs: { technicians: 1 }, power: 0.35, lifeSupportCapacity: 100, maintenance: { machinery: 0.3, supplies: 0.2 }, opex: 3e6,
  },
  {
    id: 'greenhouse', name: 'Hydroponic Farm', category: 'food', allowed: ANYWHERE,
    description: 'LED-lit hydroponic racks. One farm grows food for about fifty people.',
    buildCost: 2.5e8, buildMass: { alloys: 25, composites: 15, machinery: 4, electronics: 1 }, buildMonths: 5,
    jobs: { agricultural: 3 }, power: 1.0, recipe: { in: { water: 8, nitrogen: 0.5, phosphorus: 0.15 }, out: { food: 25, oxygen: 4 } },
    maintenance: { supplies: 0.2 }, opex: 1.5e6,
  },
  {
    id: 'algaeFarm', name: 'Algae Bioreactor', category: 'food', allowed: ANYWHERE, tech: 'algae_bioreactors',
    description: 'Photobioreactors that turn CO₂ and nutrients into protein-rich biomass and oxygen.',
    buildCost: 4.0e8, buildMass: { alloys: 30, composites: 25, machinery: 5, electronics: 1 }, buildMonths: 5,
    jobs: { agricultural: 3, technicians: 1 }, power: 2, recipe: { in: { water: 15, nitrogen: 1, phosphorus: 0.3, carbon: 20 }, out: { food: 80, oxygen: 60 } },
    maintenance: { supplies: 0.3 }, opex: 2e6,
  },
  {
    id: 'proteinVats', name: 'Cellular Agriculture Plant', category: 'food', allowed: ANYWHERE, tech: 'cellular_agriculture',
    description: 'Bioreactors that brew cultured meat, dairy and engineered protein at industrial scale.',
    buildCost: 3.0e9, buildMass: { alloys: 300, composites: 150, machinery: 80, electronics: 10 }, buildMonths: 12,
    jobs: { agricultural: 8, technicians: 6, scientists: 1 }, power: 25, recipe: { in: { carbon: 380, nitrogen: 60, water: 200, phosphorus: 5 }, out: { food: 1000 } },
    maintenance: { supplies: 3, machinery: 2 }, opex: 2.5e7,
  },
  {
    id: 'hospital', name: 'Medical Center', category: 'civic', allowed: ANYWHERE,
    description: 'Clinics, surgery, bone-density monitoring and a radiation medicine ward for 2,000 people.',
    buildCost: 8.0e8, buildMass: { alloys: 30, composites: 10, electronics: 3, machinery: 5 }, buildMonths: 8,
    jobs: { medical: 20 }, power: 0.6, medical: 2000, maintenance: { supplies: 4 }, opex: 1e7,
  },
  {
    id: 'civicCenter', name: 'Civic & Recreation Center', category: 'civic', allowed: ANYWHERE,
    description: 'Parks, gymnasiums, theatres, schools and public space, which matter for psychological health in artificial environments.',
    buildCost: 6.0e8, buildMass: { alloys: 40, composites: 20, electronics: 1 }, buildMonths: 8,
    jobs: { service: 15, administrators: 2 }, power: 0.5, civic: 3000, education: 800, maintenance: { supplies: 2 }, opex: 6e6,
  },
  // ------------------------------------------------------------------ Energy
  {
    id: 'solarArray', name: 'Solar Array', category: 'energy', allowed: ANYWHERE,
    description: 'Thin-film photovoltaic array. Output follows the inverse square of distance from the Sun and the site\'s illumination.',
    buildCost: 6.0e7, buildMass: { photovoltaics: 8, alloys: 6, electronics: 0.5 }, buildMonths: 2,
    jobs: { technicians: 0.1 }, power: 0, gen: 2, genType: 'solar', maintenance: { photovoltaics: 0.15 }, opex: 3e5,
  },
  {
    id: 'batteryBank', name: 'Energy Storage Bank', category: 'energy', allowed: ANYWHERE,
    description: 'Lithium and regenerative fuel-cell storage that buffers night, eclipse and demand peaks.',
    buildCost: 5.0e7, buildMass: { lithium: 5, alloys: 8, electronics: 1 }, buildMonths: 2,
    jobs: {}, power: 0, storageMWh: 60, maintenance: { lithium: 0.1 }, opex: 2e5,
  },
  {
    id: 'fissionReactor', name: 'Compact Fission Reactor', category: 'energy', allowed: ANY_SOLID.concat(['orbital']), tech: 'surface_fission',
    description: 'A 10-MW fission unit with a shadow shield and radiators. It works through the lunar night and the outer-system dark.',
    buildCost: 9.0e8, buildMass: { alloys: 25, machinery: 15, ceramics: 10, electronics: 2, reactorFuel: 1 }, buildMonths: 12,
    jobs: { technicians: 4, engineers: 1 }, power: 0, gen: 10, genType: 'fission', recipe: { in: { reactorFuel: 0.05 }, out: {} },
    maintenance: { machinery: 0.8 }, opex: 8e6, heat: 30,
  },
  {
    id: 'moltenSaltReactor', name: 'Molten-Salt Thorium Reactor', category: 'energy', allowed: ANY_SOLID.concat(['orbital']), tech: 'advanced_fission',
    description: 'A 200-MW thorium breeder that burns local thorium from KREEP terrains.',
    buildCost: 6.0e9, buildMass: { alloys: 250, machinery: 120, ceramics: 80, electronics: 10, reactorFuel: 5 }, buildMonths: 24,
    jobs: { technicians: 20, engineers: 6 }, power: 0, gen: 200, genType: 'fission', recipe: { in: { thorium: 1.0 }, out: {} },
    maintenance: { machinery: 5 }, opex: 5e7, heat: 400,
  },
  {
    id: 'fusionPlant', name: 'Fusion Power Plant', category: 'energy', allowed: ANYWHERE, tech: 'fusion_power',
    description: 'A 2-GW D–He3 fusion plant. Its fuel is worth a billion credits a tonne, and it burns only about half a tonne a year.',
    buildCost: 3.5e10, buildMass: { alloys: 900, superconductors: 40, machinery: 350, ceramics: 350, electronics: 50 }, buildMonths: 36,
    jobs: { engineers: 25, technicians: 60 }, power: 0, gen: 2000, genType: 'fusion', recipe: { in: { fusionFuel: 0.45 }, out: {} },
    maintenance: { machinery: 20, superconductors: 1 }, opex: 3e8, heat: 2000,
  },
  {
    id: 'beamReceiver', name: 'Beamed Power Rectenna', category: 'energy', allowed: ANYWHERE, tech: 'beamed_power',
    description: 'A rectenna field that receives microwave or laser power transmitted from the Helios swarm.',
    buildCost: 4.0e9, buildMass: { alloys: 1500, electronics: 150, copper: 200 }, buildMonths: 12,
    jobs: { technicians: 10 }, power: 0, beamReceiveMW: 5000, maintenance: { electronics: 2 }, opex: 2e7,
  },
  // ------------------------------------------------------------------ Mining
  {
    id: 'iceMine', name: 'Ice Extraction Plant', category: 'mining', allowed: ANY_SOLID,
    description: 'Excavators and thermal sublimation ovens that harvest water from icy regolith and ice sheets.',
    buildCost: 1.2e9, buildMass: { machinery: 35, alloys: 30, electronics: 3 }, buildMonths: 8,
    jobs: { miners: 6, technicians: 2 }, power: 3, mining: { depositTypes: ['ice'], orePerYear: 8000 },
    maintenance: { machinery: 3, supplies: 0.2 }, opex: 1e7,
  },
  {
    id: 'regolithRefinery', name: 'Regolith Refinery', category: 'mining', allowed: ANY_SOLID, tech: 'molten_regolith_electrolysis',
    description: 'Molten-regolith electrolysis that splits bulk soil into oxygen, iron, silicon, aluminium and titanium.',
    buildCost: 2.4e9, buildMass: { machinery: 70, alloys: 50, ceramics: 20, electronics: 5 }, buildMonths: 12,
    jobs: { miners: 4, industrial: 6, technicians: 3 }, power: 12, mining: { depositTypes: ['regolith', 'crust'], orePerYear: 1500 },
    maintenance: { machinery: 5, ceramics: 2 }, opex: 2e7,
  },
  {
    id: 'asteroidMiner', name: 'Asteroid Mining Rig', category: 'mining', allowed: ['asteroid', 'surface'], tech: 'asteroid_mining',
    description: 'Anchored excavators and optical-mining heaters that process asteroidal material.',
    buildCost: 3.0e9, buildMass: { machinery: 80, alloys: 60, electronics: 6 }, buildMonths: 12,
    jobs: { miners: 8, technicians: 3 }, power: 10, mining: { depositTypes: ['carbonaceous', 'metal'], orePerYear: 3000 },
    maintenance: { machinery: 6 }, opex: 2.5e7,
  },
  {
    id: 'atmosphereProcessor', name: 'Atmospheric Processor', category: 'mining', allowed: ['surface', 'atmospheric'], tech: 'atmospheric_isru',
    description: 'Compressors and solid-oxide electrolysers that split CO₂ and separate nitrogen, argon and hydrocarbons.',
    buildCost: 1.0e9, buildMass: { machinery: 30, alloys: 20, ceramics: 5, electronics: 3 }, buildMonths: 8,
    jobs: { technicians: 3, industrial: 2 }, power: 4, mining: { depositTypes: ['atmosphere', 'hydrocarbon'], orePerYear: 1000 },
    maintenance: { machinery: 2 }, opex: 8e6,
  },
  {
    id: 'crustalMine', name: 'Mineral Mine', category: 'mining', allowed: ANY_SOLID, tech: 'rare_element_extraction',
    description: 'Selective mining of rare mineral deposits: KREEP basalts, sulfides, brines and volcanic sulfur.',
    buildCost: 2.0e9, buildMass: { machinery: 60, alloys: 40, electronics: 4 }, buildMonths: 12,
    jobs: { miners: 10, technicians: 3 }, power: 6, mining: { depositTypes: ['kreep', 'minerals', 'sulfur'], orePerYear: 20000 },
    maintenance: { machinery: 4 }, opex: 1.5e7,
  },
  {
    id: 'he3Harvester', name: 'Helium-3 Harvester', category: 'mining', allowed: ['surface'], tech: 'helium3_extraction',
    description: 'Mobile regolith harvesters that heat surface soil to release solar-wind helium-3 and volatiles.',
    buildCost: 8.0e9, buildMass: { machinery: 300, alloys: 200, electronics: 20, ceramics: 50 }, buildMonths: 18,
    jobs: { miners: 10, technicians: 6 }, power: 40, mining: { depositTypes: ['he3'], orePerYear: 5.0e6 },
    maintenance: { machinery: 15 }, opex: 6e7,
  },
  {
    id: 'gasScoop', name: 'Atmospheric Scoop Fleet', category: 'mining', allowed: ['orbital'], tech: 'gas_giant_scooping',
    description: 'Nuclear ramjet aerostats that skim a giant planet\'s atmosphere and separate helium-3.',
    buildCost: 6.0e10, buildMass: { machinery: 1500, alloys: 1500, superconductors: 30, electronics: 60, ceramics: 400 }, buildMonths: 30,
    jobs: { engineers: 10, technicians: 30 }, power: 60, mining: { depositTypes: ['gasGiant'], orePerYear: 3.0e5 },
    maintenance: { machinery: 60 }, opex: 3e8,
  },
  {
    id: 'autoMiner', name: 'Autonomous Mining Complex', category: 'mining', allowed: ANY_SOLID, tech: 'autonomous_mining',
    description: 'A fully robotic strip-mining, beneficiation and refining complex. It needs no human workers.',
    buildCost: 2.0e10, buildMass: { machinery: 900, alloys: 600, electronics: 60, ceramics: 100 }, buildMonths: 18,
    jobs: {}, power: 60, mining: { depositTypes: ['regolith', 'crust', 'metal', 'carbonaceous', 'ice', 'minerals', 'sulfur', 'core'], orePerYear: 2.0e5 },
    maintenance: { machinery: 25, electronics: 1 }, opex: 5e7, automation: 0,
  },
  // -------------------------------------------------------------- Processing
  {
    id: 'electrolysisPlant', name: 'Water Electrolysis Plant', category: 'processing', allowed: ANYWHERE,
    description: 'Splits water into breathing oxygen and hydrogen reaction mass.',
    buildCost: 5.0e8, buildMass: { machinery: 18, electronics: 2, alloys: 10 }, buildMonths: 5,
    jobs: { technicians: 2 }, power: 1.2, recipe: { in: { water: 900 }, out: { oxygen: 800, hydrogen: 100 } },
    maintenance: { machinery: 1 }, opex: 4e6,
  },
  {
    id: 'sabatierReactor', name: 'Sabatier Propellant Reactor', category: 'processing', allowed: ['surface', 'atmospheric'], tech: 'atmospheric_isru',
    description: 'Combines atmospheric carbon and oxygen with hydrogen into methane–oxygen propellant. Hydrogen is imported until local water is found.',
    buildCost: 6.0e8, buildMass: { machinery: 20, electronics: 2, alloys: 12 }, buildMonths: 6,
    jobs: { technicians: 2 }, power: 3, recipe: { in: { oxygen: 790, carbon: 160, hydrogen: 50 }, out: { propellant: 1000 } },
    maintenance: { machinery: 1 }, opex: 5e6,
  },
  {
    id: 'propellantPlant', name: 'Propellant Plant', category: 'processing', allowed: ANYWHERE, tech: 'isru_propellant',
    description: 'Electrolysis and cryogenic liquefaction that produce hydrolox propellant from water.',
    buildCost: 8.0e8, buildMass: { machinery: 30, electronics: 3, alloys: 20 }, buildMonths: 6,
    jobs: { technicians: 3 }, power: 2.5, recipe: { in: { water: 1290 }, out: { propellant: 1000, oxygen: 140 } },
    maintenance: { machinery: 1.5 }, opex: 6e6,
  },
  {
    id: 'smelter', name: 'Metals Foundry', category: 'processing', allowed: ANY_SOLID.concat(['orbital']), tech: 'space_metallurgy',
    description: 'Vacuum smelting and alloying of iron, nickel, titanium and aluminium into structural alloys.',
    buildCost: 2.0e9, buildMass: { machinery: 90, ceramics: 30, alloys: 40, electronics: 3 }, buildMonths: 12,
    jobs: { industrial: 12, technicians: 3, engineers: 1 }, power: 8, recipe: { in: { iron: 560, aluminium: 120, titanium: 20 }, out: { alloys: 680 } },
    maintenance: { machinery: 5, ceramics: 3 }, opex: 1.5e7,
  },
  {
    id: 'ceramicsWorks', name: 'Ceramics & Glass Works', category: 'processing', allowed: ANYWHERE, tech: 'regolith_construction',
    description: 'Sintering, glass-making and ceramic casting from silicon, aluminium and oxygen.',
    buildCost: 8.0e8, buildMass: { machinery: 30, alloys: 15, electronics: 2 }, buildMonths: 8,
    jobs: { industrial: 6, technicians: 2 }, power: 4, recipe: { in: { silicon: 280, aluminium: 90, oxygen: 130 }, out: { ceramics: 500 } },
    maintenance: { machinery: 2 }, opex: 6e6,
  },
  {
    id: 'chemicalPlant', name: 'Chemical & Polymer Plant', category: 'processing', allowed: ANYWHERE, tech: 'space_chemistry',
    description: 'Fischer–Tropsch reactors and fibre lines that make polymers, films and carbon composites.',
    buildCost: 2.5e9, buildMass: { machinery: 90, alloys: 60, electronics: 6, ceramics: 20 }, buildMonths: 14,
    jobs: { industrial: 8, technicians: 4, engineers: 2 }, power: 7, recipe: { in: { carbon: 220, hydrogen: 45, nitrogen: 12, oxygen: 20 }, out: { composites: 250 } },
    maintenance: { machinery: 4 }, opex: 2e7,
  },
  {
    id: 'fabShop', name: 'Fabrication Workshop', category: 'manufacturing', allowed: ANYWHERE,
    description: 'Additive manufacturing and light assembly for spare parts, clothing, tools and consumer goods.',
    buildCost: 4.0e8, buildMass: { machinery: 12, electronics: 2, alloys: 8 }, buildMonths: 5,
    jobs: { industrial: 5, technicians: 2 }, power: 1, recipe: { in: { alloys: 25, composites: 25, electronics: 0.3, carbon: 20 }, out: { supplies: 70 } },
    maintenance: { machinery: 1 }, opex: 3e6,
  },
  {
    id: 'machineShop', name: 'Machine Tool Works', category: 'manufacturing', allowed: ANYWHERE, tech: 'space_machine_tools',
    description: 'Precision machining, casting and motor winding. It turns alloys and electronics into industrial machinery.',
    buildCost: 3.0e9, buildMass: { machinery: 120, alloys: 60, electronics: 10 }, buildMonths: 14,
    jobs: { engineers: 5, industrial: 14, technicians: 6 }, power: 6, recipe: { in: { alloys: 360, electronics: 4, copper: 14 }, out: { machinery: 360 } },
    maintenance: { machinery: 6 }, opex: 2.5e7,
  },
  {
    id: 'electronicsFactory', name: 'Electronics Assembly Plant', category: 'manufacturing', allowed: ANYWHERE, tech: 'space_electronics_assembly',
    description: 'Board assembly, packaging and systems integration. It still needs imported chips unless a local fab exists.',
    buildCost: 6.0e9, buildMass: { machinery: 150, electronics: 30, alloys: 60, ceramics: 20 }, buildMonths: 16,
    jobs: { engineers: 10, technicians: 25, industrial: 10 }, power: 10, recipe: { in: { semiconductors: 2, copper: 25, pgm: 0.02, composites: 15, ceramics: 8 }, out: { electronics: 50 } },
    maintenance: { machinery: 4 }, opex: 6e7,
  },
  {
    id: 'semiconductorFab', name: 'Semiconductor Fab', category: 'manufacturing', allowed: ANYWHERE, tech: 'orbital_semiconductor_fab',
    description: 'Ultra-clean lithography and wafer processing, the hardest link in any industrial chain.',
    buildCost: 2.0e10, buildMass: { machinery: 450, electronics: 120, ceramics: 100, alloys: 150 }, buildMonths: 30,
    jobs: { engineers: 40, technicians: 60, scientists: 8 }, power: 40, recipe: { in: { silicon: 30, rareEarths: 0.3, copper: 1, hydrogen: 5, nitrogen: 5 }, out: { semiconductors: 8 } },
    maintenance: { machinery: 12, electronics: 3 }, opex: 2e8,
  },
  {
    id: 'pvFactory', name: 'Photovoltaic Factory', category: 'manufacturing', allowed: ANYWHERE, tech: 'space_photovoltaics',
    description: 'Vapour deposition of thin-film cells on local substrates, the backbone of solar expansion.',
    buildCost: 3.0e9, buildMass: { machinery: 120, electronics: 15, alloys: 50, ceramics: 20 }, buildMonths: 14,
    jobs: { engineers: 4, technicians: 10, industrial: 8 }, power: 14, recipe: { in: { silicon: 80, aluminium: 10, copper: 2, semiconductors: 0.05 }, out: { photovoltaics: 90 } },
    maintenance: { machinery: 5 }, opex: 2e7,
  },
  {
    id: 'superconductorPlant', name: 'Superconductor Plant', category: 'manufacturing', allowed: ANYWHERE, tech: 'hts_manufacturing',
    description: 'Rare-earth barium copper oxide (REBCO) tape deposition for fusion magnets, mass drivers and power grids.',
    buildCost: 8.0e9, buildMass: { machinery: 200, electronics: 40, alloys: 100, ceramics: 40 }, buildMonths: 20,
    jobs: { engineers: 8, technicians: 20, industrial: 10 }, power: 20, recipe: { in: { rareEarths: 3, copper: 12, alloys: 10, oxygen: 2 }, out: { superconductors: 12 } },
    maintenance: { machinery: 6 }, opex: 5e7,
  },
  {
    id: 'fuelPlant', name: 'Nuclear Fuel Plant', category: 'processing', allowed: ANY_SOLID.concat(['orbital']), tech: 'offworld_fuel_cycle',
    description: 'Enrichment and fuel-element fabrication for fission reactors.',
    buildCost: 5.0e9, buildMass: { machinery: 150, alloys: 80, ceramics: 30, electronics: 10 }, buildMonths: 20,
    jobs: { engineers: 6, technicians: 14 }, power: 10, recipe: { in: { uranium: 8, thorium: 2 }, out: { reactorFuel: 1 } },
    maintenance: { machinery: 4 }, opex: 4e7,
  },
  {
    id: 'deuteriumPlant', name: 'Deuterium Extraction Plant', category: 'processing', allowed: ANYWHERE, tech: 'fusion_power',
    description: 'Girdler-sulfide and cryogenic distillation of heavy water into deuterium fusion fuel.',
    buildCost: 6.0e9, buildMass: { machinery: 200, alloys: 150, electronics: 10 }, buildMonths: 18,
    jobs: { engineers: 4, technicians: 12 }, power: 30, recipe: { in: { water: 2000 }, out: { fusionFuel: 0.2 } },
    maintenance: { machinery: 5 }, opex: 3e7,
  },
  // ---------------------------------------------------------- Infrastructure
  {
    id: 'landingPad', name: 'Spaceport & Landing Complex', category: 'infrastructure', allowed: ['surface', 'atmospheric', 'asteroid'],
    description: 'Sintered landing pads, cargo handling and crew facilities. Every surface route needs one.',
    buildCost: 5.0e8, buildMass: { alloys: 15, ceramics: 10, machinery: 5, electronics: 1 }, buildMonths: 4,
    jobs: { technicians: 3 }, power: 0.3, landing: 25000, maintenance: { machinery: 0.5, ceramics: 1 }, opex: 3e6,
  },
  {
    id: 'propellantDepot', name: 'Propellant Depot', category: 'infrastructure', allowed: ANYWHERE, tech: 'cryogenic_depots',
    description: 'Zero-boil-off cryogenic tanks that let ships refuel mid-route.',
    buildCost: 2.5e9, buildMass: { alloys: 180, composites: 50, machinery: 20, electronics: 5 }, buildMonths: 10,
    jobs: { technicians: 3 }, power: 1.5, propellantStorage: 6000, storage: 1000, maintenance: { machinery: 1 }, opex: 1e7,
  },
  {
    id: 'warehouse', name: 'Storage Complex', category: 'infrastructure', allowed: ANYWHERE,
    description: 'Pressurized and unpressurized storage for bulk goods and emergency reserves.',
    buildCost: 3.0e8, buildMass: { alloys: 40, composites: 5 }, buildMonths: 3,
    jobs: {}, power: 0.1, storage: 20000, propellantStorage: 1000, maintenance: { alloys: 0.3 }, opex: 1e6,
  },
  {
    id: 'shipyard', name: 'Orbital Shipyard', category: 'infrastructure', allowed: ['orbital', 'asteroid', 'surface'], tech: 'orbital_assembly',
    description: 'Assembly docks, robotic welders and test stands. It builds ships from local materials.',
    buildCost: 6.0e9, buildMass: { alloys: 900, machinery: 250, electronics: 30, composites: 50 }, buildMonths: 18,
    jobs: { engineers: 20, industrial: 60, technicians: 20 }, power: 15, shipyard: 3000, maintenance: { machinery: 6 }, opex: 4e7,
  },
  {
    id: 'massDriver', name: 'Mass Driver', category: 'infrastructure', allowed: ['surface', 'asteroid'], tech: 'mass_drivers',
    description: 'An electromagnetic launch track that throws bulk cargo off low-gravity worlds with electricity instead of rockets.',
    buildCost: 5.0e10, buildMass: { alloys: 4500, superconductors: 40, machinery: 450, electronics: 50, ceramics: 900, copper: 600 }, buildMonths: 30,
    jobs: { engineers: 10, technicians: 30 }, power: 50, massDriver: 250000, maintenance: { machinery: 20, superconductors: 0.5 }, opex: 1.5e8,
  },
  {
    id: 'commArray', name: 'Deep-Space Communications Array', category: 'infrastructure', allowed: ANYWHERE, tech: 'laser_communications',
    description: 'Optical and radio relay with ranging. It speeds coordination and supports local autonomy.',
    buildCost: 1.2e9, buildMass: { alloys: 40, electronics: 8, machinery: 5 }, buildMonths: 8,
    jobs: { technicians: 4, engineers: 1 }, power: 1, science: 10, maintenance: { electronics: 0.3 }, opex: 8e6,
  },
  // ----------------------------------------------------------------- Science
  {
    id: 'researchLab', name: 'Research Laboratory', category: 'science', allowed: ANYWHERE,
    description: 'Laboratories for planetary science, materials, life sciences and engineering research.',
    buildCost: 1.0e9, buildMass: { alloys: 30, composites: 10, electronics: 6, machinery: 4 }, buildMonths: 8,
    jobs: { scientists: 20, engineers: 5, technicians: 5 }, power: 1.5, science: 40, maintenance: { electronics: 0.5, supplies: 1 }, opex: 2e7,
  },
  {
    id: 'observatory', name: 'Deep-Space Observatory', category: 'science', allowed: ANYWHERE,
    description: 'Large telescopes and radio arrays. It adds science output and planetary-defense survey coverage.',
    buildCost: 2.5e9, buildMass: { alloys: 80, ceramics: 30, electronics: 15, machinery: 10 }, buildMonths: 16,
    jobs: { scientists: 12, technicians: 8 }, power: 2, science: 50, survey: 0.02, maintenance: { electronics: 0.8 }, opex: 2e7,
  },
  {
    id: 'university', name: 'University', category: 'science', allowed: ANYWHERE,
    description: 'Higher education and research that trains local engineers and scientists.',
    buildCost: 3.0e9, buildMass: { alloys: 200, composites: 60, electronics: 15, machinery: 10 }, buildMonths: 20,
    jobs: { scientists: 60, service: 60, administrators: 10 }, power: 3, science: 60, education: 10000, maintenance: { supplies: 5, electronics: 1 }, opex: 6e7,
  },
  {
    id: 'automationHub', name: 'AI Automation Center', category: 'science', allowed: ANYWHERE, tech: 'industrial_ai',
    description: 'Datacentres and robotic maintenance fleets that raise a settlement\'s automation level.',
    buildCost: 5.0e9, buildMass: { electronics: 60, machinery: 100, alloys: 60 }, buildMonths: 12,
    jobs: { engineers: 15, technicians: 10 }, power: 25, automation: 1, science: 20, maintenance: { electronics: 4, machinery: 3 }, opex: 5e7,
  },
  // ---------------------------------------------------------------- Security
  {
    id: 'securityStation', name: 'Security Station', category: 'security', allowed: ANYWHERE,
    description: 'Police, customs, emergency response and traffic control.',
    buildCost: 7.0e8, buildMass: { alloys: 30, electronics: 4, machinery: 4 }, buildMonths: 6,
    jobs: { security: 30, administrators: 3 }, power: 0.5, security: 10, maintenance: { supplies: 1 }, opex: 1e7,
  },
  {
    id: 'pdTelescope', name: 'Planetary Defense Survey Telescope', category: 'security', allowed: ['orbital'],
    description: 'An infrared survey telescope that catalogues potentially hazardous asteroids and comets.',
    buildCost: 3.0e9, buildMass: { alloys: 40, electronics: 12, machinery: 5, ceramics: 10 }, buildMonths: 18,
    jobs: { scientists: 4, technicians: 4 }, power: 0.5, survey: 0.06, science: 10, maintenance: { electronics: 0.4 }, opex: 3e7,
  },
  // -------------------------------------------------------------- Dyson era
  {
    id: 'autoFactory', name: 'Autonomous Industrial Complex', category: 'dyson', allowed: ANY_SOLID, tech: 'self_replicating_industry',
    description: 'A self-maintaining factory ecosystem. It mines, refines and manufactures with no human labour, and can build copies of itself.',
    buildCost: 3.0e10, buildMass: { machinery: 800, electronics: 120, alloys: 800, superconductors: 5, photovoltaics: 100 }, buildMonths: 24,
    jobs: {}, power: 80, mining: { depositTypes: ['regolith', 'crust', 'metal', 'carbonaceous', 'core', 'minerals', 'sulfur'], orePerYear: 4.0e5 },
    replicator: true, maintenance: {}, opex: 1e7,
  },
  {
    id: 'autoSolar', name: 'Replicated Solar Field', category: 'energy', allowed: ANYWHERE, tech: 'self_replicating_industry',
    description: 'Photovoltaic fields laid down and maintained by autonomous industrial complexes. They need no crew and no imported spares.',
    buildCost: 0, buildMass: { photovoltaics: 8, alloys: 6, electronics: 0.5 }, buildMonths: 1,
    jobs: {}, power: 0, gen: 2, genType: 'solar', maintenance: {}, opex: 0,
  },
  {
    id: 'collectorFactory', name: 'Collector Fabrication Line', category: 'dyson', allowed: ['surface', 'orbital', 'asteroid'], tech: 'dyson_collectors',
    description: 'A robotic line that prints thin-film Helios collectors from photovoltaics, alloys and electronics.',
    buildCost: 2.0e10, buildMass: { machinery: 600, electronics: 80, alloys: 500, photovoltaics: 50 }, buildMonths: 20,
    jobs: { engineers: 4, technicians: 12 }, power: 120, collectorMassPerYear: 25000, maintenance: { machinery: 10 }, opex: 8e7,
  },
];

export const FACILITY: Record<string, FacilityDef> = Object.fromEntries(FACILITIES.map((f) => [f.id, f]));

export const OCCUPATIONS = [
  'scientists',
  'engineers',
  'technicians',
  'industrial',
  'miners',
  'agricultural',
  'medical',
  'administrators',
  'service',
  'security',
] as const;

export const SKILLED_OCCUPATIONS = new Set(['scientists', 'engineers', 'medical']);

export function facilityJobs(def: FacilityDef): number {
  let t = 0;
  for (const k in def.jobs) t += (def.jobs as any)[k] ?? 0;
  return t;
}
