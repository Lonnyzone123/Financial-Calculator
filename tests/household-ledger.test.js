'use strict';

/*
 * S4 task 6 -- the household cash-flow ledger, held to HOUSEHOLD_LEDGER.md.
 *
 * L4 (tests/reconciliation-invariant.test.js) asserts the PORTFOLIO identity,
 * and FM-03 showed what that cannot see: cash that never enters the portfolio
 * cannot unbalance it. This file asserts the HOUSEHOLD identity the document
 * defines -- sources = uses per row, every row in exactly one class, no FAIL --
 * over both capture corpora, per path under Monte Carlo, and on small cases
 * computed from their inputs rather than from the engine's own flows.
 *
 * It is proved on each identity's blind spot (section 10). Dropping an income
 * receipt and duplicating a transfer turn THIS check red while L4 balances; a
 * portfolio valuation error turns L4 red while this balances. Section 6.3a's
 * re-proof of L4 itself runs the REAL test file against the faulted engine.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cb = require('../tools/capture-baseline.js');
cb.installDebtModules();
const realEngine = require('../src/engine.js');
const golden = require('./lib/golden-scenario-defs.js');
const ledger = require('./lib/household-ledger.js');
const { ENGINE_PATH } = require('./lib/engine-variant.js');

const DEFAULT_PLAN = golden.extractDefaultPlan(SHELL);
const TAPPED = ledger.tappedEngine();
const clone = (v) => JSON.parse(JSON.stringify(v));

/* Section 10's faults, as declared injections into the in-memory variant. */
const FAULTS = {
  dropIncome: {
    id: 'drop an income receipt: outside surplus is never retained (FM-03 regressed)',
    marker: 'SURPLUS_SOURCES.forEach(function(src){retainedBySource[src]=(surplusBySource[src]||0)*retainRatio});',
    replace: 'SURPLUS_SOURCES.forEach(function(src){retainedBySource[src]=(surplusBySource[src]||0)*0});',
  },
  duplicateTransfer: {
    id: 'duplicate a transfer: other-asset proceeds credited to household cash twice',
    marker: 'shortfall=Math.max(0,shortfall-nonPortfolioDraw)}',
    replace: 'shortfall=Math.max(0,shortfall-2*nonPortfolioDraw)}',
  },
  portfolioValuation: {
    id: 'portfolio valuation error: late growth never reported to the reconciler',
    marker: 'if(issues)growthTotal+=totalBalance(accounts)-beforeLateGrowth;',
    replace: 'if(issues)growthTotal+=0;',
  },
};

/* A retired single household with every optional flow off, zero returns,
   inflation and fees -- the base for the independent cases. */
function household(edit) {
  const p = clone(DEFAULT_PLAN);
  Object.assign(p.profile, { age: 65, retireAge: 65, endAge: 66, spouseOn: false, filing: 'single' });
  p.employment.salary = 0;
  p.employment.spouseSalary = 0;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, pension: 0, pensionCola: 0, ssBenefit: 0, spouseSS: 0, dividendOn: false, dividendYield: 0, incomeOffset: true, stages: [], expenses: [], otherIncomes: [], homeEquityFallback: false });
  Object.assign(p.advanced, { rmdOn: false, debts: [], otherAssets: [], healthOn: false, ltcOn: false, surplusPolicy: 'retain', transferOn: false, conversionOn: false });
  p.accounts = [];
  if (edit) edit(p);
  return p;
}
const account = (id, type, taxClass, balance, extra) => Object.assign({
  id, name: id, type, taxClass, owner: 'self', balance, basisPct: 100, contributionMode: 'amount', contribution: 0, frequency: 12,
  annualChangeMode: 'percent', annualChange: 0, changeTiming: 'annual', contributionPreset: 'none', futureChanges: [], priority: 1,
  matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0, vesting: 100, allocation: {},
}, extra || {});

