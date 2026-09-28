'use strict';

/*
 * S3 task 9 (Track A) -- a machine-readable catalogue of the Scenario and
 * Result shapes, DERIVED rather than transcribed.
 *
 * WHY DERIVED. Today the schema is implicit: spread across `defaultPlan` in
 * src/app-shell.html, the checks in src/scenario-validator.js, and the row
 * shape assembled in src/engine.js. A hand-maintained schema document
 * describing those would be wrong within two sprints -- this repository moved
 * a dozen times during the session that planned this task. So nothing here is
 * hand-listed: the scenario half is walked out of the live `defaultPlan` and
 * the result half out of live `runPlan()` output.
 *
 * WHAT IT IS ACTUALLY FOR. Not documentation. The catalogue's value is the
 * DRIFT TEST built on it: a committed snapshot that fails when a field is
 * added or removed anywhere in either shape. That converts "someone added a
 * field and nothing noticed" -- which is exactly how advanced.retainedCashOrder
 * arrived blind, and how S3 task 2's field-count constant was measured on one
 * mode -- into a failing test naming the field.
 *
 * THE SNAPSHOT IS GENERATED, THEN PINNED. Regenerating it is a deliberate act
 * with a diff to read, not a side effect of running the suite:
 *
 *     node tests/lib/schema-catalogue.js --write
 *
 * DETERMINISTIC BY CONSTRUCTION. Keys are sorted, arrays are described by
 * their element shape rather than their length, and no value is recorded --
 * only names and types. A catalogue that embedded values would churn on every
 * default change and stop being readable as a shape.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SNAPSHOT_PATH = path.join(__dirname, '..', 'fixtures', 'schema-catalogue.fixture.json');

/** The type name recorded for a leaf. Narrower than typeof: null and arrays
 *  are their own kinds, because conflating them is how shape bugs hide. */
function kindOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : 'nonFinite';
  return typeof value;
}

/**
 * Describes a value's SHAPE -- names and types, never values.
 *
 * An array is described by the shape of its first element, tagged so a reader
 * cannot mistake it for an object, and `[]` for an empty one. Describing every
 * element would make the catalogue depend on how many records a default
 * happens to carry.
 */
/* CL-04: merge two described shapes, unioning object fields recursively.
   Needed because an array's element shape is now the union of every element,
   not element zero's. */
/* CR2-03: "FIRST WINS" WAS NOT A UNION, AND THE COMMENT SAYING SO WAS WRONG.
 *
 * On a type split this returned `a` with the note "the difference shows up as
 * drift either way". It does not, and that is reproducible: changing
 * rows[2].taxes from a number to a string produced a BYTE-IDENTICAL catalogue,
 * because row 0 already said 'number' and first-wins kept it. Describing
 * [{balance:1},{balance:"broken"}] reported only 'number'; reversing the two
 * records reported only 'string'. A union whose answer depends on record order
 * is not a union.
 *
 * Two changes, both required to make drift detectable:
 *
 *   TYPE SPLITS become a real union node whose variants are DEDUPLICATED and
 *   SORTED by a canonical key, so the result cannot depend on which record the
 *   corpus happened to put first.
 *
 *   PRESENCE is tracked. A union of keys cannot establish that a field is on
 *   every record -- which is why deleting rows[2].calculationErrorCode also
 *   changed nothing, row 0 still carrying it. A field absent from either side
 *   of a merge is marked `optional`, so a deletion moves the catalogue from
 *   required to optional instead of vanishing.
 *
 * The supplied CL-04 test combined an addition and a deletion in one mutation,
 * so detecting the addition concealed the failure to detect the deletion. The
 * new tests apply every mutation alone, in first, middle and last position.
 */
/* FC-03: `describedKey` lived here and keyed the union's deduplication by a
   canonical structural string. It is gone rather than repaired -- see
   unionDescribed, which normalises by KIND. A structural key is exactly what
   let two object variants sit side by side in one union, which is the defect. */

