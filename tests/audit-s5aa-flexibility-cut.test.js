/* S5AA task 2.2, Q109 -- the down-year flexibility cut is a LEVEL, not a ratchet.
 *
 * The same carried base as task 2.1, and the same defect in it: `base *= 1-r.flexibility/100` wrote the cut into
 * what the next year starts from, so each year's cut was taken from the previous year's already-cut figure.
 * Measured at the start commit: 80,000 -> 72,000 -> 64,800 -> 58,320 -> 52,488. A household that said it could cut
 * 10% in a bad year was modelled as accepting a permanent 10% reduction, and another on the next bad year.
 *
 * THE POLICY IS DECIDED, NOT DISCOVERED. A-02 reads H-05 as "policy decided (17.4 (a)); implementation and
 * verification pending", so everything about WHEN the cut fires is written down in
 * Handover temp/S5AA_FLEXIBILITY_POLICY_20260920.md and left exactly as it is: the signal is the immediately
 * preceding period's return, the lookback is one period, the trigger is strictly negative, there is no hysteresis
 * or phase-in, and the cut multiplies the staged, inflated figure. This file changes none of that. It changes only
 * whether the cut is remembered.
 *
 * WHICH YEARS SHOULD BE CUT IS DERIVED FROM THE RETURN SERIES, NOT LISTED. A hard-coded list of ages would be a
 * restatement of whatever the engine happens to do; deriving "row N is cut if and only if the series return for
 * row N-1 was negative" from HIST_RETURNS is an independent statement of the policy, and it is what the assertions
 * below compare against.
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

const START_AGE = 65;
const END_AGE = 85;
const HISTORY_START = 1970;   /* 1973 and 1974 are consecutive down years, and 1975-76 recover hard */
const FLEX = 10;

