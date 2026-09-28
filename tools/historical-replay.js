'use strict';

/*
 * The historical replay: control test 4.7's ROUND-TRIP, held to the engine that CAPTURED the control.
 *
 * WHY. Question 10 of 2026-09-14, answered (A) by the owner on 2026-09-16. tests/control-corpus.test.js ran
 * tools/corpus-invariant.js on the stored control capture, and its ROUND-TRIP re-ran TODAY's engine on the control's
 * inputs and required the stored results exactly. That asked two questions at once -- is the stored capture what its
 * own engine produced, and is today's engine unchanged -- so an approved, predicted output change failed the gate in
 * the same way damage would. The two questions are now separate checks, each reported on its own:
 *   - HISTORICAL INTEGRITY, this file: the stored entries equal what the capturing engine computes, replayed from that
 *     engine's own verified inputs in a process of its own.
 *   - CANDIDATE MOVEMENT, tools/differential-harness.js matchPrediction() with tools/control-candidate-prediction.json:
 *     today's engine differs from the control exactly as declared, path by path and value by value, and nowhere else.
 * A passing replay approves no candidate output, and a candidate prediction says nothing about the stored capture.
 *
 * WHAT IS REPLAYED. A capture's meta names its commit (gitCommit) and records, when it was taken, the sha256 of every
 * declared input as committed (meta.inputGraph.files: the engine, the bundled debt modules, the rules inside
 * src/app-shell.html, the flag contract, build.js, the validator, the golden definitions, the generator, the capture
 * tool and package-lock.json) and the Node version that ran (meta.inputGraph.runtime.node). Every declared input is
 * read from the historical source and verified against its recorded hash before anything runs: one mismatch is
 * PROVENANCE_MISMATCH, and nothing runs. The verified files are written to a temporary directory. A child process,
 * with no NODE_OPTIONS, NODE_PATH or test-runner context, builds the golden and seeded plans with the HISTORICAL
 * libraries and runs the HISTORICAL engine on them; imports resolve inside that directory. The child returns the
 * modules it loaded, and a module from anywhere but the verified inputs (and this runner) is PROVENANCE_MISMATCH. Each
 * plan is fingerprinted here against the reviewed spec, so the replay ran the control's own inputs. Results cross the
 * process boundary by v8 serialization, which keeps NaN, -0 and undefined, and share no code with the capture tool's
 * encoding. The targeted scenarios are built only inside the capture tool, so they are not replayed: SKIPPED by name,
 * exactly as ROUND-TRIP reports them.
 *
 * WHERE THE HISTORICAL SOURCE COMES FROM, in this order:
 *   1. a reference tree the caller names (options.referenceTree, --reference-tree, or CORPUS_REFERENCE_TREE); when one
 *      is named, nothing else is tried;
 *   2. this repository's git objects (the S5 control's commit is kept reachable by the local tag
 *      s5-u4-successor-control; a fresh clone carries it only if that tag was fetched);
 *   3. reference-trees/<full commit>/ at the repository root, written by `materialize` for a source archive, which has
 *      no git objects.
 * A reference tree is verified file by file against the same recorded hashes, so a tree holding anything but the
 * capturing commit's inputs cannot replay. With no source available the result is BLOCKED. There is no fallback to
 * today's engine, and BLOCKED, UNQUALIFIED, PROVENANCE_MISMATCH and FAILED are never a pass.
 *
 * THE EXECUTION ENVIRONMENT. A replay runs only on the capture's recorded Node version, on Windows: the qualified
 * envelope is Windows 11 with Node 24.17.0. Anything else is UNQUALIFIED, and nothing runs. The child's own runtime is
 * checked again after it ran. Exact agreement across machines or Node versions is not established by this file, and
 * no tolerance or rounding is applied anywhere to make a replay pass.
 *
 *   node tools/historical-replay.js check <capture.json> [--spec <spec.json>] [--reference-tree <dir>]
 *   node tools/historical-replay.js materialize <capture.json> <dir>
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const v8 = require('node:v8');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const QUALIFIED_PLATFORM = 'win32';
const STATUSES = ['REPLAYED', 'BLOCKED', 'PROVENANCE_MISMATCH', 'UNQUALIFIED', 'FAILED'];
/* What the child reads to build and run the plans; a capture whose graph lacks one cannot be replayed. */
const NEEDED = ['build.js', 'src/app-shell.html', 'src/engine.js', 'tests/lib/golden-scenario-defs.js', 'tests/lib/scenario-generator.js'];
const REPLAYED_SOURCES = ['golden', 'seed'];
const RULES_PATTERN = /<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/;

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const firstLine = (s) => String(s).split('\n')[0];

