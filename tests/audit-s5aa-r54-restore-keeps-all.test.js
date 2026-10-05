/* S5AA R54 (R53's D2, "the rest of the restore family"; the owner's decision of 2026-10-04: keep every validated restored value unless
 * the user edits that field) -- RESTORE AND CALCULATION KEEP EVERY VALIDATED VALUE, NOT ONLY THE AGES.
 *
 * R53 kept the eighteen age fields and the manual order. readStatic() still rebuilt the rest of the plan through the form's own clamps
 * and roundings at every calculation, and rebuilt four sections from the inputs alone, so a valid backup was still changed before it was
 * projected: a Monte Carlo plan of 24 runs ran 100, a 2.5% fee charged 2%, an end age of 110 stopped at 100, a withdrawal rate of 16%
 * drew 15%, and the keys the form does not carry (retirement.ssFra, pensionStart, pensionAge, any other) were dropped. A blur of an
 * untouched field also clamped it to its input's range. The owner's rule: the form shows the stored value and readStatic() rewrites a
 * field only when the user edits it; an edited field keeps the form's precision and range exactly as before; keys without an input are
 * carried unchanged; and a value the validator refuses never reaches the engine this way (it is read as the form reads it, as before).
 *
 * Each case restores a backup through the app's real "Restore backup" input (jsdom, a fresh build of src/) with a stand-in Worker that
 * records the plan the app posts and answers with the engine's runScenario(). "Saved" is localStorage, "shown" the form, "posted" the
 * plan the Worker received. Expectations are hand-derived beside each case.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadCalculator, waitFor, setValue, goToPage } = require('./lib/harness');

const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const engine = L.h.engine;
const { validateScenario } = require(path.join(__dirname, '..', 'src', 'scenario-validator.js'));
const STORAGE_KEY = 'investment-calculator-v2c';
const near = (t, actual, expected, label) => t.test(label, () => assert.ok(Math.abs(actual - expected) < 1e-6, label + ': ' + actual + ' where ' + expected + ' is right'));
const eq = (t, actual, expected, label) => t.test(label, () => assert.deepEqual(actual, expected, label));
const ok = (t, value, label) => t.test(label, () => assert.ok(value, label));
const at = (r, age) => { const row = r.rows && r.rows.find((x) => Math.abs(x.age - age) < 1e-9); assert.ok(row, 'row ' + age); return row; };
const get = (o, k) => k.split('.').reduce((x, f) => (x == null ? undefined : x[f]), o);
const set = (o, k, v) => { const f = k.split('.'); const last = f.pop(); f.reduce((x, g) => x[g], o)[last] = v; };
const base = (o) => { const p = L.basePlan(Object.assign({ dividendOn: true, dividendYield: 0, spending: 0 }, o)); p.profile.rothFirstContributionYear = 2000; p.retirement.ssCola = 0; return p; };
const roth = () => [L.account('roth', 'rothIRA', 100000, { contributionBasis: 100000 })];

function installWorker(w) {
  const posted = [], results = [];
  w.URL.createObjectURL = () => 'blob:r54-worker';
  w.URL.revokeObjectURL = () => {};
  w.Worker = function Worker() {
    this.terminate = () => {};
    this.postMessage = (message) => {
      const plan = JSON.parse(JSON.stringify(message.plan));
      posted.push(plan);
      setTimeout(() => {
        let data;
        try { const result = engine.runScenario(JSON.parse(JSON.stringify(plan))); results.push(result); data = { id: message.id, result }; } catch (e) { data = { id: message.id, error: String(e) }; }
        if (this.onmessage) this.onmessage({ data });
      }, 0);
    };
  };
  return { posted, results };
}
const idle = (s) => !/is-running/.test(s.d.getElementById('v2-performance').className) && !/Waiting/.test(s.d.getElementById('v2-performance').textContent);
function page(dom, spy) {
  const w = dom.window, d = w.document;
  return { w, d, posted: spy.posted, results: spy.results, all: () => JSON.parse(w.localStorage.getItem(STORAGE_KEY)).scenarios, saved: () => JSON.parse(w.localStorage.getItem(STORAGE_KEY)).scenarios[0], field: (id) => d.getElementById(id), status: () => d.getElementById('v2-status').textContent };
}
async function restore(plans) {
  for (const p of plans) assert.deepEqual(validateScenario(structuredClone(p)).issues.filter((i) => i.severity === 'ERROR'), [], 'the candidate must be valid');
  const dom = await loadCalculator();
  const s = page(dom, installWorker(dom.window));
  const input = s.d.getElementById('v2-import-settings'), status = s.d.getElementById('v2-status');
  const app = { version: 2, edition: '2C', page: 'setup', complexity: 'advanced', theme: 'auto', compare: false, active: 0, scenarios: plans };
  Object.defineProperty(input, 'files', { value: [new s.w.File([JSON.stringify({ format: STORAGE_KEY, version: 2, app })], 'backup.json', { type: 'application/json' })], configurable: true });
  status.textContent = '';
  input.dispatchEvent(new s.w.Event('change', { bubbles: true }));
  await waitFor(() => status.textContent !== '' && idle(s) && s.posted.length > 0, { window: s.w, timeoutMs: 30000 });
  return s;
}
async function settle(s) { await new Promise((r) => setTimeout(r, 900)); await waitFor(() => idle(s), { window: s.w, timeoutMs: 30000 }); }
async function edit(s, id, value, until) {
  const e = s.field(id);
  setValue(e, value);
  e.dispatchEvent(new s.w.Event('blur'));
  await waitFor(() => until(s.saved()) && idle(s), { window: s.w, timeoutMs: 30000 });
}
const lastPosted = (s) => s.posted[s.posted.length - 1];

/* Every value readStatic(), save() or normalizedPlan() transformed, each one the validator accepts (no ERROR) and the form changed
   before R54 (in brackets, what the form made of it). [path, restored value, input id] */
