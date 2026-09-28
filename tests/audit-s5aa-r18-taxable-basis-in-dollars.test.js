/* S5AA, R18 round: WORKSTREAM B -- TAXABLE BASIS IN DOLLARS (R10-06; design reviewed in the re-audit of `149ca0d`, rulings
 * B1 (c) and B2 adopted by the owner, 2026-09-22).
 *
 * A taxable account carried its basis as a PERCENTAGE of its balance, so every event that moved the balance moved the
 * basis with it. Measured at `149ca0d`, and each is a case below:
 *   - growth added basis: $500,000 at 100% grown 10% and sold for $550,000 realised no gain;
 *   - a cash contribution added none: $10,000 into a 50% account left it at 50%;
 *   - a reinvested, taxed dividend added none, so a later sale taxed it again (and the imputed 1.5% the same);
 *   - a paid dividend took basis with it, as if it were a sale;
 *   - a loss could not exist: the gain fraction was clamped to 0..1.
 * Now each engine taxable account carries basisDollars from its opening balance x basisPct (still the saved input):
 * growth and fees leave it alone; a contribution, an excess redirect, retained cash and a reinvested or imputed taxed
 * dividend add to it; a sale removes its pro-rata share; a transfer carries it; a paid dividend leaves it. A sale's gain
 * is proceeds less the basis it carries, and may be negative. B1 (c): the row's net capital result, less any carried
 * loss, is taxed if positive; a net loss offsets up to $3,000 of ordinary income (the model has no married-filing-
 * separately status, so never $1,500), never taking income below zero, and the rest carries forward. All gains are
 * long-term: the model has no lots. Every figure below is computed by hand.
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
const validator = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const round = (x) => Math.round(Number(x) * 100) / 100;
const near = (actual, expected, label) => assert.equal(round(actual), round(expected), label);
const acct = (o) => Object.assign({ name: o.id, owner: 'self', type: 'taxable', taxClass: 'taxable', basisPct: 100, contribution: 0,
  contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
  allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 }, o);

/* Single, annual timing, no inflation or fees; dividends ON with no yield unless given (so no imputed 1.5%). */
function planFor(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: o.age || 70, retireAge: o.retireAge || 60, endAge: o.endAge || (o.age || 70) + 1, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: o.ret || 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'annual' });
  Object.assign(p.employment, { salary: o.salary || 0, spouseSalary: 0, growth: 0, contributionStop: o.retireAge || 60 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: o.spend || 0, ssBenefit: 0, pension: o.pension || 0, pensionAge: 60, pensionCola: 0,
    stages: [], expenses: [], otherIncomes: [], selfLife: 99, survivor: false, dividendOn: o.dividendsOff ? false : true, dividendYield: o.yield || 0,
    dividendStart: o.dividendStart || 120, dividendQualified: 100, withdrawalOrder: 'manual', manualOrder: 'taxable,hsa,roth,preTax' });
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, healthOn: false, ltcOn: false, debts: [], otherAssets: [], conversionOn: false,
    transferOn: Boolean(o.transfer), transferAge: o.age || 70, transferFrom: o.transfer ? o.transfer.from : '', transferTo: o.transfer ? o.transfer.to : '',
    transferAmount: o.transfer ? o.transfer.amount : 0, assetsOn: Boolean(o.classes), glideOn: false, assetClasses: o.classes || p.advanced.assetClasses });
  p.accounts = o.accounts.map(acct);
  return p;
}
function run(o) {
  const p = planFor(o);
  assert.equal(validator.validateScenario(JSON.parse(JSON.stringify(p))).valid, true, 'a valid plan');
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r.rows;
}
const brokerage = (balance, basisPct, extra) => [Object.assign({ id: 'b', balance, basisPct }, extra || {})];

test('R10-06: the auditor\'s liquidation realises the $50,000 of growth; the no-growth control realises nothing', () => {
  /* $500,000 at full basis grows 10% and is sold for $550,000 of spending: a $50,000 gain. Federal: 50,000 - 16,100 =
     33,900 of gain, inside the 0% bracket (to 49,450). Arizona taxes it: 33,900 x 2.5% = 847.50, which the emptied
     account cannot fund. */
  const grown = run({ age: 60, ret: 10, spend: 550000, accounts: brokerage(500000, 100) })[1];
  near(grown.federalAgi, 50000);
  near(grown.taxes, (50000 - 16100) * 0.025);
  const flat = run({ age: 60, ret: 0, spend: 500000, accounts: brokerage(500000, 100) })[1];
  near(flat.federalAgi, 0);
});

