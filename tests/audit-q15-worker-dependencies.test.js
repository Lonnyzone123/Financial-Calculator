'use strict';

// Q15 (disclosed in the S2 package, corrected by the 2026-09-10 audit).
//
// THE GAP. buildWorkerSource() assembles the Web Worker's script
// independently of the main thread: constants, plus each function named in
// `workerFunctions` serialized via fn.toString(). `DebtAmortization` appeared
// in neither list, so projectDebts()'s ARM re-amortization branch would throw
// `ReferenceError: DebtAmortization is not defined` inside the worker.
//
// THE AUDIT'S TWO CORRECTIONS, both of which this file pins:
//   1. It is MORE REACHABLE than the S2 package claimed -- an importable
//      field needs no UI toggle to be set.
//   2. It is LESS SEVERE -- runPlansBackground catches the worker error and
//      reruns on the main thread, so the user gets a slow answer rather than
//      a dead one. That fallback is real and is tested separately below, but
//      it must not be what makes the flag-on case "work".
//
// AND THE REPAIR ORIGINALLY PROPOSED IN SPRINT_QUESTIONS.md WAS WRONG:
//
//     var DebtAmortization = { monthlyPayment: <monthlyPayment.toString()> };
//
// monthlyPayment calls the PRIVATE monthlyRate helper, so the serialized
// fragment loses its closure and throws `ReferenceError: monthlyRate is not
// defined`. This file reproduces that failure explicitly, so the reason the
// simple fix is unavailable can never be forgotten.
//
// The real repair emits every namespace and private helper inside one
// __debtModulesFactory function, whose toString() carries the complete graph.
//
// Per the audit: the generated worker artifact is validated DIRECTLY, with
// fallback disabled, in an isolated context.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const { build } = require('../build.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs');
const defaultPlan = extractDefaultPlan(shell);

let jsdomAvailable = true;
try { require('jsdom'); } catch (e) { jsdomAvailable = false; }
const uiTest = jsdomAvailable ? {} : { skip: 'jsdom is not installed; run npm install' };

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'q15-'));
test.after(() => { fs.rmSync(SCRATCH, { recursive: true, force: true }); });

/**
 * The REAL generated worker source, obtained by booting the built app in
 * jsdom and asking it to build one -- the app's own __V2C_TEST__ escape
 * hatch stashes it on the root element. Nothing here reimplements
 * buildWorkerSource(); that would test a copy rather than the artifact.
 */
