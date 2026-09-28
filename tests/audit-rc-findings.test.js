'use strict';

/*
 * ADVERSARIAL RE-AUDIT (RC-01…RC-05, and the RB-01 extension) — STEP 0.
 *
 * Source: ADVERSARIAL_HANDOVER_ADDENDUM_20260910.md, disposition "Keep
 * release qualification open. Five additional findings confirmed: four P1 and
 * one P2. RB-01 also has a second financial failure mode." It reviews the same
 * package as REAUDIT_2_AUDIT_AND_CLAUDE_HANDOVER_20260910.md and extends it;
 * the addendum takes precedence where it narrows an assurance.
 *
 * WHAT THIS FILE IS. The companion to tests/audit-rb-findings.test.js. That
 * file records the nine RB findings; this one records the five RC findings and
 * the RB-01 extension, which the RB file predates. Together they are step 0 of
 * the combined closure order (addendum §6). This file repairs nothing. Every
 * test asserts the CORRECT behaviour and therefore fails today.
 *
 * TODO-MARKED, same convention as the RB file: `npm test` stays green at a
 * task boundary. Remove the todo marker in the same commit as the repair,
 * never before. Each marker names the addendum's closure-order step.
 *
 * ON THE FIGURES. Every number below was reproduced against this tree before
 * it was written down, and every one agrees with the addendum TO THE CENT —
 * including the four-place RMD figure and the capture hash. The evidence
 * bundle's own acceptance harness (ADVERSARIAL_AUDIT_EVIDENCE_20260910.zip,
 * `acceptance-checks.test.js`) was also run against this tree and returned its
 * documented 7 failures / 3 passing controls, and all three probe scripts
 * regenerated their delivered JSON byte-for-byte.
 *
 * ONE TRAP WORTH KNOWING, because it cost a reproduction here and will cost
 * the repair author more. `retirement.dividendOn: false` does NOT mean "no
 * dividends". engine.js:1179 reads it as the IMPUTED branch: with the flag
 * off, the engine charges 1.5% of eligible taxable balances as qualified
 * dividends. Turning the feature ON with `dividendYield: 0` is what actually
 * produces zero dividend income. The two differ by $568.20 of tax in the
 * RB-01-extension scenario below. That imputation is a deliberate, documented
 * construct (SPRINT_QUESTIONS.md Q-note at :1030, ROADMAP_EXTERNAL_REVIEW.md
 * :529) — it is NOT a finding and must not be "repaired" — but it means the
 * base plan here sets dividendOn TRUE with a zero yield, which is the only
 * combination that genuinely switches dividends off.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const baseline = require('../tools/capture-baseline.js');
const golden = require('./lib/golden-scenario-defs.js');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(
  shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
baseline.installDebtModules();
const engine = require('../src/engine.js');
const { validateScenario } = require('../src/scenario-validator.js');
const mvi = require('../src/mortgage-vs-investing.js');
const adapter = require('../src/debt-strategy-adapter.js');

const clone = (v) => JSON.parse(JSON.stringify(v));
const defaultPlan = golden.extractDefaultPlan(shell);

/** A complete account record, so a probe cannot fail for a missing field. */
function account(over) {
  return Object.assign({
    id: 'a1', name: 'A', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 0,
    contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0,
    annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }, over);
}

/** Deterministic: zero return, zero inflation, no debts, genuinely no
 *  dividends (see the flag note in the file header), no spending flexibility. */
function basePlan(over) {
  const p = clone(defaultPlan);
  p.setupComplete = true;
  p.profile.filing = 'single';
  p.profile.spouseOn = false;
  p.assumptions.method = 'simple';
  p.assumptions.returnRate = 0;
  p.assumptions.inflation = 0;
  p.assumptions.fee = 0;
  p.retirement.dividendOn = true;
  p.retirement.dividendYield = 0;
  p.retirement.flexibility = 0;
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  return Object.assign(p, over || {});
}

const retiredProfile = (over) =>
  Object.assign(clone(defaultPlan.profile), { filing: 'single', spouseOn: false }, over);
const noWages = () =>
  Object.assign(clone(defaultPlan.employment), { salary: 0, spouseSalary: 0, growth: 0 });

// ===========================================================================
// RB-01 EXTENSION · P1 — the tax-funding solver keys capacity by account id
// ===========================================================================

