/* Q49 -- accounts[].contribution has no explicit validation anywhere.
 *
 * findingIds: Q49
 *
 * The trap this file is built around: an INELIGIBLE owner has its allowed
 * contribution set to zero, so an invalid contribution and a valid one
 * produce byte-identical output. A test that only covers ineligibility
 * proves nothing at all -- it cannot distinguish "the check fired" from "the
 * path never ran". Every arm below therefore runs in BOTH eligibility states
 * and carries a finite non-zero control proving the contribution path is
 * actually live in the eligible fixture.
 *
 * Scope limit, stated because it is easy to overclaim: an actual NaN cannot
 * be encoded in ordinary JSON, so the non-finite arms are the direct
 * JavaScript input case. The live UI assigns through
 * `a.contribution=Math.max(0,Number(contrib.value))` on a type="number"
 * input, so it cannot produce a string or a non-finite value either. The
 * JSON-reachable wrong-TYPE case is a separate mechanism and is filed
 * separately; it is not repaired here and is not asserted here.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const validator = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const ABSENT = Symbol('absent');

/* One-year deterministic control, age 40 -> 41. Contributions are eligible
   when retireAge/contributionStop are 41 and ineligible when they are 40;
   nothing else differs between the two arms. */
function makePlan(contribution, eligible) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { returnRate: 0, inflation: 0, method: 'simple', volatility: 0 });
  Object.assign(p.profile, { age: 40, retireAge: eligible ? 41 : 40, endAge: 41 });
  Object.assign(p.employment, { salary: 100000, contributionStop: eligible ? 41 : 40 });
  const account = {
    id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 500000, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  };
  if (contribution !== ABSENT) account.contribution = contribution;
  p.accounts = [account];
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  return p;
}

const deposited = (out) => (out.rows || [])
  .reduce((t, r) => t + (Number(r.contributions) || 0), 0);

function contributionIssues(plan) {
  const r = validator.validateScenario(plan);
  return [].concat(r.errors || [], r.warnings || [], r.issues || [])
    .filter((x) => String(x.path || '').indexOf('.contribution') >= 0);
}

/* ---- the controls that make the rest of the file mean anything ---- */

test('Q49 control: the contribution path actually runs in the eligible fixture', () => {
  const out = engine.runPlan(makePlan(1000, true));
  assert.equal(out.status, 'ok');
  assert.equal(Math.round(deposited(out)), 1000,
    'the eligible fixture must deposit the contribution; if this is 0 every ' +
    'other assertion in this file is measuring a path that never executed');
});

test('Q49 control: the ineligible fixture zeroes an identical valid contribution', () => {
  const out = engine.runPlan(makePlan(1000, false));
  assert.equal(out.status, 'ok');
  assert.equal(Math.round(deposited(out)), 0,
    'eligibility zeroes the allowed contribution -- this is why an ' +
    'ineligible-only test cannot detect an invalid value');
});

/* ---- the engine's public execution boundary ---- */

