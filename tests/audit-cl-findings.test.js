'use strict';

/*
 * S2 CLOSURE RE-AUDIT (CL-01…CL-07).
 *
 * Source: S2_CLOSURE_REAUDIT_AND_CLAUDE_HANDOVER_20260910.md, verdict PARTIAL
 * REQUALIFICATION. Seven findings — two P1, five P2 — of which four reopen
 * repairs the closure round claimed complete.
 *
 * These are witnesses for defects in OUR OWN repairs, which is why each one
 * says what the repair got wrong rather than only what the code should do.
 * Same conventions as tests/audit-rb-findings.test.js: a control first, an
 * independently computed oracle where one exists, and a todo marker on
 * anything not yet repaired, removed in the same commit as its repair.
 *
 * The one test that calls the engine's internal helper for retained required-distribution cash lives in
 * tests/audit-cl-internals.test.js, split out at S5 block 2r, so this file reaches the engine only through
 * its public entry points.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { installDebtModules } = require('../tools/capture-baseline.js');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(
  shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
installDebtModules();
const engine = require('../src/engine.js');
/* S5AA R17 round: a copy of the engine with the RMD reserve protection defeated, run through the same runPlan(). */
const { engineWithoutReserveProtection } = require('./lib/rmd-protection-fault.js');
const { validateScenario } = require('../src/scenario-validator.js');
const golden = require('./lib/golden-scenario-defs.js');

const clone = (v) => JSON.parse(JSON.stringify(v));
const defaultPlan = golden.extractDefaultPlan(shell);

function account(over) {
  return Object.assign({
    id: 'a1', name: 'A', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 0,
    contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0,
    annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
  }, over);
}

/** Deterministic, and genuinely no dividends -- see the note in
 *  tests/audit-rc-findings.test.js about what dividendOn:false actually means. */
function basePlan(over) {
  const p = clone(defaultPlan);
  p.setupComplete = true;
  p.profile.filing = 'single';
  p.profile.spouseOn = false;
  p.assumptions.method = 'simple';
  p.assumptions.returnRate = 0;
  p.assumptions.inflation = 0;
  p.assumptions.fee = 0;
  p.retirement.dividendOn = true;
  p.retirement.dividendYield = 0;
  p.retirement.flexibility = 0;
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  return Object.assign(p, over || {});
}

// ===========================================================================
// CL-01 · P1 — the engine's duplicate-id check used a prototype-bearing object
// ===========================================================================

/* WHAT OUR REPAIR GOT WRONG. RB-01's boundary guard read `var seen={}` with
   `seen[a.id]=true`. "__proto__" is an inherited ACCESSOR on Object.prototype,
   so assigning to it runs a setter instead of creating an own property, and the
   second occurrence was never found. The engine ran a plan its own validator
   rejects, and RB-01's $25,910.90 false shortfall came back through the Worker.

   "constructor" and "toString" did NOT defeat it -- inherited DATA properties,
   which assignment shadows normally. Only the accessor slips through, which is
   why spot-checking a couple of dangerous-looking names would have missed it.

   The deeper fault was two implementations of one contract:
   validateAccountIdentity() already used a Map and was right. */
function duplicateIdPlan(id) {
  const p = basePlan({
    id: 'cl01',
    profile: Object.assign(clone(defaultPlan.profile), { filing: 'single', spouseOn: false, age: 65, retireAge: 65, endAge: 66 }),
    employment: Object.assign(clone(defaultPlan.employment), { salary: 0, spouseSalary: 0, growth: 0 }),
    accounts: [
      account({ id, balance: 1000, basisPct: 0, priority: 1 }),
      account({ id, balance: 199000, basisPct: 100, priority: 2 }),
    ],
  });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 150000, pension: 150000, ssBenefit: 0,
  });
  return p;
}

