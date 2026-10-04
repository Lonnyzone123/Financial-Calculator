/* S5AA R46 (the owner, 2026-10-03, on ChatGPT's AA1 assumptions audit, AA1-24 and Claude's verification MC-A to MC-E) -- MONTE CARLO
 * AND THE CASH RESERVE.
 *
 * The owner's decisions:
 * 1. MC-A, MC-D: ONE SET OF MARKET SHOCKS PER PATH AND YEAR, SHARED BY EVERY ACCOUNT. Each period of a Monte Carlo path draws, in this
 *    order: z_h, the household shock; then, with asset classes on, f, a common factor, and z_1..z_n, one per asset class in the plan's
 *    order -- whatever accounts exist. Class k's shock x_k has the plan's one correlation rho with every other class:
 *      rho >= 0:  x_k = sqrt(rho) f + sqrt(1 - rho) z_k;
 *      rho <  0:  x_k = sqrt(1 - rho) z_k + beta S, S the sum of z_j over the m active classes, beta = (sqrt(1 + (m-1) rho) - sqrt(1 - rho)) / m
 *                 (the symmetric square root of the m x m equicorrelation matrix).
 *    An account's return is its expected return plus sum_k w_k vol_k x_k (w its allocation weights, glided where the glide applies, as
 *    the expected return reads them). With asset classes off, or for an account with no allocation, it is assumptions.volatility x z_h.
 *    The expected return, the historical and simple methods, and the per-path seeding are unchanged.
 * 2. MC-C: A CORRELATION NO SET OF RETURNS CAN HAVE IS REFUSED, by the validator (INFEASIBLE_CORRELATION, an ERROR) and the engine
 *    (SCENARIO_INFEASIBLE_CORRELATION), when Monte Carlo reads it (asset classes on). One rho shared by m classes is possible only for
 *    -1/(m-1) <= rho <= 1. Active classes: those some account of the plan, as entered, weights above zero at the start or the end of its
 *    glide.
 * 3. MC-E: the app labels the success figure "All modeled spending funded", notes that adaptive strategies may cut spending, and the
 *    Monte Carlo summary shows the median and 10th-percentile real spending in the final projected year
 *    (result.finalYearRealSpending: { median, q10 }, today's dollars).
 * 4. MC-B: THE RESERVE IS THE HOUSEHOLD'S. Its share is min(1, spending x years / portfolio total), the same for every account; it was
 *    min(account balance, spending x years) / portfolio total, so an account smaller than the reserve under-reserved.
 *
 * Every expected figure is hand-derived from the rule and the inputs; the derivation sits beside each case. The draws are recomputed
 * here from the documented generator (rng, the murmur3 path seed and Box-Muller, written out below), never read from the engine.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const engine = L.h.engine;
const { validateScenario } = require(path.join(__dirname, '..', 'src', 'scenario-validator.js'));
const { checkResult } = require(path.join(__dirname, '..', 'tools', 'result-contract.js'));

// The documented generator, written out (tests/rng-seeding.test.js pins the same scheme).
const fmix32 = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
const pathSeed = (seed, i, stream) => fmix32((fmix32(seed >>> 0) + Math.imul(2 * i + stream + 1, 0x9e3779b9)) >>> 0);
function generator(seed) { let x = seed >>> 0; return () => { x += 0x6D2B79F5; let t = x; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function boxMuller(random) { let u = 0, v = 0; while (!u) u = random(); while (!v) v = random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const firstNormals = (seed, i, count) => { const g = generator(pathSeed(seed, i, 0)); return Array.from({ length: count }, () => boxMuller(g)); };

const cents = (x) => Math.round(x * 100) / 100;
function run(p) {
  const v = validateScenario(structuredClone(p));
  assert.equal(v.valid, true, JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  return r;
}
const roth = (id, balance, extra) => L.account(id, 'rothIRA', balance, extra);
const errors = (p) => validateScenario(structuredClone(p)).issues.filter((i) => i.severity === 'ERROR').map((i) => i.code + '@' + i.path);

/* A one-row Monte Carlo plan: age 40 to 41, no salary, no spending (retirement at 70), no fee, Roth and HSA balances only, so the
   row's closing balance is the opening balance times (1 + r): growth over a whole year with nothing deposited or drawn. */
