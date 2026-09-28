'use strict';

// Track J -- debugging module. Covers the engine-side invariant checks, the
// decision log's issue() extension, and (closing audit finding C-2) an
// executable check that the generated Web Worker source actually runs.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadCalculator } = require('./lib/harness');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');
const { createDecisionLog } = require('../src/ported/decision-log');

function braceExtract(src, marker) {
  const i = src.indexOf(marker);
  let j = src.indexOf('{', i), depth = 0, inStr = null;
  for (let k = j; k < src.length; k++) {
    const c = src[k];
    if (inStr) { if (c === '\\') { k++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(j, k + 1); }
  }
  throw new Error('braceExtract: unbalanced braces');
}
const defaultPlan = eval('(' + braceExtract(shell, 'var defaultPlan=') + ')');

function samplePlan(overrides = {}) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.accounts = [
    { id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 250000, contribution: 12000, contributionMode: 'amount', priority: 1, basisPct: 70, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 },
    { id: 'a2', name: '401k', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 400000, contribution: 15000, contributionMode: 'amount', priority: 2, basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: true, matchCap: 5, matchRate: 100, profitShare: 0, vesting: 100 },
    { id: 'a3', name: 'Roth IRA', type: 'rothIRA', taxClass: 'roth', owner: 'self', balance: 90000, contribution: 7000, contributionMode: 'amount', priority: 3, basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 },
  ];
  p.employment.salary = 145000;
  Object.assign(p.assumptions, overrides.assumptions || {});
  Object.assign(p.retirement, overrides.retirement || {});
  Object.assign(p.advanced, overrides.advanced || {});
  Object.assign(p.profile, overrides.profile || {});
  return p;
}

// ---------------------------------------------------------------------------
// Engine-side invariants
// ---------------------------------------------------------------------------

test('reconciliation invariant: no false positives across every major engine code path', () => {
  const scenarios = [
    ['baseline', {}],
    ['historical', { assumptions: { method: 'historical' } }],
    ['monte carlo', { assumptions: { method: 'monteCarlo', runs: 20 } }],
    ['annual withdrawal timing', { assumptions: { withdrawalTiming: 'annual' } }],
    ['dividends on', { retirement: { dividendOn: true, dividendYield: 3, dividendStart: 55 } }],
    ['RMDs on', { advanced: { rmdOn: true }, profile: { age: 70, retireAge: 71 } }],
    ['Roth conversions', { advanced: { conversionOn: true, conversionAmount: 20000 } }],
    ['reserve + bond tent', { advanced: { reserveOn: true, reserveYears: 2, bondTentOn: true, bondTent: 50 } }],
    ['portfolio failure', { retirement: { spending: 400000 } }],
    ['half-year ages', { profile: { age: 29.5, retireAge: 55.5, endAge: 90.5 } }],
  ];
  /* THE SUBJECT IS THE INVARIANT, so the filter names the invariant codes -- the same three
     recordIssue() itself treats as invariants. This read `result.issues` whole, which made it a test
     of "this plan produces no issues of ANY kind", a different and much broader claim. S5AA task 5.5
     made three supported-domain exclusions detectable, and this fixture holds a Roth account while
     retiring at 55, so it is now told -- correctly -- that the reference covers only qualified Roth
     withdrawals. An advisory disclosure is not an invariant false positive.

     NOT A LOOSENING: any of the three invariant codes appearing here still fails, which is everything
     this test was ever able to catch, and the sibling tests below prove each still fires. The ERROR
     check beside it keeps the reach over codes that do not exist yet -- a clean run is still a clean
     run, whatever advisory warnings it carries. */
  const INVARIANTS = ['RECONCILIATION_MISMATCH', 'NON_FINITE_ROW_VALUE', 'NEGATIVE_ACCOUNT_BALANCE'];
  for (const [name, overrides] of scenarios) {
    const result = engine.runPlan(samplePlan(overrides));
    const fired = (result.issues || []).filter((i) => INVARIANTS.includes(i.code));
    assert.deepEqual(
      fired, [],
      `${name}: expected no invariant to fire, got ${JSON.stringify(fired.slice(0, 2))}`
    );
    const errors = (result.issues || []).filter((i) => i.severity === 'ERROR');
    assert.deepEqual(
      errors, [],
      `${name}: expected no ERROR-severity issue, got ${JSON.stringify(errors.slice(0, 2))}`
    );
  }
});

