/* S5AA R34 (SA32F-06, SA32F-07, SA32F-18; Claude's R32F full-model audit, confirmed or qualified by ChatGPT's R32V; the owner
 * 2026-09-29: "Follow law everywhere") -- THE EARNINGS TEST AND A SOCIAL SECURITY STREAM AT A DEATH.
 *
 * SA32F-06: the retirement earnings test counts "net earnings from self-employment" (20 CFR 404.429(a)); SS Act 211(a)(12) takes
 *   the deduction that makes it profit x 0.9235. The engine tested gross profit.
 * SA32F-07: 20 CFR 404.435: "We will not reduce your benefits ... for any month in which ... you had a non-service month in your
 *   grace year". The grace year is the year an owner stops working; the months after the stop are non-service months, and only the
 *   benefits for the months before it can be withheld. The engine withheld from the whole year.
 * SA32F-18: 42 USC 402(a): a benefit ends "with the month preceding the month in which he dies". An other income of type Social
 *   Security kept paying after its owner's death.
 *
 * Each worker is born 1964 (62 in 2026, full retirement age 67), PIA 2,000: 30% off at 62 (1,400 a month), 27.5% off at 62.5
 * (1,450). 2026 exempt amount $24,480, $1 withheld for every $2 above it. A 0% return. */
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

function run(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: o.age, retireAge: o.retireAge, endAge: o.endAge, spouseOn: o.spouseAge !== undefined,
    spouseAge: o.spouseAge === undefined ? o.age : o.spouseAge, filing: o.spouseAge !== undefined ? 'mfj' : 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: o.salary || 0, spouseSalary: 0, growth: 0, contributionStop: 50 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, stages: [], expenses: [],
    otherIncomes: o.otherIncomes || [], pension: 0, ssBenefit: o.pia || 0, ssClaim: o.claim || 67, ssFra: 67, ssCola: 0, spouseSS: 0,
    spouseClaim: 67, survivor: false, selfLife: 95, spouseLife: o.spouseLife || 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [{ id: 't', name: 't', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 1000000, basisPct: 100, contribution: 0,
    contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  return (at) => { const i = r.rows.findIndex((x, k) => k > 0 && Math.abs(r.rows[k - 1].age - at) < 1e-9); return Math.round(r.rows[i].income * 100) / 100; };
}

test('R34 SA32F-06: the earnings test counts net earnings from self-employment, profit x 0.9235', () => {
  /* 62, claims at 62 (16,800 a year), and a 50,000 self-employment profit. Net earnings 46,175; withheld (46,175 - 24,480) / 2 =
     10,847.50; paid 5,952.50. The row's income is the profit plus what is paid: 55,952.50. The engine tested 50,000: 12,760 withheld,
     54,040. */
  const income = run({ age: 62, retireAge: 50, endAge: 63, pia: 2000, claim: 62,
    otherIncomes: [{ name: 'Consulting', type: 'selfEmployment', owner: 'self', amount: 50000, start: 62, end: 63, growth: 0, growthMode: 'fixed' }] });
  assert.strictEqual(income(62), 55952.5);
});

test('R34 SA32F-07: in the grace year only the months before the owner stops working can be withheld', () => {
  /* 62, retires and claims at 62.5, a 60,000 salary: 30,000 earned in the row, all before the claim. The benefit (1,450 a month) is
     paid for the six months after 62.5, all non-service months: nothing is withheld, 8,700. Income 30,000 + 8,700 = 38,700. The
     engine withheld (30,000 - 24,480) / 2 = 2,760 from them: 35,940. */
  assert.strictEqual(run({ age: 62, retireAge: 62.5, endAge: 63, salary: 60000, pia: 2000, claim: 62.5 })(62), 38700);
  /* CONTROL: claimed at 62 while working to 62.5 -- the first six months are service months, paid 8,400 and open to withholding;
     2,760 is withheld: 30,000 + 16,800 - 2,760 = 44,040. */
  assert.strictEqual(run({ age: 62, retireAge: 62.5, endAge: 63, salary: 60000, pia: 2000, claim: 62 })(62), 44040);
});

test('R34 SA32F-18: a Social Security income stream ends at its owner\'s death', () => {
  /* A couple at 70; the spouse owns a 24,000 Social Security stream and dies at 72. The row opening at 72 pays nothing from it. The
     engine paid 24,000 through the plan's end. CONTROL: the row opening at 71 still pays it. */
  const income = run({ age: 70, retireAge: 60, endAge: 75, spouseAge: 70, spouseLife: 72,
    otherIncomes: [{ name: 'Spouse SS', type: 'socialSecurity', owner: 'spouse', amount: 24000, start: 0, end: 100, growth: 0, growthMode: 'fixed' }] });
  assert.strictEqual(income(71), 24000, 'alive');
  assert.strictEqual(income(72), 0, 'after the death');
});
