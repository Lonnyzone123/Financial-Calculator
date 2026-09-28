'use strict';
/*
 * No name is declared twice in one scope of the code the app runs.
 *
 * MOVED HERE FROM A RETIRED TOOL (S4 task 2.5, the last open item of
 * SPRINT_QUESTIONS.md Q31). tools/verify-phase2-extraction.js was retired in
 * place under decision P6 (1759d61), because its main check -- the pre-Phase-2
 * functions present verbatim in src/engine.js -- can only fail now: every
 * deliberate repair since is a mismatch to it. But the tool carried a SECOND,
 * still-valid check: each engine function declared exactly once. Retiring the
 * tool retired that check silently, which is the thing task 2.5 forbids. This
 * file restores it, and widens it.
 *
 * WHY IT MATTERS. At script or function top level a second `function x(` is
 * legal JavaScript, and the LATER definition silently wins -- the last test
 * below demonstrates it. Two definitions of one thing, only one of them live,
 * is the family Q20, Q33 and Q38 keep finding; this is that failure inside a
 * single file, where no reviewer reading the first definition would know.
 *
 * HOW, AND WHY NOT A REGEX. Each source is COMPILED -- never run -- inside a
 * strict-mode block with node:vm. In a strict block, function declarations are
 * lexically scoped, so V8's own grammar rejects a second declaration of the
 * same name, including a var/function collision, with a SyntaxError naming the
 * identifier. The retired tool matched 'function NAME\(' against a hand-written
 * list of 44 names -- a list that could only find what was put into it. This
 * reads every top-level declaration there is, with the real parser, on the
 * engine's long single-line statements.
 *
 * THE BUILT APP NEEDS ONE MORE STEP, and the first version of this file missed
 * it. src/app-shell.html splices the debt bundle, the engine and the validator
 * into a single `(function(){ ... }());` wrapper. Inside a FUNCTION body a
 * duplicate declaration is legal even in strict mode, so compiling the whole
 * script found nothing -- a red run with duplicates planted in all three
 * sources turned every other check red and left that one green. The build
 * check now asserts the wrapper's exact shape and compiles its BODY, where
 * engine, validator and app-shell names finally share one block: that is the
 * cross-file collision nothing else here can see.
 *
 * WHAT IT DOES NOT CATCH. A duplicate inside one NESTED function body
 * (function scope, where it is still legal) -- which includes each bundled
 * debt module's internals inside the bundle factory, covered at source by the
 * per-module check instead; `var x` redeclared as `var x` (legal in a block
 * too); and the same name in two separately wrapped modules, which build.js
 * isolates on purpose.
 *
 * THE DETECTOR IS TESTED FIRST, against planted duplicates and a negative
 * control, so a future change that makes the wrapper non-strict -- or stops it
 * being a block -- fails loudly here instead of every check below passing on
 * a detector that can no longer see anything.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const { build, BUNDLED_MODULES } = require('../build.js');
const { liveWorkerSource, cleanup } = require('./lib/worker-source.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** null when the source declares no name twice at top level; otherwise V8's message. */
function duplicateDeclarationError(source, label) {
  try {
    new vm.Script('"use strict";\n{\n' + source + '\n}\n', { filename: label });
    return null;
  } catch (e) {
    // Only a SyntaxError is a finding. Anything else means the check itself
    // broke, and must not be reported as a clean result or as a duplicate.
    if (!(e instanceof SyntaxError)) throw e;
    return e.message;
  }
}

test.after(() => cleanup());

test('the detector is live: planted duplicates are rejected by name, and nested same-name helpers are not', () => {
  const engine = read('src/engine.js');
  assert.equal(duplicateDeclarationError(engine, 'engine'), null, 'precondition: the unmodified engine compiles');

  const dupFunction = duplicateDeclarationError(engine + '\nfunction runPlan(){}\n', 'engine+dup');
  assert.match(String(dupFunction), /Identifier 'runPlan' has already been declared/);

  const dupInternal = duplicateDeclarationError(engine + '\nfunction growAccounts(){}\n', 'engine+dup2');
  assert.match(String(dupInternal), /Identifier 'growAccounts' has already been declared/);

  const varCollision = duplicateDeclarationError(engine + '\nvar quantile = 1;\n', 'engine+var');
  assert.match(String(varCollision), /Identifier 'quantile' has already been declared/);

  // Negative control: a helper name reused inside two DIFFERENT functions is
  // legal and harmless, and must not be flagged -- or real code would be.
  const nested = 'function __outerA(){ function helper(){} }\nfunction __outerB(){ function helper(){} }\n';
  assert.equal(duplicateDeclarationError(engine + '\n' + nested, 'engine+nested'), null);
});

test('src/engine.js declares no name twice at top level', () => {
  assert.equal(duplicateDeclarationError(read('src/engine.js'), 'src/engine.js'), null);
});

test('src/scenario-validator.js declares no name twice at top level', () => {
  assert.equal(duplicateDeclarationError(read('src/scenario-validator.js'), 'src/scenario-validator.js'), null);
});

test('every bundled debt module declares no name twice at top level', () => {
  assert.ok(BUNDLED_MODULES.length >= 1, 'no bundled modules found -- this check would be vacuous');
  for (const m of BUNDLED_MODULES) {
    const rel = path.join('src', m.file);
    assert.equal(duplicateDeclarationError(read(rel), rel), null, rel);
  }
});

test('every inline script of a fresh build declares no name twice at top level -- the engine, validator and bundle together', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-dup-decl-'));
  try {
    const { output } = build(path.join(dir, 'app.html'));
    const scripts = [...output.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1]);
    // Key off the app's own root id, not "the first script": the artifact also
    // carries a small PWA bootstrap, and scanning only that would pass vacuously.
    const app = scripts.find((s) => s.includes('investment-calculator-v2c'));
    assert.ok(app && app.length > 100000, 'could not find the app script in the fresh build');

    // The app is one function wrapper, and declarations inside a function body
    // may legally repeat -- so compile the wrapper's BODY in the strict block.
    // If the wrapper's shape changes, fail here: update this check, never skip it.
    const HEAD = '(function(){';
    const TAIL = '}());';
    const wrapped = app.trim();
    assert.ok(wrapped.startsWith(HEAD) && wrapped.endsWith(TAIL),
      'the app script is no longer a single ' + HEAD + ' ... ' + TAIL + ' wrapper');
    const body = wrapped.slice(HEAD.length, -TAIL.length);
    assert.ok(body.length > 100000, 'the unwrapped app body is implausibly small');

    // Reach witness: a duplicate of a real engine name spliced into THIS body is
    // caught, so the unwrap cannot quietly become a check of nothing.
    assert.match(String(duplicateDeclarationError(body + '\nfunction runPlan(){}\n', 'app-body+dup')),
      /Identifier 'runPlan' has already been declared/);

    assert.equal(duplicateDeclarationError(body, 'built-app-body'), null, 'the built app body');
    scripts.filter((s) => s !== app).forEach((s, i) => {
      assert.equal(duplicateDeclarationError(s, 'built-other-script-' + i), null, 'built inline script ' + i);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the Worker source the built app generates declares no name twice at top level', async () => {
  const source = await liveWorkerSource();
  assert.ok(source.length > 1000, 'no worker source to check');
  assert.equal(duplicateDeclarationError(source, 'generated-worker-source'), null);
});

test('the hazard is real: outside a block, a duplicate compiles and the later definition silently wins', () => {
  const ctx = {};
  vm.runInNewContext('function f(){ return 1 }\nfunction f(){ return 2 }\nresult = f();', ctx);
  assert.equal(ctx.result, 2);
});
