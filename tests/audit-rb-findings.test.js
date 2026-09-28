'use strict';

/*
 * RE-AUDIT 2 (RB-01…RB-09) — STEP 0: the red tests.
 *
 * Source: REAUDIT_2_AUDIT_AND_CLAUDE_HANDOVER_20260910.md, verdict
 * REOPEN / KEEP RELEASE GATED. Nine findings, seven P1.
 *
 * WHAT THIS FILE IS. Step 0 of the audit's own implementation queue: "Record
 * these nine findings; preserve known-good files; add focused red tests",
 * gated on "each test reproduces the specific wrong behavior WITHOUT A FULL
 * SIMULATION". It repairs nothing. Every test here asserts the CORRECT
 * behaviour and therefore fails today; each goes green when its finding is
 * repaired, in the order §7 lays out.
 *
 * DIRECT ORACLES, per that gate. Six of the nine need no projection at all —
 * they call the defective function and compare against an independently
 * computed figure. The three that do run the engine use a short deterministic
 * `simple` projection with zero return and zero inflation, never a Monte Carlo
 * campaign, so a failure names a mechanism rather than a distribution.
 *
 * TODO-MARKED so `npm test` stays green at a task boundary — the same way
 * Q16, Q18, Q32a/b and Q33 are already carried. Remove the todo marker in the
 * same commit as the repair, never before.
 *
 * ON THE FIGURES. Every number below was reproduced here before it was
 * written down. Where a reproduction matches the audit to the cent it says so;
 * where it does not, it says that too and names which figures agree — the
 * audit does not publish every scenario field, and a claimed match that was
 * really a reconstruction would be exactly the kind of evidence this project
 * keeps recording as worthless.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { installDebtModules } = require('../tools/capture-baseline.js');
const golden = require('./lib/golden-scenario-defs.js');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(
  shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
installDebtModules();
const engine = require('../src/engine.js');
const { validateScenario } = require('../src/scenario-validator.js');
const mvi = require('../src/mortgage-vs-investing.js');
const { monthlyPayment } = require('../src/debt-amortization.js');

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

/** A deterministic base: zero return, zero inflation, no debts, no dividends. */
function basePlan(over) {
  const p = clone(defaultPlan);
  p.setupComplete = true;
  p.profile.filing = 'single';
  p.profile.spouseOn = false;
  p.assumptions.method = 'simple';
  p.assumptions.returnRate = 0;
  p.assumptions.inflation = 0;
  p.assumptions.fee = 0;
  p.retirement.dividendOn = false;
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  return Object.assign(p, over || {});
}

/** A mortgage record with every field the engine reads. */
function mortgage(over) {
  return Object.assign({
    id: 'm1', type: 'mortgage', name: 'Home', owner: 'household',
    balance: 300000, rate: 6, paymentMonthly: 1500, payoffAge: 90,
    includePayment: true, taxDeductible: true, mortgageType: 'conventional',
    rateType: 'fixed', originalAmount: 300000, propertyValue: 500000,
    remainingTermYears: 25, loanTermYears: 30, extraPrincipalMonthly: 0,
    annualPropertyTax: 0, annualInsurance: 0, hoaMonthly: 0, pmiMonthly: 0,
    includeHousingCosts: false, nextRateResetAge: 0, resetRate: 0,
  }, over);
}

// ===========================================================================
// RB-01 · P1 — duplicate account IDs already misroute contributions
// ===========================================================================

/* REPRODUCED. The routing defect matches the audit exactly: the $12,000
   taxable contribution lands in the PRE-TAX account, so preTax closes at
   $112,000 instead of $100,000 and taxable stays at its opening balance.
   The audit's ancillary MAGI/tax figures are not reproduced here — it does not
   publish every scenario field, and the numbers that differ (magi 109,500 vs
   108,000; taxes 26,670 vs 26,407.50) come from plan details outside the
   published reproduction. The preTax/taxable routing, which IS the finding,
   agrees to the cent. Said plainly rather than tuned until it matched. */
