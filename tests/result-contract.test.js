/* P5-02 -- the intended-result contract. P5-02 is PARTIALLY qualified against
 * it (closeout verdict 2026-09-13, condition 1): the checker is not a complete
 * corruption gate -- BC-01, carried; owned by S4 2b.4 (S4_TASK_CHECKLIST.md).
 * BC-01's four checker gaps are closed at CONTRACT VERSION 2 (S4 2b.4): see
 * section 5 below, whose witnesses were each observed failing against the
 * version 1 checker for the reason the verdict gave. Section 6 holds S4-IR-03's
 * sparse-row witnesses (external instrument audit, 2026-09-13).
 *
 * findingIds: P5-02
 *
 * The auditor carried "the independent intended result contract" from package
 * 6: P5-02's thirteen required row fields had been MEASURED from stored output,
 * and "observed output is not an independent specification". The accepted
 * definition (S2_S3_CLOSEOUT_ANSWERS_20260912.md, CQ-1) is shape, types,
 * meanings, units, nominal/real bases, per-mode differences and
 * structural/reconciliation invariants -- not financial values.
 *
 * The specification is tools/result-contract.json (human form:
 * RESULT_CONTRACT.md); the checker is tools/result-contract.js. This file
 * qualifies the contract four ways:
 *   1. fresh results in every mode, and every way a result becomes invalid;
 *   2. the stored after-CR2 historical entries -- which MAY legitimately fail
 *      a newer contract; if they ever do, record the difference here and do
 *      not change the contract to make it pass (CQ-1d);
 *   3. a two-way comparison with the DERIVED schema catalogue;
 *   4. a negative control for EVERY rule. A checker that reports no
 *      violations proves nothing until it has been shown to report one.
 *
 * Bounded (CQ-8b): deterministic fixtures, Monte Carlo capped at 25 paths.
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
const { CONTRACT, checkResult, catalogueDiff } = require(path.join(ROOT, 'tools', 'result-contract.js'));
const golden = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js'));

const defaultPlan = golden.extractDefaultPlan(shell);

function account(over) {
  return Object.assign({
    id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 400000, contribution: 6000, contributionMode: 'amount', priority: 1, basisPct: 80,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }, over);
}

function handPlan(mutate) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { returnRate: 5, inflation: 2.5, method: 'simple', volatility: 12, seed: 4242, runs: 25 });
  Object.assign(p.profile, { age: 50, retireAge: 60, endAge: 90 });
  Object.assign(p.employment, { salary: 110000, contributionStop: 60 });
  p.accounts = [
    account({}),
    account({ id: 'a2', name: '401k', type: 'traditional401k', taxClass: 'preTax', balance: 350000, contribution: 12000, priority: 2 }),
    account({ id: 'a3', name: 'Roth IRA', type: 'rothIRA', taxClass: 'roth', balance: 90000, contribution: 3000, priority: 3 }),
    account({ id: 'a4', name: 'HSA', type: 'hsa', taxClass: 'hsa', balance: 20000, contribution: 1000, priority: 4 }),
  ];
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  if (mutate) mutate(p);
  return p;
}

const withNetworth = (p) => {
  p.advanced.networthOn = true;
  p.advanced.insurance = 250000;
  p.retirement.selfLife = 85;
  p.advanced.otherAssets = [{ id: 'o1', name: 'Home', value: 500000, growth: 3, liquidity: 'illiquid', accessPct: 0 }];
  p.advanced.debts = [{ id: 'd1', name: 'Mortgage', kind: 'mortgage', owner: 'self', balance: 180000, rate: 5, paymentMonthly: 1600, payoffAge: 70 }];
};

function okFixtures() {
  const out = golden.GOLDEN_SCENARIOS.map(([name, overrides]) => {
    const plan = golden.buildScenario(defaultPlan, overrides);
    if (plan.assumptions.method === 'monteCarlo') plan.assumptions.runs = 25;
    return { name: `golden:${name}`, plan };
  });
  const add = (name, mutate) => out.push({ name, plan: handPlan(mutate) });
  add('four tax classes', null);
  add('net worth with assets, debt and insurance', withNetworth);
  add('historical from 1970', (p) => { p.assumptions.method = 'historical'; p.assumptions.historyStart = 1970; });
  add('fractional ages', (p) => { Object.assign(p.profile, { age: 50.5, retireAge: 60.5, endAge: 80.5 }); });
  add('shortfall-heavy', (p) => {
    p.accounts = [account({ balance: 60000, contribution: 0 })];
    p.retirement.spending = 90000;
    Object.assign(p.profile, { age: 62, retireAge: 62, endAge: 80 });
    Object.assign(p.employment, { salary: 0, contributionStop: 62 });
  });
  add('RMD age', (p) => {
    Object.assign(p.profile, { age: 72, retireAge: 72, endAge: 86 });
    Object.assign(p.employment, { salary: 0, contributionStop: 72 });
    p.advanced.rmdOn = true;
  });
  add('Monte Carlo, 25 paths', (p) => { p.assumptions.method = 'monteCarlo'; });
  add('Monte Carlo with net worth', (p) => { p.assumptions.method = 'monteCarlo'; withNetworth(p); });
  return out;
}

/* ---- 1. fresh results ---- */