function oneYear(accounts, classes, o = {}) {
  const p = L.basePlan({ age: 40, retireAge: 70, endAge: 41, spending: 0, accounts });
  Object.assign(p.assumptions, { method: 'monteCarlo', runs: o.runs ?? 1, seed: o.seed ?? 1234, volatility: o.volatility ?? 15, returnRate: o.returnRate ?? 6 });
  p.employment.contributionStop = 40;
  if (classes) Object.assign(p.advanced, { assetsOn: true, assetClasses: classes, correlation: o.rho ?? 0.25 });
  else p.advanced.assetsOn = false;
  return p;
}
const clampReturn = (r) => Math.min(2, Math.max(-0.95, r));

// --- Rule 1 (MC-A): the one-period return, hand-derived from the period's draws ----------------------------------------------------
// Stocks 8%/20%, bonds 4%/10%; one Roth 60/40; rho 0.5; seed 1234, path 0. The period draws z_h, f, z_s, z_b in that order.
// Expected return 0.6 x 8% + 0.4 x 4% = 6.4%. x_s = sqrt(.5) f + sqrt(.5) z_s, x_b = sqrt(.5) f + sqrt(.5) z_b.
// r = 6.4% + 0.6 x 20% x x_s + 0.4 x 10% x x_b; the row closes at $1,000,000 x (1 + r).
const TWO = [{ id: 'stocks', name: 'Stocks', returnRate: 8, volatility: 20 }, { id: 'bonds', name: 'Bonds', returnRate: 4, volatility: 10 }];
test('R46 rule 1: an account\'s return is its expected return plus its weighted class shocks (rho 0.5)', () => {
  const r = run(oneYear([roth('r', 1000000, { allocation: { stocks: 60, bonds: 40 } })], TWO, { rho: 0.5 }));
  const [, f, zs, zb] = firstNormals(1234, 0, 4), xs = Math.sqrt(0.5) * f + Math.sqrt(0.5) * zs, xb = Math.sqrt(0.5) * f + Math.sqrt(0.5) * zb;
  const ret = clampReturn(0.064 + 0.6 * 0.2 * xs + 0.4 * 0.1 * xb);
  assert.ok(Math.abs(r.rows[1].total - 1000000 * (1 + ret)) < 0.01, 'expected ' + cents(1000000 * (1 + ret)) + ', got ' + cents(r.rows[1].total));
});
// Three classes, rho -0.3, all held (m = 3): 1 + 2(-0.3) = 0.4, beta = (sqrt(0.4) - sqrt(1.3)) / 3,
// x_k = sqrt(1.3) z_k + beta (z_1 + z_2 + z_3). Allocation 50/30/20; returns 8/4/3; vols 20/10/2. Expected 4 + 1.2 + 0.6 = 5.8%.
const THREE = [{ id: 'stocks', name: 'Stocks', returnRate: 8, volatility: 20 }, { id: 'bonds', name: 'Bonds', returnRate: 4, volatility: 10 },
  { id: 'cash', name: 'Cash', returnRate: 3, volatility: 2 }];
test('R46 rule 1: a negative correlation combines the class draws by the symmetric square root (rho -0.3, three classes)', () => {
  const r = run(oneYear([roth('r', 1000000, { allocation: { stocks: 50, bonds: 30, cash: 20 } })], THREE, { rho: -0.3 }));
  const [, , z1, z2, z3] = firstNormals(1234, 0, 5), S = z1 + z2 + z3, beta = (Math.sqrt(0.4) - Math.sqrt(1.3)) / 3;
  const x = [z1, z2, z3].map((z) => Math.sqrt(1.3) * z + beta * S);
  const ret = clampReturn(0.058 + 0.5 * 0.2 * x[0] + 0.3 * 0.1 * x[1] + 0.2 * 0.02 * x[2]);
  assert.ok(Math.abs(r.rows[1].total - 1000000 * (1 + ret)) < 0.01, 'expected ' + cents(1000000 * (1 + ret)) + ', got ' + cents(r.rows[1].total));
});
// Asset classes off: both accounts take the household shock z_h, the period's first draw, at assumptions.volatility (15%) around the
// return rate (6%): the household closes at $1,000,000 x (1 + 6% + 15% z_h), however the money is split.
test('R46 rule 1: with asset classes off every account shares the household shock', () => {
  const r = run(oneYear([roth('a', 600000), roth('b', 400000)], null));
  const [zh] = firstNormals(1234, 0, 1), ret = clampReturn(0.06 + 0.15 * zh);
  assert.ok(Math.abs(r.rows[1].total - 1000000 * (1 + ret)) < 0.01, 'expected ' + cents(1000000 * (1 + ret)) + ', got ' + cents(r.rows[1].total));
});
// CONTROL: one account with classes off drew its own first normal before, and the household shock IS the first normal: unchanged.
test('R46 rule 1 control: one account with asset classes off draws what it always drew', () => {
  const r = run(oneYear([roth('a', 1000000)], null));
  const [zh] = firstNormals(1234, 0, 1), ret = clampReturn(0.06 + 0.15 * zh);
  assert.ok(Math.abs(r.rows[1].total - 1000000 * (1 + ret)) < 0.01);
});

