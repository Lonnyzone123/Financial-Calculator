/* F-02 (Q88) through the PUBLIC ROUTE -- runPlan() and the rows and issues it reports.
 *
 * `tests/audit-s5aa-survivor-filing-status.test.js` reaches the repair through the engine's own
 * functions, which is what makes it implementation-coupled: it asserts the age list, the status
 * helper and the quote's row age by name. `tools/closeout-check.js` refuses a repair whose ONLY tests
 * are coupled -- one that cannot be seen from outside has not been shown to reach a household.
 *
 * It can be seen from outside, and the figure is not subtle: a survivor was modelled at less than half
 * the tax they owe.
 *
 * Nothing here names an internal function.
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

/* Two 70-year-olds filing jointly, $120,000 a year out of a $4,000,000 pre-tax account, everything
   else held flat -- no returns, no inflation, no fees, no benefits, no pension. The tax is the only
   figure that can move, and it can move only because of who is alive. */
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

test('F-02 public route: a surviving spouse is taxed as single from the year after the death', () => {
  /* The row reported at 76 is the one that OPENS at 75, the year the spouse dies, and it still files
     jointly. The row reported at 77 opens at 76 and is the first entirely after the death. Before the
     repair EVERY row of this plan reported $12,039.77. */
  const r = run();
  /* S5AA R47 (AA1-30; the owner's AA1 decision of 2026-10-03): the senior deduction ends after 2028, so rows 74 on (tax years 2029+)
     have none. Re-derived by hand: MFJ, two 70-year-olds, $120,000 drawn from pre-tax, deduction 32,200 + 2 x 1,650 = 35,500;
     T = 2,480 + 12% (X - 60,300) + 2.5% (X - 32,200 - 4,200), X = 120,000 + T -> 0.855 X = 114,334, T = 13,723.98 (was 12,039.77
     with 2 x $6,000). Single survivor of 70: deduction 18,150; T = 17,966 + 24% (X - 123,850) + 2.5% (X - 18,200) -> 0.735 X =
     107,787, T = 26,648.98 (was 26,082.43 with the phased-out deduction). */
  assert.equal(taxAt(r, 76).toFixed(2), '13723.98', 'the year of the death is still a joint return');
  assert.equal(taxAt(r, 77).toFixed(2), '26648.98', 'and the year after it is a single one');
});

test('F-02 public route: the survivor pays exactly what one person with the same income and accounts pays', () => {
  /* The sharpest form of the claim, and it needs no hand-computed figure: a widowed household and a
     household that was one person all along face the same law. */
  const widowed = run();
  const single = run((p) => { p.profile.spouseOn = false; p.profile.filing = 'single'; });
  for (const age of [77, 78, 79, 80]) {
    assert.equal(taxAt(widowed, age).toFixed(2), taxAt(single, age).toFixed(2), 'at age ' + age);
  }
  assert.ok(taxAt(widowed, 77) > 1.9 * taxAt(widowed, 76),
    'CONTROL: the two are genuinely different -- the survivor pays nearly double what the couple did (S5AA R47: 1.94 times; it was more than double)');
});

test('F-02 public route: the SELF dying widows the household the same way the spouse dying does', () => {
  const r = run((p) => { p.retirement.selfLife = 75; p.retirement.spouseLife = 95; });
  /* S5AA R47 (AA1-30): re-derived figures, see the first test. */
  assert.equal(taxAt(r, 76).toFixed(2), '13723.98', 'the year of the death');
  assert.equal(taxAt(r, 77).toFixed(2), '26648.98', 'the year after');
});

test('F-02 public route: a household where nobody dies inside the horizon does not move by a cent', () => {
  /* The control that bounds the repair. If this moved, the change would be taxing living couples
     differently, which is not what it claims to do. */
  const alive = run((p) => { p.retirement.spouseLife = 99; p.retirement.selfLife = 99; });
  /* S5AA R47 (AA1-30): flat within each law -- 12,039.77 through tax year 2028 (rows 71-73), 13,723.98 from 2029 (re-derived in the
     first test). */
  for (const row of alive.rows.slice(1)) {
    assert.equal(Number(row.taxes).toFixed(2), row.age <= 73 ? JOINT_ROW : '13723.98', 'at age ' + row.age);
  }
});

