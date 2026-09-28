/* S5AA, R12 round: RESULT-CONTRACT VERSION 4 -- THE LAST-DEATH CUT IS A VERSION'S RULE, NOT "WHATEVER IS LATEST"
 * (external re-audit of `b053dc2`, R11-02; the owner, 2026-09-22: "bump to version 4").
 *
 * The R11 repair (c1abfdf) made R-AGE-SPAN require decision 8's cut for any result checked at `version >=
 * CONTRACT.contractVersion`, and the contract version stayed 3. So every stored VERSION-3 capture taken before decision 8
 * was re-judged under the new rule. MEASURED at `b053dc2`: the five golden members of the stored r6 capture
 * (`tools/baseline-20260921-s5aa-expanded-r6.json`, recorded version 3, input hashes matching) end at 100, as the engine
 * that produced them did, and each now had two R-AGE-SPAN violations; under the R10 checker they had none. The R11
 * response said no stored capture needed the old reading and that the gate confirmed it. Nothing in the gate ran the
 * contract over r6 with its plans, so the claim was an inference, and it was wrong. The synthetic compatibility test asked
 * for version 2, so it could not see this.
 *
 * Now:
 *  - version 4 is the version in which the cut is REQUIRED -- the rule is frozen to version 4 and later, not to whichever
 *    version happens to be current -- and the engine produces version 4;
 *  - version 3 keeps the reading it had when those captures were taken: the disclosure, where present, names the cut;
 *  - a capture recording an older version than the producer's is accepted only where it is a KNOWN capture of that
 *    version, by commit and output hash. The seven stored version-3 captures are registered as such, so a current result
 *    cannot opt out of version 4 by writing 3 into its metadata.
 * Every member of every stored version-3 capture whose input still fingerprints the same is checked below, under the
 * version its own provenance gives. No stored row is rewritten, and r6 is not relabelled.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const capture = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
capture.installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const contract = require(path.join(ROOT, 'tools', 'result-contract.js'));
const corpus = require(path.join(ROOT, 'tools', 'corpus-invariant.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const VERSION_THREE_CAPTURES = ['baseline-20260920-s5aa-expanded.json', 'baseline-20260920-s5aa-expanded-r2.json',
  'baseline-20260921-s5aa-expanded-r3.json', 'baseline-20260921-s5aa-expanded-r4.json', 'baseline-20260921-s5aa-expanded-r5.json',
  'baseline-20260921-s5aa-expanded-r6.json', 'baseline-20260922-s5aa-expanded-r7.json'];
const plans = corpus.buildPlans(corpus.readSpec(path.join(ROOT, 'tools', 'corpus-spec-expanded.json'))).plans;
const readCapture = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8'));

/* Every member whose input still fingerprints as it did when captured, judged under its own capture's version. */
function judge(file) {
  const snapshot = readCapture(file);
  const version = contract.captureContractVersion(snapshot.meta);
  const out = { version, checked: 0, ageSpan: [] };
  for (const x of corpus.decodeEntries(snapshot).decoded) {
    const plan = plans.get(x.name);
    if (!plan || !x.result || !Array.isArray(x.result.rows)) continue;
    if (capture.inputHashesOf([{ name: x.name, plan }])[x.name] !== snapshot.meta.inputHashes[x.name]) continue;
    out.checked++;
    for (const v of contract.checkResult(x.result, { plan, contractVersion: version }).violations) {
      if (v.rule === 'R-AGE-SPAN') out.ageSpan.push(x.name + ': ' + v.message);
    }
  }
  return out;
}

test('R11-02: the stored r6 capture (version 3, before decision 8) is judged under its own version, and passes', () => {
  const r6 = judge('baseline-20260921-s5aa-expanded-r6.json');
  assert.equal(r6.version, 3, 'its provenance is version 3, and it is not relabelled');
  const golden = readCapture('baseline-20260921-s5aa-expanded-r6.json');
  const goldenLast = corpus.decodeEntries(golden).decoded.filter((x) => x.name.startsWith('golden:')).map((x) => x.result.rows.at(-1).age);
  assert.deepEqual(goldenLast, [100, 100, 100, 100, 100], 'CONTROL: its golden members end at 100, as the engine that made them did');
  assert.ok(r6.checked >= 5, 'at least the five golden members still fingerprint the same');
  assert.deepEqual(r6.ageSpan, []);
});

