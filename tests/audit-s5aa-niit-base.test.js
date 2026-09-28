/* S5AA task 3.2, Q89 (F3, with G17) -- the net investment income tax base.
 *
 * THE CITATION WAS CHECKED BEFORE THE RULE WAS CODED, as task 8.6 requires. Form 8960 Part I was read
 * from the IRS PDF itself; the check and the full income mapping are recorded in
 * Handover temp/S5AA_CITATION_CHECKS_20260920.md (C-02). Part I counts taxable interest (line 1),
 * ORDINARY DIVIDENDS (line 2), annuities (3), rental real estate and other passive activities (4a),
 * and net gain from the disposition of property (5a-d).
 *
 * THE NAMING TRAP THIS FILE EXISTS TO PIN. "Ordinary dividends" means two different things:
 *   - on Form 8960 line 2 (= Form 1040 line 3b) it is the TOTAL, of which qualified dividends are a
 *     SUBSET;
 *   - in src/engine.js `ordinaryDividends` is `dividendCash - qualifiedDividends`, the NON-QUALIFIED
 *     REMAINDER.
 * So the engine's base term is `qualifiedDividends + ordinaryDividends`, and the two ADD without
 * double counting precisely because the engine's variable is the complement. Their sum is line 2.
 *
 * AND THE OBVIOUS REPAIR IS THE WRONG ONE. `investmentIncome` inside estimateTaxes() feeds SEVEN
 * things: the Social Security provisional base, federalAgi, ssProvisionalIncome, the CAPITAL-GAINS
 * STACKING base, the NIIT cap, the Arizona base, and the reported field. Ordinary dividends are
 * already inside `ordinaryIncome` before estimateTaxes sees them, so AGI, the Social Security base and
 * Arizona ALREADY count them. Adding them to `investmentIncome` would count them twice in AGI and
 * would tax them at preferential capital-gains rates. Only the NIIT cap may change. Every one of those
 * must-not-move properties is asserted below, because they are what makes the repair surgical rather
 * than merely arithmetic.
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

const THRESHOLD = global.RULES.federal.niit.threshold.single;
const RATE = global.RULES.federal.niit.rate;

const filer = () => ({
  profile: { filing: 'single', state: 'AZ', age: 50, spouseOn: false, retireAge: 60, endAge: 95 },
  employment: { salary: 0, spouseSalary: 0 }, assumptions: {}, retirement: {}, advanced: {},
});

/* estimateTaxes(p, age, ordinaryIncome, capitalGains, ssBenefit, wages, qualifiedDividends,
                 spouseWages, selfSeProfit, spouseSeProfit, niiOther) */
const taxes = (ordinary, gains, qDiv, niiOther, ssBenefit) =>
  engine.estimateTaxes(filer(), 50, ordinary, gains || 0, ssBenefit || 0, 0, qDiv || 0, 0, 0, 0, niiOther || 0);

const AT = 250000;      /* $50,000 above the single threshold */
const DIV = 10000;

test('S5AA 3.2 control: the fixture really is above the NIIT threshold, and a below-threshold filer owes nothing', () => {
  assert.ok(AT > THRESHOLD, 'the case must be above the threshold to say anything');
  const below = engine.estimateTaxes(filer(), 50, THRESHOLD - 50000 - DIV, 0, 0, 0, 0, 0, 0, 0, DIV);
  assert.strictEqual(below.niit, 0, 'CONTROL: below the threshold there is no NIIT whatever the base contains');
});

test('S5AA 3.2: $10,000 of ordinary dividends at $250,000 draws the same $380 as qualified dividends or a gain', () => {
  /* The auditor's case. The same money, carried three ways, must attract the same NIIT -- Form 8960
     counts all three, on lines 2 and 5. Before the repair the ordinary carriage drew $0. */
  const expected = RATE * Math.min(DIV, AT - THRESHOLD);
  assert.strictEqual(expected, 380, 'the case is $380 by the statute: 3.8% of the lesser of the income and the excess');

  const asQualified = taxes(AT - DIV, 0, DIV, 0);
  const asGain = taxes(AT - DIV, DIV, 0, 0);
  const asOrdinaryDividends = taxes(AT, 0, 0, DIV);

  assert.ok(Math.abs(asQualified.niit - expected) < 0.01, 'qualified: ' + asQualified.niit);
  assert.ok(Math.abs(asGain.niit - expected) < 0.01, 'gain: ' + asGain.niit);
  assert.ok(Math.abs(asOrdinaryDividends.niit - expected) < 0.01,
    'ordinary dividends must draw the same NIIT, got ' + asOrdinaryDividends.niit);
});

