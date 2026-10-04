/* S5AA R53 prediction: for every TEST plan that R53's decision 3 refuses (profile.endAge < profile.retireAge), is the intent-preserving
   adaptation -- retire at the end age (profile.retireAge := profile.endAge: the owner still works through the whole horizon; a spouse
   whose date followed profile.retireAge keeps it as profile.spouseRetireAge) -- output-neutral?
   Loaded with NODE_OPTIONS=--require into each test process on the tree BEFORE the repair (cbce0ce), only for the files the exposure run
   named. Each such runPlan()/simulatePlan() is re-run with the adapted plan (a direct simulatePlan() as runPlan() with one run) and compared
   with the plan as given, the whole result (rows, issues, every field but the run's identity), once per distinct plan per process. */
'use strict';
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const OUT = process.env.R53_NEUTRAL_OUT;
const TREE = path.resolve(process.env.R53_TREE || '.');
const ENGINE = path.join(TREE, 'src', 'engine.js').toLowerCase();
let busy = false, E = null;
const seen = new Map();
function log(rec) { if (OUT) fs.appendFileSync(OUT, JSON.stringify(Object.assign({ file: path.basename(process.argv[1] || '') }, rec)) + '\n'); }
function strip(r) { const o = JSON.parse(JSON.stringify(r)); delete o.runId; delete o.identity; delete o.executionSnapshot; delete o.execution; return o; }
function firstDiff(a, b, pre) {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set(Object.keys(a).concat(Object.keys(b)))) { const d = firstDiff(a[k], b[k], pre + '.' + k); if (d) return d; }
  }
  return pre + ': ' + JSON.stringify(a) + ' -> ' + JSON.stringify(b);
}
function check(fn, p0) {
  if (busy || !E) return;
  busy = true;
  try {
    const pr = p0 && p0.profile;
    if (!pr || !(typeof pr.endAge === 'number' && typeof pr.retireAge === 'number' && pr.endAge < pr.retireAge)) return;
    const p = JSON.parse(JSON.stringify(p0));
    if (fn === 'simulatePlan' && p.assumptions && p.assumptions.method === 'monteCarlo') p.assumptions.runs = 1;
    const key = JSON.stringify(p);
    if (seen.has(key)) return;
    seen.set(key, true);
    const q = JSON.parse(JSON.stringify(p));
    /* the spouse's retirement follows profile.retireAge when spouseRetireAge is absent (R45), so the adaptation pins the spouse's own date */
    if (q.profile.spouseOn && typeof q.profile.spouseRetireAge !== 'number') q.profile.spouseRetireAge = q.profile.retireAge;
    q.profile.retireAge = q.profile.endAge;
    const a = strip(E.runPlan(JSON.parse(JSON.stringify(p)))), b = strip(E.runPlan(q));
    const d = firstDiff(a, b, 'result');
    log({ fn, ages: { age: pr.age, retireAge: pr.retireAge, endAge: pr.endAge, spouseRetireAge: pr.spouseRetireAge }, neutral: !d, firstDiff: d ? d.slice(0, 300) : null, plan: d ? p : undefined });
  } catch (e) { log({ fn, error: String(e && e.message || e) }); } finally { busy = false; }
}
const load = Module._load;
Module._load = function (request, parent, isMain) {
  const m = load.apply(this, arguments);
  let resolved = '';
  try { resolved = Module._resolveFilename(request, parent, isMain).toLowerCase(); } catch (e) { return m; }
  if (resolved === ENGINE && m && !m.__r53n && typeof m.runPlan === 'function') {
    const raw = { runPlan: m.runPlan, simulatePlan: m.simulatePlan };
    E = { runPlan: raw.runPlan };
    ['runPlan', 'simulatePlan'].forEach((k) => { const f = raw[k]; if (typeof f === 'function') m[k] = function (p) { check(k, p); return f.apply(this, arguments); }; });
    Object.defineProperty(m, '__r53n', { value: true });
  }
  return m;
};
