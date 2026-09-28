'use strict';

/*
 * THE EXCLUSION IS A DECISION, AND THIS IS WHAT MAKES IT ONE.
 *
 * Decision register P19 (2026-09-10) declares `mortgage-vs-investing.js` and
 * `debt-strategy-adapter.js` unsupported rather than repairing the eight
 * findings in them (RB-03…RB-08, RC-03, RC-04). P10 requires one definition of
 * "which namespaces exist" instead of the two that had already bitten three
 * times.
 *
 * Those are the same mechanism, which is why they are one file.
 *
 * WHAT WENT WRONG BEFORE. `build.js` bundled eight debt namespaces into the
 * shipped artifact. `buildWorkerSource()` in `src/app-shell.html` bound six,
 * from a hand-written literal array. `DebtRevolving` and `MortgageVsInvesting`
 * were therefore present in the artifact and `undefined` inside the Worker --
 * any call reached a ReferenceError rather than a clean failure. Nothing in
 * the build, the tests or the release gate could state which of those facts
 * was intended, and an external audit found six P1 defects in a module that
 * never ran.
 *
 * "Unwired by accident" and "excluded on purpose" are indistinguishable from
 * the outside. The difference has to be written down somewhere a test can read
 * it, or the next author re-adds the line and nothing objects.
 *
 * The three properties below are what an auditor can check:
 *   1. every debt-namespace module on disk is REGISTERED, one way or the other
 *   2. every excluded module is absent from the artifact and says why
 *   3. the Worker binds exactly what the bundle contains -- no hand-maintained
 *      second list, in either direction
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { DEBT_MODULES, BUNDLED_MODULES, EXCLUDED_MODULES, build } = require('../build.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

/** Every module that participates in the debt-namespace bundle, from disk. */
function debtNamespaceFilesOnDisk() {
  return fs.readdirSync(SRC)
    .filter((f) => (/^debt-.*\.js$/.test(f) || f === 'mortgage-vs-investing.js'))
    .sort();
}

// ---------------------------------------------------------------------------
// 1. Registration -- nothing gets to be silently absent
// ---------------------------------------------------------------------------

test('every debt-namespace module on disk is registered as bundled or excluded', () => {
  const onDisk = debtNamespaceFilesOnDisk();
  const registered = DEBT_MODULES.map((m) => m.file).sort();

  assert.ok(onDisk.length >= 8, 'precondition: expected the debt module set, found ' + onDisk.length);
  assert.deepEqual(registered, onDisk,
    'a src/debt-*.js module that is in neither BUNDLED_MODULES nor EXCLUDED_MODULES is exactly ' +
    'the state this test exists to prevent: present in the repository, absent from the artifact, ' +
    'and with nothing anywhere saying whether that was intended. Add it to build.js DEBT_MODULES ' +
    'with bundled:true, or with bundled:false and an excludedReason.');

  assert.equal(BUNDLED_MODULES.length + EXCLUDED_MODULES.length, DEBT_MODULES.length,
    'the two lists must partition the registry exactly');
});

test('the registry is internally consistent -- unique files, unique namespaces', () => {
  const files = DEBT_MODULES.map((m) => m.file);
  const namespaces = DEBT_MODULES.map((m) => m.namespace);
  assert.equal(new Set(files).size, files.length, 'a file is registered twice');
  assert.equal(new Set(namespaces).size, namespaces.length, 'a namespace is registered twice');
  DEBT_MODULES.forEach((m) => {
    assert.ok(fs.existsSync(path.join(SRC, m.file)), m.file + ' is registered but not on disk');
  });
});

// ---------------------------------------------------------------------------
// 2. The exclusion actually holds, and is explained
// ---------------------------------------------------------------------------

test('P19: the excluded modules are exactly the ones the decision named', () => {
  const excluded = EXCLUDED_MODULES.map((m) => m.file).sort();
  assert.deepEqual(excluded, [
    'debt-payoff-strategy.js',
    'debt-strategy-adapter.js',
    'mortgage-vs-investing.js',
  ], 'changing this set is a decision, not a refactor -- P19 names the comparison surface, and ' +
     'debt-payoff-strategy travels with the adapter because nothing else in src/ requires it. ' +
     'Reviving one means satisfying its contract (P13, P14, P15, P17), not deleting this line.');
});