for (const [label, value] of [['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity]]) {
  for (const eligible of [true, false]) {
    test(`Q49 boundary: contribution = ${label} is rejected up front (eligible=${eligible})`, () => {
      const plan = makePlan(value, eligible);
      const out = engine.runPlan(plan);
      assert.equal(out.calculationError, true);
      assert.equal(out.calculationErrorCode, 'SCENARIO_NONFINITE_CONTRIBUTION',
        'must be the contribution gate, not the pre-existing balance/basisPct ' +
        'gate and not a downstream tax-quote containment code');
      assert.equal(out.rows, null);
      /* The gate must not borrow another rejection reason's message. */
      const issue = (out.issues || []).find((x) => x.code === 'SCENARIO_NONFINITE_CONTRIBUTION');
      assert.ok(issue, 'the rejection must be recorded as an issue');
      assert.match(issue.message, /planned contribution/,
        'a new rejection code silently inheriting an unrelated code\'s message ' +
        'is the specific failure this assertion exists to catch');
      /* The boundary must not mutate the caller's plan. */
      assert.ok(Number.isNaN(plan.accounts[0].contribution) || !Number.isFinite(plan.accounts[0].contribution),
        'the original plan object must be left unmodified');
    });
  }
}

test('Q49 boundary: the ineligible non-finite case no longer reads as an ordinary run', () => {
  /* Before the repair this returned status "ok" with contributions 0 --
     output identical to the legitimate zero control below it. */
  const bad = engine.runPlan(makePlan(NaN, false));
  const zero = engine.runPlan(makePlan(0, false));
  assert.equal(zero.status, 'ok');
  assert.notEqual(bad.status, zero.status,
    'an invalid contribution and a legitimate zero must be distinguishable');
});

test('Q49 boundary: legitimate zero and finite values still run', () => {
  for (const eligible of [true, false]) {
    for (const v of [0, 1000, 0.5, 1e6]) {
      const out = engine.runPlan(makePlan(v, eligible));
      assert.equal(out.status, 'ok', `contribution ${v} (eligible=${eligible}) must still run`);
      assert.equal(out.calculationErrorCode, undefined);
    }
  }
});

test('Q49 boundary: an absent contribution is not rejected at the boundary, by decision', () => {
  /* Deliberate, and documented at the gate. normalizeAccount() backfills
     `contribution: 0`, which is the supported missing-field default, so
     neither the boundary nor the validator flags absence. Rejecting it here
     would also flip a currently-passing run (ineligible + absent reports
     "ok") into an error. The residual this leaves -- a direct caller that
     bypasses normalisation gets only downstream containment -- is stated at
     the gate rather than hidden. This test pins the decision so a later edit
     has to argue with it. */
  const out = engine.runPlan(makePlan(ABSENT, false));
  assert.notEqual(out.calculationErrorCode, 'SCENARIO_NONFINITE_CONTRIBUTION');
});

/* ---- the generated Worker: a separate execution path ---- */

/* RB-01/RB-02 established that the Worker is its own execution path, not a
   copy of the main thread: those findings were reproduced "through the
   generated Worker with status ok". The Worker rebuilds the engine from a
   serialised function list in app-shell.html, so a repair to engine.js
   reaches it only if nonFiniteScenarioInputCode is on that list AND the list
   serialises the current body. Both are claims; this measures them through
   the REAL built worker source (tests/lib/worker-source.js builds the actual
   artifact to a scratch path -- it does not reassemble one). */
const { liveWorkerSource, postToWorker, cleanup } = require('./lib/worker-source.js');
test.after(() => cleanup());

test('Q49 worker: the generated Worker rejects a non-finite contribution too', async () => {
  const source = await liveWorkerSource();
  for (const eligible of [true, false]) {
    const message = postToWorker(source, makePlan(NaN, eligible));
    assert.equal(message.error, undefined, `worker threw: ${message.error}`);
    assert.equal(message.result.calculationErrorCode, 'SCENARIO_NONFINITE_CONTRIBUTION',
      `the Worker path must reject it the same way the main thread does (eligible=${eligible})`);
  }
});

test('Q49 worker control: the Worker still deposits a valid contribution', async () => {
  /* Without this, a Worker that rejected EVERY plan would pass the test above. */
  const source = await liveWorkerSource();
  const message = postToWorker(source, makePlan(1000, true));
  assert.equal(message.error, undefined, `worker threw: ${message.error}`);
  assert.equal(message.result.status, 'ok');
  assert.equal(Math.round(deposited(message.result)), 1000);
});

/* ---- the real import path: the lenient posture rests on normalisation ---- */

/* Absence is flagged nowhere, on the strength of normalizeAccount()
   backfilling `contribution: 0`. That is only safe if a real saved file
   cannot reach contribution arithmetic with the field absent. Read from the
   code, it cannot: the raw pre-normalisation review calls
   validateRawContainers(), which never reaches validateAccount(); and
   normalizeAccount() is Object.assign({...contribution:0...}, a), so an
   absent key keeps the default. Reading the code is a representation, so
   this measures it -- and measures that a present-but-invalid value IS
   refused on import, which is the half the validator change actually adds.

   Through a SCRATCH BUILD, deliberately. tests/lib/harness.js's
   loadCalculator() boots the pinned investment-calculator-v2c.html, which is
   stale by design and contains neither this repair nor the validator change
   -- an import witness run through it would pass whether or not the change
   blocks imports, and so could not detect the thing it exists to detect. */
const os = require('node:os');
const { JSDOM } = require('jsdom');
const { build } = require(path.join(ROOT, 'build.js'));
const { tick, waitFor } = require('./lib/harness');

const STORAGE_KEY = 'investment-calculator-v2c';
let importScratch = null;
test.after(() => { if (importScratch) fs.rmSync(importScratch, { recursive: true, force: true }); });

async function bootScratchBuild() {
  importScratch = importScratch || fs.mkdtempSync(path.join(os.tmpdir(), 'q49-import-'));
  const { output } = build(path.join(importScratch, 'app.html'));
  const dom = new JSDOM(output, { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
  /* Keyed off the app's own root id, NOT "the first non-JSON script": the
     shell's <head> carries a PWA bootstrap, and that predicate silently
     selects it (the failure recorded in tests/lib/worker-source.js). */
  const mainScript = Array.from(dom.window.document.querySelectorAll('script'))
    .find((el) => el.getAttribute('type') !== 'application/json'
      && el.textContent.includes('investment-calculator-v2c'));
  assert.ok(mainScript, 'could not find the app script in the scratch build');
  dom.window.eval(mainScript.textContent);
  await tick(dom.window);
  return dom;
}

async function importBackup(dom, payload) {
  const { document, File, Event } = dom.window;
  const root = document.getElementById('investment-calculator-v2c');
  const input = root.querySelector('#v2-import-settings');
  const status = root.querySelector('#v2-status');
  const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  status.textContent = '';
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await waitFor(() => status.textContent !== '', { window: dom.window });
  return status.textContent;
}

function backupWithAccount(dom, account) {
  const app = JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY));
  assert.ok(app && Array.isArray(app.scenarios) && app.scenarios.length,
    'the booted scratch build must persist a scenario to back up');
  app.scenarios[0].accounts = [account];
  return { format: 'investment-calculator-v2c', app };
}

const savedAccount = () => ({
  id: 'legacy-1', name: 'Old brokerage', type: 'taxable', taxClass: 'taxable',
  owner: 'self', balance: 25000, priority: 1, basisPct: 80,
});

test('Q49 import: an old saved file with no contribution field still restores, defaulted to 0', async () => {
  const dom = await bootScratchBuild();
  const account = savedAccount(); // no `contribution` key at all
  assert.equal(Object.prototype.hasOwnProperty.call(account, 'contribution'), false);

  const message = await importBackup(dom, backupWithAccount(dom, account));
  assert.match(message, /Backup restored/,
    'requiring contribution in the validator must not refuse a file that normalisation can default');

  const restored = JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY)).scenarios[0].accounts[0];
  assert.equal(restored.id, 'legacy-1', 'the imported account, not a default one, must be what was restored');
  assert.equal(restored.contribution, 0);
});

