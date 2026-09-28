'use strict';
/*
 * S2 FULL CLOSURE RE-AUDIT (12 September 2026) -- FC-01 through FC-04.
 *
 * The first audit round in this sequence to establish NO new live
 * retirement-calculation defect. All four findings are in the build and
 * measuring tools, which is a different kind of result and worth stating: the
 * engine's own witnesses all held, and what failed was the equipment pointed
 * at it.
 *
 * Each reopens an earlier family, and each does it the same way the CR2 round
 * did -- the earlier repair was right about the case in front of it and
 * stopped at that case's edge:
 *
 *   FC-01 reopens RP-02   a scanner taught three counterexamples, and a
 *                         backstop that was the same scanner run twice
 *   FC-02 reopens CR2-04  a raw-value guard whose index test was one larger
 *                         than the index range, and which returned before the
 *                         descriptor checks it shares with objects
 *   FC-03 reopens CR2-03  a union deduplicated by structural key, which is
 *                         order-dependent the moment a scalar joins it
 *   FC-04 reopens RP-03   a baseline validator that looked at rows only, so
 *                         the headline number could be NaN and read `inert`
 *
 * Same convention as audit-rb/rc/cl/st2/cr2-findings.test.js: each test states
 * the measured pre-repair behaviour in its own message.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const ROOT = path.join(__dirname, '..');
const build = require(path.join(ROOT, 'build.js'));
const baseline = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
const schema = require(path.join(ROOT, 'tests', 'lib', 'schema-catalogue.js'));

const REGISTRY = { 'debt-amortization.js': 'DebtAmortization' };

// ---------------------------------------------------------------------------
// FC-01 -- build.js require scanner
// ---------------------------------------------------------------------------

/* Runs a module body the way each side actually sees it: the original under a
   `require` that resolves, the rewritten one under the bundle's global
   binding and NO require at all. Comparing the VALUES is the point -- the
   audit was explicit that comparing output text proves nothing, because a
   require left untouched compares equal to itself and still throws in a
   browser. */
function runCode(code, withRequire) {
  const ctx = { module: { exports: {} }, DebtAmortization: { x: 2 } };
  if (withRequire) ctx.require = () => ({ x: 2 });
  vm.createContext(ctx);
  try {
    vm.runInContext(code, ctx, { timeout: 1000 });
    return { value: ctx.module.exports };
  } catch (e) {
    return { error: String(e) };
  }
}

/* The five counterexamples, verbatim from the re-audit. Four have a decidable
   answer and must now produce it; the fifth has none and must be refused. */
const SCANNER_CASES = [
  ['postfix_division', "let n=12; module.exports = n++ / require('./debt-amortization.js').x / 2;"],
  ['object_division', "module.exports = {valueOf(){return 12;}} / require('./debt-amortization.js').x / 2;"],
  ['spaced_require', "module.exports = require ('./debt-amortization.js').x;"],
  ['template_return_regex', "module.exports = `${ (()=>{return /}/.test('}');})() ? require('./debt-amortization.js').x : 0 }`;"],
  ['property_require', "const obj={require:()=>({x:6})}; module.exports = obj. require('./debt-amortization.js').x;"],
];

/* Valid syntax that must keep building. The first four are RP-02's own
   witnesses, kept so that round cannot regress while this one is repaired.
   The fifth is FC-01's other half: a block comment between a control-flow
   keyword and its `(` hid the head, so the regex after it read as division and
   the build invented a dependency out of a character class -- a false
   rejection, the opposite failure to the five above. */
const SCANNER_CONTROLS = [
  ['numeric_control', "module.exports = 12 / require('./debt-amortization.js').x / 2;"],
  ['prior_string_control', "module.exports = '12' / require('./debt-amortization.js').x / 2;"],
  ['prior_regex_control', "if(true) /[require('./missing.js')]/.test('x'); module.exports = 3;"],
  ['prior_template_control', "module.exports = `${ /}/.test('}') ? require('./debt-amortization.js').x : 0 }`;"],
  ['comment_control_head', "if /* comment */ (true) /[require('./missing.js')]/.test('x'); module.exports = 3;"],
];

for (const [name, source] of SCANNER_CASES) {
  test('FC-01: ' + name + ' preserves runtime behaviour or is refused by name', () => {
    let output;
    try {
      output = build.rewriteSiblingRequires(source, REGISTRY);
    } catch (e) {
      /* Refusal is an accepted outcome -- for `object_division` it is the ONLY
         correct one, since whether `}` closed a block or an expression is a
         parse-level fact no lexical lookback settles. What is not accepted is
         emitting a bundle that throws in the browser. */
      assert.match(String(e), /build|unsupported|require/i,
        name + ' was refused, but not with a message naming the build, the ' +
        'unsupported construct or the require');
      return;
    }
    assert.deepEqual(runCode(output, false), runCode(source, true),
      'pre-repair, ' + name + ' emitted a bundle whose behaviour differed from the ' +
      'source: three of these left `require(` in the output (ReferenceError in a ' +
      'browser), one appended an unbalanced brace (SyntaxError), and property_require ' +
      'replaced a call to the object\'s OWN require method with the namespace, ' +
      'returning 2 where the source returns 6. The backstop caught none of them, ' +
      'because the backstop is this same scanner reading the same text twice.');
  });
}

for (const [name, source] of SCANNER_CONTROLS) {
  test('FC-01 control: ' + name + ' still builds and behaves identically', () => {
    const output = build.rewriteSiblingRequires(source, REGISTRY);
    assert.deepEqual(runCode(output, false), runCode(source, true),
      name + ' is valid supported syntax and must survive the repair unchanged');
  });
}

test('FC-01: an unresolved executable dependency is still refused', () => {
  /* The audit's explicit requirement: proving the repair did not simply widen
     the scanner until everything passes. A sibling require in CODE position
     naming a module outside the registry has to fail the build, or the
     rewriter silently emits a bundle with a dangling require. */
  assert.throws(
    () => build.rewriteSiblingRequires(
      "module.exports = require('./not-registered.js').x;", REGISTRY),
    /unrecognised sibling require|build/i,
    'a code-position require for an unregistered module must fail the build');

  /* And the same require inside a string is data, not a dependency. */
  assert.doesNotThrow(
    () => build.rewriteSiblingRequires(
      "module.exports = \"require('./not-registered.js')\";", REGISTRY),
    'a require inside a string literal is not a dependency and must not fail the build');
});

// ---------------------------------------------------------------------------
// FC-02 -- capture-baseline raw value guard
// ---------------------------------------------------------------------------

test('FC-02: 2^32-1 is a named property on an array, not an index', () => {
  const a = [1];
  a['4294967295'] = 50000;
  assert.equal(a.length, 1, 'precondition: the property did not extend the array');

  /* Pre-repair: `String(Number(k) >>> 0) === k` accepted the full unsigned
     32-bit range, one larger than the index range, so this was waved through
     as an index. map() skips it, and the entry captured to
     a3d6971503bcc...f9dc -- byte-identical to plain [1]. Fifty thousand
     dollars erased by the guard whose job is to make an unexpected shape fail
     visibly. */
  assert.throws(
    () => baseline.captureEntry('x', { rows: [{ value: a }] }),
    /own property "4294967295" on an array/,
    'the 2^32-1 boundary property must be refused by name, not dropped');
});

test('FC-02: an indexed accessor is refused before it is ever read', () => {
  let reads = 0;
  const a = [1];
  Object.defineProperty(a, '0', { get() { return ++reads; }, enumerable: true, configurable: true });

  /* Pre-repair: the array branch returned before the descriptor checks that
     refuse accessors at named keys, so validation walked the elements with
     forEach and the capture read them again -- the getter ran TWICE, and the
     value that was validated (1) was not the value that was stored (2). */
  assert.throws(
    () => baseline.captureEntry('x', { rows: [{ value: a }] }),
    /accessor property "0"/,
    'an accessor at an index must be refused the same way one at a named key is');
  assert.equal(reads, 0,
    'refusal must come from the descriptor, before any element is read -- ' +
    'pre-repair this was 2');
});

test('FC-02 controls: ordinary, sparse, symbol-keyed and named-property arrays', () => {
  const ordinary = baseline.captureEntry('x', { rows: [{ value: [1, 2, 3] }] });
  assert.ok(ordinary.hash, 'a dense array of finite numbers is the supported domain');
  assert.notEqual(
    ordinary.hash,
    baseline.captureEntry('x', { rows: [{ value: [1, 2] }] }).hash,
    'distinct arrays must still capture distinctly');

  const sparse = [1, , 3];                                    // eslint-disable-line no-sparse-arrays
  /* Refused, and predating FC-02: a hole and an explicit null serialize
     identically, so the distinction cannot survive capture. FC-02 narrowed
     which KEYS count as indices; it must not quietly widen which VALUES the
     format accepts. */
  assert.throws(() => baseline.captureEntry('x', { rows: [{ value: sparse }] }),
    /sparse array hole/,
    'the sparse-hole refusal predates FC-02 and must survive it');

  const symbolKeyed = [1];
  symbolKeyed[Symbol('s')] = 2;
  assert.throws(() => baseline.captureEntry('x', { rows: [{ value: symbolKeyed }] }),
    /symbol-keyed property/, 'the symbol-key refusal predates FC-02 and must survive it');

  const named = [1];
  named.note = 'dropped';
  assert.throws(() => baseline.captureEntry('x', { rows: [{ value: named }] }),
    /own property "note" on an array/,
    'CR2-04\'s original named-property witness must still hold');

  const notCanonical = [1];
  notCanonical['01'] = 5;
  assert.throws(() => baseline.captureEntry('x', { rows: [{ value: notCanonical }] }),
    /own property "01" on an array/,
    '"01" is not a canonical index and never was one');
});

// ---------------------------------------------------------------------------
// FC-03 -- schema catalogue union
// ---------------------------------------------------------------------------

test('FC-03: a mixed scalar/object union does not depend on record order', () => {
  /* Pre-repair, reduce() being left-associative decided the answer by where
     the corpus put the scalar: objects-first merged {a} and {b} into one
     variant with both optional, scalar-first left them as two variants each
     with a REQUIRED field. A union whose answer depends on record order is not
     a union -- CL-04's own words, one level up from where CL-04 repaired it. */
  const a = schema.describe([{ x: { a: 1 } }, { x: { b: 1 } }, { x: 0 }]);
  const b = schema.describe([{ x: 0 }, { x: { a: 1 } }, { x: { b: 1 } }]);
  const c = schema.describe([{ x: { a: 1 } }, { x: 0 }, { x: { b: 1 } }]);
  assert.deepEqual(a, b, 'scalar last vs scalar first');
  assert.deepEqual(a, c, 'scalar in the middle');
});

test('FC-03: order independence holds for nested arrays and repeated records', () => {
  const one = schema.describe([{ x: [{ a: 1 }] }, { x: [{ b: 2 }] }, { x: 0 }]);
  const two = schema.describe([{ x: 0 }, { x: [{ b: 2 }] }, { x: [{ a: 1 }] }]);
  assert.deepEqual(one, two, 'nested array variants merge like any other same-kind pair');

  /* Idempotence: describing a record twice must say what describing it once
     says, or "the catalogue changed" reports duplication as drift. */
  assert.deepEqual(
    schema.describe([{ x: { a: 1 } }, { x: { a: 1 } }]),
    schema.describe([{ x: { a: 1 } }]),
    'a repeated record adds nothing');
});

test('FC-03: an own __proto__ field is part of the catalogue', () => {
  /* Pre-repair `fields[k] = node` ran the inherited setter, so this described
     as `{}` -- the field vanished from the catalogue and from every drift diff
     built on it. Fourth site of the same assignment: CL-01 (engine), EXT-02
     (diff index), CL-03 (capture), and this. */
  const described = schema.describe(JSON.parse('{"__proto__":{"balance":50000}}'));
  assert.ok(Object.hasOwn(described.fields, '__proto__'),
    '__proto__ must be an OWN field of the catalogue, not a prototype write');
  assert.notDeepEqual(schema.leafPaths(described), schema.leafPaths(schema.describe({})),
    'it must also be visible in the flat form a drift test reads');
});

test('FC-03: an optional container is visible in the flat form', () => {
  const required = schema.describe([{ x: { amount: 1 } }, { x: { amount: 2 } }]);
  const optional = schema.describe([{ x: { amount: 1 } }, {}]);
  /* Pre-repair both flattened to exactly `[].x.amount : number`. The nested
     comparison did catch this, so it was never a gate bypass -- but the flat
     form is what a reader diffs, and it was a level less precise than the
     thing it summarises. */
  assert.notDeepEqual(schema.leafPaths(required), schema.leafPaths(optional),
    'a whole object becoming optional must leave a trace in the flat form');
});

test('FC-03 controls: addition, deletion and type change are still detected', () => {
  const base = schema.describe([{ balance: 1 }, { balance: 2 }]);
  assert.notDeepEqual(base, schema.describe([{ balance: 1 }, { balance: 2, extra: 3 }]),
    'an added field must still register');
  assert.notDeepEqual(base, schema.describe([{ balance: 1 }, {}]),
    'a deleted field must still register');
  assert.notDeepEqual(base, schema.describe([{ balance: 1 }, { balance: 'broken' }]),
    'a type change must still register');
});

// ---------------------------------------------------------------------------
// FC-04 -- near-miss corruption classification
// ---------------------------------------------------------------------------

/* near-miss-survivor-sweep.test.js exports nothing and its gates run real
   sweeps, so it is loaded into a context whose `node:test` only RECORDS the
   tests rather than running them. Same technique the re-audit used, for the
   same reason: reaching classify() must not re-run the sweep. */
