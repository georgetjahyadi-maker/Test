// Number formatting shared by the simulation (event texts) and the UI.

export function fmtNum(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '—';
  const a = Math.abs(x);
  const sign = x < 0 ? '−' : '';
  if (a >= 1e21) return sign + (a / 1e21).toFixed(digits) + ' sext';
  if (a >= 1e18) return sign + (a / 1e18).toFixed(digits) + ' quint';
  if (a >= 1e15) return sign + (a / 1e15).toFixed(digits) + ' quad';
  if (a >= 1e12) return sign + (a / 1e12).toFixed(digits) + 'T';
  if (a >= 1e9) return sign + (a / 1e9).toFixed(digits) + 'B';
  if (a >= 1e6) return sign + (a / 1e6).toFixed(digits) + 'M';
  if (a >= 1e4) return sign + (a / 1e3).toFixed(digits) + 'k';
  if (a >= 100) return sign + a.toFixed(0);
  if (a >= 10) return sign + a.toFixed(1);
  if (a >= 1) return sign + a.toFixed(2);
  if (a === 0) return '0';
  if (a >= 0.01) return sign + a.toFixed(3);
  return sign + a.toExponential(1);
}

export function fmtInt(x: number): string {
  if (!Number.isFinite(x)) return '—';
  return Math.round(x).toLocaleString('en-US');
}

export function fmtMoney(x: number): string {
  return 'cr ' + fmtNum(x, x !== 0 && Math.abs(x) < 1e9 ? 0 : 1);
}

export function fmtPct(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return '—';
  return (x * 100).toFixed(digits) + '%';
}

export function fmtTonnes(t: number): string {
  if (!Number.isFinite(t)) return '—';
  if (Math.abs(t) < 1 && t !== 0) return (t * 1000).toFixed(0) + ' kg';
  return fmtNum(t) + ' t';
}

export function fmtPower(w: number): string {
  if (!Number.isFinite(w)) return '—';
  const a = Math.abs(w);
  if (a >= 1e24) return (w / 1e24).toFixed(2) + ' YW';
  if (a >= 1e21) return (w / 1e21).toFixed(2) + ' ZW';
  if (a >= 1e18) return (w / 1e18).toFixed(2) + ' EW';
  if (a >= 1e15) return (w / 1e15).toFixed(2) + ' PW';
  if (a >= 1e12) return (w / 1e12).toFixed(2) + ' TW';
  if (a >= 1e9) return (w / 1e9).toFixed(2) + ' GW';
  if (a >= 1e6) return (w / 1e6).toFixed(1) + ' MW';
  if (a >= 1e3) return (w / 1e3).toFixed(1) + ' kW';
  return w.toFixed(0) + ' W';
}

export function fmtSci(x: number, digits = 2): string {
  if (!Number.isFinite(x) || x === 0) return String(x);
  const e = Math.floor(Math.log10(Math.abs(x)));
  const m = x / Math.pow(10, e);
  const sup = String(e)
    .split('')
    .map((c) => ({ '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' } as Record<string, string>)[c] ?? c)
    .join('');
  return `${m.toFixed(digits)} × 10${sup}`;
}

export function fmtDays(d: number): string {
  if (!Number.isFinite(d)) return '—';
  if (d < 1) return `${(d * 24).toFixed(0)} h`;
  if (d < 60) return `${d.toFixed(0)} days`;
  if (d < 730) return `${(d / 30.44).toFixed(1)} months`;
  return `${(d / 365.25).toFixed(1)} years`;
}
