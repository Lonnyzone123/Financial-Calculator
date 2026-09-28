/* CQ-6 -- behavioural residuals: paths that do not pass runPlan()'s input gates.
 *
 * findingIds: CQ-6
 *
 * The auditor's condition (S2_S3_CLOSEOUT_ANSWERS_20260912.md, CQ-6): withdraw
 * the universal "every public execution path" claim, and record the heat-map
 * bypass, the exported simulatePlan() bypass and the runScenario() cycle
 * exception as BEHAVIOURAL RESIDUALS WITH REPRODUCTIONS AND OWNERS. They carry
 * to S5; they do not block the bounded register closeout.
 *
 * HOW THIS FILE CARRIES THEM. Each residual is a `todo` test asserting the
 * INTENDED behaviour -- the same form the P19 revival contracts already use.
 * A todo that fails is the reproduction; when a residual is repaired its todo
 * starts passing and must be promoted to an ordinary test. The non-todo tests
 * are controls: they prove runPlan() rejects every one of these inputs on ITS
 * path, so each todo is measuring a bypass and not a fixture that never
 * reached any gate.
 *
 * R2R-001 IS NOT REOPENED BY THIS. Its accepted scope was the quote-entry
 * validator (archive/R2_T01_T02_EXTERNAL_REQUALIFICATION_ROUND2_2026-09-09.md:91
 * offered it as one of two alternatives; round 3 passed it "for the specified
 * repair scope"), and nonFiniteQuoteInputCode() runs inside quoteTaxFunding(),
 * which simulatePlan() calls directly. What these paths skip are the checks
 * added LATER at runPlan(): the balance/basisPct boundary half, RB-01/02, Q48
 * and Q49.
 *
 * Reachability: none of these inputs can come from JSON import (validated) or
 * the live UI (coerced with Number()). Direct programmatic input only.
 *
 * Owner: S5 block 2n (added at 7dd8523; previously "S5, engine input-defence
 * ground", beside Q55/Q57/Q58). The BC-02 test at the end was a residual until S5 block 2m repaired it.
 * R6 (runScenario() on a cycle outside clone()'s three arrays) was a residual
 * until S5 2n.4 repaired the identity hash; its test now asserts the repair.
 *
 * S5 block 2n (2026-09-14, the owner's answer (a)) moved runPlan()'s input gates into
 * simulatePlan() itself, and the heat map now hands simulatePlan() a shallow copy
 * of the plan rather than a JSON clone. Both paths refuse every input below, so
 * the nine residual todos became ordinary tests, renamed, and their registry
 * entries left in the same commit. The tests after the BC-02 one witness what
 * the move must also guarantee.
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
const golden = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js'));
const defaultPlan = golden.extractDefaultPlan(shell);

function plan(mutate) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { returnRate: 5, inflation: 2.5, method: 'simple', volatility: 12, seed: 4242 });
  Object.assign(p.profile, { age: 50, retireAge: 60, endAge: 90 });
  Object.assign(p.employment, { salary: 110000, contributionStop: 60 });
  const acct = (over) => Object.assign({
    id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 400000, contribution: 6000, contributionMode: 'amount', priority: 1, basisPct: 80,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }, over);
  p.accounts = [acct({}), acct({ id: 'a2', name: '401k', type: 'traditional401k', taxClass: 'preTax', balance: 350000, contribution: 12000, priority: 2 })];
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  if (mutate) mutate(p);
  return p;
}

/* The two entry paths that used to bypass runPlan()'s gates, exactly as they
   exist. The heat map (src/app-shell.html) takes a shallow copy of the plan with
   its own assumptions object, then
   classifyHistoricalCell(simulatePlan(testPlan, rng(seed), 0, null)). Until S5
   block 2n it took a JSON clone, which turned a non-finite number into null and
   threw on a cycle before any gate could see the input. */
const direct = (p) => engine.simulatePlan(p, engine.rng(p.assumptions.seed), 0, null, []);
const heatMap = (p) => engine.simulatePlan(Object.assign({}, p, { assumptions: Object.assign({}, p.assumptions) }), engine.rng(p.assumptions.seed), 0, null, []);
/* A raw simulatePlan() result is "flagged" when it records a calculation
   error, which is what classifyHistoricalCell() reads to mark a cell invalid
   rather than as an ordinary funded/not-funded answer. */
const flagged = (r) => r.calculationErrorAge !== null && r.calculationErrorAge !== undefined;

