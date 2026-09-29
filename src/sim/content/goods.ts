import type { GoodDef } from '../types';

// Earth reference prices are in credits (cr) per tonne, 2048 values.
export const GOODS: GoodDef[] = [
  { id: 'water', name: 'Water', price: 2, category: 'volatile', description: 'Drinking, agriculture, radiation shielding and the feedstock for propellant.' },
  { id: 'oxygen', name: 'Oxygen', price: 150, category: 'volatile', description: 'Breathing gas and the oxidizer in chemical propellant.' },
  { id: 'hydrogen', name: 'Hydrogen', price: 2500, category: 'propellant', description: 'Reaction mass for nuclear-thermal and fusion engines.' },
  { id: 'propellant', name: 'Chemical Propellant', price: 700, category: 'propellant', description: 'Cryogenic methalox or hydrolox mixtures for chemical engines.' },
  { id: 'argon', name: 'Argon', price: 1500, category: 'propellant', description: 'Inert propellant for electric thrusters.' },
  { id: 'fusionFuel', name: 'Fusion Fuel', price: 2.0e9, category: 'fuel', description: 'Helium-3 and deuterium for aneutronic and D-T fusion.', earthDemand: 5, elasticity: 0.8 },
  { id: 'carbon', name: 'Carbon', price: 400, category: 'raw', description: 'Feedstock for polymers, composites, food and methane.' },
  { id: 'nitrogen', name: 'Nitrogen', price: 150, category: 'raw', description: 'Buffer gas for habitats and a fertilizer for agriculture.' },
  { id: 'iron', name: 'Iron', price: 350, category: 'raw', description: 'The bulk structural metal of every industrial civilization.' },
  { id: 'aluminium', name: 'Aluminium', price: 2400, category: 'raw', description: 'Light structural metal refined from anorthositic regolith.' },
  { id: 'titanium', name: 'Titanium', price: 9000, category: 'raw', description: 'High-strength metal from ilmenite-bearing mare basalts.' },
  { id: 'nickel', name: 'Nickel', price: 17000, category: 'raw', description: 'Alloying metal, abundant in metallic asteroids.' },
  { id: 'silicon', name: 'Silicon', price: 2200, category: 'raw', description: 'Semiconductor, photovoltaic and glass feedstock.' },
  { id: 'copper', name: 'Copper', price: 9500, category: 'raw', description: 'Electrical conductor for motors, wiring and electronics.' },
  { id: 'lithium', name: 'Lithium', price: 14000, category: 'raw', description: 'Energy storage and fusion breeding blankets.' },
  { id: 'uranium', name: 'Uranium', price: 120000, category: 'raw', description: 'Fission fuel ore.' },
  { id: 'thorium', name: 'Thorium', price: 80000, category: 'raw', description: 'Fertile fuel for molten-salt breeder reactors (KREEP terrains).' },
  { id: 'rareEarths', name: 'Rare Earth Elements', price: 50000, category: 'raw', description: 'Magnets, superconductors and electronics dopants.' },
  { id: 'pgm', name: 'Platinum-Group Metals', price: 3.0e7, category: 'raw', description: 'Catalysts and electronics. Asteroids hold vast reserves.', earthDemand: 600, elasticity: 0.6 },
  { id: 'sulfur', name: 'Sulfur', price: 120, category: 'raw', description: 'Chemical industry feedstock, abundant at Io and Venus.' },
  { id: 'phosphorus', name: 'Phosphorus', price: 900, category: 'raw', description: 'Essential fertilizer. Scarce outside Earth and KREEP deposits.' },
  { id: 'food', name: 'Food', price: 2500, category: 'life', description: 'Calories and protein for settlers.' },
  { id: 'supplies', name: 'Supplies', price: 25000, category: 'life', description: 'Clothing, medicine, spare parts and consumer goods.' },
  { id: 'alloys', name: 'Structural Alloys', price: 4500, category: 'material', description: 'Steels and light alloys for hulls, habitats and machinery.' },
  { id: 'composites', name: 'Composites & Polymers', price: 35000, category: 'material', description: 'Carbon-fibre composites, seals, films and plastics.' },
  { id: 'ceramics', name: 'Ceramics & Glass', price: 7000, category: 'material', description: 'Sintered regolith, glass and high-temperature ceramics.' },
  { id: 'semiconductors', name: 'Semiconductors', price: 1.5e6, category: 'manufactured', description: 'Wafers and chips. Requires ultra-clean fabrication.' },
  { id: 'electronics', name: 'Electronics', price: 400000, category: 'manufactured', description: 'Control systems, sensors, computers and avionics.' },
  { id: 'machinery', name: 'Machinery', price: 50000, category: 'manufactured', description: 'Machine tools, pumps, motors, robots and industrial equipment.' },
  { id: 'superconductors', name: 'Superconductors', price: 800000, category: 'manufactured', description: 'High-temperature superconducting tape for magnets and power lines.' },
  { id: 'reactorFuel', name: 'Reactor Fuel', price: 1.8e6, category: 'fuel', description: 'Fabricated fission fuel elements.' },
  { id: 'photovoltaics', name: 'Photovoltaics', price: 90000, category: 'manufactured', description: 'Thin-film solar cells for arrays and Dyson collectors.' },
];

export const GOOD: Record<string, GoodDef> = Object.fromEntries(GOODS.map((g) => [g.id, g]));
export const GOOD_IDS = GOODS.map((g) => g.id);

export const LIFE_GOODS = ['oxygen', 'water', 'food', 'supplies'];
export const PROPELLANTS = ['propellant', 'hydrogen', 'argon'];

// Gross per-capita consumption (tonnes per person per year) before recycling.
export const PER_CAPITA = {
  oxygen: 0.31,
  water: 7.3,
  food: 0.5,
  supplies: 0.15,
};

// Priority for logistics allocation (lower = more urgent)
export const GOOD_PRIORITY: Record<string, number> = {
  oxygen: 0,
  water: 0,
  food: 0,
  supplies: 1,
  machinery: 2,
  electronics: 2,
  photovoltaics: 2,
  superconductors: 2,
  reactorFuel: 1,
  fusionFuel: 1,
  propellant: 3,
  hydrogen: 3,
  argon: 3,
};
