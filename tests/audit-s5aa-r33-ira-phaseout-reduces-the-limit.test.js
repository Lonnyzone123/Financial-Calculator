/* S5AA R33 (SA32F-10, SA32F-28, SA32F-29; Claude's R32F full-model audit, confirmed by ChatGPT's R32V; the owner
 * 2026-09-29: apply the $10 rounding, "yes") -- THE IRA PHASE-OUTS REDUCE THE LIMIT, NOT THE CONTRIBUTION.
 *
 * IRC 219(g)(1): "each of the dollar limitations contained in subsections (b)(1)(A) ... shall be reduced". 219(g)(2)(B):
 * no limitation is reduced below $200 unless it is reduced to zero; 219(g)(2)(C): a reduction that is not a multiple of
 * $10 is rounded to the next lowest $10. Publication 590-A (2025) Worksheet 1-2: line 4 is the reduced limit, rounded UP
 * to the next $10 with a $200 minimum; line 7 is "the smallest" of line 4, compensation and the contribution.
 * The Roth limit (408A(c)(2)-(3)) is the same 219 limit less the year's other IRA contributions, and it "shall not
 * exceed" the phase-out-reduced limit; 408A(c)(3)(A) applies 219(g)(2)(B)-(C). Worksheet 2-2, line 11: "the lesser of
 * line 8 or line 10".
 *
 * The engine tapered the CONTRIBUTION (4,000 x 0.5 = 2,000 deductible where the law allows 3,750), subtracted the year's
 * traditional contributions from the REDUCED Roth limit (3,750 - 3,000 = 750 where the law allows 3,750), and applied
 * no $200 minimum or $10 rounding to the Roth limit. Every expectation below is worked from the rule, never read from
 * the engine. The Roth MAGI is the engine's declared salary proxy; that proxy is not changed here. */
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

function acct(id, type, taxClass, owner, contribution, priority) {
  return {
    id, name: id, type, taxClass, owner, balance: 0, basisPct: 0,
    contribution, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: priority || 1,
  };
}

/* One working year at a 0% return, so every balance is exactly what was contributed. */
function plan(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.limitPolicy = 'redirect';
  Object.assign(p.profile, {
    age: o.age || 45, retireAge: 60, endAge: (o.age || 45) + 1, spouseOn: !!o.spouseOn, spouseAge: o.age || 45,
    filing: o.spouseOn ? 'mfj' : 'single',
  });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: o.salary || 0, spouseSalary: o.spouseSalary || 0, growth: 0, contributionStop: 60 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0,
    stages: [], expenses: [], otherIncomes: [], ssBenefit: 0, spouseSS: 0, survivor: false,
  });
  const t = acct('t', 'taxable', 'taxable', 'self', 0); t.balance = 100000; t.basisPct = 100;
  p.accounts = [t];
  if (o.workplace) p.accounts.push(acct('w', 'traditional401k', 'preTax', o.workplaceOwner || 'self', o.workplace, 1));
  if (o.ira) p.accounts.push(acct('i', 'traditionalIRA', 'preTax', 'self', o.ira, 2));
  if (o.roth) p.accounts.push(acct('r', 'rothIRA', 'roth', 'self', o.roth, 3));
  retireAtEnd(p); // S5AA R53: an end age before the retirement age is refused; the owner retires at the end age instead (output-neutral, tests/lib/working-horizon.js)
  return p;
}

function row(o) {
  const r = engine.runPlan(plan(o));
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  const byId = Object.fromEntries((r.finalAccounts || r.accounts || []).map((a) => [a.id, a.balance]));
  return { agi: Number(r.rows[1].federalAgi), roth: Number(r.rows[1].roth), preTax: Number(r.rows[1].preTax), byId };
}

test('R33 SA32F-10: the deduction is the smaller of the REDUCED LIMIT and the contribution (single, covered)', () => {
  /* Salary 96,000 and a 10,000 401(k) deferral: MAGI 86,000 in the 81,000-91,000 range. Reduction 7,500 x 5,000/10,000 =
     3,750, a multiple of 10, so the reduced limit is 3,750. A 4,000 contribution deducts min(4,000, 3,750) = 3,750:
     AGI 86,000 - 3,750 = 82,250. The engine tapered the contribution: 4,000 x 0.5 = 2,000, AGI 84,000. */
  assert.strictEqual(row({ salary: 96000, workplace: 10000, ira: 4000 }).agi, 82250);
  /* CONTROL: a full 7,500 contribution deducts the same 3,750 under both readings. */
  assert.strictEqual(row({ salary: 96000, workplace: 10000, ira: 7500 }).agi, 82250);
  /* A contribution below the reduced limit is deducted in full: 3,000 -> AGI 83,000. */
  assert.strictEqual(row({ salary: 96000, workplace: 10000, ira: 3000 }).agi, 83000);
});

