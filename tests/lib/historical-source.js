'use strict';

/*
 * Is the engine that captured the stored control here to replay?
 *
 * The public repository began on 2026-09-28 as a one-commit copy of the private development repository. It carries
 * neither the capturing commit's git objects nor its reference-trees/ directory: that engine's sources hold the owner's
 * name in comments, and a replay verifies them byte for byte against the hashes the capture recorded, so no redacted
 * copy could replay. They stay in the private archive, where the replay checks run in full.
 *
 * That is checked, not assumed. Availability is decided here from the two sources themselves, not from the tool under
 * test, and where neither is present the tool must answer BLOCKED for exactly that reason. A source that is present but
 * wrong still fails the tests: only an absent source stands them down.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const CONTROL = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'control-corpus.json'), 'utf8'));
const COMMIT = JSON.parse(fs.readFileSync(path.join(ROOT, CONTROL.controlCapture.file), 'utf8')).meta.gitCommit;

const gitHasCommit = spawnSync('git', ['-C', ROOT, 'cat-file', '-e', COMMIT + '^{commit}'], { encoding: 'utf8' }).status === 0;
const treeDir = path.join(ROOT, 'reference-trees', COMMIT);
const treePresent = fs.existsSync(treeDir);

/* True where the capturing engine can be read, from git objects or the committed reference tree. */
const CAPTURING_ENGINE_HERE = gitHasCommit || treePresent;

/* Call at the top of a test that needs the capturing engine; returns true when the test should stand down, having
   checked that the replay tool agrees nothing could be replayed and says why. */
function capturingEngineAbsent() {
  if (CAPTURING_ENGINE_HERE) return false;
  const tool = require('../../tools/historical-replay.js');
  const r = tool.replay(JSON.parse(fs.readFileSync(path.join(ROOT, CONTROL.controlCapture.file), 'utf8')));
  assert.equal(r.status, 'BLOCKED', 'with no capturing engine here, the replay must be BLOCKED, never a pass');
  const why = r.problems.join(' ');
  assert.match(why, new RegExp('commit ' + COMMIT + ' is not among the git objects'), 'BLOCKED names the missing commit');
  assert.match(why, /no reference tree at /, 'BLOCKED names the missing reference tree');
  return true;
}

module.exports = { COMMIT, CAPTURING_ENGINE_HERE, capturingEngineAbsent };
