/* S5AA R6 external audit, EA-05: a Roth conversion taxed the gross dollars moved and ignored Form 8606 basis.
 *
 * convertPreTaxToRoth() returned only what it moved, and the row recognised all of it as ordinary income;
 * the explicit transfer path did the same for a pre-tax source (`transferTaxable = transferMoved`). Neither
 * applied the owner's pro-rata fraction, and neither reduced the owner's basis. MEASURED at 5c985c0 (the
 * auditor's repro, reproduced below): a $7,500 traditional IRA that is all basis, converted in full, put
 * $7,500 into federal AGI where Form 8606 puts $0.
 *
 * A conversion is a distribution from the IRA (Form 8606 Part I counts it with the others), so it is now
 * priced by the SAME primitive an ordinary distribution uses: the owner's nontaxable fraction over the
 * owner's whole traditional-IRA pool measured before the transaction moves a dollar, the recovery taken
 * off that owner's basis at once. Ordinary withdrawals, conversions and pre-tax transfers all go through
 * it, so there is one pro-rata rule and one pool convention, and because each recovery is taken off at
 * once the fraction stays the same across every transaction in a row -- no basis is used twice. An
 * employer plan is never in the IRA pool, so a 401(k) conversion stays wholly taxable.
 *
 * Fixture: one person earning $200,000 and covered by a workplace plan (a $1 Roth 401(k) deferral), so a
 * traditional IRA contribution in the one working year (the row opening at 45) is wholly nondeductible
 * basis. Conversions start in the row opening at 46 (labelled 47). Tested through runPlan only.
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

const acct = (id, type, taxClass, owner, balance, extra) => Object.assign({
  id, name: id, type, taxClass, owner, balance, basisPct: taxClass === 'taxable' ? 100 : 0,
  contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100, priority: 1,
}, extra || {});
const ira = (id, opening, basis, extra) => acct(id, 'traditionalIRA', 'preTax', 'self', opening, Object.assign({ contribution: basis, priority: 1 }, extra));
const ROTH = acct('roth-ira', 'rothIRA', 'roth', 'self', 0, { priority: 3 });
const COVER = acct('r401', 'roth401k', 'roth', 'self', 0, { contribution: 1, priority: 8 });

function run(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 45, spouseAge: 45, retireAge: 46, endAge: 50, spouseOn: false, filing: 'single' }, o.profile);
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 200000, spouseSalary: 0, growth: 0, contributionStop: 46 }, o.employment);
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false,
    stages: [], expenses: [], otherIncomes: [], selfLife: 95, spouseLife: 95,
    withdrawalOrder: 'manual', manualOrder: 'preTax,taxable,roth,hsa',
  }, o.retirement);
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, penaltyException: true, qcd: 0, debts: [], otherAssets: [] }, o.advanced);
  p.accounts = JSON.parse(JSON.stringify(o.accounts)).concat([acct('cash', 'taxable', 'taxable', 'self', 0, { priority: 9 })]);
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const row = (r, label) => r.rows.find((x) => x.age === label);
const agi = (r, label) => Number(row(r, label).federalAgi);
const convert = (amount) => ({ conversionOn: true, conversionAmount: amount });

test('EA-05: converting an IRA that is all basis recognises no income, and spends the basis', () => {
  const r = run({ accounts: [ira('ira', 0, 7500), ROTH, COVER], advanced: convert(7500) });
  assert.equal(Number(row(r, 47).roth).toFixed(0), '7501', 'CONTROL: the $7,500 reached the Roth (beside the $1 of Roth 401(k))');
  assert.equal(agi(r, 47).toFixed(2), '0.00', 'Form 8606: nontaxable basis over the pool is 100%');
});

test('EA-05: partial basis -- $4,000 of a $10,000 pool, $5,000 converted: $2,000 nontaxable, $3,000 taxable', () => {
  const r = run({ accounts: [ira('ira', 6000, 4000), ROTH, COVER], advanced: convert(5000) });
  assert.equal(agi(r, 47).toFixed(2), '3000.00', 'the first conversion');
  /* $2,000 of basis is left over the remaining $5,000 -- 40%, the same fraction -- so the second
     conversion is priced identically. That is the remaining basis, measured. */
  assert.equal(agi(r, 48).toFixed(2), '3000.00', 'the second: the remaining basis was $2,000, not $4,000 and not $0');
  assert.equal(agi(r, 49).toFixed(2), '0.00', 'CONTROL: nothing left to convert');
});

test('EA-05: the pro-rata fraction is over ALL of the owner\'s traditional IRAs, not the account converted', () => {
  /* Two IRAs: $6,000 of deductible money in one, $4,000 of basis in the other. Whichever the conversion
     draws, $4,000 converted is 40% basis -- Form 8606 line 6 pools them, and basis cannot be chosen. */
  const r = run({ accounts: [ira('ira-old', 6000, 0, { priority: 2 }), ira('ira-new', 0, 4000, { priority: 1 }), ROTH, COVER], advanced: convert(4000) });
  assert.equal(agi(r, 47).toFixed(2), '2400.00');
});

