/*
 * A node:test reporter for tools/verify-test-gate.js: one JSON object per line
 * for each event the gate needs to name tests, not merely count them.
 *
 * WHY IT EXISTS (S4 task 2b.2g). The gate used to read only the TAP summary
 * -- `# todo 19` -- so it could say HOW MANY tests were todo but never WHICH.
 * A real test quietly becoming todo while an authorized one was promoted left
 * the number unchanged and nothing noticed. Identity has to come from the
 * runner's own events: the TAP summary carries no names, and TAP test lines
 * carry no file.
 *
 * It serializes and decides nothing. Every judgement lives in the gate, where
 * it is tested; a reporter that filtered or summarized would be a second
 * place a test could disappear from the count.
 */
export default async function* gateReporter(source) {
  for await (const event of source) {
    const t = event.type;
    if (t !== 'test:start' && t !== 'test:pass' && t !== 'test:fail' && t !== 'test:summary') continue;
    const d = event.data || {};
    const out = { type: t, name: d.name, nesting: d.nesting, file: d.file, line: d.line };
    if (d.todo !== undefined) out.todo = d.todo;
    if (d.skip !== undefined) out.skip = d.skip;
    if (d.details && d.details.type) out.detailsType = d.details.type;
    // Node counts a result ended by its own timeout, or by a parent that ended
    // first, as CANCELLED rather than failed, and this is the only place it says
    // which. The gate reconciles that count (S4-IR-01); the reason is carried
    // here, not judged.
    if (d.details && d.details.error && d.details.error.failureType) out.failureType = d.details.error.failureType;
    if (t === 'test:summary') { out.counts = d.counts; out.success = d.success; }
    yield JSON.stringify(out) + '\n';
  }
}
