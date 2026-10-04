/* S5AA R53 (ChatGPT's R52-01; the owner's decision of 2026-10-04: "refused everywhere") -- A PLAN WHOSE END AGE IS BEFORE ITS
 * RETIREMENT AGE IS REFUSED, BY THE VALIDATOR, THE IMPORT AND THE ENGINE.
 *
 * R52-01: the validator only WARNED (INCONSISTENT_AGES at profile.endAge), so "Restore backup" accepted ChatGPT's U01 (age 40,
 * retirement 60, end 41), and readStatic() then lengthened the horizon to the retirement age: 20 years where 1 was asked, a closing
 * balance of $300,049.02 where $106,050 was. The owner chose to refuse such a plan everywhere, with a clear message and a code, as
 * R41 refuses an end age before the start (END_AGE_BEFORE_START / SCENARIO_END_AGE_BEFORE_START):
 * - the validator: an ERROR END_AGE_BEFORE_RETIREMENT at profile.endAge, so the import refuses the backup and names the reason;
 * - the engine: the input gate refuses it as SCENARIO_END_AGE_BEFORE_RETIREMENT, no rows.
 * The rule reads the primary's retirement age (profile.retireAge) and end age, both on the primary's clock. An end age EQUAL to the
 * retirement age is accepted. An end age before the START keeps R41's code alone. A spouse's own later retirement
 * (profile.spouseRetireAge, on the spouse's clock) is not part of the rule: a younger spouse may still be working when the plan ends.
 * Expectations are hand-derived from the rule and the inputs.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadCalculator, waitFor } = require('./lib/harness');

const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const engine = L.h.engine;
const { validateScenario } = require(path.join(__dirname, '..', 'src', 'scenario-validator.js'));
const STORAGE_KEY = 'investment-calculator-v2c';
const CODE = 'SCENARIO_END_AGE_BEFORE_RETIREMENT';
const validatorIssues = (p) => validateScenario(structuredClone(p)).issues.map((i) => i.severity + ' ' + i.code + '@' + i.path);

// ChatGPT's U01: age 40, retirement 60, end 41; $10,000 of wages; a $100,000 Roth IRA (basis entered) taking $1,000 a year; 5% return.
function u01(o = {}) {
  const p = L.basePlan({ dividendOn: true, dividendYield: 0, spending: 0, age: 40, retireAge: o.retireAge ?? 60, endAge: o.endAge ?? 41, salary: 10000, returnRate: 5,
    accounts: [L.account('roth', 'rothIRA', 100000, { contribution: 1000, contributionBasis: 100000 })] });
  if (o.method) Object.assign(p.assumptions, { method: o.method, runs: 50, seed: 7, historyStart: 1990, volatility: 10 });
  return p;
}

test('R53: U01 (end 41, retirement 60) is refused by the engine in every method -- no rows, one ERROR naming both ages', () => {
  for (const method of ['simple', 'monteCarlo', 'historical']) {
    const r = engine.runPlan(u01({ method }));
    assert.equal(r.calculationErrorCode, CODE, method);
    assert.equal(r.rows, null, method + ': no rows');
    assert.notEqual(r.status, 'ok', method);
    const said = (r.issues || []).filter((i) => i.code === CODE);
    assert.equal(said.length, 1, method);
    assert.equal(said[0].severity, 'ERROR');
    assert.match(said[0].message, /ending age/);
    assert.match(said[0].message, /retirement age/);
  }
  assert.equal(engine.runScenario(u01()).calculationErrorCode, CODE, 'runScenario()');
});

test('R53: the validator reports it as an ERROR at profile.endAge (it only warned before)', () => {
  const v = validateScenario(structuredClone(u01()));
  assert.equal(v.valid, false);
  const issues = validatorIssues(u01());
  assert.ok(issues.includes('ERROR END_AGE_BEFORE_RETIREMENT@profile.endAge'), issues.join(' | '));
  assert.ok(!issues.includes('WARNING INCONSISTENT_AGES@profile.endAge'), 'the warning is replaced: ' + issues.join(' | '));
  const said = v.issues.find((i) => i.code === 'END_AGE_BEFORE_RETIREMENT');
  assert.match(said.message, /endAge \(41\) is before retireAge \(60\)/);
});

test('R53: "Restore backup" refuses U01, names the reason, and leaves the current scenarios unchanged', async () => {
  const dom = await loadCalculator();
  const w = dom.window, d = w.document;
  try {
    const before = w.localStorage.getItem(STORAGE_KEY);
    const input = d.getElementById('v2-import-settings'), status = d.getElementById('v2-status');
    const app = { version: 2, edition: '2C', page: 'setup', complexity: 'standard', theme: 'auto', compare: false, active: 0, scenarios: [u01()] };
    Object.defineProperty(input, 'files', { value: [new w.File([JSON.stringify({ format: STORAGE_KEY, version: 2, app })], 'u01.json', { type: 'application/json' })], configurable: true });
    status.textContent = '';
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    await waitFor(() => status.textContent !== '', { window: w, timeoutMs: 20000 });
    assert.match(status.textContent, /not restored/, status.textContent);
    assert.match(status.textContent, /endAge \(41\) is before retireAge \(60\)/, status.textContent);
    assert.equal(w.localStorage.getItem(STORAGE_KEY), before, 'the saved scenarios are unchanged');
  } finally { w.close(); }
});

test('R53 (control): an end age EQUAL to the retirement age is accepted -- one year, (100,000 + 1,000) x 1.05 = 106,050', async () => {
  const p = u01({ retireAge: 41, endAge: 41 });
  assert.equal(validateScenario(structuredClone(p)).valid, true, validatorIssues(p).join(' | '));
  const r = engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  assert.deepEqual(r.rows.map((x) => x.age), [40, 41]);
  assert.ok(Math.abs(r.rows.at(-1).total - 106050) < 0.01, String(r.rows.at(-1).total));
  // Restored through the app, it is kept and projects the same year.
  const dom = await loadCalculator();
  const w = dom.window, d = w.document;
  try {
    const input = d.getElementById('v2-import-settings'), status = d.getElementById('v2-status');
    const app = { version: 2, edition: '2C', page: 'setup', complexity: 'standard', theme: 'auto', compare: false, active: 0, scenarios: [p] };
    Object.defineProperty(input, 'files', { value: [new w.File([JSON.stringify({ format: STORAGE_KEY, version: 2, app })], 'equal.json', { type: 'application/json' })], configurable: true });
    status.textContent = '';
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    await waitFor(() => status.textContent !== '' && !/is-running/.test(d.getElementById('v2-performance').className), { window: w, timeoutMs: 20000 });
    const saved = JSON.parse(w.localStorage.getItem(STORAGE_KEY)).scenarios[0];
    assert.equal(saved.profile.endAge, 41);
    assert.ok(Math.abs(engine.runPlan(structuredClone(saved)).rows.at(-1).total - 106050) < 0.01);
  } finally { w.close(); }
});

test('R53 (controls): an end age before the START keeps R41\'s code alone; a retired household and a spouse still working are accepted', () => {
  // End 39 before the start 40 (and before retirement 60): R41's refusal, unchanged, and no second code.
  const early = u01({ endAge: 39 });
  assert.equal(engine.runPlan(early).calculationErrorCode, 'SCENARIO_END_AGE_BEFORE_START');
  const ei = validatorIssues(early);
  assert.ok(ei.includes('ERROR END_AGE_BEFORE_START@profile.endAge'), ei.join(' | '));
  assert.ok(!ei.some((s) => s.includes('END_AGE_BEFORE_RETIREMENT')), ei.join(' | '));
  // A retired household: retirement 65 below the age 70, end 72.
  const retired = L.basePlan({ age: 70, retireAge: 65, endAge: 72, accounts: [L.account('roth', 'rothIRA', 100000)] });
  assert.equal(validateScenario(structuredClone(retired)).valid, true, validatorIssues(retired).join(' | '));
  assert.equal(engine.runPlan(retired).status, 'ok');
  // A younger spouse still working at the end: primary 60, retiring 62, end 65; spouse 55 retiring at their own 65 (the primary's 70).
  const couple = L.basePlan({ couple: true, age: 60, spouseAge: 55, retireAge: 62, endAge: 65, salary: 50000, spouseSalary: 50000, accounts: [L.account('roth', 'rothIRA', 100000)] });
  couple.profile.spouseRetireAge = 65;
  assert.equal(validateScenario(structuredClone(couple)).valid, true, validatorIssues(couple).join(' | '));
  assert.equal(engine.runPlan(couple).status, 'ok');
});
