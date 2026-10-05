/* S5AA R54 (ChatGPT's R53-01; the owner's decision of 2026-10-04: "own field only") -- AN EDIT CHANGES ONLY THE FIELD THE USER EDITED.
 *
 * R53 kept every restored age until its field was edited, but readStatic() still ran its two age clamps whenever a field they read was
 * edited: the retirement age was raised to the current age when the AGE was edited, and the end age to the retirement age when any of
 * the three was. ChatGPT's R53-01: restore a retired household (age 70, retirement 65, end 71), edit only the age to 70.3 (the form
 * makes it 70.5), and the app saved and posted a retirement age of 70.5 while the retirement field still showed 65.0; the half-year's
 * pension fell from $8,445.59 to $5,000. The owner's rule: editing the age never moves the retirement or the end age, and editing the
 * retirement age never moves the end age. A field's own entry handling still applies when it is edited (half years, its input range,
 * and the retirement field's own floor at the current age). An edit that leaves the end age before the retirement age is REFUSED with
 * the named message (R53's decision 3: END_AGE_BEFORE_RETIREMENT / SCENARIO_END_AGE_BEFORE_RETIREMENT); before the current age it is
 * R41's refusal. Nothing is raised silently, the user sees the refusal, and what is shown, saved and posted agree.
 *
 * Each case restores a backup through the app's real "Restore backup" input (jsdom, a fresh build of src/) with a stand-in Worker that
 * records the plan the app posts and answers with the engine's runScenario(), as a browser Worker does. "Saved" is localStorage,
 * "shown" the form, "posted" the plan the Worker received. Returns, inflation, dividends and spending are 0 unless stated.
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
// Each check is its own subtest, so a failing one does not hide the next (the witness run records every pre-repair figure).
const near = (t, actual, expected, label) => t.test(label, () => assert.ok(Math.abs(actual - expected) < 1e-6, label + ': ' + actual + ' where ' + expected + ' is right'));
const eq = (t, actual, expected, label) => t.test(label, () => assert.deepEqual(actual, expected, label));
const ok = (t, value, label) => t.test(label, () => assert.ok(value, label));
const at = (r, age) => { const row = r.rows && r.rows.find((x) => Math.abs(x.age - age) < 1e-9); assert.ok(row, 'row ' + age); return row; };
const base = (o) => { const p = L.basePlan(Object.assign({ dividendOn: true, dividendYield: 0, spending: 0 }, o)); p.profile.rothFirstContributionYear = 2000; p.retirement.ssCola = 0; return p; };
const roth = () => [L.account('roth', 'rothIRA', 100000, { contributionBasis: 100000 })];
const END_REFUSAL = "The projection's ending age is before the retirement age.";

/* A Worker the app can use: it records each plan posted and replies with the engine's runScenario(), the Worker's own call. */
function installWorker(w) {
  const posted = [];
  w.URL.createObjectURL = () => 'blob:r54-worker';
  w.URL.revokeObjectURL = () => {};
  w.Worker = function Worker() {
    this.terminate = () => {};
    this.postMessage = (message) => {
      const plan = JSON.parse(JSON.stringify(message.plan));
      posted.push(plan);
      setTimeout(() => {
        let data;
        try { data = { id: message.id, result: engine.runScenario(JSON.parse(JSON.stringify(plan))) }; } catch (e) { data = { id: message.id, error: String(e) }; }
        if (this.onmessage) this.onmessage({ data });
      }, 0);
    };
  };
  return posted;
}
const idle = (s) => !/is-running/.test(s.d.getElementById('v2-performance').className) && !/Waiting/.test(s.d.getElementById('v2-performance').textContent);
/* Restores `plans` as a backup, waits for the projection, and returns the page. The caller closes. */
async function restore(plans) {
  for (const p of plans) assert.equal(validateScenario(structuredClone(p)).valid, true, 'the candidate must be valid');
  const dom = await loadCalculator();
  const w = dom.window, d = w.document;
  const posted = installWorker(w);
  const input = d.getElementById('v2-import-settings'), status = d.getElementById('v2-status');
  const app = { version: 2, edition: '2C', page: 'setup', complexity: 'advanced', theme: 'auto', compare: false, active: 0, scenarios: plans };
  Object.defineProperty(input, 'files', { value: [new w.File([JSON.stringify({ format: STORAGE_KEY, version: 2, app })], 'backup.json', { type: 'application/json' })], configurable: true });
  status.textContent = '';
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  const s = { w, d, posted, saved: () => JSON.parse(w.localStorage.getItem(STORAGE_KEY)).scenarios[0], field: (id) => d.getElementById(id), status: () => status.textContent };
  await waitFor(() => status.textContent !== '' && idle(s), { window: w, timeoutMs: 20000 });
  return s;
}
/* An edit as a user makes one: type, then leave the field; waits for the projection that follows. */
async function edit(s, id, value, until) {
  const e = s.field(id), n = s.posted.length;
  setValue(e, value);
  e.dispatchEvent(new s.w.Event('blur'));
  await waitFor(() => until(s.saved()) && s.posted.length > n && idle(s), { window: s.w, timeoutMs: 20000 });
}
const lastPosted = (s) => s.posted[s.posted.length - 1];
const planChecks = (s) => Array.from(s.d.querySelectorAll('#v2-plan-checks-list li')).map((li) => li.textContent);

