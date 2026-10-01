const { run, show, codes, basePlan, account, h } = require('./lib.js');
function base() {
  const p = basePlan({ couple: true, age: 70, spouseAge: 68, endAge: 80, spending: 30000, dividendOn:true, dividendYield:0,
    accounts: [account('brk','taxable',800000,{basisPct:100})] });
  Object.assign(p.retirement, { ssBenefit: 2000, ssClaim: 70, spouseSS: 1000, spouseClaim: 68, ssCola: 0, survivor: true, survivorSpendingReduction: 20, selfLife: 75, spouseLife: 72 });
  return p;
}
const muts = {
  control: p=>{},
  selfLife_string_abc: p=>{p.retirement.selfLife='abc'},
  selfLife_string_75: p=>{p.retirement.selfLife='75'},
  selfLife_null: p=>{p.retirement.selfLife=null},
  selfLife_bool: p=>{p.retirement.selfLife=true},
  spouseLife_string: p=>{p.retirement.spouseLife='72'},
  spouseLife_neg: p=>{p.retirement.spouseLife=-5},
  selfLife_200: p=>{p.retirement.selfLife=200},
  spouseAge_string: p=>{p.profile.spouseAge='68'},
  survRed_string: p=>{p.retirement.survivorSpendingReduction='20'},
  survRed_abc: p=>{p.retirement.survivorSpendingReduction='abc'},
  survRed_80: p=>{p.retirement.survivorSpendingReduction=80},
  nobody_alive: p=>{p.retirement.selfLife=60; p.retirement.spouseLife=60},
};
for (const [k,m] of Object.entries(muts)) {
  const p = base(); m(p);
  const v = h.validateScenario(structuredClone(p));
  const r = h.engine.runPlan(structuredClone(p));
  const last = r.rows ? r.rows[r.rows.length-1] : null;
  console.log(k.padEnd(22), 'valid', v.valid, 'errs', JSON.stringify(v.issues.filter(i=>i.severity==='ERROR').map(i=>i.code+'@'+i.path)), 'warns', JSON.stringify(v.issues.filter(i=>i.severity!=='ERROR').map(i=>i.code)).slice(0,200),
    '| engine', r.status, r.calculationErrorCode||'', last ? 'lastAge '+last.age+' total '+Math.round(last.total)+' spend '+Math.round(last.spending)+' inc '+Math.round(last.income) : '');
}
