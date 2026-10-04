/* S5AA R20 round: R18F-02 -- THE 10% EARLY-DISTRIBUTION TAX AND THE RULE OF 55 TEST THE ACCOUNT OWNER'S AGE
 * (ChatGPT's R18 full-model audit, 2026-09-24, priority 1; its own number R18-02, renumbered R18F-02 because the first R18
 * audit already used R18-01 and R18-02; repair chosen by the owner 2026-09-23).
 *
 * earlyWithdrawalPenaltyRate() tested the ROW age -- the primary person's -- for every account, so a spouse-owned IRA
 * or plan was taxed or excused on the wrong person's age. The engine's own comment called it "a pre-existing
 * simplification"; nothing a user or reviewer reads disclosed it. IRC 72(t)(1) and (2)(A)(i) turn on the age of the
 * EMPLOYEE or IRA OWNER receiving the distribution, and the separation-from-service exception, 72(t)(2)(A)(v), on the
 * employee's own age and a qualified employer plan only (IRS, "Retirement topics - exceptions to tax on early
 * distributions"; Topic 557).
 *
 * The plans are one projected year, married filing jointly, zero return and inflation, no income but the draw. The
 * draw pays $10,000 of spending from the one spouse-owned pre-tax account. Where the 10% applies the draw grosses up to
 * $10,000 / 0.9 = $11,111.11, the only tax is $1,111.11 (the draw is far below both standard deductions), and
 * $88,888.89 is left of $100,000. Where it does not, $10,000 is drawn, the tax is $0 and $90,000 is left.
 *
 * The same rule is read by the quote, the committed draw and the transfer (one function), so the transfer is tested too.
 */
'use strict';
const { retireAtEnd } = require('./lib/working-horizon'); // S5AA R53 (the owner's decision 3, 2026-10-04): working-only horizons

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

const account = (o) => Object.assign({ name: o.id, contribution: 0, contributionMode: 'amount', basisPct: 0, annualChange: 0,
  annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
  matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }, o);

function couple(selfAge, spouseAge, edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: selfAge, spouseAge, spouseOn: true, filing: 'mfj', retireAge: selfAge, endAge: selfAge + 1 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'annual' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: selfAge });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 10000, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [],
    expenses: [], otherIncomes: [], selfLife: 99, spouseLife: 99, survivor: false, dividendOn: true, dividendYield: 0,
    withdrawalOrder: 'manual', manualOrder: 'preTax,taxable,roth,hsa' });
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, conversionOn: false, transferOn: false, healthOn: false, ltcOn: false,
    penaltyException: false, rule55: false, debts: [], otherAssets: [] });
  p.accounts = [account({ id: 'sp', type: 'traditionalIRA', taxClass: 'preTax', owner: 'spouse', balance: 100000 })];
  if (edit) edit(p);
  retireAtEnd(p); // S5AA R53: an end age before the retirement age is refused; the owner retires at the end age instead (output-neutral, tests/lib/working-horizon.js)
  assert.equal(validator.validateScenario(JSON.parse(JSON.stringify(p))).valid, true, 'a valid plan');
  return p;
}

function drawRow(p) {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + ' ' + r.calculationErrorCode);
  const row = r.rows[1];
  return { withdrawals: round(row.withdrawals), taxes: round(row.taxes), total: round(row.total) };
}

const TAXED = { withdrawals: 11111.11, taxes: 1111.11, total: 88888.89 };
const FREE = { withdrawals: 10000, taxes: 0, total: 90000 };

test('R18F-02: a spouse-owned IRA whose owner is 70 owes no early tax, although the primary person is 50', () => {
  assert.deepEqual(drawRow(couple(50, 70)), FREE);
});

test('R18F-02: a spouse-owned IRA whose owner is 50 owes the 10%, although the primary person is 70', () => {
  assert.deepEqual(drawRow(couple(70, 50)), TAXED);
});

test('R18F-02: Rule of 55 excuses a spouse-owned 401(k) only on its owner being 55 -- owner 56, primary 50', () => {
  /* RE-FIXTURED BY INTENT at S5AA R35 (SA32F-22): the Rule of 55 also needs the owner's separation in or after the year of 55. The
     engine times both people's work by one retirement age on each one's own clock, so here it is 56: the spouse-owner (56) has just
     left, the primary (50) still works; the draw is a $10,000 one-time expense at 50 rather than retirement spending. What this
     tests is unchanged: the OWNER's age decides, not the primary person's. */
  assert.deepEqual(drawRow(couple(50, 56, (p) => {
    p.advanced.rule55 = true;
    p.accounts[0].type = 'traditional401k';
    p.profile.retireAge = 56;
    p.retirement.expenses = [{ name: 'Draw', age: 50, amount: 10000 }];
  })), FREE);
});

