'use strict';
// Every strategy at a fractional start (60.5), Roth-only (no tax), zero return, 3% inflation. Hand values for rows 1 and 2.
const { plan, account, run, cmp, summary, rows } = require('./flib.js');
const I = 0.03, B = 1e6, rate = 0.04, end = 70;
function mk(strategy, extra = {}) {
  const p = plan({ age: 60.5, retireAge: 60.5, endAge: end, inflation: 3, strategy, spending: 40000,
    accounts: [account('roth', 'rothIRA', B)] });
  Object.assign(p.retirement, { withdrawalRate: 4, floor: 30000, ceiling: 90000, upperGuardrail: 20, lowerGuardrail: 20, adjustment: 10,
    vpwMinRate: 0, vpwMaxRate: 100, rmdMultiplier: 100, rmdFloor: 0, flexibility: 0 }, extra);
  return p;
}
const f05 = Math.pow(1 + I, 0.5);
const cases = {
  fixedNominal: [40000 * 0.5, 40000],
  incomeFirst: [40000 * 0.5, 40000 * f05],
  fixedReal: [B * rate * 0.5, B * rate * f05],
  constantPercent: [B * rate * 0.5, (B - B * rate * 0.5) * rate],
  floorCeiling: [B * rate * 0.5, Math.min(90000 * f05, Math.max(30000 * f05, (B - 20000) * rate))],
};
// guardrails: first year 40,000 (rate 4%, inside), second: 40,000*f05 / 980,000 = 4.142% inside 3.2..4.8 -> no adjustment
cases.guardrails = [20000, 40000 * f05];
// VPW: real rate (1+0)/(1.03)-1, remaining 70-60.5 = 9.5, then 9
const rr = 1 / 1.03 - 1, fac = n => (1 - Math.pow(1 + rr, -n)) / rr;
const v1 = B / fac(9.5);
cases.vpw = [v1 * 0.5, (B - v1 * 0.5) / fac(9)];
// rmd-style: balance / remaining years
const m1 = B / 9.5;
cases.rmd = [m1 * 0.5, (B - m1 * 0.5) / 9];
for (const [s, [e1, e2]] of Object.entries(cases)) {
  const r = run(mk(s));
  cmp(s + ' row1 spending (0.5 yr)', r.rows[1].spending, e1);
  cmp(s + ' row1 withdrawals', r.rows[1].withdrawals, e1);
  cmp(s + ' row2 spending', r.rows[2].spending, e2);
  cmp(s + ' row2 inflationFactor', r.rows[2].inflationFactor, Math.pow(1.03, 1.5), 1e-9);
}
// last partial row: end at 70.5 -> last row 70 -> 70.5; rmd-style should draw the whole remaining balance, vpw at 100% cap too
for (const s of ['rmd', 'vpw']) {
  const p = mk(s); p.profile.endAge = 70.5;
  const r = run(p); const n = r.rows.length; const last = r.rows[n - 1], prev = r.rows[n - 2];
  cmp(s + ' last partial row draws the balance', last.withdrawals, prev.total, 0.01);
}
summary();
