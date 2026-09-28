'use strict';
/*
 * S2 CLOSURE REVISION 2 AUDIT (11 September 2026) -- CR2-01 through CR2-06.
 *
 * CR2-07 was closed separately by the parallel S3-03 work on the capture
 * manifest and is not re-tested here.
 *
 * Three of these reopen earlier findings, and that is the thing worth carrying
 * forward: CR2-02 reopens CL-05, CR2-03 reopens CL-04, CR2-05 reopens ST2-02.
 * Each earlier repair was correct about the case in front of it and stopped at
 * the edge of that case -- a branch-aware rule applied to one list and not the
 * one below it, a union that unioned keys but not types, a completeness gate
 * placed after the success shortcut it was meant to guard.
 *
 * Same convention as audit-rb/rc/cl/st2-findings.test.js: each test states the
 * measured pre-repair behaviour in its own message.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);

const harness = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
harness.installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const validator = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const { extractDefaultPlan } = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js'));
const { refinanceAnalysis } = require(path.join(ROOT, 'src', 'debt-refinance.js'));
const clone = (x) => JSON.parse(JSON.stringify(x));

/* --------------------------------------------------------------------- */
/* CR2-01: a pretax distribution is income wherever it lands              */
/* --------------------------------------------------------------------- */

const acct = (o) => Object.assign({
  id: 'a', name: 'A', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 0,
  basisPct: 100, priority: 1, contribution: 0, contributionMode: 'dollar', frequency: 12,
  annualChange: 0, annualChangeMode: 'percent', changeTiming: 'annual', futureChanges: [],
  allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
}, o);

function transferPlan(opts) {
  const o = Object.assign({ on: true, dest: 'taxable', destType: 'taxable', amount: 50000,
    age: 65, rmdOn: false, srcBasis: 0 }, opts);
  const p = clone(extractDefaultPlan(shell));
  Object.assign(p.profile, { age: o.age, retireAge: o.age, endAge: o.age + 1, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: o.age });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, pension: 0, pensionCola: 0, ssBenefit: 0, spouseSS: 0,
    dividendOn: true, dividendYield: 0, stages: [], expenses: [], otherIncomes: [],
    flexibility: 0, withdrawalOrder: 'manual', manualOrder: 'taxable,preTax,roth,hsa',
  });
  Object.assign(p.advanced, {
    networthOn: true, otherAssets: [], insurance: 0, rmdOn: o.rmdOn, healthOn: false, ltcOn: false,
    assetsOn: false, reserveOn: false, bondTentOn: false, conversionOn: false,
    transferOn: o.on, debts: [], transferFrom: o.from || 'ira', transferTo: 'dest',
    transferAge: o.age, transferAmount: o.amount,
  });
  p.accounts = [
    acct({ id: 'dest', taxClass: o.dest, type: o.destType, balance: 400000, basisPct: 100, priority: 1 }),
    acct({ id: 'ira', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000, basisPct: 0, priority: 2 }),
    acct({ id: 'src2', taxClass: 'taxable', type: 'taxable', balance: 100000, basisPct: o.srcBasis, priority: 3 }),
  ];
  return p;
}

const row1 = (p) => engine.runPlan(clone(p)).rows[1];

test('CR2-01: a $50,000 IRA distribution to taxable cash is $50,000 of income', () => {
  /* The transfer block recognised income only when the destination was ROTH.
     Every other pairing fell through to moveFunds(), a pure balance move.
     Measured pre-repair on this witness: MAGI $750 -- incidental interest on
     the larger taxable balance -- against $50,000 due, and $0 tax. The same
     dollars sent to a Roth in the same dropdown cost $3,947.50. */
  const p = transferPlan({});
  assert.equal(validator.validateScenario(clone(p)).valid, true, 'the witness must be a valid plan');
  const r = engine.runPlan(clone(p));
  assert.equal(r.status, 'ok');
  const row = r.rows[1];
  assert.ok(Math.abs(row.magi - 50000) < 0.01, 'MAGI must be $50,000, got ' + row.magi);
  /* S5 task 8 (the owner's question 5, answer C): Arizona's $2,100 age-65 exemption (TAX section 5.3, ENACTED) takes $52.50
     off the auditor's $3,947.50, derived under the earlier tables with no exemption. The mechanism this pins is unchanged. */
  assert.ok(Math.abs(row.taxes - 3649) < 0.01,
    'tax must be $3,649.00 -- $2,854 federal plus $795.00 Arizona, after the age-65 exemption and the 63(f) additional deduction (the auditor derived ' +
    '$3,947.50 under the earlier tables, before seeing any repair). Got ' + row.taxes);
});

