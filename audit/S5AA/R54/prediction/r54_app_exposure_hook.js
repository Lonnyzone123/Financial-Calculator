/* S5AA R54 prediction (C6): which APP routes in the tests are exposed to R54's two rules. Loaded with NODE_OPTIONS=--require into each
   test process (runner: r54_run_app_exposure.js). It wraps jsdom's JSDOM so every app page a test builds carries read-only taps:
   - read: each readStatic() call logs every plan leaf it changed, read after its save() (which re-adds seven retirement keys from the form) (before -> after) and the form inputs whose value differs from what
     writeStatic() last put there (the fields edited since the plan was written to the form). A leaf changed with no edit of its field
     is a restored value readStatic() transformed (R54 item 2); a retirement or end age changed when only another age field was edited
     is a dependent clamp (R54 item 1).
   - blur: the number-input blur handler changing a value (a clamp or a rounding on leaving a field);
   - endcap: normalizedPlan() capping an end age above 100.
   The taps only read; a tap that throws logs nothing. Each record names the test file and the page (a counter per process).
   Usage: NODE_OPTIONS="--require <this file>" R54_EXPOSURE_OUT=<out.jsonl> node --test <files> */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const OUT = process.env.R54_EXPOSURE_OUT;
const jsdom = require(require.resolve('jsdom', { paths: [process.env.R54_TREE || process.cwd()] }));
const Original = jsdom.JSDOM;
let page = 0;
const file = path.basename(process.argv[1] || '');

const HELPERS = 'window.__r54shown=function(){var o={};document.querySelectorAll("input[id^=\\"v2-\\"],select[id^=\\"v2-\\"]").forEach(function(e){o[e.id]=e.type==="checkbox"?e.checked:e.value});return o};' +
  'window.__r54leaves=function(o,pre,out){if(o===null||typeof o!=="object"){out[pre]=o;return out}if(Array.isArray(o)){o.forEach(function(v,i){window.__r54leaves(v,pre+"["+i+"]",out)});return out}Object.keys(o).forEach(function(k){window.__r54leaves(o[k],pre?pre+"."+k:k,out)});return out};' +
  'window.__r54log=function(kind,data){try{if(window.__r54sink)window.__r54sink(JSON.stringify(Object.assign({kind:kind},data)))}catch(e){}};' +
  'window.__r54read=function(before,after){try{var a=window.__r54leaves(before,"",{}),b=window.__r54leaves(after,"",{}),diffs=[];Object.keys(a).concat(Object.keys(b).filter(function(k){return !(k in a)})).forEach(function(k){if(JSON.stringify(a[k])!==JSON.stringify(b[k]))diffs.push([k,a[k]===undefined?"(absent)":a[k],b[k]===undefined?"(absent)":b[k]])});var s=window.__r54snapShown||{},now=window.__r54shown(),edited=Object.keys(now).filter(function(id){return id in s&&s[id]!==now[id]});if(diffs.length)window.__r54log("read",{diffs:diffs,edited:edited})}catch(e){}};';

const TAPS = [
  // the helpers, defined inside the app's own script so they exist however the test runs it
  ['function readStatic(){var p=plan(),', HELPERS + 'function readStatic(){var __r54b=JSON.parse(JSON.stringify(plan()));var p=plan(),'],
  ['a.legacy=Math.max(0,num("v2-legacy",0));save()}', 'a.legacy=Math.max(0,num("v2-legacy",0));save();window.__r54read(__r54b,plan())}'],
  ['/* S5AA R53 */recordLoaded(p);', '/* S5AA R53 */recordLoaded(p);try{window.__r54snapShown=window.__r54shown()}catch(e){}'],
  ['if(this.value!==before){this.dispatchEvent', 'if(this.value!==before){window.__r54log&&window.__r54log("blur",{id:this.id,before:before,after:this.value,kept:!!this._v2Loaded});this.dispatchEvent'],
  ['p.profile.endAge=Math.min(100,p.profile.endAge);', 'if(p.profile&&p.profile.endAge>100&&window.__r54log)window.__r54log("endcap",{endAge:p.profile.endAge});p.profile.endAge=Math.min(100,p.profile.endAge);'],
];

function tap(html) {
  if (typeof html !== 'string' || html.indexOf('function readStatic(){') === -1) return { html, tapped: false };
  let out = html, missing = [];
  for (const [from, to] of TAPS) { if (out.indexOf(from) === -1) missing.push(from.slice(0, 40)); else out = out.split(from).join(to); }
  return { html: out, tapped: true, missing };
}
function sink(id) {
  return (text) => { if (OUT) fs.appendFileSync(OUT, JSON.stringify(Object.assign({ file, page: id }, JSON.parse(text))) + '\n'); };
}
class Tapped extends Original {
  constructor(html, options) {
    const t = tap(html);
    const id = t.tapped ? ++page : 0;
    const opts = Object.assign({}, options || {});
    if (t.tapped) {
      const prior = opts.beforeParse;
      opts.beforeParse = (window) => { window.__r54sink = sink(id); if (prior) prior(window); };
      if (OUT) fs.appendFileSync(OUT, JSON.stringify({ file, page: id, kind: 'page', missingTaps: t.missing }) + '\n');
    }
    super(t.html, opts);
  }
}
jsdom.JSDOM = Tapped;