test('CL-01: a duplicate id is refused whatever the id is named, including __proto__', () => {
  /* CONTROL FIRST: unique ids still fund the obligation, so the refusals below
     are about duplication and not about these ids being banned outright. */
  const control = duplicateIdPlan('one');
  control.accounts[1].id = 'two';
  const ok = engine.runPlan(clone(control));
  assert.equal(ok.status, 'ok', 'CONTROL: unique ids must still run');
  assert.ok(Math.abs(ok.rows[1].shortfall) < 0.01,
    'CONTROL: and fund the obligation with no shortfall');

  /* Every one of these is an ordinary string an account may legitimately be
     called. What must not vary is whether DUPLICATION is caught. */
  ['same', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', '0'].forEach((id) => {
    const r = engine.runPlan(duplicateIdPlan(id));
    assert.equal(r.status, 'calculation_error',
      'a duplicate id of ' + JSON.stringify(id) + ' must be refused at the execution boundary; ' +
      'got ' + r.status + '. __proto__ specifically defeated the original guard, which used a ' +
      'plain object and lost the write to an inherited accessor.');
    assert.equal(r.calculationErrorCode, 'SCENARIO_DUPLICATE_ACCOUNT_ID');
    assert.equal(r.rows, null, 'and a refused scenario carries no financial rows');
  });
});

test('CL-01: a UNIQUE occurrence of a prototype-named id is still perfectly valid', () => {
  /* The repair must not ban ordinary strings for resembling property names.
     A single account called __proto__ is a legal plan. */
  ['__proto__', 'constructor', 'toString', 'hasOwnProperty'].forEach((id) => {
    const p = duplicateIdPlan(id);
    p.accounts[1].id = id + '-other';
    const r = engine.runPlan(clone(p));
    assert.equal(r.status, 'ok',
      'a single account named ' + JSON.stringify(id) + ' must run normally; got ' + r.status);
    assert.ok(Math.abs(r.rows[1].shortfall) < 0.01,
      'and must fund its obligation like any other plan');
    assert.equal(validateScenario(clone(p)).valid, true,
      'and the validator must accept it too');
  });
});

// ===========================================================================
// CL-02 · P1 — a reservation is not a distribution
// ===========================================================================

/* WHAT OUR REPAIR GOT WRONG. RC-01 reserved the required distribution by
   withholding it from the balance a conversion or transfer may consume, and
   then left those dollars in the market. The period return is applied before
   the RMD withdrawal runs, so a loss erodes the reserve, and the row still
   reported the full obligation in `rmd` with status "ok" and no shortfall.

   An obligation was described as discharged because it had been CALCULATED --
   the same error RC-01 was raised for, one level down.

   THIS DOES NOT REPAIR THE TIMING CONTRACT, and deliberately so. The two real
   repairs -- discharge the distribution before conversion consumes capacity, or
   genuinely segregate the reserve out of market exposure -- both change results
   for every RMD row, which makes them a policy decision rather than a bug fix.
   Sizing the reservation from this period's return would be look-ahead and is
   explicitly not an option. What is repaired here is the silence.

   S5AA R12 ROUND (external re-audit of b053dc2, R11-01; the owner's decision of 2026-09-22 to repair it): THE TIMING
   CONTRACT IS NOW REPAIRED, by the second route above -- once a conversion or transfer draws on an obligation, its
   reserve is held out of the row's return until the distribution is paid (rmdProtectedAmounts()). It changes results
   only in rows where a conversion or transfer draws on an obligation, not in every RMD row. So the -20% cases below are
   INVERTED: they complete, with the whole obligation distributed. The silence repair stays exactly as it was, and is
   witnessed by the case that is still genuinely short -- an obligation no conversion touched, whose account loses
   99% -- where the three quantities are now asserted. */
function rmdConversionPlan(timing, returnRate) {
  const p = basePlan({
    id: 'cl02',
    profile: Object.assign(clone(defaultPlan.profile), { filing: 'single', spouseOn: false, age: 75, retireAge: 65, endAge: 76 }),
    employment: Object.assign(clone(defaultPlan.employment), { salary: 0, spouseSalary: 0, growth: 0 }),
    accounts: [
      account({ id: 'cash', balance: 400000, cashHolding: true, priority: 1 }),
      account({ id: 'ira', name: 'IRA', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000, priority: 2 }),
      account({ id: 'roth', name: 'Roth', type: 'rothIRA', taxClass: 'roth', balance: 0, priority: 3 }),
    ],
  });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, pension: 0, ssBenefit: 0 });
  Object.assign(p.advanced, { rmdOn: true, conversionOn: true, conversionAmount: 100000 });
  p.assumptions.withdrawalTiming = timing;
  p.assumptions.returnRate = returnRate;
  return p;
}

