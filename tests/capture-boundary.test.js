'use strict';

/*
 * S4 task 5.4 (S4-PA-10) -- an immutable execution boundary for every measured
 * capture.
 *
 * Several sessions edit this tree at once. Task 5.1 measured what that does:
 * after-CL-closure was taken from a working tree holding the next commit's
 * uncommitted changes, recorded the previous commit as its provenance, and
 * passed every check the capture tool had. A clean check of src/, tests/ and
 * tools/ alone would still miss the builder, the lockfile, the runtime and the
 * corpus generator.
 *
 * So a capture records its COMPLETE INPUT GRAPH (meta.inputGraph), and whether
 * every input is the committed bytes of the commit it names (meta.boundary).
 * The declared inputs are held to what a fresh process actually loads, so the
 * declaration cannot drift from the code. An unqualified capture is explicitly
 * disqualified; with --measured it is refused and nothing is written.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const cb = require('../tools/capture-baseline.js');

const OWN_CHECKOUT = cb.gitCommit() !== null;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const committedReader = (commit) => (f) => execFileSync('git', ['cat-file', 'blob', commit + ':' + f], { cwd: ROOT, maxBuffer: 1 << 28 });

test('5.4: the declared inputs are exactly what a fresh capture process loads, per composition', () => {
  const probe = path.join(os.tmpdir(), 'capture-boundary-module-walk.js');
  fs.writeFileSync(probe, [
    "'use strict';",
    "const path = require('node:path');",
    'const ROOT = path.resolve(process.argv[2]);',
    "const cbPath = require.resolve(path.join(ROOT, 'tools', 'capture-baseline.js'));",
    'const cb = require(cbPath);',
    "cb.capture(process.argv[3] === 'control' ? undefined : { composition: process.argv[3] });",
    'const seen = new Set();',
    'const walk = (m) => { if (!m || seen.has(m.filename)) return; seen.add(m.filename); (m.children || []).forEach(walk); };',
    'walk(require.cache[cbPath]);',
    "const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');",
    /* A file on ANOTHER DRIVE has no relative path: path.relative() returns it absolute, which does not start with
       '..'. GitHub's Windows runner keeps the checkout on D: and TEMP on C:, so this probe (written to TEMP) was
       counted as a repository module (the first CI run, 2026-09-23). Outside the root is outside, on any drive. */
    "const inRepo = (f) => !f.startsWith('..') && !path.isAbsolute(f) && !f.startsWith('node_modules/');",
    'const walked = [...seen].map(rel).filter(inRepo).sort();',
    'const loaded = Object.keys(require.cache).map(rel).filter(inRepo).sort();',
    'process.stdout.write(JSON.stringify({ walked, loaded }));',
  ].join('\n'));
  try {
    for (const composition of cb.COMPOSITIONS) {
      const out = JSON.parse(execFileSync(process.execPath, [probe, ROOT, composition], { encoding: 'utf8', maxBuffer: 1 << 26 }));
      assert.deepEqual(out.loaded, out.walked, 'CONTROL: the walk from the capture tool reaches every repository module the process loaded');
      const declared = cb.captureInputs(composition === 'control' ? undefined : { composition });
      const declaredModules = declared.filter((f) => !cb.DATA_INPUTS.includes(f));
      assert.deepEqual(declaredModules, out.walked, composition + ': the declared module inputs must be exactly the modules a capture loads');
      cb.DATA_INPUTS.forEach((f) => {
        assert.ok(declared.includes(f), composition + ': declares ' + f);
        assert.ok(fs.existsSync(path.join(ROOT, f)), f + ' exists');
      });
    }
  } finally {
    fs.rmSync(probe, { force: true });
  }
});

/* S5 2l: the engine boundary will read src/boolean-flag-contract.json as DATA
   (with fs, not require), so the flag list stays one definition without
   becoming a module input. A data input is invisible to the module walk above,
   so it has to be declared, or a capture that reads it records an incomplete
   input graph, and the differential harness, which stages only the declared
   inputs, runs an engine that cannot find it. */
test('5.4 (S5 2l): the boolean-flag contract is a declared data input in both compositions', () => {
  const CONTRACT = 'src/boolean-flag-contract.json';
  assert.ok(fs.existsSync(path.join(ROOT, CONTRACT)), 'CONTROL: ' + CONTRACT + ' exists');
  for (const composition of cb.COMPOSITIONS) {
    const declared = cb.captureInputs(composition === 'control' ? undefined : { composition });
    assert.ok(declared.includes(CONTRACT), composition + ': ' + CONTRACT + ' is not a declared capture input');
  }
  assert.ok(cb.DATA_INPUTS.includes(CONTRACT), CONTRACT + ' must be declared as data, not as a module');
});