test('R10-06: partial sales keep the remaining DOLLAR basis', () => {
  /* $100,000 at 50% basis ($50,000), +10% a year, $22,000 sold each year (tax is zero throughout).
     Year 1: 110,000; the sale is 20% of it and carries 10,000 of basis -> gain 12,000; basis 40,000 on 88,000.
     Year 2: 96,800; the sale carries 40,000 x 22,000 / 96,800 = 9,090.91 -> gain 12,909.09. */
  const rows = run({ ret: 10, endAge: 72, spend: 22000, accounts: brokerage(100000, 50) });
  near(rows[1].federalAgi, 12000);
  near(rows[2].federalAgi, 22000 - 40000 * 22000 / 96800);
  near(rows[1].taxes + rows[2].taxes, 0, 'precondition: no tax sale moved the figures');
});

test('R10-06: a cash contribution adds its dollars to basis, diluting the gain', () => {
  /* Working at 64: $10,000 goes into a $100,000 account at 50% basis, no growth -> 110,000 with 60,000 of basis.
     Retired at 65: a $22,000 sale carries 22,000 x 60,000 / 110,000 = 12,000 of basis -> gain 10,000 (it was 11,000). */
  const rows = run({ age: 64, retireAge: 65, endAge: 66, salary: 30000, spend: 22000, accounts: brokerage(100000, 50, { contribution: 10000 }) });
  near(rows[1].taxable, 110000, 'precondition: the contribution landed');
  near(rows[2].federalAgi, 10000);
  near(rows[2].taxes, 0);
});

test('R10-06: a reinvested, taxed dividend adds basis once, so a later sale does not tax it again', () => {
  /* $100,000 at full basis grows 10%; the 3% dividend on the grown 110,000 is 3,300, reinvested (payout starts later)
     and taxed, so basis is 103,300. Selling everything: gain 110,000 - 103,300 = 6,700; AGI 3,300 + 6,700 = 10,000.
     Selling half: the sale carries 51,650 of basis -> gain 3,350; AGI 6,650. */
  near(run({ ret: 10, spend: 110000, yield: 3, accounts: brokerage(100000, 100) })[1].federalAgi, 10000);
  near(run({ ret: 10, spend: 55000, yield: 3, accounts: brokerage(100000, 100) })[1].federalAgi, 3300 + 55000 - 103300 / 2);
});

test('R10-06: the imputed 1.5% (dividends off) is taxed and retained, so it adds basis too', () => {
  /* The imputed yield is measured on what the account holds AFTER the row's sales (measured at 149ca0d: a full
     liquidation imputes nothing) -- an existing timing, not changed here. $100,000 at full basis, +10%, $55,000 sold a
     year. Year 1: 110,000; the sale carries 50,000 of basis -> gain 5,000; 55,000 remains with 50,000 of basis; 1.5% of
     it, 825, is taxed and added: basis 50,825. AGI 5,825.
     Year 2: 60,500; the sale carries 50,825 x 55,000 / 60,500 = 46,204.55 -> gain 8,795.45; 5,500 remains, and 82.50 is
     imputed. AGI 8,877.95. Without the imputed basis the year-2 gain would be 9,545.45. */
  const rows = run({ ret: 10, endAge: 72, spend: 55000, dividendsOff: true, accounts: brokerage(100000, 100) });
  near(rows[1].federalAgi, 5000 + 55000 * 0.015);
  near(rows[2].federalAgi, (55000 - 50825 * 55000 / 60500) + 5500 * 0.015);
  near(rows[1].taxes + rows[2].taxes, 0);
});

test('R10-06: a PAID dividend is income, not a sale -- it takes no basis', () => {
  /* Payout has started: the 3,300 dividend is paid in cash and spent, leaving 106,700 with its full 100,000 of basis.
     The rest of the $58,300 of spending sells 55,000, which carries 100,000 x 55,000 / 106,700 = 51,546.39 of basis.
     AGI = 3,300 + 3,453.61. (Consuming basis with the dividend would have given a 5,000 gain.) */
  const row = run({ ret: 10, spend: 58300, yield: 3, dividendStart: 60, accounts: brokerage(100000, 100) })[1];
  near(row.federalAgi, 3300 + 55000 - 100000 * 55000 / 106700);
});

