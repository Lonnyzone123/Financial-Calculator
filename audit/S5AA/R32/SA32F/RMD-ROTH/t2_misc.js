const { h, plan, acct, check, row, codes } = require('./lib.js');
function tryRun(label, p, rows) { try { const r = check(p); console.log(label, JSON.stringify(rows.map(i => row(r, i))), codes(r).join(',')); return r; } catch (e) { console.log(label, 'ERR', e.message.slice(0, 400)); } }
// still working: age 73, retire 76, salary 100k, 401k 500k
let p = plan({ age: 73, endAge: 74, retireAge: 76, accounts: [acct('k', 'traditional401k', 500000)] });
p.employment.salary = 100000; p.employment.contributionStop = 76;
tryRun('stillWorking401k', p, [1]);
// QCD 10,000 at 75, IRA 100k
tryRun('qcd75', plan({ age: 75, qcd: 10000, accounts: [acct('ira', 'traditionalIRA', 100000)] }), [1]);
// QCD 200,000 request at 75, IRA 1,000,000 -> cap 111,000
tryRun('qcdCap', plan({ age: 75, qcd: 200000, accounts: [acct('ira', 'traditionalIRA', 1000000)] }), [1]);
// QCD at 70 (row 70-71) and 70.5 start
tryRun('qcd70', plan({ age: 70, endAge: 72, qcd: 5000, accounts: [acct('ira', 'traditionalIRA', 100000)] }), [1, 2]);
// conversion + RMD, age 75
tryRun('conv75', plan({ age: 75, conversionOn: true, conversionAmount: 20000, accounts: [acct('ira', 'traditionalIRA', 100000), acct('roth', 'rothIRA', 0)] }), [1]);
// conversion bigger than capacity
tryRun('convAll75', plan({ age: 75, conversionOn: true, conversionAmount: 1e6, accounts: [acct('ira', 'traditionalIRA', 100000), acct('roth', 'rothIRA', 0)] }), [1]);
// Roth 401k at 75: no RMD
tryRun('roth401k75', plan({ age: 75, accounts: [acct('r', 'roth401k', 100000)] }), [1]);
// 401k + IRA separate at 75
tryRun('k+ira75', plan({ age: 75, accounts: [acct('ira', 'traditionalIRA', 100000), acct('k', 'traditional401k', 50000, { priority: 1 })] }), [1]);
// start ages: 66 (1960 -> 75), 67 (1959 -> 73), 72 (1954 ->73)
for (const a of [66, 67, 72, 73, 74]) { const r = check(plan({ age: a, endAge: 76, accounts: [acct('ira', 'traditionalIRA', 100000)] })); console.log('start', a, r.rows.slice(1).map(x => x.age + ':' + x.rmd.toFixed(2)).join(' '), codes(r).join(',')); }
