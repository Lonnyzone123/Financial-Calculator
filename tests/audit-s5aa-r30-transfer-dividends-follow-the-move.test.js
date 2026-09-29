/* S5AA R30: A TRANSFER'S DIVIDENDS FOLLOW THE DOLLARS THAT ACTUALLY MOVE, AND EACH ACCOUNT PAYS ITS OWN (ChatGPT's R29 change
 * audit of aaff3f1, R29-01, P1; the owner 2026-09-28: "Repair in R30", with three decisions beside it, below).
 *
 * R29-01: a transfer dated after the year's spending draw is run after it, so the year's dividends -- figured before the draw,
 * because they help pay for it -- read the transfer from a preview: the amount asked, at most what the source held. R29 capped
 * the transfer itself at the year's contribution room but not the preview, so a transfer that moved $0 still took the asked
 * dollars out of the source's dividend base for the rest of the year. ChatGPT's witness: $50,000 taxable -> Roth IRA at 60.75,
 * no compensation, 10% yield, a $50,000 pension: $3,750 of dividends where $5,000 is right, $31.25 of tax missing. Now the
 * preview and the transfer ask one question -- transferAllowed() -- so a refusal or the room binds both.
 *
 * Found in passing (R28.1; the owner: "Repair in R30"): the same late preview had the DESTINATION paid for the rest of the year
 * on the asked dollars before they arrived, and what it did not hold was paid out of the SOURCE. $50,000 of a $100,000 IRA moved
 * into taxable at 60.75 left the IRA with $48,750: $1,250 of IRA money left as a taxable account's dividends, never taxed as a
 * distribution. The destination's dividends after the date are now figured AFTER the transfer, on what moved, and paid by the
 * destination; they arrive after the year's draw, so they are surplus cash like any other.
 *
 * The mirror (the owner: "Repair in R30"): a transfer BEFORE the draw that emptied a taxable source had the source's dividends
 * before the date paid by the destination -- an IRA paying a taxable account's dividends. Each account now pays its own, so a
 * taxable source can move only what is left after its dividends.
 *
 * "Protect the transfer" (the owner, on the case the preview could not see): a late transfer's dollars are held back from the
 * year's spending draw, which runs first, so the draw cannot spend what the dividends were figured on the transfer moving.
 *
 * THE DIVIDEND CONVENTION these figures follow is the engine's: an account's dividends are yield x the dollars it holds when
 * they are figured x the part of the year it holds them, and a dividend paid out does not shrink the base it was figured on
 * (a $50,000 account at 10% pays $5,000 in a year). So a taxable source holding B, moving m, pays
 *     y x ((B - m) x paid part of the year + m x paid part before the date)
 * and can move only what is left after paying it: m <= B - that. Where the whole balance is asked, m solves the equality.
 *
 * Every plan is one year, 60 to 61, single, 0% returns and inflation, $100,000 of cash that pays no dividends, dividends fully
 * qualified, and every figure below is worked by hand in its test.
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

const CLASS = { taxable: 'taxable', traditionalIRA: 'preTax', traditional401k: 'preTax', rothIRA: 'roth', roth401k: 'roth', hsa: 'hsa' };
function account(id, type, balance, extra) {
  return Object.assign({ id, name: id, type, taxClass: CLASS[type], owner: 'self', balance, basisPct: type === 'taxable' ? 100 : 0,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: { flat: 100 }, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
    priority: id === 'cash' ? 0 : 2 }, extra || {});
}
/* The plan ChatGPT's R29 repro builds (audit/S5AA/R29/S5AA_R29_EXTERNAL_AUDIT_REPRO_20260928.js), with the knobs these tests
   turn: `src` moves `amount` into `dst` at `at`. */
