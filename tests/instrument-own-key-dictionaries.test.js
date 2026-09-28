/* S5 task 1.7 -- dictionaries built on Object.prototype, in the instruments.
 *
 * tools/differential-harness.js reportOf() groups differences by scenario name
 * and by field path. It built both maps as plain objects written through
 * read-or-init: `byScenario[name] || (byScenario[name] = {...})`.
 *
 * The checklist's 1.7 note says only the `__proto__` accessor slips through a
 * plain object. That is true for plain ASSIGNMENT. For read-or-init it is not:
 *   - `byScenario["constructor"]` reads the inherited Object constructor, which
 *     is truthy, so the init never runs and `s.count++` writes onto the global
 *     Object function;
 *   - `byScenario["__proto__"]` reads Object.prototype itself, so `s.count++`
 *     gives EVERY object in the process a `count` property.
 * Either way the next line throws, and the process is left polluted.
 *
 * Reachability, stated because it is narrow: on the CLI path both captures
 * must pass the corpus invariant, which admits only reviewed scenario names.
 * reportOf() is exported, though, and the rebuild's comparisons will call it
 * on trees this repository does not control.
 *
 * Every case runs in a FRESH PROCESS. A polluting failure must not leak into
 * this file's own process, and the pollution itself is what is asserted. The
 * ordinary-name case is the control: it proves the child harness reports a
 * working report correctly, so a failure in the other cases is about the name.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const HARNESS = path.join(ROOT, 'tools', 'differential-harness.js');

const diff = (scenario, fieldPath) => ({ kind: 'VALUE', scenario, path: fieldPath, reference: 1, candidate: 2 });

function reportInFreshProcess(differences) {
  const script = [
    'const dh = require(' + JSON.stringify(HARNESS) + ');',
    'const differences = ' + JSON.stringify(differences) + ';',
    'let out;',
    'try {',
    '  const r = dh.reportOf(differences);',
    '  out = {',
    '    threw: null,',
    '    byScenario: Object.keys(r.byScenario).sort().map((k) => [k, r.byScenario[k].count]),',
    '    byField: Object.keys(r.byField).sort().map((k) => [k, r.byField[k].count, r.byField[k].scenarios]),',
    '  };',
    '} catch (e) { out = { threw: String(e && e.message) }; }',
    "out.objectPrototypePolluted = ['count', 'kinds', 'scenarios'].some((k) => Object.prototype.hasOwnProperty.call(Object.prototype, k));",
    "out.objectConstructorPolluted = ['count', 'kinds', 'scenarios'].some((k) => Object.prototype.hasOwnProperty.call(Object, k));",
    'process.stdout.write(JSON.stringify(out));',
  ].join('\n');
  const run = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  assert.equal(run.status, 0, 'the child process must run to completion: ' + run.stderr);
  return JSON.parse(run.stdout);
}

test('1.7 control: reportOf() groups an ordinary scenario name and field path, in a fresh process', () => {
  const out = reportInFreshProcess([diff('ordinary', 'rows[0].total'), diff('ordinary', 'rows[1].total')]);
  assert.equal(out.threw, null);
  assert.deepEqual(out.byScenario, [['ordinary', 2]]);
  assert.deepEqual(out.byField, [['rows[].total', 2, ['ordinary']]]);
  assert.equal(out.objectPrototypePolluted, false);
  assert.equal(out.objectConstructorPolluted, false);
});

test('1.7: a scenario named "constructor" is grouped under its own name, with no throw and no write onto Object', () => {
  const out = reportInFreshProcess([diff('constructor', 'rows[0].total'), diff('constructor', 'rows[1].total')]);
  assert.equal(out.threw, null, 'reportOf() threw: ' + out.threw);
  assert.deepEqual(out.byScenario, [['constructor', 2]]);
  assert.equal(out.objectConstructorPolluted, false, 'reportOf() wrote a property onto the global Object constructor');
});

test('1.7: a scenario named "__proto__" is grouped under its own name, and no object in the process gains a property', () => {
  const out = reportInFreshProcess([diff('__proto__', 'rows[0].total')]);
  assert.equal(out.threw, null, 'reportOf() threw: ' + out.threw);
  assert.deepEqual(out.byScenario, [['__proto__', 1]]);
  assert.equal(out.objectPrototypePolluted, false, 'reportOf() wrote a property onto Object.prototype');
});

test('1.7: a top-level field named "__proto__" or "constructor" is grouped under its own path, with no pollution', () => {
  for (const name of ['__proto__', 'constructor']) {
    const out = reportInFreshProcess([diff('ordinary', name)]);
    assert.equal(out.threw, null, 'field ' + name + ': reportOf() threw: ' + out.threw);
    assert.deepEqual(out.byField, [[name, 1, ['ordinary']]], 'field ' + name);
    assert.equal(out.objectPrototypePolluted, false, 'field ' + name + ': Object.prototype gained a property');
    assert.equal(out.objectConstructorPolluted, false, 'field ' + name + ': the Object constructor gained a property');
  }
});

/* tools/verify-baseline-provenance.js sourceConsistency() -- the per-file verdict map.
 *
 * Its keys are the file paths a stored capture's meta.sourceHashes claims, so
 * they are data read from a JSON file. `files[f] = verdict` on a plain object
 * with f = "__proto__" ran the inherited setter; a string prototype is ignored,
 * and that entry's verdict vanished from the report. allMatch, computed
 * separately, still counted it -- so the report said "not all sources match"
 * and omitted the one that did not. Plain assignment, so "constructor" was
 * never affected; it is here as the contrast.
 *
 * The fixture is a throwaway git repository, so this runs the same way in a
 * checkout and inside a delivered package (house pattern:
 * tests/baseline-provenance.test.js). */
test('1.7: sourceConsistency() reports a verdict for every claimed file, including one named "__proto__"', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const crypto = require('node:crypto');
  const { execFileSync } = require('node:child_process');
  const provenance = require(path.join(ROOT, 'tools', 'verify-baseline-provenance.js'));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'own-key-provenance-'));
  const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    git(['init', '--quiet'], scratch);
    git(['config', 'user.email', 'test@example.invalid'], scratch);
    git(['config', 'user.name', 'Own-Key Fixture'], scratch);
    fs.writeFileSync(path.join(scratch, 'README'), 'fixture\n');
    git(['add', 'README'], scratch);
    git(['commit', '--quiet', '-m', 'fixture'], scratch);
    const head = git(['rev-parse', 'HEAD'], scratch);
    const blob = execFileSync('git', ['cat-file', 'blob', head + ':README'], { cwd: scratch });
    const readmeHash = crypto.createHash('sha256').update(blob).digest('hex');
    const meta = JSON.parse('{"sourceHashes":{"README":"' + readmeHash + '","__proto__":"0000","constructor":"0000"}}');
    assert.ok(Object.prototype.hasOwnProperty.call(meta.sourceHashes, '__proto__'),
      'CONTROL: the fixture carries an OWN "__proto__" entry, as JSON.parse creates one');

    const result = provenance.sourceConsistency(meta, head, scratch);
    assert.equal(result.checkable, true, 'CONTROL: the fixture commit was readable');
    assert.equal(result.allMatch, false, 'two of the claimed files do not exist at the commit');
    assert.deepEqual(Object.entries(result.files).sort(), [
      ['README', 'committed'],
      ['__proto__', 'absent-at-commit'],
      ['constructor', 'absent-at-commit'],
    ], 'every claimed file must carry its own verdict in the report, whatever it is named');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
