/* S5AA R44 CORRECTED COPY of audit/S5AA/R43/prediction/flows_corpus_scan.js (R43-04). Corrections:
   - C3 (SA43-E): SA42F-20 flags a stream only if E.otherIncomeFor() pays it in some row of the horizon.
   Everything else is the R43 scan unchanged. */
/* S5AA R43 prediction, part 4b (cash flows): which corpus plans can each repair move? Run on the tree BEFORE the part 4b engine
   edits.   Usage: node audit/S5AA/R43/prediction/flows_corpus_scan.js [<source tree>]
   From the plan's inputs and its rows at today's source; a stochastic plan is marked:
   - SA42F-19: the fallback on with other assets included, an asset available from an age strictly inside a row, and a shortfall in
     that row today (nothing else can change);
   - SA42F-20: a spending stage set as an amount, or an income stream, whose growth mode is not "Match inflation", starting after
     the plan's start (on its owner's clock), active inside the horizon, in a plan whose inflation is not zero (or is historical);
     a stage counts only if a retired row reaches it;
   - SA42F-21: the reserve on, a retired row, and projected spending that can differ from the entered spending field -- a strategy
     other than fixed-nominal or income-first, stages, a survivor reduction, or inflation under fixed-nominal;
   - SA42F-28: a one-time income dated at or after the plan's end age (on the self's clock): its new warning changes the issues;
   - SA42F-26 changes the form's text only.
   A condition is necessary, not sufficient; the record says which flagged plans did not move. */
'use strict';
const path = require('node:path');
const ROOT = path.resolve(process.argv[2] || '.');
const fs = require('node:fs');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const plans = (comp) => {
  const { entries, omissions } = cap.corpusWithDiagnostics({ composition: comp });
  if (omissions.length) throw new Error(comp + ' omissions: ' + JSON.stringify(omissions));
  return entries;
};

function scan(entry) {
  const p = JSON.parse(JSON.stringify(entry.plan));
  const out = { f19: [], f20: [], f21: [], f28: [] };
  const r = p.retirement || {}, pr = p.profile || {}, adv = p.advanced || {};
  const start = Number(pr.age), end = Number(pr.endAge), retire = Number(pr.retireAge), spouseOn = !!pr.spouseOn;
  const shift = (owner) => (owner === 'spouse' && spouseOn ? Number(pr.spouseAge) - start : 0);   // owner age = self age + shift
  const inflating = p.assumptions.method === 'historical' || Number(p.assumptions.inflation) !== 0;
  const res = E.runPlan(JSON.parse(JSON.stringify(p))), rows = res.rows || [];
  // SA42F-20: streams
  if (inflating) (r.otherIncomes || []).forEach((s, i) => {
    if (!s || !(Number(s.amount) > 0) || s.growthMode === 'inflation' || s.type === 'oneTime' || s.type === 'oneTimeTaxFree') return;
    const st = Number(s.start), atSelf = st - shift(s.owner);
    // R44 C3 (SA43-E): the stream must pay -- the engine's own income function, given only this stream, pays something in a row
    // of the horizon (a stream that starts and ends at the same age pays nothing).
    const only = JSON.parse(JSON.stringify(p)); only.retirement.otherIncomes = [JSON.parse(JSON.stringify(s))];
    const pays = rows.slice(1).some((row, k) => Math.abs(E.otherIncomeFor(only, rows[k].age, row.age, 1, 0).cash) > 1e-9);
    if (pays && st > start + shift(s.owner) + 1e-9 && atSelf < end - 1e-9) out.f20.push('stream ' + i + ' ' + s.type + ' ' + (s.growthMode || 'fixed') + ' from ' + st);
  });
  // SA42F-20: stages (reached in a retired row)
  if (inflating) (r.stages || []).forEach((s, i) => {
    if (!s || s.mode === 'percent' || s.growthMode === 'inflation') return;
    const st = Number(s.start);
    if (st > start + 1e-9 && st < end - 1e-9 && Number(s.end) + 1 > Math.max(retire, start)) out.f20.push('stage ' + i + ' ' + (s.growthMode || 'none') + ' from ' + st);
  });
  // SA42F-21
  const fieldStrategy = r.strategy === 'fixedNominal' || r.strategy === 'incomeFirst';
  if (adv.reserveOn && retire < end && (!fieldStrategy || (r.stages || []).length || (Number(r.survivorSpendingReduction) > 0 && r.survivor && spouseOn) || (r.strategy === 'fixedNominal' && inflating) || (r.strategy === 'incomeFirst' && inflating)))
    out.f21.push('reserve ' + adv.reserveYears + 'y, ' + r.strategy);
  // SA42F-28
  (r.otherIncomes || []).forEach((s, i) => {
    if (s && (s.type === 'oneTime' || s.type === 'oneTimeTaxFree') && Number(s.amount) && Number(s.start) - shift(s.owner) >= end - 1e-4) out.f28.push('income ' + i + ' at ' + s.start);
  });
  // SA42F-19
  if (r.homeEquityFallback && adv.networthOn) for (let k = 1; k < rows.length; k++) {
    const age = rows[k - 1].age, rowAge = rows[k].age;
    (adv.otherAssets || []).forEach((a) => {
      const x = Number(a && a.availableAge);
      if (a && a.available && x > age + 1e-9 && x < rowAge - 1e-9 && rows[k].shortfall > 0.01) out.f19.push(rowAge + ' ' + a.name + ' from ' + x);
    });
  }
  if (p.assumptions.method !== 'simple') Object.keys(out).forEach((k) => { if (out[k].length) out[k].unshift('(' + p.assumptions.method + ')'); });
  return out;
}

