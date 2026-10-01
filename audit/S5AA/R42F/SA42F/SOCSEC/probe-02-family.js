const { h, plan, run } = require('./lib.js');
const E = h.engine;
function mk(o) {
  const p = plan({ couple: true, age: 64, spouseAge: 62, retireAge: 70, endAge: 67, ssBenefit: 2000, spouseSS: 600,
    salary: 60000, spouseSalary: 30000, ret: { ssClaim: 64, spouseClaim: 62 } });
  p.employment.contributionStop = 70;
  if (o) o(p);
  return p;
}
const p = mk();
const r = run(p);
console.log(r._valid, r.status, r.rows.map(x => x.age + ':' + x.income).join(' '));
const d = E.householdSocialSecurityDetail(p, 64, 65, 62, 0, { self: 60000, spouse: 30000 }, { self: 0, spouse: 0 });
console.log(JSON.stringify(d));
