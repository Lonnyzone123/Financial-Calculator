/* S5AA R54 item 4 (the owner's decisions of 2026-10-04 on item 3's readings) -- FIVE RANGES WIDENED IN THE FORM AND THE RULE ALIKE; AN
 * ENTERED SEED MUST BE A WHOLE NUMBER OF AT LEAST 1; THE ENGINE REFUSES A NEGATIVE PRIOR-YEAR MAGI.
 *
 * 1. Item 3 refused, by every route, a value outside the form's range. The owner widened five of those ranges, in the form (its clamp, the
 *    input's min/max, the fee's range slider) and in src/plan-value-contract.json together: the fee 0-5% (was 0-2), the withdrawal rate
 *    0-25% (was 0-15), the guardrail spending adjustment 0% or more (was 1), the dividend growth -50% to 20% (was -20), the survivor
 *    spending reduction 0-75% (was 0-50; the engine held it to 50 where it read it, and now holds it to 75).
 * 2. The form reads the seed as Math.max(1, Math.floor(seed)); an entered seed outside that -- 0, 1.5, -3 -- is refused by both layers.
 *    An ABSENT seed keeps the engine's documented fallback (seed 0).
 * 3. The validator refused a negative prior-year MAGI (R35) and the engine ran it; the engine now refuses it too
 *    (SCENARIO_NEGATIVE_PRIOR_MAGI). Null or absent means not entered and is accepted.
 *
 * Expectations are hand-derived beside each case. The base plan is a retired single person, age 60, a $100,000 qualified Roth in a 0%
 * asset class, no spending, on the simple method.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadCalculator, waitFor, setValue } = require('./lib/harness');

const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const engine = L.h.engine;
const { validateScenario } = require(path.join(__dirname, '..', 'src', 'scenario-validator.js'));
const STORAGE_KEY = 'investment-calculator-v2c';
const set = (o, k, v) => { const f = k.split('.'); const last = f.pop(); f.reduce((x, g) => x[g], o)[last] = v; };
const get = (o, k) => k.split('.').reduce((x, f) => (x == null ? undefined : x[f]), o);
const base = (o) => { const p = L.basePlan(Object.assign({ age: 60, retireAge: 60, endAge: 61, spending: 0, accounts: [L.account('roth', 'rothIRA', 100000, { contributionBasis: 100000 })] }, o)); p.profile.rothFirstContributionYear = 2000; return p; };
const errorsAt = (p, k) => validateScenario(structuredClone(p)).issues.filter((i) => i.severity === 'ERROR' && i.path === k).map((i) => i.code);
const refusal = (p) => engine.runPlan(structuredClone(p)).calculationErrorCode || null;
const at = (r, age) => { const row = r.rows && r.rows.find((x) => Math.abs(x.age - age) < 1e-9); assert.ok(row, 'row ' + age); return row; };
const near = (t, actual, expected, label) => t.test(label, () => assert.ok(Math.abs(actual - expected) < 1e-6, label + ': ' + actual + ' where ' + expected + ' is right'));

// [path, the new edge (accepted), just past it (refused), the old edge item 3 set]
const WIDENED = [
  ['assumptions.fee', 5, 5.01, 2],
  ['retirement.withdrawalRate', 25, 25.01, 15],
  ['retirement.adjustment', 0, -0.01, 1],
  ['retirement.dividendGrowth', -50, -50.01, -20],
  ['retirement.survivorSpendingReduction', 75, 75.01, 50],
];

test('R54 item 4: each widened range accepts its new edge and refuses the value just past it, in both layers', async (t) => {
  // Before item 4 (item 3's ranges) each new edge was refused: fee 5 > 2, withdrawal 25 > 15, adjustment 0 < 1, growth -50 < -20, reduction 75 > 50.
  for (const [k, edge, past] of WIDENED) {
    const p = base(); set(p, k, edge);
    await t.test(k + ' = ' + edge + ': no ERROR at its path', () => assert.deepEqual(errorsAt(p, k), []));
    await t.test(k + ' = ' + edge + ': projected', () => assert.equal(refusal(p), null));
    const q = base(); set(q, k, past);
    await t.test(k + ' = ' + past + ': the validator refuses it', () => assert.deepEqual(errorsAt(q, k), ['OUT_OF_RANGE']));
    await t.test(k + ' = ' + past + ': the engine refuses it', () => assert.equal(refusal(q), 'SCENARIO_PLAN_VALUE_OUT_OF_RANGE'));
  }
});

test('R54 item 4: the widened values are used as entered downstream', async (t) => {
  // A 5% fee comes off the year's 0% return: 100,000 x (1 - 0.05) = 95,000.
  { const p = base(); p.assumptions.fee = 5; await near(t, at(engine.runPlan(p), 61).roth, 95000, 'a 5% fee: the Roth after a year'); }
  // A constant-percentage withdrawal of 25% of the $100,000 balance: 25,000 spent, tax-free from the qualified Roth; 75,000 left. No cap at 15%.
  { const p = base(); Object.assign(p.retirement, { strategy: 'constantPercent', withdrawalRate: 25 }); const r = engine.runPlan(p);
    await near(t, at(r, 61).spending, 25000, 'a 25% withdrawal rate: the year\'s spending'); await near(t, at(r, 61).roth, 75000, 'and the Roth left'); }
  // Guardrails at 4% of $100,000: 4,000 in the first year. The asset class loses 30%, so at 61 the balance is below 4,000 / 4.8% = 83,333 (the
  // upper guardrail, 4% x 1.2): the rule cuts the spending by the adjustment. At 0% the cut is x (1 - 0) -- spending stays 4,000 (no division
  // by the adjustment anywhere); the control at 10% spends 4,000 x 0.9 = 3,600.
  const guard = (adjustment) => { const p = base({ endAge: 62 }); Object.assign(p.retirement, { strategy: 'guardrails', withdrawalRate: 4, adjustment, floor: 0, ceiling: 1e9 });
    p.assumptions.returnRate = -30; p.advanced.assetClasses[0].returnRate = -30; return at(engine.runPlan(p), 62).spending; };
  await near(t, guard(0), 4000, 'a 0% adjustment: the second year\'s spending is not cut');
  await near(t, guard(10), 3600, 'control, a 10% adjustment: cut to 3,600');
  // A couple, both 70; the spouse's life expectancy is 70.5, so the row opening at 71 has one survivor. Fixed spending of $40,000; a 75% survivor
  // reduction leaves 40,000 x 0.25 = 10,000 in that row (the engine held the reduction to 50% where it read it: 20,000).
  { const p = L.basePlan({ couple: true, age: 70, spouseAge: 70, retireAge: 70, endAge: 72, spending: 40000, accounts: [L.account('roth', 'rothIRA', 1000000, { contributionBasis: 1000000 })] });
    p.profile.rothFirstContributionYear = 2000; Object.assign(p.retirement, { survivor: true, survivorSpendingReduction: 75, spouseLife: 70.5, ssBenefit: 0, spouseSS: 0, pension: 0 });
    const r = engine.runPlan(p); await near(t, at(r, 71).spending, 40000, 'the year both are alive at its opening: 40,000'); await near(t, at(r, 72).spending, 10000, 'a 75% survivor reduction: 10,000'); }
  // Dividend growth of -50% a year is accepted and projected.
  { const p = base(); Object.assign(p.retirement, { dividendOn: true, dividendYield: 4, dividendGrowth: -50, dividendStart: 60 }); assert.equal(engine.runPlan(p).status, 'ok'); }
});

test('R54 item 4: through the form, an edited field reaches its new edge and is clamped to it past it', async (t) => {
  // The input's own range on leaving the field, then readStatic()/save()'s clamp: both now the widened range. (Before: the old range -- a fee
  // typed as 5 became 2, a withdrawal rate of 25 became 15, an adjustment of 0 became 1, a growth of -50 became -20, a reduction of 75 became 50.)
  const p = base(); p.profile.spouseOn = true; p.retirement.survivor = true;
  const dom = await loadCalculator();
  const w = dom.window, d = w.document;
  try {
    const input = d.getElementById('v2-import-settings'), status = d.getElementById('v2-status');
    const app = { version: 2, edition: '2C', page: 'setup', complexity: 'advanced', theme: 'auto', compare: false, active: 0, scenarios: [p] };
    Object.defineProperty(input, 'files', { value: [new w.File([JSON.stringify({ format: STORAGE_KEY, version: 2, app })], 'backup.json', { type: 'application/json' })], configurable: true });
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    await waitFor(() => status.textContent !== '' && !/is-running/.test(d.getElementById('v2-performance').className), { window: w, timeoutMs: 20000 });
    const saved = () => JSON.parse(w.localStorage.getItem(STORAGE_KEY)).scenarios[0];
    const IDS = { 'assumptions.fee': 'v2-fee', 'retirement.withdrawalRate': 'v2-withdrawal-rate', 'retirement.adjustment': 'v2-adjustment', 'retirement.dividendGrowth': 'v2-dividend-growth', 'retirement.survivorSpendingReduction': 'v2-survivor-spending-reduction' };
    for (const [k, edge, past] of WIDENED) {
      for (const [typed, expected] of [[String(edge), edge], [String(past), edge]]) {
        const e = d.getElementById(IDS[k]);
        setValue(e, typed); e.dispatchEvent(new w.Event('blur'));
        await new Promise((r) => setTimeout(r, 900));
        await waitFor(() => !/is-running|Waiting/.test(d.getElementById('v2-performance').className + d.getElementById('v2-performance').textContent), { window: w, timeoutMs: 20000 });
        await t.test(IDS[k] + ' typed ' + typed + ': saved ' + expected, () => assert.equal(get(saved(), k), expected));
      }
    }
  } finally { w.close(); }
});

test('R54 item 4: an entered seed must be a whole number of at least 1; an absent seed keeps the engine\'s fallback', async (t) => {
  // The form's own reading, Math.max(1, Math.floor(seed)). Before item 4 a seed of 0, 1.5 or -3 was valid and ran.
  for (const seed of [0, 1.5, -3]) {
    const p = base(); Object.assign(p.assumptions, { method: 'monteCarlo', runs: 20, seed, volatility: 15 });
    await t.test('seed ' + seed + ': the validator refuses it', () => assert.deepEqual(errorsAt(p, 'assumptions.seed'), ['OUT_OF_RANGE']));
    await t.test('seed ' + seed + ': the engine refuses it', () => assert.equal(refusal(p), 'SCENARIO_PLAN_VALUE_OUT_OF_RANGE'));
  }
  const one = base(); Object.assign(one.assumptions, { method: 'monteCarlo', runs: 20, seed: 1, volatility: 15 });
  await t.test('seed 1: accepted and projected', () => { assert.deepEqual(errorsAt(one, 'assumptions.seed'), []); assert.equal(refusal(one), null); });
  const none = base(); Object.assign(none.assumptions, { method: 'monteCarlo', runs: 20, volatility: 15 }); delete none.assumptions.seed;
  await t.test('an absent seed: accepted and projected (the engine falls back to 0)', () => { assert.deepEqual(errorsAt(none, 'assumptions.seed'), []); assert.equal(engine.runPlan(structuredClone(none)).status, 'ok'); });
});

test('R54 item 4: a negative prior-year MAGI is refused by the engine as by the validator; null, absent and 0 are accepted', async (t) => {
  // Before item 4 the validator refused -5 (OUT_OF_RANGE, R35) and the engine projected it.
  for (const k of ['irmaaMagiTwoYearsBefore', 'irmaaMagiOneYearBefore']) {
    const p = base(); p.advanced[k] = -5;
    await t.test(k + ' = -5: the validator refuses it', () => assert.deepEqual(errorsAt(p, 'advanced.' + k), ['OUT_OF_RANGE']));
    await t.test(k + ' = -5: the engine refuses it', () => assert.equal(refusal(p), 'SCENARIO_NEGATIVE_PRIOR_MAGI'));
    for (const v of [null, undefined, 0]) {
      const q = base(); if (v === undefined) delete q.advanced[k]; else q.advanced[k] = v;
      await t.test(k + ' = ' + v + ': accepted by both', () => { assert.deepEqual(errorsAt(q, 'advanced.' + k), []); assert.equal(refusal(q), null); });
    }
  }
});
