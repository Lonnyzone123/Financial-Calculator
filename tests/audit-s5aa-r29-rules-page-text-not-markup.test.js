/* S5AA R29: THE RULES PAGE WRITES RULE DATA AS TEXT, NEVER AS MARKUP (CodeQL js/xss-through-dom alerts 3-10, raised when the
 * repository went public on 2026-09-28; the owner 2026-09-28: fix them in R29).
 *
 * renderRules() and renderRulesLegacy() built the package block and each rule section by concatenating rule data into
 * innerHTML, and made a link from each source's url whatever its scheme. The data is the rules package shipped inside the
 * page, not user input, so nothing reachable was exploitable -- but a value holding markup would have been parsed as markup,
 * and a javascript: url would have become a live link. Now the labels are built as elements, every value is set as text,
 * and only an https: url becomes a link (all 11 shipped sources are https:).
 *
 * The test builds the app, puts hostile values into the embedded rules package, loads it in jsdom, and checks that they
 * render as literal text; a control holds the unmodified package to exactly the markup the old concatenation produced.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const RULES_RE = /(<script type="application\/json" id="v2b-rules-2026">)([\s\S]*?)(<\/script>)/;

function builtHtml() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r29-rules-page-'));
  const log = console.log;
  console.log = () => {};
  try { return require(path.join(ROOT, 'build.js')).build(path.join(dir, 'app.html')).output; }
  finally { console.log = log; fs.rmSync(dir, { recursive: true, force: true }); }
}
const HTML = builtHtml();
const SHIPPED = JSON.parse(HTML.match(RULES_RE)[2]);

async function load(mutate) {
  const rules = JSON.parse(JSON.stringify(SHIPPED));
  if (mutate) mutate(rules);
  const html = HTML.replace(RULES_RE, (m, open, body, close) => open + JSON.stringify(rules) + close);
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  const main = Array.from(window.document.querySelectorAll('script')).find(
    (el) => el.getAttribute('type') !== 'application/json' && el.textContent.includes('investment-calculator-v2c'));
  window.eval(main.textContent);
  await new Promise((r) => setTimeout(r, 0));
  return window;
}
const HOSTILE = '<img id="pwn" src="x" onerror="window.__pwned=1">';

test('R29: a rules package value holding markup renders as literal text in the package block -- no element is created', async () => {
  const window = await load((r) => { r.meta.packageId = HOSTILE; r.meta.effective = '<b id="bold">2026</b>'; });
  const meta = window.document.getElementById('v2-rule-meta');
  assert.equal(window.document.getElementById('pwn'), null, 'no <img> was created');
  assert.equal(window.document.getElementById('bold'), null, 'no <b> was created');
  assert.ok(meta.textContent.includes(HOSTILE), 'the value is shown as it is written: ' + meta.textContent.slice(0, 120));
  assert.equal(window.__pwned, undefined);
  assert.deepEqual(Array.from(meta.querySelectorAll('strong')).map((s) => s.textContent).slice(0, 2), ['Package:', 'Tax year:'],
    'the labels are still bold elements');
});

test('R29: a source url that is not https: makes no link; its agency and title still show as text', async () => {
  const window = await load((r) => { r.sources[0].url = 'javascript:window.__pwned=2'; r.sources[0].title = '<i id="it">t</i>'; });
  const cards = window.document.getElementById('v2-rule-sources').children;
  assert.ok(cards.length >= 11, 'every source is listed');
  assert.equal(cards[0].querySelector('a'), null, 'no link for a javascript: url');
  assert.ok(cards[0].textContent.includes(SHIPPED.sources[0].agency + ': <i id="it">t</i>'), cards[0].textContent);
  assert.equal(window.document.getElementById('it'), null);
  const others = Array.from(cards).slice(1).map((c) => c.querySelector('a'));
  assert.ok(others.every((a) => a && /^https:\/\//.test(a.href) && a.rel === 'noopener noreferrer'), 'the other sources are still links');
});

test('R29 CONTROL: the shipped package renders exactly the markup the old concatenation produced', async () => {
  const window = await load();
  const m = SHIPPED.meta;
  assert.equal(window.document.getElementById('v2-rule-meta').innerHTML,
    '<p><strong>Package:</strong> ' + m.packageId + '</p><p><strong>Tax year:</strong> ' + m.taxYear + '</p><p><strong>Effective:</strong> ' +
    m.effective + '</p><p><strong>Retrieved:</strong> ' + m.retrieved + '</p><p><strong>Stored natively:</strong> Yes, as immutable JSON</p>' +
    '<p><strong>Editable:</strong> No</p>');
  /* The sections are built by section() and table(), which already set every value as text: they hold only the elements
     those helpers create. */
  const sections = Array.from(window.document.getElementById('v2-rule-sections').children);
  assert.ok(sections.length > 0, 'CONTROL: the sections were rendered');
  const BUILT = new Set(['DETAILS', 'SUMMARY', 'P', 'H4', 'DIV', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']);
  sections.forEach((d) => {
    assert.equal(d.tagName, 'DETAILS');
    const stray = Array.from(d.querySelectorAll('*')).map((e) => e.tagName).filter((n) => !BUILT.has(n));
    assert.deepEqual(stray, [], 'only the elements section() and table() build');
  });
  const links = Array.from(window.document.getElementById('v2-rule-sources').querySelectorAll('a'));
  assert.equal(links.length, SHIPPED.sources.length, 'every shipped source (all https:) is a link');
});

test('R29 SOURCE GUARD: no innerHTML in the app shell is built from the rules package, and the uncalled legacy renderer is gone', () => {
  const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
  const assignments = shell.match(/innerHTML\s*=\s*[^;]*/g) || [];
  assert.ok(assignments.length > 20, 'CONTROL: the reader found the assignments (' + assignments.length + ')');
  assert.deepEqual(assignments.filter((a) => /RULES\b/.test(a)), [], 'rule data reaches the page as text only');
  assert.equal(/renderRulesLegacy/.test(shell), false, 'renderRulesLegacy(), which nothing called, was removed');
});
