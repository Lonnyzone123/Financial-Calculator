/* S5AA R50 C1 check, after the build: the prediction scan mirrored the ledger because the engine had none. This holds the scan's
   mirror to the engine's own helpers on the head tree: the opening ledger (newRothLedger()) on every corpus plan, and the ordering
   (rothIraTake() and rothQualified()) on a grid of ledgers, draws, ages and years.
   Usage: node audit/S5AA/R50/prediction/r50_c1_check.js [<head tree>] */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));

// The scan's mirror, copied from r50_corpus_scan.js as committed in the prediction.
const key = (o) => (o === 'spouse' ? 'spouse' : 'self');
function freshLedger(p) {
  const L = {};
  ['self', 'spouse'].forEach((o) => {
    const own = (p.accounts || []).filter((a) => a && a.type === 'rothIRA' && key(a.owner) === o);
    const basis = own.reduce((s, a) => s + Math.max(0, Number(a.contributionBasis) || 0), 0);
    const bal = own.reduce((s, a) => s + Math.max(0, Number(a.balance) || 0), 0);
    L[o] = { basis, conv: [], first: bal > 0 || basis > 0 ? -Infinity : null };
  });
  return L;
}
function distribute(led, w, age, yi, penaltyException) {
  const qualified = age >= 59.5 && led.first !== null && yi >= led.first + 5, early = age < 59.5 && !penaltyException;
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
  return { income, penalized, qualified };
}

let plans = 0, openingMismatch = [];
for (const comp of ['expanded']) {
  for (const e of cap.corpusWithDiagnostics({ composition: comp }).entries) {
    plans++;
    const mine = freshLedger(e.plan), eng = E.newRothLedger(e.plan, e.plan.accounts, null);
    for (const o of ['self', 'spouse']) {
      if (mine[o].basis !== eng[o].basis || mine[o].first !== eng[o].first) openingMismatch.push(e.name + ' ' + o + ': scan ' + JSON.stringify(mine[o]) + ' engine ' + JSON.stringify({ basis: eng[o].basis, first: eng[o].first }));
    }
  }
}
console.log('opening ledger: ' + plans + ' corpus plans, ' + (plans - openingMismatch.length) + ' equal' + (openingMismatch.length ? '\n  ' + openingMismatch.join('\n  ') : ''));

let cases = 0, orderMismatch = [];
const grid = { basis: [0, 5000, 20000], conv: [[], [{ year: 0, taxable: 8000, nt: 2000 }], [{ year: -6, taxable: 5000, nt: 0 }, { year: 3, taxable: 4000, nt: 1000 }]],
  first: [null, -Infinity, -2, 1], w: [1000, 12000, 40000], age: [45, 59.4, 59.5, 70], yi: [0, 4, 5, 9], penEx: [false, true] };
for (const basis of grid.basis) for (const conv of grid.conv) for (const first of grid.first) for (const w of grid.w) for (const age of grid.age) for (const yi of grid.yi) for (const penEx of grid.penEx) {
  cases++;
  const led = { basis, conv: conv.map((c) => ({ year: c.year, taxable: c.taxable, nt: c.nt })), first };
  const m = distribute(led, w, age, yi, penEx);
  const L = { yi, self: { basis, conv: conv.map((c) => ({ year: c.year, taxable: c.taxable, nontaxable: c.nt })), first } };
  const q = E.rothQualified(L, 'self', age), t = E.rothIraTake(L.self, w, q, yi);
  const rate = age < 59.5 && !penEx ? 1 : 0;   // what earlyWithdrawalPenaltyRate() gives a Roth IRA, as 0.10 = 10% x this
  const inc = t.segs.reduce((s, x) => s + x.inc * x.amount, 0), pen = t.segs.reduce((s, x) => s + x.pen * x.amount, 0) * rate;
  if (q !== m.qualified || Math.abs(inc - m.income) > 1e-6 || Math.abs(pen - m.penalized) > 1e-6) orderMismatch.push(JSON.stringify({ basis, conv, first, w, age, yi, penEx, scan: m, engine: { q, inc, pen } }));
}
console.log('ordering: ' + cases + ' cases, ' + (cases - orderMismatch.length) + ' equal' + (orderMismatch.length ? '\n  ' + orderMismatch.slice(0, 5).join('\n  ') : ''));
