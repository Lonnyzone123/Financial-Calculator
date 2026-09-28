/* S5AA R9 round, the owner's decision 10 (2026-09-21): A TRADITIONAL IRA CONVERTS ONLY INTO A ROTH IRA.
 *
 * The IRS rollover chart: traditional IRA to a designated Roth account (a Roth 401(k)) -- "No". A conversion out of an
 * IRA is a rollover contribution to a Roth IRA (IRC 408A(d)(3)); a designated Roth account accepts in-plan rollovers of
 * the plan's own money (IRC 402A(c)(4)), not an IRA's. conversionRoutes() sent each pre-tax source to its owner's
 * lowest-priority Roth account of ANY type, so a traditional IRA was "converted" into a Roth 401(k) (finding N6, recorded in
 * the R6 repair round; citation check 24).
 *
 * Now: a traditional IRA's destination must be a Roth IRA, or a custom tax-free account (decision 3b: a custom account
 * is treated as an IRA of its tax class). An employer plan's pre-tax money (traditional 401(k)) may still go to its
 * owner's Roth 401(k) or Roth IRA, and a custom tax-deferred account to any Roth account, as before. An IRA whose owner
 * has no eligible destination converts nothing -- ownership stays a condition, as Q97 made it.
 *
 * Public route: whether a conversion happens, read as the rise in the roth class (rows carry class totals only). The
 * choice between two Roth accounts is read from conversionRoutes() itself, the one function that makes it.
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

const acct = (id, type, taxClass, balance, priority, owner = 'self') => ({ id, name: id, type, taxClass, owner, balance, basisPct: 0,
  contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
  futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority });
const ira = (p = 1) => acct('ira', 'traditionalIRA', 'preTax', 100000, p);
const k401 = (p = 1) => acct('k401', 'traditional401k', 'preTax', 100000, p);
const custTrad = (p = 1) => acct('custTrad', 'customTraditional', 'preTax', 100000, p);
const roth401 = (p) => acct('roth401', 'roth401k', 'roth', 0, p);
const rothIra = (p) => acct('rothIra', 'rothIRA', 'roth', 0, p);
const custRoth = (p) => acct('custRoth', 'customRoth', 'roth', 0, p);

function plan(accounts) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 65, retireAge: 65, endAge: 66, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, stages: [], expenses: [], otherIncomes: [], ssBenefit: 0, spouseSS: 0 });
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: true, conversionAmount: 10000, qcd: 0, healthOn: false, debts: [], otherAssets: [] });
  p.accounts = accounts;
  return p;
}
function rothGain(accounts) {
  const r = engine.runPlan(plan(accounts));
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return Number(r.rows[1].roth) - Number(r.rows[0].roth);
}
const destinationsOf = (accounts) => engine.conversionRoutes(accounts, plan(accounts), 0).map((r) => r.source.id + '->' + r.destination.id);

test('decision 10: a traditional IRA whose owner has only a Roth 401(k) converts nothing', () => {
  assert.equal(rothGain([ira(), roth401(2)]), 0, 'an IRA cannot roll into a designated Roth account');
});

test('decision 10: a traditional IRA converts into its owner\'s Roth IRA, even when a Roth 401(k) has the lower priority', () => {
  assert.equal(rothGain([ira(), roth401(2), rothIra(3)]), 10000);
  assert.deepEqual(destinationsOf([ira(), roth401(2), rothIra(3)]), ['ira->rothIra']);
});

test('decision 10: a custom tax-free account is an IRA-class destination (decision 3b)', () => {
  assert.equal(rothGain([ira(), custRoth(2)]), 10000);
});

test('decision 10 control: a traditional 401(k) still converts into its owner\'s Roth 401(k) -- an in-plan Roth rollover', () => {
  assert.equal(rothGain([k401(), roth401(2)]), 10000);
  assert.deepEqual(destinationsOf([k401(), roth401(2), rothIra(3)]), ['k401->roth401'], 'unchanged: the lowest priority Roth');
});

test('decision 10 control: a custom tax-deferred account converts into any Roth account, as before', () => {
  assert.equal(rothGain([custTrad(), roth401(2)]), 10000);
});

test('decision 10: in one household the IRA and the 401(k) each take their own lawful destination', () => {
  assert.deepEqual(destinationsOf([ira(1), k401(2), roth401(3), rothIra(4)]).sort(), ['ira->rothIra', 'k401->roth401']);
});

/* A conversion the household asked for and the rule refused is not silent: CONVERSION_IRA_NEEDS_ROTH_IRA, raised once,
   from what the row actually did -- the request was not met and a traditional IRA with money had no Roth IRA of its
   owner to go to. */
const CODE = 'CONVERSION_IRA_NEEDS_ROTH_IRA';
const warned = (accounts) => (engine.runPlan(plan(accounts)).issues || []).filter((i) => i.code === CODE);
test('decision 10: a refused IRA conversion is disclosed, once', () => {
  const w = warned([ira(), roth401(2)]);
  assert.equal(w.length, 1);
  assert.equal(w[0].severity, 'WARNING');
});
test('decision 10 control: nothing to disclose when the IRA has a Roth IRA, or when the request is met from a 401(k)', () => {
  assert.equal(warned([ira(), rothIra(2)]).length, 0);
  assert.equal(warned([k401(1), ira(2), roth401(3)]).length, 0, 'the 401(k) meets the $10,000; nothing was refused');
});