/* REPRODUCED TO THE CENT: shortfall 25,910.90, taxes 27,910.90, taxable
   198,000.00; control taxable 172,089.10 with zero shortfall.

   This is the finding that retires Q23's premise. The comment above
   validateAccountIdentity() in scenario-validator.js defers rejection to
   WARNING and names its own trip-wire -- "S3 task 5 can escalate to ERROR at
   the moment it actually keys by id". quoteTaxFunding() already keys by id
   (engine.js:592, `var key="a:"+a.id`), so the condition Q23 set for itself
   is already met. The repair does not need to overturn that reasoning; it
   satisfies it. */
test('RB-01 extension: duplicate ids must not strand taxable capacity behind a false shortfall', () => {
  const build = (ids) => {
    const p = basePlan({
      id: 'rb01x',
      profile: retiredProfile({ age: 65, retireAge: 65, endAge: 66 }),
      employment: noWages(),
      accounts: [
        account({ id: ids[0], balance: 1000, basisPct: 0, priority: 1 }),
        account({ id: ids[1], balance: 199000, basisPct: 100, priority: 2 }),
      ],
    });
    Object.assign(p.retirement, {
      strategy: 'fixedNominal', spending: 150000, pension: 150000, ssBenefit: 0,
    });
    return p;
  };

  /* CONTROL FIRST: with unique ids the same obligation funds completely, so
     any shortfall below is caused by the identity collision and nothing else. */
  const control = engine.runPlan(build(['one', 'two']));
  assert.equal(control.status, 'ok');
  assert.ok(Math.abs(control.rows[1].shortfall) < 0.01,
    'CONTROL: unique ids must fund the obligation with no shortfall; got ' + control.rows[1].shortfall);
  /* R6 (S5 task 8, the Arizona age-65 exemption, TAX section 5.3, ENACTED): 27,910.90 became 27,858.40 -- one $2,100 exemption takes $52.50 off the Arizona tax.
     The mechanism this pins is unchanged, and 27,910.90 returns exactly with the exemption set to $0. */
  /* S5AA task 3.1 (Q88): 27,858.40 before the IRC 63(f) additional deduction for the aged, which takes a
     further $492 -- $2,050 at the 24% bracket. */
  assert.ok(Math.abs(control.rows[1].taxes - 27366.40) < 0.01,
    'CONTROL: the tax obligation is 27,366.40 (27,858.40 before the 63(f) additional deduction); got ' + control.rows[1].taxes.toFixed(2));
  assert.ok(Math.abs(control.rows[1].taxable - 172633.60) < 0.01, /* R6: 172,089.10 before the age-65 exemption's $52.50;
      S5AA task 3.1: 172,141.60 before the 63(f) additional deduction left $492 more cash */
    'CONTROL: taxable closes at 172,089.10 after funding; got ' + control.rows[1].taxable.toFixed(2));

  const duplicate = build(['same', 'same']);

  assert.equal(validateScenario(clone(duplicate)).valid, false,
    'RB-01 acceptance (extension): a duplicate-id plan must be REJECTED at the validation ' +
    'boundary. A UI warning does not establish the solver\'s identity precondition, and this ' +
    'plan involves no contributions and no transfers at all -- only two taxable accounts that ' +
    'happen to share an id.');

  const r = engine.runPlan(clone(duplicate));
  if (r.status !== 'ok') return; // an explicit refusal is an acceptable repair

  assert.ok(Math.abs(r.rows[1].shortfall) < 0.01,
    'the plan reported a shortfall of ' + r.rows[1].shortfall.toFixed(2) + ' while leaving ' +
    r.rows[1].taxable.toFixed(2) + ' of taxable assets unspent. quoteTaxFunding() seeds ' +
    'remaining["a:"+id] from the FIRST account it sees under that key, so the second ' +
    'account\'s real 199,000 of capacity is never offered to the quote. The result is a false ' +
    'financial shortfall, not merely an ambiguous status.');
});

// ===========================================================================
// RC-01 · P1 — a conversion can consume the required distribution
// ===========================================================================

/* REPRODUCED TO THE CENT: required 4,065.040650406504; Roth closes at 100,000
   with preTax at 0 and rmd still REPORTED as the required figure; the
   reserving control closes Roth at 95,934.9593495935. */
