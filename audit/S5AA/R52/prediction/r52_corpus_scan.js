/* S5AA R52 prediction scan (rules in r52_mirror.js). Run on the tree BEFORE the repair (2fb8c6f).
   Usage: node audit/S5AA/R52/prediction/r52_corpus_scan.js [<tree>]
   C1: read-only taps; the variant's rows (every path) are asserted equal to the real engine's for every plan.
   Each exposure test is a necessary condition (a plan or path it does not name cannot move under that repair); Monte Carlo plans are
   named with every exposed path, each path run with the engine's own seeding (C4, A-11). The validator's TRANSFER_BETWEEN_OWNERS is
   re-checked under the R52 rule (r52TransferAccepted()). */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const { loadEngineVariant } = require(path.join(ROOT, 'tests', 'lib', 'engine-variant.js'));
const M = require('./r52_mirror.js');
const T = M.fresh({});
globalThis.__R52 = T;
const V = M.makeVariant(loadEngineVariant, '__R52');
const money = (x) => (x < 0 ? '-' : '') + '$' + Math.abs(Math.round(x * 100) / 100).toLocaleString('en-US');
const stats = { plans: 0, mc: 0, x4973Rows: 0, qbiRows: 0, poolMoves: 0, convRecords: 0, settledPools: 0, rothDists: 0, transferOn: 0, warn: 0, seRows: 0, seAndDeferralRows: 0 };
function scan(name, p) {
  M.fresh(T); T.on = true;
  let rv;
  try { rv = V.runPlan(JSON.parse(JSON.stringify(p))); } finally { T.on = false; }
  const r = E.runPlan(JSON.parse(JSON.stringify(p)));
  if (JSON.stringify(rv.rows) !== JSON.stringify(r.rows) || rv.successRate !== r.successRate || JSON.stringify(rv.issues) !== JSON.stringify(r.issues)) throw new Error(name + ': taps not output-neutral');
  stats.plans++; if (p.assumptions.method === 'monteCarlo') stats.mc++;
  stats.x4973Rows += T.x4973.length; stats.qbiRows += T.qbi.length; stats.poolMoves += T.pool.length; stats.convRecords += T.conv.length; stats.settledPools += T.settle.length; stats.rothDists += T.dist.length; stats.seRows += T.seRows; stats.seAndDeferralRows += T.qbiReach;
  if (p.advanced && p.advanced.transferOn) stats.transferOn++; if (p.limitPolicy === 'warn') stats.warn++;
  const x = M.exposures(T), mc = p.assumptions.method === 'monteCarlo', out = {};
  const name1 = (list, f) => {
    if (!list.length) return null;
    const paths = [...new Set(list.map((e) => e.path))].sort((a, b) => a - b), first = list.find((e) => e.path === paths[0]);
    return (mc ? 'Monte Carlo: ' + paths.length + ' of ' + p.assumptions.runs + ' paths exposed: ' + paths.join(',') + '; first ' : '') + f(first);
  };
  out.excess = name1(x.excess, (e) => 'at ' + e.age + ' (' + e.owner + '): traditional left ' + money(e.tradLeft) + ', Roth left ' + money(e.rothLeft) + ', room ' + money(e.roomT) + '/' + money(e.roomR) + '; Roth excess carried ' + money(e.rothCarriedMore) + ' more');
  out.qbi = name1(x.qbi, (e) => 'at ' + e.age + ': qbiCut ' + money(e.qbiCutOld) + ' -> ' + money(e.qbiCutNew) + ', first estimate ' + money(e.taxDelta));
  out.pool = name1(x.pool, (e) => 'at ' + e.age + ': ' + e.from + ' -> ' + e.to + ', ' + money(e.moved) + ' moved, basis ' + money(e.basisMoved) + ' follows');
  out.conv = name1(x.conv, (e) => 'tax year ' + e.yi + ' (' + e.owner + ', ' + e.via + ' from the ' + e.pool + ' pool): ' + money(e.amount) + ' converted, nontaxable ' + money(e.provisionalNt) + ' -> ' + money(e.settledNt) + '; later early Roth IRA draws in its five years: ' + e.laterEarlyRothDraws + (e.laterEarlyRothDraws ? ' (' + money(e.laterEarlyRothDrawAmount) + ')' : '') + (p.retirement.withdrawalOrder !== 'manual' ? '; rule-based order (rothNextDollarWeight reads the ledger)' : ''));
  const v = validateScenario(JSON.parse(JSON.stringify(p))), refused = v.issues.some((i) => i.code === 'TRANSFER_BETWEEN_OWNERS');
  out.validator = refused && M.r52TransferAccepted(p) ? 'TRANSFER_BETWEEN_OWNERS lifted' : null;
  return out;
}
const KINDS = ['excess', 'qbi', 'pool', 'conv', 'validator'];
for (const comp of ['control', 'expanded']) {
  const entries = cap.corpusWithDiagnostics({ composition: comp }).entries, movers = Object.fromEntries(KINDS.map((k) => [k, []]));
  Object.keys(stats).forEach((k) => { stats[k] = 0; });
  for (const e of entries) { const s = scan(e.name, e.plan); KINDS.forEach((k) => { if (s[k]) movers[k].push(e.name + ' [' + s[k] + ']'); }); }
  console.log('== ' + comp + ' (' + entries.length + ' plans; taps output-neutral on all)');
  console.log('  reach: ' + JSON.stringify(stats));
  KINDS.forEach((k) => console.log('  ' + k + ' (' + movers[k].length + '): ' + (movers[k].length ? '\n    ' + movers[k].join('\n    ') : 'none -- no corpus exposure')));
}