test('CL-02: an obligation that was not distributed must not report ordinary success', () => {
  const required = 100000 / 24.6;

  /* CONTROL FIRST: at a zero return the reserve survives intact, the full
     obligation is distributed, and the plan runs normally. Without this, the
     failures below could just mean the engine refuses this plan shape. */
  const ok = engine.runPlan(rmdConversionPlan('monthly', 0));
  assert.equal(ok.status, 'ok', 'CONTROL: a zero-return year must still run');
  assert.ok(Math.abs(ok.rows[1].rmdDistributed - required) < 0.01,
    'CONTROL: and must distribute the full ' + required.toFixed(2));
  assert.ok(ok.rows[1].rmdUnmet < 0.01, 'CONTROL: leaving nothing unmet');

  /* Independent oracle for annual timing: the whole period's -20% applies
     before the withdrawal, so at most 4,065.040650406504 x 0.8 can be taken. */
  const annualExpected = required * 0.8;
  assert.ok(Math.abs(annualExpected - 3252.032520325203) < 1e-9,
    'oracle self-check: the arithmetic must give the re-audit figure');

  /* INVERTED at the R12 round (R11-01): these used to be short by 429.16, 529.17 and 813.01. The reserve the
     conversion left is now held out of the loss, so each completes with the whole obligation distributed. */
  ['monthly', 'quarterly', 'annual'].forEach((timing) => {
    const r = engine.runPlan(rmdConversionPlan(timing, -20));
    assert.equal(r.status, 'ok', timing + ': ' + r.calculationErrorCode);
    assert.ok(Math.abs(r.rows[1].rmdDistributed - required) < 0.01, timing + ': the whole obligation is distributed');
    assert.ok(r.rows[1].rmdUnmet < 0.01, timing + ': nothing is left unmet');
  });

  /* And a year that genuinely distributed less than a PROMISED obligation still does not report "ok".
     RE-FIXTURED BY INTENT at the R17 round (the owner's decision Q1-B, 2026-09-22; external re-audit of dcd7247, R16-01):
     this refused insufficientPlan() on the working engine, where the 401(k) nothing drew on is short BESIDE the IRA's
     protected conversion -- the row-wide rule. The promise is now per obligation, so that 401(k)'s shortfall is ordinary
     and stays on the row, and the working engine keeps the IRA's promise. The defeated promise is shown on a copy of
     the engine with the protection switched off: the IRA's own obligation is then short, and that is refused. */
  const ordinary = engine.runPlan(insufficientPlan());
  assert.equal(ordinary.status, 'ok', 'an unpromised shortfall beside a kept promise is ordinary: ' + ordinary.calculationErrorCode);
  assert.ok(Math.abs(ordinary.rows[1].rmdUnmet - (OWED_AT_95 - 5000)) < 0.01, 'and it is on the row');
  const short = engineWithoutReserveProtection().runPlan(insufficientPlan());
  assert.equal(short.status, 'calculation_error', 'a promised obligation left short must not report "ok"');
  assert.equal(short.calculationErrorCode, 'RMD_NOT_DISTRIBUTED');
  assert.ok((short.issues || []).some((i) => i.code === 'RMD_NOT_DISTRIBUTED' && i.severity === 'ERROR'),
    'and it must raise an ERROR-severity issue naming the unmet distribution');
});

/* R12 round: an obligation that is GENUINELY short. The owner is 95, where the Uniform Lifetime divisor is 8.9, so each
   $100,000 account owes $11,235.96. The IRA converts $50,000, which its own capacity covers, so its reserve is held out
   of the return; the 401(k) comes after it in the conversion's order and is never drawn on. The year's return is the
   engine's floor, -95% (accountReturnForPeriod() clamps to -.95), so the 401(k) holds $5,000 when its distribution is
   paid. Nothing held that money back, because nothing drew on it; the model cannot pay what is not there, and says so.
   At 75 this could not happen: the divisor is 24.6, 4.07% of the balance, and a 95% loss still leaves 5%. (With a
   $100,000 request the conversion spills into the 401(k) -- a 401(k) may convert into a Roth IRA -- and then its reserve
   is protected too.) */
const OWED_AT_95 = 100000 / 8.9;
function insufficientPlan() {
  const p = rmdConversionPlan('annual', -99);
  Object.assign(p.profile, { age: 95, endAge: 96 }); p.retirement.selfLife = 95.5;   // S5AA R43 (SA42F-30): alive at the start
  p.advanced.conversionAmount = 50000;
  p.accounts.push(account({ id: 'k401', name: '401(k)', type: 'traditional401k', taxClass: 'preTax', balance: 100000, priority: 4 }));
  return p;
}