const KEYS = ['f19', 'f20', 'f21', 'f28'];
for (const comp of ['control', 'expanded']) {
  const entries = plans(comp), movers = Object.fromEntries(KEYS.map((k) => [k, []]));
  for (const e of entries) { const s = scan(e); KEYS.forEach((f) => { if (s[f].length) movers[f].push(e.name + ' [' + s[f].slice(0, 3).join('; ') + (s[f].length > 3 ? '; +' + (s[f].length - 3) : '') + ']'); }); }
  console.log('== ' + comp + ' (' + entries.length + ' plans)');
  KEYS.forEach((f) => console.log('  ' + f + ' (' + movers[f].length + '): ' + (movers[f].length ? '\n    ' + movers[f].join('\n    ') : 'none')));
}

// Positive control: the witnesses in tests/audit-s5aa-r43-flows.test.js.
{
  const L = require(path.join(ROOT, 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
  const home = (o) => L.basePlan(Object.assign({ age: 64, retireAge: 64, endAge: 67, networthOn: true, fallback: true,
    otherAssets: [{ id: 'home', name: 'Home', type: 'realEstate', owner: 'self', value: 400000, growth: 0, available: true, availableAge: 65.5, accessPct: 50, liquidity: 'illiquid' }] }, o));
  const stage = (g, c = 0) => L.basePlan({ age: 55, retireAge: 65, endAge: 70, inflation: 3, strategy: 'incomeFirst', spending: 40000, stages: [{ name: 'Go-go', start: 65, end: 69, mode: 'amount', value: 40000, growthMode: g, annualChange: c }], accounts: [L.account('roth', 'rothIRA', 3000000)] });
  const rent = (g, gr, st = 65) => L.basePlan({ age: 55, retireAge: 55, endAge: 68, inflation: 3, strategy: 'fixedNominal', spending: 0, otherIncomes: [{ name: 'Rent', type: 'rental', owner: 'self', amount: 30000, start: st, end: 90, growth: gr, growthMode: g }], accounts: [L.account('roth', 'rothIRA', 100000)] });
  const reserve = () => { const p = L.basePlan({ age: 65, retireAge: 65, endAge: 66, returnRate: 7, strategy: 'guardrails', spending: 60000, otherIncomes: [{ name: 'Gift', type: 'taxFree', owner: 'self', amount: 200000, start: 0, end: 120, growth: 0, growthMode: 'fixed' }], accounts: [L.account('roth', 'rothIRA', 3000000)] });
    Object.assign(p.retirement, { withdrawalRate: 4, floor: 0, ceiling: 1e9, upperGuardrail: 20, lowerGuardrail: 20, adjustment: 10 }); Object.assign(p.advanced, { reserveOn: true, reserveYears: 2 }); return p; };
  const late = (st) => L.basePlan({ age: 60, endAge: 63, spending: 0, accounts: [L.account('cash', 'taxable', 100000)], otherIncomes: [{ name: 'Inheritance', type: 'oneTimeTaxFree', owner: 'self', amount: 50000, start: st, end: st, growth: 0, growthMode: 'fixed' }] });
  const cases = [['SA42F-19 roof', home({ spending: 0, accounts: [L.account('roth', 'rothIRA', 10000)], expenses: [{ name: 'Roof', kind: 'expense', age: 65.75, amount: 100000 }] })],
    ['SA42F-19 recurring', home({ spending: 60000, accounts: [L.account('roth', 'rothIRA', 60000)] })],
    ['SA42F-20 stage none', stage('none')], ['SA42F-20 stage inflation (control)', stage('inflation')], ['SA42F-20 rent fixed', rent('fixed', 3)], ['SA42F-20 rent from start (control)', rent('fixed', 3, 55)],
    ['SA42F-21 reserve', reserve()], ['SA42F-28 income at 63', late(63)], ['SA42F-28 income at 62 (control)', late(62)]];
  console.log('== positive control');
  for (const [name, p] of cases) { const s = scan({ name, plan: p }); console.log('  ' + name + ': ' + (KEYS.filter((f) => s[f].length).map((f) => f + ' [' + s[f].slice(0, 2).join('; ') + ']').join(' ') || 'none')); }
}
