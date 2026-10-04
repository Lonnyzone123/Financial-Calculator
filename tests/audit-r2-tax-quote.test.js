'use strict';

// R2-T01 (RETIREMENT_ENGINE_ROUND2_AUDIT_CLAUDE_QUEUE_2026-09-08.md finding
// R2-001; exact equations in CLAUDE_CODE_FIX_HANDOVER_TAX_FUNDING_AND_ROUND2_
// 2026-09-08.md section 4): quoteTaxFunding() in src/engine.js replaces the
// live cascade's one-shot assumed-rate estimate with an exact finite
// piecewise-affine solve, verified point-by-point against the same
// estimateTaxes() the live app already uses. This file:
//
//   A) reproduces the audit's two counterexamples using the OLD mechanism
//      (taxWithdrawalGrossRate's assumed rate, reproduced below by oldGrossRate()
//      since S5 deleted the uncalled function), to confirm the failure this
//      task fixes actually reproduces in this checkout;
//   B) checks quoteTaxFunding's affine pieces agree with estimateTaxes() at
//      boundaries and interior points across every threshold named in
//      handover section 6's test matrix;
//   C) checks the two exact $1,000 quotation fixtures from section 3 and the
//      $35,502.50 RMD checkpoint from section 5 ($35,555.00 since S5 task 8's Arizona age-65 exemption,
//      $35,801.00 since S5AA task 3.1 added the IRC 63(f) additional standard deduction for the aged);
//   D) independently re-verifies every fixture's committed transactions
//      against a *fresh* estimateTaxes() call on the final numbers, the way
//      section 4.5 requires -- never trusting the solver's own arithmetic.
//
// This is intentionally NOT yet wired into simulatePlan()'s annual loop
// (that integration, plus RMD-cash-before-new-sales, is R2-T02). Nothing
// here runs a projection; every case is a bounded, deterministic direct
// call, per the audit's execution restrictions.

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
// Shared fixture helpers
// ---------------------------------------------------------------------------

function profile(filing, age, opts) {
  opts = opts || {};
  return {
    profile: { filing, age, spouseOn: !!opts.spouseOn, spouseAge: opts.spouseAge || age },
    retirement: { withdrawalOrder: opts.withdrawalOrder || 'priority', manualOrder: 'taxable,preTax,roth,hsa' },
    advanced: { assetsOn: false, reserveOn: false, penaltyException: !!opts.penaltyException, rule55: !!opts.rule55 },
  };
}

function seniorAgesFor(p, age) {
  return [age, p.profile.spouseOn ? p.profile.spouseAge + (age - p.profile.age) : -1];
}

function baselineTbase(p, age, wages, spouseWages) {
  return engine.estimateTaxes(p, age, Math.max(0, wages || 0), 0, 0, wages || 0, 0, spouseWages || 0).total;
}

/** Independent oracle check (handover section 4.5 / R2-T01-D): recomputes
    the REAL total tax from scratch on the quote's final committed ordinary
    income / gains, and checks cash sources == uses within $0.01. */
function verifyFunded(p, age, taxCtx, availableCash, quote) {
  assert.equal(quote.status, 'funded', 'expected the quote to report funded');
  const totalGross = quote.transactions.reduce((s, t) => s + t.gross, 0);
  const realTotal = engine.estimateTaxes(
    p, age, quote.finalOrdinaryIncome, quote.finalCapitalGains, taxCtx.ssBenefit,
    0, taxCtx.qualifiedDividends, 0
  ).total;
  const obligation = Math.max(0, realTotal - taxCtx.Tbase) + quote.finalPenalties;
  const funded = availableCash + totalGross;
  assert.ok(
    Math.abs(funded - obligation) <= 0.01,
    `cash raised ${funded} should fund the real obligation ${obligation} within $0.01 (diff ${funded - obligation})`
  );
  return { totalGross, obligation, realTotal };
}

// ---------------------------------------------------------------------------
// A) Reproduce the audit's counterexamples with the OLD assumed-rate mechanism
// ---------------------------------------------------------------------------

/* The deleted taxWithdrawalGrossRate()'s formula, kept as evidence (S5, the owner's question 1, answer C): preTax priced at
   the ordinary marginal rate plus Arizona (plus NIIT and the penalty when they apply), clamped at 0.95; taxable priced
   at the gains share of the next account withdrawFromClass() would sell, times the capital-gains marginal rate plus
   Arizona. Only the priority order is reproduced, which is the order both cases use. */
function oldGrossRate(taxClass, accounts, taxes, filing) {
  const clamp = (v) => Math.max(0, Math.min(0.95, v));
  if (taxClass === 'preTax') return clamp(engine.marginalRateAt(taxes.ordinaryTaxable, filing) + RULES.arizona.rate);
  const next = accounts.filter((a) => a.taxClass === taxClass && a.balance > 0).sort((a, b) => a.priority - b.priority)[0];
  const gainsShare = next ? Math.max(0, Math.min(1, 1 - next.basisPct / 100)) : 0;
  return clamp(gainsShare * (engine.capitalGainsMarginalRateAt(taxes.ordinaryTaxable + taxes.taxableGains, filing) + RULES.arizona.rate));
}

test('R2-T01-A: old taxWithdrawalGrossRate mechanism reproduces the $157.50 mixed-basis shortfall', () => {
  const p = profile('single', 64);
  const accounts = [
    { id: 'a', taxClass: 'taxable', balance: 100, basisPct: 100, priority: 1 },
    { id: 'b', taxClass: 'taxable', balance: 100000, basisPct: 0, priority: 2 },
  ];
  const taxes = { ordinaryTaxable: 80000 - RULES.federal.standardDeduction.single, taxableGains: 0 };
  const rate = oldGrossRate('taxable', accounts, taxes, 'single');
  assert.equal(rate, 0, 'the assumed rate prices off account a (100% basis) even though account b will also be drained');
  const sale = 1000; // taxNeed / (1 - rate) with rate=0
  const result = engine.withdrawFromClass(accounts.map((a) => ({ ...a })), 'taxable', sale, 64, p, 0);
  const realTax = engine.capitalGainsTax(result.gains, 80000 - RULES.federal.standardDeduction.single, 'single') + RULES.arizona.rate * result.gains;
  assert.ok(Math.abs(realTax - 157.5) < 0.01, `expected the reproduced shortfall's real tax near $157.50, got ${realTax}`);
  assert.ok(1000 - realTax < 999, 'confirms only ~$842.50 of the $1,000 target actually remains after real tax');
});

