/* S5AA, R12 round: A CONVERSION OR TRANSFER TAKES THE REQUIRED DISTRIBUTION OUT OF THE MARKET FIRST
 * (external re-audit of `b053dc2`, R11-01).
 *
 * The R11 repair (b053dc2) left each obligation's own money behind when a conversion or transfer drew on it, but it left
 * the EXACT nominal amount, still invested, and the row's return runs before the required distribution is paid.
 * MEASURED at `b053dc2`: age 80, a $100,000 traditional IRA, an empty Roth IRA, RMD rules on, a $100,000 conversion
 * request and a 10% loss -- $4,950.50 owed, $4,950.50 left behind, $4,455.45 there to pay it after the loss, and the row
 * ends in `calculation_error / RMD_NOT_DISTRIBUTED`. Monthly and quarterly timing fail the same way by less; the manual
 * transfer fails the same way; and without the conversion all three loss cases complete. It is not a balance too small
 * for the obligation: the conversion left only the reserve, and an intervening return shrank it.
 *
 * The law gives the order: the first dollars out of an IRA in a year count toward its required distribution, and a
 * required distribution cannot be converted -- so it comes out first. Now, once a conversion or transfer draws on an
 * obligation, that obligation's reserve is held out of the row's return until the distribution is paid, as though it had
 * been distributed before the conversion. No reserve is sized by the coming return (that would be lookahead), and the
 * late RMD_NOT_DISTRIBUTED check is untouched. An obligation that no conversion or transfer touched keeps its whole
 * balance invested, as before. Expectations are computed by hand. Tested through runPlan.
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
  annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100, priority: 1 }, o);
const OWED = 100000 / 20.2; // the Uniform Lifetime divisor at 80, as RULES carries it
const round = (x) => Math.round(Number(x) * 100) / 100;

function run({ returnRate = -10, timing = 'annual', conversionAmount = 0, transfer = false, spouse = false }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 80, retireAge: 60, endAge: 81, spouseOn: spouse, spouseAge: 80, filing: spouse ? 'mfj' : 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: timing });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [],
    otherIncomes: [], selfLife: 95, spouseLife: 95, survivor: false, dividendOn: false,
    /* The conversion's tax is paid from cash, so nothing but the required distribution ever leaves the IRA and its
       ending balance is the witness. */
    withdrawalOrder: 'manual', manualOrder: 'taxable,hsa,roth,preTax' });
  Object.assign(p.advanced, { rmdOn: true, qcd: 0, healthOn: false, ltcOn: false, otherAssets: [], debts: [],
    conversionOn: conversionAmount > 0, conversionAge: 80, conversionAmount,
    transferOn: transfer, transferAge: 80, transferFrom: 'ira', transferTo: 'roth', transferAmount: transfer ? 100000 : 0 });
  p.accounts = [acct({ id: 'ira', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000 }),
    acct({ id: 'roth', type: 'rothIRA', taxClass: 'roth', balance: 0, priority: 2 }),
    acct({ id: 'cash', type: 'taxable', taxClass: 'taxable', basisPct: 100, balance: 50000, priority: 9 })];
  if (spouse) p.accounts.push(acct({ id: 'spouseIra', type: 'traditionalIRA', taxClass: 'preTax', owner: 'spouse', balance: 100000, priority: 3 }),
    acct({ id: 'spouseRoth', type: 'rothIRA', taxClass: 'roth', owner: 'spouse', balance: 0, priority: 4 }));
  return engine.runPlan(p);
}

for (const timing of ['annual', 'monthly', 'quarterly']) {
  test('R11-01: a conversion under a 10% loss still pays the whole required distribution (' + timing + ' timing)', () => {
    const r = run({ timing, conversionAmount: 100000 });
    assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
    assert.equal(round(r.rows[1].rmdDistributed), round(OWED));
    assert.equal(round(r.rows[1].rmdUnmet), 0);
  });
  test('R11-01: the manual transfer, the same (' + timing + ' timing)', () => {
    const r = run({ timing, transfer: true });
    assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
    assert.equal(round(r.rows[1].rmdUnmet), 0);
  });
}

test('R11-01: two IRA owners converting under a loss both have their own distribution paid', () => {
  const r = run({ conversionAmount: 200000, spouse: true });
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.equal(round(r.rows[1].rmd), round(2 * OWED));
  assert.equal(round(r.rows[1].rmdUnmet), 0);
});

test('R11-01: at a positive return the reserve is out of the market too -- the IRA ends empty, the Roth grows on what moved', () => {
  /* Hand arithmetic, annual timing (the whole year's return applies before the distribution): the conversion moves
     100,000 - 4,950.50 = 95,049.50 into the Roth, which grows 10% to 104,554.46; the reserve does not grow, and the
     distribution takes all of it. Before this repair the reserve grew to 5,445.54 and $495.05 stayed in the IRA. */
  const r = run({ returnRate: 10, conversionAmount: 100000 });
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.equal(round(r.rows[1].rmdDistributed), round(OWED));
  assert.equal(round(r.rows[1].preTax), 0);
  assert.equal(round(r.rows[1].roth), round((100000 - OWED) * 1.1));
});

test('R11-01 control: without a conversion or transfer the whole IRA stays invested, and the loss case completes as before', () => {
  const r = run({});
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.equal(round(r.rows[1].rmdDistributed), round(OWED));
  assert.equal(round(r.rows[1].preTax), round(100000 * 0.9 - OWED), 'the whole balance took the loss, then paid the distribution');
});
