'use strict';

/*
 * P5-02 -- the intended-result contract, as a checker.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT. The auditor carried "the independent
 * intended result contract" from package 6 because the thirteen required row
 * fields P5-02 enforced had been MEASURED from stored output, and "observed
 * output is not an independent specification". The accepted definition
 * (S2_S3_CLOSEOUT_ANSWERS_20260912.md, CQ-1) is a contract of shape, types,
 * meanings, units, nominal/real bases, per-mode differences and
 * structural/reconciliation invariants -- not of financial values.
 *
 * tools/result-contract.json is the specification; RESULT_CONTRACT.md is its
 * human form, with every expectation's source. This file only CHECKS a result
 * against it. Nothing here is inferred from a result: every rule below names
 * the contract invariant it enforces, and every invariant names its sources.
 *
 * BC-01, CLOSED AT CONTRACT VERSION 2 (S4 task 2b.4). The S2 closeout verdict
 * found this checker was not a complete corruption gate, witnessed on stored
 * results: typeOk() classified with typeof, and typeof NaN is 'number', so NaN
 * or Infinity in a top-level summary returned no violation; path counts of 0 or
 * 1.5 were accepted; the plan-dependent half of M-PATHS vanished without being
 * reported as skipped; and a null row threw a TypeError at Object.keys(row)
 * instead of returning a violation. T-FINITE, S-ROW-RECORD and the tightened
 * M-PATHS / X-INVALID close those four, and tests/result-contract.test.js
 * witnesses each on HAND-AUTHORED results, independent of the engine. A result
 * the engine emits that now fails is a named finding for S5, never a reason to
 * loosen a rule here.
 *
 * Contrast with tests/lib/schema-catalogue.js, which is deliberately DERIVED
 * from live output and is a drift detector. catalogueDiff() compares the two,
 * so every place observed and intended disagree is listed and dispositioned
 * rather than silently reconciled.
 */

const CONTRACT = require('./result-contract.json');

const TOP_OUTCOMES = { okPerPath: true, okMonteCarlo: true, invalid: true };

function typeOk(value, type) {
  return String(type).split('|').some((t) => {
    if (t === 'null') return value === null;
    if (t === 'array') return Array.isArray(value);
    if (t === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
    return typeof value === t;
  });
}

/* The reconciliation tolerance checkRowInvariants() already uses. */
function close(actual, expected) {
  return typeof actual === 'number' && typeof expected === 'number'
    && Math.abs(actual - expected) <= Math.max(0.01, Math.abs(expected) * 1e-9);
}

const own = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);

/* S-ROW-RECORD: a row is a non-null, non-array object. */
const isRecord = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function outcomeOf(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return 'unknown';
  if (result.status === 'calculation_error') return 'invalid';
  if (result.status === 'ok') return result.mode === 'monteCarlo' ? 'okMonteCarlo' : 'okPerPath';
  return 'unknown';
}

/* ---- field specifications, read from the contract ---- */

/* Q2 (A), contract version 3: a row field applies from its introducedIn version; absent means every supported version. */
const introducedBy = (f, version) => !f.introducedIn || f.introducedIn <= version;
const supportedVersion = (v) => Number.isInteger(v) && CONTRACT.supportedVersions.includes(v);

function perPathRowSpec(rowKind, version = CONTRACT.contractVersion) {
  const spec = {};
  Object.entries(CONTRACT.rowFields.perPath).forEach(([k, f]) => {
    if ((!f.rowKinds || f.rowKinds.includes(rowKind)) && introducedBy(f, version)) spec[k] = f;
  });
  return spec;
}

function monteCarloRowSpec(version = CONTRACT.contractVersion) {
  const spec = {};
  CONTRACT.rowFields.monteCarlo.fields.forEach((k) => { if (introducedBy(CONTRACT.rowFields.perPath[k], version)) spec[k] = CONTRACT.rowFields.perPath[k]; });
  Object.assign(spec, CONTRACT.rowFields.monteCarlo.extra);
  return spec;
}

/* S-CONTRACT-VERSION: the version a capture was produced under. meta.resultContractVersion when recorded (null if it is not
   a supported version); otherwise the version its provenance under legacyCaptures gives; otherwise null. The absence of
   the newer fields is never taken as evidence of an older version. */
