'use strict';
// DMC debt probes: projectDebts() through runPlan(), against hand amortization written out here.
// Run: node debt-probe.js
const h = require('../harness.js');
const out = [];
function basePlan(years, extraDebt) {
  const p = h.plan({ years, retireAge: 60, balance: 0, amount: 0 });
  p.advanced.transferOn = false;
  p.accounts = [h.account('brk', 'taxable', 2000000)];
  p.advanced.debts = [Object.assign({ id: 'd1', type: 'mortgage', name: 'Mortgage', owner: 'household', balance: 300000, rate: 6,
    rateType: 'fixed', paymentMonthly: 0, payoffAge: 90, includePayment: true, includeHousingCosts: false, extraPrincipalMonthly: 0,
    annualPropertyTax: 0, annualInsurance: 0, hoaMonthly: 0, pmiMonthly: 0 }, extraDebt)];
  return p;
}
function check(label, p, rowIdx, expect) {
  const v = h.validateScenario(structuredClone(p));
  const errs = v.issues.filter(x => x.severity === 'ERROR');
  let r; try { r = h.engine.runPlan(structuredClone(p)); } catch (e) { out.push({ label, crash: String(e) }); return; }
  const row = r.rows && r.rows[rowIdx];
  const actual = {}; const diff = {};
  for (const k of Object.keys(expect)) { actual[k] = row ? row[k] : undefined; diff[k] = row ? +(row[k] - expect[k]).toFixed(4) : null; }
  const bad = Object.keys(expect).filter(k => !(Math.abs(diff[k]) <= 0.01));
  out.push({ label, valid: v.valid, errors: errs.map(e => e.code + ':' + e.path), status: r.status, code: r.calculationErrorCode || null,
    verdict: bad.length ? 'MISMATCH' : 'PASS', bad, expect, actual, diff });
  return r;
}
// ---- hand formulas (independent of the engine) ----
const pmt = (P, annualPct, n) => { const i = annualPct / 1200; return i === 0 ? P / n : P * i / (1 - Math.pow(1 + i, -n)); };
function handLoop(P, annualPct, pay, months) { // standard monthly amortization, final payment = balance + interest
  const i = annualPct / 1200; let b = P, interest = 0, paid = 0, n = 0;
  for (let m = 0; m < months && b > 1e-9; m++) { const it = b * i; const a = Math.min(pay, b + it); b = b + it - a; interest += it; paid += a; n++; }
  return { balance: b, interest, paid, principal: paid - interest, monthsPaid: n };
}
// D1 fixed-rate mortgage, 12 months, closed form: B12 = P(1+i)^12 - A((1+i)^12-1)/i
{
  const A = pmt(300000, 6, 360); const i = 0.005; const g = Math.pow(1 + i, 12);
  const B12 = 300000 * g - A * (g - 1) / i; const paid = 12 * A; const interest = paid - (300000 - B12);
  check('D1 fixed 6% 30y, first year', basePlan(1, { paymentMonthly: A }), 1,
    { debtBalance: B12, debtInterest: interest, debtPrincipal: 300000 - B12, debtPaymentsTotal: paid, debtPayments: paid });
}
// D2 payoff age inside the year (60.5): six payments, then the remaining balance paid in month 6
{
  const A = pmt(300000, 6, 360); const s = handLoop(300000, 6, A, 6);
  check('D2 payoff at 60.5', basePlan(1, { paymentMonthly: A, payoffAge: 60.5 }), 1,
    { debtBalance: 0, debtInterest: s.interest, debtPaymentsTotal: s.paid + s.balance });
}
// D3 natural payoff inside the year: $1,000 at 12% paying $300: final payment is the exact remainder
{
  const s = handLoop(1000, 12, 300, 12);
  check('D3 natural payoff, final payment exact', basePlan(1, { balance: 1000, rate: 12, paymentMonthly: 300, type: 'personalLoan' }), 1,
    { debtBalance: 0, debtInterest: s.interest, debtPaymentsTotal: s.paid });
  out.push({ label: 'D3 hand schedule', monthsPaid: s.monthsPaid, interest: s.interest, paid: s.paid });
}
// D4 ARM: $300,000 at 4% (30-year payment), resets to 8% at 62, payoffAge 90. Year 3 (62->63) re-amortises over 336 months.
{
  const A = pmt(300000, 4, 360); const y12 = handLoop(300000, 4, A, 24); const A2 = pmt(y12.balance, 8, 336);
  const y3 = handLoop(y12.balance, 8, A2, 12);
  const p = basePlan(3, { rate: 4, paymentMonthly: A, rateType: 'adjustable', nextRateResetAge: 62, resetRate: 8, payoffAge: 90 });
  check('D4 ARM recast year 3', p, 3, { debtBalance: y3.balance, debtInterest: y3.interest, debtPaymentsTotal: y3.paid });
  out.push({ label: 'D4 hand', paymentBefore: A, balanceAtReset: y12.balance, paymentAfter: A2 });
}
// D5 credit card: $8,000 at 22%, no entered payment -> minimum max(2% of balance, $25) each month (FEATURES / Q110)
{
  let b = 8000, interest = 0, paid = 0; const i = 22 / 1200;
  for (let m = 0; m < 12; m++) { const it = b * i; const min = Math.min(Math.max(0.02 * b, 25), b + it); b = b + it - min; interest += it; paid += min; }
  check('D5 credit card minimum', basePlan(1, { type: 'creditCard', balance: 8000, rate: 22, paymentMonthly: 0, payoffAge: 99 }), 1,
    { debtBalance: b, debtInterest: interest, debtPaymentsTotal: paid });
}
// D6 extra principal: 6% loan with $500 extra each month
{
  const A = pmt(300000, 6, 360); const s = handLoop(300000, 6, A + 500, 12);
  check('D6 extra principal', basePlan(1, { paymentMonthly: A, extraPrincipalMonthly: 500 }), 1,
    { debtBalance: s.balance, debtInterest: s.interest, debtPaymentsTotal: s.paid });
}
// D7 portfolio conservation: the payments leave the portfolio (0% return, 100% basis, no income -> no tax)
{
  const A = pmt(300000, 6, 360);
  const r = check('D7 payments leave the portfolio', basePlan(1, { paymentMonthly: A }), 1, { total: 2000000 - 12 * A, taxes: 0 });
}
// D8 fractional start age: plan opens at 60.3, first row is 0.7 years = 8.4 months of payments
{
  const A = pmt(300000, 6, 360); const p = basePlan(1, { paymentMonthly: A }); p.profile.age = 60.3; p.profile.endAge = 61; p.profile.retireAge = 60.3;
  const s8 = handLoop(300000, 6, A, 8); const s84 = { paid: 8.4 * A };
  check('D8 fractional first row (8 whole months)', p, 1, { debtPaymentsTotal: s8.paid });
  out.push({ label: 'D8 note', eightMonths: s8.paid, eightPointFourMonths: s84.paid });
}
// D9 payoff age already past at the start (59 in a plan opening at 60)
{
  const A = pmt(300000, 6, 360); const s = handLoop(300000, 6, A, 12);
  check('D9 payoffAge before plan start: engine charges a year of interest, then pays off at year end', basePlan(1, { paymentMonthly: A, payoffAge: 59 }), 1,
    { debtBalance: 0, debtInterest: 0, debtPaymentsTotal: 300000 });
  out.push({ label: 'D9 alt reading (full year then payoff)', interest: s.interest, paid: s.paid + s.balance });
}
// D10 ARM with no resetRate stated (import): what rate applies after the reset?
{
  const A = pmt(300000, 6, 360);
  const p = basePlan(3, { paymentMonthly: A, rateType: 'adjustable', nextRateResetAge: 61, payoffAge: 90 }); delete p.advanced.debts[0].resetRate;
  const y1 = handLoop(300000, 6, A, 12); const y2 = handLoop(y1.balance, 6, A, 12); // if rate simply stays at 6%
  check('D10 ARM, resetRate absent: expect the loan to keep accruing interest after its reset', p, 2, { debtInterest: y2.interest });
}
// D11 a card carrying its own minimum percent (import): the engine uses it, while REVOLVING_DEBT_MINIMUM_MODELLED says 2%/$25 are used for every card
{
  let b = 8000, paid = 0; const i = 22 / 1200;
  for (let m = 0; m < 12; m++) { const it = b * i; const min = Math.min(Math.max(0.05 * b, 25), b + it); b = b + it - min; paid += min; }
  const r = check('D11 card with its own 5% minimum', basePlan(1, { type: 'creditCard', balance: 8000, rate: 22, paymentMonthly: 0, payoffAge: 99, minimumPercentOfBalance: 5 }), 1,
    { debtPaymentsTotal: paid, debtBalance: b });
  const iss = (r.issues || []).find(x => x.code === 'REVOLVING_DEBT_MINIMUM_MODELLED');
  out.push({ label: 'D11 disclosure', statePercent: iss && iss.state.minimumPercentOfBalance, messageSays: iss && iss.message.slice(0, 120) });
}
for (const o of out) console.log(JSON.stringify(o));
console.log('DEBT-PROBE DONE: cases=' + out.filter(o => o.verdict).length + ' mismatches=' + out.filter(o => o.verdict === 'MISMATCH').length);
