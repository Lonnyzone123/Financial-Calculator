/* S5AA R50 prediction scan: the Roth IRA basis ledger (AA1-36) and income earlier in the first tax year (AA1-31), the owner's
   decisions of 2026-10-03. Run on the tree BEFORE the R50 engine edits.
   Usage: node audit/S5AA/R50/prediction/r50_corpus_scan.js [<source tree>]
   Held to audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md.

   The rules being built (AA1-36):
   - Each owner's Roth IRAs share one ledger (408A(d)(4)(A), Treas. Reg. 1.408A-6 A-2, A-9): regular contributions (basis), then
     conversions by tax year (FIFO; each year's taxable part first, then its nontaxable part), then earnings (408A(d)(4)(B),
     1.408A-6 A-8). Every Roth IRA distribution consumes the ledger in that order (408A(d)(4)(B)(i): "when added to all previous
     distributions"; 1.408A-6 A-4: prior distributions "whether or not they were qualified").
   - Opening basis is the account's entered contributionBasis (absent = 0). No corpus plan carries the field (it is new), so every
     corpus Roth IRA opens with basis 0; in-plan regular contributions to a Roth IRA, and taxable or HSA money transferred into
     one, add basis; a Roth 401(k) rolled in adds basis only when its owner is 59 1/2 or older on the transfer date.
   - The five-year period (408A(d)(2)(B), 1.408A-6 A-2): from the owner's entered rothFirstContributionYear (absent from every corpus
     plan), else met when the owner holds a Roth IRA balance at the start, else from the first tax year a Roth IRA receives money.
   - A distribution is qualified when the owner is 59 1/2 or older (the engine's year-opening age for pooled draws; a transfer's own
     date) and the five-year period has run (yi >= first + 5); it is then untaxed, as today.
   - A non-qualified distribution: basis is free; a conversion dollar within five tax years of its conversion bears the 10% on its
     taxable part while the owner is under 59 1/2 (408A(d)(3)(F), 1.408A-6 A-5), unless advanced.penaltyException; earnings are
     ordinary income and, under 59 1/2, bear the 10% (1.408A-6 A-5(a)).
   - Roth 401(k) and custom tax-free accounts are left as today (untaxed, flagged).
   AA1-31: profile.priorIncomeThisYear is new; no corpus plan carries it, so nothing moves under it.

   The condition (C1, C6): a plan moves only through a Roth IRA distribution that, under the R50 ledger, reaches a taxed or
   penalized segment. The pre-R50 engine has no ledger, so the scan TAPS the pre-R50 engine (a read-only in-memory variant,
   asserted output-neutral) for every Roth draw, Roth IRA inflow and transfer, and replays them through the ledger rules above.
   The optimizer's Roth weight is subsumed: it only moves the Roth class LATER, and only for an owner whose ledger is exposed, so
   a plan whose draws never reached a Roth IRA is unchanged, and one whose draws did is flagged here already.
   Monte Carlo (C4): every path is replayed with the plan's own seeding; a plan is named with its exposed paths. */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const { loadEngineVariant } = require(path.join(ROOT, 'tests', 'lib', 'engine-variant.js'));

const T = 'if(globalThis.__R50)globalThis.__R50(';
const variant = loadEngineVariant([
  { id: 'row', marker: 'for(var yi=0;yi<boundaries.length;yi++){', append: T + '{k:"row",yi:yi,age:yi===0?start:boundaries[yi-1]});' },
  { id: 'draw', marker: 'if(taxClass==="roth"&&w>0){var rothOwnerAge=accountOwnerAge(p,age,a);',
    replace: 'if(taxClass==="roth"&&w>0)' + T + '{k:"draw",type:a.type,owner:a.owner==="spouse"?"spouse":"self",ownerAge:accountOwnerAge(p,age,a),w:w});if(taxClass==="roth"&&w>0){var rothOwnerAge=accountOwnerAge(p,age,a);' },
  { id: 'contrib', marker: 'if(target){addTaxableBasis(target,c);',
    append: 'if(target.type==="rothIRA")' + T + '{k:"contrib",owner:target.owner==="spouse"?"spouse":"self",c:c});' },
  { id: 'conv', marker: 'r.source.balance-=take;r.destination.balance+=take;',
    append: T + '{k:"conv",type:r.destination.type,owner:r.destination.owner==="spouse"?"spouse":"self",taxable:take-nt,nt:nt});' },
  { id: 'death', marker: 'var carried=Math.max(0,Number(iraBasisState[from])||0);', append: T + '{k:"death",from:from,to:to});' },
  { id: 'xfer', marker: '/* S5AA R23 (R22-01): Roth money moved out to a non-Roth account is a Roth distribution. */',
    append: 'if(f&&t&&transferMoved>0)' + T + '{k:"xfer",fType:f.type,fClass:f.taxClass,tType:t.type,tClass:t.taxClass,fOwner:f.owner==="spouse"?"spouse":"self",tOwner:t.owner==="spouse"?"spouse":"self",moved:transferMoved,taxable:transferTaxable,basis:transferBasis,ownerAge:accountOwnerAge(p,transferOnAge,f)});' },
]);

