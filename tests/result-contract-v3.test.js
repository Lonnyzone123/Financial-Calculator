'use strict';

/*
 * Q2 (A), decided by the owner on 2026-09-16 (S5 task 6.10): the five named income measures on result rows at result-contract
 * version 3, with versioned row fields. The acceptance cases of the 2026-09-16 handover review, section 3:
 *   - a genuine older capture without the five fields is valid under its historical contract, found by provenance;
 *   - a version-3 annual row with all fields is valid, and one missing any single field is invalid, naming it;
 *   - a new field that is null, a string, NaN or infinite is invalid, and a legitimate zero is valid;
 *   - an unknown or malformed version is refused outright, and a capture recording none that is not a known legacy
 *     capture is refused, never judged by the absence of the new fields;
 *   - the producer declares the current version, and its results fail when checked without a version-3 field;
 *   - one household whose measures differ matches each measure's independently derived meaning;
 *   - legacy magi equals irmaaMagi.
 * The rows here are hand-authored where the rule is the checker's, and the household is derived by hand from IRS
 * Publication 915's worksheet, so no case passes because every measure reads the same variable.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const contract = () => require('../tools/result-contract.js');
const MEASURES = ['federalAgi', 'ssProvisionalIncome', 'seniorDeductionMagi', 'niitMagi', 'irmaaMagi'];

function handResult(overrides) {
  const zero = { contributions: 0, income: 0, spending: 0, withdrawals: 0, dividends: 0, taxes: 0, rmd: 0, rmdDistributed: 0, rmdUnmet: 0, shortfall: 0, debtPayments: 0, debtPaymentsTotal: 0, debtInterest: 0, debtPrincipal: 0, debtHousing: 0, nonPortfolioDraw: 0, magi: 0, federalAgi: 0, ssProvisionalIncome: 0, seniorDeductionMagi: 0, niitMagi: 0, irmaaMagi: 0 };
  const opening = Object.assign({ age: 60, total: 200, realTotal: 200, taxable: 100, preTax: 50, roth: 25, hsa: 25, otherAssets: 0, debtBalance: 0, inflationFactor: 1, networth: 200 }, zero);
  const ordinary = Object.assign({
    age: 61, total: 200, realTotal: 200 / 1.02, taxable: 110, preTax: 55, roth: 25, hsa: 10, contributions: 10, income: 50, spending: 40, withdrawals: 30, dividends: 5, taxes: 7,
    rmd: 0, rmdDistributed: 0, rmdUnmet: 0, shortfall: 0, debtPayments: 0, debtPaymentsTotal: 12, debtInterest: 5, debtPrincipal: 4, debtHousing: 3, otherAssets: 0, debtBalance: 0, nonPortfolioDraw: 0,
    inflationFactor: 1.02, networth: 200, magi: 60, calculationError: false, calculationErrorCode: null,
    federalAgi: 60, ssProvisionalIncome: 65, seniorDeductionMagi: 60, niitMagi: 60, irmaaMagi: 60,
  }, overrides || {});
  return {
    status: 'ok', mode: 'simple', rows: [opening, ordinary], calculationError: false, calculationErrorAge: null, calculationErrorCode: null, failed: false, successRate: 100,
    firstShortfallAge: null, sustainedFailureAge: null, failureAge: null, lifetimeContributions: 10, lifetimeContributionsReal: 10 / 1.02, lifetimeTaxes: 7, issues: [], limitWarnings: [],
  };
}
const withoutMeasures = (r) => { r.rows.forEach((row) => MEASURES.forEach((k) => { delete row[k]; })); return r; };
const rulesAt = (c) => c.violations.map((v) => v.rule + ' ' + v.path);

test('control: the stored S5 control capture records the result it was produced with, and no contract version', () => {
  const stored = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'baseline-20260914-s5-control.json'), 'utf8'));
  assert.equal(Object.prototype.hasOwnProperty.call(stored.meta, 'resultContractVersion'), false);
  assert.equal(MEASURES.some((k) => Object.prototype.hasOwnProperty.call(stored.entries[0].result.rows[1], k)), false);
});

test('Q2 (A): a genuine older capture without the five fields is valid under its historical contract, found by its provenance', () => {
  const { captureContractVersion, checkResult } = contract();
  const stored = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'baseline-20260914-s5-control.json'), 'utf8'));
  const version = captureContractVersion(stored.meta);
  assert.equal(version, 2);
  const invariant = require('../tools/corpus-invariant.js');
  const decoded = invariant.decodeEntries(stored).decoded;
  const shape = invariant.checkShape(decoded, invariant.readSpec(), new Map(), stored.meta);
  assert.deepEqual(shape.problems, [], 'SHAPE under version 2');
  assert.deepEqual(checkResult(withoutMeasures(handResult()), { contractVersion: 2 }).violations, []);
});

test('Q2 (A): a version-3 annual row with all five measures is valid, and a legitimate zero is valid', () => {
  const { checkResult } = contract();
  const c = checkResult(handResult(), { contractVersion: 3 });
  assert.deepEqual(c.violations, []);
  assert.deepEqual(c.unspecified, []);
  const zero = checkResult(handResult({ magi: 0, federalAgi: 0, ssProvisionalIncome: 0, seniorDeductionMagi: 0, niitMagi: 0, irmaaMagi: 0 }), { contractVersion: 3 });
  assert.deepEqual(zero.violations, [], 'zero income is a measurement, not a missing value');
});

test('Q2 (A): a version-3 row missing any one measure is invalid, naming that field', () => {
  const { checkResult } = contract();
  for (const k of MEASURES) {
    const r = handResult();
    delete r.rows[1][k];
    assert.ok(rulesAt(checkResult(r, { contractVersion: 3 })).includes('S-EXACT-KEYS rows[1].' + k), k + ' missing must be named');
    const opening = handResult();
    delete opening.rows[0][k];
    assert.ok(rulesAt(checkResult(opening, { contractVersion: 3 })).includes('S-EXACT-KEYS rows[0].' + k), k + ' missing from the opening row must be named');
  }
});

test('Q2 (A): a measure that is null, a string, NaN or infinite is invalid', () => {
  const { checkResult } = contract();
  for (const bad of [null, '60', NaN, Infinity, -Infinity]) {
    const c = checkResult(handResult({ federalAgi: bad }), { contractVersion: 3 });
    assert.ok(c.violations.some((v) => v.path === 'rows[1].federalAgi'), JSON.stringify(String(bad)) + ' must be refused at rows[1].federalAgi');
  }
});

test('Q2 (A): an unknown or malformed contract version is refused outright, never checked under the most permissive schema', () => {
  const { checkResult, captureContractVersion } = contract();
  /* RE-FIXTURED at the R12 round: version 4 became the producer's (R11-02), so the unknown example became 5; and at the
     R19 round version 5 became the producer's (workstream A's tax ledger), so it is now 6. */
  for (const version of [0, 1, 6, 2.5, '3', null, undefined]) {
    const c = checkResult(handResult(), { contractVersion: version });
    assert.deepEqual(rulesAt(c), ['S-CONTRACT-VERSION (contract)'], JSON.stringify(String(version)));
  }
  const stored = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'baseline-20260914-s5-control.json'), 'utf8'));
  const unknown = Object.assign({}, stored.meta, { hash: '0'.repeat(64) });
  assert.equal(captureContractVersion(unknown), null, 'a capture recording no version and not a known legacy capture has no version');
  assert.equal(captureContractVersion(Object.assign({}, stored.meta, { resultContractVersion: 7 })), null, 'an unsupported recorded version');
  const invariant = require('../tools/corpus-invariant.js');
  const shape = invariant.checkShape([], invariant.readSpec(), new Map(), unknown);
  assert.equal(shape.problems.length, 1, 'SHAPE refuses a capture whose version cannot be established');
});

