/* S5AA R49 prediction: which TEST plans are exposed to the R49 engine rules. Loaded with NODE_OPTIONS=--require into each test
   process on the tree BEFORE the R49 edits; it wraps src/engine.js's runPlan and simulatePlan (tests that load an engine variant
   through vm are not seen, and the record says so), re-runs each plan through the tapped variant of r49_corpus_scan.js (same taps,
   same conditions) and appends one JSON line per exposed plan to $R49_EXPOSURE_OUT.
   Conditions (necessary, as r49_corpus_scan.js): flex -- the flexibility cut crosses the strategy's floor in some row (Monte Carlo:
   on some path); working -- some working row's pay is below zero (the result gains WORKING_YEARS_NOT_FUNDED_BY_PAY); ltc --
   advanced.ltcOnsetAge entered; pmi -- a PMI-charging mortgage whose new stop age falls before the plan's end. */
'use strict';
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const OUT = process.env.R49_EXPOSURE_OUT;
const TREE = path.resolve(__dirname, '..', '..', '..', '..');
const ENGINE = path.join(TREE, 'src', 'engine.js').toLowerCase();
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
let V = null;
const T = { path: -1, flex: [], work: [], svc: 0, on: false };
function variant() {
  if (V) return V;
  const { loadEngineVariant } = require(path.join(TREE, 'tests', 'lib', 'engine-variant.js'));
  V = loadEngineVariant([
    { id: 'path', marker: 'function simulatePlanRows(p,random,historyOffset,ltcRandom,issues,serialized,gateToken){', append: 'globalThis.__R49X&&globalThis.__R49X.on&&globalThis.__R49X.path++;' },
    { id: 'flex', marker: 'if(priorReturn<0&&r.flexibility>0){spend*=1-r.flexibility/100}', replace:
      'if(globalThis.__R49X&&globalThis.__R49X.on&&priorReturn<0&&r.flexibility>0){var __fl=(r.strategy==="guardrails"||r.strategy==="guyton"||r.strategy==="floorCeiling")?Math.min(r.floor,r.ceiling)*inflationFactor:r.strategy==="rmd"?(Number(r.rmdFloor)||0)*inflationFactor:r.strategy==="vpw"?balance*Math.min(vpwLow,vpwHigh)/100:null;' +
      'if(__fl!==null&&spend*(1-r.flexibility/100)<Math.min(spend,__fl)-1e-9)globalThis.__R49X.flex.push({path:globalThis.__R49X.path,age:age})}' +
      'if(priorReturn<0&&r.flexibility>0){spend*=1-r.flexibility/100}' },
    { id: 'svc-reset', marker: 'debtFlow=projectDebts(', replace: 'debtFlow=(globalThis.__R49X&&(globalThis.__R49X.svc=0),projectDebts)(' },
    { id: 'svc', marker: 'totalPayments+=paid;', replace: 'if(globalThis.__R49X)globalThis.__R49X.svc+=paid-paidRetired;totalPayments+=paid;' },
    { id: 'work', marker: ',penaltyApplies=age<59.5', replace: ',__r49w=(function(){if(!(globalThis.__R49X&&globalThis.__R49X.on))return 0;var share=wages>0?(wages-payAfterRetirement)/wages:(duration>0?Math.max(0,duration-costRetiredDuration)/duration:0),net=share*(wages-contributions-baseline.total),s=net-globalThis.__R49X.svc;if((wages>0||costRetiredDuration<duration-1e-12)&&s<-.005)globalThis.__R49X.work.push({path:globalThis.__R49X.path,age:age});return 0})(),penaltyApplies=age<59.5' },
  ]);
  return V;
}
function pmiStop(d, start) {
  if (fin(d.pmiEndAge)) return d.pmiEndAge;
  if (d.mortgageType !== 'conventional' || !fin(d.loanTermYears) || !fin(d.remainingTermYears) || !(d.loanTermYears > 0) || d.remainingTermYears < 0 || d.remainingTermYears > d.loanTermYears) return null;
  return start + (Math.floor((d.remainingTermYears - d.loanTermYears / 2) * 12 + 1e-9) + 1) / 12;
}
function check(fn, p) {
  try {
    if (!p || !p.profile || !p.assumptions) return;
    const flags = [], adv = p.advanced || {};
    if (fin(adv.ltcOnsetAge)) flags.push('ltc');
    (Array.isArray(adv.debts) ? adv.debts : []).forEach((d) => {
      if (!(d && d.type === 'mortgage' && d.includeHousingCosts && (Number(d.pmiMonthly) || 0) > 0 && d.balance > 0)) return;
      const s = pmiStop(d, Number(p.profile.age));
      if (s !== null && s < Number(p.profile.endAge)) flags.push('pmi stop ' + s.toFixed(3));
    });
    globalThis.__R49X = T; T.on = true; T.path = -1; T.flex = []; T.work = [];
    try { variant().runPlan(JSON.parse(JSON.stringify(p))); } finally { T.on = false; }
    if (T.flex.length) {
      const paths = [...new Set(T.flex.map((f) => f.path))];
      flags.push(p.assumptions.method === 'monteCarlo' ? 'flex paths ' + paths.length + ' (' + paths.slice(0, 8).join(',') + ')' : 'flex ages ' + [...new Set(T.flex.map((f) => f.age))].join(','));
    }
    const w0 = T.work.filter((w) => w.path === 0);
    if (w0.length) flags.push('working from ' + w0[0].age);
    if (flags.length && OUT) fs.appendFileSync(OUT, JSON.stringify({ file: path.basename(process.argv[1] || ''), fn, method: p.assumptions.method, flags }) + '\n');
  } catch (e) { /* exposure logging never fails a test */ }
}
const load = Module._load;
Module._load = function (request, parent, isMain) {
  const m = load.apply(this, arguments);
  let resolved = '';
  try { resolved = Module._resolveFilename(request, parent, isMain).toLowerCase(); } catch (e) { return m; }
  if (resolved === ENGINE && m && !m.__r49wrapped && typeof m.runPlan === 'function') {
    ['runPlan', 'simulatePlan'].forEach((k) => { const f = m[k]; if (typeof f === 'function') m[k] = function (p) { const r = f.apply(this, arguments); check(k, p); return r; }; });
    /* A direct call of strategySpending() (unit tests) is replayed through the variant with the flex tap on. */
    const ss = m.strategySpending;
    if (typeof ss === 'function') m.strategySpending = function () {
      const r = ss.apply(this, arguments);
      try {
        globalThis.__R49X = T; T.on = true; T.flex = [];
        const args = JSON.parse(JSON.stringify(Array.prototype.slice.call(arguments).map((a) => (a === undefined ? null : a))));
        Array.prototype.forEach.call(arguments, (a, i) => { if (a === undefined) args[i] = undefined; });
        try { variant().strategySpending.apply(null, args); } finally { T.on = false; }
        if (T.flex.length && OUT) fs.appendFileSync(OUT, JSON.stringify({ file: path.basename(process.argv[1] || ''), fn: 'strategySpending', strategy: arguments[0] && arguments[0].retirement && arguments[0].retirement.strategy, flags: ['flex direct'] }) + String.fromCharCode(10));
      } catch (e) { /* never fails a test */ }
      return r;
    };
    Object.defineProperty(m, '__r49wrapped', { value: true });
  }
  return m;
};
