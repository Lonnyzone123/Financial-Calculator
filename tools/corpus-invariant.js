'use strict';
/*
 * The corpus invariant -- an INDEPENDENT second measurement of a baseline
 * capture. S4 task 3 (3.0, 3.0a, 3.0c, 3.7).
 *
 * WHY. tools/capture-baseline.js is the instrument the rebuild's acceptance
 * gate rests on, and external audits have found it wrong again and again --
 * EXT-02, ST2-02, CL-03, CR2-04, CR2-05, FC-02, FCR-02 and later rounds (the
 * count belongs to the S2 closure register; S4_TASK_CHECKLIST.md §N says how to
 * cite it). Most of those were the instrument reaching a verdict without
 * looking at the thing it describes. An instrument found wrong that often does
 * not need another patch. It needs a second measurement that reaches its
 * verdict by a different route.
 *
 * THE CONSTRAINT THAT MAKES IT INDEPENDENT (3.0a). This file does not require
 * tools/capture-baseline.js, and must never compute an answer through its
 * corpus(), hashOf(), canonical() or any other path of it. AN INDEPENDENT
 * MEASUREMENT THAT SHARES THE SUSPECT COMPONENT IS NOT INDEPENDENT -- IT IS A
 * SECOND OPINION FROM THE SAME WITNESS. tests/corpus-invariant.test.js reads the
 * code of this file and fails if that ever changes.
 *
 * NECESSARY, NOT SUFFICIENT (3.0c). Counting entries, checking every reviewed
 * name appears exactly once and checking no entry hashes to an empty result is
 * necessary and not sufficient: a capture that silently drops a property
 * (FC-02) still passes all three. So the verdict is a set of SEPARATE checks,
 * each reported on its own:
 *
 *   FORMAT       the file is a capture this decoder can read (format 3)
 *   INVENTORY    every reviewed name exactly once, and nothing else (3.0)
 *   ENCODING     every tag in the file is one the format defines, well-formed
 *   NON-VACUOUS  no entry is, or fingerprints to, a trivially empty result (3.0)
 *   SHAPE        every entry meets the intended result contract, presence as
 *                well as value, top level and rows. It validates whichever file
 *                it is given, so running it on both operands of a diff is how
 *                both operands get validated (3.0c #2)
 *   INPUTS       golden and seed plans still fingerprint to the reviewed
 *                values, and none carries a value JSON would change (3.7)
 *   ROUND-TRIP   each entry, READ BACK FROM DISK and decoded here, equals the
 *                raw runPlan() result computed here before any serialization
 *                (3.0c #3)
 *   SENTINELS    exact values, presence, order and types at hand-authored
 *                paths, when a caller supplies expectations (3.7)
 *
 * ANY failed check fails the run (3.0c #4): nothing is tallied and dropped. A
 * check that could not run for some scenario says so by name, as SKIPPED,
 * never as passed.
 *
 * RAW-DOMAIN REJECTION (3.0c #1) IS NOT THIS FILE'S, and this file must never
 * be cited as closing it. Refusing an unsupported shape before traversal can
 * only happen where the raw value is -- at capture time, inside the capture
 * tool. It is witnessed against tools/capture-baseline.js in
 * tests/corpus-invariant.test.js.
 *
 * SHARED DEPENDENCIES, declared (3.7), and what independence does NOT buy:
 *   - src/engine.js, the debt modules build.js bundles (loaded from its
 *     BUNDLED_MODULES registry) and the rules JSON in src/app-shell.html. Both
 *     tools run the same engine, so a deterministic ENGINE defect is invisible
 *     to both. This measures the capture, not the model.
 *   - tests/lib/golden-scenario-defs.js and tests/lib/scenario-generator.js,
 *     which build the golden and seed plans for both tools. A change to either
 *     is caught only through INPUTS' reviewed fingerprints.
 *   - The targeted plans are built inside tools/capture-baseline.js and nowhere
 *     else, so their INPUTS and ROUND-TRIP are not independently reproducible:
 *     SKIPPED by name. INVENTORY, ENCODING, NON-VACUOUS and SHAPE still cover them.
 *   - tools/result-contract.js, qualified in S4 task 2b.4 (BC-01), for SHAPE.
 *   - The format-3 tag vocabulary (__nonFinite, __negativeZero, __undefined,
 *     __escaped). That is a FORMAT specification the two tools share by
 *     design; the decoder below is written from it, not imported.
 *   - Node's fs, path, crypto and util, and JSON.parse.
 * What independence addresses: capture encoding and traversal, corpus
 * assembly and completeness, scenario-name identity, persistence, and damage
 * shared by both operands of a diff. What it does NOT address: engine
 * correctness, generator correctness beyond the reviewed fingerprints, or the
 * correctness of the model as a whole. Independence protects the listed
 * classes; it is not evidence that the model is right.
 *
 * USAGE
 *   node tools/corpus-invariant.js check <snapshot.json>
 *   node tools/corpus-invariant.js pin-inputs [--write]
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const util = require('node:util');

const ROOT = path.join(__dirname, '..');
const SPEC_PATH = path.join(__dirname, 'corpus-spec.json');
const READABLE_FORMAT = 3;

/* Every repository module this file may require. The test holds the require()
   calls in this file to this list, and to the absence of capture-baseline. */
