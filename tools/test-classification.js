'use strict';

/*
 * S4 task 9 -- what survives a rebuild.
 *
 * Every file in tests/ and tests/ported/ is put in exactly one class:
 *
 *   implementation-independent  asserts behaviour through inputs and outputs:
 *                               runPlan() / runScenario(), the built app, the
 *                               built Worker, golden fixtures. Survives a rebuild.
 *   implementation-coupled      calls an engine function other than those entry
 *                               points, calls a debt or ported module's functions
 *                               directly, or reads the engine's source text.
 *                               Must be re-pointed at whatever the rebuild exposes.
 *   infrastructure              its subject is an instrument, a build step or a
 *                               contract, not a financial behaviour. Survives
 *                               with edits.
 *
 * THE RULE IS MECHANICAL WHERE IT CAN BE AND EXPLICIT WHERE IT CANNOT. Coupling
 * is read from the file itself: its requires, including path.join forms, and
 * the engine members it touches. Whether a file's SUBJECT is infrastructure
 * cannot be read that way -- behaviour tests borrow the capture tool for its
 * corpus -- so infrastructure is a named list, one reason per file.
 *
 * 9.4 IS MEASURED AT TWO GRANULARITIES, AND THEY BRACKET THE TRUTH.
 *   file level   a requirement is flagged when every file guarding it depends on
 *                internals. An UPPER bound: one internal call anywhere in a file
 *                of twenty runPlan tests makes all twenty look coupled.
 *   test level   for requirements a test names, only that test's own body is
 *                read. A LOWER bound: a helper the body calls is not followed,
 *                so indirection through a file-level helper reads as independent.
 *
 *   node tools/test-classification.js build [--write] | check
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CLASSIFICATION_PATH = path.join(ROOT, 'tools', 'test-classification.json');
const CATEGORIES = ['implementation-independent', 'implementation-coupled', 'infrastructure'];
const PUBLIC_ENTRY_POINTS = ['runPlan', 'runScenario'];
const VARIANT_MARKERS = 'engine source text (tests/lib/engine-variant.js markers)';

const INFRASTRUCTURE = {
  'tests/verify-test-gate.test.js': 'the release gate',
  'tests/build-debt-bundling.test.js': 'build.js debt-module bundling',
  'tests/no-duplicate-declarations.test.js': 'build output and generated Worker source hygiene',
  'tests/module-exclusion-registry.test.js': 'the bundling exclusion registry (decision register P19)',
  'tests/audit-fc-findings.test.js': 'build.js require rewriting and the invisible-character gate',
  'tests/audit-q15-worker-dependencies.test.js': 'Worker dependency assembly',
  'tests/worker-parity.test.js': 'main-thread versus Worker assembly parity',
  'tests/current-build-lane.test.js': 'the fresh and historical artifact lanes',
  'tests/build-routes.test.js': 'the fresh-build routes of the differential comparison',
  'tests/capture-baseline.test.js': 'the baseline capture tool',
  'tests/audit-ra04-baseline-integrity.test.js': 'baseline capture integrity',
  'tests/capture-boundary.test.js': 'the capture execution boundary',
  'tests/baseline-registry.test.js': 'the stored-baseline registry',
  'tests/baseline-provenance.test.js': 'stored-baseline provenance',
  'tests/control-corpus.test.js': 'the control corpus record',
  'tests/corpus-invariant.test.js': 'the independent corpus invariant',
  'tests/corpus-composition.test.js': 'corpus compositions',
  'tests/differential-harness.test.js': 'the differential harness',
  'tests/historical-replay.test.js': 'the historical replay and the candidate prediction behind control test 4.7',
  'tests/reference-tree-archive-replay.test.js': 'the committed reference tree that lets a source package replay control test 4.7',
  'tests/requirements-register.test.js': 'the requirements register and closeout check',
  'tests/test-classification.test.js': 'this classification',
  'tests/scenario-validator.test.js': 'the scenario validator',
  'tests/scenario-validator-no-false-positives.test.js': 'the scenario validator',
  'tests/audit-fm09-arm-flag-typing.test.js': 'validator typing of the ARM flag',
  'tests/boolean-flag-contract.test.js': 'the boolean input contract across the validator and engine routes',
  'tests/scenario-generator.test.js': 'the corpus scenario generator',
  'tests/schema-catalogue.test.js': 'the schema catalogue',
  'tests/result-contract.test.js': 'the result contract checker',
  'tests/s2-closure-register.test.js': 'the S2 decision register document',
  'tests/bench-simulation.test.js': 'the simulation benchmark tool',
  /* S4 task 10. Its own text reaches no engine internal, so the text rule reads it as
     independent -- but it measures simulatePlan, rng and aggregateMonteCarloRuns through
     tools/device-benchmark-core.js, which a scan of the test file cannot see. */
  'tests/device-benchmark.test.js': 'the device benchmark page and its measurement core',
  'tests/debug-module.test.js': 'the debug export module',
  'tests/audit-st2-findings.test.js': 'round-2 findings against the capture and Worker instruments',
  'tests/generate-golden-scenarios.js': 'the golden-fixture generator script; not a test the gate runs',
};

