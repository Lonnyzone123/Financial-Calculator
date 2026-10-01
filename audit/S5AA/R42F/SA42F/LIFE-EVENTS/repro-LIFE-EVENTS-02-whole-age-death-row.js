// LIFE-EVENTS-02: with a whole-number lifespan L, the engine treats the person as dead for the whole of the row opening
// at L (no Social Security, no wages: "A death at lifespan L happens as the row opening at L begins") and yet projects
// that row in full -- a whole year of spending (and Medicare, filing) for a household in which nobody is alive.
// Run: node repro-LIFE-EVENTS-02-whole-age-death-row.js
const { run, show, codes, basePlan, account } = require('./lib.js');
function mk(selfLife) {
  const p = basePlan({ age: 85, endAge: 95, spending: 30000, dividendOn: true, dividendYield: 0,
    accounts: [account('brok', 'taxable', 500000, { basisPct: 100 })] });
  Object.assign(p.retirement, { ssBenefit: 2000, ssClaim: 67, ssCola: 0, selfLife });
  return p;
}
for (const L of [87, 87.5, 85]) {
  console.log('=== single, age 85, SS $2,000 PIA claimed at 67, spending $30,000, selfLife ' + L);
  const r = run(mk(L));
  show(r, ['age', 'income', 'spending', 'withdrawals', 'taxes', 'total']);
  const i = (r.issues || []).find(x => x.code === 'PROJECTION_ENDS_AT_LAST_DEATH');
  console.log('PROJECTION_ENDS_AT_LAST_DEATH state: ' + JSON.stringify(i && { stoppedAtRowOpening: i.state.stoppedAtRowOpening, lastRowAge: i.state.lastRowAge }));
}
console.log('Hand, selfLife 87: born 1941, FRA 65y8m, claim 67 = 16 months of credits: 2,000 x (1 + 16 x 2/300) = 2,213.33 -> $2,213/mo = $26,556/yr.');
console.log('  Rows 86, 87: draw 30,000 - 26,556 = 3,444 each; balance 493,112 at 87, when the person dies.');
console.log('  The engine pays $0 Social Security in row 88 (dead for the whole row) but still spends $30,000: 463,112.');
