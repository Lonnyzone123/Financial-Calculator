'use strict';

/*
 * S4 task 7 -- the differential harness.
 *
 * S5 moves financial output on purpose, one predicted change at a time, and the
 * rebuild must then reproduce the corrected engine. Both are verified by
 * comparing a CANDIDATE implementation with a REFERENCE over the same corpus.
 * This is that comparison, built while the answer is trivially known -- old
 * versus old must be empty -- so it is proved before anything depends on it.
 *
 * WHAT RUNS (task 7.4a's route 1, the Node module graph). Each side is a
 * separately resolved tree -- a pinned worktree, a clone, or a directory holding
 * a capture's complete input graph (`stage`, below). Each side's OWN
 * tools/capture-baseline.js captures that side's OWN engine in its OWN process,
 * with an environment that carries no NODE_OPTIONS or test-runner context.
 * Nothing from either side is required into this process, so the two cannot
 * share a module, alias an object, or discard the same field by construction
 * (7.7). Which implementation actually ran is recorded from each capture's own
 * metadata: commit, source hashes, input graph, runtime and boundary.
 *
 * The other two routes 7.4a decided -- a fresh build's main thread in jsdom and
 * its Worker source -- are not compared here; DIFFERENTIAL_CUTOVER.md says where
 * they are.
 *
 * WHAT IT COMPARES. Both operands must first pass the independent corpus
 * invariant (tools/corpus-invariant.js): two captures carrying identical damage
 * diff empty (S4 task 3), so an empty diff alone is not a pass. Each operand is
 * checked by the invariant in ITS OWN tree. The invariant's ROUND-TRIP check
 * re-runs every plan and holds the capture to the engine that produced it, so a
 * candidate checked by the reference's invariant fails by construction --
 * measured: the first run of this harness's tests refused every candidate-only
 * change with 125 ROUND-TRIP problems. Both must be complete and must have
 * captured the same corpus inputs. Then every scenario's full result is walked
 * with a CLOSED set of
 * outcome kinds; a value outside it is UNKNOWN and fails the run. Comparison is
 * exact. There is no tolerance; a cross-runtime comparison that needs one must
 * specify it per field and unit, and must never let it hide a decision flip.
 *
 *   node tools/differential-harness.js compare --reference <tree> --candidate <tree>
 *        [--composition control|expanded] [--measured] [--out <dir>] [--json <file>] [--expect <prediction.json>]
 *   node tools/differential-harness.js stage <dir> [--from <tree>]
 *
 * Exit: 0 EMPTY, 1 DIFFERENT, 2 REFUSED or UNKNOWN. With --expect, 0 when the comparison is exactly as predicted
 * (matchPrediction(), below), 1 when it is not, 2 when it was REFUSED or UNKNOWN.
 */

const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HARNESS_ROOT = path.join(__dirname, '..');
const SPECS = { control: 'tools/corpus-spec.json', expanded: 'tools/corpus-spec-expanded.json' };
/* What a tree needs so its own invariant can check its own capture. */
const INVARIANT_INPUTS = ['tools/corpus-invariant.js', 'tools/result-contract.js', 'tools/result-contract.json', SPECS.control, SPECS.expanded];

/* The closed set of outcomes. Nothing else is ever reported. */
const KINDS = ['VALUE', 'TYPE', 'MISSING_FIELD', 'EXTRA_FIELD', 'LENGTH', 'MISSING_SCENARIO', 'EXTRA_SCENARIO', 'ORDER', 'UNKNOWN'];
/* Result fields that describe the run rather than an amount. */
const STATUS_FIELDS = ['status', 'calculationError', 'calculationErrorCode', 'failed', 'successRate', 'firstShortfallAge', 'sustainedFailureAge', 'failureAge', 'calculationErrorPaths', 'requestedPathCount', 'validPathCount'];
/* A difference here can flip a decision a user reads, so it is listed on its own. */
const DECISION_FIELDS = ['status', 'calculationError', 'failed'];

const VERDICT_EXIT = { EMPTY: 0, DIFFERENT: 1, REFUSED: 2, UNKNOWN: 2 };

function isolatedEnv() {
  const env = Object.assign({}, process.env);
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  return env;
}

function typeClass(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  return t === 'number' || t === 'string' || t === 'boolean' || t === 'object' ? t : 'unsupported:' + t;
}

