/* S5AA R29: PCF-01 -- A TRANSFER OUT OF AN HSA IS AN HSA DISTRIBUTION (ChatGPT's PCF full-model audit of 8396626, 2026-09-28, P1;
 * the owner 2026-09-28: "Tax it like a withdrawal").
 *
 * The one-time transfer taxed only a pre-tax source; an HSA moved to a taxable account untaxed, whatever its qualified-medical
 * share and its owner's age. ChatGPT's witness: an age-60 owner, a $10,000 HSA stated 0% qualified, all of it moved to an empty
 * taxable account at 60.5 -- AGI $0 and $10,000 kept, where IRC 223(f)(2) includes the $10,000 in income and 223(f)(4)(A) adds
 * 20% of it, $2,000 (reproduced at 8396626 and at the private source's ee9757d). Now the moved dollars are taxed exactly as an
 * HSA withdrawal is (withdrawFromAccountList()): the account's includible share is ordinary income, and before its OWNER is
 * 65 that income carries the additional 20%. Figures from the rules package: the 2026 single standard deduction is $16,100, so
 * no ordinary income tax arises on $10,000 and the additional tax is the whole tax.
 *
 * Hand arithmetic, 0% returns, no other income, the destination paying the tax: kept = $10,000 - 20% x includible.
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

const acct = (id, type, taxClass, balance, owner, extra) => Object.assign({ id, name: id, type, taxClass, owner, balance,
  basisPct: taxClass === 'taxable' ? 100 : 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
  frequency: 1, changeTiming: 'year', futureChanges: [], allocation: { flat: 100 }, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100, priority: id === 'dest' ? 1 : 2 }, extra || {});

/* A $10,000 HSA moves whole at `at`. `pct` is its qualified-medical share (undefined: not stated). */
function row({ pct, at, age = 60, owner = 'self', spouseAge, dest = ['taxable', 'taxable'] }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  const couple = spouseAge !== undefined;
  Object.assign(p.profile, { age, retireAge: age, endAge: age + 1, spouseOn: couple, spouseAge: couple ? spouseAge : age, filing: couple ? 'mfj' : 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, dividendGrowth: 0, dividendStart: age,
    pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [] });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, networthOn: true, otherAssets: [], debts: [], assetsOn: true,
    assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }],
    transferOn: true, transferFrom: 'hsa', transferTo: 'dest', transferAmount: 10000, transferAge: at === undefined ? age + 0.5 : at, penaltyException: true });
  p.accounts = [acct('hsa', 'hsa', 'hsa', 10000, owner, pct === undefined ? {} : { qualifiedMedicalPct: pct }), acct('dest', dest[0], dest[1], 0, 'self')];
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, 'a valid plan: ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.deepEqual((r.issues || []).filter((i) => i.severity === 'ERROR').map((i) => i.code), [], 'no error of any kind');
  return r.rows[1];
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);

test('PCF-01: ChatGPT\'s witness -- a 0%-qualified $10,000 HSA moved to taxable at 60 is $10,000 of income and $2,000 of additional tax; $8,000 is kept (was $10,000, AGI $0)', () => {
  const r = row({ pct: 0 });
  near(r.federalAgi, 10000, 'the AGI');
  near(r.taxes, 2000, 'the tax: 20% of the includible $10,000');
  near(r.total, 8000, 'the household');
});

test('PCF-01: 60% qualified -- $4,000 is includible and carries $800; $9,200 is kept', () => {
  const r = row({ pct: 60 });
  near(r.federalAgi, 4000, 'the AGI');
  near(r.taxes, 800, 'the tax');
  near(r.total, 9200, 'the household');
});

test('PCF-01: at 66 the income remains but the additional tax does not -- AGI $10,000, no tax below the deduction, $10,000 kept', () => {
  const r = row({ pct: 0, age: 66 });
  near(r.federalAgi, 10000, 'the AGI');
  near(r.taxes, 0, 'the tax');
  near(r.total, 10000, 'the household');
});

test('PCF-01: the age that counts is the HSA OWNER\'s -- a 60-year-old spouse\'s HSA moved while the other is 66 still carries $2,000', () => {
  const r = row({ pct: 0, age: 66, owner: 'spouse', spouseAge: 60 });
  near(r.federalAgi, 10000, 'the AGI');
  near(r.taxes, 2000, 'the tax');
});

test('PCF-01: a transfer dated after the year\'s draw (60.75) is taxed the same way', () => {
  const r = row({ pct: 0, at: 60.75 });
  near(r.federalAgi, 10000, 'the AGI');
  near(r.taxes, 2000, 'the tax');
  near(r.total, 8000, 'the household');
});

test('PCF-01 CONTROL: an HSA with no stated share is assumed fully qualified (Q99) -- nothing is taxed', () => {
  const r = row({});
  near(r.federalAgi, 0, 'the AGI');
  near(r.total, 10000, 'the household');
});

test('PCF-01 CONTROL: HSA to HSA is not a distribution -- nothing is taxed', () => {
  const r = row({ pct: 0, dest: ['hsa', 'hsa'] });
  near(r.federalAgi, 0, 'the AGI');
  near(r.hsa, 10000, 'the HSAs');
});
