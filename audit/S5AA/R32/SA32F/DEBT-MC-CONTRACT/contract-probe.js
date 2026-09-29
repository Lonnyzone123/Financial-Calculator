'use strict';
// DMC part (d.4): RESULT_CONTRACT.md / tools/result-contract.json against the fields runPlan()/runScenario() emit.
// Two checks: (1) an independent key-set diff written here from the JSON, (2) the repo's own checker. Run: node contract-probe.js
const path = require('path');
const h = require('../harness.js');
const C = require(path.join(h.TREE, 'tools/result-contract.js'));
const J = C.CONTRACT;
const gd = require(path.join(h.TREE, 'tests/lib/golden-scenario-defs.js'));
const gen = require(path.join(h.TREE, 'tests/lib/scenario-generator.js'));
const plans = [];
gd.GOLDEN_SCENARIOS.forEach(([n, ov]) => { const p = gd.buildScenario(h.defaults, ov); if (p.assumptions.method === 'monteCarlo') p.assumptions.runs = 40; plans.push(['golden:' + n, p]); });
for (let s = 1; s <= 30; s++) { const p = gen.generateScenario(h.defaults, s); if (p.assumptions.method === 'monteCarlo') p.assumptions.runs = 30; plans.push(['seed:' + s, p]); }
const d = h.plan({ years: 5, retireAge: 60 }); d.advanced.transferOn = false; d.retirement.spending = 30000;
d.advanced.debts = [{ id: 'm', type: 'mortgage', name: 'M', owner: 'household', balance: 200000, rate: 6, rateType: 'fixed', paymentMonthly: 1500, payoffAge: 62.5, includePayment: true, includeHousingCosts: true, annualPropertyTax: 2000, pmiMonthly: 80 }];
plans.push(['debt:simple', d]);
const dm = structuredClone(d); dm.assumptions.method = 'monteCarlo'; dm.assumptions.runs = 40; dm.assumptions.volatility = 15; dm.advanced.assetsOn = false; plans.push(['debt:mc', dm]);
const dh = structuredClone(d); dh.assumptions.method = 'historical'; dh.assumptions.historyStart = 2000; plans.push(['debt:hist', dh]);
const bad = structuredClone(d); bad.profile.filing = 'married'; plans.push(['invalid:filing', bad]);
const badmc = structuredClone(dm); badmc.profile.filing = 'married'; plans.push(['invalid:filing-mc', badmc]);

const keysOf = o => Object.keys(o).sort();
const summary = { plans: 0, outcomes: {}, checkerViolations: [], unspecifiedTop: {}, missingTop: {}, rowExtra: {}, rowMissing: {} };
for (const [name, p] of plans) {
  const r = h.engine.runScenario(structuredClone(p));
  summary.plans++;
  const outcome = C.outcomeOf(r); summary.outcomes[outcome] = (summary.outcomes[outcome] || 0) + 1;
  // (1) independent top-level diff
  const top = J.topLevel[outcome], opt = J.topLevel.optional;
  keysOf(r).forEach(k => { if (!(k in top) && !(k in opt)) (summary.unspecifiedTop[k] = summary.unspecifiedTop[k] || []).push(name); });
  Object.keys(top).forEach(k => { if (!(k in r)) (summary.missingTop[k] = summary.missingTop[k] || []).push(name); });
  // row keys
  if (Array.isArray(r.rows)) {
    const mc = r.mode === 'monteCarlo';
    const allowed = mc ? new Set([...J.rowFields.monteCarlo.fields, ...Object.keys(J.rowFields.monteCarlo.extra)])
      : new Set(Object.keys(J.rowFields.perPath));
    r.rows.forEach((row, i) => {
      keysOf(row).forEach(k => { if (!allowed.has(k)) { const t = (mc ? 'mc:' : 'pp:') + k; (summary.rowExtra[t] = summary.rowExtra[t] || new Set()).add(name); } });
      allowed.forEach(k => {
        const spec = !mc && J.rowFields.perPath[k];
        const opening = i === 0;
        if (spec && spec.rowKinds && spec.rowKinds.includes('ordinary') && opening) return; // ordinary-only fields
        if (!(k in row)) { const t = (mc ? 'mc:' : 'pp:') + k + (opening ? '@opening' : ''); (summary.rowMissing[t] = summary.rowMissing[t] || new Set()).add(name); }
      });
    });
  }
  // (2) the repo's checker
  const res = C.checkResult(r, { plan: p });
  if (res.violations.length || res.unspecified.length) summary.checkerViolations.push({ name, violations: res.violations.slice(0, 5), unspecified: res.unspecified });
}
const setToArr = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...v]]));
summary.rowExtra = setToArr(summary.rowExtra); summary.rowMissing = setToArr(summary.rowMissing);
console.log(JSON.stringify(summary, null, 1));
console.log('CONTRACT-PROBE DONE: plans=' + summary.plans + ' checkerFlagged=' + summary.checkerViolations.length +
  ' unspecifiedTop=' + Object.keys(summary.unspecifiedTop).length + ' missingTop=' + Object.keys(summary.missingTop).length +
  ' rowExtra=' + Object.keys(summary.rowExtra).length + ' rowMissing=' + Object.keys(summary.rowMissing).length);
