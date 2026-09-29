'use strict';

// Independent dated multi-IRA funding ledger. No source or baseline is changed.
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '../../..'));
const h = require(path.join(ROOT, 'audit/S5AA/R29/S5AA_R29_EXTERNAL_AUDIT_REPRO_20260928.js'));
const engine = require(path.join(ROOT, 'src/engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src/scenario-validator.js'));

function plan(x) {
  const p = h.basisPlan();
  p.assumptions.returnRate = x.sourceRate;
  p.advanced.assetClasses = [
    { id: 'flat', name: 'Source allocation', returnRate: x.sourceRate, volatility: 0 },
    { id: 'second', name: 'Other IRA allocation', returnRate: x.secondRate, volatility: 0 }
  ];
  p.advanced.transferAge = x.at;
  p.accounts.push(h.account('secondIRA', 'traditionalIRA', x.opening,
    { owner: x.owner, allocation: { second: 100 }, priority: 3 }));
  if (x.owner === 'spouse') {
    Object.assign(p.profile, { spouseOn: true, filing: 'mfj', spouseAge: 60, spouseRetireAge: 63 });
    for (const a of p.accounts.filter(a => a.taxClass !== 'taxable')) a.owner = 'spouse';
    for (const i of p.retirement.otherIncomes) i.owner = 'spouse';
  }
  return p;
}

function expected(x) {
  const g = 1 + x.sourceRate / 100, other = 1 + x.secondRate / 100, f = x.at - 61;
  // Both IRAs are valued at the funding instant, even though only one sends money.
  const sourceAtFunding = 8600 * Math.pow(g, 1 + f);
  const secondAtFunding = x.opening * Math.pow(other, 1 + f);
  const pool = sourceAtFunding + secondAtFunding;
  const basisUsed = Math.min(8600, Math.max(0, 5400 - Math.max(0, pool - 8600)));
  const basisLeft = 8600 - basisUsed;
  const sourceAt62 = 8600 * g * g - 5400 * Math.pow(g, 1 - f);
  const iraDraw = (sourceAt62 + 2000) * Math.sqrt(g) + x.opening * Math.pow(other, 2.5);
  const workplaceDraw = 1000 * Math.pow(g, 2.5);
  const agi = 30000 + Math.max(0, iraDraw - basisLeft) + workplaceDraw - 2000;
  const taxable = Math.max(0, agi - (x.owner === 'spouse' ? 32200 : 16100));
  const firstBracket = x.owner === 'spouse' ? 24800 : 12400;
  assert.ok(taxable <= (x.owner === 'spouse' ? 100800 : 50400));
  const taxes = Math.min(taxable, firstBracket) * 0.10
    + Math.max(0, taxable - firstBracket) * 0.12 + taxable * 0.025 + 30000 * 0.0765;
  return { sourceAtFunding, secondAtFunding, pool, basisUsed, basisLeft, iraDraw, workplaceDraw, agi, taxes };
}

const results = [];
for (const sourceRate of [-10, 0, 10]) for (const secondRate of [-20, 0, 20]) {
  for (const opening of [0, 2000, 20000]) for (const at of [61, 61.25, 61.75]) {
    for (const owner of ['self', 'spouse']) {
      const x = { sourceRate, secondRate, opening, at, owner }, p = plan(x);
      const validation = validateScenario(structuredClone(p));
      assert.equal(validation.valid, true, JSON.stringify(validation.issues));
      const r = engine.runPlan(p);
      assert.equal(r.status, 'ok');
      assert.deepEqual(r.issues.filter(i => i.severity === 'ERROR'), []);
      const e = expected(x), row = r.rows.at(-1);
      const actual = { agi: row.federalAgi, taxes: row.taxes, outstanding: row.taxOutstanding };
      const wrong = ['agi', 'taxes'].filter(k => Math.abs(actual[k] - e[k]) > 0.005);
      if (Math.abs(actual.outstanding) > 0.005) wrong.push('outstanding');
      results.push({ ...x, verdict: wrong.length ? 'MISMATCH' : 'PASS', wrong, expected: e, actual });
    }
  }
}
const failures = results.filter(x => x.verdict === 'MISMATCH');
console.log(JSON.stringify({ plans: results.length, checks: results.length * 3,
  passingPlans: results.length - failures.length, mismatchingPlans: failures.length,
  mismatchingChecks: results.reduce((n, x) => n + x.wrong.length, 0) }));
for (const at of [61, 61.25, 61.75]) for (const secondRate of [-20, 0, 20]) {
  console.log(JSON.stringify(results.find(x => x.sourceRate === 10 && x.opening === 2000
    && x.owner === 'self' && x.at === at && x.secondRate === secondRate)));
}
if (process.argv.includes('--verbose')) for (const x of results) console.log(JSON.stringify(x));
process.exitCode = failures.length ? 1 : 0;