test('CR2-01 CONTROL: a disabled transfer and a zero transfer move nothing', () => {
  const off = row1(transferPlan({ on: false }));
  const zero = row1(transferPlan({ amount: 0 }));
  assert.ok(Math.abs(off.magi) < 1000, 'no transfer, no distribution income');
  assert.ok(Math.abs(zero.magi) < 1000, 'a zero transfer is not a distribution');
  assert.equal(off.taxes, 0);
  assert.equal(zero.taxes, 0);
});

test('CR2-01 CONTROL: the Roth conversion path is unchanged', () => {
  /* It was the one pairing that was already right, so it is the control that
     says this repair widened recognition rather than rewriting it. */
  const r = engine.runPlan(clone(transferPlan({ dest: 'roth', destType: 'rothIRA' })));
  assert.equal(r.status, 'ok');
  assert.ok(r.rows[1].magi > 50000, 'a conversion recognises the conversion plus whatever ' +
    'extra pretax had to be sold to fund its own tax; got ' + r.rows[1].magi);
});

test('CR2-01 CONTROL: a same-class move is not a distribution', () => {
  /* preTax -> preTax is a rollover. Recognising it would be the mirror defect:
     taxing money that never left the shelter. */
  const p = transferPlan({ dest: 'preTax', destType: 'traditionalIRA' });
  const r = engine.runPlan(clone(p));
  assert.equal(r.status, 'ok');
  assert.ok(Math.abs(r.rows[1].magi) < 1000, 'a rollover recognises nothing, got ' + r.rows[1].magi);
});

test('CR2-01: recognising a transfer does not duplicate the required withdrawal', () => {
  /* The report's own acceptance criterion: the required distribution is never taken twice. Age 75, $100,000 IRA,
     RMDs on, a $20,000 transfer to taxable cash.
     S5AA R15 round (external audit of 1e6faae, R14-01; S2 carried item U1, decided by the owner 2026-09-13 and pulled
     forward on 2026-09-22): RE-FIXTURED BY INTENT. This asserted that the transfer and the full RMD BOTH left the
     account -- "exactly the transfer more than the control" -- which is the double charge U1 recorded: the $20,000 is a
     distribution and satisfies the $4,065.04 obligation itself. Its own principle, nothing taken twice, now reads the
     other way round: the account falls by the transfer alone, the obligation shown is unchanged, and it is met. */
  const control = row1(transferPlan({ age: 75, rmdOn: true, on: false, amount: 20000 }));
  const withTransfer = row1(transferPlan({ age: 75, rmdOn: true, amount: 20000 }));
  assert.ok(control.rmd > 0 && control.rmd < 20000, 'the control must have an RMD the transfer covers, or this proves nothing');
  assert.equal(withTransfer.rmd, control.rmd, 'the obligation itself is unchanged');
  assert.ok(Math.abs(withTransfer.rmdDistributed - control.rmd) < 0.01, 'and it is met -- by the transfer');
  assert.ok(Math.abs(withTransfer.rmdUnmet) < 0.01, 'and nothing may be left unmet');
  const drained = control.preTax - withTransfer.preTax;
  assert.ok(Math.abs(drained - (20000 - control.rmd)) < 0.01,
    'the account lost the transfer and nothing more: the control lost its RMD, got ' + drained);
});

/* --------------------------------------------------------------------- */
/* CR2-02: require a field only on the branch that reads it               */
/* --------------------------------------------------------------------- */

function stagePlan(growthMode, annualChange) {
  const p = clone(extractDefaultPlan(shell));
  Object.assign(p.profile, { age: 65, retireAge: 65, endAge: 67, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 65 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 3, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  const stage = { start: 65, end: 67, mode: 'amount', value: 20000, growthMode: growthMode };
  if (annualChange !== undefined) stage.annualChange = annualChange;
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 30000, pension: 0, pensionCola: 0, ssBenefit: 0, spouseSS: 0,
    dividendOn: false, dividendYield: 0, stages: [stage], expenses: [], otherIncomes: [],
    flexibility: 0, withdrawalOrder: 'manual', manualOrder: 'taxable,preTax,roth,hsa',
  });
  Object.assign(p.advanced, {
    networthOn: true, otherAssets: [], insurance: 0, rmdOn: false, healthOn: false, ltcOn: false,
    assetsOn: false, reserveOn: false, bondTentOn: false, conversionOn: false, transferOn: false, debts: [],
  });
  p.accounts = [acct({ id: 'cash', balance: 500000 })];
  return p;
}