function isolatedEnv() {
  const env = Object.assign({}, process.env);
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  delete env.NODE_TEST_CONTEXT;
  return env;
}

/* What the capture itself recorded about the engine that produced it. */
function recordedReference(snapshot) {
  const meta = snapshot && snapshot.meta;
  const graph = meta && meta.inputGraph;
  const problems = [];
  if (!meta || typeof meta.gitCommit !== 'string' || !/^[0-9a-f]{40}$/.test(meta.gitCommit)) problems.push('the capture records no full commit id (meta.gitCommit)');
  if (!graph || !graph.files || typeof graph.files !== 'object' || !Object.keys(graph.files).length) {
    problems.push('the capture records no input graph (meta.inputGraph.files)');
  } else {
    Object.entries(graph.files).forEach(([file, hash]) => {
      if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) problems.push(file + ': the capture records no sha256 for it');
      if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) problems.push(file + ': not a path inside a tree');
    });
    NEEDED.filter((f) => !own(graph.files, f)).forEach((f) => problems.push('the input graph does not declare ' + f + ', which a replay needs'));
  }
  if (!graph || !graph.runtime || typeof graph.runtime.node !== 'string') problems.push('the capture records no Node version (meta.inputGraph.runtime.node)');
  if (!meta || !meta.boundary || meta.boundary.qualified !== true) problems.push('the capture does not declare itself qualified at its commit (meta.boundary.qualified)');
  return { commit: meta ? meta.gitCommit : undefined, files: graph ? graph.files : undefined, runtime: graph ? graph.runtime : undefined, problems };
}

function gitSource(repo, commit) {
  const probe = spawnSync('git', ['-C', repo, 'cat-file', '-e', commit + '^{commit}'], { env: isolatedEnv(), encoding: 'utf8' });
  if (probe.error) return { unavailable: 'git could not be run (' + (probe.error.code || probe.error.message) + ')' };
  if (probe.status !== 0) return { unavailable: 'commit ' + commit + ' is not among the git objects at ' + repo };
  return {
    label: 'git objects, commit ' + commit,
    read: (rel) => {
      const r = spawnSync('git', ['-C', repo, 'cat-file', 'blob', commit + ':' + rel], { env: isolatedEnv(), maxBuffer: 1 << 28 });
      return r.status === 0 ? r.stdout : null;
    },
  };
}

function treeSource(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { unavailable: 'no reference tree at ' + dir };
  const real = fs.realpathSync(dir);
  return {
    label: 'reference tree ' + real,
    read: (rel) => {
      const file = path.join(real, rel);
      return fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file) : null;
    },
  };
}

/* The first available source, in the documented order. */
function sourceFor(recorded, options) {
  const repo = options.repo || ROOT;
  const named = options.referenceTree !== undefined ? options.referenceTree : process.env.CORPUS_REFERENCE_TREE;
  if (named) {
    const s = treeSource(path.resolve(named));
    return s.unavailable ? { unavailable: [s.unavailable] } : s;
  }
  const tried = [];
  if (options.git !== false) {
    const s = gitSource(repo, recorded.commit);
    if (!s.unavailable) return s;
    tried.push(s.unavailable);
  }
  const s = treeSource(path.join(repo, 'reference-trees', recorded.commit));
  if (!s.unavailable) return s;
  tried.push(s.unavailable);
  return { unavailable: tried };
}

