const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = readFileSync('index.html', 'utf8');
const settingsMarkup = html.slice(html.indexOf('<aside class="drawer"'),html.indexOf('</aside>'));
for (const id of ['formSelect','controlModeSelect','tiltSensitivity','tiltHold','invertTiltToggle','calibrateBtn','soundToggle','musicToggle']) {
  assert.ok(settingsMarkup.includes(`id="${id}"`),`${id} belongs in settings`);
  assert.equal(html.split(`id="${id}"`).length-1,1,`${id} is not duplicated on the player screen`);
}
assert.ok(html.slice(0,html.indexOf('</header>')).includes('id="cameraToggleBtn"'),'camera permission/on-off remains in the game header');
assert.equal(html.split('id="cameraToggleBtn"').length-1,1,'one shared camera toggle');
for (const id of ['palmHold','palmHoldHint','palmHoldQuick','controlModeBtn','recenterBtn','palmCameraBtn']) assert.ok(!html.includes(`id="${id}"`));
function element(hidden = false) {
  const classes = new Set(hidden ? ['hidden'] : []);
  const listeners = new Map();
  return {
    value: '', innerHTML: '', textContent: '', children: [], style: { setProperty() {} },
    classList: { add(...names) { names.forEach(n => classes.add(n)); }, remove(...names) { names.forEach(n => classes.delete(n)); },
      contains(n) { return classes.has(n); }, toggle(n, on) { if (on ?? !classes.has(n)) classes.add(n); else classes.delete(n); } },
    appendChild(child) { this.children.push(child); }, querySelector() { return element(); },
    addEventListener(name, fn) { listeners.set(name, fn); }, click() { if (!this.disabled) listeners.get("click")?.(); }, setAttribute() {}, focus() { context.document.activeElement = this; }, remove() {}, toDataURL() { return "data:image/jpeg;base64,dGVzdA=="; }, getContext() { return { clearRect() {}, translate() {}, scale() {}, drawImage() {} }; }
  };
}
const nodes = new Map([...html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)].map(m => [m[1], element(/class="[^"]*\bhidden\b/.test(m[0]))]));
const storage = new Map([['grammartilt_v2', JSON.stringify({
  activeClass: 'old', settings: { music: false, sfx: false },
  classes: { old: { name: 'Old class', students: [{ id: 'old-player', name: 'Aina', totalScore: 400,
    preset: { descriptor: Array(128).fill(0.3), thumb: 'data:photo', facePhoto: 'data:photo' }, descriptor: [1, 2] }] } }
})]]);
let cameraCalls = 0, modelLoads = [], animationRequests = 0;
const documentEvents = new Map();
const faceapi = { nets: {
  tinyFaceDetector: { async loadFromUri() { modelLoads.push('detector'); } },
  faceLandmark68Net: { async loadFromUri() { modelLoads.push('landmarks'); } },
  faceRecognitionNet: { async loadFromUri() { modelLoads.push('recognition'); } }
} };
const context = vm.createContext({
  console, performance: { now: () => 1000 }, window: { faceapi, GlassRenderer: { start() {}, stop() {} } }, faceapi,
  navigator: { mediaDevices: { getUserMedia() { cameraCalls++; throw new Error('Camera must stay optional'); } } },
  localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
  setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 2; }, clearInterval() {}, requestAnimationFrame() { animationRequests++; },
  document: { hidden: false, activeElement: null, body: element(), addEventListener(name, fn) { documentEvents.set(name, fn); },
    getElementById(id) { assert.ok(nodes.has(id), `Missing HTML element ${id}`); return nodes.get(id); },
    querySelectorAll() { return []; }, querySelector(selector) { return selector.startsWith('#') ? nodes.get(selector.slice(1)) : element(); },
    createElement() { return element(); } }
});
const run = code => vm.runInContext(code, context);
run(readFileSync('questions.js', 'utf8'));
run(readFileSync('questions-form1.js', 'utf8'));
run(readFileSync('app.js', 'utf8').replace(/init\(\);\s*$/, ''));
run('var actualIndexSavedFacePhotos=indexSavedFacePhotos; indexSavedFacePhotos = async () => {}; init();');
assert.equal(run('QUESTION_BANK.length'), 1000);
assert.deepEqual(modelLoads, [], 'home screen never loads face models');
assert.equal(animationRequests, 0, 'home screen has no app animation loop');
assert.ok(!html.includes('src="vendor/'), 'tracking libraries are loaded on demand');
assert.ok(!html.includes('src="glass.js'), 'decorative WebGL renderer is not loaded eagerly');
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
  assert.deepEqual(modelLoads, [], 'numbered class entry needs no models');
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
  run('if (phase === "bonus") declineBonusShot();');
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
  run('DB.activeClass="old"; session={active:true,rounds:0}; enterIdle(); stream={}; detection={face:true,box:{x:400,y:160,width:200,height:240}}; lastTrackingAt=1000; faceIdentity={ready:true,at:1000,descriptor:Array(128).fill(.2),samples:[{descriptor:Array(128).fill(.2)}],match:null};');
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
  run('currentStudents()[0].faceSamples=[]; phase="idle"; faceCaptureRequested=true; modelsReady=true; indexSavedFacePhotos=actualIndexSavedFacePhotos;');
  await run('indexSavedFacePhotos();');
  assert.equal(run('currentStudents()[0].faceSamples.length'), 1, 'existing saved portraits build local matching samples');
  // More than one visible face cannot become a recognised player.
  faceapi.detectAllFaces = () => ({withFaceLandmarks: () => ({withFaceDescriptors: async () => [{}, {}]})});
  run('phase="idle"; hideGameOverlays(); stream={}; faceIdentity.ready=true;');
  await run('detectTick();');
  assert.equal(run('faceIdentity.ready'), false, 'multiple faces clear identity readiness');
  run('stream=null; session={active:true,rounds:0}; enterIdle();');
  const beforeNumbered=run('currentStudents().length');
  run('startNumberedPlayer();');
  assert.equal(run('currentStudents().length'),beforeNumbered+1,'numbered player starts without camera');
  assert.equal(run('phase'),'countdown');
  assert.equal(run('currentStudents().at(-1).numbered'),true);
  run('DB=loadDB(); enterIdle();');
  await run('startTurn(currentStudents().at(-1));');
  assert.equal(run('phase'),'countdown','saved numbered player returns without face detection');
  assert.equal(run('currentStudents().length'),beforeNumbered+1,'reuses numbered score record');
  // Active question time affects points, with exact pause/resume boundaries.
  let now = 0;
  context.performance.now = () => now;
  run('stopSession(); createClass("Speed scoring"); startSession(); startNumberedPlayer(); startRound(currentStudents()[0]);');
  const correctAnswer = 'answer(correctIndex(currentQuestion()) === 0 ? "left" : "right");';
  const wrongAnswer = 'answer(correctIndex(currentQuestion()) === 0 ? "right" : "left");';
  now = 2000;
  run(correctAnswer);
  assert.equal(run('round.points'), 180, 'two-second answer earns base plus 80 speed points');
  run(correctAnswer);
  assert.equal(run('round.responseTimesMs.length'), 1, 'duplicate submissions cannot award points');
  now = 50000; // Feedback delays do not run the next question clock.
  run('advanceRound();');
  now += 1000;
  run('openTeacher();');
  now += 20000;
  run('showLeaderboard({after:"resume"}); closeTeacherPanel();');
  now += 20000;
  run(correctAnswer);
  assert.equal(run('round.answered'), false, 'blocked answers are ignored');
  run('closeLeaderboard();');
  now += 1000;
  run('showLostNow();');
  now += 20000;
  run(correctAnswer);
  assert.equal(run('round.answered'), false, 'face-loss pause blocks submissions');
  run('hideLost();');
  now += 1000;
  context.document.hidden = true;
  documentEvents.get('visibilitychange')();
  now += 20000;
  run(correctAnswer);
  assert.equal(run('round.answered'), false, 'hidden tabs cannot submit');
  context.document.hidden = false;
  documentEvents.get('visibilitychange')();
  now += 2000;
  run(correctAnswer);
  assert.equal(run('round.responseTimesMs[1]'), 5000, 'nested overlays, lost-face pause and hidden tab exclude paused time');
  assert.equal(run('round.points'), 355, 'five active seconds earn 50 speed points plus base and streak');
  assert.ok(nodes.get('feedbackLine').textContent.includes('5.0s · +50 SPEED'));
  run('advanceRound();');
  now += 10000;
  run(correctAnswer);
  assert.equal(run('round.points'), 505, 'ten seconds still earns base and streak points');
  run('advanceRound();');
  now += 15000;
  run(correctAnswer);
  assert.equal(run('round.points'), 680, 'slow answers keep their correctness and streak points');
  run('advanceRound();');
  run(wrongAnswer);
  assert.equal(run('round.points'), 680, 'instant wrong answers earn no speed points');
  assert.equal(run('round.streak'), 0);
  for (let i = 0; i < 3; i++) {
    run('advanceRound();');
    now += 5000;
    run(correctAnswer);
  }
  run('advanceRound();');
  assert.equal(run('round.redemption.active'), true);
  assert.equal(run('round.questionTimer.elapsedMs'), 0, 'redemption gets a fresh clock');
  now += 2000;
  run(correctAnswer);
  assert.equal(run('round.points'), 1735, 'golden question 8 doubles its award, then redemption adds 250 base and 80 speed points');
  run('finishRound();');
  assert.equal(run('currentStudents()[0].correctTotal'), 8, 'speed does not change marks');
  assert.equal(run('currentStudents()[0].totalScore'), 1735);
  assert.ok(nodes.get('roundSpeedBonus').textContent.includes('+410'));
  run('DB=loadDB();');
  assert.equal(run('currentStudents()[0].marks[0].speedBonus'), 410, 'speed bonus persists');
  assert.deepEqual(Array.from(run('currentStudents()[0].marks[0].responseTimesMs')), [2000,5000,10000,15000,0,5000,5000,5000,2000]);
  assert.equal(run('DB.history.at(-1).points'), 1735, 'history includes speed points');
  // Perfect round, identical timing via shared answer path, and missed redemption.
  run('enterIdle(); startRound(currentStudents()[0]);');
  for (let i = 0; i < 8; i++) run(`${correctAnswer} advanceRound();`);
  assert.equal(run('phase'), 'bonus', 'a perfect round offers the optional bonus shot');
  run('declineBonusShot();');
  assert.equal(run('round.points'), 2975, 'perfect bonus, golden question and all streak points remain alongside speed');
  run('enterIdle(); startRound(currentStudents()[0]);');
  for (let i = 0; i < 8; i++) run(`${i === 0 ? wrongAnswer : correctAnswer} advanceRound();`);
  const beforeMissedRedemption = run('round.points');
  run(wrongAnswer);
  assert.equal(run('round.points'), beforeMissedRedemption, 'missed redemption earns no bonus');
  context.performance.now = () => 1000;
  console.log('Passed: timed scoring, pause/resume, wrong and duplicate answers, speed persistence, redemption and perfect bonuses.');
  // Automatic board cadence counts completed turns; a manual view does not consume them.
  run('session=null; createClass("Podium test"); DB.settings.music=false; DB.settings.sfx=false; session={active:true,rounds:0,roundsSinceBoard:0,classId:DB.activeClass,questionDeck:shuffledQuestions()};');
  run('getCurrentClass().students=[normalizeStudent({id:"gold",numbered:true}),normalizeStudent({id:"silver",numbered:true}),normalizeStudent({id:"bronze",numbered:true}),normalizeStudent({id:"new",numbered:true,totalScore:9999})];');
  for(let turn=0;turn<3;turn++) {
    run(`startRound(currentStudents()[${turn}]); round.results=Array(8).fill("wrong"); finishRound();`);
    assert.equal(run('boardDue()'),turn===2,'leaderboard due only after third completed turn');
    if(turn===0) {
      run('showLeaderboard({after:"idle"});');
      assert.equal(run('session.roundsSinceBoard'),1,'manual Ranks preserves automatic cadence');
      run('hideLeaderboard();');
    }
    run('nextPlayer();');
  }
  assert.equal(nodes.get('leaderboardOverlay').classList.contains('hidden'),false,'third completed turn shows leaderboard');
  assert.equal(run('session.roundsSinceBoard'),0,'automatic reveal starts next group of three');
  assert.equal(run('rankedPlayers().length'),3,'unplayed profiles stay off podium');
  run('currentStudents()[0].totalScore=300;currentStudents()[1].totalScore=200;currentStudents()[2].totalScore=100;showLeaderboard({after:"idle"});');
  run('currentStudents()[0].totalScore=50;currentStudents()[2].totalScore=400;');
  assert.ok(run(`leaderboardRows().includes('data-rank="1" data-prior-rank="3"')`),'promotion starts from old step');
  assert.ok(run(`leaderboardRows().includes('data-rank="3" data-prior-rank="1"')`),'demotion starts from old step');
  run('showLeaderboard({after:"idle"}); DB=loadDB();');
  assert.equal(run('getCurrentClass().leaderboardRanks.bronze'),1,'prior ranks saved per class');
  assert.ok(run('leaderboardRows().includes("podium-body")'),'portraits attach to bodies');
  const animations=[];
  const figures=[{dataset:{rank:"1",priorRank:"3"},animate:(frames,options)=>animations.push({frames,options})},
    {dataset:{rank:"4",priorRank:"2"},animate:(frames,options)=>animations.push({frames,options})}];
  nodes.get('leaderboardList').querySelector=()=>({querySelectorAll:()=>figures,getBoundingClientRect:()=>({width:600})});
  context.matchMedia=()=>({matches:false});
  run('animatePodium();');
  assert.ok(animations[0].frames[0].transform.includes('74px'),'promotion starts at lower podium height');
  assert.equal(animations[1].frames.at(-1).opacity,0,'departing player steps off podium');
  context.matchMedia=()=>({matches:true});
  run('animatePodium();');
  assert.equal(animations.length,2,'reduced motion skips rank movement');
  // Personal play starts directly, preserves class data and waits at results.
  run('abortSession();');
  const classIdBeforeSolo = run('DB.activeClass');
  const classBeforeSolo = run('JSON.stringify(getCurrentClass())');
  const cameraCallsBeforeSolo = cameraCalls;
  run('changePlayMode("single"); changeDifficulty("challenge"); startSession();');
  assert.equal(run('phase'), 'countdown', 'solo skips player enrollment');
  assert.equal(cameraCalls, cameraCallsBeforeSolo, 'solo does not request a camera');
  assert.equal(run('currentStudents().length'), 1, 'one personal profile');
  assert.equal(run('getCurrentClass().id'), 'solo');
  assert.equal(run('DB.activeClass'), classIdBeforeSolo, 'remember selected class');
  assert.equal(nodes.get('difficultySelect').disabled, true, 'difficulty is locked during a session');
  run('changeDifficulty("easy"); changePlayMode("class");');
  assert.equal(run('isSolo()'), true, 'mode is locked during a session');
  assert.equal(run('selectedDifficulty()'), 'challenge');
  run('startRound(currentStudents()[0]);');
  assert.ok(run('round.qs.every(q => DIFFICULTY_TOPICS[2].challenge.includes(q.topic))'), 'solo uses selected difficulty');
  for (let i = 0; i < 8; i++) run(`${correctAnswer} advanceRound();`);
  run('if (phase === "bonus") declineBonusShot();');
  assert.equal(run('phase'), 'round');
  assert.equal(nodes.get('replayPlayerBtn').textContent, 'PLAY AGAIN');
  assert.equal(nodes.get('nextPlayerBtn').textContent, 'MENU');
  assert.ok(!html.includes('id="roundAutoHint"'), 'results await an explicit replay or next-player choice');
  assert.equal(run('boardDue()'), false, 'solo never triggers a class podium');
  assert.equal(run('DB.history.at(-1).classId'), 'solo', 'personal history stays separate');
  assert.equal(run('DB.history.at(-1).difficulty'), 'challenge');
  assert.equal(run('DB.history.at(-1).form'), 2);
  const soloId = run('currentStudents()[0].id');
  const soloUsed = Array.from(run('getCurrentClass().usedQuestionIds'));
  run('replayPlayer();');
  assert.equal(run('phase'), 'countdown', 'play again starts same player directly');
  assert.equal(run('currentStudents()[0].id'), soloId);
  run('startRound(currentStudents()[0]);');
  assert.ok(run(`round.qs.every(q => !${JSON.stringify(soloUsed)}.includes(q.id))`), 'replay never repeats used questions');
  run('round.results=Array(8).fill("wrong"); finishRound(); nextPlayer();');
  assert.equal(run('phase'), 'lobby', 'back to menu ends solo');
  assert.equal(nodes.get('leaderboardOverlay').classList.contains('hidden'), true);
  const soloScore = run('currentStudents()[0].totalScore');
  run('DB=loadDB();');
  assert.equal(run('isSolo()'), true, 'selected mode survives reload');
  assert.equal(run('currentStudents()[0].totalScore'), soloScore, 'personal score persists');
  assert.equal(run('currentStudents()[0].games'), 2);
  assert.equal(run('selectedDifficulty()'), 'challenge');
  run('changePlayMode("class");');
  assert.equal(run('JSON.stringify(getCurrentClass())'), classBeforeSolo, 'solo leaves class scores and questions untouched');
  assert.equal(nodes.get('nextPlayerBtn').textContent, 'NEXT PLAYER');
  run('changePlayMode("single"); changeDifficulty("easy");');
  assert.equal(run('selectedDifficulty()'), 'easy');
  run('changePlayMode("class");');
  assert.equal(run('selectedDifficulty()'), 'standard', 'difficulty is saved independently for class and solo');
  console.log('Passed: direct solo start, replay, persistent personal progress, class isolation, mode/difficulty locks and solo menu flow.');
  await Promise.resolve();
  assert.deepEqual(modelLoads, ['detector', 'landmarks', 'recognition']);
  // Both visual styles use the same profiles, question history and active round.
  assert.equal(run('normalizeDB(null).settings.classAppearance'), 'glass', 'class defaults to previous glass UI');
  assert.equal(run('normalizeDB(null).settings.soloAppearance'), 'lite', 'individual play defaults to lighter UI');
  const classesBeforeTheme = run('JSON.stringify(DB.classes)');
  run('setAppearance("lite"); changePlayMode("single");');
  assert.equal(run('selectedAppearance()'), 'lite');
  run('setAppearance("glass"); startSession(); startRound(currentStudents()[0]);');
  const activeQuestions = run('round.qs.map(q=>q.id).join(",")');
  const activePlayer = run('round.student.id');
  run('setAppearance("lite");');
  assert.equal(run('phase'), 'play', 'UI can change mid-round');
  assert.equal(run('round.student.id'), activePlayer);
  assert.equal(run('round.qs.map(q=>q.id).join(",")'), activeQuestions);
  assert.equal(nodes.get('liteThemeStyles').disabled, false);
  assert.equal(nodes.get('glassThemeStyles').disabled, true);
  run('setAppearance("glass"); stopSession(); changePlayMode("class");');
  assert.equal(run('selectedAppearance()'), 'lite', 'class retains its independent choice');
  assert.equal(run('JSON.stringify(DB.classes)'), classesBeforeTheme, 'appearance leaves class records untouched');
  run('DB=loadDB(); changePlayMode("single");');
  assert.equal(run('selectedAppearance()'), 'glass', 'solo preference survives reload');
  run('changePlayMode("class"); setAppearance("glass");');
  assert.equal(nodes.get('liteThemeStyles').disabled, true);
  assert.equal(nodes.get('glassThemeStyles').disabled, false);
  // Mobile defaults do not inherit an older desktop Glass preference.
  let mobile = true, confirmResult = false, confirmations = [];
  context.window.matchMedia = () => ({ matches: mobile, addEventListener() {} });
  context.window.confirm = message => { confirmations.push(message); return confirmResult; };
  run('renderAppearance();');
  assert.equal(run('selectedAppearance()'), 'lite', 'mobile class defaults to Lite');
  run('setAppearance("glass");');
  assert.equal(run('selectedAppearance()'), 'lite', 'cancel preserves Lite');
  assert.equal(nodes.get('appearanceSelect').value, 'lite', 'cancel resets settings selection');
  assert.equal(nodes.get('glassThemeStyles').disabled, true, 'cancel does not enable glass rendering');
  assert.match(confirmations[0], /Are you sure.*more power/);
  confirmResult = true;
  run('setAppearance("glass");');
  assert.equal(run('selectedAppearance()'), 'glass', 'confirmation enables Glass');
  run('DB=loadDB();');
  assert.equal(run('selectedAppearance()'), 'glass', 'explicit mobile choice persists');
  run('setAppearance("glass"); setAppearance("lite"); changePlayMode("single");');
  assert.equal(confirmations.length, 2, 'same style and Lite need no confirmation');
  assert.equal(run('selectedAppearance()'), 'lite', 'mobile solo also defaults to Lite');
  mobile = false;
  assert.equal(run('selectedAppearance()'), 'glass', 'desktop preference survives mobile changes');
  run('changePlayMode("class");');
  assert.equal(run('selectedAppearance()'), 'glass');
  for (const id of ['appearanceHint','appearancePowerNote','lobbyStatus','difficultyNote','lobbyDifficultyNote']) {
    assert.ok(!html.includes(`id="${id}"`), `${id} removed rather than hidden`);
  }
  assert.ok(html.includes('<title>Palm2Grammar</title>'));
  assert.ok(!html.includes('IdontEvenKnowHer'));
  assert.ok(!html.includes('id="lbEvery"'), 'automatic leaderboard interval is fixed at three turns');
  assert.ok(html.includes('<h1 class="logo">Palm2Grammar</h1>'));
  console.log('Passed: Glass/Lite defaults, per-mode preferences, persistence, live switching and shared game data.');
  // Head tilt needs two small models; recognition is a separate, later request.
  run('stream=null; modelsReady=false; recognitionReady=false; faceCaptureRequested=false;');
  await run('loadModels(false);');
  assert.deepEqual(modelLoads.slice(3), ['detector', 'landmarks'], 'head tracking does not load face recognition');
  run('faceCaptureRequested=true;');
  await run('loadModels(false);');
  assert.deepEqual(modelLoads.slice(3), ['detector', 'landmarks', 'recognition'], 'photo matching adds only its missing model');
  run('stream={}; phase="idle"; faceCaptureRequested=false;');
  assert.equal(run('faceTrackingNeeded()'), false, 'idle numbered players do not run face inference');
  run('faceCaptureRequested=true;');
  assert.equal(run('faceTrackingNeeded()'), true, 'explicit photo capture enables face inference');
  context.document.hidden=true;
  assert.equal(run('faceTrackingNeeded()'), false, 'hidden tabs stop face inference');
  context.document.hidden=false;
  run('openTeacher();');
  assert.equal(run('faceTrackingNeeded()'), false, 'settings stop face inference');
  run('closeTeacherPanel(); hideGameOverlays(); phase="play"; round={answered:false}; DB.settings.controlMode="palms";');
  assert.equal(run('faceTrackingNeeded()'), false, 'palm play never runs the face tracker');
  run('DB.settings.controlMode="tilt";');
  assert.equal(run('faceTrackingNeeded()'), true);
  run('round.answered=true;');
  assert.equal(run('faceTrackingNeeded()'), false, 'head tracking stops during answer feedback');
  assert.equal(animationRequests, 0, 'play and settings never start an animation loop');
  // Replaying a class player has no per-player cap and shares the three-turn cadence.
  run('stream=null; abortSession(); DB=normalizeDB(null); DB.settings.music=false; DB.settings.sfx=false; createClass("Repeat turns"); startSession(); startNumberedPlayer();');
  const repeatId = run('currentStudents()[0].id');
  const replayQuestions = new Set();
  for (let turn=1; turn<=7; turn++) {
    run('startRound(currentStudents()[0]);');
    for (const id of run('round.qs.map(q=>q.id)')) {
      assert.ok(!replayQuestions.has(id), 'replay uses fresh questions');
      replayQuestions.add(id);
    }
    run('round.results=Array(8).fill("wrong"); finishRound();');
    assert.equal(nodes.get('replayPlayerBtn').textContent, 'PLAY AGAIN');
    assert.equal(nodes.get('nextPlayerBtn').textContent, 'NEXT PLAYER');
    assert.equal(run('currentStudents()[0].games'), turn);
    assert.equal(run('currentStudents().length'), 1, 'replay never creates another profile');
    run('replayPlayer();');
    assert.equal(nodes.get('leaderboardOverlay').classList.contains('hidden'), turn%3!==0,
      'both replay and next-player choices reveal ranks after exactly three turns');
    if (turn%3===0) {
      assert.equal(run('boardContext.replayStudentId'), repeatId);
      run('closeLeaderboard();');
    }
    assert.equal(run('phase'), 'countdown');
    assert.equal(run('activeStudentId'), repeatId, 'replay survives the automatic leaderboard');
  }
  const historyBeforeStop = run('DB.history.length');
  let stoppedTracks = 0;
  context.stopTestStream = {getTracks:()=>[{stop(){stoppedTracks++;}}]};
  run('stream=stopTestStream;');
  nodes.get('stopGameBtn').click();
  assert.equal(run('phase'), 'lobby', 'visible Stop works during countdown');
  assert.equal(run('stream'), null, 'Stop releases the camera');
  assert.equal(stoppedTracks, 1);
  assert.equal(run('session'), null);
  assert.equal(run('DB.history.length'), historyBeforeStop, 'Stop preserves completed turns');
  assert.equal(nodes.get('leaderboardOverlay').classList.contains('hidden'), true, 'Stop returns home without an unsolicited podium');
  run('startSession(); startNumberedPlayer(); startRound(currentStudents().at(-1));');
  nodes.get('stopGameBtn').click();
  assert.equal(run('phase'), 'lobby', 'Stop works during a question');
  run('startSession(); startNumberedPlayer(); startRound(currentStudents().at(-1)); round.results=Array(8).fill("wrong"); finishRound();');
  nodes.get('roundStopBtn').click();
  assert.equal(run('phase'), 'lobby', 'result Stop ends the session');
  assert.equal(nodes.get('stopGameBtn').classList.contains('hidden'), true, 'Stop is hidden after the session ends');
  // Existing class portraits resume automatically, with no enrollment or new profile.
  run('currentStudents().splice(0); currentStudents().push(normalizeStudent({id:"returning",photo:"data:image/jpeg;base64,dGVzdA==",faceSamples:[Array(128).fill(.15)],games:12,totalScore:1700})); modelsReady=false; recognitionReady=false; stream={}; startSession();');
  for (let i=0;i<8;i++) await Promise.resolve();
  assert.equal(run('recognitionReady'), true, 'class entry lazily restores recognition models for saved faces');
  assert.equal(run('faceTrackingNeeded()'), true, 'saved class players enable face resume between turns');
  const observeReturningFace = firstAt => {
    for (const at of [firstAt,firstAt+200,firstAt+400]) run(`updateFaceIdentity({descriptor:Array(128).fill(.155),detection:{box:{width:200,height:240},score:.95}},${at});`);
  };
  for (const style of ['glass','lite']) {
    run(`applyAppearance("${style}"); enterIdle();`);
    const beforeDecline = run('JSON.stringify(currentStudents()[0])');
    const usedBeforePrompt = run('getCurrentClass().usedQuestionIds.length');
    observeReturningFace(1000);
    assert.equal(run('phase'), 'idle', `${style}: recognising a face never starts play`);
    assert.equal(run('pendingFaceResume.studentId'), 'returning');
    assert.equal(nodes.get('resumeConfirmModal').classList.contains('hidden'), false);
    assert.equal(run('faceTrackingNeeded()'), false, 'recognition pauses while awaiting a decision');
    assert.equal(run('getCurrentClass().usedQuestionIds.length'), usedBeforePrompt, 'prompt reserves no questions');
    assert.equal(context.document.activeElement, nodes.get('resumeConfirmNo'), 'No has default keyboard focus');
    documentEvents.get('keydown')({key:'Tab',preventDefault(){}});
    assert.equal(context.document.activeElement, nodes.get('resumeConfirmYes'));
    documentEvents.get('keydown')({key:'Tab',shiftKey:true,preventDefault(){}});
    assert.equal(context.document.activeElement, nodes.get('resumeConfirmNo'));
    nodes.get('resumeConfirmNo').click();
    assert.equal(run('phase'), 'idle');
    assert.equal(run('pendingFaceResume'), null);
    assert.equal(run('JSON.stringify(currentStudents()[0])'), beforeDecline, 'No changes neither the score nor face samples');
    observeReturningFace(1600);
    assert.equal(run('pendingFaceResume'), null, 'declined face does not immediately prompt again');
    run('handleNoFace();');
    observeReturningFace(2200);
    assert.ok(run('pendingFaceResume'), 'returning after leaving the frame can prompt again');
    nodes.get('resumeConfirmYes').click();
    assert.equal(run('phase'), 'countdown', `${style}: Yes starts the recognised player`);
    assert.equal(run('activeStudentId'), 'returning');
    assert.equal(run('currentStudents().length'), 1);
    assert.equal(run('currentStudents()[0].totalScore'), 1700);
  }
  run('startRound(currentStudents()[0]); round.results=Array(8).fill("wrong"); finishRound(); nextPlayer();');
  for (const at of [1600,1800,2000]) run(`updateFaceIdentity({descriptor:Array(128).fill(.151),detection:{box:{width:200,height:240},score:.95}},${at});`);
  assert.equal(run('phase'), 'idle', 'Next player does not immediately restart the face still in frame');
  run('handleNoFace();');
  for (const at of [2200,2400,2600]) run(`updateFaceIdentity({descriptor:Array(128).fill(.151),detection:{box:{width:200,height:240},score:.95}},${at});`);
  assert.equal(run('phase'), 'idle');
  assert.ok(run('pendingFaceResume'), 'returning player is asked again before another turn');
  nodes.get('resumeConfirmYes').click();
  assert.equal(run('phase'), 'countdown', 'confirmed returning player can resume without a turn limit');
  run('enterIdle(); askFaceResumeConfirmation(currentStudents()[0]);');
  documentEvents.get('keydown')({key:'Escape',preventDefault(){}});
  assert.equal(run('pendingFaceResume'), null, 'Escape declines the prompt');
  assert.equal(run('phase'), 'idle');
  run('askFaceResumeConfirmation(currentStudents()[0]); session={...session}; confirmFaceResume();');
  assert.equal(run('phase'), 'idle', 'a stale confirmation cannot start a different session');
  run('enterIdle();');
  nodes.get('faceResumeToggle').click();
  assert.equal(run('DB.settings.faceResume'), false);
  run('DB=loadDB();');
  assert.equal(run('DB.settings.faceResume'), false, 'face-resume option persists');
  assert.equal(run('faceTrackingNeeded()'), false, 'teacher can disable automatic face resume');
  run('stopSession(); changePlayMode("single"); stream={}; startSession();');
  assert.equal(run('faceResumeEnabled()'), false, 'single player never resumes by face');
  assert.equal(run('faceRecognitionRequested()'), false);
  run('askFaceResumeConfirmation(currentStudents()[0]);');
  assert.equal(run('pendingFaceResume'), null, 'single player never asks for face confirmation');
  run('stopSession();');
  console.log('Passed: unlimited class replay, three-turn cadence through replay, class face confirmation in both styles, face-resume toggle and visible Stop across questions/countdowns/results.');
  // Real hand-result routing through the same buttons used by touch input.
  run('stream=null; abortSession(); DB=normalizeDB(null); DB.settings.music=false; DB.settings.sfx=false; createClass("Palm navigation");');
  run(readFileSync('palm-control.js', 'utf8'));
  nodes.get('palmPreview').offsetParent = null;
  run('palmEngine={async send(){}}; stream={}; renderControlMode(); showLobby();');
  const openPalm = Array.from({length:21}, () => ({x:.5,y:.6}));
  openPalm[0] = {x:.5,y:.8};
  for (let i=0;i<4;i++) {
    const base=5+i*4, x=.5+(i-1.5)*.06;
    for (let j=0;j<4;j++) openPalm[base+j]={x,y:[.6,.5,.4,.2][j]};
  }
  const gesture = side => {
    context.palmResult = {multiHandLandmarks:side?[openPalm]:[],
      multiHandedness:side?[{label:side==='left'?'Right':'Left',score:.99}]:[]};
    run('palmRequestGeneration=palmGeneration; handlePalmResults(palmResult);');
  };
  gesture(null); gesture('right');
  assert.equal(run('phase'), 'idle', 'right palm starts a class session');
  gesture('right');
  assert.equal(run('currentStudents().length'), 0, 'held start palm cannot also create a player');
  gesture(null); gesture('right');
  assert.equal(run('phase'), 'countdown', 'right palm starts the next numbered player');
  assert.equal(run('currentStudents().length'), 1);
  gesture('right');
  run('startRound(currentStudents()[0]);');
  gesture('right');
  assert.equal(run('round.answered'), false, 'navigation palm cannot carry into the first answer');
  gesture(null); gesture('left');
  assert.equal(run('round.answered'), true, 'fresh left palm still answers immediately');
  run('round.results=Array(8).fill("wrong"); finishRound();');
  gesture('right');
  assert.equal(run('phase'), 'round', 'last answer cannot dismiss the result');
  gesture(null); gesture('right');
  assert.equal(run('phase'), 'idle', 'right palm continues to next player entry');
  gesture('right');
  assert.equal(run('currentStudents().length'), 1, 'one gesture cannot skip entry and create another player');
  gesture(null); gesture('left');
  assert.equal(nodes.get('leaderboardOverlay').classList.contains('hidden'), false, 'left palm opens ranks');
  gesture('right');
  assert.equal(nodes.get('leaderboardOverlay').classList.contains('hidden'), false, 'held palm cannot close the next screen');
  run('palmRequestGeneration=palmGeneration-1; handlePalmResults(palmResult);');
  assert.equal(nodes.get('leaderboardOverlay').classList.contains('hidden'), false, 'stale inference cannot navigate');
  gesture(null); gesture('right');
  assert.equal(nodes.get('leaderboardOverlay').classList.contains('hidden'), true, 'right palm returns from ranks');
  run('openTeacher();');
  assert.equal(run('palmTrackingNeeded()'), false, 'settings suspend palm navigation');
  gesture(null); gesture('right');
  assert.equal(run('currentStudents().length'), 1, 'settings cannot start a player');
  run('closeTeacherPanel(); pendingFaceCapture={};');
  assert.equal(run('palmControlContext()'), null, 'palm navigation cannot confirm a photo identity');
  run('pendingFaceCapture=null; stream=null; abortSession(); changePlayMode("single"); startSession(); startRound(currentStudents()[0]); stream={}; renderControlMode();');
  run('round.results=Array(8).fill("wrong"); finishRound();');
  gesture(null); gesture('left');
  assert.equal(run('phase'), 'countdown', 'left palm replays single player');
  run('startRound(currentStudents()[0]); round.results=Array(8).fill("wrong"); finishRound();');
  gesture(null); gesture('right');
  assert.equal(run('phase'), 'lobby', 'right palm returns solo results to menu');
  gesture('right');
  assert.equal(run('phase'), 'lobby', 'held menu palm cannot restart the game');
  run('stream=null; changePlayMode("class"); startSession(); stream={}; askFaceResumeConfirmation(currentStudents()[0]);');
  gesture('right');
  assert.ok(run('pendingFaceResume'), 'an already-raised palm cannot approve recognition');
  gesture(null); gesture('left');
  assert.equal(run('pendingFaceResume'), null, 'fresh left palm selects No');
  assert.equal(run('phase'), 'idle');
  gesture('left');
  assert.equal(nodes.get('leaderboardOverlay').classList.contains('hidden'), true, 'No cannot also open ranks');
  run('askFaceResumeConfirmation(currentStudents()[0]);');
  gesture('right');
  assert.ok(run('pendingFaceResume'), 'a new prompt always needs a fresh gesture');
  gesture(null); gesture('right');
  assert.equal(run('phase'), 'countdown', 'fresh right palm selects Yes');
  run('enterIdle(); askFaceResumeConfirmation(currentStudents()[0]);');
  nodes.get('stopGameBtn').click();
  assert.equal(run('pendingFaceResume'), null, 'Stop clears the pending face decision');
  run('confirmFaceResume();');
  assert.equal(run('phase'), 'lobby', 'a stale Yes after Stop cannot restart play');
  run('stream=null; syncTracking();');
  assert.equal(run('palmTrackingNeeded()'), false, 'camera-off navigation uses no inference');
  // Game extras: golden question, optional bonus shot, combo UI and badges.
  run('stopSession(); createClass("Bonus test"); DB.settings.extras=true; startSession(); startNumberedPlayer(); startRound(currentStudents()[0]);');
  for (let i = 0; i < 8; i++) run(`${correctAnswer} advanceRound();`);
  assert.equal(run('round.goldenHit'), true, 'question 8 is golden when extras are on');
  assert.equal(run('phase'), 'bonus', 'a perfect round prompts for the bonus shot');
  assert.equal(run('round.points'), 2675, 'golden question doubles its own award');
  run('startBonusShot();');
  assert.equal(run('round.bonusShot.active'), true);
  run(correctAnswer);
  assert.equal(run('round.bonus'), 'won');
  assert.equal(run('round.points'), 2925, 'bonus shot adds 250 arcade points before the perfect bonus');
  run('finishRound();');
  assert.equal(run('round.gained'), 8, 'bonus points never change marks');
  assert.equal(run('round.points'), 3225, 'perfect bonus follows the bonus shot');
  assert.ok(run('currentStudents()[0].badges.includes("perfect")'), 'perfect badge unlocks');
  assert.ok(run('currentStudents()[0].badges.includes("golden")'), 'golden badge unlocks');
  assert.ok(run('currentStudents()[0].badges.includes("streak5")'), 'five-streak badge unlocks');
  assert.ok(run('currentStudents()[0].badges.includes("speed2")'), 'quick-draw badge unlocks');
  assert.equal(run('DB.history.at(-1).bonus'), 'won', 'bonus result persists in history');
  run('enterIdle(); DB.settings.extras=false; startRound(currentStudents()[0]);');
  for (let i = 0; i < 8; i++) run(`${correctAnswer} advanceRound();`);
  assert.equal(run('phase'), 'round', 'extras off skips the bonus prompt');
  assert.equal(run('round.goldenHit'), false, 'extras off disables the golden question');
  assert.equal(run('round.points'), 2600, 'extras off restores classic scoring');
  run('DB.settings.extras=true; nextPlayer();');
  console.log('Passed: golden question, optional bonus shot, combo tiers, badges and the extras toggle.');
  console.log('Passed: instant palm navigation for class start, player entry, results, ranks, solo replay and menu; held/stale gesture, settings and photo-confirmation guards.');
  console.log('Passed: lazy model loading, recognition separation, no render loop, and face inference gated by explicit use, visibility, overlays and answer state.');
  console.log('Passed: three-turn leaderboard cadence, manual view counter, rank persistence, attached character bodies, promotion/demotion and reduced motion.');
  console.log('Passed: local face recognition, stable multi-frame identity, ambiguity rejection, profile persistence/learning, existing-photo indexing, multiple-face rejection, scores and class isolation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
