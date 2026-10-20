"use strict";
// MediaPipe Hands 0.4.1675469240; landmarks are mirrored to match the preview.
const PalmInput = (() => {
  const RELEASE_MS = 350, MAX_GAP_MS = 600;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function describe(points) {
    if (points?.length !== 21 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
    const centre = [0,5,9,13,17].reduce((sum, i) => ({x:sum.x+points[i].x/5,y:sum.y+points[i].y/5}),{x:0,y:0});
    const x = 1 - centre.x, y = centre.y;
    const span = Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x));
    const open = [8,12,16,20].filter(tip => distance(points[tip],points[0]) > distance(points[tip-2],points[0])*1.18).length >= 3;
    return {points,x,y,open,eligible:span >= .10 && x >= .08 && x <= .92 && y >= .08 && y <= .92,
      side:x < .44 ? 'left' : x > .56 ? 'right' : null};
  }
  function createState() { return {side:null,since:null,lastAt:null,latched:true,releaseAt:null}; }
  function step(state, hands, now, enabled, holdMs = 800) {
    const duration = Number.isFinite(holdMs) ? Math.max(400, Math.min(3000, holdMs)) : 800;
    const active = hands.map(describe).filter(h => h?.eligible);
    if (!enabled || (state.lastAt !== null && now-state.lastAt > MAX_GAP_MS)) {
      state.side=null; state.since=null; state.releaseAt=null;
      if (!enabled) state.latched=true;
    }
    state.lastAt=now;
    if (!enabled) return {status:'Ready · lower your hand before each answer',ratio:0};
    if (!active.length) {
      state.side=null; state.since=null;
      if (state.releaseAt===null) state.releaseAt=now;
      if (now-state.releaseAt>=RELEASE_MS) state.latched=false;
      return {status:hands.length?'Move one hand into the guide':'No hand · raise one open palm',ratio:0};
    }
    state.releaseAt=null;
    if (active.length!==1) {
      state.side=null;state.since=null;state.latched=true;
      return {status:'Multiple hands · lower them, then use one hand',ratio:0};
    }
    const hand=active[0];
    if (state.latched) return {status:'Hand detected · lower it to reset',hand,ratio:0};
    if (!hand.open || !hand.side) {
      state.side=null;state.since=null;
      return {status:!hand.open?'Hand detected · open your fingers':'Hand detected · move left or right',hand,ratio:0};
    }
    if (state.side!==hand.side || state.since===null) {state.side=hand.side;state.since=now;}
    const ratio=Math.min(1,(now-state.since)/duration);
    if (ratio>=1) {state.latched=true;state.side=null;state.since=null;}
    return {status:ratio>=1?'Answer selected · lower your hand':`Open palm · hold ${hand.side} ${Math.round(ratio*100)}%`,hand,ratio,answer:ratio>=1?hand.side:null};
  }
  return {describe,createState,step};
})();

let palmEngine=null, palmLoading=null, palmTimer=null, palmBusy=false, palmFailed=false;
let palmState=PalmInput.createState();
let palmGeneration=0, palmRequestGeneration=-1;
function palmStatus(text) { const el=$("palmStatus"); if(el.textContent!==text) el.textContent=text; }
function resetPalm() { palmState=PalmInput.createState(); if(typeof clearCharge==='function') clearCharge(); }
function stopPalmLoop() {
  palmGeneration+=1;
  if(palmTimer) clearTimeout(palmTimer);
  palmTimer=null;
  resetPalm();
  const canvas=$("palmPreview"); canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  palmStatus('Camera off · use ENABLE CAMERA above, or tap an answer');
}
async function ensurePalmLoop() {
  if(!stream || controlMode()!=='palms' || palmFailed) return;
  if(!palmEngine) {
    if(!palmLoading) {
      palmStatus('Loading hand tracking…');
      palmLoading=(async()=>{
        const engine=new Hands({locateFile:file=>`vendor/hands/${file}`});
        engine.setOptions({maxNumHands:4,modelComplexity:0,minDetectionConfidence:.65,minTrackingConfidence:.65,selfieMode:false});
        engine.onResults(handlePalmResults);
        await engine.initialize();
        palmEngine=engine;
      })().catch(error=>{
        palmFailed=true;console.warn('Hand tracking unavailable',error);
        palmStatus('Hand tracking unavailable · use buttons or arrow keys');
      }).finally(()=>{palmLoading=null;});
    }
    await palmLoading;
  }
  if(palmEngine && stream && controlMode()==='palms' && !palmBusy && !palmTimer) palmTimer=setTimeout(palmTick,40);
}
async function palmTick() {
  palmTimer=null;
  if(!stream || controlMode()!=='palms' || palmBusy) return;
  if(document.hidden || !["play","countdown"].includes(phase)) {resetPalm();palmTimer=setTimeout(palmTick,250);return;}
  palmBusy=true;
  palmRequestGeneration=palmGeneration;
  try {
    if($("camera").videoWidth) await palmEngine.send({image:$("camera")});
  } catch(error) {
    palmFailed=true;resetPalm();console.warn('Hand tracking failed',error);
    palmStatus('Hand tracking unavailable · use buttons or arrow keys');
  } finally {
    palmBusy=false;
    if(stream && controlMode()==='palms' && !palmFailed) palmTimer=setTimeout(palmTick,65);
  }
}
function updatePalmFeedback(now) {
  if(controlMode()==='palms' && stream && phase==='play' && palmState.lastAt!==null && now-palmState.lastAt>1000) {
    resetPalm();
    palmStatus('Tracking interrupted · lower your hand or tap an answer');
  }
}
function handlePalmResults(results) {
  if(!stream || controlMode()!=='palms' || document.hidden || palmRequestGeneration!==palmGeneration) return;
  const hands=results.multiHandLandmarks||[];
  const result=PalmInput.step(palmState,hands,performance.now(),phase==='play' && !!round && !round.answered && !isPlayBlocked(),DB.settings.palmHoldMs);
  const canvas=$("palmPreview"),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(w,0);ctx.scale(-1,1);
  ctx.drawImage(results.image,0,0,w,h);ctx.restore();
  ctx.fillStyle='rgba(5,12,30,.3)';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=2;ctx.setLineDash([5,4]);
  ctx.strokeRect(.08*w,.08*h,.36*w,.84*h);ctx.strokeRect(.56*w,.08*h,.36*w,.84*h);ctx.setLineDash([]);
  ctx.fillStyle='white';ctx.font='bold 16px sans-serif';ctx.fillText('← LEFT',.12*w,.22*h);ctx.fillText('RIGHT →',.61*w,.22*h);
  for(const points of hands) {
    const hand=PalmInput.describe(points);if(!hand) continue;
    const selected=result.hand?.points===points;
    ctx.strokeStyle=selected?'#7cffcb':'#a9b8cb';ctx.lineWidth=selected?3:1;
    for(const [a,b] of HAND_CONNECTIONS) {
      ctx.beginPath();ctx.moveTo((1-points[a].x)*w,points[a].y*h);ctx.lineTo((1-points[b].x)*w,points[b].y*h);ctx.stroke();
    }
    ctx.fillStyle=selected?'#7cffcb':'#a9b8cb';
    for(const p of points) {ctx.beginPath();ctx.arc((1-p.x)*w,p.y*h,3,0,Math.PI*2);ctx.fill();}
  }
  palmStatus(result.status);
  setCharge(result.hand?.side,result.ratio);
  if(result.answer) answer(result.answer);
}