test('CR2-02: inflation and no-growth amount stages do not need annualChange', () => {
  /* applyStage() reads annualChange in exactly one place -- the
     growthMode === 'fixed' branch. The validator required it for every
     non-percent stage, so two legitimate plans were rejected at import and the
     error told the user their mode reads a field it never reads. */
  for (const mode of ['inflation', 'none']) {
    const v = validator.validateScenario(clone(stagePlan(mode, undefined)));
    assert.equal(v.valid, true, mode + ' stage was rejected: ' +
      JSON.stringify((v.issues || []).map((i) => i.code + ' ' + i.path)));
  }
});

test('CR2-02: and the field really is inert on those branches', () => {
  /* The justification, asserted rather than reasoned. An absurd 100% a year
     must change nothing -- a field whose most extreme value moves no figure
     cannot be material, which is the whole standard MATERIAL_RECORD_FIELDS is
     built on. */
  for (const mode of ['inflation', 'none']) {
    const omitted = JSON.stringify(engine.runPlan(clone(stagePlan(mode, undefined))));
    const supplied = JSON.stringify(engine.runPlan(clone(stagePlan(mode, 100))));
    assert.equal(omitted, supplied, mode + ': annualChange changed the result, so it is NOT inert');
  }
});

test('CR2-02 CONTROL: a fixed-growth stage still requires it, and still reads it', () => {
  /* Both halves, because either alone would let the repair become a blanket
     relaxation. */
  assert.equal(validator.validateScenario(clone(stagePlan('fixed', undefined))).valid, false,
    'omitting the rate on the branch that reads it must still be an error');
  assert.equal(validator.validateScenario(clone(stagePlan('fixed', 5))).valid, true);
  assert.notEqual(
    JSON.stringify(engine.runPlan(clone(stagePlan('fixed', 0)))),
    JSON.stringify(engine.runPlan(clone(stagePlan('fixed', 100)))),
    'the fixed branch must actually consume the rate'
  );
});

/* --------------------------------------------------------------------- */
/* CR2-03: a union that unions TYPES and records PRESENCE                 */
/* --------------------------------------------------------------------- */

const { describe: describeShape, leafPaths } = require(path.join(ROOT, 'tests', 'lib', 'schema-catalogue.js'));
const shapeOf = (v) => leafPaths(describeShape(v)).join('\n');

test('CR2-03: a type change is visible in first, middle and last position', () => {
  /* Applied ALONE, in each position. The supplied CL-04 test combined an
     addition and a deletion in one mutation, so detecting the addition
     concealed the failure to detect the deletion. Pre-repair, changing
     rows[2].taxes from number to string produced a byte-identical catalogue,
     because row 0 already said 'number' and "first wins" kept it. */
  const base = () => [{ taxes: 1 }, { taxes: 2 }, { taxes: 3 }];
  const control = shapeOf(base());
  for (const i of [0, 1, 2]) {
    const mutated = base();
    mutated[i].taxes = 'broken';
    assert.notEqual(shapeOf(mutated), control,
      'a type change at position ' + i + ' must alter the described shape');
  }
});

test('CR2-03: a removal is visible in first, middle and last position', () => {
  /* A union of keys cannot establish presence, which is why deleting
     rows[2].calculationErrorCode changed nothing -- row 0 still carried it.
     The field is now marked optional instead of silently surviving. */
  const base = () => [{ a: 1, code: 'x' }, { a: 2, code: 'y' }, { a: 3, code: 'z' }];
  const control = shapeOf(base());
  for (const i of [0, 1, 2]) {
    const mutated = base();
    delete mutated[i].code;
    assert.notEqual(shapeOf(mutated), control,
      'a removal at position ' + i + ' must alter the described shape');
    assert.match(shapeOf(mutated), /code \(optional\)/,
      'and it must say the field is optional rather than drop it');
  }
});