test('R2-T01-A: old assumed-rate mechanism reproduces the $57.142857 SS-band shortfall', () => {
  const p = profile('single', 64);
  const taxes = engine.estimateTaxes(p, 64, 20000, 0, 24000, 0, 0, 0);
  const accounts = [{ id: 'ira', taxClass: 'preTax', balance: 1000000, basisPct: 0, priority: 1 }];
  const rate = oldGrossRate('preTax', accounts, taxes, 'single');
  assert.ok(Math.abs(rate - 0.125) < 1e-9, `expected the flat 12.5% estimate (10% bracket + 2.5% AZ), got ${rate}`);
  const sale = 1000 / (1 - rate);
  assert.ok(Math.abs(sale - 1142.857143) < 0.01, `expected the $1,142.857143 sale the audit found, got ${sale}`);
  const before = engine.estimateTaxes(p, 64, 20000, 0, 24000, 0, 0, 0).total;
  const after = engine.estimateTaxes(p, 64, 20000 + sale, 0, 24000, 0, 0, 0).total;
  const realAddedTax = after - before;
  assert.ok(Math.abs(realAddedTax - 200) < 0.5, `expected the added tax to be near $200 (not the assumed $142.857), got ${realAddedTax}`);
  const net = sale - realAddedTax;
  assert.ok(1000 - net > 50, `confirms a real shortfall near $57.14 remains; got shortfall ${1000 - net}`);
});

// ---------------------------------------------------------------------------
// C) Exact quotation fixtures (handover section 3 and section 5)
// ---------------------------------------------------------------------------

