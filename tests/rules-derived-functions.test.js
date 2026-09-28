'use strict';

// Track B, L2 -- unit tests for four more calculator-native functions with
// no prior isolated coverage: rmdStartAge/rmdFor (required minimum
// distributions), ssaBenefitAtClaim (Social Security benefit at a given
// claim age, including the advanced PIA/AIME path), irmaaMonthly (Medicare
// surcharge tiers), and contributionLimit (401k/IRA/HSA annual limits).
//
// Every expected value here is computed independently FROM the actual
// embedded RULES data read at test time (not hardcoded, and not by calling
// the function under test a second time) -- the same oracle discipline
// this project already applies to the ported modules, just against this
// project's own 2026 rules data instead of a Python reference.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);
const RULES = global.RULES;

const engine = require('../src/engine.js');

// ---------------------------------------------------------------------------
// rmdStartAge / rmdFor
// ---------------------------------------------------------------------------

test('rmdStartAge: selects the correct birth-year band', () => {
  assert.equal(engine.rmdStartAge({ profile: { age: 2026 - 1960 } }), RULES.retirement.rmd.birth1960OrLaterAge, 'birth year 1960 (>= 1960 band)');
  assert.equal(engine.rmdStartAge({ profile: { age: 2026 - 1959 } }), RULES.retirement.rmd.startAge.records.find((r) => r.provision_id === 'rmd_start_age_born_1959').value, 'birth year 1959 (exact match band)');
  assert.equal(engine.rmdStartAge({ profile: { age: 2026 - 1958 } }), RULES.retirement.rmd.birth1951To1958Age, 'birth year 1958 (else band)');
});

/* S5AA task 4.2 (Q90, F4, N2, G18): rmdFor() RETURNS AN OBJECT, `{total, obligations}`. That is the
   contract the spec invariant ACCOUNT-18-8 states in as many words -- a required distribution is
   computed per plan, so an IRA's cannot be taken from a 401(k), and a single number cannot say which
   plan owes what. Reading `.total` here is the same claim these three tests always made, and each now
   also pins the obligation LIST, because the total alone can no longer distinguish a household that
   owes one plan $40,650 from one that owes two plans $20,325 each. */
test('rmdFor: returns 0 when RMDs are toggled off, regardless of age', () => {
  const p = { advanced: { rmdOn: false }, profile: { age: 60 } };
  const accounts = [{ taxClass: 'preTax', balance: 1000000 }];
  const rmd = engine.rmdFor(accounts, 80, p, undefined);
  assert.equal(rmd.total, 0);
  assert.deepEqual(rmd.obligations, [], 'nothing is owed, so nothing is owed BY anything');
});

test('rmdFor: returns 0 before the plan\'s own RMD start age, then the correct divisor at and after it', () => {
  const p = { advanced: { rmdOn: true }, profile: { age: 60 } }; // birth year 1966 -> start age 75
  const start = engine.rmdStartAge(p);
  assert.equal(start, RULES.retirement.rmd.birth1960OrLaterAge);
  const accounts = [{ taxClass: 'preTax', balance: 1230000 }, { taxClass: 'roth', balance: 500000 }];

  const before = engine.rmdFor(accounts, start - 1, p, undefined);
  assert.equal(before.total, 0, 'one year before the start age');
  assert.deepEqual(before.obligations, [], 'and no plan owes anything either');

  const divisor = RULES.retirement.rmd.uniformLifetime[String(start)];
  assert.ok(divisor, `expected a uniform lifetime table entry for age ${start}`);
  const expected = 1230000 / divisor; // only the preTax balance counts
  const at = engine.rmdFor(accounts, start, p, undefined);
  assert.ok(Math.abs(at.total - expected) < 1e-9);
  assert.equal(at.obligations.length, 1, 'one pre-tax account, so one obligation');
  assert.equal(at.obligations[0].owner, 'self');
  assert.ok(Math.abs(at.obligations[0].amount - expected) < 1e-9,
    'and the whole of it is owed by that account, which is what makes it payable only from there');
});

