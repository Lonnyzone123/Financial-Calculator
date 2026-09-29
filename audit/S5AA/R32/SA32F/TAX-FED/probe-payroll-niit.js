// Payroll, self-employment and NIIT isolation checks, direct and in a plan.
'use strict';
const h = require('../harness.js');
const E = h.engine;
const P = (f, spouse) => ({ profile: { filing: f, age: 50, spouseOn: !!spouse, spouseAge: 50 }, retirement: { selfLife: 110, spouseLife: 110 } });
const cases = [
  // wages 150,000 + SE profit 100,000, single. Hand: SE net 92,350; OASDI room 184,500-150,000 = 34,500 -> 4,278; Medicare 2.9% x 92,350 = 2,678.15;
  // FICA 9,300 + 2,175; Additional Medicare 0.9% x (150,000 + 92,350 - 200,000) = 381.15. Payroll = 18,812.30. Half SE = 3,478.075.
  { label: 'wages+SE single', p: P('single'), args: [250000, 0, 0, 150000, 0, 0, 100000, 0, 0, 0], handPayroll: 18812.30, handHalfSE: 3478.075 },
  // SE profit 400 -> net 369.40 < 400 -> no SE tax.
  { label: 'SE under $400', p: P('single'), args: [400, 0, 0, 0, 0, 0, 400, 0, 0, 0], handPayroll: 0, handHalfSE: 0 },
  // MFJ two earners 200,000 each: OASDI 2 x 11,439 = 22,878; Medicare 0.0145 x 400,000 = 5,800; Add'l 0.9% x 150,000 = 1,350 -> 30,028
  { label: 'mfj two earners', p: P('mfj', true), args: [400000, 0, 0, 400000, 0, 200000, 0, 0, 0, 0], handPayroll: 30028, handHalfSE: 0 },
];
for (const c of cases) {
  const e = E.estimateTaxes(c.p, 50, ...c.args, 0);
  console.log(JSON.stringify({ label: c.label, enginePayroll: +e.payroll.toFixed(4), handPayroll: c.handPayroll, engineHalfSE: e.seDeductibleHalf, handHalfSE: c.handHalfSE }));
}
// NIIT: single, pension 100,000 + rental 150,000 (rental is NII). Hand: MAGI 250,000; excess over 200,000 = 50,000; NII 150,000; NIIT = 3.8% x 50,000 = 1,900.
const n1 = E.estimateTaxes(P('single'), 50, 250000, 0, 0, 0, 0, 0, 0, 0, 150000, 0);
console.log(JSON.stringify({ label: 'NIIT rental', engineNiit: n1.niit, hand: 1900 }));
// NIIT with a net capital loss: gains 0, carry 10,000, QD 5,000, rental 20,000, pension 300,000. NII = 5,000 + 20,000 - 3,000 = 22,000;
// MAGI = 300,000 - 3,000 + 5,000 + 20,000 = 322,000; NIIT = 3.8% x min(22,000, 122,000) = 836.
const n2 = E.estimateTaxes(P('single'), 50, 320000, 0, 0, 0, 5000, 0, 0, 0, 20000, 10000);
console.log(JSON.stringify({ label: 'NIIT with loss', engineNiit: n2.niit, hand: 836, agi: n2.measures.federal_agi, handAgi: 322000 }));
// Plan-level NIIT: single 50, pension 100,000, rental stream 150,000.
const p = h.plan({ years: 1, retireAge: 50, pension: 100000, amount: 0 });
p.profile.age = 50; p.profile.retireAge = 50; p.profile.endAge = 51; p.employment.contributionStop = 50;
Object.assign(p.retirement, { dividendStart: 50, selfLife: 100, otherIncomes: [{ name: 'Rent', type: 'rental', owner: 'self', amount: 150000, start: 50, end: 60, growth: 0, growthMode: 'fixed' }] });
p.advanced.transferOn = false; p.accounts = [h.account('cash', 'taxable', 100000, { cashHolding: true, allocation: {} })];
const v = h.validateScenario(structuredClone(p)), r = h.run(p), row = r.rows[1];
// Hand: TI 250,000 - 16,100 = 233,900; tax 41,024 + 32% x (233,900 - 201,775) = 51,304; NIIT 1,900; AZ 2.5% x 233,900 = 5,847.50; total 59,051.50
console.log(JSON.stringify({ label: 'plan NIIT', valid: v.valid, status: r.status, engineTaxes: row.taxes, handTaxes: 59051.5 }));
console.log('TERMINATOR probe-payroll-niit done');
