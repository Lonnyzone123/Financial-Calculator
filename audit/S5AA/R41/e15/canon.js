/* S5AA R41 (task 6.5): one canonical serialization for a raw result, used unchanged by Node and by the browser page.
   It keeps what JSON loses and structured clone keeps: -0, NaN, +/-Infinity, undefined and array holes. Object keys
   are sorted, so the comparison is of values, not of insertion order (insertion order is reported separately). */
function r41Canon(v) {
  if (v === undefined) return 'u';
  if (v === null) return 'n';
  var t = typeof v;
  if (t === 'number') {
    if (Object.is(v, -0)) return '-0';
    if (Number.isNaN(v)) return 'NaN';
    if (v === Infinity) return 'Inf';
    if (v === -Infinity) return '-Inf';
    return String(v);
  }
  if (t === 'string') return JSON.stringify(v);
  if (t === 'boolean') return v ? 'T' : 'F';
  if (t === 'bigint') return v.toString() + 'n';
  if (t === 'function') return 'fn';
  if (Array.isArray(v)) {
    var out = [];
    for (var i = 0; i < v.length; i++) out.push(i in v ? r41Canon(v[i]) : 'hole');
    return '[' + out.join(',') + ']';
  }
  var tag = Object.prototype.toString.call(v);
  if (tag !== '[object Object]') return tag;
  var keys = Object.keys(v).sort();
  return '{' + keys.map(function (k) { return JSON.stringify(k) + ':' + r41Canon(v[k]); }).join(',') + '}';
}
/* The insertion order of every object's keys, depth first, so a reordering is visible even though the values agree. */
function r41KeyOrder(v) {
  if (v === null || typeof v !== 'object') return '';
  if (Array.isArray(v)) return '[' + v.map(r41KeyOrder).join(',') + ']';
  return '{' + Object.keys(v).map(function (k) { return k + r41KeyOrder(v[k]); }).join(',') + '}';
}
if (typeof module !== 'undefined' && module.exports) module.exports = { r41Canon: r41Canon, r41KeyOrder: r41KeyOrder };
/* identity.runId is fastHash(Date.now() + Math.random() + ...) (src/engine.js:5095): the one field documented as free to
   differ across the Worker boundary (tools/capture-baseline.js:115-118). It is masked, and its presence is recorded, so
   the hash compares everything else. Nothing else is masked. */
function r41Mask(res) {
  if (!res || typeof res !== 'object' || !res.identity || typeof res.identity !== 'object') return { masked: res, runId: 'absent' };
  var copy = Object.assign({}, res), id = Object.assign({}, res.identity);
  var kind = typeof id.runId === 'string' && id.runId.length ? 'string' : 'unexpected:' + typeof id.runId;
  id.runId = '<runId>'; copy.identity = id;
  return { masked: copy, runId: kind };
}
if (typeof module !== 'undefined' && module.exports) module.exports.r41Mask = r41Mask;
