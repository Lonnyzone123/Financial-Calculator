/* S5AA, R17 round: AN RMD SHORTFALL IS AN ERROR ONLY IN THE OBLIGATION THAT WAS PROMISED (external re-audit of
 * `dcd7247`, R16-01; the owner's decision Q1-B, 2026-09-22, on the auditor's recommendation).
 *
 * RMD_NOT_DISTRIBUTED is for a DEFEATED PROMISE: a conversion or transfer drew on the capacity above an obligation, that
 * obligation's reserve was held out of the row's return, and it still ended short. The rule was ROW-WIDE -- any
 * shortfall in the row was refused once any conversion, or any transfer that drew capacity, happened anywhere in it.
 * R16-01: a move from an account that OWES NOTHING draws capacity and protects nothing, yet invalidated another owner's
 * ordinary shortfall. MEASURED at `dcd7247`, self 95 with a $100,000 IRA (owes 11,235.96; a -95% year leaves 5,000) and
 * a spouse of 60 with their own $100,000 IRA (owes nothing): no move, `ok` with 6,235.96 unmet on the row; a $2,000 or
 * $10,000 spouse transfer to cash, or a $5,000 spouse conversion, calculation_error with the same 6,235.96 and no rows.
 *
 * Now each obligation is classified by itself: an obligation is PROMISED when a move drew on its group and left a
 * positive reserve held out of the return; only a promised obligation's own shortfall is an error. Every other
 * shortfall is ordinary and stays on the row as rmdUnmet. This reverses CL-02's row-wide witness (a 401(k) nothing drew
 * on, short beside an IRA conversion), by the owner's decision. The working engine keeps its promises, so the error is shown
 * to fire with tests/lib/rmd-protection-fault.js, which defeats the protection. Every figure is computed by hand.
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
const { engineWithoutReserveProtection } = require('./lib/rmd-protection-fault.js');
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const OWED = 100000 / 8.9; // a $100,000 account's obligation at 95
const round = (x) => Math.round(Number(x) * 100) / 100;
const near = (actual, expected, label) => assert.equal(round(actual), round(expected), label);
const acct = (o) => Object.assign({ name: 'account', owner: 'self', basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0,
  annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100 }, o);

/* Self 95, spouse 60 (owes nothing), one row, every account at the -95% floor, nothing earned or spent. */
function planFor({ spouseTransfer = 0, spouseConversion = 0, selfConversion = 0, k401 = false }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 95, retireAge: 60, endAge: 96, spouseOn: true, spouseAge: 60, filing: 'mfj' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: -95, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'annual' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 60 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [],
    otherIncomes: [], selfLife: 99, spouseLife: 99, survivor: false, dividendOn: false, withdrawalOrder: 'manual', manualOrder: 'taxable,hsa,roth,preTax' });
  const conversion = spouseConversion || selfConversion;
  Object.assign(p.advanced, { rmdOn: true, qcd: 0, healthOn: false, ltcOn: false, debts: [], otherAssets: [], bondTentOn: false, reserveOn: false,
    glideOn: false, assetsOn: false, penaltyException: true, conversionOn: conversion > 0, conversionAge: 95, conversionAmount: conversion,
    transferOn: spouseTransfer > 0, transferAge: 95, transferFrom: 'sp-ira', transferTo: 'cash', transferAmount: spouseTransfer });
  /* A conversion routes through the owners' pre-tax accounts by priority; the one under test is listed first. */
  const self = { id: 'ira', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000, priority: spouseConversion ? 5 : 1 };
  const spouse = { id: 'sp-ira', type: 'traditionalIRA', taxClass: 'preTax', owner: 'spouse', balance: 100000, priority: spouseConversion ? 1 : 5 };
  p.accounts = [self, spouse,
    { id: 'cash', type: 'taxable', taxClass: 'taxable', basisPct: 100, balance: 100000, priority: 3 },
    { id: spouseConversion ? 'sp-roth' : 'roth', type: 'rothIRA', taxClass: 'roth', owner: spouseConversion ? 'spouse' : 'self', balance: 0, priority: 4 }];
  if (k401) p.accounts.push({ id: 'k401', type: 'traditional401k', taxClass: 'preTax', balance: 100000, priority: 9 });
  p.accounts = p.accounts.map(acct);
  return p;
}
function run(opts, e = engine) {
  const p = planFor(opts);
  assert.equal(validator.validateScenario(JSON.parse(JSON.stringify(p))).valid, true, JSON.stringify(opts) + ' is a valid plan');
  return e.runPlan(p);
}
function okRow(opts) {
  const r = run(opts);
  assert.equal(r.status, 'ok', JSON.stringify(opts) + ': ' + r.status + '/' + r.calculationErrorCode);
  return r.rows[1];
}

