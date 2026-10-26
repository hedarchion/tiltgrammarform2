const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = readFileSync('index.html', 'utf8');
const codec = require('../homework.js');

function element(hidden = false) {
  const classes = new Set(hidden ? ['hidden'] : []);
  const listeners = new Map();
  return {
    value: '', innerHTML: '', textContent: '', children: [], disabled: false, inert: false,
    style: { setProperty() {} },
    dataset: {},
    classList: {
      add(...names) { names.forEach(name => classes.add(name)); },
      remove(...names) { names.forEach(name => classes.delete(name)); },
      contains(name) { return classes.has(name); },
      toggle(name, on) { if (on ?? !classes.has(name)) classes.add(name); else classes.delete(name); }
    },
    appendChild(child) { this.children.push(child); },
    querySelector() { return element(); },
    addEventListener(name, fn) { listeners.set(name, fn); },
    click() { if (!this.disabled) listeners.get('click')?.(); },
    setAttribute(name, value) { this[name] = value; },
    focus() { context.document.activeElement = this; },
    select() {},
    remove() {},
    getContext() { return { clearRect() {}, translate() {}, scale() {}, drawImage() {} }; },
    toDataURL() { return 'data:image/jpeg;base64,dGVzdA=='; }
  };
}

const nodes = new Map([...html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)]
  .map(match => [match[1], element(/class="[^"]*\bhidden\b/.test(match[0]))]));
for (const id of ['studioTopicName', 'studioTopicForm', 'studioQBefore', 'studioQAfter', 'studioQWrong',
  'studioQOptionA', 'studioQOptionB', 'studioQCorrect', 'studioQTip']) {
  nodes.set(id, element());
}

const storage = new Map();
const location = {
  href: 'https://example.test/app/',
  origin: 'https://example.test',
  pathname: '/app/',
  search: '',
  hash: ''
};
function navigate(url) {
  const parsed = new URL(url, location.origin);
  location.href = parsed.href;
  location.pathname = parsed.pathname;
  location.search = parsed.search;
  location.hash = parsed.hash;
}
const history = {
  replaceState(state, title, url) { navigate(url.startsWith('/') ? `${location.origin}${url}` : url); }
};
const context = vm.createContext({
  console,
  performance: { now: () => 1000 },
  window: { HomeworkCodec: codec, confirm: () => true, addEventListener() {}, GlassRenderer: { start() {}, stop() {} } },
  navigator: { mediaDevices: { getUserMedia() { throw new Error('no camera'); } } },
  localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  setTimeout() { return 1; },
  clearTimeout() {},
  setInterval() { return 2; },
  clearInterval() {},
  requestAnimationFrame() { return 1; },
  Blob,
  Response,
  CompressionStream,
  DecompressionStream,
  TextEncoder,
  TextDecoder,
  btoa,
  atob,
  URL,
  URLSearchParams,
  location,
  history,
  document: {
    hidden: false,
    activeElement: null,
    body: element(),
    head: element(),
    addEventListener() {},
    getElementById(id) { assert.ok(nodes.has(id), `Missing HTML element ${id}`); return nodes.get(id); },
    querySelectorAll() { return []; },
    querySelector(selector) { return selector.startsWith('#') ? nodes.get(selector.slice(1)) : element(); },
    createElement() { return element(); },
    execCommand() { return true; }
  }
});
const run = code => vm.runInContext(code, context);

run(readFileSync('questions.js', 'utf8'));
run(readFileSync('questions-form1.js', 'utf8'));
run(readFileSync('app.js', 'utf8').replace(/init\(\);\s*$/, ''));
run('var actualIndexSavedFacePhotos=indexSavedFacePhotos; indexSavedFacePhotos = async () => {}; init();');