test('contract: every field and invariant cites sources the contract defines', () => {
  const known = new Set(Object.keys(CONTRACT.sources));
  const check = (where, spec) => {
    assert.ok(Array.isArray(spec.sources) && spec.sources.length > 0, `${where} cites no source`);
    spec.sources.forEach((s) => assert.ok(known.has(s), `${where} cites unknown source ${s}`));
  };
  Object.entries(CONTRACT.rowFields.perPath).forEach(([k, f]) => {
    check(`row.${k}`, f);
    ['unit', 'basis', 'period', 'meaning'].forEach((a) => assert.ok(f[a], `row.${k} has no ${a}`));
  });
  Object.entries(CONTRACT.rowFields.monteCarlo.extra).forEach(([k, f]) => check(`monteCarlo.row.${k}`, f));
  ['okPerPath', 'okMonteCarlo', 'invalid', 'optional'].forEach((o) =>
    Object.entries(CONTRACT.topLevel[o]).forEach(([k, f]) => check(`${o}.${k}`, f)));
  CONTRACT.invariants.forEach((inv) => check(`invariant ${inv.id}`, inv));
});

test('contract: ordinary results in every mode conform, with nothing unspecified', () => {
  const modes = new Set();
  for (const { name, plan } of okFixtures()) {
    const result = engine.runPlan(plan);
    assert.equal(result.status, 'ok', `${name}: the fixture must run -- otherwise it is not measuring a successful result`);
    modes.add(result.mode);
    const c = checkResult(result, { plan });
    assert.deepEqual(c.violations, [], `${name}: ${JSON.stringify(c.violations.slice(0, 3))}`);
    assert.deepEqual(c.unspecified, [], `${name}: unspecified keys ${JSON.stringify(c.unspecified.slice(0, 5))}`);
    assert.deepEqual(c.skipped, [], `${name}: with the plan supplied, no rule may be skipped`);
  }
  assert.deepEqual([...modes].sort(), ['historical', 'monteCarlo', 'simple'], 'every mode must be exercised');
});

test('contract: invalid results conform, for each way a result becomes invalid', () => {
  /* S5R-01: the three calculation-error cases reached TAX_QUOTE_NONFINITE_CONTEXT with p.accounts[0].annualChange = NaN.
     That value only reached a tax quote because the simulation read JSON's null while other readers read the NaN; the
     input gate now refuses a non-finite number in the serialized lists by name (SCENARIO_NONFINITE_LIST_VALUE), so
     these cases reach the same invalid path with p.employment.salary = NaN, a field outside those lists, which gives
     TAX_QUOTE_NONFINITE_CONTEXT in every mode before and after that repair.
     S5AA R25 (R24F-04): the gate now refuses a non-number employment.salary by name (SCENARIO_NONNUMBER_PLAN_VALUE), so
     the three cases reach the same invalid path with p.retirement.pension = NaN, a field the validator does not type,
     which gives TAX_QUOTE_NONFINITE_CONTEXT in every mode (measured at the R25 repair).
     S5AA R43 (SA42F-05): the plan-value contract types every top-level number now, retirement.pension included, so no non-number
     reaches a projection; the three cases reach a calculation error with a FINITE employment.salary of 1e308 instead, whose tax
     cannot be quoted (measured at the R43 repair: the code is a TAX_QUOTE_ one, which one depends on the mode), and the cases now
     assert a calculation error rather than one code. */
  const cases = [
    ['rejected before simulation', handPlan((p) => { p.accounts[0].contribution = NaN; }), 'SCENARIO_NONFINITE_CONTRIBUTION'],
    ['calculation error in a simple run', handPlan((p) => { p.employment.salary = 1e308; }), 'a calculation error'],
    ['calculation error in a historical run', handPlan((p) => { p.employment.salary = 1e308; p.assumptions.method = 'historical'; p.assumptions.historyStart = 1970; }), 'a calculation error'],
    ['calculation error on every Monte Carlo path', handPlan((p) => { p.employment.salary = 1e308; p.assumptions.method = 'monteCarlo'; p.assumptions.runs = 3; }), 'a calculation error'],
  ];
  for (const [name, plan, code] of cases) {
    const result = engine.runPlan(plan);
    if (code === 'a calculation error') {
      // which arithmetic breaks first is not the point; that it is a calculation error and not an input refusal is
      assert.ok(result.calculationError === true && /^[A-Z_]+$/.test(result.calculationErrorCode || '') && !/^SCENARIO_/.test(result.calculationErrorCode),
        `${name}: the fixture must reach a calculation error, got ${result.calculationErrorCode}`);
    } else assert.equal(result.calculationErrorCode, code, `${name}: the fixture must reach this invalid path`);
    const c = checkResult(result, { plan });
    assert.equal(c.outcome, 'invalid', name);
    assert.deepEqual(c.violations, [], `${name}: ${JSON.stringify(c.violations)}`);
    assert.deepEqual(c.unspecified, [], `${name}: ${JSON.stringify(c.unspecified)}`);
  }
});

