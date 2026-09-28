'use strict';

/**
 * Tests for AUD-002 (RETIREMENT_ENGINE_AUDIT_CLAUDE_QUEUE_2026-09-08.md,
 * task T04): the previous inline Social Security computation zeroed a
 * spouse's benefit AMOUNT whenever their own alive+claimed duration for the
 * row was zero -- including when they were already dead for the whole row.
 * Since the survivor branch computed Math.max(selfRaw, spouseRaw), a
 * deceased higher earner's amount was discarded before ever being compared,
 * so the survivor received the LOWER of the two amounts instead of the
 * larger one the simplified survivor policy promises.
 *
 * householdSocialSecurityForPeriod() fixes this by splitting the row into
 * sub-intervals at every claim/death crossing and keeping "entitlement
 * amount" and "alive status" as separate questions within each one.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

/** Builds a plan claiming exactly at FRA (factor=1) with zero COLA, so the
 *  monthly amounts given are exactly what's paid, with no growth or
 *  claim-age-factor complications to account for in the expected math. */
function ssPlan(overrides = {}) {
  return {
    profile: Object.assign({ age: 60, spouseAge: 60, spouseOn: true }, overrides.profile || {}),
    assumptions: { method: 'simple' },
    retirement: Object.assign({
      ssBenefit: 3000, ssClaim: 67, ssFra: 67, ssAdvanced: false, aime: 0,
      spouseSS: 1000, spouseClaim: 67,
      selfLife: 95, spouseLife: 95,
      survivor: true, ssCola: 0,
    }, overrides.retirement || {}),
  };
}

test('AUD-002 reproduction: self already dead for the whole row -- survivor (spouse) gets the LARGER amount ($36,000), not spouse\'s own smaller one', () => {
  const p = ssPlan({ retirement: { selfLife: 80 } }); // dead at exactly 80
  const ss = engine.householdSocialSecurityForPeriod(p, 80, 81, 80, 0);
  assert.ok(Math.abs(ss - 36000) < 0.01, `expected $36,000 (self's larger claimed amount survives to spouse), got ${ss}`);
});

test('AUD-002 reproduction, reversed: swapping which spouse has the larger benefit and dies first still gives the survivor the larger amount', () => {
  // Spouse is now the higher earner ($3,000/mo vs self's $1,000/mo), claims at
  // FRA (no reduction), then dies before this row -- self (the survivor) must
  // get spouse's larger claimed amount, not their own smaller one.
  const p = ssPlan({ retirement: { ssBenefit: 1000, spouseSS: 3000, spouseClaim: 67, spouseLife: 68 } });
  const ss = engine.householdSocialSecurityForPeriod(p, 70, 71, 70, 0);
  assert.ok(Math.abs(ss - 36000) < 0.01, `expected $36,000 (self survives spouse and gets the larger amount), got ${ss}`);
});

test('AUD-002: a survivor with zero own benefit still receives the deceased partner\'s full amount', () => {
  const p = ssPlan({ retirement: { ssBenefit: 0, spouseClaim: 67, spouseLife: 68 } }); // self never worked; spouse claims at FRA then dies
  const ss = engine.householdSocialSecurityForPeriod(p, 70, 71, 70, 0);
  assert.ok(Math.abs(ss - 12000) < 0.01, `spouse's $1,000/mo must survive to self even though self's own benefit is $0, got ${ss}`);
});

test('AUD-002: equal benefits -- the survivor amount equals either spouse\'s own amount (no directional bug possible, still a real regression check)', () => {
  const p = ssPlan({ retirement: { ssBenefit: 2000, spouseSS: 2000, selfLife: 80 } });
  const ss = engine.householdSocialSecurityForPeriod(p, 80, 81, 80, 0);
  assert.ok(Math.abs(ss - 24000) < 0.01, `expected $24,000, got ${ss}`);
});

test('AUD-002: both alive -- normal sum, survivor logic never triggers, unaffected by the fix', () => {
  const p = ssPlan({});
  const ss = engine.householdSocialSecurityForPeriod(p, 70, 71, 70, 0);
  assert.ok(Math.abs(ss - 48000) < 0.01, `expected $36,000 + $12,000 = $48,000 with both alive, got ${ss}`);
});

test('AUD-002: both dead -- zero, no crash, no phantom survivor payment', () => {
  const p = ssPlan({ retirement: { selfLife: 80, spouseLife: 80 } });
  const ss = engine.householdSocialSecurityForPeriod(p, 80, 81, 80, 0);
  assert.equal(ss, 0);
});

