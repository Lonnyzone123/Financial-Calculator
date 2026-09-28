'use strict';

/*
 * S4 task 8 -- the requirements register, held to the code it is harvested
 * from, and 8.7's closeout check, held to its acceptance.
 *
 * The register is generated, so it is checked three ways it does not control:
 *   - against a fresh harvest, so it cannot drift from the comments;
 *   - against a deliberately looser scan of the same sources, so a narrowed
 *     grammar cannot quietly drop IDs;
 *   - against the test corpus itself, so a class claims only what the tests
 *     actually say.
 * Every family must be reachable from a committed document (8.6). The closeout
 * check must refuse an unqualified completion claim on 8.7's three seeded
 * items, and accept documented carry-forward only under its deadline rule.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const reg = require('../tools/requirements-register.js');
const closeout = require('../tools/closeout-check.js');

const COMMITTED = JSON.parse(fs.readFileSync(reg.REGISTER_PATH, 'utf8'));
const FRESH = reg.build(ROOT);

test('8.1: the committed register is exactly a fresh harvest of the engine and debt-module comments', () => {
  assert.deepEqual(COMMITTED.sources, FRESH.sources);
  assert.deepEqual(COMMITTED.counts, FRESH.counts, 'counts drifted -- rebuild with `node tools/requirements-register.js build --write` and review the diff');
  assert.deepEqual(COMMITTED.requirements, FRESH.requirements);
  assert.ok(FRESH.counts.requirements > 50 && FRESH.counts.commentBlocksWithIds > 100, 'CONTROL: the harvest found the corpus, not a stub: ' + JSON.stringify(FRESH.counts));
});

test('8.1: a deliberately looser scan finds no hyphenated audit ID the register missed', () => {
  /* Looser in the two places a grammar narrows silently -- the family letters
     and the suffix. Not in the digits: audit IDs run to three, and the first
     version of this scan, allowing four, flagged the data-package tag AZ-2026. */
  const loose = /\b([A-Z][A-Z0-9]{0,6})-(\d{1,3})([a-z]?)\b/g;
  const ignore = new Set(['UTF', 'SHA', 'ISO', 'ES', 'IEEE', 'RFC', 'CVE', 'UTC', 'AES', 'MD', 'W']);
  const registered = new Set(FRESH.requirements.map((r) => r.id));
  const missed = [];
  for (const file of FRESH.sources) {
    for (const c of reg.commentBlocks(fs.readFileSync(path.join(ROOT, file), 'utf8'))) {
      let m;
      loose.lastIndex = 0;
      while ((m = loose.exec(c.text))) {
        if (ignore.has(m[1])) continue;
        const suffix = m[3] === 's' ? '' : m[3];
        const id = m[1] + '-' + m[2] + suffix;
        if (!registered.has(id)) missed.push(file + ':' + c.line + ' ' + id);
      }
    }
  }
  assert.deepEqual(missed, [], 'IDs in engine comments the register does not carry');
});

test('8.2: every guard class says only what the test corpus says', () => {
  const corpus = reg.testCorpus(ROOT);
  const wrong = [];
  for (const r of FRESH.requirements) {
    if (r.guard.class === 'GUARDED_BY_TEST_NAME') {
      r.guard.tests.forEach((t) => {
        const [file, title] = t.split(' :: ');
        if (!corpus.titles.some((x) => x.file === file && x.title === title)) wrong.push(r.id + ': no test titled ' + JSON.stringify(title) + ' in ' + file);
      });
    }
    if (r.guard.class === 'GUARDED_BY_TEST_NAME' && !r.guard.tests.length) wrong.push(r.id + ': GUARDED_BY_TEST_NAME with no named test');
    if (r.guard.class === 'CITED_IN_TEST_FILE' && (!r.guard.files.length || r.guard.tests.length)) wrong.push(r.id + ': CITED_IN_TEST_FILE must be cited by a file and named by no test');
    if (r.guard.class === 'UNGUARDED' && r.guard.files.length) wrong.push(r.id + ': UNGUARDED but cited in ' + r.guard.files.join(', '));
    if ((r.guard.class === 'UNGUARDED' || r.disposition === 'needs-decision') !== Boolean(r.open)) wrong.push(r.id + ': an item that can block completion must carry the 8.7 fields, and only such an item');
  }
  assert.deepEqual(wrong, []);
});