/* ---- 2. the stored historical entries ---- */

test('contract: the 36 stored after-CR2 entries conform to the rules actually checked (plan-dependent checks omitted)', () => {
  const stored = require(path.join(ROOT, 'tools', 'baseline-20260911-after-CR2-closure.json'));
  assert.equal(stored.entries.length, 36);
  const differences = [];
  let monteCarloEntries = 0;
  /* Q2 (A): the stored capture predates contract version 3 and records no version; its provenance makes it version 2,
     and it is checked under that, not under the newer fields it never had. */
  const { captureContractVersion } = require(path.join(ROOT, 'tools', 'result-contract.js'));
  const contractVersion = captureContractVersion(stored.meta);
  assert.equal(contractVersion, 2, 'the after-CR2 capture is a known legacy capture');
  stored.entries.forEach((e) => {
    const c = checkResult(e.result, { contractVersion });
    assert.ok(c.skipped.includes('R-AGE-SPAN'), 'without a plan, R-AGE-SPAN must be reported as skipped');
    if (e.result.status === 'ok' && e.result.mode === 'monteCarlo') {
      monteCarloEntries += 1;
      /* BC-01 (2b.4c): the runs comparison cannot be made without a plan, and
         must SAY so rather than vanish. */
      assert.ok(c.skipped.includes('M-PATHS:runs'), `${e.name}: the plan-dependent part of M-PATHS must be reported as skipped`);
    }
    c.violations.forEach((x) => differences.push(`${e.name}: ${x.rule} @ ${x.path}`));
    c.unspecified.forEach((u) => differences.push(`${e.name}: unspecified ${u}`));
  });
  assert.equal(monteCarloEntries, 3, 'the stored corpus carries three successful Monte Carlo entries');
  /* RECORDED DIFFERENCES: none at contract version 1, and none at version 2
     (S4 2b.4, BC-01) either. A historical snapshot
     may legitimately fail a newer contract -- if one does, list it here with
     its reason. Do not change the contract to make it pass. */
  assert.deepEqual(differences, []);
});

/* ---- 3. intended vs derived ---- */

test('contract vs the derived catalogue: exactly one disagreement, and it is the catalogue\'s', () => {
  const catalogue = require(path.join(ROOT, 'tests', 'fixtures', 'schema-catalogue.fixture.json'));
  /* The catalogue describes the top level with rows replaced by [] before
     describing it, so it cannot see the invalid contract's rows: null. The
     contract follows the engine and R2R-002 (rows null). Every other field
     agrees -- which is expected, since both describe fields that exist; the
     contract's independence is in meanings, units, bases, invariants and the
     conflicts it records, not in the field inventory. */
  assert.deepEqual(catalogueDiff(catalogue), [
    { where: 'invalid.topLevel', field: 'rows', direction: 'type: intended null, catalogue records array' },
  ]);
});

/* ---- conflict C6, reconciled in S5 2o ---- */

