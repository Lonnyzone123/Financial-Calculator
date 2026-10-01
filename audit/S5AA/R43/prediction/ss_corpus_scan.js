/* S5AA R43 prediction, part 1 (Social Security): which corpus plans can each repair move? Run on the UNREPAIRED tree, before
   any engine edit.   Usage: node audit/S5AA/R43/prediction/ss_corpus_scan.js [<source tree>]
   Each scan tests the condition its repair changes, row by row, with the engine's own exported helpers at today's source:
   - SA42F-02: a row, on an owner's own clock, past a claim whose fraction of a year (from the COLA anchor) is larger than the
     row's, so floor(claim - anchor) + floor(age - claim) < floor(age - anchor), with a benefit base and a COLA, and someone
     paid on that record (the owner alive, or a spouse);
   - SA42F-17: the AIME path, with the self past 62 (whole years) at the start;
   - R42-01 and SA42F-18 (one repair: the earnings test's months are charged in order and credited to each benefit for its own
     months) can move a row with withholding that has (i) a change of a withheld person's monthly pay inside the row (a claim,
     the spousal start, a death, a survivor start), or (ii) a withheld person entitled to a survivor benefit in the row, or
     (iii) both people withheld while one is paid a spousal part on the other's record. A row can move only where the months
     can matter: the person claimed their own benefit before full retirement age, or draws a survivor benefit reduced for age,
     or the other person's annual withholding depends on the spousal share charged (an earner on both sides).
   The scans pass startHistory 0 (a historical COLA is not modelled, and such a plan is named) and count employment-type streams
   as the engine does, with the inflation factor at the row's opening. A condition is necessary, not sufficient: a flagged plan
   whose ordered count happens to equal the average count does not move, and the record says which flagged plans did not. */
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
function rowsOf(p) { const r = E.runPlan(JSON.parse(JSON.stringify(p))); return r.rows || []; }
function salaryAt(p, owner, yearProgress) {
  const base = Number(owner === 'spouse' ? p.employment.spouseSalary : p.employment.salary) || 0;
  return base * Math.pow(1 + (Number(p.employment.growth) || 0) / 100, yearProgress);
}
const claimOf = (p, owner) => Math.max(62, Number(owner === 'spouse' ? p.retirement.spouseClaim : p.retirement.ssClaim));
const startOf = (p, owner) => Number(owner === 'spouse' ? p.profile.spouseAge : p.profile.age);
const aimeOf = (p, owner) => owner !== 'spouse' && p.retirement.ssAdvanced && p.retirement.aime > 0;

