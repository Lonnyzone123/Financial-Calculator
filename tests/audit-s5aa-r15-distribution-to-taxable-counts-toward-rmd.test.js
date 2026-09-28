/* S5AA, R15 round: A DISTRIBUTION TO A TAXABLE ACCOUNT COUNTS TOWARD THE REQUIRED DISTRIBUTION (external audit of
 * `1e6faae`, R14-01; S2 carried item U1, decided by the owner 2026-09-13 -- "credit it -- a distribution satisfies the RMD
 * regardless of destination account" -- routed to S103 and pulled forward into S5AA by the owner, 2026-09-22).
 *
 * A manual transfer from a pre-tax account to a TAXABLE one is a distribution: CR2-01 taxes it as one. But it was
 * never credited against its owner's required distribution, which the row then took again in full. MEASURED at
 * `1e6faae`: one owner at 80, a $100,000 IRA, $100,000 of cash, nothing else moving. A $10,000 transfer to the cash left
 * the IRA at $85,049.50 -- the transfer AND the whole $4,950.50 -- where the law leaves $90,000; a $2,000 transfer took
 * $4,950.50 more on top of it. Treas. Reg. 1.408-8(b)(3): an amount distributed in the year from one of an owner's
 * IRAs is a required distribution to the extent the owner's total IRA requirement is unsatisfied.
 *
 * The transfer is now credited to ITS OWN obligation -- the owner's IRAs together, or an employer plan alone -- up to
 * what is unpaid, before the capacity a conversion may use is sized and before the rest of the distribution is taken.
 * A conversion (pre-tax to Roth), a rollover (pre-tax to pre-tax) and a QCD keep their own rules. The obligation shown
 * stays the full opening-balance figure; rmdDistributed reports what counted toward it; nothing is taxed or moved twice.
 * Every expectation below is computed by hand.
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

const DIV_80 = 20.2;
const OWED = 100000 / DIV_80; // one $100,000 account's obligation at 80
const round = (x) => Math.round(Number(x) * 100) / 100;
const near = (actual, expected, label) => assert.equal(round(actual), round(expected), label);

const acct = (o) => Object.assign({ name: 'account', owner: 'self', basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0,
  annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100 }, o);

/* One row, 80 to 81. Nothing grows unless `returns` is given (then each account earns its allocation's return: `ira` at
   the `iraReturn`, everything else 0%). No spending, no Social Security, no fees, no inflation. */
function planFor({ transfer = 0, from = 'ira', to = 'cash', accounts = null, pension = 0, qcd = 0, conversion = 0, timing = 'annual',
  spouse = false, rmdOn = true, iraReturn = null }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 80, retireAge: 60, endAge: 81, spouseOn: spouse, spouseAge: 80, filing: spouse ? 'mfj' : 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: timing });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, spouseSS: 0, pension, pensionAge: 60, pensionCola: 0,
    stages: [], expenses: [], otherIncomes: [], selfLife: 95, spouseLife: 95, survivor: false, /* RE-FIXTURED at the S5AA R18 round (workstream B, taxable basis in dollars): dividends ON at a 0% yield, so no imputed 1.5% -- at a 0% return a taxed, retained yield adds basis the account never gains, and the tax sales then realise small capital losses that are not what this test is about. */ dividendOn: true, dividendYield: 0,
    withdrawalOrder: 'manual', manualOrder: 'taxable,hsa,roth,preTax' });
  Object.assign(p.advanced, { rmdOn, qcd, healthOn: false, ltcOn: false, debts: [], otherAssets: [], bondTentOn: false, reserveOn: false,
    glideOn: false, assetsOn: iraReturn !== null,
    assetClasses: [{ id: 'ira-class', name: 'IRA', returnRate: iraReturn || 0, volatility: 0 }, { id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }],
    conversionOn: conversion > 0, conversionAge: 80, conversionAmount: conversion,
    transferOn: transfer > 0, transferAge: 80, transferFrom: from, transferTo: to, transferAmount: transfer });
  p.accounts = (accounts || [
    { id: 'ira', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000, priority: 1 },
    { id: 'cash', type: 'taxable', taxClass: 'taxable', basisPct: 100, balance: 100000, priority: 2 },
  ]).map((a) => acct(Object.assign({ allocation: iraReturn === null ? {} : { [a.id === 'ira' ? 'ira-class' : 'flat']: 100 } }, a)));
  return p;
}
function run(opts) {
  const p = planFor(opts);
  assert.equal(validator.validateScenario(JSON.parse(JSON.stringify(p))).valid, true, JSON.stringify(opts) + ' is a valid plan');
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', JSON.stringify(opts) + ': ' + r.status + '/' + r.calculationErrorCode);
  return r.rows[1];
}

