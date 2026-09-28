'use strict';

/*
 * S3 task 8 -- L4b, the NET-WORTH reconciliation identity. Recorded as Q13.
 *
 * THE GAP. The implemented L4 invariant follows the PORTFOLIO identity,
 * correctly, because that is what the engine computes. The net-worth-shaped
 * identity is genuinely different and nothing asserted it.
 *
 * WHAT THE ENGINE ACTUALLY COMPUTES (src/engine.js, simulatePlan's row
 * assembly -- located by searching for the expression, not by line number,
 * per ground rule 19):
 *
 *   insuranceValue = p.advanced.networthOn && rowAge >= p.retirement.selfLife
 *                      ? p.advanced.insurance : 0
 *   networth       = total + (p.advanced.networthOn
 *                      ? assetValue - debtBalance + insuranceValue : 0)
 *
 * THE SEED ROW, ALIGNED IN S5 2o. The seed row -- the one pushed before the
 * projection loop -- used to compute
 *
 *   networth = initial + (networthOn ? initialAssets - initialDebt : 0)
 *
 * with no insurance term, so a plan starting at or past selfLife got no
 * insurance on row 0 and full insurance on row 1. This file reproduced that
 * asymmetry, because its job is to assert what the engine does. The owner decided
 * (2026-09-13, C6) that the written rule stands: insurance counts from the
 * first year. The engine's seed row now carries the same insurance term as
 * every later row, and the identity below follows it.
 *
 * WHAT THIS FILE CAN AND CANNOT CLOSE.
 *
 *   WITHIN-ROW: closes EXACTLY. Measured across 1,016 corpus rows, worst
 *   absolute error 0. Asserted at every row of every corpus scenario.
 *
 *   ACROSS-ROW, ASSETS: closes exactly where it can be checked, and the corpus
 *   cannot check it. Every otherAssets record the corpus produces has
 *   growth 0, and nonPortfolioDraw is > 0 on ZERO of 1,016 rows -- so over the
 *   corpus alone this identity would pass while exercising neither growth nor
 *   draws. Hand-built growing-asset cases carry the real assertion. Recorded
 *   as SPRINT_QUESTIONS.md Q35.
 *
 *   ACROSS-ROW, DEBT: CANNOT be closed from the exposed fields, and the
 *   residual is stated rather than absorbed. A row's debtPayments is
 *   debtFlow.retirementPayments -- payments made during RETIREMENT only -- so
 *   in pre-retirement years it is 0 while the balance still moves. Measured:
 *   the unexplained fraction reaches 1.0. No tolerance can rescue that and
 *   widening one to make it pass is exactly what criterion 3 forbids. What IS
 *   checkable is asserted instead, and the gap is Q35.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { corpus, installDebtModules } = require('../tools/capture-baseline.js');
const golden = require('./lib/golden-scenario-defs.js');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(
  shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
installDebtModules();
const engine = require('../src/engine.js');
const defaultPlan = golden.extractDefaultPlan(shell);

const clone = (v) => JSON.parse(JSON.stringify(v));

/* Tolerance, following L4's convention of a named constant with its reasoning.
 *
 * The within-row identity is pure addition of figures the engine has already
 * computed -- no re-derivation, no compounding -- so it should close to the
 * last bit and measurement says it does (worst error 0 over 1,016 rows).
 * 1e-6 absolute is therefore not slack the identity needs; it is a guard
 * against a future change that introduces one rounding step, so that such a
 * change fails LOUDLY as a real difference rather than being lost. If this
 * ever needs raising, the reason is a finding, not a tolerance problem. */
const NETWORTH_TOLERANCE = 1e-6;

/** Growth of otherAssets is geometric per year, so a relative tolerance. */
const ASSET_GROWTH_TOLERANCE = 1e-9;

/* S4 task 4: the corpus the L4b sweeps read -- the control plus the expansion
   members that draw on other assets. Named once, so the scope is a single
   visible choice rather than a string repeated at each call. */
const SWEEP_COMPOSITION = 'expanded';

/** The engine's own composition, reproduced. Since S5 2o the seed row follows the same insurance rule as every
    other row (see the header), so `index` no longer changes the result; it stays in the signature for callers. */
