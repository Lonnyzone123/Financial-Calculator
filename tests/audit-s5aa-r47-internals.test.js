/* S5AA R47 (the owner's AA1 decisions, 2026-10-03) -- the two R47 checks that read engine functions directly. Implementation-coupled
 * by design; tests/audit-s5aa-r47-federal-tax-and-accounts.test.js is the public-route witness file for the same decisions.
 * 1. AA1-30: the per-year rules carry their tax year (plan year k = 2026 + k), and seniorDeduction() reads the stored expiresAfter
 *    (2028) against it: IRC 151(d)(5)(C)(i), "a taxable year beginning before January 1, 2029".
 * 2. AA1-27: under "warn" the contribution audit's IRA/HSA limit warning says IRC 4973's 6% applies -- the warning the app shows as a
 *    "Contribution limit" card. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const engine = L.h.engine;

test('R47 AA1-30: the per-year rules carry the tax year, and seniorDeduction() reads expiresAfter from them', () => {
  const B = L.h.RULES;
  assert.equal(B.federal.seniorDeduction.expiresAfter, 2028);
  const saved = global.RULES;
  try {
    global.RULES = engine.taxYearRules(B, 1, 1, 2, null);
    assert.equal(engine.seniorDeduction(50000, [70], 'single'), 6000, 'plan year 2 is tax year 2028');
    global.RULES = engine.taxYearRules(B, 1, 1, 3, null);
    assert.equal(engine.seniorDeduction(50000, [70], 'single'), 0, 'plan year 3 is tax year 2029');
    global.RULES = engine.taxYearRules(B, 1.03, 1.02, 3, 1.03);
    assert.equal(engine.seniorDeduction(50000, [70], 'single'), 0, 'an indexed plan year 3 is tax year 2029 too');
  } finally { global.RULES = saved; }
  assert.strictEqual(engine.taxYearRules(B, 1, 1, 0, null), B, 'plan year 0 is the 2026 package itself');
});

test('R47 AA1-27: under "warn" the IRA limit warning says IRC 4973 charges 6% a year; under "redirect" it does not', () => {
  // A 40-year-old earning $50,000 asking $10,000 of a traditional IRA: $2,500 over the $7,500 limit.
  const p = L.basePlan({ age: 40, retireAge: 41, endAge: 41, salary: 50000, accounts: [L.account('ira', 'traditionalIRA', 0, { contribution: 10000 })] });
  p.employment.contributionStop = 41;
  const audit = (policy) => { p.limitPolicy = policy; return engine.auditContributions(p, 40, 50000, 0, engine.ownerContributionEligibility(p, 40, p.profile.spouseAge, 1)).warnings; };
  const warn = audit('warn');
  assert.ok(warn.some((w) => /exceeds the applicable 2026 ira limit by \$2,500/.test(w) && /IRC 4973 charges 6%/.test(w)), JSON.stringify(warn));
  const redirect = audit('redirect');
  assert.ok(redirect.some((w) => /exceeds the applicable 2026 ira limit by \$2,500$/.test(w)), JSON.stringify(redirect));
});
