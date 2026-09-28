'use strict';

// Q22 (found 2026-09-11 by adversarially inspecting the re-audit) -- retained
// cash was drawn LAST, so the engine sold growing assets while idle cash sat.
//
// HOW IT WAS FOUND, because that matters more than the bug. RA-02's whole
// theory is that FM-03 introduced a new KIND of entity and that every site
// reasoning about the category it joined has to be re-checked. The re-audit
// applied that theory to growth (RA-02) and dividends (RA-03) and stopped.
// Withdrawal ordering is the third site, and nobody had looked at it.
//
// THE DEFECT. retainExcessRmdCash() creates the household cash holding with
// `priority: max(existing) + 1` -- last in its tax class. That line exists to
// give a synthesized account a unique sort key; it was never a spending
// policy. But withdrawFromClass() sorts by priority, so it exhausts every
// invested taxable account before touching the cash.
//
// The cost is doubled and it compounds. Measured with 100,000 invested at 40%
// basis beside 100,000 of retained cash at 100% basis, drawing 50,000:
//
//     as shipped (cash last)     30,000.00 of realised capital gains
//     cash reachable first            0.00
//
// and the account earning the market return is the one sold, while the
// zero-return holding is preserved. A 100%-basis, zero-return holding is
// strictly the best thing to spend first, on both axes.
//
// USER DECISION 2026-09-11: "spend the cash first but changeable by preset."
//
//     advanced.retainedCashOrder   'first' (DEFAULT) | 'last'
//
// `last` reproduces the prior behaviour exactly, for a household that wants
// the holding preserved as a buffer.
//
// WHY THE COMPARATOR IS EXTRACTED. Three sites duplicated the same filter+sort
// by hand: orderedAccountsInClass() (what quoteTaxFunding QUOTES against),
// nextWithdrawAccount(), and withdrawFromClass() (what actually SELLS). The
// comment on the first says the quote order is "guaranteed identical" to the
// withdrawal order -- guaranteed by three copies staying in step. Applying a
// new ordering rule to one and not the others would make the tax quote price
// a different sale than the one executed, which is the R2-001 defect class
// this codebase has already been bitten by. One comparator, three callers.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require('../src/engine.js');
const validator = require('../src/scenario-validator.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs');
const defaultPlan = extractDefaultPlan(shell);

function account(o) {
  return Object.assign({
    id: 'a', name: 'A', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 0, basisPct: 100, contributionMode: 'dollar', contribution: 0, frequency: 12,
    annualChangeMode: 'percent', annualChange: 0, changeTiming: 'annual', contributionPreset: 'none',
    futureChanges: [], priority: 1, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0,
    vesting: 100, allocation: {},
  }, o);
}

/** Long-held stock at 40% basis beside retained cash at 100% basis. */
function holdings() {
  return [
    account({ id: 'stocks', balance: 100000, basisPct: 40, priority: 1 }),
    account({ id: 'household-cash', name: 'Retained household cash', type: 'customTaxable',
      balance: 100000, basisPct: 100, priority: 2, cashHolding: true }),
  ];
}

function ctx(o) {
  const p = {
    profile: { age: 70, retireAge: 65, filing: 'single' },
    assumptions: { method: 'simple', returnRate: 10, fee: 0, inflation: 0, volatility: 0 },
    advanced: {},
    retirement: { withdrawalOrder: 'manual' },
  };
  if (o && o.advanced) Object.assign(p.advanced, o.advanced);
  if (o && o.retirement) Object.assign(p.retirement, o.retirement);
  return p;
}

// ---------------------------------------------------------------------------
// 1. The default: spend the cash first
// ---------------------------------------------------------------------------

test('Q22: retained cash is spent before invested assets by default', () => {
  const accounts = holdings();
  engine.withdrawFromClass(accounts, 'taxable', 50000, 70, ctx(), 0.1);
  assert.equal(accounts.find((a) => a.id === 'household-cash').balance, 50000,
    'the zero-return cash holding must be drawn first');
  assert.equal(accounts.find((a) => a.id === 'stocks').balance, 100000,
    'the asset earning the market return must not be sold while idle cash remains');
});

