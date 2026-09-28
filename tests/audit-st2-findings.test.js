'use strict';
/*
 * S3 ROUND 2 ADVERSARIAL STRESS AUDIT -- findings that reach live code.
 *
 * The report carries eight findings. Most of them land on the three modules
 * P19 excludes from the shipped bundle (debt-payoff-strategy.js,
 * debt-strategy-adapter.js, mortgage-vs-investing.js), and those are recorded
 * as excluded rather than repaired. This file covers the ones that do NOT get
 * that treatment:
 *
 *   ST2-05  src/debt-amortization.js IS bundled, and projectDebts() calls
 *           monthlyPayment() for the ARM recast payment. Live engine reach.
 *   EXT-02  tools/capture-baseline.js is the instrument every other repair in
 *           this sprint measured itself with. A blind spot here is not a
 *           financial defect -- it is a defect in the thing that decides
 *           whether there IS a financial defect, which is worse.
 *
 * Same convention as audit-rb/rc/cl-findings.test.js: each test states the
 * measured pre-repair behaviour in its own message, so a future reader can see
 * what was wrong without recovering the report.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { monthlyPayment } = require(path.join(ROOT, 'src', 'debt-amortization.js'));
const { simulateDebtPayoff } = require(path.join(ROOT, 'src', 'debt-payoff-strategy.js'));

/* --------------------------------------------------------------------- */
/* ST2-05: a low but positive APR must not produce an infinite payment    */
/* --------------------------------------------------------------------- */

/* The old formula was (p * r) / (1 - Math.pow(1 + r, -n)). For a small
 * positive monthly rate, `Math.pow(1 + r, -n)` rounds to exactly 1, the
 * denominator is 0, and the payment is Infinity. Measured on this tree before
 * the repair, principal 90000 over 240 months:
 *
 *     APR 1e-16  ->  Infinity
 *     APR 1e-14  ->  Infinity
 *     APR 1e-12  ->  351.84      (true answer 375)
 *     APR 1e-10  ->  375.30
 *
 * The report predicted $90,000 at 1e-16. This tree returned Infinity, which is
 * the same defect one step further along.
 */
test('ST2-05: a vanishingly small positive APR returns a finite payment', () => {
  for (const apr of [1e-16, 1e-14, 1e-12, 1e-10, 1e-8]) {
    const payment = monthlyPayment(90000, apr, 240);
    assert.ok(Number.isFinite(payment),
      'APR ' + apr + ' produced ' + payment + '. A finite principal over a finite term ' +
      'has a finite payment at every rate; the old formula divided by a denominator ' +
      'that underflowed to zero.');
  }
});

test('ST2-05: the payment tends smoothly to principal/term as the rate vanishes', () => {
  /* Continuity with the exact zero-rate branch beside it is the whole point.
     A formula that is merely finite but discontinuous at the boundary would
     still be wrong, just less loudly. 90000/240 = 375. */
  for (const apr of [1e-16, 1e-14, 1e-12, 1e-10, 1e-8, 1e-6]) {
    const payment = monthlyPayment(90000, apr, 240);
    assert.ok(Math.abs(payment - 375) < 0.01,
      'APR ' + apr + ' gave ' + payment + ', not ~375. The limit of an annuity payment ' +
      'as the rate approaches zero is principal/term.');
  }
  assert.equal(monthlyPayment(90000, 0, 240), 375);
});

test('CONTROL: ST2-05 did not move an ordinary rate', () => {
  /* Measured, not remembered. At 6% over 360 months the two formulas differ by
     1.4e-11 dollars -- 7.6e-15 relative -- which is last-bit arithmetic from a
     more accurate expression, not a behaviour change. Across the whole capture
     corpus only targeted:arm-flag-on moved at all, 63 values, worst relative
     change 1.5e-13.

     Both numbers are pinned: the current value exactly, and the distance from
     the old formula. Pinning only the current value would let a future change
     of any size through as long as someone updated the constant. */
  const now = monthlyPayment(300000, 6, 360);
  assert.equal(now, 1798.6515754582572, 'the 6% 30-year payment on $300,000 is pinned exactly');

  const r = 6 / 100 / 12;
  const previous = (300000 * r) / (1 - Math.pow(1 + r, -360));
  assert.ok(Math.abs(now - previous) < 0.005,
    'the repair moved this payment by ' + Math.abs(now - previous) +
    ' dollars; an ordinary rate must not move by a payable amount');
});

test('ST2-05: a non-finite payment is refused, not returned', () => {
  /* Before the guard, a non-finite payment flowed into schedule construction,
     where principal capping rendered it as an early payoff -- arithmetic
     failure wearing the costume of a good result. */
  assert.throws(() => monthlyPayment(Infinity, 6, 360), RangeError);
  assert.throws(() => monthlyPayment(90000, Infinity, 360), RangeError);
});

/* --------------------------------------------------------------------- */
/* ST2-05 knock-on: the payoff epsilon was a billionth of a cent          */
/* --------------------------------------------------------------------- */