test('conflict C6, reconciled (S5 2o): the opening row counts insurance in networth when a plan starts at or past selfLife', () => {
  /* L4b's written rule puts insurance in networth once age >= selfLife. The
     engine's opening row omitted it when a plan started past selfLife, and this
     test pinned that disagreement until S5 2o aligned the engine to the rule
     (decided 2026-09-13, the owner: insurance counts from the first year). It now
     asserts conformance, and that the opening row moves by exactly the
     insurance amount: the two plans differ only in selfLife. */
  /* S5AA R9 round, the owner's decision 8 (2026-09-21): RE-FIXTURED, claim unchanged. A household of one past its only
     lifespan now projects nothing, so a surviving spouse keeps this plan running past the self's death -- the case the
     insurance rule is for. */
  const after = handPlan((p) => {
    p.advanced.networthOn = true; p.advanced.insurance = 250000; p.retirement.selfLife = 70;
    Object.assign(p.profile, { age: 72, retireAge: 72, endAge: 80, spouseOn: true, spouseAge: 72, filing: 'mfj' });
    Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: 72 });
    p.retirement.spouseLife = 95;
  });
  const before = JSON.parse(JSON.stringify(after));
  before.retirement.selfLife = 76;
  const rAfter = engine.runPlan(after);
  const rBefore = engine.runPlan(before);
  const cAfter = checkResult(rAfter, { plan: after });
  const cBefore = checkResult(rBefore, { plan: before });
  assert.deepEqual(cAfter.violations.map((x) => `${x.rule}@${x.path}`), [], 'a plan starting past selfLife conforms from its opening row');
  assert.deepEqual(cBefore.violations, [], 'control: starting before selfLife conforms');
  assert.equal(rAfter.rows[0].networth - rBefore.rows[0].networth, 250000, 'the opening row counts the insurance exactly once');
});

/* ---- 4. negative controls: every rule must be able to fire ---- */

function mutated(base, fn) {
  const copy = structuredClone(base);
  fn(copy);
  assert.notDeepStrictEqual(copy, base, 'the mutation must change the result, or the control is vacuous');
  return copy;
}

test('negative controls: each per-path rule reports a result broken in exactly its way', () => {
  const plan = handPlan(withNetworth);
  const base = engine.runPlan(plan);
  assert.deepEqual(checkResult(base, { plan }).violations, [], 'the unmutated base must conform');
  const last = base.rows.length - 1;
  const controls = [
    ['S-EXACT-KEYS', (r) => { delete r.lifetimeTaxes; }],
    ['S-EXACT-KEYS', (r) => { delete r.rows[3].magi; }],
    ['S-EXACT-KEYS', (r) => { r.successRate = 50; }],
    ['R-FINITE', (r) => { r.rows[3].magi = NaN; }],
    ['R-AGE-ORDER', (r) => { r.rows[4].age = r.rows[3].age; }],
    ['R-AGE-SPAN', (r) => { r.rows[last].age += 1; }],
    ['R-OPENING', (r) => { r.rows[0].spending = 5; }],
    ['R-REAL', (r) => { r.rows[3].realTotal += 100; }],
    ['R-CLASS', (r) => { r.rows[3].taxable += 100; }],
    ['R-NETWORTH', (r) => { r.rows[3].networth += 100; }],
    ['R-DEBT', (r) => { r.rows[3].debtInterest += 100; }],
    ['R-RMD', (r) => { r.rows[3].rmdUnmet += 100; }],
    ['R-NONNEG', (r) => { r.rows[3].shortfall = -5; }],
    ['T-LIFETIME', (r) => { r.lifetimeTaxes += 100; }],
    ['T-SHORTFALL', (r) => { r.firstShortfallAge = 61; }],
    ['T-SUCCESS', (r) => { r.failed = !r.failed; }],
  ];
  for (const [rule, fn] of controls) {
    const c = checkResult(mutated(base, fn), { plan });
    assert.ok(c.violations.some((x) => x.rule === rule), `${rule} did not fire; got ${JSON.stringify(c.violations.map((x) => x.rule))}`);
  }
  const extra = checkResult(mutated(base, (r) => { r.surprise = 1; }), { plan });
  assert.ok(extra.unspecified.includes('surprise'), 'an unspecified key must be reported');
});

test('negative controls: each Monte Carlo rule, and the invalid shape, report a broken result', () => {
  const plan = handPlan((p) => { p.assumptions.method = 'monteCarlo'; });
  const base = engine.runPlan(plan);
  assert.deepEqual(checkResult(base, { plan }).violations, [], 'the unmutated Monte Carlo base must conform');
  const mc = [
    ['M-PATHS', (r) => { r.validPathCount -= 1; }],
    ['M-SUCCESS', (r) => { r.failed = !r.failed; }],
    ['M-BAND', (r) => { r.rows[3].q10 = r.rows[3].total + 1000; }],
    ['R-REAL', (r) => { r.rows[3].realTotal += 100; }],
  ];
  for (const [rule, fn] of mc) {
    const c = checkResult(mutated(base, fn), { plan });
    assert.ok(c.violations.some((x) => x.rule === rule), `${rule} did not fire; got ${JSON.stringify(c.violations.map((x) => x.rule))}`);
  }

  const badPlan = handPlan((p) => { p.accounts[0].contribution = NaN; });
  const invalid = engine.runPlan(badPlan);
  assert.deepEqual(checkResult(invalid, { plan: badPlan }).violations, [], 'the unmutated invalid base must conform');
  const inv = [
    ['rows', (r) => { r.rows = []; }],
    ['successRate', (r) => { r.successRate = 0; }],
    ['partialDiagnostics.label', (r) => { delete r.partialDiagnostics.label; }],
  ];
  for (const [pathName, fn] of inv) {
    const c = checkResult(mutated(invalid, fn), { plan: badPlan });
    assert.ok(c.violations.some((x) => x.rule === 'S-EXACT-KEYS' && x.path === pathName),
      `invalid ${pathName} did not fire; got ${JSON.stringify(c.violations)}`);
  }
});

