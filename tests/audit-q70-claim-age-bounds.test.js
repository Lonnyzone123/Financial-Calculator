/* Q70 -- a Social Security claim age outside 62-70 is bounded by the engine, disclosed, and refused by the validator.
 *
 * The engine applied a delayed credit to any claim past full retirement age and an early reduction to any claim before
 * it, and paid from whatever age a plan named. Delayed credits end at 70, and a retirement benefit cannot start before
 * 62. The validator only warned about ssClaim and never checked spouseClaim, so an imported plan reached the engine.
 * Decided 2026-09-14 (the owner), answer (c): the engine bounds the age -- no credit past 70, no payment before 62 -- and
 * says so, and the validator refuses a claim age outside the range as an ERROR, for the spouse as well as self.
 *
 * The fixture has no pension, no other income, no dividends and no wages, so a row's income is the benefit alone; COLA
 * is 0, so a bounded claim pays exactly the in-range claim's amount. A row pays for the year that follows its age, so
 * a claim at k pays nothing in the rows up to and including age k. Public routes: runPlan(), a fresh build's main
 * thread and its generated Worker, and the validator. Each title is a literal, so the requirements register names
 * every one.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { bootBuild } = require('./lib/build-routes.js');
const { postToWorker } = require('./lib/worker-source.js');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
/* The debt modules, installed exactly as the browser bundle provides them, before the engine is loaded. */
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

/* A retired single, 55 to 85, living past the horizon, with a Roth large enough that nothing runs short; a $2,000
   monthly benefit at full retirement age 67. */
