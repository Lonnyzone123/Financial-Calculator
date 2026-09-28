/* S5, the owner's question 1 answered (C), 2026-09-14 (UTC−7, late night): delete the uncalled taxWithdrawalGrossRate().
 *
 * The function priced a gross-up sale at one assumed marginal rate. R2-T01 replaced that live cascade with
 * quoteTaxFunding()'s exact piecewise walk, after which nothing called it: only its own definition, the engine's
 * exports, the Worker's function list, and about a dozen tests that exercised it directly. Those tests go with it,
 * except R2-T01-A, which now reproduces the old formula itself as evidence of why the exact solver exists.
 *
 * The live solver's answer to the counterexample the old rate missed is held here as a control.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SHELL = read('src/app-shell.html');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));

test('the uncalled taxWithdrawalGrossRate() is no longer exported by the engine', () => {
  assert.equal(engine.taxWithdrawalGrossRate, undefined);
});

test('no source defines taxWithdrawalGrossRate() or ships it to the Worker', () => {
  assert.equal(/function\s+taxWithdrawalGrossRate\s*\(/.test(read('src/engine.js')), false, 'no definition in src/engine.js');
  const workerList = SHELL.match(/var workerFunctions=\[([^\]]*)\]/);
  assert.ok(workerList, 'the Worker function list is found');
  assert.equal(/\btaxWithdrawalGrossRate\b/.test(workerList[1]), false, 'not in the Worker function list');
});

test('control: the live funding solver funds the mixed-basis counterexample exactly, where the old assumed rate left $157.50 unfunded', () => {
  const p = { profile: { filing: 'single', age: 64, spouseOn: false, spouseAge: 64 }, retirement: { withdrawalOrder: 'priority', manualOrder: 'taxable,preTax,roth,hsa' }, advanced: { assetsOn: false, reserveOn: false, penaltyException: false, rule55: false } };
  const accounts = [
    { id: 'a', taxClass: 'taxable', balance: 100, basisPct: 100, priority: 1 },
    { id: 'b', taxClass: 'taxable', balance: 100000, basisPct: 0, priority: 2 },
  ];
  const T0 = engine.estimateTaxes(p, 64, 80000, 0, 0, 0, 0, 0).total;
  const ctx = { ordinaryIncome: 80000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0, filing: 'single', seniorAges: [64, -1], Tbase: T0 - 1000, payrollConst: 0, penalties: 0, penaltyApplies: false };
  const quote = engine.quoteTaxFunding(ctx, ['taxable'], accounts, p, 0, 0);
  assert.equal(quote.status, 'funded');
  const raised = quote.transactions.reduce((s, t) => s + t.gross, 0);
  const real = engine.estimateTaxes(p, 64, quote.finalOrdinaryIncome, quote.finalCapitalGains, 0, 0, 0, 0).total;
  assert.ok(Math.abs(raised - (Math.max(0, real - ctx.Tbase) + quote.finalPenalties)) <= 0.01, 'raised ' + raised);
});