function scan(entry) {
  const p = JSON.parse(JSON.stringify(entry.plan));
  const out = { f02: [], f17: [], ss: [] };
  const r = p.retirement || {}, pr = p.profile || {};
  const start = Number(pr.age), spouseOn = !!pr.spouseOn;
  const owners = spouseOn ? ['self', 'spouse'] : ['self'];
  const rows = rowsOf(p);
  const colaNonZero = !(Number(r.ssCola) === 0) || p.assumptions.method === 'historical';
  // SA42F-17
  if (aimeOf(p, 'self') && Math.floor(start) > 62 && (claimOf(p, 'self') < Number(pr.endAge) || spouseOn)) out.f17.push('self ' + start);
  const selfDeath = fin(r.selfLife) ? Number(r.selfLife) : Infinity;
  const spouseDeathAtSelf = spouseOn && fin(r.spouseLife) ? Number(r.spouseLife) - Number(pr.spouseAge) + start : Infinity;
  const credited = { self: 0, spouse: 0 };
  for (let k = 1; k < rows.length; k++) {
    const age = rows[k - 1].age, rowAge = rows[k].age, dur = rowAge - age, yp = age - start;
    const spouseAge = Number(pr.spouseAge) + (age - start);
    // SA42F-02
    owners.forEach((owner) => {
      const oa = owner === 'spouse' ? spouseAge : age, claim = claimOf(p, owner), st = startOf(p, owner);
      const anchor = aimeOf(p, owner) ? 62 : (claim < st ? claim : st);
      if (!(oa > claim) || !colaNonZero) return;
      const oldN = Math.max(0, Math.floor(claim - anchor)) + Math.max(0, Math.floor(oa - claim)), newN = Math.max(0, Math.floor(oa - anchor));
      if (oldN === newN || !(E.ssPiaBase(p, owner) > 0)) return;
      const ownAlive = owner === 'spouse' ? spouseAge < Number(r.spouseLife) : age < selfDeath;
      const otherAlive = spouseOn && (owner === 'spouse' ? age < selfDeath : spouseAge < Number(r.spouseLife));
      if (ownAlive || otherAlive) out.f02.push(rowAge + ' ' + owner + ' ' + oldN + '->' + newN);
    });
    // R42-01 / SA42F-18
    const work = E.householdWorkDurations(p, age, spouseAge, dur);
    const infl = Math.pow(1 + (Number(p.assumptions.inflation) || 0) / 100, yp);
    const o = (r.otherIncomes || []).length ? E.otherIncomeFor(p, age, rowAge, infl, 0) : {};
    const eSelf = salaryAt(p, 'self', yp) * work.self + (o.wageSelf || 0) + (o.seSelf || 0) * 0.9235;
    const eSpouse = spouseOn ? salaryAt(p, 'spouse', yp) * work.spouse + (o.wageSpouse || 0) + (o.seSpouse || 0) * 0.9235 : 0;
    const earn = (es, esp) => ({ self: es, spouse: esp, streamSelf: (o.wageSelf || 0) + (o.seSelf || 0), streamSpouse: (o.wageSpouse || 0) + (o.seSpouse || 0) });
    const d = (es, esp) => E.householdSocialSecurityDetail(p, age, rowAge, spouseAge, 0, earn(es, esp), credited);
    const base = d(eSelf, eSpouse);
    if (base.withheld > 1e-9) {
      const selfClaim = claimOf(p, 'self'), spouseClaimAtSelf = spouseOn ? claimOf(p, 'spouse') - Number(pr.spouseAge) + start : Infinity;
      const inside = (x) => Number.isFinite(x) && x > age + 1e-9 && x < rowAge - 1e-9;
      const survStart = (deathAtSelf, survivorOwnStart, survivorStartAtSelf) => survivorStartAtSelf;
      const selfSurvStart = spouseOn && r.survivor ? E.survivorStartAge(p, age + (spouseDeathAtSelf - age)) : Infinity;
      const spouseSurvStartAtSelf = spouseOn && r.survivor ? age + (E.survivorStartAge(p, spouseAge + (selfDeath - age)) - spouseAge) : Infinity;
      const boundaries = [selfClaim, spouseClaimAtSelf, Math.max(selfClaim, spouseClaimAtSelf), selfDeath, spouseDeathAtSelf, selfSurvStart, spouseSurvStartAtSelf];
      const why = [];
      if (boundaries.some(inside)) why.push('pay changes inside the row');
      const selfSurvivor = spouseOn && r.survivor && spouseDeathAtSelf < rowAge - 1e-9 && age < selfDeath;
      const spouseSurvivor = spouseOn && r.survivor && selfDeath < rowAge - 1e-9 && spouseDeathAtSelf > age;
      if ((selfSurvivor && base.creditMonths.self > 0) || (spouseSurvivor && base.creditMonths.spouse > 0)) why.push('a survivor benefit withheld');
      const selfPia = E.ssPiaAt(p, 'self', age, 0), spousePia = spouseOn ? E.ssPiaAt(p, 'spouse', spouseAge, 0) : 0;
      const spousalPart = spouseOn && (0.5 * selfPia > spousePia || 0.5 * spousePia > selfPia);
      if (spousalPart && base.creditMonths.self > 0 && base.creditMonths.spouse > 0) why.push('both withheld with a spousal part');
      // Can the months matter? An own claim before full retirement age, a survivor benefit reduced for age, or an earner on both sides.
      const early = (owner) => claimOf(p, owner) < E.ssFullRetirementAge(p, owner) - 1e-9;
      const matters = early('self') || (spouseOn && early('spouse')) || selfSurvivor || spouseSurvivor || (eSelf > 0 && eSpouse > 0);
      if (why.length && matters) out.ss.push(rowAge + ' ' + why.join('+') + ' [cm ' + base.creditMonths.self + '/' + base.creditMonths.spouse + ']');
    }
    credited.self += base.creditMonths.self; credited.spouse += base.creditMonths.spouse;
  }
  return out;
}

