/* S5AA R42 prediction: which corpus plans can each R41F repair move? Run on the UNREPAIRED tree, before any engine edit.
   Usage: node audit/S5AA/R42/prediction/r41f_corpus_scan.js [<source tree>]
   Each scan tests the condition a repair changes, row by row, with the engine's own exported helpers at today's source:
   - R41F-05: a Social Security amount that is present and not a number (nothing else changes);
   - R41F-03: an IRA owner whose own work covers part of a row while, on a joint return, the spouse's covers more,
     with an IRA planned contribution (the window grows from the owner's work to the longer of the two);
   - R41F-04: a Roth IRA planned contribution in a row where the salary proxy at the annual rate and at the row's
     worked share give different Roth limits;
   - R41F-01: a row in which one person's own earnings-test withholding (tested alone) is capped by their own benefit,
     while the other receives a spousal benefit on that person's record that the other's own earnings test does not
     already withhold in full;
   - R41F-02: a survivor row after a death, where the deceased claimed before full retirement age and had months
     withheld by the earnings test before the death.
   The Social Security scans pass startHistory 0 (a historical COLA is not modelled, and such a plan is named) and
   count employment-type streams as the engine does, with the inflation factor at the row's opening. */
'use strict';
const path = require('node:path');
const ROOT = path.resolve(process.argv[2] || '.');
const fs = require('node:fs');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const IRA = (a) => a && (a.type === 'traditionalIRA' || a.type === 'rothIRA');
const plans = (comp) => {
  const { entries, omissions } = cap.corpusWithDiagnostics({ composition: comp });
  if (omissions.length) throw new Error(comp + ' omissions: ' + JSON.stringify(omissions));
  return entries;
};
function rowsOf(p) { const r = E.runPlan(JSON.parse(JSON.stringify(p))); return r.rows || []; }
function salaryAt(p, owner, yearProgress) {
  const base = Number(owner === 'spouse' ? p.employment.spouseSalary : p.employment.salary) || 0;
  return base * Math.pow(1 + (Number(p.employment.growth) || 0) / 100, yearProgress);
}
function hasStreams(p) { return (p.retirement.otherIncomes || []).some((i) => ['employment', 'selfEmployment'].includes(i && i.type)); }

