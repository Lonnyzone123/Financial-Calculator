/* S5AA, R13 round: THE PROTECTED REQUIRED DISTRIBUTION IS THE ONE THAT IS PAID (external audit of `4e23619`, R12-01).
 *
 * The R12 repair (4492088) holds a drawn obligation's reserve out of the row's return until the distribution is paid.
 * rmdProtectedAmounts() spread that reserve across the obligation's accounts in ACCOUNT-ARRAY order, but the
 * distribution is then paid -- and a QCD before it -- from the same accounts sorted by withdrawalComparator(). Where two
 * IRAs earn different returns, the dollars held out of the return were not the dollars paid out, so wealth depended on
 * the order the accounts happened to be listed in. MEASURED at `4e23619`: one owner, IRA `a` ($10,000, priority 9, -20%)
 * and IRA `b` ($100,000, priority 1, +10%), a $1,000 transfer from `a` to a Roth: listed a,b the pre-tax assets end at
 * $112,843.56; listed b,a at $111,209.90 -- the RMD times the 30-point return gap -- both `ok` with the RMD paid.
 *
 * The reserve is now spread in the same order the distribution is paid: withdrawalComparator(p, priorReturn), the order
 * payQcdFromOwnerIras() and the settlement both use. It depends on each account's priority (or its optimized score),
 * never its balance, and sorting is stable over the same input, so the protected dollars are the paid ones. Every
 * expectation below is computed by hand and must hold in BOTH array orders. Tested through runPlan and the generated Worker.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const acct = (o) => Object.assign({ name: o.id, owner: 'self', basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0,
  annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100 }, o);
const OWED = 110000 / 20.2; // one owner's IRA obligation at 80, both IRAs together
const round = (x) => Math.round(Number(x) * 100) / 100;

/* Each account earns its own return, through its allocation: `up` +10%, `down` -20%, `flat` 0%. */
function planFor({ order, aBalance = 10000, bBalance = 100000, transfer = 1000, conversion = 0, qcd = 0 }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 80, retireAge: 60, endAge: 81, spouseOn: false, spouseAge: 80, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'annual' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [],
    otherIncomes: [], selfLife: 95, spouseLife: 95, survivor: false, dividendOn: false,
    withdrawalOrder: 'manual', manualOrder: 'taxable,hsa,roth,preTax' });
  Object.assign(p.advanced, { rmdOn: true, qcd, healthOn: false, ltcOn: false, otherAssets: [], debts: [], bondTentOn: false, reserveOn: false,
    assetsOn: true, glideOn: false,
    assetClasses: [{ id: 'up', name: 'up', returnRate: 10, volatility: 0 }, { id: 'down', name: 'down', returnRate: -20, volatility: 0 },
      { id: 'flat', name: 'flat', returnRate: 0, volatility: 0 }],
    conversionOn: conversion > 0, conversionAge: 80, conversionAmount: conversion,
    transferOn: transfer > 0, transferAge: 80, transferFrom: 'a', transferTo: 'roth', transferAmount: transfer });
  const byId = {
    a: acct({ id: 'a', type: 'traditionalIRA', taxClass: 'preTax', balance: aBalance, priority: 9, allocation: { down: 100 } }),
    b: acct({ id: 'b', type: 'traditionalIRA', taxClass: 'preTax', balance: bBalance, priority: 1, allocation: { up: 100 } }),
    roth: acct({ id: 'roth', type: 'rothIRA', taxClass: 'roth', balance: 0, priority: 2, allocation: { down: 100 } }),
    cash: acct({ id: 'cash', type: 'taxable', taxClass: 'taxable', basisPct: 100, balance: 100000, priority: 3, allocation: { flat: 100 } }),
  };
  p.accounts = order.map((id) => byId[id]);
  return p;
}
function run(opts) {
  const order = opts.order;
  const r = engine.runPlan(planFor(opts));
  assert.equal(r.status, 'ok', order.join(',') + ': ' + r.status + '/' + r.calculationErrorCode);
  return r.rows[1];
}
const ORDERS = [['a', 'b', 'roth', 'cash'], ['b', 'a', 'roth', 'cash']];
const both = (opts) => ORDERS.map((order) => run(Object.assign({ order }, opts)));

test('R12-01: a transfer from the lower-priority IRA -- the protected dollars are the paid ones, in either array order', () => {
  /* b pays the RMD (priority 1), so b's reserve is held out of b's +10%: (100,000 - 5,445.54) x 1.1 = 104,009.90;
     a keeps 9,000 after the transfer and loses 20%: 7,200. The Roth holds 1,000 x 0.8 = 800. */
  for (const row of both({})) {
    assert.equal(round(row.preTax), round((100000 - OWED) * 1.1 + 9000 * 0.8));
    assert.equal(round(row.roth), 800);
    assert.equal(round(row.rmdDistributed), round(OWED));
    assert.equal(round(row.rmdUnmet), 0);
  }
});

test('R12-01: an automatic conversion, in either array order', () => {
  /* The conversion takes its $1,000 from b, first in the withdrawal order; b's reserve is protected and paid from b:
     (99,000 - 5,445.54) x 1.1 = 102,909.90, and a untouched loses 20%: 8,000. */
  const [x, y] = both({ transfer: 0, conversion: 1000 });
  assert.equal(round(x.preTax), round((99000 - OWED) * 1.1 + 10000 * 0.8));
  assert.equal(round(y.preTax), round(x.preTax));
  assert.equal(round(x.taxes), round(y.taxes), 'and the tax is the same');
});

test('R12-01: an eligible QCD is paid from the protected dollars too, in either array order', () => {
  /* A $2,000 QCD comes first, from b, and is credited against the obligation; the rest of the RMD is paid from b.
     Between them they are the whole reserve, so the balances are as in the first case. */
  for (const row of both({ qcd: 2000 })) {
    assert.equal(round(row.preTax), round((100000 - OWED) * 1.1 + 9000 * 0.8));
    assert.equal(round(row.rmdDistributed), round(OWED), 'the QCD counts toward the distribution');
    assert.equal(round(row.rmdUnmet), 0);
  }
});

test('R12-01: when the first source cannot cover the reserve, the protection spills to the next, as the payment does', () => {
  /* b holds only $3,000: all of it is protected and paid; the other 2,445.54 is protected in a and paid from a.
     a: (107,000 - 1,000 - 2,445.54) x 0.8 = 82,843.56; b ends empty. */
  for (const row of both({ aBalance: 107000, bBalance: 3000 })) {
    assert.equal(round(row.preTax), round((106000 - (OWED - 3000)) * 0.8));
    assert.equal(round(row.rmdUnmet), 0);
  }
});

/* The same witness through the GENERATED WORKER -- the engine the browser actually runs, built from the shipped shell --
   in both array orders. */
const { liveWorkerSource, postToWorker, cleanup } = require('./lib/worker-source.js');
test.after(() => cleanup());
test('R12-01: the generated Worker agrees, in both array orders', async () => {
  const source = await liveWorkerSource();
  for (const order of ORDERS) {
    const message = postToWorker(source, planFor({ order }));
    assert.ok(!message.error, message.error);
    assert.equal(message.result.status, 'ok');
    assert.equal(round(message.result.rows[1].preTax), round((100000 - OWED) * 1.1 + 9000 * 0.8), order.join(','));
    assert.deepEqual(message.result.rows, engine.runPlan(planFor({ order })).rows, 'row for row, the direct engine');
  }
});
