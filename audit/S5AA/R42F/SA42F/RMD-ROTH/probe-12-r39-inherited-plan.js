const {h,acct,plan,check,row,codes}=require('./lib.js');
const p=plan({age:70,endAge:73,spouseOn:true,spouseAge:76,retireAge:80,accounts:[acct('k','traditional401k',100000,{contribution:1000}),acct('k2','traditional401k',100000,{owner:'spouse',contribution:1000})]});
p.employment.salary=60000;p.employment.spouseSalary=50000;p.employment.contributionStop=80;p.retirement.selfLife=70.5;
const r=check(p);console.log(codes(r));for(let i=1;i<r.rows.length;i++)console.log(JSON.stringify(row(r,i)));
console.log('hand row 72 (spouse reaches 77, inherited plan balance after row 71): RMD = balance/22.9');
