/* S5AA R52 (the owner's decisions of 2026-10-04 on ChatGPT's R46-R51 audit) -- THE FOUR FINDINGS' REPAIRS.
 *
 * R47-01  One IRA-capacity ledger per owner, traditional first. A year's unused IRA room (IRC 4973(b)(2)(C), (f)(2)(B)) absorbs the
 *         carried traditional excess first; the absorbed amount is a contribution of this year (IRC 219(f)(6)), so the Roth carried
 *         excess is reduced only by the room left after it (408A(c)(2): the Roth limit is the 219 limit less this year's contributions to
 *         other IRAs). HSA room stays its own limit. Before R52 each kind took the whole room on its own.
 * R47-02  Each owner's pre-tax workplace deferrals are attributed to that owner's own salary, employment streams and self-employment
 *         profit before the household is summed (Treas. Reg. 1.199A-3(b)(1)(vi): the 404 deduction is attributable to the trade or
 *         business in proportion to the gross income received from it); within an owner the existing proportional convention stays.
 *         Before R52 the household salary absorbed every owner's deferral, so a spouse's salary shielded a business owner's deferral.
 * R48-01  A scheduled transfer that moves traditional-IRA value between Form 8606 pools (the survivor's inherited pool into their own)
 *         carries basis x moved / the source pool's value on the date. The validator accepts a transfer from the deceased's traditional
 *         IRA into the survivor's own traditional IRA dated after the death (the engine's dated succession); every other between-owner
 *         refusal stays.
 * R50-01  At settlement each owner's Roth conversion record of the year is reconciled with the final Form 8606 conversion allocation
 *         (scheduled-transfer conversions included), and Roth IRA distributions already taken that year from those records are re-split
 *         taxable-first (1.408A-6 A-8(b)) with their 10% trued up through the existing true-up ledger. Regular contribution basis
 *         stays apart from nontaxable conversion principal.
 *
 * Rows are labelled by their closing age. Returns and inflation are 0 unless stated. Every expected figure is hand-derived from the rule
 * and the inputs; the derivation sits beside each case. 2026 figures (the rules package's): IRA limit $7,500 (no catch-up under 50);
 * HSA self-only $4,400; federal standard deduction $16,100 single, $32,200 joint; single brackets 10% to $12,400, 12% to $50,400, 22% to
 * $105,700, 24% to $201,775; joint 10% to $24,800, 12% to $100,800, 22% to $211,400; FICA 6.2% to $184,500 + 1.45%; Additional
 * Medicare 0.9% over $200,000 single / $250,000 joint; SE tax on 92.35% of profit at 12.4% + 2.9%, half deductible; QBI 20%; Arizona
 * 2.5% of Arizona AGI less the same standard deduction; the 10% additional tax (72(t)); the 6% excise (4973(a)).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const engine = L.h.engine;
const { validateScenario } = require(path.join(__dirname, '..', 'src', 'scenario-validator.js'));

const a = L.account;
const b = (o = {}) => L.basePlan({ dividendOn: true, dividendYield: 0, ...o });
const stream = (id, type, amount, owner = 'self', start = 0, end = 120) => ({ id, name: id, type, amount, owner, start, end, growth: 0, growthMode: 'fixed' });
function runPlan(p) {
  const r = engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  const bad = (r.issues || []).filter((i) => /QUOTE_SETTLEMENT_UNVERIFIED|TAX_SETTLEMENT_MISMATCH|NONFINITE_SETTLEMENT|ROW_INVARIANT|COMMITTED_CASH_MISMATCH/.test(i.code));
  assert.deepEqual(bad.map((i) => i.code), [], 'settlement safeguards silent');
  return r;
}
function run(p) {
  const v = validateScenario(structuredClone(p));
  assert.equal(v.valid, true, JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  return runPlan(p);
}
const at = (r, age) => { const row = r.rows.find((x) => Math.abs(x.age - age) < 1e-9); assert.ok(row, 'row ' + age); return row; };
const near = (actual, expected, label, tol = 0.005) => assert.ok(Math.abs(actual - expected) <= tol, label + ': expected ' + expected + ', got ' + actual);
const vCodes = (p) => validateScenario(structuredClone(p)).issues.filter((i) => i.severity === 'ERROR').map((i) => i.code);

// =====================================================================================================================================
// R47-01: one IRA-capacity ledger per owner, traditional first
// =====================================================================================================================================
// One 40-year-old earning $50,000 (no workplace plan: the traditional contribution is deductible, so no Form 8606 basis and no
// settlement true-up), "warn". Year 1 (row 41): $10,000 to the traditional IRA (priority first) and $10,000 to the Roth IRA against one
// $7,500 limit -- $7,500 traditional allowed, $2,500 traditional and $10,000 Roth excess; 6% x $12,500 = $750 of excise, booked into
// taxOutstanding (paid by the next row). Year 2 (row 42), contributions stopped: the year's room is $7,500. The excise is 6% of the
// excess left at the year's close (each kind capped at its account value, which is larger here).
function excessPlan(o = {}) {
  const stop = (v = 0) => [{ age: 41, mode: 'set', value: v }];
  const p = b({ age: 40, retireAge: 45, endAge: 42, salary: 50000, spending: 0, accounts: o.accounts || [
    a('t', 'traditionalIRA', 0, { contribution: 10000, futureChanges: stop(o.trad2) }),
    a('r', 'rothIRA', 0, { contribution: 10000, futureChanges: stop() }),
    a('cash', 'taxable', 100000)] });
  p.employment.contributionStop = 45; p.limitPolicy = 'warn';
  return p;
}
const stopAt41 = (v = 0) => [{ age: 41, mode: 'set', value: v }];

test('R52 R47-01 (S06): the traditional excess takes the room first; the Roth excess keeps the rest', () => {
  const r = run(excessPlan());
  near(at(r, 41).taxOutstanding, 750, 'year-1 excise: 6% x (2,500 + 10,000)');
  // Year 2: the traditional $2,500 absorbs $2,500 of the room (a deemed contribution, 219(f)(6)); the Roth room left is
  // min(7,500 Roth limit, 7,500 - 2,500) = 5,000, so $5,000 of Roth excess remains: 6% x 5,000 = $300. (Before R52: $150.)
  near(at(r, 42).taxOutstanding, 300, 'year-2 excise');
});
test('R52 R47-01: with a current traditional contribution the room left is smaller still', () => {
  // Year 2 contributes $2,000 to the traditional IRA: room 7,500 - 2,000 = 5,500. Traditional $2,500 absorbed; Roth room
  // min(5,500, 5,500 - 2,500) = 3,000; Roth left 10,000 - 3,000 = 7,000: 6% x 7,000 = $420. (Before R52: 10,000 - 5,500 = 4,500 -> $270.)
  const r = run(excessPlan({ trad2: 2000 }));
  near(at(r, 42).taxOutstanding, 420, 'year-2 excise');
});
test('R52 R47-01: a Roth distribution comes off the Roth excess before the room', () => {
  // $1,000 moved from the Roth IRA to cash at 41.5 -- a Roth distribution (4973(f)(2)(A)), from contribution basis (no tax). Roth left
  // 10,000 - 1,000 = 9,000, less the room left after the traditional $2,500 (5,000) = 4,000: 6% x 4,000 = $240. (Before R52: 9,000 - 7,500
  // = 1,500 -> $90.)
  const p = excessPlan();
  Object.assign(p.advanced, { transferOn: true, transferFrom: 'r', transferTo: 'cash', transferAmount: 1000, transferAge: 41.5 });
  near(at(run(p), 42).taxOutstanding, 240, 'year-2 excise');
});
test('R52 R47-01: two traditional accounts share one owner ledger', () => {
  // $6,000 + $4,000 into two traditional IRAs: $7,500 allowed in total, $2,500 traditional excess, as with one account; year 2 $300.
  const r = run(excessPlan({ accounts: [a('t1', 'traditionalIRA', 0, { contribution: 6000, futureChanges: stopAt41() }),
    a('t2', 'traditionalIRA', 0, { contribution: 4000, futureChanges: stopAt41() }),
    a('r', 'rothIRA', 0, { contribution: 10000, futureChanges: stopAt41() }), a('cash', 'taxable', 100000)] }));
  near(at(r, 41).taxOutstanding, 750, 'year-1 excise');
  near(at(r, 42).taxOutstanding, 300, 'year-2 excise');
});
test('R52 R47-01: the HSA keeps its own room -- its excess is absorbed by HSA room, not IRA room', () => {
  // Plus $5,400 into an HSA (self-only limit $4,400): $1,000 HSA excess. Year 1: 6% x (2,500 + 10,000 + 1,000) = $810. Year 2: the HSA's
  // own $4,400 room absorbs its $1,000; the IRAs as in S06: $300. (Before R52: $150.)
  const r = run(excessPlan({ accounts: [a('t', 'traditionalIRA', 0, { contribution: 10000, futureChanges: stopAt41() }),
    a('r', 'rothIRA', 0, { contribution: 10000, futureChanges: stopAt41() }), a('h', 'hsa', 0, { contribution: 5400, futureChanges: stopAt41() }),
    a('cash', 'taxable', 100000)] }));
  near(at(r, 41).taxOutstanding, 810, 'year-1 excise');
  near(at(r, 42).taxOutstanding, 300, 'year-2 excise');
});
test('R52 R47-01 controls: one kind of excess alone, and the HSA beside a traditional excess, are absorbed as before', () => {
  // Roth alone: $2,500 Roth excess (6% = $150), absorbed by year 2's $7,500 room: $0.
  let r = run(excessPlan({ accounts: [a('r', 'rothIRA', 0, { contribution: 10000, futureChanges: stopAt41() }), a('cash', 'taxable', 100000)] }));
  near(at(r, 41).taxOutstanding, 150, 'Roth alone, year 1'); near(at(r, 42).taxOutstanding, 0, 'Roth alone, year 2');
  // Traditional $2,500 + HSA $1,000: year 1 6% x 3,500 = $210; year 2 each absorbed by its own room: $0.
  r = run(excessPlan({ accounts: [a('t', 'traditionalIRA', 0, { contribution: 10000, futureChanges: stopAt41() }),
    a('h', 'hsa', 0, { contribution: 5400, futureChanges: stopAt41() }), a('cash', 'taxable', 100000)] }));
  near(at(r, 41).taxOutstanding, 210, 'traditional + HSA, year 1'); near(at(r, 42).taxOutstanding, 0, 'traditional + HSA, year 2');
});
test('R52 R47-01 control: the ledger is per owner -- one spouse\'s traditional excess does not use the other\'s room', () => {
  // Self (salary $100,000) $10,000 traditional, spouse (salary $50,000) $10,000 Roth: $2,500 excess each; year 1 6% x 5,000 = $300.
  // Year 2 each owner's own $7,500 room absorbs their own $2,500: $0.
  const p = b({ couple: true, age: 40, spouseAge: 40, retireAge: 45, endAge: 42, salary: 100000, spouseSalary: 50000, spending: 0, accounts: [
    a('t', 'traditionalIRA', 0, { contribution: 10000, futureChanges: stopAt41() }),
    a('r', 'rothIRA', 0, { owner: 'spouse', contribution: 10000, futureChanges: stopAt41() }), a('cash', 'taxable', 100000)] });
  p.employment.contributionStop = 45; p.profile.spouseRetireAge = 45; p.limitPolicy = 'warn';
  const r = run(p);
  near(at(r, 41).taxOutstanding, 300, 'year 1'); near(at(r, 42).taxOutstanding, 0, 'year 2');
});

// =====================================================================================================================================
// R47-02: deferrals attributed to their owner before QBI is figured
// =====================================================================================================================================
// A married couple, both 40, working all year, filing jointly. Shared arithmetic:
const fedJoint = (ti) => { const brackets = [[24800, 0.10], [100800, 0.12], [211400, 0.22]]; let tax = 0, lo = 0;
  for (const [hi, rate] of brackets) { tax += Math.max(0, Math.min(ti, hi) - lo) * rate; lo = hi; } return tax; };
const seTax = (profit) => profit * 0.9235 * 0.153;   // under the OASDI base in every case here (wages + 92.35% of profit < $184,500)
function couplePlan(o) {
  const p = b({ couple: true, age: 40, spouseAge: 40, retireAge: 60, endAge: 41, salary: o.salary ?? 0, spouseSalary: o.spouseSalary ?? 0, spending: 0,
    otherIncomes: o.streams, accounts: o.accounts });
  p.employment.contributionStop = 60; p.profile.spouseRetireAge = 60;
  return p;
}
const s07 = () => couplePlan({ spouseSalary: 100000, streams: [stream('business', 'selfEmployment', 80000)], accounts: [a('k', 'traditional401k', 0, { contribution: 20000 })] });
// S07: self $80,000 SE profit, no salary, $20,000 traditional 401(k) deferral; spouse $100,000 salary.
//   SE tax 80,000 x .9235 x .153 = 11,303.64, half 5,651.82. AGI = 100,000 + 80,000 - 20,000 - 5,651.82 = 154,348.18.
//   The self's deferral has no salary of the self to come from: all $20,000 is SE-funded. QBI = 80,000 - 5,651.82 - 20,000 = 54,348.18;
//   deduction 20% = 10,869.636 (under 20% of 154,348.18 - 32,200). Taxable 154,348.18 - 32,200 - 10,869.636 = 111,278.544.
//   Federal 2,480 + 9,120 + 22% x 10,478.544 = 13,905.27968; payroll 7,650 + 11,303.64 = 18,953.64; Arizona 2.5% x 122,148.18 =
//   3,053.7045. Total 35,912.62418. (Before R52: the spouse's salary absorbed the deferral, QBI 74,348.18, tax 35,032.62418.)
const S07_TAX = fedJoint(154348.18 - 32200 - 0.2 * (80000 - seTax(80000) / 2 - 20000)) + 100000 * 0.0765 + seTax(80000) + 0.025 * (154348.18 - 32200);
test('R52 R47-02 (S07): a spouse\'s salary does not shield the business owner\'s deferral', () => {
  near(S07_TAX, 35912.62418, 'the derivation itself', 1e-6);
  const r = run(s07());
  near(at(r, 41).federalAgi, 154348.18, 'AGI');
  near(at(r, 41).taxes, S07_TAX, 'tax');
});
test('R52 R47-02: both owners defer -- each deferral comes off its own owner\'s pay', () => {
  // Self: $80,000 SE, $20,000 deferral, no salary -> $20,000 SE-funded. Spouse: $100,000 salary, $20,000 SE, $10,000 deferral -> the
  // spouse's own salary absorbs it, none SE-funded. SE tax 11,303.64 + 20,000 x .9235 x .153 = 2,825.91 (spouse: 100,000 + 18,470 under
  // the base); half 7,064.775. AGI = 100,000 + 100,000 - 30,000 - 7,064.775 = 162,935.225. QBI = 100,000 - 7,064.775 - 20,000 = 72,935.225
  // -> 14,587.045. Taxable 162,935.225 - 32,200 - 14,587.045 = 116,148.18 -> federal 11,600 + 22% x 15,348.18 = 14,976.5996. Payroll
  // 7,650 + 11,303.64 + 2,825.91 = 21,779.55; Arizona 2.5% x 130,735.225 = 3,268.380625. Total 40,024.530225. (Before R52: 30,000 -
  // 100,000 < 0, no cut: 39,144.530225.)
  const half = (seTax(80000) + seTax(20000)) / 2, agi = 200000 - 30000 - half;
  const expected = fedJoint(agi - 32200 - 0.2 * (100000 - half - 20000)) + 7650 + seTax(80000) + seTax(20000) + 0.025 * (agi - 32200);
  near(expected, 40024.530225, 'the derivation itself', 1e-6);
  const r = run(couplePlan({ spouseSalary: 100000, streams: [stream('business', 'selfEmployment', 80000), stream('side', 'selfEmployment', 20000, 'spouse')],
    accounts: [a('k', 'traditional401k', 0, { contribution: 20000 }), a('k2', 'traditional401k', 0, { owner: 'spouse', contribution: 10000 })] }));
  near(at(r, 41).federalAgi, agi, 'AGI');
  near(at(r, 41).taxes, expected, 'tax');
});
test('R52 R47-02: salary, an employment stream and SE profit inside one owner keep the proportional convention', () => {
  // Self: $10,000 salary, a $30,000 employment stream, $60,000 SE profit, $24,500 deferral; spouse $80,000 salary. The self's salary
  // absorbs $10,000; the other $14,500 comes off the self's streams ($90,000), of which the SE share is 60/90: $9,666.67 SE-funded.
  // SE tax 60,000 x .9235 x .153 = 8,477.73, half 4,238.865. AGI = 180,000 - 24,500 - 4,238.865 = 151,261.135. QBI = 60,000 - 4,238.865 -
  // 9,666.67 = 46,094.47 -> 9,218.894. Taxable 151,261.135 - 32,200 - 9,218.894 = 109,842.241 -> federal 13,589.293. Payroll FICA
  // 7.65% x (40,000 + 80,000) = 9,180 + SE 8,477.73; Arizona 2.5% x 119,061.135 = 2,976.528. Total 34,223.551. (Before R52: 24,500 -
  // 90,000 household salary < 0, no cut: 33,798.218.)
  const half = seTax(60000) / 2, agi = 180000 - 24500 - half, cut = 14500 * 60000 / 90000;
  const expected = fedJoint(agi - 32200 - 0.2 * (60000 - half - cut)) + 0.0765 * 120000 + seTax(60000) + 0.025 * (agi - 32200);
  const r = run(couplePlan({ salary: 10000, spouseSalary: 80000, streams: [stream('job', 'employment', 30000), stream('business', 'selfEmployment', 60000)],
    accounts: [a('k', 'traditional401k', 0, { contribution: 24500 })] }));
  near(at(r, 41).federalAgi, agi, 'AGI');
  near(at(r, 41).taxes, expected, 'tax');
});
test('R52 R47-02: the funding quote and the committed return carry the owner-attributed QBI', () => {
  // S07 plus a $100,000 expense at 40 and a $500,000 traditional IRA drawn first. Outside cash for the expense is the SE profit less the
  // tax it adds over the wage-only return (wage-only: 80,000 - 32,200 = 47,800 -> federal 5,240 + Arizona 1,195 + FICA 7,650 = 14,085):
  // 80,000 - (35,912.62418 - 14,085) = 58,172.37582. Each IRA dollar costs 22% + 2.5% + 10% (40, no exception) = 34.5% and stays in the
  // 22% bracket and under every QBI limit, so W = (100,000 - 58,172.37582) / .655 = 63,858.968; tax 35,912.62418 + .345 W.
  // (Before R52: W = 62,515.457, tax 56,600.457.)
  const W = (100000 - (80000 - (S07_TAX - 14085))) / 0.655;
  const p = couplePlan({ spouseSalary: 100000, streams: [stream('business', 'selfEmployment', 80000)],
    accounts: [a('k', 'traditional401k', 0, { contribution: 20000, priority: 5 }), a('ira', 'traditionalIRA', 500000, { priority: 1 })] });
  p.retirement.expenses = [{ age: 40, amount: 100000 }]; p.retirement.manualOrder = 'preTax,taxable,roth,hsa';
  const r = run(p);
  near(at(r, 41).withdrawals, W, 'grossed-up withdrawal', 0.01);
  near(at(r, 41).taxes, S07_TAX + 0.345 * W, 'tax', 0.01);
  near(at(r, 41).federalAgi, 154348.18 + W, 'AGI', 0.01);
});
test('R52 R47-02: the working-years check prices the streams with the owner-attributed QBI', () => {
  // S07 with a mortgage paid during the working years ($10,400 a month = $124,800) and a Roth IRA (all contribution basis) drawn first.
  // R49/R51 pay: the salary less the deferral and the wage-only return, 100,000 - 20,000 - 14,085 = 65,915, plus the stream less its
  // marginal tax 35,912.62418 - 14,085 = 21,827.62418: 65,915 + 80,000 - 21,827.62418 = 124,087.37582, short of 124,800 by 712.62418.
  // (Before R52: the stream's tax 20,947.62418, pay 124,967.38, no warning.)
  const p = s07(); p.accounts.push(a('roth', 'rothIRA', 2000000, { contributionBasis: 2000000 })); p.retirement.manualOrder = 'roth,taxable,preTax,hsa';
  p.advanced.debts = [{ id: 'm', name: 'm', owner: 'household', type: 'mortgage', balance: 5000000, rate: 0, rateType: 'fixed', paymentMonthly: 10400, payoffAge: 90, includePayment: true, includeHousingCosts: false }];
  const r = run(p), w = r.issues.find((i) => i.code === 'WORKING_YEARS_NOT_FUNDED_BY_PAY');
  assert.ok(w, 'the working years are short');
  near(w.state.shortfall, 124800 - (65915 + 80000 - (S07_TAX - 14085)), 'shortfall', 1e-6);
  near(at(r, 41).taxes, S07_TAX, 'tax');
});
test('R52 R47-02 controls: no other earner, and a deferral the spouse\'s own salary covers, are unchanged', () => {
  // No spouse salary: AGI 80,000 - 20,000 - 5,651.82 = 54,348.18; QBI 54,348.18 -> 20% = 10,869.636 capped at 20% of 22,148.18 = 4,429.636;
  // taxable 17,718.544 -> 10% = 1,771.8544; Arizona 2.5% x 22,148.18 = 553.7045; SE tax 11,303.64: 13,629.1989.
  let r = run(couplePlan({ streams: [stream('business', 'selfEmployment', 80000)], accounts: [a('k', 'traditional401k', 0, { contribution: 20000 })] }));
  near(at(r, 41).taxes, 1771.8544 + 553.7045 + 11303.64, 'single earner');
  // The deferral is the spouse's, from the spouse's $100,000 salary: QBI 80,000 - 5,651.82 = 74,348.18 -> 14,869.636; taxable
  // 154,348.18 - 32,200 - 14,869.636 = 107,278.544 -> 13,025.27968; + 18,953.64 + 3,053.7045 = 35,032.62418.
  r = run(couplePlan({ spouseSalary: 100000, streams: [stream('business', 'selfEmployment', 80000)], accounts: [a('k', 'traditional401k', 0, { owner: 'spouse', contribution: 20000 })] }));
  near(at(r, 41).taxes, fedJoint(107278.544) + 18953.64 + 3053.7045, 'spouse defers from salary');
});

// =====================================================================================================================================
// R48-01: basis follows a pool-changing transfer; the validator accepts the post-death rollover
// =====================================================================================================================================
// S10's household: both 45; the self earns $200,000 to 46 with a $1 Roth 401(k) deferral (an active participant, so the $7,500
// traditional IRA contribution at 45 is nondeductible: MAGI far above the $149,000 joint phase-out end) -- $7,500 of Form 8606 basis
// created in the projection. The self dies at 46.5; the spouse, under 59 1/2, holds the IRA as inherited (R48) from the row opening at
// 47. The survivor files single from then on. Single tax on $30,000: federal 10% x 12,400 + 12% x 1,500 = 1,420; Arizona 2.5% x 13,900 =
// 347.50: 1,767.50.
function s10(o = {}) {
  const p = b({ couple: true, age: 45, spouseAge: 45, retireAge: 46, endAge: o.end ?? 49, salary: 200000, spending: 0, manualOrder: 'preTax,taxable,roth,hsa',
    accounts: [a('deceased', 'traditionalIRA', 0, { contribution: 7500, priority: o.deceasedPriority ?? 1 }), a('survivor', 'traditionalIRA', o.survivorBalance ?? 0, { owner: 'spouse', priority: o.survivorPriority ?? 2 }),
      a('coverage', 'roth401k', 0, { contribution: 1, priority: 8 }), a('cash', 'taxable', 5000, { priority: 9 })],
    otherIncomes: o.pension === false ? [] : [stream('pension', 'pension', 30000, 'spouse', 48, o.pensionEnd ?? 49)] });
  p.employment.contributionStop = 46; p.retirement.selfLife = 46.5; p.retirement.expenses = o.expenses ?? [{ age: 48, amount: 37500 }]; p.advanced.penaltyException = true;
  Object.assign(p.advanced, { transferOn: true, transferFrom: o.from ?? 'deceased', transferTo: o.to ?? 'survivor', transferAmount: o.amount ?? 7500, transferAge: o.at ?? 47.5 });
  return p;
}
test('R52 R48-01 (S10): the inherited IRA rolled into the survivor\'s own IRA keeps its basis', () => {
  // The whole $7,500 moves at 47.5 with all $7,500 of basis. At 48 a $30,000 pension against a $37,500 expense: $7,500 from the IRA, all
  // basis. AGI $30,000, tax $1,767.50. (Before R52: AGI $37,500, tax $2,855; and the validator refused the transfer.)
  const r = runPlan(s10());
  near(at(r, 49).federalAgi, 30000, 'AGI'); near(at(r, 49).taxes, 1767.5, 'tax');
});
test('R52 R48-01: a partial move carries its share of the basis', () => {
  // $3,750 of the $7,500 moves: basis 7,500 x 3,750 / 7,500 = $3,750 goes with it and $3,750 stays. At 48 the $7,500 draw takes the
  // inherited $3,750 (priority 1; all basis) and the own $3,750 (all basis): AGI $30,000. (Before R52: the own $3,750 was taxed, $33,750.)
  const r = runPlan(s10({ amount: 3750 }));
  near(at(r, 49).federalAgi, 30000, 'AGI'); near(at(r, 49).taxes, 1767.5, 'tax');
});
test('R52 R48-01: a draw from the inherited IRA earlier in the row, then the transfer of the rest', () => {
  // At 47 a $2,500 expense is drawn from the inherited IRA (all basis: AGI 0); at 47.75 (after the year's draw) the remaining $5,000
  // moves with the remaining $5,000 of basis (5,000 x 5,000 / 5,000). At 48 the pension and a $35,000 expense: $5,000 from the own IRA,
  // all basis. AGI 0 then $30,000. (Before R52: $35,000 at 49.)
  const r = runPlan(s10({ amount: 7500, at: 47.75, expenses: [{ age: 47, amount: 2500 }, { age: 48, amount: 35000 }] }));
  near(at(r, 48).federalAgi, 0, 'AGI in the transfer row');
  near(at(r, 49).federalAgi, 30000, 'AGI'); near(at(r, 49).taxes, 1767.5, 'tax');
});
test('R52 R48-01: a partial move, a draw, and the later automatic election use the basis exactly once', () => {
  // No pension. $3,750 moves at 47.5 with $3,750 of basis. At 48 a $3,750 expense from the own IRA (priority 1): all basis, AGI 0. From
  // the row opening at 60 (the survivor 59 1/2 or older) the inherited IRA is the survivor's own, with its remaining $3,750 of basis. At 61
  // a $3,750 expense from it: all basis, AGI 0. (Before R52: AGI $3,750 at 49.)
  const r = runPlan(s10({ amount: 3750, pension: false, end: 62, deceasedPriority: 2, survivorPriority: 1, expenses: [{ age: 48, amount: 3750 }, { age: 61, amount: 3750 }] }));
  near(at(r, 49).federalAgi, 0, 'AGI after the transfer'); near(at(r, 49).withdrawals, 3750, 'drawn');
  near(at(r, 62).federalAgi, 0, 'AGI after the election'); near(at(r, 62).withdrawals, 3750, 'drawn');
});
test('R52 R48-01 control: the survivor\'s own taxable IRA money, a partial move and the election -- no basis counted twice', () => {
  // The survivor's own IRA opens with $7,500 and no basis. $3,750 moves in at 47.5 with $3,750 of basis; at 60 the inherited $3,750 joins
  // with its $3,750: one pool of $15,000 holding $7,500 of basis. At 61 a $45,000 expense against the $30,000 pension takes all $15,000:
  // $7,500 taxable, AGI $37,500 -- federal 10% x 12,400 + 12% x 9,000 = 2,320, Arizona 2.5% x 21,400 = 535: $2,855. (The same before R52,
  // whose election carried all $7,500 at once; basis counted twice would show $33,750.)
  const r = runPlan(s10({ amount: 3750, end: 62, pensionEnd: 62, survivorBalance: 7500, deceasedPriority: 2, survivorPriority: 1, expenses: [{ age: 61, amount: 45000 }] }));
  near(at(r, 62).federalAgi, 37500, 'AGI'); near(at(r, 62).taxes, 2855, 'tax');
});
test('R52 R48-01: the RMD reserve stays in the inherited IRA; what moves carries its basis', () => {
  // The self is 74 (born 1952: RMDs from 73) with $400,000 salary and the $1 Roth 401(k) deferral, so the IRA contribution is
  // nondeductible; the self dies at 74.5 (the IRA contribution follows the contribution window to the death: half of $7,500, $3,750 -- all
  // basis). The spouse, 50, holds it inherited; in the row 75 -> 76 the spouse-beneficiary distribution is the prior year-end $3,750 over
  // the survivor's single life expectancy at 51, 35.3 (Treas. Reg. 1.401(a)(9)-9(b), the longer of the two when the decedent was past the
  // required beginning date), $106.23 -- all basis. The transfer at 75.5 asks for all $7,500 and moves only what the reserve leaves; its
  // basis goes with it. Every IRA dollar is basis, so the household's AGI is 0 in every row after the death. (Before R52: the own IRA's
  // $3,000 draw at 76 was taxed.)
  const p = b({ couple: true, age: 74, spouseAge: 50, retireAge: 75, endAge: 78, salary: 400000, spending: 0, manualOrder: 'preTax,taxable,roth,hsa', rmdOn: true,
    accounts: [a('deceased', 'traditionalIRA', 0, { contribution: 7500, priority: 2 }), a('survivor', 'traditionalIRA', 0, { owner: 'spouse', priority: 1 }),
      a('coverage', 'roth401k', 0, { contribution: 1, priority: 8 }), a('cash', 'taxable', 5000, { priority: 9 })] });
  p.employment.contributionStop = 75; p.retirement.selfLife = 74.5; p.retirement.expenses = [{ age: 76, amount: 3000 }]; p.advanced.penaltyException = true;
  Object.assign(p.advanced, { transferOn: true, transferFrom: 'deceased', transferTo: 'survivor', transferAmount: 7500, transferAge: 75.5 });
  const r = runPlan(p);
  near(at(r, 76).rmd, 3750 / 35.3, 'the spouse-beneficiary distribution', 0.01);
  near(at(r, 76).preTax, 3750 - 3750 / 35.3, 'the rest moved, nothing lost', 0.01);
  for (const age of [76, 77, 78]) near(at(r, age).federalAgi, 0, 'AGI at ' + age);
});
test('R52 R48-01: the validator accepts the post-death rollover and keeps every other between-owner refusal', () => {
  // Accepted: S10's transfer at 47.5, in the row opening at 47, after the death at 46.5 (the engine re-owns the accounts there), and the
  // other post-death rollovers above -- each plan valid as a whole.
  for (const [label, p] of [['S10', s10()], ['partial', s10({ amount: 3750 })], ['after a draw', s10({ at: 47.75, expenses: [{ age: 47, amount: 2500 }, { age: 48, amount: 35000 }] })]]) {
    const v = validateScenario(structuredClone(p));
    assert.equal(v.valid, true, label + ': ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR').map((i) => i.code)));
  }
  // Refused, as before: dated before the death; dated after the death but in the death's own row (the accounts change hands at the next
  // row opening, and the engine refuses it there too); a Roth IRA into the survivor's Roth IRA; the survivor's own IRA into the deceased's.
  const before = s10({ at: 46.25 }), sameRow = s10({ at: 46.75 }), toDeceased = s10({ from: 'survivor', to: 'deceased' });
  const roth = s10(); roth.accounts.push(a('droth', 'rothIRA', 1000, { priority: 5 }), a('sroth', 'rothIRA', 0, { owner: 'spouse', priority: 6 }));
  Object.assign(roth.advanced, { transferFrom: 'droth', transferTo: 'sroth', transferAmount: 1000 });
  for (const [label, p] of [['before the death', before], ['in the death row', sameRow], ['Roth IRA to Roth IRA', roth], ['own into the deceased\'s', toDeceased]]) {
    assert.ok(vCodes(p).includes('TRANSFER_BETWEEN_OWNERS'), label + ' still refused');
  }
  assert.ok(runPlan(sameRow).issues.some((i) => i.code === 'TRANSFER_BETWEEN_OWNERS_REFUSED'), 'the engine refuses the death-row transfer too');
});

// =====================================================================================================================================
// R50-01: the Roth conversion ledger after settlement
// =====================================================================================================================================
// S17's household: one 45-year-old earning $200,000 to 46 with a $1 traditional 401(k) deferral (an active participant: the $7,500
// traditional IRA contribution at 45 is nondeductible, MAGI far above the $91,000 single phase-out end), converting $7,500 a year from
// 45. The conversion is priced before the year's basis exists (provisionally all taxable); Form 8606 settles it at the year's end.
// Settled salary-year tax (row 46): AGI 200,000 - 1 = 199,999, taxable 183,899 -> federal 1,240 + 4,560 + 12,166 + 24% x 78,199 =
// 36,733.76; FICA 6.2% x 184,500 + 1.45% x 200,000 = 14,339 (no Additional Medicare: wages not over $200,000); Arizona 2.5% x 183,899 =
// 4,597.475: 55,670.235. The 10% applies to a Roth IRA dollar from a conversion's taxable part inside its five years before 59 1/2
// (408A(d)(3)(F); 1.408A-6 A-5(b)); a conversion's nontaxable part bears none.
function s17(o = {}) {
  const q = b({ age: 45, retireAge: o.retire ?? 46, endAge: o.end ?? 47, salary: 200000, spending: 0, manualOrder: o.order ?? 'taxable,roth,preTax,hsa',
    accounts: [a('i', 'traditionalIRA', o.ira ?? 0, { contribution: 7500 }), a('r', 'rothIRA', 0, { priority: 1 }), a('active', 'traditional401k', o.k401 ?? 0, { contribution: 1, priority: 8 }), a('cash', 'taxable', 20000)] });
  q.employment.contributionStop = o.retire ?? 46;
  Object.assign(q.advanced, { conversionOn: o.conversion !== false, conversionAmount: typeof o.conversion === 'number' ? o.conversion : 7500, conversionStartAge: o.conversionStart ?? 45 });
  if (o.transfer !== false) Object.assign(q.advanced, { transferOn: true, transferFrom: o.from ?? 'r', transferTo: o.to ?? 'cash', transferAmount: o.amount ?? 5000, transferAge: o.at ?? 46 });
  if (o.expenses) q.retirement.expenses = o.expenses;
  return q;
}
const SALARY_YEAR = 36733.76 + 14339 + 4597.475;
test('R52 R50-01 (S17): a fully nontaxable conversion carries no 10% on a later draw', () => {
  // Settlement: basis 7,500, conversion 7,500, year-end value 0 -> fraction 1: the conversion is $7,500 nontaxable, $0 taxable. The $5,000
  // Roth IRA -> cash at 46 comes from it: no 10%. Row 47 settled tax 0 (its other $1 conversion is under every deduction).
  // (Before R52: the ledger kept the provisional $7,500 taxable -> $500.)
  near(SALARY_YEAR, 55670.235, 'the salary year', 1e-6);
  const r = run(s17());
  near(at(r, 46).taxSettled, SALARY_YEAR, 'settled salary year');
  near(at(r, 47).taxSettled, 0, 'settled tax with the draw');
});
test('R52 R50-01: mixed basis -- the settled split, not the provisional one, decides the 10%', () => {
  // The IRA opens with $7,500 (no basis). Year 1: contribution 7,500, conversion 7,500; settled basis 7,500 over 7,500 + 7,500 -> half:
  // $3,750 taxable, $3,750 nontaxable. Year 2: the $5,000 draw at 46 takes the year-1 record taxable first: $3,750 at 10% = $375, then
  // $1,250 nontaxable. The year-2 conversion (the remaining $7,500 at fraction 3,750/7,500) adds $3,750 of income, under the deduction.
  // Row 47 settled tax $375. (Before R52: $7,500 taxable -> $500.)
  near(at(run(s17({ ira: 7500 })), 47).taxSettled, 375, 'settled tax with the draw');
});
test('R52 R50-01: two years\' conversions -- each year\'s record reconciled', () => {
  // Salary and the $7,500 nondeductible contribution in both years (retire at 47), $7,500 converted each year: each settles fully
  // nontaxable. $10,000 Roth IRA -> cash at 47 takes 7,500 of year 1 and 2,500 of year 2: no 10%. Row 48 settled tax 0.
  // (Before R52: $10,000 x 10% = $1,000.)
  near(at(run(s17({ retire: 47, end: 48, amount: 10000, at: 47 })), 48).taxSettled, 0, 'settled tax with the draw');
});
test('R52 R50-01: a scheduled-transfer conversion is reconciled too', () => {
  // No scheduled conversion; the transfer moves the $7,500 IRA into the Roth IRA at 45.75 (a conversion; provisionally all taxable).
  // Settled fully nontaxable. Row 2: the $1,987.50 refund (26.5% x 7,500: 24% federal + 2.5% Arizona) and $18,012.50 of cash fund a
  // $25,000 expense with $5,000 from the Roth IRA -- conversion principal, no 10%. Row 47 settled tax 0, Roth $2,500 left.
  // (Before R52: $555.56 of 10%, the draw grossed up for it.)
  const p = s17({ conversion: false, from: 'i', to: 'r', amount: 7500, at: 45.75, expenses: [{ age: 46, amount: 25000 }] });
  p.advanced.conversionOn = false;
  const r = run(p);
  near(at(r, 47).taxSettled, 0, 'settled tax'); near(at(r, 47).roth, 2500, 'Roth left');
});
test('R52 R50-01: a pool that grows after the conversion makes part of it taxable', () => {
  // Year 1: the nondeductible $7,500 (no conversion yet): basis 7,500 on 7,500. Year 2 (retired): $3,750 converted at 46, priced at
  // 7,500/7,500 -> all nontaxable; then $3,750 of 401(k) money rolls into the IRA at 46.75. Form 8606: basis 7,500 over 7,500 (year-end
  // value) + 3,750 -> 2/3: $2,500 nontaxable, $1,250 taxable. Year 3: a $3,750 expense at 47 drawn from the Roth IRA (after that year's
  // own conversion, 3,750 at 5,000/7,500: 2,500 nontaxable, 1,250 taxable): the year-2 record first -- $1,250 taxable at 10%, $2,500
  // nontaxable -- and the 10% itself is drawn from the year-3 record's taxable part: W = 3,750 + .1 x (1,250 + (W - 3,750)), W = 3,888.89,
  // 10% = $138.89. Income tax 0 (AGI $1,250). (Before R52: the record stayed all nontaxable -> 0.)
  const r = run(s17({ conversion: 3750, conversionStart: 46, k401: 3750, from: 'active', to: 'i', amount: 3750, at: 46.75, end: 48, order: 'roth,taxable,preTax,hsa', expenses: [{ age: 47, amount: 3750 }] }));
  near(at(r, 47).federalAgi, 1250, 'settled conversion income');
  near(at(r, 48).taxSettled, 1250 / 9, 'settled tax with the draw');
});
test('R52 R50-01 control: a pool that falls after the conversion leaves it nontaxable', () => {
  // Returns -10%. Year 1: basis 7,500 on at most 7,500 of value. Year 2: $5,000 converted -- basis above the pool, fraction 1 both when
  // priced and when settled. A $2,000 draw from the Roth IRA at 47: conversion principal, no 10%. Row 48 settled tax 0.
  const p = s17({ conversion: 5000, conversionStart: 46, transfer: false, end: 48, order: 'roth,taxable,preTax,hsa', expenses: [{ age: 47, amount: 2000 }] });
  p.advanced.assetClasses[0].returnRate = -10;
  near(at(run(p), 48).taxSettled, 0, 'settled tax');
});
test('R52 R50-01: the survivor takes the reconciled ledger', () => {
  // A couple; the self earns $200,000 to 46 and makes S17's nondeductible contribution and conversion, then dies at 46.5. The ledger,
  // reconciled at the end of year 1, passes to the spouse (1.408A-6 A-7(b)). The spouse, 47, moves $5,000 from the Roth IRA to cash at
  // 47: conversion principal, no 10%. Row 48 settled tax 0. (Before R52: $500.)
  const p = b({ couple: true, age: 45, spouseAge: 45, retireAge: 46, endAge: 48, salary: 200000, spending: 0, manualOrder: 'taxable,roth,preTax,hsa',
    accounts: [a('i', 'traditionalIRA', 0, { contribution: 7500 }), a('r', 'rothIRA', 0, { priority: 1 }), a('active', 'traditional401k', 0, { contribution: 1, priority: 8 }), a('cash', 'taxable', 20000)] });
  p.employment.contributionStop = 46; p.retirement.selfLife = 46.5;
  Object.assign(p.advanced, { conversionOn: true, conversionAmount: 7500, conversionStartAge: 45, transferOn: true, transferFrom: 'r', transferTo: 'cash', transferAmount: 5000, transferAge: 47 });
  near(at(run(p), 48).taxSettled, 0, 'settled tax with the draw');
});
test('R52 R50-01: a draw taken the same year as the conversion is re-split, and its 10% refunded', () => {
  // S17 with the $5,000 Roth IRA -> cash at 45.75, after that year's conversion: provisionally $5,000 of the conversion's taxable part,
  // $500 of 10% paid in the row. Settlement makes the conversion all nontaxable: the draw is principal, the $500 comes back through the
  // true-up. Row 46: settled tax 55,670.235 (no 10%); outstanding = the conversion's income refund -26.5% x 7,500 = -1,987.50 and the
  // -$500: -2,487.50. (Before R52: 56,170.235 and -1,987.50.)
  const r = run(s17({ at: 45.75 }));
  near(at(r, 46).taxSettled, SALARY_YEAR, 'settled tax');
  near(at(r, 46).taxOutstanding, -1987.5 - 500, 'refund due');
});
test('R52 R50-01 control: past its five years a conversion\'s taxable part is free either way', () => {
  // The mixed-basis household drawing $5,000 at 51 (tax year 6 >= year 0 + 5): no 10% before or after the repair. Row 52 settled tax 0.
  near(at(run(s17({ ira: 7500, at: 51, end: 52 })), 52).taxSettled, 0, 'settled tax');
});