test('rmdFor: uses the supplied priorYearBalance instead of the live preTax total when given', () => {
  const p = { advanced: { rmdOn: true }, profile: { age: 60 } };
  const start = engine.rmdStartAge(p);
  const divisor = RULES.retirement.rmd.uniformLifetime[String(start)];
  const accounts = [{ taxClass: 'preTax', balance: 999999 }]; // must be ignored
  const expected = 500000 / divisor;
  const rmd = engine.rmdFor(accounts, start, p, 500000);
  assert.ok(Math.abs(rmd.total - expected) < 1e-9);
  assert.equal(rmd.obligations.length, 1);
  assert.ok(Math.abs(rmd.obligations[0].amount - expected) < 1e-9,
    'a pooled NUMBER is still accepted and apportioned by live share -- exact for a single account');
});

// ---------------------------------------------------------------------------
// ssaBenefitAtClaim
// ---------------------------------------------------------------------------

test('ssaBenefitAtClaim: claiming exactly at FRA applies no adjustment', () => {
  const p = { retirement: { ssBenefit: 3000, ssClaim: 67, ssFra: 67, ssAdvanced: false, aime: 0, spouseSS: 0, spouseClaim: 67 } };
  assert.equal(engine.ssaBenefitAtClaim(p, 'self'), 3000 * 12);
});

test('ssaBenefitAtClaim: early claim within 36 months uses only the first-tier monthly reduction', () => {
  const p = { retirement: { ssBenefit: 3000, ssClaim: 64, ssFra: 67, ssAdvanced: false, aime: 0, spouseSS: 0, spouseClaim: 67 } };
  const months = 36; // exactly 3 years early
  const factor = 1 - months * RULES.socialSecurity.earlyReduction.first36MonthlyPercent;
  assert.ok(Math.abs(engine.ssaBenefitAtClaim(p, 'self') - 3000 * factor * 12) < 1e-6);
});

test('ssaBenefitAtClaim: early claim beyond 36 months blends both reduction tiers', () => {
  const p = { retirement: { ssBenefit: 3000, ssClaim: 62, ssFra: 67, ssAdvanced: false, aime: 0, spouseSS: 0, spouseClaim: 67 } };
  const months = 60; // 5 years early
  const factor = 1 - 36 * RULES.socialSecurity.earlyReduction.first36MonthlyPercent - 24 * RULES.socialSecurity.earlyReduction.laterMonthlyPercent;
  assert.ok(Math.abs(engine.ssaBenefitAtClaim(p, 'self') - 3000 * factor * 12) < 1e-6);
});

test('ssaBenefitAtClaim: delayed claim applies the annual delayed-credit rate', () => {
  const p = { retirement: { ssBenefit: 3000, ssClaim: 70, ssFra: 67, ssAdvanced: false, aime: 0, spouseSS: 0, spouseClaim: 67 } };
  const factor = 1 + 3 * RULES.socialSecurity.delayedCreditAnnual;
  assert.ok(Math.abs(engine.ssaBenefitAtClaim(p, 'self') - 3000 * factor * 12) < 1e-6);
});

test('ssaBenefitAtClaim: spouse always uses spouseSS/spouseClaim and never the advanced PIA/AIME path', () => {
  const p = { retirement: { ssBenefit: 9999, ssClaim: 67, ssFra: 67, ssAdvanced: true, aime: 8000, spouseSS: 1800, spouseClaim: 67 } };
  assert.equal(engine.ssaBenefitAtClaim(p, 'spouse'), 1800 * 12, 'spouse must ignore both ssAdvanced and the self ssBenefit entirely');
});

test('ssaBenefitAtClaim: the advanced PIA/AIME path applies all three bend-point rates when AIME exceeds both bend points', () => {
  const bend1 = RULES.socialSecurity.pia.bend1, bend2 = RULES.socialSecurity.pia.bend2;
  const aime = bend2 + 1000; // above both bend points, so all three tiers contribute
  const p = { retirement: { ssBenefit: 1, ssClaim: 67, ssFra: 67, ssAdvanced: true, aime, spouseSS: 0, spouseClaim: 67 } };
  const base = 0.9 * bend1 + 0.32 * (bend2 - bend1) + 0.15 * (aime - bend2);
  assert.ok(Math.abs(engine.ssaBenefitAtClaim(p, 'self') - base * 12) < 1e-6, 'must use the PIA formula, not ssBenefit, when ssAdvanced and aime>0');
});