/* ---- 5. BC-01 (S4 task 2b.4): hand-authored results, independent of the engine ----
 *
 * The negative controls above mutate ENGINE output, so they can only exercise a
 * rule over shapes the engine already produces -- and BC-01's four gaps were in
 * shapes the engine does not produce. These results are written by hand from
 * the contract, internally consistent so every invariant holds, and each is
 * then broken in exactly one of the ways the S2 closeout verdict witnessed.
 */

const HAND_PLAN = {
  profile: { age: 60, endAge: 61 },
  advanced: { networthOn: false, insurance: 0 },
  retirement: { selfLife: 90 },
  assumptions: { runs: 3 },
};

function handOkPerPath() {
  const zeroFlows = {
    contributions: 0, income: 0, spending: 0, withdrawals: 0, dividends: 0, taxes: 0,
    rmd: 0, rmdDistributed: 0, rmdUnmet: 0, shortfall: 0, debtPayments: 0, debtPaymentsTotal: 0,
    debtInterest: 0, debtPrincipal: 0, debtHousing: 0, nonPortfolioDraw: 0, magi: 0,
    federalAgi: 0, ssProvisionalIncome: 0, seniorDeductionMagi: 0, niitMagi: 0, irmaaMagi: 0,
    /* Version 5 (R19, workstream A): the tax ledger's fields, zero on the opening row. */
    taxSettled: 0, taxTrueUpPaid: 0, taxOutstanding: 0,
  };
  const opening = Object.assign({
    age: 60, total: 200, realTotal: 200, taxable: 100, preTax: 50, roth: 25, hsa: 25,
    otherAssets: 0, debtBalance: 0, inflationFactor: 1, networth: 200,
  }, zeroFlows);
  const ordinary = {
    age: 61, total: 200, realTotal: 200 / 1.02, taxable: 110, preTax: 55, roth: 25, hsa: 10,
    contributions: 10, income: 50, spending: 40, withdrawals: 30, dividends: 5, taxes: 7,
    rmd: 0, rmdDistributed: 0, rmdUnmet: 0, shortfall: 0, debtPayments: 0, debtPaymentsTotal: 12,
    debtInterest: 5, debtPrincipal: 4, debtHousing: 3, otherAssets: 0, debtBalance: 0, nonPortfolioDraw: 0,
    inflationFactor: 1.02, networth: 200, magi: 60, calculationError: false, calculationErrorCode: null,
    federalAgi: 60, ssProvisionalIncome: 65, seniorDeductionMagi: 60, niitMagi: 60, irmaaMagi: 60,
    /* Version 5: no IRA basis, so the settled tax is the tax paid and nothing is trued up; lifetimeTaxes (7) is their sum. */
    taxSettled: 7, taxTrueUpPaid: 0, taxOutstanding: 0,
  };
  return {
    status: 'ok', mode: 'simple', rows: [opening, ordinary], calculationError: false,
    calculationErrorAge: null, calculationErrorCode: null, failed: false, successRate: 100,
    firstShortfallAge: null, sustainedFailureAge: null, failureAge: null,
    lifetimeContributions: 10, lifetimeContributionsReal: 10 / 1.02, lifetimeTaxes: 7, issues: [], limitWarnings: [],
  };
}

function handOkMonteCarlo() {
  const row = (age, total, inflationFactor, q10, q90) => ({
    age, total, realTotal: total / inflationFactor, taxable: total, preTax: 0, roth: 0, hsa: 0,
    contributions: 0, income: 0, spending: 0, withdrawals: 0, dividends: 0, taxes: 0, rmd: 0, shortfall: 0,
    debtPayments: 0, otherAssets: 0, debtBalance: 0, nonPortfolioDraw: 0, inflationFactor, networth: total, magi: 0,
    federalAgi: 0, ssProvisionalIncome: 0, seniorDeductionMagi: 0, niitMagi: 0, irmaaMagi: 0,
    q10, q90, calculationError: false,
  });
  return {
    status: 'ok', mode: 'monteCarlo', rows: [row(60, 200, 1, 150, 250), row(61, 210, 1.05, 180, 260)],
    calculationError: false, calculationErrorCode: null, calculationErrorPaths: 0, requestedPathCount: 3, validPathCount: 3,
    failed: true, successRate: 200 / 3, firstShortfallAge: 61, sustainedFailureAge: 61, failureAge: 61,
    lifetimeContributions: 0, lifetimeContributionsReal: 0, lifetimeTaxes: 0, issues: [], limitWarnings: [],
  };
}