test('ST2-05 knock-on: a loan paid at its own amortizing payment ends at term', () => {
  /* simulateDebtPayoff() treated a debt as outstanding above 1e-9 DOLLARS.
     Over 360 iterations, ordinary floating-point drift leaves a residual near
     7.5e-9, so a loan paid exactly right still "owed" nine billionths of a
     cent at term and took a 361st month. The stable formula moved the payment
     by 1.4e-11 and pushed it across that line; the assertion that caught it
     had been passing by luck, not by correctness. Half a cent is the smallest
     amount a debt can actually owe. */
  const payment = monthlyPayment(300000, 6, 360);
  const r = simulateDebtPayoff([{ id: 'm', balance: 300000, rate: 6, minPayment: payment }], 0, 'avalanche');
  assert.equal(r.months, 360,
    'a 360-month loan paid at its own amortizing payment must retire in 360 months, ' +
    'not 361 because of a sub-cent residual');
});

/* --------------------------------------------------------------------- */
/* EXT-02: scenario identity in the baseline harness                      */
/* --------------------------------------------------------------------- */

const harness = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
const { diffSnapshots, captureEntry, verifyIntegrity, indexByName, hashOf } = harness;

const snapshot = (pairs) => {
  const entries = pairs.map(([name, value]) => captureEntry(name, { rows: [{ value }] }));
  return { meta: { formatVersion: 3, complete: true, omissions: [], hash: hashOf(entries.map((e) => [e.name, e.hash])) }, entries };
};

test('EXT-02: a scenario named __proto__ compares correctly', () => {
  /* The index was `const m = {}`. `__proto__` is an inherited ACCESSOR on
     Object.prototype, so `m['__proto__'] = entry` runs a setter and creates no
     own property. Measured before the repair: a value moving 100 -> 999 under
     that name diffed to [], and the CLI printed the self-contradicting
     "CHANGED -- 0 scenario(s) differ / Total differing fields: 0".

     The name is not banned, because the name was never the defect. */
  const report = diffSnapshots(snapshot([['__proto__', 100]]), snapshot([['__proto__', 999]]));
  assert.equal(report.length, 1, 'the changed scenario must appear in the report');
  assert.equal(report[0].scenario, '__proto__');
  assert.deepEqual(report[0].diffs, [{ path: 'rows.0.value', before: 100, after: 999 }]);
});

test('CONTROL: inherited DATA property names always worked, and still do', () => {
  /* This is why "avoid reserved-looking names" is the wrong lesson. Assignment
     shadows an inherited data property, so constructor/toString/hasOwnProperty
     were never affected. Exactly ONE name behaved differently, and nothing at
     the call site distinguished it. */
  for (const name of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    const report = diffSnapshots(snapshot([[name, 1]]), snapshot([[name, 2]]));
    assert.equal(report.length, 1, name + ' must report its difference');
    assert.equal(report[0].scenario, name);
  }
});

test('EXT-02: duplicate scenario names are rejected, not resolved', () => {
  assert.throws(
    () => diffSnapshots(snapshot([['dup', 100], ['dup', 100]]), snapshot([['dup', 777], ['dup', 100]])),
    /two entries named "dup"/,
    'last-entry-wins is not a resolution; it silently discards a scenario'
  );
});

test('EXT-02: the duplicate verdict used to depend on array ORDER', () => {
  /* The sharpest form of the finding. Before the repair, the same two files
     reported CHANGED when the SECOND duplicate moved and IDENTICAL when the
     FIRST did. A regression detector whose answer depends on the order of the
     facts is not a detector. Both orders are now refused identically. */
  const secondMoved = () => diffSnapshots(snapshot([['d', 1], ['d', 1]]), snapshot([['d', 1], ['d', 2]]));
  const firstMoved = () => diffSnapshots(snapshot([['d', 1], ['d', 1]]), snapshot([['d', 2], ['d', 1]]));
  assert.throws(secondMoved, /two entries named "d"/);
  assert.throws(firstMoved, /two entries named "d"/);
});

test('EXT-02: a missing or non-string name is refused', () => {
  /* Every nameless entry indexed under the same key, so N of them collapsed
     to one and the diff compared a fraction of the file it was handed. */
  const bad = (name) => ({ meta: { formatVersion: 3, complete: true, omissions: [] }, entries: [{ name, result: { a: 1 } }] });
  for (const name of [undefined, null, '', 42, {}, []]) {
    assert.throws(() => diffSnapshots(bad(name), bad(name)), /must be a non-empty string/,
      'name ' + JSON.stringify(name) + ' must be refused');
  }
});

