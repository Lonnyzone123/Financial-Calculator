/* S5AA R44 prediction scan (R43-01, -02, -03), written under audit/S5AA/R44/S5AA_R44_PREDICTION_CHECKLIST_20261001.md.
   Run on the tree BEFORE the R44 engine edits.   Usage: node audit/S5AA/R44/prediction/r44_corpus_scan.js [<source tree>]

   C6 -- the readers of what each repair changes (found by searching src/engine.js and src/app-shell.html):
   - R43-01, the HSA limit in the 65th-birthday row (IRC 223(b)(1), (2), (3), (7); Pub. 969's example): auditContributions() reads it
     on two routes -- (a) the planned contribution (simulatePlan's per-row audit, and the app's contribution cards), and (b) the one-time
     contribution (transferRoom()). Each route gets its own condition.
   - R43-02, compensation with the today's-dollar income latch: ownerCompensation() is called twice in simulatePlan -- the planned audit
     (already latched since R43) and transferRoom() (not latched). The IRA deduction's compensation reads the row's other income, which is
     latched already. Only transferRoom() changes.
   - R43-03, a minimum of 0 on accounts[].matchRate, matchCap and profitShare in src/plan-value-contract.json: read by the validator's
     contract loop and the engine's input gate. A plan with a negative value is refused.

   Conditions (each necessary; the record says which flagged plans are expected to move and how):
   - h65p (R43-01a): a row in which an HSA owner turns 65 strictly inside the row (C1: ages and windows by the engine's helpers), the
     owner's contribution window open (C2), and the planned request -- after R43's flow stop -- above the owner's prorated limit
     share x (base + catch-up), or another HSA in the plan sharing the base (then flagged "shared").
   - h65o (R43-01b): a one-time contribution (the engine's transferIsContribution(), C1) into an HSA whose owner is 65 or over at the opening of the transfer's row, or turns 65 in it.
   - comp (R43-02): a one-time contribution (transferIsContribution()) into an IRA, in a row where an employment or self-employment stream that starts after the
     plan's start (not "Match inflation") pays, by the engine's own otherIncomeFor() (C3).
   - neg (R43-03): an account with a negative matchRate, matchCap or profitShare.
   C4: Monte Carlo plans are marked; every condition here depends on ages, dates and inputs only, so a flagged row is flagged on every path. */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
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
  const out = { h65p: [], h65o: [], comp: [], neg: [] };
  const pr = p.profile || {}, adv = p.advanced || {}, accounts = p.accounts || [];
  const start = Number(pr.age), spouseOn = !!pr.spouseOn, hsa = RULES.retirement.hsa;
  // R43-03
  accounts.forEach((a, i) => ['matchRate', 'matchCap', 'profitShare'].forEach((f) => { if (a && typeof a[f] === 'number' && a[f] < 0) out.neg.push('accounts[' + i + '].' + f + ' = ' + a[f]); }));
  const res = E.runPlan(JSON.parse(JSON.stringify(p))), rows = res.rows || [];
  const hsas = accounts.filter((a) => a && a.type === 'hsa');
  const ownerOf = (a) => (a.owner === 'spouse' && spouseOn ? 'spouse' : 'self');
  const transferTo = accounts.find((a) => a && a.id === adv.transferTo);
  for (let k = 1; k < rows.length; k++) {
    const age = rows[k - 1].age, rowAge = rows[k].age, dur = rowAge - age, yi = age - start, spouseAge = Number(pr.spouseAge) + yi;
    const win = E.ownerContributionWindow(p, age, spouseAge, dur).durations;
    // R43-01a: planned HSA, the 65th-birthday row
    hsas.forEach((a) => {
      const o = ownerOf(a), oAge = o === 'spouse' ? spouseAge : age, before65 = 65 - oAge, w = o === 'spouse' ? win.spouse : win.self;
      if (!(before65 > 1e-9 && before65 < dur - 1e-9) || !(w > 1e-9)) return;
      const salary = (Number(o === 'spouse' ? p.employment.spouseSalary : p.employment.salary) || 0) * Math.pow(1 + (Number(p.employment.growth) || 0) / 100, yi);
      const asked = E.accountPlannedContribution(a, salary, age, p);
      if (!(asked > 0)) return;
      const scaled = before65 < w ? asked * before65 / w : asked, share = before65 / dur;
      const base = pr.filing === 'mfj' ? hsa.family : hsa.self, catchUp = oAge + dur >= hsa.catchupAge ? hsa.catchup : 0, newCap = share * (base + catchUp);
      if (scaled > newCap + 0.005) out.h65p.push(rowAge + ' ' + o + ' turns 65 at ' + (age + before65).toFixed(2) + ': asks ' + scaled.toFixed(0) + ' > ' + newCap.toFixed(0));
      else if (hsas.length > 1) out.h65p.push(rowAge + ' ' + o + ' turns 65 (shared base)');
    });
    // R43-01b and R43-02: the one-time contribution's row
    // C1: whether a transfer is a contribution at all is the engine's own transferIsContribution() (an HSA-to-HSA transfer is not).
    const transferFrom = accounts.find((a) => a && a.id === adv.transferFrom);
    if (adv.transferOn && transferTo && transferFrom && E.transferIsContribution(transferFrom, transferTo) && Number(adv.transferAmount) > 0 && Number(adv.transferAge) >= age - 1e-9 && Number(adv.transferAge) < rowAge - 1e-9) {
      const o = ownerOf(transferTo), oAge = o === 'spouse' ? spouseAge : age;
      if (transferTo.type === 'hsa' && oAge + dur > 65 + 1e-9) out.h65o.push(rowAge + ' one-time ' + adv.transferAmount + ' into HSA, ' + o + ' ' + oAge.toFixed(2) + ' at the opening');
      if (transferTo.type === 'traditionalIRA' || transferTo.type === 'rothIRA') {
        ((p.retirement && p.retirement.otherIncomes) || []).forEach((s, j) => {
          if (!s || !(s.type === 'employment' || s.type === 'selfEmployment') || s.growthMode === 'inflation') return;
          const shift = s.owner === 'spouse' && spouseOn ? Number(pr.spouseAge) - start : 0;
          if (!(Number(s.start) - shift > start + 1e-9)) return;
          const only = JSON.parse(JSON.stringify(p)); only.retirement.otherIncomes = [JSON.parse(JSON.stringify(s))];
          if (Math.abs(E.otherIncomeFor(only, age, rowAge, 1, 0).cash) > 1e-9) out.comp.push(rowAge + ' one-time IRA ' + adv.transferAmount + ' with stream ' + j + ' (' + s.type + ' from ' + s.start + ')');
        });
      }
    }
  }
  if (p.assumptions.method !== 'simple') Object.keys(out).forEach((key) => { if (out[key].length) out[key].unshift('(' + p.assumptions.method + ')'); });
  return out;
}