const SHARED_DEPENDENCIES = [
  'build.js',
  'src/engine.js',
  'src/<each module in build.js BUNDLED_MODULES>',
  'tests/lib/golden-scenario-defs.js',
  'tests/lib/scenario-generator.js',
  'tests/lib/corpus-expansion.js',
  'tools/result-contract.js',
];

// ---------------------------------------------------------------------------
// Rendering without running anyone's code
// ---------------------------------------------------------------------------

/* No value is rendered through its own conversion methods: primitives are
   shown, everything else is named by kind. */
function show(v) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
  if (typeof v === 'string') return JSON.stringify(v.length > 80 ? v.slice(0, 77) + '...' : v);
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return 'an array of ' + v.length;
  return 'a ' + typeof v;
}

// ---------------------------------------------------------------------------
// Fingerprints -- a DIFFERENT algorithm from the capture tool's
// ---------------------------------------------------------------------------

/* Typed and ordered: arrays keep their order, object keys are sorted, and every
   distinction a capture must keep is kept -- NaN, the infinities, -0,
   undefined, null. Written separately from capture-baseline.js's
   canonical()+JSON on purpose: agreement between two encodings written apart is
   evidence, agreement of one encoding with itself is not. */
function encode(value) {
  if (value === undefined) return 'u';
  if (value === null) return 'z';
  switch (typeof value) {
    case 'boolean': return value ? 'T' : 'F';
    case 'number': return Object.is(value, -0) ? 'n-0' : 'n' + String(value);
    case 'string': return 's' + JSON.stringify(value);
    case 'object':
      if (Array.isArray(value)) return 'a[' + value.map(encode).join(',') + ']';
      return 'o{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + encode(value[k])).join(',') + '}';
    default:
      throw new TypeError('corpus-invariant: cannot fingerprint a ' + typeof value);
  }
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(encode(value)).digest('hex');
}

const TRIVIALLY_EMPTY = [undefined, null, {}, [], { rows: [] }, { rows: null }, { status: 'ok', rows: [] }];

// ---------------------------------------------------------------------------
// Reading a capture back
// ---------------------------------------------------------------------------

