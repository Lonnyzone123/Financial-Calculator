/* S5AA, R14 round: AN ACCOUNT'S ID IS DATA, NEVER A PROPERTY NAME (external re-audit of `6468235`, R13-01).
 *
 * Two maps keyed by account id were plain objects: openingById (each account's balance at the row's opening, which
 * rmdObligations() reads) and rmdProtectedAmounts()'s `held` (the reserve kept out of the row's return). The validator
 * accepts any unique id -- tests/audit-cl-findings.test.js requires a prototype-named one to stay valid -- and CL-01 had
 * already met this fault in accountContractCode(). A key of "__proto__" is an inherited ACCESSOR, so assigning it
 * created no own entry: the opening balance was lost, rmdObligations() fell back to the live balance, and the
 * obligation was recomputed from what was left after the conversion and the loss. A key of "constructor", "toString"
 * or "hasOwnProperty" READ an inherited function, so `(held[id]||0)+take` built a string and growAccounts() a NaN.
 * MEASURED at `6468235`, one owner at 80, a $100,000 IRA, a -10% year, a $100,000 conversion or transfer to a Roth:
 * the id `ira` distributes $4,950.50; `__proto__` distributes $220.57 and reports nothing unmet, `ok`; the three
 * others end in TAX_QUOTE_NONFINITE_CONTEXT. With NO conversion at all, `__proto__` still distributed $4,455.45, the
 * obligation on the balance after the loss instead of the opening one.
 *
 * Both maps are now Object.create(null): every id is an own key and nothing is inherited. Every expectation below is
 * computed by hand, and every renamed plan must give the normal-id control's row, field for field, in every number.
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
const validator = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const PROTOTYPE_IDS = ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf', 'toLocaleString', '0'];
const OWED = 100000 / 20.2; // the obligation on the $100,000 opening balance at 80
const round = (x) => Math.round(Number(x) * 100) / 100;

const acct = (o) => Object.assign({ name: 'account', owner: 'self', basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0,
  annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100 }, o);

/* One owner at 80, a -10% simple year, $100,000 taxable cash (full basis) to pay the tax, nothing spent. `route` is
   'conversion', 'transfer' or 'none'. With `second`, a $10,000 IRA of lower priority joins the obligation; the two
   IRAs then earn their own returns through their allocations: the first +10%, the second -20%, the rest 0%. */
function planFor({ id = 'ira', route = 'conversion', timing = 'annual', qcd = 0, second = null }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 80, retireAge: 60, endAge: 81, spouseOn: false, spouseAge: 80, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: -10, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: timing });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [],
    otherIncomes: [], selfLife: 95, spouseLife: 95, survivor: false, dividendOn: false,
    withdrawalOrder: 'manual', manualOrder: 'taxable,hsa,roth,preTax' });
  Object.assign(p.advanced, { rmdOn: true, qcd, healthOn: false, ltcOn: false, debts: [], otherAssets: [], bondTentOn: false,
    reserveOn: false, glideOn: false, assetsOn: second !== null,
    assetClasses: [{ id: 'up', name: 'up', returnRate: 10, volatility: 0 }, { id: 'down', name: 'down', returnRate: -20, volatility: 0 },
      { id: 'flat', name: 'flat', returnRate: 0, volatility: 0 }],
    conversionOn: route === 'conversion', conversionAge: 80, conversionAmount: 100000,
    transferOn: route === 'transfer', transferAge: 80, transferFrom: id, transferTo: 'roth', transferAmount: 100000 });
  const withReturn = (cls) => (second === null ? {} : { [cls]: 100 });
  p.accounts = [
    acct({ id, type: 'traditionalIRA', taxClass: 'preTax', balance: 100000, priority: 1, allocation: withReturn('up') }),
    acct({ id: 'roth', type: 'rothIRA', taxClass: 'roth', balance: 0, priority: 2, allocation: withReturn('flat') }),
    acct({ id: 'cash', type: 'taxable', taxClass: 'taxable', basisPct: 100, balance: 100000, priority: 3, allocation: withReturn('flat') }),
  ];
  if (second !== null) p.accounts.push(acct({ id: second, type: 'traditionalIRA', taxClass: 'preTax', balance: 10000, priority: 9, allocation: { down: 100 } }));
  return p;
}
function run(opts) {
  const p = planFor(opts);
  assert.equal(validator.validateScenario(JSON.parse(JSON.stringify(p))).valid, true, JSON.stringify(opts) + ' is a valid plan');
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', JSON.stringify(opts) + ': ' + r.status + '/' + r.calculationErrorCode);
  return r;
}
/* Every numeric field of every row must equal the control's: the id is a name, and a name moves no dollar. */
function sameMoney(actual, control, label) {
  assert.equal(actual.rows.length, control.rows.length, label);
  control.rows.forEach((row, i) => {
    for (const [k, v] of Object.entries(row)) {
      if (typeof v !== 'number') continue;
      assert.ok(Number.isFinite(actual.rows[i][k]) === Number.isFinite(v), label + ' row ' + i + ' ' + k + ' finite');
      assert.equal(actual.rows[i][k], v, label + ' row ' + i + ' ' + k);
    }
  });
}

