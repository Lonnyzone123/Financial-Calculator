'use strict';

// Shared scenario definitions for Track B's L6 regression layer -- used by
// both tests/generate-golden-scenarios.js (the generator) and
// tests/golden-scenarios.test.js (the consumer), so the two can never
// silently drift apart into testing different plans than were fixtured.

function braceExtract(src, marker) {
  const i = src.indexOf(marker);
  let j = src.indexOf('{', i), depth = 0, inStr = null;
  for (let k = j; k < src.length; k++) {
    const c = src[k];
    if (inStr) { if (c === '\\') { k++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(j, k + 1); }
  }
  throw new Error('braceExtract: unbalanced braces');
}

/* The app's default plan, as the tests build on it. The tests keep their own starting ages: the app's default became 30
   on 2026-09-28 (the public copy), and the golden fixtures, the stored control and every capture were built at 29.5,
   so they stay there, apart from the app. Every other field is the app's own -- except the filing status, below. */
const TEST_STARTING_AGE = 29.5;
/* The same for the filing status. The app's default became single at S5AA R38 (the owner 2026-09-29: a new plan has no spouse), and every
   corpus plan, golden fixture, stored control, capture and test built on this plan was written on the joint return it filed before -- the
   married pairs included, which never set it themselves. They keep it, apart from the app. */
const TEST_FILING = 'mfj';
function extractDefaultPlan(shellHtml) {
  const plan = eval('(' + braceExtract(shellHtml, 'var defaultPlan=') + ')');
  plan.profile.age = TEST_STARTING_AGE;
  plan.profile.spouseAge = TEST_STARTING_AGE;
  plan.profile.filing = TEST_FILING;
  return plan;
}

function basePlan(defaultPlan) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.id = 'golden-fixture';
  p.accounts = [
    { id: 'a1', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 250000, contribution: 12000, contributionMode: 'amount', priority: 1, basisPct: 70, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 },
    { id: 'a2', name: '401k', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 400000, contribution: 15000, contributionMode: 'amount', priority: 2, basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: true, matchCap: 5, matchRate: 100, profitShare: 0, vesting: 100 },
    { id: 'a3', name: 'Roth IRA', type: 'rothIRA', taxClass: 'roth', owner: 'self', balance: 90000, contribution: 7000, contributionMode: 'amount', priority: 3, basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 },
  ];
  p.employment.salary = 145000;
  return p;
}

function buildScenario(defaultPlan, overrides = {}) {
  const p = basePlan(defaultPlan);
  Object.assign(p.assumptions, overrides.assumptions || {});
  Object.assign(p.retirement, overrides.retirement || {});
  Object.assign(p.advanced, overrides.advanced || {});
  Object.assign(p.profile, overrides.profile || {});
  /* S3 task 1: `employment` was the one section this could not override, so
     basePlan's salary of 145,000 reached every generated scenario unchanged --
     one of the two causes behind Q17's blind fields, and a different fix from
     a missing range. No GOLDEN scenario passes an employment override, so the
     locked fixture is unaffected by this line existing. */
  Object.assign(p.employment, overrides.employment || {});
  return p;
}

// Five realistic, named scenarios spanning the code paths most likely to be
// disturbed by a careless engine change: the deterministic default,
// Monte Carlo, RMDs + Roth conversions together, the reserve/bond-tent
// glide path, and a non-default withdrawal strategy.
const GOLDEN_SCENARIOS = [
  ['baseline', {}],
  ['monte-carlo-fixed-seed', { assumptions: { method: 'monteCarlo', runs: 500, seed: 123456 } }],
  ['rmd-and-roth-conversion', { advanced: { rmdOn: true, conversionOn: true, conversionAmount: 20000 }, profile: { age: 68, retireAge: 69 } }],
  ['reserve-and-bond-tent', { advanced: { reserveOn: true, reserveYears: 3, bondTentOn: true, bondTent: 40 } }],
  ['guardrails-withdrawal-strategy', { retirement: { strategy: 'guardrails' } }],
];

function round(n) { return Math.round(Number(n) * 100) / 100; }

function pickRow(row) {
  return {
    age: row.age, total: round(row.total), taxable: round(row.taxable), preTax: round(row.preTax),
    roth: round(row.roth), taxes: round(row.taxes), withdrawals: round(row.withdrawals),
    networth: round(row.networth), magi: round(row.magi),
  };
}

function summarize(result) {
  const first = result.rows[0], last = result.rows[result.rows.length - 1];
  const mid = result.rows[Math.floor(result.rows.length / 2)];
  return {
    rowCount: result.rows.length,
    failed: result.failed,
    successRate: round(result.successRate),
    lifetimeTaxes: round(result.lifetimeTaxes),
    lifetimeContributions: round(result.lifetimeContributions),
    firstRow: pickRow(first),
    midRow: pickRow(mid),
    lastRow: pickRow(last),
  };
}

module.exports = { extractDefaultPlan, buildScenario, GOLDEN_SCENARIOS, summarize };