// ---------------------------------------------------------------------------
// irmaaMonthly
// ---------------------------------------------------------------------------

test('irmaaMonthly: below the first threshold uses the base (index 0) premium', () => {
  const magi = RULES.medicare.irmaa.singleThresholds[0] - 1;
  const expected = RULES.medicare.irmaa.partBMonthly[0] + RULES.medicare.irmaa.partDMonthlySurcharge[0];
  assert.equal(engine.irmaaMonthly(magi, 'single'), expected);
});

test('irmaaMonthly: crossing a threshold (strictly greater than, not equal) advances one tier', () => {
  const threshold = RULES.medicare.irmaa.singleThresholds[0];
  const atThreshold = RULES.medicare.irmaa.partBMonthly[0] + RULES.medicare.irmaa.partDMonthlySurcharge[0];
  const overThreshold = RULES.medicare.irmaa.partBMonthly[1] + RULES.medicare.irmaa.partDMonthlySurcharge[1];
  assert.equal(engine.irmaaMonthly(threshold, 'single'), atThreshold, 'exactly at the threshold must not advance a tier');
  assert.equal(engine.irmaaMonthly(threshold + 1, 'single'), overThreshold, '$1 over must advance exactly one tier');
});

test('irmaaMonthly: magi above every threshold lands on the top tier, and mfj uses its own threshold table', () => {
  const top = RULES.medicare.irmaa.partBMonthly.length - 1;
  const expectedTop = RULES.medicare.irmaa.partBMonthly[top] + RULES.medicare.irmaa.partDMonthlySurcharge[top];
  assert.equal(engine.irmaaMonthly(999999999, 'single'), expectedTop);
  assert.equal(engine.irmaaMonthly(999999999, 'mfj'), expectedTop);

  // A magi between single's and mfj's first threshold must land on different tiers for each filing status.
  const betweenThresholds = RULES.medicare.irmaa.singleThresholds[0] + 1;
  assert.ok(betweenThresholds <= RULES.medicare.irmaa.jointThresholds[0], 'test assumption: mfj\'s first threshold is at or above single\'s');
  const singleResult = engine.irmaaMonthly(betweenThresholds, 'single');
  const mfjResult = engine.irmaaMonthly(betweenThresholds, 'mfj');
  assert.notEqual(singleResult, mfjResult, 'single and mfj must use independent threshold tables');
});

// ---------------------------------------------------------------------------
// contributionLimit
// ---------------------------------------------------------------------------

test('contributionLimit: ira adds the catchup only at or after the catchup age', () => {
  const r = RULES.retirement.ira;
  assert.equal(engine.contributionLimit('ira', r.catchupAge - 1, 'single'), r.combinedLimit);
  assert.equal(engine.contributionLimit('ira', r.catchupAge, 'single'), r.combinedLimit + r.catchup);
});

test('contributionLimit: workplace uses the enhanced catchup only in the exact enhanced-catchup ages, otherwise the standard catchup', () => {
  const r = RULES.retirement.workplace;
  const enhancedAge = r.enhancedCatchupAges[0];
  assert.equal(engine.contributionLimit('workplace', enhancedAge, 'single'), r.employeeDeferral + r.enhancedCatchup, 'an exact enhanced-catchup age');
  assert.equal(engine.contributionLimit('workplace', enhancedAge + 10, 'single'), r.employeeDeferral + r.catchup, 'past the enhanced window, standard catchup applies');
  assert.equal(engine.contributionLimit('workplace', r.catchupAge - 1, 'single'), r.employeeDeferral, 'below the standard catchup age, no catchup at all');
});

test('contributionLimit: hsa uses the family limit for mfj and the self limit otherwise, plus catchup at the catchup age', () => {
  const r = RULES.retirement.hsa;
  assert.equal(engine.contributionLimit('hsa', r.catchupAge - 1, 'mfj'), r.family);
  assert.equal(engine.contributionLimit('hsa', r.catchupAge - 1, 'single'), r.self);
  assert.equal(engine.contributionLimit('hsa', r.catchupAge, 'mfj'), r.family + r.catchup);
});

test('contributionLimit: an unrecognized group has no cap', () => {
  assert.equal(engine.contributionLimit('customTaxable', 90, 'single'), Infinity);
});
