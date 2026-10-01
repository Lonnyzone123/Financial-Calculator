const { run, show, codes, basePlan, account, E } = require('./lib.js');
function mk(o) {
  const p = basePlan({ couple: true, age: o.age, spouseAge: o.spouseAge, endAge: o.endAge, spending: 0, dividendOn: true, dividendYield: 0,
    accounts: [account('brk','taxable',100000,{basisPct:100})] });
  Object.assign(p.retirement, { ssBenefit: o.ss, ssClaim: o.claim, spouseSS: o.sss, spouseClaim: o.sclaim, ssCola: 0, survivor: true, selfLife: o.sl, spouseLife: o.spl });
  return p;
}
const cases = {
  A_young_survivor_unclaimed: { age:55, spouseAge:50, endAge:68, ss:3000, claim:67, sss:0, sclaim:67, sl:56.5, spl:120, hand:'spouse 60 = self-age 65: row 66 on: 3000*0.715=2145 -> 25,740' },
  B_early_claim_death_before_fra: { age:62, spouseAge:64, endAge:69, ss:3000, claim:62, sss:0, sclaim:67, sl:64.5, spl:120, hand:'rows 63,64: own 2100*12=25,200 (+spousal for spouse 65+?); after 64.5: min(3000*.979643, max(2100,2475))=2475 -> 29,700' },
  C_old_deceased_DRC_young_survivor: { age:50, spouseAge:80, endAge:62, ss:0, claim:67, sss:2000, sclaim:70, sl:120, spl:82, hand:'spouse own 2000*1.32=2640 -> 31,680 to row 52; self 60 (row 61): 2000*1.32*0.715=1887.6 -> 1887 -> 22,644' },
};
for (const [k,o] of Object.entries(cases)) { console.log('---',k,'|',o.hand); const r=run(mk(o)); show(r,['age','income']); }