const INPUTS = [
  ['a non-finite balance', (p) => { p.accounts[0].balance = NaN; }, 'SCENARIO_NONFINITE_ACCOUNT'],
  ['a non-finite contribution', (p) => { p.accounts[0].contribution = NaN; }, 'SCENARIO_NONFINITE_CONTRIBUTION'],
  ['a duplicate account id', (p) => { p.accounts[1].id = p.accounts[0].id; }, 'SCENARIO_DUPLICATE_ACCOUNT_ID'],
  ['a circular reference in an account', (p) => { p.accounts[0].self = p.accounts[0]; }, 'SCENARIO_NONSERIALIZABLE_INPUT'],
  /* RB-02's bypass. What is reproduced is ACCEPTANCE of the invalid category on
     the bypass paths. Its financial harm -- retained pension surplus parked in
     the account -- needs retained surplus, which this fixture does not produce,
     so no consequence is claimed here. */
  ['an invalid cash holding (true on a tax-deferred account)', (p) => { p.accounts[1].cashHolding = true; }, 'SCENARIO_INVALID_CASH_HOLDING'],
];

test('control: the bypass paths run an ordinary plan to the same result as runPlan()', () => {
  const p = plan();
  const gated = engine.runPlan(p);
  assert.equal(gated.status, 'ok');
  const want = gated.rows[gated.rows.length - 1].total;
  assert.equal(direct(plan()).rows.slice(-1)[0].total, want);
  assert.equal(heatMap(plan()).rows.slice(-1)[0].total, want);
});

for (const [label, mutate, code] of INPUTS) {
  test(`control: runPlan() rejects ${label} on its own path`, () => {
    assert.equal(engine.runPlan(plan(mutate)).calculationErrorCode, code);
  });

  for (const [pathName, run] of [['the exported simulatePlan()', direct], ['the heat map\'s path', heatMap]]) {
    test(`${pathName} refuses ${label} at its gate, rather than returning an unflagged result`, () => {
      let result;
      assert.doesNotThrow(() => { result = run(plan(mutate)); }, `${pathName} threw on ${label}`);
      assert.ok(flagged(result),
        `${pathName} returned an ordinary-looking result for ${label} ` +
        `(failed=${result.failed}, end total=${result.rows ? Math.round(result.rows.slice(-1)[0].total) : 'no rows'})`);
      assert.equal(result.calculationErrorCode, code, `${pathName} must name the refusal runPlan() gives`);
    });
  }
}

/* R6, repaired in S5 2n.4. runPlan() returns "ok" on a cycle outside clone()'s
   three arrays (profile is never cloned), and Q48's scope test keeps it that
   way. runScenario() threw RangeError there, and TypeError on a BigInt,
   because buildSimulationIdentity() hashes the whole plan through
   stableStringify(). That function had no cycle check and handed a BigInt to
   JSON.stringify(). Both are now marked in the hash, so the run keeps its
   full identity. Measured at 2560caa before the repair; both tests below
   were red first. */
test('R6: runScenario() does not throw on a circular reference outside clone()\'s three arrays, and keeps a full identity', () => {
  const p = plan((x) => { x.profile.self = x.profile; });
  assert.equal(engine.runPlan(p).status, 'ok', 'control: runPlan() accepts it');
  let out;
  assert.doesNotThrow(() => { out = engine.runScenario(p); });
  assert.equal(out.status, 'ok');
  assert.ok(out.identity && out.identity.inputHash, 'the run keeps its input hash');
});

test('R6: runScenario() does not throw on a BigInt outside clone()\'s three arrays, and keeps a full identity', () => {
  const p = plan((x) => { x.profile.note = 10n; });
  assert.equal(engine.runPlan(p).status, 'ok', 'control: runPlan() accepts it');
  let out;
  assert.doesNotThrow(() => { out = engine.runScenario(p); });
  assert.equal(out.status, 'ok');
  assert.ok(out.identity && out.identity.inputHash, 'the run keeps its input hash');
});

/* BC-02 (closeout verdict 2026-09-13). ON runPlan()'S OWN PATH, not a bypass:
   Q48's precheck serialized the input a SECOND time and discarded the bytes,
   so a toJSON callback ran twice. Measured: a callback that succeeds once and
   throws on the next call ran once and returned "ok" on engine e3f008ab...,
   and ran twice and threw uncaught on 34b2ab9a.... Repaired in S5 block 2m
   under the owner's policy (2m.1): serialize once under the error boundary and
   reuse it. This test was a todo until then. It still asserts only what both
   candidate policies had to give -- no uncaught throw; the callback counts,
   refusals and balance control are tests/audit-bc02-clone-once.test.js. */
