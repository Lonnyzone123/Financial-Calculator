'use strict';
// DMC part (d): static free-variable analysis of the app's Web Worker.
// Run: node --expose-internals worker-static.js
// Builds the real single-file artifact into this folder (build.js with a scratch path), parses the app's main
// script with Node's bundled acorn, collects the IIFE-scope declarations (what the main thread sees), then for every
// function named in buildWorkerSource()'s workerFunctions list computes its free identifiers. Anything that is an
// IIFE-scope binding on the main thread but is NOT provided to the Worker (listed function, emitted constant, debt
// namespace) is reported: the Worker would throw ReferenceError when that code path runs.
const fs = require('fs');
const path = require('path');
const acorn = require('internal/deps/acorn/acorn/dist/acorn');
const TREE = path.join(__dirname, '..', '..', '..', '..', '..');
const { build } = require(path.join(TREE, 'build.js'));
const out = path.join(require('os').tmpdir(), 'sa32f-built-app.html');
const origLog = console.log; console.log = () => {};
const { output } = build(out);
console.log = origLog;

const scripts = [...output.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const main = scripts.find(s => s.includes('buildWorkerSource'));
const ast = acorn.parse(main, { ecmaVersion: 'latest', sourceType: 'script', ranges: true });
// The IIFE body
let iife = null;
(function find(n) { if (iife || !n || typeof n !== 'object') return;
  if ((n.type === 'FunctionExpression') && n.body.body.some(s => s.type === 'FunctionDeclaration' && s.id.name === 'buildWorkerSource')) { iife = n; return; }
  for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(find); else if (v && typeof v.type === 'string') find(v); } })(ast);
if (!iife) throw new Error('IIFE not found');

const top = new Map(); // name -> {kind, node}
for (const s of iife.body.body) {
  if (s.type === 'FunctionDeclaration') top.set(s.id.name, { kind: 'function', node: s });
  else if (s.type === 'VariableDeclaration') s.declarations.forEach(d => { if (d.id.type === 'Identifier') top.set(d.id.name, { kind: 'var', node: d }); });
}
// Names inside the IIFE's first var statement (root, $, RULES) are declared there too; already covered.

// workerFunctions list and the constants the worker emits, read from buildWorkerSource's own text
const bws = top.get('buildWorkerSource').node;
const bwsSrc = main.slice(bws.start, bws.end);
const listText = bwsSrc.match(/var workerFunctions=\[([^\]]*)\]/)[1];
const listed = listText.split(',').map(s => s.trim()).filter(Boolean);
const emittedConsts = [...bwsSrc.matchAll(/var ([A-Z_][A-Z0-9_]*)='\+JSON\.stringify/g)].map(m => m[1]);
// debt namespaces bound in the worker: whatever __debtModulesFactory returns
const debtNs = [...main.matchAll(/var (Debt[A-Za-z]+|MortgageVsInvesting)=__debtModules\.\1;/g)].map(m => m[1]);
const provided = new Set([...listed, ...emittedConsts, ...debtNs, '__debtModulesFactory', '__debtModules', 'self']);
// CONTROL: DROP=a,b,c removes names from what the Worker provides, to prove the analysis detects a gap.
(process.env.DROP || '').split(',').filter(Boolean).forEach(n => provided.delete(n));

// ---- free-variable analysis ----
function declaredIn(fnNode) {
  // returns the set of names declared in fnNode's own function scope (params, var, function decls, let/const at any block — conservative)
  const names = new Set();
  const addPat = (p) => { if (!p) return; switch (p.type) {
    case 'Identifier': names.add(p.name); break;
    case 'AssignmentPattern': addPat(p.left); break;
    case 'RestElement': addPat(p.argument); break;
    case 'ArrayPattern': p.elements.forEach(addPat); break;
    case 'ObjectPattern': p.properties.forEach(q => addPat(q.type === 'RestElement' ? q.argument : q.value)); break; } };
  fnNode.params.forEach(addPat);
  if (fnNode.type === 'FunctionExpression' && fnNode.id) names.add(fnNode.id.name);
  (function walk(n) { if (!n || typeof n !== 'object') return;
    if (n !== fnNode && (n.type === 'FunctionDeclaration')) { names.add(n.id.name); return; }
    if (n !== fnNode && (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression')) return;
    if (n.type === 'VariableDeclarator') addPat(n.id);
    if (n.type === 'CatchClause') addPat(n.param);
    if (n.type === 'ClassDeclaration' && n.id) names.add(n.id.name);
    for (const k in n) { if (k === 'type') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  })(fnNode.body);
  return names;
}
function freeIds(fnNode) {
  const free = new Set();
  function visit(n, scopes) {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') {
      const inner = [...scopes, declaredIn(n)];
      n.params.forEach(p => visitPattern(p, inner));
      visit(n.body, inner); return;
    }
    if (n.type === 'Identifier') { if (!scopes.some(s => s.has(n.name))) free.add(n.name); return; }
    if (n.type === 'MemberExpression') { visit(n.object, scopes); if (n.computed) visit(n.property, scopes); return; }
    if (n.type === 'Property') { if (n.computed) visit(n.key, scopes); visit(n.value, scopes); return; }
    if (n.type === 'LabeledStatement') { visit(n.body, scopes); return; }
    if (n.type === 'BreakStatement' || n.type === 'ContinueStatement') return;
    if (n.type === 'VariableDeclarator') { visitPattern(n.id, scopes); visit(n.init, scopes); return; }
    if (n.type === 'CatchClause') { const s = new Set(); if (n.param && n.param.type === 'Identifier') s.add(n.param.name); visit(n.body, [...scopes, s]); return; }
    for (const k in n) { if (k === 'type' || k === 'range') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(c => visit(c, scopes)); else if (v && typeof v.type === 'string') visit(v, scopes); }
  }
  function visitPattern(p, scopes) { if (!p) return; if (p.type === 'AssignmentPattern') visit(p.right, scopes); else if (p.type === 'ObjectPattern') p.properties.forEach(q => { if (q.computed) visit(q.key, scopes); if (q.value) visitPattern(q.value, scopes); }); else if (p.type === 'ArrayPattern') p.elements.forEach(e => visitPattern(e, scopes)); }
  visit(fnNode, []);
  return free;
}

const builtins = new Set(Object.getOwnPropertyNames(globalThis).concat(['undefined', 'NaN', 'Infinity', 'arguments', 'eval']));
const report = { listedCount: listed.length, emittedConsts, debtNs, missingListed: [], gaps: [], unknownFree: [] };
const dupTop = {};
for (const name of listed) {
  const t = top.get(name);
  if (!t || t.kind !== 'function') { report.missingListed.push(name); continue; }
  for (const id of freeIds(t.node)) {
    if (provided.has(id)) continue;
    if (top.has(id)) report.gaps.push({ fn: name, id, kind: top.get(id).kind });
    else if (!builtins.has(id)) report.unknownFree.push({ fn: name, id });
  }
}
// Also: duplicate top-level function names (a later app-shell definition would shadow the engine's in toString())
const seen = {};
for (const s of iife.body.body) if (s.type === 'FunctionDeclaration') { seen[s.id.name] = (seen[s.id.name] || 0) + 1; }
report.duplicateTopLevelFunctions = Object.keys(seen).filter(k => seen[k] > 1);
fs.writeFileSync(path.join(require('os').tmpdir(), 'sa32f-worker-static.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
console.log('WORKER-STATIC DONE: listed=' + listed.length + ' gaps=' + report.gaps.length + ' unknownFree=' + report.unknownFree.length);
