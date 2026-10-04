/* S5AA R51 prediction: the conditions shared by r51_corpus_scan.js and r51_test_exposure_hook.js (the rules and taps are described
   in r51_corpus_scan.js's header). `E` is the tree's real engine; `loadEngineVariant` the tree's tests/lib/engine-variant.js. */
'use strict';
const LB = 'RULES.medicare.irmaa.lookbackYears';
function makeVariant(loadEngineVariant, key) {
  const G = 'globalThis.' + key;
  return loadEngineVariant([
    { id: 'path', marker: 'function simulatePlanRows(p,random,historyOffset,ltcRandom,issues,serialized,gateToken){', append: G + '&&' + G + '.on&&' + G + '.path++;' },
    { id: 'health', marker: 'health+=medicareChargePerPerson(p,medLook,medLookFiling,yearProgress)*medSpouseIdle/* S5AA R48 */}}', append:
      ';' + G + '&&' + G + '.on&&' + G + '.health.push({path:' + G + '.path,age:age,rowAge:rowAge,duration:duration,spouseAge:spouseAge,crd:costRetiredDuration,hd:healthDuration,ws:workSpan.spouse,ages:householdSeniorAges(p,age),health:health,' +
      'cost:p.advanced.healthCost*Math.pow(1+p.advanced.healthInflation/100,yearProgress),charge:medicareChargePerPerson(p,magiHistory.length>=' + LB + '?magiHistory[magiHistory.length-' + LB + ']:0,filingHistory.length>=' + LB + '?filingHistory[filingHistory.length-' + LB + ']:householdFilingFor(p,age),yearProgress)});' },
    { id: 'work', marker: 'if(wages>0||costRetiredDuration<duration-1e-12)noteWorkingYearsShortfall(issues,age,-workingPay);', append:
      G + '&&' + G + '.on&&(function(){var wEnd=age+Math.max(0,duration-costRetiredDuration),ow=wEnd>age+1e-12?otherIncomeFor(p,age,wEnd,inflationFactor,startHistory,incomeStartFactors):{wageSelf:0,wageSpouse:0,seSelf:0,seSpouse:0};' +
      G + '.work.push({path:' + G + '.path,age:age,ran:wages>0||costRetiredDuration<duration-1e-12,oldPay:workingPay,streamWorking:ow.wageSelf+ow.wageSpouse+ow.seSelf+ow.seSpouse,streamRow:(other.wageSelf||0)+(other.wageSpouse||0)+(other.seSelf||0)+(other.seSpouse||0),streamTax:taxes.payroll-baseline.payroll})})();' },
    { id: 'flex', marker: 'if(priorReturn<0&&r.flexibility>0){', append: G + '&&' + G + '.on&&(' + G + '.flex=(' + G + '.flex||0)+1);' },
  ]);
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
/* one tapped row: today's health (re-derived; must equal the engine's) and R51's */
function healthPair(E, p, h) {
  const modelled = p.profile && p.profile.spouseOn ? 2 : 1, block = h.crd > 0 || h.hd > 0;
  const starts = [E.medicareStartAge(p, 'self'), E.medicareStartAge(p, 'spouse')];
  let preOld = 0, medOld = 0, preNew = 0, medNew = 0, idleOld = 0, idleNew = 0;
  h.ages.forEach((a, i) => {
    if (!(a >= 0)) return;
    const s = h.age + (starts[i] - a);
    if (a < 65) preOld += h.hd; else medOld += h.crd;
    preNew += Math.max(0, Math.min(h.rowAge, s) - Math.max(h.age, h.rowAge - h.hd));
    medNew += Math.min(h.crd, clamp(h.rowAge - s, 0, h.duration));
  });
  if (p.profile.spouseOn) {
    const idle = Math.max(0, h.duration - h.crd - h.ws);
    if (h.ages[1] >= 65 && idle > 1e-9) idleOld = idle;
    if (h.ages[1] >= 0 && idle > 1e-9) {
      const sS = h.age + (starts[1] - h.ages[1]), from = h.age + h.ws, to = h.rowAge - h.crd;
      idleNew = Math.max(0, to - Math.max(from, sS));
    }
  }
  const old = (block ? h.cost * preOld / modelled + h.charge * medOld : 0) + h.charge * idleOld;
  const neu = (block ? h.cost * preNew / modelled + h.charge * medNew : 0) + h.charge * idleNew;
  return { old, neu, preOld, preNew, medOld: medOld + idleOld, medNew: medNew + idleNew };
}
/* the IRMAA first-years disclosure (simulatePlanRows()'s), today (useStart false) and R51 */
function irmaaFirstYears(E, p, useStart) {
  if (!(p.advanced && p.advanced.healthOn)) return false;
  if (p.advanced.irmaaMagiTwoYearsBefore != null && p.advanced.irmaaMagiOneYearBefore != null) return false;
  const start = Number(p.profile.age), cut = E.lastDeathCutAge(p), reaches = cut === null ? Number(p.profile.endAge) : cut, openings = [start, Math.floor(start) + 1];
  for (let i = 0; i < openings.length; i++) {
    const opening = openings[i], rowEnds = i === 0 ? Math.min(Math.floor(start) + 1, reaches) : Math.min(Math.floor(start) + 2, reaches);
    if (!(rowEnds > opening)) continue;
    if (!(E.householdRetireAge(p) < rowEnds)) continue;
    const ages = E.householdSeniorAges(p, opening);
    if (!useStart) { if (ages.some((a) => a >= 65)) return true; continue; }
    if (ages.some((a, k) => a >= 0 && opening + (E.medicareStartAge(p, k ? 'spouse' : 'self') - a) < rowEnds - 1e-9)) return true;
  }
  return false;
}
/* the partial-first-year disclosure's age test (simulatePlanRows(): "someone 65 or over by plan year 2"), today and R51. Plan year 2 is the
   row opening at floor(age) + 2 on the primary's clock, the one whose surcharge reads the completed first year. R51: someone's Medicare
   span in that row is positive -- their opening age there (own clock) is at or past their start, or the start falls inside the row.
   At 65 for the primary this is today's test exactly (the row's opening is a whole age). The rest of the condition is unchanged. */
function partialAgeTest(E, p, useStart) {
  const a = Number(p.profile.age), sa = Number(p.profile.spouseAge), on = !!p.profile.spouseOn;
  if (!useStart) return a + 2 >= 65 || (on && sa + 2 >= 65);
  const o = Math.floor(a) + 2, span = (opening, s) => opening >= s || opening + 1 > s;
  return span(o, E.medicareStartAge(p, 'self')) || (on && span(sa + (o - a), E.medicareStartAge(p, 'spouse')));
}
const newPay = (w) => w.oldPay + w.streamWorking - (w.streamRow > 0 ? w.streamTax * w.streamWorking / w.streamRow : 0);
module.exports = { makeVariant, healthPair, irmaaFirstYears, partialAgeTest, newPay };