function expectedNetWorth(plan, row, index) {
  /* RE-FIXTURED at the R19 round (result-contract version 5, workstream A): a tax true-up outstanding at the row's end is
     a liability (owed) or an asset (a refund due), so net worth is net of it -- the reviewed contract's identity 3. It is
     zero unless an owner holds IRA basis or a post-70.5 QCD offset. */
  const outstanding = Number(row.taxOutstanding) || 0;
  const on = !!plan.advanced.networthOn;
  if (!on) return row.total - outstanding;
  const insurance = (row.age >= plan.retirement.selfLife)
    ? (Number(plan.advanced.insurance) || 0) : 0;
  return row.total + row.otherAssets - row.debtBalance + insurance - outstanding;
}

/** A deliberately WRONG identity -- criterion 1's first-failing probe. */
function perturbedNetWorth(plan, row, index) {
  const on = !!plan.advanced.networthOn;
  if (!on) return row.total;
  const insurance = (row.age >= plan.retirement.selfLife)
    ? (Number(plan.advanced.insurance) || 0) : 0;
  // debt ADDED rather than subtracted. The single most plausible sign error.
  return row.total + row.otherAssets + row.debtBalance + insurance;
}

/*
 * S3-07. The tolerance check below used to be the ONLY check, and a tolerance
 * check cannot see a corrupt operand:
 *
 *   Math.abs(NaN - expected) > 1e-6   is   NaN > 1e-6   is   FALSE
 *
 * so a row whose `networth` was NaN did not fail -- it PASSED, silently, and
 * counted toward "universal coverage". `null` was worse than silent: JS
 * coerces it to 0 in arithmetic, so a missing `otherAssets` made the identity
 * balance at a number nobody produced.
 *
 * Operands are therefore validated BEFORE any subtraction happens, and an
 * unusable row is reported on its own channel rather than being scored. The
 * tolerance is unchanged and deliberately so: widening it to absorb invalid
 * values is the exact move the header already warns against.
 */

/** The fields the identity will actually read for this plan. Conditional,
 *  because with networthOn off the identity is just `row.total` and demanding
 *  assets and debts would fail rows that legitimately do not carry them. */
function requiredFieldsFor(plan) {
  return plan.advanced.networthOn
    ? ['total', 'otherAssets', 'debtBalance', 'networth', 'age']
    : ['total', 'networth', 'age'];
}

function describeBadValue(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'missing';
  if (typeof v !== 'number') return 'a ' + typeof v;
  return String(v);                         /* NaN, Infinity, -Infinity */
}

/** The offending field and what was wrong with it, or null when the row is
 *  usable. Named rather than boolean so a failure says WHICH operand. */
function unusableField(plan, row) {
  for (const field of requiredFieldsFor(plan)) {
    const v = row[field];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return field + ' is ' + describeBadValue(v);
    }
  }
  /* Insurance only participates where the identity reads it. */
  if (plan.advanced.networthOn) {
    const ins = plan.advanced.insurance;
    if (ins !== undefined && ins !== null && (typeof ins !== 'number' || !Number.isFinite(ins))) {
      return 'advanced.insurance is ' + describeBadValue(ins);
    }
  }
  return null;
}

/** Runs `identity` over every row of every corpus scenario. */
function sweep(identity) {
  const failures = [];
  /* Separate channel: an unusable row is not a failed identity, it is a row
     the identity cannot be applied to. Conflating them would let a corrupt
     result read as an accounting error, or an accounting error hide as one. */
  const unusable = [];
  let rows = 0;
  let networthOnRows = 0;
  let scored = 0;
  const sweptNames = new Set();
  /* S4 task 4: the EXPANDED corpus -- the control, plus the members that
     finally draw on other assets. The task-4 gate is that L4b runs over the
     enlarged corpus and stays green. */
  corpus({ composition: SWEEP_COMPOSITION }).forEach(({ name, plan }) => {
    sweptNames.add(name);
    const result = engine.runPlan(clone(plan));

    /* An intentionally invalid result has its own contract. Its rows are not
       ordinary financial rows, so running row arithmetic over them asserts
       something the contract never promised. */
    if (result.calculationError) {
      unusable.push(name + ': result is a calculation error (' +
        (result.calculationErrorCode || 'no code') + '), not an ordinary success');
      return;
    }

    (result.rows || []).forEach((row, index) => {
      rows++;
      if (plan.advanced.networthOn) networthOnRows++;

      const bad = unusableField(plan, row);
      if (bad) {
        unusable.push(name + ' row ' + index + ' (age ' + describeBadValue(row.age) + '): ' + bad);
        return;
      }

      const expected = identity(plan, row, index);
      /* The computed expectation is an operand too. A finite row can still
         produce a non-finite expectation if the plan side is corrupt. */
      if (!Number.isFinite(expected)) {
        unusable.push(name + ' row ' + index + ' (age ' + row.age +
          '): the expected value is ' + describeBadValue(expected));
        return;
      }

      scored++;
      if (Math.abs(row.networth - expected) > NETWORTH_TOLERANCE) {
        failures.push(name + ' row ' + index + ' (age ' + row.age + '): networth ' +
          row.networth + ' != ' + expected);
      }
    });
  });
  return { failures, unusable, rows, scored, networthOnRows, names: sweptNames };
}

