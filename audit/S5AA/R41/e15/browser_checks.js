/* S5AA R41 (task 6.5): the browser checks, as run for the record. Evaluate canon.js, mathprobe.js, harness.js and this
   file in the page (served by server.js), then call, each in its own step:
     await R41.env()    the served artifact's SHA-256, the browser, the worker source
     await R41.checkA() all plans: the app's own Worker source in a real Worker, and the same source on the main
                        thread, each hashed against Node (identity.runId masked; key order compared unmasked)
     await R41.checkB() all plans through the app's own "Restore backup": the real Worker path, then the real
                        main-thread path (Worker removed), each exporting the projection CSV; plus every app Worker
                        message against the main-thread engine on the exact plan the app posted
     await R41.checkC() exceptions, on a deterministic and a Monte Carlo plan: a Worker that throws in runScenario, a
                        Worker that fails to load, both paths throwing, the rendered error state, then recovery
     await R41.checkD() compare mode: four scenarios, four concurrent Workers, against the main thread
     await R41.checkE() the plans whose browser result differs from Node's: how many numbers, how far, and whether any
                        count, rate or other non-continuous field differs (needs node_mc_raw.json from dump_mc_raw.js)
   Results accumulate in window.R41_RESULTS. Nothing is written to disk; downloads are captured in memory. */
