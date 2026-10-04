'use strict';
const { retireAtEnd } = require('./lib/working-horizon'); // S5AA R53 (the owner's decision 3, 2026-10-04): working-only horizons

/**
 * R2-T04 / R2-005 -- OWNER ELIGIBILITY MUST BE APPLIED BEFORE SHARED
 * CONTRIBUTION ALLOCATION.
 *
 * `auditContributions()` allocates the shared family HSA base across every
 * account in priority order. `simulatePlan()` then drops zero-duration
 * items -- i.e. accounts whose OWNER is no longer working -- but only
 * AFTER that allocation has already happened. An inactive owner therefore
 * consumes room they can never use, and the active owner is squeezed out
 * of room they are entitled to.
 *
 * The audit's direct allocation trace, reproduced exactly by the control
 * test below: self age 60 working to 65, spouse age 70 retired, married
 * filing jointly, shared contribution-stop age 65, `prevent` limit policy,
 * spouse HSA first in priority and self HSA second, each requesting
 * $8,750. The retired spouse is allocated the whole $8,750 family base and
 * deposits nothing; the working self is left only the $1,000 age-55
 * catch-up allowance and deposits $1,000 instead of the $8,750 they are
 * entitled to. The $7,750 difference is then recorded as EXCESS on the
 * active account -- so under `redirect` policy it is diverted into taxable
 * savings, a second wrong outcome layered on the first.
 *
 * Note the asymmetry that makes this HSA-specific: workplace and IRA
 * limits are keyed per owner (`group + ":" + owner`), so one owner cannot
 * consume another's room there. The HSA family base is the only genuinely
 * shared pool, which is why R2-005 shows up here and nowhere else.
 *
 * FIX BOUNDARY, per the audit: effective owner eligibility is determined
 * BEFORE shared-limit allocation, and a zero-duration request consumes
 * zero room and generates no phantom excess. Catch-up amounts, annual
 * proration, employer match and the warn/prevent/redirect conventions are
 * all unchanged, and no new HSA or Medicare eligibility law is introduced
 * -- eligibility here means exactly what `simulatePlan()` already meant by
 * it, the existing simplified owner work-window proxy, computed once and
 * used consistently.
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

const HSA_FAMILY_BASE = 8750;   // RULES.retirement.hsa.family
const HSA_CATCHUP = 1000;       // RULES.retirement.hsa.catchup, from age 55
const REQUEST = 8750;

function hsaAccount(id, owner, priority, contribution) {
  return {
    id: id, name: id, type: 'hsa', taxClass: 'hsa', owner: owner, balance: 0,
    contribution: contribution === undefined ? REQUEST : contribution,
    contributionMode: 'amount', priority: priority, basisPct: 0, annualChange: 0,
    annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  };
}

function taxableAccount(priority) {
  return {
    id: 'brokerage', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 0, contribution: 0, contributionMode: 'amount', priority: priority, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  };
}

/** The audit's exact household: self 60 and working, spouse 70 and long
 *  retired, shared retire/contribution-stop age 65, married filing
 *  jointly. Returns are zeroed so every balance below is pure cash flow. */
function household(accounts, overrides) {
  overrides = overrides || {};
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.id = 'r2-005';
  p.accounts = accounts;
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
  p.assumptions.fee = 0;
  p.advanced.rmdOn = false;
  p.advanced.healthOn = false;
  p.advanced.ltcOn = false;
  p.advanced.conversionOn = false;
  p.advanced.transferOn = false;
  p.advanced.reserveOn = false;
  p.advanced.bondTentOn = false;
  p.advanced.assetsOn = false;
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  Object.assign(p.profile, overrides.profile || {});
  Object.assign(p.employment, overrides.employment || {});
  if (overrides.limitPolicy) p.limitPolicy = overrides.limitPolicy;
  retireAtEnd(p); // S5AA R53: an end age before the retirement age is refused; the owner retires at the end age instead (output-neutral, tests/lib/working-horizon.js)
  return p;
}

function byId(items, id) {
  return items.filter(function (i) { return i.account.id === id; })[0];
}

/** The eligibility simulatePlan() itself derives for this household:
 *  the self is inside the work window, the spouse is past it. */
const SELF_ONLY = { self: true, spouse: false };

// =====================================================================
// Direct-helper allocation.
// =====================================================================

test('R2-005 (control): the defect reproduces exactly as the audit traced it -- the retired spouse consumes the whole $8,750 family base and the working self is left $1,000', () => {
  // S5AA R43 (the owner's ruling of 2026-09-30): HSA contributions stop at 65, so an owner of 70 can no longer take the base. The
  // spouse here is 64, which keeps this test about the shared base and nothing else.
  const p = household([hsaAccount('spouseHSA', 'spouse', 1), hsaAccount('selfHSA', 'self', 2)], { profile: { spouseAge: 64 } });
  const audit = engine.auditContributions(p, 60, 100000, 0);
  assert.equal(byId(audit.items, 'spouseHSA').allowed, HSA_FAMILY_BASE);
  assert.equal(byId(audit.items, 'selfHSA').allowed, HSA_CATCHUP);
  assert.equal(byId(audit.items, 'selfHSA').excess, REQUEST - HSA_CATCHUP);
});

