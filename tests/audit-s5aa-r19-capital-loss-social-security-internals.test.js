/* S5AA R19 round: the INTERNALS tests of R18-01 (ChatGPT's R18 external audit, 2026-09-24, priority 2; repair chosen by the owner
 * 2026-09-23, with negative AGI shown as the form shows it). Split out from
 * tests/audit-s5aa-r19-capital-loss-social-security.test.js, which guards the repair through runPlan() alone; these call
 * estimateTaxes() directly to pin each worksheet line. A rebuild re-points or retires them with that internal.
 *
 * R18-01: a net capital loss is deducted up to $3,000 (Schedule D line 21) WHATEVER the other income, and it enters
 * Form 1040 line 7a, which the Social Security Benefits Worksheet combines on its line 3 (2025 Form 1040 instructions,
 * "Combine the amounts from Form 1040 or 1040-SR, lines 1z, 2b, 3b, 4b, 5b, 7a, and 8"). The engine capped the
 * deduction at non-Social-Security ordinary income plus qualified dividends, and took any part of it against the
 * dividends -- so a retiree living on Social Security got no deduction at all.
 *   - Qualified dividends stay preferential up to taxable income (the Qualified Dividends and Capital Gain Tax
 *     Worksheet); the loss comes off total income, and only a taxable income below them reduces them.
 *   - Net investment income includes the deductible loss (Form 8960 line 5a combines Form 1040 line 7a).
 *   - AGI may be negative, as Form 1040 line 11 may be.
 *   - The carryover a year uses is still capped by its taxable income (SA18-01).
 *
 * Single filer at 70; 2026 rules as the engine holds them: standard deduction 16,100 + 2,050 (65 or older) + 6,000
 * senior (full below $75,000 MAGI) = 24,150; 10% to 12,400, 12% to 50,400; 0% on preferential income to 49,450; Social
 * Security base 25,000, upper 34,000; NIIT 3.8% over 200,000. Arizona taxes no Social Security, and every Arizona base
 * below is under its deductions, so Arizona is 0. Every figure is computed by hand.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const round = (x) => Math.round(Number(x) * 100) / 100;
const near = (actual, expected, label) => assert.equal(round(actual), round(expected), label);
function single70() {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  Object.assign(p.profile, { age: 70, retireAge: 60, endAge: 71, spouseOn: false, filing: 'single' });
  Object.assign(p.retirement, { selfLife: 99 });
  return p;
}
/* estimateTaxes(p, age, ordinary, capitalGains, ssBenefit, wages, qualifiedDividends, spouseWages, seSelf, seSpouse, niiOther, carryIn) */
const tax = (ordinary, gains, ss, qdiv) => engine.estimateTaxes(single70(), 70, ordinary, gains, ss, 0, qdiv || 0, 0, 0, 0, 0, 0);

test('R18-01: the auditor\'s case -- a $10,000 loss against $200,000 of Social Security and nothing else', () => {
  /* Worksheet: line 2 = 100,000; line 3 = line 7a = -3,000; line 5 = 97,000. Over the upper base: 4,500 + 85% x
     (97,000 - 34,000) = 58,050 (under 85% x 200,000). AGI = 58,050 - 3,000 = 55,050. Taxable income = 55,050 - 24,150 =
     30,900: 1,240 + 12% x 18,500 = 3,460. The year used all 3,000 (taxable income before the loss is positive), so
     10,000 - 3,000 = 7,000 carries. The engine gave: deduction 0, taxable SS 60,600, AGI 60,600, tax 4,126, carry 10,000. */
  const t = tax(0, -10000, 200000);
  near(t.capitalLossDeduction, 3000, 'the whole $3,000 is deductible');
  near(t.ssTaxable, 58050, 'the loss lowers provisional income');
  near(t.measures.federal_agi, 55050);
  near(t.federal, 3460);
  near(t.total, 3460, 'Arizona taxes none of it');
  near(t.capitalLossCarryOut, 7000);
});

test('R18-01: qualified dividends stay preferential; the loss comes off ordinary income', () => {
  /* $1,000 of qualified dividends added. Line 3 = 1,000 - 3,000 = -2,000; line 5 = 98,000; taxable SS = 4,500 + 85% x
     64,000 = 58,900. AGI = 1,000 + 58,900 - 3,000 = 56,900; taxable income = 32,750. Preferential income is the smaller
     of the dividends (1,000) and taxable income: 1,000, taxed at 0%. Ordinary taxable = 31,750: 1,240 + 12% x 19,350 =
     3,562. (Taking the loss against the dividends first would have taxed 32,750 as ordinary.) */
  const t = tax(0, -10000, 200000, 1000);
  near(t.ssTaxable, 58900);
  near(t.measures.federal_agi, 56900);
  near(t.taxableGains, 1000, 'the dividends keep their preferential treatment');
  near(t.ordinaryTaxable, 31750);
  near(t.federal, 3562);
  near(t.capitalLossCarryOut, 7000);
});

test('R18-01: some ordinary income, less than the loss -- the deduction is still $3,000', () => {
  /* $1,000 of ordinary income. The engine capped the deduction at 1,000. Line 3 = 1,000 - 3,000 = -2,000; line 5 =
     98,000; taxable SS 58,900; AGI = 56,900; taxable income 32,750, all ordinary: 1,240 + 12% x 20,350 = 3,682. */
  const t = tax(1000, -10000, 200000);
  near(t.capitalLossDeduction, 3000);
  near(t.measures.federal_agi, 56900);
  near(t.federal, 3682);
  near(t.capitalLossCarryOut, 7000);
});

test('R18-01: in the 50% band, and a negative AGI, as Form 1040 line 11 allows', () => {
  /* $60,000 of Social Security, a $10,000 loss, nothing else. Line 5 = 30,000 - 3,000 = 27,000: over the 25,000 base, under
     the 34,000 upper, so taxable SS = 50% x 2,000 = 1,000. AGI = 1,000 - 3,000 = -2,000. No tax. Taxable income before the
     loss is below zero (-2,000 - 24,150 + 3,000), so the year uses none of the carryover: all 10,000 carries (SA18-01). */
  const t = tax(0, -10000, 60000);
  near(t.ssTaxable, 1000);
  near(t.measures.federal_agi, -2000, 'AGI goes below zero');
  near(t.total, 0);
  near(t.capitalLossCarryOut, 10000);
});

test('R18-01: net investment income includes the deductible loss (Form 8960 line 5a)', () => {
  /* $250,000 of ordinary income, $10,000 of qualified dividends, a $10,000 loss, no Social Security. NII = 10,000 - 3,000
     = 7,000. MAGI = 250,000 + 10,000 - 3,000 = 257,000, over 200,000 by 57,000. NIIT = 3.8% x 7,000 = 266 (not 380). */
  const t = tax(250000, -10000, 0, 10000);
  near(t.niit, 266);
});

test('R18-01 CONTROL: a gain, not a loss, is taxed exactly as before', () => {
  /* A $5,000 gain with $200,000 of Social Security. Line 5 = 105,000; taxable SS = 4,500 + 85% x 71,000 = 64,850. AGI
     69,850 (under 75,000: the full senior deduction). Ordinary taxable = 64,850 - 24,150 = 40,700: 1,240 + 12% x 28,300 =
     4,636. The 5,000 gain sits at 40,700 to 45,700, inside the 0% band. */
  const t = tax(0, 5000, 200000);
  near(t.ssTaxable, 64850);
  near(t.measures.federal_agi, 69850);
  near(t.federal, 4636);
  near(t.capitalLossCarryOut, 0);
});
