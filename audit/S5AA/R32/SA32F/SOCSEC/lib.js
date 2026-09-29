'use strict';
// Shared builders for the SOCSEC repros. Every plan: simple mode, 0% returns, 0% inflation unless set,
// no spending, a cash account, no dividends, no pension, no other income -> row.income is Social Security
// (plus whatever the repro adds).
const h = require('../harness.js');

function single({ age = 62, years = 3, ssBenefit = 0, ssClaim = 67, ssFra = 67, ssCola = 0, inflation = 0 } = {}) {
  const p = h.plan({ years });
  p.profile.age = age; p.profile.retireAge = age; p.profile.endAge = age + years;
  p.profile.spouseAge = age;
  p.employment.contributionStop = age + years + 1;
  p.assumptions.inflation = inflation;
  Object.assign(p.retirement, { ssBenefit, ssClaim, ssFra, ssCola, spouseSS: 0, spouseClaim: 67,
    survivor: false, selfLife: 100, spouseLife: 100, ssAdvanced: false, aime: 0 });
  return p;
}

function couple({ age = 66, spouseAge = 67, years = 3, ssBenefit = 0, ssClaim = 67, spouseSS = 0, spouseClaim = 67,
  ssFra = 67, ssCola = 0, survivor = true, selfLife = 100, spouseLife = 100, inflation = 0 } = {}) {
  const p = single({ age, years, ssBenefit, ssClaim, ssFra, ssCola, inflation });
  Object.assign(p.profile, { spouseOn: true, spouseAge, filing: 'mfj' });
  Object.assign(p.retirement, { spouseSS, spouseClaim, survivor, selfLife, spouseLife, survivorSpendingReduction: 0 });
  return p;
}

function run(p) {
  const v = h.validateScenario(structuredClone(p));
  if (v.valid !== true) throw new Error('INVALID: ' + JSON.stringify(v.issues.filter(x => x.severity === 'ERROR')));
  const r = h.engine.runPlan(p);
  if (r.status !== 'ok') throw new Error('STATUS ' + r.status + ' ' + r.calculationErrorCode);
  return r;
}

function rows(r) { return r.rows.map(x => ({ age: x.age, income: +x.income.toFixed(2), agi: +x.federalAgi.toFixed(2) })); }

function report(label, expected, actual) {
  const diff = actual - expected;
  console.log(`${label}\n  hand expectation: ${expected.toFixed(2)}\n  engine:           ${actual.toFixed(2)}\n  difference:       ${diff.toFixed(2)}  ${Math.abs(diff) < 0.01 ? 'MATCH' : 'MISMATCH'}`);
  return Math.abs(diff) >= 0.01;
}

module.exports = { h, single, couple, run, rows, report };
