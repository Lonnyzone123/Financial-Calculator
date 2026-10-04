/* S5AA R47 corrected prediction scan (v2), on the owner's decision of 2026-10-03: R47's misses are not accepted as disclosed; the
   corrected scan must be proved on the pre-repair tree. Usage: node r47_corpus_scan_v2.js <pre-repair tree> [--json <out>]
   Reads engine files from the given tree only. Held to the R44.1 checklist (C1-C8).

   Corrections against audit/S5AA/R47/prediction/r47_corpus_scan.js:
   1. (C2) The senior deduction must be BINDING, not merely positive: in each row of tax year 2029 or later the row's own return is
      recomputed by the engine's estimateTaxes() under the row's own rules object, once as the engine has it and once with the
      enhanced deduction set to $0 (perEligiblePerson 0, nothing else touched); the row moves only where the total differs.
   2. (C6) The wage-only `baseline` return (the tax on wages, paid outside the portfolio; the funding obligation is the full return
      LESS it) is a separate reader with its own MAGI: it is recomputed the same way.
   3. (C6) The one-time contribution route into an HSA: a scheduled transfer into an HSA in a row where its owner is past 65 and before
      the new Medicare start changes the room it is held to (the engine's note), and moves dollars only where the source holds any.
   4. (C5) Direction from the cash flow of the first changed row: dT = the full return's change, dB = the baseline's; the portfolio
      funds dT - dB more. The row's own funding (read by the taps) decides where that lands: a sale (the portfolio pays: final total
      down if dT - dB > 0, up if < 0); an unfunded need (shortfall up, total unchanged); cash on hand whose surplus is deposited to or
      retained in the portfolio (total down); cash on hand whose surplus is not kept (total unchanged). Lifetime tax: up with dT > 0;
      with dT = 0 there is no first-order change, and the second-order sign (less gain realised now against more balance earning
      later) is not predicted.
   C1: every figure is the engine's own -- the row's arguments, rules object and funding are read by read-only taps on an in-memory
   variant of the tree's own engine (tests/lib/engine-variant.js), whose rows are asserted equal to the real engine's for every plan
   and path. C4: a Monte Carlo plan is scanned path by path (the engine's seeds) and named with its binding paths. */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2]);
const OUT = process.argv.indexOf('--json') > 0 ? process.argv[process.argv.indexOf('--json') + 1] : null;
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
const BASE = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
global.RULES = BASE;
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const { loadEngineVariant } = require(path.join(ROOT, 'tests', 'lib', 'engine-variant.js'));

const TAP_TAX = 'if(globalThis.__R47T)globalThis.__R47T({yi:yi,age:age,rowAge:rowAge,duration:duration,rules:RULES,plan:p,' +
  'oi:(typeof ordinaryAtCommit==="number"?ordinaryAtCommit:ordinaryIncome),gains:gains,ss:ss+other.ss,payrollWages:payrollWages,qd:qualifiedDividends,' +
  'payrollSpouseWages:payrollSpouseWages,seSelf:other.seSelf,seSpouse:other.seSpouse,nii:ordinaryDividends+(other.nii||0),carry:capitalLossCarry,' +
  'wages:wages,preTaxDeferrals:preTaxDeferrals,spouseWages:spouseWages,taxesTotal:taxes.total,baselineTotal:baseline.total,' +
  'sale:typeof totalGross==="number"?totalGross:0,taxNeed:taxNeed,availableCash:availableCash});';
const TAP_XFER = 'if(globalThis.__R47X)globalThis.__R47X({yi:yi,age:age,rowAge:rowAge,duration:duration,rules:RULES,plan:p,toType:t&&t.type,' +
  'toOwner:t&&t.owner,fromBalance:f?Math.max(0,f.balance):0,dateGrowth:dateGrowth,transferOnAge:transferOnAge,contribution:transferContribution,' +
  'note:transferLimitNote,hsaParts:audit.items.map(function(it){return {owner:it.account.owner==="spouse"?"spouse":"self",base:it.hsaBasePart||0,' +
  'catchPart:it.hsaCatchPart||0}}),dur:{self:Number(rowComp415&&rowComp415.selfDuration)||0,spouse:Number(rowComp415&&rowComp415.spouseDuration)||0}});';