/** Own-property-safe write into a schema map. `fields.__proto__ = node` runs
 *  the inherited setter instead of creating an own property, so a JSON record
 *  carrying an own `__proto__` described as `{}` -- the field disappeared from
 *  the catalogue and from every drift diff built on it. The engine, the diff
 *  index and the capture were each taught this separately; this tool is the
 *  fourth site and was still writing the plain assignment. */
function setField(map, key, node) {
  Object.defineProperty(map, key, {
    value: node, enumerable: true, writable: true, configurable: true,
  });
  return map;
}

/** Adds the optional marker. Only ever ADDS: once a field has been seen absent
 *  from any record it stays optional however many later records carry it. */
function flagOptional(node, optional) {
  if (!optional || !node || node.optional) return node;
  return Object.assign({}, node, { optional: true });
}

/**
 * A deterministic union of two described shapes. Flattens nested unions, then
 * normalises to AT MOST ONE VARIANT PER KIND, merging two variants of the same
 * kind rather than keeping them side by side.
 *
 * FC-03: deduplicating by a canonical structural key made the union depend on
 * record order the moment a scalar joined it. These are the same three records:
 *
 *   [{x:{a:1}}, {x:{b:1}}, {x:0}]   the two objects merge first, giving one
 *                                   object variant with `a` and `b` optional
 *   [{x:0}, {x:{a:1}}, {x:{b:1}}]   the union forms first, so {a} and {b} are
 *                                   two distinct keys -- two object variants,
 *                                   each with a REQUIRED field
 *
 * reduce() is left-associative, so which one happens is decided by where the
 * corpus put the scalar. Sorting the variants afterwards cannot repair it: the
 * merge history already diverged. Merging same-kind variants makes the union
 * commutative, associative and idempotent -- which it has to be before "the
 * catalogue changed" carries any information at all. A union whose answer
 * depends on record order is not a union; that was the original CL-04 finding,
 * and it survived its own repair one level up.
 */
function unionDescribed(a, b) {
  const flat = [];
  [a, b].forEach((n) => {
    if (n && n.kind === 'union') flat.push.apply(flat, n.variants);
    else if (n) flat.push(n);
  });
  const byKind = new Map();
  flat.forEach((v) => {
    const copy = Object.assign({}, v);
    delete copy.optional;                     // optionality lives on the FIELD, not the variant
    const seen = byKind.get(copy.kind);
    byKind.set(copy.kind, seen ? mergeDescribed(seen, copy) : copy);
  });
  const kinds = Array.from(byKind.keys()).sort();
  if (kinds.length === 1) return byKind.get(kinds[0]);
  return { kind: 'union', variants: kinds.map((k) => byKind.get(k)) };
}

function mergeDescribed(a, b) {
  if (!a) return b;
  if (!b) return a;
  const optional = !!(a.optional || b.optional);
  if (a.kind !== b.kind) return flagOptional(unionDescribed(a, b), optional);
  if (a.kind === 'union') return flagOptional(unionDescribed(a, b), optional);
  if (a.kind === 'object') {
    const fields = {};
    const keys = Array.from(new Set(Object.keys(a.fields).concat(Object.keys(b.fields)))).sort();
    keys.forEach((k) => {
      const inA = Object.prototype.hasOwnProperty.call(a.fields, k);
      const inB = Object.prototype.hasOwnProperty.call(b.fields, k);
      const node = inA && inB ? mergeDescribed(a.fields[k], b.fields[k])
        : (inA ? a.fields[k] : b.fields[k]);
      setField(fields, k, flagOptional(node, !inA || !inB));
    });
    return flagOptional({ kind: 'object', fields }, optional);
  }
  if (a.kind === 'array') {
    return flagOptional({ kind: 'array', element: mergeDescribed(a.element, b.element) }, optional);
  }
  return flagOptional(a, optional);
}

