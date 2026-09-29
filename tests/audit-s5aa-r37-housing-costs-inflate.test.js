/* S5AA R37 (SA32F-43; Claude's R32F full-model audit, qualified by ChatGPT's R32V) -- A MORTGAGE'S PROPERTY TAX, INSURANCE AND HOA
 * RISE WITH THE PLAN'S INFLATION.
 *
 * R32V: "E:2114 holds property tax/insurance/HOA nominally flat ... General spending inflation is not a law determining future
 * housing costs. The undisclosed cost-index convention is real; add a chosen assumption/input or describe nominal constancy."
 * The recommendation of record: these costs rise with the plan's inflation, as spending does, and the form says so. Each row
 * charges them at the price level its spending uses (the plan's inflation compounded to the row's start). PMI is a term of the
 * loan, not a price, and stays as entered.
 *
 * Hand expectation, three whole years from 65 at 3%: property tax 3,000 + insurance 1,200 + HOA 100 a month = 5,400 in the
 * first year, 5,400 x 1.03 = 5,562 in the second, 5,400 x 1.03^2 = 5,728.86 in the third. With PMI of 50 a month on a loan
 * with a balance all year, each year adds a flat 600. */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function housingRows(debt, inflation) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 65, retireAge: 65, endAge: 68, filing: 'single', spouseOn: false });
  p.assumptions.inflation = inflation;
  p.accounts = [{ id: 'b', name: 'Brokerage', type: 'brokerage', taxClass: 'taxable', owner: 'self', balance: 2000000, basisPct: 100, contribution: 0 }];
  p.advanced.debts = [Object.assign({ id: 'm', type: 'mortgage', name: 'Home', owner: 'household', rate: 5, payoffAge: 90, rateType: 'fixed',
    includePayment: true, includeHousingCosts: true, annualPropertyTax: 3000, annualInsurance: 1200, hoaMonthly: 100, pmiMonthly: 0 }, debt)];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok');
  /* Row 0 is the opening row (no duration); each later row is labelled by its closing age. */
  return r.rows.slice(1, 4).map((row) => Math.round(row.debtHousing * 100) / 100);
}

test('R37 SA32F-43: property tax, insurance and HOA rise with the plan inflation', () => {
  assert.deepStrictEqual(housingRows({ balance: 0, paymentMonthly: 0 }, 3), [5400, 5562, 5728.86], 'housing costs were held flat');
  /* CONTROL: at zero inflation they are flat. */
  assert.deepStrictEqual(housingRows({ balance: 0, paymentMonthly: 0 }, 0), [5400, 5400, 5400]);
});

test('R37 SA32F-43: PMI is a term of the loan and stays as entered', () => {
  assert.deepStrictEqual(housingRows({ balance: 150000, paymentMonthly: 1500, pmiMonthly: 50 }, 3), [6000, 6162, 6328.86]);
});

test('R37 SA32F-43: the form says the costs rise with inflation', () => {
  assert.match(shell, /Include property tax, insurance, HOA, and PMI in retirement spending \(tax, insurance and HOA rise with inflation; PMI stays as entered\)/);
});