test('EXT-02: verifyIntegrity reports identity, not only hashes', () => {
  /* This is the "two definitions of one contract" half that never spoke.
     verifyIntegrity() walks entries as an ARRAY, so it hashed both duplicates
     quite happily and pronounced the file internally consistent, while
     diffSnapshots() -- indexing the same file -- could only ever see one of
     them. The two components disagreed about how many scenarios the file
     contained and only one of them reported to the user. */
  const problems = verifyIntegrity(snapshot([['dup', 1], ['dup', 2]]));
  const identity = problems.filter((p) => p.kind === 'identity');
  assert.equal(identity.length, 1, 'a duplicate name is an integrity problem');
  assert.match(identity[0].reason, /two entries named "dup"/);
  assert.equal(problems.filter((p) => p.kind === 'hash').length, 0,
    'and it must NOT be reported as a hash problem -- every stored hash here is correct, ' +
    'so advising the reader to recapture a corrupt file sends them to look for damage ' +
    'that is not there');
});

test('EXT-02: capture() refuses to WRITE a snapshot it cannot index', () => {
  /* Catching a duplicate at diff time means it already reached a committed
     baseline, and every comparison against that baseline was quietly short a
     scenario. The corpus is assembled from three sources -- golden, generated
     and targeted -- so a collision between them is a live possibility. */
  assert.throws(() => indexByName(snapshot([['x', 1], ['x', 1]]), 'this capture'),
    /two entries named "x"/);
});

test('CONTROL: the real 36-scenario corpus indexes cleanly', () => {
  /* The check is only worth having if the shipped corpus passes it. capture()
     runs this on its own output, so this is also the proof that no golden,
     generated or targeted name currently collides. */
  const names = harness.corpus().map((s) => s.name);
  assert.ok(names.length >= 33, 'expected the reviewed corpus, got ' + names.length + ' scenarios');
  assert.equal(new Set(names).size, names.length, 'corpus scenario names must be unique');
  const fake = { meta: { formatVersion: 3, complete: true, omissions: [] }, entries: names.map((name) => ({ name, result: {} })) };
  assert.equal(indexByName(fake, 'the corpus').size, names.length);
});

/* --------------------------------------------------------------------- */
/* ST2-02: corpus completeness is a gate, not a hope                      */
/* --------------------------------------------------------------------- */

/* These run capture-baseline.js in a CHILD PROCESS with a require hook that
 * injects one fault into tests/lib/scenario-generator.js resolution. A child
 * process because the fault has to be present at module-load time and must not
 * leak into the rest of this file's tests.
 *
 * ENGINE COMPUTATION IS NOT STUBBED. The fix queue permits stubbing to isolate
 * coverage policy; it was not needed, because the fault is injected at corpus
 * ASSEMBLY and the strict gate refuses before any scenario is run. Stating it
 * explicitly, as the queue asks: these tests exercise the real engine over
 * whatever scenarios survive the fault.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');

const HOOK = path.join(os.tmpdir(), 'capture-baseline-fault-hook.js');
fs.writeFileSync(HOOK, [
  "'use strict';",
  "const Module = require('node:module');",
  'const orig = Module._load;',
  'const MODE = process.env.FAULT;',
  'Module._load = function (request) {',
  '  if (/scenario-generator/.test(request)) {',
  "    if (MODE === 'missing') { const e = new Error('Cannot find module ' + request); e.code = 'MODULE_NOT_FOUND'; throw e; }",
  "    if (MODE === 'syntax') { throw new SyntaxError('Unexpected token'); }",
  "    if (MODE === 'noexport') { return {}; }",
  "    if (MODE === 'notfunction') { return { generateScenario: 'nope' }; }",
  '  }',
  '  return orig.apply(this, arguments);',
  '};',
].join('\n'));

const CLI = path.join(ROOT, 'tools', 'capture-baseline.js');

function runCli(fault, args) {
  try {
    const stdout = execFileSync(process.execPath, ['--require', HOOK, CLI].concat(args), {
      env: Object.assign({}, process.env, { FAULT: fault }),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status === undefined ? 1 : e.status, stdout: String(e.stdout || '') + String(e.stderr || '') };
  }
}

const FAULTS = {
  missing: /failed to load \(Error\)/,
  syntax: /failed to load \(SyntaxError\)/,
  noexport: /exports generateScenario as undefined rather than a function/,
  notfunction: /exports generateScenario as "nope" rather than a function/,
};

for (const [fault, expected] of Object.entries(FAULTS)) {
  test('ST2-02: capture refuses and names the cause under fault "' + fault + '"', () => {
    /* Measured before the repair, under ALL FOUR of these faults identically:
       "Captured 16 scenarios", exit 0, and the written file declared
       meta.generatedSeeds: 20 while holding zero seed entries. The catch-all
       plus the `typeof === 'function'` guard made a missing module, a broken
       module, a missing export and a wrong-typed export indistinguishable from
       each other AND from success. */
    const out = path.join(os.tmpdir(), 'st202-' + fault + '.json');
    if (fs.existsSync(out)) fs.unlinkSync(out);
    const r = runCli(fault, ['capture', out]);
    assert.notEqual(r.code, 0, 'a partial corpus must not exit 0. Output was:\n' + r.stdout);
    assert.match(r.stdout, /CORPUS INCOMPLETE/);
    assert.match(r.stdout, expected, 'the cause must be named, not collapsed to "unavailable"');
    assert.match(r.stdout, /holds 16 of 36 scenarios/);
    assert.ok(!/^Captured \d+ scenarios/m.test(r.stdout),
      'the failure must come BEFORE any success line, not after one');
    assert.equal(fs.existsSync(out), false, 'no partial baseline may be written to disk');
  });
}

