'use strict';
/*
 * Full-output baseline capture and diff.
 *
 * WHY THIS EXISTS. The regression layer (tests/golden-scenarios.test.js)
 * locks 5 hand-written scenarios at 3 rows each -- first/middle/last -- 9
 * fields, rounded to 2 decimals. That is a tripwire with a human-review
 * workflow attached, and it is deliberately not an identity proof. It cannot
 * answer the question the post-REOPEN repair round actually needs answered:
 *
 *     "This repair was SUPPOSED to move some numbers. Did it move ONLY
 *      those numbers?"
 *
 * Four repairs in this round (FM-01, FM-02, FM-03, FM-07) change financial
 * output by design, so the previous sprints' safety property -- the golden
 * fixture must be byte-identical -- cannot apply. What replaces it is the
 * fixture protocol: predict what moves, then explain every number that did.
 * A prediction is only checkable against a COMPLETE capture; against 3 of 72
 * rows at 2 decimals, an unintended change can hide inside an intended one.
 * That is exactly how SA-03 escaped an earlier sprint.
 *
 * The audit's own section F asks for this before the structural refactors,
 * and the FM-01 repair is structural.
 *
 * WHAT IT CAPTURES. Complete runPlan() output -- every row, every field, at
 * full precision -- over the golden set plus a seeded generated corpus from
 * tests/lib/scenario-generator.js, plus hand-built targeted scenarios the
 * generator cannot reach.
 *
 * FORMAT 2 -- runPlan(), ZERO EXCLUSIONS. S3 task 2, decided in
 * SPRINT_BRIEF_20260910_S3.md ("the migration decision, made here") and
 * recorded as SPRINT_QUESTIONS.md Q28. RR2-1 repaired RA-04 in this file but
 * did NOT decide the contract, so the brief's fallback applies: implement the
 * migration and record it.
 *
 * WHY IT IS STRICTLY STRONGER. Format 1 captured runScenario() and excluded
 * two fields as non-deterministic. runPlan() has NO nondeterminism at all:
 * Date.now() and Math.random() appear exactly twice in the engine, both in
 * generateScenarioId()/buildSimulationIdentity(), and runPlan() calls
 * neither -- only runScenario() does. Verified over the whole corpus (27/27
 * scenarios byte-identical across two calls), with the control that the same
 * measurement DOES report runScenario() as non-deterministic.
 *
 * So the rule is now "fail loudly on ANY nondeterminism", with no exclusion
 * list that can quietly widen. EXCLUDED is empty and a test asserts it stays
 * empty; adding an entry is a visible change rather than a silent one.
 *
 * FORMAT 1 CAPTURES STAY READABLE, AND ARE REFUSED FOR DIFFING. The eight
 * baseline-2026*.json files in this directory are format 1. Diffing one
 * against a format-2 capture would compare runScenario output against
 * runPlan output and report the whole identity block as removed -- a
 * misleading comparison dressed as a result. diffSnapshots() throws instead.
 *
 * USAGE
 *   node tools/capture-baseline.js capture <out.json>
 *   node tools/capture-baseline.js diff <before.json> <after.json>
 *   node tools/capture-baseline.js verify
 *
 * This tool REPLACES NOTHING. The golden tripwire and its review workflow
 * stay exactly as they are; the two serve different purposes.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const util = require('node:util');

const ROOT = path.join(__dirname, '..');
const SHELL_PATH = path.join(ROOT, 'src', 'app-shell.html');

/** The capture format this tool writes. Format 1 = runScenario + 2 exclusions. */
const CAPTURE_FORMAT = 3;

/** What format 1 excluded, kept so the refusal message can say what differs. */
/* P9-01: the capture formats this tool can actually READ. Nothing validated
 * this before: `formatVersionOf()` returns `meta.formatVersion || 1`, and
 * `hashForFormat()` asks `Number(formatVersion) >= 3`, so the string "3" and a
 * future 4 both hashed as format 3 and verified cleanly. An unreadable
 * encoding is its own answer -- it is not a completeness question, and it is
 * emphatically not "legacy". */
const SUPPORTED_FORMATS = [1, 2, 3];

const V1_EXCLUDED = ['identity.scenarioId', 'identity.runId'];

/* Fields that legitimately differ between two runs of identical source.
 * EMPTY, and that is the point of format 2 -- see the header. A test asserts
 * this stays empty. stripExcluded() is retained as the single funnel every
 * capture goes through, so that IF an exclusion is ever genuinely needed it
 * is added in one visible place rather than by special-casing a call site. */
const EXCLUDED = [];

const GENERATED_SEEDS = 20;

/* Measured field counts, exported so the assertions that pin them cannot
 * drift apart. S3 task 2 criterion 7 requires the capture to fail when the
 * engine gains or loses a field rather than letting it escape capture; task 9
 * criterion 3 asserts against these same figures and MUST read them from here.
 *
 * PER MODE, and that correction was made by S3 task 3b rather than here.
 * This constant was first written as a single {row:22, topLevel:16} pair,
 * measured against corpus()[0] -- a `simple` scenario. It passed. The worker
 * parity sweep then walked the WHOLE corpus and reported
 * `golden:monte-carlo-fixed-seed: 18 !== 16`.
 *
 * monteCarlo genuinely returns a different shape: it swaps
 * calculationErrorAge for calculationErrorPaths and adds requestedPathCount
 * and validPathCount (16 -> 18), and its rows carry three extra fields
 * (22 -> 25). The brief's own "22/25 and 16/18" was recording exactly this
 * pair; collapsing it to one number turned a coverage assertion into a
 * simple-mode assertion that could never see the other shape.
 *
 * Worth keeping as a comment rather than a fixed number: a field-count check
 * measured on ONE scenario is not a field-count check.
 *
 * `identity` is NOT part of a format-2 capture -- runPlan() does not produce
 * it. It is recorded because S3 task 3's worker-parity test compares
 * runScenario() output across the Worker boundary and needs to know that 13
 * identity fields exist, of which exactly 1 (runId) may differ. */
/* P9 (2026-09-10) added four row fields -- debtPaymentsTotal, debtInterest,
   debtPrincipal and debtHousing -- to the DETERMINISTIC row. Purely additive:
   no existing field changed name, meaning or value. Q35's working-period and
   interest/principal gap.
   
   MONTE CARLO IS DELIBERATELY UNCHANGED AT 25, and that is a recorded gap
   rather than an oversight. Its rows are percentile aggregates across runs,
   and there is no obvious meaning for "the 50th-percentile interest paid" --
   the median of a component need not belong to the same run as the median of
   the total, so an aggregated breakdown would not reconcile with the
   aggregated payments the way the deterministic one does. Deciding those
   semantics is a design question, so Q35's ledger currently covers simple and
   historical only. Recorded as Q40. */
const FIELD_COUNTS = {
  /* CL-02 added rmdDistributed and rmdUnmet to the deterministic row, so an
     obligation, what was actually distributed against it, and the gap between
     them are three separate reported quantities rather than one. Monte Carlo is
     unchanged for the reason recorded at Q40. */
  /* Q2 (A), result-contract version 3: five named income measures on every row, deterministic and Monte Carlo. */
  /* S5AA R19, result-contract version 5: the tax ledger's three fields (taxSettled, taxTrueUpPaid, taxOutstanding) on every
     deterministic row. Monte Carlo rows unchanged. */
  simple: { row: 36, topLevel: 16 },
  historical: { row: 36, topLevel: 16 },
  monteCarlo: { row: 30, topLevel: 18 },
  identity: 13,
};

/** The expected shape for a plan's mode. Throws on an unknown mode rather
 *  than defaulting, so a new simulation mode cannot silently inherit
 *  `simple`'s counts and pass a check it was never measured against. */
function fieldCountsFor(mode) {
  const counts = FIELD_COUNTS[mode];
  if (!counts) {
    throw new Error('capture-baseline: no measured field counts for mode ' + JSON.stringify(mode) +
      '. Measure them and add them to FIELD_COUNTS rather than reusing another mode\'s.');
  }
  return counts;
}

/* S3 task 2: the capture was running a PARTIAL engine, and nothing could see it.
 *
 * loadEngine() required src/engine.js and nothing else, so the six debt
 * namespaces build.js bundles into __debtModulesFactory were simply absent.
 * projectDebts() reaches DebtAmortization.monthlyPayment() only inside
 * `if(armRecastOnReset && pastReset && ...)`, so the gap was invisible for as
 * long as no captured scenario had BOTH the flag on and an adjustable debt --
 * and measurement says none ever did: 7 corpus scenarios set
 * armRecastOnReset:true, 4 carry an adjustable-rate debt, and 0 did both.
 *
 * The first scenario written to cross that branch (targeted:arm-flag-on)
 * crashed the capture with `ReferenceError: DebtAmortization is not defined`.
 * This is the SAME defect the re-audit found in buildLiveWorkerSource() --
 * a hand-assembled engine that is neither the main thread nor the worker --
 * living in the instrument that is supposed to certify the refactor.
 *
 * Fixed from build.js's own DEBT_MODULES registry rather than a hand-written
 * list here, so there is one definition of "which modules the engine needs"
 * and a seventh module (S3 task 6 adds one) is picked up automatically.
 * global.* mirrors the existing global.RULES convention that
 * tests/arm-payment-reamortization.test.js already uses. */
function installDebtModules() {
  /* P19: BUNDLED, not every registered module. The harness exists to give Node
     the graph the browser actually has; installing an excluded namespace would
     let tests pass against a graph the artifact does not ship, which is the
     third-assembly problem Q15 recorded. Modules excluded from the bundle are
     still require()-able directly by their own test files. */
  const { BUNDLED_MODULES } = require(path.join(ROOT, 'build.js'));
  BUNDLED_MODULES.forEach(({ file, namespace }) => {
    global[namespace] = require(path.join(ROOT, 'src', file));
  });
  return BUNDLED_MODULES.map((m) => m.namespace);
}

function loadEngine() {
  const shell = fs.readFileSync(SHELL_PATH, 'utf8');
  const rules = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
  if (!rules) throw new Error('capture-baseline: could not find the embedded rules JSON in app-shell.html');
  global.RULES = JSON.parse(rules[1]);
  installDebtModules();
  return {
    shell,
    engine: require(path.join(ROOT, 'src', 'engine.js')),
    golden: require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')),
  };
}

/** Deterministic key order, so a hash reflects values rather than insertion order. */
/* RC-05: the tags canonical() may emit. An object arriving as DATA that
   happens to carry one of these keys must not encode identically to the value
   the tag stands for, so such an object is wrapped in __escaped -- including
   an object already carrying __escaped, which keeps the rule self-consistent
   at any depth. Adding another unescaped tag would only relocate the
   ambiguity, which is what the addendum warned about. */
const RESERVED_TAGS = ['__nonFinite', '__negativeZero', '__undefined', '__escaped'];

function canonical(value) {
  /* RC-05: an undefined-valued field and an ABSENT field used to capture
     identically -- both hashing to be3af032c78b126cce1c1ba3e291b8e1d6ab8b3e0ea
     5613f43e805bf3fde7b4d -- because JSON.stringify drops the key entirely.
     Property PRESENCE was erased before the hash was taken, and integrity
     verification and snapshot diffing both reported clean. Tagged rather than
     normalised away, for the same reason -0 is: the harness preserves
     distinctions, it does not decide which ones matter. */
  if (value === undefined) return { __undefined: true };
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return { __nonFinite: String(value) };
      /* -0 is tagged for the same reason NaN is: JSON.stringify(-0) is "0",
         so without this a row that flipped sign captures to the identical
         hash as one that did not. Tagged rather than normalised away, because
         the harness's job is to preserve distinctions, not to decide which
         ones matter. Idempotent, like the rest of canonical(). */
      if (Object.is(value, -0)) return { __negativeZero: true };
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(canonical);
  /* CL-03: Object.create(null), not {}. A JSON object can legitimately carry an
     OWN "__proto__" property -- JSON.parse creates one -- and `out[k] = ...` on
     an ordinary object runs the inherited setter instead of storing it, so the
     property vanished and the value captured as an empty object. */
  const out = {};
  Object.keys(value).sort().forEach((k) => { assignOwn(out, k, canonical(value[k])); });
  /* RC-05: a literal { __nonFinite: 'NaN' } supplied as data used to encode
     exactly like an actual NaN, so a number-to-object regression was invisible
     after capture. These are SERIALIZATION collisions, not SHA-256 collisions:
     the hash was faithfully hashing two inputs the encoder had already made
     identical. */
  if (Object.keys(out).some((k) => RESERVED_TAGS.indexOf(k) >= 0)) return { __escaped: out };
  return out;
}

/* FC-02: a canonical, in-range array index -- 0 through 2^32-2. The upper
   bound is exclusive of 2^32-1 because an array's length must be able to
   exceed every index, so "4294967295" is a named property rather than an
   index and the iteration methods skip it. "01", "1.0", "-1" and "1e3" are
   likewise ordinary properties: the canonical round-trip is what decides. */
const MAX_ARRAY_INDEX = 4294967294;

function isArrayIndex(key) {
  const n = Number(key);
  return Number.isInteger(n) && n >= 0 && n <= MAX_ARRAY_INDEX && String(n) === key;
}

/* RC-05, the other half of P18: reject what the encoding cannot represent,
   BEFORE JSON erases the evidence. A function, symbol or bigint reaching a
   captured result means the engine returned something the baseline format was
   never designed to carry, and silently dropping it is how a capture comes to
   agree with a result it does not describe. */
