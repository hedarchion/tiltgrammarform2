const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map();
function element() {
  return { textContent: '', innerHTML: '', style: {}, children: [], setAttribute() {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return true; } },
    querySelector() { return element(); } };
}
let seed = 42;
const seededMath = Object.create(Math);
seededMath.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
const saved = new Map();
let storageFails = false;
const context = vm.createContext({
  console: {...console, warn() {}}, Math: seededMath, window: {}, performance: { now: () => 1000 },
  localStorage: { getItem(key) { return saved.get(key); }, setItem(key, value) { if (storageFails) throw new Error("Storage unavailable"); saved.set(key, value); } },
  setTimeout() { return 1; }, clearTimeout() {},
  document: { hidden: false, body: element(),
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); } }
});
const run = code => vm.runInContext(code, context);
run(fs.readFileSync('questions.js', 'utf8'));
run(fs.readFileSync('questions-form1.js', 'utf8'));
run(fs.readFileSync('app.js', 'utf8').replace(/init\(\);\s*$/, ''));
const bank = run('QUESTION_BANK');
assert.equal(bank.length, 1000);
assert.equal(new Set(bank.map(q => q.id)).size, 1000, 'unique stable question IDs');
assert.equal(new Set(bank.map(q => q.s)).size, 1000, 'unique sentence contexts');
const topics = new Map();
for (const q of bank) {
  topics.set(q.topic, (topics.get(q.topic) || 0) + 1);
  assert.equal(q.s.match(/\{x\}/g)?.length, 1, `${q.id} has one error marker`);
  assert.ok(!/\{\d+\}|undefined/.test(q.s), `${q.id} placeholders resolved`);
  assert.equal(q.options.length, 2);
  assert.ok(q.answer === 0 || q.answer === 1);
  assert.equal(q.options[q.answer], q.c);
  assert.equal(q.options[1 - q.answer], q.f);
  assert.notEqual(q.c, q.f);
  assert.notEqual(q.w, q.c);
  assert.notEqual(q.w, q.f, `${q.id} does not reveal the answer by repeating the underlined error`);
  assert.ok(q.tip.length > 20);
  assert.ok(!/, (My|The|Our|His|Their)\b/.test(q.s), `${q.id} capitalisation after introductory phrase`);
}
assert.equal(topics.size, 20);
assert.equal(new Set(bank.map(q => q.patternId)).size,100);
for (const [topic, count] of topics) assert.equal(count, 50, topic);
assert.equal(bank.filter(q => q.answer === 0).length, 500, 'answer positions balanced');
const honest = bank.filter(q => q.s.includes('honest person'));
assert.equal(honest.length, 10);
honest.forEach(q => assert.equal(q.c, 'an', 'honest has a silent h'));

// Exercise the real round and redemption selectors for 30 players x 3 turns.
run('DB.classes.test={id:"test",name:"Test class",students:[],usedQuestionIds:[]}; DB.activeClass="test"; DB.settings.music = false; DB.settings.sfx = false; session = {active:true, rounds:0, questionDeck:shuffledQuestions(), questionCycles:0};');
const seen = new Set();
const form2Patterns = [];
const form2TopicSequence = [];
const offeredTopics = new Map();
for (let pass = 0; pass < 3; pass++) {
  for (let player = 0; player < 30; player++) {
    run('startRound({id:"test-player"});');
    const questions = run('round.qs');
    assert.equal(questions.length, 8);
    assert.equal(new Set(questions.map(q => q.topic)).size, 8, 'eight distinct topics per turn');
    run('startRedemption();');
    const redemption = run('round.redemption.q');
    for (const q of [...questions, redemption]) {
      assert.ok(!seen.has(q.id), `Repeated question ${q.id}`);
      seen.add(q.id);
      assert.ok(!form2Patterns.slice(-24).includes(q.patternId), 'Form 2 construction not repeated within 24 questions');
      form2Patterns.push(q.patternId);
      form2TopicSequence.push(q.topic);
      offeredTopics.set(q.topic, (offeredTopics.get(q.topic) || 0) + 1);
    }
  }
  if (pass < 2) {
    run('session=null; round=null; DB=loadDB(); session={active:true,rounds:0,classId:DB.activeClass,questionDeck:shuffledQuestions()};');
  }
}
assert.equal(seen.size, 810);
assert.ok(form2TopicSequence.slice(20,100).some((topic,i)=>topic!==form2TopicSequence[i]),'topic order does not repeat a fixed 20-question cycle');
assert.equal(run('session.questionDeck.length'), 190);
assert.equal(run('getCurrentClass().usedQuestionIds.length'), 810);
assert.ok(Math.max(...offeredTopics.values()) - Math.min(...offeredTopics.values()) <= 3, 'class-wide coverage stays balanced');
// Simulate closing the app and returning tomorrow in the same class.
run('session=null; DB=loadDB(); session={active:true, rounds:0, classId:DB.activeClass, questionDeck:shuffledQuestions()};');
assert.equal(run('unusedQuestionCount()'), 190, 'used history survives full database reload');
for (let i = 0; i < 190; i++) {
  const q = run('pickQuestion();');
  assert.ok(!seen.has(q.id)); seen.add(q.id);
}
assert.equal(seen.size, 1000, 'entire bank consumed once');
assert.equal(run('pickQuestion();'), null, 'bank exhaustion never silently repeats');
run('session=null; DB=loadDB(); session={active:true, questionDeck:shuffledQuestions()};');
assert.equal(run('pickQuestion();'), null, 'exhausted history remains exhausted tomorrow');
assert.equal(run('unusedQuestionCount()'), 0);
run('DB.classes.other={id:"other",name:"Other class",students:[],usedQuestionIds:[]}; DB.activeClass="other"; session={active:true, questionDeck:shuffledQuestions()};');
assert.equal(run('unusedQuestionCount()'), 1000, 'another class has its own question history');
assert.ok(run('pickQuestion();'));
const beforeFailure = run('getCurrentClass().usedQuestionIds.length');
storageFails = true;
assert.equal(run('pickQuestion();'), null, 'questions cannot be served without durable progress');
assert.equal(run('getCurrentClass().usedQuestionIds.length'), beforeFailure, 'failed reservation rolled back');
storageFails = false;
assert.ok(run('pickQuestion();'));
console.log('Passed: 1,000 questions, 90 turns plus 90 redemptions without repeats, persistence across days, full-bank exhaustion without recycling and separate class histories.');

