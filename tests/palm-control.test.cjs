const fs=require('node:fs'), vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({console});
const source=fs.readFileSync('palm-control.js','utf8');
vm.runInContext(source,ctx);
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
// The bundled legacy model sees raw, unmirrored video: its labels must be swapped.
const physicalLeft={label:'Right',score:.95},physicalRight={label:'Left',score:.95};
const leftPosition=hand(.28), rightPosition=hand(.72);
assert.equal(P.sideFromHandedness(physicalLeft),'left');
assert.equal(P.sideFromHandedness(physicalRight),'right');
assert.equal(P.sideFromHandedness({label:'Left',score:.49}),null);
assert.equal(P.sideFromHandedness({label:'Left'}),null);
assert.equal(P.sideFromHandedness({label:'Unknown',score:.9}),null);
assert.equal(P.describe(leftPosition,16/9,physicalRight).side,'right','identity overrides screen position');
assert.equal(P.describe(rightPosition,16/9,physicalLeft).side,'left','crossed hand keeps physical identity');
assert.equal(P.describe(hand(.5),16/9,physicalLeft).eligible,true,'centre needs no guide');
assert.equal(P.describe(hand(.98),16/9,physicalRight).eligible,true,'edge needs no guide');
assert.equal(P.describe(leftPosition).side,null,'never guess identity from position');
assert.equal(P.describe(hand(.3,false)).open,false);
assert.equal(P.describe([]),null);

const state=P.createState();
const tick=(hands,labels,t,enabled=true)=>P.step(state,hands,labels,t,enabled);
assert.ok(!tick([leftPosition],[physicalRight],0).answer,'one classified frame cannot answer');
assert.equal(tick([leftPosition],[physicalRight],1).answer,'right','two consistent frames answer');
assert.ok(!tick([leftPosition],[physicalRight],2).answer,'continuous palm cannot repeat');
assert.ok(!tick([rightPosition],[physicalLeft],2).answer,'switching identity without release cannot repeat');
tick([],[],3);
assert.ok(!tick([rightPosition],[physicalLeft],4).answer,'one empty frame cannot rearm');
tick([],[],5);tick([],[],6);
assert.ok(!tick([rightPosition],[physicalLeft],7).answer);
assert.equal(tick([rightPosition],[physicalLeft],8).answer,'left','two clear frames rearm');
tick([hand(.3,false)],[physicalLeft],5);
tick([hand(.3,false)],[physicalLeft],6);
assert.ok(!tick([hand(.5)],[physicalLeft],7).answer);
assert.equal(tick([hand(.5)],[physicalLeft],8).answer,'left','closing then opening rearms');
assert.ok(!tick([leftPosition],[physicalLeft],10000).answer,'a time gap alone never rearms a held palm');
tick([leftPosition],[physicalLeft],10001,false);
assert.ok(!tick([leftPosition],[physicalLeft],10002).answer,'blocked question cannot carry a raised palm forward');
tick([],[],10003,false);
tick([],[],10004,false);
assert.ok(!tick([leftPosition],[physicalLeft],10005).answer);
assert.equal(tick([leftPosition],[physicalLeft],10006).answer,'left','release during feedback readies next question');

const uncertain=P.createState();
assert.ok(!P.step(uncertain,[leftPosition],[],0,true).answer,'missing handedness cannot submit');
assert.ok(!P.step(uncertain,[leftPosition],[{label:'Right',score:.4}],1,true).answer);
assert.ok(!P.step(uncertain,[leftPosition],[physicalLeft],2,true).answer);
assert.equal(P.step(uncertain,[leftPosition],[physicalLeft],3,true).answer,'left');
const multiple=P.createState();
assert.ok(!P.step(multiple,[leftPosition,rightPosition],[physicalLeft,physicalRight],0,true).answer,'two open palms are ambiguous');
assert.ok(!P.step(multiple,[rightPosition],[physicalRight],1,true).answer);
assert.equal(P.step(multiple,[rightPosition],[physicalRight],2,true).answer,'right');
const closedOther=P.createState();
P.step(closedOther,[leftPosition,hand(.72,false)],[physicalLeft,physicalRight],0,true);
assert.equal(P.step(closedOther,[leftPosition,hand(.72,false)],[physicalLeft,physicalRight],1,true).answer,'left','closed other hand does not block the answer');
const flicker=P.createState();
assert.ok(!P.step(flicker,[leftPosition],[physicalRight],0,true).answer);
assert.ok(!P.step(flicker,[leftPosition],[physicalLeft],1,true).answer,'one flipped label cannot submit');
assert.ok(!P.step(flicker,[leftPosition],[physicalRight],2,true).answer);
assert.equal(P.step(flicker,[leftPosition],[physicalRight],3,true).answer,'right');
function resized(points,scale) { return points.map(p=>({x:.7+(p.x-.7)*scale,y:.6+(p.y-.6)*scale})); }
assert.equal(P.describe(resized(leftPosition,.35)).eligible,true,'narrow upright palms qualify');
assert.equal(P.describe(resized(leftPosition,.1)).eligible,false,'tiny background hands stay excluded');
assert.match(P.step(P.createState(),[resized(leftPosition,.1)],[physicalLeft],0,true).status,/too small/);
console.log('Passed: immediate physical left/right selection, mirrored label correction, crossed/central/edge hands, release without dwell, repeat prevention, blocked play, uncertainty and multiple hands.');

