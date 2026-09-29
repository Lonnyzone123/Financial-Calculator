/* S5AA R35 (SA32F-20; Claude's R32F full-model audit FLOWS-03, confirmed P1 by ChatGPT's R32V "for the UI's stock-access
 * interpretation") -- AN OTHER ASSET'S "ACCESSIBLE SHARE" IS A SHARE OF THE ASSET, NOT OF WHAT IS LEFT OF IT.
 *
 * The app's "Potentially accessible" total is value x share. The fallback draw re-applied the share to the remaining value each
 * year, so a $400,000 asset 50% accessible gave up $396,875 against the $200,000 the form shows. R32V: "Track an accessible
 * sub-balance, including its growth and prior draws."
 *
 * The audit's case: 60 to 70, no portfolio, $60,000 a year of spending, a $400,000 asset at 0% growth, available from 60, 50%
 * accessible. Hand: 60,000 a year for three years, then the last 20,000, then nothing -- 200,000 in all, the first shortfall in the row from 63 to 64 (reported as 64). */
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

function run(growth) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 70, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 60 });
  Object.assign(p.retirement, { strategy: 'incomeFirst', spending: 60000, dividendOn: false, stages: [], expenses: [], otherIncomes: [],
    pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false, selfLife: 120, homeEquityFallback: true });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false, networthOn: true, debts: [],
    otherAssets: [{ id: 'home', name: 'Home', type: 'realEstate', value: 400000, growth, available: true, availableAge: 60, accessPct: 50, liquidity: 'illiquid' }] });
  p.accounts = [{ id: 'cash', name: 'Cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 0, basisPct: 100, contribution: 0,
    contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, cashHolding: true, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return r;
}

test('R35 SA32F-20: the draw stops at the accessible share of the asset', () => {
  const r = run(0);
  const draws = r.rows.slice(1).map((x) => Math.round(x.nonPortfolioDraw));
  assert.deepStrictEqual(draws.slice(0, 5), [60000, 60000, 60000, 20000, 0], 'the engine drew 60,000 five times and then halves');
  assert.strictEqual(draws.reduce((a, b) => a + b, 0), 200000, 'exactly the accessible 200,000');
  assert.strictEqual(r.rows[r.rows.length - 1].otherAssets, 200000, 'the inaccessible half is still there');
  assert.strictEqual(r.firstShortfallAge, 64, 'the row opening at 63, labelled by its closing age');
});

test('R35 SA32F-20: the accessible part grows with the asset', () => {
  /* 10% growth, grown before the draw in each row: the accessible stock is 200,000 x 1.1 = 220,000 by the first draw; the first
     draw leaves 160,000, which grows to 176,000; ... Its total can never exceed half of everything the asset is ever worth, and the
     inaccessible half is never drawn: at the end it is 200,000 x 1.1^10. */
  const r = run(10);
  const end = r.rows[r.rows.length - 1].otherAssets;
  assert.ok(end >= 200000 * Math.pow(1.1, 10) - 0.01, 'the inaccessible half, grown, is untouched: ' + end);
});
