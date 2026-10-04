/* S5AA R45 prediction: which TEST plans are exposed to the R45 rules. Loaded with NODE_OPTIONS=--require into every test process
   on the tree BEFORE the R45 edits; it wraps src/engine.js's runPlan and simulatePlan (tests that load an engine variant through
   vm are not seen, and the record says so) and appends one JSON line per exposed plan to $R45_EXPOSURE_OUT.
   Exposure (necessary conditions, as r45_corpus_scan.js):
   - household: the new household date (first stop, the owner's rules) differs from today's costRetireAge inside the horizon;
   - own: the spouse carries profile.spouseRetireAge different from profile.retireAge (their own work window changes). */
'use strict';
const Module = require('node:module');
const fs = require('node:fs');
const OUT = process.env.R45_EXPOSURE_OUT;
const fin = (v) => Number.isFinite(Number(v));
function todayHousehold(p) {
  const pr = p.profile || {}, rt = p.retirement || {}, st = Number(pr.age), ret = Number(pr.retireAge), d = Number(rt.selfLife), sd = Number(rt.spouseLife);
  if (pr.spouseOn !== true || !Number.isFinite(d) || !(d > st) || !(d < ret)) return ret;
  const spouseAtDeath = Number(pr.spouseAge) + (d - st);
  if (Number.isFinite(sd) && !(sd > spouseAtDeath)) return ret;
  if ((Number(p.employment && p.employment.spouseSalary) || 0) > 0 && spouseAtDeath < ret) return ret;
  return d;
}
function newHousehold(p) {
  const pr = p.profile || {}, rt = p.retirement || {}, st = Number(pr.age), ret = Number(pr.retireAge);
  if (pr.spouseOn !== true) return ret;
  const sa = Number(pr.spouseAge), sRet = fin(pr.spouseRetireAge) ? Number(pr.spouseRetireAge) : ret, toSelf = (x) => st + (x - sa);
  const d = fin(rt.selfLife) ? Number(rt.selfLife) : Infinity, sd = fin(rt.spouseLife) ? toSelf(Number(rt.spouseLife)) : Infinity;
  const earning = (Number(p.employment && p.employment.spouseSalary) || 0) > 0, c = [ret];
  if (earning) c.push(Math.max(st, toSelf(sRet)));
  if (d > st && d < ret && sd > d) c.push(d);
  if (earning && sd > st && sd < toSelf(sRet) && d > sd) c.push(sd);
  return Math.min(...c);
}
function check(fn, p) {
  try {
    if (!p || !p.profile) return;
    const pr = p.profile, end = Number(pr.endAge), flags = [];
    const h0 = todayHousehold(p), h1 = newHousehold(p);
    if (Math.abs(h0 - h1) > 1e-9 && Math.min(h0, h1) < end - 1e-9) flags.push('household ' + h0 + ' -> ' + h1);
    if (pr.spouseOn === true && fin(pr.spouseRetireAge) && Number(pr.spouseRetireAge) !== Number(pr.retireAge)) flags.push('own spouse ' + pr.spouseRetireAge + ' vs ' + pr.retireAge + ' (spouse salary ' + ((p.employment && p.employment.spouseSalary) || 0) + ', spouseAge ' + pr.spouseAge + ', age ' + pr.age + ', end ' + end + ')');
    if (flags.length && OUT) fs.appendFileSync(OUT, JSON.stringify({ file: process.argv[1], fn, method: p.assumptions && p.assumptions.method, flags }) + '\n');
  } catch (e) { /* exposure logging never fails a test */ }
}
const path = require('node:path');
const ENGINE = path.resolve(__dirname, '..', '..', '..', '..', 'src', 'engine.js').toLowerCase();
const load = Module._load;
Module._load = function (request, parent, isMain) {
  const m = load.apply(this, arguments);
  let resolved = '';
  try { resolved = Module._resolveFilename(request, parent, isMain).toLowerCase(); } catch (e) { return m; }
  if (resolved === ENGINE && m && !m.__r45wrapped && typeof m.runPlan === 'function') {
    ['runPlan', 'simulatePlan'].forEach((k) => { const f = m[k]; if (typeof f === 'function') m[k] = function (p) { check(k, p); return f.apply(this, arguments); }; });
    Object.defineProperty(m, '__r45wrapped', { value: true });
  }
  return m;
};