test('R14-01: below, equal to, above the obligation, and the whole IRA -- what counts is not taken twice', () => {
  const control = run({});
  for (const [transfer, iraLeft] of [
    [0, 100000 - OWED], // the obligation, taken by the row
    [2000, 100000 - OWED], // 2,000 of it by the transfer, the other 2,950.50 by the row: the IRA ends where it would anyway
    [OWED, 100000 - OWED], // exactly the obligation, by the transfer alone
    [10000, 90000], // more than the obligation: nothing further is owed
    [100000, 0], // the whole IRA, which a clamp at "opening balance less the obligation" used to refuse
  ]) {
    const row = run({ transfer });
    const moved = Math.max(transfer, OWED);
    near(row.rmd, OWED, transfer + ': the obligation shown is the full opening-balance figure');
    near(row.rmdDistributed, OWED, transfer + ': and it was met');
    near(row.rmdUnmet, 0, transfer + ': nothing unmet');
    near(row.preTax, iraLeft, transfer + ': the IRA');
    near(row.taxable, 100000 + moved - row.taxes, transfer + ': the cash receives every dollar that left the IRA, less the tax');
    near(row.magi - control.magi, moved - OWED, transfer + ': income is what left the IRA, once');
  }
});

test('R14-01: the tax is the tax on what actually left the IRA', () => {
  /* With a $60,000 pension and a $10,000 transfer, $10,000 leaves the IRA and nothing more. A plan with RMDs switched
     off and the same transfer distributes exactly the same dollars, so it must owe exactly the same tax. */
  const withRmd = run({ transfer: 10000, pension: 60000 });
  const withoutRmd = run({ transfer: 10000, pension: 60000, rmdOn: false });
  near(withRmd.preTax, 90000);
  near(withRmd.magi, withoutRmd.magi, 'the same income');
  near(withRmd.taxes, withoutRmd.taxes, 'the same tax');
  near(withRmd.taxable, 100000 + 10000 + 60000 - withRmd.taxes, 'cash: the transfer and the pension, less the tax');
});

test('R14-01: a second IRA of the same owner -- the credit is the owner\'s, and the rest comes from the paying IRA', () => {
  /* IRA `a` ($10,000, priority 9) and IRA `b` ($100,000, priority 1): one obligation, 110,000 / 20.2 = 5,445.54. A
     $3,000 transfer from `a` counts; the other 2,445.54 comes from `b`, first in the order. Both array orders. */
  const owed = 110000 / DIV_80;
  const a = { id: 'a', type: 'traditionalIRA', taxClass: 'preTax', balance: 10000, priority: 9 };
  const b = { id: 'b', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000, priority: 1 };
  const cash = { id: 'cash', type: 'taxable', taxClass: 'taxable', basisPct: 100, balance: 100000, priority: 2 };
  for (const accounts of [[a, b, cash], [b, a, cash]]) {
    const row = run({ transfer: 3000, from: 'a', accounts });
    near(row.rmdDistributed, owed);
    near(row.preTax, 110000 - owed, 'the two IRAs lose exactly the obligation: 3,000 by transfer, 2,445.54 by the row');
    near(row.taxable, 100000 + owed - row.taxes);
  }
});

test('R14-01: the spouse\'s IRA and an employer plan are other obligations, and get no credit', () => {
  /* The spouse, also 80, owes 4,950.50 on their own IRA; self's $10,000 transfer satisfies self's only. */
  const couple = run({ transfer: 10000, spouse: true, accounts: [
    { id: 'ira', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000, priority: 1 },
    { id: 'spouse-ira', type: 'traditionalIRA', taxClass: 'preTax', owner: 'spouse', balance: 100000, priority: 1 },
    { id: 'cash', type: 'taxable', taxClass: 'taxable', basisPct: 100, balance: 100000, priority: 2 }] });
  near(couple.rmd, 2 * OWED);
  near(couple.rmdDistributed, 2 * OWED);
  near(couple.preTax, 90000 + (100000 - OWED));
  /* Self's 401(k) of $50,000 owes 50,000 / 20.2 = 2,475.25 from itself. A transfer from the IRA does not pay it, and a
     transfer from the 401(k) does not pay the IRA's. */
  const plan401k = { id: 'k', type: 'traditional401k', taxClass: 'preTax', balance: 50000, priority: 3 };
  const withPlan = (from, transfer) => run({ transfer, from, accounts: [
    { id: 'ira', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000, priority: 1 }, plan401k,
    { id: 'cash', type: 'taxable', taxClass: 'taxable', basisPct: 100, balance: 100000, priority: 2 }] });
  const planOwed = 50000 / DIV_80;
  near(withPlan('ira', 10000).preTax, 90000 + (50000 - planOwed), 'the IRA transfer pays the IRA\'s obligation only');
  near(withPlan('k', 1000).preTax, (100000 - OWED) + (50000 - planOwed), 'the 401(k) transfer counts toward the 401(k)\'s only');
  near(withPlan('k', 1000).rmdDistributed, OWED + planOwed);
});