test('ST2-02: verify cannot certify determinism over a partial corpus', () => {
  /* The sharpest of the three. Before the repair this printed DETERMINISTIC
     and exited 0 with twenty scenarios missing, because it compares two
     captures to EACH OTHER and two equally crippled captures agree perfectly.
     A determinism proof over an empty set -- the same vacuous-verification
     shape as the Q41 corpus walk that skipped every entry and reported zero.

     There is deliberately no --allow-incomplete on verify: a reduced run is a
     diagnostic, and a diagnostic cannot certify. */
  const r = runCli('missing', ['verify']);
  assert.notEqual(r.code, 0, 'output was:\n' + r.stdout);
  assert.match(r.stdout, /CANNOT CERTIFY DETERMINISM/);
  assert.ok(!/DETERMINISTIC —/.test(r.stdout), 'it must not claim determinism it cannot establish');
});

test('ST2-02: a reduced capture is allowed, reports omissions, and marks itself', () => {
  /* The queue asks for a reduced mode kept SEPARATE from complete
     certification. It is opt-in, it prints every omission above the success
     line, and the file records complete:false so no later consumer has to
     infer it. */
  const out = path.join(os.tmpdir(), 'st202-reduced.json');
  const r = runCli('missing', ['capture', out, '--allow-incomplete']);
  assert.equal(r.code, 0, 'an explicitly requested diagnostic run is not a failure');
  assert.match(r.stdout, /REDUCED CAPTURE/);
  assert.match(r.stdout, /omitted seeds:/);
  const meta = JSON.parse(fs.readFileSync(out, 'utf8')).meta;
  assert.equal(meta.complete, false);
  assert.equal(meta.omissions.length, 1);
  assert.equal(meta.entryCount, 16);
});

test('ST2-02: generatedSeeds is OBSERVED, so it cannot claim coverage it lacks', () => {
  /* `generatedSeeds: GENERATED_SEEDS` was a constant written unconditionally.
     A capture holding zero seed entries declared twenty. A metadata field that
     cannot disagree with the file it describes is decoration, not provenance. */
  const meta = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'st202-reduced.json'), 'utf8')).meta;
  assert.equal(meta.generatedSeeds, 0, 'zero seeds ran, so zero is what the file must say');
  assert.equal(meta.generatedSeedsRequested, 20, 'and what was ASKED for stays visible beside it');
  assert.deepEqual(meta.composition, { golden: 5, seeds: 0, targeted: 11 });
});

test('ST2-02: the intact corpus is the reviewed 36-name set', () => {
  /* 33 + 3, not an expansion to make a check pass. The S3 round-2 report
     reviewed 5 golden + 20 seeds + 8 targeted = 33. The CL closure round added
     explicit-cash-holding (CL-04), funded-qcd (CL-05) and survivor-stateful
     (CL-07), each committed with its finding. Nothing was removed. */
  const names = harness.corpus().map((s) => s.name);
  assert.equal(names.length, 36);
  assert.equal(harness.expectedCorpusSize(), 36);
  assert.equal(names.filter((n) => n.startsWith('golden:')).length, 5);
  assert.equal(names.filter((n) => n.startsWith('seed:')).length, 20);
  assert.equal(names.filter((n) => n.startsWith('targeted:')).length, 11);
  const missing = harness.REQUIRED_TARGETED.filter((n) => !names.includes(n));
  assert.deepEqual(missing, [], 'every reviewed targeted fixture must be present');
});

test('ST2-02: completeness checks NAMES, not a count', () => {
  /* A count check passes as long as something arrived, so a targeted fixture
     silently replaced by a duplicate seed would satisfy it. The gate names
     every scenario it expects and reports each absence individually. */
  assert.equal(harness.REQUIRED_TARGETED.length, 11);
  assert.equal(new Set(harness.REQUIRED_TARGETED).size, 11, 'the contract itself must not contain a duplicate');
  const { entries, omissions } = harness.corpusWithDiagnostics();
  assert.deepEqual(omissions, [], 'the intact tree reports no omissions');
  assert.equal(entries.length, 36);
});

/* --------------------------------------------------------------------- */
/* B2 / EXT-03: validate the term BEFORE anything allocates a schedule    */
/* --------------------------------------------------------------------- */

const { amortizationSchedule, normalizeTerm, MAX_TERM_MONTHS } = require(path.join(ROOT, 'src', 'debt-amortization.js'));
const { recastAnalysis } = require(path.join(ROOT, 'src', 'debt-recast.js'));
const { refinanceAnalysis } = require(path.join(ROOT, 'src', 'debt-refinance.js'));
const { armSchedule } = require(path.join(ROOT, 'src', 'debt-arm.js'));

