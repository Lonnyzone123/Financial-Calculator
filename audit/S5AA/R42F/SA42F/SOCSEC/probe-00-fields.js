const { h, plan, run } = require('./lib.js');
const p = plan({ age: 66, endAge: 69, ssBenefit: 2000, ret: { ssClaim: 67 } });
const r = run(p);
console.log(Object.keys(r.rows[1]).join(' '));
console.log(r.rows.map(x => [x.age, x.socialSecurity, x.ss, x.income].join(',')).join('\n'));
console.log(Object.keys(r).join(' '));
