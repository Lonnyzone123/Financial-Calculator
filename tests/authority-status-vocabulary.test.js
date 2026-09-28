/* S5 task 4 (Q79) -- ONE authority-status vocabulary, pinned before the field exists.
 *
 * Tasks 5, 8, 11 and 12 write a typed authority status, and S5b and S6 inherit it. Decided 2026-09-14 (the owner), answer
 * (a): TAX_RULES_ENGINE_REFERENCE_2026.md section 1.2's six parameter-status values, plus PROPOSED_REGULATION, the one
 * value mapping ACCOUNT_RULES_ENGINE_REFERENCE_2026.md section 2.2 onto those six genuinely loses. Seven values, upper
 * case, in src/authority-status-vocabulary.json.
 *
 * The file is held to the two specifications, which it does not control: section 1.2's table, compared word for word,
 * and section 2.2's list, each value mapped or recorded as unmapped. A scan of src, tests and tools then refuses any
 * authority status outside the seven, and any name the file retires; this file and the vocabulary itself are the only
 * places a retired name is written. The vocabulary is read inside each test, so a missing file fails each title.
 * Each title is a literal, so the requirements register names every one.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const VOCABULARY_FILE = 'src/authority-status-vocabulary.json';
const THIS_FILE = path.relative(ROOT, __filename).split(path.sep).join('/');
const vocabulary = () => JSON.parse(read(VOCABULARY_FILE));
const SEVEN = ['ENACTED', 'OFFICIAL_2026', 'INFERRED', 'FORM_PENDING', 'MODEL_ASSUMPTION', 'UNSUPPORTED', 'PROPOSED_REGULATION'];

/* TAX section 1.2's table: one row per status, with its meaning and production treatment. */
function taxTable() {
  const md = read('Resource Documents/TAX_RULES_ENGINE_REFERENCE_2026.md');
  const start = md.indexOf('### 1.2 Parameter-status vocabulary');
  assert.ok(start >= 0, 'TAX section 1.2 was not found under its heading');
  const next = md.indexOf('\n#', start + 1);
  const section = md.slice(start, next === -1 ? md.length : next);
  return [...section.matchAll(/^\| `([A-Z][A-Z0-9_]*)` \| ([^|]+?) \| ([^|]+?) \|\s*$/gm)]
    .map((m) => ({ status: m[1], meaning: m[2].trim(), treatment: m[3].trim() }));
}
/* ACCOUNT section 2.2's list: the bullets directly under "Recommended `authority_status` values:". */
function accountList() {
  const md = read('Resource Documents/ACCOUNT_RULES_ENGINE_REFERENCE_2026.md');
  const marker = 'Recommended `authority_status` values:';
  const start = md.indexOf(marker);
  assert.ok(start >= 0, 'ACCOUNT section 2.2\'s value list was not found under its lead-in');
  const lines = md.slice(start + marker.length).split('\n').map((l) => l.trim());
  const out = [];
  let begun = false;
  for (const l of lines) {
    const m = l.match(/^- `([a-z_]+)`$/);
    if (m) { out.push(m[1]); begun = true; } else if (begun && l !== '') break;
  }
  return out;
}

