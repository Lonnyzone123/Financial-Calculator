/* S5AA R35 (SA32F-37 and R32V-01; Claude's R32F full-model audit FLOWS-04, confirmed P2 by ChatGPT's R32V, which also found
 * R32V-01) -- THE RETURNS SPENDING DECISIONS READ ARE THE PORTFOLIO'S OWN.
 *
 * With allocations on, every account earns its asset classes' returns, but:
 *   - VPW paced spending on the headline `assumptions.returnRate` (R32F: 74,840.23 in year 1 against 58,920.45 at the
 *     allocations' 7.8%);
 *   - the prior-period return that triggers the flexibility cut and Guyton's inflation skip read that headline rate in simple
 *     mode (R32V-01: a -10% year did not cut spending because the unused field said +10%); Monte Carlo read an unweighted mean of
 *     the accounts' returns; historical mode read the market series whatever the portfolio held.
 * No law sets either. The rules adopted (the recommendation of record, the owner 2026-09-29):
 *   - the PRIOR-PERIOD SIGNAL is the portfolio's balance-weighted return for the period, as the accounts actually grew (net of the
 *     fee), with household cash at its own 0%; the draw for spending is not a return;
 *   - VPW's rate is the portfolio's balance-weighted EXPECTED return (each account's allocation, or the flat rate without
 *     allocations), less the fee, deflated by inflation. */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const acct = (id, balance, allocation, extra) => Object.assign({ id, name: id, type: 'rothIRA', taxClass: 'roth', owner: 'self', balance,
  contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
  futureChanges: [], allocation, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }, extra || {});
function plan(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: o.age, retireAge: o.age, endAge: o.endAge, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: o.headline, inflation: o.inflation || 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: o.age });
  Object.assign(p.retirement, { strategy: o.strategy, spending: o.spending || 0, flexibility: o.flexibility || 0, dividendOn: false, stages: [],
    expenses: [], otherIncomes: [], pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false, selfLife: 120 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false, assetsOn: true, glideOn: false,
    bondTentOn: false, reserveOn: false, assetClasses: o.classes });
  p.accounts = o.accounts;
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', r.status + ' / ' + r.calculationErrorCode);
  return r;
}

test('R35 SA32F-37: VPW paces on the allocations\' expected return, not the headline field', () => {
  /* 65 to 95, 3.5% inflation, $1,000,000 at 60/40; stocks 10%, bonds 4.5%: 7.8% expected; the headline field is 10%.
     Real 1.078/1.035 - 1 over 30 years: 1,000,000 / annuity factor = 58,920.45. The engine paid 74,840.23 (the 10%). */
  const r = plan({ age: 65, endAge: 95, inflation: 3.5, headline: 10, strategy: 'vpw',
    classes: [{ id: 'stocks', name: 'Stocks', returnRate: 10, volatility: 18.5 }, { id: 'bonds', name: 'Bonds', returnRate: 4.5, volatility: 7 }],
    accounts: [acct('roth', 1000000, { stocks: 60, bonds: 40 })] });
  const real = 1.078 / 1.035 - 1, hand = 1000000 / ((1 - Math.pow(1 + real, -30)) / real);
  assert.ok(Math.abs(r.rows[1].spending - hand) < 0.01, 'year 1: ' + r.rows[1].spending.toFixed(2) + ' against ' + hand.toFixed(2));
});

const one = (ret) => [{ id: 'eq', name: 'Equity', returnRate: ret, volatility: 0 }];
test('R32V-01: a loss in the portfolio cuts next year\'s spending, whatever the headline field says', () => {
  /* 70 to 73, $1,000,000 Roth 100% in one class, $40,000 fixed-nominal, 10% flexibility, no inflation or fee. */
  const loss = plan({ age: 70, endAge: 73, headline: 10, strategy: 'fixedNominal', spending: 40000, flexibility: 10, classes: one(-10),
    accounts: [acct('roth', 1000000, { eq: 100 })] });
  assert.strictEqual(loss.rows[1].spending, 40000, 'the first year has no prior period');
  assert.strictEqual(loss.rows[2].spending, 36000, 'after a -10% year: 40,000 x 90%. The engine paid 40,000 (the field said +10%).');
  const gain = plan({ age: 70, endAge: 73, headline: -10, strategy: 'fixedNominal', spending: 40000, flexibility: 10, classes: one(10),
    accounts: [acct('roth', 1000000, { eq: 100 })] });
  assert.strictEqual(gain.rows[2].spending, 40000, 'after a +10% year, no cut. The engine cut to 36,000 (the field said -10%).');
});

test('R32V-01: the signal is balance-weighted, with household cash at its own 0%', () => {
  /* $900,000 of household cash (0%) and $100,000 invested. At -5% the portfolio returned -0.5%: a cut. At +5%, +0.5%: none. */
  const cash = (bal) => acct('cash', bal, {}, { type: 'taxable', taxClass: 'taxable', basisPct: 100, cashHolding: true, priority: 2 });
  const withEq = (ret) => plan({ age: 70, endAge: 73, headline: 0, strategy: 'fixedNominal', spending: 40000, flexibility: 10, classes: one(ret),
    accounts: [acct('roth', 100000, { eq: 100 }), cash(900000)] });
  assert.strictEqual(withEq(-5).rows[2].spending, 36000, 'a -0.5% portfolio: cut');
  assert.strictEqual(withEq(5).rows[2].spending, 40000, 'a +0.5% portfolio: no cut');
});
