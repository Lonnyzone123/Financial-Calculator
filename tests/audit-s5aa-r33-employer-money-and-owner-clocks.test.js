/* S5AA R33 (SA32F-12, SA32F-14, SA32F-15; Claude's R32F full-model audit, confirmed by ChatGPT's R32V) -- EMPLOYER MONEY AND
 * EACH OWNER'S OWN CLOCK.
 *
 * SA32F-12 (the owner's decision 5a, 2026-09-29: "Each owner's own"): "Contributions stop at age" is read on each OWNER's age.
 *   It was read on the self's age for the spouse's accounts too, though the spouse's wages run on the spouse's own clock: a
 *   younger working spouse lost every deferral once the self passed the stop age.
 * Future contribution changes (the owner, 2026-09-29, "Yes"): a change on a spouse's account is dated on the spouse's age.
 * SA32F-14: profit sharing is an employer contribution in its own right (IRC 415(c)(2)); it was paid only when the MATCH
 *   switch was on.
 * SA32F-15 (decision 5c: "Allow while joint pay"): a spousal IRA rests on the compensation on the joint return (IRC 219(c));
 *   the age bar is repealed (219(d)(1), Pub. L. 116-94) and 408A(c)(4) allows Roth contributions at any age. It stopped
 *   silently once the non-working spouse passed retireAge. It still stops at that spouse's own contribution-stop age,
 *   and when neither spouse has pay.
 *
 * Every plan runs at a 0% return, so a balance is exactly what went in. Expectations are worked from the rule. */
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

function acct(id, type, taxClass, owner, contribution, extra) {
  return Object.assign({
    id, name: id, type, taxClass, owner, balance: 0, basisPct: 0,
    contribution, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  }, extra || {});
}

function run(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.limitPolicy = 'redirect';
  Object.assign(p.profile, { age: o.age, retireAge: o.retireAge || 65, endAge: o.age + (o.years || 1), spouseOn: o.spouseAge !== undefined,
    spouseAge: o.spouseAge === undefined ? o.age : o.spouseAge, filing: o.spouseAge !== undefined ? 'mfj' : 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: o.salary || 0, spouseSalary: o.spouseSalary || 0, growth: 0, contributionStop: o.stop || 65 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, stages: [], expenses: [],
    otherIncomes: [], ssBenefit: 0, spouseSS: 0, survivor: false, selfLife: 95, spouseLife: 95 });
  const t = acct('t', 'taxable', 'taxable', 'self', 0); t.balance = 100000; t.basisPct = 100;
  p.accounts = [t].concat(o.accounts);
  retireAtEnd(p); // S5AA R53: an end age before the retirement age is refused; the owner retires at the end age instead (output-neutral, tests/lib/working-horizon.js)
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  return r;
}
const last = (r) => r.rows[r.rows.length - 1];

test('R33 SA32F-12: a spouse\'s 401(k) stops at the SPOUSE\'s own contribution-stop age (decision 5a)', () => {
  /* Self 66 (past the stop age of 65), spouse 56 earning 100,000 with a 10,000 401(k): the spouse is 56, inside their own
     window, so 10,000 goes in and AGI is 100,000 - 10,000 = 90,000. The engine read the self's 66: nothing went in. */
  const r = run({ age: 66, spouseAge: 56, spouseSalary: 100000, accounts: [acct('k', 'traditional401k', 'preTax', 'spouse', 10000)] });
  assert.strictEqual(last(r).preTax, 10000, 'the spouse\'s deferral');
  assert.strictEqual(last(r).federalAgi, 90000, 'AGI');
  /* CONTROL, the mirror: self 56 earning 100,000, spouse 66: the same 10,000 and the same AGI. */
  const m = run({ age: 56, spouseAge: 66, salary: 100000, accounts: [acct('k', 'traditional401k', 'preTax', 'self', 10000)] });
  assert.strictEqual(last(m).preTax, 10000);
  assert.strictEqual(last(m).federalAgi, 90000);
  /* CONTROL: the spouse past their own stop age contributes nothing: spouse 66, stop 65. */
  const s = run({ age: 56, spouseAge: 66, salary: 100000, accounts: [acct('k', 'traditional401k', 'preTax', 'spouse', 10000)] });
  assert.strictEqual(last(s).preTax, 0, 'a spouse past their own stop age');
});

