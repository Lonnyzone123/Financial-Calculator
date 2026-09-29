// TAXFED-05: the capital-loss carryover treats the OBBBA senior deduction as reducing the income that absorbs the year's loss.
// IRC 1212(b)(2)(B) measures the loss used against "adjusted taxable income": taxable income increased by the 1211(b) amount AND
// "(ii) the deduction allowed for such year under section 151". The senior deduction is allowed under section 151(d)(5)(C).
// The engine adds back only the 1211(b) amount, so in a low-income senior year it treats less of the loss as used and carries
// more forward than the statute allows.   Run: node repro-TAXFED-05-carryover-senior.js
'use strict';
const h = require('../harness.js');
const ref = require('./ref.js');
const E = h.engine;
// ---- 1. Direct: one year, single, 70, pension 20,000, loss carried in 10,000, no gains ----------------------------------------
const pe = { profile: { filing: 'single', age: 70, spouseOn: false }, retirement: { selfLife: 110 } };
const d = E.estimateTaxes(pe, 70, 20000, 0, 0, 0, 0, 0, 0, 0, 0, 10000);
// Hand: net capital -10,000; 1211(b) deduction 3,000; AGI 17,000; deductions 16,100 + 2,050 + 6,000 (senior, MAGI < 75,000) = 24,150;
// taxable income (negative allowed, 1212(b)(2)(B) last sentence) = 17,000 - 24,150 = -7,150;
// adjusted taxable income = -7,150 + 3,000 (1211(b)) + 6,000 (section 151 senior deduction) = 1,850;
// loss used = min(3,000, 1,850) = 1,850; carryover = 10,000 - 1,850 = 8,150.
// (Without the section 151 add-back: -7,150 + 3,000 = -4,150 -> 0 used -> 10,000 carried: the engine's figure.)
console.log(JSON.stringify({ direct: true, engineCarryOut: d.capitalLossCarryOut, handCarryOut: 8150, over: d.capitalLossCarryOut - 8150 }));
// ---- 2. Whole plan: the overstated carry lowers the next year's tax on a gain ---------------------------------------------------
const p = h.plan({ years: 2, retireAge: 70, pension: 20000, amount: 0 });
p.profile.age = 70; p.profile.retireAge = 70; p.profile.endAge = 72;
p.employment.contributionStop = 70;
Object.assign(p.retirement, { dividendStart: 70, selfLife: 100, spending: 30000, strategy: 'fixedNominal', manualOrder: 'taxable,preTax,roth,hsa',
  expenses: [{ name: 'Year-2 purchase', age: 71, amount: 70000 }],
  otherIncomes: [{ name: 'Consulting', type: 'other', owner: 'self', amount: 60000, start: 71, end: 72, growth: 0, growthMode: 'fixed' }] });
p.advanced.transferOn = false;
// Year 1 draws the 10,000 'loss' account (basis 23,000: a 13,000 loss); year 2 draws the zero-basis 'gain' account.
p.accounts = [h.account('loss', 'taxable', 10000, { basisPct: 230, priority: 1 }), h.account('gain', 'taxable', 500000, { basisPct: 0, priority: 2 })];
const v = h.validateScenario(structuredClone(p));
const r = h.run(p);
const y1 = r.rows[1], y2 = r.rows[2];
// Year 1 by hand: loss 13,000; 1211(b) 3,000; AGI 17,000; tax 0 federal, Arizona 2.5% x max(0, 17,000 - 16,100 - 2,100) = 0.
//   Statutory carry: adjusted TI = 17,000 - 24,150 + 3,000 + 6,000 = 1,850 -> used 1,850 -> carry 11,150 (engine: 13,000).
// Year 2 by hand: ordinary 80,000 (pension + consulting); outside income 80,000 against spending 100,000, so the 'gain' account
// sells G (all gain) with G = 20,000 + tax(G). Tax = federal (ref.js, carry 11,150) + Arizona 2.5% x (AGI - 16,100 - 2,100).
function tax2(G, carry) { const f = ref.federal({ f: 'single', ages: [71, -1], ordinary: 80000, gains: G, carry });
  return f.incomeTax + f.niit + .025 * Math.max(0, f.agi - 16100 - 2100); }
function solve(carry) { let lo = 0, hi = 200000; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (m - 20000 - tax2(m, carry) > 0) hi = m; else lo = m; } return lo; }
const Gstat = solve(11150), Geng = solve(13000);
console.log(JSON.stringify({ valid: v.valid, status: r.status, year1: { agi: y1.federalAgi, taxes: y1.taxes, withdrawals: y1.withdrawals },
  year2: { agi: y2.federalAgi, engineTaxes: y2.taxes, engineWithdrawals: y2.withdrawals },
  handStatutoryCarry11150: { gross: +Gstat.toFixed(2), taxes: +tax2(Gstat, 11150).toFixed(2) },
  handWithEngineCarry13000: { gross: +Geng.toFixed(2), taxes: +tax2(Geng, 13000).toFixed(2) },
  year2TaxUnderstated: +(tax2(Gstat, 11150) - y2.taxes).toFixed(2) }));
console.log('TERMINATOR repro-TAXFED-05 done');
