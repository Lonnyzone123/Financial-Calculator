/* S5AA R32: A ROLLOVER STAYS WITH ITS OWNER, AND A ROTH IRA CANNOT ROLL INTO A 401(k) (ChatGPT's R30A account and transfer audit
 * of 66c406c, R30A-02 and R30A-03, P2; the owner 2026-09-28: "Refuse it" for both).
 *
 * The rules, read at their sources:
 *   - IRC 408(d)(3)(A): an IRA rollover is paid "into an individual retirement account ... for the benefit of such individual", or
 *     into an eligible retirement plan "for the benefit of such individual" -- the same person;
 *   - IRC 223(f)(5)(A): an HSA rollover is paid "into a health savings account for the benefit of such beneficiary";
 *   - Publication 590-A, "Rollover From a Roth IRA": "A rollover from a Roth IRA to an employer retirement plan isn't allowed."
 *     The reverse -- a designated Roth account into a Roth IRA -- is allowed.
 * A divorce instrument, a QDRO and a death are separate paths the model does not route through a scheduled transfer; its handling
 * of an account at a death is unchanged. Marriage alone is not an exception.
 *
 * So a scheduled transfer between two of the named sheltered accounts of the same tax class -- traditional IRA, traditional 401(k),
 * Roth IRA, Roth 401(k), HSA -- is refused when their owners differ, and a Roth IRA into a Roth 401(k) is refused whoever owns them.
 * The validator reports the plan; the engine, given it anyway, moves nothing and says why. The model's three custom accounts are
 * its own wrappers, not these accounts, and are unchanged; so are transfers between different tax classes, which are already a
 * distribution, a conversion or a contribution by their own rules (R29), and taxable to taxable, which is a gift.
 *
 * Witness plans (ChatGPT's): $10,000 in the source at 0%, an empty destination at +10%, moved at 60 and held a year. Refused, the
 * sheltered class ends at $10,000; moved, at $11,000 -- the growth shows which account holds the dollars.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const CLASS = { taxable: 'taxable', traditionalIRA: 'preTax', traditional401k: 'preTax', rothIRA: 'roth', roth401k: 'roth', hsa: 'hsa',
  customTraditional: 'preTax', customRoth: 'roth' };
const FIELD = { preTax: 'preTax', roth: 'roth', hsa: 'hsa', taxable: 'taxable' };
function account(id, type, balance, extra) {
  return Object.assign({ id, name: id, type, taxClass: CLASS[type], owner: 'self', balance, basisPct: 100, qualifiedMedicalPct: 0,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: { flat: 100 }, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
    priority: id === 'cash' ? 0 : 2 }, extra || {});
}
function plan(from, to, fromOwner, toOwner, at) {
  const spouse = fromOwner === 'spouse' || toOwner === 'spouse';
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.limitPolicy = 'redirect';
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 61, spouseOn: spouse, filing: spouse ? 'mfj' : 'single' });
  if (spouse) Object.assign(p.profile, { spouseAge: 60, spouseRetireAge: 60, spouseEndAge: 61 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 62 });
  const wages = [{ name: 'Wages', type: 'employment', owner: 'self', amount: 20000, start: 60, end: 61, growth: 0, growthMode: 'fixed' }];
  if (spouse) wages.push({ name: 'Spouse wages', type: 'employment', owner: 'spouse', amount: 20000, start: 60, end: 61, growth: 0, growthMode: 'fixed' });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, pensionCola: 0, ssBenefit: 0,
    spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: wages, withdrawalOrder: 'manual', manualOrder: 'taxable,preTax,roth,hsa' });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, ltcOn: false, networthOn: true, otherAssets: [], debts: [],
    assetsOn: true, assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }, { id: 'moving', name: 'Moving', returnRate: 10, volatility: 0 }],
    rule55: false, penaltyException: true, transferOn: true, transferFrom: 'src', transferTo: 'dst', transferAmount: 10000, transferAge: at });
  p.accounts = [account('cash', 'taxable', 100000, { cashHolding: true, allocation: {} }),
    account('src', from, 10000, { owner: fromOwner }), account('dst', to, 0, { owner: toOwner, allocation: { moving: 100 } })];
  return p;
}
function run(p) {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const codes = (list) => (list || []).map((i) => i.code);
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);
const NAMED = ['traditionalIRA', 'traditional401k', 'rothIRA', 'roth401k', 'hsa'];

test('R30A-02: a Roth IRA into a Roth 401(k) is refused -- by the validator, and by the engine, which moves nothing -- for either owner, on every date', () => {
  for (const owner of ['self', 'spouse']) for (const at of [60, 60.25, 60.75]) {
    const p = plan('rothIRA', 'roth401k', owner, owner, at);
    const v = validateScenario(JSON.parse(JSON.stringify(p)));
    assert.equal(v.valid, false, 'the validator refuses it');
    assert.ok(codes(v.issues).includes('TRANSFER_INTO_WORKPLACE_PLAN'), JSON.stringify(codes(v.issues)));
    const r = run(p);
    assert.ok(codes(r.issues).includes('TRANSFER_INTO_WORKPLACE_REFUSED'), owner + ' ' + at + ': ' + JSON.stringify(codes(r.issues)));
    near(r.rows[1].roth, 10000, owner + ' at ' + at + ': the Roth IRA keeps it (was $11,000 at 60)');
  }
});

test('R30A-02 CONTROL: a Roth 401(k) into its owner\'s Roth IRA is still a rollover -- $10,000 moved at 60 grows to $11,000', () => {
  const p = plan('roth401k', 'rothIRA', 'self', 'self', 60);
  assert.equal(validateScenario(JSON.parse(JSON.stringify(p))).valid, true);
  near(run(p).rows[1].roth, 11000, 'the Roth class');
});

test('R30A-03: a rollover between two living owners\' named accounts of the same class is refused, both ways, on every date', () => {
  let cases = 0;
  for (const from of NAMED) for (const to of NAMED) {
    if (CLASS[from] !== CLASS[to]) continue;
    for (const [fo, tw] of [['self', 'spouse'], ['spouse', 'self']]) for (const at of [60, 60.25, 60.75]) {
      const p = plan(from, to, fo, tw, at);
      const v = validateScenario(JSON.parse(JSON.stringify(p)));
      const tag = from + ' (' + fo + ') -> ' + to + ' (' + tw + ') at ' + at;
      assert.equal(v.valid, false, tag + ': the validator refuses it');
      assert.ok(codes(v.issues).includes('TRANSFER_BETWEEN_OWNERS') || codes(v.issues).includes('TRANSFER_INTO_WORKPLACE_PLAN'), tag + ': ' + JSON.stringify(codes(v.issues)));
      const r = run(p);
      assert.ok(codes(r.issues).some((c) => /REFUSED$/.test(c)), tag + ': ' + JSON.stringify(codes(r.issues)));
      near(r.rows[1][FIELD[CLASS[from]]], 10000, tag + ': nothing moved');
      cases++;
    }
  }
  assert.equal(cases, 54, 'nine directed same-class pairs, two directions, three dates');
});

test('R30A-03: ChatGPT\'s witnesses -- the self\'s IRA into the spouse\'s IRA, and HSA into HSA -- keep $10,000, with the reason', () => {
  for (const type of ['traditionalIRA', 'hsa']) {
    const r = run(plan(type, type, 'self', 'spouse', 60));
    assert.ok(codes(r.issues).includes('TRANSFER_BETWEEN_OWNERS_REFUSED'), type + ': ' + JSON.stringify(codes(r.issues)));
    near(r.rows[1][FIELD[CLASS[type]]], 10000, type + ': was $11,000');
  }
});

test('R30A-03 CONTROLS: the same owner\'s rollover, a gift between taxable accounts, and a distribution into the spouse\'s HSA still move', () => {
  const same = plan('traditionalIRA', 'traditionalIRA', 'spouse', 'spouse', 60);
  assert.equal(validateScenario(JSON.parse(JSON.stringify(same))).valid, true);
  near(run(same).rows[1].preTax, 11000, 'the spouse\'s own IRA rollover');
  const gift = plan('taxable', 'taxable', 'self', 'spouse', 60);
  assert.equal(validateScenario(JSON.parse(JSON.stringify(gift))).valid, true);
  assert.ok(!codes(run(gift).issues).includes('TRANSFER_BETWEEN_OWNERS_REFUSED'), 'a gift between taxable accounts is not refused');
  // R29: a traditional IRA into the spouse's HSA is a distribution and then a deductible contribution, held to the HSA room.
  const dc = plan('traditionalIRA', 'hsa', 'self', 'spouse', 60);
  assert.equal(validateScenario(JSON.parse(JSON.stringify(dc))).valid, true);
  const r = run(dc);
  assert.ok(!codes(r.issues).includes('TRANSFER_BETWEEN_OWNERS_REFUSED'), 'different classes are not a rollover');
  assert.ok(r.rows[1].hsa > 0, 'the spouse\'s HSA received the contribution');
});

test('CONTROL: the model\'s custom wrappers are unchanged -- a custom tax-deferred account into the spouse\'s moves as before', () => {
  const p = plan('customTraditional', 'customTraditional', 'self', 'spouse', 60);
  assert.equal(validateScenario(JSON.parse(JSON.stringify(p))).valid, true);
  near(run(p).rows[1].preTax, 11000, 'moved and grew');
});
