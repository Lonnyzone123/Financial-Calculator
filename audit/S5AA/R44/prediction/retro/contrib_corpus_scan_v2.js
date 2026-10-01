/* S5AA R44 CORRECTED COPY of audit/S5AA/R43/prediction/contrib_corpus_scan.js (R43-04). Corrections:
   - C5 (SA43-C): hsa65Direction() reads the direction of taxes, the taxable and HSA balances and contributions from the pre-repair engine run on the plan with each HSA contribution ended at 65. The flags are unchanged.
   Everything else is the R43 scan unchanged. */
/* S5AA R43 prediction, part 3 (contributions): which corpus plans can each repair move? Run on the tree BEFORE the part 3 engine
   edits.   Usage: node audit/S5AA/R43/prediction/contrib_corpus_scan.js [<source tree>]
   Learned from part 2's miss: every condition requires the contribution to flow -- the owner inside the row's contribution
   window (ownerContributionWindow(), the engine's own) -- and a stochastic plan is named whenever its condition depends on a
   per-path value. Row by row:
   - owner ruling, spousal IRA: a joint return, an IRA planned by an owner whose IRA window is open, and that owner's planned IRA
     dollars above their own pay for the row while their pay is at least the other's (the higher earner used pooled pay), or
     both owners planning IRA dollars above the lower earner's own pay (the lower earner's room now nets the other's IRA);
   - owner ruling, HSA at 65: an HSA planned by an owner whose window is open past their 65th birthday;
   - SA42F-12: a workplace account with a match or profit sharing whose deferral plus employer money could exceed the owner's pay
     for the row (the employer part bounded above by the plan's own match and profit-sharing terms);
   - SA42F-13: an owner who dies before the household's separation with employer money not fully vested in a workplace
     account, and a survivor alive at the separation;
   - SA42F-15: a joint plan with two HSAs planned whose owners' windows differ in a row, and planned dollars over the family base;
   - SA42F-25: a planned change dated strictly inside a row (on the account owner's clock) while that owner's window is open;
   - SA42F-14 and SA42F-24 change the app only (the form's preset, the limit cards): no corpus plan.
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
const fin = (v) => Number.isFinite(Number(v));
const plans = (comp) => {
  const { entries, omissions } = cap.corpusWithDiagnostics({ composition: comp });
  if (omissions.length) throw new Error(comp + ' omissions: ' + JSON.stringify(omissions));
  return entries;
};
const workplace = (a) => /401k|403b|457/.test(String(a && a.type));
const planned = (a) => Number(a.contribution) > 0 || Number(a.contributionPct) > 0;
const askDollars = (a, salary) => (Number(a.contributionPct) > 0 ? salary * Number(a.contributionPct) / 100 : 0) + (Number(a.contribution) > 0 ? Number(a.contribution) : 0);

function scan(entry) {
  const p = JSON.parse(JSON.stringify(entry.plan));
  const out = { ira: [], hsa65: [], f12: [], f13: [], f15: [], f25: [] };
  const r = p.retirement || {}, pr = p.profile || {};
  const res = E.runPlan(JSON.parse(JSON.stringify(p)));
  const rows = res.rows || [];
  const start = Number(pr.age), spouseOn = !!pr.spouseOn, stochastic = p.assumptions.method !== 'simple';
  const accounts = p.accounts || [];
  const ownerOf = (a) => (a.owner === 'spouse' && spouseOn ? 'spouse' : 'self');
  // SA42F-13: plan level.
  const sep = Number(pr.retireAge);
  const selfDeath = fin(r.selfLife) ? Number(r.selfLife) : Infinity, spouseDeathAtSelf = spouseOn && fin(r.spouseLife) ? Number(r.spouseLife) - Number(pr.spouseAge) + start : Infinity;
  accounts.filter((a) => workplace(a) && (a.matchOn || Number(a.profitShare) > 0)).forEach((a) => {
    const o = ownerOf(a), death = o === 'spouse' ? spouseDeathAtSelf : selfDeath, survivorAlive = o === 'spouse' ? selfDeath > sep : spouseOn && spouseDeathAtSelf > sep;
    const notVested = Number(a.vesting) < 100 || (a.vestingSchedule && a.vestingSchedule !== 'immediate');
    if (death < sep - 1e-9 && death > start && survivorAlive && notVested) out.f13.push(a.id + ' death ' + death + ' before ' + sep);
  });
  for (let k = 1; k < rows.length; k++) {
    const age = rows[k - 1].age, rowAge = rows[k].age, dur = rowAge - age, yi = age - start;
    const spouseAge = Number(pr.spouseAge) + yi;
    const win = E.ownerContributionWindow(p, age, spouseAge, dur), work = E.householdWorkDurations(p, age, spouseAge, dur);
    const g = Math.pow(1 + (Number(p.employment.growth) || 0) / 100, yi);
    const salary = { self: (Number(p.employment.salary) || 0) * g, spouse: spouseOn ? (Number(p.employment.spouseSalary) || 0) * g : 0 };
    const pay = { self: salary.self * work.self, spouse: salary.spouse * work.spouse };
    const ownAge = (o) => (o === 'spouse' ? spouseAge : age);
    const d = (o, ira) => (ira ? (o === 'spouse' ? win.durations.spouseIra : win.durations.selfIra) : (o === 'spouse' ? win.durations.spouse : win.durations.self));
    // spousal IRA
    const joint = spouseOn && E.householdFilingFor(p, age) === 'mfj';
    if (joint) {
      const iraAsk = { self: 0, spouse: 0 };
      accounts.filter((a) => (a.type === 'traditionalIRA' || a.type === 'rothIRA') && planned(a)).forEach((a) => { const o = ownerOf(a); iraAsk[o] += askDollars(a, salary[o]) * d(o, true); });
      ['self', 'spouse'].forEach((o) => {
        const other = o === 'self' ? 'spouse' : 'self';
        if (iraAsk[o] > pay[o] + 0.005 && pay[o] >= pay[other] - 1e-9 && d(o, true) > 0) out.ira.push(rowAge + ' ' + o + ' higher earner asks ' + Math.round(iraAsk[o]) + ' on ' + Math.round(pay[o]));
      });
      const lower = pay.self < pay.spouse ? 'self' : (pay.spouse < pay.self ? 'spouse' : null);
      if (lower && iraAsk.self > 0 && iraAsk.spouse > 0 && iraAsk[lower] > pay[lower] + 0.005) out.ira.push(rowAge + ' both ask; lower ' + lower);
    }
    // HSA at 65, SA42F-15
    const hsaAsk = { self: 0, spouse: 0 };
    accounts.filter((a) => a.type === 'hsa' && planned(a)).forEach((a) => {
      const o = ownerOf(a), dd = d(o, false);
      hsaAsk[o] += askDollars(a, salary[o]) * dd;
      if (dd > 0 && ownAge(o) + dd > 65 + 1e-9) out.hsa65.push(rowAge + ' ' + o + ' ' + ownAge(o) + '+' + dd.toFixed(2));
    });
    if (spouseOn && hsaAsk.self > 0 && hsaAsk.spouse > 0 && Math.abs(d('self', false) - d('spouse', false)) > 1e-9 && hsaAsk.self + hsaAsk.spouse > (E.householdFilingFor(p, age) === 'mfj' ? RULES.retirement.hsa.family : RULES.retirement.hsa.self) * dur)
      out.f15.push(rowAge + ' windows ' + d('self', false).toFixed(2) + '/' + d('spouse', false).toFixed(2));
    // SA42F-12
    accounts.filter((a) => workplace(a) && planned(a) && (a.matchOn || Number(a.profitShare) > 0)).forEach((a) => {
      const o = ownerOf(a), dd = d(o, false);
      if (!(dd > 0)) return;
      const eligible = salary[o] * dd, deferral = askDollars(a, salary[o]) * dd;
      const employer = (a.matchOn ? Math.min(deferral, eligible * (Number(a.matchCap) || 0) / 100) * (Number(a.matchRate) || 0) / 100 : 0) + eligible * (Number(a.profitShare) || 0) / 100;
      if (deferral + employer > pay[o] + 0.005) out.f12.push(rowAge + ' ' + a.id + ' ' + Math.round(deferral + employer) + ' > ' + Math.round(pay[o]));
    });
    // SA42F-25
    accounts.filter((a) => planned(a) && Array.isArray(a.futureChanges)).forEach((a) => {
      const o = ownerOf(a), oa = ownAge(o), dd = d(o, a.type === 'traditionalIRA' || a.type === 'rothIRA');
      a.futureChanges.forEach((c) => { const x = Number(c && c.age); if (dd > 0 && x > oa + 1e-9 && x < oa + Math.min(dur, dd) - 1e-9) out.f25.push(rowAge + ' ' + a.id + ' change at ' + x); });
    });
  }
  if (stochastic) Object.keys(out).forEach((k) => { if (out[k].length) out[k].unshift('(' + p.assumptions.method + ')'); });
  return out;
}

// R44 C5 (SA43-C): a direction is read from the pre-repair engine run on an INPUT that does what the repair does, where one exists.
// HSA at 65: the same plan with every HSA's planned contribution ending at its owner's 65th birthday (a future change to 0 there),
// which neither deposits nor redirects past 65 -- what the ruling does. The direction of each headline figure is printed.
function hsa65Direction(entry) {
  const p = JSON.parse(JSON.stringify(entry.plan)), pr = p.profile;
  const q = JSON.parse(JSON.stringify(p));
  (q.accounts || []).forEach((a) => {
    if (!a || a.type !== 'hsa') return;
    // a change's age is on its account owner's own clock, so 65 for either owner; at this tree a change inside a row starts at the
    // next row, where the ruling prorates -- the same direction, a slightly smaller size
    a.futureChanges = (a.futureChanges || []).filter((c) => Number(c.age) < 65 - 1e-9).concat([{ age: 65, mode: 'set', value: 0 }]);
  });
  const A = E.runPlan(JSON.parse(JSON.stringify(p))), B = E.runPlan(JSON.parse(JSON.stringify(q)));
  const last = (r) => r.rows[r.rows.length - 1], sum = (r, k) => r.rows.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const d = (x, y) => (Math.abs(y - x) < 0.005 ? 'same' : (y > x ? 'rises ' : 'falls ') + Math.abs(y - x).toFixed(0));
  return { taxes: d(sum(A, 'taxes'), sum(B, 'taxes')), taxable: d(last(A).taxable, last(B).taxable), hsa: d(last(A).hsa, last(B).hsa), contributions: d(sum(A, 'contributions'), sum(B, 'contributions')), stopApplied: JSON.stringify(A.rows) !== JSON.stringify(B.rows) };
}

const KEYS = ['ira', 'hsa65', 'f12', 'f13', 'f15', 'f25'];
for (const comp of ['control', 'expanded']) {
  const entries = plans(comp), movers = Object.fromEntries(KEYS.map((k) => [k, []]));
  for (const e of entries) { const s = scan(e); KEYS.forEach((f) => { if (s[f].length) movers[f].push(e.name + ' [' + s[f].slice(0, 3).join('; ') + (s[f].length > 3 ? '; +' + (s[f].length - 3) : '') + ']'); }); }
  console.log('== ' + comp + ' (' + entries.length + ' plans)');
  KEYS.forEach((f) => console.log('  ' + f + ': ' + (movers[f].length ? '\n    ' + movers[f].join('\n    ') : 'none')));
}

// Positive control: the witnesses in tests/audit-s5aa-r43-contributions.test.js.
{
  const C = require(path.join(ROOT, 'audit', 'S5AA', 'R42F', 'SA42F', 'CONTRIB', 'lib.js'));
  const { acct, work } = C;
  const iraCouple = (s1, s2, a1, a2) => work({ age: 45, couple: true, spouseAge: 45, retireAge: 46, endAge: 46, salary: s1, spouseSalary: s2,
    accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('iraS', 'traditionalIRA', 0, { contribution: a1, priority: 1 }), acct('iraP', 'rothIRA', 0, { owner: 'spouse', contribution: a2, priority: 2 })] });
  const cases = [
    ['ruling IRA, higher earner', iraCouple(4000, 3000, 7500, 0)], ['ruling IRA control, lower earner alone', iraCouple(3000, 4000, 7500, 0)], ['ruling IRA, both', iraCouple(3000, 4000, 7500, 7500)],
    ['ruling HSA at 65', work({ age: 60, couple: true, spouseAge: 64.5, retireAge: 70, endAge: 63, salary: 100000, spouseSalary: 100000, accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('hsaP', 'hsa', 0, { owner: 'spouse', contribution: 4000, priority: 1 })] })],
    ['ruling HSA control, 63', work({ age: 63, retireAge: 70, endAge: 65, salary: 100000, accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('hsa', 'hsa', 0, { contribution: 4000, priority: 1 })] })],
    ['SA42F-12 witness', work({ age: 45, salary: 30000, retireAge: 46, endAge: 46, accounts: [acct('brok', 'taxable', 0), acct('k', 'traditional401k', 0, { contribution: 24500, profitShare: 25 })] })],
    ['SA42F-12 control, $60,000', work({ age: 45, salary: 60000, retireAge: 46, endAge: 46, accounts: [acct('brok', 'taxable', 0), acct('k', 'traditional401k', 0, { contribution: 24500, profitShare: 25 })] })],
    ['SA42F-13 witness', work({ age: 45, couple: true, spouseAge: 45, retireAge: 50, stop: 50, endAge: 52, salary: 100000, spouseSalary: 50000, selfLife: 47, accounts: [acct('brok', 'taxable', 0), acct('k', 'traditional401k', 0, { contribution: 10000, matchOn: true, matchRate: 100, matchCap: 10, vesting: 0, yearsOfService: 0 })] })],
    ['SA42F-15 witness', work({ age: 44, couple: true, spouseAge: 45, retireAge: 45.5, stop: 70, endAge: 46, salary: 100000, spouseSalary: 100000, accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('hsaSpouse', 'hsa', 0, { owner: 'spouse', contribution: 8750, priority: 1 }), acct('hsaSelf', 'hsa', 0, { contribution: 8750, priority: 2 })] })],
    ['SA42F-25 witness, 46.5', work({ age: 45, salary: 100000, retireAge: 65, endAge: 65, accounts: [acct('brok', 'taxable', 0), acct('k', 'traditional401k', 0, { contribution: 10000, futureChanges: [{ age: 46.5, mode: 'set', value: 0 }] })] })],
    ['SA42F-25 control, 47', work({ age: 45, salary: 100000, retireAge: 65, endAge: 65, accounts: [acct('brok', 'taxable', 0), acct('k', 'traditional401k', 0, { contribution: 10000, futureChanges: [{ age: 47, mode: 'set', value: 0 }] })] })],
  ];
  console.log('== positive control');
  for (const [name, p] of cases) { const s = scan({ name, plan: p }); console.log('  ' + name + ': ' + (KEYS.filter((f) => s[f].length).map((f) => f + ' [' + s[f].slice(0, 2).join('; ') + ']').join(' ') || 'none')); }
}

// R44 C5: the direction for every plan the hsa65 flag names.
for (const comp of ['control', 'expanded']) for (const e of plans(comp)) { if (scan(e).hsa65.length) console.log('== C5 direction (' + comp + ') ' + e.name + ': ' + JSON.stringify(hsa65Direction(e))); }