function readSnapshot(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const TAGS = ['__nonFinite', '__negativeZero', '__undefined', '__escaped'];
const DECODED_UNDEFINED = Symbol('decoded undefined');
const settle = (v) => (v === DECODED_UNDEFINED ? undefined : v);

/* The format-3 encoding, decoded from its specification. A tag object has
   exactly one key; an object whose own keys include a tag name as DATA is
   wrapped in __escaped, whose object's keys are data and are not
   re-interpreted. Anything else carrying a tag key is not an encoding the
   format defines, and is a problem rather than a guess. */
function decode(value, at, problems) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((x, i) => settle(decode(x, at + '[' + i + ']', problems)));
  const keys = Object.keys(value);
  if (keys.some((k) => TAGS.includes(k))) {
    if (keys.length !== 1) {
      problems.push(at + ': a tag key beside other keys (' + keys.map((k) => JSON.stringify(k)).join(', ') + ') -- the format escapes such an object, so this cannot come from a capture');
      return plainOf(value, at, problems);
    }
    const tag = keys[0];
    const v = value[tag];
    if (tag === '__nonFinite') {
      if (v === 'NaN' || v === 'Infinity' || v === '-Infinity') return Number(v);
      problems.push(at + ': __nonFinite carries ' + show(v) + ', not NaN, Infinity or -Infinity');
      return value;
    }
    if (tag === '__negativeZero' || tag === '__undefined') {
      if (v !== true) { problems.push(at + ': ' + tag + ' carries ' + show(v) + ', not true'); return value; }
      return tag === '__negativeZero' ? -0 : DECODED_UNDEFINED;
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      problems.push(at + ': __escaped wraps ' + show(v) + ', not an object');
      return value;
    }
    return plainOf(v, at, problems);
  }
  return plainOf(value, at, problems);
}