function loadClassifier() {
  const abs = path.join(ROOT, 'tests', 'near-miss-survivor-sweep.test.js');
  const req = createRequire(abs);
  const registered = {};
  const stubTest = (name, ...args) => { registered[name] = args.at(-1); };
  stubTest.after = () => {};
  const ctx = {
    module: { exports: {} },
    __dirname: path.dirname(abs),
    __filename: abs,
    process,
    global,
    console: { log() {} },
    require: (n) => (n === 'node:test' ? stubTest : req(n)),
  };
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(abs, 'utf8') +
    '\nmodule.exports={classify,setCache:(x)=>{sweepCache=JSON.parse(JSON.stringify(x));}};',
    ctx);
  return Object.assign({ registered }, ctx.module.exports);
}

/* P5-02 widened the required row contract from six fields to the thirteen
   guaranteed across every mode, so this fixture carries them. Repairing the
   fixture rather than narrowing the contract is the auditor's instruction and
   the right direction: a test fixture that is not a valid result cannot
   demonstrate anything about how valid results are handled. */
const cleanRow = (over) => Object.assign({
  age: 65, total: 1000, taxable: 400, preTax: 600, roth: 0, hsa: 0, income: 50,
  spending: 40, withdrawals: 40, taxes: 5, shortfall: 0, networth: 1000, debtBalance: 0,
}, over);

const cleanResult = () => ({
  calculationError: false,
  failed: false,
  successRate: 100,
  firstShortfallAge: null,
  rows: [cleanRow({ age: 65 }), cleanRow({ age: 66, total: 1010, networth: 1010 })],
});

test('FC-04: identical NaN success rates are a corrupt baseline, not inert', () => {
  const { classify } = loadClassifier();
  const p = cleanResult();
  p.successRate = NaN;
  /* Pre-repair: the baseline validator walked rows only, so a clean-rowed
     result with a NaN headline reached the equality shortcut and came back
     `inert` -- the most reassuring word this classifier has, for the worst
     thing it can be shown. successRate is itself in MATERIAL_TOP_LEVEL_FIELDS:
     the harness would fail if it CHANGED, while never checking it was a
     number. */
  assert.equal(classify(p, structuredClone(p)).kind, 'corrupt-baseline');
});

test('FC-04: a finite-to-NaN top-level move is mutation corruption, not materiality', () => {
  const { classify } = loadClassifier();
  const complete = cleanResult();
  const mutated = cleanResult();
  mutated.successRate = NaN;
  const verdict = classify(complete, mutated);
  /* Baseline corruption and mutation corruption are different facts. This one
     was reachable before the repair, but only as `silent-material` -- true,
     yet it files damage under the category used for ordinary movement. */
  assert.equal(verdict.kind, 'corrupt');
  assert.match(verdict.detail, /successRate/);
});

test('FC-04: the contract is named, so legitimate shapes are not corruption', () => {
  const { classify } = loadClassifier();
  const withShortfall = cleanResult();
  withShortfall.firstShortfallAge = 87;
  assert.equal(classify(withShortfall, structuredClone(withShortfall)).kind, 'inert',
    'a numeric firstShortfallAge is ordinary');

  const noShortfall = cleanResult();
  assert.equal(noShortfall.firstShortfallAge, null);
  assert.equal(classify(noShortfall, structuredClone(noShortfall)).kind, 'inert',
    'null firstShortfallAge is the normal case and must never read as damage -- ' +
    'which is why this is a named contract and not a blanket "top-level numbers ' +
    'must be finite" rule');

  const badFlag = cleanResult();
  badFlag.failed = 'no';
  assert.equal(classify(badFlag, structuredClone(badFlag)).kind, 'corrupt-baseline',
    '`failed` is a boolean by contract; a string is damage even though it is finite');
});

test('FC-04 controls: row NaNs and ordinary equality keep their verdicts', () => {
  const { classify } = loadClassifier();

  const identicalRowNaN = cleanResult();
  identicalRowNaN.rows[0].total = NaN;
  assert.equal(classify(identicalRowNaN, structuredClone(identicalRowNaN)).kind, 'corrupt-baseline',
    'RP-03\'s own witness must survive FC-04');

  const complete = cleanResult();
  const mutated = cleanResult();
  mutated.rows[0].taxes = NaN;
  const verdict = classify(complete, mutated);
  assert.equal(verdict.kind, 'corrupt', 'row damage introduced by the omission is corrupt');
  assert.match(verdict.detail, /rows\[0\]\.taxes/,
    'rows stay with the field-by-field comparison, which names before and after');

  assert.equal(classify(cleanResult(), cleanResult()).kind, 'inert',
    'two clean identical results are still inert');
});

// ---------------------------------------------------------------------------
// FCR-01…FCR-03 -- the re-audit of the FC repairs
//
// Each FC repair closed its exact witness and left its family open. That is the
// finding worth carrying: "the named case passes" and "the class is closed" are
// different claims, and this round is what separated them.
// ---------------------------------------------------------------------------

/* Valid source the old scanner emitted unchanged, so the browser got a bare
   `require(` and a ReferenceError. Whitespace and comments are legal at every
   token boundary of a call; the grammar recognised exactly one spelling. */
const FCR_SCANNER_CASES = [
  ['ws_inside_parens', "module.exports = require( './debt-amortization.js' ).x;"],
  ['comment_before_paren', "module.exports = require/* dep */('./debt-amortization.js').x;"],
  ['comment_inside_parens', "module.exports = require(/* dep */ './debt-amortization.js').x;"],
  /* Single-line deliberately: the handover's multi-line paste of this witness
     does NOT fail, because endOfRegexLiteral bails at a newline and the
     mis-read regex never swallowed anything. Recorded rather than smoothed
     over -- the defect is real, the published reproduction was accidentally
     safe, and a test that copied it verbatim would have passed against the bug. */
  ['template_control_head',
    "module.exports = `${ (()=>{ if(true) /}/.test('}'); return require('./debt-amortization.js').x; })() }`;"],
  ['template_while_head',
    "module.exports = `${ (()=>{ while(false) /}/.test('}'); return require('./debt-amortization.js').x; })() }`;"],
];

for (const [name, source] of FCR_SCANNER_CASES) {
  test('FCR-01: ' + name + ' preserves runtime behaviour or is refused by name', () => {
    let output;
    try {
      output = build.rewriteSiblingRequires(source, REGISTRY);
    } catch (e) {
      assert.match(String(e), /build|unsupported|require/i);
      return;
    }
    assert.deepEqual(runCode(output, false), runCode(source, true),
      'pre-repair, ' + name + ' emitted a bundle whose behaviour differed from the source. ' +
      'The two require spellings reached the browser as ReferenceError; the template cases ' +
      'closed the interpolation early and appended an unbalanced brace (SyntaxError). ' +
      'Comparing emitted TEXT would have missed all of them, which is why this executes.');
  });
}

test('FCR-01: a parenthesis inside a string is not a parenthesis', () => {
  /* The old head search scanned backwards over raw characters, so the `(` in
     the string literal counted as a real one, the control-flow head was lost,
     the following regex read as division, and the build invented a dependency
     out of a character class. Heads are tracked forward on a stack now, so
     there is no backward scan left to fool. */
  const source = "if('(') /[require('./missing.js')]/.test('x'); module.exports = 3;";
  const output = build.rewriteSiblingRequires(source, REGISTRY);
  assert.deepEqual(runCode(output, false), runCode(source, true));
});

test('FCR-01: the grammar fails closed on every require call it cannot resolve', () => {
  /* The point of the round. An unsupported call shape used to be emitted
     unchanged; now it is refused, so a dangling loader call cannot reach the
     artifact merely by being unrecognised. */
  const unresolvable = [
    'module.exports = require(name).x;',
    "module.exports = require('fs');",
    'module.exports = require(`./debt-amortization.js`).x;',
  ];
  for (const src of unresolvable) {
    assert.throws(() => build.rewriteSiblingRequires(src, REGISTRY),
      /unsupported syntax|unrecognised sibling require/i,
      'an unresolvable require call must fail the build: ' + src);
  }
  assert.throws(
    () => build.rewriteSiblingRequires("module.exports = require('./not-registered.js');", REGISTRY),
    /unrecognised sibling require/i);

  /* ...and non-call uses of the name are not the loader, so they are left
     alone rather than refused. */
  assert.doesNotThrow(() => build.rewriteSiblingRequires(
    'const obj = { require: () => 1 }; module.exports = obj.require();', REGISTRY));
  assert.doesNotThrow(() => build.rewriteSiblingRequires(
    'module.exports = "require(\'./not-registered.js\')";', REGISTRY));
});

test('FCR-01: the emitted module is parse-checked by a parser this file did not write', () => {
  /* A syntax check cannot catch a surviving require -- that is what the
     fail-closed rule is for -- but it does catch the unbalanced-brace class,
     and it catches it independently of the scanner's own opinion. */
  const source = "module.exports = `${ (()=>{ if(true) /}/.test('}'); return 1; })() }`;";
  const output = build.rewriteSiblingRequires(source, REGISTRY);
  assert.doesNotThrow(() => new vm.Script(output));
});

test('FCR-02: an inherited index is refused, and the getter never runs', () => {
  let reads = 0;
  const proto = Object.create(Array.prototype);
  Object.defineProperty(proto, '0', { get() { return ++reads; } });
  const value = Array(1);
  Object.setPrototypeOf(value, proto);

  assert.equal(Array.isArray(value), true, 'precondition: still an array');
  assert.equal(Object.hasOwn(value, '0'), false, 'precondition: the index is inherited');
  assert.equal(0 in value, true, 'precondition: `in` sees it, which is the trap');

  /* Pre-repair: the hole check asked `i in value` (prototype chain) while the
     descriptor check used getOwnPropertyNames (own only). The index satisfied
     the first, was invisible to the second, and was then read by map() -- so
     validation saw 1 and the capture stored 2. */
  assert.throws(() => baseline.captureEntry('x', { rows: [{ value }] }),
    /non-standard prototype|inherited index/);
  assert.equal(reads, 0, 'refusal must come from the descriptor, not from reading -- was 2');
});

test('FCR-02 control: an inherited DATA index is refused too', () => {
  /* So the hole policy does not accidentally depend on whether the inherited
     property happened to be an accessor. */
  const proto = Object.create(Array.prototype);
  proto['0'] = 7;
  const value = Array(1);
  Object.setPrototypeOf(value, proto);
  assert.throws(() => baseline.captureEntry('x', { rows: [{ value }] }),
    /non-standard prototype|inherited index/);
});

test('FCR-03: an absent required field is damage, not an optional shape', () => {
  const { classify } = loadClassifier();
  const omissions = {
    failed: (r) => { delete r.failed; },
    successRate: (r) => { delete r.successRate; },
    firstShortfallAge: (r) => { delete r.firstShortfallAge; },
    rows: (r) => { delete r.rows; },
    'rows[].total': (r) => { r.rows.forEach((x) => delete x.total); },
    'rows[].age': (r) => { r.rows.forEach((x) => delete x.age); },
  };
  for (const [label, mutate] of Object.entries(omissions)) {
    const p = cleanResult();
    mutate(p);
    /* Pre-repair every one of these returned `inert`: the validator skipped any
       field that was absent, and row validation walked only the keys that
       remained -- so the most complete form of damage was the one form it could
       not see. */
    assert.equal(classify(p, structuredClone(p)).kind, 'corrupt-baseline',
      'deleting ' + label + ' must be a corrupt baseline, not inert');
  }
});

test('FCR-03: mutation-only omission is corruption and reaches a failing gate', () => {
  const h = loadClassifier();
  const complete = cleanResult();
  const mutated = cleanResult();
  delete mutated.successRate;
  const verdict = h.classify(complete, mutated);
  assert.equal(verdict.kind, 'corrupt');
  assert.match(verdict.detail, /successRate/);

  const name = 'RP-03: a corruption verdict reaches the regression gate, rather than being tallied and dropped';
  h.setCache({
    tally: { inert: 0, loud: 0, 'silent-immaterial': 0, 'silent-material': 0, corrupt: 1, 'corrupt-baseline': 0 },
    findings: [{ seed: 1, path: 'retirement.expenses[0].name', kind: verdict.kind, detail: verdict.detail }],
  });
  assert.throws(() => h.registered[name](), /DAMAGED/,
    'a corrupt verdict must still fail the gate, not merely be tallied');
});

test('FCR-03 controls: legitimate shapes stay legitimate', () => {
  const { classify } = loadClassifier();
  assert.equal(classify(cleanResult(), cleanResult()).kind, 'inert',
    'a complete clean pair is still inert');

  const nullAge = cleanResult();
  assert.equal(nullAge.firstShortfallAge, null);
  assert.equal(classify(nullAge, structuredClone(nullAge)).kind, 'inert',
    'firstShortfallAge PRESENT and null is the ordinary case; only its ABSENCE is damage');

  const withShortfall = cleanResult();
  withShortfall.firstShortfallAge = 87;
  assert.equal(classify(withShortfall, structuredClone(withShortfall)).kind, 'inert');

  const nan = cleanResult();
  nan.successRate = NaN;
  assert.equal(classify(nan, structuredClone(nan)).kind, 'corrupt-baseline',
    'FC-04 present-NaN witness must survive FCR-03');

  /* Extra fields are metadata, not damage: the contract names what must be
     there, not what may not be. */
  const extra = cleanResult();
  extra.diagnostics = { note: 'ok' };
  extra.rows.forEach((r) => { r.magi = 1000; });
  assert.equal(classify(extra, structuredClone(extra)).kind, 'inert');
});

