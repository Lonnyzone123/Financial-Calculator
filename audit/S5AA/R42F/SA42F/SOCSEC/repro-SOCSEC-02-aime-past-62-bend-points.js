// SOCSEC-02: on the AIME path, a person already past 62 when the plan opens gets 2026's bend points and the AIME unindexed, where the
// engine's own rule (R36) is the bend points of the year they turned 62, set by the wage stand-in, with the AIME indexed alike.
// Run: node repro-SOCSEC-02-aime-past-62-bend-points.js
const { plan, run } = require('./lib.js');
const fd = x => Math.floor(x * 10 + 1e-6) / 10, fl = x => Math.floor(x + 1e-6);
function pia(aime, idx) {           // the engine's documented rule, written out: bend points x idx rounded to $1, AIME x idx
  const b1 = Math.floor(1286 * idx + 0.5), b2 = Math.floor(7749 * idx + 0.5), a = aime * idx;
  return { b1, b2, a, pia: fd(0.9 * Math.min(a, b1) + 0.32 * Math.max(0, Math.min(a, b2) - b1) + 0.15 * Math.max(0, a - b2)) };
}
function caseFor(age, label) {
  const p = plan({ age, endAge: 68, ssBenefit: 0, ret: { ssAdvanced: true, aime: 6000, ssClaim: 67, ssCola: 0 } });
  p.employment.growth = 3;                                     // the wage-index stand-in
  const r = run(p);
  const idx = Math.pow(1.03, 62 - Math.floor(age));            // year turning 62 is 2026 + (62 - floor(age)); negative exponent = earlier year
  const hpia = pia(6000, idx);
  const row = r.rows.find(x => x.age === 68);
  console.log(`${label}: age ${age} valid ${r._valid} status ${r.status}  hand bend points ${hpia.b1}/${hpia.b2}, AIME ${hpia.a.toFixed(2)}, PIA ${hpia.pia}` +
    `  -> row 68 hand ${fl(hpia.pia) * 12}  engine ${row.income}  diff ${row.income - fl(hpia.pia) * 12}`);
}
caseFor(60, 'Control (turns 62 in 2028)');
caseFor(62, 'Control (turns 62 in 2026)');
caseFor(65, 'Defect  (turned 62 in 2023)');
caseFor(66, 'Defect  (turned 62 in 2022)');
// Against SSA's actual 2023 bend points ($1,115 / $6,721; 20 CFR 404.212(b): the formula "for the year you reach age 62"),
// an AIME of $6,000 gives .9 x 1,115 + .32 x (6,000 - 1,115) = 2,566.70 -> $2,566 a month, $30,792 a year at FRA; the engine pays 31,980.
console.log('Actual-2023-bend-point PIA:', fd(0.9 * 1115 + 0.32 * (6000 - 1115)), '->', fl(fd(0.9 * 1115 + 0.32 * (6000 - 1115))) * 12);