function plainOf(obj, at, problems) {
  const out = {};
  for (const k of Object.keys(obj)) {
    Object.defineProperty(out, k, {
      value: settle(decode(obj[k], at + '.' + k, problems)), enumerable: true, writable: true, configurable: true,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Comparison -- presence-, order- and sign-sensitive
// ---------------------------------------------------------------------------

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const kindOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const join = (at, k) => (at ? at + '.' + k : k);

function compare(expected, actual, at, out, limit) {
  if (out.length >= limit) return out;
  const ek = kindOf(expected);
  const ak = kindOf(actual);
  if (ek !== ak) { out.push({ path: at, kind: 'type', expected: ek, actual: ak }); return out; }
  if (ek === 'array') {
    if (expected.length !== actual.length) out.push({ path: at + '.length', kind: 'length', expected: expected.length, actual: actual.length });
    for (let i = 0; i < Math.min(expected.length, actual.length) && out.length < limit; i++) {
      compare(expected[i], actual[i], at + '[' + i + ']', out, limit);
    }
    return out;
  }
  if (ek === 'object') {
    for (const k of Object.keys(expected)) {
      if (!own(actual, k)) out.push({ path: join(at, k), kind: 'missing', expected: expected[k] });
    }
    for (const k of Object.keys(actual)) {
      if (!own(expected, k)) out.push({ path: join(at, k), kind: 'unexpected', actual: actual[k] });
    }
    for (const k of Object.keys(expected)) {
      if (own(actual, k) && out.length < limit) compare(expected[k], actual[k], join(at, k), out, limit);
    }
    return out;
  }
  if (!Object.is(expected, actual)) out.push({ path: at, kind: 'value', expected, actual });
  return out;
}

function describeDifference(d) {
  if (d.kind === 'missing') return d.path + ': ABSENT, expected ' + show(d.expected);
  if (d.kind === 'unexpected') return d.path + ': present (' + show(d.actual) + ') where nothing is expected';
  /* Kinds are this file's own words (kindOf), shown bare: quoting them would
     read as if a string value "number" had been found. */
  if (d.kind === 'type') return d.path + ': type -- expected ' + d.expected + ', found ' + d.actual;
  return d.path + ': ' + d.kind + ' -- expected ' + show(d.expected) + ', found ' + show(d.actual);
}

/* 'rows[1].otherAssets[0].value' -> { found, value }, presence-sensitive. */
function resolve(root, pathText) {
  const tokens = [];
  pathText.split('.').forEach((segment) => {
    const m = /^([^[\]]*)((?:\[\d+\])*)$/.exec(segment);
    if (!m) throw new Error('corpus-invariant: unreadable path ' + JSON.stringify(pathText));
    if (m[1] !== '') tokens.push(m[1]);
    (m[2].match(/\d+/g) || []).forEach((i) => tokens.push(Number(i)));
  });
  let node = root;
  for (const t of tokens) {
    if (typeof t === 'number') {
      if (!Array.isArray(node) || t >= node.length) return { found: false };
    } else if (node === null || typeof node !== 'object' || Array.isArray(node) || !own(node, t)) {
      return { found: false };
    }
    node = node[t];
  }
  return { found: true, value: node };
}

// ---------------------------------------------------------------------------
// The checks. Each returns { id, problems: [], skipped: [] }.
// ---------------------------------------------------------------------------

function checkFormat(snapshot) {
  const problems = [];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    problems.push('the file is ' + show(snapshot) + ', not a capture object');
  } else {
    const meta = snapshot.meta;
    const declared = meta && typeof meta === 'object' && own(meta, 'formatVersion') ? meta.formatVersion : undefined;
    if (declared !== READABLE_FORMAT) {
      problems.push('declares format ' + show(declared) + '; this invariant decodes format ' + READABLE_FORMAT +
        ' only (older captures are catalogued in tools/baseline-registry.json)');
    }
    if (!Array.isArray(snapshot.entries)) problems.push('entries is ' + show(snapshot.entries) + ', not a list');
  }
  return { id: 'FORMAT', problems, skipped: [] };
}

function checkInventory(snapshot, spec) {
  const problems = [];
  const reviewed = spec.scenarios.map((s) => s.name);
  reviewed.filter((n, i) => reviewed.indexOf(n) !== i).forEach((n) => problems.push('the reviewed spec itself lists ' + JSON.stringify(n) + ' twice'));
  const entries = snapshot && Array.isArray(snapshot.entries) ? snapshot.entries : [];
  const positions = new Map();
  entries.forEach((e, i) => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) { problems.push('entry ' + i + ' is ' + show(e) + ', not an entry'); return; }
    if (typeof e.name !== 'string' || e.name === '') { problems.push('entry ' + i + ' has name ' + show(e.name) + ', not a non-empty string'); return; }
    if (!positions.has(e.name)) positions.set(e.name, []);
    positions.get(e.name).push(i);
  });
  reviewed.forEach((name) => {
    const at = positions.get(name) || [];
    if (at.length === 0) problems.push('MISSING: ' + JSON.stringify(name) + ' is in the reviewed corpus and not in the file');
    if (at.length > 1) problems.push('DUPLICATE: ' + JSON.stringify(name) + ' appears ' + at.length + ' times (entries ' + at.join(', ') + ')');
  });
  for (const name of positions.keys()) {
    if (!reviewed.includes(name)) problems.push('UNEXPECTED: ' + JSON.stringify(name) + ' is not a reviewed scenario');
  }
  if (entries.length !== reviewed.length) {
    problems.push('the file holds ' + entries.length + ' entries; the reviewed corpus is ' + reviewed.length);
  }
  const meta = snapshot && snapshot.meta && typeof snapshot.meta === 'object' ? snapshot.meta : null;
  if (meta && own(meta, 'entryCount') && meta.entryCount !== entries.length) {
    problems.push('meta.entryCount claims ' + show(meta.entryCount) + ' while the file holds ' + entries.length);
  }
  /* S4 task 4: a capture of one composition read against another's spec. A
     capture that predates the label is judged by its names alone. */
  if (meta && spec.composition !== undefined && own(meta, 'corpusComposition') && meta.corpusComposition !== spec.composition) {
    problems.push('the file is a ' + show(meta.corpusComposition) + ' capture; this spec describes the ' +
      JSON.stringify(spec.composition) + ' composition');
  }
  return { id: 'INVENTORY', problems, skipped: [] };
}

/* Named entries, decoded. Entries INVENTORY already refused are left out here
   rather than guessed at; INVENTORY has reported them. */
function decodeEntries(snapshot) {
  const problems = [];
  const decoded = [];
  (snapshot.entries || []).forEach((e) => {
    if (!e || typeof e !== 'object' || typeof e.name !== 'string' || e.name === '') return;
    if (!own(e, 'result')) { problems.push(e.name + ': the entry carries no result at all'); return; }
    decoded.push({ name: e.name, result: settle(decode(e.result, e.name, problems)) });
  });
  return { check: { id: 'ENCODING', problems, skipped: [] }, decoded };
}

function checkNonVacuous(decoded) {
  const problems = [];
  const empties = new Set(TRIVIALLY_EMPTY.map(fingerprint));
  decoded.forEach(({ name, result }) => {
    if (empties.has(fingerprint(result))) { problems.push(name + ': the result is trivially empty (' + show(result) + ')'); return; }
    if (!result || typeof result !== 'object' || Array.isArray(result)) { problems.push(name + ': the result is ' + show(result) + ', not a result'); return; }
    if (result.status === 'ok' && !(Array.isArray(result.rows) && result.rows.length > 0)) {
      problems.push(name + ': a successful result with no projection (rows is ' + show(result.rows) + ')');
    }
  });
  return { id: 'NON-VACUOUS', problems, skipped: [] };
}

function checkShape(decoded, spec, plans, meta) {
  const { checkResult, captureContractVersion } = require(path.join(ROOT, 'tools', 'result-contract.js'));
  const problems = [];
  /* Q2 (A), contract version 3: each capture is checked under the version it was produced under (S-CONTRACT-VERSION). */
  const contractVersion = captureContractVersion(meta);
  if (contractVersion === null) {
    return { id: 'SHAPE', problems: ['the capture records no supported result-contract version (meta.resultContractVersion) and is not a known legacy capture, so its shape cannot be judged'], skipped: [] };
  }
  const skipped = new Map();
  const byName = new Map(spec.scenarios.map((s) => [s.name, s]));
  decoded.forEach(({ name, result }) => {
    const plan = plans.get(name) || null;
    const verdict = checkResult(result, plan ? { plan, contractVersion } : { contractVersion });
    verdict.violations.forEach((v) => problems.push(name + ': ' + v.rule + ' at ' + v.path + ' -- ' + v.message));
    /* R10 (Q2 (A), "inconsistent version claims"): a key the capture's own contract version does not define is a SHAPE
       problem, so rows carrying a later version's fields cannot pass as an earlier version. */
    verdict.unspecified.forEach((at) => problems.push(name + ': S-EXACT-KEYS at ' + at + ' -- not defined by result-contract version ' + contractVersion));
    verdict.skipped.forEach((rule) => skipped.set(rule, (skipped.get(rule) || 0) + 1));
    const s = byName.get(name);
    if (s && own(s, 'mode') && result && result.mode !== s.mode) problems.push(name + ': mode is ' + show(result && result.mode) + '; the reviewed corpus says ' + JSON.stringify(s.mode));
    if (s && own(s, 'status') && result && result.status !== s.status) problems.push(name + ': status is ' + show(result && result.status) + '; the reviewed corpus says ' + JSON.stringify(s.status));
  });
  return {
    id: 'SHAPE', problems,
    skipped: [...skipped].map(([rule, n]) => rule + ' for ' + n + ' scenario(s) -- plan-dependent, and no independently built plan'),
  };
}

/* The first place a plan carries something JSON would change, or null. Reads
   descriptors before values, so no accessor or trap runs. */
function jsonUnfaithful(value, at) {
  if (value === undefined) return at + ' carries undefined';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return at + ' carries ' + String(value);
    return Object.is(value, -0) ? at + ' carries -0' : null;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
  if (typeof value !== 'object') return at + ' carries a ' + typeof value;
  if (util.types.isProxy(value)) return at + ' is a Proxy';
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return at + ' is an array with a non-standard prototype';
    for (let i = 0; i < value.length; i++) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      if (!d) return at + '[' + i + '] is a hole';
      if (d.get || d.set) return at + '[' + i + '] is an accessor';
      const inner = jsonUnfaithful(d.value, at + '[' + i + ']');
      if (inner) return inner;
    }
    return null;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return at + ' is not a plain object';
  if (Object.getOwnPropertySymbols(value).length) return at + ' has a symbol-keyed property';
  for (const k of Object.getOwnPropertyNames(value)) {
    const d = Object.getOwnPropertyDescriptor(value, k);
    if (!d.enumerable) return join(at, k) + ' is not enumerable';
    if (d.get || d.set) return join(at, k) + ' is an accessor';
    const inner = jsonUnfaithful(d.value, join(at, k));
    if (inner) return inner;
  }
  return null;
}

