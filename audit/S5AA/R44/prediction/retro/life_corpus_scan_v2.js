/* S5AA R44 CORRECTED COPY of audit/S5AA/R43/prediction/life_corpus_scan.js (R43-04). Corrections:
   - C1 (SA43-D): SA42F-11 reads whether the spouse is alive from E.householdSeniorAges(), the engine's survivorship rule.
   Everything else is the R43 scan unchanged. */
/* S5AA R43 prediction, part 4a (life events, required distributions, Medicare): which corpus plans can each repair move? Run on the
   tree BEFORE the part 4a engine edits.   Usage: node audit/S5AA/R43/prediction/life_corpus_scan.js [<source tree>]
   Row by row, from the plan's inputs and the engine's exported helpers; a stochastic plan is marked:
   - SA42F-03: RMDs on, an owner who dies inside a tax year that is their first distribution year (the year they reach their start
     age, or for a still-working participant's current-employer 401(k) the year they retire), with a pre-tax balance of theirs;
   - SA42F-04: no spouse in the plan and an account whose owner is "spouse";
   - SA42F-11: health costs on, a spouse alive and 65 or over who is not working in a part of the row the self works;
   - the owner's ruling, survivor costs: a spouse in the plan, the self dying after the start and before the retirement age, the
     spouse alive then and without a salary in their work window at the death, and spending or health costs to bring forward;
   - SA42F-29: survivor spending on, a spouse in the plan, and a death strictly inside a row, after its opening and before a
     retirement that also falls inside it.
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

function scan(entry) {
  const p = JSON.parse(JSON.stringify(entry.plan));
  const out = { f03: [], f04: [], f11: [], ruling: [], f29: [] };
  const r = p.retirement || {}, pr = p.profile || {}, adv = p.advanced || {};
  const start = Number(pr.age), end = Number(pr.endAge), spouseOn = !!pr.spouseOn, retire = Number(pr.retireAge);
  const selfDeath = fin(r.selfLife) ? Number(r.selfLife) : Infinity;
  const spouseDeathAtSelf = spouseOn && fin(r.spouseLife) ? Number(r.spouseLife) - Number(pr.spouseAge) + start : Infinity;
  const accounts = p.accounts || [];
  // SA42F-04
  if (!spouseOn) accounts.forEach((a, i) => { if (a && a.owner === 'spouse') out.f04.push('accounts.' + i + ' ' + a.type); });
  // the ruling
  if (spouseOn && selfDeath > start && selfDeath < retire - 1e-9 && selfDeath < end && spouseDeathAtSelf > selfDeath) {
    const spouseAtDeath = Number(pr.spouseAge) + (selfDeath - start);
    const working = (Number(p.employment.spouseSalary) || 0) > 0 && spouseAtDeath < retire - 1e-9;
    const costs = (Number(r.spending) || 0) > 0 || (r.stages || []).length > 0 || ['fixedReal', 'guardrails', 'vpw', 'guyton', 'percentPortfolio'].includes(r.strategy) || adv.healthOn || adv.ltcOn;
    if (!working && costs) out.ruling.push('self dies ' + selfDeath + ' before ' + retire + ', spouse ' + spouseAtDeath.toFixed(2) + ' not working');
  }
  // SA42F-03: plan level, by owner
  if (adv.rmdOn) {
    const owners = [['self', start, selfDeath, 0]];
    if (spouseOn) owners.push(['spouse', Number(pr.spouseAge), fin(r.spouseLife) ? Number(r.spouseLife) : Infinity, 1]);
    owners.forEach(([key, ownStart, death, idx]) => {
      if (!(death > ownStart) || !Number.isFinite(death)) return;
      const startAge = E.rmdStartAge ? E.rmdStartAge(p, ownStart) : 73;
      const yearOfDeath = Math.floor(death - ownStart + (ownStart - Math.floor(ownStart)) + 1e-9);   // tax years since the plan's start
      const firstIraYear = startAge - Math.floor(ownStart);
      const mine = accounts.filter((a) => a && (a.owner === 'spouse' ? 1 : 0) === idx && (a.type === 'traditionalIRA' || /401k|403b|457/.test(a.type) && !/roth/i.test(a.type)) && Number(a.balance) > 0);
      if (!mine.length) return;
      const retireOwn = retire - start + ownStart;
      const firstPlanYear = Math.max(firstIraYear, Math.floor(retireOwn - Math.floor(ownStart) + 1e-9));
      if (yearOfDeath === firstIraYear || (mine.some((a) => /401k/.test(a.type)) && yearOfDeath === firstPlanYear && retireOwn > startAge)) out.f03.push(key + ' dies ' + death + ' in year ' + yearOfDeath);
    });
  }
  // SA42F-11 and SA42F-29: row by row
  const res = E.runPlan(JSON.parse(JSON.stringify(p))), rows = res.rows || [];
  for (let k = 1; k < rows.length; k++) {
    const age = rows[k - 1].age, rowAge = rows[k].age, dur = rowAge - age, spouseAge = Number(pr.spouseAge) + (age - start);
    if (adv.healthOn && spouseOn) {
      const work = E.householdWorkDurations(p, age, spouseAge, dur), retired = Math.max(0, rowAge - Math.max(age, retire));
      // R44 C1 (SA43-D): who is alive is the engine's own answer (householdSeniorAges, decision 7: alive at the row's opening in the
      // year of death), not a strict death-after-opening test.
      const spouseAlive = E.householdSeniorAges(p, age)[1] >= 0;
      if (spouseAlive && spouseAge >= 65 && Math.max(0, dur - retired - work.spouse) > 1e-9) out.f11.push(rowAge + ' spouse ' + spouseAge.toFixed(2));
    }
    if (r.survivor && spouseOn && retire > age + 1e-9 && retire < rowAge - 1e-9 && Number(r.survivorSpendingReduction) > 0) {
      [selfDeath, spouseDeathAtSelf].forEach((d) => { if (d >= age - 1e-9 && d < retire - 1e-9) out.f29.push(rowAge + ' death ' + d.toFixed(2) + ' before ' + retire); });
    }
  }
  if (p.assumptions.method !== 'simple') Object.keys(out).forEach((k) => { if (out[k].length) out[k].unshift('(' + p.assumptions.method + ')'); });
  return out;
}

const KEYS = ['f03', 'f04', 'f11', 'ruling', 'f29'];
for (const comp of ['control', 'expanded']) {
  const entries = plans(comp), movers = Object.fromEntries(KEYS.map((k) => [k, []]));
  for (const e of entries) { const s = scan(e); KEYS.forEach((f) => { if (s[f].length) movers[f].push(e.name + ' [' + s[f].slice(0, 3).join('; ') + (s[f].length > 3 ? '; +' + (s[f].length - 3) : '') + ']'); }); }
  console.log('== ' + comp + ' (' + entries.length + ' plans)');
  KEYS.forEach((f) => console.log('  ' + f + ': ' + (movers[f].length ? '\n    ' + movers[f].join('\n    ') : 'none')));
}

// Positive control: the witnesses in tests/audit-s5aa-r43-life-events.test.js.
{
  const R = require(path.join(ROOT, 'audit', 'S5AA', 'R42F', 'SA42F', 'RMD-ROTH', 'lib.js'));
  const SH = require(path.join(ROOT, 'audit', 'S5AA', 'R42F', 'SA42F', 'STATE-HEALTH', 'common.js'));
  const L = require(path.join(ROOT, 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
  const ira = (life) => { const p = R.plan({ age: 72, endAge: 76, spouseOn: true, spouseAge: 65, accounts: [R.acct('ira', 'traditionalIRA', 500000)] }); p.retirement.selfLife = life; return p; };
  const k401 = () => { const p = R.plan({ age: 74, endAge: 77, spouseOn: true, spouseAge: 65, retireAge: 75.3, accounts: [R.acct('k', 'traditional401k', 500000, { contribution: 0, currentEmployerPlan: true })] }); p.employment.salary = 100000; p.employment.contributionStop = 75.3; p.retirement.selfLife = 75.6; return p; };
  const spouseOwned = () => R.plan({ age: 75, endAge: 77, retireAge: 75, spouseOn: false, spouseAge: 50, spending: 20000, qcd: 5000, accounts: [R.acct('ira', 'traditionalIRA', 300000, { owner: 'spouse' })] });
  const med = (swap) => { const p = swap ? SH.base({ age: 68, endAge: 71, retireAge: 67, filing: 'mfj', spouseOn: true, spouseAge: 60 }) : SH.base({ age: 60, endAge: 63, retireAge: 67, filing: 'mfj', spouseOn: true, spouseAge: 68 });
    Object.assign(p.employment, swap ? { spouseSalary: 80000, contributionStop: 101 } : { salary: 80000, contributionStop: 101 }); Object.assign(p.advanced, { healthOn: true, healthCost: 0, healthInflation: 0 }); return p; };
  const early = (ss) => { const p = L.basePlan({ couple: true, age: 55, spouseAge: 63, retireAge: 65, endAge: 60, salary: 100000, spouseSalary: ss, spending: 50000, accounts: [L.account('brok', 'taxable', 2000000, { basisPct: 100 })] });
    p.employment.contributionStop = 65; Object.assign(p.retirement, { selfLife: 56.5, survivor: true, survivorSpendingReduction: 0 }); return p; };
  const cut = (ra) => { const p = L.basePlan({ couple: true, age: 60, spouseAge: 60, retireAge: ra, endAge: 63, strategy: 'incomeFirst', spending: 80000, spouseSalary: 10000,
    accounts: [L.account('roth', 'rothIRA', 900000), L.account('sroth', 'rothIRA', 900000, { owner: 'spouse' })] }); Object.assign(p.retirement, { survivor: true, survivorSpendingReduction: 50, selfLife: 60.25 }); return p; };
  const cases = [['SA42F-03 IRA witness', ira(73.5)], ['SA42F-03 control, lives', ira(120)], ['SA42F-03 401(k) witness', k401()], ['SA42F-04 witness', spouseOwned()],
    ['SA42F-11 witness', med(false)], ['SA42F-11 control, swapped', med(true)], ['ruling witness, no salary', early(0)], ['ruling control, salary', early(40000)],
    ['SA42F-29 witness', cut(60.5)], ['SA42F-29 control, retire 60', cut(60)]];
  console.log('== positive control');
  for (const [name, p] of cases) { const s = scan({ name, plan: p }); console.log('  ' + name + ': ' + (KEYS.filter((f) => s[f].length).map((f) => f + ' [' + s[f].slice(0, 2).join('; ') + ']').join(' ') || 'none')); }
}
