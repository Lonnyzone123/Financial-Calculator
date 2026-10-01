// SOCSEC-05 (P3): the AIME switch says "using 2026 bend points"; since R36 the engine uses the bend points of the year the person
// turns 62, wage-indexed by the salary-growth field. Run: node repro-SOCSEC-05-aime-label-2026-bend-points.js
const fs = require('fs'), path = require('path');
const { h, plan, run } = require('./lib.js');
const shell = fs.readFileSync(path.join(h.TREE, 'src/app-shell.html'), 'utf8');
console.log('label:', (shell.match(/id="v2-ss-advanced"[^>]*><span class="form-check-label">([^<]*)</) || [])[1]);
const fd = x => Math.floor(x * 10 + 1e-6) / 10, fl = x => Math.floor(x + 1e-6);
const p = plan({ age: 40, endAge: 68, ssBenefit: 0, ret: { ssAdvanced: true, aime: 6000, ssClaim: 67, ssCola: 0 } });
p.employment.growth = 3;
const r = run(p), row = r.rows.find(x => x.age === 68);
const with2026 = fd(0.9 * 1286 + 0.32 * (6000 - 1286));      // what the label describes: 2,665.80
console.log('valid', r._valid, r.status, '| label reading: row 68 =', fl(with2026) * 12, '| engine row 68 =', row.income,
  '(bend points of 2048: 1286 x 1.03^22 =', Math.floor(1286 * Math.pow(1.03, 22) + 0.5), ')');
