// SOCSEC-04: months a SURVIVOR benefit is withheld by the survivor's earnings test are credited to the survivor's OWN retirement
// reduction factor -- including months before the retirement benefit was claimed -- and the survivor benefit's own factor is never
// adjusted (20 CFR 404.412 adjusts each reduced benefit for its own deduction months).
// Run: node repro-SOCSEC-04-survivor-withholding-credits-own-rib.js
const { h, plan, run } = require('./lib.js');
const fl = x => Math.floor(x + 1e-6);
// Self 60 (born 1966: FRA 67, survivor FRA 67), own PIA 2,800 claimed at 62, salary $100,000 to 63. Spouse 62, PIA 3,000, never claims
// (planned 67), dies at 62.5 (self 60.5). Survivor on. Zero COLA/return/inflation/spending.
const p = plan({ couple: true, age: 60, spouseAge: 62, retireAge: 63, endAge: 70, ssBenefit: 2800, spouseSS: 3000, salary: 100000,
  ret: { ssClaim: 62, spouseClaim: 67, survivor: true, spouseLife: 62.5 } });
p.employment.contributionStop = 63;
const r = run(p);
// Hand.
const wibStartMonths = (67 - 60.5) * 12;                         // 78 reduction months for a survivor benefit starting at 60.5
const wibFactor = m => 1 - 0.285 * m / 84;                       // 28.5% spread over the 84 months from 60 to 67 (engine's own rule)
const wib0 = fl(3000 * wibFactor(wibStartMonths));               // 2,206: deceased died before FRA, never claimed -> 100% of PIA
const ribFactor = m => 1 - Math.min(36, m) * 5 / 900 - Math.max(0, m - 36) * 5 / 1200;
// Earnings test: (100,000 - 24,480)/2 = 37,760 a year > every year's benefit, so everything is withheld in rows 60.5-61, 61-62, 62-63:
// survivor benefit withheld 30 months (60.5 to 63); the retirement benefit, entitled from 62, withheld 12 months (62 to 63).
const ribLaw = fl(2800 * ribFactor(60 - 12));                    // 2,100: only the 12 RIB months withheld while entitled are excluded
const ribEngineReading = fl(2800 * ribFactor(60 - 30));          // 2,333: what crediting all 30 survivor-withheld months gives
const wibLaw = fl(3000 * wibFactor(wibStartMonths - 30));        // 2,511: the survivor benefit's own adjustment at FRA (404.412)
console.log('valid', r._valid, 'status', r.status);
console.log(r.rows.map(x => x.age + ':' + x.income).join('  '));
const row68 = r.rows.find(x => x.age === 68).income;
console.log(`row 68 (67-68): law max(RIB ${ribLaw}, WIB ${wibLaw}) x 12 = ${Math.max(ribLaw, wibLaw) * 12};` +
  ` even with no survivor adjustment at all, max(RIB ${ribLaw}, WIB ${wib0}) x 12 = ${Math.max(ribLaw, wib0) * 12}; engine ${row68}` +
  ` (= ${ribEngineReading} x 12, the RIB credited with the survivor's 30 months)`);
// Control: no salary -> nothing withheld, survivor benefit 2,206 throughout, engine and hand agree.
const pc = structuredClone(p); pc.employment.salary = 0;
const rc = run(pc);
console.log('control (no wages) row 68: hand', Math.max(fl(2800 * 0.70), wib0) * 12, 'engine', rc.rows.find(x => x.age === 68).income);