test('R2-005: with owner eligibility applied, the INACTIVE owner consumes zero shared room and the ACTIVE owner receives the full $8,750', () => {
  const p = household([hsaAccount('spouseHSA', 'spouse', 1), hsaAccount('selfHSA', 'self', 2)]);
  const audit = engine.auditContributions(p, 60, 100000, 0, SELF_ONLY);
  const spouse = byId(audit.items, 'spouseHSA');
  const self = byId(audit.items, 'selfHSA');
  assert.equal(spouse.allowed, 0, 'the inactive owner must be allocated nothing; got ' + spouse.allowed);
  assert.equal(self.allowed, REQUEST,
    'the active owner must receive the full requested $8,750; got ' + self.allowed);
});

test('R2-005: an inactive owner generates NO phantom excess -- neither on their own account nor pushed onto the active one', () => {
  const p = household([hsaAccount('spouseHSA', 'spouse', 1), hsaAccount('selfHSA', 'self', 2)]);
  const audit = engine.auditContributions(p, 60, 100000, 0, SELF_ONLY);
  assert.equal(byId(audit.items, 'spouseHSA').excess, 0, 'an ineligible request is not an over-limit request');
  assert.equal(byId(audit.items, 'selfHSA').excess, 0, 'the active owner is within their limit and must show no excess');
});

test('R2-005: no over-limit WARNING is raised for a request that was never eligible in the first place', () => {
  const p = household([hsaAccount('spouseHSA', 'spouse', 1), hsaAccount('selfHSA', 'self', 2)]);
  const audit = engine.auditContributions(p, 60, 100000, 0, SELF_ONLY);
  assert.deepEqual(audit.warnings, [],
    'expected no warnings, got ' + JSON.stringify(audit.warnings));
});

test('R2-005: the result does not depend on PRIORITY ORDER -- the active owner gets the full amount whether they are listed first or second', () => {
  const spouseFirst = engine.auditContributions(
    household([hsaAccount('spouseHSA', 'spouse', 1), hsaAccount('selfHSA', 'self', 2)]), 60, 100000, 0, SELF_ONLY);
  const selfFirst = engine.auditContributions(
    household([hsaAccount('selfHSA', 'self', 1), hsaAccount('spouseHSA', 'spouse', 2)]), 60, 100000, 0, SELF_ONLY);
  assert.equal(byId(spouseFirst.items, 'selfHSA').allowed, REQUEST);
  assert.equal(byId(selfFirst.items, 'selfHSA').allowed, REQUEST);
  assert.equal(byId(spouseFirst.items, 'spouseHSA').allowed, 0);
  assert.equal(byId(selfFirst.items, 'spouseHSA').allowed, 0);
});

test('R2-005 (reversed owners): when it is the SELF who is inactive, the working spouse gets the full amount', () => {
  // S5AA R43 (the owner's ruling of 2026-09-30): HSA contributions stop at 65, so an owner of 70 can no longer take the base. The
  // spouse here is 64, which keeps this test about the shared base and nothing else.
  const p = household([hsaAccount('selfHSA', 'self', 1), hsaAccount('spouseHSA', 'spouse', 2)], { profile: { spouseAge: 64 } });
  const audit = engine.auditContributions(p, 60, 0, 100000, { self: false, spouse: true });
  assert.equal(byId(audit.items, 'selfHSA').allowed, 0);
  assert.equal(byId(audit.items, 'spouseHSA').allowed, REQUEST);
});

test('R2-005 (both active): two eligible owners still share ONE family base -- the accepted pooled-limit behavior is unchanged', () => {
  // S5AA R43 (the owner's ruling of 2026-09-30): HSA contributions stop at 65, so an owner of 70 can no longer take the base. The
  // spouse here is 64, which keeps this test about the shared base and nothing else.
  const p = household([hsaAccount('spouseHSA', 'spouse', 1), hsaAccount('selfHSA', 'self', 2)], { profile: { spouseAge: 64 } });
  const audit = engine.auditContributions(p, 60, 100000, 100000, { self: true, spouse: true });
  assert.equal(byId(audit.items, 'spouseHSA').allowed, HSA_FAMILY_BASE,
    'the first eligible owner still takes the shared base');
  assert.equal(byId(audit.items, 'selfHSA').allowed, HSA_CATCHUP,
    'the second eligible owner still gets only their own catch-up room -- this is a real shared limit, not a per-owner one');
});

test('R2-005 (backward compatibility): omitting the eligibility argument leaves every existing caller\'s behavior identical', () => {
  const p = household([hsaAccount('spouseHSA', 'spouse', 1), hsaAccount('selfHSA', 'self', 2)]);
  const withoutArg = engine.auditContributions(p, 60, 100000, 100000);
  const bothEligible = engine.auditContributions(p, 60, 100000, 100000, { self: true, spouse: true });
  assert.deepEqual(withoutArg.items.map(function (i) { return [i.account.id, i.requested, i.allowed, i.excess]; }),
    bothEligible.items.map(function (i) { return [i.account.id, i.requested, i.allowed, i.excess]; }));
  assert.deepEqual(withoutArg.warnings, bothEligible.warnings);
});

