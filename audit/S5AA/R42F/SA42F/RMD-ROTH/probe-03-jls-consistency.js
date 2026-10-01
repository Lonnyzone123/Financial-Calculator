const h=require('../harness.js');const j=h.RULES.retirement.rmd.jointLastSurvivor.rows,u=h.RULES.retirement.rmd.uniformLifetime;
let bad=[];
for(const a of Object.keys(j).map(Number)){const row=j[a];
 if(row.length!==a-10) bad.push(['len',a,row.length]);
 for(let s=1;s<row.length;s++) if(!(row[s]<=row[s-1])) bad.push(['mono-spouse',a,s]);
 if(j[a-1]) for(let s=0;s<j[a-1].length;s++) if(!(row[s]<=j[a-1][s])) bad.push(['mono-owner',a,s,row[s],j[a-1][s]]);
 const edge=row[a-11]; if(u[a]!==undefined && !(edge>=u[a])) bad.push(['vsULT(a)',a,edge,u[a]]);
 if(u[a-1]!==undefined && !(edge<=u[a-1])) bad.push(['vsULT(a-1)',a,edge,u[a-1]]);
}
console.log('rows',Object.keys(j).length,'violations',bad.length,JSON.stringify(bad.slice(0,20)));