test('R33: a future contribution change on a spouse\'s account is dated on the spouse\'s age (the owner, 2026-09-29)', () => {
  /* Self 45, spouse 56 earning 100,000; the spouse's 401(k) is 10,000, set to 5,000 from age 58. Three rows open at spouse ages
     56, 57 and 58: 10,000 + 10,000 + 5,000 = 25,000. The engine compared 58 with the self's 45-47: 30,000. */
  const r = run({ age: 45, spouseAge: 56, spouseSalary: 100000, years: 3,
    accounts: [acct('k', 'traditional401k', 'preTax', 'spouse', 10000, { futureChanges: [{ age: 58, mode: 'set', value: 5000 }] })] });
  assert.strictEqual(last(r).preTax, 25000);
  /* CONTROL: the same change on the self's own account at the self's age 47: 10,000 + 10,000 + 5,000. */
  const c = run({ age: 45, spouseAge: 56, salary: 100000, years: 3,
    accounts: [acct('k', 'traditional401k', 'preTax', 'self', 10000, { futureChanges: [{ age: 47, mode: 'set', value: 5000 }] })] });
  assert.strictEqual(last(c).preTax, 25000);
});

test('R33 SA32F-14: profit sharing is paid whether or not the match is switched on (IRC 415(c)(2))', () => {
  /* 100,000 of pay, a 10,000 deferral, 5% profit sharing = 5,000: the 401(k) holds 15,000. The engine paid it only with the
     match on: 10,000. */
  const r = run({ age: 45, salary: 100000, accounts: [acct('k', 'traditional401k', 'preTax', 'self', 10000, { matchOn: false, profitShare: 5 })] });
  assert.strictEqual(last(r).preTax, 15000);
  /* CONTROL: with the match on at a 0% rate the same 15,000. */
  const c = run({ age: 45, salary: 100000, accounts: [acct('k', 'traditional401k', 'preTax', 'self', 10000, { matchOn: true, matchRate: 0, matchCap: 0, profitShare: 5 })] });
  assert.strictEqual(last(c).preTax, 15000);
  /* CONTROL: no profit sharing and no match: the 10,000 deferral alone. */
  assert.strictEqual(last(run({ age: 45, salary: 100000, accounts: [acct('k', 'traditional401k', 'preTax', 'self', 10000)] })).preTax, 10000);
});

test('R33 SA32F-15: a spousal IRA continues while the joint return has pay (decision 5c; IRC 219(c))', () => {
  /* Self 55 earning 100,000; spouse 66 with no pay, past retireAge 65 but inside the contribution-stop age of 70; a 7,500
     spouse Roth IRA: 7,500 goes in (the joint return's pay covers it). The engine dropped it: 0. */
  const r = run({ age: 55, spouseAge: 66, salary: 100000, stop: 70, accounts: [acct('r', 'rothIRA', 'roth', 'spouse', 7500)] });
  assert.strictEqual(last(r).roth, 7500, 'spousal Roth IRA');
  /* CONTROL: neither spouse has pay (both past retireAge): nothing goes in. */
  assert.strictEqual(last(run({ age: 66, spouseAge: 66, stop: 70, accounts: [acct('r', 'rothIRA', 'roth', 'spouse', 7500)] })).roth, 0, 'no pay');
  /* CONTROL: the spouse is past their own stop age (stop 65): nothing goes in. */
  assert.strictEqual(last(run({ age: 55, spouseAge: 66, salary: 100000, stop: 65, accounts: [acct('r', 'rothIRA', 'roth', 'spouse', 7500)] })).roth, 0, 'past the stop age');
});
