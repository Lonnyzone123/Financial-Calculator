'use strict';
const h=require('../harness.js');
const {recastAnalysis}=require(require('path').join(h.TREE,'src/debt-recast.js'));const {refinanceAnalysis}=require(require('path').join(h.TREE,'src/debt-refinance.js'));
const {armSchedule}=require(require('path').join(h.TREE,'src/debt-arm.js'));
const pmt=(B,r,n)=>{r/=1200;return B*r/(1-Math.pow(1+r,-n))};
const ra=recastAnalysis({balance:200000,annualRatePct:6,remainingTermMonths:300},50000);
console.log('recast pmt',ra.recast.monthlyPayment.toFixed(2),'hand',pmt(150000,6,300).toFixed(2),'doNothing',ra.doNothing.monthlyPayment.toFixed(2),'hand',pmt(200000,6,300).toFixed(2));
const intDo=pmt(200000,6,300)*300-200000,intRe=pmt(150000,6,300)*300-150000;console.log('interest saved (recast)',ra.recast.interestSaved.toFixed(2),'hand (level-payment totals)',(intDo-intRe).toFixed(2));
console.log('curtailment payoffMonth',ra.curtailment.payoffMonth,'hand',Math.ceil(-Math.log(1-150000*0.005/pmt(200000,6,300))/Math.log(1.005)));
const rf=refinanceAnalysis({balance:200000,annualRatePct:7,remainingTermMonths:300},{annualRatePct:5,termMonths:300,closingCosts:4000},{});
// hand break-even (net position): stayNet = cumPay + bal; refiNet = 4000 + cumPay' + bal'. Month m: compute
let B1=200000,B2=200000,P1=pmt(200000,7,300),P2=pmt(200000,5,300),c1=0,c2=0,be=null,cf=null;for(let m=1;m<=300;m++){B1=B1*(1+7/1200)-P1;B2=B2*(1+5/1200)-P2;c1+=P1;c2+=P2;if(be===null&&4000+c2+B2<c1+B1)be=m;if(cf===null&&c1-c2>4000)cf=m;}
console.log('refi breakEven',rf.breakEvenMonth,'hand',be,'cashflow',rf.cashFlowBreakEvenMonth,'hand',cf);
