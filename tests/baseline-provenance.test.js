'use strict';

/*
 * S4 task 5.1 -- every stored baseline's provenance is classified, and the
 * classification is held to the repository's history, not merely asserted.
 *
 * Q37's fix (3dc7f48) stops a nested extraction borrowing the enclosing
 * repository's commit. It could not say whether the commits ALREADY recorded
 * were right, and Q37's own entry named the gap: a capture claiming commit X
 * while its source hashes match commit Y passes every check the capture tool
 * has. One stored capture does exactly that -- after-CL-closure -- and
 * verifyIntegrity() calls it clean, because meta.hash does not cover
 * meta.gitCommit.
 *
 * The replay behind each class (a clean clone of the recorded commit running
 * its own capture tool) is too heavy for the gate; it lives in
 * tools/verify-baseline-provenance.js. The gate holds the part that reads git
 * objects: each reproduced capture's source hashes ARE its recorded commit's
 * bytes, and the wrong commit's still are NOT, so the finding stays
 * reproducible instead of becoming a sentence.
 *
 * Outside a checkout of this repository -- a delivered package -- there is no
 * history to read. Those branches assert that the capture tool agrees there is
 * none: the same condition, checked, rather than a silent skip.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const provenance = require('../tools/verify-baseline-provenance.js');
const baseline = require('../tools/capture-baseline.js');

const REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'baseline-registry.json'), 'utf8'));
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const OWN_CHECKOUT = provenance.isToplevel(ROOT);
const CL_CLOSURE = 'tools/baseline-20260910-after-CL-closure.json';

/* The public repository began on 2026-09-28 as a one-commit copy of the private development repository. The commits
 * the stored baselines record are in that private archive, not here, so a checkout can have history and still not have
 * the history these checks read. That is checked, not assumed: the history-reading checks run where the recorded
 * commits are present, and where they are not, every one of them must be absent -- never some.
 * S5AA R40 (2026-09-30) registered the first capture recorded HERE (provenance.repository "this"). Its commit is in this
 * repository's history, so it is kept out of the all-or-none set and held to this history on its own (below). */
const ARCHIVED = REGISTRY.baselines.filter((b) => !(b.provenance && b.provenance.repository === 'this'));
const HERE = REGISTRY.baselines.filter((b) => b.provenance && b.provenance.repository === 'this');
const RECORDED = [...new Set(ARCHIVED.map((b) => read(b.file).meta || {})
  .filter((m) => typeof m.gitCommit === 'string').map((m) => m.gitCommit))];
const PRESENT = OWN_CHECKOUT ? RECORDED.filter((c) => provenance.commitExists(c, ROOT)) : [];
const HISTORY = PRESENT.length > 0;
function noHistoryHere() {
  if (!OWN_CHECKOUT) assert.equal(baseline.gitCommit(), null, 'no history here, and the capture tool must agree');
  else assert.deepEqual(PRESENT, [], 'a checkout without the recorded commits holds none of them');
}

test('5.1: the recorded commits are all in this history or none are', () => {
  assert.ok(RECORDED.length > 20, 'CONTROL: the registry records the commits it is checked against (' + RECORDED.length + ')');
  assert.ok(PRESENT.length === 0 || PRESENT.length === RECORDED.length,
    'a partial history would let the checks below pass on the commits that happen to be here: ' + PRESENT.length + ' of ' + RECORDED.length);
});

test('5.1: a baseline recorded in this repository is held to this repository\'s history', () => {
  assert.ok(HERE.length >= 1, 'CONTROL: r18 (S5AA R40) is recorded here');
  assert.deepEqual(HERE.map((b) => b.provenance.class), HERE.map(() => 'reproduced'), 'recorded here means replayed here, byte for byte');
  if (!OWN_CHECKOUT) {
    assert.equal(baseline.gitCommit(), null, 'no history here, and the capture tool must agree');
    return;
  }
  const missing = HERE.filter((b) => !provenance.commitExists(read(b.file).meta.gitCommit, ROOT)).map((b) => b.file);
  assert.deepEqual(missing, [], 'a commit recorded in this repository is in any checkout of it');
  assert.deepEqual(provenance.registryProblems(Object.assign({}, REGISTRY, { baselines: HERE }), { history: true }), [],
    'its source hashes are its recorded commit\'s bytes');
});

