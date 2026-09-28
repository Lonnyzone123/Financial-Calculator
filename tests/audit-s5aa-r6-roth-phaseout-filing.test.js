/* S5AA R6 external audit, EA-03: Roth IRA eligibility kept the ENTERED filing status after a death.
 *
 * rothPhaseoutFactor() read `p.profile.filing`, while every tax reader since F-02 asks
 * householdFilingFor(p, age) -- joint in the year of death, single from the year after. The comment
 * beside householdSurvivorship() recorded the gap as deliberate: the function "has no age argument to
 * ask the question with". MEASURED at 5c985c0 (the auditor's repro, reproduced below): a survivor
 * earning $170,000 -- past the single ceiling of $168,000, inside the joint band -- went on putting
 * $7,500 a year into a Roth IRA after the spouse's death, where a single filer with the same salary
 * was allowed $0.
 *
 * The repair gives the function the row's age and asks householdFilingFor(); it does not compute a
 * death of its own. Its salary proxy for MAGI needed nothing: the loop passes each person's salary FOR
 * THE ROW, which since Q3 is $0 once their work has ended at retirement or death -- so a dead spouse's
 * entered salary never reaches it. The third test holds that interaction as a control. (A first draft of
 * this repair also re-read survivorship for the salaries; its mutation check showed the change moved
 * nothing on any public route, so it was a second reading of a fact already settled, and was removed.)
 *
 * Tested through runPlan only; the function-level contract is in tests/roth-phaseout-factor.test.js.
 *
 * Rows are labelled by the age at which they END. Here the spouse dies at 53: the row labelled 54
 * opens at 53 and is the year of death, and 55 onward are single years.
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

const SINGLE = global.RULES.retirement.ira.rothPhaseout.single;
const JOINT = global.RULES.retirement.ira.rothPhaseout.mfj;

function run(over) {
  over = over || {};
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 50, spouseAge: 50, retireAge: 65, endAge: 58, spouseOn: true, filing: 'mfj' }, over.profile);
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 170000, spouseSalary: 0, growth: 0, contributionStop: 65 }, over.employment);
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 95, spouseLife: 95,
  }, over.retirement);
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, qcd: 0, debts: [], otherAssets: [] });
  p.accounts = [
    { id: 'roth', name: 'roth', type: 'rothIRA', taxClass: 'roth', owner: 'self', balance: 0, basisPct: 0,
      contribution: 7500, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
      changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
      profitShare: 0, vesting: 100, priority: 1 },
    { id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 500000, basisPct: 100,
      contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
      changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
      profitShare: 0, vesting: 100, priority: 2 },
  ];
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
/* What reached the ROTH, as the change in its balance over the row (returns are zero). Not the row's
   `contributions`: the default limit policy redirects a disallowed Roth dollar to the taxable account,
   so the total contributed does not move when eligibility does. */
const into = (r, label) => {
  const i = r.rows.findIndex((x) => x.age === label);
  return Number(r.rows[i].roth) - Number(r.rows[i - 1].roth);
};

test('EA-03: after the year of death the survivor is held to the SINGLE Roth phase-out', () => {
  assert.ok(170000 >= SINGLE[1] && 170000 < JOINT[0], 'CONTROL: $170,000 is past the single ceiling and below the joint floor');
  const widowed = run({ retirement: { spouseLife: 53 } });
  const single = run({ profile: { spouseOn: false, filing: 'single' } });
  assert.equal(into(single, 56).toFixed(2), '0.00', 'CONTROL: a single filer earning $170,000 may not contribute');
  for (const label of [55, 56, 57]) {
    assert.equal(into(widowed, label).toFixed(2), '0.00', 'row ' + label + ': a survivor files single, and is held to it');
  }
});

test('EA-03: the year of death is still a joint year, and keeps the joint phase-out', () => {
  const widowed = run({ retirement: { spouseLife: 53 } });
  assert.equal(into(widowed, 54).toFixed(2), '7500.00', 'the row opening at 53, the age of death: joint, full contribution');
  assert.equal(into(widowed, 55).toFixed(2), '0.00', 'the row after: single');
});

test('EA-03 control: a dead spouse\'s entered salary does not lift the survivor over the single ceiling', () => {
  /* $100,000 each: a living couple is $200,000, inside the joint floor; a survivor alone is $100,000,
     inside the single floor. Once the survivor files single, counting the dead spouse's entered salary
     would make them $200,000, past the single ceiling. It is not counted, because the row's spouse
     salary is already $0 after the death (Q3) -- this holds that interaction in place. */
  const both = { employment: { salary: 100000, spouseSalary: 100000 } };
  const widowed = run(Object.assign({}, both, { retirement: { spouseLife: 53 } }));
  assert.equal(into(run(both), 56).toFixed(2), '7500.00', 'CONTROL: the living couple is inside the joint floor');
  assert.equal(into(widowed, 54).toFixed(2), '7500.00', 'the year of death, joint, both salaries: inside the joint floor');
  assert.equal(into(widowed, 56).toFixed(2), '7500.00', 'from the year after: the survivor\'s own $100,000, inside the single floor');
});

test('EA-03 control: a living joint household does not move', () => {
  const alive = run();
  for (const label of [51, 54, 57]) assert.equal(into(alive, label).toFixed(2), '7500.00');
});

test('EA-03 control: an entered single household does not move', () => {
  const single = run({ profile: { spouseOn: false, filing: 'single' }, employment: { salary: 150000 } });
  assert.equal(into(single, 56).toFixed(2), '7500.00', '$150,000 is inside the single floor');
});

/* FOURTH INTERNAL AUDIT (A4-4). F-02's disclosure said "Contribution room is still computed on the status that
   was entered" and listed "contribution room" as not modelled. EA-03 made that false for the Roth IRA limit,
   which now follows the transition; only the HSA family limit still reads the entered status. A disclosure
   that stopped being true when the engine changed around it is the shape the second audit found twice. */
test('EA-03 (fourth audit, A4-4; R7-01): F-02\'s disclosure no longer says the Roth limit uses the entered status', () => {
  const r = run({ retirement: { spouseLife: 53 } });
  const issue = (r.issues || []).find((i) => i.code === 'SURVIVOR_FILING_STATUS_MODELLED');
  assert.ok(issue, 'CONTROL: the death falls inside the horizon');
  assert.ok(!/Contribution room is still computed on the status that was entered/.test(issue.message), 'false since EA-03');
  assert.ok(/Roth IRA income limit/.test(issue.message), 'and it says what does follow the transition');
  /* R7 re-audit (R7-01): the HSA family limit must not be described as a filing-status matter -- it is coverage. */
  assert.ok(/question of health coverage, not of filing status/.test(issue.message), 'the HSA limit is described as the coverage question it is');
  assert.ok(!issue.state.notModelled.includes('contribution room'));
  assert.ok(issue.state.notModelled.includes('the HSA family limit after the death'), 'naming what still does not');
});