function describe(value) {
  if (Array.isArray(value)) {
    /* CL-04: the UNION of every element, not element zero.
    
       Describing only the first element meant a field carried by any later
       record was outside the contract -- an account with cashHolding sitting
       second, an ARM debt after a fixed one. The specimen builder in
       liveCatalogue() was taught to merge records first, which fixed the LIVE
       catalogue and left every other caller with the original behaviour: a
       caller passing its own two-account specimen still got the first one only.
       Fixing it here fixes it for all of them. */
    if (!value.length) return { kind: 'array', element: null };
    return { kind: 'array', element: value.map(describe).reduce(mergeDescribed) };
  }
  if (value !== null && typeof value === 'object') {
    const out = {};
    Object.keys(value).sort().forEach((k) => { setField(out, k, describe(value[k])); });
    return { kind: 'object', fields: out };
  }
  return { kind: kindOf(value) };
}

/** Every dotted leaf path in a described shape, sorted. The flat form a drift
 *  test can diff readably -- a nested object diff names the wrong level. */
function leafPaths(described, prefix, out) {
  out = out || [];
  prefix = prefix || '';
  /* FC-03: a CONTAINER's own optionality had nowhere to go in the flat form,
     because only leaves print. So [{x:{amount:1}},{x:{amount:2}}] and
     [{x:{amount:1}},{}] both flattened to `[].x.amount : number` -- the whole
     object becoming optional left no trace. The nested comparison does catch
     it, so this was never a gate bypass, but the flat form is what a reader
     diffs, and it was silently one level less precise than the thing it
     summarises. The container now prints a line of its own. */
  if (described.kind === 'object') {
    if (described.optional) out.push(prefix + ' (optional object)');
    Object.keys(described.fields).sort().forEach((k) => {
      leafPaths(described.fields[k], prefix ? prefix + '.' + k : k, out);
    });
    return out;
  }
  if (described.kind === 'array') {
    if (described.optional) out.push(prefix + ' (optional array)');
    if (described.element) leafPaths(described.element, prefix + '[]', out);
    else out.push(prefix + '[] : (empty by default)');
    return out;
  }
  /* CR2-03: the flat form has to SHOW a union and an optional field, or the
     drift diff a test reads stays blind to exactly the two things the merge
     was just taught to record. */
  if (described.kind === 'union') {
    out.push(prefix + (described.optional ? ' (optional)' : '') + ' : ' +
      described.variants.map((v) => v.kind).sort().join(' | '));
    return out;
  }
  out.push(prefix + (described.optional ? ' (optional)' : '') + ' : ' + described.kind);
  return out;
}

/**
 * Builds the catalogue.
 *
 * `defaultPlan` is the live default from src/app-shell.html; `resultsByMode`
 * maps a simulation mode to one live runPlan() result for it. Both are passed
 * in rather than loaded here, so this module has no opinion about how the
 * engine gets booted and the test owns that.
 */
/* RB-09 (re-audit 2): the catalogue describes VARIANTS, not one sample.
 *
 * Two independent omissions made the drift claim narrower than its name.
 *
 * 1. It described `defaultPlan`, where accounts, debts, income records,
 *    spending stages and other assets are all EMPTY arrays. Their leaves read
 *    literally `accounts[] : (empty by default)`, so every field of every
 *    record was outside the contract. A populated specimen now supplies those
 *    records, so record fields are catalogued like everything else.
 *
 * 2. It described `rows[0]` -- the OPENING snapshot -- and the first
 *    successful result of each mode. The ordinary deterministic row carries 24
 *    fields against the opening row's 22, so `calculationError` and
 *    `calculationErrorCode` were absent from the contract, and rejection and
 *    calculation-error results were not represented at all. The audit's own
 *    counterexample: adding a field to row 1 and deleting its
 *    calculationErrorCode produced an IDENTICAL catalogue.
 *
 * Opening rows, ordinary rows and invalid results are now separate entries.
 * Describing the union would hide exactly the difference that matters. */
