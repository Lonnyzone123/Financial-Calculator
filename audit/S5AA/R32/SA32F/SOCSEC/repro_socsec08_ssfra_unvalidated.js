'use strict';
// SOCSEC-08: retirement.ssFra is not validated. The validator range-checks ssClaim and spouseClaim (62-70) but accepts
// any full retirement age, and the engine pays delayed credits BEFORE 62 or early reductions AFTER 70 from it.
// Law (SSA FRA table): FRA is 66 to 67 for everyone who can still claim (born 1943 or later).
// Run: node repro_socsec08_ssfra_unvalidated.js
const { single, run, report, h } = require('./lib.js');
let bad = 0;
// ssFra 60, claim 62: engine factor 1 + 2*0.08 = 1.16 -> 2000*1.16*12 = 27,840. Law (born 1964, FRA 67): 16,800.
{
  const p = single({ age: 62, ssBenefit: 2000, ssClaim: 62, ssFra: 60 });
  const v = h.validateScenario(structuredClone(p));
  console.log('ssFra 60 validates: ' + v.valid + ', issues: ' + JSON.stringify(v.issues.filter(x => /ssFra/.test(x.path || '')).map(x => x.code)));
  bad += report('ssFra 60, claim 62, row 62-63', 16800, run(p).rows[1].income);
}
// ssFra 75, claim 70: 60 months early -> 70% -> 16,800 where the law's maximum-credit claim pays 29,760.
{
  const p = single({ age: 70, ssBenefit: 2000, ssClaim: 70, ssFra: 75 });
  bad += report('ssFra 75, claim 70, row 70-71', 29760, run(p).rows[1].income);
}
console.log(`plans run: 2; mismatches: ${bad}`);
