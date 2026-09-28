/* Q99 (G5) through the PUBLIC ROUTE -- runPlan() and the rows and issues it reports.
 *
 * tests/audit-s5aa-hsa-qualified-share.test.js pins the rule where it lives, calling
 * smartWithdrawalOrder() and the scenario validator directly, and is implementation-coupled for that
 * reason. This file exists because tools/closeout-check.js refused Q99 as COUPLED-ONLY until it did:
 * a repair that cannot be seen from the public route has not been shown to reach a user.
 *
 * Nothing here names an internal function. Every claim is a claim about what a household is charged.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function hsaAccount(owner, balance, share) {
  const a = {
    id: 'hsa-' + owner, name: 'HSA (' + owner + ')', type: 'hsa', taxClass: 'hsa', owner, balance,
    basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  };
  if (share !== null) a.qualifiedMedicalPct = share;
  return a;
}

/* One HSA, one year, no growth and no other income, so the household's whole tax bill is the tax on
   its HSA draw. */
function household(age, share, spending, owner, spouseAge) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, {
    age, retireAge: age, endAge: age + 1,
    spouseOn: spouseAge !== undefined, spouseAge: spouseAge === undefined ? 60 : spouseAge,
    filing: spouseAge === undefined ? 'single' : 'mfj',
  });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending, dividendOn: false, qcdOn: false,
    withdrawalOrder: 'manual', manualOrder: 'hsa,taxable,preTax,roth',
    stages: [], expenses: [], otherIncomes: [], ssBenefit: 0, spouseSS: 0, survivor: false,
  });
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false });
  p.accounts = [hsaAccount(owner || 'self', 400000, share)];
  return p;
}

function charged(p) {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return Number(r.rows[1].taxes) || 0;
}

test('Q99 public route: a household that states nothing about its HSA is charged nothing, as before', () => {
  assert.equal(charged(household(50, null, 40000)).toFixed(2), '0.00');
});

test('Q99 public route: a household that says half its HSA draws are not for care is charged for that half', () => {
  const free = charged(household(50, 100, 10000));
  const half = charged(household(50, 50, 10000));
  assert.equal(free.toFixed(2), '0.00');
  assert.ok(half > 0, 'a stated non-qualified share must cost something; got ' + half.toFixed(2));
  /* The includible share is 0.5, so the rate on the draw is 0.10 and the household must gross up:
     G = 10,000 + 0.10 G -> G = 11,111.11, of which 10% is 1,111.11. */
  assert.equal(half.toFixed(2), '1111.11');
});

test('Q99 public route: the same household is charged less at 66 than at 64', () => {
  const before = charged(household(64, 0, 10000));
  const after = charged(household(66, 0, 10000));
  assert.ok(after < before, 'the additional tax stops at 65; got ' + after.toFixed(2) + ' against ' + before.toFixed(2));
  assert.equal(after.toFixed(2), '0.00');
});

test('Q99 public route: an older filer does not make a younger spouse\'s HSA free', () => {
  const ownHsa = charged(household(66, 0, 10000, 'self', 50));
  const spouseHsa = charged(household(66, 0, 10000, 'spouse', 50));
  assert.equal(ownHsa.toFixed(2), '0.00');
  assert.ok(spouseHsa > 0,
    'the 50-year-old spouse owns the account and has not reached the exception age; got ' + spouseHsa.toFixed(2));
});

test('Q99 public route: the result tells the household what is being assumed about its HSA', () => {
  const r = engine.runPlan(household(50, null, 10000));
  const said = (r.issues || []).find((i) => i.code === 'HSA_QUALIFIED_SHARE_ASSUMED');
  assert.ok(said, 'the assumption is stated even when it is the default, because that is the invisible one');
  assert.match(said.message, /assumption about qualifying expenses, not a record that they exist/);
});

test('Q99 public route: a plan with no HSA is unaffected in every respect', () => {
  const p = household(50, null, 10000);
  p.accounts = [{
    id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 400000,
    basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  }];
  p.retirement.manualOrder = 'taxable,preTax,roth,hsa';
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok');
  assert.equal((r.issues || []).filter((i) => i.code === 'HSA_QUALIFIED_SHARE_ASSUMED').length, 0);
});