// --- R53-01: ChatGPT's H01, exactly --------------------------------------------------------------------------------------------------
function h01() {
  // A single household, age 70, retired at 65, plan ending at 71; a $100,000 qualified Roth IRA; a $10,000 pension with a 10% COLA from
  // the retirement age; no salary, spending, returns, inflation, dividends or fees.
  const p = base({ age: 70, retireAge: 65, endAge: 71, pension: 10000, accounts: roth() });
  p.retirement.pensionCola = 10;
  return p;
}

test('R54 (R53-01, H01): an age edit keeps the untouched retirement age -- 65 shown, saved and posted; the half-year pension $8,445.585690', async (t) => {
  // The age edited to 70.3 becomes 70.5 (the field's own half-year step). The retirement age stays 65: the pension has grown at 10% a year
  // for 70.5 - 65 = 5.5 years, and the row [70.5, 71) is half a year: 10,000 x 1.10^5.5 x 0.5 = 8,445.585690332558. Pension income under the
  // standard deduction (federal and Arizona): no tax. Spending 0, so the pension stays as cash: closing wealth 100,000 + 8,445.585690 =
  // 108,445.585690. (Pre-R54: the age edit raised the retirement age to 70.5: 10,000 x 1.10^0 x 0.5 = 5,000, wealth 105,000.)
  const s = await restore([h01()]);
  try {
    await eq(t, s.saved().profile.retireAge, 65, 'the retirement age after the restore');
    await edit(s, 'v2-age', '70.3', (q) => q.profile.age === 70.5);
    const q = s.saved(), posted = lastPosted(s);
    await eq(t, q.profile.age, 70.5, 'the edited age, on its half year');
    await eq(t, q.profile.retireAge, 65, 'the saved retirement age');
    await eq(t, s.field('v2-retire').value, '65.0', 'the retirement age the form shows');
    await eq(t, posted.profile.retireAge, 65, 'the posted retirement age');
    await eq(t, [q.profile.endAge, posted.profile.endAge, s.field('v2-end').value], [71, 71, '71.0'], 'the end age: saved, posted, shown');
    const r = engine.runScenario(JSON.parse(JSON.stringify(posted)));
    await near(t, at(r, 71).income, 10000 * Math.pow(1.1, 5.5) * 0.5, 'the pension in [70.5, 71)');
    await near(t, at(r, 71).total, 108445.585690332558, 'the closing portfolio');
    await near(t, at(r, 71).networth, 108445.585690332558, 'the closing net worth');
    await near(t, at(r, 71).taxSettled, 0, 'the settled tax');
  } finally { s.w.close(); }
});

// --- An edit that leaves the end age before the retirement age is refused ----------------------------------------------------------
function working() {
  // Age 60, retiring at 65, plan ending at 80; a $100,000 Roth.
  return base({ age: 60, retireAge: 65, endAge: 80, accounts: roth() });
}

test('R54: an end age edited below the retirement age is refused -- nothing raised, the message shown, stored = shown = posted', async (t) => {
  // End typed as 63 (on its half year): 63 < 65, so the plan is refused (R53's decision 3) with the engine's message; the end age is not
  // raised. The status line names the refusal, Plan checks lists the validator's message, and the results page shows no figures.
  // (Pre-R54: the edit raised the end age to 65 and projected a plan the user did not ask for.)
  const s = await restore([working()]);
  try {
    await edit(s, 'v2-end', '63', () => true);
    const q = s.saved(), posted = lastPosted(s);
    await eq(t, [q.profile.endAge, posted.profile.endAge, s.field('v2-end').value], [63, 63, '63.0'], 'the end age: saved, posted, shown');
    await eq(t, [q.profile.retireAge, posted.profile.retireAge, s.field('v2-retire').value], [65, 65, '65.0'], 'the retirement age: saved, posted, shown');
    await eq(t, engine.runScenario(JSON.parse(JSON.stringify(posted))).calculationErrorCode, 'SCENARIO_END_AGE_BEFORE_RETIREMENT', 'the engine refuses the posted plan');
    await ok(t, s.status().includes(END_REFUSAL), 'the status line names the refusal: ' + s.status());
    await ok(t, planChecks(s).some((x) => x.includes('endAge (63) is before retireAge (65)')), 'Plan checks lists the validator message: ' + JSON.stringify(planChecks(s)));
    goToPage(s.d, 'results');
    await waitFor(() => idle(s), { window: s.w, timeoutMs: 20000 });
    await eq(t, [s.field('v2-stat-end').textContent, s.field('v2-stat-success').textContent], ['—', 'Calc. error'], 'the results page shows no figures');
    await ok(t, s.field('v2-warnings').textContent.includes(END_REFUSAL), 'the results page names the refusal');
    // Correcting the end age (70) projects again, and the refusal leaves the status line and Plan checks.
    await edit(s, 'v2-end', '70', (x) => x.profile.endAge === 70);
    await ok(t, !s.status().includes(END_REFUSAL) && !planChecks(s).some((x) => x.includes('before retireAge')), 'the refusal clears once the end age is corrected');
  } finally { s.w.close(); }
});