// Exercise the actual MediaPipe result adapter and frame scheduler with fake camera output.
const draw={clearRect(){},save(){},restore(){},translate(){},scale(){},drawImage(){},fillRect(){},fillText(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){}};
const frames=new Map(),timeouts=new Map(),cancelled=[];
let nextId=1, sends=0, inFlight=0,maxInFlight=0;
const video={videoWidth:1280,videoHeight:720,
  requestVideoFrameCallback(fn){const id=nextId++;frames.set(id,fn);return id;},
  cancelVideoFrameCallback(id){cancelled.push(id);frames.delete(id);}};
const nodes={camera:video,palmPreview:{width:320,height:180,getContext:()=>draw},palmStatus:{textContent:''}};
Object.assign(ctx,{$:id=>nodes[id],stream:{},controlMode:()=> 'palms',document:{hidden:false},
  palmControlContext:()=>ctx.phase==='idle'||ctx.document.hidden?null:ctx.phase, handlePalmAction:side=>answers.push(side),
  performance:{now:()=> 1000},phase:'play',round:{answered:false},isPlayBlocked:()=>false,
  setCharge(){},clearCharge(){},HAND_CONNECTIONS:[],answer:side=>answers.push(side),
  setTimeout(fn,delay){const id=nextId++;timeouts.set(id,{fn,delay});return id;},clearTimeout(id){timeouts.delete(id);}});
const answers=[];
vm.runInContext('palmRequestGeneration=palmGeneration;',ctx);
ctx.results={multiHandLandmarks:[leftPosition],multiHandedness:[physicalRight],image:{}};
vm.runInContext('handlePalmResults(results);',ctx);
vm.runInContext('handlePalmResults(results);',ctx);
assert.deepEqual(answers,['right'],'result adapter uses handedness rather than position or saved duration');
assert.equal(answers.length,1);
ctx.results={multiHandLandmarks:[],multiHandedness:[],image:{}};
vm.runInContext('handlePalmResults(results);',ctx);
vm.runInContext('handlePalmResults(results);',ctx);
ctx.results={multiHandLandmarks:[rightPosition],multiHandedness:[physicalLeft],image:{}};
vm.runInContext('handlePalmResults(results);',ctx);
vm.runInContext('handlePalmResults(results);',ctx);
assert.deepEqual(answers,['right','left']);
vm.runInContext('palmRequestGeneration=palmGeneration-1;handlePalmResults(results);',ctx);
assert.equal(answers.length,2,'stale camera-generation output is ignored');
ctx.fakeEngine={async send(){sends++;inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);await Promise.resolve();inFlight--;}};
(async()=>{
  vm.runInContext('palmEngine=fakeEngine;schedulePalmTick();schedulePalmTick();',ctx);
  assert.equal(frames.size,1,'one pending camera-frame callback');
  assert.equal(timeouts.size,0,'no inference throttle');
  const [id,fn]=[...frames][0];frames.delete(id);await fn();
  assert.equal(sends,1);assert.equal(maxInFlight,1);
  assert.equal(frames.size,1,'ready for the very next fresh video frame');
  vm.runInContext('stopPalmLoop();',ctx);
  assert.equal(frames.size,0,'stopping camera cancels pending video callback');
  assert.equal(cancelled.length,1);
  delete video.requestVideoFrameCallback;
  vm.runInContext('schedulePalmTick();',ctx);
  assert.equal([...timeouts.values()][0].delay,0,'fallback has no added delay');
  vm.runInContext('stopPalmLoop();',ctx);
  assert.equal(timeouts.size,0,'fallback callback is cancelled too');
  ctx.document.hidden=true;
  vm.runInContext('schedulePalmTick();',ctx);
  assert.equal(timeouts.size,0,'hidden tabs have no palm polling timer');
  ctx.document.hidden=false;ctx.phase='idle';
  vm.runInContext('schedulePalmTick();',ctx);
  assert.equal(timeouts.size,0,'idle screens have no palm polling timer');
  ctx.phase='play';ctx.round.answered=true;
  vm.runInContext('palmState.latched=false;schedulePalmTick();',ctx);
  assert.equal(timeouts.size,0,'feedback stops inference once the hand is released');
  ctx.round.answered=false;
  vm.runInContext('schedulePalmTick();',ctx);
  assert.equal(timeouts.size,1,'next question resumes instant inference');
  ctx.document.hidden=true;
  vm.runInContext('syncPalmLoop();',ctx);
  assert.equal(timeouts.size,0,'visibility change cancels a pending inference callback');
  assert.equal(vm.runInContext('palmState.latched',ctx),true,'resume requires a fresh palm after hidden/blocked play');
  console.log('Passed: hidden/idle/feedback work suspension, next-question resume and fresh-gesture gating.');
  console.log('Passed: result-to-answer wiring, stale-result rejection, fresh-frame scheduling, no artificial inference delay, serialized inference and callback cancellation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
