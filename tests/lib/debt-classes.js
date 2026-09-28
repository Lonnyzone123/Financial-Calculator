'use strict';

/*
 * S4 task 4.6 -- Q54, decided by the owner on S4-PA-12: SPLIT AND VERSION.
 *
 * The generator draws a debt's payment independently of its balance and rate,
 * so about a third of generated debts do not cover their own interest (Q54:
 * 31.9%-36.9% over five seed ranges). The decision is neither to delete that
 * shape nor to leave it an accident: keep underpaying debts as a deliberately
 * LABELLED adversarial set, generate a separate ORDINARY set whose balance,
 * rate, term and payment agree, and classify every debt with an INDEPENDENT
 * expectation for its class.
 *
 * THE INDEPENDENT EXPECTATION IS ONE FORMULA, not six hand-tuned rules. For a
 * fixed-rate debt with balance B, monthly rate r and monthly payment P, after
 * m months
 *
 *     B(m) = B * (1 + r)^m  -  P * ((1 + r)^m - 1) / r        (r > 0)
 *     B(m) = B - P * m                                         (r = 0)
 *
 * clamped at zero, and zero from payoffAge on (the remainder is paid at once).
 * Every class is a regime of that one closed form: the payment below the
 * monthly interest makes it rise, equal holds it, above makes it fall. Nothing
 * here reads engine output; tests/debt-classes.test.js holds the engine to it.
 *
 * DECLARED ROUNDING: half a cent a month. A payment within that of the monthly
 * interest is interest-only; outside it the direction is the class.
 *
 * Adjustable-rate debts are classified on their BASE rate and flagged: after a
 * reset the class can change, so the closed form applies before the reset only.
 * Whether an underpaying debt is admissible is a product-contract question and
 * is NOT decided here -- the adversarial set exists precisely so the engine's
 * handling of it stays measured.
 */

const DECLARED_ROUNDING = 0.005;

const CLASSES = ['zero-balance', 'zero-interest', 'interest-only', 'negative-amortizing', 'ordinary-amortizing', 'payoff'];

const EXPECTATIONS = {
  'zero-balance': 'no balance, no interest and no payment on any row',
  'zero-interest': 'no interest on any row; the balance falls by the payment every month until it is gone',
  'interest-only': 'the balance holds within declared rounding until payoffAge, then the whole balance is paid at once',
  'negative-amortizing': 'the balance RISES every year until payoffAge, then the grown balance is paid at once (Q43\'s shape)',
  'ordinary-amortizing': 'the balance falls every year and reaches zero before payoffAge',
  'payoff': 'the balance falls every year, but payoffAge arrives before it amortizes, and the remainder is paid at once',
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function paymentOf(debt) {
  return Math.max(0, num(debt.paymentMonthly)) + Math.max(0, num(debt.extraPrincipalMonthly));
}

function monthlyInterestOf(debt) {
  return Math.max(0, num(debt.balance)) * Math.max(0, num(debt.rate)) / 100 / 12;
}

/** The class of a debt that starts at `startAge`, by rule. */
function classifyDebt(debt, startAge) {
  const balance = num(debt.balance);
  const rate = num(debt.rate);
  const payment = paymentOf(debt);
  const monthlyInterest = monthlyInterestOf(debt);
  const out = { adjustable: debt.rateType === 'adjustable', payment, monthlyInterest };
  if (!(balance > 0)) return Object.assign(out, { kind: 'zero-balance' });
  if (!(rate > 0)) return Object.assign(out, { kind: 'zero-interest' });
  /* Inclusive at half a cent. The epsilon is floating point, not policy:
     $100,001 at 6% is exactly $500.005 a month, and 0.005 has no exact binary
     form, so without it the declared boundary itself would miss by 5e-14. */
  if (Math.abs(payment - monthlyInterest) <= DECLARED_ROUNDING + 1e-9) return Object.assign(out, { kind: 'interest-only' });
  if (payment < monthlyInterest) return Object.assign(out, { kind: 'negative-amortizing' });
  const r = rate / 100 / 12;
  const monthsToAmortize = Math.log(payment / (payment - balance * r)) / Math.log(1 + r);
  const monthsToPayoffAge = (num(debt.payoffAge) - startAge) * 12;
  return Object.assign(out, {
    kind: monthsToAmortize > monthsToPayoffAge + 1e-6 ? 'payoff' : 'ordinary-amortizing',
    monthsToAmortize,
    monthsToPayoffAge,
  });
}

/** The closed-form balance `monthsElapsed` months after `startAge`. */
function expectedBalance(debt, monthsElapsed, startAge) {
  if (Number.isFinite(Number(debt.payoffAge)) && startAge + monthsElapsed / 12 >= Number(debt.payoffAge)) return 0;
  const balance = Math.max(0, num(debt.balance));
  if (!(balance > 0)) return 0;
  const payment = paymentOf(debt);
  const r = Math.max(0, num(debt.rate)) / 100 / 12;
  if (r === 0) return Math.max(0, balance - payment * monthsElapsed);
  const growth = Math.pow(1 + r, monthsElapsed);
  return Math.max(0, balance * growth - payment * (growth - 1) / r);
}

module.exports = {
  DECLARED_ROUNDING, CLASSES, EXPECTATIONS, paymentOf, monthlyInterestOf, classifyDebt, expectedBalance,
};
