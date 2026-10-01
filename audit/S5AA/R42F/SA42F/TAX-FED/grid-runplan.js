'use strict';
// Random tax-heavy runPlan grid: counts statuses and issue codes (settlement / quote disagreements are the target).
const h = require('../harness.js'); const g = h.grid;
const N = Number(process.argv[2] || 600); let seed = Number(process.argv[3] || 11);
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];
const codes = {}, statuses = {}; let invalid = 0, ran = 0; const examples = {};
for (let i = 0; i < N; i++) {
  const couple = rnd() < 0.6, age = pick([50, 54.5, 57, 60, 63.5, 64.5, 66, 70, 72.5]), spouseAge = age + pick([-6, -2, 0, 3]);
  const s = (type, amount, extra) => Object.assign({ id: type + i + amount, name: type, type, amount, start: 0, end: 120, owner: pick(['self', couple ? 'spouse' : 'self']), growthMode: 'fixed', growth: 0 }, extra || {});
  const streams = [];
  if (rnd() < 0.35) streams.push(s('selfEmployment', pick([300, 20000, 90000, 250000])));
  if (rnd() < 0.35) streams.push(s('rental', pick([10000, 60000, 200000])));
  if (rnd() < 0.3) streams.push(s('pension', pick([15000, 60000])));
  if (rnd() < 0.2) streams.push(s('employment', pick([40000, 190000])));
  const accounts = [g.account('brok', 'taxable', pick([0, 50000, 400000, 2e6]), { basisPct: pick([20, 60, 100, 130]) }), g.account('ira', 'traditionalIRA', pick([0, 200000, 1.5e6])), g.account('roth', 'rothIRA', pick([0, 100000]))];
  if (couple) accounts.push(g.account('ira2', 'traditionalIRA', pick([0, 300000]), { owner: 'spouse' }));
  const p = g.basePlan({ age, couple, spouseAge, endAge: Math.min(age + pick([3, 8, 15]), 100) + pick([0, 0, 0.5]), retireAge: age + pick([0, 0, 1.5, 3]),
    salary: pick([0, 0, 80000, 220000]), spouseSalary: couple ? pick([0, 60000, 210000]) : 0, inflation: pick([0, 0, 2.5, 4]), returnRate: pick([0, 0, 5, -8]),
    spending: pick([30000, 70000, 150000, 300000]), dividendOn: rnd() < 0.4, otherIncomes: streams, accounts, ssBenefit: pick([0, 2000, 3500]), spouseSS: couple ? pick([0, 1500]) : 0,
    rmdOn: rnd() < 0.5, order: pick(['manual', 'optimized']), manualOrder: pick(['taxable,preTax,roth,hsa', 'preTax,taxable,roth,hsa']) });
  if (rnd() < 0.3) { p.retirement.spouseLife = couple ? spouseAge + pick([0.5, 2.3, 5]) : 120; }
  if (rnd() < 0.15) p.profile.filing = couple ? pick(['single', 'hoh']) : 'hoh';
  p.advanced.rule55 = rnd() < 0.3; p.retirement.ssClaim = pick([62, 67, 70]);
  const v = h.validateScenario(structuredClone(p)); if (!v.valid) { invalid++; continue; }
  const r = h.engine.runPlan(structuredClone(p)); ran++;
  statuses[r.status] = (statuses[r.status] || 0) + 1;
  for (const is of (r.issues || [])) { codes[is.code] = (codes[is.code] || 0) + 1; if (!examples[is.code]) examples[is.code] = i; }
  if (r.status !== 'ok' && !examples['status:' + r.status]) examples['status:' + r.status] = { i, code: r.calculationErrorCode };
}
console.log('ran', ran, 'invalid', invalid, JSON.stringify(statuses)); console.log(JSON.stringify(codes, null, 0)); console.log(JSON.stringify(examples));
console.log('GRID DONE');
