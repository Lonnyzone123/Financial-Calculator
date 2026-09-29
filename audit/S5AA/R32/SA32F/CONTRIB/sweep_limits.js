// Sweep: dollar limits and catch-ups at row-opening ages, for self and for spouse (mirror), against hand limits.
const L = require('./lib.js');
const A = L.account;
const hand = {
  // IRC 219(b)(5): 7,500 + 1,100 if age 50 attained by year end (Notice 2025-67)
  ira: (close) => 7500 + (close >= 50 ? 1100 : 0),
  // 402(g) 24,500; 414(v)(2)(B)(i) 8,000 at 50+; 414(v)(2)(E)(i) 11,250 for 60-63 attained in the year
  wp: (close) => 24500 + (close >= 60 && close < 64 ? 11250 : close >= 50 ? 8000 : 0),
  // Rev. Proc. 2025-19: 4,400 self / 8,750 family; 223(b)(3) 1,000 at 55
  hsa: (close, fam) => (fam ? 8750 : 4400) + (close >= 55 ? 1000 : 0),
};
let n = 0, bad = 0;
for (const who of ['self', 'spouse']) for (const open of [48, 49, 50, 53, 54, 58, 59, 62, 63, 64]) for (const [type, key] of [['traditionalIRA', 'ira'], ['traditional401k', 'wp'], ['hsa', 'hsa']]) {
  const other = 40;
  const selfAge = who === 'self' ? open : other, spouseAge = who === 'self' ? other : open;
  const p = L.work({ age: selfAge, spouseAge, filing: 'mfj', spouseOn: true, salary: 200000, spouseSalary: 200000, retireAge: 70, accounts: [A('x', type, 0, { owner: who, contribution: 50000, priority: 1 })] });
  const { r } = L.check(p); n++;
  const row = r.rows[1], got = row.preTax + row.hsa + row.roth;
  const exp = hand[key](open + 1, true);
  if (Math.abs(got - exp) > 0.005) { bad++; console.log('MISMATCH', who, open, type, got, exp); }
}
console.log('runs', n, 'mismatches', bad);
