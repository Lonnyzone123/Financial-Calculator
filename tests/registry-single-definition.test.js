/* S5 task 1.6 -- one definition per registry, asserted.
 *
 * Task 1's defect: a set that exists in two places, one of them hand-maintained
 * (Q20, Q33, Q38). The copy drifts, and the drift is silent until a scenario
 * reaches the gap. Q38 is the instance this file starts from: the seeded corpus
 * harvested its strategy list by regex from the engine's dispatch, a branch was
 * collapsed, and every generated scenario changed with no semantic cause.
 *
 * Two different claims live in this file, and each test says which it makes:
 *   - ONE DEFINITION: the set is declared once and consumers read it;
 *   - PINNED COPY: a consumer keeps its own copy (display labels, a frozen
 *     sampling order, a module boundary with no sharing mechanism yet), and the
 *     copy is held equal to the named authority. A pin is not a single
 *     definition; it turns silent drift into a named failure.
 *
 * Everything reads committed source TEXT, not the engine module, so this file
 * adds no coupling to engine internals. Every pin has a control showing the
 * same check fails on an injected drift -- a pin that cannot fail pins nothing.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sorted = (xs) => [...xs].sort();

/* ---------------------------------------------------------------------------
 * The withdrawal-strategy set (Q38)
 * ------------------------------------------------------------------------- */

