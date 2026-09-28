'use strict';

/**
 * New regression harness for investment-calculator-v2c.html, written from
 * scratch because the original test-v2c.js referenced in the handover could
 * not be located anywhere in the project tree (see MERGE_AUDIT_AND_PLAN.md).
 *
 * Scope: black-box browser-level behavior only, driven purely through DOM
 * events exactly as a real user or the original test-v2c.js would -- the
 * app's internals (app/results/etc.) are closed over by an IIFE and never
 * exposed on window, so every assertion here reads rendered DOM state,
 * dataset attributes, or localStorage, never internal JS state directly.
 *
 * This intentionally targets investment-calculator-v2c.html only (the file
 * verified byte-for-byte against the handover's documented SHA-256), not
 * investment-calculator-v2c-mobile.html, which does not match its
 * documented hash and has a materially different, older feature set.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  verifyArtifactHash,
  loadCalculator,
  tick,
  waitFor,
  setValue,
  click,
  completeGuidedSetup,
  goToPage,
} = require('./lib/harness');

test('artifact hash matches the handover-documented release', () => {
  assert.doesNotThrow(verifyArtifactHash);
});

test('structural: no duplicate element ids anywhere in the document', async () => {
  const dom = await loadCalculator();
  const { document } = dom.window;
  const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id);
  const seen = new Map();
  for (const id of ids) seen.set(id, (seen.get(id) || 0) + 1);
  const duplicates = Array.from(seen.entries()).filter(([, count]) => count > 1);
  assert.deepEqual(duplicates, [], 'duplicate ids found: ' + JSON.stringify(duplicates));
});

test('structural: eight pages exist and Standard is the default mode', async () => {
  const dom = await loadCalculator();
  const { document } = dom.window;
  const root = document.getElementById('investment-calculator-v2c');

  const panels = Array.from(root.querySelectorAll('[data-page-panel]')).map(
    (el) => el.dataset.pagePanel
  );
  assert.deepEqual(
    panels.sort(),
    ['accounts', 'assets', 'debts', 'plan', 'projection', 'results', 'rules', 'setup'].sort(),
    'expected exactly the eight documented pages'
  );

  const complexitySelect = root.querySelector('#v2-complexity');
  assert.ok(complexitySelect, '#v2-complexity select must exist');
  const options = Array.from(complexitySelect.options).map((o) => o.value);
  assert.deepEqual(options, ['simple', 'standard', 'advanced']);
  assert.equal(root.dataset.complexity, 'standard', 'default mode must be Standard');
  assert.equal(complexitySelect.value, 'standard');
});

test('mode switching updates root.dataset.complexity and redirects off unavailable pages in Simple', async () => {
  const dom = await loadCalculator();
  const { document } = dom.window;
  const root = document.getElementById('investment-calculator-v2c');

  goToPage(document, 'debts');
  assert.equal(root.querySelector('[data-page-panel="debts"]').classList.contains('is-active'), true);

  setValue(root.querySelector('#v2-complexity'), 'simple');
  assert.equal(root.dataset.complexity, 'simple');
  // Debts is not available in Simple mode -- the app must redirect to "plan".
  assert.equal(
    root.querySelector('[data-page-panel="plan"]').classList.contains('is-active'),
    true,
    'Simple mode must redirect off the Debts page since it is not available there'
  );

  setValue(root.querySelector('#v2-complexity'), 'advanced');
  assert.equal(root.dataset.complexity, 'advanced');
});

test('theme switching applies immediately without waiting for the calculation debounce', async () => {
  const dom = await loadCalculator();
  const { document } = dom.window;
  const root = document.getElementById('investment-calculator-v2c');

  setValue(root.querySelector('#v2-theme'), 'dark');
  assert.equal(document.documentElement.dataset.theme, 'dark');

  setValue(root.querySelector('#v2-theme'), 'light');
  assert.equal(document.documentElement.dataset.theme, 'light');

  setValue(root.querySelector('#v2-theme'), 'auto');
  assert.equal(document.documentElement.hasAttribute('data-theme'), false, 'auto must remove the attribute');
});

test('number inputs: blank-on-blur restores the last valid value', async () => {
  const dom = await loadCalculator();
  const document = dom.window.document;
  const root = document.getElementById('investment-calculator-v2c');
  const age = root.querySelector('#v2-age');

  setValue(age, '40');
  assert.equal(age.value, '40');

  age.value = '';
  age.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  age.dispatchEvent(new dom.window.Event('blur', { bubbles: true }));

  assert.equal(age.value, '40.0', 'blur on an emptied field must restore the last valid value');
});

test('number inputs: half-year step normalization and max-100 clamp on the ending age', async () => {
  const dom = await loadCalculator();
  const { document } = dom.window;
  const root = document.getElementById('investment-calculator-v2c');
  const endAge = root.querySelector('#v2-end');

  setValue(endAge, '150');
  endAge.dispatchEvent(new dom.window.Event('blur', { bubbles: true }));
  assert.equal(endAge.value, '100.0', 'ending age must clamp to the documented max of 100');

  setValue(endAge, '77.3');
  endAge.dispatchEvent(new dom.window.Event('blur', { bubbles: true }));
  assert.equal(endAge.value, '77.5', 'ending age must normalize to the nearest 0.5 year');
});

test('history presets: exactly five stress and five favorable years, matching the engine constants', async () => {
  const dom = await loadCalculator();
  const { document } = dom.window;
  const root = document.getElementById('investment-calculator-v2c');

  const stressButtons = Array.from(root.querySelectorAll('.v2-year-stress')).map((b) => b.textContent);
  const favorableButtons = Array.from(root.querySelectorAll('.v2-year-favorable')).map((b) => b.textContent);

  assert.deepEqual(stressButtons, ['1929', '1966', '1968', '2000', '2008']);
  assert.deepEqual(favorableButtons, ['1949', '1954', '1982', '1989', '2012']);

  const stressButton = root.querySelector('.v2-year-stress');
  click(stressButton);
  assert.equal(root.querySelector('#v2-history-start').value, '1929');
});

test('guided setup: creating a plan marks it complete and navigates to Accounts', async () => {
  const dom = await loadCalculator();
  const { document } = dom.window;
  const root = document.getElementById('investment-calculator-v2c');

  completeGuidedSetup(document, { 'v2-name': 'Regression Test Plan' });
  await waitFor(
    () => root.querySelector('[data-page-panel="accounts"]').classList.contains('is-active'),
    { window: dom.window }
  );

  assert.equal(root.querySelector('[data-page-panel="accounts"]').classList.contains('is-active'), true);
});

test('persistence: a saved scenario survives a full reload into a fresh window', async () => {
  const dom1 = await loadCalculator();
  const doc1 = dom1.window.document;
  const root1 = doc1.getElementById('investment-calculator-v2c');

  setValue(root1.querySelector('#v2-age'), '31.5');
  setValue(root1.querySelector('#v2-name'), 'Persistence Check');
  completeGuidedSetup(doc1);
  await waitFor(
    () => root1.querySelector('[data-page-panel="accounts"]').classList.contains('is-active'),
    { window: dom1.window }
  );

  const savedRaw = dom1.window.localStorage.getItem('investment-calculator-v2c');
  assert.ok(savedRaw, 'expected a saved scenario in localStorage after guided setup');

  const dom2 = await loadCalculator({
    localStorageSeed: { 'investment-calculator-v2c': savedRaw },
  });
  const doc2 = dom2.window.document;
  const root2 = doc2.getElementById('investment-calculator-v2c');

  assert.equal(root2.querySelector('#v2-age').value, '31.5', 'reloaded scenario must restore the saved age');
  assert.equal(root2.querySelector('#v2-name').value, 'Persistence Check');
});

// A minimal seeded scenario with one funded account. normalizedPlan() (run by
// load()) fills in every other field from defaultPlan, so only the fields
// that matter for a given test need to be specified here.
function seedWithBalance(overrides = {}) {
  return {
    version: 2,
    edition: '2C',
    page: 'setup',
    complexity: 'standard',
    theme: 'auto',
    compare: false,
    active: 0,
    scenarios: [
      Object.assign(
        {
          name: 'Regression Fixture',
          setupComplete: true,
          accounts: [{ type: 'taxable', balance: 500000 }],
        },
        overrides
      ),
    ],
  };
}

test('calculation: navigating to Results runs the (worker-less, compatibility-mode) engine and populates stat cards', async () => {
  const dom = await loadCalculator({
    localStorageSeed: {
      'investment-calculator-v2c': JSON.stringify(seedWithBalance()),
    },
  });
  const doc = dom.window.document;
  const root = doc.getElementById('investment-calculator-v2c');

  goToPage(doc, 'results');
  await waitFor(
    () => root.querySelector('#v2-performance').textContent === 'Calculation complete',
    { window: dom.window, timeoutMs: 5000 }
  );

  const endValue = root.querySelector('#v2-stat-end').textContent;
  assert.notEqual(endValue, '$0', 'ending portfolio stat should reflect a real (nonzero) calculation with a funded account');
  assert.match(endValue, /^\$/, 'ending portfolio stat should be formatted as currency');
});

test('Monte Carlo: identical inputs and seed produce identical rendered results (deterministic)', async () => {
  async function runOnce() {
    const dom = await loadCalculator({
      localStorageSeed: {
        'investment-calculator-v2c': JSON.stringify(
          seedWithBalance({
            assumptions: {
              returnPreset: 'standard',
              returnRate: 10,
              inflation: 3.5,
              fee: 0,
              method: 'monteCarlo',
              runs: 200,
              seed: 42791,
              volatility: 18.5,
              historyStart: 1928,
              rollingHistory: false,
              withdrawalTiming: 'monthly',
            },
          })
        ),
      },
    });
    const doc = dom.window.document;
    const root = doc.getElementById('investment-calculator-v2c');

    goToPage(doc, 'results');
    await waitFor(
      () => root.querySelector('#v2-performance').textContent === 'Calculation complete',
      { window: dom.window, timeoutMs: 5000 }
    );

    return {
      success: root.querySelector('#v2-stat-success').textContent,
      end: root.querySelector('#v2-stat-end').textContent,
      failure: root.querySelector('#v2-stat-failure').textContent,
    };
  }

  const a = await runOnce();
  const b = await runOnce();
  assert.deepEqual(a, b, 'identical inputs and seed must produce a bit-for-bit identical rendered result');
});

test('annual projection: the first table row is the current-age opening snapshot', async () => {
  const dom = await loadCalculator();
  const doc = dom.window.document;
  const root = doc.getElementById('investment-calculator-v2c');

  setValue(root.querySelector('#v2-age'), '29.5');
  setValue(root.querySelector('#v2-salary'), '80000');
  completeGuidedSetup(doc);
  await waitFor(
    () => root.querySelector('[data-page-panel="accounts"]').classList.contains('is-active'),
    { window: dom.window }
  );

  goToPage(doc, 'projection');
  await waitFor(
    () => root.querySelector('#v2-table') && root.querySelector('#v2-table').children.length > 0,
    { window: dom.window, timeoutMs: 5000 }
  );

  const firstRow = root.querySelector('#v2-table tr');
  const firstAgeCell = firstRow.querySelector('td');
  assert.equal(firstAgeCell.textContent, '29.5', 'the first annual-table row must be the exact starting-age snapshot');
});