test('CL-02: due, distributed and unmet are three separate reported quantities', () => {
  /* The re-audit asked for these kept distinct. Reporting only the obligation
     is what let a shortfall hide; rewriting the obligation to the amount
     actually paid would hide it just as well in the other direction.

     They are asserted on the ISSUE rather than on a row, and that is the point:
     an invalidated result carries no rows at all, by the invalid-result
     contract. If the three quantities lived only on the row they would vanish
     exactly when they matter most -- so the diagnostic has to carry them. */
  const required = 100000 / 24.6;
  /* RE-FIXTURED at the R12 round (R11-01): the -20% conversion is no longer short, so the three quantities are read
     from the genuinely short 401(k) above -- owed 4,065.04, and the 1,000 a 99% loss leaves is all that can move.
     RE-FIXTURED AGAIN at the R17 round (Q1-B): that 401(k) is now an ordinary shortfall and its result has rows, so the
     invalidated result is produced where a promise is defeated -- the same plan on the engine with the IRA's reserve
     protection switched off. */
  const r = engineWithoutReserveProtection().runPlan(insufficientPlan());

  assert.equal(r.rows, null,
    'precondition: an invalidated result carries no financial rows');
  const issue = (r.issues || []).find((i) => i.code === 'RMD_NOT_DISTRIBUTED');
  assert.ok(issue, 'the unmet distribution must be reported as an issue');
  assert.equal(issue.severity, 'ERROR');

  const d = issue.state;
  assert.ok(d, 'the issue must carry a state payload with the three quantities');
  /* Hand arithmetic: two obligations of 11,235.96 are due. Unprotected, the 50,000 the IRA did not convert loses 95%
     and pays 2,500 of its own; the 401(k) pays the 5,000 the floor-return left it. */
  assert.ok(Math.abs(d.due - 2 * OWED_AT_95) < 1e-6,
    'the OBLIGATION is reported at its computed value, not rewritten to what was paid');
  assert.ok(Math.abs(d.distributed - (2500 + 5000)) < 0.01,
    'the DISTRIBUTED amount is what actually moved: expected 7,500.00, got ' + d.distributed);
  assert.ok(Math.abs(d.unmet - (d.due - d.distributed)) < 1e-9,
    'and UNMET reconciles the two exactly');
  assert.ok(Math.abs(d.unmet - (2 * OWED_AT_95 - 7500)) < 0.01,
    'which is 14,971.91; got ' + Number(d.unmet).toFixed(2));
  assert.ok(Math.abs(d.promisedUnmet - (OWED_AT_95 - 2500)) < 0.01,
    'of which the PROMISED obligation, the IRA\'s, is short 8,735.96 -- the part that invalidates; got ' + Number(d.promisedUnmet).toFixed(2));

  /* And on a VALID run the same three quantities are on the row, where an
     ordinary consumer reads them. */
  const ok = engine.runPlan(rmdConversionPlan('monthly', 0));
  const row = ok.rows[1];
  assert.ok(Math.abs(row.rmd - required) < 1e-9, 'row.rmd is the obligation');
  assert.ok(Math.abs(row.rmdDistributed - required) < 0.01, 'row.rmdDistributed is what moved');
  assert.ok(row.rmdUnmet < 0.01, 'row.rmdUnmet is zero when the obligation was met');
});

// ===========================================================================
// CL-03 · P2 — the capture domain still lost distinctions
// ===========================================================================

test('CL-03: values the encoding cannot represent are refused, not flattened', () => {
  const baseline = require('../tools/capture-baseline.js');
  /* CONTROL: an ordinary capture still works, so the refusals below are about
     these specific values and not about the harness having stopped. */
  assert.match(baseline.captureEntry('x', { rows: [{ total: 1, v: null }] }).hash, /^[0-9a-f]{64}$/,
    'CONTROL: an ordinary result must still capture');

  /* A Date flattened to {} -- indistinguishable from an empty object, and from
     any other class instance. The first raw-domain guard rejected functions,
     symbols and bigints and let every object through. */
  assert.throws(() => baseline.captureEntry('x', { rows: [{ v: new Date(0) }] }), /non-plain|Date/,
    'a class instance must be refused rather than silently flattened');

  /* A HOLE is not a null: JSON renders both as null, so Array(1) and [null]
     captured identically. */
  assert.throws(() => baseline.captureEntry('x', { rows: [{ v: Array(1) }] }), /sparse array hole/,
    'a sparse hole must be refused rather than becoming an explicit null');
});

