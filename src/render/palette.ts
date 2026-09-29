// Functional color language (§88) with a colorblind-safe alternative.
export interface Palette {
  politics: string;
  population: string;
  industry: string;
  energy: string;
  science: string;
  security: string;
  neutral: string;
  dim: string;
  bg: string;
  panel: string;
  good: string;
  bad: string;
  warn: string;
}

export const STANDARD: Palette = {
  politics: '#4da3ff',
  population: '#5fd38a',
  industry: '#ff9f43',
  energy: '#ffd84d',
  science: '#b98cff',
  security: '#ff5c5c',
  neutral: '#e6edf3',
  dim: '#7d8b99',
  bg: '#070a10',
  panel: '#0d131c',
  good: '#5fd38a',
  bad: '#ff5c5c',
  warn: '#ffb347',
};

// Okabe–Ito based alternative for color-vision deficiencies
export const ACCESSIBLE: Palette = {
  politics: '#56b4e9',
  population: '#009e73',
  industry: '#e69f00',
  energy: '#f0e442',
  science: '#cc79a7',
  security: '#d55e00',
  neutral: '#ffffff',
  dim: '#999999',
  bg: '#000000',
  panel: '#101010',
  good: '#009e73',
  bad: '#d55e00',
  warn: '#e69f00',
};

let current: Palette = STANDARD;
export function palette(): Palette {
  return current;
}
export function setAccessible(on: boolean) {
  current = on ? ACCESSIBLE : STANDARD;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(current)) root.style.setProperty(`--c-${k}`, v);
}

export const STATUS_COLOR: Record<string, string> = {
  outpost: '#9aa7b8',
  territory: '#4da3ff',
  selfGoverning: '#6ee7ff',
  commonwealth: '#5fd38a',
  member: '#ffd84d',
  associated: '#ff9f43',
  independent: '#ff7ac8',
};

export const CATEGORY_COLOR: Record<string, string> = {
  politics: '#4da3ff',
  constitution: '#4da3ff',
  law: '#4da3ff',
  institution: '#4da3ff',
  colony: '#5fd38a',
  population: '#5fd38a',
  industry: '#ff9f43',
  corporate: '#ff9f43',
  economy: '#ff9f43',
  project: '#ff9f43',
  dyson: '#ffd84d',
  energy: '#ffd84d',
  science: '#b98cff',
  security: '#ff5c5c',
  disaster: '#ff5c5c',
  crisis: '#ff5c5c',
  milestone: '#ffffff',
  tutorial: '#e6edf3',
  flavor: '#e6edf3',
};
