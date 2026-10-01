/* S5AA R43 (the owner 2026-09-30: repair all 34 of Claude's R42F findings) -- THE PLAN-VALUE CONTRACT.
 *
 * SA42F-05, MEASURED at c67c713: R41F-05's defect class survived in at least 25 more fields, untyped or unranged on both sides and
 * silently coerced (a conversion amount of "abc" converted $0; an LTC probability of -10 turned care into income; "Mortgage" carried
 * no housing costs), and six text fields neither side checked.
 * SA42F-06: the engine ran ten plans the validator refused as errors (a stage with only a name spent nothing; healthcare inflation of
 * 150 ran; a fixed loan's payoffAge null forced the whole balance out in a year).
 * SA42F-07: three R35 account flags were outside the boolean-flag contract, and the engine read "true"/"false" strings backwards.
 * SA42F-30 / SA42F-32: a whole-number lifespan equal to the start age was not refused (the person is dead for the whole projected
 * row), and the validator accepted a plan the engine refuses because nobody is alive at the start.
 *
 * src/plan-value-contract.json is read by both layers; this file holds the engine and the validator to it, field by field.
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
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const L = require(path.join(ROOT, 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const CONTRACT = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'plan-value-contract.json'), 'utf8'));

const errors = (p) => validateScenario(JSON.parse(JSON.stringify(p))).issues.filter((i) => i.severity === 'ERROR').map((i) => i.code + '@' + i.path);
const refusal = (p) => { const r = engine.runPlan(JSON.parse(JSON.stringify(p))); return r.status === 'ok' ? null : { code: r.calculationErrorCode, path: ((r.issues || []).find((i) => i.code === r.calculationErrorCode) || { state: {} }).state.path }; };
const at = (o, dotted) => dotted.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
const setAt = (o, dotted, v) => { const ks = dotted.split('.'); const last = ks.pop(); ks.reduce((x, k) => x[k], o)[last] = v; };

// A plan carrying every list the contract names, valid as built.
function rich() {
  const p = L.basePlan({ couple: true, age: 58, retireAge: 62, endAge: 70, salary: 90000, spouseSalary: 40000, spending: 70000, inflation: 2, returnRate: 5,
    healthOn: true, networthOn: true,
    accounts: [L.account('brok', 'taxable', 300000, { basisPct: 60 }), L.account('k', 'traditional401k', 200000, { contribution: 10000, matchOn: true, matchCap: 6, matchRate: 50, profitShare: 1, vesting: 100, yearsOfService: 4 })],
    stages: [{ name: 'slow', start: 66, end: 70, mode: 'amount', value: 50000, growthMode: 'fixed', annualChange: 1 }],
    expenses: [{ name: 'roof', kind: 'expense', age: 66, amount: 20000 }],
    otherIncomes: [{ name: 'rent', type: 'rental', owner: 'self', amount: 10000, start: 60, end: 68, growth: 1, growthMode: 'fixed' }],
    otherAssets: [{ id: 'oa', name: 'land', type: 'realEstate', owner: 'self', value: 100000, growth: 2, available: true, availableAge: 70, liquidity: 'limited', accessPct: 50 }] });
  Object.assign(p.advanced, { healthCost: 12000, healthInflation: 5, debts: [{ id: 'm', name: 'mortgage', type: 'mortgage', owner: 'household', balance: 150000, rate: 6, paymentMonthly: 1500, payoffAge: 75, includePayment: true, rateType: 'fixed' }] });
  return p;
}

test('R43 contract control: the rich plan is valid and runs', () => {
  assert.deepEqual(errors(rich()), []);
  assert.equal(refusal(rich()), null);
});

test('R43 (SA42F-05, SA42F-06): every contract field refuses a bad value in BOTH layers, at its path', () => {
  const problems = [];
  const expectCode = (rule, bad) => (rule.type === 'enum' ? 'SCENARIO_UNKNOWN_PLAN_VALUE' : (typeof bad === 'number' ? 'SCENARIO_PLAN_VALUE_OUT_OF_RANGE' : 'SCENARIO_NONNUMBER_PLAN_VALUE'));
  const badValues = (rule) => (rule.type === 'enum' ? ['__nope__', rule.values[0].toUpperCase() === rule.values[0] ? rule.values[0].toLowerCase() : rule.values[0].toUpperCase()]
    : ['abc', '12', true].concat(rule.nullable ? [] : [null]).concat(rule.min !== undefined ? [rule.min - (rule.minExclusive ? 0 : 1)] : []).concat(rule.max !== undefined ? [rule.max + 1] : []));
  const tryOne = (where, mutate, rule, bad) => {
    const p = rich(); mutate(p, bad);
    const e = errors(p), r = refusal(p);
    if (!e.some((x) => x.endsWith('@' + where))) problems.push(where + ' = ' + JSON.stringify(bad) + ': the validator did not refuse it (' + e.join(', ') + ')');
    if (!r) problems.push(where + ' = ' + JSON.stringify(bad) + ': the engine ran it');
    else if (r.path === where && r.code !== expectCode(rule, bad) && !/^SCENARIO_/.test(r.code)) problems.push(where + ': engine code ' + r.code);
  };
  CONTRACT.scalars.forEach((rule) => {
    badValues(rule).forEach((bad) => tryOne(rule.path, (p, v) => { if (rule.requiredWhen) [].concat(rule.requiredWhen).forEach((w) => setAt(p, w, true)); setAt(p, rule.path, v); }, rule, bad));
  });
  const listIndex = { accounts: 1 };
  CONTRACT.lists.forEach((Lr) => {
    if (!Array.isArray(at(rich(), Lr.list))) return;
    Lr.fields.forEach((f) => badValues(f).forEach((bad) => {
      const i = listIndex[Lr.list] || 0;
      tryOne(Lr.list + '[' + i + '].' + f.name, (p, v) => { at(p, Lr.list)[i][f.name] = v; }, f, bad);
    }));
  });
  assert.deepEqual(problems, []);
});

test('R43 (SA42F-06): a required list field that is absent is refused by both layers', () => {
  const cases = [['retirement.stages[0].start', (p) => { delete p.retirement.stages[0].start; }], ['retirement.expenses[0].amount', (p) => { delete p.retirement.expenses[0].amount; }],
    ['retirement.otherIncomes[0].end', (p) => { delete p.retirement.otherIncomes[0].end; }], ['advanced.healthInflation', (p) => { delete p.advanced.healthInflation; }]];
  for (const [where, f] of cases) {
    const p = rich(); f(p);
    assert.ok(errors(p).some((x) => x.startsWith('MISSING_FIELD@' + where)), where + ': ' + errors(p).join(', '));
    assert.deepEqual(refusal(p), { code: 'SCENARIO_NONNUMBER_PLAN_VALUE', path: where }, where);
  }
  // a one-time income needs no end
  const once = rich(); once.retirement.otherIncomes = [{ name: 'gift', type: 'oneTime', owner: 'self', amount: 5000, start: 63 }];
  assert.deepEqual(errors(once), []);
  assert.equal(refusal(once), null);
});

test('R43 (SA42F-05): the R42F witnesses -- each was valid and ran, each is now refused by both layers', () => {
  const w = [['advanced.conversionAmount', 'abc'], ['employment.contributionStop', 'abc'], ['advanced.qcd', '10,000'], ['advanced.transferAmount', '20,000'],
    ['retirement.selfLife', null], ['advanced.ltcYears', '2'], ['retirement.aime', -1], ['retirement.ssCola', 'abc'], ['advanced.ltcProbability', -10], ['advanced.healthCost', -5000]];
  for (const [where, bad] of w) {
    const p = rich(); setAt(p, where, bad);
    assert.ok(errors(p).some((x) => x.endsWith('@' + where)), where + ': ' + errors(p).join(', '));
    assert.equal((refusal(p) || {}).path, where, where);
  }
  const debt = rich(); debt.advanced.debts[0].type = 'Mortgage';
  assert.deepEqual(refusal(debt), { code: 'SCENARIO_UNKNOWN_PLAN_VALUE', path: 'advanced.debts[0].type' });
  const mode = rich(); mode.accounts[1].annualChangeMode = 'Percent';
  assert.deepEqual(refusal(mode), { code: 'SCENARIO_UNKNOWN_PLAN_VALUE', path: 'accounts[1].annualChangeMode' });
});

test('R43 (SA42F-06): the contract\'s record rules mirror the validator\'s NESTED_RECORD_SPECS', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'scenario-validator.js'), 'utf8');
  const lit = src.slice(src.indexOf('const NESTED_RECORD_SPECS = {') + 'const NESTED_RECORD_SPECS = '.length);
  const INCOME_TYPES = [];   // the spec's income type list is the validator's alone (the corpus keeps a legacy "recurring" type)
  // eslint-disable-next-line no-new-func
  const spec = new Function('INCOME_TYPES', 'return ' + lit.slice(0, lit.indexOf('\n};') + 2))(INCOME_TYPES);
  for (const [key, list] of [['stages', 'retirement.stages'], ['expenses', 'retirement.expenses'], ['otherIncomes', 'retirement.otherIncomes']]) {
    const entry = CONTRACT.lists.find((x) => x.list === list), names = entry.fields.map((f) => f.name);
    spec[key].numeric.forEach((n) => assert.ok(entry.fields.some((f) => f.name === n && f.type === 'number'), key + '.' + n + ' numeric'));
    spec[key].required.filter((n) => n !== 'type').forEach((n) => assert.ok(entry.fields.some((f) => f.name === n && f.required), key + '.' + n + ' required'));
    (spec[key].requiredUnlessOneTime || []).forEach((n) => assert.ok(entry.fields.some((f) => f.name === n && f.requiredUnlessType), key + '.' + n + ' unless one-time'));
    Object.entries(spec[key].enums).filter(([n]) => n !== 'type').forEach(([n, vals]) => {
      const f = entry.fields.find((x) => x.name === n);
      assert.ok(f && f.type === 'enum', key + '.' + n + ' enum');
      assert.deepEqual([...f.values].sort(), [...vals].sort(), key + '.' + n + ' values');
    });
    assert.ok(names.length > 0);
  }
});

test('R43 (SA42F-07): fivePercentOwner, spouseSoleBeneficiary and currentEmployerPlan are boolean flags in both layers', () => {
  for (const k of ['fivePercentOwner', 'spouseSoleBeneficiary', 'currentEmployerPlan']) {
    for (const bad of ['true', 'false', 1, null]) {
      const p = rich(); p.accounts[1][k] = bad;
      assert.ok(errors(p).includes('WRONG_TYPE@accounts[1].' + k), k + ' ' + JSON.stringify(bad) + ': ' + errors(p).join(', '));
      assert.equal(refusal(p).code, 'SCENARIO_NONBOOLEAN_FLAG', k + ' ' + JSON.stringify(bad));
    }
    const ok = rich(); ok.accounts[1][k] = false;
    assert.equal(refusal(ok), null, k + ' false runs');
  }
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'boolean-flag-contract.json'), 'utf8'));
  for (const k of ['fivePercentOwner', 'spouseSoleBeneficiary', 'currentEmployerPlan']) assert.ok(contract.flags.some((f) => f.path === 'accounts[].' + k && f.reader === 'engine'), k);
});

test('R43 (SA42F-30, SA42F-32): a lifespan equal to the start age leaves nobody alive -- refused by both layers', () => {
  const p = L.basePlan({ age: 85, endAge: 95, spending: 30000, accounts: [L.account('brok', 'taxable', 500000, { basisPct: 100 })] });
  p.retirement.selfLife = 85;
  assert.ok(errors(p).some((x) => x.startsWith('NOBODY_ALIVE_AT_START@')), errors(p).join(', '));
  assert.equal(refusal(p).code, 'SCENARIO_NOBODY_ALIVE_AT_START');
  p.retirement.selfLife = 85.5;
  assert.deepEqual(errors(p), []);
  assert.equal(refusal(p), null);
  // a couple: one alive at the start is enough
  const c = L.basePlan({ couple: true, age: 85, spouseAge: 80, endAge: 95, spending: 30000, accounts: [L.account('brok', 'taxable', 500000, { basisPct: 100 })] });
  c.retirement.selfLife = 85;
  assert.equal(refusal(c), null);
});