test('CL-03: an own __proto__ property survives capture', () => {
  const baseline = require('../tools/capture-baseline.js');
  /* JSON.parse creates a real own "__proto__" property. Ordinary assignment
     runs the inherited setter instead of storing it, so the value captured as
     an empty object -- in structuralClone() first, which is why fixing only
     canonical() left the collision exactly where it was. */
  const withProto = baseline.captureEntry('x', { rows: [{ v: JSON.parse('{"__proto__":1}') }] });
  const empty = baseline.captureEntry('x', { rows: [{ v: {} }] });
  assert.notEqual(withProto.hash, empty.hash,
    'an object carrying an own __proto__ must not capture identically to an empty one');

  /* Ordinary captures keep an ordinary prototype. A null-prototype clone also
     fixes the collision and was tried first: it changes deepStrictEqual for
     every consumer comparing a capture against an object literal, which is far
     wider than the defect. */
  assert.equal(Object.getPrototypeOf(empty.result), Object.prototype,
    'ordinary captured objects must stay ordinary objects');
});

test('CL-03: the encoding change is versioned, and old snapshots verify under their own rules', () => {
  const baseline = require('../tools/capture-baseline.js');
  assert.equal(baseline.CAPTURE_FORMAT, 3,
    'escaping reserved tags changed what a stored value hashes to, so the format had to move');

  /* THE COMPATIBILITY CASE. A legitimate format-2 snapshot carrying a tagged
     non-finite value hashes differently under format 3. Both files declared
     format 2 before this, so the new CLI called the old CLI clean data
     tampered -- the worst possible way to say "I changed my encoding". */
  const legacy = {
    meta: { formatVersion: 2 },
    entries: [{ name: 'x', rowCount: 1, result: { rows: [{ v: { __nonFinite: 'NaN' } }] }, hash: null }],
  };
  legacy.entries[0].hash = baseline.hashForFormat(legacy.entries[0].result, 2);
  assert.deepEqual(baseline.verifyIntegrity(legacy), [],
    'a format-2 snapshot must verify under format-2 rules rather than be reported as tampered');

  /* CONTROL: genuine tampering in an old snapshot is still caught. */
  const tampered = JSON.parse(JSON.stringify(legacy));
  tampered.entries[0].result.rows[0].v = { __nonFinite: 'Infinity' };
  assert.equal(baseline.verifyIntegrity(tampered).length, 1,
    'CONTROL: an edited format-2 snapshot must still fail verification');
});

// ===========================================================================
// CL-04 · P2 — one populated record is not the account and debt variants
// ===========================================================================

test('CL-04: the schema covers record variants, not whichever record sorted first', () => {
  const { liveCatalogue } = require('./lib/schema-catalogue.js');
  const leaves = liveCatalogue().catalogue.scenario.leaves;
  /* CR2-03 added an " (optional)" marker to the leaf form, because a union of
     keys cannot say whether a field is on every record. The field name is what
     this test is about, so the marker is stripped here rather than the format
     reverted -- every field below is still in the contract, and being able to
     see which of them are optional is the point of the newer work. */
  const fieldsOf = (prefix) => leaves
    .filter((l) => l.startsWith(prefix))
    .map((l) => l.split(' : ')[0].replace(' (optional)', '').replace(prefix, ''));

  /* The committed debt schema held eight fields and omitted every ARM and
     housing field the live implementation reads, because the specimen was the
     first non-empty record found. */
  const debt = fieldsOf('advanced.debts[].');
  ['nextRateResetAge', 'resetRate', 'extraPrincipalMonthly',
    'annualPropertyTax', 'annualInsurance', 'hoaMonthly', 'pmiMonthly'].forEach((f) => {
    assert.ok(debt.includes(f),
      'advanced.debts[].' + f + ' is read by the live ARM/mortgage code and must be in the ' +
      'contract; the catalogue describes ' + debt.length + ' debt fields');
  });

  /* cashHolding is the category RB-02 repaired the contract for, and no corpus
     scenario carried one -- so a fixture was added rather than the schema
     patched. A field nothing produces cannot be catalogued honestly. */
  assert.ok(fieldsOf('accounts[].').includes('cashHolding'),
    'accounts[].cashHolding must be catalogued');
});