function plan(o) {
  const x = Object.assign({ from: 'taxable', to: 'rothIRA', balance: 50000, amount: 50000, at: 60.75, pension: 0, yieldRate: 10,
    dividendStart: 60, policy: 'redirect', timing: 'monthly', wages: 0, spending: 0, order: 'taxable,roth,preTax,hsa', cash: 100000 }, o);
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.limitPolicy = x.policy;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 61, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: x.timing });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 62 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: x.spending, dividendOn: true, dividendYield: x.yieldRate,
    dividendQualified: 100, dividendGrowth: 0, dividendStart: x.dividendStart, pension: x.pension, pensionCola: 0, ssBenefit: 0,
    spouseSS: 0, survivor: false, stages: [], expenses: [], withdrawalOrder: 'manual', manualOrder: x.order,
    otherIncomes: x.wages ? [{ name: 'Wages', type: 'employment', owner: 'self', amount: x.wages, start: 60, end: 61, growth: 0, growthMode: 'fixed' }] : [] });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, ltcOn: false, networthOn: true, otherAssets: [], debts: [],
    assetsOn: true, assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }], rule55: false, penaltyException: false,
    transferOn: true, transferFrom: 'src', transferTo: 'dst', transferAmount: x.amount, transferAge: x.at });
  p.accounts = [account('src', x.from, x.balance), account('dst', x.to, 0)];
  if (x.cash) p.accounts.unshift(account('cash', 'taxable', x.cash, { cashHolding: true, allocation: {} }));
  if (x.ira) p.accounts.push(account('ira', 'traditionalIRA', x.ira, { priority: 3 }));
  return p;
}
function run(p, opts) {
  if (!(opts && opts.unvalidated)) {
    const v = validateScenario(JSON.parse(JSON.stringify(p)));
    assert.equal(v.valid, true, JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  }
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.deepEqual((r.issues || []).filter((i) => i.severity === 'ERROR').map((i) => i.code), [], 'no ERROR issue');
  return r;
}
const last = (r) => r.rows[r.rows.length - 1];
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);
const FIELDS = ['dividends', 'federalAgi', 'taxes', 'total', 'taxable', 'preTax', 'roth', 'hsa', 'withdrawals'];
function sameAsNoTransfer(p, what, opts) {
  const moved = last(run(p, opts));
  const off = JSON.parse(JSON.stringify(p));
  off.advanced.transferOn = false;
  const none = last(run(off, opts));
  for (const k of FIELDS) near(moved[k], none[k], what + ' -- ' + k);
}

test('R29-01 WITNESS: $50,000 taxable -> Roth IRA at 60.75 with no compensation moves $0, and the year is the year without it', () => {
  // $50,000 x 10% x 1 = $5,000 of dividends; AGI $55,000. Federal on the $50,000 pension: $12,400 x 10% + $21,500 x 12% = $3,820
  // (the dividends sit in the 0% band); state ($55,000 - $16,100) x 2.5% = $972.50; tax $4,792.50. Net worth $100,000 + $50,000
  // + $50,000 + $5,000 - $5,000 paid out and kept - $4,792.50 = $195,207.50.
  const r = last(run(plan({ pension: 50000 })));
  near(r.roth, 0, 'nothing reaches the Roth IRA');
  near(r.dividends, 5000, 'dividends');
  near(r.federalAgi, 55000, 'AGI');
  near(r.taxes, 4792.5, 'tax');
  near(r.total, 195207.5, 'net worth');
});

test('R29-01: a late transfer that moves nothing is the year without it -- every cause, paid and reinvested, monthly and quarterly', () => {
  for (const timing of ['monthly', 'quarterly']) {
    for (const dividendStart of [60, 65]) {
      const tag = timing + ', dividends ' + (dividendStart === 60 ? 'paid' : 'reinvested');
      sameAsNoTransfer(plan({ pension: 50000, timing, dividendStart }), 'no room (' + tag + ')');
      sameAsNoTransfer(plan({ pension: 50000, timing, dividendStart, balance: 0 }), 'an empty source (' + tag + ')');
      /* The validator refuses both of these plans; the engine defends itself the same way. */
      sameAsNoTransfer(plan({ pension: 50000, timing, dividendStart, to: 'traditional401k' }), 'into a 401(k), refused (' + tag + ')', { unvalidated: true });
      sameAsNoTransfer(plan({ pension: 50000, timing, dividendStart, from: 'traditionalIRA', to: 'roth401k', order: 'taxable,preTax,roth,hsa' }),
        'a traditional IRA into a Roth 401(k), refused (' + tag + ')', { unvalidated: true });
    }
  }
});