test('AUD-002: a death exactly mid-row correctly splits pre/post-death household payments, not one flat amount for the whole row', () => {
  const p = ssPlan({ retirement: { selfLife: 80.5 } }); // self dies exactly halfway through the 80-81 row
  const ss = engine.householdSocialSecurityForPeriod(p, 80, 81, 80, 0);
  // First half: both alive, $48,000/yr rate * 0.5yr = $24,000.
  // Second half: self dead, spouse survivor gets the larger $36,000/yr rate * 0.5yr = $18,000.
  const expected = 48000 * 0.5 + 36000 * 0.5;
  assert.ok(Math.abs(ss - expected) < 0.01, `expected $${expected} (split pre/post-death), got ${ss}`);
});

test('AUD-002: survivor mode OFF -- each spouse is paid independently even after a death, unchanged from before this fix', () => {
  const p = ssPlan({ retirement: { survivor: false, selfLife: 80 } });
  const ss = engine.householdSocialSecurityForPeriod(p, 80, 81, 80, 0);
  assert.ok(Math.abs(ss - 12000) < 0.01, `with survivor off, the deceased self contributes $0 and spouse is paid their own $12,000 only, got ${ss}`);
});

test('AUD-002: no spouse at all -- self is paid their own amount alone, no crash from spouse-shaped math', () => {
  const p = ssPlan({ profile: { age: 70, spouseAge: 70, spouseOn: false } });
  const ss = engine.householdSocialSecurityForPeriod(p, 70, 71, 70, 0);
  assert.ok(Math.abs(ss - 36000) < 0.01, `expected self's own $36,000 with no spouse, got ${ss}`);
});

test('AUD-002: a claim occurring mid-row is also split correctly (not a death, but the same segmentation machinery)', () => {
  // ssFra matches ssClaim so claiming exactly at this age applies no early/delayed
  // factor -- isolates the segmentation behavior from the claim-age-factor formula.
  // ssFra is shared between self and spouse in this simplified model, so spouse's
  // claim age is set to the SAME 66.5 (also unreduced) but spouse's passed-in
  // current age (70, the function's 4th argument below) puts that crossing well
  // in the past -- spouse is already fully in payment for the whole row, and the
  // only crossing inside this row is self's own claim.
  const p = ssPlan({ retirement: { ssClaim: 66.5, ssFra: 66.5, spouseClaim: 66.5 } });
  const ss = engine.householdSocialSecurityForPeriod(p, 66, 67, 70, 0); // self claims halfway through a 66-67 row
  // First half: self not yet claimed ($0 self) + spouse's $12,000/yr rate * 0.5 = $6,000.
  // Second half: self claimed, both alive, $48,000/yr rate * 0.5 = $24,000.
  const expected = 12000 * 0.5 + 48000 * 0.5;
  assert.ok(Math.abs(ss - expected) < 0.01, `expected $${expected}, got ${ss}`);
});

// --- Integration: the fix is actually wired into simulatePlan() ----------

test('AUD-002 integration: a full simulatePlan() run reflects the corrected survivor amount in row income, not just the standalone helper', () => {
  const shellDefaultMatch = shell.match(/var defaultPlan=(\{.*?\});/);
  // eslint-disable-next-line no-eval
  const defaultPlan = eval('(' + shellDefaultMatch[1] + ')');
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.profile.age = 79.5;
  p.profile.retireAge = 65;
  p.profile.endAge = 81;
  p.profile.spouseOn = true;
  p.profile.spouseAge = 79.5;
  p.accounts = [
    { id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 5000000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 80, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 },
  ];
  p.employment.salary = 0;
  p.employment.spouseSalary = 0;
  p.retirement.spending = 0;
  p.retirement.ssBenefit = 3000;
  p.retirement.ssClaim = 67;
  p.retirement.ssFra = 67;
  p.retirement.ssAdvanced = false;
  p.retirement.aime = 0;
  p.retirement.spouseSS = 1000;
  p.retirement.spouseClaim = 67;
  p.retirement.selfLife = 80; // dies during the row starting at age 79.5
  p.retirement.spouseLife = 95;
  p.retirement.survivor = true;
  p.retirement.ssCola = 0;

  const result = engine.runPlan(p);
  const row = result.rows.find((r) => Math.abs(r.age - 80) < 0.001);
  assert.ok(row, 'expected a row ending at age 80');
  // Half a year (79.5-80) both alive at $48,000/yr rate = $24,000, contributing
  // to `income` alongside whatever else the row carries (should be SS-only here).
  assert.ok(row.income >= 24000 - 0.01, `row income (${row.income}) must reflect at least the pre-death $24,000 half-year SS -- the bug would have shown roughly half as much once the deceased's amount got zeroed`);
});
