/* S5AA R43 (the owner 2026-09-30: repair all 34 of Claude's R42F findings) -- CASH FLOWS.
 *
 * SA42F-19, MEASURED at c67c713: an other asset "Available starting at age" 65.5 was read at the row's opening, so the fallback
 * could not reach it anywhere in the row from 65 to 66: a $100,000 roof dated 65.75 fell $90,000 short.
 * SA42F-20, MEASURED at c67c713: a spending stage's or income stream's amount was in today's dollars under "Match inflation" and in
 * nominal dollars at its start under the other modes; the owner chose today's dollars for every mode (R35 decision 6's reading).
 * SA42F-21: "Years of spending in reserve" was sized on the hidden, never-inflated spending field.
 * SA42F-26: the annual Roth conversion runs only after the retirement age, which the form did not say.
 * SA42F-28: a one-time income at or after the plan's end age was never paid and nothing said so (the expense was warned since R37).
 *
 * Rows are labelled by their closing age. Every expected figure is hand-derived from the rules and the inputs.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));

const cents = (x) => Math.round(x * 100) / 100;
function run(p) {
  assert.equal(L.h.validateScenario(structuredClone(p)).valid, true);
  const r = L.h.engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  return r;
}
const at = (r, age) => { const row = r.rows.find((x) => Math.abs(x.age - age) < 1e-9); assert.ok(row, 'row ' + age); return row; };
const shell = () => fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');

// SA42F-19: a home available from 65.5, half of its $400,000 accessible, the fallback on.
function home(o) {
  return L.basePlan(Object.assign({ age: 64, retireAge: 64, endAge: 67, networthOn: true, fallback: true,
    otherAssets: [{ id: 'home', name: 'Home', type: 'realEstate', owner: 'self', value: 400000, growth: 0, available: true, availableAge: 65.5, accessPct: 50, liquidity: 'illiquid' }] }, o));
}
test('R43 (SA42F-19): a roof dated 65.75, after the home becomes available at 65.5, is paid from it', () => {
  const r = run(home({ spending: 0, accounts: [L.account('roth', 'rothIRA', 10000)], expenses: [{ name: 'Roof', kind: 'expense', age: 65.75, amount: 100000 }] }));
  assert.equal(cents(at(r, 66).nonPortfolioDraw), 90000);     // the Roth pays $10,000, the home the other $90,000
  assert.equal(cents(at(r, 66).shortfall), 0);
});
test('R43 (SA42F-19): recurring spending in that row is met from the home for the half after 65.5', () => {
  const r = run(home({ spending: 60000, accounts: [L.account('roth', 'rothIRA', 60000)] }));
  assert.equal(cents(at(r, 66).nonPortfolioDraw), 30000);      // $60,000 a year, half of it after 65.5
  assert.equal(cents(at(r, 66).shortfall), 30000);
  assert.equal(cents(at(r, 67).nonPortfolioDraw), 60000);      // the next row, available throughout
});

// SA42F-20: 55 at the start, 3% inflation, a $40,000 stage from 65 to 69 (row boundaries) under each growth mode.
const IF65 = Math.pow(1.03, 10);
function stage(growthMode, annualChange = 0) {
  return L.basePlan({ age: 55, retireAge: 65, endAge: 70, inflation: 3, strategy: 'incomeFirst', spending: 40000,
    stages: [{ name: 'Go-go', start: 65, end: 69, mode: 'amount', value: 40000, growthMode, annualChange }],
    accounts: [L.account('roth', 'rothIRA', 3000000)] });
}
test('R43 (SA42F-20): a stage amount is in today\'s dollars under "No annual change" -- grown to its start, then held', () => {
  const r = run(stage('none'));
  assert.equal(cents(at(r, 66).spending), cents(40000 * IF65));   // 53,756.66
  assert.equal(cents(at(r, 68).spending), cents(40000 * IF65));
});
test('R43 (SA42F-20): under "Fixed 2%" it grows 2% a year from the today\'s-dollar figure at its start', () => {
  const r = run(stage('fixed', 2));
  assert.equal(cents(at(r, 66).spending), cents(40000 * IF65));
  assert.equal(cents(at(r, 67).spending), cents(40000 * IF65 * 1.02));
});
test('R43 (SA42F-20): at 3% inflation, "Fixed 3%" and "Match inflation" agree in every row', () => {
  const f = run(stage('fixed', 3)), m = run(stage('inflation'));
  for (const age of [66, 67, 68]) assert.equal(cents(at(f, age).spending), cents(at(m, age).spending), 'row ' + age);
});
function rent(growthMode, growth) {
  return L.basePlan({ age: 55, retireAge: 55, endAge: 68, inflation: 3, strategy: 'fixedNominal', spending: 0,
    otherIncomes: [{ name: 'Rent', type: 'rental', owner: 'self', amount: 30000, start: 65, end: 90, growth, growthMode }],
    accounts: [L.account('roth', 'rothIRA', 100000)] });
}
test('R43 (SA42F-20): a rental stream from 65 under "Fixed 3%" is today\'s dollars too -- $30,000 x 1.03^10 at its start', () => {
  assert.equal(cents(at(run(rent('fixed', 3)), 66).income), cents(30000 * IF65));     // 40,317.49
  assert.equal(cents(at(run(rent('fixed', 3)), 67).income), cents(30000 * IF65 * 1.03));
});
test('R43 (SA42F-20) control: "Match inflation" and a stream running from the plan\'s start are unchanged', () => {
  assert.equal(cents(at(run(rent('inflation', 0)), 66).income), cents(30000 * IF65));
  const p = rent('fixed', 3); p.retirement.otherIncomes[0].start = 55;
  assert.equal(cents(at(run(p), 57).income), cents(30000 * 1.03));                        // from the start: today's dollars already
});

// SA42F-21: guardrails at 4% of a $3,000,000 Roth earning 7%, two years in reserve at 3%; a $200,000 tax-free income pays the
// $120,000 of spending, so the Roth is not drawn and its growth is the blended rate on $3,000,000. The hidden field is $60,000.
test('R43 (SA42F-21): the reserve is two years of the spending the plan projects, not of the hidden field', () => {
  const p = L.basePlan({ age: 65, retireAge: 65, endAge: 66, returnRate: 7, strategy: 'guardrails', spending: 60000,
    otherIncomes: [{ name: 'Gift', type: 'taxFree', owner: 'self', amount: 200000, start: 0, end: 120, growth: 0, growthMode: 'fixed' }],
    accounts: [L.account('roth', 'rothIRA', 3000000)] });
  Object.assign(p.retirement, { withdrawalRate: 4, floor: 0, ceiling: 1e9, upperGuardrail: 20, lowerGuardrail: 20, adjustment: 10 });
  Object.assign(p.advanced, { reserveOn: true, reserveYears: 2 });
  const row = at(run(p), 66);
  assert.equal(cents(row.spending), 120000);
  // reserve 2 x 120,000 = 240,000 = 8% of 3,000,000: 7% x 0.92 + 3% x 0.08 = 6.68%; the $80,000 surplus is kept as cash
  assert.equal(cents(row.roth), cents(3000000 * 1.0668));
});

test('R43 (SA42F-26), as R45 makes it: the form says when the annual conversion runs, and that it defaults to the retirement age', () => {
  // S5AA R45 (the owner's AA1 decision on AA1-40): conversions start at their own input, defaulting to the retirement age.
  assert.match(shell(), /Annual conversion amount \(each year from the conversion start age\)/);
  assert.match(shell(), /Conversions start at \(your age\)<input class="form-control" id="v2-conversion-start"[^>]*placeholder="your retirement age"/);
});

// SA42F-28: a one-time income at the plan's end age.
test('R43 (SA42F-28): a one-time income at or after the end age is warned, as the expense is', () => {
  const p = L.basePlan({ age: 60, endAge: 63, spending: 0, accounts: [L.account('cash', 'taxable', 100000)],
    otherIncomes: [{ name: 'Inheritance', type: 'oneTimeTaxFree', owner: 'self', amount: 50000, start: 63, end: 63, growth: 0, growthMode: 'fixed' }] });
  const r = run(p);
  const issue = (r.issues || []).find((x) => x.code === 'INCOME_AFTER_PLAN_END');
  assert.ok(issue, JSON.stringify((r.issues || []).map((x) => x.code)));
  assert.equal(issue.severity, 'WARNING');
  assert.equal(issue.state.path, 'retirement.otherIncomes[0].start');
  assert.ok(shell().includes('INCOME_AFTER_PLAN_END:"One-time income after plan end"'), 'the app renders it');
  // control: the same income at 62 is paid and not warned
  p.retirement.otherIncomes[0].start = 62; p.retirement.otherIncomes[0].end = 62;
  assert.ok(!(run(p).issues || []).some((x) => x.code === 'INCOME_AFTER_PLAN_END'));
});
