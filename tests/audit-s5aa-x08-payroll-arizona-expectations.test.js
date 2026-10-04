/* S5AA X08 / task 6.4: INDEPENDENT expected cases for payroll, self-employment and Arizona.
 *
 * X08 is not a defect claim. It is an obligation: the wage, self-employment and Arizona routes all
 * respond, and what was owed is a set of expectations derived from the statute rather than from the
 * engine -- so that "the engine agrees with itself" is not what is being tested.
 *
 * EVERY FIGURE BELOW IS COMPUTED IN THIS FILE, from the rule values and the arithmetic written out
 * beside it. Nothing is copied from a run, and `engine` is called only to be compared against.
 *
 * THE MIXED WAGE + SELF-EMPLOYMENT ROW IS THE ONE THAT MATTERS, and it is the reason X08 was written.
 * Two coordinations bite there and BOTH are invisible if wages and self-employment are tested apart:
 *
 *   1. IRC 1402(b)(1). Self-employment income subject to the old-age portion is capped at *"an amount
 *      equal to the contribution and benefit base ... minus ... the amount of the wages paid to such
 *      individual during such taxable year"*. It is PER PERSON: one spouse's wages do not consume the
 *      other's base. $150,000 of wages leaves $34,500 of room against a $184,500 base, so $92,350 of
 *      net earnings is taxed on $34,500 of it -- $4,278.00 rather than $11,451.40.
 *
 *   2. IRC 1401(b)(2). The Additional Medicare threshold for self-employment income *"shall be reduced
 *      (but not below zero) by the amount of wages"*, which makes the base the HOUSEHOLD's wages plus
 *      self-employment income together. $150,000 of wages is below the $200,000 single threshold and
 *      $92,350 of net earnings is below it too, so NEITHER is taxed alone -- and $42,350 of the
 *      combined figure is.
 *
 * Both statutes were read before these cases were written (S5AA task 8.6). The rates, the base and the
 * thresholds are read from RULES here rather than typed in, so a rule change moves the expectation with
 * the engine instead of leaving a stale number to be "fixed" later.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));

const PAY = RULES.federal.payroll;
const se = (id) => RULES.federal.selfEmployment.records.find((r) => r.provision_id === id).value;
const AZ_STD = (filing) => RULES.arizona.records
  .find((r) => r.provision_id === 'az_basic_standard_deduction' && r.filing_status === filing).value;
const AZ_65 = RULES.arizona.records.find((r) => r.provision_id === 'az_age65_exemption').value;

const NET_FACTOR = se('se_net_earnings_factor');     // 0.9235
const SE_OASDI = se('se_social_security_rate');      // 0.124
const SE_MEDICARE = se('se_medicare_rate');          // 0.029
const SE_MINIMUM = se('se_minimum_net_earnings');    // 400

const person = (filing, age, spouseOn, spouseAge) => ({
  profile: { filing, age, spouseOn: !!spouseOn, spouseAge: spouseAge === undefined ? age : spouseAge },
});
const near = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 0.005, what + ': engine ' + actual.toFixed(4) + ', derived ' + expected.toFixed(4));

/* ---------------------------------------------------------------- payroll on wages alone */

test('X08: wages alone, single, $250,000 -- OASDI stops at the base, Medicare does not, Additional Medicare starts at $200,000', () => {
  const wages = 250000;
  const oasdi = Math.min(wages, PAY.oasdiWageBase) * PAY.oasdiEmployee;   // 184,500 x 6.2%  = 11,439.00
  const medicare = wages * PAY.medicareEmployee;                          // 250,000 x 1.45% =  3,625.00
  const additional = (wages - PAY.additionalThreshold.single) * PAY.additionalMedicare; // 50,000 x 0.9% = 450.00
  const derived = oasdi + medicare + additional;                          //                  15,514.00

  assert.equal(oasdi.toFixed(2), '11439.00', 'CONTROL: the OASDI figure is what the base and rate give');
  assert.equal(derived.toFixed(2), '15514.00', 'CONTROL: and the total is the sum of three separate rules');
  near(engine.estimateTaxes(person('single', 45), 45, wages, 0, 0, wages, 0, 0, 0, 0, 0).payroll, derived, 'payroll');
});

