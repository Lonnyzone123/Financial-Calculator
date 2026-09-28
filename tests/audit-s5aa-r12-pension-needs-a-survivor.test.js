/* S5AA, R12 round: THE PENSION WARNING SPEAKS ONLY WHERE A SURVIVOR IS PAID (external re-audit of `b053dc2`, R11-03).
 *
 * PENSION_AFTER_DEATH_ASSUMED tells a household that its pension is assumed to continue, in full, to a survivor. The R11
 * repair (637bd25) stopped it describing a pension that starts after the projection has stopped, but it still asked only
 * whether the pension is payable before the cut. The year of a death is a year the person lived in (the model's accepted
 * death-year convention), so a pension paid in that year is not paid after the death. MEASURED at `b053dc2`: one person,
 * age and lifespan 80, retired, pension $12,000, horizon 81 -- one row, the pension paid in the year of death as the
 * convention says, and a warning describing a joint-and-survivor annuity continuing to a survivor this household does
 * not have.
 *
 * It now asks for a row the projection actually reaches in which the pension's owner is dead: the first row opening
 * after the death (where householdSurvivorship() first counts them dead), or the retirement age where that comes later,
 * against the cut. A household of one has no such row; nor does a couple dying in the same year. Tested through runPlan.
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
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

function run(over) {
  over = over || {};
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 80, retireAge: 65, endAge: 81, spouseOn: false, spouseAge: 80, filing: 'single' }, over.profile);
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, spouseSS: 0, pension: 12000,
    stages: [], expenses: [], otherIncomes: [], selfLife: 80, spouseLife: 95, survivor: false }, over.retirement);
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false,
    otherAssets: [], debts: [] });
  p.accounts = [{ id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 500000, basisPct: 100, contribution: 0, priority: 1 }];
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const said = (r) => (r.issues || []).filter((i) => i.code === 'PENSION_AFTER_DEATH_ASSUMED');

test('R11-03: one person, the pension paid in the year of death -- no survivor is claimed', () => {
  const r = run();
  assert.deepEqual(r.rows.map((x) => x.age), [80, 81]);
  assert.equal(Number(r.rows[1].income), 12000, 'CONTROL: the year of death is a year lived in, and the pension is paid');
  assert.equal(said(r).length, 0, 'there is no survivor to continue it to');
});

test('R11-03: the same person against a long horizon -- the projection stops at the death, and nothing is claimed', () => {
  assert.equal(said(run({ profile: { endAge: 100 } })).length, 0);
});

test('R11-03: a couple who die in the same year -- no survivor, nothing claimed', () => {
  const r = run({ profile: { endAge: 100, spouseOn: true, spouseAge: 80, filing: 'mfj' }, retirement: { spouseLife: 80 } });
  assert.equal(r.rows[r.rows.length - 1].age, 81);
  assert.equal(said(r).length, 0);
});

test('R11-03 control: a spouse who outlives the pension\'s owner is paid, and the assumption is disclosed', () => {
  const r = run({ profile: { endAge: 90, spouseOn: true, spouseAge: 78, filing: 'mfj' }, retirement: { spouseLife: 95 } });
  assert.ok(r.rows.some((x) => x.age > 81 && Number(x.income) > 0), 'the pension really is paid after the death');
  const w = said(r);
  assert.equal(w.length, 1);
  assert.equal(w[0].state.paidAfterDeathFrom, 81, 'from the first row in which the owner is dead');
});

test('R11-03 control: an owner who dies before retiring, with a spouse alive, still gets the starker warning', () => {
  const r = run({ profile: { age: 55, spouseAge: 55, retireAge: 65, endAge: 80, spouseOn: true, filing: 'mfj' },
    retirement: { selfLife: 60, spouseLife: 95 } });
  const w = said(r);
  assert.equal(w.length, 1);
  assert.equal(w[0].state.paidAfterDeathFrom, 65, 'it starts paying at the retirement age, after the death');
  assert.match(w[0].message, /starts paying only after that death/);
});
