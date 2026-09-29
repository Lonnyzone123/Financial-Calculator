/* S5AA, R18 round: CLAUDE'S SELF-AUDIT OF WORKSTREAM B'S LOSS RULE (Handover temp/S5AA_R18_SELF_AUDIT_20260923.md;
 * repairs chosen by the owner 2026-09-23).
 *
 * SA18-01. THE CARRYOVER A YEAR USES IS CAPPED BY TAXABLE INCOME. The Capital Loss Carryover Worksheet (Schedule D
 *      instructions, lines 1-4): line 1 is taxable income (it may be negative), line 2 the loss deducted, line 3 their
 *      sum floored at zero, and the smaller of lines 2 and 3 is what the year used (IRC 1212(b)(2)). The engine treated the
 *      whole deduction as used, so a year whose income sat under the standard deduction lost up to $3,000 of carryover.
 * SA18-02. A DECEDENT'S LOSS DIES WITH THEM. Publication 559: a decedent's capital losses, including carryovers, can be
 *      deducted only on the decedent's final return. The carry is now held per owner -- a taxable account's gain or loss
 *      is its owner's, a joint account's is split between the living spouses -- and a joint return's carryover is
 *      allocated on each spouse's own net loss (26 CFR 1.1212-1(c)(1)(iv)). The decedent's share is dropped at the first
 *      row in which they count as dead; the death year itself is their final return and uses it. A household of one has
 *      no such row: lastDeathCutAge() ends the projection at the first opening where nobody is alive.
 * (SA18-09 was withdrawn on verification: a row whose quote errs is a calculation error, runPlan() then publishes no
 *  rows, and a Monte Carlo path that errs is left out of every aggregate, so the carry after it is never read.)
 *
 * Every figure below is computed by hand. Federal tax is zero in every row here (ordinary income under the deductions,
 * gains inside the 0% bracket), so each row's tax is Arizona's 2.5% of AGI less its $16,100 standard deduction and
 * $2,100 for each living person 65 or older, funded by a sale from the gaining account whose gain fraction is 5/9.
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
const CLASSES = [{ id: 'down', name: 'Down', returnRate: -50, volatility: 0 }, { id: 'up', name: 'Up', returnRate: 50, volatility: 0 }];

/* Age 70, annual timing, no inflation or fees; dividends on at no yield (so no imputed 1.5%); `loser` ($100,000 at full
   basis) halves and `winner` ($100,000 at full basis) gains 50% a year. */
function planFor(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 70, retireAge: 60, endAge: 72, spouseOn: Boolean(o.couple), spouseAge: 70, filing: o.couple ? 'mfj' : 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'annual' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 60 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: o.spend, ssBenefit: 0, pension: o.pension || 0, pensionAge: 60, pensionCola: 0,
    stages: [], expenses: o.expenses || [], otherIncomes: [], selfLife: o.selfLife || 99, spouseLife: 99, survivor: false, dividendOn: true,
    dividendYield: 0, dividendStart: 120, dividendQualified: 100, withdrawalOrder: 'manual', manualOrder: 'taxable,hsa,roth,preTax' });
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, healthOn: false, ltcOn: false, debts: [], otherAssets: [], conversionOn: false,
    transferOn: false, assetsOn: true, glideOn: false, assetClasses: CLASSES });
  p.accounts = [
    acct({ id: 'loser', owner: o.loserOwner || 'self', balance: 100000, priority: 1, allocation: { down: 100 } }),
    acct({ id: 'winner', owner: o.winnerOwner || 'self', balance: 100000, priority: 2, allocation: { up: 100 } }),
  ];
  return p;
}
function run(o) {
  const p = planFor(o);
  assert.equal(validator.validateScenario(JSON.parse(JSON.stringify(p))).valid, true, 'a valid plan');
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r.rows;
}
/* The Arizona-funded row: AGI = base + (5/9)x, x = 2.5% x (AGI - 16,100 - 2,100)  =>  x = 0.025 (base - 18,200) / (1 - 0.025 x 5/9). */
function azFunded(base) {
  const x = 0.025 * (base - 18200) / (1 - 0.025 * 5 / 9);
  return { taxes: x, agi: base + x * 5 / 9 };
}

