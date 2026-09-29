/* S5AA R35 (SA32F-19; Claude's R32F full-model audit FLOWS-01, confirmed P1 by ChatGPT's R32V) -- A WORKING SPOUSE'S WAGES FUND
 * RETIREMENT SPENDING.
 *
 * Spending starts at the primary's retirement age; a younger spouse works on until their own age reaches it. The wages paid the
 * wage-only tax and the rest left the model, so the portfolio paid all of the spending -- while the same dollars entered as an
 * `employment` income stream did offset it. R32V: "Define pre-retirement wages excluded separately from wages actually earned
 * during modeled retirement spending."
 *
 * The rule built: in a row with retirement spending, the net pay earned AFTER the household's retirement date -- that share of the
 * row's wages, less the same share of the pay-funded contributions and of the wage-only tax -- pays spending before the portfolio
 * does, up to the spending. Pay beyond the spending is treated as pay before retirement always has been: spent outside the model,
 * not saved (a stated convention, not a law).
 *
 * The audit's household: MFJ, the self 65 and retired, the spouse 60 with a $60,000 salary, $60,000 fixed-nominal spending, a
 * $1,000,000 Roth. 2026 figures: payroll 60,000 x 7.65% = 4,590; federal (60,000 - 32,200 - 1,650 - 6,000) x 10% = 2,015; Arizona
 * (60,000 - 32,200 - 2,100) x 2.5% = 642.50. Net wages 52,752.50. */
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

function plan(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 65, retireAge: o.retireAge || 65, endAge: 66, spouseOn: true, spouseAge: 60, filing: 'mfj', state: p.profile.state });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: o.stream ? 0 : 60000, growth: 0, contributionStop: 70 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: o.spending || 60000, dividendOn: false, stages: [], expenses: [],
    pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false, selfLife: 95, spouseLife: 95,
    otherIncomes: o.stream ? [{ name: 'Spouse job', type: 'employment', owner: 'spouse', amount: 60000, start: 60, end: 65, growth: 0, growthMode: 'fixed' }] : [] });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [{ id: 'roth', name: 'Roth', type: 'rothIRA', taxClass: 'roth', owner: 'self', balance: 1000000, contribution: 0,
    contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  return p;
}
function row1(o) {
  const r = engine.runPlan(plan(o));
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return r.rows[1];
}
const NET_WAGES = 60000 - 60000 * 0.0765 - 0.10 * (60000 - 32200 - 1650 - 6000) - 0.025 * (60000 - 32200 - 2100);   /* 52,752.50 */

test('R35 SA32F-19: the spouse\'s net wages pay the spending before the portfolio does', () => {
  const r = row1({});
  assert.strictEqual(+r.withdrawals.toFixed(2), +(60000 - NET_WAGES).toFixed(2), 'the Roth pays 7,247.50, not 60,000');
  assert.strictEqual(+r.roth.toFixed(2), +(1000000 - (60000 - NET_WAGES)).toFixed(2));
  /* CONTROL: the same dollars as an employment stream (their tax paid from the portfolio): the same draw, as before. */
  assert.strictEqual(+row1({ stream: true }).withdrawals.toFixed(2), +(60000 - NET_WAGES).toFixed(2));
});

test('R35 SA32F-19: pay beyond the spending is not saved -- the portfolio pays nothing and gains nothing', () => {
  const r = row1({ spending: 30000 });
  assert.strictEqual(r.withdrawals, 0);
  assert.strictEqual(r.roth, 1000000, 'the excess net pay is spent outside the model, as pay before retirement is');
});

test('R35 SA32F-19: only the pay earned after the retirement date counts, in a row that crosses it', () => {
  /* The self retires at 65.5: half the row is retired, spending 30,000; half the year's net pay, 26,376.25, was earned after it.
     The Roth pays 3,623.75. The wage-only tax is the whole row's (the self is 65 by the row's close either way). */
  const r = row1({ retireAge: 65.5 });
  assert.strictEqual(+r.withdrawals.toFixed(2), +(30000 - NET_WAGES / 2).toFixed(2));
});
