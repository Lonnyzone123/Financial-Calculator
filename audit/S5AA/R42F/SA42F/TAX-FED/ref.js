'use strict';
// Independent federal reference for R42F TAX-FED. Constants typed from Rev. Proc. 2025-32 / IRC / SSA, NOT read from the rules JSON.
// Later years: indexed from the 2026 figure (the model's declared base-year convention) with each statute's rounding, written here independently.
const B26 = {
  brackets: { single: [12400, 50400, 105700, 201775, 256225, 640600], mfj: [24800, 100800, 211400, 403550, 512450, 768700], hoh: [17700, 67450, 105700, 201750, 256200, 640600] },
  rates: [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37],
  cg: { single: [49450, 545500], mfj: [98900, 613700], hoh: [66200, 579600] },
  std: { single: 16100, mfj: 32200, hoh: 24150 },
  addMarried: 1650, addUnmarried: 2050,
  wageBase: 184500,
};
function idx(f, w) { // IRC 1(f)(7)/1(j)(5)(C)/63(c)(4): the increase rounded down to $50; 42 USC 430(b): nearest $300
  const inc = v => v + Math.floor(v * (f - 1) / 50 + 1e-9) * 50;
  const o = { brackets: {}, cg: {}, std: {}, rates: B26.rates };
  for (const k of ['single', 'mfj', 'hoh']) { o.brackets[k] = B26.brackets[k].map(inc); o.cg[k] = B26.cg[k].map(inc); o.std[k] = inc(B26.std[k]); }
  o.addMarried = inc(B26.addMarried); o.addUnmarried = inc(B26.addUnmarried);
  o.wageBase = Math.floor(B26.wageBase * w / 300 + 0.5 + 1e-9) * 300;
  return o;
}
function regTax(ti, C, fs) { const e = C.brackets[fs]; let t = 0, prev = 0; for (let i = 0; i < C.rates.length; i++) { const cap = i < e.length ? e[i] : Infinity; if (ti > prev) t += (Math.min(ti, cap) - prev) * C.rates[i]; prev = cap; } return t; }
// Form 1040 QDCG worksheet, lines 1-25.
function qdcg(L1, L4, C, fs) {
  if (L4 <= 0) return regTax(L1, C, fs);
  L4 = Math.min(L4, L1);
  const L5 = Math.max(0, L1 - L4), L6 = C.cg[fs][0], L7 = Math.min(L1, L6), L8 = Math.min(L5, L7), L9 = L7 - L8,
    L10 = Math.min(L1, L4), L11 = L9, L12 = L10 - L11, L13 = C.cg[fs][1], L14 = Math.min(L1, L13), L15 = L5 + L9,
    L16 = Math.max(0, L14 - L15), L17 = Math.min(L12, L16), L18 = L17 * 0.15, L19 = L9 + L17, L20 = L10 - L19, L21 = L20 * 0.20,
    L22 = regTax(L5, C, fs), L23 = L18 + L21 + L22, L24 = regTax(L1, C, fs);
  return Math.min(L23, L24);
}
// Pub 915 Worksheet 1.
function taxableSS(B, other, fs) {
  if (B <= 0) return 0;
  const base = fs === 'mfj' ? 32000 : 25000, L9 = fs === 'mfj' ? 12000 : 9000;
  const L2 = B / 2, L5 = L2 + other; if (L5 <= base) return 0;
  const L8 = L5 - base, L10 = Math.max(0, L8 - L9), L11 = Math.min(L8, L9), L12 = L11 / 2, L13 = Math.min(L2, L12), L14 = L10 * 0.85, L15 = L13 + L14, L16 = B * 0.85;
  return Math.min(L15, L16);
}
// x: {fs, married(spouse modelled & alive both), widowedSingle, ages:[selfAgeAtClose or null, spouseAgeAtClose or null], joint(bool),
//     ordinary (includes taxable wages, non-qualified dividends, SE profit, pension...), wagesSelf, wagesSpouse (FICA wages), seSelf, seSpouse,
//     qd, cg, carry, ss, niiOther, C (constants)}
function federal(x) {
  const C = x.C || B26, fs = x.fs;
  const seNet = v => { const n = Math.max(0, v || 0) * 0.9235; return n < 400 ? 0 : n; };
  const nS = seNet(x.seSelf), nP = seNet(x.seSpouse);
  const seSS = 0.124 * (Math.min(nS, Math.max(0, C.wageBase - (x.wagesSelf || 0))) + Math.min(nP, Math.max(0, C.wageBase - (x.wagesSpouse || 0))));
  const seMed = 0.029 * (nS + nP), seHalf = (seSS + seMed) / 2;
  const net = (x.cg || 0) - (x.carry || 0);
  const lossDed = net < 0 ? Math.min(3000, -net) : 0;
  const line7 = net >= 0 ? net : -lossDed;
  const otherIncome = (x.ordinary || 0) + (x.qd || 0) + line7 - seHalf; // Pub 915 line 3 less line 6 adjustments
  const tss = taxableSS(x.ss || 0, otherIncome, fs);
  const agi = otherIncome + tss;
  const ages = (x.ages || []).filter(a => a !== null && a >= 65).length;
  let add = 0, sen = 0;
  if (x.apart) { // spouse modelled, both alive, non-joint return: self only, married amount, no senior deduction
    add = (x.ages[0] !== null && x.ages[0] >= 65) ? C.addMarried : 0; sen = 0;
  } else {
    add = ages * (fs === 'mfj' ? C.addMarried : C.addUnmarried);
    const start = fs === 'mfj' ? 150000 : 75000;
    sen = ages * Math.max(0, 6000 - 0.06 * Math.max(0, agi - start));
  }
  const ded = C.std[fs] + add + sen;
  const ti = Math.max(0, agi - ded);
  const pref = Math.max(0, net) + (x.qd || 0);
  const fed = qdcg(ti, Math.min(pref, ti), C, fs);
  const nii = (x.qd || 0) + line7 + (x.niiOther || 0);
  const niitThr = fs === 'mfj' ? 250000 : 200000;
  const niit = 0.038 * Math.max(0, Math.min(Math.max(0, nii), agi - niitThr));
  const wS = x.wagesSelf || 0, wP = x.wagesSpouse || 0;
  const amThr = fs === 'mfj' ? 250000 : 200000;
  const payroll = 0.062 * (Math.min(wS, C.wageBase) + Math.min(wP, C.wageBase)) + 0.0145 * (wS + wP) + 0.009 * Math.max(0, wS + wP + nS + nP - amThr) + seSS + seMed;
  // Capital loss carryover worksheet (IRC 1212(b)(2)): adjusted taxable income adds back the loss deduction and the section 151 (senior) deduction
  const carryOut = net < 0 ? -net - Math.min(lossDed, Math.max(0, agi - ded + lossDed + sen)) : 0;
  return { fed, niit, payroll, agi, tss, ti, ded, carryOut, total: fed + niit + payroll };
}
module.exports = { B26, idx, regTax, qdcg, taxableSS, federal };