test('Q2 (A): the engine produces the current contract version, and its results fail at that version without a measure', () => {
  const { CONTRACT, checkResult } = contract();
  const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
  global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
  require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
  const engine = require(path.join(ROOT, 'src', 'engine.js'));
  assert.equal(engine.RESULT_CONTRACT_VERSION, CONTRACT.contractVersion);
  const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');
  for (const method of ['simple', 'monteCarlo']) {
    const p = JSON.parse(JSON.stringify(defaultPlan));
    p.setupComplete = true;
    Object.assign(p.assumptions, { method, runs: 5, seed: 7 });
    Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 63 });
    p.accounts = [{ id: 'a', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 500000, basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
    const r = engine.runPlan(p);
    assert.deepEqual(checkResult(r, { plan: p, contractVersion: engine.RESULT_CONTRACT_VERSION }).violations, [], method + ': the live result conforms at the producer version');
    delete r.rows[1].niitMagi;
    assert.ok(rulesAt(checkResult(r, { plan: p, contractVersion: engine.RESULT_CONTRACT_VERSION })).includes('S-EXACT-KEYS rows[1].niitMagi'), method + ': a result without a version-3 measure fails at the producer version');
  }
});

test('Q2 (A): one household whose measures differ reports each by its own meaning, derived by hand', () => {
  const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
  global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
  require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
  const engine = require(path.join(ROOT, 'src', 'engine.js'));
  const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.profile, { age: 70, retireAge: 60, endAge: 71, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: 60 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 1000, ssBenefit: 0, spouseSS: 0, pension: 0, dividendOn: false, stages: [], expenses: [],
    otherIncomes: [{ id: 'pension', name: 'Pension', owner: 'self', type: 'pension', amount: 30000, start: 60, end: 100, growthMode: 'fixed', growth: 0 },
      { id: 'ss', name: 'Social Security', owner: 'self', type: 'socialSecurity', amount: 20000, start: 60, end: 100, growthMode: 'fixed', growth: 0 }] });
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = [{ id: 'roth', name: 'Roth IRA', type: 'rothIRA', taxClass: 'roth', owner: 'self', balance: 500000, basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok');
  const row = r.rows[1];
  /* Publication 915, single: provisional income = other income + half the benefits = 30,000 + 10,000 = 40,000. It passes
     the $34,000 second base, so taxable benefits = min(85% x 20,000, 85% x (40,000 - 34,000) + min($4,500, half the
     benefits)) = min(17,000, 5,100 + 4,500) = 9,600, and federal AGI = 30,000 + 9,600 = 39,600. The spending and tax
     come from a Roth IRA at 70, which adds no income (a taxable account would impute dividends). The three MAGIs add back exclusions the engine does not model, so each equals AGI. */
  assert.ok(Math.abs(row.ssProvisionalIncome - 40000) < 0.01, 'provisional income: ' + row.ssProvisionalIncome);
  assert.ok(Math.abs(row.federalAgi - 39600) < 0.01, 'federal AGI: ' + row.federalAgi);
  assert.notEqual(row.ssProvisionalIncome, row.federalAgi, 'the two measures differ for this household');
  for (const k of ['seniorDeductionMagi', 'niitMagi', 'irmaaMagi']) assert.ok(Math.abs(row[k] - 39600) < 0.01, k + ': ' + row[k]);
  assert.equal(row.magi, row.irmaaMagi, 'legacy magi is the IRMAA measure');
});

test('Q2 (A): legacy magi and irmaaMagi must agree exactly (R-MAGI-ALIAS)', () => {
  const { checkResult } = contract();
  const c = checkResult(handResult({ irmaaMagi: 61 }), { contractVersion: 3 });
  assert.ok(rulesAt(c).includes('R-MAGI-ALIAS rows[1].irmaaMagi'), JSON.stringify(rulesAt(c)));
  assert.deepEqual(checkResult(withoutMeasures(handResult({ magi: 61 })), { contractVersion: 2 }).violations, [], 'the alias rule starts at version 3');
});