const KEYS = ['h65p', 'h65o', 'comp', 'neg'];
for (const comp of ['control', 'expanded']) {
  const entries = plans(comp), movers = Object.fromEntries(KEYS.map((key) => [key, []]));
  for (const e of entries) { const s = scan(e); KEYS.forEach((f) => { if (s[f].length) movers[f].push(e.name + ' [' + s[f].slice(0, 3).join('; ') + (s[f].length > 3 ? '; +' + (s[f].length - 3) : '') + ']'); }); }
  console.log('== ' + comp + ' (' + entries.length + ' plans)');
  KEYS.forEach((f) => console.log('  ' + f + ' (' + movers[f].length + '): ' + (movers[f].length ? '\n    ' + movers[f].join('\n    ') : 'none')));
}

// C7: positive controls (the witnesses) and negative controls (near misses).
{
  const L = require(path.join(ROOT, 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
  // Rows are tax years closing on the primary person's birthdays, so a 65th birthday falls strictly inside a row only for a spouse whose
  // age is a half year off: the HSA witnesses are the spouse's (as R43's ruling witness was). `spouseAge` is the spouse's age at the start.
  const C = require(path.join(ROOT, 'audit', 'S5AA', 'R42F', 'SA42F', 'CONTRIB', 'lib.js'));
  const hsaPlan = (spouseAge, planned, once) => { const p = C.work({ age: 60, couple: true, spouseAge, retireAge: 70, endAge: 63, salary: 100000, spouseSalary: 100000,
    accounts: [C.acct('brok', 'taxable', 20000, { priority: 9, basisPct: 100 }), C.acct('hsaP', 'hsa', 0, { owner: 'spouse', contribution: planned, priority: 1 })] });
    if (once) Object.assign(p.advanced, { transferOn: true, transferFrom: 'brok', transferTo: 'hsaP', transferAmount: once, transferAge: 60 }); return p; };
  const iraPlan = (start) => { const p = L.basePlan({ age: 55, retireAge: 66, endAge: 66, inflation: 10, salary: 0, spending: 0,
    otherIncomes: [{ id: 'job', name: 'Job', type: 'employment', owner: 'self', amount: 5000, start, end: 66, growth: 0, growthMode: 'fixed' }],
    accounts: [L.account('cash', 'taxable', 20000, { basisPct: 100 }), L.account('ira', 'traditionalIRA', 0)] });
    p.employment.contributionStop = 66; Object.assign(p.advanced, { transferOn: true, transferFrom: 'cash', transferTo: 'ira', transferAmount: 7500, transferAge: 65 }); return p; };
  const employer = (f, v) => L.basePlan({ age: 45, retireAge: 46, endAge: 46, salary: 100000, spending: 0,
    accounts: [L.account('cash', 'taxable', 0), L.account('k', 'traditional401k', 0, Object.assign({ contribution: 10000, matchOn: true, matchRate: 50, matchCap: 6, profitShare: 5 }, { [f]: v }))] });
  const cases = [
    ['R43-01a witness: spouse 64.5, planned 12,000', hsaPlan(64.5, 12000, 0)], ['R43-01a control: spouse 64.5, planned 4,000 (under the prorated cap)', hsaPlan(64.5, 4000, 0)],
    ['R43-01a control: spouse 63, planned 12,000 (no birthday in the first rows)', hsaPlan(62, 12000, 0)],
    ['R43-01b witness: spouse 66, one-time 4,400', hsaPlan(66, 0, 4400)], ['R43-01b witness: spouse 64.5, one-time 4,400', hsaPlan(64.5, 0, 4400)], ['R43-01b control: spouse 63, one-time 4,400', hsaPlan(63, 0, 4400)],
    ['R43-02 witness: stream from 65', iraPlan(65)], ['R43-02 control: stream from the start', iraPlan(55)],
    ['R43-03 witness: profitShare -10', employer('profitShare', -10)], ['R43-03 witness: matchRate -50', employer('matchRate', -50)], ['R43-03 witness: matchCap -6', employer('matchCap', -6)], ['R43-03 control: profitShare 0', employer('profitShare', 0)]];
  console.log('== positive and negative controls');
  for (const [name, p] of cases) { const s = scan({ name, plan: p }); console.log('  ' + name + ': ' + (KEYS.filter((f) => s[f].length).map((f) => f + ' [' + s[f].slice(0, 2).join('; ') + ']').join(' ') || 'none')); }
}