test('R29-01 PARTIAL ROOM: $3,000 of wages lets $3,000 of $50,000 reach the Roth IRA at 60.75, and only that leaves the dividend base', () => {
  // Room: min($7,500 + $1,100 catch-up, $3,000 of compensation) = $3,000. Dividends: $50,000 x 10% x 0.75 before the date +
  // $47,000 x 10% x 0.25 after = $3,750 + $1,175 = $4,925. Paid out, they leave $45,075 still holding the $50,000 of basis (a
  // dividend takes no basis), so the $3,000 that moves is sold at a loss: $3,000 x (1 - 50,000/45,075) = -$327.79 (R29 realises
  // what leaves a taxable account for a non-taxable one). AGI $3,000 + $4,925 - $327.79 = $7,597.21, under the $16,100 standard
  // deduction, so the only tax is payroll: $3,000 x 7.65% = $229.50. Net worth $150,000 + $3,000 - $229.50 = $152,770.50.
  const r = last(run(plan({ wages: 3000 })));
  near(r.roth, 3000, 'the room reaches the Roth IRA');
  near(r.dividends, 4925, 'dividends');
  near(r.federalAgi, 3000 + 4925 + 3000 * (1 - 50000 / 45075), 'AGI');
  near(r.taxes, 229.5, 'payroll tax');
  near(r.total, 152770.5, 'net worth');
  // Reinvested, the $4,925 is taxed and kept, so it is basis: $54,925 on $50,000, and the $3,000 moves at a loss of $295.50.
  const reinvested = last(run(plan({ wages: 3000, dividendStart: 65 })));
  near(reinvested.dividends, 0, 'reinvested: nothing paid');
  near(reinvested.federalAgi, 3000 + 4925 - 295.5, 'reinvested: the same $4,925 is taxed');
});

test('FOUND IN PASSING: a late transfer out of an IRA, HSA or Roth IRA into taxable -- the destination pays its own dividends on what moved', () => {
  // $50,000 of $100,000 moves at 60.75. The destination holds it for a quarter: $50,000 x 10% x 0.25 = $1,250, paid by the
  // destination, so the source keeps exactly $50,000.
  for (const [from, field] of [['traditionalIRA', 'preTax'], ['hsa', 'hsa'], ['rothIRA', 'roth']]) {
    const r = last(run(plan({ from, to: 'taxable', balance: 100000, pension: 50000, order: 'taxable,preTax,roth,hsa' })));
    near(r[field], 50000, from + ' keeps what did not move (was $48,750)');
    near(r.dividends, 1250, from + ' -> taxable dividends');
  }
  // The IRA case in full: AGI $50,000 pension + $50,000 distribution + $1,250 = $101,250. Federal: ordinary $100,000 - $16,100 =
  // $83,900: $1,240 + $4,560 + ($83,900 - $50,400) x 22% = $13,170, plus the $1,250 of qualified dividends at 15% = $187.50;
  // state ($101,250 - $16,100) x 2.5% = $2,128.75; tax $15,486.25. Net worth $200,000 + $50,000 - $15,486.25 = $234,513.75.
  const ira = last(run(plan({ from: 'traditionalIRA', to: 'taxable', balance: 100000, pension: 50000, order: 'taxable,preTax,roth,hsa' })));
  near(ira.federalAgi, 101250, 'AGI');
  near(ira.taxes, 15486.25, 'tax');
  near(ira.total, 234513.75, 'net worth');
});

test('FOUND IN PASSING: a late transfer of a WHOLE IRA into taxable is taxed on every dollar that left the IRA', () => {
  // $50,000 moves; it was $48,750, the other $1,250 leaving as dividends. AGI $50,000 + $50,000 + $1,250 = $101,250 (was $100,000).
  for (const dividendStart of [60, 65]) {
    const r = last(run(plan({ from: 'traditionalIRA', to: 'taxable', balance: 50000, pension: 50000, dividendStart, order: 'taxable,preTax,roth,hsa' })));
    near(r.preTax, 0, 'the IRA is empty');
    near(r.federalAgi, 101250, 'AGI, dividends ' + (dividendStart === 60 ? 'paid' : 'reinvested'));
  }
});

test('CONTROL: before the draw the IRA -> taxable split was already right -- $50,000 at 60.25 earns $3,750 in the destination', () => {
  const r = last(run(plan({ from: 'traditionalIRA', to: 'taxable', balance: 100000, pension: 50000, at: 60.25, order: 'taxable,preTax,roth,hsa' })));
  near(r.preTax, 50000, 'the IRA');
  near(r.dividends, 3750, '$50,000 x 10% x 0.75');
});

