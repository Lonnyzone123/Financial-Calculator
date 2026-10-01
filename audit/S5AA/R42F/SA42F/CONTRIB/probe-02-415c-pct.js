const { h, acct, work, run, bal } = require('./lib.js');
for (const c of [{ps:25,m:false},{ps:0,m:true,rate:100,cap:100}]) {
const p = work({ age: 45, salary: 30000, endAge: 46, accounts: [acct('brok', 'taxable', 0), acct('k', 'traditional401k', 0, { contribution: c.m?20000:24500, profitShare: c.ps, matchOn: c.m, matchRate: c.rate||0, matchCap: c.cap||0 })] });
const { v, r } = run(p);
console.log(v.issues.map(i=>i.severity+':'+i.code).join(' '));
console.log(JSON.stringify(bal(r, 1)), r.limitWarnings);
}
