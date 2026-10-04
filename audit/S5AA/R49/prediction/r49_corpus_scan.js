/* S5AA R49 prediction scan: spending, debt, defaults and disclosure (the owner's AA1 decisions, 2026-10-03). Run on the tree BEFORE
   the R49 engine edits.   Usage: node audit/S5AA/R49/prediction/r49_corpus_scan.js [<source tree>]
   Held to audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md.

   The engine rules being built, and the condition for each (C1: every condition reads the engine's own state, through read-only
   taps in an in-memory variant of that tree's src/engine.js (tests/lib/engine-variant.js); the variant's rows are asserted equal to
   the real engine's for every plan, so the taps change nothing):
   - flex (AA1-25 a): the flexibility cut never takes spending below the strategy's entered floor -- guardrails, Guyton-Klinger and
     floor-and-ceiling: min(floor, ceiling) x the price level; the remaining-life strategy: rmdFloor x the price level; VPW: the
     minimum rate x the balance. Condition: a call of strategySpending() where the cut applies (prior return < 0, flexibility > 0)
     and spend x (1 - f) < min(spend, floor). Each call is recorded with its path (Monte Carlo: every path, the engine's own
     seeding), its age and the dollars the new rule restores (min(spend, floor) - spend x (1 - f)), a first-order size. Two engine
     readers call strategySpending(): the row's spending and the cash reserve's sizing (rowReserveSpend); both are tapped.
   - ltc (AA1-37): advanced.ltcOnsetAge entered (a new input: no corpus plan carries it).
   - pmi (AA1-34): a mortgage charging PMI (pmiMonthly > 0, housing costs on, a balance) with pmiEndAge entered, or a "conventional"
     program with loanTermYears and remainingTermYears, whose stop age falls before the plan's end.
   - working (AA1-07): a row with a working part whose pay is below zero: the working share of (wages - contributions - the wage-only
     tax `baseline`), less the debt service paid in the working months (each debt's payments less those on or after the household
     date, tapped inside projectDebts()). The share is pay-first's own (wages less the pay earned after the household date, over
     wages), or, with no wages, the working part of the row. A flagged plan's result gains one WORKING_YEARS_NOT_FUNDED_BY_PAY
     issue (Monte Carlo: path 0 reports issues). PMI in the working months is not tapped: no corpus plan charges PMI (see pmi).
   A condition is necessary; the record says which flagged plans are expected to move and how. */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const { loadEngineVariant } = require(path.join(ROOT, 'tests', 'lib', 'engine-variant.js'));
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

const T = { path: -1, flex: [], work: [], svc: 0 };
globalThis.__R49 = T;
const V = loadEngineVariant([
  { id: 'path', marker: 'function simulatePlanRows(p,random,historyOffset,ltcRandom,issues,serialized,gateToken){', append: 'globalThis.__R49&&globalThis.__R49.path++;' },
  { id: 'flex', marker: 'if(priorReturn<0&&r.flexibility>0){spend*=1-r.flexibility/100}', replace:
    'if(globalThis.__R49&&priorReturn<0&&r.flexibility>0){var __fl=(r.strategy==="guardrails"||r.strategy==="guyton"||r.strategy==="floorCeiling")?Math.min(r.floor,r.ceiling)*inflationFactor:r.strategy==="rmd"?(Number(r.rmdFloor)||0)*inflationFactor:r.strategy==="vpw"?balance*Math.min(vpwLow,vpwHigh)/100:null;' +
    'if(__fl!==null&&spend*(1-r.flexibility/100)<Math.min(spend,__fl)-1e-9)globalThis.__R49.flex.push({path:globalThis.__R49.path,age:age,restored:Math.min(spend,__fl)-spend*(1-r.flexibility/100),spend:spend,floor:__fl})}' +
    'if(priorReturn<0&&r.flexibility>0){spend*=1-r.flexibility/100}' },
  { id: 'svc-reset', marker: 'debtFlow=projectDebts(', replace: 'debtFlow=(globalThis.__R49&&(globalThis.__R49.svc=0),projectDebts)(' },
  { id: 'svc', marker: 'totalPayments+=paid;', replace: 'if(globalThis.__R49)globalThis.__R49.svc+=paid-paidRetired;totalPayments+=paid;' },
  { id: 'work', marker: ',penaltyApplies=age<59.5', replace: ',__r49w=(function(){if(!globalThis.__R49)return 0;var share=wages>0?(wages-payAfterRetirement)/wages:(duration>0?Math.max(0,duration-costRetiredDuration)/duration:0),net=share*(wages-contributions-baseline.total),s=net-globalThis.__R49.svc;if((wages>0||costRetiredDuration<duration-1e-12)&&s<-.005)globalThis.__R49.work.push({path:globalThis.__R49.path,age:age,shortfall:-s,wages:wages,contributions:contributions,wageTax:baseline.total,service:globalThis.__R49.svc});return 0})(),penaltyApplies=age<59.5' },
]);