function checkInputs(spec, plans, buildErrors) {
  const problems = [];
  const skipped = [];
  spec.scenarios.forEach((s) => {
    if (!own(s, 'inputFingerprint')) { skipped.push(s.name + ': ' + (s.inputsNote || 'no reviewed input fingerprint')); return; }
    if (buildErrors.has(s.name)) { problems.push(s.name + ': the plan could not be built -- ' + buildErrors.get(s.name)); return; }
    const plan = plans.get(s.name);
    if (plan === undefined) { problems.push(s.name + ': no plan was built for a scenario with a reviewed fingerprint'); return; }
    const unfaithful = jsonUnfaithful(plan, s.name);
    if (unfaithful) { problems.push(unfaithful + ' -- refused before any serialization, which would have changed it'); return; }
    const actual = fingerprint(plan);
    if (actual !== s.inputFingerprint) {
      problems.push(s.name + ': the plan fingerprints to ' + actual.slice(0, 16) + '..., not the reviewed ' +
        String(s.inputFingerprint).slice(0, 16) + '... -- what this name means has changed');
    }
  });
  return { id: 'INPUTS', problems, skipped };
}

function checkRoundTrip(decoded, raw, spec) {
  const problems = [];
  const skipped = [];
  const byName = new Map(decoded.map((d) => [d.name, d.result]));
  spec.scenarios.forEach((s) => {
    if (!raw.has(s.name)) { skipped.push(s.name + ': ' + (s.inputsNote || 'no raw result to compare')); return; }
    if (!byName.has(s.name)) { problems.push(s.name + ': nothing was persisted to read back'); return; }
    compare(raw.get(s.name), byName.get(s.name), s.name, [], 5)
      .forEach((d) => problems.push(describeDifference(d) + '  (raw result vs the persisted entry read back)'));
  });
  return { id: 'ROUND-TRIP', problems, skipped };
}

