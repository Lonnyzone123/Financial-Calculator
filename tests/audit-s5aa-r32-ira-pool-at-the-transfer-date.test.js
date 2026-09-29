/* S5AA R32: A TRANSFER THAT READS THE OWNER'S IRA POOL VALUES EVERY ONE OF THAT OWNER'S IRAs ON ITS DATE, AND AN IRA ROLLS INTO A
 * 401(k) ONLY ITS TAXABLE MONEY (ChatGPT's R31 change audit of 8afe16d, R31-01, P1, and R30A account audit of 66c406c, R30A-01, P1;
 * the owner 2026-09-28: "Repair in R32" and "Move taxable part only").
 *
 * R31-01: R31 measured a qualified HSA funding's taxable value from the owner's pool on the funding date -- but only the sending IRA
 * was carried to the date; the owner's other IRAs were read at the row's opening (or, after the draw, at the draw). A second IRA
 * that grew before the funding made the pool too small, so too much basis was used; one that fell, too little.
 *
 * R30A-01: IRC 408(d)(3)(A)(ii) lets an IRA distribution roll into an eligible employer plan only up to "the portion of the amount
 * received which is includible in gross income", and 408(d)(3)(H) treats the part rolled over as coming from income first, across
 * all the owner's IRAs. The engine moved an IRA's after-tax money into a 401(k) as if it were pre-tax: $8,600 of all-basis IRA money
 * went in, the basis stayed behind on an empty IRA, and it later sheltered a deductible $2,000 while the 401(k) was taxed in full.
 * Now the move is held to the owner's taxable IRA value on the date -- the pool less its basis -- and the rest stays in the IRA,
 * keeping its basis, with a warning.
 *
 * Fixture: ChatGPT's basisPlan() (audit/S5AA/R29/S5AA_R29_EXTERNAL_AUDIT_REPRO_20260928.js) -- $8,600 of nondeductible IRA money
 * made at 60, a $1,000 401(k), $30,000 of wages and a deductible $2,000 at 62, and a $100,000 expense at 62 that drains every
 * pre-tax account at the draw (62.5). ChatGPT's R31 repro adds a second IRA of the same owner at its own return.
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

const CLASS = { taxable: 'taxable', traditionalIRA: 'preTax', traditional401k: 'preTax', hsa: 'hsa' };
function account(id, type, balance, extra) {
  return Object.assign({ id, name: id, type, taxClass: CLASS[type], owner: 'self', balance, basisPct: type === 'taxable' ? 100 : 0,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: { flat: 100 }, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
    priority: id === 'cash' ? 0 : 2 }, extra || {});
}
/* x: sourceRate, secondRate, secondOpening, secondOwner ('self' | 'spouse' | null for none), opening (the sending IRA's pre-tax money
   at 60), at, to ('dst' HSA or 'work' 401(k)), amount. */
