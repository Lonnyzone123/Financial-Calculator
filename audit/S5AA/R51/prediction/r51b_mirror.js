/* S5AA R51 addendum (the owner's rulings of 2026-10-03 on R51's D3 and R50's section 8 item 2): the two rules as the scans compute
   them, on the engine's own state through read-only taps (tests/lib/engine-variant.js) of the tree BEFORE the addendum's edits (678c60f).

   1. Working-years pay, streams' income tax (D3 rejected). The salary's pay is net of the wage-only return
      T(w) = estimateTaxes(p, age, max(0, wages - preTaxDeferrals), 0, 0, wages, 0, spouseWages, -, -, -, -, duration) (`baseline`).
      The streams' tax is their marginal share of the same return with the streams added:
        S = T'(w + s) - T(w),  T'(w + s) = estimateTaxes(p, age, max(0, wages + s - preTaxDeferrals), 0, 0, payrollWages, 0,
                                          payrollSpouseWages, seSelf, seSpouse, -, -, duration, -, qbiCut)
      (s = the row's employment and self-employment stream pay; payrollWages = wages plus the employment streams, as the full return
      takes them), so S holds the streams' federal and Arizona income tax as well as their payroll and SE tax. The working part of the
      streams' pay (R51's streamPay / streamRow) carries that share of S. R51 (8732bb8) subtracted only payroll and SE tax
      (taxes.payroll - baseline.payroll); the new pay is R51's pay + payrollShare - S x share.
   2. The optimizer's Roth weight (R50 section 8 item 2 rejected): the cost of the next dollar the draw would take from the Roth class
      -- the first account in the class's draw order (orderedAccountsInClass()) -- under R50's ledger: 0 when that account is not a Roth
      IRA (a Roth 401(k) or custom tax-free account is modelled tax-free), 0 when its owner is qualified (rothQualified()), 0 while the
      dollar is contribution basis or a conversion's nontaxable part or a conversion past its five years; 45 (the 10%, on the HSA
      weight's scale) on a conversion's taxable part inside its five years while the 10% applies (earlyWithdrawalPenaltyRate() > 0);
      30 + 45 x [the 10% applies] on earnings. It replaces rothExposureWeight()'s exposed share of the class. */
'use strict';
const NEXT = 'function(p,age,accounts,L,priorReturn){if(!L)return 0;var first=orderedAccountsInClass(accounts,"roth",p,priorReturn)[0];if(!first||first.type!=="rothIRA")return 0;var o=rothLedgerKey(first);if(rothQualified(L,o,accountOwnerAge(p,age,first)))return 0;var early=earlyWithdrawalPenaltyRate(p,age,first,true)>0?1:0,led=L[o];if(led.basis>1e-9)return 0;for(var i=0;i<led.conv.length;i++){var c=led.conv[i];if(c.taxable>1e-9)return L.yi<c.year+5?45*early:0;if(c.nontaxable>1e-9)return 0}return 30+45*early}';
function makeVariant(loadEngineVariant, key) {
  const G = 'globalThis.' + key;
  return loadEngineVariant([
    { id: 'path', marker: 'function simulatePlanRows(p,random,historyOffset,ltcRandom,issues,serialized,gateToken){', append: G + '&&' + G + '.on&&' + G + '.path++;' },
    { id: 'roth-weight', marker: 'scores.roth+=rothExposureWeight(p,age,accounts,rothLedger);', replace:
      'var __r51old=rothExposureWeight(p,age,accounts,rothLedger),__r51new=' + G + '&&' + G + '.on?(' + NEXT + ')(p,age,accounts,rothLedger,priorReturn):__r51old;scores.roth+=__r51old;' },
    { id: 'roth-order', marker: 'if(debtTotal(p)>total*.25)scores.roth-=2;return Object.keys(scores).sort(function(a,b){return scores[a]-scores[b]})}', replace:
      'if(debtTotal(p)>total*.25)scores.roth-=2;if(' + G + '&&' + G + '.on){var __s2=Object.assign({},scores);__s2.roth+=__r51new-__r51old;var __o1=Object.keys(scores).sort(function(a,b){return scores[a]-scores[b]}),__o2=Object.keys(__s2).sort(function(a,b){return __s2[a]-__s2[b]});' +
      G + '.roth.push({path:' + G + '.path,age:age,old:__r51old,neu:__r51new,orderOld:__o1.join(","),orderNew:__o2.join(","),rothBal:taxClassBalance(accounts,"roth")})}return Object.keys(scores).sort(function(a,b){return scores[a]-scores[b]})}' },
    { id: 'draw', marker: 'var wr=withdrawFromClass(accounts,order[oi],need,age,p,priorReturn,iraBasisState,lateHold?lateHold.back:null);', append: G + '&&' + G + '.on&&' + G + '.draw.push({path:' + G + '.path,age:age,cls:order[oi],amount:wr.amount,penalty:wr.penalty,income:wr.income});' },
    { id: 'tax-draw', marker: 'var w=withdrawFromClass(accounts,cls,byClass[cls],age,p,priorReturn,iraBasisState);', append: G + '&&' + G + '.on&&' + G + '.draw.push({path:' + G + '.path,age:age,cls:cls,amount:w.amount,penalty:w.penalty,income:w.income,tax:true});' },
    { id: 'work', marker: 'if(wages>0||costRetiredDuration<duration-1e-12)noteWorkingYearsShortfall(issues,age,-workingPay);', append:
      G + '&&' + G + '.on&&(function(){var ran=wages>0||costRetiredDuration<duration-1e-12,np=workingPay,detail=null;if(workStreamRow>0&&workStreamPay>0){var share=workStreamPay/workStreamRow,t2=estimateTaxes(p,age,Math.max(0,wages+workStreamRow-preTaxDeferrals),0,0,payrollWages,0,payrollSpouseWages,other.seSelf,other.seSpouse,void 0,void 0,duration,void 0,qbiCut),S=t2.total-baseline.total;' +
      'np=workingPay+(taxes.payroll-baseline.payroll)*share-S*share;detail={streamPay:workStreamPay,S:S,share:share,incomeTax:(t2.total-t2.payroll)-(baseline.total-baseline.payroll)}}' + G + '.work.push({path:' + G + '.path,age:age,ran:ran,pay:workingPay,newPay:np,detail:detail})})();' },
  ]);
}
module.exports = { makeVariant, NEXT };
