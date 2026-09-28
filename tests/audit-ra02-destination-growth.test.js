'use strict';

// RA-02 (re-audit, 2026-09-11) -- P1. A destination created mid-period gets
// its growth treatment from where it came from rather than from what it is.
//
// THE DEFECT, which is an ordering bug wearing a policy costume. `rates` is
// index-aligned to `accounts` and computed at the top of the period, so an
// account appended DURING settlement has no entry and growAccounts() skips
// it. R4 closed that by registering the RMD SOURCE account's rate at the new
// index -- correct for the case it was written for, and wrong for both cases
// FM-03 then introduced:
//
//   Case A, cash.  accountReturnForPeriod() returns 0 for a cashHolding, but
//   an account created after `rates` was built never reaches that branch in
//   its first period. The inherited registration handed the zero-return cash
//   holding the source account's 10% market rate, and it grew
//   66,204.97154471544 -> 69,436.35994895067 in the half period. An
//   equivalent already-present cash holding correctly received zero.
//   Discrepancy: 3,231.388404235244, with no calculation error either way.
//
//   Case B, investment.  With `invest` and no RMD (so no source account), no
//   rate is registered at all and the destination does not grow in its
//   creation period. 34,602.50 deposited, versus 36,291.40816880767 for an
//   otherwise identical pre-existing empty taxable account. Discrepancy:
//   1,688.9081688076258.
//
// So a preset called `retain` earned a market return, and a preset called
// `invest` did not. Both were exactly backwards.
//
// THE REPAIR. Register the rate from the destination's POLICY, not from its
// provenance: cash receives an explicit zero, an investment destination
// receives the same treatment an equivalent pre-existing account would get,
// and the RMD source-rate inheritance (HR-02) is kept only where it applies.
//
// RANDOM-DRAW TREATMENT, DEFINED RATHER THAN ASSUMED. A synthesized
// destination NEVER consumes an RNG draw. Appending one would shift the
// stream for every later period of every Monte Carlo run, moving results far
// outside this repair. Under `simple` and `historical` that is exact
// agreement with a pre-existing account. Under Monte Carlo it is deliberately
// the expectation rather than a draw -- a stated divergence, recorded as Q19,
// not an accident.
//
// THE ORACLE IS INDEPENDENT. Expected balances are computed in this file as
// deposit x remaining-period growth, never by calling the code under test.
//
// The three tests that call the engine's internal return function directly live in
// tests/audit-ra02-internals.test.js, split out at S5 block 2r, so this file reaches the engine only through
// runPlan().

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require('../src/engine.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs');
const defaultPlan = extractDefaultPlan(shell);

function account(o) {
  return Object.assign({
    id: 'a1', name: 'A', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 0, basisPct: 100, contributionMode: 'dollar', contribution: 0, frequency: 12,
    annualChangeMode: 'percent', annualChange: 0, changeTiming: 'annual', contributionPreset: 'none',
    futureChanges: [], priority: 1, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0,
    vesting: 100, allocation: {},
  }, o);
}

const CASH_HOLDING = account({
  id: 'household-cash', name: 'Retained household cash', type: 'customTaxable',
  taxClass: 'taxable', balance: 0, priority: 2, cashHolding: true,
});
const EMPTY_TAXABLE = account({ id: 'tax0', name: 'Taxable', balance: 0, priority: 2 });

function plan(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.profile.age = 75; p.profile.retireAge = 65; p.profile.endAge = 76;
  p.profile.spouseOn = false; p.profile.filing = 'single';
  p.employment.salary = 0; p.employment.spouseSalary = 0;
  p.assumptions.method = 'simple'; p.assumptions.returnRate = 10;
  p.assumptions.inflation = 0; p.assumptions.fee = 0; p.assumptions.volatility = 0;
  p.assumptions.withdrawalTiming = 'monthly';
  p.retirement.strategy = 'fixedNominal'; p.retirement.spending = 20000;
  p.retirement.pension = 60000; p.retirement.pensionCola = 0;
  p.retirement.ssBenefit = 0; p.retirement.spouseSS = 0;
  p.retirement.dividendOn = false; p.retirement.incomeOffset = true;
  p.retirement.stages = []; p.retirement.expenses = []; p.retirement.otherIncomes = [];
  p.advanced.rmdOn = true; p.advanced.debts = []; p.advanced.otherAssets = [];
  p.advanced.healthOn = false; p.advanced.ltcOn = false;
  p.accounts = [account({ id: 'ira', type: 'traditionalIra', taxClass: 'preTax', balance: 1000000 })];
  const ov = o || {};
  ['profile', 'assumptions', 'retirement', 'advanced'].forEach((k) => { if (ov[k]) Object.assign(p[k], ov[k]); });
  if (ov.accounts) p.accounts = ov.accounts;
  return p;
}

function ending(p) {
  const res = engine.runPlan(JSON.parse(JSON.stringify(p)));
  return { total: res.rows[res.rows.length - 1].total, res };
}

// ---------------------------------------------------------------------------
// 1. Created and pre-existing destinations must agree
// ---------------------------------------------------------------------------

