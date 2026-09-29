import type { GrandProjectDef } from '../types';

export const GRAND_PROJECTS: GrandProjectDef[] = [
  { id: 'pd_array', name: 'Planetary Defense Array', tech: 'advanced_planetary_defense', cost: 4.0e10, months: 48, materials: { alloys: 3000, electronics: 200, machinery: 400 }, modifiers: { deflection: 0.25, surveyGrowth: 0.5 }, effectsText: 'A standing fleet of interceptors and standoff devices at EML1. Asteroid deflection +25%.', description: 'Permanent readiness against any impactor.' },
  { id: 'lunar_mass_driver_network', name: 'Lunar Export Network', tech: 'mass_drivers', cost: 8.0e10, months: 60, materials: { alloys: 20000, superconductors: 100, machinery: 1500, electronics: 150 }, bodies: ['moon'], modifiers: { lunarExport: 1, freightCost: -0.1 }, effectsText: 'Mass drivers and catcher stations across the Moon. Cislunar freight costs −10%.', description: 'Linking every lunar settlement to cislunar space.' },
  { id: 'launch_loop', name: 'Launch Loop', tech: 'launch_loops', cost: 3.0e11, months: 96, materials: { alloys: 150000, composites: 30000, superconductors: 3000, machinery: 8000, electronics: 800 }, modifiers: { launchCost: -0.6, launchCapacity: 2.0 }, effectsText: 'An 80-km-high dynamic structure. Earth launch cost −60%, capacity ×3.', description: 'Lifting payloads from Earth for the price of electricity.' },
  { id: 'orbital_ring', name: 'Earth Orbital Ring', tech: 'orbital_rings', cost: 3.0e12, months: 180, materials: { alloys: 3e6, composites: 1e6, superconductors: 50000, machinery: 1e5, electronics: 1e4 }, modifiers: { launchCost: -0.3, launchCapacity: 20 }, effectsText: 'A ring around the planet with elevators to the surface. Launch capacity ×20.', description: 'Ending the tyranny of the rocket equation at Earth.' },
  { id: 'mars_elevator', name: 'Mars Space Elevator', tech: 'space_elevator_materials', cost: 1.5e12, months: 120, materials: { composites: 5e5, alloys: 2e5, machinery: 2e4, electronics: 3000 }, bodies: ['mars'], modifiers: { marsAscent: 1 }, effectsText: 'Ascent from the Mars surface costs no propellant.', description: 'A nanotube tether from Arsia Mons to areosynchronous orbit.' },
  { id: 'sgl_telescope', name: 'Solar Gravitational Lens Telescope', tech: 'solar_gravitational_lens', cost: 2.0e11, months: 120, materials: { alloys: 5000, electronics: 1000, machinery: 500 }, modifiers: { researchMult: 0.15, legitimacy: 0.03 }, effectsText: 'Images exoplanet surfaces at kilometre resolution. Research +15%, legitimacy +3%.', description: 'A telescope 550 AU out, using the Sun as a lens.' },
  { id: 'interstellar_probe', name: 'Interstellar Precursor Probe', tech: 'interstellar_precursors', cost: 5.0e11, months: 144, materials: { alloys: 20000, superconductors: 1000, electronics: 2000, fusionFuel: 200 }, modifiers: { researchMult: 0.1, legitimacy: 0.05 }, effectsText: 'A fusion probe bound for Alpha Centauri. Legitimacy +5%.', description: 'Humanity\'s first reach for another star.' },
  { id: 'mars_shield', name: 'Mars Magnetic Shield', tech: 'hts_manufacturing', cost: 2.5e11, months: 96, materials: { superconductors: 20000, alloys: 50000, machinery: 3000, electronics: 500 }, bodies: ['mars'], modifiers: { marsRadiation: -0.6 }, effectsText: 'A dipole at Mars L1 deflects the solar wind. Mars surface radiation −60%.', description: 'An artificial magnetosphere for the red planet.' },
  { id: 'venus_sunshade', name: 'Venus Sunshade', tech: 'dyson_collectors', cost: 5.0e12, months: 240, materials: { photovoltaics: 1e7, alloys: 1e6, electronics: 1e4 }, bodies: ['venus'], modifiers: { venusCooling: 1, legitimacy: 0.02 }, effectsText: 'Begins cooling Venus, and also powers the cloud cities.', description: 'A first step toward remaking a world.' },
  { id: 'mercury_mass_driver_network', name: 'Mercury Mass-Driver Network', tech: 'mass_drivers', cost: 6.0e11, months: 96, materials: { alloys: 3e5, superconductors: 5000, machinery: 2e4, electronics: 2000, copper: 20000 }, bodies: ['mercury'], modifiers: { mercuryLaunch: 1 }, effectsText: 'Equatorial drivers fire collectors directly into swarm orbits, removing the launch bottleneck.', description: 'A ring of electromagnetic catapults around Mercury\'s equator.' },
];

