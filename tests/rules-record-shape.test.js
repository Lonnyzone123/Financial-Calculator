/* S5 task 12: the parameter-record shape for every rule this sprint created or edited, and nothing else
 * (TAX_RULES_ENGINE_REFERENCE_2026.md section 1.2).
 *
 *   jurisdiction, tax_year, provision_id, filing_status, value, status, effective_from, effective_to, indexation_rule,
 *   source_url, source_checked_at, form_or_code_reference
 *
 * Tasks 7, 10, 11 and 13 built their parameters as records. Task 5a added five flat RMD keys, three ages and two statuses;
 * this task makes those ages records under RULES.retirement.rmd.startAge, each carrying its own status. Untouched rules
 * stay flat (12.2). SHAPE below is 12.5's list, so S6 task 1b inherits a list rather than a search: every rule group is
 * in it exactly once, and a group that gains records without the list changing fails here. Arizona's records landed
 * with task 8 (R6 of the audit repair round, after question 10 (A)). 12.3's never-overwrite-a-year rule is written beside the rules JSON, and 12.6
 * checks that the capture instrument's own pattern still finds that JSON.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
const RULES_PATTERN = '/<script type="application\\/json" id="v2b-rules-2026">([\\s\\S]*?)<\\/script>/';
const RULES_RE = /<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/;
global.RULES = JSON.parse(SHELL.match(RULES_RE)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const vocabulary = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'authority-status-vocabulary.json'), 'utf8'));

const FIELDS = ['jurisdiction', 'tax_year', 'provision_id', 'filing_status', 'value', 'status', 'effective_from', 'effective_to', 'indexation_rule', 'source_url', 'source_checked_at', 'form_or_code_reference'];
const SHAPE = {
  carries: {
    'federal.additionalStandardDeduction': 'S5AA task 3.1 (Q88): the IRC 63(f) additional amount for the aged',
    'federal.salt': 'task 13',
    'federal.selfEmployment': 'task 7',
    'federal.qualifiedBusinessIncome': 'S5AA R43 (SA42F-01): the IRC 199A deduction on self-employment profit',
    'retirement.ira.deductionPhaseout': 'S5AA task 3.6 step 1 (Q87): the IRC 219(g) phase-out of the traditional IRA deduction',
    'retirement.hsa.nonQualified': 'S5AA task 4.4 (Q99): IRC 223(f)(4)\'s 20% additional tax and its section 1811 age',
    'retirement.qcd': 'task 10',
    'retirement.workplace.rothCatchup': 'task 11',
    'retirement.rmd.startAge': 'task 5a, shaped by task 12',
    arizona: 'task 8 (R6, 2026-09-16)',
  },
  pending: {},
  notYet: [
    'federal.standardDeduction', 'federal.ordinaryBrackets', 'federal.capitalGains', 'federal.seniorDeduction', 'federal.niit',
    'federal.payroll', 'federal.socialSecurityTaxation', 'retirement.workplace', 'retirement.hsa', 'retirement.rmd',
    'socialSecurity', 'medicare',
  ],
  notParameters: ['meta', 'sources'],
};
const at = (p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), RULES);

test('every parameter this sprint created or edited carries the twelve record fields, a pinned status and a source', () => {
  const statuses = vocabulary.values.map((v) => v.status);
  for (const [p, task] of Object.entries(SHAPE.carries)) {
    const group = at(p);
    assert.ok(group && Array.isArray(group.records) && group.records.length > 0, p + ' (' + task + ') has records');
    for (const r of group.records) {
      for (const f of FIELDS) assert.ok(Object.prototype.hasOwnProperty.call(r, f), p + ' ' + r.provision_id + ' has ' + f);
      assert.equal(r.tax_year, 2026, p + ' ' + r.provision_id);
      assert.ok(statuses.includes(r.status), p + ' ' + r.provision_id + ': ' + r.status + ' is pinned');
      assert.match(r.source_url, /^https:\/\//, p + ' ' + r.provision_id);
    }
  }
});

test('task 5a\'s RMD start ages are records: 70.5 and 72 are OFFICIAL_2026, 1959\'s 73 is PROPOSED_REGULATION, and the flat keys are gone', () => {
  const rmd = RULES.retirement.rmd;
  for (const k of ['birthBeforeJuly1949Age', 'birthJuly1949To1950Age', 'birth1959EstimateAge', 'birth1959AuthorityStatus', 'birthBefore1951AuthorityStatus']) {
    assert.equal(Object.prototype.hasOwnProperty.call(rmd, k), false, k + ' retired');
  }
  const rec = (id) => ((rmd.startAge && rmd.startAge.records) || []).find((r) => r.provision_id === id);
  assert.deepEqual([rec('rmd_start_age_born_before_july_1949').value, rec('rmd_start_age_born_before_july_1949').status], [70.5, 'OFFICIAL_2026']);
  assert.deepEqual([rec('rmd_start_age_born_july_1949_through_1950').value, rec('rmd_start_age_born_july_1949_through_1950').status], [72, 'OFFICIAL_2026']);
  assert.deepEqual([rec('rmd_start_age_born_1959').value, rec('rmd_start_age_born_1959').status], [73, 'PROPOSED_REGULATION']);
});

test('the record-shape list names every rule group exactly once, and no group outside "carries" has records of its own', () => {
  const groups = [];
  for (const top of Object.keys(RULES)) {
    if (top === 'federal' || top === 'retirement') Object.keys(RULES[top]).forEach((k) => groups.push(top + '.' + k));
    else groups.push(top);
  }
  const entries = [...Object.keys(SHAPE.carries), ...Object.keys(SHAPE.pending), ...SHAPE.notYet, ...SHAPE.notParameters];
  for (const g of groups) assert.ok(entries.some((e) => e === g || e.startsWith(g + '.')), g + ' is on the list');
  for (const e of entries) assert.ok(at(e) !== undefined, e + ' exists in RULES');
  for (const e of [...Object.keys(SHAPE.pending), ...SHAPE.notYet]) {
    assert.equal(Array.isArray(at(e).records), false, e + ' has gained records: move it to "carries"');
  }
});

test('the never-overwrite-a-year rule is written beside the rules JSON', () => {
  const i = SHELL.indexOf('<script type="application/json" id="v2b-rules-2026">');
  const before = SHELL.slice(Math.max(0, i - 1200), i);
  assert.ok(before.includes('Do not overwrite a historical tax-year table when a later year is released'), 'the standing rule');
  assert.ok(before.includes('run the regression tests for every supported year'), 'and its regression clause');
  assert.ok(before.includes('tests/rules-record-shape.test.js'), 'and where the list lives');
});

test('control: the capture instrument and the corpus invariant still find and parse the rules JSON with their own pattern', () => {
  for (const tool of ['tools/capture-baseline.js', 'tools/corpus-invariant.js']) {
    const src = fs.readFileSync(path.join(ROOT, tool), 'utf8');
    assert.ok(src.includes(RULES_PATTERN), tool + ' extracts the rules with the pattern this test uses');
  }
  const parsed = JSON.parse(SHELL.match(RULES_RE)[1]);
  assert.equal(typeof parsed.retirement.rmd, 'object');
  assert.equal(parsed.meta.taxYear, 2026);
});

test('control: RMD start ages do not move', () => {
  const startAge = (birthYear) => engine.rmdStartAge({ profile: { age: 2026 - birthYear } });
  assert.deepEqual([1940, 1949, 1950, 1951, 1958, 1959, 1960, 1970].map(startAge), [70.5, 70.5, 72, 73, 73, 73, 75, 75]);
});
