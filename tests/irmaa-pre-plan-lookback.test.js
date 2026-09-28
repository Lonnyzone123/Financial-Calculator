/* S5 task 6.6a and the owner's question 3, answered (A) on 2026-09-14 (UTC−7, late night): the IRMAA two-year lookback, pinned.
 *
 * IRMAA in a year reads MAGI from two years earlier. The engine keeps a MAGI history, one entry per plan year, and read
 * `history[max(0, length − 2)] || 0`: year 0 read nothing (0), but year 1 clamped to year 0's entry. So the first
 * year's MAGI was charged twice, in year 1 at a one-year lag and in year 2 at the correct lag. The owner's answer (A): the
 * two years before the plan count as below the first tier, so plan years 0 and 1 carry no surcharge, and the result
 * says so. From year 2 on the lookback reads its own year's entry, exactly two years back.
 *
 * Each case compares `spending` (which carries the health cost) row by row with a plan that differs only in the
 * income under test. A row's `age` is the end of its interval, so plan year 0 ends in the row after the opening row.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');
const CODE = 'IRMAA_PRE_PLAN_MAGI_ASSUMED';

/* Single, 66, retired at 60, to 74; health costs on; zero returns and inflation; no RMDs. */
function plan({ spikeAge = null, pension = 0, healthOn = true }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 66, retireAge: 60, endAge: 74, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 30000, ssBenefit: 0, spouseSS: 0, pension, pensionCola: 0, stages: [], expenses: [], dividendOn: false,
    otherIncomes: spikeAge === null ? [] : [{ name: 'Spike', type: 'oneTime', owner: 'self', amount: 400000, start: spikeAge, growthMode: 'fixed', growth: 0 }] });
  Object.assign(p.advanced, { healthOn, rmdOn: false, conversionOn: false, transferOn: false, ltcOn: false, otherAssets: [], debts: [] });
  return p;
}
const run = (opts) => { const r = engine.runPlan(plan(opts)); assert.equal(r.status, 'ok'); return r; };
/* Spending added by `r` over `base` in the row ending at `age`. */
const extra = (r, base, age) => r.rows.find((x) => x.age === age).spending - base.rows.find((x) => x.age === age).spending;

test('a MAGI spike in the plan\'s first year is charged once, two years later, and not also in year 1', () => {
  const base = run({}), spiked = run({ spikeAge: 66 });
  assert.equal(Math.round(extra(spiked, base, 67)), 0, 'year 0 (row 67): the year of the spike');
  assert.equal(Math.round(extra(spiked, base, 68)), 0, 'year 1 (row 68): no one-year-lag charge');
  assert.ok(extra(spiked, base, 69) > 0, 'year 2 (row 69): charged at the two-year lag');
  assert.equal(Math.round(extra(spiked, base, 70)), 0, 'year 3 (row 70): released');
});

test('plan years 0 and 1 assume pre-plan MAGI below the first tier: steady high income pays no surcharge in them, and pays from year 2', () => {
  const low = run({}), high = run({ pension: 300000 });
  assert.equal(Math.round(extra(high, low, 67)), 0, 'year 0');
  assert.equal(Math.round(extra(high, low, 68)), 0, 'year 1');
  assert.ok(extra(high, low, 69) > 0, 'year 2');
  assert.ok(extra(high, low, 70) > 0, 'year 3');
});

test('the result discloses the pre-plan lookback assumption once when health costs are on and IRMAA applies in plan year 0 or 1', () => {
  const found = (run({ pension: 300000 }).issues || []).filter((i) => i.code === CODE);
  assert.equal(found.length, 1, 'got ' + found.length);
  assert.equal(found[0].severity, 'WARNING');
});

test('control: a spike in the second plan year is charged exactly two years later, and released the year after', () => {
  const base = run({}), spiked = run({ spikeAge: 67 });
  assert.equal(Math.round(extra(spiked, base, 69)), 0, 'row 69');
  assert.ok(extra(spiked, base, 70) > 0, 'row 70: two years after the spike\'s year');
  assert.equal(Math.round(extra(spiked, base, 71)), 0, 'row 71: released');
});

test('control: at the first IRMAA threshold there is no surcharge, and one dollar over there is', () => {
  const threshold = RULES.medicare.irmaa.singleThresholds[0];
  const none = run({}), at = run({ pension: threshold }), over = run({ pension: threshold + 1 });
  assert.equal(Math.round(extra(at, none, 71)), 0, 'MAGI exactly at the threshold, a steady year');
  assert.ok(extra(over, none, 71) > 0, 'one dollar over');
});

test('control: no pre-plan lookback disclosure when health costs are off', () => {
  assert.equal((run({ pension: 300000, healthOn: false }).issues || []).filter((i) => i.code === CODE).length, 0);
});
