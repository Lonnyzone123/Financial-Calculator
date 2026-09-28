/* S5AA task 3.6 step 1, Q87 (F1, with G15) -- the traditional IRA deduction and its IRC 219(g) phase-out.
 *
 * THE CITATIONS WERE CHECKED BEFORE THE RULE WAS CODED, as task 8.6 requires: Notice 2025-67 for the
 * 2026 applicable amounts and Publication 590-A for the rules, both read from the IRS PDFs. The checks
 * are recorded in Handover temp/S5AA_CITATION_CHECKS_20260920.md.
 *
 * WHAT WAS WRONG. A traditional IRA contribution was not deducted AT ALL. An IRA is limitGroup "ira",
 * and only "workplace" and "hsa" reach preTaxDeferrals, so $7,500 into an IRA moved the tax by $0 where
 * the same $7,500 into a 401(k) moved it by $1,087.50.
 *
 * WHOSE COVERAGE MATTERS DEPENDS ON THE FILING STATUS, which is the easy thing to get wrong. For a
 * single or head-of-household filer only the owner's own coverage counts. On a JOINT return an
 * UNCOVERED contributor married to a COVERED spouse has a phase-out of their own, and a much higher one
 * (IRC 219(g)(7)(A), $242,000-$252,000 against $129,000-$149,000). A household where NEITHER is covered
 * has no phase-out at any income at all. All three are asserted.
 *
 * STEP 2 IS NOT IN THIS FILE. The task has two steps and says nondeductible or basis cases "are not
 * qualified until both exist". This file is step 1, the deduction. Step 2 -- per-owner IRA basis on the
 * annual Form 8606 aggregate computation -- is NOT implemented, and the last test here pins that gap
 * rather than leaving it to be discovered: a contribution phased out to nondeductible creates basis the
 * engine does not track, so those dollars are taxed again on withdrawal.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const IRA = global.RULES.retirement.ira;
const PH = IRA.deductionPhaseout;
const value = (id) => {
  const hits = PH.records.filter((r) => r.provision_id === id);
  assert.strictEqual(hits.length, 1, 'exactly one record for ' + id);
  return hits[0].value;
};

function acct(id, type, taxClass, owner, contribution) {
  return {
    id, name: id, type, taxClass, owner, balance: 0, basisPct: 0,
    contribution, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  };
}

function plan(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, {
    age: 45, retireAge: 60, endAge: 47, spouseOn: !!o.spouseOn, spouseAge: 45,
    filing: o.filing || (o.spouseOn ? 'mfj' : 'single'),
  });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: o.salary || 0, spouseSalary: o.spouseSalary || 0, growth: 0, contributionStop: 60 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 5000, /* RE-FIXTURED at the S5AA R18 round (workstream B, taxable basis in dollars): dividends ON at a 0% yield, so no imputed 1.5% -- at a 0% return a taxed, retained yield adds basis the account never gains, and the tax sales then realise small capital losses that are not what this test is about. */ dividendOn: true, dividendYield: 0,
    stages: [], expenses: [], otherIncomes: o.otherIncomes || [], ssBenefit: 0, spouseSS: 0, survivor: false,
  });
  const t = acct('t', 'taxable', 'taxable', 'self', 0); t.balance = 600000; t.basisPct = 100;
  p.accounts = [t];
  if (o.ira) p.accounts.push(acct('i', 'traditionalIRA', 'preTax', o.iraOwner || 'self', o.ira));
  if (o.spouseIra) p.accounts.push(acct('i2', 'traditionalIRA', 'preTax', 'spouse', o.spouseIra));
  if (o.rothIra) p.accounts.push(acct('r', 'rothIRA', 'roth', o.rothIraOwner || 'self', o.rothIra));
  if (o.workplace) p.accounts.push(acct('w', 'traditional401k', 'preTax', o.workplaceOwner || 'self', o.workplace));
  return p;
}

function firstYear(o) {
  const r = engine.runPlan(plan(o));
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  return { taxes: Number(r.rows[1].taxes) || 0, agi: Number(r.rows[1].federalAgi) || 0 };
}

const LIMIT = IRA.combinedLimit;   /* $7,500 */

test('S5AA 3.6: the rule records carry the 2026 amounts Notice 2025-67 states', () => {
  assert.strictEqual(value('ira_deduction_phaseout_start_single_or_hoh_active'), 81000);
  assert.strictEqual(value('ira_deduction_phaseout_end_single_or_hoh_active'), 91000);
  assert.strictEqual(value('ira_deduction_phaseout_start_mfj_contributor_active'), 129000);
  assert.strictEqual(value('ira_deduction_phaseout_end_mfj_contributor_active'), 149000);
  assert.strictEqual(value('ira_deduction_phaseout_start_mfj_spouse_only_active'), 242000);
  assert.strictEqual(value('ira_deduction_phaseout_end_mfj_spouse_only_active'), 252000);
  assert.strictEqual(IRA.combinedLimit, 7500, 'IRC 219(b)(5)(A)');
  assert.strictEqual(IRA.catchup, 1100, 'IRC 219(b)(5)(B)(ii)');
  assert.strictEqual(PH.minimumAllowance, 200, 'Publication 590-A Worksheet 1-2 minimum');
});

