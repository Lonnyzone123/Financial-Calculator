/* S5AA R25 round: R24F-04 -- A PLAN VALUE THE VALIDATOR REJECTS AS NOT A NUMBER IS REFUSED BY THE ENGINE TOO
 * (ChatGPT's R24F deep full-model audit, 2026-09-25, priority 2; repair chosen by the owner 2026-09-25: "Repair: refuse it",
 * for all 14 fields, "with a parity test").
 *
 * S5AA task 1.1's rule is that the engine refuses what the validator rejects, for a caller that never validated. The
 * validator types 14 scalar plan fields as finite numbers (WRONG_TYPE), but the engine's input gate read none of them,
 * so runPlan() and runScenario() ran a string or a boolean through JavaScript's coercion and returned status "ok":
 * retirement.spending = true spent $1, and "40000" spent $40,000. Measured at s5aa-r24-source (d67b618) by setting each
 * numeric scalar field of the default plan to its own value as a string, and to true: 28 of those cases were rejected
 * by the validator and run by the engine, on these 14 fields.
 *
 * profile.age, which the validator types too, was refused only later, by the symptom code TAX_QUOTE_NONFINITE_CONTEXT;
 * it joins the list, so 15 fields are refused at the gate. assumptions.runs keeps its own gate code, INVALID_RUN_COUNT.
 *
 * Now the gate refuses SCENARIO_NONNUMBER_PLAN_VALUE, naming the field, before any row is computed. The parity sweep
 * below reads the VALIDATOR's verdict for every numeric scalar field, so a field the validator types later cannot
 * reopen the gap unnoticed. A field that is absent stays accepted, as the validator accepts it.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const { build } = require('../build.js');
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const CODE = 'SCENARIO_NONNUMBER_PLAN_VALUE';
const SECTIONS = ['profile', 'assumptions', 'employment', 'retirement', 'advanced'];
const FIELDS = ['profile.age', 'profile.retireAge', 'profile.endAge', 'assumptions.returnRate', 'assumptions.seed',
  'assumptions.volatility', 'employment.salary', 'retirement.spending', 'retirement.dividendYield',
  'retirement.dividendQualified', 'retirement.dividendGrowth', 'retirement.dividendStart', 'retirement.ssClaim',
  'retirement.spouseClaim', 'advanced.correlation'];

function basePlan() {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  return p;
}
function withValue(p, dotted, value) {
  const [sec, key] = dotted.split('.');
  p[sec][key] = value;
  return p;
}
const wrongTypeAt = (p, dotted) => validateScenario(JSON.parse(JSON.stringify(p))).issues
  .some((i) => i.severity === 'ERROR' && i.code === 'WRONG_TYPE' && i.path === dotted);
function assertRefused(r, dotted, how) {
  assert.equal(r.calculationErrorCode, CODE, how + ': ' + r.status + '/' + r.calculationErrorCode);
  assert.equal(r.rows, null, how + ': no financial row is computed');
  const issue = (r.issues || []).find((i) => i.code === CODE);
  assert.ok(issue, how + ': the refusal is reported as an issue');
  assert.equal(issue.severity, 'ERROR');
  assert.equal(issue.state && issue.state.path, dotted, how + ': the issue names the field');
}

test('R24F-04: retirement.spending = true is refused by runPlan() and runScenario(), with no row (was ok, spending $1)', () => {
  const p = withValue(basePlan(), 'retirement.spending', true);
  assert.equal(wrongTypeAt(p, 'retirement.spending'), true, 'the validator rejects it');
  assertRefused(engine.runPlan(JSON.parse(JSON.stringify(p))), 'retirement.spending', 'runPlan');
  assertRefused(engine.runScenario(JSON.parse(JSON.stringify(p))), 'retirement.spending', 'runScenario');
});

test('R24F-04: retirement.spending = "40000" is refused too (was ok, spending $40,000)', () => {
  const p = withValue(basePlan(), 'retirement.spending', '40000');
  assertRefused(engine.runPlan(p), 'retirement.spending', 'runPlan');
});

test('R24F-04 PARITY: every numeric plan field the validator rejects as a string or a boolean, the engine refuses', () => {
  const plan0 = basePlan();
  assert.equal(validateScenario(JSON.parse(JSON.stringify(plan0))).valid, true, 'the default plan is valid');
  const covered = new Set();
  for (const sec of SECTIONS) {
    for (const key of Object.keys(plan0[sec])) {
      if (typeof plan0[sec][key] !== 'number') continue;
      for (const bad of [String(plan0[sec][key]), true]) {
        const p = withValue(basePlan(), sec + '.' + key, bad);
        if (!wrongTypeAt(p, sec + '.' + key)) continue;
        covered.add(sec + '.' + key);
        const r = engine.runPlan(p), how = sec + '.' + key + ' = ' + JSON.stringify(bad);
        if (FIELDS.includes(sec + '.' + key)) { assertRefused(r, sec + '.' + key, how); continue; }
        /* A field with its own gate code (assumptions.runs: SCENARIO_INVALID_RUN_COUNT) is refused at the gate too. */
        assert.match(String(r.calculationErrorCode), /^SCENARIO_/, how + ': refused at the input gate, not later');
        assert.equal(r.rows, null, how + ': no financial row');
      }
    }
  }
  for (const dotted of FIELDS) assert.ok(covered.has(dotted), dotted + ' is among the fields the sweep reached');
});

test('R24F-04: each of the 15 is refused as NaN too', () => {
  for (const dotted of FIELDS) {
    const p = withValue(basePlan(), dotted, NaN);
    assertRefused(engine.runPlan(p), dotted, dotted + ' = NaN');
  }
});

test('R24F-04 CONTROL: a valid plan runs, and a field that is absent is accepted, as the validator accepts it', () => {
  const r = engine.runPlan(basePlan());
  assert.equal(r.status, 'ok');
  const p = basePlan();
  delete p.retirement.spouseClaim;
  delete p.advanced.correlation;
  assert.equal(validateScenario(JSON.parse(JSON.stringify(p))).valid, true);
  assert.equal(engine.runPlan(p).status, 'ok');
});

test('R24F-04 in the Worker: the app\'s generated Worker refuses spending = true, with no error', async () => {
  const { JSDOM } = require('jsdom');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'r25-'));
  try {
    const { output } = build(path.join(scratch, 'app.html'));
    const dom = new JSDOM(output, { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
    dom.window.__V2C_TEST__ = true;
    const mainScript = Array.from(dom.window.document.querySelectorAll('script'))
      .find((el) => el.getAttribute('type') !== 'application/json' && el.textContent.includes('investment-calculator-v2c'));
    dom.window.eval(mainScript.textContent);
    await new Promise((r) => dom.window.setTimeout(r, 0));
    const source = dom.window.document.getElementById('investment-calculator-v2c')._v2cWorkerSource;
    dom.window.close();
    assert.ok(source && source.length > 1000, 'the app stashed its generated worker source');
    const sandbox = { self: {}, console };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);
    let reply = null;
    sandbox.self.postMessage = (msg) => { reply = msg; };
    sandbox.self.onmessage({ data: { id: 1, plan: withValue(basePlan(), 'retirement.spending', true) } });
    assert.ok(reply, 'the worker replied');
    assert.equal(reply.error, undefined, 'the worker errored: ' + reply.error);
    assertRefused(reply.result, 'retirement.spending', 'Worker');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
