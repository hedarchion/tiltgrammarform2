const assert = require('node:assert/strict');
const homework = require('../homework.js');

const questions = [
  { s: 'Aina {x} to the library yesterday.', options: ['walked', 'walking'], answer: 0, tip: 'Past simple.' },
  { s: 'The boys {x} football when it rained.', options: ['played', 'were playing'], answer: 1, tip: 'Past continuous.' },
  { s: 'She has {x} her homework.', options: ['finish', 'finished'], answer: 1, tip: '' }
];

(async () => {
  const set = { title: 'Week 3 · Past tenses', topic: 'Past tenses', form: 1, questions };
  const token = await homework.encode(set);
  assert.match(token, /^1\./, 'modern browsers use compressed links');
  assert.ok(!/[+/=]/.test(token), 'URL fragment uses base64url characters only');
  const decoded = await homework.decode(token);
  assert.equal(decoded.title, set.title);
  assert.equal(decoded.topic, set.topic);
  assert.equal(decoded.form, 1);
  assert.deepEqual(decoded.questions, questions);
  assert.equal(homework.tokenFromLocation(`https://example.test/app/#homework=${token}`), token);
  assert.equal(homework.tokenFromLocation(`https://example.test/app/?homework=${token}`), token);
  assert.equal(homework.tokenFromLocation(`https://example.test/app/?hw=${token}#top`), token);
  assert.equal(homework.shareUrl(`https://example.test/app/#old`, token), `https://example.test/app/#homework=${token}`);

  const unicode = { title: 'Kata nama — 中文', topic: 'Nouns', form: 2, questions: [{
    s: 'This is {x} orange.', options: ['a', 'an'], answer: 1, tip: 'Use “an” before a vowel sound.'
  }] };
  assert.equal((await homework.decode(await homework.encode(unicode))).title, unicode.title);

  const originalCompression = globalThis.CompressionStream;
  globalThis.CompressionStream = undefined;
  const plainToken = await homework.encode(set);
  assert.match(plainToken, /^0\./, 'fallback links stay readable without CompressionStream');
  assert.deepEqual((await homework.decode(plainToken)).questions, questions);
  globalThis.CompressionStream = class { constructor() { throw new Error('unsupported format'); } };
  const unsupportedToken = await homework.encode(set);
  assert.match(unsupportedToken, /^0\./, 'unsupported compression falls back to a plain link');
  assert.deepEqual((await homework.decode(unsupportedToken)).questions, questions);
  const huge = Array.from({ length: 60 }, (_, index) => ({
    s: `${'A long sentence '.repeat(30)}${index} {x} ${'ends here '.repeat(30)}`,
    options: ['x'.repeat(120), 'y'.repeat(120)],
    answer: 0,
    tip: 'z'.repeat(400)
  }));
  await assert.rejects(() => homework.encode({ title: 'Too large', questions: huge }), /too large/);
  globalThis.CompressionStream = originalCompression;

  const many = Array.from({ length: 70 }, (_, index) => ({
    s: `Question ${index} {x} here.`, options: ['a', 'b'], answer: index % 2, tip: ''
  }));
  const capped = homework.normalizeSet({ title: 'Many', questions: many });
  assert.equal(capped.questions.length, homework.MAX_QUESTIONS);
  assert.equal(homework.normalizeSet({ title: 'Broken', questions: [{ s: 'No blank', options: ['a', 'b'] }] }), null);
  assert.equal(homework.normalizeSet({ title: 'Empty', questions: [] }), null);

  for (const bad of ['', 'x', '1.not-base64', '1.', '9.abc']) {
    await assert.rejects(() => homework.decode(bad), /link|format|damaged|opened|version/i);
  }
  console.log('Passed: homework link encode/decode, compression fallback, URL parsing, validation and limits.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