// --- Rule 1: the correlation the shocks carry, measured over 2,000 paths ----------------------------------------------------------
// A stocks-only Roth and a bonds-only HSA, rho 0.6: their first-year returns are x_s x 20% and x_b x 10% around 8% and 4%, so the
// sample correlation across paths estimates 0.6 (standard error about (1 - 0.36)/sqrt(2000) = 0.014; the bound is 0.05). Before,
// each account drew independently, so the sample correlation estimated 0.
test('R46 rule 1: two accounts in different classes move together at the plan\'s correlation', () => {
  const p = oneYear([roth('s', 1000000, { allocation: { stocks: 100 } }), L.account('h', 'hsa', 1000000, { allocation: { bonds: 100 } })], TWO, { rho: 0.6, seed: 99 });
  const rs = [], rb = [];
  for (let i = 0; i < 2000; i++) {
    const row = engine.simulatePlan(structuredClone(p), engine.rng(pathSeed(99, i, 0)), 0, engine.rng(pathSeed(99, i, 1)), null).rows[1];
    rs.push(row.roth / 1000000 - 1); rb.push(row.hsa / 1000000 - 1);
  }
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length, ms = mean(rs), mb = mean(rb);
  const cov = mean(rs.map((x, i) => (x - ms) * (rb[i] - mb))), ss = Math.sqrt(mean(rs.map((x) => (x - ms) ** 2))), sb = Math.sqrt(mean(rb.map((x) => (x - mb) ** 2)));
  assert.ok(Math.abs(cov / (ss * sb) - 0.6) < 0.05, 'sample correlation ' + (cov / (ss * sb)).toFixed(4));
  /* CONTROL: each class keeps its own volatility (20% and 10%, within 1 point at 2,000 paths). */
  assert.ok(Math.abs(ss - 0.2) < 0.01 && Math.abs(sb - 0.1) < 0.005, 'volatilities ' + ss.toFixed(4) + ', ' + sb.toFixed(4));
});

// --- Rule 1 (MC-A): splitting the money does not change the risk -----------------------------------------------------------------
// ChatGPT's AA1-24 experiment: $1,000,000 Roth, 7% / 20%, $40,000 fixed-real spending (4%), 2.5% inflation, 65 to 95, flexibility 0,
// 1,000 paths, seed 42791. Every account earns the same rate each period (same expected return, same shock), so twenty $50,000
// accounts are one $1,000,000 account in twenty pieces: the same paths, the same success. (Before: 59.8% against 99.2%.)
function aa1(accounts, o = {}) {
  const p = L.basePlan({ age: 65, endAge: 95, strategy: 'fixedReal', spending: 40000, accounts });
  Object.assign(p.assumptions, { method: o.method ?? 'monteCarlo', runs: o.runs ?? 1000, seed: 42791, returnRate: 7, volatility: 20, inflation: 2.5 });
  p.retirement.withdrawalRate = 4;
  p.advanced.assetsOn = false;
  return p;
}
const twenty = (allocation) => Array.from({ length: 20 }, (_, i) => roth('r' + i, 50000, allocation ? { allocation } : {}));
test('R46 rule 1 (MC-A): one $1,000,000 account and twenty $50,000 accounts have the same paths', () => {
  const one = run(aa1([roth('r', 1000000)])), many = run(aa1(twenty()));
  assert.equal(many.successRate, one.successRate, 'one ' + one.successRate + '%, twenty ' + many.successRate + '%');
  for (let k = 0; k < one.rows.length; k++) assert.ok(Math.abs(many.rows[k].total - one.rows[k].total) < 0.01, 'row ' + one.rows[k].age);
});
// CONTROL: the one-account run is unchanged (its draws are unchanged, case above); 59.8% is the pre-repair figure AA1 measured.
test('R46 rule 1 control: the one-account AA1 plan keeps its 59.8%', () => {
  assert.equal(run(aa1([roth('r', 1000000)])).successRate, 59.8);
});

