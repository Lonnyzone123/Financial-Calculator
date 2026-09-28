'use strict';
/*
 * Ported from the Financial Projection V2.1.2 (M5 PASS) Python engine's
 * retirement_model_v2/tax_engine.py. This is a faithful line-by-line
 * translation, not a reinterpretation -- verified against Python-generated
 * fixtures in fixtures/tax-engine.fixtures.json (see
 * tests/ported/tax-engine.test.js). Any behavior difference from the
 * Python source is a bug in this file, not an intentional deviation.
 *
 * TaxIncome shape (plain object, all fields default 0):
 *   { ordinaryIncome, qualifiedDividends, nonqualifiedDividends,
 *     longTermGains, treasuryInterest, socialSecurity,
 *     capitalLossCarryforward }
 *
 * Not yet ported: Medicare/IRMAA and Roth conversions are intentionally
 * outside this module in the Python source too.
 */

const TAX_INCOME_FIELDS = [
  'ordinaryIncome',
  'qualifiedDividends',
  'nonqualifiedDividends',
  'longTermGains',
  'treasuryInterest',
  'socialSecurity',
  'capitalLossCarryforward',
];

function taxIncome(overrides) {
  const income = {
    ordinaryIncome: 0,
    qualifiedDividends: 0,
    nonqualifiedDividends: 0,
    longTermGains: 0,
    treasuryInterest: 0,
    socialSecurity: 0,
    capitalLossCarryforward: 0,
  };
  return Object.assign(income, overrides);
}

function brackets(raw) {
  return raw.map(([ceiling, rate]) => [ceiling === null ? Infinity : Number(ceiling), Number(rate)]);
}

function validateInputs(income, inflationFactor) {
  if (!Number.isFinite(inflationFactor) || inflationFactor <= 0) {
    throw new Error('Tax inflation factor must be finite and positive');
  }
  for (const name of TAX_INCOME_FIELDS) {
    if (!Number.isFinite(income[name])) throw new Error('Tax income amounts must be finite');
  }
  const nonnegative = [
    'qualifiedDividends',
    'nonqualifiedDividends',
    'treasuryInterest',
    'socialSecurity',
    'capitalLossCarryforward',
  ];
  for (const name of nonnegative) {
    if (income[name] < 0) throw new Error('Tax cash-income amounts and loss carryforward cannot be negative');
  }
}

function progressiveTax(amount, brks, factor) {
  let tax = 0;
  let lower = 0;
  for (const [ceiling, rate] of brks) {
    const upper = ceiling === Infinity ? ceiling : ceiling * factor;
    const taxable = Math.max(0, Math.min(amount, upper) - lower);
    tax += taxable * rate;
    if (amount <= upper) break;
    lower = upper;
  }
  return tax;
}

function stackedTax(ordinaryTaxable, preferentialTaxable, brks, factor) {
  if (preferentialTaxable <= 0) return 0;
  const start = ordinaryTaxable;
  const end = ordinaryTaxable + preferentialTaxable;
  let tax = 0;
  let lower = 0;
  for (const [ceiling, rate] of brks) {
    const upper = ceiling === Infinity ? ceiling : ceiling * factor;
    const overlap = Math.max(0, Math.min(end, upper) - Math.max(start, lower));
    tax += overlap * rate;
    if (end <= upper) break;
    lower = upper;
  }
  return tax;
}