test('R33 SA32F-10: the reduced limit starts from the catch-up limit at 50 (IRC 219(b)(5)(B))', () => {
  /* Age 49 at the row's opening, 50 at its close (R32): limit 8,600. MAGI 86,000: reduction 8,600 x 0.5 = 4,300, so a
     4,000 contribution is deducted in full: AGI 86,000 - 4,000 = 82,000. */
  assert.strictEqual(row({ age: 49, salary: 96000, workplace: 10000, ira: 4000 }).agi, 82000);
});

test('R33 SA32F-10: the $10 rounding and the $200 minimum (IRC 219(g)(2)(B)-(C))', () => {
  /* MAGI 86,003: reduction 7,500 x 5,003/10,000 = 3,752.25, rounded down to 3,750; reduced limit 3,750 (the worksheet's
     3,747.75 rounded up). AGI 86,003 - 3,750 = 82,253. */
  assert.strictEqual(row({ salary: 96003, workplace: 10000, ira: 7500 }).agi, 82253);
  /* MAGI 90,990: reduction 7,492.50, rounded down to 7,490; reduced limit 10, raised to the 200 minimum.
     AGI 90,990 - 200 = 90,790. */
  assert.strictEqual(row({ salary: 100990, workplace: 10000, ira: 7500 }).agi, 90790);
  /* MAGI 91,000, the top of the range: reduced to zero, and the minimum does not apply. AGI 91,000. */
  assert.strictEqual(row({ salary: 101000, workplace: 10000, ira: 7500 }).agi, 91000);
});

test('R33 SA32F-10: the joint spouse-covered range reduces the limit too (IRC 219(g)(7))', () => {
  /* Joint; the self contributes, uncovered; the spouse's 401(k) makes the spouse covered. MAGI = 257,000 - 10,000 =
     247,000 in the 242,000-252,000 range: reduction 7,500 x 5,000/10,000 = 3,750; a 5,000 contribution deducts 3,750.
     AGI 247,000 - 3,750 = 243,250. The engine tapered 5,000 x 0.5 = 2,500: AGI 244,500. */
  assert.strictEqual(row({ spouseOn: true, salary: 150000, spouseSalary: 107000, workplace: 10000, workplaceOwner: 'spouse', ira: 5000 }).agi, 243250);
});

test('R33 SA32F-28: the Roth limit is the lesser of the reduced limit and the limit less other IRA contributions', () => {
  /* Single, salary 160,500 (the declared MAGI proxy), no workplace plan: ratio (160,500 - 153,000)/15,000 = 0.5,
     reduction 3,750, reduced limit 3,750. A 3,000 traditional contribution comes first (priority 2). Worksheet 2-2:
     line 8 = 3,750; line 10 = 7,500 - 3,000 = 4,500; limit = 3,750. The engine allowed 3,750 - 3,000 = 750. */
  const r = row({ salary: 160500, ira: 3000, roth: 7500 });
  assert.strictEqual(r.roth, 3750, 'Roth IRA');
  assert.strictEqual(r.preTax, 3000, 'CONTROL: the traditional IRA keeps its 3,000');
  /* When the traditional contribution is larger, line 10 binds: 6,000 traditional leaves 1,500 of Roth room. */
  assert.strictEqual(row({ salary: 160500, ira: 6000, roth: 7500 }).roth, 1500, 'line 10 binds');
});

test('R33 SA32F-29: the Roth limit keeps the $200 minimum and the $10 rounding', () => {
  /* MAGI 167,800: reduction 7,500 x 14,800/15,000 = 7,400, limit 100, raised to 200. */
  assert.strictEqual(row({ salary: 167800, roth: 7500 }).roth, 200);
  /* MAGI 167,999: reduction 7,499.50, rounded down to 7,490; limit 10, raised to 200. The engine allowed 0.50. */
  assert.strictEqual(row({ salary: 167999, roth: 7500 }).roth, 200);
  /* MAGI 160,501: reduction 3,750.50, rounded down to 3,750; limit 3,750. The engine allowed 3,749.50. */
  assert.strictEqual(row({ salary: 160501, roth: 7500 }).roth, 3750);
  /* MAGI 168,000, the top: zero, not the minimum. */
  assert.strictEqual(row({ salary: 168000, roth: 7500 }).roth, 0);
  /* CONTROL: below the range the whole 7,500 goes in. */
  assert.strictEqual(row({ salary: 150000, roth: 7500 }).roth, 7500);
});
