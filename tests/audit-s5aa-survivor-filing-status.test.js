/* S5AA F-02 (Q88): the tax layer asks who is alive.
 *
 * `p.profile.filing` was static for the whole projection -- nothing anywhere changed it -- so a couple
 * filing `mfj` still filed `mfj` in every year after one of them died: joint brackets, the joint
 * standard deduction, joint phaseout thresholds. The senior-deduction age list had no death check
 * either. It read `[age, p.profile.spouseOn ? p.profile.spouseAge + (age - p.profile.age) : -1]`, and
 * `spouseOn` is a PLAN flag, not a SURVIVAL flag, so a deceased spouse kept earning a full senior
 * deduction and, since task 3.1, an additional standard deduction as well.
 *
 * MEASURED AT THE START COMMIT with the fixture below -- two 70-year-olds, $120,000 of spending out of
 * a $4,000,000 pre-tax account, the spouse dying at 75 -- the tax was $12,039.77 in EVERY row, before
 * the death and after it. One person with the same income and the same accounts pays $26,082.43. The
 * survivor was modelled at less than HALF the tax they owe, in the years a real household's tax
 * usually rises sharply. The widow's penalty, with its sign reversed.
 *
 * The rule was checked against its sources before it was written (task 8.6, four checks recorded in
 * the sprint's citation register): a
 * joint return may be made for the taxable year in which the other spouse died (IRC 6013(a)(3)); the
 * qualifying-surviving-spouse status covers the two years AFTER that and requires a dependent child
 * (IRC 2(a)), which the engine has no input for and does not model; without one the survivor files
 * single (Publication 501); the spouse's age-65 additional amount needs an exemption allowable under
 * section 151(b), which ends with the joint return (IRC 63(f)(1)(B)).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

/* Everything is held flat -- no returns, no inflation, no fees, no benefits, no pension -- so the tax
   is the only figure that can move, and it moves only because of who is alive. */
function plan(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 70, retireAge: 70, endAge: 80, spouseOn: true, spouseAge: 70, filing: 'mfj' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 120000, dividendOn: false, pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [],
    selfLife: 95, spouseLife: 75,
  });
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, networthOn: false });
  p.accounts = [{
    id: 'pre', name: 'pre', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 4000000,
    basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  }];
  if (edit) edit(p);
  return p;
}
const run = (edit) => {
  const r = engine.runPlan(plan(edit));
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
};
const taxAt = (r, age) => Number(r.rows.find((row) => row.age === age).taxes);
/* S5AA R48 (AA1-16, the owner's AA1 decision of 2026-10-03): the joint row's tax was $12,039.77. Arizona now subtracts the federal senior
   deduction (A.R.S. 43-1022(35)), 2 x $6,000 on the joint return (MAGI under $150,000): $300 less Arizona tax, and $300 / (1 - 0.12 - 0.025)
   = $350.88 less once the smaller draw is grossed up at the 12% bracket and Arizona's 2.5%: $11,688.89. The single row after a death
   was $26,082.43: at its MAGI of about $146,000 the federal senior deduction is 6,000 - 6% x (146,022.11 - 75,000) = 1,738.67, and
   Arizona subtracts it: 2.5% x 1,738.67 = $43.47 less, grossed up at 24% x 1.06 (the phase-out) + 2.5% = 27.94%: $60.32 less,
   $26,022.11. */
const JOINT_ROW = '11688.89';
const SINGLE_ROW = '26022.11';
/* S5AA R48 x R47, integrated: JOINT_ROW and SINGLE_ROW above are the tax years to 2028, when the federal senior deduction applies
   and Arizona subtracts it (R48). From 2029 there is no federal senior deduction (R47), so nothing for Arizona to subtract, and R47's
   hand-derived figures below hold. */

