/* S5AA R52 (the owner's decisions of 2026-10-04 on ChatGPT's R46-R51 audit): the four rules as the prediction scans compute them, on
   the engine's own state through read-only taps (tests/lib/engine-variant.js) of the tree BEFORE the repair (2fb8c6f). Every tap only
   reads and records; whoever uses one asserts the variant's rows equal the real engine's.

   1. R47-01, one IRA-capacity ledger per owner (traditional first). Today each kind's carried excess is reduced by roomFor4973(o, k)
      on its own. R52: the traditional excess absorbs the year's unused room first (absorbedT = min(leftT, roomT)); the Roth excess is
      reduced by min(roomR, roomT - absorbedT) (roomR <= roomT always: the Roth room is the combined room capped by the Roth limit, so
      min(roomR, roomT - absorbedT) is exactly the 408A(c)(2) room once the deemed contribution counts). HSA unchanged.
      Exposed: a row in which an owner holds both carried excesses and the Roth reduction falls.
   2. R47-02, deferrals attributed to their owner. Today qbiCut = min(max(0, D - W), S) x (SE / S) x min(1, Dwp / D) over the household
      (D pre-tax deferrals incl. HSA payroll, Dwp the workplace part, W household salary, S = employment + SE streams). R52: the same
      expression per owner (that owner's deferrals, salary, streams), summed. Exposed: a row where the two differ; the tap also prices
      the row's first estimate with the R52 figure (a first-order size: the quote's withdrawals are not re-solved).
   3. R48-01, basis follows a pool-changing transfer. Exposed: a scheduled transfer between traditional IRAs in different Form 8606
      pools (iraPoolKey()) that moves value while the source pool holds basis: R52 moves basis x moved / the source pool's dated value.
   4. R50-01, the Roth conversion ledger after settlement. Exposed: a settled pool whose conversions' final nontaxable part
      (amount x the settled fraction) differs from the provisional part recorded in the Roth ledger. The tap also records every Roth
      IRA distribution (owner, year, qualified, 10% rate, and whether it reached a conversion segment), the readers of the ledger. */
