// SOCSEC-03: four Social Security / pension scalars are typed by neither the validator nor the engine's input gate, the class R42
// closed for ssBenefit/spouseSS (R41F-05). A malformed value is accepted and silently replaced (ssCola, aime) or fails later under an
// unrelated symptom code (pension, pensionCola). Run: node repro-SOCSEC-03-untyped-ss-pension-scalars.js
const { plan, run } = require('./lib.js');
function show(label, mut) {
  const p = plan({ age: 66, endAge: 69, ssBenefit: 2000, ret: { ssClaim: 67, ssCola: 0 } });
  mut(p);
  const r = run(p, true);
  const v = r._vissues.filter(x => x.severity === 'ERROR').map(x => x.code + '@' + x.path);
  console.log(`${label.padEnd(34)} validator ${r._valid ? 'VALID' : 'invalid ' + v.join(',')} | engine ${r.status} ${r.calculationErrorCode || ''} ${r.rows && r.rows.length ? 'rows ' + r.rows.slice(1).map(x => x.income).join('/') : ''}`);
}
show('control ssCola 0', p => {});
show('control ssCola 2.8', p => { p.retirement.ssCola = 2.8; });
show('ssCola "abc"  (R42 rule: WRONG_TYPE)', p => { p.retirement.ssCola = 'abc'; });        // runs at the 2.8% rules default
show('control AIME 4000, ssAdvanced', p => { Object.assign(p.retirement, { ssAdvanced: true, aime: 4000 }); });
show('aime "abc", ssAdvanced', p => { Object.assign(p.retirement, { ssAdvanced: true, aime: 'abc' }); });  // falls back to ssBenefit 2000
show('aime -1, ssAdvanced', p => { Object.assign(p.retirement, { ssAdvanced: true, aime: -1 }); });
show('control pension 12000', p => { Object.assign(p.retirement, { pension: 12000 }); });
show('pension "abc"', p => { p.retirement.pension = 'abc'; });
show('pension -1000', p => { p.retirement.pension = -1000; });
show('pensionCola "abc" (pension 12000)', p => { Object.assign(p.retirement, { pension: 12000, pensionCola: 'abc' }); });
