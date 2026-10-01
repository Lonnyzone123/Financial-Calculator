/* S5AA R41 (task 6.5): instrumentation for the desktop-browser check, evaluated in the page after it loads. It
   changes no source file. It (1) records the app's real Worker traffic, (2) captures a download's bytes and stops the
   file being written, (3) imports plans through the app's own "Restore backup" input, and (4) can inject a fault
   into the Worker or the main thread for the exception checks. Every fault is named in its error message. */
(function () {
  if (window.R41) return;
  var OrigWorker = window.Worker, origCreate = URL.createObjectURL.bind(URL), origClick = HTMLAnchorElement.prototype.click;
  var origPow = Math.pow;
  var R = window.R41 = { OrigWorker: OrigWorker, workerUrls: [], posted: [], received: [], downloads: [], log: [],
    workerFault: null, blobs: new Map() };

  URL.createObjectURL = function (obj) { var u = origCreate(obj); if (obj instanceof Blob) R.blobs.set(u, obj); return u; };
  HTMLAnchorElement.prototype.click = function () {
    if (this.download && /^blob:/.test(this.href) && R.blobs.has(this.href)) {
      var name = this.download, blob = R.blobs.get(this.href);
      R.downloads.push({ name: name, type: blob.type, promise: blob.text() });
      return; /* captured; nothing is written to disk */
    }
    return origClick.call(this);
  };

  function Recording(url, opts) {
    var u = String(url);
    if (R.workerUrls.indexOf(u) < 0) R.workerUrls.push(u);
    var real;
    if (R.workerFault === 'throw-in-run') {
      real = new OrigWorker(origCreate(new Blob(['importScripts(' + JSON.stringify(u) + ');runScenario=function(){throw new Error("R41 injected Worker fault: runScenario threw")};'], { type: 'text/javascript' })), opts);
    } else if (R.workerFault === 'throw-at-load') {
      real = new OrigWorker(origCreate(new Blob(['throw new Error("R41 injected Worker fault: the script failed to load")'], { type: 'text/javascript' })), opts);
    } else {
      real = new OrigWorker(url, opts);
    }
    real.addEventListener('message', function (e) { R.received.push(e.data); });
    var post = real.postMessage.bind(real);
    real.postMessage = function (m) { R.posted.push(JSON.parse(JSON.stringify(m))); return post(m); };
    return real;
  }
  Recording.prototype = OrigWorker.prototype;

  R.setMode = function (mode) {
    if (mode === 'worker') window.Worker = Recording;
    else if (mode === 'main') window.Worker = undefined;
    else throw new Error('mode');
  };
  R.mainFault = function (on) {
    Math.pow = on ? function () { throw new Error('R41 injected main-thread fault: Math.pow threw'); } : origPow;
  };
  R.restoreAll = function () { window.Worker = OrigWorker; Math.pow = origPow; R.workerFault = null; };

  R.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  R.perf = function () { return document.getElementById('v2-performance').textContent; };
  R.status = function () { return document.getElementById('v2-status').textContent; };
  R.mode = function () { return document.querySelector('[data-compute-mode]') ? document.querySelector('[data-compute-mode]').dataset.computeMode : null; };

  /* Wait until a calculation started after `since` has finished: the performance line leaves "running". */
  R.waitDone = async function (timeoutMs) {
    var t0 = Date.now(), el = document.getElementById('v2-performance');
    await R.sleep(30);
    while (Date.now() - t0 < (timeoutMs || 180000)) {
      if (!el.classList.contains('is-running') && /complete|stopped/i.test(el.textContent)) return { perf: el.textContent, ms: Date.now() - t0 };
      await R.sleep(25);
    }
    throw new Error('R41 timeout waiting for the calculation; performance line: ' + el.textContent);
  };

  R.importPlans = async function (plans, compare) {
    var scenarios = plans.map(function (p, i) {
      var s = JSON.parse(JSON.stringify(p)); s.setupComplete = true; s.id = 'r41-' + i; s.name = s.name || ('R41 plan ' + (i + 1)); return s;
    });
    var payload = { format: 'investment-calculator-v2c', version: 2, exportedAt: '2026-09-30T00:00:00.000Z',
      app: { version: 2, edition: '2C', page: 'setup', complexity: 'standard', theme: 'auto', compare: !!compare, active: 0, scenarios: scenarios } };
    var input = document.getElementById('v2-import-settings');
    var dt = new DataTransfer();
    dt.items.add(new File([JSON.stringify(payload)], 'r41.json', { type: 'application/json' }));
    input.files = dt.files;
    var el = document.getElementById('v2-performance');
    el.textContent = 'R41 waiting'; /* so a stale "complete" from the last run cannot satisfy waitDone */
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await R.sleep(50);
    var st = R.status();
    if (/not restored|not a valid|could not be read/.test(st)) return { imported: false, status: st };
    var done = await R.waitDone();
    return { imported: true, perf: done.perf, ms: done.ms, status: R.status(), mode: R.mode() };
  };

  R.exportCsv = async function () {
    var n = R.downloads.length;
    document.getElementById('v2-export-csv').click();
    await R.sleep(20);
    if (R.downloads.length === n) return { exported: false, status: R.status() };
    var d = R.downloads[R.downloads.length - 1];
    return { exported: true, name: d.name, type: d.type, text: await d.promise, status: R.status() };
  };
  R.exportDebug = async function () {
    var n = R.downloads.length;
    document.getElementById('v2-export-debug').click();
    for (var i = 0; i < 100 && R.downloads.length === n; i++) await R.sleep(20);
    if (R.downloads.length === n) return null;
    var d = R.downloads[R.downloads.length - 1];
    return { name: d.name, text: await d.promise, status: R.status() };
  };

  R.sha = async function (s) {
    var b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  };
  R.runInWorker = function (url, plan) {
    return new Promise(function (resolve) {
      var w = new OrigWorker(url);
      w.onmessage = function (e) { w.terminate(); resolve(e.data); };
      w.onerror = function (e) { e.preventDefault(); w.terminate(); resolve({ error: 'onerror: ' + e.message }); };
      w.postMessage({ id: 0, plan: plan });
    });
  };
})();
