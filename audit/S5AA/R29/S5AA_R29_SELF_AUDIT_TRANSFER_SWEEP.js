#!/usr/bin/env node
'use strict';
/*
 * S5AA R29 self-audit: the one-time transfer across every pairing of account types, held to expectations written here from
 * the rules R29 implements -- not read from the engine.
 *
 *   node audit/S5AA/R29/S5AA_R29_SELF_AUDIT_TRANSFER_SWEEP.js
 *
 * Each plan: a single owner, $20,000 in the source, an empty destination, and $100,000 of cash (a taxable account at full
 * basis, spent first) that pays the year's taxes -- so paying them realises no gain and adds no income; 0% returns, no
 * spending, no other income except optional wages; the transfer at age + 0.5. For every plan it checks:
 *   MOVED   what reaches the destination (its class total, where nothing else reaches it), from the transfer rules;
 *   AGI     the row's federal AGI, from the transfer's income, gain and deduction;
 *   MONEY   with no wages: the household's end total is its start ($120,000) less the row's taxes (no money created or lost);
 *   AGREE   the validator refuses exactly the plans the engine moves nothing for (a transfer into a 401(k)).
 * Conversions (a pre-tax source into a Roth-class account) keep their existing rule and are checked for MONEY and AGREE only.
 */
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

/* The rules, written out. */
const TYPES = {
  taxable: { cls: 'taxable', group: null }, rothIRA: { cls: 'roth', group: 'ira' }, traditionalIRA: { cls: 'preTax', group: 'ira' },
  traditional401k: { cls: 'preTax', group: 'workplace' }, roth401k: { cls: 'roth', group: 'workplace' }, hsa: { cls: 'hsa', group: 'hsa' },
  customRoth: { cls: 'roth', group: null }, customTraditional: { cls: 'preTax', group: null },
};
const IRA_LIMIT = (age) => 7500 + (age >= 50 ? 1100 : 0);
const HSA_LIMIT = (age) => 4400 + (age >= 55 ? 1000 : 0);
const BASIS = 0.6, BALANCE = 20000, CASH = 100000;

function expect(fromT, toT, { age, amount, wages, policy, q }) {
  const f = TYPES[fromT], t = TYPES[toT];
  const conversion = f.cls === 'preTax' && t.cls === 'roth';
  if (conversion) return { conversion: true };
  /* S5AA R32 (R30A-02; the owner 2026-09-28: "Refuse it"): a Roth IRA cannot roll into a 401(k) either (Publication 590-A). R29's
     rule allowed it as a same-class rollover; the sweep now holds the engine to the rule as decided since. */
  const intoWorkplace = t.group === 'workplace' && (f.cls !== t.cls || fromT === 'rothIRA');
  if (intoWorkplace) return { moved: 0, agi: wages, refused: true };
  const asked = Math.min(amount, BALANCE);
  const contribution = (t.group === 'ira' || t.group === 'hsa') && f.cls !== t.cls;
  let moved = asked;
  if (contribution && policy === 'redirect') {
    const room = t.group === 'ira' ? Math.min(IRA_LIMIT(age), wages) : HSA_LIMIT(age);
    moved = Math.min(asked, room);
  }
  const funding = t.cls === 'hsa' && fromT === 'traditionalIRA';
  let agi = wages;
  if (f.cls === 'hsa' && t.cls !== 'hsa') agi += moved * (1 - q / 100);                             // PCF-01
  if (f.cls === 'preTax' && (t.cls === 'taxable' || (t.cls === 'hsa' && !funding))) agi += moved;      // a distribution
  if (f.cls === 'taxable' && t.cls !== 'taxable') agi += moved * (1 - BASIS);                          // the gain
  if (contribution && !funding && (toT === 'traditionalIRA' || t.cls === 'hsa')) agi -= moved;       // the deduction
  return { moved, agi };
}

