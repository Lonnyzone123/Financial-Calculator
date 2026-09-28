'use strict';

/**
 * Behavior tests for validateScenario()'s wiring into importSettings().
 *
 * This is the first change in this project that alters LIVE app behavior
 * rather than adding a standalone module, so it gets black-box coverage
 * driven through the real DOM -- the same posture as the rest of
 * regression-suite.js: build a File, hand it to the actual
 * #v2-import-settings input, fire the change event the app listens for, and
 * assert on the rendered status line and on localStorage. The app's
 * internals are closed over by an IIFE and never touched directly.
 *
 * The contract being locked in:
 *   - a structurally sound backup imports exactly as before;
 *   - a backup whose values are the wrong TYPE is REFUSED, with a message
 *     naming the offending field, and the user's existing scenarios are left
 *     untouched;
 *   - a backup that is merely implausible (an unrecognized tax class) still
 *     imports, with a non-blocking note;
 *   - a backup malformed badly enough to break normalizedPlan() itself is
 *     reported as a structural problem rather than as an unrecognized file
 *     format, which is what it used to say.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCalculator, tick, waitFor } = require('./lib/harness');

const STORAGE_KEY = 'investment-calculator-v2c';

/** Drives the real import path and resolves with the rendered status text. */
async function importBackup(dom, payload) {
  const { document, File, Event } = dom.window;
  const root = document.getElementById('investment-calculator-v2c');
  const input = root.querySelector('#v2-import-settings');
  const status = root.querySelector('#v2-status');

  const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
  // jsdom's FileList is read-only via DataTransfer in some versions, so define
  // the property directly -- the app only ever reads input.files[0].
  Object.defineProperty(input, 'files', { value: [file], configurable: true });

  status.textContent = '';
  input.dispatchEvent(new Event('change', { bubbles: true }));
  // FileReader resolves asynchronously, so wait for the app to write a status.
  await waitFor(() => status.textContent !== '', { window: dom.window });
  return status.textContent;
}

function savedApp(dom) {
  return JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY));
}

/** A backup built from the app's own persisted state -- the exact shape a
 *  real export produces, so "valid" here means genuinely valid. */
function backupFrom(app) {
  return { format: 'investment-calculator-v2c', app: JSON.parse(JSON.stringify(app)) };
}

test('import validation: a sound backup still imports cleanly, with no added noise', async () => {
  const dom = await loadCalculator();
  await tick(dom.window);
  const message = await importBackup(dom, backupFrom(savedApp(dom)));
  assert.equal(
    message, 'Backup restored and upgraded to Version 2C.',
    'a round-trip of the app\'s own state must produce the original success message, with no warning suffix'
  );
});

test('import validation: a wrong-typed value is refused, names the field, and leaves existing scenarios untouched', async () => {
  const dom = await loadCalculator();
  await tick(dom.window);
  const before = savedApp(dom);

  const payload = backupFrom(before);
  payload.app.scenarios[0].accounts = [{
    id: 'x', name: 'Brokerage', type: 'taxable', taxClass: 'taxable',
    balance: 'not a number', basisPct: 70, priority: 1,
  }];

  const message = await importBackup(dom, payload);
  assert.match(message, /was not restored/, 'the import must be refused');
  assert.match(message, /accounts\[0\]\.balance/, 'the message must name the offending field');
  assert.match(message, /left unchanged/, 'the message must reassure that existing data survived');

  const after = savedApp(dom);
  assert.deepEqual(after.scenarios, before.scenarios, 'a refused import must not mutate the stored scenarios');
});

test('import validation: an implausible-but-usable value imports with a non-blocking note', async () => {
  const dom = await loadCalculator();
  await tick(dom.window);

  const payload = backupFrom(savedApp(dom));
  // An unrecognized tax class is a WARNING, not an ERROR: the engine will not
  // crash on it, it just has no branch for it, so blocking the import would
  // be too aggressive.
  payload.app.scenarios[0].accounts = [{
    id: 'x', name: 'Brokerage', type: 'taxable', taxClass: 'cryptoIRA',
    balance: 1000, basisPct: 70, priority: 1,
  }];

  const message = await importBackup(dom, payload);
  assert.match(message, /Backup restored/, 'a warning must not block the import');
  assert.match(message, /looked unusual/, 'but it must be surfaced to the user');
});

test('import validation: a backup too malformed for normalizedPlan() reports a structural problem, not a bad file format', async () => {
  const dom = await loadCalculator();
  await tick(dom.window);
  const before = savedApp(dom);

  const payload = backupFrom(before);
  // accounts as an object rather than an array breaks normalizedPlan()'s own
  // .map() before the validator ever sees it. Previously this fell through to
  // the generic "not a valid backup" catch, which is misleading -- the file IS
  // a recognized V2C backup, its contents are just broken.
  payload.app.scenarios[0].accounts = { nope: 'not an array' };

  const message = await importBackup(dom, payload);
  assert.match(message, /structural problem/, 'must be reported as a structural problem');
  assert.doesNotMatch(message, /not a valid Version 2B/, 'must no longer claim the file format is unrecognized');

  const after = savedApp(dom);
  assert.deepEqual(after.scenarios, before.scenarios, 'and must still leave existing scenarios untouched');
});

test('import validation: a file that genuinely is not a backup still reports an unrecognized format', async () => {
  const dom = await loadCalculator();
  await tick(dom.window);
  const message = await importBackup(dom, { hello: 'world' });
  assert.match(message, /not a valid Version 2B/, 'the pre-existing format check must still apply');
});

test('import validation: multiple structural problems are summarized rather than dumped in full', async () => {
  const dom = await loadCalculator();
  await tick(dom.window);

  const payload = backupFrom(savedApp(dom));
  payload.app.scenarios[0].profile.age = 'forty';
  payload.app.scenarios[0].accounts = [{
    id: 'x', name: 'Brokerage', type: 'taxable', taxClass: 'taxable',
    balance: 'bad', basisPct: 'bad', priority: 1,
  }];

  const message = await importBackup(dom, payload);
  assert.match(message, /3 structural problems/, 'the count must be reported');
  assert.match(message, /and 1 more/, 'and the list truncated so the status line stays readable');
});
