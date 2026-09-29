/* S5AA task 3.3, Q95 (F9) -- catch-up contributions are DISREGARDED for the section 415(c) limit.
 *
 * THE CITATION WAS CHECKED BEFORE THE RULE WAS CODED, as task 8.6 requires. Notice 2025-67 was read
 * from the IRS PDF itself, not from a summary page, and every figure the engine carries was confirmed
 * against it; the check is recorded in Handover temp/S5AA_CITATION_CHECKS_20260920.md. The operative
 * rule is IRC 414(v)(3)(A)(ii): a catch-up contribution is not taken into account for section 415(c).
 *
 * WHAT WAS WRONG. The employer room was `totalEmployeeEmployer - c`, where `c` is the WHOLE employee
 * deferral including the catch-up. So a 55-year-old deferring $24,500 plus an $8,000 catch-up was given
 * $39,500 of employer room where the statute leaves $47,500, and a 61-year-old with the $11,250
 * enhanced catch-up was given $36,250.
 *
 * WHAT $47,500 IS AND IS NOT. It is the REMAINING DOLLAR-LIMIT ROOM in this simplified case, not
 * unconditional employer eligibility: compensation, other annual additions and the plan's own terms all
 * still bind, and the tests below assert that the cap is still a cap rather than merely a larger number.
 *
 * ACCOUNT-17-8 -- 415(c) applied per employer group -- is a DIFFERENT item and remains a todo. This file
 * does not touch it, and the fixtures use a single employer so that the two cannot be confused.
 */
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

const W = global.RULES.retirement.workplace;

/* A single filer whose employer contribution is large enough that section 415(c) is the BINDING
   constraint -- a profit-sharing percentage on a high salary -- so the cap decides the answer rather
   than the match rate. One employer only, so ACCOUNT-17-8's per-group question cannot be confused
   with this one. */
function plan(age, deferral, edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age, retireAge: age + 2, endAge: age + 3, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 400000, spouseSalary: 0, contributionStop: age + 2 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 20000, dividendOn: false,
    stages: [], expenses: [], otherIncomes: [], ssBenefit: 0, spouseSS: 0, survivor: false,
  });
  p.accounts = [{
    id: 'w', name: '401k', type: 'traditional401k', taxClass: 'preTax', owner: 'self',
    balance: 0, basisPct: 0, contribution: deferral, contributionMode: 'amount',
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: true, matchCap: 0, matchRate: 0, profitShare: 30, vesting: 100, priority: 1,
  }];
  if (edit) edit(p);
  return p;
}

/* The employer contribution for the first projected year, recovered as the total added less the
   employee's own deferral. Measured through runPlan, in the units the statute is written in. */
function employerRoom(age, deferral, edit) {
  const r = engine.runPlan(plan(age, deferral, edit));
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  const added = Number(r.rows[1].contributions) || 0;
  return added - deferral;
}

const BASE = W.employeeDeferral;                              /* 24,500 */
const WITH_CATCHUP = W.employeeDeferral + W.catchup;          /* 32,500 */
const WITH_ENHANCED = W.employeeDeferral + W.enhancedCatchup; /* 35,750 */
const ROOM = W.totalEmployeeEmployer - BASE;                  /* 47,500 */

test('S5AA 3.3: the rule figures are the ones Notice 2025-67 states for 2026', () => {
  /* The one place these are written as literals. Everything else reads the rule tables, so a record
     edited to a wrong figure cannot be masked by a matching constant elsewhere in this file. */
  assert.strictEqual(W.totalEmployeeEmployer, 72000, 'section 415(c)(1)(A)');
  assert.strictEqual(W.employeeDeferral, 24500, 'section 402(g)(1)');
  assert.strictEqual(W.catchup, 8000, 'section 414(v)(2)(B)(i), age 50 or over');
  assert.strictEqual(W.enhancedCatchup, 11250, 'section 414(v)(2)(E)(i), ages 60-63 -- REMAINS 11,250 for 2026');
  assert.deepStrictEqual(W.enhancedCatchupAges.slice().sort((a, b) => a - b), [60, 61, 62, 63]);
  assert.strictEqual(W.compensationLimit, 360000, 'section 401(a)(17)');
});

test('S5AA 3.3 control: with NO catch-up the room is unchanged, and 415(c) really is what binds', () => {
  /* If the cap were not the binding constraint, every other number in this file would be measuring the
     profit-sharing percentage instead of the statute. */
  const room = employerRoom(45, BASE);
  assert.ok(Math.abs(room - ROOM) < 1, 'at 45 the employer room is 72,000 - 24,500 = 47,500, got ' + Math.round(room));

  const uncapped = 400000 * 0.30;
  assert.ok(uncapped > ROOM, 'CONTROL: the profit share alone would give ' + uncapped
    + ', so the cap is what produces 47,500 -- not the plan terms');
});

test('S5AA 3.3: $24,500 plus an $8,000 catch-up leaves $47,500 of employer room, not $39,500', () => {
  /* The auditor's case. The catch-up is disregarded for 415(c), so the room is measured against the
     NON-catch-up deferral and is identical to the no-catch-up case. */
  const room = employerRoom(55, WITH_CATCHUP);
  assert.ok(Math.abs(room - ROOM) < 1,
    'expected ' + ROOM + ' of employer room, got ' + Math.round(room)
    + ' (the defect gave ' + (W.totalEmployeeEmployer - WITH_CATCHUP) + ')');
  assert.ok(Math.abs(room - employerRoom(45, BASE)) < 1,
    'and it must equal the no-catch-up room exactly -- that is what "disregarded" means');
});

