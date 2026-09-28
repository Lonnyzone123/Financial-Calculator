'use strict';

// Track B, L1 -- tests for src/scenario-validator.js, the new structural
// Scenario validator. Not wired into any live path (see the module's own
// header); these tests exercise it standalone.

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateScenario } = require('../src/scenario-validator.js');

function validPlan(overrides = {}) {
  return Object.assign({
    id: 'plan-1',
    scenarioSchemaVersion: 1,
    profile: { filing: 'mfj', age: 40, retireAge: 65, endAge: 95, spouseOn: false },
    employment: { salary: 100000, spouseSalary: 0 },
    /* S5AA R21 (R20-01): an allocation key must name one of advanced.assetClasses. This plan defines none (and many
       tests below replace `advanced` with one that defines none), so its account holds no allocation; it held
       { stocks: 100 }, which is now an UNKNOWN_ALLOCATION_CLASS error. Allocations against a class list are tested in
       tests/audit-s5aa-r21-unknown-allocation-key.test.js. */
    accounts: [
      { id: 'acct-1', taxClass: 'taxable', balance: 50000, priority: 1, basisPct: 70, allocation: {} },
    ],
    assumptions: { method: 'simple', returnRate: 8, volatility: 15, fee: 0, runs: 1000, seed: 42 },
    retirement: { spending: 60000, withdrawalOrder: 'manual', stages: [], expenses: [], otherIncomes: [] },
    advanced: { assetsOn: false, correlation: 0.25, assetClasses: [], debts: [], otherAssets: [] },
  }, overrides);
}

function codesFor(result) {
  return result.issues.map((i) => i.code);
}

test('validateScenario: a well-formed plan is valid with zero issues', () => {
  const result = validateScenario(validPlan());
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});

test('validateScenario: a non-object root is an ERROR and short-circuits cleanly', () => {
  const result = validateScenario(null);
  assert.equal(result.valid, false);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].code, 'WRONG_TYPE');
});

test('validateScenario: each missing top-level section is reported as its own MISSING_SECTION error', () => {
  const plan = validPlan();
  delete plan.profile;
  delete plan.assumptions;
  const result = validateScenario(plan);
  assert.equal(result.valid, false);
  const missing = result.issues.filter((i) => i.code === 'MISSING_SECTION').map((i) => i.path);
  assert.deepEqual(missing.sort(), ['assumptions', 'profile']);
});

test('validateScenario: a section of the wrong type is WRONG_TYPE, not treated as missing', () => {
  const plan = validPlan({ profile: 'not an object' });
  const result = validateScenario(plan);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === 'WRONG_TYPE' && i.path === 'profile'));
  assert.ok(!result.issues.some((i) => i.path === 'profile' && i.code === 'MISSING_SECTION'));
});

test('validateScenario: accounts must be an array; a non-array is an ERROR and per-account checks are skipped', () => {
  const plan = validPlan({ accounts: { not: 'an array' } });
  const result = validateScenario(plan);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === 'WRONG_TYPE' && i.path === 'accounts'));
});

test('validateScenario: a missing accounts section is its own MISSING_SECTION error', () => {
  const plan = validPlan();
  delete plan.accounts;
  const result = validateScenario(plan);
  assert.ok(result.issues.some((i) => i.code === 'MISSING_SECTION' && i.path === 'accounts'));
});

// ---------------------------------------------------------------------------
// profile
// ---------------------------------------------------------------------------

test('validateScenario: an unrecognized filing status is a WARNING, not an ERROR (still valid)', () => {
  const result = validateScenario(validPlan({ profile: { filing: 'bogus', age: 40, retireAge: 65, endAge: 95 } }));
  assert.equal(result.valid, true);
  assert.ok(result.issues.some((i) => i.code === 'INVALID_ENUM' && i.severity === 'WARNING' && i.path === 'profile.filing'));
});

test('validateScenario: a non-numeric age is an ERROR', () => {
  const result = validateScenario(validPlan({ profile: { filing: 'mfj', age: '40', retireAge: 65, endAge: 95 } }));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === 'WRONG_TYPE' && i.path === 'profile.age'));
});