test('RC-01: a conversion must not consume the dollars the RMD is owed from', () => {
  const p = basePlan({
    id: 'rc01',
    profile: retiredProfile({ age: 75, retireAge: 65, endAge: 76 }),
    employment: noWages(),
    accounts: [
      account({ id: 'cash', balance: 400000, cashHolding: true, priority: 1 }),
      account({ id: 'ira', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000, priority: 2 }),
      account({ id: 'roth', name: 'Roth', type: 'rothIRA', taxClass: 'roth', balance: 0, priority: 3 }),
    ],
  });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, pension: 0, ssBenefit: 0 });
  Object.assign(p.advanced, { rmdOn: true, conversionOn: true, conversionAmount: 100000 });

  /* Independent oracle: the Uniform Lifetime divisor at 75 is 24.6, so the
     year owes 100,000 / 24.6. Computed here, not read from the result. */
  const required = 100000 / 24.6;
  assert.ok(Math.abs(required - 4065.040650406504) < 1e-9,
    'oracle self-check: the required distribution must be 4,065.040650406504');

  const r = engine.runPlan(clone(p));
  const row = r.rows[1];

  /* CONTROL: leaving the required dollars unconverted is the shape a repair
     should produce, and it runs cleanly today -- so the defect is the missing
     reservation, not an inability to model the year. */
  const reserving = clone(p);
  reserving.advanced.conversionAmount = 100000 - required;
  const control = engine.runPlan(reserving).rows[1];
  assert.ok(Math.abs(control.roth - 95934.9593495935) < 0.01,
    'CONTROL: reserving the RMD leaves 95,934.96 converted; got ' + control.roth.toFixed(2));

  assert.equal(r.status, 'ok', 'precondition: the package accepts this plan today');
  assert.ok(Math.abs(row.rmd - required) < 1e-9,
    'precondition: the row REPORTS the required distribution; got ' + row.rmd);

  assert.ok(row.roth <= 100000 - required + 0.01,
    'the conversion moved the entire 100,000 pretax balance into Roth (roth closed at ' +
    row.roth.toFixed(2) + ', preTax at ' + row.preTax.toFixed(2) + ') while the row still ' +
    'reports ' + row.rmd.toFixed(2) + ' of required distribution. With no pretax balance left, ' +
    'the withdrawal that is supposed to discharge that obligation moves 0.00. Publication 590-A ' +
    'excludes required-distribution amounts from a conversion. Aggregate wealth ties, which is ' +
    'exactly why a portfolio-level check cannot see a tax-class allocation error.');
});

/* The QCD consequence is recorded as part of RC-01 rather than as its own
   finding, matching the addendum's combined register. */
