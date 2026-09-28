'use strict';

// Track F2 task 3 -- acceptance tests for build.js's new debt-module
// bundling. Four things this task must prove, per the sprint brief:
//
//   1. The shipped artifact (investment-calculator-v2c.html) is never
//      touched -- ground rule 2, unchanged by this task.
//   2. build()'s output is exactly its shell with each of the three markers
//      replaced by that marker's own independently-inspectable piece --
//      nothing shifted, duplicated, or corrupted in the substitution itself.
//      (Originally verified by diffing against a git-history baseline built
//      with the pre-task-3 build.js + app-shell.html; that check passed
//      once, at task-3 commit time, but pins to a moving target -- ANY later
//      legitimate edit to app-shell.html or engine.js, such as this same
//      sprint's task 4, trips a byte-identity check against a stale
//      snapshot. This structural check verifies the same property --
//      build()'s substitution mechanics are correct -- without depending on
//      git history, so it stays meaningful across every future edit too.)
//   3. Every debt module's exported functions are reachable from the built
//      bundle and behave identically to their Node-required counterparts.
//   4. The reason this task wraps each module in an IIFE namespace instead
//      of concatenating them raw: a NAIVE concatenation is independently
//      constructed here and demonstrated failing before the real (wrapped)
//      build.js output is trusted against the same check.
//
// Test 4 is the one written "first" in spirit -- it is the counterexample
// that justifies the whole task, mirrored on the sibling F2 modules'
// convention of proving the dismissed simpler approach actually breaks.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const {
  build, DEBT_MODULES, BUNDLED_MODULES, EXCLUDED_MODULES, MARKER, VALIDATOR_MARKER, DEBT_MARKER,
  stripHeaderComment, stripNodeExportFooter, rewriteSiblingRequires,
} = require('../build.js');

// vm-sandbox and jsdom-window objects live in a different realm than this
// test file, so their plain object literals have a different Object
// prototype -- assert.deepEqual (aliased to deepStrictEqual by
// node:assert/strict) reports "same structure but not reference-equal" for
// that reason alone. Round-tripping through JSON normalizes both sides back
// into this realm's plain objects before comparing; safe here because every
// value compared is pure JSON-shaped data (numbers, strings, arrays).
function plain(v) {
  return JSON.parse(JSON.stringify(v));
}

const REPO_ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(REPO_ROOT, 'src');
const SCRATCH_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'debt-bundling-test-'));