// --- Rule 1 (MC-D): account order and an empty account do not move a path ----------------------------------------------------------
// Three accounts of three tax classes, drawn in the manual order taxable, preTax, Roth, so their array order decides nothing outside
// the draws (the simple-mode control shows it); an empty taxable account adds nothing to any balance. The draws are the same
// whatever the accounts, so the results are identical.
function three(o = {}) {
  const accts = [L.account('t', 'taxable', 300000, { basisPct: 100 }), L.account('i', 'traditionalIRA', 400000), roth('r', 300000)];
  if (o.allocation) accts.forEach((a) => { a.allocation = o.allocation; });
  if (o.reverse) accts.reverse();
  if (o.empty) accts.push(L.account('e', 'taxable', 0, { basisPct: 100, allocation: o.allocation || { flat: 100 }, priority: 3 }));
  const p = aa1(accts, { method: o.method, runs: 300 });
  if (o.allocation) Object.assign(p.advanced, { assetsOn: true, assetClasses: TWO, correlation: 0.3 });
  return p;
}
const sameRows = (a, b, label) => { assert.equal(a.successRate, b.successRate, label + ': success ' + a.successRate + ' vs ' + b.successRate);
  for (let k = 0; k < a.rows.length; k++) assert.ok(Math.abs(a.rows[k].total - b.rows[k].total) < 0.01, label + ': row ' + a.rows[k].age + ' ' + cents(a.rows[k].total) + ' vs ' + cents(b.rows[k].total)); };
test('R46 rule 1 (MC-D): reversing the accounts or adding an empty one leaves Monte Carlo unchanged (classes off)', () => {
  const base = run(three());
  sameRows(base, run(three({ reverse: true })), 'reversed');
  sameRows(base, run(three({ empty: true })), 'empty account');
});
test('R46 rule 1 (MC-D): the same with asset classes on (60/40 in every account)', () => {
  const alloc = { stocks: 60, bonds: 40 }, base = run(three({ allocation: alloc }));
  sameRows(base, run(three({ allocation: alloc, reverse: true })), 'reversed');
  sameRows(base, run(three({ allocation: alloc, empty: true })), 'empty account');
});
test('R46 rule 1 (MC-D) control: in simple mode the order and the empty account already changed nothing', () => {
  const base = run(three({ method: 'simple' }));
  sameRows(base, run(three({ method: 'simple', reverse: true })), 'reversed');
  sameRows(base, run(three({ method: 'simple', empty: true })), 'empty account');
});
// Asset classes on: two accounts holding the same 60/40 receive the same shock, so a split is invisible there too.
test('R46 rule 1 (MC-A): with asset classes on, one 60/40 account and twenty have the same paths', () => {
  const on = (accts) => { const p = aa1(accts, { runs: 300 }); Object.assign(p.advanced, { assetsOn: true, assetClasses: TWO, correlation: 0.3 }); return p; };
  sameRows(run(on([roth('r', 1000000, { allocation: { stocks: 60, bonds: 40 } })])), run(on(twenty({ stocks: 60, bonds: 40 }))), 'twenty');
});

