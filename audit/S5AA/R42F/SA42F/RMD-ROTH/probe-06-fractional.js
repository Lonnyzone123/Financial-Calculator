const {h,acct,plan,check,row,codes}=require('./lib.js');
const show=(label,r,n)=>{console.log('--',label,codes(r).join(' '));for(let i=1;i<=n&&i<r.rows.length;i++){const x=row(r,i);console.log(x.age,'rmd',x.rmd,'dist',x.rmdDistributed,'agi',x.agi,'pre',x.preTax)}};
for(const [s,sp] of [[70.6,72.2],[70.2,72.6],[70,72.5],[70.5,72]]){
 const p=plan({age:s,endAge:74,spouseOn:true,spouseAge:sp,accounts:[acct('ira','traditionalIRA',100000,{owner:'spouse'})]});
 show(`self ${s} spouse ${sp} (spouse b${2026-Math.floor(sp)})`,check(p),5);
}
// partial last row
let p=plan({age:75,endAge:76.5,accounts:[acct('ira','traditionalIRA',100000)]});show('partial last row',check(p),2);
// QCD fractional start: 70.8 eligible? opening 70.8>=70.5
p=plan({age:70.8,endAge:72,qcd:20000,accounts:[acct('ira','traditionalIRA',100000)]});show('qcd 70.8 start',check(p),2);
p=plan({age:70.2,endAge:72,qcd:20000,accounts:[acct('ira','traditionalIRA',100000)]});show('qcd 70.2 start',check(p),2);
