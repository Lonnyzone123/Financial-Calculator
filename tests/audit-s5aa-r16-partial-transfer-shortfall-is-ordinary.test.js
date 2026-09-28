/* S5AA, R16 round: A PARTIAL DISTRIBUTION TO TAXABLE MAKES NO RESERVATION PROMISE (external re-audit of `1b932e0`,
 * R15-01 -- a regression of my R15 repair of R14-01).
 *
 * RMD_NOT_DISTRIBUTED is scoped to a DEFEATED RESERVATION: a conversion or transfer drew on the capacity above an
 * obligation, the reserve was held out of the row's return, and the obligation was still not paid. An ordinary shortfall
 * -- an account that simply has less than it owes after a deep loss -- is reported on the row as rmdUnmet and the result
 * stays valid. The check read `conversion > 0 || transferTaxable > 0`. Until R15 every pre-tax transfer drew on the
 * capacity, so that was the promise. Since R15 a transfer to TAXABLE that stays within its obligation's reserve is
 * credited against it and draws on nothing, and the unpaid rest stays invested like any obligation no conversion
 * touched -- but the check still invalidated it. MEASURED at `1b932e0`: one owner at 95 (divisor 8.9, owed
 * 11,235.96), a $100,000 IRA, a -95% year (the engine's floor). No transfer: `ok`, 5,000 paid, 6,235.96 unmet. $2,000
 * to cash: calculation_error, no row, 6,900 distributed and 4,335.96 unmet in the issue. $10,000: `ok`, paid in full.
 *
 * Now a transfer is part of the promise only when it drew on the capacity ABOVE its credit (a conversion always is).
 * Everything the R14 check invalidated is still invalidated, except the partial distribution to taxable. Every
 * expectation below is computed by hand.
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
const validator = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const OWED = 100000 / 8.9; // a $100,000 account's obligation at 95
const round = (x) => Math.round(Number(x) * 100) / 100;
const near = (actual, expected, label) => assert.equal(round(actual), round(expected), label);
const acct = (o) => Object.assign({ name: 'account', owner: 'self', basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0,
  annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100 }, o);
const IRA = { id: 'ira', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000, priority: 1 };
const K401 = { id: 'k401', type: 'traditional401k', taxClass: 'preTax', balance: 100000, priority: 4 };
const ROTH = { id: 'roth', type: 'rothIRA', taxClass: 'roth', balance: 0, priority: 3 };
const CASH = { id: 'cash', type: 'taxable', taxClass: 'taxable', basisPct: 100, balance: 100000, priority: 2 };

/* One owner, 95 to 96, one row; every account earns `returnRate`; nothing spent or earned. */
function planFor({ transfer = 0, to = 'cash', conversion = 0, returnRate = -95, accounts = [IRA, CASH] }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 95, retireAge: 60, endAge: 96, spouseOn: false, spouseAge: 95, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'annual' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [],
    otherIncomes: [], selfLife: 99, spouseLife: 99, survivor: false, dividendOn: false, withdrawalOrder: 'manual', manualOrder: 'taxable,hsa,roth,preTax' });
  Object.assign(p.advanced, { rmdOn: true, qcd: 0, healthOn: false, ltcOn: false, debts: [], otherAssets: [], bondTentOn: false,
    reserveOn: false, glideOn: false, assetsOn: false, conversionOn: conversion > 0, conversionAge: 95, conversionAmount: conversion,
    transferOn: transfer > 0, transferAge: 95, transferFrom: 'ira', transferTo: to, transferAmount: transfer });
  p.accounts = accounts.map((a) => acct(a));
  return p;
}
function run(opts) {
  const p = planFor(opts);
  assert.equal(validator.validateScenario(JSON.parse(JSON.stringify(p))).valid, true, JSON.stringify(opts) + ' is a valid plan');
  return engine.runPlan(p);
}
const okRow = (opts) => {
  const r = run(opts);
  assert.equal(r.status, 'ok', JSON.stringify(opts) + ': ' + r.status + '/' + r.calculationErrorCode);
  return r.rows[1];
};
const refused = (opts) => {
  const r = run(opts);
  assert.equal(r.status, 'calculation_error', JSON.stringify(opts) + ' must be invalidated');
  assert.equal(r.calculationErrorCode, 'RMD_NOT_DISTRIBUTED');
  return r.issues.find((i) => i.code === 'RMD_NOT_DISTRIBUTED').state;
};

