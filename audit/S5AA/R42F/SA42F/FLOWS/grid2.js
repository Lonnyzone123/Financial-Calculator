'use strict';
// R42F FLOWS: the R40 conservation grid, EXTENDED. Same reconciler (R40 lib.js, tapped engine variant, output-neutral), the R40
// generator for the base plan, then extra features layered on: deaths inside rows (fractional lifespans, survivor reduction),
// fractional end ages, half-age stages, fallback assets available at half ages, a cash holding drawn last, reserve and bond tent,
// a scheduled transfer, dividends with yield growth and start inside rows, surplus policies per source, historical method,
// guyton skip, flexibility, and the 4 orders.
// Usage: node grid2.js [count] [seed]
const path = require('path');
const GDIR = (require('path').join(__dirname, '..', '..', '..', '..', '..') + "/audit/S5AA/R40/S5AA_R40_CONSERVATION_GRID");
const L = require(path.join(GDIR, 'lib.js'));
const saved = process.argv.slice(2);
process.argv.length = 2; process.argv.push(String(saved[0] || 300), String(Number(saved[1] || 777001) + 1)); // the base generator is seeded too
const { genPlan } = require(path.join(GDIR, 'grid.js'));
const N = Number(saved[0] || 300), SEED = Number(saved[1] || 777001);
function rng(seed) { let x = seed >>> 0; return () => { x += 0x6D2B79F5; let t = x; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = rng(SEED);
const pick = a => a[Math.floor(R() * a.length)];
const chance = q => R() < q;
function extend(p) {
  const pr = p.profile, rt = p.retirement, adv = p.advanced, a0 = pr.age;
  const tags = [];
  if (chance(0.35)) { rt.selfLife = a0 + pick([3.5, 8, 12.25, 20.5]); tags.push('selfDeath'); }
  if (pr.spouseOn && chance(0.35)) { rt.spouseLife = pr.spouseAge + pick([2.5, 9, 15.75]); tags.push('spouseDeath'); }
  if (pr.spouseOn && chance(0.5)) { rt.survivor = true; rt.survivorSpendingReduction = pick([0, 20, 40]); }
  if (chance(0.3)) { pr.endAge = Math.min(104.5, Math.floor(pr.endAge) + pick([0.25, 0.5, 0.75])); tags.push('fracEnd'); }
  if (chance(0.3)) { rt.stages = (rt.stages || []).concat([{ name: 'Half', start: pr.retireAge + pick([0.5, 1.5, 2.25]), end: pr.retireAge + pick([3.5, 6]), mode: pick(['percent', 'amount']), value: pick([80, 130, 45000]), growthMode: pick(['inflation', 'fixed', 'none']), annualChange: 1 }]); tags.push('halfStage'); }
  if (chance(0.25)) { adv.networthOn = true; rt.homeEquityFallback = true; adv.otherAssets = [{ id: 'cabin', name: 'Cabin', type: 'realEstate', owner: 'self', value: 250000, growth: pick([0, 2]), available: true, availableAge: a0 + pick([0, 1.5, 4.5]), accessPct: pick([30, 100]), liquidity: pick(['liquid', 'illiquid']) }]; tags.push('fallback'); }
  if (chance(0.3)) { adv.retainedCashOrder = 'last'; }
  if (chance(0.15)) { adv.reserveOn = true; adv.reserveYears = pick([1, 3]); tags.push('reserve'); }
  if (chance(0.15)) { adv.bondTentOn = true; adv.bondTent = pick([30, 60]); tags.push('tent'); }
  if (chance(0.3)) { rt.dividendGrowth = pick([-2, 3]); rt.dividendStart = pr.retireAge + pick([0.5, 2.25, -3]); tags.push('divGrowth'); }
  if (chance(0.25)) { rt.guytonSkipInflation = chance(0.5); rt.flexibility = pick([0, 15]); }
  if (chance(0.2) && p.accounts.length >= 2) {
    const ids = p.accounts.map(a => a.id); adv.transferOn = true; adv.transferFrom = pick(ids); adv.transferTo = pick(ids.filter(x => x !== adv.transferFrom));
    adv.transferAmount = pick([5000, 40000]); adv.transferAge = a0 + pick([0.5, 1.25, 2]); tags.push('transfer'); }
  if (chance(0.25)) { p.assumptions.method = 'historical'; p.assumptions.historyStart = pick([1929, 1966, 1973, 2000]); p.assumptions.rollingHistory = false; tags.push('historical'); }
  if (chance(0.25)) { adv.surplusPolicyBySource = { rmd: pick(['invest', 'retain', 'spend']), pension: pick(['invest', 'retain', 'spend']), socialSecurity: pick(['invest', 'spend']), dividends: pick(['retain', 'spend']), otherIncome: pick(['invest', 'retain']) }; tags.push('bySource'); }
  if (chance(0.2)) { rt.expenses = (rt.expenses || []).concat([{ name: 'End', kind: 'expense', age: Math.floor(pr.endAge * 2) / 2 - 0.5, amount: 30000 }]); tags.push('lateExpense'); }
  return tags;
}
const stats = { plans: 0, invalid: 0, notOk: 0, rows: 0, worst: { portfolio: 0, household: 0, combined: 0 }, fails: [], cls: {}, invalidCodes: {}, notOkCodes: {}, tags: {} };
for (let k = 0; k < N; k++) {
  const p = genPlan(k);
  const tags = extend(p);
  let x;
  try { x = L.runTapped(p); } catch (e) { stats.fails.push({ k, tags, crash: String(e && e.stack || e).slice(0, 300) }); continue; }
  if (!x.valid) { stats.invalid++; x.invalid.forEach(i => stats.invalidCodes[i.code] = (stats.invalidCodes[i.code] || 0) + 1); continue; }
  stats.plans++; tags.forEach(t => stats.tags[t] = (stats.tags[t] || 0) + 1);
  if (x.r.status !== 'ok') { stats.notOk++; stats.notOkCodes[x.r.calculationErrorCode] = (stats.notOkCodes[x.r.calculationErrorCode] || 0) + 1; stats.fails.push({ k, tags, status: x.r.status, code: x.r.calculationErrorCode }); continue; }
  const rec = L.reconcile(x.r, x.taps, p);
  // totals / contract checks
  const rows = x.r.rows, bad = [];
  let infl = 1;
  rows.forEach((z, i) => {
    if (Math.abs(z.realTotal - z.total / z.inflationFactor) > 1e-6 * Math.max(1, Math.abs(z.total))) bad.push('realTotal@' + z.age);
    if (Math.abs(z.total - (z.taxable + z.preTax + z.roth + z.hsa)) > 0.01) bad.push('class@' + z.age);
    if (i > 0 && p.assumptions.method === 'simple') { infl *= Math.pow(1 + p.assumptions.inflation / 100, z.age - rows[i - 1].age); if (Math.abs(z.inflationFactor - infl) > 1e-9 * infl) bad.push('inflationFactor@' + z.age); }
    if (i > 0 && z.spending < -1e-9) bad.push('negSpending@' + z.age);
    if (i > 0 && z.shortfall > z.spending + z.taxes + 0.01) bad.push('shortfall>uses@' + z.age);
    ['taxable', 'preTax', 'roth', 'hsa', 'total'].forEach(f => { if (z[f] < -0.01) bad.push('neg ' + f + '@' + z.age); });
  });
  const failed = rows.some(z => z.shortfall > 0.01);
  if (failed !== x.r.failed) bad.push('failed flag');
  if (bad.length) stats.fails.push({ k, tags, totals: bad.slice(0, 5) });
  stats.rows += rec.length;
  rec.forEach(q => {
    ['portfolio', 'household', 'combined'].forEach(f => {
      if (Math.abs(q[f]) > stats.worst[f]) stats.worst[f] = Math.abs(q[f]);
      if (Math.abs(q[f]) > q.tol) { const cls = (f !== 'portfolio' && Math.abs(Math.abs(q[f]) - q.clampGap) <= q.tol) ? 'WAGE_TAX_CLAMP' : 'LEAK'; stats.cls[cls] = (stats.cls[cls] || 0) + 1; if (cls === 'LEAK') stats.fails.push({ k, tags, age: q.age, kind: f, residual: q[f] }); }
    });
  });
}
console.log(JSON.stringify({ N, SEED, plansRun: stats.plans, invalid: stats.invalid, invalidCodes: stats.invalidCodes, notOk: stats.notOk, notOkCodes: stats.notOkCodes, rows: stats.rows,
  worst: stats.worst, classes: stats.cls, tags: stats.tags, failCount: stats.fails.length, firstFails: stats.fails.slice(0, 30) }, null, 1));
