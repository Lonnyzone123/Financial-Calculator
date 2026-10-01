'use strict';
// Funding solver vs estimateTaxes across Arizona age-65 crossings, deaths, apart filing, fractional starts, health on.
const { h, base, income } = require('./common.js');
let seed = 3; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; const pick = a => a[Math.floor(rnd() * a.length)];
let runs = 0, bad = 0; const codes = {};
for (let t = 0; t < 300; t++) {
  const spouseOn = rnd() < .7, age = pick([62, 63.5, 64, 64.5, 66]), spouseAge = pick([61, 63.7, 64, 64.5, 67]);
  const p = base({ age, endAge: Math.floor(age) + pick([4, 6]) + pick([0, .5]), retireAge: age, filing: spouseOn ? pick(['mfj', 'mfj', 'hoh', 'single']) : pick(['single', 'hoh']), spouseOn, spouseAge,
    selfLife: pick([100, Math.floor(age) + 1.5, Math.floor(age) + 2]), spouseLife: pick([100, Math.floor(spouseAge) + 2.3]) });
  p.assumptions.inflation = pick([0, 2.5]);
  p.retirement.spending = pick([40000, 80000, 140000]);
  p.retirement.withdrawalOrder = 'manual'; p.retirement.manualOrder = pick(['preTax,taxable,roth,hsa', 'hsa,preTax,taxable,roth', 'taxable,preTax,roth,hsa']);
  p.accounts = [h.account('ira', 'traditionalIRA', 2000000), h.account('tx', 'taxable', 500000, { basisPct: 40 }),
    h.account('hsa', 'hsa', 100000, { qualifiedMedicalPct: pick([100, 60, 0]) })];
  if (spouseOn && rnd() < .5) p.accounts.push(h.account('sira', 'traditionalIRA', 800000, { owner: 'spouse' }));
  Object.assign(p.advanced, { healthOn: rnd() < .6, healthCost: 15000, healthInflation: 5 });
  if (rnd() < .5) income(p, 'socialSecurity' === 'x' ? 'pension' : 'pension', pick([20000, 60000]));
  if (rnd() < .5) p.retirement.ssBenefit = pick([24000, 36000]);
  const v = h.validateScenario(structuredClone(p));
  if (!v.valid) { codes['INVALID:' + v.issues.filter(i => i.severity === 'ERROR').map(i => i.code).join('|')] = (codes['INVALID'] || 0) + 1; continue; }
  const r = h.engine.runPlan(structuredClone(p)); runs++;
  const iss = (r.issues || []).filter(i => /SETTLEMENT|QUOTE|MISMATCH|UNVERIFIED/.test(i.code));
  if (r.status !== 'ok' || iss.length) { bad++; const k = r.status + ':' + (r.calculationErrorCode || '') + ':' + iss.map(i => i.code).join('|'); codes[k] = (codes[k] || 0) + 1; }
}
console.log('SUMMARY runs=' + runs + ' bad=' + bad + ' ' + JSON.stringify(codes));