function withCallback(stateful) {
  let calls = 0;
  const p = plan((x) => {
    const data = Object.assign({}, x.accounts[0]);
    x.accounts[0].toJSON = function () {
      calls += 1;
      if (stateful && calls >= 2) throw new Error('second serialization');
      return data;
    };
  });
  return { p, calls: () => calls };
}

test('control: an ordinary toJSON callback still runs through runPlan()', () => {
  const { p, calls } = withCallback(false);
  assert.equal(engine.runPlan(p).status, 'ok');
  assert.ok(calls() >= 1, 'the callback must actually be invoked, or this control measures nothing');
});

test('BC-02: runPlan() does not throw on a stateful toJSON that clone() alone accepted', () => {
  const { p } = withCallback(true);
  assert.doesNotThrow(() => engine.runPlan(p));
});

/* S5 block 2n: what the gate move must also guarantee. Each of these was red
   against the parent, where simulatePlan() ran no gate. */
test('a serialized argument without runPlan()\'s token cannot skip the gate', () => {
  const p = plan((x) => { x.accounts[0].balance = NaN; });
  const forged = [{ text: JSON.stringify(plan().accounts) }, null, null];
  const result = engine.simulatePlan(p, engine.rng(p.assumptions.seed), 0, null, [], forged);
  assert.equal(result.calculationErrorCode, 'SCENARIO_NONFINITE_ACCOUNT',
    'clean serialized accounts handed in by a caller must not stand in for the plan it passed');
});

test('a refused direct call returns simulatePlan()\'s own fields with no rows or figures, and reports the refusal to a collector', () => {
  const p = plan((x) => { x.accounts[1].id = x.accounts[0].id; });
  const collector = [];
  const refused = engine.simulatePlan(p, engine.rng(p.assumptions.seed), 0, null, collector);
  assert.equal(refused.calculationErrorCode, 'SCENARIO_DUPLICATE_ACCOUNT_ID', 'the refusal must be named');
  assert.equal(refused.rows, null, 'a refused input has no projection rows');
  assert.equal(refused.failed, null);
  assert.equal(refused.lifetimeTaxes, null);
  assert.equal(refused.calculationErrorAge, p.profile.age, 'the error age is the plan\'s starting age, which the heat map\'s classifier reads');
  assert.ok(collector.some((i) => i.code === 'SCENARIO_DUPLICATE_ACCOUNT_ID' && i.severity === 'ERROR'), 'the collector receives the refusal');
  const bare = engine.simulatePlan(p, engine.rng(p.assumptions.seed), 0, null);
  assert.equal('issues' in bare, false, 'without a collector there is no issues field, as for any simulatePlan() call');
  assert.equal(bare.calculationErrorCode, 'SCENARIO_DUPLICATE_ACCOUNT_ID');
});

test('a direct simulatePlan() call reads an absent includePayment as its documented default, as runPlan() does', () => {
  /* Before the gate move a direct call read the absent flag as false: no debt
     payment reached retirement spending, while runPlan() counted it. */
  const debtPlan = (includePayment) => plan((x) => {
    const d = { id: 'd1', name: 'Loan', type: 'otherDebt', owner: 'household', balance: 600000, rate: 6, rateType: 'fixed',
      paymentMonthly: 3100, extraPrincipalMonthly: 0, payoffAge: 95, includeHousingCosts: false };
    if (includePayment !== undefined) d.includePayment = includePayment;
    x.advanced.debts = [d];
  });
  const retired = (r) => r.rows.filter((row) => row.age > 61 && row.age < 64).reduce((s, row) => s + row.debtPayments, 0);
  const counted = retired(direct(debtPlan(true)));
  assert.ok(counted > 0, 'premise: a debt counted toward spending adds debt payments in retirement');
  assert.equal(retired(direct(debtPlan(false))), 0, 'control: a debt outside spending adds none');
  assert.equal(retired(direct(debtPlan(undefined))), counted, 'an absent includePayment must read as its documented default, true');
});

test('the heat map hands simulatePlan() the plan as entered, not a JSON clone', () => {
  assert.ok(shell.includes('testPlan=Object.assign({},p,{assumptions:Object.assign({},p.assumptions)})'),
    'the heat map must take a shallow copy, so the gates inside simulatePlan() see the input before any clone');
  assert.equal(shell.includes('testPlan=clone(p)'), false,
    'a JSON clone first would turn a non-finite number into null, and throw on a cycle, before any gate');
});