const TAP_ROW = 'if(globalThis.__R47R)globalThis.__R47R({yi:yi,outsideDeposit:outsideDepositToPortfolio,retainedRmdCash:retainedRmdCash});';
const TAP_SURPLUS = 'if(globalThis.__R47S)globalThis.__R47S({yi:yi,shares:SURPLUS_SOURCES.map(function(src){return {src:src,amount:retainedBySource[src]||0,weight:surplusBySource[src]||0,policy:surplusPolicyFor(p,src)}})});';
const TAP_OBL = 'if(globalThis.__R47O)globalThis.__R47O({yi:yi,obligation:actualObligation,availableCash:availableCash,sale:totalGross});';
const variant = loadEngineVariant([
  { id: 'r47-surplus', marker: 'SURPLUS_SOURCES.forEach(function(src){retainedBySource[src]=(surplusBySource[src]||0)*retainRatio});', append: TAP_SURPLUS },
  { id: 'r47-obligation', marker: 'var actualObligation=Math.max(0,taxes.total-baseline.total)+penalties+Math.max(0,trueUpDue),actualFunded=availableCash+totalGross,surplus=actualFunded-actualObligation;', append: TAP_OBL },
  { id: 'r47-row', marker: 'rows.push(row);if(issues)checkRowInvariants(', replace: TAP_ROW + 'rows.push(row);if(issues)checkRowInvariants(' },
  { id: 'r47-tax', marker: 'if(rowTaxesCommitted){var iraSettleDelta=0,iraSettleAny=false;', replace: TAP_TAX + 'if(rowTaxesCommitted){var iraSettleDelta=0,iraSettleAny=false;' },
  { id: 'r47-xfer', marker: 'transferMoved=moveFunds(accounts,p.advanced.transferFrom,p.advanced.transferTo,transferAmount);', replace: TAP_XFER + 'transferMoved=moveFunds(accounts,p.advanced.transferFrom,p.advanced.transferTo,transferAmount);' },
]);

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const noSenior = (R) => Object.assign({}, R, { federal: Object.assign({}, R.federal, { seniorDeduction: Object.assign({}, R.federal.seniorDeduction, { perEligiblePerson: 0 }) }) });
function withRules(R, fn) { const saved = global.RULES; global.RULES = R; try { return fn(); } finally { global.RULES = saved; } }
// The row's two returns as the engine computes them (estimateTaxes() with the tapped arguments), under its rules and with no 151 amount.
function rowDeltas(t) {
  const full = (R) => withRules(R, () => E.estimateTaxes(t.plan, t.age, t.oi, t.gains, t.ss, t.payrollWages, t.qd, t.payrollSpouseWages, t.seSelf, t.seSpouse, t.nii, t.carry, t.duration).total);
  const base = (R) => withRules(R, () => E.estimateTaxes(t.plan, t.age, Math.max(0, t.wages - t.preTaxDeferrals), 0, 0, t.wages, 0, t.spouseWages, void 0, void 0, void 0, void 0, t.duration).total);
  const f0 = full(t.rules), b0 = base(t.rules), R1 = noSenior(t.rules);
  return { dT: full(R1) - f0, dB: base(R1) - b0, checkT: Math.abs(f0 - t.taxesTotal) < 0.005, checkB: Math.abs(b0 - t.baselineTotal) < 0.005 };
}
// The new Medicare start (the owner's rule), from the tree's own Social Security helpers.
function medicareStart(p, owner) {
  const pr = p.profile || {}, r = p.retirement || {}, o = owner === 'spouse' ? pr.spouseMedicareStartAge : pr.medicareStartAge;
  if (fin(o)) return o;
  if (!(E.ssPiaBase(p, owner) > 0)) return 65;
  const claim = Math.max(62, Number(owner === 'spouse' ? r.spouseClaim : r.ssClaim));
  return claim <= 65 ? 65 : Math.max(65, claim - 0.5);
}
// One run (a path for Monte Carlo) on the tapped variant: taps collected, rows asserted equal to the real engine's.
function tappedRun(p, seeds) {
  const taxTaps = [], xferTaps = [], rowTaps = {};
  globalThis.__R47T = (o) => taxTaps.push(o); globalThis.__R47X = (o) => xferTaps.push(o); globalThis.__R47R = (o) => { rowTaps[o.yi] = Object.assign(rowTaps[o.yi] || {}, o); }; globalThis.__R47S = (o) => { rowTaps[o.yi] = Object.assign(rowTaps[o.yi] || {}, o); }; globalThis.__R47O = (o) => { rowTaps[o.yi] = Object.assign(rowTaps[o.yi] || {}, { obligation: o.obligation, cash: o.availableCash, saleAtCommit: o.sale }); };
  let rv, rr;
  try {
    rv = seeds ? variant.simulatePlan(JSON.parse(JSON.stringify(p)), variant.rng(seeds[0]), 0, variant.rng(seeds[1]), []) : variant.runPlan(JSON.parse(JSON.stringify(p)));
  } finally { globalThis.__R47T = null; globalThis.__R47X = null; globalThis.__R47R = null; globalThis.__R47S = null; globalThis.__R47O = null; }
  rr = seeds ? E.simulatePlan(JSON.parse(JSON.stringify(p)), E.rng(seeds[0]), 0, E.rng(seeds[1]), []) : E.runPlan(JSON.parse(JSON.stringify(p)));
  if (JSON.stringify(rv.rows) !== JSON.stringify(rr.rows)) throw new Error('a tap is not output-neutral');
  return { taxTaps, xferTaps, rowTaps, rows: rr.rows };
}
function analyse(p, run) {
  const out = { senior: null, hsaOnce: [], checks: 0, checkFails: 0 };
  // 1-2. the senior deduction, binding in either return, tax years 2029+
  let sT = 0, sB = 0, first = null;
  const classes = { portfolio: 0, spend: 0, shortfall: 0 };
  for (const t of run.taxTaps) {
    if (t.yi < 3) continue;
    const d = rowDeltas(t);
    out.checks++; if (!d.checkT || !d.checkB) out.checkFails++;
    if (Math.abs(d.dT) > 0.005 || Math.abs(d.dB) > 0.005) {
      sT += d.dT; sB += d.dB;
      // C5, per changed row: where its extra obligation (dT - dB) is funded. The tax is funded from the row's cash first and the rest by a
      // sale (quoteTaxFunding()); cash left after the tax is split pro rata over its sources (RA-01) and each source's policy decides it.
      {
        const rt = run.rowTaps[t.yi] || {}, row = run.rows[t.yi + 1] || {}, extra = d.dT - d.dB;
        const cash = Number(rt.cash) || 0, obligation = Number(rt.obligation) || 0;
        // the cash pools' split (RA-01's pro-rata residual, by source) and how much of it each policy spends
        const weight = (rt.shares || []).reduce((s2, x) => s2 + x.weight, 0), spentW = (rt.shares || []).reduce((s2, x) => s2 + (x.policy === 'spend' ? x.weight : 0), 0);
        const sp = weight > 1e-9 ? spentW / weight : 0, sale = Number(rt.saleAtCommit) || 0, residual0 = Math.max(0, cash - obligation);
        if ((row.shortfall || 0) > 0.005 || t.taxNeed > 0.005) classes.shortfall += extra;
        else if (extra >= 0) {
          // a larger obligation takes the cash residual first (then a sale): the residual's spent share lowers spending, its kept share the portfolio
          const fromResidual = sale > 1e-9 ? 0 : Math.min(extra, residual0);
          classes.spend += fromResidual * sp; classes.portfolio += fromResidual * (1 - sp) + (extra - fromResidual);
        } else {
          // a smaller obligation first shrinks the sale; past it, the cash residual grows and its sources' policies decide it
          const fromSale = Math.min(-extra, sale), toResidual = -extra - fromSale;
          classes.portfolio -= fromSale + toResidual * (1 - sp); classes.spend -= toResidual * sp;
        }
      }
      if (!first) {
        const row = run.rows[t.yi + 1] || {};
        const rt = run.rowTaps[t.yi] || {};
        first = { rowAge: t.rowAge, dT: d.dT, dB: d.dB, sale: t.sale, taxNeed: t.taxNeed, shortfall: row.shortfall || 0, availableCash: t.availableCash, keptInPortfolio: (Number(rt.outsideDeposit) || 0) + (Number(rt.retainedRmdCash) || 0) };
      }
    }
  }
  if (first) {
    const portfolio = classes.portfolio;
    // C5: where the first changed row's extra obligation lands, from its own funding
    const parts = [];
    if (Math.abs(portfolio) > 0.005) parts.push(portfolio > 0 ? 'final total down (the portfolio funds $' + portfolio.toFixed(2) + ' more, first order)' : 'final total up (the portfolio funds $' + (-portfolio).toFixed(2) + ' less, first order)');
    else parts.push('final total unchanged');
    if (classes.spend > 0.005) parts.push('spending down $' + classes.spend.toFixed(2) + ' (surplus a spend policy would have spent)');
    if (classes.spend < -0.005) parts.push('spending up $' + (-classes.spend).toFixed(2) + ' (cash a spend policy now spends)');
    if (classes.shortfall > 0.005) parts.push('shortfall up $' + classes.shortfall.toFixed(2));
    const total = parts.join(', ');
    const tax = sT > 0.005 ? 'lifetime tax up' : 'lifetime tax: no first-order change (second order only; its sign is not predicted)';
    out.senior = { first, sumDT: sT, sumDB: sB, classes, direction: tax + '; ' + total };
  }
  // 3. the one-time route into an HSA
  for (const x of run.xferTaps) {
    if (x.toType !== 'hsa' || !x.contribution) continue;
    const owner = x.toOwner === 'spouse' ? 'spouse' : 'self', p0 = x.plan, ownerAge = owner === 'spouse' ? Number(p0.profile.spouseAge) + (x.age - p0.profile.age) : x.age;
    const m = medicareStart(p0, owner), rowSpan = x.duration;
    const shareOld = rowSpan > 0 ? Math.min(1, Math.max(0, 65 - ownerAge) / rowSpan) : 0, shareNew = rowSpan > 0 ? Math.min(1, Math.max(0, m - ownerAge) / rowSpan) : 0;
    if (Math.abs(shareNew - shareOld) < 1e-12) continue;
    // the room, mirrored from the tree's one-time route with each share (the family base left, the owner's own base and catch-up)
    const R = x.rules.retirement.hsa, hsaBase = p0.profile.filing === 'mfj' ? R.family : R.self, catchLimit = ownerAge + rowSpan >= R.catchupAge ? R.catchup : 0;
    const dur = x.dur, used = x.hsaParts.reduce((s, it) => s + it.base * dur[it.owner], 0), ownBase = x.hsaParts.reduce((s, it) => s + (it.owner === owner ? it.base * dur[owner] : 0), 0), ownCatch = x.hsaParts.reduce((s, it) => s + (it.owner === owner ? it.catchPart * dur[owner] : 0), 0);
    const room = (sh) => Math.max(0, Math.min(hsaBase - used, hsaBase * sh - ownBase)) + Math.max(0, catchLimit * sh - ownCatch);
    const asked = Number(p0.advanced.transferAmount) || 0, available = x.fromBalance * (x.dateGrowth || 1);
    const movedOld = Math.min(asked, room(shareOld), available), movedNew = Math.min(asked, room(shareNew), available);
    out.hsaOnce.push({ rowAge: x.rowAge, owner, medicareStart: m, roomOld: room(shareOld), roomNew: room(shareNew), noteRoomTapped: x.note ? x.note.room : null,
      asked, sourceAvailable: available, movedOld, movedNew,
      direction: Math.abs(movedNew - movedOld) > 0.005 ? 'moves $' + (movedNew - movedOld).toFixed(2) + ' more into the HSA' : 'the room in the limit note changes; no dollar moves (the source holds $' + available.toFixed(2) + ')' });
  }
  return out;
}

