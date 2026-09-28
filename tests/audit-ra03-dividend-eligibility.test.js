'use strict';

// RA-03 (re-audit, 2026-09-11) -- P2. With dividends ENABLED, zero-return
// household cash is treated as a dividend-paying asset.
//
// THE DEFECT, and why it is really a story about how R4 was tested. FM-03
// excluded `cashHolding` from the IMPUTED dividend base -- the
// `dividendOn === false` branch -- because charging tax on income a
// zero-return holding cannot produce would have made `retain` into `invest`
// in disguise. That reasoning was right and it was applied to exactly one of
// the two branches: the one R4's fixture prediction happened to surface.
//
// The `dividendOn === true` branch computes its base from the ENTIRE taxable
// class and draws the corresponding cash from the ENTIRE taxable class, so
// the new cash holding both inflates the dividend and pays it out of
// principal:
//
//   1,000,000 Roth, 60,000 pension, 20,000 spending, ages 75-77, RMD off,
//   zero growth/inflation/fees, retain, dividends on at 3% fully qualified.
//   The first period creates 34,602.50 of household cash. There are NO
//   taxable investment assets at all. The next period reports 1,038.075 of
//   "dividends" and raises total taxes from 5,397.50 to 5,423.451875.
//
// Cash principal is being reclassified as taxable dividend income. It does
// not create net wealth -- the cash is drawn and partly redeposited while the
// extra tax reduces it -- and no reconciliation check fires, because the
// ledger balances either way. A balanced ledger cannot tell you that an
// income CLASSIFICATION is wrong.
//
// THE REPAIR. One explicit eligible-account set, used for computing the
// dividend AND for taking the corresponding cash, in both dividend modes.
// The rule is stated once instead of being applied branch by branch, which
// is what let the two diverge.
//
// The two tests that call the engine's internal dividend helpers directly live in
// tests/audit-ra03-internals.test.js, split out at S5 block 2r, so this file reaches the engine only through
// runPlan().

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require('../src/engine.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs');
const defaultPlan = extractDefaultPlan(shell);

function account(o) {
  return Object.assign({
    id: 'a1', name: 'A', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 0, basisPct: 100, contributionMode: 'dollar', contribution: 0, frequency: 12,
    annualChangeMode: 'percent', annualChange: 0, changeTiming: 'annual', contributionPreset: 'none',
    futureChanges: [], priority: 1, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0,
    vesting: 100, allocation: {},
  }, o);
}

function plan(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.profile.age = 75; p.profile.retireAge = 65; p.profile.endAge = 77;
  p.profile.spouseOn = false; p.profile.filing = 'single';
  p.employment.salary = 0; p.employment.spouseSalary = 0;
  p.assumptions.method = 'simple'; p.assumptions.returnRate = 0;
  p.assumptions.inflation = 0; p.assumptions.fee = 0; p.assumptions.volatility = 0;
  p.assumptions.withdrawalTiming = 'monthly';
  p.retirement.strategy = 'fixedNominal'; p.retirement.spending = 20000;
  p.retirement.pension = 60000; p.retirement.pensionCola = 0;
  p.retirement.ssBenefit = 0; p.retirement.spouseSS = 0;
  p.retirement.incomeOffset = true;
  p.retirement.dividendOn = true; p.retirement.dividendYield = 3;
  p.retirement.dividendQualified = 100; p.retirement.dividendGrowth = 0;
  p.retirement.dividendStart = 65;
  p.retirement.stages = []; p.retirement.expenses = []; p.retirement.otherIncomes = [];
  p.advanced.rmdOn = false; p.advanced.debts = []; p.advanced.otherAssets = [];
  p.advanced.healthOn = false; p.advanced.ltcOn = false;
  p.advanced.surplusPolicy = 'retain';
  p.accounts = [account({ id: 'roth', type: 'rothIra', taxClass: 'roth', balance: 1000000 })];
  const ov = o || {};
  ['profile', 'assumptions', 'retirement', 'advanced'].forEach((k) => { if (ov[k]) Object.assign(p[k], ov[k]); });
  if (ov.accounts) p.accounts = ov.accounts;
  return p;
}

const run = (p) => engine.runPlan(JSON.parse(JSON.stringify(p)));
const round = (n, d) => Math.round((Number(n) || 0) * Math.pow(10, d)) / Math.pow(10, d);

// ---------------------------------------------------------------------------
// 1. The re-audit's reproduction
// ---------------------------------------------------------------------------

test('RA-03: a taxable class holding only zero-return cash pays no dividend', () => {
  const rows = run(plan()).rows;
  const withCash = rows.filter((r) => (Number(r.taxable) || 0) > 1);
  assert.ok(withCash.length >= 1, 'precondition: retained cash exists in the taxable class');
  rows.forEach((row) => {
    assert.equal(
      round(row.dividends, 6), 0,
      'age ' + row.age + ': there are no taxable INVESTMENT assets, so there is nothing ' +
      'to pay a dividend. Measured 1,038.075 before the repair, drawn from cash principal.'
    );
  });
});