test('RC-01 (QCD): an unfunded charitable distribution must not reduce taxable income', () => {
  const build = (qcd, mutate) => {
    const p = basePlan({
      id: 'rc01qcd',
      profile: retiredProfile({ age: 75, retireAge: 65, endAge: 76 }),
      employment: noWages(),
      accounts: [
        account({ id: 'cash', balance: 400000, cashHolding: true, priority: 1 }),
        account({ id: 'ira', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000, priority: 2 }),
        account({ id: 'roth', name: 'Roth', type: 'rothIRA', taxClass: 'roth', balance: 0, priority: 3 }),
      ],
    });
    Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, pension: 0, ssBenefit: 0 });
    Object.assign(p.advanced, { rmdOn: true, conversionOn: true, conversionAmount: 100000 });
    if (qcd !== undefined) p.advanced.qcd = qcd;
    if (mutate) mutate(p);
    return p;
  };

  const required = 100000 / 24.6;
  const without = engine.runPlan(build(undefined)).rows[1];
  /* R6 (S5 task 8, the Arizona age-65 exemption, TAX section 5.3, ENACTED): 14,277.50 became 14,225.00 -- one $2,100 exemption takes $52.50 off the Arizona tax.
     The mechanism this pins is unchanged, and 14,277.50 returns exactly with the exemption set to $0. */
  /* S5AA task 3.1 (Q88): 14,225.00 before the IRC 63(f) additional deduction for the aged, which takes a
     further $451 -- $2,050 at the 22% bracket. */
  assert.ok(Math.abs(without.taxes - 13774.00) < 0.01,
    'precondition: the reserving case taxes 13,774.00 (14,225.00 before the 63(f) additional deduction); got ' + without.taxes.toFixed(2));

  /* THE REQUEST IS NOT A PAYMENT. With RMD off there is no obligation, so the
     conversion legitimately takes the whole balance and nothing is distributed
     -- and a $1,000 request must then buy no exclusion at all. This is the
     original defect's shape, reached the only way that remains once the
     reservation closes the conversion and transfer doors. */
  const noDistribution = engine.runPlan(build(1000, (p) => { p.advanced.rmdOn = false; })).rows[1];
  const noDistributionControl = engine.runPlan(build(undefined, (p) => { p.advanced.rmdOn = false; })).rows[1];
  assert.equal(noDistribution.preTax, 0, 'precondition: nothing remains to distribute');
  assert.ok(Math.abs(noDistribution.taxes - noDistributionControl.taxes) < 0.01,
    'a charitable distribution that was only REQUESTED still cut taxes, from ' +
    noDistributionControl.taxes.toFixed(2) + ' to ' + noDistribution.taxes.toFixed(2) +
    '. The exclusion must come from cash that actually moved.');

  /* ABOVE THE FUNDED AMOUNT the exclusion is capped by what was distributed,
     not by what was asked for. Requesting 50,000 against a 4,065.04
     distribution must exclude 4,065.04. */
  const over = engine.runPlan(build(50000)).rows[1];
  assert.ok(Math.abs(over.magi - (100000 - required)) < 0.01,
    'a 50,000 request excluded down to MAGI ' + over.magi.toFixed(2) + '; the funded ' +
    'distribution is only ' + required.toFixed(2) + ', so MAGI must not fall below ' +
    (100000 - required).toFixed(2));

  /* CONTROL, so none of the above can pass by the exclusion simply never
     working: a QCD inside the funded distribution DOES reduce taxable income. */
  const funded = engine.runPlan(build(1000)).rows[1];
  assert.ok(Math.abs(funded.magi - 99000) < 0.01,
    'CONTROL: a funded 1,000 QCD must exclude exactly 1,000; got MAGI ' + funded.magi.toFixed(2));
  /* R6 (S5 task 8, the Arizona age-65 exemption, TAX section 5.3, ENACTED): 14,019.30 became 13,966.80 -- one $2,100 exemption takes $52.50 off the Arizona tax.
     The mechanism this pins is unchanged, and 14,019.30 returns exactly with the exemption set to $0. */
  /* S5AA task 3.1 (Q88): 13,966.80 before the IRC 63(f) additional deduction for the aged, which takes a
     further $451 -- $2,050 at the 22% bracket, the same step as the reserving case above. */
  assert.ok(Math.abs(funded.taxes - 13515.80) < 0.01,
    'CONTROL: and it must reduce tax to 13,966.80 (14,019.30 before the age-65 exemption); got ' + funded.taxes.toFixed(2));
});

// ===========================================================================
// RC-02 · P1 — the survivor spending reduction compounds every year
// ===========================================================================

/* REPRODUCED TO THE CENT: 0 / 40,000 / 30,000 / 22,500 / 16,875 / 12,656.25,
   ending portfolio 877,968.75 against the intended 840,000. */
test('RC-02: the survivor reduction must apply once, not compound each year', () => {
  const p = basePlan({
    id: 'rc02',
    profile: Object.assign(clone(defaultPlan.profile), {
      filing: 'mfj', spouseOn: true, age: 65, spouseAge: 65, retireAge: 65, endAge: 70,
    }),
    employment: noWages(),
    accounts: [account({ id: 'roth1', name: 'Roth', type: 'rothIRA', taxClass: 'roth', balance: 1000000 })],
  });
  Object.assign(p.retirement, {
    /* S5AA R9 round, decision 7: selfLife was 66. The first death now reduces spending from the row AFTER the one opening
       at the lifespan (the year of death is spent for two), so the lifespan moves one year earlier to keep the first
       reduced row, and every expectation below, where it was. The claim -- once, not compounding -- is unchanged. */
    strategy: 'fixedReal', withdrawalRate: 4, survivor: true, selfLife: 65, spouseLife: 95,
    survivorSpendingReduction: 25, pension: 0, ssBenefit: 0, spouseSS: 0,
  });

  assert.equal(validateScenario(clone(p)).issues.length, 0,
    'precondition: this plan is entirely ordinary -- validation raises nothing at all');

  const r = engine.runPlan(clone(p));
  assert.equal(r.status, 'ok');

  /* All-Roth, zero return, zero inflation: 4% of 1,000,000 is 40,000, and a
     single 25% household-size reduction after the first death gives 30,000
     for every later year. Five drawn years at those figures leave
     1,000,000 - 40,000 - 4x30,000 = 840,000. Computed here, independently. */
  const expected = [0, 40000, 30000, 30000, 30000, 30000];
  const expectedEnding = 1000000 - expected.reduce((a, b) => a + b, 0);
  assert.equal(expectedEnding, 840000, 'oracle self-check: the intended ending portfolio is 840,000');

  assert.deepEqual(r.rows.map((x) => x.spending), expected,
    'spending fell 25% EVERY year instead of once: ' + JSON.stringify(r.rows.map((x) => x.spending)) +
    '. At zero inflation fixedReal starts from last year\'s priorSpend (engine.js:1411), the ' +
    'survivor multiplier is applied to that already-reduced base (strategySpending(), :991-992), ' +
    'and the product becomes next year\'s base. The existing direct survivor tests use ' +
    'fixedNominal, which reconstructs its base each call and therefore cannot expose this. Do ' +
    'not repair by dropping the factor after its first application -- strategies that rebuild ' +
    'their base each year still need it applied to that base.');
  assert.ok(Math.abs(r.rows[r.rows.length - 1].total - 840000) < 0.01,
    'and the ending portfolio must be 840,000; got ' + r.rows[r.rows.length - 1].total.toFixed(2));
});

