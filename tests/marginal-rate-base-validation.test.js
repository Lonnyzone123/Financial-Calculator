/* S5R-05 (the 2026-09-16 external audit's fifth finding), its base record: effectiveMarginalRate() must not read malformed
 * base data as zero.
 *
 * The audit asked, beside the source and step checks S5 repaired at 9818a1f, that the helper "define and validate the base
 * record's numeric inputs consistently; do not silently reinterpret malformed data as zero". The base amounts were read with
 * `Number(b[k]) || 0`, so a numeric string was coerced, and NaN, null or an object priced as $0 of that income. Decided by
 * the owner on 2026-09-16 (answer 2 (A) of the fourth set): the base is a record, and every amount it carries is a finite number;
 * an absent or undefined key is zero; anything else throws, as a bad source or step does.
 *
 * Every expectation here is the rule itself: a refusal, or equality between two calls that must price the same return.
 * runPlan() does not call this helper, so the only route is the direct call.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function household() {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  Object.assign(p.profile, { age: 80, spouseOn: false, filing: 'single' });
  return p;
}
const rate = (base, source = 'ordinary') => engine.effectiveMarginalRate(household(), 80, base, source);

test('S5R-05: a base amount given as a numeric string is refused, not coerced', () => {
  assert.throws(() => rate({ ordinaryIncome: '100000' }), /base\.ordinaryIncome must be a finite number/);
  assert.throws(() => rate({ ordinaryIncome: 100000, capitalGains: '5000' }, 'capitalGains'), /base\.capitalGains must be a finite number/);
});

test('S5R-05: a base amount that is NaN, infinite, null, a Boolean or an object is refused, not priced as zero', () => {
  for (const bad of [NaN, Infinity, -Infinity, null, true, {}]) {
    assert.throws(() => rate({ ordinaryIncome: 100000, ssBenefit: bad }), /base\.ssBenefit must be a finite number/, 'ssBenefit ' + String(bad));
  }
});

test('S5R-05: a base that is not a record is refused', () => {
  for (const bad of ['100000', 100000, [100000], true]) {
    assert.throws(() => rate(bad), /the base must be a record of amounts/, JSON.stringify(bad));
  }
});

test('control: a null, object or array source is refused as an unknown source', () => {
  for (const source of [null, {}, ['ordinary'], undefined]) {
    assert.throws(() => engine.effectiveMarginalRate(household(), 80, { ordinaryIncome: 100000 }, source), /unknown source/, String(source));
  }
});

test('control: an absent or undefined base key prices as zero, the same return as an explicit 0', () => {
  const explicit = rate({ ordinaryIncome: 100000, capitalGains: 0, ssBenefit: 0, wages: 0, qualifiedDividends: 0, spouseWages: 0, selfSeProfit: 0, spouseSeProfit: 0 });
  assert.deepEqual(rate({ ordinaryIncome: 100000 }), explicit);
  assert.deepEqual(rate({ ordinaryIncome: 100000, capitalGains: undefined }), explicit);
});

test('control: an omitted or null base prices an empty return, and finite amounts, including a negative one, are accepted', () => {
  assert.deepEqual(rate(undefined), rate({}));
  assert.deepEqual(rate(null), rate({}));
  assert.equal(typeof rate({ ordinaryIncome: 100000, capitalGains: -3000 }, 'capitalGains').above, 'number');
});
