/* S5AA R45 (the owner, 2026-10-03: "add the three missing tests") -- THREE BEHAVIOURS WITH NO TEST OF THEIR OWN.
 *
 * - SA42F-12 (R43): the 415(c)(1)(B) cap was tested by its balances only; its limit warning's text had no test.
 * - SA42F-08 (R43): the IRA-deduction phase-out width was tested in later years; the Roth phase-out's fixed $15,000 width
 *   (IRC 408A(c)(3)(A): the reduction runs over $15,000 for a single filer; only the starting amount is indexed) was not.
 * - R43 section 7 declared two validator-only rules -- plans the validator refuses that the engine still runs: the legacy
 *   "recurring" income type and TRANSFER_INTO_WORKPLACE_PLAN. Nothing held the declaration, so either side could drift silently.
 *
 * Returns are 0. Expectations are hand-derived.
 */
'use strict';
const { retireAtEnd } = require('./lib/working-horizon'); // S5AA R53 (the owner's decision 3, 2026-10-04): working-only horizons

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const engine = L.h.engine;
const { validateScenario } = require(path.join(__dirname, '..', 'src', 'scenario-validator.js'));

function run(p) {
  retireAtEnd(p); // S5AA R53: an end age before the retirement age is refused; the owner retires at the end age instead (output-neutral, tests/lib/working-horizon.js)
  const v = validateScenario(structuredClone(p));
  assert.equal(v.valid, true, JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  return r;
}

// SA42F-12: a worker of 45 on $30,000 deferring $20,000 with a 100% match up to 100% of pay. The match would be $20,000; additions
// are held to pay, $30,000, so the match is held to $10,000, and the warning says so in these words.
function k415(salary) {
  const p = L.basePlan({ age: 45, retireAge: 46, endAge: 46, salary, spending: 0,
    accounts: [L.account('brok', 'taxable', 0), L.account('k', 'traditional401k', 0, { contribution: 20000, matchOn: true, matchRate: 100, matchCap: 100 })] });
  p.employment.contributionStop = 46;
  return p;
}
const TEXT = "k: employer contributions were held to $10,000 so that this year's additions do not exceed the owner's pay (IRC 415(c)(1)(B)).";
test('R45 (SA42F-12 text): the 415(c)(1)(B) warning names the held amount and the rule', () => {
  const r = run(k415(30000));
  assert.ok(r.limitWarnings.includes(TEXT), JSON.stringify(r.limitWarnings));
  assert.equal(r.rows[1].preTax, 30000);
});
test('R45 (SA42F-12 text) control: on $60,000 of pay the $20,000 match is paid and nothing is said about 415(c)(1)(B)', () => {
  const r = run(k415(60000));
  assert.ok(!r.limitWarnings.some((w) => /415\(c\)\(1\)\(B\)/.test(w)), JSON.stringify(r.limitWarnings));
  assert.equal(r.rows[1].preTax, 40000);
});

// SA42F-08, the Roth width: single, 40, 3% inflation, a planned $7,500 Roth IRA contribution, limit policy "prevent" (an excess is
// not deposited anywhere, so no taxable account appears to add imputed dividends to MAGI). Tax year 2036 (the row from 50 to 51):
//   start = 153,000 + near(153,000 x (1.03^10 - 1), 1,000) = 153,000 + near(52,619.24) = 206,000; the end is start + 15,000 = 221,000;
//   the owner is 50 at the year's end, so the limit L is the indexed base plus the indexed catch-up (219(b)(5)(A) and (C)):
//   down(7,500 x 1.03^10, 500) + down(1,100 x 1.03^10, 100) = down(10,079.37, 500) + down(1,478.31, 100) = 10,000 + 1,400 = 11,400.
//   MAGI 221,000: at the end, no contribution. MAGI 220,000: L - down(L x 14,000 / 15,000, 10) = 11,400 - 10,640 = 760.
//   (Claude's first derivation left out the catch-up and expected 670; the engine's 760 is right.)
//   Before R43 the end was indexed on its own (168,000 + near(57,777.95) = 226,000, a $20,000 width), which allows a contribution at
//   221,000. In every earlier year the end is below $220,000 (2035: 200,000 + 15,000), so nothing was deposited before.
function rothAt(salary) {
  const p = L.basePlan({ age: 40, retireAge: 65, endAge: 51, inflation: 3, salary, spending: 0, accounts: [L.account('roth', 'rothIRA', 0, { contribution: 7500 })] });
  p.employment.contributionStop = 65;
  p.limitPolicy = 'prevent';
  return p;
}
test('R45 (SA42F-08, Roth): at the end of the indexed range ($221,000 in 2036) no Roth contribution is allowed -- the width stays $15,000', () => {
  assert.equal(run(rothAt(221000)).rows[11].roth, 0);
});
test('R45 (SA42F-08, Roth) control: $1,000 inside the range, the reduced limit is $760', () => {
  const r = run(rothAt(220000));
  assert.equal(r.rows[10].roth, 0, 'nothing before 2036');
  assert.equal(Math.round(r.rows[11].roth * 100) / 100, 760);
});

// R43 section 7, declared and not repaired: the validator refuses these plans; the engine runs them. Pinned as declared.
test('R45 (R43 section 7, declared): the legacy "recurring" income type -- the validator refuses it, the engine runs it', () => {
  const p = L.basePlan({ age: 60, endAge: 62, spending: 20000, accounts: [L.account('roth', 'rothIRA', 500000)] });
  p.retirement.otherIncomes = [{ type: 'recurring', owner: 'self', amount: 10000, start: 60, end: 70, growth: 0, growthMode: 'fixed' }];
  const v = validateScenario(structuredClone(p));
  assert.equal(v.valid, false, 'the validator refuses it');
  assert.equal(engine.runPlan(structuredClone(p)).status, 'ok', 'the engine runs it');
});
test('R45 (R43 section 7, declared): TRANSFER_INTO_WORKPLACE_PLAN -- the validator refuses a Roth IRA rolled into a 401(k), the engine runs it', () => {
  const p = L.basePlan({ age: 60, endAge: 62, spending: 0, accounts: [L.account('roth', 'rothIRA', 100000), L.account('k', 'traditional401k', 100000)] });
  Object.assign(p.advanced, { transferOn: true, transferFrom: 'roth', transferTo: 'k', transferAmount: 10000, transferAge: 60 });
  const v = validateScenario(structuredClone(p));
  assert.ok(v.issues.some((i) => i.code === 'TRANSFER_INTO_WORKPLACE_PLAN' && i.severity === 'ERROR'), JSON.stringify(v.issues.map((i) => i.code)));
  assert.equal(engine.runPlan(structuredClone(p)).status, 'ok', 'the engine runs it');
});

// Found by R45's task 6.5 browser check: the four R45 inputs, and R35's two IRMAA prior-income inputs, were read by the form but had
// no change listener, so typing a value neither recalculated nor saved it until some other input changed (R35's inputs since R35).
// Every input the form reads must be in the change-listener list (staticIds); the spouse switch alone is wired on its own.
test('R45 (task 6.5): every input the form reads recalculates on change -- including the R45 and R35 IRMAA inputs', () => {
  const fs = require('node:fs');
  const s = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
  const listened = new Set(JSON.parse(s.match(/staticIds=(\[[^\]]*\])/)[1]));
  const lines = s.split('\n'), i = lines.findIndex((l) => l.includes('function readStatic('));
  let body = lines[i];
  for (let k = i + 1; k < lines.length && !/^ {4}function /.test(lines[k]); k++) body += lines[k];
  const read = [...new Set([...body.matchAll(/"(v2-[a-z0-9-]+)"/g)].map((m) => m[1]))];
  assert.ok(read.length > 80, 'the form reads ' + read.length + ' inputs');
  assert.deepEqual(read.filter((id) => !listened.has(id) && id !== 'v2-spouse'), []);
  for (const id of ['v2-irmaa-magi-2', 'v2-irmaa-magi-1', 'v2-spouse-retire', 'v2-spending-start', 'v2-conversion-start', 'v2-health-coverage-end']) {
    assert.ok(listened.has(id), id);
  }
});
