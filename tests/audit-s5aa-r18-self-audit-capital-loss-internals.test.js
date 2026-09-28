/* S5AA, R18 round: the INTERNALS test of Claude's self-audit finding SA18-01, split out so that
 * tests/audit-s5aa-r18-self-audit-capital-loss.test.js guards the repair through runPlan() alone (the pattern of
 * tests/audit-ra03-internals.test.js). It calls estimateTaxes() directly, to pin the worksheet's partial case -- taxable
 * income before the loss between zero and the deduction -- which no whole plan isolates as cleanly. A rebuild re-points
 * or retires it with that internal.
 *
 * SA18-01: the Capital Loss Carryover Worksheet (Schedule D instructions, lines 1-4; IRC 1212(b)(2)) counts a year's loss
 * deduction as used only up to its taxable income before the loss; the rest of it carries forward.
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
test('SA18-01: a year whose taxable income is below the loss uses none of the carryover (estimateTaxes, the worksheet by hand)', () => {
  /* Single at 60 (no senior amounts): standard deduction 16,100. A $10,000 net loss against $18,000 of ordinary income:
     $3,000 is deducted, AGI 15,000, taxable income 15,000 - 16,100 = -1,100. Worksheet: line 3 = -1,100 + 3,000 = 1,900,
     so 1,900 was used and 10,000 - 1,900 = 8,100 carries. With $40,000 of ordinary income taxable income is 20,900, line 3
     is 23,900, all 3,000 is used and 7,000 carries. With none, nothing is deducted or used: all 10,000 carries. */
  const p = planFor({ spend: 0 });
  p.profile.age = 60;
  const carry = (ordinary) => engine.estimateTaxes(p, 60, ordinary, -10000, 0, 0, 0, 0, 0, 0, 0, 0).capitalLossCarryOut;
  near(carry(18000), 8100, 'partly used: taxable income before the loss was 1,900');
  near(carry(40000), 7000, 'fully used');
  near(carry(0), 10000, 'nothing to use it against');
  near(engine.estimateTaxes(p, 60, 18000, -10000, 0, 0, 0, 0, 0, 0, 0, 0).measures.federal_agi, 15000, 'the deduction itself is unchanged');
});