test('R11-02: every stored version-3 capture is judged under version 3, and none is re-judged by the new rule', () => {
  for (const f of VERSION_THREE_CAPTURES) {
    const j = judge(f);
    assert.equal(j.version, 3, f + ': a known version-3 capture');
    assert.deepEqual(j.ageSpan, [], f);
  }
});

test('R11-02: the engine produces the current version, and the death cut stays frozen at version 4', () => {
  /* RE-FIXTURED at the R19 round: workstream A's tax ledger is result-contract version 5, so the producer is 5. The point
     of this test survives the bump -- the cut's rule is frozen to ITS version (4), not to whichever is latest. */
  assert.equal(engine.RESULT_CONTRACT_VERSION, 5);
  assert.equal(contract.CONTRACT.contractVersion, 5);
  assert.equal(contract.LAST_DEATH_CUT_REQUIRED_FROM, 4, 'the rule is frozen to its own version, not to the latest');
});

test('R11-02: a current result cannot claim version 3 to escape the cut -- an unknown capture recording 3 has no version', () => {
  const r7 = readCapture('baseline-20260922-s5aa-expanded-r7.json');
  assert.equal(contract.captureContractVersion(r7.meta), 3, 'CONTROL: the genuine capture keeps its version');
  assert.equal(contract.captureContractVersion(Object.assign({}, r7.meta, { hash: '0'.repeat(64) })), null, 'same claim, unknown output');
  assert.equal(contract.captureContractVersion(Object.assign({}, r7.meta, { gitCommit: 'f'.repeat(40) })), null, 'same claim, unknown commit');
});

/* The R10 corruptions, which R11 made violations, stay violations for a current result -- now at version 4. */
function planFor() {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 90, retireAge: 60, endAge: 100, spouseOn: false, spouseAge: 90, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [],
    otherIncomes: [], selfLife: 95, spouseLife: 95, survivor: false });
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = [{ id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 500000, basisPct: 100, contribution: 0, priority: 1 }];
  return p;
}
const ageSpan = (result, plan, version) => contract.checkResult(result, version === undefined ? { plan } : { plan, contractVersion: version })
  .violations.filter((v) => v.rule === 'R-AGE-SPAN');

test('R11-02: both R10 corruptions still fail for a current result; under version 3 they read as they did then', () => {
  const plan = planFor();
  const genuine = engine.runPlan(plan);
  assert.deepEqual(ageSpan(genuine, plan), [], 'CONTROL: the genuine result passes');
  const restored = JSON.parse(JSON.stringify(genuine));
  restored.issues = restored.issues.filter((i) => i.code !== 'PROJECTION_ENDS_AT_LAST_DEATH');
  const last = restored.rows[restored.rows.length - 1];
  for (let age = 97; age <= 100; age++) restored.rows.push(Object.assign(JSON.parse(JSON.stringify(last)), { age }));
  const misnamed = JSON.parse(JSON.stringify(genuine));
  misnamed.issues.find((i) => i.code === 'PROJECTION_ENDS_AT_LAST_DEATH').state.lastRowAge = 123;
  assert.equal(ageSpan(restored, plan).length, 2, 'version 4: restored rows and no disclosure');
  assert.equal(ageSpan(misnamed, plan).length, 1, 'version 4: a disclosure naming the wrong last row');
  assert.deepEqual(ageSpan(restored, plan, 3), [], 'version 3, frozen: without the disclosure, profile.endAge');
  assert.deepEqual(ageSpan(misnamed, plan, 3), [], 'version 3 never read lastRowAge');
});