/* THE ORDINARY ORACLES FIRST. Every rejection below is only worth having if
 * the working cases are untouched, so they are asserted before the boundaries. */
test('CONTROL: B2 left the ordinary 20-year schedule exactly as it was', () => {
  const r = amortizationSchedule(100000, 6, 240, 0);
  assert.equal(r.schedule.length, 240);
  assert.equal(r.payoffMonth, 240);
  assert.equal(r.monthlyPayment, 716.4310584781649);
  /* The loop's own exit threshold is 1e-9, so a residual below that is the
     documented payoff condition, not a defect. 2.0e-10 here. */
  assert.ok(r.schedule[239].balance < 1e-9, 'the loan must fully retire at term, got ' + r.schedule[239].balance);
});

test('CONTROL: B2 left the ordinary recast oracle exactly as it was', () => {
  const r = recastAnalysis({ balance: 100000, annualRatePct: 6, remainingTermMonths: 240 }, 10000, {});
  assert.equal(r.doNothing.payoffMonth, 240);
  assert.ok(Math.abs(r.recast.interestSaved - 7194.35) < 0.01,
    'the recast interest saving is the closure evidence the queue asks to preserve, got ' +
    r.recast.interestSaved);
});

test('CONTROL: B2 left the ordinary refinance oracle exactly as it was', () => {
  const r = refinanceAnalysis(
    { balance: 100000, annualRatePct: 6, remainingTermMonths: 120 },
    { annualRatePct: 4, termMonths: 120, closingCosts: 5000, financeClosingCosts: true },
    { horizonMonths: 12 }
  );
  assert.equal(r.cashFlowBreakEvenMonth, 1);
  assert.equal(r.breakEvenMonth, null);
  assert.ok(Math.abs(r.horizon.netPositionDelta - 3246.129362435473) < 1e-9,
    'the external auditor pins this figure; got ' + r.horizon.netPositionDelta);
});

test('B2: a non-finite term is refused at every public boundary', () => {
  /* Measured before the repair, amortizationSchedule(100000, 6, Infinity):
     a V8 FATAL heap allocation failure. Not an exception -- a dead process,
     which cannot be caught, reported or attributed to the caller that caused
     it. The term is the schedule's loop bound, so it is an allocation
     instruction, and an unvalidated allocation instruction from a caller is
     the caller's bug becoming the process's death. */
  /* null, '' and [] are included deliberately: all three coerce to 0 through
     Number(), so before the explicit missing-value check they produced a silent
     zero-month loan rather than a refusal. */
  for (const bad of [Infinity, -Infinity, NaN, undefined, null, '', [], true, 'twenty']) {
    assert.throws(() => amortizationSchedule(100000, 6, bad, 0), RangeError,
      'amortizationSchedule must refuse term ' + String(bad));
    assert.throws(() => recastAnalysis({ balance: 100000, annualRatePct: 6, remainingTermMonths: bad }, 1000, {}),
      RangeError, 'recastAnalysis must refuse term ' + String(bad));
  }
});

test('B2: a missing term used to return a confident wrong answer', () => {
  /* This is the half that matters more than the crash. Every consumer wrote
     `Math.max(0, Math.floor(num(x, 0)))`, and num() maps a non-finite value to
     its fallback -- so Infinity, NaN and a MISSING term all became 0. That did
     not crash. recastAnalysis returned a fully-shaped result reporting
     payoffMonth 0 and interestSaved 0: "this recast saves you nothing", when
     the truth was "you did not tell me the term". A wrong financial answer
     wearing the costume of a right one is worse than a heap failure, because
     nothing announces it. */
  assert.throws(
    () => recastAnalysis({ balance: 100000, annualRatePct: 6 }, 10000, {}),
    /requires a finite term in months/,
    'a recast with no term must be refused, not answered with zero saving'
  );
});

test('B2: a term above the supported maximum is refused, not clipped', () => {
  /* "Do not silently clip a requested term while reporting it unchanged."
     Clipping would amortize a different loan than the one asked about and
     return the answer under the caller's own question. */
  assert.equal(MAX_TERM_MONTHS, 1800);
  assert.equal(normalizeTerm(MAX_TERM_MONTHS, 'test'), 1800, 'the boundary itself is supported');
  assert.throws(() => normalizeTerm(MAX_TERM_MONTHS + 1, 'test'), /at most 1800 months/);
  assert.throws(() => amortizationSchedule(100000, 6, 1e9, 0), /at most 1800 months/);
});