function assertSupportedRawValue(value, path) {
  const t = typeof value;
  /* S4 task 3: A PROXY IS REFUSED FIRST, BEFORE ANY TRAP CAN RUN.

     Every check below answers for a Proxy exactly as it would for its target:
     getPrototypeOf, the own-property descriptors and Array.isArray all pass a
     Proxy of a plain object or array straight through. So a Proxy reached
     capture, was read once by this walk and again by structuralClone(), and its
     traps decided both answers. Measured before this check: a successRate
     getter counting its reads validated 1 and stored 2, and a Proxy array
     stored [200, 2] for an index that served 100 when validated. That is
     FCR-02's defect -- the value validated is not the value stored -- through
     a door the array-domain repair did not close.

     util.types.isProxy() reads an internal slot, not a trap, so the refusal
     itself runs no caller code. It stands above every other check for that
     reason: anything that asks the object a question first has already let it
     answer. */
  if (value !== null && (t === 'object' || t === 'function') && util.types.isProxy(value)) {
    throw new TypeError('capture-baseline: a Proxy at ' + (path || '<root>') + ' -- its traps answer ' +
      'every read, so the value this guard validates and the value the capture stores can differ. ' +
      'Refused before any trap runs; supported results are plain objects, arrays and primitives.');
  }
  /* CL-03: a Date captured as `{}` -- indistinguishable from an empty object,
     and from any other non-plain object. The first version of this guard
     rejected functions, symbols and bigints and stopped there, which let every
     class instance through to be silently flattened. */
  if (value !== null && t === 'object' && !Array.isArray(value)) {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new TypeError('capture-baseline: unsupported ' +
        (value.constructor && value.constructor.name || 'non-plain object') + ' at ' +
        (path || '<root>') + ' -- the capture format carries plain objects, arrays and ' +
        'primitives. A class instance is flattened to its enumerable own properties, so a ' +
        'Date and an empty object become the same capture.');
    }
  }
  /* CL-03: a HOLE is not a null. JSON.stringify renders both as null, so
     Array(1) and [null] captured identically.

     FCR-02: that check asked `i in value`, which consults the PROTOTYPE CHAIN,
     while the own-property loop further down uses getOwnPropertyNames(), which
     does not. So the two checks disagreed about what "present" means, and an
     index supplied by a custom prototype fell straight through the gap: it
     satisfied `i in value`, was invisible to the own-descriptor walk, and was
     then READ by structuralClone()'s map(). The getter ran once during
     validation and once during capture -- validation saw 1, the capture stored
     2. Two definitions of one contract, which is the defect family this
     project has now found in four separate tools.

     So the array domain is stated once, completely, and checked before
     anything reads an element: an ordinary Array.prototype, and every index in
     0..length-1 present as an OWN DATA property. An inherited index is refused
     whether it is a getter or plain data, so the hole policy no longer depends
     on which kind it happened to be. */
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new TypeError('capture-baseline: array with a non-standard prototype at ' +
        (path || '<root>') + ' -- an exotic prototype can supply indices the own-property ' +
        'walk cannot see, and can override the iteration methods the capture reads through, ' +
        'so the value validated need not be the value stored. Supported arrays inherit from ' +
        'Array.prototype and nothing else.');
    }
    for (let i = 0; i < value.length; i++) {
      const key = String(i);
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        throw new TypeError('capture-baseline: ' +
          (key in value ? 'inherited index "' + key + '"' : 'sparse array hole') +
          ' at ' + (path || '<root>') + '[' + i + '] -- a hole, an inherited index and an ' +
          'explicit null all serialize identically, so the distinction cannot survive ' +
          'capture. Fill it with an own value or reject the result upstream.');
      }
      /* Read the DESCRIPTOR, never the value: an accessor must be refused
         without being invoked, or the refusal has already had the side effect
         it exists to prevent. */
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (typeof d.get === 'function' || typeof d.set === 'function') {
        throw new TypeError('capture-baseline: accessor property "' + key + '" at ' +
          (path || '<root>') + '[' + key + '] -- an indexed getter is invoked once by ' +
          'validation and again by the capture, so the value checked is not the value ' +
          'stored.');
      }
    }
  }
  if (t === 'function' || t === 'symbol' || t === 'bigint') {
    throw new TypeError('capture-baseline: unsupported ' + t + ' at ' + (path || '<root>') +
      ' -- the capture format carries JSON-representable values, tagged non-finite numbers, ' +
      'negative zero and undefined. Reaching this means the engine returned something new; ' +
      'decide what it should mean before widening the format.');
  }
  if (value === null || t !== 'object') return;
  /* CR2-04: THE GUARD ONLY LOOKED WHERE THE ENCODER LOOKED, so anything the
     encoder could not see was accepted and then erased by it.

     structuralClone() copies an array with value.map(), which reads indices and
     nothing else. Object traversal uses Object.keys(), which returns enumerable
     own STRING keys only. So three kinds of own property reached capture, were
     validated by a walk that never visited them, and vanished:

       - a non-index own property on an array. Attaching unfundedAmount = 50000
         to [1] and capturing it produced BYTE-IDENTICAL output to a bare [1],
         same entry hash, verifyIntegrity() clean, diffSnapshots() []. Two
         different results, one capture.
       - a symbol-keyed property. Symbol VALUES were already rejected; symbol
         KEYS were never inspected, so an object carrying a $50,000 field under
         a symbol collided with {}.
       - a non-enumerable or accessor own property, which Object.keys() skips
         for the same reason.

     These are constructed harness inputs, not shapes today's engine emits. The
     point is that the raw-domain guard exists precisely to catch a FUTURE
     unexpected shape, and it was blind to three of them. Refused with a
     path-specific error rather than encoded, because widening the format needs
     a persistence oracle and a decision about what the new shape MEANS. */
  const symbolKeys = Object.getOwnPropertySymbols(value);
  if (symbolKeys.length) {
    throw new TypeError('capture-baseline: symbol-keyed property ' + String(symbolKeys[0]) +
      ' at ' + (path || '<root>') + ' -- the capture walks string keys only, so this ' +
      'property would be dropped and the result would capture identically to one without ' +
      'it. Symbol VALUES were already refused; the key side was not.');
  }
  if (Array.isArray(value)) {
    Object.getOwnPropertyNames(value).forEach((k) => {
      if (k === 'length') return;
      /* An array index is a canonical non-negative integer string. "01" and
         "1.0" are ordinary properties, not indices, and map() skips them.
         FC-02: the test was `String(Number(k) >>> 0) === k`, which is the
         unsigned-32-bit range -- one larger than the index range. The maximum
         array index is 2^32-2, because length must be able to exceed it, so
         "4294967295" is an ordinary named property that map() skips. It was
         waved through as an index: `a = [1]; a['4294967295'] = 50000` kept
         length 1, dropped the fifty thousand, and captured to the same hash as
         [1]. The guard whose whole purpose is to make an unexpected shape fail
         visibly was silently erasing one. */
      if (!isArrayIndex(k)) {
        throw new TypeError('capture-baseline: own property "' + k + '" on an array at ' +
          (path || '<root>') + ' -- the capture clones arrays with map(), which reads indices ' +
          'only, so this property is dropped and the array captures identically to one ' +
          'without it.');
      }
      /* FC-02: the array branch returned before the descriptor checks below,
         so an accessor at an INDEX was never refused the way an accessor at a
         named key is. Worse than an inconsistency: validation walked the array
         with forEach and capture read it again, so a getter ran twice and the
         value that was validated was not the value that was stored. Refused
         here, before any element is read, so the getter never runs at all. */
      const d = Object.getOwnPropertyDescriptor(value, k);
      if (typeof d.get === 'function' || typeof d.set === 'function') {
        throw new TypeError('capture-baseline: accessor property "' + k + '" at ' +
          (path || '<root>') + '[' + k + '] -- an indexed getter is invoked once by ' +
          'validation and again by the capture, so the value checked is not the value ' +
          'stored. Accessors at named keys were already refused; the index case reached ' +
          'the same defect by a path that returned before the check.');
      }
    });
    value.forEach((v, i) => assertSupportedRawValue(v, (path || '') + '[' + i + ']'));
    return;
  }
  Object.getOwnPropertyNames(value).forEach((k) => {
    const d = Object.getOwnPropertyDescriptor(value, k);
    if (!d.enumerable) {
      throw new TypeError('capture-baseline: non-enumerable own property "' + k + '" at ' +
        (path || '<root>') + ' -- Object.keys() skips it, so it is dropped by both the ' +
        'validator and the encoder.');
    }
    if (typeof d.get === 'function' || typeof d.set === 'function') {
      throw new TypeError('capture-baseline: accessor property "' + k + '" at ' +
        (path || '<root>') + ' -- a getter is re-invoked on every traversal, so what the ' +
        'capture records is not guaranteed to be what a later read returns.');
    }
  });
  Object.keys(value).forEach((k) => {
    assertSupportedRawValue(value[k], (path ? path + '.' : '') + k);
  });
}

/* RA-04: a structural clone that PRESERVES non-finite numbers.
 *
 * This replaces JSON.parse(JSON.stringify(result)). That round-trip silently
 * converts NaN, Infinity and -Infinity to null, and it ran BEFORE canonical()
 * -- so canonical()'s non-finite tagging, which is correct, was executing on
 * values that could no longer be non-finite. All four collapsed to one hash.
 *
 * Deliberately narrow: plain objects and arrays are what runScenario()
 * returns, and anything exotic appearing here should be a visible surprise
 * rather than something a clever clone quietly accommodates. */
/* CL-03: assign a key WITHOUT running an inherited setter.
 *
 * Only "__proto__" needs this -- it is the one inherited accessor on
 * Object.prototype, so `out[k] = v` for that key silently sets a prototype
 * instead of storing a property, and a JSON object legitimately carrying an own
 * "__proto__" captured as `{}`.
 *
 * A null-prototype object would also fix it, and was tried first. It changes the
 * prototype of EVERY captured object, which changes deepStrictEqual for every
 * consumer comparing a capture against an object literal -- a far wider change
 * than the defect. Defining the one key keeps ordinary objects ordinary. */
function assignOwn(target, key, value) {
  if (key === '__proto__') {
    Object.defineProperty(target, key,
      { value: value, enumerable: true, writable: true, configurable: true });
  } else {
    target[key] = value;
  }
  return target;
}

function structuralClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(structuralClone);
  /* CL-03: null-prototype here for the same reason as in canonical(). This
     runs FIRST, so an own "__proto__" was already gone by the time
     canonicalization saw the value -- fixing only the later function left the
     collision exactly where it was. */
  const out = {};
  Object.keys(value).forEach((k) => { assignOwn(out, k, structuralClone(value[k])); });
  return out;
}

/* `list` defaults to EXCLUDED, which under format 2 is empty -- so this is
 * normally an identity function. The parameter exists so the funnel's real
 * behaviour stays TESTABLE: called with the live list it now asserts nothing,
 * and a helper whose only test is vacuous is a helper nobody can trust on the
 * day an exclusion genuinely has to be added. */
function stripExcluded(result, list) {
  const copy = structuralClone(result);
  (list || EXCLUDED).forEach((dotted) => {
    const parts = dotted.split('.');
    let node = copy;
    for (let i = 0; i < parts.length - 1 && node; i++) node = node[parts[i]];
    if (node && Object.prototype.hasOwnProperty.call(node, parts[parts.length - 1])) {
      delete node[parts[parts.length - 1]];
    }
  });
  return copy;
}

function hashOf(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

/* RA-04: the single path every capture goes through, exported so tests
 * exercise IT rather than hashOf() in isolation. The old non-finite test
 * asserted hashOf({v:NaN}) !== hashOf({v:null}) -- true, and irrelevant,
 * because the defect was upstream of hashOf. A test that can only reach the
 * last helper in a pipeline cannot speak for the pipeline.
 *
 * The stored form is CANONICAL, not raw. Preserving NaN through the clone is
 * not enough on its own: the snapshot is written with JSON.stringify, which
 * would convert it straight back to null on the way to disk. Canonicalising
 * before storage turns it into {__nonFinite:"NaN"}, which is JSON-safe and
 * still distinguishable. canonical() is idempotent, so hashes of captures
 * taken before this change remain valid. */
/**
 * The sources a capture's numbers actually came from, by content hash.
 *
 * S3-03: this was a hand-written list of FOUR files, while loadEngine()
 * installs every bundled debt module and the engine calls into them. A capture
 * could therefore claim to describe the sources it ran on while omitting eight
 * of them -- edit `src/debt-amortization.js`, whose monthlyPayment() the engine
 * genuinely calls, and the manifest reported that nothing had changed.
 *
 * The list is now DERIVED from the same registry installDebtModules() reads,
 * so there is one definition of "which modules the engine needs" rather than
 * two that can disagree. That is the same repair P10 applied to the Worker
 * bindings and P19 to the bundle: a set that exists in two places, one of them
 * hand-maintained, is the defect rather than its symptom.
 *
 * BACKWARD COMPATIBLE by construction: `meta.sourceHashes` is written into a
 * capture and never compared between captures, so a snapshot taken before this
 * change keeps its four-entry block and stays readable and diffable. Nothing
 * here rewrites a historical hash.
 *
 * NOT DONE HERE, and left to the rest of S3-03: explicit engine/schema/runtime
 * version fields, and verifying a claimed commit against the blobs it names.
 * Those are provenance ASSERTIONS; this is the inventory they would assert
 * over, and it had to be right first.
 */
const FIXED_SOURCE_FILES = [
  'src/engine.js', 'src/app-shell.html', 'src/scenario-validator.js', 'build.js',
];

function sourceFiles() {
  const { BUNDLED_MODULES } = require(path.join(ROOT, 'build.js'));
  /* Bundled, not registered: an excluded module is not loaded by
     installDebtModules(), so hashing it would describe an input this capture
     did not have. Same reasoning as the harness itself. */
  const fromRegistry = BUNDLED_MODULES.map((m) => 'src/' + m.file);
  return FIXED_SOURCE_FILES.concat(fromRegistry).sort();
}

function sourceHashes() {
  const out = {};
  sourceFiles().forEach((f) => {
    out[f] = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
  });
  return out;
}

/* S4 task 5.4 (S4-PA-10): THE EXECUTION BOUNDARY.
 *
 * Several sessions edit this tree at once, and task 5.1 measured what that does
 * to a capture: after-CL-closure was taken from a working tree holding the NEXT
 * commit's uncommitted changes, recorded the PREVIOUS commit, and passed every
 * check this tool had. meta.hash covers the entries, not the provenance, and
 * nothing compared sourceHashes with the commit they sat beside.
 *
 * Two additions. Both are metadata: no entry, entry hash, corpus hash or input
 * hash moves.
 *
 *   meta.inputGraph  EVERY input a capture reads, not only the engine: source
 *                    and bundled modules, the builder, the shell with its
 *                    embedded rules, the corpus definitions and generator, this
 *                    instrument, the dependency lockfile, the runtime, and each
 *                    Monte Carlo scenario's seed and path count. The declared
 *                    list is held to what a FRESH process actually loads
 *                    (tests/capture-boundary.test.js), so it cannot become a
 *                    second definition that disagrees with the code.
 *   meta.boundary    whether every declared input is, byte for byte, the
 *                    committed content of the commit this capture records --
 *                    checked after the run, with the inputs re-hashed to catch
 *                    an edit made while the engine ran. A line-ending
 *                    conversion is a different byte sequence and counts.
 *                    Outside a checkout of its own repository there is no
 *                    commit to hold the inputs to, so the capture is
 *                    unqualified: provenance is never borrowed (Q37).
 *
 * An unqualified capture is written but EXPLICITLY DISQUALIFIED. With
 * --measured it is refused and nothing is written. Take measured captures in an
 * isolated worktree of a pinned commit:
 *
 *   git -c core.longpaths=true worktree add --detach <path> <commit>
 *
 * What this cannot see: a module loaded earlier in the SAME process, before
 * capture() hashed anything. That is why a measured capture is a fresh CLI
 * process and not a call from inside a test.
 */
const INSTRUMENT_FILE = 'tools/capture-baseline.js';
/* Read by the capture but not require()d, so no module walk can find them.
   src/boolean-flag-contract.json: S5 2l's engine boundary reads the Q53
   contract as data (fs, not require), so the flag list stays one definition
   without becoming a module input. Declared in its own instrument commit, ahead
   of that first reader; until then the capture hashes a file it does not read. */
const DATA_INPUTS = ['package-lock.json', 'src/app-shell.html', 'src/boolean-flag-contract.json'];
const CORPUS_INPUTS = {
  control: ['tests/lib/golden-scenario-defs.js', 'tests/lib/scenario-generator.js'],
  expanded: ['tests/lib/golden-scenario-defs.js', 'tests/lib/scenario-generator.js', 'tests/lib/corpus-expansion.js', 'tests/lib/debt-classes.js'],
};
const ARTIFACT_FILE = 'investment-calculator-v2c.html';

function captureInputs(options) {
  const composition = compositionOf(options);
  return [...new Set(sourceFiles().concat(CORPUS_INPUTS[composition], [INSTRUMENT_FILE], DATA_INPUTS))].sort();
}

function hashFiles(files) {
  const out = {};
  files.forEach((f) => {
    let bytes = null;
    try { bytes = fs.readFileSync(path.join(ROOT, f)); } catch (e) { bytes = null; }
    out[f] = bytes === null ? null : crypto.createHash('sha256').update(bytes).digest('hex');
  });
  return out;
}

function jsdomVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'jsdom', 'package.json'), 'utf8')).version;
  } catch (e) {
    return null;
  }
}

function inputGraphOf(hashes, scenarios) {
  return {
    files: hashes,
    runtime: { node: process.version, jsdom: jsdomVersion() },
    monteCarlo: scenarios
      .filter(({ plan }) => plan.assumptions && plan.assumptions.method === 'monteCarlo')
      .map(({ name, plan }) => ({
        name,
        seed: plan.assumptions.seed === undefined ? null : plan.assumptions.seed,
        runs: plan.assumptions.runs === undefined ? null : plan.assumptions.runs,
      })),
    /* Recorded, not loaded. runPlan() runs the source modules, so the shipped
       build sits BESIDE this capture rather than feeding it; which build the
       tree held is still worth a line. */
    artifact: { file: ARTIFACT_FILE, sha256: hashFiles([ARTIFACT_FILE])[ARTIFACT_FILE], loaded: false },
  };
}

