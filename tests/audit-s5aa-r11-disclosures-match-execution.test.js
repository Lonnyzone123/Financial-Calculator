/* S5AA, R11 round: TWO DISCLOSURES DESCRIBED SOMETHING THE PROJECTION DID NOT DO (external audit of `02b921a`,
 * R10-07). Both are interactions with the R9 decisions, and both read CONFIGURED state where the row read EXECUTED
 * state -- the same class of defect as R7-02/R7-03/A4-6, one level out.
 *
 *  - PENSION_AFTER_DEATH_ASSUMED compares the age the pension starts against `profile.endAge`. Since decision 8 the
 *    projection stops at the last death, so a pension that starts after the cut is never paid. MEASURED at `02b921a`:
 *    self 80, lifespan 80, retiring at 85, horizon 100, pension $12,000 -- the projection stops at 81, every row's
 *    income is 0, and the disclosure still said the pension is paid after the death, from 85.
 *  - IRMAA_PRE_PLAN_MAGI_ASSUMED asks whether SELF is 65 or older in the plan's first two years. Since decision 6 the
 *    Medicare charge is per living person, so a spouse can be charged while self is not. MEASURED at `02b921a`:
 *    self 60, spouse 67, retired, horizon 61 -- the spouse is charged Medicare on an assumed zero lookback MAGI, and
 *    nothing said so.
 *
 * Both now read the projection: the pension against the cut decision 8 makes, and the IRMAA warning against the people
 * actually charged Medicare in those years. Tested through runPlan.
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
  Object.assign(p.profile, { age: 80, retireAge: 85, endAge: 100, spouseOn: false, spouseAge: 80, filing: 'single' }, over.profile);
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, spouseSS: 0, pension: 12000,
    stages: [], expenses: [], otherIncomes: [], selfLife: 80.5, spouseLife: 95, survivor: false }, over.retirement);
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false,
    otherAssets: [], debts: [] }, over.advanced);
  p.accounts = [{ id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 500000, basisPct: 100, contribution: 0, priority: 1 }];
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const said = (r, code) => (r.issues || []).filter((i) => i.code === code);
const PENSION = 'PENSION_AFTER_DEATH_ASSUMED';
const IRMAA = 'IRMAA_PRE_PLAN_MAGI_ASSUMED';

test('R10-07: a pension that starts after the projection stops is not disclosed as paid after the death', () => {
  const r = run({});
  assert.equal(r.rows[r.rows.length - 1].age, 81, 'the projection stops at the death');
  assert.deepEqual(r.rows.map((x) => Number(x.income)), [0, 0], 'no pension is ever paid');
  assert.equal(said(r, PENSION).length, 0, 'nothing was paid after the death, so nothing is claimed');
});

test('R10-07 control: a pension that IS paid after a death, to a surviving spouse, is still disclosed', () => {
  const r = run({ profile: { retireAge: 70, spouseOn: true, spouseAge: 80, filing: 'mfj' }, retirement: { spouseLife: 95 } });
  const w = said(r, PENSION);
  assert.equal(w.length, 1, 'self dies at 80 with the pension in payment and the spouse alive');
  assert.equal(w[0].severity, 'WARNING');
  assert.ok(r.rows.some((x) => x.age > 81 && Number(x.income) > 0), 'the pension really is paid after the death');
});

/* RE-FIXTURED at the R12 round (external re-audit of b053dc2, R11-03). This control was a household of ONE, so the
   projection stopped at 76 and no row paid anybody after the death: it pinned the very warning R11-03 found invented a
   survivor. Its intent -- a pension genuinely paid after a death, with the horizon ending before the last death -- needs
   a spouse who survives, which is what it now has. */
test('R10-07 control: a pension paid to a surviving spouse, with the horizon ending first, is still disclosed', () => {
  const r = run({ profile: { age: 70, spouseAge: 70, retireAge: 70, endAge: 79, spouseOn: true, filing: 'mfj' },
    retirement: { selfLife: 75, spouseLife: 95 } });
  const w = said(r, PENSION);
  assert.equal(w.length, 1, 'paid to the spouse from 76, the first row after the death, to the horizon at 79');
  assert.equal(w[0].state.paidAfterDeathFrom, 76);
});

test('R10-07: a spouse charged Medicare in the first years raises the missing-lookback warning', () => {
  const r = run({ profile: { age: 60, spouseAge: 67, retireAge: 60, endAge: 61, spouseOn: true, filing: 'mfj' },
    retirement: { selfLife: 95, pension: 0 }, advanced: { healthOn: true } });
  const w = said(r, IRMAA);
  assert.equal(w.length, 1, 'the spouse is 67 and charged Medicare on an assumed zero lookback');
  assert.equal(w[0].severity, 'WARNING');
});

test('R10-07 control: self at 65 still raises it, and a household with nobody on Medicare in those years does not', () => {
  const self65 = run({ profile: { age: 66, retireAge: 60, endAge: 70 }, retirement: { selfLife: 95, pension: 0 }, advanced: { healthOn: true } });
  assert.equal(said(self65, IRMAA).length, 1, 'CONTROL: the original case is unchanged');
  const young = run({ profile: { age: 60, spouseAge: 60, retireAge: 60, endAge: 70, spouseOn: true, filing: 'mfj' },
    retirement: { selfLife: 95, pension: 0 }, advanced: { healthOn: true } });
  assert.equal(said(young, IRMAA).length, 0, 'CONTROL: nobody reaches Medicare in the first two years');
  const off = run({ profile: { age: 60, spouseAge: 67, retireAge: 60, endAge: 61, spouseOn: true, filing: 'mfj' },
    retirement: { selfLife: 95, pension: 0 }, advanced: { healthOn: false } });
  assert.equal(said(off, IRMAA).length, 0, 'CONTROL: no health costs, no Medicare, nothing to say');
});

test('R10-07 control: a spouse who is dead at the start is not counted as charged', () => {
  const r = run({ profile: { age: 60, spouseAge: 67, retireAge: 60, endAge: 70, spouseOn: true, filing: 'mfj' },
    retirement: { selfLife: 95, spouseLife: 66, pension: 0 }, advanced: { healthOn: true } });
  assert.equal(said(r, IRMAA).length, 0, 'the spouse died before the plan starts, so nobody is on Medicare');
});