test('RB-01: a duplicate account id must not route a contribution into the wrong tax class', () => {
  const build = (ids) => basePlan({
    id: 'rb01',
    profile: Object.assign(clone(defaultPlan.profile), { filing: 'single', spouseOn: false, age: 40, retireAge: 65, endAge: 42 }),
    employment: Object.assign(clone(defaultPlan.employment), { salary: 120000, spouseSalary: 0, growth: 0 }),
    accounts: [
      account({ id: ids[0], name: '401k', type: 'traditional401k', taxClass: 'preTax', balance: 100000, contribution: 0, priority: 1 }),
      account({ id: ids[1], name: 'Brokerage', type: 'taxable', taxClass: 'taxable', balance: 100000, contribution: 12000, priority: 2 }),
    ],
  });

  const duplicate = build(['same', 'same']);
  const control = build(['a', 'b']);

  /* CONTROL FIRST: with unique ids the contribution lands where it was aimed.
     Without this the assertion below could pass for an unrelated reason. */
  const controlRow = engine.runPlan(clone(control)).rows[1];
  assert.equal(Math.round(controlRow.preTax), 100000,
    'CONTROL: with unique ids the pre-tax account receives no contribution');
  assert.ok(controlRow.taxable > 110000,
    'CONTROL: with unique ids the taxable account receives the $12,000');

  const validated = validateScenario(clone(duplicate));
  assert.equal(validated.valid, false,
    'RB-01 acceptance: the duplicate-id plan must be REJECTED at the validation boundary, not ' +
    'accepted with a warning. Q23 deferred rejection until an account-id rate map existed, but ' +
    'the contribution and transfer paths already resolve by id today, so this is a current ' +
    'financial defect rather than a future-refactor risk.');

  /* REPAIRED by rejecting at the public execution boundary too, not only in
     the validator -- a validator that refuses an IMPORT does not gate a direct
     runPlan() call, and this defect was reproduced through the generated
     Worker. accountContractCode() returns before clone() and before any cash
     moves, so the misrouted contribution can no longer happen at all. */
  const rejected = engine.runPlan(clone(duplicate));
  assert.equal(rejected.status, 'calculation_error',
    'the engine must refuse a duplicate-id plan at its own boundary, not only at import');
  assert.equal(rejected.calculationErrorCode, 'SCENARIO_DUPLICATE_ACCOUNT_ID');
  assert.equal(rejected.rows, null,
    'and a refused scenario carries no financial rows, per the invalid-result contract');
});

// ===========================================================================
// RB-02 · P1 — the cash-holding category has no enforced contract
// ===========================================================================

/* REPRODUCED TO THE CENT. All four of the audit's figures agree:
   Roth 134,602.50 vs control 110,000.00; taxable retained 0 vs 34,602.50. */
