/* S5AA R50 (the owner's AA1 decisions, 2026-10-03, on AA1-36 and AA1-31) -- THE ROTH IRA BASIS LEDGER, AND INCOME EARLIER IN THE
 * PLAN'S FIRST TAX YEAR.
 *
 * AA1-36, a Roth IRA basis ledger. The rules (primary sources read 2026-10-03):
 * - All of an owner's Roth IRAs are one (IRC 408A(d)(4)(A); Treas. Reg. 1.408A-6 A-2, A-9). A distribution comes first from regular
 *   contributions, then from conversions, oldest tax year first and each year's taxable part before its nontaxable part, then
 *   from earnings (408A(d)(4)(B); 1.408A-6 A-8). Every distribution, qualified or not, uses the ledger up (408A(d)(4)(B)(i):
 *   "when added to all previous distributions"; 1.408A-6 A-4).
 * - accounts[].contributionBasis: the regular contributions already in a Roth IRA; absent = 0, the conservative reading, disclosed
 *   (ROTH_IRA_BASIS_NOT_ENTERED). In-plan regular contributions add to it; each year's conversions are recorded by year.
 * - Qualified (untaxed, as before): the owner is 59 1/2 or older and the five-year period has run (408A(d)(2)(A)(i), (B)). The
 *   period starts with the owner's profile.rothFirstContributionYear (spouse: profile.spouseRothFirstContributionYear); absent,
 *   it is treated as met when the owner holds a Roth IRA balance or basis at the start (disclosed, ROTH_FIVE_YEAR_ASSUMED), and
 *   otherwise starts with the first tax year a Roth IRA receives money (1.408A-6 A-2). Plan year k is tax year 2026 + k.
 * - Not qualified: contributions are free; a conversion within five tax years of its own year bears the 10% on its taxable part
 *   while the owner is under 59 1/2 (408A(d)(3)(F); 1.408A-6 A-5(b)); earnings are ordinary income and, under 59 1/2, bear the
 *   10% (1.408A-6 A-5(a)). A spouse who treats the account as their own takes over its basis and conversions, and the five-year
 *   period ends at the earlier of the two (1.408A-6 A-7(b)); their own age decides (A-3).
 * - A Roth 401(k) is left as today (untaxed at every age) and stays flagged by UNSUPPORTED_ROTH_ORDERING.
 *
 * AA1-31, profile.priorIncomeThisYear: ordinary income received earlier in the plan's first tax year. When entered and the first
 * row is partial, that row's federal and Arizona income tax is tax(prior + row income) - tax(prior alone): the deduction and the
 * brackets apply to the whole year. Absent, or a whole first row: as before.
 *
 * 2026 figures, single, no inflation, 0% return: standard deduction $16,100 federal and Arizona; 10% to $12,400 of taxable
 * income, 12% to $50,400; Arizona 2.5%. Rows are labelled by their closing age. Every expected figure is derived by hand from the
 * rule and the inputs, beside each case; none is copied from the engine.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const engine = L.h.engine;
const { validateScenario } = require(path.join(__dirname, '..', 'src', 'scenario-validator.js'));

const cents = (x) => Math.round(x * 100) / 100;
function run(p) {
  const v = validateScenario(structuredClone(p));
  assert.equal(v.valid, true, JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  return r;
}
const at = (r, age) => { const row = r.rows.find((x) => Math.abs(x.age - age) < 1e-9); assert.ok(row, 'row ' + age); return row; };
const issues = (r, code) => (r.issues || []).filter((i) => i.code === code);
const roth = (balance, extra) => L.account('roth', 'rothIRA', balance, extra);
const ira = (balance, extra) => L.account('ira', 'traditionalIRA', balance, extra);
const cash = (balance) => L.account('cash', 'taxable', balance, { basisPct: 100, cashHolding: true, priority: 1 });

// ---------------------------------------------------------------------------------------------------------- AA1-36: ordering
// Age 50, $100,000 Roth IRA, $20,000 a year, Roth first.
function early(o = {}) {
  return L.basePlan({ age: 50, endAge: o.endAge ?? 51, spending: o.spending ?? 20000, manualOrder: 'roth,taxable,preTax,hsa',
    accounts: [roth(100000, o.basis === undefined ? {} : { contributionBasis: o.basis })] });
}
test('R50 (AA1-36): no basis entered -- an early Roth IRA draw is all earnings: income and the 10%, grossed up (was untaxed)', () => {
  // Basis 0, so every dollar is earnings E. Spending 20,000 plus a funding draw x: E = 20,000 + x; tax = 10% x (E - 16,100)
  // + 2.5% x (E - 16,100) + 10% x E = 0.225E - 2,012.50 (E - 16,100 stays inside the 10% band). x = 0.225(20,000 + x) - 2,012.50
  // -> 0.775x = 2,487.50 -> x = 3,209.68. The Roth ends at 100,000 - 23,209.68 = 76,790.32.
  const r = run(early());
  assert.equal(cents(at(r, 51).taxes), 3209.68);
  assert.equal(cents(at(r, 51).roth), 76790.32);
  const d = issues(r, 'ROTH_IRA_BASIS_NOT_ENTERED');
  assert.equal(d.length, 1, 'the absent basis is disclosed, once');
  assert.equal(d[0].severity, 'WARNING');
});
test('R50 (AA1-36): an entered basis comes out first and free; the next year\'s draw passes it into earnings', () => {
  // Basis 30,000. Year 1: 20,000 of basis, no tax, Roth 80,000. Year 2: 10,000 of basis, 10,000 of earnings, and a funding draw x
  // of earnings: E = 10,000 + x is below the 16,100 deduction, so only the 10%: x = 0.1(10,000 + x) -> x = 1,111.11. The Roth ends
  // at 80,000 - 21,111.11 = 58,888.89.
  const r = run(early({ basis: 30000, endAge: 52 }));
  assert.equal(at(r, 51).taxes, 0);
  assert.equal(cents(at(r, 51).roth), 80000);
  assert.equal(cents(at(r, 52).taxes), 1111.11);
  assert.equal(cents(at(r, 52).roth), 58888.89);
  assert.equal(issues(r, 'ROTH_IRA_BASIS_NOT_ENTERED').length, 0, 'a basis was entered');
});
test('R50 (AA1-36) control: a draw inside the entered basis is untaxed', () => {
  const r = run(early({ basis: 30000 }));
  assert.equal(at(r, 51).taxes, 0);
  assert.equal(cents(at(r, 51).roth), 80000);
});

// ------------------------------------------------------------------------------------------------- AA1-36: the five-year period
function sixty(o = {}) {
  const p = L.basePlan({ age: 60, endAge: 61, spending: o.spending ?? 20000, manualOrder: 'roth,taxable,preTax,hsa',
    accounts: [roth(100000, o.basis === undefined ? {} : { contributionBasis: o.basis })] });
  if (o.first !== undefined) p.profile.rothFirstContributionYear = o.first;
  return p;
}
test('R50 (AA1-36) control: at 60 with a Roth IRA held at the start, the draw is qualified and untaxed', () => {
  const r = run(sixty());
  assert.equal(at(r, 61).taxes, 0);
  assert.equal(cents(at(r, 61).roth), 80000);
});
test('R50 (AA1-36): that qualification rests on the five-year period taken as met -- disclosed (was silent)', () => {
  const d = issues(run(sixty()), 'ROTH_FIVE_YEAR_ASSUMED');
  assert.equal(d.length, 1);
  assert.equal(d[0].severity, 'WARNING');
});
test('R50 (AA1-36): first Roth IRA contribution in 2024 -- at 60 in 2026 the period has not run: earnings are income, no 10%', () => {
  // 2026 is inside 2024-2028, so not qualified. Basis 10,000 free; the rest of the 40,000 and the funding draw x are earnings:
  // E = 30,000 + x, past 59 1/2 so no 10%. Federal 1,240 + 12% x (E - 28,500); Arizona 2.5% x (E - 16,100): tax = 0.145E - 2,582.50.
  // x = 0.145(30,000 + x) - 2,582.50 -> 0.855x = 1,767.50 -> x = 2,067.25. The Roth ends at 100,000 - 42,067.25 = 57,932.75.
  const r = run(sixty({ spending: 40000, basis: 10000, first: 2024 }));
  assert.equal(cents(at(r, 61).taxes), 2067.25);
  assert.equal(cents(at(r, 61).roth), 57932.75);
  assert.equal(issues(r, 'ROTH_FIVE_YEAR_ASSUMED').length, 0, 'entered, not assumed');
});
test('R50 (AA1-36) control: first contribution in 2021 -- the period ran out by 2026, so the same draw is qualified', () => {
  const r = run(sixty({ spending: 40000, basis: 10000, first: 2021 }));
  assert.equal(at(r, 61).taxes, 0);
  assert.equal(cents(at(r, 61).roth), 60000);
});

// --------------------------------------------------------------------------------------------- AA1-36: conversions by tax year
function converter(age, o = {}) {
  const p = L.basePlan({ age, endAge: age + 1, spending: 20000, manualOrder: 'roth,preTax,taxable,hsa', accounts: [ira(100000), roth(0)] });
  Object.assign(p.advanced, { conversionOn: true, conversionAmount: 30000 });
  return p;
}
test('R50 (AA1-36): a conversion drawn in its own year at 50 bears the 10% on its taxable amount, and is not income again', () => {
  // 30,000 converted (income): federal 1,240 + 12% x 1,500 = 1,420; Arizona 2.5% x 13,900 = 347.50. Spending 20,000 from the
  // Roth comes out of that conversion, inside five years: 10% = 2,000. Funding x from the rest of the conversion, also 10%:
  // x = 3,767.50 + 0.1x -> x = 4,186.11. The Roth ends at 30,000 - 24,186.11 = 5,813.89; the IRA at 70,000.
  const r = run(converter(50));
  assert.equal(cents(at(r, 51).taxes), 4186.11);
  assert.equal(cents(at(r, 51).roth), 5813.89);
  assert.equal(cents(at(r, 51).preTax), 70000);
});
test('R50 (AA1-36) control: the same at 60 -- the period has not run, but past 59 1/2 a conversion dollar bears nothing', () => {
  // Only the conversion's own tax, 1,767.50, funded from the Roth: 30,000 - 21,767.50 = 8,232.50.
  const r = run(converter(60));
  assert.equal(cents(at(r, 61).taxes), 1767.5);
  assert.equal(cents(at(r, 61).roth), 8232.5);
  assert.equal(issues(r, 'ROTH_FIVE_YEAR_ASSUMED').length, 0, 'the period starts with the in-plan conversion; nothing is assumed');
});
function oldConversion(expenseAge) {
  // Age 50: the whole 30,000 IRA is converted in plan year 0, its 1,767.50 of tax paid from cash. A 20,000 expense later.
  const p = L.basePlan({ age: 50, endAge: 56, spending: 0, manualOrder: 'taxable,roth,preTax,hsa', accounts: [cash(1767.5), ira(30000), roth(0)],
    expenses: [{ name: 'Roof', kind: 'expense', age: expenseAge, amount: 20000 }] });
  Object.assign(p.advanced, { conversionOn: true, conversionAmount: 30000 });
  return p;
}
test('R50 (AA1-36): a 2026 conversion drawn at 54 (2030, inside its five years) bears the 10%', () => {
  // 20,000 of the conversion, 10% = 2,000, funded from the conversion too: x = 2,000 + 0.1x -> x = 2,222.22.
  // The Roth ends at 30,000 - 22,222.22 = 7,777.78.
  const r = run(oldConversion(54));
  assert.equal(cents(at(r, 55).taxes), 2222.22);
  assert.equal(cents(at(r, 55).roth), 7777.78);
});
test('R50 (AA1-36) control: drawn at 55 (2031), the conversion is past its five years -- free', () => {
  const r = run(oldConversion(55));
  assert.equal(at(r, 56).taxes, 0);
  assert.equal(cents(at(r, 56).roth), 10000);
});

// ----------------------------------------------------------------------------------------- AA1-36: contributions in the plan
function contributor(spend) {
  const p = L.basePlan({ age: 50, retireAge: 51, endAge: 52, salary: 50000, spending: spend, manualOrder: 'roth,taxable,preTax,hsa',
    accounts: [roth(10000, { contribution: 7000, contributionMode: 'dollar' })] });
  p.employment.contributionStop = 51;
  return p;
}
test('R50 (AA1-36): a regular contribution made in the plan is basis -- an 8,000 draw is 7,000 free and 1,000 of earnings', () => {
  // Year 1: 7,000 contributed (basis 7,000; opening basis 0). Year 2: 7,000 of basis, 1,000 of earnings and the funding draw x:
  // E = 1,000 + x below the deduction, so only the 10%: x = 0.1(1,000 + x) -> x = 111.11. Roth: 17,000 - 8,111.11 = 8,888.89.
  const r = run(contributor(8000));
  assert.equal(cents(at(r, 52).taxes), 111.11);
  assert.equal(cents(at(r, 52).roth), 8888.89);
});
test('R50 (AA1-36) control: a 7,000 draw is the contribution itself -- untaxed', () => {
  const r = run(contributor(7000));
  assert.equal(at(r, 52).taxes, 0);
  assert.equal(cents(at(r, 52).roth), 10000);
});

// -------------------------------------------------------------------------------------------- AA1-36: succession at a death
function widow(basis) {
  const p = L.basePlan({ couple: true, age: 50, spouseAge: 52, endAge: 52, spending: 20000, manualOrder: 'roth,taxable,preTax,hsa',
    accounts: [roth(50000, { contributionBasis: basis })] });
  p.retirement.selfLife = 51;
  return p;
}
test('R50 (AA1-36): the surviving spouse takes over the decedent\'s basis -- the rest of it is free, then earnings', () => {
  // Year 1 (joint): 20,000 of the self's 25,000 basis. The self dies at 51; the spouse (53) treats the IRA as their own. Year 2 is
  // the year of the death, still a joint return ($32,200 deduction): 5,000 of basis, 15,000 of earnings and the funding draw x:
  // E = 15,000 + x stays under the deduction, so only the 10%: x = 0.1(15,000 + x) -> x = 1,666.67. Roth: 50,000 - 41,666.67 =
  // 8,333.33. (Without the basis passing, E = 20,000 + x and x = 2,222.22.)
  // S5AA R50 build, miss SA50-A: the first derivation filed year 2 single ($1,758.06, $8,241.94); the death year is joint (the
  // engine's F-02 convention, and IRC 6013(a)(2) allows the joint return for the year of death). Corrected and recorded.
  const r = run(widow(25000));
  assert.equal(at(r, 51).taxes, 0);
  assert.equal(cents(at(r, 52).taxes), 1666.67);
  assert.equal(cents(at(r, 52).roth), 8333.33);
});
test('R50 (AA1-36) control: a basis covering both years leaves both untaxed', () => {
  const r = run(widow(50000));
  assert.equal(at(r, 52).taxes, 0);
  assert.equal(cents(at(r, 52).roth), 10000);
});

// ------------------------------------------------------------------------------------------- AA1-36: a transfer out of a Roth IRA
function transferOut(basis) {
  const p = L.basePlan({ age: 45, endAge: 46, spending: 0, manualOrder: 'taxable,roth,preTax,hsa',
    accounts: [cash(0), roth(100000, basis === undefined ? { priority: 2 } : { priority: 2, contributionBasis: basis })] });
  Object.assign(p.advanced, { transferOn: true, transferFrom: 'roth', transferTo: 'cash', transferAmount: 10000, transferAge: 45 });
  return p;
}
test('R50 (AA1-36): 10,000 moved from a Roth IRA to cash at 45 is a distribution -- earnings, so the 10% (was untaxed)', () => {
  // E = 10,000 below the deduction: no income tax; 10% = 1,000, paid from the cash. Cash 9,000, Roth 90,000.
  const r = run(transferOut());
  assert.equal(cents(at(r, 46).taxes), 1000);
  assert.equal(cents(at(r, 46).taxable), 9000);
  assert.equal(cents(at(r, 46).roth), 90000);
});
test('R50 (AA1-36) control: the same transfer out of 10,000 of basis is free', () => {
  const r = run(transferOut(10000));
  assert.equal(at(r, 46).taxes, 0);
  assert.equal(cents(at(r, 46).taxable), 10000);
});

// --------------------------------------------------------------------------------------- AA1-36: the optimizer reads the ledger
function optimized(basis) {
  const p = L.basePlan({ age: 50, endAge: 51, spending: 20000, order: 'optimized',
    accounts: [roth(100000, basis === undefined ? {} : { contributionBasis: basis }), ira(100000)] });
  p.retirement.optimizationGoal = 'balanced';
  p.retirement.preserveRoth = false;
  return p;
}
test('R50 (AA1-36): with every Roth IRA dollar taxable and penalized at 50, the optimizer draws the IRA first (was the Roth)', () => {
  // The IRA: 20,000 plus x, income and 10% alike: x = 3,209.68 as above. IRA 76,790.32; the Roth untouched.
  const r = run(optimized());
  assert.equal(cents(at(r, 51).roth), 100000);
  assert.equal(cents(at(r, 51).preTax), 76790.32);
  assert.equal(cents(at(r, 51).taxes), 3209.68);
});
test('R50 (AA1-36) control: with the whole Roth IRA basis, the optimizer draws it first, free', () => {
  const r = run(optimized(100000));
  assert.equal(cents(at(r, 51).roth), 80000);
  assert.equal(at(r, 51).taxes, 0);
});

// -------------------------------------------------------------------------------------------- AA1-36: what stays unsupported
test('R50 (AA1-36): a Roth IRA drawn at 50 is modelled now -- no longer outside the supported domain', () => {
  assert.equal(issues(run(early()), 'UNSUPPORTED_ROTH_ORDERING').length, 0);
});
test('R50 (AA1-36): a Roth 401(k) drawn at 50 is left as before (untaxed; its figures are the control) and stays flagged, the text now naming it', () => {
  const p = L.basePlan({ age: 50, endAge: 51, spending: 20000, manualOrder: 'roth,taxable,preTax,hsa', accounts: [L.account('r401', 'roth401k', 100000)] });
  const r = run(p);
  assert.equal(at(r, 51).taxes, 0);
  assert.equal(cents(at(r, 51).roth), 80000);
  const f = issues(r, 'UNSUPPORTED_ROTH_ORDERING');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /Roth 401\(k\)/);
});

// ------------------------------------------------------------------------------------------- AA1-31: income earlier this year
function halfYear(o = {}) {
  const p = L.basePlan({ age: o.age ?? 60.5, endAge: 62, spending: o.spending ?? 0, pension: o.pension ?? 0, manualOrder: 'taxable,preTax,roth,hsa',
    accounts: o.accounts ?? [cash(100000)] });
  if (o.prior !== undefined) p.profile.priorIncomeThisYear = o.prior;
  return p;
}
test('R50 (AA1-31): $30,000 earned before a half-year first row -- the row is taxed as the rest of a $60,000 year (was 1,767.50)', () => {
  // The row holds 30,000 of a $60,000 pension. tax(60,000): federal on 43,900 = 1,240 + 12% x 31,500 = 5,020; Arizona 2.5% x 43,900
  // = 1,097.50; 6,117.50. tax(30,000): 1,420 + 347.50 = 1,767.50. The row: 6,117.50 - 1,767.50 = 4,350.00.
  const r = run(halfYear({ pension: 60000, prior: 30000 }));
  assert.equal(cents(at(r, 61).taxes), 4350);
});
test('R50 (AA1-31) control: not entered -- the disclosed convention stands, 1,767.50', () => {
  assert.equal(cents(at(run(halfYear({ pension: 60000 })), 61).taxes), 1767.5);
});
test('R50 (AA1-31) control: a whole first row ignores it -- 6,117.50, and the second row is untouched', () => {
  const r = run(halfYear({ age: 60, pension: 60000, prior: 30000 }));
  assert.equal(cents(at(r, 61).taxes), 6117.5);
  const h = run(halfYear({ pension: 60000, prior: 30000 }));
  assert.equal(cents(at(h, 62).taxes), 6117.5, 'the second row is a whole year of its own');
});
test('R50 (AA1-31): the funding draw is solved against the whole year -- an IRA draw at 12% + 2.5% (was untaxed)', () => {
  // Half a year of $20,000 spending is 10,000 from the IRA, with $40,000 earned before: taxable income 23,900 already, so every
  // dollar drawn (to 50,400) is at 12% + 2.5% = 14.5%: x = 0.145(10,000 + x) -> x = 1,695.91. IRA: 1,000,000 - 11,695.91.
  // Not entered, 10,000 sits under the deduction: no tax.
  const r = run(halfYear({ spending: 20000, prior: 40000, accounts: [ira(1000000)] }));
  assert.equal(cents(at(r, 61).taxes), 1695.91);
  assert.equal(cents(at(r, 61).preTax), 988304.09);
});

// ------------------------------------------------------------------------------------------------------------- the inputs
test('R50: the new values are numbers in range -- text or a negative is refused by the validator and the engine', () => {
  const cases = [
    [(p, v) => { p.profile.priorIncomeThisYear = v; }, ['30000', -1]],
    [(p, v) => { p.profile.rothFirstContributionYear = v; }, ['2020', 1990]],
    [(p, v) => { p.profile.spouseRothFirstContributionYear = v; }, ['2020', 2201]],
    [(p, v) => { p.accounts[0].contributionBasis = v; }, ['5000', -1]],
  ];
  for (const [set, bads] of cases) {
    for (const bad of bads) {
      const p = early();
      set(p, bad);
      assert.equal(validateScenario(structuredClone(p)).valid, false, JSON.stringify(bad));
      const r = engine.runPlan(structuredClone(p));
      assert.equal(r.calculationErrorCode, typeof bad === 'number' ? 'SCENARIO_PLAN_VALUE_OUT_OF_RANGE' : 'SCENARIO_NONNUMBER_PLAN_VALUE', JSON.stringify(bad));
    }
  }
});