// ===========================================================================
// RC-03 · P1 — a lump-sum investment does not carry its own basis
// ===========================================================================

/* PURE ORACLE, no projection. Reproduced to the cent: the transformation
   leaves 60,000 of modelled basis where 90,000 is owed. */
test('RC-03: a $50k cash investment must add $50k of basis', { todo: 'EXCLUDED under decision register P19 -- mortgage-vs-investing.js / debt-strategy-adapter.js are unsupported and no longer bundled (tests/module-exclusion-registry.test.js enforces it). This witness is now the REVIVAL CONTRACT: it must go green before the module may ship again. Do not remove this marker to make the suite tidy.' }, () => {
  const p = basePlan({
    id: 'rc03',
    profile: retiredProfile({ age: 65, retireAge: 65, endAge: 66 }),
    employment: noWages(),
    accounts: [account({ id: 'tax1', balance: 100000, basisPct: 40 })],
  });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 50000, pension: 0, ssBenefit: 0 });

  const before = p.accounts[0];
  assert.equal(before.balance * before.basisPct / 100, 40000,
    'oracle self-check: 40% of 100,000 is 40,000 of modelled basis');

  const applied = mvi.applyMethod(clone(p), 'investLumpSum', 50000);
  assert.equal(applied.applicable, true,
    'if this method starts REFUSING rather than depositing, that is an acceptable repair -- ' +
    'update this assertion in the same commit and keep the basis check below for the ' +
    'supported path');

  const after = applied.plan.accounts[0];
  assert.equal(after.balance, 150000, 'precondition: the balance does rise by the full 50,000');

  /* After-tax cash carries its own cost basis, so the pooled figure must be
     40,000 + 50,000 = 90,000, i.e. 60% of the new balance. */
  assert.ok(Math.abs(after.balance * after.basisPct / 100 - 90000) < 0.01,
    'the deposit raised the balance to 150,000 but left basisPct at ' + after.basisPct +
    ', implying only ' + (after.balance * after.basisPct / 100).toFixed(2) + ' of basis where ' +
    '90,000 is owed. The engine\'s own retained-cash path already does this correctly ' +
    '(retainExcessRmdCash(), engine.js:810-814) -- applyMethod() changes the balance without ' +
    'the matching basis update. The spurious 30,000 of phantom gain costs 254.31 of tax in the ' +
    'addendum\'s one-year case. Use a shared funded-deposit operation rather than a second ' +
    'implementation, and preserve the exact zero-amount no-op.');
});

// ===========================================================================
// RC-04 · P1 — an iteration cap is reported as a debt-free date
// ===========================================================================

/* PURE ORACLE, no projection. Reproduced exactly: 1,200 months, 120,000 of
   interest, zero claimed savings between two outcomes that never pay off. */
