import type { TechDef } from '../types';
import { FACILITIES } from './facilities';
import { COMPONENTS, STRUCTURES } from './components';

export const TIER_COST = [0, 400, 1000, 2500, 6000, 14000, 32000, 70000, 150000, 320000, 700000, 1500000, 3000000];

type T = Omit<TechDef, 'unlocks'> & { unlocks?: string[] };

const RAW: T[] = [
  // ---------------------------------------------------------------- Tier 0 (known in 2048)
  { id: 'reusable_launch', name: 'Rapid Reusable Launch', category: 'propulsion', tier: 0, prereqs: [], era: 1, description: 'Fully reusable heavy launch vehicles fly daily from a dozen spaceports.' },
  { id: 'chemical_rocketry', name: 'Advanced Chemical Rocketry', category: 'propulsion', tier: 0, prereqs: [], era: 1, description: 'Methalox and hydrolox engines with long service lives.' },
  { id: 'electric_propulsion', name: 'Solar-Electric Propulsion', category: 'propulsion', tier: 0, prereqs: [], era: 1, description: 'Hall-effect thrusters powered by photovoltaic wings.' },
  { id: 'autonomous_flight', name: 'Autonomous Spaceflight', category: 'computing', tier: 0, prereqs: [], era: 1, description: 'Uncrewed rendezvous, docking and landing are routine.' },
  { id: 'basic_life_support', name: 'Regenerative Life Support', category: 'lifeSupport', tier: 0, prereqs: [], era: 1, description: 'Station-class water recovery and CO₂ scrubbing.' },
  // ---------------------------------------------------------------- Tier 1
  { id: 'isru_propellant', name: 'Propellant ISRU', category: 'manufacturing', tier: 1, prereqs: [], era: 1, description: 'Production of rocket propellant from extraterrestrial water.' },
  { id: 'regolith_construction', name: 'Regolith Sintering', category: 'materials', tier: 1, prereqs: [], era: 1, description: 'Microwave and laser sintering of regolith into shielding, pads and bricks.' },
  { id: 'surface_fission', name: 'Surface Fission Power', category: 'nuclear', tier: 1, prereqs: [], era: 1, description: 'Compact fission reactors that survive the lunar night.' },
  { id: 'cryogenic_depots', name: 'Zero-Boil-Off Depots', category: 'propulsion', tier: 1, prereqs: [], era: 1, description: 'Long-term cryogenic storage and in-space propellant transfer.' },
  { id: 'atmospheric_isru', name: 'Atmospheric ISRU', category: 'manufacturing', tier: 1, prereqs: [], era: 1, description: 'Solid-oxide CO₂ electrolysis scaled up from the MOXIE experiment.' },
  { id: 'laser_communications', name: 'Optical Communications', category: 'communications', tier: 1, prereqs: [], era: 1, description: 'Laser links that carry gigabits across the Solar System.' },
  { id: 'deep_space_surveys', name: 'Deep-Space Surveys', category: 'astronomy', tier: 1, prereqs: [], era: 1, description: 'Infrared survey telescopes and automated orbit determination.', effects: { surveyGrowth: 0.5 } },
  { id: 'space_traffic_management', name: 'Space Traffic Management', category: 'orbital', tier: 1, prereqs: [], era: 1, description: 'Conjunction screening, active debris removal and traffic control.', effects: { debrisMitigation: 0.25 } },
  { id: 'autonomous_robotics', name: 'Autonomous Robotics', category: 'robotics', tier: 1, prereqs: [], era: 1, description: 'Field robots that dig, haul and assemble with little supervision.', effects: { automationMax: 1 } },
  { id: 'bioregenerative_life_support', name: 'Bioregenerative Life Support', category: 'lifeSupport', tier: 1, prereqs: [], era: 1, description: 'Plants and microbes close more of the water and oxygen loops.', effects: { lsWater: 0.02, lsOxygen: 0.15 } },
  { id: 'rapid_reusability', name: 'Airline-Style Reusability', category: 'propulsion', tier: 1, prereqs: [], era: 1, description: 'Hour-scale turnaround and propellant-dominated launch costs.', effects: { launchCost: -0.25 } },
  // ---------------------------------------------------------------- Tier 2
  { id: 'molten_regolith_electrolysis', name: 'Molten Regolith Electrolysis', category: 'manufacturing', tier: 2, prereqs: ['regolith_construction'], era: 2, description: 'Electrolysis of 1,600 °C molten regolith into oxygen and metal alloys.' },
  { id: 'space_metallurgy', name: 'Space Metallurgy', category: 'materials', tier: 2, prereqs: ['regolith_construction'], era: 2, description: 'Vacuum smelting and alloying of extraterrestrial metals.' },
  { id: 'space_chemistry', name: 'Space Chemical Engineering', category: 'manufacturing', tier: 2, prereqs: ['isru_propellant'], era: 2, description: 'Fischer–Tropsch synthesis and polymer production from local carbon.' },
  { id: 'orbital_assembly', name: 'Orbital Assembly', category: 'orbital', tier: 2, prereqs: ['autonomous_robotics'], era: 2, description: 'Robotic assembly of large structures and ships in orbit.' },
  { id: 'advanced_electric_propulsion', name: 'Advanced Electric Propulsion', category: 'propulsion', tier: 2, prereqs: [], era: 2, description: 'Megawatt-class plasma thrusters.' },
  { id: 'aerocapture', name: 'Aerocapture', category: 'propulsion', tier: 2, prereqs: ['cryogenic_depots'], era: 2, description: 'Using planetary atmospheres to brake into orbit with a heat shield.' },
  { id: 'algae_bioreactors', name: 'Algae Photobioreactors', category: 'lifeSupport', tier: 2, prereqs: ['bioregenerative_life_support'], era: 2, description: 'High-yield microalgae for food and oxygen.', effects: { lsOxygen: 0.1 } },
  { id: 'space_photovoltaics', name: 'In-Space Photovoltaics', category: 'energy', tier: 2, prereqs: ['space_metallurgy'], era: 2, description: 'Thin-film solar cells deposited from local silicon.' },
  { id: 'ai_logistics', name: 'AI Logistics', category: 'computing', tier: 2, prereqs: ['autonomous_robotics'], era: 2, description: 'Fleet scheduling, predictive maintenance and trajectory optimization.', effects: { freightCost: -0.08, reliability: 0.001 } },
  { id: 'point_defense', name: 'Point Defense', category: 'security', tier: 2, prereqs: ['space_traffic_management'], era: 2, description: 'Close-in defense against debris, missiles and drones.' },
  { id: 'radiation_medicine', name: 'Radiation Medicine', category: 'medicine', tier: 2, prereqs: ['bioregenerative_life_support'], era: 2, description: 'Radioprotective drugs and DNA-repair therapies.', effects: { radiationHealth: -0.25 } },
  { id: 'advanced_thermal_control', name: 'Advanced Thermal Control', category: 'energy', tier: 2, prereqs: ['surface_fission'], era: 2, description: 'High-temperature heat pipes and deployable radiators.' },
  // ---------------------------------------------------------------- Tier 3
  { id: 'nuclear_thermal_propulsion', name: 'Nuclear Thermal Propulsion', category: 'propulsion', tier: 3, prereqs: ['surface_fission'], era: 2, description: 'Solid-core reactors that heat hydrogen to 2,700 K.' },
  { id: 'asteroid_mining', name: 'Asteroid Mining', category: 'manufacturing', tier: 3, prereqs: ['orbital_assembly', 'molten_regolith_electrolysis'], era: 2, description: 'Anchoring, excavating and processing small bodies in microgravity.' },
  { id: 'space_machine_tools', name: 'Space Machine Tools', category: 'manufacturing', tier: 3, prereqs: ['space_metallurgy'], era: 2, description: 'Precision machining and motor manufacturing off Earth.' },
  { id: 'lava_tube_engineering', name: 'Lava-Tube Engineering', category: 'orbital', tier: 3, prereqs: ['regolith_construction'], era: 2, description: 'Sealing and pressurizing natural lava tubes.' },
  { id: 'rare_element_extraction', name: 'Rare Element Extraction', category: 'manufacturing', tier: 3, prereqs: ['molten_regolith_electrolysis'], era: 2, description: 'Selective extraction of thorium, rare earths and phosphorus.' },
  { id: 'cellular_agriculture', name: 'Cellular Agriculture', category: 'lifeSupport', tier: 3, prereqs: ['algae_bioreactors'], era: 3, description: 'Industrial bioreactors that grow protein without fields.' },
  { id: 'low_gravity_medicine', name: 'Low-Gravity Medicine', category: 'medicine', tier: 3, prereqs: ['radiation_medicine'], era: 2, description: 'Bone-density drugs, prenatal centrifuges and pediatric protocols for low gravity.', effects: { gravityHealth: -0.4, lowGBirths: 1 } },
  { id: 'advanced_fission', name: 'Advanced Fission', category: 'nuclear', tier: 3, prereqs: ['surface_fission'], era: 2, description: 'Molten-salt thorium breeders.' },
  { id: 'industrial_ai', name: 'Industrial AI', category: 'computing', tier: 3, prereqs: ['ai_logistics'], era: 3, description: 'Autonomous control of whole industrial facilities.', effects: { automationMax: 1 } },
  { id: 'advanced_composites', name: 'Advanced Composites', category: 'materials', tier: 3, prereqs: ['space_chemistry'], era: 2, description: 'Carbon-fibre structures manufactured off Earth.' },
  { id: 'kinetic_interceptors', name: 'Kinetic Interceptors', category: 'security', tier: 3, prereqs: ['point_defense'], era: 2, description: 'Railguns and hypervelocity kill vehicles.', effects: { deflection: 0.1 } },
  { id: 'gravitational_tractors', name: 'Gravity Tractors', category: 'astronomy', tier: 3, prereqs: ['deep_space_surveys'], era: 2, description: 'Slow, precise asteroid deflection using a spacecraft\'s gravity.', effects: { deflection: 0.1 } },
  { id: 'interplanetary_internet', name: 'Interplanetary Internet', category: 'communications', tier: 3, prereqs: ['laser_communications'], era: 2, description: 'Delay-tolerant networking across the Solar System.', effects: { latencyPenalty: -0.3 } },
  { id: 'solar_physics', name: 'Solar Storm Forecasting', category: 'astronomy', tier: 3, prereqs: ['deep_space_surveys'], era: 2, description: 'Heliophysics models that give days of warning before particle storms.', effects: { flareDamage: -0.5 } },
  // ---------------------------------------------------------------- Tier 4
  { id: 'mass_drivers', name: 'Mass Drivers', category: 'orbital', tier: 4, prereqs: ['space_machine_tools'], era: 3, description: 'Electromagnetic catapults for launching cargo from airless worlds.' },
  { id: 'large_pressure_structures', name: 'Large Pressure Structures', category: 'orbital', tier: 4, prereqs: ['lava_tube_engineering', 'advanced_composites'], era: 3, description: 'Multi-hectare pressurized domes and vaults.' },
  { id: 'rotating_habitats', name: 'Rotating Habitats', category: 'orbital', tier: 4, prereqs: ['orbital_assembly', 'advanced_composites'], era: 3, description: 'Spin-gravity wheels at the scale of a small town.' },
  { id: 'space_electronics_assembly', name: 'Space Electronics Assembly', category: 'manufacturing', tier: 4, prereqs: ['space_machine_tools'], era: 3, description: 'Board assembly and electronics integration off Earth.' },
  { id: 'offworld_fuel_cycle', name: 'Off-World Nuclear Fuel Cycle', category: 'nuclear', tier: 4, prereqs: ['advanced_fission', 'rare_element_extraction'], era: 3, description: 'Enrichment and fuel fabrication without Earth.' },
  { id: 'bimodal_ntr', name: 'Bimodal Nuclear Rockets', category: 'propulsion', tier: 4, prereqs: ['nuclear_thermal_propulsion'], era: 3, description: 'NTR engines that double as power reactors.' },
  { id: 'closed_loop_ecology', name: 'Closed-Loop Ecology', category: 'lifeSupport', tier: 4, prereqs: ['cellular_agriculture'], era: 3, description: 'Near-total recycling of water, air and nutrients.', effects: { lsWater: 0.03, lsOxygen: 0.15 } },
  { id: 'scientific_ai', name: 'Scientific AI', category: 'computing', tier: 4, prereqs: ['industrial_ai'], era: 3, description: 'Machine hypothesis generation and automated laboratories.', effects: { researchMult: 0.25 } },
  { id: 'advanced_planetary_defense', name: 'Standoff Deflection', category: 'astronomy', tier: 4, prereqs: ['kinetic_interceptors', 'gravitational_tractors'], era: 3, description: 'Nuclear standoff and ion-beam deflection of large impactors.', effects: { deflection: 0.2 } },
  { id: 'high_temp_ceramics', name: 'High-Temperature Ceramics', category: 'materials', tier: 4, prereqs: ['advanced_composites'], era: 3, description: 'Ultra-high-temperature ceramics for reactors and heat shields.' },
  { id: 'digital_democracy', name: 'Deliberative Platforms', category: 'computing', tier: 4, prereqs: ['interplanetary_internet'], era: 3, description: 'Secure, delay-tolerant participation for citizens on many worlds.' },
  { id: 'advanced_sensors', name: 'Advanced Sensors', category: 'security', tier: 4, prereqs: ['point_defense'], era: 3, description: 'Space situational awareness out to planetary distances.' },
  // ---------------------------------------------------------------- Tier 5
  { id: 'nuclear_electric_propulsion', name: 'Nuclear-Electric Propulsion', category: 'propulsion', tier: 5, prereqs: ['advanced_fission', 'advanced_electric_propulsion'], era: 3, description: 'Multi-megawatt reactors that drive ion engines.' },
  { id: 'aerostat_habitats', name: 'Aerostat Habitats', category: 'orbital', tier: 5, prereqs: ['large_pressure_structures'], era: 3, description: 'Cities that float in Venus\'s atmosphere.' },
  { id: 'hts_manufacturing', name: 'Superconductor Manufacturing', category: 'materials', tier: 5, prereqs: ['rare_element_extraction', 'space_electronics_assembly'], era: 3, description: 'REBCO tape for magnets and power lines.' },
  { id: 'helium3_extraction', name: 'Helium-3 Extraction', category: 'manufacturing', tier: 5, prereqs: ['rare_element_extraction'], era: 3, description: 'Harvesting solar-wind helium-3 from lunar regolith.' },
  { id: 'self_maintaining_systems', name: 'Self-Maintaining Systems', category: 'robotics', tier: 5, prereqs: ['industrial_ai', 'space_machine_tools'], era: 4, description: 'Facilities that diagnose and repair themselves.', effects: { automationMax: 1, maintenance: -0.2 } },
  { id: 'gene_therapy', name: 'Somatic Gene Therapy', category: 'genetics', tier: 5, prereqs: ['low_gravity_medicine'], era: 3, description: 'Routine correction of genetic disease, and the first enhancement therapies.', effects: { healthBonus: 0.05 } },
  { id: 'beamed_power', name: 'Beamed Power', category: 'energy', tier: 5, prereqs: ['space_photovoltaics', 'high_temp_ceramics'], era: 4, description: 'Microwave and laser power transmission across space.' },
  { id: 'directed_energy', name: 'Directed Energy', category: 'security', tier: 5, prereqs: ['kinetic_interceptors', 'advanced_fission'], era: 3, description: 'Megawatt free-electron lasers.' },
  { id: 'ice_shell_habitats', name: 'Ice-Shell Habitats', category: 'orbital', tier: 5, prereqs: ['large_pressure_structures'], era: 4, description: 'Habitats melted deep into the crusts of icy moons.' },
  { id: 'outer_system_exploration', name: 'Outer System Operations', category: 'astronomy', tier: 5, prereqs: ['nuclear_thermal_propulsion', 'interplanetary_internet'], era: 4, description: 'Operational experience beyond the Belt.' },
  { id: 'autonomous_mining', name: 'Autonomous Mining', category: 'robotics', tier: 5, prereqs: ['industrial_ai', 'asteroid_mining'], era: 4, description: 'Mining and refining complexes that need no human workers.' },
  // ---------------------------------------------------------------- Tier 6
  { id: 'orbital_semiconductor_fab', name: 'Off-World Semiconductor Fabrication', category: 'manufacturing', tier: 6, prereqs: ['space_electronics_assembly', 'high_temp_ceramics'], era: 4, description: 'Ultra-clean lithography in vacuum. Breaks the last dependency on Earth.' },
  { id: 'torus_habitats', name: 'Torus Habitats', category: 'orbital', tier: 6, prereqs: ['rotating_habitats', 'mass_drivers'], era: 4, description: 'Kilometre-scale spinning wheels shielded by lunar slag.' },
  { id: 'arcology_design', name: 'Arcology Design', category: 'orbital', tier: 6, prereqs: ['large_pressure_structures', 'closed_loop_ecology'], era: 4, description: 'Self-contained megastructure cities.' },
  { id: 'graphene_structures', name: 'Nanotube Structures', category: 'materials', tier: 6, prereqs: ['advanced_composites', 'high_temp_ceramics'], era: 4, description: 'Carbon nanotube and graphene structural materials.' },
  { id: 'magnetic_sails', name: 'Magnetic Sails', category: 'propulsion', tier: 6, prereqs: ['hts_manufacturing'], era: 4, description: 'Superconducting loops that ride the solar wind.' },
  { id: 'algorithmic_administration', name: 'Algorithmic Administration', category: 'computing', tier: 6, prereqs: ['scientific_ai'], era: 4, description: 'AI systems that run permitting, logistics planning and public services.', effects: { bureaucracy: 0.15 } },
  { id: 'liquid_droplet_radiators', name: 'Liquid Droplet Radiators', category: 'energy', tier: 6, prereqs: ['high_temp_ceramics'], era: 4, description: 'Radiators that reject hundreds of megawatts per unit.' },
  { id: 'human_adaptation', name: 'Radiation-Resistance Editing', category: 'genetics', tier: 6, prereqs: ['gene_therapy'], era: 4, description: 'Heritable edits that improve DNA repair and bone retention. Deeply controversial.', effects: { radiationHealth: -0.35, gravityHealth: -0.3, enhancement: 1 } },
  // ---------------------------------------------------------------- Tier 7
  { id: 'fusion_power', name: 'Fusion Power', category: 'nuclear', tier: 7, prereqs: ['hts_manufacturing', 'advanced_fission'], era: 4, description: 'Compact high-field D–He3 fusion power plants.' },
  { id: 'asteroid_hollowing', name: 'Asteroid Hollowing', category: 'orbital', tier: 7, prereqs: ['autonomous_mining', 'rotating_habitats'], era: 4, description: 'Excavating and spinning asteroids into habitats.' },
  { id: 'partial_self_replication', name: 'Partial Self-Replication', category: 'robotics', tier: 7, prereqs: ['self_maintaining_systems', 'autonomous_mining'], era: 5, description: 'Factories that build most of their own components.', effects: { automationMax: 1 } },
  { id: 'launch_loops', name: 'Launch Loops', category: 'orbital', tier: 7, prereqs: ['graphene_structures', 'mass_drivers'], era: 4, description: 'Dynamic structures that lift payloads from Earth for the price of electricity.' },
  { id: 'life_extension', name: 'Life Extension', category: 'medicine', tier: 7, prereqs: ['gene_therapy'], era: 4, description: 'Senolytics and tissue regeneration.', effects: { lifeExpectancy: 12 } },
  { id: 'machine_cognition', name: 'Machine Cognition', category: 'computing', tier: 7, prereqs: ['algorithmic_administration'], era: 5, description: 'General-purpose artificial minds, which raise hard questions about rights and control.', effects: { researchMult: 0.5, aiRisk: 0.15 } },
  // ---------------------------------------------------------------- Tier 8
  { id: 'fusion_drives', name: 'Fusion Drives', category: 'propulsion', tier: 8, prereqs: ['fusion_power'], era: 5, description: 'Fusion plasma used directly as rocket exhaust.' },
  { id: 'oneill_cylinders', name: "O'Neill Cylinders", category: 'orbital', tier: 8, prereqs: ['torus_habitats', 'graphene_structures'], era: 5, description: 'Rotating cylinders tens of kilometres long.' },
  { id: 'gas_giant_scooping', name: 'Gas Giant Scooping', category: 'manufacturing', tier: 8, prereqs: ['fusion_power', 'outer_system_exploration'], era: 5, description: 'Nuclear aerostats that harvest helium-3 from giant planets.' },
  { id: 'laser_sails', name: 'Beam-Riding Sails', category: 'propulsion', tier: 8, prereqs: ['beamed_power', 'graphene_structures'], era: 5, description: 'Propellantless transport pushed by power beams.' },
  { id: 'solar_gravitational_lens', name: 'Solar Gravitational Lens', category: 'astronomy', tier: 8, prereqs: ['outer_system_exploration', 'advanced_sensors'], era: 5, description: 'Telescopes at 550 AU that use the Sun as a lens.' },
  { id: 'orbital_rings', name: 'Orbital Rings', category: 'orbital', tier: 8, prereqs: ['graphene_structures', 'launch_loops'], era: 5, description: 'Planet-encircling rings supported by magnetic momentum.' },
  // ---------------------------------------------------------------- Tier 9
  { id: 'self_replicating_industry', name: 'Self-Replicating Industry', category: 'robotics', tier: 9, prereqs: ['partial_self_replication', 'orbital_semiconductor_fab'], era: 5, description: 'Industrial ecosystems that reproduce themselves from raw rock and sunlight.', effects: { automationMax: 1 } },
  { id: 'aneutronic_fusion', name: 'Aneutronic Fusion', category: 'nuclear', tier: 9, prereqs: ['fusion_power'], era: 5, description: 'Direct conversion of charged fusion products into electricity.', effects: { fusionEfficiency: 0.35 } },
  { id: 'dyson_collectors', name: 'Helios Collectors', category: 'megastructure', tier: 9, prereqs: ['beamed_power', 'graphene_structures', 'partial_self_replication'], era: 5, description: 'Independent orbiting solar collectors, the building blocks of a Dyson swarm.' },
  { id: 'space_elevator_materials', name: 'Space Elevators', category: 'orbital', tier: 9, prereqs: ['orbital_rings'], era: 5, description: 'Tethers strong enough to reach synchronous orbit from Mars.' },
  // ---------------------------------------------------------------- Tier 10
  { id: 'advanced_fusion_drives', name: 'Aneutronic Torch Drives', category: 'propulsion', tier: 10, prereqs: ['fusion_drives', 'aneutronic_fusion'], era: 6, description: 'Torch ships with 800 km/s exhaust.' },
  { id: 'thin_film_collectors', name: 'Ultralight Collectors', category: 'megastructure', tier: 10, prereqs: ['dyson_collectors'], era: 6, description: 'Collectors a few grams per square metre thick.', effects: { collectorDensity: -0.6 } },
  { id: 'swarm_coordination', name: 'Swarm Coordination', category: 'megastructure', tier: 10, prereqs: ['dyson_collectors', 'machine_cognition'], era: 6, description: 'Distributed control of billions of collectors with collision avoidance.', effects: { collectorFailure: -0.5 } },
  { id: 'interstellar_precursors', name: 'Interstellar Precursor Probes', category: 'astronomy', tier: 10, prereqs: ['fusion_drives', 'solar_gravitational_lens'], era: 6, description: 'Probes to the Oort cloud and beyond.' },
  // ---------------------------------------------------------------- Tier 11
  { id: 'megastructure_habitats', name: 'Megastructure Habitats', category: 'orbital', tier: 11, prereqs: ['oneill_cylinders', 'self_replicating_industry'], era: 6, description: 'Free-space habitats with the living area of continents.' },
  { id: 'statite_collectors', name: 'High-Temperature Collectors', category: 'megastructure', tier: 11, prereqs: ['thin_film_collectors', 'liquid_droplet_radiators'], era: 6, description: 'Collectors that survive within 0.1 AU of the Sun.', effects: { collectorTemp: 400 } },
  { id: 'matrioshka_computing', name: 'Stellar Computing', category: 'megastructure', tier: 11, prereqs: ['swarm_coordination'], era: 6, description: 'Swarm-scale computation powered by collected sunlight.', effects: { computeResearch: 1 } },
  // ---------------------------------------------------------------- Tier 12
  { id: 'stellar_engineering', name: 'Stellar Engineering', category: 'megastructure', tier: 12, prereqs: ['statite_collectors', 'advanced_fusion_drives'], era: 6, description: 'The theory of star lifting and stellar control. It points to a future beyond the swarm.', effects: { researchMult: 0.25 } },
];