test('CR2-03: an addition is visible in first, middle and last position', () => {
  const base = () => [{ a: 1 }, { a: 2 }, { a: 3 }];
  const control = shapeOf(base());
  for (const i of [0, 1, 2]) {
    const mutated = base();
    mutated[i].extra = true;
    assert.notEqual(shapeOf(mutated), control, 'an addition at position ' + i + ' must be visible');
  }
});

test('CR2-03: reversing heterogeneous records preserves the catalogue', () => {
  /* The sharpest form of the finding. Describing [{balance:1},{balance:"x"}]
     reported only 'number'; reversing the two reported only 'string'. A union
     whose answer depends on record order is not a union. */
  const forward = shapeOf([{ balance: 1 }, { balance: 'broken' }]);
  const backward = shapeOf([{ balance: 'broken' }, { balance: 1 }]);
  assert.equal(forward, backward, 'the described shape must not depend on record order');
  assert.match(forward, /number \| string/, 'and it must name BOTH types, not pick one');
});

test('CR2-03: repeating an identical record creates no drift', () => {
  /* The other half of order-independence: a union must be idempotent, or a
     corpus that happens to grow duplicates would read as a schema change. */
  const one = shapeOf([{ a: 1, b: 'x' }]);
  assert.equal(shapeOf([{ a: 1, b: 'x' }, { a: 1, b: 'x' }]), one);
  assert.equal(shapeOf([{ a: 1, b: 'x' }, { a: 1, b: 'x' }, { a: 1, b: 'x' }]), one);
});

test('CR2-03: three-way type splits deduplicate and sort', () => {
  const a = shapeOf([{ v: 1 }, { v: 'x' }, { v: true }]);
  const b = shapeOf([{ v: true }, { v: 1 }, { v: 'x' }]);
  assert.equal(a, b);
  assert.match(a, /boolean \| number \| string/, 'variants must be sorted, not in arrival order');
});

test('CR2-03: nested collections union too', () => {
  const forward = shapeOf([{ rows: [{ x: 1 }] }, { rows: [{ x: 'y' }] }]);
  const backward = shapeOf([{ rows: [{ x: 'y' }] }, { rows: [{ x: 1 }] }]);
  assert.equal(forward, backward);
  assert.match(forward, /number \| string/);
});

/* --------------------------------------------------------------------- */
/* CR2-04: the raw guard looks where the encoder looks                    */
/* --------------------------------------------------------------------- */

const rawEntry = (v) => harness.captureEntry('x', { rows: [{ value: v }] });

test('CR2-04: an own property on an array is refused, not erased', () => {
  /* The auditor's reproducer. Attaching unfundedAmount = 50000 to [1] produced
     byte-identical output to a bare [1], the same entry hash, a clean
     verifyIntegrity() and an empty diffSnapshots(). structuralClone() copies
     arrays with map(), which reads indices and nothing else. */
  const arr = [1];
  arr.unfundedAmount = 50000;
  assert.throws(() => rawEntry(arr), /own property "unfundedAmount" on an array/);
});

test('CR2-04: a symbol-keyed property is refused', () => {
  /* Symbol VALUES were already rejected; symbol KEYS were never inspected, so
     an object carrying $50,000 under a symbol collided with {}. */
  const o = {};
  o[Symbol('unfundedAmount')] = 50000;
  assert.throws(() => rawEntry(o), /symbol-keyed property/);
});

test('CR2-04: non-enumerable and accessor properties are refused', () => {
  const hidden = {};
  Object.defineProperty(hidden, 'h', { value: 1, enumerable: false });
  assert.throws(() => rawEntry(hidden), /non-enumerable own property/);

  const getter = {};
  Object.defineProperty(getter, 'g', { get() { return 1; }, enumerable: true, configurable: true });
  assert.throws(() => rawEntry(getter), /accessor property/);
});

test('CR2-04 CONTROL: ordinary shapes still capture, through the whole pipeline', () => {
  /* The acceptance asks for the full captureEntry -> JSON -> integrity/diff
     path, not just the guard. */
  for (const v of [[1], [0, 1, 2], [null], [[1, 2]], { a: 1 }, { a: { b: [1, { c: 2 }] } }]) {
    const entry = rawEntry(v);
    const snap = { meta: { formatVersion: 3, complete: true, omissions: [], corpusInputHash: 'cr2-fixture-corpus', hash: harness.hashOf([[entry.name, entry.hash]]) }, entries: [entry] };
    const round = JSON.parse(JSON.stringify(snap));
    assert.deepEqual(harness.verifyIntegrity(round), [], 'integrity failed for ' + JSON.stringify(v));
    assert.equal(harness.diffSnapshots(round, round).length, 0);
  }
});