/* The scan: every authority-status field's value must be one of the allowed set, and no retired name may appear. */
const FIELD = /\b(authority_status|authorityStatus|authority-status)\b["']?\s*[:=]\s*["']([^"']+)["']/g;
function problemsInText(text, where, allowed, retired) {
  const problems = [];
  for (const m of text.matchAll(FIELD)) if (!allowed.includes(m[2])) problems.push(where + ': authority status ' + JSON.stringify(m[2]) + ' is not in the vocabulary');
  for (const name of retired) if (text.includes(name)) problems.push(where + ': names the retired status ' + name);
  return problems;
}
function filesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + '/' + entry.name;
    if (entry.isDirectory()) { if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) out.push(...filesUnder(rel)); }
    else if (/\.(js|json|html|py)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

test('Q79: the authority-status vocabulary is exactly seven upper-case values -- TAX section 1.2\'s six and PROPOSED_REGULATION', () => {
  const statuses = vocabulary().values.map((v) => v.status);
  assert.deepEqual(statuses, SEVEN);
  assert.equal(new Set(statuses).size, statuses.length, 'no value twice');
  for (const s of statuses) assert.match(s, /^[A-Z][A-Z0-9_]*$/, s + ' is upper case');
});

test('Q79: the six TAX values carry TAX section 1.2\'s own meaning and production treatment, word for word, and only PROPOSED_REGULATION comes from elsewhere', () => {
  const table = taxTable();
  assert.equal(table.length, 6, 'TAX section 1.2 holds six rows: ' + JSON.stringify(table.map((r) => r.status)));
  const values = vocabulary().values;
  const wrong = [];
  for (const row of table) {
    const v = values.find((x) => x.status === row.status);
    if (!v) { wrong.push(row.status + ' is missing'); continue; }
    if (v.meaning !== row.meaning) wrong.push(row.status + ' meaning: ' + JSON.stringify(v.meaning) + ', TAX says ' + JSON.stringify(row.meaning));
    if (v.treatment !== row.treatment) wrong.push(row.status + ' treatment: ' + JSON.stringify(v.treatment) + ', TAX says ' + JSON.stringify(row.treatment));
  }
  const fromElsewhere = values.map((v) => v.status).filter((s) => !table.some((r) => r.status === s));
  assert.deepEqual(wrong, []);
  assert.deepEqual(fromElsewhere, ['PROPOSED_REGULATION']);
});

test('Q79: every ACCOUNT section 2.2 value is mapped onto the vocabulary or recorded as unmapped, and proposed_regulation maps to PROPOSED_REGULATION', () => {
  const list = accountList();
  assert.equal(list.length, 8, 'ACCOUNT section 2.2 lists eight values: ' + JSON.stringify(list));
  const v = vocabulary();
  const statuses = v.values.map((x) => x.status);
  assert.deepEqual(Object.keys(v.accountMapping).sort(), [...list].sort(), 'the mapping covers exactly ACCOUNT section 2.2\'s list');
  const wrong = [];
  for (const [account, mapped] of Object.entries(v.accountMapping)) {
    if (mapped === null && !(v.accountMappingNotes && v.accountMappingNotes[account])) wrong.push(account + ' is unmapped without a recorded reason');
    if (mapped !== null && !statuses.includes(mapped)) wrong.push(account + ' maps to ' + mapped + ', which is not in the vocabulary');
  }
  assert.deepEqual(wrong, []);
  assert.equal(v.accountMapping.proposed_regulation, 'PROPOSED_REGULATION');
});

test('Q79: no authority status outside the vocabulary, and no retired status name, appears in src, tests or tools', () => {
  const v = vocabulary();
  const allowed = v.values.map((x) => x.status);
  const retired = Object.keys(v.retired || {});
  assert.ok(retired.length > 0, 'the vocabulary records the name it retires');
  const problems = [];
  for (const rel of ['src', 'tests', 'tools'].flatMap(filesUnder)) {
    if (rel === THIS_FILE) continue;
    const text = read(rel);
    problems.push(...problemsInText(text, rel, allowed, rel === VOCABULARY_FILE ? [] : retired));
  }
  assert.deepEqual(problems, []);
});

test('Q79 control: the scan reports an authority status outside the vocabulary and a retired name when they are present, and accepts a listed one', () => {
  const allowed = SEVEN;
  const retiredName = 'UNREPRESENTABLE';
  assert.deepEqual(problemsInText('{ "authority_status": "ENACTED" }\nauthorityStatus: \'PROPOSED_REGULATION\'', 'sample', allowed, [retiredName]), []);
  const found = problemsInText('{ "authority_status": "final_regulation" }\nconst category = "' + retiredName + '";', 'sample', allowed, [retiredName]);
  assert.equal(found.length, 2, JSON.stringify(found));
});
