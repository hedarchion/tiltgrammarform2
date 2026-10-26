"use strict";

const $ = (id) => document.getElementById(id);
// Layout and effects follow the selected UI; input and scoring stay independent.
function mobileDevice() { return Boolean(window.matchMedia?.("(max-width: 1100px), (pointer: coarse)").matches); }
function compactView() { return selectedAppearance() === "lite" || mobileDevice(); }
function reducedMotion() { return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); }
function liteEffects() { return selectedAppearance() === "lite"; }
let renderedAppearance = null;
function appearanceKey() {
  return mobileDevice() ? (isSolo() ? "mobileSoloAppearance" : "mobileClassAppearance")
    : (isSolo() ? "soloAppearance" : "classAppearance");
}
function selectedAppearance() { return DB.settings[appearanceKey()] || (mobileDevice() || isSolo() ? "lite" : "glass"); }
function setAppearance(value) {
  if (!["glass", "lite"].includes(value)) return;
  if (value === "glass" && selectedAppearance() !== "glass" && mobileDevice()
    && !window.confirm("Are you sure you want to use Glass? It uses more power.")) {
    renderAppearance();
    return;
  }
  applyAppearance(value);
}
function applyAppearance(value) {
  if (!["glass", "lite"].includes(value)) return;
  const key = appearanceKey(), previous = DB.settings[key];
  DB.settings[key] = value;
  if (!saveDB()) DB.settings[key] = previous;
  renderAppearance();
  setCameraUI();
}
function renderAppearance() {
  const appearance = selectedAppearance(), glass = appearance === "glass";
  $("glassThemeStyles").disabled = !glass;
  $("glassThemeStyles").media = glass ? "all" : "not all";
  $("liteThemeStyles").disabled = glass;
  $("liteThemeStyles").media = glass ? "not all" : "all";
  document.body.classList.toggle("theme-glass", glass);
  document.body.classList.toggle("theme-lite", !glass);
  $("glassAppearanceBtn").setAttribute("aria-pressed", String(glass));
  $("liteAppearanceBtn").setAttribute("aria-pressed", String(!glass));
  $("appearanceSelect").value = appearance;
  if (renderedAppearance === appearance) return;
  renderedAppearance = appearance;
  if (glass) loadOptionalScript("glass.js?v=20261025-liquid-lens", "GlassRenderer").then(() => {
    if (selectedAppearance() === "glass") window.GlassRenderer.start();
  }).catch(error => { console.warn("Glass effects unavailable; using CSS glass.", error); });
  else window.GlassRenderer?.stop();
}
const optionalScripts = new Map();
function loadOptionalScript(src, globalName) {
  if (window[globalName]) return Promise.resolve();
  if (optionalScripts.has(src)) return optionalScripts.get(src);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => { script.remove(); optionalScripts.delete(src); reject(new Error(`Could not load ${src}`)); };
    document.head.appendChild(script);
  });
  optionalScripts.set(src, promise);
  return promise;
}
const STORAGE_KEY = "grammartilt_v2";
const MODEL_URL = "models";
const QUESTION_BANK = Array.isArray(window.BANK) ? window.BANK : [];
const FORM1_BANK = Array.isArray(window.BANK_FORM1) ? window.BANK_FORM1 : [];
function selectedForm(cls = getCurrentClass()) {
  if (homeworkMode) return homeworkMode.form === 1 ? 1 : 2;
  return (cls ? cls.form : DB.defaultForm) === 1 ? 1 : 2;
}
const DIFFICULTIES = {
  easy: { label: "Easy" },
  standard: { label: "Standard" },
  challenge: { label: "Challenge" }
};
const DIFFICULTY_TOPICS = {
  1: {
    easy: ["Present Simple", "Present Continuous", "Articles", "Countable Nouns", "Much and Many", "Some and Any"],
    challenge: ["Past Simple", "Past Continuous", "Comparatives", "Superlatives"]
  },
  2: {
    easy: ["Present Simple", "Present Continuous", "Articles", "Countable Nouns", "Quantifiers", "Subject–Verb Agreement"],
    challenge: ["Passive Voice", "Question Tags", "Conjunctions", "Adjectives -ed / -ing", "Pronouns", "Uncountable Nouns"]
  }
};
function selectedDifficulty(cls = getCurrentClass()) {
  if (homeworkMode) return "standard";
  const value = cls ? cls.difficulty : DB.defaultDifficulty;
  return Object.hasOwn(DIFFICULTIES, value) ? value : "standard";
}
function selectedBank(cls = getCurrentClass()) {
  if (homeworkMode) return homeworkMode.bank;
  const form = selectedForm(cls);
  const bank = form === 1 ? FORM1_BANK : QUESTION_BANK;
  const topics = DIFFICULTY_TOPICS[form][selectedDifficulty(cls)];
  return topics ? bank.filter(question => topics.includes(question.topic)) : bank;
}
function changeDifficulty(value) {
  if (session?.active || !Object.hasOwn(DIFFICULTIES, value)) return;
  const cls = getCurrentClass(), target = cls || DB;
  const key = cls ? "difficulty" : "defaultDifficulty", previous = target[key];
  target[key] = value;
  if (!saveDB()) target[key] = previous;
  refreshAll();
}
function isHomework() { return Boolean(homeworkMode); }
function isSolo() { return Boolean(homeworkMode) || DB.playMode === "single"; }
function changePlayMode(value) {
  if (session?.active || !["class", "single"].includes(value)) return;
  const previous = DB.playMode;
  DB.playMode = value;
  if (!saveDB()) DB.playMode = previous;
  resetFaceIdentity();
  showLobby();
}
function changeForm(value) {
  const cls = getCurrentClass();
  if (session?.active) return;
  const target = cls || DB;
  const key = cls ? "form" : "defaultForm";
  const previous = target[key];
  target[key] = Number(value) === 1 ? 1 : 2;
  if (!saveDB()) target[key] = previous;
  refreshAll();
}
function controlMode() { return DB.settings.controlMode || "palms"; }
function setControlMode(value) {
  const mode = ["palms", "buttons"].includes(value) ? value : "palms";
  DB.settings.controlMode = mode;
  if (typeof stopPalmLoop === "function") stopPalmLoop();
  hideLost();
  clearFaceCanvas();
  saveDB();
  renderControlMode();
  if (phase === "play" && round && !round.answered) {
    $("feedbackLine").textContent = answerPrompt();
  }
  if (mode === "palms" && stream) ensurePalmLoop();
  ensureDetectionLoop();
}
function answerPrompt() {
  return "";
}
// The visible left/right actions are shared by touch and palm input.
function palmControlContext() {
  if (document.hidden || isTeacherOpen() || isStudioOpen() || isShareOpen() || pendingFaceCapture
    || !$("faceConfirmModal").classList.contains("hidden")
    || !$("playerLost").classList.contains("hidden")) return null;
  if (pendingFaceResume && !$("resumeConfirmModal").classList.contains("hidden")) return "face-resume";
  if (!$("leaderboardOverlay").classList.contains("hidden")) return "leaderboard";
  if (!$("bonusOverlay").classList.contains("hidden")) return "bonus";
  if (phase === "round" && !$("roundOverlay").classList.contains("hidden")) return "round";
  if (phase === "countdown") return "countdown";
  if (phase === "play" && round && !isPlayBlocked()) return "play";
  if (phase === "idle" && session?.active) return "idle";
  if (phase === "lobby" && getCurrentClass()) return "lobby";
  return null;
}
function palmControlTarget(side, context = palmControlContext()) {
  if (!["left", "right"].includes(side)) return null;
  let target = null;
  if (context === "face-resume") target = side === "left" ? "resumeConfirmNo" : "resumeConfirmYes";
  else if (context === "bonus") target = side === "left" ? "bonusDeclineBtn" : "bonusShotBtn";
  else if (context === "play" && !round?.answered) target = side === "left" ? "optionLeft" : "optionRight";
  else if (context === "round") target = side === "left" ? "replayPlayerBtn" : "nextPlayerBtn";
  else if (context === "leaderboard" && side === "right") target = "closeLeaderboardBtn";
  else if (context === "idle") target = side === "left" ? "idleRanksBtn" : "numberedPlayerBtn";
  else if (context === "lobby" && side === "right") target = "startBtn";
  return target && !$(target).disabled ? target : null;
}
function handlePalmAction(side) {
  const target = palmControlTarget(side);
  if (target) $(target).click();
}
function palmCue(side) {
  return `<span class="palm-cue palm-${side}" data-hand="${side === "left" ? "L" : "R"}" role="img" aria-label="${side === "left" ? "Left" : "Right"} palm"></span>`;
}
function palmDebugEnabled() {
  return /(?:^|[?&])palmdebug=1(?:&|$)/.test(window.location?.search || "");
}
let palmDebugIncidents = [];
function savePalmDebugIncident(entry) {
  if (!palmDebugEnabled() || entry.ok) return;
  palmDebugIncidents = [...palmDebugIncidents, entry].slice(-5);
  try { sessionStorage.setItem("palm-debug-incidents", JSON.stringify(palmDebugIncidents)); }
  catch (error) { console.warn("Palm debug history could not be saved", error); }
}
function renderPalmLog() {
  const list = $("palmLogList");
  if (!list) return;
  const log = round?.palmLog || [];
  const current = log.length ? log.map((entry) => {
    const raw = entry.raw ? ` · model ${escapeHtml(entry.raw.label)} ${Number(entry.raw.score).toFixed(2)}` : " · tap/keys";
    const shot = entry.capture?.image ? ` <button class="btn mini" type="button" data-palm-shot="${log.indexOf(entry)}">VIEW FRAME</button>` : "";
    return `<li>Q${entry.qi + 1} · ${entry.side.toUpperCase()} palm${raw} → picked ${entry.picked === 0 ? "LEFT" : "RIGHT"} · ${entry.ok ? "✓ correct" : "✗ wrong"}${shot}</li>`;
  }).join("") : "<li>Play a round to record what the tracker saw for each answer.</li>";
  const saved = palmDebugIncidents.map((entry, index) => `<li>Saved wrong answer · Q${entry.qi + 1} · ${entry.side.toUpperCase()} selected <button class="btn mini" type="button" data-palm-incident="${index}">${entry.capture?.image ? "VIEW FRAME" : "VIEW DETAILS"}</button></li>`).join("");
  list.innerHTML = current + saved;
  $("palmDebugDownload").disabled = !log.length && !palmDebugManual && !saved;
}
function renderPalmControls() {
  const live = controlMode() === "palms" && Boolean(stream);
  document.body.classList.toggle("palm-navigation", live);
  for (const [id, side] of [["startBtn", "right"], ["idleRanksBtn", "left"], ["numberedPlayerBtn", "right"],
    ["replayPlayerBtn", "left"], ["nextPlayerBtn", "right"], ["closeLeaderboardBtn", "right"], ["resumeConfirmNo", "left"], ["resumeConfirmYes", "right"],
    ["bonusDeclineBtn", "left"], ["bonusShotBtn", "right"]]) {
    const button = $(id);
    button.classList.add("palm-nav");
    button.setAttribute("data-palm", side);
    button.setAttribute("aria-label", live ? `${button.textContent}, ${side} palm` : button.textContent);
  }
  $("lbAutoHint").classList.toggle("hidden", live);
}
let palmDebugSnapshot = null;
let palmDebugManual = null;
function showPalmAnswerFrame(index) {
  showPalmDebugEntry(round?.palmLog?.[index]);
}
function showPalmDebugEntry(entry) {
  if (!entry) return;
  if (entry.capture?.image) {
    const image = new Image();
    image.onload = () => {
      const canvas = $("palmDebugCanvas");
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.classList.remove("hidden");
    };
    image.src = entry.capture.image;
  } else $("palmDebugCanvas").classList.add("hidden");
  $("palmDebugConfirmRow").classList.add("hidden");
  $("palmDebugVerdict").textContent = "";
  $("palmDebugResult").textContent = `Q${entry.qi + 1}: ${entry.sentence} | LEFT: ${entry.options[0]} | RIGHT: ${entry.options[1]} | Selected ${entry.side.toUpperCase()}; correct option was ${entry.correct === 0 ? "LEFT" : "RIGHT"}.${entry.capture?.image ? "" : " No camera frame was captured."}`;
}
function downloadPalmDebugReport() {
  const entries = round?.palmLog || [];
  if (!entries.length && !palmDebugManual && !palmDebugIncidents.length) return;
  const payload = { version: 1, createdAt: new Date().toISOString(), manual: palmDebugManual, entries, savedWrongAnswers: palmDebugIncidents };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `palm-debug-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function runPalmDebugCapture() {
  $("palmDebugVerdict").textContent = "";
  $("palmDebugVerdict").className = "palm-debug-verdict";
  $("palmDebugConfirmRow").classList.add("hidden");
  if (!stream) { toast("Turn the camera on first.", "warn"); return; }
  if (controlMode() !== "palms") { toast("Switch Answer Controls to palms first.", "warn"); return; }
  const button = $("palmDebugBtn");
  button.disabled = true;
  $("palmDebugResult").textContent = "Capturing one frame… hold your palm still.";
  try {
    palmDebugSnapshot = await capturePalmDebug();
    renderPalmDebug(palmDebugSnapshot);
    if (palmDebugSnapshot) {
      palmDebugManual = { ...palmDebugSnapshot, image: $("palmDebugCanvas").toDataURL("image/jpeg", 0.85) };
      $("palmDebugDownload").disabled = false;
    }
  } finally { button.disabled = false; }
}
function renderPalmDebug(snapshot) {
  const canvas = $("palmDebugCanvas"), resultEl = $("palmDebugResult");
  if (!snapshot || !snapshot.count) {
    canvas.classList.add("hidden");
    $("palmDebugConfirmRow").classList.add("hidden");
    resultEl.textContent = snapshot ? "No hand in the frozen frame. Move closer, face your palm to the camera with fingers spread, and capture again."
      : "Capture failed. Check the camera light and try again.";
    return;
  }
  canvas.classList.remove("hidden");
  const lines = snapshot.per.map((info, index) => {
    if (!info) return `Hand ${index + 1}: landmarks unreadable.`;
    const raw = info.raw ? `${info.raw.label} (${Number(info.raw.score).toFixed(2)})` : "no label";
    const state = !info.eligible ? "too small" : !info.open ? "fingers closed" : "open";
    return `Hand ${index + 1}: model says ${raw} → reads as your ${(info.side || "unknown").toUpperCase()} (${state}).`;
  });
  resultEl.textContent = `${lines.join(" ")} ${snapshot.answer ? `Would pick the ${snapshot.answer.toUpperCase()} option.` : "Would not pick an option."} Which hand did you raise?`;
  $("palmDebugConfirmRow").classList.remove("hidden");
}
function confirmPalmDebugSide(raised) {
  const verdictEl = $("palmDebugVerdict");
  const outcome = PalmInput.diagnose(raised, palmDebugSnapshot);
  if (outcome.verdict === "match") {
    verdictEl.className = "palm-debug-verdict good";
    verdictEl.textContent = `Correct: the tracker read your ${raised.toUpperCase()} hand, so it would pick the ${raised.toUpperCase()} option. Palm mapping is fine — a wrong answer came from the question, not the palm.`;
  } else if (outcome.verdict === "mismatch") {
    verdictEl.className = "palm-debug-verdict bad";
    const raw = outcome.raw ? ` (model raw label ${outcome.raw.label} ${Number(outcome.raw.score).toFixed(2)})` : "";
    verdictEl.textContent = `INVERTED: you raised ${raised.toUpperCase()} but the tracker read ${String(outcome.computed).toUpperCase()}${raw} and would pick the wrong side. Take a screenshot of the frozen picture for the developer — the handedness swap needs flipping for this setup.`;
  } else if (outcome.verdict === "none") {
    verdictEl.className = "palm-debug-verdict";
    verdictEl.textContent = "No frozen frame yet — tap TEST MY PALM first.";
  } else {
    verdictEl.className = "palm-debug-verdict";
    const why = { "hand-too-small": "your palm was too small — move closer", "hand-not-open": "spread your fingers wide", "two-hands": "show only one palm", "no-side": "face your palm flat to the camera" }[outcome.reason]
      || "adjust and capture again";
    verdictEl.textContent = `Unclear reading: ${why}, then tap TEST MY PALM again.`;
  }
}
function renderControlMode() {
  const mode = controlMode();
  document.body.classList.toggle("control-palms", mode === "palms");
  document.body.classList.toggle("control-buttons", mode === "buttons");
  $("controlModeSelect").value = mode;
  setCameraUI();
}
const TRACKING_FRESH_MS = 450;
const QUESTIONS_PER_ROUND = 8;
const MAX_CUSTOM_TOPICS = 40;
const MAX_CUSTOM_QUESTIONS = 60;
const MAX_CUSTOM_TEXT = 500;
const LEADERBOARD_INTERVAL = 3;
const SPEED_BONUS_MAX = 100;
const SPEED_BONUS_WINDOW_MS = 10000;
const CONFETTI_COLORS = ["#7cffcb", "#ffd166", "#7aa2ff", "#ff4d67", "#ffffff", "#b28dff"];
const COMBO_TIERS = [
  { min: 5, label: "UNSTOPPABLE", className: "tier-legend", burst: 30 },
  { min: 4, label: "ON FIRE", className: "tier-fire", burst: 22 },
  { min: 3, label: "HOT", className: "tier-hot", burst: 14 },
  { min: 2, label: "WARM", className: "tier-warm", burst: 0 }
];
const GOLDEN_MULTIPLIER = 2;
const BONUS_SHOT_POINTS = 250;
const BADGES = {
  perfect: { label: "FIRST PERFECT", icon: "♛", detail: "Finished a round 8/8" },
  streak5: { label: "5-STREAK", icon: "★", detail: "Answered five in a row" },
  speed2: { label: "QUICK DRAW", icon: "⚡", detail: "Answered in under two seconds" },
  redemption: { label: "REDEMPTION HERO", icon: "↺", detail: "Won the one-shot redemption" },
  golden: { label: "GOLDEN HIT", icon: "✦", detail: "Nailed the golden question" },
  points1000: { label: "1,000 CLUB", icon: "◆", detail: "Reached 1,000 career points" }
};
const MELODY = [659, 0, 784, 0, 988, 0, 784, 0, 659, 0, 523, 0, 587, 0, 659, 0];
const BASS = [131, 0, 0, 0, 110, 0, 0, 0, 98, 0, 0, 0, 87, 0, 98, 0];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanName(value, limit) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, limit || 30);
}

function avatarInner(student) {
  if (student?.photo) return `<img src="${escapeHtml(student.photo)}" alt="Player portrait">`;
  const number = currentStudents().findIndex(item => item.id === student?.id) + 1;
  return `<span aria-label="Player ${number || "photo pending"}">${number > 0 ? `#${number}` : "◎"}</span>`;
}

function avatarHTML(student, extraClass) {
  return `<div class="avatar ${extraClass || ""}">${avatarInner(student)}</div>`;
}

function studentById(id) {
  return getCurrentClass()?.students.find((student) => student.id === id) || null;
}

function getCurrentClass() {
  if (homeworkMode) return homeworkMode.class;
  return DB.playMode === "single" ? DB.solo : DB.activeClass ? DB.classes[DB.activeClass] || null : null;
}

function currentStudents() {
  return getCurrentClass()?.students || [];
}

function averageAccuracy(student) {
  const total = Number(student.answeredTotal) || 0;
  if (!total) return null;
  return (Number(student.correctTotal) || 0) / total;
}

function accuracyLabel(student) {
  const value = averageAccuracy(student);
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function compareStudents(a, b) {
  return (Number(b.totalScore) || 0) - (Number(a.totalScore) || 0)
    || (Number(b.bestStreak) || 0) - (Number(a.bestStreak) || 0)
    || averageAccuracy(b) - averageAccuracy(a)
    || String(a.id).localeCompare(String(b.id));
}

const defaultSettings = {
  classAppearance: "glass",
  soloAppearance: "lite",
  mobileClassAppearance: "lite",
  mobileSoloAppearance: "lite",
  controlMode: "palms",
  sfx: true,
  music: true,
  extras: true,
  faceResume: true,
  cameraEnabled: true
};

function normalizeFaceDescriptor(value) {
  if (!Array.isArray(value) || value.length !== 128
    || !value.every(number => typeof number === "number" && Number.isFinite(number))) return null;
  return value.map(number => Number(number.toFixed(6)));
}

function normalizeStudent(raw) {
  return {
    id: raw?.id || makeId("student"),
    numbered: raw?.numbered === true,
    photo: typeof raw?.photo === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(raw.photo)
      && raw.photo.length < 120000 ? raw.photo : "",
    faceSamples: Array.isArray(raw?.faceSamples)
      ? raw.faceSamples.map(normalizeFaceDescriptor).filter(Boolean).slice(-5) : [],
    totalScore: Number(raw?.totalScore) || 0,
    bestStreak: Number(raw?.bestStreak) || 0,
    games: Number(raw?.games) || 0,
    correctTotal: Number(raw?.correctTotal) || 0,
    answeredTotal: Number(raw?.answeredTotal) || 0,
    recent: Array.isArray(raw?.recent) ? raw.recent.slice(-64) : [],
    marks: Array.isArray(raw?.marks) ? raw.marks.slice(-40) : [],
    badges: Array.isArray(raw?.badges)
      ? [...new Set(raw.badges.filter(id => Object.prototype.hasOwnProperty.call(BADGES, id)))].slice(0, 12) : [],
    lastPlayed: Number(raw?.lastPlayed) || 0
  };
}

function cleanCustomText(value, limit) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit || MAX_CUSTOM_TEXT);
}

function normalizeCustomQuestion(raw, topicId) {
  const sentence = String(raw?.s ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CUSTOM_TEXT);
  if (!sentence.includes("{x}") || !sentence.replace(/\{x\}/g, "").trim()) return null;
  const fallbackOptions = [raw?.c, raw?.f];
  const options = (Array.isArray(raw?.options) ? raw.options : fallbackOptions)
    .map(value => cleanCustomText(value, 120)).slice(0, 2);
  if (options.length !== 2 || !options[0] || !options[1] || options[0] === options[1]) return null;
  const answer = raw?.answer === 1 ? 1 : 0;
  return {
    id: typeof raw?.id === "string" && raw.id.length < 100 ? raw.id : makeId("cq"),
    patternId: typeof raw?.patternId === "string" && raw.patternId.length < 100
      ? raw.patternId : `custom:${topicId}`,
    s: sentence,
    w: cleanCustomText(raw?.w || options[1 - answer], 80),
    c: options[answer],
    f: options[1 - answer],
    options,
    answer,
    tip: cleanCustomText(raw?.tip, 400)
  };
}

function normalizeCustomTopic(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const name = cleanCustomText(raw.name, 60);
  if (!name) return null;
  const rawId = typeof raw.id === "string" ? raw.id : "";
  const id = /^[a-z0-9_-]{3,100}$/i.test(rawId) ? rawId : makeId("topic");
  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .map(question => normalizeCustomQuestion(question, id))
    .filter(Boolean)
    .slice(0, MAX_CUSTOM_QUESTIONS);
  return {
    id,
    name,
    form: raw.form === 1 ? 1 : 2,
    createdAt: Number(raw.createdAt) || Date.now() + index,
    updatedAt: Number(raw.updatedAt) || Date.now(),
    questions
  };
}

function normalizeCustomTopics(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.map(normalizeCustomTopic).filter(topic => {
    if (!topic || seen.has(topic.id)) return false;
    seen.add(topic.id);
    return true;
  }).slice(0, MAX_CUSTOM_TOPICS);
}

function normalizeDB(raw) {
  const db = {
    version: 9,
    playMode: raw?.playMode === "single" ? "single" : "class",
    defaultDifficulty: Object.hasOwn(DIFFICULTIES, raw?.defaultDifficulty) ? raw.defaultDifficulty : "standard",
    solo: { id: "solo", name: "Single player", form: raw?.solo?.form === 1 ? 1 : 2,
      difficulty: Object.hasOwn(DIFFICULTIES, raw?.solo?.difficulty) ? raw.solo.difficulty : "standard",
      students: [normalizeStudent(raw?.solo?.students?.[0] || { numbered: true })],
      usedQuestionIds: Array.isArray(raw?.solo?.usedQuestionIds)
        ? [...new Set(raw.solo.usedQuestionIds.filter(id => typeof id === "string" && id.length < 100))] : [] },
    defaultForm: raw?.defaultForm === 1 ? 1 : 2,
    activeClass: null,
    classes: {},
    settings: { ...defaultSettings },
    history: [],
    customTopics: normalizeCustomTopics(raw?.customTopics),
    updatedAt: Date.now()
  };
  if (!raw || typeof raw !== "object") return db;
  if (raw.settings && typeof raw.settings === "object") {
    db.settings.classAppearance = ["glass", "lite"].includes(raw.settings.classAppearance) ? raw.settings.classAppearance : "glass";
    db.settings.soloAppearance = ["glass", "lite"].includes(raw.settings.soloAppearance) ? raw.settings.soloAppearance : "lite";
    for (const key of ["mobileClassAppearance", "mobileSoloAppearance"]) {
      db.settings[key] = ["glass", "lite"].includes(raw.settings[key]) ? raw.settings[key] : "lite";
    }
    db.settings.controlMode = ["palms", "buttons"].includes(raw.settings.controlMode) ? raw.settings.controlMode : "palms";
    db.settings.cameraEnabled = raw.settings.cameraEnabled !== false;
    db.settings.sfx = raw.settings.sfx !== false;
    db.settings.music = raw.settings.music !== false;
    db.settings.extras = raw.settings.extras !== false;
    db.settings.faceResume = raw.settings.faceResume !== false;
  }
  if (raw.classes && typeof raw.classes === "object") {
    Object.entries(raw.classes).forEach(([id, value]) => {
      if (!value || typeof value !== "object") return;
      const students = Array.isArray(value.students) ? value.students.map(normalizeStudent) : [];
      db.classes[id] = {
        id,
        name: cleanName(value.name, 40) || "Class",
        form: value.form === 1 ? 1 : 2,
        difficulty: Object.hasOwn(DIFFICULTIES, value.difficulty) ? value.difficulty : "standard",
        createdAt: Number(value.createdAt) || Date.now(),
        students,
        leaderboardRanks: value.leaderboardRanks && typeof value.leaderboardRanks === "object"
          ? Object.fromEntries(students.filter(student => Number.isInteger(value.leaderboardRanks[student.id])
            && value.leaderboardRanks[student.id] > 0 && value.leaderboardRanks[student.id] <= students.length)
            .map(student => [student.id, value.leaderboardRanks[student.id]])) : {},
        usedQuestionIds: Array.isArray(value.usedQuestionIds)
          ? [...new Set(value.usedQuestionIds.filter(id => typeof id === "string" && id.length < 100))] : []
      };
    });
  }
  if (raw.activeClass && db.classes[raw.activeClass]) db.activeClass = raw.activeClass;
  if (!db.activeClass) db.activeClass = Object.keys(db.classes)[0] || null;
  if (Array.isArray(raw.history)) db.history = raw.history.slice(-400).map(({ studentName, ...entry }) => entry);
  return db;
}

function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeDB(JSON.parse(raw));
  } catch (error) {
    console.warn("Could not read saved data", error);
  }
  return normalizeDB(null);
}

function saveDB() {
  DB.updatedAt = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
    return true;
  } catch (error) {
    console.warn("Could not save data", error);
    if (!saveDB.warned) {
      saveDB.warned = true;
      toast("Browser storage is full. Photos, scores and question progress could not be saved.", "bad", 6000);
    }
    return false;
  }
}

let DB = loadDB();
let homeworkMode = null;
let pendingHomework = null;
let studioState = {
  selected: "",
  search: "",
  topicDraft: null,
  questionDraft: null,
  shareUrl: ""
};
let studioBuiltinCache = null;

let stream = null;
let modelsReady = false;
let recognitionReady = false;
let modelsLoading = false;
let detectTimer = null;
let detecting = false;
let faceIdentity = { samples: [], descriptor: null, match: null, ready: false, at: 0 };
let pendingFaceCapture = null;
let pendingFaceResume = null;
let faceCaptureRequested = false;
let resumeBlockedStudentId = null;
const indexingFaces = new Set();
let detection = { face: false, box: null, student: null, distance: 0 };
let lastTrackingAt = 0;
let cameraGeneration = 0;
let phase = "lobby";
let session = null;
let activeStudentId = null;
let round = null;
let lastFinishedId = null;
let lastSummary = null;
let lostShown = false;
let lostContinueUntil = 0;
let gameTimers = new Set();
let boardContext = null;
let boardRevision = 0;
let toastTimer = null;
let audioContext = null;
let sfxGain = null;
let musicGain = null;
let musicTimer = null;
let musicStep = 0;
let lastIdleStatus = "";

function after(ms, fn) {
  const id = setTimeout(() => {
    gameTimers.delete(id);
    fn();
  }, ms);
  gameTimers.add(id);
  return id;
}

function clearGameTimers() {
  gameTimers.forEach((id) => {
    clearTimeout(id);
    clearInterval(id);
  });
  gameTimers.clear();
}

function isTeacherOpen() {
  return document.body.classList.contains("teacher-open");
}

function isStudioOpen() {
  return !$("studioOverlay").classList.contains("hidden");
}

function isShareOpen() {
  return !$("shareOverlay").classList.contains("hidden");
}

function isUiBlocking() {
  return isTeacherOpen()
    || isStudioOpen()
    || isShareOpen()
    || !$("faceConfirmModal").classList.contains("hidden")
    || !$("resumeConfirmModal").classList.contains("hidden")
    || !$("countdownOverlay").classList.contains("hidden")
    || !$("bonusOverlay").classList.contains("hidden")
    || !$("roundOverlay").classList.contains("hidden")
    || !$("leaderboardOverlay").classList.contains("hidden");
}

function isPlayBlocked() {
  return isTeacherOpen()
    || isStudioOpen()
    || isShareOpen()
    || !$("leaderboardOverlay").classList.contains("hidden")
    || !$("roundOverlay").classList.contains("hidden")
    || !$("bonusOverlay").classList.contains("hidden")
    || !$("countdownOverlay").classList.contains("hidden");
}

function speedBonusFor(elapsedMs) {
  return Math.round(SPEED_BONUS_MAX * (1 - clamp(elapsedMs / SPEED_BONUS_WINDOW_MS, 0, 1)));
}

function extrasEnabled() {
  return DB.settings.extras !== false;
}

function pauseQuestionTimer() {
  const timer = round?.questionTimer;
  if (!timer || timer.startedAt === null) return;
  timer.elapsedMs += Math.max(0, performance.now() - timer.startedAt);
  timer.startedAt = null;
}

function resumeQuestionTimer() {
  const timer = round?.questionTimer;
  if (!timer || timer.startedAt !== null || phase !== "play" || round.answered
    || document.hidden || isPlayBlocked() || lostShown) return;
  timer.startedAt = performance.now();
  syncTracking();
}

function ensureAudio() {
  if (!audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    audioContext = new AudioCtor();
    const master = audioContext.createGain();
    master.gain.value = 0.9;
    master.connect(audioContext.destination);
    sfxGain = audioContext.createGain();
    sfxGain.gain.value = DB.settings.sfx ? 1 : 0;
    sfxGain.connect(master);
    musicGain = audioContext.createGain();
    musicGain.gain.value = DB.settings.music ? 0.55 : 0;
    musicGain.connect(master);
  }
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  return audioContext;
}

function setGain(param, value) {
  if (!audioContext || !param) return;
  param.cancelScheduledValues(audioContext.currentTime);
  param.setTargetAtTime(value, audioContext.currentTime, 0.03);
}

function tone(freq, duration, type, volume, when, slideTo, dest) {
  if (!audioContext) return;
  const start = audioContext.currentTime + (when || 0);
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = type || "square";
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(35, slideTo), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume || 0.1), start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(dest || sfxGain);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

function sfxTone(freq, duration, type, volume, when, slideTo) {
  if (!DB.settings.sfx) return;
  tone(freq, duration, type, volume, when, slideTo, sfxGain);
}

function chimeTone(freq, duration, volume, when) {
  if (!DB.settings.sfx) return;
  tone(freq, duration, "triangle", volume, when, null, sfxGain);
  tone(freq * 2, duration * 0.55, "sine", volume * 0.4, when, null, sfxGain);
}

function buzz(pattern) {
  if (!DB.settings.sfx) return;
  try { navigator.vibrate?.(pattern); } catch (error) { /* optional feedback */ }
}

function duckMusic(ms = 360) {
  if (!DB.settings.music || !audioContext || !musicGain) return;
  const now = audioContext.currentTime;
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setTargetAtTime(0.13, now, 0.02);
  musicGain.gain.setTargetAtTime(0.55, now + ms / 1000, 0.16);
}

const COMBO_SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];

const sfx = {
  click() {
    sfxTone(760, 0.05, "square", 0.04);
  },
  correct(step = 1) {
    duckMusic(300);
    const note = COMBO_SCALE[clamp(step - 1, 0, COMBO_SCALE.length - 1)];
    chimeTone(note, 0.22, 0.12, 0);
    chimeTone(note * 1.5, 0.16, 0.045, 0.055);
    buzz(12);
  },
  wrong() {
    duckMusic(260);
    sfxTone(196, 0.2, "triangle", 0.09, 0, 146);
    sfxTone(146, 0.28, "triangle", 0.07, 0.1, 110);
    buzz(35);
  },
  streak(level) {
    duckMusic(460);
    const root = 720 + Math.min(5, level) * 30;
    [0, 4, 7, 12].forEach((step, index) => {
      chimeTone(root * Math.pow(2, step / 12), 0.13, 0.055, 0.1 + index * 0.06);
    });
    buzz([10, 25, 15]);
  },
  comboLost() {
    [392, 330, 262].forEach((note, index) => {
      chimeTone(note, 0.12, 0.045, index * 0.07);
    });
  },
  golden() {
    [1046, 1318, 1568, 2093].forEach((note, index) => {
      chimeTone(note, 0.16, 0.04, index * 0.07);
    });
  },
  goldenCorrect() {
    duckMusic(520);
    [1046, 1318, 1568, 2093, 2637].forEach((note, index) => {
      chimeTone(note, 0.18, 0.075, index * 0.065);
    });
    buzz([15, 30, 15, 30]);
  },
  bonus(won) {
    duckMusic(520);
    if (won) {
      [523, 659, 784, 1047, 1319].forEach((note, index) => {
        chimeTone(note, 0.2, 0.09, index * 0.08);
      });
      buzz([15, 40, 20]);
    } else {
      [392, 311, 262].forEach((note, index) => {
        chimeTone(note, 0.2, 0.06, index * 0.1);
      });
    }
  },
  newBest() {
    duckMusic(620);
    [523, 659, 784, 1047, 1319, 1568].forEach((note, index) => {
      chimeTone(note, 0.22, 0.08, index * 0.075);
    });
  },
  badge() {
    chimeTone(1319, 0.12, 0.06, 0);
    chimeTone(1760, 0.2, 0.07, 0.09);
  },
  star(index) {
    chimeTone(784 * Math.pow(2, (index % 5) / 12), 0.09, 0.035, 0);
  },
  countdown(value) {
    const note = value > 0 ? 440 + value * 90 : 880;
    sfxTone(note, value > 0 ? 0.11 : 0.24, "square", 0.1);
  },
  start() {
    [392, 523, 659, 784].forEach((note, index) => {
      chimeTone(note, 0.16, 0.11, index * 0.08);
    });
  },
  stop() {
    [784, 659, 523, 392].forEach((note, index) => {
      chimeTone(note, 0.18, 0.09, index * 0.09);
    });
  },
  capture() {
    sfxTone(660, 0.09, "square", 0.09);
    sfxTone(990, 0.13, "square", 0.09, 0.1);
  },
  board() {
    [523, 659, 784].forEach((note, index) => {
      chimeTone(note, 0.18, 0.09, index * 0.1);
    });
  },
  redemption() {
    duckMusic(600);
    [784, 988, 1175, 1568, 1976].forEach((note, index) => {
      chimeTone(note, 0.13, 0.08, index * 0.06);
    });
    buzz([15, 30, 20]);
  },
  lost() {
    sfxTone(330, 0.22, "triangle", 0.07, 0, 220);
  }
};

function startMusic() {
  if (!DB.settings.music || !session?.active || musicTimer) return;
  ensureAudio();
  musicStep = 0;
  musicTimer = setInterval(() => {
    if (!audioContext || !session?.active || !DB.settings.music || document.hidden) return;
    const position = musicStep % MELODY.length;
    if (MELODY[position]) tone(MELODY[position], 0.12, "square", 0.045, 0, null, musicGain);
    if (BASS[position]) tone(BASS[position], 0.2, "triangle", 0.04, 0, null, musicGain);
    musicStep += 1;
  }, 250);
}

function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

function updateSoundUI() {
  $("soundToggle").classList.toggle("on", DB.settings.sfx);
  $("musicToggle").classList.toggle("on", DB.settings.music);
}

function setSfx(value) {
  DB.settings.sfx = Boolean(value);
  setGain(sfxGain, DB.settings.sfx ? 1 : 0);
  saveDB();
  updateSoundUI();
  if (DB.settings.sfx) {
    ensureAudio();
    sfx.click();
  }
}

function setMusic(value) {
  DB.settings.music = Boolean(value);
  setGain(musicGain, DB.settings.music ? 0.55 : 0);
  saveDB();
  updateSoundUI();
  if (DB.settings.music) startMusic();
  else stopMusic();
}

function toast(message, toneName, duration) {
  const el = $("toast");
  el.textContent = message;
  el.className = `toast show ${toneName || ""}`.trim();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = "toast";
  }, duration || 2600);
}

function callout(message, toneName) {
  if (reducedMotion()) return;
  const el = $("callout");
  el.textContent = message;
  el.className = "callout";
  void el.offsetWidth;
  el.className = `callout show ${toneName || ""}`.trim();
}

function flashResult(ok) {
  if (reducedMotion() || liteEffects()) return;
  const el = $("screenFlash");
  el.className = "screen-flash";
  void el.offsetWidth;
  el.className = `screen-flash ${ok ? "good" : "bad"}`;
  after(820, () => {
    el.className = "screen-flash";
  });
}

function confettiBurst(amount, options) {
  if (reducedMotion()) return;
  const layer = $("confettiLayer");
  const requested = amount || 34;
  const count = liteEffects() ? Math.min(requested, options?.lite ?? 8) : requested;
  for (let index = 0; index < count; index += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    piece.style.setProperty("--x", `${Math.random() * 100}%`);
    piece.style.setProperty("--w", `${5 + Math.random() * 8}px`);
    piece.style.setProperty("--c", CONFETTI_COLORS[index % CONFETTI_COLORS.length]);
    piece.style.setProperty("--dur", `${1.1 + Math.random() * 0.9}s`);
    piece.style.setProperty("--delay", `${Math.random() * 0.28}s`);
    piece.style.setProperty("--drift", `${-110 + Math.random() * 220}px`);
    piece.style.setProperty("--spin", `${-540 + Math.random() * 1080}deg`);
    layer.appendChild(piece);
    setTimeout(() => piece.remove(), 2300);
  }
}

function shakeScreen() {
  if (reducedMotion()) return;
  const app = $("app");
  app.classList.remove("shake");
  void app.offsetWidth;
  app.classList.add("shake");
  after(450, () => app.classList.remove("shake"));
}

function pointPop(amount) {
  if (reducedMotion() || !amount) return;
  const play = $("play");
  const pop = document.createElement("span");
  pop.className = "point-pop";
  pop.textContent = `+${amount}`;
  play.appendChild(pop);
  setTimeout(() => pop.remove(), 950);
}

function setHudClass() {
  const cls = getCurrentClass();
  if (isHomework()) {
    $("hudClass").textContent = "CUSTOM HOMEWORK · PRACTICE";
    return;
  }
  $("hudClass").textContent = cls ? `${cls.name.toUpperCase()} · ${DIFFICULTIES[selectedDifficulty()].label.toUpperCase()}` : "NO CLASS";
}

function updateSessionHud() {
  const active = Boolean(session?.active);
  document.body.classList.toggle("in-session", active);
  $("hudRound").classList.toggle("hidden", !active);
  if (active) {
    const showingRound = phase === "play" || phase === "countdown";
    $("hudRound").textContent = showingRound
      ? `ROUND ${session.rounds + 1}`
      : `ROUNDS ${session.rounds}`;
  }
  $("classSelect").disabled = active || isSolo();
  ["classModeBtn", "singleModeBtn", "difficultySelect", "lobbyDifficulty", "lobbyForm"].forEach(id => { $(id).disabled = active; });
  $("formSelect").disabled = active;
  $("newClassBtn").disabled = active;
  $("createClassBtn").disabled = active;
  $("startSessionBtn").disabled = active || !getCurrentClass();
  $("stopSessionBtn").disabled = !active;
  $("stopGameBtn").classList.toggle("hidden", !active);
}

function comboFor(value) {
  const number = Number(value) || 0;
  return COMBO_TIERS.find(tier => number >= tier.min) || null;
}

function setStreak(value) {
  const number = clamp(Number(value) || 0, 0, 5);
  const streak = Number(value) || 0;
  $("streakValue").textContent = String(value || 0);
  const combo = comboFor(streak);
  $("liveStreak").textContent = combo ? `×${streak} ${combo.label}` : `${streak} streak`;
  $("livePoints").textContent = `${round?.points || 0} points`;
  Array.from($("streakStars").children).forEach((star, index) => {
    star.classList.toggle("lit", index < number);
  });
  $("streakRack").classList.toggle("hot", number >= 3);
  const chip = $("comboChip");
  chip.classList.toggle("hidden", !combo);
  if (combo) {
    chip.textContent = `×${streak} ${combo.label}`;
    COMBO_TIERS.forEach(tier => chip.classList.remove(tier.className));
    chip.classList.add(combo.className);
  }
}

function showScreen(name) {
  ["lobby", "homework", "idle", "play"].forEach((screen) => {
    $(screen).classList.toggle("hidden", screen !== name);
  });
  document.body.classList.toggle("playing", name === "play");
  syncTracking();
  window.scrollTo?.(0, 0);
  $("lobby").parentElement?.scrollTo?.(0, 0);
  updateLobbyBrand();
}

function updateLobbyBrand() {
  const logo = $("lobby").querySelector(".logo-wrap");
  document.body.classList.toggle("lobby-scrolled",
    !$("lobby").classList.contains("hidden") && logo?.getBoundingClientRect?.().bottom < 84);
}

function hideOverlay(id) {
  $(id).classList.add("hidden");
}

function hideGameOverlays() {
  closeFaceResumeConfirmation();
  closeFaceConfirmation();
  hideOverlay("countdownOverlay");
  hideOverlay("bonusOverlay");
  hideOverlay("roundOverlay");
  hideOverlay("playerLost");
}

function hideLeaderboard() {
  boardRevision += 1;
  hideOverlay("leaderboardOverlay");
  boardContext = null;
  resumeQuestionTimer();
  syncTracking();
}

function setCameraUI() {
  const live = Boolean(stream);
  document.body.classList.toggle("camera-on", live);
  document.body.classList.toggle("camera-off", !live);
  $("cameraToggleBtn").textContent = live ? "Camera on" : controlMode() === "palms" ? "Enable palms" : "Camera";
  $("cameraToggleBtn").setAttribute("aria-label", live ? "Stop camera" : controlMode() === "palms" ? "Enable camera for palm navigation" : "Enable camera");
  $("cameraToggleBtn").setAttribute("aria-pressed", String(live));
  $("cameraToggleBtn").title = live ? "Turn camera off" : controlMode() === "palms" ? "Turn camera on for palm navigation" : "Turn camera on and allow permission";
  for (const [id, side] of [["optionLeft", "left"], ["optionRight", "right"]]) {
    const tag = $(id).querySelector(".option-tag");
    if (controlMode() === "palms") tag.innerHTML = palmCue(side);
    else tag.textContent = side.toUpperCase();
  }
  renderPalmControls();
  document.body.classList.toggle("playing", phase === "play");
  $("cameraNote").textContent = live
    ? "Camera ready for palm control. Photo cards are optional and stay on this device."
    : "Camera is off. Turn it on for palm control or photo cards.";
  if (phase === "play" && round && !round.answered) $("feedbackLine").textContent = answerPrompt();
  setModelStatus();
}

function setModelStatus() {
  const el = $("modelStatus");
  if (modelsReady) {
    el.textContent = recognitionReady ? "Face memory ready." : "Face engine ready. Face memory loads only for photo players.";
  } else if (modelsLoading) {
    el.textContent = "Loading face engine…";
  } else {
    el.textContent = stream ? "Camera live. Face engine loads only for photo players." : "Camera off.";
  }
}

async function loadModels(force) {
  if (modelsReady && !force && (!faceRecognitionRequested() || recognitionReady)) return true;
  if (modelsLoading) return false;
  modelsLoading = true;
  const withRecognition = faceRecognitionRequested() || recognitionReady;
  const headsReady = modelsReady && !force;
  modelsReady = false;
  setModelStatus();
  try {
    await loadOptionalScript("vendor/face-api.min.js", "faceapi");
    await Promise.all([
      ...(headsReady ? [] : [faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)]),
      ...(withRecognition ? [faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)] : [])
    ]);
    modelsReady = true;
    if (withRecognition) recognitionReady = true;
    setModelStatus();
    if (stream) ensureDetectionLoop();
    indexSavedFacePhotos();
    return true;
  } catch (error) {
    console.error("Model loading failed", error);
    setModelStatus();
    toast("Could not load face models from models/.", "bad", 4200);
    return false;
  } finally {
    modelsLoading = false;
    setModelStatus();
    if (modelsReady && !recognitionReady && faceRecognitionRequested()) prepareFaceResume();
  }
}

async function startCamera() {
  if (stream) return true;
  if (!navigator.mediaDevices?.getUserMedia) {
    toast("Camera is not available in this browser.", "bad", 3800);
    return false;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 360 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
    });
    $("camera").srcObject = stream;
    await $("camera").play().catch(() => {});
    setCameraUI();
    prepareFaceResume();
    ensureDetectionLoop();
    if (controlMode() === "palms") ensurePalmLoop();
    return true;
  } catch (error) {
    console.warn("Camera start failed", error);
    stream = null;
    setCameraUI();
    toast("Camera permission was blocked or no camera was found.", "bad", 4200);
    return false;
  }
}

function stopCamera() {
  closeFaceResumeConfirmation();
  if (typeof stopPalmLoop === "function") stopPalmLoop();
  resetFaceIdentity();
  cameraGeneration += 1;
  if (detectTimer) clearTimeout(detectTimer);
  detectTimer = null;
  if (stream) (stream.getTracks?.() || []).forEach((track) => track.stop());
  stream = null;
  $("camera").srcObject = null;
  $("playerPreview").getContext("2d").clearRect(0, 0, 160, 160);
  detection = { face: false, box: null, student: null, distance: 0 };
  clearFaceCanvas();
  hideLost();
  setCameraUI();
}

function faceResumeEnabled() {
  return !isSolo() && DB.settings.faceResume && Boolean(session?.active)
    && currentStudents().some(student => student.photo || student.faceSamples?.length);
}
function faceRecognitionRequested() {
  return !isSolo() && (faceCaptureRequested || phase === "idle" && faceResumeEnabled());
}
function prepareFaceResume() {
  if (!stream || phase !== "idle" || !faceResumeEnabled() || document.hidden || isUiBlocking()) return;
  if (!modelsReady || !recognitionReady) {
    if (!modelsLoading) loadModels(false);
    return;
  }
  indexSavedFacePhotos();
  ensureDetectionLoop();
}
function faceTrackingNeeded() {
  if (!stream || document.hidden || isTeacherOpen() || isStudioOpen() || isShareOpen() || pendingFaceCapture) return false;
  return phase === "idle" && !isUiBlocking() && faceRecognitionRequested() && recognitionReady;
}
function syncTracking() {
  prepareFaceResume();
  if (faceTrackingNeeded()) ensureDetectionLoop();
  else if (detectTimer) { clearTimeout(detectTimer); detectTimer = null; }
  if (typeof syncPalmLoop === "function") syncPalmLoop();
}
function ensureDetectionLoop() {
  if (!faceTrackingNeeded() || !modelsReady || detecting || detectTimer) return;
  detectTimer = setTimeout(() => {
    detectTimer = null;
    detectTick();
  }, 30);
}

async function detectTick() {
  if (detecting || !faceTrackingNeeded()) return;
  detecting = true;
  const generation = cameraGeneration;
  try {
    const video = $("camera");
    if (!stream || !modelsReady || !video.videoWidth) {
      handleNoFace();
    } else {
      const faces = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.55 }))
        .withFaceLandmarks().withFaceDescriptors();
      if (generation !== cameraGeneration || !faceTrackingNeeded()) return;
      if (faces.length !== 1) {
        handleNoFace();
        if (faces.length > 1) setIdleStatus("One player at a time · keep other faces out of frame");
        return;
      }
      handleFace(faces[0]);
    }
  } catch (error) {
    console.warn("Face detection error", error);
    if (generation === cameraGeneration) handleNoFace();
  } finally {
    detecting = false;
    if (faceTrackingNeeded() && modelsReady) {
      detectTimer = setTimeout(() => {
        detectTimer = null;
        detectTick();
      }, 180);
    }
  }
}

function handleFace(result) {
  const now = performance.now();
  lastTrackingAt = now;
  if (round) round.lastSeen = Date.now();
  detection = {
    face: true,
    box: result.detection.box,
    student: null,
    distance: 0
  };
  lostContinueUntil = 0;
  hideLost();
  drawFaceOverlay(result);
  drawPlayerPreview();
  if (phase === "idle" && !isUiBlocking()) updateFaceIdentity(result, now);
}

function handleNoFace() {
  if (phase === "idle") resumeBlockedStudentId = null;
  resetFaceIdentity();
  const wasFace = detection.face;
  detection = { face: false, box: null, student: null, distance: 0 };
  clearFaceCanvas();
  $("playerPreview").getContext("2d").clearRect(0, 0, 160, 160);
  if (!wasFace) return;
  if (phase === "idle") {
    setIdleStatus(stream && faceResumeEnabled() ? "Returning players: look at the camera." : stream ? "Look at the camera, then capture your photo" : "New players can start; returning players can tap their card.");
  } else if (phase === "lobby") {
  }
}

function drawFaceOverlay(result) {
  if (compactView()) return;
  const canvas = $("faceOverlay");
  const video = $("camera");
  if (!video.videoWidth) return;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const box = result.detection.box;
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.strokeStyle = "rgba(124,255,203,.72)";
  ctx.lineWidth = Math.max(2, canvas.width / 420);
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.setLineDash([]);
  ctx.restore();
}

function clearFaceCanvas() {
  const canvas = $("faceOverlay");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function setIdleStatus(text) {
  if (text === lastIdleStatus) return;
  lastIdleStatus = text;
  $("idleStatus").textContent = text;
}

function showLostNow() {
  if (lostShown) return;
  pauseQuestionTimer();
  lostShown = true;
  $("playerLost").classList.remove("hidden");
  sfx.lost();
}

function hideLost() {
  if (!lostShown && $("playerLost").classList.contains("hidden")) return;
  lostShown = false;
  hideOverlay("playerLost");
  resumeQuestionTimer();
}

function descriptorDistance(a, b) {
  if (!a || !b || a.length !== 128 || b.length !== 128) return Infinity;
  return Math.sqrt(a.reduce((total, number, index) => total + (number - b[index]) ** 2, 0));
}

function rankFaceMatches(descriptor) {
  return currentStudents().filter(student => student.faceSamples?.length).map(student => ({
    student,
    distance: Math.min(...student.faceSamples.map(sample => descriptorDistance(sample, descriptor)))
  })).sort((a, b) => a.distance - b.distance);
}

function confidentFaceMatch(descriptor) {
  const matches = rankFaceMatches(descriptor);
  if (!matches.length || matches[0].distance > 0.48) return null;
  if (matches[1] && matches[1].distance - matches[0].distance < 0.08) return null;
  return matches[0].student;
}

function resetFaceIdentity() {
  faceIdentity = { samples: [], descriptor: null, match: null, ready: false, at: 0 };
  $("faceMatchStatus").textContent = stream && faceResumeEnabled() ? "Looking for a returning player…" : "Face matching stays on this device";
  $("startTurnBtn").textContent = "CAPTURE & PLAY";
  $("faceMatchPreview").classList.add("hidden");
  $("faceMatchPreview").innerHTML = "";
}

function updateFaceIdentity(result, now) {
  const descriptor = normalizeFaceDescriptor(Array.from(result.descriptor || []));
  const box = result.detection.box;
  if (!descriptor || box.width < 64 || box.height < 64 || result.detection.score < 0.55) {
    resetFaceIdentity();
    setIdleStatus("Move closer and look straight ahead for a clear face match");
    return;
  }
  const previous = faceIdentity.samples.at(-1);
  if (now - faceIdentity.at > 1500 || (previous && descriptorDistance(previous.descriptor, descriptor) > 0.25)) resetFaceIdentity();
  const match = confidentFaceMatch(descriptor);
  faceIdentity.samples.push({ descriptor, at: now, id: match?.id || null });
  faceIdentity.samples = faceIdentity.samples.slice(-5);
  faceIdentity.descriptor = descriptor;
  faceIdentity.at = now;
  faceIdentity.ready = faceIdentity.samples.length >= 3 && now - faceIdentity.samples[0].at >= 350;
  const lastThree = faceIdentity.samples.slice(-3);
  faceIdentity.match = faceIdentity.ready && match && lastThree.every(sample => sample.id === match.id) ? match : null;
  $("faceMatchPreview").classList.toggle("hidden", !faceIdentity.match);
  $("faceMatchPreview").innerHTML = faceIdentity.match
    ? `${avatarHTML(faceIdentity.match)}<span>${faceIdentity.match.totalScore || 0} PTS · ${faceIdentity.match.games || 0} completed rounds</span>` : "";
  $("startTurnBtn").textContent = faceIdentity.match ? "CONTINUE MY SCORE" : "CAPTURE & PLAY";
  $("faceMatchStatus").textContent = faceIdentity.match
    ? "Returning face recognised · your saved score is ready"
    : faceIdentity.ready ? "Face ready · we will confirm if the match is uncertain" : "Hold still · checking several frames…";
  setIdleStatus(faceIdentity.match?.id === resumeBlockedStudentId ? "Next player, step into frame." : faceIdentity.match ? "Recognised · confirm to play"
    : faceIdentity.ready ? "Ready · capture your photo, or tap your saved face" : "Look straight ahead and hold still");
  if (phase === "idle" && faceResumeEnabled() && stream && !isUiBlocking()
    && faceIdentity.match && faceIdentity.match.id !== resumeBlockedStudentId) {
    askFaceResumeConfirmation(faceIdentity.match, faceIdentity.samples.slice(-3).map(sample => sample.descriptor));
  }
}

function askFaceResumeConfirmation(student, descriptors = []) {
  if (isSolo() || !session?.active || phase !== "idle" || isUiBlocking()
    || !currentStudents().includes(student)) return;
  pendingFaceResume = { studentId: student.id, classId: getCurrentClass().id,
    session, descriptors: descriptors.map(descriptor => descriptor.slice()) };
  $("resumeConfirmPreview").innerHTML = `${avatarHTML(student)}<b>${(student.totalScore || 0).toLocaleString()} PTS</b>`;
  $("resumeConfirmModal").classList.remove("hidden");
  // Confirm with a fresh palm; a hand already raised cannot approve the prompt.
  if (typeof resetPalm === "function") resetPalm();
  renderPalmControls();
  syncTracking();
  $("resumeConfirmNo").focus();
}
function closeFaceResumeConfirmation() {
  pendingFaceResume = null;
  $("resumeConfirmModal").classList.add("hidden");
  $("resumeConfirmPreview").innerHTML = "";
}
function declineFaceResume() {
  if (!pendingFaceResume) return;
  resumeBlockedStudentId = pendingFaceResume.studentId;
  closeFaceResumeConfirmation();
  resetFaceIdentity();
  if (typeof resetPalm === "function") resetPalm();
  syncTracking();
  if (!isTeacherOpen()) $("numberedPlayerBtn").focus();
}
function confirmFaceResume() {
  const pending = pendingFaceResume;
  if (!pending) return;
  const student = studentById(pending.studentId);
  const valid = !isSolo() && !isTeacherOpen() && !pendingFaceCapture && phase === "idle" && session?.active
    && session === pending.session && getCurrentClass()?.id === pending.classId && student;
  closeFaceResumeConfirmation();
  if (!valid) { syncTracking(); return; }
  pending.descriptors.forEach(descriptor => learnFaceSample(student, descriptor));
  if (!saveDB()) { resumeBlockedStudentId = student.id; resetFaceIdentity(); syncTracking(); return; }
  beginPlayer(student);
  $("stopGameBtn").focus();
}

function learnFaceSample(student, descriptor) {
  const sample = normalizeFaceDescriptor(descriptor);
  if (!sample) return;
  if (!student.faceSamples) student.faceSamples = [];
  if (student.faceSamples.some(existing => descriptorDistance(existing, sample) < 0.04)) return;
  const samples = [...student.faceSamples, sample];
  // Preserve the first confirmed appearance plus four recent appearances.
  student.faceSamples = samples.length > 5 ? [samples[0], ...samples.slice(-4)] : samples;
}

async function indexSavedFacePhotos() {
  const cls = getCurrentClass();
  if (isSolo() || !recognitionReady || !cls || indexingFaces.has(cls.id)) return;
  indexingFaces.add(cls.id);
  try {
    for (const student of cls.students) {
      if (document.hidden || phase !== "idle" || !faceRecognitionRequested()) break;
      if (!student.photo || student.faceSamples?.length) continue;
      try {
        const image = new Image();
        image.src = student.photo;
        await image.decode();
        const result = await faceapi.detectSingleFace(image,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 }))
          .withFaceLandmarks().withFaceDescriptor();
        if (result && (cls.id === "solo" ? DB.solo : DB.classes[cls.id])?.students.includes(student)) {
          learnFaceSample(student, Array.from(result.descriptor));
          saveDB();
        }
      } catch (error) { console.warn("Saved photo needs a fresh live sample", error); }
    }
  } finally { indexingFaces.delete(cls.id); }
}

function closeFaceConfirmation() {
  pendingFaceCapture = null;
  $("faceConfirmModal").classList.add("hidden");
  syncTracking();
}

function confirmFacePlayer(studentId) {
  const capture = pendingFaceCapture;
  const student = studentId ? studentById(studentId) : null;
  if (!capture || (studentId && !student)) return;
  closeFaceConfirmation();
  completeFaceTurn(student, capture);
}

function completeFaceTurn(student, capture) {
  if (!session?.active || phase !== "idle" || capture.classId !== getCurrentClass()?.id) return;
  if (!student) student = addPhotoPlayer(capture.photo);
  if (!student) return;
  if (!student.photo) student.photo = capture.photo;
  (capture.descriptors || [capture.descriptor]).forEach(descriptor => learnFaceSample(student, descriptor));
  if (!saveDB()) return;
  refreshAll();
  beginPlayer(student);
}

function askFaceConfirmation(capture) {
  pendingFaceCapture = capture;
  $("confirmLivePhoto").src = capture.photo;
  const ranked = rankFaceMatches(capture.descriptor).map(match => match.student);
  const students = [...ranked, ...currentStudents().filter(student => !ranked.includes(student))];
  $("faceConfirmChoices").innerHTML = students.map((student, index) =>
    `<button class="chip-player" type="button" data-face-choice="${student.id}" aria-label="Continue saved player ${index + 1}">${avatarHTML(student)}<b>${student.totalScore || 0} PTS</b></button>`).join("");
  $("faceConfirmModal").classList.remove("hidden");
  syncTracking();
}

function portraitCanvas() {
  const video = $("camera");
  const box = detection.box;
  if (!stream || !detection.face || !box || !video.videoWidth
    || performance.now() - lastTrackingAt > TRACKING_FRESH_MS) return null;
  const size = Math.min(Math.max(box.width, box.height) * 1.45, video.videoWidth, video.videoHeight);
  if (!(size > 0)) return null;
  const x = clamp(box.x + box.width / 2 - size / 2, 0, video.videoWidth - size);
  const y = clamp(box.y + box.height / 2 - size / 2, 0, video.videoHeight - size);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 160;
  const ctx = canvas.getContext("2d");
  ctx.translate(160, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, x, y, size, size, 0, 0, 160, 160);
  return canvas;
}

function drawPlayerPreview() {
  if (phase !== "idle") return;
  const portrait = portraitCanvas();
  const ctx = $("playerPreview").getContext("2d");
  ctx.clearRect(0, 0, 160, 160);
  if (portrait) ctx.drawImage(portrait, 0, 0);
}

function renderLobby() {
  const cls = getCurrentClass();
  document.body.classList.toggle("single-player", isSolo());
  $("classModeBtn").setAttribute("aria-pressed", String(!isSolo()));
  $("singleModeBtn").setAttribute("aria-pressed", String(isSolo()));
  $("lobbyModeLabel").textContent = isSolo() ? "YOUR PRACTICE" : "TODAY'S CLASS";
  $("scoreRule").innerHTML = `<span>★</span> ${isSolo() ? "streaks, points &amp; personal progress" : "streaks, points &amp; live ranks"}`;
  $("startBtn").textContent = isSolo() ? "START SINGLE PLAYER" : "START CLASS GAME";
  $("manageBtn").textContent = isSolo() ? "GAME SETTINGS" : "SET UP CLASS";
  $("nextPlayerBtn").textContent = isSolo() ? "MENU" : "NEXT PLAYER";
  $("replayPlayerBtn").textContent = "PLAY AGAIN";
  renderPalmControls();
  $("difficultySelect").value = selectedDifficulty();
  $("lobbyDifficulty").value = selectedDifficulty();
  $("drawerTitle").textContent = isSolo() ? "Your game" : "Run the class";
  $("formSelect").value = String(selectedForm());
  $("lobbyForm").value = String(selectedForm());
  $("formSelect").disabled = Boolean(session?.active);
  $("lobbyClassName").textContent = cls ? cls.name : "No class yet";
  $("quickCreate").classList.toggle("hidden", Boolean(cls));
  $("lobbyRoster").innerHTML = "";
  if (!cls) {
    $("lobbyRoster").innerHTML = '<div class="roster-empty">Create a class. Add players as they step up to play.</div>';
  } else if (!cls.students.length) {
    $("lobbyRoster").innerHTML = '<div class="roster-empty">Ready for your first face. Photos are captured when players step up.</div>';
  } else {
    cls.students.forEach((student) => {
      const pill = document.createElement("div");
      pill.className = "roster-pill";
      pill.innerHTML = `${avatarHTML(student)}<b>${student.totalScore || 0}<small> PTS</small></b>`;
      $("lobbyRoster").appendChild(pill);
    });
  }
  const top = [...currentStudents()].sort(compareStudents).slice(0, 3);
  $("lobbyTop").innerHTML = top.length
    ? top.map((student) => `<div class="mini-rank-row">${avatarHTML(student)}<b>${student.totalScore || 0} PTS</b></div>`).join("")
    : "";
  $("lobbyTop").hidden = !top.length;
  $("startBtn").disabled = !cls;
}

function renderIdleRanks() {
  const top = [...currentStudents()].sort(compareStudents).slice(0, 5);
  $("idleLeaderboard").innerHTML = top.length
    ? top.map((student) => `<div class="idle-rank-card">${avatarHTML(student)}<span class="pts">${student.totalScore || 0}</span></div>`).join("")
    : '<div class="idle-rank-card"><span class="name">No marks yet</span></div>';
  $("manualChips").innerHTML = currentStudents().map((student) => (
    `<button class="chip-player" type="button" data-student-id="${student.id}" aria-label="Play again as player ${currentStudents().indexOf(student) + 1}">${avatarHTML(student)}<b>${student.photo ? `${student.totalScore || 0} PTS` : `PLAYER ${currentStudents().indexOf(student) + 1} · ${student.totalScore || 0} PTS`}</b></button>`
  )).join("");
  $("manualPicker").classList.toggle("hidden", !currentStudents().length);
}

function renderTeacherRoster() {
  const students = currentStudents();
  $("rosterCount").textContent = String(students.length);
  $("teacherRoster").innerHTML = "";
  if (!students.length) {
    $("teacherRoster").innerHTML = '<div class="roster-empty-row">No students yet.</div>';
    return;
  }
  [...students].sort(compareStudents).forEach((student) => {
    const row = document.createElement("div");
    row.className = "teacher-row";
    row.innerHTML = `${avatarHTML(student)}
      <div class="teacher-row-main">
        <div class="teacher-row-name">${student.photo ? "" : student.numbered ? "Numbered player · " : "Photo needed · "}${student.games || 0} rounds played</div>
        <div class="teacher-row-stats">${student.totalScore || 0} PTS · AVG ${accuracyLabel(student)}</div>
      </div>
      <div class="teacher-row-actions">
        <button class="icon-mini danger" type="button" data-action="delete" data-student-id="${student.id}">X</button>
      </div>`;
    $("teacherRoster").appendChild(row);
  });
}

function renderClassSelect() {
  const entries = Object.values(DB.classes);
  $("classSelect").innerHTML = entries.length
    ? entries.map((cls) => `<option value="${cls.id}">${escapeHtml(cls.name)}</option>`).join("")
    : '<option value="">No classes</option>';
  if (DB.activeClass) $("classSelect").value = DB.activeClass;
}

function renderTeacherMeta() {
  const cls = getCurrentClass();
  if (!cls) {
    $("teacherClassMeta").textContent = "No class selected";
    return;
  }
  const answered = cls.students.reduce((sum, student) => sum + (Number(student.answeredTotal) || 0), 0);
  const correct = cls.students.reduce((sum, student) => sum + (Number(student.correctTotal) || 0), 0);
  const average = answered ? `${Math.round((correct / answered) * 100)}% avg accuracy` : "no answers yet";
  $("teacherClassMeta").textContent = `${cls.students.length} players · ${average} · stored on this device`;
}

function renderSettings() {
  $("appearanceSelect").value = selectedAppearance();
  $("faceResumeToggle").setAttribute("aria-pressed", String(DB.settings.faceResume));
  $("faceResumeToggle").textContent = DB.settings.faceResume ? "FACE RESUME ON" : "FACE RESUME OFF";
  $("extrasToggle").setAttribute("aria-pressed", String(DB.settings.extras !== false));
  $("extrasToggle").classList.toggle("on", DB.settings.extras !== false);
  $("extrasToggle").textContent = DB.settings.extras !== false ? "GAME EXTRAS ON" : "GAME EXTRAS OFF";
  updateSoundUI();
}

function refreshAll() {
  renderAppearance();
  renderClassSelect();
  renderLobby();
  renderIdleRanks();
  renderTeacherRoster();
  renderTeacherMeta();
  renderSettings();
  setHudClass();
  updateSessionHud();
  setCameraUI();
  if (round) setStreak(round.streak);
  else setStreak(0);
}

function createClass(name) {
  if (session?.active || isSolo()) return null;
  const clean = cleanName(name, 40);
  if (!clean) {
    toast("Give the class a name first.", "warn");
    return null;
  }
  const cls = { id: makeId("class"), name: clean, form: selectedForm(), difficulty: selectedDifficulty(), createdAt: Date.now(), students: [], usedQuestionIds: [] };
  DB.classes[cls.id] = cls;
  DB.activeClass = cls.id;
  saveDB();
  refreshAll();
  return cls;
}

function addPhotoPlayer(photo) {
  const cls = getCurrentClass();
  if (!cls || !photo) return null;
  const student = normalizeStudent({ photo });
  if (!student.photo) return null;
  cls.students.push(student);
  saveDB();
  refreshAll();
  return student;
}

function deleteStudent(studentId) {
  const cls = getCurrentClass();
  if (!cls || isSolo()) return;
  const student = studentById(studentId);
  if (!student) return;
  if (!window.confirm("Remove this player’s photo and saved scores?")) return;
  cls.students = cls.students.filter((item) => item.id !== studentId);
  if (activeStudentId === studentId && session?.active) {
    stopSession();
    return;
  }
  saveDB();
  refreshAll();
  toast("Player removed.", "warn");
}

function resetMarks() {
  const cls = getCurrentClass();
  if (!cls) return;
  if (!window.confirm(isSolo() ? "Reset your single-player scores? Used-question history stays." : "Reset every player's marks in this class? Player photos stay.")) return;
  cls.students.forEach((student) => {
    student.totalScore = 0;
    student.bestStreak = 0;
    student.games = 0;
    student.correctTotal = 0;
    student.answeredTotal = 0;
    student.recent = [];
    student.marks = [];
    student.lastPlayed = 0;
  });
  DB.history = DB.history.filter((entry) => entry.classId !== cls.id);
  saveDB();
  refreshAll();
  toast("Marks reset.", "warn");
}

function deleteClass() {
  const cls = getCurrentClass();
  if (!cls || isSolo()) return;
  if (!window.confirm(`Delete ${cls.name}, its players and marks?`)) return;
  if (session?.active) abortSession();
  delete DB.classes[cls.id];
  DB.activeClass = Object.keys(DB.classes)[0] || null;
  saveDB();
  refreshAll();
  showLobby();
  toast("Class deleted.", "warn");
}

function abortSession() {
  session = null;
  phase = "lobby";
  round = null;
  activeStudentId = null;
  clearGameTimers();
  stopMusic();
  hideGameOverlays();
  hideLeaderboard();
  showScreen("lobby");
  document.body.classList.remove("in-session");
  updateSessionHud();
}

function startSession() {
  const cls = getCurrentClass();
  if (!cls) {
    toast("Create a class first.", "warn");
    openTeacher();
    return;
  }
  if (unusedQuestionCount() < QUESTIONS_PER_ROUND) {
    toast("Fewer than 8 unused questions remain at this difficulty. Choose another difficulty or grammar level, or add new questions.", "warn", 6000);
    return;
  }
  if (!selectedBank().length) {
    toast("The question bank did not load. Check questions.js.", "bad", 4200);
    return;
  }
  if (session?.active) {
    toast("The session is already running.", "warn");
    return;
  }
  ensureAudio();
  session = {
    active: true,
    startedAt: Date.now(),
    rounds: 0,
    roundsSinceBoard: 0,
    questionDeck: shuffledQuestions(),
    classId: cls.id
  };
  lastFinishedId = null;
  lastSummary = null;
  round = null;
  activeStudentId = null;
  closeTeacherPanel();
  showScreen("lobby");
  enterIdle();
  sfx.start();
  if (isSolo()) beginPlayer(currentStudents()[0]);
  else toast("Class ready. Start a numbered player, capture a photo, or pick a saved card.", "good", 3200);
}

function stopSession() {
  const wasHomework = isHomework();
  if (!session?.active) {
    if (wasHomework) exitHomeworkMode();
    showLobby();
    return;
  }
  sfx.stop();
  stopMusic();
  session.active = false;
  phase = "lobby";
  round = null;
  activeStudentId = null;
  clearGameTimers();
  hideGameOverlays();
  if (wasHomework) exitHomeworkMode();
  showLobby();
  updateSessionHud();
  stopCamera();
}

function enterIdle() {
  if (!session?.active) return;
  faceCaptureRequested = false;
  resumeBlockedStudentId = lastFinishedId;
  resetFaceIdentity();
  closeFaceConfirmation();
  indexSavedFacePhotos();
  clearGameTimers();
  phase = "idle";
  round = null;
  activeStudentId = null;
  lostShown = false;
  hideGameOverlays();
  hideLeaderboard();
  showScreen(isSolo() ? "lobby" : "idle");
  updateSessionHud();
  setStreak(0);
  const summary = lastSummary;
  $("idleSub").textContent = summary
    ? `Last player scored ${summary.gained}/${QUESTIONS_PER_ROUND}. Next player, step up!`
    : "Tap NEW PLAYER to play straight away, or choose a saved player.";
  setIdleStatus(stream && faceResumeEnabled() ? "Returning players: look at the camera." : stream ? "Look at the camera, then capture your photo" : "New players can start; returning players can tap their card.");
  renderIdleRanks();
  $("questionRemaining").textContent = `${unusedQuestionCount()} fresh questions remain for this class · saved across days`;
  startMusic();
  prepareFaceResume();
}

function showLobby() {
  clearGameTimers();
  stopMusic();
  phase = "lobby";
  session = null;
  round = null;
  activeStudentId = null;
  hideGameOverlays();
  hideLeaderboard();
  showScreen("lobby");
  document.body.classList.remove("in-session");
  setStreak(0);
  updateSessionHud();
  refreshAll();
}

let startingTurn = false;
async function startTurn(existingStudent = null) {
  if (isSolo() || startingTurn || !session?.active || phase !== "idle" || isUiBlocking()) return;
  if (unusedQuestionCount() < QUESTIONS_PER_ROUND) {
    toast("Fewer than 8 unused questions remain. This class will not repeat old questions.", "warn", 6000);
    return;
  }
  // Explicitly choosing a photo always remains available as a fallback.
  if (existingStudent && (existingStudent.photo || existingStudent.numbered)) {
    if (faceIdentity.ready && performance.now() - faceIdentity.at <= TRACKING_FRESH_MS) {
      faceIdentity.samples.slice(-3).forEach(sample => learnFaceSample(existingStudent, sample.descriptor));
      if (!saveDB()) return;
    }
    beginPlayer(existingStudent);
    return;
  }
  faceCaptureRequested = true;
  if (!modelsReady || !recognitionReady) {
    startingTurn = true;
    $("startTurnBtn").disabled = true;
    try {
      if (!stream && !await startCamera()) return;
      if (await loadModels(false)) {
        ensureDetectionLoop();
        toast("Photo camera ready. Look straight ahead, then tap Capture & Play.", "good", 4200);
      }
    } finally { startingTurn = false; $("startTurnBtn").disabled = false; }
    return;
  }
  ensureDetectionLoop();
  indexSavedFacePhotos();
  if (!stream) {
    startingTurn = true;
    $("startTurnBtn").disabled = true;
    try {
      const ready = await startCamera();
      if (ready) toast("Look at the camera and hold still for a face match.", "good", 4200);
    } finally {
      startingTurn = false;
      $("startTurnBtn").disabled = false;
    }
    return;
  }
  const portrait = portraitCanvas();
  if (!portrait || !faceIdentity.ready || performance.now() - faceIdentity.at > TRACKING_FRESH_MS) {
    toast("Keep one face in frame and hold still for a few clear camera frames.", "warn");
    return;
  }
  try {
    const capture = { photo: portrait.toDataURL("image/jpeg", 0.8), descriptor: faceIdentity.descriptor, descriptors: faceIdentity.samples.slice(-3).map(sample => sample.descriptor), classId: getCurrentClass()?.id };
    if (existingStudent || faceIdentity.match || !currentStudents().length) {
      completeFaceTurn(existingStudent || faceIdentity.match, capture);
    } else askFaceConfirmation(capture);
  } catch (error) {
    console.warn("Could not capture player photo", error);
    toast("Could not capture the photo. Please try again.", "bad");
  }
}

function startNumberedPlayer() {
  if (isSolo()) return;
  if (!session?.active || phase !== "idle" || isUiBlocking()) return;
  if (unusedQuestionCount() < QUESTIONS_PER_ROUND) { toast("Not enough unused questions for a full round.", "warn"); return; }
  const cls = getCurrentClass();
  const student = normalizeStudent({numbered:true});
  cls.students.push(student);
  if (!saveDB()) { cls.students.pop(); return; }
  refreshAll();
  beginPlayer(student);
}
function beginPlayer(student) {
  if (!session?.active || phase !== "idle" || !student) return;
  faceCaptureRequested = false;
  clearFaceCanvas();
  resetFaceIdentity();
  activeStudentId = student.id;
  phase = "countdown";
  syncTracking();
  updateSessionHud();
  lostContinueUntil = 0;
  hideLost();
  hideLeaderboard();
  countdownPause();
  $("countdownAvatar").innerHTML = avatarInner(student);
  $("countdownName").textContent = "GET READY";
  lastTrackingAt = 0;
  $("countdownHint").textContent = controlMode() === "palms"
    ? "Show a palm to choose. Lower it between choices."
    : "Click an answer or use the left and right arrow keys.";
  sfx.start();
  let value = 3;
  const tick = () => {
    if (phase !== "countdown") return;
    if (value <= 0) {
      $("countdownOverlay").classList.add("hidden");
      after(120, () => startRound(student));
      return;
    }
    $("countdownNumber").textContent = String(value);
    sfx.countdown(value);
    value -= 1;
    after(820, tick);
  };
  $("countdownOverlay").classList.remove("hidden");
  tick();
}

function countdownPause() {
  $("countdownNumber").textContent = "3";
}

function questionPattern(question) {
  return question.patternId || `${question.topic}:${question.s}`;
}

function shuffledQuestions() {
  const used = new Set(getCurrentClass()?.usedQuestionIds || []);
  const questions = selectedBank().filter(question => !used.has(question.id));
  for (let index = questions.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [questions[index], questions[other]] = [questions[other], questions[index]];
  }
  return questions;
}

function unusedQuestionCount(cls = getCurrentClass()) {
  if (!cls) return selectedBank(cls).length;
  const used = new Set(cls.usedQuestionIds || []);
  return selectedBank(cls).filter(question => !used.has(question.id)).length;
}

function pickQuestion(excluded, excludedTopics) {
  const cls = getCurrentClass();
  if (!session?.active || !cls || (session.classId && session.classId !== cls.id)) return null;
  const used = new Set(cls.usedQuestionIds || []);
  if (!Array.isArray(session.questionDeck)) session.questionDeck = shuffledQuestions();
  session.questionDeck = session.questionDeck.filter(question => !used.has(question.id));
  const questions = new Set(excluded || []);
  const topics = new Set(excludedTopics || []);
  let candidates = session.questionDeck.filter(question => !questions.has(question));
  const outsideRound = candidates.filter(question => !topics.has(question.topic));
  if (outsideRound.length) candidates = outsideRound;
  const bankById = new Map(selectedBank().map(question => [question.id, question]));
  const history = (cls.usedQuestionIds || []).map(id => bankById.get(id)).filter(Boolean);
  const topicCounts = new Map(), patternCounts = new Map();
  history.forEach(question => {
    const pattern = questionPattern(question);
    topicCounts.set(question.topic, (topicCounts.get(question.topic) || 0) + 1);
    patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
  });
  // A name change is still the same construction: keep it out of the next 24 slots.
  const recentPatterns = new Set(history.slice(-24).map(questionPattern));
  const freshPatterns = candidates.filter(question => !recentPatterns.has(questionPattern(question)));
  if (freshPatterns.length) candidates = freshPatterns;
  const recentTopics = new Set(history.slice(-2).map(question => question.topic));
  const freshTopics = candidates.filter(question => !recentTopics.has(question.topic));
  if (freshTopics.length) candidates = freshTopics;
  // Least-used topics first; then rotate through constructions within each topic.
  // Deck order breaks ties randomly, so classes do not repeat a fixed topic cycle.
  candidates.sort((a, b) => (topicCounts.get(a.topic) || 0) - (topicCounts.get(b.topic) || 0)
    || (patternCounts.get(questionPattern(a)) || 0) - (patternCounts.get(questionPattern(b)) || 0));
  if (!candidates.length) return null;
  const index = session.questionDeck.indexOf(candidates[0]);
  const question = session.questionDeck.splice(index, 1)[0];
  if (!Array.isArray(cls.usedQuestionIds)) cls.usedQuestionIds = [];
  cls.usedQuestionIds.push(question.id);
  // Reserve before presenting: reloads and tomorrow’s lesson cannot repeat it.
  if (!saveDB()) {
    cls.usedQuestionIds.pop();
    session.questionDeck.splice(index, 0, question);
    return null;
  }
  return question;
}

function startRound(student) {
  if (!session?.active) return;
  if (unusedQuestionCount() < QUESTIONS_PER_ROUND) {
    toast("Not enough unused questions remain for a full round at this difficulty. Question history has been kept.", "warn", 6000);
    if (isSolo()) stopSession();
    else enterIdle();
    return;
  }
  const questions = [];
  const used = new Set();
  const topics = new Set();
  for (let index = 0; index < QUESTIONS_PER_ROUND; index += 1) {
    const question = pickQuestion(used, topics);
    if (!question) break;
    used.add(question);
    topics.add(question.topic);
    questions.push(question);
  }
  if (questions.length !== QUESTIONS_PER_ROUND) {
    toast("Not enough questions to start a full round.", "bad");
    if (isSolo()) stopSession();
    else enterIdle();
    return;
  }
  phase = "play";
  round = {
    student,
    qs: questions,
    qi: 0,
    results: [],
    answered: false,
    correct: 0,
    wrong: 0,
    points: 0,
    speedBonus: 0,
    responseTimesMs: [],
    streak: 0,
    best: 0,
    redemption: { active: false, q: null, won: false },
    goldenIndex: QUESTIONS_PER_ROUND - 1,
    goldenHit: false,
    palmLog: [],
    bonusShot: { active: false, q: null },
    bonus: "none",
    newBadges: [],
    newBest: false,
    lastSeen: Date.now(),
    pointsThisRound: 0
  };
  // Each turn calibrates from current camera frames.
  hideGameOverlays();
  hideLeaderboard();
  showScreen("play");
  updateSessionHud();
  renderPalmLog();
  renderQuestion();
  startMusic();
}

function renderQuestion() {
  if (!round) return;
  const question = currentQuestion();
  if (!question) return;
  const redemption = round.redemption.active;
  const bonus = Boolean(round.bonusShot.active);
  const golden = !redemption && !bonus && extrasEnabled() && round.qi === round.goldenIndex;
  $("questionCounter").textContent = bonus ? "BONUS SHOT" : redemption ? "REDEMPTION SHOT" : `QUESTION ${round.qi + 1} / ${QUESTIONS_PER_ROUND}`;
  $("questionCounter").classList.toggle("fx-foil", bonus);
  $("questionTopic").textContent = bonus ? "PERFECT BONUS" : String(question.topic || "GRAMMAR").toUpperCase();
  $("redemptionChip").classList.toggle("hidden", !redemption);
  $("redemptionChip").textContent = redemption ? "ONE SHOT · ONE REDEMPTION" : "REDEMPTION READY";
  $("redemptionChip").classList.remove("used");
  $("goldenChip").classList.toggle("hidden", !golden);
  $("goldenChip").textContent = `GOLDEN ×${GOLDEN_MULTIPLIER}`;
  const banner = $("goldenBanner");
  banner.classList.toggle("hidden", !golden && !bonus);
  banner.classList.toggle("bonus-banner", bonus);
  banner.classList.toggle("fx-foil", bonus);
  banner.textContent = bonus ? `BONUS SHOT · +${BONUS_SHOT_POINTS} POINTS` : `GOLDEN QUESTION · ${GOLDEN_MULTIPLIER}× POINTS`;
  $("play").classList.toggle("golden-question", golden);
  $("play").classList.toggle("bonus-question", bonus);
  $("sentence").innerHTML = sentenceMarkup(question);
  $("optionLeftText").textContent = String(question.options?.[0] ?? "");
  $("optionRightText").textContent = String(question.options?.[1] ?? "");
  $("feedbackLine").className = "feedback-line";
  $("feedbackLine").textContent = "";
  $("play").classList.remove("question-enter");
  void $("play").offsetWidth;
  $("play").classList.add("question-enter");
  ["optionLeft", "optionRight"].forEach((id) => {
    $(id).classList.remove("good", "bad", "dim");
    $(id).querySelector(".option-charge i").style.width = "0%";
  });
  round.answered = false;
  round.lastSeen = Date.now();
  renderProgress();
  setStreak(round.streak);
  round.questionTimer = { elapsedMs: 0, startedAt: null };
  resumeQuestionTimer();
  syncTracking();
  if (golden || bonus) sfx.golden();
}

function sentenceMarkup(question) {
  const source = String(question.s || "");
  const word = String(question.w || "");
  const tag = word
    ? `<span class="error-word">${escapeHtml(word)}</span>`
    : '<span class="blank-slot" aria-label="blank">___</span>';
  if (source.includes("{x}")) {
    return escapeHtml(source).replace("{x}", tag);
  }
  const index = source.indexOf(word);
  if (index >= 0 && word) {
    return `${escapeHtml(source.slice(0, index))}${tag}${escapeHtml(source.slice(index + word.length))}`;
  }
  return `${escapeHtml(source)} ${tag}`;
}

function currentQuestion() {
  if (!round) return null;
  if (round.bonusShot?.active) return round.bonusShot.q;
  return round.redemption.active ? round.redemption.q : round.qs[round.qi];
}

function correctIndex(question) {
  const answer = Number(question?.answer);
  if (answer === 0 || answer === 1) return answer;
  const found = question?.options?.indexOf(question.c);
  return found === 0 || found === 1 ? found : 0;
}

function renderProgress(changedIndex = -1) {
  if (!round) return;
  const dots = [];
  for (let index = 0; index < QUESTIONS_PER_ROUND; index += 1) {
    const state = round.results[index] || "";
    dots.push(`<span class="dot ${state}${index === changedIndex ? " pop" : ""}"></span>`);
  }
  if (round.redemption.active) {
    dots.push(`<span class="dot retry${round.redemption.won ? " correct" : ""}${round.answered ? " pop" : ""}"></span>`);
  }
  if (round.bonusShot?.active) {
    dots.push(`<span class="dot bonus${round.answered ? " pop" : ""}"></span>`);
  }
  $("progressDots").innerHTML = dots.join("");
}

function clearCharge() {
  $("optionLeft").querySelector(".option-charge i").style.width = "0%";
  $("optionRight").querySelector(".option-charge i").style.width = "0%";
}

function unlockBadge(student, id) {
  if (!student || !BADGES[id]) return;
  if (!Array.isArray(student.badges)) student.badges = [];
  if (student.badges.includes(id)) return;
  student.badges.push(id);
  if (round && Array.isArray(round.newBadges) && !round.newBadges.includes(id)) round.newBadges.push(id);
}

function answer(side) {
  if (phase !== "play" || !round || round.answered) return;
  if (isPlayBlocked() || document.hidden || lostShown) return;
  const question = currentQuestion();
  if (!question) return;
  pauseQuestionTimer();
  const elapsedMs = Math.round(round.questionTimer.elapsedMs);
  round.responseTimesMs.push(elapsedMs);
  round.answered = true;
  clearCharge();
  const correct = correctIndex(question);
  const chosen = side === "left" ? 0 : 1;
  const ok = chosen === correct;
  if (!round.palmLog) round.palmLog = [];
  const lastReading = typeof palmLastReading !== "undefined" ? palmLastReading : null;
  const freshReading = lastReading && lastReading.side === side && performance.now() - lastReading.at < 2000
    ? lastReading : null;
  const palmEntry = { qi: round.qi, side,
    raw: freshReading ? { label: freshReading.label, score: freshReading.score } : null,
    picked: chosen, correct, ok,
    ...(palmDebugEnabled() ? { sentence: question.s, options: [...question.options],
      capture: typeof palmLastCapture !== "undefined" && palmLastCapture?.side === side
        && performance.now() - palmLastCapture.at < 2000 ? palmLastCapture : null } : {}) };
  round.palmLog.push(palmEntry);
  savePalmDebugIncident(palmEntry);
  renderPalmLog();
  const bonusShot = Boolean(round.bonusShot?.active);
  const redemption = Boolean(round.redemption.active);
  const golden = !bonusShot && !redemption && extrasEnabled() && round.qi === round.goldenIndex;
  const speedBonus = ok ? speedBonusFor(elapsedMs) : 0;
  const timingFeedback = `${(elapsedMs / 1000).toFixed(1)}s · +${speedBonus} SPEED`;
  const chosenEl = chosen === 0 ? $("optionLeft") : $("optionRight");
  const correctEl = correct === 0 ? $("optionLeft") : $("optionRight");
  const otherEl = correct === 0 ? $("optionRight") : $("optionLeft");
  if (bonusShot) {
    if (ok) {
      chosenEl.classList.add("good");
      otherEl.classList.add("dim");
      flashResult(true);
      round.points += BONUS_SHOT_POINTS;
      round.pointsThisRound += BONUS_SHOT_POINTS;
      round.bonus = "won";
      sfx.bonus(true);
      confettiBurst(64, { lite: 10 });
      callout(`BONUS +${BONUS_SHOT_POINTS}`, "good");
      pointPop(BONUS_SHOT_POINTS);
      $("feedbackLine").className = "feedback-line good";
      $("feedbackLine").textContent = `BONUS SHOT MADE! · +${BONUS_SHOT_POINTS}${question.tip ? ` — ${question.tip}` : ""}`;
    } else {
      chosenEl.classList.add("bad");
      correctEl.classList.add("good");
      otherEl.classList.add("dim");
      flashResult(false);
      shakeScreen();
      round.bonus = "missed";
      sfx.bonus(false);
      callout("BONUS MISSED", "bad");
      $("feedbackLine").className = "feedback-line bad";
      $("feedbackLine").textContent = `No bonus this time. Answer: ${question.options?.[correct] || question.c || ""}.`;
    }
    renderProgress(round.qi);
    after(1700, finishRound);
    return;
  }
  if (ok) {
    chosenEl.classList.add("good");
    otherEl.classList.add("dim");
    flashResult(true);
    if (redemption) {
      round.redemption.won = true;
      round.points += 250 + speedBonus;
      round.pointsThisRound += 250 + speedBonus;
      round.speedBonus += speedBonus;
      sfx.redemption();
      confettiBurst(46, { lite: 8 });
      $("feedbackLine").className = "feedback-line good";
      $("feedbackLine").textContent = `REDEMPTION WON! · ${timingFeedback}${question.tip ? ` — ${question.tip}` : ""}`;
      callout(`+${250 + speedBonus}`, "good");
      pointPop(250 + speedBonus);
      $("redemptionChip").classList.add("used");
      $("redemptionChip").textContent = "REDEMPTION USED";
      unlockBadge(round.student, "redemption");
      if (elapsedMs < 2000) unlockBadge(round.student, "speed2");
      renderProgress(round.qi);
      after(1600, finishRound);
      return;
    }
    round.correct += 1;
    round.results[round.qi] = "correct";
    round.streak += 1;
    round.best = Math.max(round.best, round.streak);
    const baseAward = 100 + Math.max(0, round.streak - 1) * 25 + speedBonus;
    const award = golden ? baseAward * GOLDEN_MULTIPLIER : baseAward;
    round.points += award;
    round.pointsThisRound += award;
    round.speedBonus += golden ? speedBonus * GOLDEN_MULTIPLIER : speedBonus;
    const tier = comboFor(round.streak);
    const priorTier = comboFor(round.streak - 1);
    const tierUp = Boolean(tier && tier.label !== priorTier?.label);
    if (golden) {
      round.goldenHit = true;
      unlockBadge(round.student, "golden");
      sfx.goldenCorrect();
      confettiBurst(66, { lite: 10 });
      callout(`GOLDEN +${award}`, "good");
    } else {
      sfx.correct(round.streak);
      if (tierUp) {
        callout(`${tier.label}!`, "good");
        after(120, () => sfx.streak(round.streak));
      } else {
        callout(`+${award}`, "good");
      }
      if (tierUp && tier.burst) confettiBurst(tier.burst, { lite: 6 });
    }
    if (elapsedMs < 2000) unlockBadge(round.student, "speed2");
    if (round.streak >= 5) unlockBadge(round.student, "streak5");
    pointPop(award);
    $("feedbackLine").className = "feedback-line good";
    $("feedbackLine").textContent = `${golden ? "GOLDEN CORRECT" : "CORRECT"} · ${timingFeedback}${golden ? ` · ×${GOLDEN_MULTIPLIER}` : ""}${question.tip ? ` — ${question.tip}` : ""}`;
    renderProgress(round.qi);
    setStreak(round.streak);
    after(1250, advanceRound);
  } else {
    chosenEl.classList.add("bad");
    correctEl.classList.add("good");
    otherEl.classList.add("dim");
    flashResult(false);
    shakeScreen();
    sfx.wrong();
    const brokenCombo = round.streak >= 3;
    callout(redemption ? "REDEMPTION MISSED" : brokenCombo ? "COMBO LOST" : "NOT QUITE", "bad");
    if (redemption) {
      $("feedbackLine").className = "feedback-line bad";
      $("feedbackLine").textContent = `Missed. Answer: ${question.options?.[correct] || question.c || ""}.`;
      renderProgress(round.qi);
      after(1700, finishRound);
      return;
    }
    round.wrong += 1;
    round.results[round.qi] = "wrong";
    round.streak = 0;
    if (brokenCombo) after(120, () => sfx.comboLost());
    setStreak(0);
    $("feedbackLine").className = "feedback-line bad";
    $("feedbackLine").textContent = `Answer: ${question.options?.[correct] || question.c || ""} — ${question.tip || ""}`.trim();
    renderProgress(round.qi);
    after(1700, advanceRound);
  }
}

function advanceRound() {
  if (!round || phase !== "play") return;
  if (round.redemption.active || round.bonusShot?.active) {
    finishRound();
    return;
  }
  round.qi += 1;
  if (round.qi >= QUESTIONS_PER_ROUND) {
    const mainCorrect = round.results.filter((value) => value === "correct").length;
    if (round.wrong === 1) {
      startRedemption();
    } else if (extrasEnabled() && mainCorrect === QUESTIONS_PER_ROUND && unusedQuestionCount() > 0) {
      startBonusPrompt();
    } else {
      finishRound();
    }
    return;
  }
  renderQuestion();
}

function startBonusPrompt() {
  if (!round || phase !== "play") return;
  phase = "bonus";
  const kicker = document.querySelector(".bonus-kicker");
  if (kicker) kicker.textContent = "PERFECT ROUND · 8/8";
  $("bonusOverlay").classList.remove("hidden");
  $("bonusDeclineBtn").disabled = false;
  $("bonusShotBtn").disabled = false;
  renderPalmControls();
  syncTracking();
  sfx.goldenCorrect();
  confettiBurst(70, { lite: 8 });
  callout("PERFECT!", "good");
}

function declineBonusShot() {
  if (!round || phase !== "bonus") return;
  hideOverlay("bonusOverlay");
  round.bonus = "declined";
  phase = "play";
  finishRound();
}

function startBonusShot() {
  if (!round || phase !== "bonus") return;
  const question = pickQuestion(round.qs, new Set(round.qs.map(item => item.topic)));
  if (!question) {
    hideOverlay("bonusOverlay");
    round.bonus = "none";
    phase = "play";
    finishRound();
    return;
  }
  hideOverlay("bonusOverlay");
  round.bonusShot = { active: true, q: question };
  round.bonus = "missed";
  phase = "play";
  round.answered = false;
  round.lastSeen = Date.now();
  updateSessionHud();
  renderQuestion();
  toast("Bonus shot! One question for +250 points.", "good", 2800);
}

function startRedemption() {
  if (!round) return;
  const question = pickQuestion(round.qs, new Set(round.qs.map(question => question.topic)));
  if (!question) { toast("No unused redemption question remains for this class.", "warn"); finishRound(); return; }
  round.redemption = { active: true, q: question, won: false };
  round.answered = false;
  round.lastSeen = Date.now();
  sfx.redemption();
  toast("Exactly one error — ONE redemption shot!", "warn", 3200);
  callout("ONE SHOT", "good");
  renderQuestion();
}

function finishRound() {
  if (!round || !session?.active) return;
  const student = round.student;
  const mainCorrect = round.results.filter((value) => value === "correct").length;
  const redemptionWon = Boolean(round.redemption.active && round.redemption.won);
  const bonusWon = round.bonus === "won";
  const gained = Math.min(QUESTIONS_PER_ROUND, mainCorrect + (redemptionWon ? 1 : 0));
  if (mainCorrect === QUESTIONS_PER_ROUND) {
    round.points += 300;
    round.pointsThisRound += 300;
  }
  const perfect = mainCorrect === QUESTIONS_PER_ROUND;
  const previousMarks = Array.isArray(student.marks) ? student.marks : [];
  const previousBest = previousMarks.length
    ? Math.max(...previousMarks.map(mark => Number(mark.points) || 0)) : 0;
  round.newBest = previousMarks.length > 0 && round.points > previousBest;
  if (perfect) unlockBadge(student, "perfect");
  student.totalScore = (Number(student.totalScore) || 0) + round.points;
  if (student.totalScore >= 1000) unlockBadge(student, "points1000");
  student.bestStreak = Math.max(Number(student.bestStreak) || 0, round.best);
  student.games = (Number(student.games) || 0) + 1;
  student.correctTotal = (Number(student.correctTotal) || 0) + gained;
  student.answeredTotal = (Number(student.answeredTotal) || 0) + QUESTIONS_PER_ROUND;
  student.lastPlayed = Date.now();
  student.recent = [...(student.recent || []), ...round.results].slice(-64);
  student.marks = [...previousMarks, {
    at: Date.now(),
    gained,
    form: selectedForm(),
    difficulty: selectedDifficulty(),
    mode: isHomework() ? "homework" : isSolo() ? "single" : "class",
    total: QUESTIONS_PER_ROUND,
    points: round.points,
    speedBonus: round.speedBonus,
    responseTimesMs: [...round.responseTimesMs],
    best: round.best,
    golden: Boolean(round.goldenHit),
    bonus: round.bonus || "none",
    newBest: round.newBest,
    redemption: round.redemption.active ? (redemptionWon ? "saved" : "missed") : "none"
  }].slice(-40);
  if (!isHomework()) {
    DB.history.push({
      at: Date.now(),
      classId: getCurrentClass()?.id,
      studentId: student.id,
      gained,
      form: selectedForm(),
      difficulty: selectedDifficulty(),
      mode: isSolo() ? "single" : "class",
      total: QUESTIONS_PER_ROUND,
      points: round.points,
      speedBonus: round.speedBonus,
      responseTimesMs: [...round.responseTimesMs],
      best: round.best,
      golden: Boolean(round.goldenHit),
      bonus: round.bonus || "none",
      redemption: redemptionWon ? "saved" : round.redemption.active ? "missed" : "none"
    });
    DB.history = DB.history.slice(-400);
  }
  session.rounds += 1;
  session.roundsSinceBoard += 1;
  lastFinishedId = student.id;
  lastSummary = { gained, points: round.points, bonusWon };
  round.gained = gained;
  round.perfect = perfect;
  phase = "round";
  hideOverlay("bonusOverlay");
  saveDB();
  refreshAll();
  updateSessionHud();
  setStreak(round.best);
  showRoundOverlay(round);
  if (round.newBest) sfx.newBest();
  else sfx.correct(5);
  if (round.newBadges.length) after(420, () => sfx.badge());
  if (gained >= 7) confettiBurst(gained === 8 ? 70 : 42, { lite: gained === 8 ? 8 : 6 });
}

function showRoundOverlay(result) {
  if (!result) return;
  const redemptionText = result.redemption.active
    ? (result.redemption.won ? "SAVED" : "MISSED")
    : "0";
  $("roundPortrait").innerHTML = avatarInner(result.student);
  $("roundName").textContent = "YOUR RESULT";
  $("roundMarks").textContent = String(result.gained);
  $("roundPoints").textContent = `+${result.points}`;
  $("roundSpeedBonus").textContent = `Includes +${result.speedBonus} speed points`;
  $("roundStreak").textContent = String(result.best);
  $("roundRetries").textContent = redemptionText;
  $("roundBest").classList.toggle("hidden", !result.newBest);
  const bonusNote = $("roundBonusNote");
  const bonusPlayed = result.bonus === "won" || result.bonus === "missed";
  bonusNote.classList.toggle("hidden", !bonusPlayed);
  bonusNote.textContent = result.bonus === "won"
    ? `Bonus shot +${BONUS_SHOT_POINTS} points`
    : "Bonus shot missed — no points lost";
  const newBadges = (result.newBadges || []).filter(id => BADGES[id]);
  $("roundBadges").innerHTML = newBadges.map(id => (
    `<span class="badge-chip" title="${BADGES[id].detail}"><b>${BADGES[id].icon}</b>${BADGES[id].label}</span>`
  )).join("");
  $("roundBadges").classList.toggle("hidden", !newBadges.length);
  const lit = Math.round((result.gained / QUESTIONS_PER_ROUND) * 5);
  $("roundStars").innerHTML = Array.from({ length: 5 }, (_, index) => (
    `<span class="${index < lit ? "lit" : ""}" style="--i:${index}">★</span>`
  )).join("");
  for (let index = 0; index < lit; index += 1) after(180 + index * 85, () => sfx.star(index));
  const kicker = document.querySelector(".round-kicker");
  if (kicker) {
    kicker.textContent = result.perfect && result.bonus === "won"
      ? "PERFECT + BONUS"
      : result.perfect && result.bonus === "missed"
        ? "PERFECT · BONUS MISSED"
        : result.perfect
          ? "PERFECT ROUND"
          : result.redemption.won
            ? "REDEMPTION WON"
            : result.redemption.active
              ? "ROUND COMPLETE · REDEMPTION MISSED"
              : "ROUND COMPLETE";
  }
  $("roundOverlay").classList.remove("hidden");
  syncTracking();
}

function boardDue() {
  return !isSolo() && Boolean(session?.active) && session.roundsSinceBoard >= LEADERBOARD_INTERVAL;
}

function leaveCompletedRound(replay) {
  if (phase !== "round" || !session?.active) return;
  if (isSolo() && !replay) { stopSession(); return; }
  const student = replay ? round.student : null;
  if (replay && isHomework()) {
    // Homework practice samples fresh questions from the shared set on each play.
    if (Array.isArray(homeworkMode.class.usedQuestionIds)) homeworkMode.class.usedQuestionIds = [];
    session.questionDeck = shuffledQuestions();
  }
  if (replay && unusedQuestionCount() < QUESTIONS_PER_ROUND) {
    toast("No full round remains at this difficulty. Choose another difficulty or grammar level.", "warn", 6000);
    stopSession();
    return;
  }
  const due = boardDue();
  enterIdle();
  if (due) showLeaderboard({ after: replay ? "replay" : "idle", replayStudentId: student?.id, auto: true });
  else if (student) beginPlayer(student);
}
function replayPlayer() { leaveCompletedRound(true); }
function nextPlayer() { leaveCompletedRound(false); }

function rankedPlayers() {
  return [...currentStudents()].filter(student => student.games > 0).sort(compareStudents);
}

function podiumCharacter(student, rank, priorRank, leaving = false) {
  const playerNumber = currentStudents().findIndex(item => item.id === student.id) + 1;
  const change = priorRank ? priorRank - rank : 0;
  const movement = leaving ? "STEPPING DOWN" : !priorRank ? "ON THE PODIUM" : change > 0 ? `↑ UP ${change}` : change < 0 ? `↓ DOWN ${-change}` : "HOLDING STRONG";
  const shirt = rank === 1 ? "#f3c654" : rank === 2 ? "#91bbed" : "#f1a478";
  return `<div class="podium-contestant ${leaving ? "leaving" : ""} ${student.id === lastFinishedId ? "just-played" : ""}"
      data-rank="${rank}" data-prior-rank="${priorRank || 0}" style="--shirt:${shirt}"
      ${leaving ? 'aria-hidden="true"' : `aria-label="Rank ${rank}, player ${playerNumber}, ${student.totalScore || 0} points, ${movement}"`}>
      <div class="podium-change">${movement}</div>
      <div class="podium-person">
        <svg class="podium-body" viewBox="0 0 120 108" aria-hidden="true">
          <path d="M52 4h16v19H52z" fill="#dfbda8"/>
          <path d="M40 18 23 28 10 62l12 5 16-28v29h44V39l16 28 12-5-13-34-17-10Z" fill="var(--shirt)" stroke="#142b43" stroke-width="2" stroke-linejoin="round"/>
          <path d="m10 62-3 10a7 7 0 0 0 13 4l2-9m76 0 2 9a7 7 0 0 0 13-4l-3-10" fill="#dfbda8"/>
          <path d="M38 64h44l-4 33H63l-3-22-3 22H42z" fill="#233f60"/>
          <path d="M41 94h17v11H35q-3-8 6-11m22 0h16q9 3 6 11H63z" fill="#eef5fc" stroke="#142b43" stroke-width="2"/>
          <circle cx="60" cy="40" r="10" fill="#fff" fill-opacity=".8"/><text x="60" y="45" text-anchor="middle" font-size="14" font-weight="900" fill="#233f60">${leaving ? "★" : rank}</text>
        </svg>
        ${avatarHTML(student, "lb-portrait podium-head")}
      </div>
      <div class="podium-player">PLAYER ${playerNumber}</div>
      ${badgeStrip(student)}
    </div>`;
}

function badgeStrip(student) {
  const ids = Array.isArray(student?.badges) ? student.badges.filter(id => BADGES[id]) : [];
  if (!ids.length) return "";
  const shown = ids.slice(0, 4).map(id => (
    `<span class="lb-badge" title="${BADGES[id].label}: ${BADGES[id].detail}" aria-label="${BADGES[id].label}">${BADGES[id].icon}</span>`
  )).join("");
  return `<div class="lb-badges">${shown}${ids.length > 4 ? `<span class="lb-badge more">+${ids.length - 4}</span>` : ""}</div>`;
}

function leaderboardRows() {
  const students = rankedPlayers();
  if (!students.length) return '<div class="lb-empty">Finish a turn to join the podium.</div>';
  const previous = getCurrentClass()?.leaderboardRanks || {};
  const top = students.slice(0, 3);
  const departing = students.filter((student, index) => index >= 3 && previous[student.id] <= 3);
  const stage = `<div class="podium-stage" aria-label="Top three podium">
    ${top.map((student, index) => `<div class="podium-step place-${index + 1}"><b>${index + 1}</b><span>${student.totalScore || 0} PTS</span></div>`).join("")}
    ${top.map((student, index) => podiumCharacter(student, index + 1, previous[student.id])).join("")}
    ${departing.map(student => podiumCharacter(student, 4, previous[student.id], true)).join("")}
  </div>`;
  return stage + `<div class="lb-runners">` + students.slice(3).map((student, index) => `
    <article class="lb-face-card ${student.id === lastFinishedId ? "me" : ""}" aria-label="Rank ${index + 4}, ${student.totalScore || 0} points">
      <div class="lb-place">#${index + 4}</div>
      ${avatarHTML(student, "lb-portrait")}
      <div class="lb-points">${student.totalScore || 0}<span>POINTS</span></div>
      <div class="lb-face-stats"><span><b>${student.bestStreak || 0}</b> BEST STREAK</span><span><b>${accuracyLabel(student)}</b> ACCURACY</span></div>
      ${badgeStrip(student)}
      ${student.id === lastFinishedId ? '<div class="lb-latest">JUST PLAYED</div>' : ""}
    </article>`).join("") + `</div>`;
}

function animatePodium() {
  const stage = $("leaderboardList").querySelector(".podium-stage");
  if (!stage || !stage.querySelectorAll || typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const width = stage.getBoundingClientRect().width;
  const position = rank => ({x:rank === 1 ? .5 : rank === 2 ? 1/6 : rank === 3 ? 5/6 : .94,
    y:rank === 1 ? 126 : rank === 2 ? 88 : rank === 3 ? 52 : 0});
  stage.querySelectorAll(".podium-contestant").forEach((figure, index) => {
    const rank = Number(figure.dataset.rank), prior = Number(figure.dataset.priorRank);
    const target = position(rank);
    const origin = prior ? position(prior) : {x:target.x,y:0};
    const dx = (origin.x - target.x) * width, dy = target.y - origin.y;
    if (figure.animate && (dx || dy)) figure.animate([
      {transform:`translate(${dx}px, ${dy}px)`, opacity:prior ? 1 : 0},
      {transform:`translate(${dx * .12}px, ${dy * .12 - 9}px)`, opacity:1, offset:.8},
      {transform:"translate(0, 0)",opacity:rank > 3 ? 0 : 1}
    ], {duration:1100,delay:index * 100,easing:"cubic-bezier(.23,1,.32,1)",fill:"both"});
  });
}

function showLeaderboard(options) {
  if (isSolo() || phase === "homework") return;
  if (pendingFaceResume) {
    resumeBlockedStudentId = pendingFaceResume.studentId;
    closeFaceResumeConfirmation();
    resetFaceIdentity();
  }
  pauseQuestionTimer();
  const revision = ++boardRevision;
  const config = options || {};
  const final = Boolean(config.final);
  const fallbackAfter = final ? "lobby" : phase === "play" || phase === "bonus" ? "resume" : "idle";
  boardContext = { final, after: config.after || fallbackAfter, replayStudentId: config.replayStudentId || null };
  if (session?.active) {
    if (config.auto) session.roundsSinceBoard = 0;
  }
  hideOverlay("countdownOverlay");
  hideOverlay("roundOverlay");
  $("leaderboardOverlay").classList.remove("hidden");
  hideLost();
  $("lbTitle").textContent = final ? "Final class leaderboard" : "Top grammar heroes";
  $("closeLeaderboardBtn").textContent = final || boardContext.after === "lobby" ? "BACK TO CLASS" : "BACK TO GAME";
  renderPalmControls();
  $("leaderboardList").innerHTML = leaderboardRows();
  animatePodium();
  syncTracking();
  const cls = getCurrentClass();
  if (cls) {
    cls.leaderboardRanks = Object.fromEntries(rankedPlayers().map((student, index) => [student.id, index + 1]));
    saveDB();
  }
  sfx.board();
  if (controlMode() === "palms" && stream) return;
  const seconds = final ? 15 : 10;
  let left = seconds;
  $("lbCount").textContent = String(left);
  const tick = () => {
    if (revision !== boardRevision || $("leaderboardOverlay").classList.contains("hidden")
      || controlMode() === "palms" && stream) return;
    left -= 1;
    $("lbCount").textContent = String(Math.max(0, left));
    if (left <= 0) closeLeaderboard();
    else after(1000, tick);
  };
  after(1000, tick);
}

function closeLeaderboard() {
  if ($("leaderboardOverlay").classList.contains("hidden")) return;
  const context = boardContext;
  hideLeaderboard();
  if (!context) return;
  if (context.after === "replay") {
    const student = studentById(context.replayStudentId);
    enterIdle();
    if (student) beginPlayer(student);
    return;
  }
  if (context.after === "resume") {
    return;
  }
  if (context.after === "lobby") {
    if (session?.active) enterIdle();
    else showLobby();
    return;
  }
  enterIdle();
}

function openTeacher() {
  pauseQuestionTimer();
  document.body.classList.add("teacher-open");
  $("teacherPanel").setAttribute("aria-hidden", "false");
  $("drawerScrim").classList.remove("hidden");
  $("teacherPanel").inert = false;
  $("drawerClose").focus();
  syncTracking();
  renderTeacherRoster();
  renderTeacherMeta();
  renderSettings();
  renderClassSelect();
  if (palmDebugEnabled()) renderPalmLog();
}

function closeTeacherPanel() {
  document.body.classList.remove("teacher-open");
  $("teacherPanel").setAttribute("aria-hidden", "true");
  $("drawerScrim").classList.add("hidden");
  $("teacherPanel").inert = true;
  resumeQuestionTimer();
  syncTracking();
}

function studioTopicKey(topic) {
  return `custom|${topic.id}`;
}

function studioSets() {
  const custom = DB.customTopics.map(topic => ({
    ...topic,
    key: studioTopicKey(topic),
    custom: true
  }));
  if (!studioBuiltinCache) {
    const builtinMap = new Map();
    const addBuiltin = (form, bank) => {
      bank.forEach(question => {
        const key = `builtin|${form}|${question.topic}`;
        if (!builtinMap.has(key)) {
          builtinMap.set(key, {
            key,
            id: key,
            custom: false,
            name: question.topic,
            form,
            questions: []
          });
        }
        builtinMap.get(key).questions.push(question);
      });
    };
    addBuiltin(1, FORM1_BANK);
    addBuiltin(2, QUESTION_BANK);
    studioBuiltinCache = [...builtinMap.values()];
  }
  return { custom, builtin: studioBuiltinCache };
}

function findStudioSet(key) {
  const sets = studioSets();
  return sets.custom.find(set => set.key === key) || sets.builtin.find(set => set.key === key) || null;
}

function findCustomTopic(id) {
  return DB.customTopics.find(topic => topic.id === id) || null;
}

function commitCustomTopics(nextTopics) {
  const previous = DB.customTopics;
  DB.customTopics = nextTopics;
  if (!saveDB()) {
    DB.customTopics = previous;
    toast("Could not save the question set. Browser storage may be full.", "bad", 6000);
    return false;
  }
  return true;
}

function uniqueCustomName(base, ignoringId) {
  const clean = cleanCustomText(base, 56) || "Custom topic";
  const taken = new Set(DB.customTopics.filter(topic => topic.id !== ignoringId).map(topic => topic.name.toLowerCase()));
  if (!taken.has(clean.toLowerCase())) return clean;
  for (let number = 2; number < 100; number += 1) {
    const suffix = ` ${number}`;
    const candidate = `${clean.slice(0, 60 - suffix.length)}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${clean.slice(0, 51)} copy`;
}

function composeStudioSentence(before, after) {
  const left = cleanCustomText(before, MAX_CUSTOM_TEXT).replace(/\{x\}/gi, "").trim();
  const right = cleanCustomText(after, MAX_CUSTOM_TEXT).replace(/\{x\}/gi, "").trim();
  if (!left && !right) return "";
  if (!right) return `${left} {x}`;
  if (!left) return `{x}${/^[,.;:!?)]/.test(right) ? "" : " "}${right}`;
  return `${left} {x}${/^[,.;:!?)]/.test(right) ? "" : " "}${right}`;
}

function studioPreviewMarkup(before, after, wrong, optionA, optionB, correct, tip) {
  const sentence = composeStudioSentence(before, after);
  const options = [cleanCustomText(optionA, 120) || "Option A", cleanCustomText(optionB, 120) || "Option B"];
  const answer = Number(correct) === 1 ? 1 : 0;
  return `<div class="studio-preview-card">
    <div class="studio-preview-kicker">LIVE PREVIEW</div>
    <p class="studio-preview-sentence">${sentenceMarkup({ s: sentence || "{x}", w: cleanCustomText(wrong, 80) || "wrong word" })}</p>
    <div class="studio-preview-options">
      ${options.map((option, index) => `<span class="${index === answer ? "correct" : ""}"><b>${index === 0 ? "A" : "B"}</b>${escapeHtml(option)}${index === answer ? "<i>correct</i>" : ""}</span>`).join("")}
    </div>
    ${cleanCustomText(tip, 400) ? `<p class="studio-preview-tip">${escapeHtml(cleanCustomText(tip, 400))}</p>` : ""}
  </div>`;
}

function updateStudioPreview() {
  const preview = $("studioQPreview");
  if (!preview) return;
  preview.innerHTML = studioPreviewMarkup(
    $("studioQBefore")?.value,
    $("studioQAfter")?.value,
    $("studioQWrong")?.value,
    $("studioQOptionA")?.value,
    $("studioQOptionB")?.value,
    $("studioQCorrect")?.value,
    $("studioQTip")?.value
  );
}

function renderStudioTopicDraft() {
  const draft = studioState.topicDraft;
  const editing = Boolean(draft.id);
  return `<div class="studio-panel studio-topic-editor">
    <div class="studio-panel-kicker">${editing ? "EDIT GRAMMAR TOPIC" : "NEW GRAMMAR TOPIC"}</div>
    <h3>${editing ? "Name this set" : "Start a question set"}</h3>
    <p class="studio-panel-note">A grammar topic is a set of questions. Build at least eight complete questions to share it as custom homework.</p>
    <div class="studio-form-grid">
      <label class="studio-field wide">TOPIC NAME
        <input class="text-input" id="studioTopicName" type="text" maxlength="60" value="${escapeHtml(draft.name)}" placeholder="e.g. Past Simple — extra practice" autocomplete="off">
      </label>
      <label class="studio-field">GRAMMAR LEVEL
        <select class="select" id="studioTopicForm">
          <option value="1" ${draft.form === 1 ? "selected" : ""}>Form 1</option>
          <option value="2" ${draft.form === 2 ? "selected" : ""}>Form 2</option>
        </select>
      </label>
    </div>
    <div class="studio-panel-actions">
      <button class="btn primary compact" type="button" data-action="save-topic">SAVE TOPIC</button>
      <button class="btn ghost compact" type="button" data-action="cancel-topic">CANCEL</button>
    </div>
  </div>`;
}

function renderStudioQuestionEditor(set, draft) {
  return `<div class="studio-panel studio-question-editor">
    <div class="studio-panel-kicker">${draft.id ? "EDIT QUESTION" : "NEW QUESTION"}</div>
    <h3>${draft.id ? "Change this question" : "Write the next question"}</h3>
    <div class="studio-form-grid">
      <label class="studio-field">BEFORE THE WRONG WORD
        <textarea class="text-input" id="studioQBefore" rows="2" maxlength="500" placeholder="Aina">${escapeHtml(draft.before)}</textarea>
      </label>
      <label class="studio-field">AFTER THE WRONG WORD
        <textarea class="text-input" id="studioQAfter" rows="2" maxlength="500" placeholder="to the library yesterday.">${escapeHtml(draft.after)}</textarea>
      </label>
      <label class="studio-field">WRONG WORD OR PHRASE · UNDERLINED
        <input class="text-input" id="studioQWrong" type="text" maxlength="80" value="${escapeHtml(draft.wrong || "")}" placeholder="walk" autocomplete="off">
      </label>
      <label class="studio-field">OPTION A
        <input class="text-input" id="studioQOptionA" type="text" maxlength="120" value="${escapeHtml(draft.optionA)}" placeholder="walked" autocomplete="off">
      </label>
      <label class="studio-field">OPTION B
        <input class="text-input" id="studioQOptionB" type="text" maxlength="120" value="${escapeHtml(draft.optionB)}" placeholder="walking" autocomplete="off">
      </label>
      <label class="studio-field">CORRECT ANSWER
        <select class="select" id="studioQCorrect">
          <option value="0" ${draft.correct === 0 ? "selected" : ""}>Option A</option>
          <option value="1" ${draft.correct === 1 ? "selected" : ""}>Option B</option>
        </select>
      </label>
      <label class="studio-field">EXPLANATION · OPTIONAL
        <input class="text-input" id="studioQTip" type="text" maxlength="400" value="${escapeHtml(draft.tip)}" placeholder="Use the past simple for a completed action." autocomplete="off">
      </label>
    </div>
    <div id="studioQPreview">${studioPreviewMarkup(draft.before, draft.after, draft.wrong, draft.optionA, draft.optionB, draft.correct, draft.tip)}</div>
    <div class="studio-panel-actions">
      <button class="btn primary compact" type="button" data-action="save-question">SAVE QUESTION</button>
      <button class="btn ghost compact" type="button" data-action="cancel-question">CANCEL</button>
    </div>
  </div>`;
}

function renderStudioQuestionCard(set, question, index) {
  const options = Array.isArray(question.options) ? question.options : [];
  return `<article class="studio-q-card">
    <div class="studio-q-number">#${index + 1}</div>
    <div class="studio-q-sentence">${sentenceMarkup(question)}</div>
    <div class="studio-q-options">
      ${options.map((option, optionIndex) => `<span class="${optionIndex === question.answer ? "correct" : ""}"><b>${optionIndex === 0 ? "A" : "B"}</b>${escapeHtml(option)}${optionIndex === question.answer ? "<i>correct</i>" : ""}</span>`).join("")}
    </div>
    ${question.tip ? `<p class="studio-q-tip">${escapeHtml(question.tip)}</p>` : ""}
    ${set.custom ? `<div class="studio-q-actions">
      <button class="btn mini" type="button" data-action="edit-question" data-question-id="${escapeHtml(question.id)}">EDIT</button>
      <button class="btn mini danger" type="button" data-action="delete-question" data-question-id="${escapeHtml(question.id)}">DELETE</button>
    </div>` : ""}
  </article>`;
}

function renderStudioMain() {
  if (studioState.topicDraft) return renderStudioTopicDraft();
  const set = findStudioSet(studioState.selected);
  if (!set) {
    return `<div class="studio-empty">
      <div class="studio-empty-mark">+</div>
      <h3>No question set selected</h3>
      <p>Create a custom grammar topic, or open a built-in set to browse its questions.</p>
      <button class="btn primary" type="button" data-action="new-topic">CREATE A TOPIC</button>
    </div>`;
  }
  const questions = set.questions || [];
  const shareDisabled = !set.custom || questions.length < QUESTIONS_PER_ROUND;
  const editor = set.custom && studioState.questionDraft
    ? renderStudioQuestionEditor(set, studioState.questionDraft)
    : "";
  return `<div class="studio-main-head">
    <div>
      <div class="studio-eyebrow">${set.custom ? "MY GRAMMAR TOPIC" : "BUILT-IN QUESTION SET"} · FORM ${set.form}</div>
      <h3>${escapeHtml(set.name)}</h3>
      <p>${questions.length} question${questions.length === 1 ? "" : "s"}${set.custom ? " · stored in this browser" : " · read-only"}</p>
    </div>
    <div class="studio-head-actions">
      ${set.custom ? `
        <button class="btn mini" type="button" data-action="edit-topic">EDIT TOPIC</button>
        <button class="btn mini danger" type="button" data-action="delete-topic">DELETE</button>
        <button class="btn mini primary" type="button" data-action="share-topic" ${shareDisabled ? "disabled" : ""}>SHARE HOMEWORK</button>
      ` : `<button class="btn mini primary" type="button" data-action="duplicate-set">DUPLICATE TO MY TOPICS</button>`}
    </div>
  </div>
  <div class="studio-set-stats">
    <span><b>${questions.length}</b> questions</span>
    <span><b>8</b> per homework round</span>
    <span><b>${MAX_CUSTOM_QUESTIONS}</b> max per topic</span>
  </div>
  ${!set.custom ? `<p class="studio-readonly-note">Built-in sets are read-only. Duplicate one to make an editable copy, or create your own topic from scratch.</p>` : ""}
  ${set.custom && questions.length < QUESTIONS_PER_ROUND ? `<p class="studio-readonly-note hot">Add ${QUESTIONS_PER_ROUND - questions.length} more complete question${QUESTIONS_PER_ROUND - questions.length === 1 ? "" : "s"} to unlock the homework link.</p>` : ""}
  ${editor}
  ${set.custom ? `<div class="studio-question-toolbar">
    <div><b>QUESTIONS</b><span>${questions.length} / ${MAX_CUSTOM_QUESTIONS}</span></div>
    <button class="btn primary compact" type="button" data-action="new-question" ${questions.length >= MAX_CUSTOM_QUESTIONS ? "disabled" : ""}>+ ADD QUESTION</button>
  </div>` : `<div class="studio-question-toolbar"><div><b>QUESTIONS</b><span>${questions.length} in this set</span></div></div>`}
  <div class="studio-question-list">
    ${questions.length ? questions.map((question, index) => renderStudioQuestionCard(set, question, index)).join("") : `<div class="studio-empty small"><p>This topic has no questions yet. Add the first one to get started.</p>${set.custom ? '<button class="btn primary compact" type="button" data-action="new-question">+ ADD FIRST QUESTION</button>' : ""}</div>`}
  </div>`;
}

function renderStudio() {
  if (!$("studioOverlay")) return;
  const sets = studioSets();
  if (!studioState.selected || !findStudioSet(studioState.selected)) {
    studioState.selected = sets.custom[0]?.key || sets.builtin[0]?.key || "";
  }
  const search = studioState.search.toLowerCase();
  const matches = set => !search || set.name.toLowerCase().includes(search);
  const custom = sets.custom.filter(matches);
  const builtin = sets.builtin.filter(matches);
  $("studioTopicList").innerHTML = `
    <div class="studio-list-label">MY TOPICS <span>${sets.custom.length}</span></div>
    ${custom.length ? custom.map(set => `<button class="studio-topic ${studioState.selected === set.key ? "active" : ""}" type="button" data-studio-key="${escapeHtml(set.key)}">
      <span class="studio-topic-name">${escapeHtml(set.name)}</span>
      <span class="studio-topic-meta">${set.questions.length} Q · FORM ${set.form}</span>
    </button>`).join("") : `<p class="studio-list-hint">${studioState.search ? "No custom topics match." : "No custom topics yet."}</p>`}
    <div class="studio-list-label">BUILT-IN SETS <span>${sets.builtin.length}</span></div>
    ${builtin.length ? builtin.map(set => `<button class="studio-topic ${studioState.selected === set.key ? "active" : ""}" type="button" data-studio-key="${escapeHtml(set.key)}">
      <span class="studio-topic-name">${escapeHtml(set.name)}</span>
      <span class="studio-topic-meta">${set.questions.length} Q · FORM ${set.form}</span>
    </button>`).join("") : `<p class="studio-list-hint">No built-in sets match.</p>`}
  `;
  $("studioMain").innerHTML = renderStudioMain();
}

function openStudio() {
  if (session?.active) {
    toast("Stop the current game before opening Question Studio.", "warn", 4200);
    return;
  }
  closeTeacherPanel();
  pauseQuestionTimer();
  studioState.search = $("studioSearch")?.value || studioState.search;
  renderStudio();
  $("studioOverlay").classList.remove("hidden");
  $("studioOverlay").setAttribute("aria-hidden", "false");
  $("studioSearch").value = studioState.search;
  syncTracking();
  $("studioCloseBtn").focus();
}

function closeStudio() {
  $("studioOverlay").classList.add("hidden");
  $("studioOverlay").setAttribute("aria-hidden", "true");
  $("shareOverlay").classList.add("hidden");
  studioState.topicDraft = null;
  studioState.questionDraft = null;
  studioState.shareUrl = "";
  syncTracking();
}

function startNewStudioTopic() {
  studioState.topicDraft = { id: "", name: "", form: selectedForm() };
  studioState.questionDraft = null;
  renderStudio();
  $("studioTopicName")?.focus();
}

function editStudioTopic() {
  const set = findStudioSet(studioState.selected);
  if (!set?.custom) return;
  const topic = findCustomTopic(set.id);
  if (!topic) return;
  studioState.topicDraft = { id: topic.id, name: topic.name, form: topic.form };
  studioState.questionDraft = null;
  renderStudio();
  $("studioTopicName")?.focus();
}

function saveStudioTopic() {
  const draft = studioState.topicDraft;
  if (!draft) return;
  const name = uniqueCustomName($("studioTopicName")?.value, draft.id);
  const form = Number($("studioTopicForm")?.value) === 1 ? 1 : 2;
  if (!cleanCustomText($("studioTopicName")?.value, 60)) {
    toast("Give the topic a name first.", "warn");
    $("studioTopicName")?.focus();
    return;
  }
  const now = Date.now();
  let next;
  if (draft.id) {
    const current = findCustomTopic(draft.id);
    if (!current) return;
    next = DB.customTopics.map(topic => topic.id === draft.id
      ? { ...topic, name, form, updatedAt: now } : topic);
  } else {
    if (DB.customTopics.length >= MAX_CUSTOM_TOPICS) {
      toast(`You can keep up to ${MAX_CUSTOM_TOPICS} custom topics.`, "warn");
      return;
    }
    const topic = { id: makeId("topic"), name, form, createdAt: now, updatedAt: now, questions: [] };
    next = [...DB.customTopics, topic];
    studioState.selected = studioTopicKey(topic);
  }
  if (!commitCustomTopics(next)) return;
  studioState.topicDraft = null;
  renderStudio();
  toast(draft.id ? "Topic updated." : "Topic created. Add its first question.", "good");
}

function deleteStudioTopic() {
  const set = findStudioSet(studioState.selected);
  if (!set?.custom) return;
  if (!window.confirm(`Delete "${set.name}" and all of its questions?`)) return;
  const next = DB.customTopics.filter(topic => topic.id !== set.id);
  if (!commitCustomTopics(next)) return;
  studioState.selected = "";
  studioState.questionDraft = null;
  renderStudio();
  toast("Topic deleted.", "warn");
}

function duplicateStudioSet() {
  const set = findStudioSet(studioState.selected);
  if (!set || set.custom) return;
  if (DB.customTopics.length >= MAX_CUSTOM_TOPICS) {
    toast(`You can keep up to ${MAX_CUSTOM_TOPICS} custom topics.`, "warn");
    return;
  }
  const topicId = makeId("topic");
  const questions = set.questions.slice(0, MAX_CUSTOM_QUESTIONS).map(question => {
    const normalized = normalizeCustomQuestion(question, topicId);
    if (!normalized) return null;
    return { ...normalized, id: makeId("cq"), patternId: `custom:${topicId}` };
  }).filter(Boolean);
  if (!questions.length) {
    toast("This set does not contain editable question data.", "warn");
    return;
  }
  const topic = {
    id: topicId,
    name: uniqueCustomName(`${set.name} copy`),
    form: set.form,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    questions
  };
  if (!commitCustomTopics([...DB.customTopics, topic])) return;
  studioState.selected = studioTopicKey(topic);
  studioState.topicDraft = null;
  studioState.questionDraft = null;
  renderStudio();
  const copiedNote = questions.length < set.questions.length ? ` (the first ${questions.length} of ${set.questions.length})` : "";
  toast(`Copied ${questions.length} questions into your topics${copiedNote}.`, "good", 4600);
}

function startStudioQuestion() {
  const set = findStudioSet(studioState.selected);
  if (!set?.custom) return;
  if (set.questions.length >= MAX_CUSTOM_QUESTIONS) {
    toast(`A topic can hold up to ${MAX_CUSTOM_QUESTIONS} questions.`, "warn");
    return;
  }
  studioState.topicDraft = null;
  studioState.questionDraft = { id: "", before: "", after: "", wrong: "", optionA: "", optionB: "", correct: 0, tip: "" };
  renderStudio();
  $("studioQBefore")?.focus();
}

function editStudioQuestion(questionId) {
  const set = findStudioSet(studioState.selected);
  if (!set?.custom) return;
  const topic = findCustomTopic(set.id);
  const question = topic?.questions.find(item => item.id === questionId);
  if (!question) return;
  const pieces = question.s.split("{x}");
  studioState.topicDraft = null;
  studioState.questionDraft = {
    id: question.id,
    before: pieces[0] || "",
    after: pieces.slice(1).join("{x}") || "",
    wrong: question.w || "",
    optionA: question.options?.[0] || "",
    optionB: question.options?.[1] || "",
    correct: question.answer === 1 ? 1 : 0,
    tip: question.tip || ""
  };
  renderStudio();
  $("studioQBefore")?.focus();
}

function saveStudioQuestion() {
  const set = findStudioSet(studioState.selected);
  const draft = studioState.questionDraft;
  if (!set?.custom || !draft) return;
  const topic = findCustomTopic(set.id);
  if (!topic) return;
  const before = $("studioQBefore")?.value || "";
  const after = $("studioQAfter")?.value || "";
  const sentence = composeStudioSentence(before, after);
  if (!sentence) {
    toast("Add the sentence around the wrong word.", "warn");
    $("studioQBefore")?.focus();
    return;
  }
  if (sentence.length > MAX_CUSTOM_TEXT) {
    toast(`Keep the complete sentence under ${MAX_CUSTOM_TEXT} characters.`, "warn", 4200);
    $("studioQAfter")?.focus();
    return;
  }
  const optionA = cleanCustomText($("studioQOptionA")?.value, 120);
  const optionB = cleanCustomText($("studioQOptionB")?.value, 120);
  const wrong = cleanCustomText($("studioQWrong")?.value, 80);
  if (!wrong) {
    toast("Add the wrong word or phrase to underline.", "warn");
    $("studioQWrong")?.focus();
    return;
  }
  if (!optionA || !optionB) {
    toast("Both answer options are needed.", "warn");
    (!optionA ? $("studioQOptionA") : $("studioQOptionB"))?.focus();
    return;
  }
  if (optionA.toLowerCase() === optionB.toLowerCase()) {
    toast("The two options must be different.", "warn");
    $("studioQOptionB")?.focus();
    return;
  }
  if (topic.questions.some(question => question.id !== draft.id && question.s.toLowerCase() === sentence.toLowerCase())) {
    toast("That sentence is already in this topic.", "warn");
    return;
  }
  const answer = Number($("studioQCorrect")?.value) === 1 ? 1 : 0;
  const options = [optionA, optionB];
  const question = {
    id: draft.id || makeId("cq"),
    patternId: `custom:${topic.id}`,
    s: sentence,
    w: wrong,
    c: options[answer],
    f: options[1 - answer],
    options,
    answer,
    tip: cleanCustomText($("studioQTip")?.value, 400)
  };
  let questions;
  if (draft.id) {
    questions = topic.questions.map(item => item.id === draft.id ? question : item);
  } else {
    if (topic.questions.length >= MAX_CUSTOM_QUESTIONS) {
      toast(`A topic can hold up to ${MAX_CUSTOM_QUESTIONS} questions.`, "warn");
      return;
    }
    questions = [...topic.questions, question];
  }
  const next = DB.customTopics.map(item => item.id === topic.id
    ? { ...item, questions, updatedAt: Date.now() } : item);
  if (!commitCustomTopics(next)) return;
  studioState.questionDraft = null;
  renderStudio();
  toast(draft.id ? "Question updated." : "Question added.", "good");
}

function deleteStudioQuestion(questionId) {
  const set = findStudioSet(studioState.selected);
  if (!set?.custom) return;
  const topic = findCustomTopic(set.id);
  const question = topic?.questions.find(item => item.id === questionId);
  if (!question) return;
  if (!window.confirm("Delete this question?")) return;
  const next = DB.customTopics.map(item => item.id === topic.id
    ? { ...item, questions: item.questions.filter(entry => entry.id !== questionId), updatedAt: Date.now() } : item);
  if (!commitCustomTopics(next)) return;
  if (studioState.questionDraft?.id === questionId) studioState.questionDraft = null;
  renderStudio();
  toast("Question deleted.", "warn");
}

async function openHomeworkShare() {
  const set = findStudioSet(studioState.selected);
  if (!set?.custom) return;
  if (set.questions.length < QUESTIONS_PER_ROUND) {
    toast(`Add at least ${QUESTIONS_PER_ROUND} questions before sharing.`, "warn");
    return;
  }
  const codec = window.HomeworkCodec;
  if (!codec) {
    toast("The homework link builder did not load.", "bad", 5000);
    return;
  }
  try {
    const token = await codec.encode({
      title: set.name,
      topic: set.name,
      form: set.form,
      questions: set.questions
    });
    const href = typeof location !== "undefined" ? location.href : "";
    const url = codec.shareUrl(href, token);
    const packed = Math.min(set.questions.length, codec.MAX_QUESTIONS);
    studioState.shareUrl = url;
    $("shareTitle").textContent = `${set.name} homework`;
    $("shareMeta").textContent = `${packed} question${packed === 1 ? "" : "s"} packed into the link${packed < set.questions.length ? ` (the first ${packed})` : ""}.`;
    $("shareLink").value = url;
    $("shareLength").textContent = `${url.length.toLocaleString()} characters · no server or account needed`;
    $("shareOverlay").classList.remove("hidden");
    $("shareLink").focus();
    $("shareLink").select?.();
  } catch (error) {
    toast(error?.message || "Could not build the homework link.", "bad", 6000);
  }
}

async function copyShareLink() {
  const link = $("shareLink")?.value || "";
  if (!link) return;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link);
    else {
      $("shareLink").focus();
      $("shareLink").select();
      document.execCommand?.("copy");
    }
    toast("Homework link copied.", "good");
  } catch {
    $("shareLink").focus();
    $("shareLink").select();
    toast("Select the link and copy it manually.", "warn", 4200);
  }
}

function previewShareLink() {
  if (!studioState.shareUrl) return;
  const opened = window.open?.(studioState.shareUrl, "_blank", "noopener");
  if (!opened) toast("Open the copied link in a new tab to preview it.", "warn", 4200);
}

function closeShare() {
  $("shareOverlay").classList.add("hidden");
  if (isStudioOpen()) $("studioCloseBtn")?.focus();
}

function buildHomeworkQuestions(set) {
  const batch = makeId("hw");
  return set.questions.map((question, index) => {
    const options = [...question.options];
    const answer = question.answer === 1 ? 1 : 0;
    return {
      id: `${batch}_${index}`,
      patternId: `homework:${batch}`,
      topic: set.topic,
      s: question.s,
      w: question.w || "",
      c: options[answer],
      f: options[1 - answer],
      options,
      answer,
      tip: question.tip || ""
    };
  });
}

async function loadHomeworkFromHash() {
  if (typeof location === "undefined" || !window.HomeworkCodec) return;
  const token = window.HomeworkCodec.tokenFromLocation(location.href);
  if (!token) return;
  if (session?.active) {
    toast("Finish the current game before opening a homework link.", "warn", 4200);
    return;
  }
  try {
    const set = await window.HomeworkCodec.decode(token);
    pendingHomework = {
      title: set.title,
      topic: set.topic,
      form: set.form,
      questions: buildHomeworkQuestions(set)
    };
    renderHomeworkLanding();
    closeTeacherPanel();
    closeStudio();
    hideGameOverlays();
    hideLeaderboard();
    phase = "homework";
    showScreen("homework");
    $("hudClass").textContent = "CUSTOM HOMEWORK · READY";
    updateSessionHud();
  } catch (error) {
    pendingHomework = null;
    clearHomeworkHash();
    toast(error?.message || "That homework link could not be opened.", "bad", 6000);
    showLobby();
  }
}

function renderHomeworkLanding() {
  if (!pendingHomework) return;
  const count = pendingHomework.questions.length;
  $("homeworkTitle").textContent = pendingHomework.title;
  $("homeworkTopic").textContent = pendingHomework.topic;
  $("homeworkCount").textContent = String(count);
  $("homeworkForm").textContent = `FORM ${pendingHomework.form}`;
  const ready = count >= QUESTIONS_PER_ROUND;
  $("homeworkStartBtn").disabled = !ready;
  $("homeworkSaveBtn").disabled = false;
  $("homeworkStatus").textContent = ready
    ? `Ready · ${count} question${count === 1 ? "" : "s"} in this set`
    : `This link needs at least ${QUESTIONS_PER_ROUND} complete questions to start.`;
}

function startHomework() {
  if (!pendingHomework) return;
  if (pendingHomework.questions.length < QUESTIONS_PER_ROUND) {
    toast(`This homework needs at least ${QUESTIONS_PER_ROUND} questions.`, "warn");
    return;
  }
  const set = pendingHomework;
  homeworkMode = {
    title: set.title,
    topic: set.topic,
    form: set.form,
    bank: set.questions,
    class: {
      id: "homework",
      name: "Custom homework",
      form: set.form,
      difficulty: "standard",
      createdAt: Date.now(),
      students: [normalizeStudent({ id: "homework_player", numbered: true })],
      leaderboardRanks: {},
      usedQuestionIds: []
    }
  };
  startSession();
  if (!session?.active) {
    homeworkMode = null;
    renderHomeworkLanding();
    showScreen("homework");
  }
}

function savePendingHomework() {
  if (!pendingHomework) return;
  if (DB.customTopics.length >= MAX_CUSTOM_TOPICS) {
    toast(`You can keep up to ${MAX_CUSTOM_TOPICS} custom topics.`, "warn");
    return;
  }
  const topicId = makeId("topic");
  const name = uniqueCustomName(pendingHomework.title || pendingHomework.topic);
  const questions = pendingHomework.questions.slice(0, MAX_CUSTOM_QUESTIONS).map(question => {
    const normalized = normalizeCustomQuestion(question, topicId);
    return normalized ? { ...normalized, id: makeId("cq"), patternId: `custom:${topicId}` } : null;
  }).filter(Boolean);
  if (!questions.length) {
    toast("This homework has no usable questions.", "bad");
    return;
  }
  const topic = {
    id: topicId,
    name,
    form: pendingHomework.form,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    questions
  };
  if (!commitCustomTopics([...DB.customTopics, topic])) return;
  toast(`Saved "${name}" to your topics.`, "good", 4200);
  $("homeworkSaveBtn").disabled = true;
}

function clearHomeworkHash() {
  if (typeof location === "undefined" || typeof history === "undefined") return;
  if (!location.hash && !/[?&](homework|hw)=/.test(location.search)) return;
  try {
    const url = new URL(location.href);
    url.hash = "";
    url.searchParams.delete("homework");
    url.searchParams.delete("hw");
    history.replaceState(null, "", `${url.pathname}${url.search}`);
  } catch {
    // Keep the link intact if a browser blocks history updates (for example file URLs).
  }
}

function exitHomeworkMode() {
  homeworkMode = null;
  pendingHomework = null;
  clearHomeworkHash();
}

function closeHomeworkLanding() {
  exitHomeworkMode();
  showLobby();
}

async function handleHomeworkHashChange() {
  if (session?.active) return;
  const token = typeof location !== "undefined" && window.HomeworkCodec
    ? window.HomeworkCodec.tokenFromLocation(location.href) : "";
  if (!token) {
    if (pendingHomework && !$("homework").classList.contains("hidden")) closeHomeworkLanding();
    return;
  }
  await loadHomeworkFromHash();
}

function bindEvents() {
  window.addEventListener?.("scroll", updateLobbyBrand, { passive: true });
  $("lobby").parentElement?.addEventListener?.("scroll", updateLobbyBrand, { passive: true });
  document.body.classList.toggle("palm-debug-mode", palmDebugEnabled());
  if (palmDebugEnabled()) {
    try { palmDebugIncidents = JSON.parse(sessionStorage.getItem("palm-debug-incidents") || "[]").slice(-5); }
    catch { palmDebugIncidents = []; }
  }
  document.addEventListener("pointerdown", ensureAudio, { capture: true });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (isShareOpen()) closeShare();
      else if (isStudioOpen()) closeStudio();
      else if (isTeacherOpen()) closeTeacherPanel();
      else if (pendingFaceResume) { event.preventDefault(); declineFaceResume(); }
      else if (pendingFaceCapture) closeFaceConfirmation();
      else if (!document.querySelector("#leaderboardOverlay").classList.contains("hidden")) closeLeaderboard();
      return;
    }
    if (pendingFaceResume && !isTeacherOpen()) {
      if (event.key === "Tab") {
        event.preventDefault();
        const controls = [$("resumeConfirmNo"), $("resumeConfirmYes")];
        const current = controls.indexOf(document.activeElement);
        const next = current < 0 ? (event.shiftKey ? controls.length - 1 : 0)
          : (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
        controls[next].focus();
      }
      return;
    }
    if (event.repeat || event.target.closest("input, textarea, select, [contenteditable]")) return;
    if (phase !== "play" || isPlayBlocked()) return;
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
      event.preventDefault();
      answer("left");
    } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
      event.preventDefault();
      answer("right");
    }
  });

  document.querySelectorAll("button").forEach((button) => {
    button.addEventListener("pointerdown", () => {
      if (!button.disabled) {
        ensureAudio();
        sfx.click();
      }
    });
  });

  $("glassAppearanceBtn").addEventListener("click", () => setAppearance("glass"));
  $("liteAppearanceBtn").addEventListener("click", () => setAppearance("lite"));
  $("appearanceSelect").addEventListener("change", () => setAppearance($("appearanceSelect").value));
  window.matchMedia?.("(max-width: 1100px), (pointer: coarse)").addEventListener?.("change", () => {
    renderAppearance();
    setCameraUI();
  });
  $("classModeBtn").addEventListener("click", () => changePlayMode("class"));
  $("singleModeBtn").addEventListener("click", () => changePlayMode("single"));
  ["difficultySelect", "lobbyDifficulty"].forEach(id => $(id).addEventListener("change", () => changeDifficulty($(id).value)));
  $("startBtn").addEventListener("click", startSession);
  $("numberedPlayerBtn").addEventListener("click", startNumberedPlayer);
  $("idleRanksBtn").addEventListener("click", () => showLeaderboard({ after: "idle" }));
  $("controlModeSelect").addEventListener("change", () => setControlMode($("controlModeSelect").value));
  $("startSessionBtn").addEventListener("click", startSession);
  $("stopSessionBtn").addEventListener("click", stopSession);
  $("stopGameBtn").addEventListener("click", stopSession);
  $("roundStopBtn").addEventListener("click", stopSession);
  $("faceResumeToggle").addEventListener("click", () => {
    DB.settings.faceResume = !DB.settings.faceResume;
    if (!DB.settings.faceResume) declineFaceResume();
    saveDB();
    resetFaceIdentity();
    renderSettings();
    syncTracking();
  });
  $("nextPlayerBtn").addEventListener("click", nextPlayer);
  $("replayPlayerBtn").addEventListener("click", replayPlayer);
  $("bonusDeclineBtn").addEventListener("click", declineBonusShot);
  $("bonusShotBtn").addEventListener("click", startBonusShot);
  $("closeLeaderboardBtn").addEventListener("click", closeLeaderboard);
  $("leaderboardBtn").addEventListener("click", () => {
    if (phase === "play") showLeaderboard({ after: "resume" });
    else if (session?.active) showLeaderboard({ after: "idle" });
    else showLeaderboard({ after: "lobby" });
  });
  $("showLbBtn").addEventListener("click", () => {
    closeTeacherPanel();
    if (phase === "play") showLeaderboard({ after: "resume" });
    else if (session?.active) showLeaderboard({ after: "idle" });
    else showLeaderboard({ after: "lobby" });
  });
  $("manageBtn").addEventListener("click", openTeacher);
  $("teacherBtn").addEventListener("click", openTeacher);
  $("drawerClose").addEventListener("click", closeTeacherPanel);
  $("drawerScrim").addEventListener("click", closeTeacherPanel);
  $("newClassBtn").addEventListener("click", () => $("classCreate").classList.toggle("hidden"));
  $("createClassBtn").addEventListener("click", () => {
    if (!createClass($("newClassName").value)) return;
    $("newClassName").value = "";
    $("classCreate").classList.add("hidden");
    toast("Class created.", "good");
  });
  $("quickCreateBtn").addEventListener("click", () => {
    if (!createClass($("quickClassName").value)) return;
    $("quickClassName").value = "";
    toast("Class created.", "good");
  });
  $("quickClassName").addEventListener("keydown", (event) => {
    if (event.key === "Enter") $("quickCreateBtn").click();
  });
  $("newClassName").addEventListener("keydown", (event) => {
    if (event.key === "Enter") $("createClassBtn").click();
  });
  $("formSelect").addEventListener("change", () => changeForm($("formSelect").value));
  $("lobbyForm").addEventListener("change", () => changeForm($("lobbyForm").value));
  $("classSelect").addEventListener("change", () => {
    resetFaceIdentity();
    if (isSolo() || session?.active || !DB.classes[$("classSelect").value]) return;
    DB.activeClass = $("classSelect").value;
    indexSavedFacePhotos();
    saveDB();
    refreshAll();
  });
  $("teacherRoster").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "delete") deleteStudent(button.dataset.studentId);
  });
  $("manualChips").addEventListener("click", (event) => {
    const button = event.target.closest("[data-student-id]");
    if (!button || isUiBlocking()) return;
    const student = studentById(button.dataset.studentId);
    if (student && phase === "idle") startTurn(student);
  });
  $("resumeConfirmNo").addEventListener("click", declineFaceResume);
  $("resumeConfirmYes").addEventListener("click", confirmFaceResume);
  $("faceConfirmCancel").addEventListener("click", closeFaceConfirmation);
  $("faceConfirmNew").addEventListener("click", () => confirmFacePlayer(null));
  $("faceConfirmChoices").addEventListener("click", event => {
    const button = event.target.closest("[data-face-choice]");
    if (button) confirmFacePlayer(button.dataset.faceChoice);
  });
  $("startTurnBtn").addEventListener("click", () => startTurn());
  $("soundToggle").addEventListener("click", () => setSfx(!DB.settings.sfx));
  $("musicToggle").addEventListener("click", () => setMusic(!DB.settings.music));
  $("extrasToggle").addEventListener("click", () => {
    DB.settings.extras = DB.settings.extras === false;
    saveDB();
    renderSettings();
    toast(DB.settings.extras ? "Golden question 8 and bonus shots are on." : "Bonus questions are off. Scoring returns to the classic rules.", "good", 3200);
  });
  $("cameraToggleBtn").addEventListener("click", () => {
    if (stream) { DB.settings.cameraEnabled = false; saveDB(); stopCamera(); }
    else { DB.settings.cameraEnabled = true; saveDB(); startCamera(); }
  });
  $("reloadModelsBtn").addEventListener("click", () => loadModels(true));
  $("fullscreenBtn").addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      console.warn("Fullscreen not available", error);
    }
  });
  $("resetMarksBtn").addEventListener("click", resetMarks);
  $("deleteClassBtn").addEventListener("click", deleteClass);
  $("openStudioBtn").addEventListener("click", openStudio);
  $("studioCloseBtn").addEventListener("click", closeStudio);
  $("studioNewTopicBtn").addEventListener("click", startNewStudioTopic);
  $("studioSearch").addEventListener("input", () => {
    studioState.search = $("studioSearch").value;
    renderStudio();
  });
  $("studioTopicList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-studio-key]");
    if (!button) return;
    studioState.selected = button.dataset.studioKey;
    studioState.topicDraft = null;
    studioState.questionDraft = null;
    renderStudio();
  });
  $("studioMain").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "new-topic") startNewStudioTopic();
    else if (action === "edit-topic") editStudioTopic();
    else if (action === "delete-topic") deleteStudioTopic();
    else if (action === "duplicate-set") duplicateStudioSet();
    else if (action === "new-question") startStudioQuestion();
    else if (action === "edit-question") editStudioQuestion(button.dataset.questionId);
    else if (action === "delete-question") deleteStudioQuestion(button.dataset.questionId);
    else if (action === "save-topic") saveStudioTopic();
    else if (action === "cancel-topic") { studioState.topicDraft = null; renderStudio(); }
    else if (action === "save-question") saveStudioQuestion();
    else if (action === "cancel-question") { studioState.questionDraft = null; renderStudio(); }
    else if (action === "share-topic") openHomeworkShare();
  });
  const studioPreviewEvents = ["studioQBefore", "studioQAfter", "studioQWrong", "studioQOptionA", "studioQOptionB", "studioQCorrect", "studioQTip"];
  for (const type of ["input", "change"]) {
    $("studioMain").addEventListener(type, (event) => {
      if (studioPreviewEvents.includes(event.target.id)) updateStudioPreview();
    });
  }
  $("shareCopyBtn").addEventListener("click", copyShareLink);
  $("shareCloseBtn").addEventListener("click", closeShare);
  $("sharePreviewBtn").addEventListener("click", previewShareLink);
  $("homeworkStartBtn").addEventListener("click", startHomework);
  $("homeworkSaveBtn").addEventListener("click", savePendingHomework);
  $("homeworkCloseBtn").addEventListener("click", closeHomeworkLanding);
  window.addEventListener?.("hashchange", handleHomeworkHashChange);
  $("lostContinueBtn").addEventListener("click", () => {
    lostContinueUntil = Date.now() + 60000;
    hideLost();
    toast("Click or use the arrow keys to answer.", "warn", 3000);
  });
  $("optionLeft").addEventListener("click", () => answer("left"));
  $("optionRight").addEventListener("click", () => answer("right"));
  $("palmDebugBtn").addEventListener("click", runPalmDebugCapture);
  $("palmDebugLeft").addEventListener("click", () => confirmPalmDebugSide("left"));
  $("palmDebugRight").addEventListener("click", () => confirmPalmDebugSide("right"));
  $("palmDebugDownload").addEventListener("click", downloadPalmDebugReport);
  $("palmLogList").addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-palm-shot]");
    if (button) showPalmAnswerFrame(Number(button.dataset.palmShot));
    const incident = event.target.closest?.("[data-palm-incident]");
    if (incident) showPalmDebugEntry(palmDebugIncidents[Number(incident.dataset.palmIncident)]);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pauseQuestionTimer();
      if (typeof resetPalm === "function") resetPalm();
      stopMusic();
      syncTracking();
    }
    else if (session?.active) {
      resumeQuestionTimer();
      startMusic();
      syncTracking();
    }
  });
}

function init() {
  document.body.classList.add("camera-off");
  // Migrate class progress and confirmed face samples without exposing player names.
  saveDB();
  bindEvents();
  refreshAll();
  renderControlMode();
  showLobby();
  loadHomeworkFromHash();
  if (DB.settings.cameraEnabled && window.isSecureContext === true) startCamera();
}

init();
