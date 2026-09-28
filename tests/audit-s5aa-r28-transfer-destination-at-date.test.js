/* S5AA R28.1: R27F-01 -- A TRANSFER'S DESTINATION IS CREDITED ON THE TRANSFER DATE, SO SPENDING CANNOT USE GROWTH IT HAS NOT
 * EARNED (ChatGPT's R27F full-model audit, 2026-09-26, priority 1; the owner 2026-09-26: "Repair").
 *
 * R25 booked a mid-year transfer into the destination at the year's opening, let it earn the destination's return from
 * then, and took the first part of that return back after the year's growth (shiftTransferGrowth()), never below zero. When
 * the year's spending had already drawn the destination, the floor erased what was owed: money was created and a real
 * shortfall hidden. ChatGPT's witness: all Roth, $100,000 at 0% moved at 60.5 into an empty account at +10% that is drawn
 * first, with a $10,000 cash account at 0%. $105,000 of spending left $9,880.88 where $5,000 is right; $112,000 left
 * $2,880.88 and no shortfall where $2,000 is unmet (reproduced at 73e24c7 and at 56c8847).
 *
 * Now the destination is credited as R28 debits the source: the moved dollars arrive on the date, so in opening-balance
 * terms the destination holds them as A / g^f, and the year's growth carries them to A g^(1-f). There is nothing to take
 * back afterwards and no floor. Hand ledger: with monthly timing the spending is drawn at mid-year, when the destination
 * holds exactly the $100,000 moved; the rest comes from the cash account.
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

const roth = (id, balance, cls, priority) => ({ id, name: id, type: 'rothIRA', taxClass: 'roth', owner: 'self', balance, basisPct: 0,
  contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
  futureChanges: [], allocation: { [cls]: 100 }, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority });

/* "src" $100,000 at 0% (drawn last), "dest" empty at +10% (drawn first), "cash" $10,000 at 0%. */
function run(spending) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 61, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending, dividendOn: true, dividendYield: 0, dividendGrowth: 0, dividendStart: 60,
    pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [] });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, networthOn: true, otherAssets: [], debts: [], assetsOn: true,
    assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }, { id: 'growth', name: 'Growth', returnRate: 10, volatility: 0 }],
    transferOn: true, transferFrom: 'src', transferTo: 'dest', transferAmount: 100000, transferAge: 60.5, penaltyException: true });
  p.accounts = [roth('src', 100000, 'flat', 3), roth('dest', 0, 'growth', 1), roth('cash', 10000, 'flat', 2)];
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, 'a valid plan: ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.deepEqual((r.issues || []).filter((i) => i.severity === 'ERROR').map((i) => i.code), [], 'no error of any kind');
  return r.rows[1];
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);

test('R27F-01: $105,000 of spending draws the $100,000 moved and $5,000 of cash -- the household ends at $5,000 (was $9,880.88)', () => {
  near(run(105000).total, 5000, 'the household');
});

test('R27F-01: $112,000 of spending is $2,000 more than the household holds -- $2,000 unmet and $0 left (was $0 unmet, $2,880.88 left)', () => {
  const row = run(112000);
  near(row.shortfall, 2000, 'the unmet spending');
  near(row.total, 0, 'the household');
});

test('R27F-01: ChatGPT\'s hand ledger from $100,000 to $114,000 of spending -- every plan ends at max(0, 110,000 - S) with max(0, S - 110,000) unmet', () => {
  for (let s = 100000; s <= 114000; s += 1000) {
    const row = run(s);
    near(row.total, Math.max(0, 110000 - s), 'the household at ' + s);
    near(row.shortfall, Math.max(0, s - 110000), 'the unmet spending at ' + s);
  }
});

test('R27F-01 CONTROL: with no spending the moved dollars earn the destination\'s second half-year -- $100,000 x sqrt(1.1) + $10,000', () => {
  near(run(0).total, 100000 * Math.sqrt(1.1) + 10000, 'the household');
});