/* One git process for every input: `git cat-file --batch`, parsed by size. */
function committedObjects(commit, files) {
  const { execFileSync } = require('node:child_process');
  const buf = execFileSync('git', ['cat-file', '--batch'], {
    cwd: ROOT, input: files.map((f) => commit + ':' + f).join('\n') + '\n', maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'ignore'],
  });
  const out = new Map();
  let at = 0;
  for (const f of files) {
    const nl = buf.indexOf(0x0a, at);
    const m = buf.slice(at, nl).toString('utf8').match(/^[0-9a-f]{40,64} (\w+) (\d+)$/);
    at = nl + 1;
    if (!m) continue; /* "<spec> missing": not in the commit */
    const size = Number(m[2]);
    if (m[1] === 'blob') out.set(f, buf.slice(at, at + size));
    at += size + 1;
  }
  return out;
}

/* Is every input the committed bytes of the commit gitCommit() would record?
   options.read replaces the working-tree reader, so the comparison can be
   exercised without editing a real file. */
function boundaryOf(files, options) {
  const read = (options && options.read) || ((f) => fs.readFileSync(path.join(ROOT, f)));
  const commit = gitCommit();
  const result = (qualified, reason, mismatched, untracked) => ({ commit, qualified, reason, mismatched, untracked });
  if (!commit) return result(false, 'this tree is not a checkout of its own repository, so there is no commit its inputs can be held to (Q37)', [], []);
  let committed;
  try {
    committed = committedObjects(commit, files);
  } catch (e) {
    return result(false, 'the committed inputs could not be read from git', [], []);
  }
  const mismatched = [];
  const untracked = [];
  files.forEach((f) => {
    const blob = committed.get(f);
    if (!blob) { untracked.push(f); return; }
    let working;
    try { working = read(f); } catch (e) { mismatched.push(f); return; }
    if (!Buffer.from(working).equals(blob)) mismatched.push(f);
  });
  const qualified = mismatched.length === 0 && untracked.length === 0;
  return result(qualified, qualified ? null : 'inputs differ from the commit this capture records', mismatched, untracked);
}

/* The boundary as capture() records it: held to the commit AFTER the run, and
   disqualified by any input whose bytes changed while the engine ran. */
function boundaryAround(files, before) {
  const boundary = boundaryOf(files);
  const after = hashFiles(files);
  boundary.changedDuringCapture = files.filter((f) => after[f] !== before[f]);
  if (boundary.changedDuringCapture.length) {
    boundary.reason = boundary.qualified ? 'inputs changed while the capture ran' : boundary.reason + '; and inputs changed while the capture ran';
    boundary.qualified = false;
  }
  return boundary;
}

function captureEntry(name, result) {
  /* RC-05: validate the RAW value first. Once canonical() and JSON have run,
     an unrepresentable value is already gone and the capture would agree with
     a result it does not describe. */
  assertSupportedRawValue(result, name);
  const stored = canonical(stripExcluded(result));
  return { name, rowCount: (stored.rows || []).length, hash: hashOf(stored), result: stored };
}

/* S4 task 3: A PLAN MUST SURVIVE THE ROUND TRIP IT IS HANDED THROUGH.
 *
 * capture() runs `engine.runPlan(JSON.parse(JSON.stringify(plan)))`, and
 * records corpusInputHash over the plan as it was BEFORE that round trip. JSON
 * writes NaN and the infinities as null and -0 as 0, drops undefined keys, and
 * writes undefined array elements as null -- so a plan carrying any of them
 * ran as a different plan than the one its input hash names. Measured before
 * this guard: a generated plan with returnRate NaN ran as returnRate null, the
 * capture was written and exited 0, and S3-01's comparability refusal was
 * leaning on the hash of a plan that never ran.
 *
 * Plans get the result-side raw-domain check, plus the values JSON would
 * change. REFUSED, NOT CONVERTED: converting is the defect. Every plan in the
 * real corpus round-trips deepStrictEqual (measured, 36 of 36), so no real
 * capture is refused and no capture output moves. */
function unfaithfulPlan(message) {
  const e = new TypeError(message);
  e.code = 'CAPTURE_INPUT_UNFAITHFUL';
  return e;
}

function assertJsonFaithful(value, path) {
  try {
    assertSupportedRawValue(value, path);
  } catch (e) {
    throw unfaithfulPlan('capture-baseline: scenario plan refused before the JSON round trip -- ' +
      String(e.message).replace(/^capture-baseline: /, ''));
  }
  /* Safe to read values from here: the check above refused every accessor,
     Proxy and exotic object, so nothing below can run caller code. */
  (function walk(v, at) {
    const refuse = (shown, why) => unfaithfulPlan('capture-baseline: scenario plan ' + at + ' carries ' +
      shown + ' -- ' + why + '. capture() runs runPlan(JSON.parse(JSON.stringify(plan))), so the engine ' +
      'would run a different plan than the one corpusInputHash records. Refused before the round trip.');
    if (v === undefined) throw refuse('undefined', 'JSON drops an undefined key and writes an undefined element as null');
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw refuse(String(v), 'JSON writes a non-finite number as null');
      if (Object.is(v, -0)) throw refuse('-0', 'JSON writes -0 as 0');
      return;
    }
    if (v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, at + '[' + i + ']')); return; }
    Object.keys(v).forEach((k) => walk(v[k], (at ? at + '.' : '') + k));
  })(value, path);
}

/* RA-04: a snapshot's stored hashes are not evidence about its contents.
 *
 * diffSnapshots() skipped comparison when two entries' stored hashes matched,
 * and the CLI returned IDENTICAL straight off matching stored corpus hashes.
 * So a capture edited from 100 to 100.01, with its hash fields left alone,
 * reported IDENTICAL -- the file was believed about itself. Every hash is now
 * recomputed from the contents it claims to describe before anything trusts
 * it. Returns a list of problems; empty means the file is internally
 * consistent. */
/* CL-03: FORMAT 3 EXISTS BECAUSE THE ENCODING CHANGED, and the previous change
 * did not say so.
 *
 * Format 2 hashed a stored `{__nonFinite:"NaN"}` as-is. The escaping repair
 * wraps it in `__escaped` when hashing, which is a DIFFERENT hash for the same
 * stored bytes -- so a legitimate old snapshot verified clean by the old CLI is
 * reported as tampered by the new one, while both files declare format 2. "The
 * data is corrupt" is the worst possible way to say "I changed my encoding".
 *
 * New captures declare 3. Verification applies the encoding the FILE declares,
 * so a format-2 snapshot still verifies under format-2 rules rather than being
 * accused. No baseline currently in the tree carries a tag -- checked, all
 * eleven -- so this is closing the door rather than repairing damage. */
function canonicalV2(value) {
  if (value === undefined) return undefined;               // format 2 dropped it
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return { __nonFinite: String(value) };
      if (Object.is(value, -0)) return { __negativeZero: true };
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalV2);
  const out = {};
  Object.keys(value).sort().forEach((k) => { out[k] = canonicalV2(value[k]); });
  return out;                                               // no escaping
}

function hashForFormat(value, formatVersion) {
  /* P11-A family: `Number(obj)` runs valueOf/toString. Numbers and strings
     convert with no user code; anything else is not a version. */
  const n = (typeof formatVersion === 'number' || typeof formatVersion === 'string')
    ? Number(formatVersion) : NaN;
  if (n >= 3) return hashOf(value);
  return crypto.createHash('sha256').update(JSON.stringify(canonicalV2(value))).digest('hex');
}

function verifyIntegrity(snapshot) {
  const problems = [];
  if (!snapshot || !Array.isArray(snapshot.entries)) {
    return [{ name: '(snapshot)', kind: 'shape', reason: 'missing or malformed entries array' }];
  }
  const fmt = formatVersionOf(snapshot);
  snapshot.entries.forEach((e) => {
    const actual = hashForFormat(e.result, fmt);
    if (e.hash !== actual) {
      problems.push({
        name: e.name,
        kind: 'hash',
        reason: 'stored entry hash ' + String(e.hash).slice(0, 16) +
          '… does not match a hash of its own contents (' + actual.slice(0, 16) + '…)',
      });
    }
  });
  /* EXT-02: identity is part of "does this file describe itself". This pass
     walks entries as an ARRAY, so before the repair it verified a snapshot
     holding two entries named the same thing as perfectly consistent, while
     diffSnapshots() -- indexing the same file -- could only ever see one of
     them. Two components disagreeing about how many scenarios a file contains
     is exactly the "two definitions of one contract" shape, and the integrity
     pass was the half that never spoke. It speaks here, so the CLI reports it
     through the existing message rather than a stack trace. */
  try {
    indexByName(snapshot, 'this snapshot');
  } catch (e) {
    problems.push({ name: '(identity)', kind: 'identity', reason: e.message });
  }
  const corpus = hashOf(snapshot.entries.map((e) => [e.name, e.hash]));
  const stored = snapshot.meta ? snapshot.meta.hash : undefined;
  /* P6-02: this used to read `meta.hash && meta.hash !== corpus`, so an ABSENT
     hash was silently treated as nothing to check -- and the comparator then
     read two absent hashes as equal and certified a CHANGED baseline as
     identical. Absence is malformed, not passing. Exactly the shape of round
     8's `rows: []`: a check that passed because it had nothing to compare. */
  /* CL-03 established that an older snapshot verifies under ITS OWN rules and
     must not be reported as tampered. So the requirement is scoped to the
     CURRENT capture format, which always writes one; a legacy snapshot that
     predates the field is not malformed for lacking it. */
  const currentFormat = formatVersionOf(snapshot) === CAPTURE_FORMAT;
  if (currentFormat && (typeof stored !== 'string' || stored === '')) {
    problems.push({
      name: '(corpus)',
      kind: 'hash',
      reason: 'no stored corpus hash -- an absent hash is a MALFORMED snapshot, ' +
        'not a passing one, and must never be usable as a certificate of equality',
    });
  } else if (typeof stored === 'string' && stored !== '' && stored !== corpus) {
    problems.push({
      name: '(corpus)',
      kind: 'hash',
      reason: 'stored corpus hash does not match a hash of the entry hashes it covers',
    });
  }
  return problems;
}

/* ST2-02: THE REVIEWED TARGETED SET.
 *
 * These are hand-built because the generator provably cannot reach them --
 * each one's reason is recorded at its construction site below and in
 * targetedAdditions(). Listing them here makes "the corpus is complete" a
 * checkable claim rather than a description of whatever happened to be built.
 *
 * ELEVEN, not the nine the S3 round-2 report reviewed, and not a quiet
 * expansion to make a check pass. The report reviewed a 33-name corpus:
 * 5 golden + 20 seeds + 8 targeted. The CL closure round then added
 * explicit-cash-holding, funded-qcd and survivor-stateful -- 33 + 3 = 36 --
 * for CL-04, CL-05 and CL-07 respectively, each committed with its finding.
 * Nothing was removed to make anything green.
 */
const REQUIRED_TARGETED = [
  'targeted:historical-spouse-ss',
  'targeted:spouse-cola-income',
  'targeted:historical-1929',
  'targeted:historical-1966',
  'targeted:historical-2000',
  'targeted:arm-flag-on',
  'targeted:collision-household-cash',
  'targeted:collision-rmd-retained-cash',
  'targeted:explicit-cash-holding',
  'targeted:funded-qcd',
  'targeted:survivor-stateful',
];

/* ST2-02: A CATCH-ALL AROUND THE GENERATOR MADE THE HARNESS LIE ABOUT ITSELF.
 *
 * The seeded sweep was loaded inside `try { ... } catch (e) { }` with the
 * comment "generator unavailable -- the golden set alone still captures",
 * followed by `if (typeof generateScenario === 'function')`. Between them they
 * swallowed a missing module, a SyntaxError inside the module, a missing
 * export and a non-function export, and dropped 20 of 36 scenarios without a
 * word. Measured on this tree under each of those four injected faults:
 *
 *   capture  -> "Captured 16 scenarios", exit 0, and the written file declares
 *               meta.generatedSeeds: 20 while holding ZERO seed entries.
 *               That figure was the CONSTANT, written unconditionally, so the
 *               snapshot asserted coverage it did not have.
 *   verify   -> "DETERMINISTIC". It compares two captures to each other, and
 *               two equally crippled captures agree perfectly. A determinism
 *               proof over an empty set is the Q41 shape exactly: a check that
 *               passes because it examined nothing.
 *   diff     -> lists 20 removals, then closes with "Total differing fields:
 *               0", because a removal carries no leaf diffs. A reader who
 *               trusts the bottom line reads zero.
 *
 * The point is not that the generator might break. It is that when it did, the
 * three commands whose whole purpose is to detect change all reported success.
 * Every financial delta measured in this sprint was measured with this
 * instrument.
 *
 * So completeness is a GATE now: strict by default, a named failure naming the
 * source and the cause. A reduced run is still available -- some diagnostic
 * situations genuinely want the golden set alone -- but it must be asked for
 * explicitly, it reports every omission, and it marks its snapshot incomplete
 * so it can never satisfy the complete gate.
 */
/* S4 task 4: WHICH SCENARIOS A CAPTURE COVERS.
 *
 *   control   the corpus S4 started from (tools/control-corpus.json). The
 *             default, and built WITHOUT loading the expansion module, so no
 *             expansion change can reach it.
 *   expanded  control, then every member tests/lib/corpus-expansion.js
 *             declares, under their own new names.
 *
 * Which composition the definitive S5b baseline uses is NOT decided here. */
const COMPOSITIONS = ['control', 'expanded'];
const EXPANSION_PATH = path.join(ROOT, 'tests', 'lib', 'corpus-expansion.js');

function compositionOf(options) {
  const name = options && options.composition !== undefined ? options.composition : 'control';
  if (COMPOSITIONS.indexOf(name) === -1) {
    throw new Error('capture-baseline: unknown corpus composition ' + safeJson(name) +
      ' -- the known compositions are ' + COMPOSITIONS.join(', '));
  }
  return name;
}