test('P19: every exclusion carries a stated reason', () => {
  assert.ok(EXCLUDED_MODULES.length > 0, 'precondition: the exclusion registry must not be empty');
  EXCLUDED_MODULES.forEach((m) => {
    assert.equal(typeof m.excludedReason, 'string', m.file + ' must carry excludedReason');
    assert.ok(m.excludedReason.length > 10,
      m.file + ' needs a real reason, not a placeholder -- a bare flag is how "unwired by ' +
      'accident" got mistaken for a decision in the first place');
  });
});

test('P19: an excluded namespace does not reach the shipped artifact', () => {
  const scratch = path.join(require('node:os').tmpdir(),
    'exclusion-check-' + process.pid + '.html');
  try {
    const { debtModulesBlock, output } = build(scratch);

    BUNDLED_MODULES.forEach((m) => {
      assert.ok(debtModulesBlock.includes(m.namespace + ':' + m.namespace),
        m.namespace + ' is bundled and must appear in the factory\'s return object');
    });

    EXCLUDED_MODULES.forEach((m) => {
      assert.ok(!debtModulesBlock.includes(m.namespace + ':' + m.namespace),
        m.namespace + ' is excluded (' + m.excludedReason + ') and must not be returned by the factory');
      /* The whole point: not merely unbound, but genuinely not in the artifact. */
      assert.ok(!output.includes('function ' + m.namespace + 'Namespace'),
        m.namespace + ' source must not be inlined into the shipped artifact at all');
    });
  } finally {
    if (fs.existsSync(scratch)) fs.unlinkSync(scratch);
  }
});

// ---------------------------------------------------------------------------
// 3. One definition of "which namespaces exist" (P10 / Q20 / Q33)
// ---------------------------------------------------------------------------

test('P10: the Worker binding list is derived from the bundle, not hand-maintained', () => {
  const shell = fs.readFileSync(path.join(SRC, 'app-shell.html'), 'utf8');
  const workerFn = shell.slice(shell.indexOf('function buildWorkerSource()'));
  const body = workerFn.slice(0, workerFn.indexOf('function canUseWorkers'));

  assert.ok(body.includes('Object.keys(__debtModules)'),
    'buildWorkerSource() must derive its bindings from the factory\'s own output. This was a ' +
    'literal array, and it disagreed with build.js about two namespaces for three sprints.');

  /* A literal list of namespaces reappearing here is the regression. Checked by
     searching for the namespaces themselves rather than for a syntax shape, so
     rewriting the array differently does not evade it. */
  DEBT_MODULES.forEach((m) => {
    assert.ok(!body.includes('"' + m.namespace + '"'),
      body.indexOf('"' + m.namespace + '"') >= 0
        ? m.namespace + ' is named as a string literal inside buildWorkerSource(); that is the ' +
          'second definition this test exists to forbid'
        : '');
  });
});

test('P10: the engine calls no excluded namespace', () => {
  const engine = fs.readFileSync(path.join(SRC, 'engine.js'), 'utf8');
  EXCLUDED_MODULES.forEach((m) => {
    assert.ok(!new RegExp('\\b' + m.namespace + '\\s*\\.').test(engine),
      'src/engine.js references ' + m.namespace + ', which is excluded from the bundle -- that ' +
      'would be a ReferenceError in the Worker, which is precisely the failure mode Q15 and Q33 ' +
      'both recorded');
  });
});

test('P10: the capture harness installs exactly what is bundled', () => {
  const installed = require('../tools/capture-baseline.js').installDebtModules();
  assert.deepEqual(installed, BUNDLED_MODULES.map((m) => m.namespace),
    'the Node harness must mirror the artifact. If it installs an excluded namespace, tests pass ' +
    'against a graph the browser does not have -- the third assembly problem Q15 recorded.');
});

/* ---------------------------------------------------------------------------
 * findingIds -- the machine-readable exclusion list, added 2026-09-12 at the
 * external audit's request.
 *
 * Before it, the eleven P19 dispositions existed only inside prose, and one of
 * them was written as the RANGE "RB-03 to RB-08". Anything that did not expand
 * ranges found seven IDs across build.js rather than eleven. Writing the list
 * out also settled a miscount the prose had carried for three sprints: it named
 * ten findings against mortgage-vs-investing.js and called them "nine".
 * ------------------------------------------------------------------------- */

