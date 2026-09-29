/* S5AA R30: THE FORM 8606 SETTLEMENT'S RULE FOR A QUALIFIED HSA FUNDING DISTRIBUTION, tested on settleIraYear() directly (R29-02
 * of ChatGPT's R29 change audit of aaff3f1; the owner 2026-09-28: "Repair in R30"). The plans that reach it are in
 * tests/audit-s5aa-r30-hsa-funding-uses-ira-basis.test.js, which gives the sources: IRC 408(d)(9)(A) and (E), and Notice 2008-51
 * -- the funding comes out of the IRA's taxable value first, and only what exceeds it uses up basis. This file holds the
 * settlement's own arithmetic, including the Notice's example.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);

test('R29-02 SETTLEMENT: the year\'s Form 8606 settlement takes a funding distribution from taxable value first, then basis', () => {
  const settle = (o) => engine.settleIraYear(Object.assign({ basisStart: 0, nondeductible: 0, poolEnd: 0, dist: 0, conv: 0, qcd: 0, qhfd: 0,
    ntProvisional: 0, offsetAvailable: 0 }, o));
  // Notice 2008-51's example: $200 of basis in a $2,000 IRA, $1,500 funded -- "$200 of basis in an IRA that has a fair market value
  // of $500".
  const notice = settle({ basisStart: 200, poolEnd: 500, qhfd: 1500 });
  near(notice.closingBasis, 200, 'the basis stays');
  near(notice.fraction, 200 / 500, 'and prices what is left');
  // $10,000 holding $8,000 of basis, $5,000 funded: $2,000 of taxable value, then $3,000 of basis -- $5,000 of basis on $5,000.
  const over = settle({ basisStart: 8000, poolEnd: 5000, qhfd: 5000 });
  near(over.qhfdBasisUsed, 3000, 'basis used');
  near(over.closingBasis, 5000, 'basis left');
  near(over.settledTaxable, 0, 'none of it is income');
  // An ordinary distribution beside it is priced on the basis the funding left: $5,000 left of $10,000 with $8,000 of basis after
  // $3,000 is used, and $1,000 drawn of the $5,000 is all basis.
  const withDraw = settle({ basisStart: 8000, poolEnd: 4000, qhfd: 5000, dist: 1000 });
  near(withDraw.settledTaxable, 0, 'the draw is basis');
  near(withDraw.closingBasis, 4000, 'basis left on $4,000');
});
