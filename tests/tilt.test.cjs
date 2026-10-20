const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
const element = () => ({
  classList: { add() {}, remove() {}, toggle() {}, contains() { return true; } },
  style: {}, textContent: '', querySelector() { return element(); }
});
const context = vm.createContext({
  console, performance: { now: () => 1000 },
  window: {}, localStorage: { getItem() { return null; } },
  document: { hidden: false, body: { classList: { contains() { return false; } } },
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); } }
});
vm.runInContext(readFileSync('app.js', 'utf8').replace(/init\(\);\s*$/, ''), context);
const run = code => vm.runInContext(code, context);
run('DB.settings.controlMode="tilt";');
for (const degrees of [-35, -12, -0.1, 0, 0.1, 12, 35]) {
  context.degrees = degrees;
  const angle = run(`rollFromLandmarks({
    getLeftEye: () => [{x: 0, y: 0}],
    getRightEye: () => [{x: 100, y: Math.tan(degrees * Math.PI / 180) * 100}]
  })`);
  assert.ok(Math.abs(angle - degrees) < 1e-8, `angle ${degrees} returned ${angle}`);
}
run(`phase = 'play'; round = { answered: false }; neutralCalibrated = true;
  detection.face = true; smoothRoll = 0; baseRoll = 0; lastTrackingAt = 1000;
  var submissions = []; answer = side => { submissions.push(side); resetTilt(); };
  resetTilt(); updateTilt(1000); updateTilt(1200);`);
assert.equal(run('tilt.armed'), true, 'stable centre arms');
run('smoothRoll = 16; lastTrackingAt = 1250; updateTilt(1250); updateTilt(1600);');
assert.equal(run('submissions.length'), 0, 'animation alone cannot confirm');
run('lastTrackingAt = 1850; updateTilt(1850);');
assert.equal(run('submissions[0]'), 'left', 'fresh held tilt submits left');
run('lastTrackingAt = 2000; updateTilt(2000);');
assert.equal(run('tilt.armed'), false, 'held tilt cannot rearm');
run('smoothRoll = 0; lastTrackingAt = 2100; updateTilt(2100); updateTilt(2300); smoothRoll = -16; lastTrackingAt = 2400; updateTilt(2400); detection.face = false; updateTilt(2500);');
assert.equal(run('tilt.side'), null, 'loss clears partial hold');
assert.equal(run('tilt.armed'), false, 'loss requires neutral again');
run('detection.face = true; smoothRoll = 0; lastTrackingAt = 3000; updateTilt(3000); updateTilt(3200); smoothRoll = -16; lastTrackingAt = 3300; updateTilt(3300); updateTilt(3800);');
assert.equal(run('tilt.armed'), false, 'stale tracking disarms');
run('DB.settings.invertTilt = true; smoothRoll = 0; lastTrackingAt = 4000; updateTilt(4000); updateTilt(4200); smoothRoll = 16; lastTrackingAt = 4300; updateTilt(4300); lastTrackingAt = 4900; updateTilt(4900);');
assert.equal(run('submissions[1]'), 'right', 'swap changes direction');
run('smoothRoll = 0; lastTrackingAt = 5000; updateTilt(5000); updateTilt(5200); document.hidden = true; updateTilt(5250);');
assert.equal(run('tilt.armed'), false, 'hidden tab disarms');
run('document.hidden = false; phase = "countdown"; calibrationSamples = []; neutralCalibrated = false;');
for (let i = 0; i < 5; i++) {
  context.sampleTime = 6000 + i * 100;
  run(`performance.now = () => sampleTime; handleFace({
    landmarks: {getLeftEye: () => [{x: 0, y: 0}], getRightEye: () => [{x: 100, y: 10}]},
    detection: {box: {}}
  });`);
}
assert.equal(run('neutralCalibrated'), true, 'stable live samples calibrate');
assert.ok(Math.abs(run('baseRoll') - 5.710593) < 0.001);
console.log('Passed: upright angle continuity, live calibration, fresh-frame holds, neutral rearming, tracking loss, stale tracking, direction swap and hidden-tab reset.');