test('Q49 import control: a present-but-invalid contribution IS refused', async () => {
  /* Without this, the test above cannot tell "the check was reached and
     passed" from "the check is never reached on import at all". null is the
     JSON-encodable invalid value: Object.assign copies it over the default,
     so it arrives at validateScenario() as a wrong type. */
  const dom = await bootScratchBuild();
  const account = Object.assign(savedAccount(), { contribution: null });
  const message = await importBackup(dom, backupWithAccount(dom, account));
  assert.match(message, /was not restored/, 'an invalid contribution must be refused on import');
  assert.match(message, /contribution/, 'the refusal must name the field');
});

/* ---- the validator ---- */

test('Q49 validator: a non-finite contribution is an explicit error', () => {
  for (const v of [NaN, Infinity, -Infinity]) {
    const hits = contributionIssues(makePlan(v, true));
    assert.equal(hits.length, 1, `expected exactly one contribution issue for ${v}`);
    assert.equal(hits[0].code, 'WRONG_TYPE');
  }
});

test('Q49 validator: a wrong-typed contribution is an explicit error', () => {
  for (const v of ['1000', null, true, {}, []]) {
    const hits = contributionIssues(makePlan(v, true));
    assert.equal(hits.length, 1, `expected exactly one contribution issue for ${JSON.stringify(v)}`);
    assert.equal(hits[0].code, 'WRONG_TYPE');
  }
});

test('Q49 validator: an absent contribution is NOT flagged -- normalizeAccount() backfills it', () => {
  /* Matches the posture tests/scenario-validator.test.js pins for
     id/priority/balance ("not flagged at all -- normalizeAccount() backfills
     those"), and the Q49 record's instruction to preserve any explicitly
     supported missing-field default. An earlier draft of this repair flagged
     absence as MISSING_FIELD; that contradicted both, and silently added an
     extra issue to every validator test whose account literal omits the
     field. */
  assert.deepEqual(contributionIssues(makePlan(ABSENT, true)), []);
});

test('Q49 validator: a negative contribution warns that it will be floored away', () => {
  const hits = contributionIssues(makePlan(-500, true));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].code, 'NEGATIVE_CONTRIBUTION');
  /* It is a warning because the run genuinely survives: Math.max(0, amount)
     at engine.js:27 floors it. Confirm that is still what happens, so the
     severity choice stays tied to the behaviour that justified it. */
  const out = engine.runPlan(makePlan(-500, true));
  assert.equal(out.status, 'ok');
  assert.equal(Math.round(deposited(out)), 0);
});

test('Q49 validator: a negative contribution is handled identically when contributions are INELIGIBLE', () => {
  /* S5_TASK_CHECKLIST.md E3 asks for all four invalid classes -- negative,
     valid, NaN, Infinity -- controlled in BOTH eligibility states; the arm
     above covered negative only while eligible. In this state eligibility
     zeroes the deposit anyway, so the deposit cannot tell the floor from
     eligibility -- that is what the controls at the top of this file are
     for. What this arm pins is the part that CAN differ: the validator's
     verdict must not depend on eligibility, a finite negative must not be
     rejected at the boundary, and the run must be indistinguishable from the
     ineligible zero control. */
  const hits = contributionIssues(makePlan(-500, false));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].code, 'NEGATIVE_CONTRIBUTION');
  assert.equal(hits[0].severity, 'WARNING');

  const out = engine.runPlan(makePlan(-500, false));
  const zero = engine.runPlan(makePlan(0, false));
  assert.equal(out.status, 'ok', 'a finite negative is not a boundary rejection');
  assert.equal(out.calculationErrorCode, undefined);
  assert.equal(Math.round(deposited(out)), 0);
  assert.deepEqual(out.rows.map((r) => r.total), zero.rows.map((r) => r.total),
    'an ineligible negative must run exactly as the ineligible zero control does');
});

test('Q49 validator: legitimate values produce no contribution issue', () => {
  for (const v of [0, 1000, 0.5, 1e6]) {
    assert.deepEqual(contributionIssues(makePlan(v, true)), [],
      `contribution ${v} must validate cleanly`);
  }
});
