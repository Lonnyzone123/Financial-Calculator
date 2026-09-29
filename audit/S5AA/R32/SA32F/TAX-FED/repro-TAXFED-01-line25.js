// TAXFED-01: the Qualified Dividends and Capital Gain Tax Worksheet's line 25 ("the smaller of line 23 or line 24") is not applied.
// Preferential income that falls between the 0% ceiling and the top of the 12% bracket is taxed at 15% where the regular
// tax on all taxable income (12%) is lower.  Run: node repro-TAXFED-01-line25.js
'use strict';
const h = require('../harness.js');
const E = h.engine;
// ---- 1. Direct: estimateTaxes() on isolated returns --------------------------------------------------------------------
function P(f) { return { profile: { filing: f, age: 60, spouseOn: false, spouseAge: 60 }, retirement: { selfLife: 110 } }; }
const direct = [
  // single: ordinary 65,550 -> ordinary taxable 49,450; QD 950 -> TI 50,400
  { f: 'single', ordinary: 65550, qd: 950,
    hand: '1240 + .12*(50400-12400) = 5,800 (line 24); line 23 = [1240+.12*(49450-12400)] + .15*950 = 5,686 + 142.50 = 5,828.50; line 25 = 5,800', expect: 5800 },
  // mfj: ordinary 131,100 -> ordinary taxable 98,900; QD 1,900 -> TI 100,800
  { f: 'mfj', ordinary: 131100, qd: 1900,
    hand: '2480 + .12*(100800-24800) = 11,600 (line 24); line 23 = [2480+.12*(98900-24800)] + .15*1900 = 11,372 + 285 = 11,657; line 25 = 11,600', expect: 11600 },
  // hoh: ordinary 90,350 -> ordinary taxable 66,200; LTCG 1,250 -> TI 67,450
  { f: 'hoh', ordinary: 90350, gains: 1250,
    hand: '1770 + .12*(67450-17700) = 7,740 (line 24); line 23 = [1770+.12*(66200-17700)] + .15*1250 = 7,590 + 187.50 = 7,777.50; line 25 = 7,740', expect: 7740 },
];
for (const c of direct) {
  const e = E.estimateTaxes(P(c.f), 60, c.ordinary, c.gains || 0, 0, 0, c.qd || 0, 0, 0, 0, 0, 0);
  console.log(JSON.stringify({ case: 'direct ' + c.f, hand: c.hand, expectFederal: c.expect, engineFederal: e.federal, over: +(e.federal - c.expect).toFixed(2) }));
}
// ---- 2. Whole plan: a retiree with a pension and qualified dividends --------------------------------------------------------
function planFor(f, pension, divBalance) {
  const p = h.plan({ years: 1, pension, yieldRate: 5, amount: 0 });
  p.profile.filing = f; p.advanced.transferOn = false;
  p.accounts = [h.account('cash', 'taxable', 100000, { cashHolding: true, allocation: {} }), h.account('brk', 'taxable', divBalance, { basisPct: 100 })];
  return p;
}
for (const [f, pension, bal, fedExpect] of [['single', 65550, 19000, 5800], ['mfj', 131100, 38000, 11600]]) {
  const p = planFor(f, pension, bal);
  const v = h.validateScenario(structuredClone(p));
  const r = h.run(p);
  const row = r.rows[1];
  const std = f === 'mfj' ? 32200 : 16100;
  const azHand = .025 * (row.federalAgi - std);            // Arizona: AGI less its basic standard deduction (no one 65+)
  console.log(JSON.stringify({ case: 'plan ' + f, valid: v.valid, status: r.status, dividends: row.dividends, agi: row.federalAgi,
    engineTaxes: row.taxes, handTaxes: fedExpect + azHand, handFederal: fedExpect, handArizona: azHand, over: +(row.taxes - fedExpect - azHand).toFixed(2) }));
}
console.log('TERMINATOR repro-TAXFED-01 done');
