'use strict';
// FLOWS-05 candidate: the survivor spending reduction reads who is alive at the RETIREMENT date when retirement falls inside a row
// (strategySpending() receives max(row opening, retireAge)), not at the row's opening, which is the engine's one definition of the
// year of death (decision 7: the row opening at or before a lifespan is the year of death, "costed for two everywhere else").
// A death at 60.25 and a retirement at 60.5 in the row 60 -> 61 make that death year a survivor year for spending only.
// Run: node repro-FLOWS-05-survivor-cut-read-at-retirement-date.js
const { plan, account, run, cmp, summary } = require('./flib.js');
function mk(retireAge) {
  const p = plan({ couple: true, age: 60, spouseAge: 60, retireAge, endAge: 63, strategy: 'incomeFirst', spending: 80000,
    accounts: [account('roth', 'rothIRA', 900000), account('sroth', 'rothIRA', 900000, { owner: 'spouse' })] });
  Object.assign(p.retirement, { survivor: true, survivorSpendingReduction: 50, selfLife: 60.25 });
  return p;
}
for (const ra of [60.5, 60]) {
  const r = run(mk(ra));
  console.log(`retireAge ${ra}: row61 spending ${r.rows[1].spending.toFixed(2)}  row62 ${r.rows[2].spending.toFixed(2)}  filing-relevant issues: ${(r.issues || []).map(i => i.code).join(',')}`);
}
// Hand: the row opening at 60 is the year of the self's death (alive at the opening: 60.25 is not before 60), so it is costed for two:
// retired for 0.5 of the row at $80,000 -> $40,000. The next row (opening 61, self dead) is a survivor row: $80,000 x 50% = $40,000.
const r = run(mk(60.5));
cmp('row61 (death year, retired half the row) = 80,000 x 0.5', r.rows[1].spending, 40000);
cmp('row62 (survivor) = 80,000 x 0.5', r.rows[2].spending, 40000);
// control: retiring at the row's opening, the death year is costed for two, as decision 7 says
cmp('control retireAge 60: row61 = 80,000', run(mk(60)).rows[1].spending, 80000);
summary();
