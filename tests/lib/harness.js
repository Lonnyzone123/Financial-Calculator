'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const CALCULATOR_PATH = path.join(__dirname, '..', '..', 'investment-calculator-v2c.html');

/*
 * S4 task 7.4b (S4-PA-01): TWO ARTIFACT LANES, NAMED.
 *
 *   fresh       (the default) a scratch build of THIS tree, built once per
 *               process by build.js. Every test asserting how the app behaves
 *               now boots it, so it certifies current source.
 *   historical  the tracked investment-calculator-v2c.html, last rebuilt
 *               2026-09-16 from 84a5451's sources, after S5's R10 round (S5R-05's base record)
 *               (the owner's answer 5 (A)). It goes stale again with the next source change,
 *               until it is next rebuilt deliberately (S5b task 4.3).
 *               Only verifyArtifactHash() -- which exists to pin that file --
 *               and an explicit loadCalculator({ artifact: 'historical' }) read
 *               it, and it is read lazily, so the fresh lane never touches it.
 *
 * Measured before the move: the five files that call loadCalculator() --
 * regression-suite, audit-import, import-validation, debug-module and
 * simulation-identity -- passed 51 of their 52 tests against a fresh build.
 * The 52nd is the artifact pin, historical by definition. That was only true
 * once the script selector below was keyed to the app: the old selector took
 * "the first non-JSON script", which in a current build is the PWA bootstrap,
 * and 26 of the 52 failed for that reason alone.
 */
let historicalHtml = null;
function historicalArtifactHtml() {
  if (historicalHtml === null) historicalHtml = fs.readFileSync(CALCULATOR_PATH, 'utf8');
  return historicalHtml;
}

let freshHtml = null;
function freshBuildHtml() {
  if (freshHtml !== null) return freshHtml;
  const os = require('node:os');
  const { build } = require('../../build.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-artifact-lane-'));
  const log = console.log;
  console.log = () => {};
  try {
    freshHtml = build(path.join(dir, 'app.html')).output;
  } finally {
    console.log = log;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return freshHtml;
}

const LANES = { fresh: freshBuildHtml, historical: historicalArtifactHtml };
function artifactFor(lane) {
  if (!Object.prototype.hasOwnProperty.call(LANES, lane)) {
    throw new Error('loadCalculator: unknown artifact lane ' + JSON.stringify(lane) + '; use "fresh" or "historical"');
  }
  return LANES[lane]();
}