test('5.1: this test and the capture tool agree on whether there is history to read', () => {
  assert.equal(OWN_CHECKOUT, baseline.gitCommit() !== null,
    'provenance checks run exactly where capture-baseline would record a commit, and nowhere else');
});

test('5.1: every stored baseline carries a provenance class, and each class agrees with the file it describes', () => {
  assert.deepEqual(Object.keys(REGISTRY.provenanceClasses).sort(), [...provenance.CLASSES].sort(),
    'the registry defines exactly the classes the tool checks');
  assert.deepEqual(provenance.registryProblems(REGISTRY, { history: false }), []);
  const counts = {};
  REGISTRY.baselines.forEach((b) => { counts[b.provenance.class] = (counts[b.provenance.class] || 0) + 1; });
  assert.deepEqual(counts, { 'unqualified-no-commit': 8, reproduced: 35, 'reproduced-output': 1, 'unqualified-wrong-commit': 1 },
    'measured 2026-09-13: eight record no commit, five reproduce byte for byte, one reproduces its output, one names the wrong commit. ' +
    'On 2026-09-14 the successor control capture joined the byte-for-byte class, replayed in a clean clone of its recorded commit, so six. ' +
    'On 2026-09-20 S5AA task 6.2 added the first EXPANDED capture, baseline-20260920-s5aa-expanded.json, replayed the same way, so seven. ' +
    'That replay is worth recording because it failed the first time for a reason that had nothing to do with the engine: without ' +
    'node_modules the clean worktree reproduced every entry, every hash and the commit, and differed in exactly one leaf -- ' +
    'meta.inputGraph.runtime.jsdom, which the capture records as null when the dependency is absent. Four bytes. With the ' +
    'dependencies present it is byte for byte, which is what separates this class from reproduced-output. '
    + 'On the same day the self-audit re-captured the expanded composition at 33dc5bf, replayed the same way, so eight. '
    + 'Two expanded captures is not duplication: the earlier one is the record of what the engine produced BEFORE the '
    + 'post-death exclusion, and preserving it is what versioning these is for. '
    + 'The second S5AA audit re-captured it again at b531d0a after narrowing that exclusion, replayed in a second clean '
    + 'worktree, so nine -- and that capture is IDENTICAL to the first, which is what says r2 differed only by the '
    + 'false disclosure. '
    + 'The S5AA follow-up block re-captured it at 7d9d2ef after Q3 and Q4 and the member added for them, in two clean '
    + 'worktrees, so ten. '
    + 'The R6 external-audit repairs re-captured it at bff5dc3 after EA-01 to EA-07 and the two members added for them, in '
    + 'two clean worktrees, so eleven. '
    + 'The R7 re-audit repairs re-captured it at dea4393, after the death disclosures moved to executed state and the '
    + 'member added for EA-04, in two clean worktrees, so twelve. '
    + 'The R9 round re-captured it at 467e9b4, after the owner\'s decisions of 2026-09-21 and the DeepSeek batch, in two '
    + 'clean worktrees, so thirteen. The R12 round re-captured it at 4492088, after the repairs from the two external '
    + 'audits of 02b921a and b053dc2, in two clean worktrees, so fourteen. The R14 round re-captured it at 0ee30dc, after the '
    + 'repair from the re-audit of 6468235 and with three new members reaching the repaired required distributions, in two '
    + 'clean worktrees, so fifteen. The R15 round re-captured it at 0b7c272, after the repair from the audit of 1e6faae and '
    + 'with one new member for it, in two clean worktrees, so sixteen. The R18 round re-captured it at 235eb5f, after '
    + 'workstream B (taxable basis in dollars), in two clean worktrees, so seventeen. After the R18 self-audit it was '
    + 're-captured at 5cb87f3, after its two loss-rule repairs and their two witnesses, in two clean worktrees, so eighteen. '
    + 'The R19 round re-captured it at 44ebf5a, after the capital-loss repair, workstream A and its four witnesses, in '
    + 'two clean worktrees, so nineteen. The R20 round re-captured it at 65d65fb, after the three repairs from the R18 '
    + 'full-model audit and their three witnesses, in two clean worktrees, so twenty. The R23 round re-captured it at '
    + 'fb3c6dc, after the Roth exclusion was keyed on actual draws, in two clean worktrees, so twenty-one. The R24 round '
    + 're-captured it at 0acc073, after a scheduled transfer was judged at its own age, in two clean worktrees, so twenty-two. '
    + 'The R26 round re-captured it at 0b90445, after IRA contributions were capped at compensation, in two clean '
    + 'worktrees, so twenty-three. The S5AA R40 round re-captured it at 00dbb4b, the first capture recorded in this public '
    + 'repository, after R29 to R39.1 had moved the corpus without registering one, in two clean worktrees, so twenty-four. '
    + 'After R40\'s four repairs it was re-captured at d51d30d, in two clean worktrees, so twenty-five. '
    + 'After the audit of PR #35 reverted one of them and corrected another, it was re-captured at 9fd61c2, in two clean '
    + 'worktrees, so twenty-six. After R42 repaired ChatGPT\'s R41F-01 to R41F-05 it was re-captured at 82856a3, in two clean '
    + 'worktrees, so twenty-seven. After R43 repaired ChatGPT\'s R42 finding and Claude\'s R42F findings it was re-captured at 96006c1, in two '
    + 'clean worktrees, so twenty-eight. After R44 repaired ChatGPT\'s R43 findings it was re-captured at bb5e7f3, in two clean '
    + 'worktrees, so twenty-nine. After R45 gave each spouse their own retirement date it was re-captured at 265347a, in two clean '
    + 'worktrees, so thirty. After R46 shared Monte Carlo shocks across accounts and made the reserve one household fraction it was '
    + 're-captured at 6edcadf, in two clean worktrees, so thirty-one. After R47 (federal tax and retirement accounts) was integrated '
    + 'on R46 it was re-captured at 4f7a5ed, in two clean worktrees, so thirty-two. After R48 (Medicare, survivors and Arizona) was '
    + 'integrated on R47 it was re-captured at e2d989f, in two clean worktrees, so thirty-three. After R49 (spending, debt, defaults and '
    + 'disclosure) was integrated on R48 it was re-captured at d381383, in two clean worktrees, so thirty-four. After R50 (the Roth IRA '
    + 'basis ledger and income earlier in the first tax year) was integrated on R49 it was re-captured at ab33cb7, in two clean worktrees, '
    + 'so thirty-five');
});

