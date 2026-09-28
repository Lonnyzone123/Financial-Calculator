/* S5AA R29: PCF-02 -- A TRANSFER INTO AN IRA OR AN HSA FROM A DIFFERENT KIND OF ACCOUNT IS A CONTRIBUTION (ChatGPT's PCF full-model
 * audit of 8396626, 2026-09-28, P1; the owner 2026-09-28: "As a contribution", and "Stays in the source" for the excess).
 *
 * The one-time transfer moved ordinary taxable money into a Roth IRA with no limit: ChatGPT's witness, an age-60 owner with no
 * compensation moving $50,000 into an empty Roth IRA, validated, ran with no issue, and sheltered $50,000 where IRC 408A(c)(2)
 * and 219(b)(1) allow min(the year's room, taxable compensation) = $0 (reproduced at 8396626 and at ee9757d). Now such a
 * transfer is held to the same room as the year's planned contributions, AFTER them: the IRA dollar limit with catch-up and
 * the Roth income phase-out, the compensation limit (R26/R28), and for an HSA the self or family limit with its catch-up. Under
 * the "redirect" policy only what fits moves and the rest never leaves its source; under "warn" all of it moves and the excess
 * is warned about, as a planned contribution is. What moves is then a contribution: deductible into a traditional IRA under
 * the IRA deduction rule, deductible above the line into an HSA (IRC 223(a), 62(a)(19)) -- a direct contribution, not payroll.
 *
 * 2026 figures (checked below against the rules package): IRA $7,500 plus a $1,100 catch-up from 50 (so $8,600 at 60); HSA
 * $4,400 self-only, $8,750 family, plus a $1,000 catch-up from 55. Hand arithmetic at 0% returns with no spending.
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

const CLASS = { taxable: 'taxable', hsa: 'hsa', rothIRA: 'roth', traditionalIRA: 'preTax' };
const acct = (id, type, balance, priority, extra) => Object.assign({ id, name: id, type, taxClass: CLASS[type], owner: 'self', balance,
  basisPct: type === 'taxable' ? 100 : 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
  frequency: 1, changeTiming: 'year', futureChanges: [], allocation: { flat: 100 }, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100, priority }, extra || {});

/* `amount` moves at 60.5 from a `from` account holding it into an empty `to` account. `wages`: employment income over the year. */
function run({ from, to, amount, wages = 0, pension = 0, policy = 'redirect', toContribution = 0, fromExtra, age = 60, retireAge = age, transferOn = true }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.limitPolicy = policy;
  Object.assign(p.profile, { age, retireAge, endAge: age + 1, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: age + 5 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, dividendGrowth: 0, dividendStart: age,
    pension, ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [],
    otherIncomes: wages ? [{ name: 'Wages', type: 'employment', owner: 'self', amount: wages, start: age, end: age + 1, growth: 0, growthMode: 'fixed' }] : [] });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, networthOn: true, otherAssets: [], debts: [], assetsOn: true,
    assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }],
    transferOn, transferFrom: 'src', transferTo: 'dest', transferAmount: amount, transferAge: age + 0.5, penaltyException: true });
  p.accounts = [acct('src', from, amount, 2, fromExtra), acct('dest', to, 0, 1, toContribution ? { contribution: toContribution } : {}),
    acct('cash', 'taxable', 0, 9)];
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, 'a valid plan: ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.deepEqual((r.issues || []).filter((i) => i.severity === 'ERROR').map((i) => i.code), [], 'no error of any kind');
  return { row: r.rows[1], warnings: r.limitWarnings || [] };
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);
const warnsTransfer = (w) => w.some((s) => /transfer/i.test(s) && /limit/i.test(s));

test('R29 CONTROL: the 2026 limits this test states are the rules package\'s', () => {
  const r = RULES.retirement;
  assert.deepEqual([r.ira.combinedLimit, r.ira.catchup, r.ira.catchupAge], [7500, 1100, 50]);
  assert.deepEqual([r.hsa.self, r.hsa.family, r.hsa.catchup, r.hsa.catchupAge], [4400, 8750, 1000, 55]);
});

