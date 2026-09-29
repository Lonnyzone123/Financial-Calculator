/* S5AA R35 (SA32F-18, the pension half; Claude's R32F full-model audit, qualified by ChatGPT's R32V: "A pension can lawfully
 * continue as a joint-and-survivor annuity ... Other-income pension treatment needs a clear survivor assumption") -- AN OTHER-INCOME
 * PENSION AT ITS OWNER'S DEATH.
 *
 * No statute sets what a private pension pays a survivor; the plan's own terms and the election do (a single-life annuity stops,
 * a joint-and-survivor annuity continues at its elected percentage, e.g. the 50% qualified joint and survivor annuity of IRC
 * 417(b)). So each `pension` stream carries `survivorPercent`: the share paid after its owner's death. Absent, it is 100%, the
 * same joint-and-survivor assumption the main pension already declares (PENSION_AFTER_DEATH_ASSUMED), and that assumption is
 * disclosed for the stream too. The engine paid every pension stream in full after its owner's death, and said nothing.
 *
 * A couple at 70; the spouse owns a $24,000 pension stream and dies at 72. A 0% return, no spending. */
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

function plan(stream, spouseLife) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 70, retireAge: 60, endAge: 76, spouseOn: true, spouseAge: 70, filing: 'mfj' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 50 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, stages: [], expenses: [], pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, selfLife: 95, spouseLife: spouseLife === undefined ? 72 : spouseLife,
    otherIncomes: [Object.assign({ name: 'Spouse pension', type: 'pension', owner: 'spouse', amount: 24000, start: 0, end: 200,
      growth: 0, growthMode: 'fixed' }, stream)] });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [{ id: 't', name: 't', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 1000000, basisPct: 100, contribution: 0,
    contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  return p;
}
function run(p) {
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return { income: (opening) => r.rows.find((x, k) => k > 0 && Math.abs(r.rows[k - 1].age - opening) < 1e-9).income, issues: r.issues || [] };
}

test('R35 SA32F-18: a pension stream pays its survivor share after its owner\'s death', () => {
  /* survivorPercent 50: 24,000 while the spouse lives (the row opening at 71), 12,000 after the death at 72. The engine paid
     24,000 in both. */
  const r = run(plan({ survivorPercent: 50 }));
  assert.strictEqual(r.income(71), 24000, 'alive');
  assert.strictEqual(r.income(72), 12000, 'after the death: 50%');
  /* A single-life pension (0%) stops. */
  assert.strictEqual(run(plan({ survivorPercent: 0 })).income(72), 0, 'a single-life pension stops at the death');
});

test('R35 SA32F-18: a death inside the row pays the whole share before it and the survivor share after', () => {
  /* The spouse dies at 72.5: half a year at 24,000 and half at 12,000 = 18,000. */
  assert.strictEqual(run(plan({ survivorPercent: 50 }, 72.5)).income(72), 18000);
});

test('R35 SA32F-18: with no survivor share entered, the stream continues in full and the result says it assumed that', () => {
  const r = run(plan({}));
  assert.strictEqual(r.income(72), 24000, '100%, the main pension\'s declared assumption');
  const said = r.issues.find((i) => i.code === 'PENSION_STREAM_AFTER_DEATH_ASSUMED');
  assert.ok(said, 'the assumption is disclosed');
  assert.strictEqual(said.severity, 'WARNING');
  assert.deepStrictEqual(said.state.streams, ['retirement.otherIncomes[0]']);
  /* An entered share is the household's own statement, not an assumption: nothing to disclose. */
  assert.ok(!run(plan({ survivorPercent: 100 })).issues.some((i) => i.code === 'PENSION_STREAM_AFTER_DEATH_ASSUMED'));
});

test('R35 SA32F-18: the validator bounds the survivor share to 0-100%', () => {
  const bad = validateScenario(plan({ survivorPercent: 150 }));
  assert.ok(bad.issues.some((i) => i.path === 'retirement.otherIncomes[0].survivorPercent'), 'out of range is reported');
  const ok = validateScenario(plan({ survivorPercent: 50 }));
  assert.ok(!ok.issues.some((i) => /survivorPercent/.test(i.path || '')));
});