// ---------------------------------------------------------------------------
// Criterion 1 -- observed failing first, against a perturbed identity
// ---------------------------------------------------------------------------

test('L4b: the sweep DETECTS a wrong identity -- proven before the real one is trusted', () => {
  /* A row-level identity test never seen failing is indistinguishable from one
     that asserts nothing. The perturbation is a sign flip on debtBalance,
     which is the most plausible way to get this identity wrong. */
  const perturbed = sweep(perturbedNetWorth);
  assert.ok(perturbed.failures.length > 0,
    'the sweep failed to notice debt being ADDED to net worth instead of subtracted. Either no ' +
    'corpus scenario has networthOn AND a debt, or the sweep is not comparing anything -- both ' +
    'make every result below meaningless.');
  assert.ok(perturbed.rows > 500, 'and it must actually walk the corpus; saw ' + perturbed.rows + ' rows');
});

// ---------------------------------------------------------------------------
// Criterion 2 + 5 -- within-row, universal coverage, both networthOn states
// ---------------------------------------------------------------------------

test('L4b: net worth equals its stated composition on every row of every corpus scenario', () => {
  const swept = sweep(expectedNetWorth);
  assert.deepEqual(swept.failures, [],
    'the net-worth identity does not close:\n  ' + swept.failures.slice(0, 10).join('\n  '));
  /* S3-07: a row the identity could not be applied to must not pass quietly.
     Before the guard these were scored as successes, because NaN fails every
     comparison including the one that would have caught it. */
  assert.deepEqual(swept.unusable, [],
    'rows the identity could not be applied to:\n  ' + swept.unusable.slice(0, 10).join('\n  '));
  assert.equal(swept.scored, swept.rows,
    'every row must have been genuinely scored, not skipped as unusable');
  assert.ok(swept.rows > 500, 'universal coverage: expected the whole corpus, saw ' + swept.rows + ' rows');
  /* S4 task 4: the enlarged corpus, witnessed -- the rows of every expansion
     member were scored, not just the control's. */
  require('./lib/corpus-expansion.js').expansionNames().forEach((n) => {
    assert.ok(swept.names.has(n), n + ' was not swept: the within-row identity is not running over the expanded corpus');
  });
  assert.ok(swept.networthOnRows > 0,
    'at least one corpus scenario must have networthOn TRUE, or the identity is only ever ' +
    'exercised in its trivial form. Task 1 unblinded advanced.networthOn precisely so this ' +
    'assertion could be made; before that it would have passed vacuously.');
});

test('L4b: with networthOn FALSE, net worth equals total EXACTLY -- not within a tolerance', () => {
  /* The case to get right. An `off` scenario must not pick up assets, debts or
     insurance at all, and "exactly" is checkable here because no arithmetic
     happens: the engine returns `total` itself. */
  let checked = 0;
  corpus({ composition: SWEEP_COMPOSITION }).filter((e) => !e.plan.advanced.networthOn).forEach(({ name, plan }) => {
    const result = engine.runPlan(clone(plan));
    (result.rows || []).forEach((row, index) => {
      checked++;
      /* RE-FIXTURED at the R19 round (version 5): networth is total less the outstanding tax true-up -- still EXACTLY,
         because the engine subtracts that one number from total and nothing else happens (it is 0 without IRA basis). */
      const outstanding = Number(row.taxOutstanding) || 0;
      assert.equal(row.networth, row.total - outstanding,
        name + ' row ' + index + ': with networthOn false, networth must BE total less the outstanding true-up, got ' +
        row.networth + ' vs ' + row.total + ' - ' + outstanding);
    });
  });
  assert.ok(checked > 100, 'expected many networthOn:false rows; saw ' + checked);
});

// ---------------------------------------------------------------------------
// Criterion 4 -- the insurance step, with BOTH gates set
// ---------------------------------------------------------------------------