test('PCF-02: ChatGPT\'s witness -- $50,000 of taxable money into a Roth IRA with no compensation: nothing moves, it says why (was $50,000 sheltered)', () => {
  const x = run({ from: 'taxable', to: 'rothIRA', amount: 50000 });
  near(x.row.roth, 0, 'the Roth IRA');
  near(x.row.taxable, 50000, 'the taxable money stays');
  assert.ok(warnsTransfer(x.warnings), 'a limit warning names the transfer: ' + JSON.stringify(x.warnings));
});

test('PCF-02: with $3,000 of wages, $3,000 of the $50,000 moves -- the compensation limit', () => {
  const x = run({ from: 'taxable', to: 'rothIRA', amount: 50000, wages: 3000 });
  near(x.row.roth, 3000, 'the Roth IRA');
});

test('PCF-02: the room is what the year\'s planned contributions leave -- $20,000 of wages and $5,000 contributed leave $3,600 of $8,600', () => {
  /* Working through the year (retiring at 61), so the planned $5,000 flows; the CONTROL shows it does, with no transfer. */
  near(run({ from: 'taxable', to: 'rothIRA', amount: 50000, wages: 20000, toContribution: 5000, retireAge: 61, transferOn: false }).row.roth, 5000,
    'CONTROL: the planned contribution alone');
  const x = run({ from: 'taxable', to: 'rothIRA', amount: 50000, wages: 20000, toContribution: 5000, retireAge: 61 });
  near(x.row.roth, 8600, 'the Roth IRA: $5,000 contributed and $3,600 moved');
});

test('PCF-02: under the "warn" policy all $50,000 moves and the excess is warned about', () => {
  const x = run({ from: 'taxable', to: 'rothIRA', amount: 50000, policy: 'warn' });
  near(x.row.roth, 50000, 'the Roth IRA');
  assert.ok(warnsTransfer(x.warnings), JSON.stringify(x.warnings));
});

test('PCF-02: into a traditional IRA it is a deductible contribution -- $10,000 of wages, $8,600 moves and is deducted, AGI $1,400', () => {
  const x = run({ from: 'taxable', to: 'traditionalIRA', amount: 20000, wages: 10000 });
  near(x.row.preTax, 8600, 'the traditional IRA');
  near(x.row.federalAgi, 1400, 'the AGI: $10,000 of wages less the $8,600 deduction');
});

test('PCF-02: into an HSA it is held to the HSA limit and deducted above the line -- $5,400 at 60 (self-only plus catch-up), with no wages needed', () => {
  const x = run({ from: 'taxable', to: 'hsa', amount: 10000, pension: 20000 });
  near(x.row.hsa, 5400, 'the HSA');
  near(x.row.federalAgi, 14600, 'the AGI: the $20,000 pension less the $5,400 deduction');
});

test('PCF-02 with PCF-01: HSA to Roth IRA with $3,000 of wages -- $3,000 leaves the HSA and is taxed; the other $7,000 stays in it, untaxed', () => {
  const x = run({ from: 'hsa', to: 'rothIRA', amount: 10000, wages: 3000, fromExtra: { qualifiedMedicalPct: 0 } });
  near(x.row.roth, 3000, 'the Roth IRA');
  near(x.row.hsa, 7000, 'the HSA keeps the excess');
  near(x.row.federalAgi, 6000, 'the AGI: $3,000 of wages and the $3,000 distributed');
});

test('PCF-02 CONTROL: a same-kind move is not a contribution -- Roth IRA to Roth IRA moves all $50,000', () => {
  const x = run({ from: 'rothIRA', to: 'rothIRA', amount: 50000 });
  near(x.row.roth, 50000, 'the Roth IRAs');
  assert.equal(warnsTransfer(x.warnings), false);
});