// Form switching keeps legacy classes on Form 2 and retains both histories.
run('session=null; DB=normalizeDB({activeClass:"forms",classes:{forms:{name:"Forms",students:[],usedQuestionIds:[QUESTION_BANK[0].id]}}});');
assert.equal(run('selectedForm()'), 2);
assert.equal(run('unusedQuestionCount()'), 999);
run('getCurrentClass().form=1; saveDB(); DB=loadDB();');
assert.equal(run('selectedForm()'), 1);
assert.equal(run('unusedQuestionCount()'), 1000);
const f1 = run('FORM1_BANK');
assert.equal(f1.length, 1000);
assert.equal(new Set(f1.map(q => q.id)).size, 1000);
assert.equal(new Set(f1.map(q => q.s)).size, 1000);
assert.equal(new Set(f1.map(q => q.topic)).size, 10);
assert.equal(new Set(f1.map(q => q.patternId)).size, 50);
for (const q of f1) {
  assert.equal(q.s.match(/\{x\}/g)?.length, 1);
  assert.equal(q.options[q.answer], q.c);
  assert.notEqual(q.w, q.c);
  assert.notEqual(q.w, q.f);
  assert.notEqual(q.c, q.f);
  assert.ok(q.s.split(' ').length <= 15, 'short Form 1 sentences');
  assert.ok(!bank.some(old => old.id === q.id));
}
run('DB.settings.music=false; DB.settings.sfx=false; session={active:true,classId:DB.activeClass,questionDeck:shuffledQuestions()};');
const f1Seen = new Set();
const f1Patterns = [];
for (let turn=0; turn<90; turn++) {
  if (turn===45) run('session=null; round=null; DB=loadDB(); session={active:true,classId:DB.activeClass,questionDeck:shuffledQuestions()};');
  run('startRound({id:"test-player"}); startRedemption();');
  for (const q of run('[...round.qs, round.redemption.q]')) {
    assert.ok(q.id.startsWith('f1_'));
    assert.ok(!f1Seen.has(q.id));
    f1Seen.add(q.id);
    assert.ok(!f1Patterns.slice(-24).includes(q.patternId), 'Form 1 construction not repeated within 24 questions');
    f1Patterns.push(q.patternId);
  }
}
assert.equal(f1Seen.size,810);
assert.ok(f1Patterns.slice(50,100).some((pattern,i)=>pattern!==f1Patterns[i]),"construction order does not repeat a fixed 50-question cycle");
assert.equal(run('unusedQuestionCount()'),190);
run('changeForm(2);');
assert.equal(run('selectedForm()'),1,'cannot switch during a session');
run('session=null; getCurrentClass().form=2;');
assert.equal(run('unusedQuestionCount()'),999,'Form 2 history remains intact');
run('getCurrentClass().form=1; saveDB(); DB=loadDB();');
assert.equal(run('unusedQuestionCount()'),190,'Form 1 history persists across reloads');
console.log('Passed: Form 1 bank structure, 90 turns and redemptions, saved form choice, session lock and independent form histories.');

run('session=null; DB=normalizeDB(null); changeForm(1);');
assert.equal(run('selectedForm()'),1,'choose Form 1 before creating a class');
assert.equal(run('loadDB().defaultForm'),1,'pre-class choice survives reload');
assert.equal(elements.get('formSelect').disabled,false,'selector enabled without a class');
run('createClass("New Form 1 class");');
assert.equal(run('getCurrentClass().form'),1,'new class inherits chosen form');
run('changeForm(2);');
assert.equal(run('selectedForm()'),2,'existing class can switch forms');
console.log('Passed: choosing a form before class creation and inheriting the selection.');

assert.equal(run('normalizeDB({settings:{}}).settings.palmHoldMs'),800,'old settings retain standard hold');
run('setPalmHoldMs(1500); DB=loadDB();');
assert.equal(run('DB.settings.palmHoldMs'),1500,'palm timing survives reload');
assert.equal(elements.get('palmHold').value,'1500');
assert.equal(elements.get('palmHoldHint').textContent,'Hold 1.5s · lower hand to reset');
run('setPalmHoldMs(12);');
assert.equal(run('DB.settings.palmHoldMs'),1500,'invalid duration ignored');
storageFails=true;
run('setPalmHoldMs(2000);');
assert.equal(run('DB.settings.palmHoldMs'),1500,'failed save restores prior hold duration');
storageFails=false;
console.log('Passed: palm duration persistence, controls, instructions and failed-save rollback.');

console.log('Passed: balanced topics, changing topic order and 24-question construction spacing for both forms, including saved history and redemption.');
