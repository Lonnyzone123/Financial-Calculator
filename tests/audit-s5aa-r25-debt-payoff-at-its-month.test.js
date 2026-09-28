/* S5AA R25 round: R24F-03 -- A DEBT IS PAID OFF IN THE MONTH ITS PAYOFF AGE NAMES (ChatGPT's R24F deep full-model
 * audit, 2026-09-25, priority 2; repair chosen by the owner 2026-09-25: "Repair: settle at the payoff month").
 *
 * projectDebts() ran EVERY month of a projection year, and only then paid off a debt whose payoffAge had passed. The app
 * takes a payoff age in half-year steps, so a loan to be cleared at 60.5 kept charging interest to 61. Measured at
 * s5aa-r24-source (d67b618): a $10,000 loan at 12% with a $100 payment and payoffAge 60.5 paid $11,200, $1,200 of it
 * interest, and left $88,800 of $100,000 -- the same as payoffAge 61.
 *
 * Now the monthly loop stops at the payoff month when the payoff age falls strictly inside the year, and the balance is
 * settled there. A payoff age at a year's boundary, or before the year began, is unchanged. No r16 member has a payoff
 * age inside a year. All through runPlan() on validator-valid plans; figures are hand arithmetic at a 0% return.
 *
 * The witness is built so the arithmetic is exact: 12% nominal is 1% a month, and 1% of $10,000 is $100, so each $100
 * payment is all interest and the balance stays at $10,000 until it is paid off.
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
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

function plan(payoffAge, o = {}) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: o.endAge || 61, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [] });
  Object.assign(p.advanced, { assetsOn: false, rmdOn: false, transferOn: false, conversionOn: false, healthOn: false,
    networthOn: true, otherAssets: [], debts: [{ id: 'd1', name: 'Loan', type: 'otherDebt', owner: 'household',
      balance: 10000, rate: 12, rateType: 'fixed', paymentMonthly: 100, extraPrincipalMonthly: 0, payoffAge,
      includePayment: true, includeHousingCosts: false }] });
  p.accounts = [{ id: 'cash', name: 'Cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 100000,
    basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
    changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0,
    vesting: 100, priority: 1 }];
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, 'a valid plan: ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);

test('R24F-03: a payoff at 60.5 is settled after six months -- $600 of interest, $10,600 paid, $89,400 left (was $1,200, $11,200, $88,800)', () => {
  const row = plan(60.5).rows[1];
  near(row.debtInterest, 600, 'interest: six months of 1% on $10,000');
  near(row.debtPayments, 10600, 'paid: six $100 payments and the $10,000 balance');
  near(row.total, 89400, 'the portfolio: $100,000 less $10,600');
  assert.equal(row.debtBalance, 0);
});

test('R24F-03: a payoff one month into the year is settled after one payment -- $100 of interest, $10,100 paid', () => {
  const row = plan(60 + 1 / 12).rows[1];
  near(row.debtInterest, 100, 'interest');
  near(row.debtPayments, 10100, 'paid');
  near(row.total, 89900, 'the portfolio');
});

test('R24F-03 CONTROL: a payoff at the end of the year runs all twelve months, as before -- $1,200, $11,200, $88,800', () => {
  const row = plan(61).rows[1];
  near(row.debtInterest, 1200, 'interest');
  near(row.debtPayments, 11200, 'paid');
  near(row.total, 88800, 'the portfolio');
});

test('R24F-03: a payoff in the second year runs the whole first year (as before), then settles six months into the second', () => {
  const r = plan(61.5, { endAge: 62 });
  near(r.rows[1].debtInterest, 1200, 'first year: twelve months');
  near(r.rows[1].debtPayments, 1200, 'first year: twelve payments, no payoff');
  near(r.rows[2].debtInterest, 600, 'second year: six months');
  near(r.rows[2].debtPayments, 10600, 'second year: six payments and the payoff');
  near(r.rows[2].total, 100000 - 1200 - 10600, 'the portfolio at 62');
});
