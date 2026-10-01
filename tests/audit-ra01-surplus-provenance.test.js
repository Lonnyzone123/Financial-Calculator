'use strict';

// RA-01 (re-audit, 2026-09-11) -- P1. The outside-income preset captured
// RMD-only surplus and changed behaviour a prior audit had accepted.
//
// THE DEFECT. Tax settlement pools RMD cash and outside-income surplus into
// one scalar:
//
//     var availableCash = rmdCashForTax + outsideSurplus;      (engine.js)
//
// After that line the leftover cannot say which pool it came from, so
// `retainedRmdCash` is the COMBINED residual -- and R4 applied the new
// `surplusPolicy` to all of it, including when outsideSurplus is exactly 0.
// The comment on retainExcessRmdCash() asserted the opposite ("asCash is
// false for the pre-existing RMD retention path"); the live caller passes
// `surplusPolicy === "retain"`, which is true by default. The direct helper
// tests still defaulted to the old path, so the suite agreed with the
// comment instead of with the caller.
//
// Reproduced before the repair, with NO outside income of any kind:
//   two-period ending portfolio   1,192,661.89 -> 1,187,429.99   (-5,231.90)
//   `spend`, first retirement row     5,000.00 ->    38,058.60   (-> 41,447.96)
// A preset meant for pension/SS/dividend surplus was redirecting forced RMD
// proceeds, and under `spend` was converting a fixed-nominal plan into an
// escalating-lifestyle one.
//
// THE REPAIR, and user decision 2026-09-11. The user's answer was to "allow
// an option to direct where the money goes from each individual source",
// which repairs the mechanism rather than special-casing the symptom: a
// per-source destination cannot be implemented without carrying provenance,
// and lost provenance IS the defect.
//
//   advanced.surplusPolicy          default for the four OUTSIDE sources
//   advanced.surplusPolicyBySource  per-source override, keys:
//                                   rmd, pension, socialSecurity,
//                                   otherIncome, dividends
//
// `rmd` defaults to `invest` -- which is precisely its pre-R4 behaviour
// (deposit into the lowest-priority taxable account, inheriting its growth
// treatment), so RMD-only plans are restored without a special case.
//
// Tax is allocated across pools PRO-RATA (recorded as Q19; it is a choice,
// not a derivation). Sequencing is untouched: outside income covers spending
// first, RMD covers what remains of spending, only the residual is directed.
//
// THE PRIMARY ORACLE HERE IS AN INVARIANT, NOT A PINNED NUMBER. With no
// outside income there is no outside surplus, so no setting of an
// outside-income preset may change the answer at all. That property is what
// RA-01 violated, and it holds without anyone having to agree on what the
// right dollar figure is. The pre-R4 figure is pinned separately, as
// confirmation that the restoration is exact.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);
const engine = require('../src/engine.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs');
const defaultPlan = extractDefaultPlan(shell);

const OUTSIDE_PRESETS = ['retain', 'invest', 'spend'];

function account(o) {
  return Object.assign({
    id: 'a1', name: 'A', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 0, basisPct: 100, contributionMode: 'dollar', contribution: 0, frequency: 12,
    annualChangeMode: 'percent', annualChange: 0, changeTiming: 'annual', contributionPreset: 'none',
    futureChanges: [], priority: 1, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0,
    vesting: 100, allocation: {},
  }, o);
}

/** The re-audit's RA-01 reproduction: retired at 65, now 75, one traditional
 *  IRA, modest spending, RMD on, 10% returns, no outside income at all. */
function rmdOnlyPlan(overrides) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.profile.age = 75; p.profile.retireAge = 65; p.profile.endAge = 77;
  p.profile.spouseOn = false; p.profile.filing = 'single';
  p.employment.salary = 0; p.employment.spouseSalary = 0;
  p.assumptions.method = 'simple'; p.assumptions.returnRate = 10;
  p.assumptions.inflation = 0; p.assumptions.fee = 0; p.assumptions.volatility = 0;
  p.assumptions.withdrawalTiming = 'monthly';
  p.retirement.strategy = 'fixedNominal'; p.retirement.spending = 5000;
  p.retirement.pension = 0; p.retirement.pensionCola = 0;
  p.retirement.ssBenefit = 0; p.retirement.spouseSS = 0;
  p.retirement.dividendOn = false; p.retirement.incomeOffset = true;
  p.retirement.stages = []; p.retirement.expenses = []; p.retirement.otherIncomes = [];
  p.advanced.rmdOn = true; p.advanced.debts = []; p.advanced.otherAssets = [];
  p.advanced.healthOn = false; p.advanced.ltcOn = false;
  p.accounts = [account({ id: 'ira', type: 'customTraditional', taxClass: 'preTax', balance: 1000000 })];
  Object.assign(p.advanced, overrides || {});
  return p;
}

