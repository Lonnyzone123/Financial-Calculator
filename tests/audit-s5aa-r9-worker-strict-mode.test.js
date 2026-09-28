/* S5AA R9 round, DeepSeek audit finding 2i/01 (reproduced at 623cf64): THE WORKER'S ENGINE RUNS IN STRICT MODE, AS THE
 * NODE ENGINE DOES.
 *
 * src/engine.js and every debt module open with 'use strict', so the Node tests run the engine strict. The app's
 * buildWorkerSource() assembled the Worker's script as debt modules + '"use strict";' + engine: a directive is only a
 * directive at the START of a script, so there it was an inert string and the browser ran the whole engine SLOPPY --
 * the same code under different semantics from the one the tests verify (an assignment to an undeclared name is a
 * ReferenceError in one and a new global in the other). The directive now comes first.
 *
 * Read from the source the built app actually hands its Worker (tests/lib/worker-source.js), and run it there.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { liveWorkerSource, cleanup } = require('./lib/worker-source.js');

test.after(cleanup);

test('finding 2i/01: the Worker script opens with the "use strict" directive', async () => {
  const source = await liveWorkerSource();
  assert.match(source, /^\s*["']use strict["'];/, 'the first statement of the Worker script is the directive');
});

test('finding 2i/01: code in the Worker script runs strict -- a probe in the same script sees it', async () => {
  const source = await liveWorkerSource();
  const ctx = vm.createContext({ self: {} });
  vm.runInContext(source + '\n;self.__strict=(function(){return this===undefined})();', ctx);
  assert.equal(ctx.self.__strict, true, 'a plain function call has no this: strict mode');
  assert.equal(typeof ctx.self.onmessage, 'function', 'CONTROL: the script still installs its message handler');
});