/* A recorded version must be supported, and a version older than the producer's is legacy-only: accepted only for a known
   legacy capture of that version (R10, Q2 (A)'s "inconsistent version claims"; provisional). So a capture cannot be judged
   under an older, laxer version by claiming it, and a current producer cannot evade version 3 by recording 2. A capture
   that records no version is a known legacy capture or has none. */
/* R12 round (external re-audit of b053dc2, R11-02): a legacy entry may name its own version -- the stored version-3
   captures do, now that the producer is version 4 -- and one that names none is the default, version 2. */
function captureContractVersion(meta) {
  if (!isRecord(meta)) return null;
  const listed = CONTRACT.legacyCaptures.captures.find((c) => c.gitCommit === meta.gitCommit && c.outputHash === meta.hash);
  const legacy = listed ? { contractVersion: Number.isInteger(listed.contractVersion) ? listed.contractVersion : CONTRACT.legacyCaptures.contractVersion } : null;
  if (own(meta, 'resultContractVersion')) {
    const v = meta.resultContractVersion;
    if (!(Number.isInteger(v) && CONTRACT.supportedVersions.includes(v))) return null;
    if (v < CONTRACT.contractVersion && !(legacy && legacy.contractVersion === v)) return null;
    return v;
  }
  return legacy ? legacy.contractVersion : null;
}

/* Decision 8: the first row opening at which nobody the plan models is alive, derived from the plan alone -- or null. Row
   openings are profile.age and every whole-year boundary before profile.endAge. A person is dead at an opening once their
   lifespan is below their age then (the engine's householdSurvivorship() reading, restated here so the check does not
   trust the thing it checks); a spouse's age moves with the self's. */
function lastDeathCut(plan) {
  const profile = isRecord(plan && plan.profile) ? plan.profile : {}, r = isRecord(plan && plan.retirement) ? plan.retirement : {};
  const start = Number(profile.age), end = Number(profile.endAge), selfLife = Number(r.selfLife), spouseLife = Number(r.spouseLife), spouseStart = Number(profile.spouseAge);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const deadAt = (o) => {
    const selfDead = Number.isFinite(selfLife) && selfLife < o;
    if (!profile.spouseOn) return selfDead;
    const spouseDead = Number.isFinite(spouseLife) && Number.isFinite(spouseStart) && spouseLife < spouseStart + (o - start);
    return selfDead && spouseDead;
  };
  const openings = [start];
  for (let b = Math.floor(start) + 1; b < end; b++) openings.push(b);
  for (const o of openings) if (deadAt(o)) return o;
  return null;
}

/* R12 round (external re-audit of b053dc2, R11-02): the version from which R-AGE-SPAN REQUIRES decision 8's cut. A
   literal, deliberately: R11 wrote "version >= CONTRACT.contractVersion", which ties a rule to whichever version is
   latest, so the version-3 captures taken before decision 8 were re-judged while the version stayed 3, and a later bump
   would move the rule again. Frozen here, each version keeps its own semantics. */
const LAST_DEATH_CUT_REQUIRED_FROM = 4;

/* ---- the checker ---- */

/**
 * Checks one runPlan()/runScenario() result against the contract.
 * @param result  the result object
 * @param options { plan, contractVersion } -- the plan that produced it, and the contract version to check under (default:
 *                the current version, which the engine produces). Without a plan, the
 *                plan-dependent invariants (R-AGE-SPAN, R-NETWORTH, part of
 *                M-PATHS) are reported as SKIPPED, never as passed.
 * @returns { outcome, mode, violations: [{rule, path, message}], unspecified: [path], skipped: [rule] }
 */
