/* S5AA task 4.3, Q97 (G1) -- the routing itself.
 *
 * WHICH of two pre-tax accounts paid a conversion is NOT a row-level fact: the rows carry class
 * totals, so two accounts in the same class are indistinguishable in the output whichever one was
 * drawn. The behavioural claims -- that array order stops mattering, that the executed amount reaches
 * the request, that a conversion does not cross owners -- are in
 * tests/audit-s5aa-conversion-routing.test.js and go through runPlan().
 *
 * This file checks the two facts that have no public observable: that SOURCES are ordered by the
 * engine's own withdrawal comparator (so `priority` decides), and that each source is paired with its
 * OWN owner's lowest-priority Roth account.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));

function acct(id, taxClass, owner, balance, priority) {
  return { id, name: id, type: taxClass === 'roth' ? 'rothIRA' : 'traditionalIRA', taxClass, owner, balance, priority, allocation: {} };
}
const P = { retirement: { withdrawalOrder: 'priority' }, advanced: {} };

test('S5AA 4.3 (Q97): sources are ordered by priority, not by array position', () => {
  const accounts = [
    acct('late', 'preTax', 'self', 20000, 9),
    acct('first', 'preTax', 'self', 80000, 1),
    acct('roth', 'roth', 'self', 0, 1),
  ];
  const routes = engine.conversionRoutes(accounts, P, 0);
  assert.deepEqual(routes.map((r) => r.source.id), ['first', 'late'],
    'priority 1 comes first although it is listed second');
});

test('S5AA 4.3 (Q97): each source is paired with its own owner\'s lowest-priority Roth', () => {
  const accounts = [
    acct('rothSpouseLate', 'roth', 'spouse', 0, 7),
    acct('preSelf', 'preTax', 'self', 50000, 1),
    acct('preSpouse', 'preTax', 'spouse', 50000, 2),
    acct('rothSelfLate', 'roth', 'self', 0, 8),
    acct('rothSelfEarly', 'roth', 'self', 0, 3),
    acct('rothSpouseEarly', 'roth', 'spouse', 0, 4),
  ];
  const routes = engine.conversionRoutes(accounts, P, 0);
  assert.deepEqual(routes.map((r) => [r.source.id, r.destination.id]), [
    ['preSelf', 'rothSelfEarly'],
    ['preSpouse', 'rothSpouseEarly'],
  ]);
});

test('S5AA 4.3 (Q97): a source whose owner holds no Roth account has no route at all', () => {
  const routes = engine.conversionRoutes([
    acct('preSelf', 'preTax', 'self', 50000, 1),
    acct('rothSpouse', 'roth', 'spouse', 0, 1),
  ], P, 0);
  assert.deepEqual(routes, [], 'a spouse Roth is not a destination for the self\'s pre-tax money');
});

test('S5AA 4.3 (Q97): an empty source is not a route, and an empty destination is', () => {
  const routes = engine.conversionRoutes([
    acct('drained', 'preTax', 'self', 0, 1),
    acct('funded', 'preTax', 'self', 1000, 2),
    acct('roth', 'roth', 'self', 0, 1),
  ], P, 0);
  assert.deepEqual(routes.map((r) => r.source.id), ['funded']);
  assert.equal(routes[0].destination.balance, 0, 'a Roth with no balance is still a destination');
});

test('S5AA 4.3 (Q97): the move stops at the amount it is given and reports what it moved', () => {
  const accounts = [
    acct('a', 'preTax', 'self', 20000, 1),
    acct('b', 'preTax', 'self', 80000, 2),
    acct('roth', 'roth', 'self', 0, 1),
  ];
  /* RE-FIXTURED for the R6 external audit, EA-05: the move now returns what it moved AND what of it is
     income, because a conversion out of a traditional IRA with basis is not income in full. These
     accounts carry no IRA basis, so the two are equal -- which is the old single number, still held. */
  const moved = engine.convertPreTaxToRoth(accounts, P, 50000, 0);
  assert.equal(moved.amount, 50000);
  assert.equal(moved.taxableIncome, 50000, 'no basis anywhere: every dollar moved is income, as before');
  assert.equal(accounts[0].balance, 0);
  assert.equal(accounts[1].balance, 50000);
  assert.equal(accounts[2].balance, 50000);
});

test('S5AA 4.3 (Q97): a request beyond capacity moves the capacity and says so', () => {
  const accounts = [
    acct('a', 'preTax', 'self', 20000, 1),
    acct('roth', 'roth', 'self', 0, 1),
  ];
  /* RE-FIXTURED for EA-05, as above: `amount` is what MOVED, and the income is derived from it. */
  const moved = engine.convertPreTaxToRoth(accounts, P, 999999, 0);
  assert.equal(moved.amount, 20000,
    'the return value is what MOVED, so the row recognises the income it actually created');
  assert.equal(moved.taxableIncome, 20000);
  assert.equal(accounts[0].balance, 0);
});