function corpusWithDiagnostics(options) {
  const composition = compositionOf(options);
  const { shell, golden } = loadEngine();
  const defaultPlan = golden.extractDefaultPlan(shell);
  const entries = [];
  const omissions = [];

  golden.GOLDEN_SCENARIOS.forEach(([name, overrides]) => {
    entries.push({ name: 'golden:' + name, plan: golden.buildScenario(defaultPlan, overrides || {}) });
  });

  // The seeded sweep is what makes this more than five hand-written plans.
  const GEN_PATH = path.join(ROOT, 'tests', 'lib', 'scenario-generator.js');
  let generateScenario = null;
  try {
    ({ generateScenario } = require(GEN_PATH));
  } catch (e) {
    /* Named, and the error's own class is kept: "cannot find" and "syntax
       error on line 40" are different problems with different repairs, and
       collapsing both to "unavailable" was how a broken generator looked
       identical to an absent one. */
    omissions.push({
      source: 'seeds',
      reason: 'tests/lib/scenario-generator.js failed to load (' + e.constructor.name + '): ' + e.message,
    });
  }
  if (!omissions.length && typeof generateScenario !== 'function') {
    omissions.push({
      source: 'seeds',
      reason: 'tests/lib/scenario-generator.js loaded, but exports generateScenario as ' +
        describeValue(generateScenario) + ' rather than a function. A module that loads is not a ' +
        'module that works, and the old shape check treated the two as the same outcome.',
    });
  }
  if (typeof generateScenario === 'function') {
    for (let seed = 1; seed <= GENERATED_SEEDS; seed++) {
      try {
        entries.push({ name: 'seed:' + seed, plan: generateScenario(defaultPlan, seed) });
      } catch (e) {
        /* Per seed, so one poisoned seed is reported as one poisoned seed
           rather than taking the other nineteen down with it. */
        omissions.push({ source: 'seed:' + seed, reason: e.message });
      }
    }
  }

  /* TARGETED: spouse Social Security in historical mode.
     The generated corpus cannot reach this. tests/lib/scenario-generator.js
     jitters unconstrained numerics around defaultPlan's OWN value, and
     defaultPlan.retirement.spouseSS is 0 -- so spouseSS is 0 for every seed
     (verified across 200). No generated scenario can exercise spouse Social
     Security at all, which is the exact path FM-01 lives on, and also the
     path the survivor logic lives on. Recorded as SPRINT_QUESTIONS.md Q17.
     Until the generator covers it, this hand-built pair keeps the harness
     able to detect a regression in that path rather than silently reporting
     no change because nothing was exercised. */
  const spousePair = JSON.parse(JSON.stringify(defaultPlan));
  spousePair.profile.age = 65;
  spousePair.profile.spouseAge = 67;
  spousePair.profile.spouseOn = true;
  spousePair.profile.retireAge = 65;
  spousePair.profile.endAge = 85;
  spousePair.assumptions.method = 'historical';
  spousePair.assumptions.historyStart = 2020;
  spousePair.retirement.ssBenefit = 2400;
  spousePair.retirement.ssClaim = 67;
  spousePair.retirement.spouseSS = 1800;
  spousePair.retirement.spouseClaim = 67;
  entries.push({ name: 'targeted:historical-spouse-ss', plan: spousePair });

  const spouseColaIncome = JSON.parse(JSON.stringify(spousePair));
  spouseColaIncome.retirement.otherIncomes = [
    { type: 'recurring', owner: 'spouse', amount: 12000, start: 70, end: 85, growthMode: 'cola', growth: 0 },
  ];
  entries.push({ name: 'targeted:spouse-cola-income', plan: spouseColaIncome });

  targetedAdditions(defaultPlan).forEach((e) => entries.push(e));

  /* S4 task 4: the expansion, only when asked for. A module that fails to
     load is a NAMED omission, so the expanded corpus can never quietly turn
     into the control. */
  let expansionNames = [];
  if (composition === 'expanded') {
    try {
      const expansion = require(EXPANSION_PATH);
      expansionNames = expansion.expansionNames();
      expansion.expansionScenarios(defaultPlan).forEach((e) => entries.push({ name: e.name, plan: e.plan }));
    } catch (e) {
      omissions.push({
        source: 'expansion',
        reason: 'tests/lib/corpus-expansion.js failed (' + e.constructor.name + '): ' + e.message,
      });
    }
  }

  /* ST2-02: check the NAMES, not the count. A count check passes as long as
     something arrived, so a targeted fixture silently replaced by a duplicate
     seed would satisfy it. Every scenario the corpus is supposed to contain is
     named here and its absence is reported individually. */
  const present = new Set(entries.map((e) => e.name));
  golden.GOLDEN_SCENARIOS.forEach(([name]) => {
    if (!present.has('golden:' + name)) {
      omissions.push({ source: 'golden:' + name, reason: 'golden scenario missing from the assembled corpus' });
    }
  });
  for (let seed = 1; seed <= GENERATED_SEEDS; seed++) {
    if (!present.has('seed:' + seed)) {
      /* Only reported here if the per-seed loop did not already say why. */
      if (!omissions.some((o) => o.source === 'seed:' + seed || o.source === 'seeds')) {
        omissions.push({ source: 'seed:' + seed, reason: 'seeded scenario missing with no recorded cause' });
      }
    }
  }
  REQUIRED_TARGETED.forEach((name) => {
    if (!present.has(name)) {
      omissions.push({
        source: name,
        reason: 'reviewed targeted fixture missing. The generator provably cannot reach these ' +
          'paths, so an absent one is coverage lost with nothing standing in for it.',
      });
    }
  });
  expansionNames.forEach((name) => {
    if (!present.has(name)) {
      omissions.push({ source: name, reason: 'declared expansion member missing from the assembled corpus' });
    }
  });

  return { entries, omissions, composition };
}

/* The complete corpus, or a named failure. Every caller that measures a
   financial delta uses this one. */
function corpus(options) {
  const { entries, omissions } = corpusWithDiagnostics(options);
  if (omissions.length) {
    /* S4 task 4: the expected size of an expanded corpus needs the expansion
       module, which may be the very thing that failed. The refusal must not
       die inside its own message. */
    let expected;
    try { expected = expectedCorpusSize(options); } catch (e) { expected = 'an unknown number of'; }
    throw new Error(
      'capture-baseline: the corpus is INCOMPLETE -- ' + omissions.length + ' scenario source(s) ' +
      'did not contribute, so it holds ' + entries.length + ' of ' +
      expected + ' scenarios:\n' +
      omissions.map((o) => '  ' + o.source + ': ' + o.reason).join('\n') + '\n' +
      '  A capture over a partial corpus still produces a hash, still verifies as\n' +
      '  DETERMINISTIC, and still diffs clean against another partial capture. It is\n' +
      '  refused rather than annotated, because a partial baseline is indistinguishable\n' +
      '  from a complete one at every later point where somebody trusts it.\n' +
      '  For a deliberately reduced run: capture --allow-incomplete, which marks the\n' +
      '  snapshot meta.complete = false and can never satisfy the complete gate.'
    );
  }
  return entries;
}

function expectedCorpusSize(options) {
  const composition = compositionOf(options);
  const { golden } = loadEngine();
  const control = golden.GOLDEN_SCENARIOS.length + GENERATED_SEEDS + REQUIRED_TARGETED.length;
  return composition === 'expanded' ? control + require(EXPANSION_PATH).expansionNames().length : control;
}

/* ---------------------------------------------------------------------------
 * S3 task 2: the scenarios the generated corpus provably cannot reach.
 *
 * All named `targeted:` deliberately. Task 1 changed WHICH scenario each seed
 * names, so `seed:N` in a pre-S3 capture describes a different plan than the
 * same key does now; only `golden:*` and `targeted:*` survive that boundary.
 * Anything task 5 needs a stable before/after on therefore has to live here.
 *
 * Each addition below was measured as ABSENT from the corpus before it was
 * written, not assumed to be:
 *
 *   historyStart 1929 / 1966 / 2000 -- the corpus reached 13 historical
 *   scenarios but its start years were 1928,1930,1931,1943,1956,1958,1962,
 *   1962,1970,1973,1976,2020,2020. The three canonical sequence-risk starts
 *   were all missing, and 1928/1930 are NOT substitutes: the whole point of
 *   1929 is which year the crash lands relative to the first withdrawal.
 *
 *   flag-on ARM -- 7 scenarios set armRecastOnReset:true and 4 carry an
 *   adjustable-rate debt, and ZERO did both. The generator varies the two
 *   independently, so the re-amortization branch behind the flag was never
 *   crossed by any generated scenario. S3 task 3 criterion 2 requires this
 *   class to cross the Worker boundary permanently; it has to exist first.
 *
 *   the two collision literals -- neither `rmd-retained-cash` nor
 *   `household-cash` appeared as a user account id anywhere in the corpus
 *   (measured: 8 distinct ids, all of the form a1..a3 / gen-a1..gen-a5).
 *   Task 5 criterion 4 needs a bit-identical before/after on exactly these,
 *   and there is no "before" unless they are captured here.
 * ------------------------------------------------------------------------ */
