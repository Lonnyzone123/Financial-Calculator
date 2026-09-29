/* S5AA R34 (SA32F-01, -02, -03, -04, R32V-03; Claude's R32F full-model audit, confirmed or qualified by ChatGPT's R32V; the owner's
 * decisions of 2026-09-29: 1 "Pay by law", 2 "Build it", 3 "Today's dollars"; survivor start "Start at 60 or the death") -- THE SOCIAL
 * SECURITY CORE.
 *
 * Sources, each read at the primary text: 20 CFR 404.333 (the spouse's benefit, one-half the insured's PIA), 404.335 ("died fully
 * insured"), 404.338 and POMS RS 00615.301 (the survivor's original benefit is the death PIA, with any delayed credits), POMS RS
 * 00615.320 (RIB-LIM: the larger of the deceased's reduced benefit and 82 1/2% of the PIA, after the age reduction), 404.410 (5/9 and
 * 5/12 of 1% a month for a retirement benefit; 25/36 and 5/12 of 1% for a spouse's), 404.271 (COLAs from December of the eligibility
 * year), 404.212(c) and 404.275(c) (a PIA and each COLA-increased PIA to the next lower $0.10), 404.304(f) (the monthly benefit to the
 * next lower $1); SSA's Normal Retirement Age table (67 for 1960 and later; survivors two years behind).
 *
 * Every household here is born 1960 or later unless stated, so full retirement age is 67. Rows are read by the self's age at the row's
 * opening. A 0% return; the tax is paid from a large taxable account; only Social Security is income. */
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

