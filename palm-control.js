"use strict";
// MediaPipe Hands 0.4.1675469240; landmarks are mirrored to match the preview.
const PalmInput = (() => {
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function sideFromHandedness(handedness) {
    if (!Number.isFinite(handedness?.score) || handedness.score < .5) return null;
    // Legacy MediaPipe Hands assumes mirrored input. We send raw video with
    // selfieMode:false, so swap its labels to recover the student's physical hand.
    // https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/hands.md#multi_handedness
    return handedness.label === 'Left' ? 'right' : handedness.label === 'Right' ? 'left' : null;
  }
  function describe(points, aspect = 16/9, handedness = null) {
    if (points?.length !== 21 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
    const centre = [0,5,9,13,17].reduce((sum, i) => ({x:sum.x+points[i].x/5,y:sum.y+points[i].y/5}),{x:0,y:0});
    const x = 1 - centre.x, y = centre.y;
    const width = Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x));
    const height = Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y));
    const largeEnough = width >= .025 && Math.hypot(width,height/aspect) >= .085;
    const open = [8,12,16,20].filter(tip => distance(points[tip],points[0]) > distance(points[tip-2],points[0])*1.18).length >= 3;
    return {points,x,y,open,eligible:largeEnough,largeEnough,side:sideFromHandedness(handedness)};
  }
  function createState(requireRelease = false) { return {latched:requireRelease,lastAt:null}; }
  function step(state, hands, handedness, now, enabled, aspect = 16/9) {
    const described = hands.map((points, i) => describe(points,aspect,handedness?.[i])).filter(Boolean);
    const active = described.filter(h => h.eligible && h.open);
    state.lastAt=now;
    if (!enabled) {
      // A palm shown during countdown/feedback cannot carry into the next choice.
      state.latched=active.length>0;
      return {status:'Ready · lower or close your hand between choices',ratio:0};
    }
    if (!active.length) {
      // One clear frame rearms immediately; there is no release timer either.
      state.latched=false;
      return {status:described.some(h=>!h.largeEnough) ? 'Hand too small · move closer to the camera'
        : described.length ? 'Open your left or right hand to choose' : 'Raise your left or right open palm · instant selection',ratio:0};
    }
    if (active.length>1) return {status:'Two open palms · show only the hand to choose',ratio:0};
    const hand=active[0], side=hand.side;
    if (!side) return {status:'Finding left or right hand · face your palm towards the camera',hand,ratio:0};
    if (state.latched) return {status:'Lower or close your hand, then show your next choice',hand,ratio:0};
    state.latched=true;
    return {status:`${side==='left'?'Left':'Right'} hand · selected`,hand,side,ratio:1,answer:side};
  }
  return {describe,sideFromHandedness,createState,step};
})();