function scan(entry) {
  const p = JSON.parse(JSON.stringify(entry.plan));
  const out = { f05: [], f03: [], f04: [], f01: [], f02: [] };
  const r = p.retirement || {}, pr = p.profile || {};
  ['ssBenefit', 'spouseSS'].forEach((k) => { if (r[k] !== undefined && r[k] !== null && !isNum(r[k])) out.f05.push(k); });
  const rows = rowsOf(p);
  const start = Number(pr.age);
  const credited = { self: 0, spouse: 0 };
  let creditedAtDeath = { self: null, spouse: null };
  for (let k = 1; k < rows.length; k++) {
    const age = rows[k - 1].age, rowAge = rows[k].age, dur = rowAge - age, yp = age - start;
    const spouseAge = Number(pr.spouseAge) + (age - start);
    const work = E.householdWorkDurations(p, age, spouseAge, dur);
    const win = E.ownerContributionWindow(p, age, spouseAge, dur);
    const joint = !!pr.spouseOn && E.householdFilingFor(p, age) === 'mfj';
    const stop = Number(p.employment.contributionStop);
    const alive = (life, at) => Math.max(0, Math.min(dur, isNum(Number(life)) ? Number(life) - at : Infinity));
    // R41F-03: the window as the repair reads it -- the longer of the owner's own work and, on a joint return, the spouse's.
    const newSelfIra = Math.max(win.durations.self, joint ? Math.max(0, Math.min(stop - age, work.spouse, alive(r.selfLife, age))) : 0);
    const newSpouseIra = Math.max(win.durations.spouse, joint ? Math.max(0, Math.min(stop - spouseAge, work.self, alive(r.spouseLife, spouseAge))) : 0);
    (p.accounts || []).filter(IRA).forEach((a) => {
      const planned = Number(a.contribution) || Number(a.contributionPct) || 0;
      if (planned <= 0) return;
      const owner = a.owner === 'spouse' ? 'spouse' : 'self';
      const oldW = owner === 'spouse' ? win.durations.spouseIra : win.durations.selfIra, newW = owner === 'spouse' ? newSpouseIra : newSelfIra;
      if (newW > oldW + 1e-9) out.f03.push(rowAge + ':' + a.id + ' ' + oldW.toFixed(3) + '->' + newW.toFixed(3));
      // R41F-04: the Roth limit at the annual salary rates against the row's worked share of them.
      if (a.type === 'rothIRA') {
        const sal = work.self > 0 ? salaryAt(p, 'self', yp) : 0, ssal = work.spouse > 0 ? salaryAt(p, 'spouse', yp) : 0;
        const limit = E.contributionLimit('ira', (owner === 'spouse' ? spouseAge : age) + dur, pr.filing);
        const oldL = E.rothContributionLimit(p, a, sal, ssal, age, limit), newL = E.rothContributionLimit(p, a, sal * work.self, ssal * work.spouse, age, limit);
        if (Math.abs(oldL - newL) > 0.005) out.f04.push(rowAge + ':' + a.id + ' limit ' + oldL.toFixed(2) + '->' + newL.toFixed(2));
      }
    });
    // Social Security rows.
    const earn = (es, esp) => ({ self: es, spouse: esp, streamSelf: (o.wageSelf || 0) + (o.seSelf || 0), streamSpouse: (o.wageSpouse || 0) + (o.seSpouse || 0) });
    // Employment-type streams count as earnings too (wages, and net self-employment at 0.9235), as the engine passes them.
    const infl = Math.pow(1 + (Number(p.assumptions.inflation) || 0) / 100, yp), o = (p.retirement.otherIncomes || []).length ? E.otherIncomeFor(p, age, rowAge, infl, 0) : {};
    const eSelf = salaryAt(p, 'self', yp) * work.self + (o.wageSelf || 0) + (o.seSelf || 0) * 0.9235,
      eSpouse = pr.spouseOn ? salaryAt(p, 'spouse', yp) * work.spouse + (o.wageSpouse || 0) + (o.seSpouse || 0) * 0.9235 : 0;
    const d = (es, esp) => E.householdSocialSecurityDetail(p, age, rowAge, spouseAge, 0, earn(es, esp), credited);
    const base = d(eSelf, eSpouse);
    if (pr.spouseOn) {
      const selfClaim = Number(r.ssClaim), spouseClaimAtSelf = Number(r.spouseClaim) - Number(pr.spouseAge) + start;
      const selfPia = E.ssPiaAt(p, 'self', age, 0), spousePia = E.ssPiaAt(p, 'spouse', spouseAge, 0);
      const selfAlive = !(Number(r.selfLife) <= age), spouseAlive = !(Number(r.spouseLife) <= spouseAge);
      const bothFiled = selfClaim < rowAge && spouseClaimAtSelf < rowAge;
      // A worker's own test, isolated (the other person's earnings set to 0): capped when ten times the earnings withholds no
      // more. It moves only if the other is paid on the worker's record AND that benefit is not already wholly withheld by the
      // other's own earnings (their own test capped too), since the repair takes only what is left of it.
      const own = (es, esp) => d(es, esp).withheld;
      const capped = (es, esp, scaleSelf) => { const b = own(es, esp); return b > 0 && Math.abs(own(scaleSelf ? es * 10 : es, scaleSelf ? esp : esp * 10) - b) < 0.01; };
      if (eSelf > 0 && selfAlive && spouseAlive && bothFiled && 0.5 * selfPia > spousePia && capped(eSelf, 0, true) && !(eSpouse > 0 && capped(0, eSpouse, false)))
        out.f01.push(rowAge + ' self-capped');
      if (eSpouse > 0 && selfAlive && spouseAlive && bothFiled && 0.5 * spousePia > selfPia && capped(0, eSpouse, false) && !(eSelf > 0 && capped(eSelf, 0, true)))
        out.f01.push(rowAge + ' spouse-capped');
    }
    credited.self += base.creditMonths.self; credited.spouse += base.creditMonths.spouse;
    if (creditedAtDeath.self === null && isNum(Number(r.selfLife)) && Number(r.selfLife) <= rowAge) creditedAtDeath.self = credited.self;
    if (creditedAtDeath.spouse === null && pr.spouseOn && isNum(Number(r.spouseLife)) && Number(r.spouseLife) - Number(pr.spouseAge) + start <= rowAge) creditedAtDeath.spouse = credited.spouse;
    // R41F-02: a survivor row, the deceased having claimed before FRA with credited months.
    if (pr.spouseOn && r.survivor) {
      [['self', 'spouse'], ['spouse', 'self']].forEach(([dec, surv]) => {
        const decDeathAtSelf = dec === 'self' ? Number(r.selfLife) : Number(r.spouseLife) - Number(pr.spouseAge) + start;
        const survAlive = surv === 'self' ? !(Number(r.selfLife) <= age) : !(Number(r.spouseLife) <= spouseAge);
        const decClaimAtSelf = dec === 'self' ? Number(r.ssClaim) : Number(r.spouseClaim) - Number(pr.spouseAge) + start;
        const decFra = E.ssFullRetirementAge(p, dec), decClaimOwn = Number(dec === 'self' ? r.ssClaim : r.spouseClaim);
        if (isNum(decDeathAtSelf) && decDeathAtSelf <= age && survAlive && decClaimAtSelf < decDeathAtSelf && decClaimOwn < decFra && (creditedAtDeath[dec] || 0) > 0)
          out.f02.push(rowAge + ' ' + dec + ' died, credited ' + creditedAtDeath[dec]);
      });
    }
  }
  return out;
}

