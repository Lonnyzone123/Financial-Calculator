/* S5AA R9 round, the owner's decision 12 (2026-09-21): THE VALIDATOR RESTRICTS AN ACCOUNT'S OWNER BY THE ACCOUNT'S TYPE.
 *
 * Found in the R7-03C inventory: the validator accepted any string as accounts[].owner, while the engine reads every
 * value but "spouse" as the primary person's. So a typo ("Spouse", "wife") silently moved an account -- its
 * contributions, its required distributions, its succession at a death -- to the other person, and a "joint" IRA, 401(k)
 * or HSA (an arrangement the law does not have: each is one individual's account) reached the engine, which can only
 * disclose it as unsupported (R7-03).
 *
 * The rule is the app's own: an account in a contribution-limit group (traditional or Roth IRA, traditional or Roth
 * 401(k), HSA) is owned by "self" or "spouse"; a taxable or custom account may also be "joint". Anything else is an
 * ERROR, INVALID_ACCOUNT_OWNER. An absent owner stays accepted: normalizeAccount() fills "self", which the lenient
 * missing-field posture already allows.
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

const TAX_CLASS = { taxable: 'taxable', customTaxable: 'taxable', customTraditional: 'preTax', customRoth: 'roth',
  traditionalIRA: 'preTax', rothIRA: 'roth', traditional401k: 'preTax', roth401k: 'roth', hsa: 'hsa' };
function ownerIssues(type, owner) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { spouseOn: true, spouseAge: 40, filing: 'mfj' });
  const a = { id: 'a1', name: 'a1', type, taxClass: TAX_CLASS[type], balance: 1000, basisPct: 100, contribution: 0, priority: 1 };
  if (owner !== undefined) a.owner = owner;
  p.accounts = [a];
  return validateScenario(p).issues.filter((i) => /owner/.test(i.path));
}

test('decision 12: "self" and "spouse" are accepted on every account type, and an absent owner is accepted', () => {
  for (const type of Object.keys(TAX_CLASS)) {
    for (const owner of ['self', 'spouse', undefined]) assert.deepEqual(ownerIssues(type, owner), [], type + ' / ' + owner);
  }
});

test('decision 12: "joint" is accepted on taxable and custom accounts, as the app offers it', () => {
  for (const type of ['taxable', 'customTaxable', 'customTraditional', 'customRoth']) assert.deepEqual(ownerIssues(type, 'joint'), [], type);
});

test('decision 12: "joint" is an ERROR on an IRA, a 401(k) or an HSA -- each is one individual\'s account', () => {
  for (const type of ['traditionalIRA', 'rothIRA', 'traditional401k', 'roth401k', 'hsa']) {
    const issues = ownerIssues(type, 'joint');
    assert.equal(issues.length, 1, type);
    assert.equal(issues[0].code, 'INVALID_ACCOUNT_OWNER');
    assert.equal(issues[0].severity, 'ERROR');
    assert.equal(issues[0].path, 'accounts[0].owner');
  }
});

test('decision 12: an unknown owner value is an ERROR, not read silently as "self"', () => {
  for (const owner of ['Spouse', 'wife', 'household', '', 7, null]) {
    const issues = ownerIssues('taxable', owner);
    assert.equal(issues.length, 1, JSON.stringify(owner));
    assert.equal(issues[0].code, 'INVALID_ACCOUNT_OWNER');
    assert.equal(issues[0].severity, 'ERROR');
  }
});