function targetedAdditions(defaultPlan) {
  const base = () => JSON.parse(JSON.stringify(defaultPlan));
  const out = [];

  /* A retired household drawing on the portfolio, so the start year's return
     sequence actually bites. Held identical across the three except for
     historyStart -- that is what makes them a comparable triple.
     
     CL-07: THAT COMMENT WAS ASPIRATIONAL UNTIL NOW. defaultPlan carries no
     accounts, so all three had a ZERO opening portfolio -- and fixedReal sizes
     its first withdrawal as a percentage of the retirement balance, so zero
     portfolio meant zero spending and zero withdrawals across the whole stored
     25-year projection. Setting retirement.spending did nothing, because that
     strategy never reads it. Whatever differences appeared between the three
     came from Social Security and inflation, not from sequence risk: there was
     no sequence to be at risk from.
     
     A funded, equity-weighted portfolio is what makes the fixture its own name.
     The three now differ because 1929, 1966 and 2000 hand a drawing household
     different early returns, which is the property being fixtured. */
  [1929, 1966, 2000].forEach((year) => {
    const p = base();
    p.setupComplete = true;
    p.profile.age = 65;
    p.profile.retireAge = 65;
    p.profile.endAge = 90;
    p.employment.salary = 0;
    p.employment.spouseSalary = 0;
    p.assumptions.method = 'historical';
    p.assumptions.historyStart = year;
    p.assumptions.inflation = 0;
    p.retirement.strategy = 'fixedReal';
    p.retirement.spending = 60000;
    p.retirement.ssBenefit = 2000;
    p.retirement.ssClaim = 67;
    p.retirement.withdrawalRate = 4;
    p.accounts = [
      accountShape({ id: 'brokerage', name: 'Brokerage', taxClass: 'taxable', type: 'taxable',
        balance: 900000, basisPct: 100, priority: 1 }),
      accountShape({ id: 'ira', name: 'IRA', taxClass: 'preTax', type: 'traditionalIRA',
        balance: 600000, priority: 2 }),
    ];
    out.push({ name: 'targeted:historical-' + year, plan: p });
  });

  /* A mortgage that reaches its reset inside the horizon, with the flag ON.
     nextRateResetAge is inside [age, endAge] and resetRate is well above the
     original, so flag-on and flag-off produce different debt payments. */
  const arm = base();
  arm.setupComplete = true;
  arm.profile.age = 60;
  arm.profile.retireAge = 61;
  arm.profile.endAge = 70;
  arm.employment.salary = 0;
  arm.employment.spouseSalary = 0;
  arm.assumptions.method = 'simple';
  arm.assumptions.returnRate = 5;
  arm.assumptions.inflation = 0;
  arm.retirement.strategy = 'fixedNominal';
  arm.retirement.spending = 40000;
  arm.retirement.ssBenefit = 0;
  arm.retirement.spouseSS = 0;
  arm.advanced.armRecastOnReset = true;
  arm.advanced.debts = [{
    id: 'm1', type: 'mortgage', name: 'ARM', owner: 'household',
    balance: 300000, rate: 4, paymentMonthly: 1432.25, payoffAge: 90,
    includePayment: true, taxDeductible: true, mortgageType: 'conventional',
    rateType: 'adjustable', originalAmount: 300000, propertyValue: 500000,
    remainingTermYears: 30, loanTermYears: 30, extraPrincipalMonthly: 0,
    annualPropertyTax: 0, annualInsurance: 0, hoaMonthly: 0, pmiMonthly: 0,
    includeHousingCosts: false, nextRateResetAge: 61, resetRate: 8,
  }];
  out.push({ name: 'targeted:arm-flag-on', plan: arm });

  /* COLLISION 1 -- `household-cash`.
     retainExcessRmdCash() takes the asCash branch when a source's policy is
     "retain", and synthesizes {id:"household-cash"} only when NO account
     carries cashHolding:true. A user account whose id is already
     "household-cash" but which does NOT carry that flag is therefore invisible
     to the lookup, and the engine pushes a SECOND account with the same id.
     The pension source is used because rmd defaults to "invest" regardless of
     advanced.surplusPolicy (see surplusPolicyFor). */
  const hc = base();
  hc.setupComplete = true;
  hc.profile.age = 67;
  hc.profile.retireAge = 67;
  hc.profile.endAge = 80;
  hc.employment.salary = 0;
  hc.employment.spouseSalary = 0;
  hc.assumptions.method = 'simple';
  hc.assumptions.returnRate = 5;
  hc.assumptions.inflation = 0;
  hc.retirement.strategy = 'fixedNominal';
  hc.retirement.spending = 10000;
  hc.retirement.ssBenefit = 0;
  hc.retirement.pension = 90000;
  hc.retirement.pensionStart = 67;
  hc.advanced.surplusPolicy = 'retain';
  hc.accounts = [
    accountShape({ id: 'household-cash', name: 'Looks like the synthesized one', taxClass: 'taxable', type: 'taxable', balance: 250000, priority: 1 }),
  ];
  out.push({ name: 'targeted:collision-household-cash', plan: hc });

  /* CL-04 / CL-07: an EXPLICIT household cash holding.
   *
   * No corpus scenario carried `cashHolding` at all, so the schema catalogue
   * could not describe it -- the very category RB-02's contract repair is about
   * -- and no drift test could notice it changing. The engine synthesizes such
   * an account during settlement, which is precisely why one never appeared in
   * a stored PLAN.
   *
   * This is a feature fixture, not filler: retained surplus must land in the
   * declared holding, that holding must be pinned to a zero return, and it must
   * be excluded from the dividend base. A scenario that merely sets the flag
   * without producing surplus would exercise none of that. */
  const ch = base();
  ch.profile = Object.assign({}, ch.profile, { age: 67, retireAge: 67, endAge: 72, filing: 'single', spouseOn: false });
  ch.employment = Object.assign({}, ch.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  ch.assumptions.method = 'simple';
  ch.assumptions.returnRate = 6;
  ch.assumptions.inflation = 0;
  ch.retirement.strategy = 'fixedNominal';
  ch.retirement.spending = 20000;
  ch.retirement.ssBenefit = 0;
  ch.retirement.pension = 80000;      // well above spending, so surplus is produced
  ch.retirement.pensionStart = 67;
  ch.retirement.dividendOn = true;
  ch.retirement.dividendYield = 3;    // the holding must be excluded from this base
  ch.advanced.surplusPolicy = 'retain';
  ch.accounts = [
    accountShape({ id: 'invested', name: 'Brokerage', taxClass: 'taxable', type: 'taxable', balance: 300000, basisPct: 100, priority: 2 }),
    accountShape({ id: 'cash-holding', name: 'Household cash', taxClass: 'taxable', type: 'customTaxable', balance: 25000, basisPct: 100, priority: 1, cashHolding: true }),
  ];
  out.push({ name: 'targeted:explicit-cash-holding', plan: ch });

  /* CL-07: A QCD THAT IS ACTUALLY FUNDED.
   *
   * Nine corpus scenarios request a qualified charitable distribution and not
   * one of them reaches a row with a non-zero RMD, so the funded-QCD branch --
   * the one RC-01's repair rewrote -- was never executed by the corpus. A
   * request with no distribution behind it exercises the refusal path only.
   *
   * Age 75 with a real pretax balance produces an obligation; the QCD sits
   * inside it, so the exclusion is drawn from cash that actually moved. */
  const qcd = base();
  qcd.profile = Object.assign({}, qcd.profile, { age: 75, retireAge: 70, endAge: 80, filing: 'single', spouseOn: false });
  qcd.employment = Object.assign({}, qcd.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  qcd.assumptions.method = 'simple';
  qcd.assumptions.returnRate = 5;
  qcd.assumptions.inflation = 0;
  qcd.retirement.strategy = 'fixedNominal';
  qcd.retirement.spending = 40000;
  qcd.retirement.ssBenefit = 0;
  qcd.retirement.pension = 0;
  qcd.advanced.rmdOn = true;
  qcd.advanced.qcd = 5000;
  qcd.accounts = [
    accountShape({ id: 'ira', name: 'IRA', taxClass: 'preTax', type: 'traditionalIRA', balance: 800000, priority: 2 }),
    accountShape({ id: 'brokerage', name: 'Brokerage', taxClass: 'taxable', type: 'taxable', balance: 200000, basisPct: 100, priority: 1 }),
  ];
  out.push({ name: 'targeted:funded-qcd', plan: qcd });

  /* CL-07: A SURVIVOR REDUCTION ON A STRATEGY THAT CARRIES STATE.
   *
   * The corpus had zero stateful survivor-decision periods: its one survivor
   * scenario uses a strategy that rebuilds its spending base every year, which
   * is precisely the shape that CANNOT exhibit RC-02's compounding. fixedReal
   * carries priorSpend forward, so this is the combination the repair is about,
   * with one death inside the horizon. */
  const surv = base();
  surv.profile = Object.assign({}, surv.profile, { age: 65, spouseAge: 65, retireAge: 65, endAge: 72, filing: 'mfj', spouseOn: true });
  surv.employment = Object.assign({}, surv.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  surv.assumptions.method = 'simple';
  surv.assumptions.returnRate = 4;
  surv.assumptions.inflation = 2;
  surv.retirement.strategy = 'fixedReal';
  surv.retirement.withdrawalRate = 4;
  surv.retirement.survivor = true;
  surv.retirement.survivorSpendingReduction = 25;
  surv.retirement.selfLife = 68;      // one death, inside the horizon
  surv.retirement.spouseLife = 95;
  surv.retirement.ssBenefit = 0;
  surv.retirement.pension = 0;
  surv.accounts = [
    accountShape({ id: 'roth', name: 'Roth', taxClass: 'roth', type: 'rothIRA', balance: 1200000, priority: 1 }),
  ];
  out.push({ name: 'targeted:survivor-stateful', plan: surv });

  /* COLLISION 2 -- `rmd-retained-cash`.
     The invest branch picks the first account with taxClass "taxable" and no
     cashHolding flag, and synthesizes {id:"rmd-retained-cash"} when there is
     none. Giving the user a PRE-TAX account already called
     "rmd-retained-cash" means the filter skips it and the engine pushes a
     second account with that id. Large pre-tax balance plus rmdOn past the
     RMD start age forces a distribution bigger than spending, which is what
     produces surplus to retain. */
  const rc = base();
  rc.setupComplete = true;
  rc.profile.age = 75;
  rc.profile.retireAge = 75;
  rc.profile.endAge = 85;
  rc.employment.salary = 0;
  rc.employment.spouseSalary = 0;
  rc.assumptions.method = 'simple';
  rc.assumptions.returnRate = 5;
  rc.assumptions.inflation = 0;
  rc.retirement.strategy = 'fixedNominal';
  rc.retirement.spending = 20000;
  rc.retirement.ssBenefit = 0;
  rc.advanced.rmdOn = true;
  rc.accounts = [
    accountShape({ id: 'rmd-retained-cash', name: 'Pre-tax, so the invest branch skips it', taxClass: 'preTax', type: 'traditional401k', balance: 3000000, priority: 1 }),
  ];
  out.push({ name: 'targeted:collision-rmd-retained-cash', plan: rc });

  return out;
}

/** A complete account record, so a targeted scenario cannot fail validation
 *  for a missing field rather than for the reason it was written to probe. */
function accountShape(over) {
  return Object.assign({
    id: 'a1', name: 'Account', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 0, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }, over);
}

/* HEAD's commit SHA, or null when this tree is not itself a git checkout.
 * Deterministic at a commit, so it does not cost byte-reproducibility.
 *
 * THE TOPLEVEL CHECK IS THE WHOLE POINT, and the first version did not have it.
 * `git rev-parse HEAD` walks UP the directory tree, so an extracted package
 * that happens to sit inside an unrelated repository resolved that
 * repository's HEAD and recorded it as this capture's provenance. Not a
 * missing value -- a confidently WRONG one, which is strictly worse, and the
 * test that caught it says the principle out loud: provenance that is absent
 * should say so.
 *
 * Found by extracting the tree into a handover folder inside this repo and
 * running the suite there. Standalone extraction returns null correctly, so
 * the defect only appears when the extraction is nested -- which is exactly
 * how a reviewer would unpack a package next to their own checkouts.
 * SPRINT_QUESTIONS.md Q37. */
function gitCommit() {
  try {
    const { execFileSync } = require('node:child_process');
    /* stderr is DISCARDED, not inherited. Catching the exception was never the
       whole job: execFileSync inherits stderr by default, so when this runs
       outside a git checkout -- which is exactly what an extracted review
       package is -- git's own `fatal: not a git repository` reached the
       console twice before the catch below quietly returned null. The command
       worked and printed DETERMINISTIC, but a reviewer following the handover
       saw two lines beginning `fatal:` and had every reason to read that as a
       failure. Absence of a git checkout is an expected state here, not an
       error to report. */
    const run = (args) => execFileSync('git', args, {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const toplevel = run(['rev-parse', '--show-toplevel']);
    /* The SHA is only OURS if the repository git found is this directory. */
    if (path.resolve(toplevel) !== path.resolve(ROOT)) return null;
    return run(['rev-parse', 'HEAD']);
  } catch (e) {
    return null;
  }
}

/* A hash of the corpus's INPUTS, which is NOT the hash meta.hash already
 * carries. The two guard different failures and must never be confused:
 *
 *   meta.hash           hashes the OUTPUT entry hashes. Detects a tampered
 *                       or corrupted snapshot file.
 *   meta.corpusInputHash hashes the PLANS THEMSELVES, plus the seed and count
 *                       they were generated from. Detects a CHANGED CORPUS --
 *                       a different set of scenarios wearing the same names.
 *
 * The second is the one S3 needed and did not have. The corpus is a function
 * of the generator's code, the seed, the count and scenario-validator.js's
 * bounds, and task 1 changed the first of those: every `seed:N` now names a
 * different plan than it did before S3. A capture that records only output
 * hashes cannot see that, so two captures of genuinely different scenario
 * sets would diff field-by-field as though they described the same ones. */
function corpusInputHash(entries) {
  return hashOf({ seeds: GENERATED_SEEDS, plans: entries.map((e) => [e.name, e.plan]) });
}

/* S4 task 4.7: WHICH SCENARIOS CHANGED, NOT ONLY WHETHER THE CORPUS DID.
 *
 * corpusInputHash answers one question for the whole corpus, and
 * assertComparable() rightly refuses a regression diff when the answer is "not
 * the same". But the corpus is about to grow (S4 task 4), and "not the same"
 * then covers facts the plan needs kept apart:
 *
 *   EXPANSION     a scenario was ADDED and every shared one is unchanged.
 *                 Evaluate BOTH engines on the expanded inputs, then compare.
 *   INCOMPATIBLE  a scenario that already existed now names a DIFFERENT plan.
 *                 An input or generator edit: a versioned change with its own
 *                 old and new hashes and a reason -- never compared through.
 *
 * meta.inputHashes records each entry's plan hash so the two can be told
 * apart. This EXPLAINS a refusal; it never lifts one. diffSnapshots() still
 * demands identical corpus inputs, and nothing here bypasses
 * assertComparable(). A capture taken before this field existed is UNKNOWN,
 * never "same". */
function inputHashesOf(scenarios) {
  const out = {};
  scenarios.forEach(({ name, plan }) => { assignOwn(out, name, hashOf(plan)); });
  return out;
}

const HEX64 = /^[0-9a-f]{64}$/;

function inputHashesState(snapshot, side) {
  const meta = snapshot && snapshot.meta ? snapshot.meta : null;
  if (!meta || !Object.prototype.hasOwnProperty.call(meta, 'inputHashes')) {
    return { ok: false, label: 'the ' + side + ' records no per-scenario input hashes (captured before S4 task 4.7)' };
  }
  const hashes = meta.inputHashes;
  if (!hashes || typeof hashes !== 'object' || Array.isArray(hashes)) {
    return { ok: false, label: 'the ' + side + ' records meta.inputHashes as ' + safeJson(hashes) + ', not a name-to-hash map' };
  }
  const keys = Object.keys(hashes);
  const malformed = keys.filter((k) => typeof hashes[k] !== 'string' || !HEX64.test(hashes[k]));
  if (malformed.length) {
    return { ok: false, label: 'the ' + side + ' records a malformed input hash for ' + malformed.length + ' scenario(s)' };
  }
  const names = Array.isArray(snapshot.entries) ? snapshot.entries.map((e) => (e && typeof e.name === 'string' ? e.name : null)) : [];
  const unhashed = names.filter((n) => n === null || !Object.prototype.hasOwnProperty.call(hashes, n));
  const orphaned = keys.filter((k) => names.indexOf(k) === -1);
  if (unhashed.length || orphaned.length) {
    return { ok: false, label: 'the ' + side + '\'s input hashes do not match its entries (' + unhashed.length +
      ' entr' + (unhashed.length === 1 ? 'y' : 'ies') + ' without one, ' + orphaned.length + ' naming no entry)' };
  }
  return { ok: true, hashes };
}

function compareInputs(reference, candidate) {
  const a = inputHashesState(reference, 'reference');
  const b = inputHashesState(candidate, 'candidate');
  if (!a.ok || !b.ok) {
    return { kind: 'unknown', label: [a, b].filter((s) => !s.ok).map((s) => s.label).join('; '),
      same: [], added: [], removed: [], changed: [] };
  }
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const same = [];
  const removed = [];
  const changed = [];
  Object.keys(a.hashes).sort().forEach((n) => {
    if (!own(b.hashes, n)) removed.push(n);
    else if (a.hashes[n] === b.hashes[n]) same.push(n);
    else changed.push(n);
  });
  const added = Object.keys(b.hashes).sort().filter((n) => !own(a.hashes, n));
  let kind = 'same';
  if (changed.length) kind = 'incompatible';
  else if (added.length && removed.length) kind = 'recomposed';
  else if (added.length) kind = 'expansion';
  else if (removed.length) kind = 'reduction';
  const labels = {
    same: 'every scenario has the same inputs',
    expansion: added.length + ' scenario(s) ADDED and every shared scenario unchanged -- a corpus expansion: evaluate both engines on the expanded inputs before comparing',
    reduction: removed.length + ' scenario(s) REMOVED and every remaining scenario unchanged',
    recomposed: added.length + ' scenario(s) added and ' + removed.length + ' removed, every shared scenario unchanged',
    incompatible: changed.length + ' scenario(s) name a DIFFERENT plan under the same name -- an input or generator change, which must be versioned with its old and new hashes and a reason',
  };
  return { kind, label: labels[kind], same, added, removed, changed };
}

function capture(options) {
  /* S4 task 5.4: hashed BEFORE the engine is loaded, so an edit during the run
     is visible to boundaryAround(). */
  const inputs = captureInputs(options);
  const inputsBefore = hashFiles(inputs);
  const { engine } = loadEngine();
  /* ST2-02: complete by default. `allowIncomplete` is the diagnostic path and
     it is opt-in at the call site, not a fallback the tool takes on its own. */
  const allowIncomplete = !!(options && options.allowIncomplete);
  const diagnostics = corpusWithDiagnostics(options);
  const omissions = diagnostics.omissions;
  const scenarios = allowIncomplete ? diagnostics.entries : corpus(options);
  /* S4 task 3: before the round trip below, not after it -- afterwards the
     evidence is already gone. */
  scenarios.forEach(({ name, plan }) => assertJsonFaithful(plan, name));
  /* runPlan(), not runScenario(). See the header: runPlan has no
     nondeterminism to exclude, so EXCLUDED is empty and any field that moves
     between two captures is a defect rather than a reason to widen a list. */
  const entries = scenarios.map(({ name, plan }) =>
    captureEntry(name, engine.runPlan(JSON.parse(JSON.stringify(plan)))));
  const snapshot = {
    meta: {
      formatVersion: CAPTURE_FORMAT,
      entryPoint: 'runPlan',
      /* Q2 (A): the result-contract version the captured engine produces, distinct from the capture format. */
      resultContractVersion: engine.RESULT_CONTRACT_VERSION,
      /* S4 task 4: which composition this capture covers. */
      corpusComposition: diagnostics.composition,
      gitCommit: gitCommit(),
      corpusInputHash: corpusInputHash(scenarios),
      /* S4 task 4.7: each scenario's plan hash, so a comparison can say WHICH
         scenarios' inputs differ, not only that the corpus as a whole does.
         Additive evidence metadata; see compareInputs(). */
      inputHashes: inputHashesOf(scenarios),
      fieldCounts: FIELD_COUNTS,
      modes: scenarios.reduce((m, s) => {
        const k = (s.plan.assumptions && s.plan.assumptions.method) || 'unknown';
        m[k] = (m[k] || 0) + 1;
        return m;
      }, {}),
      /* No wall-clock stamp. meta.capturedAt made two captures of identical
         source differ as FILES, while `verify` reported DETERMINISTIC --
         that command compares corpus hashes, which do not cover meta at all,
         so the harness could not see its own non-reproducibility.

         Provenance is kept, but as something deterministic and more useful:
         a content hash per source file answers "which engine produced this
         capture?", which is the question a timestamp only gestures at. The
         files are hashed as raw bytes, so a line-ending change counts as a
         change -- it is one. */
      sourceHashes: sourceHashes(),
      /* S4 task 5.4: the complete input graph, and the execution boundary. */
      inputGraph: inputGraphOf(inputsBefore, scenarios),
      boundary: boundaryAround(inputs, inputsBefore),
      excludedFields: EXCLUDED.slice(),
      entryCount: entries.length,
      /* ST2-02: OBSERVED, not declared. `generatedSeeds: GENERATED_SEEDS` was
         a constant written unconditionally, so a capture holding zero seed
         entries still claimed twenty. A metadata field that cannot disagree
         with the file it describes is decoration, not provenance. */
      generatedSeeds: entries.filter((e) => /^seed:/.test(e.name)).length,
      generatedSeedsRequested: GENERATED_SEEDS,
      composition: Object.assign({
        golden: entries.filter((e) => /^golden:/.test(e.name)).length,
        seeds: entries.filter((e) => /^seed:/.test(e.name)).length,
        targeted: entries.filter((e) => /^targeted:/.test(e.name)).length,
      }, diagnostics.composition === 'expanded'
        ? { expansion: entries.filter((e) => /^expansion:/.test(e.name)).length } : {}),
      /* The single field every later consumer can check. A reduced capture is
         a legitimate diagnostic artefact; a reduced capture that cannot be
         told apart from a complete one is not. */
      complete: omissions.length === 0,
      omissions: omissions.slice(),
      note: 'Complete runPlan output at full precision, zero exclusions. Not a substitute for the golden tripwire.',
    },
    entries,
  };
  snapshot.meta.hash = hashOf(entries.map((e) => [e.name, e.hash]));
  /* EXT-02: refuse to WRITE a snapshot that cannot be indexed. Catching a
     duplicate name at diff time means it already reached a committed baseline
     and every comparison against that baseline was quietly short one scenario.
     The corpus is assembled from three sources -- golden, generated, targeted
     -- so a collision between them is a live possibility, not a hypothetical. */
  indexByName(snapshot, 'this capture');
  return snapshot;
}

/** Walks two values together, reporting every differing leaf by dotted path. */
function differences(a, b, prefix, out) {
  out = out || [];
  prefix = prefix || '';
  /* Object.is, not ===. This fast path used to use === and therefore fired
     for 0 vs -0, making the `!Object.is(a, b)` comparison below it -- which
     exists precisely to catch that case -- unreachable. A check that cannot
     run is worse than no check: it reads as coverage. Object.is also treats
     NaN as equal to itself, which is what the leaf comparison already
     concluded, so nothing else changes. */
  if (Object.is(a, b)) return out;
  const bothObjects = a && b && typeof a === 'object' && typeof b === 'object';
  if (!bothObjects) {
    if (!Object.is(a, b)) out.push({ path: prefix, before: a, after: b });
    return out;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    out.push({ path: prefix, before: Array.isArray(a) ? 'array' : typeof a, after: Array.isArray(b) ? 'array' : typeof b });
    return out;
  }
  const keys = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));
  keys.sort();
  keys.forEach((k) => {
    const p = prefix ? prefix + '.' + k : k;
    if (!(k in a)) { out.push({ path: p, before: undefined, after: b[k] }); return; }
    if (!(k in b)) { out.push({ path: p, before: a[k], after: undefined }); return; }
    differences(a[k], b[k], p, out);
  });
  return out;
}

/** A capture's format. Format 1 predates the field and is inferred, not guessed:
 *  it is the only format that ever shipped without one. */
function formatVersionOf(snapshot) {
  return (snapshot && snapshot.meta && snapshot.meta.formatVersion) || 1;
}

/* Refuse to diff across formats rather than producing a misleading comparison.
 *
 * A format-1 capture holds runScenario() output; a format-2 capture holds
 * runPlan() output. Diffing them reports the entire 13-field `identity` block
 * as removed, on every scenario, every time -- a difference that says nothing
 * about the engine and everything about which function was called. That is a
 * result-shaped object with no result in it, and the whole reason this file
 * carries a version at all. */
/* S3-01: WAS THE COMPARISON EVEN MEANINGFUL?
 *
 * `corpusInputHash` was computed at capture time and stored, and nothing ever
 * read it back to decide whether two snapshots describe the SAME scenarios.
 * Two captures over different corpora whose outputs happened to match reported
 * an unqualified IDENTICAL. (The disclosed cause was wrong in an earlier
 * handover: `corpusInputHash` IS exported, and `assertComparable` IS reached by
 * both entry points -- it simply only ever compared FORMAT VERSIONS. The defect
 * is a missing check, not an unexercised one.)
 *
 * Deliberately NOT symmetric with the engine hash: the engine differing is
 * usually the very thing being measured, so it is not required to match. The
 * INPUTS are what must match for an output comparison to mean anything. */
function inputComparability(before, after) {
  const a = before && before.meta ? before.meta.corpusInputHash : undefined;
  const b = after && after.meta ? after.meta.corpusInputHash : undefined;
  if (typeof a === 'string' && typeof b === 'string' && a !== '' && b !== '') {
    if (a === b) return { kind: 'same', label: '' };
    return {
      kind: 'different',
      label: 'DIFFERENT corpus inputs — ' + a.slice(0, 12) + '… vs ' + b.slice(0, 12) + '…',
    };
  }
  return {
    kind: 'unknown',
    label: 'corpus input identity UNKNOWN — ' +
      (typeof a === 'string' && a ? 'after' : (typeof b === 'string' && b ? 'before' : 'both')) +
      ' side(s) predate corpusInputHash',
  };
}

/* P9-01: "ANYTHING OTHER THAN CURRENT FORMAT" IS NOT A DEFINITION OF LEGACY.
 *
 * The round-11 repair asked `formatVersionOf(snapshot) !== CAPTURE_FORMAT` and
 * returned `legacy` on the spot, BEFORE looking at `complete` or `omissions`.
 * That exempted an explicit `complete: false` in format 2 -- which package (8)
 * refused -- and also exempted a future format 4 and the string "3", labelling
 * both as predating a contract they do not predate. A compatibility rule for
 * ABSENT old metadata was overriding PRESENT evidence, which is backwards.
 *
 * The correction goes further than the regression, and the audit supplied the
 * counterexample from inside our own package:
 * `tools/baseline-20260910-after-CL-closure.json` records format 3, verifies
 * cleanly, carries 36 entries and the known corpus-input hash -- and has
 * neither `complete` nor `omissions`. So format 3 does NOT identify the
 * completeness contract. The result ENCODING and the completeness METADATA
 * CONTRACT are different things that began at different times, and round 11
 * assumed they began together.
 *
 * Three independent questions, asked separately:
 *   1. can this tool read the encoding at all?   -> supported / unsupported
 *   2. is completeness metadata present?         -> present / absent (unknown)
 *   3. what does the present metadata say?       -> complete / incomplete /
 *                                                   self-contradictory
 *
 * ABSENT metadata is UNKNOWN in every supported format, including the current
 * one. Unknown is not a pass (round 11's `legacy` was a silent pass, which is
 * how the regression reached an unqualified empty diff) and it is not a
 * declaration of incompleteness either -- saying so about the after-CL file
 * was the tool printing a false statement about a real artifact. */
/* P8-02: COMPLETENESS WAS A SINGLE EQUALITY TEST, AND EVERYTHING ELSE PASSED.
 *
 * Both the API and the CLI asked only `meta.complete === false`. So a snapshot
 * that DELETED the flag, or set it to null, or to the STRING "false" -- which
 * is truthy, the exact mechanism FM-09 already repaired once in the engine's
 * flag typing -- sailed through as a regression pass. So did `complete: true`
 * while an omission was recorded two lines below it in the same file.
 * `verifyIntegrity()` reported no problems for any of them, because correct
 * content hashes establish that the OUTPUT is intact and say nothing about
 * whether the METADATA means what it claims.
 *
 * The capture writer already states the intended relationship -- `complete` is
 * derived from whether the omissions list is empty, and both fields are
 * written together. Every failing fixture violated that contract. One
 * validator, consulted by both entry points, so the two cannot drift apart
 * again: that drift is Q20/Q33/Q38's family and this project has now paid for
 * it four times.
 *
 * SUPERSEDED IN PART BY P9-01, and the retracted sentence is left named
 * rather than quietly deleted: this note used to say legacy handling was a
 * FORMAT question -- an older capture could not have carried the flag and was
 * permitted, a current-format one missing it was malformed. The package's own
 * after-CL artifact is format 3 WITHOUT the metadata, so format does not
 * identify the contract. Absent metadata is UNKNOWN in every supported format,
 * and absence is never evidence about when a particular capture was taken. */
/* P9-02, REOPENED ONE LEVEL DEEPER. `String(value)` invokes the value's OWN
   conversion methods, and an ORDINARY JSON record can carry `"toString": null`
   -- an own, non-callable property that JSON.parse creates with no functions,
   getters, cycles or code execution anywhere in the input. String() finds
   toString uncallable, falls through to valueOf, gets the object back, and
   throws `Cannot convert object to primitive value`. So the refusal died
   inside its own error message again.

   Round 12 validated the COLLECTION (is it a list?) and the RECORD (is it an
   object?) and then coerced the record's FIELDS without checking them. Each
   repair closed the level it was shown. Nothing below is rendered through a
   value's own conversion methods, at any level. */
function safeText(value, field) {
  if (typeof value === 'string') return value;
  if (value === undefined) return '(no ' + field + ' recorded)';
  if (value === null) return '(' + field + ' is null)';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return '(' + field + ' is an array, not text)';
  return '(' + field + ' is a ' + typeof value + ', not text)';
}

/* P11-A: THE COMMENT THAT USED TO STAND HERE NAMED THIS DEFECT AND THE CODE
   DID IT ANYWAY. It read "JSON.stringify consults a value's own toJSON and
   throws on cycles, so it is not the last word either" -- and then called
   JSON.stringify on the value, inside a try/catch. The try/catch catches the
   throw; it does not stop `toJSON()` RUNNING, and it cannot undo what the call
   did. A caller-supplied `toJSON` on meta.complete ran during diagnostic
   construction, set meta.complete = true on the caller's own object, and the
   later completeness gate reclassified the mutated input as complete and
   returned a bare []. Rendering had a side effect that erased the condition
   being rendered.

   Round 13 stated the rule as "no value is rendered through its own conversion
   methods, at any level" and then left the exception inside the helper written
   to implement it. So: no value reaches JSON.stringify, String(), or implicit
   concatenation unless it is a PRIMITIVE, where there is no user code to run.
   Nothing here can throw, so there is nothing to catch. */
function safeJson(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null) return 'null';
  if (value === undefined) return 'absent';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return String(value) + 'n';
  if (typeof value === 'symbol') return '(a symbol)';
  if (typeof value === 'function') return '(a function)';
  if (Array.isArray(value)) return '(an array)';
  return '(an object)';
}

/* P11-A, the structural half. The callback must not run AT ALL -- that is what
   safeJson now guarantees -- but a classification recomputed at each gate is a
   defect on its own terms even without callbacks: the deciding gate can reach
   a different verdict than the gate that already refused. Classify ONCE per
   side, carry the result through every decision and display path. */
function classifySides(before, after) {
  return [['before', before, completenessOf(before)], ['after', after, completenessOf(after)]];
}

/* A file's encoding, described without reading its raw declaration aloud. */
function describeEncoding(snapshot) {
  const enc = encodingOf(snapshot);
  if (enc.kind === 'supported') {
    return 'format ' + enc.version + (enc.declared ? '' : ' (inferred: no version declared)');
  }
  const raw = snapshot && snapshot.meta ? snapshot.meta.formatVersion : undefined;
  return 'an unreadable format declaration ' + safeJson(raw);
}

/* Question 1, on its own. A DECLARED version must be an integer this tool
   knows; an ABSENT one is the documented format-1 inference, which is a real
   historical state rather than a guess. */
function encodingOf(snapshot) {
  const meta = snapshot && snapshot.meta ? snapshot.meta : null;
  /* P10-01: DECLARED means the field is PRESENT -- not "present and not null".
     `"formatVersion": null` is an own field carrying a value, and that value is
     not one of the integer capture formats, so it is an unsupported
     DECLARATION rather than an absent one. Round 12 folded null in with
     undefined and handed it format-1 legacy semantics, which is the same shape
     of error P9-01 fixed one level up: inferring a historical state from
     something that is not evidence of one. Absence is inferred; a present
     value is read. None of the 14 stored baselines declares a null format, so
     nothing needs the exemption. */
  if (!meta || !Object.prototype.hasOwnProperty.call(meta, 'formatVersion')) {
    return { kind: 'supported', version: 1, declared: false };
  }
  const raw = meta.formatVersion;
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return { kind: 'unsupported', version: raw,
      label: 'declares meta.formatVersion ' + safeJson(raw) + ', which is not one of ' +
        'the integer capture formats this tool reads (' + SUPPORTED_FORMATS.join(', ') + ')' };
  }
  if (SUPPORTED_FORMATS.indexOf(raw) === -1) {
    return { kind: 'unsupported', version: raw,
      label: 'declares meta.formatVersion ' + raw + ', which this tool cannot read ' +
        '(known formats: ' + SUPPORTED_FORMATS.join(', ') + '). A version above ' +
        CAPTURE_FORMAT + ' is a FUTURE encoding, not an older one' };
  }
  return { kind: 'supported', version: raw, declared: true };
}

function completenessOf(snapshot) {
  const encoding = encodingOf(snapshot);
  if (encoding.kind === 'unsupported') {
    return { kind: 'unsupported', label: encoding.label };
  }
  const meta = snapshot && snapshot.meta ? snapshot.meta : null;
  const hasFlag = !!meta && Object.prototype.hasOwnProperty.call(meta, 'complete');
  const hasOmissions = !!meta && Object.prototype.hasOwnProperty.call(meta, 'omissions');

  /* Question 2. Absent in EVERY supported format, current included -- the
     after-CL artifact is format 3 and carries neither field. Legacy
     compatibility is about metadata that is not there; it is not a licence to
     ignore metadata that is. */
  if (!hasFlag && !hasOmissions) {
    /* This label used to add "(format N predates the completeness contract)",
       which for a format-3 capture asserts the OPPOSITE of the finding that
       produced it -- and for any capture states as fact something absence
       cannot establish. Unknown means unknown: no declaration, and no claim
       about when the capture was taken. */
    return { kind: 'unknown', label: 'records no completeness metadata, so whether it ' +
      'captured the whole corpus cannot be established from the file -- this is ' +
      'neither a declaration of incompleteness nor evidence that the capture ' +
      'predates the contract' };
  }

  /* Question 3, and from here the format no longer matters: present evidence
     is honoured wherever it appears. */
  const omissions = meta.omissions;
  if (hasOmissions && !Array.isArray(omissions)) {
    return { kind: 'malformed', label: 'records meta.omissions as ' + typeof omissions +
      ', not a list, so its omission evidence cannot be read' };
  }
  const recorded = Array.isArray(omissions) ? omissions.length : 0;
  if (!hasFlag) {
    return { kind: 'malformed', label: 'records meta.omissions without meta.complete, so ' +
      'it carries omission evidence and no claim about what that evidence means' };
  }
  const flag = meta.complete;
  if (typeof flag !== 'boolean') {
    return { kind: 'malformed', label: 'records meta.complete as ' + safeJson(flag) +
      ', not a boolean' };
  }
  if (flag === false) {
    return { kind: 'incomplete', label: 'declares meta.complete = false' };
  }
  if (recorded > 0) {
    return { kind: 'malformed', label: 'declares meta.complete = true while recording ' +
      recorded + ' omission(s) -- the writer derives one from the other, so this ' +
      'combination cannot come from a real capture' };
  }
  return { kind: 'complete', label: '' };
}

/* Kinds that can never be a regression result. `unknown` is deliberately NOT
   here: it is guarded at the empty result instead, for the same reason P7-03
   scoped the input-identity refusal there. A non-empty diff already says
   "these differ", which stays true whether or not completeness is known; it is
   AGREEMENT that cannot be qualified inside an array. Refusing every
   comparison would also strand the shipped format-1 and format-2 baselines for
   difference detection, which is a real cost and buys nothing. */
const UNCOMPARABLE_KINDS = ['incomplete', 'malformed'];

/* P9-02: the classifier had ALREADY established that this field is not a list,
   and both display paths then consumed it as one -- so the refusal died inside
   its own error message with `.map is not a function`, and the actual reason
   never reached the caller. Read evidence only after confirming its shape. */
function omissionLines(snapshot, indent) {
  const o = snapshot && snapshot.meta ? snapshot.meta.omissions : undefined;
  if (o === undefined) return [];
  /* Not a list: the classification label already says so, and repeating it
     here reads as two findings rather than one. Say nothing. */
  if (!Array.isArray(o)) return [];
  return o.map((rec) => {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
      return indent + '(a malformed omission record: ' + typeof rec + ')';
    }
    return indent + 'omitted ' + safeText(rec.source, 'source') + ': ' +
      safeText(rec.reason, 'reason');
  });
}