test('S5AA 3.2: qualified and ordinary dividends together are counted ONCE, not twice', () => {
  /* The engine's ordinaryDividends is the NON-QUALIFIED REMAINDER, so a $10,000 dividend split any way
     between qualified and ordinary must produce exactly the same NIIT -- that is what "counted once"
     means, and it is the assertion that a double-count would fail. */
  const results = [];
  for (const qualifiedPart of [0, 2500, 5000, 7500, 10000]) {
    const ordinaryPart = DIV - qualifiedPart;
    const r = taxes(AT - qualifiedPart, 0, qualifiedPart, ordinaryPart);
    results.push(Math.round(r.niit * 100) / 100);
  }
  const expected = RATE * Math.min(DIV, AT - THRESHOLD);
  for (const got of results) {
    assert.ok(Math.abs(got - expected) < 0.01,
      'every split of the same $10,000 must draw the same NIIT: got ' + JSON.stringify(results));
  }
});

test('S5AA 3.2: the NIIT is still capped at net investment income, not charged on the whole excess', () => {
  /* Form 8960 charges the LESSER of net investment income and the excess of MAGI over the threshold.
     With a small dividend and a large excess, the dividend is the binding side. */
  const small = 1000;
  const r = taxes(AT, 0, 0, small);
  assert.ok(Math.abs(r.niit - RATE * small) < 0.01,
    'the cap must bind at the investment income, not the $50,000 excess: got ' + r.niit);

  /* And the other way: a large investment income with a small excess is capped by the excess. */
  const justOver = THRESHOLD + 1000;
  const r2 = engine.estimateTaxes(filer(), 50, justOver, 0, 0, 0, 0, 0, 0, 0, 50000);
  assert.ok(Math.abs(r2.niit - RATE * 1000) < 0.01,
    'the cap must bind at the $1,000 excess: got ' + r2.niit);
});

test('S5AA 3.2 MUST NOT MOVE: ordinary dividends keep ORDINARY rates and never reach the capital-gains stack', () => {
  /* The trap. investmentIncome feeds the LTCG stacking base as well as the NIIT cap. If the repair had
     added ordinary dividends to it, this $10,000 would be taxed at the preferential rate instead of the
     ordinary one -- a far larger error than the NIIT it was meant to fix, and in the taxpayer's favour. */
  const withOrdinary = taxes(AT, 0, 0, DIV);
  const plain = taxes(AT, 0, 0, 0);
  assert.strictEqual(withOrdinary.taxableGains, plain.taxableGains,
    'ordinary dividends must not enter the capital-gains stack');
  assert.strictEqual(withOrdinary.federal, plain.federal,
    'and the ordinary and capital-gains tax must be identical -- only the NIIT may differ');
  assert.ok(withOrdinary.niit > plain.niit, 'CONTROL: the NIIT itself must differ, or this proves nothing');
});

test('S5AA 3.2 MUST NOT MOVE: federal AGI, the Social Security base and Arizona are unchanged', () => {
  /* These already counted the money, because the caller folds ordinary dividends into ordinaryIncome
     before estimateTaxes is called. Counting it again here would be a double count in three places at
     once, and the Social Security one is the least visible of them. */
  const SS = 30000;
  const withOrdinary = taxes(AT, 0, 0, DIV, SS);
  const plain = taxes(AT, 0, 0, 0, SS);

  assert.strictEqual(withOrdinary.measures.federal_agi, plain.measures.federal_agi, 'federal AGI must not move');
  assert.strictEqual(withOrdinary.measures.ss_provisional_income, plain.measures.ss_provisional_income,
    'the Social Security provisional income must not move');
  assert.strictEqual(withOrdinary.ssTaxable, plain.ssTaxable, 'the taxable Social Security must not move');
  assert.strictEqual(withOrdinary.az, plain.az, 'Arizona must not move -- it has no NIIT');
  assert.strictEqual(withOrdinary.measures.irmaa_magi, plain.measures.irmaa_magi, 'the IRMAA measure must not move');
  assert.ok(Math.abs(withOrdinary.niit - plain.niit) > 0.01, 'CONTROL: the NIIT must move, or this proves nothing');
});

