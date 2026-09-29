// UNE finances: revenues, agency budgets, debt, credit rating and institutions.
import type { GameState } from '../types';
import { INSTITUTION } from '../content/actors';
import { LAW } from '../content/laws';
import { clamp } from '../core/util';
import { mods } from './modifiers';
import { credit, debit, earthGDP, spaceGDP, addAlert } from './helpers';
import { annualRevenue } from './politics';
import { BD, setExplain } from '../core/breakdown';

const DT = 1 / 12;

export function uneMonthly(s: GameState): void {
  const u = s.une;
  const m = mods(s);
  const egdp = earthGDP(s);
  // --------------------------------------------------------------- Revenue
  let assessments = 0;
  const ab = new BD('cr/yr', 'Member-state assessments: GDP × assessment rate × compliance.');
  for (const id of Object.keys(s.nations).sort()) {
    const n = s.nations[id];
    if (!n.member) continue;
    const a = n.gdp * (m.assessmentRate ?? 0.0004) * (0.65 + 0.35 * n.compliance);
    assessments += a;
    ab.add(n.short, a, id);
  }
  setExplain(s, 'une.assessments', ab);
  credit(s, 'une', assessments * DT, 'Member assessments');
  const years = s.day / 365.25;
  const orbitalShare = 0.005 * (1 + years * 0.015);
  credit(s, 'une', egdp * orbitalShare * 0.004 * (1 + (m.licensingMult ?? 0)) * DT, 'Orbital licensing');
  if (m.directTax) credit(s, 'une', (m.directTax ?? 0) * (egdp + spaceGDP(s)) * DT, 'Direct federal tax');
  const bankEff = u.institutions.bank?.active ? u.institutions.bank.effectiveness : 0;
  credit(s, 'une', 3e8 * bankEff * DT * (1 + years * 0.02), 'Development bank returns');
  // --------------------------------------------------------------- Expenses
  const corruption = u.metrics.corruption ?? 0.12;
  const bureau = 1 + (m.bureaucracy ?? 0);
  for (const id of Object.keys(u.institutions).sort()) {
    const inst = u.institutions[id];
    if (!inst.active) {
      inst.effectiveness = 0;
      continue;
    }
    const f = Math.max(0, u.funding[id] ?? 0);
    const base = INSTITUTION[id]?.baseFunding ?? 1e9;
    const scale = scaleFor(s, id);
    debit(s, 'une', f * DT * (1 + (m.bureaucracyCost ?? 0)), `Agency: ${inst.short}`);
    const ratio = f / Math.max(1, base * scale);
    inst.effectiveness = clamp(Math.pow(ratio, 0.6) * (1 - corruption * 0.4) * bureau * (u.treasury < 0 ? 0.8 : 1), 0, 1.4);
  }
  for (const id in s.laws) {
    const law = LAW[id];
    if (law?.annualCost) debit(s, 'une', law.annualCost * DT, 'Programs');
  }
  const interest = u.debt * u.interestRate * DT;
  debit(s, 'une', interest, 'Debt interest');
  if (u.treasury < 0) debit(s, 'une', -u.treasury * 0.08 * DT, 'Overdraft penalty');
  // --------------------------------------------------------------- Borrowing
  const revenue = annualRevenue(s);
  const ceiling = u.bondsAuthorized ? revenue * (1 + (m.debtCeiling ?? 0)) : revenue * 0.25;
  if (u.treasury < 0) {
    const room = Math.max(0, ceiling - u.debt);
    const borrow = Math.min(room, -u.treasury + revenue * 0.02);
    if (borrow > 0) {
      u.debt += borrow;
      u.treasury += borrow;
      u.revenueYTD['Bond issuance'] = (u.revenueYTD['Bond issuance'] ?? 0) + borrow;
    }
    if (u.treasury < 0) {
      s.events.flags.budgetCrisis = s.day;
      if (s.day % 30 < 1) addAlert(s, 'crit', 'UNE treasury overdrawn: agencies are losing effectiveness');
    }
  }
  // --------------------------------------------------------------- Surplus rebate
  // A treasury far beyond any plausible need goes back to the member states that paid it in
  const reserveTarget = Math.max(5e10, revenue * 1.5);
  if (u.treasury > reserveTarget && u.debt <= 0 && assessments > 0) {
    const rebate = (u.treasury - reserveTarget) * 0.1;
    debit(s, 'une', rebate, 'Assessment rebates');
    for (const id of Object.keys(s.nations).sort()) {
      const n = s.nations[id];
      if (!n.member) continue;
      const share = (n.gdp * (m.assessmentRate ?? 0.0004) * (0.65 + 0.35 * n.compliance)) / assessments;
      credit(s, id, rebate * share, 'Assessment rebate');
    }
  }
  // --------------------------------------------------------------- Rating
  const legit = u.metrics.legitimacy ?? 0.6;
  const rating = clamp(0.95 - (u.debt / Math.max(1, revenue)) * 0.08 - (1 - legit) * 0.35 - (u.treasury < 0 ? 0.15 : 0) - u.fragmentation * 0.2, 0.05, 0.98);
  u.creditRating = u.creditRating * 0.9 + rating * 0.1;
  u.interestRate = clamp(0.018 + 0.08 * (1 - u.creditRating) - bankEff * 0.004, 0.01, 0.2);
  // Explain treasury flows (running year)
  const rb = new BD('cr (YTD)', 'Revenue this year by source.');
  for (const k of Object.keys(u.revenueYTD).sort()) rb.add(k, u.revenueYTD[k]);
  setExplain(s, 'une.revenue', rb);
  const eb = new BD('cr (YTD)', 'Spending this year by purpose.');
  for (const k of Object.keys(u.expenseYTD).sort()) eb.add(k, -u.expenseYTD[k]);
  setExplain(s, 'une.expenses', eb);
}

/** Some agencies need more funding as civilization grows. */
export function scaleFor(s: GameState, inst: string): number {
  const years = Math.max(0, s.day / 365.25);
  const growth = Math.pow(1.025, years);
  switch (inst) {
    case 'isd':
    case 'sda':
    case 'etsa':
    case 'sia':
      return growth;
    default:
      return Math.pow(1.015, years);
  }
}

export function uneAnnual(s: GameState): void {
  const u = s.une;
  u.revenueLastYear = u.revenueYTD;
  u.expenseLastYear = u.expenseYTD;
  u.revenueYTD = {};
  u.expenseYTD = {};
}

export function totalFunding(s: GameState): number {
  let t = 0;
  for (const id in s.une.institutions) if (s.une.institutions[id].active) t += s.une.funding[id] ?? 0;
  return t;
}