const BS = String.fromCharCode(92);   /* a literal backslash, built rather than escaped */
const EXPECTED_P19 = [
  'RB-03', 'RB-04', 'RB-05', 'RB-06', 'RB-07', 'RB-08',
  'RC-03', 'RC-04', 'ST2-01', 'ST2-04', 'ST2-06',
];

/* Eight of the eleven carry a todo revival witness. These three do not, and
   that asymmetry is DECLARED here rather than discovered later: it is the
   difference between a recorded decision and an accident.

   BOOKKEEPING ONLY (external closeout CQ-4). Enforcing this list verifies
   which IDs lack a witness. It is not behavioural coverage of any of the
   three, and must never be presented as such: each needs a dedicated
   witness before its module is reintroduced. */
const NO_REVIVAL_WITNESS = ['ST2-01', 'ST2-04', 'ST2-06'];

test('P19: every excluded module declares findingIds, and the union is the eleven', () => {
  EXCLUDED_MODULES.forEach((m) => {
    assert.ok(Array.isArray(m.findingIds),
      m.file + ' has no findingIds array -- the exclusion list must be readable without ' +
      'parsing prose, which is the whole reason this field exists');
  });

  const union = EXCLUDED_MODULES.reduce((all, m) => all.concat(m.findingIds), []).sort();
  assert.deepEqual(union, EXPECTED_P19.slice().sort(),
    'the declared exclusion set has drifted from the eleven P19 dispositions');

  /* A module excluded as a dependency rather than for its own defects declares
     an EMPTY list, not a missing one. Absent and empty are different claims. */
  const dep = EXCLUDED_MODULES.find((m) => m.file === 'debt-payoff-strategy.js');
  assert.deepEqual(dep.findingIds, [],
    'debt-payoff-strategy travels with the adapter and has no findings of its own');
});

test('P19: findingIds agrees with the prose it replaced', () => {
  /* The array is the machine-readable form of excludedReason, so the two must
     not be able to disagree. Every ID in the array is named in its own module's
     reason string, either directly or inside a range. */
  EXCLUDED_MODULES.forEach((m) => {
    m.findingIds.forEach((id) => {
      const named = m.excludedReason.includes(id);
      const fam = id.split('-')[0];
      const ranged = new RegExp(fam + '-' + BS + 'd' + BS + 'd' + BS + 's+to' + BS + 's+' + fam + '-' + BS + 'd' + BS + 'd').test(m.excludedReason);
      assert.ok(named || ranged,
        id + ' is declared in ' + m.file + "'s findingIds but appears nowhere in its " +
        'excludedReason, so the list and the explanation have drifted apart');
    });
  });
});

const REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'test-exception-registry.json'), 'utf8'));

test('P19: the revival contract covers eight of eleven, and names the three it does not', () => {
  /* READ FROM THE REGISTRY, NOT FROM FILE TEXT (S4 task 2b.2d).
     The previous version counted an ID as "tagged" if it appeared ANYWHERE in
     a test file's text -- comments included -- and read tests/ non-recursively.
     RB-03, RB-08 and RC-03 were "tagged" by prose in
     tests/mortgage-vs-investing.test.js alone, so deleting their todo
     witnesses would not have changed its result. The witnesses are now named,
     by identity, in tools/test-exception-registry.json, and the release gate
     fails unless that list is exactly the run's todo set -- so an entry here
     means a real todo test ran under that name. */
  const revival = REGISTRY.entries.filter((e) => e.kind === 'revival-contract');
  const tagged = [...new Set(revival.map((e) => e.findingId))].sort();
  const untagged = EXPECTED_P19.filter((id) => !tagged.includes(id));

  assert.deepEqual(untagged.sort(), NO_REVIVAL_WITNESS.slice().sort(),
    'the set of P19 findings without a revival witness has changed. If one gained a ' +
    'witness, remove it from NO_REVIVAL_WITNESS. If one LOST its witness, that is a ' +
    'regression in the revival contract and must not be absorbed by editing this list.');

  assert.equal(tagged.length, 8,
    'the revival contract covers ' + tagged.length + ' of eleven dispositions, not eight');

  assert.deepEqual(tagged.filter((id) => !EXPECTED_P19.includes(id)), [],
    'a revival-contract entry names a finding that is not a P19 disposition');

  revival.forEach((e) => {
    const owner = EXCLUDED_MODULES.find((m) => m.findingIds.includes(e.findingId));
    assert.ok(owner && e.module === 'src/' + owner.file,
      e.findingId + '\'s revival witness names ' + e.module + ', but build.js assigns that finding to ' +
      (owner ? 'src/' + owner.file : 'no excluded module'));
  });
});

