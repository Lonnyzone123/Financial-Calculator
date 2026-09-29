'use strict';

// Independent acceptance probes. No source, registered test or baseline is written.
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '../../..'));
const h = require(path.join(ROOT, 'audit/S5AA/R29/S5AA_R29_EXTERNAL_AUDIT_REPRO_20260928.js'));
const engine = require(path.join(ROOT, 'src/engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src/scenario-validator.js'));
const results = [];
const workerCases = [];
let runs = 0;

function run(p) {
  const v = validateScenario(structuredClone(p));
  assert.equal(v.valid, true, JSON.stringify(v.issues.filter(i => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  runs++;
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  assert.deepEqual(r.issues.filter(i => i.severity === 'ERROR'), []);
  return r;
}
function check(label, group, actual, expected) {
  const wrong = Object.keys(expected).filter(k => !Number.isFinite(actual[k]) || Math.abs(actual[k] - expected[k]) > 0.005);
  results.push({ label, group, wrong, actual, expected });
}

// 408(d)(3)(A)(ii) and (H): roll taxable value first, aggregate only this owner's IRAs.
function rollover(x) {
  const p = h.basisPlan();
  p.assumptions.returnRate = x.sourceRate;
  p.advanced.assetClasses = [
    { id: 'flat', name: 'Source', returnRate: x.sourceRate, volatility: 0 },
    { id: 'second', name: 'Other IRA', returnRate: x.secondRate, volatility: 0 }
  ];
  Object.assign(p.advanced, { transferTo: 'work', transferAmount: 8600, transferAge: x.at });
  p.accounts.push(h.account('secondIRA', 'traditionalIRA', x.opening,
    { owner: x.owner, allocation: { second: 100 }, priority: 3 }));
  if (x.owner === 'spouse') {
    Object.assign(p.profile, { spouseOn: true, filing: 'mfj', spouseAge: 60, spouseRetireAge: 63, spouseEndAge: 63 });
    for (const a of p.accounts.filter(a => a.taxClass !== 'taxable')) a.owner = 'spouse';
    for (const i of p.retirement.otherIncomes) i.owner = 'spouse';
  }
  return p;
}
function rolloverLedger(x) {
  const g = 1 + x.sourceRate / 100, o = 1 + x.secondRate / 100, f = x.at - 61;
  const source = 8600 * g ** (1 + f), pool = source + x.opening * o ** (1 + f);
  const moved = Math.min(8600, Math.max(0, pool - 8600), source);
  const ira = (8600 * g ** 2 - moved * g ** (1 - f) + 2000) * Math.sqrt(g) + x.opening * o ** 2.5;
  const work = 1000 * g ** 2.5 + moved * g ** (1.5 - f);
  return { agi: 30000 + Math.max(0, ira - 8600) + work - 2000, outstanding: 0 };
}
for (const sourceRate of [-10, 0, 10]) for (const secondRate of [-20, 0, 20]) {
  for (const opening of [0, 2000, 20000]) for (const at of [61, 61.25, 61.75]) {
    for (const owner of ['self', 'spouse']) {
      const x = { sourceRate, secondRate, opening, at, owner }, p = rollover(x), row = run(p).rows.at(-1);
      check(JSON.stringify(x), 'rollover', { agi: row.federalAgi, outstanding: row.taxOutstanding }, rolloverLedger(x));
      if (sourceRate === 10 && secondRate === 20 && opening === 2000 && at === 61.25) workerCases.push(p);
    }
  }
}

// A large other-owner IRA must not turn the source owner's all-basis IRA into rollable money.
for (const owner of ['self', 'spouse']) for (const at of [61, 61.25, 61.75]) {
  const p = rollover({ sourceRate: 0, secondRate: 0, opening: 0, at, owner });
  const second = p.accounts.find(a => a.id === 'secondIRA');
  second.owner = owner === 'self' ? 'spouse' : 'self';
  second.balance = 100000;
  Object.assign(p.profile, { spouseOn: true, filing: 'mfj', spouseAge: 60, spouseRetireAge: 63, spouseEndAge: 63 });
  p.retirement.expenses = [];
  p.accounts[1].futureChanges[1].value = 0;
  const r = run(p), control = structuredClone(p);
  control.advanced.transferOn = false;
  const c = run(control);
  check(owner + ' other-owner exclusion ' + at, 'owner-pool',
    { preTax: r.rows[2].preTax, networth: r.rows[2].networth },
    { preTax: c.rows[2].preTax, networth: c.rows[2].networth });
  assert.ok(r.limitWarnings.some(w => /taxable/.test(w) && /401\(k\)/.test(w)));
}

const CLASSES = { traditionalIRA: 'preTax', rothIRA: 'roth', traditional401k: 'preTax', roth401k: 'roth', hsa: 'hsa' };
function limit(type, close, joint) {
  if (type === 'hsa') return (joint ? 8750 : 4400) + (close >= 55 ? 1000 : 0);
  if (type.includes('401k')) return 24500 + (close >= 60 && close < 64 ? 11250 : close >= 50 ? 8000 : 0);
  return 7500 + (close >= 50 ? 1100 : 0);
}
function contribution(type, opening, closing, owner, once) {
  const p = h.plan({ from: 'taxable', to: 'rothIRA', balance: 10000, amount: 40000, at: opening + 0.1 });
  const joint = owner === 'spouse';
  Object.assign(p.profile, { age: opening, retireAge: closing, endAge: closing,
    spouseOn: joint, filing: joint ? 'mfj' : 'single', spouseAge: opening, spouseRetireAge: closing, spouseEndAge: closing });
  Object.assign(p.employment, { salary: joint ? 0 : 60000, spouseSalary: joint ? 60000 : 0, contributionStop: closing + 1 });
  p.retirement.dividendOn = false;
  p.retirement.dividendStart = opening;
  p.accounts[2] = h.account('dst', 'taxable', 0, { type, taxClass: CLASSES[type], owner,
    contribution: once ? 0 : 40000, priorYearFicaWages: 60000 });
  p.advanced.transferOn = once;
  return p;
}
for (const type of Object.keys(CLASSES)) for (const owner of ['self', 'spouse']) {
  for (const [opening, closing] of [[49.25, 49.75], [49.5, 50], [54.5, 55], [59.5, 60], [63.5, 64], [64.5, 65]]) {
    const p = contribution(type, opening, closing, owner, false), r = run(p);
    const expected = limit(type, closing, owner === 'spouse') * (closing - opening);
    check(type + ' ' + owner + ' ' + opening + ' -> ' + closing, 'partial-planned',
      { sheltered: r.rows.at(-1)[CLASSES[type]] }, { sheltered: expected });
    if (owner === 'spouse' && type === 'traditional401k' && opening === 63.5) workerCases.push(p);
  }
}
for (const type of ['traditionalIRA', 'rothIRA', 'hsa']) for (const owner of ['self', 'spouse']) {
  for (const [opening, closing] of [[49.25, 49.75], [49.5, 50], [54.25, 54.75], [54.5, 55]]) {
    const p = contribution(type, opening, closing, owner, true), r = run(p);
    // One-time dollars are not prorated; the source has $10,000 and compensation is sufficient.
    const expected = Math.min(10000, limit(type, closing, owner === 'spouse'));
    check(type + ' ' + owner + ' one-time ' + opening + ' -> ' + closing, 'partial-once',
      { sheltered: r.rows.at(-1)[CLASSES[type]] }, { sheltered: expected });
    if (type === 'hsa' && owner === 'self' && opening === 54.5) workerCases.push(p);
  }
}

// Verify the disclosed funding-first annual basis convention with an earlier ordinary draw or conversion.
// This is a model-ordering check, not qualification of every chronological Form 8606 permutation.
for (const secondRate of [-20, 0, 20]) for (const flow of ['draw', 'conversion']) {
  const p = h.basisPlan(), g = 1.1, o = 1 + secondRate / 100, flowDate = flow === 'draw' ? 0.5 : 0;
  p.assumptions.returnRate = 10;
  p.advanced.assetClasses = [{ id: 'flat', name: 'Source', returnRate: 10, volatility: 0 },
    { id: 'second', name: 'Second', returnRate: secondRate, volatility: 0 }];
  p.accounts.push(h.account('secondIRA', 'traditionalIRA', 2000, { allocation: { second: 100 }, priority: 3 }));
  p.advanced.transferAge = 61.75;
  if (flow === 'draw') p.retirement.expenses.unshift({ name: 'Earlier draw', age: 61, amount: 1000 });
  else {
    p.profile.retireAge = 61;
    p.accounts.push(h.account('roth', 'rothIRA', 0));
    Object.assign(p.advanced, { conversionOn: true, conversionAmount: 1000 });
  }
  const fundingPool = 8600 * g ** 1.75 - 1000 * g ** (0.75 - flowDate) + 2000 * o ** 1.75;
  const basisLeft = 8600 - Math.min(8600, Math.max(0, 5400 - Math.max(0, fundingPool + 1000 - 8600)));
  const iraEnd = 8600 * g ** 2 - 1000 * g ** (1 - flowDate) - 5400 * g ** 0.25 + 2000 * o ** 2;
  const fraction = Math.min(1, basisLeft / (iraEnd + 1000));
  const row = run(p).rows[2];
  check(flow + ' before funding, second ' + secondRate, 'funding-with-flow',
    { agi: row.federalAgi, preTax: row.preTax, roth: row.roth, hsa: row.hsa },
    { agi: 1000 * (1 - fraction), preTax: iraEnd + 1000 * g ** 2,
      roth: flow === 'conversion' ? 1000 * g : 0, hsa: 5400 * g ** 0.25 });
  if (flow === 'conversion' && secondRate === 20) workerCases.push(p);
}

for (const [from, to, cross] of [['rothIRA', 'roth401k', false], ['traditionalIRA', 'traditionalIRA', true]]) {
  const p = h.plan({ from: 'taxable', to: 'taxable', balance: 10000, amount: 10000, at: 60.75 });
  const cls = from === 'rothIRA' ? 'roth' : 'preTax';
  p.accounts[1] = h.account('src', 'taxable', 10000, { type: from, taxClass: cls });
  p.accounts[2] = h.account('dst', 'taxable', 0, { type: to, taxClass: cls, owner: cross ? 'spouse' : 'self' });
  Object.assign(p.profile, { spouseOn: cross, filing: cross ? 'mfj' : 'single', spouseAge: 60, spouseRetireAge: 60 });
  p.advanced.assetClasses.push({ id: 'growing', name: 'Destination', returnRate: 10, volatility: 0 });
  p.accounts[2].allocation = { growing: 100 };
  assert.equal(validateScenario(structuredClone(p)).valid, false);
  const r = engine.runPlan(p);
  runs++;
  assert.equal(r.status, 'ok');
  check(from + ' -> ' + to + ' owner guard', 'refusal', { sheltered: r.rows[1][cls] }, { sheltered: 10000 });
  assert.ok(r.issues.some(i => /REFUSED$/.test(i.code)));
  workerCases.push(p);
}

async function main() {
  const w = require(path.join(ROOT, 'tests/lib/worker-source.js'));
  try {
    const source = await w.liveWorkerSource();
    for (const p of workerCases) {
      const msg = w.postToWorker(source, p);
      assert.equal(msg.error, undefined);
      const node = engine.runScenario(structuredClone(p)), worker = msg.result;
      delete node.identity.runId;
      delete worker.identity.runId;
      const cap = require(path.join(ROOT, 'tools/capture-baseline.js'));
      assert.equal(cap.hashOf(cap.canonical(worker)), cap.hashOf(cap.canonical(node)), 'Worker parity');
    }
  } finally {
    w.cleanup();
  }
  const groups = {};
  for (const r of results) {
    const g = groups[r.group] || (groups[r.group] = { comparisons: 0, assertions: 0, mismatches: 0 });
    g.comparisons++;
    g.assertions += Object.keys(r.expected).length;
    g.mismatches += r.wrong.length;
  }
  const failures = results.filter(r => r.wrong.length);
  console.log(JSON.stringify({ runPlanCalls: runs, groups, workerCases: workerCases.length, mismatchingCases: failures.length }));
  for (const r of failures) console.log(JSON.stringify(r));
  process.exitCode = failures.length ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