/* H12-01: WHAT "CLASSIFY ONCE" ACTUALLY MEANS HERE, stated to the boundary
   that holds rather than to the boundary that sounded good.
   `diffSnapshots()` classifies once per side for the whole call. The CLI is a
   sequence of calls, and the round-14 dispatch described it as though it were
   one: it built its verdicts and then called assertComparable() WITHOUT them,
   so the helper classified again -- four calls on an equal pair, six on a
   changed one, against two for the API.
   Two things follow. The verdicts are now carried into this function (two
   calls on the equal CLI path), and the round-14 parameter that let ANY caller
   supply verdicts is gone: an exported channel for "trust these verdicts" is a
   way to bypass every gate below, and it was introduced to save re-running a
   pure function. Internal callers use assertComparableWith(); the exported
   assertComparable() always classifies for itself.
   Recomputation is safe now in a way it was not before P11-A: with no value
   able to run its own conversion methods, completenessOf() is a pure function
   of the snapshot, so a second call cannot disagree with the first unless the
   caller mutated the snapshot in between. */
function assertComparableWith(before, after, options, verdicts) {
  /* P11-B: THE ENCODING GATE MOVED ABOVE THE FORMAT COMPARISON, because the
     comparison itself was unsafe. It read the RAW declarations and, on
     mismatch, concatenated them into a message. Two separately parsed copies
     of {"formatVersion":{"toString":null}} are structurally identical and are
     two distinct object references, so `a !== b` took the mismatch branch and
     the concatenation threw before the named refusal was ever reached. An API
     test comparing a snapshot with ITSELF passed, because one reference is
     equal to itself -- the control could not reach the defect, which is
     P7-02's lesson in a new place.
     Object identity is not a statement about encoding compatibility. */
  const unreadable = verdicts.find(([, , v]) => v.kind === 'unsupported');
  if (unreadable) {
    throw new Error(
      'capture-baseline: the ' + unreadable[0] + ' snapshot ' + unreadable[2].label + '.\n' +
      '  This is a question about the result encoding, not about completeness, so no\n' +
      '  option overrides it. Nothing can be concluded by comparing a capture whose\n' +
      '  shape this tool does not know.'
    );
  }
  /* Both sides are now KNOWN INTEGERS from the supported set. */
  const a = encodingOf(before).version;
  const b = encodingOf(after).version;
  if (a !== b) {
    throw new Error(
      'capture-baseline: refusing to diff format ' + a + ' against format ' + b + '.\n' +
      '  Format 1 captured runScenario() excluding ' + V1_EXCLUDED.join(' and ') + '.\n' +
      '  Format 2 captures runPlan() with zero exclusions.\n' +
      '  Every scenario would report the whole identity block as removed, which is a\n' +
      '  fact about the entry point, not about the engine. Recapture the older side at\n' +
      '  its own commit with this version of the tool, then diff.'
    );
  }
  /* S3-01: two DIFFERENT corpora cannot be regression-compared at all. Equal
     outputs across different inputs is a coincidence, not a pass. A missing
     hash on either side is weaker -- legacy snapshots predate the field -- so
     that stays permitted and is labelled DIAGNOSTIC by the caller, and must
     never produce a regression-gate success. */
  /* P7-03: `unknown` used to be COMPUTED AND DISCARDED here -- only
     `different` threw. The CLI labelled unknown identity and exited 1, but the
     public diff returned a bare `[]` whose only own property is `length`, so a
     caller reading an empty diff as a regression pass could not tell unknown
     input identity from verified input identity. That is the same inference
     the CR2-05 comment below already refuses to allow for declared
     incompleteness, applied to the other half of the question.

     So unknown is now refused at the public boundary too, and diagnostic
     inspection is an EXPLICIT opt-in rather than the default. Deliberately a
     SEPARATE permission from `allowIncomplete`: one says "I know this corpus is
     partial", the other says "I do not know whether these two describe the same
     scenarios". Neither implies the other. */
  const input = inputComparability(before, after);
  if (input.kind === 'different') {
    throw new Error(
      'capture-baseline: refusing to diff two captures of DIFFERENT corpus inputs.\n' +
      '  ' + input.label + '\n' +
      '  Output equality across different scenario inputs is a coincidence, not a\n' +
      '  regression result. Recapture both sides over the same corpus, then diff.'
    );
  }
}

