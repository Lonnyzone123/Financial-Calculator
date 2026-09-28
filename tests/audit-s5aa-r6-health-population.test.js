/* S5AA R6 external audit, EA-02: Medicare costs counted a spouse who had died.
 *
 * The row's Medicare population read `1 + (spouseOn && spouseAge >= 65 ? 1 : 0)` -- the household's
 * CONFIGURATION, not who is alive in the row. The filing threshold beside it already asked
 * householdFilingFor(), so the same row priced IRMAA on the single thresholds and then charged it
 * twice. MEASURED at 5c985c0 (the auditor's repro, reproduced): a 66-year-old couple with $0 income,
 * the spouse dying at 70, paid $5,435.60 a year in every row after the death -- exactly what the
 * living couple pays, and twice the $2,717.80 one person pays.
 *
 * The population is now householdSeniorAges() -- the ONE row-time answer to "whose age-65 amounts
 * does this row count", already used by the tax layer -- so the health layer and the tax layer can
 * no longer disagree about who is alive. Its conventions come with it:
 *   - a person is counted for a row if they were alive at its OPENING, so the year of death still
 *     counts the decedent (the same row F-02 files jointly);
 *   - a household of ONE is returned exactly as entered, because F-02 deliberately leaves the rows past
 *     a lone person's death as they were (EA-01 now marks those rows outside the supported domain).
 *
 * Rows are labelled by the age at which they END: the row labelled 71 is the year opening at 70.
 * Tested through runPlan only.
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
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

function run(over) {
  over = over || {};
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 66, spouseAge: 66, retireAge: 65, endAge: 76, spouseOn: true, filing: 'mfj' }, over.profile);
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 95, spouseLife: 95,
  }, over.retirement);
  Object.assign(p.advanced, {
    rmdOn: false, transferOn: false, conversionOn: false, healthOn: true, healthCost: 12000, healthInflation: 0,
    qcd: 0, debts: [], otherAssets: [],
  });
  p.accounts = [{ id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 500000,
    basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0,
    matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
/* Spending is set to $0, so a row's spending IS its health cost. */
const health = (r, label) => Number(r.rows.find((x) => x.age === label).spending);
const ONE = () => health(run({ profile: { spouseOn: false, filing: 'single' } }), 73);
const TWO = () => health(run(), 73);

test('EA-02: a spouse who has died is no longer charged Medicare costs', () => {
  const one = ONE(), two = TWO();
  assert.equal(two.toFixed(2), (2 * one).toFixed(2), 'CONTROL: two living people cost twice one');
  const r = run({ retirement: { spouseLife: 70 } });
  for (const label of [72, 73, 76]) {
    assert.equal(health(r, label).toFixed(2), one.toFixed(2),
      'row ' + label + ': the survivor alone, not the $' + two.toFixed(2) + ' of a living couple');
  }
});

test('EA-02: the self dying leaves the surviving spouse counted as one person', () => {
  const r = run({ retirement: { selfLife: 70 } });
  assert.equal(health(r, 73).toFixed(2), ONE().toFixed(2));
});

test('EA-02: the year of death still counts the decedent -- the row-opening convention F-02 uses', () => {
  /* The row labelled 71 opens at 70, the age of death: the spouse was alive at its opening, which is
     the same reading that files that row jointly. Health and tax must not disagree about it. */
  const r = run({ retirement: { spouseLife: 70 } });
  assert.equal(health(r, 71).toFixed(2), TWO().toFixed(2), 'the year of death: both counted');
  assert.equal(health(r, 72).toFixed(2), ONE().toFixed(2), 'the year after: one');
});

test('EA-02: a modelled spouse under 65 is not counted, alive or dead -- nothing is double-counted', () => {
  /* S5AA R9 round, the owner's decision 6 (2026-09-21): RE-FIXTURED, claim unchanged. The living 63-year-old spouse was costed at
     nothing, which is the gap decision 6 closes (finding N2 of the R6 round): each living person under 65 now carries
     their share of the entered $12,000 pre-Medicare cost, here half. What this test exists for still holds: the spouse
     under 65 is not charged MEDICARE, alive or dead, so nothing is counted twice. */
  const young = run({ profile: { spouseAge: 60 } });
  const youngDead = run({ profile: { spouseAge: 60 }, retirement: { spouseLife: 62 } });
  assert.equal(health(young, 70).toFixed(2), (ONE() + 12000 / 2).toFixed(2), 'CONTROL: under 65, not on Medicare -- their share of the pre-Medicare cost instead');
  assert.equal(health(youngDead, 70).toFixed(2), ONE().toFixed(2), 'dead: neither');
});

/* S5AA R9 round, the owner's decision 8 (2026-09-21): INVERTED where they read rows after the last death. The projection now
   stops at the last death, so "nobody after both have died" is no row at all, and a lone person's rows end with them. */
test('EA-02, with decision 8: when nobody in a couple survives, nobody is charged -- there is no row to charge', () => {
  const r = run({ retirement: { selfLife: 70, spouseLife: 72 } });
  assert.equal(health(r, 73).toFixed(2), ONE().toFixed(2), 'the spouse alone after the self dies, in the year of the spouse\'s death');
  assert.equal(r.rows[r.rows.length - 1].age, 73, 'and no row after both have died');
});

test('EA-02 control, with decision 8: a household of one is charged while alive, and its projection ends with it', () => {
  const lone = run({ profile: { spouseOn: false, filing: 'single' }, retirement: { selfLife: 70 } });
  assert.equal(health(lone, 71).toFixed(2), ONE().toFixed(2), 'the year of the death: one person on Medicare');
  assert.equal(lone.rows[lone.rows.length - 1].age, 71, 'the rows past a lone death, once outside the domain, are not projected');
});

test('EA-02 control: a living couple does not move', () => {
  assert.equal(TWO().toFixed(2), '5435.60', 'the auditor\'s figure for two living people');
});
