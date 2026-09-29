// Calendar utilities. Day 0 is 1 January 2048.
export const START_YEAR = 2048;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_NAMES = MONTHS;

function daysFromCivil(y: number, m: number, d: number): number {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

const EPOCH = daysFromCivil(START_YEAR, 1, 1);

export function civilFromDay(day: number): { y: number; m: number; d: number } {
  const z = day + EPOCH + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}

export function dayFromCivil(y: number, m: number, d: number): number {
  return daysFromCivil(y, m, d) - EPOCH;
}

export function formatDate(day: number): string {
  const c = civilFromDay(day);
  return `${c.d} ${MONTHS[c.m - 1]} ${c.y}`;
}

export function formatMonth(day: number): string {
  const c = civilFromDay(day);
  return `${MONTHS[c.m - 1]} ${c.y}`;
}

export function yearOf(day: number): number {
  return civilFromDay(day).y;
}

/** Fractional year, e.g. 2048.5 */
export function yearFrac(day: number): number {
  return START_YEAR + day / 365.2425;
}

export function monthIndex(day: number): number {
  const c = civilFromDay(day);
  return (c.y - START_YEAR) * 12 + (c.m - 1);
}

export function isFirstOfMonth(day: number): boolean {
  return civilFromDay(day).d === 1;
}

export function daysUntilYear(day: number, year: number): number {
  return dayFromCivil(year, 1, 1) - day;
}

export const DAYS_PER_YEAR = 365.2425;
export const DAYS_PER_MONTH = DAYS_PER_YEAR / 12;
