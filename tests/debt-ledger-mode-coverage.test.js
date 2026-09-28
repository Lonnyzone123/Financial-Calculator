'use strict';

/*
 * S4 task 5.2 -- Q40, held rather than described.
 *
 * P9 put the debt ledger on the row: debtPaymentsTotal splits exactly into
 * debtInterest + debtPrincipal + debtHousing. Monte Carlo rows do not carry
 * it, deliberately. They are percentile aggregates, and the median of a
 * component need not come from the same path as the median of the total. Q40's
 * three repair choices stay open; choosing one is not this sprint's to make.
 *
 * S4-PA-06 does not accept a generic label. It must name EXACTLY which modes
 * remain unqualified for E4, and the S5 repair deadline. MODEL_ASSUMPTIONS.md
 * section 6 now does. This file keeps the naming true: the mode lists come
 * from what the engine does with a debt-bearing household, not from the
 * paragraph, and every mode the validator accepts must land in exactly one.
 * If S5 extends the ledger to Monte Carlo, this goes red until the label moves
 * with it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require('../tools/capture-baseline.js').installDebtModules();
const engine = require('../src/engine.js');
const validator = require('../src/scenario-validator.js');
const golden = require('./lib/golden-scenario-defs.js');
const expansion = require('./lib/corpus-expansion.js');

const CONTRACT = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'result-contract.json'), 'utf8'));
const ASSUMPTIONS = fs.readFileSync(path.join(ROOT, 'MODEL_ASSUMPTIONS.md'), 'utf8');
const LEDGER = ['debtPaymentsTotal', 'debtInterest', 'debtPrincipal', 'debtHousing'];
const DEFAULT_PLAN = golden.extractDefaultPlan(SHELL);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/* An ordinary amortizing household from S4 task 4.6's versioned debt set, so
   the ledger has something to split in every mode. */
const household = () => expansion.expansionScenarios(DEFAULT_PLAN).find((e) => e.family.startsWith('debts-ordinary')).plan;
const runIn = (method) => {
  const p = JSON.parse(JSON.stringify(household()));
  p.assumptions.method = method;
  if (method === 'monteCarlo') { p.assumptions.runs = 200; p.assumptions.seed = 7; }
  return engine.runPlan(p);
};

/* Measured per mode: the ledger on every row, on none, or on only some. */
const measured = () => {
  const out = { every: [], none: [], some: [] };
  for (const method of validator.METHODS) {
    const rows = runIn(method).rows;
    const whole = rows.filter((row) => LEDGER.every((k) => own(row, k))).length;
    const partial = rows.filter((row) => LEDGER.some((k) => own(row, k)) && !LEDGER.every((k) => own(row, k))).length;
    (partial || (whole && whole !== rows.length) ? out.some : whole ? out.every : out.none).push(method);
  }
  return out;
};

test('5.2: in the modes that carry the ledger, it is on every row and reconciles exactly', () => {
  const { every } = measured();
  assert.ok(every.length > 0, 'at least one mode carries the ledger');
  for (const method of every) {
    const rows = runIn(method).rows;
    const debtRows = rows.filter((row) => row.debtPaymentsTotal > 0);
    assert.ok(debtRows.length > 0, 'CONTROL: ' + method + ' must have debt payments to split, or the identity is vacuous');
    const worst = rows.reduce((m, row) => Math.max(m, Math.abs(row.debtPaymentsTotal - row.debtInterest - row.debtPrincipal - row.debtHousing)), 0);
    assert.ok(worst <= 1e-6, method + ': debtPaymentsTotal must equal interest + principal + housing on every row, worst residual ' + worst);
  }
});

test('5.2: Monte Carlo rows carry none of the ledger, while the household still carries debt', () => {
  const r = runIn('monteCarlo');
  assert.equal(r.mode, 'monteCarlo');
  for (const k of LEDGER) assert.equal(r.rows.filter((row) => own(row, k)).length, 0, 'no Monte Carlo row may carry ' + k);
  assert.ok(r.rows.some((row) => row.debtBalance > 0), 'CONTROL: the household has debt under Monte Carlo too, so the absence is not vacuous');
});

test('5.2: MODEL_ASSUMPTIONS.md names exactly the modes the engine measures, each mode once', () => {
  const m = ASSUMPTIONS.match(/The breakdown is on every row in (.+?), and on no row in (.+?)\./);
  assert.ok(m, 'MODEL_ASSUMPTIONS.md section 6 must state the measured mode lists');
  const names = (s) => [...s.matchAll(/`(\w+)`/g)].map((x) => x[1]).sort();
  const got = measured();
  assert.deepEqual(got.some, [], 'no mode carries the ledger on only some rows');
  assert.deepEqual(names(m[1]), [...got.every].sort(), 'modes named as carrying the breakdown');
  assert.deepEqual(names(m[2]), [...got.none].sort(), 'modes named as carrying none -- the ones unqualified for E4');
  assert.deepEqual([...names(m[1]), ...names(m[2])].sort(), [...validator.METHODS].sort(), 'every mode the validator accepts is named exactly once');
});

test('5.2: the label carries what S4-PA-06 requires -- the unqualified criterion, and the deadline or its absence', () => {
  assert.match(ASSUMPTIONS, /unqualified for the household-ledger exit criterion \(S4 E4\)/);
  assert.match(ASSUMPTIONS, /\*\*Repair deadline: [^*]+\*\*/, 'a deadline, or a plain statement that none is assigned');
});

test('5.2: the result contract agrees -- the ledger is specified for per-path rows and listed absent for Monte Carlo rows', () => {
  for (const k of LEDGER) {
    assert.ok(own(CONTRACT.rowFields.perPath, k), 'per-path rows specify ' + k);
    assert.ok(CONTRACT.rowFields.monteCarlo.absent.includes(k), 'Monte Carlo rows list ' + k + ' as absent');
  }
});