function handInvalid(mode) {
  const r = {
    status: 'calculation_error', mode, calculationError: true, calculationErrorCode: 'TAX_QUOTE_NONFINITE_CONTEXT',
    rows: null, failed: null, successRate: null, firstShortfallAge: null, sustainedFailureAge: null, failureAge: null,
    lifetimeContributions: null, lifetimeContributionsReal: null, lifetimeTaxes: null,
    partialDiagnostics: { label: 'partial figures, not a result' }, issues: [], limitWarnings: [],
  };
  if (mode === 'monteCarlo') Object.assign(r, { calculationErrorPaths: 3, requestedPathCount: 3, validPathCount: 0 });
  else r.calculationErrorAge = 61;
  return r;
}

const at = (c) => c.violations.map((x) => x.rule + '@' + x.path);

test('BC-01 positive controls: hand-authored results in every outcome conform, and legitimate zeros are preserved', () => {
  const cases = [
    ['per-path', handOkPerPath()], ['Monte Carlo', handOkMonteCarlo()],
    ['invalid simple', handInvalid('simple')], ['invalid Monte Carlo (zero valid paths)', handInvalid('monteCarlo')],
  ];
  for (const [name, result] of cases) {
    const c = checkResult(result, { plan: HAND_PLAN });
    assert.deepEqual(c.violations, [], `${name}: ${JSON.stringify(at(c))}`);
    assert.deepEqual(c.unspecified, [], `${name}: unspecified ${JSON.stringify(c.unspecified)}`);
  }
  const zeroBalances = handOkPerPath();
  zeroBalances.rows.forEach((r) => { Object.assign(r, { total: 0, realTotal: 0, taxable: 0, preTax: 0, roth: 0, hsa: 0, networth: 0 }); });
  assert.deepEqual(checkResult(zeroBalances, { plan: HAND_PLAN }).violations, [], 'zero balances are a legitimate result');
  const noSuccess = handOkMonteCarlo();
  noSuccess.successRate = 0;
  assert.deepEqual(checkResult(noSuccess, { plan: HAND_PLAN }).violations, [], '0% success is a legitimate Monte Carlo result');
  const noShortfall = handOkMonteCarlo();
  Object.assign(noShortfall, { failed: false, successRate: 100, firstShortfallAge: null, sustainedFailureAge: null, failureAge: null });
  assert.deepEqual(checkResult(noShortfall, { plan: HAND_PLAN }).violations, [], 'null failure ages are legitimate');
});

test('BC-01: a non-finite top-level value is rejected by T-FINITE at its exact path, per outcome', () => {
  const cases = [];
  for (const bad of [NaN, Infinity, -Infinity]) {
    ['lifetimeTaxes', 'lifetimeContributions', 'lifetimeContributionsReal'].forEach((key) => {
      cases.push(['per-path', handOkPerPath, key, bad]);
      cases.push(['Monte Carlo', handOkMonteCarlo, key, bad]);
    });
    ['firstShortfallAge', 'sustainedFailureAge', 'failureAge'].forEach((key) => {
      cases.push(['Monte Carlo failure age (nullable, non-null)', handOkMonteCarlo, key, bad]);
    });
  }
  const inv = () => { const r = handInvalid('simple'); return r; };
  cases.push(['invalid, optional calculationErrorAge', inv, 'calculationErrorAge', NaN]);
  for (const [name, make, key, bad] of cases) {
    const r = make();
    r[key] = bad;
    let c;
    assert.doesNotThrow(() => { c = checkResult(r, { plan: HAND_PLAN }); }, `${name}: ${key} = ${bad} threw`);
    assert.ok(at(c).includes('T-FINITE@' + key), `${name}: ${key} = ${bad} must be rejected at ${key}; got ${JSON.stringify(at(c))}`);
  }
});

test('BC-01: path counts must be positive integers -- 0, 1.5 and -2 are rejected even when the two counts agree, and without a plan', () => {
  for (const bad of [0, 1.5, -2]) {
    const r = handOkMonteCarlo();
    r.requestedPathCount = bad;
    r.validPathCount = bad;
    const c = checkResult(r, {});
    assert.ok(at(c).includes('M-PATHS@requestedPathCount') && at(c).includes('M-PATHS@validPathCount'),
      `count ${bad}: ${JSON.stringify(at(c))}`);
  }
  const invalid = handInvalid('monteCarlo');
  invalid.requestedPathCount = 1.5;
  assert.ok(at(checkResult(invalid, {})).includes('X-INVALID@requestedPathCount'), 'an invalid result\'s counts are still counts');
  const negative = handInvalid('monteCarlo');
  negative.calculationErrorPaths = -1;
  assert.ok(at(checkResult(negative, {})).includes('X-INVALID@calculationErrorPaths'));
});

