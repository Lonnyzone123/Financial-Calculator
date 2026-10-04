/* S5AA R44 (ChatGPT's R43 audit, PR #47; the owner 2026-10-01: repair R43-01, -02 and -03) -- THE CONTRIBUTION ROUTES.
 *
 * R43-01, MEASURED at 5b8f0d5: R43 stopped planned HSA contributions at 65, but a one-time taxable-to-HSA contribution at 66 still
 * deposited $4,400. The owner chose (2026-10-01) to follow IRC 223(b)(1), (2), (3) and (7) on both routes: the year's limit is the sum of
 * the monthly limitations for the months before Medicare (assumed at 65), each 1/12 of the annual amount with the catch-up added
 * (Pub. 969's example: turning 65 in July, ($4,300 + $1,000) x 6 / 12 = $2,650). So in the row an owner turns 65 the limit is the share
 * of the row before 65 times (base + catch-up), and from 65 it is zero, for a planned and a one-time contribution alike.
 * R43-02, MEASURED: a $5,000 today-dollar employment stream starting at 65 pays $12,968.71 there (10% inflation), and a planned $7,500
 * IRA deposit is allowed, but the one-time route recomputed compensation without R43's latch and moved $5,000.
 * R43-03, MEASURED: profitShare -10 was valid and ran, cancelling the match; matchRate and matchCap had the same gap.
 * Expectations are hand-derived; returns are 0, so a deposit is the balance.
 */
'use strict';
const { retireAtEnd } = require('./lib/working-horizon'); // S5AA R53 (the owner's decision 3, 2026-10-04): working-only horizons

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const L = require(path.join(ROOT, 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const engine = L.h.engine;
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));