test('B2: the ceiling clears every term this codebase can actually derive', () => {
  /* 1800 is chosen against the tree, not picked round. scenario-validator.js
     caps profile.endAge at 120, so the longest age-derived term any engine
     path can produce is 120 * 12 = 1440 months. If that cap ever rises above
     150 years this assertion is the thing that notices. */
  const validator = fs.readFileSync(path.join(ROOT, 'src', 'scenario-validator.js'), 'utf8');
  const m = validator.match(/checkRange\(c, profile\.endAge, 'profile\.endAge', 0, (\d+)\)/);
  assert.ok(m, 'the endAge range check must still exist for this reasoning to hold');
  assert.ok(Number(m[1]) * 12 <= MAX_TERM_MONTHS,
    'MAX_TERM_MONTHS (' + MAX_TERM_MONTHS + ') must exceed the longest age-derived term (' +
    Number(m[1]) * 12 + '), or ordinary plans would start being refused');
});

test('B2: a fractional term is floored AND says so', () => {
  /* A schedule has whole months; there is no half row. Flooring is the
     existing arithmetic and is kept deliberately so no current figure moves --
     but the result now carries both numbers, because the standing rule is not
     to clip a requested term while reporting it unchanged. */
  const r = amortizationSchedule(100000, 6, 240.9, 0);
  assert.equal(r.termMonths, 240, 'the effective term');
  assert.equal(r.requestedTermMonths, 240.9, 'and the term that was asked for, unrounded');
  assert.equal(r.schedule.length, 240);
});

test('B2: a non-positive term keeps its documented empty-schedule contract', () => {
  /* Not converted to a throw. "Amortize nothing" has an honest answer and
     there are tests behind it; only INVALID terms are refused. */
  for (const t of [0, -12]) {
    const r = amortizationSchedule(100000, 6, t, 0);
    assert.deepEqual(r.schedule, []);
    assert.equal(r.monthlyPayment, 0);
    assert.equal(r.payoffMonth, 0);
  }
});