const join = (at, key) => (at ? at + '.' + key : key);
const fieldOf = (p) => p.replace(/\[\d+\]/g, '[]');
const topField = (p) => p.split(/[.[]/)[0];
const preview = (v) => {
  const t = typeClass(v);
  return t === 'array' ? '[array of ' + v.length + ']' : t === 'object' ? '{object}' : v;
};

/* Walks two JSON values together. `tally.leaves` counts leaf comparisons. */
function compareValues(a, b, at, out, tally) {
  const ta = typeClass(a);
  const tb = typeClass(b);
  if (ta.startsWith('unsupported') || tb.startsWith('unsupported')) {
    out.push({ kind: 'UNKNOWN', path: at, reference: ta, candidate: tb });
    return;
  }
  if (ta !== tb) {
    out.push({ kind: 'TYPE', path: at, reference: ta, candidate: tb });
    return;
  }
  if (ta === 'array') {
    if (a.length !== b.length) out.push({ kind: 'LENGTH', path: at, reference: a.length, candidate: b.length });
    for (let i = 0; i < Math.min(a.length, b.length); i++) compareValues(a[i], b[i], at + '[' + i + ']', out, tally);
    return;
  }
  if (ta === 'object') {
    const inA = new Set(Object.keys(a));
    const inB = new Set(Object.keys(b));
    Object.keys(a).sort().forEach((k) => {
      if (inB.has(k)) compareValues(a[k], b[k], join(at, k), out, tally);
      else out.push({ kind: 'MISSING_FIELD', path: join(at, k), reference: preview(a[k]) });
    });
    Object.keys(b).sort().forEach((k) => { if (!inA.has(k)) out.push({ kind: 'EXTRA_FIELD', path: join(at, k), candidate: preview(b[k]) }); });
    return;
  }
  if (tally) tally.leaves++;
  if (!Object.is(a, b)) out.push({ kind: 'VALUE', path: at, reference: a, candidate: b });
}

function walkLeaves(v, at, visit) {
  const t = typeClass(v);
  if (t === 'array') v.forEach((x, i) => walkLeaves(x, at + '[' + i + ']', visit));
  else if (t === 'object') Object.keys(v).forEach((k) => walkLeaves(v[k], join(at, k), visit));
  else visit(at);
}

/* The comparison itself: scenario inventory, order, then every result. */
function compareSnapshots(reference, candidate) {
  const differences = [];
  const tally = { leaves: 0 };
  const refNames = reference.entries.map((e) => e.name);
  const candNames = candidate.entries.map((e) => e.name);
  const inRef = new Set(refNames);
  const inCand = new Set(candNames);
  refNames.forEach((n) => { if (!inCand.has(n)) differences.push({ kind: 'MISSING_SCENARIO', scenario: n, path: '' }); });
  candNames.forEach((n) => { if (!inRef.has(n)) differences.push({ kind: 'EXTRA_SCENARIO', scenario: n, path: '' }); });
  const common = refNames.filter((n) => inCand.has(n));
  const candOrder = candNames.filter((n) => inRef.has(n));
  if (JSON.stringify(common) !== JSON.stringify(candOrder)) differences.push({ kind: 'ORDER', scenario: '(corpus)', path: '', reference: common, candidate: candOrder });
  const refBy = new Map(reference.entries.map((e) => [e.name, e]));
  const candBy = new Map(candidate.entries.map((e) => [e.name, e]));
  common.forEach((n) => {
    const found = [];
    compareValues(refBy.get(n).result, candBy.get(n).result, '', found, tally);
    found.forEach((d) => differences.push(Object.assign({ scenario: n }, d)));
  });
  return { differences, leavesCompared: tally.leaves };
}

function reportOf(differences) {
  /* S5 task 1.7: null-prototype maps. These were plain objects written through
     read-or-init. A scenario or field named "constructor" read the inherited
     Object constructor, which is truthy, so the init never ran. A name of
     "__proto__" read Object.prototype itself. Either way `count++` wrote onto
     a shared built-in and the next line threw. Scenario names and field paths
     come from the captures being compared, and reportOf() is exported, so its
     keys are data. tests/instrument-own-key-dictionaries.test.js holds this,
     running each case in a fresh process. */
  const byKind = Object.create(null);
  const byScenario = Object.create(null);
  const byField = Object.create(null);
  differences.forEach((d) => {
    byKind[d.kind] = (byKind[d.kind] || 0) + 1;
    const s = byScenario[d.scenario] || (byScenario[d.scenario] = { count: 0, kinds: Object.create(null) });
    s.count++;
    s.kinds[d.kind] = (s.kinds[d.kind] || 0) + 1;
    const f = fieldOf(d.path);
    const e = byField[f] || (byField[f] = { count: 0, scenarios: [] });
    e.count++;
    if (!e.scenarios.includes(d.scenario)) e.scenarios.push(d.scenario);
  });
  return {
    byKind,
    byScenario,
    byField,
    statuses: differences.filter((d) => STATUS_FIELDS.includes(topField(d.path))),
    decisionFlips: differences.filter((d) => DECISION_FIELDS.includes(topField(d.path))),
  };
}

function coverageOf(reference, candidate, composition, leavesCompared) {
  const spec = JSON.parse(fs.readFileSync(path.join(HARNESS_ROOT, SPECS[composition]), 'utf8'));
  const modeOf = new Map(spec.scenarios.map((s) => [s.name, s.mode]));
  const candBy = new Map(candidate.entries.map((e) => [e.name, e]));
  const modes = {};
  const statuses = {};
  STATUS_FIELDS.forEach((f) => { statuses[f] = { compared: 0, presentInReference: 0 }; });
  let leaves = 0;
  const fields = new Set();
  reference.entries.forEach((e) => {
    const m = modeOf.get(e.name) || 'unknown';
    modes[m] = modes[m] || { compared: 0, of: 0 };
    modes[m].of++;
    const c = candBy.get(e.name);
    if (c) modes[m].compared++;
    walkLeaves(e.result, '', (p) => { leaves++; fields.add(fieldOf(p)); });
    STATUS_FIELDS.forEach((f) => {
      if (e.result && Object.prototype.hasOwnProperty.call(e.result, f)) {
        statuses[f].presentInReference++;
        if (c && c.result && Object.prototype.hasOwnProperty.call(c.result, f)) statuses[f].compared++;
      }
    });
  });
  return {
    scenarios: { compared: reference.entries.filter((e) => candBy.has(e.name)).length, of: reference.entries.length },
    modes,
    routes: { compared: 1, of: 3, thisRun: 'node module graph', others: 'fresh build main thread in jsdom; fresh build Worker source (DIFFERENTIAL_CUTOVER.md)' },
    leaves: { compared: leavesCompared, of: leaves },
    fields: { distinctInReference: fields.size },
    statuses,
  };
}

const digest = (o) => (o ? crypto.createHash('sha256').update(JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]))).digest('hex') : null);