function run(fromT, toT, o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.limitPolicy = o.policy;
  Object.assign(p.profile, { age: o.age, retireAge: o.age, endAge: o.age + 1, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, dividendGrowth: 0, dividendStart: o.age,
    pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [],
    otherIncomes: o.wages ? [{ name: 'W', type: 'employment', owner: 'self', amount: o.wages, start: o.age, end: o.age + 1, growth: 0, growthMode: 'fixed' }] : [] });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, networthOn: true, otherAssets: [], debts: [], assetsOn: true,
    assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }], rule55: false,
    transferOn: true, transferFrom: 'src', transferTo: 'dst', transferAmount: o.amount, transferAge: o.age + 0.5, penaltyException: false });
  p.retirement.withdrawalOrder = 'manual';
  p.retirement.manualOrder = 'taxable,roth,preTax,hsa';
  const acct = (id, type, balance) => Object.assign({ id, name: id, type, taxClass: TYPES[type].cls, owner: 'self', balance,
    basisPct: TYPES[type].cls === 'taxable' ? BASIS * 100 : 0, contribution: 0, contributionMode: 'amount', annualChange: 0,
    annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: { flat: 100 }, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: id === 'cash' ? 0 : id === 'dst' ? 1 : 2 }, type === 'hsa' ? { qualifiedMedicalPct: o.q } : {});
  p.accounts = [Object.assign(acct('cash', 'taxable', CASH), { basisPct: 100 }), acct('src', fromT, BALANCE), acct('dst', toT, 0)];
  const valid = validateScenario(JSON.parse(JSON.stringify(p)));
  const r = engine.runPlan(p);
  return { valid, r, row: r.rows && r.rows[1], codes: (r.issues || []).map((i) => i.code) };
}

let plans = 0, checks = 0;
const problems = [], byCheck = {};
let problemCount = 0;
const bad = (what, ctx) => { problemCount++; const k = what.split(' ')[0]; byCheck[k] = (byCheck[k] || 0) + 1; if (problems.length < 25) problems.push(what + ' | ' + JSON.stringify(ctx)); };
for (const fromT of Object.keys(TYPES)) for (const toT of Object.keys(TYPES)) {
  if (fromT === toT) continue;
  for (const age of [57, 60, 66]) for (const amount of [2000, 50000]) for (const wages of [0, 3000]) for (const policy of ['redirect', 'warn'])
  for (const q of (fromT === 'hsa' ? [0, 50] : [100])) {
    const o = { age, amount, wages, policy, q }, ctx = { fromT, toT, ...o };
    const x = run(fromT, toT, o), e = expect(fromT, toT, o);
    plans++;
    if (x.r.status !== 'ok') { bad('STATUS ' + x.r.status, ctx); continue; }
    const fc = TYPES[fromT].cls, tc = TYPES[toT].cls;
    /* AGREE: the validator refuses exactly the plans moved into a 401(k) from a different class. */
    checks++;
    const refusedByValidator = x.valid.issues.some((i) => i.code === 'TRANSFER_INTO_WORKPLACE_PLAN');
    if (refusedByValidator !== !!e.refused) bad('AGREE validator ' + refusedByValidator + ' vs rule ' + !!e.refused, ctx);
    /* MONEY: with no wages, nothing is created or lost -- the end total is the start less the taxes. */
    if (!wages) { checks++; if (Math.abs(x.row.total - (BALANCE + CASH - x.row.taxes)) > 0.01) bad('MONEY end ' + x.row.total + ' vs ' + (BALANCE + CASH - x.row.taxes), ctx); }
    if (e.conversion) continue;
    /* MOVED: the destination's class total holds what moved. A taxable destination shares its class with the cash, which pays
       the taxes: there it is cash + moved - taxes, and it is measured only without wages (their net is kept as cash too). */
    if (fc !== tc && !(tc === 'taxable' && wages)) {
      checks++;
      const want = tc === 'taxable' ? CASH + e.moved - x.row.taxes : e.moved;
      if (Math.abs(x.row[tc] - want) > 0.01) bad('MOVED ' + x.row[tc] + ' vs ' + want, ctx);
    }
    /* AGI. */
    checks++;
    if (Math.abs(x.row.federalAgi - e.agi) > 0.01) bad('AGI ' + x.row.federalAgi + ' vs ' + e.agi, ctx);
  }
}
console.log(JSON.stringify({ plans, checks, problems: problemCount, byCheck }));
problems.forEach((p) => console.log('  ' + p));
console.log(problemCount ? 'SWEEP FAILED' : 'SWEEP PASSED');
process.exitCode = problemCount ? 1 : 0;
