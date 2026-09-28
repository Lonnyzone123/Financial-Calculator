/* Q101 (G8) and Q109 (H-05) through the PUBLIC ROUTE -- runPlan() and the rows it reports.
 *
 * WHY THIS FILE EXISTS, AND WHY IT EXISTS NOW. Both repairs landed earlier in S5AA with tests that
 * reach into the engine's internals, and `tools/closeout-check.js` refuses a repair whose only tests
 * are implementation-coupled (COUPLED-ONLY): one that cannot be seen from the public route has not been
 * shown to reach a user.
 *
 * It refused NEITHER of them at the time, because it could not see them at all. S5AA finding F-04:
 * `tools/requirements-register.js` matched a question id with /\b(Q\d{2})\b/ -- EXACTLY TWO DIGITS --
 * so every question numbered 100 or above was invisible to the register. Widening that pattern is what
 * surfaced these two, which is the clearest possible argument that the blindness mattered.
 *
 * Nothing here names an internal function.
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
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function household(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 75, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 5, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 60000, dividendOn: false, pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [],
  });
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false });
  p.accounts = [{
    id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 1200000,
    basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  }];
  if (edit) edit(p);
  return p;
}

/* ------------------------------------------------------------------ Q101 (G8)
 *
 * WHAT THIS HALF DOES NOT GUARD, SAID HERE BECAUSE THE REGISTER WILL STOP SAYING IT. Q101 has two
 * halves. The first is that every path is ACCOUNTED FOR -- the count asked for and the count that came
 * back are both on the result, so no path is quietly dropped from a denominator -- and that is public,
 * and is what the two tests below measure. The second is that a failed ESSENTIAL invariant
 * (RECONCILIATION_MISMATCH, NON_FINITE_ROW_VALUE, NEGATIVE_ACCOUNT_BALANCE) on ANY path takes the whole
 * batch to the invalid-result contract. That half cannot be reached from the public route, and the
 * reason is the repair's own premise: those three are accounting and numerical identities, so NO VALID
 * INPUT CAN TRIP ONE. It was checked rather than assumed -- Monte Carlo volatility at 40, 80, 150 and
 * 300 percent all return clean batches with every path valid.
 *
 * `tests/audit-s5aa-monte-carlo-invariants.test.js` guards that half, and reaches it by loading a
 * source-patched engine through `tests/lib/engine-variant.js` that faults every path AFTER path zero --
 * precisely the paths the defect never checked. It is implementation-coupled and permanently so.
 * Once the file you are reading exists, `tools/test-classification.js` no longer flags Q101 as
 * COUPLED-ONLY, because that flag fires only when EVERY guarding file is coupled. Do not read the
 * flag's absence as "Q101 is fully guarded from outside". It is not, it cannot be, and this paragraph
 * is the record of that. S5AA, 2026-09-20.
 */

test('Q101 public route: a Monte Carlo batch accounts for every path it was asked for', () => {
  /* The defect was that only path 0 was reconciled: N-1 paths went unchecked, and a household could not
     tell. Publicly, the batch now states its own arithmetic -- requested, valid, and how many errored --
     which is what makes the reported rate a rate over the whole population rather than over whichever
     paths happened to survive. */
  const p = household((x) => {
    Object.assign(x.assumptions, { method: 'monteCarlo', runs: 24, volatility: 12, seed: 4242 });
  });
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.equal(r.requestedPathCount, 24, 'every path asked for is accounted for');
  assert.equal(r.validPathCount, 24, 'and all of them were valid, so none was dropped');
  assert.equal(r.calculationErrorPaths, 0, 'no path errored, so none was excluded from the rate');
  assert.equal(r.successRate, 100,
    'a $1.2M portfolio spending $60k survives on every path, and the rate is a percentage');
});

test('Q101 public route: the same seed gives the same answer, path for path', () => {
  /* Reconciling every path must not make the run depend on which path is examined, and giving each path
     its own collector must not change the numbers that come out of any of them. */
  const make = () => household((x) => {
    Object.assign(x.assumptions, { method: 'monteCarlo', runs: 16, volatility: 15, seed: 909 });
  });
  const a = engine.runPlan(make());
  const b = engine.runPlan(make());
  assert.equal(a.status, 'ok');
  assert.equal(b.successRate, a.successRate);
  assert.deepEqual(b.rows.map((r) => r.total), a.rows.map((r) => r.total));
});

/* ------------------------------------------------------------------ Q109 (H-05) */

