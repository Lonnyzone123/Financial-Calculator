/* S5AA R33 (SA32F-32; Claude's R32F full-model audit, confirmed by ChatGPT's R32V) -- THE CAPITAL-GAINS WORKSHEET'S LINE 25.
 *
 * Form 1040 instructions, Qualified Dividends and Capital Gain Tax Worksheet, line 25: "Enter the smaller of line 23 or line
 * 24" -- line 23 is the ordinary tax plus the preferential tax on the gains and qualified dividends, line 24 the regular tax on
 * ALL taxable income (IRC 1(h)(1): the tax "shall not exceed" the preferential sum). For 2026 the 0% ceiling (Rev. Proc. 2025-32
 * section 4.03: 49,450 single, 98,900 joint) sits below the top of the 12% bracket (50,400, 100,800), so preferential income in
 * that sliver is cheaper at the regular 12% than at 15%. The engine never took line 24. The funding solver mirrors the same
 * min(), so the quote and the settled tax still agree (the row ends ok).
 *
 * Each plan: a retiree at 60 with a pension and a taxable account paying a 5% fully qualified dividend in cash, a 0% return,
 * the tax paid from a cash holding. Arizona taxes AGI less its standard deduction at 2.5% (nobody is 65). */
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

const acct = (id, balance, extra) => Object.assign({ id, name: id, type: 'taxable', taxClass: 'taxable', owner: 'self', balance, basisPct: 100,
  contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
  futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 2 }, extra || {});

function row(filing, pension, dividendBalance) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 61, spouseOn: filing === 'mfj', spouseAge: 60, filing });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 60 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 5, dividendQualified: 100,
    dividendGrowth: 0, dividendStart: 60, pension, pensionCola: 0, ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [],
    otherIncomes: [], withdrawalOrder: 'manual', manualOrder: 'taxable,roth,preTax,hsa', selfLife: 95, spouseLife: 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false, assetsOn: false });
  p.accounts = [acct('cash', 100000, { cashHolding: true, priority: 0 }), acct('brk', dividendBalance)];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  return r.rows[1];
}

test('R33 SA32F-32: single -- qualified dividends in the 49,450-50,400 sliver are taxed at the regular 12%, not 15%', () => {
  /* Pension 65,550 and 950 of dividends: AGI 66,500; ordinary taxable 49,450; taxable income 50,400. Line 23 = 1,240 + 12% x
     37,050 + 15% x 950 = 5,828.50; line 24 = 1,240 + 12% x 38,000 = 5,800; line 25 = 5,800. Arizona 2.5% x (66,500 - 16,100) =
     1,260. Total 7,060. The engine charged line 23: 7,088.50. */
  const r = row('single', 65550, 19000);
  assert.strictEqual(r.dividends, 950, 'CONTROL: the dividends');
  assert.strictEqual(Math.round(r.taxes * 100) / 100, 7060);
});

test('R33 SA32F-32: joint -- the same sliver, 98,900 to 100,800', () => {
  /* Pension 131,100 and 1,900 of dividends: AGI 133,000; taxable income 100,800. Line 23 = 2,480 + 12% x 74,100 + 15% x 1,900 =
     11,657; line 24 = 2,480 + 12% x 76,000 = 11,600. Arizona 2.5% x (133,000 - 32,200) = 2,520. Total 14,120 (was 14,177). */
  assert.strictEqual(Math.round(row('mfj', 131100, 38000).taxes * 100) / 100, 14120);
});

test('R33 SA32F-32 CONTROL: where line 23 is smaller it still applies -- dividends inside the 0% band', () => {
  /* Pension 40,000 and 950 of dividends: taxable income 24,850, all the dividends at 0%. Line 23 = 1,240 + 12% x 11,500 = 2,620;
     line 24 = 1,240 + 12% x 12,450 = 2,734; line 25 = 2,620. Arizona 2.5% x (40,950 - 16,100) = 621.25. Total 3,241.25. */
  assert.strictEqual(Math.round(row('single', 40000, 19000).taxes * 100) / 100, 3241.25);
});
