const {h,acct,plan,check,row,codes}=require('./lib.js');
const show=(label,r,n)=>{console.log('--',label,codes(r).join(' '));for(let i=1;i<=n&&i<r.rows.length;i++){const x=row(r,i);console.log(x.age,'rmd',x.rmd,'dist',x.rmdDistributed,'agi',x.agi,'pre',x.preTax)}};
function mk(o){const p=plan(o.base);Object.assign(p.employment,o.emp||{});return p}
// self 74 working salary 100k, retire 76.5; 401k contributing
let p=plan({age:74,endAge:78,retireAge:76.5,accounts:[acct('k','traditional401k',500000,{contribution:1000})]});
p.employment.salary=100000;p.employment.contributionStop=76.5;
show('self works to 76.5',check(p),4);
// spouse works, self retired: spouse 74 retireAge?  retireAge is shared: self 60 retired? retireAge single value
p=plan({age:74,endAge:77,spouseOn:true,spouseAge:74,retireAge:76,accounts:[acct('k','traditional401k',500000,{owner:'spouse',contribution:1000})]});
p.employment.spouseSalary=80000;p.employment.salary=0;p.employment.contributionStop=76;
show('spouse works (shared retireAge 76), self salary 0',check(p),3);
// self dies at 74.5 while working (still-working), spouse 70 survivor
p=plan({age:74,endAge:78,spouseOn:true,spouseAge:70,retireAge:80,accounts:[acct('k','traditional401k',500000,{contribution:1000})]});
p.employment.salary=100000;p.employment.contributionStop=80;p.retirement.selfLife=74.5;
show('self dies 74.5 while working; spouse 70',check(p),4);
