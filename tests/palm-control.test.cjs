const fs=require('node:fs'), vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({console});
vm.runInContext(fs.readFileSync('palm-control.js','utf8'),ctx);
const P=vm.runInContext('PalmInput',ctx);
function hand(x,open=true,scale=1) {
  const points=Array.from({length:21},()=>({x:1-x,y:.6}));
  points[0]={x:1-x,y:.8};
  for(let i=0;i<4;i++) {
    const base=5+i*4,px=1-x+(i-1.5)*.06*scale;
    points[base]={x:px,y:.6};points[base+1]={x:px,y:.5};points[base+2]={x:px,y:.4};points[base+3]={x:px,y:open?.2:.7};
  }
  return points;
}
const left=hand(.28),right=hand(.72);
assert.equal(P.describe(left).side,'left','mirrored preview maps to screen left');
assert.equal(P.describe(right).side,'right');
assert.equal(P.describe(left).open,true);
assert.equal(P.describe(hand(.3,false)).open,false);
const state=P.createState();
const tick=(hands,t,enabled=true)=>P.step(state,hands,t,enabled);
assert.ok(!tick([left],0).answer,'raised hand on entry cannot submit');
tick([],10);tick([],400);
tick([left],450);tick([left],850);
assert.equal(tick([left],1250).answer,'left','fresh continuous hold submits');
assert.ok(!tick([left],1700).answer,'held hand cannot repeat on next question');
tick([],1800);tick([],2200);tick([right],2300);
tick([left],2600);
assert.ok(!tick([left],3000).answer,'switching sides restarts hold');
assert.equal(tick([left],3400).answer,'left');
tick([],3500);tick([],3900);tick([left],4000);
assert.ok(!tick([left],5000).answer,'stale gap resets hold');
tick([left,right],5100);assert.equal(state.latched,true,'multiple hands require release');
assert.ok(!tick([left],5600).answer);
tick([],5700);tick([],6100);tick([left],6200);
tick([left],6600,false);assert.equal(state.latched,true,'blocked or hidden play disarms');
assert.ok(!tick([left],7100).answer);
assert.equal(P.describe(hand(.3,true,.1)).eligible,false,'small background hands ignored');
assert.equal(P.describe(hand(.98)).eligible,false,'hands outside guide ignored');
console.log('Passed: palm position, open-hand gate, deliberate hold, release-to-rearm, side changes, stale frames, multiple hands and blocked play.');

for (const holdMs of [400,600,800,1000,1500,2000,3000]) {
  const custom=P.createState();
  P.step(custom,[],0,true,holdMs); P.step(custom,[],350,true,holdMs);
  for(let elapsed=0;elapsed<holdMs;elapsed+=100) {
    const result=P.step(custom,[left],400+elapsed,true,holdMs);
    assert.ok(!result.answer,`${holdMs}ms must not confirm early`);
    assert.equal(result.ratio,elapsed/holdMs,'progress uses chosen duration');
  }
  assert.equal(P.step(custom,[left],400+holdMs,true,holdMs).answer,'left');
}
console.log('Passed: all seven palm hold durations and proportional progress.');

// Realistic size changes scale both dimensions around the palm centre.
function resized(points, scale) {
  return points.map(p=>({x:.7+(p.x-.7)*scale,y:.6+(p.y-.6)*scale}));
}
assert.equal(P.describe(resized(left,.35)).eligible,true,'upright palm below old 10% width threshold is accepted');
assert.equal(P.describe(resized(left,.1)).eligible,false,'genuinely small background palms remain excluded');
function armed() {
  const s=P.createState();P.step(s,[],0,true);P.step(s,[],350,true);return s;
}
const dropout=armed();
P.step(dropout,[left],400,true);P.step(dropout,[left],600,true);
assert.equal(P.step(dropout,[],650,true).ratio,.25,'brief loss keeps progress');
assert.equal(P.step(dropout,[left],750,true).ratio,.25,'recovery does not count missing time');
assert.equal(P.step(dropout,[left],950,true).ratio,.5);
assert.ok(!P.step(dropout,[],1000,true).answer,'missing frame cannot submit');
assert.equal(P.step(dropout,[left],1250,true).ratio,0,'late recovery restarts hold even without another missing frame');
const expired=armed();
P.step(expired,[left],400,true);P.step(expired,[left],600,true);
assert.equal(P.step(expired,[],850,true).ratio,0,'long loss clears progress');
const boundary=armed();
P.step(boundary,[hand(.43)],400,true);P.step(boundary,[hand(.43)],600,true);
assert.equal(P.step(boundary,[hand(.46)],700,true).ratio,.375,'small boundary movement preserves hold');
assert.equal(P.step(boundary,[right],800,true).ratio,0,'crossing to other answer restarts hold');
const repeated=armed();
for(let t=400;t<=1200;t+=100) P.step(repeated,[left],t,true);
P.step(repeated,[],1250,true);
assert.ok(!P.step(repeated,[left],1350,true).answer,'brief loss after selection does not rearm');
assert.equal(repeated.latched,true);
const feedback=armed();
assert.match(P.step(feedback,[resized(left,.1)],400,true).status,/too small/);
assert.match(P.step(feedback,[hand(.98)],500,true).status,/inside a dashed guide/);
console.log('Passed: smaller upright palms, background rejection, paused dropouts, recovery timeout, boundary jitter, repeat prevention and specific feedback.');
