const { h, plan, run } = require('./lib.js');
const E = h.engine;
// mirror of probe-02: self is the auxiliary (62, PIA 600), spouse is the worker (64, PIA 2000).
const p = plan({ couple: true, age: 62, spouseAge: 64, retireAge: 70, endAge: 65, ssBenefit: 600, spouseSS: 2000,
  salary: 30000, spouseSalary: 60000, ret: { ssClaim: 62, spouseClaim: 64 } });
p.employment.contributionStop = 70;
const r = run(p);
console.log(r._valid, r.status, r.rows.map(x => x.age + ':' + x.income).join(' '));
console.log(JSON.stringify(E.householdSocialSecurityDetail(p, 62, 63, 64, 0, { self: 30000, spouse: 60000 }, { self: 0, spouse: 0 })));