function single(claim) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 55, retireAge: 55, endAge: 85, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 20000, ssBenefit: 2000, ssClaim: claim, ssFra: 67, ssCola: 0, spouseSS: 0, selfLife: 95, spouseLife: 95, pension: 0, dividendOn: false, otherIncomes: [], stages: [], expenses: [] });
  p.accounts = [{ id: 'a1', name: 'Roth', owner: 'self', type: 'rothIRA', taxClass: 'roth', balance: 3000000, basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  p.advanced.otherAssets = [];
  p.advanced.debts = [];
  return p;
}
/* The same household as a couple of the same age, where only the spouse has a benefit. */
function couple(spouseClaim) {
  const p = single(67);
  Object.assign(p.profile, { spouseOn: true, spouseAge: 55, filing: 'mfj' });
  Object.assign(p.retirement, { ssBenefit: 0, spouseSS: 1500, spouseClaim });
  return p;
}
const incomeByAge = (r) => new Map((r.rows || []).map((row) => [Math.round(row.age * 2) / 2, row.income]));
const run = (plan) => { try { return engine.runPlan(plan); } catch (e) { return { threw: String(e && e.message).split('\n')[0], rows: [] }; } };
/* Every row after age `from` pays what the in-range plan pays at that age, and every row up to it pays nothing. */
function paysLike(bounded, inRange, from) {
  if (bounded.threw) return ['threw: ' + bounded.threw];
  const a = incomeByAge(bounded), b = incomeByAge(inRange), wrong = [];
  if (!a.size) return ['no rows: ' + bounded.status + ' / ' + bounded.calculationErrorCode];
  if (![...b.values()].some((v) => v > 0)) return ['CONTROL: the in-range plan pays nothing, so the comparison would be vacuous'];
  for (const [age, value] of a) {
    const want = age <= from ? 0 : b.get(age);
    if (typeof value !== 'number' || Math.abs(value - want) > 0.005) wrong.push('age ' + age + ': ' + value + ', want ' + want);
  }
  return wrong.slice(0, 4);
}

let built;
test.before(async () => { built = await bootBuild(); });
test.after(() => { if (built) built.dom.window.close(); });

test('Q70: runPlan() credits no delay past 70 -- a claim at 75 pays exactly what a claim at 70 pays, from 75', () => {
  assert.deepStrictEqual(paysLike(run(single(75)), run(single(70)), 75), []);
});

test('Q70: runPlan() starts no benefit before 62 -- a claim at 56 pays exactly what a claim at 62 pays, from 62', () => {
  assert.deepStrictEqual(paysLike(run(single(56)), run(single(62)), 62), []);
});

test('Q70: the spouse\'s claim age is bounded the same way -- 80 pays as 70 does from 80, and 56 as 62 does from 62', () => {
  const wrong = [];
  paysLike(run(couple(80)), run(couple(70)), 80).forEach((w) => wrong.push('spouse claim 80, ' + w));
  paysLike(run(couple(56)), run(couple(62)), 62).forEach((w) => wrong.push('spouse claim 56, ' + w));
  assert.deepStrictEqual(wrong, []);
});

test('Q70: runPlan() discloses a bounded claim age with an SS_CLAIM_AGE_BOUNDED warning, for self and spouse', () => {
  const warned = (r, p) => (r.issues || []).some((i) => i.code === 'SS_CLAIM_AGE_BOUNDED' && i.severity === 'WARNING' && i.state && i.state.path === p);
  const wrong = [];
  if (!warned(run(single(75)), 'retirement.ssClaim')) wrong.push('self claim 75 not disclosed');
  if (!warned(run(single(56)), 'retirement.ssClaim')) wrong.push('self claim 56 not disclosed');
  if (!warned(run(couple(80)), 'retirement.spouseClaim')) wrong.push('spouse claim 80 not disclosed');
  assert.deepStrictEqual(wrong, []);
});

test('Q70: the validator refuses a claim age outside 62-70 as an ERROR, for the spouse as well as self', () => {
  const wrong = [];
  for (const [label, plan, p] of [
    ['ssClaim 75', single(75), 'retirement.ssClaim'], ['ssClaim 56', single(56), 'retirement.ssClaim'],
    ['spouseClaim 80', couple(80), 'retirement.spouseClaim'], ['spouseClaim 56', couple(56), 'retirement.spouseClaim'],
  ]) {
    const hit = validateScenario(plan).issues.filter((i) => i.path === p);
    if (!hit.some((i) => i.code === 'SS_CLAIM_OUT_OF_RANGE' && i.severity === 'ERROR')) wrong.push(label + ' -> ' + JSON.stringify(hit.map((i) => i.severity + ' ' + i.code)));
  }
  assert.deepStrictEqual(wrong, []);
});

test('Q70: a fresh build\'s main thread and its generated Worker pay a claim at 75 exactly as a claim at 70, from 75', () => {
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const inRange = run(single(70));
  const wrong = [];
  let page;
  try { page = built.engine.runPlan(copy(single(75))); } catch (e) { page = { threw: String(e && e.message).split('\n')[0], rows: [] }; }
  paysLike(page, inRange, 75).forEach((w) => wrong.push('main thread, ' + w));
  let message;
  try { message = postToWorker(built.workerSource, copy(single(75))); } catch (e) { message = { error: String(e && e.message) }; }
  if (message.error !== undefined) wrong.push('Worker posted error: ' + String(message.error).split('\n')[0]);
  else paysLike(message.result, inRange, 75).forEach((w) => wrong.push('Worker, ' + w));
  assert.deepStrictEqual(wrong, []);
});

test('Q70 control: inside 62-70 the claim age still moves the benefit, the in-range claims are not disclosed, and the validator accepts 62 and 70', () => {
  const wrong = [];
  const at = (claim, age) => incomeByAge(run(single(claim))).get(age);
  const c64 = at(64, 80), c67 = at(67, 80), c68 = at(68, 80);
  if (!(c64 > 0 && c64 < c67 && c67 < c68)) wrong.push('at 80: claim 64 pays ' + c64 + ', 67 pays ' + c67 + ', 68 pays ' + c68);
  for (const claim of [62, 67, 70]) {
    const r = run(single(claim));
    if ((r.issues || []).some((i) => i.code === 'SS_CLAIM_AGE_BOUNDED')) wrong.push('claim ' + claim + ' was disclosed as bounded');
    const v = validateScenario(single(claim)).issues.filter((i) => i.path === 'retirement.ssClaim');
    if (v.length) wrong.push('validator on claim ' + claim + ': ' + JSON.stringify(v.map((i) => i.code)));
  }
  assert.deepStrictEqual(wrong, [], 'CONTROL');
});