/* The one row of a one-period plan, with its ledger entry. */
function oneRow(plan) {
  const s = { entries: [] };
  const obs = { flows: [], wages: [], qcd: [] };
  globalThis[ledger.HOOK] = { flows: (row, f) => obs.flows.push(f), wages: (w) => obs.wages.push(w), qcd: (q) => obs.qcd.push(q) };
  let result;
  try {
    result = TAPPED.simulatePlan(clone(plan), TAPPED.rng(plan.assumptions.seed), 0, null, []);
  } finally {
    globalThis[ledger.HOOK] = null;
  }
  assert.equal(result.rows.length, 2, 'CONTROL: a one-period plan has an opening row and one flow row');
  const row = result.rows[1];
  const f = obs.flows[0];
  s.row = row;
  s.entry = ledger.ledgerOf(row, { employer: f.employer, outsideDeposit: f.outsideDeposit || 0, wages: obs.wages[0], qcd: obs.qcd[0] });
  return s;
}
const cents = (x) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------------------
// Section 6.6's acceptance: small cases, their expectations computed from inputs
// ---------------------------------------------------------------------------

test('6.6 case: surplus income is retained -- every dollar of a pension is spent, taxed or deposited', () => {
  const { row, entry } = oneRow(household((p) => { p.retirement.pension = 60000; p.retirement.spending = 20000; p.accounts = [account('t', 'taxable', 'taxable', 1000000)]; }));
  assert.equal(entry.sources.externalIncome, 60000);
  assert.equal(entry.uses.fundedSpending, 20000);
  assert.equal(cents(entry.uses.householdCashIn), cents(60000 - 20000 - row.taxes), 'the deposit is the pension less spending less tax, computed here');
  assert.equal(entry.cls, 'CLOSED');
  assert.equal(entry.strict, true);
});

test('6.6 case: withdrawals fund spending and the tax they cause, and nothing else', () => {
  const { row, entry } = oneRow(household((p) => { p.retirement.spending = 30000; p.accounts = [account('k', 'traditional401k', 'preTax', 1000000, { basisPct: 0 })]; }));
  assert.ok(row.taxes > 0, 'CONTROL: a pre-tax withdrawal is taxed');
  assert.equal(entry.uses.fundedSpending, 30000);
  assert.equal(cents(entry.sources.portfolioCashOut - row.taxes), 30000, 'gross withdrawals less tax is exactly the spending');
  assert.equal(entry.cls, 'CLOSED');
});

test('6.6 case: dividends are counted once, as portfolio cash, never as external income too', () => {
  const { row, entry } = oneRow(household((p) => { Object.assign(p.retirement, { dividendOn: true, dividendYield: 2, dividendStart: 0, dividendGrowth: 0 }); p.accounts = [account('t', 'taxable', 'taxable', 500000)]; }));
  assert.ok(row.dividends > 0, 'CONTROL: the account paid dividends: ' + row.dividends);
  assert.equal(row.income, row.dividends, 'CONTROL: the engine reports dividend cash inside income');
  assert.equal(entry.sources.externalIncome, 0, 'so external income excludes it');
  assert.equal(cents(entry.sources.portfolioCashOut), cents(row.withdrawals + row.dividends));
  assert.equal(entry.cls, 'CLOSED');
});

test('6.6 case: an inter-account transfer is not household cash -- only the tax it causes is a use', () => {
  const { row, entry } = oneRow(household((p) => {
    p.accounts = [account('ira', 'traditionalIRA', 'preTax', 200000, { basisPct: 0 }), account('roth', 'rothIRA', 'roth', 0, { basisPct: 0 })];
    Object.assign(p.advanced, { transferOn: true, transferFrom: 'ira', transferTo: 'roth', transferAge: 65, transferAmount: 20000 });
  }));
  assert.ok(row.preTax < 200000 && row.roth > 0, 'CONTROL: the transfer moved money: preTax ' + row.preTax + ', roth ' + row.roth);
  assert.equal(entry.uses.householdCashIn, 0, 'no household cash went into the portfolio');
  assert.equal(entry.uses.fundedSpending, 0);
  assert.equal(cents(entry.sources.portfolioCashOut), cents(row.taxes), 'the only cash out of the portfolio paid the tax');
  assert.equal(entry.cls, 'CLOSED');
});

