/* Q44 -- `networthOn: false` did not stop `homeEquityFallback` spending an
 * other-asset the plan had been told not to include.
 *
 * findingIds: Q44
 *
 * Decided 2026-09-13 (the owner): reading (b), a real scope leak. The fallback is
 * gated on `advanced.networthOn`. The app shell labels that switch "Include
 * other assets and debts", so an asset the user excluded must not quietly fund
 * the plan once the portfolio runs out. SIMULATION_LOG.md Batch 6 traced $700k+
 * of home equity drawn over 13 years while `networth` read a flat $0.
 *
 * The stored corpora cannot see this repair. Six corpus scenarios combine
 * `networthOn: false` with the fallback and other assets, and none ever draws:
 * `nonPortfolioDraw` is 0 on every row, so the differential diff is empty with
 * or without the gate. This file is the repair's evidence.
 *
 * Controls, each able to fail:
 *   - the same household with `networthOn: true` DOES draw, so the path is live
 *     in the fixture and a zero below is not a fixture that never runs out;
 *   - the fallback switch still governs on its own (fallback off never draws).
 *
 * Reachability: the UI (both are checkboxes), import (the validator accepts the
 * combination), and direct programmatic input.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const validator = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

/* Retired at 60 on a $120,000 taxable account against $60,000 a year, with no
   Social Security, no growth and no inflation: the portfolio runs out in year
   three, and an available, 80%-accessible $800,000 home is the only other money. */
function makePlan({ networthOn, fallback }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 75 });
  Object.assign(p.retirement, { spending: 60000, homeEquityFallback: fallback, ssBenefit: 0, spouseSS: 0, otherIncomes: [], stages: [] });
  p.accounts = [{
    id: 't1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 120000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  p.advanced.networthOn = networthOn;
  p.advanced.otherAssets = [{
    id: 'home', name: 'Home', type: 'primaryResidence', owner: 'household',
    value: 800000, growth: 0, liquidity: 'illiquid', available: true, availableAge: 0, accessPct: 80,
  }];
  p.advanced.debts = [];
  return p;
}

const run = (p) => engine.runPlan(JSON.parse(JSON.stringify(p)));
const drawn = (r) => (r.rows || []).reduce((t, row) => t + (Number(row.nonPortfolioDraw) || 0), 0);

test('Q44 control: with networthOn ON, the fallback draws on the home once the portfolio runs out', () => {
  const p = makePlan({ networthOn: true, fallback: true });
  assert.equal(validator.validateScenario(JSON.parse(JSON.stringify(p))).valid, true, 'the fixture must be a valid plan');
  const r = run(p);
  assert.equal(r.status, 'ok');
  assert.ok(drawn(r) > 0, 'CONTROL: the fixture must actually reach the fallback, or the zeroes below prove nothing (drew ' + drawn(r) + ')');
});

test('Q44: with networthOn OFF, the fallback draws nothing from an other-asset', () => {
  const p = makePlan({ networthOn: false, fallback: true });
  assert.equal(validator.validateScenario(JSON.parse(JSON.stringify(p))).valid, true,
    'the combination is a valid plan, so import reaches it');
  const r = run(p);
  assert.equal(r.status, 'ok');
  assert.equal(drawn(r), 0,
    'with other assets excluded ("Include other assets and debts" off), homeEquityFallback must not spend them; it drew ' + drawn(r));
});

test('Q44: with networthOn OFF, the result is exactly the same plan with the fallback switched off', () => {
  const gated = run(makePlan({ networthOn: false, fallback: true }));
  const off = run(makePlan({ networthOn: false, fallback: false }));
  assert.equal(JSON.stringify(gated), JSON.stringify(off),
    'excluded assets must not fund the plan at all, so the fallback setting must make no difference while they are excluded');
});

test('Q44 control: the fallback switch still governs on its own', () => {
  const r = run(makePlan({ networthOn: true, fallback: false }));
  assert.equal(r.status, 'ok');
  assert.equal(drawn(r), 0, 'CONTROL: with the fallback off, nothing is drawn even when other assets are included');
});