function pmiStop(d, start) {
  if (fin(d.pmiEndAge)) return d.pmiEndAge;
  if (d.mortgageType !== 'conventional' || !fin(d.loanTermYears) || !fin(d.remainingTermYears) || !(d.loanTermYears > 0) || d.remainingTermYears < 0 || d.remainingTermYears > d.loanTermYears) return null;
  const midMonths = (d.remainingTermYears - d.loanTermYears / 2) * 12;
  return start + (Math.floor(midMonths + 1e-9) + 1) / 12;
}
const plans = (comp) => {
  const { entries, omissions } = cap.corpusWithDiagnostics({ composition: comp });
  if (omissions.length) throw new Error(comp + ' omissions: ' + JSON.stringify(omissions));
  return entries;
};
function scan(entry) {
  const p = JSON.parse(JSON.stringify(entry.plan)), adv = p.advanced || {}, out = { flex: [], ltc: [], pmi: [], working: [] };
  T.path = -1; T.flex = []; T.work = [];
  const rv = V.runPlan(JSON.parse(JSON.stringify(p)));
  const r = E.runPlan(JSON.parse(JSON.stringify(p)));
  if (JSON.stringify(rv.rows) !== JSON.stringify(r.rows) || rv.successRate !== r.successRate) throw new Error(entry.name + ': the taps are not output-neutral');
  const mc = p.assumptions.method === 'monteCarlo';
  if (T.flex.length) {
    const paths = [...new Set(T.flex.map((f) => f.path))].sort((a, b) => a - b);
    // with the reserve on, each row calls strategySpending() twice (the reserve first, then the row's spending): the last call per age is the row's
    const byAge = new Map(); T.flex.filter((f) => f.path === 0).forEach((f) => byAge.set(f.age, f));
    const p0 = [...byAge.values()], calls = T.flex.filter((f) => f.path === 0).length;
    out.flex.push(mc ? ('Monte Carlo: ' + paths.length + ' of ' + p.assumptions.runs + ' paths exposed (' + paths.slice(0, 12).join(',') + (paths.length > 12 ? ',...' : '') + ')')
      : (calls + ' calls, ' + p0.length + ' rows, ages ' + [...new Set(p0.map((f) => f.age))].join(',') + '; first-order spending restored $' + Math.round(p0.reduce((t, f) => t + f.restored, 0)).toLocaleString('en-US') +
        ' (first: spend ' + Math.round(p0[0].spend) + ', floor ' + Math.round(p0[0].floor) + ')'));
  }
  if (fin(adv.ltcOnsetAge)) out.ltc.push('ltcOnsetAge ' + adv.ltcOnsetAge);
  (adv.debts || []).forEach((d) => {
    if (!(d && d.type === 'mortgage' && d.includeHousingCosts && (Number(d.pmiMonthly) || 0) > 0 && d.balance > 0)) return;
    const s = pmiStop(d, p.profile.age);
    if (s !== null && s < p.profile.endAge) out.pmi.push(d.id + ' PMI stops at ' + s.toFixed(3));
  });
  const w0 = T.work.filter((w) => w.path === 0);
  if (w0.length) out.working.push('first age ' + w0[0].age + ', short $' + Math.round(w0[0].shortfall).toLocaleString('en-US') + ' (wages ' + Math.round(w0[0].wages) + ', contributions ' + Math.round(w0[0].contributions) + ', wage tax ' + Math.round(w0[0].wageTax) + ', debt service ' + Math.round(w0[0].service) + '); ' + w0.length + ' rows');
  if (!mc && T.work.some((w) => w.path !== 0)) throw new Error('unexpected path');
  if (p.assumptions.method !== 'simple') Object.keys(out).forEach((k) => { if (out[k].length) out[k].unshift('(' + p.assumptions.method + ')'); });
  return out;
}
const KEYS = ['flex', 'ltc', 'pmi', 'working'];
for (const comp of ['control', 'expanded']) {
  const entries = plans(comp), movers = Object.fromEntries(KEYS.map((k) => [k, []]));
  for (const e of entries) { const s = scan(e); KEYS.forEach((f) => { if (s[f].length) movers[f].push(e.name + ' [' + s[f].join('; ') + ']'); }); }
  console.log('== ' + comp + ' (' + entries.length + ' plans)');
  KEYS.forEach((f) => console.log('  ' + f + ' (' + movers[f].length + '): ' + (movers[f].length ? '\n    ' + movers[f].join('\n    ') : 'none')));
}