test('5.1: held to history -- reproduced captures match their recorded commit, and the wrong commit still does not', () => {
  if (!HISTORY) {
    noHistoryHere();
    return;
  }
  assert.deepEqual(provenance.registryProblems(Object.assign({}, REGISTRY, { baselines: ARCHIVED }), { history: true }), []);
});

test('5.1: after-CL-closure names 3a20e73, is internally clean, and its sources are fea216c\'s', () => {
  const snap = read(CL_CLOSURE);
  assert.equal(snap.meta.gitCommit, '3a20e736debdc96e8e79b0d61f8ab9e32016cf3d');
  assert.equal(REGISTRY.baselines.find((b) => b.file === CL_CLOSURE).provenance.class, 'unqualified-wrong-commit');
  assert.deepEqual(baseline.verifyIntegrity(snap), [],
    'CONTROL: the file is internally consistent, so only a provenance measurement can find this');
  if (!HISTORY) {
    noHistoryHere();
    return;
  }
  const at = provenance.sourceConsistency(snap.meta, snap.meta.gitCommit);
  assert.equal(at.allMatch, false);
  assert.equal(at.files['src/scenario-validator.js'], 'DIFFERENT', 'the validator is the file that differs at the recorded commit');
  assert.equal(provenance.sourceConsistency(snap.meta, 'fea216c').allMatch, true, 'and every source is fea216c\'s');
});