// --- Rule 1 and Q19: a destination created mid-period takes the period's shared shock ---------------------------------------------
// RA-02's Case B under Monte Carlo: a Roth household with pension surplus invests it in a taxable account the engine creates in the
// first row; the control already holds an equivalent empty taxable account. Q19 gave the created account its expectation in its
// first period because drawing for it would shift every later draw; with one shared draw per period nothing shifts, so it takes the
// period's shock like the pre-existing one and the two runs agree path by path.
test('R46 rule 1: a created invest destination and an equivalent pre-existing one agree under Monte Carlo (the creation-period expectation retired)', () => {
  const plan = (accounts) => {
    const p = L.basePlan({ age: 75, endAge: 78, strategy: 'fixedNominal', spending: 20000, pension: 60000, accounts });
    Object.assign(p.assumptions, { method: 'monteCarlo', runs: 50, seed: 7, returnRate: 10, volatility: 15 });
    Object.assign(p.advanced, { assetsOn: false, rmdOn: false, surplusPolicy: 'invest' });
    return p;
  };
  const created = run(plan([L.account('roth', 'rothIRA', 1000000, { allocation: {} })]));
  const control = run(plan([L.account('roth', 'rothIRA', 1000000, { allocation: {} }), L.account('tax0', 'taxable', 0, { basisPct: 100, allocation: {}, priority: 3 })]));
  sameRows(created, control, 'created vs pre-existing');
});

// --- Rule 2 (MC-C): a correlation no set of returns can have is refused -----------------------------------------------------------
// Five classes at 20% volatility, 20% each in one account, 8% expected each. One rho among five classes is possible only for
// rho >= -1/4. At -0.5 the old engine took the variance's negative value as zero and showed a certain result with status ok.
const FIVE = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id, returnRate: 8, volatility: 20 }));
function five(rho, o = {}) {
  const accts = [roth('r', 1000000, { allocation: { a: 20, b: 20, c: 20, d: 20, e: 20 } })];
  if (o.extraClass) accts.push(roth('x', 0, { allocation: { f: 100 } }));
  const p = L.basePlan({ age: 40, retireAge: 70, endAge: 45, spending: 0, accounts: accts });
  Object.assign(p.assumptions, { method: o.method ?? 'monteCarlo', runs: 200, seed: 5, volatility: 15 });
  p.employment.contributionStop = 40;
  Object.assign(p.advanced, { assetsOn: true, correlation: rho, assetClasses: o.extraClass || o.unused ? FIVE.concat([{ id: 'f', name: 'f', returnRate: 5, volatility: 10 }]) : FIVE });
  return p;
}
const refusal = (p) => engine.runPlan(structuredClone(p)).calculationErrorCode || 'ok';
test('R46 rule 2 (MC-C): rho -0.5 across five held classes is refused by both layers', () => {
  const p = five(-0.5);
  assert.ok(errors(p).includes('INFEASIBLE_CORRELATION@advanced.correlation'), errors(p).join(', '));
  assert.equal(refusal(p), 'SCENARIO_INFEASIBLE_CORRELATION');
  const msg = validateScenario(structuredClone(p)).issues.find((i) => i.code === 'INFEASIBLE_CORRELATION').message;
  assert.match(msg, /-0\.25/, 'the message names the lowest correlation five classes allow: ' + msg);
});
// rho -0.25 is the boundary: 1 + 4(-0.25) = 0, beta = -sqrt(1.25)/5, so the five shocks sum to zero in every period and the account's
// shock (20% x 20% x the sum) is zero: every path earns 8% exactly. Five years on $1,000,000: $1,000,000 x 1.08^5 = $1,469,328.08.
test('R46 rule 2 (MC-C): rho -0.25 is possible -- a zero spread, every path earns the 8% expectation', () => {
  const r = run(five(-0.25));
  const last = r.rows[r.rows.length - 1];
  assert.ok(Math.abs(last.total - 1469328.08) < 0.01, 'median ' + cents(last.total));
  assert.ok(Math.abs(last.q10 - last.q90) < 0.01, 'spread ' + cents(last.q90 - last.q10));
});
test('R46 rule 2 controls: rho 0 has a spread; -0.2499 runs; simple mode never reads the correlation', () => {
  const r = run(five(0)), last = r.rows[r.rows.length - 1];
  assert.ok(last.q90 - last.q10 > 100000, 'spread ' + cents(last.q90 - last.q10));
  assert.equal(refusal(five(-0.2499)), 'ok');
  assert.equal(refusal(five(-0.5, { method: 'simple' })), 'ok');
  assert.ok(!errors(five(-0.5, { method: 'simple' })).some((e) => e.startsWith('INFEASIBLE_CORRELATION')));
});
// ACTIVE CLASSES: a sixth class nobody holds does not count (m stays 5, -0.25 allowed); a sixth class an account holds does, even an
// empty account (m = 6: the lowest is -1/5 = -0.2, so -0.25 is refused).
test('R46 rule 2: only classes an account holds count -- a defined but unheld class does not', () => {
  assert.equal(refusal(five(-0.25, { unused: true })), 'ok');
  assert.deepEqual(errors(five(-0.25, { unused: true })).filter((e) => e.startsWith('INFEASIBLE')), []);
  assert.equal(refusal(five(-0.25, { extraClass: true })), 'SCENARIO_INFEASIBLE_CORRELATION');
  assert.ok(errors(five(-0.25, { extraClass: true })).includes('INFEASIBLE_CORRELATION@advanced.correlation'));
});
// THE GLIDE: a stocks-only account and a cash-only account hold two classes (m = 2, rho >= -1). Gliding to 60% stock moves the first
// into bonds (an account with no non-stock holding glides into bonds) and the second into stocks: three classes over the glide,
// rho >= -0.5, so -0.6 is refused with the glide on and allowed with it off.
test('R46 rule 2: a class an account glides into counts', () => {
  const g = (glideOn) => {
    const p = five(-0.6, {});
    p.accounts = [roth('s', 500000, { allocation: { stocks: 100 } }), roth('c', 500000, { allocation: { cash: 100 } })];
    Object.assign(p.advanced, { assetClasses: THREE, glideOn, retirementStock: 60 });
    return p;
  };
  assert.equal(refusal(g(false)), 'ok');
  assert.equal(refusal(g(true)), 'SCENARIO_INFEASIBLE_CORRELATION');
  assert.ok(errors(g(true)).includes('INFEASIBLE_CORRELATION@advanced.correlation'));
});
test('R46 rule 2: a correlation above 1 is refused where Monte Carlo reads it', () => {
  const p = five(1.2);
  assert.equal(refusal(p), 'SCENARIO_INFEASIBLE_CORRELATION');
  assert.ok(errors(p).includes('INFEASIBLE_CORRELATION@advanced.correlation'));
});

