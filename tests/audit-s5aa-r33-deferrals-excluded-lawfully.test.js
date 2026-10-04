/* S5AA R33 (SA32F-11, SA32F-30, SA32F-31; Claude's R32F full-model audit, confirmed by ChatGPT's R32V) -- A DEFERRAL IS
 * EXCLUDED FROM INCOME ONLY AS FAR AS THE LAW EXCLUDES IT.
 *
 * SA32F-11: a 401(k) deferral funded by wages entered as an `employment` income stream was deposited pre-tax but never
 *   excluded -- the exclusion was taken from salary wages only (`Math.max(0, wages - preTaxDeferrals)`), although the
 *   stream counts as the owner's compensation. IRC 402(e)(3)/402(g): an elective deferral is excluded up to the limit,
 *   whichever wages fund it.
 * SA32F-30: a deferral above the owner's OWN pay was deposited and excluded in full because the household had pay.
 *   IRC 415(c)(1)(B): annual additions may not exceed "100 percent of the participant's compensation"; a spouse's wages
 *   do not fund the other spouse's 401(k).
 * SA32F-31: under limitPolicy "warn" the deferral above 402(g) was excluded too. 402(g)(1)(A): the excess "shall be
 *   included in such individual's gross income". The warn policy keeps the deposit; it does not grant the exclusion.
 *   The same holds for an HSA above its limit (IRC 223(b)) and an IRA above its limit (IRC 219(b)).
 *
 * AGI is the measure throughout; each expectation is worked from the rule, never read from the engine. */
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

function acct(id, type, taxClass, owner, contribution, priority) {
  return {
    id, name: id, type, taxClass, owner, balance: 0, basisPct: 0,
    contribution, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: priority || 1,
  };
}

/* One year at 45 (no catch-up), a 0% return; retirement at 60 so the row is a working row. */
function run(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.limitPolicy = o.policy || 'redirect';
  Object.assign(p.profile, { age: 45, retireAge: 60, endAge: 46, spouseOn: !!o.spouseOn, spouseAge: 45, filing: o.spouseOn ? 'mfj' : 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: o.salary || 0, spouseSalary: o.spouseSalary || 0, growth: 0, contributionStop: 60 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0,
    stages: [], expenses: [], otherIncomes: o.otherIncomes || [], ssBenefit: 0, spouseSS: 0, survivor: false,
  });
  const t = acct('t', 'taxable', 'taxable', 'self', 0); t.balance = 100000; t.basisPct = 100;
  p.accounts = [t].concat(o.accounts || []);
  retireAtEnd(p); // S5AA R53: an end age before the retirement age is refused; the owner retires at the end age instead (output-neutral, tests/lib/working-horizon.js)
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  const row = r.rows[1];
  return { agi: Number(row.federalAgi), preTax: Number(row.preTax), hsa: Number(row.hsa), taxable: Number(row.taxable) };
}
const wagesStream = (amount, owner) => ({ name: 'Wages', type: 'employment', owner: owner || 'self', amount, start: 45, end: 46, growth: 0, growthMode: 'fixed' });

test('R33 SA32F-11: a 401(k) deferral funded by an employment income stream is excluded like one funded by salary', () => {
  const k = [acct('k', 'traditional401k', 'preTax', 'self', 10000)];
  /* 100,000 of wages less the 10,000 deferral: AGI 90,000, however the wages are entered. */
  assert.strictEqual(run({ salary: 100000, accounts: k }).agi, 90000, 'CONTROL: salary wages');
  assert.strictEqual(run({ otherIncomes: [wagesStream(100000)], accounts: k }).agi, 90000, 'stream wages (was 100,000)');
  /* Mixed: 5,000 of salary and 95,000 of stream wages fund the same 10,000: AGI 90,000 (was 95,000). */
  assert.strictEqual(run({ salary: 5000, otherIncomes: [wagesStream(95000)], accounts: k }).agi, 90000, 'mixed wages');
  /* CONTROL: the deposit is 10,000 in every case. */
  assert.strictEqual(run({ otherIncomes: [wagesStream(100000)], accounts: k }).preTax, 10000);
});

test('R33 SA32F-30: a 401(k) deferral is capped at the owner\'s OWN compensation (IRC 415(c)(1)(B))', () => {
  /* Joint; self 100,000; spouse 15,000 and a 24,500 spouse deferral. The spouse can defer 15,000: AGI 115,000 - 15,000 =
     100,000, the 401(k) holds 15,000, and the redirect policy sends the 9,500 excess to the taxable account. The engine
     deferred 24,500 against the household's pay: AGI 90,500. */
  const r = run({ spouseOn: true, salary: 100000, spouseSalary: 15000, accounts: [acct('k', 'traditional401k', 'preTax', 'spouse', 24500)] });
  assert.strictEqual(r.agi, 100000, 'AGI');
  assert.strictEqual(r.preTax, 15000, 'the 401(k) deposit');
  assert.strictEqual(r.taxable, 109500, 'the redirected excess: 100,000 + 9,500');
  /* CONTROL: a deferral within the spouse's own pay is untouched: 12,000 -> AGI 103,000. */
  assert.strictEqual(run({ spouseOn: true, salary: 100000, spouseSalary: 15000, accounts: [acct('k', 'traditional401k', 'preTax', 'spouse', 12000)] }).agi, 103000);
});

test('R33 SA32F-31: under "warn" the deposit stays but only the lawful deferral is excluded (IRC 402(g)(1)(A))', () => {
  /* 30,000 requested against the 24,500 limit at 45: the 401(k) holds 30,000 under warn; AGI 100,000 - 24,500 = 75,500.
     The engine excluded all 30,000: AGI 70,000. */
  const warn = run({ policy: 'warn', salary: 100000, accounts: [acct('k', 'traditional401k', 'preTax', 'self', 30000)] });
  assert.strictEqual(warn.preTax, 30000, 'warn keeps the deposit');
  assert.strictEqual(warn.agi, 75500, 'but excludes only 24,500');
  /* CONTROL: redirect gives the same AGI and a 24,500 deposit. */
  const redirect = run({ salary: 100000, accounts: [acct('k', 'traditional401k', 'preTax', 'self', 30000)] });
  assert.strictEqual(redirect.agi, 75500);
  assert.strictEqual(redirect.preTax, 24500);
});

test('R33 SA32F-31: the same holds for an HSA and a traditional IRA kept above their limits under "warn"', () => {
  /* HSA, single, self-only limit 4,400: 6,000 kept, 4,400 deducted: AGI 50,000 - 4,400 = 45,600. */
  const hsa = run({ policy: 'warn', salary: 50000, accounts: [acct('h', 'hsa', 'hsa', 'self', 6000)] });
  assert.strictEqual(hsa.hsa, 6000, 'warn keeps the HSA deposit');
  assert.strictEqual(hsa.agi, 45600, 'HSA: only the limit is deducted');
  /* IRA, no workplace plan (no phase-out), limit 7,500: 10,000 kept, 7,500 deducted: AGI 42,500. */
  const ira = run({ policy: 'warn', salary: 50000, accounts: [acct('i', 'traditionalIRA', 'preTax', 'self', 10000)] });
  assert.strictEqual(ira.preTax, 10000, 'warn keeps the IRA deposit');
  assert.strictEqual(ira.agi, 42500, 'IRA: only the limit is deducted');
});
