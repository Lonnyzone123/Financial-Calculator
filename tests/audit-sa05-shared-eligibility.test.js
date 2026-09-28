'use strict';

/**
 * SA-05 (SPRINT_EXTERNAL_AUDIT_20260909.md) -- THE UI's CONTRIBUTION
 * WARNINGS DISAGREE WITH THE CORRECTED ENGINE.
 *
 * R2-T04 gave `auditContributions()` an optional `ownerEligible` argument
 * and made `simulatePlan()` supply the corrected work-window flags. The
 * argument defaults to "both owners eligible" so that existing callers keep
 * working -- and that default is exactly the pre-fix behaviour.
 *
 * Both UI callers still omit it:
 *
 *   - `renderAccountSummary()` prints "N warnings" / "Within limits"
 *   - `renderWarnings()` recomputes the audit and concatenates ITS warnings
 *     with the engine's own `limitWarnings`
 *
 * So in the retired-spouse / working-self fixture the engine deposits the
 * full $8,750 and reports NO contribution-limit warning, while the account
 * summary still shows "1 warning" -- the stale warning being that the
 * working self exceeds the HSA limit by $7,750, which is precisely the
 * defect R2-T04 removed.
 *
 * The repair is to share one eligibility calculation rather than have the
 * UI recompute it with omitted arguments. `ownerContributionEligibility()`
 * lives in the engine, is used by `simulatePlan()` itself, and is called by
 * both UI consumers on the same time basis.
 *
 * Boundary: the engine's existing owner work proxy and shared stop clock are
 * preserved exactly, including the convention that `employment.contributionStop`
 * is compared against the SELF's age for both owners. No new regulatory
 * eligibility rule is introduced.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs');
const defaultPlan = extractDefaultPlan(shell);

const REQUEST = 8750;

function hsaAccount(id, owner, priority) {
  return {
    id: id, name: id, type: 'hsa', taxClass: 'hsa', owner: owner, balance: 0,
    contribution: REQUEST, contributionMode: 'amount', priority: priority, basisPct: 0,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  };
}

/** The R2-T04 fixture: self 60 and working, spouse 70 and long retired,
 *  shared retire/contribution-stop age 65, married filing jointly. */
function household(overrides) {
  overrides = overrides || {};
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.id = 'sa05';
  p.accounts = [hsaAccount('spouseHSA', 'spouse', 1), hsaAccount('selfHSA', 'self', 2)];
  p.profile.age = 60;
  p.profile.spouseAge = 70;
  p.profile.spouseOn = true;
  p.profile.retireAge = 65;
  p.profile.endAge = 61;
  p.profile.filing = 'mfj';
  p.employment.salary = 100000;
  p.employment.spouseSalary = 0;
  p.employment.growth = 0;
  p.employment.contributionStop = 65;
  p.limitPolicy = 'prevent';
  p.assumptions.method = 'simple';
  p.assumptions.returnRate = 0;
  p.assumptions.inflation = 0;
  p.advanced.rmdOn = false;
  p.advanced.healthOn = false;
  p.advanced.ltcOn = false;
  Object.assign(p.profile, overrides.profile || {});
  Object.assign(p.employment, overrides.employment || {});
  return p;
}

test('SA-05: the shared eligibility helper exists and is exported for both the engine and its UI consumers', () => {
  assert.equal(typeof engine.ownerContributionEligibility, 'function',
    'a helper the UI cannot call is not shared');
});

test('SA-05: the helper reproduces the engine\'s own work-window proxy exactly', () => {
  const p = household();
  const e = engine.ownerContributionEligibility(p, p.profile.age, p.profile.spouseAge, 1);
  assert.deepEqual(e, { self: true, spouse: false },
    'self 60 is inside the window (retire 65, stop 65); spouse 70 is past it');
});

test('SA-05: the helper honours the shared stop clock and the retirement age independently', () => {
  // Past the shared contribution-stop age: nobody is eligible, even though
  // the spouse would still be under the retirement age.
  const stopped = household({ profile: { age: 66, spouseAge: 60, retireAge: 70 }, employment: { contributionStop: 65 } });
  assert.deepEqual(engine.ownerContributionEligibility(stopped, stopped.profile.age, stopped.profile.spouseAge, 1),
    { self: false, spouse: false },
    'the stop clock is shared and is compared against the self age for both owners -- the existing convention');

  // Both inside the window.
  const both = household({ profile: { age: 60, spouseAge: 60 } });
  assert.deepEqual(engine.ownerContributionEligibility(both, both.profile.age, both.profile.spouseAge, 1),
    { self: true, spouse: true });

  // Spouse mode off: the spouse is never eligible.
  const single = household({ profile: { spouseOn: false, spouseAge: 60 } });
  assert.equal(engine.ownerContributionEligibility(single, single.profile.age, single.profile.spouseAge, 1).spouse, false);
});