/* Which implementation ran, from the capture's own metadata. */
function identityOf(tree, snapshot) {
  const m = snapshot.meta || {};
  return {
    tree: tree ? fs.realpathSync(tree) : null,
    commit: m.gitCommit || null,
    qualified: m.boundary ? m.boundary.qualified : null,
    sourceDigest: digest(m.sourceHashes),
    inputGraphDigest: m.inputGraph ? digest(m.inputGraph.files) : null,
    runtime: m.inputGraph ? m.inputGraph.runtime : null,
    corpusInputHash: m.corpusInputHash || null,
    outputHash: m.hash || null,
  };
}

/* One side: that tree's own capture tool, in its own process. */
function captureTree(label, tree, options) {
  const opts = options || {};
  const composition = opts.composition || 'control';
  const tool = path.join(tree, 'tools', 'capture-baseline.js');
  if (!fs.existsSync(tool)) throw new Error(label + ': ' + tree + ' has no tools/capture-baseline.js');
  const outDir = opts.outDir || fs.mkdtempSync(path.join(os.tmpdir(), 'differential-'));
  const file = path.join(outDir, label + '.json');
  const args = [tool, 'capture', file, '--composition', composition].concat(opts.measured ? ['--measured'] : []);
  const r = spawnSync(process.execPath, args, { cwd: tree, encoding: 'utf8', env: isolatedEnv(), maxBuffer: 1 << 26 });
  if (r.status !== 0 || !fs.existsSync(file)) {
    throw new Error(label + ': capture in ' + tree + ' failed (exit ' + r.status + '):\n' + String(r.stdout + r.stderr).slice(-2000));
  }
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { label, file, snapshot, identity: identityOf(tree, snapshot) };
}

const invariantCache = new Map();
/* The invariant of the tree that produced the capture, or this tree's when the
   capture arrives as a bare file. Which one ran is recorded. */
