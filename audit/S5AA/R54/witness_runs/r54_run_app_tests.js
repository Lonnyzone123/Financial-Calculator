// S5AA R54: runs, without any hook, the test files of package.json's test:list that can reach a jsdom page (the selection of
// prediction/r54_run_app_exposure.js) plus the files named on the command line, in batches; prints each batch's TAP totals and every
// failing test. Usage: node r54_run_app_tests.js <tree> <log> [extra test files...]
'use strict';
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const TREE = path.resolve(process.argv[2]), LOG = path.resolve(process.argv[3]), EXTRA = process.argv.slice(4);
const pkg = JSON.parse(fs.readFileSync(path.join(TREE, 'package.json'), 'utf8'));
let files = pkg.scripts['test:list'].replace(/^node --test /, '').split(/\s+/).filter(Boolean);
files = files.flatMap((f) => f.includes('*') ? fs.readdirSync(path.join(TREE, 'tests', 'ported')).filter((x) => x.endsWith('.test.js')).map((x) => 'tests/ported/' + x) : [f]);
const REACH = /jsdom|JSDOM|loadCalculator|lib\/harness|build-routes|worker-source/;
files = files.filter((f) => REACH.test(fs.readFileSync(path.join(TREE, f), 'utf8')));
for (const e of EXTRA) if (!files.includes(e)) files.push(e);
fs.writeFileSync(LOG, 'files ' + files.length + '\n');
const B = 8; let fails = 0, tests = 0, pass = 0, fail = 0, todo = 0;
for (let i = 0; i < files.length; i += B) {
  const batch = files.slice(i, i + B);
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=2', '--test-reporter=tap', ...batch], { cwd: TREE, encoding: 'utf8', maxBuffer: 1 << 28 });
  const out = r.stdout || '';
  const num = (k) => { const m = out.match(new RegExp('^# ' + k + ' ([0-9]+)', 'm')); return m ? Number(m[1]) : 0; };
  tests += num('tests'); pass += num('pass'); fail += num('fail'); todo += num('todo');
  const notOk = out.split('\n').filter((l) => /^\s*not ok/.test(l));
  fs.appendFileSync(LOG, 'batch ' + (i / B) + ' exit ' + r.status + ' :: ' + batch.join(' ') + '\n   # tests ' + num('tests') + ' pass ' + num('pass') + ' fail ' + num('fail') + ' todo ' + num('todo') + '\n' + notOk.map((l) => '   ' + l.trim()).join('\n') + (notOk.length ? '\n' : ''));
  if (r.status !== 0) fails++;
}
fs.appendFileSync(LOG, 'DONE files ' + files.length + ' tests ' + tests + ' pass ' + pass + ' fail ' + fail + ' todo ' + todo + ' failing batches ' + fails + '\n');