test('R2-005: catch-up room is still per owner -- an inactive owner freeing the base does not also hand over their catch-up allowance', () => {
  // The active self requests more than base + their own catch-up. They may
  // take the whole family base and their own $1,000, and no more -- the
  // inactive spouse's unused catch-up room is not transferable.
  const p = household([hsaAccount('spouseHSA', 'spouse', 1), hsaAccount('selfHSA', 'self', 2, 20000)]);
  const audit = engine.auditContributions(p, 60, 100000, 0, SELF_ONLY);
  assert.equal(byId(audit.items, 'selfHSA').allowed, HSA_FAMILY_BASE + HSA_CATCHUP,
    'expected base + own catch-up only; got ' + byId(audit.items, 'selfHSA').allowed);
  assert.equal(byId(audit.items, 'selfHSA').excess, 20000 - (HSA_FAMILY_BASE + HSA_CATCHUP),
    'a genuinely over-limit request by an ELIGIBLE owner must still report real excess');
});

test('R2-005 (warn policy): an ineligible owner is still allocated zero -- eligibility is a work-window gate, not a limit, so "warn" does not waive it', () => {
  const p = household([hsaAccount('spouseHSA', 'spouse', 1), hsaAccount('selfHSA', 'self', 2)], { limitPolicy: 'warn' });
  const audit = engine.auditContributions(p, 60, 100000, 0, SELF_ONLY);
  assert.equal(byId(audit.items, 'spouseHSA').allowed, 0,
    'under warn policy the ineligible owner must still be allocated zero -- simulatePlan() deposits nothing for them either way, and audit.items must agree with what actually happens');
  assert.equal(byId(audit.items, 'selfHSA').allowed, REQUEST);
});

// =====================================================================
// Integration -- deposits and the false redirect.
// =====================================================================

test('R2-005 (integration): the working owner actually DEPOSITS $8,750 and the retired owner deposits nothing', () => {
  const p = household([hsaAccount('spouseHSA', 'spouse', 1), hsaAccount('selfHSA', 'self', 2)]);
  const result = engine.simulatePlan(p, null, 0, null, null);
  const row = result.rows[1];
  assert.equal(row.hsa, REQUEST,
    'the household\'s HSA balance after one year should be the active owner\'s full $8,750; got ' + row.hsa);
  assert.equal(row.contributions, REQUEST,
    'total contributions should be exactly the one eligible deposit; got ' + row.contributions);
});

test('R2-005 (integration, redirect policy): the $7,750 phantom excess is NOT diverted into taxable savings', () => {
  const p = household(
    [hsaAccount('spouseHSA', 'spouse', 1), hsaAccount('selfHSA', 'self', 2), taxableAccount(3)],
    { limitPolicy: 'redirect' });
  const result = engine.simulatePlan(p, null, 0, null, null);
  const row = result.rows[1];
  assert.equal(row.taxable, 0,
    'no excess exists to redirect, but $' + row.taxable + ' landed in taxable savings');
  assert.equal(row.hsa, REQUEST, 'the eligible deposit itself must be unaffected; got ' + row.hsa);
});

test('R2-005 (integration, both active): a household where both owners are working is completely unchanged', () => {
  const p = household(
    [hsaAccount('spouseHSA', 'spouse', 1), hsaAccount('selfHSA', 'self', 2)],
    { profile: { spouseAge: 60 }, employment: { spouseSalary: 100000 } });
  const result = engine.simulatePlan(p, null, 0, null, null);
  assert.equal(result.rows[1].hsa, HSA_FAMILY_BASE + HSA_CATCHUP,
    'two working owners share the base and add one catch-up; got ' + result.rows[1].hsa);
});

test('R2-005 (partial duration): an owner who stops contributing PART-way through the period keeps the accepted proration -- eligibility is not an all-or-nothing round-down', () => {
  // Shared contribution-stop age 64.5 with the self at 64.0 gives the self
  // exactly half a period of eligibility. Retirement age is pushed out so
  // the work window itself is not what truncates them. (S5AA R43: this read 65.0 and 65.5 until the owner's ruling
  // of 2026-09-30 stopped HSA contributions at 65; a year earlier keeps the test about the stop age.)
  const p = household(
    [hsaAccount('spouseHSA', 'spouse', 1), hsaAccount('selfHSA', 'self', 2)],
    { profile: { age: 64, endAge: 65, retireAge: 70 }, employment: { contributionStop: 64.5 } });
  const result = engine.simulatePlan(p, null, 0, null, null);
  assert.equal(result.rows[1].hsa, REQUEST * 0.5,
    'expected half a period of the full $8,750; got ' + result.rows[1].hsa);
});
