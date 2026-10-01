// Independent sweep of the IRA window (R42 R41F-03 repair) and compensation cap on row 1, both owners' IRAs.
const { h, acct, work, run } = require('./lib.js');
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
let n = 0, bad = 0;
for (let t = 0; t < 400; t++) {
  const a = pick([40, 44, 45, 48, 49, 55]), s = pick([38, 44, 45, 46, 49, 52, 60]);
  const R = pick([a, a + 0.25, a + 0.5, a + 1, s + 0.5, s + 0.25, 70]);
  const stop = pick([R, a + 0.5, s + 0.75, 80, a + 0.25]);
  const Ls = pick([120, a + 0.5, a + 0.25]), Lsp = pick([120, s + 0.5, s + 0.75]);
  const filing = pick(['mfj', 'mfj', 'single']);
  const sal = pick([0, 3000, 100000]), ssal = pick([0, 4000, 100000]);
  const rq = pick([7500, 10000, 3000]), rqs = pick([0, 7500, 9000]);
  const endAge = Math.max(a + 1, R);
  const p = work({ age: a, couple: true, spouseAge: s, retireAge: R, stop, endAge, salary: sal, spouseSalary: ssal, selfLife: Ls, spouseLife: Lsp, filing,
    accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('iraS', 'traditionalIRA', 0, { contribution: rq, priority: 1 }), acct('iraP', 'traditionalIRA', 0, { owner: 'spouse', contribution: rqs, priority: 2 })] });
  const { v, r } = run(p, true);
  if (!v.valid || r.status !== 'ok') continue;
  const cl = (x) => Math.max(0, Math.min(1, x));
  const ws = cl(Math.min(R - a, Ls - a)), wp = cl(Math.min(R - s, Lsp - s));
  const joint = filing === 'mfj';
  const ownS = Math.max(0, Math.min(stop - a, ws)), ownP = Math.max(0, Math.min(stop - s, wp));
  const winS = Math.max(ownS, joint ? Math.max(0, Math.min(stop - a, wp, cl(Ls - a))) : 0);
  const winP = Math.max(ownP, joint ? Math.max(0, Math.min(stop - s, ws, cl(Lsp - s))) : 0);
  const lim = (age) => 7500 + (age + 1 >= 50 ? 1100 : 0);
  let dS = winS > 0 ? Math.min(rq * winS, lim(a)) : 0, dP = winP > 0 ? Math.min(rqs * winP, lim(s)) : 0;
  const compS = sal * ws, compP = ssal * wp;
  if (joint) { let pool = compS + compP; dS = Math.min(dS, pool); pool -= dS; dP = Math.min(dP, pool); }
  else { dS = Math.min(dS, compS); dP = Math.min(dP, compP); }
  const got = r.rows[1].preTax; n++;
  if (Math.abs(got - (dS + dP)) > 0.01) { bad++; if (bad <= 12) console.log('MISMATCH', JSON.stringify({ a, s, R, stop, Ls, Lsp, filing, sal, ssal, rq, rqs }), 'engine', got, 'expected', dS + dP, { winS, winP, dS, dP }); }
}
console.log('cases', n, 'mismatches', bad);