function checkResult(result, options = {}) {
  const plan = options.plan || null;
  const violations = [];
  const unspecified = [];
  const skipped = [];
  const v = (rule, path, message) => violations.push({ rule, path, message });

  /* S-CONTRACT-VERSION: an unsupported version is refused before anything is checked, never given the most permissive schema. */
  const version = Object.prototype.hasOwnProperty.call(options, 'contractVersion') ? options.contractVersion : CONTRACT.contractVersion;
  if (!supportedVersion(version)) {
    v('S-CONTRACT-VERSION', '(contract)', 'unsupported result-contract version ' + JSON.stringify(version) + '; supported: ' + JSON.stringify(CONTRACT.supportedVersions));
    return { outcome: outcomeOf(result), mode: result && result.mode, contractVersion: version, violations, unspecified, skipped };
  }

  const outcome = outcomeOf(result);
  if (!TOP_OUTCOMES[outcome]) {
    v('S-EXACT-KEYS', 'status', `status must be "ok" or "calculation_error", got ${JSON.stringify(result && result.status)}`);
    return { outcome, mode: result && result.mode, violations, unspecified, skipped };
  }
  const mode = result.mode;

  /* Top level: required keys, types, fixed values. */
  const top = CONTRACT.topLevel[outcome];
  const optional = CONTRACT.topLevel.optional;
  Object.entries(top).forEach(([key, spec]) => {
    if (!own(result, key)) { v('S-EXACT-KEYS', key, 'required key is missing'); return; }
    const value = result[key];
    if (!typeOk(value, spec.type)) { v('S-EXACT-KEYS', key, `expected ${spec.type}, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`); return; }
    if (own(spec, 'equals') && value !== spec.equals) v('S-EXACT-KEYS', key, `must equal ${JSON.stringify(spec.equals)}, got ${JSON.stringify(value)}`);
    if (spec.oneOf && !spec.oneOf.includes(value)) v('S-EXACT-KEYS', key, `must be one of ${JSON.stringify(spec.oneOf)}, got ${JSON.stringify(value)}`);
    if (spec.range && !(value >= spec.range[0] && value <= spec.range[1])) v('S-EXACT-KEYS', key, `must be within ${JSON.stringify(spec.range)}, got ${value}`);
    if (spec.nonEmpty && !(value && value.length > 0)) v('S-EXACT-KEYS', key, 'must be non-empty');
    if (spec.requires) spec.requires.forEach((r) => { if (!own(value, r)) v('S-EXACT-KEYS', `${key}.${r}`, 'required key is missing'); });
  });
  Object.keys(result).forEach((key) => {
    if (own(top, key)) return;
    if (own(optional, key)) {
      if (!typeOk(result[key], optional[key].type)) v('S-EXACT-KEYS', key, `optional key must be ${optional[key].type}`);
      return;
    }
    unspecified.push(key);
  });

  /* T-FINITE (BC-01). typeOk() classifies with typeof, and typeof NaN is
     'number' -- so NaN or Infinity in a top-level summary passed every check
     above. Every numeric top-level value that is present, required or
     optional, must be finite; a nullable numeric is checked when non-null. */
  Object.keys(result).forEach((key) => {
    const spec = own(top, key) ? top[key] : own(optional, key) ? optional[key] : null;
    if (!spec || !String(spec.type).split('|').includes('number')) return;
    const value = result[key];
    if (typeof value === 'number' && !Number.isFinite(value)) v('T-FINITE', key, `non-finite value ${value}`);
  });

  if (outcome === 'invalid') {
    /* X-INVALID is carried by the invalid top-level spec above (every
       financial field typed null, rows null, partialDiagnostics.label). */
    if (result.partialDiagnostics && typeof result.partialDiagnostics.label !== 'string') {
      v('X-INVALID', 'partialDiagnostics.label', 'label must be a string');
    }
    /* Path counts on an invalid Monte Carlo result are still counts (BC-01):
       integers, never negative, and at least one path requested. Zero VALID
       paths is legitimate here -- it is often why the result is invalid. */
    ['calculationErrorPaths', 'requestedPathCount', 'validPathCount'].forEach((k) => {
      if (!own(result, k) || typeof result[k] !== 'number') return;
      const n = result[k];
      const min = k === 'requestedPathCount' ? 1 : 0;
      if (!(Number.isInteger(n) && n >= min)) v('X-INVALID', k, `must be an integer >= ${min}, got ${n}`);
    });
    return { outcome, mode, contractVersion: version, violations, unspecified, skipped };
  }

  const rows = Array.isArray(result.rows) ? result.rows : [];
  const perPath = outcome === 'okPerPath';
  /* S-ROW-RECORD (BC-01). A null row used to throw at Object.keys(row), so a
     corrupt result crashed the checker instead of being reported. A malformed
     row is a violation at its own index; the whole-result invariants that need
     every row are then reported as SKIPPED, never evaluated over a hole.
     S4-IR-03: rows are walked BY INDEX, never with every/forEach/reduce, which
     skip the holes of a sparse array. With those, new Array(40) counted as
     well formed and a deleted row was never visited: a result with no rows at
     all passed, and a deleted opening row threw further down. A hole is not
     filled with a default row or compacted away -- it is reported at its index. */
  const present = (i) => Object.prototype.hasOwnProperty.call(rows, i);
  let rowsWellFormed = true;
  for (let i = 0; i < rows.length; i++) if (!present(i) || !isRecord(rows[i])) rowsWellFormed = false;

  /* Rows: required keys and types, per row kind. */
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!present(i) || !isRecord(row)) {
      v('S-ROW-RECORD', `rows[${i}]`,
        `a row must be a non-null object, got ${!present(i) ? 'a hole (no element at this index)' : row === null ? 'null' : Array.isArray(row) ? 'an array' : typeof row}`);
      continue;
    }
    const spec = perPath ? perPathRowSpec(i === 0 ? 'opening' : 'ordinary', version) : monteCarloRowSpec(version);
    Object.entries(spec).forEach(([key, f]) => {
      if (!own(row, key)) { v('S-EXACT-KEYS', `rows[${i}].${key}`, 'required row key is missing'); return; }
      if (!typeOk(row[key], f.type)) v('S-EXACT-KEYS', `rows[${i}].${key}`, `expected ${f.type}, got ${row[key] === null ? 'null' : typeof row[key]}`);
    });
    Object.keys(row).forEach((key) => { if (!own(spec, key)) unspecified.push(`rows[${i}].${key}`); });

    /* R-FINITE */
    Object.keys(row).forEach((key) => {
      if (typeof row[key] === 'number' && !Number.isFinite(row[key])) v('R-FINITE', `rows[${i}].${key}`, `non-finite value ${row[key]}`);
    });
    /* R-MAGI-ALIAS (version 3): legacy magi is the IRMAA measure, so it must equal irmaaMagi exactly. */
    if (version >= 3 && typeof row.magi === 'number' && typeof row.irmaaMagi === 'number' && row.magi !== row.irmaaMagi) v('R-MAGI-ALIAS', `rows[${i}].irmaaMagi`, `magi ${row.magi} and irmaaMagi ${row.irmaaMagi} differ`);
    /* R-NONNEG */
    if (typeof row.shortfall === 'number' && row.shortfall < 0) v('R-NONNEG', `rows[${i}].shortfall`, `negative: ${row.shortfall}`);
    if (typeof row.inflationFactor === 'number' && !(row.inflationFactor > 0)) v('R-NONNEG', `rows[${i}].inflationFactor`, `must be > 0: ${row.inflationFactor}`);
    if (own(row, 'rmdUnmet') && row.rmdUnmet < 0) v('R-NONNEG', `rows[${i}].rmdUnmet`, `negative: ${row.rmdUnmet}`);
    /* R-REAL */
    if (typeof row.total === 'number' && typeof row.inflationFactor === 'number' && row.inflationFactor > 0
        && !close(row.realTotal, row.total / row.inflationFactor)) {
      v('R-REAL', `rows[${i}].realTotal`, `expected total/inflationFactor = ${row.total / row.inflationFactor}, got ${row.realTotal}`);
    }
    /* R-AGE-ORDER */
    if (i > 0 && isRecord(rows[i - 1]) && !(row.age > rows[i - 1].age)) v('R-AGE-ORDER', `rows[${i}].age`, `${row.age} does not follow ${rows[i - 1].age}`);

    if (perPath) {
      /* R-CLASS */
      const classes = row.taxable + row.preTax + row.roth + row.hsa;
      if (!close(row.total, classes)) v('R-CLASS', `rows[${i}].total`, `expected taxable+preTax+roth+hsa = ${classes}, got ${row.total}`);
      /* R-DEBT */
      const debt = row.debtInterest + row.debtPrincipal + row.debtHousing;
      if (!close(row.debtPaymentsTotal, debt)) v('R-DEBT', `rows[${i}].debtPaymentsTotal`, `expected interest+principal+housing = ${debt}, got ${row.debtPaymentsTotal}`);
      /* R-RMD */
      const unmet = Math.max(0, row.rmd - row.rmdDistributed);
      if (!close(row.rmdUnmet, unmet)) v('R-RMD', `rows[${i}].rmdUnmet`, `expected max(0, rmd - rmdDistributed) = ${unmet}, got ${row.rmdUnmet}`);
      /* R-NETWORTH */
      if (plan) {
        const adv = plan.advanced || {};
        const ret = plan.retirement || {};
        const insurance = adv.networthOn && row.age >= ret.selfLife ? (Number(adv.insurance) || 0) : 0;
        /* Version 5 (S5AA R19, workstream A): net worth is net of the tax true-up outstanding at the row's end (the contract's identity 3). */
        const expected = row.total + (adv.networthOn ? row.otherAssets - row.debtBalance + insurance : 0) - (version >= 5 ? (Number(row.taxOutstanding) || 0) : 0);
        if (!close(row.networth, expected)) v('R-NETWORTH', `rows[${i}].networth`, `expected ${expected}, got ${row.networth}`);
      }
    } else {
      /* M-BAND */
      if (!(row.q10 <= row.total + 1e-9 && row.total <= row.q90 + 1e-9)) v('M-BAND', `rows[${i}]`, `q10 ${row.q10} <= total ${row.total} <= q90 ${row.q90} does not hold`);
    }
  }
  if (perPath && !plan) skipped.push('R-NETWORTH');

  /* R-AGE-SPAN. S5AA R9 round, the owner's decision 8 (2026-09-21): a projection stops at the last death, and says so with
     PROJECTION_ENDS_AT_LAST_DEATH. The last row is then the cut this checker derives ITSELF from the plan's lifespans --
     the first row opening at which nobody is alive -- never the engine's own claim, and the disclosure must name that
     cut. A result without the disclosure is held to profile.endAge exactly as before, so every earlier result is judged
     as it always was, and one that stops early without saying so is a violation. */
  if (plan && rows.length && rowsWellFormed) {
    if (!close(rows[0].age, plan.profile.age)) v('R-AGE-SPAN', 'rows[0].age', `expected profile.age ${plan.profile.age}, got ${rows[0].age}`);
    const stop = (Array.isArray(result.issues) ? result.issues : []).find((x) => isRecord(x) && x.code === 'PROJECTION_ENDS_AT_LAST_DEATH');
    const cut = lastDeathCut(plan);
    const lastRow = rows[rows.length - 1];
    if (stop && (cut === null || !isRecord(stop.state) || !close(stop.state.stoppedAtRowOpening, cut))) {
      v('R-AGE-SPAN', 'issues', `PROJECTION_ENDS_AT_LAST_DEATH names row opening ${isRecord(stop.state) ? stop.state.stoppedAtRowOpening : undefined}; the plan's lifespans give ${cut === null ? 'no cut' : cut}`);
    }
    /* R11 round, external audit of 02b921a (R10-08): FROM VERSION 4 THE CUT IS REQUIRED, not merely checked where the
       result volunteers its own warning. The version-3 reading above let the result choose: drop the disclosure, restore
       the rows after the death, and the checker fell back to profile.endAge and saw nothing. R12 round (R11-02): frozen
       to version 4, which the engine now produces; versions 2 and 3 keep exactly the reading their captures were taken
       under, so no stored capture is re-judged and no captured row is rewritten. */
    const currentProducer = version >= LAST_DEATH_CUT_REQUIRED_FROM;
    if (currentProducer && cut !== null && !stop) {
      v('R-AGE-SPAN', 'issues', `the plan's lifespans give a last-death cut at ${cut}, and the result does not carry PROJECTION_ENDS_AT_LAST_DEATH`);
    }
    if (currentProducer && stop && isRecord(stop.state)) {
      if (!close(stop.state.lastRowAge, lastRow.age)) v('R-AGE-SPAN', 'issues', `PROJECTION_ENDS_AT_LAST_DEATH names last row ${stop.state.lastRowAge}; the result ends at ${lastRow.age}`);
      if (!close(stop.state.horizonEndAge, plan.profile.endAge)) v('R-AGE-SPAN', 'issues', `PROJECTION_ENDS_AT_LAST_DEATH names horizon ${stop.state.horizonEndAge}; the plan's is ${plan.profile.endAge}`);
    }
    const lastExpected = (currentProducer ? cut !== null : stop && cut !== null) ? cut : plan.profile.endAge;
    if (!close(lastRow.age, lastExpected)) v('R-AGE-SPAN', `rows[${rows.length - 1}].age`, `expected ${lastExpected === cut ? 'the last-death cut' : 'profile.endAge'} ${lastExpected}, got ${lastRow.age}`);
  } else skipped.push('R-AGE-SPAN');

  if (perPath && rows.length && !rowsWellFormed) skipped.push('R-OPENING', 'T-LIFETIME', 'T-SHORTFALL', 'T-SUCCESS');
  if (perPath && rows.length && rowsWellFormed) {
    /* R-OPENING */
    const open = rows[0];
    if (!close(open.inflationFactor, 1)) v('R-OPENING', 'rows[0].inflationFactor', `expected 1, got ${open.inflationFactor}`);
    if (!close(open.realTotal, open.total)) v('R-OPENING', 'rows[0].realTotal', `expected total ${open.total}, got ${open.realTotal}`);
    ['contributions', 'income', 'spending', 'withdrawals', 'dividends', 'taxes', 'rmd', 'rmdDistributed', 'rmdUnmet',
      'shortfall', 'debtPayments', 'debtPaymentsTotal', 'debtInterest', 'debtPrincipal', 'debtHousing', 'nonPortfolioDraw', 'magi',
      'taxSettled', 'taxTrueUpPaid', 'taxOutstanding']
      .forEach((k) => { if (own(open, k) && open[k] !== 0) v('R-OPENING', `rows[0].${k}`, `opening-row flow must be 0, got ${open[k]}`); });

    /* T-LIFETIME */
    const sum = (f) => rows.reduce((t, r) => t + (Number(f(r)) || 0), 0);
    /* Version 5 (S5AA R19, workstream A, Q-A5): lifetime tax is the SETTLED tax, the terminal outstanding included. */
    const lt = version >= 5 ? sum((r) => r.taxSettled) : sum((r) => r.taxes);
    const lc = sum((r) => r.contributions);
    const lcr = sum((r) => (r.contributions || 0) / Math.max(0.0001, r.inflationFactor || 1));
    if (!close(result.lifetimeTaxes, lt)) v('T-LIFETIME', 'lifetimeTaxes', `expected sum(rows.${version >= 5 ? 'taxSettled' : 'taxes'}) = ${lt}, got ${result.lifetimeTaxes}`);
    if (!close(result.lifetimeContributions, lc)) v('T-LIFETIME', 'lifetimeContributions', `expected sum(rows.contributions) = ${lc}, got ${result.lifetimeContributions}`);
    if (!close(result.lifetimeContributionsReal, lcr)) v('T-LIFETIME', 'lifetimeContributionsReal', `expected ${lcr}, got ${result.lifetimeContributionsReal}`);

    /* T-SHORTFALL: sustained = the second row of the first run of AT LEAST
       two consecutive shortfall rows -- not the second row of the first run,
       which differs when an isolated shortfall precedes a later run. */
    let first = null; let sustained = null; let streak = 0;
    rows.slice(1).forEach((r) => {
      if (r.shortfall > 0.01) {
        if (first === null) first = r.age;
        streak += 1;
        if (streak >= 2 && sustained === null) sustained = r.age;
      } else streak = 0;
    });
    if (result.firstShortfallAge !== first) v('T-SHORTFALL', 'firstShortfallAge', `expected ${first}, got ${result.firstShortfallAge}`);
    if (result.sustainedFailureAge !== sustained) v('T-SHORTFALL', 'sustainedFailureAge', `expected ${sustained}, got ${result.sustainedFailureAge}`);
    if (result.failureAge !== result.sustainedFailureAge) v('T-SHORTFALL', 'failureAge', `must equal sustainedFailureAge (${result.sustainedFailureAge}), got ${result.failureAge}`);

    /* T-SUCCESS */
    const anyShortfall = rows.slice(1).some((r) => r.shortfall > 0.01);
    if (result.failed !== anyShortfall) v('T-SUCCESS', 'failed', `expected ${anyShortfall} (a row with shortfall > 0.01), got ${result.failed}`);
    if (result.successRate !== (result.failed ? 0 : 100)) v('T-SUCCESS', 'successRate', `expected ${result.failed ? 0 : 100}, got ${result.successRate}`);
  }

  if (outcome === 'okMonteCarlo') {
    /* M-PATHS. A path count is a count (BC-01): a positive integer. Zero,
       fractional and negative counts describe no simulation, and were accepted
       as long as the two agreed. */
    ['requestedPathCount', 'validPathCount'].forEach((k) => {
      const n = result[k];
      if (typeof n === 'number' && !(Number.isInteger(n) && n >= 1)) v('M-PATHS', k, `must be a positive integer, got ${n}`);
    });
    if (result.validPathCount !== result.requestedPathCount) v('M-PATHS', 'validPathCount', `expected requestedPathCount ${result.requestedPathCount}, got ${result.validPathCount}`);
    /* The plan-dependent half is REPORTED as skipped without a plan (BC-01),
       never silently omitted. Partial skips are named RULE:part. */
    if (plan) {
      if (result.requestedPathCount !== plan.assumptions.runs) v('M-PATHS', 'requestedPathCount', `expected assumptions.runs ${plan.assumptions.runs}, got ${result.requestedPathCount}`);
    } else skipped.push('M-PATHS:runs');
    /* M-SUCCESS */
    if (result.failed !== (result.successRate < 100)) v('M-SUCCESS', 'failed', `expected ${result.successRate < 100} for successRate ${result.successRate}, got ${result.failed}`);
  }

  return { outcome, mode, contractVersion: version, violations, unspecified, skipped };
}