test('6.6 case: a debt payment inside spending closes; the same payment outside spending stays visible as unfunded', () => {
  const debt = { id: 'd1', type: 'otherDebt', name: 'loan', owner: 'household', balance: 50000, rate: 5, paymentMonthly: 500, payoffAge: 90, includePayment: true, taxDeductible: false, rateType: 'fixed', extraPrincipalMonthly: 0, originalAmount: 50000, remainingTermYears: 10, loanTermYears: 10 };
  const base = (include) => household((p) => { p.retirement.spending = 20000; p.accounts = [account('t', 'taxable', 'taxable', 1000000)]; p.advanced.debts = [Object.assign(clone(debt), { includePayment: include })]; });
  const inside = oneRow(base(true));
  assert.equal(cents(inside.row.debtPaymentsTotal), 6000, 'CONTROL: twelve $500 payments');
  assert.equal(inside.entry.uses.offBudgetDebt, 0);
  assert.equal(inside.entry.cls, 'CLOSED');
  const outside = oneRow(base(false));
  assert.equal(cents(outside.entry.uses.offBudgetDebt), 6000, 'the payment is still counted as a use');
  assert.equal(cents(outside.entry.residual), -6000, 'and no modelled source funds it');
  assert.equal(outside.entry.cls, 'UNFUNDED_CONTRIBUTION_OR_DEBT', 'an unpaid obligation stays visible; it is never booked as funded');
});

test('6.6 case: spending the household cannot fund is a shortfall, never booked as funded', () => {
  const { row, entry } = oneRow(household((p) => { p.retirement.spending = 100000; p.accounts = [account('t', 'taxable', 'taxable', 50000)]; }));
  assert.ok(row.shortfall > 0, 'CONTROL: there is a shortfall: ' + row.shortfall);
  assert.equal(cents(entry.uses.fundedSpending), cents(100000 - row.shortfall));
  assert.equal(entry.cls, 'CLOSED');
});

test('6.6 case: a contribution with no cash source is classified, not balanced -- the engine has no pre-retirement budget', () => {
  /* S5AA R26: this used a Roth IRA with no income. An IRA contribution is now capped at taxable compensation, so with no
     income it is not made and the case is never reached. A taxable brokerage contribution has no compensation limit and
     is the same case: money deposited with no income and no withdrawal to pay for it. */
  const { row, entry } = oneRow(household((p) => { Object.assign(p.profile, { age: 40, retireAge: 60, endAge: 41 }); p.accounts = [account('brokerage', 'taxable', 'taxable', 10000, { contribution: 500, basisPct: 100 })]; }));
  assert.equal(row.contributions, 500, 'CONTROL: the contribution was made');
  assert.equal(entry.sources.externalIncome + entry.sources.portfolioCashOut + entry.sources.nonPortfolioProceeds, 0, 'with no income and no withdrawal');
  assert.equal(entry.cls, 'UNFUNDED_CONTRIBUTION_OR_DEBT');
  assert.equal(cents(entry.residual), -500);
});

test('6.6 case: wages the engine does not allocate are classified, not turned into savings', () => {
  const { row, entry } = oneRow(household((p) => { Object.assign(p.profile, { age: 40, retireAge: 60, endAge: 41 }); p.employment.salary = 60000; p.accounts = [account('k', 'traditional401k', 'preTax', 10000, { contribution: 6000, basisPct: 0 })]; }));
  assert.ok(row.income >= 60000 - 0.01, 'CONTROL: wages were earned: ' + row.income);
  assert.equal(entry.cls, 'UNALLOCATED_WAGES');
  assert.equal(cents(entry.residual), cents(row.income - entry.uses.householdCashIn - row.taxes), 'the unallocated amount is wages less contributions less tax, computed here');
});

// ---------------------------------------------------------------------------
// The invariant over both corpora, per path under Monte Carlo
// ---------------------------------------------------------------------------

