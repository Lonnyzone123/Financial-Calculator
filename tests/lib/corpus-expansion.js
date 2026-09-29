'use strict';

/*
 * S4 task 4 -- the corpus EXPANSION: scenarios ADDED to the control corpus
 * under new names, never replacing one.
 *
 * WHY A SEPARATE MODULE. S4 task 4.7 fixed the corpus S4 started from as the
 * control (tools/control-corpus.json): 5 golden, seeds 1-20, 11 targeted,
 * corpus-input hash 673495ef.... Everything task 4 adds -- coverage for
 * drawFromOtherAssets() (Q35), the separately versioned ordinary and
 * adversarial debt sets (Q54), a Monte Carlo scenario in the sensitive band
 * (4.5) -- is declared here instead, so that:
 *
 *   - THE CONTROL CANNOT MOVE. tools/capture-baseline.js builds the control
 *     composition without loading this file at all, and a test proves it by
 *     making this file unloadable.
 *   - EVERY ADDITION HAS A NEW NAME, so a comparison against the control
 *     reports it as an EXPANSION, never as an incompatibility (compareInputs).
 *   - THE PLANS ARE BUILT OUTSIDE THE CAPTURE TOOL, so the independent corpus
 *     invariant (tools/corpus-invariant.js) can rebuild and round-trip them
 *     itself -- which it cannot do for the control's targeted fixtures.
 *
 * RULES FOR A MEMBER, each held by tests/corpus-composition.test.js:
 *   - its name starts with "expansion:", is new, and is listed through
 *     EXPANSION_FAMILIES -- completeness is checked against these NAMES;
 *   - it is deterministic: the same plan on every call, no clock, no entropy;
 *   - its family states what it covers, and each member is MEASURED to reach
 *     it. Q35's lesson, relearned twice while writing task 4: a scenario can
 *     look like coverage and never enter the branch;
 *   - it is JSON-faithful and validates with no ERROR.
 *
 * WHICH COMPOSITION BECOMES THE DEFINITIVE CORPUS S5b task 4.6 freezes is not
 * decided here. That is recorded for df/the owner.
 */

const DebtAmortization = require('../../src/debt-amortization.js');
const debtClasses = require('./debt-classes.js');
const golden = require('./golden-scenario-defs.js');

/* The household every other-asset member starts from: retired, a portfolio
   too small for its spending, and an asset it may draw on. fixedNominal ON
   PURPOSE: fixedReal sizes withdrawals from withdrawalRate rather than from
   spending, and the same household on fixedReal never ran short and never drew
   -- measured 2026-09-13, the Q35 trap relearned while writing this. */