for (const comp of ['control', 'expanded']) {
  const entries = plans(comp), movers = { f02: [], f17: [], ss: [] }, notes = [];
  for (const e of entries) {
    const s = scan(e);
    Object.keys(movers).forEach((f) => { if (s[f].length) movers[f].push(e.name + ' [' + s[f].slice(0, 4).join('; ') + (s[f].length > 4 ? '; +' + (s[f].length - 4) : '') + ']'); });
    if (e.plan.assumptions && e.plan.assumptions.method === 'historical') notes.push(e.name + ' is historical');
  }
  console.log('== ' + comp + ' (' + entries.length + ' plans)');
  Object.keys(movers).forEach((f) => console.log('  ' + f + ': ' + (movers[f].length ? '\n    ' + movers[f].join('\n    ') : 'none')));
  if (notes.length) console.log('  notes: ' + notes.join('; '));
}

// Positive control: the scan must flag every witness in tests/audit-s5aa-r43-social-security.test.js, and none of its controls.
{
  const L = require(path.join(ROOT, 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
  const plan = (o, ret) => { const p = L.basePlan(Object.assign({ spending: 0, accounts: [L.account('cash', 'taxable', 5000000, { basisPct: 100 })] }, o));
    Object.assign(p.retirement, { ssCola: 0, survivor: false, selfLife: 120, spouseLife: 120 }, ret); p.advanced.healthOn = false; return p; };
  const fam = (c, s = 45000) => { const p = plan({ couple: true, age: 62, spouseAge: 67, retireAge: 63, endAge: 68, salary: s, ssBenefit: 3000, spouseSS: 0 }, { ssClaim: 62, spouseClaim: c }); p.employment.contributionStop = 63; return p; };
  const surv = (s) => { const p = plan({ couple: true, age: 60, spouseAge: 62, retireAge: 63, endAge: 70, salary: s, ssBenefit: 2800, spouseSS: 3000 }, { ssClaim: 62, spouseClaim: 67, survivor: true, spouseLife: 62.5 }); p.employment.contributionStop = 63; return p; };
  const aime = (a) => { const p = plan({ age: a, endAge: 68 }, { ssAdvanced: true, aime: 6000, ssClaim: 67 }); p.employment.growth = 3; return p; };
  const cases = [
    ['SA42F-02 witness, claim 67.5', plan({ age: 62, endAge: 71, ssBenefit: 2000 }, { ssClaim: 67.5, ssCola: 2.8 })],
    ['SA42F-02 control, claim 68', plan({ age: 62, endAge: 71, ssBenefit: 2000 }, { ssClaim: 68, ssCola: 2.8 })],
    ['SA42F-17 witness, 65', aime(65)], ['SA42F-17 control, 62', aime(62)],
    ['R42-01 witness, spousal 67.5', fam(67.5)], ['R42-01 control, spousal 68', fam(68)], ['R42-01 witness, spousal 67.25 at $60,000', fam(67.25, 60000)],
    ['SA42F-18 witness', surv(100000)], ['SA42F-18 control, no wages', surv(0)],
  ];
  console.log('== positive control');
  for (const [name, p] of cases) {
    const s = scan({ name, plan: p });
    console.log('  ' + name + ': ' + (['f02', 'f17', 'ss'].filter((f) => s[f].length).map((f) => f + ' [' + s[f].slice(0, 3).join('; ') + ']').join(' ') || 'none'));
  }
}