function deriveUnlocks(id: string): string[] {
  const u: string[] = [];
  for (const f of FACILITIES) if (f.tech === id) u.push(`Facility: ${f.name}`);
  for (const c of COMPONENTS) if (c.tech === id) u.push(`Component: ${c.name}`);
  for (const s of STRUCTURES) if (s.tech === id) u.push(`Structure: ${s.name}`);
  return u;
}

const EFFECT_TEXT: Record<string, (v: number) => string> = {
  surveyGrowth: (v) => `Survey coverage grows ${Math.round(v * 100)}% faster`,
  debrisMitigation: (v) => `Orbital debris risk −${Math.round(v * 100)}%`,
  automationMax: () => `Automation ceiling +1 level`,
  lsWater: (v) => `Water recovery +${(v * 100).toFixed(0)} pts`,
  lsOxygen: (v) => `Oxygen recovery +${(v * 100).toFixed(0)} pts`,
  launchCost: (v) => `Earth launch cost ${Math.round(v * 100)}%`,
  freightCost: (v) => `Freight costs ${Math.round(v * 100)}%`,
  reliability: () => `Ship reliability improved`,
  radiationHealth: (v) => `Radiation health effects ${Math.round(v * 100)}%`,
  gravityHealth: (v) => `Low-gravity health effects ${Math.round(v * 100)}%`,
  lowGBirths: () => `Healthy pregnancies possible in low gravity`,
  deflection: (v) => `Asteroid deflection success +${Math.round(v * 100)}%`,
  latencyPenalty: (v) => `Communication-delay penalties ${Math.round(v * 100)}%`,
  flareDamage: (v) => `Solar-storm damage ${Math.round(v * 100)}%`,
  researchMult: (v) => `Research output +${Math.round(v * 100)}%`,
  maintenance: (v) => `Facility maintenance ${Math.round(v * 100)}%`,
  healthBonus: () => `Population health improved`,
  bureaucracy: (v) => `Bureaucratic effectiveness +${Math.round(v * 100)}%`,
  enhancement: () => `Enables heritable human enhancement (political controversy)`,
  lifeExpectancy: (v) => `Life expectancy +${v} years`,
  aiRisk: () => `Raises AI governance risk`,
  fusionEfficiency: (v) => `Fusion fuel efficiency +${Math.round(v * 100)}%`,
  collectorDensity: (v) => `Collector areal density ${Math.round(v * 100)}%`,
  collectorFailure: (v) => `Collector failure rate ${Math.round(v * 100)}%`,
  collectorTemp: (v) => `Collector temperature limit +${v} K`,
  computeResearch: () => `Swarm computing accelerates research`,
};

export const TECHS: TechDef[] = RAW.map((t) => {
  const unlocks = deriveUnlocks(t.id);
  if (t.effects) for (const k in t.effects) if (EFFECT_TEXT[k]) unlocks.push(EFFECT_TEXT[k](t.effects[k]));
  return { ...t, unlocks };
});

export const TECH: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

export function techCost(t: TechDef): number {
  return TIER_COST[t.tier] ?? 1e7;
}

export const TECH_CATEGORIES = [
  'propulsion',
  'materials',
  'energy',
  'nuclear',
  'computing',
  'robotics',
  'medicine',
  'genetics',
  'lifeSupport',
  'manufacturing',
  'communications',
  'astronomy',
  'orbital',
  'security',
  'megastructure',
];
