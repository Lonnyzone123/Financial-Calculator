/* S5AA R23 round: R22-01 -- THE ROTH EXCLUSION FOLLOWS AN ACTUAL DRAW, BY THE OWNER'S AGE (ChatGPT's R22 whole-model
 * audit, 2026-09-24, priority 2; repair chosen by the owner 2026-09-24: key the flag on actual Roth draws by the owner's age).
 *
 * UNSUPPORTED_ROTH_ORDERING marks a result outside the supported domain because the engine has no Roth ordering, basis
 * or five-year clock: a Roth dollar drawn before 59 1/2 may not be qualified, and the model cannot say. It was raised
 * from INPUTS -- a Roth held, and the PRIMARY person retiring before 59 1/2 with recurring spending, or an early
 * conversion -- and never looked at what the plan did. So it fired on a household whose taxable account paid every
 * dollar (the Roth never moved), and was silent on a Roth that paid a one-time expense at 45. In r14's 70 members: 13
 * flagged, of which 7 never drew a Roth dollar early (3 golden scenarios among them), and 1 unflagged member drew $994
 * from a Roth at 45.
 *
 * Now: the flag is raised when a Roth account is actually drawn -- by the spending or tax-funding draw, or by a manual
 * transfer out to a non-Roth account -- while ITS OWNER is under 59 1/2. A conversion INTO a Roth is not a Roth draw. In
 * Monte Carlo, a draw on any path flags the run once (path 0 alone reports its own issues; the others are summarised).
 * All through runPlan() on validator-valid plans; balances are hand arithmetic at a 0% return.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const CODE = 'UNSUPPORTED_ROTH_ORDERING';

const account = (id, type, taxClass, balance, o = {}) => Object.assign({ id, name: id, type, taxClass, owner: 'self', balance,
  basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0,
  vesting: 100, priority: 1 }, o);

function plan(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: o.age, retireAge: o.retireAge === undefined ? o.age : o.retireAge, endAge: o.endAge,
    spouseOn: !!o.spouseAge, filing: o.spouseAge ? 'mfj' : 'single' });
  if (o.spouseAge) p.profile.spouseAge = o.spouseAge;
  Object.assign(p.assumptions, { method: o.method || 'simple', returnRate: o.returnRate || 0, volatility: o.volatility || 0,
    inflation: 0, fee: 0, seed: o.seed || 42, runs: o.runs || 1000 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: o.spending || 0, dividendOn: false, pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: o.expenses || [], otherIncomes: [] });
  Object.assign(p.advanced, { assetsOn: false, rmdOn: false, transferOn: false, conversionOn: false, healthOn: false,
    networthOn: true, otherAssets: [], debts: [] });
  if (o.advanced) Object.assign(p.advanced, o.advanced);
  p.accounts = o.accounts;
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, 'a valid plan: ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  return p;
}

function run(p) {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const flags = (r) => (r.issues || []).filter((i) => i.code === CODE);

test('R22-01: a Roth that is never drawn is not flagged -- the taxable account pays every dollar (was flagged)', () => {
  /* ChatGPT's first witness. 45 to 50, $500,000 taxable at full basis and $300,000 Roth, $40,000 a year, 0% return:
     taxable $500,000 - 5 x $40,000 = $300,000; the Roth stays at $300,000 throughout. */
  const r = run(plan({ age: 45, endAge: 50, spending: 40000,
    accounts: [account('cash', 'taxable', 'taxable', 500000), account('roth', 'rothIRA', 'roth', 300000, { basisPct: 0, priority: 2 })] }));
  assert.deepEqual(r.rows.map((x) => x.roth), [300000, 300000, 300000, 300000, 300000, 300000]);
  assert.equal(r.rows[5].taxable, 300000);
  assert.deepEqual(flags(r), [], 'no Roth dollar moved, so nothing is outside the Roth boundary');
});

test('R22-01: a Roth that pays a one-time expense at 45 is flagged, once, naming the owner\'s age (was silent)', () => {
  /* ChatGPT's second witness. $100,000 Roth, nothing else, no recurring spending, a $20,000 expense at 45: the Roth
     pays it and ends the year at $80,000. */
  const r = run(plan({ age: 45, endAge: 46, expenses: [{ name: 'Roof', kind: 'expense', age: 45, amount: 20000 }],
    accounts: [account('cash', 'taxable', 'taxable', 0), account('roth', 'rothIRA', 'roth', 100000, { basisPct: 0, priority: 2 })] }));
  assert.equal(r.rows[1].roth, 80000);
  const f = flags(r);
  assert.equal(f.length, 1, 'raised once per run, not once per draw');
  assert.equal(f[0].severity, 'WARNING');
  assert.equal(f[0].state.outsideSupportedDomain, true);
  assert.equal(f[0].state.exclusion, 'non-qualified Roth withdrawals');
  assert.equal(f[0].state.carriedTo, 'new-engine Roth block');
  assert.equal(f[0].state.firstDrawOwnerAge, 45);
});