test('B2: armSchedule and refinanceAnalysis share the one contract', () => {
  /* "Share the term contract across affected debt consumers." All four debt
     modules imported normalizeTerm rather than each keeping its own opinion of
     what a term is -- the two-definitions-of-one-contract shape this sprint
     has now hit five times. */
  assert.throws(() => armSchedule(300000, { fixedPeriodMonths: 60, initialRate: 3, termMonths: Infinity }),
    RangeError);
  assert.throws(() => refinanceAnalysis({ balance: 100000, annualRatePct: 6, remainingTermMonths: Infinity },
    { annualRatePct: 4, termMonths: 120 }, {}), RangeError);
  assert.throws(() => refinanceAnalysis({ balance: 100000, annualRatePct: 6, remainingTermMonths: 120 },
    { annualRatePct: 4, termMonths: 1e9 }, {}), RangeError);
  for (const file of ['debt-recast.js', 'debt-refinance.js', 'debt-arm.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');
    assert.match(src, /normalizeTerm/, file + ' must use the shared contract');
    assert.ok(!/Math\.floor\(num\((?:cur|rep|cfg)\.[a-zA-Z]*[Tt]erm/.test(src),
      file + ' must not keep a second, local term coercion beside the shared one');
  }
});

test('B2: the huge finite term rejects in a bounded child process', () => {
  /* The queue asks for this to be kept as a child-process test under a memory
     limit and a deadline, and for the acceptance outcome to be a CONTROLLED
     REJECTION rather than heap failure or timeout. Before the repair this
     exact invocation, at --max-old-space-size=256, ended in a V8 fatal
     allocation failure; it must now exit on a RangeError instead.

     Bounded deliberately: an unbounded main-process run of this case is what
     the report itself warns against. */
  const script = 'const {amortizationSchedule}=require(' + JSON.stringify(path.join(ROOT, 'src', 'debt-amortization.js')) + ');' +
    'try{amortizationSchedule(100000,6,1e9,0);console.log("NO_REJECTION");}' +
    'catch(e){console.log(e.constructor.name);}';
  const started = Date.now();
  const out = execFileSync(process.execPath, ['--max-old-space-size=256', '-e', script],
    { encoding: 'utf8', timeout: 20000 }).trim();
  assert.equal(out, 'RangeError', 'the outcome must be a controlled rejection, got: ' + out);
  assert.ok(Date.now() - started < 20000, 'and it must reject promptly, not grind');
});

/* --------------------------------------------------------------------- */
/* ST2-03: the Worker test helper was more permissive than a Worker       */
/* --------------------------------------------------------------------- */

const { Worker } = require('node:worker_threads');
const workerLib = require(path.join(ROOT, 'tests', 'lib', 'worker-source.js'));

const uiTest = { skip: process.env.SKIP_UI_TESTS ? 'SKIP_UI_TESTS set' : false };

/* A tiny stand-in source that obeys the same self.onmessage/self.postMessage
 * contract as the generated worker. Used for the transport assertions so they
 * measure the BOUNDARY rather than the engine, and so a failure here can only
 * mean the transport is wrong. The generated source is exercised separately,
 * below, through a real Worker. */
const ECHO_SOURCE = [
  'self.onmessage = function (e) {',
  '  var d = e.data;',
  '  if (d.plan && d.plan.mutateMe) { d.plan.mutateMe.touched = true; }',
  '  self.postMessage({ id: d.id, result: d.plan && d.plan.echo });',
  '};',
].join('\n');

test('ST2-03: a worker cannot mutate the caller\'s plan', () => {
  /* Before the repair, postToWorker() handed `{ id: 1, plan }` straight to
     onmessage. The worker and the test held the SAME object, so a worker that
     edited its input edited the test's input, and the test then compared a
     result against a plan the worker had already changed. A real Worker gives
     the receiving side a copy; nothing about the old helper did. */
  const plan = { mutateMe: {}, echo: 1 };
  workerLib.postToWorker(ECHO_SOURCE, plan);
  assert.deepEqual(plan.mutateMe, {},
    'the caller\'s object must be untouched -- structured clone means the worker ' +
    'received a copy, and a helper that shares the object certifies an isolation ' +
    'the real boundary provides but the test never checked');
});

test('ST2-03: a function-valued field is refused on the way IN', () => {
  /* Passes through a direct call; dies with DataCloneError in a real Worker.
     A helper that accepts it certifies a message shape the browser rejects. */
  assert.throws(
    () => workerLib.postToWorker(ECHO_SOURCE, { echo: 1, callback: () => 1 }),
    (e) => e.name === 'DataCloneError' && /incoming message is not structured-cloneable/.test(e.message),
    'an incoming function must fail the way transport fails, not sail through'
  );
});

test('ST2-03: a function-valued field is refused on the way OUT', () => {
  /* The outgoing half was equally direct: postMessage's argument went straight
     into an array. Both send boundaries clone now, because a worker can just
     as easily try to post something uncloneable as receive it. */
  const source = 'self.onmessage = function (e) { self.postMessage({ id: e.data.id, result: function () {} }); };';
  assert.throws(
    () => workerLib.postToWorker(source, { echo: 1 }),
    (e) => e.name === 'DataCloneError' && /outgoing message is not structured-cloneable/.test(e.message),
    'an outgoing function must fail the way transport fails'
  );
});

test('ST2-03: special numeric values survive transport intact', () => {
  /* This is why the clone is structuredClone() and NOT a JSON round-trip. JSON
     is lossy in precisely the places this project's result contract lives:
     NaN and Infinity become null, -0 becomes 0, undefined vanishes as a key.
     Modelling a transport defect with a LOSSIER transport than the real one
     would swap one wrong boundary for another -- and it would do it silently,
     because every one of these survives JSON as a plausible-looking value.

     The same distinctions RA-04 protects in the capture harness. */
  const source = 'self.onmessage = function (e) { self.postMessage({ id: e.data.id, result: e.data.plan.values }); };';
  const values = { nan: NaN, inf: Infinity, negInf: -Infinity, negZero: -0, undef: undefined, nul: null, date: new Date(0) };
  const out = workerLib.postToWorker(source, { values }).result;

  assert.ok(Number.isNaN(out.nan), 'NaN must arrive as NaN, not null');
  assert.equal(out.inf, Infinity);
  assert.equal(out.negInf, -Infinity);
  assert.ok(Object.is(out.negZero, -0), 'negative zero must stay negative zero');
  assert.ok('undef' in out, 'an undefined-valued key must still be a key');
  assert.equal(out.undef, undefined);
  assert.equal(out.nul, null);
  assert.ok(out.date instanceof Date && out.date.getTime() === 0, 'a Date must arrive as a Date');

  /* The control that gives the assertions above their meaning: a JSON round
     trip -- the tempting shortcut -- destroys five of them. */
  const viaJson = JSON.parse(JSON.stringify(values));
  assert.equal(viaJson.nan, null);
  assert.equal(viaJson.inf, null);
  assert.equal(viaJson.negInf, null);
  assert.ok(Object.is(viaJson.negZero, 0), 'JSON loses the sign of negative zero');
  assert.ok(!('undef' in viaJson), 'JSON drops an undefined-valued key entirely');
});

test('ST2-03: the helper keeps the app\'s one-response worker lifetime', () => {
  /* The app posts one message and the worker answers once. The queue is
     explicit that the fix must not smuggle in a persistent-state requirement
     the application does not have, so the helper still asserts exactly one
     posted message and returns it. */
  const source = 'self.onmessage = function (e) { self.postMessage({ id: e.data.id, result: 1 }); self.postMessage({ id: e.data.id, result: 2 }); };';
  assert.throws(() => workerLib.postToWorker(source, {}), /expected exactly one posted message/);
});

/* ------------------------------------------------------------------ */
/* And the real thing, as the queue asks: generated source through an  */
/* actual Worker with a genuine structured-clone boundary.             */
/* ------------------------------------------------------------------ */

function runThroughRealWorker(source, plan) {
  /* node:worker_threads serializes messages with the real structured-clone
     algorithm across a genuine thread boundary -- no VM, no shim in the middle
     of the transport. The only shim is the `self` façade, because the generated
     source targets the Web Worker API and Node exposes parentPort instead. */
  const bootstrap = [
    'const { parentPort, workerData } = require("node:worker_threads");',
    'globalThis.self = { postMessage: (d) => parentPort.postMessage(d) };',
    '(0, eval)(workerData.source);',
    'parentPort.on("message", (data) => {',
    '  try { globalThis.self.onmessage({ data }); }',
    '  catch (e) { parentPort.postMessage({ id: data.id, error: String(e && e.message || e) }); }',
    '});',
  ].join('\n');
  return new Promise((resolve, reject) => {
    const w = new Worker(bootstrap, { eval: true, workerData: { source } });
    const timer = setTimeout(() => { w.terminate(); reject(new Error('real worker timed out')); }, 30000);
    w.on('message', (m) => { clearTimeout(timer); w.terminate(); resolve(m); });
    w.on('error', (e) => { clearTimeout(timer); reject(e); });
    w.postMessage({ id: 1, plan });
  });
}

test('ST2-03: the generated source runs across a REAL structured-clone boundary', uiTest, async () => {
  /* The VM helper is the fast path that 25 tests use; this is the control that
     says the fast path models the right thing. Same generated source, same
     plan, through an actual thread with real message serialization -- and the
     two must agree.

     A VM proves the source EXECUTES in isolation. Only this proves the message
     it exchanges can actually cross a worker boundary. */
  const source = await workerLib.liveWorkerSource();
  const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
  const golden = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js'));
  const plan = golden.extractDefaultPlan(shell);

  const real = await runThroughRealWorker(source, JSON.parse(JSON.stringify(plan)));
  assert.equal(real.error, undefined, 'the real worker must not error: ' + real.error);
  assert.ok(real.result && Array.isArray(real.result.rows) && real.result.rows.length > 0,
    'and must return rows');

  const viaVm = workerLib.postToWorker(source, JSON.parse(JSON.stringify(plan)));
  assert.equal(viaVm.error, undefined);
  assert.deepEqual(
    real.result.rows.map((r) => r.total),
    viaVm.result.rows.map((r) => r.total),
    'the VM helper and a real Worker must produce the same projection, or the helper ' +
    'is not standing in for the thing it claims to stand in for'
  );
});

test('ST2-03: a real Worker rejects what the helper now rejects', uiTest, async () => {
  /* The control on the control. The helper claims a function-valued field
     fails as DataCloneError; this establishes that a genuine boundary does the
     same, rather than the helper enforcing a rule of its own invention. */
  await assert.rejects(
    () => runThroughRealWorker('self.onmessage = function () {};', { callback: () => 1 }),
    (e) => /could not be cloned|DataCloneError/i.test(String(e && e.message)),
    'a real Worker must refuse a function-valued message'
  );
});

test.after(() => { workerLib.cleanup(); });

/* --------------------------------------------------------------------- */
/* Packaging qualification: the tool must be quiet outside a git checkout  */
/* --------------------------------------------------------------------- */

test('PKG: capture-baseline prints no git noise outside a repository', () => {
  /* Found by running the handover's own reproduction commands from an
     extracted package rather than from the repo. `verify` printed:

       fatal: not a git repository (or any of the parent directories): .git
       fatal: not a git repository (or any of the parent directories): .git
       DETERMINISTIC — two captures agree, hash 91c2eb99...

     It worked. It also gave an external reviewer two lines beginning `fatal:`
     as the first thing they saw, which is every reason to stop and report a
     broken package.

     gitCommit() already caught the exception -- that was never the whole job.
     execFileSync INHERITS stderr by default, so the child's message reaches the
     console before the catch can swallow the error. An extracted review package
     is not a git checkout, and that is an expected state, not an error.

     This runs git itself in a directory that is not a repository, to establish
     that the noise is real and that discarding stderr is what silences it. */
  const { execFileSync } = require('node:child_process');
  const os = require('node:os');
  const fs = require('node:fs');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'not-a-repo-'));

  const withInheritedStderr = (() => {
    try {
      execFileSync('git', ['rev-parse', '--show-toplevel'],
        { cwd: outside, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return '';
    } catch (e) { return String(e.stderr || ''); }
  })();
  assert.match(withInheritedStderr, /not a git repository/,
    'the control: git really does write this, so the old code really did leak it');

  const withDiscardedStderr = (() => {
    try {
      execFileSync('git', ['rev-parse', '--show-toplevel'],
        { cwd: outside, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return '';
    } catch (e) { return String(e.stderr || ''); }
  })();
  assert.equal(withDiscardedStderr, '',
    'and discarding stderr is what stops it reaching the reviewer');

  const source = fs.readFileSync(path.join(ROOT, 'tools', 'capture-baseline.js'), 'utf8');
  assert.match(source, /stdio: \['ignore', 'pipe', 'ignore'\]/,
    'gitCommit() must discard git stderr, not merely catch the exception');
  fs.rmSync(outside, { recursive: true, force: true });
});