export const GRAND_PROJECT: Record<string, GrandProjectDef> = Object.fromEntries(GRAND_PROJECTS.map((g) => [g.id, g]));

export interface MilestoneDef {
  id: string;
  name: string;
  description: string;
  era: number;
}

export const MILESTONES: MilestoneDef[] = [
  { id: 'une_lunar_base', name: 'UNE Lunar Base', description: 'The UNE establishes its own lunar research base.', era: 1 },
  { id: 'lunar_permanent', name: 'Permanent Lunar Civilization', description: 'A lunar settlement of 1,000 people where families raise children.', era: 2 },
  { id: 'propellant_economy', name: 'Cislunar Propellant Economy', description: 'Off-world propellant production exceeds 10,000 t per year.', era: 2 },
  { id: 'first_offworld_birth', name: 'First Child Born Beyond Earth', description: 'A human being is born beyond Earth.', era: 2 },
  { id: 'asteroid_mining', name: 'First Asteroid Mine', description: 'An asteroid mining settlement begins production.', era: 2 },
  { id: 'mars_landing', name: 'Humans on Mars', description: 'A permanent settlement is founded on Mars.', era: 3 },
  { id: 'multiplanetary', name: 'Multiplanetary Humanity', description: 'Ten thousand people live on Mars.', era: 3 },
  { id: 'independent_industry', name: 'Independent Space Industry', description: 'An off-world settlement reaches 80% industrial closure.', era: 3 },
  { id: 'million_offworld', name: 'One Million Beyond Earth', description: 'One million people live off Earth.', era: 3 },
  { id: 'fusion_age', name: 'Fusion Age', description: 'The first fusion power plant comes online.', era: 4 },
  { id: 'belt_capital', name: 'Capital of the Belt', description: 'A settlement in the Belt reaches 100,000 people.', era: 4 },
  { id: 'solar_economy', name: 'Solar Economy', description: 'The off-world economy reaches 10% of Earth\'s GDP.', era: 4 },
  { id: 'outer_system', name: 'Beyond the Snow Line', description: 'A settlement is founded in the Jupiter or Saturn system.', era: 4 },
  { id: 'billion_offworld', name: 'Billion Off-World Citizens', description: 'One billion people live off Earth.', era: 5 },
  { id: 'autonomous_civilization', name: 'Autonomous Industrial Civilization', description: 'Self-replicating industry is operating.', era: 5 },
  { id: 'first_collector', name: 'First Light', description: 'The first Helios collector enters solar orbit.', era: 5 },
  { id: 'million_collectors', name: 'Million Dyson Collectors', description: 'One million collectors orbit the Sun.', era: 6 },
  { id: 'billion_collectors', name: 'One Billion Dyson Collectors', description: 'One billion collectors orbit the Sun.', era: 6 },
  { id: 'capture_0001', name: '0.01% Solar Capture', description: 'The swarm intercepts 0.01% of the Sun\'s luminosity.', era: 6 },
  { id: 'capture_001', name: '0.1% Solar Capture', description: 'The swarm intercepts 0.1% of the Sun\'s luminosity.', era: 6 },
  { id: 'capture_01', name: '1% Solar Capture', description: 'The swarm intercepts 1% of the Sun\'s luminosity.', era: 6 },
];

export const MILESTONE: Record<string, MilestoneDef> = Object.fromEntries(MILESTONES.map((m) => [m.id, m]));

export const ERAS = [
  { id: 1, name: 'Era I — Earth Orbit', short: 'Earth Orbit' },
  { id: 2, name: 'Era II — Cislunar Civilization', short: 'Cislunar' },
  { id: 3, name: 'Era III — First Interplanetary Settlements', short: 'Interplanetary' },
  { id: 4, name: 'Era IV — Solar Economy', short: 'Solar Economy' },
  { id: 5, name: 'Era V — Autonomous Industrialization', short: 'Autonomous' },
  { id: 6, name: 'Era VI — Helios Era', short: 'Helios' },
];

