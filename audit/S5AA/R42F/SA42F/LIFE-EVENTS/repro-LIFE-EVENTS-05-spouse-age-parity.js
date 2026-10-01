// LIFE-EVENTS-05: with a spouse included, the validator rejects a non-number profile.spouseAge (WRONG_TYPE, an ERROR), but the
// engine's input gate does not refuse it (nonNumberPlanValuePath() omits it): runPlan returns status "ok" and the string is
// concatenated into every row's spouse age ("68" + 0 = "680"), moving the figures. The R25 parity sweep does not reach the
// field because its base plan has no spouse.
// Run: node repro-LIFE-EVENTS-05-spouse-age-parity.js
const { basePlan, account, h } = require('./lib.js');
function base(spouseAge) {
  const p = basePlan({ couple: true, age: 70, spouseAge, endAge: 76, spending: 30000, dividendOn: true, dividendYield: 0,
    accounts: [account('brk', 'taxable', 800000, { basisPct: 100 })] });
  Object.assign(p.retirement, { ssBenefit: 2000, ssClaim: 70, spouseSS: 1000, spouseClaim: 68, ssCola: 0, survivor: true, selfLife: 90, spouseLife: 72 });
  return p;
}
for (const sa of [68, '68']) {
  const p = base(sa), v = h.validateScenario(structuredClone(p)), r = h.engine.runPlan(structuredClone(p));
  console.log('spouseAge ' + JSON.stringify(sa) + ': validator valid=' + v.valid + ' ' + JSON.stringify(v.issues.filter(i => i.severity === 'ERROR').map(i => i.code + '@' + i.path)) +
    ' | engine ' + r.status + ' ' + (r.calculationErrorCode || '') + ' | rows ' + (r.rows || []).map(x => x.age + ':' + Math.round(x.income)).join(' ') +
    ' | final total ' + (r.rows ? Math.round(r.rows[r.rows.length - 1].total) : '-'));
}