test('S5AA 3.2: rental and investment income streams are in the base; pension, wages and tax-free are not', () => {
  /* Form 8960 line 4a counts rental real estate, and an "Investment income" stream is investment income
     by name. A pension is excluded by section 1411(c)(5), wages are not investment income, and tax-free
     income is outside it entirely. otherIncomeFor() must report the net-investment-income share
     separately from the ordinary share, or the tax layer has no way to tell them apart.
     "other" and "oneTime" carry NO tax character -- their labels fix nothing -- so they stay out, which
     is a disclosure recorded in the citation check rather than an oversight. */
  const stream = (type) => ({
    profile: { filing: 'single', state: 'AZ', age: 50, spouseOn: false, retireAge: 60, endAge: 95 },
    employment: { salary: 0, spouseSalary: 0 }, assumptions: {},
    retirement: {
      otherIncomes: [{ type, owner: 'self', amount: DIV, start: 50, end: 95, growthMode: 'none', growth: 0 }],
    },
    advanced: {},
  });

  const IN_BASE = ['rental', 'investment'];
  const OUT_OF_BASE = ['pension', 'employment', 'socialSecurity', 'taxFree', 'other', 'oneTime', 'selfEmployment'];

  for (const type of IN_BASE) {
    const r = engine.otherIncomeFor(stream(type), 50, 51, 1, 0);
    assert.ok(Math.abs(r.nii - DIV) < 0.01,
      type + ' is net investment income on Form 8960 and must be reported as such: got ' + r.nii);
  }
  for (const type of OUT_OF_BASE) {
    const p = stream(type);
    if (type === 'oneTime') p.retirement.otherIncomes[0].start = 50;
    const r = engine.otherIncomeFor(p, 50, 51, 1, 0);
    assert.ok(!r.nii, type + ' must NOT be reported as net investment income: got ' + r.nii);
  }

  /* CONTROL: the streams that are out of the base still produce income -- the test must not be passing
     because otherIncomeFor stopped reporting them at all. */
  for (const type of ['pension', 'rental', 'investment']) {
    const r = engine.otherIncomeFor(stream(type), 50, 51, 1, 0);
    assert.ok(r.cash > 0, type + ' must still be reported as cash: got ' + r.cash);
  }
});

test('S5AA 3.2: the funding solver mirror carries the same base (G17)', () => {
  /* taxSegmentLocal() mirrors estimateTaxes(), and ground rule 4 makes them move together. The NIIT
     term is a piecewise-linear piece there, so a base the mirror does not know about makes the solver
     quote a smaller obligation than the estimator charges. Checked at a landing, the way R2-T01 does. */
  const ctx = {
    oi0: AT, cg0: 0, qDiv: 0, niiOther: DIV, ssBenefit: 0, filing: 'single',
    seniorAges: [50, -1], Tbase: 0, payrollConst: 0, pen0: 0, rPenalty: 0, rIncome: 1, rGains: 0,
  };
  const trueL = (x) => Math.max(0, engine.estimateTaxes(
    filer(), 50, ctx.oi0 + ctx.rIncome * x, ctx.cg0, ctx.ssBenefit, 0, ctx.qDiv, 0, 0, 0, ctx.niiOther
  ).total - ctx.Tbase);

  let x = 0, worst = 0;
  for (let step = 0; step < 20 && x < 400000; step++) {
    const seg = engine.taxSegmentLocal(ctx, x);
    const h = Number.isFinite(seg.dist) ? seg.dist * 0.999 : 100000;
    worst = Math.max(worst, Math.abs(seg.value - trueL(x)), Math.abs((seg.value + seg.slope * h) - trueL(x + h)));
    if (!Number.isFinite(seg.dist)) break;
    x += seg.dist;
  }
  assert.ok(worst < 0.01, 'the mirror must agree with the estimator on the NIIT base, off by $' + worst.toFixed(4));
});
