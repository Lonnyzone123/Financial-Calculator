/* S5 task 8 (R6 of the audit repair round), on the owner's question 5 answered (C), 2026-09-14: the Arizona return's deduction, age-65 exemption and Social
 * Security subtraction, and nothing else yet.
 *
 * TAX_RULES_ENGINE_REFERENCE_2026.md section 5.2 and 5.3:
 *   arizona_agi            = federal AGI - federally taxable Social Security (the only subtraction built)
 *   arizona_taxable_income = max(0, arizona_agi - basic standard deduction - $2,100 per person 65 or older)
 *   arizona tax            = 2.5% * arizona_taxable_income
 * The basic deduction ($16,100 single/MFS, $24,150 HoH, $32,200 MFJ) is INFERRED pending the final Form 140; the
 * exemption and the Social Security subtraction are ENACTED. The proxy that stood the federal standard deduction in for
 * Arizona's already gave the same deduction amounts and already left out Social Security, so the arithmetic change is
 * the exemption. The head-of-household charitable cap stays FORM_PENDING, a release blocker; no charitable addition is
 * applied. The funding solver's Arizona clamp mirrors the exemption.
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

const who = (filing, age, spouseAge) => ({ profile: { filing, age, spouseOn: spouseAge !== undefined, spouseAge: spouseAge === undefined ? age : spouseAge } });
const cents = (v) => Math.round(v * 100) / 100;

test('Arizona taxable income subtracts the basic standard deduction and $2,100 for an owner 65 or older', () => {
  const r = engine.estimateTaxes(who('single', 67), 67, 60000, 0, 0, 0, 0, 0);
  /* S5AA R48 (AA1-16, the owner's AA1 decision of 2026-10-03): Arizona also subtracts the federal senior deduction (A.R.S. 43-1022(35)),
     here the full $6,000 (MAGI $60,000, under $75,000): 895, was (60,000 - 16,100 - 2,100) x 2.5% = 1,045. */
  assert.equal(cents(r.az), cents((60000 - 16100 - 2100 - 6000) * 0.025));
});

test('a married couple gets one $2,100 exemption for each spouse 65 or older, and none for a spouse under 65', () => {
  const both = engine.estimateTaxes(who('mfj', 70, 70), 70, 90000, 0, 0, 0, 0, 0);
  const one = engine.estimateTaxes(who('mfj', 70, 60), 70, 90000, 0, 0, 0, 0, 0);
  /* S5AA R48 (AA1-16): less the federal senior deduction, $6,000 for each spouse 65 or older (joint MAGI $90,000, under $150,000):
     1,040 and 1,242.50, were 1,340 and 1,392.50. */
  assert.equal(cents(both.az), cents((90000 - 32200 - 4200 - 12000) * 0.025), 'both 70');
  assert.equal(cents(one.az), cents((90000 - 32200 - 2100 - 6000) * 0.025), 'spouse 60');
});

test('arizona_agi is federal AGI less federally taxable Social Security -- and, since S5AA R48, less the federal senior deduction', () => {
  const r = engine.estimateTaxes(who('single', 67), 67, 40000, 5000, 24000, 0, 0, 0);
  assert.ok(r.ssTaxable > 0, 'premise: some Social Security is federally taxable');
  /* S5AA R48 (AA1-16): Arizona AGI is Arizona gross income less the 43-1022 subtractions, which now include the federal senior deduction
     (43-1022(35)): the full $6,000 here (federal AGI under $75,000). It was federal AGI less taxable Social Security alone. */
  assert.ok(r.measures.federal_agi < 75000, 'premise: the full senior deduction');
  assert.ok(Math.abs(r.measures.arizona_agi - (r.measures.federal_agi - r.ssTaxable - 6000)) <= 1e-6, 'arizona_agi ' + r.measures.arizona_agi);
});

test('the Arizona parameters are records with their authority statuses, and the proxy fields are gone', () => {
  const az = RULES.arizona;
  assert.equal(Object.prototype.hasOwnProperty.call(az, 'estimateMethod'), false, 'estimateMethod retired');
  assert.equal(Object.prototype.hasOwnProperty.call(az, 'standardDeduction2026'), false, 'standardDeduction2026 retired');
  const rec = (id, filing) => (az.records || []).find((r) => r.provision_id === id && r.filing_status === filing);
  for (const [filing, value] of [['single', 16100], ['mfs', 16100], ['hoh', 24150], ['mfj', 32200]]) {
    assert.equal(rec('az_basic_standard_deduction', filing).value, value, filing);
    assert.equal(rec('az_basic_standard_deduction', filing).status, 'INFERRED', filing);
  }
  assert.equal(rec('az_age65_exemption', 'per_qualifying_person').value, 2100);
  assert.equal(rec('az_age65_exemption', 'per_qualifying_person').status, 'ENACTED');
  assert.equal(rec('az_subtraction_federally_taxable_social_security', 'all').status, 'ENACTED');
  assert.equal(rec('az_standard_deduction_charity_cap', 'hoh').status, 'FORM_PENDING');
});