function listTestFiles(root) {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) {
        if (!(dir === 'tests' && (e.name === 'lib' || e.name === 'fixtures'))) walk(rel);
      } else if (/\.(c|m)?js$/.test(e.name)) {
        out.push(rel);
      }
    }
  })('tests');
  return out.sort();
}

/* The engine's exports, read from its own footer without loading it. */
function engineExports(root) {
  const text = fs.readFileSync(path.join(root, 'src', 'engine.js'), 'utf8');
  const at = text.lastIndexOf('module.exports = {');
  const body = text.slice(at + 'module.exports = {'.length, text.indexOf('}', at));
  return body.split(',').map((s) => s.trim().split(':')[0].trim()).filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
}

const normalizeRef = (r) => r.replace(/\\/g, '/').replace(/^(\.\.?\/)+/, '').replace(/\.js$/, '');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isEngineArg = (arg) => /src['"`/\\,\s]+engine/.test(arg) || /src\/engine/.test(arg);
const moduleOf = (arg) => {
  const parts = [...arg.matchAll(/(['"`])([^'"`]+)\1/g)].map((x) => x[2]);
  const ref = normalizeRef(parts.join('/'));
  const m = ref.match(/(?:^|\/)src\/(debt-[\w-]+|mortgage-[\w-]+|ported\/[\w-]+)$/);
  return m ? 'src/' + m[1] : null;
};

/* The names a file binds to the engine and to debt or ported modules. */
function bindingsOf(text, exports) {
  const engineAliases = new Set(['engine']);
  const engineNames = new Set();
  const moduleAliases = new Map();
  const moduleNames = new Map();
  for (const m of text.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(([^;\n]*)\)/g)) {
    if (isEngineArg(m[2])) engineAliases.add(m[1]);
    const mod = moduleOf(m[2]);
    if (mod) moduleAliases.set(m[1], mod);
  }
  for (const m of text.matchAll(/(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\(([^;\n]*)\)/g)) {
    const names = m[1].split(',').map((s) => s.trim().split(':').pop().trim()).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
    if (isEngineArg(m[2])) names.filter((n) => exports.includes(n)).forEach((n) => engineNames.add(n));
    const mod = moduleOf(m[2]);
    if (mod) names.forEach((n) => moduleNames.set(n, mod));
  }
  return { engineAliases, engineNames, moduleAliases, moduleNames };
}

/* Internals a span of text reaches, given the file's bindings. */
function internalsIn(span, bindings, exports) {
  const members = new Set();
  for (const alias of bindings.engineAliases) {
    for (const m of span.matchAll(new RegExp('\\b' + escapeRe(alias) + '\\.([A-Za-z_$][\\w$]*)', 'g'))) if (exports.includes(m[1])) members.add(m[1]);
  }
  for (const name of bindings.engineNames) if (new RegExp('\\b' + escapeRe(name) + '\\b').test(span)) members.add(name);
  const modules = new Set();
  for (const [alias, mod] of bindings.moduleAliases) if (new RegExp('\\b' + escapeRe(alias) + '\\.').test(span)) modules.add(mod);
  for (const [name, mod] of bindings.moduleNames) if (new RegExp('\\b' + escapeRe(name) + '\\s*\\(').test(span)) modules.add(mod);
  return { members, modules };
}

/* What a whole test file reaches, read from its text. */
function scanText(text, exports) {
  const refs = new Set();
  for (const m of text.matchAll(/require\(\s*(['"`])([^'"`]+)\1\s*\)/g)) refs.add(normalizeRef(m[2]));
  for (const m of text.matchAll(/path\.join\(([^)]*)\)/g)) {
    const parts = [...m[1].matchAll(/(['"`])([^'"`]+)\1/g)].map((x) => x[2]);
    if (parts.length) refs.add(normalizeRef(parts.join('/')));
  }
  const refList = [...refs];
  const requiredModules = refList.filter((r) => /(^|\/)src\/(debt-[\w-]+|mortgage-[\w-]+|ported\/[\w-]+)$/.test(r)).map((r) => r.replace(/^.*?src\//, 'src/'));
  const bindings = bindingsOf(text, exports);
  const { members } = internalsIn(text, bindings, exports);
  const usesVariant = refList.some((r) => /lib\/(engine-variant|household-ledger)$/.test(r));
  const internals = [...members].filter((n) => !PUBLIC_ENTRY_POINTS.includes(n)).sort()
    .concat([...new Set(requiredModules)].sort())
    .concat(usesVariant ? [VARIANT_MARKERS] : []);
  const via = [];
  if ([...members].some((n) => PUBLIC_ENTRY_POINTS.includes(n)) || refList.some((r) => /(^|\/)src\/engine$/.test(r))) via.push('runPlan/runScenario');
  if (/loadCalculator|new JSDOM/.test(text)) via.push('the built app in jsdom');
  if (/liveWorkerSource|postToWorker/.test(text)) via.push('the built Worker source');
  if (refList.some((r) => /lib\/golden-scenario-defs$/.test(r))) via.push('golden scenario definitions');
  return { internals, publicMembers: [...members].filter((n) => PUBLIC_ENTRY_POINTS.includes(n)).sort(), via };
}

/* The source of one named test, from its test( call to the matching close.
   Strings and comments are skipped roughly; a return of null means the body
   could not be isolated, and the caller says so rather than guessing. */
function testBlock(text, title) {
  let at = -1;
  for (const q of ["'", '"', '`']) {
    const i = text.indexOf(q + title + q);
    if (i !== -1) { at = i; break; }
  }
  if (at === -1) return null;
  const call = Math.max(text.lastIndexOf('test(', at), text.lastIndexOf('it(', at));
  if (call === -1) return null;
  let depth = 0;
  let quote = null;
  for (let i = text.indexOf('(', call); i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '/' && text[i + 1] === '/') { const nl = text.indexOf('\n', i); i = nl === -1 ? text.length : nl; continue; }
    if (ch === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end === -1 ? text.length : end + 1; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return text.slice(call, i + 1);
    }
  }
  return null;
}

function classifyFile(rel, scan) {
  if (Object.prototype.hasOwnProperty.call(INFRASTRUCTURE, rel)) {
    return { file: rel, category: 'infrastructure', reason: INFRASTRUCTURE[rel], internals: scan.internals };
  }
  if (scan.internals.length) return { file: rel, category: 'implementation-coupled', internals: scan.internals };
  return { file: rel, category: 'implementation-independent', via: scan.via, internals: [] };
}

/* A guard is coupled when its file depends on internals, whatever its class. */
const coupledGuard = (entry) => Boolean(entry) && entry.internals.length > 0;

const OPEN_FIELDS = { severity: 'UNASSIGNED', owner: 'UNASSIGNED', downstreamTask: 'UNASSIGNED', deadline: 'UNASSIGNED' };

/* 9.4, at both granularities. `readText(file)` supplies test source. */
function coupledOnlyGuards(register, byFile, readText, exports) {
  const flagged = [];
  for (const r of register.requirements) {
    const files = r.guard.tests.length ? [...new Set(r.guard.tests.map((t) => t.split(' :: ')[0]))] : r.guard.files;
    if (!files.length) continue;
    if (!files.every((f) => coupledGuard(byFile[f]))) continue;
    let testLevel = 'not-applicable: cited by a file, named by no test';
    if (r.guard.tests.length && readText && exports) {
      const verdicts = r.guard.tests.map((t) => {
        const [file, title] = t.split(' :: ');
        const text = readText(file);
        const block = testBlock(text, title);
        if (!block) return 'unresolved';
        const hit = internalsIn(block, bindingsOf(text, exports), exports);
        const internal = [...hit.members].filter((n) => !PUBLIC_ENTRY_POINTS.includes(n)).length + hit.modules.size;
        return internal ? 'coupled' : 'independent';
      });
      testLevel = verdicts.includes('independent') ? 'independent' : verdicts.includes('unresolved') ? 'unresolved' : 'coupled';
    }
    flagged.push(Object.assign({ id: 'COUPLED-ONLY-' + r.id, kind: 'coupled-only-guard', requirement: r.id, guards: files.sort(),
      internals: [...new Set(files.flatMap((f) => byFile[f].internals))].sort(), testLevel }, OPEN_FIELDS));
  }
  const identities = [
    ['COUPLED-ONLY-IDENTITY-PORTFOLIO', 'the portfolio flow identity (L4)', 'tests/reconciliation-invariant.test.js'],
    ['COUPLED-ONLY-IDENTITY-HOUSEHOLD', 'the household cash-flow identity (S4 task 6)', 'tests/household-ledger.test.js'],
  ];
  for (const [id, requirement, file] of identities) {
    if (coupledGuard(byFile[file])) {
      flagged.push(Object.assign({ id, kind: 'coupled-only-guard', requirement, guards: [file], internals: byFile[file].internals, testLevel: 'coupled: the identity is computed through internals' }, OPEN_FIELDS));
    }
  }
  return flagged.sort((a, b) => a.id.localeCompare(b.id));
}

function build(root) {
  const base = root || ROOT;
  const exports = engineExports(base);
  const texts = new Map();
  const readText = (rel) => {
    if (!texts.has(rel)) texts.set(rel, fs.readFileSync(path.join(base, rel), 'utf8'));
    return texts.get(rel);
  };
  const files = listTestFiles(base).map((rel) => classifyFile(rel, scanText(readText(rel), exports)));
  const byFile = Object.fromEntries(files.map((f) => [f.file, f]));
  const counts = { total: files.length };
  CATEGORIES.forEach((c) => { counts[c] = files.filter((f) => f.category === c).length; });
  const internalsByUse = {};
  files.filter((f) => f.category === 'implementation-coupled').forEach((f) => f.internals.forEach((n) => { internalsByUse[n] = (internalsByUse[n] || 0) + 1; }));
  const register = JSON.parse(fs.readFileSync(path.join(base, 'tools', 'requirements-register.json'), 'utf8'));
  const coupledOnly = coupledOnlyGuards(register, byFile, readText, exports);
  const level = (v) => coupledOnly.filter((x) => x.testLevel.startsWith(v)).length;
  return {
    formatVersion: 1,
    about: 'S4 task 9: every file in tests/ and tests/ported/ classified by what survives a rebuild. Generated by tools/test-classification.js build --write and held to a fresh classification by tests/test-classification.test.js. Coupling is read from each file; infrastructure is a named list with reasons, because a file\'s requires cannot say what its subject is.',
    rules: {
      publicEntryPoints: PUBLIC_ENTRY_POINTS,
      coupled: 'calls an engine export other than the public entry points, calls a debt or ported module directly, or reads engine source text through tests/lib/engine-variant.js',
      infrastructure: 'named in tools/test-classification.js INFRASTRUCTURE, with a reason',
      coupledOnly: 'file level (upper bound): a requirement, or one of the two flow identities, whose every guarding file depends on internals. testLevel (lower bound): for requirements a test names, whether that test\'s own body reaches internals; helpers it calls are not followed',
    },
    counts,
    coupledOnlyBounds: {
      fileLevelUpperBound: coupledOnly.length,
      testLevelCoupled: level('coupled'),
      testLevelIndependent: level('independent'),
      testLevelUnresolved: level('unresolved'),
      citedOnlyNotApplicable: level('not-applicable'),
    },
    internalsByUse: Object.fromEntries(Object.entries(internalsByUse).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    files,
    coupledOnly,
  };
}

function main(argv) {
  const cmd = argv[0];
  if (cmd === 'build') {
    const c = build(ROOT);
    if (argv.includes('--write')) fs.writeFileSync(CLASSIFICATION_PATH, JSON.stringify(c, null, 1) + '\n');
    console.log(JSON.stringify(c.counts) + ' ' + JSON.stringify(c.coupledOnlyBounds));
    return 0;
  }
  if (cmd === 'check') {
    const fresh = JSON.stringify(build(ROOT), null, 1) + '\n';
    const committed = fs.existsSync(CLASSIFICATION_PATH) ? fs.readFileSync(CLASSIFICATION_PATH, 'utf8').replace(/\r\n/g, '\n') : '';
    console.log(fresh === committed ? 'test classification: up to date' : 'test classification: DRIFTED -- rebuild with `node tools/test-classification.js build --write` and review the diff');
    return fresh === committed ? 0 : 1;
  }
  console.log('usage: node tools/test-classification.js build [--write] | check');
  return cmd ? 2 : 0;
}

module.exports = { CLASSIFICATION_PATH, CATEGORIES, PUBLIC_ENTRY_POINTS, INFRASTRUCTURE, listTestFiles, engineExports, scanText, bindingsOf, internalsIn, testBlock, classifyFile, coupledOnlyGuards, build };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
