const { h, plan, run } = require('./lib.js');
for (const claim of [67, 67.5]) {
  const p = plan({ age: 62, endAge: 71, ssBenefit: 2000, ret: { ssClaim: claim, ssCola: 10 } });
  const r = run(p);
  console.log('claim', claim, r._valid, r.status, r.rows.map(x => x.age + ':' + x.income).join(' '));
  for (const a of [67, 67.5, 68, 69, 70]) console.log('  ssPiaAt', a, h.engine.ssPiaAt(p, 'self', a, 0));
}
