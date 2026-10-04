/* S5AA R33 (SA32F-33; Claude's R32F full-model audit, qualified by ChatGPT's R32V; the owner 2026-09-29: "Follow law everywhere")
 * -- A MARRIED COUPLE ON A SINGLE OR HEAD-OF-HOUSEHOLD RETURN.
 *
 * The model reads "include spouse" as married. A married person's spouse counts for the age-65 amounts only on a joint return:
 * IRC 151(d)(5)(C)(ii)(II) ("in the case of a joint return") and 63(f)(1)(B); a married individual gets the senior deduction
 * only on a joint return, 151(d)(5)(C)(v) -- so neither spouse gets it on a non-joint return; and the 63(f)(3) "unmarried"
 * amount ($2,050) is for an individual "not married", so a married person's own amount is the $1,650 one. Arizona's $2,100
 * exemption (A.R.S. 43-1023(E)) follows the return: the spouse's is not on it. The engine took all of these for both people.
 * Neither single nor head-of-household is a status a married couple can file (IRC 2(b)); the warning for that mismatch is a
 * separate item (SA32F-35). A widowed survivor, and a household with no spouse, are unmarried and unchanged.
 *
 * Both people are 70 (closing 71), retired on a flat pension at a 0% return, the tax paid from a full-basis taxable account. */
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

function firstRowTax(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 70, retireAge: 60, endAge: 71, spouseOn: o.spouseOn, spouseAge: 70, filing: o.filing });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 60 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, stages: [], expenses: [],
    otherIncomes: [], ssBenefit: 0, spouseSS: 0, survivor: false, pension: o.pension, pensionCola: 0, selfLife: 95, spouseLife: 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [{ id: 't', name: 't', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 500000, basisPct: 100,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  return Math.round(r.rows[1].taxes * 100) / 100;
}

test('R33 SA32F-33: married, filing single: only the self\'s own age amount, at the married rate, and no senior deduction', () => {
  /* Pension 60,000. Federal: 16,100 + 1,650 = 17,750; taxable 42,250; tax 1,240 + 12% x 29,850 = 4,822. Arizona: 2.5% x
     (60,000 - 16,100 - 2,100) = 1,045. Total 5,867. The engine took both people's 2,050 and 6,000: 3,088 + 992.50 = 4,080.50. */
  assert.strictEqual(firstRowTax({ spouseOn: true, filing: 'single', pension: 60000 }), 5867);
});

test('R33 SA32F-33: married, filing head of household: the same three rules on the head-of-household tables', () => {
  /* Federal: 24,150 + 1,650 = 25,800; taxable 34,200; tax 1,770 + 12% x 16,500 = 3,750. Arizona: 2.5% x (60,000 - 24,150 -
     2,100) = 843.75. Total 4,593.75. */
  assert.strictEqual(firstRowTax({ spouseOn: true, filing: 'hoh', pension: 60000 }), 4593.75);
});

test('R33 SA32F-33 CONTROLS: the joint return, and a household with no spouse, are unchanged', () => {
  /* Joint: 32,200 + 2 x 1,650 + 2 x 6,000 = 47,500; taxable 12,500 at 10% = 1,250. Arizona 2.5% x (60,000 - 32,200 - 4,200) =
     590. Total 1,840. */
  /* S5AA R48 (AA1-16, the owner's AA1 decision of 2026-10-03): Arizona subtracts the federal senior deduction (A.R.S. 43-1022(35)),
     2 x 6,000 on the joint return: Arizona 2.5% x (60,000 - 32,200 - 4,200 - 12,000) = 290, total 1,540 (was 1,840). The non-joint
     cases above take no federal senior deduction (151(d)(5)(C)(v)), so Arizona subtracts none and they are unchanged. */
  assert.strictEqual(firstRowTax({ spouseOn: true, filing: 'mfj', pension: 60000 }), 1540);
  /* Single, no spouse: 16,100 + 2,050 + 6,000 = 24,150; taxable 35,850; 1,240 + 12% x 23,450 = 4,054; Arizona 1,045. 5,099. */
  /* S5AA R48: Arizona 2.5% x (60,000 - 16,100 - 2,100 - 6,000) = 895, total 4,949 (was 5,099). */
  assert.strictEqual(firstRowTax({ spouseOn: false, filing: 'single', pension: 60000 }), 4949);
});