/* ---------------------------------------------------------------------------
 * THE REINTRODUCTION GATE (S4 task 2b.2c, S4-PA-07).
 *
 * Three P19 findings -- ST2-01, ST2-04, ST2-06 -- have no witness at all, and
 * the external closeout (CQ-4) accepted that only as "explicitly deferred,
 * owned and required before reintroduction". A register row records that; it
 * does not enforce it. This is the enforcement.
 *
 * It PASSES TODAY and must not fail merely because the witnesses are absent --
 * that would be the bookkeeping check CQ-4 discounted. It fails only when an
 * excluded module becomes REACHABLE through a supported route while any of its
 * findings lacks a passing witness. The routes:
 *   bundle      build.js registers the module as bundled
 *   export      the built bundle factory returns its namespace
 *   dependency  a bundled module, the engine, the validator or the app shell requires it
 *   call        the engine or the validator references its namespace
 *
 * THE DECISION IS WRITTEN HERE, not read from build.js. If the module list
 * came from the build registry, flipping `bundled: false` and deleting its
 * findingIds in one edit would remove the protection along with the exclusion.
 *
 * A finding's witness is PASSING only if it is not in NO_REVIVAL_WITNESS, is
 * not still authorized as todo in the registry (the gate guarantees a registry
 * entry means the test ran as todo), and a test named "<ID>: ..." exists. When
 * a module is legitimately reintroduced, its revival tests leave todo and pass
 * as ordinary tests: "must stay todo" applies only while it stays excluded.
 * ------------------------------------------------------------------------- */

const P19_DECISION = {
  'mortgage-vs-investing.js': ['RB-03', 'RB-04', 'RB-05', 'RB-06', 'RB-07', 'RB-08', 'RC-03', 'ST2-01', 'ST2-04', 'ST2-06'],
  'debt-strategy-adapter.js': ['RC-04'],
  'debt-payoff-strategy.js': [],
};

/** Pure: which reachable modules lack passing witnesses. Tested on its own below. */
function reintroductionProblems(decision, routesByFile, witnessStatus) {
  const problems = [];
  Object.keys(decision).forEach((file) => {
    const routes = routesByFile[file] || [];
    if (!routes.length) return;
    const lacking = decision[file]
      .map((id) => ({ id: id, status: witnessStatus(id) }))
      .filter((w) => w.status !== 'passing');
    if (lacking.length) {
      problems.push(file + ' is reachable (' + routes.join('; ') + ') but its P19 findings lack passing witnesses: ' +
        lacking.map((w) => w.id + ' [' + w.status + ']').join(', '));
    }
  });
  return problems;
}

function allTestSources(dir, acc) {
  const out = acc || [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) allTestSources(full, out);
    else if (entry.name.endsWith('.js') && full !== __filename) out.push(fs.readFileSync(full, 'utf8'));
  }
  return out;
}

function witnessStatusFrom(registry, testSources) {
  const todo = new Set(registry.entries.filter((e) => e.kind === 'revival-contract').map((e) => e.findingId));
  const corpus = testSources.join('\n');
  return function (id) {
    if (NO_REVIVAL_WITNESS.includes(id)) return 'no witness (NO_REVIVAL_WITNESS)';
    if (todo.has(id)) return 'still todo (registry)';
    const declared = new RegExp('test' + BS + '(' + BS + 's*[\'"`]' + id + ':').test(corpus);
    return declared ? 'passing' : 'no witness declared';
  };
}

