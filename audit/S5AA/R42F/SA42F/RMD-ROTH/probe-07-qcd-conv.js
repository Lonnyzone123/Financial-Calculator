const {h,acct,plan,check,row,codes}=require('./lib.js');
const show=(label,r,n)=>{console.log('--',label,codes(r).join(' '));for(let i=1;i<=n&&i<r.rows.length;i++){const x=row(r,i);console.log(JSON.stringify(x))}};
let p=plan({age:75,endAge:76,qcd:10000,conversionOn:true,conversionAmount:50000,accounts:[acct('ira','traditionalIRA',200000),acct('roth','rothIRA',0)]});
show('A 75 ira200k conv50k qcd10k',check(p),1);
p=plan({age:75,endAge:76,qcd:10000,conversionOn:true,conversionAmount:1e6,accounts:[acct('ira','traditionalIRA',200000),acct('roth','rothIRA',0)]});
show('B conv max qcd10k',check(p),1);
// spouse both eligible, request 150k, self 1.4M spouse 100k
p=plan({age:75,endAge:76,spouseOn:true,spouseAge:72,qcd:150000,accounts:[acct('ira','traditionalIRA',1400000),acct('ira2','traditionalIRA',100000,{owner:'spouse'})]});
show('C split request 150k',check(p),1);
// QCD with 401k only -> none
p=plan({age:75,endAge:76,qcd:10000,accounts:[acct('k','traditional401k',200000)]});
show('D 401k only qcd',check(p),1);
// spouse 70.5+ only
p=plan({age:65,endAge:66,spouseOn:true,spouseAge:71,qcd:10000,accounts:[acct('ira2','traditionalIRA',100000,{owner:'spouse'}),acct('ira','traditionalIRA',100000)]});
show('E spouse 71 eligible only, self 65 ira',check(p),1);