function invariantOf(file, composition, tree) {
  const root = tree && fs.existsSync(path.join(tree, 'tools', 'corpus-invariant.js')) ? fs.realpathSync(tree) : HARNESS_ROOT;
  const key = root + '|' + file + '|' + composition + '|' + fs.statSync(file).mtimeMs;
  if (invariantCache.has(key)) return invariantCache.get(key);
  const r = spawnSync(process.execPath, [path.join(root, 'tools', 'corpus-invariant.js'), 'check', file, '--spec', path.join(root, SPECS[composition])],
    { cwd: root, encoding: 'utf8', env: isolatedEnv(), maxBuffer: 1 << 26 });
  const verdict = { passed: r.status === 0, tool: root, summary: String(r.stdout + r.stderr).split('\n').filter((l) => /FAIL|RESULT/.test(l)).slice(0, 12).join('\n') };
  invariantCache.set(key, verdict);
  return verdict;
}

/* What makes a comparison meaningless, decided before any result is walked. */
function refusalsFor(reference, candidate) {
  const refusals = [];
  const rm = reference.meta || {};
  const cm = candidate.meta || {};
  if (rm.formatVersion !== cm.formatVersion) refusals.push('the captures are different formats (' + rm.formatVersion + ' and ' + cm.formatVersion + ')');
  if (rm.complete !== true) refusals.push('the reference capture does not declare itself complete');
  if (cm.complete !== true) refusals.push('the candidate capture does not declare itself complete');
  if (!rm.corpusInputHash || rm.corpusInputHash !== cm.corpusInputHash) {
    const differing = rm.inputHashes && cm.inputHashes
      ? Object.keys(rm.inputHashes).filter((n) => rm.inputHashes[n] !== cm.inputHashes[n]).slice(0, 5)
      : [];
    refusals.push('the two sides captured different corpus inputs, so their outputs are not comparable' + (differing.length ? ' (for example ' + differing.join(', ') + ')' : ''));
  }
  return refusals;
}

/* Compare two capture files already on disk. */
function compareCaptures(referenceFile, candidateFile, options) {
  const opts = options || {};
  const composition = opts.composition || 'control';
  const reference = JSON.parse(fs.readFileSync(referenceFile, 'utf8'));
  const candidate = JSON.parse(fs.readFileSync(candidateFile, 'utf8'));
  const invariants = { reference: invariantOf(referenceFile, composition, opts.referenceTree), candidate: invariantOf(candidateFile, composition, opts.candidateTree) };
  const refusals = [];
  if (!invariants.reference.passed) refusals.push('the reference capture fails the independent corpus invariant:\n' + invariants.reference.summary);
  if (!invariants.candidate.passed) refusals.push('the candidate capture fails the independent corpus invariant:\n' + invariants.candidate.summary);
  refusals.push(...refusalsFor(reference, candidate));
  const result = {
    composition,
    implementations: { reference: identityOf(opts.referenceTree, reference), candidate: identityOf(opts.candidateTree, candidate) },
    invariants: { reference: invariants.reference.passed, candidate: invariants.candidate.passed, referenceTool: invariants.reference.tool, candidateTool: invariants.candidate.tool },
    refusals,
  };
  result.implementations.sameSource = result.implementations.reference.sourceDigest === result.implementations.candidate.sourceDigest;
  if (refusals.length) {
    return Object.assign(result, { verdict: 'REFUSED', differences: [], report: reportOf([]), coverage: null });
  }
  const { differences, leavesCompared } = compareSnapshots(reference, candidate);
  return Object.assign(result, {
    verdict: differences.some((d) => d.kind === 'UNKNOWN') ? 'UNKNOWN' : differences.length ? 'DIFFERENT' : 'EMPTY',
    differences,
    report: reportOf(differences),
    coverage: coverageOf(reference, candidate, composition, leavesCompared),
  });
}

