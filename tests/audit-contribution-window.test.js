'use strict';

/**
 * Tests for AUD-005 (RETIREMENT_ENGINE_AUDIT_CLAUDE_QUEUE_2026-09-08.md,
 * task T06): contributionDuration used to be a single value shared by every
 * account, capped only by the shared contributionStop age -- never
 * intersected with whether that account's OWNER was actually still working.
 * A dollar-mode contribution (unlike a salary-percent one, which happens to
 * zero itself out at $0 salary) kept flowing past retirement whenever
 * contributionStop was set later than retireAge.
 *
 * The one test that runs the engine's internal simulation directly lives in
 * tests/audit-contribution-window-internals.test.js, split out at S5 block 2r, so this file reaches the engine
 * only through runPlan().
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

const defaultPlanMatch = shell.match(/var defaultPlan=(\{.*?\});/);
// eslint-disable-next-line no-eval
const defaultPlan = eval('(' + defaultPlanMatch[1] + ')');

function dollarAccount(overrides = {}) {
  return Object.assign({
    id: 'a1', name: 'Account', type: 'traditional401k', taxClass: 'preTax', owner: 'self',
    balance: 100000, contribution: 12000, contributionMode: 'amount', priority: 1, basisPct: 0,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }, overrides);
}

function planFor(profileOverrides, employmentOverrides, accounts) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.assumptions.returnRate = 0;
  p.assumptions.method = 'simple';
  Object.assign(p.profile, profileOverrides);
  Object.assign(p.employment, employmentOverrides);
  p.accounts = accounts;
  return p;
}

test('AUD-005/T06 reproduction: a retired self (retireAge=55, contributionStop=65) receives zero dollar contributions at age 60', () => {
  const p = planFor(
    { age: 60, retireAge: 55, endAge: 61 },
    { salary: 100000, contributionStop: 65 },
    [dollarAccount()],
  );
  const result = engine.runPlan(p);
  const row = result.rows[1]; // the age-61 row, covering the full 60-61 working... retired year
  assert.equal(row.contributions, 0, `expected zero contributions from a self already retired for the whole row, got ${row.contributions}`);
});

test('AUD-005/T06: retirement exactly mid-row (60.5) allows only the working half-year of the dollar contribution', () => {
  const p = planFor(
    { age: 60, retireAge: 60.5, endAge: 61 },
    { salary: 100000, contributionStop: 65 },
    [dollarAccount()],
  );
  const result = engine.runPlan(p);
  const row = result.rows[1];
  assert.ok(Math.abs(row.contributions - 6000) < 0.01, `expected half of the $12,000 annual contribution ($6,000) for a half-year of work, got ${row.contributions}`);
});

test('AUD-005/T06: a spouse-owned account uses the SPOUSE\'s own work timing, independent of self\'s retirement', () => {
  const p = planFor(
    { age: 60, retireAge: 55, spouseOn: true, spouseAge: 50, endAge: 61 }, // self retired; spouse (50) still years from retiring
    { salary: 0, spouseSalary: 120000, contributionStop: 65 },
    [dollarAccount({ owner: 'spouse' })],
  );
  const result = engine.runPlan(p);
  const row = result.rows[1];
  assert.ok(Math.abs(row.contributions - 12000) < 0.01, `spouse still working must receive the full $12,000 contribution even though self is retired, got ${row.contributions}`);
});

// Fixture corrected 2026-09-09 (R2-T04, test gap TG-R2-04). This test was
// titled "spouse already retired" but set spouseAge 62 against the shared
// retireAge of 65 -- so BOTH owners were still working and the title
// described a state the fixture never reached. Its own inline comment
// admitted as much. spouseAge is now 70, genuinely past the shared retire
// age, so the assertion finally tests what the title claims. The
// shared-HSA-limit interaction the same gap called for lives in
// tests/audit-r2-contribution-limits.test.js.
test('AUD-005/T06: reversed -- self still working, spouse already retired, self\'s own account is unaffected by spouse\'s retirement', () => {
  const p = planFor(
    { age: 55, retireAge: 65, spouseOn: true, spouseAge: 70, endAge: 56 }, // self working (55 < 65); spouse genuinely past the shared retire age
    { salary: 100000, contributionStop: 70 },
    [dollarAccount({ owner: 'self' })],
  );
  const result = engine.runPlan(p);
  const row = result.rows[1];
  assert.ok(Math.abs(row.contributions - 12000) < 0.01, `self still working must receive the full contribution, got ${row.contributions}`);
});

test('AUD-005/T06: stop-before-retirement is unaffected -- contributions correctly end at the earlier contributionStop age, not retirement', () => {
  const p = planFor(
    { age: 49, retireAge: 65, endAge: 51 }, // contributionStop (50) falls well before retirement (65)
    { salary: 100000, contributionStop: 50 },
    [dollarAccount()],
  );
  const result = engine.runPlan(p);
  const beforeStop = result.rows[1]; // age 49-50: still before contributionStop
  const afterStop = result.rows[2]; // age 50-51: past contributionStop, still working
  assert.ok(Math.abs(beforeStop.contributions - 12000) < 0.01, `expected the full contribution before the stop age, got ${beforeStop.contributions}`);
  assert.equal(afterStop.contributions, 0, `expected zero contributions after the stop age even though still working (unaffected regression), got ${afterStop.contributions}`);
});

test('AUD-005/T06: salary-percent contributions (which already self-zeroed at $0 salary) are unaffected -- still zero for a retired self', () => {
  const p = planFor(
    { age: 60, retireAge: 55, endAge: 61 },
    { salary: 100000, contributionStop: 65 },
    [dollarAccount({ contributionMode: 'salaryPct', contribution: 10 })],
  );
  const result = engine.runPlan(p);
  const row = result.rows[1];
  assert.equal(row.contributions, 0, `expected zero (as before this fix -- salary is $0 while retired), got ${row.contributions}`);
});

test('AUD-005/T06: employer match scales with the SAME owner-specific duration as the employee contribution, not the old shared one', () => {
  const p = planFor(
    { age: 60, retireAge: 60.5, endAge: 61 },
    { salary: 100000, contributionStop: 65 },
    [dollarAccount({ matchOn: true, matchCap: 5, matchRate: 100 })],
  );
  const result = engine.runPlan(p);
  const row = result.rows[1];
  // Employee: $6,000 (half of $12,000). Employer match should also be scaled to
  // the half-year, not computed as if the full year had been worked.
  const fullYearPlan = planFor(
    { age: 60, retireAge: 61, endAge: 61 },
    { salary: 100000, contributionStop: 65 },
    [dollarAccount({ matchOn: true, matchCap: 5, matchRate: 100 })],
  );
  const fullYearRow = engine.runPlan(fullYearPlan).rows[1];
  const halfYearTotal = row.contributions; // employee + employer combined field
  const fullYearTotal = fullYearRow.contributions;
  assert.ok(halfYearTotal > 0 && halfYearTotal < fullYearTotal, `half-year total contributions (${halfYearTotal}) must be positive but less than a full working year's (${fullYearTotal})`);
  assert.ok(Math.abs(halfYearTotal - fullYearTotal / 2) < 1, `expected roughly half the full-year total (employee + matched employer scale together), got ${halfYearTotal} vs half of ${fullYearTotal}`);
});

test('AUD-005/T06: the redirect excess policy still works correctly with owner-specific durations', () => {
  const overLimitAccount = dollarAccount({
    id: 'ira', type: 'traditionalIRA', taxClass: 'preTax', contribution: 999999, contributionMode: 'amount',
  });
  const taxableAccount = { id: 'brokerage', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 0, contribution: 0, contributionMode: 'amount', priority: 2, basisPct: 100, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 };
  const p = planFor(
    { age: 60, retireAge: 60.5, endAge: 61 },
    { salary: 100000, contributionStop: 65 },
    [overLimitAccount, taxableAccount],
  );
  p.limitPolicy = 'redirect';
  const result = engine.runPlan(p);
  const row = result.rows[1];
  // With a half-year work duration, the excess redirected to the taxable
  // account must also reflect only the half-year's worth, not a full year's.
  assert.ok(row.taxable > 0, `expected some excess redirected to the taxable account, got taxable=${row.taxable}`);
  const fullYearP = planFor(
    { age: 60, retireAge: 61, endAge: 61 },
    { salary: 100000, contributionStop: 65 },
    [overLimitAccount, taxableAccount],
  );
  fullYearP.limitPolicy = 'redirect';
  const fullYearRow = engine.runPlan(fullYearP).rows[1];
  assert.ok(row.taxable < fullYearRow.taxable, `half-year redirected excess (${row.taxable}) must be less than a full year's (${fullYearRow.taxable})`);
});