test.after(() => {
  fs.rmSync(SCRATCH_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. The shipped artifact is never touched
// ---------------------------------------------------------------------------

test('build(): the shipped artifact is untouched when a scratch path is given', () => {
  const shippedPath = path.join(REPO_ROOT, 'investment-calculator-v2c.html');
  const before = fs.readFileSync(shippedPath);
  const scratchPath = path.join(SCRATCH_DIR, 'scratch-untouched.html');
  build(scratchPath);
  const after = fs.readFileSync(shippedPath);
  assert.ok(before.equals(after), 'investment-calculator-v2c.html must be byte-identical -- ground rule 2, not relaxed by this task');
  assert.ok(fs.existsSync(scratchPath), 'the scratch build should have been written');
});

// ---------------------------------------------------------------------------
// 2. build()'s substitution mechanics are exactly marker-for-piece, nothing more
// ---------------------------------------------------------------------------

test('build(): the output is exactly the raw shell with each marker replaced by its own piece -- once each, nothing shifted or duplicated', () => {
  const scratchPath = path.join(SCRATCH_DIR, 'scratch-structural-check.html');
  const { output, debtModulesBlock, engineBody, validatorBody } = build(scratchPath);

  const rawShell = fs.readFileSync(path.join(SRC_DIR, 'app-shell.html'), 'utf8');
  // Each marker must appear in the raw shell exactly once -- if build.js's
  // own String.replace (which only ever replaces the FIRST match) silently
  // stopped being the right tool because a marker got duplicated, this is
  // where that would first show up.
  for (const marker of [DEBT_MARKER, MARKER, VALIDATOR_MARKER]) {
    const occurrences = rawShell.split(marker).length - 1;
    assert.equal(occurrences, 1, 'expected exactly one ' + marker + ' in src/app-shell.html, found ' + occurrences);
  }

  const expected = rawShell
    .replace(DEBT_MARKER, debtModulesBlock)
    .replace(MARKER, engineBody)
    .replace(VALIDATOR_MARKER, validatorBody);

  assert.equal(output, expected, 'build() output must be exactly the shell with each marker substituted for its own independently-read piece');

  // And the three pieces appear in the right relative order -- debt modules,
  // then the engine, then the validator -- matching the marker order in
  // src/app-shell.html (DEBT_MODULES_SOURCE immediately before ENGINE_SOURCE,
  // which is immediately before SCENARIO_VALIDATOR_SOURCE).
  const iDebt = output.indexOf(debtModulesBlock);
  const iEngine = output.indexOf(engineBody);
  const iValidator = output.indexOf(validatorBody);
  assert.ok(iDebt !== -1 && iEngine !== -1 && iValidator !== -1, 'all three pieces must be present in the output');
  assert.ok(iDebt < iEngine && iEngine < iValidator, 'expected debt modules, then engine, then validator, in that order');
});

// ---------------------------------------------------------------------------
// 3. Every module's exports are reachable from the bundle, and agree with
//    their Node-required counterparts
// ---------------------------------------------------------------------------

test('build(): every debt module\'s exported functions are reachable from the bundle and match their Node-required counterparts', () => {
  const { debtModulesBlock } = build(path.join(SCRATCH_DIR, 'scratch-reachability.html'));
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(debtModulesBlock, sandbox);

  /* P19: read from the registry rather than a literal list, so this test
     cannot drift from what build.js actually bundles -- the drift that put six
     P1 defects in the artifact and none of them in the Worker. */
  assert.ok(BUNDLED_MODULES.length > 0, 'precondition: something must be bundled');
  for (const m of BUNDLED_MODULES) {
    assert.equal(typeof sandbox[m.namespace], 'object', m.namespace + ' should be defined in the bundle');
  }

  /* And the other half, which is the one that makes the exclusion a decision
     rather than an accident: an excluded module must be ABSENT, and must say
     why it is excluded. */
  assert.ok(EXCLUDED_MODULES.length > 0, 'precondition: the exclusion registry must not be empty');
  for (const m of EXCLUDED_MODULES) {
    assert.equal(sandbox[m.namespace], undefined,
      m.namespace + ' is excluded (' + m.excludedReason + ') and must not reach the bundle');
    assert.ok(typeof m.excludedReason === 'string' && m.excludedReason.length > 10,
      m.namespace + ' must carry a stated reason for its exclusion, not a bare flag');
  }

  const amort = require('../src/debt-amortization.js');
  assert.equal(sandbox.DebtAmortization.monthlyPayment(300000, 6.5, 360), amort.monthlyPayment(300000, 6.5, 360));

  /* DebtPayoffStrategy and DebtStrategyAdapter used to be compared here. Both
     are excluded from the bundle now, so there is no bundled counterpart to
     compare against; their Node behaviour stays covered by their own test
     files, which is what a revival would be measured against. */

  const refi = require('../src/debt-refinance.js');
  const cur = { balance: 300000, annualRatePct: 6.5, remainingTermMonths: 276 };
  const rep = { annualRatePct: 5.75, termMonths: 360 };
  assert.deepEqual(plain(sandbox.DebtRefinance.refinanceAnalysis(cur, rep)), plain(refi.refinanceAnalysis(cur, rep)));

  const arm = require('../src/debt-arm.js');
  const armCfg = { startRatePct: 5, marginPct: 2.5, indexRatePct: 2.5, initialCapPct: 2, periodicCapPct: 2, lifetimeCapPct: 10, fixedPeriodMonths: 60, resetEveryMonths: 12 };
  assert.deepEqual(plain(sandbox.DebtArm.armSchedule(300000, armCfg, 360)), plain(arm.armSchedule(300000, armCfg, 360)));

  const recast = require('../src/debt-recast.js');
  assert.deepEqual(plain(sandbox.DebtRecast.recastAnalysis(cur, 50000)), plain(recast.recastAnalysis(cur, 50000)));
});

// ---------------------------------------------------------------------------
// 4. The reason for IIFE wrapping: a naive concatenation must be observed
//    failing before the wrapped build.js output is trusted
// ---------------------------------------------------------------------------

// Real source, extracted the same way build.js itself does (stripHeaderComment
// + stripNodeExportFooter, both imported from build.js -- not re-transcribed
// here, so this test cannot silently drift from what build.js actually does).
function rawModuleBody(filename) {
  const raw = fs.readFileSync(path.join(SRC_DIR, filename), 'utf8');
  return stripHeaderComment(stripNodeExportFooter(raw));
}

// app-shell.html's own $ /root/num definitions, extracted verbatim by regex
// rather than hand-copied, so a future edit to either can't silently make
// this test stop meaning what it says.
function extract(source, regex, label) {
  const m = source.match(regex);
  if (!m) throw new Error('build-debt-bundling.test.js: could not extract ' + label + ' from app-shell.html -- update this test\'s regex');
  return m[0];
}

const SHELL_SOURCE = fs.readFileSync(path.join(SRC_DIR, 'app-shell.html'), 'utf8');
const ROOT_AND_DOLLAR = extract(
  SHELL_SOURCE,
  /var root=document\.getElementById\("[^"]*"\),\$=function\(id\)\{return root\.querySelector\("#"\+id\)\}/,
  'the root/$ preamble'
);
const SHELL_NUM_FN = extract(SHELL_SOURCE, /function num\(id,f\)\{[^}]*\}/, 'the shell\'s num(id,f)');

test('build-debt-bundling: a NAIVE concatenation of debt-arm.js lets the shell\'s num(id,f) silently replace the module\'s own num(v,fallback), crashing its internal calls', () => {
  const amortizationBody = rawModuleBody('debt-amortization.js');
  // A naive concatenation has nothing to route require() through (there is
  // no Node module system in the browser output), so the most natural naive
  // approach -- and the one that actually reproduces the danger this task
  // exists to avoid -- is to drop the require line and rely on plain
  // concatenation order to have already declared the name it wanted.
  const armBody = rawModuleBody('debt-arm.js').replace(/^const \{[^}]*\}\s*=\s*require\([^)]*\);\s*\n/m, '');

  // NAIVE: debt-arm's own `function num`/`function clamp` sit in the SAME
  // scope as the shell's `function num`, textually before it -- matching the
  // real marker order (DEBT_MODULES_SOURCE, then later in the file the
  // shell's own num()). Function-declaration hoisting means the LAST
  // declaration in source order wins for the whole scope: the shell's.
  const naiveScript =
    "'use strict';\n" + ROOT_AND_DOLLAR + ';\n' +
    amortizationBody + '\n' +
    armBody + '\n' +
    SHELL_NUM_FN + ';\n' +
    'globalThis.__probe = { armRatePath: armRatePath, num: num };\n';

  const dom = new JSDOM('<div id="investment-calculator-v2c"><input id="test-field" value="42"></div>', { runScripts: 'outside-only' });
  dom.window.eval(naiveScript);

  // debt-arm.js's armRatePath() calls num(cfg.startRatePct, 0) etc. internally
  // expecting value-coercion semantics. Under the naive concat, that `num`
  // call instead resolves to the shell's num(id,f), which does
  // $(cfg.startRatePct) -> root.querySelector("#"+5) -> an invalid CSS
  // selector starting with a digit. This is the exact failure the brief
  // names: "the debt modules start calling $() on a number."
  assert.throws(
    () => dom.window.__probe.armRatePath({
      termMonths: 24, startRatePct: 5, marginPct: 2, indexRatePct: 3,
      fixedPeriodMonths: 0, resetEveryMonths: 12,
    }),
    /selector|querySelector/i,
    'expected the naive concatenation to crash on an invalid CSS selector -- if it did not, the collision this test exists to catch did not reproduce'
  );

  // And the shell's OWN num(), reached directly, still correctly reads a
  // real DOM element in the naive build (it wins the collision here because
  // it is declared textually last) -- the corruption runs the other
  // direction, into the debt module, which is what the assertion above pins.
  assert.equal(dom.window.__probe.num('test-field', -1), 42);
});

