/* S5AA R33 (SA32F-34; Claude's R32F full-model audit, confirmed by ChatGPT's R32V) -- THE CAPITAL-LOSS CARRYOVER ADDS BACK
 * THE SECTION 151 DEDUCTION.
 *
 * IRC 1212(b)(2)(B): the loss a year uses is measured against "adjusted taxable income" -- taxable income (which may be negative)
 * increased by "(i) the amount allowed for the taxable year under section 1211(b)" AND "(ii) the deduction allowed for such year
 * under section 151". The senior deduction is allowed under 151(d)(5)(C). The engine added back only (i), so in a low-income
 * senior year it treated less of the loss as used and carried more forward than the statute allows.
 *
 * Year 1: single, 70, a 20,000 pension; 30,000 of spending draws a 10,000 taxable account whose basis is 23,000 -- a 13,000 loss.
 *   AGI 20,000 - 3,000 = 17,000; deductions 16,100 + 2,050 + 6,000 = 24,150; taxable income -7,150; adjusted taxable income
 *   -7,150 + 3,000 + 6,000 = 1,850; loss used 1,850; carryover 13,000 - 1,850 = 11,150 (the engine carried 13,000).
 * Year 2: 80,000 of ordinary income (the pension and 60,000 of consulting), spending 100,000, so a zero-basis account sells G = 20,000
 *   + tax(G). The gain less the 11,150 carryover is taxed at 15% above ordinary taxable income in the 22% bracket; the senior
 *   deduction phases out at 6% of MAGI over 75,000; Arizona 2.5% of AGI less 16,100 and the 2,100 exemption. Solved by bisection
 *   on that written formula -- the engine is not consulted. */
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

const acct = (id, balance, basisPct, priority) => ({ id, name: id, type: 'taxable', taxClass: 'taxable', owner: 'self', balance, basisPct,
  contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
  futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority });

function run() {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 70, retireAge: 70, endAge: 72, spouseOn: false, spouseAge: 70, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 70 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 30000, dividendOn: true, dividendYield: 0, dividendStart: 70,
    pension: 20000, pensionCola: 0, ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], selfLife: 100,
    withdrawalOrder: 'manual', manualOrder: 'taxable,preTax,roth,hsa',
    expenses: [{ name: 'Year-2 purchase', age: 71, amount: 70000 }],
    otherIncomes: [{ name: 'Consulting', type: 'other', owner: 'self', amount: 60000, start: 71, end: 72, growth: 0, growthMode: 'fixed' }] });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false, assetsOn: false });
  p.accounts = [acct('loss', 10000, 230, 1), acct('gain', 500000, 0, 2)];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  return r;
}

/* Year 2's tax, by hand, for a sale of G with `carry` of loss carried in. */
function year2Tax(G, carry) {
  const net = G - carry;                                   // positive here: the gain exceeds the carry
  const agi = 80000 + net;
  const senior = Math.max(0, 6000 - 0.06 * Math.max(0, agi - 75000));
  const ordinaryTaxable = 80000 - (16100 + 2050 + senior); // in the 22% bracket (50,400 to 105,700)
  const federal = 5800 + 0.22 * (ordinaryTaxable - 50400) + 0.15 * net;
  const arizona = 0.025 * (agi - 16100 - 2100);
  return federal + arizona;
}
function solveTax(carry) {
  let lo = 0, hi = 200000;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (m - 20000 - year2Tax(m, carry) > 0) hi = m; else lo = m; }
  return year2Tax(lo, carry);
}

test('R33 SA32F-34: the carryover out of a low-income senior year adds back the senior deduction (IRC 1212(b)(2)(B)(ii))', () => {
  const r = run();
  assert.strictEqual(r.rows[1].federalAgi, 17000, 'CONTROL: year 1 AGI is the pension less the 3,000 loss deduction');
  assert.strictEqual(r.rows[1].taxes, 0, 'CONTROL: no tax in year 1');
  const expected = solveTax(11150);
  assert.ok(Math.abs(r.rows[2].taxes - expected) < 0.01,
    'year 2 tax on the gain net of the statutory 11,150 carryover: expected ' + expected.toFixed(2) + ', got ' + r.rows[2].taxes);
  /* CONTROL: the engine's old 13,000 carryover gives a different, lower figure, so the test can tell them apart. */
  assert.ok(solveTax(13000) < expected - 100, 'the two carryovers must differ materially');
});