function reachabilityRoutes() {
  const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
  let debtModulesBlock = '';
  let buildNote = null;
  const scratch = path.join(require('node:os').tmpdir(), 'reintroduction-check-' + process.pid + '.html');
  try {
    debtModulesBlock = build(scratch).debtModulesBlock;
  } catch (e) {
    buildNote = e.message;
  } finally {
    if (fs.existsSync(scratch)) fs.unlinkSync(scratch);
  }
  const routes = {};
  Object.keys(P19_DECISION).forEach((file) => {
    const m = DEBT_MODULES.find((x) => x.file === file);
    const ns = m && m.namespace;
    const r = [];
    if (BUNDLED_MODULES.some((b) => b.file === file)) r.push('bundle: build.js registers it as bundled');
    if (ns && debtModulesBlock.includes(ns + ':' + ns)) r.push('export: the bundle factory returns ' + ns);
    const base = file.replace(/\.js$/, '');
    const requireRe = new RegExp('require' + BS + '(' + BS + 's*[\'"]' + BS + '.' + '/' + base + '(' + BS + '.js)?[\'"]');
    const consumers = BUNDLED_MODULES.map((b) => b.file).filter((f) => f !== file)
      .concat(['engine.js', 'scenario-validator.js', 'app-shell.html']);
    consumers.forEach((f) => { if (requireRe.test(read(f))) r.push('dependency: src/' + f + ' requires it'); });
    if (ns) {
      const callRe = new RegExp(BS + 'b' + ns + BS + 's*' + BS + '.');
      ['engine.js', 'scenario-validator.js'].forEach((f) => { if (callRe.test(read(f))) r.push('call: src/' + f + ' references ' + ns); });
    }
    // A build that throws cannot show the export route; say so rather than read it as "not exported".
    if (buildNote && r.length) r.push('(build failed, export route unknown: ' + buildNote.slice(0, 100) + ')');
    routes[file] = r;
  });
  return routes;
}

test('P19 reintroduction gate: the decision covers every excluded module and is registered', () => {
  assert.deepEqual(Object.keys(P19_DECISION).sort(), EXCLUDED_MODULES.map((m) => m.file).sort(),
    'the excluded set and the written decision must agree while nothing has been reintroduced');
  Object.keys(P19_DECISION).forEach((file) => {
    assert.ok(DEBT_MODULES.some((m) => m.file === file), file + ' must stay registered in build.js DEBT_MODULES');
    assert.ok(fs.existsSync(path.join(SRC, file)), file + ' is named by P19 but not on disk');
  });
  assert.deepEqual(Object.values(P19_DECISION).flat().sort(), EXPECTED_P19.slice().sort());
});

test('P19 reintroduction gate: the decision logic fires on a reachable module and stays quiet on an unreachable one', () => {
  const status = (id) => (id === 'X-02' ? 'passing' : 'still todo (registry)');
  const decision = { 'a.js': ['X-01', 'X-02'], 'b.js': ['X-03'], 'c.js': [] };
  // Unreachable: nothing, whatever the witnesses say. Absence alone must never fail.
  assert.deepEqual(reintroductionProblems(decision, {}, status), []);
  // Reachable with a todo witness: named. A reachable module with no findings needs none.
  const p = reintroductionProblems(decision, { 'a.js': ['bundle: test'], 'c.js': ['bundle: test'] }, status);
  assert.equal(p.length, 1, JSON.stringify(p));
  assert.match(p[0], /a\.js is reachable \(bundle: test\).*X-01 \[still todo \(registry\)\]/);
  assert.doesNotMatch(p[0], /X-02/, 'a passing witness must not be reported');
});

test('P19 reintroduction gate: no excluded module is reachable through a supported route without passing witnesses', () => {
  const routes = reachabilityRoutes();
  const status = witnessStatusFrom(REGISTRY, allTestSources(path.join(ROOT, 'tests')));
  const problems = reintroductionProblems(P19_DECISION, routes, status);
  assert.deepEqual(problems, [],
    'an excluded module became reachable before its revival contract was satisfied. Reintroduction requires ' +
    'every finding to have a passing witness (P13/P14/P15/P17); ST2-01/04/06 need witnesses written first.');
  // And today it is simply unreachable -- recorded so a quiet route change is visible in review.
  Object.keys(routes).forEach((file) => assert.deepEqual(routes[file], [], file + ' routes: ' + routes[file].join('; ')));
});