test('F-02: a surviving spouse is taxed as single from the year after the death, not jointly forever', () => {
  const r = run();
  /* The row reported at age 76 is the one that OPENS at 75, which is the year the spouse dies, and it
     still files jointly -- IRC 6013(a)(3). The row reported at 77 opens at 76 and is the first one
     entirely after the death. */
  /* S5AA R47 (AA1-30; the owner's AA1 decision of 2026-10-03): the senior deduction ends after 2028, so rows 74 on (tax years 2029+)
     have none. Re-derived by hand: MFJ, two 70-year-olds, $120,000 drawn from pre-tax, deduction 32,200 + 2 x 1,650 = 35,500;
     T = 2,480 + 12% (X - 60,300) + 2.5% (X - 32,200 - 4,200), X = 120,000 + T -> 0.855 X = 114,334, T = 13,723.98 (was 12,039.77
     with 2 x $6,000). Single survivor of 70: deduction 18,150; T = 17,966 + 24% (X - 123,850) + 2.5% (X - 18,200) -> 0.735 X =
     107,787, T = 26,648.98 (was 26,082.43 with the phased-out deduction). */
  assert.equal(taxAt(r, 76).toFixed(2), '13723.98', 'the year of the death is still a joint return');
  assert.equal(taxAt(r, 77).toFixed(2), '26648.98', 'and the year after it is a single one');
  assert.ok(taxAt(r, 77) > 1.9 * taxAt(r, 76),
    'the survivor pays nearly double (S5AA R47: 1.94 times since the senior deduction ended; it was more than double), which is the size of the defect: the joint figure was charged in every row');
});

test('F-02: the survivor pays exactly what one person with the same income and accounts pays', () => {
  /* The sharpest statement of the repair, and it needs no hand-computed figure: a widowed household and
     a household that was one person all along face the same law. */
  const widowed = run();
  const single = run((p) => { p.profile.spouseOn = false; p.profile.filing = 'single'; });
  for (const age of [77, 78, 79, 80]) {
    assert.equal(taxAt(widowed, age).toFixed(2), taxAt(single, age).toFixed(2), 'at age ' + age);
  }
});

test('F-02: a household where nobody dies inside the horizon does not move by a cent', () => {
  /* The control that bounds the repair. If this moved, the change would be taxing living couples
     differently, which is not what it claims to do. */
  const alive = run((p) => { p.retirement.spouseLife = 99; p.retirement.selfLife = 99; });
  /* S5AA R47 (AA1-30): flat within each law -- 12,039.77 through tax year 2028 (rows 71-73), 13,723.98 from 2029 (re-derived in the
     first test). */
  for (const row of alive.rows.slice(1)) {
    assert.equal(Number(row.taxes).toFixed(2), row.age <= 73 ? JOINT_ROW : '13723.98', 'at age ' + row.age);
  }
});

test('F-02: the SELF dying widows the household the same way the spouse dying does', () => {
  /* The defect was symmetric and so is the repair. Rows run on the self\'s clock and continue past the
     self\'s death; the surviving spouse is a single filer from the following year. */
  const r = run((p) => { p.retirement.selfLife = 75; p.retirement.spouseLife = 95; });
  /* S5AA R47 (AA1-30; the owner's AA1 decision of 2026-10-03): the senior deduction ends after 2028, so rows 74 on (tax years 2029+)
     have none. Re-derived by hand: MFJ, two 70-year-olds, $120,000 drawn from pre-tax, deduction 32,200 + 2 x 1,650 = 35,500;
     T = 2,480 + 12% (X - 60,300) + 2.5% (X - 32,200 - 4,200), X = 120,000 + T -> 0.855 X = 114,334, T = 13,723.98 (was 12,039.77
     with 2 x $6,000). Single survivor of 70: deduction 18,150; T = 17,966 + 24% (X - 123,850) + 2.5% (X - 18,200) -> 0.735 X =
     107,787, T = 26,648.98 (was 26,082.43 with the phased-out deduction). */
  assert.equal(taxAt(r, 76).toFixed(2), '13723.98', 'the year of the death is still a joint return');
  assert.equal(taxAt(r, 77).toFixed(2), '26648.98', 'and the year after it is a single one');
});

test('F-02: a deceased spouse stops counting toward the age-65 amounts', () => {
  /* Read directly, because the row-level figures above fold this together with the brackets. Both are
     76 in the projection; after the death only one person is counted. */
  const p = plan();
  assert.deepEqual(engine.householdSeniorAges(p, 74), [74, 74], 'both alive');
  assert.deepEqual(engine.householdSeniorAges(p, 75), [75, 75], 'the year of the death still counts the spouse');
  assert.deepEqual(engine.householdSeniorAges(p, 76), [76, -1], 'the year after does not');
  assert.equal(engine.householdFilingFor(p, 75), 'mfj', 'IRC 6013(a)(3): the year of the death');
  assert.equal(engine.householdFilingFor(p, 76), 'single', 'Publication 501: single from the following year');
});

