/* S5AA R53 (the owner's decisions of 2026-10-04 on ChatGPT's R51F and R52 audits): the rules as the prediction scans test them, on the
   engine's own state through read-only taps (tests/lib/engine-variant.js) of the tree BEFORE the repair (cbce0ce). Every tap only reads and
   records; whoever uses one asserts the variant's rows equal the real engine's.

   1. R51F-01, the grace year's monthly test. Today an owner's grace year (the row they stop working in) spares the non-service months only
      when the owner has NO employment or self-employment stream in the row (earnings.streamSelf / streamSpouse > 0 switches it off), and
      the service months are the months before the owner's retirement date. R53: in the grace year a benefit month is a non-service month
      when that owner's wages in the month are at or below the monthly exempt amount and no self-employment profit falls in it.
      EXPOSED (a necessary condition, C1 through the engine's own helpers): a householdSocialSecurityDetail() call, for an owner, in which
        - the row is that owner's grace year (retirement inside (start, end] of the row on the owner's clock, the engine's own test), and
        - the earnings test band applies (ssEarningsTestBand() not null: the owner is under full retirement age at the row's start), and
        - the owner, or the spousal part on the owner's record, is paid something in the row, and
        - the owner's tested earnings exceed the row's prorated exempt amount (no excess, no withholding under either rule).
      Without all four, both rules withhold nothing in that row or withhold by the same annual test, so nothing can move. The tap also
      records whether today's grace was switched off by a stream (the R51F-01 mechanism) or applied (the R53 monthly test may still move
      it when a pre-retirement month falls at or below the monthly amount).
   2. R52-01 / R52-02 (the restore family) are app-only; the engine is not touched, so no tap. r53_corpus_scan.js reports which corpus
      plans readStatic() would rewrite today.
   3. End age before retirement: r53_corpus_scan.js reports every plan with profile.endAge < profile.retireAge (the stop condition). */
'use strict';
function makeVariant(loadEngineVariant, key) {
  const G = 'globalThis.' + key, ON = G + '&&' + G + '.on';
  return loadEngineVariant([
    { id: 'path', marker: 'function simulatePlanRows(p,random,historyOffset,ltcRandom,issues,serialized,gateToken){', append: ON + '&&' + G + '.path++;' },
    { id: 'grace', marker: 'spouseGrace=spouseOn&&spouseRetireAtSelfAge>age+1e-9&&spouseRetireAtSelfAge<=rowAge+1e-9&&!(earnings&&earnings.streamSpouse>0);', append:
      'if(' + ON + '&&earnings){[["self",age,rowAge,selfRetireAge>age+1e-9&&selfRetireAge<=rowAge+1e-9,earnings.self,earnings.streamSelf,selfGross+spouseAuxGross,selfGrace],' +
      '["spouse",spouseAge,spouseAge+duration,spouseOn&&spouseRetireAtSelfAge>age+1e-9&&spouseRetireAtSelfAge<=rowAge+1e-9,earnings.spouse,earnings.streamSpouse,spouseGross+selfAuxGross,spouseGrace]].forEach(function(x){' +
      'if(!x[3])return;var band=ssEarningsTestBand(p,x[1],x[2],x[0]);' + G + '.graceRows++;if(!band||!(x[6]>0))return;var dur=Math.max(0,x[2]-x[1]),tested=Math.max(0,Number(x[4])||0)*band.testedFraction,exempt=band.exempt*dur*band.testedFraction;' +
      'if(!(tested-exempt>1e-9))return;' + G + '.grace.push({path:' + G + '.path,age:age,owner:x[0],stream:Number(x[5])||0,todayGrace:x[7],earnings:Number(x[4])||0,exempt:exempt,gross:x[6],fraYear:band.fraYear})})}' },
  ]);
}
function fresh(T) { Object.assign(T, { on: false, path: -1, grace: [], graceRows: 0 }); return T; }
function exposures(T) { return { grace: T.grace.slice() }; }
module.exports = { makeVariant, fresh, exposures };
