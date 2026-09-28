/* S5 task 11, on the owner's question 6 answered (A), 2026-09-14: the high-earner Roth catch-up rule
 * (ACCOUNT_RULES_ENGINE_REFERENCE_2026.md section 7.4).
 *
 * Catch-up contributions to a 401(k), 403(b) or governmental 457(b) must be designated Roth when the employee's
 * prior-calendar-year FICA wages from the employer sponsoring that plan exceed $150,000. The rules held one Boolean,
 * rothCatchupMandatoryIn2026: false, which kept the weaker fact (the final regulations do not yet apply) and dropped the
 * stronger one (the statute does). The rule is now four facts and a threshold, each a record with an authority status,
 * and each workplace account carries its sponsoring employer's prior-year FICA wages. rothCatchupStatus() answers
 * ACCOUNT section 17's Test 2. The contribution audit warns when a pre-tax workplace account uses catch-up room and the
 * rule requires Roth, or when the wages are missing. The engine still models that catch-up as pre-tax, and runPlan()
 * results do not move.
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
const { validateScenario } = require('../src/scenario-validator.js');
const defaultPlan = () => eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const k401 = (o) => Object.assign({
  id: 'k', name: 'Work 401(k)', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 0, basisPct: 0,
  priority: 1, contributionMode: 'dollar', contribution: 0, frequency: 12, annualChange: 0, annualChangeMode: 'percent',
  changeTiming: 'annual', futureChanges: [], allocation: {}, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0,
  vesting: 100,
}, o);
function audit(account, salary) {
  const p = defaultPlan();
  // Still working and contributing at 55: the default plan retires and stops contributions at 55, which would make the
  // owner ineligible and the audit return before any limit is applied.
  Object.assign(p.profile, { age: 55, retireAge: 65, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { contributionStop: 65 });
  p.accounts = [account];
  return engine.auditContributions(p, 55, salary, 0, engine.ownerContributionEligibility(p, 55, p.profile.spouseAge, 1));
}
const ROTH_REQUIRED = /must be designated Roth/;
const WAGES_MISSING = /cannot be applied/;

test('ACCOUNT section 17 Test 2: $175,000 of prior-year FICA wages from the sponsoring 401(k) employer puts a 55-year-old under the Roth catch-up rule, with the four facts kept apart', () => {
  const s = engine.rothCatchupStatus(k401({ priorYearFicaWages: 175000 }));
  assert.equal(s.catchupRothRuleStatutorilyEffective, true);
  assert.equal(s.administrativeTransitionReliefActive, false);
  assert.equal(s.finalRegulationsMandatorilyApplicable, false);
  assert.equal(s.reasonableGoodFaithOperation, true);
  assert.equal(s.wageThreshold, 150000);
  assert.equal(s.appliesToAccount, true);
  assert.equal(s.required, true);
});

test('only wages from the sponsoring employer count, and exactly $150,000 does not exceed the threshold', () => {
  assert.equal(engine.rothCatchupStatus(k401({ priorYearFicaWages: 150000 })).required, false, 'at the threshold');
  assert.equal(engine.rothCatchupStatus(k401({ priorYearFicaWages: 150001 })).required, true, 'a dollar over');
  const a = audit(k401({ contribution: 30000, priorYearFicaWages: 90000 }), 400000);
  assert.equal(a.warnings.some((w) => ROTH_REQUIRED.test(w)), false, 'a $400,000 salary does not sweep in $90,000 of wages from this employer: ' + JSON.stringify(a.warnings));
});

test('the contribution audit warns that a pre-tax 401(k)\'s catch-up must be Roth when catch-up room is used and the wages exceed the threshold', () => {
  const over = audit(k401({ contribution: 30000, priorYearFicaWages: 175000 }), 175000);
  assert.ok(over.warnings.some((w) => ROTH_REQUIRED.test(w)), JSON.stringify(over.warnings));
  const within = audit(k401({ contribution: 20000, priorYearFicaWages: 175000 }), 175000);
  assert.equal(within.warnings.some((w) => ROTH_REQUIRED.test(w)), false, 'no catch-up room used: ' + JSON.stringify(within.warnings));
});

test('without prior-year wages from the employer, the audit warns that the rule cannot be applied instead of treating the account as exempt', () => {
  const a = audit(k401({ contribution: 30000 }), 175000);
  assert.ok(a.warnings.some((w) => WAGES_MISSING.test(w)), JSON.stringify(a.warnings));
  const s = engine.rothCatchupStatus(k401({}));
  assert.equal(s.wagesMissing, true);
  assert.equal(s.required, false);
});

test('the rule is five records with authority statuses, and the single Boolean is gone', () => {
  const w = RULES.retirement.workplace;
  assert.equal(Object.prototype.hasOwnProperty.call(w, 'rothCatchupMandatoryIn2026'), false, 'rothCatchupMandatoryIn2026 retired');
  assert.equal(Object.prototype.hasOwnProperty.call(w, 'rothCatchupWageThreshold'), false, 'the flat threshold moved into its record');
  const expected = {
    roth_catchup_statutory_effective: [true, 'ENACTED'],
    administrative_transition_relief_active: [false, 'OFFICIAL_2026'],
    final_regulation_mandatory_applicability: [false, 'OFFICIAL_2026'],
    reasonable_good_faith_operation_allowed: [true, 'OFFICIAL_2026'],
    prior_year_fica_wage_threshold: [150000, 'OFFICIAL_2026'],
  };
  const records = (w.rothCatchup && w.rothCatchup.records) || [];
  assert.deepEqual(records.map((r) => r.provision_id).sort(), Object.keys(expected).sort());
  for (const [id, [value, status]] of Object.entries(expected)) {
    const r = records.find((x) => x.provision_id === id);
    assert.equal(r.value, value, id);
    assert.equal(r.status, status, id);
    assert.equal(r.tax_year, 2026, id);
    assert.ok(r.source_url && r.form_or_code_reference, id + ' is cited');
  }
});

test('the validator refuses non-numeric prior-year FICA wages and warns on negative ones', () => {
  const issuesFor = (wages) => {
    const p = defaultPlan();
    p.accounts = [k401({ priorYearFicaWages: wages })];
    return validateScenario(p).issues.filter((i) => i.path === 'accounts[0].priorYearFicaWages');
  };
  assert.deepEqual(issuesFor('lots').map((i) => [i.code, i.severity]), [['WRONG_TYPE', 'ERROR']]);
  assert.deepEqual(issuesFor(-5).map((i) => [i.code, i.severity]), [['OUT_OF_RANGE', 'WARNING']]);
  assert.deepEqual(issuesFor(175000), []);
});

test('the disclosure states the statutory rule, the ended transition relief, the final regulations and good-faith operation, each with its status', () => {
  assert.equal(SHELL.includes('does not force Roth catch-ups in 2026'), false, 'the one-fact disclosure is replaced');
  for (const phrase of ['must be designated Roth', 'transition relief', 'final regulations', 'good-faith', 'prior-year FICA wages']) {
    assert.ok(SHELL.includes(phrase), phrase);
  }
});

test('control: a Roth 401(k) is not warned, since its catch-up is already Roth', () => {
  const a = audit(k401({ type: 'roth401k', taxClass: 'roth', contribution: 30000, priorYearFicaWages: 175000 }), 175000);
  assert.equal(a.warnings.some((w) => ROTH_REQUIRED.test(w) || WAGES_MISSING.test(w)), false, JSON.stringify(a.warnings));
});

test('control: runPlan() results do not move when a workplace account carries prior-year FICA wages', () => {
  const base = defaultPlan();
  base.accounts = base.accounts.concat([k401({ id: 'k-extra', contribution: 30000 })]);
  const withWages = JSON.parse(JSON.stringify(base));
  withWages.accounts[withWages.accounts.length - 1].priorYearFicaWages = 175000;
  const a = engine.runPlan(base);
  const b = engine.runPlan(withWages);
  assert.equal(a.status, 'ok', 'the plan runs');
  assert.ok(a.rows.length > 1, 'and has rows');
  assert.equal(b.status, a.status);
  assert.deepEqual(b.rows, a.rows);
  assert.deepEqual(b.issues, a.issues);
});