test('F-02 public route: a ONE-PERSON household is not widowed by its own death', () => {
  /* The scope line, and it is load-bearing. The shipped default plan carries `filing: "mfj"` with
     `spouseOn: false` and a lifespan of 95 against a horizon of 100, so a rule that widowed on any
     death would have moved five locked golden fixtures for a reason this repair does not claim: there
     is no surviving spouse, so there is nobody whose filing status could change. */
  const lone = (life) => run((p) => {
    p.profile.spouseOn = false;          // but filing stays "mfj", as the default plan ships it
    p.retirement.selfLife = life;
  });
  const dies = lone(75);
  const lives = lone(99);
  /* Flat and identical, whether the lone person dies inside the horizon or not. The figure itself is
     not 12,039.77 -- one person counts one age-65 amount where a couple counts two -- so the claim is
     that the death changes NOTHING, which is what the two runs agreeing says. */
  /* S5AA R9 round, the owner's decision 8 (2026-09-21): the lone person's projection now ends with them (the row opening at
     75 is the last), so the comparison runs over the rows that exist. The claim is unchanged: up to and including the
     year of the death, nothing moves. */
  assert.equal(dies.rows[dies.rows.length - 1].age, 76, 'CONTROL: the projection stops at the death');
  assert.deepEqual(dies.rows.map((r) => r.taxes), lives.rows.slice(0, dies.rows.length).map((r) => r.taxes),
    'a lone death moves no row');
  /* S5AA R47 (AA1-30): flat within each law -- the senior deduction ends after 2028 (rows 74 on). */
  for (const part of [dies.rows.slice(1).filter((r) => r.age <= 73), dies.rows.slice(1).filter((r) => r.age > 73)]) {
    const flat = new Set(part.map((r) => Number(r.taxes).toFixed(2)));
    assert.equal(flat.size, 1, 'and every retired row under one law is the same figure: ' + [...flat].join(', '));
  }
});

test('F-02 public route: the household is told what the transition models AND what it does not', () => {
  /* The part left out runs the OTHER way. Qualifying-surviving-spouse status would keep the joint
     brackets for two more years, so a household with a dependent child is modelled as paying too MUCH
     -- which a reader will not assume, and so is said. */
  const r = run();
  const issue = (r.issues || []).find((i) => i.code === 'SURVIVOR_FILING_STATUS_MODELLED');
  assert.ok(issue, 'the disclosure reaches the result');
  assert.equal(issue.severity, 'WARNING');
  assert.equal(issue.state.entered, 'mfj', 'it reports what the household entered');
  assert.equal(issue.state.taxedAsAfterDeath, 'single', 'and what it is taxed as instead');
  assert.equal(issue.state.approximation, true);
  /* RE-DERIVED at the fourth internal audit (A4-4): since EA-03 the Roth IRA limit follows the transition, so
     "contribution room" narrowed to the one limit that still reads the entered status. */
  for (const missing of ['qualifying surviving spouse', 'head of household', 'remarriage', 'the HSA family limit after the death']) {
    assert.ok(issue.state.notModelled.includes(missing), 'names ' + missing + ' as not modelled');
  }
  assert.ok(/TOO HIGH/.test(issue.message), 'and says which way the unmodelled status would move the tax');
});

test('F-02 public route: the disclosure is raised only where a death actually falls inside the horizon', () => {
  const named = (r) => (r.issues || []).filter((i) => i.code === 'SURVIVOR_FILING_STATUS_MODELLED').length;
  assert.equal(named(run((p) => { p.retirement.spouseLife = 99; p.retirement.selfLife = 99; })), 0,
    'a household that never widows is not told about a transition that never happens to it');
  assert.equal(named(run((p) => { p.profile.spouseOn = false; p.profile.filing = 'single'; })), 0,
    'nor is a household with no spouse to lose');
  assert.equal(named(run()), 1, 'CONTROL: and the household that does widow is told, once');
});

test('F-02 public route: the plan a household saved still says what it entered', () => {
  /* Rewriting `profile.filing` in place would make a saved scenario disagree with what was typed into
     it. The status a row is taxed under is derived, never stored. */
  const p = plan();
  engine.runPlan(p);
  assert.equal(p.profile.filing, 'mfj');
  assert.equal(p.profile.spouseOn, true);
});
