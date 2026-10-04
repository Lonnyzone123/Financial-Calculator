/* S5AA R23 round: R22-01 in the app's Web Worker -- THE ROTH EXCLUSION IS RAISED THERE TOO.
 *
 * The app runs the engine in a Worker assembled by buildWorkerSource() in app-shell.html, which serializes a LIST of
 * named functions. R23 added noteEarlyRothDraw(), called from withdrawFromAccountList(), from a manual transfer and from
 * the Monte Carlo loop. A name missing from that list fails only when the function is CALLED -- here, only when a Roth
 * is drawn before 59 1/2 -- as a ReferenceError inside the Worker, while every Node test passes. So the witnesses run
 * the generated Worker source itself, with no fallback, as tests/audit-q15-worker-dependencies.test.js does.
 *
 * The plans are those of tests/audit-s5aa-r23-roth-flag-follows-draws.test.js: a Roth that pays a $20,000 expense at 45
 * ($100,000 to $80,000), and the Monte Carlo household whose later paths draw the Roth early.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);

const { build } = require('../build.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs');
const defaultPlan = extractDefaultPlan(shell);

let jsdomAvailable = true;
try { require('jsdom'); } catch (e) { jsdomAvailable = false; }
const uiTest = jsdomAvailable ? {} : { skip: 'jsdom is not installed; run npm install' };

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'r23-'));
test.after(() => { fs.rmSync(SCRATCH, { recursive: true, force: true }); });

/* The artifact's own generated Worker source, as the app stashes it for tests (see the Q15 file). */
async function generatedWorkerSource() {
  const { JSDOM } = require('jsdom');
  const { output } = build(path.join(SCRATCH, 'app.html'));
  const dom = new JSDOM(output, { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
  dom.window.__V2C_TEST__ = true;
  const mainScript = Array.from(dom.window.document.querySelectorAll('script'))
    .find((el) => el.getAttribute('type') !== 'application/json' && el.textContent.includes('investment-calculator-v2c'));
  assert.ok(mainScript, 'could not find the app script');
  dom.window.eval(mainScript.textContent);
  await new Promise((r) => dom.window.setTimeout(r, 0));
  const source = dom.window.document.getElementById('investment-calculator-v2c')._v2cWorkerSource;
  assert.ok(source && source.length > 1000, 'the app did not stash a generated worker source');
  return source;
}

function runInIsolatedWorker(source, plan) {
  const sandbox = { self: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  let received = null;
  sandbox.self.postMessage = function (msg) { received = msg; };
  sandbox.self.onmessage({ data: { id: 1, plan: JSON.parse(JSON.stringify(plan)) } });
  return received;
}

const account = (id, type, taxClass, balance, priority) => ({ id, name: id, type, taxClass, owner: 'self', balance,
  basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0,
  vesting: 100, priority });

function plan(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: o.age, retireAge: o.age, endAge: o.endAge, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: o.method || 'simple', returnRate: o.returnRate || 0, volatility: o.volatility || 0,
    inflation: 0, fee: 0, seed: 1, runs: o.runs || 1000 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: o.spending || 0, dividendOn: false, pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: o.expenses || [], otherIncomes: [] });
  Object.assign(p.advanced, { assetsOn: false, rmdOn: false, transferOn: false, conversionOn: false, healthOn: false,
    networthOn: true, otherAssets: [], debts: [] });
  p.accounts = o.accounts;
  return p;
}

const rothFlags = (reply) => (reply.result.issues || []).filter((i) => i.code === 'UNSUPPORTED_ROTH_ORDERING');

/* S5AA R50 (AA1-36): a Roth IRA is modelled by its ledger now and is no longer flagged; the flag marks a Roth 401(k) or custom Roth
   drawn early. Adapted by intent: both Worker cases draw a Roth 401(k) (before R50, a Roth IRA); the balances are unchanged (untaxed). */
test('R22-01 in the Worker: a Roth that pays an expense at 45 is flagged there, with no error', uiTest, async () => {
  const source = await generatedWorkerSource();
  const reply = runInIsolatedWorker(source, plan({ age: 45, endAge: 46,
    expenses: [{ name: 'Roof', kind: 'expense', age: 45, amount: 20000 }],
    accounts: [account('cash', 'taxable', 'taxable', 0, 1), Object.assign(account('roth', 'roth401k', 'roth', 100000, 2), { basisPct: 0 })] }));
  assert.ok(reply, 'the worker produced no reply');
  assert.equal(reply.error, undefined, 'the worker errored: ' + reply.error);
  assert.equal(reply.result.rows[1].roth, 80000);
  const f = rothFlags(reply);
  assert.equal(f.length, 1);
  assert.equal(f[0].state.firstDrawOwnerAge, 45);
});

test('R22-01 in the Worker: Monte Carlo carries a later path\'s draw up to the run, with no error', uiTest, async () => {
  const source = await generatedWorkerSource();
  const reply = runInIsolatedWorker(source, plan({ method: 'monteCarlo', age: 55, endAge: 60, spending: 40000, returnRate: 5,
    volatility: 25, runs: 50,
    accounts: [account('cash', 'taxable', 'taxable', 150000, 1), Object.assign(account('roth', 'roth401k', 'roth', 500000, 2), { basisPct: 0 })] }));
  assert.ok(reply, 'the worker produced no reply');
  assert.equal(reply.error, undefined, 'the worker errored: ' + reply.error);
  assert.equal(rothFlags(reply).length, 1);
});
