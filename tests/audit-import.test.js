'use strict';

/**
 * Tests for AUD-004 (RETIREMENT_ENGINE_AUDIT_CLAUDE_QUEUE_2026-09-08.md,
 * task T01): normalizedPlan()/normalizeAccount() silently replace a
 * wrong-typed retirement.stages/expenses/otherIncomes or account
 * futureChanges with [] before validateScenario() ever runs, so a malformed
 * backup "succeeds" with the offending data quietly erased instead of being
 * refused. Fixed by validateRawContainers() (src/scenario-validator.js),
 * run against the untouched parsed candidate before normalizedPlan() ever
 * mutates it (src/app-shell.html, importSettings()/reviewRawScenarios()).
 *
 * Two layers of coverage, matching this project's usual posture for a
 * validator: fast direct unit tests of validateRawContainers() itself, plus
 * black-box tests driven through the real #v2-import-settings input (the
 * same harness as tests/import-validation.test.js), since this is a live
 * app behavior change, not just a standalone module.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRawContainers } = require('../src/scenario-validator.js');
const { loadCalculator, tick, waitFor } = require('./lib/harness');

// --- Direct unit tests of validateRawContainers() ---------------------

test('validateRawContainers: the audit\'s own reproduction -- a wrong-shaped expenses object is an ERROR', () => {
  const result = validateRawContainers({ retirement: { expenses: { age: 61, amount: 50000 } } });
  assert.equal(result.valid, false);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].severity, 'ERROR');
  assert.equal(result.issues[0].path, 'retirement.expenses');
  assert.match(result.issues[0].message, /retirement\.expenses/, 'the message itself must carry the full path, since that is what reaches the status line');
});

test('validateRawContainers: stages and otherIncomes are checked the same way', () => {
  const stages = validateRawContainers({ retirement: { stages: 'nope' } });
  assert.equal(stages.valid, false);
  assert.equal(stages.issues[0].path, 'retirement.stages');

  const otherIncomes = validateRawContainers({ retirement: { otherIncomes: 42 } });
  assert.equal(otherIncomes.valid, false);
  assert.equal(otherIncomes.issues[0].path, 'retirement.otherIncomes');
});

test('validateRawContainers: a wrong-shaped account futureChanges is an ERROR naming its index', () => {
  const result = validateRawContainers({
    accounts: [{ id: 'a' }, { id: 'b', futureChanges: { not: 'an array' } }],
  });
  assert.equal(result.valid, false);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].path, 'accounts[1].futureChanges');
});

test('validateRawContainers: absent legacy fields are not flagged -- only present-and-wrong-type is', () => {
  const result = validateRawContainers({ retirement: {}, accounts: [{ id: 'a' }] });
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});

test('validateRawContainers: valid arrays (including empty ones) pass', () => {
  const result = validateRawContainers({
    retirement: { stages: [], expenses: [{ age: 61, amount: 50000 }], otherIncomes: [] },
    accounts: [{ id: 'a', futureChanges: [] }],
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});

test('validateRawContainers: a non-object plan or missing sections are not this check\'s concern', () => {
  assert.equal(validateRawContainers(null).valid, true);
  assert.equal(validateRawContainers({}).valid, true);
});

// --- Black-box tests through the real import path ----------------------

const STORAGE_KEY = 'investment-calculator-v2c';

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

function savedApp(dom) {
  return JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY));
}

function backupFrom(app) {
  return { format: 'investment-calculator-v2c', app: JSON.parse(JSON.stringify(app)) };
}

test('import: a wrong-shaped expenses object is refused before normalization can erase it, naming the field', async () => {
  const dom = await loadCalculator();
  await tick(dom.window);
  const before = savedApp(dom);

  const payload = backupFrom(before);
  payload.app.scenarios[0].retirement.expenses = { age: 61, amount: 50000 };

  const message = await importBackup(dom, payload);
  assert.match(message, /was not restored/, 'the import must be refused, not silently emptied');
  assert.match(message, /retirement\.expenses/, 'the message must name the offending field');
  assert.match(message, /left unchanged/);

  const after = savedApp(dom);
  assert.deepEqual(after.scenarios, before.scenarios, 'a refused import must not mutate stored scenarios');
});

/** The default scenario loadCalculator() boots has no accounts until guided
 *  setup runs, so tests targeting an account field seed one explicitly --
 *  the same approach tests/import-validation.test.js uses. */
function withOneAccount(payload, accountOverrides = {}) {
  payload.app.scenarios[0].accounts = [Object.assign({
    id: 'x', name: 'Brokerage', type: 'taxable', taxClass: 'taxable',
    balance: 50000, basisPct: 70, priority: 1,
  }, accountOverrides)];
  return payload;
}

test('import: a wrong-shaped account futureChanges is refused, naming its index', async () => {
  const dom = await loadCalculator();
  await tick(dom.window);
  const before = savedApp(dom);

  const payload = withOneAccount(backupFrom(before), { futureChanges: { not: 'an array' } });

  const message = await importBackup(dom, payload);
  assert.match(message, /was not restored/);
  assert.match(message, /accounts\[0\]\.futureChanges/);

  const after = savedApp(dom);
  assert.deepEqual(after.scenarios, before.scenarios);
});

test('import: legacy backups with these containers omitted entirely still round-trip', async () => {
  const dom = await loadCalculator();
  await tick(dom.window);

  const payload = withOneAccount(backupFrom(savedApp(dom)));
  const scenario = payload.app.scenarios[0];
  delete scenario.retirement.stages;
  delete scenario.retirement.expenses;
  delete scenario.retirement.otherIncomes;
  delete scenario.accounts[0].futureChanges;

  const message = await importBackup(dom, payload);
  assert.equal(message, 'Backup restored and upgraded to Version 2C.');

  const after = savedApp(dom);
  assert.deepEqual(after.scenarios[0].retirement.stages, []);
  assert.deepEqual(after.scenarios[0].retirement.expenses, []);
  assert.deepEqual(after.scenarios[0].accounts[0].futureChanges, []);
});

test('import: a valid, populated expenses array still imports normally', async () => {
  const dom = await loadCalculator();
  await tick(dom.window);

  const payload = backupFrom(savedApp(dom));
  payload.app.scenarios[0].retirement.expenses = [{ age: 61, amount: 50000, name: 'New roof' }];

  const message = await importBackup(dom, payload);
  assert.equal(message, 'Backup restored and upgraded to Version 2C.');

  const after = savedApp(dom);
  assert.deepEqual(after.scenarios[0].retirement.expenses, [{ age: 61, amount: 50000, name: 'New roof' }]);
});