// --- Rule 4 (MC-B): the reserve is the household's ------------------------------------------------------------------------------
// Retired at 65, 7% expected, no fee, a 3-year reserve on $40,000: the reserve is $120,000, 12% of a $1,000,000 portfolio, so every
// account earns 0.88 x 7% + 0.12 x 3% = 6.16% + 0.36% = 6.52%. Before, a $50,000 account reserved min($50,000, $120,000) = 5% of the
// portfolio and earned 0.95 x 7% + 0.05 x 3% = 6.8%.
function reservePlan(accounts, endAge) {
  const p = L.basePlan({ age: 65, endAge: endAge ?? 95, strategy: 'fixedNominal', spending: 40000, returnRate: 7, accounts });
  Object.assign(p.advanced, { assetsOn: false, reserveOn: true, reserveYears: 3 });
  return p;
}
test('R46 rule 4 (MC-B): every account blends the same household reserve share (6.52%)', () => {
  const p = reservePlan(twenty());
  const small = engine.accountReturnForPeriod(p.accounts[0], p, 65, 0, 0, null, 1000000, false, 40000);
  assert.ok(Math.abs(small - 0.0652) < 1e-12, 'a $50,000 account earns ' + small);
});
test('R46 rule 4 control: an account holding the whole portfolio already earned 6.52%', () => {
  const p = reservePlan([roth('r', 1000000)]);
  assert.ok(Math.abs(engine.accountReturnForPeriod(p.accounts[0], p, 65, 0, 0, null, 1000000, false, 40000) - 0.0652) < 1e-12);
});
// A reserve larger than the portfolio: $120,000 on $100,000 is capped at the whole portfolio (share 1), so each account earns 3%.
test('R46 rule 4 (MC-B): a reserve above the portfolio holds all of it at the reserve rate', () => {
  const p = reservePlan([roth('a', 50000), roth('b', 50000)]);
  assert.ok(Math.abs(engine.accountReturnForPeriod(p.accounts[0], p, 65, 0, 0, null, 100000, false, 40000) - 0.03) < 1e-12);
});
test('R46 rule 4 (MC-B): one $1,000,000 account and twenty $50,000 accounts project the same', () => {
  const one = run(reservePlan([roth('r', 1000000)])), many = run(reservePlan(twenty()));
  for (let k = 0; k < one.rows.length; k++) assert.ok(Math.abs(many.rows[k].total - one.rows[k].total) < 0.01, 'row ' + one.rows[k].age + ': ' + cents(one.rows[k].total) + ' vs ' + cents(many.rows[k].total));
});
// CONTROL: two $500,000 accounts each hold more than the $120,000 reserve, so each reserved 12% before as well: unchanged. Over ten
// years the first account pays $40,000 a year and earns about $32,600 (6.52% of $500,000), so it stays far above the reserve; with
// every account above the reserve in every year, the old formula and the household one agree, and so do one account and two.
test('R46 rule 4 control: accounts larger than the reserve are unchanged', () => {
  const p = reservePlan([roth('a', 500000), roth('b', 500000)], 75);
  assert.ok(Math.abs(engine.accountReturnForPeriod(p.accounts[0], p, 65, 0, 0, null, 1000000, false, 40000) - 0.0652) < 1e-12);
  const one = run(reservePlan([roth('r', 1000000)], 75)), two = run(p);
  assert.ok(Math.abs(two.rows[two.rows.length - 1].total - one.rows[one.rows.length - 1].total) < 0.01);
});

