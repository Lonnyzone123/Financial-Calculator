'use strict';

/*
 * S4 task 8 -- the requirements register.
 *
 * Every `/* FM-07 ... *\/`-style comment in src/engine.js and the bundled debt
 * modules is a behavioural requirement with its provenance attached, and every
 * test that names it is that requirement stated independently of the code.
 * Together they are the specification a rebuild must satisfy. This harvests
 * them, maps each to what guards it, and records what becomes of it.
 *
 * THE REAL OUTPUT IS THE UNGUARDED COUNT: the behaviours a rebuild could lose
 * without any test noticing.
 *
 * WHAT "GUARDED" MEANS HERE, stated so it is not over-read:
 *   GUARDED_BY_TEST_NAME  a test's own title names the ID
 *   CITED_IN_TEST_FILE    a test file mentions the ID, but no test title does
 *   UNGUARDED             no test file mentions it at all
 * A citation is evidence that someone wrote a test ABOUT the requirement. It is
 * not proof the test still exercises the behaviour, and it says nothing about
 * whether that test is coupled to the implementation -- that classification is
 * task 9.4's.
 *
 *   node tools/requirements-register.js build [--write]
 *   node tools/requirements-register.js check      (exit 1 when the committed register drifts)
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const REGISTER_PATH = path.join(ROOT, 'tools', 'requirements-register.json');

/* The ID grammar, measured over the corpus on 2026-09-13 rather than assumed:
 * hyphenated audit IDs (FM-07, R2-003, CR2-05, S3-08, P5-01, D-1), with a
 * lowercase sub-item letter a-d (CQ-5a, RC-05b). A trailing "s" is a plural
 * and is dropped ("HR-02s" is HR-02). Bare register IDs: questions (Q38), and
 * decision-register entries (P19) only where the comment names the register.
 * Hyphenated tokens that are units or standards are not audit IDs. */
const HYPHENATED = /\b([A-Z][A-Z0-9]{0,4})-(\d{1,3})([a-d]|s)?\b/g;
/* S5AA F-04: TWO DIGITS WAS A CEILING NOBODY MEANT TO SET. This read /\b(Q\d{2})\b/ -- exactly two
   digits -- so every question numbered 100 or above was invisible to the register. Measured before
   the change: 29 of 29 two-digit ids cited in engine comments were carried, and 0 of 6 three-digit
   ones. Six landed S5AA repairs could not be reported unguarded or trigger COUPLED-ONLY, because the
   register could not see them at all -- the repairs were guarded, the bookkeeping was blind.
   Widening this harvests every Q100+ citation in one step, so the register's ID set jumps once. A
   deliberate instrument change, made on the owner's decision of 2026-09-20, and tools/ is the plan owner's,
   so it is relayed to them rather than done silently. */
const QUESTION = /\b(Q\d{2,3})\b/g;
const DECISION = /\b(P\d{1,2})\b/g;
const AUDIT_TASK = /\b(T0\d)\b/g;
const NOT_AUDIT = new Set(['UTF', 'SHA', 'ISO', 'ES', 'IEEE', 'RFC', 'CVE', 'UTC', 'AES', 'MD', 'W']);

function idsIn(text) {
  const ids = new Set();
  let m;
  HYPHENATED.lastIndex = 0;
  while ((m = HYPHENATED.exec(text))) {
    if (NOT_AUDIT.has(m[1])) continue;
    ids.add(m[1] + '-' + m[2] + (m[3] && m[3] !== 's' ? m[3] : ''));
  }
  QUESTION.lastIndex = 0;
  while ((m = QUESTION.exec(text))) ids.add(m[1]);
  if (/decision register/i.test(text)) {
    DECISION.lastIndex = 0;
    while ((m = DECISION.exec(text))) ids.add(m[1]);
  }
  if (/audit task|AUD-\d/i.test(text)) {
    AUDIT_TASK.lastIndex = 0;
    while ((m = AUDIT_TASK.exec(text))) ids.add(m[1]);
  }
  return [...ids].sort();
}

const familyOf = (id) => (id.includes('-') ? id.slice(0, id.indexOf('-')) : id.replace(/\d+$/, ''));

