/* S5AA R29: A TRANSFER INTO A 401(k) FROM A DIFFERENT KIND OF ACCOUNT IS REFUSED (decided with ChatGPT's PCF-02, 2026-09-28; the
 * owner 2026-09-28: "Refuse it").
 *
 * Money reaches a workplace plan through payroll deferrals, a rollover from a plan or IRA of the same tax character, or a
 * conversion to the owner's own Roth account. The one-time transfer moved any account into a 401(k) with no limit and no
 * tax: the private corpus's seed:9 moved $23,350.60 from an HSA into a traditional 401(k) at 59, three years after
 * retiring. Now the validator refuses such a plan (TRANSFER_INTO_WORKPLACE_PLAN) and the engine, which does not call the
 * validator, moves nothing and says why (TRANSFER_INTO_WORKPLACE_REFUSED), as it already does for an unlawful conversion.
 * A same-character move (traditional IRA to traditional 401(k)) and a lawful conversion (traditional 401(k) to the owner's
 * own Roth 401(k)) are unchanged.
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
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const CLASS = { taxable: 'taxable', hsa: 'hsa', rothIRA: 'roth', traditionalIRA: 'preTax', traditional401k: 'preTax', roth401k: 'roth' };
const acct = (id, type, balance, priority) => ({ id, name: id, type, taxClass: CLASS[type], owner: 'self', balance,
  basisPct: type === 'taxable' ? 100 : 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
  frequency: 1, changeTiming: 'year', futureChanges: [], allocation: { flat: 100 }, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100, priority });

/* $10,000 moves at 60 from a `fromType` account holding $10,000 into an empty `toType` account; 0% returns, no spending. */
function plan(fromType, toType) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 61, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    survivor: false, stages: [], expenses: [], otherIncomes: [] });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, networthOn: true, otherAssets: [], debts: [], assetsOn: true,
    assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }],
    transferOn: true, transferFrom: 'from', transferTo: 'to', transferAmount: 10000, transferAge: 60, penaltyException: true });
  p.accounts = [acct('from', fromType, 10000, 1), acct('to', toType, 0, 2)];
  return p;
}
function run(p) {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  const row = r.rows[1];
  return { r, row, codes: (r.issues || []).map((i) => i.code) };
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);
const REFUSED = [['taxable', 'traditional401k'], ['hsa', 'traditional401k'], ['rothIRA', 'traditional401k'], ['taxable', 'roth401k'],
  ['hsa', 'roth401k'], ['traditionalIRA', 'roth401k']];

test('R29: the engine moves nothing into a 401(k) from a different kind of account, and says why', () => {
  for (const [from, to] of REFUSED) {
    const x = run(plan(from, to));
    near(x.row[CLASS[to]], CLASS[from] === CLASS[to] ? 10000 : 0, from + ' -> ' + to + ': the 401(k) receives nothing');
    near(x.row[CLASS[from]], 10000, from + ' -> ' + to + ': the source keeps its $10,000');
    /* With dividends off a taxable account is taxed on an imputed 1.5% yield (Q105): $150 on the $10,000 a taxable source keeps. */
    near(x.row.federalAgi, from === 'taxable' ? 150 : 0, from + ' -> ' + to + ': no income beyond the kept account\'s own');
    assert.ok(x.codes.includes('TRANSFER_INTO_WORKPLACE_REFUSED') || (from === 'traditionalIRA' && x.codes.includes('TRANSFER_CONVERSION_REFUSED')),
      from + ' -> ' + to + ': the refusal is recorded (' + x.codes.join(', ') + ')');
  }
});

test('R29: the validator refuses such a plan -- TRANSFER_INTO_WORKPLACE_PLAN at advanced.transferTo -- and only while the transfer is on', () => {
  for (const [from, to] of REFUSED.filter(([f]) => f !== 'traditionalIRA')) {
    const p = plan(from, to);
    const v = validateScenario(JSON.parse(JSON.stringify(p)));
    assert.equal(v.valid, false, from + ' -> ' + to + ' is refused');
    assert.deepEqual(v.issues.filter((i) => i.severity === 'ERROR').map((i) => i.code + '@' + i.path), ['TRANSFER_INTO_WORKPLACE_PLAN@advanced.transferTo']);
    p.advanced.transferOn = false;
    assert.equal(validateScenario(JSON.parse(JSON.stringify(p))).valid, true, from + ' -> ' + to + ' with the transfer off is valid');
  }
});

test('R29 CONTROL: a traditional IRA to a traditional 401(k) (same character) still moves, untaxed', () => {
  const p = plan('traditionalIRA', 'traditional401k');
  assert.equal(validateScenario(JSON.parse(JSON.stringify(p))).valid, true);
  const x = run(p);
  near(x.row.preTax, 10000, 'the pre-tax class holds the $10,000');
  assert.equal(x.codes.includes('TRANSFER_INTO_WORKPLACE_REFUSED'), false);
  near(x.row.federalAgi, 0, 'no income');
});

test('R29 CONTROL: a traditional 401(k) to the owner\'s own Roth 401(k) is still a conversion -- it moves and $10,000 is income', () => {
  const p = plan('traditional401k', 'roth401k');
  assert.equal(validateScenario(JSON.parse(JSON.stringify(p))).valid, true);
  const x = run(p);
  near(x.row.roth, 10000, 'the Roth 401(k) receives the conversion');
  near(x.row.preTax, 0, 'the traditional 401(k) is empty');
  near(x.row.federalAgi, 10000, 'the conversion is income');
  assert.equal(x.codes.includes('TRANSFER_INTO_WORKPLACE_REFUSED'), false);
});

test('R29 PIN: the validator\'s workplace-plan types are exactly the engine\'s workplace limit group', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'scenario-validator.js'), 'utf8');
  const m = src.match(/const WORKPLACE_PLAN_TYPES = \[([^\]]*)\];/);
  assert.ok(m, 'CONTROL: the validator declares WORKPLACE_PLAN_TYPES');
  const validatorTypes = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).sort();
  const engineTypes = Object.keys(engine.ACCOUNT_TYPES).filter((k) => engine.ACCOUNT_TYPES[k].limitGroup === 'workplace').sort();
  assert.ok(engineTypes.length >= 2, 'CONTROL: the engine has workplace types');
  assert.deepEqual(validatorTypes, engineTypes);
});