test('CL-04: a field added to ANY ordinary row is detected, not just row 1', () => {
  const { buildCatalogue, liveCatalogue } = require('./lib/schema-catalogue.js');
  const live = liveCatalogue();
  const source = require('../tools/capture-baseline.js').corpus()
    .find((x) => x.plan.assumptions.method === 'simple');
  const base = live.engine.runPlan(clone(source.plan));
  assert.ok(base.rows.length > 3, 'precondition: enough rows to have a middle');

  const before = JSON.stringify(buildCatalogue(live.defaultPlan, { simple: base },
    { specimenPlan: live.specimenPlan }));

  /* Cataloguing rows[1] fixed the row-1 counterexample and left the same hole
     at every other position. The catalogue now unions every non-opening row. */
  [1, 2, 3].forEach((i) => {
    const mutated = clone(base);
    mutated.rows[i].newFinancialField = 123;
    delete mutated.rows[i].calculationErrorCode;
    const after = JSON.stringify(buildCatalogue(live.defaultPlan, { simple: mutated },
      { specimenPlan: live.specimenPlan }));
    assert.notEqual(before, after, 'a change to ordinary row ' + i + ' must move the catalogue');
  });
});

// ===========================================================================
// CL-05 · P2 — required-field checks ignored whether the field applies
// ===========================================================================

test('CL-05: a field the selected mode never reads is not required', () => {
  const missing = (mutate) => {
    const p = clone(defaultPlan);
    p.setupComplete = true;
    mutate(p);
    return validateScenario(p).issues
      .filter((i) => i.code === 'MISSING_FIELD').map((i) => i.path);
  };

  /* The three cases the re-audit proved inert -- identical engine results
     against controls carrying explicit extreme values, including 100% growth --
     and which P7 rejected anyway, after the real normalizer. */
  assert.deepEqual(missing((p) => {
    p.retirement.otherIncomes = [{ name: 'x', type: 'taxable', amount: 12000, start: 65, end: 95, owner: 'self', growthMode: 'cola' }];
  }), [], 'a COLA-indexed stream reads the COLA series, never the rate on the record');

  assert.deepEqual(missing((p) => {
    p.retirement.otherIncomes = [{ name: 'x', type: 'oneTime', amount: 12000, start: 65, end: 65, owner: 'self' }];
  }), [], 'a one-time income returns before any growth logic runs');

  assert.deepEqual(missing((p) => {
    p.retirement.stages = [{ name: 's', mode: 'percent', value: 80, start: 70, end: 80 }];
  }), [], 'a percent stage multiplies the strategy amount and reads no growth settings');

  /* CONTROLS: where the field IS read, absence is still an error. Without these
     the repair could simply have stopped validating. */
  assert.ok(missing((p) => {
    p.retirement.otherIncomes = [{ name: 'x', type: 'taxable', amount: 12000, start: 65, end: 95, owner: 'self', growthMode: 'fixed' }];
  }).some((x) => x.endsWith('.growth')), 'CONTROL: a fixed-growth stream needs its rate');

  assert.ok(missing((p) => {
    p.retirement.stages = [{ name: 's', mode: 'amount', value: 50000, start: 70, end: 80 }];
  }).some((x) => x.endsWith('.growthMode')), 'CONTROL: an amount stage needs its growth policy');

  assert.ok(missing((p) => {
    p.retirement.otherIncomes = [{ name: 'x', type: 'taxable', amount: 12000, start: 65, end: 95, growthMode: 'cola' }];
  }).some((x) => x.endsWith('.owner')), 'CONTROL: owner is unconditional -- it decides whose age ' +
    'the stream is timed against, and its absence silently re-times a spouse stream against self');
});

// ===========================================================================
// CL-06 · P2 — the allowlist rejected its own normalizer vocabulary
// ===========================================================================