// Originally verified against the handover's documented hash for
// investment-calculator-v2c.html (22ca19ab...). That hash is now expected
// history, not a mismatch to chase: Phase 2 (see MERGE_AUDIT_AND_PLAN.md)
// deliberately rebuilt this file from src/app-shell.html + src/engine.js via
// build.js, relocating the calculation engine without changing behavior --
// proven by the other 12 tests in this suite passing identically before and
// after. This constant tracks the current build's hash so unintended source
// drift (an edit to investment-calculator-v2c.html that bypassed build.js)
// still gets caught. Update it deliberately, alongside a `npm run build`,
// whenever a real source change intentionally changes the built output.
//
// Changed 2026-09-08 (the first change here that alters live app BEHAVIOR
// rather than just relocating code): validateScenario() is now called from
// importSettings(), and src/scenario-validator.js is inlined into the build
// at a second SCENARIO_VALIDATOR_SOURCE marker, so the artifact legitimately
// grew. See tests/import-validation.test.js for the behavior that
// introduced.
//
// Changed again 2026-09-08 (audit task T01, AUD-004): added
// validateRawContainers() to scenario-validator.js and reviewRawScenarios()
// to importSettings(), so a malformed retirement.stages/expenses/
// otherIncomes or account futureChanges is refused before normalizedPlan()
// can silently erase it. See tests/audit-import.test.js.
//
// Changed again 2026-09-08 (audit task T02, AUD-001): taxWithdrawalGrossRate()'s
// taxable branch now uses the actual next-drained account's basis
// (nextWithdrawAccount(), newly registered in buildWorkerSource()'s worker
// function list) instead of a class-wide average, and scales Arizona's rate
// by the realized gains share instead of applying it to full proceeds.
// tests/fixtures/golden-scenarios.fixtures.json was regenerated to match --
// see that commit for the reviewed before/after diff. See
// tests/audit-tax-transactions.test.js.
//
// Changed again 2026-09-08 (audit task T04, AUD-002): the inline Social
// Security survivor computation is replaced by householdSocialSecurityForPeriod()
// (newly registered in buildWorkerSource()'s worker function list), which no
// longer zeroes a deceased spouse's benefit amount before the survivor
// Math.max() comparison runs. No golden fixture changed -- none of the five
// scenarios exercise survivor mode with a death inside the modeled horizon.
// See tests/audit-survivor.test.js.
//
// Changed again 2026-09-08 (audit task T05, AUD-003): new retainExcessRmdCash()
// (newly registered in buildWorkerSource()'s worker function list) deposits
// RMD proceeds beyond actual spending/tax/QCD need into an existing taxable
// account (or a newly synthesized one) instead of discarding them; growAccounts()
// gained a defensive `rates[i]===undefined` guard for an account appended
// mid-period. No golden fixture changed -- none of the five scenarios have
// an RMD that exceeds spending need. See tests/audit-rmd-cash.test.js.
//
// Changed again 2026-09-08 (audit task T06, AUD-005): contribution duration
// is now computed per account OWNER (selfContributionDuration /
// spouseContributionDuration), intersecting the shared contributionStop age
// with that owner's own remaining work duration, instead of one shared
// duration that ignored whether the owner had already retired. No new
// top-level function, so no buildWorkerSource() registration needed. No
// golden fixture changed -- none of the five scenarios set contributionStop
// later than retireAge. See tests/audit-contribution-window.test.js.
//
// Changed again 2026-09-08 (audit task T07, AUD-006): otherIncomeFor() now
// intersects a recurring income's start age with the current period instead
// of skipping the whole period whenever the income hadn't started as of the
// period's OPENING age -- a stream starting mid-period (e.g. at a half-year
// age inside an integer-age row) now activates prorated for its actual
// active duration instead of contributing $0. No new top-level function, so
// no buildWorkerSource() registration needed. No golden fixture changed --
// none of the five scenarios have an otherIncomes entry starting mid-period.
// See tests/audit-income-onset.test.js.
//
// Changed again 2026-09-08 (audit task T08, AUD-007): projectDebts()'s
// amortization loop now tallies retirement-period debt payments per MONTH
// against the actual retirement boundary within the period, instead of
// applying one blended fraction (paid*retiredShare) to the whole period's
// total -- a debt paid off entirely in the working months before a
// mid-period retirement no longer has part of those working-period payments
// misattributed to retirement. The flat housing-cost block is untouched
// (still uses the blended retiredShare, per the audit's own boundary). No
// new top-level function, so no buildWorkerSource() registration needed. No
// golden fixture changed -- none of the five scenarios have a debt paid off
// mid-period around a retirement boundary. See tests/audit-debt-timing.test.js.
//
// Changed again 2026-09-16 (S5 audit round R8, the owner's answer 5 (A)): the tracked file rebuilt from 628bd36's sources, the
// first rebuild since 2026-09-08, so all of S5 through the audit repair round reaches the shipped file. It was installed
// only after two builds of the tree agreed byte for byte; the fresh lane and the historical lane are now the same build.
// The previous pin, 73c81504166aaad2b9e49b1091c1d8e71694eda5a026ca69bc2903a0ad7995b0, describes the 2026-09-08 file that the handovers up to 2026-09-16
// cite.
//
// Changed again 2026-09-16 (S5 audit round R8, the round's final rebuild): R8 changed src/app-shell.html after the first
// rebuild (the Results page's Arizona card), so the tracked file was rebuilt from 330d649's sources, again installed only
// after two builds agreed. The pin before it, ba5bbaefc6ba69a988ba1fe35aa05c427e1bc790c2f77211840bf45566b9911e, described the first rebuild.
//
// Changed again 2026-09-16 (S5 R9c): R9a paid each owner's QCD from their own IRA (src/engine.js, src/app-shell.html)
// and R9b named S5R-05 in the engine's comments, so the tracked file was rebuilt from 64ae440's sources, again installed
// only after two builds agreed. The pin before it, 39e1221651b29eb823d04f9576f7a3b082315cffac0d0ec63b03fb09947b313f, described the round's final rebuild at a2ca2f0.
//
// Changed again 2026-09-16 (S5 R10c): R10a refused a malformed marginal-rate base and documented ltcRandom (src/engine.js),
// so the tracked file was rebuilt from 84a5451's sources, again installed only after two builds agreed. The pin before
// it, 7fe8ba4490e3660408debeddf71afc8746adae5f7ff0eae0841107dc8c4dc275, described R9's rebuild at 846b8f9.
//
// S5AA moved this pin three times without continuing the trail above; the second S5AA audit restores it. Each was
// installed only after two builds agreed:
//   e136b81 (task 7.5)          064f1d22dd5cb965a7aa475ef0f94243a28ff00a8026d70ade412d450f41a766, replacing R10c's
//                               3f927702313a47a6ea755acf7e7aceb53f604c8b2cbfb28e6548894c57e0b776 at 64f6b98.
//   54e395c (7.5 redone)        84ac2164b15c52456278842bac328c59a39d7716f15210063bb55289be6742bc, from the FINAL sources.
//   33dc5bf (self-audit)        aa613d238fe9c0fbb6ac41b9a9da4e556646df11e3a8f38e271996755fcb6a77, the post-death exclusion.
//
// Changed again 2026-09-21 (S5AA second audit): the post-death exclusion names only what a death actually carries on
// (src/engine.js), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it is
// 33dc5bf's, above.
//
// Changed again 2026-09-21 (S5AA second audit): F-02's filing disclosure is bounded by the last row that opens, not by
// the horizon's end (src/engine.js), so the tracked file was rebuilt, again installed only after two builds agreed.
// The pin before it, 95171f3f8d9398ed0df823667d028fda4d37e4ff2f5362bf623b6ecd4a78b651, described 1c9d3bb's rebuild.
//
// Changed again 2026-09-21 (S5AA follow-up, Q3): a deceased person's wages and contributions end at the death
// (src/engine.js), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// 4d80fb83a30af5c543124d63506f78abc7b4755d9d598749d98c53ae89b5064e, described b531d0a's rebuild.
//
// Changed again 2026-09-21 (S5AA follow-up, Q4): a deceased spouse's accounts pass to the survivor from the year after
// the death (src/engine.js), so the tracked file was rebuilt, again installed only after two builds agreed. The pin
// before it, a69aeab171d2022cb6d643d157d5088f7f4e343d742a4644ff9cde453120c03c, described 4e97830's rebuild.
//
// Changed again 2026-09-21 (S5AA third audit): Q3 completed -- one definition of each person's work duration, and
// employment and self-employment income streams end at their owner's death (src/engine.js, src/app-shell.html), so the
// tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// 49bd7152669962397eaa00493e16abe38675a75235c8e7347b245449842b9a43, described fd76c95's rebuild.
//
// Changed again 2026-09-21 (S5AA third audit): a lifespan that ended before the plan starts is disclosed
// (src/engine.js), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// db1140272b045ceea3a9e57ea5b148cea1d96faf2a0a3dcd726a6a01fd78d26c, described 7b99aed's rebuild.
//
// Changed again 2026-09-21 (S5AA third audit): what a deceased person holds includes accounts they fund during the
// plan (src/engine.js), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before
// it, fc10eef252fb2482ac48016faa8e54b10a7b79bd8d668954b80b491544da584c, described c782dee's rebuild.
//
// Changed again 2026-09-21 (S5AA, the owner's decision to disclose the pension): PENSION_AFTER_DEATH_ASSUMED
// (src/engine.js), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// 8c1baf661c12f44da399231269c3f15cc7d3cb03032f05a50b815c620a3e4c26, described a7cc27d's rebuild.
//
// Changed again 2026-09-21 (S5AA R6 external audit: EA-01, a row with nobody alive is outside the supported domain;
// EA-02, Medicare costs count the living only (src/engine.js)), so the tracked file was rebuilt, again installed only
// after two builds agreed. The pin before it, 8a36c6a2ba21dac81cb8a52d61ca71f4aaeb197346a92eb14f95a321774da79c,
// described 5c985c0's rebuild.
//
// Changed again 2026-09-21 (S5AA R6 external audit: EA-01 prose, a household of one reads as a sentence
// (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// 3dcfb7102b65710afee2cf8f0334aceec2b35cb67615d3597312d4c458943c97, described e69b167's rebuild.
//
// Changed again 2026-09-21 (S5AA R6 external audit: EA-03, Roth IRA phase-out follows the row's filing status
// (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// 54d11cdd49fd588c773be198668f352279d701aec6ca2e697aa69f208780b443, described d53d2c5's rebuild.
//
// Changed again 2026-09-21 (S5AA R6 external audit: EA-04 and EA-05, one per-owner basis primitive for every pre-tax
// distribution (src/engine.js, src/app-shell.html)), so the tracked file was rebuilt, again installed only after two
// builds agreed. The pin before it, c5ba06c2b2a0a97b51f6052221a6b2bba5a1f14ac84335a1534114a33954c361, described
// 9770c62's rebuild.
//
// Changed again 2026-09-21 (S5AA R6 external audit: EA-07, the succession of each account that passes to a surviving
// spouse is disclosed by authority or assumption (src/engine.js)), so the tracked file was rebuilt, again installed
// only after two builds agreed. The pin before it, 6a60e0154b5290c1d252de37e6ea0404ac787ccbb2c82679c2df230816a1446e,
// described 698f407's rebuild.
//
// Changed again 2026-09-21 (S5AA R6 external audit: EA-07, an account of an unlisted type is classed by its tax class
// (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// 1fa33295f1c7f05be0bcced80c4595c2ff8192ed09cca95de1c10e25ff40825a, described c8a1a9b's rebuild.
//
// Changed again 2026-09-21 (S5AA fourth internal audit: A4-1, a spouse who died before the plan starts is in the
// succession disclosure (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds
// agreed. The pin before it, 89fe860b74734602537b81aee6f690a54457b940ef80ad710d0a4a2bf74364ed, described 5e9f57e's
// rebuild.
//
// Changed again 2026-09-21 (S5AA fourth internal audit: A4-4, F-02's disclosure no longer says the Roth limit uses
// the entered status (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed.
// The pin before it, 2703fa911125d0f37d3bae249720f6f35ecd7573d6fb5355f378852cb59506d6, described 60e3c41's rebuild.
//
// Changed again 2026-09-21 (S5AA fourth internal audit: A4-5, a stale comment on the end-of-row basis block
// (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// a956e1702f959afb07745b9dac173651bbaac5e571c0ce757984ac430093c6b2, described b0a930e's rebuild.
//
// Changed again 2026-09-21 (S5AA R7 re-audit: R7-02 and R7-03 with A4-6, the death disclosures are raised from
// executed state inside simulatePlan (src/engine.js, src/app-shell.html)), so the tracked file was rebuilt, again
// installed only after two builds agreed. The pin before it,
// 7b4e79759f80e890506e38cfae6ddbf427ea6a4adeea02dff9ef62d90cf9cecb, described c925a98's rebuild.
//
// Changed again 2026-09-21 (S5AA R7 re-audit: R7-01, F-02's disclosure describes the HSA family limit as the coverage
// question it is (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The
// pin before it, db360f15bb9de73d4a1f421f6f6e078dd4d928f91705faa47e8d09d8b4b8e9c4, described 0e2baa1's rebuild.
//
// Changed again 2026-09-21 (S5AA R9 round: DeepSeek finding 2d/02, an employment or self-employment stream with no
// end age ends at its owner's death (src/engine.js)), so the tracked file was rebuilt, again installed only after two
// builds agreed. The pin before it, 867d8ff77d836818dc2a665c2b2dd7956ea28ac70097a8cfbb23f07666bd006f, described the
// previous rebuild.
//
// Changed again 2026-09-21 (S5AA R9 round: the owner's decision Q3, a QCD is paid from 70 1/2 whether or not an RMD is due
// (src/engine.js, src/app-shell.html)), so the tracked file was rebuilt, again installed only after two builds
// agreed. The pin before it, 78601906d4cce92ba6f38f5aa52a9c0b4f03de2513214dbbb4c5833aa8475ad7, described the previous
// rebuild.
//
// Changed again 2026-09-21 (S5AA R9 round: the owner's decision Q4, the dividends-on half (known item 5.2), the entered
// yield is taxed every year (src/engine.js, src/app-shell.html)), so the tracked file was rebuilt, again installed
// only after two builds agreed. The pin before it, e85a4def56d3f814f8f2a9c349a93f71b2358d4e842c04c5800dceb09f8555ef,
// described the previous rebuild.
//
// Changed again 2026-09-21 (S5AA R9 round: the owner's decision Q5, one-time income can be tax-free, type oneTimeTaxFree
// (src/engine.js, src/app-shell.html, src/scenario-validator.js)), so the tracked file was rebuilt, again installed
// only after two builds agreed. The pin before it, 01477c8a349398ebd9769102f6d29e05ba85950d5b4db17e0c7a2bbb4ada102b,
// described the previous rebuild.
//
// Changed again 2026-09-21 (S5AA R9 round: the owner's decision 10, a traditional IRA converts only into a Roth IRA, with
// CONVERSION_IRA_NEEDS_ROTH_IRA (src/engine.js)), so the tracked file was rebuilt, again installed only after two
// builds agreed. The pin before it, b549421ee265577acefde4b4dc08450238b51d2a355adadcf67a9895d2410bdf, described the
// previous rebuild.
//
// Changed again 2026-09-21 (S5AA R9 round: the owner's decision 4, the 10% additional tax is not charged on IRA basis
// (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// 653f198d8ba842867e4165c72da1558a53ccb824d73544985057289cc205140c, described the previous rebuild.
//
// Changed again 2026-09-21 (S5AA R9 round: the owner's decision 12, the validator restricts account owners by type,
// INVALID_ACCOUNT_OWNER (src/scenario-validator.js)), so the tracked file was rebuilt, again installed only after two
// builds agreed. The pin before it, 6eb9afd1388a3c1b1e5b57d144019726fe698fb97a5619d40b2ad40a57a08af1, described the
// previous rebuild.
//
// Changed again 2026-09-21 (S5AA R9 round: the owner's decision 7, the survivor spending reduction reads
// householdSurvivorship() (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds
// agreed. The pin before it, 80dbb31ee26205651997d7f26d4eb07969c4f91b8d81e5e1c072f84f49be9439, described the previous
// rebuild.
//
// Changed again 2026-09-21 (S5AA R9 round: the owner's decision 6, health costs are chosen per living person
// (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// e8de543b5c9ba898ad6a95880d8bfb39f606b8e7ec4889bd5136203440106a44, described the previous rebuild.
//
// Changed again 2026-09-21 (S5AA R9 round: the owner's decision 8, the projection stops at the last death,
// PROJECTION_ENDS_AT_LAST_DEATH (src/engine.js)), so the tracked file was rebuilt, again installed only after two
// builds agreed. The pin before it, 48d87c9f4086fb14e0641c5a39133a48c3fb8f507375db4c94e5f77ea9c1e466, described the
// previous rebuild.
//
// Changed again 2026-09-21 (S5AA R9 round: DeepSeek finding 2e/02, an unknown projection method is refused,
// SCENARIO_UNKNOWN_METHOD (src/engine.js, src/app-shell.html)), so the tracked file was rebuilt, again installed only
// after two builds agreed. The pin before it, 4f5182f7f64e77fb9a02f6be6012493f770180776c49a86c75cf9a56a69b9a93,
// described the previous rebuild.
//
// Changed again 2026-09-21 (S5AA R9 round: DeepSeek finding 2f/01, the validator type-checks the dividend fields
// (src/scenario-validator.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The
// pin before it, dacb335a742da77e218704f303d35bf161704729c90f042b8ea4b38021d464d2, described the previous rebuild.
//
// Changed again 2026-09-21 (S5AA R9 round: DeepSeek finding 2i/01, the Worker script opens with the use-strict
// directive (src/app-shell.html)), so the tracked file was rebuilt, again installed only after two builds agreed. The
// pin before it, 0565cc5aced96ac3427647f291d6c8067bce03c054b190564c5153e6aedaede9, described the previous rebuild.
//
// Changed again 2026-09-21 (S5AA R9 round: DeepSeek findings 2g/01 and 2g/04, a whitespace-only term and a negative
// ARM ceiling are refused (src/debt-amortization.js, src/debt-arm.js)), so the tracked file was rebuilt, again
// installed only after two builds agreed. The pin before it,
// 227d7c5e533108a99b931e6bda7ebfd5e5be5e05234218fdb6c0e990e8015cd1, described the previous rebuild.
//
// Changed again 2026-09-21 (S5AA R9 round: record corrections, DeepSeek findings 2g/02, 2g/03, 2j/03, 4d/02 and the
// owner comment decision 12 made stale (src/engine.js, src/app-shell.html, src/debt-recast.js,
// src/debt-revolving.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin
// before it, 4a5b5222da55b67e941cf70d18de77a8d01291ddcbb28354a9586c2b31a9a0bd, described the previous rebuild.
//
// Changed again 2026-09-21 (S5AA fifth internal audit, finding 2: a pre-tax to Roth transfer obeys the conversion
// rule, lawfulConversionDestination() (src/engine.js, src/app-shell.html)), so the tracked file was rebuilt, again
// installed only after two builds agreed. The pin before it,
// 76f0b51697a82466f126aaec5c3c7a2a2f1f0bfc952cf8ee409aa5ba46ef0edb, described the previous rebuild.
//
// Changed again 2026-09-21 (a plan with nobody alive at the start is refused), so the tracked file was rebuilt, again
// installed only after two builds agreed. The pin before it,
// d491d4108b29deb831dd563acda0f3f308f6cac8ba443015eb725f64a9312ccc, described the previous rebuild.
//
// Changed again 2026-09-21 (VPW and the RMD-style strategy pace to the last modelled death), so the tracked file was
// rebuilt, again installed only after two builds agreed. The pin before it,
// 0f8a387084c3da4454fdd66d7538fb41ed942f07acd5d5263c40b48f704cae2c, described the previous rebuild.
//
// Changed again 2026-09-21 (VPW and the RMD-style strategy pace to the last modelled death), so the tracked file was
// rebuilt, again installed only after two builds agreed. The pin before it,
// f0fae99cb5944ccd4dd3dfa5c3767fcca0a0d9a7f921d0cb0809756f1f8ace95, described the previous rebuild.
//
// Changed again 2026-09-21 (R10-01: remaining-life strategies count the years they model), so the tracked file was
// rebuilt, again installed only after two builds agreed. The pin before it,
// d4ebd8e27d71bdec7de636af2346138a62572619b9f0ca0cd62506f49169c6d2, described the previous rebuild.
//
// Changed again 2026-09-21 (R10-01 re-pin), so the tracked file was rebuilt, again installed only after two builds
// agreed. The pin before it, b1241b10c776c80989ff2509da9b35086bfe870639d8f6c8affb9faf13e637e5, described the previous
// rebuild.
//
// Changed again 2026-09-21 (R10-07: disclosures read what the projection did), so the tracked file was rebuilt, again
// installed only after two builds agreed. The pin before it,
// ee102eef76a10728bb907a0049ed8e3c69e8fd7ce7f1b3c85192e863ba1093b9, described the previous rebuild.
//
// Changed again 2026-09-21 (R10-02: conversion capacity per obligation), so the tracked file was rebuilt, again
// installed only after two builds agreed. The pin before it,
// 7f19bec7273d0e91b2f083c1a88eaf814926bc082e9aa6a7358bfaaf43dc7adc, described the previous rebuild.
//
// Changed again 2026-09-21 (R11-03: pension warning needs a survivor), so the tracked file was rebuilt, again
// installed only after two builds agreed. The pin before it,
// 40f20d1bf7b9a486481f5ee10f47ac7afa2af131cea8a2eb5ec7b823721909f0, described the previous rebuild.
//
// Changed again 2026-09-21 (R11-02: contract version 4), so the tracked file was rebuilt, again installed only after
// two builds agreed. The pin before it, 005772283cce0d5e44a93574d37b9977842be1f8a863c32700f13336f7e812c4, described
// the previous rebuild.
//
// Changed again 2026-09-21 (R11-01: drawn RMD reserve held out of the row's return), so the tracked file was rebuilt,
// again installed only after two builds agreed. The pin before it,
// 299e7569a95589c8782b8f22f2a1d65a913eb85786c7976edce5496d0026a364, described the previous rebuild.
//
// Changed again 2026-09-21 (R12-01: RMD protection follows the payment order), so the tracked file was rebuilt, again
// installed only after two builds agreed. The pin before it,
// 3871d65a90196f4126e12dcda2d8aec49b312d84b97e625f1d378cba72fad9fc, described the previous rebuild.
//
// Changed again 2026-09-22 (R13-01: account-id maps have no prototype), so the tracked file was rebuilt, again
// installed only after two builds agreed. The pin before it,
// 2bb5fd0ee73ead5f64f2143d29d19d5a4b5709a8107a03fba5ddb7b30efaf392, described the previous rebuild.
//
// Changed again 2026-09-22 (R14-01: a distribution to taxable counts toward the RMD), so the tracked file was
// rebuilt, again installed only after two builds agreed. The pin before it,
// d2ece00e3a53807001d4bb9c3d35372cbe2d407bda502555687e57b14fc8906d, described the previous rebuild.
//
// Changed again 2026-09-22 (R15-01: a partial transfer to taxable makes no reservation promise), so the tracked file
// was rebuilt, again installed only after two builds agreed. The pin before it,
// 65d2b8fc0e207714336490dabb03cbaeb2bffab053881a1b0649964d7ceaa2f9, described the previous rebuild.
//
// Changed again 2026-09-22 (Q1-B: an RMD shortfall is an error only in the obligation that was promised (R16-01)), so
// the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// 5c742f5949459ae6e82621e5a3e34c85eaa6918ae4379c43c70ee590bed8c5b4, described the previous rebuild.
//
// Changed again 2026-09-22 (Q1-C: the app shows RMD due, paid and unmet), so the tracked file was rebuilt, again
// installed only after two builds agreed. The pin before it,
// e3e54b1b9792aadf474cfcc3ac5d9f52c448be4fc65afe7de1a3d4c852c074a1, described the previous rebuild.
//
// Changed again 2026-09-22 (R17-01: RMD paid is what satisfied the requirement), so the tracked file was rebuilt,
// again installed only after two builds agreed. The pin before it,
// f015616cf531770d5bbaae6cbea0215a7d5785a543faa84c10af2d230e165218, described the previous rebuild.
//
// Changed again 2026-09-22 (workstream B: taxable basis in dollars, capital losses (R10-06, B1, B2)), so the tracked
// file was rebuilt, again installed only after two builds agreed. The pin before it,
// 561ef446c16bf5000cc3a1c4980522b597805d30759c35a86b0745a28a261aef, described the previous rebuild.
//
// Changed again 2026-09-22 (workstream B: taxable basis in dollars, capital losses, per-account dividends (R10-06)),
// so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// 7b2354acf9a6517170124fecdf85b1d6d4da95059902e99c035441e9668e7fdf, described the previous rebuild.
//
// Changed again 2026-09-23 (S5AA R18 self-audit: the dead dividend helpers retired, payOwnDividends() extracted
// (src/engine.js, src/app-shell.html)), so the tracked file was rebuilt, again installed only after two builds
// agreed. The pin before it, 29c2c86c9393480c2e19c7385b5f73eaf222c82d18a42d029e000a796318923e, described the previous
// rebuild.
//
// Changed again 2026-09-23 (S5AA R18 self-audit SA18-01: the carryover a year uses is capped by taxable income
// (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// 8d9d16c3fd431d2b82b994403cd206b50509d7e45e2b94bb199e8da2243276f1, described the previous rebuild.
//
// Changed again 2026-09-23 (S5AA R18 self-audit SA18-02: a decedent's capital loss carry is not the survivor's
// (src/engine.js, src/app-shell.html)), so the tracked file was rebuilt, again installed only after two builds
// agreed. The pin before it, af5f131cf2db14b285782d10f0b7fd39c96dfee9008aa3a5de5ab1904444f7ca, described the previous
// rebuild.
//
// Changed again 2026-09-23 (S5AA R19: R18-01, a capital loss is deducted whatever the other income and lowers taxable
// Social Security (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed.
// The pin before it, c77c65921c882d3d53d5b43ed26d1afa29ca7fceafedab7e9c7c3d765fabe4e7, described the previous
// rebuild.
//
// Changed again 2026-09-23 (S5AA R19: workstream A -- the annual per-owner IRA settlement and the tax-liability
// ledger, result-contract version 5 (src/engine.js, src/app-shell.html)), so the tracked file was rebuilt, again
// installed only after two builds agreed. The pin before it,
// 2ab2bad00d4dfa8a730b4c36f5b8ea8d294cc999523bb70caab983afab43fd80, described the previous rebuild.
//
// Changed again 2026-09-23 (S5AA R19: the app states a final-year tax balance and the CSV carries the tax ledger
// (src/app-shell.html)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin
// before it, 1018b0f21592cc364df69075aeefe912a39b49af229fb68bb15448ca9e32d3f5, described the previous rebuild.
//
// Changed again 2026-09-23 (S5AA R19: the owner's decision dates written in local time, 2026-09-23 (src/engine.js
// comments)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// c9fd4ed902e239a1b5c0e8eeb3ac3e22e3be436aacc5fdf204127bcd0a70222b, described the previous rebuild.
//
// Changed again 2026-09-23 (S5AA R20: R18F-02, the early-distribution tax and the Rule of 55 read the account owner's
// age; hsaAccountOwnerAge renamed accountOwnerAge (src/engine.js, src/app-shell.html)), so the tracked file was
// rebuilt, again installed only after two builds agreed. The pin before it,
// 189abb2a4b4f8a8a814612a669ac4aaf4566b189954d4af89318edd8ca7b1287, described the previous rebuild.
//
// Changed again 2026-09-23 (S5AA R20: R18F-03, the optimized order's early-tax weight is the share of the pre-tax
// balance the draw's own rule taxes (src/engine.js)), so the tracked file was rebuilt, again installed only after two
// builds agreed. The pin before it, cc3a51dcae2e6b56d522d4e6be8d982b82c35073dc8fe8e25e62aa468de11ac8, described the
// previous rebuild.
//
// Changed again 2026-09-23 (S5AA R20: R18F-01, a glide path's return and risk come from one allocation
// (accountGlideWeights); an all-stock account glides into bonds (src/engine.js, src/app-shell.html)), so the tracked
// file was rebuilt, again installed only after two builds agreed. The pin before it,
// 0e231614c3c6049892afb6819cfb8a50785cc58f8b8b70d1cb1b75bcdfde45ef, described the previous rebuild.
//
// Changed again 2026-09-23 (S5AA R21: R20-01, an allocation key for an undefined asset class is rejected
// (src/scenario-validator.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The
// pin before it, bfc9a0b11819d18b7c95c1733293d1413b19ba7dd059a7127551a89dd4c58c1b, described the previous rebuild.
//
// Changed again 2026-09-24 (S5AA R23: R22-01, the Roth exclusion follows an actual draw by the owner's age
// (src/engine.js, src/app-shell.html)), so the tracked file was rebuilt, again installed only after two builds
// agreed. The pin before it, 8690f6f0fe1c3b976948b9cc5bac62d74bea8056bcf29cdac82878cd26a0db37, described the previous
// rebuild.
//
// Changed again 2026-09-24 (S5AA R23: R22-02's leftover, the Rules page no longer says option-on dividends go untaxed
// before retirement (src/app-shell.html)), so the tracked file was rebuilt, again installed only after two builds
// agreed. The pin before it, 922c7cbc297b5a2d230ad02936cbe4c241d26827b6df901c76de47fafaa374dd, described the previous
// rebuild.
//
// Changed again 2026-09-24 (S5AA R24: R23-01, a scheduled transfer is judged at its own age (src/engine.js)), so the
// tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// ea76169af772c84d2614a180e74dd383f4ab964bcb707a2feedafd445d0639c9, described the previous rebuild.
//
// Changed again 2026-09-25 (S5AA R25: R24F-04, the engine refuses a non-number plan value (src/engine.js,
// src/app-shell.html)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before
// it, 34e09205b948e947da8e6b2105fa1642d23e2b7c76e462a85be93e40c3708db6, described the previous rebuild.
//
// Changed again 2026-09-25 (S5AA R25: R24F-03, a debt is paid off in its payoff month (src/engine.js)), so the
// tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// 93a452e12dca91f0ce8862d11e747777b061e8db779d40f3ed35150462952667, described the previous rebuild.
//
// Changed again 2026-09-25 (S5AA R25: R24F-01, a spending stage is prorated across a year it splits (src/engine.js,
// src/app-shell.html)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before
// it, f26be33015a7b859c386c35071718886a119d7e32885eb8089b78e12dceaf950, described the previous rebuild.
//
// Changed again 2026-09-25 (S5AA R25: R24F-02, a mid-year transfer's dollars grow in the source until its date
// (src/engine.js, src/app-shell.html)), so the tracked file was rebuilt, again installed only after two builds
// agreed. The pin before it, 09ea5acb8c38270885ab57bae70342be41a072920e65d4bec980a4b3bf388829, described the previous
// rebuild.
//
// Changed again 2026-09-26 (S5AA R26: IRA contributions are capped at taxable compensation (src/engine.js,
// src/app-shell.html)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before
// it, 995d63a202c48df8df58e39747696a17620176f8297766b235b28419332c1f08, described the previous rebuild.
//
// Changed again 2026-09-26 (S5AA R26: the tax quote and the committed tax read an IRA deduction with one rule
// (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// e0ebe60f62e0dbdabcb4e72ac65818d6206b3e046092cc81788276cecb00c005, described the previous rebuild.
//
// Changed again 2026-09-26 (S5AA R27: R25-01, a mid-year transfer moves at most what its source holds on the date
// (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// e2a88a07bd5c8ce888fa0a7a3c724a40283523d7ffde8751e781c81bbb7a0867, described the previous rebuild.
//
// Changed again 2026-09-26 (S5AA R27: R25-02, mortgage PMI is charged only while the mortgage has a balance
// (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// 1eff7f9df5e796c461a92973f59ce8513e0a630a99d179632f45047c0fefa3c4, described the previous rebuild.
//
// Changed again 2026-09-26 (S5AA R27: R25-01, a transfer's source drawn by the year's withdrawals ends at zero
// (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// 120ee8139abf9f4217d8c462761c0d80448c5f8bb76077d8df60a89aca24e57f, described the previous rebuild.
//
// Changed again 2026-09-26 (S5AA R28: R26-01, the IRA compensation limit is applied once, to what is credited in the
// year (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin
// before it, a36db1cb91872513612e10fe7bc70ebd6cefef3e6b68584aa0af1306ba2ce4de, described the previous rebuild.
//
// Changed again 2026-09-26 (S5AA R28: R27-01, a mid-year transfer's transaction runs at the source's value on its
// date (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin
// before it, 159fdd3a9fbce90e2ea03b0e1d3a01e635c9980eab2ca7aa1603f1a06d0499c5, described the previous rebuild.
//
// Changed again 2026-09-26 (S5AA R28.1: R27F-01, a transfer's destination is credited on the transfer date
// (src/engine.js, src/app-shell.html)), so the tracked file was rebuilt, again installed only after two builds
// agreed. The pin before it, 32a23de5e2d5996834fc5d11fa959aa3a901a4c455979c812b086f4b0abb80f6, described the previous
// rebuild.
//
// Changed again 2026-09-26 (S5AA R28.1: R27F-02, dividends on a transfer's dollars go to whichever account held them
// (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// 222f3eef663c34cb1bc074757a18461064b814bdf376bec626b179c7efd3465c, described the previous rebuild.
//
// Changed again 2026-09-26 (S5AA R28.1: a transfer dated after the year's draw runs after it (src/engine.js)), so the
// tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// 0ac16f99214ad38688f2192b0dbefe182f66086382d6245b88c6ea934ca6a1ba, described the previous rebuild.
//
// Changed again 2026-09-26 (S5AA R28.1: the imputed 1.5% yield on a transfer's dollars goes to whichever account held
// them (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin
// before it, 98c791081c3249c42e6d948ba2e9de872ac367ddaa59c0ec0f749229d0f96965, described the previous rebuild.
//
// Changed again 2026-09-28 (public copy: the name replaced with the owner in comments (src/engine.js,
// src/app-shell.html)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before
// it, 38721279b64e41171840a8c0bb4b7c64c70076f8605a516a4f8c367dd81b48d5, described the previous rebuild.
//
// Changed again 2026-09-28 (public copy: the app's default age is 30 (src/app-shell.html)), so the tracked file was
// rebuilt, again installed only after two builds agreed. The pin before it,
// 31f73d941edcc3a87f823bf85171f04a4adf52da593560a0be142dd267176980, described the previous rebuild.
//
// Changed again 2026-09-28 (public copy: "the owner" lower-cased mid-sentence (src/engine.js comments)), so the
// tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// 82b68329658572e747b92e5aa25a8ac6b5ea0b8b12faaba4f1e2743fdb387c02, described the previous rebuild.
//
// Changed again 2026-09-28 (S5AA R29 PCF-03: the held-dollar maps have no prototype (src/engine.js)), so the tracked
// file was rebuilt, again installed only after two builds agreed. The pin before it,
// 3b4a98ac7e1bd40acd0aaaa3ec4b9550b0225562cbc91bca86a1876c2f5d5fee, described the previous rebuild.
//
// Changed again 2026-09-28 (S5AA R29: the rules page writes rule data as text; renderRulesLegacy() removed
// (src/app-shell.html)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin
// before it, 76009e63b0103555f6dbadf3ba8ceb8ca143841bf260c9055e2f4698f875f36e, described the previous rebuild.
//
// Changed again 2026-09-28 (S5AA R29: a transfer into a 401(k) from a different kind of account is refused
// (src/engine.js, src/scenario-validator.js)), so the tracked file was rebuilt, again installed only after two builds
// agreed. The pin before it, 50067f84fcae9e8c120824fb6e09f92bffb14cf04bc57a68e63313185f9f39a6, described the previous
// rebuild.
//
// Changed again 2026-09-28 (S5AA R29 PCF-01: a transfer out of an HSA is an HSA distribution (src/engine.js)), so the
// tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// a193154815d971d279ea01d986fcc38b18c32c08d55ef7b3edbd0ebfe7b56c2a, described the previous rebuild.
//
// Changed again 2026-09-28 (S5AA R29 PCF-02: a transfer into an IRA or HSA from a different kind of account is a
// contribution (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The
// pin before it, ea34cac017df762ee5bc1d2594f0415c3f4078f188e69c34c9e328f4d52f178c, described the previous rebuild.
//
// Changed again 2026-09-28 (S5AA R29: a traditional IRA to its owner's HSA is a qualified HSA funding distribution
// (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// 685372c5d401ae3d574402596bf9c54b05ddad7d000c6be5f5c4ec3ebdb0351f, described the previous rebuild.
//
// Changed again 2026-09-28 (S5AA R29: money leaving a taxable account for a non-taxable one realises its gain
// (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// a0386ba9dcbba5450610984c56054423e154f4adb9182249953d18fc96bae4a4, described the previous rebuild.
//
// Changed again 2026-09-28 (S5AA R29 self-audit: a transfer's limit warning reports what moved (src/engine.js)), so
// the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// ff201637ca5ff66122f28a34e5a172072c886fee27c2632d16b159a03628d96d, described the previous rebuild.
//
// Changed again 2026-09-28 (S5AA R29: the rules-page source link's href is stripped of HTML metacharacters
// (src/app-shell.html)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin
// before it, 3d4fe0d4d8883fe98386acae39dc04547195f1431c1c00951509f9b2fb8f66b8, described the previous rebuild.
//
// Changed again 2026-09-28 (S5AA R30: a pre-tax transfer into an HSA counts toward the year's required distribution
// (src/engine.js)), so the tracked file was rebuilt, again installed only after two builds agreed. The pin before it,
// 9998e82df49b106f78028b68fd05cac674fa8c0e011e33d10c36b6c61e77818d, described the previous rebuild.
const EXPECTED_SHA256 = 'c1ddf0e0a9e43084eb48d74e8e95a1fff39237a1d8ae648ecedc478dca3e483e';