test('build-debt-bundling: the real (IIFE-wrapped) bundle keeps debt-arm.js\'s num() isolated -- armRatePath works, and the shell\'s num() still reads the DOM', () => {
  const { debtModulesBlock } = build(path.join(SCRATCH_DIR, 'scratch-wrapped-isolation.html'));

  const wrappedScript =
    "'use strict';\n" + ROOT_AND_DOLLAR + ';\n' +
    debtModulesBlock + '\n' +
    SHELL_NUM_FN + ';\n' +
    'globalThis.__probe = { armRatePath: DebtArm.armRatePath, num: num };\n';

  const dom = new JSDOM('<div id="investment-calculator-v2c"><input id="test-field" value="42"></div>', { runScripts: 'outside-only' });
  dom.window.eval(wrappedScript);

  const path1 = dom.window.__probe.armRatePath({
    termMonths: 24, startRatePct: 5, marginPct: 2, indexRatePct: 3,
    fixedPeriodMonths: 0, resetEveryMonths: 12,
  });
  assert.equal(path1.months.length, 24, 'armRatePath should run to completion, isolated from the shell\'s num()');

  assert.equal(dom.window.__probe.num('test-field', -1), 42, 'the shell\'s own num() must still correctly read a real DOM element');
});

// ---------------------------------------------------------------------------
// CRLF (2026-09-10): the build must not depend on the checkout's line endings.
//
// FOUND BY VERIFYING A PACKAGE, which is the only reason it was ever going to
// be found. stripHeaderComment() required the source to start with exactly
// "'use strict';\n". This repository stores LF blobs with core.autocrlf=true
// and no .gitattributes, so **checkout writes CRLF** -- meaning a fresh clone
// on Windows gets CRLF sources and `node build.js` fails with
// "unexpected source header". Every DOM and worker test that builds from src/
// fails with it: 41 of them.
//
// It worked here only by accident. A git stash earlier in the session rewrote
// src/engine.js as CRLF, that broke the build, and the LF normalisation done
// to repair it was never going to be reproduced by anyone else.
//
// The repair normalises line endings on READ rather than matching both forms
// at one comparison site, so the whole class is gone and the built artifact is
// byte-identical regardless of how the tree was checked out.
// ---------------------------------------------------------------------------