'use strict';
function makeVariant(loadEngineVariant, key) {
  const G = 'globalThis.' + key, ON = G + '&&' + G + '.on';
  return loadEngineVariant([
    { id: 'path', marker: 'function simulatePlanRows(p,random,historyOffset,ltcRandom,issues,serialized,gateToken){', append: ON + '&&' + G + '.path++;' },
    // 1. the carried excess
    { id: 'x4973', marker: 'var left=Math.max(0,excess4973[o][k]-out[k]);if(left>0)left=Math.max(0,left-roomFor4973(o,k));', replace:
      'var left=Math.max(0,excess4973[o][k]-out[k]);var __l0=left,__rm=left>0?roomFor4973(o,k):0;if(left>0)left=Math.max(0,left-__rm);' +
      ON + '&&' + G + '.x4973.push({path:' + G + '.path,age:age,o:o,k:k,l0:__l0,room:__rm,carried:excess4973[o][k],out:out[k],fresh:excessNew4973[o][k]});' },
    // 2. per-owner deferrals, reset at each row
    { id: 'row', marker: 'iraBasisState.roth.yi=yi;', append: 'if(' + ON + '){' + G + '.def={self:{pre:0,wp:0},spouse:{pre:0,wp:0}};' + G + '.qbiNew=0;' + G + '.qbiOld=0}' },
    { id: 'def', marker: 'if(target.taxClass==="preTax"&&group==="workplace")workplacePreTaxDeferrals+=lawfulC-rothCatch;', append:
      'if(' + ON + '&&' + G + '.def){var __ow=target.owner==="spouse"?"spouse":"self";if((target.taxClass==="preTax"&&group==="workplace")||target.taxClass==="hsa")' + G + '.def[__ow].pre+=lawfulC-rothCatch;if(target.taxClass==="preTax"&&group==="workplace")' + G + '.def[__ow].wp+=lawfulC-rothCatch}' },
    { id: 'qbi', marker: 'qbiCut=qbiCutStreams>0&&preTaxDeferrals>0?Math.min(Math.max(0,preTaxDeferrals-wages),qbiCutStreams)*(qbiCutSe/qbiCutStreams)*Math.min(1,workplacePreTaxDeferrals/preTaxDeferrals):0;', append:
      'if(' + ON + '&&' + G + '.def){var __cut=function(o){var d=' + G + '.def[o].pre,wp=' + G + '.def[o].wp,w=o==="spouse"?spouseSalary*spouseWorkDuration:salary*selfWorkDuration,se=o==="spouse"?(other.seSpouse||0):(other.seSelf||0),st=se+(o==="spouse"?(other.wageSpouse||0):(other.wageSelf||0));return st>0&&d>0?Math.min(Math.max(0,d-w),st)*(se/st)*Math.min(1,wp/d):0};' +
      G + '.qbiNew=__cut("self")+__cut("spouse");' + G + '.qbiOld=qbiCut;if(qbiCutStreams>0&&preTaxDeferrals>0)' + G + '.qbiReach++;if(qbiCutSe>0)' + G + '.seRows++}' },
    { id: 'qbi-tax', marker: 'penaltyApplies=age<59.5&&!p.advanced.penaltyException&&!(p.advanced.rule55&&age>=55);', append:
      'if(' + ON + '&&Math.abs(' + G + '.qbiNew-' + G + '.qbiOld)>1e-9){var __t2=estimateTaxes(p,age,ordinaryIncome,gains,ss+other.ss,payrollWages,qualifiedDividends,payrollSpouseWages,other.seSelf,other.seSpouse,ordinaryDividends+(other.nii||0),capitalLossCarry,duration,void 0,' + G + '.qbiNew);' +
      G + '.qbi.push({path:' + G + '.path,age:age,old:' + G + '.qbiOld,neu:' + G + '.qbiNew,taxOld:taxes.total,taxNew:__t2.total,qbiAmount:taxes.qbi,se:(other.seSelf||0)+(other.seSpouse||0),wages:wages,def:JSON.parse(JSON.stringify(' + G + '.def))})}' },
    // 3. pool-changing transfers
    { id: 'pool', marker: 'transferMoved=moveFunds(accounts,p.advanced.transferFrom,p.advanced.transferTo,transferAmount);', append:
      'if(' + ON + '&&f&&t&&f.type==="traditionalIRA"&&t.type==="traditionalIRA"&&iraPoolKey(f)!==iraPoolKey(t)&&transferMoved>0)' + G + '.pool.push({path:' + G + '.path,age:age,from:iraPoolKey(f),to:iraPoolKey(t),moved:transferMoved,basis:form8606Basis(iraBasisState,iraPoolKey(f)),pool:datedPools[iraPoolKey(f)]});' },
    // 4. the conversion ledger
    { id: 'conv', marker: 'rothRecordConversion(iraBasisState&&iraBasisState.roth,r.destination,take-nt,nt);', append:
      'if(' + ON + '&&iraBasisState&&iraBasisState.roth&&r.destination.type==="rothIRA"&&r.source.type==="traditionalIRA")' + G + '.conv.push({path:' + G + '.path,yi:iraBasisState.roth.yi,pool:iraPoolKey(r.source),led:rothLedgerKey(r.destination),amt:take,nt:nt,via:"conversion"});' },
    { id: 'conv-transfer', marker: 'if(f.taxClass==="preTax")rothRecordConversion(iraBasisState.roth,t,transferTaxable,transferBasis);', append:
      'if(' + ON + '&&f.taxClass==="preTax"&&f.type==="traditionalIRA")' + G + '.conv.push({path:' + G + '.path,yi:iraBasisState.roth.yi,pool:iraPoolKey(f),led:rothLedgerKey(t),amt:transferMoved,nt:transferBasis,via:"transfer"});' },
    { id: 'settle', marker: 'iraSettled=true;taxesSettled=', replace:
      'if(' + ON + ')Object.keys(settledIra).forEach(function(k){var st=settledIra[k];' + G + '.settle.push({path:' + G + '.path,yi:iraBasisState.roth.yi,age:age,k:k,fraction:st.fraction,line8:st.line8})});iraSettled=true;taxesSettled=' },
    { id: 'roth-dist', marker: 'function rothIraDistribute(L,account,amount,ownerAge,rate){var o=rothLedgerKey(account),led=L[o],q=rothQualified(L,o,ownerAge),t=rothIraTake(led,amount,q,L.yi),income=0,base=0;', append:
      'if(' + ON + ')' + G + '.dist.push({path:' + G + '.path,yi:L.yi,o:o,amount:amount,q:q,rate:Number(rate)||0,pen:t.segs.reduce(function(s,x){return s+x.pen*x.amount},0)});' },
  ]);
}
function fresh(T) { Object.assign(T, { on: false, path: -1, x4973: [], qbi: [], pool: [], conv: [], settle: [], dist: [], def: null, qbiNew: 0, qbiOld: 0, qbiReach: 0, seRows: 0 }); return T; }