function checkSentinels(decoded, expectations) {
  const problems = [];
  const byName = new Map(decoded.map((d) => [d.name, d.result]));
  expectations.scenarios.forEach(({ name, expect }) => {
    if (!byName.has(name)) { problems.push(name + ': the sentinel is not in the file'); return; }
    const result = byName.get(name);
    expect.forEach((e) => {
      const r = resolve(result, e.path);
      if (e.absent) {
        if (r.found) problems.push(name + ' ' + e.path + ': expected ABSENT, found ' + show(r.value));
        return;
      }
      if (!r.found) { problems.push(name + ' ' + e.path + ': expected ' + show(e.equals) + ', and the field is ABSENT'); return; }
      compare(e.equals, r.value, name + ' ' + e.path, [], 5).forEach((d) => problems.push(describeDifference(d)));
    });
  });
  return { id: 'SENTINELS', problems, skipped: [] };
}

// ---------------------------------------------------------------------------
// Plans and raw results, built here from the shared libraries
// ---------------------------------------------------------------------------

function loadEngine() {
  const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
  const rules = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
  if (!rules) throw new Error('corpus-invariant: the rules JSON is not in src/app-shell.html');
  global.RULES = JSON.parse(rules[1]);
  const { BUNDLED_MODULES } = require(path.join(ROOT, 'build.js'));
  BUNDLED_MODULES.forEach(({ file, namespace }) => { global[namespace] = require(path.join(ROOT, 'src', file)); });
  return { shell, engine: require(path.join(ROOT, 'src', 'engine.js')) };
}

