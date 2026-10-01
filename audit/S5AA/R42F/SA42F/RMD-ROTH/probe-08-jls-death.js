const {h,acct,plan,check,row,codes}=require('./lib.js');
const j=h.RULES.retirement.rmd.jointLastSurvivor.rows,u=h.RULES.retirement.rmd.uniformLifetime;
const show=(label,r,n)=>{console.log('--',label,codes(r).join(' '));for(let i=1;i<=n&&i<r.rows.length;i++){const x=row(r,i);console.log(x.age,'rmd',x.rmd,'pre',x.preTax)}};
let p=plan({age:75,endAge:78,spouseOn:true,spouseAge:63,accounts:[acct('ira','traditionalIRA',100000)]});p.retirement.spouseLife=63.5;
show('owner 75 spouse 63 dies 63.5',check(p),3);
console.log('hand row76',(100000/j[75][63]).toFixed(2),'row77',((100000-100000/j[75][63])/u[76]).toFixed(2));
// self (owner) dies 75.5, spouse 63 survivor (b1963 start 75) -> next row spouse owns, reached 64 -> none
p=plan({age:75,endAge:78,spouseOn:true,spouseAge:63,accounts:[acct('ira','traditionalIRA',100000)]});p.retirement.selfLife=75.5;
show('owner 75 dies 75.5, spouse 63',check(p),3);