(function () {
  var R = window.R41, OUT = window.R41_RESULTS = window.R41_RESULTS || {};
  async function load(name) { return (await fetch('/r41/' + name, { cache: 'no-store' })).json(); }
  async function mainEngine() {
    if (!R.workerUrls.length) { R.setMode('worker'); await R.importPlans([R.CORPUS[0].plan], false); }
    var src = await (await fetch(R.workerUrls[0])).text();
    return { src: src, run: new Function('self', src + '\nreturn runScenario;')({ postMessage: function () {} }) };
  }
  var hashOf = async function (res) { return R.sha(r41Canon(r41Mask(res).masked)); };

  R.env = async function () {
    R.CORPUS = await load('corpus.json');
    R.NODE = (await load('node_results.json')).node;
    var buf = await (await fetch(location.href, { cache: 'no-store' })).arrayBuffer();
    var d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
    var eng = await mainEngine();
    OUT.env = { artifactSha256: Array.from(d).map(function (x) { return x.toString(16).padStart(2, '0'); }).join(''), artifactBytes: buf.byteLength,
      userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, secureContext: isSecureContext,
      workerSourceSha256: await R.sha(eng.src), workerSourceChars: eng.src.length, plans: R.CORPUS.length,
      mathProbeMain: r41MathProbe() };
    var wsrc = (await (await fetch('/r41/mathprobe.js', { cache: 'no-store' })).text()) + '\nself.onmessage=function(){self.postMessage(r41MathProbe())};';
    OUT.env.mathProbeWorker = await new Promise(function (res) { var w = new R.OrigWorker(URL.createObjectURL(new Blob([wsrc], { type: 'text/javascript' }))); w.onmessage = function (e) { w.terminate(); res(e.data); }; w.postMessage(0); });
    return OUT.env;
  };

  R.checkA = async function () {
    var eng = await mainEngine(), url = R.workerUrls[0], rows = [];
    for (var i = 0; i < R.CORPUS.length; i++) {
      var e = R.CORPUS[i], n = R.NODE[e.name];
      var w = await R.runInWorker(url, JSON.parse(JSON.stringify(e.plan)));
      var m = eng.run(JSON.parse(JSON.stringify(e.plan)));
      if (w.error) { rows.push({ name: e.name, workerError: String(w.error).split('\n')[0] }); continue; }
      var wh = await hashOf(w.result), mh = await hashOf(m);
      rows.push({ name: e.name, code: n.code, workerEqualsMain: wh === mh, workerEqualsNode: wh === n.hash, mainEqualsNode: mh === n.hash,
        keyOrderWorker: (await R.sha(r41KeyOrder(w.result))) === n.keyOrder, keyOrderMain: (await R.sha(r41KeyOrder(m))) === n.keyOrder,
        runId: r41Mask(w.result).runId, runIdsDiffer: r41Mask(w.result).runId === 'string' ? w.result.identity.runId !== m.identity.runId : null });
    }
    OUT.A = rows;
    return { plans: rows.length, workerEqualsMain: rows.filter(function (r) { return r.workerEqualsMain; }).length,
      equalToNode: rows.filter(function (r) { return r.workerEqualsNode && r.mainEqualsNode; }).length,
      notEqualToNode: rows.filter(function (r) { return !(r.workerEqualsNode && r.mainEqualsNode); }).map(function (r) { return r.name; }),
      keyOrderAll: rows.every(function (r) { return r.keyOrderWorker && r.keyOrderMain; }), workerErrors: rows.filter(function (r) { return r.workerError; }).length };
  };

  R.checkB = async function () {
    var rows = [], pb = R.posted.length, rb = R.received.length;
    for (var i = 0; i < R.CORPUS.length; i++) {
      var e = R.CORPUS[i], row = { name: e.name };
      R.restoreAll(); R.setMode('worker');
      var before = R.received.length, iw = await R.importPlans([e.plan], false);
      if (!iw.imported) { row.refusedAtImport = iw.status; rows.push(row); continue; }
      row.worker = iw.mode + ' | ' + iw.perf; row.workerMessages = R.received.length - before;
      var cw = await R.exportCsv(); row.csvWorker = cw.exported ? await R.sha(cw.text) : 'refused: ' + cw.status; row.csvBytes = cw.exported ? cw.text.length : 0;
      R.setMode('main');
      var im = await R.importPlans([e.plan], false); row.main = im.mode + ' | ' + im.perf;
      var cm = await R.exportCsv(); row.csvMain = cm.exported ? await R.sha(cm.text) : 'refused: ' + cm.status;
      row.csvEqual = row.csvWorker === row.csvMain;
      rows.push(row);
    }
    R.restoreAll();
    var eng = await mainEngine(), posted = R.posted.slice(pb), recv = R.received.slice(rb), pairs = 0, equal = 0;
    for (var j = 0; j < posted.length; j++) {
      var r = recv[j]; if (!r || r.id !== posted[j].id || !r.result) continue; pairs++;
      if ((await hashOf(r.result)) === (await hashOf(eng.run(JSON.parse(JSON.stringify(posted[j].plan)))))) equal++;
    }
    OUT.B = { rows: rows, appWorkerMessagesVsMainEngine: { pairs: pairs, equal: equal } };
    var imp = rows.filter(function (x) { return !x.refusedAtImport; });
    return { plans: rows.length, imported: imp.length, csvEqual: imp.filter(function (x) { return x.csvEqual; }).length,
      refusedAtImport: rows.filter(function (x) { return x.refusedAtImport; }).map(function (x) { return x.name; }),
      workerModes: Array.from(new Set(imp.map(function (x) { return x.worker; }))), mainModes: Array.from(new Set(imp.map(function (x) { return x.main; }))),
      oneWorkerMessageEach: imp.every(function (x) { return x.workerMessages === 1; }), appWorkerMessagesVsMainEngine: OUT.B.appWorkerMessagesVsMainEngine };
  };

  async function importOnto(plan, page) {
    var p = JSON.parse(JSON.stringify(plan)); p.setupComplete = true; p.id = 'r41-' + page;
    var payload = { format: 'investment-calculator-v2c', version: 2, app: { version: 2, edition: '2C', page: page, complexity: 'standard', theme: 'auto', compare: false, active: 0, scenarios: [p] } };
    var el = document.getElementById('v2-performance'); el.textContent = 'R41 waiting';
    var input = document.getElementById('v2-import-settings'), dt = new DataTransfer();
    dt.items.add(new File([JSON.stringify(payload)], 'r41.json', { type: 'application/json' })); input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    var t0 = Date.now(); while (Date.now() - t0 < 20000 && !/complete|stopped/i.test(el.textContent)) await R.sleep(25);
    return { perf: el.textContent, mode: R.mode(), status: R.status() };
  }

  R.checkC = async function () {
    var out = {};
    var names = ['golden:baseline', 'golden:monte-carlo-fixed-seed'];
    for (var k = 0; k < names.length; k++) {
      var name = names[k], plan = R.CORPUS.find(function (e) { return e.name === name; }).plan, r = {};
      try {
        R.restoreAll(); R.setMode('worker');
        await R.importPlans([plan], false); var ref = await R.sha((await R.exportCsv()).text); r.reference = { mode: R.mode(), csv: ref };
        var faults = ['throw-in-run', 'throw-at-load'];
        for (var f = 0; f < faults.length; f++) {
          R.restoreAll(); R.setMode('worker'); R.workerFault = faults[f];
          var rb = R.received.length, imp = await R.importPlans([plan], false), msgs = R.received.slice(rb), csv = await R.exportCsv();
          r[faults[f]] = { mode: imp.mode, perf: imp.perf, status: imp.status,
            workerMessages: msgs.map(function (m) { return m.error ? 'error: ' + String(m.error).split('\n')[0] : 'result'; }),
            csvEqualsReference: csv.exported && (await R.sha(csv.text)) === ref };
        }
        R.restoreAll(); R.setMode('worker'); R.workerFault = 'throw-in-run'; R.mainFault(true);
        var both = await importOnto(plan, 'results');
        R.restoreAll();
        await R.sleep(150);
        var cards = Array.from(document.querySelectorAll('#v2-warnings .v2-card')).map(function (c) { return c.textContent; });
        var chart = document.getElementById('v2-chart');
        var leafText = Array.from(document.body.querySelectorAll('*')).filter(function (n) { return n.children.length === 0 && n.offsetParent !== null; }).map(function (n) { return n.textContent; });
        var csv3 = await R.exportCsv(), dbg = await R.exportDebug(), dj = dbg && JSON.parse(dbg.text);
        var issue = dj && dj.issues.filter(function (i) { return i.code === 'ENGINE_RUN_FAILED'; }).slice(-1)[0];
        r.bothFail = { mode: both.mode, perf: both.perf, status: both.status,
          errorCard: (cards.find(function (t) { return /Calculation error detected/.test(t); }) || 'ABSENT').slice(0, 200),
          visibleDollarFigures: leafText.filter(function (t) { return /\$\s?\d/.test(t); }).length,
          visibleTables: Array.from(document.querySelectorAll('table')).filter(function (t) { return t.offsetParent !== null; }).length,
          chartChildren: chart ? chart.childElementCount : null,
          csvExport: csv3.exported ? 'EXPORTED' : csv3.status,
          debugFileName: dbg && dbg.name, debugEnvironmentComputeMode: dj && dj.environment.computeMode,
          debugIssue: issue && { code: issue.code, severity: issue.severity, message: issue.message, error: issue.state && issue.state.error, computeMode: issue.state && issue.state.computeMode } };
        R.restoreAll(); R.setMode('worker');
        var rec = await importOnto(plan, 'setup'), csv4 = await R.exportCsv();
        r.recovery = { mode: rec.mode, perf: rec.perf, status: rec.status, csvEqualsReference: csv4.exported && (await R.sha(csv4.text)) === ref };
      } finally { R.restoreAll(); }
      out[name] = r;
    }
    OUT.C = out;
    return out;
  };

  R.checkD = async function () {
    var names = ['golden:baseline', 'golden:monte-carlo-fixed-seed', 'targeted:historical-1929', 'expansion:s5aa-gap-retired-couple'];
    var plans = names.map(function (n) { return R.CORPUS.find(function (e) { return e.name === n; }).plan; });
    var eng = await mainEngine(); R.restoreAll(); R.setMode('worker');
    var maxActive = 0, el = document.getElementById('v2-performance');
    var obs = new MutationObserver(function () { var m = /^(\d+) background worker/.exec(el.textContent); if (m) maxActive = Math.max(maxActive, +m[1]); });
    obs.observe(el, { childList: true, characterData: true, subtree: true });
    var pb = R.posted.length, rb = R.received.length, iw = await R.importPlans(plans, true); obs.disconnect();
    var posted = R.posted.slice(pb), recv = R.received.slice(rb), per = [];
    for (var i = 0; i < posted.length; i++) {
      var p = posted[i], r = recv.find(function (x) { return x.id === p.id; });
      per.push({ id: p.id, workerEqualsMain: !!(r && r.result) && (await hashOf(r.result)) === (await hashOf(eng.run(JSON.parse(JSON.stringify(p.plan))))) });
    }
    var cw = await R.exportCsv(); R.setMode('main'); var im = await R.importPlans(plans, true); var cm = await R.exportCsv(); R.restoreAll();
    OUT.D = { scenarios: names, worker: { mode: iw.mode, perf: iw.perf, workersAnnounced: maxActive, posted: posted.length, received: recv.length, perScenario: per },
      main: { mode: im.mode, perf: im.perf }, activeScenarioCsvEqual: !!(cw.exported && cm.exported && cw.text === cm.text) };
    return OUT.D;
  };
})();
/* checkE: the three plans whose browser result differs from Node's. node_mc_raw.json (dump_mc_raw.js) holds Node's masked
   results; non-finite numbers and -0 are tagged the same way on both sides. Reports, per plan, how many numbers differ, the
   largest relative difference, and any difference that is not a non-integer number (an integer, a string, a boolean, a
   null), which would be a classification or a count rather than a last-bit difference. */
