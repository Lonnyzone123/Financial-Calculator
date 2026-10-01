/* Q96 (F10) through the PUBLIC ROUTE -- runPlan() and the rows it reports.
 *
 * tests/audit-s5aa-roth-employer-match.test.js pins the rule where it lives, calling estimateTaxes()
 * directly for the payroll claim, and is implementation-coupled for that reason. This file exists
 * because tools/closeout-check.js refused Q96 as COUPLED-ONLY until it did: a repair that cannot be
 * seen from the public route has not been shown to reach a user.
 *
 * The payroll claim is made here WITHOUT naming an internal function, by comparing the elected match
 * against the same household given $5,000 of pension income instead. Pension is ordinary income and is
 * not wages. If an elected Roth match had been pushed into the FICA base, it would cost MORE than the
 * pension by the Medicare rate on $5,000. It costs exactly the same, which is IRS Notice 2024-2,
 * section L answer 6: excluded from wages under 3121(a)(5)(A) and (D), and not added back under
 * 3121(v)(1)(A).
 */
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

const SALARY = 100000;
const MATCH = 5000;   /* dollar for dollar on the first 5% of pay */

function account(id, type, taxClass, extra) {
  return Object.assign({
    id, name: id, type, taxClass, owner: 'self', balance: 0, basisPct: taxClass === 'taxable' ? 100 : 0,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  }, extra || {});
}

function household(deferralType, deferralClass, accountEdit, planEdit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 40, retireAge: 41, endAge: 41, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: SALARY, spouseSalary: 0, growth: 0, contributionStop: 41 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, /* RE-FIXTURED at the S5AA R18 round (workstream B, taxable basis in dollars): dividends ON at a 0% yield, so no imputed 1.5% -- at a 0% return a taxed, retained yield adds basis the account never gains, and the tax sales then realise small capital losses that are not what this test is about. */ dividendOn: true, dividendYield: 0, qcdOn: false, pension: 0,
    stages: [], expenses: [], otherIncomes: [], ssBenefit: 0, spouseSS: 0, survivor: false,
  });
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false });
  p.accounts = [
    account('plan', deferralType, deferralClass, Object.assign({
      contribution: 10000, matchOn: true, matchCap: 5, matchRate: 100,
    }, accountEdit || {})),
    account('cash', 'taxable', 'taxable', { balance: 200000 }),
  ];
  if (planEdit) planEdit(p);
  return p;
}

function seen(p) {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  const row = r.rows[1];
  return {
    roth: Number(row.roth) || 0, preTax: Number(row.preTax) || 0,
    taxes: Number(row.taxes) || 0, federalAgi: Number(row.federalAgi) || 0,
  };
}

test('Q96 public route: employer money into a Roth 401(k) is not tax-free by default', () => {
  const m = seen(household('roth401k', 'roth'));
  assert.equal(m.roth.toFixed(2), '10000.00', 'the Roth bucket holds the employee\'s own deferral');
  assert.equal(m.preTax.toFixed(2), MATCH.toFixed(2), 'and the employer\'s $5,000 sits pre-tax');
});

test('Q96 public route: electing makes the match Roth money and income in the same year', () => {
  const byDefault = seen(household('roth401k', 'roth'));
  const elected = seen(household('roth401k', 'roth', { matchRoth: true }));
  assert.equal(elected.roth.toFixed(2), '15000.00');
  assert.equal(elected.preTax.toFixed(2), '0.00');
  assert.equal((elected.federalAgi - byDefault.federalAgi).toFixed(2), MATCH.toFixed(2));
});

test('Q96 public route: a household one percent short of full vesting cannot elect', () => {
  const full = seen(household('roth401k', 'roth', { matchRoth: true, vesting: 100 }));
  const nearly = seen(household('roth401k', 'roth', { matchRoth: true, vesting: 99 }));
  assert.equal(full.roth.toFixed(2), '15000.00');
  assert.equal(nearly.roth.toFixed(2), '10000.00', 'the election is refused outright, not granted in part');
});

test('Q96 public route: a traditional 401(k) household is untouched', () => {
  const m = seen(household('traditional401k', 'preTax'));
  assert.equal(m.preTax.toFixed(2), '15000.00');
  assert.equal(m.roth.toFixed(2), '0.00');
});

test('Q96 public route: an elected match costs exactly what the same pension income costs', () => {
  /* Notice 2024-2, section L answer 6. Two households, each $5,000 of extra ordinary income over the
     same baseline: one by electing the match as Roth, one by drawing a $5,000 pension. Pension is not
     wages. If the elected match had been pushed into the FICA wage base it would cost MORE, by the
     Medicare and Social Security rates on $5,000. It costs the same to the cent. */
  const baseline = seen(household('roth401k', 'roth'));
  const elected = seen(household('roth401k', 'roth', { matchRoth: true }));
  const pensioned = seen(household('roth401k', 'roth', null, (p) => {
    p.retirement.otherIncomes = [{
      name: 'pension', type: 'pension', amount: MATCH, start: 40, end: 41,
      owner: 'self', growthMode: 'fixed', growth: 0,   // S5AA R43: 'percent' is not an income growth mode; the engine read it as fixed
    }];
  }));

  assert.equal((elected.federalAgi - baseline.federalAgi).toFixed(2), MATCH.toFixed(2),
    'control: the election really does add $5,000 of income');
  assert.equal((pensioned.federalAgi - baseline.federalAgi).toFixed(2), MATCH.toFixed(2),
    'control: so does the pension, and by the same route');
  assert.equal((elected.taxes - baseline.taxes).toFixed(2), (pensioned.taxes - baseline.taxes).toFixed(2),
    'a designated Roth match is not FICA wages, so it costs what any other $5,000 of ordinary income costs');
});
