/* S5AA R50 prediction scan, CORRECTED (v2), for the owner's decision of 2026-10-03: R50's prediction misses SA50-B, -C and -D are not
   accepted as disclosed; the corrected scan must be proved on the pre-repair tree.
   Usage: node r50_corpus_scan_v2.js <pre-repair tree (ba9946d)> <R50 tree (2d9ede3)> [--paths]
   The scan runs the PRE-REPAIR engine (a read-only tapped variant, asserted output-neutral). The R50 tree is read only for the
   engine's own optimizer, smartWithdrawalOrder(), which v2 asks directly (C1) -- it is never used to simulate a plan.
   Held to audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md.

   v1 (audit/S5AA/R50/prediction/r50_corpus_scan.js) named a plan or path only where a Roth IRA distribution reached a taxed or
   penalized segment of the R50 ledger, and argued that the optimizer's ledger weight was subsumed by that test. It is not:
   rothExposureWeight() reads the exposed SHARE of the Roth class (earnings and recent conversions over the class balance), so it
   can re-rank the Roth class in a row whose Roth draw comes wholly from basis, or where the Roth is not drawn at all but a
   ranking above it changes what is drawn. The corrections:
   - C6 (the reader v1 missed): THE OPTIMIZER. At every call of smartWithdrawalOrder() in the pre-repair run, the tap records the
     engine's own arguments (the plan as the engine holds it, a copy of the accounts, the MAGI history, the prior return and the
     year's rules). v2 replays the R50 ledger to that moment and asks the R50 engine's smartWithdrawalOrder() for the order with
     and without the ledger (without it, the function is the pre-repair one: the weight is 0). A path is exposed when the two
     orders differ AND the row then draws from a class at or past the first place they differ (a spending or tax-funding draw after
     the call; a class ranked before that place is reached first in both orders, so its draw cannot change). Before the first such row,
     or the first taxed Roth IRA dollar, the two trees hold the same state, so this is a necessary condition for a path to
     change (C4: the test may name more paths than change, never fewer).
   - SA50-B (a switch's counterfactual): a corpus switch is "executed" when turning it off moves the plan. For
     retirement.preserveRoth, which sits on the same Roth score, v2 runs the same exposure test on the plan with the switch
     off; a plan exposed there may stop executing the switch, so tests/corpus-configured-paths.test.js is named.
   - SA50-D (an issue on an optimized plan): a disclosure raised by a taxed Roth IRA draw on a path that is also exposed through
     the optimizer is predicted as "may be added": the re-ranking can come first and remove the draw.
   Everything else is v1's: the ledger rules, the taxed-draw test, transfers, deaths, the issue predictions. */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const PRE = path.resolve(process.argv[2]), POST = path.resolve(process.argv[3]);
