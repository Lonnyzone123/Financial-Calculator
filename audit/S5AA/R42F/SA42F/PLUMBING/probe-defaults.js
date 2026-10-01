const h=require('../harness.js');
const d=h.defaults;
for(const s of Object.keys(d)){ const v=d[s]; if(v&&typeof v==='object'&&!Array.isArray(v)){ console.log('== '+s); for(const k of Object.keys(v)){ const x=v[k]; console.log('  '+k+' = '+(Array.isArray(x)?'[array '+x.length+'] '+JSON.stringify(x).slice(0,300):JSON.stringify(x))); } } else console.log(s+' = '+JSON.stringify(v).slice(0,400)); }