test('CR2-04 CONTROL: the earlier raw-domain rejections still hold', () => {
  /* CL-03 and RC-05 controls, retained as the acceptance asks. */
  assert.throws(() => rawEntry(new Date(0)), /unsupported Date/);
  assert.throws(() => rawEntry(Array(1)), /sparse array hole/);
  assert.throws(() => rawEntry(() => 1), /unsupported function/);
  /* And the distinctions that must SURVIVE rather than be refused. */
  const hashes = [null, NaN, Infinity, -Infinity, -0, undefined].map((v) => rawEntry(v).hash);
  assert.equal(new Set(hashes).size, 6, 'six distinguishable values must produce six hashes');
});

/* --------------------------------------------------------------------- */
/* CR2-05: completeness before the success shortcut                       */
/* --------------------------------------------------------------------- */

const CLI = path.join(ROOT, 'tools', 'capture-baseline.js');
function runDiff(args) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [CLI, 'diff'].concat(args), { encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status === undefined ? 1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

function writeSnapshot(dir, name, complete, value) {
  const entry = harness.captureEntry('only', { rows: [{ value }] });
  const snap = {
    meta: {
      formatVersion: 3, corpusInputHash: 'cr2-fixture-corpus', hash: harness.hashOf([[entry.name, entry.hash]]),
      complete: complete,
      omissions: complete ? [] : [{ source: 'seeds', reason: 'deliberately reduced fixture' }],
    },
    entries: [entry],
  };
  const p = path.join(dir, name);
  fs.writeFileSync(p, JSON.stringify(snap, null, 2));
  return p;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cr2-05-'));
const reducedA = writeSnapshot(tmp, 'reduced-a.json', false, 1);
const reducedB = writeSnapshot(tmp, 'reduced-b.json', false, 2);
const completeA = writeSnapshot(tmp, 'complete-a.json', true, 1);
const completeB = writeSnapshot(tmp, 'complete-b.json', true, 2);

test('CR2-05: an IDENTICAL pair of incomplete snapshots is refused', () => {
  /* ST2-02 taught diff to WARN about a reduced capture, but the warning sat in
     the changed-results branch, BELOW the early return on matching corpus
     hashes. So a reduced snapshot diffed against itself printed
     "IDENTICAL — corpus hash ..." and exited 0, with no mention of the omission
     the file declares about itself. Content equality and completeness are
     different assertions; the shortcut was reading one as the other. */
  const r = runDiff([reducedA, reducedA]);
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /REFUSING TO COMPARE/);
  assert.match(r.out, /deliberately reduced fixture/, 'the omission must be named');
  assert.ok(!/^IDENTICAL/m.test(r.out), 'and it must not certify identity first');
});

test('CR2-05: a CHANGED pair of incomplete snapshots is refused too', () => {
  const r = runDiff([reducedA, reducedB]);
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /REFUSING TO COMPARE/);
});

test('CR2-05: one complete side and one reduced side is still refused', () => {
  assert.notEqual(runDiff([completeA, reducedA]).code, 0);
  assert.notEqual(runDiff([reducedA, completeA]).code, 0);
});

test('CR2-05: --allow-incomplete compares, and labels what it returns', () => {
  const r = runDiff([reducedA, reducedA, '--allow-incomplete']);
  assert.match(r.out, /DIAGNOSTIC COMPARISON/);
  assert.match(r.out, /NOT a regression result/);
  assert.match(r.out, /INCOMPLETE corpus/, 'even the IDENTICAL line must carry the caveat');
  assert.notEqual(r.code, 0, 'a diagnostic is not a pass');
});

test('CR2-05 CONTROL: complete snapshots compare normally', () => {
  const same = runDiff([completeA, completeA]);
  assert.equal(same.code, 0, same.out);
  assert.match(same.out, /^IDENTICAL/m);
  assert.ok(!/REFUSING|DIAGNOSTIC/.test(same.out));
  const differ = runDiff([completeA, completeB]);
  assert.notEqual(differ.code, 0);
  assert.match(differ.out, /CHANGED/);
});