(async () => {
  assert.ok(nodes.get('studioOverlay').classList.contains('hidden'), 'studio starts closed');
  assert.equal(run('DB.customTopics.length'), 0);

  run('openStudio();');
  assert.ok(!nodes.get('studioOverlay').classList.contains('hidden'), 'studio opens');
  assert.ok(nodes.get('studioTopicList').innerHTML.includes('BUILT-IN SETS'), 'built-in sets are listed');
  run('studioState.selected = studioSets().builtin[0].key; renderStudio();');
  assert.ok(nodes.get('studioMain').innerHTML.includes('BUILT-IN QUESTION SET'), 'built-in sets can be viewed read-only');
  assert.ok(nodes.get('studioMain').innerHTML.includes('DUPLICATE TO MY TOPICS'), 'built-in sets can be copied');

  run('startNewStudioTopic();');
  nodes.get('studioTopicName').value = 'Homework Test Set';
  nodes.get('studioTopicForm').value = '1';
  run('saveStudioTopic();');
  assert.equal(run('DB.customTopics.length'), 1);
  assert.equal(run('DB.customTopics[0].questions.length'), 0);
  assert.equal(run('studioState.selected'), run('studioTopicKey(DB.customTopics[0])'));

  for (let index = 0; index < 8; index += 1) {
    run('startStudioQuestion();');
    nodes.get('studioQBefore').value = 'Aina';
    nodes.get('studioQAfter').value = `to the library ${index}.`;
    nodes.get('studioQWrong').value = 'walk';
    nodes.get('studioQOptionA').value = 'walked';
    nodes.get('studioQOptionB').value = 'walking';
    nodes.get('studioQCorrect').value = String(index % 2);
    nodes.get('studioQTip').value = 'Use the correct tense.';
    run('saveStudioQuestion();');
  }
  assert.equal(run('DB.customTopics[0].questions.length'), 8);
  assert.equal(run('DB.customTopics[0].questions[0].w'), 'walk');
  assert.match(run('sentenceMarkup(DB.customTopics[0].questions[0])'), /error-word[^>]*>walk/);
  assert.equal(run('DB.customTopics[0].questions[1].answer'), 1);

  run('saveDB();');
  assert.equal(JSON.parse(storage.get('grammartilt_v2')).customTopics[0].questions.length, 8, 'custom topics persist');

  await run('openHomeworkShare();');
  const link = nodes.get('shareLink').value;
  assert.match(link, /^https:\/\/example\.test\/app\/#homework=1\./);
  assert.ok(!nodes.get('shareOverlay').classList.contains('hidden'));
  const token = codec.tokenFromLocation(link);
  const decoded = await codec.decode(token);
  assert.equal(decoded.title, 'Homework Test Set');
  assert.equal(decoded.questions.length, 8);
  assert.equal(decoded.questions[0].w, 'walk');

  navigate(link);
  await run('loadHomeworkFromHash();');
  assert.equal(run('phase'), 'homework');
  assert.equal(run('pendingHomework.questions.length'), 8);
  assert.equal(nodes.get('homeworkStartBtn').disabled, false);
  assert.ok(!nodes.get('homework').classList.contains('hidden'), 'homework landing is shown');

  const normalHistory = run('DB.history.length');
  const normalSoloGames = run('DB.solo.students[0].games');
  run('startHomework();');
  assert.equal(run('isHomework()'), true);
  assert.equal(run('session.active'), true);
  assert.equal(run('getCurrentClass().name'), 'Custom homework');
  assert.equal(run('selectedBank().length'), 8);
  assert.equal(run('phase'), 'countdown');

  run('startRound(homeworkMode.class.students[0]);');
  assert.equal(run('round.qs.length'), 8);
  assert.ok(run('round.qs.every(question => question.topic === "Homework Test Set")'));
  for (let index = 0; index < 8; index += 1) {
    run('answer(correctIndex(currentQuestion()) === 0 ? "left" : "right"); advanceRound();');
  }
  assert.equal(run('phase'), 'round');
  assert.equal(run('round.gained'), 8);
  assert.equal(run('DB.history.length'), normalHistory, 'homework does not pollute saved history');
  assert.equal(run('DB.solo.students[0].games'), normalSoloGames, 'homework does not change the solo profile');

  run('replayPlayer();');
  assert.equal(run('phase'), 'countdown');
  assert.equal(run('homeworkMode.class.usedQuestionIds.length'), 0, 'homework replay samples fresh from the shared set');

  run('stopSession();');
  assert.equal(run('homeworkMode'), null);
  assert.equal(run('isHomework()'), false);
  assert.ok(!location.hash, 'leaving homework removes its hash');
  assert.ok(!nodes.get('lobby').classList.contains('hidden'), 'leaving homework returns to the normal lobby');

  run('openStudio();');
  run(`studioState.selected = studioTopicKey(DB.customTopics[0]); renderStudio();`);
  run('editStudioTopic();');
  nodes.get('studioTopicName').value = 'Edited Homework Set';
  run('saveStudioTopic();');
  assert.equal(run('DB.customTopics[0].name'), 'Edited Homework Set');
  const questionId = run('DB.customTopics[0].questions[0].id');
  run(`editStudioQuestion('${questionId}');`);
  nodes.get('studioQBefore').value = 'Aina';
  nodes.get('studioQAfter').value = 'to the library 0.';
  nodes.get('studioQOptionB').value = 'walk';
  run('saveStudioQuestion();');
  assert.equal(run('DB.customTopics[0].questions[0].options[1]'), 'walk', 'questions can be edited');
  run(`deleteStudioQuestion('${questionId}');`);
  assert.equal(run('DB.customTopics[0].questions.length'), 7, 'questions can be deleted');
  run('deleteStudioTopic();');
  assert.equal(run('DB.customTopics.length'), 0, 'topics can be deleted');

  navigate('https://example.test/app/?homework=old&keep=1');
  run('clearHomeworkHash();');
  assert.equal(location.href, 'https://example.test/app/?keep=1', 'query homework links are cleared without losing other parameters');

  console.log('Passed: studio topic/question create, edit and delete, persistence, share link, homework landing, isolated play, replay and exit.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