for (const comp of ['control', 'expanded']) {
  const entries = plans(comp), movers = { f05: [], f03: [], f04: [], f01: [], f02: [] }, notes = [];
  for (const e of entries) {
    const s = scan(e);
    Object.keys(movers).forEach((f) => { if (s[f].length) movers[f].push(e.name + ' [' + s[f].slice(0, 4).join('; ') + (s[f].length > 4 ? '; +' + (s[f].length - 4) : '') + ']'); });
    if (hasStreams(e.plan)) notes.push(e.name + ' has an employment-type stream');
    if (e.plan.assumptions && e.plan.assumptions.method === 'historical' && (s.f01.length || s.f02.length)) notes.push(e.name + ' is historical (COLA history not modelled by the scan)');
  }
  console.log('== ' + comp + ' (' + entries.length + ' plans)');
  Object.keys(movers).forEach((f) => console.log('  R41F-' + f.slice(1) + ': ' + (movers[f].length ? movers[f].length + ' -> ' + movers[f].join(' | ') : 'none')));
  if (notes.length) console.log('  notes: ' + notes.join(' | '));
}
console.log('DONE');

/* POSITIVE CONTROL: the scan must flag each of ChatGPT's five R41F witnesses (built as its repro script builds them, with the
   R40 grid's plan builder). A scan that finds nothing in the corpus is evidence only if it finds these. */
{
  const Lg = require(path.join(ROOT, 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
  const w = {};
  const spousal = Lg.basePlan({ couple: true, age: 45, spouseAge: 44, retireAge: 45.5, endAge: 46, salary: 10000, spouseSalary: 100000, spending: 0, returnRate: 0, inflation: 0,
    accounts: [Lg.account('self-ira', 'traditionalIRA', 0, { contribution: 7500 }), Lg.account('cash', 'taxable', 0, { basisPct: 100 })] });
  spousal.employment.contributionStop = 55; w.f03 = spousal;
  const roth = Lg.basePlan({ couple: true, age: 44, spouseAge: 45, retireAge: 45.5, endAge: 45, salary: 0, spouseSalary: 260000, spending: 0, returnRate: 0, inflation: 0,
    accounts: [Lg.account('self-roth', 'rothIRA', 0, { contribution: 7500 })] });
  roth.employment.contributionStop = 55; w.f04 = roth;
  const ss = Lg.basePlan({ couple: true, age: 62, spouseAge: 67, retireAge: 67, endAge: 70, salary: 200000, spouseSalary: 0, spending: 0, returnRate: 0, inflation: 0,
    ssBenefit: 3000, spouseSS: 0, accounts: [Lg.account('cash', 'taxable', 2000000, { basisPct: 100 })] });
  Object.assign(ss.retirement, { ssClaim: 62, spouseClaim: 67, ssCola: 0, survivor: true, selfLife: 67.5, spouseLife: 95 });
  ss.employment.contributionStop = 67; ss.advanced.healthOn = false; w.f01 = ss; w.f02 = ss;
  const bad = Lg.basePlan({ age: 66, retireAge: 66, endAge: 68, spending: 0, returnRate: 0, inflation: 0, ssBenefit: 2500,
    accounts: [Lg.account('cash', 'taxable', 0, { basisPct: 100 })] });
  Object.assign(bad.retirement, { ssClaim: 67, ssCola: 0, ssBenefit: 'abc' }); bad.advanced.healthOn = false; w.f05 = bad;
  const flagged = Object.keys(w).map((f) => { const s = scan({ name: 'witness:' + f, plan: w[f] }); return 'R41F-' + f.slice(1) + ' ' + (s[f].length ? 'FLAGGED [' + s[f].slice(0, 3).join('; ') + ']' : 'MISSED'); });
  console.log('== positive control (ChatGPT\'s witnesses)\n  ' + flagged.join('\n  '));
  if (flagged.some((x) => x.includes('MISSED'))) { console.log('POSITIVE CONTROL FAILED'); process.exitCode = 1; }
}
