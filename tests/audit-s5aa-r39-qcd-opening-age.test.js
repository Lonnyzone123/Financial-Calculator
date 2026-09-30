/* S5AA R39 (ChatGPT's R38 change audit, a disclosure question; the owner 2026-09-29: "go with your recommendations") -- A QCD'S ELIGIBILITY IS
 * READ AT THE ROW'S START, AND THE FORM SAYS SO.
 *
 * IRC 408(d)(8)(B)(ii) allows a qualified charitable distribution from the day the IRA owner is 70 1/2. The plan records no gift date, so,
 * like Q137's 59 1/2 and R37's HSA 65, eligibility is read at the start of each projection year: the year an owner turns 70 1/2 gives no QCD
 * and the next year gives the year's amount. Kept by the owner's decision, declared in qcdOwnerRequests(), stated on the form, and to be
 * decided with the other opening-age conventions at the engine rebuild. This test pins the convention, so a change to it is a decision,
 * not an accident.
 *
 * 70 at the start, $100,000 in a traditional IRA, $10,000 a year of QCD requested, zero return, no spending. */
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

test('R39: the row an owner turns 70 1/2 in gives no QCD; the next gives the year\'s amount (the opening-age convention, declared)', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 70, retireAge: 70, endAge: 72, filing: 'single', spouseOn: false });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 70 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 95 });
  Object.assign(p.advanced, { rmdOn: true, qcd: 10000, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [{ id: 'i', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', owner: 'self', balance: 100000, contribution: 0,
    contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, priority: 1 }];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok');
  const preTax = (age) => r.rows.find((x) => Math.abs(x.age - age) < 1e-9).preTax;
  assert.strictEqual(preTax(71), 100000);   // 70 -> 71: 70 at the row's start, no QCD (and no RMD before 73)
  assert.strictEqual(preTax(72), 90000);    // 71 -> 72: the year's $10,000
  assert.match(fs.readFileSync(path.join(ROOT, 'src', 'engine.js'), 'utf8'), /ELIGIBILITY\s+IS READ AT THE ROW'S START, Q137'S OPENING-AGE CONVENTION/);
});

test('R39: the form\'s QCD field says it starts with the first plan year that opens at 70 1/2 or older', () => {
  assert.match(shell, /Annual qualified charitable distribution \(from the first plan year that starts at 70 1\/2 or older\)<input class="form-control" id="v2-qcd"/);
});
