'use strict';
// TAX-FED-01: later-year indexing inflates the IRA deduction (and Roth) phase-out RANGE WIDTH, which the statute fixes.
// IRC 219(g)(2)(A)(ii): the denominator is "$10,000 ($20,000 in the case of a joint return)"; 219(g)(7)(B): $10,000 for the
// spouse-only range; 219(g)(8) indexes only the applicable dollar amounts (the starts). 408A(c)(3)(A)(ii): $15,000 ($10,000 joint).
// Run: node repro-TAX-FED-01-phaseout-width-indexed.js
const h = require('../harness.js'); const g = h.grid;
const p = g.basePlan({ age: 25, retireAge: 65, endAge: 47, inflation: 3, salary: 156000, spending: 0,
  accounts: [g.account('k', 'traditional401k', 0, { contribution: 1000 }), g.account('ira', 'traditionalIRA', 0, { contribution: 7500 })] });
p.employment.contributionStop = 65;
const v = h.validateScenario(structuredClone(p));
const r = h.engine.runPlan(structuredClone(p));
console.log('validateScenario.valid', v.valid, '| runPlan status', r.status);
// Hand expectation, computed here from the statute (2026 base, the model's declared convention), not from the engine.
const down = (x, m) => Math.floor(x / m + 1e-9) * m, near = (x, m) => Math.floor(x / m + 0.5 + 1e-9) * m;
function regTax(ti, e) { const rates = [0.10, 0.12, 0.22, 0.24]; let t = 0, prev = 0; for (let i = 0; i < 4; i++) { const cap = e[i]; if (ti > prev) t += (Math.min(ti, cap) - prev) * rates[i]; prev = cap; } return t; }
for (const yi of [19, 20]) {
  const f = Math.pow(1.03, yi), row = r.rows[yi + 1];
  const start = 81000 + near(81000 * (f - 1), 1000), end = start + 10000;            // 219(g)(8) + 219(g)(2)(A)(ii)
  const L = down(7500 * f, 500);                                                     // 219(b)(5)(C)
  const magi = 156000 - 1000;
  const lim = magi >= end ? 0 : magi <= start ? L : Math.max(200, L - down(L * (magi - start) / 10000, 10));
  const ded = Math.min(7500, lim);
  const agi = magi - ded;
  const std = 16100 + down(16100 * (f - 1), 50);
  const br = [12400, 50400, 105700, 201775].map(b => b + down(b * (f - 1), 50));
  const ti = Math.max(0, agi - std);
  const fed = regTax(ti, br), az = 0.025 * Math.max(0, agi - std), fica = 0.062 * 156000 + 0.0145 * 156000;
  console.log(`row closing ${row.age} (tax year ${2026 + yi}): law range ${start}-${end}, IRA limit ${L}, deduction ${ded}, AGI ${agi}, taxes ${(fed + az + fica).toFixed(2)}`);
  console.log(`   engine: AGI ${row.federalAgi}, deduction ${magi - row.federalAgi}, taxes ${row.taxes.toFixed(2)}  -> taxes understated by ${(fed + az + fica - row.taxes).toFixed(2)}`);
}
const R = h.engine.taxYearRules(h.RULES, Math.pow(1.03, 20), 1, 20, 1.03);
const rec = Object.fromEntries(R.retirement.ira.deductionPhaseout.records.map(x => [x.provision_id.replace('ira_deduction_phaseout_', ''), x.value]));
console.log('engine indexed ranges, tax year 2046 (3% inflation):');
console.log('  single active', rec.start_single_or_hoh_active, '-', rec.end_single_or_hoh_active, 'width', rec.end_single_or_hoh_active - rec.start_single_or_hoh_active, '(statute 10,000)');
console.log('  mfj contributor active', rec.start_mfj_contributor_active, '-', rec.end_mfj_contributor_active, 'width', rec.end_mfj_contributor_active - rec.start_mfj_contributor_active, '(statute 20,000)');
console.log('  mfj spouse-only', rec.start_mfj_spouse_only_active, '-', rec.end_mfj_spouse_only_active, 'width', rec.end_mfj_spouse_only_active - rec.start_mfj_spouse_only_active, '(statute 10,000)');
const ro = R.retirement.ira.rothPhaseout;
console.log('  Roth single', ro.single.join('-'), 'width', ro.single[1] - ro.single[0], '(statute 15,000); Roth mfj', ro.mfj.join('-'), 'width', ro.mfj[1] - ro.mfj[0], '(statute 10,000)');
const R1 = h.engine.taxYearRules(h.RULES, 1.03, 1, 1, 1.03).retirement.ira.deductionPhaseout.records;
console.log('  already in tax year 2027: single', R1[0].value, '-', R1[1].value, 'width', R1[1].value - R1[0].value);
console.log('REPRO DONE');