const plans = (comp) => {
  const { entries, omissions } = cap.corpusWithDiagnostics({ composition: comp });
  if (omissions.length) throw new Error(comp + ' omissions: ' + JSON.stringify(omissions));
  return entries;
};
const key = (o) => (o === 'spouse' ? 'spouse' : 'self');

function freshLedger(p) {
  const L = {};
  ['self', 'spouse'].forEach((o) => {
    const own = (p.accounts || []).filter((a) => a && a.type === 'rothIRA' && key(a.owner) === o);
    const basis = own.reduce((s, a) => s + Math.max(0, Number(a.contributionBasis) || 0), 0);
    const bal = own.reduce((s, a) => s + Math.max(0, Number(a.balance) || 0), 0);
    L[o] = { basis, conv: [], first: bal > 0 || basis > 0 ? -Infinity : null, firstAssumed: bal > 0 || basis > 0,
      basisDefault: bal > 0 && !own.some((a) => a.contributionBasis !== undefined) };
  });
  return L;
}
function inflow(L, o, yi) { if (L[o].first === null) L[o].first = yi; }
// One distribution of `w` dollars from owner o's Roth IRAs at `age` in tax year yi; returns the taxed and penalized dollars.
function distribute(L, o, w, age, yi, penaltyException) {
  const led = L[o], qualified = age >= 59.5 && led.first !== null && yi >= led.first + 5, early = age < 59.5 && !penaltyException;
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

function scan(entry) {
  const p = JSON.parse(JSON.stringify(entry.plan));
  const events = [];
  globalThis.__R50 = (e) => events.push(e);
  let rv;
  try { rv = variant.runPlan(JSON.parse(JSON.stringify(p))); } finally { globalThis.__R50 = null; }
  const r = E.runPlan(JSON.parse(JSON.stringify(p)));
  if (JSON.stringify(r.rows) !== JSON.stringify(rv.rows)) throw new Error(entry.name + ': the tap is not output-neutral');
  const penEx = !!(p.advanced && p.advanced.penaltyException);
  let L = null, yi = 0, path = -1, rowAge = null;
  const hits = [], paths = new Set(), k401 = [], disclose = new Set();
  // The disclosures (any path; Monte Carlo carries a later path's up to the run): the opening basis taken as 0 priced a dollar
  // (a non-qualified distribution reached earnings, the owner holding Roth IRA money at the start with no basis entered); the
  // five-year period taken as met decided a distribution (59 1/2 or older, in plan years 0-4, the period assumed).
  const note = (o, d, age) => { const led = L[o]; if (!d.qualified && d.earnings > 0 && led.basisDefault) disclose.add('ROTH_IRA_BASIS_NOT_ENTERED'); if (age >= 59.5 && led.firstAssumed && yi < 5) disclose.add('ROTH_FIVE_YEAR_ASSUMED'); };
  for (const e of events) {
    if (e.k === 'row') { if (e.yi === 0) { path++; L = freshLedger(p); } yi = e.yi; rowAge = e.age; continue; }
    if (!L) continue;
    if (e.k === 'death') { // a spouse treating the Roth IRA as their own takes its basis and conversions; the five-year period ends at the earlier (1.408A-6 A-7(b))
      const a = L[e.from], b = L[e.to];
      b.basis += a.basis; b.conv = b.conv.concat(a.conv).sort((x, y) => x.year - y.year);
      b.first = a.first === null ? b.first : b.first === null ? a.first : Math.min(a.first, b.first);
      b.firstAssumed = b.firstAssumed || a.firstAssumed; b.basisDefault = b.basisDefault || a.basisDefault;
      L[e.from] = { basis: 0, conv: [], first: null, firstAssumed: false, basisDefault: false }; continue;
    }
    if (e.k === 'contrib') { L[e.owner].basis += e.c; inflow(L, e.owner, yi); }
    else if (e.k === 'conv' && e.type === 'rothIRA') { L[e.owner].conv.push({ year: yi, taxable: e.taxable, nt: e.nt }); inflow(L, e.owner, yi); }
    else if (e.k === 'xfer') {
      if (e.tType === 'rothIRA' && e.fClass === 'preTax') { L[e.tOwner].conv.push({ year: yi, taxable: e.taxable, nt: e.basis }); inflow(L, e.tOwner, yi); }
      else if (e.tType === 'rothIRA' && (e.fClass === 'taxable' || e.fClass === 'hsa')) { L[e.tOwner].basis += e.moved; inflow(L, e.tOwner, yi); }
      else if (e.tType === 'rothIRA' && e.fClass === 'roth' && e.fType !== 'rothIRA') { if (e.ownerAge >= 59.5) L[e.tOwner].basis += e.moved; inflow(L, e.tOwner, yi); }
      if (e.fType === 'rothIRA' && e.tClass !== 'roth') {
        const d = distribute(L, e.fOwner, e.moved, e.ownerAge, yi, penEx); note(e.fOwner, d, e.ownerAge);
        if (d.income > 0.005 || d.penalized > 0.005) { hits.push({ path, yi, rowAge, via: 'transfer', owner: e.fOwner, age: e.ownerAge, w: e.moved, ...d }); paths.add(path); }
      }
    } else if (e.k === 'draw') {
      if (e.type !== 'rothIRA') { if (e.ownerAge < 59.5) k401.push(e.type + ' at ' + (+e.ownerAge.toFixed(2))); continue; }
      const d = distribute(L, e.owner, e.w, e.ownerAge, yi, penEx); note(e.owner, d, e.ownerAge);
      if (d.income > 0.005 || d.penalized > 0.005) { hits.push({ path, yi, rowAge, via: 'draw', owner: e.owner, age: e.ownerAge, w: e.w, ...d }); paths.add(path); }
    }
  }
  const flagNow = (r.issues || []).some((i) => i.code === 'UNSUPPORTED_ROTH_ORDERING');
  return { flagNow, disclose: [...disclose].sort(), hits, paths: [...paths].sort((a, b) => a - b), totalPaths: path + 1, k401, method: p.assumptions.method };
}

const fmt = (x) => '$' + Math.round(x).toLocaleString('en-US');
for (const comp of ['control', 'expanded']) {
  const entries = plans(comp);
  const movers = [], k401s = [], issueMoves = [];
  for (const e of entries) {
    const s = scan(e);
    if (s.k401.length) k401s.push(e.name + ' [' + s.k401.slice(0, 2).join('; ') + (s.k401.length > 2 ? '; +' + (s.k401.length - 2) : '') + ']');
    if (s.flagNow && !s.k401.length) issueMoves.push(e.name + ': UNSUPPORTED_ROTH_ORDERING removed (every early Roth draw is a Roth IRA draw, now modelled)');
    if (s.disclose.length) issueMoves.push(e.name + ': adds ' + s.disclose.join(', '));
    if (!s.hits.length) continue;
    if (s.method === 'monteCarlo') {
      movers.push(e.name + ' (monteCarlo): ' + s.paths.length + ' of ' + s.totalPaths + ' paths exposed; first ' + s.paths.slice(0, 12).join(',') + (s.paths.length > 12 ? ',...' : '')
        + '; path 0 ' + (s.paths[0] === 0 ? 'exposed' : 'not exposed'));
      continue;
    }
    const h0 = s.hits.filter((h) => h.path === 0);
    const inc = h0.reduce((t, h) => t + h.income, 0), pen = h0.reduce((t, h) => t + h.penalized, 0);
    movers.push(e.name + ' (' + s.method + '): first at row opening ' + (+h0[0].rowAge.toFixed(2)) + ' (owner ' + h0[0].owner + ' ' + (+h0[0].age.toFixed(2)) + ', ' + h0[0].via + ' ' + fmt(h0[0].w)
      + '); ' + h0.length + ' exposed draws; on the pre-R50 draws: taxed earnings ' + fmt(inc) + ', dollars bearing the 10% ' + fmt(pen));
  }
  console.log('== ' + comp + ' (' + entries.length + ' plans)');
  console.log('  move (' + movers.length + '): ' + (movers.length ? '\n    ' + movers.join('\n    ') : 'none'));
  console.log('  Roth 401(k) / custom Roth draws before 59 1/2, left as today and still flagged (' + k401s.length + '): ' + (k401s.length ? '\n    ' + k401s.join('\n    ') : 'none'));
  console.log('  issues move (' + issueMoves.length + '): ' + (issueMoves.length ? '\n    ' + issueMoves.join('\n    ') : 'none'));
  const carriers = entries.filter((e) => ['priorIncomeThisYear', 'rothFirstContributionYear', 'spouseRothFirstContributionYear'].some((f) => e.plan.profile && e.plan.profile[f] !== undefined)
    || (e.plan.accounts || []).some((a) => a && a.contributionBasis !== undefined));
  console.log('  carry an R50 input (' + carriers.length + '): ' + (carriers.length ? carriers.map((e) => e.name).join(', ') : 'none'));
}
