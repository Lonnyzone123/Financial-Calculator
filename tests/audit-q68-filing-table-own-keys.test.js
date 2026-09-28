/* Q68 -- the filing-status tables are read by own key, so a filing status spelled like an Object.prototype member takes
 * the unknown-value path in every tax function that reads them, never an inherited member.
 *
 * Coupled by design. The boundary refusal beside this file stops such a value before any route reaches these
 * functions, so a public route cannot show whether the tables themselves are still read by bracket. This file calls
 * the exported tax functions directly, which is the only place that half of the decision is observable. Decided
 * 2026-09-14 (the owner), answer (c).
 *
 * Each title is a literal, so the requirements register names every one.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const util = require('node:util');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function planFiling(filing) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  Object.assign(p.profile, { age: 66, spouseOn: false, filing });
  return p;
}
/* Every exported function that reads a filing table, called with ordinary figures. */
const CALLS = [
  ['marginalTax', (f) => engine.marginalTax(60000, f)],
  ['capitalGainsTax', (f) => engine.capitalGainsTax(20000, 60000, f)],
  ['marginalRateAt', (f) => engine.marginalRateAt(60000, f)],
  ['capitalGainsMarginalRateAt', (f) => engine.capitalGainsMarginalRateAt(60000, f)],
  ['taxableSocialSecurity', (f) => engine.taxableSocialSecurity(24000, 30000, f)],
  ['taxConfigForFilingStatus', (f) => engine.taxConfigForFilingStatus(f)],
  ['estimateTaxes', (f) => engine.estimateTaxes(planFiling(f), 66, 60000, 10000, 24000, 0, 0, 0)],
];
const answer = (fn) => { try { return { value: fn() }; } catch (e) { return { threw: String(e && e.message).split('\n')[0] }; } };
const show = (a) => (a.threw !== undefined ? 'threw: ' + a.threw : JSON.stringify(a.value, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v)).slice(0, 120));

test('Q68: every tax function that reads a filing table answers a prototype-named filing status exactly as it answers an unknown one', () => {
  const wrong = [];
  for (const [name, call] of CALLS) {
    const unknown = answer(() => call('xx'));
    for (const filing of ['constructor', 'hasOwnProperty', 'toString', '__proto__', 'valueOf']) {
      const got = answer(() => call(filing));
      if (!util.isDeepStrictEqual(got, unknown)) wrong.push(name + '("' + filing + '") -> ' + show(got) + ', where "xx" -> ' + show(unknown));
    }
  }
  assert.deepStrictEqual(wrong, []);
});

test('Q68 control: the tax functions do read the filing tables -- single, mfj and hoh do not all give one answer', () => {
  const wrong = [];
  for (const [name, call] of CALLS.filter(([n]) => n !== 'capitalGainsMarginalRateAt')) {
    const seen = new Set(['single', 'mfj', 'hoh'].map((f) => show(answer(() => call(f)))));
    if (seen.size < 2) wrong.push(name + ' gives one answer for all three filing statuses, so the comparison above would be vacuous');
  }
  assert.deepStrictEqual(wrong, [], 'CONTROL');
});
