// node rowdiff.js head.json base.json name...  -- first differing row, fields, lifetime taxes, final total
const [h,b,...names]=process.argv.slice(2);const A=require(h),B=require(b);
const E=(s,n)=>(s.entries||s.scenarios||[]).find(e=>e.name===n);
for(const n of names){const x=E(A,n),y=E(B,n);if(!x||!y){console.log(n,'missing');continue}const rx=x.result.rows||[],ry=y.result.rows||[];let first=null;const fields=new Set();
 for(let i=0;i<Math.max(rx.length,ry.length);i++){const p=rx[i]||{},q=ry[i]||{};for(const k of new Set([...Object.keys(p),...Object.keys(q)])){if(JSON.stringify(p[k])!==JSON.stringify(q[k])){fields.add(k);if(first===null)first=i}}}
 const last=(r)=>r.length?r[r.length-1].total:null;
 console.log(n,'| first row',first,first!==null?'age '+(rx[first]||{}).age:'','| fields',[...fields].slice(0,10).join(','),'| lifetimeTaxes',y.result.lifetimeTaxes,'->',x.result.lifetimeTaxes,'(',(x.result.lifetimeTaxes-y.result.lifetimeTaxes).toFixed(2),') | final total',last(ry),'->',last(rx),'(',(last(rx)-last(ry)).toFixed(2),')');}