const FAMILY = [
  ['profile.endAge', 110, 'v2-end'],                          // [100: normalizedPlan() capped the end age at 100; the validator takes 0-120]
  ['employment.salary', -1000, 'v2-salary'],                  // [0: max(0)]
  ['employment.spouseSalary', -1000, 'v2-spouse-salary'],     // [0]
  ['employment.growth', 35, 'v2-salary-growth'],              // [30 on a blur: the input's range, -20 to 30]
  ['assumptions.returnRate', 25, 'v2-return'],                // [20 on a blur: -5 to 20]
  ['assumptions.inflation', -1, 'v2-inflation'],              // [0 on a blur: 0 to 15]
  ['assumptions.fee', 2.5, 'v2-fee'],                         // [2: clamp 0-2]
  ['assumptions.runs', 24, 'v2-runs'],                        // [100: rounded to hundreds, at least 100]
  ['assumptions.seed', 42.7, 'v2-seed'],                      // [42: max(1, floor)]
  ['assumptions.volatility', -1, 'v2-volatility'],            // [0: max(0); the validator warns]
  ['assumptions.historyStart', 2030, 'v2-history-start'],     // [0: the select lists only data years; read only by the historical method]
  ['retirement.spending', -100, 'v2-spending'],               // [0; the validator warns]
  ['retirement.withdrawalRate', 16, 'v2-withdrawal-rate'],    // [15: clamp 0-15]
  ['retirement.upperGuardrail', 0.5, 'v2-upper-guardrail'],   // [1: max(1)]
  ['retirement.lowerGuardrail', 0.5, 'v2-lower-guardrail'],   // [1]
  ['retirement.adjustment', 0.5, 'v2-adjustment'],            // [1]
  ['retirement.floor', -1, 'v2-floor'],                       // [0]
  ['retirement.ceiling', -1, 'v2-ceiling'],                   // [0]
  ['retirement.dividendYield', 21, 'v2-dividend-yield'],      // [20: clamp 0-20]
  ['retirement.dividendQualified', 120, 'v2-dividend-qualified'], // [100: clamp 0-100; the validator warns, the engine holds it to 100 and says so]
  ['retirement.dividendGrowth', 25, 'v2-dividend-growth'],    // [20: clamp -20 to 20]
  ['retirement.ssBenefit', -1, 'v2-ss-benefit'],              // [0]
  ['retirement.spouseSS', -1, 'v2-spouse-ss'],                // [0]
  ['retirement.pensionCola', 12, 'v2-pension-cola'],          // [10 on a blur: 0 to 10]
  ['retirement.flexibility', 60, 'v2-flexibility'],           // [50: clamp 0-50]
  ['retirement.vpwMinRate', 30, 'v2-vpw-min'],                // [25: save(), clamp 0-25]
  ['retirement.vpwMaxRate', 120, 'v2-vpw-max'],               // [100: save(), clamp 0-100]
  ['retirement.rmdMultiplier', 250, 'v2-rmd-multiplier'],     // [200: save(), clamp 0-200]
  ['retirement.rmdFloor', -1, 'v2-rmd-floor'],                // [0: save(), max(0)]
  ['retirement.ssCola', 20, 'v2-ss-cola'],                    // [15: save(), clamp 0-15]
  ['retirement.survivorSpendingReduction', 75, 'v2-survivor-spending-reduction'], // [50: save(), clamp 0-50; the contract takes 0-100]
  ['advanced.correlation', 1.5, 'v2-correlation'],            // [1: clamp -1 to 1; the validator warns (one asset class)]
  ['advanced.reserveYears', 12, 'v2-reserve-years'],          // [10 on a blur: 0 to 10]
  ['advanced.healthInflation', -2, 'v2-health-inflation'],    // [0: max(0); the contract takes above -100, the validator warns]
  ['advanced.medicareInflation', -99.5, 'v2-medicare-inflation'], // [-99: clamp -99 to 100; the contract takes above -100]
  ['advanced.partDPremium', 150000, 'v2-part-d-premium'],     // [100,000: clamp; the contract has no maximum]
  ['profile.priorIncomeThisYear', 2e9, 'v2-prior-income'],    // [1e9: clamp; the contract has no maximum]
  ['profile.rothFirstContributionYear', 2015.5, 'v2-roth-first-year'], // [2016: rounded]
  ['advanced.ltcYears', 2.5, 'v2-ltc-years'],                 // [3: max(0, round)]
];
// Keys no input carries, dropped when readStatic() rebuilt their section. The engine reads none of them (ssFra decides nothing since R34).
const INERT = [['retirement.ssFra', 60], ['retirement.pensionStart', 67], ['retirement.pensionAge', 65],
  ['profile.zzUnlisted', 'a'], ['employment.zzUnlisted', 'b'], ['assumptions.zzUnlisted', 'c'], ['retirement.zzUnlisted', 'd']];