test('R13-01: a conversion or a transfer takes the whole obligation from the opening balance, whatever the IRA is called', () => {
  for (const route of ['conversion', 'transfer']) {
    const control = run({ route });
    const row = control.rows[1];
    /* The obligation is on the $100,000 opening; everything above it converts and loses 10% in the Roth; the reserve is
       held out of the loss and paid, so the IRA ends empty. */
    assert.equal(round(row.rmd), round(OWED), route);
    assert.equal(round(row.rmdDistributed), round(OWED), route);
    assert.equal(round(row.rmdUnmet), 0, route);
    assert.equal(round(row.roth), round((100000 - OWED) * 0.9), route);
    assert.equal(round(row.preTax), 0, route);
    assert.ok(Number.isFinite(row.taxes) && row.taxes > 0, route + ': the tax is finite');
    for (const id of PROTOTYPE_IDS) {
      const renamed = run({ id, route });
      assert.equal(round(renamed.rows[1].rmdDistributed), round(OWED), route + ' ' + id);
      sameMoney(renamed, control, route + ' ' + JSON.stringify(id));
    }
  }
});

test('R13-01: an ordinary RMD, no conversion -- the opening balance, not the balance after the loss', () => {
  /* The obligation is on the $100,000 opening balance and is paid after the -10% year: 90,000 - 4,950.50. The
     prototype-named id computed it on the $90,000 left after the loss: 4,455.45. */
  const control = run({ route: 'none' });
  assert.equal(round(control.rows[1].rmd), round(OWED));
  assert.equal(round(control.rows[1].preTax), round(90000 - OWED));
  for (const id of PROTOTYPE_IDS) sameMoney(run({ id, route: 'none' }), control, 'no conversion ' + JSON.stringify(id));
});

test('R13-01: monthly and quarterly timing, with and without a conversion', () => {
  for (const timing of ['monthly', 'quarterly']) {
    for (const route of ['conversion', 'none']) {
      const control = run({ route, timing });
      assert.equal(round(control.rows[1].rmd), round(OWED), timing + ' ' + route + ': the opening balance sets the obligation');
      assert.equal(round(control.rows[1].rmdUnmet), 0);
      if (route === 'conversion') assert.equal(round(control.rows[1].roth), round((100000 - OWED) * 0.9), timing);
      for (const id of PROTOTYPE_IDS) sameMoney(run({ id, route, timing }), control, timing + ' ' + route + ' ' + JSON.stringify(id));
    }
  }
});

test('R13-01: a QCD with a conversion', () => {
  /* The $2,000 QCD counts toward the obligation and the rest is distributed; the whole reserve is still the opening
     obligation. The prototype-named id reported $2,000 distributed against an obligation of $220.57. */
  const control = run({ qcd: 2000 });
  assert.equal(round(control.rows[1].rmdDistributed), round(OWED));
  assert.equal(round(control.rows[1].preTax), 0);
  for (const id of PROTOTYPE_IDS) sameMoney(run({ id, qcd: 2000 }), control, 'QCD ' + JSON.stringify(id));
});

test('R13-01: two IRAs with different returns and priorities, both renamed, in both name pairings', () => {
  /* The transfer empties the first IRA ($100,000 of the owner's $110,000 capacity less the reserve); the reserve,
     110,000 / 20.2 = 5,445.54, is protected in the second, the only one holding money, and paid from it:
     (10,000 - 5,445.54) x 0.8 = 3,643.56. With no transfer each IRA earns its own return and the first pays the RMD:
     100,000 x 1.1 - 5,445.54 + 10,000 x 0.8. */
  const owed = 110000 / 20.2;
  const transfer = run({ route: 'transfer', second: 'ira2' });
  assert.equal(round(transfer.rows[1].rmdDistributed), round(owed));
  assert.equal(round(transfer.rows[1].preTax), round((10000 - owed) * 0.8));
  assert.equal(round(transfer.rows[1].roth), 100000);
  const none = run({ route: 'none', second: 'ira2' });
  assert.equal(round(none.rows[1].rmd), round(owed));
  assert.equal(round(none.rows[1].preTax), round(100000 * 1.1 - owed + 10000 * 0.8));
  for (const [first, second] of [['__proto__', 'constructor'], ['constructor', '__proto__'], ['toString', '0'], ['valueOf', 'hasOwnProperty']]) {
    sameMoney(run({ id: first, route: 'transfer', second }), transfer, 'transfer ' + first + '/' + second);
    sameMoney(run({ id: first, route: 'none', second }), none, 'no transfer ' + first + '/' + second);
  }
});

/* The GENERATED WORKER -- the engine the browser actually runs, built from the shipped shell -- with the normal-id
   control beside the two ids that failed differently. */
const { liveWorkerSource, postToWorker, cleanup } = require('./lib/worker-source.js');
test.after(() => cleanup());
test('R13-01: the generated Worker agrees, control, constructor and __proto__', async () => {
  const source = await liveWorkerSource();
  for (const id of ['ira', 'constructor', '__proto__']) {
    for (const route of ['conversion', 'transfer']) {
      const message = postToWorker(source, planFor({ id, route }));
      assert.ok(!message.error, message.error);
      assert.equal(message.result.status, 'ok', id + ' ' + route);
      assert.equal(round(message.result.rows[1].rmdDistributed), round(OWED), id + ' ' + route);
      assert.equal(round(message.result.rows[1].roth), round((100000 - OWED) * 0.9), id + ' ' + route);
      assert.deepEqual(message.result.rows, engine.runPlan(planFor({ id, route })).rows, id + ' ' + route + ': row for row, the direct engine');
    }
  }
});