/** A household with one non-portfolio asset and a taxable account. */
function assetHousehold(overrides) {
  const o = overrides || {};
  const plan = clone(defaultPlan);
  plan.setupComplete = true;
  plan.id = 'l4b';
  plan.profile.age = 60;
  plan.profile.retireAge = 60;
  plan.profile.endAge = 70;
  plan.employment.salary = 0;
  plan.employment.spouseSalary = 0;
  plan.assumptions.method = 'simple';
  plan.assumptions.returnRate = 5;
  plan.assumptions.inflation = 0;
  plan.retirement.strategy = 'fixedNominal';
  plan.retirement.spending = 20000;
  plan.retirement.ssBenefit = 0;
  plan.retirement.selfLife = o.selfLife === undefined ? 95 : o.selfLife;
  plan.advanced.networthOn = o.networthOn === undefined ? true : o.networthOn;
  plan.advanced.insurance = o.insurance === undefined ? 0 : o.insurance;
  plan.advanced.otherAssets = [{
    id: 'a1', name: 'Rental', value: 400000, growth: o.growth === undefined ? 0 : o.growth,
    available: false, availableAge: 0, accessPct: 0, liquidity: 'illiquid',
  }];
  plan.accounts = [{
    id: 'x', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 800000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  return plan;
}

/** The insurance contribution, isolated from the rest of the composition. */
const insuranceComponent = (row) => row.networth - row.total - row.otherAssets + row.debtBalance;

test('L4b: insuranceValue steps in at selfLife -- with networthOn ACTUALLY ON', () => {
  /* TWO GATES, not one. A test built on "zero until selfLife, then insurance"
     WITHOUT setting networthOn sees zero on both sides and passes while
     asserting nothing -- the vacuous-pass hazard this criterion exists to
     name. Both are set here, and the networthOn:false control below is what
     proves the assertion is doing work. */
  const plan = assetHousehold({ selfLife: 65, insurance: 250000, networthOn: true });
  const rows = engine.runPlan(clone(plan)).rows;

  const before = rows.filter((r) => r.age < 65).pop();
  const at = rows.filter((r) => r.age >= 65)[0];
  assert.ok(before && at, 'the projection must span the selfLife boundary');
  assert.ok(Math.abs(insuranceComponent(before)) < NETWORTH_TOLERANCE,
    'the row before selfLife (age ' + before.age + ') must carry no insurance; got ' +
    insuranceComponent(before));
  assert.ok(Math.abs(insuranceComponent(at) - 250000) < NETWORTH_TOLERANCE,
    'the row at selfLife (age ' + at.age + ') must carry the full insurance; got ' +
    insuranceComponent(at));

  // CONTROL: with networthOn false, it is zero on BOTH sides of the boundary.
  const off = engine.runPlan(assetHousehold({ selfLife: 65, insurance: 250000, networthOn: false }));
  off.rows.forEach((row, i) => {
    assert.equal(row.networth, row.total,
      'row ' + i + ' (age ' + row.age + '): networthOn false must suppress insurance too');
  });
  /* And a zero-insurance case, so "250000 appeared" is attributable to
     advanced.insurance rather than to anything else at that age. */
  const noPolicy = engine.runPlan(assetHousehold({ selfLife: 65, insurance: 0, networthOn: true }));
  const atZero = noPolicy.rows.filter((r) => r.age >= 65)[0];
  assert.ok(Math.abs(insuranceComponent(atZero)) < NETWORTH_TOLERANCE,
    'with insurance 0 there must be no step at all; got ' + insuranceComponent(atZero));
});

test('L4b: the seed row carries insurance past selfLife, as every later row does (S5 2o)', () => {
  /* Until S5 2o this pinned the opposite: the seed row had no insurance term,
     so a plan starting past selfLife showed a step between row 0 and row 1
     (S3 task 8, 98db985). The owner decided (2026-09-13, C6) that insurance counts
     from the first year, and the engine's seed row now follows the rule, so
     there is no step. The identity helpers above no longer exempt row 0. */
  /* S5AA R9 round, the owner's decision 8 (2026-09-21): RE-FIXTURED, claim unchanged. A household of one starting past its
     only lifespan now projects nothing -- the projection stops at the last death -- so row 1 did not exist. The insurance
     is paid on the SELF's death; a spouse who is alive keeps the projection going, which is the household this rule is
     for. The spouse holds no account and changes no figure the assertions read. */
  const plan = assetHousehold({ selfLife: 55, insurance: 250000, networthOn: true });
  Object.assign(plan.profile, { spouseOn: true, spouseAge: 60, filing: 'mfj' });
  plan.retirement.spouseLife = 95;
  const rows = engine.runPlan(clone(plan)).rows;
  assert.ok(rows.length > 1, 'precondition: the surviving spouse keeps the projection going');
  assert.ok(rows[0].age >= 55, 'precondition: the plan must start past selfLife for this to bite');
  assert.ok(Math.abs(insuranceComponent(rows[0]) - 250000) < NETWORTH_TOLERANCE,
    'the seed row must carry the full insurance; got ' + insuranceComponent(rows[0]));
  assert.ok(Math.abs(insuranceComponent(rows[1]) - 250000) < NETWORTH_TOLERANCE,
    'and row 1 carries the same amount, so there is no step');
});

// ---------------------------------------------------------------------------
// Criterion 3 -- across consecutive rows
// ---------------------------------------------------------------------------

test('L4b: otherAssets between consecutive rows is explained by growth and nonPortfolioDraw', () => {
  /* Hand-built, because the corpus cannot check this -- see the header and
     the test below. Draw-then-grow is the engine's order:
     drawFromOtherAssets runs inside the period, growOtherAssets at the end. */
  [0, 3, 7].forEach((growth) => {
    const plan = assetHousehold({ growth });
    const rows = engine.runPlan(clone(plan)).rows;
    for (let i = 1; i < rows.length; i++) {
      const previous = rows[i - 1];
      const current = rows[i];
      const expected = (previous.otherAssets - current.nonPortfolioDraw) * (1 + growth / 100);
      const denominator = Math.max(1, Math.abs(expected));
      assert.ok(Math.abs(current.otherAssets - expected) / denominator < ASSET_GROWTH_TOLERANCE,
        'growth ' + growth + '%, row ' + i + ': otherAssets ' + current.otherAssets +
        ' != (' + previous.otherAssets + ' - ' + current.nonPortfolioDraw + ') * ' +
        (1 + growth / 100) + ' = ' + expected);
    }
  });
});

/* S4 task 4.1 (S4-PA-11) -- THE DRAW ITSELF, witnessed.

   The test above checks draw-then-grow, but the household it builds sets
   available:false and accessPct:0, so its `- nonPortfolioDraw` term is zero on
   every row -- measured 2026-09-13: 0 draw rows at growth 0, 3 and 7. With the
   corpus drawing on 0 of 1,036 rows as well (Q35), drawFromOtherAssets() had
   no reconciled witness anywhere. These households open every gate, leave the
   portfolio too small to fund spending, and check the identity THROUGH the
   draws. */
function drawingHousehold(overrides) {
  const o = overrides || {};
  const plan = assetHousehold({ growth: o.growth });
  plan.retirement.spending = 90000;
  plan.retirement.homeEquityFallback = o.homeEquityFallback === undefined ? true : o.homeEquityFallback;
  plan.accounts[0].balance = 60000;
  Object.assign(plan.advanced.otherAssets[0],
    { available: true, availableAge: 60, accessPct: 80, liquidity: 'liquid' }, o.asset || {});
  return plan;
}

const drawRowsOf = (plan) => (engine.runPlan(clone(plan)).rows || []).filter((r) => r.nonPortfolioDraw > 0);

test('L4b / S4 4.1: the asset identity reconciles THROUGH a draw from the other asset, at zero and non-zero growth', () => {
  [0, 5].forEach((growth) => {
    const rows = engine.runPlan(clone(drawingHousehold({ growth }))).rows;
    const draws = rows.filter((r) => r.nonPortfolioDraw > 0);
    assert.ok(draws.length >= 2, 'CONTROL: growth ' + growth + '% must actually draw -- the branch ran on ' + draws.length + ' row(s)');
    for (let i = 1; i < rows.length; i++) {
      const previous = rows[i - 1];
      const current = rows[i];
      if (current.nonPortfolioDraw > 0) {
        assert.ok(previous.otherAssets > 0, 'row ' + i + ': a draw needs a positive balance to draw from');
        assert.ok(current.nonPortfolioDraw <= previous.otherAssets * 0.8 + 1e-6,
          'row ' + i + ': a draw is capped at accessPct (80%) of the balance it draws from');
      }
      const expected = (previous.otherAssets - current.nonPortfolioDraw) * (1 + growth / 100);
      const denominator = Math.max(1, Math.abs(expected));
      assert.ok(Math.abs(current.otherAssets - expected) / denominator < ASSET_GROWTH_TOLERANCE,
        'growth ' + growth + '%, row ' + i + ': otherAssets ' + current.otherAssets +
        ' != (' + previous.otherAssets + ' - ' + current.nonPortfolioDraw + ') * ' +
        (1 + growth / 100) + ' = ' + expected);
    }
  });
});

test('S4 4.2: every gate must be open together -- each one closed alone keeps the draw unreachable', () => {
  assert.ok(drawRowsOf(drawingHousehold({})).length > 0, 'CONTROL: with every gate open the household draws');
  const withoutDraw = engine.runPlan(clone(drawingHousehold({ homeEquityFallback: false }))).rows;
  assert.ok(withoutDraw.some((r) => r.shortfall > 0),
    'premise: without the draw this household runs short, so the alternative liquidity really is insufficient');
  for (const [label, o] of [
    ['retirement.homeEquityFallback off', { homeEquityFallback: false }],
    ['available false', { asset: { available: false } }],
    ['availableAge past the horizon', { asset: { availableAge: 71 } }],
    ['accessPct 0', { asset: { accessPct: 0 } }],
  ]) {
    assert.equal(drawRowsOf(drawingHousehold(o)).length, 0, label + ' alone must keep drawFromOtherAssets() unreachable');
  }
  /* liquidity is NOT a gate, whatever a list of "the four gates" suggests:
     drawFromOtherAssets() filters on available, availableAge and value, and
     SORTS by liquidity. An illiquid asset still draws. */
  assert.ok(drawRowsOf(drawingHousehold({ asset: { liquidity: 'illiquid' } })).length > 0,
    'an illiquid asset still draws -- liquidity orders the draw, it does not gate it');
});

test('L4b / S4 4.3: over the EXPANDED corpus the across-row asset identity is exercised -- draws AND growth -- and holds', () => {
  /* The corpus half of Q35. The control corpus stays blind by design (see the
     guard below); the expanded composition carries the real assertion.

     Two classes of scenario are NOT checked here, each for a stated reason:
       - Monte Carlo: its rows are percentiles per field, not a path, so an
         across-row path identity does not apply to them (S3-08);
       - assets with DIFFERENT growth rates in one plan: a row exposes only the
         total of other assets, so the total cannot be split back by rate. No
         expansion member does this, by construction. */
  const expansionNames = new Set(require('./lib/corpus-expansion.js').expansionNames());
  const drawRowsByName = new Map();
  const growthRates = new Set();
  let pairs = 0;
  corpus({ composition: 'expanded' }).forEach(({ name, plan }) => {
    const assets = plan.advanced.otherAssets || [];
    if (!assets.length || plan.assumptions.method === 'monteCarlo') return;
    const rates = new Set(assets.map((a) => Number(a.growth) || 0));
    if (rates.size !== 1) return;
    const growth = [...rates][0];
    growthRates.add(growth);
    const rows = engine.runPlan(clone(plan)).rows || [];
    for (let i = 1; i < rows.length; i++) {
      pairs++;
      if (rows[i].nonPortfolioDraw > 0) drawRowsByName.set(name, (drawRowsByName.get(name) || 0) + 1);
      const expected = (rows[i - 1].otherAssets - rows[i].nonPortfolioDraw) * (1 + growth / 100);
      const denominator = Math.max(1, Math.abs(expected));
      assert.ok(Math.abs(rows[i].otherAssets - expected) / denominator < ASSET_GROWTH_TOLERANCE,
        name + ' row ' + i + ': otherAssets ' + rows[i].otherAssets + ' != (' + rows[i - 1].otherAssets + ' - ' +
        rows[i].nonPortfolioDraw + ') * ' + (1 + growth / 100) + ' = ' + expected);
    }
  });
  assert.ok(pairs > 0, 'reach: some row pairs must be checked');
  for (const name of expansionNames) {
    if (!/^expansion:other-asset-/.test(name)) continue;
    assert.ok((drawRowsByName.get(name) || 0) > 0, name + ' never drew, so the identity checked nothing about the draw');
  }
  assert.ok([...growthRates].some((g) => g !== 0), 'reach: some checked asset must grow');
});

test('L4b: the corpus cannot check the across-row asset identity, and says so', () => {
  /* S4 task 4: this reads the CONTROL corpus, which stays blind by design --
     it is fixed (tools/control-corpus.json) and nothing may be added to it.
     The coverage arrived as the expanded composition, and the test above
     carries the real assertion over it. This guard stays true, and still says
     so, for as long as the control does not move.

     RECORDED, NOT PAPERED OVER. Running the identity above over the corpus
     would pass -- and would prove nothing, because every corpus otherAssets
     record has growth 0 and no row ever draws. Asserting the coverage gap
     keeps it visible, and turns a future improvement in the generator into a
     failing test that says "this can be strengthened now". */
  const growthRates = new Set();
  let assetScenarios = 0;
  corpus().forEach(({ plan }) => {
    const assets = plan.advanced.otherAssets || [];
    if (!assets.length) return;
    assetScenarios++;
    assets.forEach((a) => growthRates.add(Number(a.growth) || 0));
  });
  assert.ok(assetScenarios > 0, 'precondition: some corpus scenario must carry otherAssets');

  let drawRows = 0;
  let totalRows = 0;
  corpus().forEach(({ plan }) => {
    (engine.runPlan(clone(plan)).rows || []).forEach((row) => {
      totalRows++;
      if (row.nonPortfolioDraw > 0) drawRows++;
    });
  });

  assert.deepEqual(Array.from(growthRates), [0],
    'the corpus now produces a NON-ZERO otherAssets growth rate: ' + JSON.stringify(Array.from(growthRates)) +
    '. That is an improvement -- fold the corpus into the across-row assertion above and delete ' +
    'this test. See SPRINT_QUESTIONS.md Q35.');
  assert.equal(drawRows, 0,
    'the corpus now exercises nonPortfolioDraw on ' + drawRows + ' of ' + totalRows + ' rows. ' +
    'Same as above: strengthen the assertion and delete this test. See Q35.');
});

test('L4b: the across-row DEBT identity cannot be closed, and the residual is stated not absorbed', () => {
  /* A row's debtPayments is debtFlow.retirementPayments -- payments made
     during RETIREMENT only. In pre-retirement years it is 0 while the balance
     still moves, so `previous.debtBalance - current.debtBalance` is simply not
     the same quantity. Measured below; no tolerance rescues it, and widening
     one until it passed is what criterion 3 explicitly forbids. Q35. */
  let pairs = 0;
  let worstUnexplained = 0;
  corpus().forEach(({ plan }) => {
    if (!(plan.advanced.debts || []).length) return;
    const rows = engine.runPlan(clone(plan)).rows || [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i - 1].debtBalance <= 0) continue;
      pairs++;
      const drop = rows[i - 1].debtBalance - rows[i].debtBalance;
      const unexplained = Math.abs(drop - rows[i].debtPayments) / Math.max(1, rows[i - 1].debtBalance);
      worstUnexplained = Math.max(worstUnexplained, unexplained);
    }
  });
  assert.ok(pairs > 0, 'precondition: the corpus must contain scenarios with debt');
  assert.ok(worstUnexplained > 0.5,
    'the debt residual is now small (' + worstUnexplained.toFixed(6) + '). If the engine began ' +
    'exposing per-period debt interest, this identity became closeable -- close it and delete ' +
    'this test rather than leaving a bound nobody needs. See Q35.');

  /* What IS checkable, asserted rather than skipped. */
  corpus().forEach(({ name, plan }) => {
    const rows = engine.runPlan(clone(plan)).rows || [];
    rows.forEach((row, i) => {
      assert.ok(row.debtBalance >= 0, name + ' row ' + i + ': debt balance went negative (' +
        row.debtBalance + '), which no payment schedule can produce');
    });
  });
});