test('5.4: a capture records its input graph -- every declared file, the runtime, Monte Carlo seeds and runs, the artifact beside it', () => {
  const snap = cb.capture();
  const g = snap.meta.inputGraph;
  const declared = cb.captureInputs();
  assert.deepEqual(Object.keys(g.files).sort(), declared, 'one hash per declared input, and no other');
  declared.forEach((f) => assert.equal(g.files[f], sha(fs.readFileSync(path.join(ROOT, f))), f + ' is hashed as its bytes'));
  assert.ok(declared.includes('package-lock.json'), 'the dependency lockfile is an input');
  Object.keys(snap.meta.sourceHashes).forEach((f) => assert.equal(g.files[f], snap.meta.sourceHashes[f], 'sourceHashes and the graph agree on ' + f));
  assert.equal(g.runtime.node, process.version);
  const jsdomPkg = path.join(ROOT, 'node_modules', 'jsdom', 'package.json');
  assert.equal(g.runtime.jsdom, fs.existsSync(jsdomPkg) ? JSON.parse(fs.readFileSync(jsdomPkg, 'utf8')).version : null);
  const mc = cb.corpus().filter(({ plan }) => plan.assumptions.method === 'monteCarlo');
  assert.ok(mc.length > 0, 'CONTROL: the corpus has Monte Carlo scenarios to record');
  assert.deepEqual(g.monteCarlo, mc.map(({ name, plan }) => ({ name, seed: plan.assumptions.seed, runs: plan.assumptions.runs })));
  assert.equal(g.artifact.loaded, false);
  assert.equal(g.artifact.sha256, sha(fs.readFileSync(path.join(ROOT, g.artifact.file))));
  assert.deepEqual(Object.keys(snap.meta.boundary).sort(), ['changedDuringCapture', 'commit', 'mismatched', 'qualified', 'reason', 'untracked']);
});

test('5.4: the boundary holds every input to the committed bytes of the recorded commit, and names each one that is not', () => {
  const inputs = cb.captureInputs();
  if (!OWN_CHECKOUT) {
    const b = cb.boundaryOf(inputs);
    assert.equal(b.commit, null);
    assert.equal(b.qualified, false, 'no checkout, no commit, no qualification');
    return;
  }
  const commit = cb.gitCommit();
  const committed = committedReader(commit);
  const clean = cb.boundaryOf(inputs, { read: committed });
  assert.deepEqual([clean.qualified, clean.mismatched, clean.untracked], [true, [], []], 'CONTROL: the committed bytes themselves qualify');
  assert.equal(clean.commit, commit);

  const edited = cb.boundaryOf(inputs, { read: (f) => (f === 'src/engine.js' ? Buffer.concat([committed(f), Buffer.from('\n')]) : committed(f)) });
  assert.deepEqual([edited.qualified, edited.mismatched], [false, ['src/engine.js']], 'one appended byte is named');

  const crlf = cb.boundaryOf(inputs, { read: (f) => (f === 'build.js' ? Buffer.from(committed(f).toString('latin1').replace(/\r?\n/g, '\r\n'), 'latin1') : committed(f)) });
  assert.deepEqual([crlf.qualified, crlf.mismatched], [false, ['build.js']], 'a line-ending conversion is a different byte sequence');

  const lockfileGone = cb.boundaryOf(inputs, { read: (f) => { if (f === 'package-lock.json') throw new Error('ENOENT'); return committed(f); } });
  assert.deepEqual([lockfileGone.qualified, lockfileGone.mismatched], [false, ['package-lock.json']], 'an unreadable input is not a match');

  const extra = cb.boundaryOf(inputs.concat(['tools/no-such-capture-input.js']), { read: (f) => (f === 'tools/no-such-capture-input.js' ? Buffer.from('x') : committed(f)) });
  assert.deepEqual([extra.qualified, extra.untracked], [false, ['tools/no-such-capture-input.js']], 'an input the commit does not hold is named as untracked');
});

