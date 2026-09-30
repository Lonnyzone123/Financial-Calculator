// A-01 reach scan for R40's four repairs, from the expanded corpus's INPUTS only (no engine run).
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const cb = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
const res = cb.corpusWithDiagnostics({ composition: process.argv[2] || 'expanded' });
const list = Array.isArray(res) ? res : (res.entries || []);
const out = { members: list.length, ltc: [], partD: [], partialFirst: [], partialLast: [], spouseRmd: [] };
for (const e of list) {
  const p = e.plan, pr = p.profile || {}, adv = p.advanced || {}, ret = p.retirement || {};
  const start = Number(pr.age), end = Number(pr.endAge), retire = Math.max(start, Number(pr.retireAge));
  const method = (p.assumptions || {}).method;
  if (adv.ltcOn && Number(adv.ltcCost) > Number(adv.ltcInsurance || 0) && Number(adv.ltcProbability) > 0 && Number(adv.ltcYears) > 0)
    out.ltc.push({ name: e.name, method, cost: adv.ltcCost, insurance: adv.ltcInsurance || 0, prob: adv.ltcProbability, years: adv.ltcYears,
      healthInflation: adv.healthInflation, start, end });
  if (adv.healthOn) {
    const spouseOffset = pr.spouseOn ? Number(pr.spouseAge) - start : null;
    const reaches65 = end > 65 || (pr.spouseOn && Number(pr.spouseAge) + (end - start) > 65);
    if (reaches65) out.partD.push({ name: e.name, method, start, end, retire, spouseOn: !!pr.spouseOn, spouseAge: pr.spouseOn ? pr.spouseAge : null });
  }
  if (start % 1 !== 0) out.partialFirst.push({ name: e.name, method, start, share: +(Math.ceil(start) - start).toFixed(4) });
  if (end % 1 !== 0) out.partialLast.push({ name: e.name, method, end, share: +(end - Math.floor(end)).toFixed(4) });
  if (pr.spouseOn && adv.rmdOn) {
    const off = Number(pr.spouseAge) - start;
    const spousePre = (p.accounts || []).filter((a) => a && a.owner === 'spouse' && a.taxClass === 'preTax' && Number(a.balance) > 0);
    const spouseAtEnd = Number(pr.spouseAge) + (end - start);
    if (Math.abs(off % 1) > 1e-9 && spouseAtEnd > 73) out.spouseRmd.push({ name: e.name, method, offset: +off.toFixed(4), spouseAge: pr.spouseAge,
      spousePreTaxAccounts: spousePre.length, spouseAtEnd: +spouseAtEnd.toFixed(2) });
  }
}
console.log(JSON.stringify(out, null, 1));