/* EXT-02: SCENARIO NAMES ARE AN IDENTITY, AND AN OBJECT LITERAL IS NOT A MAP.
 *
 * This function indexed entries into `const m = {}`. Two ways that loses a
 * scenario, both measured on this tree before the repair:
 *
 *   1. `__proto__` is an inherited ACCESSOR on Object.prototype, so
 *      `m['__proto__'] = entry` runs a setter and creates no own property.
 *      An entry named `__proto__` whose value moved 100 -> 999 diffed to `[]`.
 *      `constructor`, `toString` and `hasOwnProperty` all work, because those
 *      are inherited DATA properties that assignment simply shadows -- which
 *      is why "avoid reserved-looking names" is not the lesson. Exactly one
 *      name behaves differently, and nothing about it looks special at the
 *      call site. Same root cause as CL-01's `var seen = {}`.
 *
 *   2. Duplicate names were last-entry-wins, silently. Worse than lossy: the
 *      ANSWER DEPENDED ON ARRAY ORDER. Two entries both named `dup`, with the
 *      SECOND changed, reported the difference; with the FIRST changed, the
 *      surviving pair was identical and the report was `[]`. A regression
 *      detector that returns a different verdict for the same set of facts
 *      depending on their order is not a detector.
 *
 * verifyIntegrity() could not catch either one, and that is worth stating
 * plainly: it walks `entries` as an ARRAY, so it hashes both duplicates and
 * the `__proto__` entry quite happily and reports the file as internally
 * consistent. The integrity pass and the diff disagreed about how many
 * scenarios the file contained, and only the diff spoke to the user.
 *
 * The repair is a Map plus validation BEFORE indexing, because a Map alone
 * would still silently overwrite on a duplicate. Names must be non-empty
 * strings and must be unique; anything else is a named refusal, not a
 * best-effort comparison. An unusual but genuinely unique name -- `__proto__`
 * included -- now compares correctly rather than being banned, since the
 * defect was never the name.
 */
function indexByName(snapshot, label) {
  const map = new Map();
  const firstAt = new Map();
  const entries = (snapshot && snapshot.entries) || [];
  if (!Array.isArray(entries)) {
    throw new Error('capture-baseline: ' + label + ' has no entries array to index.');
  }
  entries.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(
        'capture-baseline: ' + label + ' entry ' + i + ' is ' + describeValue(entry) +
        ', not a capture entry. Every entry must be an object with a name and a result.'
      );
    }
    const name = entry.name;
    if (typeof name !== 'string' || name === '') {
      throw new Error(
        'capture-baseline: ' + label + ' entry ' + i + ' has name ' + describeValue(name) +
        '. A scenario name must be a non-empty string -- it is the only thing that\n' +
        '  pairs a before-entry with its after-entry, and a missing one silently\n' +
        '  indexed every such entry under the same key.'
      );
    }
    if (map.has(name)) {
      throw new Error(
        'capture-baseline: ' + label + ' contains two entries named "' + name + '"\n' +
        '  (positions ' + firstAt.get(name) + ' and ' + i + ').\n' +
        '  Duplicate names are refused rather than resolved. Indexing them kept the\n' +
        '  last one, which made the diff verdict depend on entry order: the same two\n' +
        '  files reported CHANGED or IDENTICAL according to which duplicate moved.\n' +
        '  Fix the corpus so names are unique, then recapture.'
      );
    }
    firstAt.set(name, i);
    map.set(name, entry);
  });
  return map;
}

function describeValue(v) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'an array';
  if (typeof v === 'string') return JSON.stringify(v);
  return 'a ' + typeof v + ' (' + String(v) + ')';
}

/* The exported boundary. It never accepts verdicts from a caller. */
function assertComparable(before, after, options) {
  return assertComparableWith(before, after, options, classifySides(before, after));
}

function diffSnapshots(before, after, options) {
  /* P11-A: one classification per side for the whole call. Recomputing let a
     later gate reach a different verdict than an earlier one over the same
     input. */
  const sides = classifySides(before, after);
  assertComparableWith(before, after, options, sides);
  /* P7-03: THE DANGER IS THE EMPTY ARRAY, AND ONLY THE EMPTY ARRAY.
   *
   * An empty diff is this function's SUCCESS REPRESENTATION, and it used to be
   * returned identically whether corpus-input identity was verified or unknown
   * -- its only own property is `length`, so a caller reading `[]` as a
   * regression pass could not tell the two apart. That is the defect.
   *
   * A NON-empty diff carries no such false assurance: it already says
   * "these differ", which is true regardless of whether the two captures
   * describe the same scenarios, and reporting those differences is more
   * useful than refusing to look. So the refusal is scoped to the case that
   * can actually be mistaken for a pass, rather than to every comparison that
   * happens to lack the field.
   *
   * Deliberately a SEPARATE permission from `allowIncomplete`: one says "I know
   * this corpus is partial", the other says "I do not know whether these two
   * describe the same scenarios". Neither implies the other. */
  const guardEmpty = (report) => {
    if (report.length !== 0) return report;
    /* P9-01: UNKNOWN COMPLETENESS, same instrument, same reason. A capture that
       records no completeness metadata cannot produce a verified regression
       pass -- but it can still report differences, so only the empty result is
       refused. `allowIncomplete` is the deliberate opt-in, exactly as for a
       declared-incomplete capture. */
    if (!(options && options.allowIncomplete)) {
      const side = sides.find(([, , v]) => v.kind === 'unknown');
      if (side) {
        throw new Error(
          'capture-baseline: refusing to report an EMPTY diff when the ' + side[0] +
          ' snapshot\'s completeness is UNKNOWN.\n' +
          '  It ' + side[2].label + '.\n' +
          '  This is NOT a declaration of incompleteness, and the file may well be whole --\n' +
          '  but an empty diff is this function\'s success representation, and agreement\n' +
          '  cannot be qualified inside an array. Differences would have been reported.\n' +
          '  Pass { allowIncomplete: true } to inspect diagnostically; that is not a pass.'
        );
      }
    }
    if (options && options.allowUnknownInputs) return report;
    const input = inputComparability(before, after);
    if (input.kind !== 'unknown') return report;
    throw new Error(
      'capture-baseline: refusing to report an EMPTY diff when corpus-input identity is UNKNOWN.\n' +
      '  ' + input.label + '\n' +
      '  An empty diff is this function\'s success representation, and here it would be\n' +
      '  indistinguishable from a verified regression pass. Differences would have been\n' +
      '  reported normally -- it is agreement that cannot be qualified inside an array.\n' +
      '  Pass { allowUnknownInputs: true } to inspect diagnostically; that is not a pass.'
    );
  };
  /* CR2-05: the PUBLIC boundary refuses too, not only the CLI. A caller that
     reads `[]` from this function as "nothing changed" is making exactly the
     inference the CLI's IDENTICAL shortcut was making, and three determinism
     assertions in tests/capture-baseline.test.js do read it that way.

     Declared-incomplete and self-contradictory metadata are refused wherever
     they appear. Absent metadata is UNKNOWN and is guarded at the empty result
     instead -- see UNCOMPARABLE_KINDS. */
  /* P9-01's refusal now happens at the top of this function, before any raw
     format value is read or displayed. `allowIncomplete` still cannot grant
     it: that option says "I know this corpus is partial", which is not a claim
     about whether the file can be read. */
  if (!(options && options.allowIncomplete)) {
    const side = sides.find(([, , v]) => UNCOMPARABLE_KINDS.indexOf(v.kind) !== -1);
    if (side) {
      const verdict = side[2];
      throw new Error(
        [
          'capture-baseline: the ' + side[0] + ' snapshot ' + verdict.label + ',',
          '  so a comparison against it cannot be a regression result.',
        ].concat(omissionLines(side[1], '  ')).concat([
          '  It can only report agreement about the scenarios it happens to contain. Pass',
          '  { allowIncomplete: true } to compare deliberately, and label what comes back.',
        ]).join('\n')
      );
    }
  }
  const A = indexByName(before, 'the before snapshot');
  const B = indexByName(after, 'the after snapshot');
  const names = Array.from(new Set([...A.keys(), ...B.keys()])).sort();
  const report = [];
  names.forEach((name) => {
    if (!A.has(name)) { report.push({ scenario: name, added: true, diffs: [] }); return; }
    if (!B.has(name)) { report.push({ scenario: name, removed: true, diffs: [] }); return; }
    /* RA-04: compare hashes RECOMPUTED from the contents, never the stored
       ones. Trusting the stored pair is what let a hand-edited capture report
       IDENTICAL. Recomputation costs one sha256 per entry per side. */
    if (hashOf(A.get(name).result) === hashOf(B.get(name).result)) return;
    report.push({ scenario: name, diffs: differences(A.get(name).result, B.get(name).result, '') });
  });
  return guardEmpty(report);
}

function describe(d) {
  const fmt = (v) => (typeof v === 'number' ? String(v) : JSON.stringify(v));
  return '    ' + d.path + ': ' + fmt(d.before) + '  ->  ' + fmt(d.after);
}

