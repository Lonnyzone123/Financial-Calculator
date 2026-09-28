/* S5AA R6 external audit, EA-01: the projection carried on after the last person it models had died,
 * and said nothing unless a required distribution or a QCD happened to be billed on the dead.
 *
 * UNSUPPORTED_POST_DEATH_HOUSEHOLD was keyed to ONE SYMPTOM -- an account billed on a dead owner's age --
 * and returned early when there was none. So a couple who both died inside the horizon with nothing
 * but a taxable account kept spending, drawing, paying tax and earning returns for years, and the
 * result carried no exclusion at all. The R6 handover said the entry identifies the last household
 * death; for that household it did not.
 *
 * The fix separates the two questions, as the auditor asked:
 *   - "does anybody this plan models survive into this row?" -- the DOMAIN STATE. It is answered by
 *     householdSurvivorship() on the projection's own row starts, and by nothing else: no balance, no
 *     RMD setting, no wage, no QCD enters it;
 *   - "what is still billed on the dead?" -- which only ENRICHES the entry (state.deaths[].carried).
 *
 * A HOUSEHOLD OF ONE IS INCLUDED. The auditor's predicate is "no modelled household member survives",
 * and a lone person who dies before the horizon ends leaves exactly that. The default plan is such a
 * household (a lifespan of 95 against a horizon of 100), so it now carries the exclusion. That is the
 * honest reading of those four rows (opening at 96 to 99), which F-02 left as they were; the app renders
 * only one engine issue code, so no screen changes.
 *
 * S5AA R9 ROUND, the owner's decision 8 (2026-09-21): THOSE ROWS ARE NO LONGER PROJECTED. EA-01 disclosed them and left what
 * a projection should DO there to a decision; the decision is to stop at the last death. The DOMAIN STATE this file pins
 * is unchanged -- householdSurvivorship() on the projection's own row openings, and nothing else -- but it now ENDS the
 * projection instead of marking what follows. Every test below is INVERTED to that: where the exclusion was raised, the
 * projection stops at the same row opening and PROJECTION_ENDS_AT_LAST_DEATH says so, inside the domain; where it was
 * not, nothing is cut. What was "billed on the dead" cannot happen, because no row follows the last death.
 *
 * Tested through runPlan only.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const cash = (balance) => ({ id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance,
  basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
  frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0,
  matchRate: 0, profitShare: 0, vesting: 100, priority: 1 });

function run(over) {
  over = over || {};
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 70, spouseAge: 70, retireAge: 65, endAge: 90, spouseOn: true, filing: 'mfj' }, over.profile);
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 40000, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 95, spouseLife: 95,
  }, over.retirement);
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, qcd: 0, debts: [], otherAssets: [] }, over.advanced);
  p.accounts = 'accounts' in over ? over.accounts : [cash(2000000)];
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const said = (r) => (r.issues || []).find((i) => i.code === 'PROJECTION_ENDS_AT_LAST_DEATH');
const last = (r) => r.rows[r.rows.length - 1].age;
const noExclusion = (r) => !(r.issues || []).some((i) => i.code === 'UNSUPPORTED_POST_DEATH_HOUSEHOLD' || (i.state && i.state.outsideSupportedDomain));

test('EA-01, inverted by decision 8: both spouses die with only a taxable account -- the projection stops at the same row', () => {
  const r = run({ retirement: { selfLife: 75, spouseLife: 80 } });
  assert.equal(last(r), 81, 'the last row is the year of the spouse\'s death; nothing is spent for nobody after it');
  const issue = said(r);
  assert.ok(issue, 'the cut is disclosed whatever the accounts hold');
  assert.equal(issue.state.outsideSupportedDomain, undefined, 'and it is not an exclusion: no such row exists');
  assert.equal(issue.state.stoppedAtRowOpening, 81, 'the first row that opens with nobody alive (the spouse died at self-age 80)');
  assert.equal(issue.state.path, 'retirement.spouseLife', 'the lifespan that places the LAST death');
  assert.ok(/Both people this plan models have died by the year beginning at age 81/.test(issue.message), 'the prose names the state');
  assert.ok(noExclusion(r));
});

test('EA-01, inverted by decision 8: no accounts at all -- the predicate is about survival, not holdings', () => {
  const r = run({ accounts: [], retirement: { spending: 0, selfLife: 75, spouseLife: 80 } });
  assert.ok(said(r), 'the projection with nothing in it still stops at the last death');
  assert.equal(last(r), 81);
});

test('EA-01, inverted by decision 8: a death in the final row cuts nothing, and nothing is invented', () => {
  /* endAge 90: the last row opens at 89. A last death at 89 is the year of death, and no row opens after it; a last
     death at 88 leaves the row opening at 89, which is no longer projected. */
  const at89 = run({ retirement: { selfLife: 75, spouseLife: 89 } });
  assert.ok(!said(at89), 'the last row is already the year of death');
  assert.equal(last(at89), 90);
  const at88 = run({ retirement: { selfLife: 75, spouseLife: 88 } });
  assert.ok(said(at88), 'CONTROL: one row after it is enough to cut');
  assert.equal(last(at88), 89);
});

