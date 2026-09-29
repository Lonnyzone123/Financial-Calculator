/* S5AA R37 (SA32F-44; Claude's R32F full-model audit, confirmed by ChatGPT's R32V) -- THE HSA'S AGE-65 EXCEPTION IS JUDGED AT THE
 * AGE THE PROJECTION YEAR OPENED AT, AS Q137 DECIDED FOR 59 1/2, AND IS NOW DECLARED.
 *
 * R32V: "Pooled nonqualified HSA withdrawals use opening age for the 65 exception. Section 18.3 declares the 59 1/2 convention
 * but not this age-65 extension ... the smaller figure assumes specified after-birthday timing that the pooled input does not
 * record. Declare the convention or add timing; the law applies the 65 exception to distributions after attaining 65."
 * A year's draw has no date inside the year, so which part of it falls after the 65th birthday is not in the plan. Q137 (the
 * owner, 2026-09-24: "Keep it and disclose it") settled that question for the 10% at 59 1/2, with proration and dated draws
 * left to the engine rebuild. The 20% additional tax at 65 (IRC 223(f)(4)(A) and (C)) is the same pooled draw at a different
 * age, so it follows the same convention, and the round declares it: in the engine's comment, and in MODEL_ASSUMPTIONS.md
 * section 18.3 through the relay to eb. This test pins the convention by hand; it describes today's behaviour, which the
 * round does not change.
 *
 * Rows follow the primary person's ages, so an owner whose birthday falls inside a row is one whose age is offset from the
 * primary person's -- here a spouse at 64 1/2 while the primary person is 60.
 * Hand expectation, retired, no salary, no Social Security yet, nothing else to draw, 0% inflation and return:
 *   the year from 60 to 61 (the spouse 64 1/2 to 65 1/2): spending 20,000 from an HSA whose draws are all non-qualified is
 *   grossed up for its own 20%: 20,000 / 0.8 = 25,000 drawn, 5,000 additional tax. The 25,000 is ordinary income under the
 *   joint standard deduction, so no income tax.
 *   the year from 61 to 62 (the spouse 65 1/2 to 66 1/2): 20,000 drawn, no additional tax. */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

test('R37 SA32F-44: a year that opens before the HSA owner turns 65 charges its whole non-qualified draw the 20%', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 63, filing: 'mfj', spouseOn: true, spouseAge: 64.5 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { inflation: 0, returnRate: 0 });
  Object.assign(p.retirement, { spending: 20000, ssClaim: 70, spouseClaim: 70 });
  p.accounts = [{ id: 'h', name: 'HSA', type: 'hsa', taxClass: 'hsa', owner: 'spouse', balance: 300000, contribution: 0, qualifiedMedicalPct: 0 }];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok');
  /* Row 0 is the opening row; each later row is labelled by its closing age. */
  const [straddle, after] = [r.rows[1], r.rows[2]];
  assert.strictEqual(straddle.age, 61);
  assert.strictEqual(Math.round(straddle.withdrawals * 100) / 100, 25000);
  assert.strictEqual(Math.round(straddle.taxes * 100) / 100, 5000, 'the year that opens at 64 1/2 is judged at 64 1/2');
  assert.strictEqual(Math.round(after.withdrawals * 100) / 100, 20000);
  assert.strictEqual(Math.round(after.taxes * 100) / 100, 0, 'from 65 1/2 no additional tax');
});

test('R37 SA32F-44: the engine declares the convention where the rate is chosen', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'engine.js'), 'utf8');
  const at = src.indexOf('function hsaAdditionalTaxRate(');
  assert.ok(at > 0);
  assert.match(src.slice(Math.max(0, at - 1200), at), /SA32F-44[\s\S]*Q137/, 'no declaration above hsaAdditionalTaxRate()');
});