test('RB-02: a non-boolean cashHolding flag must be rejected, not silently honoured', () => {
  const build = (flag) => {
    const roth = account({ id: 'roth1', name: 'Roth', type: 'rothIRA', taxClass: 'roth', balance: 100000, priority: 1 });
    if (flag !== undefined) roth.cashHolding = flag;
    const p = basePlan({
      id: 'rb02',
      profile: Object.assign(clone(defaultPlan.profile), { filing: 'single', spouseOn: false, age: 65, retireAge: 65, endAge: 67 }),
      employment: Object.assign(clone(defaultPlan.employment), { salary: 0, spouseSalary: 0 }),
      accounts: [roth],
    });
    p.assumptions.returnRate = 10;
    p.retirement.strategy = 'fixedNominal';
    p.retirement.spending = 20000;
    p.retirement.ssBenefit = 0;
    p.retirement.pension = 60000;
    p.retirement.pensionStart = 65;
    return p;
  };

  /* CONTROL: with no flag at all, the surplus goes to retained taxable cash —
     so the movement below is caused by the flag and nothing else. */
  const controlRow = engine.runPlan(clone(build(undefined))).rows[1];
  assert.ok(Math.abs(controlRow.roth - 110000) < 0.01,
    'CONTROL: without the flag the Roth simply grows at 10%; got ' + controlRow.roth.toFixed(2));
  /* R6 (S5 task 8, the Arizona age-65 exemption, TAX section 5.3, ENACTED): 34,602.50 became 34,655.00 -- one $2,100 exemption for a single person 65 leaves $52.50 more cash.
     The mechanism this pins is unchanged, and 34,602.50 returns exactly with the exemption set to $0. */
  /* S5AA task 3.1 (Q88): 34,655.00 before the IRC 63(f) additional deduction for the aged, which leaves
     $246 more cash -- $2,050 at the 12% bracket -- and that cash is retained as taxable. */
  assert.ok(Math.abs(controlRow.taxable - 34901.00) < 0.01,
    'CONTROL: without the flag the surplus is retained as taxable cash, $34,901.00; got ' + controlRow.taxable.toFixed(2));

  const bad = build('false');
  const validated = validateScenario(clone(bad));
  const named = validated.issues.filter((i) =>
    String(i.field || '').includes('cashHolding') || String(i.message || '').includes('cashHolding'));
  assert.ok(named.length > 0,
    'RB-02 acceptance: the string "false" supplied as cashHolding must produce a FIELD-SPECIFIC ' +
    'error. It is truthy, it survives the real normalizer unchanged, and it is accepted today ' +
    'with no validation issue at all.');
  assert.equal(validated.valid, false, 'and the scenario must not validate');

  /* REPAIRED. isHouseholdCashHolding() is now the single predicate all six
     consumers read, and it requires the boolean AND the taxable class -- so
     the string can no longer enrol a Roth. The boundary refuses the record
     outright, which is what stops the generated Worker reproducing it. */
  const rejected = engine.runPlan(clone(bad));
  assert.equal(rejected.status, 'calculation_error',
    'the engine must refuse an invalid cash-holding record at its own boundary');
  assert.equal(rejected.calculationErrorCode, 'SCENARIO_INVALID_CASH_HOLDING');

  /* And the category contract holds for a well-typed flag on the wrong class:
     `true` on a Roth is still a violation, which is the half a bare
     `=== true` predicate would have missed. */
  const rothFlaggedTrue = validateScenario(clone(build(true)));
  assert.equal(rothFlaggedTrue.valid, false,
    'cashHolding:true on a ROTH must also be rejected -- the destination contract requires ' +
    'the taxable class, not merely a boolean flag');
});

// ===========================================================================
// RB-03 · P1 — recast adds existing extra principal twice
// ===========================================================================

/* PURE ORACLE, no projection. The expected scheduled payment comes from the
   annuity equation, not from the field under test. */
test('RB-03: lumpSumRecast must write scheduled P&I, not the all-in outlay', { todo: 'EXCLUDED under decision register P19 -- mortgage-vs-investing.js / debt-strategy-adapter.js are unsupported and no longer bundled (tests/module-exclusion-registry.test.js enforces it). This witness is now the REVIVAL CONTRACT: it must go green before the module may ship again. Do not remove this marker to make the suite tidy.' }, () => {
  const plan = basePlan({
    id: 'rb03',
    profile: Object.assign(clone(defaultPlan.profile), { age: 40, retireAge: 65, endAge: 45 }),
    accounts: [account({ id: 'tax1', balance: 500000 })],
  });
  plan.advanced.debts = [mortgage({
    balance: 100000, rate: 6, remainingTermYears: 20, extraPrincipalMonthly: 500, paymentMonthly: 716.43,
  })];

  const applied = mvi.applyMethod(plan, 'lumpSumRecast', 10000);
  assert.equal(applied.applicable, true);
  const debt = applied.plan.advanced.debts[0];

  /* 90,000 × 0.005 / (1 − 1.005^−240) — computed here, independently of the
     module and of debt-recast.js, so this cannot agree by construction. */
  const scheduled = (90000 * 0.005) / (1 - Math.pow(1.005, -240));
  assert.ok(Math.abs(scheduled - 644.7879526303554) < 1e-9,
    'oracle self-check: the annuity equation must give the audit\'s figure');
  assert.ok(Math.abs(monthlyPayment(90000, 6, 240) - scheduled) < 1e-9,
    'oracle cross-check: debt-amortization agrees with the annuity equation');

  assert.ok(Math.abs(debt.paymentMonthly - scheduled) < 1e-6,
    'paymentMonthly holds ' + debt.paymentMonthly.toFixed(10) + ', which is the recast module\'s ' +
    'ALL-IN OUTLAY (scheduled P&I plus the existing $500 extra). extraPrincipalMonthly is still ' +
    '500, and projectDebts() adds the two — so the engine pays $1,644.79/month instead of ' +
    '$1,144.79, i.e. $19,737.46 a year against $13,737.46 expected. Scheduled P&I and total ' +
    'outlay need distinct fields; do not redefine debt-recast.js\'s output semantics without ' +
    'migrating its consumers.');
  assert.equal(debt.extraPrincipalMonthly, 500,
    'and the original extra must survive exactly once');
});

