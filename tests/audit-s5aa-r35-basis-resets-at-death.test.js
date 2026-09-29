/* S5AA R35 (SA32F-17; Claude's R32F full-model audit LIFE-04; ChatGPT's R32V: a carried limitation that "Decision 4 can replace";
 * the owner's decision 4, 2026-09-29, with "a loss also resets") -- A TAXABLE ACCOUNT'S BASIS AT A DEATH.
 *
 * IRC 1014(a): property acquired from a decedent takes its fair market value at the date of death as basis -- up or down. The
 * engine passed a taxable account on with the decedent's basis, so the survivor paid tax on gains that had been wiped. The rule
 * built, decision 4 as R32V qualified it: the decedent's OWN taxable accounts reset in full; a JOINT account resets HALF (the
 * decedent's assumed share, IRC 2040(b)): new basis = half the old basis + half the value. Community property, where both halves
 * can reset (1014(b)(6)), is not modelled, and the disclosure says so. The value is read when the account passes: at the opening
 * of the first row after the death.
 *
 * A couple at 70; one dies at 71.5, so the account passes at 72 and the row from 72 is the survivor's, filed single. A
 * $1,000,000 taxable account, 0% return and inflation, $100,000 of incomeFirst spending, no other income, and dividends on at a 0%
 * yield (with dividends off the engine imputes a taxable 1.5% yield, Q105): the row's AGI is the gain realised on the draw. */
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

function row72(owner, basisPct, dies) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 70, retireAge: 60, endAge: 74, spouseOn: true, spouseAge: 70, filing: 'mfj' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 50 });
  Object.assign(p.retirement, { strategy: 'incomeFirst', spending: 100000, flexibility: 0, dividendOn: true, dividendYield: 0, dividendQualified: 100, stages: [], expenses: [],
    otherIncomes: [], pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false, selfLife: dies === 'self' ? 71.5 : 95, spouseLife: dies === 'spouse' ? 71.5 : 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [{ id: 'brokerage', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner, balance: 1000000, basisPct, contribution: 0,
    contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return { row: r.rows.find((x, k) => k > 0 && Math.abs(r.rows[k - 1].age - 72) < 1e-9), issues: r.issues || [] };
}

test('R35 SA32F-17: the decedent\'s own taxable account passes at its value -- the gain is wiped', () => {
  /* Basis 20%. After the reset the basis is the whole value at 72: a draw realises no gain, so there is no tax and the draw is the spending. */
  const r = row72('self', 20, 'self');
  assert.strictEqual(r.row.withdrawals, 100000, 'no tax to fund');
  assert.ok(Math.abs(r.row.federalAgi) < 0.01, 'no gain: the basis reset to the value. The engine realised 80% of the draw: ' + r.row.federalAgi);
});

test('R35 SA32F-17: a loss resets too (decision 4: "a loss also resets")', () => {
  /* Basis 150%: an unrealised loss. The decedent's loss is not the survivor's: after the reset a draw realises nothing, where the
     engine realised a loss (a $3,000 deduction against nothing). */
  assert.ok(Math.abs(row72('self', 150, 'self').row.federalAgi) < 0.01);
});

test('R35 SA32F-17: a joint account resets half, whichever spouse dies', () => {
  /* Draws take basis pro rata, so at 72 the basis is still 20% of the balance B. The reset: half of 0.2B + half of B = 0.6B, a
     40% gain fraction on every dollar drawn -- the spending and the Arizona tax on the gain alike. The engine kept 0.2B: 80%. */
  for (const dies of ['self', 'spouse']) {
    const r = row72('joint', 20, dies);
    assert.ok(r.row.withdrawals >= 100000, dies + ': the spending, and the tax on the gain');
    assert.ok(Math.abs(r.row.federalAgi - 0.4 * r.row.withdrawals) < 0.01, dies + ': AGI ' + r.row.federalAgi + ' against 40% of ' + r.row.withdrawals);
  }
});

test('R35 SA32F-17: the disclosure says the basis resets, and names community property', () => {
  const said = row72('joint', 20, 'self').issues.find((i) => i.code === 'SPOUSAL_ROLLOVER_ASSUMED');
  assert.ok(said, 'the succession is disclosed');
  assert.match(said.message, /half of its cost basis/);
  assert.match(said.message, /[Cc]ommunity property/);
  assert.ok(!/not stepped up/.test(said.message), 'no longer says the basis is not stepped up');
});
