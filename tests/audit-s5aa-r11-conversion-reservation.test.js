/* S5AA, R11 round: A CONVERSION OR TRANSFER RESERVES EACH OBLIGATION'S OWN MONEY (external audit of `02b921a`, R10-02).
 *
 * Required distributions are computed per owner and per plan (task 4.2, `rmdObligations()`): one obligation for an
 * owner's IRAs together, one for each employer plan, and one owner's money can never pay another's. The conversion
 * route reserved them as ONE HOUSEHOLD NUMBER -- total pre-tax balance less the total required distribution -- so a
 * conversion could empty the account that owed, as long as somebody else's pre-tax balance covered the shortfall on
 * paper. MEASURED at `02b921a`: self 80 with a $100,000 IRA, spouse 60 with a separate $100,000 IRA, a Roth IRA for
 * self only, RMD rules on, a $195,000 conversion request -- self's IRA is emptied although self owes $100,000/20.2 =
 * $4,950.4950495 from it, and the row ends in `calculation_error / RMD_NOT_DISTRIBUTED` with the whole obligation
 * unmet. The manual transfer path shares the clamp and reproduced it.
 *
 * The capacity is now each obligation's own: an owner's IRAs together, each employer plan alone, and pre-tax money
 * that owes nothing in full. A QCD is not credited against it here -- the row settles QCDs after the conversion, so the
 * reserve stays the full obligation, which is the conservative direction. Tested through runPlan.
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

/* RE-FIXTURED BY INTENT at S5AA R35 (SA32F-08): with a spouse more than ten years younger as sole beneficiary, the divisor is now Table II
   (26 CFR 1.401(a)(9)-5(c)(2)). This file tests something else, on Uniform-table amounts, so its accounts name the spouse as NOT the sole
   beneficiary (spouseSoleBeneficiary: false) and every expectation stands. Table II has its own test file. */
const acct = (o) => Object.assign({ name: o.id, owner: 'self', spouseSoleBeneficiary: false, basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0,
  annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100, priority: 1 }, o);
const DIVISOR_80 = 20.2; // IRS Uniform Lifetime Table at 80, as RULES carries it
const CASH = acct({ id: 'cash', type: 'taxable', taxClass: 'taxable', basisPct: 100, balance: 300000, priority: 9 });

function run({ accounts, conversionAmount = 0, transfer = null, spouseOn = false, spouseAge = 60, rmdOn = true }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 80, retireAge: 60, endAge: 81, spouseOn, spouseAge, filing: spouseOn ? 'mfj' : 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [],
    otherIncomes: [], selfLife: 95, spouseLife: 95, survivor: false, withdrawalOrder: 'manual', manualOrder: 'taxable,preTax,roth,hsa' });
  Object.assign(p.advanced, { rmdOn, qcd: 0, healthOn: false, ltcOn: false, otherAssets: [], debts: [],
    conversionOn: conversionAmount > 0, conversionAge: 80, conversionAmount,
    transferOn: !!transfer, transferAge: 80, transferFrom: transfer ? transfer.from : '', transferTo: transfer ? transfer.to : '',
    transferAmount: transfer ? transfer.amount : 0 });
  p.accounts = accounts.concat([CASH]);
  const r = engine.runPlan(p);
  const row = r.rows && r.rows[1];
  return { r, row, balance: (id) => { const a = (r.accountsAtEnd || []).find((x) => x.id === id); return a ? a.balance : null } };
}
const round = (x) => Math.round(Number(x) * 1e6) / 1e6;
const SELF_RMD = round(100000 / DIVISOR_80); // 4950.49505

test('R10-02: a conversion cannot spend the IRA that owes the distribution, however much the spouse holds', () => {
  const { r, row } = run({
    accounts: [acct({ id: 'selfIra', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000 }),
      acct({ id: 'spouseIra', type: 'traditionalIRA', taxClass: 'preTax', owner: 'spouse', balance: 100000, priority: 2 }),
      acct({ id: 'selfRoth', type: 'rothIRA', taxClass: 'roth', balance: 0, priority: 3 })],
    conversionAmount: 195000, spouseOn: true,
  });
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.equal(round(row.rmd), SELF_RMD, 'self owes it; the spouse is 60 and owes nothing');
  assert.equal(round(row.rmdUnmet), 0, 'and it is distributed');
  assert.equal(round(row.rmdDistributed), SELF_RMD);
});

test('R10-02: the same, through the manual transfer path', () => {
  const { r, row } = run({
    accounts: [acct({ id: 'selfIra', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000 }),
      acct({ id: 'spouseIra', type: 'traditionalIRA', taxClass: 'preTax', owner: 'spouse', balance: 100000, priority: 2 }),
      acct({ id: 'selfRoth', type: 'rothIRA', taxClass: 'roth', balance: 0, priority: 3 })],
    transfer: { from: 'selfIra', to: 'selfRoth', amount: 100000 }, spouseOn: true,
  });
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.equal(round(row.rmdUnmet), 0);
  assert.equal(round(row.rmdDistributed), SELF_RMD);
});

test('R10-02: an employer plan\'s obligation is its own -- an IRA\'s spare balance does not cover it', () => {
  const { r, row } = run({
    accounts: [acct({ id: 'selfIra', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000 }),
      acct({ id: 'self401k', type: 'traditional401k', taxClass: 'preTax', balance: 100000, priority: 2 }),
      acct({ id: 'selfRoth', type: 'rothIRA', taxClass: 'roth', balance: 0, priority: 3 }),
      acct({ id: 'selfRoth401k', type: 'roth401k', taxClass: 'roth', balance: 0, priority: 4 })],
    conversionAmount: 195000,
  });
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.equal(round(row.rmd), round(2 * (100000 / DIVISOR_80)), 'two obligations, the IRA pool and the plan');
  assert.equal(round(row.rmdUnmet), 0, 'each is left the money it owes');
});

test('R10-02 control: one owner, one IRA -- the reserve is that IRA\'s own obligation, as before', () => {
  const { r, row } = run({
    accounts: [acct({ id: 'selfIra', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000 }),
      acct({ id: 'selfRoth', type: 'rothIRA', taxClass: 'roth', balance: 0, priority: 3 })],
    conversionAmount: 195000,
  });
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.equal(round(row.rmdUnmet), 0);
  assert.equal(round(row.rmdDistributed), SELF_RMD);
});

test('R10-02 control: two IRAs of one owner are one obligation, and either may fund it', () => {
  const { r, row } = run({
    accounts: [acct({ id: 'iraA', type: 'traditionalIRA', taxClass: 'preTax', balance: 50000 }),
      acct({ id: 'iraB', type: 'traditionalIRA', taxClass: 'preTax', balance: 50000, priority: 2 }),
      acct({ id: 'selfRoth', type: 'rothIRA', taxClass: 'roth', balance: 0, priority: 3 })],
    conversionAmount: 195000,
  });
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.equal(round(row.rmd), SELF_RMD, 'one obligation across the pool');
  assert.equal(round(row.rmdUnmet), 0);
});

test('R10-02 control: with the RMD rules off, the whole pre-tax balance is convertible', () => {
  const { r, row } = run({
    accounts: [acct({ id: 'selfIra', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000 }),
      acct({ id: 'selfRoth', type: 'rothIRA', taxClass: 'roth', balance: 0, priority: 3 })],
    conversionAmount: 195000, rmdOn: false,
  });
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.equal(round(row.rmd), 0);
  assert.equal(round(row.preTax), 0, 'nothing is owed, so nothing is reserved');
});