test('BC-01: the plan-dependent part of M-PATHS is reported as SKIPPED when no plan is supplied', () => {
  const without = checkResult(handOkMonteCarlo(), {});
  assert.ok(without.skipped.includes('M-PATHS:runs'), JSON.stringify(without.skipped));
  const withPlan = checkResult(handOkMonteCarlo(), { plan: HAND_PLAN });
  assert.ok(!withPlan.skipped.includes('M-PATHS:runs'), 'with the plan supplied it is evaluated, not skipped');
  const wrongRuns = checkResult(handOkMonteCarlo(), { plan: Object.assign({}, HAND_PLAN, { assumptions: { runs: 4 } }) });
  assert.ok(at(wrongRuns).includes('M-PATHS@requestedPathCount'), 'and with a plan it still fires');
});

test('BC-01: a malformed row is a structural violation at its index, never a thrown TypeError', () => {
  for (const [name, make] of [['per-path', handOkPerPath], ['Monte Carlo', handOkMonteCarlo]]) {
    for (const [label, bad] of [['null', null], ['an array', []], ['a number', 7]]) {
      const r = make();
      r.rows[1] = bad;
      let c;
      assert.doesNotThrow(() => { c = checkResult(r, { plan: HAND_PLAN }); }, `${name}: a ${label} row threw`);
      assert.ok(at(c).includes('S-ROW-RECORD@rows[1]'), `${name}: ${label} row: ${JSON.stringify(at(c))}`);
    }
  }
  // The DOCUMENTED invalid shape -- rows: null on a calculation_error result -- is accepted, not a malformed row.
  assert.deepEqual(checkResult(handInvalid('simple'), {}).violations, []);
  // rows: null on a SUCCESSFUL result is the top-level type violation, not a crash.
  const r = handOkPerPath();
  r.rows = null;
  let c;
  assert.doesNotThrow(() => { c = checkResult(r, { plan: HAND_PLAN }); });
  assert.ok(at(c).includes('S-EXACT-KEYS@rows'), JSON.stringify(at(c)));
});

test('BC-01: an absent required field is rejected at its exact path, at the top level and on a row', () => {
  const r = handOkMonteCarlo();
  delete r.validPathCount;
  assert.ok(at(checkResult(r, {})).includes('S-EXACT-KEYS@validPathCount'));
  const p = handOkPerPath();
  delete p.rows[1].debtHousing;
  assert.ok(at(checkResult(p, { plan: HAND_PLAN })).includes('S-EXACT-KEYS@rows[1].debtHousing'));
});

/* ---- 6. S4-IR-03 (external instrument audit, 2026-09-13): holes in rows ----
 *
 * Array.prototype.every, forEach and reduce SKIP the holes of a sparse array.
 * So rows.every(isRecord) was true for new Array(40) -- forty rows, not one a
 * record -- and the row loop never visited a deleted row. The audit witnessed
 * it on the stored control capture: a Monte Carlo result with rows[3] deleted,
 * and one whose rows were all holes, each returned ZERO violations, and a
 * per-path result with its opening row deleted threw reading inflationFactor.
 *
 * JSON cannot carry a hole (it writes null, which S-ROW-RECORD already rejects),
 * but structuredClone and any in-memory caller can. The hole witnesses below
 * were each observed failing against the checker before this section's repair;
 * the ones marked CONTROL passed before it and must keep passing.
 */

const STORED = require(path.join(ROOT, 'tools', 'baseline-20260911-after-CR2-closure.json'));
const storedOk = (mode) => STORED.entries.find((e) => e.result.status === 'ok' && e.result.mode === mode).result;
const rowRecords = (c) => at(c).filter((x) => x.startsWith('S-ROW-RECORD@'));
const handHistorical = () => Object.assign(handOkPerPath(), { mode: 'historical' });