test('CL-06: a key the application itself writes is not reported as unknown', () => {
  const p = clone(defaultPlan);
  p.setupComplete = true;
  p.advanced.v210Migrated = true;   // normalizedPlan() stamps this on every migrated plan
  assert.deepEqual(
    validateScenario(p).issues.filter((i) => String(i.path || '').includes('v210Migrated')), [],
    'the import reviewer warned the user about a field the importer had just written. The ' +
    'exact-set guard against defaultPlan could not catch it: the marker is created during ' +
    'normalization and never stored in the default, which is why a default object is a ' +
    'starting shape rather than the accepted schema.');

  /* CONTROL: a genuine misspelling must still be reported, or the fix is just
     a hole in the allowlist. */
  const typo = clone(defaultPlan);
  typo.setupComplete = true;
  typo.advanced.networthon = true;
  assert.ok(validateScenario(typo).issues.some((i) => String(i.path || '').includes('networthon')),
    'CONTROL: a misspelled real field must still warn');
});

// ===========================================================================
// CL-07 · P2 — fixtures that did not exercise their stated purpose
// ===========================================================================

test('CL-07: the sequence-risk fixtures actually draw on a funded portfolio', () => {
  const harness = require('../tools/capture-baseline.js');
  const ends = [];

  [1929, 1966, 2000].forEach((year) => {
    const entry = harness.corpus().find((x) => x.name === 'targeted:historical-' + year);
    assert.ok(entry, 'targeted:historical-' + year + ' must exist');
    const opening = (entry.plan.accounts || []).reduce((s, a) => s + (a.balance || 0), 0);
    assert.ok(opening > 0,
      'historical-' + year + ' had a ZERO opening portfolio, and fixedReal sizes its first ' +
      'withdrawal from the retirement balance -- so it spent nothing, withdrew nothing, and ' +
      'could not be exposed to any return sequence at all');

    const r = engine.runPlan(clone(entry.plan));
    const withdrawals = (r.rows || []).reduce((s, x) => s + (x.withdrawals || 0), 0);
    assert.ok(withdrawals > 0, 'historical-' + year + ' must actually fund withdrawals');
    ends.push((r.rows || []).slice(-1)[0].total.toFixed(2));
  });

  /* The property the triple exists for: identical but for the start year, so a
     different early return sequence must reach a different place. */
  assert.equal(new Set(ends).size, 3,
    'the three start years must produce three different outcomes; got ' + JSON.stringify(ends));
});

test('CL-07: the funded-QCD and stateful-survivor branches are reachable', () => {
  const harness = require('../tools/capture-baseline.js');

  /* Nine corpus scenarios requested a QCD and not one reached a row with a
     non-zero RMD, so the branch RC-01 rewrote was never executed. */
  const qcd = harness.corpus().find((x) => x.name === 'targeted:funded-qcd');
  assert.ok(qcd, 'targeted:funded-qcd must exist');
  const qr = engine.runPlan(clone(qcd.plan));
  const funded = (qr.rows || []).filter((x) => (x.rmd || 0) > 0 && (x.rmdDistributed || 0) > 0);
  assert.ok(funded.length > 0, 'the QCD fixture must produce a funded distribution');
  assert.ok(funded.every((x) => x.rmdUnmet < 0.01),
    'and it must fully discharge the obligation, or it is exercising CL-02 instead');

  /* The corpus had zero stateful survivor periods: its one survivor scenario
     used a strategy that rebuilds its base each year, which is exactly the
     shape that cannot exhibit RC-02 compounding. */
  const surv = harness.corpus().find((x) => x.name === 'targeted:survivor-stateful');
  assert.ok(surv, 'targeted:survivor-stateful must exist');
  assert.ok(['fixedReal', 'guardrails', 'guyton'].includes(surv.plan.retirement.strategy),
    'the survivor fixture must use a strategy that CARRIES spending state');
  const sr = engine.runPlan(clone(surv.plan));
  const spend = (sr.rows || []).map((x) => x.spending).filter((x) => x > 0);
  assert.ok(spend.length >= 4, 'precondition: several spending years');

  /* One reduction, then ordinary inflation growth -- not a second cut. RC-02
     under non-zero inflation, which its original witness did not cover. */
  const drop = spend.findIndex((v, i) => i > 0 && v < spend[i - 1]);
  assert.ok(drop > 0, 'the survivor reduction must actually occur');
  for (let i = drop + 1; i < spend.length; i++) {
    assert.ok(spend[i] > spend[i - 1],
      'after the single household-size reduction spending must resume growing, not fall again; ' +
      'got ' + JSON.stringify(spend));
  }
});