let palmEngine=null, palmLoading=null, palmTimer=null, palmBusy=false, palmFailed=false;
let palmState=PalmInput.createState();
let palmGeneration=0, palmRequestGeneration=-1, palmScope=null, lastPalmPreviewAt=-Infinity;
function palmStatus(text) { const el=$("palmStatus"); if(el.textContent!==text) el.textContent=text; }
function resetPalm() { palmState=PalmInput.createState(true); if(typeof clearCharge==='function') clearCharge(); }
function cancelPalmTick() {
  if(palmTimer?.kind==='video') $('camera').cancelVideoFrameCallback(palmTimer.id);
  else if(palmTimer) clearTimeout(palmTimer.id);
  palmTimer=null;
}
function palmTrackingNeeded() {
  if (!stream || controlMode() !== 'palms' || document.hidden) return false;
  const context = palmControlContext();
  if (!context) return false;
  return context !== 'play' || !round?.answered || palmState.latched;
}
function syncPalmLoop() {
  const context = palmControlContext();
  if (context !== palmScope) {
    palmScope = context;
    palmGeneration += 1;
    palmState.lastAt = null;
  }
  if (palmTrackingNeeded()) ensurePalmLoop();
  else {
    palmGeneration += 1;
    cancelPalmTick();
    if (!context) resetPalm();
  }
}
function stopPalmLoop() {
  palmGeneration+=1;
  cancelPalmTick();
  resetPalm();
  const canvas=$("palmPreview"); canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  palmStatus('Camera off · tap Camera for palm controls');
}
async function ensurePalmLoop() {
  if(!stream || controlMode()!=='palms' || palmFailed) return;
  if(!palmEngine) {
    if(!palmLoading) {
      palmStatus('Loading hand tracking…');
      palmLoading=(async()=>{
        await loadOptionalScript("vendor/hands/hands.js", "Hands");
        const engine=new Hands({locateFile:file=>`vendor/hands/${file}`});
        engine.setOptions({maxNumHands:2,modelComplexity:0,minDetectionConfidence:.65,minTrackingConfidence:.65,selfieMode:false});
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
  if(palmEngine) schedulePalmTick();
}
function schedulePalmTick(delay = 0) {
  if(palmTimer || palmBusy || !palmTrackingNeeded() || palmFailed) return;
  const video=$('camera');
  // Process each fresh camera frame as soon as it is available, one at a time.
  if(!delay && video.requestVideoFrameCallback) {
    palmTimer={kind:'video',id:video.requestVideoFrameCallback(palmTick)};
  } else palmTimer={kind:'timeout',id:setTimeout(palmTick,delay)};
}
async function palmTick() {
  palmTimer=null;
  if(!palmTrackingNeeded() || palmBusy) return;
  updatePalmFeedback(performance.now());
  palmBusy=true;
  palmRequestGeneration=palmGeneration;
  try {
    if($("camera").videoWidth) await palmEngine.send({image:$("camera")});
  } catch(error) {
    palmFailed=true;resetPalm();console.warn('Hand tracking failed',error);
    palmStatus('Hand tracking unavailable · use buttons or arrow keys');
  } finally {
    palmBusy=false;
    schedulePalmTick();
  }
}
function updatePalmFeedback(now) {
  if(controlMode()==='palms' && stream && palmState.lastAt!==null && now-palmState.lastAt>1000) {
    resetPalm();
    palmStatus('Tracking interrupted · lower or close your hand, or tap a button');
  }
}
function handlePalmResults(results) {
  if(!palmTrackingNeeded() || palmRequestGeneration!==palmGeneration) return;
  const hands=results.multiHandLandmarks||[];
  const aspect=$("camera").videoWidth/$("camera").videoHeight || 16/9;
  const context = palmControlContext();
  const enabled = context !== 'countdown' && (context !== 'play' || !!round && !round.answered);
  const result=PalmInput.step(palmState,hands,results.multiHandedness||[],performance.now(),enabled,aspect);
  palmStatus(result.status);
  if(result.answer) handlePalmAction(result.answer);
  // Navigation needs classification, but no hidden preview painting.
  if (context !== "play") return;
  // Classification stays at full camera speed; only the small preview is capped.
  const now=performance.now();
  if(!result.answer && now-lastPalmPreviewAt<1000/12) return;
  lastPalmPreviewAt=now;
  const canvas=$("palmPreview");
  if(canvas.offsetParent===null) return;
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(w,0);ctx.scale(-1,1);
  ctx.drawImage(results.image,0,0,w,h);ctx.restore();
  ctx.fillStyle='rgba(5,12,30,.3)';ctx.fillRect(0,0,w,h);
  ctx.fillStyle='white';ctx.font='bold 13px sans-serif';
  ctx.fillText('← LEFT HAND',.04*w,.12*h);ctx.fillText('RIGHT HAND →',.61*w,.12*h);
  for(const [index,points] of hands.entries()) {
    const hand=PalmInput.describe(points,aspect,results.multiHandedness?.[index]);if(!hand) continue;
    const selected=result.hand?.points===points;
    ctx.strokeStyle=selected?'#7cffcb':'#a9b8cb';ctx.lineWidth=selected?3:1;
    for(const [a,b] of HAND_CONNECTIONS) {
      ctx.beginPath();ctx.moveTo((1-points[a].x)*w,points[a].y*h);ctx.lineTo((1-points[b].x)*w,points[b].y*h);ctx.stroke();
    }
    ctx.fillStyle=selected?'#7cffcb':'#a9b8cb';
    for(const p of points) {ctx.beginPath();ctx.arc((1-p.x)*w,p.y*h,3,0,Math.PI*2);ctx.fill();}
    if(hand.side) ctx.fillText(`${hand.side.toUpperCase()} HAND`,Math.max(4,Math.min(w-90,hand.x*w-40)),Math.max(32,Math.min(h-8,hand.y*h)));
  }
}