test('CR2-05 CONTROL: absent completeness metadata is UNKNOWN in every format', () => {
  /* THIS CONTROL PREVIOUSLY ASSERTED A POLICY THAT HAS SINCE BEEN RETRACTED,
     and the history is worth keeping because the retraction came with a
     counterexample from inside our own package.

     P8-02 made completeness a FORMAT question: a format-2 capture predates the
     flag and was permitted silently, a current-format capture missing it was
     malformed. P9-01 showed that is wrong in both directions. The package ships
     `tools/baseline-20260910-after-CL-closure.json`, which records format 3,
     verifies cleanly, carries 36 entries -- and has neither `complete` nor
     `omissions`. So format 3 does not identify the completeness contract; the
     result ENCODING and the metadata CONTRACT began at different times.

     Corrected policy, asserted below: absent metadata is UNKNOWN in EVERY
     supported format, and unknown never yields an unqualified pass. The real
     purpose of the original control is preserved -- the shipped legacy
     baselines stay USABLE, which is what "refusing them would strand ten
     baselines" was actually protecting. */
  const mkMissing = (file, fv) => {
    const snap = JSON.parse(fs.readFileSync(completeA, 'utf8'));
    delete snap.meta.complete;
    delete snap.meta.omissions;
    if (fv !== undefined) snap.meta.formatVersion = fv;
    fs.writeFileSync(file, JSON.stringify(snap, null, 2));
    return file;
  };

  for (const [label, fv] of [['legacy format 2', 2], ['current format 3', undefined]]) {
    const f = mkMissing(path.join(tmp, 'missing-' + String(fv) + '.json'), fv);
    const r = runDiff([f, f]);
    assert.notEqual(r.code, 0,
      label + ': absent completeness metadata must not reach an unqualified pass: ' + r.out);
    assert.match(r.out, /COMPLETENESS UNKNOWN/,
      label + ': the refusal must name the state it actually found');
    /* P9-02: and it must NOT claim the file declares something it does not. */
    assert.ok(!/declares itself incomplete/.test(r.out),
      label + ': this file makes no incompleteness declaration and the tool must not say it does');
  }

  /* The cost the original control existed to prevent: shipped legacy baselines
     must remain usable for DIFFERENCE DETECTION, which needs no completeness
     claim at all. Only agreement is withheld. */
  const l1 = mkMissing(path.join(tmp, 'unknown-a.json'), 2);
  const l2 = path.join(tmp, 'unknown-b.json');
  const other = JSON.parse(fs.readFileSync(l1, 'utf8'));
  other.entries[0].result = JSON.parse(JSON.stringify(other.entries[0].result));
  other.entries[0].result.__control = 'differs';
  other.entries[0].hash = harness.hashForFormat(other.entries[0].result, 2);
  /* The corpus hash covers the entry hashes, so changing one without the other
     is an integrity failure -- which the tool duly reported, from a gate that
     runs BEFORE the comparison this test is about. A witness that dies on an
     unrelated refusal measures nothing (P7-04), so the fixture is made sound
     rather than the assertion loosened. */
  other.meta.hash = harness.hashOf(other.entries.map((x) => [x.name, x.hash]));
  fs.writeFileSync(l2, JSON.stringify(other, null, 2));
  const diff = runDiff([l1, l2]);
  assert.match(diff.out, /CHANGED/,
    'differences must still be reported over captures whose completeness is unknown: ' + diff.out);
});

test('CR2-05: the PUBLIC boundary refuses as well, not only the CLI', () => {
  /* Three determinism assertions in tests/capture-baseline.test.js read
     diffSnapshots(...).length === 0 as "nothing changed". A caller making that
     inference over an incomplete pair is making exactly the mistake the CLI
     shortcut was making. */
  const a = JSON.parse(fs.readFileSync(reducedA, 'utf8'));
  assert.throws(() => harness.diffSnapshots(a, a), /declares meta\.complete = false/);
  assert.equal(harness.diffSnapshots(a, a, { allowIncomplete: true }).length, 0,
    'and an explicit opt-in still compares');
});

/* --------------------------------------------------------------------- */
/* CR2-06: the horizon is an allocation bound too                         */
/* --------------------------------------------------------------------- */

