const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
// Palm troubleshooting: frozen-frame diagnosis must explain the verdict.
const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync('palm-control.js', 'utf8'), ctx);
const P = vm.runInContext('PalmInput', ctx);
function hand(cx, open = true) {
  const points = Array.from({ length: 21 }, () => ({ x: 1 - cx, y: 0.6 }));
  points[0] = { x: 1 - cx, y: 0.8 };
  for (let i = 0; i < 4; i++) {
    const base = 5 + i * 4, px = 1 - cx + (i - 1.5) * 0.06;
    points[base] = { x: px, y: 0.6 }; points[base + 1] = { x: px, y: 0.5 };
    points[base + 2] = { x: px, y: 0.4 }; points[base + 3] = { x: px, y: open ? 0.2 : 0.7 };
  }
  return points;
}
// Documented raw-input polarity: physical left arrives labelled 'Right'.
const leftHand = hand(0.28), rightHand = hand(0.72);
const asLeft = { label: 'Right', score: 0.93 }, asRight = { label: 'Left', score: 0.91 };

// diagnose(): the verdict the teacher console shows.
let snap = { count: 1, side: 'left', answer: 'left', per: [{ side: 'left', raw: asLeft }] };
assert.equal(P.diagnose('left', snap).verdict, 'match');
assert.equal(P.diagnose('right', snap).verdict, 'mismatch');
assert.equal(P.diagnose('right', snap).computed, 'left');
assert.equal(P.diagnose('right', snap).raw.label, 'Right');
assert.equal(P.diagnose('left', null).verdict, 'none');
assert.equal(P.diagnose('left', { count: 0, per: [] }).verdict, 'none');
const unknown = P.diagnose('left', { count: 1, side: null, answer: null, per: [] });
assert.equal(unknown.verdict, 'unknown');
assert.equal(unknown.computed, null);
assert.equal(unknown.reason, 'no-side');
assert.equal(P.diagnose('left',
  { count: 1, side: null, answer: null, per: [{ side: null, open: false, eligible: true }] }).reason, 'hand-not-open');
assert.equal(P.diagnose('left',
  { count: 1, side: null, answer: null, per: [{ side: null, open: true, eligible: false }] }).reason, 'hand-too-small');
assert.equal(P.diagnose('left',
  { count: 2, side: null, answer: null, per: [{ side: null, open: true, eligible: true }, { side: null, open: true, eligible: true }] }).reason, 'two-hands');

// buildPalmDebugSnapshot(): one frozen frame explains itself without touching live state.
const draw = {
  clearRect() {}, save() {}, restore() {}, translate() {}, scale() {}, drawImage() {},
  fillRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {},
};
const nodes = {
  camera: { videoWidth: 1280, videoHeight: 720 },
  palmDebugCanvas: { width: 480, height: 270, getContext: () => draw },
  palmStatus: { textContent: '' },
};
Object.assign(ctx, {
  $: (id) => nodes[id], performance: { now: () => 1000 }, HAND_CONNECTIONS: [],
  stream: null, controlMode: () => 'palms', document: { hidden: false },
});
ctx.document.createElement = () => ({ width: 0, height: 0, getContext: () => draw,
  toDataURL: () => 'data:image/jpeg;base64,test-frame' });
ctx.fakeResults = { multiHandLandmarks: [leftHand], multiHandedness: [asLeft], image: {} };
const captured = vm.runInContext("capturePalmAnswerFrame(fakeResults, 'left')", ctx);
assert.equal(captured.side, 'left');
assert.equal(captured.image, 'data:image/jpeg;base64,test-frame');
assert.equal(captured.model[0].label, 'Right');
assert.equal(captured.landmarks[0].length, 21);
const built = vm.runInContext('buildPalmDebugSnapshot(fakeResults)', ctx);
assert.equal(built.count, 1);
assert.equal(built.side, 'left');
assert.equal(built.answer, 'left');
assert.equal(built.per[0].side, 'left');
assert.equal(built.per[0].raw.label, 'Right');
assert.equal(built.per[0].open, true);
ctx.fakeRight = { multiHandLandmarks: [rightHand], multiHandedness: [asRight], image: {} };
const builtRight = vm.runInContext('buildPalmDebugSnapshot(fakeRight)', ctx);
assert.equal(builtRight.side, 'right');
assert.equal(builtRight.answer, 'right');

// Debug branch of handlePalmResults: paints the frozen frame and clears the flag
// even while gameplay tracking is paused (teacher console open, no stream).
vm.runInContext('palmDebugPending=true; palmDebugResolver=null;', ctx);
vm.runInContext('handlePalmResults(fakeResults);', ctx);
assert.equal(vm.runInContext('palmDebugPending', ctx), false);
assert.equal(P.diagnose('left', built).verdict, 'match');
assert.equal(P.diagnose('right', builtRight).verdict, 'match');
console.log('Passed: frozen-frame palm diagnosis (match/mismatch/unknown/none), snapshot sides, debug paint without live tracking.');