/* Question 10 (A), decided by the owner on 2026-09-16: a comparison is judged against a prediction written before it ran.
   A prediction is { formatVersion: 1, differences: [ { kind, scenario, path, reference?, candidate? } ] }, each
   entry as compareSnapshots() reports it. The comparison is as predicted only when every difference found is
   declared with the same kind, scenario, path and values, and every declared difference is found. A category, a
   pattern or a count approves nothing, and UNKNOWN is never approvable. Used by --expect and by control test 4.7
   with tools/control-candidate-prediction.json. */
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const sameField = (declared, found, field) => own(declared, field) === own(found, field) && JSON.stringify(declared[field]) === JSON.stringify(found[field]);
function matchPrediction(differences, prediction) {
  const problems = [];
  if (!prediction || prediction.formatVersion !== 1 || !Array.isArray(prediction.differences)) {
    return { ok: false, problems: ['the prediction is not a format-1 prediction with a differences list'], unpredicted: [], unmatched: [], declared: 0, found: differences.length };
  }
  const key = (d) => JSON.stringify([d.kind, d.scenario, d.path]);
  const declared = new Map();
  prediction.differences.forEach((d, i) => {
    if (!d || !KINDS.includes(d.kind) || typeof d.scenario !== 'string' || typeof d.path !== 'string') { problems.push('declared difference ' + i + ' is malformed'); return; }
    if (d.kind === 'UNKNOWN') { problems.push('declared difference ' + i + ' is UNKNOWN, which is never approvable'); return; }
    if (declared.has(key(d))) { problems.push('declared difference ' + i + ' repeats ' + key(d)); return; }
    declared.set(key(d), d);
  });
  const matched = new Set();
  const unpredicted = [];
  differences.forEach((d) => {
    const want = declared.get(key(d));
    if (want && sameField(want, d, 'reference') && sameField(want, d, 'candidate')) matched.add(key(d));
    else unpredicted.push(want ? Object.assign({ declared: want }, d) : d);
  });
  const unmatched = [...declared.entries()].filter(([k]) => !matched.has(k)).map(([, d]) => d);
  return { ok: !problems.length && !unpredicted.length && !unmatched.length, problems, unpredicted, unmatched, declared: declared.size, found: differences.length };
}

/* A run's result judged against a prediction; a REFUSED or UNKNOWN comparison is never as predicted. */
function judgePrediction(result, prediction, file) {
  const judged = result.verdict === 'EMPTY' || result.verdict === 'DIFFERENT'
    ? matchPrediction(result.differences || [], prediction)
    : { ok: false, problems: ['the comparison is ' + result.verdict + ', so it cannot be as predicted'], unpredicted: [], unmatched: [], declared: 0, found: 0 };
  return Object.assign({ file: file || null }, judged);
}

function predictionExit(result) {
  if (result.prediction.ok) return 0;
  return VERDICT_EXIT[result.verdict] === 2 ? 2 : 1;
}

/* The whole run: separate trees, separate processes, then the comparison. */
function run(options) {
  const { reference, candidate } = options;
  if (!reference || !candidate) throw new Error('run needs a reference tree and a candidate tree');
  if (fs.realpathSync(reference) === fs.realpathSync(candidate) && !options.allowSameTree) {
    return { verdict: 'REFUSED', refusals: ['the reference and candidate are the same directory: both sides would load the same files, which is the shortcut 7.7 forbids. Stage or check out a second tree.'], differences: [] };
  }
  const outDir = options.outDir || fs.mkdtempSync(path.join(os.tmpdir(), 'differential-'));
  const opts = { composition: options.composition || 'control', measured: !!options.measured, outDir };
  const ref = captureTree('reference', reference, opts);
  const cand = captureTree('candidate', candidate, opts);
  return compareCaptures(ref.file, cand.file, { composition: opts.composition, referenceTree: reference, candidateTree: candidate });
}

/* Copy a capture's complete input graph -- every file capture-baseline declares
   for either composition -- and what its own invariant needs into a new
   directory: a separately resolved tree without a checkout. It records no
   commit, so it is never a --measured tree. */
function stage(target, from) {
  /* Resolved: a relative tree would reach require() as a bare module name. */
  const source = path.resolve(from || HARNESS_ROOT);
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const cb = require(path.join(source, 'tools', 'capture-baseline.js'));
  const files = [...new Set(cb.captureInputs().concat(cb.captureInputs({ composition: 'expanded' }))
    .concat(INVARIANT_INPUTS.filter((f) => fs.existsSync(path.join(source, f)))))].sort();
  files.forEach((f) => {
    const to = path.join(target, f);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(source, f), to);
  });
  return files;
}