const LIST_PATHS = process.argv.includes('--paths');
const SHELL = fs.readFileSync(path.join(PRE, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const BASE_RULES = global.RULES;
const cap = require(path.join(PRE, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(PRE, 'src', 'engine.js'));
const POST_E = require(path.join(POST, 'src', 'engine.js'));
const { loadEngineVariant } = require(path.join(PRE, 'tests', 'lib', 'engine-variant.js'));

const T = 'if(globalThis.__R50)globalThis.__R50(';
const variant = loadEngineVariant([
  { id: 'row', marker: 'for(var yi=0;yi<boundaries.length;yi++){', append: T + '{k:"row",yi:yi,age:yi===0?start:boundaries[yi-1]});' },
  { id: 'draw', marker: 'if(taxClass==="roth"&&w>0){var rothOwnerAge=accountOwnerAge(p,age,a);',
    replace: 'if(taxClass==="roth"&&w>0)' + T + '{k:"draw",type:a.type,owner:a.owner==="spouse"?"spouse":"self",ownerAge:accountOwnerAge(p,age,a),w:w});if(taxClass==="roth"&&w>0){var rothOwnerAge=accountOwnerAge(p,age,a);' },
  { id: 'contrib', marker: 'if(target){addTaxableBasis(target,c);', append: 'if(target.type==="rothIRA")' + T + '{k:"contrib",owner:target.owner==="spouse"?"spouse":"self",c:c});' },
  { id: 'conv', marker: 'r.source.balance-=take;r.destination.balance+=take;', append: T + '{k:"conv",type:r.destination.type,owner:r.destination.owner==="spouse"?"spouse":"self",taxable:take-nt,nt:nt});' },
  { id: 'death', marker: 'var carried=Math.max(0,Number(iraBasisState[from])||0);', append: T + '{k:"death",from:from,to:to});' },
  { id: 'xfer', marker: '/* S5AA R23 (R22-01): Roth money moved out to a non-Roth account is a Roth distribution. */',
    append: 'if(f&&t&&transferMoved>0)' + T + '{k:"xfer",fType:f.type,fClass:f.taxClass,tType:t.type,tClass:t.taxClass,fOwner:f.owner==="spouse"?"spouse":"self",tOwner:t.owner==="spouse"?"spouse":"self",moved:transferMoved,taxable:transferTaxable,basis:transferBasis,ownerAge:accountOwnerAge(p,transferOnAge,f)});' },
  // v2: the optimizer's arguments at every call, and every draw after it
  { id: 'order', marker: 'function smartWithdrawalOrder(p,age,accounts,magiHistory,priorReturn){',
    append: T + '{k:"order",p:p,age:age,accounts:JSON.parse(JSON.stringify(accounts)),magi:magiHistory.slice(),priorReturn:priorReturn,rules:RULES});' },
  { id: 'wd', marker: 'function withdrawFromAccountList(list,taxClass,amount,age,p,iraBasisState,poolAccounts,heldBack){',
    append: 'if(amount>1e-9)' + T + '{k:"wd",taxClass:taxClass});' },
]);

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
// The replayed ledger in the R50 engine's own shape, for its smartWithdrawalOrder().
const asEngineLedger = (L, yi) => {
  const c = (e) => ({ basis: e.basis, conv: e.conv.map((x) => ({ year: x.year, taxable: x.taxable, nontaxable: x.nt })), first: e.first, firstAssumed: !!e.firstAssumed, basisDefault: !!e.basisDefault });
  return { yi, issues: null, self: c(L.self), spouse: c(L.spouse) };
};
function orderChanges(e, L, yi) {
  const saved = global.RULES;
  try {
    global.RULES = e.rules;
    const before = POST_E.smartWithdrawalOrder(e.p, e.age, e.accounts, e.magi, e.priorReturn);
    const after = POST_E.smartWithdrawalOrder(e.p, e.age, e.accounts, e.magi, e.priorReturn, asEngineLedger(L, yi));
    if (before.join(',') === after.join(',')) return null;
    let firstDiff = 0; while (before[firstDiff] === after[firstDiff]) firstDiff++;
    return { before, after, firstDiff, text: before.join('>') + ' => ' + after.join('>') };
  } finally { global.RULES = saved; }
}

function scan(plan) {
  const p = JSON.parse(JSON.stringify(plan));
  const events = [];
  globalThis.__R50 = (e) => events.push(e);
  let rv;
  try { rv = variant.runPlan(JSON.parse(JSON.stringify(p))); } finally { globalThis.__R50 = null; global.RULES = BASE_RULES; }
  const r = E.runPlan(JSON.parse(JSON.stringify(p)));
  if (JSON.stringify(r.rows) !== JSON.stringify(rv.rows)) throw new Error('the tap is not output-neutral');
  const penEx = !!(p.advanced && p.advanced.penaltyException);
  let L = null, yi = 0, pathNo = -1, rowAge = null, pendingOrder = null;
  const exposed = new Map(), disclose = new Map(), k401 = [];
  const mark = (why) => { if (!exposed.has(pathNo)) exposed.set(pathNo, { yi, rowAge, why }); };
  const note = (o, d, age) => {
    const led = L[o];
    if (!d.qualified && d.earnings > 0 && led.basisDefault && !disclose.has('ROTH_IRA_BASIS_NOT_ENTERED')) disclose.set('ROTH_IRA_BASIS_NOT_ENTERED', pathNo);
    if (age >= 59.5 && led.firstAssumed && yi < 5 && !disclose.has('ROTH_FIVE_YEAR_ASSUMED')) disclose.set('ROTH_FIVE_YEAR_ASSUMED', pathNo);
  };
  for (const e of events) {
    if (e.k === 'row') { if (e.yi === 0) { pathNo++; L = freshLedger(p); } yi = e.yi; rowAge = e.age; pendingOrder = null; continue; }
    if (!L) continue;
    if (e.k === 'order') { const ch = orderChanges(e, L, yi); pendingOrder = ch; continue; }
    // A draw from a class ranked before the first place the two orders differ is the same in both: the walk reaches it first either
    // way and the row's need or tax is met the same. Only a draw that reaches the first differing place or beyond can change.
    if (e.k === 'wd') { if (pendingOrder && pendingOrder.before.indexOf(e.taxClass) >= pendingOrder.firstDiff) mark('order ' + pendingOrder.text + ', a ' + e.taxClass + ' draw at or past the change'); continue; }
    if (e.k === 'death') { const a = L[e.from], b = L[e.to]; b.basis += a.basis; b.conv = b.conv.concat(a.conv).sort((x, y) => x.year - y.year); b.first = a.first === null ? b.first : b.first === null ? a.first : Math.min(a.first, b.first); b.firstAssumed = b.first === -Infinity; b.basisDefault = b.basisDefault || a.basisDefault; L[e.from] = { basis: 0, conv: [], first: null, firstAssumed: false, basisDefault: false }; continue; }
    const inflow = (o) => { if (L[o].first === null) L[o].first = yi; };
    if (e.k === 'contrib') { L[e.owner].basis += e.c; inflow(e.owner); }
    else if (e.k === 'conv' && e.type === 'rothIRA') { const c = L[e.owner].conv, last = c[c.length - 1]; if (last && last.year === yi) { last.taxable += e.taxable; last.nt += e.nt; } else c.push({ year: yi, taxable: e.taxable, nt: e.nt }); inflow(e.owner); }
    else if (e.k === 'xfer') {
      if (e.tType === 'rothIRA' && e.fClass === 'preTax') { L[e.tOwner].conv.push({ year: yi, taxable: e.taxable, nt: e.basis }); inflow(e.tOwner); }
      else if (e.tType === 'rothIRA' && (e.fClass === 'taxable' || e.fClass === 'hsa')) { L[e.tOwner].basis += e.moved; inflow(e.tOwner); }
      else if (e.tType === 'rothIRA' && e.fClass === 'roth' && e.fType !== 'rothIRA') { if (e.ownerAge >= 59.5) L[e.tOwner].basis += e.moved; inflow(e.tOwner); }
      if (e.fType === 'rothIRA' && e.tClass !== 'roth') { const d = distribute(L, e.fOwner, e.moved, e.ownerAge, yi, penEx); note(e.fOwner, d, e.ownerAge); if (d.income > 0.005 || d.penalized > 0.005) mark('transfer out taxed'); }
    } else if (e.k === 'draw') {
      if (e.type !== 'rothIRA') { if (e.ownerAge < 59.5) k401.push(e.type); continue; }
      const d = distribute(L, e.owner, e.w, e.ownerAge, yi, penEx); note(e.owner, d, e.ownerAge);
      if (d.income > 0.005 || d.penalized > 0.005) mark('taxed Roth IRA draw ' + Math.round(e.w));
    }
  }
  return { exposed, disclose, k401, paths: pathNo + 1, flagNow: (r.issues || []).some((i) => i.code === 'UNSUPPORTED_ROTH_ORDERING'), optimized: p.retirement.withdrawalOrder !== 'manual' };
}

const out = [];
const { entries, omissions } = cap.corpusWithDiagnostics({ composition: 'expanded' });
if (omissions.length) throw new Error('omissions');
const control = new Set(cap.corpusWithDiagnostics({ composition: 'control' }).entries.map((e) => e.name));
const exposedPaths = {};
for (const e of entries) {
  const s = scan(e.plan), lines = [];
  const mc = e.plan.assumptions.method === 'monteCarlo';
  const pathsSorted = [...s.exposed.keys()].sort((a, b) => a - b);
  if (mc) exposedPaths[e.name] = pathsSorted;
  if (pathsSorted.length) {
    if (mc) lines.push('figures: Monte Carlo, ' + pathsSorted.length + ' of ' + s.paths + ' paths exposed; the published result may move' + (LIST_PATHS ? ' [' + pathsSorted.join(',') + ']' : ''));
    else { const x = s.exposed.get(0); lines.push('figures move from row opening ' + (+x.rowAge.toFixed(2)) + ' (' + x.why + ')'); }
  }
  if (s.flagNow && !s.k401.length) lines.push('issues: UNSUPPORTED_ROTH_ORDERING removed');
  for (const [code, pathAt] of s.disclose) {
    const viaOrder = s.optimized && s.exposed.has(pathAt) && String(s.exposed.get(pathAt).why).startsWith('order');
    lines.push('issues: ' + (viaOrder || (s.optimized && [...s.exposed.values()].some((x) => x.why.startsWith('order'))) ? 'may add ' : 'adds ') + code);
  }
  // SA50-B: the preserveRoth switch's counterfactual
  if (e.plan.retirement && e.plan.retirement.preserveRoth === true && e.plan.retirement.withdrawalOrder !== 'manual') {
    const q = JSON.parse(JSON.stringify(e.plan)); q.retirement.preserveRoth = false;
    const t = scan(q);
    if (t.exposed.size) lines.push('switch: retirement.preserveRoth off is exposed (' + t.exposed.get([...t.exposed.keys()].sort((a, b) => a - b)[0]).why + '): whether the switch still executes may change -- tests/corpus-configured-paths.test.js');
  }
  if (lines.length) out.push(e.name + (control.has(e.name) ? ' [control]' : '') + '\n    ' + lines.join('\n    '));
}
console.log('S5AA R50 corrected scan (v2) on the pre-repair tree; ' + entries.length + ' expanded plans (the control 36 among them)');
console.log('named (' + out.length + '):\n  ' + out.join('\n  '));
if (process.env.R50_EXPOSED_OUT) fs.writeFileSync(process.env.R50_EXPOSED_OUT, JSON.stringify(exposedPaths));