test('EA-05: a self conversion cannot consume the spouse\'s basis', () => {
  /* The spouse holds $7,500 of basis; the self converts $10,000 of deductible IRA money. Only the self
     has a Roth to convert into, so only the self converts. */
  const r = run({
    profile: { spouseOn: true, filing: 'mfj', spouseAge: 45 },
    employment: { spouseSalary: 200000 },
    retirement: { spending: 0 },
    advanced: convert(10000),
    accounts: [ira('ira-self', 10000, 0), acct('ira-spouse', 'traditionalIRA', 'preTax', 'spouse', 0, { contribution: 7500, priority: 5 }),
      ROTH, COVER, acct('r401-spouse', 'roth401k', 'roth', 'spouse', 0, { contribution: 1, priority: 8 })],
  });
  assert.equal(agi(r, 47).toFixed(2), '10000.00', 'the self has no basis: the conversion is income in full');
  const later = run({
    profile: { spouseOn: true, filing: 'mfj', spouseAge: 45 },
    employment: { spouseSalary: 200000 },
    retirement: { spending: 7500, withdrawalOrder: 'manual', manualOrder: 'preTax,taxable,roth,hsa' },
    advanced: convert(10000),
    accounts: [ira('ira-self', 10000, 0), acct('ira-spouse', 'traditionalIRA', 'preTax', 'spouse', 0, { contribution: 7500, priority: 5 }),
      ROTH, COVER, acct('r401-spouse', 'roth401k', 'roth', 'spouse', 0, { contribution: 1, priority: 8 })],
  });
  /* The self's IRA is converted away in the row labelled 47, so the $7,500 of spending that row comes
     from the spouse's IRA -- which is all the spouse's basis. */
  assert.equal(agi(later, 47).toFixed(2), '10000.00', 'the conversion income only: the spouse\'s draw is their own basis');
});

test('EA-05 control: an employer-plan conversion stays wholly taxable -- a 401(k) is not in the IRA pool', () => {
  const r = run({
    accounts: [acct('k', 'traditional401k', 'preTax', 'self', 5000, { priority: 1 }), ira('ira', 0, 7500, { priority: 2 }), ROTH, COVER],
    advanced: convert(5000),
  });
  assert.equal(agi(r, 47).toFixed(2), '5000.00', 'the $5,000 came from the 401(k) (first by priority), none of it basis');
});

test('EA-05: the transfer path gives the same answer as the conversion path', () => {
  const viaTransfer = run({
    accounts: [ira('ira', 0, 7500), ROTH, COVER],
    advanced: { transferOn: true, transferFrom: 'ira', transferTo: 'roth-ira', transferAge: 46, transferAmount: 7500 },
  });
  assert.equal(Number(row(viaTransfer, 47).roth).toFixed(0), '7501', 'CONTROL: the transfer happened in the row opening at 46');
  assert.equal(agi(viaTransfer, 47).toFixed(2), '0.00', 'a pre-tax to Roth transfer is a conversion, priced on the same basis');
  const partial = run({
    accounts: [ira('ira', 6000, 4000), ROTH, COVER],
    advanced: { transferOn: true, transferFrom: 'ira', transferTo: 'roth-ira', transferAge: 46, transferAmount: 5000 },
  });
  assert.equal(agi(partial, 47).toFixed(2), '3000.00', 'and the partial case matches the conversion path\'s $3,000');
  const toCash = run({
    accounts: [ira('ira', 0, 7500), ROTH, COVER],
    advanced: { transferOn: true, transferFrom: 'ira', transferTo: 'cash', transferAge: 46, transferAmount: 7500 },
  });
  /* The $112.50 is not the transfer: it is the 1.5% yield the engine assigns a taxable balance, earned by the
     $7,500 once it sits in the cash account (CR2-01 measured the same incidental figure). The same transfer
     with no basis behind it shows the whole $7,500 on top of that yield. */
  const toCashNoBasis = run({
    accounts: [ira('ira', 7500, 0), ROTH, COVER],
    advanced: { transferOn: true, transferFrom: 'ira', transferTo: 'cash', transferAge: 46, transferAmount: 7500 },
  });
  assert.equal(agi(toCashNoBasis, 47).toFixed(2), '7612.50', 'CONTROL: no basis -- the distribution is income in full, plus the yield');
  assert.equal(agi(toCash, 47).toFixed(2), '112.50', 'a transfer to a taxable account is a distribution, and the same basis applies: only the yield remains');
});

test('EA-05: a conversion and an ordinary IRA draw in one row share ONE fraction, and no basis is used twice', () => {
  /* $10,000 pool, $4,000 of basis (40%). $5,000 is converted, then $2,500 of spending is drawn from the
     same IRA. One fraction for both: $3,000 + $1,500 = $4,500 of income, $3,000 of basis recovered and
     $1,000 left.
       - taxing the conversion gross (the defect) gave $5,000 + $500: the draw then saw $4,000 of basis
         over a $5,000 pool and recovered $2,000;
       - recovering basis per owner but only at the end of the row would give $3,000 + $500 = $3,500:
         the draw would see the untouched $4,000 over $5,000 and spend basis the conversion had used. */
  const r = run({ accounts: [ira('ira', 6000, 4000), ROTH, COVER], advanced: convert(5000), retirement: { spending: 2500 } });
  assert.equal(agi(r, 47).toFixed(2), '4500.00');
  /* The rest: $2,500 of pool with $1,000 of basis -- 40% again. Next year's conversion takes it all. */
  assert.equal(agi(r, 48).toFixed(2), '1500.00', 'the last $2,500, 40% basis: $1,500 of income');
});