/* S5AA R32 (the owner 2026-09-28: "Use the year-end age"): a catch-up reads the age reached by the row's close, as IRC
   414(v)(2)(B)(i) and (5)(A) read the age attained by the close of the taxable year. A row that opens at 59 closes at 60, so
   the rows in the 60-63 window are the ones opening at 59 to 62, and the row opening at 63 closes at 64, outside it. This
   test named each row by its opening age, which R32 re-reads by one year; the rule it holds is unchanged. */
test('S5AA 3.3: the age 60-63 enhanced catch-up is disregarded too, and by its own larger amount', () => {
  for (const age of W.enhancedCatchupAges) {
    const room = employerRoom(age - 1, WITH_ENHANCED);
    assert.ok(Math.abs(room - ROOM) < 1,
      'in the row closing at ' + age + ' the enhanced catch-up must be disregarded as well: expected ' + ROOM
      + ', got ' + Math.round(room));
  }
  /* CONTROL: 64 is outside the enhanced window, so it takes the ordinary catch-up. If the engine
     treated every age alike, this would pass trivially and the window would be untested. */
  const beyond = employerRoom(63, WITH_CATCHUP);
  assert.ok(Math.abs(beyond - ROOM) < 1, 'in the row closing at 64 the ordinary catch-up applies and is also disregarded');
  const over = employerRoom(63, WITH_ENHANCED);
  assert.ok(over < ROOM - 1,
    'CONTROL: at 64 a deferral of ' + WITH_ENHANCED + ' exceeds the 402(g) plus ordinary catch-up limit, '
    + 'so it must be cut back rather than silently allowed: room ' + Math.round(over));
});

test('S5AA 3.3: a Roth 401(k) catch-up is disregarded for 415(c) as well', () => {
  /* The catch-up share used to be computed only inside the pre-tax Roth-warning branch. A Roth
     account's catch-up is still a catch-up and section 414(v)(3)(A)(ii) does not care about its tax
     character, so stating the rule once fixes this case at the same time. */
  const room = employerRoom(55, WITH_CATCHUP, (p) => {
    p.accounts[0].type = 'roth401k';
    p.accounts[0].taxClass = 'roth';
  });
  assert.ok(Math.abs(room - ROOM) < 1,
    'a Roth 401(k) catch-up must be disregarded too: expected ' + ROOM + ', got ' + Math.round(room));
});

test('S5AA 3.3 MUST STILL BIND: $47,500 is remaining dollar-limit room, not unconditional eligibility', () => {
  /* The checklist is explicit that $47,500 is the remaining room in this simplified case only. The cap
     must still be a cap: compensation and the plan's own terms still bind, and the total annual
     addition excluding the catch-up must never exceed 415(c). */
  const total = (age, deferral) => deferral + employerRoom(age, deferral);

  /* the annual addition, catch-up excluded, is exactly the 415(c) limit and never more */
  assert.ok(Math.abs((total(55, WITH_CATCHUP) - W.catchup) - W.totalEmployeeEmployer) < 1,
    'the annual addition less the catch-up must be exactly 72,000, got '
    + Math.round(total(55, WITH_CATCHUP) - W.catchup));

  /* a small profit share is still the binding constraint -- the cap does not create employer money.
     NOTE the eligible compensation is min(salary, 401(a)(17)) = 360,000, not the 400,000 salary: the
     compensation limit already binds at this fixture's pay, which is itself worth pinning. */
  const eligible = Math.min(400000, W.compensationLimit);
  const small = employerRoom(55, WITH_CATCHUP, (p) => { p.accounts[0].profitShare = 2; });
  assert.ok(Math.abs(small - eligible * 0.02) < 1,
    'with a 2% profit share the plan terms bind, not the cap: expected ' + (eligible * 0.02)
    + ' (2% of the 401(a)(17)-limited ' + eligible + '), got ' + Math.round(small));

  /* and the section 401(a)(17) compensation limit still caps the salary the percentage applies to */
  const highPay = employerRoom(55, WITH_CATCHUP, (p) => {
    p.employment.salary = 900000;
    p.accounts[0].profitShare = 5;
  });
  assert.ok(Math.abs(highPay - W.compensationLimit * 0.05) < 1,
    'the 401(a)(17) limit must still cap eligible compensation: expected '
    + (W.compensationLimit * 0.05) + ', got ' + Math.round(highPay));
});

test('S5AA 3.3: the repair moves the employer contribution UP, and only where a catch-up exists', () => {
  /* Direction and reach, stated as the finding states them. A catch-up-less saver must not move at all. */
  const noCatchup = employerRoom(45, BASE);
  const withCatchup = employerRoom(55, WITH_CATCHUP);
  assert.ok(Math.abs(noCatchup - ROOM) < 1, 'under 50: unchanged');
  assert.ok(withCatchup > W.totalEmployeeEmployer - WITH_CATCHUP + 1,
    'at 55 the room must be larger than the defect allowed');
  assert.ok(Math.abs(withCatchup - noCatchup) < 1, 'and equal to the under-50 room');
});
