/* S5AA R50 prediction: which TEST plans are exposed to the R50 rules. Loaded with NODE_OPTIONS=--require into each test process
   on the tree BEFORE the R50 edits; it wraps src/engine.js's runPlan (and, by inputs only, simulatePlan) and appends one JSON line
   per exposed plan to $R50_EXPOSURE_OUT. Tests that load an engine variant through vm, or build the app's Worker, are not seen,
   and the record says so.
   - runPlan(p): the same plan is replayed on a TAPPED in-memory variant of the pre-R50 engine (read-only taps; the rows are compared
     with the test's own call and a mismatch is logged, never thrown), and its Roth draws, Roth IRA inflows, transfers and deaths
     are run through the R50 ledger rules exactly as r50_corpus_scan.js runs them. Exposure:
       figures   a Roth IRA distribution reaches a taxed or penalized segment (the plan's figures move);
       issues    UNSUPPORTED_ROTH_ORDERING is removed (every early Roth draw was a Roth IRA draw), or ROTH_IRA_BASIS_NOT_ENTERED /
                 ROTH_FIVE_YEAR_ASSUMED is added.
   - simulatePlan(p, ...): called with the test's own random generators, which a replay would advance, so it is judged on its
     inputs: a Roth IRA holding money or able to receive it (a contribution, conversions, a transfer) -- a necessary condition. */