for (const composition of cb.COMPOSITIONS) {
  test(`6.2: the household identity holds over the ${composition} capture corpus -- no FAIL row, taps neutral, L4 balanced`, (t) => {
    const corpus = cb.corpus(composition === 'control' ? undefined : { composition });
    const sweeps = corpus.map(({ name, plan }) => Object.assign(ledger.sweepPlan(TAPPED, plan, { pathLimit: 50, reference: realEngine }), { name, method: plan.assumptions.method, runs: plan.assumptions.runs }));
    const all = ledger.combine(sweeps);
    t.diagnostic(composition + ': ' + corpus.length + ' scenarios, ' + all.paths + ' paths, ' + all.rows + ' rows; classes ' + JSON.stringify(all.classes) + '; strict rows ' + all.strictRows + '; low-resolution rows ' + all.lowResolutionRows);
    assert.equal(all.notNeutral, 0, 'the taps changed what the engine computed');
    assert.equal(ledger.failureCount(all), 0, 'household FAIL rows: ' + JSON.stringify(all.failures.slice(0, 3)));
    assert.equal(all.l4Mismatches, 0, 'the portfolio identity must balance over the same rows');
    assert.ok(all.strictRows > 1000, 'CONTROL: rows that must close exactly were actually checked, not skipped: ' + all.strictRows);
    const mc = sweeps.filter((s) => s.method === 'monteCarlo');
    const wrong = mc.filter((s) => s.paths !== Math.min(s.runs, 50)).map((s) => s.name + ': ' + s.paths + ' of ' + s.runs);
    assert.ok(mc.length > 0, 'CONTROL: the corpus has Monte Carlo scenarios');
    assert.deepEqual(wrong, [], 'every Monte Carlo scenario is checked on min(runs, 50) individual paths, never on percentile rows');
  });
}

test('6.2: the household identity holds over L4\'s own generated sweep too, so this ledger spans everything L4 spans', (t) => {
  const { generateScenarios } = require('./lib/scenario-generator.js');
  const batch = generateScenarios(DEFAULT_PLAN, { count: 40, startSeed: 20260910 });
  const all = ledger.combine(batch.map(({ plan }) => ledger.sweepPlan(TAPPED, plan, { pathLimit: 50, reference: realEngine })));
  t.diagnostic('L4 generated set (seeds 20260910..20260949): ' + all.paths + ' paths, ' + all.rows + ' rows; classes ' + JSON.stringify(all.classes) + '; strict rows ' + all.strictRows + '; low-resolution rows ' + all.lowResolutionRows);
  assert.equal(all.notNeutral, 0, 'the taps changed what the engine computed');
  assert.equal(ledger.failureCount(all), 0, 'household FAIL rows: ' + JSON.stringify(all.failures.slice(0, 3)));
  assert.equal(all.l4Mismatches, 0);
  assert.ok(all.strictRows > 1000, 'CONTROL: rows that must close exactly were checked: ' + all.strictRows);
});

// ---------------------------------------------------------------------------
// Section 10: each identity red on the other's blind spot
// ---------------------------------------------------------------------------

test('6.3: dropping an income receipt turns the household ledger red while the portfolio identity still balances', () => {
  const plan = household((p) => { Object.assign(p.profile, { endAge: 70 }); p.retirement.pension = 60000; p.retirement.spending = 20000; p.accounts = [account('t', 'taxable', 'taxable', 1000000)]; });
  const clean = ledger.sweepPlan(TAPPED, plan);
  assert.equal(ledger.failureCount(clean), 0, 'CONTROL: the unfaulted engine closes this household');
  const faulted = ledger.sweepPlan(ledger.tappedEngine([FAULTS.dropIncome]), plan);
  assert.ok(ledger.failureCount(faulted) === faulted.rows && faulted.rows === 5, 'every row must fail: ' + JSON.stringify(faulted.classes));
  assert.ok(faulted.failures.every((f) => f.cls === 'FAIL_CASH_UNUSED'), 'as cash received and not used');
  assert.equal(faulted.l4Mismatches, 0, 'while L4 balances -- the blind spot this ledger exists for');
});

test('6.3: duplicating a transfer turns the household ledger red while the portfolio identity still balances', () => {
  const drawing = cb.corpus({ composition: 'expanded' }).filter(({ name }) => /^expansion:other-asset/.test(name));
  assert.ok(drawing.length > 0, 'CONTROL: the expanded corpus has members that draw on other assets');
  const engine = ledger.tappedEngine([FAULTS.duplicateTransfer]);
  const faulted = ledger.combine(drawing.map(({ plan }) => ledger.sweepPlan(engine, plan)));
  const clean = ledger.combine(drawing.map(({ plan }) => ledger.sweepPlan(TAPPED, plan)));
  assert.equal(ledger.failureCount(clean), 0, 'CONTROL: the unfaulted engine closes these households');
  assert.ok(ledger.failureCount(faulted) > 0, 'the double credit must be caught: ' + JSON.stringify(faulted.classes));
  assert.ok(faulted.failures.every((f) => f.cls === 'FAIL_USE_UNFUNDED'), 'as spending funded from nowhere');
  assert.equal(faulted.l4Mismatches, 0, 'while L4 balances');
});