/** Outside income and no RMD: the case FM-03 was actually written for. */
function outsideOnlyPlan(overrides) {
  const p = rmdOnlyPlan(overrides);
  // Two retirement periods on purpose. Over a SINGLE period `retain` and
  // `invest` are indistinguishable here, because a destination created
  // mid-period currently receives no growth at all -- that is RA-02, repaired
  // in RR2-3. Keeping this case two periods long means it tests FM-03's
  // intent (the preset directs outside surplus) without silently depending
  // on a defect that is still open at this checkpoint.
  p.profile.endAge = 77;
  p.retirement.pension = 60000;
  p.retirement.spending = 20000;
  p.advanced.rmdOn = false;
  p.accounts = [account({ id: 'roth', type: 'customRoth', taxClass: 'roth', balance: 1000000 })];
  return p;
}

/** Both pools at once, so a per-source policy has something to distinguish. */
function mixedPlan(overrides) {
  const p = rmdOnlyPlan(overrides);
  p.retirement.pension = 60000;
  p.retirement.spending = 20000;
  return p;
}

function run(p) { return engine.runPlan(JSON.parse(JSON.stringify(p))); }
const ending = (p) => { const rows = run(p).rows; return rows[rows.length - 1].total; };
const round2 = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// 1. The invariant RA-01 broke
// ---------------------------------------------------------------------------

test('RA-01: with no outside income, no outside-income preset may change anything', () => {
  const results = OUTSIDE_PRESETS.map((sp) => {
    const rows = run(rmdOnlyPlan({ surplusPolicy: sp })).rows;
    return {
      preset: sp,
      ending: round2(rows[rows.length - 1].total),
      spending: rows.map((r) => round2(Number(r.spending) || 0)).join(','),
    };
  });
  const absent = (() => {
    const p = rmdOnlyPlan();
    delete p.advanced.surplusPolicy;
    const rows = run(p).rows;
    return { preset: '(absent)', ending: round2(rows[rows.length - 1].total),
      spending: rows.map((r) => round2(Number(r.spending) || 0)).join(',') };
  })();

  results.concat([absent]).forEach((r) => {
    assert.equal(
      r.ending, results[0].ending,
      'preset ' + r.preset + ' changed the ending portfolio (' + r.ending + ' vs ' +
      results[0].ending + ') in a plan with ZERO outside income. An outside-income ' +
      'preset must have nothing to act on here.'
    );
    assert.equal(
      r.spending, results[0].spending,
      'preset ' + r.preset + ' changed spending (' + r.spending + ') with no outside income'
    );
  });
});

test('RA-01: the default restores the pre-repair figure exactly', () => {
  // 1,192,661.89 is the pre-R4 engine's own output for this scenario,
  // independently reproduced from commit 5e25b33~1 during triage and
  // reported by the re-audit. It is pinned as CONFIRMATION that the
  // restoration is exact; the invariant above is the real oracle.
  const p = rmdOnlyPlan();
  delete p.advanced.surplusPolicy;
  /* R6 (S5 task 8, the Arizona age-65 exemption, TAX section 5.3, ENACTED): 1,192,661.89 became 1,192,777.50 -- the exemption lowers the Arizona tax in every year the owner is 65 or older, and the savings compound.
     The mechanism this pins is unchanged, and 1,192,661.89 returns exactly with the exemption set to $0. */
  /* S5AA task 3.1 (Q88): 1,192,777.50 before the IRC 63(f) additional standard deduction for the aged.
     Unlike the single-year fixtures elsewhere, this is an ENDING BALANCE, so the yearly tax saving is not
     simply added once: each year's smaller tax leaves more invested, and the difference compounds to
     $541.71 over the horizon. The figure this test pins is the DEFAULT restoring the pre-repair value
     exactly, and that property is unchanged -- only the value both sides now agree on has moved. */
  assert.equal(round2(ending(p)), 1193319.21);
});

