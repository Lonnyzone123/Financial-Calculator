// S5AA R51: compares the reviewed input fingerprints of two corpus specs (tools/corpus-invariant.js format). Usage: node r51_pin_diff.js <committed spec> <candidate spec>
const fs=require('fs');const [a,b]=process.argv.slice(2).map(f=>JSON.parse(fs.readFileSync(f,'utf8')));
const m=new Map(a.scenarios.map(s=>[s.name,s.inputFingerprint]));let moved=[],same=0,nofp=0;
for(const s of b.scenarios){if(s.inputFingerprint===undefined){nofp++;continue}if(JSON.stringify(m.get(s.name))!==JSON.stringify(s.inputFingerprint))moved.push(s.name);else same++}
console.log('scenarios '+b.scenarios.length+'; fingerprint moved '+moved.length+'; same '+same+'; unpinned (skipped) '+nofp);moved.forEach(n=>console.log('  '+n));