// ---------------------------------------------------------------------------
// P5-01 / P5-02 -- the package-(5) re-audit
//
// Third round in a row where the previous repair closed its witness and left
// the family open. FCR-01 unified three lexical rule sets into one tokenizer
// and still decided keyword meaning by SPELLING; FCR-03 required presence and
// still accepted a projection with nothing in it. Both repairs were correct
// about the case in front of them.
//
// Program strings are kept byte-exact and single-line on purpose: reformatting
// a lexer-sensitive witness is what made one published reproduction stop
// reproducing, and the auditor asked for the exact bytes.
// ---------------------------------------------------------------------------

const P5_SCANNER_CASES = [
  ['member_named_return', "const obj={return:12}; module.exports = obj.return / require('./debt-amortization.js').x / 2;"],
  ['contextual_of', "const of=12; module.exports = of / require('./debt-amortization.js').x / 2;"],
  ['parenthesised_callee', "module.exports = (require)('./debt-amortization.js').x;"],
  ['optional_call', "module.exports = require?.('./debt-amortization.js').x;"],
];

for (const [name, source] of P5_SCANNER_CASES) {
  test('P5-01: ' + name + ' preserves runtime behaviour or is refused by name', () => {
    let output;
    try {
      output = build.rewriteSiblingRequires(source, REGISTRY);
    } catch (e) {
      assert.match(String(e), /build|unsupported|require/i);
      return;
    }
    assert.deepEqual(runCode(output, false), runCode(source, true),
      'pre-repair, ' + name + ' emitted a bundle that threw ReferenceError. The first two ' +
      'hid the call inside a mis-read regex, because `regexMayStartAfter` asked only ' +
      'whether the word was in the keyword set: `obj.return` is a property read and `of` ' +
      'is a legal variable name, so both are values and both divisions are divisions. The ' +
      'second two walked past the refusal gate, which tested whether the very next token ' +
      'was `(` -- another spelling assumption.');
  });
}

test('P5-01 controls: keyword-named members and ordinary division still behave', () => {
  /* The property rule must not swing the other way: a member whose name is a
     keyword is a value, and an ordinary member is still a value. */
  const cases = [
    "const obj={value:12}; module.exports = obj.value / require('./debt-amortization.js').x / 2;",
    "const obj={case:12}; module.exports = obj.case / require('./debt-amortization.js').x / 2;",
    "const obj={in:12}; module.exports = obj.in / require('./debt-amortization.js').x / 2;",
    "const obj={typeof:12}; module.exports = obj.typeof / require('./debt-amortization.js').x / 2;",
  ];
  for (const source of cases) {
    const output = build.rewriteSiblingRequires(source, REGISTRY);
    assert.deepEqual(runCode(output, false), runCode(source, true), source);
  }
  /* And a real keyword in a real keyword position still opens a regex. */
  const keyword = "module.exports = (function(){ return /[require('./missing.js')]/.test('x'); })();";
  assert.deepEqual(
    runCode(build.rewriteSiblingRequires(keyword, REGISTRY), false),
    runCode(keyword, true));
});

test('P5-01: the registered-require backstop fires on every supported call form', () => {
  /*
   * THE TEST THAT DID NOT EXIST.
   *
   * What stood here asked whether the build REFUSED **or** the require was
   * rewritten, and asserted whichever happened. The main scanner rewrites
   * correctly, so it always took the second branch, always passed, and never
   * once exercised the backstop -- which is how the backstop shipped DEAD.
   * An assertion shaped `if (A) expect(X) else expect(Y)` cannot discriminate
   * between A and not-A; it is two tests under one name, green whichever
   * fires. Same family as FC-04 and FCR-03, and this time it was ours.
   *
   * So the detector is now tested DIRECTLY. It is deliberately not tested
   * through rewriteSiblingRequires: a correct scanner cannot be made to emit
   * a survivor on demand, which is the entire reason a backstop exists and
   * the entire reason its failure was invisible.
   */
  const REG = { 'debt-amortization.js': 'DebtAmortization', 'debt-revolving.js': 'DebtRevolving' };
  const survivors = [
    ["require('./debt-amortization.js')", 'plain call'],
    ["require( './debt-amortization.js' )", 'whitespace in the parens'],
    ["require?.('./debt-amortization.js')", 'optional call'],
    ['require("./debt-revolving.js")', 'double quotes, second module'],
    ["require('./debt-amortization')", 'extensionless specifier'],
    ["const x = 1 /require('./debt-amortization.js')/ 2;", 'swallowed by a regex-vs-division misread'],
  ];
  for (const [text, why] of survivors) {
    assert.ok(build.findRegisteredRequireText(text, REG),
      'the backstop must flag a surviving registered require -- ' + why + ' -- got nothing for: ' + text);
  }
});

test('P5-01: the backstop stays silent on text that is not a loader call', () => {
  /* Controls, and they are what keep the check from being a nuisance. The
     escaped-regex case is the round-8 auditor's own false-rejection control:
     registration does not make a regex's text executable, so a registered
     name inside a genuine regex must NOT fail the build. (Their published
     form of it does not compile -- inside a character class the `-` of
     debt-amortization forms an out-of-order range -- so the compiling form is
     used here, which is the same point made in valid JavaScript.) */
  const REG = { 'debt-amortization.js': 'DebtAmortization' };
  const benign = [
    ["/[require('./missing.js')]/", 'unregistered module inside a genuine regex'],
    ["/[require('.\\/debt\\-amortization\\.js')]/", 'REGISTERED name inside a genuine regex (auditor control)'],
    ['const s = "' + "require('./debt-amortization.js')" + '";', 'inside a string literal (Q34)'],
    ["// require('./debt-amortization.js')", 'inside a line comment'],
    ["/* require('./debt-amortization.js') */", 'inside a block comment'],
    ['const s = `' + "require('./debt-amortization.js')" + '`;', 'inside template literal text'],
    ["obj.require('./debt-amortization.js')", 'a property named require, not the loader'],
  ];
  for (const [text, why] of benign) {
    assert.equal(build.findRegisteredRequireText(text, REG), null,
      'the backstop must stay silent on ' + why + ': ' + text);
  }
});

test('P5-01: the BUILD PATH still invokes the backstop -- a swallowed registered require fails rewriting', () => {
  /*
   * S4 task 2b.1a, and the gap it closes was measured, not supposed.
   *
   * The two tests above call findRegisteredRequireText() DIRECTLY, which proves
   * the detector works and says nothing about whether the build still calls
   * it. Deleting its one call site in rewriteSiblingRequires() was tried in a
   * scratch clone of 624f6c0: the ENTIRE suite stayed green -- 1,480 tests,
   * 0 fail, GATE PASSED. The backstop could be disconnected in silence, which is
   * the same shape P5-01 itself shipped with: a check nobody watched run.
   *
   * A correct scanner cannot produce a survivor on demand -- that is why the
   * backstop exists. So this loads a COPY of build.js whose tokenizer misreads
   * every `/` as the start of a regex: the exact misjudgement the backstop was
   * written for. In that copy the scanner swallows the call as regex text, the
   * fail-closed second pass (same scanner) misses it too, and only the
   * backstop, which reads every `/` as division, can find it. The real builder
   * is only ever read, never changed.
   */
  const REG = { 'debt-amortization.js': 'DebtAmortization' };
  const input = "module.exports = function () { return 1 /require('./debt-amortization.js')/ 2; };";

  // Control: the real builder reads this `/` as division and rewrites the call,
  // so on correct code there is nothing for the backstop to find.
  const rewritten = build.rewriteSiblingRequires(input, REG);
  assert.ok(!/require\s*\(/.test(rewritten) && rewritten.includes('DebtAmortization'),
    'control: the real builder must rewrite the division-form require; got: ' + rewritten);

  const src = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  const TARGET = 'function regexMayStartAfter(tok) {';
  assert.equal(src.split(TARGET).length - 1, 1, 'the misreading copy must change exactly one site');
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'p5-01-invocation-'));
  const copyPath = path.join(dir, 'build-misreads-division.js');
  try {
    fs.writeFileSync(copyPath, src.replace(TARGET, TARGET + ' return true;'));
    const misreading = require(copyPath);
    assert.throws(() => misreading.rewriteSiblingRequires(input, REG),
      /a require for a REGISTERED sibling module survived rewriting/,
      'with a scanner that swallows the call, rewriting must fail through the P5-01 backstop -- ' +
      'if this passes quietly, the backstop is no longer invoked or no longer fires');
  } finally {
    delete require.cache[require.resolve(copyPath)];
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('P5-01: no executable source carries an invisible character', () => {
  /*
   * THE STRUCTURAL FIX, and the reason this finding is not just a typo.
   *
   * build.js shipped with a literal U+0001 where a \\1 backreference belonged:
   * a CORRECT fix corrupted in transit by shell escape processing. The regex
   * then demanded a SOH byte no source contains, so it never matched, so the
   * function was dead. Nothing saw it -- the character does not render, and
   * the witness above was disjunctive.
   *
   * Fixing the one byte closes the instance. This closes the CLASS: any
   * control character or zero-width/invisible codepoint in code that
   * executes. This repo has been bitten by the same family twice before with
   * U+200B in comments.
   *
   * Walks the filesystem rather than asking git, so it holds when the suite
   * is run against a bare extraction of the package with no .git present.
   */
  const INVISIBLE = new Map([
    [0x200B, 'ZERO WIDTH SPACE'], [0x200C, 'ZWNJ'], [0x200D, 'ZWJ'],
    [0xFEFF, 'BOM / ZWNBSP'], [0x00A0, 'NO-BREAK SPACE'],
    [0x2028, 'LINE SEPARATOR'], [0x2029, 'PARAGRAPH SEPARATOR'],
  ]);
  const SKIP = new Set(['node_modules', '.git', 'coverage']);
  const offenders = [];
  const scanned = [];

  /* Scope: the files this repo SHIPS.
     In the repo that means tracked files -- untracked scratch and, more to the
     point, FROZEN DELIVERY SNAPSHOTS must not fail the build. A handover
     directory legitimately contains the bytes that were delivered, defects
     included; rewriting history to satisfy a present-day gate would destroy
     the evidence an auditor checks against. In a bare extraction of the
     package there is no git, and then everything present IS the shipped set,
     so the walk is exactly right. Both paths feed the same scanner and the
     same anti-vacuity floor below. */
  let tracked = null;
  try {
    tracked = new Set(require('node:child_process')
      .execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0').filter(Boolean).map((f) => path.resolve(ROOT, f)));
  } catch { tracked = null; }

  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(?:js|html)$/.test(entry.name)) continue;
      if (tracked && !tracked.has(path.resolve(full))) continue;
      scanned.push(full);
      const text = fs.readFileSync(full, 'utf8');
      text.split('\n').forEach((line, idx) => {
        for (let col = 0; col < line.length; col++) {
          const code = line.charCodeAt(col);
          let what = null;
          if (code < 32 && code !== 9 && code !== 13) what = 'C0 control U+' + code.toString(16).padStart(4, '0');
          else if (code === 127) what = 'DEL U+007F';
          else if (INVISIBLE.has(code)) what = INVISIBLE.get(code) + ' U+' + code.toString(16).padStart(4, '0');
          if (what) offenders.push(path.relative(ROOT, full) + ':' + (idx + 1) + ' col ' + col + ' -- ' + what);
        }
      });
    }
  })(ROOT);

  /* Anti-vacuity, and it is not decoration: the first cut of this gate had a
     filter that matched a literal backslash, so it scanned ZERO files and
     passed while a planted U+0001 sat in the tree. A source-wide gate that
     measures nothing reports clean -- exactly ST2-02, committed by the guard
     written to close a false-assurance defect. Caught only by planting a
     control character and watching this test still pass. */
  assert.ok(scanned.length > 50,
    'the gate scanned only ' + scanned.length + ' files; a gate that scans nothing passes vacuously');
  assert.ok(scanned.some((f) => f.endsWith('build.js')),
    'the gate must reach build.js -- the file the original U+0001 actually shipped in');

  assert.deepEqual(offenders, [],
    'invisible characters in executable source -- this is how the P5-01 backstop shipped dead:\\n' + offenders.join('\\n'));
});

test('P5-02: an empty successful projection is damage', () => {
  const { classify } = loadClassifier();
  const p = cleanResult();
  p.rows = [];
  /* Pre-repair this returned `inert`: `rows` was checked for being an array and
     never for being a projection, so the required-field loop and the
     finite-value loop both ran zero times and equality reported success. */
  assert.equal(classify(p, structuredClone(p)).kind, 'corrupt-baseline');
});

test('P5-02: each guaranteed financial row field is required independently', () => {
  const { classify } = loadClassifier();
  /* Measured, not assumed: across the stored closing baseline's 36 entries and
     1,036 rows -- 17 simple, 16 historical, 3 Monte Carlo -- every one of these
     is present on every row, with zero empty projections. */
  for (const field of ['taxable', 'preTax', 'roth', 'hsa', 'income', 'shortfall', 'debtBalance']) {
    const p = cleanResult();
    p.rows.forEach((r) => { delete r[field]; });
    assert.equal(classify(p, structuredClone(p)).kind, 'corrupt-baseline',
      'deleting rows[].' + field + ' from every row must not classify as inert');
  }
});

test('P5-02: mutation-only structural damage is corruption and reaches the gate', () => {
  const h = loadClassifier();
  const complete = cleanResult();
  const mutated = cleanResult();
  mutated.rows = [];
  const verdict = h.classify(complete, mutated);
  assert.equal(verdict.kind, 'corrupt');

  const name = 'RP-03: a corruption verdict reaches the regression gate, rather than being tallied and dropped';
  h.setCache({
    tally: { inert: 0, loud: 0, 'silent-immaterial': 0, 'silent-material': 0, corrupt: 1, 'corrupt-baseline': 0 },
    findings: [{ seed: 1, path: 'retirement.expenses[0].name', kind: verdict.kind, detail: verdict.detail }],
  });
  assert.throws(() => h.registered[name](), /DAMAGED/);
});