function run(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: o.age, retireAge: 50, endAge: o.endAge, spouseOn: o.spouseAge !== undefined,
    spouseAge: o.spouseAge === undefined ? o.age : o.spouseAge, filing: o.spouseAge !== undefined ? 'mfj' : 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 50 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, stages: [], expenses: [], otherIncomes: [],
    pension: 0, ssBenefit: o.pia || 0, ssClaim: o.claim || 67, ssFra: 67, ssCola: o.cola || 0, ssAdvanced: !!o.aime, aime: o.aime || 0,
    spouseSS: o.spousePia || 0, spouseClaim: o.spouseClaim || 67, survivor: !!o.survivor, survivorSpendingReduction: 0,
    selfLife: o.selfLife || 95, spouseLife: o.spouseLife || 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [{ id: 't', name: 't', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 2000000, basisPct: 100, contribution: 0,
    contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  /* The row that OPENS at the self's age `at`. */
  return (at) => { const i = r.rows.findIndex((x, k) => k > 0 && Math.abs(r.rows[k - 1].age - at) < 1e-9); return Math.round(r.rows[i].income * 100) / 100; };
}
const floorDime = (x) => Math.floor(x * 10 + 1e-6) / 10;

test('R34 SA32F-01: a survivor of an early claimant is paid on the PIA, limited to the larger of the reduced benefit and 82.5%', () => {
  /* The self (62, born 1964) has a PIA of 3,000 and claims at 62: 30% off, 2,100. The spouse (67, born 1959; survivor FRA 66 and 6
     months, SSA's table two years behind) has no benefit of their own. The self dies at 68; the spouse, 73, is past survivor FRA:
     100% of the PIA, 3,000, limited to max(2,100, 82.5% x 3,000 = 2,475) = 2,475 a month, 29,700 a year. The engine paid the reduced
     2,100 times the survivor factor: 25,200. */
  const income = run({ age: 62, endAge: 71, spouseAge: 67, pia: 3000, claim: 62, spouseClaim: 67, survivor: true, selfLife: 68 });
  assert.strictEqual(income(69), 29700);
});

test('R34 SA32F-01: the same survivor starting at 60 takes the age reduction first, then the limit', () => {
  /* The spouse is 54 (born 1972, survivor FRA 67); at the self's death at 68 the spouse is 60: 71.5% of 3,000 = 2,145, under the 2,475
     limit: 2,145 a month, 25,740 a year. The engine: 2,100 x 0.715 x 12 = 18,018. */
  const income = run({ age: 62, endAge: 71, spouseAge: 54, pia: 3000, claim: 62, spouseClaim: 67, survivor: true, selfLife: 68 });
  assert.strictEqual(income(69), 25740);
});

test('R34 SA32F-02: a worker who dies before claiming leaves a survivor benefit on the PIA (decision 1)', () => {
  /* The self (60, born 1966) has a PIA of 3,000, planned claim 67, dies at 65. The spouse (62, born 1964, survivor FRA 67) is 67 at the
     death: 100% of the PIA, 36,000 a year. The engine paid nothing: no claim was "established". */
  assert.strictEqual(run({ age: 60, endAge: 67, spouseAge: 62, pia: 3000, claim: 67, spouseClaim: 67, survivor: true, selfLife: 65 })(65), 36000);
  /* A worker who dies AFTER full retirement age without claiming leaves the delayed credits earned to the death: planned claim 70, death
     at 69: 24 months past 67, +16%: 3,480 a month, 41,760 a year. */
  assert.strictEqual(run({ age: 60, endAge: 71, spouseAge: 62, pia: 3000, claim: 70, spouseClaim: 67, survivor: true, selfLife: 69 })(69), 41760);
});

test('R34 SA32F-03: the spouse\'s benefit -- half the worker\'s PIA, less the spouse\'s own, reduced for an early start (decision 2)', () => {
  /* Both 66 (born 1960, FRA 67), both claiming at 67. The worker's PIA is 3,000; the spouse has none: 1,500 a month from 67. The row at
     67: 3,000 + 1,500 = 4,500 a month, 54,000 a year. The engine paid the worker alone: 36,000. */
  assert.strictEqual(run({ age: 66, endAge: 69, spouseAge: 66, pia: 3000, claim: 67, spousePia: 0, spouseClaim: 67 })(67), 54000);
  /* The spouse has 600 of their own: own 600 + excess (1,500 - 600) = 1,500; the household again 54,000 (the engine: 43,200). */
  assert.strictEqual(run({ age: 66, endAge: 69, spouseAge: 66, pia: 3000, claim: 67, spousePia: 600, spouseClaim: 67 })(67), 54000);
  /* Both claim at 62 (both 62, born 1964): the worker 30% off, 2,100; the spouse's excess 60 months early, 36 x 25/36 + 24 x 5/12 = 35%
     off, 975. 3,075 a month, 36,900 a year. */
  assert.strictEqual(run({ age: 62, endAge: 64, spouseAge: 62, pia: 3000, claim: 62, spousePia: 0, spouseClaim: 62 })(62), 36900);
});

test('R34 SA32F-04: the entered benefit is in today\'s dollars and takes the COLA up to the claim (decision 3)', () => {
  /* 60 (born 1966), 2,000 a month at full retirement age in today's dollars, claim 67, a 2.8% COLA: seven COLAs to 67, each to the dime,
     then paid unreduced, to the dollar. The engine paid 2,000 flat: 24,000. */
  let pia = 2000;
  for (let i = 0; i < 7; i++) pia = floorDime(pia * 1.028);
  assert.strictEqual(run({ age: 60, endAge: 68, pia: 2000, claim: 67, cola: 2.8 })(67), Math.floor(pia) * 12);
  /* The earnings-based PIA (62, born 1964, AIME 6,000): 0.9 x 1,286 + 0.32 x 4,714 = 2,665.88, to the dime 2,665.80; COLAs from 62 to the
     claim at 67 -- five -- each to the dime; unreduced; to the dollar. The engine: 2,665.88 x 12 = 31,990.56. */
  let aimePia = floorDime(0.9 * 1286 + 0.32 * (6000 - 1286));
  for (let i = 0; i < 5; i++) aimePia = floorDime(aimePia * 1.028);
  assert.strictEqual(run({ age: 62, endAge: 68, aime: 6000, claim: 67, cola: 2.8 })(67), Math.floor(aimePia) * 12);
});

test('R32V-03: SSA\'s rounding -- the PIA to the dime, the benefit to the dollar', () => {
  /* AIME 5,825: 0.9 x 1,286 + 0.32 x 4,539 = 2,609.88, to the dime 2,609.80; at full retirement age with no COLA the benefit is 2,609.80,
     to the dollar 2,609: 31,308 a year. The engine: 31,318.56. */
  assert.strictEqual(run({ age: 62, endAge: 68, aime: 5825, claim: 67 })(67), 31308);
});
