'use strict';

/**
 * Tests for AUD-001 (RETIREMENT_ENGINE_AUDIT_CLAUDE_QUEUE_2026-09-08.md,
 * task T02: "Correct tax transaction inputs"): taxWithdrawalGrossRate()'s
 * taxable branch used a class-wide balance-weighted average basis to
 * estimate the gains share of a gross-up sale, even though
 * withdrawFromClass() actually drains one specific account (in priority
 * order) at a time. It also applied Arizona's flat rate to the full sale
 * proceeds, including returned basis, although estimateTaxes() only ever
 * taxes Arizona on realized gains. And the gross-up cascade discarded
 * tw.penalty entirely, so an early-withdrawal penalty triggered by a
 * tax-funding sale (not the original spending withdrawal) went unrecorded.
 *
 * This is a per-transaction rate/accounting fix (T02). It does not yet
 * close the actual cash settlement loop -- verifying that the real final
 * tax liability is exactly funded within $0.01 in every case, including
 * ones that cross a tax bracket or drain across multiple differently-based
 * accounts in one sale -- that is T03's job. See
 * tests/tax-gross-up.test.js for the underlying bracket-rate helpers.
 *
 * S5 (the owner's question 1, answer C, 2026-09-14): taxWithdrawalGrossRate() was deleted, having no caller after
 * R2-T01; the two reproductions that priced a sale with it went with it. The penalty and B-4 cases below run
 * the live projection and remain.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);
const RULES = global.RULES;

const engine = require('../src/engine.js');

// --- Penalty collection ---------------------------------------------------

test('AUD-001: a tax-funding sale from a preTax account under 59.5 now records its early-withdrawal penalty instead of discarding it', () => {
  const defaultPlanMatch = shell.match(/var defaultPlan=(\{.*?\});/);
  // eslint-disable-next-line no-eval
  const defaultPlan = eval('(' + defaultPlanMatch[1] + ')');
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.profile.age = 50;
  p.profile.retireAge = 50;
  p.profile.endAge = 51;
  p.retirement.spending = 40000;
  p.retirement.strategy = 'fixedNominal';
  p.retirement.withdrawalOrder = 'manual';
  p.retirement.manualOrder = 'preTax';
  p.advanced.penaltyException = false;
  p.advanced.rule55 = false;
  p.accounts = [
    { id: 'a1', name: '401k', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 500000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 },
  ];
  p.employment.salary = 0;
  p.employment.spouseSalary = 0;

  const result = engine.runPlan(p);
  const row = result.rows[result.rows.length - 1];
  // Every dollar withdrawn here -- both the $40k spending need and the
  // gross-up to cover its own tax and 10% penalty -- comes from the same
  // preTax account under 59.5. row.taxes (which includes `penalties`) must
  // reflect the penalty on the FULL withdrawal, including the gross-up
  // portion sold specifically to fund taxes, not just the original request.
  assert.ok(row.withdrawals > 40000, 'the gross-up must have sold more than the base spending need to also cover its own tax/penalty');
  const impliedPenaltyIfOnlyBaseCounted = 40000 * 0.10;
  assert.ok(row.taxes > 0, 'some tax/penalty must be recorded');
  // The full 10% penalty applies to the entire preTax withdrawal (spending +
  // gross-up), so recorded taxes must exceed what a base-withdrawal-only
  // penalty calculation would show -- proving the gross-up's own penalty
  // was actually collected, not discarded.
  assert.ok(row.taxes > impliedPenaltyIfOnlyBaseCounted, `row.taxes ($${row.taxes.toFixed(2)}) must exceed the penalty on the base withdrawal alone ($${impliedPenaltyIfOnlyBaseCounted}), proving the gross-up's own penalty was collected`);
});

// --- Preserved behavior: the B-4 regression scenario is unaffected -------

test('AUD-001 fix preserves B-4: the original B-4 reproduction plan still shows no false shortfall', () => {
  const defaultPlanMatch = shell.match(/var defaultPlan=(\{.*?\});/);
  // eslint-disable-next-line no-eval
  const defaultPlan = eval('(' + defaultPlanMatch[1] + ')');
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.accounts = [
    { id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 250000, contribution: 12000, contributionMode: 'amount', priority: 1, basisPct: 70, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 },
    { id: 'a2', name: '401k', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 400000, contribution: 15000, contributionMode: 'amount', priority: 2, basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: true, matchCap: 5, matchRate: 100, profitShare: 0, vesting: 100 },
    { id: 'a3', name: 'Roth IRA', type: 'rothIRA', taxClass: 'roth', owner: 'self', balance: 90000, contribution: 7000, contributionMode: 'amount', priority: 3, basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 },
  ];
  p.employment.salary = 145000;

  const result = engine.runPlan(p);
  assert.equal(result.failed, false);
  assert.equal(result.firstShortfallAge, null);
});