test('validateScenario: retireAge before the current age is flagged, but only as a WARNING', () => {
  const result = validateScenario(validPlan({ profile: { filing: 'mfj', age: 70, retireAge: 60, endAge: 95 } }));
  assert.equal(result.valid, true);
  assert.ok(result.issues.some((i) => i.code === 'INCONSISTENT_AGES' && i.path === 'profile.retireAge'));
});

test('validateScenario: endAge before retireAge is flagged as a WARNING', () => {
  const result = validateScenario(validPlan({ profile: { filing: 'mfj', age: 40, retireAge: 65, endAge: 60 } }));
  assert.ok(result.issues.some((i) => i.code === 'INCONSISTENT_AGES' && i.path === 'profile.endAge'));
});

test('validateScenario: an age outside [0,120] is a WARNING, not an ERROR', () => {
  const result = validateScenario(validPlan({ profile: { filing: 'mfj', age: -5, retireAge: 65, endAge: 95 } }));
  assert.equal(result.valid, true);
  assert.ok(result.issues.some((i) => i.code === 'OUT_OF_RANGE' && i.path === 'profile.age'));
});

// ---------------------------------------------------------------------------
// accounts
// ---------------------------------------------------------------------------

test('validateScenario: a non-object entry inside accounts is reported by index without crashing', () => {
  const result = validateScenario(validPlan({ accounts: [null, 'oops', validPlan().accounts[0]] }));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.path === 'accounts[0]' && i.code === 'WRONG_TYPE'));
  assert.ok(result.issues.some((i) => i.path === 'accounts[1]' && i.code === 'WRONG_TYPE'));
  assert.ok(!result.issues.some((i) => i.path.startsWith('accounts[2]')));
});

test('validateScenario: an invalid taxClass is a WARNING (enum); a wrong-typed id/balance is an ERROR. A missing id/priority/balance is not flagged at all -- normalizeAccount() backfills those, same lenient posture as the rest of this validator', () => {
  const result = validateScenario(validPlan({ accounts: [{ id: 42, taxClass: 'bogus', balance: 'lots', priority: 1 }] }));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === 'INVALID_ENUM' && i.path === 'accounts[0].taxClass' && i.severity === 'WARNING'));
  assert.ok(result.issues.some((i) => i.code === 'WRONG_TYPE' && i.path === 'accounts[0].id'));
  assert.ok(result.issues.some((i) => i.code === 'WRONG_TYPE' && i.path === 'accounts[0].balance'));

  const missingFields = validateScenario(validPlan({ accounts: [{ taxClass: 'taxable' }] }));
  assert.ok(!missingFields.issues.some((i) => i.path === 'accounts[0].id' || i.path === 'accounts[0].priority' || i.path === 'accounts[0].balance'),
    'a missing (not wrong-typed) id/priority/balance is left to normalizeAccount() rather than flagged here');
});

test('validateScenario: a negative account balance is a WARNING, not an ERROR', () => {
  const result = validateScenario(validPlan({ accounts: [{ id: 'a', taxClass: 'taxable', balance: -100, priority: 1, basisPct: 70 }] }));
  assert.equal(result.valid, true);
  assert.ok(result.issues.some((i) => i.code === 'NEGATIVE_BALANCE'));
});

test('validateScenario: a basisPct outside [0,100] is a WARNING -- mirrors the UI\'s own clamp (C1\'s finding) being violated by, e.g., a hand-edited import', () => {
  const result = validateScenario(validPlan({ accounts: [{ id: 'a', taxClass: 'taxable', balance: 100, priority: 1, basisPct: 150 }] }));
  assert.ok(result.issues.some((i) => i.code === 'OUT_OF_RANGE' && i.path === 'accounts[0].basisPct'));
});

test('validateScenario: a non-numeric allocation weight is an ERROR, reported per offending key', () => {
  /* S5AA R21: both keys name classes the plan defines, so the only thing wrong is the one weight's type. */
  const classes = [{ id: 'stocks', returnRate: 10, volatility: 18.5 }, { id: 'bonds', returnRate: 4.5, volatility: 7 }];
  const result = validateScenario(validPlan({
    accounts: [{ id: 'a', taxClass: 'taxable', balance: 100, priority: 1, allocation: { stocks: '70', bonds: 30 } }],
    advanced: { assetsOn: false, correlation: 0.25, assetClasses: classes, debts: [], otherAssets: [] },
  }));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === 'WRONG_TYPE' && i.path === 'accounts[0].allocation.stocks'));
  assert.ok(!result.issues.some((i) => i.path === 'accounts[0].allocation.bonds'));
});