test('Q22: spending cash first realises no unnecessary capital gains', () => {
  const drawn = engine.withdrawFromClass(holdings(), 'taxable', 50000, 70, ctx(), 0.1);
  assert.equal(drawn.gains, 0,
    'cash is 100% basis; 30,000.00 of gains were realised before this repair');
});

test('Q22: once cash is exhausted the invested account is used, in priority order', () => {
  const accounts = holdings();
  const drawn = engine.withdrawFromClass(accounts, 'taxable', 150000, 70, ctx(), 0.1);
  assert.equal(drawn.amount, 150000);
  assert.equal(accounts.find((a) => a.id === 'household-cash').balance, 0);
  assert.equal(accounts.find((a) => a.id === 'stocks').balance, 50000);
  assert.equal(drawn.gains, 50000 * 0.6, 'gains only on the part that had to come from stock');
});

// ---------------------------------------------------------------------------
// 2. The preset restores the old behaviour exactly
// ---------------------------------------------------------------------------

test('Q22: retainedCashOrder "last" reproduces the pre-repair behaviour', () => {
  const accounts = holdings();
  const drawn = engine.withdrawFromClass(accounts, 'taxable', 50000, 70,
    ctx({ advanced: { retainedCashOrder: 'last' } }), 0.1);
  assert.equal(accounts.find((a) => a.id === 'stocks').balance, 50000);
  assert.equal(accounts.find((a) => a.id === 'household-cash').balance, 100000);
  assert.equal(drawn.gains, 30000, 'the measured pre-repair figure');
});

test('Q22: an unrecognised value falls back to the default rather than to the old behaviour', () => {
  const accounts = holdings();
  engine.withdrawFromClass(accounts, 'taxable', 50000, 70,
    ctx({ advanced: { retainedCashOrder: 'LAST' } }), 0.1);
  assert.equal(accounts.find((a) => a.id === 'household-cash').balance, 50000,
    'only the exact string "last" selects the buffer behaviour');
});

// ---------------------------------------------------------------------------
// 3. Ordering among NON-cash accounts is untouched
// ---------------------------------------------------------------------------

test('Q22: priority order among ordinary accounts is unaffected', () => {
  const accounts = [
    account({ id: 'third', balance: 1000, priority: 3 }),
    account({ id: 'first', balance: 1000, priority: 1 }),
    account({ id: 'second', balance: 1000, priority: 2 }),
  ];
  const ordered = engine.orderedAccountsInClass(accounts, 'taxable', ctx(), 0.1);
  assert.deepEqual(ordered.map((a) => a.id), ['first', 'second', 'third']);
});

// ---------------------------------------------------------------------------
// 4. The three sort sites must not diverge -- the real risk in this change
// ---------------------------------------------------------------------------

const DIVERGENCE_CASES = [];
['first', 'last', undefined].forEach((retainedCashOrder) => {
  ['manual', 'optimized'].forEach((withdrawalOrder) => {
    DIVERGENCE_CASES.push({ retainedCashOrder, withdrawalOrder });
  });
});

DIVERGENCE_CASES.forEach((c) => {
  const label = 'retainedCashOrder=' + String(c.retainedCashOrder) +
    ', withdrawalOrder=' + c.withdrawalOrder;
  test('Q22: quote order, nextWithdrawAccount and the actual sale agree -- ' + label, () => {
    const p = ctx({
      advanced: c.retainedCashOrder === undefined ? {} : { retainedCashOrder: c.retainedCashOrder },
      retirement: { withdrawalOrder: c.withdrawalOrder },
    });
    const quoted = engine.orderedAccountsInClass(holdings(), 'taxable', p, 0.1).map((a) => a.id);

    // What the real withdrawal actually touches, in the order it touches it.
    const accounts = holdings();
    const sold = engine.withdrawFromClass(accounts, 'taxable', 200000, 70, p, 0.1)
      .sources.map((a) => a.id);
    assert.deepEqual(sold, quoted,
      label + ': quoteTaxFunding would price a different sale than the one executed');

    assert.equal(
      engine.nextWithdrawAccount(holdings(), 'taxable', p, 0.1).id, quoted[0],
      label + ': nextWithdrawAccount disagrees with the quoted order'
    );
  });
});