// ===========================================================================
// RB-04 · P1 — the interest objective measures a different mortgage
// ===========================================================================

/* PURE ORACLE. Interest at exactly $1,500/month on $300,000 at 6% equals the
   payment, so the balance never moves and a year costs exactly $18,000. */
test('RB-04: the interest objective must use the entered payment, not a re-derived one', { todo: 'EXCLUDED under decision register P19 -- mortgage-vs-investing.js / debt-strategy-adapter.js are unsupported and no longer bundled (tests/module-exclusion-registry.test.js enforces it). This witness is now the REVIVAL CONTRACT: it must go green before the module may ship again. Do not remove this marker to make the suite tidy.' }, () => {
  const plan = basePlan({
    id: 'rb04',
    profile: Object.assign(clone(defaultPlan.profile), { age: 40, retireAge: 65, endAge: 45 }),
    accounts: [account({ id: 'tax1', balance: 500000 })],
  });
  plan.advanced.debts = [mortgage({ balance: 300000, rate: 6, paymentMonthly: 1500, remainingTermYears: 25 })];

  // Independent monthly recurrence: interest == payment, so nothing amortizes.
  let balance = 300000;
  let interest = 0;
  for (let m = 0; m < 12; m++) {
    const i = balance * 0.06 / 12;
    interest += i;
    balance = balance + i - 1500;
  }
  assert.ok(Math.abs(interest - 18000) < 1e-9, 'oracle self-check: a year must cost exactly 18000');
  assert.ok(Math.abs(balance - 300000) < 1e-9, 'oracle self-check: the balance must not move');

  const reported = mvi.mortgageInterestOverHorizon(plan, 1);
  assert.ok(Math.abs(reported - 18000) < 1e-6,
    'the objective reported ' + reported.toFixed(2) + ' rather than 18000. ' +
    'mortgageInterestOverHorizon() calls an amortizer that DERIVES its own payment from ' +
    'balance/rate/term, ignoring the entered paymentMonthly, the payoff-age balloon and ' +
    'adjustable-rate events. That is not the mortgage the engine runs. Note also that ' +
    'curtailment and recast currently report the SAME interest, because a payment is recomputed ' +
    'for both.');
});

// ===========================================================================
// RB-05 · P1 — the comparison bypasses the invalid-result contract
// ===========================================================================

