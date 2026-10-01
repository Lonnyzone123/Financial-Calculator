'use strict';
// Independent per-row model of health + Medicare + IRMAA + Part D + deterministic LTC against row.spending (spending 0).
const { h, base, income } = require('./common.js');
let seed = Number(process.argv[2] || 7);
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];
const near = (x, m) => Math.floor(x / m + .5 + 1e-9) * m;
const PB = [202.9, 284.1, 405.8, 527.5, 649.2, 689.9], PD = [0, 14.5, 37.5, 60.4, 83.3, 91];
const S = [109000, 137000, 171000, 205000, 500000], J = [218000, 274000, 342000, 410000, 750000];
function thresholds(k, infl, joint, lawJoint) {
  const f = Math.pow(1 + infl, k), f1 = 1 + infl, top = k >= 2 ? f / f1 : 1;
  const single = S.map((v, i) => i === 4 ? near(v * top, 1000) : near(v * f, 1000));
  if (!joint) return single;
  if (lawJoint) return single.map((v, i) => i === 4 ? 1.5 * v : 2 * v);
  return J.map((v, i) => i === 4 ? near(v * top, 1000) : near(v * f, 1000));
}
function tier(magi, th) { let i = 0; while (i < th.length && (i === th.length - 1 ? magi >= th[i] : magi > th[i])) i++; return i; }
let n = 0, bad = 0, badLaw = 0, refused = 0;
const N = Number(process.argv[3] || 400);
for (let t = 0; t < N; t++) {
  const spouseOn = rnd() < .6;
  const age = pick([60, 62, 63, 63.5, 64, 64.25, 64.5, 65, 66, 67.7, 70]);
  const spouseAge = pick([58, 61.3, 63, 64, 64.6, 65, 66.2, 68]);
  const filing = spouseOn ? pick(['mfj', 'mfj', 'mfj', 'single', 'hoh']) : pick(['single', 'hoh']);
  const retireAge = pick([age, age, Math.floor(age) + 1, 60, Math.floor(age) + 2.5]);
  const endAge = Math.floor(age) + pick([4, 6, 8]) + pick([0, 0, 0.5]);
  const selfLife = pick([100, 100, Math.floor(age) + 2, Math.floor(age) + 3.4]);
  const spouseLife = pick([100, 100, Math.floor(spouseAge) + 2, Math.floor(spouseAge) + 4.6]);
  const p = base({ age, endAge, retireAge: Math.max(retireAge, age), filing, spouseOn, spouseAge, selfLife, spouseLife });
  const infl = pick([0, 0.02, 0.025, 0.031]);
  p.assumptions.inflation = infl * 100;
  const hi = pick([0, 5.5, 3]);
  Object.assign(p.advanced, { healthOn: true, healthCost: pick([0, 12000, 20000]), healthInflation: hi });
  if (rnd() < .4) { p.advanced.irmaaMagiTwoYearsBefore = pick([90000, 150000, 230000, 520000]); p.advanced.irmaaMagiOneYearBefore = pick([100000, 300000, 800000]);
    if (rnd() < .5) { p.advanced.irmaaFilingTwoYearsBefore = pick(['single', 'mfj', 'hoh']); p.advanced.irmaaFilingOneYearBefore = pick(['single', 'mfj']); } }
  const ltc = rnd() < .4;
  if (ltc) Object.assign(p.advanced, { ltcOn: true, ltcCost: 90000, ltcInsurance: pick([0, 30000]), ltcProbability: pick([25, 100]), ltcYears: pick([2, 3]) });
  income(p, 'pension', pick([60000, 120000, 160000, 250000, 400000, 600000]), spouseOn ? pick(['self', 'spouse']) : 'self');
  const v = h.validateScenario(structuredClone(p));
  if (!v.valid) { refused++; continue; }
  const r = h.engine.runPlan(structuredClone(p));
  if (r.status !== 'ok') { refused++; console.log('STATUS', r.status, r.calculationErrorCode); continue; }
  const errs = (r.issues || []).filter(i => i.severity === 'ERROR'); if (errs.length) console.log('ERR', JSON.stringify(errs).slice(0, 200));
  const start = age, hist = [], fh = [];
  const preMagi = p.advanced.irmaaMagiTwoYearsBefore != null;
  const curFiling = a => { if (filing !== 'mfj') return filing; const sd = selfLife < a, pd = spouseOn && spouseLife < spouseAge + (a - start); return spouseOn && (sd || pd) ? 'single' : 'mfj'; };
  if (preMagi) { hist.push(p.advanced.irmaaMagiTwoYearsBefore, p.advanced.irmaaMagiOneYearBefore); fh.push(p.advanced.irmaaFilingTwoYearsBefore || curFiling(start), p.advanced.irmaaFilingOneYearBefore || curFiling(start)); }
  const ltcStart = ltc ? Math.max(65, Math.round(Math.max(retireAge, age) + 10)) : null;
  for (let k = 1; k < r.rows.length; k++) {
    const row = r.rows[k], a = r.rows[k - 1].age, b = row.age, d = b - a, rd = Math.max(0, b - Math.max(a, Math.max(retireAge, age)));
    const sAlive = !(selfLife < a), sa = spouseAge + (a - start), pAlive = spouseOn && !(spouseLife < sa);
    const ages = spouseOn ? [sAlive ? a : -1, pAlive ? sa : -1] : [a];
    const pre = ages.filter(x => x >= 0 && x < 65).length, med = ages.filter(x => x >= 65).length;
    let exp = 0, expLaw = 0;
    if (rd > 0) {
      if (pre) exp += p.advanced.healthCost * Math.pow(1 + hi / 100, a - start) * rd * pre / (spouseOn ? 2 : 1);
      expLaw = exp;
      if (med) {
        const lb = hist.length >= 2 ? hist[hist.length - 2] : 0, lf = fh.length >= 2 ? fh[fh.length - 2] : curFiling(a);
        const ti = tier(lb, thresholds(k - 1, infl, lf === 'mfj', false)), tl = tier(lb, thresholds(k - 1, infl, lf === 'mfj', true));
        exp += ((PB[ti] + PD[ti]) * 12 + 283 + 38.99 * 12) * med * rd;
        expLaw += ((PB[tl] + PD[tl]) * 12 + 283 + 38.99 * 12) * med * rd;
      }
    }
    if (ltc) { const dur = Math.max(0, Math.min(b, ltcStart + p.advanced.ltcYears) - Math.max(a, ltcStart)); const c = Math.max(0, 90000 * Math.pow(1 + hi / 100, a - start) - p.advanced.ltcInsurance) * dur * p.advanced.ltcProbability / 100; exp += c; expLaw += c; }
    let m = row.irmaaMagi; if (k === 1 && d < 1 - 1e-9) m = m + (1 - d) * (preMagi ? p.advanced.irmaaMagiOneYearBefore : m / d);
    hist.push(m); fh.push(curFiling(a));
    n++;
    if (Math.abs(row.spending - exp) > 0.01) { bad++; if (bad < 15) console.log('MISMATCH t' + t, JSON.stringify({ age, spouseAge, filing, retireAge, selfLife, spouseLife, infl, row: b, exp: +exp.toFixed(2), got: +row.spending.toFixed(2) })); }
    if (Math.abs(row.spending - expLaw) > 0.01) { badLaw++; if (badLaw < 6) console.log('LAWJOINT diff t' + t, JSON.stringify({ infl, row: b, k, magiLook: hist[hist.length - 3], expLaw: +expLaw.toFixed(2), got: +row.spending.toFixed(2) })); }
  }
}
console.log('SUMMARY rows=' + n + ' mismatches=' + bad + ' lawJointDiffs=' + badLaw + ' refused=' + refused);
