/* S5AA R39 (R38-01, ChatGPT's R38 change audit, P1; the owner 2026-09-29: "start R39, go with your recommendations") -- AN ANNUAL
 * CONTRIBUTION LIMIT IS NOT CUT BECAUSE SOMEONE WORKED PART OF THE YEAR.
 *
 * auditContributions() capped each account's planned ANNUAL RATE at the annual limit, and the row then multiplied the capped rate by the
 * part of the row the owner worked. A retirement at 45.5 therefore allowed half of each limit: $3,750 of IRA where the half-year's
 * $5,000 is under the $7,500 limit. The section 415(c) and 401(a)(17) ceilings were cut the same way at the match. The IRS: these limits
 * are not prorated merely because a participant is eligible for part of a full limitation year (Issue Snapshots on the 415(c) short
 * limitation year and the 401(a)(17) short plan year); the 2026 amounts are Notice 2025-67's.
 *
 * Now the dollars deposited in the row are held to the annual limit. A row that is itself part of a tax year -- the first row of a plan
 * opening at 45.5 -- still holds them to the limit times the row's share of the year (the owner's decision: the plan does not know what
 * was deposited before it opened). The HSA keeps its proration: its limit is a sum of MONTHLY limits for the months of eligibility
 * (IRC 223(b)(2)), and the model reads eligibility from the contribution window.
 *
 * ChatGPT's witnesses: 45, zero returns, inflation, fees and spending, retiring at 45.5, so the row 45 -> 46 works half a year. */
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
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function plan(age, retireAge, salary, account, policy) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.limitPolicy = policy || 'redirect';
  Object.assign(p.profile, { age, retireAge, endAge: retireAge + 1, filing: 'single', spouseOn: false });
  Object.assign(p.employment, { salary, spouseSalary: 0, growth: 0, contributionStop: retireAge });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [Object.assign({ id: 'a', name: 'A', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 0, contribution: 0,
    contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0, vesting: 100, priority: 1 }, account)];
  return p;
}
function deposited(p, closingAge) {
  assert.ok(validateScenario(p).valid, 'witness must be a valid plan');
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return +r.rows.find((x) => Math.abs(x.age - closingAge) < 1e-9).contributions.toFixed(2);
}

test('R39 R38-01: half a year of work is held to the whole annual limit (ChatGPT\'s four witnesses)', () => {
  /* IRA: $10,000 a year for half a year is $5,000, under the $7,500 limit. The engine allowed half the limit, $3,750. */
  assert.strictEqual(deposited(plan(45, 45.5, 100000, { type: 'traditionalIRA', contribution: 10000 }), 46), 5000);
  /* 401(k): $30,000 a year for half a year is $15,000, under $24,500. The engine: 12,250. */
  assert.strictEqual(deposited(plan(45, 45.5, 100000, { contribution: 30000 }), 46), 15000);
  /* 415(c): $24,500 a year deferred for half a year is 12,250; 20% profit share on the half-year's $150,000 is 30,000; 42,250 is under the
     $72,000 annual-additions limit. The engine held it to half of 72,000: 36,000. */
  assert.strictEqual(deposited(plan(45, 45.5, 300000, { contribution: 24500, profitShare: 20 }), 46), 42250);
  /* 401(a)(17): half a year of a $500,000 salary is $250,000 paid, under the $360,000 compensation limit; 10% is 25,000, plus $500
     deferred. The engine applied the limit to the annual salary and then halved it: 18,000 + 500. */
  assert.strictEqual(deposited(plan(45, 45.5, 500000, { contribution: 1000, profitShare: 10 }), 46), 25500);
});

test('R39 R38-01: a limit still binds on the dollars of a part year, and a whole year is unchanged, under both policies', () => {
  /* $60,000 a year for half a year is $30,000, over the $24,500 limit: redirect holds it to 24,500; warn deposits all 30,000. */
  assert.strictEqual(deposited(plan(45, 45.5, 100000, { contribution: 60000 }), 46), 24500);
  assert.strictEqual(deposited(plan(45, 45.5, 100000, { contribution: 60000 }, 'warn'), 46), 30000);
  /* A whole year of work (retiring at 46): $30,000 planned is held to 24,500 under redirect and deposited in full under warn -- as before. */
  assert.strictEqual(deposited(plan(45, 46, 100000, { contribution: 30000 }), 46), 24500);
  assert.strictEqual(deposited(plan(45, 46, 100000, { contribution: 30000 }, 'warn'), 46), 30000);
  /* The IRA over a whole year: $10,000 planned, 7,500 allowed. */
  assert.strictEqual(deposited(plan(45, 46, 100000, { type: 'traditionalIRA', contribution: 10000 }), 46), 7500);
});

test('R39 R38-01: a row that is itself part of a tax year keeps the limit for that share of the year (the owner\'s decision)', () => {
  /* The plan opens at 45.5, so its first row, 45.5 -> 46, is half a year, and the owner works all of it. $30,000 a year planned is 15,000
     for the half; the limit for half the year is 12,250. */
  assert.strictEqual(deposited(plan(45.5, 47, 100000, { contribution: 30000 }), 46), 12250);
});