function fixture(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: START_AGE, retireAge: START_AGE, endAge: END_AGE, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'historical', historyStart: HISTORY_START, inflation: 0, fee: 0, seed: 42791 });
  Object.assign(p.retirement, {
    strategy: 'fixedReal', spending: 80000, withdrawalRate: 4, flexibility: 0, dividendOn: false,
    stages: [], expenses: [], otherIncomes: [], ssBenefit: 0, spouseSS: 0, survivor: false, survivorSpendingReduction: 0,
  });
  p.accounts = [{ id: 'a1', name: 'Taxable', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 20000000, basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  if (edit) edit(p);
  return p;
}
function spendByAge(p) {
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  const out = {};
  r.rows.forEach((row) => { out[row.age] = row.spending; });
  return out;
}

/* The policy, restated from the series rather than from the engine. Row index yi (age START_AGE+1+yi) is cut if
 * and only if the return the PREVIOUS row saw was negative. The first projected row has no previous row. */
const startIndex = engine.HIST_RETURNS.findIndex((x) => x[0] >= HISTORY_START);
const cutAges = new Set();
for (let yi = 1; yi <= END_AGE - START_AGE; yi++) {
  const prior = engine.HIST_RETURNS[(startIndex + yi - 1) % engine.HIST_RETURNS.length];
  if (prior[1] < 0) cutAges.add(START_AGE + 1 + yi);
}

const uncut = spendByAge(fixture());

test('S5AA 2.2: the series really does contain consecutive down years, or this file proves nothing', () => {
  const years = [];
  for (let yi = 0; yi <= END_AGE - START_AGE; yi++) {
    const y = engine.HIST_RETURNS[(startIndex + yi) % engine.HIST_RETURNS.length];
    if (y[1] < 0) years.push(y[0]);
  }
  assert.ok(years.length >= 3, 'need several down years in the window, got ' + JSON.stringify(years));
  let consecutive = false;
  for (let i = 1; i < years.length; i++) if (years[i] === years[i - 1] + 1) consecutive = true;
  assert.ok(consecutive, 'CONTROL: the whole point is successive down years; got ' + JSON.stringify(years));
});

test('S5AA 2.2: a cut year spends exactly (100 - flexibility)% of the uncut level, however many down years preceded it', () => {
  const cut = spendByAge(fixture((p) => { p.retirement.flexibility = FLEX; }));
  const wrong = [];
  for (const age of Object.keys(uncut).map(Number)) {
    if (!cutAges.has(age)) continue;
    const ratio = cut[age] / uncut[age];
    if (Math.abs(ratio - (1 - FLEX / 100)) > 1e-9) {
      wrong.push('age ' + age + ': ratio ' + ratio.toFixed(6) + ', expected ' + (1 - FLEX / 100)
        + ' (cut ' + Math.round(cut[age]) + ' against uncut ' + Math.round(uncut[age]) + ')');
    }
  }
  assert.deepStrictEqual(wrong, [], 'each cut is taken from the CURRENT uncut level, never from the previous cut');
});

test('S5AA 2.2: a year after a non-negative return spends the full uncut level -- the cut lifts immediately', () => {
  const cut = spendByAge(fixture((p) => { p.retirement.flexibility = FLEX; }));
  const wrong = [];
  for (const age of Object.keys(uncut).map(Number)) {
    if (cutAges.has(age)) continue;
    if (Math.abs(cut[age] / uncut[age] - 1) > 1e-9) {
      wrong.push('age ' + age + ': ' + Math.round(cut[age]) + ' against uncut ' + Math.round(uncut[age]));
    }
  }
  assert.deepStrictEqual(wrong, [], 'there is nothing to recover from -- the base was never reduced');
});

test('S5AA 2.2: successive down years do not compound 90% into 81% and 72.9%', () => {
  /* The finding, stated as the finding states it. Take the consecutive down-year run and assert each cut year sits
   * at the same ratio, rather than each one deeper than the last. */
  const cut = spendByAge(fixture((p) => { p.retirement.flexibility = FLEX; }));
  const run = [...cutAges].sort((a, b) => a - b).filter((a, i, all) => i > 0 && all[i - 1] === a - 1);
  assert.ok(run.length >= 1, 'CONTROL: the window must contain a consecutive cut pair');
  const wrong = [];
  for (const age of run) {
    const thisRatio = cut[age] / uncut[age];
    const prevRatio = cut[age - 1] / uncut[age - 1];
    if (Math.abs(thisRatio - prevRatio) > 1e-9) {
      wrong.push('age ' + age + ': ratio ' + thisRatio.toFixed(6) + ' but the year before was ' + prevRatio.toFixed(6));
    }
  }
  assert.deepStrictEqual(wrong, [], 'a second consecutive down year must not deepen the cut');
});

test('S5AA 2.2 control: flexibility 0 is untouched, and the cut still fires on the decided signal', () => {
  const same = spendByAge(fixture());
  const wrong = [];
  for (const age of Object.keys(uncut).map(Number)) {
    if (Math.abs(same[age] - uncut[age]) > 1e-9) wrong.push('age ' + age);
  }
  assert.deepStrictEqual(wrong, [], 'CONTROL: flexibility 0 must be identical');

  /* And the cut must still HAPPEN -- a repair that simply stopped cutting would pass every ratio test above by
   * making both runs equal. */
  const cut = spendByAge(fixture((p) => { p.retirement.flexibility = FLEX; }));
  const cutYears = [...cutAges].filter((age) => uncut[age] !== undefined);
  assert.ok(cutYears.length > 0, 'the window must contain cut years');
  assert.ok(cutYears.every((age) => cut[age] < uncut[age] - 1),
    'CONTROL: every decided cut year must actually spend less than the uncut level');
});

test('S5AA 2.2 control: the cut multiplies the STAGED figure, as the policy states', () => {
  /* Stage-then-cut, not cut-then-stage, and the stage is not compounded either (task 2.1). Checked together
   * because 2.1 and 2.2 share one expression and a repair to either could disturb the other. */
  const staged = spendByAge(fixture((p) => {
    p.retirement.flexibility = FLEX;
    p.retirement.stages = [{ start: 70, end: 75, mode: 'percent', value: 50 }];
  }));
  const stagedNoFlex = spendByAge(fixture((p) => {
    p.retirement.stages = [{ start: 70, end: 75, mode: 'percent', value: 50 }];
  }));
  const wrong = [];
  for (const age of Object.keys(stagedNoFlex).map(Number)) {
    const expected = cutAges.has(age) ? stagedNoFlex[age] * (1 - FLEX / 100) : stagedNoFlex[age];
    if (Math.abs(staged[age] - expected) > 1e-6) {
      wrong.push('age ' + age + ': ' + Math.round(staged[age]) + ', expected ' + Math.round(expected));
    }
  }
  assert.deepStrictEqual(wrong, [], 'the cut is a fixed fraction of that year\'s staged amount');
});
