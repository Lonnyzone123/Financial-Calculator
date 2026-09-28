#!/usr/bin/env node
'use strict';
/*
 * S5AA PC (the move to this repository): compare the private source with this copy, file by file.
 *
 *   node audit/S5AA/PC/pc_compare.js <source repo dir> <source ref> <copy repo dir> <copy ref> --name <replaced name>
 *
 * The replaced name is an argument so that it never appears in this repository. The owner's cover note, sent outside
 * the repository, gives it.
 *
 * For each path it reports one of:
 *   only in source   left out of the copy
 *   only in copy     added by the copy
 *   unchanged        identical bytes
 *   name only        identical once the name and "the owner" (with its article, any case) are read as one placeholder
 *   OTHER            anything else, with the number of lines that still differ after that normalisation
 * Reads git objects only (git show <ref>:<path>), never a working tree, so line-ending settings cannot change a result.
 */
const { execFileSync } = require('node:child_process');

const args = process.argv.slice(2);
const nameAt = args.indexOf('--name');
if (nameAt < 0 || !args[nameAt + 1] || args.length !== 6) {
  console.error('usage: pc_compare.js <source dir> <source ref> <copy dir> <copy ref> --name <replaced name>');
  process.exit(2);
}
const name = args[nameAt + 1];
const [srcDir, srcRef, cpyDir, cpyRef] = args.filter((_, i) => i !== nameAt && i !== nameAt + 1);
const git = (dir, a) => execFileSync('git', ['-C', dir, ...a], { maxBuffer: 1 << 30 });
const list = (dir, ref) => git(dir, ['ls-tree', '-r', '-z', '--name-only', ref]).toString('utf8').split('\0').filter(Boolean);
const blob = (dir, ref, p) => git(dir, ['show', ref + ':' + p]);

const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NAME = new RegExp('\\b(?:' + esc + '|' + esc.toUpperCase() + ')\\b', 'g');
const norm = (s) => s.replace(NAME, '@').replace(/THE OWNER/g, '@')
  .replace(/\b(?:[Tt]he|[Aa]n?) owner\b/g, '@').replace(/\bOwner\b/g, '@').replace(/\bowner\b/g, '@')
  .replace(/\b(?:[Tt]he|[Aa]n?) @/g, '@');

/* Lines of b not matched in a, and of a not in b, by longest common subsequence (both counted). */
function differingLines(a, b) {
  const x = a.split('\n'), y = b.split('\n');
  let i = 0; while (i < x.length && i < y.length && x[i] === y[i]) i++;
  let j = 0; while (j < x.length - i && j < y.length - i && x[x.length - 1 - j] === y[y.length - 1 - j]) j++;
  const xs = x.slice(i, x.length - j), ys = y.slice(i, y.length - j);
  if (xs.length * ys.length > 4e7) return xs.length + ys.length; // too large to align: an upper bound
  const prev = new Array(ys.length + 1).fill(0);
  for (let p = 1; p <= xs.length; p++) {
    let diag = 0;
    for (let q = 1; q <= ys.length; q++) {
      const t = prev[q];
      prev[q] = xs[p - 1] === ys[q - 1] ? diag + 1 : Math.max(prev[q], prev[q - 1]);
      diag = t;
    }
  }
  return xs.length + ys.length - 2 * prev[ys.length];
}

const src = new Set(list(srcDir, srcRef)), cpy = new Set(list(cpyDir, cpyRef));
const out = { 'only in source': [], 'only in copy': [], unchanged: [], 'name only': [], OTHER: [] };
for (const p of [...new Set([...src, ...cpy])].sort()) {
  if (!cpy.has(p)) { out['only in source'].push(p); continue; }
  if (!src.has(p)) { out['only in copy'].push(p); continue; }
  const a = blob(srcDir, srcRef, p), b = blob(cpyDir, cpyRef, p);
  if (a.equals(b)) { out.unchanged.push(p); continue; }
  const na = norm(a.toString('utf8')), nb = norm(b.toString('utf8'));
  if (na === nb) out['name only'].push(p);
  else out.OTHER.push(p + '  (' + differingLines(na, nb) + ' lines differ after normalising)');
}
const top = (p) => (p.includes('/') ? p.split('/')[0] + '/' : '(root)');
const byTop = (ps) => Object.entries(ps.reduce((m, p) => ((m[top(p)] = (m[top(p)] || 0) + 1), m), {})).map(([k, v]) => v + ' ' + k).join(', ');
console.log('source ' + srcRef + ': ' + src.size + ' files; copy ' + cpyRef + ': ' + cpy.size + ' files');
console.log('only in source: ' + out['only in source'].length + ' (' + byTop(out['only in source']) + ')');
console.log('only in copy:   ' + out['only in copy'].length + ': ' + out['only in copy'].join(', '));
console.log('unchanged:      ' + out.unchanged.length);
console.log('name only:      ' + out['name only'].length);
console.log('OTHER:          ' + out.OTHER.length);
out.OTHER.forEach((l) => console.log('  ' + l));
if (process.env.PC_LIST) for (const k of Object.keys(out)) out[k].forEach((p) => console.log(k + '\t' + p));