test('IR-03 CONTROL: dense results in every mode, hand-authored and stored, report no row violation', () => {
  for (const [name, result, plan] of [
    ['hand simple', handOkPerPath(), HAND_PLAN], ['hand historical', handHistorical(), HAND_PLAN], ['hand Monte Carlo', handOkMonteCarlo(), HAND_PLAN],
    ['stored simple', storedOk('simple'), {}], ['stored historical', storedOk('historical'), {}], ['stored Monte Carlo', storedOk('monteCarlo'), {}],
  ]) {
    for (let i = 0; i < result.rows.length; i++) assert.ok(Object.prototype.hasOwnProperty.call(result.rows, i), `premise: ${name} rows are dense`);
    /* Q2 (A): a stored result is checked under the contract version its capture's provenance gives (version 2). */
    const c = checkResult(result, plan === HAND_PLAN ? { plan } : { contractVersion: require(path.join(ROOT, 'tools', 'result-contract.js')).captureContractVersion(STORED.meta) });
    assert.deepEqual(c.violations, [], `${name}: ${JSON.stringify(at(c).slice(0, 5))}`);
  }
});

test('IR-03: a hole at the opening, an interior or the final index is S-ROW-RECORD at exactly that index -- never silence, never a thrown TypeError', () => {
  for (const mode of ['simple', 'historical', 'monteCarlo']) {
    const base = storedOk(mode);
    const last = base.rows.length - 1;
    assert.ok(last > 3, `premise: the stored ${mode} result has an interior row to remove`);
    for (const index of [0, 3, last]) {
      const r = structuredClone(base);
      delete r.rows[index];
      assert.ok(!(index in r.rows) && r.rows.length === base.rows.length, `premise: rows[${index}] is a hole, not a shorter array`);
      let c;
      assert.doesNotThrow(() => { c = checkResult(r, {}); }, `${mode}: a hole at rows[${index}] threw`);
      assert.deepEqual(rowRecords(c), [`S-ROW-RECORD@rows[${index}]`], `${mode}: hole at ${index}: ${JSON.stringify(at(c).slice(0, 5))}`);
      assert.match(c.violations.find((x) => x.rule === 'S-ROW-RECORD').message, /hole/, 'the message must say it is a hole, not a null');
      if (mode !== 'monteCarlo') {
        ['R-OPENING', 'T-LIFETIME', 'T-SHORTFALL', 'T-SUCCESS'].forEach((rule) =>
          assert.ok(c.skipped.includes(rule), `${mode}: ${rule} must be reported SKIPPED over a hole, got ${JSON.stringify(c.skipped)}`));
      }
    }
  }
});

test('IR-03: a rows array made only of holes is a violation at every index, not a vacuous pass', () => {
  for (const [name, make] of [['per-path', handOkPerPath], ['Monte Carlo', handOkMonteCarlo], ['stored Monte Carlo', () => structuredClone(storedOk('monteCarlo'))]]) {
    const r = make();
    r.rows = new Array(r.rows.length);
    let c;
    assert.doesNotThrow(() => { c = checkResult(r, { plan: HAND_PLAN }); }, `${name}: an all-hole rows array threw`);
    assert.deepEqual(rowRecords(c), Array.from({ length: r.rows.length }, (_, i) => `S-ROW-RECORD@rows[${i}]`), name);
  }
});

test('IR-03: a hole survives structuredClone, and the clone is still rejected', () => {
  const holed = handOkMonteCarlo();
  delete holed.rows[1];
  const cloned = structuredClone(holed);
  assert.ok(!(1 in cloned.rows), 'premise: structuredClone preserves the hole');
  assert.deepEqual(rowRecords(checkResult(cloned, { plan: HAND_PLAN })), ['S-ROW-RECORD@rows[1]']);
});

test('IR-03 CONTROL: an explicit undefined row, and a hole sent through JSON (which arrives as null), are each S-ROW-RECORD', () => {
  const undef = handOkPerPath();
  undef.rows[1] = undefined;
  assert.ok(1 in undef.rows, 'premise: an own element whose value is undefined');
  assert.deepEqual(rowRecords(checkResult(undef, { plan: HAND_PLAN })), ['S-ROW-RECORD@rows[1]']);

  const holed = handOkPerPath();
  delete holed.rows[1];
  const viaJson = JSON.parse(JSON.stringify(holed));
  assert.strictEqual(viaJson.rows[1], null, 'premise: JSON writes a hole as null');
  const c = checkResult(viaJson, { plan: HAND_PLAN });
  assert.deepEqual(rowRecords(c), ['S-ROW-RECORD@rows[1]']);
  assert.match(c.violations.find((x) => x.rule === 'S-ROW-RECORD').message, /null/);
});

test('IR-03 CONTROL: the empty-array rule is untouched -- rows: [] on a successful result is S-EXACT-KEYS, not a row violation', () => {
  for (const make of [handOkPerPath, handOkMonteCarlo]) {
    const r = make();
    r.rows = [];
    const c = checkResult(r, { plan: HAND_PLAN });
    assert.ok(at(c).includes('S-EXACT-KEYS@rows'), JSON.stringify(at(c)));
    assert.deepEqual(rowRecords(c), []);
  }
});
