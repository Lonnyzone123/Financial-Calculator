/* S5AA R54 item 3 (the owner's decision of 2026-10-04, after R54's reading D2) -- A VALUE OUTSIDE THE FORM'S OWN RANGE IS REFUSED BY EVERY
 * ROUTE.
 *
 * The form clamps 28 values (a 29th, the seed, is left to the owner) when the user edits them (readStatic() and save(): a fee to 0-2%, a withdrawal rate to 0-15%, a guardrail to 1%
 * or more, ...), and before R54 it clamped them on every calculation, so a hand-edited backup could not carry a value outside them into the
 * projection. The validator and the engine accepted them without a word (a salary of -$50,000, a fee of -1% or 50%, a withdrawal rate of
 * -4% or 80%, a guardrail of -20%, a flexibility of -10%, a COLA of -5%), and R54 item 2 now keeps a restored value as it is. The owner's
 * rule: each such value outside the form's range is refused, by the validator (OUT_OF_RANGE, an ERROR at its path) and the engine
 * (SCENARIO_PLAN_VALUE_OUT_OF_RANGE), through the one shared definition, src/plan-value-contract.json. The bound is the form's own clamp
 * of an edited value; the edge itself is accepted. A restored value inside the range is still kept exactly (item 2).
 *
 * Each bound is hand-read from the clamp in src/app-shell.html (quoted beside it). The base plan is a retired single person, age 60 to 61,
 * a $100,000 Roth, no spending, on the simple method.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadCalculator, waitFor } = require('./lib/harness');

const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const engine = L.h.engine;
const { validateScenario } = require(path.join(__dirname, '..', 'src', 'scenario-validator.js'));
const STORAGE_KEY = 'investment-calculator-v2c';
const set = (o, k, v) => { const f = k.split('.'); const last = f.pop(); f.reduce((x, g) => x[g], o)[last] = v; };
const base = () => { const p = L.basePlan({ age: 60, retireAge: 60, endAge: 61, spending: 0, accounts: [L.account('roth', 'rothIRA', 100000, { contributionBasis: 100000 })] }); p.profile.rothFirstContributionYear = 2000; return p; };
const errorsAt = (p, k) => validateScenario(structuredClone(p)).issues.filter((i) => i.severity === 'ERROR' && i.path === k).map((i) => i.code);
const refusal = (p) => engine.runPlan(structuredClone(p)).calculationErrorCode || null;

// [path, the clamp in readStatic() or save(), below the range (or null), above the range (or null), the lower edge, the upper edge (or null)]
const BOUNDS = [
  ['employment.salary', 'Math.max(0, salary)', -50000, null, 0, null],
  ['employment.spouseSalary', 'Math.max(0, spouse salary)', -1, null, 0, null],
  ['assumptions.fee', 'clamp(fee, 0, 2)', -1, 50, 0, 2],
  ['assumptions.volatility', 'Math.max(0, volatility)', -1, null, 0, null],
  ['retirement.spending', 'Math.max(0, spending)', -100, null, 0, null],
  ['retirement.withdrawalRate', 'clamp(rate, 0, 15)', -4, 80, 0, 15],
  ['retirement.upperGuardrail', 'Math.max(1, upper guardrail)', -20, null, 1, null],
  ['retirement.lowerGuardrail', 'Math.max(1, lower guardrail)', 0.5, null, 1, null],
  ['retirement.adjustment', 'Math.max(1, adjustment)', 0, null, 1, null],
  ['retirement.floor', 'Math.max(0, floor)', -1, null, 0, null],
  ['retirement.ceiling', 'Math.max(0, ceiling)', -1, null, 0, null],
  ['retirement.dividendYield', 'clamp(yield, 0, 20)', -0.5, 21, 0, 20],
  ['retirement.dividendQualified', 'clamp(qualified, 0, 100)', -1, 120, 0, 100],
  ['retirement.dividendGrowth', 'clamp(growth, -20, 20)', -25, 25, -20, 20],
  ['retirement.ssBenefit', 'Math.max(0, benefit)', -1, null, 0, null],
  ['retirement.spouseSS', 'Math.max(0, spouse benefit)', -1, null, 0, null],
  ['retirement.flexibility', 'clamp(flexibility, 0, 50)', -10, 60, 0, 50],
  ['retirement.vpwMinRate', 'save(): clamp(VPW minimum, 0, 25)', -1, 30, 0, 25],
  ['retirement.vpwMaxRate', 'save(): clamp(VPW maximum, 0, 100)', -1, 120, 0, 100],
  ['retirement.rmdMultiplier', 'save(): clamp(RMD multiplier, 0, 200)', -1, 250, 0, 200],
  ['retirement.rmdFloor', 'save(): Math.max(0, RMD floor)', -1, null, 0, null],
  ['retirement.ssCola', 'save(): clamp(SS COLA, 0, 15)', -5, 20, 0, 15],
  ['retirement.survivorSpendingReduction', 'save(): clamp(reduction, 0, 50)', -1, 75, 0, 50],
  ['advanced.correlation', 'clamp(correlation, -1, 1)', -1.5, 1.5, -1, 1],
  ['advanced.healthInflation', 'Math.max(0, health inflation); the contract keeps its maximum, 100', -2, 101, 0, 100],
  ['advanced.medicareInflation', 'clamp(Medicare inflation, -99, 100)', -99.5, 101, -99, 100],
  ['advanced.partDPremium', 'clamp(Part D premium, 0, 100000)', -1, 150000, 0, 100000],
  ['profile.priorIncomeThisYear', 'clamp(prior income, 0, 1e9)', -1, 2e9, 0, 1e9],
];

test('R54 item 3: a value outside the form\'s range is refused by the validator (OUT_OF_RANGE) and the engine (SCENARIO_PLAN_VALUE_OUT_OF_RANGE)', async (t) => {
  // Before R54 item 3 each of these was valid (no ERROR) and projected (status ok, no refusal code).
  for (const [k, clamp, below, above] of BOUNDS) {
    for (const v of [below, above]) {
      if (v === null) continue;
      const p = base(); set(p, k, v);
      await t.test(k + ' = ' + v + ' (' + clamp + '): the validator refuses it', () => assert.deepEqual(errorsAt(p, k), ['OUT_OF_RANGE']));
      await t.test(k + ' = ' + v + ': the engine refuses it', () => assert.equal(refusal(p), 'SCENARIO_PLAN_VALUE_OUT_OF_RANGE'));
    }
  }
});

test('R54 item 3 (control): each edge of the range is accepted by the validator and projected by the engine', async (t) => {
  for (const [k, , , , low, high] of BOUNDS) {
    for (const v of [low, high]) {
      if (v === null) continue;
      const p = base(); set(p, k, v);
      await t.test(k + ' = ' + v + ': no ERROR at its path', () => assert.deepEqual(errorsAt(p, k), []));
      await t.test(k + ' = ' + v + ': projected', () => assert.equal(refusal(p), null));
    }
  }
});

test('R54 item 3: the validator keeps one issue per condition -- a negative spending or volatility, and a qualified share above 100, are the contract\'s ERROR alone', async (t) => {
  // The three old warnings (NEGATIVE_SPENDING, NEGATIVE_VOLATILITY, DIVIDEND_QUALIFIED_OUT_OF_RANGE) described exactly the values now
  // refused; each is reported once, as the contract's OUT_OF_RANGE, and the warning code no longer appears.
  for (const [k, v] of [['retirement.spending', -100], ['assumptions.volatility', -1], ['retirement.dividendQualified', 120]]) {
    const p = base(); set(p, k, v);
    const at = validateScenario(structuredClone(p)).issues.filter((i) => i.path === k).map((i) => i.severity + ':' + i.code);
    await t.test(k + ' = ' + v, () => assert.deepEqual(at, ['ERROR:OUT_OF_RANGE']));
  }
});

async function importBackup(plans) {
  const dom = await loadCalculator();
  const w = dom.window, d = w.document;
  const input = d.getElementById('v2-import-settings'), status = d.getElementById('v2-status');
  const before = w.localStorage.getItem(STORAGE_KEY);
  const app = { version: 2, edition: '2C', page: 'setup', complexity: 'advanced', theme: 'auto', compare: false, active: 0, scenarios: plans };
  Object.defineProperty(input, 'files', { value: [new w.File([JSON.stringify({ format: STORAGE_KEY, version: 2, app })], 'backup.json', { type: 'application/json' })], configurable: true });
  status.textContent = '';
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  await waitFor(() => status.textContent !== '' && !/is-running/.test(d.getElementById('v2-performance').className), { window: w, timeoutMs: 20000 });
  return { w, d, before, status: status.textContent, after: () => w.localStorage.getItem(STORAGE_KEY) };
}

test('R54 item 3: Restore backup refuses a backup carrying a value outside the form\'s range, says which, and leaves the scenarios unchanged', async (t) => {
  // A 2.5% fee (the form's range is 0 to 2%). Before R54 item 3 the backup was restored (and R54 item 2 kept the 2.5%).
  const p = base(); p.assumptions.fee = 2.5;
  const s = await importBackup([p]);
  try {
    await t.test('the status line names the value', () => assert.match(s.status, /not restored[\s\S]*"assumptions\.fee" is 2\.5, expected at least 0 and at most 2/));
    await t.test('the stored scenarios are byte for byte unchanged', () => assert.equal(s.after(), s.before));
  } finally { s.w.close(); }
});

test('R54 item 3 (control): a restored value inside the range is still kept exactly (R54 item 2)', async (t) => {
  // A fee of 1.75% and a withdrawal rate of 14.5%, both inside the range, and 24 Monte Carlo runs (the run count keeps the engine's own
  // rule, 1 to 10,000): restored, calculated and saved exactly.
  const p = base(); p.assumptions.fee = 1.75; p.retirement.withdrawalRate = 14.5; p.assumptions.runs = 24;
  const s = await importBackup([p]);
  try {
    const q = JSON.parse(s.after()).scenarios[0];
    await t.test('restored', () => assert.doesNotMatch(s.status, /not restored/));
    await t.test('fee, rate and runs as restored', () => assert.deepEqual([q.assumptions.fee, q.retirement.withdrawalRate, q.assumptions.runs], [1.75, 14.5, 24]));
  } finally { s.w.close(); }
});