function familyPlan() {
  // Age 60, retired, a $100,000 Roth, on the simple method.
  const p = base({ age: 60, retireAge: 60, endAge: 62, accounts: roth() });
  for (const [k, v] of FAMILY.concat(INERT)) set(p, k, v);
  return p;
}
function otherPlan() {
  const p = base({ age: 55, retireAge: 65, endAge: 90, accounts: roth() });
  p.id = 'r54-other'; p.name = 'Other'; p.assumptions.fee = 1;
  return p;
}
/* Checks every value in scenario 0: saved always; posted and shown unless another scenario is on the form. */
async function checkAll(t, s, when, onForm = true) {
  const q = s.all()[0];
  for (const [k, v] of FAMILY.concat(INERT)) await eq(t, get(q, k), v, k + ' saved, ' + when);
  if (onForm) {
    const posted = lastPosted(s);
    for (const [k, v] of FAMILY.concat(INERT)) await eq(t, get(posted, k), v, k + ' posted, ' + when);
    for (const [k, v, id] of FAMILY) if (id !== 'v2-history-start') await eq(t, Number(s.field(id).value), v, id + ' shown, ' + when);
  }
}

test('R54 (D2): every restored value the form used to change is kept -- through the calculation, a blur of each untouched field, an unrelated edit and a scenario switch', async (t) => {
  // Kept means the restored value, exactly: shown, saved and posted. (Pre-R54, in brackets beside FAMILY.)
  const s = await restore([familyPlan(), otherPlan()]);
  try {
    await checkAll(t, s, 'after the calculation');
    // Focusing and leaving a field is not an edit: each untouched field is blurred.
    for (const [, , id] of FAMILY) s.field(id).dispatchEvent(new s.w.Event('blur'));
    await settle(s);
    await checkAll(t, s, 'after a blur of each untouched field');
    // An unrelated edit: the scenario's name.
    await edit(s, 'v2-name', 'Renamed', (q) => q.name === 'Renamed');
    await checkAll(t, s, 'after an unrelated edit');
    // A scenario switch and back: the other scenario keeps its own fee (1%), and this one every value.
    s.d.querySelectorAll('#v2-scenario-tabs button')[1].click();
    await settle(s);
    await eq(t, s.all()[1].assumptions.fee, 1, 'the other scenario keeps its fee');
    await checkAll(t, s, 'while the other scenario is shown', false);
    s.d.querySelectorAll('#v2-scenario-tabs button')[0].click();
    await settle(s);
    goToPage(s.d, 'results');
    await waitFor(() => idle(s) && s.posted.length > 0, { window: s.w, timeoutMs: 30000 });
    await checkAll(t, s, 'after switching back');
  } finally { s.w.close(); }
});

