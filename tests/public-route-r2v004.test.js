/* R2V-004 through the public entry point: S5 block 2r's rebuild-proof guard.
 *
 * findingIds: R2V-004
 *
 * A withdrawal class listed more than once is drawn on only once. Each year the
 * engine first withdraws what the household spends, then works out the tax on
 * those withdrawals and how much more to sell to pay it, visiting the classes in
 * the withdrawal order. That quote re-reads account balances, so it keeps its own
 * running tally of what each account or pooled class still holds. Without the
 * tally, a class visited a second time was quoted against its full balance
 * again, the same dollars appeared to fund the tax twice, and settling the quote
 * against the real balances failed. With it, repeating a class changes nothing:
 * the rows are exactly those of the order with the repeat removed.
 *
 * Reachability: programmatic. The validator refuses a repeated manual withdrawal
 * class, but runPlan() does not validate, so a caller that has not validated
 * reaches this path.
 *
 * The existing guard (tests/audit-r2-tax-quote.test.js) calls the engine's
 * internal quote functions directly, so a rebuild that renamed them would leave
 * the behaviour unguarded. This file reaches it only through runPlan(). Each
 * household is retired at 66, spends $80,000 a year with zero returns and
 * inflation, and holds a large account in the class that is not repeated. The
 * repeated class holds just over a year's spending, so after the spending
 * withdrawal only a sliver is left when the tax is quoted.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const account = (fields) => Object.assign({
  name: fields.id, owner: 'self', contribution: 0, contributionMode: 'amount', annualChange: 0,
  annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {},
  matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
}, fields);

function plan(order, taxableBalance, preTaxBalance, basisPct) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'annual' });
  Object.assign(p.profile, { age: 66, retireAge: 66, endAge: 70 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: 66 });
  p.accounts = [
    account({ id: 't1', type: 'taxable', taxClass: 'taxable', balance: taxableBalance, priority: 1, basisPct }),
    account({ id: 'p1', type: 'traditionalIRA', taxClass: 'preTax', balance: preTaxBalance, priority: 2, basisPct: 0 }),
  ];
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  p.retirement.otherIncomes = [];
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 80000, pension: 0, ssBenefit: 0, spouseSS: 0,
    withdrawalOrder: 'manual', manualOrder: order,
  });
  return p;
}

/* A repeated order must give exactly the run of the same order with the repeat removed. */
function assertRepeatChangesNothing(repeated, once, taxableBalance, preTaxBalance, basisPct, what) {
  const a = engine.runPlan(plan(repeated, taxableBalance, preTaxBalance, basisPct));
  const b = engine.runPlan(plan(once, taxableBalance, preTaxBalance, basisPct));
  assert.equal(b.status, 'ok', what + ': the order without the repeat runs');
  assert.equal(a.status, 'ok', what + ': the repeated order runs, got ' + a.status + ' ' + a.calculationErrorCode);
  assert.deepEqual(a.rows, b.rows, what + ': the repeated order gives the same rows');
}

test('R2V-004 (runPlan): a taxable account repeated in the order is drawn on only once', () => {
  assertRepeatChangesNothing('taxable,taxable,preTax', 'taxable,preTax', 80100, 500000, 50, 'a half-basis taxable account listed twice');
});

test('R2V-004 (runPlan): a fully taxable sale repeated in the order is drawn on only once', () => {
  assertRepeatChangesNothing('taxable,taxable,preTax', 'taxable,preTax', 81000, 500000, 0, 'a zero-basis taxable account listed twice');
});

test('R2V-004 (runPlan): a pooled pretax class repeated in the order is drawn on only once', () => {
  assertRepeatChangesNothing('preTax,preTax,taxable', 'preTax,taxable', 500000, 81000, 50, 'a pretax class listed twice');
});

test('R2V-004 (runPlan): when the first visit already covers the tax, a repeat never comes into play', () => {
  assertRepeatChangesNothing('taxable,taxable,preTax', 'taxable,preTax', 85000, 500000, 50, 'a taxable account with room to spare, listed twice');
});