test('EA-01: one spouse dying with the other surviving is NOT cut and NOT outside the domain', () => {
  const r = run({ retirement: { spouseLife: 80 } });
  assert.ok(!said(r) && noExclusion(r), 'the survivor is alive to the end of the horizon');
  assert.equal(last(r), 90);
});

test('EA-01, inverted by decision 8: a household of one whose person dies before the horizon ends stops at the death', () => {
  const r = run({ profile: { spouseOn: false, filing: 'single' }, retirement: { selfLife: 80 } });
  const issue = said(r);
  assert.ok(issue, 'nobody survives, which is the predicate');
  assert.equal(issue.state.path, 'retirement.selfLife');
  assert.equal(last(r), 81);
  assert.ok(!/Both people/.test(issue.message), 'there was never a spouse, and the prose does not say otherwise');
  assert.ok(/The person this plan models has died by the year beginning at age 81, so the projection stops there/.test(issue.message), 'and it reads as a sentence');
  assert.ok(!said(run({ profile: { spouseOn: false, filing: 'single' } })), 'CONTROL: alive to the end, nothing said');
});

test('EA-01, inverted by decision 8: the default plan -- a lifespan of 95 against a horizon of 100 -- stops at 96', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok');
  assert.ok(p.retirement.selfLife < p.profile.endAge && !p.profile.spouseOn, 'CONTROL: the fixture is what this test says it is');
  assert.ok(said(r), 'the four rows opening at 96 to 99, which projected nobody, are not projected');
  assert.equal(last(r), 96);
  assert.ok(noExclusion(r));
});

test('EA-01, inverted by decision 8: nothing is billed on the dead, because no row follows the last death', () => {
  const r = run({
    advanced: { rmdOn: true },
    /* RE-FIXTURED at the R7 re-audit (A4-6): the IRA is drawn last and holds enough to be billed on. It was the case where
       the exclusion named "required distributions" billed after both deaths; there are no such rows now. */
    retirement: { selfLife: 75, spouseLife: 80, withdrawalOrder: 'manual', manualOrder: 'taxable,preTax,roth,hsa' },
    accounts: [cash(2000000), Object.assign(cash(1000000), { id: 'ira', type: 'traditionalIRA', taxClass: 'preTax', basisPct: 0, owner: 'spouse', priority: 2 })],
  });
  assert.ok(r.rows.some((x) => x.age === 81 && Number(x.rmd) > 0), 'CONTROL: the IRA is billed in the year its owner dies');
  assert.equal(last(r), 81, 'and never after');
  assert.ok(said(r) && noExclusion(r));
});

/* INVERTED again after the R9 round (fifth internal audit, finding 3; the owner, 2026-09-22, "refuse"): the plan with no living
   person in it was cut at its opening and reported "ok" over no projected years. It is now refused at the input gate. */
test('EA-01, inverted by the refusal: both lifespans ended before the plan starts -- the plan is refused, nothing is reported as projected', () => {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 70, spouseAge: 70, retireAge: 65, endAge: 90, spouseOn: true, filing: 'mfj' });
  Object.assign(p.retirement, { selfLife: 65, spouseLife: 66 });
  p.accounts = [cash(2000000)];
  const r = engine.runPlan(p);
  assert.equal(r.calculationErrorCode, 'SCENARIO_NOBODY_ALIVE_AT_START', 'the projection has no living person in it at all');
  assert.equal(r.rows, null, 'no rows, so no success over no years');
  assert.ok(!said(r), 'no cut is reported: nothing was projected to cut');
});