test('SA-05: eligibility is a boolean, so it does not depend on the period length used to derive it', () => {
  const p = household();
  const full = engine.ownerContributionEligibility(p, p.profile.age, p.profile.spouseAge, 1);
  const fractional = engine.ownerContributionEligibility(p, p.profile.age, p.profile.spouseAge, 0.5);
  assert.deepEqual(full, fractional,
    'the UI uses a one-year basis and the engine a period basis; the FLAGS must agree regardless');
});

test('SA-05: the audit run with shared eligibility raises NO contribution-limit warning for this fixture -- matching what the engine actually deposits', () => {
  const p = household();
  const eligibility = engine.ownerContributionEligibility(p, p.profile.age, p.profile.spouseAge, 1);

  const stale = engine.auditContributions(p, p.profile.age, p.employment.salary, p.employment.spouseSalary);
  assert.equal(stale.warnings.length, 1,
    'precondition: the eligibility-less call is what produces the stale warning; without it this test proves nothing');

  const shared = engine.auditContributions(p, p.profile.age, p.employment.salary, p.employment.spouseSalary, eligibility);
  assert.deepEqual(shared.warnings, [],
    'with shared eligibility there is no limit violation to report: ' + JSON.stringify(shared.warnings));

  // And the engine agrees: full deposit, no limitWarnings.
  const result = engine.simulatePlan(p, null, 0, null, null);
  assert.equal(result.rows[1].hsa, REQUEST, 'the engine deposits the full amount');
  assert.deepEqual(result.limitWarnings, [], 'and reports no limit warnings');
});

test('SA-05: a genuinely excessive contribution by an ELIGIBLE owner still warns', () => {
  const p = household();
  p.accounts = [hsaAccount('selfHSA', 'self', 1)];
  p.accounts[0].contribution = 20000; // well past family base + own catch-up
  const eligibility = engine.ownerContributionEligibility(p, p.profile.age, p.profile.spouseAge, 1);
  const audit = engine.auditContributions(p, p.profile.age, p.employment.salary, p.employment.spouseSalary, eligibility);
  assert.equal(audit.warnings.length, 1, 'a real over-limit request must still be reported');
  assert.match(audit.warnings[0], /hsa limit/i);
});

test('SA-05 (reversed owners): the same holds when the SELF is the retired owner', () => {
  const p = household({ profile: { age: 70, spouseAge: 60 } });
  const eligibility = engine.ownerContributionEligibility(p, p.profile.age, p.profile.spouseAge, 1);
  assert.deepEqual(eligibility, { self: false, spouse: false },
    'the shared stop clock is measured on the self age, so a self past it stops both -- the existing convention, stated rather than changed');
});

test('SA-05 (warn and redirect policies): shared eligibility behaves consistently under every limit policy', () => {
  for (const policy of ['prevent', 'warn', 'redirect']) {
    const p = household();
    p.limitPolicy = policy;
    const eligibility = engine.ownerContributionEligibility(p, p.profile.age, p.profile.spouseAge, 1);
    const audit = engine.auditContributions(p, p.profile.age, p.employment.salary, p.employment.spouseSalary, eligibility);
    assert.deepEqual(audit.warnings, [], policy + ': no warning should be raised for this fixture');
    const spouseItem = audit.items.filter(function (i) { return i.account.id === 'spouseHSA'; })[0];
    assert.equal(spouseItem.allowed, 0, policy + ': the ineligible owner is allocated nothing under every policy');
    assert.equal(spouseItem.excess, 0, policy + ': and generates no phantom excess');
  }
});

test('SA-05: both UI consumers pass the shared eligibility -- neither still calls the engine with it omitted', () => {
  // Source-level assertion, because these two call sites are the defect
  // itself: a call missing the 5th argument silently reverts to the
  // pre-R2-T04 all-owners-eligible behaviour.
  const calls = shell.match(/auditContributions\([^;]*?\)/g) || [];
  const uiCalls = calls.filter(function (c) { return c.indexOf('p.profile.age') !== -1; });
  assert.ok(uiCalls.length >= 2, 'expected to find both UI call sites, found ' + uiCalls.length);
  for (const call of uiCalls) {
    assert.ok(/ownerContributionEligibility/.test(call),
      'a UI caller still omits eligibility and will disagree with the engine: ' + call);
  }
});

test('SA-05: the new helper is registered for Worker serialization -- an engine helper missing from that list breaks the background path', () => {
  const listMatch = shell.match(/var workerFunctions=\[([^\]]*)\]/);
  assert.ok(listMatch, 'could not locate buildWorkerSource()\'s function list');
  assert.ok(listMatch[1].indexOf('ownerContributionEligibility') !== -1,
    'ownerContributionEligibility is used inside simulatePlan() but is not serialized into the Worker');
});
