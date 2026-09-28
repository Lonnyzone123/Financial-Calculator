'use strict';

/**
 * False-positive guard for validateScenario().
 *
 * This test is the precondition for letting the validator BLOCK anything in
 * the live app. Once importSettings() refuses an import on a validation
 * ERROR, any false positive stops a user from loading a legitimate backup --
 * a far worse outcome than the confusing downstream crash the validator
 * exists to prevent. So the bar is: every plan the app itself can legally
 * produce must validate clean.
 *
 * The existing scenario-validator.test.js checks that the validator CATCHES
 * malformed plans. This one checks the opposite direction across the full
 * type space: one account of every ACCOUNT_TYPES entry, one debt of every
 * DEBT_TYPES entry (including the mortgage-only fields), one other-asset of
 * every OTHER_ASSET_TYPES entry, both filing statuses, every projection
 * method, every withdrawal strategy and order, and every advanced toggle on
 * at once.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateScenario } = require('../src/scenario-validator');
const { ACCOUNT_TYPES } = require('../src/engine.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs');

const SHELL_PATH = path.join(__dirname, '..', 'src', 'app-shell.html');
const shell = fs.readFileSync(SHELL_PATH, 'utf8');

/** Same brace-matched extraction golden-scenario-defs uses, so these tables
 *  come from the shipped source rather than being duplicated here and left
 *  to drift. */