test('SA18-01: through runPlan -- a loss realised under the standard deduction carries whole, and meets a later gain', () => {
  /* A $20,000 pension; $70,000 of spending; at 71 a one-time $58,000 expense.
     70: `loser` is worth 50,000 and is sold whole: a $50,000 loss, $3,000 of it off the pension (AGI 17,000). The single
         70-year-old's deductions are at least 16,100 + 6,000 (senior) = 22,100, so taxable income before the loss is
         below zero: the worksheet uses none of it, and all 50,000 carries (the engine carried 47,000).
     71: `winner` holds 225,000 and 108,000 is sold, carrying 48,000 of its 100,000 basis: a 60,000 gain, 10,000 net of
         the carry. AGI before tax = 20,000 + 10,000 = 30,000, and Arizona's tax is funded at a 5/9 gain fraction. */
  const rows = run({ pension: 20000, spend: 70000, expenses: [{ name: 'Once', age: 71, amount: 58000 }] });
  near(rows[1].federalAgi, 17000, '70: the loss offsets $3,000 of the pension');
  near(rows[1].taxes, 0);
  /* RE-FIXTURED BY INTENT at S5AA R33 (SA32F-34): IRC 1212(b)(2)(B) adds back "(ii) the deduction allowed for such year under section
     151" -- the senior deduction -- as well as the 1211(b) amount. At 70: taxable income 17,000 - (16,100 + 2,050 + 6,000) = -7,150;
     adjusted taxable income -7,150 + 3,000 + 6,000 = 1,850, so 1,850 of the loss is used and 48,150 carries (not the whole 50,000).
     At 71 the gain net of the carry is 11,850: AGI before tax 20,000 + 11,850 = 31,850, federal tax still 0 (the net gain sits in
     the 0% band), and Arizona's tax is funded as before. */
  const y71 = azFunded(31850);
  near(rows[2].federalAgi, y71.agi, '71: the 48,150 carried loss meets the gain');
  near(rows[2].taxes, y71.taxes);
});

test('SA18-02: a decedent\'s carried loss is not the survivor\'s; the survivor\'s own is', () => {
  /* A couple at 70, filing jointly; the self dies during the 70 row (selfLife 70.5), so 71 is the spouse's first row
     alone, taxed single. $50,000 of spending, and at 71 a one-time $40,000 expense.
     70: `loser` is sold whole for 50,000: a $50,000 loss. There is no other income, so nothing is deducted and all
         50,000 carries, allocated to whoever owns `loser`.
     71: `winner` (the spouse's) holds 225,000 and 90,000 is sold, carrying 40,000 of basis: a 50,000 gain.
     - the SELF's loss: dropped at 71 (Pub. 559). All 50,000 of gain is taxed; the survivor alone is 65+, so Arizona
       allows one $2,100.
     - the SPOUSE's loss: the survivor's own. It absorbs the whole gain: AGI 0, no tax.
     - a JOINT account's loss: half each (25,000). The decedent's half is dropped: 25,000 of the gain is taxed. */
  const common = { couple: true, selfLife: 70.5, spend: 50000, winnerOwner: 'spouse', expenses: [{ name: 'Once', age: 71, amount: 40000 }] };
  const decedents = run(Object.assign({ loserOwner: 'self' }, common));
  /* RE-FIXTURED BY INTENT at R19 (R18-01): the death year has a $50,000 loss and no other income, so $3,000 is deducted
     whatever the other income and AGI is -3,000, as Form 1040 line 11 may be (it was 0 under the cap R18-01 removed).
     Taxable income before the loss is below zero, so the year uses none of the carryover: all 50,000 still carries, and
     the 71 row below is unchanged. */
  near(decedents[1].federalAgi, -3000, '70: the death year uses the joint return; the $3,000 is deducted against nothing');
  const y71 = azFunded(50000);
  near(decedents[2].federalAgi, y71.agi, '71: the decedent\'s $50,000 loss did not pass');
  near(decedents[2].taxes, y71.taxes);

  const survivors = run(Object.assign({ loserOwner: 'spouse' }, common));
  near(survivors[2].federalAgi, 0, '71: the survivor\'s own carried loss absorbs the gain');
  near(survivors[2].taxes, 0);

  const joint = run(Object.assign({ loserOwner: 'joint' }, common));
  const j71 = azFunded(25000);
  near(joint[2].federalAgi, j71.agi, '71: only the survivor\'s half of a joint account\'s loss carries');
  near(joint[2].taxes, j71.taxes);
});