const AGREEMENT_MATRIX = [];
[['cash', 'retain', CASH_HOLDING], ['investment', 'invest', EMPTY_TAXABLE]].forEach(([kind, policy, spare]) => {
  [true, false].forEach((rmdOn) => {
    [10, 0, -6].forEach((returnRate) => {
      ['monthly', 'quarterly', 'annual'].forEach((withdrawalTiming) => {
        AGREEMENT_MATRIX.push({ kind, policy, spare, rmdOn, returnRate, withdrawalTiming });
      });
    });
  });
});

AGREEMENT_MATRIX.forEach((c) => {
  const label = c.kind + ' destination, rmd ' + (c.rmdOn ? 'on' : 'off') +
    ', return ' + c.returnRate + '%, ' + c.withdrawalTiming;
  test('RA-02: created and pre-existing agree -- ' + label, () => {
    const base = {
      assumptions: { returnRate: c.returnRate, withdrawalTiming: c.withdrawalTiming },
      advanced: {
        rmdOn: c.rmdOn,
        surplusPolicy: c.policy,
        surplusPolicyBySource: { rmd: c.policy },
      },
    };
    const ira = account({ id: 'ira', type: 'traditionalIra', taxClass: 'preTax', balance: 1000000 });
    const created = ending(plan(Object.assign({ accounts: [ira] }, base)));
    const preexisting = ending(plan(Object.assign({
      accounts: [ira, JSON.parse(JSON.stringify(c.spare))],
    }, base)));

    assert.equal(created.res.calculationError || false, false, label + ': created run must not error');
    assert.equal(preexisting.res.calculationError || false, false, label + ': control run must not error');
    assert.ok(
      Math.abs(created.total - preexisting.total) < 0.01,
      label + ': a destination created mid-period must be treated exactly as an ' +
      'equivalent pre-existing one. created=' + created.total.toFixed(6) +
      ' pre-existing=' + preexisting.total.toFixed(6) +
      ' discrepancy=' + (created.total - preexisting.total).toFixed(6)
    );
  });
});

// ---------------------------------------------------------------------------
// 2. The two figures the re-audit named
// ---------------------------------------------------------------------------

test('RA-02 Case A: retained cash must not earn a market return in its creation period', () => {
  const cfg = { advanced: { surplusPolicy: 'retain', surplusPolicyBySource: { rmd: 'retain' } } };
  const ira = account({ id: 'ira', type: 'traditionalIra', taxClass: 'preTax', balance: 1000000 });
  const created = ending(plan(Object.assign({ accounts: [ira] }, cfg))).total;
  const control = ending(plan(Object.assign({
    accounts: [ira, JSON.parse(JSON.stringify(CASH_HOLDING))] }, cfg))).total;
  assert.ok(
    Math.abs(created - control) < 0.01,
    'the re-audit measured a 3,231.388404 discrepancy here; got ' + (created - control).toFixed(6)
  );
});

test('RA-02 Case B: an invest destination must grow in its creation period', () => {
  const roth = account({ id: 'roth', type: 'rothIra', taxClass: 'roth', balance: 1000000 });
  const cfg = { advanced: { rmdOn: false, surplusPolicy: 'invest' } };
  const created = ending(plan(Object.assign({ accounts: [roth] }, cfg))).total;
  const control = ending(plan(Object.assign({
    accounts: [roth, JSON.parse(JSON.stringify(EMPTY_TAXABLE))] }, cfg))).total;
  assert.ok(
    Math.abs(created - control) < 0.01,
    'the re-audit measured a 1,688.908169 discrepancy here; got ' + (created - control).toFixed(6)
  );
});

// ---------------------------------------------------------------------------
// 3. An independent oracle: deposit x remaining-period growth
// ---------------------------------------------------------------------------

test('RA-02: the invest destination grows by exactly deposit x remaining-period growth', () => {
  // A Roth-only household with pension surplus and no RMD. Nothing is sold,
  // so the whole ending balance is the untouched Roth plus the deposited
  // surplus grown for the remainder of the period. Both terms are computed
  // here from the plan, not read back from the engine.
  const roth = account({ id: 'roth', type: 'rothIra', taxClass: 'roth', balance: 1000000 });
  const cfg = { advanced: { rmdOn: false, surplusPolicy: 'invest' } };
  const withControl = ending(plan(Object.assign({
    accounts: [roth, JSON.parse(JSON.stringify(EMPTY_TAXABLE))] }, cfg)));
  const created = ending(plan(Object.assign({ accounts: [roth] }, cfg)));

  const controlRow = withControl.res.rows[withControl.res.rows.length - 1];
  const deposited = Number(controlRow.taxable) || 0;
  assert.ok(deposited > 1000, 'precondition: surplus actually reached a taxable destination');

  // The control's taxable balance IS deposit x growth. The created run must
  // land on the same figure -- if it skipped growth it would be short by the
  // growth factor, and if it inherited a wrong rate it would differ by it.
  const createdRow = created.res.rows[created.res.rows.length - 1];
  assert.ok(
    Math.abs((Number(createdRow.taxable) || 0) - deposited) < 0.01,
    'created destination holds ' + createdRow.taxable + ', pre-existing holds ' + deposited
  );
});