test('validateScenario: an allocation that is not an object at all is an ERROR, and per-key checks are skipped', () => {
  const result = validateScenario(validPlan({ accounts: [{ id: 'a', taxClass: 'taxable', balance: 100, priority: 1, allocation: 'oops' }] }));
  assert.ok(result.issues.some((i) => i.code === 'WRONG_TYPE' && i.path === 'accounts[0].allocation'));
});

// ---------------------------------------------------------------------------
// assumptions
// ---------------------------------------------------------------------------

test('validateScenario: an unrecognized method is a WARNING', () => {
  const result = validateScenario(validPlan({ assumptions: { method: 'quantum', returnRate: 8, volatility: 15 } }));
  assert.ok(result.issues.some((i) => i.code === 'INVALID_ENUM' && i.path === 'assumptions.method'));
});

test('validateScenario: a negative volatility is a WARNING', () => {
  const result = validateScenario(validPlan({ assumptions: { method: 'simple', returnRate: 8, volatility: -15 } }));
  assert.ok(result.issues.some((i) => i.code === 'NEGATIVE_VOLATILITY'));
});

test('validateScenario: runs must be an integer >= 1; zero, negative, and fractional are all ERRORs', () => {
  [0, -5, 2.5].forEach((runs) => {
    const result = validateScenario(validPlan({ assumptions: { method: 'simple', returnRate: 8, volatility: 15, runs } }));
    assert.equal(result.valid, false, `runs=${runs} should be invalid`);
    assert.ok(result.issues.some((i) => i.path === 'assumptions.runs'));
  });
});

// ---------------------------------------------------------------------------
// retirement
// ---------------------------------------------------------------------------

test('validateScenario: negative spending is a WARNING', () => {
  const result = validateScenario(validPlan({ retirement: { spending: -1, withdrawalOrder: 'manual' } }));
  assert.ok(result.issues.some((i) => i.code === 'NEGATIVE_SPENDING'));
});

test('validateScenario: retirement.stages/expenses/otherIncomes must be arrays when present', () => {
  const result = validateScenario(validPlan({ retirement: { spending: 1000, withdrawalOrder: 'manual', stages: {} } }));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.path === 'retirement.stages' && i.code === 'WRONG_TYPE'));
});

test('validateScenario: an ssClaim outside the [62,70] claiming window is an ERROR, so the plan is not valid', () => {
  const result = validateScenario(validPlan({ retirement: { spending: 1000, withdrawalOrder: 'manual', ssClaim: 80 } }));
  assert.ok(result.issues.some((i) => i.code === 'SS_CLAIM_OUT_OF_RANGE' && i.severity === 'ERROR'));
  assert.equal(result.valid, false);
});

// ---------------------------------------------------------------------------
// advanced
// ---------------------------------------------------------------------------

test('validateScenario: correlation outside [-1,1] is a WARNING', () => {
  const result = validateScenario(validPlan({ advanced: { assetsOn: false, correlation: 1.5, assetClasses: [] } }));
  assert.ok(result.issues.some((i) => i.code === 'OUT_OF_RANGE' && i.path === 'advanced.correlation'));
});

test('validateScenario: a malformed asset class entry is reported per-field without crashing', () => {
  const result = validateScenario(validPlan({ advanced: { assetsOn: true, correlation: 0.25, assetClasses: [{ id: 'stocks', returnRate: 'ten', volatility: 18 }] } }));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.path === 'advanced.assetClasses[0].returnRate'));
});

test('validateScenario: debts/otherAssets must be arrays when present', () => {
  const result = validateScenario(validPlan({ advanced: { assetsOn: false, correlation: 0.25, assetClasses: [], debts: 'oops' } }));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.path === 'advanced.debts' && i.code === 'WRONG_TYPE'));
});

test('validateScenario: a well-formed debt entry produces no issues', () => {
  const result = validateScenario(validPlan({ advanced: {
    assetsOn: false, correlation: 0.25, assetClasses: [],
    debts: [{ balance: 250000, rate: 6, rateType: 'fixed', paymentMonthly: 1500, payoffAge: 65 }],
  } }));
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});

