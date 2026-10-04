/* S5AA R46 prediction scan: Monte Carlo and the cash reserve (the owner, 2026-10-03, AA1-24 / MC-A to MC-E). Run on the tree BEFORE the
   R46 engine edits.
   Usage: node audit/S5AA/R46/prediction/r46_corpus_scan.js [<source tree>]
   Held to audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md.

   The rules being built:
   1. MC-A, MC-D: one vector of correlated asset-class shocks per Monte Carlo path and period, shared by every account (with asset
      classes off, one household shock at assumptions.volatility). Today each account draws its own normal in account order.
   2. MC-C: a correlation infeasible for the active asset classes is refused by both layers (Monte Carlo with asset classes on).
   3. MC-E: the success label and a final-year real-spending summary (no projection figure moves).
   4. MC-B: the reserve share is min(1, reserve / portfolio total) for every account; today min(account balance, reserve) / total.

   Conditions, per plan, through the pre-repair engine's own code (C1: r46_instrument.js puts probes on the exact expressions the
   repair replaces):
   - mc (rule 1, C4/A-11): a Monte Carlo plan. EVERY path is run on this tree with this tree's seeding (rng(monteCarloPathSeed(seed, i,
     0)) and stream 1 for care), counting the normals accountReturnForPeriod() draws in each row. A path is EXPOSED when asset classes
     are on (the account shock becomes a weighted sum of class shocks: always a different number), or when some row did not draw
     exactly one normal (the household shock replaces one normal per account), or when a synthesized account took the expectation
     (suppressDraw: under rule 1 it takes the period's shared shock). A path with asset classes off that draws exactly one normal in
     every row and never suppresses keeps its numbers: one account's own normal IS the period's first normal, at the same volatility.
     Path 0 is checked against runPlan(runs: 1).
   - refusal (rule 2): Monte Carlo, asset classes on, and the correlation outside [-1, 1] or below -1/(m-1) for the m active classes.
     Active: a class some account of the plan, as entered, weights above zero at the start or at the end of its glide (glide weights
     are linear in the glide's progress, so a class zero at both ends is zero throughout), read with the engine's accountGlideWeights().
   - reserve (rule 4): the reserve blend ran (the engine's own condition: reserve on, at or after the household date) for an account
     whose balance is below min(reserve, portfolio total) -- the only accounts whose share changes. Split into "live" (balance > 0)
     and "empty" (balance 0: its rate changes, but a zero balance grows by nothing unless money arrives before growth).
   For each reserve-flagged plan the base engine is run again with ONLY the reserve line replaced by the owner's formula (C5: the
   direction and size from the pre-repair engine with the rule applied); its final total and lifetime taxes are compared. */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const { loadInstrumentedEngine } = require('./r46_instrument.js');
const P = loadInstrumentedEngine(ROOT);
const PN = loadInstrumentedEngine(ROOT, { newReserve: true });
const money = (x) => (x < 0 ? '-$' : '$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function activeClasses(p) {
  const adv = p.advanced || {}, classes = Array.isArray(adv.assetClasses) ? adv.assetClasses : [];
  const active = new Set();
  (p.accounts || []).forEach((a) => {
    if (!a || !a.allocation || typeof a.allocation !== 'object') return;
    [0, 1e9].forEach((yp) => {
      const g = E.accountGlideWeights(a, p, yp);
      if (!g) return;
      classes.forEach((c) => { if ((g.weights[c.id] || 0) > 0) active.add(c.id); });
    });
  });
  return classes.filter((c) => active.has(c.id)).map((c) => c.id);
}

function withProbe(fn) {
  const log = { draws: new Map(), sup: 0, res: [] };
  globalThis.__r46 = {
    draw: (age) => log.draws.set(age, (log.draws.get(age) || 0) + 1),
    sup: () => { log.sup++; },
    res: (age, bal, R, T) => log.res.push({ age, bal, R, T }),
  };
  try { return { out: fn(), log }; } finally { globalThis.__r46 = null; }
}

function scanMonteCarlo(entry) {
  const p = JSON.parse(JSON.stringify(entry.plan)), adv = p.advanced, runs = p.assumptions.runs;
  let seed = Number(p.assumptions.seed); if (!Number.isFinite(seed)) seed = 0;
  const rowAges = E.runPlan(Object.assign(JSON.parse(JSON.stringify(p)), { assumptions: Object.assign({}, p.assumptions, { runs: 1 }) })).rows.map((r) => r.age);
  let exposed = 0, notOne = 0, sup = 0, resRows = 0; const drawCounts = new Set();
  for (let i = 0; i < runs; i++) {
    const { out, log } = withProbe(() => P.simulatePlan(p, P.rng(P.monteCarloPathSeed(seed, i, 0)), 0, P.rng(P.monteCarloPathSeed(seed, i, 1)), null));
    // Each row opening (every age but the last) is a period; a period that drew nothing counts 0.
    let rowNotOne = false;
    for (let k = 0; k < out.rows.length - 1; k++) { const n = log.draws.get(out.rows[k].age) || 0; drawCounts.add(n); if (n !== 1) rowNotOne = true; }
    if (rowNotOne) notOne++;
    if (log.sup) sup++;
    if (log.res.some((x) => x.bal < Math.min(x.R, x.T))) resRows++;
    if (adv.assetsOn || rowNotOne || log.sup) exposed++;
    if (i === 0) {
      const one = E.runPlan(Object.assign(JSON.parse(JSON.stringify(p)), { assumptions: Object.assign({}, p.assumptions, { runs: 1 }) }));
      const same = JSON.stringify(one.rows.map((r) => r.total)) === JSON.stringify(out.rows.map((r) => r.total));
      if (!same) throw new Error(entry.name + ': path 0 differs from runPlan(runs: 1) -- the scan does not seed as this tree does');
    }
  }
  const act = activeClasses(p);
  return { runs, exposed, notOne, sup, resRows, drawCounts: [...drawCounts].sort((a, b) => a - b), assetsOn: adv.assetsOn === true, rho: adv.correlation, active: act, rows: rowAges.length };
}

