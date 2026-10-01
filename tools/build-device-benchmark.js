'use strict';

/*
 * S4 task 10 -- writes the self-contained device benchmark page (10.1).
 *
 * The page carries everything it runs: the build's own debt-module block and
 * engine body (taken from build.js, so it is the engine the calculator ships,
 * not a copy of it), the 2026 rules, the Monte Carlo plan, the measurement core
 * (tools/device-benchmark-core.js), and the aggregate fingerprint Node computes
 * for every stage, so a phone can check its own results against Node's.
 *
 * It fetches nothing, stores nothing and loads no library, so it can be opened
 * from a file or served from anywhere a phone can reach. Hosting it is 10.4 and
 * is not done here.
 *
 * IDENTITY. The page records the commit, the SHA-256 of every input, whether
 * those inputs are the committed bytes (the same boundary tools/capture-baseline.js
 * applies), and a content hash over what it embeds. A file cannot contain its own
 * hash, so the page file's SHA-256 is printed here, for the operator to record
 * beside the result.
 *
 *   node tools/build-device-benchmark.js --out <file.html>
 *        [--stages 100,250,500,1000,2500,5000] [--reps 3] [--seed 123456] [--budget-ms 20000]
 *        [--max-lag-ms 1000]   the stall limit: a phone page is built with a larger one
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const CORE_PATH = path.join(__dirname, 'device-benchmark-core.js');
const core = require(CORE_PATH);

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

function extractFunction(text, name) {
  const head = 'function ' + name + '(';
  const start = text.indexOf(head);
  if (start < 0 || text.indexOf(head, start + 1) >= 0) throw new Error('build-device-benchmark: ' + head + ' must occur exactly once in the shell');
  let depth = 0;
  for (let i = text.indexOf('{', start); i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error('build-device-benchmark: unbalanced ' + name);
}

function rulesTextOf(shell) {
  const m = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('build-device-benchmark: the rules block was not found in the shell');
  return m[1];
}

/* Text placed inside a <script> element must not be able to end it early. */
function assertInlineSafe(label, text) {
  if (/<\/script/i.test(text) || text.includes('<!--')) throw new Error('build-device-benchmark: ' + label + ' cannot be inlined -- it contains a script terminator or comment opener');
  return text;
}

const jsonForScript = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

function inputFiles(root) {
  const { BUNDLED_MODULES } = require(path.join(root, 'build.js'));
  /* src/boolean-flag-contract.json: S5 2l's build() substitutes the Q53
     contract into the engine body this page embeds. Declared in its own
     instrument commit, ahead of that change. */
  return ['build.js', 'src/app-shell.html', 'src/boolean-flag-contract.json', 'src/engine.js', 'src/plan-value-contract.json']
    .concat(BUNDLED_MODULES.map((m) => 'src/' + m.file))
    .concat(['tests/lib/golden-scenario-defs.js', 'tools/device-benchmark-core.js', 'tools/build-device-benchmark.js'])
    .sort();
}