function main(argv) {
  const cmd = argv[0];

  if (cmd === 'capture') {
    const args = argv.slice(1);
    const allowIncomplete = args.includes('--allow-incomplete');
    const measured = args.includes('--measured');
    const at = args.indexOf('--composition');
    const composition = at === -1 ? 'control' : args[at + 1];
    const out = args.filter((a, i) => a !== '--allow-incomplete' && a !== '--measured' && i !== at && (at === -1 || i !== at + 1))[0];
    if (!out) throw new Error('usage: node tools/capture-baseline.js capture <out.json> [--allow-incomplete] [--composition control|expanded] [--measured]');
    if (measured && allowIncomplete) throw new Error('--measured and --allow-incomplete cannot be combined: a reduced run is a diagnostic, never a measurement');
    /* Outside the try: an unknown composition is a usage error, not a corpus
       that happens to be incomplete. */
    compositionOf({ composition });
    let snap;
    try {
      snap = capture({ allowIncomplete, composition });
    } catch (e) {
      /* S4 task 3: a refused plan is not a missing scenario, and saying
         "incomplete" would send the reader looking for an omission. */
      if (e && e.code === 'CAPTURE_INPUT_UNFAITHFUL') {
        console.log('CAPTURE INPUT REFUSED — a scenario plan cannot survive the JSON round trip the engine is handed.\n');
        console.log(String(e.message));
        return 1;
      }
      /* ST2-02: the strict path fails HERE, before any success line is
         printed. The old behaviour printed "Captured 16 scenarios" and exited
         0 over a corpus missing twenty of them. */
      console.log('CORPUS INCOMPLETE — refusing to write a partial baseline.\n');
      console.log(String(e.message));
      return 1;
    }
    /* S4 task 5.4: explicit, and before anything is written. */
    const boundary = snap.meta.boundary;
    if (!boundary.qualified) {
      const describe = () => {
        console.log('  commit     : ' + boundary.commit);
        console.log('  reason     : ' + boundary.reason);
        boundary.mismatched.forEach((f) => console.log('  differs    : ' + f));
        boundary.untracked.forEach((f) => console.log('  untracked  : ' + f));
        (boundary.changedDuringCapture || []).forEach((f) => console.log('  changed    : ' + f + ' (while the capture ran)'));
        console.log('');
      };
      if (measured) {
        console.log('UNQUALIFIED CAPTURE REFUSED — --measured requires every input to be the committed bytes of the commit it records.\n');
        describe();
        console.log('Nothing was written. Capture in an isolated worktree of a pinned commit: git -c core.longpaths=true worktree add --detach <path> <commit>');
        return 1;
      }
      console.log('UNQUALIFIED CAPTURE — meta.boundary.qualified = false. The file is written, and it is');
      console.log('disqualified as a measurement: its inputs are not the commit it records.');
      describe();
    }
    fs.writeFileSync(out, JSON.stringify(snap, null, 2));
    if (!snap.meta.complete) {
      /* Loud, above the success line rather than below it, and the file says
         so too. A reduced run reports its omissions every single time. */
      console.log('REDUCED CAPTURE — meta.complete = false. This file is a diagnostic');
      console.log('artefact and MUST NOT be used as a baseline or a release gate input.');
      snap.meta.omissions.forEach((o) => { console.log('  omitted ' + o.source + ': ' + o.reason); });
      console.log('');
    }
    console.log('Captured ' + snap.entries.length + ' scenarios to ' + out);
    console.log('  complete   : ' + snap.meta.complete +
      '   (' + JSON.stringify(snap.meta.composition) + ' of ' + expectedCorpusSize({ composition }) + ', ' + composition + ' composition)');
    console.log('  format     : ' + snap.meta.formatVersion + ' (' + snap.meta.entryPoint + ')');
    console.log('  corpus hash: ' + snap.meta.hash + '   (output entry hashes)');
    console.log('  input hash : ' + snap.meta.corpusInputHash + '   (the plans themselves)');
    console.log('  commit     : ' + snap.meta.gitCommit);
    console.log('  boundary   : ' + (boundary.qualified ? 'qualified -- every input is ' + String(boundary.commit).slice(0, 7) + "'s committed bytes" : 'UNQUALIFIED'));
    console.log('  modes      : ' + JSON.stringify(snap.meta.modes));
    console.log('  excluded   : ' +
      (snap.meta.excludedFields.length ? snap.meta.excludedFields.join(', ') : '(none)'));
    return 0;
  }

  if (cmd === 'diff') {
    /* CR2-05: the diagnostic escape hatch is opt-in and named, matching
       capture's own --allow-incomplete rather than inventing a second spelling. */
    const diffArgs = argv.slice(1);
    const allowIncompleteDiff = diffArgs.includes('--allow-incomplete');
    const [a, b] = diffArgs.filter((x) => x !== '--allow-incomplete');
    if (!a || !b) throw new Error('usage: node tools/capture-baseline.js diff <before.json> <after.json> [--allow-incomplete]');
    const before = JSON.parse(fs.readFileSync(a, 'utf8'));
    const after = JSON.parse(fs.readFileSync(b, 'utf8'));
    /* P11-A: classify once for the whole command. */
    const cliSides = classifySides(before, after);
    const verdictOf = (snap) => {
      const hit = cliSides.find(([, s]) => s === snap);
      return hit ? hit[2] : completenessOf(snap);
    };
    /* P11-B: the encoding gate runs BEFORE anything reads a raw format value,
       including the catch handler below, which used to concatenate it. */
    const unreadableCli = [[a, before], [b, after]]
      .filter(([, snap]) => verdictOf(snap).kind === 'unsupported');
    if (unreadableCli.length) {
      console.log('REFUSING TO COMPARE — unreadable result encoding:' + String.fromCharCode(10));
      unreadableCli.forEach(([file, snap]) => {
        console.log('  ' + file);
        console.log('      ' + verdictOf(snap).label);
      });
      console.log(String.fromCharCode(10) + 'This is not a completeness question and --allow-incomplete does not');
      console.log('override it. Nothing can be concluded by comparing a capture whose shape');
      console.log('this tool does not know.');
      return 1;
    }
    /* Before anything else: the two files must describe the same kind of
       thing. A cross-format diff is noise that reads like a regression. */
    /* S3-01: declared out here because the equality shortcut further down
       needs it too -- block-scoping it inside the try left that reference
       unresolved, which is a crash rather than a wrong answer, but still mine. */
    let inputVerdict = { kind: 'same', label: '' };
    try {
      /* P7-03: the CLI opts INTO diagnostic comparison because it qualifies
         the result itself -- it prints the DIAGNOSTIC banner below and returns
         a non-zero exit. The public API has no way to carry that qualification
         inside an array, which is why its default is refusal. */
      /* H12-01: carry the verdicts computed above instead of making the
         helper classify a second time. */
      assertComparableWith(before, after, { allowUnknownInputs: true }, cliSides);
      /* assertComparable REFUSES different corpora outright. What survives to
         here is same-or-unknown, and "unknown" must still be visibly labelled
         and must never exit 0 as a regression pass. */
      inputVerdict = inputComparability(before, after);
      if (inputVerdict.kind !== 'same') {
        console.log('DIAGNOSTIC COMPARISON — ' + inputVerdict.label + '. This is');
        console.log('NOT a regression result and must not be cited as one.' + String.fromCharCode(10));
      }
    } catch (e) {
      /* P11-B: this used to concatenate the RAW declaration, so a refusal that
         had already been formatted safely died in its own footer and escaped
         as a stack trace. Both sides are described through the classifier. */
      console.log(String(e.message));
      console.log(String.fromCharCode(10) + '  ' + a + '  ' + describeEncoding(before));
      console.log('  ' + b + '  ' + describeEncoding(after));
      return 1;
    }
    /* RA-04: establish that each file's own hashes describe its own contents
       BEFORE any comparison leans on them. A corrupted or hand-edited capture
       must announce itself rather than quietly reporting IDENTICAL. */
    const corrupt = [[a, before], [b, after]]
      .map(([file, snap]) => verifyIntegrity(snap).map((p) => ({ file, ...p })))
      .reduce((all, x) => all.concat(x), []);
    if (corrupt.length) {
      console.log('SNAPSHOT INTEGRITY FAILURE — these files do not describe themselves:\n');
      corrupt.forEach((p) => { console.log('  ' + p.file + '  ' + p.name + ': ' + p.reason); });
      /* EXT-02: say the RIGHT thing. This advice was unconditional, so an
         identity failure -- where every stored hash is perfectly correct --
         was told "your hashes disagree with your contents, recapture". That
         sends the reader to look for corruption that is not there. Advise per
         the kind of problem actually found. */
      if (corrupt.some((p) => p.kind === 'hash')) {
        console.log('\nA capture whose stored hashes disagree with its contents has been edited');
        console.log('or corrupted. Recapture from source; do not "fix" it by rewriting hashes.');
      }
      if (corrupt.some((p) => p.kind === 'identity')) {
        console.log('\nThe stored hashes above are CORRECT. What is wrong is scenario identity:');
        console.log('entries the diff cannot tell apart, so it would compare fewer scenarios');
        console.log('than the file contains. Fix the corpus names, then recapture.');
      }
      return 1;
    }
    /* CR2-05: COMPLETENESS IS CHECKED BEFORE THE SUCCESS SHORTCUT, not after it.
     *
     * ST2-02 taught capture and verify to refuse a partial corpus, and taught
     * diff to WARN about one -- but the warning sat in the changed-results
     * branch, below this early return. So a reduced snapshot diffed against
     * itself took the shortcut on matching corpus hashes and printed
     *
     *     IDENTICAL — corpus hash ...
     *
     * exit 0, with no mention of the omission the file declares about itself.
     * Two files can agree perfectly about the sixteen scenarios they contain
     * and say nothing about the twenty they do not. Content equality and
     * completeness are different assertions and neither implies the other;
     * this shortcut was reading one as the other.
     *
     * ABSENT METADATA IS UNKNOWN, NOT FALSE -- and not a licence either. The
     * sentence that used to stand here said legacy snapshots "could not have
     * carried" the flag and so only an explicit complete:false was refused.
     * P9-01 retired that: format does not identify the contract, so absence is
     * unknown in EVERY supported format. What the old reasoning was protecting
     * survives, and it is real -- the shipped baselines stay usable, because
     * only AGREEMENT is withheld and difference detection needs no permission. */
    /* P8-02: same validator as the public API, so the two cannot disagree
       about what "complete" means -- which is the drift this file has already
       been bitten by three times. */
    /* The encoding gate already ran, above the try. */
    const incomplete = [[a, before], [b, after]].filter(([, snap]) =>
      UNCOMPARABLE_KINDS.indexOf(verdictOf(snap).kind) !== -1);
    /* P9-01: absent metadata is UNKNOWN -- qualified and never exit 0, but not
       described as a declaration the file never made. */
    const unknownSides = [[a, before], [b, after]].filter(([, snap]) =>
      verdictOf(snap).kind === 'unknown');
    if (incomplete.length && !allowIncompleteDiff) {
      /* Deduplicated by path: diffing a file against itself is the audit's own
         reproducer, and listing it twice reads like two separate problems. */
      const unique = incomplete.filter(([file], i) =>
        incomplete.findIndex(([f]) => f === file) === i);
      /* P9-02: the heading used to assert that every refused file "declares
         itself incomplete". A malformed capture makes no such declaration, and
         the historical after-CL artifact makes no declaration at all -- so the
         tool was printing a false statement about a real file. Each file now
         carries its OWN classified reason. */
      console.log('REFUSING TO COMPARE — ' +
        (unique.length === 1 ? 'this file cannot serve as a regression baseline:'
                             : 'these ' + unique.length + ' files cannot serve as regression baselines:') + '\n');
      unique.forEach(([file, snap]) => {
        const verdict = verdictOf(snap);
        console.log('  ' + file);
        console.log('      ' + verdict.kind.toUpperCase() + ' — ' + verdict.label);
        omissionLines(snap, '      ').forEach((line) => { console.log(line); });
      });
      console.log('\nA capture that is reduced, or whose completeness metadata cannot be true,');
      console.log('is a diagnostic artefact rather than a baseline. Comparing two of them can');
      console.log('only report agreement about the scenarios they happen to share, and the');
      console.log('scenarios they OMIT are exactly the ones nobody is looking at.');
      console.log('Recapture completely, or pass --allow-incomplete to compare them anyway');
      console.log('and have the result labelled as the diagnostic it is.');
      return 1;
    }
    if (incomplete.length) {
      console.log('DIAGNOSTIC COMPARISON — ' + incomplete.length + ' side(s) incomplete. This is');
      console.log('NOT a regression result and must not be cited as one.\n');
    }
    if (unknownSides.length) {
      console.log('COMPLETENESS UNKNOWN — ' + unknownSides.length + ' side(s) record no');
      console.log('completeness metadata. They do not declare themselves incomplete, and may');
      console.log('well be whole; but that cannot be established from the files, so agreement');
      console.log('below is not a verified regression pass.\n');
      unknownSides
        .filter(([file], i) => unknownSides.findIndex(([f]) => f === file) === i)
        .forEach(([file, snap]) => {
          console.log('  ' + file + ' — ' + verdictOf(snap).label);
        });
      console.log('');
    }
    /* P6-02: this compared STORED metadata, so two snapshots that had both
       lost `meta.hash` compared `undefined === undefined`, took the shortcut,
       and printed IDENTICAL with exit 0 over rows that genuinely differed --
       bypassing the per-entry diff, which was working the whole time and would
       have reported the change. Metadata is a claim about content; it is not
       the content. Recomputed from the entries on both sides, so there is
       nothing that can be absent. */
    const beforeCorpus = hashOf(before.entries.map((e) => [e.name, e.hash]));
    const afterCorpus = hashOf(after.entries.map((e) => [e.name, e.hash]));
    if (beforeCorpus === afterCorpus) {
      console.log('IDENTICAL — corpus hash ' + beforeCorpus +
        (inputVerdict.kind !== 'same' ? '   (' + inputVerdict.label + ')' : '') +
        (incomplete.length ? '   (over an INCOMPLETE corpus — see above)' : '') +
        (unknownSides.length ? '   (completeness UNKNOWN — see above; NOT a verified pass)' : ''));
      return (incomplete.length || unknownSides.length || inputVerdict.kind !== 'same') ? 1 : 0;
    }
    const report = diffSnapshots(before, after, { allowIncomplete: true, allowUnknownInputs: true });
    let leafCount = 0;
    console.log('CHANGED — ' + report.length + ' scenario(s) differ\n');
    report.forEach((r) => {
      if (r.added) { console.log('  + ' + r.scenario + ' (only in after)'); return; }
      if (r.removed) { console.log('  - ' + r.scenario + ' (only in before)'); return; }
      console.log('  ~ ' + r.scenario + ' — ' + r.diffs.length + ' field(s)');
      r.diffs.slice(0, 40).forEach((d) => { console.log(describe(d)); });
      if (r.diffs.length > 40) console.log('    … ' + (r.diffs.length - 40) + ' more');
      leafCount += r.diffs.length;
    });
    /* ST2-02: a removal is a difference even though it carries no leaf diffs.
       Under an injected generator fault this footer read "Total differing
       fields: 0" beneath a list of twenty removed scenarios -- the bottom line
       a skimming reader trusts, saying nothing changed. Count the structural
       differences separately rather than letting them total to zero. */
    const gone = report.filter((r) => r.removed).length;
    const fresh = report.filter((r) => r.added).length;
    console.log('\nTotal differing fields: ' + leafCount +
      (gone || fresh ? '  (plus ' + gone + ' scenario(s) removed and ' + fresh + ' added, which carry no field diffs)' : ''));
    if (gone) {
      console.log('SCENARIOS DISAPPEARED. Before reading this as a result, confirm the after-side');
      console.log('corpus is complete — a partial capture removes scenarios without changing one.');
    }
    /* P9-01: a THIRD site was still asking `meta.complete === false` directly,
       so the footer stayed silent about malformed and unknown captures whose
       differences it had just printed. Same validator as the two gates. */
    [[a, before], [b, after]].forEach(([file, snap]) => {
      const verdict = verdictOf(snap);
      if (verdict.kind === 'incomplete') {
        console.log('WARNING: ' + file + ' is a REDUCED capture (meta.complete = false). It is not a baseline.');
      } else if (verdict.kind === 'malformed') {
        console.log('WARNING: ' + file + ' ' + verdict.label + '. It is not a baseline.');
      } else if (verdict.kind === 'unknown') {
        console.log('NOTE: ' + file + ' ' + verdict.label + '.');
      }
    });
    console.log('Every one of these must have a stated financial reason before any expected value is updated.');
    return 1;
  }

  if (cmd === 'compare-inputs') {
    /* S4 task 4.7: say WHY two captures are not comparable. Exit 0 only when
       every scenario's inputs are the same. */
    const [a, b] = argv.slice(1);
    if (!a || !b) throw new Error('usage: node tools/capture-baseline.js compare-inputs <reference.json> <candidate.json>');
    const verdict = compareInputs(JSON.parse(fs.readFileSync(a, 'utf8')), JSON.parse(fs.readFileSync(b, 'utf8')));
    console.log('INPUTS ' + verdict.kind.toUpperCase() + ' — ' + verdict.label);
    [['changed', verdict.changed], ['added', verdict.added], ['removed', verdict.removed]].forEach(([what, names]) => {
      names.slice(0, 40).forEach((n) => { console.log('  ' + what + ' ' + n); });
      if (names.length > 40) console.log('  … ' + (names.length - 40) + ' more ' + what);
    });
    console.log('This explains a refusal; it never lifts one. A regression diff still requires identical corpus inputs.');
    return verdict.kind === 'same' ? 0 : 1;
  }

  if (cmd === 'verify') {
    /* Determinism proof. Under format 2 there is nothing excluded, so this is
       now the strong form: ANY field that moves between two captures of
       unchanged source is a defect. */
    /* ST2-02: determinism over a partial corpus is not determinism. Under an
       injected generator fault this command printed DETERMINISTIC and exited
       0, because it compares two captures to each other and two equally
       crippled captures agree perfectly. Completeness is established BEFORE
       agreement is claimed, and there is deliberately no --allow-incomplete
       here: a reduced run cannot certify anything. */
    const vargs = argv.slice(1);
    const vat = vargs.indexOf('--composition');
    const verifyOptions = { composition: vat === -1 ? 'control' : vargs[vat + 1] };
    compositionOf(verifyOptions);
    let first;
    let second;
    try {
      first = capture(verifyOptions);
      second = capture(verifyOptions);
    } catch (e) {
      if (e && e.code === 'CAPTURE_INPUT_UNFAITHFUL') {
        console.log('CANNOT CERTIFY DETERMINISM — a scenario plan was refused before capture.\n');
        console.log(String(e.message));
        return 1;
      }
      console.log('CANNOT CERTIFY DETERMINISM — the corpus is incomplete.\n');
      console.log(String(e.message));
      console.log('\nTwo captures of a partial corpus agree with each other perfectly. That');
      console.log('agreement is a fact about the omission, not about the engine.');
      return 1;
    }
    if (first.meta.hash === second.meta.hash) {
      console.log('DETERMINISTIC — two captures agree, hash ' + first.meta.hash);
      console.log('  entry point: ' + first.meta.entryPoint + ', excluded: ' +
        (EXCLUDED.length ? EXCLUDED.join(', ') : '(none)'));
      return 0;
    }
    const report = diffSnapshots(first, second);
    console.log('NON-DETERMINISM DETECTED in fields that are NOT excluded:\n');
    report.forEach((r) => {
      console.log('  ~ ' + r.scenario);
      r.diffs.slice(0, 20).forEach((d) => { console.log(describe(d)); });
    });
    console.log('\nDo NOT add these to EXCLUDED to make this pass. A newly non-deterministic');
    console.log('field is a defect in the engine or a leak of wall-clock/entropy into output.');
    return 1;
  }

  console.log('usage:');
  console.log('  node tools/capture-baseline.js capture <out.json> [--composition control|expanded]');
  console.log('  node tools/capture-baseline.js diff <before.json> <after.json>');
  console.log('  node tools/capture-baseline.js verify [--composition control|expanded]');
  console.log('  node tools/capture-baseline.js compare-inputs <reference.json> <candidate.json>');
  return 2;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  /* S3 task 2: corpus() is exported so the scenario set has ONE definition.
     It was private, and three separate S3 tasks are written against it -- each
     would otherwise rebuild its own copy of "the golden set plus these seeds",
     which is precisely how two corpora drift apart and how a test ends up
     confidently covering a scenario set nobody ships. Same reasoning as Q15's
     debt factory and Q20's worker registry: package the graph once, feed every
     entry point from it. */
  capture, captureEntry, corpus,
  /* ST2-02: the diagnostic path and the composition contract, exported so a
     test can assert that a reduced run REPORTS its omissions rather than
     inferring completeness from a count that happens to look right. */
  corpusWithDiagnostics, expectedCorpusSize, REQUIRED_TARGETED,
  diffSnapshots, differences, verifyIntegrity, installDebtModules,
  /* EXT-02: exported so the identity contract is testable directly, not only
     through a diff that would report its refusal as a thrown string. */
  indexByName,
  hashOf, canonical, stripExcluded, EXCLUDED, GENERATED_SEEDS,
  /* RP-04: exported so the Worker parity harness can share ONE own-property-safe
     assignment instead of keeping a fourth copy of the `out[k] = v` mistake.
     CL-01 fixed it in the engine, EXT-02 in the diff index, CL-03 here -- and
     it reappeared in tests/worker-parity.test.js, which is an instrument for
     detecting differences that was silently erasing one. */
  assignOwn,
  /* S3 task 2: the format-2 surface. FIELD_COUNTS is the single source task 9
     criterion 3 must read from, so the two cannot drift apart. */
  CAPTURE_FORMAT, V1_EXCLUDED, canonicalV2, hashForFormat, FIELD_COUNTS, fieldCountsFor, formatVersionOf, corpusInputHash, inputComparability, completenessOf, encodingOf, SUPPORTED_FORMATS, safeJson, classifySides, assertComparable, verifyIntegrity,
  gitCommit,
  /* S4 task 3: exported so its refusals are testable directly, as well as
     through capture() and the CLI. */
  assertJsonFaithful,
  /* S4 task 4.7: per-scenario input identity. */
  inputHashesOf, compareInputs,
  /* S4 task 4: corpus compositions. */
  COMPOSITIONS,
  /* S4 task 5.4: the execution boundary. */
  captureInputs, CORPUS_INPUTS, DATA_INPUTS, inputGraphOf, boundaryOf,
};