function buildCatalogue(defaultPlan, resultsByMode, variants) {
  variants = variants || {};
  const scenario = describe(variants.specimenPlan || defaultPlan);
  const result = {};
  Object.keys(resultsByMode).sort().forEach((mode) => {
    const live = resultsByMode[mode];
    const rows = (live.rows && live.rows.length) ? live.rows : null;
    /* CL-04: the UNION of every ordinary row, not one chosen position.
       
       This was rows[1], on the reasoning that a middle row would otherwise be
       missed -- which fixed that for row 1 and left it true for every other
       row. Adding a field to row 2 and deleting its calculationErrorCode still
       produced an identical catalogue.
       
       Merging every non-opening row means a field present on ANY of them is in
       the contract, and one missing from a later row changes it. First
       non-undefined value per key wins, so describe() sees a real type. */
    /* CR2-03: describe each row, THEN merge the descriptions. This merged raw
       VALUES with "first non-undefined wins" and described the result once, so
       a later row's different TYPE and a later row's MISSING key were both
       thrown away before describe() ever saw them -- the two mutations the
       audit reproduced. Merging descriptions is what makes a type split a
       union and an absence an optional marker. */
    const ordinaryDescribed = rows && rows.length > 1
      ? rows.slice(1).map(describe).reduce(mergeDescribed)
      : null;
    result[mode] = {
      topLevel: describe(Object.assign({}, live, { rows: [] })).fields,
      topLevelCount: Object.keys(live).length,
      row: rows ? describe(rows[0]) : null,
      rowCount: rows ? Object.keys(rows[0]).length : 0,
      /* The row an actual projection year produces, distinct from the opening
         snapshot. This is the shape most consumers actually read. */
      ordinaryRow: ordinaryDescribed,
      /* CR2-03: counted off the MERGED description, so a field carried by only
         some ordinary rows is still counted -- and still marked optional. */
      ordinaryRowCount: ordinaryDescribed ? Object.keys(ordinaryDescribed.fields).length : 0,
    };
  });
  /* Invalid results are a shape of their own, and the invalid-result contract
     is the one new consumers keep violating (ARCH-02, then RB-05). */
  if (variants.invalidResult) {
    result.__invalid = {
      topLevel: describe(Object.assign({}, variants.invalidResult, { rows: [] })).fields,
      topLevelCount: Object.keys(variants.invalidResult).length,
      row: null,
      rowCount: 0,
      ordinaryRow: null,
      ordinaryRowCount: 0,
    };
  }
  return {
    note: 'DERIVED, not hand-written. Regenerate with: node tests/lib/schema-catalogue.js --write',
    scenario: {
      shape: scenario,
      leaves: leafPaths(scenario),
      leafCount: leafPaths(scenario).length,
    },
    result,
  };
}

function readSnapshot() {
  return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
}

function writeSnapshot(catalogue) {
  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(catalogue, null, 2) + '\n');
  return SNAPSHOT_PATH;
}

/* --------------------------------------------------------------------------
 * Booting the engine, for the CLI. The test does its own.
 * ----------------------------------------------------------------------- */
