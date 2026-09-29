'use strict';
// DMC part (c): plans the validator accepts vs what runPlan() does with them. Run: node validator-probe.js
const h = require('../harness.js');
const out = [];
function base(years) {
  const p = h.plan({ years: years || 3, retireAge: 60, balance: 0, amount: 0 });
  p.advanced.transferOn = false;
  p.accounts = [h.account('brk', 'taxable', 1000000)];
  p.retirement.spending = 20000;
  return p;
}
const mortgage = extra => Object.assign({ id: 'd1', type: 'mortgage', name: 'M', owner: 'household', balance: 300000, rate: 6, rateType: 'fixed',
  paymentMonthly: 1798.65, payoffAge: 90, includePayment: true, includeHousingCosts: false }, extra);
function probe(label, p, note) {
  const v = h.validateScenario(structuredClone(p));
  let r, thrown = null;
  try { r = h.engine.runPlan(structuredClone(p)); } catch (e) { thrown = String(e).split('\n')[0]; }
  const rec = { label, validatorValid: v.valid, validatorErrors: v.issues.filter(x => x.severity === 'ERROR').map(x => x.code + ':' + x.path),
    validatorWarnings: v.issues.filter(x => x.severity === 'WARNING').map(x => x.code + ':' + x.path).slice(0, 4),
    thrown, status: r && r.status, code: r && r.calculationErrorCode || null };
  if (r && r.rows) { const last = r.rows[r.rows.length - 1]; rec.lastTotal = last.total; rec.debtInterestByRow = r.rows.slice(1).map(x => x.debtInterest); }
  if (note) rec.note = note;
  out.push(rec); return r;
}
// V1: runs above the ceiling on a SIMPLE plan (runs is not read by the simple method)
{ const p = base(); p.assumptions.runs = 20000; probe('V1 simple plan with runs 20000', p); }
// V2: historyStart after the data ends: replays from 1928 without a word
{ const p = base(20); p.assumptions.method = 'historical'; p.assumptions.returnRate = 0; p.retirement.spending = 0;
  const a = structuredClone(p); a.assumptions.historyStart = 2030; const b = structuredClone(p); b.assumptions.historyStart = 1928;
  const ra = probe('V2 historical, historyStart 2030', a), rb = probe('V2b control historyStart 1928', b);
  out.push({ label: 'V2 compare', identicalTo1928: JSON.stringify(ra.rows) === JSON.stringify(rb.rows), issuesOn2030: (ra.issues || []).map(i => i.code) }); }
// V3: adjustable debt with a reset age and NO payoffAge (payoffAge is optional in the validator)
{ const p = base(); p.advanced.debts = [mortgage({ rateType: 'adjustable', nextRateResetAge: 61, resetRate: 8 })]; delete p.advanced.debts[0].payoffAge;
  probe('V3 ARM with reset, payoffAge absent', p); }
// V4: adjustable debt with a reset and resetRate absent: interest stops at the reset
{ const p = base(); p.advanced.debts = [mortgage({ rateType: 'adjustable', nextRateResetAge: 61 })];
  probe('V4 ARM resetRate absent', p, 'hand: 6% loan keeps ~17.7k/yr interest; engine rows show interest'); }
// V4b: resetRate null
{ const p = base(); p.advanced.debts = [mortgage({ rateType: 'adjustable', nextRateResetAge: 61, resetRate: null })]; probe('V4b ARM resetRate null', p); }
// V4c: resetRate as a non-number string
{ const p = base(); p.advanced.debts = [mortgage({ rateType: 'adjustable', nextRateResetAge: 61, resetRate: 'eight' })]; probe('V4c ARM resetRate "eight"', p); }
// V5: inflation not a number
{ const p = base(); p.assumptions.inflation = 'abc'; probe('V5 inflation "abc"', p); }
// V6: fee not a number
{ const p = base(); p.assumptions.fee = 'abc'; p.assumptions.returnRate = 5; probe('V6 fee "abc"', p); }
// V7: negative extra principal is silently ignored
{ const p = base(); p.advanced.debts = [mortgage({ extraPrincipalMonthly: -500 })]; probe('V7 extraPrincipalMonthly -500', p); }
// V8: pmiMonthly string
{ const p = base(); p.advanced.debts = [mortgage({ includeHousingCosts: true, pmiMonthly: 'abc' })]; probe('V8 pmiMonthly "abc"', p); }
// V9: withdrawalTiming unknown
{ const p = base(); p.assumptions.withdrawalTiming = 'weekly'; probe('V9 withdrawalTiming "weekly"', p); }
// V10: asset-class volatility negative with correlation 0.25 (validator: type only)
{ const p = base(); p.assumptions.method = 'monteCarlo'; p.assumptions.runs = 50; p.advanced.assetsOn = true;
  p.advanced.assetClasses = [{ id: 's', name: 'S', returnRate: 7, volatility: 18 }, { id: 'b', name: 'B', returnRate: 4, volatility: -7 }];
  p.accounts[0].allocation = { s: 60, b: 40 }; probe('V10 asset class volatility -7', p); }
// V11: debt nextRateResetAge as a string (Number() coerces)
{ const p = base(); p.advanced.debts = [mortgage({ rateType: 'adjustable', nextRateResetAge: '61', resetRate: 8 })]; probe('V11 nextRateResetAge "61"', p); }
// V12: rateType adjustable, nextRateResetAge absent -> never resets (disclosed)
{ const p = base(); p.advanced.debts = [mortgage({ rateType: 'adjustable', resetRate: 8 })]; probe('V12 ARM without reset age', p); }
for (const o of out) console.log(JSON.stringify(o));
console.log('VALIDATOR-PROBE DONE: probes=' + out.length);