test('L4b: a rising debt balance is negative amortization, not a bookkeeping error', () => {
  /* debtBalance is NOT monotonically decreasing -- measured, it rises on 45 of
     983 corpus row pairs, by as much as $72,733 in a year. Every case is a
     generated debt whose payment is below its monthly interest (10-11% rates
     against payments of a few hundred dollars), so the balance genuinely
     grows. Asserted here so that a reader meeting a rising balance in the
     capture has the explanation attached, rather than filing it as a defect. */
  let rises = 0;
  const offenders = new Set();
  corpus().forEach(({ name, plan }) => {
    const rows = engine.runPlan(clone(plan)).rows || [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].debtBalance > rows[i - 1].debtBalance + 1e-9) {
        rises++;
        offenders.add(name);
      }
    }
  });
  if (rises === 0) return; // nothing to explain
  offenders.forEach((name) => {
    const plan = corpus().find((e) => e.name === name).plan;
    const underwater = (plan.advanced.debts || []).some((d) => {
      const monthlyInterest = Number(d.balance) * (Number(d.rate) || 0) / 100 / 12;
      return monthlyInterest > (Number(d.paymentMonthly) || 0);
    });
    assert.ok(underwater,
      name + ': the debt balance rises but no debt has a payment below its monthly interest. ' +
      'That is not negative amortization and needs a different explanation.');
  });
});