test('control: under 65, Arizona tax is the deduction-only figure it was', () => {
  assert.equal(cents(engine.estimateTaxes(who('single', 40), 40, 60000, 0, 0, 0, 0, 0).az), cents((60000 - 16100) * 0.025));
});

test('control: a funding quote for a 65+ household that crosses Arizona\'s zero-tax point reconciles to estimateTaxes()', () => {
  const p = { profile: { filing: 'single', age: 68, spouseOn: false, spouseAge: 68 }, retirement: { withdrawalOrder: 'priority', manualOrder: 'preTax,taxable,roth,hsa' }, advanced: { assetsOn: false, reserveOn: false, penaltyException: false, rule55: false } };
  const ordinary = 16000;
  const T0 = engine.estimateTaxes(p, 68, ordinary, 0, 0, 0, 0, 0).total;
  // $3,000 of tax to fund from $16,000 of income: the sale passes $16,100 (the under-65 zero point) and $18,200.
  const ctx = { ordinaryIncome: ordinary, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0, filing: 'single', seniorAges: [68, -1], Tbase: T0 - 3000, payrollConst: 0, penalties: 0, penaltyApplies: false };
  const quote = engine.quoteTaxFunding(ctx, ['preTax'], [{ id: 'ira', taxClass: 'preTax', balance: 1000000, basisPct: 0, priority: 1 }], p, 0, 0);
  assert.equal(quote.status, 'funded');
  const raised = quote.transactions.reduce((s, t) => s + t.gross, 0);
  const real = engine.estimateTaxes(p, 68, quote.finalOrdinaryIncome, quote.finalCapitalGains, 0, 0, 0, 0);
  assert.ok(quote.finalOrdinaryIncome > 16100 + 2100, 'the sale crosses the Arizona deduction plus exemption: ' + quote.finalOrdinaryIncome);
  assert.ok(Math.abs(raised - (Math.max(0, real.total - ctx.Tbase) + quote.finalPenalties)) <= 0.01, 'raised ' + raised);
});

/* The exemption lowers Arizona taxable income by $2,100 per person 65 or older, but never below zero, so it saves UP TO
   2.5% x $2,100 = $52.50 per person: all of it when the income left after the deduction covers the exemption, part of it
   when it covers less, and nothing when there is no Arizona taxable income to begin with. Each case compares the same
   income at 64 and at 67 (or 60 and 70), where only the exemption differs on the Arizona side. */
const azAt = (filing, age, spouseAge, ordinary) => engine.estimateTaxes(who(filing, age, spouseAge), age, ordinary, 0, 0, 0, 0, 0).az;

test('the age-65 exemption saves its full $52.50 when Arizona taxable income covers it', () => {
  /* S5AA R48 (AA1-16): at 67 Arizona also subtracts the federal senior deduction (43-1022(35)), so at $60,000 the difference became
     $202.50 ($52.50 + 2.5% x $6,000). The case isolates the exemption at $200,000, where the senior deduction is fully phased out
     ($6,000 - 6% x (200,000 - 75,000) < 0). */
  assert.equal(cents(azAt('single', 64, undefined, 200000) - azAt('single', 67, undefined, 200000)), 52.5);
});

test('the age-65 exemption saves only part of $52.50 when Arizona taxable income is smaller than the exemption', () => {
  /* $17,100 less the $16,100 deduction leaves $1,000: $25.00 of tax at 64, none at 67. */
  assert.equal(cents(azAt('single', 64, undefined, 17100)), 25);
  assert.equal(cents(azAt('single', 67, undefined, 17100)), 0);
  /* A couple both 70 with $3,000 over the $32,200 deduction: $75.00 saved of the $105.00 two exemptions could save. */
  assert.equal(cents(azAt('mfj', 60, 60, 35200) - azAt('mfj', 70, 70, 35200)), 75);
});

test('the age-65 exemption saves nothing when there is no Arizona taxable income', () => {
  assert.equal(cents(azAt('single', 64, undefined, 15000)), 0);
  assert.equal(cents(azAt('single', 67, undefined, 15000)), 0);
});