function format(result) {
  const lines = [];
  lines.push('DIFFERENTIAL: ' + result.verdict + (result.composition ? ' (' + result.composition + ' composition)' : ''));
  if (result.implementations) {
    ['reference', 'candidate'].forEach((side) => {
      const i = result.implementations[side];
      lines.push('  ' + side.padEnd(10) + ' commit ' + (i.commit || '(none)').slice(0, 12) + '  qualified ' + i.qualified + '  source ' + String(i.sourceDigest).slice(0, 12) + '  output ' + String(i.outputHash).slice(0, 12) + '  ' + (i.tree || ''));
    });
    lines.push('  same source: ' + result.implementations.sameSource + '   invariants: reference ' + (result.invariants.reference ? 'PASS' : 'FAIL') + ', candidate ' + (result.invariants.candidate ? 'PASS' : 'FAIL'));
  }
  (result.refusals || []).forEach((r) => lines.push('  REFUSED: ' + r));
  if (result.differences && result.differences.length) {
    lines.push('  by kind: ' + JSON.stringify(result.report.byKind));
    Object.entries(result.report.byField).sort((x, y) => y[1].count - x[1].count).slice(0, 15)
      .forEach(([f, e]) => lines.push('  field    ' + (f || '(scenario)').padEnd(40) + ' ' + e.count + ' difference(s) in ' + e.scenarios.length + ' scenario(s)'));
    Object.entries(result.report.byScenario).sort((x, y) => y[1].count - x[1].count).slice(0, 15)
      .forEach(([s, e]) => lines.push('  scenario ' + s.padEnd(40) + ' ' + e.count + ' ' + JSON.stringify(e.kinds)));
    result.report.decisionFlips.slice(0, 10).forEach((d) => lines.push('  DECISION ' + d.scenario + ' ' + d.path + ': ' + JSON.stringify(d.reference) + ' -> ' + JSON.stringify(d.candidate)));
  }
  if (result.coverage) {
    const c = result.coverage;
    lines.push('  coverage: scenarios ' + c.scenarios.compared + '/' + c.scenarios.of + '; modes ' + Object.entries(c.modes).map(([m, v]) => m + ' ' + v.compared + '/' + v.of).join(', ') +
      '; routes ' + c.routes.compared + '/' + c.routes.of + ' (' + c.routes.thisRun + '); leaves ' + c.leaves.compared + '/' + c.leaves.of + '; distinct fields ' + c.fields.distinctInReference);
    lines.push('  statuses: ' + Object.entries(c.statuses).map(([f, v]) => f + ' ' + v.compared + '/' + v.presentInReference).join(', '));
  }
  if (result.prediction) {
    const p = result.prediction;
    lines.push((p.ok ? 'AS PREDICTED' : 'NOT AS PREDICTED') + ' (' + (p.file || 'prediction') + '): declared ' + p.declared + ', found ' + p.found + ', undeclared ' + p.unpredicted.length + ', declared and not found ' + p.unmatched.length);
    p.problems.forEach((x) => lines.push('  PREDICTION: ' + x));
    p.unpredicted.slice(0, 10).forEach((d) => lines.push('  UNDECLARED ' + d.kind + ' ' + d.scenario + ' ' + d.path + ': ' + JSON.stringify(d.reference) + ' -> ' + JSON.stringify(d.candidate) + (d.declared ? ' (declared ' + JSON.stringify(d.declared.reference) + ' -> ' + JSON.stringify(d.declared.candidate) + ')' : '')));
    p.unmatched.slice(0, 10).forEach((d) => lines.push('  NOT FOUND  ' + d.kind + ' ' + d.scenario + ' ' + d.path));
  }
  return lines.join('\n');
}

function main(argv) {
  const cmd = argv[0];
  const opt = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };
  if (cmd === 'compare') {
    const result = run({
      reference: opt('--reference'), candidate: opt('--candidate'), composition: opt('--composition') || 'control',
      measured: argv.includes('--measured'), outDir: opt('--out') || undefined,
    });
    if (opt('--expect')) result.prediction = judgePrediction(result, JSON.parse(fs.readFileSync(opt('--expect'), 'utf8')), path.resolve(opt('--expect')));
    console.log(format(result));
    if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(result, null, 2));
    return result.prediction ? predictionExit(result) : VERDICT_EXIT[result.verdict];
  }
  if (cmd === 'stage') {
    const target = argv[1];
    if (!target) throw new Error('usage: node tools/differential-harness.js stage <dir> [--from <tree>]');
    const files = stage(path.resolve(target), opt('--from') ? path.resolve(opt('--from')) : undefined);
    console.log('staged ' + files.length + ' capture input files into ' + target);
    return 0;
  }
  console.log('usage:\n  node tools/differential-harness.js compare --reference <tree> --candidate <tree> [--composition control|expanded] [--measured] [--out <dir>] [--json <file>] [--expect <prediction.json>]\n  node tools/differential-harness.js stage <dir> [--from <tree>]');
  return cmd ? 2 : 0;
}

module.exports = {
  KINDS, STATUS_FIELDS, DECISION_FIELDS, VERDICT_EXIT,
  INVARIANT_INPUTS, compareValues, compareSnapshots, reportOf, coverageOf, identityOf, refusalsFor,
  matchPrediction, judgePrediction, predictionExit,
  captureTree, compareCaptures, run, stage, format,
};

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