function sourceFiles(root) {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const { BUNDLED_MODULES } = require(path.join(root, 'build.js'));
  return ['src/engine.js'].concat(BUNDLED_MODULES.map((m) => 'src/' + m.file));
}

function commentBlocks(text) {
  const out = [];
  const re = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
  let m;
  while ((m = re.exec(text))) out.push({ line: text.slice(0, m.index).split('\n').length, text: m[0] });
  return out;
}

const summaryOf = (comment) => comment.replace(/^\/\*+|\*+\/$|^\/\/+/g, '').replace(/^\s*\*\s?/gm, '').replace(/\s+/g, ' ').trim().slice(0, 200);

/* 8.1: every comment block carrying an ID, and every ID with its sites. */
function harvest(root) {
  const blocks = [];
  for (const file of sourceFiles(root)) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const c of commentBlocks(text)) {
      const ids = idsIn(c.text);
      if (ids.length) blocks.push({ file, line: c.line, ids, summary: summaryOf(c.text) });
    }
  }
  const byId = new Map();
  blocks.forEach((b) => b.ids.forEach((id) => {
    if (!byId.has(id)) byId.set(id, { id, family: familyOf(id), sites: [], summary: b.summary });
    byId.get(id).sites.push(b.file + ':' + b.line);
  }));
  return { blocks, requirements: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}

function testCorpus(root) {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) {
        if (!(dir === 'tests' && (e.name === 'lib' || e.name === 'fixtures'))) walk(rel);
      } else if (/\.js$/.test(e.name)) {
        files.push(rel);
      }
    }
  })('tests');
  const text = new Map(files.sort().map((f) => [f, fs.readFileSync(path.join(root, f), 'utf8')]));
  const titles = [];
  for (const [file, t] of text) {
    const re = /\b(?:test|it)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
    let m;
    while ((m = re.exec(t))) titles.push({ file, title: m[2] });
  }
  return { text, titles };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (id) => new RegExp('(^|[^A-Za-z0-9])' + escapeRe(id) + '(?![A-Za-z0-9])');

/* 8.2: what guards each requirement. */
function guardOf(id, corpus, todoTitles) {
  const re = wordRe(id);
  const named = corpus.titles.filter((t) => re.test(t.title));
  const files = [...corpus.text].filter(([, t]) => re.test(t)).map(([f]) => f);
  const cls = named.length ? 'GUARDED_BY_TEST_NAME' : files.length ? 'CITED_IN_TEST_FILE' : 'UNGUARDED';
  return {
    class: cls,
    tests: named.map((t) => t.file + ' :: ' + t.title),
    files,
    onlyTodo: named.length > 0 && named.every((t) => todoTitles.has(t.title)),
  };
}

