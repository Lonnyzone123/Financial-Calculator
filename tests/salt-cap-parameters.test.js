/* S5 task 13: the federal SALT cap's parameters, recorded with citations. Decided 2026-09-13 (the owner), option (b): the
 * engine has no itemization path, so nothing is capped. Land the parameters and keep F-SALT-01 skipped, so the figure
 * is recorded and never needs re-researching.
 *
 * TAX_RULES_ENGINE_REFERENCE_2026.md section 3.9: salt_cap = max(10,000, 40,400 - 0.30 * max(0, salt_magi - 505,000)),
 * halved for MFS, from Public Law 119-21. The early 2026 Form 1040-ES's rounded $40,000 and $500,000 conflict with the
 * enacted indexation, so the enacted figures are stored as ENACTED. Each parameter carries TAX section 1.2's record
 * shape, as task 12.1 requires of every parameter this sprint creates.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const RULES = JSON.parse(read('src/app-shell.html').match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const vocabulary = JSON.parse(read('src/authority-status-vocabulary.json'));
const RECORD_FIELDS = ['effective_from', 'effective_to', 'filing_status', 'form_or_code_reference', 'indexation_rule', 'jurisdiction', 'provision_id', 'source_checked_at', 'source_url', 'status', 'tax_year', 'value'];
const LAW = 'https://www.govinfo.gov/content/pkg/PLAW-119publ21/pdf/PLAW-119publ21.pdf';
const records = () => (RULES.federal.salt && RULES.federal.salt.records) || [];
const value = (id, filing) => {
  const r = records().find((x) => x.provision_id === id && x.filing_status === filing);
  assert.ok(r, 'a record for ' + id + ' / ' + filing);
  return r.value;
};

test('the 2026 federal SALT cap parameters are recorded in the parameter-record shape, ENACTED, citing Public Law 119-21', () => {
  const list = records();
  assert.equal(list.length, 7, 'cap, phaseout start and floor for non-MFS and MFS, and one phaseout rate');
  const statuses = vocabulary.values.map((v) => v.status);
  for (const r of list) {
    assert.deepEqual(Object.keys(r).sort(), RECORD_FIELDS, r.provision_id + ': the record shape');
    assert.equal(r.jurisdiction, 'US-federal');
    assert.equal(r.tax_year, 2026);
    assert.equal(r.status, 'ENACTED');
    assert.ok(statuses.includes(r.status), 'a pinned status');
    assert.equal(r.source_url, LAW);
    assert.equal(r.effective_from, '2026-01-01');
    assert.equal(r.effective_to, '2026-12-31');
  }
});

test('the recorded values are TAX section 3.9\'s enacted figures, with MFS halving the cap, the phaseout start and the floor', () => {
  assert.equal(value('salt_cap', 'non_mfs'), 40400);
  assert.equal(value('salt_phaseout_start', 'non_mfs'), 505000);
  assert.equal(value('salt_floor', 'non_mfs'), 10000);
  assert.equal(value('salt_phaseout_rate', 'all'), 0.30);
  assert.equal(value('salt_cap', 'mfs'), 20200);
  assert.equal(value('salt_phaseout_start', 'mfs'), 252500);
  assert.equal(value('salt_floor', 'mfs'), 5000);
});

test('F-SALT-01\'s figure follows from the recorded parameters: MFJ at SALT MAGI $555,000 caps at $25,400', () => {
  const cap = Math.max(value('salt_floor', 'non_mfs'), value('salt_cap', 'non_mfs') - value('salt_phaseout_rate', 'all') * Math.max(0, 555000 - value('salt_phaseout_start', 'non_mfs')));
  assert.equal(Math.round(cap * 100) / 100, 25400);
});

test('control: no engine code reads the SALT parameters, because the engine has no itemization path to cap', () => {
  assert.equal(/\bsalt/i.test(read('src/engine.js')), false);
});

test('control: F-SALT-01 stays skipped in the spec-vector fixture, with its reason', () => {
  const v = JSON.parse(read('fixtures/spec-vectors-2026.fixtures.json')).taxGolden.find((x) => x.id === 'F-SALT-01');
  assert.ok(v && typeof v.skipped === 'string' && v.skipped.length > 10);
});