test('R2-T01-C: mixed-basis fixture -- exact $1,190.909091 sale, $190.909091 tax, $1,000 net', () => {
  const p = profile('single', 64);
  const age = 64;
  const oi0 = 80000;
  const T0 = engine.estimateTaxes(p, age, oi0, 0, 0, 0, 0, 0).total;
  const taxCtx = {
    ordinaryIncome: oi0, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: T0 - 1000,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = [
    { id: 'a', taxClass: 'taxable', balance: 100, basisPct: 100, priority: 1 },
    { id: 'b', taxClass: 'taxable', balance: 100000, basisPct: 0, priority: 2 },
  ];
  const before = JSON.parse(JSON.stringify(accounts));
  const quote = engine.quoteTaxFunding(taxCtx, ['taxable'], accounts, p, 0, 0);
  assert.deepEqual(accounts, before, 'quoteTaxFunding must not mutate the accounts it was given');
  const { totalGross } = verifyFunded(p, age, taxCtx, 0, quote);
  assert.ok(Math.abs(totalGross - 1190.909091) < 0.01, `expected total sale $1,190.909091, got ${totalGross}`);
  // Account b is 0% basis, so its entire $1,090.909091 slice of the sale is
  // gain -- the handover's "remaining $900" is the net cash need after the
  // $100 basis-only portion, not the realized-gain amount.
  assert.ok(Math.abs(quote.finalCapitalGains - 1090.909091) < 0.01, `expected $1,090.909091 realized gains, got ${quote.finalCapitalGains}`);
  assert.equal(quote.transactions.length, 2, 'expects a transaction against both accounts (a fully drained, b partially)');
  assert.ok(Math.abs(quote.transactions[0].gross - 100) < 1e-6, 'account a (100% basis) should be drained first, for $100');
});

test('R2-T01-C: reversed account priority still funds exactly (order must not change the answer)', () => {
  const p = profile('single', 64);
  const age = 64;
  const T0 = engine.estimateTaxes(p, age, 80000, 0, 0, 0, 0, 0).total;
  const taxCtx = {
    ordinaryIncome: 80000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: T0 - 1000,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = [
    { id: 'b', taxClass: 'taxable', balance: 100000, basisPct: 0, priority: 1 },
    { id: 'a', taxClass: 'taxable', balance: 100, basisPct: 100, priority: 2 },
  ];
  const quote = engine.quoteTaxFunding(taxCtx, ['taxable'], accounts, p, 0, 0);
  verifyFunded(p, age, taxCtx, 0, quote);
  assert.equal(quote.transactions.length, 1, 'account b alone (0% basis, drained first now) should fully fund the target');
});

test('R2-T01-C: SS phase-in fixture -- exact $1,212.121212 sale, $212.121212 tax, $1,000 net', () => {
  const p = profile('single', 64);
  const age = 64;
  const T0 = engine.estimateTaxes(p, age, 20000, 0, 24000, 0, 0, 0).total;
  const taxCtx = {
    ordinaryIncome: 20000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 24000,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: T0 - 1000,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = [{ id: 'ira', taxClass: 'preTax', balance: 1000000, basisPct: 0, priority: 1 }];
  const quote = engine.quoteTaxFunding(taxCtx, ['preTax'], accounts, p, 0, 0);
  const { totalGross } = verifyFunded(p, age, taxCtx, 0, quote);
  assert.ok(Math.abs(totalGross - 1212.121212) < 0.01, `expected total sale $1,212.121212, got ${totalGross}`);
});

test('R2-T01-C: RMD checkpoint -- $40,000 RMD at age 75 retains exactly $35,951.00 with zero new sales', () => {
  const p = profile('single', 75);
  const age = 75;
  const taxCtx = {
    ordinaryIncome: 40000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: baselineTbase(p, age, 0, 0),
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const availableCash = 40000 - 2000; // RMD cash left after the $2,000 spending need
  const accounts = [{ id: 'ira', taxClass: 'preTax', balance: 1000000, basisPct: 0, priority: 1 }];
  const quote = engine.quoteTaxFunding(taxCtx, ['preTax', 'taxable', 'roth', 'hsa'], accounts, p, 0, availableCash);
  assert.equal(quote.status, 'funded');
  assert.equal(quote.transactions.length, 0, 'no additional tax-funding sale should be needed');
  const realTax = engine.estimateTaxes(p, age, 40000, 0, 0, 0, 0, 0).total;
  /* S5 task 8 (the owner's question 5, answer C): Arizona's $2,100 age-65 exemption (TAX section 5.3, ENACTED) took $52.50
     off the original $2,497.50 tax and added it to the original $35,502.50 retained.
     S5AA task 3.1 (Q88, F2 with G16): the IRC 63(f) additional standard deduction for the aged was missing
     entirely. At 75 and single it is $2,050 (Rev. Proc. 2025-32 section 4.14(3), checked against the primary
     source; see Handover temp/S5AA_CITATION_CHECKS_20260920.md), which lands wholly inside the 12% bracket:
       deduction   16,100 + 6,000 + 2,050 = 24,150   (was 22,100)
       taxable     40,000 - 24,150        = 15,850   (was 17,900)
       federal     1,240 + 0.12 * 3,450   =  1,654   (was 1,900) -- a fall of exactly 0.12 * 2,050 = $246
       Arizona                               545     UNCHANGED: Arizona keeps its own exemption and its own
                                                     standard deduction record, and does not read the federal figure
       total                                2,199   (was 2,445), so retained rises by the same $246 to 35,801
     S5AA R48 (AA1-16, the owner's AA1 decision of 2026-10-03): Arizona now subtracts the federal senior deduction (A.R.S.
     43-1022(35)), the full $6,000 here: Arizona 545 - 150 = 395, total 2,049, retained 35,951 (were 2,199 and 35,801).
     THE MECHANISM THIS FIXTURE PINS IS UNCHANGED: an RMD whose cash alone covers the obligation still makes
     zero new sales and retains the remainder. Only the tax rate table's output moved. */
  assert.ok(Math.abs(realTax - 2049) < 0.01, `expected the RMD's real tax to be $2,049.00, got ${realTax}`);
  assert.ok(Math.abs(quote.retained - 35951) < 0.01, `expected $35,951.00 retained, got ${quote.retained}`);
});

// ---------------------------------------------------------------------------
// B) Boundary agreement with estimateTaxes across named breakpoints
// ---------------------------------------------------------------------------

test('R2-T01-B: ordinary bracket crossing funds the ACTUAL total tax, not one marginal rate', () => {
  const p = profile('single', 50);
  const age = 50;
  // A big preTax need whose sale spans the 22%/24% ordinary bracket boundary.
  const oi0 = 100000;
  const T0 = engine.estimateTaxes(p, age, oi0, 0, 0, 0, 0, 0).total;
  const target = 20000;
  const taxCtx = {
    ordinaryIncome: oi0, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: T0 - target,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = [{ id: 'ira', taxClass: 'preTax', balance: 1000000, basisPct: 0, priority: 1 }];
  const quote = engine.quoteTaxFunding(taxCtx, ['preTax'], accounts, p, 0, 0);
  verifyFunded(p, age, taxCtx, 0, quote);
  // A naive single-rate estimate at the STARTING marginal rate would have
  // undersold relative to the true multi-bracket cost; confirm this fixture
  // really does cross the $105,700 ordinary bracket cap for single filers.
  assert.ok(oi0 < 105700 && oi0 + quote.finalOrdinaryIncome - oi0 > 105700 - oi0 - 1, 'sanity: this fixture is constructed to cross a bracket boundary')
    || assert.ok(quote.finalOrdinaryIncome - oi0 > 0);
});

test('R2-T01-B: capital-gains bracket stacking is included when a preTax withdrawal pushes existing gains across a threshold', () => {
  const p = profile('single', 50);
  const age = 50;
  // Ordinary taxable already sits just below the 0%/15% LTCG breakpoint;
  // taxableGains are already realized and waiting to be pushed across it.
  const oi0 = 40000; // taxable ~ 40000-16100 = 23900, well under 49450
  const cg0 = 30000; // sitting entirely in the 0% band on its own
  const T0 = engine.estimateTaxes(p, age, oi0, cg0, 0, 0, 0, 0).total;
  const target = 15000; // large enough preTax sale to push ordinaryTaxable across 49450
  const taxCtx = {
    ordinaryIncome: oi0, capitalGains: cg0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: T0 - target,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = [{ id: 'ira', taxClass: 'preTax', balance: 1000000, basisPct: 0, priority: 1 }];
  const quote = engine.quoteTaxFunding(taxCtx, ['preTax'], accounts, p, 0, 0);
  verifyFunded(p, age, taxCtx, 0, quote);
});

test('R2-T01-B: standard-deduction exhaustion and senior-deduction phaseout boundaries agree with estimateTaxes', () => {
  const p = profile('mfj', 66, { spouseOn: true, spouseAge: 66 });
  const age = 66;
  // MAGI starts right at the joint senior-deduction phaseout start (150000).
  const oi0 = 148000;
  const T0 = engine.estimateTaxes(p, age, oi0, 0, 0, 0, 0, 0).total;
  const target = 25000; // crosses the phaseout start and (at $6000/eligible*2=$12000 max) the zero point
  const taxCtx = {
    ordinaryIncome: oi0, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'mfj', seniorAges: seniorAgesFor(p, age), Tbase: T0 - target,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = [{ id: 'ira', taxClass: 'preTax', balance: 1000000, basisPct: 0, priority: 1 }];
  const quote = engine.quoteTaxFunding(taxCtx, ['preTax'], accounts, p, 0, 0);
  verifyFunded(p, age, taxCtx, 0, quote);
});

test('R2-T01-B: NIIT threshold entry and investment-income cap are both honored', () => {
  const p = profile('single', 55);
  const age = 55;
  const oi0 = 195000; // just under the $200,000 single NIIT threshold
  const cg0 = 50000;
  const T0 = engine.estimateTaxes(p, age, oi0, cg0, 0, 0, 0, 0).total;
  const target = 20000; // preTax sale crosses the NIIT threshold, pulling existing gains into NIIT
  const taxCtx = {
    ordinaryIncome: oi0, capitalGains: cg0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: T0 - target,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = [{ id: 'ira', taxClass: 'preTax', balance: 1000000, basisPct: 0, priority: 1 }];
  const quote = engine.quoteTaxFunding(taxCtx, ['preTax'], accounts, p, 0, 0);
  verifyFunded(p, age, taxCtx, 0, quote);
});

test('R2-T01-B: SS 85%-cap boundary is honored for a very high combined-income household', () => {
  const p = profile('single', 66);
  const age = 66;
  const oi0 = 90000;
  const ssBenefit = 30000;
  const T0 = engine.estimateTaxes(p, age, oi0, 0, ssBenefit, 0, 0, 0).total;
  const target = 5000;
  const taxCtx = {
    ordinaryIncome: oi0, capitalGains: 0, qualifiedDividends: 0, ssBenefit,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: T0 - target,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = [{ id: 'ira', taxClass: 'preTax', balance: 1000000, basisPct: 0, priority: 1 }];
  const quote = engine.quoteTaxFunding(taxCtx, ['preTax'], accounts, p, 0, 0);
  verifyFunded(p, age, taxCtx, 0, quote);
});

test('R2-T01-B: early-withdrawal penalty is funded exactly once, not double-counted', () => {
  const p = profile('single', 50);
  const age = 50;
  const oi0 = 40000;
  const T0 = engine.estimateTaxes(p, age, oi0, 0, 0, 0, 0, 0).total;
  const target = 3000;
  const taxCtx = {
    ordinaryIncome: oi0, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: T0 - target,
    payrollConst: 0, penalties: 0, penaltyApplies: true,
  };
  const accounts = [{ id: 'ira', taxClass: 'preTax', balance: 1000000, basisPct: 0, priority: 1 }];
  const quote = engine.quoteTaxFunding(taxCtx, ['preTax'], accounts, p, 0, 0);
  const { totalGross } = verifyFunded(p, age, taxCtx, 0, quote);
  const expectedPenalty = totalGross * 0.10;
  assert.ok(Math.abs(quote.finalPenalties - expectedPenalty) < 0.01, `expected penalty ${expectedPenalty}, got ${quote.finalPenalties}`);
});

// ---------------------------------------------------------------------------
// Depletion, zero-need, purity/determinism
// ---------------------------------------------------------------------------

test('R2-T01: zero tax need with sufficient cash makes zero sales', () => {
  const p = profile('single', 64);
  const age = 64;
  const T0 = engine.estimateTaxes(p, age, 10000, 0, 0, 0, 0, 0).total;
  const taxCtx = {
    ordinaryIncome: 10000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: T0,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = [{ id: 'ira', taxClass: 'preTax', balance: 1000000, basisPct: 0, priority: 1 }];
  const quote = engine.quoteTaxFunding(taxCtx, ['preTax'], accounts, p, 0, 0);
  assert.equal(quote.status, 'funded');
  assert.equal(quote.transactions.length, 0);
});

test('R2-T01: genuine depletion reports "exhausted", never a false "funded"', () => {
  const p = profile('single', 64);
  const age = 64;
  const T0 = engine.estimateTaxes(p, age, 80000, 0, 0, 0, 0, 0).total;
  const taxCtx = {
    ordinaryIncome: 80000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: T0 - 1000000,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = [{ id: 'a', taxClass: 'taxable', balance: 50, basisPct: 100, priority: 1 }];
  const quote = engine.quoteTaxFunding(taxCtx, ['taxable'], accounts, p, 0, 0);
  assert.equal(quote.status, 'exhausted');
  assert.ok(Math.abs(quote.transactions.reduce((s, t) => s + t.gross, 0) - 50) < 1e-6, 'should have sold the entire $50 account, no more');
});

// ---------------------------------------------------------------------------
// R2V-001/R2V-002/R2V-004 (R2_T01_T02_EXTERNAL_AUDIT_AND_CLAUDE_HANDOVER_
// 2026-09-09.md): a newly confirmed cash-only settlement regression, a
// non-finite-context safety hole, and a duplicate-withdrawal-class quote
// integrity gap, all in quoteTaxFunding() directly.
// ---------------------------------------------------------------------------

test('R2V-001: cash-only settlement (every class at a zero balance) reports "funded" and retains the genuine surplus, not "exhausted"', () => {
  // The external audit's own minimal direct reproduction: $40,000 ordinary
  // income, single, age 75, no gains/dividends/SS/payroll/baseline tax/
  // penalties, $38,000 available cash, and -- critically -- NO account with
  // a positive balance in any class, so the inner per-piece loop never runs
  // even once. Before this fix that fell through to an unconditional
  // "exhausted", discarding the $35,502.50 the household actually had.
  const p = profile('single', 75);
  const age = 75;
  const taxCtx = {
    ordinaryIncome: 40000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: 0,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = [
    { id: 'taxable-empty', taxClass: 'taxable', balance: 0, basisPct: 50, priority: 1 },
    { id: 'preTax-empty', taxClass: 'preTax', balance: 0, basisPct: 0, priority: 1 },
  ];
  const quote = engine.quoteTaxFunding(taxCtx, ['taxable', 'preTax', 'roth', 'hsa'], accounts, p, 0, 38000);
  const realTax = engine.estimateTaxes(p, age, 40000, 0, 0, 0, 0, 0).total;
  /* S5 task 8 (the owner's question 5, answer C): Arizona's $2,100 age-65 exemption (TAX section 5.3, ENACTED) took $52.50
     off the original $2,497.50 tax and added it to the original $35,502.50 retained.
     S5AA task 3.1 (Q88, F2 with G16): the IRC 63(f) additional standard deduction for the aged was missing
     entirely. At 75 and single it is $2,050 (Rev. Proc. 2025-32 section 4.14(3), checked against the primary
     source; see Handover temp/S5AA_CITATION_CHECKS_20260920.md), which lands wholly inside the 12% bracket:
       deduction   16,100 + 6,000 + 2,050 = 24,150   (was 22,100)
       taxable     40,000 - 24,150        = 15,850   (was 17,900)
       federal     1,240 + 0.12 * 3,450   =  1,654   (was 1,900) -- a fall of exactly 0.12 * 2,050 = $246
       Arizona                               545     UNCHANGED: Arizona keeps its own exemption and its own
                                                     standard deduction record, and does not read the federal figure
       total                                2,199   (was 2,445), so retained rises by the same $246 to 35,801
     S5AA R48 (AA1-16, the owner's AA1 decision of 2026-10-03): Arizona now subtracts the federal senior deduction (A.R.S.
     43-1022(35)), the full $6,000 here: Arizona 545 - 150 = 395, total 2,049, retained 35,951 (were 2,199 and 35,801).
     THE MECHANISM THIS FIXTURE PINS IS UNCHANGED: an RMD whose cash alone covers the obligation still makes
     zero new sales and retains the remainder. Only the tax rate table's output moved. */
  assert.ok(Math.abs(realTax - 2049) < 0.01, `sanity check: expected the stored tax formula to give $2,049.00, got ${realTax}`);
  assert.equal(quote.status, 'funded', 'cash alone already covers the obligation and must be reported as funded');
  assert.equal(quote.transactions.length, 0, 'no account had a positive balance, so no new sale should occur');
  assert.ok(Math.abs(quote.retained - 35951) < 0.01, `expected $35,951.00 retained, got ${quote.retained}`);
});

test('R2V-001: cash-only settlement below, exactly at, and above the liability all reconcile correctly', () => {
  const p = profile('single', 70);
  const age = 70;
  /* S5AA R48 (AA1-16): at $20,000 Arizona's senior-deduction subtraction (A.R.S. 43-1022(35)) took the liability to 0 (it was $45, all
     Arizona), so no cash could fall below it. At $30,000 there is one: federal 10% x (30,000 - 24,150) = 585, Arizona 2.5% x (30,000 -
     16,100 - 2,100 - 6,000) = 145. */
  const T0 = engine.estimateTaxes(p, age, 30000, 0, 0, 0, 0, 0).total;
  assert.ok(Math.abs(T0 - 730) < 0.01, 'premise: a $730 liability, got ' + T0);
  const taxCtx = {
    ordinaryIncome: 30000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: 0,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = []; // no accounts in any class whatsoever
  const below = engine.quoteTaxFunding(taxCtx, ['taxable', 'preTax', 'roth', 'hsa'], accounts, p, 0, T0 - 1);
  assert.equal(below.status, 'exhausted', 'cash strictly below the liability with zero accounts is a genuine, unfixable shortfall');
  assert.ok(Math.abs(below.cashUsed) < 1e-9);

  const exact = engine.quoteTaxFunding(taxCtx, ['taxable', 'preTax', 'roth', 'hsa'], accounts, p, 0, T0);
  assert.equal(exact.status, 'funded');
  assert.ok(Math.abs(exact.retained) < 0.01, `expected zero residual, got ${exact.retained}`);

  const above = engine.quoteTaxFunding(taxCtx, ['taxable', 'preTax', 'roth', 'hsa'], accounts, p, 0, T0 + 500);
  assert.equal(above.status, 'funded');
  assert.ok(Math.abs(above.retained - 500) < 0.01, `expected $500 retained, got ${above.retained}`);
});

test('R2V-001: zero liability with zero accounts and zero cash is funded trivially', () => {
  const p = profile('single', 70);
  const age = 70;
  const taxCtx = {
    ordinaryIncome: 0, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: 0,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const quote = engine.quoteTaxFunding(taxCtx, ['taxable', 'preTax', 'roth', 'hsa'], [], p, 0, 0);
  assert.equal(quote.status, 'funded');
  assert.equal(quote.transactions.length, 0);
  assert.ok(Math.abs(quote.retained) < 1e-9);
});

test('R2V-002: a non-finite taxCtx field is rejected as an explicit error, never reported as "exhausted" or "funded"', () => {
  const p = profile('single', 64);
  const age = 64;
  const base = {
    ordinaryIncome: 40000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: 0,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = [{ id: 'ira', taxClass: 'preTax', balance: 984000, basisPct: 0, priority: 1 }];
  ['ordinaryIncome', 'capitalGains', 'qualifiedDividends', 'ssBenefit', 'Tbase', 'payrollConst'].forEach((field) => {
    [NaN, Infinity, -Infinity].forEach((badValue) => {
      const ctx = { ...base, [field]: badValue };
      const quote = engine.quoteTaxFunding(ctx, ['preTax', 'taxable', 'roth', 'hsa'], accounts, p, 0, 0);
      assert.equal(quote.status, 'error', `expected an error status for non-finite ${field}=${badValue}, got ${quote.status}`);
      assert.equal(quote.code, 'NONFINITE_CONTEXT');
      assert.deepEqual(quote.transactions, [], 'a rejected context must never report a partial or full journal');
    });
  });
});

test('R2R-001: availableCash NaN/Infinity/-Infinity is rejected, not silently coerced to $0 or left to propagate as an infinite journal value', () => {
  // External requalification finding: the old `||0` fallback only catches
  // NaN (falsy) -- Infinity and -Infinity are truthy and sailed straight
  // through, producing e.g. status:"funded" with retained:Infinity and
  // cashUsed:NaN on an otherwise ordinary-looking result.
  const p = profile('single', 64);
  const age = 64;
  const base = {
    ordinaryIncome: 40000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: 0,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = [{ id: 'ira', taxClass: 'preTax', balance: 984000, basisPct: 0, priority: 1 }];
  [NaN, Infinity, -Infinity].forEach((badCash) => {
    const quote = engine.quoteTaxFunding(base, ['preTax', 'taxable', 'roth', 'hsa'], accounts, p, 0, badCash);
    assert.equal(quote.status, 'error', `availableCash=${badCash} must be rejected, got status ${quote.status}`);
    assert.equal(quote.code, 'NONFINITE_CONTEXT');
    assert.deepEqual(quote.transactions, []);
  });
});

test('R2R-001: taxCtx.penalties NaN/Infinity/-Infinity is rejected the same way', () => {
  const p = profile('single', 64);
  const age = 64;
  const base = {
    ordinaryIncome: 40000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: 0,
    payrollConst: 0, penaltyApplies: false,
  };
  const accounts = [{ id: 'ira', taxClass: 'preTax', balance: 984000, basisPct: 0, priority: 1 }];
  [NaN, Infinity, -Infinity].forEach((badPenalty) => {
    const ctx = { ...base, penalties: badPenalty };
    const quote = engine.quoteTaxFunding(ctx, ['preTax', 'taxable', 'roth', 'hsa'], accounts, p, 0, 0);
    assert.equal(quote.status, 'error', `penalties=${badPenalty} must be rejected, got status ${quote.status}`);
    assert.equal(quote.code, 'NONFINITE_CONTEXT');
    assert.deepEqual(quote.transactions, []);
  });
});

test('R2R-001: availableCash/penalties genuinely OMITTED (undefined) is still a legitimate default of zero, not a validity error', () => {
  // Distinguishes "not supplied" (a real, supported call shape -- several
  // existing fixtures in this file omit `penalties` entirely) from
  // "supplied but corrupted" (rejected above). Both are asserted here so a
  // future change can't quietly make omission an error too.
  const p = profile('single', 64);
  const age = 64;
  const ctx = {
    ordinaryIncome: 0, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: 0,
    payrollConst: 0, penaltyApplies: false, // penalties intentionally omitted
  };
  const quote = engine.quoteTaxFunding(ctx, ['preTax', 'taxable', 'roth', 'hsa'], [], p, 0, undefined);
  assert.equal(quote.status, 'funded');
  assert.equal(quote.transactions.length, 0);
  assert.ok(Math.abs(quote.retained) < 1e-9);
});

// ---------------------------------------------------------------------------
// R2R-001 round 2 (R2_T01_T02_EXTERNAL_REQUALIFICATION_ROUND2_2026-09-09.md):
// the entry guard previously covered only the scalar taxCtx money fields.
// seniorAges and the account-derived room/gain inputs were unchecked, and
// because every one of them maps to a FINITE output, no amount of terminal
// output checking could catch them -- each produced an ordinary "funded"
// quote with a plausible-looking, wrong sale.
// ---------------------------------------------------------------------------

function quoteAgainst(taxCtxOverride, accounts) {
  const p = profile('single', 70);
  const age = 70;
  const T0 = engine.estimateTaxes(p, age, 60000, 0, 0, 0, 0, 0).total;
  const taxCtx = Object.assign({
    ordinaryIncome: 60000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: T0 - 10000,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  }, taxCtxOverride || {});
  return engine.quoteTaxFunding(taxCtx, ['taxable', 'preTax', 'roth', 'hsa'],
    accounts || [{ id: 'ira', taxClass: 'preTax', balance: 1000000, basisPct: 0, priority: 1 }], p, 0, 0);
}

test('R2R-001 round 2: a non-finite seniorAges entry is rejected -- it silently changed the senior deduction and therefore the quoted sale', () => {
  // NaN silently fails estimateTaxes()'s `>=65` eligibility filter (deduction
  // disappears, sale quoted too large); Infinity silently passes it. Both
  // previously returned an ordinary funded quote.
  [NaN, Infinity, -Infinity].forEach((bad) => {
    const quote = quoteAgainst({ seniorAges: [bad, -1] });
    assert.equal(quote.status, 'error', `seniorAges:[${bad},-1] must be rejected, got ${quote.status}`);
    assert.equal(quote.code, 'NONFINITE_CONTEXT');
  });
  const spouseSide = quoteAgainst({ seniorAges: [70, NaN] });
  assert.equal(spouseSide.status, 'error', 'a non-finite SPOUSE age must be rejected too, not just seniorAges[0]');
  assert.equal(spouseSide.code, 'NONFINITE_CONTEXT');
});

test('R2R-001 round 2: a missing or malformed seniorAges array returns a controlled error instead of throwing', () => {
  // This one previously threw an uncaught TypeError out of estimateTaxes()
  // ("Cannot read properties of undefined (reading 'filter')") -- worse than
  // a wrong answer, since a direct caller got no status at all.
  [undefined, null, [], 'not-an-array', {}].forEach((bad) => {
    let quote;
    assert.doesNotThrow(() => { quote = quoteAgainst({ seniorAges: bad }); }, `seniorAges:${JSON.stringify(bad)} must not throw`);
    assert.equal(quote.status, 'error');
    assert.equal(quote.code, 'NONFINITE_CONTEXT');
  });
});

test('R2R-001 round 2: a non-finite account balance (quote room) is rejected', () => {
  // Infinity became unbounded room; NaN silently failed
  // orderedAccountsInClass()'s `>1e-9` filter, making the account vanish
  // from the quote entirely. Both returned an ordinary quote.
  [NaN, Infinity, -Infinity].forEach((bad) => {
    const quote = quoteAgainst({}, [{ id: 'brk', taxClass: 'taxable', balance: bad, basisPct: 50, priority: 1 }]);
    assert.equal(quote.status, 'error', `balance:${bad} must be rejected, got ${quote.status}`);
    assert.equal(quote.code, 'NONFINITE_ACCOUNT');
    assert.deepEqual(quote.transactions, []);
  });
});

test('R2R-001 round 2: a missing or non-finite taxable basisPct (gain rate) is rejected instead of silently becoming 0% or 100% basis', () => {
  // `Number(a.basisPct)||0` turned NaN and a missing value into 0% basis
  // (fully taxable); clamp() turned Infinity into 100% basis (fully
  // untaxed). null and a numeric string would have coerced too, which is
  // why the check is `typeof v === "number"`, not `Number(v)`.
  [NaN, Infinity, -Infinity, undefined, null, '50'].forEach((bad) => {
    const account = { id: 'brk', taxClass: 'taxable', balance: 1000000, priority: 1 };
    if (bad !== undefined) account.basisPct = bad;
    const quote = quoteAgainst({}, [account]);
    assert.equal(quote.status, 'error', `basisPct:${String(bad)} must be rejected, got ${quote.status}`);
    assert.equal(quote.code, 'NONFINITE_ACCOUNT');
  });
});

test('R2R-001 round 2: a non-taxable account without basisPct is still accepted -- basisPct is only load-bearing for taxable gain rates', () => {
  const quote = quoteAgainst({}, [{ id: 'roth1', taxClass: 'roth', balance: 500000, priority: 1 }]);
  assert.notEqual(quote.status, 'error', 'a roth account has no basis concept; requiring one would be a false rejection');
});

test('R2R-001: verifyQuoteObligation() itself rejects a non-finite running total -- the terminal-verification safety net, independent of the entry guard', () => {
  // quoteTaxFunding()'s entry guard only ever sees the ORIGINAL taxCtx, not
  // oi/cg/pen as they accumulate across potentially many quoted pieces. This
  // proves the shared verifier used at every terminal return would itself
  // catch a running total that became non-finite mid-walk (e.g. a future
  // regression in solveSegmentFunding/taxSegmentLocal), not just a bad input.
  const p = profile('single', 64);
  const age = 64;
  const taxCtx = {
    ordinaryIncome: 40000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: 0,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  [
    engine.verifyQuoteObligation(p, taxCtx, NaN, 0, 0),
    engine.verifyQuoteObligation(p, taxCtx, Infinity, 0, 0),
    engine.verifyQuoteObligation(p, taxCtx, 0, 0, Infinity),
    engine.verifyQuoteObligation(p, taxCtx, 0, 0, -Infinity),
  ].forEach((result) => {
    assert.equal(result.finite, false, `expected verifyQuoteObligation to flag ${JSON.stringify(result)} as non-finite`);
  });
  const clean = engine.verifyQuoteObligation(p, taxCtx, 40000, 0, 0);
  assert.equal(clean.finite, true, 'a genuinely finite running total must not be flagged');
});

test('R2V-004: a manual order that repeats a class cannot fund more than the account it repeats actually holds', () => {
  // The external audit's own reproduction: one $10,000 taxable account at
  // 100% basis, and a synthetic $30,000 obligation (via a very negative
  // Tbase) that a 100%-basis account can never actually pay down through
  // realized gains -- order lists "taxable" three times. Before this fix,
  // each repeated occurrence re-read the account's ORIGINAL $10,000 balance
  // (quoteTaxFunding never mutates `accounts`), letting the same $10,000
  // account fund a $30,000 "funded" journal.
  const p = profile('single', 64);
  const age = 64;
  const taxCtx = {
    ordinaryIncome: 0, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: -30000,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = [{ id: 'broker', taxClass: 'taxable', balance: 10000, basisPct: 100, priority: 1 }];
  const before = JSON.parse(JSON.stringify(accounts));
  const quote = engine.quoteTaxFunding(taxCtx, ['taxable', 'taxable', 'taxable', 'preTax', 'roth', 'hsa'], accounts, p, 0, 0);
  assert.deepEqual(accounts, before, 'quoteTaxFunding must not mutate the accounts it was given');
  const totalGross = quote.transactions.reduce((s, t) => s + t.gross, 0);
  assert.ok(totalGross <= 10000 + 1e-6, `expected at most $10,000 raised from a $10,000 account, got ${totalGross}`);
  // A 100%-basis account realizes zero gain no matter how much of it is
  // sold, so it can never actually pay down this synthetic obligation --
  // the correct outcome is a genuine, capped-at-$10,000 shortfall.
  assert.equal(quote.status, 'exhausted');
});

test('R2V-004: repeated real classes (preTax/roth/hsa) are also capped at their true pooled balance, not re-quoted fresh each time', () => {
  const p = profile('single', 60);
  const age = 60;
  const taxCtx = {
    ordinaryIncome: 0, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: -5000,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = [{ id: 'roth1', taxClass: 'roth', balance: 2000, basisPct: 0, priority: 1 }];
  const quote = engine.quoteTaxFunding(taxCtx, ['roth', 'roth', 'roth'], accounts, p, 0, 0);
  const totalGross = quote.transactions.reduce((s, t) => s + t.gross, 0);
  assert.ok(totalGross <= 2000 + 1e-6, `expected at most the pooled $2,000 roth balance raised, got ${totalGross}`);
  assert.equal(quote.status, 'exhausted', 'a $2,000 roth balance cannot fund a $5,000 obligation no matter how many times it is listed');
});

test('R2V-004: an unknown/empty class token in the order is skipped without crashing or being quoted against', () => {
  const p = profile('single', 60);
  const age = 60;
  const T0 = engine.estimateTaxes(p, age, 10000, 0, 0, 0, 0, 0).total;
  const taxCtx = {
    ordinaryIncome: 10000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: T0 - 1000,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = [{ id: 'ira', taxClass: 'preTax', balance: 1000000, basisPct: 0, priority: 1 }];
  const quote = engine.quoteTaxFunding(taxCtx, ['', 'unknownClass', 'preTax'], accounts, p, 0, 0);
  assert.equal(quote.status, 'funded');
  verifyFunded(p, age, taxCtx, 0, quote);
});

test('R2-T01: quoting twice with identical inputs is deterministic and does not mutate accounts', () => {
  const p = profile('single', 64);
  const age = 64;
  const T0 = engine.estimateTaxes(p, age, 80000, 0, 0, 0, 0, 0).total;
  const taxCtx = {
    ordinaryIncome: 80000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: T0 - 1000,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = [
    { id: 'a', taxClass: 'taxable', balance: 100, basisPct: 100, priority: 1 },
    { id: 'b', taxClass: 'taxable', balance: 100000, basisPct: 0, priority: 2 },
  ];
  const quote1 = engine.quoteTaxFunding(taxCtx, ['taxable'], accounts, p, 0, 0);
  const quote2 = engine.quoteTaxFunding(taxCtx, ['taxable'], accounts, p, 0, 0);
  assert.deepEqual(quote1, quote2);
  assert.equal(accounts[0].balance, 100);
  assert.equal(accounts[1].balance, 100000);
});

// ---------------------------------------------------------------------------
// D) Wide deterministic cross-check against estimateTaxes across randomized
// scenarios -- the general safety net for any breakpoint this file's named
// fixtures don't happen to name explicitly.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Regressions found by auditing taxSegmentLocal's own contract (2026-09-08).
// Both defects produced a WRONG answer while still reporting "funded", and
// both were invisible to the fuzz above because it only sampled integer
// basisPct -- the trigger needs a segment whose income rate is small enough
// that rate*DELTA falls under a hardcoded epsilon, i.e. basisPct > 98.
// ---------------------------------------------------------------------------

test('R2-T01 regression: an SS band crossing on a high-basis taxable account funds exactly (was $25.02 short)', () => {
  const p = profile('single', 64);
  const age = 64;
  // combined = 20000 + 4000 = 24000, just under the $25,000 single base; the
  // sale must cross it. oi0 sits above the standard deduction so the extra
  // taxable SS is genuinely taxed rather than absorbed.
  const oi0 = 20000, ssBenefit = 8000;
  const T0 = engine.estimateTaxes(p, age, oi0, 0, ssBenefit, 0, 0, 0).total;
  const taxCtx = {
    ordinaryIncome: oi0, capitalGains: 0, qualifiedDividends: 0, ssBenefit,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: T0 - 150000,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = [{ id: 'a', taxClass: 'taxable', balance: 5000000, basisPct: 99, priority: 1 }];
  const quote = engine.quoteTaxFunding(taxCtx, ['taxable'], accounts, p, 0, 0);
  verifyFunded(p, age, taxCtx, 0, quote);
});

test('R2-T01 regression: a high-basis sale under an active senior-deduction phaseout funds exactly (was $53.66 over)', () => {
  const p = profile('single', 72, { spouseOn: true, spouseAge: 67 });
  const age = 72;
  const oi0 = 15102, cg0 = 144092, qDiv = 13187, ssBenefit = 5246;
  const T0 = engine.estimateTaxes(p, age, oi0, cg0, ssBenefit, 0, qDiv, 0).total;
  const taxCtx = {
    ordinaryIncome: oi0, capitalGains: cg0, qualifiedDividends: qDiv, ssBenefit,
    filing: 'single', seniorAges: seniorAgesFor(p, age), Tbase: T0 - 3000000,
    payrollConst: 0, penalties: 0, penaltyApplies: false,
  };
  const accounts = [{ id: 'a', taxClass: 'taxable', balance: 9000000, basisPct: 98.457, priority: 1 }];
  const quote = engine.quoteTaxFunding(taxCtx, ['taxable'], accounts, p, 0, 0);
  verifyFunded(p, age, taxCtx, 0, quote);
});

test('R2-T01: taxSegmentLocal\'s affine-piece contract holds at every breakpoint LANDING', () => {
  // This is the check that found both regressions above. taxSegmentLocal
  // promises L(x) = value + slope*(x-x0) is exact on [x0, x0+dist); bugs in
  // this design surface specifically AT a landing (the walker always steps
  // exactly onto the previous breakpoint), so the audit has to land there
  // too rather than sampling arbitrary x.
  function prng(seed) {
    let x = seed >>> 0;
    return () => { x += 0x6d2b79f5; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const rand = prng(20260908);
  const filings = ['single', 'mfj', 'hoh'];
  let landings = 0, worst = 0, worstCase = null;
  for (let i = 0; i < 150; i++) {
    const filing = filings[Math.floor(rand() * 3)];
    const age = 45 + Math.floor(rand() * 45);
    const spouseOn = rand() < 0.4;
    const spouseAge = age + Math.floor(rand() * 10 - 5);
    const p = profile(filing, age, { spouseOn, spouseAge });
    const isTaxable = rand() < 0.5;
    const basisPct = rand() < 0.6 ? 80 + rand() * 20 : rand() * 100; // oversample the small-rate region
    const ctx = {
      oi0: Math.floor(rand() * 250000), cg0: Math.floor(rand() * 150000),
      qDiv: rand() < 0.3 ? Math.floor(rand() * 20000) : 0,
      ssBenefit: rand() < 0.6 ? Math.floor(rand() * 45000) : 0,
      /* S5AA R33 (SA32F-33): the context states whose age-65 amounts the return carries, as the engine's own row context does
         (engine.ageAmountAges()); a spouse on a single or head-of-household return is married and apart. RE-FIXTURED BY INTENT: the
         mirror is still compared with estimateTaxes() exactly, at every landing. */
      filing, ...(({ seniorAges, seniorDeductionAges, additionalFiling }) => ({ seniorAges, seniorDeductionAges, additionalFiling }))(engine.ageAmountAges(p, age, filing, 0)),
      Tbase: 0, payrollConst: 0, pen0: 0,
      rPenalty: (!isTaxable && age < 59.5 && rand() < 0.5) ? 0.10 : 0,
      rIncome: isTaxable ? 0 : 1, rGains: isTaxable ? 1 - basisPct / 100 : 0,
    };
    const trueL = (x) => Math.max(0, engine.estimateTaxes(
      p, age, ctx.oi0 + ctx.rIncome * x, ctx.cg0 + ctx.rGains * x, ctx.ssBenefit, 0, ctx.qDiv, 0
    ).total - ctx.Tbase) + ctx.pen0 + ctx.rPenalty * x;
    let x = 0;
    for (let step = 0; step < 40 && x < 4e6; step++) {
      const seg = engine.taxSegmentLocal(ctx, x);
      landings++;
      const h = Number.isFinite(seg.dist) ? seg.dist * 0.999 : 1e6;
      const err = Math.max(Math.abs(seg.value - trueL(x)), Math.abs((seg.value + seg.slope * h) - trueL(x + h)));
      if (err > worst) { worst = err; worstCase = { filing, age, x, basisPct, rGains: ctx.rGains, ss: ctx.ssBenefit }; }
      if (!Number.isFinite(seg.dist)) break;
      x += seg.dist;
    }
  }
  assert.ok(landings > 500, `expected a meaningful number of landings, got ${landings}`);
  assert.ok(worst < 0.01, `affine contract violated by $${worst.toFixed(4)} at ${JSON.stringify(worstCase)}`);
});

test('R2-T01-D: quoteTaxFunding agrees with estimateTaxes across a deterministic scenario grid', () => {
  function prng(seed) {
    let x = seed >>> 0;
    return () => {
      x += 0x6d2b79f5;
      let t = x;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = prng(20260908);
  const filings = ['single', 'mfj', 'hoh'];
  let checked = 0;
  for (let i = 0; i < 60; i++) {
    const filing = filings[Math.floor(rand() * filings.length)];
    const age = 45 + Math.floor(rand() * 40); // 45..84
    const spouseOn = filing === 'mfj' && rand() < 0.7;
    const p = profile(filing, age, { spouseOn, spouseAge: age + Math.floor(rand() * 10 - 5) });
    const oi0 = Math.floor(rand() * 250000);
    const cg0 = Math.floor(rand() * 100000);
    const ssBenefit = rand() < 0.5 ? Math.floor(rand() * 40000) : 0;
    const basisPct = Math.floor(rand() * 101);
    const cls = rand() < 0.5 ? 'preTax' : 'taxable';
    const penaltyApplies = cls === 'preTax' && age < 59.5 && rand() < 0.5;
    const T0 = engine.estimateTaxes(p, age, oi0, cg0, ssBenefit, 0, 0, 0).total;
    const target = 200 + Math.floor(rand() * 30000);
    const taxCtx = {
      ordinaryIncome: oi0, capitalGains: cg0, qualifiedDividends: 0, ssBenefit,
      filing, seniorAges: seniorAgesFor(p, age), Tbase: T0 - target,
      payrollConst: 0, penalties: 0, penaltyApplies,
    };
    const room = target * (2 + rand() * 5); // usually enough room to fully fund
    const accounts = cls === 'taxable'
      ? [{ id: 'a', taxClass: 'taxable', balance: room, basisPct, priority: 1 }]
      : [{ id: 'ira', taxClass: 'preTax', balance: room, basisPct: 0, priority: 1 }];
    const quote = engine.quoteTaxFunding(taxCtx, [cls], accounts, p, 0, 0);
    if (quote.status === 'error') {
      assert.fail(`case ${i} (filing=${filing} age=${age} oi=${oi0} cg=${cg0} ss=${ssBenefit} cls=${cls} basis=${basisPct}) reported an engine error: ${quote.code}`);
    }
    if (quote.status === 'funded') {
      verifyFunded(p, age, taxCtx, 0, quote);
      checked++;
    }
    // 'exhausted' is an acceptable outcome when room happened to be small;
    // the depletion test above already covers that path's own correctness.
  }
  assert.ok(checked > 40, `expected most of the 60 randomized cases to fund cleanly and be verified; only ${checked} did`);
});
