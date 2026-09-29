'use strict';
// Edge probes: both deaths in one row, a death in the last row, a spouse far younger than self, a spouse past self's endAge.
const L = require('./lib.js');
const inc = [{ name: 'Annuity', type: 'pension', owner: 'household', amount: 100000, start: 0, end: 200, growth: 0, growthMode: 'fixed' }];
const cases = {
  bothSameRow: { profile: { age: 70, spouseAge: 70, endAge: 90 }, retirement: { selfLife: 75, spouseLife: 75.5, otherIncomes: inc } },
  bothSameRowOffset: { profile: { age: 70, spouseAge: 68, endAge: 90 }, retirement: { selfLife: 75, spouseLife: 73, otherIncomes: inc } },
  deathLastRow: { profile: { age: 70, spouseAge: 70, endAge: 76 }, retirement: { selfLife: 75, spouseLife: 95, otherIncomes: inc } },
  deathAfterEnd: { profile: { age: 70, spouseAge: 70, endAge: 76 }, retirement: { selfLife: 76, spouseLife: 95, otherIncomes: inc } },
  spousePastEnd: { profile: { age: 70, spouseAge: 85, endAge: 80 }, retirement: { selfLife: 95, spouseLife: 100, otherIncomes: inc } },
  selfDeadSpouseYoung: { profile: { age: 70, spouseAge: 40, endAge: 100, retireAge: 60 }, retirement: { selfLife: 71, spouseLife: 45, otherIncomes: inc } },
  halfStart: { profile: { age: 70.5, spouseAge: 70, endAge: 74 }, retirement: { selfLife: 71, spouseLife: 95, otherIncomes: inc } },
};
for (const [k, o] of Object.entries(cases)) {
  const p = L.couple(o);
  const c = L.check(p);
  const r = L.runRaw(p);
  console.log(k, 'valid', c.valid, c.errs.map(e => e.code).join(','), 'status', r.status, r.calculationErrorCode || '',
    '| rows', r.rows.map(x => x.age + ':' + Math.round(x.taxes)).join(' '),
    '| codes', (r.issues || []).map(i => i.code).filter(x => /DEATH|SURVIVOR|NOBODY|FILING|ROLLOVER/.test(x)).join(','));
}
