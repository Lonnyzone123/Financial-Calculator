// S5AA R33 self-audit: the independent 2026 federal reference, corrected for ChatGPT's R32V-02 and extended to R33's rules. Written
// from the primary sources, never from the engine or its rules package:
//   Rev. Proc. 2025-32 s.4.01 (rate tables), s.4.03 (0%/15% maximum amounts), s.4.14 (standard deduction, aged addition);
//   IRC 151(d)(5)(C) (senior deduction), IRC 86 / Pub. 915 Worksheet 1 (Social Security), IRC 1411 (NIIT), IRC 1211(b) ($3,000),
//   IRC 1212(b)(2)(B) (the carryover: adjusted taxable income adds back the 1211(b) amount AND the section 151 deduction), Form 1040
//   QDCG worksheet (lines 1-25), Schedule SE.
// Changes from audit/S5AA/R32/SA32F/TAX-FED/ref.js:
//   - R32V-02: the loss used adds back the senior deduction (1212(b)(2)(B)(ii)); the R32F reference repeated the engine's omission.
//   - SA32F-33: a MARRIED couple (a spouse present) on a single or head-of-household return: only the self's own age counts, at the
//     married 1,650 amount (63(f)(3)), and neither spouse gets the senior deduction (151(d)(5)(C)(v)).
'use strict';
const T = {
  single: [[12400, .10], [50400, .12], [105700, .22], [201775, .24], [256225, .32], [640600, .35], [Infinity, .37]],
  mfj: [[24800, .10], [100800, .12], [211400, .22], [403550, .24], [512450, .32], [768700, .35], [Infinity, .37]],
  hoh: [[17700, .10], [67450, .12], [105700, .22], [201750, .24], [256200, .32], [640600, .35], [Infinity, .37]],
};
const CG = { single: [49450, 545500], mfj: [98900, 613700], hoh: [66200, 579600] };
const STD = { single: 16100, mfj: 32200, hoh: 24150 };
const SSB = { single: [25000, 34000], hoh: [25000, 34000], mfj: [32000, 44000] };
const NIIT = { single: 200000, hoh: 200000, mfj: 250000 };
function ordTax(ti, f) { let prev = 0, t = 0; for (const [cap, r] of T[f]) { if (ti <= prev) break; t += (Math.min(ti, cap) - prev) * r; prev = cap; } return t; }
function ssTaxable(b, other, f) {
  if (b <= 0) return 0; const l2 = b / 2, l7 = l2 + other; const [base, upper] = SSB[f];
  const l9 = l7 - base; if (l9 <= 0) return 0; const l10 = upper - base, l11 = Math.max(0, l9 - l10), l12 = Math.min(l9, l10),
    l13 = l12 / 2, l14 = Math.min(l2, l13), l15 = l11 * .85, l16 = l14 + l15, l17 = b * .85; return Math.min(l16, l17);
}
function qdcg(TI, pref, f) {
  if (TI <= 0) return { line23: 0, line24: 0, line25: 0 };
  const l4 = Math.min(pref, TI), l5 = Math.max(0, TI - l4), [z, fif] = CG[f];
  const l7 = Math.min(TI, z), l8 = Math.min(l5, l7), l9 = l7 - l8, l10 = Math.min(TI, l4), l12 = l10 - l9,
    l14 = Math.min(TI, fif), l15 = l5 + l9, l16 = Math.max(0, l14 - l15), l17 = Math.min(l12, l16), l18 = l17 * .15,
    l20 = l10 - (l9 + l17), l21 = l20 * .20, l22 = ordTax(l5, f), l23 = l18 + l21 + l22, l24 = ordTax(TI, f);
  return { line23: l23, line24: l24, line25: Math.min(l23, l24) };
}
/* x: { f, ages:[selfAge, spouseAge or -1], married (a spouse present), ordinary, gains, carry, qd, ss } */
function federal(x) {
  const f = x.f, gains = x.gains || 0, carry = x.carry || 0, qd = x.qd || 0;
  const net = gains - carry, capLine = net >= 0 ? net : -Math.min(3000, -net);
  const otherIncome = (x.ordinary || 0) + capLine + qd;
  const ssT = ssTaxable(x.ss || 0, otherIncome, f), agi = otherIncome + ssT;
  const apart = !!x.married && f !== 'mfj';
  const counted = apart ? [x.ages[0]] : x.ages;
  const n65 = counted.filter((a) => a >= 65).length;
  const aged = apart ? 1650 : (f === 'mfj' ? 1650 : 2050);
  const senior = apart ? 0 : n65 * Math.max(0, 6000 - .06 * Math.max(0, agi - (f === 'mfj' ? 150000 : 75000)));
  const ded = STD[f] + n65 * aged + senior;
  const TI = Math.max(0, agi - ded), pref = qd + Math.max(0, net);
  const q = qdcg(TI, pref, f);
  const nii = Math.max(0, qd + capLine);
  const niit = .038 * Math.min(nii, Math.max(0, agi - NIIT[f]));
  // IRC 1212(b)(2)(B): adjusted taxable income = taxable income (negative allowed) + the 1211(b) amount + the section 151 deduction.
  const lossUsed = net < 0 ? Math.min(-capLine, Math.max(0, agi - ded + (-capLine) + senior)) : 0;
  return { agi, ssTaxable: ssT, deduction: ded, senior, TI, incomeTax: q.line25, line23: q.line23, niit, carryOut: net < 0 ? -net - lossUsed : 0 };
}
module.exports = { ordTax, ssTaxable, qdcg, federal };
