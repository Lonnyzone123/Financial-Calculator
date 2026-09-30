/* S5AA R39 (R38-03, ChatGPT's R38 change audit, P2; the owner 2026-09-29: "go with your recommendations") -- AN ELECTED ROTH MATCH FOLLOWS
 * THE VESTING THE EMPLOYEE HAS WHEN IT IS ALLOCATED.
 *
 * IRS Notice 2024-2, Q&A L-3, under IRC 402A(f)(3): "a matching contribution may be designated as a Roth contribution only if the employee is
 * fully vested in matching contributions at the time the contribution is allocated to the employee's account." employerMatchIsRoth() read
 * only the ENTERED percentage (`vesting === 100`), while employerVestedShare() -- the rule that decides what is forfeited -- vests on service
 * and at 65 (R35, R38). So:
 *   - someone who became fully vested during the plan kept receiving a pre-tax match (ChatGPT's witness);
 *   - someone entered as 100% vested with no service (`yearsOfService: 0`) had the match taxed as Roth and then mostly forfeited (found in
 *     R38 and reported to the owner).
 * Both now read the effective vested share, as the row allocates the match.
 *
 * Each case: $100,000 salary, $6,000 a year to a Roth 401(k), matched 100% up to 6% with the Roth election on, 0% return, no spending. */
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

function run(age, retireAge, vestingFields, matchRoth) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age, retireAge, endAge: Math.ceil(retireAge) + 1, filing: 'single', spouseOn: false });
  Object.assign(p.employment, { salary: 100000, spouseSalary: 0, growth: 0, contributionStop: retireAge });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [Object.assign({ id: 'k', name: 'Roth 401(k)', type: 'roth401k', taxClass: 'roth', owner: 'self', balance: 0, contribution: 6000,
    contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: true, matchRate: 100, matchCap: 6, profitShare: 0, matchRoth: matchRoth !== false, priority: 1 }, vestingFields)];
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return r;
}
const at = (r, age) => r.rows.find((x) => Math.abs(x.age - age) < 1e-9);

test('R39 R38-03: a match allocated once the employee is fully vested is Roth (ChatGPT\'s witness)', () => {
  /* 63 with five years of service (80%). Row 63 -> 64: service 5, not fully vested, so the $6,000 match is pre-tax. Row 64 -> 64.5: service
     6, fully vested, so the half-year's $3,000 match is Roth. At 65 the pre-tax balance is 6,000 (the engine: 9,000). */
  const r = run(63, 64.5, { vesting: 80, yearsOfService: 5 });
  assert.strictEqual(+at(r, 65).preTax.toFixed(2), 6000);
  /* The Roth match is income in the row it is allocated (Notice 2024-2, L-2): the elected row pays more tax than the same plan without
     the election, by at least the tax on $3,000 at the 12% federal and 2.5% Arizona margins (435). */
  const plain = run(63, 64.5, { vesting: 80, yearsOfService: 5 }, false);
  assert.ok(at(r, 65).taxes - at(plain, 65).taxes >= 435 - 0.01, 'the Roth match is not taxed in its row');
});

test('R39 R38-03: full vesting at 65 opens the election too', () => {
  /* 64 with no service entered. Row 64 -> 65: 0% vested, so the match is pre-tax (6,000). Row 65 -> 66: 65 is normal retirement age (R38),
     fully vested, so that match is Roth. Separation at 66 forfeits nothing. Pre-tax at 66: 6,000. */
  assert.strictEqual(+at(run(64, 66, { vesting: 0, yearsOfService: 0 }), 66).preTax.toFixed(2), 6000);
});

test('R39 R38-03: entered as 100% but with no service, the match is pre-tax and forfeited, not taxed as Roth', () => {
  /* 45 to 47, `vesting: 100` with `yearsOfService: 0`: service 0 then 1, never fully vested, so both $6,000 matches are pre-tax and
     tracked. Separation at 47: service 2, 20% vested, so 2,400 of 12,000 is kept. The Roth account holds only the 12,000 deferred. */
  const r = run(45, 47, { vesting: 100, yearsOfService: 0 });
  assert.deepStrictEqual([+at(r, 48).preTax.toFixed(2), +at(r, 48).roth.toFixed(2)], [2400, 12000]);
});

test('R39 R38-03: control -- entered as 100% with no service figure, the match is Roth from the start, as before', () => {
  const r = run(45, 47, { vesting: 100 });
  assert.strictEqual(at(r, 48).preTax, 0);
});