test('RB-05: an invalid scenario must never yield a numeric objective or a winner', { todo: 'EXCLUDED under decision register P19 -- mortgage-vs-investing.js / debt-strategy-adapter.js are unsupported and no longer bundled (tests/module-exclusion-registry.test.js enforces it). This witness is now the REVIVAL CONTRACT: it must go green before the module may ship again. Do not remove this marker to make the suite tidy.' }, () => {
  const plan = basePlan({
    id: 'rb05',
    profile: Object.assign(clone(defaultPlan.profile), { age: 40, retireAge: 65, endAge: 45 }),
    accounts: [account({ id: 'tax1', balance: 'bad' })],
  });
  plan.advanced.debts = [mortgage({})];

  /* CONTROL: the ENGINE rejects this correctly. The defect is entirely in the
     consumer, which is what makes it an ARCH-02 repeat rather than a new one. */
  const raw = engine.runPlan(clone(plan));
  assert.equal(raw.status, 'calculation_error',
    'CONTROL: runPlan must reject a non-finite account balance');
  assert.equal(raw.calculationErrorCode, 'SCENARIO_NONFINITE_ACCOUNT');

  const interest = mvi.evaluatePreset(plan,
    { method: 'extraPrincipalMonthly', objective: 'totalInterestPaid' },
    { amount: 500, horizonYears: 1, runPlan: engine.runPlan });
  assert.equal(interest.applicable, false,
    'a rejected scenario still produced applicable:true and a value of ' +
    JSON.stringify(interest.value) + '. A numerically available standalone loan statistic does ' +
    'not validate a whole-plan comparison that just failed.');
  assert.equal(interest.value, undefined, 'and a refusal must carry no number');

  const mc = clone(plan);
  mc.assumptions.method = 'monteCarlo';
  mc.assumptions.runs = 100;
  mc.assumptions.seed = 123456;
  const success = mvi.evaluatePreset(mc,
    { method: 'investMonthly', objective: 'planSuccessRate' },
    { amount: 500, horizonYears: 1, runPlan: engine.runPlan });
  assert.equal(success.applicable, false,
    'the same rejected input reported ' + JSON.stringify(success.value) + '% success. No path ' +
    'was ever run — the engine rejects before simulation and num(null, 0) coerces the null into ' +
    'zero. A genuine 0% must stay distinguishable from a failure to compute.');
});

// ===========================================================================
// RB-06 · P1 — investMonthly confuses dollars with percentages
// ===========================================================================

/* PURE ORACLE, reproduced to the dollar: 10 -> 6010, an increment of
   $7,200,000 a year instead of $6,000. */
test('RB-06: $500/month must add $6,000 a year regardless of contribution mode', { todo: 'EXCLUDED under decision register P19 -- mortgage-vs-investing.js / debt-strategy-adapter.js are unsupported and no longer bundled (tests/module-exclusion-registry.test.js enforces it). This witness is now the REVIVAL CONTRACT: it must go green before the module may ship again. Do not remove this marker to make the suite tidy.' }, () => {
  const plan = basePlan({
    id: 'rb06',
    profile: Object.assign(clone(defaultPlan.profile), { age: 40, retireAge: 65, endAge: 45 }),
    employment: Object.assign(clone(defaultPlan.employment), { salary: 120000, spouseSalary: 0, growth: 0 }),
    accounts: [account({
      id: 'tax1', name: 'Brokerage', taxClass: 'taxable', balance: 200000,
      contribution: 10, contributionMode: 'salaryPct',
    })],
  });

  const before = engine.accountPlannedContribution(plan.accounts[0], 120000, 40, plan);
  assert.equal(before, 12000, 'oracle self-check: 10% of a $120,000 salary is $12,000');

  const applied = mvi.applyMethod(plan, 'investMonthly', 500);
  assert.equal(applied.applicable, true,
    'if this method starts REFUSING salaryPct destinations that is an acceptable repair — ' +
    'update this assertion in the same commit and keep the delta check below for dollar mode');

  const after = engine.accountPlannedContribution(applied.plan.accounts[0], 120000, 40, plan);
  assert.equal(after - before, 6000,
    'the field went from ' + before + ' to ' + after + ' — an increase of ' +
    (after - before).toLocaleString() + ' instead of 6,000. The module adds amount x 12 directly ' +
    'to account.contribution, which the engine reads as a PERCENTAGE when contributionMode is ' +
    '"salaryPct". No contribution cap limits a taxable destination. Do not repair this by ' +
    'converting every salaryPct account to dollar mode: that destroys its salary-linked ' +
    'behaviour. The additional dollars want to be a separate scheduled cash flow.');
});