(function () {
  var R = window.R41, OUT = window.R41_RESULTS;
  R.checkE = async function () {
    var nodeRaw = await (await fetch('/r41/node_mc_raw.json', { cache: 'no-store' })).json();
    var src = await (await fetch(R.workerUrls[0])).text();
    var run = new Function('self', src + '\nreturn runScenario;')({ postMessage: function () {} });
    var enc = function (r) { return JSON.parse(JSON.stringify(r, function (k, v) { return (typeof v === 'number' && !Number.isFinite(v)) ? 'NONFINITE:' + v : (Object.is(v, -0) ? 'NEGZERO' : v); })); };
    var out = {};
    for (var name in nodeRaw) {
      var plan = R.CORPUS.find(function (e) { return e.name === name; }).plan;
      var w = enc(r41Mask((await R.runInWorker(R.workerUrls[0], JSON.parse(JSON.stringify(plan)))).result).masked);
      var m = enc(r41Mask(run(JSON.parse(JSON.stringify(plan)))).masked);
      var acc = { numbers: 0, maxRelative: 0, maxAt: null, other: [] };
      (function walk(x, y, p) {
        if (x && y && typeof x === 'object' && typeof y === 'object') { new Set(Object.keys(x).concat(Object.keys(y))).forEach(function (k) { walk(x[k], y[k], p + '.' + k); }); return; }
        if (JSON.stringify(x) === JSON.stringify(y)) return;
        if (typeof x === 'number' && typeof y === 'number' && !(Number.isInteger(x) && Number.isInteger(y))) {
          var rel = Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y)); acc.numbers++; if (rel > acc.maxRelative) { acc.maxRelative = rel; acc.maxAt = p; }
        } else acc.other.push(p + ': ' + JSON.stringify(x) + ' vs ' + JSON.stringify(y));
      })(m, nodeRaw[name], '');
      out[name] = { workerEqualsMain: JSON.stringify(w) === JSON.stringify(m), numbersDiffering: acc.numbers, maxRelative: acc.maxRelative, maxAt: acc.maxAt,
        nonContinuousDifferences: acc.other.slice(0, 10), successRate: [m.successRate, nodeRaw[name].successRate], validPathCount: [m.validPathCount, nodeRaw[name].validPathCount] };
    }
    OUT.E = out;
    return out;
  };
})();
