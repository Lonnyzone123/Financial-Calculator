/* S5AA R33 (SA32F-16; Claude's R32F full-model audit, confirmed by ChatGPT's R32V; the owner 2026-09-29, "Yes", for Arizona) --
 * THE AGE-65 AMOUNTS READ THE AGE REACHED BY THE ROW'S CLOSE.
 *
 * IRC 63(f)(1)(A): the additional standard deduction for a taxpayer who "has attained age 65 before the close of his taxable
 * year"; 151(d)(5)(C)(ii)(I): the senior deduction for one who "has attained age 65 before the close of the taxable year";
 * A.R.S. 43-1023(E): Arizona's $2,100 exemption for a taxpayer who "attained sixty-five years of age before the close of the
 * taxable year". R32 treats each projection row as a tax year and reads the catch-ups at its close; the age-65 amounts read
 * the row's OPENING age, so the row a person turns 65 in was taxed as if they were 64. A person who dies inside the row is
 * read at their age at death.
 *
 * Every plan is retired on a flat pension at a 0% return, with the tax paid from a full-basis taxable account, so the row's
 * tax is exactly the federal and Arizona tax on the pension. Rev. Proc. 2025-32: single brackets 10% to 12,400, 12% to
 * 50,400; joint 10% to 24,800; standard deduction 16,100 / 32,200; the addition 2,050 unmarried, 1,650 married. Arizona:
 * 2.5% of AGI less its standard deduction (16,100 / 32,200) and 2,100 for each person 65 or older. */
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

function firstRowTax(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: o.age, retireAge: 60, endAge: Math.floor(o.age) + 1, spouseOn: o.spouseAge !== undefined,
    spouseAge: o.spouseAge === undefined ? o.age : o.spouseAge, filing: o.spouseAge !== undefined ? 'mfj' : 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 60 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, stages: [], expenses: [],
    otherIncomes: [], ssBenefit: 0, spouseSS: 0, survivor: false, pension: o.pension, pensionCola: 0, selfLife: 95, spouseLife: 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [{ id: 't', name: 't', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 500000, basisPct: 100,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  return Math.round(r.rows[1].taxes * 100) / 100;
}

test('R33 SA32F-16: the row a single person turns 65 in carries the age-65 amounts (federal and Arizona)', () => {
  /* Opens 64, closes 65; pension 60,000. Federal: 16,100 + 2,050 + 6,000 (MAGI under 75,000) = 24,150; taxable 35,850; tax
     1,240 + 12% x 23,450 = 4,054. Arizona: 2.5% x (60,000 - 16,100 - 2,100) = 1,045. Total 5,099. The engine read 64:
     5,020 + 1,097.50 = 6,117.50. */
  assert.strictEqual(firstRowTax({ age: 64, pension: 60000 }), 5099);
  /* CONTROL: the row opening at 65 is the same 5,099. */
  assert.strictEqual(firstRowTax({ age: 65, pension: 60000 }), 5099);
  /* CONTROL: the row closing at 64 has none: 5,020 + 1,097.50. */
  assert.strictEqual(firstRowTax({ age: 63, pension: 60000 }), 6117.5);
});

test('R33 SA32F-16: a couple both turning 65 in the row get both amounts on the joint return', () => {
  /* Joint, 90,000: 32,200 + 2 x 1,650 + 2 x 6,000 (MAGI under 150,000) = 47,500; taxable 42,500; tax 2,480 + 12% x 17,700 =
     4,604. Arizona: 2.5% x (90,000 - 32,200 - 4,200) = 1,340. Total 5,944. */
  assert.strictEqual(firstRowTax({ age: 64, spouseAge: 64, pension: 90000 }), 5944);
});

test('R33 SA32F-16: a half-year first row that closes at 65 is a tax year the person reaches 65 in', () => {
  /* Opens 64.5, closes 65: pension 30,000 for the half year. The age-65 amounts apply (what this test is about); at R33 the row
     took the whole year's deduction: 30,000 - 24,150 = 5,850 at 10% = 585, Arizona 2.5% x (30,000 - 16,100 - 2,100) = 295, 880.
     RE-FIXTURED BY INTENT in S5AA R40: a partial row takes its share of each annual amount (half here). Federal: deductions
     (16,100 + 2,050 + 6,000) / 2 = 12,075; taxable 17,925; brackets halved: 10% x 6,200 + 12% x 11,725 = 2,027. Arizona:
     2.5% x (30,000 - 8,050 - 1,050) = 522.50. Total 2,549.50. The engine read 64.5 before R33: no age-65 amounts at all. */
  assert.strictEqual(firstRowTax({ age: 64.5, pension: 60000 }), 2549.5);
});
