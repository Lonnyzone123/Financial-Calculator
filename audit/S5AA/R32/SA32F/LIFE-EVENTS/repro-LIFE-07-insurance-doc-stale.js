'use strict';
// LIFE-07: MODEL_ASSUMPTIONS section 8 says insurance in the opening row of a plan starting at or past selfLife is
// "decided, not yet built" and "Today the engine still does not do this"; the engine does it.
// Run: node repro-LIFE-07-insurance-doc-stale.js
const L = require('./lib.js');
function net(selfLife) {
  const p = L.couple({ profile: { age: 70, spouseAge: 68, endAge: 73 }, retirement: { selfLife },
    advanced: { networthOn: true, insurance: 250000 } });
  const c = L.check(p); if (!c.valid) throw new Error(JSON.stringify(c.errs));
  const r = L.run(p);
  return { selfLife, openingNetworth: r.rows[0].networth, openingTotal: r.rows[0].total };
}
// hand, per section 8's decided rule: the opening row counts insurance when start age (70) >= selfLife.
const a = net(70), b = net(90);
console.log(JSON.stringify(a), JSON.stringify(b));
console.log('opening-row insurance counted:', a.openingNetworth - a.openingTotal, '(hand under the decided rule: 250000; section 8 says the engine gives 0)');