test('X08: wages exactly AT the base and one dollar over it', () => {
  /* The boundary the cap is made of. One more dollar of wages adds Medicare but no OASDI. */
  const at = PAY.oasdiWageBase;
  const over = PAY.oasdiWageBase + 1;
  const payrollFor = (w) => engine.estimateTaxes(person('single', 45), 45, w, 0, 0, w, 0, 0, 0, 0, 0).payroll;
  near(payrollFor(at), at * PAY.oasdiEmployee + at * PAY.medicareEmployee, 'at the base');
  near(payrollFor(over) - payrollFor(at), PAY.medicareEmployee,
    'the dollar over the base costs Medicare only: $' + PAY.medicareEmployee);
});

/* ---------------------------------------------------------------- self-employment alone */

test('X08: self-employment alone, single, $250,000 of profit', () => {
  const profit = 250000;
  const netEarnings = profit * NET_FACTOR;                                // 230,875.00
  assert.ok(netEarnings >= SE_MINIMUM, 'CONTROL: above the $400 floor, so it is taxed at all');
  const ssPart = SE_OASDI * Math.min(netEarnings, PAY.oasdiWageBase);     // 12.4% x 184,500 = 22,878.00
  const medPart = SE_MEDICARE * netEarnings;                              //  2.9% x 230,875 =  6,695.375
  const additional = (netEarnings - PAY.additionalThreshold.single) * PAY.additionalMedicare; // 30,875 x 0.9% = 277.875

  const t = engine.estimateTaxes(person('single', 45), 45, 0, 0, 0, 0, 0, 0, profit, 0, 0);
  near(t.seNetEarnings, netEarnings, 'net earnings');
  near(t.seSocialSecurity, ssPart, 'the old-age portion, capped at the base');
  near(t.seMedicare, medPart, 'the Medicare portion, uncapped');
  near(t.seDeductibleHalf, 0.5 * (ssPart + medPart), 'and half of the two is deductible');
  near(t.payroll, ssPart + medPart + additional, 'payroll');
});

test('X08: net earnings below the $400 floor are not taxed at all', () => {
  /* Schedule SE\'s own threshold. $400 of NET earnings, so about $433 of profit. */
  const justUnder = (SE_MINIMUM - 1) / NET_FACTOR;
  const justOver = (SE_MINIMUM + 1) / NET_FACTOR;
  const t = (profit) => engine.estimateTaxes(person('single', 45), 45, 0, 0, 0, 0, 0, 0, profit, 0, 0);
  assert.equal(t(justUnder).seSocialSecurity, 0, 'below the floor, nothing');
  assert.ok(t(justOver).seSocialSecurity > 0, 'above it, the WHOLE amount is taxed, not the excess');
  near(t(justOver).seSocialSecurity, SE_OASDI * (justOver * NET_FACTOR), 'and it is the whole amount');
});

/* ---------------------------------------------------------------- THE MIXED ROW */

test('X08: mixed wages and self-employment, ONE person -- wages consume the old-age base first (IRC 1402(b)(1))', () => {
  const wages = 150000;
  const profit = 100000;
  const netEarnings = profit * NET_FACTOR;                                    // 92,350.00
  const roomLeft = Math.max(0, PAY.oasdiWageBase - wages);                    // 184,500 - 150,000 = 34,500
  const ssPart = SE_OASDI * Math.min(netEarnings, roomLeft);                  // 12.4% x 34,500 = 4,278.00
  const medPart = SE_MEDICARE * netEarnings;                                  //  2.9% x 92,350 = 2,678.15

  /* WITHOUT the coordination this would be 12.4% x 92,350 = $11,451.40. The difference, $7,173.40, is
     what this test exists to pin, and it is invisible to a wages-only or a profit-only case. */
  assert.equal(ssPart.toFixed(2), '4278.00', 'CONTROL: the derived figure');
  assert.equal((SE_OASDI * netEarnings).toFixed(2), '11451.40', 'CONTROL: and what it would be uncoordinated');

  const t = engine.estimateTaxes(person('single', 45), 45, wages, 0, 0, wages, 0, 0, profit, 0, 0);
  near(t.seSocialSecurity, ssPart, 'the old-age portion sees only the room the wages left');
  near(t.seMedicare, medPart, 'while the Medicare portion is uncapped and unaffected');
});

