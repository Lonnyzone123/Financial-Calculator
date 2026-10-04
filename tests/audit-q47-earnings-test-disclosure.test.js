/* Q47 -- the Social Security earnings test was presented as applied, and it
 * is not.
 *
 * findingIds: Q47
 *
 * The rules page rendered "The earnings-test amounts are $24,480 below full
 * retirement age and $65,160 in the year full retirement age is reached"
 * with no caveat, beside two neighbours on the same page that each say what
 * the package does NOT do (the senior deduction, the Roth catch-up rule).
 * engine.js never references earningsTest, underFRA or fraYear.
 *
 * HISTORY, KEPT BECAUSE IT EXPLAINS THE SHAPE OF THIS FILE. Q47's repair was
 * candidate (b) -- disclose the omission honestly rather than implement it --
 * decided by the owner on 2026-09-13 as "leave disclosed-only". So this file was
 * written TWO-SIDED on purpose: the rules page had to carry the caveat, AND
 * the engine had to still pay the benefit in full, because a disclosure is a
 * claim about the engine and is only honest while the engine behaves as it
 * says. Its header said, in as many words: "If someone implements the
 * earnings test, (2) fails and forces the caveat to be revisited, instead of
 * leaving a disclosure that has quietly become false in the other direction."
 *
 * THAT IS EXACTLY WHAT HAPPENED, AND THE TRIPWIRE DID ITS JOB. S5AA task 4.6
 * (Q91, F5 and N3) implements the earnings test, which supersedes Q47's
 * 2026-09-13 decision on the later authority of the S5AA checklist. Both
 * sides are therefore INVERTED here, and neither is loosened: the page must
 * now say the test IS applied and say how, and the engine must now withhold.
 * The pairing is the point and it survives intact -- a page that went back to
 * promising nothing is withheld would fail side 1, and an engine that stopped
 * withholding would fail side 2.
 */
'use strict';
const { retireAtEnd } = require('./lib/working-horizon'); // S5AA R53 (the owner's decision 3, 2026-10-04): working-only horizons

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

/* ---- 1. the disclosure, read from a real build ---- */

/* Through a SCRATCH BUILD. tests/lib/harness.js's loadCalculator() boots the
   pinned investment-calculator-v2c.html, which is stale by design and never
   rebuilt -- a disclosure test run through it would read the old sentence
   whatever src/app-shell.html says. */
const { JSDOM } = require('jsdom');
const { build } = require(path.join(ROOT, 'build.js'));
const { tick } = require('./lib/harness');

let scratch = null;
test.after(() => { if (scratch) fs.rmSync(scratch, { recursive: true, force: true }); });

async function socialSecurityParagraphs() {
  scratch = scratch || fs.mkdtempSync(path.join(os.tmpdir(), 'q47-rules-'));
  const { output } = build(path.join(scratch, 'app.html'));
  const dom = new JSDOM(output, { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
  /* Keyed off the app root id, not "the first non-JSON script" -- that
     predicate selects the PWA bootstrap (see tests/lib/worker-source.js). */
  const mainScript = Array.from(dom.window.document.querySelectorAll('script'))
    .find((el) => el.getAttribute('type') !== 'application/json'
      && el.textContent.includes('investment-calculator-v2c'));
  assert.ok(mainScript, 'could not find the app script in the scratch build');
  dom.window.eval(mainScript.textContent);
  await tick(dom.window);
  const card = Array.from(dom.window.document.querySelectorAll('details.v2-card'))
    .find((d) => { const s = d.querySelector('summary'); return s && s.textContent.trim() === 'Social Security'; });
  return card ? Array.from(card.querySelectorAll('p')).map((p) => p.textContent) : null;
}

test('Q47 disclosure: the earnings-test sentence says what the test now does', async () => {
  const paragraphs = await socialSecurityParagraphs();
  assert.ok(paragraphs && paragraphs.length,
    'the Social Security rules section must render -- if it is not found, nothing below is measured');
  const sentence = paragraphs.find((t) => /earnings-test amounts/.test(t));
  assert.ok(sentence, 'the earnings-test disclosure must still be present');
  assert.ok(!/does not apply the earnings test/.test(sentence),
    'the page said the test was not applied; S5AA task 4.6 applies it, and the page must not still say so');
  assert.ok(!/nothing withheld/.test(sentence),
    'nor may it still promise that nothing is withheld');
  assert.match(sentence, /reduced by \$1 for every/,
    'it must state the withholding, which is the behaviour it is now a claim about');
  assert.match(sentence, /permanently increased/,
    'and that withheld benefits are not lost but raise the benefit at full retirement age');
});

/* ---- 2. the engine fact the disclosure asserts ---- */

/* Claim at 62 against a full retirement age of 67, one year, no returns or
   inflation or COLA. Two arms identical except for salary. */
function claimWhileWorking(salary) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { returnRate: 0, inflation: 0, method: 'simple', volatility: 0 });
  Object.assign(p.profile, { age: 62, retireAge: 70, endAge: 64 });
  Object.assign(p.employment, { salary, contributionStop: 70 });
  Object.assign(p.retirement, { ssBenefit: 2500, ssClaim: 62, ssFra: 67, ssCola: 0 });
  p.accounts = [{
    id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 500000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  retireAtEnd(p); // S5AA R53: an end age before the retirement age is refused; the owner retires at the end age instead (output-neutral, tests/lib/working-horizon.js)
  const out = engine.runPlan(p);
  assert.equal(out.status, 'ok', `salary ${salary}: the fixture must run`);
  const row = out.rows.find((r) => r.age >= 62.5);
  assert.ok(row, `salary ${salary}: no row after the claim age`);
  return row.income;
}

test('Q47 engine: a working claimant below full retirement age now has the benefit withheld', () => {
  const benefitOnly = claimWhileWorking(0);
  const withWages = claimWhileWorking(120000);

  /* The same control as before, and for the same reason: without it the next
     assertion holds trivially when Social Security pays nothing at all.
     $2,500/month claimed five years early is $21,000/year. */
  assert.ok(Math.abs(benefitOnly - 21000) < 1,
    `the benefit must actually be paid for this to measure anything (got ${benefitOnly})`);

  /* $120,000 of wages is $95,520 over the $24,480 exempt amount, so $47,760
     would be withheld -- more than twice the whole $21,000 benefit. The
     benefit goes to nothing, and the two arms differ by the salary MINUS the
     benefit that is no longer paid. */
  assert.ok(Math.abs((withWages - benefitOnly) - (120000 - 21000)) < 1,
    'the earnings test must take the whole benefit here; if the two arms differ by the salary alone, '
    + 'nothing was withheld and the rules page above has become false again. '
    + `got ${withWages - benefitOnly}, expected ${120000 - 21000}`);
});
