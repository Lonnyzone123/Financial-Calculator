/* S5AA R41: the same 200,000 inputs through Math.log, Math.cos, Math.exp, Math.pow, Math.sqrt; one hash per function.
   Runs unchanged in Node and in the page (r41MathProbe()). Inputs from a fixed 32-bit LCG, so both see the same bits. */
function r41MathProbe() {
  var s = 12345;
  function u() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }
  var fns = { log: function (x) { return Math.log(x); }, cos: function (x) { return Math.cos(2 * Math.PI * x); },
    exp: function (x) { return Math.exp(x * 0.2 - 0.1); }, pow: function (x) { return Math.pow(1 + x * 0.1, 1 + x * 40); },
    sqrt: function (x) { return Math.sqrt(-2 * Math.log(x)); } };
  var inputs = []; for (var i = 0; i < 200000; i++) inputs.push(u());
  var out = {};
  Object.keys(fns).forEach(function (k) {
    var h = 2166136261, buf = new Float64Array(1), b = new Uint8Array(buf.buffer);
    for (var j = 0; j < inputs.length; j++) { buf[0] = fns[k](inputs[j]); for (var q = 0; q < 8; q++) { h ^= b[q]; h = Math.imul(h, 16777619) >>> 0; } }
    out[k] = h.toString(16);
  });
  return out;
}
if (typeof module !== 'undefined') module.exports = r41MathProbe;
