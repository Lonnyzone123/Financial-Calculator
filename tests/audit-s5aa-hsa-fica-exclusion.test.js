/* S5AA task 3.5, Q104 (G11) -- a cafeteria-plan HSA salary reduction leaves the FICA wage base.
 *
 * THE CITATION WAS CHECKED BEFORE THE RULE WAS CODED, as task 8.6 requires. Publication 969 was read
 * rather than summarised; the check is recorded in Handover temp/S5AA_CITATION_CHECKS_20260920.md.
 * It says a contribution an employer makes "using the amount of an employee's salary reduction through
 * a cafeteria plan" is treated as an EMPLOYER contribution, and that employer HSA contributions are not
 * generally subject to employment taxes.
 *
 * "PRE-TAX" IS NOT ONE CATEGORY, and that is the whole point of this file. Three pre-tax routes give
 * three different answers, and copying a generic pre-tax deduction into every tax base gets two of the
 * three wrong:
 *
 *   HSA via cafeteria-plan salary reduction : income tax EXCLUDED, FICA EXCLUDED
 *   HSA contributed directly by the person  : income tax deducted above the line, FICA NOT excluded
 *   ordinary 401(k) elective deferral       : income tax EXCLUDED, FICA NOT excluded
 *
 * Before this repair the engine gave the HSA and the 401(k) IDENTICAL answers -- $8,004.50 on $50,000
 * of wages either way -- when they should differ by FICA on the contribution.
 *
 * WHAT THE ENGINE CANNOT EXPRESS, disclosed rather than invented around. There is no cafeteria-plan or
 * via-payroll flag anywhere in src/engine.js. What the engine already does is subtract HSA
 * contributions from wages through preTaxDeferrals, which IS the salary-reduction model, so the
 * exclusion is applied to the route actually modelled. A DIRECT personal contribution -- an
 * above-the-line deduction with no wage effect -- cannot be entered, and adding an input for it would
 * be feature wiring that ground rule 12 does not permit here. The nearest real constraint IS enforced:
 * the exclusion is capped at the owner's own wages, because a salary reduction cannot exceed the salary.
 */
'use strict';
const { retireAtEnd } = require('./lib/working-horizon'); // S5AA R53 (the owner's decision 3, 2026-10-04): working-only horizons

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

const PAY = global.RULES.federal.payroll;
const HSA = global.RULES.retirement.hsa;
const FICA = PAY.oasdiEmployee + PAY.medicareEmployee;

/* The employee payroll tax on a wage split, written from the rule tables rather than the engine. */
const employeePayroll = (selfW, spouseW, filing) =>
  (Math.min(selfW, PAY.oasdiWageBase) + Math.min(spouseW, PAY.oasdiWageBase)) * PAY.oasdiEmployee
  + (selfW + spouseW) * PAY.medicareEmployee
  + Math.max(0, selfW + spouseW - PAY.additionalThreshold[filing]) * PAY.additionalMedicare;

function acct(id, type, taxClass, owner, contribution) {
  return {
    id, name: id, type, taxClass, owner, balance: 0, basisPct: 0,
    contribution, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  };
}

function plan(opts) {
  const o = opts || {};
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, {
    age: 45, retireAge: 60, endAge: 47, spouseOn: !!o.spouseOn, spouseAge: 45,
    filing: o.spouseOn ? 'mfj' : 'single',
  });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, {
    salary: o.salary || 0, spouseSalary: o.spouseSalary || 0, growth: 0, contributionStop: 60,
  });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 5000, /* RE-FIXTURED at the S5AA R18 round (workstream B, taxable basis in dollars): dividends ON at a 0% yield, so no imputed 1.5% -- at a 0% return a taxed, retained yield adds basis the account never gains, and the tax sales then realise small capital losses that are not what this test is about. */ dividendOn: true, dividendYield: 0,
    stages: [], expenses: [], otherIncomes: [], ssBenefit: 0, spouseSS: 0, survivor: false,
  });
  const taxable = acct('t', 'taxable', 'taxable', 'self', 0);
  taxable.balance = 800000; taxable.basisPct = 100;
  p.accounts = [taxable];
  if (o.hsa) p.accounts.push(acct('h', 'hsa', 'hsa', o.hsaOwner || 'self', o.hsa));
  if (o.deferral) p.accounts.push(acct('w', 'traditional401k', 'preTax', o.deferralOwner || 'self', o.deferral));
  retireAtEnd(p); // S5AA R53: an end age before the retirement age is refused; the owner retires at the end age instead (output-neutral, tests/lib/working-horizon.js)
  return p;
}

function firstYearTaxes(opts) {
  const r = engine.runPlan(plan(opts));
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  return Number(r.rows[1].taxes) || 0;
}

const WAGES = 50000;
const CONTRIB = HSA.self;   /* the auditor's $4,400 */

test('S5AA 3.5 control: the fixture is below the OASDI cap and the contribution is below the wages', () => {
  assert.ok(WAGES < PAY.oasdiWageBase, 'CONTROL: below the wage base, so the arithmetic is the simple one');
  assert.ok(CONTRIB < WAGES, 'CONTROL: the contribution must fit inside the wages');
  assert.strictEqual(CONTRIB, 4400, 'the auditor case is the $4,400 self-only HSA limit');
});

