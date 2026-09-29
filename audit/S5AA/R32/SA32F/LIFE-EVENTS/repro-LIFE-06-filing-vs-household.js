'use strict';
// LIFE-06: the filing status is not checked against the household. A one-person plan entered as "mfj" (the app's default
// profile) is taxed on joint brackets for its whole life with no warning; a couple entered as "hoh" keeps head-of-household
// status for both spouses and for the survivor.
// Run: node repro-LIFE-06-filing-vs-household.js
const L = require('./lib.js');
const inc = [{ name: 'Annuity', type: 'pension', owner: 'self', amount: 100000, start: 0, end: 200, growth: 0, growthMode: 'fixed' }];
function one(filing) {
  const p = L.couple({ profile: { age: 60, spouseOn: false, filing, retireAge: 55, endAge: 62 }, retirement: { otherIncomes: inc } });
  const v = L.h.validateScenario(structuredClone(p));
  const r = L.run(p);
  return { filing, valid: v.valid, validatorIssues: v.issues.map(i => i.code).join(','), tax: r.rows[1].taxes,
    engineWarnings: r.issues.filter(i => /FILING|SPOUSE|MFJ/.test(i.code)).map(i => i.code).join(',') };
}
console.log('defaults profile:', JSON.stringify(L.h.defaults.profile));
// hand (under 65, $100,000 ordinary): single fed 13,170 + AZ 2,097.50 = 15,267.50; MFJ fed 7,640 + AZ 1,695 = 9,335
console.log(JSON.stringify(one('mfj')), 'hand single 15267.5 / mfj 9335');
console.log(JSON.stringify(one('single')));
const c = L.couple({ profile: { age: 60, spouseAge: 60, filing: 'hoh', retireAge: 55, endAge: 64 }, retirement: { spouseLife: 61, otherIncomes: inc } });
const vc = L.h.validateScenario(structuredClone(c)); const rc = L.run(c);
console.log('couple hoh valid', vc.valid, 'issues', vc.issues.map(i => i.code).join(','), 'taxes', rc.rows.slice(1).map(x => x.taxes).join(','),
  'warnings', rc.issues.map(i => i.code).filter(x => /FILING/.test(x)).join(','));