test('R14-01: a QCD and a transfer in the same year', () => {
  /* The $2,000 QCD and the $2,000 transfer both count; the row takes the remaining 950.50. The QCD is excluded from
     income, so MAGI rises by the transfer and the 950.50 only -- 2,000 less than the plain obligation. */
  const control = run({});
  const row = run({ transfer: 2000, qcd: 2000 });
  near(row.preTax, 100000 - OWED, 'the IRA loses the obligation and no more');
  near(row.rmdDistributed, OWED);
  near(row.rmdUnmet, 0);
  near(row.magi, control.magi - 2000, 'the QCD is the only part excluded');
});

test('R14-01: a conversion after a transfer -- the transfer\'s dollars came out first, and the conversion may take the rest', () => {
  /* A $3,000 transfer to cash counts toward the 4,950.50; the other 1,950.50 must still come out before anything is
     converted. A request to convert everything therefore converts 100,000 - 3,000 - 1,950.50 = 95,049.50 (it converted
     92,049.50 when the transfer was reserved on top of the obligation), and the IRA ends empty. A $20,000 conversion
     leaves 100,000 - 3,000 - 20,000 - 1,950.50. */
  const withRoth = [
    { id: 'ira', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000, priority: 1 },
    { id: 'roth', type: 'rothIRA', taxClass: 'roth', balance: 0, priority: 3 },
    { id: 'cash', type: 'taxable', taxClass: 'taxable', basisPct: 100, balance: 100000, priority: 2 }];
  const all = run({ transfer: 3000, conversion: 100000, accounts: withRoth });
  near(all.roth, 100000 - 3000 - (OWED - 3000));
  near(all.preTax, 0);
  near(all.rmdDistributed, OWED);
  const some = run({ transfer: 3000, conversion: 20000, accounts: withRoth });
  near(some.roth, 20000);
  near(some.preTax, 100000 - 3000 - 20000 - (OWED - 3000));
  /* A pre-tax to ROTH transfer is a conversion, not a distribution to spend, and is NOT credited: the whole obligation
     still comes out of the IRA, and the transfer takes only what is above it. */
  const toRoth = run({ transfer: 10000, to: 'roth', accounts: withRoth });
  near(toRoth.roth, 10000);
  near(toRoth.preTax, 90000 - OWED, 'a conversion does not satisfy the obligation');
});

test('R14-01: quarterly and monthly timing, and a losing year', () => {
  for (const timing of ['quarterly', 'monthly']) {
    const row = run({ transfer: 10000, timing });
    near(row.preTax, 90000, timing);
    near(row.rmdDistributed, OWED, timing);
  }
  /* A -10% IRA, cash flat. The $10,000 transfer has paid the whole obligation before the year's return, so nothing
     is reserved or owed after it: 90,000 x 0.9. (It ended at 76,544.55: (90,000 - 4,950.50) x 0.9 + nothing, the
     obligation taken a second time.) A $2,000 transfer pays 2,000 of it; the other 2,950.50 is an obligation no
     conversion drew on, so it stays invested and is paid after the return, as with no transfer at all. */
  near(run({ transfer: 10000, iraReturn: -10 }).preTax, 90000 * 0.9);
  near(run({ transfer: 2000, iraReturn: -10 }).preTax, 98000 * 0.9 - (OWED - 2000));
});

test('R14-01: prototype-named ids (R13-01) give the same money', () => {
  const named = (ira, cash) => run({ transfer: 10000, from: ira, to: cash, accounts: [
    { id: ira, type: 'traditionalIRA', taxClass: 'preTax', balance: 100000, priority: 1 },
    { id: cash, type: 'taxable', taxClass: 'taxable', basisPct: 100, balance: 100000, priority: 2 }] });
  const plain = named('ira', 'cash');
  for (const [ira, cash] of [['__proto__', 'constructor'], ['constructor', '__proto__'], ['0', 'toString']]) {
    const row = named(ira, cash);
    for (const k of ['preTax', 'taxable', 'rmdDistributed', 'magi', 'taxes']) near(row[k], plain[k], ira + '/' + cash + ' ' + k);
  }
  near(plain.preTax, 90000);
});

/* The GENERATED WORKER -- the engine the browser runs -- on the witness and on the equal-to-the-obligation case. */
const { liveWorkerSource, postToWorker, cleanup } = require('./lib/worker-source.js');
test.after(() => cleanup());
test('R14-01: the generated Worker agrees', async () => {
  const source = await liveWorkerSource();
  for (const transfer of [2000, 10000]) {
    const message = postToWorker(source, planFor({ transfer }));
    assert.ok(!message.error, message.error);
    assert.equal(message.result.status, 'ok');
    near(message.result.rows[1].preTax, transfer === 10000 ? 90000 : 100000 - OWED, String(transfer));
    assert.deepEqual(message.result.rows, engine.runPlan(planFor({ transfer })).rows, 'row for row, the direct engine');
  }
});