test('RC-04: a debt that never amortizes must have no finite debt-free month', { todo: 'EXCLUDED under decision register P19 -- mortgage-vs-investing.js / debt-strategy-adapter.js are unsupported and no longer bundled (tests/module-exclusion-registry.test.js enforces it). This witness is now the REVIVAL CONTRACT: it must go green before the module may ship again. Do not remove this marker to make the suite tidy.' }, () => {
  /* Independent oracle: 10,000 at 12% accrues exactly 100/month, the payment
     is exactly 100, so principal never moves. Verified here by recurrence
     rather than asserted. */
  let balance = 10000;
  for (let m = 0; m < 600; m++) balance = balance + balance * 0.12 / 12 - 100;
  assert.equal(balance, 10000, 'oracle self-check: the balance must be unchanged after 600 months');

  const r = adapter.compareDebtStrategies([{
    id: 'unpaid', balance: 10000, rate: 12, paymentMonthly: 100,
    extraPrincipalMonthly: 0, rateType: 'fixed',
  }], 65);

  assert.ok(!Number.isFinite(r.current.monthsUntilDebtFree),
    'the adapter reported monthsUntilDebtFree = ' + r.current.monthsUntilDebtFree + ' for a debt ' +
    'whose principal never falls. That figure is simulateDebtPayoff()\'s 1,200-month safety cap, ' +
    'and the raw helper does return the residual balance so the cap IS detectable -- the adapter ' +
    'discards it and relabels the elapsed count as time until debt-free. The cap itself is ' +
    'correct protection; the meaning attached to its result is not. Keep months simulated ' +
    'separate from payoff month and return a null payoff with the residual principal.');

  /* Deliberately not prescriptive about WHICH non-value a repair returns --
     null, undefined and NaN are all acceptable. What must not survive is a
     finite number, which reads as a real saving. */
  assert.ok(!Number.isFinite(r.avalancheMonthsSaved),
    'and no savings may be quoted between two outcomes that both hit the cap; got ' +
    r.avalancheMonthsSaved + ' months saved. Agreement between two equally capped calculations ' +
    'is not payoff evidence.');
});

// ===========================================================================
// RC-05 · P2 — distinct captured values collapse to one snapshot
// ===========================================================================

/* Reproduced exactly, including the addendum's published hash
   be3af032c78b126cce1c1ba3e291b8e1d6ab8b3e0ea5613f43e805bf3fde7b4d.
   These are SERIALIZATION collisions, not SHA-256 collisions: JSON drops an
   undefined-valued field, and the numeric tags can also arrive as literal
   data objects. */
function distinctOrRejected(a, b, note) {
  let first;
  let second;
  try {
    first = baseline.captureEntry('x', a);
    second = baseline.captureEntry('x', b);
  } catch (error) {
    assert.ok(error instanceof Error, 'an explicit rejection is an acceptable repair');
    return;
  }
  assert.notEqual(first.hash, second.hash, note);
}

test('RC-05a: an undefined-valued field must differ from an absent one, or be rejected', () => {
  /* CONTROL: the original RA-04 four-value distinction still holds, so this
     is a gap in that guarantee's COVERAGE, not a regression of it. */
  const ra04 = [null, NaN, Infinity, -Infinity]
    .map((value) => baseline.captureEntry('x', { rows: [{ value }] }).hash);
  assert.equal(new Set(ra04).size, 4,
    'CONTROL: RA-04\'s null/NaN/Infinity/-Infinity distinction must remain intact');

  distinctOrRejected({ rows: [{ value: undefined }] }, { rows: [{}] },
    'a row carrying an undefined-valued field captured identically to a row without the field ' +
    'at all (both hash to be3af032c78b126cce1c1ba3e291b8e1d6ab8b3e0ea5613f43e805bf3fde7b4d). ' +
    'JSON.stringify drops the key, so property PRESENCE is erased before the hash is taken, ' +
    'and integrity verification and snapshot diffing both report clean. Validate the raw result ' +
    'domain before JSON erases the distinction.');
});

test('RC-05b: a tag-shaped literal object must differ from the value it encodes, or be rejected', () => {
  distinctOrRejected({ rows: [{ value: NaN }] }, { rows: [{ value: { __nonFinite: 'NaN' } }] },
    'a literal { __nonFinite: "NaN" } object supplied as data captured identically to an actual ' +
    'NaN. The encoding\'s reserved tags are not escaped, so a number-to-object regression is ' +
    'invisible after capture. The same holds for { __negativeZero: true } against -0. Adding ' +
    'another unescaped tag only relocates the ambiguity.');
});