/* A household that loses 5% every year has a down year EVERY year, which is the only way the difference
   between a level and a ratchet becomes visible from outside: it takes a SECOND consecutive down year
   before a compounding cut and a fixed one disagree at all.
 *
 * THE STRATEGY MATTERS, and choosing the wrong one makes this whole file worthless. H-05 lived in what
 * the run CARRIES FORWARD, so it is invisible to any strategy that re-reads the entered amount each
 * year: `fixedNominal` and `incomeFirst` produce identical figures with the defect present and with it
 * repaired. Checked by restoring the defect and re-running -- the first version of this test passed
 * against the broken engine. `fixedReal` carries last year's figure forward, so it shows the defect as a
 * clean 0.75 per year: 120,000 -> 90,000 -> 67,500 -> 50,625 -> 37,969, a household modelled as
 * accepting a permanent cut and another on every later bad year. `guardrails` is here as a second
 * witness that the repair is in the shared step and not in one strategy's arithmetic.
 *
 * Everything else is held flat -- no inflation, no fees, no Social Security, one taxable account at full
 * basis -- so spending is the only figure that can move. The figures are anchored on the run's own first
 * cut rather than on a hand-computed base, because what is being asserted is the SHAPE: one cut of the
 * stated size, repeated, never compounded. */
function downYears(strategy, flexibility) {
  return household((x) => {
    x.assumptions.returnRate = -5;
    x.profile.endAge = 72;
    x.accounts[0].balance = 3000000;
    x.retirement.strategy = strategy;
    x.retirement.flexibility = flexibility;
  });
}

/* `lastAge` is where each strategy stops being a clean witness. `fixedReal` never moves spending for any
   other reason, so it holds to the end of the plan. `guardrails` has a cut rule OF ITS OWN -- a separate,
   intended 10% reduction when the withdrawal rate breaches its upper guard -- which fires at 67 in this
   losing run and takes spending from 67,500 to 60,750. That is the strategy working, not the defect, so
   the window stops before it rather than pretending the two mechanisms are one. */
for (const [strategy, lastAge] of [['fixedReal', 72], ['guardrails', 66]]) {
  test('Q109 public route (' + strategy + '): a run of down years cuts spending ONCE, not once per year', () => {
    const r = engine.runPlan(downYears(strategy, 25));
    assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
    const spend = (age) => Number(r.rows.find((row) => row.age === age).spending);

    const uncut = spend(61);
    assert.ok(uncut > 0, 'CONTROL: the first retired year is spent, and is uncut -- no year has gone down yet');

    const firstCut = spend(62);
    assert.equal((firstCut / uncut).toFixed(4), '0.7500',
      'CONTROL: the first down year does take the stated 25% cut, so a flat line below is not "no cut at all"');

    for (let age = 63; age <= lastAge; age++) {
      assert.equal(spend(age).toFixed(2), firstCut.toFixed(2),
        'the cut is 25% of the plan, not 25% of last year, at age ' + age);
    }
    assert.notEqual(spend(63).toFixed(2), (firstCut * 0.75).toFixed(2),
      'the defect this guards: a second down year taking its cut from the already-cut figure');
  });
}

test('Q109 public route: with flexibility off, the same losing run never cuts spending at all', () => {
  /* The control that gives the measurement its meaning: flexibility is the only thing in this household
     that can move spending off its strategy's own path, so the cut sizes above must vanish without it. */
  const r = engine.runPlan(downYears('fixedReal', 0));
  assert.equal(r.status, 'ok');
  const spend = (age) => Number(r.rows.find((row) => row.age === age).spending);
  for (let age = 62; age <= 72; age++) {
    assert.equal(spend(age).toFixed(2), spend(61).toFixed(2), 'no cut at age ' + age);
  }
});

test('Q109 public route: a household that never has a down year is identical with the cut on or off', () => {
  /* The other side of the same rule: the feature must be inert where it does not apply. */
  const on = engine.runPlan(household((x) => { x.retirement.flexibility = 30; }));
  const off = engine.runPlan(household((x) => { x.retirement.flexibility = 0; }));
  assert.equal(on.status, 'ok', on.status + '/' + on.calculationErrorCode);
  assert.deepEqual(on.rows.map((r) => r.spending), off.rows.map((r) => r.spending),
    'no down year, so the cut is inert and the two runs must agree row for row');
  assert.deepEqual(on.rows.map((r) => r.total), off.rows.map((r) => r.total));
});