// ---------------------------------------------------------------------------
// S3-07 -- a tolerance check cannot see a corrupt operand
//
// Math.abs(NaN - expected) > 1e-6 is NaN > 1e-6, which is FALSE, so a row with
// a NaN networth used to PASS and count toward universal coverage. null was
// worse: JS coerces it to 0, so a missing otherAssets made the identity
// balance at a number nobody produced.
//
// These drive unusableField() directly rather than corrupting the engine,
// because the guard is what is under test and a synthetic row states the case
// exactly. The sweep's own assertions above cover the integrated path.
// ---------------------------------------------------------------------------

const S307_ON = { advanced: { networthOn: true, insurance: 0 }, retirement: { selfLife: 95 } };
const S307_OFF = { advanced: { networthOn: false, insurance: 0 }, retirement: { selfLife: 95 } };
const s307Row = (over) => Object.assign(
  { total: 100, otherAssets: 10, debtBalance: 5, networth: 105, age: 70 }, over);

test('S3-07: every operand the identity reads is rejected when corrupt, and named', () => {
  const fields = ['total', 'otherAssets', 'debtBalance', 'networth', 'age'];
  const corruptions = [NaN, Infinity, -Infinity, null, undefined, '100', {}];

  for (const field of fields) {
    for (const bad of corruptions) {
      const row = s307Row({ [field]: bad });
      const verdict = unusableField(S307_ON, row);
      assert.ok(verdict, field + ' = ' + describeBadValue(bad) + ' must be rejected, not scored');
      assert.ok(verdict.startsWith(field),
        'the report must name the offending field; got "' + verdict + '" for ' + field);
    }
  }
});

