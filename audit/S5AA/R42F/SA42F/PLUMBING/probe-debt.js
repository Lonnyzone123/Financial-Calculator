// Debt hand checks: amortization, ARM reset+recast, payoff at its month, PMI while owed, extra principal, housing inflation,
// partial first row, retirement split.
'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;
const f2=x=>Math.round(x*100)/100;
function hand(B,ratePct,pay,months,extra=0){let r=ratePct/1200,I=0,P=0;for(let m=0;m<months&&B>1e-9;m++){const i=B*r,a=Math.min(pay+extra,B+i);I+=i;P+=a;B=B+i-a;}return {B,I,P};}
function pmt(B,ratePct,n){const r=ratePct/1200;return r===0?B/n:B*r/(1-Math.pow(1+r,-n));}
function run(p){const v=h.validateScenario(structuredClone(p));const r=h.engine.runPlan(structuredClone(p));if(!v.valid||r.status!=='ok')console.log('  !! valid',v.valid,JSON.stringify(v.issues.filter(i=>i.severity==='ERROR')),r.status,r.calculationErrorCode);return r;}
function debtPlan(debt,o={}){const p=basePlan(Object.assign({age:60,endAge:63,spending:0,accounts:[account('cash','taxable',2000000,{basisPct:100})]},o));p.advanced.debts=[Object.assign({id:'d',name:'d',type:'mortgage',owner:'household',balance:200000,rate:6,paymentMonthly:1500,payoffAge:90,includePayment:true,includeHousingCosts:false,rateType:'fixed',extraPrincipalMonthly:0,annualPropertyTax:0,annualInsurance:0,hoaMonthly:0,pmiMonthly:0},debt)];p.advanced.networthOn=true;return p;}
let fails=0;function cmp(label,a,e,tol=0.011){const ok=Math.abs(a-e)<=tol;if(!ok)fails++;console.log((ok?'  ok   ':'  MISM ')+label+': engine '+f2(a)+' hand '+f2(e));}
// D1 fixed amortization, 2 rows
{const r=run(debtPlan({}));const y1=hand(200000,6,1500,12),y2=hand(y1.B,6,1500,12);console.log('D1 fixed');
 cmp('row61 interest',r.rows[1].debtInterest,y1.I);cmp('row61 balance',r.rows[1].debtBalance,y1.B);cmp('row61 payments',r.rows[1].debtPaymentsTotal,y1.P);cmp('row61 debtPayments (retired)',r.rows[1].debtPayments,y1.P);
 cmp('row62 interest',r.rows[2].debtInterest,y2.I);cmp('row62 balance',r.rows[2].debtBalance,y2.B);cmp('row61 spending includes payment',r.rows[1].spending,y1.P);}
// D2 ARM reset inside row at 60.5, recast to payoffAge 90
{const P0=pmt(200000,4,360);const r=run(debtPlan({rate:4,paymentMonthly:P0,rateType:'adjustable',nextRateResetAge:60.5,resetRate:7,payoffAge:90}));
 const a=hand(200000,4,P0,6);const P1=pmt(a.B,7,Math.round((90-60.5)*12));const b=hand(a.B,7,P1,6);const c=hand(b.B,7,P1,12);console.log('D2 ARM reset at 60.5: P0',f2(P0),'P1',f2(P1));
 cmp('row61 interest',r.rows[1].debtInterest,a.I+b.I);cmp('row61 balance',r.rows[1].debtBalance,b.B);cmp('row62 balance',r.rows[2].debtBalance,c.B);cmp('row62 payments',r.rows[2].debtPaymentsTotal,12*P1);}
// D2b ARM reset at a row boundary (61)
{const P0=pmt(200000,4,360);const r=run(debtPlan({rate:4,paymentMonthly:P0,rateType:'adjustable',nextRateResetAge:61,resetRate:7,payoffAge:90}));
 const a=hand(200000,4,P0,12);const P1=pmt(a.B,7,Math.round((90-61)*12));const b=hand(a.B,7,P1,12);console.log('D2b ARM reset at 61');
 cmp('row61 balance',r.rows[1].debtBalance,a.B);cmp('row62 balance',r.rows[2].debtBalance,b.B);cmp('row62 payments',r.rows[2].debtPaymentsTotal,12*P1);}
