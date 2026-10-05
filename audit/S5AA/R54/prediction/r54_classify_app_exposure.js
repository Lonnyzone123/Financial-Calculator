/* S5AA R54: classifies the app-exposure log (r54_app_exposure_hook.js) by test file.
   - item 2: a plan leaf readStatic() changed although the input that carries it (KEPT below, R54's map) was not edited since the plan
     was written to the form; and a leaf in a rebuilt section with no input (a dropped key); and a blur that changed a value; and
     normalizedPlan()'s end-age cap.
   - item 1: profile.retireAge changed with v2-retire not edited, or profile.endAge changed with v2-end not edited (a dependent clamp).
   Usage: node r54_classify_app_exposure.js <log.jsonl> [out.txt] */
'use strict';
const fs = require('node:fs');
const MAP = {
  'profile.age': 'v2-age', 'profile.retireAge': 'v2-retire', 'profile.endAge': 'v2-end', 'profile.spouseAge': 'v2-spouse-age', 'name': 'v2-name',
  'employment.salary': 'v2-salary', 'employment.spouseSalary': 'v2-spouse-salary', 'employment.growth': 'v2-salary-growth', 'employment.contributionStop': 'v2-contribution-stop',
  'assumptions.returnRate': 'v2-return', 'assumptions.inflation': 'v2-inflation', 'assumptions.fee': 'v2-fee', 'assumptions.runs': 'v2-runs', 'assumptions.seed': 'v2-seed',
  'assumptions.volatility': 'v2-volatility', 'assumptions.historyStart': 'v2-history-start', 'assumptions.method': 'v2-method', 'assumptions.returnPreset': 'v2-return-preset',
  'retirement.spending': 'v2-spending', 'retirement.withdrawalRate': 'v2-withdrawal-rate', 'retirement.upperGuardrail': 'v2-upper-guardrail', 'retirement.lowerGuardrail': 'v2-lower-guardrail',
  'retirement.adjustment': 'v2-adjustment', 'retirement.floor': 'v2-floor', 'retirement.ceiling': 'v2-ceiling', 'retirement.dividendYield': 'v2-dividend-yield',
  'retirement.dividendQualified': 'v2-dividend-qualified', 'retirement.dividendGrowth': 'v2-dividend-growth', 'retirement.dividendStart': 'v2-dividend-start',
  'retirement.ssBenefit': 'v2-ss-benefit', 'retirement.ssClaim': 'v2-ss-claim', 'retirement.spouseSS': 'v2-spouse-ss', 'retirement.spouseClaim': 'v2-spouse-claim',
  'retirement.aime': 'v2-aime', 'retirement.selfLife': 'v2-self-life', 'retirement.spouseLife': 'v2-spouse-life', 'retirement.pension': 'v2-pension', 'retirement.pensionCola': 'v2-pension-cola',
  'retirement.flexibility': 'v2-flexibility', 'retirement.vpwMinRate': 'v2-vpw-min', 'retirement.vpwMaxRate': 'v2-vpw-max', 'retirement.rmdMultiplier': 'v2-rmd-multiplier',
  'retirement.rmdFloor': 'v2-rmd-floor', 'retirement.ssCola': 'v2-ss-cola', 'retirement.survivorSpendingReduction': 'v2-survivor-spending-reduction',
  'retirement.strategy': 'v2-strategy', 'retirement.manualOrder': 'v2-manual-order', 'retirement.withdrawalOrder': 'v2-withdrawal-order', 'retirement.optimizationGoal': 'v2-optimization-goal',
  'retirement.spendingStartAge': 'v2-spending-start', 'retirement.azPost2011GainShare': 'v2-az-gain-share',
  'advanced.transferAge': 'v2-transfer-age', 'advanced.transferAmount': 'v2-transfer-amount', 'advanced.correlation': 'v2-correlation', 'advanced.retirementStock': 'v2-retirement-stock',
  'advanced.reserveYears': 'v2-reserve-years', 'advanced.bondTent': 'v2-bond-tent', 'advanced.conversionAmount': 'v2-conversion-amount', 'advanced.qcd': 'v2-qcd',
  'advanced.healthCost': 'v2-health-cost', 'advanced.healthInflation': 'v2-health-inflation', 'advanced.ltcCost': 'v2-ltc-cost', 'advanced.ltcProbability': 'v2-ltc-prob',
  'advanced.ltcYears': 'v2-ltc-years', 'advanced.ltcInsurance': 'v2-ltc-insurance', 'advanced.insurance': 'v2-insurance', 'advanced.legacy': 'v2-legacy',
  'advanced.conversionStartAge': 'v2-conversion-start', 'advanced.healthCoverageEndAge': 'v2-health-coverage-end', 'advanced.ltcOnsetAge': 'v2-ltc-onset',
  'advanced.medicareInflation': 'v2-medicare-inflation', 'advanced.partDPremium': 'v2-part-d-premium', 'advanced.irmaaMagiTwoYearsBefore': 'v2-irmaa-magi-2', 'advanced.irmaaMagiOneYearBefore': 'v2-irmaa-magi-1',
  'profile.spouseRetireAge': 'v2-spouse-retire', 'profile.medicareStartAge': 'v2-medicare-start', 'profile.spouseMedicareStartAge': 'v2-spouse-medicare-start',
  'profile.priorIncomeThisYear': 'v2-prior-income', 'profile.rothFirstContributionYear': 'v2-roth-first-year', 'profile.spouseRothFirstContributionYear': 'v2-spouse-roth-first-year',
  'advanced.transferFrom': 'v2-transfer-from', 'advanced.transferTo': 'v2-transfer-to', 'limitPolicy': 'v2-limit-policy', 'profile.filing': 'v2-filing', 'profile.state': 'v2-state',
  'assumptions.withdrawalTiming': 'v2-withdrawal-timing', 'assumptions.rollingHistory': 'v2-rolling-history', 'profile.spouseOn': 'v2-spouse',
};
const lines = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const byFile = {};
const F = (f) => (byFile[f] = byFile[f] || { pages: 0, item2: {}, item1: {}, blur: {}, endcap: 0, edits: 0 });
for (const r of lines) {
  const f = F(r.file);
  if (r.kind === 'page') { f.pages++; if (r.missingTaps && r.missingTaps.length) f.missing = r.missingTaps; continue; }
  if (r.kind === 'endcap') { f.endcap++; continue; }
  if (r.kind === 'blur') { const k = r.id + ' ' + r.before + '->' + r.after + (r.kept ? ' (kept field)' : ''); f.blur[k] = (f.blur[k] || 0) + 1; continue; }
  if (r.kind !== 'read') continue;
  const edited = new Set(r.edited);
  for (const [leaf, before, after] of r.diffs) {
    const id = MAP[leaf];
    const label = leaf + ': ' + JSON.stringify(before) + ' -> ' + JSON.stringify(after);
    if (leaf === 'profile.retireAge' && !edited.has('v2-retire')) { f.item1[label + ' [edited: ' + r.edited.filter((x) => /v2-(age|retire|end)$/.test(x)).join(',') + ']'] = 1; continue; }
    if (leaf === 'profile.endAge' && !edited.has('v2-end')) { f.item1[label + ' [edited: ' + r.edited.filter((x) => /v2-(age|retire|end)$/.test(x)).join(',') + ']'] = 1; continue; }
    if (id && edited.has(id)) { f.edits++; continue; }
    if (!id && /^(accounts|advanced\.(otherAssets|debts|assetClasses)|retirement\.(stages|expenses|otherIncomes))/.test(leaf)) { f.edits++; continue; } // lists: edited through their own controls
    const key = (id ? 'untouched ' + id : 'no input') + ' | ' + label;
    f.item2[key] = (f.item2[key] || 0) + 1;
  }
}
const out = [];
const files = Object.keys(byFile).sort();
out.push('files with an app page: ' + files.filter((f) => byFile[f].pages).length + '; records ' + lines.length);
for (const name of files) {
  const f = byFile[name];
  const i2 = Object.keys(f.item2), i1 = Object.keys(f.item1), bl = Object.keys(f.blur);
  out.push('\n' + name + ': pages ' + f.pages + (f.missing ? ' MISSING TAPS ' + f.missing.join('|') : '') + ', edited leaves ' + f.edits + ', endcap ' + f.endcap);
  i1.forEach((k) => out.push('  ITEM1 ' + k));
  i2.forEach((k) => out.push('  ITEM2 x' + f.item2[k] + ' ' + k));
  bl.forEach((k) => out.push('  BLUR  x' + f.blur[k] + ' ' + k));
}
const text = out.join('\n');
console.log(text);
if (process.argv[3]) fs.writeFileSync(process.argv[3], text + '\n');
