/* S5 task 5a, decided 2026-09-14 by owner (answer 2 (A) to task 5's FAILs): the RMD start age for owners born before
 * 1951, and the authority status the 1959 row carries. ACCOUNT_RULES_ENGINE_REFERENCE_2026.md section 17, Tests 3 and
 * 4, and section 18's tenth invariant.
 *
 * The engine holds an age, not a birth date: a birth year is 2026 minus the whole age. 1949 is read as before July 1949
 * (age 70.5), and 1950 as July 1949 through 1950 (age 72). Statuses come from src/authority-status-vocabulary.json,
 * which maps ACCOUNT's final_regulation onto OFFICIAL_2026.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');
const vocabulary = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'authority-status-vocabulary.json'), 'utf8'));
const startAge = (birthYear) => engine.rmdStartAge({ profile: { age: 2026 - birthYear } });

/* One single retiree with RMDs on or off, a $1,000,000 IRA and nothing else; zero returns and inflation. */
const plan = (age, rmdOn, endAge) => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age, retireAge: 60, endAge, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 30000, ssBenefit: 0, spouseSS: 0, pension: 0, otherIncomes: [], stages: [], expenses: [], dividendOn: false });
  Object.assign(p.advanced, { rmdOn, qcd: 0, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = [{ id: 'ira', name: 'IRA', owner: 'self', type: 'traditionalIRA', taxClass: 'preTax', balance: 1000000, basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  return p;
};
const proposed = (result) => (result.issues || []).filter((i) => i.code === 'PROPOSED_RULE_USED');

test('RMD start age: an owner born before July 1949 starts at 70.5', () => {
  assert.equal(startAge(1949), 70.5, 'born 1949, read as before July');
  assert.equal(startAge(1940), 70.5, 'born 1940');
});

test('RMD start age: an owner born from July 1949 through 1950 starts at 72', () => {
  assert.equal(startAge(1950), 72);
});

test('RMD start age: the 1951 to 1958, 1959 and 1960-or-later rows are unchanged', () => {
  assert.equal(startAge(1951), 73);
  assert.equal(startAge(1958), 73);
  assert.equal(startAge(1959), 73);
  assert.equal(startAge(1960), 75);
  assert.equal(startAge(1970), 75);
});

test('RMD rules: the 1959 row carries PROPOSED_REGULATION and PROPOSED_RULE_USED, and the rows before 1951 carry OFFICIAL_2026, each in the pinned vocabulary', () => {
  const rmd = RULES.retirement.rmd;
  const statuses = vocabulary.values.map((v) => v.status);
  // S5 task 12.1: the statuses live on the start-age records.
  const status = (id) => rmd.startAge.records.find((r) => r.provision_id === id).status;
  assert.equal(status('rmd_start_age_born_1959'), 'PROPOSED_REGULATION');
  assert.equal(rmd.birth1959WarningCode, 'PROPOSED_RULE_USED');
  for (const id of ['rmd_start_age_born_before_july_1949', 'rmd_start_age_born_july_1949_through_1950']) assert.equal(status(id), vocabulary.accountMapping.final_regulation, id + ': final_regulation, as the vocabulary maps it');
  for (const s of rmd.startAge.records.map((r) => r.status)) assert.ok(statuses.includes(s), s + ' is a pinned status');
  const row = vocabulary.values.find((v) => v.status === 'PROPOSED_REGULATION');
  assert.ok(row.treatment.includes(rmd.birth1959WarningCode), 'the warning code is the one the vocabulary names');
});

test('runPlan(): a 1959-born owner with RMDs on gets one PROPOSED_RULE_USED warning that names the proposed row', () => {
  const result = engine.runPlan(plan(2026 - 1959, true, 90));
  assert.equal(result.status, 'ok');
  const found = proposed(result);
  assert.equal(found.length, 1, JSON.stringify((result.issues || []).map((i) => i.code)));
  assert.equal(found[0].severity, 'WARNING');
  assert.equal(found[0].state.path, 'profile.age');
  assert.equal(found[0].state.rmdStartAge, 73);
  assert.equal(found[0].state.authorityStatus, 'PROPOSED_REGULATION');
});

test('runPlan(): no PROPOSED_RULE_USED when RMDs are off, for a 1958 or 1960 owner, or when the plan ends before 73', () => {
  assert.equal(proposed(engine.runPlan(plan(2026 - 1959, false, 90))).length, 0, 'RMDs off');
  assert.equal(proposed(engine.runPlan(plan(2026 - 1958, true, 90))).length, 0, 'born 1958');
  assert.equal(proposed(engine.runPlan(plan(2026 - 1960, true, 90))).length, 0, 'born 1960');
  assert.equal(proposed(engine.runPlan(plan(2026 - 1959, true, 72))).length, 0, 'ends at 72');
});

test('rmdFor(): an owner born before 1951 is already past every start age, so the required distribution is the balance over the divisor', () => {
  for (const birthYear of [1940, 1949, 1950]) {
    const age = 2026 - birthYear;
    const p = { profile: { age }, advanced: { rmdOn: true } };
    const divisor = RULES.retirement.rmd.uniformLifetime[String(age)];
    assert.ok(divisor, 'a divisor exists at ' + age);
    /* S5AA task 4.2 (Q90): rmdFor() returns {total, obligations}. The claim is unchanged -- an owner
       this old is past every start age, so the whole balance is divided -- and it now also pins that
       the amount is owed by ONE account, which is what makes it payable only from that account. */
    const rmd = engine.rmdFor([{ taxClass: 'preTax', balance: 500000 }], age, p);
    assert.ok(Math.abs(rmd.total - 500000 / divisor) < 1e-9, 'born ' + birthYear);
    assert.equal(rmd.obligations.length, 1, 'born ' + birthYear + ': one account, one obligation');
    assert.ok(Math.abs(rmd.obligations[0].amount - 500000 / divisor) < 1e-9, 'born ' + birthYear);
  }
});
