/* Q87 (F1, with G15) through the PUBLIC ROUTE -- runPlan() and the rows it reports, nothing else.
 *
 * tests/audit-s5aa-ira-deduction.test.js pins the rule where it lives, by calling
 * iraDeductibleAmount(), iraDeductionPhaseoutRange() and rothPhaseoutFactor() directly, and is
 * implementation-coupled for that reason. This file exists because a repair that cannot be seen from
 * the public route has not been shown to reach a user: tools/closeout-check.js refused Q87 as
 * COUPLED-ONLY until it existed.
 *
 * Every claim below is a COMPARISON between two plans that differ in one respect, observed through
 * rows[1], so nothing here depends on a particular rate or bracket.
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

const IRA = global.RULES.retirement.ira;
const LIMIT = IRA.combinedLimit;
const rule = (id) => IRA.deductionPhaseout.records.filter((r) => r.provision_id === id)[0].value;

const SINGLE_END = rule('ira_deduction_phaseout_end_single_or_hoh_active');
const JOINT_END = rule('ira_deduction_phaseout_end_mfj_contributor_active');
const SPOUSE_ONLY_START = rule('ira_deduction_phaseout_start_mfj_spouse_only_active');

function acct(id, type, taxClass, owner, contribution) {
  return {
    id, name: id, type, taxClass, owner, balance: 0, basisPct: 0,
    contribution, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  };
}

/* `covered` adds a token workplace deferral, which is how the engine infers active participation. */
function plan(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, {
    age: 45, retireAge: 60, endAge: 47, spouseOn: !!o.spouseOn, spouseAge: 45,
    filing: o.spouseOn ? 'mfj' : 'single',
  });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: o.salary || 0, spouseSalary: o.spouseSalary || 0, growth: 0, contributionStop: 60 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 5000, /* RE-FIXTURED at the S5AA R18 round (workstream B, taxable basis in dollars): dividends ON at a 0% yield, so no imputed 1.5% -- at a 0% return a taxed, retained yield adds basis the account never gains, and the tax sales then realise small capital losses that are not what this test is about. */ dividendOn: true, dividendYield: 0,
    stages: [], expenses: [], otherIncomes: [], ssBenefit: 0, spouseSS: 0, survivor: false,
  });
  const t = acct('t', 'taxable', 'taxable', 'self', 0); t.balance = 900000; t.basisPct = 100;
  p.accounts = [t];
  if (o.ira) p.accounts.push(acct('i', 'traditionalIRA', 'preTax', o.iraOwner || 'self', o.ira));
  if (o.roth) p.accounts.push(acct('r', 'rothIRA', 'roth', 'self', o.roth));
  if (o.coveredSelf) p.accounts.push(acct('w', 'traditional401k', 'preTax', 'self', 1));
  if (o.coveredSpouse) p.accounts.push(acct('w2', 'traditional401k', 'preTax', 'spouse', 1));
  retireAtEnd(p); // S5AA R53: an end age before the retirement age is refused; the owner retires at the end age instead (output-neutral, tests/lib/working-horizon.js)
  return p;
}

function firstYear(o) {
  const r = engine.runPlan(plan(o));
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  return { taxes: Number(r.rows[1].taxes) || 0, agi: Number(r.rows[1].federalAgi) || 0 };
}

test('Q87 control: the fixtures run and a workplace deferral is what marks an active participant', () => {
  const bare = firstYear({ salary: 50000 });
  const covered = firstYear({ salary: 50000, coveredSelf: true });
  assert.ok(bare.taxes > 0, 'CONTROL: the fixture owes tax, so a deduction can be seen');
  assert.ok(Math.abs(bare.taxes - covered.taxes) < 2,
    'CONTROL: the $1 token deferral marks coverage without materially moving the tax itself');
});

test('Q87: below the phase-out, a traditional IRA contribution lowers AGI by the whole amount', () => {
  const none = firstYear({ salary: 50000, coveredSelf: true });
  const withIra = firstYear({ salary: 50000, coveredSelf: true, ira: LIMIT });
  assert.ok(Math.abs((none.agi - withIra.agi) - LIMIT) < 1,
    'AGI must fall by $' + LIMIT + ': ' + Math.round(none.agi) + ' -> ' + Math.round(withIra.agi));
  assert.ok(none.taxes > withIra.taxes, 'and the tax must fall with it');
});

test('Q87: ABOVE the phase-out a covered filer gets nothing, and an UNCOVERED one at the same income gets it all', () => {
  /* The phase-out, seen from the public route. Same income, same contribution; the only difference is
     whether a workplace plan received anything that year. */
  const salary = SINGLE_END + 20000;

  const coveredNone = firstYear({ salary, coveredSelf: true });
  const coveredIra = firstYear({ salary, coveredSelf: true, ira: LIMIT });
  assert.ok(Math.abs(coveredIra.agi - coveredNone.agi) < 1,
    'a COVERED filer above the range gets no deduction: AGI moved by '
    + Math.round(coveredNone.agi - coveredIra.agi));

  const bareNone = firstYear({ salary });
  const bareIra = firstYear({ salary, ira: LIMIT });
  assert.ok(Math.abs((bareNone.agi - bareIra.agi) - LIMIT) < 1,
    'an UNCOVERED filer at the same income deducts the whole contribution: AGI moved by '
    + Math.round(bareNone.agi - bareIra.agi));
});

test('Q87: on a joint return, an uncovered contributor married to a covered spouse still deducts', () => {
  /* IRC 219(g)(7)(A), through the public route. At an income above the contributor range but below the
     spouse-only range, the answer depends entirely on WHOSE plan received a contribution. */
  const salary = (JOINT_END + SPOUSE_ONLY_START) / 2;

  /* the contributor is covered -> nothing */
  const selfCoveredNone = firstYear({ spouseOn: true, salary, coveredSelf: true });
  const selfCoveredIra = firstYear({ spouseOn: true, salary, coveredSelf: true, ira: LIMIT });
  assert.ok(Math.abs(selfCoveredIra.agi - selfCoveredNone.agi) < 1,
    'a covered contributor at ' + Math.round(salary) + ' gets no deduction');

  /* only the SPOUSE is covered -> the whole contribution */
  const spouseCoveredNone = firstYear({ spouseOn: true, salary, spouseSalary: 1000, coveredSpouse: true });
  const spouseCoveredIra = firstYear({ spouseOn: true, salary, spouseSalary: 1000, coveredSpouse: true, ira: LIMIT });
  assert.ok(Math.abs((spouseCoveredNone.agi - spouseCoveredIra.agi) - LIMIT) < 1,
    'an uncovered contributor with a covered spouse deducts the whole contribution at '
    + Math.round(salary) + ': AGI moved by ' + Math.round(spouseCoveredNone.agi - spouseCoveredIra.agi));
});

test('Q87: a Roth IRA contribution never reduces AGI, at any income', () => {
  for (const salary of [50000, SINGLE_END + 20000]) {
    const none = firstYear({ salary, coveredSelf: true });
    const roth = firstYear({ salary, coveredSelf: true, roth: LIMIT });
    assert.ok(Math.abs(roth.agi - none.agi) < 1, 'a Roth contribution must not reduce AGI at ' + salary);
  }
});
