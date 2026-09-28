'use strict';

/*
 * S4 task 7.4b -- the current-build comparisons, within 7.4a's decided scope.
 *
 *   route 1  reference Node -> candidate Node        tools/differential-harness.js
 *   route 2  candidate Node -> its fresh build's main thread, in jsdom      (here)
 *   route 3  that build's main thread -> its Worker source                  (here)
 *
 * Passing Node comparisons plus UI tests on a 2026-09-08 artifact do not show
 * that current source becomes a working application. These do, as far as jsdom
 * can: the page's own engine agrees with the module graph, and the page's
 * generated Worker agrees with the page. Each route is proved to catch what
 * only it can see: a change to the built artifact alone, and a change to Worker
 * assembly alone, each named by scenario and field. And tests/worker-parity.test.js
 * -- the instrument standing in for the Worker boundary -- is red-proved by
 * running the real file against a Worker-only change.
 *
 * Real browser Worker execution is NOT covered. It is out of S4's scope by decision.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
const RULES_BLOCK = /(<script type="application\/json" id="v2b-rules-2026">)([\s\S]*?)(<\/script>)/;
global.RULES = JSON.parse(SHELL.match(RULES_BLOCK)[2]);
const cb = require('../tools/capture-baseline.js');
cb.installDebtModules();
const node = require('../src/engine.js');
const harness = require('./lib/harness.js');
const routes = require('./lib/build-routes.js');

const FEE_MARKER = 'ret-=p.assumptions.fee/100;';
const nodePlan = (plan) => cb.canonical(node.runPlan(routes.copy(plan)));

let booted = null;
const fresh = async () => (booted = booted || (await routes.bootBuild()));

test('7.4b route 2: a fresh build\'s main thread computes exactly what the Node module graph computes, over both corpora', async (t) => {
  const { engine } = await fresh();
  for (const composition of cb.COMPOSITIONS) {
    const corpus = cb.corpus(composition === 'control' ? undefined : { composition });
    const found = [];
    let leaves = 0;
    for (const { name, plan } of corpus) {
      const d = routes.differ(nodePlan(plan), routes.mainThreadPlan(engine, plan));
      leaves += d.leaves;
      d.differences.forEach((x) => found.push(name + ' ' + x.kind + ' ' + x.path));
    }
    t.diagnostic('route 2, ' + composition + ': ' + corpus.length + ' scenarios, ' + leaves + ' leaves compared, ' + found.length + ' differences');
    assert.ok(leaves > 10000, 'CONTROL: whole results were compared, not a stub');
    assert.deepEqual(found, [], composition + ': the page\'s engine disagrees with the module graph');
  }
});

test('7.4b route 3: that build\'s Worker source computes exactly what its main thread computes, identity included but for runId', async (t) => {
  const { engine, workerSource } = await fresh();
  assert.ok(workerSource && workerSource.length > 1000, 'CONTROL: the build stashed its generated worker source');
  const corpus = cb.corpus();
  const found = [];
  let leaves = 0;
  let identityLeaves = 0;
  for (const { name, plan } of corpus) {
    const main = routes.mainThreadScenario(engine, plan);
    const d = routes.differ(main, routes.workerScenario(workerSource, plan));
    leaves += d.leaves;
    identityLeaves += routes.differ(main.identity, main.identity).leaves;
    d.differences.forEach((x) => found.push(name + ' ' + x.kind + ' ' + x.path));
  }
  t.diagnostic('route 3: ' + corpus.length + ' scenarios, ' + leaves + ' leaves compared (' + identityLeaves + ' in identity), ' + found.length + ' differences');
  assert.ok(identityLeaves >= corpus.length * 10, 'the identity block is compared, not excluded wholesale: ' + identityLeaves);
  assert.deepEqual(found, [], 'the build\'s Worker disagrees with its own main thread');
});

test('7.4b acceptance: a change to the BUILT ARTIFACT alone fails route 2, named by scenario and field -- the module graph cannot see it', async () => {
  const html = harness.artifactFor('fresh');
  const rules = JSON.parse(html.match(RULES_BLOCK)[2]);
  rules.federal.standardDeduction.single += 1000;
  const mutated = html.replace(RULES_BLOCK, (all, open, body, close) => open + JSON.stringify(rules) + close);
  assert.notEqual(mutated, html, 'CONTROL: the built artifact changed');
  assert.deepEqual(JSON.parse(SHELL.match(RULES_BLOCK)[2]), global.RULES, 'CONTROL: the source rules, which Node reads, did not');
  const { engine, dom } = await routes.bootBuild(mutated);
  const byField = {};
  const scenarios = new Set();
  for (const { name, plan } of cb.corpus()) {
    routes.differ(nodePlan(plan), routes.mainThreadPlan(engine, plan)).differences.forEach((x) => {
      assert.equal(x.kind, 'VALUE', name + ': a value difference, not a crash or a shape change');
      byField[x.path.replace(/\[\d+\]/g, '[]')] = true;
      scenarios.add(name);
    });
  }
  dom.window.close();
  assert.ok(scenarios.size > 0, 'route 2 must catch a change to the built rules');
  assert.ok(Object.keys(byField).some((f) => /taxes/i.test(f)), 'in a tax field: ' + Object.keys(byField).slice(0, 8).join(', '));
});

test('7.4b acceptance: a change to WORKER ASSEMBLY alone fails route 3, named by scenario and field -- the main thread cannot see it', async () => {
  const { engine, workerSource } = await fresh();
  assert.equal(workerSource.split(FEE_MARKER).length - 1, 1, 'CONTROL: the mutation target occurs once in the worker source');
  const mutated = workerSource.replace(FEE_MARKER, () => 'ret-=p.assumptions.fee/100+1e-4;');
  const byField = {};
  const scenarios = new Set();
  let mainVsNode = 0;
  for (const { name, plan } of cb.corpus()) {
    routes.differ(routes.mainThreadScenario(engine, plan), routes.workerScenario(mutated, plan)).differences.forEach((x) => {
      byField[x.path.replace(/\[\d+\]/g, '[]')] = true;
      scenarios.add(name);
    });
    mainVsNode += routes.differ(nodePlan(plan), routes.mainThreadPlan(engine, plan)).differences.length;
  }
  assert.ok(scenarios.has('golden:baseline'), 'route 3 names the baseline golden scenario');
  assert.ok(byField['rows[].total'], 'and the portfolio total: ' + Object.keys(byField).slice(0, 8).join(', '));
  assert.equal(mainVsNode, 0, 'CONTROL: the main thread still agrees with Node -- only the Worker changed');
});

test('7.4a: the REAL tests/worker-parity.test.js goes red on a Worker-assembly-only change, and its controls stay green', () => {
  /* The file itself, not a copy of its logic. A --require hook wraps
     tests/lib/worker-source.js so the worker source it returns carries the
     same one-line change. */
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-parity-reproof-'));
  const hook = path.join(scratch, 'mutate-worker.js');
  fs.writeFileSync(hook, [
    "'use strict';",
    "const Module = require('node:module');",
    "const path = require('node:path');",
    'const load = Module._load;',
    'let wrapped = 0;',
    'Module._load = function (request, parent) {',
    '  const m = load.apply(this, arguments);',
    "  if (/worker-source(\\.js)?$/.test(request) && m && typeof m.liveWorkerSource === 'function' && !m.__s4Wrapped) {",
    '    const live = m.liveWorkerSource;',
    '    m.liveWorkerSource = async function () {',
    '      const s = await live.apply(this, arguments);',
    '      wrapped++;',
    '      return s.replace(' + JSON.stringify(FEE_MARKER) + ', () => ' + JSON.stringify('ret-=p.assumptions.fee/100+1e-4;') + ');',
    '    };',
    '    m.__s4Wrapped = true;',
    '  }',
    '  return m;',
    '};',
    "process.on('exit', () => process.stderr.write('WORKER MUTATION APPLIED ' + wrapped + '\\n'));",
  ].join('\n'));
  try {
    const env = Object.assign({}, process.env);
    delete env.NODE_TEST_CONTEXT;
    const pattern = 'every corpus scenario agrees between Node and the real built Worker|the Worker also agrees with runPlan|exactly one leaf is excluded';
    const r = spawnSync(process.execPath, ['--require', hook, '--test-reporter=tap', '--test-name-pattern', pattern, path.join(ROOT, 'tests', 'worker-parity.test.js')], { encoding: 'utf8', env, maxBuffer: 1 << 28 });
    const failed = [...r.stdout.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
    const passed = [...r.stdout.matchAll(/^\s*ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
    assert.match(r.stderr, /WORKER MUTATION APPLIED [1-9]/, 'CONTROL: the Worker-only change reached the file: ' + r.stderr.slice(-300));
    assert.ok(passed.some((n) => /exactly one leaf is excluded/.test(n)), 'CONTROL: the unrelated test still passes: ' + JSON.stringify(passed));
    assert.ok(failed.some((n) => /every corpus scenario agrees between Node and the real built Worker/.test(n)), 'Node-versus-Worker parity must go red: ' + JSON.stringify(failed));
    assert.ok(failed.some((n) => /the Worker also agrees with runPlan/.test(n)), 'runPlan-versus-Worker parity must go red: ' + JSON.stringify(failed));
    assert.match(r.stdout, /golden:baseline/, 'the failure names the scenario');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
