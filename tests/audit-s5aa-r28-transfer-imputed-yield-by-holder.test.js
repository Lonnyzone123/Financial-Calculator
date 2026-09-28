/* S5AA R28.1: R27F-02 WITH DIVIDENDS OFF -- THE IMPUTED 1.5% YIELD ON A TRANSFER'S DOLLARS BELONGS TO WHICHEVER ACCOUNT HELD
 * THEM (found in R28.1's self-audit, beside ChatGPT's R27F-02; the owner 2026-09-26: "Repair").
 *
 * With dividends off, a taxable account is taxed on an imputed 1.5% yield retained inside its return (Q105), figured on its
 * balance for the whole row after any transfer. So a taxable account receiving $300,000 at 60.5 was taxed on a year of it
 * ($4,500) and a taxable source on none of what it held until then -- the same whole-row base ChatGPT found for paid
 * dividends in R27F-02. Now the moved dollars count for the source before the date and the destination after it, each only
 * if it is taxable. Hand arithmetic at 0% returns: dollars x 1.5% x the part of the year held, read through AGI (nothing
 * else is income).
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

const acct = (id, type, taxClass, balance, priority) => ({ id, name: id, type, taxClass, owner: 'self', balance,
  basisPct: taxClass === 'taxable' ? 100 : 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
  frequency: 1, changeTiming: 'year', futureChanges: [], allocation: { flat: 100 }, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100, priority });
const ROTH = ['rothIRA', 'roth'], TAXABLE = ['taxable', 'taxable'];

function agi(from, to, at) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 61, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, dividendYield: 0, pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [] });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, networthOn: true, otherAssets: [], debts: [], assetsOn: true,
    assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }],
    transferOn: true, transferFrom: 'src', transferTo: 'dest', transferAmount: 300000, transferAge: at, penaltyException: true });
  p.accounts = [acct('src', from[0], from[1], 300000, 2), acct('dest', to[0], to[1], 0, 1)];
  assert.equal(validateScenario(JSON.parse(JSON.stringify(p))).valid, true);
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.deepEqual((r.issues || []).filter((i) => i.severity === 'ERROR').map((i) => i.code), []);
  return r.rows[1].federalAgi;
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);

test('imputed yield: a taxable account receiving $300,000 at 60.5 is taxed on half a year of 1.5% -- $2,250 (was $4,500)', () => {
  near(agi(ROTH, TAXABLE, 60.5), 2250, 'the AGI');
});

test('imputed yield: a taxable account sending $300,000 at 60.5 is taxed on the half year it held it -- $2,250 (was $0)', () => {
  near(agi(TAXABLE, ROTH, 60.5), 2250, 'the AGI');
});

test('imputed yield: after the draw, at 60.75, a taxable destination is taxed on a quarter year -- $1,125 (was $4,500)', () => {
  near(agi(ROTH, TAXABLE, 60.75), 1125, 'the AGI');
});

test('imputed yield CONTROL: taxable to taxable at 60.5 is taxed on the whole year between the two -- $4,500', () => {
  near(agi(TAXABLE, TAXABLE, 60.5), 4500, 'the AGI');
});

test('imputed yield CONTROL: a transfer at the year\'s opening is unchanged -- Roth to taxable at 60, $4,500', () => {
  near(agi(ROTH, TAXABLE, 60), 4500, 'the AGI');
});