test('P5-02 controls: legitimate results are still legitimate', () => {
  const { classify } = loadClassifier();

  /* A one-row opening snapshot is a real successful shape -- the rule is
     non-empty, not some minimum length. */
  const oneRow = cleanResult();
  oneRow.rows = [oneRow.rows[0]];
  assert.equal(classify(oneRow, structuredClone(oneRow)).kind, 'inert');

  /* Extra per-mode fields are metadata, not damage: the contract names what
     must be present, and deliberately does not require identical row schemas
     across modes, which this package does not have. */
  const richer = cleanResult();
  richer.rows.forEach((r) => { r.magi = 1000; r.inflationFactor = 1.02; });
  assert.equal(classify(richer, structuredClone(richer)).kind, 'inert');

  /* An INVALID result has its own contract and is classified before the
     successful-result rules run -- it must not be judged for missing rows. */
  const invalid = cleanResult();
  invalid.calculationError = true;
  invalid.calculationErrorCode = 'TAX_COMMIT_SHORTFALL';
  invalid.rows = [];
  assert.equal(classify(invalid, structuredClone(invalid)).kind, 'corrupt-baseline',
    'an invalid baseline is corrupt-baseline for being invalid, not for its row count');

  assert.equal(classify(cleanResult(), cleanResult()).kind, 'inert');
});

// ---------------------------------------------------------------------------
// P6-01 -- the scanner family, round 9. Four executable loaders still escaped.
// ---------------------------------------------------------------------------

/* Bytes are CONSTRUCTED, never typed, and never reflowed. Two of these
   witnesses are lexer-sensitive: W1 hides the loader behind a Unicode escape,
   and W4 is W3 plus a completed `${1}` interpolation -- a prefix that looks
   harmless and was the entire defect. Reflowing either changes what it
   proves, which is the rule both sides of this audit now hold. */
const BSLASH = String.fromCharCode(92);
const BTICK = String.fromCharCode(96);

const P6_WITNESSES = [
  ['unicode_escaped_identifier',
   'module.exports = requ' + BSLASH + 'u0069re(\'./debt-amortization.js\').x;', 2],
  ['conditional_expression_loader',
   'module.exports = (true ? require : null)(\'./debt-amortization.js\').x;', 2],
  ['await_as_identifier',
   'const await=12; module.exports = await / require(\'./debt-amortization.js\').x / 2;', 3],
  ['await_after_completed_interpolation',
   'const text = ' + BTICK + '${1}' + BTICK + '; const await=12; ' +
   'module.exports = await / require(\'./debt-amortization.js\').x / 2;', 3],
];

for (const [name, source, expected] of P6_WITNESSES) {
  test('P6-01: ' + name + ' is rewritten or refused, never emitted as a live loader', () => {
    /* The control first: each witness is VALID JavaScript that really does
       return `expected` when `require` resolves. A witness that does not run
       proves nothing -- round 8's own published witness failed exactly this
       way, and was withdrawn. */
    const control = runCode(source, true);
    assert.equal(control.value, expected,
      name + ' must be valid, executable JavaScript returning ' + expected +
      ' before it can witness anything; got ' + JSON.stringify(control));

    let output = null;
    try {
      output = build.rewriteSiblingRequires(source, REGISTRY);
    } catch (e) {
      /* A named refusal is an accepted outcome for a construct outside the
         supported grammar. Silently emitting an unresolved loader is not. */
      assert.match(String(e), /build|unsupported|require/i,
        name + ' was refused without naming the build, the unsupported construct or the require');
      return;
    }

    /* Pre-repair, all four of these emitted the source unchanged and threw
       `ReferenceError: require is not defined` in a browser. The comparison is
       of VALUES under each side's real conditions -- the rewritten module with
       no `require` in scope at all -- because comparing output TEXT would pass
       for a require left exactly as it was found. */
    assert.deepEqual(runCode(output, false), control,
      name + ' built, so it must behave identically with no require in scope. ' +
      'Pre-repair this emitted an unresolved loader: ASCII-only identifier ' +
      'scanning hid the escape, a conditional colon was mistaken for an ' +
      'object-literal key, `await` sat in the keyword set so its division read ' +
      'as a regex, and the fallback resumed inside a finished interpolation.');
  });
}

test('P6-01: the fallback detector reaches past a COMPLETED interpolation', () => {
  /* The specific blindness behind witness 4, tested directly rather than
     through a build that now rewrites it. The old helper returned as soon as
     it saw `${`, so the template's CLOSING backtick was read as a new OPENING
     one and everything after it was skipped. */
  const REG = { 'debt-amortization.js': 'DebtAmortization' };
  const after = 'const t = ' + BTICK + '${1}' + BTICK + '; require(\'./debt-amortization.js\');';
  assert.ok(build.findRegisteredRequireText(after, REG),
    'a registered loader sitting after a completed interpolation must still be seen');

  const nested = 'const t = ' + BTICK + '${ ' + BTICK + 'x' + BTICK + ' }' + BTICK +
    '; require(\'./debt-amortization.js\');';
  assert.ok(build.findRegisteredRequireText(nested, REG),
    'nested templates inside an interpolation must not swallow the code after them');

  /* Inside an interpolation is code, so a loader there is reachable too. */
  assert.ok(build.findRegisteredRequireText(
    'const t = ' + BTICK + '${ require(\'./debt-amortization.js\') }' + BTICK + ';', REG),
    'an interpolation is code, and a loader inside one must be seen');

  /* And the literal text of a template is NOT code. */
  assert.equal(build.findRegisteredRequireText(
    'const t = ' + BTICK + 'require(\'./debt-amortization.js\')' + BTICK + ';', REG), null,
    'template literal TEXT is data, not a dependency');
});

test('P6-01: the fallback resolves identifier escapes', () => {
  const REG = { 'debt-amortization.js': 'DebtAmortization' };
  assert.ok(build.findRegisteredRequireText(
    'requ' + BSLASH + 'u0069re(\'./debt-amortization.js\')', REG),
    'an escape-spelled loader must not hide from the check that exists to be independent');
});

test('P6-01: the contextual-keyword assumption is enforced, not assumed', () => {
  /* `await` and `yield` left NON_VALUE_KEYWORDS because they are contextual --
     legal identifiers in ordinary Script/CommonJS. That is sound only while no
     bundled module uses either as a KEYWORD. This is the test that fails on the
     day that stops being true, rather than the grammar silently going wrong. */
  const fs = require('node:fs');
  const offenders = [];
  for (const m of build.DEBT_MODULES) {
    const file = path.join(ROOT, 'src', m.file);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const hits = [];
    if (/\basync\b/.test(text)) hits.push('async');
    if (/function\s*\*/.test(text)) hits.push('function*');
    if (/\byield\b/.test(text)) hits.push('yield');
    if (hits.length) offenders.push(m.file + ': ' + hits.join(', '));
  }
  assert.deepEqual(offenders, [],
    'a bundled module now uses a construct that makes `await`/`yield` real keywords. ' +
    'NON_VALUE_KEYWORDS must be revisited before this ships:\n' + offenders.join('\n'));
});

test('P6-01 controls: object-literal keys and member calls are still untouched', () => {
  /* The key-position rule narrowed what counts as a property key. These are the
     constructs it must NOT have broken. */
  const key = 'const o = {require: () => ({x: 7})}; module.exports = o.require(\'./x.js\').x;';
  assert.deepEqual(runCode(build.rewriteSiblingRequires(key, REGISTRY), false),
    runCode(key, true), 'an object-literal `require:` key is not the loader');

  const member = 'const o = {require: () => ({x: 9})}; module.exports = o. require(\'./y.js\').x;';
  assert.deepEqual(runCode(build.rewriteSiblingRequires(member, REGISTRY), false),
    runCode(member, true), 'a member call named require is somebody else\'s method');

  const second = 'const o = {a: 1, require: () => ({x: 5})}; module.exports = o.require(\'./z.js\').x;';
  assert.deepEqual(runCode(build.rewriteSiblingRequires(second, REGISTRY), false),
    runCode(second, true), 'a `require:` key after a comma is still a key');
});

// ---------------------------------------------------------------------------
// P6-02 / S3-01 -- the comparator certified a changed baseline as identical
// ---------------------------------------------------------------------------

/* P7-04: THESE FIXTURES USED TO BE CONTAMINATED, AND IT MATTERED.
 *
 * The entry hash was the literal string 'h-100'. That is not a hash of
 * anything, so the tool rejected the snapshot for INTEGRITY before it ever
 * reached the missing-corpus-hash branch under test. The CLI regression test
 * below therefore PASSED against the unrepaired tool -- on an unrelated
 * refusal -- and the red-then-green claim made for it was not supported by the
 * bytes that shipped. The evidence was visible in this session's own probe
 * output ("stored entry hash h-100... does not match") and was read past.
 *
 * Built through captureEntry() now, so every hash is real and the ONLY thing
 * wrong with a fixture is the field the test removes on purpose. */
function tinySnap(total, inputHash, corpusHash) {
  const entry = baseline.captureEntry('tiny', { rows: [{ total }] });
  const meta = {
    formatVersion: 3, entryPoint: 'runPlan', entryCount: 1,
    complete: true, omissions: [],
  };
  if (inputHash !== undefined) meta.corpusInputHash = inputHash;
  meta.hash = corpusHash === undefined
    ? baseline.hashOf([[entry.name, entry.hash]])
    : corpusHash;
  if (corpusHash === null) delete meta.hash;      // the field under test, removed deliberately
  return { meta, entries: [entry] };
}

test('P7-04 precondition: the fixtures are sound except where a test breaks them', () => {
  /* A fixture that is invalid for an unrelated reason cannot witness anything.
     Asserted rather than assumed, because assuming it is exactly what went
     wrong. */
  const clean = tinySnap(100, 'same-input');
  assert.deepEqual(baseline.verifyIntegrity(clean), [],
    'a fixture with nothing removed must verify cleanly -- entry hash, corpus hash and all');

  const a = tinySnap(100, 'same-input');
  const b = tinySnap(200, 'same-input');
  assert.notEqual(a.entries[0].hash, b.entries[0].hash,
    'the two fixtures must genuinely differ in content, or a diff proves nothing');
  assert.equal(baseline.inputComparability(a, b).kind, 'same',
    'input identity must be KNOWN and equal, so the comparison is about outputs only');

  const stripped = tinySnap(100, 'same-input', null);
  assert.equal(stripped.meta.hash, undefined, 'the corpus hash is the one thing removed');
  assert.equal(baseline.verifyIntegrity(stripped).filter((p) => p.name !== '(corpus)').length, 0,
    'removing the corpus hash must be the ONLY problem the stripped fixture has');
});