function braceExtract(src, marker) {
  const i = src.indexOf(marker);
  assert.ok(i !== -1, `marker not found in app-shell.html: ${marker}`);
  let j = src.indexOf('{', i);
  let depth = 0;
  let inStr = null;
  for (let k = j; k < src.length; k++) {
    const c = src[k];
    if (inStr) {
      if (c === '\\') { k++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(j, k + 1); }
  }
  throw new Error('braceExtract: unbalanced braces');
}

const DEBT_TYPES = eval(`(${braceExtract(shell, 'var DEBT_TYPES=')})`);
const OTHER_ASSET_TYPES = eval(`(${braceExtract(shell, 'var OTHER_ASSET_TYPES=')})`);
const defaultPlan = extractDefaultPlan(shell);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Mirrors normalizeAccount()'s own defaults from app-shell.html. */
function makeAccount(type, index) {
  const meta = ACCOUNT_TYPES[type];
  return {
    id: `acct-${index}`, name: meta.label, type, taxClass: meta.taxClass, owner: 'self',
    balance: 100000, basisPct: 70, contributionMode: 'dollar', contribution: 5000, frequency: 12,
    annualChangeMode: 'percent', annualChange: 0, changeTiming: 'annual', contributionPreset: 'none',
    futureChanges: [], priority: index + 1, matchOn: false, matchRate: 100, matchCap: 4,
    profitShare: 0, vesting: 100, allocation: {},
  };
}

/** Mirrors normalizeDebt()'s own defaults, including the mortgage-only fields. */
function makeDebt(type, index) {
  const meta = DEBT_TYPES[type];
  const isMortgage = type === 'mortgage';
  return {
    id: `debt-${index}`, type, name: meta.label, owner: 'household', balance: 50000, rate: meta.rate,
    paymentMonthly: 500, payoffAge: 75, includePayment: true,
    taxDeductible: isMortgage || type === 'heloc',
    mortgageType: 'conventional', rateType: 'fixed', originalAmount: 60000, propertyValue: 400000,
    remainingTermYears: 25, loanTermYears: 30, extraPrincipalMonthly: 0,
    annualPropertyTax: 4000, annualInsurance: 1500, hoaMonthly: 0, pmiMonthly: 0,
    includeHousingCosts: isMortgage, nextRateResetAge: 75, resetRate: meta.rate,
  };
}

/** Mirrors normalizeOtherAsset()'s own defaults. */
function makeOtherAsset(type, index) {
  const meta = OTHER_ASSET_TYPES[type];
  return {
    id: `other-${index}`, type, name: meta.label, owner: 'household', value: 75000,
    growth: meta.growth, liquidity: meta.liquidity, available: true, availableAge: 65, accessPct: 80,
  };
}

function basePlan() {
  const p = clone(defaultPlan);
  p.setupComplete = true;
  p.id = 'false-positive-guard';
  return p;
}

function expectClean(plan, label) {
  const result = validateScenario(plan);
  const errors = result.issues.filter((i) => i.severity === 'ERROR');
  const detail = result.issues
    .map((i) => `${i.severity} ${i.code} at ${i.path}: ${i.message}`)
    .join('\n  ');
  assert.equal(
    errors.length, 0,
    `${label} must produce no validation ERROR (a false positive here would block a legitimate import):\n  ${detail}`
  );
  assert.equal(result.valid, true, `${label} must be reported valid`);
  return result;
}

test('validateScenario false-positive guard: the shipped defaultPlan validates clean', () => {
  expectClean(basePlan(), 'defaultPlan');
});

test('validateScenario false-positive guard: an account of every ACCOUNT_TYPES entry validates clean', () => {
  const types = Object.keys(ACCOUNT_TYPES);
  assert.ok(types.length >= 6, `expected the full account-type table, got ${types.length}`);

  // Each type on its own...
  types.forEach((type, i) => {
    const plan = basePlan();
    plan.accounts = [makeAccount(type, i)];
    expectClean(plan, `account type "${type}" alone`);
  });

  // ...and all of them at once.
  const plan = basePlan();
  plan.accounts = types.map((type, i) => makeAccount(type, i));
  expectClean(plan, `all ${types.length} account types together`);
});

test('validateScenario false-positive guard: a debt of every DEBT_TYPES entry validates clean', () => {
  const types = Object.keys(DEBT_TYPES);
  assert.ok(types.length >= 8, `expected the full debt-type table, got ${types.length}`);

  types.forEach((type, i) => {
    const plan = basePlan();
    plan.advanced.debts = [makeDebt(type, i)];
    expectClean(plan, `debt type "${type}" alone`);
  });

  const plan = basePlan();
  plan.advanced.debts = types.map((type, i) => makeDebt(type, i));
  expectClean(plan, `all ${types.length} debt types together`);

  // An adjustable-rate mortgage carries two extra fields the fixed path does not.
  const arm = basePlan();
  arm.advanced.debts = [Object.assign(makeDebt('mortgage', 0), { rateType: 'adjustable', nextRateResetAge: 70, resetRate: 8.25 })];
  expectClean(arm, 'adjustable-rate mortgage');
});

test('validateScenario false-positive guard: an other-asset of every OTHER_ASSET_TYPES entry validates clean', () => {
  const types = Object.keys(OTHER_ASSET_TYPES);
  assert.ok(types.length >= 8, `expected the full other-asset table, got ${types.length}`);

  types.forEach((type, i) => {
    const plan = basePlan();
    plan.advanced.otherAssets = [makeOtherAsset(type, i)];
    expectClean(plan, `other-asset type "${type}" alone`);
  });

  const plan = basePlan();
  plan.advanced.otherAssets = types.map((type, i) => makeOtherAsset(type, i));
  expectClean(plan, `all ${types.length} other-asset types together`);
});

test('validateScenario false-positive guard: every filing status, method, strategy, and withdrawal order validates clean', () => {
  for (const filing of ['single', 'mfj', 'hoh']) {
    const plan = basePlan();
    plan.profile.filing = filing;
    expectClean(plan, `filing status "${filing}"`);
  }

  for (const method of ['simple', 'monteCarlo', 'historical']) {
    const plan = basePlan();
    plan.assumptions.method = method;
    expectClean(plan, `method "${method}"`);
  }

  const strategies = ['fixedReal', 'fixedNominal', 'constantPercent', 'guardrails', 'guyton', 'vpw', 'rmd', 'floorCeiling', 'incomeFirst'];
  for (const strategy of strategies) {
    const plan = basePlan();
    plan.retirement.strategy = strategy;
    expectClean(plan, `withdrawal strategy "${strategy}"`);
  }

  for (const order of ['smart', 'taxableFirst', 'preTaxFirst', 'rothFirst', 'proportional', 'manual']) {
    const plan = basePlan();
    plan.retirement.withdrawalOrder = order;
    expectClean(plan, `withdrawal order "${order}"`);
  }
});

test('validateScenario false-positive guard: a maximal plan with every advanced toggle on validates clean', () => {
  const plan = basePlan();
  plan.profile.spouseOn = true;
  plan.accounts = Object.keys(ACCOUNT_TYPES).map((type, i) => makeAccount(type, i));
  plan.advanced.debts = Object.keys(DEBT_TYPES).map((type, i) => makeDebt(type, i));
  plan.advanced.otherAssets = Object.keys(OTHER_ASSET_TYPES).map((type, i) => makeOtherAsset(type, i));

  // Turn on every boolean the advanced section exposes, whatever they are
  // called -- discovered from the shipped defaultPlan rather than hardcoded,
  // so a newly added toggle is covered automatically.
  let toggled = 0;
  for (const [key, value] of Object.entries(plan.advanced)) {
    if (typeof value === 'boolean') { plan.advanced[key] = true; toggled++; }
  }
  assert.ok(toggled >= 5, `expected several advanced toggles, only found ${toggled}`);

  plan.retirement.stages = [{ start: 70, end: 80, mode: 'percent', value: 90, growthMode: 'inflation', annualChange: 0 }];
  plan.retirement.expenses = [{ age: 72, amount: 25000, name: 'Roof' }];
  plan.retirement.otherIncomes = [{ type: 'socialSecurity', owner: 'self', amount: 24000, start: 67, end: 95, growthMode: 'cola', growth: 2 }];

  const result = expectClean(plan, 'maximal plan with every toggle on');
  // Warnings are acceptable here (they do not block an import); errors are not.
  for (const issue of result.issues) {
    assert.equal(issue.severity, 'WARNING', `unexpected non-warning issue: ${issue.code} at ${issue.path}`);
  }
});