test('8.4 / 8.5: a requirement whose question is closed is carried forward, never reopened; an open one needs a decision', () => {
  const statuses = reg.questionStatuses(ROOT);
  for (const r of FRESH.requirements.filter((x) => x.family === 'Q')) {
    if (statuses[r.id] === 'open') assert.equal(r.disposition, 'needs-decision', r.id);
    if (statuses[r.id] === 'closed') assert.equal(r.disposition, 'carried-forward', r.id);
  }
  assert.equal(statuses.Q19, 'closed', 'CONTROL: the status reader sees a closure recorded as its own heading');
  /* The OPEN control is found, not named: a named control broke each time its question was decided. This test's own
     reading picks the first entry whose first bold status line opens with OPEN and that no heading closes, and the
     status reader must read that entry as open. */
  const questionsText = fs.readFileSync(path.join(ROOT, 'SPRINT_QUESTIONS.md'), 'utf8');
  const openByText = questionsText.split(/^(?=## )/m)
    .map((section) => {
      const id = (section.match(/^## [^\n]*— (Q\d+)\./) || [])[1];
      const first = section.match(/\*\*Status: ([^*]+)\*\*/);
      const closedByHeading = id && new RegExp('^## [^\\n]*\\b' + id + ' CLOSED\\b', 'm').test(questionsText);
      return id && first && first[1].trim().startsWith('OPEN') && !closedByHeading ? id : null;
    })
    .filter(Boolean);
  assert.ok(openByText.length > 0, 'CONTROL: SPRINT_QUESTIONS.md holds at least one entry whose status line says OPEN');
  assert.equal(statuses[openByText[0]], 'open', 'CONTROL: and ' + openByText[0] + ', whose status line says OPEN, reads as open');
});

/*
 * 8.5's live-data controls (Q19, Q57 above) have been repointed twice in one
 * day already -- Q58 at 2123ab7, Q50 at b41d73a -- each time because the
 * question the control happened to name got decided. Pinning to whichever
 * question is still open this week means the control breaks on schedule
 * rather than testing anything. This fixture pins questionStatuses()'s
 * actual behaviour against synthetic data instead, independent of
 * SPRINT_QUESTIONS.md's current content -- including the one shape that bit
 * Q50 itself (investment-calculator-84, 2026-09-13): a status line that
 * LEADS with DECIDED and only corrects to OPEN in a later sentence. The
 * parser reads only the first bold `**Status: ...**` match (by design, not
 * by omission -- see the comment above questionStatuses()), so that shape
 * parses as 'other: DECIDED...', not 'open'. This test pins that real
 * behaviour rather than asserting the parser should be smarter than it is;
 * if the parser is ever changed to look past the first match, this is the
 * test that should start failing and get updated alongside it.
 */
function questionStatusesFixture(dir) {
  fs.writeFileSync(path.join(dir, 'SPRINT_QUESTIONS.md'), [
    '## 2026-01-01 — Q901. A synthetic still-open question',
    '',
    '**Status: OPEN, undecided.** Fixture only.',
    '',
    '## 2026-01-01 — Q902. A synthetic question closed by a later heading',
    '',
    '**Status: OPEN, undecided.** Fixture only -- superseded below.',
    '',
    '## 2026-01-02 — Q902 CLOSED: the fixture ratifies its own choice',
    '',
    'Closed via the heading shortcut, not a body Status line.',
    '',
    '## 2026-01-01 — Q903. A synthetic question whose status line leads with DECIDED but corrects to open in its own body',
    '',
    '**Status: DECIDED 2026-01-01 (fixture) -- does not actually apply.**',
    'This entry exists to pin a real parser limitation: everything after this',
    'first bold Status marker, including a correction back to OPEN, is',
    'invisible to questionStatuses(). Not covered by this decision; remains',
    'genuinely undecided.',
    '',
  ].join('\n'));
  return dir;
}

test('8.5, parser behaviour pinned independently of live data: OPEN body, CLOSED-heading shortcut, and DECIDED-then-corrected all read as the parser actually reads them', () => {
  const root = questionStatusesFixture(fs.mkdtempSync(path.join(os.tmpdir(), 'q-statuses-fixture-')));
  try {
    const statuses = reg.questionStatuses(root);
    assert.equal(statuses.Q901, 'open', 'a plain OPEN status line reads as open');
    assert.equal(statuses.Q902, 'closed', 'a later "Qn CLOSED" heading overrides an earlier OPEN body');
    assert.equal(statuses.Q903, 'other: DECIDED 2026-01-01 (fixture) -- does not actually apply.', 'CONTROL, the known limitation: a status line that leads with DECIDED and only corrects to OPEN later in its own body is NOT read as open -- lead every status line with its true current state');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('8.6: every audit ID family the register carries is reachable from a committed, non-archive document', () => {
  const unreachable = FRESH.families.filter((f) => f.reachableFromCommittedDocument === false).map((f) => f.family);
  assert.deepEqual(unreachable, []);
  assert.deepEqual(COMMITTED.families, FRESH.families, 'the committed reachability matches a fresh measurement');
  assert.ok(FRESH.families.length >= 15, 'CONTROL: the families were found: ' + FRESH.families.map((f) => f.family).join(' '));
  const seeded = reg.familyReachability(ROOT, ['ZQXNOSUCHFAMILY'])[0];
  // D12: this used to be skipped whenever committedFiles was null -- which is every extraction.
  assert.ok(['committed', 'shipped'].includes(seeded.provenance), 'reachability here must have a known provenance, not a skip: ' + JSON.stringify(seeded));
  assert.equal(seeded.committedFiles, 0, 'CONTROL: a family nothing mentions is reported unreachable, not assumed reachable');
});

/*
 * D12 (S4 instrument review; external instrument audit, 2026-09-13).
 * familyReachability() read `git ls-files`, so outside a git checkout it read
 * nothing: in the extracted package every family came back unknown and 8.6
 * failed, while the function's comment promised that everything present would
 * count as shipped. That promise would have been the wrong repair too --
 * dependencies, scratch output and evidence copies are also present. An
 * extraction's shipped set is what its manifest lists, and only when every
 * listed file is present with its listed hash. These witnesses were observed
 * failing against the unrepaired function.
 */
function extractionFixture(dir) {
  const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  write('docs/guide.md', 'This guide covers finding ZQX-1.\n');
  write('scratch-note.md', 'An unlisted scratch note that mentions ZQY-1.\n');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'docs/guide.md'))).digest('hex');
  write('SHA256_MANIFEST.txt', [
    '# SHA-256 of every file in this package.',
    '# The manifest itself is NOT listed: it cannot contain its own hash.',
    '# Built from commit: 0000000000000000000000000000000000000000',
    '# Files: 1',
    '',
    hash + '  docs/guide.md',
    '',
  ].join('\n'));
  return dir;
}

test('8.6 / D12: an extraction\'s shipped set is what its verified manifest lists -- an unlisted scratch note does not count', () => {
  const root = extractionFixture(fs.mkdtempSync(path.join(os.tmpdir(), 'd12-extraction-')));
  try {
    const [listed, unlisted] = reg.familyReachability(root, ['ZQX', 'ZQY']);
    assert.equal(listed.provenance, 'shipped', JSON.stringify(listed));
    assert.equal(listed.committedFiles, 1, 'a family named in a listed document is reachable');
    assert.equal(unlisted.committedFiles, 0, 'a family named only in an unlisted scratch note is not');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('8.6 / D12: a corrupted, removed or unlisted reference, or a missing or miscounted manifest, leaves provenance unknown -- never assumed', () => {
  const cases = [
    ['a listed document is corrupted', (dir) => { fs.appendFileSync(path.join(dir, 'docs/guide.md'), 'tampered\n'); }, /docs\/guide\.md does not match its listed hash/],
    ['the only authoritative reference is removed', (dir) => { fs.rmSync(path.join(dir, 'docs/guide.md')); }, /docs\/guide\.md is listed but absent/],
    ['the manifest is missing', (dir) => { fs.rmSync(path.join(dir, 'SHA256_MANIFEST.txt')); }, /SHA256_MANIFEST\.txt is absent/],
    ['the manifest miscounts', (dir) => {
      const p = path.join(dir, 'SHA256_MANIFEST.txt');
      fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('# Files: 1', '# Files: 2'));
    }, /declares 2 files but lists 1/],
    ['a listed path escapes the package', (dir) => {
      const p = path.join(dir, 'SHA256_MANIFEST.txt');
      fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('  docs/guide.md', '  ../docs/guide.md'));
    }, /outside the package/],
  ];
  for (const [label, damage, reason] of cases) {
    const root = extractionFixture(fs.mkdtempSync(path.join(os.tmpdir(), 'd12-damaged-')));
    try {
      damage(root);
      const r = reg.familyReachability(root, ['ZQX'])[0];
      assert.equal(r.provenance, 'unknown', label + ': ' + JSON.stringify(r));
      assert.equal(r.committedFiles, null, label + ': an unknown provenance reports no count, not zero');
      assert.match(String(r.provenanceProblem), reason, label);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('8.6 / D12: an extraction nested inside another git repository does not take that repository as its identity', (t) => {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'd12-outer-repo-'));
  try {
    const init = spawnSync('git', ['init', '-q'], { cwd: outer, encoding: 'utf8' });
    if (init.status !== 0) t.diagnostic('git is unavailable here, so the nested case reduces to a plain extraction');
    const inner = extractionFixture(path.join(outer, 'package'));
    const r = reg.familyReachability(inner, ['ZQX'])[0];
    assert.equal(r.provenance, 'shipped', 'the enclosing repository tracks none of these files and is not this package: ' + JSON.stringify(r));
    assert.equal(r.committedFiles, 1);
  } finally {
    fs.rmSync(outer, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 8.7: the closeout check, on its three seeded items
// ---------------------------------------------------------------------------

const full = (overrides) => Object.assign({
  id: 'SEED', kind: 'unguarded-behaviour', severity: 'high', owner: 'S5 session', downstreamTask: 'S5b task 3 re-harvest',
  deadline: 'S5b task 3', blockingConsumer: 'rebuild acceptance',
}, overrides);

/* A reviewed task map for these tests -- NOT the plan's map. Its dependency
   edges are deliberately sparse, so an order the IDs merely sort into can be
   told apart from an order that is stated (S4-IR-02). */
const TASK_MAP = {
  formatVersion: 1,
  about: 'test fixture',
  review: { status: 'reviewed', reviewedBy: 'fixture', reviewedOn: '2026-09-13' },
  phases: [
    { id: 'S5', after: [], source: 'fixture' },
    { id: 'S5b', after: ['S5'], source: 'fixture' },
    { id: 'S6', after: ['S5b'], source: 'fixture' },
    { id: 'rebuild', after: ['S6'], source: 'fixture' },
  ],
  nodes: [
    { id: 'S5 task 2', phase: 'S5', after: [], source: 'fixture' },
    { id: 'S5 task 2i', phase: 'S5', after: [], partOf: 'S5 task 2', source: 'fixture' },
    { id: 'S5 task 4', phase: 'S5', after: [], source: 'fixture' },
    { id: 'S5 task 5', phase: 'S5', after: ['S5 task 4'], source: 'fixture' },
    { id: 'S5b task 3', phase: 'S5b', after: [], source: 'fixture' },
    { id: 'S5b task 3.4', phase: 'S5b', after: [], partOf: 'S5b task 3', source: 'fixture' },
    { id: 'S5b task 4', phase: 'S5b', after: ['S5b task 3'], source: 'fixture' },
    { id: 'S6 task 7', phase: 'S6', after: [], source: 'fixture' },
    { id: 'rebuild', phase: 'rebuild', after: [], source: 'fixture' },
  ],
};
const withMap = { taskMap: TASK_MAP };

test('8.7 acceptance: an unmapped audit ID, a coupled-only guard and an owner-only decision each refuse an unqualified completion claim', () => {
  const seeds = [
    { id: 'SEED-UNMAPPED-01', kind: 'unguarded-behaviour', severity: 'UNASSIGNED', owner: 'UNASSIGNED', downstreamTask: 'UNASSIGNED', deadline: 'UNASSIGNED' },
    { id: 'SEED-COUPLED-01', kind: 'coupled-only-guard', severity: 'medium', owner: 'UNASSIGNED', downstreamTask: 'UNASSIGNED', deadline: 'UNASSIGNED' },
    { id: 'SEED-DECISION-01', kind: 'unresolved-decision', severity: 'high', owner: 'the owner', downstreamTask: 'UNASSIGNED', deadline: 'UNASSIGNED' },
  ];
  const r = closeout.evaluate(seeds);
  assert.equal(r.verdict, 'REFUSED');
  assert.deepEqual(r.refused.map((x) => x.id), seeds.map((s) => s.id), 'each seeded item is refused by name');
  assert.ok(r.refused.find((x) => x.id === 'SEED-DECISION-01').reasons.some((m) => /missing downstreamTask, deadline/.test(m)), '"owner assigned" alone is not enough');
});

test('8.7 acceptance: documented carry-forward is accepted only under the deadline rule', () => {
  const carried = [full({ id: 'A' }), full({ id: 'B', kind: 'coupled-only-guard', severity: 'medium' }), full({ id: 'C', kind: 'unresolved-decision', determinesS4Instrument: false })];
  assert.equal(closeout.evaluate(carried, withMap).verdict, 'COMPLETE_WITH_CARRY_FORWARD');
  assert.equal(closeout.evaluate([], withMap).verdict, 'COMPLETE', 'no open items: an unqualified completion');
  const cases = [
    [full({ deadline: 'someday' }), /does not name an S5, S5b or S6 task/],
    [full({ blockingConsumer: undefined }), /name the consumer that blocks/],
    [full({ severity: 'urgent' }), /severity "urgent"/],
    [full({ kind: 'unresolved-decision', determinesS4Instrument: true }), /must be resolved before the instrument is accepted/],
  ];
  for (const [item, reason] of cases) {
    const r = closeout.evaluate([item], withMap);
    assert.equal(r.verdict, 'REFUSED', JSON.stringify(item));
    assert.ok(r.refused[0].reasons.some((m) => reason.test(m)), JSON.stringify(r.refused[0].reasons));
  }
});

test('8.7: the register\'s own open items are judged by the closeout check, and today they are refused -- owners and deadlines are not the tool\'s to invent', () => {
  const open = FRESH.requirements.filter((r) => r.open).map((r) => r.open);
  const r = closeout.evaluate(open);
  if (open.length === 0) assert.equal(r.verdict, 'COMPLETE');
  else {
    assert.equal(r.verdict, 'REFUSED');
    assert.equal(r.refused.length, open.length);
  }
});

// ---------------------------------------------------------------------------
// S4-IR-02 (external instrument audit, 2026-09-13): refuse what cannot be
// established
// ---------------------------------------------------------------------------
/*
 * The audit reproduced four false acceptances. evaluate(undefined) and
 * evaluate(null) returned COMPLETE. An item whose owner was false, downstream
 * task {}, blocking consumer false and deadline "S6 task DOES_NOT_EXIST" was
 * accepted as carry-forward. determinesS4Instrument: 'true' -- a string --
 * slipped past the instrument rule. Two entries sharing an id were accepted
 * twice. One cause each time: a field counted as assigned when String(value)
 * was non-empty, and a deadline when it matched a prefix.
 *
 * Witnesses marked NEW exercise the entry point this repair adds; before it
 * they had only a missing function to fail against. Every other witness was
 * observed failing against the unrepaired check. CONTROL passed before and after.
 */

const decided = (overrides) => full(Object.assign({ kind: 'unresolved-decision', determinesS4Instrument: false }, overrides));
const reasonsOf = (r) => (r.refused && r.refused[0] ? r.refused[0].reasons : []);
const refusedFor = (item, reason, label) => {
  let r;
  assert.doesNotThrow(() => { r = closeout.evaluate([item], withMap); }, label + ': threw');
  assert.equal(r.verdict, 'REFUSED', label + ': ' + JSON.stringify(r));
  assert.ok(reasonsOf(r).some((m) => reason.test(m)), label + ': ' + JSON.stringify(reasonsOf(r)));
};

test('IR-02: a missing, null or scalar inventory is INVALID -- never COMPLETE; an explicitly empty array is COMPLETE for that inventory only', () => {
  for (const bad of [undefined, null, 0, 'items', {}, true]) {
    let r;
    assert.doesNotThrow(() => { r = closeout.evaluate(bad, withMap); }, JSON.stringify(bad) + ' threw');
    assert.equal(r.verdict, 'INVALID', JSON.stringify(bad) + ': ' + JSON.stringify(r));
    assert.ok(Array.isArray(r.errors) && r.errors.length > 0, 'an INVALID verdict must say why');
  }
  assert.equal(closeout.evaluate([], withMap).verdict, 'COMPLETE',
    'CONTROL: whether an empty inventory is the WHOLE inventory is the entry point\'s question, witnessed below');
});

test('IR-02: a null or scalar item, a hole, an unusable id or a duplicate id makes the inventory INVALID, and names where', () => {
  const holed = [full({ id: 'A' })];
  holed[2] = full({ id: 'B' });
  const cases = [
    [[full({ id: 'A' }), null], /inventory\[1\] is null/],
    [[full({ id: 'A' }), 7], /inventory\[1\] is a number/],
    [holed, /inventory\[1\] is a hole/],
    [[full({ id: '  ' })], /inventory\[0\] has no usable id/],
    [[full({ id: 'A' }), full({ id: 'A' })], /duplicate id "A" at inventory\[0\], \[1\]/],
  ];
  for (const [items, reason] of cases) {
    let r;
    assert.doesNotThrow(() => { r = closeout.evaluate(items, withMap); }, String(reason) + ': threw');
    assert.equal(r.verdict, 'INVALID', String(reason) + ': ' + JSON.stringify(r));
    assert.ok(r.errors.some((m) => reason.test(m)), JSON.stringify(r.errors));
  }
});

test('IR-02: an assignment that is not a real string -- false, an object, a number, whitespace or a placeholder -- is refused', () => {
  refusedFor(full({ owner: false }), /owner must be a string, got boolean/, 'owner false');
  refusedFor(full({ downstreamTask: {} }), /downstreamTask must be a string, got object/, 'downstreamTask {}');
  refusedFor(full({ blockingConsumer: false }), /blockingConsumer must be a string, got boolean/, 'blockingConsumer false');
  refusedFor(full({ severity: 7 }), /severity must be a string, got number/, 'severity 7');
  for (const placeholder of ['', '   ', 'UNASSIGNED', ' unassigned ', 'TBD', 'tba', 'n/a', 'N/A', '—', '?', 'none', 'unknown', 'pending']) {
    refusedFor(full({ owner: placeholder }), /missing owner/, 'owner ' + JSON.stringify(placeholder));
  }
  refusedFor(full({ owner: false, downstreamTask: {}, blockingConsumer: false, deadline: 'S6 task DOES_NOT_EXIST' }), /owner must be a string/, 'the audit\'s probe, all four at once');
});

test('IR-02: an unresolved decision must say, as true or false, whether it determines how an S4 instrument works -- and true is refused even when fully scheduled', () => {
  const noFlag = decided();
  delete noFlag.determinesS4Instrument;
  refusedFor(noFlag, /must say, as true or false, whether it determines how an S4 instrument works/, 'absent');
  for (const flag of ['true', 'false', 1, 0, null]) {
    refusedFor(decided({ determinesS4Instrument: flag }), /determinesS4Instrument must be true or false/, JSON.stringify(flag));
  }
  refusedFor(decided({ determinesS4Instrument: true }), /must be resolved before the instrument is accepted/, 'true');
  assert.equal(closeout.evaluate([decided()], withMap).verdict, 'COMPLETE_WITH_CARRY_FORWARD', 'CONTROL: false, fully scheduled');
});

test('IR-02: a task, deadline or consumer that the reviewed task map does not contain is refused', () => {
  refusedFor(full({ downstreamTask: 'S5 task 99' }), /downstreamTask "S5 task 99" is not a task or gate in the reviewed task map/, 'unknown downstream task');
  refusedFor(full({ deadline: 'S6 task DOES_NOT_EXIST' }), /does not name an S5, S5b or S6 task/, 'deadline grammar');
  refusedFor(full({ deadline: 'S6 task 99' }), /deadline "S6 task 99" does not name an S5, S5b or S6 task in the reviewed task map/, 'unknown deadline');
  refusedFor(full({ deadline: 'rebuild' }), /does not name an S5, S5b or S6 task/, 'the rebuild is a consumer, not a deadline');
  refusedFor(full({ blockingConsumer: 'the rebuild, eventually' }), /blockingConsumer "the rebuild, eventually" is not a task or gate in the reviewed task map/, 'unknown consumer');
});

test('IR-02: a deadline must come before its consumer, and the work by its deadline -- by stated dependency, not by how the IDs sort', () => {
  refusedFor(full({ deadline: 'S5b task 4', blockingConsumer: 'S5b task 3' }), /deadline "S5b task 4" does not come before its blocking consumer "S5b task 3"/, 'after, within a sprint');
  refusedFor(full({ downstreamTask: 'S6 task 7', deadline: 'S6 task 7', blockingConsumer: 'S5b task 4' }), /does not come before its blocking consumer/, 'a later sprint');
  refusedFor(full({ deadline: 'S5b task 3', blockingConsumer: 'S5b task 3' }), /does not come before its blocking consumer/, 'the consumer itself');
  refusedFor(full({ downstreamTask: 'S5 task 2', deadline: 'S5 task 2', blockingConsumer: 'S5 task 4' }), /does not come before its blocking consumer/, 'sorts first, but nothing states it');
  refusedFor(full({ downstreamTask: 'S6 task 7', deadline: 'S5b task 3' }), /downstreamTask "S6 task 7" does not land by its deadline "S5b task 3"/, 'work after its deadline');
  for (const item of [
    full({ downstreamTask: 'S5 task 4', deadline: 'S5 task 4', blockingConsumer: 'S5 task 5' }),
    full({ downstreamTask: 'S5 task 2i', deadline: 'S5b task 3.4', blockingConsumer: 'S5b task 4' }),
    full({ downstreamTask: 'S5b task 3.4', deadline: 'S5b task 3', blockingConsumer: 'rebuild' }),
  ]) {
    assert.equal(closeout.evaluate([item], withMap).verdict, 'COMPLETE_WITH_CARRY_FORWARD', 'CONTROL: ' + JSON.stringify(item));
  }
});

test('IR-02: without a reviewed task map nothing is carried forward, and a malformed map is an INVALID source', () => {
  const noMap = closeout.evaluate([full()]);
  assert.equal(noMap.verdict, 'REFUSED');
  assert.ok(reasonsOf(noMap).some((m) => /no reviewed task map/.test(m)), JSON.stringify(reasonsOf(noMap)));
  const unreviewed = JSON.parse(JSON.stringify(TASK_MAP));
  unreviewed.review.status = 'unreviewed';
  const u = closeout.evaluate([full()], { taskMap: unreviewed });
  assert.equal(u.verdict, 'REFUSED');
  assert.ok(reasonsOf(u).some((m) => /has not been reviewed/.test(m)), JSON.stringify(reasonsOf(u)));
  for (const [label, edit, reason] of [
    ['a dependency cycle', (m) => { m.nodes.find((n) => n.id === 'S5 task 4').after = ['S5 task 5']; }, /cycle/],
    ['an unknown phase', (m) => { m.nodes[0].phase = 'S7'; }, /unknown phase "S7"/],
    ['a dependency on a task that is not in the map', (m) => { m.nodes[0].after = ['S5 task 404']; }, /"S5 task 404"/],
    ['a dependency that contradicts the phase order', (m) => { m.nodes.find((n) => n.id === 'S5 task 4').after = ['S6 task 7']; }, /phase order/],
    ['a duplicate task', (m) => { m.nodes.push(Object.assign({}, m.nodes[0])); }, /duplicate/],
    ['a task with no source', (m) => { delete m.nodes[0].source; }, /source/],
  ]) {
    const bad = JSON.parse(JSON.stringify(TASK_MAP));
    edit(bad);
    const r = closeout.evaluate([full()], { taskMap: bad });
    assert.equal(r.verdict, 'INVALID', label + ': ' + JSON.stringify(r));
    assert.ok(r.errors.some((m) => reason.test(m)), label + ': ' + JSON.stringify(r.errors));
  }
});

const generatedFixture = () => ({
  register: { requirements: [
    { id: 'DECISION-FIXTURE-A', open: { id: 'DECISION-FIXTURE-A', kind: 'unresolved-decision', severity: 'UNASSIGNED', owner: 'UNASSIGNED', downstreamTask: 'UNASSIGNED', deadline: 'UNASSIGNED' } },
    { id: 'FIXTURE-REQ-A' },
  ] },
  classification: { coupledOnly: [
    { id: 'COUPLED-ONLY-FIXTURE-A', kind: 'coupled-only-guard', requirement: 'FIXTURE-REQ-A', testLevel: 'coupled', severity: 'UNASSIGNED', owner: 'UNASSIGNED', downstreamTask: 'UNASSIGNED', deadline: 'UNASSIGNED' },
  ] },
});
const SCHEDULE = { formatVersion: 1, entries: [
  { id: 'DECISION-FIXTURE-A', severity: 'high', owner: 'S5 session', downstreamTask: 'S5 task 2i', deadline: 'S5 task 2i', blockingConsumer: 'S5b task 3', determinesS4Instrument: false, basis: 'fixture: a recorded decision' },
  { id: 'COUPLED-ONLY-FIXTURE-A', severity: 'high', owner: 'S5 session', downstreamTask: 'S5 task 2', deadline: 'S5b task 3.4', blockingConsumer: 'rebuild', basis: 'fixture: a recorded decision' },
] };

test('IR-02 NEW: the entry point joins handwritten scheduling onto the generated registers by id, so regenerating them loses no assignment', () => {
  const first = closeout.assembleInventory(Object.assign(generatedFixture(), { schedule: SCHEDULE }));
  assert.deepEqual(first.errors, []);
  assert.deepEqual(first.items.map((i) => [i.id, i.owner, i.deadline]), [['DECISION-FIXTURE-A', 'S5 session', 'S5 task 2i'], ['COUPLED-ONLY-FIXTURE-A', 'S5 session', 'S5b task 3.4']]);
  // A rebuild of either register writes UNASSIGNED again; the schedule is a separate file that no rebuild touches.
  const regenerated = closeout.assembleInventory(Object.assign(generatedFixture(), { schedule: SCHEDULE }));
  assert.deepEqual(regenerated.items, first.items);
  assert.equal(closeout.evaluate(regenerated.items, withMap).verdict, 'COMPLETE_WITH_CARRY_FORWARD');
  assert.equal(generatedFixture().register.requirements[0].open.owner, 'UNASSIGNED', 'premise: the generated record itself carries no assignment');
});

test('IR-02 NEW: a newly discovered open item with no schedule entry is refused; a stale, unsourced or contradicting schedule entry is an INVALID source', () => {
  const grown = generatedFixture();
  grown.register.requirements.push({ id: 'DECISION-FIXTURE-NEW', open: { id: 'DECISION-FIXTURE-NEW', kind: 'unresolved-decision', severity: 'UNASSIGNED', owner: 'UNASSIGNED', downstreamTask: 'UNASSIGNED', deadline: 'UNASSIGNED' } });
  const a = closeout.assembleInventory(Object.assign(grown, { schedule: SCHEDULE }));
  assert.deepEqual(a.errors, []);
  const r = closeout.evaluate(a.items, withMap);
  assert.equal(r.verdict, 'REFUSED');
  assert.deepEqual(r.refused.map((x) => x.id), ['DECISION-FIXTURE-NEW'], 'only the unscheduled newcomer is refused');

  const variants = [
    ['stale', (s) => { s.entries.push(Object.assign({}, s.entries[0], { id: 'DECISION-FIXTURE-STALE' })); }, /DECISION-FIXTURE-STALE.*no generated register carries it/],
    ['unsourced', (s) => { delete s.entries[0].basis; }, /DECISION-FIXTURE-A.*basis/],
    ['contradicting kind', (s) => { s.entries[0].kind = 'coupled-only-guard'; }, /DECISION-FIXTURE-A.*kind/],
    ['duplicate', (s) => { s.entries.push(Object.assign({}, s.entries[0])); }, /DECISION-FIXTURE-A.*more than once/],
  ];
  for (const [label, edit, reason] of variants) {
    const schedule = JSON.parse(JSON.stringify(SCHEDULE));
    edit(schedule);
    const errors = closeout.assembleInventory(Object.assign(generatedFixture(), { schedule })).errors;
    assert.ok(errors.some((m) => reason.test(m)), label + ': ' + JSON.stringify(errors));
  }

  const handwritten = JSON.parse(JSON.stringify(SCHEDULE));
  handwritten.entries.push({ id: 'LIMIT-ONE-MACHINE', origin: 'handwritten', kind: 'execution-path-limitation', severity: 'low', owner: 'S6 session', downstreamTask: 'S6 task 7', deadline: 'S6 task 7', blockingConsumer: 'rebuild', basis: 'fixture: a recorded limitation' });
  const h = closeout.assembleInventory(Object.assign(generatedFixture(), { schedule: handwritten }));
  assert.deepEqual(h.errors, []);
  assert.ok(h.items.some((i) => i.id === 'LIMIT-ONE-MACHINE' && i.kind === 'execution-path-limitation'), 'a handwritten item joins the inventory');
  assert.equal(closeout.evaluate(h.items, withMap).verdict, 'COMPLETE_WITH_CARRY_FORWARD');
});

test('IR-02 NEW: the entry point reads every source it needs, and a deleted one is INVALID -- never COMPLETE', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'closeout-fixture-'));
  try {
    const g = generatedFixture();
    const contents = { register: g.register, classification: g.classification, schedule: SCHEDULE, taskMap: TASK_MAP };
    const writeAll = () => Object.entries(closeout.SOURCES).forEach(([key, rel]) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), JSON.stringify(contents[key]));
    });
    writeAll();
    assert.equal(closeout.runCloseout(root).verdict, 'COMPLETE_WITH_CARRY_FORWARD', 'CONTROL: every source present');
    for (const rel of Object.values(closeout.SOURCES)) {
      fs.rmSync(path.join(root, rel));
      const r = closeout.runCloseout(root);
      assert.equal(r.verdict, 'INVALID', rel + ' deleted: ' + JSON.stringify(r));
      assert.ok(r.errors.some((m) => m.includes(rel)), rel + ': the error must name the missing source: ' + JSON.stringify(r.errors));
      writeAll();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('IR-02: the entry point over this repository never claims an unqualified completion while the generated registers carry open items', (t) => {
  const classification = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'test-classification.json'), 'utf8'));
  const open = FRESH.requirements.filter((r) => r.open).length + classification.coupledOnly.length;
  const r = closeout.runCloseout(ROOT);
  t.diagnostic('closeout over the repository: ' + r.verdict + ' | ' + JSON.stringify(r.counts || {}) + ' | ' + (r.errors || []).slice(0, 3).join('; '));
  if (open > 0) assert.notEqual(r.verdict, 'COMPLETE');
});