test('R54 (control): an edited field is still rounded and clamped exactly as the form does', async (t) => {
  const s = await restore([familyPlan()]);
  try {
    // [input, typed, what the form makes of it]
    const EDITS = [
      ['v2-fee', '3', 'assumptions.fee', 2],                            // the input's maximum on leaving the field, then clamp 0-2
      ['v2-runs', '150', 'assumptions.runs', 200],                      // rounded to hundreds: round(1.5) x 100
      ['v2-seed', '42.9', 'assumptions.seed', 42],                      // floor
      ['v2-withdrawal-rate', '16.5', 'retirement.withdrawalRate', 15],  // the input's maximum, 15
      ['v2-upper-guardrail', '0.4', 'retirement.upperGuardrail', 1],    // the input's minimum, 1
      ['v2-ltc-years', '2.6', 'advanced.ltcYears', 3],                  // a year field: half() on leaving, 2.5; then round(2.5) = 3. The text
      //                                                                   left (2.5) is the restored text, but the field WAS edited: the form's handling applies
      ['v2-end', '115', 'profile.endAge', 100],                         // the input's maximum, 100
      ['v2-part-d-premium', '150001', 'advanced.partDPremium', 100000], // clamp 0-100,000
      ['v2-roth-first-year', '2016.5', 'profile.rothFirstContributionYear', 2017], // round(2016.5)
      ['v2-salary', '-500', 'employment.salary', 0],                    // the input's minimum, 0
      ['v2-survivor-spending-reduction', '80', 'retirement.survivorSpendingReduction', 50], // the input's maximum, 50
      ['v2-medicare-inflation', '-99.7', 'advanced.medicareInflation', -99], // clamp -99 to 100
    ];
    for (const [id, typed, k, expected] of EDITS) {
      await edit(s, id, typed, (q) => get(q, k) === expected);
      await eq(t, get(s.saved(), k), expected, id + ' typed ' + typed);
    }
  } finally { s.w.close(); }
});

test('R54 (D2): a Monte Carlo plan of 24 runs is restored and run with 24 paths', async (t) => {
  // assumptions.runs is an integer from 1 to 10,000 for the validator and the engine. 24 restored: 24 saved, 24 posted, and the engine
  // reports 24 paths requested. (Pre-R54: rounded to hundreds and floored at 100: 100 paths.)
  const p = base({ age: 60, retireAge: 60, endAge: 63, spending: 5000, returnRate: 5, accounts: roth() });
  Object.assign(p.assumptions, { method: 'monteCarlo', runs: 24, seed: 11, volatility: 15 });
  const s = await restore([p]);
  try {
    await eq(t, [s.saved().assumptions.runs, lastPosted(s).assumptions.runs, s.field('v2-runs').value], [24, 24, '24'], 'runs: saved, posted, shown');
    const r = s.results[s.results.length - 1];
    await eq(t, r.requestedPathCount, 24, 'paths the engine was asked to run');
    await ok(t, /^24 simulations/.test(s.status()), 'the status line: ' + s.status());
  } finally { s.w.close(); }
});

test('R54 (D2): an end age of 110 is kept and projected to 110', async (t) => {
  // Age 70, retired at 65, end 110 (the validator takes 0 to 120): the opening row at 70 and one row a year to 110, 41 rows.
  // (Pre-R54: normalizedPlan() capped it at 100: 31 rows, the last at 100.)
  const s = await restore([base({ age: 70, retireAge: 65, endAge: 110, accounts: roth() })]);
  try {
    await eq(t, [s.saved().profile.endAge, lastPosted(s).profile.endAge, s.field('v2-end').value], [110, 110, '110.0'], 'end: saved, posted, shown');
    const r = s.results[s.results.length - 1];
    await eq(t, [r.rows.length, r.rows[r.rows.length - 1].age], [41, 110], 'rows and the last age');
  } finally { s.w.close(); }
});