test('R16-01: a transfer from an account that owes nothing promises nothing -- the older owner\'s shortfall stays on the row', () => {
  for (const spouseTransfer of [0, 2000, 10000]) {
    const row = okRow({ spouseTransfer });
    near(row.rmd, OWED, spouseTransfer + ': self\'s obligation');
    near(row.rmdDistributed, 5000, spouseTransfer + ': the 5,000 the -95% year leaves');
    near(row.rmdUnmet, OWED - 5000, spouseTransfer + ': unmet, and reported');
    /* self's IRA is emptied; the spouse's keeps what the transfer left, less 95% */
    near(row.preTax, (100000 - spouseTransfer) * 0.05, spouseTransfer + ': the spouse\'s IRA');
  }
});

test('R16-01: nor does a conversion out of an account that owes nothing', () => {
  const row = okRow({ spouseConversion: 5000 });
  near(row.rmdDistributed, 5000);
  near(row.rmdUnmet, OWED - 5000);
  near(row.roth, 5000 * 0.05, 'the spouse\'s Roth IRA holds the converted 5,000 after the year');
});

test('Q1-B: a conversion that draws on its own obligation is protected, and paid in full', () => {
  /* Self converts 50,000; the 11,235.96 reserve is held out of the -95% and paid; the rest of self's IRA loses 95%.
     The spouse's untouched IRA owes nothing and loses 95%. */
  const row = okRow({ selfConversion: 50000 });
  near(row.rmdUnmet, 0);
  near(row.rmdDistributed, OWED);
  near(row.preTax, (100000 - 50000 - OWED) * 0.05 + 100000 * 0.05);
  near(row.roth, 50000 * 0.05);
});

test('Q1-B (reverses CL-02\'s row-wide witness): a 401(k) nothing drew on, short beside a protected conversion, is ordinary', () => {
  /* Self's IRA converts and its obligation is protected and paid; self's 401(k) owes its own 11,235.96 and can pay 5,000.
     Before Q1-B the row was refused because SOMETHING in it was converted. */
  const row = okRow({ selfConversion: 50000, k401: true });
  near(row.rmd, 2 * OWED);
  near(row.rmdDistributed, OWED + 5000, 'the IRA paid in full, the 401(k) what it had');
  near(row.rmdUnmet, OWED - 5000, 'the 401(k)\'s ordinary shortfall, on the row');
});

test('Q1-B: a DEFEATED promise is still refused -- the same conversion with the protection switched off', () => {
  const faulted = engineWithoutReserveProtection();
  const r = run({ selfConversion: 50000 }, faulted);
  assert.equal(r.status, 'calculation_error');
  assert.equal(r.calculationErrorCode, 'RMD_NOT_DISTRIBUTED');
  assert.equal(r.rows, null, 'an invalidated result carries no rows');
  const state = r.issues.find((i) => i.code === 'RMD_NOT_DISTRIBUTED').state;
  /* Unprotected, the 50,000 left in self's IRA loses 95% and can pay 2,500 of the 11,235.96. */
  near(state.due, OWED);
  near(state.distributed, 50000 * 0.05);
  near(state.unmet, OWED - 2500);
  /* and a shortfall the move did not promise is still ordinary on the faulted engine: the 401(k) beside a conversion
     that WAS protected ... is not reachable there, so the control is the spouse move, which promises nothing */
  assert.equal(run({ spouseTransfer: 2000 }, faulted).status, 'ok', 'no promise, no error, even with protection off');
});

const { liveWorkerSource, postToWorker, cleanup } = require('./lib/worker-source.js');
test.after(() => cleanup());
test('R16-01: the generated Worker returns the row', async () => {
  const source = await liveWorkerSource();
  for (const opts of [{ spouseTransfer: 2000 }, { spouseConversion: 5000 }]) {
    const message = postToWorker(source, planFor(opts));
    assert.ok(!message.error, message.error);
    assert.equal(message.result.status, 'ok', JSON.stringify(opts));
    near(message.result.rows[1].rmdUnmet, OWED - 5000);
    assert.deepEqual(message.result.rows, engine.runPlan(planFor(opts)).rows, 'row for row, the direct engine');
  }
});