function buildPlans(spec) {
  const plans = new Map();
  const errors = new Map();
  const { shell } = loadEngine();
  const golden = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js'));
  let generateScenario = null;
  let generatorError = null;
  try {
    ({ generateScenario } = require(path.join(ROOT, 'tests', 'lib', 'scenario-generator.js')));
    if (typeof generateScenario !== 'function') generatorError = 'generateScenario is ' + show(generateScenario) + ', not a function';
  } catch (e) {
    generatorError = 'the generator failed to load: ' + String(e && e.message);
  }
  const defaultPlan = golden.extractDefaultPlan(shell);
  /* S4 task 4: expansion members are built by their own module, never by the
     capture tool -- which is what makes them independently reproducible. */
  let expansion = null;
  spec.scenarios.forEach((s) => {
    try {
      if (s.source === 'expansion') {
        if (!expansion) {
          expansion = new Map(require(path.join(ROOT, 'tests', 'lib', 'corpus-expansion.js'))
            .expansionScenarios(defaultPlan).map((e) => [e.name, e.plan]));
        }
        if (!expansion.has(s.name)) throw new Error('tests/lib/corpus-expansion.js declares no member ' + s.name);
        plans.set(s.name, expansion.get(s.name));
      } else if (s.source === 'golden') {
        const def = golden.GOLDEN_SCENARIOS.find(([n]) => 'golden:' + n === s.name);
        if (!def) throw new Error('no golden scenario defines ' + s.name);
        plans.set(s.name, golden.buildScenario(defaultPlan, def[1] || {}));
      } else if (s.source === 'seed') {
        if (generatorError) throw new Error(generatorError);
        plans.set(s.name, generateScenario(defaultPlan, s.seed));
      }
    } catch (e) {
      errors.set(s.name, String(e && e.message));
    }
  });
  return { plans, errors };
}

/* Raw runPlan() results, kept in memory and never serialized. Each run gets a
   structured clone, so the engine cannot edit the plan INPUTS fingerprints. */
