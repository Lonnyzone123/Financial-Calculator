'use strict';
// DMC part (b): stableStringify / fastHash / hashValue / generateScenarioId stability. Run: node hash-probe.js
const h = require('../harness.js'); const E = h.engine;
// Independent cyrb53 (bryc's published algorithm, seed 0), written here, returning the same hex form
function cyrb53(str) { let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16); }
const samples = ['', 'a', 'The quick brown fox', JSON.stringify(h.defaults), 'é中😀'];
const cyrbAgree = samples.every(s => E.fastHash(s) === cyrb53(s));
const p = structuredClone(h.defaults);
const rev = v => Array.isArray(v) ? v.map(rev) : (v && typeof v === "object") ? Object.fromEntries(Object.keys(v).reverse().map(k => [k, rev(v[k])])) : v; const reordered = rev(p);
const withUndef = structuredClone(p); withUndef.profile.extra = undefined;
const cyc = { a: 1 }; cyc.self = cyc;
const shared = { x: 1 }; const twoRefs = { a: shared, b: shared };
const ids = new Set(); for (let i = 0; i < 2000; i++) ids.add(E.generateScenarioId());
console.log(JSON.stringify({
  cyrb53MatchesReference: cyrbAgree,
  deterministic: E.hashValue(p) === E.hashValue(structuredClone(p)),
  keyOrderIndependent: E.hashValue(p) === E.hashValue(reordered),
  undefinedKeyChangesHash: E.hashValue(p) !== E.hashValue(withUndef),
  undefinedKeySurvivesJsonRoundTrip: E.hashValue(JSON.parse(JSON.stringify(withUndef))) === E.hashValue(withUndef),
  cycleText: E.stableStringify(cyc), sharedRefText: E.stableStringify(twoRefs),
  nanEqualsNull: E.hashValue({ v: NaN }) === E.hashValue({ v: null }), negZeroEqualsZero: E.hashValue({ v: -0 }) === E.hashValue({ v: 0 }),
  scenarioIdsUnique: ids.size === 2000, scenarioIdSample: E.generateScenarioId() }));
console.log('HASH-PROBE DONE');
