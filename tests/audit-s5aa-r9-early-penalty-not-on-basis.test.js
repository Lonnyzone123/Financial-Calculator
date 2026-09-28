/* S5AA R9 round, the owner's decision 4 (2026-09-21): THE 10% ADDITIONAL TAX IS NOT CHARGED ON IRA BASIS.
 *
 * IRC 72(t)(1) adds 10% of "the portion of such amount which is includible in gross income". A traditional IRA's
 * nondeductible basis comes back tax-free (Form 8606), so it is not includible and bears no additional tax. The engine
 * charged the rate on the GROSS draw in three places that must agree (finding N5 of the R6 round, citation check 23):
 * the draw itself (withdrawFromAccountList()), the tax quote's per-piece penalty slope, and the pre-tax-to-taxable
 * transfer. All three now charge it on the includible part only, so the quote and the commit still agree.
 *
 * Fixture (as the R6 basis file builds it; the engine has no opening-basis input): a single filer earning $200,000,
 * covered by a workplace plan through a $1 Roth 401(k) deferral, puts a wholly nondeductible $7,500 into a $7,500 IRA
 * in the one working year (the row opening at 45). At 46 the IRA holds $15,000, half of it basis, so every dollar out
 * is 50% includible. Returns and inflation are zero; after retirement there is no other income, so income tax is zero
 * (the includible part is far below the standard deduction) and the row's tax IS the additional tax.
 * Rows are labelled by the age at which they END. Tested through runPlan only.
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
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const acct = (id, type, taxClass, balance, extra) => Object.assign({
  id, name: id, type, taxClass, owner: 'self', balance, basisPct: taxClass === 'taxable' ? 100 : 0,
  contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100, priority: 1,
}, extra || {});

function run({ spending = 0, transfer = 0, iraContribution = 7500, source = 'ira' }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 45, retireAge: 46, endAge: 47, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 200000, spouseSalary: 0, growth: 0, contributionStop: 46 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false,
    stages: [], expenses: [], otherIncomes: [], selfLife: 95, withdrawalOrder: 'manual',
    /* A transfer case pays its tax from the cash the transfer delivered (taxable first, full basis), so no second
       IRA draw adds a penalty of its own; a spending case draws the IRA first. */
    manualOrder: transfer > 0 ? 'taxable,preTax,roth,hsa' : 'preTax,taxable,roth,hsa',
  });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, penaltyException: false, rule55: false, qcd: 0, debts: [], otherAssets: [],
    transferOn: transfer > 0, transferAge: 46, transferFrom: source, transferTo: 'cash', transferAmount: transfer });
  p.accounts = [
    acct('ira', 'traditionalIRA', 'preTax', 7500, { contribution: iraContribution, priority: 1 }),
    acct('k401', 'traditional401k', 'preTax', source === 'k401' ? 15000 : 0, { priority: 2 }),
    acct('r401', 'roth401k', 'roth', 0, { contribution: 1, priority: 8 }),
    acct('cash', 'taxable', 'taxable', 0, { priority: 9 }),
  ];
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode + ' ' + JSON.stringify((r.issues || []).filter((i) => i.severity === 'ERROR')));
  return r;
}
const taxes = (r, label) => Number(r.rows.find((x) => x.age === label).taxes);
const near = (a, e, what) => assert.ok(Math.abs(a - e) < 0.01, what + ': got ' + a + ', expected ' + e);

test('decision 4: a $10,000 transfer from a half-basis IRA to taxable bears 10% of the $5,000 includible, not of $10,000', () => {
  near(taxes(run({ transfer: 10000 }), 47), 500, 'the additional tax on the includible half');
});

test('decision 4: a spending draw from a half-basis IRA is charged 10% of its includible half -- quote and commit agree', () => {
  /* The draw W pays $10,000 of spending and its own additional tax: W - 0.10 x 0.5 W = 10,000. The run's status 'ok'
     is the agreement: the committed tax must match the quote, or the row reports a settlement mismatch. */
  const W = 10000 / (1 - 0.10 * 0.5);
  near(taxes(run({ spending: 10000 }), 47), W - 10000, 'the additional tax, grossed up once, on the includible half');
});

test('decision 4 control: with no basis, the whole draw is includible and the whole draw is charged', () => {
  const W = 10000 / (1 - 0.10);
  near(taxes(run({ spending: 10000, iraContribution: 0, source: 'k401' }), 47), W - 10000, 'unchanged: 10% of the gross');
  near(taxes(run({ transfer: 10000, source: 'k401', iraContribution: 0 }), 47), 1000, 'a 401(k) transfer: 10% of the gross, unchanged');
});
