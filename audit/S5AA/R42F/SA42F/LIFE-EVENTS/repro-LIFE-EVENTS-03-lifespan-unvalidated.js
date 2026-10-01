// LIFE-EVENTS-03: retirement.selfLife / spouseLife are not checked by the validator or the engine's input gate. A string,
// null, a boolean or a negative number is accepted (valid, status ok) and silently changes who is alive:
// "abc" -> NaN -> "a lifespan that is not a finite number ends nothing" (the person never dies);
// null / true / -5 -> Number() 0 / 1 / -5 -> the person is dead before the plan starts.
// Run: node repro-LIFE-EVENTS-03-lifespan-unvalidated.js
const { basePlan, account, h } = require('./lib.js');
function base() {
  const p = basePlan({ couple: true, age: 70, spouseAge: 68, endAge: 80, spending: 30000, dividendOn: true, dividendYield: 0,
    accounts: [account('brk', 'taxable', 800000, { basisPct: 100 })] });
  Object.assign(p.retirement, { ssBenefit: 2000, ssClaim: 70, spouseSS: 1000, spouseClaim: 68, ssCola: 0, survivor: true,
    survivorSpendingReduction: 0, selfLife: 85, spouseLife: 72 });
  return p;
}
const cases = { 'control selfLife 85': p => {}, 'selfLife "abc"': p => { p.retirement.selfLife = 'abc'; },
  'selfLife null': p => { p.retirement.selfLife = null; }, 'selfLife true': p => { p.retirement.selfLife = true; },
  'spouseLife -5': p => { p.retirement.spouseLife = -5; },
  'control ssBenefit "abc" (R42 repair, refused)': p => { p.retirement.ssBenefit = 'abc'; } };
for (const [k, m] of Object.entries(cases)) {
  const p = base(); m(p);
  const v = h.validateScenario(structuredClone(p)), r = h.engine.runPlan(structuredClone(p));
  const rows = r.rows || [], row73 = rows.find(x => x.age === 73), last = rows[rows.length - 1];
  console.log(k.padEnd(46), '| validator valid=' + v.valid, JSON.stringify(v.issues.filter(i => i.severity === 'ERROR').map(i => i.code + '@' + i.path)),
    '| engine', r.status, r.calculationErrorCode || '', last ? '| row 73 income ' + Math.round(row73.income) + ', last row ' + last.age + ' total ' + Math.round(last.total) : '',
    '| issues', (r.issues || []).filter(i => /DEATH|LAST_DEATH|SURVIVOR_FILING/.test(i.code)).map(i => i.code).join(','));
}
