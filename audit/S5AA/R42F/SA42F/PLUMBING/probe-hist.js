'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;
const HR=E.HIST_RETURNS||global.HIST_RETURNS,HI=E.HIST_INFLATION,HC=E.HIST_COLA;
console.log('exports have hist?',!!E.HIST_RETURNS,!!E.HIST_INFLATION,!!E.HIST_COLA, HR&&HR.length, HR&&HR[0], HR&&HR[HR.length-1]);
console.log('HIST_COLA type',typeof HC, HC&&Object.keys(HC).slice(0,3), HI&&HI.slice(0,2));
function run(p){const v=h.validateScenario(structuredClone(p));const r=E.runPlan(structuredClone(p));if(!v.valid||r.status!=='ok')console.log('!!',v.valid,r.status,r.calculationErrorCode,JSON.stringify(v.issues.filter(i=>i.severity==='ERROR')));return r;}
const yr=y=>HR.findIndex(x=>x[0]===y);
// H1: returns and inflation by row
let p=basePlan({age:60,endAge:64,spending:0,accounts:[account('cash','taxable',100000,{basisPct:100,allocation:{flat:100}})]});
p.assumptions.method='historical';p.assumptions.historyStart=1973;p.advanced.assetsOn=false;
let r=run(p);
for(let k=1;k<r.rows.length;k++){const i=yr(1973)+k-1;console.log(' row',r.rows[k].age,'total',r.rows[k].total.toFixed(2),'expect',(100000*HR.slice(yr(1973),i+1).reduce((f,x)=>f*(1+x[1]),1)).toFixed(2),'infl',r.rows[k].inflationFactor.toFixed(6),'expect',HI.slice(yr(1973),i+1).reduce((f,x)=>f*(1+x[1]),1).toFixed(6));}
// H2: SS COLA history, claim at start
p=basePlan({age:67,endAge:72,spending:0,ssBenefit:1000,accounts:[account('cash','taxable',100000,{basisPct:100})]});p.assumptions.method='historical';p.assumptions.historyStart=1973;p.retirement.ssCola=0;p.retirement.ssClaim=67;
r=run(p);console.log('H2 claim at 67 = start, hist 1973; HIST_COLA',[1973,1974,1975,1976,1977].map(y=>y+':'+HC[y]).join(' '));
r.rows.forEach(x=>console.log('  ',x.age,x.income.toFixed(2),'infl',x.inflationFactor.toFixed(4)));
// H3: historyStart 2020 with a 10-year plan: wraps to 1928 after 2025?
p=basePlan({age:60,endAge:70,spending:0,accounts:[account('cash','taxable',100000,{basisPct:100})]});p.assumptions.method='historical';p.assumptions.historyStart=2020;p.advanced.assetsOn=false;
r=run(p);console.log('H3 start 2020, 10 rows: status',r.status,'issues',(r.issues||[]).map(i=>i.code).join(','));
