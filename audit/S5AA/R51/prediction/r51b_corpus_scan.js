/* S5AA R51 addendum prediction scan (rules in r51b_mirror.js). Run on the tree BEFORE the addendum's edits (678c60f).
   Usage: node audit/S5AA/R51/prediction/r51b_corpus_scan.js [<tree>]
   C1: read-only taps; the variant's rows are asserted equal to the real engine's for every plan, and today's working-years issue
   (age, shortfall) is re-derived from the tapped pay and asserted equal to the engine's.
   Roth weight: a plan is exposed where, at some call of smartWithdrawalOrder() with a Roth balance, the class order under the new
   weight differs from today's (necessary: an order that never changes cannot move a draw; once one changes, everything after may).
   Monte Carlo: every path, with the engine's own seeding, named. Working-years: the first warned row today and under the rule. */
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
const M = require('./r51b_mirror.js');
const T = { on: false, path: -1, roth: [], work: [], draw: [] };
globalThis.__R51B = T;
const V = M.makeVariant(loadEngineVariant, '__R51B');
const money = (x) => (x < 0 ? '-' : '') + '$' + Math.abs(Math.round(x * 100) / 100).toLocaleString('en-US');
function scan(name, p) {
  T.on = true; T.path = -1; T.roth = []; T.work = []; T.draw = [];
  let rv;
  try { rv = V.runPlan(JSON.parse(JSON.stringify(p))); } finally { T.on = false; }
  const r = E.runPlan(JSON.parse(JSON.stringify(p)));
  if (JSON.stringify(rv.rows) !== JSON.stringify(r.rows) || rv.successRate !== r.successRate) throw new Error(name + ': taps not output-neutral');
  const out = { roth: [], working: [] }, mc = p.assumptions.method === 'monteCarlo';
  const flips = T.roth.filter((x) => x.rothBal > 1e-9 && x.orderOld !== x.orderNew);
  if (flips.length) {
    const paths = [...new Set(flips.map((x) => x.path))].sort((a, b) => a - b), f0 = flips.filter((x) => x.path === Math.min(...paths))[0];
    out.roth.push((mc ? 'Monte Carlo: ' + paths.length + ' of ' + p.assumptions.runs + ' paths exposed: ' + paths.join(',') + '; ' : '') +
      'first at ' + f0.age + (mc ? ' (path ' + f0.path + ')' : '') + ': weight ' + +f0.old.toFixed(4) + ' -> ' + f0.neu + ', order ' + f0.orderOld + ' -> ' + f0.orderNew + '; ' + flips.filter((x) => x.path === f0.path).length + ' calls');
  }
  /* the draws in each flipped row: does a spending or tax-funding draw reach a class at or past the orders' common prefix? Those are
     the only readers of the order, so a path with no such row runs identically (a ranking of the exposed paths, never a removal: A-11). */
  const reachRows = (pi) => { const out2 = [];
    [...new Set(flips.filter((x) => x.path === pi).map((x) => x.age))].forEach((age) => {
      const fs2 = flips.filter((x) => x.path === pi && x.age === age), paid = T.draw.filter((d) => d.path === pi && d.age === age && d.amount > 1e-9);
      if (fs2.some((f) => { const o1 = f.orderOld.split(','), o2 = f.orderNew.split(','); let k = 0; while (k < o1.length && o1[k] === o2[k]) k++; return paid.some((d) => o1.indexOf(d.cls) >= k); })) out2.push({ age, paid });
    }); return out2; };
  if (flips.length) {
    const fpaths = [...new Set(flips.map((x) => x.path))].sort((x, y) => x - y), reached = fpaths.filter((pi) => reachRows(pi).length);
    const first = reached.length ? reachRows(reached[0])[0] : null;
    out.roth.push((mc ? 'ranked: a draw reaches past the prefix on ' + reached.length + ' of the exposed paths' + (reached.length ? ' (' + reached.join(',') + ')' : '') : (reached.length ? 'a draw reaches past the prefix' : 'no draw reaches past the prefix: predicted unchanged')) +
      (first ? '; first at ' + first.age + (mc ? ' on path ' + reached[0] : '') + ': drawn ' + first.paid.map((d) => (d.tax ? 'tax ' : '') + d.cls + ' ' + money(d.amount) + (d.penalty > 0 ? ' (10% ' + money(d.penalty) + ')' : '') + (d.income > 0 ? ' (income ' + money(d.income) + ')' : '')).join(', ') : ''));
  }
  const w0 = T.work.filter((w) => w.path === 0), fo = w0.find((w) => w.ran && w.pay < -0.005), fn = w0.find((w) => w.ran && w.newPay < -0.005);
  const issue = (r.issues || []).find((i) => i.code === 'WORKING_YEARS_NOT_FUNDED_BY_PAY');
  if (!!fo !== !!issue || (issue && (issue.state.age !== fo.age || Math.abs(issue.state.shortfall + fo.pay) > 1e-6))) throw new Error(name + ': today\'s working-years mirror disagrees with the engine');
  const withStreams = w0.filter((w) => w.detail);
  if (!fo !== !fn || (fo && (fo.age !== fn.age || Math.abs(fn.newPay - fo.pay) > 1e-9))) {
    const d = (w, k) => (w ? 'age ' + w.age + ', short ' + money(-w[k]) : 'none');
    out.working.push(d(fo, 'pay') + ' -> ' + d(fn, 'newPay') + (withStreams.length ? ' (streams in ' + withStreams.length + ' working rows; first ' + withStreams[0].age + ': stream pay ' + money(withStreams[0].detail.streamPay) + ', their income tax ' + money(withStreams[0].detail.incomeTax * withStreams[0].detail.share) + ')' : ''));
  } else if (withStreams.length) out.working.push('(streams paid in ' + withStreams.length + ' working rows; the first shortfall does not move: ' + (fo ? 'age ' + fo.age : 'no warning') + ')');
  return out;
}
for (const comp of ['control', 'expanded']) {
  const entries = cap.corpusWithDiagnostics({ composition: comp }).entries, movers = { roth: [], working: [] };
  for (const e of entries) { const s = scan(e.name, e.plan); Object.keys(movers).forEach((k) => { if (s[k].length) movers[k].push(e.name + ' [' + s[k].join('; ') + ']'); }); }
  console.log('== ' + comp + ' (' + entries.length + ' plans)');
  Object.keys(movers).forEach((k) => console.log('  ' + k + ' (' + movers[k].length + '): ' + (movers[k].length ? '\n    ' + movers[k].join('\n    ') : 'none')));
}