/* 8.5: a question's recorded status, read from SPRINT_QUESTIONS.md itself. */
function questionStatuses(root) {
  const file = path.join(root, 'SPRINT_QUESTIONS.md');
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  const status = {};
  const heads = [...text.matchAll(/^## [^\n]*?— (Q\d+)\. [^\n]*$/gm)];
  heads.forEach((h, i) => {
    const body = text.slice(h.index, i + 1 < heads.length ? heads[i + 1].index : text.length);
    const s = body.match(/\*\*Status: ([^*]+)\*\*/);
    const word = s ? s[1].trim() : '';
    status[h[1]] = !s ? 'unrecorded' : /^closed(?! to repair)/i.test(word) ? 'closed' : /^open/i.test(word) ? 'open' : 'other: ' + word.slice(0, 60);
  });
  for (const line of text.match(/^## [^\n]*$/gm) || []) {
    for (const c of line.matchAll(/\b(Q\d+) CLOSED\b/g)) status[c[1]] = 'closed';
  }
  return status;
}

/* 8.4: carried forward, superseded, or needing a decision in the rebuild. */
function dispositionOf(req, guard, questions) {
  if (req.family === 'Q') {
    const s = questions[req.id] || 'unrecorded';
    if (s === 'open') return { disposition: 'needs-decision', basis: req.id + ' is OPEN in SPRINT_QUESTIONS.md' };
    if (s === 'closed') return { disposition: 'carried-forward', basis: req.id + ' is CLOSED in SPRINT_QUESTIONS.md; the requirement carries the decision, it does not reopen it' };
    return { disposition: 'carried-forward', basis: req.id + ' status in SPRINT_QUESTIONS.md: ' + s };
  }
  if (req.family === 'P') return { disposition: 'carried-forward', basis: 'a decision-register entry: settled' };
  if (guard.onlyTodo) return { disposition: 'needs-decision', basis: 'guarded only by todo witnesses (tools/test-exception-registry.json)' };
  return { disposition: 'carried-forward', basis: 'no closure or open decision recorded against it' };
}

/* 8.7's fields, carried on every item that can block a completion claim. Owners
   and deadlines are plan decisions, so this tool never invents them. */
const OPEN_FIELDS = { severity: 'UNASSIGNED', owner: 'UNASSIGNED', downstreamTask: 'UNASSIGNED', deadline: 'UNASSIGNED' };

function trackedFiles(root) {
  try {
    const out = require('node:child_process').execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 });
    const top = require('node:child_process').execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (path.resolve(top) !== path.resolve(root)) return null;
    return out.split('\0').filter(Boolean);
  } catch (e) {
    return null;
  }
}

const MANIFEST = 'SHA256_MANIFEST.txt';

/* An extracted package's shipped set: the files its manifest lists -- and only
   when the manifest is well formed and every listed file is present, inside the
   package, with its listed SHA-256. Anything else present (dependencies, scratch
   output, evidence copies) is not shipped. Returns { files } or { problem }. */
function shippedFiles(root) {
  let text;
  try { text = fs.readFileSync(path.join(root, MANIFEST), 'utf8'); } catch (e) { return { problem: MANIFEST + ' is absent' }; }
  const declared = /^# Files: (\d+)\s*$/m.exec(text);
  if (!declared) return { problem: MANIFEST + ' declares no file count' };
  const entries = text.split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => /^([0-9a-f]{64}) {2}(\S.*)$/.exec(l));
  if (entries.some((m) => !m)) return { problem: MANIFEST + ' has a line that is not "<sha256>  <path>"' };
  if (entries.length !== Number(declared[1])) return { problem: MANIFEST + ' declares ' + declared[1] + ' files but lists ' + entries.length };
  const crypto = require('node:crypto');
  for (const [, hash, rel] of entries) {
    if (path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || rel.split(/[\\/]/).includes('..')) return { problem: rel + ' points outside the package' };
    let bytes;
    try { bytes = fs.readFileSync(path.join(root, rel)); } catch (e) { return { problem: rel + ' is listed but absent' }; }
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== hash) return { problem: rel + ' does not match its listed hash' };
  }
  return { files: entries.map((m) => m[2]) };
}

/* 8.6: is each family reachable from a committed, non-archive document?
   Provenance is stated, never assumed (D12). In a git checkout the set is git's
   tracked files ("committed"). In an extracted package it is what the verified
   manifest lists ("shipped") -- the same files, cut from a commit, less the
   manifest itself. Otherwise it is "unknown": committedFiles is null and
   provenanceProblem says why. This used to promise that "everything present is
   the shipped set" and did not implement it, so every extraction was unknown. */
function familyReachability(root, families) {
  const tracked = trackedFiles(root);
  const shipped = tracked ? null : shippedFiles(root);
  const set = tracked || (shipped && shipped.files) || null;
  const provenance = tracked ? 'committed' : set ? 'shipped' : 'unknown';
  const provenanceProblem = set ? null : shipped.problem;
  const files = (set || []).filter((f) => !f.startsWith('archive/') && /\.(md|js|json|txt|html)$/.test(f));
  const texts = files.map((f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { return ''; } });
  return families.map((family) => {
    const re = new RegExp('(^|[^A-Za-z0-9])' + escapeRe(family) + (family === 'Q' || family === 'P' || family === 'T' ? '' : '-') + '\\d');
    const hits = files.filter((f, i) => re.test(texts[i]));
    return { family, committedFiles: set ? hits.length : null, examples: hits.slice(0, 3), provenance, provenanceProblem };
  });
}

