/* S5AA R37 (SA32F-54 and the RESULT_CONTRACT part of SA32F-48; Claude's R32F full-model audit, confirmed by ChatGPT's R32V) --
 * STALE TEXTS THAT DESCRIBE THE RESULT, CORRECTED AND HELD TO WHAT THE ENGINE AND THE APP DO.
 *
 * R32V SA32F-54: "revolving-debt text says universal 2% while a card's own minimum is used; CSV and Monte Carlo field counts say
 * 21 where 26 are emitted. Successful key checks do not validate those descriptions. Update active wording and counts."
 * R32V SA32F-48: the opening-row insurance "is implemented"; RESULT_CONTRACT.md's C6 rows still called it pending.
 * Each count below is computed from a live run or from the app's own header list, not copied, so the text cannot drift again
 * without this test failing. (FEATURES.md and MODEL_ASSUMPTIONS.md section 8 are eb's; their corrections go in the relay.) */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');
const CONTRACT = fs.readFileSync(path.join(ROOT, 'RESULT_CONTRACT.md'), 'utf8');
const CONTRACT_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'result-contract.json'), 'utf8'));

function plan(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 62, endAge: 70, filing: 'single', spouseOn: false });
  p.accounts = [{ id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 800000, basisPct: 100, contribution: 0 }];
  edit(p);
  return p;
}

test('R37 SA32F-54: RESULT_CONTRACT.md states the Monte Carlo row\'s field count that a run emits', () => {
  const r = engine.runPlan(plan((p) => { p.assumptions.method = 'monteCarlo'; p.assumptions.runs = 100; }));
  const financial = Object.keys(r.rows[1]).filter((k) => !['age', 'q10', 'q90', 'calculationError'].includes(k));
  const stated = CONTRACT.match(/### Monte Carlo rows\s+Every row carries `age`, the (\d+) financial fields/);
  assert.ok(stated, 'the Monte Carlo rows paragraph does not state a financial-field count');
  assert.strictEqual(Number(stated[1]), financial.length, 'the contract says ' + stated[1] + '; a run emits ' + financial.length);
  for (const k of financial) assert.ok(CONTRACT.includes('`' + k + '`'), k + ' is emitted but not named');
});

test('R37 SA32F-54: the JSON contract\'s CSV source states the column count the app exports', () => {
  const header = eval('[' + shell.match(/function exportCsv\([^)]*\)\{[\s\S]*?\[("[^\]]*?)\]/)[1] + ']');
  const stated = CONTRACT_JSON.sources['S-CSV'].match(/(\d+) exported row columns/);
  assert.ok(stated);
  assert.strictEqual(Number(stated[1]), header.length);
});

test('R37 SA32F-54: the revolving-debt disclosure says a card\'s own minimum is used, and it is', () => {
  const card = (own) => plan((p) => {
    p.advanced.debts = [Object.assign({ id: 'c', type: 'creditCard', name: 'Card', owner: 'household', balance: 10000, rate: 0, paymentMonthly: 0,
      payoffAge: 69, rateType: 'fixed', includePayment: true }, own)];
    Object.assign(p.profile, { retireAge: 60 });
  });
  const withOwn = engine.runPlan(card({ minimumPercentOfBalance: 5 }));
  const standard = engine.runPlan(card({}));
  /* By hand, 0% interest, twelve monthly minimums: 10,000 x 0.95^12 = 5,403.60 at the card's own 5%; x 0.98^12 = 7,847.17 at 2%. */
  assert.strictEqual(Math.round(withOwn.rows[1].debtBalance * 100) / 100, 5403.6);
  assert.strictEqual(Math.round(standard.rows[1].debtBalance * 100) / 100, 7847.17);
  const issue = standard.issues.find((i) => i.code === 'REVOLVING_DEBT_MINIMUM_MODELLED');
  assert.doesNotMatch(issue.message, /used for every card/, 'the disclosure says the defaults apply to every card');
  assert.match(issue.message, /unless its record carries its own/);
});

test('R37 SA32F-48: RESULT_CONTRACT.md records conflict C6 as reconciled, as its test asserts', () => {
  assert.doesNotMatch(CONTRACT, /carried here only until 2o lands/);
  assert.doesNotMatch(CONTRACT, /a characterization test that records the violation, not proof that the engine conforms in that case/);
  assert.match(fs.readFileSync(path.join(ROOT, 'tests', 'result-contract.test.js'), 'utf8'), /conflict C6, reconciled \(S5 2o\)/);
});
