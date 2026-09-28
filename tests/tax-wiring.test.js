'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shellPath = path.join(__dirname, '..', 'src', 'app-shell.html');
const shell = fs.readFileSync(shellPath, 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
if (!rulesMatch) throw new Error('tax-wiring.test.js: could not find the embedded RULES JSON block in src/app-shell.html');
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');
const { createTaxCalculator, taxIncome } = require('../src/ported/tax-engine');

// ---------------------------------------------------------------------------
// RULES.federal.capitalGains data-correctness check (found while building the
// differential test below): the embedded 2026 brackets for all three filing
// statuses were actually 2025 figures. Confirmed against Rev. Proc. 2025-32
// via three independent secondary sources (Tax Foundation, Kiplinger, and a
// third cross-check), all agreeing exactly. Corrected 2026-09-09 -- this
// pins the correct values so a future accidental revert to the stale 2025
// numbers is caught immediately rather than silently shipping wrong tax data.
// ---------------------------------------------------------------------------
test('RULES.federal.capitalGains: 2026 brackets match IRS Rev. Proc. 2025-32 (not the 2025 figures)', () => {
  assert.deepEqual(RULES.federal.capitalGains.single, [[49450, 0], [545500, 0.15], [null, 0.20]]);
  assert.deepEqual(RULES.federal.capitalGains.mfj, [[98900, 0], [613700, 0.15], [null, 0.20]]);
  assert.deepEqual(RULES.federal.capitalGains.hoh, [[66200, 0], [579600, 0.15], [null, 0.20]]);
});

// ---------------------------------------------------------------------------
// Part 1: taxableSocialSecurity() bug fix (Track C7).
//
// The pre-fix formula capped the phase-in band at (upper-base)*0.5 instead of
// min(benefit, upper-base)*0.5 -- i.e. it never actually bounded the taxable
// amount by the benefit itself in the middle tier. This reproduces the exact
// buggy formula locally (not by reverting engine.js) so the "old code really
// was wrong, and by how much" claim is proven rather than assumed.
// ---------------------------------------------------------------------------

function buggyTaxableSocialSecurity(benefit, otherIncome, filing) {
  if (benefit <= 0) return 0;
  const base = RULES.federal.socialSecurityTaxation.base[filing];
  const upper = RULES.federal.socialSecurityTaxation.upper[filing];
  const provisional = otherIncome + benefit * 0.5;
  if (provisional <= base) return 0;
  const first = Math.min(provisional - base, upper - base) * 0.5;
  const second = Math.max(0, provisional - upper) * 0.85;
  return Math.min(benefit * 0.85, first + second);
}

// IRS-correct reference, independently written (not copy-pasted from
// engine.js) so this test can't just be asserting the fixed code against
// itself -- matches src/ported/tax-engine.js's algorithm, which is itself
// verified against the Python oracle.
function correctTaxableSocialSecurity(benefit, otherIncome, filing) {
  if (benefit <= 0) return 0;
  const base = RULES.federal.socialSecurityTaxation.base[filing];
  const upper = RULES.federal.socialSecurityTaxation.upper[filing];
  const combined = otherIncome + benefit * 0.5;
  if (combined <= base) return 0;
  if (combined <= upper) return Math.min(0.5 * benefit, 0.5 * (combined - base));
  const firstBand = Math.min(0.5 * benefit, 0.5 * (upper - base));
  return Math.min(0.85 * benefit, firstBand + 0.85 * (combined - upper));
}

test('taxableSocialSecurity: fixed engine.js matches an independent IRS-formula reference', () => {
  const filings = ['single', 'mfj', 'hoh'];
  const benefits = [0, 1, 500, 2000, 6000, 8999, 9000, 9001, 11999, 12000, 12001, 18000, 25000, 40000, 60000];
  const otherIncomes = [0, 5000, 20000, 25000, 26000, 30000, 31999, 32000, 33999, 34000, 34001, 43999, 44000, 44001, 60000, 90000, 150000];
  for (const filing of filings) {
    for (const benefit of benefits) {
      for (const otherIncome of otherIncomes) {
        const actual = engine.taxableSocialSecurity(benefit, otherIncome, filing);
        const expected = correctTaxableSocialSecurity(benefit, otherIncome, filing);
        assert.equal(
          actual, expected,
          `${filing} benefit=${benefit} otherIncome=${otherIncome}: got ${actual}, expected ${expected}`
        );
      }
    }
  }
});

test('taxableSocialSecurity: never exceeds 85% of the benefit itself, for any input', () => {
  const filings = ['single', 'mfj', 'hoh'];
  const benefits = [1, 2000, 8999, 20000, 100000];
  const otherIncomes = [0, 10000, 34000, 100000, 1000000];
  for (const filing of filings) {
    for (const benefit of benefits) {
      for (const otherIncome of otherIncomes) {
        const taxable = engine.taxableSocialSecurity(benefit, otherIncome, filing);
        assert.ok(taxable <= benefit * 0.85 + 1e-9, `${filing} benefit=${benefit} otherIncome=${otherIncome}: taxable ${taxable} exceeds 85% cap`);
      }
    }
  }
});

test('taxableSocialSecurity: reproduces the flagged bug in the pre-fix formula, confirming the fix actually mattered', () => {
  // Middle-tier divergence (the worst case, ~70% overstatement): small benefit,
  // otherIncome pushing combined income into the taxable range without
  // reaching the upper threshold.
  const filing = 'single';
  const benefit = 2000;
  const otherIncome = 30000; // combined = 30000 + 1000 = 31000, base=25000, upper=34000 -- middle tier
  const buggy = buggyTaxableSocialSecurity(benefit, otherIncome, filing);
  const fixed = engine.taxableSocialSecurity(benefit, otherIncome, filing);
  const correct = correctTaxableSocialSecurity(benefit, otherIncome, filing);

  assert.equal(fixed, correct, 'fixed engine.js must match the correct formula');
  assert.notEqual(buggy, correct, 'sanity check: the old formula must actually have been wrong for this input, or this test proves nothing');
  const overstatementPct = (buggy / correct - 1) * 100;
  assert.ok(overstatementPct > 50 && overstatementPct < 80, `expected ~50-70% overstatement matching the originally flagged bug, got ${overstatementPct.toFixed(1)}%`);
});

test('taxableSocialSecurity: benefits above the phase-in-band width (>= upper-base) were already correct pre-fix', () => {
  // The bug only bites when benefit < (upper - base) -- i.e. roughly
  // $9,000/yr single, $12,000/yr MFJ, matching the originally flagged
  // description. Above that width the old and new formulas agree exactly,
  // which is why this had gone unnoticed for "typical" benefit amounts.
  const cases = [
    ['single', 15000, 40000],
    ['single', 25000, 60000],
    ['mfj', 20000, 50000],
    ['mfj', 30000, 70000],
  ];
  for (const [filing, benefit, otherIncome] of cases) {
    const buggy = buggyTaxableSocialSecurity(benefit, otherIncome, filing);
    const fixed = engine.taxableSocialSecurity(benefit, otherIncome, filing);
    assert.equal(buggy, fixed, `${filing} benefit=${benefit} otherIncome=${otherIncome}: expected old and new to already agree above the bug's benefit threshold`);
  }
});

// ---------------------------------------------------------------------------
// Part 2: taxConfigForFilingStatus() + differential test against the
// independently Python-verified src/ported/tax-engine.js.
//
// engine.js's own marginalTax()/capitalGainsTax() implement the same
// stacked-bracket algorithm as tax-engine.js's progressiveTax()/stackedTax()
// (confirmed by reading both implementations side by side -- see the C1
// completion notes), so this test verifies that equivalence empirically
// across all three filing statuses rather than leaving it as an unverified
// reading of the code. Capital losses are excluded from these cases because
// the calculator's own basis-percentage model (clamped 0-100) makes a
// realized loss structurally unreachable -- confirmed by checking the actual
// input clamp in src/app-shell.html, not assumed.
// ---------------------------------------------------------------------------

function engineToTaxEngineIncome(args) {
  return taxIncome({
    ordinaryIncome: args.ordinaryIncome,
    qualifiedDividends: args.qualifiedDividends,
    nonqualifiedDividends: 0,
    longTermGains: args.capitalGains,
    treasuryInterest: 0,
    socialSecurity: args.ssBenefit,
    capitalLossCarryforward: 0,
  });
}

const DIFFERENTIAL_CASES = [
  { ordinaryIncome: 0, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0 },
  { ordinaryIncome: 60000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0 },
  { ordinaryIncome: 60000, capitalGains: 15000, qualifiedDividends: 3000, ssBenefit: 0 },
  { ordinaryIncome: 40000, capitalGains: 5000, qualifiedDividends: 1000, ssBenefit: 24000 },
  { ordinaryIncome: 15000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 6000 },
  { ordinaryIncome: 0, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 40000 },
  { ordinaryIncome: 250000, capitalGains: 80000, qualifiedDividends: 20000, ssBenefit: 30000 },
  { ordinaryIncome: 900000, capitalGains: 500000, qualifiedDividends: 100000, ssBenefit: 50000 },
  // boundary-exact: ordinary income landing exactly on a bracket ceiling
  { ordinaryIncome: 50400, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0 },
  // boundary-exact: SS combined income landing exactly on the base threshold
  { ordinaryIncome: 25000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0 },
];

test('taxConfigForFilingStatus(): derived config matches embedded RULES exactly, single/mfj/hoh', () => {
  for (const filing of ['single', 'mfj', 'hoh']) {
    const config = engine.taxConfigForFilingStatus(filing);
    assert.deepEqual(config.ordinary_brackets, RULES.federal.ordinaryBrackets[filing]);
    assert.deepEqual(config.ltcg_brackets, RULES.federal.capitalGains[filing]);
    assert.deepEqual(config.ss_combined_income_thresholds_nominal, [
      RULES.federal.socialSecurityTaxation.base[filing],
      RULES.federal.socialSecurityTaxation.upper[filing],
    ]);
    assert.equal(config.niit_rate, RULES.federal.niit.rate);
    assert.equal(config.niit_threshold_nominal, RULES.federal.niit.threshold[filing]);
    assert.equal(config.standard_deduction, RULES.federal.standardDeduction[filing]);
    assert.equal(config.arizona_rate, RULES.arizona.rate);
    // S5 task 8: Arizona's own 2026 basic standard deduction record (INFERRED), which Chapter 140 sets to the
    // federal amount. The ported engine takes no age-65 exemption, so the parity cases below stay at age 40.
    assert.equal(config.arizona_standard_deduction, RULES.arizona.records.find((r) => r.provision_id === 'az_basic_standard_deduction' && r.filing_status === filing).value);
    assert.equal(config.arizona_standard_deduction, RULES.federal.standardDeduction[filing], 'the same amount as the federal deduction');
    // Deliberately NOT importing the Python engine's unverified 25% Arizona
    // LTCG subtraction without independent sourcing (see roadmap Track C1).
    assert.equal(config.arizona_ltcg_subtraction, 0);
  }
});

test('federal ordinary+preferential tax: engine.js matches the ported, Python-verified tax engine', () => {
  for (const filing of ['single', 'mfj', 'hoh']) {
    const config = engine.taxConfigForFilingStatus(filing);
    const calculator = createTaxCalculator(config);
    for (const c of DIFFERENTIAL_CASES) {
      const wages = c.ordinaryIncome;
      const engineResult = engine.estimateTaxes(
        { profile: { filing, spouseOn: false, age: 40 } },
        40, c.ordinaryIncome, c.capitalGains, c.ssBenefit, wages, c.qualifiedDividends, 0
      );
      const portedResult = calculator.calculate(engineToTaxEngineIncome(c));

      const engineFederal = engineResult.federal;
      const portedFederal = portedResult.federalOrdinary + portedResult.federalPreferential;
      assert.ok(
        Math.abs(engineFederal - portedFederal) < 0.01,
        `${filing} federal mismatch for ${JSON.stringify(c)}: engine=${engineFederal.toFixed(4)} ported=${portedFederal.toFixed(4)}`
      );

      assert.ok(
        Math.abs(engineResult.niit - portedResult.niit) < 0.01,
        `${filing} NIIT mismatch for ${JSON.stringify(c)}: engine=${engineResult.niit.toFixed(4)} ported=${portedResult.niit.toFixed(4)}`
      );

      assert.ok(
        Math.abs(engineResult.az - portedResult.arizona) < 0.01,
        `${filing} Arizona mismatch for ${JSON.stringify(c)}: engine=${engineResult.az.toFixed(4)} ported=${portedResult.arizona.toFixed(4)}`
      );

      assert.ok(
        Math.abs(engineResult.ssTaxable - portedResult.taxableSocialSecurity) < 0.01,
        `${filing} taxable-SS mismatch for ${JSON.stringify(c)}: engine=${engineResult.ssTaxable.toFixed(4)} ported=${portedResult.taxableSocialSecurity.toFixed(4)}`
      );
    }
  }
});