function verifyArtifactHash() {
  const crypto = require('node:crypto');
  /* The HISTORICAL lane: this pins the tracked file and nothing else. */
  const actual = crypto.createHash('sha256').update(historicalArtifactHtml(), 'utf8').digest('hex');
  if (actual !== EXPECTED_SHA256) {
    throw new Error(
      `investment-calculator-v2c.html hash changed (expected ${EXPECTED_SHA256}, got ${actual}). ` +
      'This suite was written against a specific verified artifact -- re-verify against the ' +
      'handover before trusting these tests against a changed file.'
    );
  }
}

/**
 * Loads a fresh instance of the calculator into a new JSDOM window and waits
 * for its init() to finish running. Each call is fully isolated (its own
 * window, its own localStorage) so tests never leak state into each other.
 */
async function loadCalculator({ localStorageSeed, testHooks, artifact = 'fresh' } = {}) {
  // runScripts: "dangerously" executes every <script> synchronously as the
  // parser reaches it, during the JSDOM constructor itself -- which means
  // init()/load() would run and read localStorage BEFORE this function ever
  // gets a chance to seed it. Use "outside-only" instead: the document (and
  // its scripts) parse normally, but nothing executes until we explicitly
  // eval it below, after localStorage is seeded.
  const dom = new JSDOM(artifactFor(artifact), {
    runScripts: 'outside-only',
    resources: undefined,
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  const { window } = dom;

  if (localStorageSeed) {
    for (const [key, value] of Object.entries(localStorageSeed)) {
      window.localStorage.setItem(key, value);
    }
  }

  // Opts into the app's own __V2C_TEST__ escape hatch, which stashes the
  // generated Web Worker source on the root element. Must be set before the
  // script evaluates, since init() reads it during startup.
  if (testHooks) window.__V2C_TEST__ = true;

  /* Keyed to the app's own root id, as tests/lib/worker-source.js is. "The
     first non-JSON script" selects the PWA bootstrap in a current build. */
  const mainScript = Array.from(window.document.querySelectorAll('script')).find(
    (el) => el.getAttribute('type') !== 'application/json' && el.textContent.includes('investment-calculator-v2c')
  );
  if (!mainScript) throw new Error('loadCalculator: could not find the main inline <script>');
  window.eval(mainScript.textContent);

  // init() itself runs synchronously inside that eval, but yield a macrotask
  // so any setTimeout(0)-queued work it kicked off gets a chance to flush.
  await tick(window);

  return dom;
}

/** Advances real timers inside a jsdom window by waiting `ms` in the Node event loop. */
function tick(window, ms = 0) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Waits until `predicate()` returns truthy, or throws after `timeoutMs`. */
async function waitFor(predicate, { timeoutMs = 2000, intervalMs = 20, window } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await tick(window, intervalMs);
  }
  throw new Error('waitFor: condition not met within ' + timeoutMs + 'ms');
}

function fireEvent(el, type) {
  const window = el.ownerDocument.defaultView;
  el.dispatchEvent(new window.Event(type, { bubbles: true }));
}

/** Sets a form control's value the way a real user interaction would, firing input+change. */
function setValue(el, value) {
  el.value = String(value);
  fireEvent(el, 'input');
  fireEvent(el, 'change');
}

function click(el) {
  const window = el.ownerDocument.defaultView;
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

/** Runs the guided setup flow with sane defaults, optionally overriding fields by id. */
function completeGuidedSetup(document, overrides = {}) {
  const root = document.getElementById('investment-calculator-v2c');
  for (const [id, value] of Object.entries(overrides)) {
    const el = root.querySelector('#' + id);
    if (!el) throw new Error('completeGuidedSetup: unknown field id ' + id);
    if (el.type === 'checkbox') el.checked = !!value;
    else setValue(el, value);
  }
  const createButton = root.querySelector('#v2-create-plan');
  click(createButton);
}

/** Navigates to a page via the same nav buttons a user would click. */
function goToPage(document, page) {
  const root = document.getElementById('investment-calculator-v2c');
  const button = root.querySelector('[data-page="' + page + '"]');
  if (!button) throw new Error('goToPage: no nav button for page ' + page);
  click(button);
}

module.exports = {
  CALCULATOR_PATH,
  /* The historical artifact, read on first access -- never by the fresh lane. */
  get CALCULATOR_HTML() { return historicalArtifactHtml(); },
  EXPECTED_SHA256,
  freshBuildHtml,
  artifactFor,
  verifyArtifactHash,
  loadCalculator,
  tick,
  waitFor,
  fireEvent,
  setValue,
  click,
  completeGuidedSetup,
  goToPage,
};
