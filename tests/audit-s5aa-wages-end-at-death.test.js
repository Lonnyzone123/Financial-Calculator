/* S5AA follow-up, Q3 (the owner, 2026-09-21): A DECEASED PERSON'S WAGES AND CONTRIBUTIONS END AT THE DEATH.
 *
 * Before this, a salary ended only at `profile.retireAge`, on its earner's own clock. A death did not end
 * it, so a spouse who died at 65 kept earning $80,000 a year until 70 -- and after F-02 that salary was
 * taxed at single rates, "one person taxed on two people's salaries" ($49,257 against $36,726 at 68,
 * the S5AA self-audit's measurement).
 *
 * THE TIMING, and why it is not F-02's. A death at lifespan L happens as the row opening at L begins, so
 * the person is dead for the whole of that row -- Social Security already stops there. F-02 still files
 * that row jointly, because the tax year CONTAINS the death (IRC 6013(a)(3)); that is a rule about the
 * return, not about earning. So the work duration becomes the shorter of "until retirement" and "until
 * death", on the earner's own clock, and a death inside a row is prorated like a retirement inside a
 * row. The owner's answer to the corrected question: "End at the death".
 *
 * Tested through runPlan only.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const account = (o) => Object.assign({
  name: o.id, type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 0, basisPct: 0,
  contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
  frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
  matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
}, o);

function run(over) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 70, endAge: 72, spouseOn: true, spouseAge: 60, filing: 'mfj' }, (over || {}).profile);
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 100000, spouseSalary: 80000, growth: 0, contributionStop: 70 }, (over || {}).employment);
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 60000, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 95, spouseLife: 95,
  }, (over || {}).retirement);
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, qcd: 0, debts: [], otherAssets: [] });
  p.accounts = ((over || {}).accounts || [{ id: 'self-401k', balance: 400000 }]).map((a, i) => account(Object.assign({ priority: i + 1 }, a)));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const row = (r, age) => r.rows.find((x) => x.age === age);
const income = (r, age) => Number(row(r, age).income);

test('Q3: the spouse who dies at 65 earns through the row that ENDS at 65, and nothing after', () => {
  const alive = run({ retirement: { spouseLife: 95 } });
  const dead = run({ retirement: { spouseLife: 65 } });
  assert.equal(income(alive, 65), 180000, 'CONTROL: both salaries, alive');
  assert.equal(income(dead, 65), 180000, 'the row ending at the death is a full year of both salaries');
  for (const age of [66, 68, 70]) {
    assert.equal(income(alive, age), 180000, 'CONTROL at ' + age);
    assert.equal(income(dead, age), 100000, 'at ' + age + ': only the survivor earns');
  }
});

test('Q3: a death inside a row is prorated, exactly as a retirement inside a row is', () => {
  const dead = run({ retirement: { spouseLife: 65.5 } });
  assert.equal(income(dead, 66), 100000 + 40000, 'half a year of the spouse, then nothing');
  assert.equal(income(dead, 67), 100000);
});

test('Q3: the self\'s own wages end at the self\'s death too', () => {
  const dead = run({ retirement: { selfLife: 64 } });
  assert.equal(income(dead, 64), 180000);
  assert.equal(income(dead, 65), 80000, 'only the spouse earns once the self has died');
});

test('Q3: contributions end with the wages that fund them', () => {
  const accounts = [{ id: 'self-401k', balance: 400000 }, { id: 'spouse-401k', owner: 'spouse', balance: 100000, contribution: 10000 }];
  const alive = run({ retirement: { spouseLife: 95 }, accounts });
  const dead = run({ retirement: { spouseLife: 65 }, accounts });
  const contrib = (r, age) => Number(row(r, age).contributions);
  assert.ok(contrib(alive, 68) > 0, 'CONTROL: a living spouse contributes at 68');
  assert.equal(contrib(dead, 65), contrib(alive, 65), 'the year ending at the death is contributed in full');
  assert.equal(contrib(dead, 68), 0, 'and nothing after it');
});

test('Q3: the mixture the self-audit measured is gone -- the widow is taxed on ONE salary', () => {
  const dead = run({ retirement: { spouseLife: 65 } });
  const solo = run({ profile: { spouseOn: false, filing: 'single' }, employment: { spouseSalary: 0 } });
  /* The same one salary, taxed as the single survivor it now belongs to. The pre-Q3 figure at 68 was
     $49,257 on $180,000 of income. */
  assert.equal(income(dead, 68), income(solo, 68));
  assert.equal(Number(row(dead, 68).taxes).toFixed(2), Number(row(solo, 68).taxes).toFixed(2),
    'a widow with one salary pays what a single person with that salary pays');
});

test('Q3: a death AFTER retirement changes nothing about wages -- they had already ended', () => {
  const retiredDeath = run({ profile: { retireAge: 62 }, retirement: { spouseLife: 66 } });
  const alive = run({ profile: { retireAge: 62 }, retirement: { spouseLife: 95 } });
  for (const age of [61, 62, 63, 67]) assert.equal(income(retiredDeath, age), income(alive, age), 'at ' + age);
});