function run(plan) {
  retireAtEnd(plan); // S5AA R53: an end age before the retirement age is refused; the owner retires at the end age instead (output-neutral, tests/lib/working-horizon.js)
  const valid = validateScenario(structuredClone(plan));
  assert.equal(valid.valid, true, JSON.stringify(valid.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(structuredClone(plan));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  return r;
}

// A single worker of 66 (ChatGPT's witness): a planned and a one-time $4,400 HSA contribution.
function single66(mode) {
  const p = L.basePlan({ age: 66, retireAge: 70, endAge: 67, salary: 10000, spending: 0,
    accounts: [L.account('cash', 'taxable', 20000, { basisPct: 100 }), L.account('hsa', 'hsa', 0, { contribution: mode === 'planned' ? 4400 : 0 })] });
  p.employment.contributionStop = 70;
  if (mode === 'once') Object.assign(p.advanced, { transferOn: true, transferFrom: 'cash', transferTo: 'hsa', transferAmount: 4400, transferAge: 66 });
  return p;
}
// A couple (self 60, so rows close on whole ages) with the HSA the spouse's: a spouse of 64.5 turns 65 halfway through the first row.
// Family coverage: $8,750, and the spouse's $1,000 catch-up; half a row before 65 gives (8,750 + 1,000) x 0.5 = $4,875.
function couple(spouseAge, planned, once) {
  const p = L.basePlan({ age: 60, retireAge: 70, endAge: 61, couple: true, spouseAge, salary: 100000, spouseSalary: 100000, spending: 0,
    accounts: [L.account('brok', 'taxable', 20000, { basisPct: 100 }), L.account('hsa', 'hsa', 0, { owner: 'spouse', contribution: planned })] });
  p.employment.contributionStop = 70;
  p.profile.spouseRetireAge = 75;
  if (once) Object.assign(p.advanced, { transferOn: true, transferFrom: 'brok', transferTo: 'hsa', transferAmount: once, transferAge: 60 });
  return p;
}

test('R44 (R43-01): a one-time HSA contribution at 66 has no room -- the $4,400 stays in taxable, and the note says $0', () => {
  const r = run(single66('once'));
  assert.equal(r.rows[1].hsa, 0);
  assert.equal(r.rows[1].taxable, 20000);
  assert.ok(r.limitWarnings.some((w) => /asked for \$4,400, more than the \$0 of HSA contribution limit/.test(w)), JSON.stringify(r.limitWarnings));
});

test('R44 (R43-01) control: a planned HSA contribution at 66 deposits nothing, as R43 made it', () => {
  assert.equal(run(single66('planned')).rows[1].hsa, 0);
});

test('R44 (R43-01): a one-time $6,000 in the row the spouse turns 65 is held to (8,750 + 1,000) x 0.5 = $4,875', () => {
  const r = run(couple(64.5, 0, 6000));
  assert.equal(r.rows[1].hsa, 4875);
  assert.equal(r.rows[1].taxable, 20000 - 4875);
});

test('R44 (R43-01) control: the same one-time $6,000 for a spouse of 63 is under the full $9,750 and moves in full', () => {
  const r = run(couple(63, 0, 6000));
  assert.equal(r.rows[1].hsa, 6000);
  assert.equal(r.rows[1].taxable, 14000);
});

test('R44 (R43-01): a planned $12,000 in the row the spouse turns 65 flows for half the row ($6,000) and is held to $4,875; $1,125 is redirected', () => {
  const r = run(couple(64.5, 12000, 0));
  assert.equal(r.rows[1].hsa, 4875);
  assert.equal(r.rows[1].taxable, 20000 + 1125);
});

test('R44 (R43-01) control: a planned $4,000 for the same spouse flows $2,000, under the prorated limit, unchanged', () => {
  const r = run(couple(64.5, 4000, 0));
  assert.equal(r.rows[1].hsa, 2000);
  assert.equal(r.rows[1].taxable, 20000);
});

// ChatGPT's R43-02 witness.
function ira(mode) {
  const p = L.basePlan({ age: 55, retireAge: 66, endAge: 66, inflation: 10, salary: 0, spending: 0,
    otherIncomes: [{ id: 'job', name: 'Job', type: 'employment', owner: 'self', amount: 5000, start: 65, end: 66, growth: 0, growthMode: 'fixed' }],
    accounts: [L.account('cash', 'taxable', 20000, { basisPct: 100 }), L.account('ira', 'traditionalIRA', 0, { contribution: mode === 'planned' ? 7500 : 0 })] });
  p.employment.contributionStop = 66;
  if (mode === 'once') Object.assign(p.advanced, { transferOn: true, transferFrom: 'cash', transferTo: 'ira', transferAmount: 7500, transferAge: 65 });
  return p;
}

test('R44 (R43-02): a one-time $7,500 IRA contribution reads the stream at its latched $5,000 x 1.10^10 = $12,968.71, and moves in full', () => {
  const r = run(ira('once')), row = r.rows.find((x) => x.age === 66);
  assert.equal(Math.round(row.income * 100) / 100, 12968.71);
  assert.equal(row.preTax, 7500);
  assert.ok(!r.limitWarnings.some((w) => /transfer asked/.test(w)), JSON.stringify(r.limitWarnings));
});

test('R44 (R43-02) control: the planned $7,500 is allowed, as before', () => {
  assert.equal(run(ira('planned')).rows.find((x) => x.age === 66).preTax, 7500);
});

// ChatGPT's R43-03 witness, and its neighbours.
function employer(field, value) {
  return L.basePlan({ age: 45, retireAge: 46, endAge: 46, salary: 100000, spending: 0,
    accounts: [L.account('cash', 'taxable', 0), L.account('k', 'traditional401k', 0, Object.assign({ contribution: 10000, matchOn: true, matchRate: 50, matchCap: 6, profitShare: 5 }, { [field]: value }))] });
}

test('R44 (R43-03): a negative profitShare, matchRate or matchCap is refused by both layers, at its path', () => {
  for (const [field, value] of [['profitShare', -10], ['matchRate', -50], ['matchCap', -6]]) {
    const plan = employer(field, value);
    const errs = validateScenario(structuredClone(plan)).issues.filter((i) => i.severity === 'ERROR').map((i) => i.code + '@' + i.path);
    assert.ok(errs.includes('OUT_OF_RANGE@accounts[1].' + field), field + ': ' + errs.join(', '));
    const r = engine.runPlan(structuredClone(plan));
    assert.equal(r.calculationErrorCode, 'SCENARIO_PLAN_VALUE_OUT_OF_RANGE', field);
    assert.equal(r.rows, null, field);
  }
});

test('R44 (R43-03) controls: zero is allowed, and 5% profit sharing gives $10,000 + $3,000 + $5,000 = $18,000', () => {
  assert.equal(run(employer('profitShare', 0)).rows[1].preTax, 13000);
  assert.equal(run(employer('profitShare', 5)).rows[1].preTax, 18000);
});