test('P6-02: the CLI must not certify a changed baseline as identical', () => {
  /* THE PATH THAT WAS ACTUALLY BROKEN. The public API reported the change
     correctly the whole time -- an earlier version of this test exercised
     diffSnapshots and PASSED against the unrepaired tool, which made it
     vacuous for the defect it names. The false pass lived in the CLI's
     equality shortcut, so the CLI is what this drives, as a real process with
     a real exit code. */
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p602-'));
  const a = path.join(dir, 'before.json');
  const b = path.join(dir, 'after.json');
  fs.writeFileSync(a, JSON.stringify(tinySnap(100, 'same-input', null)));
  fs.writeFileSync(b, JSON.stringify(tinySnap(200, 'same-input', null)));

  const { spawnSync } = require('node:child_process');
  const run = spawnSync(process.execPath,
    [path.join(ROOT, 'tools', 'capture-baseline.js'), 'diff', a, b],
    { encoding: 'utf8' });
  const out = (run.stdout || '') + (run.stderr || '');

  assert.notEqual(run.status, null,
    'the CLI process must have RUN and exited; a null status means it was killed or ' +
    'never started, and asserting "status !== 0" on that would pass for the wrong reason');
  /* P7-04: the precondition is that no UNRELATED defect stops the run. A
     complaint about the CORPUS hash is the repair itself talking -- that is the
     field this test removes on purpose, and refusing it is the correct repaired
     behaviour. A complaint about an ENTRY hash is the contamination that made
     the first version of this test pass against the unrepaired tool, and it
     must never appear again. */
  assert.ok(!/stored entry hash/.test(out),
    'P7-04: an ENTRY-hash complaint means the fixture is invalid for a reason ' +
    'unrelated to the defect, so the tool never reaches the branch under test ' +
    'and the test would pass on the wrong error. Output:' + String.fromCharCode(10) + out);
  assert.ok(!/^IDENTICAL/m.test(out),
    'the CLI printed IDENTICAL over rows that differ 100 -> 200, because two ' +
    'absent corpus hashes compared  and took the ' +
    'equality shortcut past a per-entry diff that was working. Output:' +
    String.fromCharCode(10) + out);
  assert.notEqual(run.status, 0,
    'a changed baseline must never exit 0. Exit was ' + run.status + String.fromCharCode(10) + out);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('P6-02: the API reports the change too (control -- this path was never broken)', () => {
  /* Pre-repair: the CLI compared `before.meta.hash === after.meta.hash`, so
     two absent values compared equal, took the equality shortcut, and printed
     IDENTICAL with exit 0 over rows that genuinely differed -- bypassing the
     per-entry diff, which worked the whole time. `undefined === undefined` is
     the comparator's version of running a required-field loop zero times. */
  const before = tinySnap(100, 'same-input', null);
  const after = tinySnap(200, 'same-input', null);
  const report = baseline.diffSnapshots(before, after);
  assert.equal(report.length, 1,
    'rows differing 100 -> 200 must report as CHANGED even with no corpus hash on either side');
});

test('P6-02: an absent or malformed corpus hash is a problem, not a pass', () => {
  for (const [label, value] of [['absent', null], ['empty', ''], ['wrong type', 12345]]) {
    const snap = tinySnap(100, 'same-input', value);
    const problems = baseline.verifyIntegrity(snap);
    assert.ok(problems.some((p) => p.name === '(corpus)'),
      'a ' + label + ' corpus hash must be reported as malformed; verifyIntegrity stayed silent');
  }
});

test('S3-01: outputs are not comparable across DIFFERENT corpus inputs', () => {
  /* The outputs here are genuinely equal. The error was presenting that as an
     unqualified regression result when the two captures describe different
     scenarios -- equal outputs over different inputs is a coincidence.
     Corrected cause, verified in source: `corpusInputHash` IS exported and
     `assertComparable` IS reached by both entry points; it only ever compared
     FORMAT VERSIONS. A missing check, not an unexercised one. */
  const a = tinySnap(100, 'input-AAA', 'c1');
  const b = tinySnap(100, 'input-BBB', 'c1');
  assert.equal(baseline.inputComparability(a, b).kind, 'different');
  assert.throws(() => baseline.diffSnapshots(a, b), /DIFFERENT corpus inputs/,
    'two captures over different corpora must be refused, not reported identical');
});

test('S3-01 controls: same inputs still compare, legacy snapshots still permitted', () => {
  const same = tinySnap(100, 'input-same', 'c1');
  const alsoSame = tinySnap(100, 'input-same', 'c1');
  assert.deepEqual(baseline.diffSnapshots(same, alsoSame), [],
    'equal outputs over the same inputs is the ordinary pass and must stay one');

  const moved = tinySnap(200, 'input-same', 'c2');
  assert.equal(baseline.diffSnapshots(same, moved).length, 1,
    'different outputs over the same inputs is the ordinary regression and must stay one');

  /* P7-03: this used to assert `doesNotThrow`, which proved the helper worked
     and said nothing about what the PUBLIC diff returns. It returned a bare
     `[]` -- indistinguishable from a verified pass. Unknown identity is now
     refused at that boundary, and diagnostic inspection is an explicit opt-in
     that is deliberately NOT implied by allowIncomplete. */
  const legacyA = tinySnap(100, undefined, 'c1');
  const legacyB = tinySnap(100, undefined, 'c1');
  assert.equal(baseline.inputComparability(legacyA, legacyB).kind, 'unknown');
  assert.throws(() => baseline.diffSnapshots(legacyA, legacyB), /UNKNOWN/,
    'an unknown-identity comparison must not return an unqualified empty diff');
  assert.deepEqual(baseline.diffSnapshots(legacyA, legacyB, { allowUnknownInputs: true }), [],
    'diagnostic inspection stays available behind an explicit, named option');
  assert.throws(() => baseline.diffSnapshots(legacyA, legacyB, { allowIncomplete: true }), /UNKNOWN/,
    'incomplete-corpus permission must NOT imply unknown-input permission');

  /* One side only is still unknown, not "same". */
  assert.equal(baseline.inputComparability(tinySnap(100, 'x', 'c1'), legacyB).kind, 'unknown');
});

// ---------------------------------------------------------------------------
// P7-01 / P7-02 -- token boundaries and member position, round 10
// ---------------------------------------------------------------------------

/* U+03C0 is CONSTRUCTED. The audit's closing line is that visual similarity is
   not a substitute for preserving the bytes, and a pasted pi is exactly the
   kind of character that survives a copy looking right and arrives wrong. */
const PI = String.fromCharCode(0x3C0);

test('P7-01: a literal Unicode identifier is never rewritten into a different property', () => {
  /* THE WORST SHAPE THIS PROJECT HAS SEEN: not a refusal, not a crash, a
     DIFFERENT ANSWER. `obj.PIrequire(...)` returned 7; the build emitted
     `obj.PIDebtAmortization.x` and returned 99, as valid JavaScript, with no
     error anywhere. Identifier scanning used ASCII classes, so it split the
     name into punctuation + `require`, the member lookback saw the pi instead
     of a dot, and the SUFFIX of somebody's property was rewritten. V8's syntax
     check cannot see a behaviour change that still parses. */
  const src = "const obj={'" + PI + "require':()=>({x:7}),'" + PI + "DebtAmortization':{x:99}}; " +
    'module.exports = obj.' + PI + "require('./debt-amortization.js').x;";
  const control = runCode(src, true);
  assert.equal(control.value, 7, 'precondition: the witness returns 7 when require resolves');
  assert.deepEqual(runCode(build.rewriteSiblingRequires(src, REGISTRY), false), control,
    'the build emitted valid code returning 99 instead of 7 -- silently, and a test ' +
    'that only checked for exceptions would have passed');
});

test('P7-01: both spellings of one identifier reach the same answer', () => {
  /* The escaped spelling survived while the literal one was rewritten, so the
     scanner disagreed with itself about the same name. */
  const literal = "const obj={'" + PI + "require':()=>({x:7})}; " +
    'module.exports = obj.' + PI + "require('./debt-amortization.js').x;";
  const escaped = "const obj={'" + PI + "require':()=>({x:7})}; " +
    'module.exports = obj.' + BSLASH + "u03c0require('./debt-amortization.js').x;";
  for (const [label, src] of [['literal', literal], ['escaped', escaped]]) {
    assert.deepEqual(runCode(build.rewriteSiblingRequires(src, REGISTRY), false), runCode(src, true),
      'the ' + label + ' spelling must behave identically to its source');
  }
});

test('P7-01 control: an escape-spelled GLOBAL loader is still rewritten', () => {
  /* Widening the identifier grammar must not lose the round-9 repair. */
  const src = 'module.exports = requ' + BSLASH + "u0069re('./debt-amortization.js').x;";
  const out = build.rewriteSiblingRequires(src, REGISTRY);
  assert.ok(!/\brequire\s*\(/.test(out), 'a real escape-spelled loader must still be resolved');
  assert.deepEqual(runCode(out, false), runCode(src, true));
});

/* P7-02: every one of these is a MEMBER call on an object that happens to have
   a method named `require`, using a REGISTERED specifier. The previous controls
   used unregistered names, so the registration filter hid the regression --
   which is why the audit could find it and the supplied tests could not. */
const P7_MEMBER_FORMS = [
  ['adjacent', "obj.require('./debt-amortization.js')"],
  ['space-separated', "obj. require('./debt-amortization.js')"],
  ['comment-separated', "obj./*gap*/require('./debt-amortization.js')"],
  ['newline-separated', 'obj.' + String.fromCharCode(10) + "require('./debt-amortization.js')"],
  ['optional chaining', "obj?.require('./debt-amortization.js')"],
];

for (const [label, expr] of P7_MEMBER_FORMS) {
  test('P7-02: a member call named require is preserved -- ' + label, () => {
    const src = 'const obj={require:()=>({x:7})}; module.exports = ' + expr + '.x;';
    const control = runCode(src, true);
    assert.equal(control.value, 7, 'precondition: this is a member call returning 7');
    let out;
    try {
      out = build.rewriteSiblingRequires(src, REGISTRY);
    } catch (e) {
      assert.fail('a supported member call was REFUSED, which is a regression, not a ' +
        'safe outcome -- registration never turned a method argument into a dependency. ' +
        String(e.message).split(String.fromCharCode(10))[0]);
    }
    assert.deepEqual(runCode(out, false), control,
      label + ' member call must build and behave identically');
  });
}

test('P7-02: the fallback still detects real global loaders', () => {
  /* The audit was explicit: do not disable the fallback to make the member
     controls pass. Its independence from the main scanner's slash decision is
     the whole point, so it is asserted directly, not inferred from a build. */
  const REG = { 'debt-amortization.js': 'DebtAmortization' };
  const loaders = [
    "require('./debt-amortization.js')",
    "require( './debt-amortization.js' )",
    "require?.('./debt-amortization.js')",
    "const x = 1 /require('./debt-amortization.js')/ 2;",
    'requ' + BSLASH + "u0069re('./debt-amortization.js')",
  ];
  for (const text of loaders) {
    assert.ok(build.findRegisteredRequireText(text, REG),
      'the fallback must still flag a real global loader: ' + text);
  }
  const members = [
    "obj. require('./debt-amortization.js')",
    "obj./*g*/require('./debt-amortization.js')",
    "obj?.require('./debt-amortization.js')",
    'obj.' + PI + "require('./debt-amortization.js')",
  ];
  for (const text of members) {
    assert.equal(build.findRegisteredRequireText(text, REG), null,
      'the fallback must not flag a member call: ' + text);
  }
});

// ---------------------------------------------------------------------------
// P7-03 -- an empty diff is a claim, and it must not be made blindly
// ---------------------------------------------------------------------------

test('P7-03: an EMPTY diff is refused when corpus-input identity is unknown', () => {
  /* The empty array is this API's success representation. Returned unqualified
     for unknown identity, it is indistinguishable from a verified pass -- its
     only own property is `length`. Differences are still reported normally:
     it is AGREEMENT that cannot be qualified inside an array. */
  const verified = [tinySnap(100, 'same-input'), tinySnap(100, 'same-input')];
  assert.deepEqual(baseline.diffSnapshots(verified[0], verified[1]), [],
    'verified identity with equal output is the ordinary pass and must stay one');

  const unknown = [tinySnap(100, undefined), tinySnap(100, undefined)];
  assert.throws(() => baseline.diffSnapshots(unknown[0], unknown[1]), /UNKNOWN/,
    'equal output under unknown identity must not return a bare empty array');
  assert.deepEqual(baseline.diffSnapshots(unknown[0], unknown[1], { allowUnknownInputs: true }), [],
    'diagnostic inspection stays available behind an explicit, named option');

  /* A NON-empty diff carries no false assurance, so it is still reported. */
  const moved = baseline.diffSnapshots(tinySnap(100, undefined), tinySnap(200, undefined));
  assert.equal(moved.length, 1,
    'differences under unknown identity are honest and must still be reported');

  /* One side only is still unknown. */
  assert.throws(() => baseline.diffSnapshots(tinySnap(100, 'x'), tinySnap(100, undefined)), /UNKNOWN/);

  /* And the two permissions stay separate. */
  assert.throws(() => baseline.diffSnapshots(unknown[0], unknown[1], { allowIncomplete: true }), /UNKNOWN/,
    'incomplete-corpus permission must not imply unknown-input permission');
});

// ---------------------------------------------------------------------------
// P8-01 -- a property class applied to half a character tests nothing
// ---------------------------------------------------------------------------

/* Built from CODE POINTS, never pasted. The audit's closing line is that
   typing a visually similar glyph changes the witness, and a supplementary
   character is the case where that is most likely to happen silently. */
const SUPPLEMENTARY = [0x10400, 0x20000, 0x1D400, 0x10900];

test('P8-01: ID_Start accepts a supplementary character and rejects each half', () => {
  /* The premise, asserted rather than assumed -- this is WHY the round-10 fix
     was insufficient, and if it ever stops being true the repair below is
     answering a question nobody is asking. */
  const ch = String.fromCodePoint(0x10400);
  assert.equal(ch.length, 2, 'a supplementary character occupies two UTF-16 code units');
  const idStart = /[\p{ID_Start}$_]/u;
  assert.ok(idStart.test(ch), 'the whole character is a valid identifier start');
  assert.ok(!idStart.test(ch[0]), 'its first code unit alone is not');
  assert.ok(!idStart.test(ch[1]), 'its second code unit alone is not');
});

for (const cp of SUPPLEMENTARY) {
  const label = 'U+' + cp.toString(16).toUpperCase().padStart(5, '0');
  const CH = String.fromCodePoint(cp);

  test('P8-01: ' + label + ' at identifier START is not split', () => {
    /* The decoy property is kept deliberately: pre-repair this returned 99
       instead of 7 as VALID JavaScript, so a test checking only for exceptions
       would have passed. Several code points, because the fix has to handle
       WIDTH rather than one glyph. */
    const src = "const obj={'" + CH + "require':()=>({x:7}),'" + CH + "DebtAmortization':{x:99}}; " +
      'module.exports = obj.' + CH + "require('./debt-amortization.js').x;";
    const control = runCode(src, true);
    assert.equal(control.value, 7, 'precondition: the source returns 7');
    assert.deepEqual(runCode(build.rewriteSiblingRequires(src, REGISTRY), false), control,
      label + ' was split into half a character plus `require`, and the suffix of ' +
      "somebody else's property was rewritten -- returning 99, silently");
  });

  test('P8-01: ' + label + ' INSIDE an identifier is not split', () => {
    const src = "const obj={'a" + CH + "require':()=>({x:7}),'a" + CH + "DebtAmortization':{x:99}}; " +
      'module.exports = obj.a' + CH + "require('./debt-amortization.js').x;";
    const control = runCode(src, true);
    assert.equal(control.value, 7, 'precondition: the source returns 7');
    assert.deepEqual(runCode(build.rewriteSiblingRequires(src, REGISTRY), false), control,
      'continuation characters split too, so this is not only about the first character');
  });
}

test('P8-01 controls: escaped spellings, BMP identifiers and real loaders all hold', () => {
  const CH = String.fromCodePoint(0x10400);

  /* The escaped spelling of the same name always worked, and must keep working
     -- if it ever diverges from the literal, the scanner disagrees with itself
     about one identifier again. */
  const escaped = "const obj={'" + CH + "require':()=>({x:7})}; " +
    'module.exports = obj.' + BSLASH + "u{10400}require('./debt-amortization.js').x;";
  assert.deepEqual(runCode(build.rewriteSiblingRequires(escaped, REGISTRY), false),
    runCode(escaped, true), 'the escaped supplementary spelling must be preserved');

  /* The BMP witness from round 10 must not regress. */
  const pi = String.fromCharCode(0x3C0);
  const bmp = "const obj={'" + pi + "require':()=>({x:7}),'" + pi + "DebtAmortization':{x:99}}; " +
    'module.exports = obj.' + pi + "require('./debt-amortization.js').x;";
  assert.deepEqual(runCode(build.rewriteSiblingRequires(bmp, REGISTRY), false),
    runCode(bmp, true), 'P7-01 must stay closed');

  /* And widening the grammar must not cost the real-loader detection. */
  const REG = { 'debt-amortization.js': 'DebtAmortization' };
  assert.ok(build.findRegisteredRequireText("require('./debt-amortization.js')", REG),
    'a real global loader must still be found');
  assert.equal(build.findRegisteredRequireText('obj.' + CH + "require('./debt-amortization.js')", REG), null,
    'and a supplementary-spelled MEMBER call must not be mistaken for one');
});

// ---------------------------------------------------------------------------
// P8-02 -- completeness metadata was one equality test, and everything passed
// ---------------------------------------------------------------------------

const P8_OMISSION = { source: 'seeds', reason: 'Deliberately omitted in this diagnostic fixture' };

/* Valid entry hashes FIRST, then one deliberate metadata mutation -- the P7-04
   lesson, applied before it has to be learned again. */
function metaSnap(total, mutate) {
  const entry = baseline.captureEntry('tiny', { rows: [{ total }] });
  const meta = {
    formatVersion: 3, entryPoint: 'runPlan', entryCount: 1,
    corpusInputHash: 'same-input',
    hash: baseline.hashOf([[entry.name, entry.hash]]),
    complete: true, omissions: [],
  };
  mutate(meta);
  return { meta, entries: [entry] };
}

test('P8-02 precondition: the unmutated fixture is sound and verifies clean', () => {
  const clean = metaSnap(100, () => {});
  assert.deepEqual(baseline.verifyIntegrity(clean), [],
    'the base fixture must be valid, or every row below measures the wrong thing');
  assert.equal(baseline.completenessOf(clean).kind, 'complete');
});

const P8_MUTATIONS = [
  ['declared incomplete', (m) => { m.complete = false; m.omissions = [P8_OMISSION]; }, 'incomplete'],
  ['flag deleted', (m) => { delete m.complete; m.omissions = [P8_OMISSION]; }, 'malformed'],
  ['flag null', (m) => { m.complete = null; m.omissions = [P8_OMISSION]; }, 'malformed'],
  ['flag is the STRING "false"', (m) => { m.complete = 'false'; m.omissions = [P8_OMISSION]; }, 'malformed'],
  ['complete: true with an omission recorded', (m) => { m.omissions = [P8_OMISSION]; }, 'malformed'],
  ['omissions is not a list', (m) => { m.omissions = 'seeds'; }, 'malformed'],
];

for (const [label, mutate, expectedKind] of P8_MUTATIONS) {
  test('P8-02: ' + label + ' cannot become a regression pass', () => {
    const a = metaSnap(100, mutate);
    const b = metaSnap(100, mutate);

    /* Content integrity says nothing about metadata semantics -- that is the
       whole finding, so it is asserted rather than described. */
    assert.deepEqual(baseline.verifyIntegrity(a), [],
      'correct content hashes still report no problems; this defect is invisible to them');

    assert.throws(() => baseline.diffSnapshots(a, b), /complete|omission/i,
      label + ' returned a bare empty array, which is this API\'s success representation');
    
    /* The classification helper is checked AFTER the behaviour, deliberately:
       pre-repair it does not exist, and a test that dies on a missing helper
       goes red without ever reaching the defect -- which is P7-04 wearing a
       different hat. The refusal above is the finding; this is the label. */
    assert.equal(baseline.completenessOf(a).kind, expectedKind);
    assert.deepEqual(baseline.diffSnapshots(a, b, { allowIncomplete: true }), [],
      'the explicit diagnostic route stays open');

    /* Differing outputs must not launder it either. */
    assert.throws(() => baseline.diffSnapshots(metaSnap(100, mutate), metaSnap(200, mutate)),
      /complete|omission/i, 'a differing-output comparison is still not a regression result');
  });
}

test('P8-02 controls: a consistent capture and a genuine legacy snapshot both pass', () => {
  const good = [metaSnap(100, () => {}), metaSnap(100, () => {})];
  assert.deepEqual(baseline.diffSnapshots(good[0], good[1]), [],
    'complete: true with an empty omission list is the ordinary pass');
  assert.equal(baseline.diffSnapshots(metaSnap(100, () => {}), metaSnap(200, () => {})).length, 1,
    'and differences are still reported');

  /* SUPERSEDED BY P9-01, and the correction is the point of the test now.
     This asserted that a format-2 snapshot with the field absent compares
     silently green, on the premise that format identifies the completeness
     contract. The package's own after-CL artifact is format 3 with the field
     absent, so that premise is false. Absent metadata is UNKNOWN in every
     supported format, and unknown withholds AGREEMENT without withholding
     difference detection. */
  const legacy = metaSnap(100, (m) => { m.formatVersion = 2; delete m.complete; delete m.omissions; });
  const legacy2 = metaSnap(100, (m) => { m.formatVersion = 2; delete m.complete; delete m.omissions; });
  assert.equal(baseline.completenessOf(legacy).kind, 'unknown');
  assert.throws(() => baseline.diffSnapshots(legacy, legacy2), /completeness is UNKNOWN/,
    'absent metadata must not produce an unqualified empty diff, in any format');
  assert.deepEqual(baseline.diffSnapshots(legacy, legacy2, { allowIncomplete: true }), [],
    'the deliberate diagnostic route stays open');
  assert.equal(baseline.diffSnapshots(legacy, metaSnap(200, (m) => {
    m.formatVersion = 2; delete m.complete; delete m.omissions;
  })).length, 1, 'and DIFFERENCES are still reported without any opt-in at all');

  /* And completeness permission stays separate from input-identity permission. */
  const unknownInput = metaSnap(100, (m) => { delete m.corpusInputHash; });
  assert.throws(() => baseline.diffSnapshots(unknownInput, metaSnap(100, (m) => { delete m.corpusInputHash; })),
    /UNKNOWN/, 'allowIncomplete must not be needed to express, or able to grant, input identity');
});

// ---------------------------------------------------------------------------
// P9-01 -- "anything other than current format" is not a definition of legacy
// ---------------------------------------------------------------------------

const P9_OMISSION = { source: 'seeds', reason: 'Deliberately omitted in this diagnostic fixture' };
const AFTER_CL = path.join(ROOT, 'tools', 'baseline-20260910-after-CL-closure.json');

/* P9-02 IS THE REASON THIS HELPER EXISTS.
 *
 * The round-11 witness asserted `/complete|omission/i` against the thrown
 * message. The formatter then crashed with `(...).map is not a function` --
 * which contains the word "omissions", so the ACCIDENT satisfied the assertion
 * written to prove a DELIBERATE refusal, and the test was green over a defect.
 *
 * A tighter regex would not fix that; the outcome's SHAPE is what has to be
 * asserted. Three things, every time: something was thrown, it was not a
 * TypeError (a TypeError here means the tool fell over rather than refused),
 * and the message carries the classifier's own reason. */
function assertRefused(fn, needle, why) {
  let error = null;
  let value;
  try { value = fn(); } catch (e) { error = e; }
  assert.ok(error, why + ' -- nothing was thrown; it returned ' + JSON.stringify(value));
  assert.ok(!(error instanceof TypeError),
    'the tool must REFUSE, not fall over: got ' + error.constructor.name + ' -- ' + error.message);
  assert.ok(error.message.indexOf(needle) !== -1,
    why + ' -- expected the refusal to say ' + JSON.stringify(needle) + ', got: ' + error.message);
  return error;
}

/* Fixtures that are SOUND in the format they claim. captureEntry() hashes for
   the current format, so a fixture relabelled as format 1 or 2 without
   rehashing is invalid for a reason unrelated to the defect -- and would die at
   the integrity gate before reaching the behaviour under test. */
function fmtSnap(total, fv, mutate) {
  const snap = metaSnap(total, () => {});
  if (fv === undefined) delete snap.meta.formatVersion; else snap.meta.formatVersion = fv;
  const f = fv === undefined ? 1 : fv;
  snap.entries.forEach((e) => { e.hash = baseline.hashForFormat(e.result, f); });
  snap.meta.hash = baseline.hashOf(snap.entries.map((e) => [e.name, e.hash]));
  if (mutate) mutate(snap.meta);
  return snap;
}

test('P9-01 premise: the package ships a FORMAT-3 capture carrying no completeness metadata', () => {
  /* The entire correction rests on this file being what the audit says it is,
     so it is asserted rather than trusted. Round 11 concluded that format 3
     identifies the completeness contract; this artifact is the counterexample,
     and it was inside our own package the whole time. */
  const snap = JSON.parse(fs.readFileSync(AFTER_CL, 'utf8'));
  assert.equal(snap.meta.formatVersion, 3, 'it is in the CURRENT format');
  assert.equal(typeof snap.meta.formatVersion, 'number');
  assert.ok(!Object.prototype.hasOwnProperty.call(snap.meta, 'complete'),
    'and it carries no meta.complete');
  assert.ok(!Object.prototype.hasOwnProperty.call(snap.meta, 'omissions'),
    'and no meta.omissions');
  assert.equal(snap.entries.length, 36);
  assert.deepEqual(baseline.verifyIntegrity(snap), [],
    'and it verifies cleanly -- the CONTENT is sound; only the metadata is absent');
  assert.equal(baseline.completenessOf(snap).kind, 'unknown',
    'so format 3 cannot mean "carries the completeness contract"');
});

const P9_FORMATS = [
  ['numeric 3', 3, 'incomplete'],
  ['numeric 2', 2, 'incomplete'],
  ['numeric 1', 1, 'incomplete'],
  ['absent (format-1 inference)', undefined, 'incomplete'],
  ['numeric 4 (a FUTURE encoding)', 4, 'unsupported'],
  ['the string "3"', '3', 'unsupported'],
];

for (const [label, fv, expectedKind] of P9_FORMATS) {
  test('P9-01: explicit incompleteness is honoured when formatVersion is ' + label, () => {
    const mk = () => fmtSnap(100, fv, (m) => { m.complete = false; m.omissions = [P9_OMISSION]; });

    /* Precondition: the fixture is sound, so anything refused below is refused
       for the reason this test names. */
    assert.deepEqual(baseline.verifyIntegrity(mk()), [],
      'precondition: entry and corpus hashes agree with the contents');

    assert.equal(baseline.completenessOf(mk()).kind, expectedKind,
      'a future or mistyped version is NOT "legacy", and an older one does not ' +
      'erase an explicit declaration');
    assertRefused(() => baseline.diffSnapshots(mk(), mk()), 'capture-baseline:',
      label + ' reached a bare [] in package (9): a compatibility rule for ABSENT old ' +
      'metadata was overriding PRESENT evidence');
  });
}

test('P9-01: an unreadable encoding is refused, and allowIncomplete cannot grant it', () => {
  /* allowIncomplete says "I know this corpus is partial". That is not a claim
     about whether the tool can read the file at all, so it must not unlock one. */
  for (const fv of [4, '3', 3.5, true]) {
    const mk = () => fmtSnap(100, fv, (m) => { m.complete = true; m.omissions = []; });
    assert.equal(baseline.completenessOf(mk()).kind, 'unsupported',
      JSON.stringify(fv) + ' must classify as unsupported');
    assert.equal(baseline.encodingOf(mk()).kind, 'unsupported');
    assertRefused(() => baseline.diffSnapshots(mk(), mk()), 'meta.formatVersion',
      JSON.stringify(fv) + ' must be refused by default');
    assertRefused(() => baseline.diffSnapshots(mk(), mk(), { allowIncomplete: true }),
      'meta.formatVersion',
      JSON.stringify(fv) + ' must still be refused WITH allowIncomplete -- the option ' +
      'does not speak to whether the encoding is readable');
  }
  /* And the supported set still is supported. */
  for (const fv of [1, 2, 3]) {
    assert.equal(baseline.encodingOf(fmtSnap(100, fv, () => {})).kind, 'supported');
  }
});

test('P9-01: ABSENT metadata is UNKNOWN in every supported format -- neither pass nor declaration', () => {
  for (const fv of [1, 2, 3]) {
    const strip = (m) => { delete m.complete; delete m.omissions; };
    const mk = () => fmtSnap(100, fv, strip);
    const mkOther = () => fmtSnap(200, fv, strip);

    assert.equal(baseline.completenessOf(mk()).kind, 'unknown', 'format ' + fv);
    assert.deepEqual(baseline.verifyIntegrity(mk()), [], 'precondition: format ' + fv + ' fixture is sound');

    /* Not a silent pass -- that was the round-11 regression. */
    const err = assertRefused(() => baseline.diffSnapshots(mk(), mk()), 'completeness is UNKNOWN',
      'format ' + fv + ': absent metadata produced an unqualified empty diff');
    /* And not an accusation the file never made -- that was the second half of
       P9-01, and the tool was printing it about a real shipped artifact. */
    assert.ok(!/declares itself incomplete|declares meta\.complete/i.test(err.message),
      'format ' + fv + ': the file makes no incompleteness declaration and must not be ' +
      'described as making one. Got: ' + err.message);

    /* Only AGREEMENT is withheld. Differences carry no false assurance, so they
       are still reported with no opt-in at all -- the shipped format-1 and
       format-2 baselines stay usable, which is what the superseded control was
       really protecting. */
    assert.equal(baseline.diffSnapshots(mk(), mkOther()).length, 1,
      'format ' + fv + ': difference detection must not require permission');
    assert.deepEqual(baseline.diffSnapshots(mk(), mk(), { allowIncomplete: true }), [],
      'format ' + fv + ': the deliberate diagnostic route stays open');
  }
});

test('P9-01: the real historical artifact is refused without being accused of a declaration', () => {
  const snap = JSON.parse(fs.readFileSync(AFTER_CL, 'utf8'));
  const err = assertRefused(() => baseline.diffSnapshots(snap, snap), 'UNKNOWN',
    'the after-CL artifact must not yield an unqualified empty diff');
  assert.ok(!/declares itself incomplete|declares meta\.complete/i.test(err.message),
    'package (9) said this file "declares itself incomplete". It does not: ' + err.message);

  const os = require('node:os');
  const { spawnSync } = require('node:child_process');
  const run = spawnSync(process.execPath,
    [path.join(ROOT, 'tools', 'capture-baseline.js'), 'diff', AFTER_CL, AFTER_CL],
    { encoding: 'utf8' });
  const out = (run.stdout || '') + (run.stderr || '');
  assert.notEqual(run.status, null, 'the CLI must have run and exited');
  assert.notEqual(run.status, 0, 'unknown completeness must never exit 0: ' + out);
  assert.match(out, /COMPLETENESS UNKNOWN/, 'the CLI must name the state it found: ' + out);
  assert.ok(!/declares itself incomplete/.test(out),
    'and must not print a declaration this file never made: ' + out);
  assert.ok(!/TypeError|at Object\.<anonymous>/.test(out),
    'P9-02: no stack trace may reach the operator: ' + out);
  assert.ok(!/(baseline-20260910-after-CL-closure\.json[\s\S]*){2}/.test(
    out.split('COMPLETENESS UNKNOWN')[1].split('IDENTICAL')[0] || ''),
    'a file compared against itself is one problem, not two: ' + out);
  void os;
});

// ---------------------------------------------------------------------------
// P9-02 -- the formatter consumed metadata the classifier had just rejected
// ---------------------------------------------------------------------------

test('P9-02: a non-list omissions field yields the classified reason, not a TypeError', () => {
  const mk = () => fmtSnap(100, 3, (m) => { m.complete = true; m.omissions = 'seeds'; });
  const verdict = baseline.completenessOf(mk());
  assert.equal(verdict.kind, 'malformed', 'the CLASSIFIER was always right about this');
  assert.deepEqual(baseline.verifyIntegrity(mk()), [],
    'precondition: content is intact -- correct hashes say nothing about metadata');

  const err = assertRefused(() => baseline.diffSnapshots(mk(), mk()), verdict.label,
    'the public API must deliver the classifier reason it had already computed');
  assert.ok(!/is not a function/.test(err.message),
    'the refusal died inside its own error message: ' + err.message);

  /* The exact masking that made the round-11 witness green over this defect.
     Kept as an assertion so the hole cannot quietly reopen. */
  assert.ok(/complete|omission/i.test('(side[1].meta.omissions || []).map is not a function'),
    'documenting the trap: the round-11 regex accepted the accidental TypeError, because ' +
    'the crash text happens to contain the property name');
});

test('P9-02: malformed omission RECORDS render without crashing the refusal', () => {
  /* The collection is a list this time; its contents are junk. Rendering must
     survive that too -- the shape check is about every level, not just the top. */
  const mk = () => fmtSnap(100, 3, (m) => {
    m.complete = false;
    m.omissions = ['a bare string', null, 42, { source: 'seeds' }, { reason: 'no source' }];
  });
  const err = assertRefused(() => baseline.diffSnapshots(mk(), mk()), 'declares meta.complete = false',
    'a declared-incomplete capture must still refuse');
  assert.ok(!/is not a function|Cannot read/.test(err.message),
    'rendering junk records must not throw: ' + err.message);
  assert.ok(/no reason recorded|no source recorded|malformed omission record/.test(err.message),
    'and the junk must be described rather than silently dropped: ' + err.message);
});

test('P9-02: the CLI delivers the classified reason and exits cleanly, with no stack trace', () => {
  const os = require('node:os');
  const { spawnSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p902-'));
  const f = path.join(dir, 'malformed.json');
  fs.writeFileSync(f, JSON.stringify(fmtSnap(100, 3, (m) => {
    m.complete = true; m.omissions = 'seeds';
  }), null, 2));

  const run = spawnSync(process.execPath,
    [path.join(ROOT, 'tools', 'capture-baseline.js'), 'diff', f, f], { encoding: 'utf8' });
  const out = (run.stdout || '') + (run.stderr || '');
  assert.notEqual(run.status, null, 'the CLI must have run and exited');
  assert.notEqual(run.status, 0, 'a malformed capture must not exit 0: ' + out);
  assert.ok(!/TypeError|forEach is not a function|at Object\.<anonymous>/.test(out),
    'the CLI crashed mid-refusal and lost the reason. Output: ' + out);
  assert.match(out, /MALFORMED/, 'the refusal must name the classification: ' + out);
  assert.match(out, /not a list/, 'and the field-level reason: ' + out);
  assert.ok(!/declares itself incomplete/.test(out),
    'a malformed capture makes no incompleteness declaration: ' + out);
});

// ---------------------------------------------------------------------------
// P10-01 -- an explicit null version is a DECLARATION, not an absence
// ---------------------------------------------------------------------------

function p10Cli(snapshot, extra) {
  const os = require('node:os');
  const { spawnSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p10-'));
  const f = path.join(dir, 'fixture.json');
  /* Written and re-read as ORDINARY JSON: the defects below are reachable with
     no functions, getters, cycles or code execution anywhere in the input, and
     a fixture built only in memory would not prove that. */
  fs.writeFileSync(f, JSON.stringify(snapshot, null, 2));
  const run = spawnSync(process.execPath,
    [path.join(ROOT, 'tools', 'capture-baseline.js'), 'diff', f, f].concat(extra || []),
    { encoding: 'utf8' });
  return { status: run.status, out: (run.stdout || '') + (run.stderr || '') };
}

test('P10-01: a PRESENT null formatVersion is an unsupported declaration, not an absent one', () => {
  const mk = () => fmtSnap(100, null, (m) => { m.complete = true; m.omissions = []; });

  /* Precondition. Valid entry and corpus hashes and a known matching input
     hash, so the tool reaches the encoding gate rather than stopping short of
     it on an unrelated complaint. */
  assert.deepEqual(baseline.verifyIntegrity(mk()), [],
    'precondition: hashes agree, so nothing unrelated refuses first');
  assert.ok(Object.prototype.hasOwnProperty.call(mk().meta, 'formatVersion'),
    'precondition: the field is PRESENT and carries null -- that is the whole point');

  assert.equal(baseline.encodingOf(mk()).kind, 'unsupported',
    'null is a value the field carries, not evidence the field is missing');
  assert.equal(baseline.completenessOf(mk()).kind, 'unsupported');

  const err = assertRefused(() => baseline.diffSnapshots(mk(), mk()), 'meta.formatVersion',
    'a null declaration reached the PASS representation -- bare [] and exit 0');
  assert.ok(!/predates|legacy/i.test(err.message),
    'and it must not be described as a legacy encoding: ' + err.message);

  /* Neither diagnostic permission speaks to whether the file can be read. */
  assertRefused(() => baseline.diffSnapshots(mk(), mk(), { allowIncomplete: true, allowUnknownInputs: true }),
    'meta.formatVersion', 'no diagnostic permission may unlock an unreadable encoding');
});

test('P10-01: the CLI refuses a null version by name, with no exception and no success exit', () => {
  const snap = fmtSnap(100, null, (m) => { m.complete = true; m.omissions = []; });
  for (const extra of [[], ['--allow-incomplete']]) {
    const r = p10Cli(snap, extra);
    const how = extra.length ? 'with --allow-incomplete' : 'by default';
    assert.notEqual(r.status, null, how + ': the CLI must have run and exited');
    assert.notEqual(r.status, 0, how + ': a null declaration must not exit 0: ' + r.out);
    assert.match(r.out, /unreadable result encoding/, how + ': the refusal must be named: ' + r.out);
    assert.ok(!/TypeError|at Object\.<anonymous>/.test(r.out),
      how + ': a named refusal, not an exception: ' + r.out);
  }
});

test('P10-01 controls: genuine absence is still format 1, and every other spelling still refuses', () => {
  /* The distinction this finding turns on: ABSENCE is inferred, a PRESENT
     value is read. None of the stored baselines declares a null format, so
     nothing needs an exemption. */
  const absent = fmtSnap(100, undefined, (m) => { m.complete = true; m.omissions = []; });
  assert.ok(!Object.prototype.hasOwnProperty.call(absent.meta, 'formatVersion'),
    'precondition: the control really has no such field');
  assert.equal(baseline.encodingOf(absent).kind, 'supported');
  assert.equal(baseline.encodingOf(absent).version, 1);
  assert.equal(baseline.encodingOf(absent).declared, false);
  assert.deepEqual(baseline.diffSnapshots(absent, fmtSnap(100, undefined, (m) => {
    m.complete = true; m.omissions = [];
  })), [], 'a genuinely absent version still compares');

  for (const fv of [1, 2, 3]) {
    assert.equal(baseline.encodingOf(fmtSnap(100, fv, () => {})).kind, 'supported', 'format ' + fv);
  }
  for (const fv of [0, false, '', '3', 4, 3.5, [], {}]) {
    const mk = () => fmtSnap(100, fv, (m) => { m.complete = true; m.omissions = []; });
    assert.equal(baseline.encodingOf(mk()).kind, 'unsupported',
      JSON.stringify(fv) + ' must not be readable');
    assertRefused(() => baseline.diffSnapshots(mk(), mk()), 'meta.formatVersion',
      JSON.stringify(fv) + ' must refuse');
  }
});

// ---------------------------------------------------------------------------
// P9-02, reopened one level deeper -- record FIELDS were coerced unchecked
// ---------------------------------------------------------------------------

/* An own, non-callable `toString`. JSON.parse creates it from ordinary text:
   no functions, getters, cycles or code execution. String() finds toString
   uncallable, falls through to valueOf, gets the object back, and throws. */
const TOXIC = () => JSON.parse('{"toString":null}');

const P10_RECORDS = [
  ['source', () => ({ source: TOXIC(), reason: 'omitted fixture' })],
  ['reason', () => ({ source: 'seeds', reason: TOXIC() })],
];

for (const [field, record] of P10_RECORDS) {
  test('P9-02 (reopened): a malformed ' + field + ' VALUE still yields the classified reason', () => {
    const mk = () => fmtSnap(100, 3, (m) => { m.complete = false; m.omissions = [record()]; });

    assert.deepEqual(baseline.verifyIntegrity(mk()), [],
      'precondition: the fixture is sound; only this one field is malformed');
    const verdict = baseline.completenessOf(mk());
    assert.equal(verdict.kind, 'incomplete',
      'the CLASSIFIER was right about this too -- the defect is in presentation');
    assert.equal(verdict.label, 'declares meta.complete = false');

    const err = assertRefused(() => baseline.diffSnapshots(mk(), mk()), verdict.label,
      'the primary completeness reason must survive rendering a malformed ' + field);
    assert.ok(!/Cannot convert object to primitive/.test(err.message),
      'the refusal died inside its own error message again: ' + err.message);
    assert.match(err.message, new RegExp(field + ' is a object, not text'),
      'and the malformed field must be DESCRIBED rather than dropped: ' + err.message);
  });

  test('P9-02 (reopened): the CLI completes its refusal despite a malformed ' + field, () => {
    const r = p10Cli(fmtSnap(100, 3, (m) => { m.complete = false; m.omissions = [record()]; }));
    assert.notEqual(r.status, null, 'the CLI must have run and exited');
    assert.notEqual(r.status, 0, 'a declared-incomplete capture must not exit 0: ' + r.out);
    assert.ok(!/TypeError|Cannot convert object to primitive|at Object\.<anonymous>/.test(r.out),
      'the CLI crashed while rendering the record and lost its guidance: ' + r.out);
    assert.match(r.out, /INCOMPLETE — declares meta\.complete = false/,
      'the classified reason must reach the operator: ' + r.out);
    assert.match(r.out, /Recapture completely/,
      'and the refusal must COMPLETE, not stop mid-way: ' + r.out);
  });
}

test('P9-02 (reopened): the rule is that no value is rendered through its own conversion methods', () => {
  /* Beyond the JSON-reachable case on purpose. The audit showed one shape; the
     family is "a value decides how it converts". A record whose toString and
     valueOf both throw cannot arise from JSON.parse, and must still not be
     able to take the refusal down. Verify the family, not the example. */
  const hostile = {
    source: { toString() { throw new Error('hostile source'); },
              valueOf() { throw new Error('hostile source'); } },
    reason: { toString() { throw new Error('hostile reason'); },
              valueOf() { throw new Error('hostile reason'); } },
  };
  const mk = () => {
    const s = fmtSnap(100, 3, (m) => { m.complete = false; m.omissions = []; });
    s.meta.omissions = [hostile];
    return s;
  };
  const err = assertRefused(() => baseline.diffSnapshots(mk(), mk()), 'declares meta.complete = false',
    'a hostile record must not be able to suppress the refusal');
  assert.ok(!/hostile/.test(err.message),
    'no value may be given the chance to decide how it renders: ' + err.message);
});

test('P10: the unknown label makes no claim that absence cannot support', () => {
  /* Round 12 fixed the tool telling operators a file "declares itself
     incomplete" when it declared nothing -- and then the replacement label
     told them format 3 "predates the completeness contract", which is the
     opposite of the finding that produced it. A false statement can survive a
     repair by moving from the logic into the prose beside it. */
  const label = baseline.completenessOf(JSON.parse(fs.readFileSync(AFTER_CL, 'utf8'))).label;
  assert.ok(!/format \d+ predates/.test(label),
    'absence does not establish when a capture was taken: ' + label);
  assert.ok(!/declares/.test(label) || /neither a declaration/.test(label),
    'and it must not read as a declaration: ' + label);
  assert.match(label, /records no completeness metadata/,
    'it should say exactly what is true: ' + label);
});

// ---------------------------------------------------------------------------
// P11-A -- diagnostic rendering must not RUN the value it is describing
// ---------------------------------------------------------------------------

/* A counting hook. This cannot come from JSON.parse and is not claimed to be a
   file-reachable case: the point is that round 13 stated the rule as "no value
   is rendered through its own conversion methods, at any level" and then left
   JSON.stringify inside safeJson(), the helper written to implement that rule.
   The try/catch there caught the throw; it never stopped toJSON() RUNNING. */
function countingHook(onCall) {
  let calls = 0;
  return {
    value: { toJSON() { calls++; if (onCall) onCall(); return 'hook-controlled-label'; } },
    get calls() { return calls; },
  };
}

test('P11-A: a caller toJSON() is never invoked -- not once, on any path', () => {
  const hook = countingHook();
  const before = fmtSnap(100, 3, (m) => { m.complete = hook.value; });
  const after = fmtSnap(100, 3, () => {});

  assert.deepEqual(baseline.verifyIntegrity(before), [],
    'precondition: output and corpus hashes agree, so nothing unrelated refuses first');

  /* Direct classification. */
  assert.equal(baseline.completenessOf(before).kind, 'malformed');
  assert.equal(hook.calls, 0, 'classification ran the caller\'s callback ' + hook.calls + ' time(s)');

  /* And the whole API path, which used to call the classifier at three gates. */
  assertRefused(() => baseline.diffSnapshots(before, after), 'not a boolean',
    'malformed completeness must produce a NAMED refusal');
  assert.equal(hook.calls, 0,
    'the refusal path ran the callback ' + hook.calls + ' time(s); it previously ran three');

  /* The label must describe the value by type, never by asking it. */
  assert.ok(!/hook-controlled-label/.test(baseline.completenessOf(before).label),
    'the value supplied its own displayed representation: ' + baseline.completenessOf(before).label);
  assert.match(baseline.completenessOf(before).label, /\(an object\)/);
});

test('P11-A: a MUTATING hook cannot erase malformed completeness before the deciding gate', () => {
  /* The audit's witness. Rendering had a side effect that removed the very
     condition being rendered: the first gate searched only for unsupported
     encodings, the hook flipped meta.complete to true while its label was
     built, and the later completeness gate reclassified the mutated input as
     complete and returned a bare []. */
  const before = fmtSnap(100, 3, () => {});
  const after = fmtSnap(100, 3, () => {});
  let calls = 0;
  before.meta.complete = {
    toJSON() { calls++; before.meta.complete = true; return 'hook-controlled-label'; },
  };

  assertRefused(() => baseline.diffSnapshots(before, after), 'not a boolean',
    'a bare [] was returned over metadata that was malformed at entry');
  assert.equal(calls, 0, 'the callback ran ' + calls + ' time(s)');
  /* Checked by TYPE, not by JSON.stringify -- reading it that way would run
     the hook and report a mutation the test itself caused. The first cut of
     this probe did exactly that. */
  assert.equal(typeof before.meta.complete, 'object',
    'the caller\'s own metadata was mutated by rendering it');
});

test('P11-A: classification is computed ONCE per side and carried', () => {
  /* The structural half, and a defect on its own terms even with no callbacks:
     a verdict recomputed at each gate lets a later gate reach a different
     answer than the gate that already refused.

     THE DEFECT IS ASSERTED FIRST, THROUGH AN API THAT ALREADY EXISTED. The
     first cut of this test called baseline.classifySides() at the top, so
     pre-repair it died on "classifySides is not a function" -- red, but never
     reaching the behaviour under test. That is P7-04 again, and this suite has
     now caught it three rounds running; the helper is touched only after the
     behaviour has been established. */
  let reads = 0;
  const watched = fmtSnap(100, 3, () => {});
  const real = watched.meta.complete;
  Object.defineProperty(watched.meta, 'complete', { get() { reads++; return real; }, configurable: true });
  /* Deliberately NOT allowIncomplete: that option skips the completeness gate,
     which is one of the sites doing the repeated classification, so measuring
     there would show a low count against the unrepaired tool and prove
     nothing. The first cut of this test did exactly that and sailed past its
     own assertion. An ordinary passing diff exercises every gate. */
  assert.deepEqual(baseline.diffSnapshots(watched, fmtSnap(100, 3, () => {})), [],
    'precondition: this is the ordinary success path, so every gate is reached');
  assert.ok(reads <= 2,
    'meta.complete was read ' + reads + ' times in one diff; classifying once per side ' +
    'should read it at most once per side, and a verdict recomputed at each gate can ' +
    'differ from the verdict a previous gate already acted on');

  /* Only now the helper itself. */
  const sides = baseline.classifySides(fmtSnap(100, 3, () => {}), fmtSnap(200, 3, () => {}));
  assert.equal(sides.length, 2);
  assert.deepEqual(sides.map(([label]) => label), ['before', 'after']);
  assert.equal(sides[0][2].kind, 'complete');
});

test('P11-A: no conversion method of any kind is invoked, on any value shape', () => {
  /* Verify the family, not the example -- and assert it through the PUBLIC
     classifier, which existed before this repair, so the red is red for the
     behaviour rather than for a missing export. */
  for (const method of ['toJSON', 'valueOf', 'toString']) {
    let calls = 0;
    const probe = {};
    probe[method] = function () { calls++; return 'hook-controlled-label'; };
    const snap = fmtSnap(100, 3, (m) => { m.complete = probe; });

    const verdict = baseline.completenessOf(snap);
    assert.equal(verdict.kind, 'malformed', method + ': still classified correctly');
    assert.equal(calls, 0, 'the value\'s own ' + method + '() ran ' + calls + ' time(s)');
    assert.ok(!/hook-controlled-label/.test(verdict.label),
      method + ': the value supplied its own displayed text: ' + verdict.label);
  }

  /* A cycle, which JSON.stringify throws on rather than executing. Caught
     before was not the same as never attempted. */
  const cycle = {}; cycle.self = cycle;
  const cycleSnap = fmtSnap(100, 3, (m) => { m.complete = cycle; });
  assert.equal(baseline.completenessOf(cycleSnap).kind, 'malformed');
  assert.match(baseline.completenessOf(cycleSnap).label, /\(an object\)/,
    'a cycle is just an object, and describing one must not depend on rendering it');

  /* And only now the helper directly, for the shapes the classifier cannot
     route to it. */
  assert.equal(baseline.safeJson([1, 2]), '(an array)');
  assert.equal(baseline.safeJson(function named() {}), '(a function)');
  assert.equal(baseline.safeJson('text'), '"text"');
  assert.equal(baseline.safeJson(3), '3');
  assert.equal(baseline.safeJson(false), 'false');
  assert.equal(baseline.safeJson(null), 'null');
  assert.equal(baseline.safeJson(undefined), 'absent');
});

test('P11-A controls: ordinary metadata still classifies and still refuses correctly', () => {
  const ok = fmtSnap(100, 3, () => {});
  assert.equal(baseline.completenessOf(ok).kind, 'complete');
  assert.deepEqual(baseline.diffSnapshots(ok, fmtSnap(100, 3, () => {})), []);

  const declared = () => fmtSnap(100, 3, (m) => { m.complete = false; m.omissions = [P9_OMISSION]; });
  assert.equal(baseline.completenessOf(declared()).kind, 'incomplete');
  assertRefused(() => baseline.diffSnapshots(declared(), declared()), 'declares meta.complete = false',
    'an explicit declaration must still refuse');

  /* A JSON-only malformed flag -- no callables anywhere. */
  const jsonOnly = () => fmtSnap(100, 3, (m) => { m.complete = JSON.parse('{"toJSON":null}'); });
  assert.equal(baseline.completenessOf(jsonOnly()).kind, 'malformed');
  assertRefused(() => baseline.diffSnapshots(jsonOnly(), jsonOnly()), 'not a boolean',
    'the file-reachable shape must refuse the same way');
});

// ---------------------------------------------------------------------------
// P11-B -- object identity is not a statement about encoding compatibility
// ---------------------------------------------------------------------------

test('P11-B: separately parsed copies of one file reach the NAMED encoding refusal', () => {
  /* assertComparable() ran before the unsupported-encoding gate, read the RAW
     declarations, and concatenated them on mismatch. Two separate parses of
     the same bytes are structurally identical and are two distinct object
     references, so `a !== b` took the mismatch branch and the concatenation
     threw first. */
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p11b-'));
  const f = path.join(dir, 'object-version.json');
  const snap = fmtSnap(100, 3, () => {});
  snap.meta.formatVersion = JSON.parse('{"toString":null}');
  fs.writeFileSync(f, JSON.stringify(snap, null, 2));

  const c1 = JSON.parse(fs.readFileSync(f, 'utf8'));
  const c2 = JSON.parse(fs.readFileSync(f, 'utf8'));

  /* Precondition: the two copies really are the case this test is about. */
  assert.deepEqual(c1.meta.formatVersion, c2.meta.formatVersion, 'structurally identical');
  assert.notEqual(c1.meta.formatVersion, c2.meta.formatVersion, 'and NOT the same reference');
  assert.equal(baseline.encodingOf(c1).kind, 'unsupported');

  assertRefused(() => baseline.diffSnapshots(c1, c2), 'meta.formatVersion',
    'the format comparison coerced a raw declaration before the named refusal');

  /* THE CONTROL THAT MASKED THIS, kept and labelled as one. Comparing a
     snapshot with ITSELF passes because a reference equals itself, so it
     cannot reach the mismatch branch -- P7-02's lesson in a new place: a
     control that cannot reach the code it guards is not a control. */
  assertRefused(() => baseline.diffSnapshots(c1, c1), 'meta.formatVersion',
    'the same-reference path must refuse too, but it never proved the other one');

  /* And genuinely different SUPPORTED versions must still be refused as a
     format mismatch rather than swept into the encoding gate. */
  assertRefused(() => baseline.diffSnapshots(fmtSnap(100, 2, () => {}), fmtSnap(100, 3, () => {})),
    'refusing to diff format 2 against format 3',
    'real cross-format comparisons must still be refused for their own reason');
});

test('P11-B: the CLI refuses an object format declaration with no stack trace', () => {
  const snap = fmtSnap(100, 3, () => {});
  snap.meta.formatVersion = JSON.parse('{"toString":null}');
  for (const extra of [[], ['--allow-incomplete']]) {
    const r = p10Cli(snap, extra);
    const how = extra.length ? 'with --allow-incomplete' : 'by default';
    assert.notEqual(r.status, null, how + ': the CLI must have run and exited');
    assert.notEqual(r.status, 0, how + ': must not exit 0: ' + r.out);
    assert.ok(!/TypeError|Cannot convert object to primitive|at Object\.<anonymous>|at main/.test(r.out),
      how + ': a refusal escaped as a stack trace: ' + r.out);
    assert.match(r.out, /unreadable result encoding/,
      how + ': the refusal must be named: ' + r.out);
  }
});

// ---------------------------------------------------------------------------
// H12-01 -- "classify once" was true of the API and described as true of both
// ---------------------------------------------------------------------------

test('H12-01: no caller can hand assertComparable a verdict to trust', () => {
  /* Round 14 gave assertComparable a fourth parameter so diffSnapshots could
     pass verdicts it had already computed. That parameter was EXPORTED, which
     makes it a channel for "trust these verdicts" -- a way past every gate
     below it, introduced to avoid re-running a pure function. The internal
     carry now goes through a non-exported helper.

     The refusal must stand whatever a caller supplies alongside the data.

     THE FIXTURE HAS TO REACH THE GATE THIS FUNCTION ACTUALLY OWNS. The first
     cut of this test forged a completeness verdict -- but the completeness
     gate lives in diffSnapshots(), not here, so assertComparable() correctly
     did not throw and the test was red before AND after the repair, proving
     nothing either way. assertComparable owns the ENCODING gate, so that is
     the verdict worth forging. */
  const bad = () => fmtSnap(100, 4, (m) => { m.complete = true; m.omissions = []; });
  assert.equal(baseline.completenessOf(bad()).kind, 'unsupported',
    'precondition: the data really is refusable by the gate under test');
  const forged = [['before', bad(), { kind: 'complete', label: '' }],
                  ['after', bad(), { kind: 'complete', label: '' }]];

  assertRefused(() => baseline.assertComparable(bad(), bad(), {}, forged),
    'meta.formatVersion',
    'a forged verdict suppressed the encoding refusal the data itself requires');

  /* And the signature no longer advertises the channel. */
  assert.equal(baseline.assertComparable.length, 3,
    'assertComparable must not take caller-supplied verdicts');
});

test('H12-01: the API classifies each side exactly once per call', () => {
  /* The claim, pinned to a number rather than left as prose. The CLI is a
     SEQUENCE of calls and was described in round 14 as though it were one --
     it classified twice per side on an equal pair and three times on a changed
     one. That is a documentation defect, and the wording is narrowed in the
     ledger; this test pins the half that was always true. */
  const reads = [0, 0];
  const watch = (snap, i) => {
    const real = snap.meta.complete;
    Object.defineProperty(snap.meta, 'complete',
      { get() { reads[i]++; return real; }, configurable: true });
    return snap;
  };
  const before = watch(fmtSnap(100, 3, () => {}), 0);
  const after = watch(fmtSnap(100, 3, () => {}), 1);

  assert.deepEqual(baseline.diffSnapshots(before, after), [],
    'precondition: the ordinary success path, where every gate is reached');
  assert.deepEqual(reads, [1, 1],
    'meta.complete was read ' + reads.join('/') + ' times; exactly one classification ' +
    'per side means exactly one read per side');
});

