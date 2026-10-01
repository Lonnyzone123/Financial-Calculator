// CONTRIB-08 (P3): the employer fields matchRate, matchCap and profitShare have no type or range check in either the validator or
// the engine's input gate. A non-numeric profitShare silently becomes 0 (valid, status ok); a negative one also cancels the match;
// a non-numeric matchRate passes the validator and then ends the run in a calculation error. (Q51 lists these fields as
// zero-coverage, an open hardening question.)
'use strict';
const { h, acct, work } = require('./lib.js');
const cases = { control: {}, 'profitShare "abc"': { profitShare: 'abc' }, 'profitShare -10': { profitShare: -10 }, 'matchRate "abc"': { matchRate: 'abc' } };
for (const [k, extra] of Object.entries(cases)) {
  const a = acct('k', 'traditional401k', 0, Object.assign({ contribution: 10000, matchOn: true, matchRate: 50, matchCap: 6, profitShare: 5 }, extra));
  const p = work({ age: 45, salary: 100000, retireAge: 46, endAge: 46, accounts: [acct('brok', 'taxable', 0), a] });
  const v = h.validateScenario(structuredClone(p)), r = h.engine.runPlan(structuredClone(p));
  const issues = v.issues.filter(i => i.severity !== 'INFO').map(i => i.code);
  console.log(`${k.padEnd(18)} validator valid=${v.valid} ${JSON.stringify(issues)} | runPlan ${r.status} ${r.calculationErrorCode || ''} | 401(k) ${r.rows ? r.rows[1].preTax : '-'} (control 18000 = 10000 + match 3000 + profit 5000)`);
}
