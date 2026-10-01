const { h, plan, run } = require('./lib.js');
for (const life of [66.5, 68, 120]) {
const p = plan({ couple: true, age: 62, spouseAge: 70, retireAge: 66, endAge: 72, ssBenefit: 3000, spouseSS: 0, salary: 200000,
  ret: { ssClaim: 62, spouseClaim: 67, survivor: true, selfLife: life } });
p.employment.contributionStop = 66;
const r = run(p);
console.log('life', life, r._valid, r.status, r.rows.map(x => x.age + ':' + x.income).join(' '));
}