/* The four exposure tests over one run's taps. Each returns the exposed paths with their first exposed row. */
function exposures(T) {
  const out = { excess: [], qbi: [], pool: [], conv: [] };
  // 1
  const byRow = new Map();
  T.x4973.forEach((x) => { const k = x.path + '|' + x.age + '|' + x.o; if (!byRow.has(k)) byRow.set(k, {}); byRow.get(k)[x.k] = x; });
  for (const [, e] of byRow) {
    const t = e.trad, r = e.roth;
    if (!t || !r || !(t.l0 > 0) || !(r.l0 > 0)) continue;
    const absorbedT = Math.min(t.l0, t.room), roomR = Math.max(0, Math.min(r.room, t.room - absorbedT));
    const oldRed = Math.min(r.l0, r.room), newRed = Math.min(r.l0, roomR);
    if (newRed < oldRed - 1e-9) out.excess.push({ path: t.path, age: t.age, owner: t.o, tradLeft: t.l0, rothLeft: r.l0, roomT: t.room, roomR: r.room, rothCarriedMore: oldRed - newRed });
  }
  // 2
  T.qbi.forEach((x) => out.qbi.push({ path: x.path, age: x.age, qbiCutOld: x.old, qbiCutNew: x.neu, taxDelta: x.taxNew - x.taxOld }));
  // 3
  T.pool.forEach((x) => { if (x.basis > 1e-9) out.pool.push({ path: x.path, age: x.age, from: x.from, to: x.to, moved: x.moved, basisMoved: x.pool > 1e-9 ? x.basis * Math.min(1, x.moved / x.pool) : x.basis }); });
  // 4
  T.conv.forEach((c) => {
    const st = T.settle.find((s) => s.path === c.path && s.yi === c.yi && s.k === c.pool);
    if (!st) return;
    const delta = c.amt * st.fraction - c.nt;
    if (Math.abs(delta) > 1e-6) {
      const later = T.dist.filter((d) => d.path === c.path && d.o === c.led && d.yi >= c.yi && !d.q && d.rate > 0 && d.yi < c.yi + 5);
      out.conv.push({ path: c.path, yi: c.yi, age: st.age, pool: c.pool, owner: c.led, via: c.via, amount: c.amt, provisionalNt: c.nt, settledNt: c.amt * st.fraction,
        laterEarlyRothDraws: later.length, laterEarlyRothDrawAmount: later.reduce((s, d) => s + d.amount, 0) });
    }
  });
  return out;
}

/* The R52 validator rule (R48-01's reconciliation), mirrored from the engine's dated succession: a transfer between traditional IRAs of
   the two original owners is accepted when it falls in a row whose opening the source's original owner is dead (householdSurvivorship():
   dead once the lifespan is below the age) and the destination's original owner alive. Rows open at the start and then at whole ages of
   the primary; the transfer runs in the row with opening <= transferAge < closing (engine runTransfer(), within 0.0001). */
function r52TransferAccepted(plan) {
  const a = plan && plan.advanced, pr = plan && plan.profile, r = plan && plan.retirement;
  if (!a || a.transferOn !== true || !Array.isArray(plan.accounts) || !pr || pr.spouseOn !== true) return false;
  const from = plan.accounts.find((x) => x && x.id === a.transferFrom), to = plan.accounts.find((x) => x && x.id === a.transferTo);
  if (!from || !to || from === to || from.type !== 'traditionalIRA' || to.type !== 'traditionalIRA') return false;
  const fs = from.owner === 'spouse' ? 'spouse' : 'self', ts = to.owner === 'spouse' ? 'spouse' : 'self';
  if (fs === ts) return false;
  const start = pr.age, at = a.transferAge, first = Math.floor(start) + 1;
  const opening = at < first - 0.0001 ? start : Math.floor(at + 0.0001);
  const life = (s) => (s === 'spouse' ? r.spouseLife : r.selfLife), ageOn = (s, x) => (s === 'spouse' ? pr.spouseAge + (x - start) : x);
  const dead = (s) => Number.isFinite(life(s)) && life(s) < ageOn(s, opening);
  return dead(fs) && !dead(ts);
}
module.exports = { makeVariant, fresh, exposures, r52TransferAccepted };
