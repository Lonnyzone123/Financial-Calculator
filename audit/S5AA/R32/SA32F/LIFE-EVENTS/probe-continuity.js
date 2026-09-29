'use strict';
// Continuity across a death: with zero returns and no contributions, each row's total must move by income - spending - taxes.
const L = require('./lib.js');
const cases = [];
for (const who of ['self', 'spouse']) for (const lifeKind of ['whole', 'half', 'beforeStart', 'firstRow']) {
  const life = { whole: 78, half: 78.5, beforeStart: 73.5, firstRow: 74 }[lifeKind];
  const p = L.couple({ profile: { age: 74, spouseAge: 74, retireAge: 60, endAge: 84 },
    retirement: { ssBenefit: 2000, spouseSS: 1200, ssClaim: 67, spouseClaim: 67, spending: 70000, strategy: 'fixedNominal',
      survivorSpendingReduction: 25, selfLife: who === 'self' ? life : 90, spouseLife: who === 'spouse' ? life : 90 },
    advanced: { rmdOn: true, healthOn: true, healthCost: 10000, healthInflation: 0 },
    accounts: [L.h.account('cash', 'taxable', 20000, { cashHolding: true, allocation: {} }),
      L.h.account('iraS', 'traditionalIRA', 500000, { owner: 'self' }), L.h.account('iraP', 'traditionalIRA', 300000, { owner: 'spouse', }),
      L.h.account('rothP', 'rothIRA', 80000, { owner: 'spouse' }), L.h.account('hsaS', 'hsa', 20000, { owner: 'self' }),
      L.h.account('brk', 'taxable', 200000, { owner: 'joint', basisPct: 60 })] });
  const c = L.check(p); if (!c.valid) { console.log(who, lifeKind, JSON.stringify(c.errs)); continue; }
  const r = L.run(p);
  let worst = 0, at = null;
  for (let i = 1; i < r.rows.length; i++) {
    const a = r.rows[i - 1], b = r.rows[i];
    const d = b.total - a.total - (b.income - b.spending - b.taxes + b.contributions - (b.debtPayments || 0));
    if (Math.abs(d) > Math.abs(worst)) { worst = d; at = b.age; }
  }
  cases.push({ who, lifeKind, rows: r.rows.length, lastAge: r.rows.at(-1).age, worstResidual: +worst.toFixed(4), at,
    rmd: r.rows.slice(1, 8).map(x => Math.round(x.rmd)).join('/'), spend: r.rows.slice(1, 8).map(x => Math.round(x.spending)).join('/') });
}
console.table(cases);