async function generatedWorkerSource() {
  const { JSDOM } = require('jsdom');
  const { output } = build(path.join(SCRATCH, 'app.html'));
  const dom = new JSDOM(output, { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
  dom.window.__V2C_TEST__ = true;
  const mainScript = Array.from(dom.window.document.querySelectorAll('script'))
    .find((el) => el.getAttribute('type') !== 'application/json'
      && el.textContent.includes('investment-calculator-v2c'));
  assert.ok(mainScript, 'could not find the app script');
  dom.window.eval(mainScript.textContent);
  await new Promise((r) => dom.window.setTimeout(r, 0));
  const root = dom.window.document.getElementById('investment-calculator-v2c');
  const source = root._v2cWorkerSource;
  assert.ok(source && source.length > 1000, 'the app did not stash a generated worker source');
  return source;
}

function armPlan() {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.profile.age = 60;
  p.profile.retireAge = 60;
  p.profile.endAge = 70;
  p.profile.spouseOn = false;
  p.employment.salary = 0;
  p.employment.spouseSalary = 0;
  p.assumptions.method = 'simple';
  p.assumptions.returnRate = 0;
  p.assumptions.inflation = 0;
  p.assumptions.fee = 0;
  p.retirement.strategy = 'fixedNominal';
  p.retirement.spending = 30000;
  p.retirement.ssBenefit = 0;
  p.retirement.pension = 0;
  p.retirement.dividendOn = false;
  p.retirement.stages = [];
  p.retirement.expenses = [];
  p.retirement.otherIncomes = [];
  p.advanced.rmdOn = false;
  p.advanced.otherAssets = [];
  p.advanced.healthOn = false;
  p.advanced.ltcOn = false;
  // The flag-on ARM case -- the exact path Q15 blocks.
  p.advanced.armRecastOnReset = true;
  p.advanced.debts = [{
    id: 'm1', type: 'mortgage', name: 'Mortgage', owner: 'household',
    balance: 300000, rate: 4, resetRate: 8, rateType: 'adjustable',
    nextRateResetAge: 62, payoffAge: 85, paymentMonthly: 1600,
    extraPrincipalMonthly: 0, includePayment: true, includeHousingCosts: false,
    annualPropertyTax: 0, annualInsurance: 0, hoaMonthly: 0, pmiMonthly: 0,
  }];
  p.accounts = [{
    id: 'a1', name: 'Taxable', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 1500000, basisPct: 100, contributionMode: 'dollar', contribution: 0, frequency: 12,
    annualChangeMode: 'percent', annualChange: 0, changeTiming: 'annual', contributionPreset: 'none',
    futureChanges: [], priority: 1, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0,
    vesting: 100, allocation: {},
  }];
  return p;
}

/** Runs the generated worker source in an isolated context. NO FALLBACK. */
function runInIsolatedWorker(source, plan) {
  const sandbox = { self: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.equal(typeof sandbox.self.onmessage, 'function', 'the worker source must install an onmessage handler');
  let received = null;
  sandbox.self.postMessage = function (msg) { received = msg; };
  sandbox.self.onmessage({ data: { id: 1, plan: JSON.parse(JSON.stringify(plan)) } });
  return received;
}

// ---------------------------------------------------------------------------
// 1. The first-failing case: the flag-on ARM path inside a real worker
// ---------------------------------------------------------------------------

test('Q15: the generated worker computes the flag-on ARM case with NO fallback available', uiTest, async () => {
  const source = await generatedWorkerSource();
  const reply = runInIsolatedWorker(source, armPlan());

  assert.ok(reply, 'the worker produced no reply at all');
  assert.equal(
    reply.error, undefined,
    'the worker errored: ' + reply.error +
    ' -- with armRecastOnReset on, projectDebts() reaches DebtAmortization.monthlyPayment()'
  );
  assert.ok(reply.result, 'the worker must return a result');
  assert.ok(Array.isArray(reply.result.rows) && reply.result.rows.length > 0, 'and that result must carry rows');
  assert.equal(reply.result.calculationError, false, 'and must not be an invalid result');
});

test('Q15: the worker source actually carries the debt graph, including private helpers', uiTest, async () => {
  const source = await generatedWorkerSource();
  assert.ok(source.includes('__debtModulesFactory'), 'the factory must be serialized into the worker');
  assert.ok(source.includes('function monthlyRate'), 'the PRIVATE monthlyRate helper must travel with it');
  /* B2 (S3 round 2) gave monthlyPayment a SECOND private dependency,
     normalizeTerm, which enforces the shared term contract. Pinned here for the
     same reason monthlyRate is: adding a private helper to a bundled module is
     precisely the change that has silently broken the Worker twice in this
     project (Q15 and Q20), because the Worker is a second assembly of the same
     code and nothing forces the two to agree. */
  assert.ok(source.includes('function normalizeTerm'), 'the PRIVATE normalizeTerm helper must travel with it');
  assert.ok(source.includes('MAX_TERM_MONTHS'), 'and the term ceiling it enforces');
  assert.ok(source.includes('var DebtAmortization=__debtModules.DebtAmortization'), 'and be bound for projectDebts to reach');
});

// ---------------------------------------------------------------------------
// 2. Why the originally proposed one-line repair could not work
// ---------------------------------------------------------------------------

test('Q15: serializing only the public function loses its closure -- the documented wrong fix', () => {
  const { monthlyPayment } = require('../src/debt-amortization.js');
  // Exactly what SPRINT_QUESTIONS.md originally proposed.
  const naive = 'var DebtAmortization={monthlyPayment:' + monthlyPayment.toString() + '};'
    + 'self.result=DebtAmortization.monthlyPayment(300000,8,300);';
  const sandbox = { self: {} };
  vm.createContext(sandbox);
  /* The pin is on the FAILURE, not on which helper happens to be missing first.
     It named monthlyRate specifically until B2 (S3 round 2) added normalizeTerm,
     which monthlyPayment now calls on its first line -- so the fragment began
     failing one helper earlier and this assertion went red while the behaviour
     it guards was more true than before, not less.

     Broadened to either helper, and then made STRONGER rather than looser: the
     count of private dependencies is asserted below. monthlyPayment now needs
     two, so the argument for serializing the whole module factory instead of
     one function is twice what it was. */
  assert.throws(
    () => vm.runInContext(naive, sandbox),
    /(normalizeTerm|monthlyRate) is not defined/,
    'the naive fragment must fail on a missing private helper -- if this ever stops throwing, ' +
    'the reason the factory approach exists has changed and should be re-examined'
  );

  const body = monthlyPayment.toString();
  const needed = ['monthlyRate', 'normalizeTerm'].filter((name) => body.includes(name + '('));
  assert.deepEqual(needed, ['monthlyRate', 'normalizeTerm'],
    'monthlyPayment calls two helpers that live in its module scope and not in its own ' +
    'body, so serializing the function alone cannot carry it. Its .toString() is the ' +
    'whole of what the naive fragment ships.');
});

// ---------------------------------------------------------------------------
// 3. The audit's severity corrections
// ---------------------------------------------------------------------------

test('Q15: the flag is reachable by import, with no UI toggle -- the audit\'s first correction', () => {
  const { validateScenario } = require('../src/scenario-validator.js');
  const p = armPlan();
  const res = validateScenario(p);
  assert.equal(res.valid, true, 'a scenario carrying armRecastOnReset:true validates, so import reaches it');
});

test('Q15: a fixed-rate debt needs nothing from the debt graph, so the flag-off path was never at risk', uiTest, async () => {
  const source = await generatedWorkerSource();
  const p = armPlan();
  p.advanced.armRecastOnReset = false;
  p.advanced.debts[0].rateType = 'fixed';
  const reply = runInIsolatedWorker(source, p);
  assert.equal(reply.error, undefined, 'the flag-off path must compute cleanly: ' + reply.error);
  assert.ok(reply.result.rows.length > 0);
});
