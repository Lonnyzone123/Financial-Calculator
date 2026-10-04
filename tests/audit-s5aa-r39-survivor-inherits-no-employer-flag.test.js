/* S5AA R39 (R38-05, ChatGPT's R38 change audit, P2 conditional; the owner 2026-09-29: "go with your recommendations") -- A WORKPLACE PLAN
 * THAT PASSES TO A SURVIVING SPOUSE IS NOT THE SURVIVOR'S CURRENT EMPLOYER'S PLAN.
 *
 * The still-working exception to required distributions (IRC 401(a)(9)(C)(i)(II)) runs to the year the EMPLOYEE retires "from employment
 * with the employer maintaining the plan". The survivor takes the decedent's accounts as their own (SPOUSAL_ROLLOVER_ASSUMED; Treas. Reg.
 * 1.408-8(c), IRC 402(c)(9)), but the succession kept the decedent's `currentEmployerPlan` -- or, left blank, inferred it from the
 * account's contribution field -- so a survivor still working was treated as employed by the decedent's employer and owed nothing. The
 * survivor does not work for that employer, in the decedent's plan or in an IRA; only a rollover into the survivor's OWN employer's plan
 * could qualify, and the plan records no such election. The owner's decision (Claude's recommendation): the flag is cleared when a
 * workplace plan passes.
 *
 * ChatGPT's witness: both 74; the self dies at 74.5; the spouse earns $100,000 until 85; the self's 401(k) holds $100,000; zero return.
 * By hand (Uniform Lifetime Table): the death year's distribution 100,000 / 25.5 = 3,921.57; the survivor's at 75,
 * (100,000 - 100,000 / 25.5) / 24.6 = 3,905.63. The engine: 0. */
'use strict';
const { retireAtEnd } = require('./lib/working-horizon'); // S5AA R53 (the owner's decision 3, 2026-10-04): working-only horizons

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

function rmdAt76(account) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 74, retireAge: 85, endAge: 76, filing: 'mfj', spouseOn: true, spouseAge: 74 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 100000, growth: 0, contributionStop: 85 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 74.5, spouseLife: 100 });
  Object.assign(p.advanced, { rmdOn: true, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [Object.assign({ id: 'a', name: 'A', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 100000, contribution: 0,
    contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0, vesting: 100, priority: 1 }, account)];
  retireAtEnd(p); // S5AA R53: an end age before the retirement age is refused; the owner retires at the end age instead (output-neutral, tests/lib/working-horizon.js)
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return +r.rows.find((x) => Math.abs(x.age - 76) < 1e-9).rmd.toFixed(2);
}

test('R39 R38-05: the survivor owes the required distribution on an inherited 401(k) marked as the decedent\'s current employer\'s', () => {
  assert.strictEqual(rmdAt76({ currentEmployerPlan: true }), 3905.63);   // ChatGPT's witness; the engine: 0
});

test('R39 R38-05: and on one the engine inferred as a current employer\'s plan from its contribution field', () => {
  /* `currentEmployerPlan` left blank reads as yes while the account "receives contributions" (R35's default); the decedent's field
     still says 6,000 after the death. */
  assert.strictEqual(rmdAt76({ contribution: 6000 }), 3905.63);
});

test('R39 R38-05: control -- the same balance in an IRA, as before', () => {
  assert.strictEqual(rmdAt76({ type: 'traditionalIRA' }), 3905.63);
});