const result = {};
for (const comp of ['control', 'expanded']) {
  const { entries, omissions } = cap.corpusWithDiagnostics({ composition: comp });
  if (omissions.length) throw new Error(comp + ' omissions');
  const named = [];
  for (const e of entries) {
    const p = e.plan;
    if (p.assumptions.method === 'monteCarlo') {
      const b = Number(p.assumptions.seed), binding = [], hsa = [];
      let checks = 0, fails = 0;
      for (let i = 0; i < p.assumptions.runs; i++) {
        const a = analyse(p, tappedRun(p, [E.monteCarloPathSeed(b, i, 0), E.monteCarloPathSeed(b, i, 1)]));
        checks += a.checks; fails += a.checkFails;
        if (a.senior) binding.push(i);
        if (a.hsaOnce.length) hsa.push(i);
      }
      if (binding.length || hsa.length) named.push({ name: e.name, monteCarlo: true, bindingPaths: binding, hsaOncePaths: hsa, paths: p.assumptions.runs, checks, checkFails: fails,
        prediction: 'named, with ' + binding.length + ' binding paths; the published result may move' });
      else if (fails) named.push({ name: e.name, monteCarlo: true, checkFails: fails });
    } else {
      const a = analyse(p, tappedRun(p, null));
      if (a.senior || a.hsaOnce.length) named.push(Object.assign({ name: e.name }, a));
      else if (a.checkFails) named.push({ name: e.name, checkFails: a.checkFails });
    }
  }
  result[comp] = named;
  console.log('== ' + comp + ' (' + entries.length + ' plans): ' + named.length + ' named');
  for (const n of named) {
    if (n.monteCarlo) { console.log('  ' + n.name + ' [Monte Carlo] binding paths ' + (n.bindingPaths || []).length + '/' + n.paths + ', HSA one-time paths ' + (n.hsaOncePaths || []).length + ' -- ' + n.prediction + (n.checkFails ? ' (RECOMPUTE MISMATCH ' + n.checkFails + ')' : '')); continue; }
    const parts = [];
    if (n.senior) parts.push('senior: first changed row ' + n.senior.first.rowAge + ' (dT ' + n.senior.first.dT.toFixed(2) + ', dB ' + n.senior.first.dB.toFixed(2) + ', sale ' + (n.senior.first.sale > 1e-9 ? 'yes' : 'no') + ', kept ' + n.senior.first.keptInPortfolio.toFixed(2) + ', shortfall ' + (n.senior.first.shortfall > 0.005 ? 'yes' : 'no') + '); first-order lifetime dT ' + n.senior.sumDT.toFixed(2) + ', dB ' + n.senior.sumDB.toFixed(2) + ' -> ' + n.senior.direction);
    n.hsaOnce.forEach((h) => parts.push('HSA one-time at row ' + h.rowAge + ': room ' + h.roomOld.toFixed(2) + ' -> ' + h.roomNew.toFixed(2) + ' (engine note ' + h.noteRoomTapped + ') -> ' + h.direction));
    console.log('  ' + n.name + ' -- ' + parts.join(' | ') + (n.checkFails ? ' (RECOMPUTE MISMATCH ' + n.checkFails + ' of ' + n.checks + ')' : ''));
  }
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, (k, v) => (k === 'plan' || k === 'rules' ? undefined : v), 1));