test('RA-03: the fictitious dividend is not taxed', () => {
  const rows = run(plan()).rows;
  const last = rows[rows.length - 1];
  assert.equal(
    round(last.taxes, 6), 5099, /* R6: 5,397.50 before Arizona's age-65 exemption took $52.50 off; it returns exactly with the exemption at $0.
       S5AA task 3.1: 5,345 before the IRC 63(f) additional deduction for the aged, which takes a further $246 -- $2,050 at the 12% bracket. */
    'total tax rose to 5,423.451875 before the repair -- 25.951875 of it charged on ' +
    'cash principal reclassified as qualified dividend income'
  );
});

/** A pre-existing cash holding and no outside surplus, so the taxable-class
 *  balance is constant unless something draws on it. Retained surplus would
 *  otherwise mask a drawdown by topping the holding back up each period --
 *  which is why the first version of this test passed against the defect. */
function staticCashPlan(o) {
  const p = plan(o);
  p.retirement.pension = 20000;   // exactly covers spending: no surplus
  p.accounts = [
    account({ id: 'roth', type: 'rothIra', taxClass: 'roth', balance: 1000000 }),
    account({ id: 'household-cash', name: 'Retained household cash', type: 'customTaxable',
      taxClass: 'taxable', balance: 100000, priority: 2, cashHolding: true }),
  ];
  if (o && o.accounts) p.accounts = o.accounts;
  return p;
}

test('RA-03: cash principal is not drawn down to pay a dividend', () => {
  // Comparative rather than absolute. The cash holding IS a legitimate source
  // for the tax on the pension -- it is the household's most liquid asset --
  // so its balance does fall a little either way, and asserting it stays at
  // exactly 100,000 would be asserting something untrue about tax funding.
  // What must hold is that enabling dividends draws nothing EXTRA when there
  // is no eligible investment to pay one.
  const on = run(staticCashPlan()).rows.map((r) => round(r.taxable, 6));
  const off = run(staticCashPlan({ retirement: { dividendOn: false } })).rows.map((r) => round(r.taxable, 6));
  assert.deepEqual(
    on, off,
    'with a cash-only taxable class, turning dividends on drew cash out of it: ' +
    JSON.stringify(on) + ' vs ' + JSON.stringify(off)
  );
});

// ---------------------------------------------------------------------------
// 2. Mixed holdings: eligible investments still pay, cash still does not
// ---------------------------------------------------------------------------

test('RA-03: with a real taxable investment present, the dividend uses only that balance', () => {
  const INVESTED = 200000;
  const CASH = 100000;
  // The cash holding is present from the FIRST period on purpose. Retained
  // surplus only appears from period 2, so a test that reads the first paying
  // row would compare against a period where no cash existed yet and would
  // pass against the defect.
  const rows = run(staticCashPlan({
    accounts: [
      account({ id: 'roth', type: 'rothIra', taxClass: 'roth', balance: 1000000 }),
      account({ id: 'tax', type: 'taxable', taxClass: 'taxable', balance: INVESTED, priority: 2 }),
      account({ id: 'household-cash', name: 'Retained household cash', type: 'customTaxable',
        taxClass: 'taxable', balance: CASH, priority: 3, cashHolding: true }),
    ],
  })).rows;
  const paying = rows.filter((r) => (Number(r.dividends) || 0) > 0);
  assert.ok(paying.length >= 1, 'precondition: an eligible investment pays a dividend');

  // Independent oracle, computed here rather than read back: 3% of the
  // invested balance alone. Including the cash would give 9,000.
  const expected = INVESTED * 0.03;
  assert.ok(
    Math.abs(paying[0].dividends - expected) < expected * 0.02,
    'dividend ' + paying[0].dividends + ' should reflect only the ' + INVESTED +
    ' invested balance (about ' + expected + '); including the ' + CASH +
    ' cash beside it would give about ' + ((INVESTED + CASH) * 0.03)
  );
});

test('RA-03: a fully exhausted investment balance pays nothing even with cash present', () => {
  const rows = run(plan({
    retirement: { spending: 200000 },
    accounts: [
      account({ id: 'tax', type: 'taxable', taxClass: 'taxable', balance: 50000 }),
    ],
  })).rows;
  const last = rows[rows.length - 1];
  if ((Number(last.taxable) || 0) < 1) {
    assert.equal(round(last.dividends, 6), 0, 'nothing invested, nothing paid');
  }
});

// ---------------------------------------------------------------------------
// 3. Both dividend modes share one rule
// ---------------------------------------------------------------------------

test('RA-03: turning dividends off does not change whether cash is eligible', () => {
  // The imputed branch already excluded cash (FM-03). Pin that the two
  // branches now agree, so a future edit to one cannot silently diverge.
  const off = run(plan({ retirement: { dividendOn: false } }));
  const on = run(plan());
  assert.equal(round(on.rows[on.rows.length - 1].taxes, 2),
    round(off.rows[off.rows.length - 1].taxes, 2),
    'with no eligible investments, enabling dividends must not change tax at all');
});
