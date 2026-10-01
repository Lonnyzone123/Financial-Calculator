const {h,acct,plan,check,row,codes}=require('./lib.js');
// single 75, $100k IRA: expect 100000/24.6
let p=plan({age:75,endAge:77,accounts:[acct('ira','traditionalIRA',100000)]});
let r=check(p);
console.log(Object.keys(r.rows[1]).join(','));
console.log(row(r,1),row(r,2));console.log(codes(r));
console.log(Object.keys(r));