function declaredStrategies(engineText) {
  const m = engineText.match(/^var WITHDRAWAL_STRATEGIES=(\[[^\]\n]*\]);$/m);
  if (!m) return null;
  return JSON.parse(m[1]);
}
function dispatchedStrategies(engineText) {
  return sorted(new Set([...engineText.matchAll(/strategy===?"([a-zA-Z]+)"/g)].map((m) => m[1])));
}
function selectOptions(shellText) {
  const at = shellText.indexOf('id="v2-strategy"');
  if (at < 0) return null;
  const body = shellText.slice(at, shellText.indexOf('</select>', at));
  return sorted([...body.matchAll(/<option value="([a-zA-Z]+)"/g)].map((m) => m[1]));
}
function descriptionKeys(shellText) {
  const at = shellText.indexOf('definitions={');
  if (at < 0) return null;
  const body = shellText.slice(at, shellText.indexOf('}', at));
  return sorted([...body.matchAll(/[{,]\s*([a-zA-Z]+):"/g)].map((m) => m[1]));
}

test('Q38 ONE DEFINITION: the engine declares its withdrawal strategies once, and its dispatch handles exactly that set', () => {
  const engine = read('src/engine.js');
  const declared = declaredStrategies(engine);
  assert.ok(Array.isArray(declared),
    'src/engine.js must declare `var WITHDRAWAL_STRATEGIES=[...]` on a line of its own. That declaration is the ' +
    'one definition of the strategy set; everything else reads it or is pinned to it.');
  assert.equal(new Set(declared).size, declared.length, 'the declaration names each strategy once');
  const dispatched = dispatchedStrategies(engine);
  assert.ok(dispatched.length >= 9 && dispatched.includes('incomeFirst'),
    'CONTROL: the dispatch reader found the dispatch (it read ' + JSON.stringify(dispatched) + ')');
  assert.deepEqual(sorted(declared), dispatched,
    'a strategy the dispatch handles but the declaration omits is invisible to the corpus; one the declaration ' +
    'lists but the dispatch ignores silently becomes incomeFirst (Q58). They must be the same set.');
});

test('Q38 control: the declaration check fails on a strategy added to the dispatch alone', () => {
  const engine = read('src/engine.js');
  const drifted = engine.replace('strategySpending(p,age', 'strategySpending(p,age') +
    '\n/* injected */ if(r.strategy==="newStrategy")amount=0;';
  const declared = declaredStrategies(engine);
  assert.ok(Array.isArray(declared), 'precondition: the declaration exists');
  assert.notDeepEqual(sorted(declared), dispatchedStrategies(drifted), 'CONTROL: the comparison must see the injected strategy');
});

test('Q38 PINNED COPY: the strategy <select> offers exactly the declared set (it carries display labels)', () => {
  const declared = declaredStrategies(read('src/engine.js'));
  assert.ok(Array.isArray(declared), 'the engine declaration must exist first');
  const options = selectOptions(read('src/app-shell.html'));
  assert.ok(options && options.length, 'CONTROL: the <select id="v2-strategy"> was found');
  assert.deepEqual(options, sorted(declared), 'the UI must offer exactly the strategies the engine declares');
});

test('Q38 PINNED COPY: every declared strategy has exactly one description, and no description names an undeclared one', () => {
  const declared = declaredStrategies(read('src/engine.js'));
  assert.ok(Array.isArray(declared), 'the engine declaration must exist first');
  const keys = descriptionKeys(read('src/app-shell.html'));
  assert.ok(keys && keys.length, 'CONTROL: updateStrategyVisibility()\'s definitions object was found');
  assert.deepEqual(keys, sorted(declared), 'the strategy descriptions must cover exactly the declared set');
});

/* The seeded corpus reads the declaration (S5 task 1.2, second commit). */

function literalListsNaming(text, names, atLeast) {
  const hits = [];
  const re = /\[([^\[\]]{0,4000})\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const quoted = [...m[1].matchAll(/(['"])([A-Za-z]+)\1/g)].map((q) => q[2]);
    if (new Set(quoted.filter((q) => names.includes(q))).size >= atLeast) hits.push(text.slice(0, m.index).split('\n').length);
  }
  return hits;
}

function loadGenerator() {
  if (!global.RULES) {
    const shell = read('src/app-shell.html');
    global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
  }
  return require('./lib/scenario-generator');
}

test('Q38 ONE DEFINITION: the seeded corpus draws from exactly the engine declaration, and the hand-written copy is gone', () => {
  const declared = declaredStrategies(read('src/engine.js'));
  assert.ok(Array.isArray(declared), 'the engine declaration must exist');
  const gen = loadGenerator();
  assert.deepEqual(gen.STRATEGIES, sorted(declared),
    'the generator must pick from the declared set, in sorted order -- the order every stored corpus was generated with');
  assert.equal(gen.EXPECTED_STRATEGIES, undefined,
    'EXPECTED_STRATEGIES was the generator\'s hand-written second definition of the set; it must no longer exist');
});

test('Q38 ONE DEFINITION: the generator source holds no hand-written list of strategy names', () => {
  const declared = declaredStrategies(read('src/engine.js'));
  assert.ok(Array.isArray(declared), 'the engine declaration must exist');
  const lines = literalListsNaming(read('tests/lib/scenario-generator.js'), declared, 3);
  assert.deepEqual(lines, [],
    'a bracketed literal naming three or more declared strategies is a second definition of the set (at line(s) ' + lines.join(', ') + ')');
});

test('Q38 control: the hand-list check finds an injected list', () => {
  const declared = declaredStrategies(read('src/engine.js'));
  assert.ok(Array.isArray(declared), 'the engine declaration must exist');
  const injected = read('tests/lib/scenario-generator.js') + "\nconst X = ['vpw', 'rmd', 'guyton'];\n";
  assert.ok(literalListsNaming(injected, declared, 3).length >= 1, 'CONTROL: an injected three-name list must be found');
});

test('Q38 control: both UI pins fail on an injected drift', () => {
  const shell = read('src/app-shell.html');
  const dropOption = shell.replace('<option value="vpw"', '<option value="vpwRenamed"');
  const dropDefinition = shell.replace(/definitions=\{/, 'definitions={extraStrategy:"x",');
  assert.notDeepEqual(selectOptions(dropOption), selectOptions(shell), 'CONTROL: a renamed option changes what the pin reads');
  assert.notDeepEqual(descriptionKeys(dropDefinition), descriptionKeys(shell), 'CONTROL: an added description changes what the pin reads');
});

/* S5 2k: the validator warns on an unrecognised strategy, so it carries its own
   copy of the set. It is required standalone, without the engine, so the copy is
   PINNED to the engine declaration rather than read from it. */
const validatorStrategies = (validator) => {
  const m = validator.match(/^const STRATEGIES = (\[[^\]\n]*\]);$/m);
  return m ? JSON.parse(m[1].replace(/'/g, '"')) : null;
};

test('Q58 PINNED COPY: the validator\'s STRATEGIES equal the engine\'s declared withdrawal strategies', () => {
  const declared = declaredStrategies(read('src/engine.js'));
  const copy = validatorStrategies(read('src/scenario-validator.js'));
  assert.ok(Array.isArray(declared) && Array.isArray(copy), 'CONTROL: both declarations were found');
  assert.deepEqual(sorted(copy), sorted(declared),
    'a strategy the engine dispatches but the validator warns about, or the reverse, is the drift this pin exists to name');
});

test('Q58 control: the validator pin fails on an injected drift', () => {
  const validator = read('src/scenario-validator.js');
  const drifted = validator.replace("'rmd', 'vpw']", "'rmd', 'vpwRenamed']");
  assert.notDeepEqual(validatorStrategies(drifted), validatorStrategies(validator), 'CONTROL: a renamed strategy changes what the pin reads');
});

/* ---------------------------------------------------------------------------
 * Within-file twins found by the task 1.4 sweep
 *
 * Each is checked by counting the EXACT literal, not by a "names these three"
 * shape: a longer list that happens to contain the same names (a full page
 * list, say) is a different set, and a shape check would misfire on it forever.
 * ------------------------------------------------------------------------- */

const occurrences = (text, literal) => text.split(literal).length - 1;

const RETIREMENT_ARRAYS = "['stages', 'expenses', 'otherIncomes']";
const SIMPLE_HIDDEN = '["assets","debts","rules"]';

test('1.4 ONE DEFINITION: the validator names the retirement array fields in one declaration', () => {
  const validator = read('src/scenario-validator.js');
  assert.ok(validator.includes('const LOSSY_COERCED_ARRAY_FIELDS = ' + RETIREMENT_ARRAYS + ';'),
    'CONTROL: the declaration LOSSY_COERCED_ARRAY_FIELDS was found with this exact list');
  assert.equal(occurrences(validator, RETIREMENT_ARRAYS), 1,
    'the list ' + RETIREMENT_ARRAYS + ' is written out more than once in src/scenario-validator.js; the type check in ' +
    'validateRetirement() and the raw-container check must read the one declaration');
});

test('1.4 ONE DEFINITION: the app shell names the simple-mode hidden pages in one declaration', () => {
  const shell = read('src/app-shell.html');
  assert.ok(shell.includes('var SIMPLE_HIDDEN_PAGES=' + SIMPLE_HIDDEN + ';'),
    'the pages simple complexity hides must be declared once, as var SIMPLE_HIDDEN_PAGES');
  assert.equal(occurrences(shell, SIMPLE_HIDDEN), 1,
    'the list ' + SIMPLE_HIDDEN + ' is written out more than once in src/app-shell.html; applyComplexity() and ' +
    'setPage() must both read SIMPLE_HIDDEN_PAGES');
});

/* ---------------------------------------------------------------------------
 * The surplus sources and surplus policies
 *
 * Found by the task 1.4 sweep: the five surplus sources exist in the engine's
 * SURPLUS_SOURCES, again inside the engine as a zero-valued object literal,
 * and in the validator's SURPLUS_SOURCE_KEYS; the three policies exist in the
 * validator's SURPLUS_POLICIES, in the engine's knownSurplusPolicy()
 * comparisons, and in two generator pick lists.
 *
 * Within the engine the literal can read SURPLUS_SOURCES, so that is ONE
 * DEFINITION. The validator is required standalone in Node, without the engine,
 * so its copies are PINNED. The generator's pick lists are PINNED as sets and
 * deliberately left as written: d.pick() indexes into them, their order is part
 * of the frozen control corpus, and re-ordering would re-pick every seed.
 * ------------------------------------------------------------------------- */

const quotedList = (text, re) => {
  const m = text.match(re);
  return m ? JSON.parse(m[1].replace(/'/g, '"')) : null;
};
const engineSources = (engine) => quotedList(engine, /^var SURPLUS_SOURCES=(\[[^\]\n]*\]);$/m);
const validatorSources = (validator) => quotedList(validator, /^const SURPLUS_SOURCE_KEYS = (\[[^\]\n]*\]);$/m);
const validatorPolicies = (validator) => quotedList(validator, /^const SURPLUS_POLICIES = (\[[^\]\n]*\]);$/m);
function enginePolicies(engine) {
  const m = engine.match(/function knownSurplusPolicy\(v\)\{return ([^?]*)\?/);
  return m ? sorted(new Set([...m[1].matchAll(/v==="([a-zA-Z]+)"/g)].map((x) => x[1]))) : null;
}
/* Zero-valued object literals whose keys include three or more of the given names. */
function zeroRecordsNaming(text, names) {
  const hits = [];
  for (const m of text.matchAll(/\{\s*[a-zA-Z]+\s*:\s*0\s*(?:,\s*[a-zA-Z]+\s*:\s*0\s*)+\}/g)) {
    const keys = [...m[0].matchAll(/([a-zA-Z]+)\s*:/g)].map((x) => x[1]);
    if (keys.filter((k) => names.includes(k)).length >= 3) hits.push(text.slice(0, m.index).split('\n').length);
  }
  return hits;
}
function generatorPickLists(generator) {
  const lists = [...generator.matchAll(/(surplusPolicy|rmd): d\.pick\((\[[^\]\n]*\])\)/g)].map((m) => [m[1], JSON.parse(m[2].replace(/'/g, '"'))]);
  return lists.length ? lists : null;
}

test('1.4 ONE DEFINITION: inside the engine, the surplus-by-source record is built from SURPLUS_SOURCES, not restated', () => {
  const engine = read('src/engine.js');
  const sources = engineSources(engine);
  assert.ok(Array.isArray(sources) && sources.length === 5, 'CONTROL: var SURPLUS_SOURCES was found (' + JSON.stringify(sources) + ')');
  const lines = zeroRecordsNaming(engine, sources);
  assert.deepEqual(lines, [],
    'a zero-valued object literal keyed by the surplus sources restates SURPLUS_SOURCES (line(s) ' + lines.join(', ') + ')');
});

test('1.4 PINNED COPY: the validator\'s SURPLUS_SOURCE_KEYS equal the engine\'s SURPLUS_SOURCES', () => {
  const sources = engineSources(read('src/engine.js'));
  const keys = validatorSources(read('src/scenario-validator.js'));
  assert.ok(Array.isArray(sources) && Array.isArray(keys), 'CONTROL: both declarations were found');
  assert.deepEqual(sorted(keys), sorted(sources),
    'a source the engine attributes surplus to but the validator rejects, or the reverse, is the drift this pin exists to name');
});

test('1.4 PINNED COPY: the validator\'s SURPLUS_POLICIES equal the policies knownSurplusPolicy() accepts', () => {
  const policies = validatorPolicies(read('src/scenario-validator.js'));
  const accepted = enginePolicies(read('src/engine.js'));
  assert.ok(Array.isArray(policies) && Array.isArray(accepted) && accepted.length, 'CONTROL: both were found');
  assert.deepEqual(sorted(policies), accepted,
    'a policy the validator accepts but the engine silently maps to the default, or the reverse, is the drift this pin exists to name');
});

test('1.4 PINNED COPY: each generator surplus-policy pick list draws from exactly SURPLUS_POLICIES (its order is frozen)', () => {
  const policies = validatorPolicies(read('src/scenario-validator.js'));
  const lists = generatorPickLists(read('tests/lib/scenario-generator.js'));
  assert.ok(Array.isArray(policies) && lists && lists.length === 2, 'CONTROL: SURPLUS_POLICIES and both pick lists were found (' + JSON.stringify(lists) + ')');
  for (const [field, list] of lists) {
    assert.deepEqual(sorted(list), sorted(policies), field + ': the pick list must name exactly the accepted policies');
    assert.equal(new Set(list).size, list.length, field + ': no policy is listed twice');
  }
});

test('1.4 control: the surplus checks see an injected restatement and each injected drift', () => {
  const engine = read('src/engine.js');
  const validator = read('src/scenario-validator.js');
  const sources = engineSources(engine);
  assert.ok(zeroRecordsNaming(engine + '\nvar x={rmd:0,pension:0,dividends:0};', sources).length >= 1,
    'CONTROL: an injected zero record keyed by three sources is found');
  assert.notDeepEqual(sorted(validatorSources(validator.replace("'dividends']", "'dividend']"))), sorted(sources),
    'CONTROL: a renamed validator source breaks the pin');
  assert.notDeepEqual(sorted(validatorPolicies(validator.replace("const SURPLUS_POLICIES = ['retain',", "const SURPLUS_POLICIES = ['keep',"))),
    enginePolicies(engine), 'CONTROL: a renamed validator policy breaks the pin');
});

test('1.4 control: both exact-literal counts see an injected second copy', () => {
  const validator = read('src/scenario-validator.js');
  const shell = read('src/app-shell.html');
  assert.equal(occurrences(validator + '\n' + RETIREMENT_ARRAYS, RETIREMENT_ARRAYS), occurrences(validator, RETIREMENT_ARRAYS) + 1,
    'CONTROL: an appended copy of the validator list is counted');
  assert.equal(occurrences(shell + SIMPLE_HIDDEN, SIMPLE_HIDDEN), occurrences(shell, SIMPLE_HIDDEN) + 1,
    'CONTROL: an appended copy of the hidden-pages list is counted');
});

/* ---------------------------------------------------------------------------
 * The rules-JSON extractors (task 1.6: recorded, now asserted)
 *
 * Six instruments read the app shell's embedded rules with the same regex over
 * `<script type="application/json" id="v2b-rules-2026">`. Nothing shares it, so
 * each is a copy, and task 12.6 changes the shape of the block they read. They
 * are pinned: each file carries the pattern exactly once, no other instrument
 * file carries a seventh copy, and the pattern still finds a rules block that
 * parses. The sixth, tools/historical-replay.js (question 10 (A), 2026-09-16),
 * reads the rules of the HISTORICAL shell a stored capture was taken with, from
 * that capture's verified inputs; none of the other five reads a historical tree.
 * ------------------------------------------------------------------------- */

const RULES_EXTRACTOR_FILES = ['tests/lib/schema-catalogue.js', 'tools/bench-simulation.js', 'tools/build-device-benchmark.js', 'tools/capture-baseline.js', 'tools/corpus-invariant.js', 'tools/historical-replay.js'];
const RULES_EXTRACTOR = '/<script type="application\\/json" id="v2b-rules-2026">([\\s\\S]*?)<\\/script>/';
const RULES_ID = 'id="v2b-rules-2026"';
function instrumentFilesNaming(needle) {
  const found = [];
  for (const dir of ['tools', 'tests/lib']) {
    for (const name of fs.readdirSync(path.join(ROOT, dir))) {
      if (!name.endsWith('.js')) continue;
      if (read(dir + '/' + name).includes(needle)) found.push(dir + '/' + name);
    }
  }
  return sorted(found);
}
const extractorCounts = (texts) => Object.fromEntries(Object.entries(texts).map(([file, text]) => [file, occurrences(text, RULES_EXTRACTOR)]));

test('1.6 PINNED COPY: each rules-JSON extractor carries the one shared pattern exactly once, and the pattern still finds a rules block that parses', () => {
  const texts = Object.fromEntries(RULES_EXTRACTOR_FILES.map((f) => [f, read(f)]));
  assert.deepEqual(extractorCounts(texts), Object.fromEntries(RULES_EXTRACTOR_FILES.map((f) => [f, 1])),
    'each rules-JSON extractor must carry the shared pattern exactly once');
  const shell = read('src/app-shell.html');
  assert.equal(occurrences(shell, '<script type="application/json" ' + RULES_ID + '>'), 1, 'the app shell carries exactly one rules block');
  const m = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
  assert.ok(m, 'the shared pattern finds the rules block');
  assert.equal(typeof JSON.parse(m[1]), 'object', 'and the block parses as JSON');
});

test('1.6 PINNED COPY: no instrument file outside the pinned six carries the rules block id', () => {
  assert.deepEqual(instrumentFilesNaming(RULES_ID), sorted(RULES_EXTRACTOR_FILES),
    'every rules-JSON extractor under tools/ and tests/lib/ must be one of the pinned six');
});

test('1.6 control: the extractor pin counts a drifted copy as none and a second copy as two', () => {
  const texts = Object.fromEntries(RULES_EXTRACTOR_FILES.map((f) => [f, read(f)]));
  const drifted = Object.assign({}, texts, { 'tools/bench-simulation.js': texts['tools/bench-simulation.js'].split('v2b-rules-2026').join('v2b-rules-2025') });
  assert.equal(extractorCounts(drifted)['tools/bench-simulation.js'], 0, 'CONTROL: a drifted copy is no longer counted');
  const doubled = Object.assign({}, texts, { 'tools/capture-baseline.js': texts['tools/capture-baseline.js'] + '\n' + RULES_EXTRACTOR });
  assert.equal(extractorCounts(doubled)['tools/capture-baseline.js'], 2, 'CONTROL: a second copy is counted');
});
