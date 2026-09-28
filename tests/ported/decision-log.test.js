'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDecisionLog } = require('../../src/ported/decision-log');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'decision-log.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

function stripTimestamp(event) {
  const { timestampUtc, ...rest } = event;
  return rest;
}

function pyEventToComparable(pyEvent) {
  return {
    runId: pyEvent.run_id,
    sequence: pyEvent.sequence,
    module: pyEvent.module,
    event: pyEvent.event,
    decisionYear: pyEvent.decision_year,
    age: pyEvent.age,
    payload: pyEvent.payload,
  };
}

test('decision log port: candidate_summary level drops detail=true payloads', () => {
  const log = createDecisionLog('run-a', { level: 'candidate_summary' });
  log.record('tax_optimizer', 'candidate_summary', { count: 5 }, { decisionYear: 2040, age: 65 });
  log.record('tax_optimizer', 'candidate', { weights: { voo: 0.5 } }, { decisionYear: 2040, age: 65, detail: true });
  log.record('tax_optimizer', 'selected', { weights: { voo: 1.0 } }, { decisionYear: 2040, age: 65 });

  const fixture = fixtures.cases.find((c) => c.name === 'candidate_summary_level_drops_detail');
  assert.deepEqual(log.events.map(stripTimestamp), fixture.events.map(pyEventToComparable));
  assert.deepEqual(log.summary(), fixture.summary);
});

test('decision log port: full_candidates level keeps detail=true payloads', () => {
  const log = createDecisionLog('run-b', { level: 'full_candidates' });
  log.record('tax_optimizer', 'candidate_summary', { count: 5 }, { decisionYear: 2040, age: 65 });
  log.record('tax_optimizer', 'candidate', { weights: { voo: 0.5 } }, { decisionYear: 2040, age: 65, detail: true });

  const fixture = fixtures.cases.find((c) => c.name === 'full_candidates_level_keeps_detail');
  assert.deepEqual(log.events.map(stripTimestamp), fixture.events.map(pyEventToComparable));
});

test('decision log port: triggeredDetail bypasses the level gate', () => {
  const log = createDecisionLog('run-c', { level: 'candidate_summary' });
  log.record('reserve', 'draw', { amount: 100.0 }, { decisionYear: 2040, age: 65, detail: true, triggeredDetail: true });

  const fixture = fixtures.cases.find((c) => c.name === 'triggered_detail_bypasses_level_gate');
  assert.deepEqual(log.events.map(stripTimestamp), fixture.events.map(pyEventToComparable));
});

test('decision log port: float rounding to 8 decimals and nested-structure flattening', () => {
  const log = createDecisionLog('run-d', { level: 'full_candidates' });
  log.record(
    'tax_optimizer',
    'selected',
    {
      pi_like: 3.14159265358979323846,
      nested: { a: 1.0000000049, b: [1.123456785, 2.987654321987] },
      // JS has no dataclass distinction -- a plain object already matches
      // what Python's asdict() flattening produces.
      plan: { name: 'test', amount: 1234.5678912345, tags: ['x', 'y', 'z'] },
      tuple_field: [1.1, 2.2, 3.3],
      path_like: 'some\\relative\\path.json',
    },
    { decisionYear: 2040, age: 65 }
  );

  const fixture = fixtures.cases.find((c) => c.name === 'float_rounding_and_dataclass_flattening');
  assert.deepEqual(log.events.map(stripTimestamp), fixture.events.map(pyEventToComparable));
});

test('decision log port: no decisionYear/age defaults to null, empty payload', () => {
  const log = createDecisionLog('run-e');
  log.record('misc', 'note', null);

  const fixture = fixtures.cases.find((c) => c.name === 'no_year_or_age_empty_payload');
  assert.deepEqual(log.events.map(stripTimestamp), fixture.events.map(pyEventToComparable));
});

test('decision log port: sequence numbering and summary aggregation across modules', () => {
  const log = createDecisionLog('run-f', { level: 'full_candidates' });
  for (let i = 0; i < 5; i++) log.record('moduleA', 'eventX', { i }, { decisionYear: 2040 + i, age: 65 + i });
  for (let i = 0; i < 3; i++) log.record('moduleB', 'eventY', { i }, { decisionYear: 2040 + i, age: 65 + i });

  const fixture = fixtures.cases.find((c) => c.name === 'sequence_and_summary_aggregation');
  assert.deepEqual(log.events.map(stripTimestamp), fixture.events.map(pyEventToComparable));
  assert.deepEqual(log.summary(), fixture.summary);
});