// ---------------------------------------------------------------------------
// 5. End to end, and the field is validated
// ---------------------------------------------------------------------------

test('Q22: a projection holding retained cash stops selling stock to fund spending', () => {
  function plan(retainedCashOrder) {
    const p = JSON.parse(JSON.stringify(defaultPlan));
    p.profile.age = 75; p.profile.retireAge = 65; p.profile.endAge = 79;
    p.profile.spouseOn = false; p.profile.filing = 'single';
    p.employment.salary = 0; p.employment.spouseSalary = 0;
    p.assumptions.method = 'simple'; p.assumptions.returnRate = 8;
    p.assumptions.inflation = 0; p.assumptions.fee = 0; p.assumptions.volatility = 0;
    p.retirement.strategy = 'fixedNominal'; p.retirement.spending = 80000;
    p.retirement.pension = 90000; p.retirement.pensionCola = 0;
    p.retirement.ssBenefit = 0; p.retirement.spouseSS = 0;
    p.retirement.dividendOn = false; p.retirement.incomeOffset = true;
    p.retirement.withdrawalOrder = 'manual';
    p.retirement.manualOrder = 'taxable,preTax,roth,hsa';
    p.retirement.stages = []; p.retirement.expenses = []; p.retirement.otherIncomes = [];
    p.advanced.rmdOn = false; p.advanced.debts = []; p.advanced.otherAssets = [];
    p.advanced.healthOn = false; p.advanced.ltcOn = false;
    p.advanced.surplusPolicy = 'retain';
    if (retainedCashOrder) p.advanced.retainedCashOrder = retainedCashOrder;
    p.accounts = [account({ id: 'stocks', balance: 400000, basisPct: 40, priority: 1 })];
    return p;
  }
  const first = engine.runPlan(plan());
  const last = engine.runPlan(plan('last'));
  const lifetime = (r) => Number(r.lifetimeTaxes) || 0;
  const ending = (r) => Number(r.rows[r.rows.length - 1].total) || 0;

  assert.equal(first.calculationError || false, false);
  assert.equal(last.calculationError || false, false);
  assert.ok(
    ending(first) >= ending(last) - 0.01,
    'spending the zero-return holding first must never leave the household worse off: ' +
    ending(first).toFixed(2) + ' vs ' + ending(last).toFixed(2)
  );
  assert.ok(
    lifetime(first) <= lifetime(last) + 0.01,
    'and it must not raise lifetime taxes: ' +
    lifetime(first).toFixed(2) + ' vs ' + lifetime(last).toFixed(2)
  );
});

test('Q22: retainedCashOrder is validated, never coerced', () => {
  const withValue = (v) => {
    const p = JSON.parse(JSON.stringify(defaultPlan));
    p.advanced.retainedCashOrder = v;
    return validator.validateScenario(p).issues.filter((i) => /retainedCashOrder/.test(i.path || ''));
  };
  assert.deepEqual(withValue('first'), []);
  assert.deepEqual(withValue('last'), []);
  assert.equal(withValue('LAST').length, 1, 'a near-miss string must be reported, not silently ignored');
  assert.equal(withValue(true).length, 1, 'a non-string must be reported');

  const absent = JSON.parse(JSON.stringify(defaultPlan));
  delete absent.advanced.retainedCashOrder;
  assert.deepEqual(
    validator.validateScenario(absent).issues.filter((i) => /retainedCashOrder/.test(i.path || '')),
    [], 'absence stays legal and migrates to the default'
  );
});