test('RA-01: `spend` must not convert forced RMD proceeds into lifestyle spending', () => {
  const rows = run(rmdOnlyPlan({ surplusPolicy: 'spend' })).rows;
  const retirementRows = rows.filter((r) => (Number(r.spending) || 0) > 0);
  assert.ok(retirementRows.length >= 2, 'precondition: at least two spending rows');
  retirementRows.forEach((r) => {
    assert.equal(
      round2(r.spending), 5000,
      'requested spending is 5,000/yr with no outside income; RMD surplus was being ' +
      'spent instead (38,058.60 then 41,447.96 before the repair)'
    );
  });
});

// ---------------------------------------------------------------------------
// 2. FM-03 must still work -- the repair must not walk back the P1 it fixed
// ---------------------------------------------------------------------------

test('RA-01: outside-income surplus is still directed by the preset (FM-03 intact)', () => {
  const byPreset = {};
  OUTSIDE_PRESETS.forEach((sp) => { byPreset[sp] = round2(ending(outsideOnlyPlan({ surplusPolicy: sp }))); });
  assert.notEqual(byPreset.retain, byPreset.invest, 'retain and invest must still differ');
  assert.ok(byPreset.spend < byPreset.retain, 'spend consumes surplus, so it must end lower');
  assert.ok(byPreset.invest > byPreset.retain, 'invest earns a return retain does not');
});

test('RA-01: surplus outside income still does not vanish (FM-03 first-failing case)', () => {
  const rows = run(outsideOnlyPlan()).rows;
  const row = rows[rows.length - 1];
  assert.equal(round2(row.income), 60000, 'precondition: pension is the only outside income');
  assert.equal(round2(row.spending), 20000, 'precondition: requested spending');
  assert.equal(round2(row.withdrawals), 0, 'nothing may be sold while outside cash is available');
});

// ---------------------------------------------------------------------------
// 3. Provenance is genuinely carried: the two pools are independently directed
// ---------------------------------------------------------------------------

test('RA-01: the rmd source and the outside sources are directed independently', () => {
  const base = round2(ending(mixedPlan({
    surplusPolicy: 'retain', surplusPolicyBySource: { rmd: 'invest' },
  })));
  const rmdRetained = round2(ending(mixedPlan({
    surplusPolicy: 'retain', surplusPolicyBySource: { rmd: 'retain' },
  })));
  const outsideInvested = round2(ending(mixedPlan({
    surplusPolicy: 'invest', surplusPolicyBySource: { rmd: 'invest' },
  })));

  assert.notEqual(
    rmdRetained, base,
    'changing ONLY the rmd source\'s destination must change the result -- if it does ' +
    'not, RMD surplus is not being tracked separately'
  );
  assert.notEqual(
    outsideInvested, base,
    'changing ONLY the outside sources\' destination must change the result'
  );
  assert.ok(
    rmdRetained < base && outsideInvested > base,
    'moving money to zero-return cash must lower the ending balance and moving it to ' +
    'an invested account must raise it; got rmdRetained=' + rmdRetained +
    ' base=' + base + ' outsideInvested=' + outsideInvested
  );
});

test('RA-01: an unrecognised per-source value falls back without resurrecting vanishing', () => {
  const bogus = round2(ending(mixedPlan({
    surplusPolicy: 'retain', surplusPolicyBySource: { rmd: 'teleport' },
  })));
  const retained = round2(ending(mixedPlan({
    surplusPolicy: 'retain', surplusPolicyBySource: { rmd: 'retain' },
  })));
  assert.equal(bogus, retained, 'an unknown policy must fall back to retain, never to discarding cash');
});

// ---------------------------------------------------------------------------
// 4. Conservation, across the cases the re-audit named
// ---------------------------------------------------------------------------

/** Household source/use closure, written here rather than borrowed from the
 *  engine: every dollar of income and every dollar withdrawn must be spent,
 *  taxed, or still held. */
function householdResidual(row, openingPortfolio) {
  const income = Number(row.income) || 0;
  const withdrawals = Number(row.withdrawals) || 0;
  const spending = Number(row.spending) || 0;
  const taxes = Number(row.taxes) || 0;
  const closing = Number(row.total) || 0;
  return (income + withdrawals) - (spending + taxes) - (closing - (openingPortfolio - withdrawals));
}

