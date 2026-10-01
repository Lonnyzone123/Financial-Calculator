// SOCSEC-01: a claim inside a projection row (claim age not a whole number of years from the plan's start) permanently loses one COLA
// in every later row -- on the worker's own benefit, the spouse's spousal benefit and the survivor benefit.
// Run: node repro-SOCSEC-01-claim-inside-row-loses-cola.js
const { plan, run } = require('./lib.js');
const fd = x => Math.floor(x * 10 + 1e-6) / 10, fl = x => Math.floor(x + 1e-6);
// Hand: entered $2,000 in today's dollars at 62 (born 1964, FRA 67), 2.8% COLA each year from the plan's start, dime-rounded per step.
const pia = [2000]; for (let k = 1; k <= 10; k++) pia.push(fd(pia[k - 1] * 1.028));   // pia[k] = PIA after k COLAs (row opening 62+k)
const drc = 1 + 6 * 2 / 300;                                                               // claim 67.5 = 6 months after FRA 67
const hand = { 68: fl(pia[5] * drc) * 6, 69: fl(pia[6] * drc) * 12, 70: fl(pia[7] * drc) * 12, 71: fl(pia[8] * drc) * 12 };
const p = plan({ age: 62, endAge: 71, ssBenefit: 2000, ret: { ssClaim: 67.5, ssCola: 2.8 } });
const r = run(p);
console.log('A. single, claim 67.5  valid', r._valid, 'status', r.status);
for (const a of [68, 69, 70, 71]) { const row = r.rows.find(x => x.age === a); console.log(`  row ${a}: hand ${hand[a]}  engine ${row.income}  diff ${(row.income - hand[a]).toFixed(2)}`); }
// Control: the same plan claiming at 68 (a row boundary) carries the full count.
const pc = plan({ age: 62, endAge: 71, ssBenefit: 2000, ret: { ssClaim: 68, ssCola: 2.8 } });
const rc = run(pc), d68 = 1 + 12 * 2 / 300;
console.log('Control, claim 68: row 70 hand', fl(pia[7] * d68) * 12, 'engine', rc.rows.find(x => x.age === 70).income);
// B. survivor: same worker, married to a same-age spouse with no own benefit (spousal from 67.5); worker dies at 70; survivor on.
const ps = plan({ couple: true, age: 62, spouseAge: 62, endAge: 72, ssBenefit: 2000, spouseSS: 0,
  ret: { ssClaim: 67.5, spouseClaim: 67, ssCola: 2.8, survivor: true, selfLife: 70 } });
const rs = run(ps);
// Survivor at 70 (past survivor FRA): the deceased's PIA x the delayed credits earned (claimed at 67.5) x 1; PIA at row opening 70 = 8 COLAs.
const s71 = fl(pia[8] * drc) * 12, s72 = fl(pia[9] * drc) * 12;
// Spousal while alive, row 69 (68->69): half the worker's PIA after 6 COLAs, spouse at FRA -> no reduction.
const sp69 = fl(pia[6] * drc) * 12 + fl(0.5 * pia[6]) * 12;
console.log('B. survivor plan valid', rs._valid, 'status', rs.status);
console.log('  row 69 (worker + spousal): hand', sp69, 'engine', rs.rows.find(x => x.age === 69).income);
console.log('  row 71 (survivor):         hand', s71, 'engine', rs.rows.find(x => x.age === 71) && rs.rows.find(x => x.age === 71).income);
console.log('  row 72 (survivor):         hand', s72, 'engine', rs.rows.find(x => x.age === 72) && rs.rows.find(x => x.age === 72).income);
