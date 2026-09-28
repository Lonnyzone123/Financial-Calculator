/* S5AA R9 round, the owner's decision 7 (2026-09-21): THE SURVIVOR SPENDING REDUCTION USES THE ENGINE'S ONE DEFINITION OF WHO
 * IS ALIVE.
 *
 * strategySpending() applied the survivor reduction from its own reading of death, `(age < selfLife) !== (spouseAge <
 * spouseLife)`: strict, so the row OPENING at a person's lifespan was already a survivor year for spending. Everywhere
 * else the engine reads householdSurvivorship(), where a person is dead only once the lifespan is BELOW the row's opening
 * age -- the row opening at the lifespan is the year of death, filed jointly (F-02), costed for two (EA-02), and paid for
 * two. Finding N3 of the R6 round: one row, three answers to "is the spouse alive".
 *
 * Now the factor reads householdSurvivorship(). A fractional lifespan never landed on the boundary, so only a whole-year
 * lifespan moves, and by exactly one row. Both alive or both dead: no reduction, as before.
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

function run(retirement) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 68, spouseAge: 68, retireAge: 60, endAge: 74, spouseOn: true, filing: 'mfj' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 50000, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    stages: [], expenses: [], otherIncomes: [], survivor: true, survivorSpendingReduction: 20, selfLife: 95, spouseLife: 95 }, retirement);
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, qcd: 0, debts: [], otherAssets: [] });
  p.accounts = [{ id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 2000000, basisPct: 100, contribution: 0, priority: 1 }];
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const spending = (r, label) => Number(r.rows.find((x) => x.age === label).spending);

test('decision 7: the row that opens at the spouse\'s lifespan is the year of death -- spent for two', () => {
  const r = run({ spouseLife: 70 });
  assert.equal(spending(r, 70), 50000, 'CONTROL: both alive');
  assert.equal(spending(r, 71), 50000, 'the row opening at 70, the lifespan: the spouse is alive in it, as for tax and health');
  assert.equal(spending(r, 72), 40000, 'from the row opening at 71: one survivor, 20% less');
});

test('decision 7: the same boundary when the self dies first', () => {
  const r = run({ selfLife: 70 });
  assert.equal(spending(r, 71), 50000);
  assert.equal(spending(r, 72), 40000);
});

test('decision 7 control: a fractional lifespan never sat on the boundary, and does not move', () => {
  const r = run({ spouseLife: 70.5 });
  assert.equal(spending(r, 71), 50000, 'alive at the row opening at 70');
  assert.equal(spending(r, 72), 40000, 'dead at the row opening at 71');
});
