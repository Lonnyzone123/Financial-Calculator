/* S5AA R49 prediction: which TEST plans meet the conditions of R49's four new validator WARNINGs. Loaded with NODE_OPTIONS=--require
   into each test process on the tree BEFORE the R49 edits; it wraps src/scenario-validator.js's validateScenario (the app's own
   validator run inside jsdom is not seen, and the record lists those tests by hand) and appends one JSON line per flagged plan to
   $R49_VEXPOSURE_OUT. The conditions are the owner's rules as R49 will write them:
   - SPENDING_STAGES_OVERLAP: two percent stages whose active spans [start, end + 1) intersect;
   - FLEXIBILITY_WITH_GUARDRAILS: strategy guardrails or guyton with flexibility > 0;
   - DEBT_PAYOFF_RESIDUAL: a debt with a balance whose scheduled payments (the engine's monthly loop: entered payment plus extra
     principal; a card's revolving minimum as a floor; an adjustable rate recast at its reset, which clears it) leave $0.50 or more
     at a payoff age at or before the plan's end;
   - INSURANCE_AFTER_INSURED_DEATH: net worth on, insurance > 0, the primary's lifespan at or before the starting age. */
'use strict';
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const OUT = process.env.R49_VEXPOSURE_OUT;
const TREE = path.resolve(__dirname, '..', '..', '..', '..');
const VALIDATOR = path.join(TREE, 'src', 'scenario-validator.js').toLowerCase();
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const nonNeg = (v, d) => (fin(v) && v >= 0 ? v : d);
function residual(d, start, end) {
  if (!d || !fin(d.balance) || !(d.balance > 0) || !fin(d.payoffAge)) return 0;
  const firstRowEnd = Math.min(Math.floor(start + 1e-9) + 1, end);
  const months = Math.max(0, Math.round(((d.payoffAge > start ? d.payoffAge : firstRowEnd) - start) * 12));
  const resetMonth = d.rateType === 'adjustable' && fin(d.nextRateResetAge) && d.nextRateResetAge < d.payoffAge ? Math.round((d.nextRateResetAge - start) * 12) : Infinity;
  const r = Math.max(0, fin(d.rate) ? d.rate : 0) / 1200, pay = Math.max(0, fin(d.paymentMonthly) ? d.paymentMonthly : 0), extra = Math.max(0, fin(d.extraPrincipalMonthly) ? d.extraPrincipalMonthly : 0);
  let bal = d.balance;
  for (let m = 0; m < months && bal > 1e-9; m++) {
    if (m >= resetMonth) return 0;
    const interest = bal * r;
    let base = pay;
    if (d.type === 'creditCard') base = Math.max(base, Math.min(Math.max(bal * nonNeg(d.minimumPercentOfBalance, 2) / 100, nonNeg(d.minimumDollarFloor, 25)), bal + interest));
    bal = Math.max(0, bal + interest - Math.min(base + extra, bal + interest));
  }
  return bal;
}
function check(p) {
  try {
    if (!p || typeof p !== 'object') return;
    const flags = [], r = p.retirement || {}, a = p.advanced || {}, pr = p.profile || {};
    const st = (Array.isArray(r.stages) ? r.stages : []).filter((s) => s && s.mode === 'percent' && fin(s.start) && fin(s.end));
    for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) if (st[i].start < st[j].end + 1 && st[j].start < st[i].end + 1) flags.push('stages overlap');
    if ((r.strategy === 'guardrails' || r.strategy === 'guyton') && fin(r.flexibility) && r.flexibility > 0) flags.push('flex with guardrails');
    (Array.isArray(a.debts) ? a.debts : []).forEach((d, i) => {
      if (fin(pr.age) && fin(pr.endAge) && d && fin(d.payoffAge) && d.payoffAge <= pr.endAge) { const x = residual(d, pr.age, pr.endAge); if (x >= 0.5) flags.push('residual debts[' + i + '] ' + x.toFixed(2)); }
    });
    if (a.networthOn === true && fin(a.insurance) && a.insurance > 0 && fin(r.selfLife) && fin(pr.age) && r.selfLife <= pr.age) flags.push('insurance after death');
    if (flags.length && OUT) fs.appendFileSync(OUT, JSON.stringify({ file: path.basename(process.argv[1] || ''), flags: [...new Set(flags)] }) + String.fromCharCode(10));
  } catch (e) { /* never fails a test */ }
}
const load = Module._load;
Module._load = function (request, parent, isMain) {
  const m = load.apply(this, arguments);
  let resolved = '';
  try { resolved = Module._resolveFilename(request, parent, isMain).toLowerCase(); } catch (e) { return m; }
  if (resolved === VALIDATOR && m && !m.__r49wrapped && typeof m.validateScenario === 'function') {
    const f = m.validateScenario;
    m.validateScenario = function (p) { check(p); return f.apply(this, arguments); };
    Object.defineProperty(m, '__r49wrapped', { value: true });
  }
  return m;
};