test('R18F-02: Rule of 55 does not excuse a spouse-owned 401(k) whose owner is 50 -- primary 56', () => {
  assert.deepEqual(drawRow(couple(56, 50, (p) => {
    p.advanced.rule55 = true;
    p.accounts[0].type = 'traditional401k';
  })), TAXED);
});

test('R18F-02 control: Rule of 55 never reaches an IRA, whoever is 55 -- spouse-owned IRA, owner 56', () => {
  assert.deepEqual(drawRow(couple(50, 56, (p) => { p.advanced.rule55 = true; })), TAXED);
});

test('R18F-02 control: an account the primary person owns still reads the primary age', () => {
  assert.deepEqual(drawRow(couple(50, 70, (p) => { p.accounts[0].owner = 'self'; })), TAXED);
});

test('R18F-02: a spouse-owned transfer to taxable is taxed on its owner\'s age -- exactly the $5,000 on $50,000', () => {
  /* Two runs differing only in which person is 50 and which 62. Nothing else in the tax depends on either age below 65,
     so the row's tax differs by the 10% on the $50,000 moved: charged when the OWNER (spouse) is 50, not when the
     primary person is. The tax is paid from the brokerage account at full basis, so paying it realises nothing: paid
     from the IRA, the $5,000 would itself be a taxed early draw and the difference would not be the penalty alone. */
  const transfer = (selfAge, spouseAge) => couple(selfAge, spouseAge, (p) => {
    p.retirement.spending = 0;
    p.retirement.manualOrder = 'taxable,preTax,roth,hsa';
    p.advanced.transferOn = true;
    Object.assign(p.advanced, { transferAge: selfAge + 0.5, transferAmount: 50000, transferFrom: 'sp', transferTo: 'tx' });
    p.accounts.push(account({ id: 'tx', type: 'taxable', taxClass: 'taxable', owner: 'spouse', balance: 100000, basisPct: 100, priority: 2 }));
  });
  const ownerYoung = engine.runPlan(transfer(62, 50)), ownerOld = engine.runPlan(transfer(50, 62));
  assert.equal(ownerYoung.status, 'ok');
  assert.equal(ownerOld.status, 'ok');
  assert.equal(round(ownerYoung.rows[1].taxes - ownerOld.rows[1].taxes), 5000);
});

test('R18F-02, found at the R20 self-audit: after a death the survivor\'s age governs the rolled-over IRA', () => {
  /* The primary person, 70, owns the IRA and dies at 70.5; the spouse is 50. The year of death is the decedent's, drawn at
     the decedent's age: $10,000, no early tax. From the next row the IRA is the survivor's own (the spousal rollover the
     model assumes, Q4, disclosed by SPOUSAL_ROLLOVER_ASSUMED), and the survivor is 51, so the 10% applies: $11,111.11
     drawn and $1,111.11 of tax (a single filer's standard deduction still covers the income). Before the repair the row
     age -- the dead primary person's, 71 -- was read, and the survivor's draws were never charged. */
  const r = engine.runPlan(couple(70, 50, (p) => {
    p.profile.endAge = 72;
    p.retirement.selfLife = 70.5;
    p.accounts[0].owner = 'self';
  }));
  assert.equal(r.status, 'ok');
  const at = (age) => r.rows.find((x) => x.age === age);
  assert.deepEqual([round(at(71).withdrawals), round(at(71).taxes)], [10000, 0], 'the year of death, at the decedent\'s age');
  /* ADAPTED BY INTENT at S5AA R48 (AA1-19, the owner's AA1 decision of 2026-10-03: "A survivor under 59 1/2 keeps the deceased's IRA as
     inherited until 59 1/2"): the survivor is 51, so the decedent's IRA is held as an inherited IRA and a distribution from it is made
     to a beneficiary after the death -- no 10% (IRC 72(t)(2)(A)(ii)): $10,000 drawn, no tax (a single filer's standard deduction covers
     it), $80,000 left. Before R48 it was the survivor's own: $11,111.11 drawn, $1,111.11 of tax, $78,888.89 left. The survivor's age
     still governs the account (accountOwnerAge()); the R48 witnesses hold the survivor's OWN IRA to the 10% before 59 1/2. */
  assert.deepEqual([round(at(72).withdrawals), round(at(72).taxes), round(at(72).total)], [10000, 0, 80000], 'the survivor\'s first year');
});
