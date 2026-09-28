'use strict';

/*
 * S4 task 5.1 -- does a stored baseline's recorded commit identify the engine
 * that produced it?
 *
 * Q37 repaired the capture tool so that a NESTED extraction records null, not
 * the enclosing repository's HEAD (3dc7f48). Its own register entry left the
 * other half open: "A capture claiming commit X while its source hashes match
 * commit Y would pass every check this tool has." meta.hash covers the entries
 * and not meta.gitCommit, so verifyIntegrity() cannot see a wrong commit at
 * all. This tool is that cross-check.
 *
 * TWO MEASUREMENTS, kept apart because they cost and prove different things:
 *
 *   sources  Are the file's meta.sourceHashes the committed bytes of those
 *            files at its recorded commit? It reads git objects only, with no
 *            checkout and no engine run, so it is cheap enough for the gate.
 *            A match is NECESSARY, NOT SUFFICIENT: sourceHashes name the
 *            engine, the shell, the validator, build.js and the bundled
 *            modules, but not the corpus generator or the capture tool.
 *   replay   Check out the recorded commit in a CLEAN clone and run THAT
 *            commit's own capture tool. A byte-identical file is the strongest
 *            statement available: that commit produces this capture.
 *
 * Neither ever edits a baseline. An unverifiable record is classified
 * historical/unqualified and kept exactly as captured (S4-PA-10). A commit
 * found to reproduce it is recorded BESIDE it, in tools/baseline-registry.json,
 * and never written into it.
 *
 *   node tools/verify-baseline-provenance.js sources
 *   node tools/verify-baseline-provenance.js replay --clone <clean clone> --out <dir> [--at <commit>] [<baseline.json> ...]
 */

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const REGISTRY_PATH = path.join(ROOT, 'tools', 'baseline-registry.json');

const CLASSES = ['reproduced', 'reproduced-output', 'unqualified-wrong-commit', 'unqualified-no-commit'];

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function git(args, cwd, extra = {}) {
  return execFileSync('git', args, Object.assign({
    cwd, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'],
  }, extra));
}

/* Whether `dir` is ITSELF a git toplevel. Q37's condition: git walks up the
   directory tree, so answering at all proves nothing about whose history it
   answered from. */
/* The same directory can have two spellings on Windows: git reports its LONG path, while a caller (or TEMP) may hold
   an 8.3 short alias. GitHub's Windows runners set TEMP to C:\Users\RUNNER~1\..., and every replay there was refused
   as "not itself a git checkout" (the first CI run, 2026-09-23). Both sides are compared as the file system's own
   resolved path, so an alias of the same checkout is the same checkout, and a nested directory still is not. */
function isToplevel(dir) {
  try {
    const real = (p) => fs.realpathSync.native(path.resolve(p));
    return real(git(['rev-parse', '--show-toplevel'], dir).trim()) === real(dir);
  } catch (e) {
    return false;
  }
}

/* One `git cat-file --batch` for every object, instead of a process per file:
   this runs inside the gate. Returns spec -> { type, content } or null. */
function readObjects(specs, root) {
  const out = new Map();
  if (!specs.length) return out;
  const buf = execFileSync('git', ['cat-file', '--batch'], {
    cwd: root, input: specs.join('\n') + '\n', maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'ignore'],
  });
  let at = 0;
  for (const spec of specs) {
    const nl = buf.indexOf(0x0a, at);
    const header = buf.slice(at, nl).toString('utf8');
    at = nl + 1;
    const m = header.match(/^[0-9a-f]{40,64} (\w+) (\d+)$/);
    if (!m) { out.set(spec, null); continue; } /* "<spec> missing" or "ambiguous" */
    const size = Number(m[2]);
    out.set(spec, { type: m[1], content: buf.slice(at, at + size) });
    at += size + 1;
  }
  return out;
}