test('R54: a retirement age edited past the end age is refused the same way -- the end age is not raised', async (t) => {
  // Age 60, retirement 65, end 70; the retirement age typed as 72.3 becomes 72.5 (its own half-year step; above the age, so its floor at the
  // age does not apply). 70 < 72.5: refused. (Pre-R54: the end age was raised to 72.5.)
  const s = await restore([base({ age: 60, retireAge: 65, endAge: 70, accounts: roth() })]);
  try {
    await edit(s, 'v2-retire', '72.3', (q) => q.profile.retireAge === 72.5);
    const q = s.saved(), posted = lastPosted(s);
    await eq(t, [q.profile.retireAge, posted.profile.retireAge, s.field('v2-retire').value], [72.5, 72.5, '72.5'], 'the retirement age: saved, posted, shown');
    await eq(t, [q.profile.endAge, posted.profile.endAge, s.field('v2-end').value], [70, 70, '70.0'], 'the end age: saved, posted, shown');
    await ok(t, s.status().includes(END_REFUSAL), 'the status line names the refusal: ' + s.status());
    await ok(t, planChecks(s).some((x) => x.includes('endAge (70) is before retireAge (72.5)')), 'Plan checks lists the validator message');
  } finally { s.w.close(); }
});

test('R54: an age edited past the end age is refused as R41 refuses it -- neither the retirement age nor the end age moves', async (t) => {
  // Age 70, retired at 65, end 75; the age typed as 76: the end age is now before the start (R41: END_AGE_BEFORE_START, checked first).
  // (Pre-R54: the retirement age and the end age were both raised to 76, a one-row plan.)
  const s = await restore([base({ age: 70, retireAge: 65, endAge: 75, pension: 10000, accounts: roth() })]);
  try {
    await edit(s, 'v2-age', '76', (q) => q.profile.age === 76);
    const q = s.saved(), posted = lastPosted(s);
    await eq(t, [q.profile.retireAge, q.profile.endAge], [65, 75], 'the saved retirement and end ages');
    await eq(t, [posted.profile.retireAge, posted.profile.endAge], [65, 75], 'the posted retirement and end ages');
    await eq(t, engine.runScenario(JSON.parse(JSON.stringify(posted))).calculationErrorCode, 'SCENARIO_END_AGE_BEFORE_START', 'the engine refuses the posted plan');
    await ok(t, /ending age/i.test(s.status()) && !/Projection updated/.test(s.status()), 'the status line names the refusal: ' + s.status());
  } finally { s.w.close(); }
});

test('R54 (control): an age edit with the end age untouched leaves the end and the retirement age as they were', async (t) => {
  // Age 50, retirement 60, end 90; the age typed as 52.3 becomes 52.5. Retirement 60 and end 90 are unchanged (the old clamps did not
  // move them either: max(52.5, 60) = 60 and max(60, 90) = 90), and the plan projects.
  const s = await restore([base({ age: 50, retireAge: 60, endAge: 90, accounts: roth() })]);
  try {
    await edit(s, 'v2-age', '52.3', (q) => q.profile.age === 52.5);
    const q = s.saved(), posted = lastPosted(s);
    await eq(t, [q.profile.retireAge, q.profile.endAge, posted.profile.retireAge, posted.profile.endAge], [60, 90, 60, 90], 'retirement and end, saved and posted');
    await ok(t, /Projection updated/.test(s.status()), 'the plan projects: ' + s.status());
  } finally { s.w.close(); }
});

test('R54 (control): an edited field keeps its own entry handling -- half years, its input range, the retirement floor at the age', async (t) => {
  const s = await restore([working()]);
  try {
    // The end age typed as 85.3: its own half-year step, 85.5; the retirement age is untouched (65).
    await edit(s, 'v2-end', '85.3', (q) => q.profile.endAge === 85.5);
    await eq(t, [s.saved().profile.endAge, s.saved().profile.retireAge], [85.5, 65], 'end 85.5, retirement 65');
    // The end age typed as 150: its input's maximum, 100, on leaving the field.
    await edit(s, 'v2-end', '150', (q) => q.profile.endAge === 100);
    await eq(t, s.field('v2-end').value, '100.0', 'the end age shown at its maximum');
    // The retirement age typed below the age (55.3): its own floor at the current age, 60 -- and the end age (100) is not touched.
    await edit(s, 'v2-retire', '55.3', (q) => q.profile.retireAge !== 65);
    await eq(t, [s.saved().profile.retireAge, s.saved().profile.endAge], [60, 100], 'retirement floored at the age; end unchanged');
  } finally { s.w.close(); }
});