test('S3-07: a corrupt insurance figure is rejected only where the identity reads it', () => {
  const plan = { advanced: { networthOn: true, insurance: NaN }, retirement: { selfLife: 95 } };
  assert.ok(unusableField(plan, s307Row()), 'with networthOn, a NaN insurance is an operand');

  /* With net-worth accounting off the identity is `row.total`, so insurance is
     never read and must not be invented as a failure. */
  const off = { advanced: { networthOn: false, insurance: NaN }, retirement: { selfLife: 95 } };
  assert.equal(unusableField(off, s307Row()), null,
    'with networthOn false the identity does not read insurance, so it cannot be corrupt');
});

test('S3-07: valid rows still pass, including an all-zero one', () => {
  assert.equal(unusableField(S307_ON, s307Row()), null, 'the ordinary row must be usable');

  /* The case a naive "truthy" guard gets wrong: every field is a legitimate
     zero, which is valid data and must not read as missing. */
  const zeroes = { total: 0, otherAssets: 0, debtBalance: 0, networth: 0, age: 0 };
  assert.equal(unusableField(S307_ON, zeroes), null, 'an all-zero row is valid, not empty');
  assert.equal(unusableField(S307_OFF, zeroes), null);

  /* And negatives, which are ordinary for net worth. */
  assert.equal(unusableField(S307_ON, s307Row({ networth: -5000, debtBalance: 105000 })), null);
});

test('S3-07: the guard does not swallow a real accounting mismatch', () => {
  /* The whole point of validating operands is to let the tolerance check do its
     job on valid ones. A finite 101-against-100 must still fail, and the
     tolerance must not have been widened to make invalid values pass. */
  const plan = S307_ON;
  const row = s307Row({ networth: 101 });          /* expected: 100 + 10 - 5 = 105 */
  assert.equal(unusableField(plan, row), null, 'precondition: the row itself is usable');

  const expected = expectedNetWorth(plan, row, 1);
  assert.equal(expected, 105);
  assert.ok(Math.abs(row.networth - expected) > NETWORTH_TOLERANCE,
    'a finite mismatch must still be caught after the guard');

  /* And the tolerance itself is unchanged. */
  assert.equal(NETWORTH_TOLERANCE, 1e-6, 'the repair must not have widened the tolerance');
});
