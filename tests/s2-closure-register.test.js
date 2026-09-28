/* The S2 closure register's counts are DERIVED, not asserted.
 *
 * External closeout CQ-2: "Derive the final counts from the verified register;
 * do not treat 59 or 48 as immutable acceptance targets." S2_CLOSURE_REGISTER.md
 * carries a counts block; this file re-derives it from the table rows and
 * fails if the two disagree, so the numbers cannot drift from the entries
 * they summarise. It also checks the register against the repository: the
 * excluded IDs must be exactly build.js's findingIds, and every cited witness
 * must exist.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const REGISTER = fs.readFileSync(path.join(ROOT, 'S2_CLOSURE_REGISTER.md'), 'utf8');

/* Only the main disposition table. The fold and record-correction tables below
   it start their rows the same way (| `P7-03` | `S3-01` |), and an earlier
   version of this parser counted them as dispositions. */
function parseRows(text) {
  return text.split('## Counts')[0].split(/\r?\n/)
    .filter((l) => /^\| `[A-Z0-9]+-[0-9A-Z]+` \|/.test(l))
    .map((l) => {
      const cells = l.split('|').map((c) => c.trim());
      return { id: cells[1].replace(/`/g, ''), disposition: cells[2].replace(/\*\*/g, '').trim(), evidence: cells[3] };
    });
}

function deriveCounts(rows) {
  const counts = {};
  rows.forEach((r) => { counts[r.disposition] = (counts[r.disposition] || 0) + 1; });
  return counts;
}

function statedCounts(text) {
  const block = text.split('<!-- counts:begin -->')[1].split('<!-- counts:end -->')[0];
  const counts = {};
  let total = null;
  block.split(/\r?\n/).forEach((l) => {
    const m = l.match(/^\|\s*(\*\*)?([^|*]+?)(\*\*)?\s*\|\s*(\*\*)?(\d+)(\*\*)?\s*\|$/);
    if (!m) return;
    if (m[2] === 'Total') total = Number(m[5]);
    else counts[m[2]] = Number(m[5]);
  });
  return { counts, total };
}

const rows = parseRows(REGISTER);

test('register: the counts block equals the counts derived from the table rows', () => {
  assert.ok(rows.length > 0, 'no register rows parsed -- the parser is measuring nothing');
  const derived = deriveCounts(rows);
  const stated = statedCounts(REGISTER);
  assert.deepEqual(stated.counts, derived, 'the counts block disagrees with the rows');
  assert.equal(stated.total, rows.length, 'the stated total disagrees with the number of rows');
});

test('register: every ID appears once, with a recognised disposition label', () => {
  const seen = new Set();
  const labels = new Set(['repaired', 'repaired — partially qualified', 'repaired — scoped', 'excluded (P19)']);
  rows.forEach((r) => {
    assert.ok(!seen.has(r.id), `${r.id} appears twice`);
    seen.add(r.id);
    assert.ok(labels.has(r.disposition), `${r.id} has an unrecognised disposition "${r.disposition}"`);
  });
});

test('register: the excluded IDs are exactly build.js\'s findingIds', () => {
  const build = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  const fromBuild = new Set();
  for (const m of build.matchAll(/findingIds:\s*\[([^\]]*)\]/g)) {
    (m[1].match(/'([A-Z0-9]+-[0-9A-Z]+)'/g) || []).forEach((q) => fromBuild.add(q.replace(/'/g, '')));
  }
  assert.ok(fromBuild.size > 0, 'no findingIds parsed from build.js -- the parser is measuring nothing');
  const excluded = new Set(rows.filter((r) => r.disposition === 'excluded (P19)').map((r) => r.id));
  assert.deepEqual([...excluded].sort(), [...fromBuild].sort());
});

test('register: every cited witness file exists', () => {
  const missing = [];
  rows.forEach((r) => {
    (r.evidence.match(/`([a-z0-9-]+\.test\.js)`/g) || []).forEach((q) => {
      const file = q.replace(/`/g, '');
      if (!fs.existsSync(path.join(ROOT, 'tests', file))) missing.push(`${r.id}: ${file}`);
    });
  });
  assert.deepEqual(missing, []);
});

test('negative control: relabelling one row changes the derived counts', () => {
  const mutated = REGISTER.replace('| `CL-02` | repaired |', '| `CL-02` | **repaired — scoped** |');
  assert.notEqual(mutated, REGISTER, 'the mutation must apply, or the control is vacuous');
  const before = deriveCounts(parseRows(REGISTER));
  const after = deriveCounts(parseRows(mutated));
  assert.equal(after.repaired, before.repaired - 1);
  assert.equal(after['repaired — scoped'], (before['repaired — scoped'] || 0) + 1);
  assert.notDeepEqual(statedCounts(mutated).counts, after, 'the stale counts block must now disagree');
});