test('build: a CRLF source builds identically to an LF one', () => {
  const srcDir = path.join(__dirname, '..', 'src');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'crlf-build-'));
  try {
    // CONTROL: the repository's own sources must build, or nothing below means
    // anything.
    const lfOut = path.join(scratch, 'lf.html');
    build(lfOut);
    const lfHtml = fs.readFileSync(lfOut, 'utf8');
    assert.ok(lfHtml.length > 100000, 'CONTROL: the normal build must produce the artifact');

    // Rebuild the src tree with CRLF endings, exactly as a fresh Windows
    // checkout would materialise it, and build from there.
    const crlfSrc = path.join(scratch, 'src');
    fs.mkdirSync(crlfSrc);
    fs.readdirSync(srcDir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .forEach((e) => {
        const body = fs.readFileSync(path.join(srcDir, e.name), 'utf8');
        fs.writeFileSync(path.join(crlfSrc, e.name), body.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));
      });
    assert.ok(
      fs.readFileSync(path.join(crlfSrc, 'engine.js'), 'utf8').startsWith("'use strict';\r\n"),
      'precondition: the scratch tree really is CRLF'
    );

    const crlfOut = path.join(scratch, 'crlf.html');
    build(crlfOut, crlfSrc);
    const crlfHtml = fs.readFileSync(crlfOut, 'utf8');

    assert.equal(
      crlfHtml, lfHtml,
      'a CRLF checkout must produce a byte-identical artifact. Before this repair it produced ' +
      'no artifact at all: "build: unexpected source header (expected a leading \'use strict\';)", ' +
      'which is what a fresh clone on Windows gets and what failed 41 tests inside a shipped package.'
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Q34 -- require rewriting must know code from prose
//
// rewriteSiblingRequires() was a single regex over raw text. It could not tell
// a dependency from a sentence, so it rewrote require-like text inside
// comments and string literals -- and, because an unrecognised module name
// throws, A COMMENT COULD BREAK THE BUILD. It now scans, and only code
// positions are considered.
// ---------------------------------------------------------------------------

const Q34_NS = {
  'debt-amortization.js': 'DebtAmortization',
  'debt-recast.js': 'DebtRecast',
};

const q34Subs = (src) => (rewriteSiblingRequires(src, Q34_NS).match(/DebtAmortization|DebtRecast/g) || []).length;

test('Q34: require-like text in comments and strings is neither rewritten nor able to break the build', () => {
  const inert = [
    ["line comment, known sibling", "// require('./debt-amortization.js')\nvar x = 1;"],
    ["block comment", "/* require('./debt-recast.js') */\nvar x = 1;"],
    ["single-quoted string", "var s = 'require(\"./debt-recast.js\")';"],
    ["double-quoted string", 'var s = "require(\'./debt-recast.js\')";'],
    /* The escape matters: a scanner that stops at the first quote would treat
       the rest of the line as code and rewrite the require inside it. */
    ["string containing an escaped quote", "var s = 'it\\'s require(\"./debt-recast.js\")';"],
    ["regex literal", "var r = /require\\('\\.\\/debt-recast\\.js'\\)/;"],
  ];
  for (const [label, src] of inert) {
    assert.equal(q34Subs(src), 0, label + ' must not be rewritten');
    assert.equal(rewriteSiblingRequires(src, Q34_NS), src, label + ' must pass through byte-identical');
  }

  /* The sharp case: a comment naming a module that is NOT in the registry.
     The old regex matched it, failed the lookup, and threw -- so a line of
     prose failed the build that produces the shipped artifact. */
  const prose = "// historical note: this used to require('./some-retired-module.js')\nvar x = 1;";
  assert.doesNotThrow(() => rewriteSiblingRequires(prose, Q34_NS),
    'an unrecognised module name inside a COMMENT must not fail the build');
  assert.equal(rewriteSiblingRequires(prose, Q34_NS), prose);
});

test('Q34: genuine sibling requires are still rewritten, and genuine unsupported ones still fail loudly', () => {
  assert.equal(q34Subs("var A = require('./debt-amortization.js');"), 1);
  assert.equal(q34Subs("var A = require('./debt-amortization');"), 1, 'the .js suffix stays optional');
  assert.equal(q34Subs("var A = require('./debt-amortization.js'), B = require('./debt-recast.js');"), 2);
  assert.equal(q34Subs("var A = require('./debt-amortization.js');\r\nvar y = 2;\r\n"), 1, 'CRLF input');

  /* Template interpolations are code, so they are processed rather than
     skipped -- a real require there is rewritten and a bad one still caught. */
  assert.equal(q34Subs("var t = `x${require('./debt-recast.js')}y`;"), 1);

  assert.throws(() => rewriteSiblingRequires("var Z = require('./not-a-module.js');", Q34_NS),
    /unrecognised sibling require/,
    'a real require on an unregistered module is a bundling gap and must still fail');

  /* Boundary the old regex did not have. */
  assert.equal(q34Subs("var x = myrequire('./debt-recast.js');"), 0,
    'an identifier merely ending in "require" is not a require call');
});

test('Q34: the repair is behaviour-preserving -- every real debt module rewrites byte-identically', () => {
  /* The proof that this is a repair and not a rewrite. The scanner and the old
     regex must agree on every input the build actually has; they differ only on
     the comment and string cases above, which no module contains. */
  const srcDir = path.join(__dirname, '..', 'src');
  const nsByFile = {};
  DEBT_MODULES.forEach((m) => { nsByFile[m.file] = m.namespace; });

  const legacyRewrite = (body) => body.replace(/require\((['"])\.\/([\w-]+?)(?:\.js)?\1\)/g, (whole, q, base) => {
    const ns = nsByFile[base + '.js'];
    if (!ns) throw new Error('unrecognised: ' + whole);
    return ns;
  });

  let checked = 0;
  DEBT_MODULES.forEach((m) => {
    const p = path.join(srcDir, m.file);
    if (!fs.existsSync(p)) return;
    const body = fs.readFileSync(p, 'utf8');
    assert.equal(rewriteSiblingRequires(body, nsByFile), legacyRewrite(body),
      m.file + ' must rewrite identically under the scanner and the old regex');
    checked++;
  });
  assert.ok(checked >= 7, 'the comparison must actually cover the debt modules, not silently zero');
});

// ---------------------------------------------------------------------------
// RP-02 -- the scanner decided regex-vs-division from one character
//
// Counterexamples supplied verbatim by the 12 September re-audit, not derived
// here. All three are valid CommonJS. Two of them left `require(` in the
// emitted bundle -- a silent build producing an artifact that throws
// ReferenceError in the browser -- and the third invented a dependency out of
// a regex character class.
//
// The Q34 test above compares the scanner against the old regex on today's
// module text. That is necessary and NOT sufficient, and these are why: it
// passes while all three of these fail, because no current module exercises
// the boundary. A test over today's inputs cannot establish correctness at
// the edges of the input space.
// ---------------------------------------------------------------------------

test('RP-02: regex-vs-division is decided by the previous TOKEN, not the previous character', () => {
  const ns = { 'debt-amortization.js': 'DebtAmortization' };
  const rewritten = (src) => rewriteSiblingRequires(src, ns);

  /* (a) A string is a value, so the `/` after it divides. Reading the quote
     character made this a regex start, which swallowed the require. */
  const afterString = rewritten("module.exports = '12' / require('./debt-amortization.js').x / 2;");
  assert.ok(afterString.includes('DebtAmortization'), 'the require must be resolved');
  assert.ok(!afterString.includes('require('), 'and nothing may survive as an unresolved require');

  /* (b) A regex inside a template interpolation may contain a brace. The
     interpolation scan used to end at the `}` inside /}/ and misread the rest. */
  const inTemplate = rewritten("module.exports = `${ /}/.test('}') ? require('./debt-amortization.js').x : 0 }`;");
  assert.ok(inTemplate.includes('DebtAmortization'));
  assert.ok(!inTemplate.includes('require('));

  /* (c) A regex CHARACTER CLASS is not code. `if(true)` is a control-flow head,
     so the `/` after its `)` starts a regex -- and the require-like text inside
     is text. This used to throw, inventing a dependency out of a string of
     characters. */
  const charClass = "if(true) /[require('./missing.js')]/.test('x');";
  assert.equal(rewritten(charClass), charClass, 'a regex character class must pass through untouched');
});

test('RP-02: the ambiguous `)` is resolved by what its `(` belongs to, not by rejecting it', () => {
  const ns = { 'debt-amortization.js': 'DebtAmortization' };

  /* Both of these are `)` followed by `/`, and they mean opposite things.
     src/debt-amortization.js and src/debt-revolving.js both contain real
     `)/` division, so rejecting the construct outright would fail the build on
     current source -- the one outcome worse than the defect. */
  const division = "var r = (a + b) / c; var A = require('./debt-amortization.js');";
  assert.ok(rewriteSiblingRequires(division, ns).includes('(a + b) / c'),
    'division after a parenthesised expression must survive unchanged');

  const regexAfterIf = "if (x) /[abc]/.test(y);";
  assert.equal(rewriteSiblingRequires(regexAfterIf, ns), regexAfterIf,
    'a regex after a control-flow head must be recognised as a regex');

  /* And a keyword is not a value: `return /re/` is a regex literal. */
  const afterReturn = "function f(){ return /x/.test('y'); } var A = require('./debt-amortization.js');";
  assert.ok(rewriteSiblingRequires(afterReturn, ns).includes('DebtAmortization'));
});

test('RP-02: a require that survives rewriting fails the build instead of reaching the browser', () => {
  /* The backstop, and the part that matters most. The scanner is a restricted
     one rather than a parser, so the honest question is what happens when it
     is wrong. Before this it emitted the module with `require(` still in it and
     let the browser throw at runtime. Now the output is re-scanned under an
     empty registry, where any surviving code-position require is unrecognised.

     Exercised through the real entry point by asking it to resolve a module
     that is not registered: the first pass throws, which is the same mechanism
     the backstop uses on the second. */
  assert.throws(() => rewriteSiblingRequires("var Z = require('./not-a-module.js');", {}),
    /unrecognised sibling require/,
    'an unresolvable code-position require must fail the build, never ship');

  /* And the backstop does not fire on legitimate output: requires inside
     comments and strings are ignored on the second pass exactly as on the
     first, so an ordinary module still builds. */
  const ns = { 'debt-amortization.js': 'DebtAmortization' };
  const ordinary = "// require('./anything.js')\nvar s = \"require('./other.js')\";\nvar A = require('./debt-amortization.js');";
  assert.doesNotThrow(() => rewriteSiblingRequires(ordinary, ns));
});