'use strict';
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const OUT = process.env.R50_EXPOSURE_OUT;
const TREE = path.resolve(__dirname, '..', '..', '..', '..');
const ENGINE = path.join(TREE, 'src', 'engine.js').toLowerCase();
let variant = null;
function getVariant() {
  if (variant) return variant;
  const { loadEngineVariant } = require(path.join(TREE, 'tests', 'lib', 'engine-variant.js'));
  const T = 'if(globalThis.__R50)globalThis.__R50(';
  variant = loadEngineVariant([
    { id: 'row', marker: 'for(var yi=0;yi<boundaries.length;yi++){', append: T + '{k:"row",yi:yi,age:yi===0?start:boundaries[yi-1]});' },
    { id: 'draw', marker: 'if(taxClass==="roth"&&w>0){var rothOwnerAge=accountOwnerAge(p,age,a);',
      replace: 'if(taxClass==="roth"&&w>0)' + T + '{k:"draw",type:a.type,owner:a.owner==="spouse"?"spouse":"self",ownerAge:accountOwnerAge(p,age,a),w:w});if(taxClass==="roth"&&w>0){var rothOwnerAge=accountOwnerAge(p,age,a);' },
    { id: 'contrib', marker: 'if(target){addTaxableBasis(target,c);', append: 'if(target.type==="rothIRA")' + T + '{k:"contrib",owner:target.owner==="spouse"?"spouse":"self",c:c});' },
    { id: 'conv', marker: 'r.source.balance-=take;r.destination.balance+=take;', append: T + '{k:"conv",type:r.destination.type,owner:r.destination.owner==="spouse"?"spouse":"self",taxable:take-nt,nt:nt});' },
    { id: 'death', marker: 'var carried=Math.max(0,Number(iraBasisState[from])||0);', append: T + '{k:"death",from:from,to:to});' },
    { id: 'xfer', marker: '/* S5AA R23 (R22-01): Roth money moved out to a non-Roth account is a Roth distribution. */',
      append: 'if(f&&t&&transferMoved>0)' + T + '{k:"xfer",fType:f.type,fClass:f.taxClass,tType:t.type,tClass:t.taxClass,fOwner:f.owner==="spouse"?"spouse":"self",tOwner:t.owner==="spouse"?"spouse":"self",moved:transferMoved,taxable:transferTaxable,basis:transferBasis,ownerAge:accountOwnerAge(p,transferOnAge,f)});' },
  ]);
  return variant;
}
const key = (o) => (o === 'spouse' ? 'spouse' : 'self');
function freshLedger(p) {
  const L = {};
  ['self', 'spouse'].forEach((o) => {
    const own = (p.accounts || []).filter((a) => a && a.type === 'rothIRA' && key(a.owner) === o);
    const basis = own.reduce((s, a) => s + Math.max(0, Number(a.contributionBasis) || 0), 0);
    const bal = own.reduce((s, a) => s + Math.max(0, Number(a.balance) || 0), 0);
    L[o] = { basis, conv: [], first: bal > 0 || basis > 0 ? -Infinity : null, firstAssumed: bal > 0 || basis > 0, basisDefault: bal > 0 && !own.some((a) => a.contributionBasis !== undefined) };
  });
  return L;
}
function distribute(L, o, w, age, yi, penEx) {
  const led = L[o], qualified = age >= 59.5 && led.first !== null && yi >= led.first + 5, early = age < 59.5 && !penEx;
  let rest = w, income = 0, penalized = 0;
  const b = Math.min(rest, led.basis); led.basis -= b; rest -= b;
  while (rest > 1e-9 && led.conv.length) {
    const tr = led.conv[0];
    const tx = Math.min(rest, tr.taxable); tr.taxable -= tx; rest -= tx;
    if (!qualified && early && yi < tr.year + 5) penalized += tx;
    const nt = Math.min(rest, tr.nt); tr.nt -= nt; rest -= nt;
    if (tr.taxable <= 1e-9 && tr.nt <= 1e-9) led.conv.shift();
  }
  if (rest > 1e-9 && !qualified) { income += rest; if (early) penalized += rest; }
  return { income, penalized, qualified, earnings: rest > 1e-9 ? rest : 0 };
}
function replay(p, events, issues) {
  const penEx = !!(p.advanced && p.advanced.penaltyException);
  let L = null, yi = 0;
  const flags = new Set(), disclose = new Set();
  let k401 = false, taxed = 0, penalized = 0;
  const note = (o, d, age) => { const led = L[o]; if (!d.qualified && d.earnings > 0 && led.basisDefault) disclose.add('ROTH_IRA_BASIS_NOT_ENTERED'); if (age >= 59.5 && led.firstAssumed && yi < 5) disclose.add('ROTH_FIVE_YEAR_ASSUMED'); };
  for (const e of events) {
    if (e.k === 'row') { if (e.yi === 0) L = freshLedger(p); yi = e.yi; continue; }
    if (!L) continue;
    if (e.k === 'death') { const a = L[e.from], b = L[e.to]; b.basis += a.basis; b.conv = b.conv.concat(a.conv).sort((x, y) => x.year - y.year); b.first = a.first === null ? b.first : b.first === null ? a.first : Math.min(a.first, b.first); b.firstAssumed = b.firstAssumed || a.firstAssumed; b.basisDefault = b.basisDefault || a.basisDefault; L[e.from] = { basis: 0, conv: [], first: null, firstAssumed: false, basisDefault: false }; continue; }
    const inflow = (o) => { if (L[o].first === null) L[o].first = yi; };
    if (e.k === 'contrib') { L[e.owner].basis += e.c; inflow(e.owner); }
    else if (e.k === 'conv' && e.type === 'rothIRA') { L[e.owner].conv.push({ year: yi, taxable: e.taxable, nt: e.nt }); inflow(e.owner); }
    else if (e.k === 'xfer') {
      if (e.tType === 'rothIRA' && e.fClass === 'preTax') { L[e.tOwner].conv.push({ year: yi, taxable: e.taxable, nt: e.basis }); inflow(e.tOwner); }
      else if (e.tType === 'rothIRA' && (e.fClass === 'taxable' || e.fClass === 'hsa')) { L[e.tOwner].basis += e.moved; inflow(e.tOwner); }
      else if (e.tType === 'rothIRA' && e.fClass === 'roth' && e.fType !== 'rothIRA') { if (e.ownerAge >= 59.5) L[e.tOwner].basis += e.moved; inflow(e.tOwner); }
      if (e.fType === 'rothIRA' && e.tClass !== 'roth') { const d = distribute(L, e.fOwner, e.moved, e.ownerAge, yi, penEx); note(e.fOwner, d, e.ownerAge); taxed += d.income; penalized += d.penalized; }
    } else if (e.k === 'draw') {
      if (e.type !== 'rothIRA') { if (e.ownerAge < 59.5) k401 = true; continue; }
      const d = distribute(L, e.owner, e.w, e.ownerAge, yi, penEx); note(e.owner, d, e.ownerAge); taxed += d.income; penalized += d.penalized;
    }
  }
  if (taxed > 0.005 || penalized > 0.005) flags.add('figures: taxed earnings ' + Math.round(taxed) + ', bearing the 10% ' + Math.round(penalized));
  if ((issues || []).some((i) => i && i.code === 'UNSUPPORTED_ROTH_ORDERING') && !k401) flags.add('issues: UNSUPPORTED_ROTH_ORDERING removed');
  disclose.forEach((c) => flags.add('issues: adds ' + c));
  return [...flags];
}
function log(fn, p, flags) {
  if (flags.length && OUT) fs.appendFileSync(OUT, JSON.stringify({ file: path.relative(TREE, process.argv[1] || ''), fn, method: p.assumptions && p.assumptions.method, flags }) + '\n');
}
function checkRun(p, result) {
  try {
    if (!p || !p.profile || !Array.isArray(p.accounts)) return;
    if (!p.accounts.some((a) => a && a.type === 'rothIRA')) return;
    const events = [];
    globalThis.__R50 = (e) => events.push(e);
    let rv;
    try { rv = getVariant().runPlan(JSON.parse(JSON.stringify(p))); } finally { globalThis.__R50 = null; }
    const flags = replay(p, events, result && result.issues);
    if (result && rv && JSON.stringify(result.rows) !== JSON.stringify(rv.rows)) flags.push('(replay rows differ from the test\'s own call: the test mutated the plan or the engine)');
    log('runPlan', p, flags);
  } catch (e) { /* exposure logging never fails a test */ }
}
function checkSim(p) {
  try {
    if (!p || !Array.isArray(p.accounts)) return;
    const roth = p.accounts.filter((a) => a && a.type === 'rothIRA');
    if (!roth.length) return;
    const adv = p.advanced || {};
    if (roth.some((a) => Number(a.balance) > 0 || Number(a.contribution) > 0) || adv.conversionOn || (adv.transferOn && roth.some((a) => a.id === adv.transferTo || a.id === adv.transferFrom)))
      log('simulatePlan', p, ['inputs: a Roth IRA that holds or can receive money (necessary condition only)']);
  } catch (e) { /* never fails a test */ }
}
const load = Module._load;
Module._load = function (request, parent, isMain) {
  const m = load.apply(this, arguments);
  let resolved = '';
  try { resolved = Module._resolveFilename(request, parent, isMain).toLowerCase(); } catch (e) { return m; }
  if (resolved === ENGINE && m && !m.__r50wrapped && typeof m.runPlan === 'function') {
    const run = m.runPlan, sim = m.simulatePlan;
    m.runPlan = function (p) { let input = null; try { input = p && typeof p === 'object' ? JSON.parse(JSON.stringify(p)) : null; } catch (e) { input = null; } const r = run.apply(this, arguments); checkRun(input, r); return r; };
    if (typeof sim === 'function') m.simulatePlan = function (p) { checkSim(p); return sim.apply(this, arguments); };
    Object.defineProperty(m, '__r50wrapped', { value: true });
  }
  return m;
};
