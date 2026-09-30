/* S5AA R39.1 (R39-01, ChatGPT's R39 change audit, P2; the owner 2026-09-30: "fix it") -- A CLAIM THE WORKER NEVER REACHES DOES NOT PRICE
 * THE SURVIVOR'S BENEFIT.
 *
 * R39 (R38-04, f6dbb2a) priced each person's PIA at their claim when the claim falls inside the row, so a claim inside the row takes the
 * COLAs it has earned. It did not ask whether the person is alive at the claim. A worker who dies at 67.25 with a claim planned for 67.5
 * therefore had a PIA priced at 67.5 -- a COLA the plan had not reached at the death -- and ssSurvivorMonthly() paid the survivor from it:
 * 20,196 in the row to 68, where a claim planned at 68 or 69 gave 18,360. A planned claim the worker never reaches cannot change the
 * survivor's benefit (POMS RS 00615.690: the deceased's delayed credits are effective at death). The claim-date price now applies only to
 * a claimant alive at the claim; otherwise the row prices the PIA at its opening, as before R39.
 *
 * ChatGPT's witness: both 66.5 at the start, the worker's entered benefit $2,000 a month in today's dollars, 10% COLA, the worker dying at
 * 67.25, the survivor with no benefit of their own; no wages, assets, spending or other income. By hand, on the model's row-constant
 * convention: no COLA anniversary before the death (the plan opened at 66.5); three months of delayed credit past FRA 67, 3 x 2/3% = 2%;
 * 2,000 x 1.02 = 2,040 a month; nine months of survivor benefit to 68: 18,360. */
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
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function incomeAt68(retirement) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 66.5, spouseAge: 66.5, retireAge: 66.5, endAge: 68, spouseOn: true, filing: 'mfj' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 66.5 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, ssCola: 10, survivor: true,
    stages: [], expenses: [], otherIncomes: [] }, retirement);
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [];
  assert.ok(validateScenario(p).valid, 'witness must be a valid plan');
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return r.rows.find((x) => Math.abs(x.age - 68) < 1e-9).income;
}

test('R39.1 R39-01: the self dies before a planned claim inside the row; the survivor is paid the same whatever the planned claim', () => {
  const base = { ssBenefit: 2000, spouseSS: 0, spouseClaim: 67, selfLife: 67.25, spouseLife: 95 };
  assert.strictEqual(incomeAt68(Object.assign({ ssClaim: 67.5 }, base)), 18360);   // ChatGPT's witness; R39: 20,196
  assert.strictEqual(incomeAt68(Object.assign({ ssClaim: 68 }, base)), 18360);
  assert.strictEqual(incomeAt68(Object.assign({ ssClaim: 69 }, base)), 18360);
});

test('R39.1 R39-01: the same with the spouse dying and the self surviving', () => {
  /* Mirror image: the spouse's $2,000 record, the spouse dying at 67.25 on their own clock, the self with no benefit of their own.
     Same arithmetic: 2,040 x 9 = 18,360 for every planned claim. */
  const base = { ssBenefit: 0, ssClaim: 67, spouseSS: 2000, selfLife: 95, spouseLife: 67.25 };
  assert.strictEqual(incomeAt68(Object.assign({ spouseClaim: 67.5 }, base)), 18360);
  assert.strictEqual(incomeAt68(Object.assign({ spouseClaim: 68 }, base)), 18360);
});

test('R39.1 R39-01: control -- a claim reached alive inside the row keeps R39\'s claim-date price (R38-04, 13,728)', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 66.5, retireAge: 66.5, endAge: 68, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 66.5 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, ssBenefit: 2000, ssClaim: 67.5,
    ssCola: 10, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [];
  const r = engine.runPlan(p);
  assert.strictEqual(r.rows.find((x) => Math.abs(x.age - 68) < 1e-9).income, 13728);
});