test('6.3: a portfolio valuation error turns L4 red while the household ledger still balances -- the identities are independent', () => {
  const plan = golden.buildScenario(DEFAULT_PLAN, {});
  const faulted = ledger.sweepPlan(ledger.tappedEngine([FAULTS.portfolioValuation]), plan);
  assert.ok(faulted.l4Mismatches > 0, 'L4 must catch unreported growth');
  assert.equal(ledger.failureCount(faulted), 0, 'and the household ledger, which holds no growth term, must not move');
});

test('6.3a: the REAL tests/reconciliation-invariant.test.js goes red on a portfolio valuation error, over golden AND generated scenarios', () => {
  /* The test file itself, not a copy of its logic: a --require hook compiles the
     faulted variant whenever src/engine.js is loaded. */
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'l4-reproof-'));
  const hook = path.join(scratch, 'fault-engine.js');
  fs.writeFileSync(hook, [
    "'use strict';",
    "const Module = require('node:module');",
    "const fs = require('node:fs');",
    'const { injectInto } = require(' + JSON.stringify(path.join(ROOT, 'tests', 'lib', 'engine-variant.js')) + ');',
    'const ENGINE = ' + JSON.stringify(ENGINE_PATH) + ';',
    'const FAULT = ' + JSON.stringify(FAULTS.portfolioValuation) + ';',
    "const js = Module._extensions['.js'];",
    "Module._extensions['.js'] = function (m, filename) {",
    "  if (filename !== ENGINE) return js(m, filename);",
    "  m._compile(injectInto(fs.readFileSync(filename, 'utf8'), [FAULT]), filename);",
    '};',
  ].join('\n'));
  try {
    /* Run the file DIRECTLY, not under --test: the runner executes each file in
       a child process, and a --require given to the runner does not reach it --
       measured, the first version of this test ran the unfaulted engine and
       exited 0. */
    /* Two more things measured on the first attempts. A child spawned from inside
       a test inherits NODE_TEST_CONTEXT and then reports to its parent instead of
       printing TAP, so it is removed. And the golden Monte Carlo test, faulted,
       spends minutes rendering a diff of ~35,000 mismatches, so the run is limited
       to the tests 6.3a names: a golden scenario, the generated sweep, and the
       precondition that must stay green. (Since 2026-09-13 L4 asserts counts, not
       arrays, and fails a faulted engine in seconds -- see its "L4 reporting" test
       and handover D13. The limit is kept on purpose, so the release gate never
       runs the whole L4 file against a faulted engine.) */
    const env = Object.assign({}, process.env);
    delete env.NODE_TEST_CONTEXT;
    const pattern = 'golden "baseline"|seeded sweep of generated scenarios|enabling diagnostics does not change';
    const r = spawnSync(process.execPath, ['--require', hook, '--test-reporter=tap', '--test-name-pattern', pattern, path.join(ROOT, 'tests', 'reconciliation-invariant.test.js')], { encoding: 'utf8', maxBuffer: 1 << 28, env });
    const failed = [...r.stdout.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
    const passed = [...r.stdout.matchAll(/^\s*ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
    assert.ok(passed.some((n) => /enabling diagnostics does not change/.test(n)), 'CONTROL: the run reported TAP and ran its precondition: ' + r.stdout.slice(0, 400) + r.stderr.slice(0, 400));
    assert.notEqual(r.status, 0, 'the faulted run must fail');
    assert.ok(failed.some((n) => /golden "baseline"/.test(n)), 'a golden L4 test must go red: ' + JSON.stringify(failed));
    assert.ok(failed.some((n) => /seeded sweep of generated scenarios/.test(n)), 'the generated sweep must go red: ' + JSON.stringify(failed));
    assert.ok(!failed.some((n) => /enabling diagnostics does not change/.test(n)), 'CONTROL: the fault is in reporting, so what the engine computes is unchanged');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// The instrument's own parts, held directly
// ---------------------------------------------------------------------------

test('section 7: the classes are exhaustive and their bounds are exact', () => {
  const row = (fields) => Object.assign({ age: 50, income: 0, dividends: 0, withdrawals: 0, nonPortfolioDraw: 0, spending: 0, shortfall: 0, taxes: 0, contributions: 0, debtPaymentsTotal: 0, debtPayments: 0 }, fields);
  const obs = (fields) => Object.assign({ employer: 0, outsideDeposit: 0, wages: 0, qcd: 0 }, fields);
  const cls = (r, o) => ledger.ledgerOf(row(r), obs(o)).cls;
  assert.equal(cls({ income: 1000, spending: 1000 }), 'CLOSED');
  assert.equal(cls({ income: 1000, spending: 999.995 }), 'CLOSED', 'within a cent');
  assert.equal(cls({ income: 1000 }, { wages: 1000 }), 'UNALLOCATED_WAGES', 'all of the wages unallocated');
  assert.equal(cls({ income: 1000.5 }, { wages: 1000 }), 'FAIL_CASH_UNUSED', 'fifty cents more than the wages is not explained by them');
  assert.equal(cls({ income: 1000 }), 'FAIL_CASH_UNUSED', 'unused cash with no wages is FM-03');
  assert.equal(cls({ contributions: 500 }), 'UNFUNDED_CONTRIBUTION_OR_DEBT');
  assert.equal(cls({ contributions: 500, taxes: 0.5 }), 'FAIL_USE_UNFUNDED', 'fifty cents beyond the contribution is not explained by it');
  assert.equal(cls({ contributions: 500 }, { employer: 500 }), 'CLOSED', 'employer money is not household cash');
  assert.equal(cls({ debtPaymentsTotal: 600, debtPayments: 0 }), 'UNFUNDED_CONTRIBUTION_OR_DEBT');
  assert.equal(cls({ withdrawals: 5000 }, { qcd: 5000 }), 'CLOSED', 'a QCD is a use');
  assert.equal(cls({ spending: 100, shortfall: 100 }), 'CLOSED', 'unfunded spending is not a use');
  assert.equal(ledger.ledgerOf(row({ income: 1000 }), obs({})).strict, true);
  assert.equal(ledger.ledgerOf(row({ income: 1000 }), obs({ wages: 1 })).strict, false);
});

test('the engine variant refuses a marker that is missing or repeated, so no fault or tap can silently land nowhere', () => {
  const { injectInto } = require('./lib/engine-variant.js');
  assert.equal(injectInto('a;b;', [{ id: 'ok', marker: 'b;', append: 'c;' }]), 'a;b;c;');
  assert.throws(() => injectInto('a;b;', [{ id: 'gone', marker: 'z;', append: 'c;' }]), /occurs 0 times/);
  assert.throws(() => injectInto('b;b;', [{ id: 'twice', marker: 'b;', append: 'c;' }]), /occurs 2 times/);
  ledger.TAPS.concat(Object.values(FAULTS)).forEach((inj) => assert.doesNotThrow(() => injectInto(fs.readFileSync(ENGINE_PATH, 'utf8'), [inj]), inj.id));
});

test('section 9: the per-path runner runs runPlan()\'s own Monte Carlo paths -- a fully swept scenario reproduces its success rate', () => {
  const small = cb.corpus().filter(({ plan }) => plan.assumptions.method === 'monteCarlo' && plan.assumptions.runs <= 50);
  assert.ok(small.length > 0, 'CONTROL: a Monte Carlo corpus scenario small enough to sweep every path');
  for (const { name, plan } of small) {
    const runners = ledger.pathRunners(plan, 50);
    assert.equal(runners.length, plan.assumptions.runs, name + ': every path');
    const results = runners.map((run) => run(realEngine, null));
    const valid = results.filter((r) => r.calculationErrorAge === null || r.calculationErrorAge === undefined);
    const rate = valid.length ? (valid.filter((r) => !r.failed).length / valid.length) * 100 : null;
    const reported = realEngine.runPlan(clone(plan)).successRate;
    assert.ok(Math.abs(rate - reported) < 1e-9, name + ': swept paths give ' + rate + '%, runPlan() reports ' + reported + '%');
  }
});