function runPlans(plans) {
  const { engine } = loadEngine();
  const raw = new Map();
  for (const [name, plan] of plans) {
    if (jsonUnfaithful(plan, name)) continue;
    raw.set(name, engine.runPlan(structuredClone(plan)));
  }
  return raw;
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

function readSpec(specPath) {
  return JSON.parse(fs.readFileSync(specPath || SPEC_PATH, 'utf8'));
}

/* `--spec <path>` anywhere after the command; the default is the control spec. */
function specPathOf(argv) {
  const at = argv.indexOf('--spec');
  return at === -1 ? SPEC_PATH : path.resolve(argv[at + 1]);
}

function positionalOf(argv) {
  const at = argv.indexOf('--spec');
  return argv.slice(1).filter((a, i) => a !== '--spec' && a !== '--write' && (at === -1 || i + 1 !== at + 1));
}

/**
 * options:
 *   spec          the reviewed corpus (default: tools/corpus-spec.json)
 *   plans, raw    Maps of name -> plan / raw result. Default: built here.
 *                 Pass empty Maps to run with no independent plans.
 *   buildErrors   Map of name -> why a plan could not be built
 *   expectations  sentinel expectations, enabling SENTINELS
 *   shape         false to skip SHAPE (sentinel fixtures are not contract results)
 */
function run(snapshot, options = {}) {
  const spec = options.spec || readSpec();
  const checks = [];
  const format = checkFormat(snapshot);
  checks.push(format);
  checks.push(checkInventory(snapshot, spec));
  if (format.problems.length) {
    ['ENCODING', 'NON-VACUOUS', 'SHAPE', 'INPUTS', 'ROUND-TRIP'].forEach((id) => checks.push({
      id, problems: [], skipped: ['not run: the file is not a readable format-' + READABLE_FORMAT + ' capture (see FORMAT)'],
    }));
    return verdict(checks);
  }
  const { check: encoding, decoded } = decodeEntries(snapshot);
  checks.push(encoding);
  checks.push(checkNonVacuous(decoded));
  let plans = options.plans;
  let buildErrors = options.buildErrors || new Map();
  if (plans === undefined) ({ plans, errors: buildErrors } = buildPlans(spec));
  if (options.shape === false) checks.push({ id: 'SHAPE', problems: [], skipped: ['not run: these entries are not contract results'] });
  else checks.push(checkShape(decoded, spec, plans, snapshot.meta));
  checks.push(checkInputs(spec, plans, buildErrors));
  const raw = options.raw === undefined ? runPlans(plans) : options.raw;
  checks.push(checkRoundTrip(decoded, raw, spec));
  if (options.expectations) checks.push(checkSentinels(decoded, options.expectations));
  return verdict(checks);
}

function verdict(checks) {
  return { ok: checks.every((c) => c.problems.length === 0), checks };
}

function report(result, label) {
  const lines = ['CORPUS INVARIANT -- ' + label];
  result.checks.forEach((c) => {
    const pad = (c.id + '            ').slice(0, 12);
    lines.push('  ' + pad + (c.problems.length ? 'FAIL  ' + c.problems.length + ' problem(s)' : 'PASS') +
      (c.skipped.length ? '   (SKIPPED ' + c.skipped.length + ')' : ''));
    c.problems.slice(0, 25).forEach((p) => lines.push('      ' + p));
    if (c.problems.length > 25) lines.push('      ... and ' + (c.problems.length - 25) + ' more');
    c.skipped.slice(0, 3).forEach((s) => lines.push('      skipped: ' + s));
    if (c.skipped.length > 3) lines.push('      skipped: ... and ' + (c.skipped.length - 3) + ' more');
  });
  const failed = result.checks.filter((c) => c.problems.length).map((c) => c.id);
  lines.push(result.ok
    ? 'RESULT: PASS -- ' + result.checks.length + ' separate checks, none failed. This measures the capture; it is not evidence the model is right.'
    : 'RESULT: FAIL -- ' + failed.join(', ') + '. A failed check fails the run.');
  return lines.join('\n');
}

function main(argv) {
  const cmd = argv[0];
  if (cmd === 'check') {
    const file = positionalOf(argv)[0];
    if (!file) { console.log('usage: node tools/corpus-invariant.js check <snapshot.json> [--spec <spec.json>]'); return 2; }
    let snapshot;
    try {
      snapshot = readSnapshot(file);
    } catch (e) {
      console.log('CORPUS INVARIANT -- ' + file + '\nRESULT: FAIL -- the file could not be read as JSON: ' + String(e && e.message));
      return 1;
    }
    const specPath = specPathOf(argv);
    const spec = readSpec(specPath);
    const result = run(snapshot, { spec });
    console.log(report(result, file + ' against ' + path.relative(ROOT, specPath).replace(/\\/g, '/') +
      ' (' + spec.scenarios.length + ' reviewed scenarios' + (spec.composition ? ', ' + spec.composition + ' composition' : '') + ')'));
    return result.ok ? 0 : 1;
  }
  if (cmd === 'pin-inputs') {
    /* Regenerating the reviewed fingerprints is a deliberate act with a diff
       to read, not a side effect of checking. */
    const specPath = specPathOf(argv);
    const spec = readSpec(specPath);
    const { plans, errors } = buildPlans(spec);
    if (errors.size) { console.log('REFUSING TO PIN -- plans could not be built:\n' + [...errors].map(([n, m]) => '  ' + n + ': ' + m).join('\n')); return 1; }
    spec.scenarios.forEach((s) => {
      if (!plans.has(s.name)) return;
      const unfaithful = jsonUnfaithful(plans.get(s.name), s.name);
      if (unfaithful) throw new Error('corpus-invariant: refusing to pin -- ' + unfaithful);
      s.inputFingerprint = fingerprint(plans.get(s.name));
    });
    const text = JSON.stringify(spec, null, 2) + '\n';
    if (argv.includes('--write')) { fs.writeFileSync(specPath, text); console.log('Pinned ' + plans.size + ' input fingerprints into ' + path.relative(ROOT, specPath).replace(/\\/g, '/') + '. Read the diff before committing it.'); }
    else process.stdout.write(text);
    return 0;
  }
  console.log('usage:\n  node tools/corpus-invariant.js check <snapshot.json> [--spec <spec.json>]\n  node tools/corpus-invariant.js pin-inputs [--write] [--spec <spec.json>]');
  return 2;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  SHARED_DEPENDENCIES, READABLE_FORMAT, TRIVIALLY_EMPTY,
  encode, fingerprint, decode, compare, resolve, jsonUnfaithful,
  readSnapshot, readSpec, buildPlans, runPlans,
  checkFormat, checkInventory, decodeEntries, checkNonVacuous, checkShape, checkInputs, checkRoundTrip, checkSentinels,
  run, report, main,
};
