/* S5AA R47 (the owner's AA1 decisions, 2026-10-03) -- FEDERAL TAX AND RETIREMENT ACCOUNTS.
 *
 * The owner's decisions (audit/S5AA/AA1, "The owner's decisions"):
 * 1. AA1-30: the enhanced senior deduction ends after 2028 (IRC 151(d)(5)(C)(i): "a taxable year beginning before January 1,
 *    2029"). Row k of a plan is tax year 2026 + k. This reverses the owner's earlier Q165 refinement.
 * 2. AA1-13: a high earner's catch-up is designated Roth (IRC 414(v)(7)(A)): when the owner's prior-year FICA wages from the
 *    plan's employer exceed the threshold ($150,000 used in 2026, Notice 2025-67), the catch-up part of the deferral goes to a
 *    Roth balance of the same plan and is taxed now. Prior-year wages: the entered priorYearFicaWages in the first row, the
 *    owner's salary wages of the prior row after it, less that owner's HSA salary reduction (not FICA wages, 3121(a)(5)(G)). A
 *    plan with no Roth option allows no catch-up to such a participant (414(v)(7)(B)).
 * 3. AA1-27: under "warn" an IRA or HSA excess pays IRC 4973's 6% a year on the excess carried at the year's close, capped at 6%
 *    of the accounts' year-end value, reduced by later unused room and by distributions included in income (4973(b), (f), (g)).
 *    It is a tax of the year, owed with the return: it is in the row's settled tax and outstanding, and paid in the next row.
 * 4. AA1-45: pre-tax deferrals funded from self-employment pay reduce qualified business income (Treas. Reg.
 *    1.199A-3(b)(1)(vi)), in the proportion they reduce AGI. AA1-26: IRA compensation from self-employment is the profit less
 *    the deductible half of the SE tax (IRC 219(f)(1), 401(c)(2)(A)(vi); Pub. 590-A).
 * 5. AA1-32: HSA contributions stop at Medicare entitlement (IRC 223(b)(7)): 65 when the owner's Social Security claim is at 65
 *    or earlier, or no benefit is modelled; otherwise the claim age less six months (Part A is backdated up to six months, never
 *    before 65); profile.medicareStartAge / spouseMedicareStartAge override it.
 *
 * Returns, inflation and salary growth are 0, so every row uses the 2026 figures. Rows are labelled by their closing age.
 * Every expected figure is hand-derived from the law and the inputs; the derivation sits beside each case.
 * 2026 single figures used: standard deduction $16,100; 63(f) age-65 amount (unmarried) $2,050; brackets 10% to $12,400, 12% to
 * $50,400, 22% to $105,700, 24% to $201,775; Arizona 2.5% after its $16,100 and $2,100 per person 65+; OASDI 6.2% to $184,500,
 * Medicare 1.45%; Schedule SE 92.35%, 12.4% + 2.9%. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const engine = L.h.engine;
const { validateScenario } = require(path.join(__dirname, '..', 'src', 'scenario-validator.js'));
const SHELL = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');

const cents = (x) => Math.round(x * 100) / 100;
function run(p) {
  const v = validateScenario(structuredClone(p));
  assert.equal(v.valid, true, JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  return r;
}
const at = (r, age) => { const row = r.rows.find((x) => Math.abs(x.age - age) < 1e-9); assert.ok(row, 'row ' + age); return row; };
const BR = [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]];
const reg = (ti) => { let t = 0, prev = 0; for (const [c, rate] of BR) { if (ti > prev) t += (Math.min(ti, c) - prev) * rate; prev = c; } return t; };
const stream = (id, type, amount) => ({ id, name: id, type, amount, start: 0, end: 120, owner: 'self', growthMode: 'fixed', growth: 0 });

// ===== 1. AA1-30: the senior deduction ends after 2028 ======================================================================
// A single 70-year-old, retired, with a $50,000 pension and no spending. Rows close at 71 (2026), 72, 73 (2028), 74 (2029), 75.
function pensioner(age) {
  return L.basePlan({ age, endAge: age + 5, spending: 0, otherIncomes: [stream('pen', 'pension', 50000)], accounts: [L.account('roth', 'rothIRA', 100000)] });
}
test('R47 AA1-30: a single 70-year-old keeps the $6,000 senior deduction in 2028 and loses it in 2029', () => {
  // 2028: deduction 16,100 + 2,050 + 6,000 (MAGI 50,000 under 75,000) = 24,150; taxable 25,850; 1,240 + 12% x 13,450 = 2,854.
  // Arizona: 50,000 - 16,100 - 2,100 = 31,800 x 2.5% = 795. Total 3,649.
  // 2029: deduction 18,150; taxable 31,850; 1,240 + 12% x 19,450 = 3,574; Arizona 795 (unchanged). Total 4,369.
  // S5AA R48 integrated (A.R.S. 43-1022(35)): in 2028 Arizona also subtracts the federal $6,000: 25,800 x 2.5% = 645, total 3,499.
  // From 2029 there is no federal deduction for Arizona to subtract, so 2029 and 2030 are unchanged.
  const r = run(pensioner(70));
  assert.equal(cents(at(r, 73).taxes), 3499, 'tax year 2028');
  assert.equal(cents(at(r, 74).taxes), 4369, 'tax year 2029: the federal $6,000 x 12% and the Arizona $150 gone');
  assert.equal(cents(at(r, 75).taxes), 4369, 'tax year 2030');
});
test('R47 AA1-30: the funding solver quotes the draw without the deduction after 2028 (taxSegmentLocal mirrors it)', () => {
  // A single 70-year-old drawing $40,000 of spending from a traditional IRA; the draw X also pays its own tax T = X - 40,000.
  // 2029: X = 40,000 + 1,240 + 12% (X - 18,150 - 12,400) + 2.5% (X - 16,100 - 2,100) -> 0.855 X = 37,119 -> X = 43,414.04, T = 3,414.04.
  // (R47 build miss: first derived as 43,413.45, a division slip; 0.855 x 43,414.04 = 37,119.00.)
  // 2028: 0.855 X = 41,240 - 12% x 36,550 - 455 = 36,399 -> X = 42,571.93, T = 2,571.93 (R47 alone).
  // S5AA R48 integrated (A.R.S. 43-1022(35)): Arizona also subtracts the federal $6,000 in 2028, so its term is 2.5% (X - 24,200):
  // 0.855 X = 41,240 - 4,386 - 605 = 36,249 -> X = 42,396.49, T = 2,396.49. 2029 has no federal deduction, so it is unchanged.
  const p = L.basePlan({ age: 70, endAge: 75, spending: 40000, order: 'manual', manualOrder: 'preTax,taxable,roth,hsa', accounts: [L.account('ira', 'traditionalIRA', 1000000)] });
  const r = run(p);
  assert.ok(!(r.issues || []).some((x) => /QUOTE|SETTLEMENT/.test(x.code)), JSON.stringify((r.issues || []).map((x) => x.code)));
  assert.equal(cents(at(r, 73).taxes), 2396.49);
  assert.equal(cents(at(r, 74).taxes), 3414.04);
  assert.equal(cents(at(r, 74).withdrawals), 43414.04);
});
test('R47 AA1-30 control: nobody 65 or older -- 2028 and 2029 tax the same draw the same', () => {
  // A single 60-year-old: X = 41,240 + 12% (X - 28,500) + 2.5% (X - 16,100) -> 0.855 X = 37,417.50 -> T = 3,763.16 in both years.
  const p = L.basePlan({ age: 60, endAge: 65, spending: 40000, order: 'manual', manualOrder: 'preTax,taxable,roth,hsa', accounts: [L.account('ira', 'traditionalIRA', 1000000)] });
  const r = run(p);
  assert.equal(cents(at(r, 63).taxes), 3763.16);
  assert.equal(cents(at(r, 64).taxes), 3763.16);
});
// (R47 build: the direct check of the per-year rules' tax year and seniorDeduction() moved to tests/audit-s5aa-r47-internals.test.js,
// implementation-coupled by design, so this file stays a public-route witness file.)
test('R47 AA1-30: the app says the senior deduction ends after 2028, not that the plan keeps it', () => {
  assert.equal(SHELL.includes('which this plan keeps after 2028'), false);
  assert.ok(/senior deduction[^"]*ends after 2028/.test(SHELL), 'the Later tax years card states the sunset');
});

// ===== 2. AA1-13: a high earner's catch-up is designated Roth ===============================================================
// A single 55-year-old earning `salary` (no growth), retiring at 60, deferring $32,500 to a traditional 401(k): $24,500 + the
// $8,000 catch-up (age 50+, not 60-63). Rows close at 56 and 57; no spending before retirement.
function catchup(o = {}) {
  const extra = { contribution: 32500 };
  if (o.wages !== undefined) extra.priorYearFicaWages = o.wages;
  if (o.offersRoth === false) extra.planOffersRoth = false;
  const accounts = [L.account('k', o.type || 'traditional401k', 0, Object.assign(extra, o.type === 'roth401k' ? {} : {})), L.account('brok', 'taxable', 0, { basisPct: 100 })];
  if (o.hsa) accounts.push(L.account('hsa', 'hsa', 0, { contribution: o.hsa }));
  const p = L.basePlan({ age: 55, retireAge: 60, endAge: 57, salary: o.salary ?? 200000, spending: 0, accounts });
  p.employment.contributionStop = 60;
  return p;
}
test('R47 AA1-13: entered prior-year wages of $175,000 -- the $8,000 catch-up is Roth in the first row, and taxed', () => {
  // Pre-tax 24,500; Roth 8,000. Federal: taxable 200,000 - 24,500 - 16,100 = 159,400 -> 1,240 + 4,560 + 22% x 55,300 (12,166)
  // + 24% x 53,700 (12,888) = 30,854. Payroll: 6.2% x 184,500 = 11,439 + 1.45% x 200,000 = 2,900 (no Additional Medicare at
  // 200,000). Arizona: 159,400 x 2.5% = 3,985. Total 49,178 (the catch-up excluded: 47,058).
  const r = run(catchup({ wages: 175000 }));
  const row = at(r, 56);
  assert.equal(cents(row.preTax), 24500);
  assert.equal(cents(row.roth), 8000);
  assert.equal(cents(row.taxes), 49178);
});
test('R47 AA1-13: after the first row the prior row\'s salary ($200,000) decides -- Roth again', () => {
  const row = at(run(catchup({ wages: 175000 })), 57);
  assert.equal(cents(row.preTax), 49000);
  assert.equal(cents(row.roth), 16000);
});
test('R47 AA1-13: no wages entered -- the first row cannot be tested (pre-tax); the second reads the prior row\'s $200,000 (Roth)', () => {
  const r = run(catchup({}));
  assert.equal(cents(at(r, 56).preTax), 32500);
  assert.equal(cents(at(r, 56).roth), 0);
  assert.equal(cents(at(r, 57).preTax), 57000);
  assert.equal(cents(at(r, 57).roth), 8000);
});
test('R47 AA1-13: entered $175,000 but a $140,000 salary -- Roth in the first row, pre-tax once the prior row\'s wages are $140,000', () => {
  const r = run(catchup({ wages: 175000, salary: 140000 }));
  assert.equal(cents(at(r, 56).roth), 8000);
  assert.equal(cents(at(r, 57).roth), 8000, 'the second row\'s catch-up stays pre-tax');
  assert.equal(cents(at(r, 57).preTax), 24500 + 32500);
});
test('R47 AA1-13 control: wages exactly $150,000 do not exceed the threshold -- the catch-up stays pre-tax', () => {
  const r = run(catchup({ wages: 150000, salary: 150000 }));
  assert.equal(cents(at(r, 57).preTax), 65000);
  assert.equal(cents(at(r, 57).roth), 0);
});
test('R47 AA1-13: an HSA salary reduction is not FICA wages -- $155,000 less $5,400 is $149,600, so the second row is pre-tax', () => {
  // The HSA: self-only $4,400 + the age-55 $1,000 = $5,400, through payroll (excluded from FICA wages, 3121(a)(5)(G)).
  const withHsa = run(catchup({ wages: 175000, salary: 155000, hsa: 5400 }));
  assert.equal(cents(at(withHsa, 57).roth), 8000, 'row 57: prior FICA wages 149,600 -> pre-tax');
  const noHsa = run(catchup({ wages: 175000, salary: 155000 }));
  assert.equal(cents(at(noHsa, 57).roth), 16000, 'control: 155,000 > 150,000 -> Roth');
});
test('R47 AA1-13 (414(v)(7)(B)): a plan with no Roth option allows no catch-up to this participant -- the $8,000 is an excess, redirected', () => {
  // (R47 build miss: the redirected $8,000 in taxable drew the engine's imputed 1.5% dividend, taxed and paid from it; the dividend feature
  // is switched on at a 0% yield so the taxable account holds exactly the $8,000.)
  const p = catchup({ wages: 175000, offersRoth: false });
  Object.assign(p.retirement, { dividendOn: true, dividendYield: 0 });
  const r = run(p);
  const row = at(r, 56);
  assert.equal(cents(row.preTax), 24500);
  assert.equal(cents(row.roth), 0);
  assert.equal(cents(row.taxable), 8000, 'redirect policy: the excess goes to taxable savings');
  assert.equal(cents(row.taxes), 49178, 'the $8,000 is not excluded');
});
test('R47 AA1-13 control: a Roth 401(k)\'s catch-up is Roth already -- nothing moves', () => {
  const r = run(catchup({ wages: 175000, type: 'roth401k' }));
  assert.equal(cents(at(r, 56).roth), 32500);
  assert.equal(cents(at(r, 56).taxes), 49178 + 0.24 * 24500 + 0.025 * 24500, 'the whole deferral is taxed: 24,500 more at 24% + 2.5%');
});
test('R47 AA1-13: a spouse\'s plan reads the spouse\'s own wages', () => {
  const p = L.basePlan({ couple: true, age: 55, spouseAge: 55, retireAge: 60, endAge: 56, salary: 0, spouseSalary: 200000, spending: 0,
    accounts: [L.account('k', 'traditional401k', 0, { owner: 'spouse', contribution: 32500, priorYearFicaWages: 175000 })] });
  p.employment.contributionStop = 60;
  p.profile.spouseRetireAge = 60;
  const row = at(run(p), 56);
  assert.equal(cents(row.preTax), 24500);
  assert.equal(cents(row.roth), 8000);
});

// ===== 3. AA1-27: IRC 4973's 6% excise under "warn" ==========================================================================
// A single 40-year-old earning $50,000, retiring at 41 (no compensation after), contributing $10,000 to a traditional IRA in the
// one working row: $2,500 over the $7,500 limit. Spending $1,000 a year from age 41 out of a $100,000 taxable account at full basis.
function excess(o = {}) {
  const accounts = [L.account('cash', 'taxable', 100000, { basisPct: 100 }), L.account('ira', o.type || 'traditionalIRA', 0, { contribution: o.contribution ?? 10000, futureChanges: o.changes || [] })];
  const p = L.basePlan({ age: 40, retireAge: o.retireAge ?? 41, endAge: 44, salary: 50000, spending: o.spending ?? 1000, accounts,
    order: 'manual', manualOrder: o.order || 'taxable,preTax,roth,hsa' });
  p.employment.contributionStop = o.retireAge ?? 41;
  p.limitPolicy = o.policy || 'warn';
  p.advanced.penaltyException = true;
  return p;
}
test('R47 AA1-27: a $2,500 IRA excess left in the account owes 6% ($150) at the year\'s close, paid in the next row', () => {
  // 4973(a), (b)(1): 6% x min(2,500, the IRA's year-end $10,000) = 150. The row's settled tax carries it, outstanding.
  const r = run(excess());
  assert.equal(cents(at(r, 41).taxOutstanding), 150);
  assert.equal(cents(at(r, 41).taxSettled - (at(r, 41).taxes - at(r, 41).taxTrueUpPaid)), 150);
  assert.equal(cents(at(r, 42).taxTrueUpPaid), 150);
});
test('R47 AA1-27: with no later compensation nothing absorbs it -- $150 again every year', () => {
  // 4973(b)(2): the prior excess less taxable IRA distributions (none: spending comes from taxable) and less unused room (none:
  // no compensation after 41) -- 2,500 carried, 6% = 150.
  const r = run(excess());
  assert.equal(cents(at(r, 42).taxOutstanding), 150);
  assert.equal(cents(at(r, 43).taxOutstanding), 150);
});
test('R47 AA1-27: later unused room absorbs the excess -- nothing owed once a working year leaves $7,500 of room', () => {
  // Working to 45, the contribution set to $0 at 41: the row closing at 42 has $7,500 of room, which absorbs all $2,500.
  const r = run(excess({ retireAge: 45, changes: [{ age: 41, mode: 'set', value: 0 }] }));
  assert.equal(cents(at(r, 41).taxOutstanding), 150);
  assert.equal(cents(at(r, 42).taxOutstanding), 0);
});
test('R47 AA1-27: a taxable IRA distribution reduces the excess -- $1,150 drawn leaves $1,350, 6% = $81', () => {
  // Spending drawn from the IRA first: row 42 draws its $1,000 of spending plus row 41's $150 excise from the IRA (income $1,150,
  // under the standard deduction, no tax; the 10% waived by the plan's exception). 2,500 - 1,150 = 1,350 x 6% = 81.
  const r = run(excess({ order: 'preTax,taxable,roth,hsa' }));
  assert.equal(cents(at(r, 42).withdrawals), 1150);
  assert.equal(cents(at(r, 42).taxOutstanding), 81);
});
test('R47 AA1-27: a Roth IRA excess pays the same 6% (4973(f))', () => {
  const r = run(excess({ type: 'rothIRA' }));
  assert.equal(cents(at(r, 41).taxOutstanding), 150);
});
test('R47 AA1-27: an HSA excess -- $5,400 against $4,400 owes $60; $4,400 the next year leaves no room ($60); $3,000 absorbs it', () => {
  // 4973(g): 1,000 x 6% = 60; next year 4,400 contributed, room 0, 1,000 carried; then 3,000 contributed, room 1,400 >= 1,000.
  const accounts = [L.account('cash', 'taxable', 100000, { basisPct: 100 }),
    L.account('hsa', 'hsa', 0, { contribution: 5400, futureChanges: [{ age: 41, mode: 'set', value: 4400 }, { age: 42, mode: 'set', value: 3000 }] })];
  const p = L.basePlan({ age: 40, retireAge: 45, endAge: 44, salary: 50000, spending: 0, accounts });
  p.employment.contributionStop = 45;
  p.limitPolicy = 'warn';
  const r = run(p);
  assert.equal(cents(at(r, 41).taxOutstanding), 60);
  assert.equal(cents(at(r, 42).taxOutstanding), 60);
  assert.equal(cents(at(r, 43).taxOutstanding), 0);
});
test('R47 AA1-27: the excise is capped at 6% of the accounts\' year-end value', () => {
  // A -90% year: the year-end IRA is worth less than the $2,500 excess, so the tax is 6% of that value (the row's own preTax).
  const p = excess({ spending: 0 });
  p.advanced.assetClasses = [{ id: 'flat', name: 'Flat', returnRate: -90, volatility: 0 }];
  p.assumptions.returnRate = -90;
  const r = run(p);
  for (const age of [41, 42]) {
    const row = at(r, age);
    assert.ok(row.preTax < 2500, 'the cap binds at ' + age + ': ' + row.preTax);
    assert.equal(cents(row.taxOutstanding), cents(0.06 * row.preTax), 'row ' + age);
  }
});
test('R47 AA1-27: a one-time contribution over the room, moved under "warn", owes the same 6%', () => {
  // No planned contribution; $10,000 moved from taxable into the IRA at 40.5 with $50,000 of pay: room $7,500, excess $2,500.
  const p = excess({ contribution: 0 });
  Object.assign(p.advanced, { transferOn: true, transferFrom: 'cash', transferTo: 'ira', transferAmount: 10000, transferAge: 40.5 });
  const r = run(p);
  assert.equal(cents(at(r, 41).preTax), 10000);
  assert.equal(cents(at(r, 41).taxOutstanding), 150);
});
test('R47 AA1-27 control: "redirect" sends the excess to taxable -- no excise', () => {
  const r = run(excess({ policy: 'redirect' }));
  assert.equal(cents(at(r, 41).taxOutstanding), 0);
  assert.equal(cents(at(r, 42).taxOutstanding), 0);
});
test('R47 AA1-27: the "warn" option says the 6% excise applies (its contribution warning: tests/audit-s5aa-r47-internals.test.js)', () => {
  assert.ok(/<option value="warn">[^<]*6%[^<]*<\/option>/.test(SHELL), 'the option text');
});

// ===== 4. AA1-26 and AA1-45: self-employment ==============================================================================
// Schedule SE on $6,000 of profit: net 6,000 x 0.9235 = 5,541; tax 5,541 x 15.3% = 847.773; deductible half 423.8865.
function seIra(type, once) {
  const p = L.basePlan({ age: 40, retireAge: 60, endAge: 41, salary: 0, spending: 0, otherIncomes: [stream('se', type, 6000)],
    accounts: [L.account('cash', 'taxable', 20000, { basisPct: 100 }), L.account('ira', 'traditionalIRA', 0, { contribution: once ? 0 : 7500 })] });
  p.employment.contributionStop = 60;
  if (once) Object.assign(p.advanced, { transferOn: true, transferFrom: 'cash', transferTo: 'ira', transferAmount: 7500, transferAge: 40.5 });
  return p;
}
test('R47 AA1-26: IRA compensation from $6,000 of self-employment is $5,576.11 (profit less half the SE tax)', () => {
  // 6,000 - 423.8865 = 5,576.1135 against the $7,500 limit; the rest is redirected to taxable.
  const row = at(run(seIra('selfEmployment')), 41);
  assert.equal(cents(row.preTax), 5576.11);
});
test('R47 AA1-26 control: $6,000 of wages (an employment stream) is compensation in full', () => {
  assert.equal(cents(at(run(seIra('employment')), 41).preTax), 6000);
});
test('R47 AA1-26: the one-time route reads the same compensation -- a $7,500 transfer moves $5,576.11', () => {
  // (R47 build miss: a taxable-balance check was dropped -- the row's taxable class also holds the retained surplus of the SE income.)
  const row = at(run(seIra('selfEmployment', true)), 41);
  assert.equal(cents(row.preTax), 5576.11);
});
// $80,000 of profit, a $60,000 pension and a $20,000 solo-401(k) deferral, single. SE: net 73,880; tax 15.3% = 11,303.64; half
// 5,651.82. AGI = 80,000 + 60,000 - 5,651.82 - 20,000 = 114,348.18; taxable before 199A = 98,248.18.
function seQbi(salary) {
  const p = L.basePlan({ age: 40, retireAge: 60, endAge: 41, salary, spending: 0,
    otherIncomes: salary ? [stream('se', 'selfEmployment', 80000)] : [stream('se', 'selfEmployment', 80000), stream('pen', 'pension', 60000)],
    accounts: [L.account('k', 'traditional401k', 0, { contribution: 20000 })] });
  p.employment.contributionStop = 60;
  return p;
}
test('R47 AA1-45: a deferral funded from self-employment pay reduces qualified business income -- $880 more tax', () => {
  // QBI = 80,000 - 5,651.82 - 20,000 = 54,348.18; deduction min(20% = 10,869.636, 20% x 98,248.18 = 19,649.636);
  // taxable 87,378.544 -> 1,240 + 4,560 + 22% x 36,978.544 = 13,935.27968. Plus SE 11,303.64 and Arizona 98,248.18 x 2.5%
  // = 2,456.2045. Total 27,695.12 (with the deferral left in QBI: 26,815.12).
  const row = at(run(seQbi(0)), 41);
  assert.equal(cents(row.taxes), 27695.12);
});
test('R47 AA1-45 control: wages absorb the deferral -- qualified business income keeps the whole profit', () => {
  // Salary 80,000 and profit 80,000: the $20,000 comes off the wages. SE (OASDI room 184,500 - 80,000 covers the 73,880) 11,303.64;
  // AGI 80,000 - 20,000 + 80,000 - 5,651.82 = 134,348.18; taxable 118,248.18; QBI 74,348.18 -> deduction 14,869.636;
  // taxable 103,378.544 -> 1,240 + 4,560 + 22% x 52,978.544 = 17,455.27968. Payroll 4,960 + 1,160; Arizona 2,956.2045.
  // Total 37,835.12.
  assert.equal(cents(at(run(seQbi(80000)), 41).taxes), 37835.12);
});

// ===== 5. AA1-32: HSA contributions stop at Medicare entitlement =============================================================
// A single 64-year-old earning $100,000 to 70, contributing $5,400 (self-only $4,400 + $1,000 catch-up) to an HSA, with a
// $2,000-a-month Social Security benefit claimed at `claim`. Rows close at 65, 66, 67, 68.
function hsa64(o = {}) {
  const p = L.basePlan({ age: 64, retireAge: 70, endAge: 68, salary: 100000, spending: 0, ssBenefit: o.benefit ?? 2000,
    accounts: [L.account('cash', 'taxable', 20000, { basisPct: 100 }), L.account('hsa', 'hsa', 0, { contribution: o.planned ?? 5400 })] });
  p.employment.contributionStop = 70;
  p.retirement.ssClaim = o.claim ?? 67;
  if (o.override !== undefined) p.profile.medicareStartAge = o.override;
  if (o.once) Object.assign(p.advanced, { transferOn: true, transferFrom: 'cash', transferTo: 'hsa', transferAmount: o.once, transferAge: 65.5 });
  return p;
}
test('R47 AA1-32: a claim at 67 starts Medicare at 66.5 -- a full year at 65-66 and half a year at 66-67', () => {
  // 65->66: before 66.5 all year, 5,400. 66->67: share 0.5 -> requested 2,700, limit (4,400 + 1,000) x 0.5 = 2,700. Then 0.
  const r = run(hsa64());
  assert.equal(cents(at(r, 65).hsa), 5400);
  assert.equal(cents(at(r, 66).hsa), 10800);
  assert.equal(cents(at(r, 67).hsa), 13500);
  assert.equal(cents(at(r, 68).hsa), 13500);
});
test('R47 AA1-32 controls: a claim at 65 or earlier, or no benefit modelled, keeps Medicare (and the stop) at 65', () => {
  for (const o of [{ claim: 65 }, { claim: 64 }, { claim: 70, benefit: 0 }]) {
    const r = run(hsa64(o));
    assert.equal(cents(at(r, 66).hsa), 5400, JSON.stringify(o));
    assert.equal(cents(at(r, 68).hsa), 5400, JSON.stringify(o));
  }
});
test('R47 AA1-32: an entered Medicare start of 68 overrides the claim -- contributions through 68', () => {
  const r = run(hsa64({ override: 68 }));
  assert.equal(cents(at(r, 67).hsa), 16200);
  assert.equal(cents(at(r, 68).hsa), 21600);
});
test('R47 AA1-32: the one-time route follows the same date -- $3,000 moved into the HSA at 65.5 fits', () => {
  // No planned contribution; room in the row 65->66 with Medicare at 66.5: (4,400 + 1,000) x 1 = 5,400 >= 3,000.
  const r = run(hsa64({ planned: 0, once: 3000 }));
  assert.equal(cents(at(r, 66).hsa), 3000);
});
test('R47 AA1-32: a spouse\'s HSA reads the spouse\'s own claim (68 -> Medicare at 67.5)', () => {
  // Family coverage $8,750 + the spouse's $1,000; the spouse 65->66 is before 67.5, so the whole $9,750 flows.
  const p = L.basePlan({ couple: true, age: 64, spouseAge: 64, retireAge: 70, endAge: 66, salary: 100000, spouseSalary: 50000, spending: 0,
    spouseSS: 1500, accounts: [L.account('hsa', 'hsa', 0, { owner: 'spouse', contribution: 9750 })] });
  p.employment.contributionStop = 70;
  p.profile.spouseRetireAge = 70;
  p.retirement.spouseClaim = 68;
  const r = run(p);
  assert.equal(cents(at(r, 66).hsa), 19500);
});
test('R47 AA1-32: the two Medicare start ages are numbers -- text or a negative age is refused by the validator and the engine', () => {
  for (const key of ['medicareStartAge', 'spouseMedicareStartAge']) {
    for (const bad of ['66', -1]) {
      const p = L.basePlan({ couple: true });
      p.profile[key] = bad;
      assert.equal(validateScenario(structuredClone(p)).valid, false, key + ' = ' + JSON.stringify(bad));
      const r = engine.runPlan(structuredClone(p));
      assert.equal(r.calculationErrorCode, typeof bad === 'number' ? 'SCENARIO_PLAN_VALUE_OUT_OF_RANGE' : 'SCENARIO_NONNUMBER_PLAN_VALUE', key + ' = ' + JSON.stringify(bad));
    }
  }
});
test('R47 AA1-32: the form offers both Medicare start ages, and the HSA note no longer says contributions stop at 65', () => {
  for (const id of ['v2-medicare-start', 'v2-spouse-medicare-start']) {
    assert.ok(SHELL.includes('id="' + id + '"'), id);
    assert.ok(new RegExp('staticIds=\\[[^\\]]*"' + id + '"').test(SHELL), id + ' recalculates on change');
  }
  assert.equal(SHELL.includes('Contributions stop at each person’s 65th birthday'), false);
});