/* The build's own pieces: build() writes a file, so it writes one into a temporary directory. */
function buildParts(root) {
  const { build } = require(path.join(root, 'build.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'device-benchmark-build-'));
  const log = console.log;
  console.log = () => {};
  try {
    const parts = build(path.join(dir, 'app.html'), path.join(root, 'src'));
    return { debtModulesBlock: parts.debtModulesBlock, engineBody: parts.engineBody };
  } finally {
    console.log = log;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* A factory expression: given the rules text, it returns the three functions the benchmark calls. */
function engineFactorySource(shell, parts) {
  return '(function (rulesText) {\n"use strict";\n' +
    extractFunction(shell, 'deepFreeze') + '\n' +
    'var RULES = deepFreeze(JSON.parse(rulesText));\n' +
    assertInlineSafe('the debt-module block', parts.debtModulesBlock) + '\n' +
    assertInlineSafe('the engine body', parts.engineBody) + '\n' +
    'return { simulatePlan: simulatePlan, rng: rng, aggregateMonteCarloRuns: aggregateMonteCarloRuns };\n})';
}

function planTemplate(root, shell, seed) {
  const { extractDefaultPlan, buildScenario } = require(path.join(root, 'tests', 'lib', 'golden-scenario-defs.js'));
  return buildScenario(extractDefaultPlan(shell), { assumptions: { method: 'monteCarlo', runs: 0, seed } });
}

/* The same derivation the page uses. */
function planFor(template, pathCount) {
  const plan = JSON.parse(JSON.stringify(template));
  plan.assumptions.runs = pathCount;
  return plan;
}

/* Node's answer for every stage, from the engine module itself -- not from the embedded copy. */
function referencesFor(root, shell, template, stages, seed) {
  global.RULES = JSON.parse(rulesTextOf(shell));
  const engine = require(path.join(root, 'src', 'engine.js'));
  const now = () => Number(process.hrtime.bigint()) / 1e6;
  const out = {};
  stages.forEach((n) => { out[n] = core.runSample(engine, planFor(template, n), n, seed, now).fingerprint; });
  return out;
}

function gitCommit(root) {
  try {
    const { execFileSync } = require('node:child_process');
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (path.resolve(top).toLowerCase() !== path.resolve(root).toLowerCase()) return null;
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    return null;
  }
}

function identityOf(root, files, embedded) {
  const inputHashes = {};
  files.forEach((f) => { inputHashes[f] = sha256(fs.readFileSync(path.join(root, f))); });
  let boundary;
  if (path.resolve(root) === path.resolve(ROOT)) {
    const b = require('./capture-baseline.js').boundaryOf(files);
    boundary = { commit: b.commit, qualified: b.qualified, reason: b.reason, mismatched: b.mismatched, untracked: b.untracked };
  } else {
    boundary = { commit: gitCommit(root), qualified: false, reason: 'generated from a tree other than this checkout; its inputs are not held to a commit', mismatched: [], untracked: [] };
  }
  return {
    generator: 'tools/build-device-benchmark.js',
    commit: boundary.commit,
    boundary,
    inputHashes,
    contentSha256: sha256(JSON.stringify(embedded)),
    embeddedEngineSha256: sha256(embedded.engineFactory),
    note: 'contentSha256 covers the embedded engine, rules, plan, references, protocol and measurement core. The page file hash is printed by the generator: a file cannot contain its own hash.',
  };
}

const STYLE = [
  ':root{color-scheme:light dark;--bg:#fafaf7;--fg:#1d1d1b;--muted:#5f5f5a;--line:#d9d8d0;--accent:#1f5f8b;--bad:#a1331f}',
  '@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#ecebe6;--muted:#a3a29b;--line:#3a3a36;--accent:#7fb6dc;--bad:#e58a73}}',
  'body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
  'main{max-width:46rem;margin:0 auto;padding:1rem}',
  'h1{font-size:1.3rem;margin:.2rem 0 .6rem}',
  '.note{color:var(--muted);font-size:.9rem}',
  'label{display:block;margin:.6rem 0 .2rem}',
  'input[type=text]{width:100%;box-sizing:border-box;padding:.5rem;font:inherit;border:1px solid var(--line);border-radius:6px;background:transparent;color:inherit}',
  'button{font:inherit;padding:.55rem 1rem;margin:.6rem .4rem 0 0;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:var(--bg)}',
  'button:disabled{opacity:.45}',
  'button.secondary{background:transparent;color:var(--accent)}',
  '.scroll{overflow-x:auto;margin-top:.8rem}',
  'table{border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:.85rem;min-width:100%}',
  'th,td{border-bottom:1px solid var(--line);padding:.3rem .45rem;text-align:right;white-space:nowrap}',
  'th:first-child,td:first-child{text-align:left}',
  '.bad{color:var(--bad);font-weight:600}',
  'textarea{width:100%;box-sizing:border-box;min-height:12rem;font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;background:transparent;color:inherit;border:1px solid var(--line);border-radius:6px}',
  'pre{white-space:pre-wrap;word-break:break-all;font-size:.75rem;color:var(--muted)}',
].join('\n');

/* The page's own script: wiring only. Every measurement decision is in the core. */
function pageScript(engineFactory) {
  return [
    '(function () {',
    '  "use strict";',
    '  var core = window.DeviceBenchmarkCore;',
    '  var $ = function (id) { return document.getElementById(id); };',
    '  var config = JSON.parse($("bench-config").textContent);',
    '  var createEngine = ' + engineFactory + ';',
    '  var running = false, cancelled = false;',
    '  var now = function () { return performance.now(); };',
    '  var yieldToPage = function () { return new Promise(function (resolve) { var t = now(); setTimeout(function () { resolve(now() - t); }, 0); }); };',
    '  var planFor = function (n) { var p = JSON.parse(JSON.stringify(config.template)); p.assumptions.runs = n; return p; };',
    '  var precise = window.crossOriginIsolated && typeof performance.measureUserAgentSpecificMemory === "function"',
    '    ? function () { return performance.measureUserAgentSpecificMemory().then(function (m) { return { source: "performance.measureUserAgentSpecificMemory", precise: true, bytes: m.bytes }; }); }',
    '    : null;',
    '  var fmt = function (v, d) { return typeof v === "number" && isFinite(v) ? v.toFixed(d) : "\\u2014"; };',
    '  function cell(tr, text, bad) { var td = document.createElement("td"); td.textContent = text; if (bad) td.className = "bad"; tr.appendChild(td); }',
    '  function onStage(s) {',
    '    var tr = document.createElement("tr");',
    '    var heap = s.heapWithPathsReferenced;',
    '    cell(tr, String(s.pathCount));',
    '    cell(tr, fmt(s.coldSimMs, 0));',
    '    cell(tr, fmt(s.warmSimMs.median, 0) + (s.warmSimMs.n ? " (" + fmt(s.warmSimMs.min, 0) + "\\u2013" + fmt(s.warmSimMs.max, 0) + ")" : ""));',
    '    cell(tr, fmt(s.warmAggregateMs.median, 0));',
    '    cell(tr, fmt(s.microsecondsPerPath, 0));',
    '    cell(tr, heap.source === "unavailable" ? "unavailable" : fmt(heap.bytesPerPath / 1024, 1) + " KiB");',
    '    cell(tr, s.consistency + " / " + s.reference, s.consistency !== "consistent" || s.reference !== "matches");',
    '    $("progress").tBodies[0].appendChild(tr);',
    '    $("status").textContent = "Finished " + s.pathCount + " paths.";',
    '  }',
    '  function setState(state, message) { document.body.setAttribute("data-state", state); $("status").textContent = message; }',
    '  $("start").addEventListener("click", function () {',
    '    if (running) return;',
    '    running = true; cancelled = false;',
    '    $("start").disabled = true; $("cancel").disabled = false; $("copy").disabled = true; $("result").value = "";',
    '    $("progress").tBodies[0].textContent = "";',
    '    setState("running", "Running. Keep the screen on and this page in front.");',
    '    var startedAt = new Date().toISOString();',
    '    var sinceNavigationMs = now();',
    '    var engine, engineLoadMs;',
    '    try { var t = now(); engine = createEngine($("bench-rules").textContent); engineLoadMs = now() - t; }',
    '    catch (e) { running = false; $("start").disabled = false; $("cancel").disabled = true; setState("failed", "The engine did not load: " + e.message); return; }',
    '    core.collectEnvironment(navigator, performance, window).then(function (env) {',
    '      env.operator = { device: $("device").value.trim() || "not recorded", condition: $("condition").value.trim() || "not recorded", foregroundConfirmed: $("foreground").checked };',
    '      env.visibilityAtStart = document.visibilityState || "unavailable";',
    '      env.startedAt = startedAt;',
    '      env.coldStart = { msFromNavigationToStart: sinceNavigationMs, engineLoadMs: engineLoadMs, note: "the first sample of the first stage is the cold run; later stages run on a warmed engine" };',
    '      return core.runProtocol({ engine: engine, planFor: planFor, protocol: config.protocol, references: config.references, environment: env, identity: config.identity,',
    '        now: now, yieldToPage: yieldToPage, heartbeat: yieldToPage, readHeap: function () { return core.heapReading(performance); }, measurePrecise: precise,',
    '        isCancelled: function () { return cancelled; }, isHidden: function () { return document.visibilityState === "hidden"; }, onProgress: onStage });',
    '    }).then(function (report) {',
    '      report.finishedAt = new Date().toISOString();',
    '      $("result").value = JSON.stringify(report, null, 2);',
    '      $("copy").disabled = false;',
    '      setState(report.completed ? "completed" : "stopped", report.completed ? "Completed. Copy the result below." : "Stopped: " + report.stopped.reason + ". The result below records it.");',
    '    }).catch(function (e) {',
    '      setState("failed", "The run failed: " + ((e && e.message) || e));',
    '    }).then(function () { running = false; $("start").disabled = false; $("cancel").disabled = true; });',
    '  });',
    '  $("cancel").addEventListener("click", function () { cancelled = true; $("status").textContent = "Cancelling after the current sample\\u2026"; });',
    '  $("copy").addEventListener("click", function () {',
    '    var text = $("result").value;',
    '    var fallback = function () { $("result").select(); try { document.execCommand("copy"); $("status").textContent = "Copied."; } catch (e) { $("status").textContent = "Select the text and copy it by hand."; } };',
    '    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { $("status").textContent = "Copied."; }, fallback); else fallback();',
    '  });',
    '  $("identity").textContent = "commit " + (config.identity.commit || "none") + (config.identity.boundary.qualified ? "" : "  [UNQUALIFIED: " + config.identity.boundary.reason + "]") + "\\ncontent " + config.identity.contentSha256 + "\\nstages " + config.protocol.stages.join(", ") + "  seed " + config.protocol.seed + "  warm reps " + config.protocol.warmReps;',
    '  setState("ready", "Ready.");',
    '})();',
  ].join('\n');
}

function render(embedded, identity) {
  const config = { template: embedded.template, references: embedded.references, protocol: embedded.protocol, identity };
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Calculator device benchmark</title>',
    '<style>', STYLE, '</style>',
    '</head>',
    '<body data-state="loading">',
    '<main>',
    '<h1>Calculator device benchmark</h1>',
    '<p class="note">Runs the calculator\'s Monte Carlo engine at increasing path counts and reports what it measured. It sets no threshold, stores nothing, and sends nothing: copy the result and pass it on.</p>',
    '<pre id="identity"></pre>',
    '<label for="device">Device (make, model, OS and browser version)</label>',
    '<input type="text" id="device" autocomplete="off">',
    '<label for="condition">Condition (battery or charging, warm or cool, other apps open)</label>',
    '<input type="text" id="condition" autocomplete="off">',
    '<label><input type="checkbox" id="foreground"> The screen will stay on and this page will stay in front</label>',
    '<button id="start" type="button">Start</button><button id="cancel" type="button" class="secondary" disabled>Cancel</button>',
    '<p id="status" role="status" aria-live="polite">Loading…</p>',
    '<div class="scroll"><table id="progress"><thead><tr><th>Paths</th><th>Cold sim ms</th><th>Warm sim ms, median (range)</th><th>Aggregate ms</th><th>µs/path</th><th>Heap/path</th><th>Result</th></tr></thead><tbody></tbody></table></div>',
    '<label for="result">Result</label>',
    '<textarea id="result" readonly></textarea>',
    '<button id="copy" type="button" disabled>Copy result</button>',
    '<ul class="note">' + core.CAVEATS.map((c) => '<li>' + c.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</li>').join('') + '</ul>',
    '</main>',
    '<script type="application/json" id="bench-rules">' + assertInlineSafe('the rules', embedded.rulesText) + '</script>',
    '<script type="application/json" id="bench-config">' + jsonForScript(config) + '</script>',
    '<script>\n' + assertInlineSafe('the measurement core', embedded.coreSource) + '\n</script>',
    '<script>\n' + pageScript(embedded.engineFactory) + '\n</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function generate(options) {
  const opts = options || {};
  const root = opts.root || ROOT;
  const protocol = Object.assign({}, core.DEFAULT_PROTOCOL, opts.protocol || {});
  const shell = fs.readFileSync(path.join(root, 'src', 'app-shell.html'), 'utf8');
  const template = planTemplate(root, shell, protocol.seed);
  const embedded = {
    engineFactory: engineFactorySource(shell, buildParts(root)),
    rulesText: rulesTextOf(shell),
    template,
    references: referencesFor(root, shell, template, protocol.stages, protocol.seed),
    protocol,
    coreSource: fs.readFileSync(path.join(root, 'tools', 'device-benchmark-core.js'), 'utf8'),
  };
  const identity = identityOf(root, inputFiles(root), embedded);
  const html = render(embedded, identity);
  return { html, identity, embedded, pageSha256: sha256(html) };
}

function parseArgs(argv) {
  const args = { out: null, protocol: {} };
  const ints = (v, flag) => {
    const list = String(v).split(',').map((s) => Number(s.trim()));
    if (!list.length || list.some((n) => !Number.isInteger(n) || n < 1)) throw new Error(flag + ' takes positive integers');
    return list;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (v === undefined && a !== '--help') throw new Error('missing value for ' + a);
    if (a === '--out') args.out = argv[++i];
    else if (a === '--stages') args.protocol.stages = ints(argv[++i], a);
    else if (a === '--reps') args.protocol.warmReps = ints(argv[++i], a)[0];
    else if (a === '--seed') args.protocol.seed = ints(argv[++i], a)[0];
    else if (a === '--budget-ms') args.protocol.stageTimeBudgetMs = ints(argv[++i], a)[0];
    else if (a === '--max-lag-ms') args.protocol.maxLagMs = ints(argv[++i], a)[0];
    else throw new Error('unrecognized argument ' + a);
  }
  if (!args.out) throw new Error('--out <file.html> is required, so that nothing is written into the repository by default');
  return args;
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write('build-device-benchmark: ' + e.message + '\n');
    return 1;
  }
  const result = generate({ protocol: args.protocol });
  fs.writeFileSync(args.out, result.html, 'utf8');
  const b = result.identity.boundary;
  process.stdout.write([
    'wrote ' + args.out,
    'page sha256    ' + result.pageSha256 + '   (record this beside every result)',
    'content sha256 ' + result.identity.contentSha256,
    'commit         ' + (b.commit || 'none'),
    b.qualified ? 'inputs         the committed bytes' : 'UNQUALIFIED    ' + b.reason + (b.mismatched.length ? ': ' + b.mismatched.join(', ') : '') + (b.untracked.length ? '; untracked: ' + b.untracked.join(', ') : ''),
    'stages         ' + result.embedded.protocol.stages.join(', ') + '   seed ' + result.embedded.protocol.seed + '   warm reps ' + result.embedded.protocol.warmReps,
    'references     ' + JSON.stringify(result.embedded.references),
    '',
  ].join('\n'));
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  extractFunction,
  rulesTextOf,
  assertInlineSafe,
  inputFiles,
  engineFactorySource,
  planTemplate,
  planFor,
  referencesFor,
  identityOf,
  render,
  generate,
  parseArgs,
};