/* THIRD AUDIT: Q3 changed the loop's work duration and left a SECOND COPY of the same rule behind --
   ownerContributionEligibility(), which still ended work only at retirement. Eligibility is applied
   BEFORE a shared limit is split between the spouses (R2-005), so a dead spouse who still counted as
   eligible took part of the HSA family limit, contributed nothing with it, and left the survivor capped.
   MEASURED at 4e97830..e9539ea with the dead spouse's HSA listed first: the survivor asked for $5,000,
   inside the $8,750 family limit, and got $3,750 a year -- $1,250 pushed to the taxable account as
   "excess". Order-dependent, which is how a test with the other order never saw it. */
test('third audit: a dead spouse does not take part of the HSA family limit from the survivor', () => {
  const hsa = (o) => Object.assign({ type: 'hsa', taxClass: 'hsa' }, o);
  const accounts = [
    hsa({ id: 'spouse-hsa', owner: 'spouse', balance: 1000, contribution: 5000 }),
    hsa({ id: 'self-hsa', balance: 1000, contribution: 5000 }),
    { id: 'cash', type: 'taxable', taxClass: 'taxable', basisPct: 100, balance: 50000 },
  ];
  const r = run({ profile: { age: 50, spouseAge: 50, endAge: 56 }, retirement: { spouseLife: 52 }, accounts });
  const hsaBalance = (age) => Number(row(r, age).hsa);
  assert.equal(hsaBalance(52) - hsaBalance(51), 8750, 'CONTROL: both alive, the family limit binds');
  for (const age of [54, 55]) {
    assert.equal(hsaBalance(age) - hsaBalance(age - 1), 5000,
      'at ' + age + ': the survivor\'s whole $5,000 goes in -- nothing is reserved for someone who has died');
  }
});

/* THIRD AUDIT: Q3 ended the SALARY at the death and nothing else a person earns. An `employment` income
   stream is wages too -- task 3.4 routes it into the payroll base -- and a `selfEmployment` stream is
   that person's own earnings, charged self-employment tax per owner. MEASURED at 4e97830..e9539ea: a
   spouse dying at 63 kept being paid $40,000 a year from either stream, to the stream's own end age of
   75. Streams that can outlive their owner -- rental, investment, a plain recurring income -- are left
   alone; they continue as before. */
test('third audit: an employment or self-employment stream ends at its owner\'s death; other streams do not', () => {
  const stream = (type) => run({
    profile: { age: 60, spouseAge: 60, retireAge: 62, endAge: 70 },
    employment: { salary: 0, spouseSalary: 0 },
    retirement: { spouseLife: 63.5, otherIncomes: [{ name: 'x', type, owner: 'spouse', amount: 40000, start: 60, end: 75, growth: 0 }] },
  });
  for (const type of ['employment', 'selfEmployment']) {
    const r = stream(type);
    assert.equal(income(r, 63), 40000, type + ' CONTROL: a full year while alive');
    assert.equal(income(r, 64), 20000, type + ': half a year, then the death at 63.5');
    assert.equal(income(r, 66), 0, type + ': nothing after it');
  }
  const rec = stream('recurring');
  assert.equal(income(rec, 66), 40000, 'a plain recurring income continues -- it can outlive its owner');
});

/* DEEPSEEK AUDIT, finding 2d/02 (2026-09-22, reproduced by Claude): the third audit's repair bounded a stream by
   `Math.min(Number(i.end), lifespan)`. A stream entered with NO end age -- or a non-numeric one -- has
   Number(i.end) === NaN, Math.min(NaN, x) is NaN, and every comparison with NaN is false: the death bound
   silently switched off and the stream paid to the end of the plan. MEASURED at 623cf64: $40,000 at 66
   for a spouse who died at 63.5. An absent end means "no end of its own", so the death is the only bound. */
/* S5AA R43 (SA42F-06): a stream with no end age, or a non-numeric one, is refused at the input gate now (src/plan-value-contract.json),
   so this guard reaches otherIncomeFor()'s death bound with an end age far past the death, which is what the bound is for. */
test('DeepSeek 2d/02: an employment or self-employment stream with an end age past the death still ends at its owner\'s death', () => {
  for (const end of [120, 200]) {
    for (const type of ['employment', 'selfEmployment']) {
      const s = { name: 'x', type, owner: 'spouse', amount: 40000, start: 60, growth: 0 };
      if (end !== undefined) s.end = end;
      const r = run({
        profile: { age: 60, spouseAge: 60, retireAge: 62, endAge: 70 },
        employment: { salary: 0, spouseSalary: 0 },
        retirement: { spouseLife: 63.5, otherIncomes: [s] },
      });
      const label = type + ' with end ' + JSON.stringify(end);
      assert.equal(income(r, 63), 40000, label + ' CONTROL: a full year while alive');
      assert.equal(income(r, 64), 20000, label + ': half a year, then the death at 63.5');
      assert.equal(income(r, 66), 0, label + ': nothing after it');
    }
  }
});
