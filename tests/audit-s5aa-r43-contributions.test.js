/* S5AA R43 (the owner 2026-09-30: repair all 34 of Claude's R42F findings, and rule on three declared items) -- CONTRIBUTIONS.
 *
 * The owner's ruling, the spousal IRA (R42F section 4), MEASURED at c67c713: on a joint return either spouse drew on the couple's
 * pooled pay, so the higher earner ($4,000 against $3,000) deposited $7,000. IRC 219(c)(1)(B) and (c)(2) give the spousal rule only
 * to the spouse whose compensation is LESS: the higher earner is held to their own pay; the lower earner to their own pay plus the
 * other's, less the other's IRA contributions.
 *
 * The owner's ruling, HSA contributions past 65: they stop at the owner's 65th birthday (the model assumes Medicare enrollment
 * then; 223(b)(7) makes the limit zero for a month of Medicare entitlement).
 *
 * SA42F-12: employer money was not held to 100% of pay (415(c)(1)(B)). SA42F-13: a deceased owner's unvested employer money was
 * forfeited at the survivor's retirement. SA42F-14: the form's dated presets put a spouse's account on the primary person's clock.
 * SA42F-15: the shared HSA family limit was used up at an owner's annual rate, not in dollars. SA42F-24: the app's limit cards
 * dropped the spousal IRA window. SA42F-25: a contribution change dated inside a row started at the next row. All MEASURED at c67c713.
 *
 * Rows are labelled by their closing age. Every expected figure is hand-derived from the rules and the inputs.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R42F', 'SA42F', 'CONTRIB', 'lib.js'));
const { acct, work } = C;

function run(p) {
  assert.equal(C.h.validateScenario(structuredClone(p)).valid, true);
  const r = C.h.engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  return r;
}
const deposits = (r, i, key) => r.rows[i][key] - r.rows[i - 1][key];

// The spousal IRA: both 45, retiring at 46, a joint return; self and spouse IRAs requested in priority order.
// The spouse's IRA is a Roth, so the two owners' deposits show apart (pre-tax against Roth).
function iraCouple(salary, spouseSalary, selfAsk, spouseAsk) {
  return work({ age: 45, couple: true, spouseAge: 45, retireAge: 46, endAge: 46, salary, spouseSalary,
    accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('iraS', 'traditionalIRA', 0, { contribution: selfAsk, priority: 1 }),
      acct('iraP', 'rothIRA', 0, { owner: 'spouse', contribution: spouseAsk, priority: 2 })] });
}

test('R43 (owner ruling, spousal IRA): the higher earner is held to their own $4,000 of pay', () => {
  assert.equal(run(iraCouple(4000, 3000, 7500, 0)).rows[1].preTax, 4000);
});

test('R43 (owner ruling, spousal IRA): the lower earner may use $3,000 plus the higher earner\'s $4,000', () => {
  assert.equal(run(iraCouple(3000, 4000, 7500, 0)).rows[1].preTax, 7000);
});

test('R43 (owner ruling, spousal IRA): both contribute -- the higher takes $4,000, the lower $3,000 + ($4,000 - $4,000)', () => {
  const higherSelf = run(iraCouple(4000, 3000, 7500, 7500)).rows[1];
  assert.deepEqual([higherSelf.preTax, higherSelf.roth], [4000, 3000]);
  // the self is lower: the spouse is held to their own 4,000, and the self has 3,000 + (4,000 - 4,000)
  const lowerSelf = run(iraCouple(3000, 4000, 7500, 7500)).rows[1];
  assert.deepEqual([lowerSelf.preTax, lowerSelf.roth], [3000, 4000]);
});

test('R43 (owner ruling, spousal IRA) control: a non-working spouse still uses the worker\'s pay', () => {
  assert.equal(run(iraCouple(10000, 0, 0, 7500)).rows[1].roth, 7500);
});

// HSA past 65.
test('R43 (owner ruling, HSA at 65): the spouse turns 65 halfway through the row -- half the year\'s contribution, then none', () => {
  const p = work({ age: 60, couple: true, spouseAge: 64.5, retireAge: 70, endAge: 63, salary: 100000, spouseSalary: 100000,
    accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('hsaP', 'hsa', 0, { owner: 'spouse', contribution: 4000, priority: 1 })] });
  const r = run(p);
  assert.equal(deposits(r, 1, 'hsa'), 2000);   // 60 to 61: the spouse 64.5 to 65.5, eligible until 65
  assert.equal(deposits(r, 2, 'hsa'), 0);
  assert.equal(deposits(r, 3, 'hsa'), 0);
});

test('R43 (owner ruling, HSA at 65) control: an owner of 63 contributes the full year', () => {
  const p = work({ age: 63, retireAge: 70, endAge: 65, salary: 100000, accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('hsa', 'hsa', 0, { contribution: 4000, priority: 1 })] });
  const r = run(p);
  assert.equal(deposits(r, 1, 'hsa'), 4000);    // 63 to 64
  assert.equal(deposits(r, 2, 'hsa'), 4000);    // 64 to 65: 65 is reached at the row's close
});

// SA42F-12: salary $30,000.
function k415(k, salary = 30000) {
  return work({ age: 45, salary, retireAge: 46, endAge: 46, accounts: [acct('brok', 'taxable', 0), acct('k', 'traditional401k', 0, k)] });
}
test('R43 (SA42F-12): a $24,500 deferral and 25% profit sharing on $30,000 of pay -- additions held to $30,000', () => {
  assert.equal(run(k415({ contribution: 24500, profitShare: 25 })).rows[1].preTax, 30000);
});
test('R43 (SA42F-12): a $20,000 deferral with a 100% match up to 100% of pay -- the match held to $10,000', () => {
  assert.equal(run(k415({ contribution: 20000, matchOn: true, matchRate: 100, matchCap: 100 })).rows[1].preTax, 30000);
});
test('R43 (SA42F-12) control: on $60,000 of pay the 25% profit sharing of $15,000 is paid in full', () => {
  assert.equal(run(k415({ contribution: 24500, profitShare: 25 }, 60000)).rows[1].preTax, 24500 + 15000);
});

// SA42F-13: the owner dies at 47; the spouse retires with the household at 50.
function vest(selfLife) {
  return work({ age: 45, couple: true, spouseAge: 45, retireAge: 50, stop: 50, endAge: 52, salary: 100000, spouseSalary: 50000, selfLife,
    accounts: [acct('brok', 'taxable', 0), acct('k', 'traditional401k', 0, { contribution: 10000, matchOn: true, matchRate: 100, matchCap: 10, vesting: 0, yearsOfService: 0 })] });
}
test('R43 (SA42F-13): a death before separation forfeits nothing -- the survivor keeps the $40,000 at the household\'s retirement', () => {
  const r = run(vest(47));
  // two working rows: $10,000 of deferral and $10,000 of match in each
  for (const age of [48, 49, 50, 51, 52]) assert.equal(r.rows.find((x) => x.age === age).preTax, 40000, 'row ' + age);
});

// SA42F-14: the form's preset, run from the app's own source.
test('R43 (SA42F-14): "Increase 25% in five years" on a spouse\'s account is dated on the spouse\'s clock', () => {
  const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
  const grab = (name) => { const i = shell.indexOf('function ' + name + '('); let d = 0; const j = shell.indexOf('{', i);
    for (let k = j; k < shell.length; k++) { if (shell[k] === '{') d++; else if (shell[k] === '}') { d--; if (d === 0) return shell.slice(i, k + 1); } } return null; };
  let PLAN;
  const apply = new Function('plan', 'contributionSignature', grab('half') + '\n' + grab('applyContributionPreset') + '\nreturn applyContributionPreset;')(() => PLAN, () => 'sig');
  for (const spouseAge of [53, 40]) {
    const a = acct('k', 'traditional401k', 0, { owner: 'spouse', contribution: 10000, contributionPreset: '25in5' });
    PLAN = work({ age: 45, couple: true, spouseAge, retireAge: 65, endAge: 65, salary: 0, spouseSalary: 100000, accounts: [acct('brok', 'taxable', 0), a] });
    apply(a);
    assert.deepEqual(a.futureChanges, [{ age: spouseAge + 5, mode: 'percent', value: 25 }]);
  }
  // and the primary person's own account keeps the primary person's clock
  const own = acct('k2', 'traditional401k', 0, { contribution: 10000, contributionPreset: 'double10' });
  PLAN = work({ age: 45, couple: true, spouseAge: 53, retireAge: 65, endAge: 65, salary: 100000, accounts: [own] });
  apply(own);
  assert.deepEqual(own.futureChanges, [{ age: 55, mode: 'percent', value: 100 }]);
});

// SA42F-15: the spouse's window is half the row, the self's the whole row; both ask the $8,750 family limit.
test('R43 (SA42F-15): the family HSA limit is shared in dollars, whatever the account order', () => {
  for (const spouseFirst of [true, false]) {
    const p = work({ age: 44, couple: true, spouseAge: 45, retireAge: 45.5, stop: 70, endAge: 46, salary: 100000, spouseSalary: 100000,
      accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('hsaSpouse', 'hsa', 0, { owner: 'spouse', contribution: 8750, priority: spouseFirst ? 1 : 2 }),
        acct('hsaSelf', 'hsa', 0, { contribution: 8750, priority: spouseFirst ? 2 : 1 })] });
    const row = run(p).rows[1];
    // whichever goes first, the household deposits the $8,750 family limit and the other $4,375 asked for is redirected
    assert.equal(row.hsa, 8750, spouseFirst ? 'spouse first' : 'self first');
    assert.equal(row.taxable, 4375, spouseFirst ? 'spouse first' : 'self first');
  }
});

// SA42F-24: the app's limit cards read the same window the projection uses.
test('R43 (SA42F-24): the app checks contribution limits with the spousal IRA window', () => {
  const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
  assert.ok(shell.includes('auditContributions(p,p.profile.age,p.employment.salary,p.employment.spouseSalary,ownerContributionWindow(p,p.profile.age,p.profile.spouseAge,1))'), 'the card call reads the window');
  assert.ok(!/auditContributions\([^)]*ownerContributionEligibility\(/.test(shell), 'no card call reads the eligibility booleans');
  // the projection the card now matches: a non-working spouse's $10,000 IRA on the worker's pay -- $7,500 plus the $1,100 catch-up
  // (66 at the row's close), the other $1,400 redirected
  const p = work({ age: 55, couple: true, spouseAge: 66, retireAge: 65, stop: 70, endAge: 65, salary: 100000, spouseSalary: 0,
    accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('iraP', 'traditionalIRA', 0, { owner: 'spouse', contribution: 10000, priority: 1 })] });
  const row = run(p).rows[1];
  assert.equal(row.preTax, 8600);
  assert.equal(Math.round(row.taxable), 1400);
});

// SA42F-25: "set to $0 at 46.5" on a $10,000 401(k).
test('R43 (SA42F-25): a change dated halfway through a row applies to that half -- $5,000 in the row closing at 47', () => {
  const p = work({ age: 45, salary: 100000, retireAge: 65, endAge: 65,
    accounts: [acct('brok', 'taxable', 0), acct('k', 'traditional401k', 0, { contribution: 10000, futureChanges: [{ age: 46.5, mode: 'set', value: 0 }] })] });
  const r = run(p);
  assert.equal(deposits(r, 1, 'preTax'), 10000);
  assert.equal(deposits(r, 2, 'preTax'), 5000);
  assert.equal(deposits(r, 3, 'preTax'), 0);
});

test('R43 (SA42F-25) control: a change dated on a row boundary is unchanged', () => {
  const p = work({ age: 45, salary: 100000, retireAge: 65, endAge: 65,
    accounts: [acct('brok', 'taxable', 0), acct('k', 'traditional401k', 0, { contribution: 10000, futureChanges: [{ age: 47, mode: 'set', value: 0 }] })] });
  const r = run(p);
  assert.equal(deposits(r, 2, 'preTax'), 10000);
  assert.equal(deposits(r, 3, 'preTax'), 0);
});

test('R43 (owner rulings): the methodology page states the spousal IRA rule and the HSA stop at 65', () => {
  const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
  assert.match(shell, /the spouse who earns more is limited to their own pay/);
  assert.match(shell, /Contributions stop at each person’s 65th birthday/);
});
