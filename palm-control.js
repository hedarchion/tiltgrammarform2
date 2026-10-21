"use strict";
// MediaPipe Hands 0.4.1675469240; landmarks are mirrored to match the preview.
const PalmInput = (() => {
  const RELEASE_MS = 350, MAX_GAP_MS = 600, DROPOUT_MS = 220;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function describe(points, aspect = 16/9) {
    if (points?.length !== 21 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
    const centre = [0,5,9,13,17].reduce((sum, i) => ({x:sum.x+points[i].x/5,y:sum.y+points[i].y/5}),{x:0,y:0});
    const x = 1 - centre.x, y = centre.y;
    const width = Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x));
    const height = Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y));
    // Measure both dimensions in image-width units, so upright/narrow palms count too.
    const largeEnough = width >= .025 && Math.hypot(width,height/aspect) >= .085;
    const inGuide = x >= .08 && x <= .92 && y >= .08 && y <= .92;
    const open = [8,12,16,20].filter(tip => distance(points[tip],points[0]) > distance(points[tip-2],points[0])*1.18).length >= 3;
    return {points,x,y,open,eligible:largeEnough && inGuide,largeEnough,inGuide,
      side:x < .44 ? 'left' : x > .56 ? 'right' : null};
  }
  function createState() { return {side:null,heldMs:0,lastAt:null,lastGoodAt:null,previousGood:false,latched:true,releaseAt:null}; }
  function clearHold(state) {
    state.side=null;state.heldMs=0;state.lastGoodAt=null;state.previousGood=false;
  }
  function step(state, hands, now, enabled, holdMs = 800, aspect = 16/9) {
    const duration = Number.isFinite(holdMs) ? Math.max(400, Math.min(3000, holdMs)) : 800;
    const described = hands.map(points => describe(points,aspect)).filter(Boolean);
    const active = described.filter(h => h.eligible);
    const elapsed = state.lastAt===null ? 0 : Math.max(0,now-state.lastAt);
    if (!enabled || elapsed > MAX_GAP_MS) {
      clearHold(state);state.releaseAt=null;
      if (!enabled) state.latched=true;
    }
    state.lastAt=now;
    if (!enabled) return {status:'Ready · lower your hand before each answer',ratio:0};
    if (active.length>1) {
      clearHold(state);state.latched=true;state.releaseAt=null;
      return {status:'Multiple hands · lower them, then use one hand',ratio:0};
    }
    if (!state.previousGood && state.lastGoodAt!==null && now-state.lastGoodAt>DROPOUT_MS) clearHold(state);
    const hand=active[0];
    // A small dead band prevents a steady palm near a guide edge from flickering.
    const side=hand && (state.side==='left' && hand.x<.48 ? 'left'
      : state.side==='right' && hand.x>.52 ? 'right' : hand.side);
    if (!hand || !hand.open || !side) {
      const recovering=!state.latched && state.lastGoodAt!==null && now-state.lastGoodAt<=DROPOUT_MS;
      state.previousGood=false;
      if (!recovering) clearHold(state);
      if (!hand) {
        if (state.releaseAt===null) state.releaseAt=now;
        if (now-state.releaseAt>=RELEASE_MS) state.latched=false;
      } else state.releaseAt=null;
      const status=recovering ? 'Tracking briefly lost · keep your palm steady'
        : !hand ? (described.some(h=>h.inGuide && !h.largeEnough) ? 'Hand too small · move closer to the camera'
          : described.length ? 'Move your palm inside a dashed guide' : 'No hand · raise one open palm')
        : !hand.open ? 'Hand detected · open your fingers' : 'Hand detected · move left or right';
      return {status,hand,side:recovering?state.side:null,ratio:recovering?state.heldMs/duration:0};
    }
    state.releaseAt=null;
    if (state.latched) return {status:'Hand detected · lower it to reset',hand,ratio:0};
    if (state.side!==side) {clearHold(state);state.side=side;}
    // Missing/invalid frames pause progress; recovery never counts unseen time.
    if (state.previousGood) state.heldMs+=elapsed;
    state.previousGood=true;state.lastGoodAt=now;
    const ratio=Math.min(1,state.heldMs/duration);
    if (ratio>=1) {state.latched=true;clearHold(state);}
    return {status:ratio>=1?'Answer selected · lower your hand':`Open palm · hold ${side} ${Math.round(ratio*100)}%`,
      hand,side,ratio,answer:ratio>=1?side:null};
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
  const aspect=$("camera").videoWidth/$("camera").videoHeight || 16/9;
  const result=PalmInput.step(palmState,hands,performance.now(),phase==='play' && !!round && !round.answered && !isPlayBlocked(),DB.settings.palmHoldMs,aspect);
  const canvas=$("palmPreview"),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(w,0);ctx.scale(-1,1);
  ctx.drawImage(results.image,0,0,w,h);ctx.restore();
  ctx.fillStyle='rgba(5,12,30,.3)';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=2;ctx.setLineDash([5,4]);
  ctx.strokeRect(.08*w,.08*h,.36*w,.84*h);ctx.strokeRect(.56*w,.08*h,.36*w,.84*h);ctx.setLineDash([]);
  ctx.fillStyle='white';ctx.font='bold 16px sans-serif';ctx.fillText('← LEFT',.12*w,.22*h);ctx.fillText('RIGHT →',.61*w,.22*h);
  for(const points of hands) {
    const hand=PalmInput.describe(points,aspect);if(!hand) continue;
    const selected=result.hand?.points===points;
    ctx.strokeStyle=selected?'#7cffcb':'#a9b8cb';ctx.lineWidth=selected?3:1;
    for(const [a,b] of HAND_CONNECTIONS) {
      ctx.beginPath();ctx.moveTo((1-points[a].x)*w,points[a].y*h);ctx.lineTo((1-points[b].x)*w,points[b].y*h);ctx.stroke();
    }
    ctx.fillStyle=selected?'#7cffcb':'#a9b8cb';
    for(const p of points) {ctx.beginPath();ctx.arc((1-p.x)*w,p.y*h,3,0,Math.PI*2);ctx.fill();}
  }
  palmStatus(result.status);
  setCharge(result.side,result.ratio);
  if(result.answer) answer(result.answer);
}