function build(root) {
  const base = root || ROOT;
  const { blocks, requirements } = harvest(base);
  const corpus = testCorpus(base);
  const exceptionsPath = path.join(base, 'tools', 'test-exception-registry.json');
  const exceptions = fs.existsSync(exceptionsPath) ? JSON.parse(fs.readFileSync(exceptionsPath, 'utf8')) : {};
  const todoTitles = new Set(JSON.stringify(exceptions).match(/"(?:name|title|identity)"\s*:\s*"([^"]+)"/g) ? [...JSON.stringify(exceptions).matchAll(/"(?:name|title|identity)"\s*:\s*"([^"]+)"/g)].map((m) => m[1]) : []);
  const questions = questionStatuses(base);
  const rows = requirements.map((req) => {
    const guard = guardOf(req.id, corpus, todoTitles);
    const d = dispositionOf(req, guard, questions);
    const row = Object.assign({}, req, { guard, disposition: d.disposition, dispositionBasis: d.basis });
    if (guard.class === 'UNGUARDED' || d.disposition === 'needs-decision') row.open = Object.assign({ id: req.id, kind: guard.class === 'UNGUARDED' ? 'unguarded-behaviour' : 'unresolved-decision' }, OPEN_FIELDS);
    return row;
  });
  const count = (pred) => rows.filter(pred).length;
  const families = [...new Set(rows.map((r) => r.family))].sort();
  return {
    formatVersion: 1,
    about: 'S4 task 8: every audit-fix comment in src/engine.js and the bundled debt modules, what guards it, and what becomes of it in a rebuild. Generated by tools/requirements-register.js build --write; tests/requirements-register.test.js holds this file to a fresh harvest. A test naming an ID is evidence of a test ABOUT the requirement, not proof it exercises it; implementation coupling is task 9.4.',
    sources: sourceFiles(base),
    counts: {
      commentBlocksWithIds: blocks.length,
      requirements: rows.length,
      GUARDED_BY_TEST_NAME: count((r) => r.guard.class === 'GUARDED_BY_TEST_NAME'),
      CITED_IN_TEST_FILE: count((r) => r.guard.class === 'CITED_IN_TEST_FILE'),
      UNGUARDED: count((r) => r.guard.class === 'UNGUARDED'),
      carriedForward: count((r) => r.disposition === 'carried-forward'),
      needsDecision: count((r) => r.disposition === 'needs-decision'),
      superseded: count((r) => r.disposition === 'superseded'),
    },
    requirements: rows,
    /* A boolean, not the count behind it. The count of committed files naming a
       family rises whenever any file is committed that mentions it -- including
       this register -- so storing it made the committed register drift on its
       own commit. Reachability changes only when it means something. */
    families: familyReachability(base, families).map((f) => ({ family: f.family, reachableFromCommittedDocument: f.committedFiles === null ? null : f.committedFiles > 0 })),
  };
}

function main(argv) {
  const cmd = argv[0];
  if (cmd === 'build') {
    const register = build(ROOT);
    const text = JSON.stringify(register, null, 1) + '\n';
    if (argv.includes('--write')) fs.writeFileSync(REGISTER_PATH, text);
    console.log(JSON.stringify(register.counts));
    return 0;
  }
  if (cmd === 'check') {
    const fresh = JSON.stringify(build(ROOT), null, 1) + '\n';
    const committed = fs.existsSync(REGISTER_PATH) ? fs.readFileSync(REGISTER_PATH, 'utf8').replace(/\r\n/g, '\n') : '';
    if (fresh === committed) { console.log('requirements register: up to date'); return 0; }
    console.log('requirements register: DRIFTED -- rebuild with `node tools/requirements-register.js build --write` and review the diff');
    return 1;
  }
  console.log('usage: node tools/requirements-register.js build [--write] | check');
  return cmd ? 2 : 0;
}

module.exports = { REGISTER_PATH, idsIn, familyOf, commentBlocks, harvest, testCorpus, guardOf, questionStatuses, dispositionOf, familyReachability, build };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