test('validateScenario: a debt with wrong-typed balance/rate is an ERROR; a negative balance/rate/paymentMonthly is a WARNING', () => {
  const wrongType = validateScenario(validPlan({ advanced: { assetsOn: false, correlation: 0.25, assetClasses: [], debts: [{ balance: 'lots', rate: 'high' }] } }));
  assert.equal(wrongType.valid, false);
  assert.ok(wrongType.issues.some((i) => i.path === 'advanced.debts[0].balance' && i.code === 'WRONG_TYPE'));
  assert.ok(wrongType.issues.some((i) => i.path === 'advanced.debts[0].rate' && i.code === 'WRONG_TYPE'));

  const negative = validateScenario(validPlan({ advanced: { assetsOn: false, correlation: 0.25, assetClasses: [], debts: [{ balance: -1000, rate: -2, paymentMonthly: -50 }] } }));
  assert.equal(negative.valid, true, 'negative values here are warnings, not errors');
  assert.ok(negative.issues.some((i) => i.code === 'NEGATIVE_BALANCE' && i.path === 'advanced.debts[0].balance'));
  assert.ok(negative.issues.some((i) => i.code === 'NEGATIVE_RATE' && i.path === 'advanced.debts[0].rate'));
  assert.ok(negative.issues.some((i) => i.code === 'NEGATIVE_PAYMENT' && i.path === 'advanced.debts[0].paymentMonthly'));
});

test('validateScenario: a debt\'s rateType outside {"fixed","adjustable"} is a WARNING', () => {
  const result = validateScenario(validPlan({ advanced: { assetsOn: false, correlation: 0.25, assetClasses: [], debts: [{ balance: 1000, rate: 5, rateType: 'variable-ish' }] } }));
  assert.ok(result.issues.some((i) => i.code === 'INVALID_ENUM' && i.path === 'advanced.debts[0].rateType'));
});

test('validateScenario: a non-object entry inside debts is reported by index without crashing', () => {
  const result = validateScenario(validPlan({ advanced: { assetsOn: false, correlation: 0.25, assetClasses: [], debts: [null, { balance: 100, rate: 5 }] } }));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.path === 'advanced.debts[0]' && i.code === 'WRONG_TYPE'));
  assert.ok(!result.issues.some((i) => i.path.startsWith('advanced.debts[1]')));
});

test('validateScenario: a well-formed otherAsset entry produces no issues', () => {
  const result = validateScenario(validPlan({ advanced: {
    assetsOn: false, correlation: 0.25, assetClasses: [],
    otherAssets: [{ value: 50000, liquidity: 'limited', accessPct: 80, availableAge: 60 }],
  } }));
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});

test('validateScenario: an otherAsset\'s accessPct outside [0,100] is a WARNING, and an invalid liquidity tier is a WARNING', () => {
  const result = validateScenario(validPlan({ advanced: {
    assetsOn: false, correlation: 0.25, assetClasses: [],
    otherAssets: [{ value: 10000, liquidity: 'somewhat-liquid', accessPct: 150 }],
  } }));
  assert.equal(result.valid, true);
  assert.ok(result.issues.some((i) => i.code === 'OUT_OF_RANGE' && i.path === 'advanced.otherAssets[0].accessPct'));
  assert.ok(result.issues.some((i) => i.code === 'INVALID_ENUM' && i.path === 'advanced.otherAssets[0].liquidity'));
});

test('validateScenario: a negative otherAsset value is a WARNING', () => {
  const result = validateScenario(validPlan({ advanced: { assetsOn: false, correlation: 0.25, assetClasses: [], otherAssets: [{ value: -500 }] } }));
  assert.ok(result.issues.some((i) => i.code === 'NEGATIVE_VALUE' && i.path === 'advanced.otherAssets[0].value'));
});

// ---------------------------------------------------------------------------
// Never throws, never mutates
// ---------------------------------------------------------------------------

test('validateScenario: never throws, even on a maximally malformed plan', () => {
  const chaos = { profile: 5, employment: [], accounts: 'nope', assumptions: null, retirement: true, advanced: 0 };
  assert.doesNotThrow(() => validateScenario(chaos));
});

