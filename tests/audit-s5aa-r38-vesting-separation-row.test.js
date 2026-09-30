/* S5AA R38 (R35-01, ChatGPT's R33-R37 change audit, P1; the owner 2026-09-29: "start R38") -- EMPLOYER MONEY EARNED IN THE ROW OF
 * SEPARATION IS VESTED OR FORFEITED WITH THE REST.
 *
 * R35 (SA32F-13) forfeits the unvested share of an account's employer money at the owner's separation. It ran that step BEFORE the row
 * credited its own deferrals and match, so a retirement inside a row (45.5) forfeited only the employer money of earlier rows; the
 * row's own match was deposited afterwards, and no later row forfeits it because the separation is past. R35's own test retires on a
 * row boundary, where the row of separation earns nothing. Now the row credits its contributions first and forfeits after, so every
 * employer dollar earned up to separation is held to the vested share (IRC 411(a)(2)(B); IRS "Retirement topics - vesting").
 *
 * The case is ChatGPT's: 45, a $100,000 salary, $6,000 a year deferred and matched 100% up to 6%, 20% vested (two years of service on the
 * six-year graded schedule), a 0% return, no spending. Each expectation is worked by hand below. */
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

const k401 = (over) => Object.assign({ id: 'k', name: '401(k)', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 0,
  contribution: 6000, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
  futureChanges: [], allocation: {}, matchOn: true, matchRate: 100, matchCap: 6, profitShare: 0, vesting: 20, priority: 1 }, over || {});

function plan(retireAge, accounts, profile) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 45, retireAge, endAge: 47, spouseOn: false, filing: 'single' }, profile || {});
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 100000, spouseSalary: 0, growth: 0, contributionStop: retireAge });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, stages: [], expenses: [], otherIncomes: [], pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, selfLife: 95, spouseLife: 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = accounts;
  return p;
}
function closing(p) {
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  const last = r.rows[r.rows.length - 1];
  return { preTax: +last.preTax.toFixed(2), roth: +last.roth.toFixed(2) };
}

test('R38 R35-01: a retirement inside a row forfeits the unvested share of that row\'s match too', () => {
  /* 45.5: half a year earns $3,000 deferred and $3,000 matched. Service 2 + floor(0.5) = 2, 20% vested: 3,000 + 600 = 3,600. The engine
     kept all 6,000. */
  assert.strictEqual(closing(plan(45.5, [k401()])).preTax, 3600);
  /* 46.5: $9,000 deferred and $9,000 matched; service 2 + floor(1.5) = 3, 40% vested: 9,000 + 3,600 = 12,600. The engine: 14,400. */
  assert.strictEqual(closing(plan(46.5, [k401()])).preTax, 12600);
  /* The control, on a row boundary (46): $6,000 each; service 3, 40%: 6,000 + 2,400 = 8,400, before and after. */
  assert.strictEqual(closing(plan(46, [k401()])).preTax, 8400);
});

test('R38 R35-01: profit sharing earned in the row of separation is held to the same vested share', () => {
  /* No match; a 5% profit share. 45.5: $3,000 deferred, 5% of the half year's $50,000 = $2,500 of profit share, 20% vested:
     3,000 + 500 = 3,500. */
  assert.strictEqual(closing(plan(45.5, [k401({ matchOn: false, profitShare: 5 })])).preTax, 3500);
});

test('R38 R35-01: a spouse separating inside a row, on the spouse\'s own clock', () => {
  /* The spouse is 44.25 when the plan opens and retires at 45.5 on their own clock -- a quarter of the way into the second row.
     Row one: $6,000 deferred, $6,000 matched. Row two: a quarter year, $1,500 and $1,500. Service 2 + floor(45.5 - 44.25) = 3, 40% vested:
     7,500 + 40% of 7,500 = 10,500. The engine forfeited 60% of row one's match at the row's start and kept row two's: 11,400. */
  const p = plan(45.5, [k401({ owner: 'spouse' })], { spouseOn: true, spouseAge: 44.25, filing: 'mfj' });
  p.employment.salary = 0;
  p.employment.spouseSalary = 100000;
  assert.strictEqual(closing(p).preTax, 10500);
});

test('R38 R35-01: a pre-tax match landing in another account is forfeited there', () => {
  /* The deferral goes to a Roth 401(k) and the match is pre-tax (not elected Roth), so it lands in a synthesized pre-tax account.
     45.5: Roth 3,000; pre-tax 20% of 3,000 = 600. */
  const r = closing(plan(45.5, [k401({ type: 'roth401k', taxClass: 'roth' })]));
  assert.deepStrictEqual(r, { preTax: 600, roth: 3000 });
});

test('R38 R35-01: control -- a Roth match is fully vested, and nothing of it is forfeited', () => {
  /* Notice 2024-2: a designated Roth match must be fully vested; the engine routes it to Roth only then (vesting 100). 45.5: $3,000
     deferred and $3,000 matched, and no negative employer entry afterwards, so the rows' contributions sum to 6,000. (The balance itself
     is lower by the income tax on the elected Roth match, which the row draws -- Q96, not vesting.) */
  const r = engine.runPlan(plan(45.5, [k401({ type: 'roth401k', taxClass: 'roth', matchRoth: true, vesting: 100 })]));
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(+r.rows.reduce((s, x) => s + x.contributions, 0).toFixed(2), 6000);
  assert.strictEqual(r.rows[r.rows.length - 1].preTax, 0);
});
