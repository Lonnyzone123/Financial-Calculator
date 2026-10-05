// S5AA R54: the app-exposure runner. Usage: node r54_run_app_exposure.js <tree> <hook> <out.jsonl> <log>
// Runs, with the R54 app hook, every test file of package.json's test:list whose text can reach a jsdom page (it names jsdom/JSDOM,
// loadCalculator, the harness, the build-routes or worker-source helpers), in batches, in the tree given. Prints each batch's TAP totals.
'use strict';
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const TREE = path.resolve(process.argv[2]), HOOK = path.resolve(process.argv[3]), OUT = path.resolve(process.argv[4]), LOG = path.resolve(process.argv[5]);
const pkg = JSON.parse(fs.readFileSync(path.join(TREE, 'package.json'), 'utf8'));
let files = pkg.scripts['test:list'].replace(/^node --test /, '').split(/\s+/).filter(Boolean);
files = files.flatMap((f) => f.includes('*') ? fs.readdirSync(path.join(TREE, 'tests', 'ported')).filter((x) => x.endsWith('.test.js')).map((x) => 'tests/ported/' + x) : [f]);
const REACH = /jsdom|JSDOM|loadCalculator|lib\/harness|build-routes|worker-source/;
files = files.filter((f) => REACH.test(fs.readFileSync(path.join(TREE, f), 'utf8')));
fs.writeFileSync(OUT, ''); fs.writeFileSync(LOG, 'files ' + files.length + '\n');
const B = 8; let fails = 0;
for (let i = 0; i < files.length; i += B) {
  const batch = files.slice(i, i + B);
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=2', '--test-reporter=tap', ...batch], { cwd: TREE, env: Object.assign({}, process.env, { NODE_OPTIONS: '--require ' + HOOK, R54_EXPOSURE_OUT: OUT, R54_TREE: TREE }), encoding: 'utf8', maxBuffer: 1 << 28 });
  const tail = (r.stdout || '').split('\n').filter((l) => /^# (tests|pass|fail|todo|skip)/.test(l) || /^not ok/.test(l)).join(' | ');
  fs.appendFileSync(LOG, 'batch ' + (i / B) + ' exit ' + r.status + ' :: ' + batch.join(' ') + '\n   ' + tail + '\n'); if (r.status !== 0) fails++;
}
fs.appendFileSync(LOG, 'DONE files ' + files.length + ' failing batches ' + fails + '\n');