function commitExists(commit, root = ROOT) {
  const o = readObjects([commit + '^{commit}'], root).get(commit + '^{commit}');
  return !!o && o.type === 'commit';
}

/* Are meta.sourceHashes the bytes of those files at `commit`? Two renderings
 * count, and the verdict says which: the committed bytes, and their CRLF
 * rendering. A capture hashes the WORKING TREE, and before .gitattributes
 * (S4 task 1) a clean checkout on this machine could hold either -- so a CRLF
 * match is a clean capture, not a mismatch. Anything else is DIFFERENT. */
function sourceConsistency(meta, commit, root = ROOT) {
  const hashes = meta && meta.sourceHashes;
  if (!hashes || typeof hashes !== 'object') return { checkable: false, reason: 'the capture records no meta.sourceHashes', files: {} };
  if (!commitExists(commit, root)) return { checkable: false, reason: 'commit ' + commit + ' is not in this repository', files: {} };
  const names = Object.keys(hashes).sort();
  const objects = readObjects(names.map((f) => commit + ':' + f), root);
  const files = {};
  let allMatch = true;
  for (const f of names) {
    const o = objects.get(commit + ':' + f);
    let verdict;
    if (!o || o.type !== 'blob') {
      verdict = 'absent-at-commit';
    } else {
      const lf = Buffer.from(o.content.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
      const crlf = Buffer.from(lf.toString('latin1').replace(/\n/g, '\r\n'), 'latin1');
      verdict = sha256(o.content) === hashes[f] ? 'committed' : sha256(crlf) === hashes[f] ? 'crlf' : 'DIFFERENT';
    }
    /* S5 task 1.7: `files[f] = verdict` lost the verdict for a claimed path of
       "__proto__" (it ran the inherited setter), while allMatch below still
       counted it. The keys are data from a stored capture. capture-baseline's
       assignOwn() is the one own-property-safe assignment (RP-04), required
       here at call time; it keeps `files` a plain object, so strict deepEqual
       against object literals is unaffected. */
    require('./capture-baseline.js').assignOwn(files, f, verdict);
    if (verdict !== 'committed' && verdict !== 'crlf') allMatch = false;
  }
  return { checkable: true, allMatch, files };
}

function readJson(rel, root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

/* What the registry says about each baseline's provenance, held against the
 * file itself (always) and against the repository's history (when this tree is
 * its own checkout). Returns a list of problems; empty means every record is
 * what it claims. */
function registryProblems(registry, { history, root = ROOT } = {}) {
  const problems = [];
  for (const b of registry.baselines) {
    const p = b.provenance;
    const where = b.file + ': ';
    if (!p || !CLASSES.includes(p.class)) { problems.push(where + 'provenance class ' + JSON.stringify(p && p.class) + ' is not one of ' + CLASSES.join(', ')); continue; }
    const meta = readJson(b.file, root).meta || {};
    const recorded = typeof meta.gitCommit === 'string' ? meta.gitCommit : null;
    if (p.class === 'unqualified-no-commit') {
      if (recorded) problems.push(where + 'classified as recording no commit, but it records ' + recorded);
      continue;
    }
    if (!recorded) { problems.push(where + 'classified ' + p.class + ', but it records no commit'); continue; }
    if (typeof p.recordedCommit !== 'string' || p.recordedCommit.length < 7 || !recorded.startsWith(p.recordedCommit)) {
      problems.push(where + 'registry names recorded commit ' + JSON.stringify(p.recordedCommit) + ', the file records ' + recorded);
    }
    const leaves = p.differingLeaves;
    if (p.class === 'reproduced-output' && !(Array.isArray(leaves) && leaves.length && leaves.every((l) => typeof l === 'string'))) {
      problems.push(where + 'reproduced-output must name the metadata leaves that differ');
    }
    if (p.class !== 'reproduced-output' && leaves !== undefined) problems.push(where + 'only reproduced-output names differing leaves');
    if (p.class.startsWith('unqualified') && b.status === 'baseline') {
      problems.push(where + 'a capture whose provenance is unqualified cannot hold the status "baseline"');
    }
    if (p.class === 'unqualified-wrong-commit' && !['match', 'differ'].includes(p.sourcesAtRecordedCommit)) {
      problems.push(where + 'unqualified-wrong-commit must record whether its source hashes match the recorded commit');
    }
    if (!history) continue;

    /* Against history. Reproduced classes REQUIRE the sources to match; a wrong
       commit must still show the mismatch it was classified on, so the finding
       stays reproducible rather than asserted. */
    const at = sourceConsistency(meta, recorded, root);
    if (!at.checkable) { problems.push(where + at.reason); continue; }
    if (p.class.startsWith('reproduced') && !at.allMatch) {
      problems.push(where + 'classified ' + p.class + ', but its source hashes do not match ' + recorded.slice(0, 7) + ': ' + JSON.stringify(at.files));
    }
    if (p.class === 'unqualified-wrong-commit' && (at.allMatch ? 'match' : 'differ') !== p.sourcesAtRecordedCommit) {
      problems.push(where + 'registry says its sources ' + p.sourcesAtRecordedCommit + ' at ' + recorded.slice(0, 7) + ', measured ' + JSON.stringify(at.files));
    }
    if (p.reproducesAt !== undefined) {
      const alt = sourceConsistency(meta, p.reproducesAt, root);
      if (!alt.checkable || !alt.allMatch) problems.push(where + 'registry says it reproduces at ' + p.reproducesAt + ', but its source hashes do not match there: ' + (alt.reason || JSON.stringify(alt.files)));
    }
  }
  return problems;
}

/* Leaves that differ between two JSON values, as dotted paths. Capped: the
   point is to NAME what differs, not to print a 36-scenario diff. */
function differingLeaves(a, b, at = '', out = [], cap = 50) {
  if (out.length >= cap || JSON.stringify(a) === JSON.stringify(b)) return out;
  const objects = a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b);
  if (!objects) { out.push(at || '(root)'); return out; }
  const keys = Array.isArray(a) ? [...Array(Math.max(a.length, b.length)).keys()] : [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of keys) differingLeaves(a[k], b[k], at ? at + '.' + k : String(k), out, cap);
  return out;
}

/* Classify a replay by what it reproduced, from strongest to none. */
function classifyReplay(storedText, producedText) {
  const norm = (s) => s.replace(/\r\n/g, '\n');
  if (norm(storedText) === norm(producedText)) return { class: 'reproduced' };
  const s = JSON.parse(storedText);
  const r = JSON.parse(producedText);
  const same = (f) => JSON.stringify(f(s)) === JSON.stringify(f(r));
  const output = same((x) => x.entries) && same((x) => x.meta.hash) && same((x) => x.meta.corpusInputHash) &&
    same((x) => x.meta.sourceHashes) && same((x) => x.meta.gitCommit);
  const leaves = differingLeaves(s, r);
  /* A replay at a commit OTHER than the recorded one (--at) can reproduce
     everything except the recorded commit itself. That is how a wrong commit's
     true origin is found, so it is reported rather than folded into "wrong". */
  const onlyCommitDiffers = leaves.length === 1 && leaves[0] === 'meta.gitCommit';
  return { class: output ? 'reproduced-output' : 'unqualified-wrong-commit', differingLeaves: leaves, onlyCommitDiffers };
}

/* Run `commit`'s own capture tool in a clean clone and classify the result. The
   clone must be its own toplevel, must not convert line endings, and must hold
   exactly `commit`'s tracked files after checkout -- or the replay would be
   another dirty-tree capture, which is the defect it exists to find. */
function replay(file, commit, clone, outDir) {
  if (!isToplevel(clone)) throw new Error('refusing to replay: ' + clone + ' is not itself a git checkout');
  let autocrlf = '';
  try { autocrlf = git(['config', '--get', 'core.autocrlf'], clone).trim(); } catch (e) { autocrlf = ''; }
  if (autocrlf === 'true') throw new Error('refusing to replay: core.autocrlf=true in ' + clone + ' converts line endings on checkout, so the capture would hash converted bytes');
  git(['checkout', '-q', '-f', '--detach', commit], clone);
  const dirty = git(['status', '--porcelain', '--untracked-files=no'], clone).trim();
  if (dirty) throw new Error('refusing to replay: tracked files in ' + clone + ' differ from ' + commit + ':\n' + dirty);
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, path.basename(file, '.json') + '@' + commit.slice(0, 7) + '.json');
  execFileSync(process.execPath, ['tools/capture-baseline.js', 'capture', out], {
    cwd: clone, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const verdict = classifyReplay(fs.readFileSync(path.join(ROOT, file), 'utf8'), fs.readFileSync(out, 'utf8'));
  return Object.assign({ file, at: git(['rev-parse', 'HEAD'], clone).trim(), output: out }, verdict);
}

function main(argv) {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const cmd = argv[0];
  if (cmd === 'sources') {
    if (!isToplevel(ROOT)) {
      console.error('not a git checkout of this repository: the recorded commits cannot be read from here');
      return 2;
    }
    for (const b of registry.baselines) {
      const meta = readJson(b.file).meta || {};
      const recorded = typeof meta.gitCommit === 'string' ? meta.gitCommit : null;
      const at = recorded ? sourceConsistency(meta, recorded) : { checkable: false, reason: 'records no commit' };
      const measured = at.checkable ? (at.allMatch ? 'sources match ' + recorded.slice(0, 7) : 'sources DIFFER at ' + recorded.slice(0, 7)) : at.reason;
      console.log((b.provenance ? b.provenance.class : '(unclassified)').padEnd(26) + ' ' + measured.padEnd(38) + ' ' + b.file);
    }
    const problems = registryProblems(registry, { history: true });
    problems.forEach((p) => console.log('PROBLEM ' + p));
    console.log(problems.length ? 'PROVENANCE: ' + problems.length + ' problem(s)' : 'PROVENANCE: every registry classification agrees with history');
    return problems.length ? 1 : 0;
  }
  if (cmd === 'replay') {
    const opt = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };
    const clone = opt('--clone');
    const outDir = opt('--out');
    const atOverride = opt('--at');
    if (!clone || !outDir) throw new Error('usage: node tools/verify-baseline-provenance.js replay --clone <clean clone> --out <dir> [--at <commit>] [<baseline.json> ...]');
    const skip = new Set([argv.indexOf('--clone') + 1, argv.indexOf('--out') + 1, argv.indexOf('--at') + 1]);
    const named = argv.slice(1).filter((a, i) => !a.startsWith('--') && !skip.has(i + 1));
    const targets = registry.baselines.filter((b) => (named.length ? named.includes(b.file) : true));
    let unqualified = 0;
    for (const b of targets) {
      const recorded = (readJson(b.file).meta || {}).gitCommit;
      if (!recorded && !atOverride) { console.log(JSON.stringify({ file: b.file, class: 'unqualified-no-commit' })); continue; }
      const row = replay(b.file, atOverride || recorded, path.resolve(clone), path.resolve(outDir));
      if (row.class !== 'reproduced') unqualified++;
      console.log(JSON.stringify(row));
    }
    console.log('REPLAY COMPLETE: ' + targets.length + ' baseline(s), ' + unqualified + ' not byte-identical');
    return 0;
  }
  console.log('usage:\n  node tools/verify-baseline-provenance.js sources\n  node tools/verify-baseline-provenance.js replay --clone <clean clone> --out <dir> [--at <commit>] [<baseline.json> ...]');
  return cmd ? 1 : 0;
}

module.exports = {
  CLASSES, isToplevel, commitExists, sourceConsistency, registryProblems, differingLeaves, classifyReplay, replay,
};

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
