const { h, acct, work, run, bal } = require('./lib.js');
const cases = { control: {}, psString: { profitShare: 'abc' }, psNeg: { profitShare: -10 }, rateString: { matchRate: 'abc' }, capString: { matchCap: 'x' }, vestString: { vesting: 'abc', yearsOfService: undefined }, vest500: { vesting: 500 }, rateNeg: { matchRate: -50 }, ps150: { profitShare: 150 } };
for (const [k, extra] of Object.entries(cases)) {
  const a = acct('k', 'traditional401k', 0, Object.assign({ contribution: 10000, matchOn: true, matchRate: 50, matchCap: 6, profitShare: 5, vesting: 100 }, extra));
  const p = work({ age: 45, salary: 100000, retireAge: 46, endAge: 46, accounts: [acct('brok', 'taxable', 0), a] });
  const v = h.validateScenario(structuredClone(p)); const r = h.engine.runPlan(structuredClone(p));
  console.log(k.padEnd(10), 'valid', v.valid, v.issues.filter(i => i.severity !== 'INFO').map(i => i.severity[0] + ':' + i.code + '@' + (i.path||'')).join(' '), '| status', r.status, r.calculationErrorCode || '', '| preTax', r.rows && r.rows[1] && r.rows[1].preTax);
}