test('R22-01: the OWNER\'s age decides -- a spouse\'s Roth drawn at 50 is flagged though the primary is 62', () => {
  /* The old predicate read the primary's retirement age (62) and so said nothing. Spending $30,000 a year from the
     spouse's $200,000 Roth, 0% return: $200,000 - 2 x $30,000 = $140,000 after two years. */
  const r = run(plan({ age: 62, endAge: 64, spouseAge: 50, spending: 30000,
    accounts: [account('roth', 'rothIRA', 'roth', 200000, { basisPct: 0, owner: 'spouse' })] }));
  assert.equal(r.rows[2].roth, 140000);
  const f = flags(r);
  assert.equal(f.length, 1);
  assert.equal(f[0].state.firstDrawOwnerAge, 50);
});

test('R22-01: CONTROL -- a spouse\'s Roth drawn at 62 is not flagged though the primary is 50 (was flagged)', () => {
  /* The mirror: the primary retires at 50 with spending, which the old predicate flagged, but every draw is from a Roth
     whose owner is past 59 1/2. $200,000 - 2 x $30,000 = $140,000. */
  const r = run(plan({ age: 50, endAge: 52, spouseAge: 62, spending: 30000,
    accounts: [account('roth', 'rothIRA', 'roth', 200000, { basisPct: 0, owner: 'spouse' })] }));
  assert.equal(r.rows[2].roth, 140000);
  assert.deepEqual(flags(r), []);
});

test('R22-01: a manual transfer out of a Roth to taxable at 45 is a Roth draw, and is flagged', () => {
  /* $10,000 moved at 45 from a $100,000 Roth into an empty taxable account: $90,000 and $10,000. */
  const r = run(plan({ age: 45, endAge: 46,
    advanced: { transferOn: true, transferFrom: 'roth', transferTo: 'cash', transferAmount: 10000, transferAge: 45 },
    accounts: [account('cash', 'taxable', 'taxable', 0), account('roth', 'rothIRA', 'roth', 100000, { basisPct: 0, priority: 2 })] }));
  assert.equal(r.rows[1].roth, 90000);
  assert.equal(r.rows[1].taxable, 10000);
  const f = flags(r);
  assert.equal(f.length, 1);
  assert.equal(f[0].state.firstDrawOwnerAge, 45);
});

test('R22-01: CONTROL -- a Roth to Roth transfer at 45 leaves Roth money in a Roth, and is not flagged', () => {
  /* $10,000 moved between two Roth IRAs: the Roth total stays $100,000. */
  const r = run(plan({ age: 45, endAge: 46,
    advanced: { transferOn: true, transferFrom: 'roth', transferTo: 'roth2', transferAmount: 10000, transferAge: 45 },
    accounts: [account('cash', 'taxable', 'taxable', 0), account('roth', 'rothIRA', 'roth', 100000, { basisPct: 0, priority: 2 }),
      account('roth2', 'rothIRA', 'roth', 0, { basisPct: 0, priority: 3 })] }));
  assert.equal(r.rows[1].roth, 100000);
  assert.deepEqual(flags(r), []);
});

test('R22-01: CONTROL -- an early conversion INTO a Roth, with no Roth draw, is not flagged (was flagged)', () => {
  /* $10,000 a year converted from a $300,000 IRA at 45, the taxable account paying everything else: the Roth only
     receives, $300,000 + $10,000 = $310,000 after the first year. A conversion is not a Roth withdrawal. */
  const r = run(plan({ age: 45, endAge: 46, advanced: { conversionOn: true, conversionAmount: 10000 },
    accounts: [account('cash', 'taxable', 'taxable', 500000), account('roth', 'rothIRA', 'roth', 300000, { basisPct: 0, priority: 2 }),
      account('pre', 'traditionalIRA', 'preTax', 300000, { basisPct: 0, priority: 3 })] }));
  assert.equal(r.rows[1].roth, 310000);
  assert.deepEqual(flags(r), []);
});

test('R22-01: Monte Carlo -- a draw on a LATER path flags the run once, though path 0 draws nothing early', () => {
  /* 55 to 60, $150,000 taxable and $500,000 Roth, $40,000 a year, 5% return at 25% volatility, seed 1. Path i uses
     seeds 1 + 2i. With runs 1 only path 0 runs, and it keeps the taxable account alive past 59 1/2: nothing is flagged.
     With runs 50, poorer paths empty the taxable account before 59 1/2 and draw the Roth: the run is flagged once. Path
     0 alone reports its own issues, so a flag raised only on a later path must be carried up to the run. */
  const mc = (runs) => plan({ method: 'monteCarlo', age: 55, endAge: 60, spending: 40000, returnRate: 5, volatility: 25, seed: 1, runs,
    accounts: [account('cash', 'taxable', 'taxable', 150000), account('roth', 'rothIRA', 'roth', 500000, { basisPct: 0, priority: 2 })] });
  assert.deepEqual(flags(run(mc(1))), [], 'CONTROL: path 0 alone draws nothing early');
  const f = flags(run(mc(50)));
  assert.equal(f.length, 1, 'one flag for the run, not one per path');
  assert.equal(f[0].state.outsideSupportedDomain, true);
});
