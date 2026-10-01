'use strict';
// R42F FLOWS: split invariance. In simple mode with no reserve (Q66, declared) and no contributions, splitting every account into two
// identical halves (same type, owner, basis %, allocation, priority) is a purely administrative change: every household figure
// must be unchanged. Any difference is per-account logic that is not linear in the balance.
// Usage: node grid4-split.js [count] [seed]
const path = require('path');
const GDIR = (require('path').join(__dirname, '..', '..', '..', '..', '..') + "/audit/S5AA/R40/S5AA_R40_CONSERVATION_GRID");
const L = require(path.join(GDIR, 'lib.js'));
const saved = process.argv.slice(2);
process.argv.length = 2; process.argv.push(String(saved[0] || 300), String(Number(saved[1] || 4401)));
const { genPlan } = require(path.join(GDIR, 'grid.js'));
const N = Number(saved[0] || 300);
const E = L.h.engine;
const FIELDS = ['total', 'taxable', 'preTax', 'roth', 'hsa', 'income', 'spending', 'withdrawals', 'dividends', 'taxes', 'shortfall', 'rmd', 'rmdDistributed', 'nonPortfolioDraw'];
const st = { compared: 0, invalid: 0, notOk: 0, diffs: [], maxRel: 0 };
for (let k = 0; k < N; k++) {
  const p = genPlan(k);
  p.employment.salary = 0; p.employment.spouseSalary = 0; p.profile.retireAge = p.profile.age; p.employment.contributionStop = p.profile.age;
  p.accounts.forEach(a => { a.contribution = 0; });
  p.advanced.transferOn = false; p.advanced.reserveOn = false;
  if (process.env.SPENDALL) { p.advanced.surplusPolicy = 'spend'; p.advanced.surplusPolicyBySource = { rmd: 'spend', pension: 'spend', socialSecurity: 'spend', otherIncome: 'spend', dividends: 'spend' }; }
  if (process.env.NOTAXABLE) { p.accounts = p.accounts.filter(a => a.taxClass !== 'taxable'); if (!p.accounts.length) continue; }
  const q = structuredClone(p);
  q.accounts = [];
  p.accounts.forEach(a => { const b1 = structuredClone(a), b2 = structuredClone(a); b1.balance = a.balance / 2; b2.balance = a.balance / 2; b2.id = a.id + '_2'; b2.name = a.name + ' 2'; q.accounts.push(b1, b2); });
  const v1 = L.h.validateScenario(structuredClone(p)), v2 = L.h.validateScenario(structuredClone(q));
  if (!v1.valid || !v2.valid) { st.invalid++; continue; }
  const r1 = E.runPlan(structuredClone(p)), r2 = E.runPlan(structuredClone(q));
  if (r1.status !== 'ok' || r2.status !== 'ok') { st.notOk++; if (r1.status !== r2.status) st.diffs.push({ k, status: [r1.status, r2.status, r1.calculationErrorCode, r2.calculationErrorCode] }); continue; }
  st.compared++;
  let worst = null;
  r1.rows.forEach((x, i) => { const y = r2.rows[i]; if (!y) { worst = worst || { k, missingRow: i }; return; }
    FIELDS.forEach(f => { const d = Math.abs(x[f] - y[f]); const rel = d / Math.max(1, Math.abs(x[f])); if (d > 0.01 && (!worst || d > worst.d)) worst = { k, age: x.age, f, a: x[f], b: y[f], d }; if (rel > st.maxRel) st.maxRel = rel; }); });
  if (r1.rows.length !== r2.rows.length) worst = { k, rows: [r1.rows.length, r2.rows.length] };
  if (worst) st.diffs.push(worst);
}
console.log(JSON.stringify({ N, compared: st.compared, invalid: st.invalid, notOk: st.notOk, diffCount: st.diffs.length, maxRel: st.maxRel, first: st.diffs.slice(0, 25) }, null, 1));
