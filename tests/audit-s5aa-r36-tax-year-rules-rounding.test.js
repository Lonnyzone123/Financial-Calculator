/* S5AA R36 (SA32F-D1, decision 8) -- EACH INDEXED FIGURE'S STATUTE AND ROUNDING, one year on at 3% prices and 4% wages.
 * Hand-worked from the statutes read 2026-09-29 (the engine comment on taxYearRules() lists them). Implementation-coupled by design: it
 * calls taxYearRules() directly; tests/audit-s5aa-r36-later-year-tax-indexing.test.js is the public-route guard. */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const B = global.RULES;
const R = engine.taxYearRules(B, 1.03, 1.04, 1, null);
const rec = (block, id, fs) => block.records.find((r) => r.provision_id === id && (!fs || r.filing_status === fs)).value;

test('R36: brackets and capital-gains thresholds -- the increase down to $50 (IRC 1(f)(7), 1(j)(5)(C))', () => {
  assert.deepStrictEqual(R.federal.ordinaryBrackets.single.slice(0, 3).map((b) => b[0]), [12750, 51900, 108850]);   /* +372->350, +1,512->1,500, +3,171->3,150 */
  assert.strictEqual(R.federal.ordinaryBrackets.single[6][0], null, 'the open top bracket stays open');
  assert.strictEqual(R.federal.capitalGains.mfj[0][0], 98900 + 2950);   /* 2,967 down to 2,950 */
});

test('R36: the standard deduction, the age-65 addition and Arizona\'s -- the increase down to $50 (63(c)(4), (c)(7); Chapter 140)', () => {
  assert.deepStrictEqual(R.federal.standardDeduction, { single: 16550, mfj: 33150, hoh: 24850 });
  assert.strictEqual(rec(R.federal.additionalStandardDeduction, 'federal_additional_standard_deduction_aged'), 1650 + 0 + 0);   /* +49.50: nothing */
  assert.strictEqual(rec(R.arizona, 'az_basic_standard_deduction', 'mfj'), 33150);
  assert.strictEqual(rec(R.arizona, 'az_age65_exemption'), 2100, 'fixed by statute');
});

test('R36: contribution limits, each by its own statute', () => {
  assert.strictEqual(R.retirement.ira.combinedLimit, 7500, '219(b)(5)(C): 7,725 down to 7,500');
  assert.strictEqual(R.retirement.ira.catchup, 1100, '1,133 down to $100: 1,100');
  assert.strictEqual(R.retirement.workplace.employeeDeferral, 25000, '402(g)(4): +735 down to 500');
  assert.strictEqual(R.retirement.workplace.catchup, 8000, '414(v)(2)(C): +240 down to 0');
  assert.strictEqual(R.retirement.workplace.totalEmployeeEmployer, 74000, '415(d)(4)(B): +2,160 down to 2,000');
  assert.strictEqual(R.retirement.workplace.compensationLimit, 370000, '401(a)(17)(B): +10,800 down to 10,000');
  assert.strictEqual(R.retirement.hsa.self, 4550, '223(g)(2): +132 to the nearest 50: 150');
  assert.strictEqual(R.retirement.hsa.catchup, 1000, 'the HSA catch-up is fixed');
  assert.strictEqual(rec(R.retirement.qcd, 'qcd_annual_cap'), 114000, '408(d)(8)(G): 114,330 to the nearest 1,000');
  assert.deepStrictEqual(R.retirement.ira.rothPhaseout.single, B.retirement.ira.rothPhaseout.single.map((v) => v + Math.floor(v * 0.03 / 1000 + 0.5) * 1000), '408A(c)(3)(D): nearest 1,000');
});

test('R36: IRMAA -- the amount to the nearest $1,000, the top tier fixed until 2028 (42 USC 1395r(i)(5))', () => {
  assert.deepStrictEqual(R.medicare.irmaa.singleThresholds, [112000, 141000, 176000, 211000, 500000]);
  const year2 = engine.taxYearRules(B, 1.03 * 1.03, 1, 2, 1.03);
  assert.strictEqual(year2.medicare.irmaa.singleThresholds[4], 515000, 'from plan year 2, the top tier indexed from the second year\'s prices');
});

test('R36: wage-linked amounts on the salary-growth field', () => {
  assert.strictEqual(R.federal.payroll.oasdiWageBase, 192000, '42 USC 430(b): 191,880 to the nearest $300');
  assert.strictEqual(R.socialSecurity.taxableMaximum, 192000);
  assert.strictEqual(R.socialSecurity.earningsTest.underFRA, 25440, '403(f)(8)(B): 2,121.60 a month to the nearest 10, x 12');
  assert.strictEqual(R.socialSecurity.earningsTest.fraYear, 67800, '5,647.20 a month to the nearest 10, x 12');
});

test('R36: the amounts the law fixes stay fixed, and a zero-inflation year is the 2026 rules themselves', () => {
  assert.deepStrictEqual(R.federal.niit.threshold, B.federal.niit.threshold);
  assert.deepStrictEqual(R.federal.socialSecurityTaxation, B.federal.socialSecurityTaxation);
  assert.deepStrictEqual(R.federal.seniorDeduction, B.federal.seniorDeduction, 'kept, unindexed, after 2028 (D8)');
  assert.deepStrictEqual(R.federal.payroll.additionalThreshold, B.federal.payroll.additionalThreshold);
  assert.strictEqual(engine.taxYearRules(B, 1, 1, 0, null), B);
});
