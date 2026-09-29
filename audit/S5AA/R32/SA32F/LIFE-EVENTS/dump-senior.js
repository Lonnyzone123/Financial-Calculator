const L = require('./lib.js'); const R = L.h.RULES.federal;
console.log(Object.keys(R).join(','));
console.log(JSON.stringify(R.standardDeduction), JSON.stringify(R.additionalStandardDeduction||R.additional||'').slice(0,600));
console.log(JSON.stringify(R.seniorDeduction||'').slice(0,500));