function otherAssetHousehold(plan, over) {
  const o = over || {};
  plan.setupComplete = true;
  Object.assign(plan.profile, { age: 60, retireAge: 60, endAge: 75, spouseOn: false });
  Object.assign(plan.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(plan.assumptions, { method: 'simple', returnRate: 5, inflation: 2 }, o.assumptions || {});
  Object.assign(plan.retirement, {
    strategy: 'fixedNominal', spending: 70000, ssBenefit: 1500, ssClaim: 67, selfLife: 75, homeEquityFallback: true,
  });
  plan.advanced.networthOn = true;
  plan.advanced.debts = [];
  plan.accounts = [Object.assign({
    id: 'brokerage', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 60000,
    contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }, o.account || {})];
  /* EVERY gate open together (S4 4.2): homeEquityFallback above, and on each
     asset available, an availableAge the horizon reaches, and a positive
     accessPct. Any one left closed keeps drawFromOtherAssets() unreachable. */
  plan.advanced.otherAssets = (o.assets || [{}]).map((a, i) => Object.assign({
    id: 'asset-' + (i + 1), type: 'primaryResidence', name: 'Home', owner: 'household', value: 400000, growth: 0,
    liquidity: 'liquid', available: true, availableAge: 60, accessPct: 80,
  }, a));
  return plan;
}

/* One debt, a household comfortably able to carry it, and nothing else moving
   -- so a row's debt columns are that debt's, and the closed form in
   tests/lib/debt-classes.js can be checked against them. */
function debtHousehold(plan, debt) {
  plan.setupComplete = true;
  Object.assign(plan.profile, { age: 60, retireAge: 60, endAge: 80, spouseOn: false });
  Object.assign(plan.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(plan.assumptions, { method: 'simple', returnRate: 5, inflation: 2 });
  Object.assign(plan.retirement, { strategy: 'fixedNominal', spending: 40000, ssBenefit: 0, selfLife: 80, homeEquityFallback: false });
  plan.advanced.networthOn = true;
  plan.advanced.otherAssets = [];
  plan.accounts = [{
    id: 'brokerage', name: 'Brokerage', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 1500000,
    contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100, annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  plan.advanced.debts = [Object.assign({
    id: 'debt', name: 'Debt', type: 'otherDebt', owner: 'household', rateType: 'fixed', includePayment: true,
    extraPrincipalMonthly: 0,
  }, debt)];
  return plan;
}

/* A debt family's `reached`: the one debt is of the class its member declares,
   and every row meets that class's closed-form expectation. */
function debtReached(result, plan, member) {
  const debt = plan.advanced.debts[0];
  if (debtClasses.classifyDebt(debt, plan.profile.age).kind !== member.debtClass) return false;
  return (result.rows || []).every((row) => {
    const expected = debtClasses.expectedBalance(debt, 12 * (row.age - plan.profile.age), plan.profile.age);
    return Math.abs(row.debtBalance - expected) <= 1e-6 * Math.max(1, expected);
  });
}

/* ORDINARY: the payment is DERIVED from balance, rate and term, so the three
   agree. The term is carried in the schema's own fields. */
const ordinaryDebt = (balance, rate, termMonths, payoffAge) => ({
  balance, rate, loanTermYears: termMonths / 12, remainingTermYears: termMonths / 12,
  paymentMonthly: DebtAmortization.monthlyPayment(balance, rate, termMonths), payoffAge,
});

/* S4 task 4.6 / Q54, decided on S4-PA-12: SPLIT AND VERSION. Two separately
   versioned sets, frozen with their versions and pinned fingerprints before
   S5b task 4.6. */
const DEBT_FAMILIES = [
  {
    id: 'debts-ordinary',
    version: 1,
    covers: 'S4 task 4.6 / SPRINT_QUESTIONS.md Q54, decided on S4-PA-12 (SPLIT AND VERSION): the ORDINARY debt set. ' +
      'Balance, rate, term and payment agree -- the payment is derived with DebtAmortization.monthlyPayment() -- ' +
      'so these debts behave as their terms say. Every member declares its class and meets that class\'s ' +
      'closed-form expectation (tests/lib/debt-classes.js) on every row.',
    reached: debtReached,
    members: [
      { name: 'expansion:debt-ordinary-amortizing-15y', debtClass: 'ordinary-amortizing', reaches: 'amortizes to zero at 75, before payoffAge 82',
        build: (plan) => debtHousehold(plan, ordinaryDebt(180000, 5.5, 180, 82)) },
      { name: 'expansion:debt-ordinary-amortizing-5y', debtClass: 'ordinary-amortizing', reaches: 'amortizes to zero at 65, at 8.9%',
        build: (plan) => debtHousehold(plan, ordinaryDebt(25000, 8.9, 60, 82)) },
      { name: 'expansion:debt-ordinary-zero-interest', debtClass: 'zero-interest', reaches: 'no interest on any row; paid off by 64',
        build: (plan) => debtHousehold(plan, ordinaryDebt(12000, 0, 48, 82)) },
      { name: 'expansion:debt-ordinary-zero-balance', debtClass: 'zero-balance', reaches: 'a record carried at zero: no balance, interest or payment',
        build: (plan) => debtHousehold(plan, ordinaryDebt(0, 6.5, 120, 82)) },
      { name: 'expansion:debt-ordinary-payoff', debtClass: 'payoff', reaches: 'a 30-year schedule forced out at payoffAge 70',
        build: (plan) => debtHousehold(plan, ordinaryDebt(150000, 6, 360, 70)) },
    ],
  },
  {
    id: 'debts-adversarial',
    version: 1,
    covers: 'S4 task 4.6 / SPRINT_QUESTIONS.md Q54, decided on S4-PA-12 (SPLIT AND VERSION): the deliberately LABELLED ' +
      'ADVERSARIAL debt set. Payments at or below the debt\'s own monthly interest, on purpose, so the engine\'s ' +
      'handling of negative amortization and interest-only debt stays measured. Whether such a debt is admissible ' +
      'is a product-contract question and is NOT decided here; the validator warns (PAYMENT_BELOW_INTEREST) and ' +
      'does not refuse.',
    reached: debtReached,
    members: [
      { name: 'expansion:debt-adversarial-q54-worst', debtClass: 'negative-amortizing',
        reaches: 'Q54\'s worst generated case, $418,773 at 11.77% paying $224: the balance rises every year, then is forced out at 77',
        build: (plan) => debtHousehold(plan, { balance: 418773, rate: 11.77, paymentMonthly: 224, payoffAge: 77 }) },
      { name: 'expansion:debt-adversarial-interest-only', debtClass: 'interest-only', reaches: 'the balance holds at $200,000 until 75',
        build: (plan) => debtHousehold(plan, { balance: 200000, rate: 6, paymentMonthly: 1000, payoffAge: 75 }) },
      { name: 'expansion:debt-adversarial-a-cent-below', debtClass: 'negative-amortizing', reaches: 'one cent under $500.00 of monthly interest: rises $0.12 a year',
        build: (plan) => debtHousehold(plan, { balance: 100000, rate: 6, paymentMonthly: 499.99, payoffAge: 75 }) },
    ],
  },
];

/* S4 task 4.5: THE SELECTION RULE, DECLARED BEFORE ANYTHING WAS MEASURED, and
   kept after the measurement came back near the top of the band:
     start from golden:monte-carlo-fixed-seed -- the same seed, the same path
     count -- scale ONLY its spending up a fixed grid of 5% steps, and take the
     FIRST step whose success rate lies in [50, 85].
   Measured 2026-09-13 at d3dc52a: the golden plan succeeds 99.8%, success
   falls monotonically along the grid, and step 24 (spending x2.20, $132,000)
   is the first in the band, at 84.4%. No seed was changed and no step skipped
   for a nicer number.
   RE-APPLIED, VERSION 2 (S5AA R9 round, the owner's decision 8, 2026-09-22): the projection now stops at the last death, so
   the four rows after the default lifespan of 95 -- where some paths ran out of money for nobody -- are gone. Step 24
   rose to 85.6%, out of the band. The same rule, applied again with nothing else changed: step 25 (spending x2.25,
   $135,000) is now the first in [50, 85], at 85.0%. The golden plan is 100%; step 25 gives 100% / 85.0% / 54.2% at
   half, full and one-and-a-half times the golden volatility.
   RE-APPLIED, VERSION 3 (S5AA R18 round, workstream B: taxable basis in dollars): growth is now taxed when it is sold,
   so success falls a little along the whole grid. Measured: step 23 (x2.15) 85.6%, step 24 (x2.20, $132,000) 84.8%,
   step 25 84.2%. The same rule, applied again with nothing else changed: step 24 -- the step S4 first chose -- is the
   first in [50, 85]. The golden plan is 100%; step 24 gives 100% / 84.8% / 53.8% at half, full and one-and-a-half times
   the golden volatility. */
const MC_BAND_STEP = 24;
const MC_BAND_FACTOR = 1 + 0.05 * MC_BAND_STEP;

function goldenMonteCarlo(defaultPlan) {
  const def = golden.GOLDEN_SCENARIOS.find(([name]) => name === 'monte-carlo-fixed-seed');
  return golden.buildScenario(defaultPlan, def[1] || {});
}

const MC_BAND_FAMILY = {
  id: 'monte-carlo-sensitive-band',
  version: 3,
  covers: 'S4 task 4.5: the Monte Carlo corpus is saturated against the success ceiling -- the golden Monte Carlo ' +
    'plan succeeds 99.8% -- so it cannot see a defect in the risk model, which only shows through failure. This ' +
    'member sits in the sensitive band (50-85%), chosen by a rule declared before measuring: the golden plan, same ' +
    'seed and path count, spending scaled up a 5% grid, the FIRST step in band. Added as a NEW scenario; the golden ' +
    'plan is not re-tuned (ground rule 9). No other assets or debts, so S3-08 does not arise.',
  reached: (result) => result.mode === 'monteCarlo' && result.successRate >= 50 && result.successRate <= 85,
  members: [
    { name: 'expansion:monte-carlo-sensitive-band',
      reaches: '84.8% success at spending x2.20 (measured at version 3, after workstream B); 100% / 84.8% / 53.8% at half, full and one-and-a-half times the golden volatility',
      build: (plan) => {
        const p = goldenMonteCarlo(plan);
        p.retirement.spending = Math.round(p.retirement.spending * MC_BAND_FACTOR * 100) / 100;
        return p;
      } },
  ],
};

/* { id, version?, covers, reached(result, plan, member) -> boolean,
     members: [{ name, reaches, debtClass?, build(defaultPlanCopy) -> plan }] }
   `reached` is how "measured to reach" is checked: tests run every member and
   require it to hold. */

/* ------------------------------------------------------------------ S5AA task 6.2
 * THE INSTRUMENT-GAP FAMILY. S5AA repaired nine things the control corpus cannot see, and it found
 * that out three times by a repair passing the whole gate WITHOUT MOVING A SINGLE CORPUS FIGURE:
 *
 *   task 4.2, required distributions per owner and per plan. Of 25 members, 6 have distributions on,
 *     and among those ZERO have a spouse holding a pre-tax account and ZERO have a traditional IRA
 *     beside another pre-tax type. With one owner and one plan type, per-plan obligations sum to
 *     exactly the pooled figure, so nothing a row records can differ;
 *   X01, the revolving-debt wiring. The corpus holds 14 debts and `type` is undefined on ALL FOURTEEN
 *     -- not "no credit cards", no types at all -- so every type-dependent debt behaviour is
 *     unreachable from it;
 *   and F-03, F-05 to F-09, which task 0.3 measured as gaps directly rather than by a repair.
 *
 * FOUR MEMBERS, NOT ONE. The blocked log proposed a single deliberately built household, and the
 * remaining gaps do not fit in one: a 415(c)-era catch-up needs wages, an early-distribution penalty
 * needs a household under 59 1/2 drawing on a pre-tax account, a per-owner required distribution needs
 * two owners past their own start ages, and a reduced survivor benefit needs a survivor UNDER survivor
 * full retirement age at the other's death. Four households, each carrying as many gaps as it honestly
 * can, is the smallest set that reaches all nine.
 *
 * EVERY `reaches` LINE BELOW IS MEASURED, not asserted, which is this module's own rule and the lesson
 * Q35 taught twice: a scenario can look like coverage and never enter the branch. The measurements
 * were taken at S5AA's own commit and are quoted with their figures so that a later change which
 * stops reaching a gap fails loudly instead of passing quietly.
 *
 * WHAT THIS FAMILY DOES NOT CLAIM. It is an EXPANSION: the control corpus does not move, and none of
 * this is a re-capture of it. Whether any of these members belongs in the definitive corpus S5b task
 * 4.6 freezes is not decided here. And 415(c) itself is still unmodelled -- the spec vector
 * ACCOUNT-18-4 records it as UNSUPPORTED -- so the working household reaches F-03's CATCH-UP half and
 * says so rather than implying the cap is covered.
 */

const gapAccount = (o) => Object.assign({
  name: o.id, type: 'brokerage', taxClass: 'taxable', owner: 'self', balance: 0,
  basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
  frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
  matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
}, o);

/* Flat and deterministic: no volatility, no inflation, no fees, and every figure entered. The gap each
   household reaches is the only interesting thing in it. */
function gapHousehold(plan, over) {
  plan.setupComplete = true;
  Object.assign(plan.profile, over.profile);
  Object.assign(plan.employment, { salary: 0, spouseSalary: 0, growth: 0 }, over.employment || {});
  Object.assign(plan.assumptions, { method: 'simple', returnRate: 5, inflation: 0, fee: 0, volatility: 0 }, over.assumptions || {});
  Object.assign(plan.retirement, {
    strategy: 'fixedNominal', dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    survivor: false, stages: [], expenses: [], otherIncomes: [],
  }, over.retirement || {});
  Object.assign(plan.advanced, {
    rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false,
    otherAssets: [], debts: [], qcd: 0,
  }, over.advanced || {});
  plan.accounts = over.accounts.map((a, i) => gapAccount(Object.assign({ priority: i + 1 }, a)));
  return plan;
}

/* The predicates are per MEMBER, because four households reach four different branches. The family's
   `reached` dispatches to them, the way the debt families dispatch to a member's debtClass. Each one
   is loaded lazily so this module still requires cleanly without the engine. */
function gapEngine() {
  return require('../../src/engine.js');
}

const GAP_FAMILY = {
  id: 's5aa-instrument-gaps',
  covers: 'S5AA task 6.2: the nine repairs the control corpus cannot reach. F-03 (no catch-up is ever ' +
    'used), F-05 (the IRA deduction phaseout is never partial), F-06 (no early-distribution penalty is ' +
    'ever charged), F-07 (no member has several pre-tax sources and a Roth destination together), F-08 ' +
    '(every matchOn account is pre-tax and the match election is unreachable), F-09 (no survivor is ' +
    'under survivor full retirement age at the other death, where the reduction factor is not 1), ' +
    'F-10 with X01 (all 14 corpus debts carry no type at all, so neither a real adjustable reset nor a ' +
    'revolving minimum is reachable), and task 4.2 (no member has two owners holding pre-tax accounts, ' +
    'nor an IRA beside another pre-tax type, so a per-owner per-plan required distribution sums to ' +
    'exactly the pooled figure it replaced). The S5AA follow-up (2026-09-21) adds a fifth member for its ' +
    'Q3 and Q4: no member died while still earning, and none held a pre-tax account in the name of someone ' +
    'who dies, so neither repair moved anything the corpus could see. The R6 external-audit repairs ' +
    '(2026-09-21) add two more: no member charged health costs to a couple with a death (EA-02), had a working ' +
    'survivor with a Roth IRA near the single phase-out (EA-03), or held any Form 8606 basis at all (EA-04, ' +
    'EA-05), and none passed an HSA to a survivor (EA-07) -- the expanded capture was IDENTICAL across them. ' +
    'The fourth internal audit (2026-09-21) found the basis member does NOT reach EA-04 -- MEASURED, identical to the ' +
    'cent with EA-04\'s defect restored, because each spouse converts in a transaction of their own -- and adds a ' +
    'third member that does.',
  reached: (result, plan, member) => member.check(result, plan, gapEngine()),
  members: [
    {
      name: 'expansion:s5aa-gap-working-household',
      reaches: 'F-03, F-05, F-07, F-08, F-10 and X01 at once. MEASURED: the $34,000 deferral is allowed ' +
        'at $32,500, which is the base limit plus the catch-up, so catch-up room is CONSUMED and then ' +
        'binds; row 1 MAGI of $143,486.58 (restated at S5AA R33, stop age 67) sits inside the $129,000-$149,000 joint ' +
        'phaseout and deducts $2,070 of the $8,000 IRA contribution -- the reduced limit, R33 -- partial, neither end; ' +
        'conversion routes (two at a 5% prior return, measured at R33) ' +
        'exist across two owners and move $174,057.38 into Roth by age 72; the match is Roth-elected ' +
        'and fully vested, worth $68,281.81 of ending Roth against the same plan with a pre-tax match; ' +
        'the adjustable mortgage resets at 57 INSIDE the horizon and raises ARM_RECAST_ALWAYS_APPLIED; ' +
        'and the credit card runs at its revolving minimum in 12 of its first 12 months.',
      build: (plan) => gapHousehold(plan, {
        profile: { age: 52, retireAge: 67, endAge: 72, spouseOn: true, spouseAge: 63, filing: 'mfj' },
        /* S5AA R33 (the owner's decision 5a, 2026-09-29): the stop age is read on each owner's own age. At 55 it stopped the
           63-year-old spouse's deferral from the first row, which took row 1 out of the phase-out band this member exists to
           reach; it is the retirement age, 67, as the app's own setup makes it. */
        employment: { salary: 150000, spouseSalary: 26000, contributionStop: 67 },
        retirement: { spending: 120000 },
        advanced: {
          rmdOn: true, conversionOn: true, conversionAmount: 30000,
          debts: [
            { id: 'card', name: 'Credit card', type: 'creditCard', owner: 'household', rateType: 'fixed',
              rate: 20, balance: 14000, paymentMonthly: 0, extraPrincipalMonthly: 0, payoffAge: 71,
              includePayment: true, includeHousingCosts: false },
            { id: 'arm', name: 'Adjustable mortgage', type: 'mortgage', owner: 'household', rateType: 'adjustable',
              rate: 3, resetRate: 7, nextRateResetAge: 57, balance: 400000, paymentMonthly: 1686.42,
              extraPrincipalMonthly: 0, payoffAge: 71, loanTermYears: 30, remainingTermYears: 30,
              includePayment: true, includeHousingCosts: false },
          ],
        },
        accounts: [
          { id: 'taxable', balance: 300000 },
          { id: 'self-401k', type: 'traditional401k', taxClass: 'preTax', balance: 900000, contribution: 34000,
            matchOn: true, matchRoth: true, matchRate: 100, matchCap: 6 },
          { id: 'self-roth401k', type: 'roth401k', taxClass: 'roth', balance: 120000 },
          { id: 'self-ira', type: 'traditionalIRA', taxClass: 'preTax', balance: 250000, contribution: 8000 },
          { id: 'spouse-401k', type: 'traditional401k', taxClass: 'preTax', owner: 'spouse', balance: 400000, contribution: 12000 },
          { id: 'spouse-roth', type: 'rothIRA', taxClass: 'roth', owner: 'spouse', balance: 60000 },
        ],
      }),
      check: (result, plan, engine) => {
        const codes = (result.issues || []).map((i) => i.code);
        const audit = engine.auditContributions(plan, plan.profile.age, plan.employment.salary, plan.employment.spouseSalary, null);
        const capped = audit.items.some((i) => i.allowed + 1e-9 < i.requested);
        const magi = result.rows[1] ? result.rows[1].magi : 0;
        const deduction = engine.iraDeductibleAmount(8000, magi, plan.profile.filing, true, true);
        const partial = deduction > 0.01 && deduction < 8000 - 0.01;
        const routes = engine.conversionRoutes(JSON.parse(JSON.stringify(plan.accounts)), plan, 0.05);
        const rothMatch = engine.employerMatchIsRoth(plan.accounts.find((a) => a.matchOn));
        return capped && partial && routes.length > 1 && rothMatch
          && codes.includes('ARM_RECAST_ALWAYS_APPLIED')
          && codes.includes('REVOLVING_DEBT_MINIMUM_MODELLED');
      },
    },
    {
      name: 'expansion:s5aa-gap-retired-couple',
      reaches: 'task 4.2, the whole of it. MEASURED at age 78: TWO obligations, self/ira $40,909 and ' +
        'self/plan $72,727, which the pooled rule would have reported as one $113,636 figure payable ' +
        'from either account; and the spouse at 71 owes NOTHING, because her own birth-year start age ' +
        'is not reached -- under the pooled rule her $500,000 IRA was charged on the primary profile\'s ' +
        'age. A $40,000 QCD is credited to the IRA obligation only, so row 1 distributes $127,922.08 ' +
        'where the same household without the QCD distributes $113,636.36.',
      build: (plan) => gapHousehold(plan, {
        profile: { age: 78, retireAge: 78, endAge: 86, spouseOn: true, spouseAge: 71, filing: 'mfj' },
        assumptions: { returnRate: 4 },
        retirement: { spending: 150000, ssBenefit: 42000, spouseSS: 18000, ssClaim: 67, spouseClaim: 65 },
        advanced: { rmdOn: true, qcd: 40000 },
        accounts: [
          { id: 'taxable', balance: 400000 },
          { id: 'self-ira', type: 'traditionalIRA', taxClass: 'preTax', balance: 900000 },
          { id: 'self-401k', type: 'traditional401k', taxClass: 'preTax', balance: 1600000 },
          { id: 'spouse-ira', type: 'traditionalIRA', taxClass: 'preTax', owner: 'spouse', balance: 500000 },
        ],
      }),
      check: (result, plan, engine) => {
        const rmd = engine.rmdFor(JSON.parse(JSON.stringify(plan.accounts)), plan.profile.age, plan);
        const kinds = new Set(rmd.obligations.map((o) => o.kind));
        return rmd.obligations.length >= 2 && kinds.has('ira') && kinds.has('plan')
          && !rmd.obligations.some((o) => o.owner === 'spouse')
          && Number(plan.advanced.qcd) > 0;
      },
    },
    {
      name: 'expansion:s5aa-gap-early-retiree',
      reaches: 'F-06. MEASURED: a 52-year-old with a manual order that draws pre-tax FIRST and no ' +
        'exception claimed, so the 10% early-distribution rate applies to every draw until 59 1/2. The ' +
        'same household with penaltyException set pays $131,347.67 less tax across the plan, which is ' +
        'the penalty this member exists to make reachable.',
      build: (plan) => gapHousehold(plan, {
        profile: { age: 52, retireAge: 52, endAge: 64, spouseOn: false, filing: 'single' },
        assumptions: { returnRate: 4 },
        retirement: { spending: 90000, withdrawalOrder: 'manual', manualOrder: 'preTax,taxable,roth,hsa' },
        advanced: { penaltyException: false, rule55: false },
        accounts: [
          { id: 'self-401k', type: 'traditional401k', taxClass: 'preTax', balance: 1400000 },
          { id: 'taxable', balance: 50000 },
        ],
      }),
      check: (result, plan, engine) => {
        const preTax = plan.accounts.find((a) => a.taxClass === 'preTax');
        const rate = engine.earlyWithdrawalPenaltyRate(plan, plan.profile.age, preTax);
        const drewEarly = (result.rows || []).some((row) => row.age > plan.profile.age && row.age <= 59.5 && row.withdrawals > 0);
        return rate > 0 && drewEarly;
      },
    },
    {
      name: 'expansion:s5aa-gap-widowed-before-fra',
      reaches: 'F-09. MEASURED: survivor full retirement age is 67 and the survivor is 64 when the ' +
        'spouse dies at 68, so the benefit starts at 64 and the reduction factor is 0.8779 -- neither ' +
        'the 0.7150 floor nor the 1.0000 the corpus\'s two survivor members both produce. One of those ' +
        'never widows inside its horizon and the other widows at 68, past survivor full retirement age, ' +
        'where the factor is exactly 1 and the whole reduction is invisible.',
      build: (plan) => gapHousehold(plan, {
        profile: { age: 62, retireAge: 62, endAge: 80, spouseOn: true, spouseAge: 66, filing: 'mfj' },
        assumptions: { returnRate: 4 },
        retirement: {
          spending: 90000, ssBenefit: 24000, spouseSS: 40000, ssClaim: 67, spouseClaim: 66,
          survivor: true, survivorSpendingReduction: 25, selfLife: 95, spouseLife: 68,
        },
        accounts: [
          { id: 'taxable', balance: 600000 },
          { id: 'self-401k', type: 'traditional401k', taxClass: 'preTax', balance: 700000 },
        ],
      }),
      check: (result, plan, engine) => {
        const selfAgeAtSpouseDeath = plan.profile.age + (plan.retirement.spouseLife - plan.profile.spouseAge);
        const start = engine.survivorStartAge(plan, selfAgeAtSpouseDeath);
        const factor = engine.survivorReductionFactor(plan, start);
        return start < engine.survivorFullRetirementAge(plan) && factor > 0 && factor < 1;
      },
    },
    {
      name: 'expansion:s5aa-gap-death-while-working',
      reaches: 'the S5AA follow-up\'s Q3 and Q4, which moved NOTHING in the control or in the four members ' +
        'above: no member dies while still earning, and none holds a pre-tax account in the name of someone ' +
        'who dies. MEASURED against b531d0a, the engine before the block: the spouse, 64 and working, dies at ' +
        '65 -- the row opening at self-age 71. Q3: that engine paid the dead spouse $90,000 and contributed ' +
        '$10,000 in each of the next two rows, until their own retirement age of 67; now both are $0 from ' +
        'the death. Q4: that engine left the $400,000 IRA and the 401(k) in the name of the dead spouse and billed ' +
        'NOTHING on them through self-age 77, because the own clock of the dead spouse would not reach a start age ' +
        'of 75 until self-age 81; now they belong to the survivor, billed $17,045.35 at 73. Ending balance at ' +
        '85: $534,744.63 against $569,211.68.',
      build: (plan) => gapHousehold(plan, {
        profile: { age: 70, retireAge: 67, endAge: 85, spouseOn: true, spouseAge: 64, filing: 'mfj' },
        assumptions: { returnRate: 4 },
        employment: { spouseSalary: 90000, contributionStop: 80 },
        retirement: { spending: 70000, selfLife: 95, spouseLife: 65 },
        advanced: { rmdOn: true },
        accounts: [
          { id: 'taxable', balance: 600000 },
          { id: 'spouse-ira', type: 'traditionalIRA', taxClass: 'preTax', owner: 'spouse', balance: 400000 },
          { id: 'spouse-401k', type: 'traditional401k', taxClass: 'preTax', owner: 'spouse', balance: 150000, contribution: 10000 },
        ],
      }),
      check: (result, plan) => {
        const row = (age) => (result.rows || []).find((r) => Math.abs(r.age - age) < 1e-9) || {};
        const codes = (result.issues || []).map((i) => i.code);
        /* The spouse dies at 65, which is the row opening at self-age 71: from then nobody earns (Q3), and
           from the row opening at 72 the IRA and 401(k) are the survivor's, billed at 73 (Q4) -- where the
           dead spouse's own clock would not have reached a start age until 75. */
        return Number(row(72).income) === 0 && Number(row(74).rmd) > 0
          && codes.includes('SPOUSAL_ROLLOVER_ASSUMED');
      },
    },
    {
      name: 'expansion:s5aa-r6-gap-survivor-health-roth',
      reaches: 'the R6 external audit\'s EA-02 and EA-03. The self, 63 and earning $170,000, puts $7,500 a year into a ' +
        'Roth IRA; the spouse, 65, dies at 66 -- the row opening at self-age 64 -- and the self retires at 67 with ' +
        'health costs on. MEASURED against 5c985c0: EA-03, the survivor stayed on the joint phase-out and kept ' +
        'contributing $7,500 in the rows opening at 65 and 66, where the single ceiling of $168,000 allows $0; EA-02, ' +
        'from the row opening at 69 the health cost was $5,436 a year, the cost of two people, where it is now $2,718. ' +
        'Ending balance at 80: $687,522.03 against $626,747.23.',
      build: (plan) => gapHousehold(plan, {
        profile: { age: 63, retireAge: 67, endAge: 80, spouseOn: true, spouseAge: 65, filing: 'mfj' },
        assumptions: { returnRate: 4 },
        employment: { salary: 170000, contributionStop: 67 },
        retirement: { spending: 50000, selfLife: 95, spouseLife: 66 },
        advanced: { healthOn: true, healthCost: 12000, healthInflation: 0 },
        accounts: [
          { id: 'taxable', balance: 800000 },
          { id: 'roth-ira', type: 'rothIRA', taxClass: 'roth', basisPct: 0, balance: 0, contribution: 7500 },
        ],
      }),
      check: (result, plan, engine) => {
        const rowOf = (r, age) => (r.rows || []).find((x) => Math.abs(x.age - age) < 1e-9) || {};
        /* EA-03: nothing reaches the Roth in the row opening at 65 -- its balance only grows at 4%. */
        const noRoth = Math.abs(Number(rowOf(result, 66).roth) - Number(rowOf(result, 65).roth) * 1.04) < 0.01;
        /* EA-02: the survivor's health cost at 70 is one person's -- the same plan with no spouse at all. */
        const alone = JSON.parse(JSON.stringify(plan));
        alone.profile.spouseOn = false; alone.profile.filing = 'single';
        const one = engine.runPlan(alone);
        const health = (r) => Number(rowOf(r, 71).spending) - 50000;
        return noRoth && Math.abs(health(result) - health(one)) < 0.01 && health(result) > 0;
      },
    },
    {
      name: 'expansion:s5aa-r6-gap-basis-conversion',
      /* FOURTH INTERNAL AUDIT (A4-2): this said it reaches EA-04. It does not -- MEASURED at 99a2e6d, every figure
         identical with EA-04's proportional split restored, because each spouse converts in a transaction of their
         own and no draw ever mixes the two pools. expansion:s5aa-r6-gap-basis-one-owner-draw below reaches it.
         S5AA R9 ROUND, the owner's decision 10: a traditional IRA converts only into a Roth IRA, and the spouse's only Roth
         account here is a Roth 401(k) -- so from the R9 round the SPOUSE's IRA does not convert, and the conversions
         (from 52, the self's) are the self's alone. EA-05 is reached exactly as before, in the row opening at 52; the
         later rows and the ending balance move (r7), which is why the measured figures below are labelled with the
         commit they were measured at. The plan is unchanged, so its reviewed fingerprint is too. */
      reaches: 'the R6 external audit\'s EA-05 and EA-07 (NOT EA-04; see the member after this one). Two 50-year-olds earning $200,000 each and covered by ' +
        'a workplace plan make wholly nondeductible IRA contributions for two years, so both hold Form 8606 basis; ' +
        'from 52 they convert $10,000 a year (since decision 10, the self alone: the spouse has no Roth IRA), and the spouse dies at 60 holding an HSA. MEASURED against 5c985c0: ' +
        'EA-05, every conversion dollar was income -- federal AGI $33,760 in the row opening at 52 -- where the ' +
        'basis in it now leaves $29,764, and the $39 of tax that row is gone; EA-07, the HSA passes to the survivor ' +
        'with the designated-beneficiary assumption now named. Ending balance at 70: $1,846,645.52 against ' +
        '$1,846,243.51.',
      build: (plan) => gapHousehold(plan, {
        profile: { age: 50, retireAge: 52, endAge: 70, spouseOn: true, spouseAge: 50, filing: 'mfj' },
        assumptions: { returnRate: 4 },
        employment: { salary: 200000, spouseSalary: 200000, contributionStop: 52 },
        retirement: { spending: 60000, selfLife: 95, spouseLife: 60 },
        advanced: { conversionOn: true, conversionAmount: 10000, penaltyException: true },
        accounts: [
          { id: 'taxable', balance: 1500000 },
          { id: 'self-ira', type: 'traditionalIRA', taxClass: 'preTax', basisPct: 0, balance: 20000, contribution: 7500 },
          { id: 'spouse-ira', type: 'traditionalIRA', taxClass: 'preTax', basisPct: 0, owner: 'spouse', balance: 0, contribution: 7500 },
          { id: 'self-roth-ira', type: 'rothIRA', taxClass: 'roth', basisPct: 0, balance: 0 },
          { id: 'self-roth401k', type: 'roth401k', taxClass: 'roth', basisPct: 0, balance: 0, contribution: 1 },
          { id: 'spouse-roth401k', type: 'roth401k', taxClass: 'roth', basisPct: 0, owner: 'spouse', balance: 0, contribution: 1 },
          { id: 'spouse-hsa', type: 'hsa', taxClass: 'hsa', basisPct: 0, owner: 'spouse', balance: 20000 },
        ],
      }),
      check: (result, plan, engine) => {
        const rowOf = (r, age) => (r.rows || []).find((x) => Math.abs(x.age - age) < 1e-9) || {};
        /* EA-05: the first conversion adds LESS than its $10,000 to AGI, because part of it is basis. */
        const without = JSON.parse(JSON.stringify(plan));
        without.advanced.conversionOn = false;
        const added = Number(rowOf(result, 53).federalAgi) - Number(rowOf(engine.runPlan(without), 53).federalAgi);
        /* EA-07: the HSA that passes is disclosed with its assumption. */
        const rolled = (result.issues || []).find((i) => i.code === 'SPOUSAL_ROLLOVER_ASSUMED');
        const awaiting = rolled && rolled.state && rolled.state.assumptionsAwaitingDecision;
        return added > 0 && added < 9999 && Array.isArray(awaiting)
          && awaiting.includes('the surviving spouse is the designated beneficiary of the HSA');
      },
    },
    {
      name: 'expansion:s5aa-r6-gap-basis-one-owner-draw',
      reaches: 'the R6 external audit\'s EA-04, which the basis member above does not. Two 50-year-olds earning $200,000 ' +
        'each and covered by a workplace plan both make nondeductible IRA contributions for two years, so both hold ' +
        'Form 8606 basis; neither has a Roth account, so neither converts. From 52, $20,000 a year of spending is drawn ' +
        'from the SELF\'s IRA alone for six years. MEASURED against 5c985c0: the self\'s federal AGI in those years ' +
        'depended on whether the SPOUSE held basis -- $25,820.97 against $25,832.60 in the first, $25,707.46 against ' +
        '$28,059.40 by the sixth -- because the end-of-row split took part of the self\'s recovery out of the spouse\'s ' +
        'basis. Now the two are identical to the cent.',
      build: (plan) => gapHousehold(plan, {
        profile: { age: 50, retireAge: 52, endAge: 62, spouseOn: true, spouseAge: 50, filing: 'mfj' },
        assumptions: { returnRate: 4 },
        employment: { salary: 200000, spouseSalary: 200000, contributionStop: 52 },
        retirement: { spending: 20000, selfLife: 95, spouseLife: 95, withdrawalOrder: 'manual', manualOrder: 'preTax,taxable,roth,hsa' },
        advanced: { penaltyException: true },
        accounts: [
          { id: 'self-ira', type: 'traditionalIRA', taxClass: 'preTax', basisPct: 0, balance: 100000, contribution: 7500 },
          { id: 'spouse-ira', type: 'traditionalIRA', taxClass: 'preTax', basisPct: 0, owner: 'spouse', balance: 0, contribution: 7500 },
          { id: 'self-401k', type: 'traditional401k', taxClass: 'preTax', basisPct: 0, balance: 0, contribution: 1, priority: 9 },
          { id: 'spouse-401k', type: 'traditional401k', taxClass: 'preTax', basisPct: 0, owner: 'spouse', balance: 0, contribution: 1, priority: 9 },
          { id: 'taxable', balance: 500000, priority: 10 },
        ],
      }),
      check: (result, plan, engine) => {
        const rowOf = (r, age) => (r.rows || []).find((x) => Math.abs(x.age - age) < 1e-9) || {};
        /* The self draws alone in the rows labelled 53 to 58; their AGI must not depend on the spouse's basis. */
        const noSpouseBasis = JSON.parse(JSON.stringify(plan));
        noSpouseBasis.accounts.find((a) => a.id === 'spouse-ira').contribution = 0;
        const other = engine.runPlan(noSpouseBasis);
        return [53, 54, 55, 56, 57, 58].every((age) =>
          Math.abs(Number(rowOf(result, age).federalAgi) - Number(rowOf(other, age).federalAgi)) < 0.01)
          && Number(rowOf(result, 53).federalAgi) > 0;
      },
    },
  ],
};

/*
 * S5AA R14 round -- THE REPAIRED REQUIRED-DISTRIBUTION INTERACTIONS. The R10 audit asked for corpus members
 * reaching its repairs, and the re-audit of 6468235 made it an acceptance item (R13-01, item 5): the expanded
 * capture was identical across R11-01, R12-01 and R13-01, so each was held by unit tests alone. MEASURED: no member
 * converted or transferred in a year with a required distribution and a negative return; none held two IRAs of one
 * owner earning different returns; and every account id in the corpus is an ordinary word.
 *
 * Each member's check compares it with a COUNTERPART PLAN the repair must not tell apart -- the same accounts in the
 * other order, or under ordinary names -- or with the same plan without the conversion, so a member that stops
 * reaching its branch fails loudly. Money is compared to the cent: reversing the accounts reverses the order the
 * row's totals are summed in, which may move the last bit.
 */
const rowsAgree = (a, b) => (a.rows || []).length === (b.rows || []).length && (a.rows || []).every((row, i) =>
  Object.entries(row).every(([k, v]) => typeof v !== 'number' || Math.abs(v - b.rows[i][k]) < 0.005));
const RMD_FAMILY = {
  id: 's5aa-rmd-repairs',
  covers: 'S5AA R11-01 and R10-02 (a drawn obligation\'s reserve is held out of a LOSING year and the conversion takes ' +
    'only what is above it), R12-01 (the protected reserve is the one paid, whatever order the accounts are listed ' +
    'in), and R13-01 (an account id is data: prototype-named ids give the same money as ordinary ones). The ' +
    'expanded capture was identical across all three.',
  reached: (result, plan, member) => member.check(result, plan, gapEngine()),
  members: [
    {
      name: 'expansion:s5aa-r14-rmd-conversion-under-loss',
      reaches: 'R11-01 and R10-02. One retired owner, 75 to 80, a $300,000 IRA converting $60,000 a year into a Roth ' +
        'IRA while every year loses 6%. MEASURED: at 831e393, before R11-01, the plan ended in RMD_NOT_DISTRIBUTED, the reserve having grown ' +
        'into the loss after the conversion took the rest; from 4492088 it completes with every obligation paid -- $12,195.12, ' +
        '300,000 / 24.6, in the first row -- and the IRA converted empty by 80: Roth $196,426.32, total $261,495.06.',
      build: (plan) => gapHousehold(plan, {
        profile: { age: 75, retireAge: 60, endAge: 80, spouseOn: false, spouseAge: 75, filing: 'single' },
        assumptions: { returnRate: -6, withdrawalTiming: 'annual' },
        retirement: { spending: 30000, selfLife: 95, withdrawalOrder: 'manual', manualOrder: 'taxable,hsa,roth,preTax' },
        advanced: { rmdOn: true, conversionOn: true, conversionAge: 75, conversionAmount: 60000 },
        accounts: [
          { id: 'ira', type: 'traditionalIRA', taxClass: 'preTax', basisPct: 0, balance: 300000 },
          { id: 'roth-ira', type: 'rothIRA', taxClass: 'roth', basisPct: 0, balance: 0 },
          { id: 'taxable', balance: 250000 },
        ],
      }),
      check: (result, plan, engine) => {
        const without = JSON.parse(JSON.stringify(plan));
        without.advanced.conversionOn = false;
        const other = engine.runPlan(without), rows = result.rows || [], last = rows[rows.length - 1] || {};
        return result.status === 'ok' && rows.every((r) => !(Number(r.rmdUnmet) > 0.005))
          && rows.filter((r) => r.rmdDistributed > 0).length >= 3
          && Number(last.roth) > Number(((other.rows || []).slice(-1)[0] || {}).roth) + 1;
      },
    },
    {
      name: 'expansion:s5aa-r14-rmd-two-iras-distinct-returns',
      reaches: 'R12-01. One owner, 78 to 84, holds two IRAs in one obligation: the one listed FIRST is the lower ' +
        'priority and loses 12% a year, the other earns 7%; a transfer from the losing IRA to a Roth IRA draws on the ' +
        'obligation. MEASURED at 4e23619, before R12-01: as listed, pre-tax assets end at $287,801.17 and ' +
        'the total at $412,868.08; with the accounts reversed, $286,286.77 and $410,823.45 -- the reserve was held out of the ' +
        'losing IRA while the growing one paid it. From 6468235 both orders give the second figures.',
      build: (plan) => {
        gapHousehold(plan, {
          profile: { age: 78, retireAge: 60, endAge: 84, spouseOn: false, spouseAge: 78, filing: 'single' },
          assumptions: { returnRate: 0, withdrawalTiming: 'annual' },
          retirement: { spending: 20000, selfLife: 95, withdrawalOrder: 'manual', manualOrder: 'taxable,hsa,roth,preTax' },
          advanced: { rmdOn: true, transferOn: true, transferAge: 78, transferFrom: 'ira-losing', transferTo: 'roth-ira', transferAmount: 8000 },
          accounts: [
            { id: 'ira-losing', type: 'traditionalIRA', taxClass: 'preTax', basisPct: 0, balance: 40000, priority: 9, allocation: { losing: 100 } },
            { id: 'ira-growing', type: 'traditionalIRA', taxClass: 'preTax', basisPct: 0, balance: 250000, priority: 1, allocation: { growing: 100 } },
            { id: 'roth-ira', type: 'rothIRA', taxClass: 'roth', basisPct: 0, balance: 0, priority: 2, allocation: { flat: 100 } },
            { id: 'taxable', balance: 150000, priority: 3, allocation: { flat: 100 } },
          ],
        });
        Object.assign(plan.advanced, { assetsOn: true, glideOn: false, bondTentOn: false, assetClasses: [
          { id: 'growing', name: 'Growing', returnRate: 7, volatility: 0 },
          { id: 'losing', name: 'Losing', returnRate: -12, volatility: 0 },
          { id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }] });
        return plan;
      },
      check: (result, plan, engine) => {
        const reversed = JSON.parse(JSON.stringify(plan));
        reversed.accounts.reverse();
        const rows = result.rows || [];
        return result.status === 'ok' && rowsAgree(result, engine.runPlan(reversed))
          && rows.every((r) => !(Number(r.rmdUnmet) > 0.005)) && Number((rows[1] || {}).rmdDistributed) > 0
          && Number((rows[1] || {}).roth) > 0;
      },
    },
    {
      name: 'expansion:s5aa-r14-rmd-prototype-ids',
      reaches: 'R13-01. A couple, 80 and 78, whose accounts are named "__proto__", "constructor", "toString", ' +
        '"valueOf" and "0" -- every one a unique id the validator accepts -- convert $40,000 a year from the older ' +
        'owner\'s IRA while every year loses 5%, and both owe required distributions. MEASURED: at 4e23619 and 6468235 the plan ended in ' +
        'TAX_QUOTE_NONFINITE_CONTEXT; at 831e393, before the reserve map existed, it completed but owed $14,342.93 in its ' +
        'first row against $16,719.17 under ordinary names -- the "__proto__" IRA\'s obligation taken from its balance after ' +
        'the conversion and the loss. From fd32026 it is the ordinary-name plan to the cent: total $293,068.95.',
      build: (plan) => gapHousehold(plan, {
        profile: { age: 80, retireAge: 60, endAge: 85, spouseOn: true, spouseAge: 78, filing: 'mfj' },
        assumptions: { returnRate: -5, withdrawalTiming: 'annual' },
        retirement: { spending: 50000, selfLife: 95, spouseLife: 95, withdrawalOrder: 'manual', manualOrder: 'taxable,hsa,roth,preTax' },
        advanced: { rmdOn: true, conversionOn: true, conversionAge: 80, conversionAmount: 40000 },
        accounts: [
          { id: '__proto__', type: 'traditionalIRA', taxClass: 'preTax', basisPct: 0, balance: 200000 },
          { id: 'constructor', type: 'traditionalIRA', taxClass: 'preTax', basisPct: 0, owner: 'spouse', balance: 150000 },
          { id: 'toString', type: 'rothIRA', taxClass: 'roth', basisPct: 0, balance: 0 },
          { id: 'valueOf', type: 'rothIRA', taxClass: 'roth', basisPct: 0, owner: 'spouse', balance: 0 },
          { id: '0', balance: 300000 },
        ],
      }),
      check: (result, plan, engine) => {
        const plain = JSON.parse(JSON.stringify(plan));
        plain.accounts.forEach((a, i) => { a.id = 'account-' + (i + 1); });
        const rows = result.rows || [];
        return result.status === 'ok' && rowsAgree(result, engine.runPlan(plain))
          && rows.filter((r) => r.rmdDistributed > 0).length >= 3 && rows.every((r) => !(Number(r.rmdUnmet) > 0.005));
      },
    },
    {
      /* R15 round, external audit of 1e6faae (R14-01; S2 carried item U1). No member transferred pre-tax money to a
         taxable account in a year with a required distribution -- the control corpus did not move when the repair
         landed -- so its only regression was the unit tests. */
      name: 'expansion:s5aa-r15-rmd-transfer-to-taxable',
      reaches: 'R14-01. One retired owner, 78 to 83, with a $200,000 IRA and an $80,000 401(k) earning 3%, moves $30,000 from ' +
        'the IRA to the taxable account in the first row. That distribution covers the IRA obligation (200,000 / 22 = ' +
        '9,090.91) and must be credited against it; the 401(k) is its own obligation and still pays 80,000 / 22 from ' +
        'itself. The check is a closed form of the first row: 170,000 x 1.03 + 80,000 x 1.03 - 80,000 / 22 = 253,863.64 of ' +
        'pre-tax assets. MEASURED: $244,500.00 at 1e6faae, where the IRA obligation was reserved out of the growth and ' +
        'then taken on top of the transfer; the closed form from the R15 repair.',
      build: (plan) => gapHousehold(plan, {
        profile: { age: 78, retireAge: 60, endAge: 83, spouseOn: false, spouseAge: 78, filing: 'single' },
        assumptions: { returnRate: 3, withdrawalTiming: 'annual' },
        retirement: { spending: 20000, selfLife: 95, withdrawalOrder: 'manual', manualOrder: 'taxable,hsa,roth,preTax' },
        advanced: { rmdOn: true, transferOn: true, transferAge: 78, transferFrom: 'ira', transferTo: 'taxable', transferAmount: 30000 },
        accounts: [
          { id: 'ira', type: 'traditionalIRA', taxClass: 'preTax', basisPct: 0, balance: 200000 },
          { id: '401k', type: 'traditional401k', taxClass: 'preTax', basisPct: 0, balance: 80000 },
          { id: 'taxable', balance: 150000 },
        ],
      }),
      check: (result, plan) => {
        const rows = result.rows || [], first = rows[1] || {}, g = 1 + plan.assumptions.returnRate / 100, divisor = 22,
          ira = plan.accounts[0].balance, k = plan.accounts[1].balance, moved = plan.advanced.transferAmount;
        return result.status === 'ok' && rows.every((r) => !(Number(r.rmdUnmet) > 0.005))
          && Math.abs(Number(first.preTax) - ((ira - moved) * g + k * g - k / divisor)) < 0.005
          && Math.abs(Number(first.rmdDistributed) - (ira + k) / divisor) < 0.005;
      },
    },
  ],
};

/* S5AA R18 round, Claude's self-audit (Handover temp/S5AA_R18_SELF_AUDIT_20260923.md): witnesses for the two loss-rule
   repairs. SA18-01 reached 10 members through the imputed yield's small losses, but none isolates it; SA18-02 reached
   none -- no member carried a loss past a death -- so its only regression was the unit tests. Both use the tests' own
   plans (tests/audit-s5aa-r18-self-audit-capital-loss.test.js): dividends on at no yield, annual timing, no inflation,
   `loser` halving and `winner` gaining 50% a year, and each check is the test's closed form of the 71 row. */
const LOSS_CLASSES = [{ id: 'down', name: 'Down', returnRate: -50, volatility: 0 }, { id: 'up', name: 'Up', returnRate: 50, volatility: 0 }];
function lossHousehold(plan, over) {
  return gapHousehold(plan, {
    profile: over.profile,
    assumptions: { returnRate: 0, withdrawalTiming: 'annual' },
    retirement: Object.assign({ dividendOn: true, dividendYield: 0, dividendStart: 120, dividendQualified: 100, spouseLife: 99,
      withdrawalOrder: 'manual', manualOrder: 'taxable,hsa,roth,preTax' }, over.retirement),
    advanced: { assetsOn: true, glideOn: false, assetClasses: LOSS_CLASSES },
    accounts: [
      { id: 'loser', owner: over.loserOwner || 'self', balance: 100000, basisPct: 100, allocation: { down: 100 } },
      { id: 'winner', owner: over.winnerOwner || 'self', balance: 100000, basisPct: 100, allocation: { up: 100 } },
    ],
  });
}
/* The Arizona-funded 71 row: AGI = base + (5/9)x with x = 2.5% x (AGI - 18,200). */
const lossRowAgi = (base) => base + (5 / 9) * 0.025 * (base - 18200) / (1 - 0.025 * 5 / 9);
const LOSS_FAMILY = {
  id: 's5aa-capital-loss',
  covers: 'S5AA R18 self-audit SA18-01 (a loss year\'s carryover used only up to its taxable income, by the Capital Loss ' +
    'Carryover Worksheet) and SA18-02 (a decedent\'s carried loss is not the survivor\'s, Pub. 559).',
  reached: (result, plan, member) => member.check(result, plan),
  members: [
    {
      name: 'expansion:s5aa-sa18-loss-under-deduction',
      reaches: 'SA18-01. A single retiree at 70 with a $20,000 pension realises a $50,000 loss while under the standard ' +
        'deduction, and at 71 a one-time $58,000 expense sells a $60,000 gain. IRC 1212(b)(2)(B) adds back the 1211(b) amount and ' +
        'the section 151 senior deduction, so the year uses 1,850 and 48,150 carries (restated at S5AA R33, SA32F-34): AGI at 71 is ' +
        'that of a 31,850 pre-tax base. MEASURED: 33,208.45 at 6e8f31e, which carried only 47,000; 30,166.20 before R33, which carried 50,000.',
      build: (plan) => lossHousehold(plan, {
        profile: { age: 70, retireAge: 60, endAge: 72, spouseOn: false, spouseAge: 70, filing: 'single' },
        retirement: { spending: 70000, pension: 20000, pensionAge: 60, pensionCola: 0, selfLife: 99,
          expenses: [{ name: 'Once', age: 71, amount: 58000 }] },
      }),
      check: (result) => result.status === 'ok' && Math.abs(Number(((result.rows || [])[2] || {}).federalAgi) - lossRowAgi(31850)) < 0.005,
    },
    {
      name: 'expansion:s5aa-sa18-decedent-loss',
      reaches: 'SA18-02. A couple at 70; the self dies in the 70 row holding a $50,000 carried loss, and the survivor sells ' +
        'a $50,000 gain at 71. The loss ended with the final return: AGI at 71 is 50,447.89. MEASURED: 0 at 6e8f31e, ' +
        'where the survivor deducted it.',
      build: (plan) => lossHousehold(plan, {
        profile: { age: 70, retireAge: 60, endAge: 72, spouseOn: true, spouseAge: 70, filing: 'mfj' },
        retirement: { spending: 50000, selfLife: 70.5, expenses: [{ name: 'Once', age: 71, amount: 40000 }] },
        winnerOwner: 'spouse',
      }),
      check: (result) => result.status === 'ok' && Math.abs(Number(((result.rows || [])[2] || {}).federalAgi) - lossRowAgi(50000)) < 0.005,
    },
  ],
};

/* S5AA R19 round, WORKSTREAM A: witnesses for the annual per-owner IRA settlement -- the R10 external audit's own
   witnesses for R10-03, R10-04 (both cases) and R10-05, which no member reached (0 of 63 at c92fefa; the contract named
   them). Built from tests/audit-s5aa-r19-workstream-a-ira-settlement.test.js's plans; each check is that test's figure,
   worked by hand there, and each was measured to fail on the engine before workstream A (25b0c37). */
const iraAccount = (id, balance, extra) => Object.assign({ id, type: 'traditionalIRA', taxClass: 'preTax', basisPct: 0, balance }, extra || {});
const IRA_COVER = { id: 'r401', type: 'roth401k', taxClass: 'roth', basisPct: 0, contribution: 1, priority: 8 };
function iraHousehold(plan, over) {
  return gapHousehold(plan, {
    profile: Object.assign({ spouseOn: false, filing: 'single', spouseAge: 70 }, over.profile),
    employment: over.employment,
    assumptions: { returnRate: 0, withdrawalTiming: 'annual' },
    retirement: Object.assign({ spending: 0, selfLife: 95, spouseLife: 95, withdrawalOrder: 'manual', manualOrder: 'preTax,taxable,roth,hsa' }, over.retirement),
    advanced: Object.assign({ penaltyException: true }, over.advanced),
    accounts: over.accounts.concat([{ id: 'cash', balance: 0, priority: 9 }]),
  });
}
const rowAt = (result, age) => (result.rows || []).find((r) => r.age === age) || {};
const within = (a, b) => Math.abs(Number(a) - b) < 0.005;
const IRA_FAMILY = {
  id: 's5aa-ira-settlement',
  covers: 'S5AA R19 workstream A: R10-03 (this year\'s nondeductible contribution is basis for this year\'s conversion), ' +
    'R10-04 (a QCD comes from taxable money first and spends no basis; basis given to charity is gone) and R10-05 (post-70.5 ' +
    'deductions reduce the QCD exclusion), with the tax-liability ledger\'s true-up.',
  reached: (result, plan, member) => member.check(result, plan),
  members: [
    {
      name: 'expansion:s5aa-r19-ira-contribution-conversion-same-year',
      reaches: 'R10-03. 45, retiring at 45.5 on $400,000; a wholly nondeductible $3,750 half-year IRA contribution converted the ' +
        'same half year. Settled AGI 200,000; the provisional $993.75 refunded in the next row. MEASURED at 25b0c37: AGI 203,750.',
      build: (plan) => iraHousehold(plan, {
        profile: { age: 45, retireAge: 45.5, endAge: 47 }, employment: { salary: 400000, contributionStop: 45.5 },
        advanced: { conversionOn: true, conversionAmount: 7500 },
        accounts: [iraAccount('ira', 0, { contribution: 7500 }), { id: 'roth-ira', type: 'rothIRA', taxClass: 'roth', basisPct: 0, priority: 3 }, IRA_COVER],
      }),
      check: (result) => result.status === 'ok' && within(rowAt(result, 46).federalAgi, 200000) && within(rowAt(result, 47).taxTrueUpPaid, -993.75),
    },
    {
      name: 'expansion:s5aa-r19-ira-conversion-and-qcd',
      reaches: 'R10-04 A. $6,000 pre-tax + $4,000 basis; at 71 convert $5,000 and give $5,000. The QCD takes taxable money; the ' +
        'conversion is 80% basis: AGI 1,000. MEASURED at 25b0c37: AGI 3,000.',
      build: (plan) => iraHousehold(plan, {
        profile: { age: 70, retireAge: 71, endAge: 73 }, employment: { salary: 200000, contributionStop: 71 },
        advanced: { conversionOn: true, conversionAmount: 5000, qcd: 5000 },
        accounts: [iraAccount('ira', 6000, { contribution: 4000 }), { id: 'roth-ira', type: 'rothIRA', taxClass: 'roth', basisPct: 0, priority: 3 }, IRA_COVER],
      }),
      check: (result) => result.status === 'ok' && within(rowAt(result, 72).federalAgi, 1000),
    },
    {
      name: 'expansion:s5aa-r19-ira-charity-then-rollover',
      reaches: 'R10-04 B. A $10,000 IRA holding $4,000 of basis given to charity whole; then a $20,000 401(k) rolled in, $10,000 ' +
        'to charity and $10,000 spent: AGI 10,000. MEASURED at 25b0c37: AGI 6,000 (the spent basis sheltered it).',
      build: (plan) => iraHousehold(plan, {
        profile: { age: 70, retireAge: 71, endAge: 73 }, employment: { salary: 200000, contributionStop: 71 },
        retirement: { expenses: [{ name: 'Once', age: 72, amount: 10000 }] },
        advanced: { qcd: 10000, transferOn: true, transferAge: 72, transferFrom: 'k401', transferTo: 'ira', transferAmount: 20000 },
        accounts: [iraAccount('ira', 6000, { contribution: 4000 }), { id: 'k401', type: 'traditional401k', taxClass: 'preTax', basisPct: 0, balance: 20000, priority: 2 }, IRA_COVER],
      }),
      check: (result) => result.status === 'ok' && within(rowAt(result, 73).federalAgi, 10000),
    },
    {
      name: 'expansion:s5aa-r19-ira-qcd-offset',
      reaches: 'R10-05. 71, $50,000 of wages, a deductible $5,000 IRA contribution and a $10,000 QCD: AGI 50,000, and the $725 ' +
        'true-up paid in the next row. MEASURED at 25b0c37: AGI 45,000.',
      build: (plan) => iraHousehold(plan, {
        profile: { age: 71, retireAge: 72, endAge: 73 }, employment: { salary: 50000, contributionStop: 72 },
        advanced: { qcd: 10000 },
        accounts: [iraAccount('ira', 20000, { contribution: 5000 })],
      }),
      check: (result) => result.status === 'ok' && within(rowAt(result, 72).federalAgi, 50000) && within(rowAt(result, 73).taxTrueUpPaid, 725),
    },
  ],
};

/* S5AA R20 round: witnesses for ChatGPT's R18 full-model audit (R18F-01..03, repaired on the owner's decisions of
   2026-09-23). None of the three was reached by any member (0 of r13's 67 for the owner age and the Rule of 55 ranking;
   no member holds an all-stock account under a glide). Built from the R20 tests' plans, each checked by that test's
   hand-worked figure, and each MEASURED to fail on the engine before its repair (acd0dcf). Dividends are on at a 0% yield,
   so no imputed dividend is taxed and a brokerage draw at full basis realises nothing. */
function r20Household(plan, over) {
  return gapHousehold(plan, {
    profile: over.profile,
    assumptions: Object.assign({ returnRate: 0, withdrawalTiming: 'annual' }, over.assumptions),
    retirement: Object.assign({ spending: 0, dividendOn: true, dividendYield: 0, selfLife: 99, spouseLife: 99 }, over.retirement),
    advanced: Object.assign({ penaltyException: false, rule55: false }, over.advanced),
    accounts: over.accounts,
  });
}
const R20_FAMILY = {
  id: 's5aa-r20-full-model',
  covers: 'S5AA R20: R18F-01 (a glide path\'s return and risk from one allocation; an all-stock account glides into ' +
    'bonds), R18F-02 (the early-distribution tax and the Rule of 55 read the account owner\'s age) and R18F-03 (the ' +
    'optimized order prices the early tax the way the draw charges it).',
  reached: (result, plan, member) => member.check(result, plan),
  members: [
    {
      name: 'expansion:s5aa-r20-spouse-owner-early-tax',
      reaches: 'R18F-02. A couple, the primary person 70 and the spouse 50; $10,000 of spending from the spouse\'s $100,000 ' +
        'IRA. The owner is under 59.5: $11,111.11 drawn, $1,111.11 of early tax. MEASURED at acd0dcf: $10,000 and $0 (the ' +
        'primary age was read).',
      build: (plan) => r20Household(plan, {
        profile: { age: 70, spouseAge: 50, spouseOn: true, filing: 'mfj', retireAge: 70, endAge: 71 },
        retirement: { spending: 10000, withdrawalOrder: 'manual', manualOrder: 'preTax,taxable,roth,hsa' },
        accounts: [{ id: 'spouse-ira', type: 'traditionalIRA', taxClass: 'preTax', owner: 'spouse', basisPct: 0, balance: 100000 }],
      }),
      check: (result) => result.status === 'ok' && within(rowAt(result, 71).taxes, 1111.11) && within(rowAt(result, 71).withdrawals, 11111.11),
    },
    {
      name: 'expansion:s5aa-r20-rule55-ira-ranking',
      reaches: 'R18F-03. A couple at 56 with Rule of 55 on, optimized "legacy" order, $50,000 in a brokerage account at full ' +
        'basis and $50,000 in an IRA, $50,000 of spending. The IRA is still under the 10%, so the brokerage is drawn: $0 of ' +
        'tax, the IRA intact. MEASURED at acd0dcf: the IRA drawn, $7,225 of tax.',
      build: (plan) => r20Household(plan, {
        profile: { age: 56, spouseAge: 56, spouseOn: true, filing: 'mfj', retireAge: 55, endAge: 57 },
        retirement: { spending: 50000, withdrawalOrder: 'optimized', optimizationGoal: 'legacy', rmdSmoothing: false,
          irmaaGuard: false, preserveRoth: false, survivor: true, survivorSpendingReduction: 0, spouseLife: 63 },
        advanced: { rule55: true, reserveOn: false, legacy: 0 },
        accounts: [{ id: 'brk', balance: 50000 }, { id: 'ira', type: 'traditionalIRA', taxClass: 'preTax', basisPct: 0, balance: 50000 }],
      }),
      check: (result) => result.status === 'ok' && within(rowAt(result, 57).taxes, 0) && within(rowAt(result, 57).preTax, 50000),
    },
    {
      name: 'expansion:s5aa-r20-all-stock-glide',
      reaches: 'R18F-01. $1,000,000 all in stocks at 59, retiring at 60, gliding to 60% stocks with asset classes on: 10% then ' +
        '7.8% (60/40): $1,185,800 at 61. MEASURED at acd0dcf: $1,210,000 (the account never glided).',
      build: (plan) => r20Household(plan, {
        profile: { age: 59, spouseOn: false, filing: 'single', retireAge: 60, endAge: 61 },
        advanced: { assetsOn: true, glideOn: true, retirementStock: 60, correlation: 0.25, reserveOn: false, bondTentOn: false },
        accounts: [{ id: 'stocks', balance: 1000000, allocation: { stocks: 100, bonds: 0, cash: 0 } }],
      }),
      check: (result) => result.status === 'ok' && within(rowAt(result, 61).total, 1185800),
    },
  ],
};

const EXPANSION_FAMILIES = [
  {
    id: 'other-asset-draws',
    covers: 'S4 task 4.1-4.3 / SPRINT_QUESTIONS.md Q35: the control corpus never draws on a non-portfolio ' +
      'asset (0 of 1,036 rows) and every asset it carries has growth 0, so drawFromOtherAssets() and the ' +
      'across-row asset identity have no corpus coverage. Monte Carlo is left out on purpose: once a Monte ' +
      'Carlo row draws, S3-08 reproduces in the L4b within-row sweep (recorded for df/the owner). All assets in one ' +
      'member share a growth rate, because a row exposes only the TOTAL of other assets.',
    reached: (result) => (result.rows || []).some((row) => row.nonPortfolioDraw > 0),
    members: [
      { name: 'expansion:other-asset-draw-growth-0', reaches: 'draws on 15 of 16 rows at zero growth (measured)',
        build: (plan) => otherAssetHousehold(plan) },
      { name: 'expansion:other-asset-draw-growth-4', reaches: 'draws on 15 of 16 rows while the asset grows 4% a year (measured)',
        build: (plan) => otherAssetHousehold(plan, { assets: [{ growth: 4 }] }) },
      { name: 'expansion:other-asset-draw-historical',
        reaches: 'draws on 12 of 16 rows in historical mode from 1966, from a limited-liquidity asset at 60% access (measured)',
        build: (plan) => otherAssetHousehold(plan, {
          assumptions: { method: 'historical', historyStart: 1966 },
          account: { balance: 250000 },
          assets: [{ growth: 3, liquidity: 'limited', accessPct: 60 }],
        }) },
      { name: 'expansion:other-asset-two-assets-late-access',
        reaches: 'first draws at age 64, after the earlier asset opens (63) and before the later one does (65), across an illiquid and a liquid asset (measured; the text said "after the later asset opens" until the R9 round, DeepSeek finding 2j/03)',
        build: (plan) => otherAssetHousehold(plan, {
          assets: [
            { id: 'land', type: 'investmentProperty', name: 'Land', liquidity: 'illiquid', growth: 2, accessPct: 50, availableAge: 63 },
            { id: 'bond', type: 'bankCash', name: 'Savings bond', liquidity: 'liquid', value: 120000, growth: 2, accessPct: 100, availableAge: 65 },
          ],
        }) },
    ],
  },
].concat(DEBT_FAMILIES, [MC_BAND_FAMILY, GAP_FAMILY, RMD_FAMILY, LOSS_FAMILY, IRA_FAMILY, R20_FAMILY]);

function expansionNames() {
  return EXPANSION_FAMILIES.flatMap((family) => family.members.map((m) => m.name));
}

/* Fresh plans on every call: each member builds from its own copy of the
   default plan, so no caller can edit another's input. */
function expansionScenarios(defaultPlan) {
  return EXPANSION_FAMILIES.flatMap((family) => family.members.map((m) => ({
    name: m.name,
    family: family.id,
    plan: m.build(JSON.parse(JSON.stringify(defaultPlan))),
  })));
}

module.exports = { EXPANSION_FAMILIES, expansionNames, expansionScenarios };