test('MIRROR: a taxable account emptied into a Roth IRA at 60.25 pays its own dividends first, and moves what is left', () => {
  // m + 10% x ((50,000 - m) x 1 + m x 0.25) = 50,000, so m = 50,000 x 0.9 / 0.925 = $48,648.65 moves and $1,351.35 is paid (it was
  // $50,000 moved and the Roth IRA paying $1,250 of the taxable account's dividends). AGI $50,000 + $1,351.35; federal $3,820 as
  // above; state ($51,351.35 - $16,100) x 2.5%. The cash keeps the pension and the dividends, less the tax; the source is empty.
  const r = last(run(plan({ policy: 'warn', at: 60.25, pension: 50000 })));
  const m = 50000 * 0.9 / 0.925, dividends = 50000 - m, tax = 3820 + (50000 + dividends - 16100) * 0.025;
  near(r.roth, m, 'the Roth IRA keeps all it received');
  near(r.dividends, dividends, 'the source paid its own dividends');
  near(r.taxes, tax, 'tax');
  near(r.taxable, 100000 + 50000 + dividends - tax, 'cash, after tax; the source is empty');
});

test('MIRROR CONTROL: a partial move that leaves the source enough is unchanged -- $50,000 of $100,000 at 60.25 moves in full', () => {
  // Dividends $50,000 x 10% x 1 + $50,000 x 10% x 0.25 = $6,250.
  const r = last(run(plan({ policy: 'warn', at: 60.25, balance: 100000, pension: 50000 })));
  near(r.roth, 50000, 'all of it moves');
  near(r.dividends, 6250, 'dividends');
});

test('LATE, WHOLE BALANCE: a taxable account emptied into a Roth IRA at 60.75 moves what is left after its own dividends', () => {
  // The dividends are figured before the draw on m leaving at 60.75: 10% x (50,000 x 1 - m x 0.25). What is left must be m:
  // m = 50,000 x 0.9 / 0.975 = $46,153.85; dividends $3,846.15 (was $50,000 in the preview, $46,250 moved, $3,750 paid).
  const r = last(run(plan({ policy: 'warn', pension: 50000 })));
  const m = 50000 * 0.9 / 0.975;
  near(r.roth, m, 'the Roth IRA');
  near(r.dividends, 50000 - m, 'dividends');
});

test('PROTECT THE TRANSFER: the spending draw, which comes first, leaves the transfer its $8,600', () => {
  // $20,000 of wages: room min($8,600, $20,000) = $8,600, moving at 60.75. The source's dividends: 10% x (50,000 - 8,600 x 0.25) =
  // $4,785, leaving $45,215. Spending $70,000 less $20,000 wages less $4,785 needs $45,215: the source gives $36,615, keeping the
  // $8,600, and the IRA gives $8,600. The transfer moves $8,600 and the source ends empty. (Before: the draw took all $45,215 and
  // $0 moved, though the dividends had been figured on $8,600 leaving.)
  const r = last(run(plan({ wages: 20000, spending: 70000, cash: 0, ira: 100000, order: 'taxable,preTax,roth,hsa' })));
  near(r.roth, 8600, 'the transfer moved');
  near(r.taxable, 0, 'the source gave the rest to spending');
  near(r.dividends, 4785, 'dividends');
  near(r.shortfall, 0, 'spending was met');
});

test('PROTECT: a draw that never reaches the held dollars takes what it needs from the source, and the transfer still moves', () => {
  // Spending $50,000 needs $25,215 from the source (dividends $4,785 as above), which keeps $20,000; $8,600 moves. The paid dividends
  // left $45,215 holding $50,000 of basis, so the sale and the transfer are losses: ($25,215 + $8,600) x (1 - 50,000/45,215) =
  // -$3,578.56, of which $3,000 offsets ordinary income. AGI $20,000 + $4,785 - $3,000 = $21,785. Tax: federal on $5,685 above the
  // deduction, of which $4,785 is qualified dividends at 0% and $900 is ordinary at 10%, $90; state $5,685 x 2.5% = $142.125;
  // payroll $1,530; $1,762.125, paid from the source. (At aaff3f1 the dividends were figured on $50,000 leaving, not $8,600.)
  const r = last(run(plan({ wages: 20000, spending: 50000, cash: 0, ira: 100000, order: 'taxable,preTax,roth,hsa' })));
  near(r.roth, 8600, 'the transfer moved');
  near(r.dividends, 4785, 'dividends');
  near(r.federalAgi, 21785, 'AGI');
  near(r.taxes, 1762.125, 'tax');
  near(r.preTax, 100000, 'the IRA was not needed');
  near(r.taxable, 50000 - 4785 - 25215 - 8600 - 1762.125, 'the source');
});
