'use strict';
/*
 * Calculation engine extracted from investment-calculator-v2c.html Phase 2
 * (see MERGE_AUDIT_AND_PLAN.md). This is exactly the function/constant set
 * the app's own buildWorkerSource() already serializes for its Web Worker --
 * i.e. code the app itself already proved is DOM-free, just physically
 * relocated here verbatim (no behavior change). build.js inlines this file's
 * body back into investment-calculator-v2c.html at the ENGINE_SOURCE marker
 * in src/app-shell.html to produce the shipped single-file release.
 *
 * Also usable directly from Node (see the module.exports at the bottom) for
 * unit/fixture testing without needing a DOM at all.
 */

/* Q2 (A), decided by the owner on 2026-09-16 (S5 task 6.10): the result-contract version this engine produces. Version 3 adds
   the named income measures to result rows (tools/result-contract.json); a capture records this number, and the
   contract checker validates a result under the version that produced it. */
var RESULT_CONTRACT_VERSION=5;/* S5AA R19 round, workstream A: version 5 adds the tax ledger's row fields (taxSettled, taxTrueUpPaid, taxOutstanding), lifetime tax as the settled sum, and net worth net of the outstanding true-up (tools/result-contract.json). *//* R12 round (R11-02, the owner: bump to version 4): version 4 is the version in which decision 8's last-death cut is a required rule of the result contract (tools/result-contract.json). No row field changes. */
var ACCOUNT_TYPES={taxable:{label:"Taxable brokerage",taxClass:"taxable",limitGroup:null},traditionalIRA:{label:"Traditional IRA",taxClass:"preTax",limitGroup:"ira"},rothIRA:{label:"Roth IRA",taxClass:"roth",limitGroup:"ira"},traditional401k:{label:"Traditional 401(k)",taxClass:"preTax",limitGroup:"workplace"},roth401k:{label:"Roth 401(k)",taxClass:"roth",limitGroup:"workplace"},hsa:{label:"Health Savings Account",taxClass:"hsa",limitGroup:"hsa"},customTaxable:{label:"Custom taxable account",taxClass:"taxable",limitGroup:null},customTraditional:{label:"Custom tax-deferred account",taxClass:"preTax",limitGroup:null},customRoth:{label:"Custom tax-free account",taxClass:"roth",limitGroup:null}};
var HIST_RETURNS=[[1928,.4381],[1929,-.0830],[1930,-.2512],[1931,-.4384],[1932,-.0864],[1933,.4998],[1934,-.0119],[1935,.4674],[1936,.3194],[1937,-.3534],[1938,.2928],[1939,-.0110],[1940,-.1067],[1941,-.1277],[1942,.1917],[1943,.2506],[1944,.1903],[1945,.3582],[1946,-.0843],[1947,.0520],[1948,.0570],[1949,.1830],[1950,.3081],[1951,.2368],[1952,.1815],[1953,-.0121],[1954,.5256],[1955,.3260],[1956,.0744],[1957,-.1046],[1958,.4372],[1959,.1206],[1960,.0034],[1961,.2664],[1962,-.0881],[1963,.2261],[1964,.1642],[1965,.1240],[1966,-.0997],[1967,.2380],[1968,.1081],[1969,-.0824],[1970,.0356],[1971,.1422],[1972,.1876],[1973,-.1431],[1974,-.2590],[1975,.3700],[1976,.2383],[1977,-.0698],[1978,.0651],[1979,.1852],[1980,.3174],[1981,-.0470],[1982,.2042],[1983,.2234],[1984,.0615],[1985,.3124],[1986,.1849],[1987,.0581],[1988,.1654],[1989,.3148],[1990,-.0306],[1991,.3023],[1992,.0749],[1993,.0997],[1994,.0133],[1995,.3720],[1996,.2268],[1997,.3310],[1998,.2834],[1999,.2089],[2000,-.0903],[2001,-.1185],[2002,-.2197],[2003,.2836],[2004,.1074],[2005,.0483],[2006,.1561],[2007,.0548],[2008,-.3655],[2009,.2594],[2010,.1482],[2011,.0210],[2012,.1589],[2013,.3215],[2014,.1352],[2015,.0138],[2016,.1177],[2017,.2161],[2018,-.0423],[2019,.3121],[2020,.1802],[2021,.2847],[2022,-.1804],[2023,.2606],[2024,.2488],[2025,.1772]];
var HIST_INFLATION=[[1928,-.0116],[1929,.0058],[1930,-.0640],[1931,-.0932],[1932,-.1027],[1933,.0076],[1934,.0152],[1935,.0299],[1936,.0145],[1937,.0286],[1938,-.0278],[1939,0],[1940,.0071],[1941,.0993],[1942,.0903],[1943,.0296],[1944,.0230],[1945,.0225],[1946,.1813],[1947,.0884],[1948,.0299],[1949,-.0207],[1950,.0593],[1951,.0600],[1952,.0075],[1953,.0075],[1954,-.0074],[1955,.0037],[1956,.0299],[1957,.0290],[1958,.0176],[1959,.0173],[1960,.0136],[1961,.0067],[1962,.0133],[1963,.0164],[1964,.0097],[1965,.0192],[1966,.0346],[1967,.0304],[1968,.0472],[1969,.0620],[1970,.0557],[1971,.0327],[1972,.0341],[1973,.0871],[1974,.1234],[1975,.0694],[1976,.0486],[1977,.0670],[1978,.0902],[1979,.1329],[1980,.1252],[1981,.0892],[1982,.0383],[1983,.0379],[1984,.0395],[1985,.0380],[1986,.0110],[1987,.0443],[1988,.0442],[1989,.0465],[1990,.0611],[1991,.0306],[1992,.0290],[1993,.0275],[1994,.0267],[1995,.0254],[1996,.0332],[1997,.0170],[1998,.0161],[1999,.0268],[2000,.0339],[2001,.0155],[2002,.0238],[2003,.0188],[2004,.0326],[2005,.0342],[2006,.0254],[2007,.0408],[2008,.0009],[2009,.0272],[2010,.0150],[2011,.0296],[2012,.0174],[2013,.0150],[2014,.0076],[2015,.0073],[2016,.0207],[2017,.0211],[2018,.0191],[2019,.0229],[2020,.0136],[2021,.0704],[2022,.0645],[2023,.0335],[2024,.0289],[2025,.0274]];
var HIST_COLA={1975:.08,1976:.064,1977:.059,1978:.065,1979:.099,1980:.143,1981:.112,1982:.074,1983:.035,1984:.035,1985:.031,1986:.013,1987:.042,1988:.04,1989:.047,1990:.054,1991:.037,1992:.03,1993:.026,1994:.028,1995:.026,1996:.029,1997:.021,1998:.013,1999:.025,2000:.035,2001:.026,2002:.014,2003:.021,2004:.027,2005:.041,2006:.033,2007:.023,2008:.058,2009:0,2010:0,2011:.036,2012:.017,2013:.015,2014:.017,2015:0,2016:.003,2017:.02,2018:.028,2019:.016,2020:.013,2021:.059,2022:.087,2023:.032,2024:.025,2025:.028};
function clone(o){return JSON.parse(JSON.stringify(o))}
function money(v){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Math.round(Number(v)||0))}
function clamp(v,a,b){return Math.min(b,Math.max(a,v))}
function sum(a,fn){return a.reduce(function(t,x){return t+(fn?fn(x):x)},0)}
function taxClassBalance(accounts,c){return sum(accounts,function(a){return a.taxClass===c?a.balance:0})}
function totalBalance(accounts){return sum(accounts,function(a){return a.balance})}
function accountType(type){return ACCOUNT_TYPES[type]||ACCOUNT_TYPES.customTaxable}
function debtTotal(p){return sum((p.advanced.debts||[]),function(x){return Math.max(0,Number(x.balance)||0)})}
function accountPlannedContribution(a,salary,age,p){var amount=a.contributionMode==="salaryPct"?salary*a.contribution/100:a.contribution,elapsed=Math.max(0,age-p.profile.age),periods=a.changeTiming==="period"?Math.floor(elapsed*Math.max(1,a.frequency)):Math.floor(elapsed);if(a.annualChangeMode==="percent")amount*=Math.pow(Math.max(0,1+a.annualChange/100),periods);else amount+=a.annualChange*periods;/* S5AA R33 (the owner 2026-09-29, with decision 5a): a change on a spouse's account is dated on the SPOUSE's age; a joint account follows the self. */var changeAge=a&&a.owner==="spouse"&&p&&p.profile&&p.profile.spouseOn?Number(p.profile.spouseAge)+(age-p.profile.age):age;(a.futureChanges||[]).slice().sort(function(x,y){return x.age-y.age}).forEach(function(c){if(changeAge>=c.age){if(c.mode==="set")amount=c.value;else if(c.mode==="percent")amount*=1+c.value/100;else amount+=c.value}});return Math.max(0,amount)}
function contributionLimit(group,age,filing){if(group==="ira")return RULES.retirement.ira.combinedLimit+(age>=RULES.retirement.ira.catchupAge?RULES.retirement.ira.catchup:0);if(group==="workplace")return RULES.retirement.workplace.employeeDeferral+(RULES.retirement.workplace.enhancedCatchupAges.indexOf(Math.floor(age))>=0?RULES.retirement.workplace.enhancedCatchup:age>=RULES.retirement.workplace.catchupAge?RULES.retirement.workplace.catchup:0);if(group==="hsa")return (filing==="mfj"?RULES.retirement.hsa.family:RULES.retirement.hsa.self)+(age>=RULES.retirement.hsa.catchupAge?RULES.retirement.hsa.catchup:0);return Infinity}
/* R6 EXTERNAL AUDIT, EA-03: THE ROW'S FILING STATUS. This read the ENTERED status, so a survivor stayed on the joint
   phase-out for the rest of the plan -- MEASURED at 5c985c0, a survivor earning $170,000 kept contributing $7,500 a year
   where a single filer was allowed $0. `age` is the row's opening age and the status is householdFilingFor()'s, so this
   computes no death of its own: joint in the year of death, single from the year after. With no age that reader finds
   nobody dead, which is the entered plan's own answer. THE SALARIES ARE THE ROW'S: the loop passes each person's salary
   for the row, which since Q3 is $0 once their work duration has ended at retirement or death, so a dead spouse's
   entered salary never reaches this proxy and no second survivorship reading is needed for it. */
/* S5AA R33 (SA32F-28, SA32F-29): THE ROTH IRA LIMIT, as Publication 590-A Worksheet 2-2 figures it: the 219 limit (with
   catch-up) reduced over the Roth range with the $10 rounding and the $200 minimum (408A(c)(3)(A), applying 219(g)(2)(B)-(C)).
   The caller also holds it to the limit less the year's other IRA contributions (408A(c)(2); Worksheet 2-2 line 11, "the
   lesser of line 8 or line 10"). MAGI is the declared salary proxy rothPhaseoutFactor() uses. */
function rothContributionLimit(p,a,salary,spouseSalary,age,limit){if(!a||a.type!=="rothIRA")return Math.max(0,Number(limit)||0);var filing=householdFilingFor(p,age)==="mfj"?"mfj":"single",range=filingEntry(RULES.retirement.ira.rothPhaseout,filing),rothContributionMagi=salary+(p.profile.spouseOn?spouseSalary:0);return iraPhaseoutLimit(limit,rothContributionMagi,range,RULES.retirement.ira.deductionPhaseout.minimumAllowance)}
function rothPhaseoutFactor(p,a,salary,spouseSalary,age){if(a.type!=="rothIRA")return 1;var filing=householdFilingFor(p,age)==="mfj"?"mfj":"single",range=filingEntry(RULES.retirement.ira.rothPhaseout,filing),rothContributionMagi=salary+(p.profile.spouseOn?spouseSalary:0);if(rothContributionMagi<=range[0])return 1;if(rothContributionMagi>=range[1])return 0;return (range[1]-rothContributionMagi)/(range[1]-range[0])}
/* SA-05 fix (SPRINT_EXTERNAL_AUDIT_20260909.md): ONE definition of owner
   contribution eligibility, shared by simulatePlan() and by the UI consumers
   that render contribution warnings.

   R2-T04 gave auditContributions() an optional `ownerEligible` argument that
   defaults to "both eligible" so existing callers keep working -- but that
   default IS the pre-R2-T04 behaviour, and the two UI callers kept omitting
   it. The engine deposited the corrected $8,750 and reported no warning while
   the account summary still said "1 warning", quoting the very limit
   violation R2-T04 removed. Independent recomputation with omitted arguments
   had already drifted from the engine, so the calculation is now shared
   rather than duplicated.

   This reproduces the engine's existing owner work proxy and shared stop
   clock EXACTLY, including the established convention that
   employment.contributionStop is measured against the SELF's age for both
   owners. No new regulatory eligibility rule is introduced. `duration`
   defaults to one year for point-in-time UI callers; because the result is a
   pair of booleans, any positive duration yields the same answer. */
/* THE ONE DEFINITION OF HOW LONG EACH PERSON WORKS IN A SPAN. A wage ends at retirement or at the
   earner's death, whichever comes first, on the earner's own clock (Q3, the owner 2026-09-21). The S5AA
   third audit found this rule written TWICE -- here and in the projection loop -- and Q3 had changed
   only the loop's copy. This one decides eligibility BEFORE a shared limit is split between the
   spouses (the effective-eligibility repair below), so a dead spouse still counted as eligible took part of the HSA family limit,
   contributed nothing with it, and left the survivor capped: $3,750 of a $5,000 request inside an
   $8,750 limit, the rest pushed to the taxable account. Both now read this. A lifespan that is not a
   finite number ends nothing. */
function householdWorkDurations(p,age,spouseAge,span){
  var r=p.retirement||{},
      selfLifeLeft=Number.isFinite(Number(r.selfLife))?Number(r.selfLife)-age:Infinity,
      spouseLifeLeft=Number.isFinite(Number(r.spouseLife))?Number(r.spouseLife)-spouseAge:Infinity;
  return {
    self:Math.max(0,Math.min(span,p.profile.retireAge-age,selfLifeLeft)),
    spouse:p.profile.spouseOn?Math.max(0,Math.min(span,p.profile.retireAge-spouseAge,spouseLifeLeft)):0
  };
}
/* S5AA R33 (SA32F-12, decision 5a; SA32F-15, decision 5c). THE CONTRIBUTION WINDOW, PER OWNER. "Contributions stop at age" is read on each owner's
   OWN age, as the wages it stops already are (householdWorkDurations()); it was read on the self's age for both, so a younger working
   spouse lost every deferral once the self passed it. AN IRA also has a spousal window: on a joint return an owner who is not working can
   still contribute while the other spouse works (IRC 219(c): the joint return's compensation; the age bar is repealed, 219(d)(1)), up to
   that owner's own stop age and while that owner is alive. The dollars are held to the joint compensation in auditContributions() (R26).
   ownerContributionWindow() returns the durations the row credits over and the IRA flags; ownerContributionEligibility() keeps the
   {self, spouse} booleans every other caller reads. */
function ownerContributionWindow(p,age,spouseAge,duration){
  var span=duration===undefined?1:duration,
      work=householdWorkDurations(p,age,spouseAge,span),
      r=p.retirement||{},
      stop=Number(p.employment.contributionStop),
      alive=function(life,at){return Math.max(0,Math.min(span,Number.isFinite(Number(life))?Number(life)-at:Infinity))},
      self=Math.max(0,Math.min(stop-age,work.self)),
      spouse=Math.max(0,Math.min(stop-spouseAge,work.spouse)),
      joint=!!(p.profile&&p.profile.spouseOn)&&householdFilingFor(p,age)==="mfj",
      selfIra=self>0?self:joint?Math.max(0,Math.min(stop-age,work.spouse,alive(r.selfLife,age))):0,
      spouseIra=spouse>0?spouse:joint?Math.max(0,Math.min(stop-spouseAge,work.self,alive(r.spouseLife,spouseAge))):0;
  return {self:self>0,spouse:spouse>0,selfIra:selfIra>0,spouseIra:spouseIra>0,durations:{self:self,spouse:spouse,selfIra:selfIra,spouseIra:spouseIra}};
}
function ownerContributionEligibility(p,age,spouseAge,duration){var w=ownerContributionWindow(p,age,spouseAge,duration);return {self:w.self,spouse:w.spouse}}
/* R2-005 fix (R2-T04): `ownerEligible` applies effective owner eligibility
   BEFORE the shared HSA family base is allocated.

   simulatePlan() has always dropped zero-duration items -- accounts whose
   owner is no longer inside the work window -- but it did so AFTER this
   allocation had already run. An inactive owner therefore consumed shared
   room they could never use, and the active owner was squeezed out of room
   they were entitled to AND charged the difference as excess, which
   `redirect` policy then diverted into taxable savings. The audit's trace:
   a retired spouse took the whole $8,750 family base and deposited nothing,
   while the working self deposited $1,000 instead of $8,750.

   Workplace and IRA limits are keyed per owner (group+":"+owner), so this
   only ever bit the HSA family base -- the one genuinely shared pool.

   The argument is optional and defaults to "both eligible", so every
   existing caller and direct test is unaffected. Eligibility is NOT a
   limit, so `warn` policy does not waive it: an ineligible owner deposits
   nothing under every limit policy, and audit.items must say so. No new
   HSA or Medicare eligibility law is introduced -- this is exactly the
   simplified owner work-window proxy simulatePlan() already used, computed
   once and applied consistently to contribution, match, deduction and
   redirect. */
/* S5 task 11 (the owner's question 6, answer A; ACCOUNT_RULES_ENGINE_REFERENCE_2026.md section 7.4): the high-earner Roth
   catch-up rule as four separate facts and a wage threshold, never one Boolean. Catch-up contributions to a 401(k),
   403(b) or governmental 457(b) must be designated Roth when the employee's prior-calendar-year FICA wages from the
   employer sponsoring that plan exceed the threshold. Wages from other employers and household income do not count,
   so the account carries its own `priorYearFicaWages`; an account without it cannot be tested. The engine holds only
   401(k) account types, so 403(b) and governmental 457(b) plans are entered as 401(k)s. */
function rothCatchupStatus(a){var records=RULES.retirement.workplace.rothCatchup.records,fact=function(id){return records.filter(function(r){return r.provision_id===id})[0].value},threshold=fact("prior_year_fica_wage_threshold"),effective=fact("roth_catchup_statutory_effective"),workplace=accountType(a&&a.type).limitGroup==="workplace",wages=a&&typeof a.priorYearFicaWages==="number"&&isFinite(a.priorYearFicaWages)?a.priorYearFicaWages:null;return {catchupRothRuleStatutorilyEffective:effective,administrativeTransitionReliefActive:fact("administrative_transition_relief_active"),finalRegulationsMandatorilyApplicable:fact("final_regulation_mandatory_applicability"),reasonableGoodFaithOperation:fact("reasonable_good_faith_operation_allowed"),wageThreshold:threshold,appliesToAccount:workplace,priorYearFicaWages:wages,wagesMissing:workplace&&wages===null,required:workplace&&effective===true&&wages!==null&&wages>threshold}}
/* S5AA R26 (the owner 2026-09-26: enforce the IRA compensation limit). IRS Publication 590-A: an IRA contribution "can't be more
   than ... your taxable compensation for the year" -- W-2 box 1 wages (which exclude elective deferrals) and self-employment
   earnings, not pensions, interest or dividends; on a joint return the spouses' combined contributions are limited by
   their combined compensation. The dollar limits below were the only limits, so a person with no salary could contribute:
   4 of r16's members did, and a traditional IRA deduction with no salary behind it ended a valid plan in
   TAX_SETTLEMENT_MISMATCH (R25, SA25-10). An owner's compensation for the year opening at `age` is the salary passed in plus
   employment and self-employment other income over [age, age + 1); auditContributions() subtracts the owner's pre-tax
   workplace and HSA contributions. Self-employment profit is counted whole: the deductible half of SE tax is not
   subtracted, which overstates that compensation by at most about 7%. */
/* S5AA R28 (R26-01, the owner 2026-09-26: "Repair"): the limit compares DOLLARS WITH DOLLARS. R26 compared the annual contribution
   rate with the salary rate plus the other income actually received, and the row then multiplied what was allowed by the
   contribution duration, so a wage stream ending inside the year was prorated twice ($6,000/yr to 40.5 allowed $1,500 of an
   IRA where its $3,000 allows $3,000). `span`, from the simulation row, gives the row's length, each owner's work duration
   and each owner's contribution duration: compensation is the salary over the work duration plus the other income received
   over the row, and `selfDuration`/`spouseDuration` let auditContributions() turn a capped dollar amount back into the rate
   the row credits once. Without `span` (a direct caller) every duration is one year, as before. */
function ownerCompensation(p,age,salary,spouseSalary,inflationFactor,startHistoryIndex,span){var s=span||{},num=function(k,d){return Number.isFinite(Number(s[k]))?Number(s[k]):d},len=num("duration",1),o=p&&p.retirement&&Array.isArray(p.retirement.otherIncomes)&&p.retirement.otherIncomes.length?otherIncomeFor(p,age,age+len,Number.isFinite(Number(inflationFactor))?Number(inflationFactor):1,startHistoryIndex||0):{};return {self:Math.max(0,(Number(salary)||0)*num("selfWork",len)+(o.wageSelf||0)+(o.seSelf||0)),spouse:Math.max(0,(Number(spouseSalary)||0)*num("spouseWork",len)+(o.wageSpouse||0)+(o.seSpouse||0)),selfDuration:num("selfContribution",len),spouseDuration:num("spouseContribution",len),selfIraDuration:num("selfIraContribution",num("selfContribution",len)),spouseIraDuration:num("spouseIraContribution",num("spouseContribution",len)),rowDuration:len}}
/* S5AA R32 (raised in ChatGPT's R30A account audit; the owner 2026-09-28: "Use the year-end age"): A CATCH-UP READS THE AGE REACHED BY
   THE YEAR'S CLOSE. IRC 219(b)(5)(B) ("attained the age of 50 before the close of the taxable year"), 414(v)(5)(A) ("would attain
   age 50 by the end of the taxable year"), 414(v)(2)(B)(i) (60 "but would not attain age 64 before the close") and 223(b)(3)(A)
   (55 "before the close of the taxable year"). The owner's age at the row's OPENING was tested, so the row an owner turned 50, 55
   or 60 in was denied the catch-up and the row they turned 64 in still had the 60-63 amount. The model has no calendar; each row
   is a tax year, and its close is the opening age plus the row's length (compensation.rowDuration; a caller that gives none is
   read as a whole year). Only the catch-up tests read it. */
function auditContributions(p,age,salary,spouseSalary,ownerEligible,compensation,oneTime){var rowSpan=compensation&&Number.isFinite(Number(compensation.rowDuration))?Math.max(0,Number(compensation.rowDuration)):1,used={},usedRoth={},hsaBaseUsed=0,hsaCatchUsed={self:0,spouse:0},warnings=[],items=[],hsaBase=p.profile.filing==="mfj"?RULES.retirement.hsa.family:RULES.retirement.hsa.self;p.accounts.slice().sort(function(a,b){return a.priority-b.priority}).forEach(function(a){var catchUpShare=0,owner=a.owner==="spouse"?"spouse":"self",ownerSalary=owner==="spouse"?spouseSalary:salary,ownerAge=owner==="spouse"?p.profile.spouseAge+(age-p.profile.age):age,requested=accountPlannedContribution(a,ownerSalary,age,p),group=accountType(a.type).limitGroup,allowed=requested,eligibleKey=group==="ira"&&ownerEligible&&ownerEligible[owner+"Ira"]!==undefined?owner+"Ira":owner;if(ownerEligible&&ownerEligible[eligibleKey]===false){items.push({account:a,requested:requested,allowed:0,lawful:0,excess:0});return}if(group==="hsa"){var baseRoom=Math.max(0,hsaBase-hsaBaseUsed),catchLimit=ownerAge+rowSpan>=RULES.retirement.hsa.catchupAge?RULES.retirement.hsa.catchup:0,catchRoom=Math.max(0,catchLimit-hsaCatchUsed[owner]),basePart=Math.min(requested,baseRoom),catchPart=Math.min(Math.max(0,requested-basePart),catchRoom);allowed=basePart+catchPart;hsaBaseUsed+=basePart;hsaCatchUsed[owner]+=catchPart}else if(group){var key=group+":"+owner,limit=contributionLimit(group,ownerAge+rowSpan,p.profile.filing);var rothRoom=Infinity;if(a.type==="rothIRA"){var rothLimit=rothContributionLimit(p,a,salary,spouseSalary,age,limit);rothRoom=rothLimit-(usedRoth[key]||0);if(rothLimit<limit)warnings.push(a.name+" Roth IRA limit is reduced using salary as a MAGI proxy.")}allowed=Math.max(0,Math.min(requested,limit-(used[key]||0),rothRoom));used[key]=(used[key]||0)+allowed;if(a.type==="rothIRA")usedRoth[key]=(usedRoth[key]||0)+allowed;/* S5AA task 3.3 (Q95, F9): the ONE definition of this account's share of the catch-up room, and it is now
   computed for EVERY workplace account rather than only inside the pre-tax Roth warning below. Two callers
   need it and they must not drift apart: the Roth warning (S5 task 11, ACCOUNT section 7.4), and the
   section 415(c) room, because IRC 414(v)(3)(A)(ii) DISREGARDS a catch-up contribution for 415(c). The
   room used to subtract the whole deferral, so a 55-year-old deferring 24,500 plus an 8,000 catch-up was
   given 39,500 of employer room where the statute leaves 47,500, and a 61-year-old with the 11,250
   enhanced catch-up was given 36,250. Computing it here rather than at the 415(c) line also fixes the
   ROTH case for free: a Roth 401(k) catch-up is still a catch-up and 414(v)(3) does not ask about its tax
   character, but the old placement inside `taxClass!=="roth"` could never have seen it.
   The share is measured against the RUNNING total across accounts, not this account alone, so two
   workplace accounts cannot each claim the catch-up room.
   S5 task 11: a Roth account's catch-up is Roth already. The engine still models a pre-tax catch-up as
   pre-tax, so that case warns. */
if(group==="workplace"){var deferralBase=RULES.retirement.workplace.employeeDeferral;catchUpShare=Math.max(0,used[key]-deferralBase)-Math.max(0,used[key]-allowed-deferralBase);if(a.taxClass!=="roth"&&catchUpShare>.01){var rc=rothCatchupStatus(a);if(rc.required)warnings.push(a.name+": catch-up contributions must be designated Roth, because prior-year FICA wages from this employer ("+money(rc.priorYearFicaWages)+") exceed "+money(rc.wageThreshold)+". The plan models them as pre-tax, which overstates the deduction.");else if(rc.wagesMissing)warnings.push(a.name+": enter prior-year FICA wages from this employer. Above "+money(rc.wageThreshold)+" its catch-up contributions must be Roth, and without the figure that rule cannot be applied.");}}}if(group&&requested>allowed+.01)warnings.push(a.name+" exceeds the applicable 2026 "+group+" limit by "+money(requested-allowed));items.push({account:a,requested:requested,allowed:p.limitPolicy==="warn"?requested:allowed,/* S5AA R33 (SA32F-31): what the law lets this item exclude or deduct; "warn" keeps the requested deposit, never the exclusion (IRC 402(g)(1)(A), 219(b), 223(b)). */lawful:allowed,excess:Math.max(0,requested-allowed),hsaBasePart:group==="hsa"?basePart:0,hsaCatchPart:group==="hsa"?catchPart:0,/* Q95: the statutory catch-up share, taken from the limit-respecting `allowed` even under the "warn"
     policy -- a household cannot have more catch-up room than the statute grants, whatever it asks for. */catchUp:catchUpShare})});/* R26: the compensation cap, once every item is known (a workplace deferral reduces compensation wherever it sits in the
   priority order). The excess is recorded as the dollar-limit excess is, so the plan's limitPolicy decides where it goes. */
var comp=compensation||ownerCompensation(p,age,salary,spouseSalary,1,0),dur={self:Number.isFinite(Number(comp.selfDuration))?Math.max(0,Number(comp.selfDuration)):1,spouse:Number.isFinite(Number(comp.spouseDuration))?Math.max(0,Number(comp.spouseDuration)):1},room={self:Math.max(0,Number(comp.self)||0),spouse:Math.max(0,Number(comp.spouse)||0)},iraDur={self:Number.isFinite(Number(comp.selfIraDuration))?Math.max(0,Number(comp.selfIraDuration)):dur.self,spouse:Number.isFinite(Number(comp.spouseIraDuration))?Math.max(0,Number(comp.spouseIraDuration)):dur.spouse};/* S5AA R33 (SA32F-30): AN ELECTIVE DEFERRAL CANNOT EXCEED THE PARTICIPANT'S OWN COMPENSATION. IRC 415(c)(1)(B) caps annual additions at "100 percent of the
   participant's compensation", and 415(c)(3)(D) counts the deferrals themselves in it, so the cap is the owner's whole pay for the row (wages, employment streams
   and self-employment earnings). A spouse's pay does not fund the other spouse's 401(k); only the IRA has a spousal rule (219(c)). Workplace items are taken in
   priority order against a running total per owner; the excess is recorded as a limit excess is, and the policy decides where it goes. */
var ownPay={self:room.self,spouse:room.spouse};items.forEach(function(it){if(accountType(it.account.type).limitGroup!=="workplace")return;var o=it.account.owner==="spouse"?"spouse":"self";if(!(dur[o]>0))return;var flowing=it.lawful*dur[o],capped=Math.max(0,Math.min(flowing,ownPay[o]));ownPay[o]-=capped;if(flowing-capped>.01){it.excess=(it.excess||0)+(flowing-capped)/dur[o];it.lawful=capped/dur[o];if(p.limitPolicy!=="warn")it.allowed=it.lawful;warnings.push(it.account.name+" exceeds its owner's own compensation by "+money(flowing-capped)+": an elective deferral cannot exceed the participant's compensation (IRC 415(c)(1)(B)).")}});
items.forEach(function(it){var g=accountType(it.account.type).limitGroup,o=it.account.owner==="spouse"?"spouse":"self";if(it.account.taxClass==="hsa"||(g==="workplace"&&it.account.taxClass==="preTax"))room[o]=Math.max(0,room[o]-it.lawful*dur[o])});var joint=p.profile.filing==="mfj"&&!!p.profile.spouseOn,shared=room.self+room.spouse;items.forEach(function(it){if(accountType(it.account.type).limitGroup!=="ira")return;var o=it.account.owner==="spouse"?"spouse":"self";if(!(iraDur[o]>0))return;/* R28: the dollars this IRA is credited in the row, against the dollars of compensation left; the capped dollars go back to a rate over the same duration. */var flowing=it.lawful*iraDur[o],capped=Math.max(0,Math.min(flowing,joint?shared:room[o]));if(joint)shared-=capped;else room[o]-=capped;if(flowing-capped>.01){it.excess=(it.excess||0)+(flowing-capped)/iraDur[o];it.lawful=capped/iraDur[o];if(p.limitPolicy!=="warn")it.allowed=it.lawful;warnings.push(it.account.name+" exceeds the IRA compensation limit by "+money(flowing-capped)+": an IRA contribution cannot exceed the owner's taxable compensation (wages and self-employment earnings; on a joint return, the couple's combined).")}});
/* S5AA R29 (PCF-02, ChatGPT's PCF full-model audit; the owner 2026-09-28: "As a contribution"): A ONE-TIME CONTRIBUTION -- a transfer
   into an IRA or an HSA from a different kind of account -- is held to the room the year's planned contributions LEAVE, in dollars:
   the dollar limit (with catch-up, and the Roth phase-out factor), less what the planned items credit over their durations; for an
   IRA, also the compensation left after them (R26/R28), shared on a joint return; for an HSA, the household base limit and the
   owner's own catch-up. The planned items' work proxy (ownerEligible: contributions flow while the owner works) does not apply:
   an IRA's own limit is compensation, measured above, and an HSA's is coverage, which the engine does not model. It returns what
   fits and the excess; the caller decides, by the limit policy, whether the excess moves. */
var once=null;if(oneTime&&oneTime.account&&Number(oneTime.amount)>0){var oa=oneTime.account,og=accountType(oa.type).limitGroup,oo=oa.owner==="spouse"?"spouse":"self",oAge=oo==="spouse"?p.profile.spouseAge+(age-p.profile.age):age,ownerOf=function(it){return it.account.owner==="spouse"?"spouse":"self"},fits=0;{if(og==="hsa"){var baseLeft=Math.max(0,hsaBase-items.reduce(function(s,it){return s+(it.hsaBasePart||0)*dur[ownerOf(it)]},0)),catchLeft=Math.max(0,(oAge+rowSpan>=RULES.retirement.hsa.catchupAge?RULES.retirement.hsa.catchup:0)-items.reduce(function(s,it){return s+(ownerOf(it)===oo?(it.hsaCatchPart||0)*dur[oo]:0)},0));fits=baseLeft+catchLeft}else if(og==="ira"){var oLimit=contributionLimit("ira",oAge+rowSpan,p.profile.filing),iraIn=function(rothOnly){return items.reduce(function(s,it){return s+(accountType(it.account.type).limitGroup==="ira"&&ownerOf(it)===oo&&(!rothOnly||it.account.type==="rothIRA")?it.allowed*iraDur[oo]:0)},0)};var dollarLeft=Math.max(0,oLimit-iraIn(false));if(oa.type==="rothIRA")dollarLeft=Math.max(0,Math.min(dollarLeft,rothContributionLimit(p,oa,salary,spouseSalary,age,oLimit)-iraIn(true)));fits=Math.min(dollarLeft,Math.max(0,joint?shared:room[oo]))}}var askedOnce=Number(oneTime.amount);once={allowed:Math.min(askedOnce,fits),excess:Math.max(0,askedOnce-fits),group:og}}
return {items:items,warnings:Array.from(new Set(warnings)),oneTime:once}}
/* Q68: the filing-status tables are parsed JSON, so each inherits
   Object.prototype, and a bracket read by a prototype name returned an
   inherited member. For "constructor" that is the Object function: truthy, so
   no ||...single fallback applied, and marginalTax() walked it as a bracket
   list and threw, where an unknown string such as "xx" failed later as a
   controlled calculation error. Decided 2026-09-14 (the owner), answer (c): every
   filing-table read goes through this own-key read, so every unknown value
   takes that one path; the input gate also refuses a present filing status
   the tables do not define. */
function filingEntry(table,filing){return Object.prototype.hasOwnProperty.call(table,filing)?table[filing]:undefined}
function marginalTax(income,filing){var brackets=filingEntry(RULES.federal.ordinaryBrackets,filing)||RULES.federal.ordinaryBrackets.single,previous=0,tax=0;for(var i=0;i<brackets.length;i++){var cap=brackets[i][0]===null?Infinity:brackets[i][0],portion=Math.max(0,Math.min(income,cap)-previous);tax+=portion*brackets[i][1];if(income<=cap)break;previous=cap}return tax}
function capitalGainsTax(gains,ordinaryTaxable,filing){if(gains<=0)return 0;var brackets=filingEntry(RULES.federal.capitalGains,filing)||RULES.federal.capitalGains.single,remaining=gains,tax=0,stack=ordinaryTaxable;for(var i=0;i<brackets.length&&remaining>0;i++){var cap=brackets[i][0]===null?Infinity:brackets[i][0],room=Math.max(0,cap-stack),amount=Math.min(remaining,room);tax+=amount*brackets[i][1];remaining-=amount;stack+=amount}return tax}
function marginalRateAt(income,filing){var brackets=filingEntry(RULES.federal.ordinaryBrackets,filing)||RULES.federal.ordinaryBrackets.single;for(var i=0;i<brackets.length;i++){var cap=brackets[i][0]===null?Infinity:brackets[i][0];if(income<=cap)return brackets[i][1]}return brackets[brackets.length-1][1]}
function capitalGainsMarginalRateAt(stackPosition,filing){var brackets=filingEntry(RULES.federal.capitalGains,filing)||RULES.federal.capitalGains.single;for(var i=0;i<brackets.length;i++){var cap=brackets[i][0]===null?Infinity:brackets[i][0];if(stackPosition<=cap)return brackets[i][1]}return brackets[brackets.length-1][1]}
/* Audit finding AUD-001 (RETIREMENT_ENGINE_AUDIT_CLAUDE_QUEUE_2026-09-08.md,
 * task T02): mirrors withdrawFromClass()'s own filter+sort exactly, so the
 * "next account" this identifies is guaranteed to be the same account
 * withdrawFromClass() will actually drain first for this taxClass. */
/* Q22 (found 2026-09-11 by adversarially inspecting the re-audit): where a
   retained cash holding sits in its tax class's spending order.

   THE DEFECT. retainExcessRmdCash() creates the holding with
   `priority: max(existing) + 1` -- a line written to give a synthesized
   account a unique sort key, which silently became a spending policy: last.
   So the engine sold assets earning the market return while a zero-return,
   100%-basis holding sat untouched, forgoing the return AND realising capital
   gains that spending the cash would not have realised (30,000.00 per 50,000
   drawn, on the measured repro). Dominated on both axes, compounding every
   period.

   USER DECISION 2026-09-11: spend the cash first, changeable by preset.
   `advanced.retainedCashOrder` is 'first' (default) or 'last'; only the exact
   string 'last' selects the buffer behaviour, so a malformed import gets the
   safe default rather than the defect. Households wanting a preserved buffer
   have `advanced.reserveOn`/`reserveYears` for that intent as well.

   WHY THIS IS A SHARED COMPARATOR. Three sites duplicated the same sort by
   hand: orderedAccountsInClass() (what quoteTaxFunding QUOTES against),
   nextWithdrawAccount(), and withdrawFromClass() (what actually SELLS). The
   old comment on the first claimed the quote order was "guaranteed identical"
   to the withdrawal order -- guaranteed by three copies staying in step.
   Applying a new ordering rule to two of three would make the tax quote price
   a different sale than the one executed: the R2-001 defect class this
   codebase has already been bitten by. Cash position is the PRIMARY key, so
   it holds under both optimized and priority ordering; within a group the
   previous ordering is untouched. */
function retainedCashFirst(p){return !(p&&p.advanced&&p.advanced.retainedCashOrder==="last")}
/* Q99 (G5): THE QUALIFIED-MEDICAL SHARE OF AN HSA DISTRIBUTION, stated once.

   Before this, an HSA draw was tax-free at every age for every purpose: withdrawFromClass()
   recognised gains for `taxable` and a penalty for `preTax` and let `hsa` fall through both, the
   quote priced it {rIncome:0,rGains:0}, and the row added a draw to ordinaryWithdrawal only when the
   class was `preTax`. That models an HSA as a Roth account that also escaped the contribution's
   income tax -- right for a qualified medical distribution and wrong for any other.

   IRC 223(f)(2): an amount not used exclusively for the beneficiary's qualified medical expenses is
   included in THAT BENEFICIARY'S gross income. 223(f)(4)(A): the tax is increased by 20 percent OF
   THE AMOUNT SO INCLUDIBLE -- not of the distribution, so a 60% qualified $10,000 draw carries $800
   and not $2,000. 223(f)(4)(C): the increase stops once the beneficiary attains the age in section
   1811 of the Social Security Act. Both figures are rule records, checked against the statute before
   they were coded.

   ABSENT MEANS 100. A share is an ASSUMPTION about qualifying expenses, not proof they exist, and an
   account that states none is assumed fully qualified -- which is exactly the behaviour every
   scenario saved before this change already had, so none of them moves. A non-finite value falls back
   to the same default rather than inventing a charge; the validator reports it by path.

   PER ACCOUNT, AND THE AGE IS THE OWNER'S. The income and the additional tax are the account
   beneficiary's, so the share belongs to one account and the age test to that account's owner. A
   66-year-old does not exempt their 50-year-old spouse's HSA. */
function hsaQualifiedShare(account){
  var v=account?account.qualifiedMedicalPct:undefined;
  if(v===undefined||v===null)return 100;
  v=Number(v);
  if(!isFinite(v))return 100;
  return clamp(v,0,100);
}
function hsaIncludibleShare(account){return 1-hsaQualifiedShare(account)/100}
/* Q99: the owner's own age, built the way auditContributions() already builds it -- the spouse's age
   at the plan's start plus the elapsed years -- so one definition of "how old is this account's
   owner now" serves the contribution side and the distribution side. S5AA R20 (R18F-02, ChatGPT's R18
   full-model audit; the owner, 2026-09-23): renamed from hsaAccountOwnerAge, because the 10% early-distribution
   tax and the Rule of 55 now read it too, for every account. After a death the working copy's owner is
   the survivor (Q4), so this reads the survivor's age from the row after the death. */
function accountOwnerAge(p,age,account){
  if(!account||account.owner!=="spouse")return age;
  var profile=(p&&p.profile)||{};
  return Number(profile.spouseAge)+(age-Number(profile.age));
}
function hsaNonQualifiedRecord(id){
  return RULES.retirement.hsa.nonQualified.records.filter(function(r){return r.provision_id===id})[0].value;
}
function hsaAdditionalTaxRate(p,age,account){
  if(hsaIncludibleShare(account)<=0)return 0;
  return accountOwnerAge(p,age,account)>=hsaNonQualifiedRecord("hsa_nonqualified_exception_age")
    ?0:hsaNonQualifiedRecord("hsa_nonqualified_additional_tax_rate");
}
/* Q99: true when every HSA dollar this household could draw is assumed qualified -- which is the
   default, and the state in which nothing about the engine's behaviour changes. Used to keep the
   quote's single pooled piece for those households rather than splitting per account: task 4.1 showed
   that splitting reassociates the floating-point arithmetic and moves values in their last bits for
   no behavioural reason. */
function hsaDrawIsFullyQualified(accounts){
  return (Array.isArray(accounts)?accounts:[]).filter(function(a){return a&&a.taxClass==="hsa"})
    .every(function(a){return hsaIncludibleShare(a)<=0});
}
function withdrawalComparator(p,priorReturn){
  var optimized=!!(p&&p.retirement&&p.retirement.withdrawalOrder==="optimized"),
      cashFirst=retainedCashFirst(p);
  return function(a,b){
    var aCash=isHouseholdCashHolding(a)?1:0,bCash=isHouseholdCashHolding(b)?1:0;
    if(aCash!==bCash)return cashFirst?bCash-aCash:aCash-bCash;
    return optimized?optimizedAccountScore(a,p,priorReturn)-optimizedAccountScore(b,p,priorReturn):a.priority-b.priority;
  };
}
function nextWithdrawAccount(accounts,taxClass,p,priorReturn){var pool=accounts.filter(function(a){return a.taxClass===taxClass&&a.balance>0});if(!pool.length)return null;pool.sort(withdrawalComparator(p,priorReturn));return pool[0]}
function taxableSocialSecurity(benefit,otherIncome,filing){if(benefit<=0)return 0;var base=filingEntry(RULES.federal.socialSecurityTaxation.base,filing),upper=filingEntry(RULES.federal.socialSecurityTaxation.upper,filing),combined=otherIncome+benefit*.5;if(combined<=base)return 0;if(combined<=upper)return Math.min(benefit*.5,(combined-base)*.5);var firstBand=Math.min(benefit*.5,(upper-base)*.5);return Math.min(benefit*.85,firstBand+(combined-upper)*.85)}
/* FM-02 fix (FULL_MODEL_AUDIT_AND_CLAUDE_HANDOVER_20260910.md): the senior
   deduction phases out PER PERSON, not once against a doubled cap.

   IRS Schedule 1-A, Part V, lines 31-37: each qualifying individual's $6,000
   is reduced separately, the reduced amount is entered for each spouse, and
   those amounts are then added. The previous form started at 6000*n and
   subtracted ONE reduction, which both overstated the deduction for a couple
   above the threshold and stretched their phaseout to double width:

     was     max(0, 6000*n - 0.06 * max(0, MAGI - start))
     now     n * max(0, 6000 - 0.06 * max(0, MAGI - start))

   At $200,000 joint MAGI with two seniors that is $6,000, not $9,000.
   Identical for n=1, and identical for any n at or below the threshold --
   which is precisely why every existing test agreed with the old formula.

   taxSegmentLocal() mirrors this as an affine piece and MUST move with it:
   correcting only this function would leave the funding solver quoting a
   gross sale against a different deduction than the estimator charges. */
/* Q88 (F2, with G16): the REGULAR additional standard deduction for the aged, IRC 63(f)(1). It was simply
   absent: estimateTaxes() charged the basic standard deduction plus the temporary enhanced senior deduction
   and nothing else, so a single 67-year-old was given $22,100 where the statute gives $24,150.

   THESE ARE TWO DIFFERENT DEDUCTIONS and the difference is load-bearing. seniorDeduction() above is the
   temporary OBBBA amount: $6,000 per eligible person, phased out at 6% of MAGI above the threshold, expiring
   after 2028. This one is the permanent 63(f) amount, it has NO PHASEOUT, and it is not MAGI-dependent at
   all -- which is why it enters taxSegmentLocal() as a constant with zero slope.

   THE CONDITION FOR THE LARGER AMOUNT IS "UNMARRIED AND NOT A SURVIVING SPOUSE", NOT "NOT MARRIED FILING
   JOINTLY". A head of household is unmarried and is not a surviving spouse, so a head-of-household senior
   receives $2,050, not $1,650. The statuses that qualify are therefore named as a SET rather than written as
   `filing!=="mfj"`: a status added later lands on the smaller amount by default and must be added here
   deliberately, which is the safe direction to fail. A qualifying surviving spouse would take the smaller
   amount -- the engine models no such filing status, so that boundary is EXCLUDED, not implemented, and
   tests/audit-s5aa-additional-standard-deduction.test.js pins the exclusion so it stays visible.

   Blindness, 63(f)(2), is out of scope and disclosed. The amount is per QUALIFYING PERSON by their OWN age,
   matching seniorDeduction()'s head count, so a couple with one spouse over 65 receives one. */
function additionalStandardDeduction(ages,filing){
  var eligible=ages.filter(function(a){return a>=65}).length;if(!eligible)return 0;
  var INCREASED=["single","hoh"],
      id=INCREASED.indexOf(filing)>=0?"federal_additional_standard_deduction_aged_unmarried_not_surviving_spouse":"federal_additional_standard_deduction_aged",
      records=RULES.federal.additionalStandardDeduction.records,match=null;
  for(var i=0;i<records.length;i++)if(records[i].provision_id===id)match=records[i];
  return eligible*match.value;
}
function seniorDeduction(magi,ages,filing){var eligible=ages.filter(function(a){return a>=65}).length;if(!eligible)return 0;var r=RULES.federal.seniorDeduction,start=filing==="mfj"?r.jointPhaseoutStart:r.singlePhaseoutStart;return eligible*Math.max(0,r.perEligiblePerson-Math.max(0,magi-start)*r.phaseoutRate)}
function taxConfigForFilingStatus(filing){var f=RULES.federal,std=filingEntry(f.standardDeduction,filing)||f.standardDeduction.single;return {ordinary_brackets:filingEntry(f.ordinaryBrackets,filing)||f.ordinaryBrackets.single,ltcg_brackets:filingEntry(f.capitalGains,filing)||f.capitalGains.single,ss_combined_income_thresholds_nominal:[filingEntry(f.socialSecurityTaxation.base,filing),filingEntry(f.socialSecurityTaxation.upper,filing)],capital_loss_ordinary_limit_nominal:3000,niit_rate:f.niit.rate,niit_threshold_nominal:filingEntry(f.niit.threshold,filing),standard_deduction:std,arizona_rate:RULES.arizona.rate,arizona_standard_deduction:(RULES.arizona.records.filter(function(r){return r.provision_id==="az_basic_standard_deduction"&&r.filing_status===filing})[0]||RULES.arizona.records.filter(function(r){return r.provision_id==="az_basic_standard_deduction"&&r.filing_status==="single"})[0]).value,arizona_ltcg_subtraction:0}}
/* S5 task 6: the named income measures of TAX_RULES_ENGINE_REFERENCE_2026.md section 2.3, in its section 2.4 order
   (taxable Social Security before AGI; the senior deduction below AGI on its own MAGI). All live in the tax-return
   ledger of section 2.1; none is a cash-flow or account-and-basis quantity.
     federal_agi            ordinary + investment income + taxable Social Security (no AGI deduction is modelled yet)
     ss_provisional_income  Pub. 915 comparison income: other income + half the benefits
     senior_deduction_magi  AGI plus the section 911/931/933 exclusions, none modelled: equal to AGI today
     niit_magi              AGI with the section 911 modification, not modelled: equal to AGI today
     irmaa_magi             the IRMAA lookback's measure; the result row's `magi` reports it
     arizona_agi            federal AGI less federally taxable Social Security, the one Arizona subtraction built (task 8)
   taxSegmentLocal() mirrors each as a value and a slope, and must move with this function. */
/* S5 task 7 (the owner's question 4, answer B): self-employment tax, TAX section 3.8's common Schedule SE case. Each person's
   adjusted SE profit arrives as a trailing argument; the profit is also in ordinaryIncome, as on the return. Net earnings
   are 92.35% of profit, and nothing under $400; the Social Security part is capped at the wage base less that person's
   wages; Additional Medicare counts wages plus net SE earnings; half the SE tax (without Additional Medicare) comes off
   income before taxable Social Security and federal AGI (section 2.4). SE tax is part of payroll, so the funding
   solver carries it in payrollConst, and the row loop hands the solver income already net of the deductible half. */
/* Q89 (F3, with G17): `niiOther` is net investment income that is NOT already in `capitalGains` or
   `qualifiedDividends` -- the non-qualified dividend remainder, and rental and investment streams. It gets
   its OWN quantity, `netInvestmentIncome`, and touches the 3.8% surtax and NOTHING ELSE.

   THE OBVIOUS REPAIR IS THE WRONG ONE, and it is worth saying why. `investmentIncome` below feeds SEVEN
   things: the Social Security provisional base, federalAgi, ssProvisionalIncome, the CAPITAL-GAINS STACKING
   base, the NIIT cap, the Arizona base and the reported field. But the caller folds ordinary dividends into
   `ordinaryIncome` BEFORE calling this, so AGI, the Social Security base and Arizona ALREADY count them.
   Adding them to `investmentIncome` would count them a second time in all three AND would hand them the
   PREFERENTIAL capital-gains rate -- a larger error than the surtax it was meant to fix, and in the
   taxpayer's favour, so nothing would complain. Only the cap may move.

   ON THE NAME: Form 8960 line 2 "Ordinary dividends" is the TOTAL, of which qualified dividends are a
   SUBSET. The engine's `ordinaryDividends` is the opposite -- the NON-QUALIFIED REMAINDER. So the two ADD
   here without double counting, and their sum is exactly line 2. Had the variable carried the form's
   meaning, adding it would have counted every qualified dollar twice. */
/* Q87 (F1, with G15): the traditional IRA deduction and its IRC 219(g) phase-out. A traditional IRA
   contribution was not deducted AT ALL -- an IRA is limitGroup "ira", and only "workplace" and "hsa" reach
   preTaxDeferrals -- so $7,500 into an IRA moved the tax by $0 where the same $7,500 into a 401(k) moved it
   by $1,087.50.

   WHOSE COVERAGE MATTERS DEPENDS ON THE FILING STATUS, and getting that wrong is the easy error: for a
   single or head-of-household filer only the owner's own coverage counts, while on a joint return an
   UNCOVERED contributor married to a COVERED spouse has a phase-out of their own -- a much higher one
   (IRC 219(g)(7)(A)). A household where NEITHER is covered has no phase-out at any income.

   THE MEASURE IS AGI COMPUTED WITHOUT THE IRA DEDUCTION ITSELF (IRC 219(g)(3)(A)), so there is no
   circularity, and the caller must pass a MAGI figured before the deduction is taken. The same is true of
   the ROTH limit: Publication 590-A Worksheet 1-2 line 4 enters "any traditional IRA deduction" and line 10
   says to ADD it back, so rothPhaseoutFactor() must NOT be fed a reduced figure. That is G15, and it is why
   nothing here touches it.

   Married filing separately (a 0 to 10,000 range) is excluded because the engine models no such status. */
/* Q87 (F1) STEP 2: FORM 8606 BASIS. Step 1 decided which part of a traditional IRA contribution is
   DEDUCTIBLE. This is what happens to the part that is not: a nondeductible contribution is made with
   money already taxed, so distributing it again taxes the same dollar twice.

   Read from the Form 8606 instructions before any of this was coded (the citation check recorded for the Form 8606 instructions):

     PER PERSON        "If both you and your spouse are required to file 2025 Form 8606, file a
                        separate 2025 Form 8606 for each of you." BASIS NEVER COMBINES BETWEEN SPOUSES.
     WHAT BASIS IS     all nondeductible contributions and nontaxable amounts included in rollovers,
                        MINUS all nontaxable distributions.
     THE PRO-RATA RULE line 6 takes "the total value of all your traditional IRAs as of December 31 ...
                        plus any outstanding rollovers" -- that owner's traditional IRAs are ONE POOL,
                        and a distribution cannot choose to take basis first from one of them.

   SO THE NONTAXABLE FRACTION IS A PROPERTY OF THE OWNER, NOT OF THE ACCOUNT DRAWN FROM. That is why
   this step needs the funding solver's preTax class split per account UNCONDITIONALLY: two owners'
   IRAs in one household have different taxable fractions, and one pooled piece cannot say so. Task
   4.1 built that split conditionally and recorded exactly this as the reason it would have to become
   unconditional here.

   NOT MODELLED, AND DISCLOSED: basis also arises from nontaxable rollover amounts and from
   contributions made BEFORE the projection starts, and the engine has no input for an opening basis.
   A household that arrives with basis is under-credited, which makes the modelled tax too HIGH -- the
   safe direction, but still wrong, so it is said out loud. */
function form8606Basis(basis,owner){
  var key=owner==="spouse"?"spouse":"self";
  return Math.max(0,Number(basis&&basis[key])||0);
}
/* Q87 step 2: Form 8606 line 6 over one owner's whole traditional-IRA pool. Clamped into [0,1] at
   both ends: an empty pool distributes nothing, and basis can never exceed what it is recovered
   from. */
function iraNontaxableFraction(basis,pool){
  var b=Math.max(0,Number(basis)||0),p=Math.max(0,Number(pool)||0);
  if(p<=1e-9||b<=0)return 0;
  return Math.min(1,b/p);
}
/* Q87 step 2: an owner's traditional-IRA pool. Only traditionalIRA counts -- a 401(k) keeps its own
   basis on the plan and is not part of the IRA pro-rata computation, which is the distinction Form
   8606 draws and the reason this filters on the ACCOUNT TYPE rather than on the tax class. */
function iraPoolFor(accounts,owner){
  var key=owner==="spouse"?"spouse":"self";
  return (Array.isArray(accounts)?accounts:[]).filter(function(a){
    return a&&a.type==="traditionalIRA"&&(a.owner==="spouse"?"spouse":"self")===key;
  }).reduce(function(t,a){return t+Math.max(0,Number(a.balance)||0)},0);
}
/* Q87 step 2: the nontaxable fraction of a draw from THIS account, which is zero unless the account
   is one of that owner's traditional IRAs. Read by the commit and by the quote, so the two cannot
   disagree about what a dollar out of this account costs. */
function iraBasisFractionFor(accounts,basis,account){
  if(!account||account.type!=="traditionalIRA")return 0;
  var owner=account.owner==="spouse"?"spouse":"self";
  return iraNontaxableFraction(form8606Basis(basis,owner),iraPoolFor(accounts,owner));
}
/* R6 EXTERNAL AUDIT, EA-04 AND EA-05: THE TAX CHARACTER OF A PRE-TAX DISTRIBUTION, in one place.

   EA-04: the nontaxable share of a draw was priced on the owner's pool, but the basis it recovered was
   summed into one household number and taken off at the END OF THE ROW in proportion to the two
   owners' basis -- so one spouse's distribution spent the other's basis. MEASURED at 5c985c0: $7,500
   of basis each, the self's IRA drawn in full, and the spouse's own $7,500 draw the next year showed
   $3,750 of AGI. Form 8606 is filed per person; basis never crosses.
   EA-05: a Roth conversion, and a pre-tax transfer to a Roth or taxable account, recognised every dollar
   moved as income and spent no basis. MEASURED at 5c985c0: a $7,500 IRA that is all basis, converted in
   full, put $7,500 into AGI.

   So every pre-tax distribution -- an ordinary draw, a required distribution, a conversion, a transfer
   out -- is priced by these three and nothing else:
     iraPoolsAtStart()        each owner's whole traditional-IRA pool, measured BEFORE the transaction
                              moves a dollar (Form 8606 line 6; the reason is Q87 step 2's, below);
     iraBasisRecoveredFor()   the nontaxable part of `amount` taken from `account`: the owner's basis over
                              the owner's pool, and zero for anything that is not a traditional IRA -- an
                              employer plan keeps its own basis and is not in the IRA pool;
     spendIraBasis()          takes each owner's recovery off THAT owner's basis, at the end of the
                              transaction.
   Taking it off per transaction, rather than at the end of the row, is what keeps several transactions
   in one row coherent: a draw of w from a pool P holding basis b recovers w*b/P and leaves b(1-w/P) over
   P-w -- the same fraction -- so a conversion followed by a withdrawal prices both at one fraction and
   no basis is used twice. The quote reads the same live state through iraBasisFractionFor(), so it and
   the commit still agree dollar for dollar. */
function iraPoolsAtStart(accounts){
  return {self:iraPoolFor(accounts,"self"),spouse:iraPoolFor(accounts,"spouse")};
}
function iraBasisRecoveredFor(account,amount,basis,poolsAtStart){
  if(!account||account.type!=="traditionalIRA"||!(amount>0))return 0;
  var owner=account.owner==="spouse"?"spouse":"self";
  return amount*iraNontaxableFraction(form8606Basis(basis,owner),poolsAtStart[owner]);
}
/* S5AA R19, WORKSTREAM A (R10-03, R10-04, R10-05; contract reviewed in ChatGPT's R18 audit, 2026-09-24; built on the owner's
   decision of 2026-09-23): THE ANNUAL PER-OWNER IRA SETTLEMENT. Each distribution is still priced when it happens, at the
   owner's basis over the pool measured before it (the PROVISIONAL price the tax quote funds, unchanged). At the row's end
   each owner's year is settled the way Form 8606 settles it, and the difference in taxable income is taxed as a true-up
   paid in the next row. recordIraFlow() tallies what left each owner's traditional IRAs this row, by kind; settleIraYear()
   is the settlement itself. The rules, each checked at the source (2025 texts):
     - Form 8606 Part I: basis = last year's closing basis + this year's nondeductible contributions (lines 1-3);
       fraction = basis / (December 31 value + distributions + conversions) (lines 6-10), at most 1; the nontaxable parts
       of distributions and conversions come off the basis (lines 11-14). This year's nondeductible contributions are basis
       for this year's conversion (R10-03).
     - QCDs (Pub. 590-B, "Qualified charitable distributions"; IRC 408(d)(8)(D)): a QCD is "first considered to be paid out
       of otherwise taxable income" -- it qualifies only up to what would be includible if all the owner's IRAs were
       distributed, it is not a Form 8606 distribution and spends no basis; a charitable transfer above that is a return of
       basis and does (the 590-B Amy example: $25,000 from a $30,000 IRA holding $10,000 of basis is a $20,000 QCD and
       leaves $5,000 of basis) (R10-04).
     - The post-70.5 offset (Pub. 590-B, "Offset of QCDs by amounts contributed after age 70.5"; the QCD Adjustment
       Worksheet): the excludable QCD is reduced by the IRA deductions taken for years the owner was 70.5 or older at the
       year's end, less the part already used; the reduced part is income like any other distribution; the unused offset
       carries forward, per owner (R10-05). No charitable deduction: the model has no itemized path.
     - Qualified HSA funding distributions (S5AA R30, R29-02 of ChatGPT's R29 change audit; the owner 2026-09-28: "Repair in
       R30"): IRC 408(d)(9)(E) treats the amount distributed as includible up to what a distribution of all the owner's IRAs
       would include, and Notice 2008-51 applies that to the basis left behind -- the funding comes out of taxable value first,
       and "the individual's basis in the excess amount ... does not carry over to the HSA" (its example: $200 of basis in a
       $2,000 IRA, $1,500 funded, and $200 of basis stays on $500). So, like a QCD, it is not a Form 8606 distribution; its part
       within the taxable value spends no basis, and the rest spends basis dollar for dollar. R29 recorded nothing, so an
       all-basis IRA sent $5,400 to an HSA and kept all $8,600 of its basis, which later sheltered a deductible $2,000 ($290 of
       tax). A QCD in the same year is taken from the taxable value first.
       S5AA R31 (R30-01 of ChatGPT's R30 change audit; the owner 2026-09-28: "Repair in R31"): THE TAXABLE VALUE IS MEASURED ON
       THE FUNDING'S DATE -- the owner's pool then, plus what the year had already distributed or converted, less the year's
       basis -- not from December 31. R30 measured it from the year-end value, so growth after the funding made the IRA look
       more taxable and gave back basis that had left with it ($8,600 of basis, $9,460 at the funding, $5,400 funded: $4,540 used
       and $4,060 left, but +10% to $4,466 by the year's end had the settlement use $4,134 and keep $4,466 -- $406 of transferred
       basis back, $58.87 of tax missing; a loss used more than the funding took). The Notice reads the basis "immediately after"
       the funding, and later growth is not a contribution. The draws and conversions of the year are still settled pro rata at
       its end, on the basis the funding left. A caller that gives no date measure (qhfdPool) gets the year-end one.
   Only a traditional IRA is in the pool; an employer plan keeps its own basis, as before. */
function recordIraFlow(state,account,kind,amount,nontaxable){var f=state&&state.row;if(!f||!account||account.type!=="traditionalIRA"||!(amount>0))return;var o=f[account.owner==="spouse"?"spouse":"self"];if(!o)return;o[kind]+=amount;o.nt+=Math.max(0,Number(nontaxable)||0)}
function settleIraYear(o){var basis=Math.max(0,Number(o.basisStart)||0)+Math.max(0,Number(o.nondeductible)||0),value=Math.max(0,Number(o.poolEnd)||0),dist=Math.max(0,Number(o.dist)||0),conv=Math.max(0,Number(o.conv)||0),qcd=Math.max(0,Number(o.qcd)||0),qhfd=Math.max(0,Number(o.qhfd)||0),
  includibleAll=Math.max(0,value+dist+conv+qcd+qhfd-basis),qcdQualified=Math.min(qcd,includibleAll),qcdExcess=qcd-qcdQualified,
  qhfdIncludible=o.qhfdPool===undefined||o.qhfdPool===null?includibleAll:Math.max(0,Math.max(0,Number(o.qhfdPool)||0)+Math.max(0,Number(o.qhfdFlowsBefore)||0)-basis),
  qhfdBasisUsed=Math.min(basis,qhfd-Math.min(qhfd,Math.max(0,qhfdIncludible-qcdQualified))),basisLeft=basis-qhfdBasisUsed,
  line7=dist+qcdExcess,line8=conv,line9=value+line7+line8,fraction=line9>1e-9?Math.min(1,basisLeft/line9):0,nontaxable7=line7*fraction,nontaxable8=line8*fraction,
  offsetAvailable=Math.max(0,Number(o.offsetAvailable)||0),offsetUsed=Math.min(offsetAvailable,qcdQualified),
  settledTaxable=(line7-nontaxable7)+(line8-nontaxable8)+offsetUsed,provisionalTaxable=dist+conv-Math.max(0,Number(o.ntProvisional)||0);
  return {basis:basis,fraction:fraction,line7:line7,line8:line8,nontaxable:nontaxable7+nontaxable8,closingBasis:Math.max(0,basisLeft-nontaxable7-nontaxable8),qhfdBasisUsed:qhfdBasisUsed,
    qcdQualified:qcdQualified,qcdExcess:qcdExcess,qcdExcluded:qcdQualified-offsetUsed,offsetUsed:offsetUsed,offsetCarryOut:offsetAvailable-offsetUsed,
    settledTaxable:settledTaxable,provisionalTaxable:provisionalTaxable,delta:settledTaxable-provisionalTaxable}}
function spendIraBasis(basis,byOwner){
  if(!basis||!byOwner)return;
  ["self","spouse"].forEach(function(k){
    if(byOwner[k]>0)basis[k]=Math.max(0,(Number(basis[k])||0)-byOwner[k]);
  });
}
/* THE R6 SUCCESSION FINDING, and the R7 re-audit's R7-03: WHAT COVERS AN ACCOUNT THAT CHANGES HANDS AT A DEATH.
   One class per account, read from the account as it stands when it passes. "authority" is the cited spousal
   election or rollover; "assumption" is a treatment the model makes and names for a decision; "unsupported"
   is a treatment no rule can support. A type the engine does not list is classed by its tax class, as
   accountType() falls back for it (the corpus spells a taxable account "brokerage").
   JOINT OWNERSHIP IS ITS OWN CASE (R7-03). Every owner-keyed rule reads anything but "spouse" as the primary
   person's, so a joint account had no succession of its own: MEASURED at 99a2e6d, silent when the spouse died
   first, and disclosed under the self's rule when the self did. A joint taxable account stays with the
   survivor; what its basis becomes turns on titling and state property law (IRC 2040(b), 1014(b)(6)) that the
   plan does not record, so no step-up share is chosen -- it is named. An IRA, a workplace plan or an HSA cannot
   be jointly owned; the app never offers it, and since the R9 round (the owner's decision 12) the validator refuses it
   (INVALID_ACCOUNT_OWNER). One that reaches the engine directly, unvalidated, is disclosed as unsupported. */
function accountSuccessionClass(a){
  var type=a&&a.type,cls=a&&a.taxClass,group=accountType(type).limitGroup;
  if(a&&a.owner==="joint"){
    if(group)return {basis:"unsupported",authority:[],assumed:"an IRA, a workplace plan or an HSA is individually owned; an account entered as joint is read as the primary person's"};
    if(cls==="taxable")return {basis:"assumption",authority:["IRC 2040(b)","IRC 1014(b)(6)"],assumed:"a joint account stays with the survivor with its whole cost basis; the step-up at death depends on titling and property law this plan does not record"};
    return {basis:"assumption",authority:[],assumed:"a joint custom account stays with the survivor, as if it were an IRA of its tax class"};
  }
  var TABLE={
        traditionalIRA:{basis:"authority",authority:["Treas. Reg. 1.408-8(c)"]},
        rothIRA:{basis:"authority",authority:["Treas. Reg. 1.408A-6 Q&A-14"]},
        traditional401k:{basis:"authority",authority:["IRC 402(c)(9)"]},
        roth401k:{basis:"authority",authority:["IRC 402(c)(9)"]},
        hsa:{basis:"assumption",authority:["IRC 223(f)(8)(A)"],assumed:"the surviving spouse is the designated beneficiary of the HSA"},
        customTaxable:{basis:"assumption",authority:["IRC 1014"],assumed:"a taxable account keeps the decedent's cost basis, with no step-up at death"},
        customTraditional:{basis:"assumption",authority:[],assumed:"a custom account passes like an IRA of its tax class"},
        customRoth:{basis:"assumption",authority:[],assumed:"a custom account passes like an IRA of its tax class"}},
      c=TABLE[type==="taxable"?"customTaxable":type]||TABLE[{taxable:"customTaxable",hsa:"hsa",roth:"customRoth"}[cls]||"customTraditional"];
  return {basis:c.basis,authority:c.authority.slice(),assumed:c.assumed||null};
}
function iraDeductionPhaseoutRange(filing,ownerCovered,spouseCovered){
  if(!ownerCovered&&!spouseCovered)return null;
  var recs=RULES.retirement.ira.deductionPhaseout.records,
      v=function(id){for(var i=0;i<recs.length;i++)if(recs[i].provision_id===id)return recs[i].value;return null},
      key=filing==="mfj"?(ownerCovered?"mfj_contributor_active":"mfj_spouse_only_active")
        :(ownerCovered?"single_or_hoh_active":null);
  if(!key)return null;
  return [v("ira_deduction_phaseout_start_"+key),v("ira_deduction_phaseout_end_"+key)];
}
/* S5AA R33 (SA32F-10, SA32F-29; the owner 2026-09-29: apply the $10 rounding): A PHASE-OUT REDUCES THE LIMIT. IRC 219(g)(1):
   "each of the dollar limitations ... shall be reduced" by the share of the range the MAGI has crossed; 219(g)(2)(B): not
   below $200 unless reduced to zero; 219(g)(2)(C): a reduction that is not a multiple of $10 is rounded to the next lowest
   $10. Publication 590-A Worksheet 1-2 line 4 is the same figure (the reduced limit rounded UP to the next $10, at least
   $200). The Roth limit uses the same arithmetic on its own range (408A(c)(3)(A) applies 219(g)(2)(B)-(C)). The rounding
   was left out until R33 because Publication 590-A's Example 1 prints $6,825 for a 2025 joint filer at $126,500 of MAGI;
   its own line 4 instruction, and the statute, give $6,830. `limit` is the owner's dollar limit with any catch-up, and the
   minimum is Worksheet 1-2's $200 (read by the caller from the rules). Self-contained: the Worker copies this function. */
function iraPhaseoutLimit(limit,magi,range,minimum){
  var L=Math.max(0,Number(limit)||0);
  if(!range||!Number.isFinite(range[0])||!Number.isFinite(range[1])||!(range[1]>range[0]))return L;
  var m=Number(magi)||0;
  if(m<=range[0])return L;
  if(m>=range[1])return 0;
  var reduction=Math.floor(L*(m-range[0])/(range[1]-range[0])/10+1e-9)*10,reduced=Math.max(0,L-reduction);
  return reduced>0?Math.max(Math.max(0,Number(minimum)||0),reduced):0;
}
/* The deductible part of a traditional IRA contribution: Publication 590-A Worksheet 1-2 line 7, the smaller of the
   contribution and the reduced limit (line 4); compensation (line 5) is capped where the contribution is made (R26).
   Until R33 the CONTRIBUTION was tapered (SA32F-10): 4,000 at the midpoint deducted 2,000 where the law allows 3,750.
   `limit` is the owner's IRA dollar limit for the row (with catch-up); a caller that gives none is read as the base limit.
   With no phase-out the deduction is still at most the limit, so an excess kept under the "warn" policy is not deducted. */
function iraDeductibleAmount(contribution,magi,filing,ownerCovered,spouseCovered,limit){
  var amount=Math.max(0,Number(contribution)||0);
  if(amount<=0)return 0;
  var L=Number.isFinite(Number(limit))&&limit!==null&&limit!==undefined?Number(limit):RULES.retirement.ira.combinedLimit;
  return Math.min(amount,iraPhaseoutLimit(L,magi,iraDeductionPhaseoutRange(filing,ownerCovered,spouseCovered),RULES.retirement.ira.deductionPhaseout.minimumAllowance));
}
/* Q88 (F-02): WHO IS ALIVE IN THIS ROW. `p.profile.filing` was static for the whole projection --
   nothing anywhere changed it -- so a couple filing mfj still filed mfj in every year after one of
   them died, on joint brackets, the joint standard deduction and joint phaseout thresholds. The
   senior-deduction age list had no death check either: it read
       [age, p.profile.spouseOn ? p.profile.spouseAge+(age-p.profile.age) : -1]
   and `spouseOn` is a PLAN flag, not a SURVIVAL flag, so a deceased spouse kept earning a full senior
   deduction and, since task 3.1, a further additional standard deduction as well.

   MEASURED at the start commit, a household of two 70-year-olds with $120,000 of spending out of a
   $4,000,000 pre-tax account, the spouse dying at 75: the tax is $12,039.77 in EVERY row, before the
   death and after it. One person with the same income and the same accounts pays $26,082.43. The
   survivor was modelled at LESS THAN HALF the tax they owe, in the years a real household's tax
   usually rises sharply -- the widow's penalty, with its sign reversed.

   THE ENGINE ALREADY KNOWS WHO IS ALIVE, and already acts on it elsewhere:
   householdSocialSecurityDetail() makes both deaths segment boundaries and stops paying the benefit,
   whether or not `retirement.survivor` is on. Only the tax layer never asked. That is why this is a
   defect repair and not new modelling, and it is why the gate below is the lifespans themselves
   rather than the survivor flag.

   THE RULE, checked against its sources before it was written -- S5AA task 8.6, the four citation
   checks recorded for this task in the sprint's citation register:
     - IRC 6013(a)(3): a joint return MAY be made by the surviving spouse for the taxable year in
       which the other died. So the row containing a death still files jointly;
     - IRC 2(a): 'qualifying surviving spouse' covers the two taxable years AFTER the year of death
       and requires a dependent child in the household. THE ENGINE HAS NO DEPENDENT INPUT, so that
       status is not modelled, and a household that has one is modelled as single where it could file
       jointly -- which OVERSTATES its tax for two years. Disclosed, not silent;
     - Publication 501: without a qualifying child the survivor files SINGLE from the year after the
       death. That is the transition below, and `single` is a status the engine already models, which
       is what keeps this inside ground rule 12;
     - IRC 63(f)(1)(B): the spouse's additional amount needs an exemption allowable under 151(b),
       which a separate return does not give, so it ends with the joint return;
     - the section 151 senior deduction is per individual aged 65 or older, same shape.

   A PERSON IS COUNTED FOR A ROW IF THEY WERE ALIVE AT ITS OPENING -- `deathAge >= age` -- which is
   the row-level reading of 'the taxable year in which the death occurs'. A death at exactly 75.0 makes
   the row [75,76) the year of death, and 76 onward single.

   WHAT WAS NOT CHANGED THEN: auditContributions() and rothPhaseoutFactor() kept the entered status,
   on the reasoning that they decide CONTRIBUTION ROOM rather than what a household owes. The R6
   external audit (EA-03) showed the Roth half of that materially wrong -- a survivor kept the joint
   phase-out -- and rothPhaseoutFactor() now asks this function for the row. What STILL reads the
   entered status is the HSA family limit in auditContributions(): whether a survivor's coverage stays
   family coverage is a fact the engine has no input for, and it is recorded for a decision rather than
   assumed either way. */
/* A DEATH IS ONLY EVER ASSERTED POSITIVELY. Both of the first draft's mistakes were the other way
   round -- inferring a death from a missing number -- and both were caught by tests that had nothing
   to do with survivorship:
     - a fixture with no `retirement` section at all left the lifespans NaN, and
     - `spouseAlive` was false whenever no spouse was MODELLED, so a plan that entered `mfj` with
       `spouseOn: false` was widowed on the spot and taxed as single. tests/tax-wiring.test.js found
       that one immediately: $60,000 of ordinary income came out at $5,020 against the ported
       engine's $2,840.
   So each person is DEAD only when both their lifespan and their age in this row are finite numbers
   and the death has passed. Anything unknown means alive, which is the entered plan's own behaviour
   and moves nothing. */
function householdSurvivorship(p,age){
  var profile=(p&&p.profile)||{},r=(p&&p.retirement)||{};
  var selfLife=Number(r.selfLife),spouseLife=Number(r.spouseLife),startAge=Number(profile.age);
  var spouseModelled=!!profile.spouseOn;
  var spouseAgeNow=spouseModelled&&Number.isFinite(startAge)?Number(profile.spouseAge)+(age-startAge):NaN;
  var selfDead=Number.isFinite(selfLife)&&Number.isFinite(age)&&selfLife<age;
  var spouseDead=spouseModelled&&Number.isFinite(spouseLife)&&Number.isFinite(spouseAgeNow)&&spouseLife<spouseAgeNow;
  return {selfAlive:!selfDead,spouseAlive:spouseModelled&&!spouseDead,spouseModelled:spouseModelled,
    spouseAge:Number.isFinite(spouseAgeNow)?spouseAgeNow:-1,
    /* AND WIDOWHOOD TAKES TWO PEOPLE. The golden scenarios caught the third version of this: every
       one of them carries the default plan's `filing: "mfj"` with `spouseOn: false`, and the default
       `selfLife` of 95 against a horizon of 100 -- so a LONE person's death was turning the last five
       rows single. That is not F-02. F-02 is about a SURVIVING SPOUSE, and a household of one leaves
       none: there is nobody whose filing status could change. Those rows are a projection continuing
       past a death it already models oddly, which is a separate question, and this repair leaves them
       exactly as they were. */
    widowed:spouseModelled&&(selfDead||spouseDead)};
}
/* Q88: the ONE definition of the filing status a row is taxed under. Every row-time reader goes
   through here; `p.profile.filing` remains what the household ENTERED and is never rewritten. */
function householdFilingFor(p,age){
  var entered=(p&&p.profile&&p.profile.filing)||"single";
  if(entered!=="mfj")return entered;
  return householdSurvivorship(p,age).widowed?"single":entered;
}
/* Q88: the ONE definition of whose senior amounts a row counts. The AGE EXPRESSION is unchanged --
   each person's age at the row's opening, which is the convention the whole engine uses -- so a living
   household does not move by a cent. What changes is whether an entry is there at all.
   Publication 501 counts a spouse as 65 or older for the year of death if they were 65 or older AT
   DEATH, which is a later moment than this row's opening; the engine measures every person's age at
   the opening, for the living as well, so the same half-year convention is kept here rather than one
   person being measured differently from the rest. */
function householdSeniorAges(p,age){
  var who=householdSurvivorship(p,age);
  /* A HOUSEHOLD OF ONE IS RETURNED EXACTLY AS IT WAS, for the same reason the filing status is:
     there is no surviving spouse, so F-02 has nothing to say about it. The default plan carries
     `filing: "mfj"` with `spouseOn: false` and a `selfLife` of 95 against a horizon of 100, so every
     golden scenario has five rows past a lone person's death -- dropping their age-65 amounts there
     would move five locked fixtures for a reason this repair does not claim. */
  if(!who.spouseModelled)return [age,-1];
  return [who.selfAlive?age:-1,who.spouseAlive?who.spouseAge:-1];
}
/* S5AA R33 (SA32F-16): THE AGE-65 AMOUNTS READ THE AGE REACHED BY THE ROW'S CLOSE. IRC 63(f)(1)(A) and 151(d)(5)(C)(ii)(I) give them to a person who
   "has attained age 65 before the close of" the taxable year, and A.R.S. 43-1023(E) Arizona's $2,100 exemption likewise; R32 treats each row as a
   tax year and reads the catch-ups at its close. The ages are the living ones at the row's opening (householdSeniorAges()), each carried to the
   row's close, or to the age at death for a person who dies inside the row. Only these age-65 tests read them; Medicare and the filing status
   keep their own rules. A caller that gives no span tests the ages as given. */
function householdSeniorAgesAtClose(p,age,span){var ages=householdSeniorAges(p,age),s=Number.isFinite(Number(span))?Math.max(0,Number(span)):0,r=p&&p.retirement||{},life=[Number(r.selfLife),Number(r.spouseLife)];return ages.map(function(a,i){if(!(a>=0))return a;var c=a+s;return Number.isFinite(life[i])?Math.min(c,Math.max(a,life[i])):c})}
/* S5AA R33 (SA32F-33; the owner 2026-09-29: "Follow law everywhere"): WHOSE AGE-65 AMOUNTS A RETURN CARRIES. The model reads an included
   spouse as a MARRIED spouse. While both are alive and the return is not joint: the spouse's age counts for neither amount (IRC
   151(d)(5)(C)(ii)(II), "in the case of a joint return"; 63(f)(1)(B)) nor Arizona's exemption; a married individual gets the senior
   deduction only on a joint return (151(d)(5)(C)(v)), so neither spouse does; and the self's own 63(f) amount is the married one,
   since the "unmarried" amount is for an individual "not married" (63(f)(3)) -- "mfs" names that key. Everyone else is unchanged. */
function ageAmountAges(p,age,filing,span){var ages=householdSeniorAgesAtClose(p,age,span),who=householdSurvivorship(p,age),apart=!!(who.spouseModelled&&who.selfAlive&&who.spouseAlive&&filing!=="mfj");return apart?{seniorAges:[ages[0],-1],seniorDeductionAges:[],additionalFiling:"mfs"}:{seniorAges:ages,seniorDeductionAges:ages,additionalFiling:filing}}
function estimateTaxes(p,age,ordinaryIncome,capitalGains,ssBenefit,wages,qualifiedDividends,spouseWages,selfSeProfit,spouseSeProfit,niiOther,capitalLossCarryIn,rowSpan){/* Q88 (F-02): the status this row is TAXED under, which is the entered one until a death. */var filing=householdFilingFor(p,age),ageBasis=ageAmountAges(p,age,filing,rowSpan),seniorAgesHere=ageBasis.seniorAges,/* R18 (B1 (c)): the row's net capital result, less the loss carried in. A positive net is gain; qualified dividends are never netted against a capital loss. */netCapital=capitalGains-Math.max(0,Number(capitalLossCarryIn)||0),seRate=function(id){return RULES.federal.selfEmployment.records.filter(function(r){return r.provision_id===id})[0].value},spousePayrollWages=Math.max(0,spouseWages||0),selfPayrollWages=Math.max(0,wages-spousePayrollWages),seNetFor=function(profit){var net=Math.max(0,Number(profit)||0)*seRate("se_net_earnings_factor");return net<seRate("se_minimum_net_earnings")?0:net},seNetSelf=seNetFor(selfSeProfit),seNetSpouse=seNetFor(spouseSeProfit),seSocialSecurity=seRate("se_social_security_rate")*(Math.min(seNetSelf,Math.max(0,RULES.federal.payroll.oasdiWageBase-selfPayrollWages))+Math.min(seNetSpouse,Math.max(0,RULES.federal.payroll.oasdiWageBase-spousePayrollWages))),seMedicare=seRate("se_medicare_rate")*(seNetSelf+seNetSpouse),seDeductibleHalf=.5*(seSocialSecurity+seMedicare),/* R18 (B1 (c)), as repaired in R19 (R18-01, ChatGPT's R18 external audit, 2026-09-24): a net capital loss is
       deducted up to the limit (Schedule D line 21) WHATEVER the other income. It is Form 1040 line 7a, and the Social
       Security Benefits Worksheet combines line 7a on its line 3, so it lowers provisional income; the cap this replaced
       (non-Social-Security ordinary income plus qualified dividends) gave a retiree living on Social Security no deduction
       at all. The deduction comes off total income, carried here on the ordinary side, which may go negative -- and so
       may AGI, as Form 1040 line 11 may (the owner, 2026-09-23: show it as the form does). Qualified dividends and net gain stay
       preferential up to taxable income (the Qualified Dividends and Capital Gain Tax Worksheet): a negative ordinary side
       reduces them below, where taxable income is formed, never here. Net investment income includes the deductible loss
       (Form 8960 line 5a combines Form 1040 line 7a). */ordinaryPart=ordinaryIncome-seDeductibleHalf,capitalLossDeduction=netCapital<0?Math.min(capitalLossLimit(),-netCapital):0,incomeTaxOrdinary=ordinaryPart-capitalLossDeduction,investmentIncome=Math.max(0,netCapital)+qualifiedDividends,netInvestmentIncome=Math.max(0,investmentIncome-capitalLossDeduction+(Number(niiOther)||0)),ssTaxable=taxableSocialSecurity(ssBenefit,incomeTaxOrdinary+investmentIncome,filing),federalAgi=incomeTaxOrdinary+investmentIncome+ssTaxable,ssProvisionalIncome=incomeTaxOrdinary+investmentIncome+Math.max(0,ssBenefit)*.5,measures={federal_agi:federalAgi,ss_provisional_income:ssProvisionalIncome,senior_deduction_magi:federalAgi,niit_magi:federalAgi,irmaa_magi:federalAgi,arizona_agi:federalAgi-ssTaxable},section151=seniorDeduction(measures.senior_deduction_magi,ageBasis.seniorDeductionAges,filing),deduction=filingEntry(RULES.federal.standardDeduction,filing)+section151+additionalStandardDeduction(seniorAgesHere,ageBasis.additionalFiling),/* S5AA R18 self-audit, finding SA18-01: THE CARRYOVER A YEAR USES IS CAPPED BY TAXABLE INCOME. The Capital Loss Carryover Worksheet (Schedule D
       instructions, lines 1-4; IRC 1212(b)(2)): line 1 is taxable income, which may be negative; line 3 is line 1 plus the loss
       deducted, floored at zero; the year used the smaller of the deduction and line 3. This treated the whole deduction as used,
       so a year whose income sat under the standard deduction lost up to $3,000 of carryover (143 rows of 10 corpus members,
       measured at 6e8f31e). The deduction itself, and so this row's AGI, is unchanged. *//* S5AA R33 (SA32F-34): IRC 1212(b)(2)(B) adds back "(ii) the deduction allowed for such year under section 151" too -- the senior
       deduction is allowed under 151(d)(5)(C) -- so a low-income senior year uses more of its loss and carries less forward. */capitalLossCarryOut=netCapital<0?-netCapital-Math.min(capitalLossDeduction,Math.max(0,federalAgi-deduction+capitalLossDeduction+section151)):0,ordinaryBeforeDeduction=Math.max(0,incomeTaxOrdinary+ssTaxable),ordinaryTaxable=Math.max(0,ordinaryBeforeDeduction-deduction),remainingDeduction=Math.max(0,deduction-ordinaryBeforeDeduction),/* R19 (R18-01): an ordinary side still negative after taxable Social Security (the loss exceeding them) comes off the preferential income, so taxable income is AGI less the deduction, never more. */taxableGains=Math.max(0,investmentIncome+Math.min(0,incomeTaxOrdinary+ssTaxable)-remainingDeduction),/* S5AA R33 (SA32F-32): Form 1040 Qualified Dividends and Capital Gain Tax Worksheet line 25, "the smaller of line 23 or line 24" --
       the preferential computation, or the regular tax on all taxable income if that is less (IRC 1(h)(1), "shall not exceed"). For
       2026 the 0% ceiling sits below the top of the 12% bracket, so preferential income in that sliver is cheaper at 12% than 15%.
       The funding solver's mirror takes the same min() (taxSegmentLocal()). */federal=Math.min(marginalTax(ordinaryTaxable,filing)+capitalGainsTax(taxableGains,ordinaryTaxable,filing),marginalTax(ordinaryTaxable+taxableGains,filing)),niit=RULES.federal.niit.rate*Math.min(netInvestmentIncome,Math.max(0,measures.niit_magi-filingEntry(RULES.federal.niit.threshold,filing))),ssPayroll=(Math.min(selfPayrollWages,RULES.federal.payroll.oasdiWageBase)+Math.min(spousePayrollWages,RULES.federal.payroll.oasdiWageBase))*RULES.federal.payroll.oasdiEmployee,medicare=wages*RULES.federal.payroll.medicareEmployee+Math.max(0,wages+seNetSelf+seNetSpouse-filingEntry(RULES.federal.payroll.additionalThreshold,filing))*RULES.federal.payroll.additionalMedicare,/* S5 task 8 (the owner's question 5, answer C): Arizona taxable income is Arizona AGI -- federal AGI less the federally
     taxable Social Security it includes, which is incomeTaxOrdinary+investmentIncome, written as the base before it --
     less Arizona's basic standard deduction record and $2,100 for each person 65 or older, never below zero. Written
     this way rather than as arizona_agi-..., whose adding and subtracting of taxable Social Security is exact in
     arithmetic but not in floating point: this form makes a $0 exemption reproduce the prior engine bit for bit. */azBase=Math.max(0,incomeTaxOrdinary+investmentIncome-(RULES.arizona.records.filter(function(r){return r.provision_id==="az_basic_standard_deduction"&&r.filing_status===filing})[0]||RULES.arizona.records.filter(function(r){return r.provision_id==="az_basic_standard_deduction"&&r.filing_status==="single"})[0]).value-RULES.arizona.records.filter(function(r){return r.provision_id==="az_age65_exemption"})[0].value*/* Q88 (F-02): the SECOND age-65 count in this function, and it was the one that disagreed. It
   rebuilt the eligibility inline from `spouseOn` -- a plan flag, not a survival flag -- while
   taxSegmentLocal() has always counted `ctx.seniorAges.filter(a=>a>=65).length`. The two agreed only
   because the array was built the same way, so giving the array a death check and leaving this alone
   made the mirror and the estimator differ by the Arizona exemption times the Arizona rate --
   $2,100 x 2.5% = $52.50 -- and every widowed row reported QUOTE_SETTLEMENT_UNVERIFIED. THE MIRROR
   WAS RIGHT. Both now count the same array, which is what ground rule 4 asks of a mirrored pair. */seniorAgesHere.filter(function(a){return a>=65}).length),az=azBase*RULES.arizona.rate;return {federal:federal,niit:niit,payroll:ssPayroll+medicare+seSocialSecurity+seMedicare,az:az,total:federal+niit+ssPayroll+medicare+seSocialSecurity+seMedicare+az,magi:measures.irmaa_magi,measures:measures,ssTaxable:ssTaxable,ordinaryTaxable:ordinaryTaxable,taxableGains:taxableGains,investmentIncome:investmentIncome,seTax:seSocialSecurity+seMedicare,seNetEarnings:seNetSelf+seNetSpouse,seSocialSecurity:seSocialSecurity,seMedicare:seMedicare,seDeductibleHalf:seDeductibleHalf,capitalLossDeduction:capitalLossDeduction,capitalLossCarryOut:capitalLossCarryOut}}

/* S5 task 9 (TAX_RULES_ENGINE_REFERENCE_2026.md section 7.3): a source's effective marginal tax rate, found by recomputing
   the whole modelled return, never by adding bracket rates. estimateTaxes() is that return: ordinary and capital-gains tax
   with stacking, taxable Social Security, the senior deduction and its phaseout, NIIT, payroll and self-employment tax,
   and Arizona. A bracket sum sees only the bracket.
     base    {ordinaryIncome, capitalGains, ssBenefit, wages, qualifiedDividends, spouseWages, selfSeProfit, spouseSeProfit}
     source  "ordinary" (a pre-tax withdrawal or conversion), "capitalGains" or "qualifiedDividends"
     delta   $100 unless given: float noise stays far below a basis point at that size, and the step stays inside any
             transaction the engine plans, so it does not cross an unrelated one
   The rate above, (T(base + delta) - T(base)) / delta, and the rate below, (T(base) - T(base - delta)) / delta, are
   reported separately, because at a threshold they differ; below is null when the source holds less than delta. IRMAA
   is not in it: it is charged two years later on a lookback, not on this year's return. runPlan() does not call this.
   S5R-05 (the 2026-09-16 external audit's fifth finding): the source was looked up in a plain object, so an inherited name such
   as "toString" resolved to a function, passed, and priced at a rate of 0; and a step was taken whenever `delta > 0`, so
   the string "100" was concatenated onto the income and Infinity returned NaN. A source is now one of the three own
   names, and a step, when given, is a positive finite number; anything else throws, as an unknown source did.
   The same audit asked that malformed base data not be read as zero (decided by the owner on 2026-09-16, answer 2 (A) of the
   fourth set): the base is a record, and each amount it carries is a finite number; an absent or undefined key is zero.
   A numeric string, NaN, an infinity, null, a Boolean or an object throws, where `Number(x)||0` priced it silently. */
function effectiveMarginalRate(p,age,base,source,delta){var slots={ordinary:"ordinaryIncome",capitalGains:"capitalGains",qualifiedDividends:"qualifiedDividends"},slot=typeof source==="string"&&Object.prototype.hasOwnProperty.call(slots,source)?slots[source]:null;if(!slot)throw new Error("effectiveMarginalRate: unknown source "+String(source));if(delta!==undefined&&!(typeof delta==="number"&&Number.isFinite(delta)&&delta>0))throw new Error("effectiveMarginalRate: the step must be a positive finite number of dollars, not "+String(delta));if(base!==undefined&&base!==null&&(typeof base!=="object"||Array.isArray(base)))throw new Error("effectiveMarginalRate: the base must be a record of amounts, not "+String(base));var d=delta===undefined?100:delta,b=base||{},amount=function(k){return Object.prototype.hasOwnProperty.call(b,k)&&b[k]!==undefined?b[k]:0};["ordinaryIncome","capitalGains","ssBenefit","wages","qualifiedDividends","spouseWages","selfSeProfit","spouseSeProfit"].forEach(function(k){if(!Object.prototype.hasOwnProperty.call(b,k)||b[k]===undefined)return;var x=b[k];if(!(typeof x==="number"&&Number.isFinite(x)))throw new Error("effectiveMarginalRate: base."+k+" must be a finite number of dollars, not "+String(x))});var total=function(shift){var v=function(k){return amount(k)+(k===slot?shift:0)};return estimateTaxes(p,age,v("ordinaryIncome"),v("capitalGains"),v("ssBenefit"),v("wages"),v("qualifiedDividends"),v("spouseWages"),v("selfSeProfit"),v("spouseSeProfit")).total},t0=total(0);return {source:source,delta:d,above:(total(d)-t0)/d,below:amount(slot)>=d?(t0-total(-d))/d:null}}

// ---------------------------------------------------------------------------
// R2-T01 (RETIREMENT_ENGINE_ROUND2_AUDIT_CLAUDE_QUEUE_2026-09-08.md finding
// R2-001; exact equations in CLAUDE_CODE_FIX_HANDOVER_TAX_FUNDING_AND_ROUND2_
// 2026-09-08.md section 4): the live tax-funding cascade in simulatePlan()
// prices an entire multi-account class sale using ONE assumed marginal rate
// (taxWithdrawalGrossRate(), deleted in S5, evaluated once against the state BEFORE the
// sale) and then reduces taxNeed by that same assumed rate instead of the
// tax the sale actually creates -- so a sale that crosses an account's basis
// boundary, a tax bracket, an SS-taxability band, the standard/senior
// deduction, or the NIIT threshold silently under- or over-funds the real
// bill (see the audit's two direct counterexamples: a $100-basis account
// followed by a 0%-basis account leaves only $842.50 of a $1,000 target
// funded; a Social Security household's 12.5% flat estimate leaves
// $57.142857 unfunded of a $1,000 target).
//
// quoteTaxFunding() below computes the EXACT gross sale required by walking
// forward through the finite set of breakpoints estimateTaxes() itself can
// cross for one account/class segment at a time (the same account order
// withdrawFromClass() already uses), solving `availableCash + grossSale =
// max(0,estimateTaxes(...).total - Tbase) + penalties` exactly on each
// affine piece. The ordinary/capital-gains tax, NIIT, and Arizona pieces are
// produced by calling the real functions above at a specific point. The SS
// taxability (S) and senior-deduction pieces are NOT calls to
// taxableSocialSecurity()/seniorDeduction() -- they are hand-mirrored
// formulas below that must independently reproduce those functions' own
// "<=" comparisons and clamp order. A wrong breakpoint location there is a
// real correctness risk, not a harmless one: the first two regression tests
// below this block ("was $25.02 short" / "was $53.66 over") are exactly two
// cases where a mirrored comparison disagreed with the real function and
// silently mispriced a sale before being fixed. What actually catches this
// class of bug is external verification, in two layers: this file's own
// `taxSegmentLocal's affine-piece contract` fuzz test compares every walk
// landing directly against estimateTaxes(), and quoteTaxFunding()'s
// verifyQuoteObligation() check (and simulatePlan()'s post-commit
// TAX_SETTLEMENT_MISMATCH check) independently recompute the obligation from
// the real estimateTaxes() before ever reporting "funded" -- a mirror
// divergence that reaches one of those checks is rejected, not silently
// accepted, but a divergence too small to trip a $0.01 tolerance could still
// slip through both. Getting a breakpoint's *location* slightly wrong (as
// opposed to its comparison direction) is comparatively cheap: it costs one
// extra walk step, since the next fresh evaluation still lands on the
// correct value -- which is why every helper below is generous about which
// breakpoints it lists, not because mispricing itself is impossible.
// ---------------------------------------------------------------------------

/* Mirrors max(0, value(x)) near x0, given value's own local slope: returns
   the clamped {value, slope} at x0 plus `dist`, the x-distance to where the
   clamp turns on or off (Infinity if value(x) never crosses zero going
   forward from x0). Reused for every max(0,...) in estimateTaxes(). */
function pwaMaxZero(value0,slope){
  if(value0>1e-6)return {value:value0,slope:slope,dist:(slope<-1e-12)?Math.max(0,-value0/slope):Infinity};
  if(value0<-1e-6)return {value:0,slope:0,dist:(slope>1e-12)?(-value0/slope):Infinity};
  return {value:Math.max(0,value0),slope:slope>0?slope:0,dist:Infinity};
}
/* Mirrors min(A(x),B(x)) near x0 given both sides' current value/slope:
   returns the winning side's {value,slope} plus `dist`, the x-distance to
   where the two sides cross (Infinity if parallel or the crossing is behind
   x0). Reused for every min(...) in estimateTaxes() and taxableSocialSecurity(). */
function pwaMin(vA,sA,vB,sB){
  var ds=sA-sB,dist=Math.abs(ds)<1e-12?Infinity:(vB-vA)/ds;
  if(!(dist>1e-9))dist=Infinity;
  /* When A and B are tied at x0 (routine here, since the walker in
     solveSegmentFunding lands exactly on the previous breakpoint), the
     correct winner going FORWARD is whichever has the smaller slope, not
     an arbitrary side -- picking by "vA<=vB" alone stuck NIIT's min(...)
     on the wrong side after a landing, inventing tax that should still be
     zero (see tests/audit-r2-tax-quote.test.js's mixed-basis fixture). */
  var aWins=Math.abs(vA-vB)<=1e-9?sA<=sB:vA<vB;
  return aWins?{value:vA,slope:sA,dist:dist}:{value:vB,slope:sB,dist:dist};
}
function finiteBracketCaps(brackets){var caps=[];for(var i=0;i<brackets.length;i++)if(brackets[i][0]!==null)caps.push(brackets[i][0]);return caps}
function nearestCapAbove(caps,v){var best=Infinity;for(var i=0;i<caps.length;i++)if(caps[i]>v+1e-9&&caps[i]<best)best=caps[i];return best}
/* S5AA R18 round (workstream B): a sale can now LOWER income -- a taxable piece whose basis exceeds its value realises a
   loss, and a loss offsets ordinary income -- so a breakpoint can be crossed going down. Every distance below was written
   for income that only rose with the sale (the gain fraction was clamped to 0..1), and a quote walking down through the
   10%/12% boundary settled 90 cents short. MEASURED: a widow at 77 whose imputed-yield basis exceeded a flat account's
   value; QUOTE_SETTLEMENT_UNVERIFIED at 78 and 79. */
function nearestCapBelow(caps,v){var best=-Infinity;for(var i=0;i<caps.length;i++)if(caps[i]<v-1e-9&&caps[i]>best)best=caps[i];return best}
/* The x-distance to the next breakpoint in whichever direction the measure is moving. */
function distanceToCap(caps,v,slope){if(slope>1e-12)return (nearestCapAbove(caps,v)-v)/slope;if(slope<-1e-12){var below=nearestCapBelow(caps,v);return below===-Infinity?Infinity:(v-below)/(-slope)}return Infinity}

/* The local affine piece of L(x) = max(0,estimateTaxes(...).total-Tbase)+
   penalties(x) at x=x0, for a segment whose gross withdrawal x increases
   ordinary income at rate ctx.rIncome per dollar and realized gains at rate
   ctx.rGains per dollar (exactly one nonzero for a real preTax/taxable
   account; both zero for roth/hsa, which is why those always solve in one
   step at slope 0 -- this deliberately reuses the live engine's existing
   preTax/taxable/roth/hsa withdrawal tax treatment, it does not add any).
   Returns {value, slope, dist}: L(x) = value + slope*(x-x0) is exact for
   x in [x0, x0+dist). */
function taxSegmentLocal(ctx,x0In){
  /* estimateTaxes()'s own bracket/threshold comparisons are all "<=", so a
     point sitting EXACTLY on a breakpoint (routine here: the walker in
     solveSegmentFunding always lands exactly on the previous breakpoint)
     still reports the OLD, lower piece's rate -- and a naive "next
     breakpoint strictly above x0" search then skips that same point too,
     so the walk would sail straight past the real transition using a
     stale slope. Evaluating a hair past x0 and extrapolating the affine
     piece back to x0 sidesteps this without weakening any comparison
     below to "<", which would silently disagree with the real functions
     this is meant to mirror. */
  var DELTA=1e-4,x0=x0In+DELTA;
  var filing=ctx.filing,rI=ctx.rIncome,rG=ctx.rGains;
  /* R18 (B1 (c)), as repaired in R19 (R18-01): the same netting as estimateTaxes() -- net = gains - carried loss; gain
     is max(0, net), plus the qualified dividends; a loss is deducted up to the limit WHATEVER the other income and comes
     off the ordinary side, which may go negative. With no loss and no carry this is exactly the max(0, gains + dividends)
     it replaces, because dividends are never negative. */
  var oi0=ctx.oi0+rI*x0,net0=ctx.cg0-Math.max(0,Number(ctx.carry)||0)+rG*x0,netGain=pwaMaxZero(net0,rG),lossAmt=pwaMaxZero(-net0,-rG),
      lossDed=pwaMin(lossAmt.value,lossAmt.slope,capitalLossLimit(),0);
  oi0-=lossDed.value;rI-=lossDed.slope;
  var ii0=netGain.value+ctx.qDiv,rII=netGain.slope,
      distII=Math.min(netGain.dist,lossAmt.dist,lossDed.dist);
  var oth0=oi0+ii0,rOth=rI+rII;
  var benefit=ctx.ssBenefit,base=filingEntry(RULES.federal.socialSecurityTaxation.base,filing),upper=filingEntry(RULES.federal.socialSecurityTaxation.upper,filing);
  var S0=0,rS=0,distS=Infinity;
  if(benefit>0){
    var combined0=oth0+benefit*.5;
    /* These two band tests must use exactly taxableSocialSecurity()'s own
       "<=" comparisons, with NO added tolerance. An epsilon here is not
       harmless slack: the DELTA nudge above only moves `combined` by
       rOth*DELTA, so any tolerance wider than that re-classifies the
       nudged point as still being in the PREVIOUS band -- and the matching
       distS then comes out NEGATIVE, which the `dist>1e-9?dist:Infinity`
       filter at the end of this function turns into Infinity, pinning the
       stale slope for the entire rest of the account instead of forcing a
       re-walk. With a 1e-6 tolerance that happened for any segment whose
       rOth <= 0.01, i.e. a taxable account with basisPct >= 99: a $150,000
       obligation quoted $25.02 short while still reporting "funded". */
    if(combined0<=base){
      distS=rOth>1e-12?(base-combined0)/rOth:Infinity;
    } else {
      var firstBand=Math.min(benefit*.5,(upper-base)*.5);
      if(combined0<=upper){
        var raw1v=(combined0-base)*.5,raw1s=.5*rOth,capped1=pwaMin(raw1v,raw1s,benefit*.5,0);
        S0=capped1.value;rS=capped1.slope;
        var distToUpper=rOth>1e-12?(upper-combined0)/rOth:rOth<-1e-12?(combined0-base)/(-rOth):Infinity;/* R18: or back down through the base */
        distS=Math.min(capped1.dist,distToUpper);
      } else {
        var raw2v=firstBand+(combined0-upper)*.85,raw2s=.85*rOth,capped2=pwaMin(raw2v,raw2s,benefit*.85,0);
        S0=capped2.value;rS=capped2.slope;distS=Math.min(capped2.dist,rOth<-1e-12?(combined0-upper)/(-rOth):Infinity);/* R18: or back down through the upper threshold */
      }
    }
  }
  /* S5 task 6: the named measures as value/slope pairs, mirroring estimateTaxes(). federal_agi is other income plus
     taxable Social Security; senior_deduction_magi and niit_magi equal it until an exclusion or AGI deduction exists,
     and each breakpoint below reads its own measure. */
  var federalAgi0=oth0+S0,rFederalAgi=rOth+rS,seniorMagi0=federalAgi0,rSeniorMagi=rFederalAgi,niitMagi0=federalAgi0,rNiitMagi=rFederalAgi;
  var seniorRules=RULES.federal.seniorDeduction,eligible=(ctx.seniorDeductionAges||ctx.seniorAges).filter(function(a){return a>=65}).length;
  var Dsenior0=0,rDsenior=0,distSeniorStart=Infinity,distSeniorZero=Infinity;
  if(eligible>0){
    /* FM-02 fix: the per-person clamp happens BEFORE multiplying by the
       number of eligible people, matching seniorDeduction()'s corrected
       form. Clamping the aggregate (the previous behaviour) both overstated
       a couple's deduction above the threshold and stretched their phaseout
       to double width. The zero-crossing distance is a per-person quantity
       and so is unchanged by the head count. */
    var start=filing==="mfj"?seniorRules.jointPhaseoutStart:seniorRules.singlePhaseoutStart;
    var over=pwaMaxZero(seniorMagi0-start,rSeniorMagi);
    distSeniorStart=over.dist;
    var seniorVal=seniorRules.perEligiblePerson-seniorRules.phaseoutRate*over.value,seniorSlope=-seniorRules.phaseoutRate*over.slope;
    var seniorClamp=pwaMaxZero(seniorVal,seniorSlope);
    Dsenior0=eligible*seniorClamp.value;rDsenior=eligible*seniorClamp.slope;distSeniorZero=seniorClamp.dist;
  }
  /* G16: the mirror moves in the SAME COMMIT as estimateTaxes() (ground rule 4), or the funding solver
     quotes against a smaller deduction than the estimator charges and every quote settles short. The 63(f)
     amount carries no phaseout, so it is a constant here: it shifts deduction0 and leaves rDeduction alone. */
  var deduction0=filingEntry(RULES.federal.standardDeduction,filing)+Dsenior0+additionalStandardDeduction(ctx.seniorAges,ctx.additionalFiling||filing),rDeduction=rDsenior;
  var obdClamp=pwaMaxZero(oi0+S0,rI+rS),obd0=obdClamp.value,rOBD=obdClamp.slope,distOBD=obdClamp.dist;
  var otClamp=pwaMaxZero(obd0-deduction0,rOBD-rDeduction),ot0=otClamp.value,rOT=otClamp.slope,distOT=otClamp.dist;
  /* remainingDeduction is its OWN max(0,...) in estimateTaxes(), so it gets
     its own clamp here. Deriving it by hand from ot0 instead (`ot0>1e-6 ? 0
     : ...`) applied a DIFFERENT threshold than the ot clamp just above, and
     at a landing exactly on the obd==deduction boundary the two disagreed:
     pwaMaxZero put ot on the rising side while the hand-rolled mirror still
     reported the deduction as unexhausted, giving remD a phantom negative
     slope that inflated taxableGains for the whole rest of the account.
     Reachable whenever (rOBD-rDeduction)*DELTA < 1e-6 -- i.e. a high-basis
     taxable account under an active senior-deduction phaseout. */
  var remDClamp=pwaMaxZero(deduction0-obd0,rDeduction-rOBD),remD0=remDClamp.value,rRemD=remDClamp.slope;
  /* R19 (R18-01): an ordinary side still negative after taxable Social Security comes off the preferential income, as in
     estimateTaxes(): min(0, oi + S) is its own piece, with its own breakpoint. */
  var obdNeg=pwaMin(oi0+S0,rI+rS,0,0);
  var tgClamp=pwaMaxZero(ii0+obdNeg.value-remD0,rII+obdNeg.slope-rRemD),tg0=tgClamp.value,rTG=tgClamp.slope,distTG=Math.min(tgClamp.dist,obdNeg.dist);
  var ordCaps=finiteBracketCaps(filingEntry(RULES.federal.ordinaryBrackets,filing)||RULES.federal.ordinaryBrackets.single);
  var cgCaps=finiteBracketCaps(filingEntry(RULES.federal.capitalGains,filing)||RULES.federal.capitalGains.single);
  var distOrdBracket=distanceToCap(ordCaps,ot0,rOT);
  var distCgLow=distanceToCap(cgCaps,ot0,rOT);
  var top0=ot0+tg0,rTop=rOT+rTG,distCgTop=distanceToCap(cgCaps,top0,rTop);
  var federal0=marginalTax(ot0,filing)+capitalGainsTax(tg0,ot0,filing);
  var federalSlope=marginalRateAt(ot0,filing)*rOT+(capitalGainsMarginalRateAt(top0,filing)*rTop-capitalGainsMarginalRateAt(ot0,filing)*rOT);
  /* S5AA R33 (SA32F-32): the mirror of estimateTaxes()'s worksheet line 25 -- the smaller of that (line 23) and the regular tax on
     all taxable income (line 24), with line 24's own bracket breakpoint and the crossing as breakpoints of the piece. */
  var line24=marginalTax(top0,filing),line24Slope=marginalRateAt(top0,filing)*rTop,distLine24=distanceToCap(ordCaps,top0,rTop),line25=pwaMin(federal0,federalSlope,line24,line24Slope);
  federal0=line25.value;federalSlope=line25.slope;
  var niitThreshold=filingEntry(RULES.federal.niit.threshold,filing),niitOver=pwaMaxZero(niitMagi0-niitThreshold,rNiitMagi);
  /* G17: the mirror moves in the SAME COMMIT as estimateTaxes() (ground rule 4). niiOther is dividends and
     income streams already fixed for the period, so a withdrawal does not change it: it shifts the base's
     VALUE and leaves its SLOPE alone. */
  /* R19 (R18-01): net investment income includes the deductible loss (Form 8960 line 5a), floored at zero, as in
     estimateTaxes(). */
  var niiPos=pwaMaxZero(ii0-lossDed.value+Math.max(0,Number(ctx.niiOther)||0),rII-lossDed.slope);
  var niitBase=pwaMin(niiPos.value,niiPos.slope,niitOver.value,niitOver.slope);
  var niit0=RULES.federal.niit.rate*niitBase.value,rNiit=RULES.federal.niit.rate*niitBase.slope;
  /* S5 task 8 (the owner's question 5, answer C): mirrors estimateTaxes()'s Arizona base. Arizona AGI is other income (federal AGI
     less taxable Social Security); less the basic standard deduction and $2,100 per person 65 or older, one clamp. */
  var azClamp=pwaMaxZero(oth0-(RULES.arizona.records.filter(function(r){return r.provision_id==="az_basic_standard_deduction"&&r.filing_status===filing})[0]||RULES.arizona.records.filter(function(r){return r.provision_id==="az_basic_standard_deduction"&&r.filing_status==="single"})[0]).value-RULES.arizona.records.filter(function(r){return r.provision_id==="az_age65_exemption"})[0].value*ctx.seniorAges.filter(function(a){return a>=65}).length,rOth);
  var az0=azClamp.value*RULES.arizona.rate,rAz=azClamp.slope*RULES.arizona.rate;
  var total0=federal0+niit0+ctx.payrollConst+az0,rTotal=federalSlope+rNiit+rAz;
  var clamped=pwaMaxZero(total0-ctx.Tbase,rTotal);
  var pen0=ctx.pen0+ctx.rPenalty*x0;
  var dist=Math.min(distII,distS,distSeniorStart,distSeniorZero,distOBD,distOT,remDClamp.dist,distTG,distOrdBracket,distCgLow,distCgTop,distLine24,line25.dist,niitOver.dist,niiPos.dist,niitBase.dist,azClamp.dist,clamped.dist);
  var slope=clamped.slope+ctx.rPenalty,valueAtEval=clamped.value+pen0;
  return {value:valueAtEval-slope*DELTA,slope:slope,dist:(dist>1e-9?dist:Infinity)+DELTA};
}

/* Walks a single account/class segment (gross withdrawal x in [0,room])
   forward through its finite breakpoints, solving availableCash+x = L(x)
   exactly on whichever affine piece contains the root -- finite traversal
   of formula boundaries, not an iterative guess-and-correct search (section
   4.4/4.5 of the tax-funding handover). */
function solveSegmentFunding(ctx,room,send0){
  if(room<=1e-9)return {funded:false,x:0,exhausted:true};
  var seg0=taxSegmentLocal(ctx,0);
  if(send0-seg0.value>=-1e-6)return {funded:true,x:0,finalL:seg0.value,retained:send0-seg0.value};
  var x0=0,guard=0;
  while(guard++<500){
    var seg=taxSegmentLocal(ctx,x0);
    var segEnd=Math.min(room,Number.isFinite(seg.dist)?x0+seg.dist:room+1);
    var denom=1-seg.slope;
    if(Math.abs(denom)<1e-9)return {error:"UNSTABLE_TAX_SLOPE",x:x0};
    var xCandidate=(seg.value-seg.slope*x0-send0)/denom;
    if(xCandidate>=x0-1e-6&&xCandidate<=segEnd+1e-6){
      var xFinal=Math.min(Math.max(xCandidate,x0),segEnd);
      var Lfinal=seg.value+seg.slope*(xFinal-x0);
      return {funded:true,x:xFinal,finalL:Lfinal,retained:(send0+xFinal)-Lfinal};
    }
    if(segEnd>=room-1e-9){
      var LatRoom=seg.value+seg.slope*(room-x0);
      return {funded:false,x:room,finalL:LatRoom,exhausted:true};
    }
    x0=segEnd;
  }
  return {error:"BREAKPOINT_WALK_EXCEEDED",x:x0};
}
/* Shares withdrawalComparator() with nextWithdrawAccount() and
   withdrawFromClass(), so the per-account order this quotes against IS the
   order the real withdrawal executes in -- previously three hand-kept copies
   of one sort, which is a guarantee only for as long as nobody edits one of
   them (Q22). The filters still differ deliberately: this one skips
   effectively-empty accounts because a quote should not price them. */
function orderedAccountsInClass(accounts,taxClass,p,priorReturn){
  return accounts.filter(function(a){return a.taxClass===taxClass&&a.balance>1e-9}).sort(withdrawalComparator(p,priorReturn));
}
/* R2V-002 external audit fix: recomputes the obligation from a COMPLETE
   quoted/committed journal using the real estimateTaxes (handover section
   4.5), shared by quoteTaxFunding's own "funded" verification and its final
   reconciliation below, so the two can never independently drift the way the
   old inline duplicate risked. estimateTaxes uses `age` to build the
   senior-deduction ages array AND, since S5AA task F-02 (Q88), to decide the
   filing status the row is taxed under, so the age has to be exact. It is
   read from taxCtx.rowAge, falling back to seniorAges[0] for a caller that
   predates the field: seniorAges[0] used to be this row's age and no longer
   always is -- it is -1 once the self has died, and re-deriving the status
   from -1 would tax a widowed household as a couple and report the
   settlement unverified. The fallback still catches a seniorAges array that
   has drifted from the plan it belongs to. Wages go in as 0 with payroll added back as the frozen
   constant, exactly as taxSegmentLocal does, since payroll cancels in
   T - Tbase. R2R-001 external requalification fix: this now genuinely
   re-checks rather than trusting the caller -- `total`/`obligation` come
   from `oi`/`cg`/`pen`, which are running totals accumulated across
   potentially many quoted pieces, not just the original taxCtx fields
   quoteTaxFunding() validates at entry; `finite` lets every call site
   verify before ever returning "funded" or "exhausted". */
/* Q88 (F-02): the ONE definition of the row age a tax context belongs to. It used to be readable as
   `seniorAges[0]`, and three places read it that way. That slot is -1 once the self has died, so each
   of them needs to be told the age instead of inferring it. The fallback keeps a caller that predates
   `rowAge` working, and still catches a seniorAges array that has drifted from its plan. */
function quoteRowAge(taxCtx){
  return Number.isFinite(Number(taxCtx.rowAge))?Number(taxCtx.rowAge):taxCtx.seniorAges[0];
}
function verifyQuoteObligation(p,taxCtx,oi,cg,pen){
  /* Q89 (F3, with G17): niiOther must be carried here too. This function INDEPENDENTLY recomputes the
     obligation the quote promised, so a base it does not know about makes it disagree with the estimator
     and the settlement is reported unverified -- which is exactly what happened to the corpus member
     seed:7, whose rental stream is net investment income under Form 8960 line 4a. */
  var total=estimateTaxes(p,quoteRowAge(taxCtx),oi,cg,taxCtx.ssBenefit,0,taxCtx.qualifiedDividends,0,0,0,taxCtx.niiOther,taxCtx.capitalLossCarryIn,taxCtx.rowSpan).total+taxCtx.payrollConst;
  var obligation=Math.max(0,total-taxCtx.Tbase)+pen;
  return {total:total,obligation:obligation,finite:Number.isFinite(total)&&Number.isFinite(obligation)};
}
/* R2R-001 external requalification fix: `undefined` is the one legitimate
   "not supplied" value (several tests and call sites omit an optional
   argument on purpose); NaN/Infinity/-Infinity are corrupted input, not
   omission, and must be rejected the same way a present-but-wrong-typed
   field is. */
function requireFiniteOrAbsent(v){return v===undefined||Number.isFinite(v)}
/* R2R-003 external requalification fix (ARCH-01): a standing, always-on
   check that the tax/RMD cash settlement's sources equal its uses --
   `rmdCashForTax + totalGross` (cash actually raised for this period's tax
   bill, from RMD surplus and any additional tax-driven sale) plus `taxNeed`
   (the genuine unfunded remainder, which folds into `shortfall`) must equal
   `actualObligation` (the real committed tax bill) plus `retainedRmdCash`
   (the genuine surplus deposited back). Provable directly from
   simulatePlan()'s own quote-status branch: when funded,
   `retainedRmdCash=surplus` and `taxNeed=0`, so the identity holds by the
   definition of `surplus=actualFunded-actualObligation`; when exhausted,
   `retainedRmdCash=0` and `taxNeed=-surplus=actualObligation-actualFunded`,
   so it holds there too. This is exactly the layer the R2V-001 defect lived
   in: that bug passed the pre-existing account roll-forward invariant
   (checkRowInvariants()'s RECONCILIATION_MISMATCH) with zero issues,
   because the missing cash was never attributed to ANY tracked flow --
   not retained, not counted as a shortfall, simply gone. Factored into its
   own function (rather than inlined in simulatePlan()) specifically so it
   is directly testable against a fabricated, deliberately inconsistent
   settlement record, without needing a full plan or a production-only
   failure seam. */
function verifyCashSettlement(rmdCashForTax,totalGross,taxNeed,actualObligation,retainedRmdCash){
  var sources=rmdCashForTax+totalGross+taxNeed,uses=actualObligation+retainedRmdCash,residual=sources-uses;
  return {consistent:Number.isFinite(residual)&&Math.abs(residual)<=.01,residual:residual};
}
/* R2R-003 round 2 external requalification fix (ARCH-01): the required
   COMMITTED cash-sources-versus-uses invariant, spanning the whole period's
   settlement rather than the tax slice alone. verifyCashSettlement() above
   was correctly judged insufficient on three counts: `taxNeed` is an
   unfunded obligation rather than cash, `retainedRmdCash` is the INTENDED
   deposit (so a failure inside retainExcessRmdCash() would still pass), and
   it had no inputs at all for spending sales, portfolio spending need, QCD
   cash, fallback cash, or the final shortfall.

     rmdGross + spendingSaleGross + taxSaleGross + fallbackDraw + finalShortfall
       ==
     portfolioCashNeed + qcdCashPaid + taxObligation + retainedDeposit

   This holds by composing simulatePlan()'s own assignments:
     (A) rmdGross = rmdUsable + qcdCashPaid            [rmdUsable=max(0,rmdGross-qcd)]
     (B) rmdUsable = (needAtStart - needAfterRmd) + rmdCashForTax
     (C) spendingSaleGross = needAfterRmd - needFinal  [sales loop]
     (D) rmdCashForTax + taxSaleGross + taxNeed = taxObligation + retainedRmdCash
     (E) needFinal + taxNeed = fallbackDraw + finalShortfall
   Substituting A-C and E into the left side collapses it to
   portfolioCashNeed + qcdCashPaid + (rmdCashForTax + taxSaleGross + taxNeed),
   and applying D leaves portfolioCashNeed + qcdCashPaid + taxObligation +
   retainedRmdCash. So the identity holds exactly IFF the deposit that
   actually committed equals the one intended -- which is precisely the gap
   the requalification asked to close, and why `retainedDeposit` must be
   measured as a real account-balance delta by the caller, never passed in
   as the intended amount.

   Kept as a separate function from verifyCashSettlement() (rather than
   replacing it) so both remain independently testable against fabricated
   inconsistent records, and so the narrower tax-layer check still fires
   first with its more specific meaning. */
/* FM-03: the identity now spans HOUSEHOLD cash, not portfolio sales alone.
   Outside income surplus is a genuine cash source that funds tax and
   retention without any asset being sold, so omitting it made a correct
   settlement look inconsistent. The audit asked for exactly this
   expansion; leaving it portfolio-only is what let FM-03 pass unnoticed. */
function verifyCommittedCashSettlement(r){
  var sources=r.rmdGross+r.spendingSaleGross+r.taxSaleGross+r.fallbackDraw+r.finalShortfall+(r.outsideSurplus||0),
      uses=r.portfolioCashNeed+r.qcdCashPaid+r.taxObligation+r.retainedDeposit+(r.surplusSpent||0),
      residual=sources-uses;
  return {consistent:Number.isFinite(residual)&&Math.abs(residual)<=.01,residual:residual,sources:sources,uses:uses};
}
/* R2R-001 round 2: the canonical "is this a real, usable number" test for
   quote inputs. Deliberately stricter than `Number.isFinite(Number(v))`:
   `Number(null)` is 0 and `Number("70")` is 70, so coercion would let a null
   or string basis silently become a plausible rate -- the exact silent-
   normalization pattern this contract exists to reject. The canonical
   Scenario contract (src/scenario-validator.js) already requires real
   numbers for these fields, so this agrees with it rather than inventing a
   looser engine-side rule. */
function isFiniteNumberValue(v){return typeof v==="number"&&Number.isFinite(v)}
/* R2R-001 round 2 external requalification fix: the entry guard previously
   validated only the six scalar taxCtx money fields, leaving two whole
   classes of quote input unchecked -- and because both map to FINITE
   outputs, no amount of terminal output checking could catch them:
     - `taxCtx.seniorAges` feeds estimateTaxes()'s senior-deduction age
       array. A NaN age silently fails the `>=65` eligibility filter (so the
       deduction silently disappears and the sale is quoted too large), an
       Infinity age silently passes it, and a MISSING array threw an
       uncaught TypeError out of estimateTaxes() rather than returning any
       status at all.
     - account `balance` (quote room) and taxable `basisPct` (gain rate).
       A NaN balance silently failed orderedAccountsInClass()'s `>1e-9`
       filter, making the account vanish from the quote entirely; an
       Infinity balance became unbounded room; and basisPct went through
       `Number(a.basisPct)||0` / `clamp(...)`, so NaN and a missing value
       both silently became 0% basis (fully taxable) and Infinity silently
       became 100% basis (fully untaxed).
   Every one of those produced an ordinary "funded" quote with a
   plausible-looking, wrong sale. All are now rejected up front with a
   controlled error. Note this validates the accounts as supplied, not only
   the ones the current `order` happens to reach: a malformed balance is a
   broken input whether or not this particular period would have sold it. */
/* R2R-001 round 2: the PUBLIC execution boundary half of the same repair.
   quoteTaxFunding()'s entry guard cannot see a malformed balance that never
   reaches it: simulatePlan() starts with clone(), which round-trips the plan
   through JSON and turns Infinity/NaN into null, and growAccounts() then
   multiplies that null into a legitimate-looking 0. A corrupted account
   balance was therefore silently normalized into a zeroed account and the
   run reported status "ok" -- no throw, no error, just a quietly wrong
   portfolio. Checking here, before the clone, is the requalification's second
   option -- a "proven canonical validator in every public execution path
   before quotation" -- but it lives in runPlan(), so it covers runPlan(),
   runScenario() and the generated Worker, NOT every public path: the exported
   simulatePlan() and the historical heat map (which calls simulatePlan()
   directly) bypass it. The universal reading is WITHDRAWN (external closeout
   CQ-6, 2026-09-12); the bypasses are carried as reproductions in
   tests/audit-cq6-gate-bypass-residuals.test.js. R2R-001's accepted repair
   scope was the quote-entry validator, which does run on those paths.
   Deliberately limited to the two fields the repair
   requires (balance, and basisPct where it actually drives a gain rate);
   everything else about Scenario shape remains scenario-validator.js's job. */
/* Q49: the contribution half of the same boundary, added for the same reason
   and deliberately narrower than the validator's half.

   accounts[].contribution had no explicit check on either side. It does not
   pass through clone() -- auditContributions() (:1264) computes from the
   ORIGINAL p.accounts, so the clone at :1240 never touches the value that
   reaches contribution arithmetic. What an invalid value did therefore
   depended on eligibility, not on any check: eligible, it surfaced
   downstream as TAX_QUOTE_NONFINITE_CONTEXT; ineligible, eligibility zeroed
   it and the run reported "ok". Containment and coincidence, not validation.

   ABSENCE IS NOT CHECKED HERE, deliberately -- and not by
   scenario-validator.js either. normalizeAccount() backfills
   `contribution: 0`, which is the supported missing-field default, and this
   gate's stated scope, above, is that "everything else about Scenario shape
   remains scenario-validator.js's job". Rejecting undefined here would also
   flip currently-passing runs (ineligible + absent reports "ok" today) into
   errors -- a baseline move this repair has no mandate to make. The cost,
   stated: a direct caller that bypasses normalisation and omits the field
   still gets only downstream containment. A present but non-finite
   contribution is a corrupt number reaching arithmetic, which is exactly
   what this gate exists for.

   Path scope, as for the balance check above: runPlan(), runScenario() and
   the Worker. The exported simulatePlan() still reaches downstream
   containment; the heat map's JSON clone turns a NaN contribution into a
   silent zero before simulatePlan() sees it (CQ-6 residual). */
/* S5AA R25 (R24F-04, ChatGPT's R24F audit; the owner 2026-09-25: refuse it, for all 14 fields): S5AA task 1.1's rule is that
   the engine refuses what the validator rejects. scenario-validator.js types these scalar fields as finite numbers when
   present (WRONG_TYPE), and nothing here read them: runPlan() coerced retirement.spending = true to $1 and "40000" to
   $40,000, and returned status "ok". profile.age was refused, but only later, by the symptom code
   TAX_QUOTE_NONFINITE_CONTEXT; it is refused here now, by name. The first field present and not a finite number is returned as its dotted path;
   absent is accepted, as the validator accepts it. The list is kept INSIDE the function because the app's Worker is
   assembled from named functions, and a top-level list would not travel with it. A parity test sweeps the validator's
   verdict for every numeric field, so the two lists cannot drift apart unnoticed. */
function nonNumberPlanValuePath(p){
  var FIELDS=[["profile","age"],["profile","retireAge"],["profile","endAge"],["assumptions","returnRate"],["assumptions","seed"],
    ["assumptions","volatility"],["employment","salary"],["retirement","spending"],["retirement","dividendYield"],
    ["retirement","dividendQualified"],["retirement","dividendGrowth"],["retirement","dividendStart"],
    ["retirement","ssClaim"],["retirement","spouseClaim"],["advanced","correlation"]];
  for(var i=0;i<FIELDS.length;i++){
    var section=p&&p[FIELDS[i][0]];
    if(!section||typeof section!=="object")continue;
    var v=section[FIELDS[i][1]];
    if(v!==undefined&&!isFiniteNumberValue(v))return FIELDS[i][0]+"."+FIELDS[i][1];
  }
  return null;
}
function nonFiniteScenarioInputCode(p){
  var accounts=p&&p.accounts;
  if(!Array.isArray(accounts))return null;
  for(var i=0;i<accounts.length;i++){
    var a=accounts[i];
    if(!a)continue;
    if(!isFiniteNumberValue(a.balance))return "NONFINITE_ACCOUNT";
    if(a.taxClass==="taxable"&&!isFiniteNumberValue(a.basisPct))return "NONFINITE_ACCOUNT";
    if(a.contribution!==undefined&&!isFiniteNumberValue(a.contribution))return "NONFINITE_CONTRIBUTION";
    /* S5 2j: a future change adjusts the planned contribution, and a dollar change
       adds its value with +, so a numeric string concatenates: "1000" and "500"
       become 1000500. A set change stores the string for a later dollar change to
       concatenate onto. The result is finite, so no check on the result catches it;
       the value is refused here by TYPE, before any arithmetic, exactly as the
       contribution above is. Present means not undefined. An element that is not a
       record is a separate question and is skipped here, as is a non-array list,
       which the list-shape gate refuses first.
       The SPRINT_QUESTIONS.md entry for string-typed contribution amounts is not
       cited by number while its status still reads open: closeout refuses an
       engine comment that cites an open question. */
    if(Array.isArray(a.futureChanges)){
      for(var j=0;j<a.futureChanges.length;j++){
        var change=a.futureChanges[j];
        if(change&&typeof change==="object"&&change.value!==undefined&&!isFiniteNumberValue(change.value))return "NONFINITE_CONTRIBUTION";
      }
    }
  }
  return null;
}
/* Q72: an other asset's value and a debt's balance reach a row's otherAssets
   and debtBalance through sum(), which adds each value as it is given. A
   numeric string concatenates -- 0 + "400000" is "0400000", a string where
   the result contract has a number -- and true adds as 1; null, NaN and
   Infinity came through as 0, so the holding silently left the projection.
   Every one of those returned status ok (measured 2026-09-14). The validator
   refuses all of them as WRONG_TYPE; a caller that had not validated got rows
   that look plausible and are wrong. Decided 2026-09-14 (the owner), answer (a):
   refused here by TYPE, before any arithmetic, as the contribution check above
   refuses its value. Present means not undefined, as in the validator. An
   element that is not a record is not claimed here. Path scope, like the gates
   around it: every route that runs the input gates. */
function nonFiniteHoldingInputCode(p){
  var adv=p&&p.advanced;
  if(!adv||typeof adv!=="object")return null;
  var assets=adv.otherAssets,debts=adv.debts,i;
  if(Array.isArray(assets))for(i=0;i<assets.length;i++){var asset=assets[i];if(asset&&typeof asset==="object"&&asset.value!==undefined&&!isFiniteNumberValue(asset.value))return "NONFINITE_OTHER_ASSET_VALUE"}
  if(Array.isArray(debts))for(i=0;i<debts.length;i++){var debt=debts[i];if(debt&&typeof debt==="object"){if(debt.balance!==undefined&&!isFiniteNumberValue(debt.balance))return "NONFINITE_DEBT_BALANCE";/* S5AA 1.1, Q100: a debt rate that is not a usable number was coerced by Number(d.rate)||0 to ZERO, so a debt   the validator refuses as WRONG_TYPE ran to completion charging NO INTEREST -- $50,518 of lifetime interest   became $0, with status ok. Balance was already gated here; rate was not, and rate is what makes a debt cost   anything. resetRate is gated with it: an adjustable debt reads it after the reset, so an unusable value there   is the same defect one branch later. */if(debt.rate!==undefined&&!isFiniteNumberValue(debt.rate))return "NONFINITE_DEBT_RATE";if(debt.rateType==="adjustable"&&debt.resetRate!==undefined&&!isFiniteNumberValue(debt.resetRate))return "NONFINITE_DEBT_RATE"}}
  return null;
}
/* Q69: otherIncomeFor() times an income against the spouse's age only when
   its owner is "spouse", so an income with no owner is silently timed against
   self -- a spouse's stream moves to self's age, and the plan still returns
   status ok. The validator refuses an absent owner as MISSING_FIELD, for every
   income type; a caller that had not validated got a re-timed projection.
   Decided 2026-09-14 (the owner), answer (a): refused here with a named code. Absent
   means undefined, as in the validator. An element that is not a record is
   refused by the check before this one. Path scope, like the gates around it:
   every route that runs the input gates. */
function missingIncomeOwnerCode(p){
  var r=p&&p.retirement,incomes=r&&typeof r==="object"?r.otherIncomes:null;
  if(!Array.isArray(incomes))return null;
  for(var i=0;i<incomes.length;i++){var income=incomes[i];if(income&&typeof income==="object"&&income.owner===undefined)return "MISSING_INCOME_OWNER"}
  return null;
}
/* S5AA 1.1, Q100: Q69 refused an ABSENT owner and stopped there, because the validator's word for absent
   is undefined. But the validator also refuses a PRESENT owner outside its enum -- owner: null and
   owner: "partner" are both ERROR UNRECOGNIZED_VALUE -- and the engine accepted them, whereupon
   otherIncomeFor() timed the stream against SELF, because only the literal "spouse" selects the spouse's age.
   Measured at 14b7095: a $30,000 spouse pension with owner null was booked ten years early.

   That is the same defect Q69 decided, reached through a different value, so it is refused here rather than
   widened into Q69's code: ABSENT and UNRECOGNIZED are different inputs and a caller deserves to be told which
   one it sent. The owner list is the validator's own
   (NESTED_RECORD_SPECS.otherIncomes.enums.owner = ['self','spouse','household']); if that list grows, the
   keeper test in tests/audit-s5aa-input-gate.test.js fails until this one does too. */
function unrecognizedIncomeOwnerCode(p){
  var r=p&&p.retirement,incomes=r&&typeof r==="object"?r.otherIncomes:null;
  if(!Array.isArray(incomes))return null;
  for(var i=0;i<incomes.length;i++){var income=incomes[i];
    if(income&&typeof income==="object"&&income.owner!==undefined
       &&income.owner!=="self"&&income.owner!=="spouse"&&income.owner!=="household")return "UNRECOGNIZED_INCOME_OWNER"}
  return null;
}
/* S5AA 1.1, Q100: the gate validated the CONTENTS of retirement.stages, retirement.expenses and
   retirement.otherIncomes whenever p.retirement happened to be an object, and never required the section to
   exist at all. strategySpending() then read p.retirement.withdrawalRate and threw a TypeError naming an
   internal symptom, out of every public entry point, against RESULT_CONTRACT.md section 3's promise that every
   public path returns the invalid-result shape.

   The five sections are the validator's own required list (requireSection(c,plan,...) for profile, employment,
   assumptions, retirement, advanced), and it refuses both an absent section (MISSING_SECTION) and one that is
   not a plain object (WRONG_TYPE). An array is not a plain object: p.retirement = [] has no withdrawalRate
   either. */
function missingScenarioSectionCode(p){
  if(!p||typeof p!=="object")return "MISSING_SCENARIO_SECTION";
  var SECTIONS=["profile","employment","assumptions","retirement","advanced"];
  for(var i=0;i<SECTIONS.length;i++){var section=p[SECTIONS[i]];
    if(section===null||section===undefined||typeof section!=="object"||Array.isArray(section))return "MISSING_SCENARIO_SECTION"}
  return null;
}
/* S5AA 1.1, Q100: aggregateMonteCarloRuns() reads runs[0].rows, so a run count that produces no paths threw
   a TypeError out of the public boundary. The engine gate never looked at assumptions.runs at all; the validator
   always has (an integer >= 1).

   THE CEILING IS NOT INVENTED. The shipped page clamps its own control with clamp(...,100,10000), so 10,000 is
   the largest count the product itself produces. It matters that this is refused HERE, in the gate, rather than
   discovered later: runs: 1e6 does not fail fast, it allocates until V8 dies, and Infinity does not terminate at
   all, because the loop is for(i=0;i<runs;i++). An oversized job has to be turned away before the first
   allocation, not after the last one.

   An ABSENT runs is not claimed: the simple and historical methods do not read it, and the validator only checks
   it when it is present. */
function invalidRunCountCode(p){
  /* The ceiling is INSIDE this function on purpose. buildWorkerSource() serializes a list of named functions and
     a handful of JSON constants; a top-level `var` in engine.js does not exist inside the Worker at all. Declared
     as a module-level constant, this one threw a ReferenceError there, which the gate's own try/catch converted
     into SCENARIO_UNREADABLE_INPUT for EVERY plan the Worker ran -- a far worse defect than the one being
     repaired, and invisible from the main thread. The Worker is a second build system, and anything it needs must
     travel INSIDE something that is serialized. (Deliberately not citing the earlier worker-dependency questions by
     id here: tools/requirements-register.js harvests every audit id an engine comment names, so a rhetorical
     comparison would register as three requirements this function does not implement.) */
  var MAX_RUNS=10000;
  var a=p&&p.assumptions,runs=a&&typeof a==="object"?a.runs:undefined;
  if(runs===undefined)return null;
  if(typeof runs!=="number"||!Number.isInteger(runs)||runs<1||runs>MAX_RUNS)return "INVALID_RUN_COUNT";
  return null;
}
/* Q68: the validator only warns about a filing status outside its list
   (INVALID_ENUM), so an imported plan reached the engine with one: a
   prototype name threw, and any other unknown value failed later as
   TAX_QUOTE_NONFINITE_CONTEXT, which names a symptom, not the input. Decided
   2026-09-14 (the owner), answer (c): a present filing status that the tax tables
   do not define is refused here by name. Present means not undefined; an
   absent filing status is not claimed by this check. Path scope, like the
   gates around it: every route that runs the input gates. */
function unknownFilingStatusCode(p){
  var profile=p&&p.profile,filing=profile&&typeof profile==="object"?profile.filing:undefined;
  if(filing===undefined)return null;
  return typeof filing==="string"&&filingEntry(RULES.federal.ordinaryBrackets,filing)!==undefined?null:"UNKNOWN_FILING_STATUS";
}
/* S5AA R9 round, DeepSeek audit finding 2e/02: a PRESENT projection method the engine does not run is refused. Every
   branch reads method === "monteCarlo" or === "historical", so any other value -- "montecarlo", "Monte Carlo" -- fell
   through to one deterministic path, reported under the misspelt mode, and the validator only warns. Refused as the boundary
   already refuses an unknown filing status; an absent method keeps its existing default. */
function unknownMethodCode(p){
  var a=p&&p.assumptions,method=a&&typeof a==="object"?a.method:undefined;
  if(method===undefined)return null;
  return method==="simple"||method==="historical"||method==="monteCarlo"?null:"UNKNOWN_METHOD";
}
/* S5AA, after the R9 round (fifth internal audit, finding 3; the owner's decision of 2026-09-22, "refuse"): a plan in which
   nobody it models is alive at the starting age is refused. Decision 8's cut stops the projection at the first row opening
   with nobody alive, and for such a plan that is the opening itself: it returned "ok", the opening balances and no
   shortfall -- a 100% success rate over no projected years. "Alive" is householdSurvivorship() at the starting age, the
   reading the cut uses, so a lifespan EQUAL to the starting age (a death inside the first row) and a couple with one
   survivor are projected as before. */
/* S5AA R11 round, external audit of 02b921a (R10-07): WHERE THE PROJECTION STOPS, as one function. Decision 8 cuts
   the rows at the first opening with nobody alive; the row loop computed that inline, and a disclosure outside the loop
   had no way to ask. Returns that opening age, or null where the horizon ends first (no cut). The boundaries are the
   loop's own: whole ages from the first one after the start, plus a fractional horizon. */
function lastDeathCutAge(p){
  var profile=(p&&p.profile)||{},start=Number(profile.age),end=Number(profile.endAge);
  if(!Number.isFinite(start)||!Number.isFinite(end))return null;
  var openings=[start];
  for(var boundary=Math.floor(start)+1;boundary<=Math.floor(end);boundary++)openings.push(boundary);
  if(end%1!==0&&openings[openings.length-1]!==end)openings.push(end);
  for(var i=0;i<openings.length-1;i++){
    var alive=householdSurvivorship(p,openings[i]);
    if(!alive.selfAlive&&!alive.spouseAlive)return openings[i];
  }
  return null;
}
function nobodyAliveAtStartCode(p){
  var profile=p&&p.profile;
  if(!profile||typeof profile!=="object"||typeof profile.age!=="number"||!Number.isFinite(profile.age))return null;
  var alive=householdSurvivorship(p,profile.age);
  return alive.selfAlive||alive.spouseAlive?null:"NOBODY_ALIVE_AT_START";
}
/* Q48: the one input class the finiteness gate above cannot see, because it
   fails INSIDE clone() rather than after it.

   simulatePlan() opens with clone(p.accounts), clone(p.advanced.otherAssets)
   and clone(p.advanced.debts), and clone() is JSON.parse(JSON.stringify(o)).
   JSON.stringify THROWS on a circular reference, on a BigInt, and whenever a
   value's own toJSON throws -- and that exception escaped runPlan() uncaught,
   defeating the standard nonFiniteScenarioInputCode() sets for itself: "the
   check has to live where every execution path passes, before clone()".
   Measured on all three arrays. The toJSON case throws Error, not TypeError,
   so the catch below is deliberately not narrowed to TypeError.

   Scoped to EXACTLY clone()'s three inputs. A cycle elsewhere in the plan
   (on profile, say) is never cloned and runs to "ok" today; stringifying the
   whole plan would reject it, turning a working run into an error. For
   ordinary data, JSON.stringify throws exactly when clone() would.

   BC-02 (external closeout verdict 2026-09-13; repaired in S5 block 2m):
   "this cannot reject a plan clone() accepts" was false for callbacks. This
   gate serialized the input and discarded the bytes, then simulatePlan()'s
   clone() serialized it again, so a toJSON callback ran twice. One that
   succeeds once and throws on its next call returned "ok" on engine
   e3f008ab... and threw uncaught on 34b2ab9a....
   The owner's policy (S5 2m.1): serialize ONCE under the error boundary and reuse
   it. The gate keeps the JSON text it produced for each object-valued part
   (a function counts: JSON.stringify consults its toJSON too), runPlan()
   passes that text to simulatePlan(), and simulatePlan() parses it where
   it would have called clone(). clone(x) is JSON.parse(JSON.stringify(x)),
   so every value and every exception is what clone() gave; the callback
   just runs once. The parse stays OUTSIDE the boundary: a part whose text
   is undefined still throws from JSON.parse exactly where clone() threw,
   because that is Q55's question, not a serialization failure. Primitive,
   null and missing parts carry no callback and keep simulatePlan()'s own
   expression, including its ||[] fallback. Monte Carlo parses once per
   run, as it cloned once per run. Raw readers of p (auditContributions(),
   debtTotal()) are untouched. No input accepted before is refused now.

   A missing or non-array field is NOT claimed here. That is Q55's
   array-shape question, which has its own witnesses and its own open
   decision; absorbing it into this gate would close it silently.

   Not reachable from JSON or the live UI: JSON cannot encode a cycle or a
   BigInt. Direct programmatic construction only.

   Path scope: runPlan(), runScenario() and the Worker. The exported
   simulatePlan() and the heat map still throw from clone() on these inputs
   (CQ-6 residual). */
function nonSerializableScenarioInputCode(p,serialized){
  if(!p)return null;
  var adv=p.advanced,parts=[p.accounts,adv&&adv.otherAssets,adv&&adv.debts];
  for(var i=0;i<parts.length;i++){
    if(parts[i]===undefined||parts[i]===null)continue;
    /* S5R-01: the simulation and, since the execution snapshot, every reader see this text. JSON writes NaN and
       +-Infinity as null, so a non-finite number the named checks above do not cover (an account's annualChange,
       a debt's rate, or anything a hook returns) would become a silent null for every reader. The replacer sees each
       value after any toJSON hook has run, in the same single pass, so nothing is read twice; a non-finite number is
       refused by name. The named checks keep their own codes: they run first. */
    var text,nonFinite=false;
    try{text=JSON.stringify(parts[i],function(key,value){if((typeof value==="number"||value instanceof Number)&&!Number.isFinite(Number(value)))nonFinite=true;return value})}catch(e){return "NONSERIALIZABLE_INPUT"}
    if(nonFinite)return "NONFINITE_LIST_VALUE";
    if(serialized&&(typeof parts[i]==="object"||typeof parts[i]==="function"))serialized[i]={text:text};
  }
  return null;
}
/* Q53: the plan's boolean flags were read by truthiness, so the string
   "false" switched a feature ON. Decided 2026-09-13 (the owner): a present value
   that is not a boolean is refused, never coerced; a truly absent flag takes
   its documented default; an explicit false is preserved.

   Which fields are flags, their defaults and who reads them come from ONE
   definition, src/boolean-flag-contract.json, written in S4 2b.2e
   (BOOLEAN_FLAG_CONTRACT.md). In Node the declaration below reads that file as
   data, not as a module, which is why capture declares it as a data input.
   build.js replaces the read with the file's JSON for the page, and the app
   shell serializes the parsed contract into the Worker. Nothing here repeats
   the flag list. */
var BOOLEAN_FLAG_CONTRACT=JSON.parse(require("fs").readFileSync(require("path").join(__dirname,"boolean-flag-contract.json"),"utf8"));

/* Every place one contract path, such as "advanced.debts[].includePayment",
   lands in a plan: the object that holds the flag, the flag's key, the steps
   from the plan to that object, and the indexed path a refusal names. A
   missing container, or a list element that is not a record, holds nothing:
   the list-shape gate runs first, and a non-record element is a separate
   question. */
function booleanFlagHolders(p,flagPath){
  var parts=flagPath.split("."),frontier=[{node:p,at:"",steps:[]}];
  for(var i=0;i<parts.length-1;i++){
    var seg=parts[i],next=[];
    for(var j=0;j<frontier.length;j++){
      var from=frontier[j];
      if(!from.node||typeof from.node!=="object")continue;
      if(seg.slice(-2)==="[]"){
        var key=seg.slice(0,-2),list=from.node[key];
        if(!Array.isArray(list))continue;
        for(var k=0;k<list.length;k++)next.push({node:list[k],at:(from.at?from.at+".":"")+key+"["+k+"]",steps:from.steps.concat([key,k])});
      }else{
        next.push({node:from.node[seg],at:(from.at?from.at+".":"")+seg,steps:from.steps.concat([seg])});
      }
    }
    frontier=next;
  }
  var leaf=parts[parts.length-1],out=[];
  for(var m=0;m<frontier.length;m++){
    var place=frontier[m];
    if(place.node&&typeof place.node==="object")out.push({holder:place.node,key:leaf,steps:place.steps,path:(place.at?place.at+".":"")+leaf});
  }
  return out;
}

/* S5 2l.1, the engine layer of the contract: the indexed path of the first
   flag the engine reads whose present value is not a boolean, or null. A flag
   with its own refusal code keeps its own gate (cashHolding, in
   accountContractCode()). Present means not undefined, the way a JSON copy
   sees it; null is present, and refused. */
function nonBooleanFlagPath(p){
  var flags=BOOLEAN_FLAG_CONTRACT.flags;
  for(var i=0;i<flags.length;i++){
    if(flags[i].reader!=="engine"||flags[i].refusalCode)continue;
    var holders=booleanFlagHolders(p,flags[i].path);
    for(var j=0;j<holders.length;j++){
      var value=holders[j].holder[holders[j].key];
      if(value!==undefined&&typeof value!=="boolean")return holders[j].path;
    }
  }
  return null;
}

/* S5 2l.2: a truly absent engine-read flag takes its documented default. The
   engine already reads an absent flag as false, which is the default for all
   but five, so only a default that resolves to true is written. The caller's
   plan is never changed, and a plan with nothing to fill is returned as it is.

   Q80 (the external S5 audit's first finding): the fill used to copy the
   plan, its lists and their records with Object.assign() and .slice() BEFORE
   the serialize-once check. Copying that way evaluates every enumerable getter
   outside the check's try, and a sliced list loses its own toJSON, so whenever
   a default had to be filled a supported serialization hook was skipped, or an
   accessor's exception escaped runPlan(). The gate now serializes first, and:
   - a flag held in a serialized list (accounts, other assets, debts) is filled
     in the parsed text the simulation reads -- plain JSON, holding no hook and
     no accessor -- and that text is rewritten;
   - a flag held elsewhere is filled in copies made by copyOwnRecord(), which
     reads no property.
   Called without serialized text, every container is copied that way. */
function withDocumentedFlagDefaults(p,serialized){
  var flags=BOOLEAN_FLAG_CONTRACT.flags,LISTS=[["accounts"],["advanced","otherAssets"],["advanced","debts"]];
  var parsed=[],dirty=[],view={advanced:{}},planFills=[];
  if(serialized){
    for(var li=0;li<LISTS.length;li++){
      var entry=serialized[li];
      if(!entry||typeof entry.text!=="string")continue;
      parsed[li]=JSON.parse(entry.text);
      if(LISTS[li].length===1)view[LISTS[li][0]]=parsed[li];else view.advanced[LISTS[li][1]]=parsed[li];
    }
  }
  for(var i=0;i<flags.length;i++){
    var d=flags[i].default;
    if(flags[i].reader!=="engine"||d===false)continue;
    var list=-1;
    for(var k=0;k<LISTS.length;k++)if(flags[i].path.indexOf(LISTS[k].join(".")+"[].")===0)list=k;
    var inText=Boolean(serialized)&&list>=0;
    var holders=booleanFlagHolders(inText?view:p,flags[i].path);
    for(var j=0;j<holders.length;j++){
      var h=holders[j];
      if(h.holder[h.key]!==undefined)continue;
      if(!(d===true||(d&&typeof d==="object"&&Array.isArray(d.trueFor)&&d.trueFor.indexOf(h.holder[d.dependsOn])>=0)))continue;
      if(inText){h.holder[h.key]=true;dirty[list]=true}else planFills.push(h);
    }
  }
  for(var t=0;t<LISTS.length;t++)if(dirty[t])serialized[t].text=JSON.stringify(parsed[t]);
  if(!planFills.length)return p;
  var root=copyOwnRecord(p),made={};
  for(var n=0;n<planFills.length;n++){
    var node=root,at="";
    for(var s=0;s<planFills[n].steps.length;s++){
      var step=planFills[n].steps[s];
      at+="/"+step;
      if(!made[at]){Object.defineProperty(node,step,{value:copyOwnRecord(node[step]),writable:true,enumerable:true,configurable:true});made[at]=true}
      node=node[step];
    }
    Object.defineProperty(node,planFills[n].key,{value:true,writable:true,enumerable:true,configurable:true});
  }
  return root;
}
/* Q80: a shallow copy that reads no property. It copies each own property's
   descriptor -- an accessor stays an accessor, so its getter is not called, and
   a list keeps its own properties, such as a toJSON -- but makes every copied
   property configurable and every data property writable, so a frozen plan's
   copy can still be written, as Object.assign()'s copy could. */
function copyOwnRecord(o){
  var isList=Array.isArray(o),out=isList?[]:Object.create(Object.getPrototypeOf(o)),keys=Reflect.ownKeys(o);
  for(var i=0;i<keys.length;i++){
    if(isList&&keys[i]==="length")continue;
    var desc=Object.getOwnPropertyDescriptor(o,keys[i]);
    desc.configurable=true;
    if("value" in desc)desc.writable=true;
    Object.defineProperty(out,keys[i],desc);
  }
  if(isList)out.length=o.length;
  return out;
}

/* Q55: a list field that is present but not a list crashed runPlan() uncaught.
   The engine reads each with (x||[]).forEach or .reduce, which absorbs null and
   undefined but not a truthy non-array: {} survives the fallback and has no
   array methods. The validator already refuses these; a caller that had not
   validated got a TypeError, not a named refusal. Decided 2026-09-13 (the owner):
   reject with the invalid-result contract, never normalize to [].

   The sites were enumerated from the engine by behaviour, not taken from
   Q55's list of eight. At 60a874e every path of a validator-clean plan was set
   to {}, "x", 5 and true, and only these nine list sites threw: the seven
   top-level lists, each account's futureChanges, and manualOrder (a
   comma-separated list read with split()). Present means not undefined and not
   null; the list fallbacks absorb those two, exactly as before. A string
   manualOrder is not refused here, because its tokens are the validator's to
   check.

   Deliberately not claimed: an absent list; a list whose elements are not
   records, which is a separate question; and an absent or null manualOrder
   under a manual withdrawal order, a gap the validator's own comment records.

   A separate gate from the serialization gate above, whose comment keeps this
   question out of it. Path scope, like the gates around it: runPlan(),
   runScenario() and the Worker. */
function nonArrayListInputCode(p){
  if(!p||typeof p!=="object")return null;
  var r=p.retirement,adv=p.advanced,lists=[p.accounts];
  if(r&&typeof r==="object")lists.push(r.stages,r.expenses,r.otherIncomes);
  if(adv&&typeof adv==="object")lists.push(adv.assetClasses,adv.otherAssets,adv.debts);
  for(var i=0;i<lists.length;i++){
    if(lists[i]!==undefined&&lists[i]!==null&&!Array.isArray(lists[i]))return "NON_ARRAY_LIST_FIELD";
  }
  if(Array.isArray(p.accounts)){
    for(var j=0;j<p.accounts.length;j++){
      var a=p.accounts[j];
      if(a&&typeof a==="object"&&a.futureChanges!==undefined&&a.futureChanges!==null&&!Array.isArray(a.futureChanges))return "NON_ARRAY_LIST_FIELD";
    }
  }
  if(r&&typeof r==="object"&&r.manualOrder!==undefined&&r.manualOrder!==null&&typeof r.manualOrder!=="string")return "NON_ARRAY_LIST_FIELD";
  return null;
}
/* Q71: a list of the right type can hold an element of the wrong one. A null
   element threw in all eight lists the gate above reads -- reading a field of
   null -- and a number, string or boolean threw in other assets and debts,
   where the simulation writes a field onto each element; elsewhere a primitive
   ran ok, was refused by an unrelated name, or failed downstream. The validator
   refuses every one as WRONG_TYPE. Decided 2026-09-14 (the owner), answer (a): any
   element that is not a record is refused here, in every list, before anything
   reads it. A record is what the validator's isPlainObject() accepts: not null,
   an object, not an array. A separate check from nonArrayListInputCode(), which
   answers only whether a list is a list. Path scope, like the gates around it:
   every route that runs the input gates. */
function nonRecordListElementCode(p){
  if(!p||typeof p!=="object")return null;
  var r=p.retirement,adv=p.advanced,lists=[p.accounts],i,j;
  if(r&&typeof r==="object")lists.push(r.stages,r.expenses,r.otherIncomes);
  if(adv&&typeof adv==="object")lists.push(adv.assetClasses,adv.otherAssets,adv.debts);
  if(Array.isArray(p.accounts))for(i=0;i<p.accounts.length;i++){var a=p.accounts[i];if(a&&typeof a==="object"&&Array.isArray(a.futureChanges))lists.push(a.futureChanges)}
  for(i=0;i<lists.length;i++){
    if(!Array.isArray(lists[i]))continue;
    for(j=0;j<lists[i].length;j++){var v=lists[i][j];if(v===null||typeof v!=="object"||Array.isArray(v))return "NON_RECORD_LIST_ELEMENT"}
  }
  return null;
}
/* RB-01 + RB-02 at the PUBLIC EXECUTION BOUNDARY, the same place and for the
   same reason as nonFiniteScenarioInputCode() above.

   A validator that refuses an import does not gate a direct runPlan() call,
   and the audit is explicit that "a UI warning alone does not establish the
   solver's identity precondition". Both findings were reproduced through the
   generated Worker with status "ok", so the check has to live where every
   execution path passes, before clone() and before any cash moves.
   It lives in runPlan(), which reaches runPlan(), runScenario() and the
   Worker -- NOT the exported simulatePlan() or the historical heat map, where
   a duplicate id or an invalid cash holding is still accepted unflagged. The
   universal reading is withdrawn (CQ-6); the bypasses are carried as
   reproductions.

   Duplicate ids are rejected rather than migrated: an id referenced by a
   transfer cannot be disambiguated by array order without guessing, and
   merging or silently taking the first is what produced the defect. Decision
   register P11 records the accepted consequence -- plans carrying duplicates
   no longer run. */
function accountContractCode(p){
  var accounts=p&&p.accounts;
  if(!Array.isArray(accounts))return null;
  /* CL-01: a Set, NOT a plain object. This read `var seen={}` with
     `seen[a.id]=true`, and an id of "__proto__" defeated it -- that key is an
     inherited ACCESSOR on Object.prototype, so assigning to it runs a setter
     instead of creating an own property, and the second occurrence was never
     found. The engine then ran the plan the validator had correctly rejected,
     and the $25,910.90 false tax shortfall returned through the Worker.

     Note that "constructor" and "toString" did NOT defeat it: those are
     inherited DATA properties, which assignment shadows normally. Only the
     accessor slips through, which is exactly why testing a couple of
     "dangerous-looking" names would have missed it.

     The deeper fault was two implementations of one contract --
     validateAccountIdentity() already used a Map and was right. A Set here is
     own-property semantics by construction, with no key that means anything
     other than itself. */
  var seen=new Set();
  for(var i=0;i<accounts.length;i++){
    var a=accounts[i];
    if(!a)continue;
    if(typeof a.id==="string"&&a.id!==""){
      if(seen.has(a.id))return "DUPLICATE_ACCOUNT_ID";
      seen.add(a.id);
    }
    if(a.cashHolding!==undefined){
      if(typeof a.cashHolding!=="boolean")return "INVALID_CASH_HOLDING";
      if(a.cashHolding===true){
        if(a.taxClass!=="taxable")return "INVALID_CASH_HOLDING";
        if(isFiniteNumberValue(a.basisPct)&&Number(a.basisPct)!==100)return "INVALID_CASH_HOLDING";
      }
    }
  }
  return null;
}
function nonFiniteQuoteInputCode(taxCtx,accounts,availableCash){
  if(!isFiniteNumberValue(taxCtx.ordinaryIncome)||!isFiniteNumberValue(taxCtx.capitalGains)||!isFiniteNumberValue(taxCtx.qualifiedDividends)||!isFiniteNumberValue(taxCtx.ssBenefit)||!isFiniteNumberValue(taxCtx.Tbase)||!isFiniteNumberValue(taxCtx.payrollConst))return "NONFINITE_CONTEXT";
  /* Q89: absent is a legitimate zero, as for penalties, but a NON-FINITE niiOther would silently change the
     NIIT and therefore the quoted sale -- the same failure R2R-001 round 2 found for seniorAges. */
  if(!requireFiniteOrAbsent(availableCash)||!requireFiniteOrAbsent(taxCtx.penalties)||!requireFiniteOrAbsent(taxCtx.niiOther))return "NONFINITE_CONTEXT";
  if(!Array.isArray(taxCtx.seniorAges)||!taxCtx.seniorAges.length||taxCtx.seniorAges.some(function(a){return !isFiniteNumberValue(a)}))return "NONFINITE_CONTEXT";
  if(!Array.isArray(accounts))return "NONFINITE_ACCOUNT";
  for(var i=0;i<accounts.length;i++){
    var a=accounts[i];
    if(!a||!isFiniteNumberValue(a.balance))return "NONFINITE_ACCOUNT";
    if(a.taxClass==="taxable"&&!isFiniteNumberValue(a.basisPct))return "NONFINITE_ACCOUNT";
  }
  return null;
}
/* Top-level quotation (handover section 4.1/4.4): given the frozen period
   tax context and the SAME withdrawal `order` and `accounts` the live
   engine already uses for spending, solves availableCash + grossSales =
   max(0,T-Tbase)+penalties exactly, on detached balances (nothing here
   mutates `accounts`). taxCtx = {ordinaryIncome, capitalGains,
   qualifiedDividends, ssBenefit, filing, seniorAges, Tbase, payrollConst,
   penalties, penaltyApplies}.

   R2V-002 external audit fix: taxCtx arrives from a direct engine caller
   (validateScenario() does not gate a runScenario()/quoteTaxFunding() call),
   so a non-finite field here must be rejected explicitly rather than left to
   surface as a silent NaN journal several steps downstream.

   R2R-001 external requalification fix: `availableCash` and
   `taxCtx.penalties` were previously exempted from this check on the theory
   that their `||0` fallback below made them "NaN-safe" -- but `||0` only
   catches NaN (falsy); `Infinity`/`-Infinity` are truthy and sailed straight
   through into `cash`/`pen`, producing a "funded" result with
   `retained:Infinity, cashUsed:NaN`, or an "exhausted" result with infinite
   `finalPenalties`. Coercing NaN to 0 was itself the wrong move too --
   hiding invalid input behind a plausible-looking default is exactly what
   this whole contract exists to prevent. Both are now validated exactly
   like the other six fields, so `cash`/`pen` are always genuinely finite (or
   legitimately absent) by the time the `||0` fallback below ever runs. */
function quoteTaxFunding(taxCtx,order,accounts,p,priorReturn,availableCash,iraBasisState){
  var badInput=nonFiniteQuoteInputCode(taxCtx,accounts,availableCash);
  if(badInput)return {status:"error",code:badInput,transactions:[]};
  /* S5AA R33 (SA32F-33): a context that does not say whose age-65 amounts its return carries takes them from the plan, as estimateTaxes()
     does (ageAmountAges()), so the quote and the estimator it is verified against read one rule. The row's own context states them. */
  if(taxCtx.seniorDeductionAges===undefined&&p&&p.profile){var who=householdSurvivorship(p,quoteRowAge(taxCtx)),apart=!!(who.spouseModelled&&who.selfAlive&&who.spouseAlive&&taxCtx.filing!=="mfj");taxCtx=Object.assign({},taxCtx,apart?{seniorAges:[taxCtx.seniorAges[0],-1],seniorDeductionAges:[],additionalFiling:"mfs"}:{seniorDeductionAges:taxCtx.seniorAges,additionalFiling:taxCtx.filing})}
  var cash=Math.max(0,availableCash||0),startCash=cash;
  var oi=taxCtx.ordinaryIncome,cg=taxCtx.capitalGains,pen=taxCtx.penalties||0;
  var transactions=[];
  /* R2V-004 external audit fix: `order` can legitimately list a class more
     than once (or the same class could otherwise be visited twice via a
     future caller), and orderedAccountsInClass()/taxClassBalance() always
     re-read the UNMUTATED `accounts` balances -- so without this bookkeeping
     a repeated class would be quoted against its full original balance every
     time it's visited, letting the same dollar fund the obligation more than
     once. `remaining` tracks each account (taxable, keyed by id) or pooled
     class (preTax/roth/hsa, keyed by class name) exactly once, seeded from
     the true starting balance the first time it's seen and drawn down by
     every solved sale after that, independently of what validation does or
     doesn't reject upstream. */
  var remaining={};
  for(var ci=0;ci<order.length;ci++){
    var cls=order[ci],pieces;
    if(cls==="taxable"){
      pieces=orderedAccountsInClass(accounts,"taxable",p,priorReturn).map(function(a){
        var key="a:"+a.id;
        if(!(key in remaining))remaining[key]=a.balance;
        /* R2R-001 round 2: `Number(a.basisPct)||0` used to live here, which
           silently turned a missing/NaN basis into 0% (fully taxable) and,
           via clamp(), an Infinity basis into 100% (fully untaxed).
           nonFiniteQuoteInputCode() above now rejects those outright, so
           this reads the validated number directly; clamp() is kept purely
           for the RANGE question (a 150% basis is an out-of-range warning
           in the canonical validator, not corrupted input). */
        return {key:key,accountId:a.id,room:remaining[key],rIncome:0,rGains:taxableGainFraction(a)};
      });
    } else if(cls==="preTax"){
      /* Q93: the penalty rate can now DIFFER BETWEEN ACCOUNTS inside the preTax class, because the Rule
         of 55 exempts workplace money and not an IRA. When it does, preTax is split PER ACCOUNT exactly
         as taxable already is above, so the quote agrees with what withdrawFromClass() will charge --
         orderedAccountsInClass() is the same filter and comparator it draws in, so the two walk the
         accounts in the same order. rIncome stays 1 on every piece, so the SHAPE of the affine model is
         unchanged; only the penalty slope varies.
         BUT THE SPLIT IS TAKEN ONLY WHEN IT CHANGES SOMETHING. Where every preTax account carries the
         same rate -- which is every household that does not mix employer-plan and IRA money under the
         Rule of 55, and every member of the control corpus -- the original SINGLE piece is kept. Not for
         speed: splitting reassociates the floating-point arithmetic (one subtraction becomes several),
         which moved corpus values in their last bits and broke task 4.7's exact comparison for no
         behavioural reason. Keeping the single piece keeps those households bit-for-bit identical.
         When task 3.6 step 2 lands, rIncome is where IRA basis would enter, and it varies per account
         whatever the penalty does -- so that step will need the split unconditionally. */
      /* Q87 step 2: THE SPLIT IS NOW UNCONDITIONAL, and task 4.1 said in this very comment that it
         would have to be: "rIncome is where IRA basis would enter, and it varies per account whatever
         the penalty does". A dollar out of one owner's traditional IRA is taxable in a different
         proportion from a dollar out of the other owner's, or out of a 401(k), so a single pooled
         piece cannot price the class. 4.1 kept the pooled piece to avoid reassociating the floating-
         point arithmetic for households the penalty did not reach; that saving is spent here, and the
         last-bit movement it was protecting against is declared rather than avoided. */
      var preOrdered=orderedAccountsInClass(accounts,"preTax",p,priorReturn);
      pieces=preOrdered.map(function(a){
        var key="a:"+a.id;
        if(!(key in remaining))remaining[key]=a.balance;
        /* the nontaxable share is the OWNER'S, pooled over their traditional IRAs, and it is read
           from the same function withdrawFromClass() reads -- which is what keeps the quote and the
           commit from disagreeing about what this dollar costs. */
        var nontaxable=iraBasisFractionFor(accounts,iraBasisState,a);
        return {key:key,accountId:a.id,room:remaining[key],rIncome:1-nontaxable,rGains:0,
                /* Q88 (F-02): THE ROW'S AGE, not seniorAges[0]. That slot used to be the row age and
                   is -1 once the self has died, so reading it here priced the penalty at age MINUS ONE
                   -- a flat 10% on every sale -- and every row after a self death reported
                   TAX_SETTLEMENT_MISMATCH with a surplus of exactly a tenth of the gross. */
                /* Decision 4 (R9 round): on the includible share only, as withdrawFromAccountList() now charges it. */
                rPenalty:(1-nontaxable)*earlyWithdrawalPenaltyRate(p,quoteRowAge(taxCtx),a)};
      });
    } else if(cls==="hsa"&&!hsaDrawIsFullyQualified(accounts)){
      /* Q99 (G5): an HSA draw is priced like a preTax one whenever any of its dollars are
         includible -- rIncome is the includible share and rPenalty the 20% ON THAT SHARE. The
         split is PER ACCOUNT because both the share and the owner's age vary between accounts,
         and it is taken only when there is something to split: a household whose HSAs are all
         fully qualified keeps the single pooled piece below and stays bit-for-bit identical,
         for the reason task 4.1 recorded. The quote must agree with what withdrawFromClass()
         will charge or the settlement check rejects the row, so this walks the accounts in the
         same order it draws them. */
      var hsaOrdered=orderedAccountsInClass(accounts,"hsa",p,priorReturn);
      pieces=hsaOrdered.map(function(a){
        var hkey="a:"+a.id,inc=hsaIncludibleShare(a);
        if(!(hkey in remaining))remaining[hkey]=a.balance;
        return {key:hkey,accountId:a.id,room:remaining[hkey],rIncome:inc,rGains:0,
                /* Q88 (F-02): the row's age, for the same reason as the penalty above. */
                rPenalty:inc*hsaAdditionalTaxRate(p,quoteRowAge(taxCtx),a)};
      });
    } else {
      var key="c:"+cls;
      if(!(key in remaining))remaining[key]=taxClassBalance(accounts,cls);
      pieces=remaining[key]>1e-9?[{key:key,accountId:null,room:remaining[key],rIncome:0,rGains:0}]:[];
    }
    for(var pi=0;pi<pieces.length;pi++){
      var piece=pieces[pi];
      /* R2R-001 round 2: derived piece fields are checked before use, not
         assumed finite because the inputs were -- `room` comes through the
         `remaining` bookkeeping and `rGains` through a clamped division. */
      if(!isFiniteNumberValue(piece.room)||!isFiniteNumberValue(piece.rGains)||!isFiniteNumberValue(piece.rIncome))
        return {status:"error",code:"NONFINITE_SETTLEMENT",transactions:transactions};
      if(piece.room<=1e-9)continue;
      /* Q93: a preTax piece carries its own rate, because the Rule of 55 exempts workplace money and not an
         IRA. taxCtx.penaltyApplies remains the household-level summary the row reports; it is no longer
         what decides a preTax piece. */
      var rPenalty=piece.rPenalty!==undefined?piece.rPenalty:0;
      var ctx={oi0:oi,cg0:cg,qDiv:taxCtx.qualifiedDividends,niiOther:taxCtx.niiOther,ssBenefit:taxCtx.ssBenefit,filing:taxCtx.filing,seniorAges:taxCtx.seniorAges,seniorDeductionAges:taxCtx.seniorDeductionAges,additionalFiling:taxCtx.additionalFiling,Tbase:taxCtx.Tbase,payrollConst:taxCtx.payrollConst,pen0:pen,rPenalty:rPenalty,rIncome:piece.rIncome,rGains:piece.rGains,carry:taxCtx.capitalLossCarryIn};
      var solved=solveSegmentFunding(ctx,piece.room,cash);
      if(solved.error)return {status:"error",code:solved.error,transactions:transactions};
      if(!isFiniteNumberValue(solved.x))return {status:"error",code:"NONFINITE_SETTLEMENT",transactions:transactions};
      if(solved.x>1e-9){
        var txGains=piece.rGains*solved.x,txOrdinary=piece.rIncome*solved.x,txPenalty=rPenalty*solved.x;
        /* R2R-001 round 2: journal values and the running totals they feed
           are verified before they enter the quote, so a non-finite value
           can never reach a terminal return dressed as a real transaction. */
        if(!isFiniteNumberValue(txGains)||!isFiniteNumberValue(txOrdinary)||!isFiniteNumberValue(txPenalty))
          return {status:"error",code:"NONFINITE_SETTLEMENT",transactions:transactions};
        transactions.push({accountId:piece.accountId,taxClass:cls,gross:solved.x,gains:txGains,ordinaryIncome:txOrdinary,penalty:txPenalty});
        oi+=txOrdinary;cg+=txGains;pen+=txPenalty;cash+=solved.x;
        remaining[piece.key]-=solved.x;
        if(!isFiniteNumberValue(oi)||!isFiniteNumberValue(cg)||!isFiniteNumberValue(pen)||!isFiniteNumberValue(cash)||!isFiniteNumberValue(remaining[piece.key]))
          return {status:"error",code:"NONFINITE_SETTLEMENT",transactions:transactions};
      }
      if(solved.funded){
        var verify=verifyQuoteObligation(p,taxCtx,oi,cg,pen);
        if(!verify.finite||!Number.isFinite(cash))
          return {status:"error",code:"NONFINITE_SETTLEMENT",transactions:transactions};
        if(cash<verify.obligation-.01||(transactions.length>0&&cash>verify.obligation+.01))
          return {status:"error",code:"QUOTE_SETTLEMENT_UNVERIFIED",transactions:transactions,funded:cash,obligation:verify.obligation};
        var retained=cash-verify.obligation,cashUsed=cash-startCash;
        if(!Number.isFinite(retained)||!Number.isFinite(cashUsed))
          return {status:"error",code:"NONFINITE_SETTLEMENT",transactions:transactions};
        return {status:"funded",transactions:transactions,finalOrdinaryIncome:oi,finalCapitalGains:cg,finalPenalties:pen,cashUsed:cashUsed,retained:retained};
      }
    }
  }
  /* R2V-001 external audit fix: every piece above already returns "funded"
     the moment ITS OWN walk finds cash+sale covering the obligation -- but
     when every class's room is zero (no positive account balance anywhere,
     e.g. a preTax account fully drained by an RMD moments earlier), the
     inner loop body above never runs even once, and the old code fell
     through to an unconditional "exhausted" here regardless of whether the
     available cash alone already covered the obligation -- silently
     discarding that cash instead of reporting it as retained. Reconciling
     against a fresh estimateTaxes() here, exactly like the "funded" branch
     above, means "exhausted" is only ever reported for a strictly positive
     verified residual, never a cash-only settlement that already cleared. */
  var final=verifyQuoteObligation(p,taxCtx,oi,cg,pen);
  /* R2R-001 external requalification fix: an "exhausted" return is not
     exempt from this check -- a non-finite `pen` (or, before this fix, an
     infinite `cash`) could otherwise reach here carrying an infinite
     `finalPenalties`/`cashUsed` inside an outcome that looks like an
     ordinary, well-formed shortfall. */
  if(!final.finite||!Number.isFinite(cash))
    return {status:"error",code:"NONFINITE_SETTLEMENT",transactions:transactions};
  var finalCashUsed=cash-startCash;
  if(cash>=final.obligation-.01){
    var finalRetained=cash-final.obligation;
    if(!Number.isFinite(finalRetained)||!Number.isFinite(finalCashUsed))
      return {status:"error",code:"NONFINITE_SETTLEMENT",transactions:transactions};
    return {status:"funded",transactions:transactions,finalOrdinaryIncome:oi,finalCapitalGains:cg,finalPenalties:pen,cashUsed:finalCashUsed,retained:finalRetained};
  }
  if(!Number.isFinite(finalCashUsed))
    return {status:"error",code:"NONFINITE_SETTLEMENT",transactions:transactions};
  return {status:"exhausted",transactions:transactions,finalOrdinaryIncome:oi,finalCapitalGains:cg,finalPenalties:pen,cashUsed:finalCashUsed};
}
/* Q70: ssaBenefitAtClaim() applied a delayed credit to any claim past full
   retirement age and an early reduction to any claim before it, with no legal
   boundary on either side, and a plan paid the benefit from whatever age it
   named. Delayed credits end at 70, and a retirement benefit cannot start
   before 62; the validator only warned about ssClaim and never checked
   spouseClaim, so an imported plan reached this. Decided 2026-09-14 (the owner),
   answer (c): the engine bounds the age, and the validator refuses one outside
   the range. The credited age -- the one the benefit factor reads -- is held to
   62 through the rules' latestClaimAge; 62 is written here because the rules
   carry no earliest claim age. The start age -- when payments begin -- is held
   no earlier than 62; a later claim still starts when it is made. */
function ssCreditedClaimAge(claim){return Math.min(RULES.socialSecurity.latestClaimAge,Math.max(62,claim))}
function ssClaimStartAge(claim){return Math.max(62,claim)}
/* Q91 (F5): FULL RETIREMENT AGE, stated once. ssaBenefitAtClaim() derived it inline; the earnings
   test needs the same number, and two derivations of one fact is the shape this sprint keeps
   repairing. */
/* Q92 (F6): A SURVIVOR BENEFIT IS A DIFFERENT BENEFIT WITH A DIFFERENT CLOCK.

   The survivor branch paid only if the recipient had reached THEIR OWN RETIREMENT claim age, so a
   widow of 60 whose own claim age is 67 was paid NOTHING for seven years. That gate is not wrong --
   a prior repair restored it after an aliveness-only test paid a 50-year-old survivor -- it is
   INCOMPLETE. The survivor has a floor of their own, and it is 60.

   SSA publishes the endpoints and three checkpoints and no formula: payments "start at 71.5%" and
   reach "up to 100% when you reach your Full Retirement Age for Survivor benefits". The reduction is
   28.5 points spread EVENLY over the months between the two ages, and that derivation was checked
   against all three of SSA's own checkpoints -- over 75% at 61, over 80% at 63, over 90% at 65 --
   before it was coded, not merely found consistent with one of them.

   SURVIVOR FULL RETIREMENT AGE IS ITS OWN TABLE, "between ages 66-67", and is approximated here by
   the stored retirement figure. Exact for anyone born 1962 or later; up to four months late for anyone born in 1960 and two months late for 1961 -- SSA's survivor table (20 CFR 404.409) runs two years behind the retirement one, 66 and 8 months and 66 and 10 months there against 67 here -- so a survivor benefit starting inside that gap is reduced slightly more than it should be. The engine has no birth
   month to place the cohort boundaries (20 CFR 404.409 runs them from January 2). Said out loud in the
   rule record rather than left for someone to discover. S5AA R9 round, DeepSeek audit finding 4d/02: this
   read "up to two months early for the 1960-61 cohorts", which was wrong in size and in direction. */
/* S5AA R34 (the owner 2026-09-29: "Follow law everywhere"): the survivor table is the retirement table two years behind -- SSA's
   Normal Retirement Age page: widows and widowers "should add 2 years to the year of birth shown in the table" (20 CFR 404.409).
   It was approximated by the retirement figure, up to four months late for the 1960-61 cohorts. */
function survivorFullRetirementAge(p,owner){return ssFraForBirthYear(ssBirthYear(p,owner)-2)}
function survivorRecord(id){
  return RULES.socialSecurity.survivor.records.filter(function(r){return r.provision_id===id})[0].value;
}
/* Q92: the factor for a benefit that STARTS at `startAge`. Linear in months, floored at 71.5% and
   capped at 100%. */
function survivorReductionFactor(p,startAge,owner){
  var earliest=survivorRecord("survivor_earliest_claim_age"),
      floorFactor=survivorRecord("survivor_minimum_factor"),
      full=survivorFullRetirementAge(p,owner==="spouse"?"spouse":"self"),
      span=Math.max(1e-9,(full-earliest)*12),
      early=Math.max(0,Math.min((full-Number(startAge))*12,span));
  return 1-(1-floorFactor)*(early/span);
}
/* Q92: WHEN this person's survivor benefit starts, in their own age -- the later of the survivor
   floor and their age when the other person dies. THE REDUCTION IS FIXED HERE AND NEVER RECOMPUTED
   FROM A LATER BIRTHDAY: SSA's "increase the longer you wait" is about the age of APPLICATION, and a
   benefit that quietly grew back to 100% simply because its recipient kept having birthdays would
   undo the reduction it was given. */
function survivorStartAge(p,ownerAgeAtOtherDeath){
  return Math.max(survivorRecord("survivor_earliest_claim_age"),Number(ownerAgeAtOtherDeath));
}
/* S5AA R34 (SA32F-05, SA32F-25): EACH PERSON'S FULL RETIREMENT AGE COMES FROM THEIR BIRTH YEAR -- SSA, Normal Retirement Age
   (ssa.gov/oact/progdata/nra.html): 65 for 1937 and before, then two months a year to 65 and 10 months for 1942; 66 for 1943-54;
   66 and 2 months for 1955, rising two months a year to 66 and 10 months for 1959; 67 for 1960 and later. The engine read one
   entered figure, retirement.ssFra, for both people, and nothing checked it (60 or 75 was paid from); that field now decides
   nothing. The birth year is the plan's whole-age reading, 2026 - floor(age at the plan's start), as rmdStartAge() reads it
   (MODEL_ASSUMPTIONS section 12): the birth month is not an input. A caller that names no owner means the self. */
function ssBirthYear(p,owner){var pr=p&&p.profile||{},a=owner==="spouse"?Number(pr.spouseAge):Number(pr.age);return 2026-Math.floor(Number.isFinite(a)?a:0)}
function ssFraForBirthYear(y){if(y<=1937)return 65;if(y<=1942)return 65+(y-1937)*2/12;if(y<=1954)return 66;if(y<=1959)return 66+(y-1954)*2/12;return RULES.socialSecurity.fullRetirementAgeFor1960Plus}
function ssFullRetirementAge(p,owner){return ssFraForBirthYear(ssBirthYear(p,owner==="spouse"?"spouse":"self"))}
/* Q91 (F5): THE RETIREMENT EARNINGS TEST. All four figures have been in the rules package since it
   was written -- $24,480, $65,160, and the 2-for-1 and 3-for-1 ratios -- and NOTHING READ THEM. A
   household claiming at 62 while earning $100,000 was paid its benefit in full.

   Confirmed against SSA before this was coded (task 8.6; both ssa.gov hosts refuse an automated
   fetch with HTTP 403, which is not the same as an absent source, so the pages were read in a
   browser). SSA, Exempt Amounts Under the Earnings Test: the lower amount applies "in years before
   the year of attaining NRA" and withholds $1 for every $2 above it; the higher amount applies "in
   the year of attaining NRA, for months prior to such attainment" and withholds $1 for every $3;
   and "Earnings in or after the month you reach NRA do not count toward the retirement test".

   THE PARTIAL-YEAR TREATMENT IS A STATED SCOPE DEFAULT, NOT A DERIVATION. The exempt amounts are
   CALENDAR-ANNUAL and this engine's rows are age intervals that need not be a year long. A row's
   earnings are already prorated to its length, so the exempt amount is prorated to match: testing a
   half-year's earnings against a whole year's exemption would withhold far too little. In the row
   that crosses full retirement age, only the part of the row BEFORE that age is tested, which is
   what "months prior to such attainment" means expressed in this engine's clock. */
function ssEarningsTestBand(p,ownerAgeStart,ownerAgeEnd,owner){
  var fra=ssFullRetirementAge(p,owner),et=RULES.socialSecurity.earningsTest;
  if(!(ownerAgeStart<fra-1e-9))return null;
  var span=Math.max(1e-9,ownerAgeEnd-ownerAgeStart);
  if(ownerAgeEnd>fra-1e-9)
    return {exempt:et.fraYear,ratio:et.fraReduction,testedFraction:Math.min(1,(fra-ownerAgeStart)/span),fraYear:true};
  return {exempt:et.underFRA,ratio:et.underReduction,testedFraction:1,fraYear:false};
}
/* Q91: what this row withholds from one person, and how many months it touches.

   THE CREDITING MONTHS ARE THE POINT OF THE WHOLE EXERCISE, and POMS RS 00615.482 is explicit that
   they are granted "for months of FULL OR PARTIAL work deduction". The reduction factor counts
   MONTHS, not dollars: a month in which a tenth of the benefit was withheld is a whole crediting
   month, exactly like one in which all of it was. Crediting the dollar-equivalent number of whole
   months is the obvious implementation and it understates the lifetime benefit. Hence Math.ceil. */
/* S5AA R34 (SA32F-07): `cap`, when given, is the most that may be withheld -- in the grace year, the benefits for SERVICE months (20 CFR 404.435:
   no reduction "for any month in which ... you had a non-service month in your grace year"). */
function ssEarningsTestWithholding(p,ownerAgeStart,ownerAgeEnd,earnings,annualBenefit,monthsEntitled,owner,cap){
  var band=ssEarningsTestBand(p,ownerAgeStart,ownerAgeEnd,owner),
      duration=Math.max(0,ownerAgeEnd-ownerAgeStart),
      payable=Math.max(0,annualBenefit);
  if(!band||payable<=0||monthsEntitled<=0)return {withheld:0,creditMonths:0};
  var tested=Math.max(0,Number(earnings)||0)*band.testedFraction,
      exempt=band.exempt*duration*band.testedFraction,
      excess=Math.max(0,tested-exempt),
      withheld=Math.min(payable,excess/band.ratio,Number.isFinite(Number(cap))?Math.max(0,Number(cap)):Infinity),
      monthly=payable/monthsEntitled;
  if(withheld<=1e-9)return {withheld:0,creditMonths:0};
  return {withheld:withheld,creditMonths:Math.min(monthsEntitled,Math.ceil(withheld/monthly-1e-9))};
}

/* Q91 (F5): `creditedMonths` is the adjustment of the reduction factor. POMS RS 00615.480: "An
   adjustment of the reduction factor ELIMINATES certain deduction and non-entitlement months from the
   original reduction factor", automatically, effective at full retirement age. So the months the
   earnings test withheld are subtracted from the early-claim months -- the benefit is not refunded,
   it is permanently raised from then on. `ownerAgeNow` is what makes it effective AT full retirement
   age and not before: withheld months buy nothing until then. Both arguments are optional, and
   omitting them is the unadjusted benefit every existing caller already means. */
/* S5AA R34 (R32V-03; 20 CFR 404.212(c), 404.275(c), 404.304(f)): SSA's ROUNDING -- a PIA, and each COLA-increased PIA, to the next lower
   $0.10; the monthly benefit, after every reduction, to the next lower $1. The engine carried unrounded figures throughout. */
function ssFloorDime(x){return Math.floor(x*10+1e-6)/10}
function ssFloorDollar(x){return Math.floor(x+1e-6)}
/* The monthly PIA before any COLA: the entered full-retirement-age benefit, or the bend-point formula on the entered AIME. */
function ssPiaBase(p,owner){var r=p.retirement,base=owner==="spouse"?r.spouseSS:r.ssBenefit;if(owner!=="spouse"&&r.ssAdvanced&&r.aime>0){var a=r.aime,b1=RULES.socialSecurity.pia.bend1,b2=RULES.socialSecurity.pia.bend2;base=.9*Math.min(a,b1)+.32*Math.max(0,Math.min(a,b2)-b1)+.15*Math.max(0,a-b2)}return ssFloorDime(Math.max(0,Number(base)||0))}
/* The early-claim reduction or delayed credit on the owner's own benefit, at the owner's own full retirement age (unchanged arithmetic). */
function ssClaimFactor(p,owner,creditedMonths,ownerAgeNow){var r=p.retirement,claim=ssCreditedClaimAge(owner==="spouse"?r.spouseClaim:r.ssClaim),fra=ssFullRetirementAge(p,owner);var months=Math.round(Math.abs(claim-fra)*12),factor=1;if(claim<fra){/* Q91: the credited months come off here, and only once the owner has reached full retirement age. */if(ownerAgeNow!==undefined&&ownerAgeNow>=fra-1e-9)months=Math.max(0,months-(Number(creditedMonths)||0));var first=Math.min(36,months),later=Math.max(0,months-36);/* S5AA R34: the EXACT fractions of 20 CFR 404.410 -- 5/9 of 1% a month for 36 months, 5/12 of 1% beyond -- and 404.313's 2/3 of 1% a month of
     delayed credit, counted in whole months. The rules package stores the first two as rounded decimals (0.0055555556), which put a benefit that is
     exactly a whole dollar a hair below it, and SSA's round-down (404.304(f)) then lost the dollar. */factor=1-first*5/900-later*5/1200}else factor=1+Math.min(months,Math.round((RULES.socialSecurity.latestClaimAge-fra)*12))*2/300;return factor}
/* S5AA R34 (SA32F-04; the owner's decision 3, 2026-09-29: "Today's dollars"): THE PIA AT AN AGE. The entered benefit is in TODAY'S dollars,
   so it takes the COLA from the plan's start to the claim and every COLA after it; the earnings-based PIA takes its COLAs from eligibility at
   62 (20 CFR 404.271: "beginning with December of the year they become eligible"). A benefit claimed before the plan opens is indexed from
   its claim (MODEL_ASSUMPTIONS section 4). Each COLA step is rounded to the dime (404.275(c)). The engine applied no COLA before the claim. */
function ssPiaAt(p,owner,ownerAge,startHistory){var r=p.retirement,pr=p.profile,start=Number(owner==="spouse"?pr.spouseAge:pr.age),claim=ssClaimStartAge(owner==="spouse"?r.spouseClaim:r.ssClaim),aime=owner!=="spouse"&&r.ssAdvanced&&r.aime>0,anchor=aime?62:(claim<start?claim:start),pia=ssPiaBase(p,owner),h=startHistory||0,rates=ownerAge>claim?ssColaRates(p,anchor,claim,h,start).concat(ssColaRates(p,claim,ownerAge,h,start)):ssColaRates(p,anchor,ownerAge,h,start);for(var i=0;i<rates.length;i++)pia=ssFloorDime(pia*(1+rates[i]));return pia}
/* The annual own benefit AT THE CLAIM, before any COLA, SSA-rounded. Kept for its callers. */
function ssaBenefitAtClaim(p,owner,creditedMonths,ownerAgeNow){return Math.max(0,ssFloorDollar(ssPiaBase(p,owner)*ssClaimFactor(p,owner,creditedMonths,ownerAgeNow))*12)}
/* S5AA R34 (SA32F-03; decision 2, "Build it"): THE SPOUSE'S BENEFIT. Up to half the worker's PIA, less the recipient's own PIA -- the
   "excess" a dually entitled spouse is paid on top of their own benefit (20 CFR 404.333) -- reduced by 25/36 of 1% a month for the first 36
   months before the recipient's full retirement age and 5/12 of 1% beyond (20 CFR 404.410; SSA's table: 35% at 62 when FRA is 67), with no
   delayed credits. Deemed filing (born January 2, 1954 or later) makes a claim for one a claim for both, so the excess starts at the later
   of the recipient's own claim and the worker's. The family maximum (at least 150% of the worker's PIA) cannot bind a worker and a spouse.
   This returns the reduction factor for an excess that starts at `startAge` on the recipient's clock. */
function ssSpousalFactor(p,owner,startAge){var fra=ssFullRetirementAge(p,owner),months=Math.max(0,Math.round((fra-Number(startAge))*12));if(!(months>0))return 1;return Math.max(0,1-Math.min(36,months)*(25/36)/100-Math.max(0,months-36)*(5/12)/100)}
/* S5AA R34 (SA32F-01, SA32F-02; decision 1, "Pay by law"): THE SURVIVOR BENEFIT. It rests on the deceased's PIA -- the "original benefit" is
   100% of the death PIA, or more with the delayed credits the deceased earned (POMS RS 00615.301; 20 CFR 404.338) -- whether or not the
   deceased had filed (404.335 needs only that they "died fully insured"; a worker who never claimed earns delayed credits up to the death,
   capped at 70). It is reduced for the survivor's age when it starts (survivorReductionFactor), and if the deceased received a REDUCED
   benefit it is limited to the larger of that benefit and 82.5% of the PIA, applied after the age reduction (POMS RS 00615.320, RIB-LIM).
   The engine multiplied the deceased's already-reduced benefit by the survivor factor, and paid nothing on a worker who died before claiming. */
function ssSurvivorMonthly(p,deceased,piaNow,claimedBeforeDeath,survivorFactor){var r=p.retirement,fra=ssFullRetirementAge(p,deceased),death=Number(deceased==="spouse"?r.spouseLife:r.selfLife),own=claimedBeforeDeath?ssClaimFactor(p,deceased):1,ob=claimedBeforeDeath?Math.max(1,own):(death>fra?1+Math.round((Math.min(death,RULES.socialSecurity.latestClaimAge)-fra)*12)*2/300:1),amount=piaNow*ob*survivorFactor;if(claimedBeforeDeath&&own<1)amount=Math.min(amount,Math.max(piaNow*own,.825*piaNow));return ssFloorDollar(Math.max(0,amount))}
/* S5AA R33 (SA32F-23): CMS's 2026 table puts "Greater than or equal to $500,000" ($750,000 joint) in the top tier; every lower tier
   starts "greater than" its threshold. */
function irmaaMonthly(magi,filing){var m=RULES.medicare.irmaa,thresholds=filing==="mfj"?m.jointThresholds:m.singleThresholds,index=0;while(index<thresholds.length&&(index===thresholds.length-1?magi>=thresholds[index]:magi>thresholds[index]))index++;return m.partBMonthly[index]+m.partDMonthlySurcharge[index]}
function rng(seed){var x=seed>>>0;return function(){x+=0x6D2B79F5;var t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function normal(random){var u=0,v=0;while(!u)u=random();while(!v)v=random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
/* S5AA R20 (R18F-01, ChatGPT's R18 full-model audit, P1; the owner, 2026-09-23): THE ONE ALLOCATION an account holds at a point in its glide, which accountExpected() and accountVolatility() both read. The expected return moved with the glide while the volatility read the OPENING allocation, so a Monte Carlo draw paired the glided mean with the opening risk: an 80/20 account at its 20% target was drawn at 5.6% with 15.21% volatility, where 20/80 has 7.44%. The glide applies only with a year (yearProgress) given; without one -- the down-year account ranking -- the opening allocation is returned, as before. AN ACCOUNT WITH NO NON-STOCK HOLDING glides into BONDS (the owner's decision): it had nowhere to go, so a 60% target left it all stock and a 0% target made every weight 0 and its return 0%. With no bonds class the account keeps its allocation, so return and risk still agree. Returns {weights, total} (weights by class id, not re-normalised; total their sum), or null when the account holds no allocation. */
function accountGlideWeights(a,p,yearProgress){var total=sum(Object.keys(a.allocation),function(k){return Math.max(0,a.allocation[k]||0)});if(total<=0)return null;/* CL-01, same assumption one level over: asset-class ids are user-editable too, and a null-prototype object keeps `weights.stocks` reading naturally while making every key an ordinary own property. */var weights=Object.create(null);/* Q67, the same read as accountVolatility(): an OWN allocation entry only. Here an inherited value's NaN weight happened to be rescued downstream by `||0` and `||1`, but only because normalised weights sum to 1 -- the read was the same defect, so it gets the same rule. */p.advanced.assetClasses.forEach(function(ac){weights[ac.id]=Math.max(0,(Object.prototype.hasOwnProperty.call(a.allocation,ac.id)?a.allocation[ac.id]:0)||0)/total});if(p.advanced.glideOn&&weights.stocks!==undefined&&isFinite(yearProgress)){var yearsTo=Math.max(0,p.profile.retireAge-p.profile.age),progress=yearsTo?clamp(yearProgress/yearsTo,0,1):1,currentStock=weights.stocks,targetStock=currentStock+(p.advanced.retirementStock/100-currentStock)*progress,otherTarget=Math.max(0,1-targetStock),nonStock=sum(Object.keys(weights),function(id){return id==="stocks"?0:weights[id]});if(nonStock>0){var otherCurrent=Math.max(.0001,1-currentStock);Object.keys(weights).forEach(function(id){weights[id]=id==="stocks"?targetStock:weights[id]*otherTarget/otherCurrent})}else if(weights.bonds!==undefined){weights.stocks=targetStock;weights.bonds=otherTarget}}return {weights:weights,total:sum(Object.keys(weights),function(id){return weights[id]})}}
function accountExpected(a,p,yearProgress,randomReturn){if(randomReturn!==null)return randomReturn;var base=p.assumptions.returnRate/100;if(!p.advanced.assetsOn)return base;var glided=accountGlideWeights(a,p,yearProgress);if(!glided)return base;var weights=glided.weights,weightTotal=glided.total;return sum(p.advanced.assetClasses,function(ac){return (weights[ac.id]||0)*ac.returnRate/100})/(weightTotal||1)}
function accountVolatility(a,p,yearProgress){if(!p.advanced.assetsOn)return p.assumptions.volatility/100;var weights=[],vols=[];/* Q67: read only an OWN allocation entry. `allocation` is a plain JSON object, so an asset-class id spelled like an Object.prototype property ("constructor", "__proto__", "toString", ...) with no own entry read the INHERITED value -- truthy, so `||0` never applied -- the weight went NaN, and the `!total` guard below silently returned the flat assumptions.volatility instead of the weighted one. An absent entry weighs 0 whatever the id is spelled; an own entry is read as before. */p.advanced.assetClasses.forEach(function(ac){var w=Math.max(0,(Object.prototype.hasOwnProperty.call(a.allocation,ac.id)?a.allocation[ac.id]:0)||0);weights.push(w);vols.push(ac.volatility/100)});var total=sum(weights);if(!total)return p.assumptions.volatility/100;/* R20 (R18F-01): along a glide, the risk is the glided allocation's -- the same weights the expected return reads. */if(p.advanced.glideOn&&isFinite(yearProgress)){var glided=accountGlideWeights(a,p,yearProgress);if(glided){var gTotal=glided.total||1;weights=p.advanced.assetClasses.map(function(ac){return (glided.weights[ac.id]||0)/gTotal})}else weights=weights.map(function(w){return w/total})}else weights=weights.map(function(w){return w/total});var variance=0;for(var i=0;i<weights.length;i++)for(var j=0;j<weights.length;j++)variance+=weights[i]*weights[j]*vols[i]*vols[j]*(i===j?1:p.advanced.correlation);return Math.sqrt(Math.max(0,variance))}
/* S5 task 5a: the start ages before 1951 (ACCOUNT section 17, Test 4). The engine holds an age, not a birth date, so a
   birth year is 2026 minus the whole age, and 1949 is read as before July 1949. */
/* S5 task 12.1: the ages task 5a set or gave a status are records under RULES.retirement.rmd.startAge; the 1951-1958 and 1960-or-later ages were untouched and stay flat (12.2). *//* Q90 (F4, N2, G18): the start age is a BIRTH-YEAR rule, so it is per person. The second argument is
   that person's age at the plan's start; omitted, it is the primary profile's, which is what every
   existing caller means and why the one-argument form is unchanged. A spouse fifteen years younger
   has a different start age as well as a different divisor. */
function rmdStartAge(p,ownerAgeAtStart){var baseAge=ownerAgeAtStart===undefined?p.profile.age:ownerAgeAtStart,birthYear=2026-Math.floor(baseAge),rmd=RULES.retirement.rmd,record=function(id){return rmd.startAge.records.filter(function(r){return r.provision_id===id})[0].value};return birthYear>=1960?rmd.birth1960OrLaterAge:birthYear===1959?record("rmd_start_age_born_1959"):birthYear>=1951?rmd.birth1951To1958Age:birthYear===1950?record("rmd_start_age_born_july_1949_through_1950"):record("rmd_start_age_born_before_july_1949")}
function optimizedAccountScore(a,p,priorReturn){var score=Number(a.priority)||1;if(priorReturn<0&&p.advanced.assetsOn){var volatility=accountVolatility(a,p),cashShare=Math.max(0,Number(a.allocation&&a.allocation.cash)||0)/100;score+=volatility*25-cashShare*8}if(p.advanced.reserveOn&&a.taxClass==="taxable")score-=2;return score}
function smartWithdrawalOrder(p,age,accounts,magiHistory,priorReturn){var scores={taxable:10,preTax:20,roth:34,hsa:48},goal=p.retirement.optimizationGoal||"balanced",total=Math.max(1,totalBalance(accounts)),preTaxShare=taxClassBalance(accounts,"preTax")/total,latestMagi=magiHistory.length?magiHistory[magiHistory.length-1]:0,startRmd=rmdStartAge(p),/* Q88 (F-02): the IRMAA guard ranks against the thresholds the household will actually face, which
   for a survivor are the single ones. The same status the charge itself uses. */filing=householdFilingFor(p,age),thresholds=filing==="mfj"?RULES.medicare.irmaa.jointThresholds:RULES.medicare.irmaa.singleThresholds,nextIrmaa=thresholds.find(function(x){return x>latestMagi})||Infinity;/* S5AA R20 (R18F-03, ChatGPT's R18 full-model audit, P2; the owner, 2026-09-23): the early-tax weight is the SHARE of the pre-tax balance that earlyWithdrawalPenaltyRate() -- the rule the quote and the draw charge -- would tax, as the HSA weight below already is (Q99). It was +45 on the whole class unless a household rule excused it, and that rule lifted it for Rule of 55 at the primary age, IRAs included: turning Rule of 55 on sent the optimizer to an IRA the 10% still reaches ($7,225 of tax where $0 was available). With no pre-tax balance the old rule stands, since the place of an empty class draws nothing. */var preTaxPool=accounts.filter(function(a){return a.taxClass==="preTax"&&a.balance>0}),preTaxWeighted=sum(preTaxPool,function(a){return a.balance}),preTaxEarly=preTaxWeighted>0?sum(preTaxPool,function(a){return a.balance*(earlyWithdrawalPenaltyRate(p,age,a)>0?1:0)})/preTaxWeighted:(age<59.5&&!p.advanced.penaltyException&&!(p.advanced.rule55&&age>=55)?1:0);scores.preTax+=45*preTaxEarly;if(p.retirement.rmdSmoothing&&preTaxShare>.45&&age>=Math.max(55,startRmd-15))scores.preTax-=14;if(age>=startRmd)scores.preTax-=20;if(p.retirement.irmaaGuard&&age>=63&&nextIrmaa-latestMagi<Math.max(10000,p.retirement.spending*.35))scores.preTax+=18;if(goal==="taxes"){scores.taxable-=6;scores.roth+=5;if(preTaxShare>.55&&age<startRmd)scores.preTax-=5}else if(goal==="success"){scores.hsa-=age>=65?12:0;scores.roth-=4}else if(goal==="spending"){scores.roth-=6;scores.hsa-=age>=65?8:0}else if(goal==="legacy"){scores.roth+=18;scores.hsa+=10;scores.preTax-=8}if(p.retirement.preserveRoth||p.advanced.legacy>0)scores.roth+=12;if(p.advanced.healthOn&&age>=65)scores.hsa-=10;/* Q99 (G5): the ranking reads the SAME qualification the quote and the commit read. The base
   scores above encode "an HSA is free money that becomes freer at 65", which holds only while
   every draw is assumed qualified. A non-qualified draw is ordinary income, and before the
   beneficiary reaches the section 1811 age it also carries 20% -- twice the early pre-tax
   penalty, which is what the +45 above prices. So the includible share is charged the same
   +45 and an income weight beside it, and a wholly non-qualified HSA ranks BEHIND an early
   pre-tax draw rather than ahead of everything. These are ranking weights on the existing
   arbitrary scale, not dollar costs; what matters is the ORDER they produce, which the tests
   assert directly. A fully qualified HSA -- the default -- adds nothing and does not move. */var hsaPool=accounts.filter(function(a){return a.taxClass==="hsa"&&a.balance>0}),hsaWeighted=sum(hsaPool,function(a){return a.balance}),hsaInc=hsaWeighted>0?sum(hsaPool,function(a){return a.balance*hsaIncludibleShare(a)})/hsaWeighted:0,hsaAdd=hsaWeighted>0?sum(hsaPool,function(a){return a.balance*(hsaAdditionalTaxRate(p,age,a)>0?1:0)})/hsaWeighted:0;if(hsaInc>0)scores.hsa+=hsaInc*(30+45*hsaAdd);if(p.retirement.survivor&&p.profile.spouseOn&&age>=Math.min(p.retirement.selfLife,p.retirement.spouseLife)-10)scores.preTax-=6;if(priorReturn<0&&p.advanced.reserveOn)scores.taxable-=7;if(debtTotal(p)>total*.25)scores.roth-=2;return Object.keys(scores).sort(function(a,b){return scores[a]-scores[b]})}
/* Q93 (F7, N1, with G2 and G6): the ONE definition of the 10% early-distribution penalty, because the
   test was restated in THREE places and omitted in a fourth. withdrawFromClass() had it inline,
   penaltyApplies re-derived it for the row, quoteTaxFunding() re-derived it again per class -- and the
   TRANSFER block, which moves pre-tax money to taxable and adds it to ordinary income, never charged it
   at all. A $50,000 transfer at 50 cost $0 of penalty where it owes $5,000.

   THE RULE OF 55 IS WORKPLACE-PLAN MONEY ONLY. IRC 72(t)(2)(A)(v) exempts a distribution from a
   qualified employer plan after separation from service in or after the year the employee turns 55; it
   does NOT reach an IRA. The old gate read the tax CLASS and a household flag and never the ACCOUNT, so
   it could not tell a 401(k) from an IRA and exempted both. That is why this takes the account.

   THE AGE IS THE ACCOUNT OWNER'S (S5AA R20, R18F-02; ChatGPT's R18 full-model audit, P1; the owner, 2026-09-23).
   Callers pass the row age, the primary person's; the owner's own age is resolved here, once, so the quote,
   the committed draw and the transfer all read it. It had been the row age for every account -- "a
   pre-existing simplification", this comment said, left alone and disclosed nowhere a reader would look --
   so a spouse-owned IRA was taxed or excused on the wrong person's age. IRC 72(t)(1) and (2)(A)(i) turn on
   the age of the employee or IRA owner receiving the distribution, and (2)(A)(v) on the employee's own age
   at separation. */
function earlyWithdrawalPenaltyRate(p,age,account){
  age=accountOwnerAge(p,age,account);
  if(!(age<59.5))return 0;
  var adv=p&&p.advanced;
  if(adv&&adv.penaltyException)return 0;
  if(adv&&adv.rule55&&age>=55&&account&&accountType(account.type).limitGroup==="workplace")return 0;
  return .10;
}
/* Q99 (G5): `income` is the ORDINARY INCOME this draw creates, reported by the draw rather than
   re-derived by the caller. The row used to add a draw to ordinaryWithdrawal only when the class
   was "preTax", which was the whole class-level truth until an HSA draw could be includible too.
   Stating it here means a class whose treatment changes cannot be missed at a call site -- the
   omission that cost task 4.1 a fourth, unpatched copy of the penalty test. */
/* Q90 (F4, N2, G18): the draw itself, over an EXPLICIT ORDERED LIST. A required distribution has to
   come from the accounts that owe it -- an owner's IRA obligation from that owner's IRAs, a 401(k)'s
   from that 401(k) -- which a whole-class draw cannot express. withdrawFromClass() below delegates
   here, so the filter, the comparator and every dollar of the arithmetic stay in ONE place and cannot
   drift apart. `poolAccounts` is the household's whole account list and defaults to the draw list:
   Form 8606 line 6 is the owner's ENTIRE traditional-IRA pool, which is not the same set as the
   accounts a single obligation draws from, and reading the pool off the draw list would inflate the
   nontaxable fraction exactly the way the self-referential first draft of Q87 step 2 did. */
/* S5AA R30 ("protect the transfer", the owner 2026-09-28): `heldBack`, when given, maps an account id to dollars the draw must
   leave in it -- a transfer dated after the draw has them spoken for. The sale is still priced on the whole account. */
function withdrawFromAccountList(list,taxClass,amount,age,p,iraBasisState,poolAccounts,heldBack){var pool=poolAccounts||list,taken=0,gains=0,penalty=0,income=0,basisRecovered=0,sources=[],earlyRoth=null,/* Q87 step 2: THE POOL IS MEASURED BEFORE ANY DOLLAR LEAVES IT. Form 8606 line 6 is the total value of that owner's traditional IRAs "as of December 31 ... plus any outstanding rollovers" -- the pre-distribution pool, not what is left afterwards. Computing it live, as the first draft did, made the fraction self-referential: a draw that emptied an account left a pool of zero and taxed the whole distribution, while a partial draw inflated the fraction to 1. The row-by-row probe caught it, and the two errors happened to cancel in the year that was being watched. */iraPoolAtStart=iraPoolsAtStart(pool),basisByOwner={self:0,spouse:0},gainsByOwner={self:0,spouse:0,joint:0};list.forEach(function(a){if(taken>=amount)return;var w=Math.min(heldBack&&Object.prototype.hasOwnProperty.call(heldBack,a.id)?Math.max(0,a.balance-heldBack[a.id]):a.balance,amount-taken);if(w>0)sources.push(a);var basisBefore=taxClass==="taxable"?taxableBasisOf(a):0,balanceBefore=a.balance;a.balance-=w;taken+=w;/* S5AA R23 (R22-01): a Roth dollar drawn while ITS OWNER is under 59 1/2 is the fact the Roth exclusion keys on. */if(taxClass==="roth"&&w>0){var rothOwnerAge=accountOwnerAge(p,age,a);if(rothOwnerAge<59.5){if(!earlyRoth)earlyRoth={amount:0,ownerAge:rothOwnerAge};earlyRoth.amount+=w}}if(taxClass==="taxable"){/* R18 (workstream B): the sale carries its pro-rata share of the dollar basis; the gain may be negative. */var basisOut=balanceBefore>1e-12?basisBefore*w/balanceBefore:0;gains+=w-basisOut;gainsByOwner[a.owner==="spouse"?"spouse":a.owner==="joint"?"joint":"self"]+=w-basisOut;a.basisDollars=basisBefore-basisOut}if(taxClass==="preTax"){/* Q87 step 2: the nontaxable share of this draw is a RETURN OF BASIS, not income. The fraction is
   the OWNER'S, pooled over their traditional IRAs (Form 8606 line 6), so it is read from the same
   function the quote reads. */var nt=iraBasisRecoveredFor(a,w,iraBasisState,iraPoolAtStart);recordIraFlow(iraBasisState,a,"dist",w,nt);income+=w-nt;basisRecovered+=nt;basisByOwner[a.owner==="spouse"?"spouse":"self"]+=nt;/* S5AA R9 ROUND, the owner's decision 4: IRC 72(t)(1) adds 10% of "the portion ... includible in gross income", so the
   basis the draw recovers bears none of it. This charged the rate on the gross w (finding N5 of the R6 round). The quote's
   rPenalty and the transfer's penalty below change with it, so the three still agree. */penalty+=(w-nt)*earlyWithdrawalPenaltyRate(p,age,a)}/* Q99: the includible share is ordinary income, and the 20% is charged ON THAT SHARE. */if(taxClass==="hsa"){var inc=w*hsaIncludibleShare(a);income+=inc;penalty+=inc*hsaAdditionalTaxRate(p,age,a)}});/* EA-04: each owner's recovery comes off that owner's basis, now. */spendIraBasis(iraBasisState,basisByOwner);return {amount:taken,gains:gains,penalty:penalty,income:income,basisRecovered:basisRecovered,basisRecoveredByOwner:basisByOwner,gainsByOwner:gainsByOwner,sources:sources,earlyRoth:earlyRoth}}
function withdrawFromClass(accounts,taxClass,amount,age,p,priorReturn,iraBasisState,heldBack){return withdrawFromAccountList(accounts.filter(function(a){return a.taxClass===taxClass}).sort(withdrawalComparator(p,priorReturn)),taxClass,amount,age,p,iraBasisState,accounts,heldBack)}
/* Audit finding AUD-007 (RETIREMENT_ENGINE_AUDIT_CLAUDE_QUEUE_2026-09-08.md,
 * task T08): the amortization loop below correctly computed each monthly
 * payment (`paid`), but attributed retirement-period cash using a single
 * BLENDED fraction (`paid*retiredShare`) applied to the whole period's
 * total, regardless of when within the period those specific payments
 * actually landed relative to retirement. A debt paid off entirely in the
 * WORKING months before a mid-period retirement still had a share of its
 * (already fully-working-period) payments misattributed to retirement.
 * Fixed below by tallying `paidRetired` per month against
 * `retiredMonthBoundary` (the month index, from the period's own start,
 * where retirement actually begins this period) instead of scaling the
 * total. The housing-cost block immediately above is intentionally left on
 * the blended `retiredShare` -- flat housing costs (property tax, HOA, PMI)
 * aren't tied to specific calendar months the way an amortization schedule
 * is, and the audit's own fix boundary preserves that treatment unchanged. */
/* ARM payment shock (S2 sprint, 2026-09-10, item 8 of §8 in
 * ROADMAP_EXTERNAL_REVIEW.md): the rate steps at nextRateResetAge, but the
 * payment previously never did -- an adjustable debt kept its entered
 * paymentMonthly for the whole projection, so a reset could only change how
 * FAST the balance amortised, never the payment itself. Real ARMs
 * re-amortise the balance at reset over the remaining term; the payment is
 * what jumps, and that jump is the entire reason a retirement plan would
 * model an ARM rather than a fixed loan (debtFlow.retirementPayments feeds
 * requested spending, so this previously could not move retirement cashflow
 * at all after a reset).
 *
 * S5AA TASK 5.1 (Q94, F8): THE SWITCH IS GONE AND THIS IS UNCONDITIONAL, which is the end state the
 * paragraph that stood here already described. It read: "real ARMs re-amortise unconditionally, so
 * this flag is a transitional migration flag, not a modelling choice -- it exists only so this sprint
 * cannot move output for any existing scenario while a whole-model external audit is pending."
 * The audit landed, and it found the flag unreachable: `armRecastOnReset` occurred ONCE in the whole
 * shipped page, inside the default plan, with no input element, no id-to-key mapping and no
 * read-back. So the transitional state was not a default anyone could leave -- it was the only state.
 *
 * AND THE DEFAULT WAS NOT MERELY CONSERVATIVE. A $400,000 loan at 3% resetting to 6% at 45 held its
 * payment at $20,232 a year while 6% interest on the $355,652 balance is $21,339. The payment did not
 * cover the interest: the balance GREW every year from the reset and the loan never paid off. A plan
 * that carried the old key still loads, and is told its projection has moved.
 *
 * When on and past reset, the base payment (before extraPrincipalMonthly,
 * which continues to apply on top unchanged) is recomputed every period from
 * that period's own opening balance and its own remaining term
 * (payoffAge - periodStart) at the reset rate, via
 * DebtAmortization.monthlyPayment() -- never a second hand-rolled PMT. This
 * is deliberately NOT frozen at the moment of reset: recomputing from the
 * current balance and current remaining term at a fixed rate reproduces the
 * exact same level payment at every point along an exactly-amortising
 * schedule, so period-by-period recomputation and a one-time freeze agree
 * whenever the model is internally consistent, and the former needs no
 * extra state on the debt object. */
/* P9 (decision register), closing part of SPRINT_QUESTIONS.md Q35: a row used to expose only retirement-period debt payments, so working-period payments and the interest/principal split were outside the result contract entirely. An across-year financing claim cannot be checked from a within-row net-worth identity, and this is the cheap half of what a household cash-flow ledger needs. Additive: no existing field changes value. */
function projectDebts(debts,periodStart,periodEnd,retiredDuration){var duration=Math.max(0,periodEnd-periodStart),retirementPayments=0,totalPayments=0,totalInterest=0,totalPrincipal=0,totalHousing=0,perDebt=[];debts.forEach(function(d){if(duration<=0)return;var retiredShare=retiredDuration>0?Math.min(1,retiredDuration/duration):0,housing=0;if(d.type==="mortgage"&&d.includeHousingCosts)housing=((Math.max(0,Number(d.annualPropertyTax)||0)+Math.max(0,Number(d.annualInsurance)||0))+12*Math.max(0,Number(d.hoaMonthly)||0)+12*(d.balance>0?Math.max(0,Number(d.pmiMonthly)||0):0))*duration;if(retiredShare)retirementPayments+=housing*retiredShare;totalPayments+=housing;totalHousing+=housing;if(d.balance<=0)return;var zeroPaymentPayoff=0,recastTermRefused=0,/* X01: a revolving balance recomputes its minimum every month, so the decision is inside the loop
        and the count of months where the minimum BOUND is what the disclosure reports. */isRevolving=d.type==="creditCard",revolvingBound=0,isAdjustable=d.rateType==="adjustable",resetAge=Number(d.nextRateResetAge),baseRate=Number(d.rate),resetRate=Number(d.resetRate),enteredPayment=Math.max(0,Number(d.paymentMonthly)||0),extraMonthly=Math.max(0,Number(d.extraPrincipalMonthly)||0),months=Math.max(0,Math.round(duration*12)),/* S5AA R25 (R24F-03, the owner 2026-09-25: settle at the payoff month): the loop ran every month of the year and only
        then paid off a debt whose payoffAge had passed, so a payoff at 60.5 charged interest to 61 ($1,200 against $600 on a
        $10,000 loan at 12%, measured at d67b618). A payoff age strictly inside the year now ends the loop at its month and
        is settled there; one at a year's boundary, or before the year began, runs as before. */payoffAgeValue=Number(d.payoffAge),payoffInside=payoffAgeValue>periodStart+1e-9&&payoffAgeValue<periodEnd-1e-9,loopMonths=payoffInside?Math.min(months,Math.max(0,Math.round((payoffAgeValue-periodStart)*12))):months,balance=d.balance,paid=0,paidRetired=0,debtInterest=0,retiredMonthBoundary=Math.max(0,duration-retiredDuration)*12,scheduledPayment=isAdjustable&&Number.isFinite(Number(d._armScheduledPayment))?Number(d._armScheduledPayment):null;for(var m=0;m<loopMonths&&balance>1e-9;m++){var monthAge=periodStart+m/12,pastReset=isAdjustable&&monthAge>=resetAge-1e-9,effectiveRate=pastReset?resetRate:baseRate,monthlyRate=Math.max(0,effectiveRate||0)/100/12;if(pastReset&&scheduledPayment===null){var recastMonths=Math.max(1,Math.round((d.payoffAge-monthAge)*12));/* Q78, EXT-03: the amortization module refuses a term over its own MAX_TERM_MONTHS by throwing (refused, never clipped). A recast that far out is recorded on the debt and raised by simulatePlan() as the calculation error DEBT_RECAST_TERM_UNSUPPORTED, so a public entry point returns a result, not a RangeError. The payment is not recomputed and the loan is not clipped. */if(recastMonths>DebtAmortization.MAX_TERM_MONTHS)recastTermRefused=Math.max(recastTermRefused,recastMonths);else{scheduledPayment=DebtAmortization.monthlyPayment(balance,effectiveRate,recastMonths);d._armScheduledPayment=scheduledPayment;}}/* X01: A CREDIT CARD IS NOT A TERM LOAN, and src/debt-revolving.js has said so since S3 task 6.
     The module exists, is bundled as `DebtRevolving`, has its own tests -- and the engine named it
     ZERO times. Every debt, cards included, ran through fixed-term amortisation. Positive control:
     the engine names DebtAmortization five times.

     THE DEFINING MECHANIC is that a revolving minimum is the GREATER of a percent of the CURRENT
     balance and a dollar floor, so it FALLS every month as the balance shrinks. That is why a card
     decays geometrically instead of amortising, and why the floor -- not the percent -- is what
     eventually retires it.

     MEASURED on a $10,000 card at 20% with no payment entered, over 40 years: the term-loan model
     compounded it to $27,907,479.93. The revolving mechanic charges $200 in the first month, $164.24
     by month 60, and accrues $43,255.80 of interest over fifty years. Three orders of magnitude.

     THE MINIMUM IS A FLOOR ON THE PAYMENT, NEVER A CEILING. A household that says it pays $500 a
     month on a card pays $500: the entered payment stands wherever it is larger, so every card whose
     entered payment already exceeds its minimum is UNCHANGED. What moves is the card paid at or below
     its minimum -- the case the module was written for, and the case a term loan gets wrong.

     The percent and the floor come from the debt when it carries them and from the module's own
     defaults (2% and $25) when it does not; there is no input for either today, which the disclosure
     says rather than leaving to be discovered. */var interest=balance*monthlyRate,revolvingMinimum=isRevolving?DebtRevolving.minimumPaymentFor(balance,interest,{minimumPercentOfBalance:d.minimumPercentOfBalance,minimumDollarFloor:d.minimumDollarFloor}):null,basePayment=pastReset&&scheduledPayment!==null?scheduledPayment:enteredPayment;if(revolvingMinimum){if(revolvingMinimum.amount>basePayment)revolvingBound++;basePayment=Math.max(basePayment,revolvingMinimum.amount);}var monthlyPayment=basePayment+extraMonthly,applied=Math.min(monthlyPayment,balance+interest);balance=Math.max(0,balance+interest-applied);paid+=applied;debtInterest+=interest;if(m>=retiredMonthBoundary-1e-9)paidRetired+=applied}var monthsOwed=m;if(periodEnd>=d.payoffAge){/* A forced payoff of a zero-payment, interest-bearing debt is recorded apart, so
       simulatePlan() can refuse to present it as spending (debtCheck there). Only a balance actually forced
       out counts: a debt its extra principal clears first records nothing.

       S5AA task 1.5, Q107: the condition was widened, because it was testing the wrong two things.

       It tested the RAW paymentMonthly field against 0. Every dollar this function computes uses
       enteredPayment, which is Math.max(0,Number(d.paymentMonthly)||0) -- so a payment of -50 follows a money
       path IDENTICAL to the flagged case while `=== 0` reads false against it. Measured at 14b7095:
       $166,164,101 forced out at 75, status ok, unflagged.

       And it tested baseRate, which is the rate BEFORE an adjustable reset. A 0% teaser that resets to 5%
       spends the rest of its life interest-bearing and was judged on the rate it no longer has. Measured:
       $164,701 forced out, unflagged -- and the validator raises NOTHING for that one, because the input is
       entirely valid. No widening of the input gates can reach it; only this condition can.

       So: the EFFECTIVE payment (what the loop actually spends, entered plus extra, both already floored at
       zero) against any rate that ACTUALLY APPLIES before the debt ends. A reset later than the payoff age
       never happens, so it cannot make a debt cost anything -- that is a control, not an omission. */
var paymentStated=d.paymentMonthly!==undefined,
    /* X01: A REVOLVING CARD IS NEVER A ZERO-PAYMENT DEBT, and this line is where the wiring would
       otherwise have lied. The comment above says the test is "the EFFECTIVE payment -- what the loop
       actually spends", and until the card had a minimum that WAS `enteredPayment + extraMonthly`. It
       is not any more: a $10,000 card at 20% with nothing entered spends $47,918.54 over forty years,
       every cent of it a minimum payment, and calling that a zero-payment forced payoff would report
       the opposite of what happened. `revolvingBound` counts the months the minimum actually bound, so
       it is the loop's own answer rather than a second guess at one.

       SAID AS A SEPARATE CONDITION, not folded into the arithmetic. The first version of this added a
       dollar to `effectivePayment` to flip the comparison, which gave the right answer for the wrong
       reason and left a payment figure that was not a payment. A card whose minimum is configured to
       nothing -- percent 0 and floor 0 -- pays nothing, binds no months, and is STILL flagged, which
       is the case that would have been lost if the exemption had been written as "revolving debts are
       exempt". */
    effectivePayment=enteredPayment+extraMonthly,
    revolvingPaidSomething=revolvingBound>0,
    resetEverApplies=isAdjustable&&Number.isFinite(resetAge)&&resetAge<Number(d.payoffAge),
    everInterestBearing=baseRate>0||(resetEverApplies&&resetRate>0);
/* Q43's decided scope is PRESERVED, deliberately. An ABSENT paymentMonthly means "not stated", not zero:
   the validator does not warn on it, and Q43 decided it is outside the flagged case. Its control test says
   so in as many words -- "This pins the decided scope, so that widening it is a deliberate change" -- and
   decision 17.1 widened this flag to reach a stated NEGATIVE payment and a teaser reset, not to reach an
   absent one. Weakening that control to let this repair through would be ground rule 3 exactly. Widening
   the absent case is a separate decision, and the owner's. */
if(paymentStated&&effectivePayment<=0&&!revolvingPaidSomething&&everInterestBearing&&balance>.01)zeroPaymentPayoff=balance;paid+=balance;/* R25 (R24F-03): a payoff inside the year falls in retirement only if its month does, the test the payments above use. */if(retiredDuration>0&&(!payoffInside||loopMonths>=retiredMonthBoundary-1e-9))paidRetired+=balance;balance=0}d.balance=balance;/* S5AA R27 (R25-02, the owner 2026-09-26: "PMI while owed"): the housing cost above charged a whole year of PMI whenever
   the mortgage OPENED the year with a balance, so a payoff inside the year -- at its payoff age (R25) or by the payments --
   kept charging PMI after the mortgage was gone: $1,200 against $600 on ChatGPT's R25-02 witness. monthsOwed is the
   number of months the loop ran, each of which opened with a balance; PMI for the rest is taken back out, and the
   retired share counts the owed months on or after the retirement month, the test the payments use. A year owed
   throughout is untouched. Property tax, insurance and HOA are not PMI and are unchanged. */if(d.type==="mortgage"&&d.includeHousingCosts){var pmiRate=Math.max(0,Number(d.pmiMonthly)||0);if(pmiRate>0&&monthsOwed<months){var pmiCharged=12*pmiRate*duration,pmiOwed=pmiRate*monthsOwed,pmiNotOwed=pmiCharged-pmiOwed;totalPayments-=pmiNotOwed;totalHousing-=pmiNotOwed;if(retiredShare)retirementPayments+=pmiRate*Math.max(0,monthsOwed-Math.ceil(retiredMonthBoundary-1e-9))-pmiCharged*retiredShare}}totalPayments+=paid;if(d.includePayment)retirementPayments+=paidRetired;/* Principal reduction is DERIVED as payments less interest, and is NOT clamped at zero. A loan whose payment is smaller than its interest negatively amortizes -- the balance grows, and the honest figure is negative principal, i.e. capitalized interest. Clamping it would have quietly broken the identity below on exactly the debts most worth noticing. paid already includes any payoff-age balloon, which is pure principal. */var debtPrincipal=paid-debtInterest;totalInterest+=debtInterest;totalPrincipal+=debtPrincipal;perDebt.push({revolvingMonthsAtMinimum:revolvingBound,id:d.id,payments:paid,interest:debtInterest,principal:debtPrincipal,balance:balance,zeroPaymentPayoff:zeroPaymentPayoff,recastTermRefused:recastTermRefused})});/* THE IDENTITY THIS EXISTS TO SUPPORT: every dollar of totalPayments is interest, principal reduction, or a housing cost that is neither (property tax, insurance, HOA, PMI). Housing is tracked separately rather than folded in, because calling an insurance premium "debt service" is the sort of quiet misclassification Q35 is about. */return {retirementPayments:retirementPayments,totalPayments:totalPayments,totalInterest:totalInterest,totalPrincipal:totalPrincipal,totalHousing:totalHousing,perDebt:perDebt}}
function growOtherAssets(assets,duration){assets.forEach(function(a){a.value=Math.max(0,a.value*Math.pow(Math.max(0,1+(Number(a.growth)||0)/100),duration))})}
function drawFromOtherAssets(assets,amount,age){var taken=0,rank={liquid:0,limited:1,illiquid:2};assets.filter(function(a){return a.available&&age>=a.availableAge&&a.value>0}).sort(function(a,b){return (rank[a.liquidity]||0)-(rank[b.liquidity]||0)}).forEach(function(a){if(taken>=amount)return;var accessible=a.value*clamp(Number(a.accessPct)||0,0,100)/100,w=Math.min(accessible,amount-taken);a.value-=w;taken+=w});return taken}
/* RP-01: ONE TRANSACTION, not a balance move with accounting bolted on beside it.
 *
 * CR2-01 taught the transfer path that basis travels with the dollars, and put
 * that arithmetic in the CALLER, next to this call. Two definitions of one
 * transaction, which is the defect shape this file has now been bitten by seven
 * times -- and this time it bit within a day.
 *
 * A TRANSFER FROM AN ACCOUNT TO ITSELF. `f.balance -= moved` and
 * `t.balance += moved` cancel when f and t are the same object, so the balance
 * was untouched -- but this still returned a positive `moved`, and the caller's
 * separate basis line added `moved * sourceRate` of arriving basis to a balance
 * that had not changed. Measured on the pre-repair tree: one taxable account of
 * $100,000 at 20% basis, a $50,000 transfer to itself, and
 *
 *     effective basis  20% -> 30%      $10,000 of basis minted from nothing
 *     MAGI             $41,253.06 -> $36,100.00
 *     tax              $628.83 -> $500.00
 *     ending wealth    +$128.83
 *
 * from a transaction that moves no money. The validator accepted it, the import
 * reviewer accepted it, and the generated Worker reproduced it.
 *
 * TWO CHANGES, and the second is what stops this recurring. The same account is
 * a no-op decided BEFORE any amount, income or basis is computed. And the basis
 * transfer now lives HERE, so no future caller can move a balance without
 * moving the basis that belongs to it.
 *
 * The SOURCE rate is deliberately not adjusted: removing dollars in proportion
 * to their own basis leaves the remaining rate unchanged, which is what
 * proportional means. Writing it back would be a no-op that looked like care.
 */
/* S5AA R18 round, WORKSTREAM B (R10-06; design reviewed in the re-audit of 149ca0d, rulings B1 (c) and B2 adopted by
   the owner, 2026-09-22): A TAXABLE ACCOUNT'S BASIS IS DOLLARS. It was a percentage of the balance, so every event that moved
   the balance moved the basis: growth ADDED basis ($500,000 at 100% grown 10% sold for $550,000 with no gain); a cash
   contribution added none; a reinvested, taxed dividend added none, so a later sale taxed it again; a paid dividend took
   basis with it as if it were a sale; and a loss could not exist, the gain fraction being clamped to 0..1. Each engine
   taxable account now carries basisDollars, set from its opening balance x basisPct (still the saved input, never
   written back): growth and fees leave it alone; a contribution, an excess redirect, retained cash and a reinvested or
   imputed taxed dividend add to it; a sale removes its pro-rata share; a transfer carries it; a paid dividend leaves it.
   A sale's gain is proceeds less the basis it carries, and may be negative. */
/* The opening basis is floored at zero and NOT capped: a basisPct above 100 (which the validator warns about) is an account bought for more than it is now worth, an unrealised loss the dollar basis keeps. READ-ONLY: an account the engine has not initialised (a caller of quoteTaxFunding(), which must not mutate what it is given) is read from its opening percentage; only a basis-changing event writes basisDollars. */function taxableBasisOf(a){if(!a)return 0;return Number.isFinite(a.basisDollars)?a.basisDollars:Math.max(0,Number(a.balance)||0)*Math.max(0,Number(a.basisPct)||0)/100}
function initTaxableBasis(accounts){(Array.isArray(accounts)?accounts:[]).forEach(function(a){if(a&&a.taxClass==="taxable")a.basisDollars=Math.max(0,Number(a.balance)||0)*Math.max(0,Number(a.basisPct)||0)/100});return true}
function addTaxableBasis(a,dollars){if(a&&a.taxClass==="taxable"&&dollars>0)a.basisDollars=taxableBasisOf(a)+dollars}
/* The share of a dollar sold that is gain: 1 - basis/balance. Negative when basis exceeds the balance -- a loss. */
function taxableGainFraction(a){var b=Math.max(0,Number(a.balance)||0);return b>1e-12?1-taxableBasisOf(a)/b:0}
/* A taxed yield retained inside total return (the imputed 1.5% with dividends off): the amount taxed, and each
   account's share added to its basis. */
/* S5AA R18 round (workstream B): EACH ACCOUNT PAYS ITS OWN DIVIDEND, balance x yield x duration, which is at most its balance;
   the paid cash takes no basis. Extracted from the row at Claude's R18 self-audit, which retired takeCashFromAccounts() and
   takeCashFromClass(): no live path called them after the repair, and they reduced a balance without touching its basis. */
/* S5AA R28.1 (R27F-02): `held`, when given, adds dollar-years to an account's base -- a transfer's dollars for the part of
   the period the account held them and its balance does not show (negative for a destination's before the date). */
function payOwnDividends(accounts,yieldRate,duration,held){var paid=0;(accounts||[]).forEach(function(ac){var own=held&&ac&&Object.prototype.hasOwnProperty.call(held,ac.id),d=own?Math.min(Math.max(0,ac.balance),Math.max(0,Math.max(0,ac.balance)*duration+held[ac.id])*yieldRate):Math.min(Math.max(0,ac.balance),Math.max(0,ac.balance)*yieldRate*duration);ac.balance-=d;paid+=d});return paid}
/* S5AA R28.1 (beside R27F-02): `dated`, when given, is a transfer inside the row -- {from, to, yield}, the moved dollars' yield
   for the part of the row before the date. The destination's balance holds them for the whole row, so it gives that part up;
   the source earned it, when it is in the set, and it was retained with the dollars, so its basis goes to the destination
   when that is in the set too. */
function imputeRetainedYield(accounts,rate,dated){var total=0,list=accounts||[];list.forEach(function(ac){var d=Math.max(0,Number(ac.balance)||0)*rate;if(dated&&ac===dated.to)d=Math.max(0,d-dated.yield);total+=d;addTaxableBasis(ac,d)});if(dated&&list.indexOf(dated.from)>=0){total+=dated.yield;if(list.indexOf(dated.to)>=0)addTaxableBasis(dated.to,dated.yield)}return total}
/* B1 (c), IRC 1211(b)/1212(b): a net capital loss offsets up to $3,000 of ordinary income, the rest carrying forward. The
   model has no married-filing-separately status, so the $1,500 limit never applies. */
function capitalLossLimit(){return 3000}
/* S5AA R18 self-audit, finding SA18-02 (the owner, 2026-09-23: per owner): A DECEDENT'S CAPITAL LOSS DIES WITH THEM. Publication 559: a decedent's
   capital losses, including carryovers, can be deducted only on the decedent's final return. The household carry is therefore
   held per owner. A sale's gain or loss is its account's owner's, and a joint account's is split between the spouses living in
   that row. A joint return nets them together, as before; its carryover is allocated on each spouse's own net loss for the year
   (26 CFR 1.1212-1(c)(1)(iv)), carry in included. The decedent's share is dropped at the succession, the first row in which
   they count as dead; the death year is their final return and uses it. */
function addGainsByOwner(into,row){if(!row)return;into.self+=Number(row.self)||0;into.spouse+=Number(row.spouse)||0;into.joint+=Number(row.joint)||0}
function allocateCapitalLossCarry(carryIn,gainsByOwner,carryOut,who){var g=gainsByOwner||{},c=carryIn||{},joint=Number(g.joint)||0,selfShare=who&&who.spouseModelled?(who.selfAlive&&who.spouseAlive?.5:who.selfAlive?1:0):1,lossSelf=Math.max(0,-((Number(g.self)||0)+joint*selfShare-(Number(c.self)||0))),lossSpouse=Math.max(0,-((Number(g.spouse)||0)+joint*(1-selfShare)-(Number(c.spouse)||0))),total=lossSelf+lossSpouse;if(!(carryOut>0))return {self:0,spouse:0};if(!(total>0))return {self:carryOut,spouse:0};return {self:carryOut*lossSelf/total,spouse:carryOut*lossSpouse/total}}
function moveFunds(accounts,from,to,amount){var f=accounts.find(function(a){return a.id===from}),t=accounts.find(function(a){return a.id===to});if(!f||!t)return 0;if(f===t)return 0;var moved=Math.min(f.balance,Math.max(0,Number(amount)||0));if(moved<=0)return 0;/* CR2-01: captured BEFORE the balance moves, or the rate below is computed against a balance that already contains the arriving dollars. Pretax dollars are taxed on the way out by the caller, and roth/hsa dollars were taxed on the way in, so both arrive already-taxed and are 100% basis; taxable dollars carry their source's own rate. *//* R18 (workstream B): the basis moves as dollars -- the source's pro-rata share for a taxable source, the whole amount otherwise. */var carried=f.taxClass==="taxable"?(f.balance>1e-12?taxableBasisOf(f)*moved/f.balance:0):moved;if(f.taxClass==="taxable")f.basisDollars=taxableBasisOf(f)-carried;if(t.taxClass==="taxable")t.basisDollars=taxableBasisOf(t)+carried;f.balance-=moved;t.balance+=moved;return moved}
/* Audit finding AUD-003 (RETIREMENT_ENGINE_AUDIT_CLAUDE_QUEUE_2026-09-08.md,
 * task T05): a mandatory RMD is money that legally MUST leave the preTax
 * account regardless of whether the household needs it for spending -- but
 * any portion beyond actual spending/tax/QCD need was previously discarded
 * by a `Math.max(0, ...)` clamp with no bookkeeping at all: the balance left
 * the preTax account and the cash simply vanished from the model.
 *
 * Deposits `amount` (already-taxed cash -- the ordinary-income tax on the
 * full RMD applies regardless of this deposit, tracked separately via
 * `ordinaryWithdrawal`, unaffected by this function) into the household's
 * existing taxable account with the lowest priority number, matching this
 * project's own tie-breaking convention elsewhere. If none exists, this
 * creates one -- purely a local bookkeeping destination for this simulation
 * run (never written back to the user's own saved plan), analogous to
 * normalizedPlan()'s existing pattern of synthesizing an account/asset
 * under specific conditions (its v210Migrated home-equity/mortgage
 * migration). Blends basis as a balance-weighted average, since the newly
 * deposited cash is 100% basis (already taxed) and the account may already
 * hold a mix of basis and unrealized gains. Returns the destination account
 * so the caller can, if it was newly created mid-period, keep growAccounts()
 * from applying a stale, pre-append rate to it for the remainder of this
 * period (see growAccounts()'s own `rates[i]===undefined` guard). */
/* RA-01 (re-audit 2026-09-11): surplus cash is directed PER SOURCE.

   R4 pooled RMD cash and outside-income surplus into one scalar
   (`availableCash`) and then applied one policy to the combined residual --
   so an outside-income preset silently redirected forced RMD proceeds, and
   under `spend` converted them into escalating lifestyle spending. The
   comment below this block asserted that could not happen; the live caller
   said otherwise. Provenance loss was the defect, so provenance is what the
   repair restores, per the user's 2026-09-11 decision to direct each source
   individually.

   `rmd` defaults to `invest` because that IS its pre-R4 behaviour --
   deposit into the lowest-priority taxable account, inheriting its growth
   treatment -- so accepted behaviour is restored by a default rather than by
   a special case. The four outside sources default to `advanced.surplusPolicy`,
   which keeps every saved plan working unchanged.

   ABSENCE and MALFORMEDNESS are deliberately different. Absent means "no
   opinion, use the default". A value that is present but unrecognised means
   something is wrong, and falls back to `retain` -- the conservative
   destination -- so a malformed import can never resurrect the vanishing
   behaviour FM-03 fixed. */
var SURPLUS_SOURCES=["rmd","pension","socialSecurity","otherIncome","dividends"];
function knownSurplusPolicy(v){return v==="invest"||v==="spend"||v==="retain"?v:null}
function surplusPolicyFor(p,source){
  var byS=p.advanced.surplusPolicyBySource,
      raw=byS&&typeof byS==="object"&&!Array.isArray(byS)?byS[source]:undefined;
  if(raw===undefined||raw===null)return knownSurplusPolicy(source==="rmd"?"invest":p.advanced.surplusPolicy)||"retain";
  return knownSurplusPolicy(raw)||"retain";
}
/* RB-02 (re-audit 2): ONE definition of the household cash-holding category.
   Six consumers used to test `a.cashHolding` for bare truthiness -- withdrawal
   ordering, destination selection, the not-a-cash-holding filter, dividend
   eligibility, and the zero-return pin -- and each restated the rule, which is
   how they came to disagree. The string "false" is truthy, so it enrolled a
   ROTH in this category: zero return, and the destination for $34,602.50 of
   retained pension surplus.

   `=== true` alone would not have been enough. The audit is explicit that
   `true` on a Roth still violates the contract, because this category names
   the account the engine may park HOUSEHOLD SURPLUS in. That account has to be
   taxable (retained surplus is not automatically a permitted contribution to a
   tax-advantaged account) and at cash basis (it is after-tax money; a lower
   basis would tax it again on withdrawal). scenario-validator.js rejects
   violations by field, and accountContractCode() rejects them at runPlan()'s
   boundary (not on the exported simulatePlan() or the heat map -- CQ-6) --
   this predicate is what every consumer reads. */
function isHouseholdCashHolding(a){
  return !!a&&a.cashHolding===true&&a.taxClass==="taxable";
}
/* RB-01, the reserved-identity half. The engine synthesizes accounts during
   settlement, and used to hand them the literals "rmd-retained-cash" and
   "household-cash". Once duplicate ids became an ERROR that literal was a
   self-rejection waiting to happen: a user account already carrying the name
   would make the engine produce a plan its own validator refuses. Deriving the
   id removes the collision by construction instead of policing it. */
function uniqueSynthesizedId(accounts,preferred){
  /* CL-01, same assumption: a Set rather than a plain object, so an existing
     account called "__proto__" is recorded like any other name. */
  var taken=new Set();
  for(var i=0;i<accounts.length;i++){var a=accounts[i];if(a&&typeof a.id==="string")taken.add(a.id)}
  if(!taken.has(preferred))return preferred;
  for(var n=2;;n++){var candidate=preferred+"-"+n;if(!taken.has(candidate))return candidate}
}
function retainExcessRmdCash(accounts,amount,sourceAccount,asCash){
  if(amount<=1e-9)return null;
  /* FM-03 / D-1: under the retain policy the destination is a dedicated
     household cash holding rather than whichever taxable account happens to
     sort first. Its growth treatment is explicit (zero, via
     accountReturnForPeriod) instead of inherited, which is what keeps
     retain genuinely conservative rather than invest under another name.
     asCash is false for the pre-existing RMD retention path, so HR-02s
     accepted allocation-inheritance behaviour is unchanged. */
  if(asCash){
    var cash=accounts.filter(isHouseholdCashHolding)[0];
    if(!cash){
      cash={id:uniqueSynthesizedId(accounts,"household-cash"),name:"Retained household cash",type:"customTaxable",taxClass:"taxable",owner:"self",balance:0,basisPct:100,basisDollars:0,cashHolding:true,contributionMode:"dollar",contribution:0,frequency:12,annualChangeMode:"percent",annualChange:0,changeTiming:"annual",contributionPreset:"none",futureChanges:[],priority:(accounts.length?Math.max.apply(null,accounts.map(function(a){return Number(a.priority)||0}))+1:1),matchOn:false,matchRate:0,matchCap:0,profitShare:0,vesting:100,allocation:{}};
      accounts.push(cash);
    }
    addTaxableBasis(cash,amount);cash.balance+=amount;
    return cash;
  }
  var dest=accounts.filter(function(a){return a.taxClass==="taxable"&&!isHouseholdCashHolding(a)}).sort(function(a,b){return (Number(a.priority)||0)-(Number(b.priority)||0)})[0];
  if(!dest){
    dest={id:uniqueSynthesizedId(accounts,"rmd-retained-cash"),name:"Retained RMD cash",type:"customTaxable",taxClass:"taxable",owner:"self",balance:0,basisPct:100,basisDollars:0,contributionMode:"dollar",contribution:0,frequency:12,annualChangeMode:"percent",annualChange:0,changeTiming:"annual",contributionPreset:"none",futureChanges:[],priority:(accounts.length?Math.max.apply(null,accounts.map(function(a){return Number(a.priority)||0})):0)+1,matchOn:false,matchRate:100,matchCap:4,profitShare:0,vesting:100,allocation:sourceAccount&&sourceAccount.allocation?clone(sourceAccount.allocation):{}};
    accounts.push(dest)
  }
  addTaxableBasis(dest,amount);
  dest.balance=dest.balance+amount;
  return dest
}
/* RC-01: the pretax dollars a conversion-like move may take THIS row -- the
   balance on hand, less what the year's required distribution is owed.

   Two paths can drain the pretax class before the RMD withdrawal runs, and the
   addendum's acceptance criteria name both: the Roth conversion, and the
   explicit pretax-to-Roth transfer immediately above it. One helper rather than
   two guards, because two restatements of a rule is how this engine's other
   contracts came to disagree.

   The obligation uses openingPreTax so rmdFor()'s prior-year-balance basis is
   preserved; the capacity is read live, because the transfer can already have
   moved money since the row opened. Reserving against ANY pretax source rather
   than only the Roth destination is deliberate: the required dollars have to
   remain available to be DISTRIBUTED, whatever the move was aimed at. */
/* Q96 (F10): THE TAX CHARACTER OF AN EMPLOYER MATCH, AND THEREFORE WHERE IT LANDS.

   The row used to add the match straight to the account that earned it -- `target.balance+=match` --
   so a match on a Roth 401(k) went into the Roth bucket and was never taxed, and a match on a
   traditional 401(k) went pre-tax. The second is right, but by accident of the DEFERRAL'S class
   rather than by any rule about the match.

   THE AUDIT'S OWN REMEDY WAS WRONG IN THE OTHER DIRECTION. Its premise was that a Roth 401(k) match
   is "generally taxable". Under SECURE 2.0 section 604 an employer match is PRE-TAX BY DEFAULT and
   designated Roth only by the EMPLOYEE'S election (Notice 2024-2, section L answer 1), so taxing it because the
   employee chose a Roth deferral would have been a second error. The corrected remedy is built here:
   a per-account election, defaulting to pre-tax.

   ANSWER 3 MAKES FULL VESTING A CONDITION OF THE ELECTION, not a proportion of it: a match may be
   designated Roth "only if the employee is fully vested in matching contributions at the time the
   contribution is allocated", and a partially vested employee "may not designate ANY PART" of it. So
   anything short of 100 refuses the election outright and the match falls back to pre-tax. The
   separate reduction of the match BY the vesting percentage is the engine's existing treatment of
   `vesting` and is untouched.

   Answer 2 makes an elected match includible in gross income for the taxable year in which it is
   allocated, which is the row that allocates it. Answer 6 keeps it OUT of the FICA wage base -- it is
   excluded under section 3121(a)(5)(A) and (D) and expressly not added back under 3121(v)(1)(A) --
   so the election moves income tax and no payroll tax at all. Checked against Notice 2024-2 itself
   before any of this was written: Handover temp/S5AA_CITATION_CHECKS_20260920.md, under Notice 2024-2. */
function employerMatchIsRoth(account){
  return !!(account&&account.matchRoth)&&Number(account.vesting)===100;
}
/* Q96: WHERE THE MATCH LANDS FOLLOWS FROM ITS CHARACTER, not from where the deferral went. The
   destination is that owner's lowest-priority WORKPLACE account of the required class -- employer
   money belongs in an employer plan, not in an IRA -- and one is synthesized when the household holds
   none, following retainExcessRmdCash(), which already synthesizes a destination rather than dropping
   money it has no home for. It inherits the earning account's allocation, so the match grows the way
   the plan it came from does. */
function employerMatchDestination(accounts,target,wantRoth){
  var owner=target&&target.owner==="spouse"?"spouse":"self",
      wantClass=wantRoth?"roth":"preTax",
      pool=accounts.filter(function(a){
        return a&&a.taxClass===wantClass&&(a.owner==="spouse"?"spouse":"self")===owner
          &&accountType(a.type).limitGroup==="workplace";
      }).sort(function(a,b){return (Number(a.priority)||0)-(Number(b.priority)||0)});
  if(pool.length)return pool[0];
  var made={id:uniqueSynthesizedId(accounts,"employer-match-"+(wantRoth?"roth":"pretax")),
    name:"Employer match ("+(wantRoth?"Roth":"pre-tax")+")",
    type:wantRoth?"roth401k":"traditional401k",taxClass:wantClass,owner:owner,balance:0,basisPct:0,
    contributionMode:"dollar",contribution:0,frequency:12,annualChangeMode:"percent",annualChange:0,
    changeTiming:"annual",contributionPreset:"none",futureChanges:[],
    priority:(accounts.length?Math.max.apply(null,accounts.map(function(a){return Number(a.priority)||0})):0)+1,
    matchOn:false,matchRate:0,matchCap:0,profitShare:0,vesting:100,
    allocation:target&&target.allocation?clone(target.allocation):{}};
  accounts.push(made);
  return made;
}
/* Q90: reserves the SAME obligations the row will pay, in the same commit as the change that
   computes them. If this reserved a different figure a conversion would consume balance a
   distribution is owed from -- the failure the task names, and the reason the two move together. */
/* S5AA R11 round, external audit of 02b921a (R10-02): WHAT A CONVERSION OR TRANSFER MAY SPEND, PER OBLIGATION.
   Required distributions are per owner and per plan (task 4.2, rmdObligations()): an owner's IRAs are one obligation,
   each employer plan is its own, and one owner's money can never pay another's. This reserved them as ONE HOUSEHOLD
   NUMBER -- every pre-tax balance less every required distribution -- so a conversion could empty the account that
   owed while somebody else's balance covered the shortfall on paper, and the row then ended in RMD_NOT_DISTRIBUTED for
   an input the app allows. MEASURED at 02b921a: self 80 with a $100,000 IRA and a spouse of 60 with another, a
   $195,000 request, self's IRA emptied with $4,950.50 owed from it.
   Returns one group per obligation, plus one for the pre-tax money that owes nothing, each with the accounts it covers
   and what may leave them. A QCD is not credited here: the row settles QCDs after the conversion, so the whole
   obligation stays reserved, which errs towards leaving the money in place. */
function conversionCapacityGroups(accounts,age,p,openingById,duration){
  var list=Array.isArray(accounts)?accounts:[],
      pre=list.filter(function(a){return a&&a.taxClass==="preTax"}),
      obligations=rmdObligations(accounts,age,p,openingById),
      groups=[],claimed=[];
  obligations.forEach(function(o){
    var mine=(o.accounts||[]).filter(function(a){return pre.indexOf(a)>=0}),
        held=mine.reduce(function(t,a){return t+Math.max(0,Number(a.balance)||0)},0);
    mine.forEach(function(a){claimed.push(a)});
    groups.push({accounts:mine,capacity:Math.max(0,held-o.amount*duration),reserve:o.amount*duration,drawn:false});
  });
  var rest=pre.filter(function(a){return claimed.indexOf(a)<0});
  if(rest.length)groups.push({accounts:rest,capacity:rest.reduce(function(t,a){return t+Math.max(0,Number(a.balance)||0)},0),reserve:0,drawn:false});
  return groups;
}
/* R12 round, external re-audit of b053dc2 (R11-01): WHAT A DRAWN OBLIGATION KEEPS OUT OF THE ROW'S RETURN. The groups
   above leave each obligation its own money, but as an exact nominal amount, still invested, and the row's return runs
   before the required distribution is paid: a conversion under a 10% loss left $4,950.50 owed and $4,455.45 to pay it
   with. The law gives the order -- the first dollars out of an IRA in a year count toward its required distribution, and
   a required distribution cannot be converted -- so it comes out first. Once a conversion or transfer has drawn on a
   group, its reserve is held out of the growth that runs before the distribution, exactly as though it had been paid
   before the conversion. Nothing is sized by the coming return (that would be lookahead). A group no conversion or
   transfer touched keeps its whole balance invested. Returns {accountId: dollars held out}.
   R13 round, external audit of 4e23619 (R12-01): the reserve is spread in the order the distribution is PAID --
   withdrawalComparator(p, priorReturn), which payQcdFromOwnerIras() and the settlement both sort by -- so the dollars
   held out of the return are the dollars paid out. It was spread in account-array order, and where two IRAs earn
   different returns the protected one was not the paying one: listed a,b and b,a, one owner's pre-tax assets ended
   $1,633.66 apart, the RMD times the 30-point gap between the two IRAs' returns. The comparator reads priority (or the
   optimized score), never a balance, and the sort is stable over the same input, so the orders agree.
   R14 round, external re-audit of 6468235 (R13-01): `held` has NO PROTOTYPE, like openingById below and CL-01's
   Set in accountContractCode(). An account id is any unique string the validator accepts, and as a plain-object key
   "constructor", "toString" or "hasOwnProperty" READ an inherited function -- `(held[id]||0)+take` built a string,
   growAccounts() a NaN, and the row ended in TAX_QUOTE_NONFINITE_CONTEXT -- while "__proto__" hit the inherited
   accessor and was never held out of the loss at all. */
function rmdProtectedAmounts(groups,p,priorReturn){
  var held=Object.create(null);
  (Array.isArray(groups)?groups:[]).forEach(function(g){
    if(!g||!g.drawn||!(g.reserve>0))return;
    var left=g.reserve;
    g.accounts.slice().sort(withdrawalComparator(p,priorReturn)).forEach(function(a){var take=Math.min(Math.max(0,Number(a.balance)||0),left);if(take>0){held[a.id]=(held[a.id]||0)+take;left-=take}});
  });
  return held;
}
/* What the WHOLE household may convert: every obligation's own capacity, added up. */
function preTaxConvertible(accounts,age,p,openingById,duration){
  return conversionCapacityGroups(accounts,age,p,openingById,duration).reduce(function(t,g){return t+g.capacity},0);
}
/* And what ONE account may hand over: its own obligation's capacity, which is the clamp a single-source transfer needs. */
function accountConvertible(account,accounts,age,p,openingById,duration){
  var groups=conversionCapacityGroups(accounts,age,p,openingById,duration);
  for(var i=0;i<groups.length;i++)if(groups[i].accounts.indexOf(account)>=0)return groups[i].capacity;
  return 0;
}
/* Q97 (G1): WHICH accounts a conversion moves money BETWEEN. The row used to take
   accounts.find(x=>x.taxClass==="preTax") and accounts.find(x=>x.taxClass==="roth") -- the first of
   each IN ARRAY ORDER -- and clamp the conversion at that ONE account's balance. So the executed
   amount depended on the order the household happened to list its accounts in: $50,000 requested
   against pre-tax accounts of $20,000 and $80,000 converted $20,000 with the small one first and
   $50,000 with the big one first. The same household, the same request, two answers.

   SOURCES sort on withdrawalComparator(), which is the engine's one definition of draw order --
   `priority` when the household orders its own accounts, the optimizer's score when it does not.
   Stating it here rather than restating `a.priority-b.priority` is the point: a conversion is a
   pre-tax draw, and every other pre-tax draw already sorts this way.

   DESTINATIONS sort on plain `priority` alone, ascending, following the RMD cash deposit above --
   the optimizer's score answers "which account should we SPEND from", which a deposit is not.

   OWNERSHIP IS A CONDITION, NOT A PREFERENCE. A conversion is one person's distribution and their
   own rollover contribution (IRC 408A(d)(3) -- a qualified rollover contribution is made to THE
   INDIVIDUAL'S Roth), so a source is routed only to a Roth account of its OWN owner. An owner with
   pre-tax money and no Roth account of their own has nothing to convert, and no ordering of the
   array can authorise sending it to the other spouse.

   S5AA R9 ROUND, the owner's decision 10 (2026-09-21): AND THE DESTINATION'S TYPE IS A CONDITION FOR AN IRA. The IRS
   rollover chart: traditional IRA to a designated Roth account -- "No". A conversion out of an IRA is a rollover
   contribution to a Roth IRA (IRC 408A(d)(3)); a Roth 401(k) takes in-plan rollovers of its own plan's money (IRC
   402A(c)(4)). This picked the owner's lowest-priority Roth account of ANY type, so a traditional IRA converted into a
   Roth 401(k) (finding N6 of the R6 round, citation check 24). A traditional IRA now goes only to a Roth IRA or a custom
   tax-free account (decision 3b: a custom account is treated as an IRA of its tax class); an employer plan's or a custom
   tax-deferred account's money goes to any Roth account of its owner, as before. No lawful destination, no route. */
/* THE ONE RULE for where pre-tax money may be converted, read by conversionRoutes() below and by the manual transfer
   (fifth internal audit, finding 2: a transfer bypassed both halves of it). The destination must be the source owner's
   own Roth account (Q97; IRC 408A(d)(3)), and a traditional IRA's must be a Roth IRA or a custom tax-free account
   (decision 10). */
/* S5AA R29 (decided with PCF-02; the owner 2026-09-28: "Refuse it"): money reaches a workplace plan through payroll, a rollover of the
   same tax character, or a conversion to the owner's own Roth account (lawfulConversionDestination(), which refuses the rest of that
   case itself). A transfer into one from any other kind of account has no lawful route, so it moves nothing. The validator refuses
   the same plans (TRANSFER_INTO_WORKPLACE_PLAN); the engine does not call it, so it says so too. */
/* S5AA R29 (PCF-02): a transfer INTO an IRA or an HSA from a different kind of account puts new money into it: a contribution.
   Not a same-kind move (a rollover), and not a pre-tax to Roth transfer (a conversion). */
/* S5AA R29 (decided with PCF-02; the owner 2026-09-28: "Model the funding rule"): a traditional IRA to its owner's HSA is a
   QUALIFIED HSA FUNDING DISTRIBUTION (IRC 408(d)(9)) -- excluded from income, not deductible, and counted toward the year's HSA
   limit; once in a lifetime, which the plan's single one-time transfer cannot exceed; and only into the IRA owner's OWN HSA. Any other pre-tax account reaches an HSA
   only as a taxable distribution followed by a contribution. */
/* S5AA R30 (raised in ChatGPT's R29 change audit; the owner 2026-09-28: "Research, then repair in R30"): A PRE-TAX TRANSFER THAT IS
   A DISTRIBUTION COUNTS TOWARD THE YEAR'S REQUIRED DISTRIBUTION, WHEREVER THE DOLLARS GO NEXT. 26 CFR 1.408-8(g)(1): "all amounts
   distributed from an IRA are taken into account in determining whether section 401(a)(9) is satisfied, regardless of whether
   the amount is includible in income"; 1.401(a)(9)-5(g)(2)(i) says the same of an employer plan's individual account. Since R15
   (R14-01) a transfer into a TAXABLE account was credited; one into an HSA -- a distribution then a contribution, or a qualified
   HSA funding distribution, excluded from income but distributed all the same -- was held above the reserve, and the whole
   requirement was drawn on top of it ($9,750 from a $100,000 IRA into the spouse's HSA at 80, and $4,950.50 more). A move that
   stays sheltered -- a rollover, a Roth conversion -- still cannot use the reserve: a required distribution cannot be rolled
   over or converted. */
function transferCountsTowardRmd(f,t){return !!(f&&t&&f!==t&&f.taxClass==="preTax"&&(t.taxClass==="taxable"||t.taxClass==="hsa"))}
function transferIsHsaFunding(f,t){return !!(f&&t&&f!==t&&t.taxClass==="hsa"&&f.taxClass==="preTax"&&f.type==="traditionalIRA"&&(f.owner==="spouse")===(t.owner==="spouse"))}
function transferIsContribution(f,t){if(!f||!t||f===t||f.taxClass===t.taxClass)return false;var g=accountType(t.type).limitGroup;if(g!=="ira"&&g!=="hsa")return false;return !(f.taxClass==="preTax"&&t.taxClass==="roth")}
/* S5AA R32 (R30A-02 of ChatGPT's R30A account and transfer audit; the owner 2026-09-28: "Refuse it"): A ROTH IRA CANNOT ROLL INTO A
   401(k). Publication 590-A: "A rollover from a Roth IRA to an employer retirement plan isn't allowed." R29 refused only a transfer
   from a different tax class, so a Roth IRA into a Roth 401(k), both Roth, moved ($10,000 into a +10% Roth 401(k) held $11,000 a
   year later; reproduced at 66c406c). A designated Roth account into a Roth IRA is still a rollover. */
function transferIntoWorkplaceRefused(f,t){return !!(f&&t&&f!==t&&accountType(t.type).limitGroup==="workplace"&&((f.taxClass!==t.taxClass&&!(f.taxClass==="preTax"&&t.taxClass==="roth"))||f.type==="rothIRA"))}
/* S5AA R32 (R30A-03; the owner 2026-09-28: "Refuse it"): A ROLLOVER STAYS WITH ITS OWNER. IRC 408(d)(3)(A) pays an IRA rollover into
   an account or plan "for the benefit of such individual", and 223(f)(5)(A) an HSA rollover into an HSA "for the benefit of such
   beneficiary". A move between the named sheltered accounts of one tax class is such a rollover, so it is refused when their owners
   differ: a divorce instrument, a QDRO and a death are separate paths, and marriage alone is not one. R29 checked ownership only for
   a conversion, so the self's IRA or HSA rolled into the spouse's ($10,000 into a +10% account held $11,000; reproduced at
   66c406c), outside every owner-specific limit. Different tax classes are a distribution, a conversion or a contribution by
   their own rules (R29), a taxable account is a gift, and the model's custom wrappers are its own; none is refused here. */
/* S5AA R32 (R30A-01 of ChatGPT's R30A account and transfer audit; the owner 2026-09-28: "Move taxable part only"): AN IRA ROLLS ONLY
   ITS TAXABLE MONEY INTO AN EMPLOYER PLAN. IRC 408(d)(3)(A)(ii): what is paid into an eligible employer plan "may not exceed the
   portion of the amount received which is includible in gross income"; 408(d)(3)(H): the part rolled over is treated as income
   first, across all the owner's IRAs. The engine moved an IRA's after-tax money into a 401(k) as pre-tax: $8,600 of all-basis
   IRA money went in, its basis stayed on an empty IRA, sheltered a later deductible $2,000, and the 401(k) was taxed in full --
   $957 of tax too much (reproduced at 66c406c and 8afe16d). A traditional IRA into a traditional 401(k) is now held to the
   owner's taxable IRA value on the date; the rest stays in the IRA, keeping its basis. */
function transferIraIntoWorkplace(f,t){return !!(f&&t&&f!==t&&f.type==="traditionalIRA"&&t.taxClass==="preTax"&&accountType(t.type).limitGroup==="workplace")}
/* The named types are listed inside the function: the Worker is built from the engine's listed functions, not its globals. */
function transferBetweenOwnersRefused(f,t){var named=["traditionalIRA","traditional401k","rothIRA","roth401k","hsa"];return !!(f&&t&&f!==t&&f.taxClass===t.taxClass&&named.indexOf(f.type)>=0&&named.indexOf(t.type)>=0&&(f.owner==="spouse")!==(t.owner==="spouse"))}
function lawfulConversionDestination(source,destination){
  if(!source||!destination||source.taxClass!=="preTax"||destination.taxClass!=="roth")return false;
  if((source.owner==="spouse"?"spouse":"self")!==(destination.owner==="spouse"?"spouse":"self"))return false;
  return source.type!=="traditionalIRA"||destination.type==="rothIRA"||destination.type==="customRoth";
}
function conversionRoutes(accounts,p,priorReturn){
  var list=Array.isArray(accounts)?accounts:[],roths=list.filter(function(a){return a&&a.taxClass==="roth"});
  var lower=function(x,y){return !y||(Number(x.priority)||0)<(Number(y.priority)||0)};
  return list.filter(function(a){return a&&a.taxClass==="preTax"&&a.balance>1e-9})
    .sort(withdrawalComparator(p,priorReturn))
    .map(function(a){var best=null;roths.forEach(function(r){if(lawfulConversionDestination(a,r)&&lower(r,best))best=r});return {source:a,destination:best};})
    .filter(function(r){return !!r.destination;});
}
/* Q97: the move itself, over that route. The caller has already clamped `amount` by the required
   distribution it must leave behind and by what the household asked for; this spends the remainder
   across as many of its own accounts as it takes, and returns WHAT IT ACTUALLY MOVED -- so a
   household with less pre-tax money than it requested converts its capacity rather than nothing,
   and the ordinary income the row recognises is what the balances actually did. */
/* EA-05: AND WHAT OF IT IS INCOME. A conversion is a distribution from the IRA -- Form 8606 counts it with
   the others -- so each source is priced by iraBasisRecoveredFor() over the pools measured before the
   first dollar moves, and the recovery is spent from the owner's basis. Returns the gross moved (the
   balances), the part of it that is ordinary income, and the basis recovered by owner. */
function convertPreTaxToRoth(accounts,p,amount,priorReturn,iraBasisState,capacityGroups){
  var remaining=Math.max(0,Number(amount)||0),moved=0,taxable=0,pools=iraPoolsAtStart(accounts),byOwner={self:0,spouse:0},routes=conversionRoutes(accounts,p,priorReturn);
  /* R11 round, audit R10-02: each source is spent against ITS OWN obligation's capacity, not just the household total
     the caller clamped by. Without the groups (a direct call) nothing but the household clamp applies, as before. */
  var groupOf=function(a){if(!Array.isArray(capacityGroups))return null;for(var i=0;i<capacityGroups.length;i++)if(capacityGroups[i].accounts.indexOf(a)>=0)return capacityGroups[i];return null};
  routes.forEach(function(r){
    if(remaining<=1e-9)return;
    var group=groupOf(r.source),take=Math.min(r.source.balance,remaining);
    if(group)take=Math.min(take,Math.max(0,group.capacity));
    if(take<=0)return;
    if(group){group.capacity-=take;group.drawn=true}
    var nt=iraBasisRecoveredFor(r.source,take,iraBasisState,pools);recordIraFlow(iraBasisState,r.source,"conv",take,nt);
    r.source.balance-=take;r.destination.balance+=take;moved+=take;remaining-=take;
    taxable+=take-nt;byOwner[r.source.owner==="spouse"?"spouse":"self"]+=nt;
  });
  spendIraBasis(iraBasisState,byOwner);
  /* Decision 10 (R9 round): the request was not met, and a traditional IRA holding money had no lawful destination. */
  var iraRefused=remaining>1e-9&&(Array.isArray(accounts)?accounts:[]).some(function(a){return a&&a.type==="traditionalIRA"&&a.balance>1e-9&&!routes.some(function(r){return r.source===a})});
  return {amount:moved,taxableIncome:taxable,basisRecoveredByOwner:byOwner,iraRefused:iraRefused};
}
/* S5R-02 and S5R-03 (the 2026-09-16 external audit; decided by the owner on 2026-09-16, answers 2 (A) and 4 (A)): how much of a
   row's requested QCD each owner may give. S5 task 10 capped the household at $111,000 x (1 + an eligible spouse) x the
   row's duration. The exclusion is per taxpayer, for distributions from that taxpayer's own IRA (IRS Publication 590-B;
   Notice 2025-67), and the cap is annual: one owner's $6M IRA had $222,000 excluded, and a half-year row with $150,000 a
   year excluded $55,500 of a $75,000 request.
   - The request is a yearly amount, prorated over the row, as before.
   - It is split across the eligible owners -- self, and a spouse who is on, each 70 1/2 or older at the row's start --
     by each one's share of the eligible owners' traditional-IRA balances (account type traditionalIRA; an account
     owned by "spouse" is the spouse's, any other is self's). An ineligible spouse's IRA takes no share.
   - Each owner's part is limited to the annual cap and to that owner's IRA balance. The cap is not prorated: rows are at
     most a year, and the opening partial row assumes no QCD earlier that year (runPlan() discloses it).
   - A household with no eligible owner's traditional IRA gives nothing, whatever other pre-tax accounts hold.
   - A request that is not positive gives nothing.
   S5AA R9 ROUND, the owner's decision Q3 (2026-09-21): A QCD DOES NOT WAIT FOR, AND IS NOT CAPPED BY, A REQUIRED
   DISTRIBUTION. IRC 408(d)(8)(B)(ii) allows it from the day the owner is 70 1/2; SECURE and SECURE 2.0 moved the RMD
   age and left that one. This function returned nothing unless an RMD was due, and scaled the parts down to the RMD,
   so a 71-year-old's gift waited until 73 and a gift above the RMD was cut to it (DeepSeek audit, finding 2c/01).
   Once an RMD is due the QCD still counts toward the owner's IRA obligation -- the loop credits it there.
   Returns [self, spouse]. Balances are read as they stand when the row's distribution is set. */
function qcdOwnerRequests(p,accounts,age,spouseAge,duration){
  var none=[0,0],eligibleAge=RULES.retirement.rmd.qcdEligibleAge,request=p.advanced.qcd*duration;
  if(!(request>0))return none;
  var cap=RULES.retirement.qcd.records.filter(function(r){return r.provision_id==="qcd_annual_cap"})[0].value;
  var owners=[{eligible:age>=eligibleAge,balance:0},{eligible:Boolean(p.profile.spouseOn)&&spouseAge>=eligibleAge,balance:0}];
  accounts.forEach(function(a){if(a.type==="traditionalIRA"&&a.balance>0)owners[a.owner==="spouse"?1:0].balance+=a.balance});
  var eligibleBalance=owners.reduce(function(s,o){return s+(o.eligible?o.balance:0)},0);
  if(!(eligibleBalance>0))return none;
  return owners.map(function(o){return o.eligible&&o.balance>0?Math.min(cap,request*o.balance/eligibleBalance,o.balance):0});
}
/* S5RR-01 (the 2026-09-16 re-audit; decided by the owner on 2026-09-16, answer 2 (A) of the third set): a QCD is a transfer from
   the owner's own IRA to a charity, so each owner's part is paid first, straight from that owner's traditional IRAs, in
   their withdrawal order. Until then the exclusion was set per owner but the RMD was withdrawn from pre-tax accounts in
   the household's order, so a 401(k) listed first paid a $100,000 "IRA" QCD, and one spouse's IRA paid both spouses'
   $161,000. What is paid counts toward the RMD, and the exclusion is what was paid. Each part is bounded by the owner's
   IRA balance when the distribution is set and is paid before anything else moves, so the owner's IRAs hold it; no part
   is ever moved to another owner or account. */
/* Q90: byOwner is reported as well as the total, because a QCD counts toward THAT owner's IRA
   obligation only -- never a 401(k)'s, and never the other owner's. */
function payQcdFromOwnerIras(accounts,parts,p,priorReturn,iraBasisState){
  var paid=0,sources=[],byOwner=[0,0];
  [0,1].forEach(function(owner){
    var want=parts[owner],taken=0;if(!(want>0))return;
    accounts.filter(function(a){return a.type==="traditionalIRA"&&(a.owner==="spouse"?1:0)===owner}).sort(withdrawalComparator(p,priorReturn)).forEach(function(a){if(taken>=want)return;var w=Math.min(Math.max(0,a.balance),want-taken);if(w>0){sources.push(a);a.balance-=w;taken+=w;recordIraFlow(iraBasisState,a,"qcd",w,0)}});
    paid+=taken;byOwner[owner]=taken;
  });
  return {amount:paid,sources:sources,byOwner:byOwner};
}
/* Q90 (F4, N2, with G18): a household's required distributions are a LIST OF OBLIGATIONS, not one number.
   The old form took taxClassBalance(accounts,"preTax") -- every pre-tax account of BOTH owners and ALL plan
   types pooled -- divided it by ONE divisor taken from the primary profile's age, and let any pre-tax
   account satisfy it. Three separate errors in one expression:
     - a spouse's IRA was charged on the primary profile's age and start age. Self 75 with $500,000 and a
       spouse of 60 with $500,000 owed $40,650.41; the spouse owes NOTHING until their own start age, so
       $20,325.20 was charged that is not owed;
     - IRAs and employer plans were pooled, so a 401(k)'s distribution could be satisfied from an IRA and
       the reverse. That is the ACCOUNT section 18 spec invariant, test 8, which this makes pass;
     - and because the total was one number, nothing could be paid from the right place.

   THE AGGREGATION RULE, which is the whole point: an owner's traditional IRAs AGGREGATE -- one obligation,
   payable from any of them -- while each EMPLOYER plan stands alone and must be paid from itself. An
   account whose type carries no limit group (customTraditional) is treated as its own plan rather than
   aggregated, because aggregating unlike plans is precisely the error being repaired.

   Balances come from openingById, the per-account balance at the row's open, so the prior-year basis
   rmdFor() always used is preserved per obligation. A NUMBER is still accepted there for the pooled
   pre-tax balance and is apportioned by each account's live share -- the best reconstruction available
   from a figure that has already lost the split, and exact for a single-account household. */
function rmdObligations(accounts,age,p,openingById){
  if(!p||!p.advanced||!p.advanced.rmdOn)return [];
  var list=Array.isArray(accounts)?accounts:[],
      pre=list.filter(function(a){return a&&a.taxClass==="preTax"}),
      pooled=typeof openingById==="number"?openingById:null,
      liveTotal=pre.reduce(function(t,a){return t+Math.max(0,Number(a.balance)||0)},0),
      balanceOf=function(a){
        if(pooled!==null)return liveTotal>0?pooled*(Math.max(0,Number(a.balance)||0)/liveTotal):0;
        if(openingById&&Object.prototype.hasOwnProperty.call(openingById,a.id))return Math.max(0,Number(openingById[a.id])||0);
        return Math.max(0,Number(a.balance)||0);
      },
      uniform=RULES.retirement.rmd.uniformLifetime,
      profile=p.profile||{},
      selfStartAge=Number(profile.age),
      owners=[{key:"self",index:0,ageNow:age,ageAtStart:selfStartAge}];
  if(profile.spouseOn)owners.push({key:"spouse",index:1,
    ageNow:Number(profile.spouseAge)+(age-selfStartAge),ageAtStart:Number(profile.spouseAge)});
  var out=[];
  owners.forEach(function(o){
    if(!Number.isFinite(o.ageNow))return;
    if(!(o.ageNow>=rmdStartAge(p,o.ageAtStart)))return;
    var divisor=uniform[String(Math.min(120,Math.floor(o.ageNow)))]||2,
        mine=pre.filter(function(a){return (a.owner==="spouse"?1:0)===o.index}),
        iras=mine.filter(function(a){return a.type==="traditionalIRA"}),
        iraBalance=iras.reduce(function(t,a){return t+balanceOf(a)},0);
    if(iraBalance>0)out.push({owner:o.key,ownerIndex:o.index,kind:"ira",accounts:iras,amount:iraBalance/divisor});
    mine.filter(function(a){return a.type!=="traditionalIRA"}).forEach(function(a){
      var b=balanceOf(a);
      if(b>0)out.push({owner:o.key,ownerIndex:o.index,kind:"plan",accounts:[a],amount:b/divisor});
    });
  });
  return out;
}
/* Q90: the household view of the same obligations. The ACCOUNT section 18 spec invariant requires an OBJECT
   here, because a single number cannot say which plan owes what and therefore cannot stop one plan paying
   another's. */
function rmdFor(accounts,age,p,openingById){
  var obligations=rmdObligations(accounts,age,p,openingById);
  return {total:obligations.reduce(function(t,o){return t+o.amount},0),obligations:obligations};
}
function historyIndex(p,offset){var i=HIST_RETURNS.findIndex(function(x){return x[0]>=p.assumptions.historyStart});return ((Math.max(0,i)+offset)%HIST_RETURNS.length+HIST_RETURNS.length)%HIST_RETURNS.length}
/* FM-01 fix (FULL_MODEL_AUDIT_AND_CLAUDE_HANDOVER_20260910.md): indexing
   into COLA history needs an OWNER-SPECIFIC calendar origin.

   The previous form chose its history year with
     startHistoryIndex + floor(startAge - p.profile.age) + i
   where `startAge` was whichever person's claim age the caller passed while
   `p.profile.age` was ALWAYS the self's opening age. For a spouse call those
   are two different age scales, so the expression computed the AGE GAP
   BETWEEN TWO PEOPLE and spent it as ELAPSED CALENDAR TIME. A spouse two
   years older read COLA two calendar years further down the table than the
   simulation had reached -- future data reaching an earlier payment.

   On the shipped data that made a self-65/spouse-67 household's second
   period pay $13,044: $12,000 x 1.087, which is 2022's real COLA on a 2021
   payment. Live, not merely reproducible under a synthetic edit.

   `ownerStartAge` is now explicit. Each owner's claim offset is measured
   against THAT owner's opening age while both advance on one shared
   simulation calendar. It defaults to the self's age so any caller that
   genuinely means the self is unchanged.

   NOT A CLAMP. Capping the bad index at the current year would suppress the
   symptom while still applying the wrong past COLA.

   SCOPE, deliberately narrow. Only the index ORIGIN changes. The number of
   COLA steps is untouched: it remains elapsed whole years since the claim.
   An earlier revision of this repair also moved the step count to start at
   the owner's opening age, on the theory that pre-projection growth cannot
   be reconstructed. That was wrong and the fixture protocol caught it --
   ssaBenefitAtClaim() treats the entered figure as the FRA-referenced PIA,
   not as today's payment, so COLA growth from the claim age forward is how
   the model brings it to the current year. Removing a step silently cut a
   legitimate $1,008 of annual benefit in the rmd-and-roth-conversion golden
   scenario (age 68, claimed at 67).

   RESIDUAL, RECORDED NOT FIXED (SPRINT_QUESTIONS.md Q16). In HISTORICAL mode
   a claim that predates the projection still has its pre-projection years
   grown by the projection's OWN first history years, because the offset
   clamps at zero. That is a narrower instance of the same borrowing-from-the
   -wrong-time problem, it needs a decision about which rate should apply to
   unavailable pre-start years, and it is out of this task's scope. Simple
   and Monte Carlo modes are unaffected -- their rate is a configured
   constant that is well defined for any year. */
/* P1 (decision register, 2026-09-10), closing SPRINT_QUESTIONS.md Q16.
   A benefit CLAIMED BEFORE THE PROJECTION OPENS still has to be indexed from
   its claim age: ssaBenefitAtClaim() treats the entered figure as an
   FRA-referenced PIA, and COLA growth from the claim forward is how the model
   brings that PIA to the current year. So "just stop growing" is not
   available -- an earlier R3 revision tried exactly that and silently cut a
   legitimate year of indexing, moving golden:rmd-and-roth-conversion by $1,008.

   The residual FM-01 left: in HISTORICAL mode the index offset clamped at
   zero, so those pre-projection years were grown on the projection OWN FIRST
   HISTORY YEARS -- borrowing later calendar years to reconstruct earlier ones,
   the same shape as FM-01 itself, one level down.

   INTERIM RULE, and it is interim on purpose: pre-projection years use the
   configured ssCola assumption, which is what simple and monteCarlo already
   use for every year and is well defined for any year. The real answer is the
   actual historical COLA for the calendar years the claim implies, and that
   is BLOCKED: this engine carries no calendar anchor at all -- no start year,
   nothing -- and historyStart is a SEQUENCE start deliberately decoupled from
   the user real dates. Adding one is a feature with migration consequences,
   not a repair, and is recorded as the named successor to this rule.

   Post-start years are untouched: when the claim falls at or after the
   projection opens, preStart is 0 and the index arithmetic is exactly what it
   was. */
/* S5AA R34: the SAME annual sequence as ssColaRates(), multiplied out -- kept for every caller that wants the factor. */
function growthFromCola(p,startAge,currentAge,startHistoryIndex,ownerStartAge){var r=ssColaRates(p,startAge,currentAge,startHistoryIndex,ownerStartAge),factor=1;for(var i=0;i<r.length;i++)factor*=1+r[i];return factor}
function ssColaRates(p,startAge,currentAge,startHistoryIndex,ownerStartAge){var origin=Number.isFinite(Number(ownerStartAge))?Number(ownerStartAge):p.profile.age,years=Math.max(0,Math.floor(currentAge-startAge)),rates=[],offsetRaw=Math.floor(startAge-origin),preStart=Math.max(0,-offsetRaw);for(var i=0;i<years;i++){var rate=Number(p.retirement.ssCola)/100;if(!Number.isFinite(rate))rate=RULES.socialSecurity.cola;if(p.assumptions.method==="historical"&&i>=preStart){var idx=(startHistoryIndex+Math.max(0,offsetRaw)+(i-preStart))%HIST_RETURNS.length,year=HIST_RETURNS[idx][0];if(HIST_COLA[year]!==undefined)rate=HIST_COLA[year]}rates.push(rate)}return rates}
/* Audit finding AUD-002 (RETIREMENT_ENGINE_AUDIT_CLAUDE_QUEUE_2026-09-08.md,
 * task T04): the previous inline computation conflated "this person's
 * benefit ENTITLEMENT amount" with "does this person's own benefit
 * duration cover any of this row" -- selfRaw/spouseRaw were zeroed
 * whenever the person's OWN alive+claimed duration this row was zero,
 * including when they were already dead for the whole row. Since the
 * survivor branch computed Math.max(selfRaw, spouseRaw), a deceased
 * higher-earner's amount was silently discarded before the comparison
 * ever ran -- the survivor got the lower amount, not the larger one the
 * simplified survivor policy promises.
 *
 * This splits the row into sub-intervals at every claim-age/death-age
 * crossing for either spouse (so a death or claim occurring MID-row
 * correctly pays the pre-crossing amount before it and the
 * post-crossing amount after, rather than one flat amount for the whole
 * row), and within each sub-interval keeps entitlement amount (claimed
 * or not, by claim age alone) and alive status as separate questions --
 * the survivor comparison uses the amount regardless of whose row-start
 * alive status used to zero it out. Preserves the exact prior policy
 * shape otherwise: survivor eligibility still keys only on aliveness
 * (not the survivor's own claim status, matching this project's
 * previously accepted behavior; unclaimed-survivor eligibility remains
 * an explicitly unresolved SSA policy edge, not something invented
 * here), non-survivor and both-alive payment is unchanged, and claim
 * age/FRA factor/COLA formulas are untouched. */
/* Q91 (F5): the household total, unchanged for every existing caller, delegating so the two cannot
   drift -- the same shape task 4.3 used for the conversion route. Callers that need the earnings
   test, the withholding it took and the months it credited use the detail form below. */
function householdSocialSecurityForPeriod(p,age,rowAge,spouseAge,startHistory){
  return householdSocialSecurityDetail(p,age,rowAge,spouseAge,startHistory).total;
}
function householdSocialSecurityDetail(p,age,rowAge,spouseAge,startHistory,earnings,credited){
  var duration=rowAge-age;
  if(duration<=1e-9)return {total:0,withheld:0,creditMonths:{self:0,spouse:0}};
  var spouseOn=p.profile.spouseOn,
      selfClaim=ssClaimStartAge(p.retirement.ssClaim),
      selfDeath=p.retirement.selfLife,
      spouseClaimAtSelfAge=age+(ssClaimStartAge(p.retirement.spouseClaim)-spouseAge),
      spouseDeathAtSelfAge=age+(p.retirement.spouseLife-spouseAge),
      survivorOn=p.retirement.survivor&&spouseOn,
      points=[age,rowAge];
  /* Q92 (G19): THE SURVIVOR'S OWN START AGES ARE ROW BOUNDARIES TOO. Ground rule 4 names the survivor
     amount, the eligibility gate and this list as one set, and they move together here. Without the
     boundary a row that straddles the survivor's 60th birthday pays the whole year at one rate and
     the start is invisible -- the segmentation can only bill a part year for a change it was told
     about. Both are expressed on the SELF's clock, because that is what this list is measured in. */
  var selfSurvivorStart=survivorOn?survivorStartAge(p,spouseDeathAtSelfAge):Infinity,
      spouseSurvivorStartAtSelfAge=survivorOn
        ?age+(survivorStartAge(p,spouseAge+(selfDeath-age))-spouseAge)
        :Infinity;
  /* S5AA R34 (SA32F-07): each owner's retirement is a boundary too, so the grace year can tell service months from non-service ones. */
  var selfRetireAge=Number(p.profile.retireAge),spouseRetireAtSelfAge=age+(Number(p.profile.retireAge)-spouseAge);
  [selfClaim,selfDeath,selfRetireAge].concat(spouseOn?[spouseClaimAtSelfAge,spouseDeathAtSelfAge,spouseRetireAtSelfAge]:[])
    .concat(survivorOn?[selfSurvivorStart,spouseSurvivorStartAtSelfAge]:[]).forEach(function(x){
    if(isFinite(x)&&x>age+1e-9&&x<rowAge-1e-9)points.push(x)
  });
  points=Array.from(new Set(points.map(function(x){return Math.round(x*1e6)/1e6}))).sort(function(a,b){return a-b});
  /* R2-004 fix (R2-T03): each person's ANNUAL AMOUNT is computed once, on
     that person's own ROW clock, and hoisted out of the segment loop.

     growthFromCola() floors elapsed whole years since claim, so evaluating
     it at each segment's start let a boundary contributed by the OTHER
     person tick this person's COLA counter over. The audit's case: both
     age 68, row 68-69, self claiming at 67.5 with 10% COLA -- moving the
     spouse's claim age from 69.5 (outside the row) to 68.5 (inside it)
     split the row and raised the SELF's benefit from $12,480 to $13,104,
     although the spouse's benefit was zero and nothing about the self had
     changed.

     A row split answers exactly one question -- who is paid, and for how
     long. It must not also decide how large the annual benefit is. The
     segment loop below therefore still prorates payment, but reads these
     two row-constant amounts rather than recomputing them. */
  /* FM-01: each owner's COLA clock is measured against that owner's own
     opening age. Passing p.profile.age for the spouse (the previous
     behaviour, by omission) spent the age gap between the two people as
     elapsed calendar time. */
  /* Q91 (F5): each person's benefit now carries THAT PERSON'S credited months and THAT PERSON'S own
         age, because the adjustment of the reduction factor is effective at their own full retirement
         age and not the household's. Omitted, both are undefined and the amount is the unadjusted one
         every existing caller already means. */
      /* S5AA R34: each person's MONTHLY figures for the row, SSA-rounded -- own, own plus the spouse's excess, and the survivor amount on the
         other's record -- from ssPiaAt() (today's dollars, COLAs to the claim and after, dime-rounded), ssClaimFactor(), ssSpousalFactor() and
         ssSurvivorMonthly(). Row-constant, as the amounts always were (R2-004): a segment decides who is paid and for how long, not how much. */
      var selfPia=ssPiaAt(p,"self",age,startHistory),spousePia=spouseOn?ssPiaAt(p,"spouse",spouseAge,startHistory):0,
      selfOwnM=ssFloorDollar(selfPia*ssClaimFactor(p,"self",credited&&credited.self,age)),
      spouseOwnM=spouseOn?ssFloorDollar(spousePia*ssClaimFactor(p,"spouse",credited&&credited.spouse,spouseAge)):0,
      selfSpousalStart=spouseOn?Math.max(selfClaim,spouseClaimAtSelfAge):Infinity,
      selfPlusSpousalM=spouseOn?ssFloorDollar(selfPia*ssClaimFactor(p,"self",credited&&credited.self,age)+Math.max(0,.5*spousePia-selfPia)*ssSpousalFactor(p,"self",selfSpousalStart)):selfOwnM,
      spousePlusSpousalM=spouseOn?ssFloorDollar(spousePia*ssClaimFactor(p,"spouse",credited&&credited.spouse,spouseAge)+Math.max(0,.5*selfPia-spousePia)*ssSpousalFactor(p,"spouse",spouseAge+(selfSpousalStart-age))):0,
      selfSurvivorM=survivorOn?ssSurvivorMonthly(p,"spouse",spousePia,spouseClaimAtSelfAge<spouseDeathAtSelfAge-1e-9,survivorReductionFactor(p,selfSurvivorStart,"self")):0,
      spouseSurvivorM=survivorOn?ssSurvivorMonthly(p,"self",selfPia,selfClaim<selfDeath-1e-9,survivorReductionFactor(p,survivorStartAge(p,spouseAge+(selfDeath-age)),"spouse")):0,
      /* R2-003(b) fix (R2-T03): a benefit amount exists only if the person
         actually reached their claim age while still alive. Entitlement was
         being tested by comparing an ADVANCING segment age against a claim
         age, with nothing establishing that a claim ever existed -- so
         someone who died at 65 with a scheduled claim age of 67 acquired a
         posthumous claim at 67, and a survivor then inherited it. For a
         person who is alive at a segment they have already claimed in, this
         is necessarily true and nothing changes; it only bites for the
         dead. Claim age exactly equal to death age establishes nothing. */
      /* S5AA R34 (decision 1): the R2-003(b) "claim established" gate is gone. A survivor's benefit rests on the deceased's PIA, which does not
         need a claim (20 CFR 404.335); an own benefit still needs its owner alive and claimed, which the segment loop tests. */
      /* Q91: the gross paid to each person and the months each was entitled in, accumulated beside the
         household total so the earnings test can be applied PER PERSON to THEIR OWN earnings. */
      selfGross=0,spouseGross=0,selfMonths=0,spouseMonths=0,selfServiceGross=0,spouseServiceGross=0,
      total=0;
  for(var i=0;i<points.length-1;i++){
    var segStart=points[i],segDuration=points[i+1]-segStart;
    if(segDuration<=1e-9)continue;
    var selfAliveHere=segStart<selfDeath-1e-9,
        selfClaimedHere=segStart>=selfClaim-1e-9,
        selfAmount=selfClaimedHere?12*(spouseOn&&segStart<spouseDeathAtSelfAge-1e-9&&segStart>=selfSpousalStart-1e-9?selfPlusSpousalM:selfOwnM):0,
        spouseAliveHere=spouseOn&&segStart<spouseDeathAtSelfAge-1e-9,
        spouseClaimedHere=spouseOn&&segStart>=spouseClaimAtSelfAge-1e-9,
        spouseAmount=spouseClaimedHere?12*(segStart<selfDeath-1e-9&&segStart>=selfSpousalStart-1e-9?spousePlusSpousalM:spouseOwnM):0,
        selfPay=0,spousePay=0;
    if(survivorOn&&selfAliveHere!==spouseAliveHere){
      /* R2-003(a) fix (R2-T03): restore the RECIPIENT's own claim gate.
         T04 replaced the prior own-claim-duration gate with an
         aliveness-only test, so a 50-year-old survivor whose own claim age
         is 67 collected a survivor benefit 17 years early. The gate keys on
         whether the recipient has reached their OWN selected claim age --
         deliberately NOT on whether they have a nonzero benefit of their
         own, which is what keeps the accepted "zero-own-benefit survivor
         already past their claim age still receives the larger benefit"
         case working. The AMOUNT is still Math.max of both, so a deceased
         partner's already-established benefit is still retained: that is
         T04's accepted repair and is preserved. This restores the narrow
         prior boundary only; any broader real-world survivor eligibility
         policy remains an explicitly unresolved SSA question and is not
         invented here. */
      /* Q92 (F6): the survivor receives the LARGER of their own benefit and the deceased's, REDUCED for
         the age their survivor benefit began. Two separate entitlements, each with its own gate: the
         own benefit still needs their own retirement claim age, and the survivor benefit needs only
         the survivor floor of 60. Taking the max of the two is what preserves the accepted case a
         prior repair settled -- a survivor with no benefit of their own still receives the larger --
         while no longer paying a 60-year-old nothing because their own claim age is 67. */
      if(selfAliveHere){
        var selfOwn=selfClaimedHere?12*selfOwnM:0,
            selfFromDeceased=segStart>=selfSurvivorStart-1e-9?12*selfSurvivorM:0;
        selfPay=Math.max(selfOwn,selfFromDeceased);
      }else{
        var spouseOwn=spouseClaimedHere?12*spouseOwnM:0,
            spouseFromDeceased=segStart>=spouseSurvivorStartAtSelfAge-1e-9?12*spouseSurvivorM:0;
        spousePay=Math.max(spouseOwn,spouseFromDeceased);
      }
    }else{
      selfPay=selfAliveHere?selfAmount:0;
      spousePay=spouseOn&&spouseAliveHere?spouseAmount:0
    }
    total+=(selfPay+spousePay)*segDuration;
    selfGross+=selfPay*segDuration;spouseGross+=spousePay*segDuration;
    if(segStart<selfRetireAge-1e-9)selfServiceGross+=selfPay*segDuration;
    if(segStart<spouseRetireAtSelfAge-1e-9)spouseServiceGross+=spousePay*segDuration;
    if(selfPay>0)selfMonths+=segDuration*12;
    if(spousePay>0)spouseMonths+=segDuration*12;
  }
  /* Q91 (F5): the test is applied to the ROW's totals, per person, on that person's own age clock and
     that person's own earnings. THE SUBTRACTION IS CONDITIONAL AND THAT IS DELIBERATE: `total` is
     accumulated exactly as it always was, so a household with no withholding -- which is every
     household that is not working below full retirement age while claiming -- comes out BIT FOR BIT
     identical. Task 4.1 recorded what happens otherwise: re-deriving a total from new parts
     reassociates the floating-point arithmetic and moves values in their last bits for no
     behavioural reason. */
  /* S5AA R34 (SA32F-07): the GRACE YEAR is the row an owner stops working in (with no employment-stream or self-employment income going on):
     benefits for the months after the stop are not withheld, whatever the year's earnings. */
  var selfGrace=selfRetireAge>age+1e-9&&selfRetireAge<=rowAge+1e-9&&!(earnings&&earnings.streamSelf>0),
      spouseGrace=spouseOn&&spouseRetireAtSelfAge>age+1e-9&&spouseRetireAtSelfAge<=rowAge+1e-9&&!(earnings&&earnings.streamSpouse>0);
  var selfTest=ssEarningsTestWithholding(p,age,rowAge,earnings&&earnings.self,selfGross,selfMonths,"self",selfGrace?selfServiceGross:undefined),
      spouseTest=spouseOn
        ?ssEarningsTestWithholding(p,spouseAge,spouseAge+duration,earnings&&earnings.spouse,spouseGross,spouseMonths,"spouse",spouseGrace?spouseServiceGross:undefined)
        :{withheld:0,creditMonths:0};
  if(selfTest.withheld>0||spouseTest.withheld>0)total-=selfTest.withheld+spouseTest.withheld;
  return {total:total,withheld:selfTest.withheld+spouseTest.withheld,
          creditMonths:{self:selfTest.creditMonths,spouse:spouseTest.creditMonths}};
}
/* S5AA R25 (R24F-01, the owner 2026-09-25: prorate the stage, its end age being "the last year covered"): the app takes a
   stage's start and end ages in half-year steps, but the stage was tested at ONE age, the one the retired part of the
   year opened at, and applied to the whole year. A 50% stage from 65.5 to 66.5 on $100,000 spent $100,000, then
   $50,000 (measured at d67b618). A stage from 65 to 66 has always covered the years opening at 65 and 66, so a stage
   covers [start, end + 1) in continuous age, and applyStage() spends the time-weighted average over any year one of
   those boundaries splits: $75,000, $50,000, $75,000. A year no boundary splits is evaluated exactly as before, with
   no averaging, so every whole-year plan keeps its figures to the last bit. endAge absent (a caller that has no year
   end) is the old single-age reading. */
function stageAmountAt(r,age,base,inflationFactor){(r.stages||[]).forEach(function(s){if(age<s.start||age>=Number(s.end)+1)return;if(s.mode==="percent")base*=s.value/100;else{base=Math.max(0,Number(s.value)||0);var years=Math.max(0,age-s.start);if(s.growthMode==="inflation")base*=inflationFactor;else if(s.growthMode==="fixed")base*=Math.pow(1+(Number(s.annualChange)||0)/100,years)}});return Math.max(0,base)}
function applyStage(r,age,base,inflationFactor,endAge){var to=Number(endAge);if(!(to>age))return stageAmountAt(r,age,base,inflationFactor);var cuts=[age];(r.stages||[]).forEach(function(s){[Number(s.start),Number(s.end)+1].forEach(function(x){if(x>age&&x<to&&cuts.indexOf(x)<0)cuts.push(x)})});if(cuts.length===1)return stageAmountAt(r,age,base,inflationFactor);cuts.sort(function(a,b){return a-b});cuts.push(to);var total=0;for(var i=0;i+1<cuts.length;i++)total+=(cuts[i+1]-cuts[i])*stageAmountAt(r,cuts[i],base,inflationFactor);return total/(to-age)}
function eventAmount(items,start,end){return (items||[]).reduce(function(t,x){return t+(Number(x.age)>=start-.0001&&Number(x.age)<end-.0001?(Number(x.amount)||0):0)},0)}
/* FM-07 fix (FULL_MODEL_AUDIT_AND_CLAUDE_HANDOVER_20260910.md; user
   decision D-2 = scale to elapsed time): a spending decision must apply
   the inflation the previous period ACTUALLY accrued, not a full year of
   it regardless of how long that period was.

   The engine already accrues inflationFactor as (1+r)^duration. The
   decision multiplied priorSpend by (1+r) flat, so after a HALF-year
   opening period a household received a full annual raise against 4.88%
   of actual inflation -- a one-off mis-sized step, then inherited forever
   through priorSpend. Two households differing only by a half-year start
   ended up 4.88% apart in real spending, permanently.

   priorInflationFactor carries the elapsed factor. It is optional and
   defaults to 1+annualInflation, so direct callers that pass a plain
   annual rate (every existing unit test) are unaffected. SA-04 is
   preserved: this is still the PRIOR period's observed accrual, never
   the upcoming period's. */
/* ZERO-01/02: numeric zero is an explicit policy setting; preserve the legacy fallback for absent/malformed values. */
/* RC-02 (adversarial addendum): the survivor reduction is a HOUSEHOLD-SIZE
   adjustment applied to each year's spending, not a compounding haircut on the
   carried spending state.

   The defect: fixedReal (and guardrails/guyton) build this year's amount from
   priorSpend, the caller stored the RETURNED amount in priorSpend, and the
   returned amount had already been multiplied by the survivor factor. So the
   reduction re-applied to its own output every year: 40,000 / 30,000 / 22,500 /
   16,875 / 12,656.25, overstating a five-year portfolio by $37,968.75. The
   existing direct survivor tests use fixedNominal, which rebuilds its base each
   call and therefore cannot expose the recurrence.

   The repair keeps the reduction at the OUTPUT boundary -- deleting it after
   first application would be wrong, because strategies that reconstruct their
   base each year still need it applied to that base -- and separates the state
   the strategy carries from the amount the household spends. `out.base`
   receives the pre-adjustment figure; the annual loop stores THAT as
   priorSpend.

   The two paths run the same stage and flexibility steps in the same order, so
   the returned value is computed exactly as before. That is deliberate: the
   addendum warns that a blanket reordering of this function would move the
   fractional-period and stage conventions independently of this finding. */
/* S5AA, after the R9 round (fifth internal audit, finding 1; the owner's decision of 2026-09-22): horizonEnd is the age the
   projection's last row ends at -- decision 8's cut at the last death, or profile.endAge when that comes first -- and is
   what VPW ("remaining lifetime") and the RMD-style strategy ("remaining modeled years") pace spending to. They read
   profile.endAge, so a household whose lifespans end before it was paced for years the projection never models and
   died holding most of the portfolio. simulatePlan() passes it; a caller that does not keeps profile.endAge. */
/* S5AA R35 (SA32F-36; the owner's decision 6, 2026-09-29): `retireInflationFactor` is the first retired row's inflation factor. Fixed-nominal
   spending is entered in today's dollars ("Annual spending in today's dollars") and was paid bare however far off retirement was; it is now grown
   to the retirement date and then held (R32V: "grow today's-dollar base through the retirement date, then hold that nominal amount"), so the
   first retired row spends what incomeFirst spends in it. A chosen convention. A caller that passes none gets the entered figure, as before. */
function strategySpending(p,age,balance,retireBalance,priorSpend,priorReturn,inflationFactor,annualInflation,priorInflationFactor,out,horizonEnd,stageEnd,retireInflationFactor){
  var modelledEnd=typeof horizonEnd==="number"&&Number.isFinite(horizonEnd)?horizonEnd:null;
  /* R11 round, external audit of 02b921a (R10-01): the REMAINING MODELLED DURATION, which is the horizon less this
     decision's age. It was that plus one: a period from 80 to 81 is one year, not two, and a household of 65 against a
     horizon of 100 has 35 modelled years, not 36. Both strategies below overstated the divisor by a year at every age,
     which the R10 horizon change made visible at the end of a plan rather than introduced. It is a DURATION, not a
     count of rows, so a final part-year is a fraction: the amount returned is annualized and the caller multiplies it
     by the retired part of the row, so half a year remaining gives an annualized double that resolves to the balance.
     A decision AT or PAST the horizon has no remaining duration to divide by; it cannot arise inside a projection (the
     caller has a retired part of a row still to come) and keeps the whole year it was clamped to before. */
  var remainingYears=function(){var left=(modelledEnd===null?p.profile.endAge:modelledEnd)-age;return left>0?left:1};
  var inflationStep=Number.isFinite(Number(priorInflationFactor))?Number(priorInflationFactor):1+annualInflation;var r=p.retirement,rate=r.withdrawalRate/100,amount=r.spending;if(r.strategy==="fixedReal")amount=priorSpend===null?retireBalance*rate:priorSpend*inflationStep;else if(r.strategy==="fixedNominal")amount=r.spending*(Number.isFinite(Number(retireInflationFactor))?Number(retireInflationFactor):1);else if(r.strategy==="constantPercent")amount=balance*rate;else if(r.strategy==="guardrails"||r.strategy==="guyton"){amount=priorSpend===null?retireBalance*rate:priorSpend*(r.strategy==="guyton"&&r.guytonSkipInflation&&priorReturn<0?1:inflationStep);var currentRate=balance>0?amount/balance:9,upper=rate*(1+r.upperGuardrail/100),lower=rate*(1-r.lowerGuardrail/100);if(currentRate>upper)amount*=1-r.adjustment/100;else if(currentRate<lower)amount*=1+r.adjustment/100;amount=clamp(amount,Math.min(r.floor,r.ceiling)*inflationFactor,Math.max(r.floor,r.ceiling)*inflationFactor)}else if(r.strategy==="vpw"){var remaining=remainingYears(),realRate=Math.max(-.5,((1+(p.assumptions.returnRate-p.assumptions.fee)/100)/(1+p.assumptions.inflation/100)-1)),factor=Math.abs(realRate)<.00001?remaining:(1-Math.pow(1+realRate,-remaining))/realRate;amount=balance/Math.max(1e-9,factor);var vpwLow=Number(r.vpwMinRate)||0,vpwHigh=r.vpwMaxRate===0?0:(Number(r.vpwMaxRate)||100);amount=clamp(amount,balance*Math.min(vpwLow,vpwHigh)/100,balance*Math.max(vpwLow,vpwHigh)/100)}else if(r.strategy==="rmd")amount=Math.max((Number(r.rmdFloor)||0)*inflationFactor,balance/remainingYears()*(r.rmdMultiplier===0?0:(Number(r.rmdMultiplier)||100))/100);else if(r.strategy==="floorCeiling")amount=clamp(balance*rate,Math.min(r.floor,r.ceiling)*inflationFactor,Math.max(r.floor,r.ceiling)*inflationFactor);/* Q38: incomeFirst is dispatched EXPLICITLY, though this is identical to the else branch it used to fall through to. tests/lib/scenario-generator.js harvests the strategy enumeration by regex over this file, and incomeFirst previously appeared only inside the offset expression above -- collapsing that expression deleted the strategy from the seeded corpus and rewrote every scenario. Keeping the name where the harvest can see it is the cheap half of the repair; the exact-set guard in the generator is the other half. */else if(r.strategy==="incomeFirst")amount=r.spending*inflationFactor;else amount=r.spending*inflationFactor;var survivorFactor=1;/* S5AA R9 ROUND, the owner's decision 7 (2026-09-21): who is alive is householdSurvivorship()'s answer, the engine's one
   definition. This read its own, strict `age < life`, so the row opening at a lifespan -- the year of death, filed jointly and
   costed for two everywhere else -- was already a survivor year here (finding N3 of the R6 round). */if(r.survivor&&p.profile.spouseOn){var living=householdSurvivorship(p,age),oneSurvivor=living.selfAlive!==living.spouseAlive;if(oneSurvivor)survivorFactor=1-clamp(Number(r.survivorSpendingReduction)||0,0,50)/100}/* S5AA task 2.1, Q108: the carried base is the UNADJUSTED amount. `base` becomes next year's priorSpend, and
   fixedReal computes each year as priorSpend*inflationStep -- so anything folded into `base` is not applied
   once, it is applied again every year afterwards, to its own output.

   applyStage() used to be inside BOTH branches of this expression. A 50% stage over ages 70-75 therefore
   halved every year rather than holding at half: measured at the start commit, 2,000,000 -> 1,000,000 ->
   500,000 -> 250,000 -> 125,000 -> 62,500 -> 31,250, and then 31,250 for ever, because the window's last
   adjusted value was still the base after the window had ended. A `set` stage had the same shape from the
   other direction: the set value became the permanent level.

   RC-02 MADE EXACTLY THIS CORRECTION ONCE ALREADY, which is why survivorFactor is absent from the base --
   'carry the pre-adjustment base, not the spendable amount'. The stage was the adjustment it did not reach.
   Both branches now carry the same unadjusted amount, so the ternary is gone with them: what a survivor
   household carries forward and what anyone else carries forward were never meant to differ in KIND.

   `spend` is untouched. The household still spends the adjusted figure this year; only what is remembered
   for next year changes. */
var spend=applyStage(r,age,amount*survivorFactor,inflationFactor,stageEnd),base=amount;/* S5AA task 2.2, Q109: the down-year cut is a LEVEL, not a ratchet. `base*=1-r.flexibility/100` used to sit
   beside the line below, writing the cut into what the next year starts from -- so each year's cut was taken
   from the previous year's already-cut figure. Measured at the start commit: 80,000 -> 72,000 -> 64,800 ->
   58,320 -> 52,488, never recovering. A household that said it could cut 10% in a bad year was modelled as
   accepting a permanent 10% reduction, and another on every later bad year. Same carried base, same defect,
   as task 2.1.

   THE POLICY ITSELF IS UNCHANGED, and is written out in Handover temp/S5AA_FLEXIBILITY_POLICY_20260920.md
   rather than left to be inferred from this line, because it is a decided choice (17.4 (a)) and not a proven
   defect: the signal is the immediately preceding period's return, the lookback is one period, the trigger is
   strictly negative, there is no hysteresis and no phase-in, and the cut multiplies the staged, inflated
   figure. Only whether it is REMEMBERED changes. Successive down years now each take the cut from the current
   uncut base, and a recovery year returns to the full level at once -- because there is nothing to recover
   from. */
if(priorReturn<0&&r.flexibility>0){spend*=1-r.flexibility/100}if(out)out.base=Math.max(0,base);return Math.max(0,spend)}
/* Q38: the ONE definition of the withdrawal-strategy set. strategySpending() above dispatches exactly these names, and tests/registry-single-definition.test.js holds the two equal. tests/lib/scenario-generator.js reads this declaration instead of harvesting the dispatch by regex -- the harvest was a second definition, and a collapsed branch once deleted a strategy from the seeded corpus and rewrote every scenario. The UI's strategy <select> and its descriptions carry display labels and are pinned to this list by the same test. Nothing in the engine reads it at run time, so the Worker needs no copy. */
var WITHDRAWAL_STRATEGIES=["constantPercent","fixedNominal","fixedReal","floorCeiling","guardrails","guyton","incomeFirst","rmd","vpw"];
/* Q58: one resolution rule for a plan's withdrawal-strategy name, used by
   runPlan() and by the app's form. Decided 2026-09-13 (the owner): normalise case
   silently, and warn and then default an unrecognised name to incomeFirst.
   This returns the declared name that matches exactly or ignoring case, or
   null when nothing matches; the caller decides what to report. */
function canonicalWithdrawalStrategy(name){
  if(typeof name!=="string")return null;
  if(WITHDRAWAL_STRATEGIES.indexOf(name)!==-1)return name;
  var lower=name.toLowerCase();
  for(var i=0;i<WITHDRAWAL_STRATEGIES.length;i++){
    if(WITHDRAWAL_STRATEGIES[i].toLowerCase()===lower)return WITHDRAWAL_STRATEGIES[i];
  }
  return null;
}
/* Q58, Q81: one resolution of a plan's withdrawal-strategy name per run, on
   every route that runs a plan: runPlan() before its paths, and a direct
   simulatePlan() call -- the exported function and the heat map's call -- after
   its input gates. Q81 (the external S5 audit's second finding): until then
   only runPlan() resolved it, so a wrong-case name ran as income-first on the
   direct routes. runPlan()'s own per-path calls carry the gate token and skip
   it, so a Monte Carlo run reports an unrecognised name once. A wrong-case name
   maps silently; an unrecognised one is reported and runs as incomeFirst; an
   absent strategy stays silent. The caller's plan is not changed: copies made by
   copyOwnRecord(), which reads no property, carry the resolved name. */
function withResolvedStrategy(p,issues){
  var r=p&&p.retirement;
  if(!r||typeof r!=="object"||r.strategy===undefined)return p;
  var given=r.strategy,resolved=canonicalWithdrawalStrategy(given);
  if(resolved===null){
    var shown;
    try{shown=typeof given==="string"?JSON.stringify(given):String(given)}catch(e){shown="(a value that cannot be shown)"}
    recordIssue(issues,"RETIREMENT_STRATEGY_UNRECOGNIZED","WARNING","The withdrawal strategy "+shown+" is not one this calculator provides, so income-first spending was used.",{strategy:shown});
    resolved="incomeFirst";
  }
  if(resolved===given)return p;
  var root=copyOwnRecord(p),retirement=copyOwnRecord(r);
  Object.defineProperty(retirement,"strategy",{value:resolved,writable:true,enumerable:true,configurable:true});
  Object.defineProperty(root,"retirement",{value:retirement,writable:true,enumerable:true,configurable:true});
  return root;
}
/* Audit finding AUD-006 (RETIREMENT_ENGINE_AUDIT_CLAUDE_QUEUE_2026-09-08.md,
 * task T07): the recurring-income branch used to skip the ENTIRE period
 * whenever `ownerAge<i.start` -- i.e. whenever the income hadn't started
 * yet as of the period's OPENING age -- even when the income's start fell
 * before the period's CLOSING age, so it should have activated partway
 * through. Fixed by intersecting the period with the income's start:
 * `activeAge` is the later of the period's own start or the income's start,
 * and both the active duration and the growth origin (`years`, and the
 * COLA lookup's `currentAge`) are now measured from `activeAge` instead of
 * unconditionally from the period's opening age. A stream already active
 * before this period is unaffected (`activeAge` reduces to `ownerAge`,
 * exactly the prior calculation). The END side (`ownerAge>i.end`) was left
 * exactly as it was -- the audit explicitly scoped end-age inclusivity as
 * a separate, not-yet-resolved question.
 *
 * S5R-04 (the 2026-09-16 external audit; decided by the owner on 2026-09-16, answer
 * 3 (A)): that question is answered. An income stops the moment its owner
 * reaches the end age, prorated within the row, as the "End age" label says.
 * The paid duration ran from the later of the row start and the income's
 * start to the row's END, so an income ending at 60.5 paid a full year over
 * 60-61, and a row starting exactly at the end age paid in full. The active
 * interval is now [start, end) on the owner's ages, clipped at both ends of
 * the row, so a row that starts at the end age has nothing left to pay, and
 * the paid duration is never negative: an end before the start pays nothing.
 * An end that is absent (undefined) still never stops the income, and a
 * start is clipped exactly as before. Path scope: every income type this
 * function times, self-employment included. */
/* Q89 (F3, with G17): `nii` is the share of these streams that Form 8960 Part I counts as NET INVESTMENT
   INCOME, reported SEPARATELY from `ordinary` because the two are different questions: `ordinary` is what
   bears ordinary income tax, `nii` is what bears the 3.8% surtax, and a dollar can be in one, both or
   neither. Rental real estate is named on line 4a and an "Investment income" stream is investment income
   by name (lines 1, 2, 5). A pension is EXCLUDED by section 1411(c)(5), wages and self-employment income are
   not investment income, and tax-free income is outside it entirely -- all of which is already true here
   because they simply are not added. `other` and `oneTime` carry NO tax character: their labels fix nothing
   about whether the money is interest, a gift or a settlement, so they stay OUT, and that choice is recorded
   in Handover temp/S5AA_CITATION_CHECKS_20260920.md rather than left to be inferred from silence.
   Real-estate-professional status is not modelled, so rental is treated as PASSIVE and therefore in scope. */
function otherIncomeFor(p,periodStart,periodEnd,inflationFactor,startHistoryIndex){var cash=0,ordinary=0,ss=0,seSelf=0,seSpouse=0,nii=0,wageSelf=0,wageSpouse=0;(p.retirement.otherIncomes||[]).forEach(function(i){var spouse=i.owner==="spouse"&&p.profile.spouseOn,ownerAge=spouse?p.profile.spouseAge+(periodStart-p.profile.age):periodStart,ownerEnd=spouse?p.profile.spouseAge+(periodEnd-p.profile.age):periodEnd;/* S5AA R9 ROUND, the owner's decision Q5 (2026-09-21): a one-time income can be tax-free -- an inheritance or a gift is not
   gross income (IRC 102(a)). The check here read i.type!=="taxFree" inside the oneTime branch, so it could never be
   false and every lump sum was taxed. The option is its own type, "oneTimeTaxFree", paid exactly as "oneTime" is;
   "oneTime" stays taxed. */if(i.type==="oneTime"||i.type==="oneTimeTaxFree"){if(Number(i.start)>=ownerAge-.0001&&Number(i.start)<ownerEnd-.0001){cash+=Number(i.amount)||0;if(i.type==="oneTime")ordinary+=Number(i.amount)||0}return}/* S5AA THIRD AUDIT, completing Q3 (the owner, 2026-09-21: a deceased person's wages end at the death): an
   `employment` stream IS wages (the payroll-base routing below takes it in) and a `selfEmployment` stream is
   the owner's own earnings, taxed per owner -- so both end at their owner's death, on the owner's own
   clock, prorated inside a period exactly as the entered end age already is. Q3 as first built ended only
   the salary, and a spouse dying at 63 kept being paid $40,000 a year from either stream until its end
   age. Every other type is left alone: rental, investment and plain recurring income can outlive the
   person they are entered under. A lifespan that is not a finite number ends nothing.
   DeepSeek audit, finding 2d/02: a stream with NO end age, or a non-numeric one, has Number(i.end) NaN, and
   Math.min(NaN, lifespan) is NaN -- the death bound switched itself off. The lifespan alone bounds it. */
/* S5AA R34 (SA32F-18): a `socialSecurity` stream is its owner's benefit and ends at their death too (42 USC 402(a): "ending with the month
   preceding the month in which he dies"); it paid on. A pension stream's survivor share is a separate decision (R35). */var streamEnd=Number(i.end);if(i.type==="employment"||i.type==="selfEmployment"||i.type==="socialSecurity"){var ownerLife=Number(spouse?p.retirement.spouseLife:p.retirement.selfLife);if(Number.isFinite(ownerLife))streamEnd=Number.isFinite(streamEnd)?Math.min(streamEnd,ownerLife):ownerLife}
if(ownerEnd<=i.start||ownerAge>streamEnd)return;var activeAge=Math.max(ownerAge,i.start),activeEnd=ownerEnd>streamEnd?streamEnd:ownerEnd,activeDuration=Math.max(0,activeEnd-activeAge),years=Math.max(0,activeAge-i.start),factor=1;if(i.growthMode==="inflation")factor=inflationFactor;else if(i.growthMode==="cola")factor=growthFromCola(p,i.start,activeAge,startHistoryIndex,spouse?p.profile.spouseAge:p.profile.age);/* FM-01: the stream's start age is on its OWNER's scale, so the calendar origin must be too */else factor=Math.pow(1+(Number(i.growth)||0)/100,years);/* S5AA R35 (SA32F-18, the pension half): a `pension` stream owned by a person pays `survivorPercent` of itself after that person's death
   -- 0 for a single-life annuity, the elected share for a joint-and-survivor one (e.g. IRC 417(b)'s 50%). Absent, 100%: the main
   pension's declared joint-and-survivor assumption, disclosed (PENSION_STREAM_AFTER_DEATH_ASSUMED). It paid in full, silently.
   A death inside the period pays the whole amount before it and the share after, on the stream convention used above. */
   var paidDuration=activeDuration;if(i.type==="pension"&&(spouse||i.owner==="self")){var pensionLife=Number(spouse?p.retirement.spouseLife:p.retirement.selfLife),rawShare=Number(i.survivorPercent),share=i.survivorPercent===undefined||i.survivorPercent===null||!Number.isFinite(rawShare)?1:Math.min(1,Math.max(0,rawShare/100));if(Number.isFinite(pensionLife)&&activeEnd>pensionLife){var beforeDeath=Math.max(0,Math.min(activeEnd,pensionLife)-activeAge);paidDuration=beforeDeath+(activeDuration-beforeDeath)*share}}
   var amount=(Number(i.amount)||0)*factor*paidDuration;cash+=amount;if(i.type==="socialSecurity")ss+=amount;else if(i.type!=="taxFree")ordinary+=amount;if(i.type==="rental"||i.type==="investment")nii+=amount;if(i.type==="selfEmployment"){if(spouse)seSpouse+=amount;else seSelf+=amount}/* Q98 (G4): an `employment` stream IS wages -- it bears Social Security and Medicare payroll tax like
     any other wages. It is kept PER OWNER because the OASDI wage base is a per-person cap: crediting a
     spouse's job to the self pushes both onto one cap and UNDERCHARGES a two-earner household, which is
     the failure a household-total repair makes while every single-earner test still passes.
     It stays in `ordinary` as well, and that is not a double count: `ordinary` feeds the INCOME tax and
     this feeds the PAYROLL base, which are separate parameters of estimateTaxes(). `selfEmployment` is
     deliberately NOT here -- it bears SE tax through seSelf/seSpouse, at the whole rate with a deductible
     half, and charging it FICA as well would tax the same dollars twice.
     AN OWNER OF "household" IS ATTRIBUTED TO SELF, which is a disclosure rather than a choice made here:
     seSelf/seSpouse above already resolve it the same way, because only "spouse" is tested. A household
     stream therefore takes ONE person's OASDI cap rather than being split across two. Splitting it would
     be new modelling and would have to move both accumulators together. */if(i.type==="employment"){if(spouse)wageSpouse+=amount;else wageSelf+=amount}});return {cash:cash,ordinary:ordinary,ss:ss,seSelf:seSelf,seSpouse:seSpouse,nii:nii,wageSelf:wageSelf,wageSpouse:wageSpouse}}
/* RA-03 (re-audit 2026-09-11): the ONE definition of "an account that can pay
   a dividend". A zero-return household cash holding cannot -- charging it a
   dividend reclassifies cash principal as taxable income, and drawing the
   payout from it pays that income out of the principal itself.

   FM-03 excluded cash from the IMPUTED base (`dividendOn === false`) for
   exactly this reason, and applied that reasoning to one branch: the one R4's
   fixture prediction happened to surface. The ENABLED branch went on
   computing its base and taking its cash from the whole taxable class, so a
   household with no taxable investments at all reported 1,038.075 of
   dividends and 25.951875 of extra tax, with every reconciliation check
   passing -- a balanced ledger cannot tell you an income CLASSIFICATION is
   wrong. Stating the rule once is the repair; applying it branch by branch is
   what let the two diverge. */
function dividendEligibleAccounts(accounts){return accounts.filter(function(a){return a.taxClass==="taxable"&&!isHouseholdCashHolding(a)})}
/* RA-02 (re-audit 2026-09-11): `suppressDraw` computes this period's return
   for an account being SYNTHESIZED mid-period, without consuming an RNG draw.

   A destination appended during settlement has no entry in `rates` (which is
   index-aligned and already built), so it needs one. The obvious way to get
   it -- call this function normally -- would call normal(random) under Monte
   Carlo and shift the stream for every later period of every run, moving
   results far outside the repair that created the account. The volatility
   term is therefore omitted and the expectation used instead.

   Under `simple` and `historical` this is EXACTLY what a pre-existing account
   receives, because neither method draws. Under Monte Carlo it is
   deliberately the expectation rather than a draw: a stated divergence,
   recorded as Q19, not an accident. Bond tent, fee, reserve and clamping are
   shared with the normal path rather than duplicated, so the two cannot
   drift apart. */
function accountReturnForPeriod(ac,p,age,yearProgress,histRate,random,portfolioTotal,suppressDraw){/* FM-03: a household cash holding is CASH. Its growth treatment is made explicit here rather than left to inherit whatever the surrounding plan assumes, which is what the audit asked for -- retained surplus must not quietly acquire market returns just because it was parked in an account shaped object. The invest preset deposits into a real taxable account instead and does participate. */if(isHouseholdCashHolding(ac))return 0;var ret;if(p.assumptions.method==="monteCarlo")ret=accountExpected(ac,p,yearProgress,null)+(suppressDraw?0:accountVolatility(ac,p,yearProgress)*normal(random));else if(p.assumptions.method==="historical")ret=histRate;else ret=accountExpected(ac,p,yearProgress,null);if(p.advanced.bondTentOn){var strength=Math.max(0,1-Math.abs(age-p.profile.retireAge)/5),bondShare=p.advanced.bondTent/100*strength;ret=ret*(1-bondShare)+.045*bondShare}ret-=p.assumptions.fee/100;if(p.advanced.reserveOn&&age>=p.profile.retireAge){var reserve=Math.min(ac.balance,p.retirement.spending*p.advanced.reserveYears),share=reserve/Math.max(1,portfolioTotal);ret=ret*(1-share)+.03*share}return clamp(ret,-.95,2)}
/* The `rates[i]===undefined` guard covers an account appended to `accounts`
 * mid-period (AUD-003/T05: a synthetic taxable destination created to retain
 * excess RMD cash, after `rates` was already computed for this period from
 * the pre-append account list) -- such an account simply doesn't grow for
 * the remainder of THIS period; it grows normally starting next period, once
 * `rates` is recomputed from the now-larger account list. */
function growAccounts(accounts,rates,fraction,heldOut){if(fraction<=0)return;accounts.forEach(function(ac,i){if(rates[i]===undefined)return;/* R12 round (R11-01): dollars held out of this growth (rmdProtectedAmounts()) keep their value; the rest of the balance grows as before. */var held=heldOut&&ac&&Object.prototype.hasOwnProperty.call(heldOut,ac.id)?Math.min(Math.max(0,heldOut[ac.id]),Math.max(0,ac.balance)):0;ac.balance=held+Math.max(0,(ac.balance-held)*Math.pow(Math.max(.001,1+rates[i]),fraction))})}
/* S5 2p (decided 2026-09-13, the owner, on the S4 instrument audit's diagnostic-cap
   finding): a collector used to stop at 200 issues of any kind, so once earlier
   diagnostics filled it, a later reconciliation finding was dropped before the
   L4 invariant could count it. Diagnostics stay bounded, but an invariant
   finding is never the one dropped:
   - ordinary diagnostics keep the 200 cap, counted over the whole collector;
   - the invariant findings checkRowInvariants() records are kept up to their
     own 200, whatever else the collector holds;
   - past that, one INVARIANT_FINDINGS_NOT_KEPT record counts the rest.
   A collector therefore holds at most 401 entries. The invariant set is
   spelled once, in isInvariant() below, which the Worker already carries as
   part of this function.
   The overflow record's detail is written in bracket form, not with a dot:
   tests/scenario-generator.test.js proves that a declared-fixed profile field
   with the same key name is never read by searching this file's text for a dot
   followed by that name. This is an issue record's own detail object, and the
   plan field is still not read. */
function recordIssue(issues,code,severity,message,state){
  if(!issues)return;
  function isInvariant(c){return c==="RECONCILIATION_MISMATCH"||c==="NON_FINITE_ROW_VALUE"||c==="NEGATIVE_ACCOUNT_BALANCE"}
  var entry={code:code,severity:severity,message:message,state:state||{}};
  if(!isInvariant(code)){if(issues.length<200)issues.push(entry);return}
  var kept=0,overflow=null;
  for(var i=0;i<issues.length;i++){
    var c=issues[i]&&issues[i].code;
    if(isInvariant(c))kept++;
    else if(c==="INVARIANT_FINDINGS_NOT_KEPT")overflow=issues[i];
  }
  if(kept<200){issues.push(entry);return}
  if(!overflow){overflow={code:"INVARIANT_FINDINGS_NOT_KEPT",severity:"ERROR",message:"More invariant findings were detected than a collector keeps; each one beyond the first 200 is counted here.",state:{count:0}};issues.push(overflow)}
  overflow["state"]["count"]++;
}
/* FM-03: the identity gains an explicit outsideDeposit term. Retained
   outside-income surplus genuinely ENTERS the portfolio without being a
   contribution, employer match or growth, so before this it looked like
   money appearing from nowhere. The alternative -- netting the deposit out
   of withdrawals, as the RMD path does -- would keep the equation balanced
   while reporting a NEGATIVE withdrawal figure to the user, which is worse
   than an unbalanced check: it hides the problem inside a plausible field.
   Defaults to 0 so every existing caller and fixture is unaffected. */
function checkRowInvariants(issues,row,flows){var expected=flows.opening+flows.contributions+flows.employer+flows.growth+(flows.outsideDeposit||0)-flows.dividends-flows.withdrawals,drift=row.total-expected,tolerance=Math.max(.01,Math.abs(row.total)*1e-9);if(Math.abs(drift)>tolerance)recordIssue(issues,"RECONCILIATION_MISMATCH","ERROR","Ending portfolio total does not equal opening balance plus tracked cash flows.",{age:row.age,opening:flows.opening,contributions:flows.contributions,employer:flows.employer,growth:flows.growth,outsideDeposit:flows.outsideDeposit||0,dividends:flows.dividends,withdrawals:flows.withdrawals,expected:expected,actual:row.total,drift:drift});var nonFinite=[];Object.keys(row).forEach(function(k){if(typeof row[k]==="number"&&!Number.isFinite(row[k]))nonFinite.push(k)});if(nonFinite.length)recordIssue(issues,"NON_FINITE_ROW_VALUE","ERROR","Projection row contains a NaN or Infinity value.",{age:row.age,fields:nonFinite});var negative=[];flows.accounts.forEach(function(a){if(a.balance<-.005)negative.push({name:a.name,taxClass:a.taxClass,balance:a.balance})});if(negative.length)recordIssue(issues,"NEGATIVE_ACCOUNT_BALANCE","ERROR","One or more account balances went negative.",{age:row.age,accounts:negative})}
/* simulatePlan() is public, and it refuses what runPlan() refuses (S5 block 2n). A direct call runs the same input
   gates first -- list shape, boolean flags, finite balances and contributions, the account contract, the documented
   flag defaults and serialization -- so a refused input returns refusedSimulation()'s shape, with an ERROR issue in
   the caller's collector when there is one, never a plausible-looking projection; and a passing input is simulated
   with its documented defaults, exactly as runPlan() simulates it. runPlan() has already run those gates, so it
   passes their serialized text (the JSON of accounts, otherAssets and debts, in that order, parsed here instead of
   cloned again) and the gate function itself as gateToken, which no outside caller can hold. A serialized argument
   without the token is not trusted: the gate recomputes it.
   ltcRandom is required when long-term care is on: null for the deterministic onset, or a function returning a number
   in [0, 1) for a drawn one. A direct call that omits it (three arguments) throws a TypeError when `advanced.ltcOn` is
   true, as the 2026-09-16 external audit observed; runPlan(), the heat map, the Worker and the benchmarks all pass null
   or a generator. Documented, not changed: defaulting it would pick a timing model on the caller's behalf. */
/* S5AA R23 (R22-01, ChatGPT's R22 whole-model audit, P2; the owner, 2026-09-24: key the flag on actual Roth draws by the owner's age).
   X02: a Roth withdrawal is penalty-free and gains-free at every age -- there is no ordering stack, no basis term and no
   five-year clock -- so the reference is restricted to QUALIFIED Roth withdrawals, and a Roth dollar drawn before its
   OWNER is 59 1/2 is the detectable proxy for one that may not be. The flag was raised from INPUTS (a Roth held, the
   primary retiring before 59 1/2 with recurring spending, or an early conversion) and never looked at what the plan did:
   it fired where the taxable account paid every dollar, and was silent where a Roth paid a one-time expense at 45. In
   r14, 7 of its 13 flagged members drew no Roth dollar early, and one unflagged member drew $994 at 45. It is now raised
   where a draw happens -- the spending and tax-funding draws (withdrawFromAccountList) and a manual transfer out to a
   non-Roth account -- once per run, naming the owner's age at the first such draw. A conversion INTO a Roth is not a
   Roth draw. Monte Carlo carries a later path's flag up to the run, since only path 0 reports its own issues.
   S5AA R24 (R23-01): a transfer is judged at its own age. A POOLED draw -- recurring spending, a one-time expense, tax
   funding -- has no date inside its year and is judged at the age the year opened at, so a year that opens at 59 counts
   its whole draw as before 59 1/2 (the owner, 2026-09-24: "Keep it and disclose it"); the message says so. The 10% additional
   tax on a pooled pre-tax draw follows the same convention (earlyWithdrawalPenaltyRate() at the year-opening age). */
function noteEarlyRothDraw(issues,ownerAge){if(!issues)return;for(var i=0;i<issues.length;i++)if(issues[i]&&issues[i].code==="UNSUPPORTED_ROTH_ORDERING")return;recordIssue(issues,"UNSUPPORTED_ROTH_ORDERING","WARNING","A Roth account was drawn before its owner reached 59 1/2. A transfer is judged at its own age; a spending or tax-funding draw is judged at the age its projection year began, because the engine pools a year's draws, so part of such a draw may in fact fall after 59 1/2. A withdrawal from a Roth account is modelled as tax-free and penalty-free at every age: the contribution-then-earnings ordering, the recovery of basis and the five-year clocks are not modelled, so this projection is a reference only for QUALIFIED Roth withdrawals, and this draw may not be one.",{path:"accounts",outsideSupportedDomain:true,exclusion:"non-qualified Roth withdrawals",carriedTo:"new-engine Roth block",firstDrawOwnerAge:ownerAge})}
function simulatePlan(p,random,historyOffset,ltcRandom,issues,serialized,gateToken){if(gateToken!==scenarioInputGate){var gate=scenarioInputGate(p);if(gate.code){recordScenarioRefusal(issues,gate.code,gate.flagPath);return refusedSimulation(p,gate.code)}p=withResolvedStrategy(gate.plan,issues);serialized=gate.serialized}
      var accounts=serialized&&serialized[0]?JSON.parse(serialized[0].text):clone(p.accounts),otherAssets=serialized&&serialized[1]?JSON.parse(serialized[1].text):clone(p.advanced.otherAssets||[]),debts=serialized&&serialized[2]?JSON.parse(serialized[2].text):clone(p.advanced.debts||[]),taxableBasisReady=initTaxableBasis(accounts),rows=[],inflationFactor=1,lifetimeTaxes=0,failed=false,/* Q91 (F5): the crediting months earned SO FAR, per person. The adjustment of the reduction factor is
         cumulative and permanent, so it is run state rather than row state -- a month withheld at 62 is
         still buying a larger benefit at 85. */ssCreditedMonths={self:0,spouse:0},/* Q87 step 2: each owner's Form 8606 basis, carried across rows. Basis is a running total -- nondeductible contributions in, nontaxable distributions out -- and it NEVER crosses owners. */iraBasisState={self:0,spouse:0},/* R18 (B1 (c)): the household's capital loss carried into the next row. */capitalLossCarry=0,capitalLossCarryByOwner={self:0,spouse:0},/* R19 workstream A: each owner's unused post-70.5 QCD offset, and the tax true-up owed into the next row. */qcdOffsetState={self:0,spouse:0},taxTrueUpCarried=0,iraBasisDisclosed=false,/* R7-02: what actually changed hands at each death. Decision 8: the row opening at which nobody is alive, where the projection stopped. */successionEvents=[],successionDone={},noSurvivorFrom=null,firstShortfallAge=null,sustainedFailureAge=null,firstCalculationErrorAge=null,shortfallStreak=0,limitWarnings=[],magiHistory=[],filingHistory=[],ltcStart=null,ltcWeight=1,retireBalance=null,retireInflationFactor=null,priorSpend=null,priorReturn=0,/* SA-04 fix (SPRINT_EXTERNAL_AUDIT_20260909.md): the DECISION-TIME inflation
         input -- the last CPI change the household could actually have observed.

         `annualInflation` is used in two places with opposite requirements. At the
         END of a period it accumulates inflationFactor, which is ex-post
         purchasing-power accounting and correctly uses the REALIZED figure. But it
         was also passed into strategySpending(), where fixedReal/guardrails/guyton
         compute priorSpend*(1+annualInflation) -- and in historical mode that is
         the same period's own not-yet-realized CPI outcome. Changing only a
         period's own inflation moved its own decision from $40,000 to $44,000.

         Seeded with the configured forecast because no period has been observed
         yet, then updated to each period's realized figure once that period has
         elapsed. For simple/monteCarlo the configured assumption is constant, so a
         one-period lag on observed data is arithmetically identical to the
         assumption itself -- an intentionally known input is preserved exactly. */
      priorObservedInflation=p.assumptions.inflation/100,priorObservedInflationFactor=1+p.assumptions.inflation/100;
      if(p.advanced.ltcOn){if(ltcRandom===null){ltcStart=Math.max(65,Math.round(p.profile.retireAge+10));ltcWeight=p.advanced.ltcProbability/100}else if(ltcRandom()<p.advanced.ltcProbability/100)ltcStart=Math.max(65,Math.round(p.profile.retireAge+5+ltcRandom()*20))}
      /* S5 2o (decided 2026-09-13, the owner): insurance counts in net worth from the
         first year. The result contract's net-worth rule includes it once age
         reaches selfLife, and every later row already did; the opening row
         omitted it when a plan started at or past selfLife. */
      var start=p.profile.age,end=p.profile.endAge,boundaries=[];for(var boundary=Math.floor(start)+1;boundary<=Math.floor(end);boundary++)boundaries.push(boundary);if(end%1!==0&&(!boundaries.length||boundaries[boundaries.length-1]!==end))boundaries.push(end);/* S5AA R9 ROUND, the owner's decision 8 (2026-09-21): THE PROJECTION STOPS AT THE LAST DEATH. A row is projected only while
   someone the plan models is alive at its opening, by householdSurvivorship() -- the reading the filing status, the
   Medicare count and the old exclusion's predicate all use -- so the year of the last death is the final row and its
   balances are what the household leaves. EA-01 (the R6 external audit): the rows after it projected spending,
   withdrawals, tax and returns for a household in which nobody is alive; EA-01 disclosed them as outside the supported
   domain and left what to DO to this decision. The requirement stands -- no figure for such a row -- and is now met by
   there being no such row. The external reviewer recommended stopping; the owner decided it. A horizon ending sooner is
   unchanged. The cut itself is lastDeathCutAge()'s, so a disclosure outside this loop reads the same boundary (R11 round,
   audit R10-07). */noSurvivorFrom=lastDeathCutAge(p);if(noSurvivorFrom!==null)boundaries=boundaries.filter(function(b){return b<=noSurvivorFrom});var initial=totalBalance(accounts),initialAssets=sum(otherAssets,function(x){return x.value}),initialDebt=sum(debts,function(x){return x.balance});rows.push({age:start,total:initial,realTotal:initial,taxable:taxClassBalance(accounts,"taxable"),preTax:taxClassBalance(accounts,"preTax"),roth:taxClassBalance(accounts,"roth"),hsa:taxClassBalance(accounts,"hsa"),contributions:0,income:0,spending:0,withdrawals:0,dividends:0,taxes:0,rmd:0,rmdDistributed:0,rmdUnmet:0,shortfall:0,debtPayments:0,debtPaymentsTotal:0,debtInterest:0,debtPrincipal:0,debtHousing:0,otherAssets:initialAssets,debtBalance:initialDebt,nonPortfolioDraw:0,inflationFactor:1,networth:initial+(p.advanced.networthOn?initialAssets-initialDebt+(start>=p.retirement.selfLife?p.advanced.insurance:0):0),magi:0,federalAgi:0,ssProvisionalIncome:0,seniorDeductionMagi:0,niitMagi:0,irmaaMagi:0,taxSettled:0,taxTrueUpPaid:0,taxOutstanding:0});
      var startHistory=historyIndex(p,historyOffset);
      for(var yi=0;yi<boundaries.length;yi++){
        var rowAge=boundaries[yi],age=yi===0?start:boundaries[yi-1],duration=rowAge-age,yearProgress=age-start,spouseAge=p.profile.spouseAge+yearProgress,histIndex=(startHistory+yi)%HIST_RETURNS.length,histReturn=HIST_RETURNS[histIndex][1],annualInflation=p.assumptions.method==="historical"?HIST_INFLATION[histIndex][1]:p.assumptions.inflation/100,openingPreTax=taxClassBalance(accounts,"preTax"),/* Q90: the per-account balances at the row's open, so each obligation keeps the prior-year basis
            the pooled figure used to carry for the household as a whole.
            R14 round, external re-audit of 6468235 (R13-01): NO PROTOTYPE, as in rmdProtectedAmounts(). An id of
            "__proto__" assigned through the inherited accessor and left no own entry, so rmdObligations() fell back to
            the LIVE balance and recomputed the obligation from what the conversion and the year's loss had left: one
            owner's $100,000 IRA owed $220.57 instead of $4,950.50, fully paid, `ok` -- and with no conversion, $4,455.45,
            the obligation on the balance after a -10% year instead of the opening one. */openingById=accounts.reduce(function(o,a){o[a.id]=a.balance;return o},Object.create(null)),rowOpening=issues?totalBalance(accounts):0,growthTotal=0;
        /* S5AA follow-up, Q4 (the owner, 2026-09-21): A DECEASED SPOUSE'S ACCOUNTS PASS TO THE SURVIVOR, modelled as the
           surviving spouse's election to treat them as their own -- Treas. Reg. 1.408-8(c) for an IRA, IRC
           402(c)(9) for a plan (citation checks 17 and 18). THE TIMING IS THE REGULATION'S: the year of death
           stays the decedent's -- a distribution the owner had not taken is still due on the owner's own
           schedule (1.408-8(c)(3)), and 402(c)(4)(B) keeps it out of any rollover -- and from the year after,
           the accounts are the survivor's, on the survivor's age and start age. So the owner changes in the
           first row householdSurvivorship() calls the decedent dead, which is exactly the boundary F-02's
           filing transition uses. Form 8606 BASIS MOVES WITH THEM (Publication 590-B: only a spouse who treats
           the IRA as their own may combine basis -- citation check 19); moving the accounts without it would tax the
           survivor again on money already taxed. Where nobody survives there is no one to elect, and
           nothing moves: that is the beneficiary case, carried to the new engine (Q5). A one-person
           household is untouched. Every owner-keyed rule downstream -- required distributions, QCD
           eligibility, the pro-rata pool, HSA ages -- reads `owner`, so changing it here is the whole
           MECHANICAL repair. IT IS NOT A LEGAL CLAIM FOR EVERY ACCOUNT (R6 external audit, EA-07): the authority
           above covers IRAs and workplace plans (and, for a Roth IRA, question and answer 14 of Treas. Reg. 1.408A-6). An HSA passes
           as the spouse's own only if the spouse is its designated beneficiary (IRC 223(f)(8)); a taxable
           account's basis is stepped up at death (IRC 1014), which moving it unchanged does not do; a custom
           account has no rule of its own. Those are ASSUMPTIONS, and SPOUSAL_ROLLOVER_ASSUMED names them
           account by account for a decision -- the behaviour is deliberately not narrowed without one. */
        if(p.profile&&p.profile.spouseOn){(function(){
          var who=householdSurvivorship(p,age),from=null,to=null;
          if(!who.selfAlive&&who.spouseAlive){from="self";to="spouse"}
          else if(who.selfAlive&&!who.spouseAlive&&who.spouseModelled){from="spouse";to="self"}
          if(!from)return;/* S5AA R18 self-audit, SA18-02: the decedent's carried capital loss ended with their final return (Pub. 559). */capitalLossCarryByOwner[from]=0;capitalLossCarry=capitalLossCarryByOwner.self+capitalLossCarryByOwner.spouse;/* R19 workstream A: the post-70.5 QCD offset is the decedent's own contribution history, and does not pass. The IRA basis does, below (a spouse treating the IRA as their own combines it). */qcdOffsetState[from]=0;
          /* R7-02: THE SUCCESSION IS RECORDED HERE, from the WORKING accounts, the first time a death hands them over
             -- not rebuilt beforehand from the configured ones. MEASURED at 99a2e6d: a spouse's IRA moved into
             their empty taxable account before the death was disclosed as the IRA passing, and the funded taxable
             account went unnamed. Each account is recorded with the balance it holds at this row's opening; one
             holding nothing is listed as re-owned while empty, not as passing value. A joint account is recorded
             whichever spouse dies (R7-03); it changes owner only when the self dies, as it always has. A death BEFORE the
             plan starts is handed over, and so recorded, at the first row (A4-1). */
          var event=successionDone[from]?null:{from:from,to:to,fromRowOpening:age,passed:[],empty:[]};successionDone[from]=true;
          accounts.forEach(function(a){if(!a)return;var side=a.owner==="spouse"?"spouse":"self",joint=a.owner==="joint";
            if(event&&(side===from||joint)){var bal=Math.max(0,Number(a.balance)||0),rec=accountSuccessionClass(a);
              rec.account=a.id;rec.type=a.type;rec.taxClass=a.taxClass;rec.owner=a.owner==null?"self":a.owner;rec.to=to;rec.balance=Math.round(bal*100)/100;
              (bal>0.005?event.passed:event.empty).push(rec)}
            if(side===from)a.owner=to});
          if(event&&(event.passed.length||event.empty.length))successionEvents.push(event);
          var carried=Math.max(0,Number(iraBasisState[from])||0);
          if(carried>0){iraBasisState[to]=(Number(iraBasisState[to])||0)+carried;iraBasisState[from]=0}
        })()}
        /* R19 workstream A: the row's settlement starts from each owner's basis as the row opens (after any death's handoff),
           with this row's IRA flows tallied from zero; last row's true-up is owed now. */
        var iraBasisAtRowStart={self:form8606Basis(iraBasisState,"self"),spouse:form8606Basis(iraBasisState,"spouse")},trueUpDue=taxTrueUpCarried,iraTrueUp=0,taxesSettled=null,rowTaxesCommitted=false,iraSettled=false;taxTrueUpCarried=0;iraBasisState.row={self:{dist:0,conv:0,qcd:0,qhfd:0,nt:0},spouse:{dist:0,conv:0,qcd:0,qhfd:0,nt:0}};
        /* S5AA follow-up, Q3 (the owner, 2026-09-21: "End at the death"): A WAGE ENDS AT ITS EARNER'S DEATH, the way it
           ends at retirement -- the work duration is the shorter of the two, on the earner's own clock, so a
           death inside a row is prorated like a retirement inside a row. A death at lifespan L happens as the
           row opening at L begins, so that row pays nothing, which is where Social Security already stops.
           F-02 still files that row jointly; the return is about the tax year containing the death, not about
           earning. Contributions are bounded by these durations below, so they end with the wage. A lifespan
           that is not a finite number ends nothing, as before. */
        var workSpan=householdWorkDurations(p,age,spouseAge,duration);
        var selfWorkDuration=workSpan.self,spouseWorkDuration=workSpan.spouse,rowElig=ownerContributionWindow(p,age,spouseAge,duration),selfContributionDuration=rowElig.durations.self,spouseContributionDuration=rowElig.durations.spouse,retiredDuration=Math.max(0,rowAge-Math.max(age,p.profile.retireAge)),salary=selfWorkDuration>0?p.employment.salary*Math.pow(1+p.employment.growth/100,yearProgress):0,spouseSalary=spouseWorkDuration>0?p.employment.spouseSalary*Math.pow(1+p.employment.growth/100,yearProgress):0,wages=salary*selfWorkDuration+spouseSalary*spouseWorkDuration,contributions=0,employer=0,matchRothIncome=0,excess=0,preTaxDeferrals=0,iraBasisAdded=0,hsaWageSelf=0,hsaWageSpouse=0,iraPreTaxSelf=0,iraPreTaxSpouse=0,coveredSelf=false,coveredSpouse=false,audit=auditContributions(p,age,salary,spouseSalary,rowElig,ownerCompensation(p,age,salary,spouseSalary,inflationFactor,startHistory,{duration:duration,selfWork:selfWorkDuration,spouseWork:spouseWorkDuration,selfContribution:selfContributionDuration,spouseContribution:spouseContributionDuration,selfIraContribution:rowElig.durations.selfIra,spouseIraContribution:rowElig.durations.spouseIra}));
        /* AUD-005 fix (T06): contributionDuration used to be a single value
           shared by every account, capped only by the shared contributionStop
           age -- never intersected with whether that account's OWNER was
           actually still working. A dollar-mode contribution (unlike a
           salary-percent one, which happens to zero itself out at $0 salary)
           kept flowing past retirement whenever contributionStop was set
           later than retireAge. Now each account's contribution duration is
           the SAME shared contributionStop cap intersected with that
           specific account owner's own remaining work duration. */
        if(selfContributionDuration>0||spouseContributionDuration>0||rowElig.durations.selfIra>0||rowElig.durations.spouseIra>0){audit.items.forEach(function(item){var itemIra=accountType(item.account.type).limitGroup==="ira",itemDuration=item.account.owner==="spouse"?(itemIra?rowElig.durations.spouseIra:spouseContributionDuration):(itemIra?rowElig.durations.selfIra:selfContributionDuration);if(itemDuration<=0)return;var c=item.allowed*itemDuration,target=accounts.find(function(x){return x.id===item.account.id});if(target){addTaxableBasis(target,c);target.balance+=c;contributions+=c;var group=accountType(target.type).limitGroup;/* S5AA R33 (SA32F-31): only the lawful part is excluded; under "warn" the rest is deposited and taxed. */var lawfulC=Math.min(c,(item.lawful===undefined?item.allowed:item.lawful)*itemDuration);if((target.taxClass==="preTax"&&group==="workplace")||target.taxClass==="hsa")preTaxDeferrals+=lawfulC;/* Q104 (G11): an HSA contribution is tracked SEPARATELY and PER OWNER, because "pre-tax" is not one
           category. Publication 969: a contribution an employer makes using an employee's salary reduction
           through a cafeteria plan is treated as an EMPLOYER contribution, and employer HSA contributions are
           not subject to social security or Medicare tax. An ordinary 401(k) elective deferral is excluded
           from income tax but REMAINS WAGES for both, which is why it must not be added here -- preTaxDeferrals
           above deliberately mixes all three routes and feeds only the INCOME tax base.
           Per owner because OASDI is capped per person, exactly as for the employment streams in Q98. */if(target.taxClass==="hsa"){if(target.owner==="spouse")hsaWageSpouse+=lawfulC;else hsaWageSelf+=lawfulC}/* Q87 (F1): the deductible-IRA contribution, per owner, and the ACTIVE-PARTICIPANT inference beside it.
           The task permits coverage to be inferred and requires the gap to be documented: an owner counts as
           covered in any year their workplace plan receives an employee OR employer contribution. Publication
           590-A is explicit that a DEFINED BENEFIT participant is covered merely by being eligible -- "even if
           you declined to participate ... didn't make a required contribution, or didn't perform the minimum
           service" -- so a contribution-based inference misses exactly that class. The engine models no defined
           benefit plan at all, so the case cannot arise from its own inputs, and an excluded case never
           supplies a certified expected value. A ROTH IRA is deliberately absent: it is never deductible. */if(group==="ira"&&target.taxClass==="preTax"){if(target.owner==="spouse")iraPreTaxSpouse+=lawfulC;else iraPreTaxSelf+=lawfulC}if(group==="workplace"&&c>0.005){if(target.owner==="spouse")coveredSpouse=true;else coveredSelf=true}/* S5AA R33 (SA32F-14): profit sharing is an employer contribution of its own (IRC 415(c)(2)); it was paid only with the match switched on. */if(group==="workplace"&&(target.matchOn||Number(target.profitShare)>0)){var ownerSalary=target.owner==="spouse"?spouseSalary:salary,eligibleSalary=Math.min(ownerSalary,RULES.retirement.workplace.compensationLimit),match=(target.matchOn?Math.min(c,eligibleSalary*target.matchCap/100*itemDuration)*target.matchRate/100:0)+eligibleSalary*(Number(target.profitShare)||0)/100*itemDuration;/* Q95 (F9): IRC 414(v)(3)(A)(ii) disregards the catch-up for section 415(c), so the room is measured
                  against the NON-CATCH-UP deferral. NOTE what this number is: the remaining DOLLAR-LIMIT room,
                  not unconditional employer eligibility -- eligibleSalary above already applies the 401(a)(17)
                  compensation limit, and the plan's own matchCap, matchRate and profitShare still bind, which is
                  why the min() is a min and not an assignment. Applying 415(c) per EMPLOYER GROUP is a
                  DIFFERENT item -- it is the carried spec vector for ACCOUNT section 17, test 8, named in
                  tools/test-exception-registry.json, and it stays a todo. Its identifier is deliberately not
                  written here as an ID: engine comments are harvested by tools/requirements-register.js, and
                  an ID it cannot resolve becomes a phantom requirement. */match=Math.min(match,RULES.retirement.workplace.totalEmployeeEmployer*itemDuration-(c-(item.catchUp||0)*itemDuration));match=Math.max(0,match)*target.vesting/100;/* Q96 (F10): the match is routed BY ITS CHARACTER. `target.balance+=match` put it wherever the
                  deferral went, which handed a Roth 401(k) household tax-free employer money. An elected
                  Roth match is the employee's income in the row that allocates it (Notice 2024-2 section L answer 2) and
                  stays outside the payroll base (section L answer 6), so it is added to matchRothIncome and nowhere near
                  the wage figures. */var matchRoth=employerMatchIsRoth(target),matchDest=employerMatchDestination(accounts,target,matchRoth);matchDest.balance+=match;if(matchRoth)matchRothIncome+=match;employer+=match;/* Q87: an EMPLOYER contribution establishes active-participant status just as an employee deferral does. */if(match>0.005){if(target.owner==="spouse")coveredSpouse=true;else coveredSelf=true}}}excess+=item.excess*itemDuration});if(p.limitPolicy==="redirect"&&excess>0){var taxable=accounts.find(function(x){return x.taxClass==="taxable"});if(taxable){addTaxableBasis(taxable,excess);taxable.balance+=excess;contributions+=excess}else limitWarnings.push("Excess contributions could not be redirected because no taxable account exists.")}}
        var transferLimitNote=null,transferTaxable=0,transferHsaDeduction=0,transferGain=0,transferGainByOwner={self:0,spouse:0,joint:0},transferMoved=0,transferHeld=null,transferDated=null,transferToTaxable=0,transferPenalty=0,transferRmdCredit=null,rowCapacityGroups=null,capacityGroupsForRow=function(){return rowCapacityGroups||(rowCapacityGroups=conversionCapacityGroups(accounts,age,p,openingById,duration))},groupHolding=function(a){var g=capacityGroupsForRow();for(var gi=0;gi<g.length;gi++)if(g[gi].accounts.indexOf(a)>=0)return g[gi];return null};/* S5AA R27 (R25-01, the owner 2026-09-26: "Move what's there"): a mid-year transfer can ask for more than its source holds on
   its date -- $100,000 of a -10% account at 60.5, which holds $94,868.33 then -- and R25's growth correction then left the
   source at -$4,868.33 with status ok (ChatGPT's R25-01, reproduced at 4b7d516). To cap the amount the transfer must know
   the source's return, so in a year with a transfer strictly inside it the year's rates are drawn HERE, before the
   transfer, for the same accounts in the same order (nothing between here and the usual draw creates an account or
   draws a random number; only the reserve share, which reads each account's balance, can see the difference). Every
   other year draws them where it always has. */
var earlyRates=null;if(p.advanced.transferOn&&p.advanced.transferAge>age+1e-9&&p.advanced.transferAge<rowAge-.0001&&duration>0){var earlyTotal=totalBalance(accounts);earlyRates=accounts.map(function(ac){return accountReturnForPeriod(ac,p,age,yearProgress,histReturn,random,earlyTotal)})}
        /* S5AA R28.1 (found in R28.1's self-audit; the owner 2026-09-26: "Repair in R28.1"): A TRANSFER DATED AFTER THE YEAR'S DRAW RUNS
   AFTER IT. The year's spending is drawn at one point (drawPoint: half way through for monthly timing, 0.625 for quarterly,
   the end for annual), and the transfer always ran before it, so one dated after it was spent as if it had already arrived:
   the destination's dollars were drawn before they existed and the source's were kept from the spending that should have
   reached them (against a dated ledger, 19 of 30 plans differed at 5a5cb39, from $2,798.99 too high to $4,922.07 too low).
   Now such a transfer runs after the draw and before the tax quote: `grown` is how much of the row the balances have grown
   by when it runs (0 here, the pre-draw growth there), so the date growth is taken from that point. The draw has already
   paid the year's required distributions, so a late transfer is neither held to their reserve nor credited toward them. */var drawPoint=p.assumptions.withdrawalTiming==="annual"?duration:p.assumptions.withdrawalTiming==="quarterly"?duration*.625:duration*.5,lateTransfer=!!earlyRates&&clamp((p.advanced.transferAge-age)/duration,0,1)*duration>drawPoint+1e-9,latePlan=null,lateHold=null,/* S5AA R30: the year's dividend terms, as the dividend base below reads them (dividendDuration, yieldRate, reinvestSpan). */rowDividendTerms=function(){if(!p.retirement.dividendOn)return null;var paidSpan=Math.max(0,rowAge-Math.max(age,p.profile.retireAge,p.retirement.dividendStart));return {yieldRate:p.retirement.dividendYield/100*Math.pow(1+p.retirement.dividendGrowth/100,Math.max(0,age-p.retirement.dividendStart)),paidSpan:paidSpan,reinvestSpan:Math.max(0,duration-paidSpan)}},/* S5AA R29 (PCF-02), moved here by R30: the room a one-time contribution into `t` leaves this year, and the note its excess makes. */transferRoom=function(t,amount){var once=auditContributions(p,age,salary,spouseSalary,rowElig,ownerCompensation(p,age,salary,spouseSalary,inflationFactor,startHistory,{duration:duration,selfWork:selfWorkDuration,spouseWork:spouseWorkDuration,selfContribution:selfContributionDuration,spouseContribution:spouseContributionDuration,selfIraContribution:rowElig.durations.selfIra,spouseIraContribution:rowElig.durations.spouseIra}),{account:t,amount:amount}).oneTime;return once&&once.excess>.01?{amount:p.limitPolicy!=="warn"?once.allowed:amount,note:{asked:amount,room:once.allowed,group:once.group}}:{amount:amount,note:null}},/* S5AA R30 (R29-01, ChatGPT's R29 change audit; the owner 2026-09-28: "Repair in R30"): WHAT THE TRANSFER MAY MOVE, BEFORE THE
   SOURCE'S BALANCE IS CONSULTED -- nothing for a refused conversion, a refused move into a 401(k) or the same account on both
   sides, the room for a contribution. runTransfer() and the preview of a transfer dated after the draw both ask it, so they
   cannot disagree: R29 capped the transfer at the room and left the preview at the amount asked, so a $50,000 taxable -> Roth
   IRA transfer at 60.75 with no compensation moved $0 and still took $50,000 out of the source's dividend base for a quarter
   ($3,750 of dividends where $5,000 is right, $31.25 of tax missing; reproduced at aaff3f1). */transferAllowed=function(f,t){var amount=p.advanced.transferAmount;if(!f||!t||f===t||(f.taxClass==="preTax"&&t.taxClass==="roth"&&!lawfulConversionDestination(f,t))||transferIntoWorkplaceRefused(f,t)||transferBetweenOwnersRefused(f,t))return {amount:0,note:null};return transferIsContribution(f,t)&&amount>0?transferRoom(t,amount):{amount:amount,note:null}},runTransfer=function(grown){if(p.advanced.transferOn&&p.advanced.transferAge>=age-.0001&&p.advanced.transferAge<rowAge-.0001){/* S5AA R24 (R23-01, the owner 2026-09-24): A SCHEDULED TRANSFER HAS A DATE, and its age tests read it. The Roth flag and the 10% on a pre-tax transfer to taxable below read `age`, the age the projection year OPENED at, so a transfer made AT 59 1/2 in a year opening at 59 was a Roth draw "before 59 1/2" and paid the 10% that IRC 72(t)(2)(A)(i) lifts on and after the date the owner attains 59 1/2 ($2,000 on $20,000, measured at 3bc8946). transferOnAge is the primary's age on the transfer date; accountOwnerAge() moves it to the source's owner. Draws the engine pools by year keep the year-opening age (noteEarlyRothDraw()). */var transferOnAge=p.advanced.transferAge,f=accounts.find(function(x){return x.id===p.advanced.transferFrom}),t=accounts.find(function(x){return x.id===p.advanced.transferTo}),transferAmount=p.advanced.transferAmount;/* Fifth internal audit, finding 2: a pre-tax to Roth transfer IS a conversion (CR2-01 taxes it as one), so it obeys the
   conversion rule -- the owner's own Roth, and a Roth IRA for a traditional IRA. It moved into the spouse's Roth or a
   Roth 401(k) silently. Refused, it moves nothing and says why, once. */if(f&&t&&f!==t&&f.taxClass==="preTax"&&t.taxClass==="roth"&&!lawfulConversionDestination(f,t)){if(transferAmount>0&&issues&&!issues.some(function(x){return x&&x.code==="TRANSFER_CONVERSION_REFUSED"}))recordIssue(issues,"TRANSFER_CONVERSION_REFUSED","WARNING","A transfer from a pre-tax account into a Roth account is a Roth conversion, and a conversion must go into the same person's own Roth account -- for a traditional IRA, a Roth IRA. This transfer does not, so nothing was moved.",{path:"advanced.transferTo",from:f.id,to:t.id,age:rowAge});transferAmount=0}/* RP-01: THE SAME ACCOUNT ON BOTH SIDES IS A NO-OP, and it is decided here, before the RMD reservation below is consulted and before any income is recognised. moveFunds() refuses it too -- the audit asked for the decision at the shared transaction boundary AS WELL AS the caller, because one of the two will eventually be the only one a future path goes through. */if(transferBetweenOwnersRefused(f,t)){if(transferAmount>0&&issues&&!issues.some(function(x){return x&&x.code==="TRANSFER_BETWEEN_OWNERS_REFUSED"}))recordIssue(issues,"TRANSFER_BETWEEN_OWNERS_REFUSED","WARNING","A rollover between retirement or HSA accounts must stay with the same owner; one spouse's account cannot roll into the other's while both are living. Nothing was moved.",{path:"advanced.transferTo",from:f.id,to:t.id,age:rowAge});transferAmount=0}if(transferIntoWorkplaceRefused(f,t)){if(transferAmount>0&&issues&&!issues.some(function(x){return x&&x.code==="TRANSFER_INTO_WORKPLACE_REFUSED"}))recordIssue(issues,"TRANSFER_INTO_WORKPLACE_REFUSED","WARNING","A 401(k) can only receive payroll contributions, a rollover of the same tax character from its owner's own plan or pre-tax IRA, or a conversion to its owner's own Roth account. A Roth IRA cannot roll into a 401(k), and this transfer is not one of those, so nothing was moved.",{path:"advanced.transferTo",from:f.id,to:t.id,age:rowAge});transferAmount=0}if(f&&t&&f===t)transferAmount=0;/* S5AA R29 (PCF-02): a transfer into an IRA or an HSA from a different kind of account is a contribution, held to the
   room the year's planned contributions leave. Under "redirect" only what fits moves and the rest never leaves the source (the
   owner, 2026-09-28: "Stays in the source") -- so an HSA source is not distributed, or taxed, on it; under "warn" all of it moves
   and the excess is warned about, as a planned contribution is. */var transferContribution=transferIsContribution(f,t),transferDecision=transferAllowed(f,t);transferAmount=transferDecision.amount;transferLimitNote=transferDecision.note;/* RC-01: a pretax source may not hand away the dollars the RMD is owed from -- and, since the R11 round (external audit
   R10-02), the dollars ITS OWN obligation is owed from, not the household's total. A transfer has one source, so the
   clamp is that source's obligation: a spouse's untouched IRA no longer lets self's be emptied.
   R15 round, external audit of 1e6faae (R14-01; S2 carried item U1, the owner 2026-09-13: "credit it -- a distribution
   satisfies the RMD regardless of destination account"): a transfer to a TAXABLE account is a distribution, and the
   dollars it takes from the obligation's reserve PAY the obligation, so they are not withheld from it. Only a move that
   stays sheltered -- a conversion into a Roth account, a rollover -- is held to the capacity above the reserve. *//* S5AA R28 (R27-01): the source's growth from the year's opening to the transfer date, with growAccounts()'s compounding (1 in a year with no transfer strictly inside it); R28.1 (R27F-01): the destination's too. */var dateGrowth=1,destDateGrowth=1;if(earlyRates&&f&&t&&f!==t){var dateSpan=clamp((transferOnAge-age)/duration,0,1)*duration,srcIndex=accounts.indexOf(f),destIndex=accounts.indexOf(t);if(f.balance>0&&srcIndex>=0&&earlyRates[srcIndex]!==undefined)dateGrowth=Math.pow(Math.max(.001,1+earlyRates[srcIndex]),dateSpan-grown);if(destIndex>=0&&earlyRates[destIndex]!==undefined)destDateGrowth=Math.pow(Math.max(.001,1+earlyRates[destIndex]),dateSpan-grown)}if(!grown&&f&&t&&f!==t&&f.taxClass==="preTax")transferAmount=Math.min(transferAmount,groupHolding(f)?Math.max(0,groupHolding(f).capacity+(transferCountsTowardRmd(f,t)?groupHolding(f).reserve:0))*dateGrowth:0);/* RP-01: moveFunds() now owns the WHOLE transaction -- dollars and the basis that belongs to them -- so there is no second basis calculation beside this call to fall out of step with it. That duplication is what minted $10,000 of basis on a transfer from an account to itself. *//* S5AA R28 (R27-01, the owner 2026-09-26: "Repair"): THE TRANSACTION RUNS AT THE TRANSFER DATE. R27 capped the amount at what
   the source holds on the date (R25-01), but moveFunds() ran at the opening balance and capped it again there, so a rising
   source could not move what it had earned since the year opened: $103,000 asked of $100,000 at +10%, which holds
   $104,880.88 at 60.5, moved $100,000, and a traditional IRA source was taxed on $100,000 (reproduced at 73e24c7). Now the
   source holds its date value for the transaction -- its opening balance grown by dateGrowth -- so moveFunds() caps at it
   and carries basis pro rata to it, and the IRA pools are measured at it; what moves, its tax, basis and RMD credit all
   follow. What is left goes back into opening-balance terms, B - A/g^f, which the year's growth carries to
   (Bg^f - A)g^(1-f): the source needs no growth correction, and the year's withdrawals see what it really holds. The
   capacity a pre-tax source may hand away is scaled the same way (above), and what the transfer takes off it (below). *//* S5AA R30 (the mirror of the found-in-passing leak; the owner 2026-09-28: "Repair in R30"): EACH ACCOUNT PAYS ITS OWN DIVIDENDS.
   A transfer before the draw runs before the dividends are figured, and the source is paid for the dollars it held before the
   date -- from its own balance, and what it did not hold was paid by the destination: $50,000 of taxable money moved into a
   traditional IRA at 60.25 left the IRA $1,250 short, IRA money leaving as a taxable account's dividends (reproduced at
   aaff3f1). A taxable source now moves only what its dividends leave. Holding B, moving m, with a yield y over the paid span P
   of which the part before the date is b, it pays y((B - m)P + mb) (a paid dividend does not shrink the base it was figured
   on, the engine's convention), so it can move m <= B(1 - yP)/(1 - yP + yb) -- at the date's value, like the capacity above. */if(!grown&&f&&t&&f!==t&&dateSpan>0){var ownTerms=rowDividendTerms();if(ownTerms&&dividendEligibleAccounts(accounts).indexOf(f)>=0){var ownBefore=Math.max(0,dateSpan-ownTerms.reinvestSpan),ownKeep=Math.max(0,1-ownTerms.yieldRate*ownTerms.paidSpan);transferAmount=Math.min(transferAmount,Math.max(0,f.balance)*dateGrowth*ownKeep/Math.max(1e-12,ownKeep+ownTerms.yieldRate*ownBefore))}}var dated=dateGrowth!==1||destDateGrowth!==1,beforeDateValue=issues&&dated?totalBalance(accounts):0;if(dateGrowth!==1)f.balance*=dateGrowth;var transferPools=iraPoolsAtStart(accounts);/* S5AA R32 (R31-01 of ChatGPT's R31 change audit; the owner 2026-09-28: "Repair in R32"): EVERY IRA OF THE
   OWNER, ON THE DATE. The source was carried to the date above; the owner's other IRAs were read where the row left them -- its
   opening, or the draw -- so a second IRA that grew before a funding made the pool too small and too much basis was used, and
   one that fell the reverse ($16.23 of tax too much, and $12.59 too little, in ChatGPT's witnesses at 8afe16d). Each other
   traditional IRA is carried from there to the date at its own rate, for this measure only: its balance is not moved, and the
   year's growth still carries it. The funding's taxable value and a rollover's into a 401(k) read this pool. */var datedPools={self:0,spouse:0};accounts.forEach(function(a,i){if(!a||a.type!=="traditionalIRA")return;var v=Math.max(0,Number(a.balance)||0);if(a!==f&&earlyRates&&earlyRates[i]!==undefined&&dateSpan>0)v*=Math.pow(Math.max(.001,1+earlyRates[i]),Math.max(0,dateSpan-grown));datedPools[a.owner==="spouse"?"spouse":"self"]+=v});if(transferIraIntoWorkplace(f,t)&&transferAmount>0){var rollOwner=f.owner==="spouse"?"spouse":"self",rollTaxable=Math.max(0,datedPools[rollOwner]-form8606Basis(iraBasisState,rollOwner));if(transferAmount>rollTaxable+.005){limitWarnings.push(t.name+": the transfer asked for "+money(transferAmount)+", but a 401(k) can take only an IRA's taxable money ("+money(rollTaxable)+" on the date) -- the rest is after-tax money, which stays in the IRA (IRC 408(d)(3)(A)(ii)).");transferAmount=rollTaxable}}var transferSourceBasis=f&&f.taxClass==="taxable"?taxableBasisOf(f):0;transferMoved=moveFunds(accounts,p.advanced.transferFrom,p.advanced.transferTo,transferAmount);/* S5AA R29 (found in passing with PCF-02; the owner 2026-09-28: "Repair in R29"): MONEY THAT LEAVES A TAXABLE ACCOUNT FOR A
   NON-TAXABLE ONE IS SOLD. moveFunds() carries the source's basis out pro rata -- at its value on the date, above -- and a
   non-taxable destination drops it, so the gain on the moved dollars vanished untaxed ($10,000 moved with $6,000 of basis left
   $4,000 unrealised forever). It is realised here, by the account's owner, as a taxable withdrawal realises it; a loss is a
   loss. Taxable to taxable is not a sale: shares can move in kind, and the basis travels with them. *//* S5AA R29 (self-audit): the limit warning is written AFTER the move, with what moved -- the source can hold less than the room (seed:13's taxable account is empty by the transfer's year, so $0 moved where the first wording said $5,400). */if(transferLimitNote)limitWarnings.push(t.name+": the transfer asked for "+money(transferLimitNote.asked)+", more than the "+money(transferLimitNote.room)+" of "+(transferLimitNote.group==="hsa"?"HSA":"IRA")+" contribution limit left this year; "+money(transferMoved)+" moved"+(p.limitPolicy==="warn"?", all it could, as the warn policy allows.":", and the rest stayed in the source account."));if(f&&t&&f.taxClass==="taxable"&&t.taxClass!=="taxable"&&transferMoved>0){var transferGainNow=transferMoved-(transferSourceBasis-taxableBasisOf(f));transferGain+=transferGainNow;transferGainByOwner[f.owner==="spouse"?"spouse":f.owner==="joint"?"joint":"self"]+=transferGainNow}if(dateGrowth!==1)f.balance/=dateGrowth;/* S5AA R28.1 (R27F-01, the owner 2026-09-26: "Repair"): THE DESTINATION RECEIVES THE DOLLARS ON THE DATE, as the source gives them
   up on it. R25 (R24F-02) booked them into the destination at the year's opening, let them earn its return from then, and
   took the first part back after the year's growth, never below zero (shiftTransferGrowth(), removed). When the year's
   spending had already drawn the destination, that floor erased what was owed: money was created and a real shortfall
   hidden ($100,000 moved at 60.5 into an account at +10% drawn first, $105,000 of spending: $9,880.88 left where $5,000 is
   right; reproduced at 73e24c7 and 56c8847). In opening-balance terms the destination now holds them as A/g^f, which the
   year's growth carries to Ag^(1-f); there is nothing to take back, so nothing is floored. The basis they carry stays in
   dollars. */if(destDateGrowth!==1&&transferMoved>0)t.balance-=transferMoved-transferMoved/destDateGrowth;/* R28.1 (R27F-02): the moved dollars, in each side's opening-balance terms, and the part of the row before the date -- the dividend base reads it. *//* R28.1: what actually moved and when, for the imputed yield, which is figured after any late transfer. */if(earlyRates&&f&&t&&f!==t&&transferMoved>0&&dateSpan>0)transferDated={from:f,to:t,amount:transferMoved,span:dateSpan};if(!grown&&earlyRates&&f&&t&&f!==t&&transferMoved>0&&dateSpan>0)transferHeld={from:f,to:t,fromAmount:transferMoved/dateGrowth,toAmount:transferMoved/destDateGrowth,span:dateSpan};/* Both sides' growth before the date is the year's growth, so the reconciliation counts it. */if(issues&&dated)growthTotal+=totalBalance(accounts)-beforeDateValue;/* R12 round (R11-01): what the transfer took is gone from its obligation's capacity, and the obligation has been drawn on.
   R15 round (R14-01): unless it went to a TAXABLE account. Then it is a distribution by the source's owner, and the
   first dollars distributed in a year count toward that year's requirement (Treas. Reg. 1.408-8(b)(3) for an owner's
   IRAs together; an employer plan's toward its own): they come off the RESERVE, up to what it holds, and only the
   excess comes off the capacity a conversion may use. The credit is recorded for the settlement, which must not take
   the same dollars again. MEASURED at 1e6faae: $10,000 from a $100,000 IRA at 80 to cash left $85,049.50 -- the
   transfer and the whole $4,950.50 on top of it -- where the law leaves $90,000. */if(!grown&&f&&f.taxClass==="preTax"&&transferMoved>0&&groupHolding(f)){var transferGroup=groupHolding(f),transferCredit=transferCountsTowardRmd(f,t)?Math.min(Math.max(0,transferGroup.reserve),transferMoved):0,transferBeyond=transferMoved-transferCredit;transferGroup.reserve-=transferCredit;if(transferCredit>0)transferRmdCredit={account:f,amount:transferCredit};if(transferBeyond>0){transferGroup.capacity-=transferBeyond/dateGrowth;transferGroup.drawn=true}}/* CR2-01: A PRETAX DISTRIBUTION IS ORDINARY INCOME WHEREVER IT LANDS. This read t.taxClass==="roth", so only a Roth conversion was recognised; a transfer of the same dollars to a TAXABLE account moved the balance through moveFunds() and recognised nothing. Measured on the pre-repair tree, $50,000 from a traditional IRA to taxable cash: MAGI $750 (incidental) against $50,000 due, $0 tax, and a household $49,250 of income better off for choosing the other destination in the same dropdown. Derived from transferMoved -- what the transaction actually moved -- so a refused or clamped transfer recognises exactly what it moved and nothing else. */var transferIsDistribution=f&&t&&f.taxClass==="preTax"&&(t.taxClass==="roth"||t.taxClass==="taxable"||(t.taxClass==="hsa"&&!transferIsHsaFunding(f,t))),transferBasis=transferIsDistribution?iraBasisRecoveredFor(f,transferMoved,iraBasisState,transferPools):0;/* EA-05: a pre-tax transfer out is a distribution like any other, and is priced by the same primitive. */transferTaxable=transferIsDistribution?transferMoved-transferBasis:0;if(transferIsDistribution)recordIraFlow(iraBasisState,f,t.taxClass==="roth"?"conv":"dist",transferMoved,transferBasis);/* S5AA R30 (R29-02): a qualified HSA funding distribution is taxable value first, then basis (settleIraYear()). */if(transferMoved>0&&transferIsHsaFunding(f,t)){var fundOwner=f.owner==="spouse"?"spouse":"self",fundBasisUsed=Math.min(form8606Basis(iraBasisState,fundOwner),Math.max(0,transferMoved-Math.max(0,datedPools[fundOwner]-form8606Basis(iraBasisState,fundOwner))));var fundRow=iraBasisState.row&&iraBasisState.row[fundOwner];if(fundRow){fundRow.qhfdPool=datedPools[fundOwner];fundRow.qhfdFlowsBefore=(Number(fundRow.dist)||0)+(Number(fundRow.conv)||0)}recordIraFlow(iraBasisState,f,"qhfd",transferMoved,0);if(fundBasisUsed>0)spendIraBasis(iraBasisState,fundOwner==="spouse"?{self:0,spouse:fundBasisUsed}:{self:fundBasisUsed,spouse:0})}if(transferBasis>0)spendIraBasis(iraBasisState,f.owner==="spouse"?{self:0,spouse:transferBasis}:{self:transferBasis,spouse:0});transferToTaxable=f&&t&&f.taxClass==="preTax"&&t.taxClass==="taxable"?transferMoved:0;/* Q93: a pre-tax to TAXABLE transfer is a distribution and owes the penalty under the same test as a
             withdrawal, from the SOURCE account. A pre-tax to ROTH transfer is a conversion and stays
             penalty-free, which is why transferToTaxable is the quantity and transferTaxable is not. Decision 4 (R9 round): and only
             its includible part -- the basis it recovered is not "includible in gross income" (IRC 72(t)(1)). */transferPenalty=(transferToTaxable>0?transferToTaxable-transferBasis:0)*earlyWithdrawalPenaltyRate(p,transferOnAge,f);/* S5AA R29: a pre-tax account other than a traditional IRA, into an HSA, is a distribution like one to a taxable account, and carries the same early-distribution tax on its includible part. */if(transferIsDistribution&&t.taxClass==="hsa")transferPenalty+=Math.max(0,transferMoved-transferBasis)*earlyWithdrawalPenaltyRate(p,transferOnAge,f);/* S5AA R29 (PCF-01, ChatGPT's PCF full-model audit; the owner 2026-09-28: "Tax it like a withdrawal"): A TRANSFER OUT OF AN HSA
   IS AN HSA DISTRIBUTION. Only a pre-tax source was taxed here, so a $10,000 HSA stated 0% qualified moved to a taxable account
   untaxed at 60, where IRC 223(f)(2) includes it in income and 223(f)(4)(A) adds 20% of it: $10,000 kept where $8,000 is right
   (reproduced at 8396626). The moved dollars are now taxed exactly as withdrawFromAccountList() taxes an HSA draw -- the
   account's includible share is ordinary income, and before its owner reaches the exception age, at the transfer's own age,
   that income carries the additional tax. HSA to HSA is not a distribution. *//* S5AA R29 (PCF-02): what moved as a contribution is deducted as one -- into a traditional IRA it joins the owner's IRA
   contributions (the IRA deduction rule, and a nondeductible part becomes basis); into an HSA it is a DIRECT contribution,
   deductible above the line (IRC 223(a), 62(a)(19)) with no payroll effect. A qualified HSA funding distribution is not deductible. */if(transferContribution&&transferMoved>0&&!transferIsHsaFunding(f,t)){if(t.taxClass==="preTax"&&accountType(t.type).limitGroup==="ira"){if(t.owner==="spouse")iraPreTaxSpouse+=transferMoved;else iraPreTaxSelf+=transferMoved}else if(t.taxClass==="hsa")transferHsaDeduction+=transferMoved}if(f&&t&&f.taxClass==="hsa"&&t.taxClass!=="hsa"&&transferMoved>0){var hsaTransferIncome=transferMoved*hsaIncludibleShare(f);transferTaxable+=hsaTransferIncome;transferPenalty+=hsaTransferIncome*hsaAdditionalTaxRate(p,transferOnAge,f)}/* S5AA R23 (R22-01): Roth money moved out to a non-Roth account is a Roth distribution. */if(f&&t&&f.taxClass==="roth"&&t.taxClass!=="roth"&&transferMoved>0){var transferOwnerAge=accountOwnerAge(p,transferOnAge,f);if(transferOwnerAge<59.5)noteEarlyRothDraw(issues,transferOwnerAge)}}};if(!lateTransfer)runTransfer(0);else{/* R28.1: the draw comes first, so the dividend base -- figured before the draw -- reads the transfer from a plan. R30
    (R29-01): what the plan may move is transferAllowed()'s answer, the transfer's own; the dollars it holds are figured after
    the growth before the draw (lateHold, below). */var lateFrom=accounts.find(function(x){return x.id===p.advanced.transferFrom}),lateTo=accounts.find(function(x){return x.id===p.advanced.transferTo}),lateFromIndex=accounts.indexOf(lateFrom),lateToIndex=accounts.indexOf(lateTo),lateSpan=clamp((p.advanced.transferAge-age)/duration,0,1)*duration;if(lateFrom&&lateTo&&earlyRates[lateFromIndex]!==undefined&&earlyRates[lateToIndex]!==undefined)latePlan={from:lateFrom,to:lateTo,span:lateSpan,allowed:Math.max(0,Number(transferAllowed(lateFrom,lateTo).amount)||0)}}
        /* RC-01 (adversarial addendum): the year's required distribution is
           RESERVED before a conversion may consume the balance it is owed from.

           The defect: this block ran first and took min(pre.balance, requested),
           i.e. the WHOLE pretax balance. The RMD withdrawal further down then
           drew from an empty account. The row still reported rmd
           4,065.040650406504 while the actual pretax movement was 0.00 -- an
           obligation was labelled paid because it had been CALCULATED. Aggregate
           wealth and current-year tax both tied against a reserving control,
           which is exactly why a portfolio-level check could not see it: this is
           a tax-CLASS allocation error, not a quantity error.

           The obligation is computed from openingPreTax, preserving the
           prior-year-balance basis rmdFor() already uses; the CAPACITY is read
           fresh, because the transfer block immediately above can have moved
           pretax money since the row opened. Publication 590-A excludes
           required-distribution amounts from a conversion. */
        /* Q97 (G1): the two clamps that belong to the ROW stay here -- the dollars the required
           distribution is owed from, and what the household asked for -- and the routing belongs to
           conversionRoutes(). The third clamp the old line carried, `pre.balance`, was not a clamp
           at all: it was the first array element's balance standing in for the household's capacity,
           and it is why array order changed the answer. */
        var conversion=0,conversionTaxable=0;if(p.advanced.conversionOn&&retiredDuration>0){var capacityGroups=capacityGroupsForRow(),converted=convertPreTaxToRoth(accounts,p,Math.min(capacityGroups.reduce(function(t,g){return t+g.capacity},0),p.advanced.conversionAmount*retiredDuration),priorReturn,iraBasisState,capacityGroups);conversion=converted.amount;/* EA-05: the income is what Form 8606 makes taxable, not the gross moved. */conversionTaxable=converted.taxableIncome;/* Decision 10 (R9 round): a conversion the rule refused is said, once. */if(converted.iraRefused&&issues&&!issues.some(function(x){return x&&x.code==="CONVERSION_IRA_NEEDS_ROTH_IRA"}))recordIssue(issues,"CONVERSION_IRA_NEEDS_ROTH_IRA","WARNING","A traditional IRA can be converted only into a Roth IRA, and its owner has none, so the requested Roth conversion was not made from it. A Roth 401(k) accepts conversions only of its own plan's money.",{path:"advanced.conversionAmount",age:rowAge})}
        var portfolioBeforeGrowth=totalBalance(accounts),rates=earlyRates||accounts.map(function(ac){return accountReturnForPeriod(ac,p,age,yearProgress,histReturn,random,portfolioBeforeGrowth)}),/* SA-03 fix (SPRINT_EXTERNAL_AUDIT_20260909.md): the period's POLICY RETURN
             SIGNAL is snapshotted here, while the rate set is still authoritative,
             and never re-derived from `rates` afterwards.

             `rates` has two consumers with incompatible needs: growAccounts()
             wants one entry per account that EXISTS, while this signal wants one
             entry per market exposure the period actually HAD. Those were the same
             set until R2-T06 made an account able to be born mid-period -- after
             which registering the synthesized RMD holding's rate (which it needs,
             or it gets no remaining-period growth) gave the source account's rate a
             second vote in the mean. A +2.5% period read as -1.667% and falsely
             triggered the post-down-year flexibility cut.

             The existing arithmetic-mean policy is deliberately preserved. A
             portfolio-weighted signal may be worth having, but that is a separate
             policy change and is not needed to repair this regression. */
            periodReturnSignal=sum(rates)/Math.max(1,rates.length),preGrowth=drawPoint;growAccounts(accounts,rates,preGrowth,rowCapacityGroups?rmdProtectedAmounts(rowCapacityGroups,p,priorReturn):null);if(issues)growthTotal+=totalBalance(accounts)-portfolioBeforeGrowth;/* S5AA R30 (R29-01; the owner 2026-09-28: "Protect the transfer"): THE DOLLARS A TRANSFER DATED AFTER THE DRAW WILL MOVE, valued
   here, at the draw. They are what transferAllowed() lets it move, at most what the source can hand over once it has paid its
   own dividends -- y(B P - h a) for a taxable source holding B, moving h, over the paid span P of which a is after the date, so
   h <= B(1 - yP)/(1 - ya) -- and the year's spending draw, which comes first, leaves them in the source. So the dividends
   figured on them leaving are the dividends of what does leave: before, a draw that spent the source left the transfer less
   than the dividends had been figured on, or nothing. Only such a source is held back from: one whose dividends are figured
   on the dollars before the draw. Any other source -- a Roth or pre-tax account, an HSA, a taxable one with no dividend --
   has nothing figured on them, and the draw sees it as it is on its date (R28.1). */var holdTerms=latePlan?rowDividendTerms():null;if(holdTerms&&holdTerms.yieldRate>0&&dividendEligibleAccounts(accounts).indexOf(latePlan.from)>=0){var holdIndex=accounts.indexOf(latePlan.from),holdToDate=Math.pow(Math.max(.001,1+(rates[holdIndex]||0)),Math.max(0,latePlan.span-preGrowth)),holdKeep=1-holdTerms.yieldRate*Math.max(0,duration-Math.max(holdTerms.reinvestSpan,latePlan.span)),holdCap=holdKeep>1e-12?Math.max(0,latePlan.from.balance)*Math.max(0,1-holdTerms.yieldRate*holdTerms.paidSpan)/holdKeep:0,holdNow=Math.min(latePlan.allowed/holdToDate,holdCap);if(holdNow>0){lateHold={from:latePlan.from,to:latePlan.to,span:latePlan.span,now:holdNow,back:Object.create(null)};lateHold.back[latePlan.from.id]=holdNow}}
        /* R2-T07 decision clock (ROADMAP_EXTERNAL_REVIEW.md section 1;
           supersedes T09/RISK-001's earlier "documented timing" closure):
           balance-sensitive spending decisions use START-OF-PERIOD KNOWN
           STATE ONLY -- no lookahead. portfolioBeforeGrowth is the total
           after every DECIDED cash movement of this period (contributions,
           employer match, transfers, Roth conversions) but before
           growAccounts() applies any share of this period's realized
           market return. It is therefore exactly what the household could
           know at the moment it sets this period's spending.

           This latch is leak site 2/3 and by far the worst of the three:
           retireBalance is captured ONCE and then reused as the fixedReal /
           guardrails / guyton anchor for every remaining period, so reading
           it post-growth let a single period's unseen return contaminate
           the entire rest of the horizon. */
        if(retireBalance===null&&retiredDuration>0)retireBalance=portfolioBeforeGrowth;/* S5AA R35 (SA32F-36): the inflation factor of the first retired row, which holds fixed-nominal spending from then on */if(retireInflationFactor===null&&retiredDuration>0)retireInflationFactor=inflationFactor;
        var pension=retiredDuration>0?p.retirement.pension*Math.pow(1+p.retirement.pensionCola/100,Math.max(0,age-p.profile.retireAge))*retiredDuration:0,other=otherIncomeFor(p,age,rowAge,inflationFactor,startHistory),health=0;/* S5AA R9 ROUND, the owner's decision 6 (2026-09-21): EACH LIVING PERSON IS PRICED ON THEIR OWN AGE. This branched on the SELF's age
   alone (finding N2 of the R6 round): a self under 65 put a Medicare-age spouse on the pre-Medicare cost, a self over 65 left a
   younger spouse's coverage uncosted, and a dead self under 65 left a Medicare-age survivor on the pre-Medicare cost. Who is
   alive, and how old, is householdSeniorAges() -- the answer the Medicare count below already reads (-1 = not alive, or no spouse). The
   entered pre-Medicare cost is the household's, for the people the plan models, so each living person under 65 carries an equal
   share; each living person 65 or older is charged Medicare. A household of one, and a couple on one side of 65, are unchanged. */if(p.advanced.healthOn&&retiredDuration>0){var healthAges=householdSeniorAges(p,age),healthModelled=p.profile&&p.profile.spouseOn?2:1,preMedicarePeople=healthAges.filter(function(a){return a>=0&&a<65}).length;if(preMedicarePeople>0)health=p.advanced.healthCost*Math.pow(1+p.advanced.healthInflation/100,yearProgress)*retiredDuration*preMedicarePeople/healthModelled;/* S5AA R33 (SA32F-09): the lookback year's MAGI is priced on that year's OWN filing status, as 20 CFR 418.1115 pairs them ("your modified
   adjusted gross income amount together with your tax filing status"); the survivor's current single status priced a joint return's
   MAGI on the single ranges for two years after a death. */var lookback=magiHistory.length>=RULES.medicare.irmaa.lookbackYears?magiHistory[magiHistory.length-RULES.medicare.irmaa.lookbackYears]:0,lookbackFiling=filingHistory.length>=RULES.medicare.irmaa.lookbackYears?filingHistory[filingHistory.length-RULES.medicare.irmaa.lookbackYears]:householdFilingFor(p,age),people=healthAges.filter(function(a){return a>=65}).length;/* R6 EXTERNAL AUDIT, EA-02: WHO IS ALIVE, not how the household was configured. This read `1 + (spouseOn && spouseAge >= 65)`, so a spouse who had died went on being charged Medicare -- MEASURED at 5c985c0, $5,435.60 a year after the death against $2,717.80 for one person -- while the threshold beside it already asked householdFilingFor(). householdSeniorAges() is the tax layer's own answer to whose age-65 amounts a row counts, so the two layers cannot disagree: alive at the row's opening (the year of death still counts the decedent), and a household of one returned as entered. *//* Q88 (F-02), as corrected at S5AA R33 (SA32F-09): a survivor's IRMAA reads the filing status of the return it looks back to, recorded
               with that year's MAGI (filingHistory) -- joint for the two years after a death, single from then on. */if(people>0)health+=(irmaaMonthly(lookback,lookbackFiling)*12*people+RULES.medicare.partB.annualDeductible*people)*retiredDuration}
/* Q91 (F5): computed HERE, after `other`, because the earnings test needs each person's EARNINGS --
           wages and net self-employment income -- and the employment-type other-income streams task 3.4
           made owner-aware are part of them. Reading the benefit before those streams exist would have
           tested half the earnings and withheld too little. */
        var ssDetail=householdSocialSecurityDetail(p,age,rowAge,spouseAge,startHistory,
              /* S5AA R34 (SA32F-06): self-employment counts as NET EARNINGS from self-employment (20 CFR 404.429; SS Act 211(a)(12): profit
                 less the 7.65% deduction, profit x 0.9235); gross profit was tested. The stream parts are passed too, for the grace year. */
              {self:salary*selfWorkDuration+(other.wageSelf||0)+(other.seSelf||0)*0.9235,
               spouse:spouseSalary*spouseWorkDuration+(other.wageSpouse||0)+(other.seSpouse||0)*0.9235,
               streamSelf:(other.wageSelf||0)+(other.seSelf||0),streamSpouse:(other.wageSpouse||0)+(other.seSpouse||0)},
              ssCreditedMonths),
            ss=ssDetail.total;
        var dividendCash=0,dividendReinvested=0,dividendDuration=Math.max(0,rowAge-Math.max(age,p.profile.retireAge,p.retirement.dividendStart));/* S5AA R9 ROUND, the owner's decision Q4, the dividends-ON half (known item 5.2): THE ENTERED YIELD IS TAXED IN EVERY
             YEAR. The feature decides when dividend CASH is paid out to spend; before that the dividend is reinvested inside
             the total return, and a reinvested dividend is taxable when paid (IRC 61(a)(7)). Only the paid cash was taxed, so
             turning the feature ON removed all dividend tax before retirement -- less than the imputed 1.5% charged with it
             OFF. The part of the row before the payout starts is now dividendReinvested: taxed, never moved. The yield
             grows from the start age, as before, so before it the entered yield applies unchanged. */if(p.retirement.dividendOn){var yieldRate=p.retirement.dividendYield/100*Math.pow(1+p.retirement.dividendGrowth/100,Math.max(0,age-p.retirement.dividendStart));/* RA-03: base AND draw both come from the same eligible set. */var dividendEligible=dividendEligibleAccounts(accounts),reinvestSpan=Math.max(0,duration-dividendDuration),/* S5AA R29 (PCF-03, the owner 2026-09-28: "Repair"): keyed by account id, so no prototype -- a plain object took an id of "__proto__" as its prototype, the own-key reads below missed it, and that account was paid a whole row on dollars it held for part of one ($30,000 where $15,000 is right). The engine's other id-keyed maps already had none (R14). */heldReinvest=Object.create(null),heldPaid=Object.create(null);/* S5AA R28.1 (R27F-02, the owner 2026-09-26: "Repair"): DIVIDENDS ON A TRANSFER'S DOLLARS BELONG TO WHICHEVER ACCOUNT HELD THEM.
   The base below is each eligible account's balance for the whole row, and a mid-year transfer is already in the balances,
   so a taxable destination was paid a year of dividends on dollars it held for part of one and a taxable source none for
   the part it held them ($300,000 moved at 60.5 from a Roth IRA into taxable, a 10% yield: $30,000 of dividends and AGI
   where $15,000 is right; reproduced at 73e24c7 and 56c8847). The moved dollars now count for the source before the date
   and the destination after it, each only if it is eligible: the part of the row before the date falls first in the
   reinvested span, then in the paid span. They are valued as the balances are here, after the growth before the draw.
   The share of the side that does not hold the dollars when the base is figured -- the source, for a transfer before the
   draw -- is paid by that side and never by the other (S5AA R30: the source keeps what it needs), and a reinvested share's
   basis goes with the dollars to a taxable destination. A transfer after the draw holds its source's dollars here
   (lateHold) and pays its destination after it runs (S5AA R30). */var earnerHeldReinvested=0,earnerHeldPaid=0,heldEarner=null;if(transferHeld){var heldR=Math.min(reinvestSpan,transferHeld.span),heldP=Math.max(0,transferHeld.span-reinvestSpan),heldValue=function(ac,amount){var i=accounts.indexOf(ac);return i<0?0:amount*Math.pow(Math.max(.001,1+(rates[i]||0)),preGrowth)};heldEarner=transferHeld.from;if(dividendEligible.indexOf(transferHeld.to)>=0){var holderValue=heldValue(transferHeld.to,transferHeld.toAmount);heldReinvest[transferHeld.to.id]=-holderValue*heldR;heldPaid[transferHeld.to.id]=-holderValue*heldP}if(dividendEligible.indexOf(heldEarner)>=0){var earnerValue=heldValue(heldEarner,transferHeld.fromAmount);earnerHeldReinvested=earnerValue*heldR*yieldRate;earnerHeldPaid=earnerValue*heldP*yieldRate}}if(lateHold&&dividendEligible.indexOf(lateHold.from)>=0){heldReinvest[lateHold.from.id]=-lateHold.now*Math.max(0,reinvestSpan-lateHold.span);heldPaid[lateHold.from.id]=-lateHold.now*Math.max(0,duration-Math.max(reinvestSpan,lateHold.span))}var reinvestedOf=function(ac){return Object.prototype.hasOwnProperty.call(heldReinvest,ac.id)?Math.max(0,Math.max(0,ac.balance)*reinvestSpan+heldReinvest[ac.id])*yieldRate:ac.balance*yieldRate*reinvestSpan};dividendReinvested=transferHeld||lateHold?sum(dividendEligible,reinvestedOf)+earnerHeldReinvested:sum(dividendEligible,function(ac){return ac.balance})*yieldRate*reinvestSpan;/* R18 (workstream B): taxed and kept in the account, so it is basis. */dividendEligible.forEach(function(ac){addTaxableBasis(ac,reinvestedOf(ac))});if(earnerHeldReinvested>0&&transferHeld.to.taxClass==="taxable")addTaxableBasis(transferHeld.to,earnerHeldReinvested);if(dividendDuration>0)/* S5AA R18 round (workstream B): EACH ACCOUNT PAYS ITS OWN DIVIDEND. This took the household total from the accounts in list order, so the first account paid everyone's: a $10,000 account beside a $1,000,000 one paid $10,000 of their $40,400 and was emptied. Under a percentage basis nothing showed it; under dollar basis the emptied account was left holding $20,000 of basis on a zero balance -- a loss that could never be realised. Now each pays balance x yield, which is at most its balance. */{dividendCash=payOwnDividends(dividendEligible,yieldRate,dividendDuration,heldPaid);/* S5AA R30: the source pays its own dividends before the date -- the mirror cap above left it what they need -- and never the destination. */if(earnerHeldPaid>0){var paidByEarner=Math.min(Math.max(0,heldEarner.balance),earnerHeldPaid);heldEarner.balance-=paidByEarner;dividendCash+=paidByEarner}}}
        var ltcDuration=ltcStart===null?0:Math.max(0,Math.min(rowAge,ltcStart+p.advanced.ltcYears)-Math.max(age,ltcStart)),ltc=Math.max(0,p.advanced.ltcCost-p.advanced.ltcInsurance)*ltcDuration*ltcWeight,debtFlow=projectDebts(debts,age,rowAge,retiredDuration),effectiveRetireAge=Math.max(age,p.profile.retireAge),spendState={},annualSpend=retiredDuration>0?strategySpending(p,effectiveRetireAge,portfolioBeforeGrowth,retireBalance===null?portfolioBeforeGrowth:retireBalance,priorSpend,priorReturn,inflationFactor,priorObservedInflation,priorObservedInflationFactor,spendState,noSurvivorFrom===null?p.profile.endAge:noSurvivorFrom,rowAge,retireInflationFactor):0,spending=annualSpend*retiredDuration,oneTime=eventAmount(p.retirement.expenses,age,rowAge),requested=spending+oneTime+health+ltc+debtFlow.retirementPayments,outside=ss+pension+other.cash+dividendCash+Math.max(0,-trueUpDue)/* R19 workstream A: a refund of last row's true-up is outside cash, like a pension (the contract, section 2) */,rmdPlan=rmdFor(accounts,age,p,openingById),rmd=rmdPlan.total*duration,/* RC-01: the REQUESTED charitable distribution. The exclusion itself is derived from what is actually distributed, below -- a QCD counts toward an RMD when the money moves, and the request alone is not a payment. *//* S5 task 10's 2026 QCD cap, owned per eligible spouse and annual since S5R-02 and S5R-03: see qcdExclusionRequest().
   It is not indexed forward, like every other limit here. */
qcdRequested=qcdOwnerRequests(p,accounts,age,spouseAge,duration),qcd=0,/* P2 (decision register, 2026-09-10): outside income ALWAYS offsets the portfolio draw. Q18 and Q26 close here.
           `incomeOffset:false` meant the household sold assets for its full spending AND received its outside income, which then had nowhere to go -- outside surplus was initialised to zero on that branch, so the money simply ceased to exist. The PORTFOLIO ledger stayed internally consistent, which is why reconciliation never objected; it is the HOUSEHOLD identity that failed. Q26 measured the consequence: the corpus reaches that branch ~25 times in 60 and the suite still passes, because the seeded sweep asserts a portfolio identity.
           Neither candidate meaning survived. The UI label read "Use outside income before portfolio withdrawals" -- a SEQUENCING instruction -- and a household wanting its portfolio stressed as if the income were absent can express that by setting the income to zero. The toggle duplicated existing capability and destroyed money doing it, so it is removed rather than given a meaning. Saved plans carrying false migrate in normalizedPlan(). */
        /* S5AA R35 (SA32F-19; R32F FLOWS-01): A WORKING SPOUSE'S PAY FUNDS RETIREMENT SPENDING. Spending starts at the primary's retirement age and a
   younger spouse works on to their own; the wages paid the wage-only tax and the rest left the model, so the portfolio paid the whole
   spending while the same dollars as an employment stream offset it. The net pay earned AFTER the retirement date -- that share of the
   row's wages, less the same share of the pay-funded contributions and of the wage-only tax (the `baseline` below, computed the same
   way) -- pays spending before the portfolio, up to the spending. Pay beyond it is spent outside the model, as pay before retirement
   always has been (a convention, stated). Work runs from the row's opening, as householdWorkDurations() counts it. */
        retiredFrom=Math.max(age,p.profile.retireAge),payAfterRetirement=retiredDuration>0&&wages>0?salary*Math.max(0,Math.min(age+selfWorkDuration,rowAge)-retiredFrom)+spouseSalary*Math.max(0,Math.min(age+spouseWorkDuration,rowAge)-retiredFrom):0,
        retiredPayCash=payAfterRetirement>1e-9?(payAfterRetirement/wages)*Math.max(0,wages-contributions-estimateTaxes(p,age,Math.max(0,wages-preTaxDeferrals),0,0,wages,0,spouseSalary*spouseWorkDuration,void 0,void 0,void 0,void 0,duration).total):0,
        retiredPaySpent=Math.min(retiredPayCash,Math.max(0,requested-outside)),
        offset=true,need=Math.max(0,requested-(offset?outside:0)-retiredPaySpent),withdrawals=0,ordinaryWithdrawal=0,gains=transferGain,rowGainsByOwner={self:transferGainByOwner.self,spouse:transferGainByOwner.spouse,joint:transferGainByOwner.joint},/* Q93: seeded with the TRANSFER penalty, not zero. The transfer is a portfolio action that happens
            earlier in the row than this withdrawal accounting, so `penalties+=` at the transfer block was
            silently wiped by this initialiser -- it compiled, ran, and changed nothing. */penalties=transferPenalty;
        /* R2-002 fix (RETIREMENT_ENGINE_ROUND2_AUDIT_CLAUDE_QUEUE_2026-09-08.md;
           CLAUDE_CODE_FIX_HANDOVER_TAX_FUNDING_AND_ROUND2_2026-09-08.md section
           5): RMD proceeds beyond the spending need used to be deposited via
           retainExcessRmdCash() immediately, before tax settlement even ran --
           leaving that cash invested while the tax cascade below sold MORE
           assets to cover a bill this cash could already have paid. Now the
           cash is only tracked here (rmdCashForTax); quoteTaxFunding() below
           consumes it first, and only the genuine leftover gets deposited
           after the real obligation is known. */
        var rmdCashForTax=0;
        /* R2R-003 round 2 (ARCH-01): the committed cash-sources-vs-uses
           invariant below needs the ACTUAL movements, so each one is tallied
           as it happens rather than re-derived afterwards. `needAtStart` is
           the portfolio cash need after the established outside-income
           offset policy, captured before the RMD and sales loop consume it. */
        var needAtStart=need,rmdGross=0,rmdUnmet=0,spendingSaleGross=0,rmdSourceAccount=null,rmdTransferCredited=0,rmdPromisedShort=0;
        /* FM-03 fix (FULL_MODEL_AUDIT_AND_CLAUDE_HANDOVER_20260910.md): the
           SURPLUS side of the income offset was being discarded.

           `need = max(0, requested - outside)` keeps the deficit and throws
           the negative side away, and only surplus RMD cash was ever tracked
           as available. Pension, SS, other income and dividend cash beyond
           requested spending had no tax-cash source and no retained
           destination -- it ceased to exist. A $60,000 pension against
           $20,000 of spending left $40,000 unaccounted for while the tax
           cascade below SOLD assets to pay a bill that cash could have
           covered.

           Same shape as the R2-002 RMD repair, so fixed the same way: track
           it here, offer it to quoteTaxFunding() before anything is sold,
           dispose of only the genuine leftover.

           It did NOT violate the L4 row invariant and could not -- that is a
           PORTFOLIO identity and this is a HOUSEHOLD defect, so the omitted
           cash never enters the equation being asserted. An independent
           household source-use oracle lives in
           tests/audit-fm03-outside-cash.test.js. */
        var outsideSurplus=offset?Math.max(0,outside-requested):0;/* RA-01: attribute the surplus to the components that produced it. The
           surplus is a residual of the TOTAL (`outside - requested`), so
           splitting it needs an allocation rule; pro-rata by each component's
           share of `outside` is the same rule used again below for tax, so
           there is one rule to audit rather than two. Recorded as Q19. */
        var outsideComponents={pension:pension,socialSecurity:ss,otherIncome:other.cash+Math.max(0,-trueUpDue)/* R19 workstream A: a tax refund is other outside cash, retained or invested under the other-income policy; SURPLUS_SOURCES and the validator's copy are unchanged */,dividends:dividendCash},
            surplusBySource=SURPLUS_SOURCES.reduce(function(o,src){o[src]=0;return o},{});/* S5 task 1.4: built from SURPLUS_SOURCES, which this line restated as a literal -- the same keys in the same order, and a closed set, so a plain object is safe here. */
        if(outsideSurplus>1e-9&&outside>1e-9)Object.keys(outsideComponents).forEach(function(k){surplusBySource[k]=outsideSurplus*(Math.max(0,outsideComponents[k])/outside)});
        /* Q3 (R9 round): the QCD is paid in every row it is requested and an owner is eligible, RMD or not. */var qp=payQcdFromOwnerIras(accounts,qcdRequested,p,priorReturn,iraBasisState);
        if(rmd>0){/* S5RR-01: the QCD first, from each eligible owner's own traditional IRAs (payQcdFromOwnerIras()); then the rest of the RMD in the household's pre-tax order, as before. RC-01 still holds: the exclusion is what was paid, never the request, so an emptied IRA excludes nothing. qcdCashPaid below is min(qcd,rmdGross), which agrees by construction. */var /* Q90: EACH OBLIGATION IS PAID FROM ITS OWN ACCOUNTS -- an owner's IRA obligation from that
             owner's IRAs, each employer plan from itself. A whole-class draw let a 401(k)'s
             distribution be satisfied from an IRA, and the reverse; that is the ACCOUNT section 18 spec
             invariant, test 8, whose todo marker leaves the exception registry in this commit.
             THE QCD IS CREDITED TO THAT OWNER'S IRA OBLIGATION ONLY, capped at it. A charitable
             distribution cannot discharge a 401(k)'s obligation or the other spouse's, which is
             MODEL_ASSUMPTIONS.md section 14 and is the largest behavioural change here.
             The pool for Q87 step 2's basis fraction is still the WHOLE account list, passed
             through as the last argument, never the obligation's own accounts. */rmdPaid=0,rmdShort=0,rmdPenaltyTotal=0,rmdBasisRecovered=0,rmdFirstSource=null;rmdPlan.obligations.forEach(function(ob){var want=ob.amount*duration,credited=ob.kind==="ira"?Math.min(want,(qp.byOwner&&qp.byOwner[ob.ownerIndex])||0):0;/* R15 round (R14-01): then a distribution to taxable earlier in the row, from one of THIS obligation's accounts, up to what is still unpaid. It is reported as distributed toward the requirement and nothing else: its dollars have already moved and been taxed as the transfer's, so it is not withdrawn, taxed, spent or counted as the row's cash again. */if(transferRmdCredit&&ob.accounts.indexOf(transferRmdCredit.account)>=0){var fromTransfer=Math.min(transferRmdCredit.amount,Math.max(0,want-credited));credited+=fromTransfer;rmdTransferCredited+=fromTransfer}var res=withdrawFromAccountList(ob.accounts.slice().sort(withdrawalComparator(p,priorReturn)),"preTax",Math.max(0,want-credited),age,p,iraBasisState,accounts);rmdPaid+=res.amount;rmdPenaltyTotal+=res.penalty;rmdBasisRecovered+=res.basisRecovered||0;rmdShort+=Math.max(0,want-credited-res.amount);/* R17 round (Q1-B, the owner 2026-09-22; external re-audit of dcd7247, R16-01): EACH OBLIGATION IS CLASSIFIED BY ITSELF. It was promised when a conversion or transfer drew on its group and left a positive reserve held out of the return -- the same test rmdProtectedAmounts() applies -- and only a promised obligation's own shortfall is a defeated promise. A group with nothing owed, or one a transfer to taxable fully paid, promised nothing. */var obGroup=rowCapacityGroups?rowCapacityGroups.find(function(g){return g.accounts.indexOf(ob.accounts[0])>=0}):null;if(obGroup&&obGroup.drawn&&obGroup.reserve>1e-9)rmdPromisedShort+=Math.max(0,want-credited-res.amount);if(!rmdFirstSource&&res.sources.length)rmdFirstSource=res.sources[0];});rmdSourceAccount=rmdFirstSource||(qp.sources.length?qp.sources[0]:null);rmdGross=qp.amount+rmdPaid;ordinaryWithdrawal+=rmdGross-rmdBasisRecovered;withdrawals+=rmdGross;penalties+=rmdPenaltyTotal;rmdUnmet=rmdShort;qcd=qp.amount;var rmdUsable=Math.max(0,rmdGross-qcd);rmdCashForTax=Math.max(0,rmdUsable-need);need=Math.max(0,need-rmdUsable)}
        else if(qp.amount>0){/* Q3 (R9 round): NO RMD IS DUE, and the QCD moves anyway. It is booked exactly as the branch above books
             it -- a distribution (rmdGross, which rmdDistributed reports and which has always included the QCD), income that
             the exclusion then removes (-qcd in both tax calls), and cash that goes to the charity, never to spending
             (rmdUsable is zero). One path, so the committed cash identity holds unchanged. */rmdGross=qp.amount;ordinaryWithdrawal+=qp.amount;withdrawals+=qp.amount;qcd=qp.amount;rmdSourceAccount=qp.sources.length?qp.sources[0]:null;}
        var order=p.retirement.withdrawalOrder==="manual"?p.retirement.manualOrder.split(","):smartWithdrawalOrder(p,age,accounts,magiHistory,priorReturn);for(var oi=0;oi<order.length&&need>0;oi++){var wr=withdrawFromClass(accounts,order[oi],need,age,p,priorReturn,iraBasisState,lateHold?lateHold.back:null);if(wr.earlyRoth)noteEarlyRothDraw(issues,wr.earlyRoth.ownerAge);withdrawals+=wr.amount;spendingSaleGross+=wr.amount;need-=wr.amount;gains+=wr.gains;addGainsByOwner(rowGainsByOwner,wr.gainsByOwner);penalties+=wr.penalty;/* Q99 (G5): the DRAW says how much ordinary income it made. This read `if(order[oi]==="preTax") ordinaryWithdrawal+=wr.amount`, which was the whole truth until an HSA draw could be includible as well. */ordinaryWithdrawal+=wr.income}
        /* R28.1: a transfer dated after the draw, now that the draw has run. The smart order ranks the classes by their shares of the balances, which the transfer has changed, so the tax funding below ranks them afresh. */if(lateTransfer){runTransfer(preGrowth);penalties+=transferPenalty;gains+=transferGain;addGainsByOwner(rowGainsByOwner,transferGainByOwner);/* S5AA R30 (found in passing with R29-01; the owner 2026-09-28: "Repair in R30"): A DESTINATION IS PAID ON WHAT ARRIVED, AFTER IT
   ARRIVED. R28.1 had the dividend base -- figured before the draw -- pay the destination for the rest of the year on the dollars
   asked, and what the destination did not yet hold was paid by the source: $50,000 of a $100,000 IRA moved into taxable at
   60.75 left the IRA $48,750, $1,250 of IRA money leaving as dividends and never taxed as a distribution (reproduced at
   aaff3f1; an HSA or a Roth IRA the same). Now the destination's share is figured here, on what moved, valued as the
   destination holds it, and paid from it. It arrives after the year's draw, so its cash is surplus, as outside income left
   over after spending is: it helps fund the year's tax and is kept or spent under the dividends policy. */if(p.retirement.dividendOn&&transferDated&&transferMoved>0&&dividendEligible.indexOf(transferDated.to)>=0){var lateDest=transferDated.to,lateDestNow=transferMoved/Math.pow(Math.max(.001,1+(rates[accounts.indexOf(lateDest)]||0)),Math.max(0,transferDated.span-preGrowth)),lateDestReinvested=lateDestNow*Math.max(0,reinvestSpan-transferDated.span)*yieldRate,lateDestPaid=Math.min(Math.max(0,lateDest.balance),lateDestNow*Math.max(0,duration-Math.max(reinvestSpan,transferDated.span))*yieldRate);dividendReinvested+=lateDestReinvested;addTaxableBasis(lateDest,lateDestReinvested);lateDest.balance-=lateDestPaid;dividendCash+=lateDestPaid;outside+=lateDestPaid;outsideSurplus+=lateDestPaid;surplusBySource.dividends=(surplusBySource.dividends||0)+lateDestPaid}if(p.retirement.withdrawalOrder!=="manual")order=smartWithdrawalOrder(p,age,accounts,magiHistory,priorReturn)}
        var spouseWages=spouseSalary*spouseWorkDuration,qualifiedDividends=p.retirement.dividendOn?(dividendCash+dividendReinvested)*clamp(p.retirement.dividendQualified,0,100)/100/* 5.2 (R9 round): the paid cash AND the reinvested part. The qualified
           share is a percentage OF the dividend cash, so it is held to 0-100. Unbounded, a share above 100 made
           ordinaryDividends below negative and subtracted it from ordinary income, understating tax, and a share
           below 0 overstated it. The validator warns on import; runPlan() discloses that the share was held. *//* Q105 (G13): THE ABSENCE OF `dividendStart` HERE IS DELIBERATE and was decided rather than overlooked
             (the owner, decision 12.9 (b)). `dividendStart` means WHEN MODELLED DIVIDEND CASH STARTS BEING PAID OUT
             TO SPEND; it is a question about the cash branch above. This 1.5% is a stated assumption that a
             diversified taxable portfolio has been producing dividend income ALL ALONG, so it applies from
             the start of the projection and a future start age does not suppress it. An external audit read
             the asymmetry as a defect; it is the model. Said on the Rules page under Dividends, and pinned
             in tests/audit-s5aa-dividend-start-definition.test.js -- including the pin that no value of
             dividendStart moves a dividends-off projection at all. */:imputeRetainedYield(dividendEligibleAccounts(accounts),.015*duration,transferDated?{from:transferDated.from,to:transferDated.to,yield:transferDated.amount*.015*transferDated.span}:null)/* FM-03: a retained CASH holding is pinned to a zero return, so charging it the 1.5% imputed dividend would tax income the household never received. RA-03: this branch and the dividendOn branch above now share dividendEligibleAccounts() rather than each restating the rule, which is how they came to disagree. */,ordinaryDividends=p.retirement.dividendOn?dividendCash+dividendReinvested-qualifiedDividends:0,ordinaryIncomeBeforeIra=Math.max(0,wages-preTaxDeferrals)+pension+other.ordinary-/* S5AA R33 (SA32F-11): the part of the deferrals salary wages cannot absorb is excluded from the employment-stream and self-employment pay that counts as the owner's compensation (ownerCompensation()); it was dropped. */Math.min(Math.max(0,preTaxDeferrals-wages),(other.wageSelf||0)+(other.wageSpouse||0)+(other.seSelf||0)+(other.seSpouse||0))+ordinaryDividends+ordinaryWithdrawal+conversionTaxable+transferTaxable-qcd-transferHsaDeduction/* Q96 (F10): an ELECTED Roth employer match is includible in gross income for the taxable year in which it is
             allocated (Notice 2024-2 section L answer 2). It is added HERE, to ordinary income, and NOT to `wages` -- because section L answer 6
             excludes it from the FICA wage base under 3121(a)(5)(A) and (D) and expressly declines to add it back
             under 3121(v)(1)(A). A pre-tax match, which is the default, adds nothing anywhere. */+matchRothIncome,/* Q104 (G11): the payroll wage base, after the HSA salary reduction and per owner. The reduction is
             CAPPED AT THAT OWNER'S OWN WAGES -- a salary reduction cannot exceed the salary, and the base can
             never go negative. A direct personal HSA contribution would be an above-the-line deduction with no
             wage effect at all, but the engine has no way to express one (there is no cafeteria-plan flag), so
             the exclusion is applied to the route it DOES model, and that limit is disclosed rather than
             invented around. */hsaSelfApplied=Math.min(hsaWageSelf,Math.max(0,wages-spouseWages+(other.wageSelf||0))),hsaSpouseApplied=Math.min(hsaWageSpouse,Math.max(0,spouseWages+(other.wageSpouse||0))),payrollWages=Math.max(0,wages+(other.wageSelf||0)+(other.wageSpouse||0)-hsaSelfApplied-hsaSpouseApplied),payrollSpouseWages=Math.max(0,spouseWages+(other.wageSpouse||0)-hsaSpouseApplied),/* Q87 (F1, with G15): the traditional IRA deduction. The measure is AGI computed WITHOUT the IRA
             deduction itself (IRC 219(g)(3)(A)), so there is no circularity -- but it does need the rest of the
             return, so it comes from a preliminary estimateTaxes() on the pre-deduction income. That call is
             made ONLY when a deductible IRA contribution exists, which is why it does not cost every row a
             fourth tax computation.
             DISCLOSED: the MAGI is the PRE-COMMIT figure, so the deduction is fixed before the tax-funding
             withdrawal is solved and is held constant through the settlement. Letting it move with the
             withdrawal would introduce a second fixed point inside the one the solver already walks.
             Each owner is measured separately, because whose coverage matters depends on the filing status:
             on a joint return an UNCOVERED contributor married to a COVERED spouse has their own, much higher
             range (IRC 219(g)(7)(A)). G15: rothPhaseoutFactor() is NOT fed this -- Publication 590-A
             Worksheet 1-2 ADDS the traditional IRA deduction back for Roth purposes. *//* Q87 step 2: the deduction is computed PER OWNER now, not as one total. Form 8606 is filed separately by each spouse and basis NEVER combines, so the nondeductible remainder has to be attributable to the person who made it. The SUM is unchanged, which is why no household without nondeductible money moves a cent. */iraDeductionSplit=(iraPreTaxSelf+iraPreTaxSpouse)>0.005?(function(){var preIra=estimateTaxes(p,age,ordinaryIncomeBeforeIra,gains,ss+other.ss,payrollWages,qualifiedDividends,payrollSpouseWages,other.seSelf,other.seSpouse,ordinaryDividends+(other.nii||0),capitalLossCarry,duration),/* Q88 (F-02): the IRA deduction phaseout range is a filing-status table, so it moves with the
   status the row is actually taxed under. */magi=preIra.measures.federal_agi,f=householdFilingFor(p,age),sp=!!p.profile.spouseOn;/* R33 (SA32F-10): each owner's own IRA limit for the row, with the catch-up read at the row's close (R32). */return {self:iraDeductibleAmount(iraPreTaxSelf,magi,f,coveredSelf,sp&&coveredSpouse,contributionLimit("ira",age+duration,p.profile.filing)),spouse:iraDeductibleAmount(iraPreTaxSpouse,magi,f,coveredSpouse,coveredSelf,contributionLimit("ira",spouseAge+duration,p.profile.filing))}})():{self:0,spouse:0},iraDeduction=iraDeductionSplit.self+iraDeductionSplit.spouse,/* S5AA R26 (the owner 2026-09-26: one rule for the quote and the commit). This was
             max(0, ordinaryIncomeBeforeIra - iraDeduction), while the committed tax (ordinaryAtCommit, below) subtracts the
             deduction with no floor: a deduction beyond ordinary income was lost in the quote and kept at commit, and the row
             ended in TAX_SETTLEMENT_MISMATCH (R25 SA25-10). The unfloored figure is the law's: AGI is gross income -- dividends
             and gains included -- minus the section 219 deduction (IRC 62(a)(7)), and the preferential rates reach only
             taxable income (IRC 1(h)(1)); estimateTaxes() applies a negative ordinary figure to the gains taxed. */ordinaryIncome=ordinaryIncomeBeforeIra-iraDeduction,taxes=estimateTaxes(p,age,ordinaryIncome,gains,ss+other.ss,/* Q98 (G4): the payroll base is the household total INCLUDING employment streams; the spouse slot
                carries the spouse's share, because estimateTaxes() derives the self's wages as
                (wages - spouseWages) and caps each person's OASDI separately. */payrollWages,qualifiedDividends,payrollSpouseWages,other.seSelf,other.seSpouse,ordinaryDividends+(other.nii||0),capitalLossCarry,duration),baseline=estimateTaxes(p,age,Math.max(0,wages-preTaxDeferrals),0,0,wages,0,spouseWages,void 0,void 0,void 0,void 0,duration),penaltyApplies=age<59.5&&!p.advanced.penaltyException&&!(p.advanced.rule55&&age>=55);
        /* R2-001 fix: quoteTaxFunding() (src/engine.js, added for R2-T01)
           replaces the old one-shot assumed-rate gross-up -- which sold
           taxNeed/(1-grossRate) using a SINGLE rate guessed from the state
           BEFORE the sale, then reduced taxNeed by that same guess instead
           of the tax the sale actually created (see R2-001 in the round 2
           audit for the exact $157.50/$57.142857 shortfalls this caused) --
           with an exact finite solve against estimateTaxes() itself, and
           consumes rmdCashForTax (R2-002 above) before selling anything
           new. It never mutates `accounts`; the loop below commits the
           quoted amounts through the SAME withdrawFromClass() the rest of
           this function already uses, in the SAME account order
           (orderedAccountsInClass mirrors withdrawFromClass()'s own
           filter+sort), then independently re-verifies the committed
           result against a fresh estimateTaxes() call -- a quote that
           cannot be reproduced by the real commit is a calculation error,
           never a silent success or an overstated shortfall (section 4.5
           of the tax-funding handover). */
        var taxCtx={ordinaryIncome:ordinaryIncome-taxes.seDeductibleHalf,capitalGains:gains,capitalLossCarryIn:capitalLossCarry,qualifiedDividends:qualifiedDividends,niiOther:ordinaryDividends+(other.nii||0),ssBenefit:ss+other.ss,/* Q88 (F-02): the mirror is handed the SAME status and the same age list estimateTaxes() derives, so
             the two cannot disagree about who is alive -- ground rule 4's mirrored pair. `rowAge` is
             carried explicitly because seniorAges[0] is no longer always this row's age: it is -1 once
             the self has died, and verifyQuoteObligation() has to recover the age to re-derive the
             same status from it. */filing:householdFilingFor(p,age),seniorAges:ageAmountAges(p,age,householdFilingFor(p,age),duration).seniorAges,seniorDeductionAges:ageAmountAges(p,age,householdFilingFor(p,age),duration).seniorDeductionAges,additionalFiling:ageAmountAges(p,age,householdFilingFor(p,age),duration).additionalFiling,rowAge:age,rowSpan:duration,Tbase:baseline.total,payrollConst:taxes.payroll,/* R19 workstream A (T1): last row's true-up OWED is paid in this row, a constant in the obligation beside the penalties, so the quote, verifyQuoteObligation() and the post-commit check all fund and verify the same amount. A refund is outside cash instead (above). */penalties:penalties+Math.max(0,trueUpDue),penaltyApplies:penaltyApplies};
        var availableCash=rmdCashForTax+outsideSurplus;surplusBySource.rmd=rmdCashForTax;/* FM-03: outside surplus is spendable cash, exactly like surplus RMD proceeds */
          var quote=quoteTaxFunding(taxCtx,order,accounts,p,priorReturn,availableCash,iraBasisState);
        var taxNeed=0,retainedRmdCash=0,calcErrorCode=null;
        if(quote.status==="error"){
          calcErrorCode="TAX_QUOTE_"+quote.code;
        } else {
          var byClass={};quote.transactions.forEach(function(t){byClass[t.taxClass]=(byClass[t.taxClass]||0)+t.gross});
          var committedGains=0,committedPenalty=0,committedOrdinary=0,totalGross=0;
          Object.keys(byClass).forEach(function(cls){var w=withdrawFromClass(accounts,cls,byClass[cls],age,p,priorReturn,iraBasisState);if(w.earlyRoth)noteEarlyRothDraw(issues,w.earlyRoth.ownerAge);withdrawals+=w.amount;totalGross+=w.amount;committedGains+=w.gains;addGainsByOwner(rowGainsByOwner,w.gainsByOwner);committedPenalty+=w.penalty;/* Q99 (G5): the SECOND site that re-derived ordinary income from the class NAME. It read `if(cls==="preTax") committedOrdinary+=w.amount`, so a tax-funding draw from an HSA recognised nothing here while the quote above had already priced it as income -- and the settlement check rejected the row. The draw reports what it made; nobody re-derives it. */committedOrdinary+=w.income;if(Math.abs(w.amount-byClass[cls])>.01)calcErrorCode="TAX_COMMIT_SHORTFALL"});
          gains+=committedGains;penalties+=committedPenalty;ordinaryWithdrawal+=committedOrdinary;
          var ordinaryAtCommit=quote.transactions.length>0?(Math.max(0,wages-preTaxDeferrals)+pension+other.ordinary-/* S5AA R33 (SA32F-11): the part of the deferrals salary wages cannot absorb is excluded from the employment-stream and self-employment pay that counts as the owner's compensation (ownerCompensation()); it was dropped. */Math.min(Math.max(0,preTaxDeferrals-wages),(other.wageSelf||0)+(other.wageSpouse||0)+(other.seSelf||0)+(other.seSpouse||0))+ordinaryDividends+ordinaryWithdrawal+conversionTaxable+transferTaxable-qcd-transferHsaDeduction/* Q96: the elected Roth match, on the same footing as the quote above. */+matchRothIncome/* Q87: the IRA deduction is held at the value figured before the commit, for the reason given above. */-iraDeduction):ordinaryIncome;rowTaxesCommitted=true;if(quote.transactions.length>0)taxes=estimateTaxes(p,age,ordinaryAtCommit,gains,ss+other.ss,payrollWages,qualifiedDividends,payrollSpouseWages,other.seSelf,other.seSpouse,ordinaryDividends+(other.nii||0),capitalLossCarry,duration);/* R19 workstream A: the carry is allocated after the year is settled, below, from the SETTLED return. */
          /* Q89 (F3, with G17): the THIRD independent recomputation of the obligation, and it needs the new
             base like the other two. The engine recomputes deliberately in three places -- the solver's
             mirror, verifyQuoteObligation() before ever reporting "funded", and here after the commit -- so
             that a divergence is rejected rather than silently accepted. That is exactly what caught this:
             an incomplete first version of this repair failed at verifyQuoteObligation() and then here, each
             failure naming the next site it had missed. */
          var actualObligation=Math.max(0,taxes.total-baseline.total)+penalties+Math.max(0,trueUpDue),actualFunded=availableCash+totalGross,surplus=actualFunded-actualObligation;
          /* A positive surplus is the NORMAL, expected outcome whenever RMD
             cash alone already covers the obligation without needing a
             sale (quoteTaxFunding()'s own send0>=L(0) shortcut) -- that
             surplus IS the cash this task retains. Only a NEGATIVE surplus
             (the commit raised less than the quote promised) is the
             quotation/commit mismatch section 4.5 calls an engine error. */
          /* Symmetric on purpose. A surplus with NO sale is just unspent RMD
             cash and is the whole point of R2-002. But once anything was
             sold, quoteTaxFunding solved it to fund EXACTLY, so a surplus
             there means the commit diverged from the quote -- and checking
             only the under-funding side would silently absorb exactly the
             over-pricing class of bug (see the audit note above
             quoteTaxFunding's own verification). */
          /* R2V-003 external audit fix: this must not overwrite a
             calcErrorCode the byClass commit loop above already set --
             TAX_COMMIT_SHORTFALL is the more specific diagnosis (a
             specific class failed to raise what it promised), and a commit
             shortfall will almost always also fail this surplus check, so
             an unconditional assignment here silently discarded the
             original, more actionable error code and context. */
          if(quote.status==="funded"){if(surplus<-.01||(totalGross>1e-9&&surplus>.01)){if(!calcErrorCode)calcErrorCode="TAX_SETTLEMENT_MISMATCH"}else retainedRmdCash=Math.max(0,surplus)}
          else taxNeed=Math.max(0,-surplus);
          /* R2R-003 external requalification fix (ARCH-01): the standing
             cash-sources-vs-uses check, gated on !calcErrorCode so it never
             overwrites a more specific already-set code (the same
             first-code-wins principle as the TAX_SETTLEMENT_MISMATCH guard
             just above) -- a settlement already flagged invalid by the
             checks above will very likely also fail this one, and that's
             expected, not a second independent finding. */
          if(!calcErrorCode){
            var settlement=verifyCashSettlement(availableCash,totalGross,taxNeed,actualObligation,retainedRmdCash);
            if(!settlement.consistent)calcErrorCode="CASH_SETTLEMENT_MISMATCH";
          }
        }
        /* R2R-003 round 2 (ARCH-01): measure the deposit that ACTUALLY
           committed, as an account-balance delta, rather than trusting the
           intended amount. The previous check took `retainedRmdCash` (the
           intent) as proof the money landed, so a failure inside
           retainExcessRmdCash() itself would have passed. */
        /* FM-03 / decision D-1: what happens to surplus that survives the
           tax settlement is an explicit, user-selectable policy rather than
           a hardcoded destination. Any of the three is defensible; none of
           them is "it vanishes", which is what this replaces.

             retain (DEFAULT) a named cash holding, pinned to a zero return
                              by accountReturnForPeriod(). Conservative: an
                              existing plan gains no market return it did
                              not previously have.
             invest           deposited into the taxable account the engine
                              already selects, and participates in growth.
             spend            recorded as ADDITIONAL ACTUAL SPENDING. The
                              audit is explicit that surplus spending must
                              be recorded and validated, never conjured
                              silently inside a max(0, ...).

           An unrecognised value falls back to retain, so a malformed import
           cannot resurrect the vanishing behaviour. */
        /* RA-01: disposal is now per source. Each source's residual is its
           share of the cash that survived tax settlement.

           TAX ALLOCATION IS PRO-RATA. One tax bill can be funded from several
           pools, and which pool pays changes how much of each is left to
           direct. `retainRatio` -- the fraction of available cash that
           survived -- applied uniformly IS the pro-rata split, and it
           conserves exactly: the per-source residuals sum to the pooled
           residual. It is order-independent, which is the property that made
           it preferable to "RMD pays first" or "outside pays first". This is
           a choice, not a derivation; it is recorded as Q19 rather than left
           to be discovered in a comment.

           Sequencing above is untouched: outside income still covers spending
           first, RMD still covers what remains of spending, and only the
           residual reaches this block. */
        var retainRatio=availableCash>1e-9?Math.max(0,Math.min(1,retainedRmdCash/availableCash)):0,
            retainedBySource={},surplusSpent=0,outsideDepositToPortfolio=0,
            depositedFromRmd=0,retainedDeposit=0;
        SURPLUS_SOURCES.forEach(function(src){retainedBySource[src]=(surplusBySource[src]||0)*retainRatio});
        /* `spend` first, and as ADDITIONAL ACTUAL SPENDING -- the audit is
           explicit that surplus spending must be recorded and validated,
           never conjured silently inside a max(0, ...). Taxes were already
           settled above, so spending the residual does not re-open them. */
        SURPLUS_SOURCES.forEach(function(src){
          if(surplusPolicyFor(p,src)==="spend"&&retainedBySource[src]>1e-9){surplusSpent+=retainedBySource[src];retainedBySource[src]=0}
        });
        if(surplusSpent>1e-9){requested+=surplusSpent;spending+=surplusSpent}
        /* Sources that share a destination are deposited TOGETHER, once.
           Depositing per source instead would be arithmetically equivalent
           but not bitwise identical -- a taxable destination blends basis as
           a balance-weighted average, so two half deposits and one whole one
           differ in the last bits, and three otherwise-unaffected corpus
           scenarios drifted by 1 ULP purely from the split. Churn like that
           costs the baseline harness the thing it exists for: an unexplained
           movement should mean something. Grouping keeps a single deposit
           wherever the old code made one, while still honouring a per-source
           policy when the sources genuinely disagree.

           The rmd share of each group is carried through so the withdrawal
           netting below stays exact -- see the note there for why only
           portfolio-sourced cash may be netted. */
        var byDestination={};
        SURPLUS_SOURCES.forEach(function(src){
          var amount=retainedBySource[src];if(amount<=1e-9)return;
          var policy=surplusPolicyFor(p,src);
          if(policy==="spend")return;
          var group=byDestination[policy]||(byDestination[policy]={total:0,fromRmd:0});
          group.total+=amount;if(src==="rmd")group.fromRmd+=amount;
        });
        Object.keys(byDestination).forEach(function(policy){
          var group=byDestination[policy],
              balanceBeforeRetention=totalBalance(accounts),
              accountsBeforeRetention=accounts.length,
              sourceAccount=group.fromRmd>1e-9?rmdSourceAccount:null,
              retentionDest=retainExcessRmdCash(accounts,group.total,sourceAccount,policy==="retain");
          /* RA-02: register the new destination's rate from its POLICY, not
             from its provenance.

             `rates` is index-aligned to `accounts` and was built at the top
             of the period, so an account appended during settlement has no
             entry and growAccounts() skips it. R4 closed that by copying the
             RMD SOURCE account's rate -- right for the case it was written
             for, and exactly backwards for both cases FM-03 then introduced:
             a `retain` cash holding earned a 10% market return in its
             creation period (3,231.39 on the re-audit's repro), while an
             `invest` destination with no RMD source got no rate at all and
             did not grow (1,688.91). The preset named for holding cash grew;
             the preset named for investing did not.

             Three cases, each stated rather than inherited:

               retain  explicit ZERO. accountReturnForPeriod() already returns
                       0 for a cashHolding, but an account created after
                       `rates` was built never reaches that branch in its
                       first period, so the zero is written here too. Same
                       answer an equivalent pre-existing cash holding gets.

               invest, with an RMD source -- HR-02 (ROADMAP_EXTERNAL_REVIEW.md
                       section 1): "the holding inherits the exact
                       allocation/growth treatment of the account it was
                       synthesized from." That is the source's ALREADY-DRAWN
                       rate, not a freshly computed one; recomputing would
                       consume RNG draws.

               invest, with no source -- the treatment an equivalent
                       pre-existing account would receive, with the volatility
                       draw suppressed. Exact under simple/historical; under
                       Monte Carlo deliberately the expectation rather than a
                       draw, because appending a draw here shifts the stream
                       for every later period of every run. Recorded as Q19. */
          if(retentionDest&&accounts.length>accountsBeforeRetention){
            var destRateIndex=accounts.indexOf(retentionDest),
                sourceRateIndex=sourceAccount?accounts.indexOf(sourceAccount):-1;
            if(policy==="retain")rates[destRateIndex]=0;
            else if(sourceRateIndex>=0&&rates[sourceRateIndex]!==undefined)rates[destRateIndex]=rates[sourceRateIndex];
            else rates[destRateIndex]=accountReturnForPeriod(retentionDest,p,age,yearProgress,histReturn,random,portfolioBeforeGrowth,true);
          }
          var deposited=totalBalance(accounts)-balanceBeforeRetention,
              rmdShare=group.total>1e-9?group.fromRmd/group.total:0;
          retainedDeposit+=deposited;
          depositedFromRmd+=deposited*rmdShare;
          outsideDepositToPortfolio+=deposited*(1-rmdShare);
        });
        /* Only cash that CAME FROM the portfolio may be netted back out of
           withdrawals. RMD surplus was genuinely withdrawn and then partly
           returned, so netting it is correct. Outside-income surplus was
           never withdrawn from anything -- netting it too drove reported
           withdrawals negative (-33,710 on the FM-03 repro), which is worse
           than an unbalanced check because it hides the problem inside a
           plausible-looking field. Per-source tracking makes this exact
           rather than the previous max(0, retained - outsideSurplus)
           approximation. */
        withdrawals-=depositedFromRmd;
        var shortfall=Math.max(0,need+taxNeed),nonPortfolioDraw=0;/* Q44, decided 2026-09-13 (reading b, a real scope leak): the fallback spends other assets only while the plan includes them. advanced.networthOn is the app's "Include other assets and debts" switch; with it off the fallback drew real cash from an asset the plan had excluded (SIMULATION_LOG Batch 6: $700k+ of home equity while networth read $0). Read truthily like every other flag here; strict boolean handling is the S5 2l flag contract. */if(shortfall>.01&&p.retirement.homeEquityFallback&&p.advanced.networthOn){nonPortfolioDraw=drawFromOtherAssets(otherAssets,shortfall,age);shortfall=Math.max(0,shortfall-nonPortfolioDraw)}
        /* R2R-003 round 2 (ARCH-01): the required committed cash-sources-
           versus-uses invariant, run AFTER spending, tax settlement,
           retention, and fallback have all actually executed, and BEFORE
           late growth. Gated on !calcErrorCode for first-code-wins. */
        if(!calcErrorCode){
          var committed=verifyCommittedCashSettlement({
            rmdGross:rmdGross,spendingSaleGross:spendingSaleGross,taxSaleGross:totalGross,outsideSurplus:outsideSurplus,
            fallbackDraw:nonPortfolioDraw,finalShortfall:shortfall,
            portfolioCashNeed:needAtStart,qcdCashPaid:Math.min(qcd,rmdGross),surplusSpent:surplusSpent,
            taxObligation:actualObligation,retainedDeposit:retainedDeposit
          });
          if(!committed.consistent)calcErrorCode="COMMITTED_CASH_MISMATCH";
        }
        if(calcErrorCode){failed=true;if(firstCalculationErrorAge===null)firstCalculationErrorAge=rowAge;recordIssue(issues,calcErrorCode,"ERROR","Tax settlement could not be reconciled with the quoted transactions.",{age:rowAge,quoteStatus:quote.status})}
        if(shortfall>.01){failed=true;if(firstShortfallAge===null)firstShortfallAge=rowAge;shortfallStreak++;if(shortfallStreak>=2&&sustainedFailureAge===null)sustainedFailureAge=rowAge}else shortfallStreak=0
        var beforeLateGrowth=issues?totalBalance(accounts):0;growAccounts(accounts,rates,Math.max(0,duration-preGrowth));if(issues)growthTotal+=totalBalance(accounts)-beforeLateGrowth;growOtherAssets(otherAssets,duration);/* R19 WORKSTREAM A: settle each owner's year now that the IRAs hold their year-end value. An owner with no basis, no nondeductible contribution and no QCD offset to apply is not settled at all, so a household without IRA basis moves by nothing (the contract's identity 4). The settled return re-figures the whole tax on the settled income; the true-up is its difference from what this row funded, owed into the next row. The IRA deduction is held at the value figured before the commit. */if(rowTaxesCommitted){var iraSettleDelta=0,iraSettleAny=false;["self","spouse"].forEach(function(k){var fl=(iraBasisState.row&&iraBasisState.row[k])||{dist:0,conv:0,qcd:0,qhfd:0,nt:0},deducted=Math.max(0,Number(iraDeductionSplit[k])||0),nondeductible=Math.max(0,(k==="self"?iraPreTaxSelf:iraPreTaxSpouse)-deducted),ownerAgeAtYearEnd=k==="self"?rowAge:spouseAge+duration,offsetAvailable=(Number(qcdOffsetState[k])||0)+(ownerAgeAtYearEnd>=70.5?deducted:0);if(!(iraBasisAtRowStart[k]>0||nondeductible>0||(fl.qcd>0&&offsetAvailable>0))){qcdOffsetState[k]=offsetAvailable;return}var st=settleIraYear({basisStart:iraBasisAtRowStart[k],nondeductible:nondeductible,poolEnd:iraPoolFor(accounts,k),dist:fl.dist,conv:fl.conv,qcd:fl.qcd,qhfd:fl.qhfd,qhfdPool:fl.qhfdPool,qhfdFlowsBefore:fl.qhfdFlowsBefore,ntProvisional:fl.nt,offsetAvailable:offsetAvailable});iraSettleAny=true;iraSettleDelta+=st.delta;iraBasisState[k]=st.closingBasis;qcdOffsetState[k]=st.offsetCarryOut});iraSettled=true;taxesSettled=iraSettleAny&&Math.abs(iraSettleDelta)>1e-9?estimateTaxes(p,age,ordinaryAtCommit+iraSettleDelta,gains,ss+other.ss,payrollWages,qualifiedDividends,payrollSpouseWages,other.seSelf,other.seSpouse,ordinaryDividends+(other.nii||0),capitalLossCarry,duration):taxes;iraTrueUp=taxesSettled.total-taxes.total;taxTrueUpCarried=iraTrueUp;capitalLossCarryByOwner=allocateCapitalLossCarry(capitalLossCarryByOwner,rowGainsByOwner,taxesSettled.capitalLossCarryOut||0,householdSurvivorship(p,age));capitalLossCarry=capitalLossCarryByOwner.self+capitalLossCarryByOwner.spouse}inflationFactor*=Math.pow(Math.max(.01,1+annualInflation),duration);var total=totalBalance(accounts),assetValue=sum(otherAssets,function(x){return x.value}),debtBalance=sum(debts,function(x){return x.balance}),real=total/inflationFactor,insuranceValue=p.advanced.networthOn&&rowAge>=p.retirement.selfLife?p.advanced.insurance:0,networth=total+(p.advanced.networthOn?assetValue-debtBalance+insuranceValue:0)-iraTrueUp/* R19 workstream A: a true-up owed is a liability, a refund due an asset (the contract's identity 3). */,/* CL-02: A RESERVATION IS NOT A DISTRIBUTION, and the difference has to be observable.
           RC-01 reserved the required distribution by withholding it from the balance a
           conversion or transfer may consume. It left those dollars in the market. The
           period return is applied before the RMD withdrawal runs, so at -20% the reserved
           $4,065.04 became $3,252.03 by the time it was distributed -- and the row still
           reported the full obligation in `rmd`, with status "ok" and no shortfall. An
           obligation was again described as discharged because it had been CALCULATED,
           which is the same error RC-01 was raised for, one level down.

           This does not repair the TIMING contract -- see rmdUnmet below and the note in
           SPRINT_QUESTIONS.md. It makes the failure impossible to miss instead of silent,
           which is what the re-audit asked for while the timing decision is open. The two
           real repairs (discharge before conversion, or genuinely segregate the reserve)
           both change results for every RMD row, so they are a policy choice rather than a
           bug fix. Sizing the reservation from this period's return would be look-ahead
           and is explicitly not an option. */
          rmdCheck=(function(){/* SCOPED TO A DEFEATED RESERVATION, not to every underfunded distribution.
             An account that simply has less than its obligation -- a deep loss, a
             prior drawdown -- distributes what it has, and that is a correct
             projection of a real compliance problem, not a modelling failure. The
             engine has a deliberate -95% boundary fixture that does exactly this.
             What IS a modelling failure is the engine promising to reserve the
             obligation from a conversion or transfer and then failing to deliver
             it. rmdUnmet is reported on the row either way, so the shortfall stays
             visible in both cases; only the defeated promise invalidates.
             R16 round (R15-01): a transfer to taxable within its own obligation made no promise.
             R17 round, external re-audit of dcd7247 (R16-01), and the owner's decision Q1-B (2026-09-22), on the auditor's
             recommendation: THE PROMISE IS PER OBLIGATION. This was ROW-WIDE -- any shortfall in the row was refused once
             any conversion, or any transfer that drew capacity, happened anywhere in it -- so a move from an account that
             owed nothing, and protected nothing, invalidated another owner's ordinary shortfall. MEASURED at dcd7247: self
             95 (owes 11,235.96, a -95% year leaves 5,000), a spouse of 60 who owes nothing; no move, the row with
             6,235.96 unmet; a spouse transfer or conversion, calculation_error, the same 6,235.96, no rows. Now only the
             shortfall of an obligation a move actually protected (rmdPromisedShort, above) is refused. This reverses
             CL-02's row-wide witness -- a 401(k) nothing drew on, short beside an IRA conversion -- by that decision. The
             working engine keeps its promises; tests/lib/rmd-protection-fault.js shows the error still fires when the
             protection is defeated. */if(rmdPromisedShort>.01&&!calcErrorCode){calcErrorCode="RMD_NOT_DISTRIBUTED";/* The run-level state too, or the row is flagged while the RESULT still reports ordinary success -- which is the precise failure being repaired. */failed=true;if(firstCalculationErrorAge===null)firstCalculationErrorAge=rowAge;if(issues)recordIssue(issues,"RMD_NOT_DISTRIBUTED","ERROR","A required minimum distribution was calculated but not fully distributed.",{age:rowAge,due:rmd,distributed:rmdGross+rmdTransferCredited,unmet:rmdUnmet,promisedUnmet:rmdPromisedShort})}})(),/* Q43: A ZERO PAYMENT'S FORCED PAYOFF IS A CALCULATION ERROR, NOT A WITHDRAWAL.
             A debt whose paymentMonthly is exactly 0 on a positive rate negatively amortizes, and at
             payoffAge projectDebts() forces the whole grown balance out in one period. $20,000 at 20% from
             age 29.5 became a $166,164,101 payoff at 75, reported "ok" with no code when the portfolio
             could absorb it, and as ordinary insolvency when it could not.
             SCOPED TO THE CASE THE VALIDATOR'S PAYMENT_BELOW_INTEREST WARNING NAMES, by decision: an absent
             payment, a positive payment below the interest, and a payoffAge past the plan are not flagged
             here. The code is raised only when a balance is actually forced out, whether or not the payment
             counts toward spending, and it never replaces a code already set. */debtCheck=(function(){var forced=0;debtFlow.perDebt.forEach(function(x){forced+=x.zeroPaymentPayoff||0});if(forced>0&&!calcErrorCode){calcErrorCode="DEBT_ZERO_PAYMENT_FORCED_PAYOFF";failed=true;if(firstCalculationErrorAge===null)firstCalculationErrorAge=rowAge;if(issues)recordIssue(issues,"DEBT_ZERO_PAYMENT_FORCED_PAYOFF","ERROR","A debt with a monthly payment of 0 reached its payoff age, and its whole negatively amortized balance was forced out in one period.",{age:rowAge,forced:forced})}var refusedTerm=0;debtFlow.perDebt.forEach(function(x){refusedTerm=Math.max(refusedTerm,x.recastTermRefused||0)});if(refusedTerm>0&&!calcErrorCode){calcErrorCode="DEBT_RECAST_TERM_UNSUPPORTED";failed=true;if(firstCalculationErrorAge===null)firstCalculationErrorAge=rowAge;if(issues)recordIssue(issues,"DEBT_RECAST_TERM_UNSUPPORTED","ERROR","An adjustable-rate debt's recast at its reset would amortize over "+refusedTerm+" months, beyond the "+DebtAmortization.MAX_TERM_MONTHS+" months a payment can be computed for, so no projection is reported.",{age:rowAge,termMonths:refusedTerm})}})(),row={age:rowAge,total:total,realTotal:real,taxable:taxClassBalance(accounts,"taxable"),preTax:taxClassBalance(accounts,"preTax"),roth:taxClassBalance(accounts,"roth"),hsa:taxClassBalance(accounts,"hsa"),contributions:contributions+employer,income:outside-Math.max(0,-trueUpDue)+wages,spending:requested,withdrawals:withdrawals,dividends:dividendCash,taxes:taxes.total+penalties+trueUpDue,/* R19 workstream A (T1): taxes is the cash paid -- this row's provisional tax plus last row's true-up; taxSettled is the tax on this year's settled income; taxOutstanding is the true-up owed into the next row (negative: a refund due). */taxSettled:(taxesSettled||taxes).total+penalties,taxTrueUpPaid:trueUpDue,taxOutstanding:iraTrueUp,rmd:rmd,rmdDistributed:rmdGross+rmdTransferCredited,rmdUnmet:rmdUnmet,shortfall:shortfall,/* P9 / Q35: debtPayments stays RETIREMENT-period only, unchanged, because consumers read it that way. The whole-period figures are new fields beside it, so nothing existing moves. */debtPayments:debtFlow.retirementPayments,debtPaymentsTotal:debtFlow.totalPayments,debtInterest:debtFlow.totalInterest,debtPrincipal:debtFlow.totalPrincipal,debtHousing:debtFlow.totalHousing,otherAssets:assetValue,debtBalance:debtBalance,nonPortfolioDraw:nonPortfolioDraw,inflationFactor:inflationFactor,networth:networth,/* Q2 (A), result-contract version 3: the named income measures of this row's own return (estimateTaxes()'s measures, TAX
   section 2.3), camel-cased like every row field. magi stays, the IRMAA measure it always reported; irmaaMagi equals it. */magi:(taxesSettled||taxes).magi,federalAgi:(taxesSettled||taxes).measures.federal_agi,ssProvisionalIncome:(taxesSettled||taxes).measures.ss_provisional_income,seniorDeductionMagi:(taxesSettled||taxes).measures.senior_deduction_magi,niitMagi:(taxesSettled||taxes).measures.niit_magi,irmaaMagi:(taxesSettled||taxes).measures.irmaa_magi,calculationError:!!calcErrorCode,calculationErrorCode:calcErrorCode||null};
        /* R2V-002/R2V-003 external audit fix: checkRowInvariants() below
           only ever runs `if(issues)`, so a Monte Carlo path other than path
           0 (which runs with issues===null, see runPlan()) could carry a
           NaN/Infinity value -- e.g. from a NaN basisPct that slipped past
           validateAccount() -- clear through to a published result without
           ever being routed through the calculation-error contract, making
           "diagnostics disabled" silently mean "validity checking disabled"
           too. This duplicates checkRowInvariants()'s own field scan
           (cheap: one row, ~20 keys) but only for the calc-error bookkeeping,
           unconditionally; checkRowInvariants() below remains the sole
           place that logs the NON_FINITE_ROW_VALUE issue itself, so a clean
           run's diagnostics are unchanged and issues are never double-logged. */
        if(Object.keys(row).some(function(k){return typeof row[k]==="number"&&!Number.isFinite(row[k])})){row.calculationError=true;if(!row.calculationErrorCode)row.calculationErrorCode="NON_FINITE_ROW_VALUE";failed=true;if(firstCalculationErrorAge===null)firstCalculationErrorAge=rowAge}
        rows.push(row);if(issues)checkRowInvariants(issues,row,{opening:rowOpening,contributions:contributions,employer:employer,growth:growthTotal,outsideDeposit:outsideDepositToPortfolio,dividends:dividendCash,withdrawals:withdrawals,accounts:accounts});lifetimeTaxes+=row.taxSettled;/* R19 workstream A (Q-A5): lifetime tax is every year's SETTLED tax, the final row's outstanding true-up included -- assessed tax, not cash paid. */magiHistory.push((taxesSettled||taxes).measures.irmaa_magi);filingHistory.push(householdFilingFor(p,age));/* RC-02: carry the pre-adjustment base, not the spendable amount. *//* Q91 (F5): the months this row withheld are added AFTER it is complete, so a row cannot credit
             itself with months it is in the middle of earning. */ssCreditedMonths.self+=ssDetail.creditMonths.self;ssCreditedMonths.spouse+=ssDetail.creditMonths.spouse;/* Q87 step 2: basis IN, once the row is complete. Each owner gains the part of their OWN contribution that step 1 could not deduct. Basis OUT no longer happens here (the fourth internal audit found this comment still describing it). It said recoveries were removed "in the proportion each owner's basis stood in" and that this kept the two pools from crossing; that split was the crossing, and EA-04 deleted it. Each transaction now spends its own owner's recovery through spendIraBasis(). */(function(){/* R19 workstream A: a settled row's closing basis already holds this year's nondeductible contributions. */if(!iraSettled){iraBasisState.self+=Math.max(0,iraPreTaxSelf-iraDeductionSplit.self);iraBasisState.spouse+=Math.max(0,iraPreTaxSpouse-iraDeductionSplit.spouse)}delete iraBasisState.row;/* Q87 step 2: BASIS IS ONLY WHAT THIS PROJECTION ITSELF CREATED, and it is said HERE because this is where the fact becomes known -- not at the plan level, where the running basis does not exist. Form 8606 basis also arises from nontaxable rollover amounts and from nondeductible contributions made BEFORE the plan starts, and the engine has no input for an opening basis. A household that arrives with basis is UNDER-credited, which makes the modelled tax too HIGH -- the safe direction, still wrong, so it is said. Once per run, and only where nondeductible money actually accrues. */if(!iraBasisDisclosed&&issues&&(iraBasisState.self>0.005||iraBasisState.spouse>0.005)){iraBasisDisclosed=true;recordIssue(issues,"IRA_BASIS_FROM_PROJECTION_ONLY","WARNING","Part of a traditional IRA contribution in this plan was not deductible, so it becomes basis and is not "+"taxed again when it is distributed. Only basis this projection itself created is counted: nondeductible "+"contributions made before this plan starts, and nontaxable amounts rolled in, are not known to it. A "+"household that already holds an opening basis will see a HIGHER tax here than it would owe.",{path:"accounts",openingBasisModelled:false,approximation:true});}/* EA-04: NO SPLIT HERE ANY MORE. What each transaction recovered has already come off its own owner's basis. */})();if(retiredDuration>0)priorSpend=spendState.base===undefined?annualSpend:spendState.base;priorReturn=p.assumptions.method==="historical"?histReturn:p.assumptions.method==="monteCarlo"?periodReturnSignal:p.assumptions.returnRate/100;priorObservedInflation=annualInflation;priorObservedInflationFactor=Math.pow(Math.max(.01,1+annualInflation),duration) /* SA-04: observed. FM-07: and scaled to the period that was actually elapsed, not a flat year */
      }
      /* R19 WORKSTREAM A, THE TERMINAL ROW (the auditor's A2; the owner, 2026-09-23: a final tax the plan cannot pay counts as a
         failure). The last row's true-up has no next row to pay it. It is reported (taxOutstanding) and already comes off
         that row's net worth. Where the portfolio left at the end cannot pay it, the unpaid part is a shortfall of that row,
         so failure keeps one meaning -- a row whose obligations could not be funded (the contract's T-SUCCESS). */
      if(rows.length>1&&taxTrueUpCarried>.005){var lastRow=rows[rows.length-1],unpaidFinalTax=Math.max(0,taxTrueUpCarried-Math.max(0,Number(lastRow.total)||0));if(unpaidFinalTax>.01){lastRow.shortfall=(Number(lastRow.shortfall)||0)+unpaidFinalTax;failed=true;if(firstShortfallAge===null)firstShortfallAge=lastRow.age;var rowBeforeLast=rows[rows.length-2];if(sustainedFailureAge===null&&rowBeforeLast&&Number(rowBeforeLast.shortfall)>.01)sustainedFailureAge=lastRow.age}}
      /* THE DEATH DISCLOSURES, FROM WHAT THE PROJECTION ACTUALLY DID (R7-02, R7-03, A4-6). Both were built in
         runPlan() before the simulation, from the configured accounts, and both could describe things that never
         happened -- the defect class S5AA keeps meeting: testing ENTERED state instead of EXECUTED state. They are
         now raised here, where the facts are known. For Monte Carlo that is the first path, which is the only one
         runPlan() hands the issue collector, as for every other in-loop disclosure.

           SPOUSAL_ROLLOVER_ASSUMED (Q4; EA-07)  every account that held value when a death handed it to the survivor,
                                                 classed by accountSuccessionClass(), with its balance then.
           PROJECTION_ENDS_AT_LAST_DEATH          decision 8 (R9 round): the horizon was cut at the first row opening
                                                 with nobody alive. It replaces the old post-death exclusion, whose
                                                 rows no longer exist, so nothing is outside the domain for this.

         Beneficiaries and post-death distribution rules are recorded unsupported by the specification (ACCOUNT
         section 18, test 9) and carried to the new engine by the owner's Q5. */
      if(issues)(function(){
        var profile=p.profile||{},r=p.retirement||{},spouseOn=!!profile.spouseOn,startAge=Number(profile.age),
            selfLife=Number(r.selfLife),spouseLife=Number(r.spouseLife),spouseStartAge=Number(profile.spouseAge),
            deathAt={self:selfLife,spouse:spouseOn&&Number.isFinite(spouseLife)&&Number.isFinite(spouseStartAge)?startAge+(spouseLife-spouseStartAge):NaN},
            passedEvents=successionEvents.filter(function(e){return e.passed.length});
        if(passedEvents.length){
          var succession=[],awaiting=[];
          passedEvents.forEach(function(e){e.passed.forEach(function(x){succession.push(x);if(x.assumed&&awaiting.indexOf(x.assumed)<0)awaiting.push(x.assumed)})});
          var rollovers=passedEvents.map(function(e){var d=deathAt[e.from];return {from:e.from,to:e.to,atSelfAge:d,fromRowOpening:e.fromRowOpening,
                beforePlanStart:Number.isFinite(d)&&d<startAge,accounts:e.passed.map(function(x){return x.account}),emptyAtTransfer:e.empty.map(function(x){return x.account})}}),
              has=function(t){return succession.some(function(x){return x.assumed===t})},
              HSA="the surviving spouse is the designated beneficiary of the HSA",
              TAX="a taxable account keeps the decedent's cost basis, with no step-up at death",
              CUSTOM="a custom account passes like an IRA of its tax class",
              JOINT="a joint account stays with the survivor with its whole cost basis; the step-up at death depends on titling and property law this plan does not record",
              JOINTCUSTOM="a joint custom account stays with the survivor, as if it were an IRA of its tax class",
              assumptionProse=
                (has(HSA)?" An HSA is treated as the survivor's own, which is right only if the survivor is its designated beneficiary "+
                  "(IRC 223(f)(8)(A)); otherwise it stops being an HSA at the death and its value is income (223(f)(8)(B)).":"")+
                (has(TAX)?" A taxable account passes with the decedent's cost basis unchanged; its basis is not stepped up at the death "+
                  "(IRC 1014), so the survivor's capital gains are overstated.":"")+
                (has(JOINT)?" A joint account stays with the survivor with its whole cost basis; how much of it is stepped up at the death "+
                  "depends on its titling and on state property law (IRC 2040(b), 1014(b)(6)), which this plan does not record.":"")+
                (has(CUSTOM)||has(JOINTCUSTOM)?" A custom account passes as if it were an IRA of its tax class, which no particular rule supports.":"")+
                (succession.some(function(x){return x.basis==="unsupported"})?" An IRA, a workplace plan or an HSA entered as joint cannot be "+
                  "jointly owned; it is read as the primary person's, which may not be what was meant.":"");
          recordIssue(issues,"SPOUSAL_ROLLOVER_ASSUMED","WARNING",
            (rollovers.some(function(x){return !x.beforePlanStart})
              ?"A spouse dies inside this plan's horizon and the other survives. The survivor is assumed to take the accounts "+
               "as their OWN from the year after the death: any required distribution from them is figured on the survivor's "+
               "age and start age, and any nondeductible IRA basis passes with them. In the year of the death itself, a distribution "+
               "the owner had not yet taken is still due on the owner's own schedule. "
              :"A spouse's lifespan ended before this plan starts and the other survives. The survivor is assumed to hold the "+
               "accounts as their OWN from the first year: any required distribution from them is figured on the survivor's age "+
               "and start age, and any nondeductible IRA basis passes with them. ")+
            "A survivor may instead keep an account as an inherited IRA -- for example to take money before 59 1/2 without the "+
            "10% additional tax, which the election does not avoid -- and that choice is not modelled."+assumptionProse,
            {path:rollovers[0].from==="spouse"?"retirement.spouseLife":"retirement.selfLife",approximation:true,
             rollovers:rollovers,succession:succession,assumptionsAwaitingDecision:awaiting,
             authority:["Treas. Reg. 1.408-8(c)","IRC 402(c)(9)","IRC 402(c)(4)(B)","Publication 590-B"],
             notModelled:["inherited-IRA treatment","the 10% exception for distributions after death","non-spouse beneficiaries"]});
        }
        if(noSurvivorFrom===null)return;
        /* Decision 8: the projection stopped at the first row opening with nobody alive; the last row is the year of the
           last death. Said once. Who died last is on the plan's own clock. */
        var lastWho=spouseOn&&Number.isFinite(deathAt.spouse)&&!(deathAt.spouse<selfLife)?"spouse":"self",
            lastRowAge=rows.length?rows[rows.length-1].age:startAge;
        recordIssue(issues,"PROJECTION_ENDS_AT_LAST_DEATH","WARNING",
          (spouseOn?"Both people this plan models have died":"The person this plan models has died")+" by the year beginning at age "+noSurvivorFrom+
          ", so the projection stops there instead of running to age "+Number(profile.endAge)+": its last year is the year of the last death, "+
          "and the balances at the end of it are what the household leaves. Beneficiaries, inherited accounts and estate taxes are not modelled.",
          {path:lastWho==="spouse"?"retirement.spouseLife":"retirement.selfLife",stoppedAtRowOpening:noSurvivorFrom,lastRowAge:lastRowAge,
           horizonEndAge:Number(profile.endAge),notModelled:["beneficiaries","inherited accounts","estate taxes"]});
      })();
      return {rows:rows,failed:failed,firstShortfallAge:firstShortfallAge,sustainedFailureAge:sustainedFailureAge,failureAge:sustainedFailureAge,calculationErrorAge:firstCalculationErrorAge,lifetimeContributions:sum(rows,function(r){return r.contributions||0}),lifetimeContributionsReal:sum(rows,function(r){return (r.contributions||0)/Math.max(.0001,r.inflationFactor||1)}),lifetimeTaxes:lifetimeTaxes,limitWarnings:Array.from(new Set(limitWarnings))}
    }
function quantile(a,q,sorted){if(!sorted)a=a.slice().sort(function(x,y){return x-y});var p=(a.length-1)*q,l=Math.floor(p),h=Math.ceil(p);return a[l]+(a[h]-a[l])*(p-l)}
/* Finds a representative calculationErrorCode across a set of rows -- the
   first one present, so an aggregate carries at least one usable, specific
   code even when the triggering path isn't path 0 (the only one `issues` is
   collected from). Shared by runPlan()'s single-run branch and
   aggregateMonteCarloRuns() so both report this the same way. */
function firstCalculationErrorCode(rows){for(var i=0;i<(rows||[]).length;i++)if(rows[i]&&rows[i].calculationErrorCode)return rows[i].calculationErrorCode;return null}
/* R2R-002 round 2 external requalification fix (ARCH-02): the explicit
   invalid-result contract. Round 1 stopped publishing a numeric
   `successRate` for an invalid batch but still returned `failed:true`
   (reusing the FINANCIAL failure field for a calculation failure) plus
   ordinary `rows`, quantiles, lifetime totals and shortfall ages computed
   from the surviving valid subset -- and the standard UI rendered all of it
   as the plan projection. Cost of change is not a reason to leave a
   contract unmet, and the governing acceptance explicitly allowed keeping
   valid-subset content under a separate, clearly named object. So:
     - `status` becomes "calculation_error" (a positive signal, not the
       absence of one);
     - `failed` becomes null -- an invalid result is not classified through
       the established financial pass/fail meaning at all;
     - every ordinary financial field is nulled;
     - anything still worth keeping moves under `partialDiagnostics`, whose
       own `label` says plainly that it is not the plan result.
   Consumers therefore cannot read an invalid result as a financial one by
   accident: the fields they would read are simply not there. */
/* R3-UI-002 round 3 external requalification fix: classifies ONE raw
   simulatePlan() result for the historical heat map. The heat map calls
   simulatePlan() directly, so its results never pass through runPlan()'s
   invalid-result contract -- it was reading `!result.failed` and the final
   row's `total` unconditionally, which turned a calculation error into an
   ordinary financial "No" plus a published (possibly NaN-derived) ending
   balance. A calculation error is checked FIRST here, and a genuinely
   depleted-but-valid run keeps its ordinary funded/not-funded meaning.
   Lives in engine.js (not app-shell.html) so it is directly testable
   against fabricated results without a historical sweep or a DOM. */
function classifyHistoricalCell(result){
  var invalid=!result||result.calculationErrorAge!==null&&result.calculationErrorAge!==undefined;
  if(!invalid){
    var last=result.rows&&result.rows.length?result.rows[result.rows.length-1]:null;
    if(!last||!Number.isFinite(last.total))invalid=true;
    else return {invalid:false,funded:!result.failed,end:last.total};
  }
  return {invalid:true,funded:false,end:null};
}
function applyInvalidResultContract(result,partial){
  result.status="calculation_error";
  result.failed=null;
  result.successRate=null;
  result.rows=null;
  result.firstShortfallAge=null;
  result.sustainedFailureAge=null;
  result.failureAge=null;
  result.lifetimeContributions=null;
  result.lifetimeContributionsReal=null;
  result.lifetimeTaxes=null;
  result.partialDiagnostics=partial;
  return result;
}
/* R2V-003 external audit fix (ARCH-02): factored out of runPlan() so the
   aggregation logic -- which paths count toward successRate/quantiles, how a
   calculation error is surfaced -- is directly testable against fabricated
   path results, without needing an actual stochastic run (see
   tests/audit-r2-cash-settlement.test.js's synthetic-aggregate tests).

   R2R-002 external requalification fix: the first version of this excluded
   invalid paths from the success-rate/quantile CALCULATION, but still
   published an ordinary numeric `successRate`/`failed`/quantile rows the
   moment even one path remained valid -- e.g. 1 valid + 1 invalid path
   reported successRate:100, indistinguishable from a genuinely clean batch
   to any consumer that reads `successRate` without first checking
   `calculationError`. The governing rule is the same one runPlan()'s
   single-run branch already follows: ANY calculation error makes
   `successRate` null and the batch not affirmatively "succeeded" --
   partial-batch quantiles/lifetime totals are still computed from the valid
   subset below (useful diagnostic content, and `rows` already has too wide
   a blast radius across chart/table rendering to null out safely), but
   `validPathCount`/`requestedPathCount` on the return value make clear how
   partial they are, and the standard success/score UI (app-shell.html's
   renderResults()) reads `calculationError` before ever touching
   `successRate`. */
function aggregateMonteCarloRuns(runs){
  var pathCount=runs.length;
  var validRuns=runs.filter(function(r){return r.calculationErrorAge===null||r.calculationErrorAge===undefined});
  var calcErrorPaths=pathCount-validRuns.length,validCount=validRuns.length;
  var firstShortfallAges=[],sustainedFailureAges=[];
  validRuns.forEach(function(r){
    if(r.firstShortfallAge!==null)firstShortfallAges.push(r.firstShortfallAge);
    if(r.sustainedFailureAge!==null)sustainedFailureAges.push(r.sustainedFailureAge)
  });
  var success=validRuns.filter(function(r){return !r.failed}).length;
  var quantileKeys=["total","realTotal","taxable","preTax","roth","hsa","contributions","income","spending","withdrawals","dividends","taxes","rmd","shortfall","debtPayments","otherAssets","debtBalance","nonPortfolioDraw","inflationFactor","networth","magi","federalAgi","ssProvisionalIncome","seniorDeductionMagi","niitMagi","irmaaMagi"],values=new Array(validCount),byValue=function(a,b){return a-b};
  var rows=[];
  for(var y=0;y<runs[0].rows.length;y++){
    var base={age:runs[0].rows[y].age},totalQ10=0,totalQ90=0,rowHasCalcError=false;
    for(var ri=0;ri<pathCount;ri++)if(runs[ri].rows[y]&&runs[ri].rows[y].calculationError)rowHasCalcError=true;
    if(validCount>0){
      for(var ki=0;ki<quantileKeys.length;ki++){
        var key=quantileKeys[ki];
        for(var vi=0;vi<validCount;vi++)values[vi]=validRuns[vi].rows[y][key];
        values.sort(byValue);
        base[key]=quantile(values,.5,true);
        if(key==="total"){totalQ10=quantile(values,.1,true);totalQ90=quantile(values,.9,true)}
      }
    }
    base.q10=totalQ10;
    base.q90=totalQ90;
    base.calculationError=rowHasCalcError;
    rows.push(base)
  }
  var firstAge=firstShortfallAges.length?quantile(firstShortfallAges,.5):null,sustainedAge=sustainedFailureAges.length?quantile(sustainedFailureAges,.5):null;
  var calculationError=calcErrorPaths>0,representativeCode=null;
  for(var rj=0;rj<pathCount&&!representativeCode;rj++)representativeCode=firstCalculationErrorCode(runs[rj].rows);
  var aggregate={
    rows:rows,
    status:"ok",
    failed:validCount>0?success<validCount:true,
    successRate:validCount>0?success/validCount*100:null,
    calculationError:calculationError,
    calculationErrorCode:representativeCode,
    calculationErrorPaths:calcErrorPaths,
    requestedPathCount:pathCount,
    validPathCount:validCount,
    firstShortfallAge:firstAge,
    sustainedFailureAge:sustainedAge,
    failureAge:sustainedAge,
    lifetimeContributions:validCount>0?quantile(validRuns.map(function(r){return r.lifetimeContributions}),.5):null,
    lifetimeContributionsReal:validCount>0?quantile(validRuns.map(function(r){return r.lifetimeContributionsReal}),.5):null,
    lifetimeTaxes:validCount>0?quantile(validRuns.map(function(r){return r.lifetimeTaxes}),.5):null,
    mode:"monteCarlo",
    limitWarnings:runs[0].limitWarnings
  };
  /* R2R-002 round 2: ANY invalid path takes the whole batch out of the
     ordinary financial contract -- valid-subset quantiles and lifetime
     totals survive only under partialDiagnostics, explicitly labelled. */
  if(!calculationError)return aggregate;
  return applyInvalidResultContract(aggregate,{
    label:"valid paths only -- diagnostic, not the plan result",
    calculationErrorCode:representativeCode,
    calculationErrorPaths:calcErrorPaths,
    requestedPathCount:pathCount,
    validPathCount:validCount,
    rows:rows,
    firstShortfallAge:firstAge,
    sustainedFailureAge:sustainedAge,
    lifetimeContributions:aggregate.lifetimeContributions,
    lifetimeContributionsReal:aggregate.lifetimeContributionsReal,
    lifetimeTaxes:aggregate.lifetimeTaxes
  });
}
/* The input gates runPlan() has always applied, in its order, shared with every direct simulatePlan() call (S5
   block 2n): list shape, boolean flags, finite balances and contributions, the account contract, serialization, and
   then the documented flag defaults (Q80: filled after serialization, in the text the simulation parses, so a
   supported hook runs once and no accessor is read outside the refusal). Returns the plan carrying its documented defaults, the serialized text the
   simulation parses, the refusal code (null when the plan passes) and the flag path a boolean-flag refusal names.
   This function object is also the engine-private token runPlan() hands simulatePlan(): it is not exported, so no
   caller outside the engine can present it. */
/* S5R-01 (the 2026-09-16 external audit's first finding; repaired on the owner's go of 2026-09-16): one validated
   execution snapshot. The gates below used to check the caller's objects, while the simulation parsed the text
   nonSerializableScenarioInputCode() produced -- after any supported toJSON hook had run -- and every other reader
   (auditContributions(), debtTotal()) read the caller's objects again. A hook could hand the simulation data no gate
   had seen: a zero contribution that still deposited, duplicate ids, a string balance, a list that was not a list.
   Now:
   - the raw checks run first on the caller's objects, before JSON can turn a NaN into null;
   - the three lists are serialized once, as before, so a hook still runs exactly once;
   - identityPlan is the caller's plan with those lists replaced by their parsed text, and the list, flag, number,
     holding and account-contract checks run again on it; a list whose text is not a list is refused;
   - documented defaults are applied to that snapshot, and plan -- what every reader reads -- carries the same lists
     the simulation parses;
   - an exception while reading the input (a getter that throws) is a named refusal, UNREADABLE_INPUT, not an
     exception escaping the entry point.
   The caller's plan is never changed. Path scope: every route that runs the input gates. */
function scenarioInputGate(p){var serialized=[],flagPath=null,rejectedInput=null,plan=p,identityPlan=p;
  try{
  /* S5AA 1.1, Q100: the section gate runs FIRST. Every check below reads p.retirement, p.advanced or
     p.assumptions, so a scenario missing one of them has to be turned away before they are read, not after. */
  rejectedInput=missingScenarioSectionCode(p)||invalidRunCountCode(p);
  rejectedInput=rejectedInput||nonArrayListInputCode(p)||nonRecordListElementCode(p);
  if(!rejectedInput){flagPath=nonBooleanFlagPath(p);if(flagPath!==null)rejectedInput="NONBOOLEAN_FLAG"}
  if(!rejectedInput){flagPath=nonNumberPlanValuePath(p);if(flagPath!==null)rejectedInput="NONNUMBER_PLAN_VALUE"}
  rejectedInput=rejectedInput||nonFiniteScenarioInputCode(p)||nonFiniteHoldingInputCode(p)||missingIncomeOwnerCode(p)||unrecognizedIncomeOwnerCode(p)||unknownFilingStatusCode(p)||unknownMethodCode(p)||nobodyAliveAtStartCode(p)||accountContractCode(p);
  if(!rejectedInput)rejectedInput=nonSerializableScenarioInputCode(p,serialized);
  if(!rejectedInput){
      identityPlan=serializedSnapshot(p,serialized);
      rejectedInput=nonListSerializedOutputCode(p,identityPlan)||nonArrayListInputCode(identityPlan)||nonRecordListElementCode(identityPlan);
      if(!rejectedInput){flagPath=nonBooleanFlagPath(identityPlan);if(flagPath!==null)rejectedInput="NONBOOLEAN_FLAG"}
      if(!rejectedInput){flagPath=nonNumberPlanValuePath(identityPlan);if(flagPath!==null)rejectedInput="NONNUMBER_PLAN_VALUE"}
      rejectedInput=rejectedInput||nonFiniteScenarioInputCode(identityPlan)||nonFiniteHoldingInputCode(identityPlan)||accountContractCode(identityPlan);
      if(!rejectedInput)plan=serializedSnapshot(withDocumentedFlagDefaults(identityPlan,serialized),serialized);
  }
  }catch(e){rejectedInput="UNREADABLE_INPUT";flagPath=null;plan=p;identityPlan=p}
  return {plan:plan,identityPlan:identityPlan,serialized:serialized,code:rejectedInput||null,flagPath:flagPath}}
/* S5R-01: the plan with its serialized lists (accounts, other assets, debts) replaced by their parsed text. Every other
   field is the caller's, copied by descriptor (copyOwnRecord() reads no property), so nothing is read twice and
   nothing of the caller's changes. A list with no text keeps the caller's value. */
function serializedSnapshot(base,serialized){
  var out=copyOwnRecord(base),adv=null,LISTS=[null,"otherAssets","debts"];
  for(var i=0;i<LISTS.length;i++){
    var entry=serialized[i];if(!entry)continue;
    var value=entry.text===undefined?undefined:JSON.parse(entry.text);
    if(LISTS[i]===null){Object.defineProperty(out,"accounts",{value:value,writable:true,enumerable:true,configurable:true});continue}
    if(!adv){adv=out.advanced&&typeof out.advanced==="object"?copyOwnRecord(out.advanced):{};Object.defineProperty(out,"advanced",{value:adv,writable:true,enumerable:true,configurable:true})}
    Object.defineProperty(adv,LISTS[i],{value:value,writable:true,enumerable:true,configurable:true});
  }
  return out;
}
/* S5R-01: a list the caller passed as a list must still be a list after its hook ran: text of null, of a non-list,
   or no text at all (a hook that returned undefined) is refused as the list-shape gate refuses a non-list. */
function nonListSerializedOutputCode(p,snapshot){
  var pairs=[[p.accounts,snapshot.accounts],[p.advanced&&p.advanced.otherAssets,snapshot.advanced&&snapshot.advanced.otherAssets],[p.advanced&&p.advanced.debts,snapshot.advanced&&snapshot.advanced.debts]];
  for(var i=0;i<pairs.length;i++)if(Array.isArray(pairs[i][0])&&!Array.isArray(pairs[i][1]))return "NON_ARRAY_LIST_FIELD";
  return null;
}
/* S5R-01: a read that may raise (a getter on the caller's plan), for the fields a refusal still reports. */
function readOrNull(read){try{return read()}catch(e){return null}}
/* The refusal issue, worded once for both callers. */
function recordScenarioRefusal(issues,rejectedInput,flagPath){recordIssue(issues,"SCENARIO_"+rejectedInput,"ERROR",rejectedInput==="NON_ARRAY_LIST_FIELD"
            ?"A list in the scenario (accounts, spending stages, expenses, other incomes, asset classes, other assets, debts, an account's future changes, or the manual withdrawal order) is not in the shape the engine reads, so no projection can be computed."
            :rejectedInput==="NON_RECORD_LIST_ELEMENT"
            ?"An entry in one of the scenario's lists (accounts, spending stages, expenses, other incomes, asset classes, other assets, debts, or an account's future changes) is not a record, so it cannot be read."
            :rejectedInput==="NONBOOLEAN_FLAG"
            ?"A feature switch in the scenario ("+flagPath+") is not true or false, so whether that feature is on cannot be determined."
            :rejectedInput==="NONNUMBER_PLAN_VALUE"
            ?"A value in the plan ("+flagPath+") is not a number, so the projection cannot use it."
            :rejectedInput==="NONFINITE_ACCOUNT"
            ?"Scenario account values are not usable numbers."
            :rejectedInput==="NONSERIALIZABLE_INPUT"
            ?"An account, debt or other-asset entry cannot be copied for simulation (for example it contains a circular reference or a BigInt), so no projection can be computed."
            :rejectedInput==="NONFINITE_CONTRIBUTION"
            ?"An account's planned contribution is not a usable number, so the amount deposited each year cannot be determined."
            :rejectedInput==="NONFINITE_OTHER_ASSET_VALUE"
            ?"An other asset's value is not a usable number, so what it adds to net worth each year cannot be determined."
            :rejectedInput==="NONFINITE_DEBT_BALANCE"
            ?"A debt's balance is not a usable number, so its payments, interest and payoff cannot be projected."
            :rejectedInput==="MISSING_INCOME_OWNER"
            ?"An other income has no owner, so whose age it starts and ends at cannot be determined."
            :rejectedInput==="UNRECOGNIZED_INCOME_OWNER"
            ?"An other income names an owner the engine does not recognize, so whose age it starts and ends at cannot be determined."
            :rejectedInput==="MISSING_SCENARIO_SECTION"
            ?"The scenario is missing one of its required sections (profile, employment, assumptions, retirement or advanced), or one of them is not a record, so no projection can be computed."
            :rejectedInput==="INVALID_RUN_COUNT"
            ?"The number of simulation runs is not a whole number between 1 and 10,000, so no projection can be computed."
            :rejectedInput==="NONFINITE_DEBT_RATE"
            ?"A debt's interest rate is not a usable number, so its interest and payoff cannot be projected."
            :rejectedInput==="UNKNOWN_FILING_STATUS"
            ?"The filing status is not one the tax tables define (single, mfj or hoh), so income tax cannot be computed."
            :rejectedInput==="UNKNOWN_METHOD"
            ?"The projection method is not one the engine runs (simple, historical or monteCarlo), so the projection it names cannot be computed."
            :rejectedInput==="NOBODY_ALIVE_AT_START"
            ?"Every lifespan entered ends before the plan's starting age, so nobody the plan models is alive and there is nothing to project. Check the lifespans."
            :rejectedInput==="UNREADABLE_INPUT"
            ?"A value in the scenario could not be read (reading it raised an error), so no projection can be computed."
            :rejectedInput==="NONFINITE_LIST_VALUE"
            ?"A number in the scenario's accounts, other assets or debts is not finite (NaN or infinite); copied for simulation it would silently become null, so no projection can be computed."
            :rejectedInput==="DUPLICATE_ACCOUNT_ID"
            ?"Two accounts share an id, so contributions, transfers and tax funding cannot be routed unambiguously."
            :"An account declares itself a household cash holding without meeting that category's contract (boolean flag, taxable class, cash basis).",rejectedInput==="NONBOOLEAN_FLAG"||rejectedInput==="NONNUMBER_PLAN_VALUE"?{path:flagPath}:{});}
/* What a direct simulatePlan() call returns when a gate refuses its input: simulatePlan()'s own fields, with no
   rows and no figures, calculationErrorAge at the plan's starting age (what classifyHistoricalCell() reads to mark
   a heat-map cell invalid), and the refusal's code. It carries no issues field: the refusal issue goes to the
   caller's collector, when there is one. */
function refusedSimulation(p,rejectedInput){var age=readOrNull(function(){return p&&p.profile&&typeof p.profile.age==="number"&&Number.isFinite(p.profile.age)?p.profile.age:0})||0;
  return {rows:null,failed:null,firstShortfallAge:null,sustainedFailureAge:null,failureAge:null,calculationErrorAge:age,calculationErrorCode:"SCENARIO_"+rejectedInput,lifetimeContributions:null,lifetimeContributionsReal:null,lifetimeTaxes:null,limitWarnings:[]}}
function runPlan(p,givenGate,gateToken){
      var issues=[];
      /* R2R-001 round 2: reject a corrupted account input at the public
         boundary, before clone()/growAccounts() can silently normalize it
         into a plausible-looking zero. */
      /* Q53 (S5 2l): the boolean-flag gate runs once the lists are known to be
         lists. A flag's documented default is written into the serialized text
         after serialization (Q80), so the text the simulation parses carries it. */
      /* S5R-01: runScenario() gates once and passes the result with the engine's token, so a hook runs once. */
      var gate=gateToken===scenarioInputGate&&givenGate?givenGate:scenarioInputGate(p),serialized=gate.serialized,flagPath=gate.flagPath,rejectedInput=gate.code;
      if(!rejectedInput)p=gate.plan;
      if(rejectedInput){
        recordScenarioRefusal(issues,rejectedInput,flagPath);
        return applyInvalidResultContract({
          mode:readOrNull(function(){return p.assumptions.method}),issues:issues,limitWarnings:[],
          calculationError:true,calculationErrorCode:"SCENARIO_"+rejectedInput,calculationErrorAge:null
        },{label:"no projection was computed -- the scenario was rejected before simulation",calculationErrorCode:"SCENARIO_"+rejectedInput,rows:null});
      }
      /* Q58, Q81: the strategy is resolved once per run, before every reader --
         strategySpending()'s dispatch and the swap warning below -- by
         withResolvedStrategy(), the same resolution a direct simulatePlan()
         call applies after its gates. */
      p=withResolvedStrategy(p,issues);
      /* Q51, Q52 -- decided 2026-09-13 (the owner): disclose and swap. strategySpending()
         orders an inverted floor/ceiling or VPW rate pair itself, at each of its
         three user-bounded clamp() sites. This records, once per run, that it did,
         and only for a strategy that reads the pair, so a stored but unused pair
         is not reported. The other fourteen clamp() sites pass constant bounds and
         cannot invert. In the app, the form reader raises the ceiling to the floor
         and the VPW maximum to the minimum for the scenario being edited, silently,
         so that scenario never reaches this inverted; whether the app should swap
         and disclose too is a separate, undecided question. */
      var spendRules=p.retirement||{},vpwLowRate=Number(spendRules.vpwMinRate)||0,vpwHighRate=spendRules.vpwMaxRate===0?0:(Number(spendRules.vpwMaxRate)||100);
      if((spendRules.strategy==="guardrails"||spendRules.strategy==="guyton"||spendRules.strategy==="floorCeiling")&&Number(spendRules.floor)>Number(spendRules.ceiling))recordIssue(issues,"SPENDING_FLOOR_CEILING_SWAPPED","WARNING","The spending floor ("+money(Number(spendRules.floor))+") is above the ceiling ("+money(Number(spendRules.ceiling))+"), so the two were swapped: spending is kept between "+money(Number(spendRules.ceiling))+" and "+money(Number(spendRules.floor))+" a year in today's dollars.",{floor:spendRules.floor,ceiling:spendRules.ceiling});
      if(spendRules.strategy==="vpw"&&vpwLowRate>vpwHighRate)recordIssue(issues,"VPW_RATE_BOUNDS_SWAPPED","WARNING","The minimum withdrawal rate ("+vpwLowRate+"%) is above the maximum ("+vpwHighRate+"%), so the two were swapped: each year's withdrawal is kept between "+vpwHighRate+"% and "+vpwLowRate+"% of the balance.",{vpwMinRate:spendRules.vpwMinRate,vpwMaxRate:spendRules.vpwMaxRate});
      /* The qualified share of dividends is held to 0-100 where it is read (simulatePlan()); say so once for the run,
         and only when dividends are on, since the imputed branch never reads the share. */
      if(spendRules.dividendOn&&typeof spendRules.dividendQualified==="number"&&(spendRules.dividendQualified<0||spendRules.dividendQualified>100))recordIssue(issues,"DIVIDEND_QUALIFIED_CLAMPED","WARNING","The qualified share of dividends ("+spendRules.dividendQualified+"%) is outside 0 to 100%, so "+(spendRules.dividendQualified<0?0:100)+"% was used.",{dividendQualified:spendRules.dividendQualified,used:spendRules.dividendQualified<0?0:100});/* S5 task 6.6a, the owner's question 3 (A): IRMAA reads MAGI from two years earlier, which the plan has not got for its first two years; they assume no surcharge. *//* R11 round, external audit of 02b921a (R10-07): WHO is charged Medicare in those two years, not whether SELF is 65.
   Since decision 6 the charge is per living person (householdSeniorAges()), so a spouse of 67 beside a self of 60 is
   charged on a lookback the plan has not got, and this said nothing. Each of the first two row openings is asked
   whether anyone alive there is 65 or over with the household retired inside that row -- and the second opening only
   where the projection reaches it. */if(p.advanced&&p.advanced.healthOn&&(function(){var start=Number(p.profile.age),cut=lastDeathCutAge(p),
     reaches=cut===null?Number(p.profile.endAge):cut,openings=[start,Math.floor(start)+1];
   for(var i=0;i<openings.length;i++){var opening=openings[i],rowEnds=i===0?Math.min(Math.floor(start)+1,reaches):Math.min(Math.floor(start)+2,reaches);
     if(!(rowEnds>opening))continue;
     if(!(Number(p.profile.retireAge)<rowEnds))continue;
     var ages=householdSeniorAges(p,opening);
     if(ages.some(function(a){return a>=65}))return true}
   return false})())recordIssue(issues,"IRMAA_PRE_PLAN_MAGI_ASSUMED","WARNING","Medicare IRMAA surcharges use income from two years earlier. The plan has no income from before it starts, so its first two years assume no surcharge.",{path:"advanced.healthOn",planYears:[0,1],lookbackYears:RULES.medicare.irmaa.lookbackYears});/* Q99 (G5): THE QUALIFIED-MEDICAL SHARE IS AN ASSUMPTION, AND IT IS SAID OUT LOUD. A share is what the household expects to spend on qualifying care, not proof that it did, and the DEFAULT -- every draw qualified -- is the one that most needs saying, because it is invisible. Stated once per plan that holds an HSA, with each account's share in the payload so the raw evidence carries it too. The engine does not model the disability or death exceptions of 223(f)(4)(B), and that boundary is named here rather than left to be inferred from silence. */if(p.accounts&&p.accounts.filter(function(a){return a&&a.taxClass==="hsa"}).length){var hsaShares=p.accounts.filter(function(a){return a&&a.taxClass==="hsa"}).map(function(a){return {id:a.id,name:a.name,owner:a.owner==="spouse"?"spouse":"self",qualifiedMedicalPct:hsaQualifiedShare(a)}}),allQualified=hsaShares.every(function(x){return x.qualifiedMedicalPct>=100});recordIssue(issues,"HSA_QUALIFIED_SHARE_ASSUMED","WARNING",(allQualified?"Every withdrawal from a health savings account is assumed to pay a qualified medical expense, so none is taxed. ":"Part of each health savings account withdrawal is assumed NOT to pay a qualified medical expense. That part is ordinary income, and before the account owner turns "+hsaNonQualifiedRecord("hsa_nonqualified_exception_age")+" it also carries an additional "+Math.round(hsaNonQualifiedRecord("hsa_nonqualified_additional_tax_rate")*100)+"% tax on the amount included. ")+"This is an assumption about qualifying expenses, not a record that they exist. The exceptions for disability and death are not modelled.",{path:"accounts",accounts:hsaShares,exceptionAge:hsaNonQualifiedRecord("hsa_nonqualified_exception_age"),additionalTaxRate:hsaNonQualifiedRecord("hsa_nonqualified_additional_tax_rate")});}/* Q92 (F6): A SURVIVOR FIGURE IS AN APPROXIMATION AND SAYS SO, IN A FORM A MACHINE CAN READ. Task 4.7
   requires that results the deceased early-claim cap would affect are not certified by agreement: the
   cap of POMS RS 00615.320 limits a widow(er) benefit to the larger of 82.5% of the deceased's death
   PIA or the reduced retirement benefit the deceased would have had, and it needs a PIA this engine
   does not have for a household that entered a monthly figure. Where it would bite, the figure here
   is an OVER-estimate. `approximation: true` is the flag; `capApplied: false` is the boundary; the
   prose names remarriage, disability and children because none of them is modelled either.
   S5AA R34 (SA32F-01, SA32F-02, SA32F-05): the engine now holds the deceased's PIA and applies that cap (ssSurvivorMonthly), and survivor
   full retirement age is read from its own table, so `capApplied` is true and neither is named as missing; what remains
   unmodelled -- remarriage, disability, children -- is still said, and `approximation` stays true for it. *//* Q88 (F-02): A FILING-STATUS TRANSITION IS A MODELLING CHOICE, so the household is told what was
   chosen AND what was left out -- and the part left out runs the OTHER way, which is the reason to
   say it rather than let a reader assume the model is conservative in one direction.
   Modelled: the row containing a death still files jointly (IRC 6013(a)(3)); every later row files
   single. NOT modelled: qualifying surviving spouse (IRC 2(a)), which would keep the joint brackets
   and the joint standard deduction for the TWO YEARS after the death, and head of household -- both
   need a dependent, and the plan has no input for one. A household that has a dependent child is
   therefore modelled as single where it could file as a surviving spouse, and its tax in those two
   years is TOO HIGH. Remarriage is not modelled either, and would end the transition.
   Raised once, only where a death actually falls inside the projection, so a household that never
   widows inside its horizon is not told about a transition that never happens to it. */
var filingDeathAges=(function(){
  if(!p.profile||!p.profile.spouseOn||p.profile.filing!=="mfj")return [];
  /* SECOND AUDIT: the year of the death is still joint, so a death is only a TRANSITION inside this
     horizon if some row opens after it. The bound used to be the horizon's end, and a death in its
     last year was disclosed as making the survivor single "from the following year" -- a year the
     projection never reaches. lastRowOpens is where the final row opens, on the same boundaries the
     projection loop builds, and householdFilingFor() is single exactly when a death falls before a
     row's opening age. */
  var out=[],selfLife=Number(p.retirement.selfLife),spouseLife=Number(p.retirement.spouseLife),
      spouseAtSelfAge=Number(p.profile.age)+(spouseLife-Number(p.profile.spouseAge)),
      startAge=Number(p.profile.age),endAge=Number(p.profile.endAge),
      lastRowOpens=Math.max(startAge,endAge%1!==0?Math.floor(endAge):endAge-1);
  if(Number.isFinite(selfLife)&&selfLife>=startAge&&selfLife<lastRowOpens)out.push({who:"self",atSelfAge:selfLife});
  if(Number.isFinite(spouseAtSelfAge)&&spouseAtSelfAge>=startAge&&spouseAtSelfAge<lastRowOpens)out.push({who:"spouse",atSelfAge:spouseAtSelfAge});
  return out;
})();
if(issues&&filingDeathAges.length){recordIssue(issues,"SURVIVOR_FILING_STATUS_MODELLED","WARNING","This plan files jointly, and a death falls inside its horizon. The year of the death is still filed "+
"jointly; from the following year the survivor is taxed as SINGLE -- single brackets, the single "+
"standard deduction and single phaseout thresholds, and its Medicare premium, which reads the return from two years before, uses that "+
"return's own filing status (joint for the two years after the death, then single) -- and the "+
"person who died no longer counts toward the age-65 amounts. QUALIFYING SURVIVING SPOUSE STATUS IS "+
"NOT MODELLED: it would keep the joint brackets and the joint standard deduction for the two years "+
"after the death, but it requires a dependent child and this plan has no input for one. A household "+
"with a dependent child therefore sees a tax in those two years that is TOO HIGH. Head of household "+
"and remarriage are not modelled either. The Roth IRA income limit follows the same transition. The HSA "+
"family contribution limit is a question of health coverage, not of filing status; the plan has no coverage "+
"input, so it keeps the limit the entered status implies, which may overstate a survivor's room.",{path:"profile.filing",approximation:true,entered:p.profile.filing,taxedAsAfterDeath:"single",deaths:filingDeathAges,notModelled:["qualifying surviving spouse","head of household","remarriage","the HSA family limit after the death"]/* FOURTH AUDIT (A4-4): "contribution room" became false for the Roth limit at EA-03 */});}
if(p.retirement&&p.retirement.survivor&&p.profile&&p.profile.spouseOn){recordIssue(issues,"SURVIVOR_BENEFIT_APPROXIMATED","WARNING","A survivor benefit is paid from age "+survivorRecord("survivor_earliest_claim_age")+", reduced for age: "+Math.round(survivorRecord("survivor_minimum_factor")*1000)/10+"% at that age, rising to 100% at the survivor's full retirement age (its own table, by birth year), and fixed at the age the benefit starts. It is the deceased's benefit with any delayed credits they had earned by the death; where they had claimed their own benefit early, it is capped at the larger of 82.5% of their full benefit amount and what they were themselves receiving. Remarriage, disability and benefits for children are not modelled.",{path:"retirement.survivor",approximation:true,capApplied:true,earliestAge:survivorRecord("survivor_earliest_claim_age"),minimumFactor:survivorRecord("survivor_minimum_factor"),deceasedEarlyClaimCap:survivorRecord("survivor_deceased_early_claim_cap"),notModelled:["remarriage","disability","children"]});}/* Q94 (F8): AN ADJUSTABLE LOAN RE-AMORTISES, AND THE HOUSEHOLD IS TOLD SO. Until S5AA task 5.1 this
   depended on a switch that occurred ONCE in the whole shipped page -- inside the default plan, with no
   control to set it -- so every modelled ARM kept its entered payment across its reset. The switch is
   retired and the behaviour is unconditional, which means a plan saved before this change projects a
   different payment and a different balance than it did when it was saved. Said to anyone who holds an
   adjustable-rate debt THAT ACTUALLY HAS A RESET AGE, because those are exactly the plans whose
   numbers moved. A debt typed adjustable with no reset age never reaches the recast at all, and
   telling such a household its projection changed would be false. The retired key is
   still READ here, and only here: that read is what keeps the validator's type check on it, which is
   FM-09's repair and is not given up to tidy a field away. */if(p.advanced&&p.advanced.armRecastOnReset!==undefined&&Array.isArray(p.advanced.debts)&&p.advanced.debts.some(function(d){return d&&d.rateType==="adjustable"&&Number.isFinite(Number(d.nextRateResetAge))}))recordIssue(issues,"ARM_RECAST_ALWAYS_APPLIED","WARNING","An adjustable-rate loan is re-amortised when its rate resets: the remaining balance is spread over the remaining term at the new rate, so the payment changes. Earlier versions of this calculator held the entered payment across a reset, so a plan saved before this change projected a lower payment and a higher balance than it does now.",{path:"advanced.armRecastOnReset",saved:p.advanced.armRecastOnReset,behaviour:"re-amortise at reset"});/* S5AA TASK 5.5 -- THE REFERENCE'S SUPPORTED DOMAIN, MADE DETECTABLE.

   Three exclusions are reachable from ordinary inputs and were silent. A household could not tell
   that its answer sat outside what this engine models, and neither could a runner: task 5.5 requires
   each exclusion to be DETECTABLE and enforceable at a boundary, and an unsupported notice alone is
   not enough if an affected result is still presented as a qualified reference value. Each carries
   `outsideSupportedDomain: true` so a consumer can filter on the FACT rather than on prose, and each
   names the new-engine task that owns it.

   These are NOT repairs and do not pretend to be. They make an existing boundary visible. */(function(){
  if(!issues)return;
  var adv=p.advanced||{},ret=p.retirement||{},accounts=p.accounts||[],debts=Array.isArray(adv.debts)?adv.debts:[];
  /* THE POST-DEATH EXCLUSION AND THE SPOUSAL-ROLLOVER DISCLOSURE ARE RAISED BY simulatePlan(), NOT HERE (R7 re-audit,
     R7-02; fourth internal audit, A4-6). This block built both before the simulation, from the configured
     accounts, and so described accounts and distributions as they were entered rather than as they were when a
     death came. See the end of simulatePlan()'s loop. */
  /* S5AA THIRD AUDIT: A LIFESPAN THAT ENDED BEFORE THE PLAN STARTS. householdSurvivorship() treats such a
     person as dead from the first row -- since F-02 the household files single from the start, since Q3
     they earn nothing, since Q4 their accounts are the survivor's from row 0 -- and every disclosure of
     those transitions is limited to a death INSIDE the horizon, so none fired. MEASURED at e9539ea: a
     spouse of 72 with a lifespan of 70 and a $500,000 IRA; the first row's required distribution fell
     from $18,248.18 to $0.00 and nothing said why. It may be a typing slip or a widow entering a late
     spouse; either way the household is told. A lifespan EQUAL to the starting age is a death inside the
     first row, and the in-horizon disclosures already cover it. */
  (function(){
    var profile=p.profile||{},r=p.retirement||{},deaths=[],
        check=function(who,life,ageNow){life=Number(life);ageNow=Number(ageNow);
          if(Number.isFinite(life)&&Number.isFinite(ageNow)&&life<ageNow)deaths.push({who:who,lifespan:life,ageAtStart:ageNow})};
    check("self",r.selfLife,profile.age);
    if(profile.spouseOn)check("spouse",r.spouseLife,profile.spouseAge);
    if(!deaths.length)return;
    /* A plan in which nobody is alive at the start never gets here: the input gate refuses it
       (SCENARIO_NOBODY_ALIVE_AT_START). So this is always one spouse dead and the other alive. */
    recordIssue(issues,"DEATH_BEFORE_PLAN_START","WARNING",
      "A lifespan entered for "+deaths.map(function(d){return d.who==="spouse"?"the spouse":"the primary person"}).join(" and ")+
      " ends before the plan's starting age, so the projection treats them as having already died. "+
      "From the first year the household files as single, the deceased earns nothing, and any account in their "+
      "name is treated as the survivor's own. "+
      "If that is not what was meant, check the lifespan.",
      {path:deaths[0].who==="spouse"?"retirement.spouseLife":"retirement.selfLife",deaths:deaths});
  })();
  /* S5AA R35 (SA32F-18): an other-income pension stream whose owner dies inside the projection, while the stream still pays, with no
     `survivorPercent` entered, is paid in full to the survivor. That is the same joint-and-survivor assumption as the main pension's,
     and it is said here, naming the streams. An entered share is the household's own statement and needs no disclosure. */
  (function(){
    var r=p.retirement||{},profile=p.profile||{},reach=lastDeathCutAge(p),endAge=Number(profile.endAge),horizon=reach===null?endAge:reach,streams=[];
    (r.otherIncomes||[]).forEach(function(i,k){
      if(!i||i.type!=="pension"||i.survivorPercent!==undefined&&i.survivorPercent!==null)return;
      var spouse=i.owner==="spouse"&&profile.spouseOn;if(!spouse&&i.owner!=="self")return;
      var life=Number(spouse?r.spouseLife:r.selfLife),toSelf=spouse?Number(profile.age)-Number(profile.spouseAge):0;
      if(!Number.isFinite(life)||!(life+toSelf<horizon)||!(Number(i.end)>life)||!(Number(i.start)<horizon-toSelf))return;/* owner's ages: the death is inside the projection and the stream is still paying */
      streams.push("retirement.otherIncomes["+k+"]")});
    if(!streams.length)return;
    recordIssue(issues,"PENSION_STREAM_AFTER_DEATH_ASSUMED","WARNING",
      "A pension income is paid in full after the death of the person it belongs to, because no survivor share was entered for it. "+
      "That assumes a 100% joint-and-survivor annuity. A single-life pension stops at the death (a survivor share of 0%), and many "+
      "joint-and-survivor pensions pay a survivor 50% to 75%; enter the pension's own survivor share to model it.",
      {path:streams[0],approximation:true,assumed:"100% joint-and-survivor",streams:streams});
  })();
  /* S5AA THIRD AUDIT, disclosed on the owner's decision of 2026-09-21 ("disclose the pension"): `retirement.pension`
     is paid whenever the self is retired, with no death check. So it keeps paying in full after the self
     dies -- and where the self dies before retiring, it STARTS paying after the death. That is an unstated
     assumption of a 100% joint-and-survivor annuity. The behaviour is KEPT; this says so wherever it is
     reached: a pension entered, and some part of the horizon in which the self is both retired and dead. */
  (function(){
    var r=p.retirement||{},profile=p.profile||{},pension=Number(r.pension)||0,selfLife=Number(r.selfLife),
        endAge=Number(profile.endAge),retireAge=Number(profile.retireAge);
    if(!(pension>0)||!Number.isFinite(selfLife)||!Number.isFinite(endAge))return;
    /* R12 round, external re-audit of b053dc2 (R11-03): from the first row in which the owner is DEAD. The year of a
       death is a year the person lived in (householdSurvivorship() counts them dead only once their lifespan is below a
       row's opening age), so a pension paid in that year is not paid after the death. Measured from the lifespan
       itself, a household of one -- which has no row after the death at all -- was told its pension continues to a
       survivor it does not have. The first dead opening is the whole age after the lifespan, or the plan's start for a
       death before it. */
    var startAge=Number(profile.age),deadFrom=Number.isFinite(startAge)&&startAge>selfLife?startAge:Math.floor(selfLife)+1;
    var paidFrom=Math.max(deadFrom,Number.isFinite(retireAge)?retireAge:-Infinity);
    /* R11 round, external audit of 02b921a (R10-07): against the age the projection REACHES, not profile.endAge.
       Since decision 8 the rows stop at the last death, so a pension first payable after that cut is never paid, and
       claiming it was is a false positive about money no row contains. */
    var reaches=lastDeathCutAge(p);
    if(!(paidFrom<(reaches===null?endAge:reaches)))return;
    recordIssue(issues,"PENSION_AFTER_DEATH_ASSUMED","WARNING",
      "The pension is paid in full after the death of the person it belongs to"+
      (Number.isFinite(retireAge)&&selfLife<retireAge?", and here it starts paying only after that death":"")+
      ". That assumes a 100% joint-and-survivor annuity, which continues unchanged to a survivor. Many pensions "+
      "pay a survivor less, and a single-life pension stops at the death; a survivor percentage is not modelled.",
      {path:"retirement.pension",approximation:true,assumed:"100% joint-and-survivor",selfLife:selfLife,paidAfterDeathFrom:paidFrom,
       notModelled:["a survivor percentage","a single-life pension that stops at the death"]});
  })();
  /* X01 IS NO LONGER AN EXCLUSION. This block recorded that a credit card was projected as a
     fixed-term loan because the engine named src/debt-revolving.js zero times. It names it now, and
     projectDebts() reproduces the module month for month -- checked at 1, 3, 5 and 10 years on both
     the balance and the cumulative payments, agreeing to four decimals. The entry is replaced rather
     than deleted, because what is modelled still has edges and a household should be told where they
     are; `outsideSupportedDomain` is gone, which is the part that changed.

     THE EDGES, taken from the module's own header rather than restated loosely:
       - interest is SIMPLE MONTHLY ACCRUAL, balance x APR / 12. Average daily balance -- what most
         issuers actually use -- and statement-balance grace periods both need to know WHEN within a
         month money moved, and this engine works in whole months;
       - the minimum is 2% of the balance with a $25 floor unless the debt carries its own, and there
         is no input for either today. Both figures are said out loud here for that reason. */
  var revolvingDebts=debts.filter(function(d){return d&&d.type==="creditCard"});
  if(revolvingDebts.length)
    recordIssue(issues,"REVOLVING_DEBT_MINIMUM_MODELLED","WARNING",
      "A credit card is projected as a REVOLVING balance: its minimum payment is the greater of "+
      DebtRevolving.DEFAULT_MINIMUM_PERCENT+"% of the current balance and $"+DebtRevolving.DEFAULT_MINIMUM_FLOOR+
      ", recomputed every month, so the payment falls as the balance does. An entered payment LARGER than the "+
      "minimum is what is paid; the minimum is a floor, never a ceiling. There is no input for the percent or "+
      "the floor, so those two figures are used for every card. Interest accrues simply on the month's balance "+
      "at the entered rate divided by twelve: average daily balance, which most issuers use, and grace-period "+
      "handling for a balance paid in full are NOT modelled, because both depend on when within a month money "+
      "moves and this projection works in whole months.",
      {path:"advanced.debts",approximation:true,cards:revolvingDebts.length,
       minimumPercentOfBalance:DebtRevolving.DEFAULT_MINIMUM_PERCENT,
       minimumDollarFloor:DebtRevolving.DEFAULT_MINIMUM_FLOOR,
       interestConvention:"simple monthly accrual",
       notModelled:["average daily balance","grace period on a balance paid in full","an input for the minimum percent or floor"]});
  /* X03: historical replay applies ONE series to every account. A 100%-bond portfolio replays the S&P
     500 exactly -- the all-stock and all-bond runs end at the identical total. The other two methods do
     consult the account, which is what makes this reachable by surprise: the same allocation behaves
     differently depending on a method chosen elsewhere. */
  if(p.assumptions&&p.assumptions.method==="historical"
     &&accounts.some(function(a){return a&&a.allocation&&Object.keys(a.allocation).length}))
    recordIssue(issues,"UNSUPPORTED_HISTORICAL_ALLOCATION","WARNING",
      "Historical replay applies one historical return series to every account, so the allocations set on these accounts do not change a historical projection. They do change the other two methods. This is a fixed-proxy replay, not an asset-class replay: no bond series is invented to stand beside the equity one.",
      {path:"assumptions.method",outsideSupportedDomain:true,exclusion:"allocation-aware historical replay",carriedTo:"new-engine market-data block"});
  /* X02 (the Roth exclusion) is no longer raised here from inputs. S5AA R23 (R22-01): simulatePlan() raises it where a Roth
     dollar is actually drawn before its owner is 59 1/2 -- see noteEarlyRothDraw(). The indirect reach this block keyed
     on the account to catch (an automatic policy drawing a Roth nobody named) is caught there too, as the draw itself. */
})();/* S5R-03 (decided by the owner on 2026-09-16, answer 4 (A)): the QCD cap is annual, and a plan that starts partway through a year has no record of gifts made earlier in it, so the opening row assumes none. Said once, when the first row is partial and a QCD can apply in it: a QCD is requested and someone is eligible at the plan's start. Q3 (R9 round): eligibility is the QCD's own -- self, or a spouse who is on, at 70 1/2 or older -- not the self's RMD start; it was silent when only the spouse qualified (DeepSeek audit, finding 4c/01) and before the RMD age. */if(p.advanced&&p.advanced.qcd>0&&Math.floor(p.profile.age)!==p.profile.age&&(p.profile.age>=RULES.retirement.rmd.qcdEligibleAge||(Boolean(p.profile.spouseOn)&&Number(p.profile.spouseAge)>=RULES.retirement.rmd.qcdEligibleAge)))recordIssue(issues,"QCD_OPENING_YEAR_CAP_ASSUMED","WARNING","Qualified charitable distributions are capped per person per year. The plan starts partway through a year and has no record of gifts made earlier that year, so its first year assumes none were made and each eligible person's full cap is available.",{path:"advanced.qcd",cap:RULES.retirement.qcd.records.filter(function(r){return r.provision_id==="qcd_annual_cap"})[0].value,planYears:[0]});[["self","retirement.ssClaim",spendRules.ssClaim,Number(spendRules.ssBenefit)>0||(spendRules.ssAdvanced&&spendRules.aime>0)],["spouse","retirement.spouseClaim",spendRules.spouseClaim,Boolean(p.profile&&p.profile.spouseOn)&&Number(spendRules.spouseSS)>0]].forEach(function(c){if(!c[3]||typeof c[2]!=="number"||!Number.isFinite(c[2]))return;var latest=RULES.socialSecurity.latestClaimAge;if(c[2]>=62&&c[2]<=latest)return;recordIssue(issues,"SS_CLAIM_AGE_BOUNDED","WARNING",c[2]>latest?"The "+c[0]+" Social Security claim age ("+c[2]+") is past "+latest+", when delayed credits end, so the benefit is "+latest+"'s, paid from "+c[2]+".":"The "+c[0]+" Social Security claim age ("+c[2]+") is before 62, when a retirement benefit can first start, so it starts at 62 with 62's reduction.",{path:c[1],claimAge:c[2],creditedAge:Math.min(latest,Math.max(62,c[2])),startAge:Math.max(62,c[2])})});if(p.advanced&&p.advanced.rmdOn&&2026-Math.floor(p.profile.age)===1959&&Number(p.profile.endAge)>=RULES.retirement.rmd.startAge.records.filter(function(r){return r.provision_id==="rmd_start_age_born_1959"})[0].value)recordIssue(issues,RULES.retirement.rmd.birth1959WarningCode,"WARNING","Required minimum distributions for someone born in 1959 start at "+RULES.retirement.rmd.startAge.records.filter(function(r){return r.provision_id==="rmd_start_age_born_1959"})[0].value+" here, a planning estimate: the 2024 final regulations reserve that birth year, so the age rests on proposed regulations.",{path:"profile.age",birthYear:2026-Math.floor(p.profile.age),rmdStartAge:rmdStartAge(p),authorityStatus:RULES.retirement.rmd.startAge.records.filter(function(r){return r.provision_id==="rmd_start_age_born_1959"})[0].status});
      if(p.assumptions.method!=="monteCarlo"){
        var one=simulatePlan(p,rng(p.assumptions.seed),0,null,issues,serialized,scenarioInputGate);
        /* R2V-003 external audit fix (ARCH-02): a calculation error is a
           distinct outcome from financial insolvency -- reporting
           successRate:0 for an engine bug that never validly computed a
           result implies "this plan provably runs out of money," which is
           not what happened. calculationError is now a top-level, explicit
           field every consumer must check FIRST; successRate is only ever a
           real percentage (100, or 0 for a genuine shortfall), never a
           stand-in for "the computation itself failed." */
        one.calculationError=one.calculationErrorAge!==null;
        one.calculationErrorCode=one.calculationError?firstCalculationErrorCode(one.rows):null;
        one.mode=p.assumptions.method;
        one.issues=issues;
        /* R2R-002 round 2: the same invalid-result contract the Monte Carlo
           aggregate uses -- the requalification asked for it to apply to
           simple-mode calculation errors too, so an invalid single run
           cannot show partial or NaN-bearing financial figures as the plan
           result either. */
        if(one.calculationError)return applyInvalidResultContract(one,{
          label:"partial run up to the calculation error -- diagnostic, not the plan result",
          calculationErrorCode:one.calculationErrorCode,
          calculationErrorAge:one.calculationErrorAge,
          rows:one.rows,
          firstShortfallAge:one.firstShortfallAge,
          sustainedFailureAge:one.sustainedFailureAge,
          lifetimeContributions:one.lifetimeContributions,
          lifetimeContributionsReal:one.lifetimeContributionsReal,
          lifetimeTaxes:one.lifetimeTaxes
        });
        one.status="ok";
        one.successRate=one.failed?0:100;
        return one
      }
      // Each path gets its own independent generator pair (market returns,
      // LTC draw), derived from the scenario seed rather than sharing one
      // sequential stream across every path. This makes path i reproducible
      // on its own -- unlocking future per-path parallelization (Track M2)
      // without changing which paths a given seed produces -- instead of
      // depending on how many draws every earlier path happened to consume.
      // Odd/even offsets keep the two streams per path collision-free; an
      // ABSENT seed (Number(undefined) is NaN) falls back to 0 rather than
      // collapsing every path onto the same rng(NaN>>>0) stream. A seed that is
      // present and not a finite number is refused at the input gate (S5AA R25).
      var baseSeed=Number(p.assumptions.seed);if(!Number.isFinite(baseSeed))baseSeed=0;
      /* S5AA task 1.2, Q101: EVERY path is checked, and a failed ESSENTIAL invariant invalidates the batch.
         Previously the issues collector went to `i===0?issues:null`, and checkRowInvariants() is gated on having
         one, so the reconciliation identity was verified on one path out of N. A path whose ending portfolio did
         not reconcile was never reported, was not reproducible from outside, and still counted toward the median
         and the success rate.

         WHICH CHECKS ARE ESSENTIAL was decided before this was written, in
         Handover temp/S5AA_ESSENTIAL_INVARIANTS_20260920.md, and the line is the engine's OWN: recordIssue()'s
         isInvariant() already treats these three as a distinct class with its own evidence budget. They are
         accounting and numerical identities, not financial outcomes -- no correct run can trip one -- which is
         what makes them safe to invalidate on. A DEPLETED HOUSEHOLD IS NOT ONE OF THEM: depletion is carried by
         `failed`, stays valid, and is the first of task 8.2's three failure policies.

         EACH PATH'S COLLECTOR IS SCANNED AND DROPPED INSIDE THE LOOP. Path 0 keeps the run-level collector, so its
         individual findings still reach the caller exactly as before; every later path gets a private array that
         is summarised and released before the next path runs. That is deliberate on two counts: the diagnostic
         stays ONE batch summary rather than N copies of the same finding, and a broad fault over a long batch
         cannot accumulate findings across paths -- which is how a faulted whole-corpus run in this repository once
         reached tens of gigabytes off-heap.

         THE PATH COUNT IS PRESERVED IN THE SUMMARY. A faulted path is never quietly dropped from the denominator;
         that is task 8.2's second failure policy, and `paths` versus `pathsAffected` is what records it. */
      var runs=[],invariantPaths=0,invariantFindings=0,invariantCodes={},firstAffectedPath=null,laterPathRothAge=null;
      for(var i=0;i<p.assumptions.runs;i++){
        var pathIssues=i===0?issues:[];
        runs.push(simulatePlan(p,rng(baseSeed+i*2),0,rng(baseSeed+i*2+1),pathIssues,serialized,scenarioInputGate));
        /* S5AA R23 (R22-01): only path 0 reports its own issues, so a Roth draw before 59 1/2 on a later path is carried up
           to the run -- once, at the owner's age on the first such path. Bracket notation for the record's field, as below. */
        if(i>0&&laterPathRothAge===null)for(var rk=0;rk<pathIssues.length;rk++){if(pathIssues[rk]&&pathIssues[rk].code==="UNSUPPORTED_ROTH_ORDERING"){laterPathRothAge=pathIssues[rk]["state"]["firstDrawOwnerAge"];break}}
        var foundHere=0;
        for(var k=0;k<pathIssues.length;k++){
          var pathCode=pathIssues[k]&&pathIssues[k].code;
          if(pathCode==="RECONCILIATION_MISMATCH"||pathCode==="NON_FINITE_ROW_VALUE"||pathCode==="NEGATIVE_ACCOUNT_BALANCE"){
            foundHere++;invariantCodes[pathCode]=(invariantCodes[pathCode]||0)+1;
          }else if(pathCode==="INVARIANT_FINDINGS_NOT_KEPT"){
            /* The bound's own counter: findings the collector could not keep are still counted, never lost.
               BRACKET NOTATION IS DELIBERATE, and recordIssue() above does the same thing for the same reason.
               tests/scenario-generator.test.js decides whether the engine "reads" a scenario field by searching
               this source for a dot followed by the field's last segment. The issue record's own field shares its
               last segment with profile's two-part one, which the generator declares intentionally fixed BECAUSE
               the engine never reads it -- so spelling it with a dot ANYWHERE here, comments included, makes that
               detector report a read that does not exist. Brackets keep it honest. Do not tidy this. */
            var overflowState=pathIssues[k]["state"];
            foundHere+=(overflowState&&overflowState.count)||0;
          }
        }
        if(foundHere>0){invariantPaths++;invariantFindings+=foundHere;if(firstAffectedPath===null)firstAffectedPath=i;}
      }
      if(laterPathRothAge!==null)noteEarlyRothDraw(issues,laterPathRothAge);
      var aggregated=aggregateMonteCarloRuns(runs);
      aggregated.issues=issues;
      if(invariantPaths>0){
        recordIssue(issues,"MONTE_CARLO_INVARIANT_FAILURE","ERROR",
          "An essential accounting or numerical invariant failed on "+invariantPaths+" of "+p.assumptions.runs+" simulated paths, so this batch's figures cannot be presented as the plan's result.",
          {paths:p.assumptions.runs,pathsAffected:invariantPaths,findings:invariantFindings,codes:invariantCodes,firstAffectedPath:firstAffectedPath});
        /* A MORE SPECIFIC DIAGNOSIS WINS. When the paths themselves already reported a calculation error -- a
           non-finite tax context, an exhausted history, a forced payoff -- aggregateMonteCarloRuns() has already
           invalidated the batch and carries a code that names the CAUSE. This summary names only the symptom
           (something did not reconcile), so it is recorded as evidence and does not overwrite the cause. The
           engine already prefers a specific code elsewhere: firstCalculationErrorCode() exists so an aggregate
           "carries at least one usable, specific" code rather than a generic one. */
        if(aggregated.calculationError)return aggregated;
        aggregated.calculationError=true;
        aggregated.calculationErrorCode="MONTE_CARLO_INVARIANT_FAILURE";
        return applyInvalidResultContract(aggregated,{
          label:"the batch contained paths whose accounting or numbers did not hold -- diagnostic, not the plan result",
          calculationErrorCode:"MONTE_CARLO_INVARIANT_FAILURE",
          paths:p.assumptions.runs,
          pathsAffected:invariantPaths
        });
      }
      return aggregated
    }

// --- Track A: simulation identity (PLATFORM_DEVELOPMENT_ROADMAP.md, Track A) ---
// A3 wants "every run reproducible from scenario+engine+data+seed version"
// attached to every Result. These are the version markers and the hash
// helpers that make that concrete; runScenario() below is the one entry
// point (A4) that attaches the identity so callers stop calling runPlan()
// directly. Everything here must stay top-level and closure-free like the
// rest of this file (see src/README.md) -- app-shell.html's
// buildWorkerSource() registers each of these individually.
var ENGINE_VERSION="1.0.0";
var SCENARIO_SCHEMA_VERSION=1;
var RESULT_SCHEMA_VERSION=1;
function generateScenarioId(){return Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10)}
/* CQ-6 R6 (S5 2n.4): buildSimulationIdentity() hashes the whole plan with
   this, including values clone()'s three arrays never see. Two of them stopped
   it: a cycle recursed until the stack overflowed, and JSON.stringify() refuses
   a BigInt. runPlan() accepts both (Q48's scope keeps a cycle outside those
   arrays running), so runScenario() threw after an "ok" run.
   A reference back to an ancestor is now written as ~cycle~, and a BigInt as
   its digits followed by n. JSON.stringify() produces neither token outside a
   string, so every value that hashed before hashes to the same text, and these
   now hash too. `ancestors` is internal; callers pass one argument. */
function stableStringify(value,ancestors){
  if(typeof value==="bigint")return value.toString()+"n";
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  var seen=ancestors||[];
  if(seen.indexOf(value)>=0)return "~cycle~";
  seen.push(value);
  var text;
  if(Array.isArray(value))text="["+value.map(function(item){return stableStringify(item,seen)}).join(",")+"]";
  else{var keys=Object.keys(value).sort();text="{"+keys.map(function(k){return JSON.stringify(k)+":"+stableStringify(value[k],seen)}).join(",")+"}"}
  seen.pop();
  return text;
}
function fastHash(str){
  // cyrb53 -- fast, well-distributed, non-cryptographic. This is provenance
  // (did the input or the embedded data package change?), not a security
  // boundary, so a synchronous 53-bit hash is the right tradeoff: it avoids
  // routing every calculation through async Web Crypto (which would ripple
  // into the Worker message contract and the same-thread fallback path)
  // for no real benefit here.
  var h1=0xdeadbeef^0,h2=0x41c6ce57^0;
  for(var i=0;i<str.length;i++){
    var ch=str.charCodeAt(i);
    h1=Math.imul(h1^ch,2654435761);
    h2=Math.imul(h2^ch,1597334677)
  }
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
  h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return (4294967296*(2097151&h2)+(h1>>>0)).toString(16)
}
function hashValue(value){return fastHash(stableStringify(value))}
function buildSimulationIdentity(p,result){
  return {
    scenarioId:p.id||null,
    runId:fastHash(Date.now()+":"+Math.random()+":"+(result&&result.rows?result.rows.length:0)),
    scenarioSchemaVersion:SCENARIO_SCHEMA_VERSION,
    resultSchemaVersion:RESULT_SCHEMA_VERSION,
    engineVersion:ENGINE_VERSION,
    // A5: RULES already carries its own version marker (meta.packageId,
    // e.g. "US-AZ-2026-v2") -- reuse it rather than inventing a parallel
    // constant. dataPackageHash covers the rest of the embedded data
    // (historical returns/inflation/COLA, account type table) that doesn't
    // have its own version field, so silent drift in any of it is still
    // detectable even though only RULES is human-versioned today.
    dataPackageVersion:(RULES&&RULES.meta&&RULES.meta.packageId)||null,
    dataPackageHash:hashValue({RULES:RULES,ACCOUNT_TYPES:ACCOUNT_TYPES,HIST_RETURNS:HIST_RETURNS,HIST_INFLATION:HIST_INFLATION,HIST_COLA:HIST_COLA}),
    simulationMode:p.assumptions.method,
    historicalPeriod:p.assumptions.method==="historical"?{start:p.assumptions.historyStart,rolling:!!p.assumptions.rollingHistory}:null,
    pathCount:p.assumptions.method==="monteCarlo"?p.assumptions.runs:1,
    randomSeed:p.assumptions.seed,
    inputHash:hashValue(p),
    featureFlags:{assetsOn:!!p.advanced.assetsOn,reserveOn:!!p.advanced.reserveOn,rmdOn:!!p.advanced.rmdOn,ltcOn:!!p.advanced.ltcOn,networthOn:!!p.advanced.networthOn,dividendOn:!!p.retirement.dividendOn,conversionOn:!!p.advanced.conversionOn,transferOn:!!p.advanced.transferOn,bondTentOn:!!p.advanced.bondTentOn,glideOn:!!p.advanced.glideOn,healthOn:!!p.advanced.healthOn}
  }
}
// A4: the one runScenario(scenario) -> result entry point. Same shape as
// runPlan()'s return value (every existing field stays top-level) plus an
// attached `identity` -- non-breaking for every current caller/test that
// reads result.rows/result.successRate/etc., additive for anything that
// wants provenance.
/* Q48: an input rejected as NONSERIALIZABLE_INPUT has no identity to build.
   buildSimulationIdentity() hashes the whole plan (inputHash: hashValue(p)),
   and stableStringify recursed with no cycle check (until S5 2n.4) -- so after runPlan() had
   correctly returned the rejection, this line overflowed the stack on the
   same cycle, and the generated Worker (which calls runScenario, not
   runPlan) posted RangeError instead of the result. Measured; the
   main-thread runPlan() witnesses could not see it.

   Narrowed to this one rejection on purpose. Making the identity hash
   cycle-safe would touch the fingerprint every captured result carries, and
   nothing about that fingerprint is Q48's to change. */
/* S5R-01: the gate runs once here and its result goes to runPlan(), so a supported hook runs once; the identity
   fingerprints the data the simulation executed (the snapshot before defaults, which for a plan without hooks is the
   plan itself), and there is none for an input that could not be serialized or read. */
function runScenario(p){var gate=scenarioInputGate(p),result=runPlan(p,gate,scenarioInputGate);/* S5AA 1.1, Q100: a scenario missing a required section has no identity to build --
   buildSimulationIdentity() reads p.retirement.dividendOn, so it threw the very TypeError the new gate exists to
   prevent, one line after the gate had correctly refused. It joins the two refusals that already skip identity. */
result.identity=result.calculationErrorCode==="SCENARIO_NONSERIALIZABLE_INPUT"||result.calculationErrorCode==="SCENARIO_UNREADABLE_INPUT"||result.calculationErrorCode==="SCENARIO_MISSING_SCENARIO_SECTION"?null:buildSimulationIdentity((gate.code?p:gate.identityPlan),result);return result}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RESULT_CONTRACT_VERSION,
    ACCOUNT_TYPES,
    HIST_RETURNS,
    HIST_INFLATION,
    HIST_COLA,
    clone,
    money,
    clamp,
    sum,
    taxClassBalance,
    totalBalance,
    /* RC-01: exported so a test can ask directly whether the required-
       distribution reservation binds, rather than inferring it from a row. */
    preTaxConvertible,
    conversionCapacityGroups,
    accountConvertible,
    rmdProtectedAmounts,
    employerMatchIsRoth,
    employerMatchDestination,
    hsaQualifiedShare,
    hsaIncludibleShare,
    accountOwnerAge,
    hsaAdditionalTaxRate,
    hsaDrawIsFullyQualified,
    conversionRoutes,
    convertPreTaxToRoth,
    accountType,
    debtTotal,
    accountPlannedContribution,
    contributionLimit,
    rothPhaseoutFactor,
    auditContributions,
    /* S5 task 11: ACCOUNT section 7.4's Roth catch-up facts and wage test for one workplace account. */
    rothCatchupStatus,
    ownerContributionEligibility,
    ownerContributionWindow,
    householdWorkDurations,
    marginalTax,
    capitalGainsTax,
    marginalRateAt,
    capitalGainsMarginalRateAt,
    taxableSocialSecurity,
    seniorDeduction,
    additionalStandardDeduction,
    iraDeductionPhaseoutRange,
    iraDeductibleAmount,
    iraPhaseoutLimit,
    rothContributionLimit,
    form8606Basis,
    iraNontaxableFraction,
    iraPoolFor,
    iraBasisFractionFor,
    iraPoolsAtStart,
    iraBasisRecoveredFor,
    spendIraBasis,
    accountSuccessionClass,
    taxConfigForFilingStatus,
    householdSurvivorship,
    householdFilingFor,
    householdSeniorAges,
    householdSeniorAgesAtClose,
    ageAmountAges,
    estimateTaxes,
    /* S5 task 9: TAX section 7.3's recomputed marginal rate. runPlan() does not call it. */
    effectiveMarginalRate,
    pwaMaxZero,
    pwaMin,
    finiteBracketCaps,
    nearestCapAbove,
    taxSegmentLocal,
    solveSegmentFunding,
    earlyWithdrawalPenaltyRate,
    unknownMethodCode,
    nobodyAliveAtStartCode,
    lastDeathCutAge,
    lawfulConversionDestination,
    transferIntoWorkplaceRefused,
    transferBetweenOwnersRefused,
    transferIraIntoWorkplace,
    transferIsContribution,
    transferCountsTowardRmd,
    transferIsHsaFunding,
    orderedAccountsInClass,nextWithdrawAccount,withdrawalComparator,retainedCashFirst,
    quoteRowAge,
    verifyQuoteObligation,
    requireFiniteOrAbsent,
    isFiniteNumberValue,
    nonFiniteScenarioInputCode,
    nonSerializableScenarioInputCode,
    nonArrayListInputCode,
    canonicalWithdrawalStrategy,
    nonFiniteQuoteInputCode,
    verifyCashSettlement,
    verifyCommittedCashSettlement,
    quoteTaxFunding,
    ssaBenefitAtClaim,
    ssColaRates,
    ssFloorDime,
    ssFloorDollar,
    ssPiaBase,
    ssClaimFactor,
    ssPiaAt,
    ssSpousalFactor,
    ssSurvivorMonthly,
    irmaaMonthly,
    rng,
    normal,
    accountExpected,
    accountGlideWeights,
    accountVolatility,
    rmdStartAge,
    optimizedAccountScore,
    smartWithdrawalOrder,
    withdrawFromAccountList,
    withdrawFromClass,
    projectDebts,
    growOtherAssets,
    drawFromOtherAssets,
    moveFunds,
    retainExcessRmdCash,
    rmdFor,
    rmdObligations,
    historyIndex,
    growthFromCola,
    householdSocialSecurityForPeriod,
    householdSocialSecurityDetail,
    survivorFullRetirementAge,
    survivorReductionFactor,
    survivorStartAge,
    ssFullRetirementAge,
    ssBirthYear,
    ssFraForBirthYear,
    ssEarningsTestBand,
    ssEarningsTestWithholding,
    applyStage,
    eventAmount,
    strategySpending,
    otherIncomeFor,
    payOwnDividends,dividendEligibleAccounts,recordIraFlow,settleIraYear,
    accountReturnForPeriod,
    growAccounts,
    recordIssue,
    checkRowInvariants,
    simulatePlan,
    quantile,
    firstCalculationErrorCode,
    classifyHistoricalCell,
    applyInvalidResultContract,
    aggregateMonteCarloRuns,
    runPlan,
    ENGINE_VERSION,
    SCENARIO_SCHEMA_VERSION,
    RESULT_SCHEMA_VERSION,
    generateScenarioId,
    stableStringify,
    fastHash,
    hashValue,
    buildSimulationIdentity,
    runScenario
  };
}
