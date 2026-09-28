/* S5AA R29: MONEY THAT LEAVES A TAXABLE ACCOUNT FOR A NON-TAXABLE ONE IS SOLD, AND ITS GAIN IS REALISED (found in passing while
 * repairing PCF-02; the owner 2026-09-28: "Repair in R29").
 *
 * moveFunds() carried a taxable source's basis out pro rata and dropped it when the destination was not taxable, so the gain on
 * the dollars moved -- which must be sold to fund an IRA or HSA contribution -- vanished untaxed: $10,000 moved with $6,000 of
 * basis left the $4,000 gain unrealised forever. Now the moved dollars realise their gain in the transfer's year exactly as a
 * taxable withdrawal does: the same pro-rata basis share, reported by the account's owner, and a loss is a loss (IRC 1211(b)).
 * Taxable to taxable is not a sale: shares can move in kind, and the basis still travels with them.
 *
 * The plans use the "warn" limit policy so that the contribution limit (PCF-02) does not decide how much moves. Hand
 * arithmetic at 0% returns, no other income unless stated; a gain is part of AGI.
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

const CLASS = { taxable: 'taxable', rothIRA: 'roth', hsa: 'hsa' };
const acct = (id, type, balance, basisPct, priority, owner = 'self') => ({ id, name: id, type, taxClass: CLASS[type], owner, balance, basisPct,
  contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
  futureChanges: [], allocation: { flat: 100 }, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority });

/* A $10,000 taxable account with `basisPct` of basis sends `amount` to an empty `to` account at `at`. */
function row({ basisPct, amount = 10000, to = 'rothIRA', at = 60.5, pension = 0, couple = false, owner = 'self' }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.limitPolicy = 'warn';
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 61, spouseOn: couple, spouseAge: 60, filing: couple ? 'mfj' : 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, dividendGrowth: 0, dividendStart: 60,
    pension, pensionCola: 0, ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [] });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, networthOn: true, otherAssets: [], debts: [], assetsOn: true,
    assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }],
    transferOn: true, transferFrom: 'src', transferTo: 'dest', transferAmount: amount, transferAge: at, penaltyException: true });
  p.accounts = [acct('src', 'taxable', 10000, basisPct, 2, owner), acct('dest', to, 0, to === 'taxable' ? 100 : 0, 1)];
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, 'a valid plan: ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.deepEqual((r.issues || []).filter((i) => i.severity === 'ERROR').map((i) => i.code), [], 'no error of any kind');
  return r.rows[1];
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);

test('R29: $10,000 with $6,000 of basis moved into a Roth IRA realises the $4,000 gain -- AGI $4,000 (was $0)', () => {
  near(row({ basisPct: 60 }).federalAgi, 4000, 'the AGI');
});

test('R29: part of it -- $8,000 of the $10,000 carries $4,800 of basis and realises $3,200', () => {
  near(row({ basisPct: 60, amount: 8000 }).federalAgi, 3200, 'the AGI');
});

test('R29: into an HSA as well -- $10,000 at 60% basis realises $4,000; the $10,000 is deducted as a contribution under the warn policy', () => {
  near(row({ basisPct: 60, to: 'hsa', pension: 20000 }).federalAgi, 20000 + 4000 - 10000, 'the AGI: pension, gain, less the HSA deduction');
});

test('R29: a transfer dated after the year\'s draw (60.75) realises the same $4,000', () => {
  near(row({ basisPct: 60, at: 60.75 }).federalAgi, 4000, 'the AGI');
});

test('R29: a jointly owned taxable account realises its gain on the joint return -- $4,000', () => {
  near(row({ basisPct: 60, couple: true, owner: 'joint' }).federalAgi, 4000, 'the AGI');
});

test('R29 CONTROL: full basis realises nothing -- AGI $0', () => {
  near(row({ basisPct: 100 }).federalAgi, 0, 'the AGI');
});

test('R29 CONTROL: taxable to taxable is not a sale -- AGI $0 at 60% basis', () => {
  near(row({ basisPct: 60, to: 'taxable' }).federalAgi, 0, 'the AGI');
});
