// Standard ship designs published by design bureaus as technology matures.
export interface DesignTemplate {
  id: string;
  name: string;
  techs: string[];
  structure: string;
  components: Record<string, number>;
  note: string;
}

export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    id: 'aquila', name: 'Aquila Heavy Freighter', techs: [], structure: 'steel',
    components: { eng_methalox: 2, tank_large: 2, cargo_large: 1, nav_auto: 1, comm_radio: 1, dock_port: 1, pwr_solar: 1 },
    note: 'Reusable methalox freighter for low Earth orbit to lunar orbit.',
  },
  {
    id: 'selene', name: 'Selene Cargo Lander', techs: [], structure: 'aluminium',
    components: { eng_methalox: 3, tank_large: 1, cargo_bay: 3, nav_auto: 1, comm_radio: 1, dock_port: 1, pwr_solar: 1 },
    note: 'Single-stage reusable lander that refuels at lunar orbit depots.',
  },
  {
    id: 'selene_crew', name: 'Selene Crew Lander', techs: [], structure: 'aluminium',
    components: { eng_methalox: 3, tank_large: 1, cargo_bay: 1, hab_passenger: 1, nav_basic: 1, comm_radio: 1, dock_port: 1, pwr_solar: 1, rad_panel: 1, shield_water: 1 },
    note: 'Crew and passenger lander for cislunar rotations.',
  },
  {
    id: 'hall_tug', name: 'Pathfinder Hall Tug', techs: [], structure: 'aluminium',
    components: { eng_hall: 4, tank_argon_large: 1, cargo_large: 2, pwr_solar: 9, nav_auto: 1, comm_radio: 1, dock_port: 1, rad_panel: 2 },
    note: 'Slow but efficient solar-electric bulk tug.',
  },
  {
    id: 'tanker', name: 'Cryo Tanker', techs: ['cryogenic_depots'], structure: 'steel',
    components: { eng_methalox: 3, tank_tanker: 1, cargo_large: 2, nav_auto: 1, comm_radio: 1, dock_port: 1, dock_transfer: 1, pwr_solar: 1 },
    note: 'Moves propellant from lunar and asteroid sources to depots.',
  },
  {
    id: 'hermes', name: 'Hermes NTR Transport', techs: ['nuclear_thermal_propulsion', 'aerocapture'], structure: 'aluminium',
    components: { eng_ntr: 3, tank_hydrogen_large: 4, cargo_large: 2, hab_module: 2, rad_panel: 12, nav_basic: 1, nav_auto: 1, comm_dish: 1, dock_port: 1, pwr_solar: 2, aeroshell: 9, shield_water: 1 },
    note: 'Nuclear-thermal interplanetary transport with aerocapture.',
  },
  {
    id: 'ares_lander', name: 'Ares Descent Vehicle', techs: ['aerocapture'], structure: 'steel',
    components: { eng_methalox: 4, tank_large: 2, cargo_large: 1, nav_auto: 1, comm_dish: 1, dock_port: 1, pwr_solar: 1, aeroshell: 6 },
    note: 'Uncrewed methalox cargo lander for Mars, using aerobraking for entry and local propellant for ascent.',
  },
  {
    id: 'ares_crew', name: 'Ares Crew Lander', techs: ['aerocapture'], structure: 'steel',
    components: { eng_methalox: 4, tank_large: 2, hab_passenger: 1, cargo_bay: 2, nav_basic: 1, nav_auto: 1, comm_dish: 1, dock_port: 1, pwr_solar: 1, rad_panel: 1, aeroshell: 7, shield_water: 1 },
    note: 'Crewed shuttle between Mars orbit and the surface, refuelled with martian propellant.',
  },
  {
    id: 'colony_ship', name: 'Exodus Colony Transport', techs: ['nuclear_thermal_propulsion', 'large_pressure_structures', 'aerocapture'], structure: 'aluminium',
    components: { eng_ntr: 4, tank_hydrogen_large: 5, hab_colony: 2, cargo_large: 1, rad_panel: 16, nav_basic: 1, nav_auto: 1, comm_dish: 1, dock_port: 1, pwr_solar: 6, aeroshell: 10, shield_water: 2 },
    note: 'Mass migration transport for eight hundred settlers.',
  },
  {
    id: 'nep_freighter', name: 'Ceres Line NEP Freighter', techs: ['nuclear_electric_propulsion'], structure: 'aluminium',
    components: { eng_nep: 2, pwr_fission_large: 2, tank_argon_large: 4, cargo_bulk: 1, rad_panel: 4, rad_heatpipe: 16, nav_auto: 1, comm_dish: 1, dock_port: 1, dock_transfer: 1 },
    note: 'Nuclear-electric bulk freighter for the Belt.',
  },
  {
    id: 'belt_lander', name: 'Belt Utility Craft', techs: ['nuclear_thermal_propulsion'], structure: 'aluminium',
    components: { eng_ntr: 1, tank_hydrogen_large: 1, cargo_large: 1, nav_auto: 1, comm_dish: 1, dock_port: 1, rad_panel: 4, pwr_solar: 1 },
    note: 'NTR utility craft for low-gravity surface operations.',
  },
  {
    id: 'fusion_clipper', name: 'Solar Clipper (Fusion)', techs: ['fusion_drives'], structure: 'titanium',
    components: { eng_fusion: 2, tank_hydrogen_large: 4, cargo_bulk: 1, hab_spin: 1, rad_droplet: 2, nav_ai: 1, comm_laser: 1, dock_port: 1, dock_transfer: 1 },
    note: 'Fast fusion freighter: weeks to Mars, months to Saturn.',
  },
  {
    id: 'fusion_liner', name: 'Heliopolis Liner (Fusion)', techs: ['fusion_drives', 'large_pressure_structures'], structure: 'titanium',
    components: { eng_fusion: 3, tank_hydrogen_large: 5, hab_colony: 4, cargo_large: 2, rad_droplet: 2, nav_ai: 1, comm_laser: 1, dock_port: 1, shield_water: 2 },
    note: 'Passenger liner for mass interplanetary migration.',
  },
  {
    id: 'megafreighter', name: 'Leviathan Megafreighter', techs: ['advanced_fusion_drives', 'graphene_structures'], structure: 'nanotube',
    components: { eng_fusion_adv: 2, tank_hydrogen_large: 6, cargo_mega: 1, rad_droplet: 4, nav_ai: 1, comm_laser: 1, dock_port: 1, dock_transfer: 1 },
    note: 'Forty-thousand-tonne bulk freighter for the Solar economy.',
  },
  {
    id: 'patrol_cutter', name: 'Sentinel Patrol Cutter', techs: ['point_defense'], structure: 'titanium',
    components: { eng_methalox: 2, tank_large: 2, wpn_missile: 2, wpn_pd: 2, sensor_ir: 2, hab_module: 1, pwr_fission: 3, rad_panel: 10, nav_basic: 1, comm_dish: 1, dock_port: 1 },
    note: 'Security patrol craft for counter-piracy and escort.',
  },
  {
    id: 'frigate', name: 'Aegis Fusion Frigate', techs: ['fusion_drives', 'directed_energy'], structure: 'titanium',
    components: { eng_fusion: 1, tank_hydrogen_large: 2, wpn_laser: 2, wpn_railgun: 1, wpn_pd: 3, sensor_adv: 2, hab_module: 1, pwr_fission_large: 2, rad_droplet: 3, nav_ai: 1, comm_laser: 1, dock_port: 1 },
    note: 'Deep-space security frigate.',
  },
];

export const DESIGN_TEMPLATE: Record<string, DesignTemplate> = Object.fromEntries(DESIGN_TEMPLATES.map((d) => [d.id, d]));
