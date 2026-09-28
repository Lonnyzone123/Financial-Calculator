'use strict';

// The two internals tests of tests/audit-ra03-dividend-eligibility.test.js, split out at S5 block 2r.
//
// That file guards the repair through runPlan() only. This file holds the two tests that call the engine's
// internal dividend helpers directly: one eligible set serves both dividend modes, and taking dividend cash
// never touches an ineligible account. They depend on internal names, so a rebuild re-points or retires them
// with those internals. The tests are moved verbatim, with the setup and account helper they use.
//
// RE-POINTED at Claude's S5AA R18 self-audit: the second test called takeCashFromAccounts(), which the dividend
// path stopped using at workstream B (235eb5f) -- each account now pays its own dividend through payOwnDividends() --
// and which was then retired. The property is the same, asserted on the helper the row actually calls.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require('../src/engine.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs');
const defaultPlan = extractDefaultPlan(shell);

function account(o) {
  return Object.assign({
    id: 'a1', name: 'A', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 0, basisPct: 100, contributionMode: 'dollar', contribution: 0, frequency: 12,
    annualChangeMode: 'percent', annualChange: 0, changeTiming: 'annual', contributionPreset: 'none',
    futureChanges: [], priority: 1, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0,
    vesting: 100, allocation: {},
  }, o);
}

test('RA-03: the imputed branch and the enabled branch use the same eligible set', () => {
  const eligible = engine.dividendEligibleAccounts([
    account({ id: 'a', taxClass: 'taxable', balance: 100 }),
    account({ id: 'cash', taxClass: 'taxable', balance: 100, cashHolding: true }),
    account({ id: 'roth', taxClass: 'roth', balance: 100 }),
    account({ id: 'pre', taxClass: 'preTax', balance: 100 }),
  ]);
  assert.deepEqual(eligible.map((a) => a.id), ['a'],
    'only non-cash taxable accounts are dividend-eligible');
});

test('RA-03: taking dividend cash never touches an ineligible account', () => {
  const invested = account({ id: 'a', taxClass: 'taxable', balance: 100 });
  const cash = account({ id: 'cash', taxClass: 'taxable', balance: 100, cashHolding: true });
  const accounts = [invested, cash];
  /* 4% for a year: the invested account pays 4.00 of its own; the cash holding pays nothing. */
  assert.equal(engine.payOwnDividends(engine.dividendEligibleAccounts(accounts), 0.04, 1), 4);
  assert.equal(invested.balance, 96);
  assert.equal(cash.balance, 100, 'the cash holding is never charged a dividend');
  /* A yield over the whole balance (150% for a year) pays at most the balance, and still never reaches the cash. */
  assert.equal(engine.payOwnDividends(engine.dividendEligibleAccounts(accounts), 1.5, 1), 96, 'only the eligible balance is available');
  assert.equal(cash.balance, 100, 'the cash holding must be untouched even when the draw falls short');
  assert.equal(invested.balance, 0);
});
