const { h, plan, run } = require('./lib.js');
for (const sal of [100000, 0]) {
const p = plan({ couple: true, age: 60, spouseAge: 62, retireAge: 63, endAge: 69, ssBenefit: 2800, spouseSS: 3000, salary: sal,
  ret: { ssClaim: 62, spouseClaim: 67, survivor: true, spouseLife: 62.5 } });
p.employment.contributionStop = 63;
const r = run(p);
console.log('salary', sal, r._valid, r.status, r.rows.map(x => x.age + ':' + Math.round(x.income - (x.age<=63 ? 0 : 0))).join(' '));
}