// ===========================================================================
// RB-07 · P1 — "ending net worth" silently becomes portfolio-only scoring
// ===========================================================================

test('RB-07: endingNetWorth must include debt, or refuse when net-worth accounting is off', { todo: 'EXCLUDED under decision register P19 -- mortgage-vs-investing.js / debt-strategy-adapter.js are unsupported and no longer bundled (tests/module-exclusion-registry.test.js enforces it). This witness is now the REVIVAL CONTRACT: it must go green before the module may ship again. Do not remove this marker to make the suite tidy.' }, () => {
  const plan = basePlan({
    id: 'rb07',
    profile: Object.assign(clone(defaultPlan.profile), { age: 40, retireAge: 65, endAge: 45 }),
    accounts: [account({ id: 'tax1', balance: 200000 })],
  });
  plan.advanced.debts = [mortgage({ balance: 300000 })];
  assert.equal(plan.advanced.networthOn, false,
    'precondition: the default flag is OFF, which is the whole point of this finding');

  const options = { amount: 50000, horizonYears: 0, runPlan: engine.runPlan };
  const paydown = mvi.evaluatePreset(plan, { method: 'lumpSumPrincipal', objective: 'endingNetWorth' }, options);
  const invest = mvi.evaluatePreset(plan, { method: 'investLumpSum', objective: 'endingNetWorth' }, options);

  /* At horizon zero no return, tax or payment schedule can explain a
     difference: $50,000 moved from cash to either the loan or the portfolio
     leaves true net worth at -$50,000 either way. */
  if (paydown.applicable && invest.applicable) {
    assert.equal(paydown.value, invest.value,
      'horizon-zero conservation fails: paydown scored ' + paydown.value + ' and investing ' +
      invest.value + ', so investing "wins" by $50,000 purely because row.networth is ' +
      'portfolio-only while advanced.networthOn is false. True post-action net worth is ' +
      '-$50,000 in both branches. Either require a debt-inclusive metric or refuse — but do not ' +
      'silently change the user\'s unrelated scenario setting to obtain an answer.');
  } else {
    assert.equal(paydown.applicable, false, 'if refusing, BOTH branches must refuse');
    assert.equal(invest.applicable, false);
  }
});

// ===========================================================================
// RB-08 · P2 — fractional horizons use row count as elapsed time
// ===========================================================================

test('RB-08: a horizon landing exactly on a row must select that row', { todo: 'EXCLUDED under decision register P19 -- mortgage-vs-investing.js / debt-strategy-adapter.js are unsupported and no longer bundled (tests/module-exclusion-registry.test.js enforces it). This witness is now the REVIVAL CONTRACT: it must go green before the module may ship again. Do not remove this marker to make the suite tidy.' }, () => {
  const plan = basePlan({
    id: 'rb08',
    profile: Object.assign(clone(defaultPlan.profile), { age: 40.5, retireAge: 65, endAge: 42 }),
    accounts: [account({ id: 'tax1', balance: 200000 })],
  });
  plan.advanced.debts = [mortgage({ balance: 300000 })];
  plan.advanced.networthOn = true;

  const ages = engine.runPlan(clone(plan)).rows.map((r) => r.age);
  assert.deepEqual(ages.slice(0, 3), [40.5, 41, 42],
    'precondition: the generated ages must be 40.5, 41, 42 for this to bite; got ' + JSON.stringify(ages));

  const evaluated = mvi.evaluatePreset(plan,
    { method: 'lumpSumPrincipal', objective: 'endingNetWorth' },
    { amount: 50000, horizonYears: 0.5, runPlan: engine.runPlan });

  assert.equal(evaluated.rowAge, 41,
    'a 0.5-year horizon from age 40.5 lands exactly on the age-41 row, and rowAtHorizon() ' +
    'selected age ' + evaluated.rowAge + ' instead — it indexes rows[Math.floor(horizonYears)] ' +
    'while row zero is an opening snapshot and the first period can be fractional. Meanwhile ' +
    'the interest objective uses six months, so the two objectives stop sharing a time window. ' +
    'Locate rows by elapsed age, not index.');
});