function basisPlan(o) {
  const x = Object.assign({ sourceRate: 0, secondRate: 0, secondOpening: 0, secondOwner: null, opening: 0, at: 61, to: 'dst', amount: 5400 }, o);
  const spouse = x.secondOwner === 'spouse';
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.limitPolicy = 'redirect';
  Object.assign(p.profile, { age: 60, retireAge: 63, endAge: 63, spouseOn: spouse, filing: spouse ? 'mfj' : 'single' });
  if (spouse) Object.assign(p.profile, { spouseAge: 60, spouseRetireAge: 63, spouseEndAge: 63 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: x.sourceRate, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 64 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, dividendQualified: 100,
    dividendGrowth: 0, dividendStart: 60, pension: 0, pensionCola: 0, ssBenefit: 0, spouseSS: 0, survivor: false, stages: [],
    expenses: [{ name: 'Drain', age: 62, amount: 100000 }], withdrawalOrder: 'manual', manualOrder: 'preTax,taxable,roth,hsa',
    otherIncomes: [
      { name: 'Basis-year wages', type: 'employment', owner: 'self', amount: 200000, start: 60, end: 61, growth: 0, growthMode: 'fixed' },
      { name: 'Later wages', type: 'employment', owner: 'self', amount: 30000, start: 62, end: 63, growth: 0, growthMode: 'fixed' }] });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, ltcOn: false, networthOn: true, otherAssets: [], debts: [],
    assetsOn: true, assetClasses: [{ id: 'flat', name: 'Flat', returnRate: x.sourceRate, volatility: 0 }, { id: 'second', name: 'Second', returnRate: x.secondRate, volatility: 0 }],
    rule55: false, penaltyException: false, transferOn: true, transferFrom: 'src', transferTo: x.to, transferAmount: x.amount, transferAge: x.at });
  p.accounts = [account('cash', 'taxable', 100000, { cashHolding: true, allocation: {} }),
    account('src', 'traditionalIRA', x.opening, { contribution: 8600, futureChanges: [{ age: 61, mode: 'set', value: 0 }, { age: 62, mode: 'set', value: 2000 }] }),
    account('dst', 'hsa', 0),
    account('work', 'traditional401k', 0, { contribution: 1000, futureChanges: [{ age: 61, mode: 'set', value: 0 }], priority: 4 })];
  if (x.secondOwner) p.accounts.push(account('second', 'traditionalIRA', x.secondOpening, { owner: x.secondOwner, allocation: { second: 100 }, priority: 3 }));
  return p;
}
function run(p) {
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.deepEqual((r.issues || []).filter((i) => i.severity === 'ERROR').map((i) => i.code), [], 'no ERROR issue');
  return r;
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);

/* ChatGPT's R31 ledger: every IRA of the funding owner valued at the funding instant; the funding takes that pool's taxable value
   first; the source then carries the funding out of its own growth; the drain at 62.5 takes both IRAs and the 401(k). A second IRA
   owned by the spouse is not in the pool, and is drawn as all pre-tax. */
function fundingLedger(x) {
  const g = 1 + x.sourceRate / 100, o = 1 + x.secondRate / 100, f = x.at - 61;
  const inPool = x.secondOwner === 'self' ? x.secondOpening * Math.pow(o, 1 + f) : 0;
  const pool = 8600 * Math.pow(g, 1 + f) + inPool;
  const basisLeft = 8600 - Math.min(8600, Math.max(0, 5400 - Math.max(0, pool - 8600)));
  const sourceAt62 = 8600 * g * g - 5400 * Math.pow(g, 1 - f);
  const ownIra = (sourceAt62 + 2000) * Math.sqrt(g) + (x.secondOwner === 'self' ? x.secondOpening * Math.pow(o, 2.5) : 0);
  const spouseIra = x.secondOwner === 'spouse' ? x.secondOpening * Math.pow(o, 2.5) : 0;
  return 30000 + Math.max(0, ownIra - basisLeft) + spouseIra + 1000 * Math.pow(g, 2.5) - 2000;
}

test('R31-01: a second IRA that grew before the funding is in the pool at its funding-date value -- the funding uses less basis', () => {
  for (const at of [61.25, 61.75]) {
    const x = { sourceRate: 10, secondRate: 20, secondOpening: 2000, secondOwner: 'self', at };
    near(run(basisPlan(x)).rows[3].federalAgi, fundingLedger(x), 'at ' + at + ' (ChatGPT: $32,552.19 at 61.25)');
  }
});

test('R31-01: a second IRA that fell before the funding -- the funding uses more basis', () => {
  const x = { sourceRate: 10, secondRate: -20, secondOpening: 2000, secondOwner: 'self', at: 61.25 };
  near(run(basisPlan(x)).rows[3].federalAgi, fundingLedger(x), 'ChatGPT: $31,540.91');
});

test('R31-01: the spouse\'s IRA is not in the self\'s pool -- the funding reads the self\'s IRAs only', () => {
  const x = { sourceRate: 10, secondRate: 20, secondOpening: 2000, secondOwner: 'spouse', at: 61.25 };
  near(run(basisPlan(x)).rows[3].federalAgi, fundingLedger(x), 'AGI');
});

