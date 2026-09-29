/* S5AA R34 (SA32F-05, SA32F-25; Claude's R32F full-model audit, confirmed by ChatGPT's R32V; the owner 2026-09-29: "Follow law
 * everywhere") -- EACH PERSON'S FULL RETIREMENT AGE COMES FROM THEIR BIRTH YEAR.
 *
 * SSA, Normal Retirement Age (ssa.gov/oact/progdata/nra.html, read in a browser; the site refuses automated fetches): 65 for 1937
 * and before, then two months a year to 65 and 10 months for 1942; 66 for 1943-54; 66 and 2 months for 1955, rising two months a
 * year to 66 and 10 months for 1959; 67 for 1960 and later. The engine read ONE entered figure, `retirement.ssFra`, for both
 * people, and validated nothing about it (an FRA of 60 or 75 was paid from). The birth year is the plan's whole-age reading,
 * 2026 - floor(age), as the RMD start age already reads it (MODEL_ASSUMPTIONS section 12). `ssFra` no longer decides anything.
 *
 * Each case pays a benefit whose monthly figure is a whole number of dollars, so SSA's rounding (a later commit) leaves it as is.
 * Early reduction: 5/9 of 1% a month for the first 36 months, 5/12 of 1% beyond; delayed credit: 2/3 of 1% a month. */
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

/* A retired couple at a 0% COLA and return; only the spouse has a benefit, so the row's income is the spouse's Social Security. */
function spouseBenefit(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 63, spouseOn: true, spouseAge: o.spouseAge, filing: 'mfj' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 60 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, stages: [], expenses: [], otherIncomes: [],
    pension: 0, ssBenefit: 0, ssClaim: 67, ssFra: o.ssFra === undefined ? 67 : o.ssFra, ssCola: 0, spouseSS: o.pia, spouseClaim: o.claim,
    survivor: false, selfLife: 95, spouseLife: 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [{ id: 't', name: 't', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 500000, basisPct: 100, contribution: 0,
    contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  /* The row that opens when the spouse is already at the claim age (or row 1 for a claim before the plan). */
  const row = r.rows.find((x, i) => i > 0 && o.spouseAge + (x.age - 1 - 60) >= o.claim - 1e-9) || r.rows[1];
  return Math.round(row.income * 100) / 100;
}

test('R34 SA32F-05: a spouse born in 1958 has a full retirement age of 66 and 8 months, not the self\'s 67', () => {
  /* Spouse 68 (born 1958), PIA 2,400 a month, claimed at 70: 40 months after 66 and 8 months, +26 2/3%: 3,040 a month,
     36,480 a year. The engine read 67 from `ssFra`: 36 months, +24%, 35,712. */
  assert.strictEqual(spouseBenefit({ spouseAge: 68, pia: 2400, claim: 70 }), 36480);
  /* The same spouse claimed at 62: 56 months early, 36 x 5/9 + 20 x 5/12 = 28 1/3%: 1,720 a month, 20,640 (was 60 months,
     30%: 20,160). */
  assert.strictEqual(spouseBenefit({ spouseAge: 68, pia: 2400, claim: 62 }), 20640);
});

test('R34 SA32F-05: the 1943-54 and 1960+ cohorts', () => {
  /* Born 1954 (72): FRA 66; claimed at 70, 48 months, +32%: 3,168 a month, 38,016 a year. */
  assert.strictEqual(spouseBenefit({ spouseAge: 72, pia: 2400, claim: 70 }), 38016);
  /* Born 1960 (66), CONTROL: FRA 67 either way; claimed at 62 (before the plan): 60 months, 30%: 1,680, 20,160. */
  assert.strictEqual(spouseBenefit({ spouseAge: 66, pia: 2400, claim: 62 }), 20160);
});

test('R34 SA32F-25: the entered `ssFra` decides nothing -- 60 and 75 pay what the birth year gives', () => {
  for (const ssFra of [60, 66.5, 75]) assert.strictEqual(spouseBenefit({ spouseAge: 68, pia: 2400, claim: 70, ssFra }), 36480, 'ssFra ' + ssFra);
});
