/* CR2-01 through the public entry point: S5 block 2r's rebuild-proof guard.
 *
 * findingIds: CR2-01
 *
 * A distribution from a pretax account is ordinary income wherever it lands. A
 * transfer from a traditional IRA into a taxable account must therefore be taxed
 * like a Roth conversion of the same dollars. Before the repair only a transfer
 * into a Roth was recognised, so the same $50,000 moved into taxable savings
 * added nothing to income or tax, leaving the household better off for choosing
 * the other destination.
 *
 * The existing guard (tests/audit-cr2-findings.test.js) also loads a debt module
 * directly, so a rebuild that replaced that module would leave this behaviour
 * without an implementation-independent guard. This file reaches it only through
 * runPlan(). Each household is retired at 66 with zero returns and inflation, and
 * holds a traditional IRA, two full-basis taxable accounts and a Roth. A $50,000
 * transfer is made at 66, and row 1's MAGI and taxes are compared with the same
 * plan without the transfer.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const account = (fields) => Object.assign({
  owner: 'self', contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
  frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0,
  matchRate: 0, profitShare: 0, vesting: 100,
}, fields);

const AMOUNT = 50000;

function plan(from, to, amount) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  /* RE-FIXTURED at the S5AA R18 round (workstream B, taxable basis in dollars): dividends ON at a 0% yield, so no imputed 1.5% -- at a 0% return a taxed, retained yield adds basis the account never gains, and the tax sales then realise small capital losses that are not what this test is about. */ Object.assign(p.retirement, { dividendOn: true, dividendYield: 0 });
  Object.assign(p.profile, { age: 66, retireAge: 66, endAge: 70 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: 66 });
  p.accounts = [
    account({ id: 'p1', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', balance: 600000, priority: 3, basisPct: 0 }),
    account({ id: 't1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', balance: 900000, priority: 1, basisPct: 100 }),
    account({ id: 't2', name: 'Savings', type: 'taxable', taxClass: 'taxable', balance: 100000, priority: 2, basisPct: 100 }),
    account({ id: 'r1', name: 'Roth', type: 'rothIRA', taxClass: 'roth', balance: 100000, priority: 4, basisPct: 100 }),
  ];
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  Object.assign(p.advanced, { transferOn: amount > 0, transferFrom: from, transferTo: to, transferAmount: amount, transferAge: 66, conversionOn: false, rmdOn: false });
  p.retirement.otherIncomes = [];
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 40000, pension: 0, ssBenefit: 0, spouseSS: 0 });
  return p;
}

/* Row 1's MAGI and taxes with the transfer, less the same plan without it. */
function transferEffect(from, to) {
  const a = engine.runPlan(plan(from, to, AMOUNT));
  const b = engine.runPlan(plan(from, to, 0));
  assert.equal(a.status, 'ok');
  assert.equal(b.status, 'ok');
  return { magi: a.rows[1].magi - b.rows[1].magi, taxes: a.rows[1].taxes - b.rows[1].taxes, row: a.rows[1] };
}

test('CR2-01 (runPlan): a transfer from a traditional IRA into a taxable account is ordinary income', () => {
  const e = transferEffect('p1', 't1');
  assert.ok(e.magi >= AMOUNT, 'the pretax transfer into taxable savings must add the amount moved to MAGI, added ' + e.magi);
  assert.ok(e.taxes > 0, 'and it must raise the tax, raised ' + e.taxes);
  assert.equal(e.row.preTax, 600000 - AMOUNT, 'the amount really left the IRA');
});

test('CR2-01 (runPlan): a Roth conversion of the same dollars is ordinary income, and a taxable-to-taxable transfer is not', () => {
  const roth = transferEffect('p1', 'r1');
  assert.ok(Math.abs(roth.magi - AMOUNT) < 0.01, 'a Roth conversion adds the amount moved to MAGI, added ' + roth.magi);
  const taxable = transferEffect('t1', 't2');
  assert.ok(Math.abs(taxable.magi) < 0.01, 'a transfer between taxable accounts adds nothing to MAGI, added ' + taxable.magi);
  assert.ok(Math.abs(taxable.taxes) < 0.01, 'and nothing to the tax, added ' + taxable.taxes);
});
