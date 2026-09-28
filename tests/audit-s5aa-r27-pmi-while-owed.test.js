/* S5AA R27 round: R25-02 -- MORTGAGE PMI IS CHARGED ONLY WHILE THE MORTGAGE HAS A BALANCE (ChatGPT's R25 audit,
 * 2026-09-26, priority 2; the owner 2026-09-26: "Repair: PMI while owed").
 *
 * projectDebts() added a year of PMI (12 x pmiMonthly x the year's length) whenever the mortgage OPENED the year with a
 * balance. R25 (R24F-03) ends the monthly loop at a payoff age inside the year, so the interest stopped at 60.5 -- but
 * the PMI kept running to 61. On ChatGPT's witness: $1,200 of housing cost against $600, and $600 less at the end
 * (reproduced at 4b7d516 and at 04f0426).
 *
 * Now PMI is counted month by month inside the loop, for each month the mortgage opens with a balance, whether the
 * payoff is forced by its payoff age or comes from the payments. A year the mortgage is owed throughout keeps the
 * original formula, so its figures are unchanged. Property tax, insurance and HOA are untouched.
 *
 * The witness is exact: $10,000 at 12% nominal is $100 a month of interest, so each $100 payment is all interest and the
 * balance stays at $10,000 until it is paid off.
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

function row(mortgage) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 61, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [] });
  Object.assign(p.advanced, { assetsOn: false, rmdOn: false, transferOn: false, conversionOn: false, healthOn: false,
    networthOn: true, otherAssets: [], debts: [Object.assign({ id: 'm', name: 'Mortgage', type: 'mortgage', owner: 'household',
      balance: 10000, rate: 12, rateType: 'fixed', paymentMonthly: 100, extraPrincipalMonthly: 0, payoffAge: 61,
      includePayment: true, includeHousingCosts: true, annualPropertyTax: 0, annualInsurance: 0, hoaMonthly: 0, pmiMonthly: 100 }, mortgage)] });
  p.accounts = [{ id: 'cash', name: 'Cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 100000, basisPct: 100,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, 'a valid plan: ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r.rows[1];
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);

test('R25-02: a mortgage paid off at 60.5 pays six months of PMI -- $600 housing, $11,200 paid, $88,800 left (was $1,200, $11,800, $88,200)', () => {
  const r = row({ payoffAge: 60.5 });
  near(r.debtInterest, 600, 'interest: six months');
  near(r.debtHousing, 600, 'PMI: six months at $100');
  near(r.debtPayments, 11200, 'six $100 payments, the $10,000 payoff and $600 of PMI');
  near(r.total, 88800, 'the portfolio');
});

test('R25-02: a mortgage the payments clear partway through the year stops its PMI in the month it is cleared', () => {
  /* No interest (0%), $2,500 a month on $10,000: the balance is $7,500, $5,000, $2,500, then $0 after the fourth payment.
     Four months open with a balance, so four months of PMI: $400. */
  const r = row({ rate: 0, paymentMonthly: 2500, payoffAge: 70 });
  near(r.debtHousing, 400, 'PMI: four months');
  near(r.debtPayments, 10000 + 400, 'the $10,000 of payments and $400 of PMI');
});

test('R25-02 CONTROL: a mortgage owed all year pays twelve months of PMI, as before -- $1,200', () => {
  const r = row({ payoffAge: 61 });
  near(r.debtHousing, 1200, 'PMI: twelve months');
});

test('R25-02 CONTROL: property tax and insurance are still charged for the whole year after a mid-year payoff', () => {
  /* $1,200 of property tax and $600 of insurance a year, no PMI: $1,800, whether or not the mortgage is paid off. */
  const r = row({ payoffAge: 60.5, pmiMonthly: 0, annualPropertyTax: 1200, annualInsurance: 600 });
  near(r.debtHousing, 1800, 'tax and insurance for the year');
});
