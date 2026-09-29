'use strict';
// DMC part (d), dynamic: build the Worker source with the app's OWN buildWorkerSource() text (evaluated in a vm next to
// the built debt factory and engine body, as the app's IIFE scope holds them), then run plans through the Worker's
// self.onmessage in an isolated vm with nothing else in scope, and compare against the main-thread runScenario().
// Run: node --expose-internals worker-dynamic.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const acorn = require('internal/deps/acorn/acorn/dist/acorn');
const h = require('../harness.js');
const TREE = h.TREE;
const { build } = require(path.join(TREE, 'build.js'));
const log = console.log; console.log = () => {};
const built = build(path.join(require('os').tmpdir(), 'sa32f-built-app.html'));
console.log = log;
const main = [...built.output.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('buildWorkerSource'));
const ast = acorn.parse(main, { ecmaVersion: 'latest' });
let bws = null;
(function f(n) { if (bws || !n || typeof n !== 'object') return; if (n.type === 'FunctionDeclaration' && n.id.name === 'buildWorkerSource') { bws = n; return; }
  for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(f); else if (v && typeof v.type === 'string') f(v); } })(ast);
const bwsSrc = main.slice(bws.start, bws.end);

// Context A: the main thread's scope (RULES + debt factory + engine body + the app's buildWorkerSource)
const A = { console, Intl };
vm.createContext(A);
A.RULES = JSON.parse(JSON.stringify(h.RULES));
vm.runInContext('"use strict";\n' + built.debtModulesBlock + '\n' + built.engineBody + '\n' + bwsSrc + '\nvar __WORKER_SOURCE__=buildWorkerSource();', A);
const workerSource = A.__WORKER_SOURCE__;
fs.writeFileSync(path.join(require('os').tmpdir(), 'sa32f-worker-source.generated.js'), workerSource);

function viaWorker(plan) {
  const S = { self: {}, console, Intl };
  vm.createContext(S);
  vm.runInContext(workerSource, S);
  let got = null; S.self.postMessage = m => { got = m; };
  S.self.onmessage({ data: { id: 1, plan: structuredClone(plan) } });
  return got;
}
function strip(r) { const c = JSON.parse(JSON.stringify(r)); if (c.identity) delete c.identity.runId; return c; }

// Plans: golden scenarios, generated corpus scenarios, and debt/MC plans from this area
const gd = require(path.join(TREE, 'tests/lib/golden-scenario-defs.js'));
const gen = require(path.join(TREE, 'tests/lib/scenario-generator.js'));
const plans = [];
gd.GOLDEN_SCENARIOS.forEach(([name, ov]) => { const p = gd.buildScenario(h.defaults, ov); if (p.assumptions.method === 'monteCarlo') p.assumptions.runs = Math.min(p.assumptions.runs, 50); plans.push(['golden:' + name, p]); });
for (let s = 1; s <= 40; s++) { const p = gen.generateScenario(h.defaults, s); if (p.assumptions.method === 'monteCarlo') p.assumptions.runs = Math.min(p.assumptions.runs, 30); plans.push(['seed:' + s, p]); }
const debtPlan = h.plan({ years: 20, retireAge: 60 }); debtPlan.advanced.transferOn = false; debtPlan.retirement.spending = 30000;
debtPlan.accounts = [h.account('brk', 'taxable', 900000), h.account('ira', 'traditionalIRA', 300000)];
debtPlan.advanced.debts = [
  { id: 'm', type: 'mortgage', name: 'M', owner: 'household', balance: 300000, rate: 4, rateType: 'adjustable', nextRateResetAge: 63.5, resetRate: 8, paymentMonthly: 1432.25, payoffAge: 88, includePayment: true, includeHousingCosts: true, annualPropertyTax: 3000, annualInsurance: 1200, hoaMonthly: 50, pmiMonthly: 90, extraPrincipalMonthly: 100 },
  { id: 'c', type: 'creditCard', name: 'C', owner: 'household', balance: 8000, rate: 22, rateType: 'fixed', paymentMonthly: 0, payoffAge: 99, includePayment: true }];
plans.push(['debt:simple', debtPlan]);
const mc = structuredClone(debtPlan); mc.assumptions.method = 'monteCarlo'; mc.assumptions.runs = 60; mc.assumptions.seed = 7; mc.assumptions.returnRate = 7; mc.assumptions.volatility = 15; mc.advanced.assetsOn = false; plans.push(['debt:monteCarlo', mc]);
const hist = structuredClone(debtPlan); hist.assumptions.method = 'historical'; hist.assumptions.historyStart = 1966; plans.push(['debt:historical', hist]);

let same = 0, differ = [], workerErrors = [];
for (const [name, p] of plans) {
  const w = viaWorker(p);
  if (w.error) { workerErrors.push({ name, error: w.error.split('\n')[0] }); continue; }
  const m = A.runScenario(structuredClone(p));
  const a = JSON.stringify(strip(m)), b = JSON.stringify(strip(w.result));
  if (a === b) same++; else differ.push(name);
}
console.log(JSON.stringify({ workerSourceChars: workerSource.length, plans: plans.length, identical: same, differ, workerErrors }, null, 1));
console.log('WORKER-DYNAMIC DONE: plans=' + plans.length + ' identical=' + same + ' differ=' + differ.length + ' workerErrors=' + workerErrors.length);
// Main thread in the app holds RULES deep-frozen (app-shell: RULES=deepFreeze(JSON.parse(...))), Node and the Worker do not.
// Any engine write to RULES would throw only on the app's main thread (the Worker fallback path). Check with a frozen copy.
const F = { console, Intl };
vm.createContext(F);
F.RULES = (function deepFreeze(o) { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); })(JSON.parse(JSON.stringify(h.RULES)));
vm.runInContext('"use strict";\n' + built.debtModulesBlock + '\n' + built.engineBody, F);
let frozenSame = 0, frozenErr = [];
for (const [name, p] of plans) {
  let r; try { r = F.runScenario(structuredClone(p)); } catch (e) { frozenErr.push({ name, error: String(e).split('\n')[0] }); continue; }
  if (JSON.stringify(strip(r)) === JSON.stringify(strip(A.runScenario(structuredClone(p))))) frozenSame++; else frozenErr.push({ name, error: 'differs' });
}
console.log('FROZEN-RULES MAIN THREAD: plans=' + plans.length + ' identical=' + frozenSame + ' problems=' + JSON.stringify(frozenErr));
