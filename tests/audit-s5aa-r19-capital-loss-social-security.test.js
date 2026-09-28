/* S5AA R19 round: R18-01 through runPlan() (ChatGPT's R18 external audit, 2026-09-24, priority 2; repair chosen by the owner
 * 2026-09-23). A capital loss must lower taxable Social Security even when there is no other income: the loss is Form 1040
 * line 7a, and the Social Security Benefits Worksheet combines line 7a on its line 3. The engine capped the deduction at
 * non-Social-Security income, so a retiree living on Social Security got no deduction. The worksheet-level cases are in
 * tests/audit-s5aa-r19-capital-loss-social-security-internals.test.js; this is the auditor's whole-plan witness.
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
const validator = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const round = (x) => Math.round(Number(x) * 100) / 100;
const near = (actual, expected, label) => assert.equal(round(actual), round(expected), label);

test('R18-01: the auditor\'s whole-plan witness -- a loss sold for spending, with $200,000 of Social Security', () => {
  /* Single at 70 for one year; no return, no inflation; dividends on at no yield. One taxable account: $20,000 bought for
     $30,000 (basis 150%). $200,000 a year of Social Security (an income stream) and $220,000 of spending, so the account
     is sold whole: a $10,000 loss. By the worksheet (see the internals file): taxable SS 58,050, AGI 55,050, federal tax
     3,460, Arizona 0. The account is empty, so the tax cannot be funded: the shortfall is the tax, 3,460. The engine
     gave AGI 60,600, tax 4,126 and a shortfall of 4,126. */
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 70, retireAge: 60, endAge: 71, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'annual' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 60 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 220000, ssBenefit: 0, pension: 0, pensionAge: 60, pensionCola: 0,
    stages: [], expenses: [], selfLife: 99, survivor: false, dividendOn: true, dividendYield: 0, dividendStart: 120,
    dividendQualified: 100, withdrawalOrder: 'manual', manualOrder: 'taxable,hsa,roth,preTax',
    otherIncomes: [{ type: 'socialSecurity', owner: 'self', start: 70, end: 71, amount: 200000, growthMode: 'fixed', growth: 0 }] });
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, healthOn: false, ltcOn: false, debts: [], otherAssets: [], conversionOn: false, transferOn: false });
  p.accounts = [{ id: 'b', name: 'Brokerage', owner: 'self', type: 'taxable', taxClass: 'taxable', balance: 20000, basisPct: 150, contribution: 0,
    contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 }];
  assert.equal(validator.validateScenario(JSON.parse(JSON.stringify(p))).valid, true, 'a valid plan');
  const r = engine.runPlan(p);
  const row = r.rows[1];
  near(row.federalAgi, 55050, 'the loss lowers taxable Social Security and AGI');
  near(row.taxes, 3460);
  near(row.shortfall, 3460, 'the unfunded tax is the shortfall, no more');
});