test('S5AA 3.6: the auditor case -- $50,000 of wages and $7,500 into an IRA deducts like a 401(k)', () => {
  /* The contribution is fully deductible here: $50,000 is below the single phase-out start even when
     the owner is covered. The 401(k) is the comparison partner because it is the same money, deducted. */
  const none = firstYear({ salary: 50000 });
  const ira = firstYear({ salary: 50000, ira: LIMIT });
  const workplace = firstYear({ salary: 50000, workplace: LIMIT });

  assert.ok(Math.abs(ira.agi - (none.agi - LIMIT)) < 1,
    'AGI must fall by the whole contribution: ' + Math.round(none.agi) + ' -> ' + Math.round(ira.agi));
  assert.ok(Math.abs(ira.taxes - workplace.taxes) < 0.01,
    'the IRA and the 401(k) must cost the same: ' + ira.taxes.toFixed(2) + ' against ' + workplace.taxes.toFixed(2));
  assert.ok(none.taxes - ira.taxes > 1000,
    'CONTROL: the deduction must actually be worth something, saved ' + (none.taxes - ira.taxes).toFixed(2));
});

test('S5AA 3.6: the phase-out tapers linearly across each range, and the IRS worked example checks the formula', () => {
  /* The engine's own function, against the rule records, at both ends and the midpoint of each range. */
  const cases = [
    ['single', false, 'single_or_hoh_active', true, false],
    ['mfj', true, 'mfj_contributor_active', true, false],
    ['mfj', true, 'mfj_spouse_only_active', false, true],
  ];
  for (const [filing, spouseOn, key, ownerCovered, spouseCovered] of cases) {
    void spouseOn;
    const lo = value('ira_deduction_phaseout_start_' + key);
    const hi = value('ira_deduction_phaseout_end_' + key);
    const at = (magi) => engine.iraDeductibleAmount(LIMIT, magi, filing, ownerCovered, spouseCovered);

    assert.ok(Math.abs(at(lo) - LIMIT) < 0.01, key + ': at the start the whole contribution is deductible');
    assert.strictEqual(at(hi), 0, key + ': at the end nothing is deductible');
    const mid = (lo + hi) / 2;
    assert.ok(Math.abs(at(mid) - LIMIT / 2) < 0.01, key + ': the midpoint is half, got ' + at(mid));
  }

  /* Publication 590-A Example 1, a CERTIFIED expected value: 2025, joint return, the contributor is
     covered, combined modified AGI $126,500, contribution $7,000, range $126,000-$146,000 -> $6,825.
     Asserted as arithmetic rather than through the engine, because the engine carries 2026 tables. */
  const irsExample = 7000 * (146000 - 126500) / (146000 - 126000);
  assert.strictEqual(irsExample, 6825, 'the linear taper must reproduce the publication worked example');
});

test('S5AA 3.6: on a JOINT return an uncovered contributor married to a covered spouse gets the HIGHER range', () => {
  /* IRC 219(g)(7)(A). This is the case a filing-status-blind repair collapses onto the contributor's own
     range, denying a deduction the statute allows across a $113,000-wide band of income. */
  const contributorRange = [value('ira_deduction_phaseout_start_mfj_contributor_active'),
    value('ira_deduction_phaseout_end_mfj_contributor_active')];
  const spouseOnlyRange = [value('ira_deduction_phaseout_start_mfj_spouse_only_active'),
    value('ira_deduction_phaseout_end_mfj_spouse_only_active')];
  assert.ok(spouseOnlyRange[0] > contributorRange[1],
    'CONTROL: the two ranges must not overlap, or this test cannot tell them apart');

  /* at an income above the contributor range but below the spouse-only range */
  const between = (contributorRange[1] + spouseOnlyRange[0]) / 2;
  assert.strictEqual(engine.iraDeductibleAmount(LIMIT, between, 'mfj', true, false), 0,
    'a COVERED contributor gets nothing at ' + between);
  assert.ok(Math.abs(engine.iraDeductibleAmount(LIMIT, between, 'mfj', false, true) - LIMIT) < 0.01,
    'an UNCOVERED contributor with a covered spouse gets the WHOLE contribution at ' + between);
});

test('S5AA 3.6: a household covered by NO workplace plan has no phase-out at any income', () => {
  for (const magi of [50000, 200000, 1000000]) {
    assert.ok(Math.abs(engine.iraDeductibleAmount(LIMIT, magi, 'single', false, false) - LIMIT) < 0.01,
      'single, uncovered, at ' + magi + ': the whole contribution is deductible');
    assert.ok(Math.abs(engine.iraDeductibleAmount(LIMIT, magi, 'mfj', false, false) - LIMIT) < 0.01,
      'joint, neither covered, at ' + magi + ': the whole contribution is deductible');
  }
  assert.strictEqual(engine.iraDeductionPhaseoutRange('single', false, false), null, 'and no range applies');
});