// D2c ARM reset before plan start (already reset)
{const r=run(debtPlan({rate:4,paymentMonthly:1000,rateType:'adjustable',nextRateResetAge:58,resetRate:7,payoffAge:90}));
 const P1=pmt(200000,7,360);const a=hand(200000,7,P1,12);console.log('D2c ARM reset at 58 (before start): P1',f2(P1));
 cmp('row61 balance',r.rows[1].debtBalance,a.B);cmp('row61 payments',r.rows[1].debtPaymentsTotal,12*P1);}
// D3 payoff at its month 60.5: 6 months of payments then balloon
{const r=run(debtPlan({balance:10000,rate:12,paymentMonthly:0,payoffAge:60.5}));const a=hand(10000,12,0,6);console.log('D3 payoff at 60.5 (zero payment -> refused as forced payoff?)',r.status,r.calculationErrorCode||'');}
{const r=run(debtPlan({balance:10000,rate:12,paymentMonthly:100,payoffAge:60.5}));const a=hand(10000,12,100,6);console.log('D3b payoff at 60.5, $100/mo');
 cmp('row61 interest',r.rows[1].debtInterest,a.I);cmp('row61 payments',r.rows[1].debtPaymentsTotal,a.P+a.B);cmp('row61 balance',r.rows[1].debtBalance,0);}
// D4 PMI while owed: paid off in month 7 by payments
{const r=run(debtPlan({balance:6000,rate:0,paymentMonthly:1000,payoffAge:90,includeHousingCosts:true,pmiMonthly:50}));console.log('D4 PMI while owed, payoff after 6 payments');
 cmp('row61 housing',r.rows[1].debtHousing,6*50);cmp('row62 housing',r.rows[2].debtHousing,0);}
// D5 extra principal
{const r=run(debtPlan({extraPrincipalMonthly:500}));const a=hand(200000,6,1500,12,500);console.log('D5 extra principal 500');cmp('row61 balance',r.rows[1].debtBalance,a.B);cmp('row61 payments',r.rows[1].debtPaymentsTotal,a.P);}
// D6 housing costs inflate with plan inflation (3%), spending price level at row start
{const r=run(debtPlan({balance:0,includeHousingCosts:true,annualPropertyTax:3000,annualInsurance:1200,hoaMonthly:100},{inflation:3,endAge:64}));console.log('D6 housing inflation 3%');
 [1,2,3].forEach(k=>cmp('row'+(60+k)+' housing',r.rows[k].debtHousing,(3000+1200+1200)*Math.pow(1.03,k-1)));}
// D7 partial first row 0.7 years (age 60.3): payments counted
{const r=run(debtPlan({},{age:60.5,endAge:62}));const a=hand(200000,6,1500,6);console.log('D7 half first row: months',Math.round(0.5*12));cmp('row61 interest',r.rows[1].debtInterest,a.I);cmp('row61 balance',r.rows[1].debtBalance,a.B);}
// D8 retirement split: retire at 60.5 inside row; debtPayments retired share = 6 payments
{const r=run(debtPlan({},{age:60,retireAge:60.5,salary:100000}));console.log('D8 retire at 60.5: retired payments');cmp('row61 debtPayments',r.rows[1].debtPayments,6*1500);cmp('row61 total',r.rows[1].debtPaymentsTotal,12*1500);}
// D9 revolving card at minimum (2% / $25)
{const r=run(debtPlan({type:'creditCard',balance:10000,rate:20,paymentMonthly:0,payoffAge:undefined}));let B=10000,I=0,P=0;for(let m=0;m<12;m++){const i=B*0.2/12;const min=Math.max(0.02*B,25);const pay=Math.min(Math.max(min,0),B+i);I+=i;P+=pay;B=B+i-pay;}console.log('D9 card min 2%/$25 (minimum on balance before interest?)');cmp('row61 balance',r.rows[1].debtBalance,B,1);cmp('row61 interest',r.rows[1].debtInterest,I,1);}
console.log('fails',fails);
