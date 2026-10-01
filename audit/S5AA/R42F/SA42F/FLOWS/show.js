// node show.js <needle> [before] [after] [occurrence] [file]  -- print context around the n-th occurrence of needle
const fs = require('fs');
const [needle, before = 800, after = 800, occ = 1, file = 'src/engine.js'] = process.argv.slice(2);
const TREE = require('path').join(__dirname, '..', '..', '..', '..', '..');
const s = fs.readFileSync(TREE + '/' + file, 'utf8');
let i = -1;
for (let k = 0; k < Number(occ); k++) { i = s.indexOf(needle, i + 1); if (i < 0) { console.log('not found'); process.exit(0); } }
console.log(s.slice(Math.max(0, i - Number(before)), i + Number(after)));
