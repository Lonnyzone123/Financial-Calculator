/* S5AA R37 (SA32F-21, SA32F-40, SA32F-55; Claude's R32F full-model audit DMC-01, DMC-02, DMC-11, each confirmed by ChatGPT's R32V) --
 * THREE ENGINE SAFEGUARDS.
 *
 * SA32F-21: an adjustable debt with a reset age and no `payoffAge` made the recast term NaN, and runPlan() THREW a RangeError --
 *   RESULT_CONTRACT section 3 and Q100 promise the invalid-result shape on every public path. R32V: "Validate/default the term or
 *   return the documented refusal."
 * SA32F-40: with no `resetRate`, Number(undefined) || 0 made the rate after the reset 0% -- $17,672.56 of year-2 interest disappeared.
 *   R32V: "Zero cannot silently stand for unknown. Require the rate or disclose a documented fallback."
 * Both are now refused at the input gate, with one code (SCENARIO_DEBT_RESET_TERMS_MISSING, the gate's SCENARIO_ prefix as for NONFINITE_DEBT_RATE): the reset needs both facts. The app's own form
 * always supplies them (normalizeDebt() fills payoffAge 75 and resetRate at the type's rate); only direct callers are turned away.
 * SA32F-55: stableStringify() hashed keys whose value is undefined, which JSON drops, so an accepted input's inputHash changed after a
 *   JSON round trip. It now hashes what JSON would keep. */
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
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function withArm(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.profile.age = 55;
  p.advanced.debts = [{ id: 'm', type: 'mortgage', name: 'Mortgage', owner: 'household', balance: 300000, rate: 6, paymentMonthly: 1798.65,
    rateType: 'adjustable', nextRateResetAge: 61, resetRate: 8, payoffAge: 85, includePayment: true }];
  edit(p.advanced.debts[0]);
  return p;
}

test('R37 SA32F-21: an adjustable debt with no payoff age is refused, not thrown', () => {
  let r;
  assert.doesNotThrow(() => { r = engine.runPlan(withArm((d) => { delete d.payoffAge; })); }, 'the engine threw a RangeError');
  assert.notStrictEqual(r.status, 'ok');
  assert.strictEqual(r.calculationErrorCode, 'SCENARIO_DEBT_RESET_TERMS_MISSING');
});

test('R37 SA32F-40: an adjustable debt with no reset rate is refused, not charged 0%', () => {
  const r = engine.runPlan(withArm((d) => { delete d.resetRate; }));
  assert.strictEqual(r.calculationErrorCode, 'SCENARIO_DEBT_RESET_TERMS_MISSING', 'the engine ran it at 0% after the reset');
  /* CONTROLS: with both facts it runs; a fixed-rate debt, or an adjustable one with no reset age, needs neither. */
  assert.strictEqual(engine.runPlan(withArm(() => {})).status, 'ok');
  assert.strictEqual(engine.runPlan(withArm((d) => { d.rateType = 'fixed'; delete d.resetRate; delete d.nextRateResetAge; })).status, 'ok');
  assert.strictEqual(engine.runPlan(withArm((d) => { delete d.resetRate; delete d.nextRateResetAge; })).status, 'ok');
});

test('R37 SA32F-55: the input hash is the same before and after a JSON round trip', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.profile.nickname = undefined;
  p.retirement.stages = [];
  const direct = engine.runScenario(p).identity.inputHash;
  const trip = engine.runScenario(JSON.parse(JSON.stringify(p))).identity.inputHash;
  assert.strictEqual(direct, trip, 'an undefined-valued key changed the hash');
});
