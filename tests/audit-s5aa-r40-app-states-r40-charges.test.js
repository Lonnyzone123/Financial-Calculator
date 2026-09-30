/* S5AA R40 (the audit of PR #35, P3) -- THE APP SAYS WHAT R40 CHARGES, READ AS IT RENDERS.
 *
 * R40 charges each person on Medicare the Part D base beneficiary premium (d1572b1) and grows the long-term-care cost at the plan's
 * healthcare inflation (8f20d90). The audit found the app named neither: the Rules page's Medicare section stated only the Part B
 * premium and deductible, and the form's "Healthcare inflation" and "Annual care cost" said nothing of the care cost's growth. The owner
 * has said the UI will be rebuilt with this one as its reference, so these are wording only; they are read here as the page renders them
 * (exit gate E14). */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadCalculator } = require('./lib/harness');

test('R40: the Rules page names the Part D base premium, and the form says the care cost is in today\'s dollars and grows', async () => {
  const dom = await loadCalculator();
  const doc = dom.window.document;
  try {
    const host = doc.getElementById('v2-rule-sections');
    assert.ok(host, 'the Rules page has its sections host');
    const text = [...host.querySelectorAll('details p')].map((p) => p.textContent).join('\n');
    assert.match(text, /Each person on Medicare also pays the Part D base beneficiary premium, \$38\.99 per month/);
    const label = (id) => doc.getElementById(id).closest('label').textContent.trim();
    assert.match(label('v2-health-inflation'), /^Healthcare inflation \(also grows the care cost\)/);   // the field's unit follows
    assert.match(label('v2-ltc-cost'), /^Annual care cost \(today's dollars\)/);
  } finally {
    dom.window.close();
  }
});