// --- Rule 3 (MC-E): the final year's real spending --------------------------------------------------------------------------------
// Income-first spending of $40,000 in today's dollars, 2.5% inflation, a portfolio no path can exhaust: every path spends $40,000 x the
// inflation factor at its last row's opening (the price level the year's spending is set at), which is $40,000 in today's dollars, so
// the median and the 10th percentile are both $40,000.
function spendPlan(strategy, o = {}) {
  const p = L.basePlan({ age: 65, endAge: 75, strategy, spending: 40000, accounts: [roth('r', o.balance ?? 5000000)] });
  Object.assign(p.assumptions, { method: 'monteCarlo', runs: o.runs ?? 101, seed: 3, returnRate: 6, volatility: 15, inflation: 2.5 });
  p.retirement.withdrawalRate = 4;
  p.advanced.assetsOn = false;
  return p;
}
test('R46 rule 3 (MC-E): the final year\'s real spending of an inflation-matched budget is $40,000 at the median and the 10th percentile', () => {
  const r = run(spendPlan('incomeFirst'));
  assert.ok(r.finalYearRealSpending, 'the Monte Carlo result carries the summary');
  assert.equal(cents(r.finalYearRealSpending.median), 40000);
  assert.equal(cents(r.finalYearRealSpending.q10), 40000);
  assert.deepEqual(checkResult(r, { plan: spendPlan('incomeFirst') }).violations, []);
  assert.deepEqual(checkResult(r, { plan: spendPlan('incomeFirst') }).unspecified, []);
});
// A constant 4% of the balance: each path's last-year spending, divided by the inflation factor at that row's opening (1.025^9: the
// last row runs from 74 to 75),
// sorted; the median is the 51st of 101 values and the 10th percentile the 11th (position (101 - 1) x 0.1 = 10, no interpolation).
test('R46 rule 3 (MC-E): a constant-percentage budget\'s final-year median and 10th percentile, path by path', () => {
  const p = spendPlan('constantPercent', { balance: 1000000 }), r = run(p), real = [];
  for (let i = 0; i < 101; i++) {
    const rows = engine.simulatePlan(structuredClone(p), engine.rng(pathSeed(3, i, 0)), 0, engine.rng(pathSeed(3, i, 1)), null).rows;
    real.push(rows[rows.length - 1].spending / Math.pow(1.025, 9));
  }
  real.sort((a, b) => a - b);
  assert.ok(Math.abs(r.finalYearRealSpending.median - real[50]) < 0.01, cents(r.finalYearRealSpending.median) + ' vs ' + cents(real[50]));
  assert.ok(Math.abs(r.finalYearRealSpending.q10 - real[10]) < 0.01, cents(r.finalYearRealSpending.q10) + ' vs ' + cents(real[10]));
  assert.ok(real[10] < real[50], 'CONTROL: the paths differ');
});
test('R46 rule 3 control: a simple or historical result carries no Monte Carlo summary', () => {
  const p = spendPlan('incomeFirst');
  p.assumptions.method = 'simple';
  assert.equal(run(p).finalYearRealSpending, undefined);
});