test('F-02: the entered filing status is never rewritten, only the status the row is taxed under', () => {
  /* The plan is the household\'s own record of what it entered. Rewriting `profile.filing` in place
     would make a saved scenario disagree with what was typed into it. */
  const p = plan();
  engine.runPlan(p);
  assert.equal(p.profile.filing, 'mfj', 'the plan still says what the household entered');
  assert.equal(p.profile.spouseOn, true);
});

test('F-02: a household that never filed jointly is untouched by the transition', () => {
  const p = plan((x) => { x.profile.filing = 'single'; });
  for (const age of [70, 75, 76, 79]) {
    assert.equal(engine.householdFilingFor(p, age), 'single', 'at age ' + age);
  }
  const hoh = plan((x) => { x.profile.filing = 'hoh'; });
  assert.equal(engine.householdFilingFor(hoh, 79), 'hoh', 'head of household is not converted either');
});

test('F-02: the household is told what the transition models AND what it does not', () => {
  /* A filing-status transition is a modelling choice, and the part left out runs the OTHER way:
     qualifying-surviving-spouse status would keep the joint brackets for two more years, so a
     household with a dependent child is modelled as paying too MUCH. That is exactly the kind of
     thing a reader will not assume, so it is said. */
  const r = run();
  const issue = (r.issues || []).find((i) => i.code === 'SURVIVOR_FILING_STATUS_MODELLED');
  assert.ok(issue, 'the disclosure is raised');
  assert.equal(issue.severity, 'WARNING');
  assert.equal(issue.state.entered, 'mfj');
  assert.equal(issue.state.taxedAsAfterDeath, 'single');
  assert.equal(issue.state.approximation, true);
  assert.deepEqual(issue.state.deaths, [{ who: 'spouse', atSelfAge: 75 }]);
  /* RE-DERIVED at the fourth internal audit (A4-4): since EA-03 the Roth IRA limit follows the transition, so
     "contribution room" narrowed to the one limit that still reads the entered status. */
  for (const missing of ['qualifying surviving spouse', 'head of household', 'remarriage', 'the HSA family limit after the death']) {
    assert.ok(issue.state.notModelled.includes(missing), 'names ' + missing);
  }
  assert.ok(/TOO HIGH/.test(issue.message), 'and says which way the unmodelled status would move the tax');
});

test('F-02: the disclosure is raised only where a death actually falls inside the horizon', () => {
  const alive = run((p) => { p.retirement.spouseLife = 99; p.retirement.selfLife = 99; });
  assert.equal((alive.issues || []).filter((i) => i.code === 'SURVIVOR_FILING_STATUS_MODELLED').length, 0,
    'a household that never widows is not told about a transition that never happens to it');
  const solo = run((p) => { p.profile.spouseOn = false; p.profile.filing = 'single'; });
  assert.equal((solo.issues || []).filter((i) => i.code === 'SURVIVOR_FILING_STATUS_MODELLED').length, 0,
    'nor is a household with no spouse to lose');
});

test('F-02: the Arizona age-65 exemption counts the same people the federal amounts count', () => {
  /* THE AFFINE MIRROR CAUGHT THIS, and it is why the repair is bigger than one expression.
     estimateTaxes() held a SECOND age-65 count, inline, rebuilt from `spouseOn` -- while
     taxSegmentLocal() has always counted `ctx.seniorAges`. The two agreed only because the array was
     built the same way. Giving the array a death check and leaving the inline count alone made the
     estimator and its own mirror differ by the Arizona exemption times the Arizona rate, $2,100 x 2.5%
     = $52.50, and EVERY widowed row came back QUOTE_SETTLEMENT_UNVERIFIED.

     Measured on the Arizona figure alone: a widowed household and a household that was one person all
     along must agree exactly. Their federal figures agree too -- the test above says so on the whole
     tax -- but Arizona is where the second count lived, so it is asserted on its own here. */
  const widowed = plan();
  const solo = plan((x) => { x.profile.spouseOn = false; x.profile.filing = 'single'; });
  assert.deepEqual(engine.householdSeniorAges(widowed, 74), [74, 74], 'CONTROL: two people at 74');
  assert.deepEqual(engine.householdSeniorAges(widowed, 76), [76, -1], 'CONTROL: one at 76');
  for (const income of [80000, 146082.43, 300000]) {
    const a = engine.estimateTaxes(widowed, 76, income, 0, 0, 0, 0, 0, 0, 0, 0);
    const b = engine.estimateTaxes(solo, 76, income, 0, 0, 0, 0, 0, 0, 0, 0);
    assert.equal(a.az.toFixed(4), b.az.toFixed(4), 'Arizona at ' + income);
    assert.equal(a.total.toFixed(4), b.total.toFixed(4), 'and the whole tax at ' + income);
  }
  /* And the household the mirror disagreed about now returns a result at all, which is the public
     symptom the $52.50 produced. */
  const r = run();
  assert.equal(r.status, 'ok');
  assert.notEqual(r.calculationErrorCode, 'QUOTE_SETTLEMENT_UNVERIFIED');
});

