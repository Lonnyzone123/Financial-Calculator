/* S5AA R53 -- THE COMPANION ADAPTER: ChatGPT's companion scripts, unedited, under the owner's decision 3.

   The owner decided on 2026-10-04 that an end age before the retirement age is refused everywhere (validator END_AGE_BEFORE_RETIREMENT,
   engine SCENARIO_END_AGE_BEFORE_RETIREMENT, the app's import). Several of the auditor's companion cases entered "still working when the
   plan ends" that way (age 40, retirement 45, end 42). After seeing that, the owner kept the refusal and asked for this adapter, so those
   scripts can be rerun as written: the same household is entered as the owner decided it may be -- retiring AT the end age. Every row still
   works in full; a spouse whose date followed profile.retireAge (R45: no spouseRetireAge) keeps it as profile.spouseRetireAge.

   Usage, from the repository root (the scripts' own arguments are unchanged):
     node -r ./audit/S5AA/R53/S5AA_R53_COMPANION_ADAPTER.js <companion script> <root> <output>
   R53_ADAPTER_LOG=<file> appends one JSON line per rewritten call; a summary goes to stderr at exit.

   What it reaches -- the three routes the companions use to put a plan into the model:
     - src/engine.js, required: runPlan, simulatePlan, runScenario;
     - src/scenario-validator.js, required: validateScenario;
     - tests/lib/engine-variant.js: every engine variant loadEngineVariant() returns (runPlan, simulatePlan, runScenario).
   What it does NOT reach, deliberately: the app (tests/lib/harness.js loadCalculator). The R52 script's U01 is the import of exactly such a
   plan, and refusing that import is the owner's decision itself, so U01 is expected to report the refusal, not a projection.

   How: the plan is rewritten IN PLACE for the call and restored right after it, so a script that checks its input is not mutated still
   sees its own object, and anything else the call does to that object stays visible. A plan whose end age is not before its retirement
   age, or whose ages are not finite numbers, is passed through untouched.

   Measured, not assumed: audit/S5AA/R53/S5AA_R53_COMPANION_ADAPTER_CHECK_20261004.md compares the scripts' verdicts at R53's item-2 commit
   (87bddba, before the refusal, where both entries are accepted) without and with this adapter, and at the R53 head with it. */
'use strict';
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(process.argv[2] || '.');
const TARGETS = {
  engine: path.join(ROOT, 'src', 'engine.js').toLowerCase(),
  validator: path.join(ROOT, 'src', 'scenario-validator.js').toLowerCase(),
  variant: path.join(ROOT, 'tests', 'lib', 'engine-variant.js').toLowerCase(),
};
const LOG = process.env.R53_ADAPTER_LOG || null;
const counts = {};

function rewrite(p) {
  const pr = p && typeof p === 'object' ? p.profile : null;
  if (!pr || typeof pr !== 'object') return null;
  const { endAge, retireAge } = pr;
  if (typeof endAge !== 'number' || typeof retireAge !== 'number' || !Number.isFinite(endAge) || !Number.isFinite(retireAge) || !(endAge < retireAge)) return null;
  const undo = { retireAge, hadSpouseRetire: Object.prototype.hasOwnProperty.call(pr, 'spouseRetireAge'), spouseRetireAge: pr.spouseRetireAge };
  if (pr.spouseOn === true && typeof pr.spouseRetireAge !== 'number') pr.spouseRetireAge = retireAge;
  pr.retireAge = endAge;
  return () => {
    pr.retireAge = undo.retireAge;
    if (undo.hadSpouseRetire) pr.spouseRetireAge = undo.spouseRetireAge; else delete pr.spouseRetireAge;
  };
}

function wrap(route, name, fn) {
  return function (p, ...rest) {
    const entered = p && p.profile && typeof p.profile === 'object' ? { age: p.profile.age, retireAge: p.profile.retireAge, endAge: p.profile.endAge } : null;
    const undo = rewrite(p);
    if (undo) {
      const key = route + '.' + name;
      counts[key] = (counts[key] || 0) + 1;
      if (LOG) fs.appendFileSync(LOG, JSON.stringify({ route: key, entered, retireAgeUsed: entered.endAge }) + '\n');
    }
    try { return fn.call(this, p, ...rest); } finally { if (undo) undo(); }
  };
}

function wrapEngine(route, m) {
  if (!m || m.__r53Adapter) return m;
  for (const name of ['runPlan', 'simulatePlan', 'runScenario']) if (typeof m[name] === 'function') m[name] = wrap(route, name, m[name]);
  Object.defineProperty(m, '__r53Adapter', { value: true });
  return m;
}

const load = Module._load;
Module._load = function (request, parent, isMain) {
  const m = load.apply(this, arguments);
  let resolved = '';
  try { resolved = Module._resolveFilename(request, parent, isMain).toLowerCase(); } catch (e) { return m; }
  if (resolved === TARGETS.engine) return wrapEngine('engine', m);
  if (resolved === TARGETS.validator && m && !m.__r53Adapter && typeof m.validateScenario === 'function') {
    m.validateScenario = wrap('validator', 'validateScenario', m.validateScenario);
    Object.defineProperty(m, '__r53Adapter', { value: true });
  }
  if (resolved === TARGETS.variant && m && !m.__r53Adapter && typeof m.loadEngineVariant === 'function') {
    const raw = m.loadEngineVariant;
    m.loadEngineVariant = function () { return wrapEngine('variant', raw.apply(this, arguments)); };
    Object.defineProperty(m, '__r53Adapter', { value: true });
  }
  return m;
};

process.on('exit', () => {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  process.stderr.write('[R53 companion adapter] root ' + ROOT + ': ' + total + ' call(s) entered with the retirement age at the end age ' + JSON.stringify(counts) + '\n');
});