test('X08: mixed wages and self-employment -- the Additional Medicare base is the two TOGETHER (IRC 1401(b)(2))', () => {
  const wages = 150000;
  const profit = 100000;
  const netEarnings = profit * NET_FACTOR;                                    // 92,350.00
  const threshold = PAY.additionalThreshold.single;                           // 200,000

  /* NEITHER alone reaches the threshold. That is the whole point. */
  assert.ok(wages < threshold, 'CONTROL: $150,000 of wages is below $200,000');
  assert.ok(netEarnings < threshold, 'CONTROL: and $92,350 of net earnings is below it too');
  const combinedOver = wages + netEarnings - threshold;                       // 42,350.00
  const additional = combinedOver * PAY.additionalMedicare;                   // 42,350 x 0.9% = 381.15
  assert.equal(additional.toFixed(2), '381.15', 'CONTROL: the derived figure');

  const wagesOnly = engine.estimateTaxes(person('single', 45), 45, wages, 0, 0, wages, 0, 0, 0, 0, 0);
  const both = engine.estimateTaxes(person('single', 45), 45, wages, 0, 0, wages, 0, 0, profit, 0, 0);
  const ssPart = SE_OASDI * Math.min(netEarnings, Math.max(0, PAY.oasdiWageBase - wages));
  const medPart = SE_MEDICARE * netEarnings;
  near(both.payroll - wagesOnly.payroll, ssPart + medPart + additional,
    'adding the profit adds its own two portions AND the Additional Medicare the combination creates');
});

test('X08: the old-age coordination is PER PERSON -- a spouse\'s wages do not consume the other\'s base', () => {
  /* The contrast that shows which of the two coordinations is per person and which is per household.
     Same dollars as the mixed row above, moved to the other spouse. */
  const wages = 150000;             // the self's
  const profit = 100000;            // the SPOUSE's
  const netEarnings = profit * NET_FACTOR;

  /* The spouse has no wages, so their whole base is free: the old-age portion is uncapped here. */
  const ssPart = SE_OASDI * Math.min(netEarnings, PAY.oasdiWageBase);        // 12.4% x 92,350 = 11,451.40
  assert.equal(ssPart.toFixed(2), '11451.40',
    'CONTROL: the spouse pays the FULL amount the self would have paid only $4,278.00 of');

  /* And the Additional Medicare base is the household's, so at mfj it is not reached at all. */
  const combined = wages + netEarnings;                                       // 242,350.00
  assert.ok(combined < PAY.additionalThreshold.mfj, 'CONTROL: $242,350 is under the $250,000 joint threshold');

  const t = engine.estimateTaxes(person('mfj', 45, true, 45), 45, wages, 0, 0, wages, 0, 0, 0, profit, 0);
  near(t.seSocialSecurity, ssPart, 'the spouse\'s own base is untouched by the self\'s wages');
  near(t.payroll,
    Math.min(wages, PAY.oasdiWageBase) * PAY.oasdiEmployee + wages * PAY.medicareEmployee
      + ssPart + SE_MEDICARE * netEarnings,
    'and no Additional Medicare is due at all');
});

/* ---------------------------------------------------------------- Arizona */

