/* S5AA R37 (SA32F-49; Claude's R32F full-model audit FLOWS-07, confirmed by ChatGPT's R32V) -- THE PERCENT-OF-PORTFOLIO STRATEGIES
 * SAY THE PERCENTAGE SETS SPENDING, WHICH OUTSIDE INCOME HELPS PAY.
 *
 * R32V: "Strategy descriptions say income reduces withdrawals, while their documented implementation reduces spending for the
 * affected strategies. The declared arithmetic is not a new defect; align explanation with it or obtain a policy change."
 * MODEL_ASSUMPTIONS.md section 3: outside income always offsets the draw. For constantPercent and floorCeiling the percentage
 * sets the year's SPENDING; outside income pays part of it and the portfolio funds the rest. Their descriptions said
 * "Withdraws ... percentage of the current portfolio", which is true only with no outside income.
 *
 * Measured by hand below, $1,000,000 in a Roth at 4%, no growth: spending 40,000 either way; with a 20,000 pension the portfolio
 * funds about 20,000, not 40,000. */
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

function firstYear(strategy, pension) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 65, retireAge: 65, endAge: 67, filing: 'single', spouseOn: false });
  Object.assign(p.assumptions, { inflation: 0, returnRate: 0 });
  Object.assign(p.retirement, { strategy, withdrawalRate: 4, floor: 0, ceiling: 10000000, ssClaim: 70 });
  p.retirement.otherIncomes = pension ? [{ name: 'Pension', type: 'pension', owner: 'self', amount: pension, start: 65, end: 100, growthMode: 'fixed', growth: 0 }] : [];
  p.accounts = [{ id: 'r', name: 'Roth', type: 'rothIRA', taxClass: 'roth', owner: 'self', balance: 1000000, contribution: 0 }];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok');
  return r.rows[1];
}

test('R37 SA32F-49: the percentage sets spending, and outside income pays part of it', () => {
  for (const strategy of ['constantPercent', 'floorCeiling']) {
    const alone = firstYear(strategy, 0), withPension = firstYear(strategy, 20000);
    assert.strictEqual(Math.round(alone.spending), 40000);
    assert.strictEqual(Math.round(withPension.spending), 40000, strategy + ': the percentage sets spending');
    assert.ok(withPension.withdrawals < 21000 && withPension.withdrawals > 19000, strategy + ': the portfolio funds the rest, ' + withPension.withdrawals);
  }
});

test('R37 SA32F-49: the descriptions say so', () => {
  const descriptions = eval('(' + shell.match(/definitions=(\{incomeFirst:[\s\S]*?"\})[;,]/)[1] + ')');
  for (const key of ['constantPercent', 'floorCeiling']) {
    assert.doesNotMatch(descriptions[key], /^Withdraws/, key + ' still says it withdraws the percentage');
    assert.match(descriptions[key], /outside income pays part of it/);
  }
});
