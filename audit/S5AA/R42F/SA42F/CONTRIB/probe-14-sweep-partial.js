// Independent sweep, row 1, fractional starts (partial first row), both spouses: IRA + 401(k) deposits.
const { h, acct, work, run } = require('./lib.js');
let seed = 777; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
let n = 0, bad = 0;
for (let t = 0; t < 500; t++) {
  const a = pick([44.5, 45.25, 45, 49.5, 48.75]), s = pick([43.5, 45.75, 46, 49.25, 59.5]);
  const span = a % 1 ? 1 - (a % 1) : 1;
  const R = pick([a + 0.1, a + span / 2, a + span, 70, s + 0.2]);
  const stop = pick([R, 80, a + span / 4, s + 0.3]);
  const Ls = pick([120, a + span / 2]), Lsp = pick([120, s + 0.1]);
  const filing = pick(['mfj', 'mfj', 'single']);
  const sal = pick([0, 5000, 150000]), ssal = pick([0, 6000, 150000]);
  const rq = pick([7500, 12000]), rqs = pick([0, 9000]), rk = pick([0, 30000]), rks = pick([0, 26000]);
  const p = work({ age: a, couple: true, spouseAge: s, retireAge: R, stop, endAge: Math.max(Math.ceil(a) + 1, R), salary: sal, spouseSalary: ssal, selfLife: Ls, spouseLife: Lsp, filing,
    accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('kS', 'traditional401k', 0, { contribution: rk, priority: 1 }), acct('kP', 'traditional401k', 0, { owner: 'spouse', contribution: rks, priority: 2 }),
      acct('iraS', 'traditionalIRA', 0, { contribution: rq, priority: 3 }), acct('iraP', 'traditionalIRA', 0, { owner: 'spouse', contribution: rqs, priority: 4 })] });
  const { v, r } = run(p, true);
  if (!v.valid || r.status !== 'ok') { continue; }
  const cl = (x) => Math.max(0, Math.min(span, x));
  const ws = cl(Math.min(R - a, Ls - a)), wp = cl(Math.min(R - s, Lsp - s));
  const joint = filing === 'mfj';
  const ownS = Math.max(0, Math.min(stop - a, ws)), ownP = Math.max(0, Math.min(stop - s, wp));
  const winS = Math.max(ownS, joint ? Math.max(0, Math.min(stop - a, wp, cl(Ls - a))) : 0);
  const winP = Math.max(ownP, joint ? Math.max(0, Math.min(stop - s, ws, cl(Lsp - s))) : 0);
  const close = (x) => x + span;
  const limI = (x) => 7500 + (close(x) >= 50 ? 1100 : 0);
  const limK = (x) => { const c = Math.floor(close(x)); return 24500 + ([60, 61, 62, 63].includes(c) ? 11250 : close(x) >= 50 ? 8000 : 0); };
  const compS = sal * ws, compP = ssal * wp;
  let kS = ownS > 0 ? Math.min(rk * ownS, limK(a) * span, compS) : 0, kP = ownP > 0 ? Math.min(rks * ownP, limK(s) * span, compP) : 0;
  let dS = winS > 0 ? Math.min(rq * winS, limI(a) * span) : 0, dP = winP > 0 ? Math.min(rqs * winP, limI(s) * span) : 0;
  const roomS = compS - kS, roomP = compP - kP;
  if (joint) { let pool = roomS + roomP; dS = Math.min(dS, pool); pool -= dS; dP = Math.min(dP, pool); }
  else { dS = Math.min(dS, roomS); dP = Math.min(dP, roomP); }
  const got = r.rows[1].preTax, exp = kS + kP + dS + dP; n++;
  if (Math.abs(got - exp) > 0.01) { bad++; if (bad <= 10) console.log('MISMATCH', JSON.stringify({ a, s, R, stop, Ls, Lsp, filing, sal, ssal, rq, rqs, rk, rks }), 'engine', got, 'expected', exp, JSON.stringify({ kS, kP, dS, dP, winS, winP })); }
}
console.log('cases', n, 'mismatches', bad);
