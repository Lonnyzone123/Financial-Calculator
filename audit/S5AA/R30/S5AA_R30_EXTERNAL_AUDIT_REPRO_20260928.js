'use strict';

// Read-only financial oracle for R30-01. The R29 helper is this reviewer's previously published fixture builder.
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '../../..'));
const { basisPlan, run } = require(path.join(ROOT, 'audit/S5AA/R29/S5AA_R29_EXTERNAL_AUDIT_REPRO_20260928.js'));

function taxOnSingleWagesAndOrdinaryAgi(agi) {
  const taxable = Math.max(0, agi - 16100);
  let previous = 0;
  let federal = 0;
  for (const [cap, rate] of [[12400, 0.10], [50400, 0.12], [105700, 0.22]]) {
    federal += Math.max(0, Math.min(taxable, cap) - previous) * rate;
    previous = cap;
  }
  assert.ok(taxable <= 105700, 'oracle only covers the brackets used by these fixtures');
  return federal + taxable * 0.025 + 30000 * 0.0765;
}

// Funding at 61 precedes all of that year's growth. Later growth is not another contribution or a basis recovery.
function expected(opening, rate, enabled) {
  const g = 1 + rate / 100;
  const valueAtFunding = (opening + 8600) * g;
  const moved = enabled ? 5400 : 0;
  const basisUsed = Math.min(8600, Math.max(0, moved - Math.max(0, valueAtFunding - 8600)));
  const basisLeft = 8600 - basisUsed;
  const iraAtNextOpening = (valueAtFunding - moved) * g;
  const iraDraw = (iraAtNextOpening + 2000) * Math.sqrt(g);
  const workDraw = 1000 * g * g * Math.sqrt(g);
  const agi = 30000 + iraDraw - basisLeft + workDraw - 2000;
  return { valueAtFunding, basisUsed, basisLeft, iraAtNextOpening, iraDraw, workDraw,
    agi, taxes: taxOnSingleWagesAndOrdinaryAgi(agi) };
}

let mismatches = 0;
function check(label, opening, rate, enabled = true) {
  const p = basisPlan();
  p.accounts.find(a => a.id === 'src').balance = opening;
  p.advanced.transferOn = enabled;
  p.advanced.assetClasses[0].returnRate = rate;
  p.assumptions.returnRate = rate;
  const r = run(p);
  const last = r.rows[3];
  const e = expected(opening, rate, enabled);
  const actual = { agi: last.federalAgi, taxes: last.taxes, taxSettled: last.taxSettled,
    taxOutstanding: last.taxOutstanding, preTax: last.preTax, total: last.total, networth: last.networth };
  const wrong = ['agi', 'taxes'].filter(k => !Number.isFinite(actual[k]) || Math.abs(actual[k] - e[k]) > 0.005);
  assert.equal(actual.preTax, 0, 'the liquidation must empty all IRA/workplace balances');
  assert.equal(actual.taxOutstanding, 0, 'this witness must not leave a later true-up that explains the discrepancy');
  if (wrong.length) mismatches++;
  console.log(JSON.stringify({ label, opening, rate, transferOn: enabled, validation: 'PASS', status: r.status,
    verdict: wrong.length ? 'MISMATCH' : 'PASS', wrong, expected: e, actual }));
}

check('R29-02 zero-return witness remains repaired', 0, 0);
check('R30-01 gain after basis-consuming funding', 0, 10);
check('R30-01 mixed pool with gain after funding', 2000, 10);
check('R30-01 loss after basis-consuming funding', 2000, -10);
check('CONTROL mixed pool without growth', 2000, 0);
check('CONTROL enough pre-tax value to fund without using basis', 20000, 10);
check('CONTROL nonzero growth with no funding', 0, 10, false);
console.log(JSON.stringify({ mismatchingWitnesses: mismatches,
  note: 'At 66c406c, three variants of R30-01 mismatch and four controls pass. Exit 1 reports financial mismatches.' }));
process.exitCode = mismatches ? 1 : 0;