function refusalCondition(p) {
  const adv = p.advanced || {};
  if (p.assumptions.method !== 'monteCarlo' || adv.assetsOn !== true) return null;
  const rho = Number(adv.correlation), m = activeClasses(p).length;
  if (rho > 1 || rho < -1 || (m >= 2 && 1 + (m - 1) * rho < -1e-12)) return 'rho ' + rho + ' with ' + m + ' active classes';
  return null;
}

function scanReserve(entry) {
  const p = JSON.parse(JSON.stringify(entry.plan));
  if (!(p.advanced && p.advanced.reserveOn)) return null;
  const { out, log } = withProbe(() => P.runPlan(JSON.parse(JSON.stringify(p))));
  const live = log.res.filter((x) => x.bal > 0 && x.bal < Math.min(x.R, x.T)), empty = log.res.filter((x) => !(x.bal > 0) && 0 < Math.min(x.R, x.T));
  const rowsWith = (list) => [...new Set(list.map((x) => x.age))];
  const res = { reserveRows: rowsWith(log.res).length, liveRows: rowsWith(live), emptyRows: rowsWith(empty), status: out.status };
  if (live.length || empty.length) {
    const before = out, after = PN.runPlan(JSON.parse(JSON.stringify(p)));
    const last = (r) => r.rows[r.rows.length - 1];
    res.finalBefore = last(before).total; res.finalAfter = last(after).total;
    res.taxBefore = before.lifetimeTaxes; res.taxAfter = after.lifetimeTaxes;
    res.firstLive = live[0] ? live[0] : null;
    res.moved = JSON.stringify(before.rows) !== JSON.stringify(after.rows);
    res.firstMovedAge = (() => { for (let k = 0; k < before.rows.length; k++) if (JSON.stringify(before.rows[k]) !== JSON.stringify(after.rows[k])) return before.rows[k].age; return null; })();
  }
  return res;
}

for (const comp of ['control', 'expanded']) {
  const { entries, omissions } = cap.corpusWithDiagnostics({ composition: comp });
  if (omissions.length) throw new Error(comp + ' omissions: ' + JSON.stringify(omissions));
  console.log('== ' + comp + ' composition: ' + entries.length + ' plans');
  let flagged = 0;
  for (const e of entries) {
    const p = e.plan, lines = [];
    if (p.assumptions && p.assumptions.method === 'monteCarlo') {
      const m = scanMonteCarlo(e);
      lines.push('mc: ' + m.exposed + ' of ' + m.runs + ' paths exposed; asset classes ' + (m.assetsOn ? 'on (rho ' + m.rho + ', active ' + m.active.join('/') + ')' : 'off') +
        '; normals drawn per row ' + JSON.stringify(m.drawCounts) + '; paths with a row not drawing exactly one: ' + m.notOne + '; paths with a suppressed draw: ' + m.sup +
        '; paths with a reserve-share change: ' + m.resRows + '; ' + m.rows + ' rows');
    }
    const ref = refusalCondition(p);
    if (ref) lines.push('refusal: ' + ref);
    const r = scanReserve(e);
    if (r && (r.liveRows.length || r.emptyRows.length)) {
      lines.push('reserve: ' + r.reserveRows + ' reserve rows; an account below min(reserve, total) at ' + (r.liveRows.length ? 'ages ' + r.liveRows.join(', ') : 'no age') +
        (r.emptyRows.length ? '; an EMPTY account below it at ages ' + r.emptyRows.join(', ') : '') +
        (r.firstLive ? '; first: balance ' + money(r.firstLive.bal) + ' against reserve ' + money(r.firstLive.R) + ' of ' + money(r.firstLive.T) : '') +
        '. With the owner\'s formula on the base engine: ' + (r.moved ? 'moves from age ' + r.firstMovedAge + '; final total ' + money(r.finalBefore) + ' -> ' + money(r.finalAfter) +
        ' (' + money(r.finalAfter - r.finalBefore) + '); lifetime taxes ' + money(r.taxBefore) + ' -> ' + money(r.taxAfter) + ' (' + money(r.taxAfter - r.taxBefore) + ')' : 'no row moves'));
    } else if (r) lines.push('reserve on, ' + r.reserveRows + ' reserve rows, no account below min(reserve, total): not flagged');
    if (lines.length) { flagged++; console.log(e.name + ' [' + (p.assumptions && p.assumptions.method) + ']'); lines.forEach((l) => console.log('  ' + l)); }
  }
  console.log('-- ' + flagged + ' plans listed in the ' + comp + ' composition');
}
