const {h,acct,plan,check,row,codes}=require('./lib.js');
const show=(label,r,n)=>{console.log('--',label,codes(r).join(' '));for(let i=1;i<=n&&i<r.rows.length;i++){const x=row(r,i);console.log(x.age,'rmd',x.rmd,'dist',x.rmdDistributed,'agi',x.agi,'tax',x.taxes,'pre',x.preTax)}};
for(const life of [73.5,73,74.5,120]){
 const p=plan({age:72,endAge:76,spouseOn:true,spouseAge:65,accounts:[acct('ira','traditionalIRA',500000)]});
 p.retirement.selfLife=life;
 show('self 72 (b1954, start 73), selfLife '+life+', spouse 65',check(p),4);
}
