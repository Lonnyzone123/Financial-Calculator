/* S5AA R29: PCF-03 -- THE DATED DIVIDEND ADJUSTMENT HOLDS FOR EVERY ACCOUNT ID THE VALIDATOR ACCEPTS (ChatGPT's PCF full-model
 * audit of 8396626, 2026-09-28, P2; the owner 2026-09-28: "Repair").
 *
 * R28.1 split a transfer's dividends between the account that held the dollars before its date and the one after, through two
 * maps keyed by account id (heldReinvest, heldPaid). They were plain objects, so an id of "__proto__" wrote the prototype
 * instead of a key: the own-key read then missed, and the account was paid a whole row on dollars it held for part of one.
 * ChatGPT's witness: $300,000 moved at 60.5 from a Roth IRA into an empty taxable account named "__proto__", 10% yield, 0%
 * return -- $30,000 of dividends where the half year it held them is $15,000 (reproduced at 8396626 and at the private
 * source's ee9757d). Now both maps have no prototype, as the engine's other id-keyed maps already did (R14).
 *
 * Hand arithmetic at a 0% return, no other income: dollars x 10% x the part of the year the eligible (taxable) account held
 * them. Monthly timing draws the year's spending at 60.5, so a transfer at 60.75 runs after the draw and its SOURCE holds
 * the dollars first (R28.1's late path, keyed by the source's id).
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

const IDS = ['plain', '__proto__', 'constructor', 'toString', 'hasOwnProperty'];
const acct = (id, type, taxClass, balance, priority) => ({ id, name: 'account ' + priority, type, taxClass, owner: 'self', balance,
  basisPct: taxClass === 'taxable' ? 100 : 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
  frequency: 1, changeTiming: 'year', futureChanges: [], allocation: { flat: 100 }, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100, priority });

/* $300,000 moves at `at` between a Roth IRA and a taxable account; `taxableId` names the taxable one. */
function row({ taxableId, taxableIsSource, at, dividendStart }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 61, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 10, dividendGrowth: 0, dividendStart,
    pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [] });
  const roth = acct('roth', 'rothIRA', 'roth', taxableIsSource ? 0 : 300000, 1);
  const taxable = acct(taxableId, 'taxable', 'taxable', taxableIsSource ? 300000 : 0, 2);
  const [from, to] = taxableIsSource ? [taxable, roth] : [roth, taxable];
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, networthOn: true, otherAssets: [], debts: [], assetsOn: true,
    assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }],
    transferOn: true, transferFrom: from.id, transferTo: to.id, transferAmount: 300000, transferAge: at, penaltyException: true });
  p.accounts = [roth, taxable];
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, 'a valid plan for id ' + taxableId + ': ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.deepEqual((r.issues || []).filter((i) => i.severity === 'ERROR').map((i) => i.code), [], 'no error of any kind');
  return r.rows[1];
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);

test('PCF-03: a taxable DESTINATION receiving $300,000 at 60.5 is paid half a year of 10% -- $15,000 under every accepted id (was $30,000 for "__proto__")', () => {
  for (const id of IDS) {
    const r = row({ taxableId: id, taxableIsSource: false, at: 60.5, dividendStart: 60 });
    near(r.dividends, 15000, 'the dividends for id ' + id);
    near(r.federalAgi, 15000, 'the AGI for id ' + id);
  }
});

test('PCF-03: a taxable SOURCE sending $300,000 at 60.75, after the draw, is paid the three quarters it held -- $22,500 under every accepted id', () => {
  for (const id of IDS) near(row({ taxableId: id, taxableIsSource: true, at: 60.75, dividendStart: 60 }).dividends, 22500, 'the dividends for id ' + id);
});

test('PCF-03: REINVESTED dividends follow the same split -- a destination at 60.5 with dividends paid from 65 is taxed on $15,000 reinvested under every accepted id', () => {
  for (const id of IDS) {
    const r = row({ taxableId: id, taxableIsSource: false, at: 60.5, dividendStart: 65 });
    near(r.dividends, 0, 'nothing is paid out for id ' + id);
    near(r.federalAgi, 15000, 'the reinvested dividends in AGI for id ' + id);
  }
});

test('PCF-03 CONTROL: a transfer at the year\'s opening pays the whole year, $30,000, under every accepted id', () => {
  for (const id of IDS) near(row({ taxableId: id, taxableIsSource: false, at: 60, dividendStart: 60 }).dividends, 30000, 'the dividends for id ' + id);
});