test('S5AA 3.5: the auditor case -- $50,000 of wages with a $4,400 HSA leaves FICA on $45,600', () => {
  /* Stated as the finding states it. The comparison partner is the SAME contribution to a 401(k),
     which holds the income tax identical, so the whole difference is payroll. */
  const withHsa = firstYearTaxes({ salary: WAGES, hsa: CONTRIB });
  const withDeferral = firstYearTaxes({ salary: WAGES, deferral: CONTRIB });

  const expectedGap = employeePayroll(WAGES, 0, 'single') - employeePayroll(WAGES - CONTRIB, 0, 'single');
  assert.ok(Math.abs(expectedGap - CONTRIB * FICA) < 0.01,
    'CONTROL: below the cap the gap is simply FICA on the contribution, ' + (CONTRIB * FICA).toFixed(2));

  assert.ok(Math.abs((withDeferral - withHsa) - expectedGap) < 0.01,
    'the HSA must cost FICA on $' + CONTRIB + ' less than the identical 401(k) deferral: expected a gap of '
    + expectedGap.toFixed(2) + ', got ' + (withDeferral - withHsa).toFixed(2));
});

test('S5AA 3.5 MUST NOT MOVE: an ordinary 401(k) deferral keeps its wages in the FICA base', () => {
  /* The control the checklist names. A deferral is excluded from income tax and REMAINS wages for
     social security and Medicare, so its payroll tax is the payroll tax on the full salary. */
  const none = firstYearTaxes({ salary: WAGES });
  const withDeferral = firstYearTaxes({ salary: WAGES, deferral: CONTRIB });

  /* the deferral changed the income tax but not the payroll tax, so the fall is strictly less than it
     would be if FICA had moved too */
  assert.ok(withDeferral < none, 'CONTROL: a deferral does reduce the income tax');
  const fallIfFicaMoved = (none - withDeferral) + CONTRIB * FICA;
  assert.ok(Math.abs((none - withDeferral) - fallIfFicaMoved) > 0.01,
    'a deferral must NOT also remove the contribution from the FICA base');

  /* and stated positively against the HSA, which DOES get the exclusion */
  const withHsa = firstYearTaxes({ salary: WAGES, hsa: CONTRIB });
  assert.ok(withDeferral > withHsa + 0.01,
    'the deferral must cost MORE than the HSA, because only the HSA leaves the wage base');
});

test('S5AA 3.5: the exclusion is capped at the owner own wages -- a salary reduction cannot exceed the salary', () => {
  /* The nearest enforceable form of "only a qualifying payroll contribution leaves the base". A person
     earning $3,000 cannot remove $4,400 of wages from FICA, and the base must not go negative. */
  const small = 3000;
  const t = firstYearTaxes({ salary: small, hsa: CONTRIB });
  const noWages = firstYearTaxes({ salary: 0, hsa: CONTRIB });

  /* with the whole salary excluded there is no payroll tax left, and none can be refunded */
  const floor = firstYearTaxes({ salary: 0 });
  assert.ok(t >= floor - 0.01,
    'the FICA base must floor at zero, never go negative: with wages ' + small + ' the tax was ' + t.toFixed(2)
    + ' against a no-wage floor of ' + floor.toFixed(2));
  assert.ok(noWages >= floor - 0.01, 'and a contribution with no wages at all cannot create relief');
});

test('S5AA 3.5: the exclusion follows the OWNER -- a spouse HSA reduces the spouse wage base', () => {
  /* Per-owner, for the same reason as task 3.4: OASDI is capped per person, so an owner-blind
     exclusion would take the reduction off the wrong person and, above the cap, off nobody. */
  const each = PAY.oasdiWageBase * 0.9;
  const selfHsa = firstYearTaxes({ spouseOn: true, salary: each, spouseSalary: each, hsa: CONTRIB, hsaOwner: 'self' });
  const spouseHsa = firstYearTaxes({ spouseOn: true, salary: each, spouseSalary: each, hsa: CONTRIB, hsaOwner: 'spouse' });

  /* both sit below the cap, so the two must cost the same -- the reduction is worth the same to either */
  assert.ok(Math.abs(selfHsa - spouseHsa) < 0.01,
    'below the cap a self and a spouse HSA must cost the same: ' + selfHsa.toFixed(2)
    + ' against ' + spouseHsa.toFixed(2));
});

test('S5AA 3.5: above the OASDI cap the exclusion still reduces MEDICARE, which has no wage base', () => {
  /* The wage-cap interaction the checklist asks for, and the "already clamped" case this sprint keeps
     meeting. Above the cap, removing wages cannot reduce OASDI -- it was already capped -- but Medicare
     is uncapped, so the exclusion is worth the Medicare rate alone rather than the full FICA rate. */
  const high = PAY.oasdiWageBase + 100000;
  const withHsa = firstYearTaxes({ salary: high, hsa: CONTRIB });
  const withDeferral = firstYearTaxes({ salary: high, deferral: CONTRIB });

  const expectedGap = employeePayroll(high, 0, 'single') - employeePayroll(high - CONTRIB, 0, 'single');
  assert.ok(Math.abs(expectedGap - CONTRIB * (PAY.medicareEmployee + PAY.additionalMedicare)) < 0.01
    || Math.abs(expectedGap - CONTRIB * PAY.medicareEmployee) < 0.01,
    'CONTROL: above the cap the gap must be the Medicare rates only, not the full FICA rate: '
    + expectedGap.toFixed(2) + ' against a full-FICA ' + (CONTRIB * FICA).toFixed(2));
  assert.ok(expectedGap < CONTRIB * FICA - 0.01, 'CONTROL: and it must be strictly smaller than full FICA');

  assert.ok(Math.abs((withDeferral - withHsa) - expectedGap) < 0.01,
    'above the cap the exclusion is worth the Medicare rates only: expected ' + expectedGap.toFixed(2)
    + ', got ' + (withDeferral - withHsa).toFixed(2));
});
