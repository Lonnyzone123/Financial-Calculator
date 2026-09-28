/* Q67 -- an asset-class id spelled like an Object.prototype property silently
 * replaced an account's Monte Carlo volatility with the flat assumption.
 *
 * findingIds: Q67
 *
 * The mechanism, so a reader knows what the arms are for. A plan's
 * `allocation` is an ordinary object and inherits Object.prototype.
 * accountVolatility() weighted each class by `allocation[ac.id]||0`, so for an
 * id such as "constructor" with no OWN allocation entry the read returned the
 * inherited value (a function, or Object.prototype itself). That is truthy,
 * `||0` never applied, the weight total went NaN, and `if(!total)` returned
 * the flat `assumptions.volatility` instead of the allocation-weighted value.
 *
 * Everything below goes through runPlan(), the public entry point, so the
 * guard survives a rebuild that renames the internals (S5 block 2r's reason).
 * Every "same as the neutral id" assertion is paired with a control proving
 * the same observation point DOES move when volatility or allocation really
 * changes -- equality from a comparison that cannot fail proves nothing.
 *
 * Scope, stated because it is easy to overclaim: the UI cannot produce these
 * ids (it mints them with uid("asset") and zero-fills every account's
 * allocation). The reachable routes are import -- the validator accepts any
 * non-empty string as an id -- and direct programmatic input.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const NEUTRAL = 'neutralclass';
const PROTOTYPE_NAMES = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'isPrototypeOf'];

/* One account, two asset classes: stocks and a second class whose id is under
   test. `allocationText` is JSON so that an own "__proto__" entry is a real own
   property (JSON.parse creates one; an object literal would set a prototype). */
function makePlan({ id, allocationText, method, stocksVolatility }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method, runs: 60, seed: 424242, returnRate: 6, inflation: 2, fee: 0, volatility: 12 });
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 75 });
  p.advanced.assetsOn = true;
  p.advanced.glideOn = false;
  p.advanced.correlation = 0.2;
  p.advanced.assetClasses = [
    { id: 'stocks', name: 'Stocks', returnRate: 8, volatility: stocksVolatility === undefined ? 18 : stocksVolatility },
    { id, name: 'Other', returnRate: 4, volatility: 6 },
  ];
  p.accounts = [{
    id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 1500000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: JSON.parse(allocationText), matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  return p;
}

/* runPlan() on a JSON copy, as every real caller hands it; the id under test is
   renamed back to the neutral id in the output text so only numbers compare. */
function resultText(p, id) {
  const r = engine.runPlan(JSON.parse(JSON.stringify(p)));
  assert.equal(r.status, 'ok', 'fixture must run cleanly: ' + r.status + ' ' + r.calculationErrorCode);
  const text = JSON.stringify(r);
  return id === NEUTRAL ? text : text.split('"' + id + '"').join('"' + NEUTRAL + '"');
}

const absent = () => '{"stocks":60}';
const present = (id) => '{"stocks":40,"' + id + '":60}';

test('Q67: a prototype-named asset-class id gives the same Monte Carlo result as any other id when the account holds no entry for it', () => {
  const neutral = resultText(makePlan({ id: NEUTRAL, allocationText: absent(), method: 'monteCarlo' }), NEUTRAL);
  const wrong = PROTOTYPE_NAMES.filter((name) =>
    resultText(makePlan({ id: name, allocationText: absent(), method: 'monteCarlo' }), name) !== neutral);
  assert.deepEqual(wrong, [],
    'these ids changed the Monte Carlo result although the account holds no allocation entry for them: ' +
    JSON.stringify(wrong) + '. An absent entry must weigh 0 whatever the id is spelled; an inherited ' +
    'Object.prototype value read as a weight turns the total NaN and swaps in the flat volatility.');
});

test('Q67 control: the Monte Carlo comparison can fail -- real volatility and allocation changes move the result', () => {
  const neutral = resultText(makePlan({ id: NEUTRAL, allocationText: absent(), method: 'monteCarlo' }), NEUTRAL);
  const higherVol = resultText(makePlan({ id: NEUTRAL, allocationText: absent(), method: 'monteCarlo', stocksVolatility: 25 }), NEUTRAL);
  const reweighted = resultText(makePlan({ id: NEUTRAL, allocationText: present(NEUTRAL), method: 'monteCarlo' }), NEUTRAL);
  assert.notEqual(higherVol, neutral, 'CONTROL: a stocks volatility of 25 instead of 18 must move the Monte Carlo result');
  assert.notEqual(reweighted, neutral, 'CONTROL: giving the second class a 60 weight must move the Monte Carlo result');
});

test('Q67: an OWN allocation entry under a prototype-named id is still read as its weight', () => {
  const neutral = resultText(makePlan({ id: NEUTRAL, allocationText: present(NEUTRAL), method: 'monteCarlo' }), NEUTRAL);
  const wrong = PROTOTYPE_NAMES.filter((name) =>
    resultText(makePlan({ id: name, allocationText: present(name), method: 'monteCarlo' }), name) !== neutral);
  assert.deepEqual(wrong, [],
    'an own allocation entry must be read as the weight it holds, whatever the id is spelled; these ids lost it: ' + JSON.stringify(wrong));
});

test('Q67 control: simple mode (expected return) matches the neutral id, and its comparison can fail', () => {
  const neutral = resultText(makePlan({ id: NEUTRAL, allocationText: absent(), method: 'simple' }), NEUTRAL);
  const wrong = PROTOTYPE_NAMES.filter((name) =>
    resultText(makePlan({ id: name, allocationText: absent(), method: 'simple' }), name) !== neutral);
  assert.deepEqual(wrong, [], 'simple mode must not depend on how an absent class id is spelled: ' + JSON.stringify(wrong));
  const reweighted = resultText(makePlan({ id: NEUTRAL, allocationText: present(NEUTRAL), method: 'simple' }), NEUTRAL);
  assert.notEqual(reweighted, neutral, 'CONTROL: a different allocation must move the simple-mode result');
});