test('validateScenario: never mutates the plan it is given', () => {
  const plan = validPlan();
  const before = JSON.stringify(plan);
  validateScenario(plan);
  assert.equal(JSON.stringify(plan), before);
});

// ---------------------------------------------------------------------------
// S3 task 5 groundwork (2026-09-11): account ids must be distinguishable.
//
// Nothing enforced this. It is latent today because the engine's `rates` array
// is POSITIONAL -- two accounts sharing an id compute correctly. It stops
// being latent the moment anything is keyed by id: a duplicate collapses two
// accounts into one entry and the period return signal is averaged over one
// rate instead of two.
//
// ESCALATED TO ERROR by re-audit 2 finding RB-01. The paragraph that used to
// sit here argued for WARNING "until something keys by id" -- three things
// already did, two of them before that argument was written: contribution
// routing, moveFunds(), and quoteTaxFunding()'s remaining["a:"+id] capacity
// map. The last of those reports a $25,910.90 funding shortfall while leaving
// $198,000 of taxable assets unspent, on a plan with no contributions and no
// transfers at all. Q23 closed; decision register P11 records the accepted
// consequence that duplicate-id plans no longer import.
// ---------------------------------------------------------------------------

test('account ids: a duplicate is an import-blocking ERROR', () => {
  const plan = validPlan();
  plan.accounts = [
    Object.assign({}, plan.accounts[0], { id: 'dup', priority: 1 }),
    Object.assign({}, plan.accounts[0], { id: 'dup', priority: 2 }),
  ];
  const result = validateScenario(plan);
  const issues = result.issues.filter((i) => i.code === 'DUPLICATE_ACCOUNT_ID');
  assert.equal(issues.length, 1, 'exactly one report, naming the second occurrence');
  assert.equal(issues[0].severity, 'ERROR',
    'contribution routing, transfers and the tax-funding solver all resolve by id and take the ' +
    'first match, so an ambiguous id is a financial defect rather than a cosmetic one');
  assert.equal(issues[0].path, 'accounts[1].id', 'the report points at the duplicate, not the original');
  assert.equal(result.valid, false, 'and the scenario as a whole must not validate');
});

test('account ids: distinct ids produce no report at all', () => {
  const plan = validPlan();
  plan.accounts = [
    Object.assign({}, plan.accounts[0], { id: 'a1', priority: 1 }),
    Object.assign({}, plan.accounts[0], { id: 'a2', priority: 2 }),
  ];
  const issues = validateScenario(plan).issues
    .filter((i) => i.code === 'DUPLICATE_ACCOUNT_ID' || i.code === 'RESERVED_ACCOUNT_ID');
  assert.deepEqual(issues, [], 'no false positive on an ordinary plan');
});

test('account ids: the literals the engine synthesizes for itself are reserved', () => {
  ['rmd-retained-cash', 'household-cash'].forEach((id) => {
    const plan = validPlan();
    plan.accounts = [Object.assign({}, plan.accounts[0], { id })];
    const issues = validateScenario(plan).issues.filter((i) => i.code === 'RESERVED_ACCOUNT_ID');
    assert.equal(issues.length, 1, id + ' should be reported as reserved');
    /* Still a WARNING, and now genuinely informational: RB-01's repair gives
       synthesized accounts a derived, collision-free id (uniqueSynthesizedId()),
       so a user account wearing the literal no longer collides with anything.
       The report survives because the two will still read alike in the UI. */
    assert.equal(issues[0].severity, 'WARNING');
    assert.match(issues[0].message, /creates itself/);
  });
});

test('account ids: three copies of one id report twice, not once and not three times', () => {
  const plan = validPlan();
  plan.accounts = [1, 2, 3].map((n) => Object.assign({}, plan.accounts[0], { id: 'same', priority: n }));
  const issues = validateScenario(plan).issues.filter((i) => i.code === 'DUPLICATE_ACCOUNT_ID');
  assert.deepEqual(issues.map((i) => i.path), ['accounts[1].id', 'accounts[2].id'],
    'the first occurrence is the original; every later one is a duplicate');
});

test('account ids: a malformed or missing id is left to the field-level rules', () => {
  const plan = validPlan();
  plan.accounts = [
    Object.assign({}, plan.accounts[0], { id: '' }),
    Object.assign({}, plan.accounts[0], { id: '' }),
  ];
  const issues = validateScenario(plan).issues.filter((i) => i.code === 'DUPLICATE_ACCOUNT_ID');
  assert.deepEqual(issues, [],
    'two empty ids are a MISSING-id problem, already reported per account; reporting them as ' +
    'duplicates as well would be the same defect counted twice under a misleading name');
});

