'use strict';
/*
 * Ported from the Financial Projection V2.1.2 (post-audit-repair,
 * requalified) Python engine's retirement_model_v2/model_types.py -- the
 * Account/Portfolio mutable value objects used by social_security_bridge.py
 * (Phase 4) and, in Python, throughout the whole engine.
 *
 * NOTE on scope/duplication: src/ported/lifetime-tax-optimizer.js (Phase 5)
 * already has its own minimal account()/sellFromAccount()/clonePortfolio()
 * helpers, deliberately kept local to that file and not refactored to use
 * this module -- Phase 5 is already shipped and fixture-verified, and
 * consolidating now would touch tested code for no behavioral benefit here.
 * This module ports the FULL Account/Portfolio contract (validate, buy,
 * applyReturn, total/equityTotal, balances) that social_security_bridge.py
 * actually needs and lifetime-tax-optimizer.js's narrower helpers don't
 * provide.
 */

function requireFinite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

function createAccount(name, value, basis = 0.0, taxable = false) {
  return { name, value, basis, taxable };
}

function cloneAccount(acct) {
  return createAccount(acct.name, acct.value, acct.basis, acct.taxable);
}

function validateAccount(acct) {
  requireFinite(acct.value, `${acct.name}.value`);
  requireFinite(acct.basis, `${acct.name}.basis`);
  if (acct.value < 0) throw new Error(`${acct.name}.value must be nonnegative`);
  if (acct.basis < 0) throw new Error(`${acct.name}.basis must be nonnegative`);
}

function accountEmbeddedGainFraction(acct) {
  if (acct.value <= 0) return 0.0;
  return (acct.value - acct.basis) / acct.value;
}

/** Mutates `acct` in place, returns {account, proceeds, basisRecovered, realizedGain}. */
function sellFromAccount(acct, requested) {
  validateAccount(acct);
  requireFinite(requested, 'sale request');
  const proceeds = Math.min(Math.max(0.0, requested), Math.max(0.0, acct.value));
  const basisFraction = acct.value > 0 ? acct.basis / acct.value : 0.0;
  const basisRecovered = proceeds * basisFraction;
  const realizedGain = acct.taxable ? proceeds - basisRecovered : 0.0;
  acct.value -= proceeds;
  acct.basis = Math.max(0.0, acct.basis - basisRecovered);
  return { account: acct.name, proceeds, basisRecovered, realizedGain };
}

function buyIntoAccount(acct, amount) {
  validateAccount(acct);
  requireFinite(amount, 'purchase amount');
  amount = Math.max(0.0, amount);
  requireFinite(acct.value + amount, 'post-purchase value');
  requireFinite(acct.basis + amount, 'post-purchase basis');
  acct.value += amount;
  if (acct.taxable) acct.basis += amount;
}

function applyReturnToAccount(acct, totalOrPriceReturn) {
  validateAccount(acct);
  requireFinite(totalOrPriceReturn, 'return');
  if (totalOrPriceReturn < -1) {
    throw new Error('A return cannot be below -100%');
  }
  const changed = acct.value * (1.0 + totalOrPriceReturn);
  requireFinite(changed, 'post-return value');
  acct.value = changed;
}

function createPortfolio(voo, schd, tbills, roth) {
  return { voo, schd, tbills, roth };
}

function clonePortfolio(portfolio) {
  return createPortfolio(
    cloneAccount(portfolio.voo), cloneAccount(portfolio.schd),
    cloneAccount(portfolio.tbills), cloneAccount(portfolio.roth)
  );
}

function portfolioTotal(portfolio) {
  return portfolio.voo.value + portfolio.schd.value + portfolio.tbills.value + portfolio.roth.value;
}

function portfolioEquityTotal(portfolio) {
  return portfolio.voo.value + portfolio.schd.value + portfolio.roth.value;
}

function portfolioBalances(portfolio) {
  return {
    voo: portfolio.voo.value, schd: portfolio.schd.value,
    tbills: portfolio.tbills.value, roth: portfolio.roth.value,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    requireFinite,
    createAccount,
    cloneAccount,
    validateAccount,
    accountEmbeddedGainFraction,
    sellFromAccount,
    buyIntoAccount,
    applyReturnToAccount,
    createPortfolio,
    clonePortfolio,
    portfolioTotal,
    portfolioEquityTotal,
    portfolioBalances,
  };
}
