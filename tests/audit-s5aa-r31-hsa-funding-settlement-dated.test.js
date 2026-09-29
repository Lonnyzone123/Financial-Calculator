/* S5AA R31: THE FORM 8606 SETTLEMENT KEEPS A FUNDING DISTRIBUTION'S BASIS AS ITS DATE MEASURED IT, tested on settleIraYear() directly
 * (R30-01 of ChatGPT's R30 change audit of 66c406c; the owner 2026-09-28: "Repair in R31"). R30's settlement rule (R29-02
 * of ChatGPT's R29 change audit of aaff3f1; the owner 2026-09-28: "Repair in R30"). The plans that reach it are in
 * tests/audit-s5aa-r31-hsa-funding-basis-at-the-funding-date.test.js and tests/audit-s5aa-r30-hsa-funding-uses-ira-basis.test.js, which give the sources: IRC 408(d)(9)(A) and (E), and Notice 2008-51
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


test('R30-01 SETTLEMENT: settleIraYear() takes a funding\'s basis from its date when told the pool and the flows before it', () => {
  const settle = (o) => engine.settleIraYear(Object.assign({ basisStart: 0, nondeductible: 0, poolEnd: 0, dist: 0, conv: 0, qcd: 0, qhfd: 0,
    ntProvisional: 0, offsetAvailable: 0 }, o));
  // $8,600 of basis; $9,460 at the funding, $5,400 funded; $4,466 at year end. The funding used $4,540: $4,060 is left.
  const dated = settle({ basisStart: 8600, poolEnd: 4466, qhfd: 5400, qhfdPool: 9460, qhfdFlowsBefore: 0 });
  near(dated.qhfdBasisUsed, 4540, 'basis used on the date');
  near(dated.closingBasis, 4060, 'basis left');
});
