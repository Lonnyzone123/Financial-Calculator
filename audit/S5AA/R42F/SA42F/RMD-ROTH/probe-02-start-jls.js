const {h,acct,plan,check,row,codes}=require('./lib.js');
const show=(label,r,n)=>{console.log('--',label);for(let i=1;i<=n&&i<r.rows.length;i++){const x=row(r,i);console.log(x.age,'rmd',x.rmd,'dist',x.rmdDistributed,'unmet',x.rmdUnmet,'agi',x.agi,'pre',x.preTax)}};
// start age: 66 -> born 1960 -> 75
show('age66 single',check(plan({age:66,endAge:77,accounts:[acct('ira','traditionalIRA',100000)]})),11);
show('age70 single (b1956 ->73)',check(plan({age:70,endAge:76,accounts:[acct('ira','traditionalIRA',100000)]})),6);
// JLS owner 75 spouse 64 : 590-B 25.3
show('jls 75/64',check(plan({age:75,endAge:77,spouseOn:true,spouseAge:64,accounts:[acct('ira','traditionalIRA',100000)]})),2);
show('jls 75/64 spouse not sole',check(plan({age:75,endAge:76,spouseOn:true,spouseAge:64,accounts:[acct('ira','traditionalIRA',100000,{spouseSoleBeneficiary:false})]})),1);
// spouse-owned IRA, spouse 75, self 60 -> JLS for spouse
show('spouse owner 75, self 60',check(plan({age:60,endAge:62,spouseOn:true,spouseAge:75,accounts:[acct('ira','traditionalIRA',100000,{owner:'spouse'})]})),2);
// 401k JLS too
show('401k 80/65',check(plan({age:80,endAge:81,spouseOn:true,spouseAge:65,accounts:[acct('k','traditional401k',100000)]})),1);
const j=h.RULES.retirement.rmd.jointLastSurvivor.rows; console.log('table 75/64',j['75'][64],'80/65',j['80'][65],'85/70',j['85'][70],'90/60',j['90'][60],'73/62',j['73'][62],'100/80',j['100'][80]);
