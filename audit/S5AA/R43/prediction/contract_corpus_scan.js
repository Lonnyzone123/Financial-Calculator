/* S5AA R43 prediction, part 5a (the plan-value contract, the three R35 flags, a lifespan at the start): which corpus plans can the
   repairs move? Run BEFORE the part 5a engine and validator edits.   Usage: node audit/S5AA/R43/prediction/contract_corpus_scan.js [<tree>]
   The contract is data (src/plan-value-contract.json, written before the edits): this scan applies it to every plan -- the control
   and expanded corpora, the app's default plan and the golden scenario definitions -- with its own reading of the rules the file
   states, and reports each plan the engine would refuse. It also tests:
   - SA42F-07: fivePercentOwner, spouseSoleBeneficiary or currentEmployerPlan present on an account and not a boolean;
   - SA42F-30 / -32: every person in the plan with a lifespan at or below their starting age (nobody alive at the start).
   A plan the contract refuses moves from a projection to a refusal; a plan it accepts cannot move under these repairs. */
'use strict';
const path = require('node:path');
const ROOT = path.resolve(process.argv[2] || '.');
const fs = require('node:fs');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'plan-value-contract.json'), 'utf8'));
const at = (o, dotted) => dotted.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function check(rule, v, where, out) {
  if (v === undefined) return;
  if (rule.type === 'enum') { if (!rule.values.includes(v)) out.push(where + ' not in [' + rule.values.join(',') + ']: ' + JSON.stringify(v)); return; }
  if (v === null && rule.nullable) return;
  if (!isNum(v)) { out.push(where + ' not a number: ' + JSON.stringify(v)); return; }
  if (rule.min !== undefined && (rule.minExclusive ? !(v > rule.min) : v < rule.min)) out.push(where + ' below ' + rule.min + ': ' + v);
  if (rule.max !== undefined && v > rule.max) out.push(where + ' above ' + rule.max + ': ' + v);
}
function scan(p) {
  const out = [];
  C.scalars.forEach((rule) => {
    const v = at(p, rule.path);
    const when = rule.requiredWhen === undefined ? [] : [].concat(rule.requiredWhen);
    if (v === undefined && when.some((w) => at(p, w) === true)) out.push(rule.path + ' missing while ' + when.join(' or '));
    check(rule, v, rule.path, out);
  });
  C.lists.forEach((L) => {
    const list = at(p, L.list);
    if (!Array.isArray(list)) return;
    list.forEach((rec, i) => {
      if (!rec || typeof rec !== 'object') return;
      L.fields.forEach((f) => {
        const v = rec[f.name], req = f.required || (f.requiredUnlessType && !f.requiredUnlessType.includes(rec.type));
        if (v === undefined && req) out.push(L.list + '[' + i + '].' + f.name + ' missing');
        check(f, v, L.list + '[' + i + '].' + f.name, out);
      });
    });
  });
  (p.accounts || []).forEach((a, i) => ['fivePercentOwner', 'spouseSoleBeneficiary', 'currentEmployerPlan'].forEach((k) => {
    if (a && a[k] !== undefined && typeof a[k] !== 'boolean') out.push('SA42F-07 accounts[' + i + '].' + k + ': ' + JSON.stringify(a[k]));
  }));
  const pr = p.profile || {}, r = p.retirement || {};
  const selfGone = isNum(r.selfLife) && r.selfLife <= pr.age, spouseGone = !pr.spouseOn || (isNum(r.spouseLife) && r.spouseLife <= pr.spouseAge);
  if (selfGone && spouseGone) out.push('SA42F-30/32 nobody alive at the start (selfLife ' + r.selfLife + ', age ' + pr.age + ')');
  return out;
}

const sets = [];
for (const comp of ['control', 'expanded']) sets.push([comp, cap.corpusWithDiagnostics({ composition: comp }).entries.map((e) => [e.name, e.plan])]);
const defaults = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);
sets.push(['app default', [['defaultPlan', defaults]]]);
const golden = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js'));
sets.push(['golden', golden.GOLDEN_SCENARIOS.map(([name, overrides]) => [name, golden.buildScenario(defaults, overrides)])]);
for (const [name, plans] of sets) {
  const hits = plans.map(([n, p]) => [n, scan(p)]).filter(([, o]) => o.length);
  console.log('== ' + name + ' (' + plans.length + ' plans): ' + (hits.length ? hits.length + ' refused' : 'none refused'));
  hits.forEach(([n, o]) => console.log('   ' + n + ': ' + o.slice(0, 4).join('; ') + (o.length > 4 ? '; +' + (o.length - 4) : '')));
}

// Positive control: the R42F witnesses (the engine-or-validator gaps) must each be refused, and their valid controls not.
{
  const L = require(path.join(ROOT, 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
  const base = () => L.basePlan({ age: 60, endAge: 70, spending: 40000, accounts: [L.account('cash', 'taxable', 2000000, { basisPct: 100 })] });
  const w = (label, f) => { const p = base(); f(p); return [label, p]; };
  const cases = [
    w('control (valid)', () => {}),
    w('conversionAmount "abc"', (p) => { p.advanced.conversionAmount = 'abc'; }), w('contributionStop "abc"', (p) => { p.employment.contributionStop = 'abc'; }),
    w('qcd "10,000"', (p) => { p.advanced.qcd = '10,000'; }), w('selfLife null', (p) => { p.retirement.selfLife = null; }), w('ltcYears "2"', (p) => { p.advanced.ltcYears = '2'; }),
    w('ltcProbability -10', (p) => { p.advanced.ltcProbability = -10; }), w('healthCost -5000', (p) => { p.advanced.healthCost = -5000; }),
    w('debt type "Mortgage"', (p) => { p.advanced.debts = [{ id: 'd', name: 'd', type: 'Mortgage', balance: 100000, rate: 6, paymentMonthly: 900, payoffAge: 80, rateType: 'fixed' }]; }),
    w('annualChangeMode "Percent"', (p) => { p.accounts[0].annualChangeMode = 'Percent'; }), w('withdrawalTiming "x"', (p) => { p.assumptions.withdrawalTiming = 'x'; }),
    w('stage with only a name', (p) => { p.retirement.stages = [{ name: 'Go-go' }]; }), w('income with no end', (p) => { p.retirement.otherIncomes = [{ name: 'x', type: 'pension', owner: 'self', amount: 1, start: 62 }]; }),
    w('healthInflation 150', (p) => { p.advanced.healthInflation = 150; }), w('ltcOn, healthInflation absent', (p) => { p.advanced.ltcOn = true; delete p.advanced.healthInflation; }),
    w('payoffAge null', (p) => { p.advanced.debts = [{ id: 'd', name: 'd', type: 'mortgage', balance: 100000, rate: 6, paymentMonthly: 900, payoffAge: null, rateType: 'fixed' }]; }),
    w('fivePercentOwner "true"', (p) => { p.accounts[0].fivePercentOwner = 'true'; }), w('selfLife 60 at 60', (p) => { p.retirement.selfLife = 60; }),
  ];
  console.log('== positive control');
  cases.forEach(([n, p]) => console.log('   ' + n + ': ' + (scan(p).join('; ') || 'accepted')));
}
