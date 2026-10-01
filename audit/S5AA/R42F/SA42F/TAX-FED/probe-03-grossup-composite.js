'use strict';
// Composite gross-up witness: the engine's IRA draw W must satisfy cash in = spending + tax(W) + penalty(W), with tax from ref.js.
const h = require('../harness.js'); const g = h.grid; const ref = require('./ref.js');
function az(agi, tss, n65, fs) { const std = { single: 16100, mfj: 32200, hoh: 24150 }[fs]; return 0.025 * Math.max(0, agi - tss - std - 2100 * n65); }
function check(label, o, streams, accts, opts) {
  const p = g.basePlan(Object.assign({ spending: 100000, accounts: accts, otherIncomes: streams, manualOrder: 'preTax,taxable,roth,hsa' }, o));
  const v = h.validateScenario(structuredClone(p)); const r = h.engine.runPlan(structuredClone(p)); const row = r.rows[1];
  const W = row.withdrawals, qd = row.dividends;
  const x = Object.assign({ ordinary: W + opts.ordinaryOther, qd: opts.qd(row, p), cg: 0, carry: 0 }, opts.x);
  const t = ref.federal(x); const azt = az(t.agi, t.tss, opts.n65, x.fs); const pen = opts.pen ? 0.1 * W : 0;
  const cashIn = opts.cashOther + W, uses = row.spending + t.total + azt + pen;
  console.log(label, 'valid', v.valid, r.status, 'W', W.toFixed(2), 'divs', qd.toFixed(2), 'engine taxes', row.taxes.toFixed(2), 'ref taxes', (t.total + azt + pen).toFixed(2), 'agi eng/ref', row.federalAgi.toFixed(2), t.agi.toFixed(2), 'funding gap', (cashIn - uses).toFixed(4), (r.issues || []).map(i => i.code).join(','));
}
const s = (type, amount, extra) => Object.assign({ id: type + amount, name: type, type, amount, start: 0, end: 120, owner: 'self', growthMode: 'fixed', growth: 0 }, extra || {});
// A: single 57, SE 30k + rental 20k + SS stream 24k, IRA only, penalty applies
check('A single 57', { age: 57, retireAge: 57, endAge: 59 }, [s('selfEmployment', 30000), s('rental', 20000), s('socialSecurity', 24000)], [g.account('ira', 'traditionalIRA', 2e6)],
  { ordinaryOther: 50000, cashOther: 74000, qd: () => 0, pen: true, n65: 0, x: { fs: 'single', ages: [58], seSelf: 30000, ss: 24000, niiOther: 20000 } });
// B: single 64 -> 65 at close, same streams, no penalty
check('B single 64', { age: 64, retireAge: 64, endAge: 66 }, [s('selfEmployment', 30000), s('rental', 20000), s('socialSecurity', 24000)], [g.account('ira', 'traditionalIRA', 2e6)],
  { ordinaryOther: 50000, cashOther: 74000, qd: () => 0, pen: false, n65: 1, x: { fs: 'single', ages: [65], seSelf: 30000, ss: 24000, niiOther: 20000 } });
// C: couple mfj 66/63, big rental pushes NIIT, spending 300k
check('C couple', { age: 66, retireAge: 66, endAge: 68, couple: true, spouseAge: 63, spending: 300000 }, [s('rental', 150000), s('socialSecurity', 40000), s('selfEmployment', 60000, { owner: 'spouse' })], [g.account('ira', 'traditionalIRA', 5e6)],
  { ordinaryOther: 210000, cashOther: 250000, qd: () => 0, pen: false, n65: 1, x: { fs: 'mfj', ages: [67, 64], seSpouse: 60000, ss: 40000, niiOther: 150000 } });