function liveCatalogue() {
  const harness = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
  const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
  global.RULES = JSON.parse(
    shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
  harness.installDebtModules();
  const engine = require(path.join(ROOT, 'src', 'engine.js'));
  const golden = require(path.join(__dirname, 'golden-scenario-defs.js'));
  const defaultPlan = golden.extractDefaultPlan(shell);

  /* One live result per mode. The modes are taken from the corpus rather than
     hard-coded, so a new simulation mode joins the catalogue automatically
     instead of being silently absent from it. */
  const resultsByMode = {};
  harness.corpus().forEach(({ plan }) => {
    const mode = plan.assumptions.method;
    if (resultsByMode[mode]) return;
    resultsByMode[mode] = engine.runPlan(JSON.parse(JSON.stringify(plan)));
  });
  /* RB-09: a POPULATED specimen. Each collection that is empty in defaultPlan
     is filled from the first corpus scenario that actually carries one, so the
     record schemas come from real inputs rather than from a hand-written
     sketch that could drift from them. */
  const specimenPlan = JSON.parse(JSON.stringify(defaultPlan));
  const collections = [
    ['accounts', (pl) => pl.accounts],
    ['advanced.debts', (pl) => pl.advanced && pl.advanced.debts],
    ['advanced.otherAssets', (pl) => pl.advanced && pl.advanced.otherAssets],
    ['retirement.stages', (pl) => pl.retirement && pl.retirement.stages],
    ['retirement.expenses', (pl) => pl.retirement && pl.retirement.expenses],
    ['retirement.otherIncomes', (pl) => pl.retirement && pl.retirement.otherIncomes],
  ];
  const setPath = (obj, dotted, value) => {
    const parts = dotted.split('.');
    let node = obj;
    for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]];
    node[parts[parts.length - 1]] = value;
  };
  /* CL-04: a UNION of every record observed, not the first one found.
     
     Taking the first non-empty record produced a debt schema of eight fields --
     balance, id, includePayment, name, paymentMonthly, payoffAge, rate,
     rateType -- and omitted nextRateResetAge, resetRate, extraPrincipalMonthly
     and every housing-cost field the live ARM and mortgage code reads. The
     account specimen omitted cashHolding, the exact category RB-02 repaired.
     Two mutations therefore still produced an identical catalogue.
     
     Merging every record in the corpus means a field any record carries is in
     the contract. It does NOT distinguish required from optional -- a union
     cannot -- and that remains open; what it fixes is fields being absent
     altogether because one arbitrary record happened not to have them. */
  /* CR2-03: THE SPECIMEN CARRIES EVERY RECORD, not one synthetic merge of them.

     This built a single fake record by taking each key's first non-undefined
     value across the corpus, then let describe() see only that. One record
     cannot hold two types for one key, so every type variant was destroyed
     before description, and a key absent from some records was indistinguishable
     from one present on all -- the two mutations the audit reproduced.

     describe() already unions an array's elements through mergeDescribed(),
     which now produces real type unions and optional markers. So handing it the
     actual records is both simpler and strictly more truthful than inventing a
     composite that no run ever produced. */
  collections.forEach(([dotted, get]) => {
    const all = [];
    for (const { plan } of harness.corpus()) {
      const found = get(plan);
      if (Array.isArray(found)) all.push(...found);
    }
    if (all.length) setPath(specimenPlan, dotted, JSON.parse(JSON.stringify(all)));
  });

  /* Nested collections need the same treatment -- a record field that is itself
     an empty array leaves ITS record outside the contract, one level down. */
  if (specimenPlan.accounts[0] && !(specimenPlan.accounts[0].futureChanges || []).length) {
    for (const { plan } of harness.corpus()) {
      const withChange = (plan.accounts || []).find((a) => (a.futureChanges || []).length);
      if (withChange) {
        specimenPlan.accounts[0].futureChanges = [JSON.parse(JSON.stringify(withChange.futureChanges[0]))];
        break;
      }
    }
  }

  /* An actually-rejected result, so the invalid shape is a real specimen. */
  const badPlan = JSON.parse(JSON.stringify(harness.corpus()[0].plan));
  badPlan.accounts = [Object.assign({}, badPlan.accounts[0], { balance: 'bad' })];
  const invalidResult = engine.runPlan(badPlan);

  return {
    catalogue: buildCatalogue(defaultPlan, resultsByMode, { specimenPlan, invalidResult }),
    defaultPlan, specimenPlan, invalidResult, engine, shell,
  };
}

if (require.main === module) {
  const { catalogue } = liveCatalogue();
  if (process.argv.indexOf('--write') >= 0) {
    console.log('Wrote ' + writeSnapshot(catalogue));
    console.log('  scenario leaves: ' + catalogue.scenario.leafCount);
    Object.keys(catalogue.result).forEach((m) => {
      console.log('  ' + m + ': ' + catalogue.result[m].topLevelCount + ' top-level, ' +
        catalogue.result[m].rowCount + ' row fields');
    });
  } else {
    console.log(JSON.stringify(catalogue, null, 2));
  }
}

module.exports = {
  describe, leafPaths, buildCatalogue, readSnapshot, writeSnapshot, liveCatalogue,
  SNAPSHOT_PATH,
};