test('5.4: a capture tool in a nested extraction cannot inherit the enclosing repository -- no commit, never qualified', () => {
  const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-boundary-nested-'));
  const outer = path.join(scratch, 'outer-repo');
  const nested = path.join(outer, 'extracted-tree');
  try {
    fs.mkdirSync(path.join(nested, 'tools'), { recursive: true });
    git(['init', '--quiet', 'outer-repo'], scratch);
    git(['config', 'user.email', 'test@example.invalid'], outer);
    git(['config', 'user.name', 'Boundary Fixture'], outer);
    fs.copyFileSync(path.join(ROOT, 'tools', 'capture-baseline.js'), path.join(nested, 'tools', 'capture-baseline.js'));
    git(['add', '.'], outer);
    git(['commit', '--quiet', '-m', 'outer tracks the nested tool'], outer);
    assert.match(git(['rev-parse', 'HEAD'], nested), /^[0-9a-f]{40}$/, 'CONTROL: git answers from the nested directory');
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const nestedTool = require(path.join(nested, 'tools', 'capture-baseline.js'));
    const b = nestedTool.boundaryOf(['tools/capture-baseline.js']);
    assert.equal(b.commit, null, 'the enclosing repository even TRACKS this file, and its commit is still not ours');
    assert.equal(b.qualified, false);
    assert.match(b.reason, /not a checkout of its own repository/);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('5.4: the CLI disqualifies an unqualified capture explicitly, and --measured refuses to write one', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-boundary-cli-'));
  /* A reader hook, so this holds in any tree -- clean, dirty, or an extracted
     package: one input's bytes are changed as the capture reads them. */
  const hook = path.join(scratch, 'alter-validator-bytes.js');
  fs.writeFileSync(hook, [
    "'use strict';",
    "const fs = require('node:fs');",
    'const real = fs.readFileSync;',
    'fs.readFileSync = function (p, ...rest) {',
    '  const out = real.call(this, p, ...rest);',
    "  if (typeof p !== 'string' || !/[\\\\/]src[\\\\/]scenario-validator\\.js$/.test(p)) return out;",
    "  return typeof out === 'string' ? out + '\\n// boundary probe\\n' : Buffer.concat([out, Buffer.from('\\n// boundary probe\\n')]);",
    '};',
  ].join('\n'));
  const cli = (args) => spawnSync(process.execPath, ['--require', hook, path.join(ROOT, 'tools', 'capture-baseline.js'), 'capture'].concat(args), { encoding: 'utf8', maxBuffer: 1 << 26 });
  try {
    const refusedOut = path.join(scratch, 'measured.json');
    const refused = cli([refusedOut, '--measured']);
    assert.notEqual(refused.status, 0, 'an unqualified measured capture must not exit 0:\n' + refused.stdout + refused.stderr);
    assert.match(refused.stdout, /UNQUALIFIED CAPTURE REFUSED/);
    if (OWN_CHECKOUT) assert.match(refused.stdout, /differs\s+: src\/scenario-validator\.js/, 'the altered input is named');
    assert.equal(fs.existsSync(refusedOut), false, 'nothing is written');

    const writtenOut = path.join(scratch, 'diagnostic.json');
    const written = cli([writtenOut]);
    assert.equal(written.status, 0, written.stdout + written.stderr);
    assert.match(written.stdout, /UNQUALIFIED CAPTURE — meta\.boundary\.qualified = false/);
    const snap = JSON.parse(fs.readFileSync(writtenOut, 'utf8'));
    assert.equal(snap.meta.boundary.qualified, false, 'the file says so too');
    if (OWN_CHECKOUT) assert.ok(snap.meta.boundary.mismatched.includes('src/scenario-validator.js'));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('5.4: an input whose bytes change while the capture runs disqualifies it', () => {
  /* The first read is the hash taken before the engine loads; every later read
     sees an edit, as if another session saved the file mid-run. */
  const real = fs.readFileSync;
  let reads = 0;
  fs.readFileSync = function (p, ...rest) {
    const out = real.call(this, p, ...rest);
    if (typeof p !== 'string' || !/[\\/]build\.js$/.test(p) || ++reads === 1) return out;
    const edit = '\n// edited mid-capture\n';
    return typeof out === 'string' ? out + edit : Buffer.concat([out, Buffer.from(edit)]);
  };
  let snap;
  try {
    snap = cb.capture();
  } finally {
    fs.readFileSync = real;
  }
  assert.ok(reads > 1, 'CONTROL: the capture read build.js again after hashing it');
  assert.equal(snap.meta.boundary.qualified, false);
  assert.deepEqual(snap.meta.boundary.changedDuringCapture, ['build.js']);
  assert.match(snap.meta.boundary.reason, /inputs changed while the capture ran/);
});
