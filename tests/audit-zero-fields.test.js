'use strict';
// Focused zero-value regressions. No full projections or Monte Carlo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const engine = require('../src/engine.js');
const golden = require('./lib/golden-scenario-defs.js');
const shell = fs.readFileSync(path.join(__dirname, '../src/app-shell.html'), 'utf8');
const defaults = golden.extractDefaultPlan(shell);
function spend(strategy, fields) {
  const p = structuredClone(defaults);
  Object.assign(p.profile, {age:65, endAge:95, spouseOn:false});
  Object.assign(p.assumptions, {returnRate:0, inflation:0, fee:0});
  Object.assign(p.retirement, {strategy, stages:[], flexibility:0, survivor:false, vpwMinRate:0, rmdFloor:0}, fields);
  return engine.strategySpending(p,65,310000,310000,null,0,1,0);
}
test('ZERO-01: explicit zero VPW maximum permits no base withdrawal', () => {
  assert.equal(spend('vpw',{vpwMaxRate:0}),0);
});
test('ZERO-02: zero RMD-strategy multiplier leaves only the chosen floor', () => {
  assert.equal(spend('rmd',{rmdMultiplier:0}),0);
  assert.equal(spend('rmd',{rmdMultiplier:0,rmdFloor:2500}),2500);
});
test('withdrawal defaults and ordinary nonzero settings remain intact', () => {
  /* RE-FIXTURED at the R11 round (external audit, R10-01): the divisor is the remaining modelled duration, 95 - 65 =
     30 years, where it was 31. $310,000 over 30 years is $10,333.33; the rate cap at 1% is unchanged. */
  const base = 310000/30;
  assert.equal(spend('vpw',{vpwMaxRate:undefined}),base);
  assert.equal(spend('rmd',{rmdMultiplier:undefined}),base);
  assert.equal(spend('vpw',{vpwMaxRate:1}),3100);
  assert.equal(spend('rmd',{rmdMultiplier:50}),base/2);
  for (const v of [null,NaN,'bad']) {
    assert.equal(spend('vpw',{vpwMaxRate:v}),base);
    assert.equal(spend('rmd',{rmdMultiplier:v}),base);
  }
});
function line(name) {
  const found=shell.split('\n').find(s=>s.trimStart().startsWith('function '+name+'('));
  assert.ok(found,'missing live function '+name);return found;
}
function normalizer() {
  const types=shell.slice(shell.indexOf('var OTHER_ASSET_TYPES='),shell.indexOf('var defaultPlan='));
  const context=vm.createContext({defaultPlan:structuredClone(defaults),clone:structuredClone,
    accountType:engine.accountType,generateScenarioId:()=> 'zero-test',SCENARIO_SCHEMA_VERSION:engine.SCENARIO_SCHEMA_VERSION});
  vm.runInContext(types+'\n'+['uid','normalizeAccount','normalizeOtherAsset','normalizeDebt','normalizedPlan'].map(line).join('\n'),context);
  return input=>context.normalizedPlan(input);
}
test('ZERO-03: legacy zero home growth stays zero and the home stays flat', () => {
  const normalize=normalizer();
  const p=normalize({advanced:{home:100000,homeGrowth:0}});
  const home=p.advanced.otherAssets[0];assert.equal(home.growth,0);
  engine.growOtherAssets([home],1);assert.equal(home.value,100000);
  assert.equal(normalize(p).advanced.otherAssets.length,1);
});
test('legacy missing and nonzero home growth retain existing behavior', () => {
  const normalize=normalizer();
  assert.equal(normalize({advanced:{home:100000}}).advanced.otherAssets[0].growth,3);
  for(const value of [-2,4])assert.equal(normalize({advanced:{home:100000,homeGrowth:value}}).advanced.otherAssets[0].growth,value);
});
function slider() {
  const dom=new JSDOM('<div id="root"><input type="number" value="0"></div>',{runScripts:'outside-only'});
  const w=dom.window;w.root=w.document.getElementById('root');w.clamp=engine.clamp;
  // Evaluate actual DOM functions; rangeValue is introduced by this repair.
  const names=['addRange','refreshProtectedValues'];
  if(shell.includes('function rangeValue('))names.unshift('rangeValue');
  w.eval(names.map(line).join('\n'));
  const input=w.root.querySelector('input');w.addRange(input,-5,20,.1);
  return {w,input,range:input._v2Range,close:()=>w.close()};
}
test('ZERO-04: initial zero return slider matches its numeric field', () => {
  const s=slider();try{assert.equal(s.range.value,'0');}finally{s.close();}
});
test('ZERO-04: input and scenario-refresh preserve zero slider position', () => {
  const s=slider();try{
    s.input.value='5';s.input.dispatchEvent(new s.w.Event('input'));
    assert.equal(s.range.value,'5');
    s.input.value='0';s.input.dispatchEvent(new s.w.Event('input'));
    assert.equal(s.range.value,'0');
    s.range.value='8';s.w.refreshProtectedValues();assert.equal(s.range.value,'0');
  }finally{s.close();}
});
test('slider retains negative values and bounds, and tolerates empty input', () => {
  const s=slider();try{
    for(const [value,expected] of [['-2','-2'],['30','20']]){
      s.input.value=value;s.input.dispatchEvent(new s.w.Event('input'));assert.equal(s.range.value,expected);
    }
    s.input.value='';s.w.refreshProtectedValues();assert.equal(s.range.value,'-5');
  }finally{s.close();}
});
test('S3 revolving zero balance, APR, minimum, floor and extra remain meaningful', () => {
  const {revolvingProjection}=require('../src/debt-revolving.js');
  assert.equal(revolvingProjection({balance:0}).payoffMonth,0);
  const flat=revolvingProjection({balance:120,annualRatePct:0,minimumPercentOfBalance:0,minimumDollarFloor:0,additionalMonthlyPayment:0,maxMonths:12});
  assert.equal(flat.totalPaid,0);assert.equal(flat.totalInterest,0);assert.equal(flat.schedule.at(-1).balance,120);assert.equal(flat.retired,false);
  const paid=revolvingProjection({balance:120,annualRatePct:0,minimumPercentOfBalance:0,minimumDollarFloor:10,maxMonths:12});
  assert.equal(paid.payoffMonth,12);assert.equal(paid.totalInterest,0);
});
test('S3 zero comparison amount leaves each applicable method unchanged', () => {
  const mvi=require('../src/mortgage-vs-investing.js');
  const p={accounts:[{taxClass:'taxable',balance:100,contribution:0}],advanced:{debts:[{type:'mortgage',balance:100,rate:0,paymentMonthly:10,remainingTermYears:1}]}};
  for(const method of mvi.METHODS){const r=mvi.applyMethod(p,method,0);assert.equal(r.applicable,true);assert.deepEqual(r.plan,p);assert.deepEqual(r.changedPaths,[]);}
});
test('zero spending policies survive the actual generated Worker source', async () => {
  const helper=require('./lib/worker-source.js');
  try {
    for (const strategy of ['vpw','rmd']) {
      const p=golden.buildScenario(defaults);
      Object.assign(p.profile,{age:65,retireAge:65,endAge:66,spouseOn:false});
      Object.assign(p.employment,{salary:0,spouseSalary:0});
      Object.assign(p.assumptions,{method:'simple',returnRate:0,inflation:0,fee:0});
      Object.assign(p.retirement,{strategy,vpwMaxRate:0,vpwMinRate:0,rmdMultiplier:0,rmdFloor:0,
        ssBenefit:0,pension:0,dividendOn:true,dividendYield:0,flexibility:0});
      p.accounts=[Object.assign(p.accounts[0],{balance:310000,contribution:0,basisPct:100})];
      const r=await helper.runPlanThroughLiveWorker(p);
      assert.equal(r.status,'ok');assert.equal(r.rows[1].spending,0);assert.equal(r.rows[1].total,310000);
    }
  } finally { helper.cleanup(); }
});