/* Conservation is a CASH identity, so these cases run at a zero return.
   With growth in the picture the residual above would have to import the
   engine's own `growth` field to close, which would make the oracle depend
   on the thing it is checking. At a zero return, growth is definitionally
   zero and every remaining term is cash the household actually moved. */
const atZeroReturn = (p) => { p.assumptions.returnRate = 0; return p; };

const CONSERVATION_CASES = [
  ['rmd only', () => atZeroReturn(rmdOnlyPlan())],
  ['outside only', () => atZeroReturn(outsideOnlyPlan())],
  ['mixed pools', () => atZeroReturn(mixedPlan())],
  ['mixed, rmd retained as cash', () => atZeroReturn(mixedPlan({ surplusPolicyBySource: { rmd: 'retain' } }))],
  ['mixed, everything spent', () => atZeroReturn(mixedPlan({
    surplusPolicy: 'spend', surplusPolicyBySource: { rmd: 'spend' } }))],
  ['tax exceeds the outside pool', () => {
    const p = atZeroReturn(mixedPlan()); p.retirement.spending = 55000; return p;
  }],
];

CONSERVATION_CASES.forEach(([name, build]) => {
  test('RA-01: no calculation error and no vanished cash -- ' + name, () => {
    const res = run(build());
    assert.equal(res.calculationError || false, false, name + ': settlement must not error');
    const issues = (res.issues || []).filter((i) => i.severity === 'ERROR');
    assert.deepEqual(issues.map((i) => i.code), [], name + ': no ERROR issues');
    let opening = 1000000;
    res.rows.forEach((row) => {
      const residual = householdResidual(row, opening);
      assert.ok(
        Math.abs(residual) < 1,
        name + ' age ' + row.age + ': household residual ' + residual.toFixed(2) +
        ' -- cash appeared or vanished'
      );
      opening = Number(row.total) || 0;
    });
  });
});

test('RA-01: a QCD against the RMD settles cleanly', () => {
  // Deliberately NOT run through householdResidual(). A qualified charitable
  // distribution is money that genuinely LEAVES the household -- the engine's
  // own committed-cash identity already counts qcdCashPaid as a use -- so the
  // pure-cash residual above is short by exactly the donation (measured:
  // 15,000.00, the full annual QCD). Widening that oracle with a charitable
  // term to make this case green would blunt it for every other case, so the
  // limitation is recorded here instead and this case asserts what the oracle
  // can honestly speak for.
  const res = run(atZeroReturn(mixedPlan({ qcd: 15000 })));
  assert.equal(res.calculationError || false, false, 'QCD settlement must not error');
  assert.deepEqual(
    (res.issues || []).filter((i) => i.severity === 'ERROR').map((i) => i.code), [],
    'the engine\'s own committed-cash and row invariants must still close with a QCD'
  );
});

// ---------------------------------------------------------------------------
// 5. The new field is validated, never coerced (the FM-09 lesson)
// ---------------------------------------------------------------------------

test('RA-01: surplusPolicyBySource is validated rather than coerced', () => {
  const validator = require('../src/scenario-validator.js');
  const ok = validator.validateScenario(Object.assign(JSON.parse(JSON.stringify(defaultPlan)), {
    advanced: Object.assign({}, defaultPlan.advanced, {
      surplusPolicyBySource: { rmd: 'invest', pension: 'spend' },
    }),
  }));
  assert.equal(ok.issues.filter((i) => /surplusPolicyBySource/.test(i.path || '')).length, 0,
    'a well-formed map must not be flagged');

  const bad = validator.validateScenario(Object.assign(JSON.parse(JSON.stringify(defaultPlan)), {
    advanced: Object.assign({}, defaultPlan.advanced, {
      surplusPolicyBySource: { rmd: 'teleport', nonsenseKey: 'retain' },
    }),
  }));
  const flagged = bad.issues.filter((i) => /surplusPolicyBySource/.test(i.path || ''));
  assert.ok(flagged.length >= 2,
    'both an unknown policy value and an unknown source key must be reported; got ' +
    JSON.stringify(bad.issues.map((i) => i.path + ': ' + i.message)));
});
