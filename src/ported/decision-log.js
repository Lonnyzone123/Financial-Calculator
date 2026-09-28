'use strict';
/*
 * Ported from the Financial Projection V2.1.2 (M5 PASS) Python engine's
 * retirement_model_v2/decision_log.py. Faithful translation, verified
 * against Python-generated fixtures in fixtures/decision-log.fixtures.json
 * (see tests/ported/decision-log.test.js). Timestamps are excluded from
 * fixture comparison (real-clock-based, non-deterministic in both
 * languages) -- everything else (sequence numbers, module/event/
 * decisionYear/age, and the normalized payload) is compared exactly.
 *
 * Compact structured decision log: candidate-heavy modules log summaries by
 * default (level "candidate_summary"); full candidate detail can be enabled
 * via level "full_candidates" without changing call sites, or forced open
 * per-call via triggeredDetail (used for "debug on trigger" logging by
 * callers like the tax optimizer).
 */

function jsonable(value) {
  if (Array.isArray(value)) return value.map(jsonable);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[String(k)] = jsonable(v);
    return out;
  }
  if (typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value)) {
    // Mirrors Python's round(value, 8). Python integers (no fractional
    // part) pass through asdict()/json unrounded, same as
    // Number.isInteger(value) values here.
    return Math.round(value * 1e8) / 1e8;
  }
  return value;
}

/*
 * Track J extension (2026-09-09) -- NOT part of the Python port.
 *
 * issue()/issues/issueSummary() are additions the Python source does not
 * have. They are deliberately kept in a separate array with separate
 * accessors so that record(), events, and summary() stay byte-identical in
 * behavior to the Python oracle -- the fixture tests in
 * tests/ported/decision-log.test.js compare summary() exactly, and this
 * port's whole value is that fidelity. Anything below that touches the
 * ported surface would invalidate it.
 */

const ISSUE_SEVERITIES = ['WARNING', 'ERROR', 'CRITICAL'];

function createDecisionLog(runId, { level } = {}) {
  level = level || 'candidate_summary';
  const events = [];
  const issues = [];
  let sequence = 0;

  function record(module, event, payload, { decisionYear, age, detail, triggeredDetail } = {}) {
    if (detail && level !== 'full_candidates' && !triggeredDetail) return;
    sequence += 1;
    events.push({
      runId,
      sequence,
      timestampUtc: new Date().toISOString(),
      module,
      event,
      decisionYear: decisionYear === undefined ? null : decisionYear,
      age: age === undefined ? null : age,
      payload: jsonable(payload || {}),
    });
  }

  function summary() {
    const byModule = {};
    const byEvent = {};
    for (const item of events) {
      byModule[item.module] = (byModule[item.module] || 0) + 1;
      const key = `${item.module}.${item.event}`;
      byEvent[key] = (byEvent[key] || 0) + 1;
    }
    return { run_id: runId, events: events.length, by_module: byModule, by_event: byEvent };
  }

  function issue(module, code, severity, message, state, { decisionYear, age } = {}) {
    if (!code) throw new Error('decision log: an issue needs a stable code');
    if (ISSUE_SEVERITIES.indexOf(severity) === -1) {
      throw new Error(`decision log: severity must be one of ${ISSUE_SEVERITIES.join('/')}, got ${severity}`);
    }
    issues.push({
      runId,
      sequence: issues.length + 1,
      timestampUtc: new Date().toISOString(),
      module,
      code,
      severity,
      message: message === undefined ? '' : String(message),
      decisionYear: decisionYear === undefined ? null : decisionYear,
      age: age === undefined ? null : age,
      state: jsonable(state || {}),
    });
  }

  function issueSummary() {
    const byCode = {};
    const bySeverity = {};
    for (const item of issues) {
      byCode[item.code] = (byCode[item.code] || 0) + 1;
      bySeverity[item.severity] = (bySeverity[item.severity] || 0) + 1;
    }
    // Most severe code present, for the debug-export filename.
    let worst = null;
    for (const severity of ['CRITICAL', 'ERROR', 'WARNING']) {
      const match = issues.find((i) => i.severity === severity);
      if (match) { worst = match.code; break; }
    }
    return { run_id: runId, issues: issues.length, by_code: byCode, by_severity: bySeverity, most_severe_code: worst };
  }

  return { events, issues, record, summary, issue, issueSummary };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createDecisionLog, jsonable, ISSUE_SEVERITIES };
}
