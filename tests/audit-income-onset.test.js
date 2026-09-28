'use strict';

/**
 * Tests for AUD-006 (RETIREMENT_ENGINE_AUDIT_CLAUDE_QUEUE_2026-09-08.md,
 * task T07): otherIncomeFor() used to skip an ENTIRE period whenever the
 * income hadn't started as of the period's OPENING age, even if it should
 * have activated partway through -- a recurring income starting at a
 * half-year age inside an integer-age row contributed $0 instead of a
 * prorated partial amount.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

function planFor(overrides = {}) {
  return {
    profile: Object.assign({ age: 60, spouseAge: 60, spouseOn: false }, overrides.profile || {}),
    retirement: { otherIncomes: overrides.otherIncomes || [] },
  };
}

test('AUD-006 reproduction: a rental starting at 60.5 inside a 60-61 period yields the prorated $6,000, not $0', () => {
  const p = planFor({
    otherIncomes: [{ type: 'rental', owner: 'self', start: 60.5, end: 70, amount: 12000, growthMode: 'fixed', growth: 0 }],
  });
  const result = engine.otherIncomeFor(p, 60, 61, 1, 0);
  assert.ok(Math.abs(result.cash - 6000) < 0.01, `expected $6,000 (half a year at $12,000/yr), got ${result.cash}`);
});

test('AUD-006: an income starting exactly AT the period start still counts for the whole period (unchanged behavior)', () => {
  const p = planFor({
    otherIncomes: [{ type: 'rental', owner: 'self', start: 60, end: 70, amount: 12000, growthMode: 'fixed', growth: 0 }],
  });
  const result = engine.otherIncomeFor(p, 60, 61, 1, 0);
  assert.ok(Math.abs(result.cash - 12000) < 0.01, `expected the full $12,000, got ${result.cash}`);
});

test('AUD-006: an income starting exactly AT the period end contributes nothing this period (belongs to the next one)', () => {
  const p = planFor({
    otherIncomes: [{ type: 'rental', owner: 'self', start: 61, end: 70, amount: 12000, growthMode: 'fixed', growth: 0 }],
  });
  const result = engine.otherIncomeFor(p, 60, 61, 1, 0);
  assert.equal(result.cash, 0, `expected $0 -- the income starts exactly when this period ends, got ${result.cash}`);
});

test('AUD-006: an already-active stream (started well before this period) is completely unaffected by the fix', () => {
  const p = planFor({
    otherIncomes: [{ type: 'rental', owner: 'self', start: 50, end: 70, amount: 12000, growthMode: 'fixed', growth: 2 }],
  });
  const result = engine.otherIncomeFor(p, 60, 61, 1, 0);
  // years since start = 60-50 = 10, at 2% growth.
  const expected = 12000 * Math.pow(1.02, 10);
  assert.ok(Math.abs(result.cash - expected) < 0.01, `expected ${expected} (unchanged prior formula), got ${result.cash}`);
});

test('AUD-006: spouse age offset -- proration uses the SPOUSE\'s own age clock, not self\'s', () => {
  const p = planFor({
    profile: { age: 60, spouseAge: 58, spouseOn: true }, // spouse is 2 years younger
    otherIncomes: [{ type: 'rental', owner: 'spouse', start: 58.5, end: 70, amount: 12000, growthMode: 'fixed', growth: 0 }],
  });
  // Self's period is 60-61; spouse's corresponding age window is 58-59, and the
  // income starts at 58.5 -- exactly the same half-year-in proration as the
  // audit's own self-owned reproduction, but driven by the spouse's clock.
  const result = engine.otherIncomeFor(p, 60, 61, 1, 0);
  assert.ok(Math.abs(result.cash - 6000) < 0.01, `expected $6,000 using the spouse's own age clock, got ${result.cash}`);
});

test('AUD-006: cash/ordinary/SS classification is preserved for a prorated mid-period start', () => {
  const social = engine.otherIncomeFor(planFor({
    otherIncomes: [{ type: 'socialSecurity', owner: 'self', start: 60.5, end: 70, amount: 12000, growthMode: 'fixed', growth: 0 }],
  }), 60, 61, 1, 0);
  assert.ok(Math.abs(social.cash - 6000) < 0.01);
  assert.ok(Math.abs(social.ss - 6000) < 0.01, 'a socialSecurity-typed income must be classified into `ss`');
  assert.equal(social.ordinary, 0, 'and not double-counted into `ordinary`');

  const taxFree = engine.otherIncomeFor(planFor({
    otherIncomes: [{ type: 'taxFree', owner: 'self', start: 60.5, end: 70, amount: 12000, growthMode: 'fixed', growth: 0 }],
  }), 60, 61, 1, 0);
  assert.ok(Math.abs(taxFree.cash - 6000) < 0.01);
  assert.equal(taxFree.ordinary, 0, 'a taxFree-typed income must not be classified into `ordinary`');
  assert.equal(taxFree.ss, 0);

  const ordinary = engine.otherIncomeFor(planFor({
    otherIncomes: [{ type: 'rental', owner: 'self', start: 60.5, end: 70, amount: 12000, growthMode: 'fixed', growth: 0 }],
  }), 60, 61, 1, 0);
  assert.ok(Math.abs(ordinary.ordinary - 6000) < 0.01, 'an ordinary (rental) income must be classified into `ordinary`');
});

test('AUD-006: inflation growth mode is unaffected by proration -- it uses the passed-in inflationFactor directly, not years-since-start', () => {
  const p = planFor({
    otherIncomes: [{ type: 'rental', owner: 'self', start: 60.5, end: 70, amount: 12000, growthMode: 'inflation' }],
  });
  const result = engine.otherIncomeFor(p, 60, 61, 1.25, 0); // inflationFactor=1.25, arbitrary cumulative factor
  assert.ok(Math.abs(result.cash - 12000 * 1.25 * 0.5) < 0.01, `expected the prorated half-year amount scaled by the passed-in inflationFactor, got ${result.cash}`);
});

test('AUD-006: none/fixed growth mode with zero growth is the plain $6,000 example, and with nonzero growth the origin is the ACTUAL activation age, not the period start', () => {
  const p = planFor({
    otherIncomes: [{ type: 'rental', owner: 'self', start: 60.5, end: 70, amount: 12000, growthMode: 'fixed', growth: 10 }],
  });
  const result = engine.otherIncomeFor(p, 60, 61, 1, 0);
  // years-since-start at activation (60.5) is 0, so the 10% growth must NOT
  // apply yet -- the old buggy formula (if it had used ownerAge=60 as the
  // origin) would have computed years=max(0,60-60.5)=0 too by coincidence, so
  // this specifically checks the duration is still prorated correctly.
  assert.ok(Math.abs(result.cash - 6000) < 0.01, `expected $6,000 (zero years of growth elapsed exactly at activation), got ${result.cash}`);
});

test('AUD-006: an income entirely outside the period (starts after it ends, or ended before it begins) still contributes nothing', () => {
  const future = engine.otherIncomeFor(planFor({
    otherIncomes: [{ type: 'rental', owner: 'self', start: 65, end: 70, amount: 12000, growthMode: 'fixed', growth: 0 }],
  }), 60, 61, 1, 0);
  assert.equal(future.cash, 0);

  const past = engine.otherIncomeFor(planFor({
    otherIncomes: [{ type: 'rental', owner: 'self', start: 40, end: 55, amount: 12000, growthMode: 'fixed', growth: 0 }],
  }), 60, 61, 1, 0);
  assert.equal(past.cash, 0);
});

test('AUD-006: one-time income treatment is completely untouched by this fix', () => {
  const p = planFor({
    otherIncomes: [{ type: 'oneTime', owner: 'self', start: 60.5, amount: 50000 }],
  });
  const result = engine.otherIncomeFor(p, 60, 61, 1, 0);
  assert.equal(result.cash, 50000, 'a one-time payment inside the period must still count in full, as before');
  assert.equal(result.ordinary, 50000);
});
