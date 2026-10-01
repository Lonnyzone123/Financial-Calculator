const { h, plan, run } = require('./lib.js');
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rnd() * a.length)];
let n = 0, bad = 0, invalid = 0, notok = 0;
for (let t = 0; t < 1500; t++) {
  const a = pick([55, 58, 60, 62, 63, 64, 65, 66, 67, 68]), b = pick([55, 58, 60, 62, 63, 64, 65, 66, 67, 68, 70]);
  const o = { ssBenefit: pick([0, 500, 1200, 2000, 3000]), spouseSS: pick([0, 500, 1200, 2000, 3000]),
    ssClaim: pick([62, 62.5, 64, 66, 67, 67.5, 70]), spouseClaim: pick([62, 63.5, 65, 67, 68, 70]),
    salary: pick([0, 0, 30000, 60000, 150000]), spouseSalary: pick([0, 0, 30000, 60000, 150000]),
    selfLife: pick([120, 120, 64.5, 67.5, 70, 75]), spouseLife: pick([120, 120, 63.5, 66.5, 72]), survivor: rnd() < 0.7,
    retireAge: pick([60, 63, 64.5, 66, 68]), cola: pick([0, 2.8]) };
  const mk = (sa, sb, x) => { const p = plan({ couple: true, age: sa, spouseAge: sb, retireAge: Math.max(x.retireAge, Math.min(sa, sb)), endAge: Math.max(sa, sb) + 8,
    ssBenefit: x.ssBenefit, spouseSS: x.spouseSS, salary: x.salary, spouseSalary: x.spouseSalary,
    ret: { ssClaim: x.ssClaim, spouseClaim: x.spouseClaim, survivor: x.survivor, selfLife: x.selfLife, spouseLife: x.spouseLife, ssCola: x.cola } });
    p.employment.contributionStop = 80; return p; };
  const p1 = mk(a, b, o);
  const p2 = mk(b, a, Object.assign({}, o, { ssBenefit: o.spouseSS, spouseSS: o.ssBenefit, ssClaim: o.spouseClaim, spouseClaim: o.ssClaim,
    salary: o.spouseSalary, spouseSalary: o.salary, selfLife: o.spouseLife, spouseLife: o.selfLife }));
  p2.profile.retireAge = p1.profile.retireAge; p2.profile.endAge = p1.profile.endAge - a + b;
  const r1 = run(p1, true), r2 = run(p2, true);
  if (!r1._valid || !r2._valid) { invalid++; continue; }
  if (r1.status !== "ok" || r2.status !== "ok") { notok++; if (notok<=5) console.log("NOTOK", r1.status, r1.calculationErrorCode, r2.status, r2.calculationErrorCode, JSON.stringify(o), a, b); continue; }
  n++;
  const m = Math.min(r1.rows.length, r2.rows.length);
  for (let i = 1; i < m; i++) if (Math.abs(r1.rows[i].income - r2.rows[i].income) > 0.01) { bad++; if (bad <= 8) console.log('DIFF', JSON.stringify(o), a, b, 'row', i, r1.rows[i].income, r2.rows[i].income); break; }
}
console.log('compared', n, 'mismatching plans', bad, 'invalid', invalid, 'not ok', notok);