test('R10-06: a transfer carries its dollar basis to the destination', () => {
  /* $50,000 moves from A ($100,000 at 50%) to B (empty): whether it moves before or after the 10% growth, B holds basis
     equal to half of what arrived, and a $20,000 sale from B realises 10,909.09 (it was 10,000). */
  const row = run({ ret: 10, spend: 20000, transfer: { from: 'a', to: 'b2', amount: 50000 },
    accounts: [{ id: 'b2', balance: 0, basisPct: 100, priority: 1 }, { id: 'a', balance: 100000, basisPct: 50, priority: 2 }] })[1];
  near(row.federalAgi, 20000 - 20000 * 25000 / 55000);
});

test('B1 (c): a realised loss offsets $3,000 of ordinary income and carries forward against a later gain', () => {
  /* A $20,000 pension; $70,000 of spending. `loser` ($100,000 at full basis) loses 50% and is sold whole in year 1: a
     $50,000 loss -> $3,000 off ordinary income (AGI 17,000). The single 70-year-old's deductions (at least 16,100 +
     6,000) exceed the income, so the Capital Loss Carryover Worksheet counts none of it as used and all $50,000 carries
     (the self-audit's SA18-01; this comment said 47,000, which the assertions below do not distinguish). `winner` ($100,000
     at full basis) gains 50% a year; in year 2 it holds 225,000 and $50,000 is sold, carrying 22,222.22 of basis: a
     27,777.78 gain, less the 50,000 carried = a 22,222.22 net loss -> $3,000 off again (AGI 17,000). Tax is zero both
     years. tests/audit-s5aa-r18-self-audit-capital-loss.test.js pins the carry that this plan cannot see. */
  const rows = run({ endAge: 72, pension: 20000, spend: 70000,
    classes: [{ id: 'down', name: 'Down', returnRate: -50, volatility: 0 }, { id: 'up', name: 'Up', returnRate: 50, volatility: 0 }],
    accounts: [{ id: 'loser', balance: 100000, basisPct: 100, priority: 1, allocation: { down: 100 } },
      { id: 'winner', balance: 100000, basisPct: 100, priority: 2, allocation: { up: 100 } }] });
  near(rows[1].federalAgi, 20000 - 3000, 'year 1: the loss offsets $3,000 of the pension');
  near(rows[2].federalAgi, 20000 - 3000, 'year 2: the carried loss absorbs the new gain, and $3,000 more');
  near(rows[1].taxes + rows[2].taxes, 0);
});

test('B1 (c): a loss offsets qualified dividends too, when there is no ordinary income to take it', () => {
  /* A retiree at 70 living on dividends (paid from 60, 4%, all qualified). `income` ($1,000,000, flat) pays 40,000; `loser`
     ($20,000 at full basis) halves to 10,000, pays its 400, and the 9,600 left is sold for the rest of the $50,000 of
     spending: a 10,400 loss. There is no ordinary income, so the $3,000 comes off the dividends: AGI 40,400 - 3,000 =
     37,400 (a deduction against ordinary income alone would have left 40,400). Arizona: (37,400 - 16,100 - 2,100) x 2.5%
     = 480, funded from `income`, whose sale adds to the carried loss but not to this year's capped deduction. */
  const row = run({ spend: 50000, yield: 4, dividendStart: 60,
    classes: [{ id: 'down', name: 'Down', returnRate: -50, volatility: 0 }, { id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }],
    accounts: [{ id: 'loser', balance: 20000, basisPct: 100, priority: 1, allocation: { down: 100 } },
      { id: 'income', balance: 1000000, basisPct: 100, priority: 2, allocation: { flat: 100 } }] })[1];
  near(row.federalAgi, 40400 - 3000);
  near(row.taxes, (37400 - 16100 - 2100) * 0.025);
});

const { liveWorkerSource, postToWorker, cleanup } = require('./lib/worker-source.js');
test.after(() => cleanup());
test('R10-06: the generated Worker agrees on the liquidation', async () => {
  const source = await liveWorkerSource();
  const plan = planFor({ age: 60, ret: 10, spend: 550000, accounts: brokerage(500000, 100) });
  const message = postToWorker(source, plan);
  assert.ok(!message.error, message.error);
  near(message.result.rows[1].federalAgi, 50000);
  assert.deepEqual(message.result.rows, engine.runPlan(planFor({ age: 60, ret: 10, spend: 550000, accounts: brokerage(500000, 100) })).rows);
});