test('R31-01 CONTROLS: a funding at the year\'s opening, and a flat second IRA, are unchanged', () => {
  for (const x of [{ sourceRate: 10, secondRate: 20, secondOpening: 2000, secondOwner: 'self', at: 61 },
    { sourceRate: 10, secondRate: 0, secondOpening: 2000, secondOwner: 'self', at: 61.25 }]) {
    near(run(basisPlan(x)).rows[3].federalAgi, fundingLedger(x), JSON.stringify(x));
  }
});

test('R30A-01 WITNESS: an all-basis IRA cannot roll into the 401(k) -- nothing moves, and the year is the year without it', () => {
  // ChatGPT's figures: $8,600 of basis stays to be recovered; the drain's taxable IRA money is the deductible $2,000; AGI $30,000 +
  // $2,000 + $1,000 - $2,000 = $31,000; tax $1,540 + $372.50 + $2,295 = $4,207.50; net worth $181,722 (it was $37,600, $5,164.50
  // and $180,765).
  const r = run(basisPlan({ to: 'work', amount: 8600 }));
  const end = r.rows[3];
  near(end.federalAgi, 31000, 'AGI');
  near(end.taxes, 4207.5, 'tax');
  near(end.networth, 181722, 'net worth');
  assert.ok((r.limitWarnings || []).some((w) => /taxable/.test(w) && /401\(k\)/.test(w)), 'a warning names the limit: ' + JSON.stringify(r.limitWarnings));
});

test('R30A-01: a mixed IRA rolls only its taxable value into the 401(k), and keeps its basis', () => {
  // $2,000 of pre-tax money and $8,600 of basis: $10,600 at 61, $2,000 taxable. $2,000 moves; the IRA keeps $8,600, all basis. At 62
  // the deductible $2,000 goes in ($10,600 holding $8,600: $2,000 taxable) and the 401(k) holds $3,000. AGI $30,000 + $2,000 + $3,000
  // - $2,000 = $33,000.
  near(run(basisPlan({ to: 'work', amount: 8600, opening: 2000 })).rows[3].federalAgi, 33000, 'AGI');
});

test('R30A-01 CONTROL: an IRA with enough pre-tax money rolls the whole amount', () => {
  // $20,000 of pre-tax money and $8,600 of basis: $28,600, $20,000 taxable. All $8,600 moves. At 62: the IRA holds $22,000 with $8,600
  // of basis ($13,400 taxable), the 401(k) $9,600. AGI $30,000 + $13,400 + $9,600 - $2,000 = $51,000.
  const r = run(basisPlan({ to: 'work', amount: 8600, opening: 20000 }));
  near(r.rows[3].federalAgi, 51000, 'AGI');
  assert.ok(!(r.limitWarnings || []).some((w) => /taxable/.test(w) && /401\(k\)/.test(w)), 'no warning');
});

test('R30A-01 with R31-01: the rollover\'s taxable value reads every IRA of the owner on the date', () => {
  // Source +10%, a second IRA of the self +20% from $2,000, asked for $8,600 at 61.25. Pool on the date: $8,600 x 1.1^1.25 + $2,000 x
  // 1.2^1.25 = $12,200.04, less $8,600 of basis: $3,600.04 moves. The drain at 62.5: the source ($8,600 x 1.1^2 - m x 1.1^0.75,
  // + $2,000) x sqrt(1.1), the second IRA $2,000 x 1.2^2.5, all holding $8,600 of basis; the 401(k) $1,000 x 1.1^2.5 + m x 1.1^1.25.
  const g = 1.1, m = 8600 * Math.pow(g, 1.25) + 2000 * Math.pow(1.2, 1.25) - 8600;
  const ira = (8600 * g * g - m * Math.pow(g, 0.75) + 2000) * Math.sqrt(g) + 2000 * Math.pow(1.2, 2.5);
  const work = 1000 * Math.pow(g, 2.5) + m * Math.pow(g, 1.25);
  const x = { to: 'work', amount: 8600, sourceRate: 10, secondRate: 20, secondOpening: 2000, secondOwner: 'self', at: 61.25 };
  near(run(basisPlan(x)).rows[3].federalAgi, 30000 + (ira - 8600) + work - 2000, 'AGI');
});