/* Every declared input, read and verified; a mismatch or an absence is reported and nothing is kept. */
function verifiedInputs(recorded, source) {
  const contents = new Map();
  const problems = [];
  Object.keys(recorded.files).sort().forEach((rel) => {
    const buf = source.read(rel);
    if (buf === null) { problems.push(rel + ': absent from ' + source.label); return; }
    const actual = sha256(buf);
    if (actual !== recorded.files[rel]) {
      problems.push(rel + ': sha256 ' + actual.slice(0, 16) + '..., where the capture recorded ' + recorded.files[rel].slice(0, 16) + '...');
      return;
    }
    contents.set(rel, buf);
  });
  return { contents, problems };
}

function result(status, base, fields) {
  return Object.assign({ status, raw: null, problems: [] }, base, fields);
}

/**
 * options:
 *   spec           the reviewed corpus (default tools/corpus-spec.json)
 *   repo           where git objects and reference-trees/ are looked for (default this repository)
 *   referenceTree  a directory holding the capturing commit's declared inputs; when named, the only source tried
 *   git            false to skip git objects (a source archive)
 *   runtime        { node, platform } to judge instead of this process's own
 */
function replay(snapshot, options = {}) {
  const spec = options.spec || JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'corpus-spec.json'), 'utf8'));
  const recorded = recordedReference(snapshot);
  const base = { commit: recorded.commit || null, source: null, verified: [], runtime: null, loaded: [], replayed: [], skipped: [] };
  if (recorded.problems.length) return result('BLOCKED', base, { problems: recorded.problems.map((p) => 'no replay is possible: ' + p) });

  const runtime = options.runtime || { node: process.version, platform: process.platform };
  if (runtime.node !== recorded.runtime.node || runtime.platform !== QUALIFIED_PLATFORM) {
    return result('UNQUALIFIED', base, {
      runtime,
      problems: ['this runtime, Node ' + runtime.node + ' on ' + runtime.platform + ', is not the qualified one (Node ' + recorded.runtime.node + ' on ' +
        QUALIFIED_PLATFORM + '), so nothing was replayed: an exact replay anywhere else is not established'],
    });
  }

  const source = sourceFor(recorded, options);
  if (source.unavailable) {
    return result('BLOCKED', base, {
      problems: ['the capturing engine is not available, so nothing was replayed, and nothing was compared with today\'s engine in its place: ' +
        source.unavailable.join('; ') + '. A reference tree can be written with `node tools/historical-replay.js materialize` in a repository that holds the commit.'],
    });
  }
  base.source = source.label;

  const { contents, problems: mismatched } = verifiedInputs(recorded, source);
  if (mismatched.length) return result('PROVENANCE_MISMATCH', base, { problems: mismatched.map((m) => 'not the capturing engine\'s input: ' + m) });
  base.verified = [...contents.keys()];

  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'historical-replay-')));
  try {
    for (const [rel, buf] of contents) {
      const to = path.join(dir, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, buf);
    }
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-replay-io-'));
    let out;
    try {
      const specFile = path.join(work, 'spec.json');
      const outFile = path.join(work, 'out.bin');
      fs.writeFileSync(specFile, JSON.stringify(spec));
      const r = spawnSync(process.execPath, [__filename, 'child', dir, specFile, outFile], { cwd: dir, env: isolatedEnv(), encoding: 'utf8', maxBuffer: 1 << 26 });
      if (r.status !== 0 || !fs.existsSync(outFile)) {
        return result('FAILED', base, { problems: ['the historical engine did not complete (exit ' + r.status + '): ' + String((r.stdout || '') + (r.stderr || '')).slice(-1500)] });
      }
      out = v8.deserialize(fs.readFileSync(outFile));
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }

    base.runtime = out.runtime;
    if (out.runtime.node !== recorded.runtime.node || out.runtime.platform !== QUALIFIED_PLATFORM) {
      return result('UNQUALIFIED', base, { problems: ['the replay ran on Node ' + out.runtime.node + ' on ' + out.runtime.platform + ', not the qualified Node ' + recorded.runtime.node + ' on ' + QUALIFIED_PLATFORM] });
    }
    const allowed = new Set([fs.realpathSync(__filename)].concat(base.verified.map((rel) => path.join(dir, rel))).map((f) => path.resolve(f).toLowerCase()));
    base.loaded = out.loaded.map((f) => (path.resolve(f).toLowerCase().startsWith(dir.toLowerCase() + path.sep) ? path.relative(dir, f).split(path.sep).join('/') : f)).sort();
    const outside = out.loaded.filter((f) => !allowed.has(path.resolve(f).toLowerCase()));
    if (outside.length) return result('PROVENANCE_MISMATCH', base, { problems: ['the replay loaded a module that is not a verified historical input: ' + outside.join(', ')] });

    // eslint-disable-next-line global-require
    const invariant = require(path.join(ROOT, 'tools', 'corpus-invariant.js'));
    const raw = new Map();
    const failed = [];
    const provenance = [];
    spec.scenarios.forEach((s) => {
      if (!REPLAYED_SOURCES.includes(s.source)) { base.skipped.push(s.name + ': ' + (s.inputsNote || 'built only inside the capture tool, so not replayed')); return; }
      if (own(out.errors, s.name)) { failed.push(s.name + ': ' + firstLine(out.errors[s.name])); return; }
      if (!own(s, 'inputFingerprint')) { provenance.push(s.name + ': the spec carries no reviewed input fingerprint, so the replay cannot show it ran the control\'s inputs'); return; }
      const fingerprint = invariant.fingerprint(out.plans[s.name]);
      if (fingerprint !== s.inputFingerprint) {
        provenance.push(s.name + ': the historical libraries build a plan fingerprinting to ' + fingerprint.slice(0, 16) + '..., not the reviewed ' + String(s.inputFingerprint).slice(0, 16) + '...');
        return;
      }
      raw.set(s.name, out.results[s.name]);
      base.replayed.push(s.name);
    });
    if (failed.length) return result('FAILED', base, { problems: failed.map((f) => 'the historical engine could not run ' + f) });
    if (provenance.length) return result('PROVENANCE_MISMATCH', base, { problems: provenance });
    return result('REPLAYED', base, { raw });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* The child: only the verified historical files and Node built-ins are loaded. */
function child(dir, specFile, outFile) {
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  const shell = fs.readFileSync(path.join(dir, 'src', 'app-shell.html'), 'utf8');
  const rules = shell.match(RULES_PATTERN);
  if (!rules) throw new Error('the historical src/app-shell.html carries no rules JSON');
  global.RULES = JSON.parse(rules[1]);
  /* eslint-disable global-require, import/no-dynamic-require */
  const { BUNDLED_MODULES } = require(path.join(dir, 'build.js'));
  BUNDLED_MODULES.forEach(({ file, namespace }) => { global[namespace] = require(path.join(dir, 'src', file)); });
  const engine = require(path.join(dir, 'src', 'engine.js'));
  const golden = require(path.join(dir, 'tests', 'lib', 'golden-scenario-defs.js'));
  const { generateScenario } = require(path.join(dir, 'tests', 'lib', 'scenario-generator.js'));
  /* eslint-enable global-require, import/no-dynamic-require */
  const defaultPlan = golden.extractDefaultPlan(shell);
  const out = {
    runtime: { node: process.version, platform: process.platform, arch: process.arch, v8: process.versions.v8 },
    plans: {}, results: {}, errors: {}, loaded: [],
  };
  spec.scenarios.forEach((s) => {
    if (!REPLAYED_SOURCES.includes(s.source)) return;
    try {
      let plan;
      if (s.source === 'golden') {
        const def = golden.GOLDEN_SCENARIOS.find(([n]) => 'golden:' + n === s.name);
        if (!def) throw new Error('the historical golden definitions define no ' + s.name);
        plan = golden.buildScenario(defaultPlan, def[1] || {});
      } else {
        plan = generateScenario(defaultPlan, s.seed);
      }
      out.plans[s.name] = structuredClone(plan);
      out.results[s.name] = engine.runPlan(structuredClone(plan));
    } catch (e) {
      out.errors[s.name] = String((e && e.stack) || e);
    }
  });
  out.loaded = Object.keys(require.cache);
  fs.writeFileSync(outFile, v8.serialize(out));
}

/* A reference tree for a source archive: the capturing commit's declared inputs, verified, written to <dir>. */
function materialize(snapshot, target, options = {}) {
  const recorded = recordedReference(snapshot);
  if (recorded.problems.length) return { ok: false, problems: recorded.problems };
  const source = sourceFor(recorded, Object.assign({}, options, { referenceTree: options.referenceTree || '' }));
  if (source.unavailable) return { ok: false, problems: source.unavailable };
  const { contents, problems } = verifiedInputs(recorded, source);
  if (problems.length) return { ok: false, problems };
  if (fs.existsSync(target) && fs.readdirSync(target).length) return { ok: false, problems: [target + ' exists and is not empty'] };
  for (const [rel, buf] of contents) {
    const to = path.join(target, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, buf);
  }
  return { ok: true, commit: recorded.commit, source: source.label, files: [...contents.keys()] };
}

/* Historical integrity for one capture: the replay, then the invariant with the replay's raw results. */
function check(file, options = {}) {
  // eslint-disable-next-line global-require
  const invariant = require(path.join(ROOT, 'tools', 'corpus-invariant.js'));
  const snapshot = invariant.readSnapshot(file);
  const spec = invariant.readSpec(options.specPath);
  const replayed = replay(snapshot, Object.assign({}, options, { spec }));
  if (replayed.status !== 'REPLAYED') return { replay: replayed, invariant: null, ok: false };
  const verdict = invariant.run(snapshot, { spec, raw: replayed.raw });
  return { replay: replayed, invariant: verdict, ok: verdict.ok };
}

function report(checked, label) {
  const r = checked.replay;
  const lines = ['HISTORICAL REPLAY -- ' + label, '  status    ' + r.status, '  commit    ' + (r.commit || '(none)'), '  source    ' + (r.source || '(none)'),
    '  verified  ' + r.verified.length + ' declared input(s)', '  runtime   ' + (r.runtime ? JSON.stringify(r.runtime) : '(not run)'),
    '  replayed  ' + r.replayed.length + ' scenario(s); not replayed ' + r.skipped.length];
  r.problems.slice(0, 20).forEach((p) => lines.push('    ' + p));
  if (checked.invariant) {
    // eslint-disable-next-line global-require
    const invariant = require(path.join(ROOT, 'tools', 'corpus-invariant.js'));
    lines.push(invariant.report(checked.invariant, label + ', ROUND-TRIP against the capturing engine'));
  }
  lines.push(checked.ok
    ? 'RESULT: PASS -- historical integrity only. Today\'s engine is judged separately, against tools/control-candidate-prediction.json.'
    : 'RESULT: FAIL -- ' + (checked.invariant ? 'the stored capture is not what its capturing engine computes' : 'no historical replay (' + r.status + '), which is never a pass'));
  return lines.join('\n');
}

function main(argv) {
  const cmd = argv[0];
  const opt = (name) => { const i = argv.indexOf(name); return i === -1 ? undefined : argv[i + 1]; };
  if (cmd === 'child') {
    child(argv[1], argv[2], argv[3]);
    return 0;
  }
  if (cmd === 'check' && argv[1]) {
    const specPath = opt('--spec') ? path.resolve(opt('--spec')) : undefined;
    const checked = check(path.resolve(argv[1]), { specPath, referenceTree: opt('--reference-tree') });
    console.log(report(checked, argv[1]));
    return checked.ok ? 0 : 1;
  }
  if (cmd === 'materialize' && argv[1] && argv[2]) {
    // eslint-disable-next-line global-require
    const snapshot = require(path.join(ROOT, 'tools', 'corpus-invariant.js')).readSnapshot(path.resolve(argv[1]));
    const m = materialize(snapshot, path.resolve(argv[2]));
    console.log(m.ok ? 'materialized ' + m.files.length + ' verified input(s) of ' + m.commit + ' from ' + m.source + ' into ' + argv[2] : 'REFUSED: ' + m.problems.join('; '));
    return m.ok ? 0 : 1;
  }
  console.log('usage:\n  node tools/historical-replay.js check <capture.json> [--spec <spec.json>] [--reference-tree <dir>]\n  node tools/historical-replay.js materialize <capture.json> <dir>');
  return 2;
}

module.exports = { QUALIFIED_PLATFORM, STATUSES, NEEDED, recordedReference, replay, materialize, check, report, main };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