test('R54 (D2): a 2.5% fee is charged at 2.5%, not 2% -- $97,500 after a year', async (t) => {
  // Age 60, retired, end 61; a $100,000 Roth in a 0% asset class, no spending. The fee comes off the year's return:
  // 100,000 x (1 + 0 - 0.025) = 97,500. (Pre-R54: clamped to 2%: 98,000.)
  const p = base({ age: 60, retireAge: 60, endAge: 61, accounts: roth() });
  p.assumptions.fee = 2.5;
  const s = await restore([p]);
  try {
    await eq(t, [s.saved().assumptions.fee, lastPosted(s).assumptions.fee], [2.5, 2.5], 'fee: saved, posted');
    await near(t, at(s.results[s.results.length - 1], 61).roth, 97500, 'the Roth after a year');
  } finally { s.w.close(); }
});

test('R54 (D2): keys the form does not carry survive a calculation and a second restore, and change no figure', async (t) => {
  // ssFra 60, pensionStart 67, pensionAge 65 and an unlisted key in each rebuilt section. (Pre-R54: dropped at the first calculation.)
  const p = base({ age: 60, retireAge: 60, endAge: 62, accounts: roth() });
  for (const [k, v] of INERT) set(p, k, v);
  const s = await restore([p]);
  let stored;
  try {
    for (const [k, v] of INERT) await eq(t, [get(s.saved(), k), get(lastPosted(s), k)], [v, v], k + ': saved, posted');
    stored = s.saved();
  } finally { s.w.close(); }
  // The saved plan restored again, into a new page.
  const s2 = await restore([stored]);
  try {
    for (const [k, v] of INERT) await eq(t, get(s2.saved(), k), v, k + ' after a second restore');
    // The engine reads none of them: the same rows without them, and with ssFra 75.
    const without = structuredClone(s2.saved()); for (const [k] of INERT) { const f = k.split('.'); delete without[f[0]][f[1]]; }
    const other = structuredClone(s2.saved()); other.retirement.ssFra = 75;
    const rows = (q) => JSON.stringify(engine.runPlan(structuredClone(q)).rows);
    await eq(t, rows(without), rows(s2.saved()), 'the same rows without the keys');
    await eq(t, rows(other), rows(s2.saved()), 'the same rows with ssFra 75');
  } finally { s2.w.close(); }
});

test('R54: from browser storage, a value the validator refuses is read as the form reads it, so it never reaches the engine; a valid value beside it is kept', async (t) => {
  // A plan saved in this browser (read back without the import's validation) with a prior-year MAGI of -5, which the validator refuses
  // (OUT_OF_RANGE, an ERROR) and the engine would run, beside a valid 2.5% fee. The MAGI is read through the form: max(0) = 0, as before
  // R54. The fee is kept (R54: 2.5; pre-R54: 2).
  const p = base({ age: 60, retireAge: 60, endAge: 61, accounts: roth() });
  p.advanced.irmaaMagiTwoYearsBefore = -5; p.assumptions.fee = 2.5;
  assert.ok(validateScenario(structuredClone(p)).issues.some((i) => i.severity === 'ERROR' && i.path === 'advanced.irmaaMagiTwoYearsBefore'), 'the validator refuses the MAGI');
  const app = { version: 2, edition: '2C', page: 'plan', complexity: 'advanced', theme: 'auto', compare: false, active: 0, scenarios: [p] };
  const dom = await loadCalculator({ localStorageSeed: { [STORAGE_KEY]: JSON.stringify(app) } });
  const s = page(dom, installWorker(dom.window));
  try {
    // An unrelated edit (the name) calculates the stored plan.
    await edit(s, 'v2-name', 'Stored', (q) => q.name === 'Stored');
    await waitFor(() => s.posted.length > 0 && idle(s), { window: s.w, timeoutMs: 30000 });
    await eq(t, [s.saved().advanced.irmaaMagiTwoYearsBefore, lastPosted(s).advanced.irmaaMagiTwoYearsBefore], [0, 0], 'the refused MAGI: saved, posted');
    await eq(t, [s.saved().assumptions.fee, lastPosted(s).assumptions.fee], [2.5, 2.5], 'the valid fee: saved, posted');
  } finally { s.w.close(); }
});
