/* S5AA R9 round, the owner's decision 6 (2026-09-21): HEALTH COSTS ARE CHOSEN PER PERSON, NOT BY THE SELF'S AGE.
 *
 * The branch was `if (age < 65) pre-Medicare cost else Medicare`, on the SELF's age alone (finding N2 of the R6 round):
 *   - a self under 65 with a spouse over 65 priced the whole household at the pre-Medicare cost, and nobody on Medicare;
 *   - a self over 65 with a spouse under 65 priced Medicare for the self and NOTHING for the spouse's coverage;
 *   - a dead self under 65 left a Medicare-age survivor on the pre-Medicare cost.
 *
 * Now each living person is priced on their own age, read from householdSeniorAges() -- the tax layer's and EA-02's own
 * answer to who is alive at the row's opening. The entered "Annual pre-Medicare healthcare cost" is the household's cost
 * for the people the plan models, so each living person under 65 carries an equal share of it (the whole of it for a
 * household of one, half for a couple); each living person 65 or older is charged Medicare (Part B with IRMAA, and the
 * deductible), as EA-02 made it. A household of one is unchanged, and so is a couple on the same side of 65.
 * Rows are labelled by the age at which they END. Tested through runPlan only.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const PRE = 12000;
/* One person's Medicare cost for a year at the lowest IRMAA tier (MAGI is zero here): 12 months of the standard Part B
   premium plus the deductible. Read from the same rules the engine reads. */
const MEDICARE_ONE = RULES.medicare.partB.standardMonthly * 12 + RULES.medicare.partB.annualDeductible;

function run({ age, spouseAge = null, selfLife = 100, spouseLife = 100, endAge }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  const spouse = spouseAge !== null;
  Object.assign(p.profile, { age, retireAge: 50, endAge: endAge || age + 1, spouseOn: spouse, spouseAge: spouse ? spouseAge : age, filing: spouse ? 'mfj' : 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    stages: [], expenses: [], otherIncomes: [], survivor: false, selfLife, spouseLife });
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, qcd: 0, debts: [], otherAssets: [],
    healthOn: true, healthCost: PRE, healthInflation: 0, ltcOn: false });
  p.accounts = [{ id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 1000000, basisPct: 100, contribution: 0, priority: 1 }];
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
/* With spending, taxes and returns at zero and full-basis cash, a row's requested spending is its health cost. */
const health = (r, label) => Number(r.rows.find((x) => x.age === label).spending);
const near = (a, e, what) => assert.ok(Math.abs(a - e) < 0.01, what + ': got ' + a + ', expected ' + e);

test('decision 6: a self under 65 with a spouse over 65 -- the self\'s share of the pre-Medicare cost, and Medicare for the spouse', () => {
  near(health(run({ age: 63, spouseAge: 67 }), 64), PRE / 2 + MEDICARE_ONE, 'was the whole $12,000 and no Medicare');
});

test('decision 6: a self over 65 with a spouse under 65 -- Medicare for the self, and the spouse\'s share of the pre-Medicare cost', () => {
  near(health(run({ age: 67, spouseAge: 63 }), 68), MEDICARE_ONE + PRE / 2, 'the spouse\'s coverage was not costed at all');
});

test('decision 6: a self who died under 65 leaves a Medicare-age survivor priced on Medicare', () => {
  /* Self 63 dies at 63 (dead from the row opening at 64); spouse 66. */
  near(health(run({ age: 64, spouseAge: 67, selfLife: 63 }), 65), MEDICARE_ONE, 'the survivor alone, on Medicare');
});

test('decision 6: a survivor under 65 carries their own share of the pre-Medicare cost', () => {
  near(health(run({ age: 60, spouseAge: 60, spouseLife: 59 }), 61), PRE / 2, 'one of the two people the cost was entered for');
});

test('decision 6 controls: unchanged for a household of one, and for a couple on the same side of 65', () => {
  near(health(run({ age: 60 }), 61), PRE, 'one person under 65: the whole entered cost');
  near(health(run({ age: 70 }), 71), MEDICARE_ONE, 'one person over 65: Medicare');
  near(health(run({ age: 60, spouseAge: 62 }), 61), PRE, 'a couple under 65: the whole entered cost');
  near(health(run({ age: 70, spouseAge: 68 }), 71), 2 * MEDICARE_ONE, 'a couple over 65: Medicare for two');
});
