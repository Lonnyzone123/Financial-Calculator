'use strict';

/*
 * S5 exit gate E5, the Results page: the warnings a user reads after a run, rendered by the fresh build of this tree in
 * jsdom (tests/lib/harness.js, the worker-less compatibility route the regression suite uses).
 *
 * Task 8 (R6) retired Arizona's deduction proxy, and the Rules page says so, but the Results page's "Arizona estimate"
 * card still said the app used "a disclosed deduction proxy". It now states what the engine does, with each authority
 * status. Task 11's Roth catch-up rule reaches the user as a warning built by auditContributions() on the main thread;
 * runPlan()'s result does not carry it, so routes 2 and 3 never see it, and this file reads it where it is rendered.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCalculator, goToPage, waitFor } = require('./lib/harness.js');

async function resultsCards(scenario) {
  const seed = { version: 2, edition: '2C', page: 'setup', complexity: 'standard', theme: 'auto', compare: false, active: 0, scenarios: [scenario] };
  const dom = await loadCalculator({ localStorageSeed: { 'investment-calculator-v2c': JSON.stringify(seed) } });
  try {
    const doc = dom.window.document;
    const root = doc.getElementById('investment-calculator-v2c');
    goToPage(doc, 'results');
    await waitFor(() => root.querySelector('#v2-performance').textContent === 'Calculation complete', { window: dom.window, timeoutMs: 15000 });
    return Array.from(root.querySelectorAll('#v2-warnings .v2-card')).map((c) => c.textContent);
  } finally {
    dom.window.close();
  }
}

test('E5, task 8: the Results page\'s Arizona card states the enacted rate, the inferred deduction and the age-65 exemption, and no proxy', async () => {
  const cards = await resultsCards({ name: 'Arizona card', setupComplete: true, accounts: [{ type: 'taxable', balance: 500000 }] });
  const card = cards.find((t) => t.startsWith('Arizona estimate:'));
  assert.ok(card, 'the Arizona card is rendered: ' + JSON.stringify(cards.map((t) => t.split(':')[0])));
  assert.doesNotMatch(card, /proxy/i, 'the retired proxy is not described as in use');
  assert.match(card, /2\.5% rate \(ENACTED\)/);
  assert.match(card, /federal AGI less federally taxable Social Security/);
  assert.match(card, /basic standard deduction \(INFERRED until the final Form 140\)/);
  assert.match(card, /\$2,100 for each person 65 or older \(ENACTED\)/);
});

test('control, E5 task 11: the Results page shows the Roth catch-up warning for a 401(k) catch-up over the prior-year FICA threshold', async () => {
  const cards = await resultsCards({
    name: 'Roth catch-up', setupComplete: true,
    profile: { age: 55, retireAge: 65, endAge: 58, spouseOn: false, filing: 'single' },
    employment: { salary: 200000, spouseSalary: 0, contributionStop: 65 },
    accounts: [{ id: 'k401', name: 'Employer 401k', owner: 'self', type: 'traditional401k', taxClass: 'preTax', balance: 100000, contribution: 32000, contributionMode: 'amount', priorYearFicaWages: 200000 }],
  });
  assert.ok(cards.some((t) => /catch-up contributions must be designated Roth/.test(t)), 'the warning is rendered: ' + JSON.stringify(cards.map((t) => t.slice(0, 90))));
});

/* S5AA exit gate E14 / task 7.6: WHERE AN ENGINE DISCLOSURE ACTUALLY GOES, which turned out not to be
   the Results page. E14 asks that every changed disclosure be read RENDERED. Task 7.6 did that for the
   Rules page (tests/rendered-rule-disclosures.test.js), and the attempt to do the same for F-02's and
   X01's disclosures found the reason it could not be done:

   THE APP RENDERS EXACTLY ONE ENGINE ISSUE CODE. `src/app-shell.html` walks `result.issues` in one
   place and builds a card for `RETIREMENT_STRATEGY_UNRECOGNIZED` alone. Every other code recordIssue()
   writes -- including all nine S5AA added, and the ones S4 and S5 added before them -- reaches the
   result object and stops there. A household never sees it.

   THAT IS A FINDING, NOT A THING TO FIX HERE. Surfacing them is feature work and a product decision
   about which of forty-odd codes a user should be shown and how; ground rule 12 puts it outside this
   sprint, and it is recorded in the close record with what it blocks. What this file can do is PIN THE
   STATE, so the day someone wires the rest up, this test is what tells them the ground moved. */

/* S5AA R49 (the owner's AA1 decisions, 2026-10-03: "hidden engine warnings shown as cards"): the ground moved, as the note above
   said it would. The page now shows the engine's disclosures as cards (planWarningTitles), these three among them, so the test that
   pinned their absence now holds their presence. */
test("E14, S5AA R49: the Results page renders the engine's disclosures, S5AA's included", async () => {
  /* The household below raises three engine disclosures at once -- the survivor filing transition, the
     revolving-debt minimum and the ARM recast -- and now reads all three. */
  const cards = await resultsCards({
    name: 'Three disclosures', setupComplete: true,
    profile: { age: 70, retireAge: 70, endAge: 80, spouseOn: true, spouseAge: 70, filing: 'mfj' },
    assumptions: { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 },
    employment: { salary: 0, spouseSalary: 0 },
    retirement: { strategy: 'fixedNominal', spending: 120000, selfLife: 95, spouseLife: 75 },
    accounts: [{ id: 'pre', name: 'Pension pot', owner: 'self', type: 'traditional401k', taxClass: 'preTax', balance: 4000000 }],
    advanced: {
      debts: [
        { id: 'card', name: 'Credit card', type: 'creditCard', owner: 'household', rateType: 'fixed',
          rate: 20, balance: 10000, paymentMonthly: 0, extraPrincipalMonthly: 0, payoffAge: 90 },
        { id: 'arm', name: 'Adjustable mortgage', type: 'mortgage', owner: 'household', rateType: 'adjustable',
          rate: 3, resetRate: 7, nextRateResetAge: 74, balance: 200000, paymentMonthly: 1000, payoffAge: 90 },
      ],
    },
  });
  const all = cards.join(' || ');
  for (const [phrase, what] of [
    [/taxed as SINGLE/, 'F-02, the survivor filing transition'],
    [/REVOLVING balance/, 'X01, the revolving-debt minimum'],
    [/re-amortis/i, 'task 5.1, the ARM recast'],
  ]) {
    assert.match(all, phrase, what + ' is rendered');
  }
  assert.ok(cards.some((t) => /^Survivor's filing status:/.test(t)) && cards.some((t) => /^Credit card minimum payment:/.test(t)) &&
    cards.some((t) => /^Adjustable-rate loan:/.test(t)), 'each under its own title: ' + JSON.stringify(cards.map((t) => t.split(':')[0])));
});

test('E14, S5AA: the one engine issue code the page does render still renders', async () => {
  /* The control that gives the test above its meaning: the walk over `result.issues` exists and works,
     so "not rendered" is a statement about which codes it carries, not about a broken page. */
  const cards = await resultsCards({
    name: 'Unrecognized strategy', setupComplete: true,
    profile: { age: 60, retireAge: 60, endAge: 70, spouseOn: false, filing: 'single' },
    retirement: { strategy: 'not-a-real-strategy', spending: 40000 },
    accounts: [{ id: 'cash', name: 'Brokerage', owner: 'self', type: 'brokerage', taxClass: 'taxable', balance: 900000 }],
  });
  assert.ok(cards.some((t) => /strateg/i.test(t)),
    'the one wired code reaches the page: ' + JSON.stringify(cards.map((t) => t.slice(0, 60))));
});
