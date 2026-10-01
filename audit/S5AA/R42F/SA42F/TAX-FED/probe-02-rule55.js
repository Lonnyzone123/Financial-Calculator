'use strict';
const h = require('../harness.js'); const g = h.grid;
function run(label, o, accts, mut) {
  const p = g.basePlan(Object.assign({ spending: 40000, accounts: accts }, o)); p.advanced.rule55 = true; if (mut) mut(p);
  const v = h.validateScenario(structuredClone(p)); const r = h.engine.runPlan(structuredClone(p));
  console.log(label, 'valid', v.valid, r.status, r.rows.slice(1, 4).map(x => `${x.age}: W ${x.withdrawals.toFixed(2)} T ${x.taxes.toFixed(2)}`).join(' | '));
}
// No penalty: W(1-0.145) = 40000+1240-3420-402.5 -> 37417.5/0.855 = 43763.16 ; penalty: 49559.60
run('401k sep55 age55', { age: 55, retireAge: 55, endAge: 58 }, [g.account('k', 'traditional401k', 1e6)]);
run('401k sep54 age55', { age: 54, retireAge: 54, endAge: 58 }, [g.account('k', 'traditional401k', 1e6)]);
run('IRA sep55 age56', { age: 56, retireAge: 55, endAge: 58 }, [g.account('i', 'traditionalIRA', 1e6)]);
run('spouse 401k', { age: 60, retireAge: 55, endAge: 63, couple: true, spouseAge: 54 }, [g.account('k', 'traditional401k', 1e6, { owner: 'spouse' })]);
run('spouse 401k sep at 55 own clock (spouse 53 at start, retireAge 55)', { age: 61, retireAge: 61, endAge: 66, couple: true, spouseAge: 53 }, [g.account('k', 'traditional401k', 1e6, { owner: 'spouse' })]);
