/* S5AA R37 (SA32F-47; Claude's R32F full-model audit, qualified by ChatGPT's R32V) -- effectiveMarginalRate() STATES ITS SOURCE
 * CONTRACT: IT TAKES INVESTMENT INCOME THAT IS ORDINARY INCOME, AND REFUSES AMOUNTS IT DOES NOT READ.
 *
 * R32V: "effectiveMarginalRate lacks a separately classified rental/nonqualified-investment-income input and silently ignores
 * unsupported added keys ... State the helper's supported source contract or extend it with the proper NIIT base; avoid
 * attributing this to every ordinary-income dollar."
 * Extended with the proper base: the tax routine already carries niiOther, the part of ordinary income that is also net
 * investment income (non-qualified dividends, rent, interest), which reaches the 3.8% surtax and nothing else. The helper now
 * takes base.niiOther and a source "investmentOrdinary" -- a dollar that is ordinary income AND net investment income -- beside
 * "ordinary", which stays a dollar that is not (wages-like: a pension, an IRA draw). A base amount it does not read is refused
 * by name instead of being ignored.
 *
 * Hand expectation: single, 40, ordinary income 250,000 of which 50,000 is net investment income. MAGI is 50,000 over the
 * 200,000 threshold and NII is 50,000, so the surtax base is min(50,000, 50,000). One more dollar of plain ordinary income
 * raises MAGI but not NII: no more surtax. One more dollar of investment income raises both: 3.8 cents more. Everything else in
 * the return treats the two dollars alike, so the rates differ by exactly 0.038. */
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

const single40 = { profile: { filing: 'single', age: 40, spouseOn: false, spouseAge: 40, state: 'AZ' } };

test('R37 SA32F-47: a dollar of investment income that is ordinary income carries the 3.8% surtax a wage-like dollar does not', () => {
  const base = { ordinaryIncome: 250000, niiOther: 50000 };
  const plain = engine.effectiveMarginalRate(single40, 40, base, 'ordinary');
  const invest = engine.effectiveMarginalRate(single40, 40, base, 'investmentOrdinary');
  assert.ok(Math.abs((invest.above - plain.above) - 0.038) < 1e-9, 'difference ' + (invest.above - plain.above));
  /* CONTROL: below the threshold the surtax does not apply, and the two dollars cost the same. */
  const low = { ordinaryIncome: 100000, niiOther: 50000 };
  assert.ok(Math.abs(engine.effectiveMarginalRate(single40, 40, low, 'investmentOrdinary').above - engine.effectiveMarginalRate(single40, 40, low, 'ordinary').above) < 1e-9);
});

test('R37 SA32F-47: an amount the helper does not read is refused by name, not ignored', () => {
  assert.throws(() => engine.effectiveMarginalRate(single40, 40, { ordinaryIncome: 100000, rentalIncome: 20000 }, 'ordinary'),
    /base\.rentalIncome is not an amount this helper reads/);
  assert.throws(() => engine.effectiveMarginalRate(single40, 40, { ordinaryIncome: 100000, niiOther: 'x' }, 'ordinary'), /base\.niiOther must be a finite number/);
});
