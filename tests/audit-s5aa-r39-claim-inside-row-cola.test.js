/* S5AA R39 (R38-04, ChatGPT's R38 change audit, P2; the owner 2026-09-29: "go with your recommendations") -- A BENEFIT THAT STARTS INSIDE A
 * PROJECTION YEAR IS PRICED AT THE CLAIM, WITH THE COLAS THE CLAIM HAS EARNED.
 *
 * The entered benefit is in today's dollars and takes each COLA from the plan's start to the claim (R34, decision 3; 20 CFR 404.271 applies
 * COLAs to the PIA before entitlement). The row priced every person's PIA at the row's OPENING age, so a claim inside the row missed a
 * COLA completed between the opening and the claim: a plan opening at 66.5 with a claim at 67.5 -- one full year after the start, halfway
 * through the row 67 -> 68 -- was paid without that year's COLA. The claimant's own PIA is now priced at the claim when the claim falls
 * inside the row. A benefit already being paid keeps the row-constant amount (R2-004), as before.
 *
 * No assets, wages, other income, return or spending; a 10% COLA so each step is visible. FRA 67 (birth year 2026 - 66 = 1960). */
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

function incomeAt(profile, retirement, closingAge) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { filing: 'single', spouseOn: false }, profile);
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: profile.retireAge });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 95, spouseLife: 95, ssCola: 10 }, retirement);
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return r.rows.find((x) => Math.abs(x.age - closingAge) < 1e-9).income;
}

test('R39 R38-04: a claim inside the row takes the COLA it has earned (ChatGPT\'s witness)', () => {
  /* $2,000 PIA; claim at 67.5, one year after the plan's start at 66.5: one COLA, 2,200.00; six months of delayed credit beyond 67,
     x 1.04 = 2,288. Six months paid in the row 67 -> 68: 13,728. The engine priced it at 67, before the COLA: 2,080 x 6 = 12,480. */
  assert.strictEqual(incomeAt({ age: 66.5, retireAge: 66.5, endAge: 68 }, { ssBenefit: 2000, ssClaim: 67.5 }, 68), 13728);
});

test('R39 R38-04: a spouse whose claim falls inside a row, on the spouse\'s own clock', () => {
  /* The spouse is 65.5 at the start (birth year 1961, FRA 67) and claims $2,000 at their 67.5 -- two years after the start, which is inside
     the self's row 68 -> 69. Two COLAs: 2,200.00, 2,420.00; x 1.04 = 2,516.80, paid as 2,516 a month for six months: 15,096. The engine
     priced it at the spouse's row opening, 67, one COLA: 2,288 x 6 = 13,728. The self claims at 70, after the plan ends. */
  assert.strictEqual(incomeAt({ age: 66.5, retireAge: 66.5, endAge: 70, spouseOn: true, spouseAge: 65.5, filing: 'mfj' },
    { spouseSS: 2000, spouseClaim: 67.5, ssClaim: 70 }, 69), 15096);
});

test('R39 R38-04: controls -- a claim at the row\'s opening, and the year after a claim, are unchanged', () => {
  /* A claim at 67, the row's opening: no COLA has completed (half a year since the start), 2,000 x 12 = 24,000, as before. */
  assert.strictEqual(incomeAt({ age: 66.5, retireAge: 66.5, endAge: 68 }, { ssBenefit: 2000, ssClaim: 67 }, 68), 24000);
  /* The spouse's next row, 69 -> 70 on the self's clock: two COLAs at its opening, 2,516 x 12 = 30,192, as before. */
  assert.strictEqual(incomeAt({ age: 66.5, retireAge: 66.5, endAge: 70, spouseOn: true, spouseAge: 65.5, filing: 'mfj' },
    { spouseSS: 2000, spouseClaim: 67.5, ssClaim: 70 }, 70), 30192);
});