test('5.1: sourceConsistency tells committed bytes, their CRLF rendering, a different file, an absent file and a missing commit apart', () => {
  if (!HISTORY) {
    noHistoryHere();
    return;
  }
  const blob = (commit, file) => execFileSync('git', ['cat-file', 'blob', commit + ':' + file], { cwd: ROOT, maxBuffer: 1 << 28 });
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const file = 'src/scenario-validator.js';
  const committed = blob('fea216c', file);
  const crlf = Buffer.from(committed.toString('latin1').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), 'latin1');
  assert.notEqual(sha(committed), sha(crlf), 'CONTROL: the two renderings must differ, or the CRLF case proves nothing');
  const at = (hashes, commit) => provenance.sourceConsistency({ sourceHashes: hashes }, commit);
  assert.deepEqual(at({ [file]: sha(committed) }, 'fea216c').files, { [file]: 'committed' });
  assert.deepEqual(at({ [file]: sha(crlf) }, 'fea216c').files, { [file]: 'crlf' });
  assert.deepEqual(at({ [file]: sha(committed) }, '3a20e73').files, { [file]: 'DIFFERENT' });
  assert.deepEqual(at({ 'src/no-such-file.js': sha(committed) }, 'fea216c').files, { 'src/no-such-file.js': 'absent-at-commit' });
  assert.equal(at({ [file]: sha(committed) }, 'fea216c').allMatch, true);
  assert.equal(at({ [file]: sha(committed) }, '3a20e73').allMatch, false);
  assert.equal(at({ [file]: sha(committed) }, '0000000000000000000000000000000000000000').checkable, false);
  assert.equal(provenance.sourceConsistency({}, 'fea216c').checkable, false, 'a capture with no source hashes has nothing to check');
});

test('5.1: a replay is classified by what it reproduced -- bytes, output only, or neither', () => {
  const stored = { meta: { gitCommit: 'a'.repeat(40), hash: 'h', corpusInputHash: 'c', sourceHashes: { 'src/engine.js': 's' }, fieldCounts: { row: 22 } }, entries: [{ name: 'x', hash: 'e' }] };
  const text = (o) => JSON.stringify(o, null, 2) + '\n';
  const variant = (edit) => { const o = JSON.parse(JSON.stringify(stored)); edit(o); return text(o); };

  assert.equal(provenance.classifyReplay(text(stored), text(stored).replace(/\n/g, '\r\n')).class, 'reproduced', 'line endings alone are not a difference');

  const metaOnly = provenance.classifyReplay(text(stored), variant((o) => { o.meta.fieldCounts = { simple: { row: 22 } }; }));
  assert.equal(metaOnly.class, 'reproduced-output');
  assert.deepEqual(metaOnly.differingLeaves, ['meta.fieldCounts.row', 'meta.fieldCounts.simple']);

  const otherCommit = provenance.classifyReplay(text(stored), variant((o) => { o.meta.gitCommit = 'b'.repeat(40); }));
  assert.equal(otherCommit.class, 'unqualified-wrong-commit', 'a different recorded commit is not the recorded commit reproducing');
  assert.equal(otherCommit.onlyCommitDiffers, true, 'but it is reported, because that is how a true origin is found');

  const entry = provenance.classifyReplay(text(stored), variant((o) => { o.entries[0].hash = 'changed'; }));
  assert.equal(entry.class, 'unqualified-wrong-commit');
  assert.equal(entry.onlyCommitDiffers, false);
});

test('5.1: a replay refuses a directory that is not its own checkout, and a clone that converts line endings', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'provenance-replay-'));
  const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    const repo = path.join(scratch, 'repo');
    fs.mkdirSync(path.join(repo, 'nested'), { recursive: true });
    git(['init', '--quiet'], repo);
    git(['config', 'user.email', 'test@example.invalid'], repo);
    git(['config', 'user.name', 'Provenance Fixture'], repo);
    fs.writeFileSync(path.join(repo, 'README'), 'fixture\n');
    git(['add', 'README'], repo);
    git(['commit', '--quiet', '-m', 'fixture'], repo);
    const head = git(['rev-parse', 'HEAD'], repo);

    assert.throws(() => provenance.replay(CL_CLOSURE, head, path.join(repo, 'nested'), scratch), /is not itself a git checkout/,
      'git answers from a nested directory, and a replay there would borrow the enclosing history (Q37)');
    git(['config', 'core.autocrlf', 'true'], repo);
    assert.throws(() => provenance.replay(CL_CLOSURE, head, repo, scratch), /core\.autocrlf=true/);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
