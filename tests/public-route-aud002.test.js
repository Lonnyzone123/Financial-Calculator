'use strict';

/*
 * S5 block 2r -- AUD-002 (audit task T04) through the public entry point.
 *
 * With the survivor benefit on, a spouse who outlives their partner receives
 * the larger of the two Social Security benefits, even when the larger one
 * belonged to the partner who died. Before the repair, a person's benefit was
 * dropped as soon as that person was no longer alive in the row, so the
 * survivor comparison never saw a deceased higher earner's amount, and the
 * survivor kept their own smaller benefit. The coupled guard calls the engine's
 * internal benefit function; this file reads the benefit from runPlan()'s rows,
 * with a fixture of its own.
 *
 * Household: married, both 79.5 and retired, no salary and no spending, a
 * $5,000,000 brokerage account, zero return and inflation, both benefits
 * claimed at 67 (full retirement age, no COLA): $3,000 and $1,000 a month. One
 * spouse dies at 80. The first row (79.5 to 80) pays both, half a year at
 * $48,000; the rows after pay the survivor alone.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require('../src/engine.js');
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function plan(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.profile, { filing: 'mfj', spouseOn: true, age: 79.5, spouseAge: 79.5, retireAge: 65, endAge: 82 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  p.accounts = [{
    id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 5000000, contribution: 0,
    contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0, annualChangeMode: 'amount', frequency: 1,
    changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }];
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, pension: 0, flexibility: 0, dividendOn: false, stages: [], expenses: [], otherIncomes: [],
    ssBenefit: o.self, ssClaim: 67, ssFra: 67, ssAdvanced: false, aime: 0, spouseSS: o.spouse, spouseClaim: 67,
    selfLife: o.selfLife, spouseLife: o.spouseLife, survivor: o.survivor, ssCola: 0,
  });
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  return p;
}
const incomeByAge = (o) => {
  const r = engine.runPlan(plan(o));
  assert.equal(r.status, 'ok', 'the plan runs');
  return new Map(r.rows.map((row) => [row.age, row.income]));
};
const close = (a, b) => Math.abs(a - b) < 1e-6;

/* RE-FIXTURED BY INTENT at S5AA R34 (the owner 2026-09-29: "Follow law everywhere"). At 79.5 both were born 1947: full retirement
   age 66 from the birth year (SA32F-05; `ssFra` no longer decides it), so a claim at 67 carries 12 months of delayed credit, 8%:
   3,240 and 1,080 a month. While both are alive the lower earner also receives the spouse's benefit on the other's record, half the
   higher PIA less their own, 500 a month (SA32F-03; 20 CFR 404.330), which ends at the death. The survivor inherits the deceased's
   3,240 and is past survivor full retirement age, so it is unreduced. */
const HIGH = 3000 * 1.08 * 12, LOW = 1000 * 1.08 * 12, SPOUSAL = 500 * 12;   /* 38,880; 12,960; 6,000 */

test('AUD-002/T04 (runPlan): after a death the survivor receives the larger benefit, whichever spouse earned it', () => {
  for (const [who, o] of [
    ['the higher earner is self', { self: 3000, spouse: 1000, selfLife: 80, spouseLife: 95, survivor: true }],
    ['the higher earner is the spouse', { self: 1000, spouse: 3000, selfLife: 95, spouseLife: 80, survivor: true }],
  ]) {
    const income = incomeByAge(o);
    assert.ok(close(income.get(80), (HIGH + LOW + SPOUSAL) / 2), who + ': premise, half a year with both alive pays $28,920; got ' + income.get(80));
    for (const age of [81, 82]) {
      assert.ok(close(income.get(age), HIGH),
        who + ', age ' + age + ': after the death the survivor receives the larger benefit, $38,880 a year; got ' + income.get(age));
    }
  }
});

test('AUD-002/T04 (runPlan): with the survivor benefit off each spouse keeps their own, and with nobody dying both are paid', () => {
  const off = incomeByAge({ self: 3000, spouse: 1000, selfLife: 80, spouseLife: 95, survivor: false });
  assert.ok(close(off.get(81), LOW) && close(off.get(82), LOW), 'survivor off: the spouse keeps their own $12,960; got ' + off.get(81) + ', ' + off.get(82));
  const both = incomeByAge({ self: 3000, spouse: 1000, selfLife: 95, spouseLife: 95, survivor: true });
  assert.ok(close(both.get(81), HIGH + LOW + SPOUSAL) && close(both.get(82), HIGH + LOW + SPOUSAL), 'nobody dies: both are paid, with the spouse\'s benefit, $57,840; got ' + both.get(81) + ', ' + both.get(82));
});
