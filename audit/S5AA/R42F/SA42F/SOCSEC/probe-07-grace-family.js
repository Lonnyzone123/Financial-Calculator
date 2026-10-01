const { h, plan, run } = require('./lib.js');
const E = h.engine;
const p = plan({ couple: true, age: 63, spouseAge: 67, retireAge: 63.5, endAge: 66, ssBenefit: 3000, spouseSS: 0, salary: 200000,
  ret: { ssClaim: 62, spouseClaim: 67 } });
p.employment.contributionStop = 63.5;
const r = run(p);
console.log(r._valid, r.status, r.rows.map(x => x.age + ':' + x.income).join(' '));
console.log(JSON.stringify(E.householdSocialSecurityDetail(p, 63, 64, 67, 0, { self: 100000, spouse: 0 }, { self: 0, spouse: 0 })));
// spouse working too, with own PIA small
const p2 = plan({ couple: true, age: 63, spouseAge: 63, retireAge: 63.5, endAge: 66, ssBenefit: 3000, spouseSS: 500, salary: 200000, spouseSalary: 40000,
  ret: { ssClaim: 62, spouseClaim: 63 } });
p2.employment.contributionStop = 63.5;
const r2 = run(p2);
console.log(r2._valid, r2.status, r2.rows.map(x => x.age + ':' + x.income).join(' '));
console.log(JSON.stringify(E.householdSocialSecurityDetail(p2, 63, 64, 63, 0, { self: 100000, spouse: 20000 }, { self: 0, spouse: 0 })));