test('X08: Arizona, single, 65 or older -- flat rate on AGI less the standard deduction and one exemption', () => {
  const income = 100000;
  /* S5AA R48 (AA1-16, the owner's AA1 decision of 2026-10-03): Arizona also subtracts the federal senior deduction (A.R.S. 43-1022(35)):
     6,000 - 6% x (100,000 - 75,000) = 4,500. Was 81,800 x 2.5% = 2,045.00. */
  const base = income - AZ_STD('single') - AZ_65 - 4500;   // 100,000 - 16,100 - 2,100 - 4,500 = 77,300
  const derived = base * RULES.arizona.rate;               // x 2.5% = 1,932.50
  assert.equal(derived.toFixed(2), '1932.50', 'CONTROL: the derived figure');
  near(engine.estimateTaxes(person('single', 70), 70, income, 0, 0, 0, 0, 0, 0, 0, 0).az, derived, 'Arizona');
});

test('X08: Arizona, joint, both 65 or older -- the joint deduction and TWO exemptions', () => {
  const income = 200000;
  /* S5AA R48 (AA1-16): less the federal senior deduction, 6,000 - 6% x (200,000 - 150,000) = 3,000 for each spouse (43-1022(35)).
     Was 163,600 x 2.5% = 4,090.00. */
  const base = income - AZ_STD('mfj') - 2 * AZ_65 - 2 * 3000; // 200,000 - 32,200 - 4,200 - 6,000 = 157,600
  const derived = base * RULES.arizona.rate;               // x 2.5% = 3,940.00
  assert.equal(derived.toFixed(2), '3940.00', 'CONTROL: the derived figure');
  near(engine.estimateTaxes(person('mfj', 70, true, 70), 70, income, 0, 0, 0, 0, 0, 0, 0, 0).az, derived, 'Arizona');
});

test('X08: Arizona excludes taxable Social Security entirely, and the exclusion is the whole taxable part', () => {
  /* Arizona AGI is federal AGI less the federally taxable benefit, so the benefit is worth deriving in
     full rather than asserting the difference: it is the only moving part. */
  const ordinary = 40000;
  const benefit = 30000;
  const bands = RULES.federal.socialSecurityTaxation;
  const lower = bands.base.single, upper = bands.upper.single;
  const provisional = ordinary + benefit * 0.5;                          // 55,000
  const firstBand = Math.min(benefit * 0.5, (upper - lower) * 0.5);      // min(15,000, 4,500) = 4,500
  const taxableSS = Math.min(benefit * 0.85, firstBand + (provisional - upper) * 0.85); // 22,350
  assert.ok(provisional > upper, 'CONTROL: this household is in the 85% band');
  assert.equal(taxableSS.toFixed(2), '22350.00', 'CONTROL: the derived taxable benefit');

  const federalAgi = ordinary + taxableSS;                               // 62,350
  const azAgi = federalAgi - taxableSS;                                  // 40,000 -- the benefit is out
  /* S5AA R48 (AA1-16): less the federal senior deduction (43-1022(35)), the full 6,000 (MAGI 62,350 is under 75,000). Was 545.00. */
  const derived = (azAgi - AZ_STD('single') - AZ_65 - 6000) * RULES.arizona.rate; // (40,000-16,100-2,100-6,000) x 2.5% = 395.00
  assert.equal(derived.toFixed(2), '395.00', 'CONTROL: the derived figure');

  const t = engine.estimateTaxes(person('single', 70), 70, ordinary, 0, benefit, 0, 0, 0, 0, 0, 0);
  near(t.ssTaxable, taxableSS, 'the taxable benefit');
  near(t.az, derived, 'Arizona, with the benefit excluded');
});

test('X08: Arizona never goes below zero', () => {
  /* The deduction and the exemption exceed the income, so the base clamps rather than turning negative
     and crediting tax that is not owed. */
  const income = AZ_STD('single') - 1000;
  near(engine.estimateTaxes(person('single', 70), 70, income, 0, 0, 0, 0, 0, 0, 0, 0).az, 0, 'Arizona');
});