test("F-02: the quote prices a penalty at the ROW's age, not at whatever sits in seniorAges[0]", () => {
  /* The second thing the repair had to fix, and it only appears when the SELF dies. Three places read
     `taxCtx.seniorAges[0]` as "this row's age": the obligation recompute, the early-withdrawal penalty
     rate and the HSA additional-tax rate. That slot is -1 once the self has died, so the quote priced
     the penalty at AGE MINUS ONE -- a flat 10% on every sale -- and every row after a self death came
     back TAX_SETTLEMENT_MISMATCH with a surplus of exactly a tenth of the gross. */
  const p = plan((x) => { x.retirement.selfLife = 75; x.retirement.spouseLife = 95; });
  assert.deepEqual(engine.householdSeniorAges(p, 76), [-1, 76], 'the self is gone; the slot is -1');
  assert.equal(engine.quoteRowAge({ rowAge: 76, seniorAges: [-1, 76] }), 76, 'the row age is carried, not inferred');
  assert.equal(engine.quoteRowAge({ seniorAges: [76, -1] }), 76, 'and a context without the field still works');
  assert.equal(engine.earlyWithdrawalPenaltyRate(p, 76, p.accounts[0]), 0, 'a 76-year-old pays no penalty');
  assert.ok(engine.earlyWithdrawalPenaltyRate(p, -1, p.accounts[0]) > 0, 'CONTROL: age -1 would have');
  const r = run((x) => { x.retirement.selfLife = 75; x.retirement.spouseLife = 95; });
  assert.equal(r.status, 'ok');
  assert.notEqual(r.calculationErrorCode, 'TAX_SETTLEMENT_MISMATCH');
});

/* SECOND AUDIT: THE HORIZON'S LAST YEAR. The disclosure was raised for any death "inside the horizon",
   measured as death < endAge. But the year of the death is still joint (IRC 6013(a)(3)), so a death in
   the horizon's LAST year produces no single row at all -- and the household was told that "from the
   following year the survivor is taxed as SINGLE", about a year the projection never reaches. The
   engine's own comment promised the opposite: a household that never widows inside its horizon is not
   told about a transition that never happens to it. */
test('second audit: a death in the last year of the horizon produces no single row, and is not disclosed as one', () => {
  const lastYear = run((p) => { p.retirement.spouseLife = 79; });   // endAge 80: the row reported at 80 opens at 79
  for (let opens = 70; opens <= 79; opens++) {
    assert.equal(engine.householdFilingFor(plan((p) => { p.retirement.spouseLife = 79; }), opens), 'mfj',
      'CONTROL: the row opening at ' + opens + ' is filed jointly -- the last one is the year of the death');
  }
  assert.equal((lastYear.issues || []).filter((i) => i.code === 'SURVIVOR_FILING_STATUS_MODELLED').length, 0,
    'no transition happens inside this horizon, so none is disclosed');

  const yearBefore = run((p) => { p.retirement.spouseLife = 78; });
  assert.equal(engine.householdFilingFor(plan((p) => { p.retirement.spouseLife = 78; }), 79), 'single',
    'CONTROL: one year earlier, the last row IS single');
  assert.equal((yearBefore.issues || []).filter((i) => i.code === 'SURVIVOR_FILING_STATUS_MODELLED').length, 1,
    'and there the disclosure is raised');
});
