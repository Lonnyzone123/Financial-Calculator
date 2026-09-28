'use strict';
/* CI DIAGNOSTIC, RUN ONLY WHEN THE GATE HAS FAILED: name the failing tests.
 *
 * tools/verify-test-gate.js judges a run from its counts and its event stream, and prints the counts -- not the names
 * of the tests that failed (its event stream is a temporary file it removes). Locally a failure is named by re-running
 * the file alone. On a GitHub runner there is nothing to re-run by hand, so the first Windows CI run failed with
 * "2 failing test(s)" and no way to see which.
 *
 * This re-runs the SAME registered file list (package.json's test:list; the gate has already proved every file on
 * disk is in it) with the TAP reporter, writes the whole TAP stream to failures.tap, and prints each `not ok` with the
 * diagnostic block beneath it. It is a diagnostic only: it always exits 0, and the gate's verdict stands.
 *
 * Usage: node tools/ci-name-failures.js
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

/* Each `not ok` line with the lines beneath it that are indented deeper, which is where TAP puts the YAML diagnostic
   (the assertion, the expected and actual values, the location). */
function namedFailures(tap) {
  const lines = String(tap).split(/\r?\n/);
  const blocks = [];
  lines.forEach(function (line, i) {
    const m = /^(\s*)not ok \d+ - /.exec(line);
    /* An authorised todo is written `not ok ... # TODO` by TAP; it is not a failure, and the gate already checks it by name. */
    if (!m || /\s# (TODO|SKIP)\b/i.test(line)) return;
    const block = [line];
    for (let j = i + 1; j < lines.length && block.length < 40; j++) {
      const indent = /^(\s*)/.exec(lines[j])[1].length;
      if (lines[j].trim() !== '' && indent <= m[1].length) break;
      block.push(lines[j]);
    }
    blocks.push(block.join('\n'));
  });
  return blocks;
}

function main() {
  const list = require(path.join(ROOT, 'package.json')).scripts['test:list'];
  const files = list.replace(/^node --test /, '').split(' ').filter(Boolean);
  const env = Object.assign({}, process.env);
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap'].concat(files),
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: env });
  const tap = (run.stdout || '') + (run.stderr || '');
  fs.writeFileSync(path.join(ROOT, 'failures.tap'), tap);
  const blocks = namedFailures(tap);
  process.stdout.write('re-ran ' + files.length + ' registered entries; runner exit ' + run.status + '; ' +
    blocks.length + ' `not ok` line(s), parents included\n\n');
  blocks.forEach(function (b) { process.stdout.write(b + '\n\n'); });
  process.exit(0);
}

if (require.main === module) main();

module.exports = { namedFailures };
