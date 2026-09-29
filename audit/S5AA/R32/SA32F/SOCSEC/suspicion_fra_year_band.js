'use strict';
// SUSPICION (not a finding): with whole-year rows and FRA 67, the row 66-67 lies wholly BEFORE FRA but gets the
// higher "year of attaining FRA" band ($65,160, $1 for $3) for its whole length. Whether that is right depends on the
// birth month, which the engine does not hold: SSA's test runs on calendar years, and for a mid-year birthday about
// half of the age-66 year falls in the calendar year BEFORE the FRA year (lower band, $24,480, $1 for $2).
// Run: node suspicion_fra_year_band.js
const { single, run } = require('./lib.js');
const p = single({ age: 66, years: 1, ssBenefit: 2000, ssClaim: 66 });
p.retirement.otherIncomes = [{ name: 'job', type: 'employment', owner: 'self', amount: 60000, start: 60, end: 67, growth: 0, growthMode: 'fixed' }];
const r = run(p);
const ss = r.rows[1].income - 60000, gross = 2000 * (1 - 12 * 5 / 900) * 12;
console.log('row 66-67: SS gross ' + gross.toFixed(2) + ', paid ' + ss.toFixed(2) + ', withheld ' + (gross - ss).toFixed(2));
console.log('lower band on the whole row would withhold ' + ((60000 - 24480) / 2).toFixed(2) + ' (capped at the benefit ' + gross.toFixed(2) + ')');
console.log('half the row on each band: ' + (Math.min(gross / 2, (30000 - 24480 * 0.5) / 2)).toFixed(2) + ' + 0');
