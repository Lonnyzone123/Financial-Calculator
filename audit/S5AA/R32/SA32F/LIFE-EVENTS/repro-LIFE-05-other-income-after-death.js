'use strict';
// LIFE-05: a recurring "Social Security" (and "Pension") other income owned by a person keeps paying after that person dies.
// Run: node repro-LIFE-05-other-income-after-death.js
const L = require('./lib.js');
function build(type) {
  return L.couple({ profile: { age: 70, spouseAge: 70, retireAge: 60, endAge: 76 },
    retirement: { spouseLife: 72, spending: 0, survivor: false,
      otherIncomes: [{ name: 'Spouse benefit', type, owner: 'spouse', amount: 24000, start: 0, end: 200, growth: 0, growthMode: 'fixed' }] } });
}
for (const type of ['socialSecurity', 'pension']) {
  const p = build(type);
  const c = L.check(p);
  const r = L.run(p);
  // hand: the spouse is alive in rows opening at 70 and 71; the engine's own convention (the core benefit, wages) is that a death at lifespan L happens as the row opening at L begins, so the rows opening at 72 and later pay the decedent nothing.
  //   Social Security: 42 USC 402(a) -- the benefit ends "with the month preceding the month in which he dies" -> 0 after.
  //   (For a pension the continuation is an assumption; the point is whether it is disclosed.)
  console.log(type, 'valid', c.valid, 'status', r.status);
  console.log(JSON.stringify(r.rows.slice(1).map(x => ({ age: x.age, income: x.income, handIncome: type === 'socialSecurity' ? (x.age <= 72 ? 24000 : 0) : null }))));
  console.log('warnings:', r.issues.map(i => i.code).filter(x => /PENSION|SURVIVOR|DEATH|OUTSIDE/.test(x)).join(','));
}
