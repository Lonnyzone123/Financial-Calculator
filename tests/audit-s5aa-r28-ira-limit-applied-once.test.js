/* S5AA R28 round: R26-01 -- THE IRA COMPENSATION LIMIT IS APPLIED ONCE, TO WHAT IS CREDITED IN THE YEAR (ChatGPT's R26
 * audit, 2026-09-26, priority 2; the owner 2026-09-26: "Repair").
 *
 * R26 compared the annual contribution RATE with a compensation figure that mixed units: the salary rate, plus the other
 * income actually received over the year. The row then multiplied what was allowed by the owner's contribution duration.
 * So an employment stream ending inside the year was prorated twice -- once by otherIncomeFor() and again by the
 * duration -- and ChatGPT's witness, $6,000/yr of wages from 40 to 40.5 with a $7,000/yr Roth IRA request, credited $1,500
 * where the year's $3,000 of compensation allows $3,000 (reproduced at 73e24c7). A salary kept for the whole year with
 * contributions stopped at mid-year took the same path from the other side: $3,000 earned, $1,500 allowed.
 *
 * Now the limit compares dollars with dollars: the year's compensation actually earned (the salary over the owner's work
 * duration, plus the employment and self-employment income received in the row) against the IRA contributions actually
 * credited (the rate over the contribution duration), less the pre-tax workplace and HSA contributions credited. The
 * allowed rate is then the capped dollars over that same duration, so the row credits them exactly once.
 * All through runPlan() on validator-valid plans at a 0% return, as in the R26 file.
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
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const acct = (id, type, taxClass, balance, contribution, o = {}) => Object.assign({ id, name: id, type, taxClass, owner: 'self',
  balance, basisPct: taxClass === 'taxable' ? 100 : 0, contribution, contributionMode: 'amount', annualChange: 0,
  annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0,
  matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }, o);
const wages = (amount, end, owner) => [{ name: 'w', type: 'employment', owner: owner || 'self', amount, start: 40, end, growth: 0, growthMode: 'fixed' }];

function run(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  const joint = !!o.spouse;
  Object.assign(p.profile, { age: 40, retireAge: o.retireAge || 55, endAge: 41, spouseOn: joint, filing: joint ? 'mfj' : 'single' });
  if (joint) Object.assign(p.profile, { spouseAge: 40, spouseRetireAge: o.retireAge || 55 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: o.salary || 0, spouseSalary: 0, growth: 0, contributionStop: o.contributionStop || 55 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: o.otherIncomes || [] });
  Object.assign(p.advanced, { assetsOn: false, rmdOn: false, transferOn: false, conversionOn: false, healthOn: false,
    networthOn: true, otherAssets: [], debts: [] });
  p.limitPolicy = 'redirect';
  p.accounts = [acct('cash', 'taxable', 'taxable', 100000, 0, { priority: 9 })].concat(o.accounts);
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, 'a valid plan: ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const received = (r, cls) => r.rows[1][cls] - r.rows[0][cls];
const roth = (o) => acct('roth', 'rothIRA', 'roth', 0, 7000, Object.assign({ priority: 1 }, o || {}));

test('R26-01: $6,000/yr of wages from 40 to 40.5 is $3,000 of compensation -- a half-year $7,000/yr Roth IRA receives $3,000 (was $1,500)', () => {
  /* Half a year of a $7,000/yr request is $3,500; the year's compensation is $6,000 x 0.5 = $3,000; $500 is excess. */
  const r = run({ retireAge: 40.5, otherIncomes: wages(6000, 40.5), accounts: [roth()] });
  assert.equal(received(r, 'roth'), 3000);
});

test('R26-01: the excess is only what the limit leaves -- $500 of the $3,500 is redirected to the taxable account (was $2,000)', () => {
  /* Against the same plan with no Roth request: the $3,500 contributed arrives in the household either way, $3,000 in the
     Roth IRA and the $500 excess in the taxable account (the default "redirect" policy). */
  const withIra = run({ retireAge: 40.5, otherIncomes: wages(6000, 40.5), accounts: [roth()] });
  const without = run({ retireAge: 40.5, otherIncomes: wages(6000, 40.5), accounts: [roth({ contribution: 0 })] });
  const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);
  near(withIra.rows[1].taxable - without.rows[1].taxable, 500, 'the redirected excess');
  near(withIra.rows[1].total - without.rows[1].total, 3500, 'the whole half-year request');
});

test('R26-01: a salary kept all year with contributions stopped at 40.5 -- $3,000 earned allows $3,000 of the $3,500 asked (was $1,500)', () => {
  const r = run({ salary: 3000, contributionStop: 40.5, accounts: [roth()] });
  assert.equal(received(r, 'roth'), 3000);
});

test('R26-01: on a joint return the couple\'s part-year compensation is shared once -- the spouse\'s $3,000 funds $3,000 (was $1,500)', () => {
  /* The spouse's wages, $6,000/yr to 40.5, are the couple's only compensation: $3,000. Each spouse asks $3,500 for the
     half year; the first IRA in priority order takes all $3,000 and the second nothing. */
  const r = run({ spouse: true, retireAge: 40.5, otherIncomes: wages(6000, 40.5, 'spouse'),
    accounts: [roth(), roth({ id: 'theirs', name: 'theirs', owner: 'spouse', priority: 2 })] });
  assert.equal(received(r, 'roth'), 3000);
});

test('R26-01 CONTROL: a half-year salary was already right -- $6,000/yr to 40.5 allows $3,000 of the $3,500 asked', () => {
  const r = run({ salary: 6000, retireAge: 40.5, accounts: [roth()] });
  assert.equal(received(r, 'roth'), 3000);
});

test('R26-01 CONTROL: a full year is unchanged -- $3,000 of wages all year allows $3,000 of the $7,000 asked', () => {
  const r = run({ otherIncomes: wages(3000, 70), accounts: [roth()] });
  assert.equal(received(r, 'roth'), 3000);
});