function createTaxCalculator(config) {
  const ordinaryBrackets = brackets(config.ordinary_brackets);
  const ltcgBrackets = brackets(config.ltcg_brackets);

  function taxableSocialSecurity(income) {
    const [lower, upper] = config.ss_combined_income_thresholds_nominal.map(Number);
    const otherIncome =
      income.ordinaryIncome +
      income.nonqualifiedDividends +
      income.qualifiedDividends +
      income.longTermGains +
      income.treasuryInterest;
    const combined = otherIncome + 0.5 * income.socialSecurity;
    if (combined <= lower) return 0;
    if (combined <= upper) return Math.min(0.5 * income.socialSecurity, 0.5 * (combined - lower));
    const firstBand = Math.min(0.5 * income.socialSecurity, 0.5 * (upper - lower));
    return Math.min(0.85 * income.socialSecurity, firstBand + 0.85 * (combined - upper));
  }

  function calculate(income, inflationFactor) {
    inflationFactor = inflationFactor === undefined ? 1.0 : Number(inflationFactor);
    validateInputs(income, inflationFactor);

    const ssTaxable = taxableSocialSecurity(income);

    const netGainAfterCf = income.longTermGains - Math.max(0, income.capitalLossCarryforward);
    const remainingLoss = Math.max(0, -netGainAfterCf);
    const lossLimit = Number(config.capital_loss_ordinary_limit_nominal);
    const ordinaryLossDeduction = Math.min(remainingLoss, lossLimit);
    const endingLossCf = Math.max(0, remainingLoss - ordinaryLossDeduction);
    const netLtcg = Math.max(0, netGainAfterCf);

    const ordinaryGross = Math.max(
      0,
      income.ordinaryIncome + income.nonqualifiedDividends + income.treasuryInterest + ssTaxable - ordinaryLossDeduction
    );
    const preferentialGross = Math.max(0, income.qualifiedDividends + netLtcg);
    const deduction = Number(config.standard_deduction) * inflationFactor;

    const taxableOrdinary = Math.max(0, ordinaryGross - deduction);
    const unusedDeduction = Math.max(0, deduction - ordinaryGross);
    const taxablePreferential = Math.max(0, preferentialGross - unusedDeduction);

    const federalOrdinary = progressiveTax(taxableOrdinary, ordinaryBrackets, inflationFactor);
    const federalPreferential = stackedTax(taxableOrdinary, taxablePreferential, ltcgBrackets, inflationFactor);

    const magi = ordinaryGross + preferentialGross;
    const netInvestmentIncome = Math.max(
      0,
      income.qualifiedDividends + income.nonqualifiedDividends + income.treasuryInterest + netLtcg
    );
    const niit =
      Number(config.niit_rate) * Math.min(netInvestmentIncome, Math.max(0, magi - Number(config.niit_threshold_nominal)));

    const azIncome = Math.max(
      0,
      income.ordinaryIncome +
        income.nonqualifiedDividends +
        income.qualifiedDividends +
        netLtcg * (1.0 - Number(config.arizona_ltcg_subtraction)) -
        ordinaryLossDeduction
    );
    const azDeduction = Number(config.arizona_standard_deduction) * inflationFactor;
    const arizona = Math.max(0, azIncome - azDeduction) * Number(config.arizona_rate);

    const total = federalOrdinary + federalPreferential + niit + arizona;

    return {
      federalOrdinary,
      federalPreferential,
      niit,
      arizona,
      total,
      taxableSocialSecurity: ssTaxable,
      taxableOrdinary,
      taxablePreferential,
      magi,
      endingLossCarryforward: endingLossCf,
    };
  }

  function incrementalTax(base, opts) {
    opts = opts || {};
    const inflationFactor = opts.inflationFactor === undefined ? 1.0 : opts.inflationFactor;
    const baseTax = calculate(base, inflationFactor).total;
    // Nullish coalescing, not `||`: Python's keyword defaults (ordinary_delta:
    // float = 0.0) only apply when the argument is omitted, not when it's
    // 0 or some other falsy-in-JS value. `||` would silently coerce a NaN
    // delta (a caller bug) to 0 instead of letting it propagate into
    // calculate()'s own isfinite validation, same as the Python source does.
    const changed = taxIncome({
      ordinaryIncome: base.ordinaryIncome + (opts.ordinaryDelta ?? 0),
      qualifiedDividends: base.qualifiedDividends + (opts.qualifiedDividendDelta ?? 0),
      nonqualifiedDividends: base.nonqualifiedDividends + (opts.nonqualifiedDividendDelta ?? 0),
      longTermGains: base.longTermGains + (opts.longTermGainDelta ?? 0),
      treasuryInterest: base.treasuryInterest,
      socialSecurity: base.socialSecurity,
      capitalLossCarryforward: base.capitalLossCarryforward,
    });
    return calculate(changed, inflationFactor).total - baseTax;
  }

  return { calculate, taxableSocialSecurity, incrementalTax, config };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createTaxCalculator, taxIncome, TAX_INCOME_FIELDS };
}
