const L = require('./lib.js');
const p = L.couple({ retirement: { ssBenefit: 1000, spouseSS: 3000, spouseClaim: 70, spouseLife: 65 }, profile: { endAge: 72 } });
console.log(JSON.stringify(L.check(p)));
const r = L.runRaw(p);
console.log(r.status, r.calculationErrorCode);
console.log(Object.keys(r).join(','));
console.log(Object.keys(r.rows[1]).join(','));
