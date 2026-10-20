const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = readFileSync('index.html', 'utf8');
function element(hidden = false) {
  const classes = new Set(hidden ? ['hidden'] : []);
  return {
    value: '', innerHTML: '', textContent: '', children: [], style: { setProperty() {} },
    classList: { add(...names) { names.forEach(n => classes.add(n)); }, remove(...names) { names.forEach(n => classes.delete(n)); },
      contains(n) { return classes.has(n); }, toggle(n, on) { if (on ?? !classes.has(n)) classes.add(n); else classes.delete(n); } },
    appendChild(child) { this.children.push(child); }, querySelector() { return element(); },
    addEventListener() {}, setAttribute() {}, focus() {}, remove() {}, toDataURL() { return "data:image/jpeg;base64,dGVzdA=="; }, getContext() { return { clearRect() {}, translate() {}, scale() {}, drawImage() {} }; }
  };
}
const nodes = new Map([...html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)].map(m => [m[1], element(/class="[^"]*\bhidden\b/.test(m[0]))]));
const storage = new Map([['grammartilt_v2', JSON.stringify({
  activeClass: 'old', settings: { music: false, sfx: false },
  classes: { old: { name: 'Old class', students: [{ id: 'old-player', name: 'Aina', totalScore: 400,
    preset: { descriptor: Array(128).fill(0.3), thumb: 'data:photo', facePhoto: 'data:photo' }, descriptor: [1, 2] }] } }
})]]);
let cameraCalls = 0, modelLoads = [];
const faceapi = { nets: {
  tinyFaceDetector: { async loadFromUri() { modelLoads.push('detector'); } },
  faceLandmark68Net: { async loadFromUri() { modelLoads.push('landmarks'); } },
  faceRecognitionNet: { async loadFromUri() { modelLoads.push('recognition'); } }
} };
const context = vm.createContext({
  console, performance: { now: () => 1000 }, window: { faceapi }, faceapi,
  navigator: { mediaDevices: { getUserMedia() { cameraCalls++; throw new Error('Camera must stay optional'); } } },
  localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
  setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 2; }, clearInterval() {}, requestAnimationFrame() {},
  document: { hidden: false, activeElement: null, body: element(), addEventListener() {},
    getElementById(id) { assert.ok(nodes.has(id), `Missing HTML element ${id}`); return nodes.get(id); },
    querySelectorAll() { return []; }, querySelector(selector) { return selector.startsWith('#') ? nodes.get(selector.slice(1)) : element(); },
    createElement() { return element(); } }
});
const run = code => vm.runInContext(code, context);
run(readFileSync('questions.js', 'utf8'));
run(readFileSync('app.js', 'utf8').replace(/init\(\);\s*$/, ''));
run('var actualIndexSavedFacePhotos=indexSavedFacePhotos; indexSavedFacePhotos = async () => {}; init();');
assert.equal(run('QUESTION_BANK.length'), 1000);
assert.equal(run('new Set(QUESTION_BANK.map(q => q.topic)).size'), 20);
const migrated = JSON.parse(storage.get('grammartilt_v2'));
assert.equal(migrated.classes.old.students[0].totalScore, 400);
assert.ok(!('preset' in migrated.classes.old.students[0]));
assert.ok(!('descriptor' in migrated.classes.old.students[0]));
assert.ok(!('name' in migrated.classes.old.students[0]), 'legacy names are removed');
(async () => {
  run('createClass("5 Bestari"); startSession();');
  assert.equal(run('phase'), 'idle', 'empty class can start');
  assert.equal(cameraCalls, 0, 'class start does not request camera');
  assert.equal(nodes.get('classSelect').disabled, true, 'class cannot change during play');
  // Before capture, missing or stale face tracking cannot create a player.
  run('stream = {};');
  await run('startTurn();');
  assert.equal(run('currentStudents().length'), 0, 'no face means no saved photo or player');
  nodes.get('camera').videoWidth = 1280;
  nodes.get('camera').videoHeight = 720;
  run('detection = {face:true, box:{x:400,y:160,width:200,height:240}}; lastTrackingAt=0;');
  await run('startTurn();');
  assert.equal(run('currentStudents().length'), 0, 'stale face cannot be captured');
  run('lastTrackingAt=1000; faceIdentity={ready:true,at:1000,descriptor:Array(128).fill(.1),samples:[{descriptor:Array(128).fill(.1)}],match:null};');
  await run('startTurn();');
  assert.equal(run('currentStudents().length'), 1);
  assert.equal(run('currentStudents()[0].photo'), 'data:image/jpeg;base64,dGVzdA==');
  assert.equal(run('phase'), 'countdown');
  assert.equal(run('neutralCalibrated'), false, 'turn requires fresh calibration');
  assert.ok(!run('"name" in currentStudents()[0]'), 'photo identity needs no name');
  run('startRound(currentStudents()[0]);');
  assert.equal(run('round.qs.length'), 8);
  assert.equal(run('new Set(round.qs).size'), 8, 'no repeated questions in a turn');
  for (let i = 0; i < 8; i++) {
    run('answer(correctIndex(currentQuestion()) === 0 ? "left" : "right"); advanceRound();');
  }
  assert.equal(run('phase'), 'round');
  assert.equal(run('currentStudents()[0].games'), 1);
  assert.equal(run('currentStudents()[0].correctTotal'), 8);
  assert.equal(run('DB.history.at(-1).classId'), run('DB.activeClass'));
  const scored = JSON.parse(storage.get('grammartilt_v2'));
  assert.equal(scored.classes[scored.activeClass].students[0].marks[0].gained, 8);
  assert.ok(scored.classes[scored.activeClass].students[0].photo.startsWith('data:image/jpeg;'));
  run('enterIdle();');
  await run('startTurn(currentStudents()[0]);');
  assert.equal(run('currentStudents().length'), 1, 'tapping existing photo reuses score record');
  assert.equal(run('phase'), 'countdown');
  run('enterIdle(); lastTrackingAt=1000; faceIdentity={ready:true,at:1000,descriptor:Array(128).fill(.5),samples:[{descriptor:Array(128).fill(.5)}],match:null};');
  await run('startTurn();');
  assert.ok(run('pendingFaceCapture'), 'uncertain identity asks before creating a duplicate');
  run('confirmFacePlayer(null);');
  assert.equal(run('currentStudents().length'), 2, 'explicitly confirmed new capture creates separate player');
  assert.ok(run('leaderboardRows().includes("lb-portrait")'), 'leaderboard renders large portraits');
  assert.ok(!run('leaderboardRows().includes("lb-name")'), 'no name column');
  run('stopSession(); createClass("Another class");');
  assert.equal(run('currentStudents().length'), 0, 'new class is isolated');
  run('DB = loadDB(); DB.activeClass = Object.values(DB.classes).find(c => c.name === "5 Bestari").id;');
  assert.equal(run('currentStudents()[0].correctTotal'), 8, 'scores survive reload');
  assert.equal(run('currentStudents()[0].photo'), 'data:image/jpeg;base64,dGVzdA==', 'portraits survive reload');
  run('DB.activeClass="old"; session={active:true,rounds:0}; enterIdle(); stream={}; lastTrackingAt=1000; faceIdentity={ready:true,at:1000,descriptor:Array(128).fill(.2),samples:[{descriptor:Array(128).fill(.2)}],match:null};');
  await run('startTurn(currentStudents()[0]);');
  assert.equal(run('currentStudents().length'), 1, 'legacy record gets a portrait without duplication');
  assert.equal(run('currentStudents()[0].totalScore'), 400, 'legacy score preserved');
  assert.ok(run('currentStudents()[0].photo.length > 0'));
  assert.equal(run('normalizeStudent({photo:"https://example.com/face.jpg"}).photo'), '', 'remote portrait URLs rejected');
  assert.ok(!/openEnroll/.test(readFileSync('app.js', 'utf8')));
  assert.ok(!html.includes('turnName'), 'no name input');
  // Matching remains local, survives reload and rejects ambiguous neighbours.
  run('DB.classes.faces={id:"faces",name:"Face class",usedQuestionIds:[],students:[normalizeStudent({id:"one",photo:"data:image/jpeg;base64,dGVzdA==",faceSamples:[Array(128).fill(.1)]}),normalizeStudent({id:"two",faceSamples:[Array(128).fill(.3)]})]}; DB.activeClass="faces";');
  assert.equal(run('confidentFaceMatch(Array(128).fill(.101)).id'), 'one');
  assert.equal(run('confidentFaceMatch(Array(128).fill(.8))'), null, 'unknown faces not forced into a saved identity');
  run('getCurrentClass().students[1].faceSamples=[Array(128).fill(.105)];');
  assert.equal(run('confidentFaceMatch(Array(128).fill(.101))'), null, 'similar candidates require confirmation');
  run('getCurrentClass().students[1].faceSamples=[Array(128).fill(.3)]; resetFaceIdentity();');
  for (const at of [1000, 1200, 1400]) {
    run(`updateFaceIdentity({descriptor:Array(128).fill(.101), detection:{box:{width:200,height:240},score:.95}}, ${at});`);
  }
  assert.equal(run('faceIdentity.ready'), true);
  assert.equal(run('faceIdentity.match.id'), 'one', 'consistent observations recognise returning student');
  run('resetFaceIdentity(); updateFaceIdentity({descriptor:Array(128).fill(.101),detection:{box:{width:200,height:240},score:.95}}, 2000);');
  assert.equal(run('faceIdentity.match'), null, 'single-frame matches do not select scores');
  run('saveDB(); DB=loadDB();');
  assert.equal(run('confidentFaceMatch(Array(128).fill(.101)).id'), 'one', 'face memory survives tomorrow’s reload');
  run('for(let i=1;i<=8;i++) learnFaceSample(currentStudents()[0],Array(128).fill(.1+i*.01));');
  assert.equal(run('currentStudents()[0].faceSamples.length'), 5, 'profile size remains bounded');
  assert.equal(run('currentStudents()[0].faceSamples[0][0]'), .1, 'original confirmed reference retained');
  run('DB.activeClass="old";');
  assert.equal(run('confidentFaceMatch(Array(128).fill(.101))'), null, 'face matching stays within the selected class');
  // Upgrade existing portraits without requiring enrollment again.
  context.Image = class { async decode() {} };
  faceapi.TinyFaceDetectorOptions = function () {};
  faceapi.detectSingleFace = () => ({withFaceLandmarks: () => ({withFaceDescriptor: async () => ({descriptor:Array(128).fill(.22)})})});
  run('currentStudents()[0].faceSamples=[]; modelsReady=true; indexSavedFacePhotos=actualIndexSavedFacePhotos;');
  await run('indexSavedFacePhotos();');
  assert.equal(run('currentStudents()[0].faceSamples.length'), 1, 'existing saved portraits build local matching samples');
  // More than one visible face cannot become a recognised player.
  faceapi.detectAllFaces = () => ({withFaceLandmarks: () => ({withFaceDescriptors: async () => [{}, {}]})});
  run('phase="idle"; stream={}; faceIdentity.ready=true;');
  await run('detectTick();');
  assert.equal(run('faceIdentity.ready'), false, 'multiple faces clear identity readiness');
  await Promise.resolve();
  assert.deepEqual(modelLoads, ['detector', 'landmarks', 'recognition']);
  console.log('Passed: local face recognition, stable multi-frame identity, ambiguity rejection, profile persistence/learning, existing-photo indexing, multiple-face rejection, scores and class isolation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
