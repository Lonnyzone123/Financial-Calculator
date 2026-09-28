'use strict';

// Track B, L3 -- mathematical oracles (PLATFORM_DEVELOPMENT_ROADMAP.md §3:
// "Closed-form answers (0% return, fixed return, FV formula, mortgage
// formula)... Cheap and high-value -- a 0%-return/0%-inflation/no-tax
// scenario should match hand-computed arithmetic exactly.").
//
// Unlike the ported modules (Phases 5-8), the calculator's own native
// engine.js code has never been checked against a closed-form answer
// computed independently of the engine itself -- only against its own
// prior output (tests/regression-suite.js) or against the Python engine
// for the pieces that were ported. These three scenarios are constructed
// so the correct answer is computable by hand (plain arithmetic / the
// standard compound-interest formula), with every other variable (taxes,
// RMDs, fees, inflation, dividends, other income) deliberately zeroed out
// so the closed form is exact, not approximate.
//
// This is pure test-writing: no production code changes, zero behavior
// risk to the shipped app.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

function braceExtract(src, marker) {
  const i = src.indexOf(marker);
  let j = src.indexOf('{', i), depth = 0, inStr = null;
  for (let k = j; k < src.length; k++) {
    const c = src[k];
    if (inStr) { if (c === '\\') { k++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(j, k + 1); }
  }
  throw new Error('braceExtract: unbalanced braces');
}
const defaultPlan = eval('(' + braceExtract(shell, 'var defaultPlan=') + ')');

function oraclePlan(overrides = {}) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.id = 'oracle-fixture';
  Object.assign(p.assumptions, { returnRate: 0, inflation: 0, fee: 0, method: 'simple' }, overrides.assumptions || {});
  Object.assign(p.retirement, { ssBenefit: 0, spouseSS: 0, pension: 0, dividendOn: false }, overrides.retirement || {});
  Object.assign(p.advanced, { assetsOn: false, rmdOn: false, healthOn: false, ltcOn: false, reserveOn: false, bondTentOn: false, networthOn: false }, overrides.advanced || {});
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 }, overrides.employment || {});
  Object.assign(p.profile, overrides.profile || {});
  if (overrides.accounts) p.accounts = overrides.accounts;
  return p;
}

test('oracle: 0% return, fixed annual contribution, no withdrawals -- linear accumulation', () => {
  // total(N years) = opening + contribution * N, hand-computable exactly
  // since 0% return means growAccounts() is a no-op every year.
  const opening = 100000, contribution = 10000, years = 5;
  const p = oraclePlan({
    profile: { age: 30, retireAge: 30 + years, endAge: 30 + years },
    accounts: [{
      id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self',
      balance: opening, contribution, contributionMode: 'amount', priority: 1, basisPct: 100,
      annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
      futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
    }],
  });

  const result = engine.runPlan(p);
  assert.equal(result.rows.length, years + 1, `expected an opening row plus ${years} annual rows`);
  for (let year = 0; year <= years; year++) {
    const expected = opening + contribution * year;
    assert.equal(result.rows[year].total, expected, `year ${year}: expected exactly ${expected}`);
  }
});

test('oracle: fixed 10% annual return, no contributions, no withdrawals -- standard compound interest', () => {
  // total(N years) = principal * (1 + r)^N, the textbook FV formula.
  const principal = 200000, rate = 0.10, years = 5;
  const p = oraclePlan({
    assumptions: { returnRate: 10 },
    profile: { age: 40, retireAge: 40, endAge: 40 + years },
    retirement: { spending: 0 }, // already "retired", but $0 spending means no withdrawal ever fires
    accounts: [{
      id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self',
      balance: principal, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
      annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
      futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
    }],
  });

  const result = engine.runPlan(p);
  for (let year = 0; year <= years; year++) {
    const expected = principal * Math.pow(1 + rate, year);
    const actual = result.rows[year].total;
    assert.ok(Math.abs(actual - expected) < 1e-6, `year ${year}: expected ${expected}, got ${actual}`);
  }
});

test('oracle: Roth-only decumulation, 0% return, fixed nominal spending, zero taxes -- linear drawdown', () => {
  // Roth withdrawals are never taxed by this engine's own tax model (only
  // preTax withdrawals count as ordinary income), and every other income
  // source is zeroed out, so requested spending is met exactly by a Roth
  // withdrawal with no tax gross-up: total(N years) = opening - spending * N.
  const opening = 500000, spending = 40000, years = 5;
  const p = oraclePlan({
    profile: { age: 65, retireAge: 65, endAge: 65 + years },
    retirement: { spending, withdrawalRate: 4 },
    accounts: [{
      id: 'a1', name: 'Roth IRA', type: 'rothIRA', taxClass: 'roth', owner: 'self',
      balance: opening, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 0,
      annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
      futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
    }],
  });

  const result = engine.runPlan(p);
  assert.equal(result.failed, false, 'a well-funded Roth-only plan must not report a shortfall');
  for (let year = 0; year <= years; year++) {
    const expected = opening - spending * year;
    const row = result.rows[year];
    assert.equal(row.total, expected, `year ${year}: expected exactly ${expected}`);
    assert.equal(row.taxes, 0, `year ${year}: expected exactly zero tax on pure Roth withdrawals with no other income`);
    assert.equal(row.withdrawals, year === 0 ? 0 : spending, `year ${year}: withdrawals must equal spending exactly, with no tax gross-up`);
  }
});