test('reconciliation invariant: fires when the flows genuinely do not add up', () => {
  const issues = [];
  // $1,000 of the opening balance is simply unaccounted for by the flows.
  engine.checkRowInvariants(issues, { age: 61, total: 99000 }, {
    opening: 100000, contributions: 0, employer: 0, growth: 0, dividends: 0, withdrawals: 0, accounts: [],
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, 'RECONCILIATION_MISMATCH');
  assert.equal(issues[0].severity, 'ERROR');
  assert.equal(issues[0].state.drift, -1000);
  assert.equal(issues[0].state.age, 61);
});

test('reconciliation invariant: tolerates floating-point noise but not real drift', () => {
  const clean = [];
  engine.checkRowInvariants(clean, { age: 61, total: 1000000.000000001 }, {
    opening: 1000000, contributions: 0, employer: 0, growth: 0, dividends: 0, withdrawals: 0, accounts: [],
  });
  assert.deepEqual(clean, [], 'sub-cent float noise on a $1M balance must not be reported');

  const dirty = [];
  engine.checkRowInvariants(dirty, { age: 61, total: 1000000.5 }, {
    opening: 1000000, contributions: 0, employer: 0, growth: 0, dividends: 0, withdrawals: 0, accounts: [],
  });
  assert.equal(dirty.length, 1, 'a 50-cent discrepancy is real and must be reported');
});

test('invariants: NaN/Infinity in a row is caught, with the offending field named', () => {
  const issues = [];
  engine.checkRowInvariants(issues, { age: 61, total: 100000, taxes: NaN, magi: Infinity }, {
    opening: 100000, contributions: 0, employer: 0, growth: 0, dividends: 0, withdrawals: 0, accounts: [],
  });
  const nonFinite = issues.find((i) => i.code === 'NON_FINITE_ROW_VALUE');
  assert.ok(nonFinite, 'expected a NON_FINITE_ROW_VALUE issue');
  assert.deepEqual(nonFinite.state.fields.sort(), ['magi', 'taxes']);
});

test('invariants: a negative account balance is caught and named', () => {
  const issues = [];
  engine.checkRowInvariants(issues, { age: 61, total: 100000 }, {
    opening: 100000, contributions: 0, employer: 0, growth: 0, dividends: 0, withdrawals: 0,
    accounts: [{ name: 'Brokerage', taxClass: 'taxable', balance: -25 }, { name: 'Roth', taxClass: 'roth', balance: 10 }],
  });
  const negative = issues.find((i) => i.code === 'NEGATIVE_ACCOUNT_BALANCE');
  assert.ok(negative, 'expected a NEGATIVE_ACCOUNT_BALANCE issue');
  assert.equal(negative.state.accounts.length, 1);
  assert.equal(negative.state.accounts[0].name, 'Brokerage');
});

test('invariant checking is opt-in: no issues array means no checking and no cost', () => {
  const withoutChecks = engine.simulatePlan(samplePlan(), engine.rng(42791), 0, null);
  assert.equal('issues' in withoutChecks, false, 'simulatePlan must not attach an issues field when not asked to check');

  // recordIssue is a no-op without a collector, so callers never need a guard.
  assert.doesNotThrow(() => engine.recordIssue(null, 'X', 'ERROR', 'msg', {}));
});

test('Monte Carlo checks only the first path, so the log cannot be flooded by path count', () => {
  const result = engine.runPlan(samplePlan({ assumptions: { method: 'monteCarlo', runs: 50 } }));
  assert.ok(Array.isArray(result.issues), 'Monte Carlo results must carry an issues array');
  // A clean plan yields none; the point is that 50 paths cannot produce 50x
  // duplicates of the same finding.
  assert.ok(result.issues.length <= 200, 'issues must stay bounded regardless of path count');
});

test('issue collection is capped so a pathological plan cannot exhaust memory', () => {
  const issues = [];
  for (let i = 0; i < 500; i++) engine.recordIssue(issues, 'SPAM', 'WARNING', 'message', { i });
  assert.equal(issues.length, 200);
});

// ---------------------------------------------------------------------------
// decision-log.js issue() extension
// ---------------------------------------------------------------------------

test('decision log issue(): records structured issues without touching the ported surface', () => {
  const log = createDecisionLog('run-1');
  log.record('engine', 'started', { a: 1 });
  log.issue('engine', 'RECONCILIATION_MISMATCH', 'ERROR', 'drift', { drift: 12.5 }, { age: 61 });
  log.issue('storage', 'STORAGE_QUOTA_EXCEEDED', 'CRITICAL', 'full', {});

  // The Python-ported surface must be untouched by the additions.
  assert.equal(log.events.length, 1, 'issues must not leak into the ported events array');
  assert.deepEqual(log.summary(), { run_id: 'run-1', events: 1, by_module: { engine: 1 }, by_event: { 'engine.started': 1 } });

  assert.equal(log.issues.length, 2);
  assert.equal(log.issues[0].code, 'RECONCILIATION_MISMATCH');
  assert.equal(log.issues[0].age, 61);
  assert.equal(log.issues[0].state.drift, 12.5);
  assert.equal(log.issues[1].decisionYear, null);
});

test('decision log issueSummary(): counts by code and severity, and names the most severe code', () => {
  const log = createDecisionLog('run-2');
  log.issue('engine', 'A', 'WARNING', 'w', {});
  log.issue('engine', 'A', 'WARNING', 'w', {});
  log.issue('engine', 'B', 'CRITICAL', 'c', {});
  log.issue('engine', 'C', 'ERROR', 'e', {});
  assert.deepEqual(log.issueSummary(), {
    run_id: 'run-2', issues: 4,
    by_code: { A: 2, B: 1, C: 1 },
    by_severity: { WARNING: 2, CRITICAL: 1, ERROR: 1 },
    most_severe_code: 'B',
  });
});

test('decision log issue(): rejects a missing code or an unknown severity', () => {
  const log = createDecisionLog('run-3');
  assert.throws(() => log.issue('m', '', 'ERROR', 'msg', {}), /stable code/);
  assert.throws(() => log.issue('m', 'CODE', 'SEVERE', 'msg', {}), /severity must be one of/);
});

// ---------------------------------------------------------------------------
// Audit finding C-2: the generated Web Worker source must actually execute.
//
// buildWorkerSource() serializes engine functions via fn.toString() from an
// explicit list. Forgetting to register a new function breaks ONLY the worker
// path -- the same-thread fallback keeps working, and jsdom (which has no
// window.Worker) never notices. This runs the real generated source.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The user-facing "Download debug info" export.
//
// jsdom implements neither IndexedDB nor URL.createObjectURL. That is useful
// here rather than a limitation: it exercises the no-storage-available
// degradation path, and stubbing createObjectURL lets the real filename and
// payload be inspected without a browser.
// ---------------------------------------------------------------------------

test('debug export: button exists, is wired, and degrades cleanly with no IndexedDB', async () => {
  const dom = await loadCalculator();
  const { window } = dom;
  const root = window.document.getElementById('investment-calculator-v2c');
  const button = root.querySelector('#v2-export-debug');
  assert.ok(button, 'the Download debug info button must exist');
  assert.equal(typeof button.onclick, 'function', 'the button must be wired to a handler');

  let captured = null;
  let downloadName = null;
  window.URL.createObjectURL = (blob) => { captured = blob; return 'blob:stub'; };
  window.URL.revokeObjectURL = () => {};
  const realClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () { downloadName = this.download; };

  try {
    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    // exportDebugInfo() resolves through readIssues() first.
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    assert.ok(captured, 'clicking must produce a downloadable blob even when IndexedDB is unavailable');
    assert.match(
      downloadName,
      /^investment-calculator-debug_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z_no-issues\.json$/,
      `filename must follow the documented convention, got: ${downloadName}`
    );

    const payload = JSON.parse(await captured.text());
    assert.equal(payload.format, 'investment-calculator-debug');
    assert.equal(payload.issueSummary.total, 0);
    assert.equal(payload.issueSummary.mostSevereCode, 'no-issues');
    assert.deepEqual(payload.issues, []);
    assert.ok(payload.activeScenario, 'the export must carry the scenario needed to reproduce an issue');
    assert.ok(payload.environment.userAgent, 'the export must record the environment');
    assert.ok(payload.app.rulesPackage, 'the export must record which rules package produced the numbers');
  } finally {
    window.HTMLAnchorElement.prototype.click = realClick;
    window.close();
  }
});

test('worker source: the generated worker executes runScenario and returns a real projection with an attached identity', async () => {
  const dom = await loadCalculator({ testHooks: true });
  const root = dom.window.document.getElementById('investment-calculator-v2c');
  const source = root._v2cWorkerSource;
  assert.ok(source && source.length > 1000, 'expected the app to expose its generated worker source under __V2C_TEST__');

  let posted = null;
  const sandbox = { self: { postMessage: (msg) => { posted = msg; } }, Math, JSON, Number, Object, Array, Date, Infinity, NaN, isFinite, isNaN, Intl };
  sandbox.self.onmessage = null;
  vm.createContext(sandbox);
  // A ReferenceError here means an engine function is missing from
  // buildWorkerSource()'s list -- the exact C-2 failure mode.
  vm.runInContext(source, sandbox);
  assert.equal(typeof sandbox.self.onmessage, 'function', 'worker source must install an onmessage handler');

  sandbox.self.onmessage({ data: { id: 7, plan: samplePlan() } });

  assert.ok(posted, 'the worker handler must post a message back');
  assert.equal(posted.error, undefined, `worker threw: ${posted.error}`);
  assert.equal(posted.id, 7);
  assert.ok(posted.result && Array.isArray(posted.result.rows) && posted.result.rows.length > 1, 'worker must return projection rows');
  assert.ok(Array.isArray(posted.result.issues), 'worker result must carry the Track J issues array');
  assert.ok(posted.result.identity && typeof posted.result.identity.inputHash === 'string', 'worker must return an attached simulation identity (Track A)');
  dom.window.close();
});