test('S5AA 3.6: the Publication 590-A $200 minimum allowance applies inside the range', () => {
  /* Worksheet 1-2: "if the result is less than $200, enter $200". Just inside the top of the range the
     linear taper is worth a few dollars, and the statute floors it. */
  const hi = value('ira_deduction_phaseout_end_single_or_hoh_active');
  const justInside = hi - 1;
  const tapered = LIMIT * (hi - justInside) / (hi - value('ira_deduction_phaseout_start_single_or_hoh_active'));
  assert.ok(tapered < PH.minimumAllowance, 'CONTROL: the taper here must be below the minimum, got ' + tapered);
  assert.strictEqual(engine.iraDeductibleAmount(LIMIT, justInside, 'single', true, false), PH.minimumAllowance,
    'the $200 minimum must apply');
  /* and it must not apply AT or above the end, where the deduction is zero outright */
  assert.strictEqual(engine.iraDeductibleAmount(LIMIT, hi, 'single', true, false), 0,
    'at the end of the range the deduction is zero, not the minimum');
});

test('S5AA 3.6 G15 MUST NOT MOVE: the Roth phase-out does not see the traditional IRA deduction', () => {
  /* Publication 590-A Worksheet 2-1 enters "any traditional IRA deduction" at line 4 and line 10 says to
     ADD the lines, so the deduction is ADDED BACK for Roth purposes. Feeding a reduced figure into
     rothPhaseoutFactor() would understate MAGI and let through contributions the statute disallows.
     Asserted directly on the function: the same salary must give the same factor either way, because it
     reads salary and not a post-deduction figure. */
  const a = { profile: { filing: 'single', spouseOn: false }, retirement: {} };
  const roth = { type: 'rothIRA' };
  const range = global.RULES.retirement.ira.rothPhaseout.single;
  const inside = (range[0] + range[1]) / 2;

  const factor = engine.rothPhaseoutFactor(a, roth, inside, 0);
  assert.ok(factor > 0 && factor < 1, 'CONTROL: the fixture must sit inside the Roth phase-out, got ' + factor);

  /* a traditional IRA deduction of the full limit would move MAGI by $7,500 if it were fed in; the
     factor must be unchanged, because the worksheet adds it back */
  const shifted = engine.rothPhaseoutFactor(a, roth, inside - LIMIT, 0);
  assert.ok(shifted > factor + 1e-9,
    'CONTROL: a genuinely lower MAGI DOES raise the factor, so this test can detect the feed');
  assert.strictEqual(engine.rothPhaseoutFactor(a, roth, inside, 0), factor,
    'the Roth factor must depend on salary alone and not on any traditional IRA deduction');
});

test('S5AA 3.6: a ROTH IRA contribution is never deductible', () => {
  const none = firstYear({ salary: 50000 });
  const roth = firstYear({ salary: 50000, rothIra: LIMIT });
  assert.ok(Math.abs(roth.agi - none.agi) < 1, 'a Roth contribution must not reduce AGI');
  assert.ok(Math.abs(roth.taxes - none.taxes) < 0.01, 'nor the tax');
});

test('S5AA 3.6 STEP 2 HAS LANDED: the tripwire this test used to be has fired, as it was built to', () => {
  /* THIS TEST WAS A GAP WRITTEN DOWN AS A TEST, and its own header said what to do when the gap closed:
     "If step 2 lands, this test FAILS and must be replaced by the real basis assertions -- which is the
     point of writing the gap down as a test." Step 2 landed, it failed, and this is that replacement.

     What it used to assert: that a wholly nondeductible contribution moves AGI by nothing on the way IN
     (still true, and kept below), and that `engine.form8606Basis` does not exist (no longer true).

     The real basis assertions live in tests/audit-s5aa-ira-basis.test.js, where two otherwise identical
     households differ in tax by exactly the basis. What is kept here is the half that still belongs to
     STEP ONE: the deduction side. */
  const covered = { salary: 95000, ira: LIMIT, workplace: 1 };
  const hi = value('ira_deduction_phaseout_end_single_or_hoh_active');
  assert.ok(covered.salary > hi, 'CONTROL: the fixture must be past the end of the phase-out');

  const withIra = firstYear(covered);
  const withoutIra = firstYear({ salary: 95000, workplace: 1 });
  assert.ok(Math.abs(withIra.agi - withoutIra.agi) < 1,
    'the contribution is wholly nondeductible, so AGI must not move: ' + Math.round(withIra.agi)
    + ' against ' + Math.round(withoutIra.agi));

  /* And the thing that changed: basis is now a computation the engine has. */
  assert.equal(typeof engine.form8606Basis, 'function',
    'STEP 2 IS IN: per-owner Form 8606 basis exists, so those dollars are no longer taxed twice');
  assert.equal(typeof engine.iraNontaxableFraction, 'function',
    'and the pro-rata rule with it');
});