// ===========================================================================
// RB-09 · P2 — schema drift protection is narrower than claimed
// ===========================================================================

test('RB-09: the catalogue must detect a field added to an ordinary row', () => {
  const { buildCatalogue } = require('./lib/schema-catalogue.js');
  const plan = basePlan({
    id: 'rb09',
    profile: Object.assign(clone(defaultPlan.profile), { age: 40, retireAge: 65, endAge: 45 }),
    accounts: [account({ id: 'tax1', balance: 200000 })],
  });

  const result = engine.runPlan(clone(plan));
  assert.ok(result.rows.length > 2, 'precondition: more than an opening row');

  /* The audit's own counterexample: mutate ROW 1 — an ordinary row, not the
     opening snapshot the catalogue describes — and rebuild. */
  const mutated = clone(result);
  mutated.rows[1].newFinancialField = 123;
  delete mutated.rows[1].calculationErrorCode;

  const before = buildCatalogue(defaultPlan, { simple: result });
  const after = buildCatalogue(defaultPlan, { simple: mutated });

  assert.notEqual(JSON.stringify(before), JSON.stringify(after),
    'adding newFinancialField to row 1 and removing its calculationErrorCode produced an ' +
    'IDENTICAL catalogue. describe() reads rows[0] only, so the ordinary-row shape — which ' +
    'carries 24 fields against the opening row\'s 22, including calculationError and ' +
    'calculationErrorCode — is outside the contract entirely, as are rejection and ' +
    'calculation-error variants. The drift test cannot make the claim its name implies.');
});

test('RB-09: the catalogue must describe populated account and debt records', () => {
  /* REPAIRED. This asserts against the LIVE catalogue -- the artifact that
     actually provides drift protection and is compared against
     tests/fixtures/schema-catalogue.fixture.json -- rather than against a
     catalogue built from a bare defaultPlan.

     That is the finding's real subject. defaultPlan carries accounts, debts,
     income records, spending stages and other assets as EMPTY arrays, so
     describing it produced leaves reading literally
     `accounts[] : (empty by default)` and every field of every record sat
     outside the contract. liveCatalogue() now fills each collection from the
     first corpus scenario that actually carries one -- real specimen inputs,
     not a hand-written sketch that could drift from them -- including nested
     collections like accounts[].futureChanges, which left ITS record outside
     the contract one level down. */
  const { liveCatalogue } = require('./lib/schema-catalogue.js');
  const { catalogue } = liveCatalogue();

  const emptyLeaves = catalogue.scenario.leaves.filter((l) => l.includes('(empty by default)'));
  assert.deepEqual(emptyLeaves, [],
    'these leaves are catalogued as empty arrays, so every field of the record they hold is ' +
    'OUTSIDE the schema contract: ' + JSON.stringify(emptyLeaves));

  /* Positive control: the record fields are genuinely present, so this cannot
     pass by the catalogue simply having stopped describing collections. */
  ['accounts[].taxClass : string', 'accounts[].basisPct : number'].forEach((leaf) => {
    assert.ok(catalogue.scenario.leaves.includes(leaf),
      'expected ' + leaf + ' in the catalogue; got ' + catalogue.scenario.leafCount + ' leaves');
  });

  /* And the variants the audit named: an ordinary row is 24 fields against the
     opening row's 22, and an invalid result has a shape of its own. */
  const mode = Object.keys(catalogue.result).find((k) => k !== '__invalid');
  assert.ok(catalogue.result[mode].ordinaryRowCount > catalogue.result[mode].rowCount,
    'the ordinary row must be catalogued separately from the opening snapshot; got ' +
    catalogue.result[mode].ordinaryRowCount + ' vs ' + catalogue.result[mode].rowCount);
  assert.ok(catalogue.result.__invalid,
    'a rejected result is a shape of its own and must be represented');
});