// ---------------------------------------------------------------------------
// Name pools for procedural characters and settlements
// ---------------------------------------------------------------------------
export const NAME_POOLS: Record<string, { given: string[]; family: string[] }> = {
  american: { given: ['Jordan', 'Avery', 'Maya', 'Elena', 'Marcus', 'Ruth', 'Daniel', 'Keisha', 'Luis', 'Grace', 'Nathan', 'Priya', 'Carmen', 'Owen', 'Tamsin'], family: ['Reyes', 'Walker', 'Okafor', 'Chen', 'Hollis', 'Barrett', 'Nguyen', 'Delgado', 'Whitfield', 'Park', 'Ramsey', 'Castellano'] },
  european: { given: ['Lena', 'Matthias', 'Chiara', 'Joaquín', 'Sofie', 'Pieter', 'Amélie', 'Tomasz', 'Ingrid', 'Luca', 'Maren', 'Dimitra', 'Henrik', 'Aoife'], family: ['Van der Berg', 'Rossi', 'Kowalski', 'Lindqvist', 'Moreau', 'Schneider', 'Papadopoulos', 'García', 'Novák', 'Byrne', 'Dubois', 'Horvat'] },
  chinese: { given: ['Wei', 'Lin', 'Jiahui', 'Hao', 'Mingyu', 'Xiaoyan', 'Jun', 'Yifan', 'Shuang', 'Zhen', 'Ruoxi', 'Tao'], family: ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Zhao', 'Huang', 'Zhou', 'Wu', 'Xu', 'Sun'] },
  indian: { given: ['Aarav', 'Ananya', 'Rohan', 'Kavya', 'Vikram', 'Ishita', 'Arjun', 'Meera', 'Siddharth', 'Lakshmi', 'Dev', 'Nandini'], family: ['Sharma', 'Iyer', 'Reddy', 'Banerjee', 'Patel', 'Nair', 'Gupta', 'Menon', 'Desai', 'Kulkarni', 'Singh', 'Rao'] },
  japanese: { given: ['Haruto', 'Yui', 'Sora', 'Aoi', 'Ren', 'Hina', 'Kaito', 'Mio', 'Riku', 'Sakura', 'Takumi', 'Emi'], family: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Mori', 'Fujita'] },
  russian: { given: ['Anya', 'Dmitri', 'Katya', 'Mikhail', 'Oksana', 'Pavel', 'Svetlana', 'Yuri', 'Irina', 'Alexei', 'Vera', 'Nikolai'], family: ['Ivanova', 'Petrov', 'Sokolova', 'Volkov', 'Morozova', 'Kuznetsov', 'Orlova', 'Lebedev', 'Kozlova', 'Belov'] },
  brazilian: { given: ['Luana', 'Thiago', 'Beatriz', 'Rafael', 'Camila', 'Gustavo', 'Isabela', 'Mateus', 'Larissa', 'Caio', 'Júlia', 'Enzo'], family: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Ferreira', 'Almeida', 'Rocha', 'Carvalho'] },
  indonesian: { given: ['Putri', 'Budi', 'Sari', 'Adi', 'Dewi', 'Rizky', 'Intan', 'Arief', 'Wulan', 'Bayu', 'Ayu', 'Eko'], family: ['Santoso', 'Wijaya', 'Hidayat', 'Kusuma', 'Pratama', 'Nugroho', 'Halim', 'Siregar', 'Saputra', 'Lestari'] },
  african: { given: ['Amara', 'Kwame', 'Zanele', 'Chidi', 'Fatou', 'Tendai', 'Nia', 'Kofi', 'Ayodele', 'Makena', 'Sekou', 'Wanjiru', 'Yared', 'Thandiwe'], family: ['Okonkwo', 'Mensah', 'Diallo', 'Nkosi', 'Abebe', 'Mwangi', 'Traoré', 'Adeyemi', 'Banda', 'Kamau', 'Haile', 'Ndlovu'] },
  korean: { given: ['Minjun', 'Seoyeon', 'Jiho', 'Haeun', 'Doyun', 'Jiwoo', 'Yuna', 'Siwoo', 'Eunji', 'Hyunwoo'], family: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim'] },
  british: { given: ['Oliver', 'Imogen', 'Harriet', 'Rhys', 'Callum', 'Eleanor', 'Priya', 'Fergus', 'Niamh', 'Isaac', 'Freya'], family: ['Hughes', 'Ashworth', 'Patel', 'MacLeod', 'Thornton', 'Evans', 'Blackwood', 'Kaur', 'Fraser', 'Pembroke'] },
  arabic: { given: ['Layla', 'Omar', 'Yasmin', 'Karim', 'Noor', 'Tariq', 'Salma', 'Hassan', 'Mariam', 'Faris', 'Rania', 'Idris'], family: ['Al-Mansouri', 'Haddad', 'Nasser', 'Khalil', 'Farouk', 'Al-Qasimi', 'Saleh', 'Aziz', 'Rahman', 'Darwish'] },
  latin: { given: ['Valentina', 'Mateo', 'Camila', 'Santiago', 'Lucía', 'Diego', 'Ximena', 'Andrés', 'Paula', 'Emilio', 'Renata'], family: ['Hernández', 'Morales', 'Vargas', 'Castillo', 'Rojas', 'Mendoza', 'Quispe', 'Ramírez', 'Torres', 'Fuentes'] },
  asianPacific: { given: ['Ayesha', 'Tuan', 'Malia', 'Imran', 'Nattapong', 'Lani', 'Rahim', 'Linh', 'Kiri', 'Farah', 'Arnav', 'Mei'], family: ['Khan', 'Tran', 'Fonoti', 'Rahman', 'Srisai', 'Santos', 'Hossain', 'Pham', 'Ngata', 'Malik', 'Wongsakul'] },
  mixed: { given: ['Alex', 'Samira', 'Jonas', 'Leyla', 'Mikael', 'Oona', 'Emre', 'Talia', 'Bohdan', 'Astrid', 'Noa', 'Elif'], family: ['Novak', 'Demir', 'Larsen', 'Cohen', 'Kovalenko', 'Tremblay', 'Aydın', 'Haugen', 'Meier', 'Bondarenko'] },
  offworld: { given: ['Selene', 'Orion', 'Tycho', 'Vesper', 'Ares', 'Kepler', 'Lyra', 'Nova', 'Io', 'Rhea', 'Cassini', 'Halley', 'Sol', 'Mira', 'Zenith'], family: ['Shackleton', 'Aldrin-Okafor', 'Tranquility', 'Marsden', 'Voss', 'Kaur-Chen', 'Hellas', 'Arcadia', 'Ceresi', 'Lagrange', 'Oberth', 'Tsiolkov'] },
};

export const SETTLEMENT_NAMES: Record<string, string[]> = {
  luna_shackleton: ['Shackleton Station', 'Rimlight', 'Peary Point'],
  luna_malapert: ['Malapert Relay', 'Earthview'],
  luna_tranquillitatis: ['Tranquility Base', 'Serenity Deep', 'Armstrong Tubes'],
  luna_procellarum: ['Procellarum', 'Marius Hills', 'Kreepton'],
  luna_daedalus: ['Daedalus Observatory', 'Quiet Side'],
  luna_gateway: ['Gateway Station', 'Halo Port'],
  leo: ['Gateway LEO', 'Low Orbit Exchange'],
  geo: ['Clarke Station', 'Geosync Yards'],
  eml1: ['L1 Depot', 'Crossroads'],
  eml5: ['Island One', 'Lagrange Five', 'Halcyon'],
  nea_bennu: ['Bennu Works'],
  nea_ryugu: ['Ryugu Station', 'Dragon Palace'],
  nea_amun: ['Amun Foundry', 'Iron Crown'],
  mars_orbit: ['Areostation', 'Mars High Port'],
  phobos: ['Stickney Port', 'Phobos Depot'],
  deimos: ['Deimos Yards'],
  mars_jezero: ['Jezero', 'Perseverance'],
  mars_arcadia: ['New Arcadia', 'Arcadia Planitia Settlement', 'First Landing'],
  mars_hellas: ['Hellas City', 'Low Hellas'],
  mars_arsia: ['Arsia Caves', 'Tharsis Station'],
  mars_nili: ['Nili Works', 'Fossae'],
  venus_orbit: ['Aphrodite Orbital'],
  venus_clouds: ['Cloud City Aphrodite', 'Ishtar Float'],
  mercury_orbit: ['Hermes Orbital'],
  mercury_prokofiev: ['Prokofiev Base', 'Shadowline'],
  mercury_caloris: ['Caloris Industrial Zone', 'Forge'],
  ceres_orbit: ['Ceres Ring', 'Occator High'],
  ceres: ['Occator', 'Ceres Prime', 'Piazzi'],
  vesta: ['Rheasilvia Works', 'Vesta Station'],
  psyche: ['Psyche Ironworks', 'Metalhaven'],
  callisto: ['Valhalla Base', 'Callisto Harbor'],
  ganymede: ['Galileo Regio', 'Ganymede Deep'],
  europa: ['Conamara Station', 'Thera'],
  io: ['Loki Automated Works'],
  titan: ['Kraken Shore', 'Huygens', 'Shangri-La'],
  enceladus: ['Tiger Stripe Station', 'Baghdad Sulcus'],
  saturn_orbit: ['Cronus Platform'],
  uranus_orbit: ['Herschel Platform'],
  triton: ['Cantaloupe Station'],
  pluto: ['Sputnik Base', 'Tombaugh'],
};
