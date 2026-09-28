'use strict';

/*
 * S4 task 7.4b (S4-PA-01) -- browser-integration tests certify CURRENT source.
 *
 * Until this task, tests/lib/harness.js booted the tracked
 * investment-calculator-v2c.html: last rebuilt 2026-09-08, stale by design
 * until S5b task 4.3. Five gate-run files called it, so part of the suite's UI
 * coverage certified neither the module graph the baseline describes nor the
 * current build.
 *
 * Now the harness has two named lanes. `fresh`, the default, is a scratch build
 * of this tree. `historical` is the tracked file, reached only by the artifact
 * pin and by an explicit opt-in. This file holds that arrangement: the fresh
 * lane never reads the tracked file, it IS this tree's build, it boots the app
 * and not the script in front of it, it carries this tree's embedded rules, and
 * the five files do not opt out of it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const TRACKED = path.join(ROOT, 'investment-calculator-v2c.html');
const RULES_BLOCK = /<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/;
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const FIVE = ['regression-suite.js', 'audit-import.test.js', 'import-validation.test.js', 'debug-module.test.js', 'simulation-identity.test.js'];

test('7.4b: the fresh lane never reads the tracked artifact -- not when the harness loads, not when it boots the app', async () => {
  const real = fs.readFileSync;
  const reads = [];
  fs.readFileSync = function (p, ...rest) {
    if (typeof p === 'string' && path.resolve(p) === path.resolve(TRACKED)) reads.push(p);
    return real.call(this, p, ...rest);
  };
  try {
    delete require.cache[require.resolve('./lib/harness.js')];
    const harness = require('./lib/harness.js');
    const dom = await harness.loadCalculator();
    assert.ok(dom.window.document.getElementById('investment-calculator-v2c'), 'CONTROL: the app document loaded');
    dom.window.close();
    assert.deepEqual(reads, [], 'the fresh lane must not read the tracked, stale artifact');
  } finally {
    fs.readFileSync = real;
  }
});

test('7.4b: the fresh lane is exactly this tree\'s build, and the historical lane is the tracked file the pin describes', () => {
  const harness = require('./lib/harness.js');
  const { build } = require('../build.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lane-check-'));
  const log = console.log;
  console.log = () => {};
  let output;
  try {
    output = build(path.join(dir, 'app.html')).output;
  } finally {
    console.log = log;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(sha(harness.artifactFor('fresh')), sha(output), 'the fresh lane is what build.js makes of this tree');
  assert.equal(sha(harness.artifactFor('historical')), sha(fs.readFileSync(TRACKED, 'utf8')), 'the historical lane is the tracked file');
  assert.equal(sha(harness.artifactFor('historical')), harness.EXPECTED_SHA256, 'and the artifact pin describes that file');
  assert.throws(() => harness.artifactFor('stale'), /unknown artifact lane/);
});

test('7.4b: in a current build the first non-JSON script is not the app, and loadCalculator boots the app anyway', async () => {
  const { JSDOM } = require('jsdom');
  const harness = require('./lib/harness.js');
  const doc = new JSDOM(harness.artifactFor('fresh')).window.document;
  const firstNonJson = Array.from(doc.querySelectorAll('script')).find((el) => el.getAttribute('type') !== 'application/json');
  assert.equal(firstNonJson.textContent.includes('investment-calculator-v2c'), false, 'CONTROL: the old selector would have evaluated a script that is not the app');
  const dom = await harness.loadCalculator({ testHooks: true });
  const root = dom.window.document.getElementById('investment-calculator-v2c');
  assert.ok(root._v2cWorkerSource && root._v2cWorkerSource.length > 1000, 'the app itself ran: it stashed its generated worker source');
  dom.window.close();
});

test('7.4b: the fresh lane carries this tree\'s embedded rules', () => {
  const harness = require('./lib/harness.js');
  const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
  assert.deepEqual(JSON.parse(harness.artifactFor('fresh').match(RULES_BLOCK)[1]), JSON.parse(shell.match(RULES_BLOCK)[1]));
});

test('7.4b: the five browser-integration files boot the fresh lane -- none opts into the historical one', () => {
  for (const f of FIVE) {
    const text = fs.readFileSync(path.join(__dirname, f), 'utf8');
    assert.match(text, /loadCalculator\(/, f + ' boots the app through the harness');
    assert.doesNotMatch(text, /artifact:\s*['"]historical['"]/, f + ' must not opt into the historical lane');
  }
});