// ---------------------------------------------------------------------------
// Q43 -- a debt payment explicitly set to zero was accepted in silence
// ---------------------------------------------------------------------------

test('Q43: a zero payment on an interest-bearing debt is warned about', () => {
  /* The UI's out-of-the-box default. Measured: $20,000 at 20% with
     paymentMonthly 0 reaches $866,458 by age 74, and with a payoffAge the
     whole grown balance is then forced out in one period. Before this, the
     validator warned only on a NEGATIVE payment, so zero -- the common case --
     passed clean. */
  const result = validateScenario(validPlan({ advanced: {
    assetsOn: false, correlation: 0.25, assetClasses: [],
    debts: [{ balance: 20000, rate: 20, paymentMonthly: 0, payoffAge: 75 }],
  } }));
  const hit = result.issues.filter((i) => i.code === 'PAYMENT_BELOW_INTEREST');
  assert.equal(hit.length, 1, 'a zero payment against 20% interest must be reported');
  assert.equal(hit[0].severity, 'WARNING');
  assert.equal(hit[0].path, 'advanced.debts[0].paymentMonthly');
  assert.match(hit[0].message, /payoffAge 75/,
    'the message must name the consequence, not only the condition');

  /* It WARNS and does not refuse. The round-6 auditor's constraint is that an
     uncapped scheduled balloon is not by itself proof the calculation should
     be capped, and that the accepted debt contract must be defined before any
     refusal behaviour is. A plan carrying this stays valid. */
  assert.equal(result.valid, true, 'this is a warning, not a refusal');
});

test('Q43 controls: the warning is scoped, and each arm can actually differ', () => {
  const check = (debt) => validateScenario(validPlan({ advanced: {
    assetsOn: false, correlation: 0.25, assetClasses: [], debts: [debt],
  } })).issues.some((i) => i.code === 'PAYMENT_BELOW_INTEREST');

  /* Positive control first: without it the negatives below pass against a
     build where this check does not exist at all. */
  assert.equal(check({ balance: 20000, rate: 20, paymentMonthly: 0 }), true,
    'precondition: the check fires at all, or nothing below means anything');

  /* A payment that covers interest. */
  assert.equal(check({ balance: 20000, rate: 20, paymentMonthly: 400 }), false);
  /* No interest accrues, so a zero payment is not a runaway. */
  assert.equal(check({ balance: 20000, rate: 0, paymentMonthly: 0 }), false);
  /* Nothing owed. */
  assert.equal(check({ balance: 0, rate: 20, paymentMonthly: 0 }), false);
  /* Already covered by NEGATIVE_PAYMENT; not double-reported here. */
  assert.equal(check({ balance: 20000, rate: 20, paymentMonthly: -5 }), false);

  /* ABSENT is not zero. This validator runs before normalizeDebt() supplies
     the default, so an omitted field means "not stated here". Warning on it
     would fire on well-formed fixtures that simply do not mention payment. */
  assert.equal(check({ balance: 100, rate: 5 }), false,
    'an absent paymentMonthly must not be read as an explicit zero');
});

test('Q43: the check is scoped to explicit zero, not to underpayment generally', () => {
  /* Underpayment is real and far more common -- 33 of 91 debts in a
     120-scenario generated corpus carry a payment below their own interest,
     because the generator draws paymentMonthly independently of balance and
     rate. That is a finding about the GENERATOR. Widening this check until the
     tests that disagree go quiet would be fixing the measurement to match the
     instrument, so the scope is pinned here deliberately. */
  const underpaying = { balance: 139949, rate: 10.94, paymentMonthly: 674 };
  const result = validateScenario(validPlan({ advanced: {
    assetsOn: false, correlation: 0.25, assetClasses: [], debts: [underpaying],
  } }));
  assert.ok(!result.issues.some((i) => i.code === 'PAYMENT_BELOW_INTEREST'),
    'a positive-but-insufficient payment is out of this check\'s declared scope; ' +
    'if that changes, the corpus generator has to change with it');
});