const CUR = { balance: 100000, annualRatePct: 6, remainingTermMonths: 120 };
const REP = { annualRatePct: 4, termMonths: 120, closingCosts: 5000, financeClosingCosts: true };

test('CR2-06: a huge finite horizon is refused before any padding', () => {
  /* B2 put loan TERMS through normalizeTerm() and left horizonMonths on the old
     permissive coercion, while it drives padded() twice and the series loop. A
     valid 120-month loan with horizonMonths: 1e9 passed every term check and
     went into building a billion rows. The auditor stopped it with an in-memory
     sentry at iteration 1,802 rather than letting the heap die. */
  assert.throws(() => refinanceAnalysis(CUR, REP, { horizonMonths: 1e9 }), RangeError);
});

test('CR2-06: infinite, NaN and over-ceiling horizons are refused', () => {
  /* Infinity was the quieter half: num() mapped it to the fallback, so the
     analysis silently substituted the default horizon AND still reported
     horizonIsDefault: false -- describing a substituted window as the one the
     caller asked for. */
  /* null and undefined mean ABSENT and are covered by the default control
     below -- they are deliberately not in this list. */
  for (const h of [Infinity, -Infinity, NaN, 1801, 'twenty', [], true]) {
    assert.throws(() => refinanceAnalysis(CUR, REP, { horizonMonths: h }), RangeError,
      'horizonMonths ' + JSON.stringify(h) + ' must be refused');
  }
});

test('CR2-06: absence defaults, and is distinguishable from substitution', () => {
  const def = refinanceAnalysis(CUR, REP, {});
  assert.equal(def.horizonIsDefault, true);
  assert.equal(def.horizonRequestedMonths, null, 'nothing was requested');
  assert.equal(def.horizonMonths, 120);

  const asked = refinanceAnalysis(CUR, REP, { horizonMonths: 12 });
  assert.equal(asked.horizonIsDefault, false);
  assert.equal(asked.horizonRequestedMonths, 12);
  assert.equal(asked.horizonMonths, 12);
});

test('CR2-06: a fractional horizon floors and says so', () => {
  const r = refinanceAnalysis(CUR, REP, { horizonMonths: 240.7 });
  assert.equal(r.horizonMonths, 240, 'the effective window is whole months');
  assert.equal(r.horizonRequestedMonths, 240.7, 'and the request stays visible beside it');
});

test('CR2-06: a zero horizon is legitimate', () => {
  const r = refinanceAnalysis(CUR, REP, { horizonMonths: 0 });
  assert.equal(r.horizonMonths, 0);
  assert.equal(r.horizonIsDefault, false);
});

test('CR2-06 CONTROL: the ordinary refinance oracle is unchanged', () => {
  /* The figure the external auditor pins. It must not move by a payable amount;
     the last-bit difference from ST2-05's stable annuity is expected. */
  const r = refinanceAnalysis(CUR, REP, { horizonMonths: 12 });
  assert.equal(r.cashFlowBreakEvenMonth, 1);
  assert.equal(r.breakEvenMonth, null);
  assert.ok(Math.abs(r.horizon.netPositionDelta - 3246.129362435473) < 1e-9,
    'got ' + r.horizon.netPositionDelta);
});

test('CR2-06: the huge horizon rejects in a BOUNDED child process', () => {
  /* The acceptance asks for a bounded subprocess proving early rejection, and
     explicitly asks NOT to recreate an uncontrolled heap failure. Same shape as
     B2's term test: a memory cap, a deadline, and a controlled RangeError as
     the outcome. */
  const script = 'const {refinanceAnalysis}=require(' + JSON.stringify(path.join(ROOT, 'src', 'debt-refinance.js')) + ');' +
    'try{refinanceAnalysis(' + JSON.stringify(CUR) + ',' + JSON.stringify(REP) + ',{horizonMonths:1e9});' +
    'console.log("NO_REJECTION");}catch(e){console.log(e.constructor.name);}';
  const started = Date.now();
  const out = execFileSync(process.execPath, ['--max-old-space-size=256', '-e', script],
    { encoding: 'utf8', timeout: 20000 }).trim();
  assert.equal(out, 'RangeError', 'the outcome must be a controlled rejection, got: ' + out);
  assert.ok(Date.now() - started < 20000, 'and it must reject promptly rather than grind');
});

test.after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* best effort */ } });