test('R15-01: the witness at -95% -- no transfer, a partial one and a covering one all return their row', () => {
  const none = okRow({});
  near(none.rmdDistributed, 5000, 'no transfer: the 5,000 a 95% loss leaves');
  near(none.rmdUnmet, OWED - 5000);
  /* $2,000 counts; the $98,000 left loses 95% and pays its 4,900; 11,235.96 - 6,900 is unmet. */
  const partial = okRow({ transfer: 2000 });
  near(partial.rmdDistributed, 2000 + 98000 * 0.05, 'a partial transfer: an ordinary shortfall, reported on the row');
  near(partial.rmdUnmet, OWED - 6900);
  near(partial.preTax, 0);
  const covering = okRow({ transfer: 10000 });
  near(covering.rmdDistributed, OWED);
  near(covering.rmdUnmet, 0);
});

test('R15-01: a partial transfer under a modest loss still pays the rest in full', () => {
  /* -10%: the $98,000 left is worth 88,200 when the other 9,235.96 is paid. */
  const row = okRow({ transfer: 2000, returnRate: -10 });
  near(row.rmdUnmet, 0);
  near(row.rmdDistributed, OWED);
  near(row.preTax, 98000 * 0.9 - (OWED - 2000));
});

test('R15-01: a partial transfer, then a conversion -- the conversion draws, so the rest IS protected, and paid', () => {
  /* The transfer's 2,000 counts; the conversion takes 50,000 of the capacity above the reserve, so the other 9,235.96
     is held out of the -95% and paid in full. What is neither converted nor reserved -- 100,000 - 2,000 - 50,000 -
     9,235.96 -- loses 95%. */
  const row = okRow({ transfer: 2000, conversion: 50000, accounts: [IRA, ROTH, CASH] });
  near(row.rmdUnmet, 0);
  near(row.rmdDistributed, OWED);
  near(row.preTax, (100000 - 2000 - 50000 - (OWED - 2000)) * 0.05);
  near(row.roth, 50000 * 0.05);
});

test('R15-01: the defeated-promise error is still reachable, exactly where R14 raised it', () => {
  /* A 401(k) of $100,000 that nothing draws on owes its own 11,235.96 and, at -95%, can pay 5,000 of it.
     RE-FIXTURED BY INTENT at the R17 round (the owner's decision Q1-B, 2026-09-22; external re-audit of dcd7247, R16-01): this
     asserted that the 401(k)'s shortfall invalidated the result beside a conversion, a pre-tax to Roth transfer, or a
     transfer to taxable larger than its own obligation -- the ROW-WIDE rule. The promise is now per obligation: each of
     those moves protects the IRA's obligation, which is paid in full, and promised nothing for the 401(k), whose
     shortfall is ordinary and stays on the row. The defeated promise itself is still refused -- shown, with the protection
     switched off, in tests/audit-s5aa-r17-rmd-shortfall-per-obligation.test.js. */
  const withK = [IRA, K401, ROTH, CASH];
  for (const opts of [{ conversion: 50000 }, { transfer: 50000, to: 'roth' }, { transfer: 20000 }]) {
    const row = okRow(Object.assign({ accounts: withK }, opts));
    near(row.rmdUnmet, OWED - 5000, JSON.stringify(opts) + ': the 401(k) is short by what the loss took, on the row');
    near(row.rmdDistributed, OWED + 5000, JSON.stringify(opts) + ': the IRA paid in full, the 401(k) what it had');
  }
  /* A transfer to taxable WITHIN its own obligation promised nothing, so both shortfalls are ordinary. */
  const row = okRow({ transfer: 2000, accounts: withK });
  near(row.rmdUnmet, (OWED - 6900) + (OWED - 5000), 'both obligations are short, on the row');
});

const { liveWorkerSource, postToWorker, cleanup } = require('./lib/worker-source.js');
test.after(() => cleanup());
test('R15-01: the generated Worker returns the row too', async () => {
  const source = await liveWorkerSource();
  const message = postToWorker(source, planFor({ transfer: 2000 }));
  assert.ok(!message.error, message.error);
  assert.equal(message.result.status, 'ok');
  near(message.result.rows[1].rmdUnmet, OWED - 6900);
  assert.deepEqual(message.result.rows, engine.runPlan(planFor({ transfer: 2000 })).rows, 'row for row, the direct engine');
});
