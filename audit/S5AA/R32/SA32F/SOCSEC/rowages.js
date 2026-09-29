'use strict';
const { couple, run } = require('./lib.js');
const r = run(couple({ age: 57.5, spouseAge: 70, years: 5, ssBenefit: 0, ssClaim: 67, spouseSS: 2500, spouseClaim: 67, spouseLife: 71 }));
console.log(JSON.stringify(r.rows.map(x => [x.age, x.income])));
