const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
let glass=false,reduced=false,gpuAvailable=true,contexts=0,releases=0,disconnects=0,removed=0,nextFrame=0;
const frames=new Map(),listeners=new Map(),canvases=[];
const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,
  getExtension:()=>({loseContext(){releases++;}})}, {get(target,key){return target[key]||(()=>({}));}});
const video={readyState:0,videoWidth:0};
const app={prepend(canvas){canvases.push(canvas);},getBoundingClientRect:()=>({width:0,height:0}),
  addEventListener(){},removeEventListener(){}};
function canvas(){return {width:0,height:0,setAttribute(){},addEventListener(){},removeEventListener(){},
  getContext(kind){if(kind==='webgl'){contexts++;return gpuAvailable?gl:null;}return {};},
  remove(){removed++;const index=canvases.indexOf(this);if(index>=0)canvases.splice(index,1);}};}
const context=vm.createContext({console,window:{},
  document:{hidden:false,body:{classList:{contains:n=>n==='theme-glass'&&glass}},
    getElementById:id=>id==='app'?app:video,createElement:canvas,addEventListener(){},removeEventListener(){}},
  matchMedia:()=>({matches:reduced,addEventListener(){},removeEventListener(){}}),
  ResizeObserver:class{observe(){}disconnect(){disconnects++;}},
  MutationObserver:class{observe(){}disconnect(){disconnects++;}},
  requestAnimationFrame(fn){frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame(id){frames.delete(id);},
  addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);}});
vm.runInContext(fs.readFileSync('glass.js','utf8'),context);
const renderer=context.window.GlassRenderer;
assert.equal(contexts,0,'loading the module alone allocates no GPU context');
renderer.start();assert.equal(contexts,0,'Lite never starts glass rendering');
glass=true;renderer.start();
assert.equal(renderer.active(),true);assert.equal(contexts,1);assert.equal(canvases.length,1);
assert.equal(frames.size,1,'static scene requests one render, not a permanent loop');
renderer.start();assert.equal(contexts,1,'repeated start is idempotent');
const [id,paint]=[...frames][0];frames.delete(id);paint();
assert.equal(frames.size,0,'idle renderer schedules no more frames');
renderer.stop();assert.equal(renderer.active(),false);assert.equal(canvases.length,0);
assert.equal(releases,1,'Lite releases the GPU context');assert.equal(disconnects,3,'all observers are disconnected');
assert.equal(listeners.size,0,'window listeners are removed');
renderer.stop();assert.equal(releases,1,'repeated stop is harmless');
renderer.start();assert.equal(contexts,2,'Glass can restart after Lite');renderer.stop();
reduced=true;renderer.start();assert.equal(contexts,2,'reduced transparency avoids GPU allocation');
reduced=false;gpuAvailable=false;renderer.start();assert.equal(renderer.active(),false,'unsupported WebGL retains CSS-only fallback');
assert.equal(canvases.length,0);
console.log('Passed: optional Glass start/stop, repeated toggles, no idle render loop, GPU/observer/listener cleanup, reduced-transparency and unsupported-WebGL fallback.');
