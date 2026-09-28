'use strict';

/**
 * The internals half of tests/audit-rmd-cash.test.js, split out at S5 block 2r.
 *
 * These tests reach the engine's internals: retainExcessRmdCash() directly, estimateTaxes() as an independent tax
 * oracle, and simulatePlan() with an issue collector. They are moved verbatim, with the setup and plan helper they
 * use, so the original file reaches the engine only through runPlan(). A rebuild re-points or retires them with those
 * internals.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

// --- Direct unit tests of retainExcessRmdCash() -------------------------

test('retainExcessRmdCash: deposits into the existing taxable account with the lowest priority number', () => {
  const accounts = [
    { id: 'a', taxClass: 'taxable', balance: 10000, basisPct: 50, priority: 2 },
    { id: 'b', taxClass: 'taxable', balance: 5000, basisPct: 80, priority: 1 },
    { id: 'c', taxClass: 'preTax', balance: 999999, basisPct: 0, priority: 1 },
  ];
  const dest = engine.retainExcessRmdCash(accounts, 1000);
  assert.equal(dest.id, 'b', 'must pick the lowest-priority-number taxable account, not just the first in array order');
  assert.equal(dest.balance, 6000);
});

test('retainExcessRmdCash: blends basis as a balance-weighted average -- the deposit itself is 100% basis', () => {
  const accounts = [{ id: 'a', taxClass: 'taxable', balance: 10000, basisPct: 60, priority: 1 }];
  engine.retainExcessRmdCash(accounts, 5000);
  // Existing basis dollars: 10000*0.6=6000. New basis dollars: 6000+5000=11000. New balance: 15000.
  // RE-FIXTURED at the S5AA R18 round (workstream B): the engine now carries basis in DOLLARS (basisDollars) and leaves
  // basisPct as the saved opening input, so the blend is read from the dollars. The principle is unchanged: the
  // deposit is 100% basis, blended by balance.
  const expectedBasisPct = (11000 / 15000) * 100;
  assert.ok(Math.abs(accounts[0].basisDollars - 11000) < 1e-9, `expected 11000 basis dollars, got ${accounts[0].basisDollars}`);
  assert.ok(Math.abs(accounts[0].basisDollars / accounts[0].balance * 100 - expectedBasisPct) < 1e-9, 'the blended rate');
});

test('retainExcessRmdCash: creates a new taxable account when none exists, with 100% basis (the deposit is already-taxed cash)', () => {
  const accounts = [{ id: 'c', taxClass: 'preTax', balance: 999999, basisPct: 0, priority: 1 }];
  const dest = engine.retainExcessRmdCash(accounts, 8000);
  assert.equal(accounts.length, 2, 'a new account must be appended');
  assert.equal(dest.taxClass, 'taxable');
  assert.equal(dest.balance, 8000);
  assert.equal(dest.basisPct, 100);
});

test('retainExcessRmdCash: a non-positive amount is a no-op', () => {
  const accounts = [{ id: 'a', taxClass: 'taxable', balance: 1000, basisPct: 50, priority: 1 }];
  const result = engine.retainExcessRmdCash(accounts, 0);
  assert.equal(result, null);
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].balance, 1000);
});

// --- Integration tests that reach internals -----------------------------

function rmdPlan(overrides = {}) {
  const defaultPlanMatch = shell.match(/var defaultPlan=(\{.*?\});/);
  // eslint-disable-next-line no-eval
  const defaultPlan = eval('(' + defaultPlanMatch[1] + ')');
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.profile.age = 75;
  p.profile.retireAge = 65;
  p.profile.endAge = 77; // two one-year rows: 76, then 77
  p.employment.salary = 0;
  p.employment.spouseSalary = 0;
  p.advanced.rmdOn = true;
  p.retirement.strategy = 'fixedNominal';
  p.retirement.spending = 0;
  p.assumptions.returnRate = 0; // isolate RMD/cash-retention behavior from investment growth
  p.assumptions.method = 'simple';
  p.accounts = [
    { id: 'pretax', name: '401k', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 1000000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 },
  ];
  return Object.assign(p, overrides);
}

test('AUD-003/R2-002: a QCD portion of the RMD is neither counted toward need nor retained -- it leaves the household as a donation, and the tax it saves stays in retained cash', () => {
  /* S5R-02 (the owner's answer 2 (A) of 2026-09-16): a QCD is excluded only from its owner's traditional IRA. rmdPlan()'s
     account is a traditional 401(k), from which this test drew its QCD until then; the account is an IRA here, on both
     sides, so the test still measures the QCD's cash accounting and nothing else. */
  const asIra = (plan) => { plan.accounts[0].type = 'traditionalIRA'; plan.accounts[0].name = 'IRA'; return plan; };
  const p = asIra(rmdPlan());
  p.retirement.spending = 0;
  p.advanced.qcd = 15000; // large QCD relative to the RMD, well within RMD size
  const withQcd = engine.runPlan(p).rows[1];

  const withoutQcd = asIra(rmdPlan());
  withoutQcd.retirement.spending = 0;
  const noQcdRow = engine.runPlan(withoutQcd).rows[1];

  assert.ok(withQcd.rmd > 0 && Math.abs(withQcd.rmd - noQcdRow.rmd) < 0.01, 'QCD must not change the RMD amount itself');
  assert.ok(withQcd.taxable < noQcdRow.taxable, 'retained taxable wealth must be lower when a QCD diverts part of the RMD to charity');
  // R2-002 (CLAUDE_CODE_FIX_HANDOVER_TAX_FUNDING_AND_ROUND2_2026-09-08.md
  // section 5) made this accounting exact: QCD isn't just $15,000 of cash
  // that never arrives, it's also $15,000 LESS ordinary income, which
  // reduces the tax owed on the rest of the RMD. So retained cash must
  // drop by exactly $15,000 minus that tax saving, not by the full $15,000
  // -- computed here independently via estimateTaxes(), not assumed.
  const rmdAmount = noQcdRow.rmd;
  const taxWithoutQcd = engine.estimateTaxes(withoutQcd, withoutQcd.profile.age, rmdAmount, 0, withQcd.income, 0, 0, 0).total;
  const taxWithQcd = engine.estimateTaxes(p, p.profile.age, rmdAmount - 15000, 0, withQcd.income, 0, 0, 0).total;
  const expectedReduction = 15000 - (taxWithoutQcd - taxWithQcd);
  const actualReduction = noQcdRow.taxable - withQcd.taxable;
  assert.ok(Math.abs(actualReduction - expectedReduction) < 0.5, `expected retained cash to drop by $15,000 minus the QCD's tax saving (${expectedReduction}), got a reduction of ${actualReduction}`);
});

test('AUD-003: reconciliation invariant holds exactly -- retaining excess RMD cash does not double-count or lose track of wealth', () => {
  const p = rmdPlan();
  p.retirement.spending = 2000;
  const issues = [];
  engine.simulatePlan(p, engine.rng(p.assumptions.seed), 0, null, issues);
  assert.deepEqual(issues, [], `expected a clean run with no reconciliation mismatches, got ${JSON.stringify(issues.slice(0, 2))}`);
});
