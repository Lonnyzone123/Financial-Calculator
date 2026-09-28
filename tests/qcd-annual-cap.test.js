/* S5 task 10: the QCD annual cap. ACCOUNT_RULES_ENGINE_REFERENCE_2026.md section 3, item 7, and section 10.1: for 2026
 * the annual exclusion cap is $111,000 per eligible taxpayer (age 70 1/2 or older), and a one-time split-interest
 * election has a $55,000 sublimit inside that cap, not above it (IRS Notice 2025-67).
 *
 * Before this task the engine bounded a QCD by the year's required distribution alone, so a $150,000 request against a
 * $198,000 RMD excluded $150,000 from income. Like every other limit in the engine the cap is the 2026 figure, not
 * indexed forward. The split-interest sublimit is recorded; the engine takes no election input, so it never binds.
 *
 * CORRECTED (S5R-02 and S5R-03, the 2026-09-16 external audit; the owner's answers 2 (A) and 4 (A) of 2026-09-16). This file
 * asserted the rule task 10 implemented, which was wrong twice: a spouse 70 1/2 or older doubled the household cap even
 * with no IRA of their own ($150,000 was excluded in full and $250,000 at $222,000, where the owner can exclude at most
 * $111,000), and a partial first year prorated the annual cap ($150,000 a year over half a year was excluded at
 * $55,500, not the $75,000 requested). The cap is per owner of the IRA, and annual. Each corrected case names the
 * figure it replaces; tests/audit-s5r02-s5r03-qcd-owner-year.test.js holds the owner and year cases.
 *
 * Each case compares the first full row's MAGI with and without the request. With zero returns, and spending covered
 * by the RMD cash that the QCD leaves, the difference is the amount excluded. Where the QCD takes the whole RMD,
 * spending is zero, so no further IRA withdrawal adds to MAGI.
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
const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');
const vocabulary = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'authority-status-vocabulary.json'), 'utf8'));
const NOTICE = 'https://www.irs.gov/pub/irs-drop/n-25-67.pdf';

function plan({ age = 80, qcd, spouseAge = null, balance = 6000000, spending = 10000 }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  const spouse = spouseAge !== null;
  Object.assign(p.profile, { age, retireAge: 60, endAge: Math.floor(age) + 2, spouseOn: spouse, spouseAge: spouse ? spouseAge : age, filing: spouse ? 'mfj' : 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending, ssBenefit: 0, spouseSS: 0, pension: 0, otherIncomes: [], stages: [], expenses: [], dividendOn: false });
  Object.assign(p.advanced, { rmdOn: true, qcd, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = [{ id: 'ira', name: 'IRA', owner: 'self', type: 'traditionalIRA', taxClass: 'preTax', balance, basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  return p;
}
/* The amount excluded in the first full row: MAGI without the request minus MAGI with it. */
function excluded(opts) {
  const without = engine.runPlan(plan(Object.assign({}, opts, { qcd: 0 })));
  const withQcd = engine.runPlan(plan(opts));
  assert.equal(without.status, 'ok');
  assert.equal(withQcd.status, 'ok');
  return without.rows[1].magi - withQcd.rows[1].magi;
}
const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) <= 1, what + ': ' + actual + ', expected ' + expected);

test('a QCD request above the 2026 cap is excluded at $111,000 for one eligible owner', () => {
  near(excluded({ qcd: 150000 }), 111000, '$150,000 requested, owner 80');
});

test('S5R-02: a spouse 70 1/2 or older with no IRA of their own adds no cap: $150,000 and $250,000 are excluded at the owner\'s $111,000', () => {
  near(excluded({ qcd: 150000, spouseAge: 80 }), 111000, '$150,000 requested, both 80, the IRA the owner\'s (task 10 asserted $150,000)');
  near(excluded({ qcd: 250000, spouseAge: 80 }), 111000, '$250,000 requested, both 80, the IRA the owner\'s (task 10 asserted $222,000)');
});

test('a spouse under 70 1/2 adds no cap: the household is capped at $111,000', () => {
  near(excluded({ qcd: 150000, spouseAge: 65 }), 111000, '$150,000 requested, owner 80, spouse 65');
});

test('S5R-03: a partial first year prorates the request, not the annual cap', () => {
  near(excluded({ qcd: 150000, age: 80.5 }), 75000, '$150,000 a year requested over half a year (task 10 asserted $55,500)');
});

test('the QCD cap and the split-interest sublimit are recorded in the parameter-record shape, OFFICIAL_2026, citing IRS Notice 2025-67', () => {
  const records = (RULES.retirement.qcd && RULES.retirement.qcd.records) || [];
  const find = (id) => records.find((r) => r.provision_id === id);
  assert.equal(find('qcd_annual_cap') && find('qcd_annual_cap').value, 111000);
  assert.equal(find('qcd_annual_cap').filing_status, 'per_eligible_taxpayer');
  assert.equal(find('qcd_split_interest_sublimit') && find('qcd_split_interest_sublimit').value, 55000);
  const statuses = vocabulary.values.map((v) => v.status);
  for (const r of records) {
    assert.equal(r.status, 'OFFICIAL_2026');
    assert.ok(statuses.includes(r.status));
    assert.equal(r.source_url, NOTICE);
    assert.equal(r.tax_year, 2026);
  }
});

test('control: a request below the cap is excluded in full', () => {
  near(excluded({ qcd: 50000 }), 50000, '$50,000 requested');
});

test('control: the required distribution still bounds the QCD when it is smaller than both the request and the cap', () => {
  const rmd = 1000000 / RULES.retirement.rmd.uniformLifetime['80'];
  near(excluded({ qcd: 150000, balance: 1000000, spending: 0 }), rmd, '$150,000 requested against a ' + Math.round(rmd) + ' RMD');
});