// --- Rule 3 (MC-E): the app's label, note and Monte Carlo summary -------------------------------------------------------------------
// The success figure is labelled "All modeled spending funded" with a note that adaptive strategies may cut spending; in Monte Carlo
// the card adds the final year's median and 10th-percentile spending in today's dollars. The plan: $5,000,000 at 6% / 15%, income-
// first $40,000 for ten years, so no path can fall short (100.0%) and both figures are $40,000 (the engine case above). The app's
// default spending flexibility (10%: a year after a down year spends 10% less) is set to 0, as in the engine case: with it on, the
// build measured a 10th percentile of $36,000 -- recorded in the build report as a derivation miss, and the summary showing exactly the
// cut the owner's note warns of. Simple mode describes one path and shows no Monte Carlo summary.
const { loadCalculator, waitFor } = require('./lib/harness');
async function appCard(method) {
  const dom = await loadCalculator();
  const w = dom.window, doc = w.document;
  try {
    const app = JSON.parse(w.localStorage.getItem('investment-calculator-v2c'));
    const s = app.scenarios[0];
    s.setupComplete = true;
    Object.assign(s.profile, { age: 65, retireAge: 65, endAge: 75, filing: 'single', spouseOn: false });
    Object.assign(s.assumptions, { method, runs: 50, returnRate: 6, volatility: 15, inflation: 2.5 });
    s.accounts = [{ id: 'a1', name: 'Roth', type: 'rothIRA', taxClass: 'roth', owner: 'self', balance: 5000000, contribution: 0, contributionMode: 'amount',
      priority: 1, basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {},
      matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 }];
    Object.assign(s.retirement, { strategy: 'incomeFirst', spending: 40000, ssBenefit: 0, flexibility: 0 });
    const root = doc.getElementById('investment-calculator-v2c'), input = root.querySelector('#v2-import-settings'), status = root.querySelector('#v2-status');
    const file = new w.File([JSON.stringify({ format: 'investment-calculator-v2c', app })], 'backup.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    status.textContent = '';
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    await waitFor(() => status.textContent !== '', { window: w });
    assert.doesNotMatch(status.textContent, /not restored/, status.textContent);
    root.querySelector('[data-page="results"]').click();
    const perf = doc.getElementById('v2-performance');
    await waitFor(() => /\d\.\d%$/.test(doc.getElementById('v2-stat-success').textContent) && !perf.classList.contains('is-running'), { window: w, timeoutMs: 30000 });
    const card = doc.getElementById('v2-stat-success').closest('.v2-stat'), summary = doc.getElementById('v2-stat-final-spending');
    return { card: card.textContent.replace(/\s+/g, ' '), success: doc.getElementById('v2-stat-success').textContent,
      summary: summary ? summary.textContent : null, summaryShown: !!summary && !summary.hidden };
  } finally {
    w.close();
  }
}
test('R46 rule 3 (MC-E): the app labels the figure "All modeled spending funded", with the note and the final-year summary', async () => {
  const r = await appCard('monteCarlo');
  assert.equal(r.success, '100.0%');
  assert.match(r.card, /All modeled spending funded/);
  assert.doesNotMatch(r.card, /Success probability/);
  assert.match(r.card, /adaptive/i, 'the note on adaptive strategies: ' + r.card);
  assert.equal(r.summaryShown, true);
  assert.match(r.summary, /median \$40,000/);
  assert.match(r.summary, /10th percentile \$40,000/);
  assert.match(r.summary, /today's dollars/);
});
test('R46 rule 3 control: simple mode keeps the label and shows no Monte Carlo summary', async () => {
  const r = await appCard('simple');
  assert.match(r.card, /All modeled spending funded/);
  assert.equal(r.summaryShown, false);
});