/* ---- intended vs observed ---- */

/**
 * Two-way comparison with the DERIVED catalogue fixture: for each mode and row
 * kind, fields the contract requires that the catalogue did not observe, and
 * fields the catalogue observed that the contract does not specify.
 */
function catalogueDiff(catalogue) {
  const out = [];
  const setOf = (o) => new Set(Object.keys(o || {}));
  const diff = (where, intended, observed) => {
    [...intended].filter((k) => !observed.has(k)).forEach((k) => out.push({ where, field: k, direction: 'intended-not-observed' }));
    [...observed].filter((k) => !intended.has(k)).forEach((k) => out.push({ where, field: k, direction: 'observed-not-intended' }));
  };
  const optional = setOf(CONTRACT.topLevel.optional);
  const withOptional = (keys, observed) => new Set([...keys, ...[...optional].filter((k) => observed.has(k))]);
  const r = catalogue.result;
  ['simple', 'historical'].forEach((mode) => {
    const obsTop = setOf(r[mode].topLevel);
    diff(`${mode}.topLevel`, withOptional(Object.keys(CONTRACT.topLevel.okPerPath), obsTop), obsTop);
    diff(`${mode}.openingRow`, setOf(perPathRowSpec('opening')), setOf(r[mode].row && r[mode].row.fields));
    diff(`${mode}.ordinaryRow`, setOf(perPathRowSpec('ordinary')), setOf(r[mode].ordinaryRow && r[mode].ordinaryRow.fields));
  });
  const mcTop = setOf(r.monteCarlo.topLevel);
  diff('monteCarlo.topLevel', withOptional(Object.keys(CONTRACT.topLevel.okMonteCarlo), mcTop), mcTop);
  diff('monteCarlo.row', setOf(monteCarloRowSpec()), setOf(r.monteCarlo.row && r.monteCarlo.row.fields));
  const invTop = setOf(r.__invalid.topLevel);
  diff('invalid.topLevel', withOptional(Object.keys(CONTRACT.topLevel.invalid), invTop), invTop);
  /* The one TYPE disagreement worth surfacing: the catalogue describes the
     top level with rows replaced by [] (schema-catalogue.js buildCatalogue),
     so it cannot see the invalid contract's rows: null. */
  const invRows = r.__invalid.topLevel && r.__invalid.topLevel.rows;
  if (invRows && invRows.kind !== 'null') out.push({ where: 'invalid.topLevel', field: 'rows', direction: `type: intended null, catalogue records ${invRows.kind}` });
  return out;
}

module.exports = { CONTRACT, LAST_DEATH_CUT_REQUIRED_FROM, checkResult, catalogueDiff, outcomeOf, perPathRowSpec, monteCarloRowSpec, captureContractVersion, close };
