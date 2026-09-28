/* S5AA R9 round, DeepSeek audit finding 2f/01 (reproduced at 623cf64): THE VALIDATOR TYPE-CHECKS THE DIVIDEND FIELDS.
 *
 * retirement.dividendQualified had only a RANGE check, and checkRange() skips a value that is not a number, so "abc" or
 * true passed the validator with no issue at all -- and the engine then failed with TAX_QUOTE_NONFINITE_CONTEXT, a code
 * naming a symptom. Found while repairing it: dividendYield, dividendGrowth and dividendStart had no check of any kind,
 * with the same result. Each is now WRONG_TYPE (ERROR) at its path when present and not a finite number. Absent stays
 * accepted (the normalizer fills them).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);
const FIELDS = ['dividendQualified', 'dividendYield', 'dividendGrowth', 'dividendStart'];

function issuesAt(field, value) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  if (value === undefined) delete p.retirement[field]; else p.retirement[field] = value;
  return validateScenario(p).issues.filter((i) => i.path === 'retirement.' + field);
}

test('finding 2f/01: a non-number dividend field is WRONG_TYPE, an ERROR, at its path', () => {
  for (const field of FIELDS) {
    for (const value of ['abc', '85', true, null, {}, Infinity]) {
      const issues = issuesAt(field, value);
      assert.ok(issues.some((i) => i.code === 'WRONG_TYPE' && i.severity === 'ERROR'), field + ' = ' + String(value));
    }
  }
});

test('finding 2f/01 control: a finite number, or an absent field, raises no type error', () => {
  for (const field of FIELDS) {
    assert.ok(!issuesAt(field, 50).some((i) => i.code === 'WRONG_TYPE'), field + ' = 50');
    assert.ok(!issuesAt(field, undefined).some((i) => i.code === 'WRONG_TYPE'), field + ' absent');
  }
});
