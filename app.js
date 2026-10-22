"use strict";

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "grammartilt_v2";
const MODEL_URL = "models";
const QUESTION_BANK = Array.isArray(window.BANK) ? window.BANK : [];
const FORM1_BANK = Array.isArray(window.BANK_FORM1) ? window.BANK_FORM1 : [];
function selectedForm(cls = getCurrentClass()) { return (cls ? cls.form : DB.defaultForm) === 1 ? 1 : 2; }
const DIFFICULTIES = {
  easy: { label: "Easy", description: "Core topics: present tenses, articles, plurals and quantities." },
  standard: { label: "Standard", description: "A balanced mix of every topic in your grammar level." },
  challenge: { label: "Challenge", description: "Past tenses and comparisons in Form 1; more complex structures in Form 2." }
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
  const value = cls ? cls.difficulty : DB.defaultDifficulty;
  return Object.hasOwn(DIFFICULTIES, value) ? value : "standard";
}
function selectedBank(cls = getCurrentClass()) {
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
function isSolo() { return DB.playMode === "single"; }
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
  const mode = ["palms", "buttons", "tilt"].includes(value) ? value : "palms";
  DB.settings.controlMode = mode;
  resetTilt();
  if (typeof stopPalmLoop === "function") stopPalmLoop();
  hideLost();
  if (mode !== "tilt") clearFaceCanvas();
  saveDB();
  renderControlMode();
  if (phase === "play" && round && !round.answered) {
    $("feedbackLine").textContent = mode === "palms" ? "Raise your left or right open palm to answer instantly, or tap."
      : mode === "tilt" && stream ? "Tilt left or right and hold." : "Tap an answer or use the left and right arrow keys.";
  }
  if (mode === "palms" && stream) ensurePalmLoop();
}
function renderControlMode() {
  const mode = controlMode();
  document.body.classList.toggle("control-palms", mode === "palms");
  document.body.classList.toggle("control-buttons", mode === "buttons");
  $("controlModeSelect").value = mode;
  setCameraUI();
}
const TRACKING_FRESH_MS = 450;
const NEUTRAL_HOLD_MS = 180;
const FACE_LOST_MS = 5000;
const QUESTIONS_PER_ROUND = 8;
const SPEED_BONUS_MAX = 100;
const SPEED_BONUS_WINDOW_MS = 10000;
const PRAISE = ["NICE!", "CLEAN!", "LOCKED IN!", "SHARP!", "YES!", "BOOM!"];
const CONFETTI_COLORS = ["#7cffcb", "#ffd166", "#7aa2ff", "#ff4d67", "#ffffff", "#b28dff"];
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
  return isSolo() ? DB.solo : DB.activeClass ? DB.classes[DB.activeClass] || null : null;
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
  controlMode: "palms",
  sfx: true,
  music: true,
  lbEvery: 3,
  tiltThreshold: 12,
  tiltHoldMs: 550,
  invertTilt: false
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
    lastPlayed: Number(raw?.lastPlayed) || 0
  };
}

function normalizeDB(raw) {
  const db = {
    version: 6,
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
    updatedAt: Date.now()
  };
  if (!raw || typeof raw !== "object") return db;
  if (raw.settings && typeof raw.settings === "object") {
    db.settings.controlMode = ["palms", "buttons", "tilt"].includes(raw.settings.controlMode) ? raw.settings.controlMode : "palms";
    db.settings.tiltThreshold = clamp(Number(raw.settings.tiltThreshold) || 12, 8, 24);
    db.settings.tiltHoldMs = clamp(Number(raw.settings.tiltHoldMs) || 550, 350, 1200);
    db.settings.invertTilt = raw.settings.invertTilt === true;
    db.settings.sfx = raw.settings.sfx !== false;
    db.settings.music = raw.settings.music !== false;
    db.settings.lbEvery = clamp(Number(raw.settings.lbEvery) || 3, 1, 20);
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

let stream = null;
let modelsReady = false;
let modelsLoading = false;
let detectTimer = null;
let detecting = false;
let faceIdentity = { samples: [], descriptor: null, match: null, ready: false, at: 0 };
let pendingFaceCapture = null;
const indexingFaces = new Set();
let detection = { face: false, box: null, roll: 0, student: null, distance: 0 };
let smoothRoll = null;
let lastTrackingAt = 0;
let calibrationSamples = [];
let neutralCalibrated = false;
let cameraGeneration = 0;
let baseRoll = 0;
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
let tilt = { armed: false, side: null, since: 0 };
let lastHudLabel = "";
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

function isUiBlocking() {
  return isTeacherOpen()
    || !$("faceConfirmModal").classList.contains("hidden")
    || !$("countdownOverlay").classList.contains("hidden")
    || !$("roundOverlay").classList.contains("hidden")
    || !$("leaderboardOverlay").classList.contains("hidden");
}

function isPlayBlocked() {
  return isTeacherOpen()
    || !$("leaderboardOverlay").classList.contains("hidden")
    || !$("roundOverlay").classList.contains("hidden")
    || !$("countdownOverlay").classList.contains("hidden");
}

function speedBonusFor(elapsedMs) {
  return Math.round(SPEED_BONUS_MAX * (1 - clamp(elapsedMs / SPEED_BONUS_WINDOW_MS, 0, 1)));
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

const sfx = {
  click() {
    sfxTone(760, 0.05, "square", 0.055);
  },
  correct() {
    [523, 659, 784, 1047].forEach((note, index) => {
      sfxTone(note, 0.12, index === 3 ? "triangle" : "square", 0.11, index * 0.065);
    });
  },
  wrong() {
    sfxTone(220, 0.18, "sawtooth", 0.1, 0, 130);
    sfxTone(164, 0.25, "square", 0.08, 0.12, 98);
  },
  streak(level) {
    const root = 660 + Math.min(5, level) * 35;
    [0, 4, 7, 12].forEach((step, index) => {
      sfxTone(root * Math.pow(2, step / 12), 0.08, "square", 0.07, index * 0.045);
    });
  },
  countdown(value) {
    const note = value > 0 ? 440 + value * 90 : 880;
    sfxTone(note, value > 0 ? 0.11 : 0.24, "square", 0.1);
  },
  start() {
    [392, 523, 659, 784].forEach((note, index) => {
      sfxTone(note, 0.16, "triangle", 0.11, index * 0.08);
    });
  },
  stop() {
    [784, 659, 523, 392].forEach((note, index) => {
      sfxTone(note, 0.18, "triangle", 0.09, index * 0.09);
    });
  },
  capture() {
    sfxTone(660, 0.09, "square", 0.09);
    sfxTone(990, 0.13, "square", 0.09, 0.1);
  },
  board() {
    [523, 659, 784].forEach((note, index) => {
      sfxTone(note, 0.18, "triangle", 0.09, index * 0.1);
    });
  },
  redemption() {
    [784, 988, 1175, 1568].forEach((note, index) => {
      sfxTone(note, 0.1, "square", 0.08, index * 0.06);
    });
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
  const el = $("callout");
  el.textContent = message;
  el.className = "callout";
  void el.offsetWidth;
  el.className = `callout show ${toneName || ""}`.trim();
}

function flashResult(ok) {
  const el = $("screenFlash");
  el.className = "screen-flash";
  void el.offsetWidth;
  el.className = `screen-flash ${ok ? "good" : "bad"}`;
  after(820, () => {
    el.className = "screen-flash";
  });
}

function confettiBurst(amount) {
  const layer = $("confettiLayer");
  const count = amount || 34;
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
  const app = $("app");
  app.classList.remove("shake");
  void app.offsetWidth;
  app.classList.add("shake");
  after(450, () => app.classList.remove("shake"));
}

function setHudStudent(student, label) {
  const text = student ? "Your turn" : label || "Waiting for player";
  if (text !== lastHudLabel) {
    $("hudName").textContent = text;
    lastHudLabel = text;
  }
  $("hudAvatar").innerHTML = student ? avatarInner(student) : "?";
  const kicker = $("faceCard").querySelector(".hud-kicker");
  if (kicker) kicker.textContent = student ? "CURRENT PLAYER" : "READY TO PLAY";
}

function setHudClass() {
  const cls = getCurrentClass();
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
  ["classModeBtn", "singleModeBtn", "difficultySelect", "lobbyDifficulty"].forEach(id => { $(id).disabled = active; });
  $("formSelect").disabled = active;
  $("newClassBtn").disabled = active;
  $("createClassBtn").disabled = active;
  $("startSessionBtn").disabled = active || !getCurrentClass();
  $("stopSessionBtn").disabled = !active;
}

function setStreak(value) {
  const number = clamp(Number(value) || 0, 0, 5);
  $("streakValue").textContent = String(value || 0);
  Array.from($("streakStars").children).forEach((star, index) => {
    star.classList.toggle("lit", index < number);
  });
  $("streakRack").classList.toggle("hot", number >= 3);
}

function showScreen(name) {
  ["lobby", "idle", "play"].forEach((screen) => {
    $(screen).classList.toggle("hidden", screen !== name);
  });
  window.scrollTo?.(0, 0);
  $("lobby").parentElement?.scrollTo?.(0, 0);
}

function hideOverlay(id) {
  $(id).classList.add("hidden");
}

function hideGameOverlays() {
  closeFaceConfirmation();
  hideOverlay("countdownOverlay");
  hideOverlay("roundOverlay");
  hideOverlay("playerLost");
}

function hideLeaderboard() {
  boardRevision += 1;
  hideOverlay("leaderboardOverlay");
  boardContext = null;
  resumeQuestionTimer();
}

function setCameraUI() {
  const live = Boolean(stream);
  document.body.classList.toggle("camera-on", live);
  document.body.classList.toggle("camera-off", !live);
  $("cameraToggleBtn").textContent = live ? "STOP CAMERA" : "ENABLE CAMERA";
  $("cameraToggleBtn").setAttribute("aria-pressed", String(live));
  $("cameraToggleBtn").title = live ? "Turn camera off" : "Turn camera on and allow permission";
  $("calibrateBtn").disabled = !live;
  $("optionLeft").querySelector(".option-tag").textContent = controlMode() === "palms" && live ? "◀ LEFT HAND" : controlMode() === "tilt" && live ? "◀ TILT LEFT" : "◀ TAP OR PRESS ←";
  $("optionRight").querySelector(".option-tag").textContent = controlMode() === "palms" && live ? "RIGHT HAND ▶" : controlMode() === "tilt" && live ? "TILT RIGHT ▶" : "TAP OR PRESS → ▶";
  $("camDot").title = live ? "Camera live" : "Camera off";
  $("cameraNote").textContent = live
    ? "Camera ready for palm control. Photo cards are optional and stay on this device."
    : "Camera is optional for buttons. Enable it for palm control or photo cards.";
  setModelStatus();
}

function setModelStatus() {
  const el = $("modelStatus");
  if (modelsReady) {
    el.textContent = "Head tracking and face memory ready. Recognition stays on this device.";
  } else if (modelsLoading) {
    el.textContent = "Loading head tracking…";
  } else {
    el.textContent = stream ? "Camera live. Load head tracking to use tilt controls." : "Camera not started.";
  }
}

async function loadModels(force) {
  if (!window.faceapi) {
    toast("Face engine failed to load. Check vendor/face-api.min.js.", "bad", 4200);
    return false;
  }
  if (modelsReady && !force) return true;
  if (modelsLoading) return false;
  modelsLoading = true;
  modelsReady = false;
  setModelStatus();
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    modelsReady = true;
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
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
    $("camera").srcObject = stream;
    await $("camera").play().catch(() => {});
    smoothRoll = null;
    calibrationSamples = [];
    neutralCalibrated = false;
    resetTilt();
    setCameraUI();
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
  stopPalmLoop();
  resetFaceIdentity();
  cameraGeneration += 1;
  resetTilt();
  if (detectTimer) clearTimeout(detectTimer);
  detectTimer = null;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  $("camera").srcObject = null;
  smoothRoll = null;
  $("playerPreview").getContext("2d").clearRect(0, 0, 160, 160);
  detection = { face: false, box: null, roll: 0, student: null, distance: 0 };
  clearFaceCanvas();
  hideLost();
  setHudStudent(null, "Waiting for player");
  setCameraUI();
}

function ensureDetectionLoop() {
  if (!stream || !modelsReady || detecting || detectTimer) return;
  detectTimer = setTimeout(() => {
    detectTimer = null;
    detectTick();
  }, 30);
}

function rollFromLandmarks(landmarks) {
  const left = landmarks.getLeftEye();
  const right = landmarks.getRightEye();
  const leftX = left.reduce((sum, point) => sum + point.x, 0) / left.length;
  const leftY = left.reduce((sum, point) => sum + point.y, 0) / left.length;
  const rightX = right.reduce((sum, point) => sum + point.x, 0) / right.length;
  const rightY = right.reduce((sum, point) => sum + point.y, 0) / right.length;
  // Treat the eye line as an axis, avoiding the ±180° jump at upright.
  const angle = Math.atan2(rightY - leftY, rightX - leftX) * 180 / Math.PI;
  return ((angle + 270) % 180) - 90;
}

async function detectTick() {
  if (detecting) return;
  detecting = true;
  const generation = cameraGeneration;
  try {
    const video = $("camera");
    if (!stream || !modelsReady || !video.videoWidth) {
      handleNoFace();
    } else {
      let result;
      if (phase !== "idle" && controlMode() !== "tilt") return;
      if (phase === "idle") {
        const faces = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.55 }))
          .withFaceLandmarks().withFaceDescriptors();
        if (generation !== cameraGeneration || !stream) return;
        if (faces.length !== 1) {
          handleNoFace();
          if (faces.length > 1) setIdleStatus("One player at a time · keep other faces out of frame");
          return;
        }
        result = faces[0];
      } else {
        result = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.35 }))
          .withFaceLandmarks();
      }
      if (generation !== cameraGeneration || !stream) return;
      if (!result) {
        handleNoFace();
      } else {
        handleFace(result);
      }
    }
  } catch (error) {
    console.warn("Face detection error", error);
    if (generation === cameraGeneration) handleNoFace();
  } finally {
    detecting = false;
    if (stream && modelsReady) {
      detectTimer = setTimeout(() => {
        detectTimer = null;
        detectTick();
      }, document.hidden ? 700 : 40);
    }
  }
}

function handleFace(result) {
  const roll = rollFromLandmarks(result.landmarks);
  const now = performance.now();
  const gap = now - lastTrackingAt;
  const alpha = 1 - Math.exp(-Math.min(gap, 500) / 85);
  smoothRoll = smoothRoll === null || gap > TRACKING_FRESH_MS
    ? roll : smoothRoll + alpha * (roll - smoothRoll);
  lastTrackingAt = now;
  if (phase === "countdown" || (phase === "play" && !neutralCalibrated)) {
    calibrationSamples.push({ roll, at: now });
    calibrationSamples = calibrationSamples.filter((sample) => now - sample.at < 1100);
    const values = calibrationSamples.map((sample) => sample.roll).sort((a, b) => a - b);
    if (values.length >= 4 && now - calibrationSamples[0].at >= 350
      && values[values.length - 1] - values[0] <= 5) {
      baseRoll = values[Math.floor(values.length / 2)];
      neutralCalibrated = true;
    }
  }
  if (round) round.lastSeen = Date.now();
  detection = {
    face: true,
    box: result.detection.box,
    roll: smoothRoll,
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
  resetFaceIdentity();
  const wasFace = detection.face;
  detection = { face: false, box: null, roll: smoothRoll || 0, student: null, distance: 0 };
  calibrationSamples = [];
  resetTilt();
  clearFaceCanvas();
  $("playerPreview").getContext("2d").clearRect(0, 0, 160, 160);
  if (!wasFace) return;
  if (phase === "idle") {
    setIdleStatus(stream ? "Look at the camera, then capture your photo" : "New numbered players need no face detection · returning players can tap their card");
  } else if (phase === "lobby") {
    setHudStudent(null, "Waiting for player");
  }
}

function drawFaceOverlay(result) {
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

function maybeShowLost() {
  if (phase !== "play" || !round || !session?.active) {
    hideLost();
    return;
  }
  if (isPlayBlocked()) {
    hideLost();
    return;
  }
  if (controlMode() !== "tilt" || !stream || Date.now() < lostContinueUntil) return;
  const lastSeen = detection.face ? Date.now() : round.lastSeen || 0;
  if (!detection.face && Date.now() - lastSeen > FACE_LOST_MS && !lostShown) {
    pauseQuestionTimer();
    lostShown = true;
    $("lostSub").textContent = "Your round is paused. The camera will pick you up again.";
    $("playerLost").classList.remove("hidden");
    sfx.lost();
  }
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
  $("faceMatchStatus").textContent = "Face memory stays on this device · look straight ahead";
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
  setIdleStatus(faceIdentity.match ? "Recognised across several frames · tap CONTINUE MY SCORE"
    : faceIdentity.ready ? "Ready · capture your photo, or tap your saved face" : "Look straight ahead and hold still");
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
  if (!modelsReady || !cls || indexingFaces.has(cls.id)) return;
  indexingFaces.add(cls.id);
  try {
    for (const student of cls.students) {
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
  $("nextPlayerBtn").textContent = isSolo() ? "PLAY AGAIN" : "NEXT PLAYER";
  $("roundLeaderboardBtn").textContent = isSolo() ? "BACK TO MENU" : "LEADERBOARD";
  $("roundAutoHint").classList.toggle("hidden", isSolo());
  $("difficultySelect").value = selectedDifficulty();
  $("lobbyDifficulty").value = selectedDifficulty();
  $("difficultyNote").textContent = DIFFICULTIES[selectedDifficulty()].description;
  $("lobbyDifficultyNote").textContent = DIFFICULTIES[selectedDifficulty()].description;
  $("drawerTitle").textContent = isSolo() ? "Your game" : "Run the class";
  $("formSelect").value = String(selectedForm());
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
    : '<div class="drawer-meta">Marks will appear here after the first round.</div>';
  $("lobbyStatus").textContent = isSolo()
    ? `Your progress stays on this device · ${cls.students[0].games} ${cls.students[0].games === 1 ? "round" : "rounds"} played · ${cls.students[0].totalScore} points`
    : !cls
    ? "Create a class to begin."
    : `${cls.students.length} saved players · ${unusedQuestionCount()} of ${selectedBank().length} Form ${selectedForm()} questions unused · class progress saved`;
  $("startBtn").disabled = !cls;
  const classPasses = Math.floor(unusedQuestionCount() / (30 * (QUESTIONS_PER_ROUND + 1)));
  $("questionBankInfo").textContent = `${unusedQuestionCount().toLocaleString()} unused ${DIFFICULTIES[selectedDifficulty()].label.toLowerCase()} questions · ${new Set(selectedBank().map(q => q.topic)).size} Form ${selectedForm()} topics`
    + (isSolo() ? " · personal question history" : ` · ${classPasses} full rounds for 30 players, including redemption`);
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
  $("tiltSensitivity").value = String(DB.settings.tiltThreshold);
  $("tiltHold").value = String(DB.settings.tiltHoldMs);
  $("invertTiltToggle").textContent = DB.settings.invertTilt ? "DIRECTIONS SWAPPED" : "NORMAL DIRECTIONS";
  $("invertTiltToggle").classList.toggle("on", DB.settings.invertTilt);
  if (document.activeElement !== $("lbEvery")) $("lbEvery").value = String(DB.settings.lbEvery);
  updateSoundUI();
}

function refreshAll() {
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
  if (!session?.active) {
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
  showLobby();
  updateSessionHud();
  if (!isSolo()) showLeaderboard({ final: true, after: "lobby", auto: true });
}

function enterIdle() {
  if (!session?.active) return;
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
  setHudStudent(null, "Waiting for player");
  setStreak(0);
  const summary = lastSummary;
  $("idleSub").textContent = summary
    ? `Last player scored ${summary.gained}/${QUESTIONS_PER_ROUND}. Next player, step up!`
    : "Tap NEW NUMBERED PLAYER to play straight away, or choose a saved player.";
  setIdleStatus(stream ? "Look at the camera, then capture your photo" : "New numbered players need no face detection · returning players can tap their card");
  renderIdleRanks();
  $("questionRemaining").textContent = `${unusedQuestionCount()} fresh questions remain for this class · saved across days`;
  startMusic();
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
  setHudStudent(detection.student || null);
  updateSessionHud();
  refreshAll();
}

let startingTurn = false;
async function startTurn(existingStudent = null) {
  if (startingTurn || !session?.active || phase !== "idle" || isUiBlocking()) return;
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
  if (controlMode() !== "tilt") clearFaceCanvas();
  resetFaceIdentity();
  activeStudentId = student.id;
  phase = "countdown";
  updateSessionHud();
  lostContinueUntil = 0;
  hideLost();
  hideLeaderboard();
  countdownPause();
  $("countdownAvatar").innerHTML = avatarInner(student);
  $("countdownName").textContent = "GET READY";
  calibrationSamples = [];
  neutralCalibrated = false;
  smoothRoll = null;
  lastTrackingAt = 0;
  resetTilt();
  $("countdownHint").textContent = controlMode() === "palms"
    ? "Left hand = left answer. Right hand = right answer. Raise an open palm to answer instantly."
    : controlMode() === "tilt" && stream
    ? "Look straight ahead and hold still to set your centre."
    : "Click an answer or use the left and right arrow keys.";
  setHudStudent(student);
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
    lastSeen: Date.now(),
    pointsThisRound: 0
  };
  // Each turn calibrates from current camera frames.
  if (!neutralCalibrated) calibrationSamples = [];
  tilt = { armed: false, side: null, since: 0 };
  hideGameOverlays();
  hideLeaderboard();
  showScreen("play");
  updateSessionHud();
  setHudStudent(student);
  renderQuestion();
  startMusic();
}

function renderQuestion() {
  if (!round) return;
  const question = currentQuestion();
  if (!question) return;
  const redemption = round.redemption.active;
  $("questionCounter").textContent = redemption ? "REDEMPTION SHOT" : `QUESTION ${round.qi + 1} / ${QUESTIONS_PER_ROUND}`;
  $("questionTopic").textContent = String(question.topic || "GRAMMAR").toUpperCase();
  $("redemptionChip").classList.toggle("hidden", !redemption);
  $("redemptionChip").textContent = redemption ? "ONE SHOT · ONE REDEMPTION" : "REDEMPTION READY";
  $("redemptionChip").classList.remove("used");
  $("sentence").innerHTML = sentenceMarkup(question);
  $("optionLeftText").textContent = String(question.options?.[0] ?? "");
  $("optionRightText").textContent = String(question.options?.[1] ?? "");
  $("feedbackLine").className = "feedback-line";
  $("feedbackLine").textContent = redemption
    ? "One error this round. Make this shot count."
    : controlMode() === "palms" ? "Raise your left or right open palm to answer instantly, or tap." : controlMode() === "tilt" && stream ? "Tilt left or right and hold." : "Click an answer or use the left and right arrow keys.";
  $("tiltCaption").textContent = "CENTRE YOUR HEAD";
  $("play").classList.remove("tilting-left", "tilting-right");
  ["optionLeft", "optionRight"].forEach((id) => {
    $(id).classList.remove("good", "bad", "dim", "tilt-target");
    $(id).querySelector(".option-charge i").style.width = "0%";
  });
  $("tiltArrowLeft").classList.remove("on");
  $("tiltArrowRight").classList.remove("on");
  $("gaugeNeedle").style.left = "50%";
  $("gaugeNeedle").classList.remove("left", "right");
  round.answered = false;
  round.lastSeen = Date.now();
  tilt = { armed: false, side: null, since: 0 };
  renderProgress();
  setStreak(round.streak);
  round.questionTimer = { elapsedMs: 0, startedAt: null };
  resumeQuestionTimer();
}

function sentenceMarkup(question) {
  const source = String(question.s || "");
  const word = String(question.w || "");
  const tag = `<span class="error-word">${escapeHtml(word)}</span>`;
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
  return round.redemption.active ? round.redemption.q : round.qs[round.qi];
}

function correctIndex(question) {
  const answer = Number(question?.answer);
  if (answer === 0 || answer === 1) return answer;
  const found = question?.options?.indexOf(question.c);
  return found === 0 || found === 1 ? found : 0;
}

function renderProgress() {
  if (!round) return;
  const dots = [];
  for (let index = 0; index < QUESTIONS_PER_ROUND; index += 1) {
    const state = round.results[index] || "";
    dots.push(`<span class="dot ${state}"></span>`);
  }
  if (round.redemption.active) {
    dots.push(`<span class="dot retry ${round.redemption.won ? "correct" : ""}"></span>`);
  }
  $("progressDots").innerHTML = dots.join("");
}

function setCharge(side, ratio) {
  const left = $("optionLeft");
  const right = $("optionRight");
  const amount = clamp(ratio, 0, 1) * 100;
  left.querySelector(".option-charge i").style.width = side === "left" ? `${amount}%` : "0%";
  right.querySelector(".option-charge i").style.width = side === "right" ? `${amount}%` : "0%";
  left.classList.toggle("tilt-target", side === "left" && ratio > 0.02);
  right.classList.toggle("tilt-target", side === "right" && ratio > 0.02);
}

function clearCharge() {
  $("optionLeft").querySelector(".option-charge i").style.width = "0%";
  $("optionRight").querySelector(".option-charge i").style.width = "0%";
  $("optionLeft").classList.remove("tilt-target");
  $("optionRight").classList.remove("tilt-target");
  $("tiltArrowLeft").classList.remove("on");
  $("tiltArrowRight").classList.remove("on");
  $("play").classList.remove("tilting-left", "tilting-right");
}

function resetTilt() {
  tilt = { armed: false, side: null, since: 0, neutralSince: null };
  clearCharge();
}

function recalibrateTilt() {
  calibrationSamples = [];
  neutralCalibrated = false;
  resetTilt();
  toast("Look straight ahead and hold still to set your centre.", "good");
}

function updateTilt(now) {
  if (controlMode() !== "tilt") {
    if (controlMode() === "buttons") $("tiltCaption").textContent = "TAP OR USE ← →";
    return;
  }
  if (phase !== "play" || !round || round.answered || isPlayBlocked() || document.hidden) {
    resetTilt();
    return;
  }
  const hasFace = detection.face && smoothRoll !== null && now - lastTrackingAt <= TRACKING_FRESH_MS;
  if (!hasFace || !neutralCalibrated) {
    resetTilt();
    $("tiltCaption").textContent = !stream ? "CLICK OR USE ← →" : !hasFace ? "FINDING YOUR FACE" : "LOOK STRAIGHT · HOLD STILL";
    $("gaugeNeedle").style.left = "50%";
    $("tiltNeedle").style.transform = "translate(-50%, -100%) rotate(0deg)";
    $("gaugeNeedle").classList.remove("left", "right");
    return;
  }
  const relative = (DB.settings.invertTilt ? 1 : -1) * (smoothRoll - baseRoll);
  const threshold = DB.settings.tiltThreshold;
  const release = threshold * 0.5;
  const bounded = clamp(relative, -35, 35);
  $("tiltNeedle").style.transform = `translate(-50%, -100%) rotate(${bounded}deg)`;
  $("gaugeNeedle").style.left = `${50 + (bounded / 35) * 44}%`;
  $("gaugeNeedle").classList.toggle("left", relative < -release);
  $("gaugeNeedle").classList.toggle("right", relative > release);
  if (!tilt.armed) {
    if (Math.abs(relative) <= release) {
      if (tilt.neutralSince == null) tilt.neutralSince = now;
      if (now - tilt.neutralSince >= NEUTRAL_HOLD_MS) tilt.armed = true;
    } else tilt.neutralSince = null;
    clearCharge();
    $("tiltCaption").textContent = tilt.armed ? "TILT TO CHOOSE" : "RETURN TO CENTRE";
    return;
  }
  let side = relative <= -threshold ? "left" : relative >= threshold ? "right" : null;
  if (tilt.side === "left" && relative < -release) side = "left";
  if (tilt.side === "right" && relative > release) side = "right";
  if (!side) {
    tilt.side = null;
    tilt.since = 0;
    clearCharge();
    $("tiltCaption").textContent = "TILT TO CHOOSE";
    return;
  }
  if (tilt.side !== side) {
    tilt.side = side;
    tilt.since = now;
  }
  // Only camera observations can complete a hold; animation frames cannot
  // submit an answer from a frozen camera image.
  const held = Math.max(0, lastTrackingAt - tilt.since);
  const ratio = clamp(held / DB.settings.tiltHoldMs, 0, 1);
  setCharge(side, ratio);
  $("play").classList.toggle("tilting-left", side === "left");
  $("play").classList.toggle("tilting-right", side === "right");
  $("tiltArrowLeft").classList.toggle("on", side === "left");
  $("tiltArrowRight").classList.toggle("on", side === "right");
  $("tiltCaption").textContent = `HOLD ${side.toUpperCase()} · ${Math.round(ratio * 100)}%`;
  if (held >= DB.settings.tiltHoldMs) answer(side);
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
  tilt.armed = false;
  tilt.side = null;
  tilt.since = 0;
  clearCharge();
  const correct = correctIndex(question);
  const chosen = side === "left" ? 0 : 1;
  const ok = chosen === correct;
  const speedBonus = ok ? speedBonusFor(elapsedMs) : 0;
  round.speedBonus += speedBonus;
  const timingFeedback = `${(elapsedMs / 1000).toFixed(1)}s · +${speedBonus} SPEED`;
  const chosenEl = chosen === 0 ? $("optionLeft") : $("optionRight");
  const correctEl = correct === 0 ? $("optionLeft") : $("optionRight");
  const otherEl = correct === 0 ? $("optionRight") : $("optionLeft");
  if (ok) {
    chosenEl.classList.add("good");
    otherEl.classList.add("dim");
    flashResult(true);
    callout(PRAISE[Math.floor(Math.random() * PRAISE.length)], "good");
    if (round.redemption.active) {
      round.redemption.won = true;
      round.points += 250 + speedBonus;
      round.pointsThisRound += 250 + speedBonus;
      sfx.redemption();
      confettiBurst(46);
      $("feedbackLine").className = "feedback-line good";
      $("feedbackLine").textContent = `REDEMPTION WON! · ${timingFeedback}${question.tip ? ` — ${question.tip}` : ""}`;
      callout(`+${250 + speedBonus}`, "good");
      $("redemptionChip").classList.add("used");
      $("redemptionChip").textContent = "REDEMPTION USED";
      renderProgress();
      after(1600, finishRound);
      return;
    }
    round.correct += 1;
    round.results[round.qi] = "correct";
    round.streak += 1;
    round.best = Math.max(round.best, round.streak);
    const award = 100 + Math.max(0, round.streak - 1) * 25 + speedBonus;
    round.points += award;
    round.pointsThisRound += award;
    sfx.correct();
    if (round.streak >= 2) sfx.streak(round.streak);
    if (round.streak >= 4) confettiBurst(24);
    callout(`+${award}`, "good");
    $("feedbackLine").className = "feedback-line good";
    $("feedbackLine").textContent = `CORRECT · ${timingFeedback}${question.tip ? ` — ${question.tip}` : ""}`;
    renderProgress();
    setStreak(round.streak);
    after(1250, advanceRound);
  } else {
    chosenEl.classList.add("bad");
    correctEl.classList.add("good");
    otherEl.classList.add("dim");
    flashResult(false);
    shakeScreen();
    sfx.wrong();
    callout(round.redemption.active ? "REDEMPTION MISSED" : "NOT QUITE", "bad");
    if (round.redemption.active) {
      $("feedbackLine").className = "feedback-line bad";
      $("feedbackLine").textContent = `Missed. Answer: ${question.options?.[correct] || question.c || ""}.`;
      renderProgress();
      after(1700, finishRound);
      return;
    }
    round.wrong += 1;
    round.results[round.qi] = "wrong";
    round.streak = 0;
    setStreak(0);
    $("feedbackLine").className = "feedback-line bad";
    $("feedbackLine").textContent = `Answer: ${question.options?.[correct] || question.c || ""} — ${question.tip || ""}`.trim();
    renderProgress();
    after(1700, advanceRound);
  }
}

function advanceRound() {
  if (!round || phase !== "play") return;
  if (round.redemption.active) {
    finishRound();
    return;
  }
  round.qi += 1;
  if (round.qi >= QUESTIONS_PER_ROUND) {
    if (round.wrong === 1) {
      startRedemption();
    } else {
      finishRound();
    }
    return;
  }
  renderQuestion();
}

function startRedemption() {
  if (!round) return;
  const question = pickQuestion(round.qs, new Set(round.qs.map(question => question.topic)));
  if (!question) { toast("No unused redemption question remains for this class.", "warn"); finishRound(); return; }
  round.redemption = { active: true, q: question, won: false };
  round.answered = false;
  round.lastSeen = Date.now();
  tilt = { armed: false, side: null, since: 0 };
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
  const gained = Math.min(QUESTIONS_PER_ROUND, mainCorrect + (redemptionWon ? 1 : 0));
  if (mainCorrect === QUESTIONS_PER_ROUND) {
    round.points += 300;
    round.pointsThisRound += 300;
  }
  const perfect = mainCorrect === QUESTIONS_PER_ROUND;
  student.totalScore = (Number(student.totalScore) || 0) + round.points;
  student.bestStreak = Math.max(Number(student.bestStreak) || 0, round.best);
  student.games = (Number(student.games) || 0) + 1;
  student.correctTotal = (Number(student.correctTotal) || 0) + gained;
  student.answeredTotal = (Number(student.answeredTotal) || 0) + QUESTIONS_PER_ROUND;
  student.lastPlayed = Date.now();
  student.recent = [...(student.recent || []), ...round.results].slice(-64);
  student.marks = [...(student.marks || []), {
    at: Date.now(),
    gained,
    form: selectedForm(),
    difficulty: selectedDifficulty(),
    mode: isSolo() ? "single" : "class",
    total: QUESTIONS_PER_ROUND,
    points: round.points,
    speedBonus: round.speedBonus,
    responseTimesMs: [...round.responseTimesMs],
    best: round.best,
    redemption: round.redemption.active ? (redemptionWon ? "saved" : "missed") : "none"
  }].slice(-40);
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
    redemption: redemptionWon ? "saved" : round.redemption.active ? "missed" : "none"
  });
  DB.history = DB.history.slice(-400);
  session.rounds += 1;
  session.roundsSinceBoard += 1;
  lastFinishedId = student.id;
  lastSummary = { gained, points: round.points };
  round.gained = gained;
  round.perfect = perfect;
  phase = "round";
  saveDB();
  refreshAll();
  updateSessionHud();
  setStreak(round.best);
  showRoundOverlay(round);
  sfx.correct();
  if (gained >= 7) confettiBurst(gained === 8 ? 70 : 42);
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
  const lit = Math.round((result.gained / QUESTIONS_PER_ROUND) * 5);
  $("roundStars").innerHTML = Array.from({ length: 5 }, (_, index) => (
    `<span class="${index < lit ? "lit" : ""}">★</span>`
  )).join("");
  const kicker = document.querySelector(".round-kicker");
  if (kicker) {
    kicker.textContent = result.perfect
      ? "PERFECT ROUND"
      : result.redemption.won
        ? "REDEMPTION WON"
        : result.redemption.active
          ? "ROUND COMPLETE · REDEMPTION MISSED"
          : "ROUND COMPLETE";
  }
  $("roundOverlay").classList.remove("hidden");
  if (isSolo()) return;
  $("nextCount").textContent = "9";
  let left = 9;
  const tick = () => {
    if (phase !== "round" || $("roundOverlay").classList.contains("hidden")) return;
    left -= 1;
    $("nextCount").textContent = String(Math.max(0, left));
    if (left <= 0) {
      nextPlayer();
    } else {
      after(1000, tick);
    }
  };
  after(1000, tick);
}

function boardDue() {
  if (isSolo() || !session?.active) return false;
  return session.roundsSinceBoard >= DB.settings.lbEvery;
}

function nextPlayer() {
  if (phase !== "round") return;
  if (isSolo()) {
    enterIdle();
    if (unusedQuestionCount() >= QUESTIONS_PER_ROUND) beginPlayer(currentStudents()[0]);
    else { stopSession(); toast("No full round remains at this difficulty. Choose another difficulty or grammar level.", "warn", 6000); }
    return;
  }
  const due = boardDue();
  enterIdle();
  if (due) showLeaderboard({ after: "idle", auto: true });
}

function closeRoundToLeaderboard() {
  if (phase !== "round") return;
  if (isSolo()) { stopSession(); return; }
  $("roundOverlay").classList.add("hidden");
  enterIdle();
  showLeaderboard({ after: "idle" });
}

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
    </div>`;
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
  if (isSolo()) return;
  pauseQuestionTimer();
  const revision = ++boardRevision;
  const config = options || {};
  const final = Boolean(config.final);
  const fallbackAfter = final ? "lobby" : phase === "play" ? "resume" : "idle";
  boardContext = { final, after: config.after || fallbackAfter };
  if (session?.active) {
    if (config.auto) session.roundsSinceBoard = 0;
  }
  hideOverlay("countdownOverlay");
  hideOverlay("roundOverlay");
  $("leaderboardOverlay").classList.remove("hidden");
  hideLost();
  $("lbTitle").textContent = final ? "Final class leaderboard" : "Top grammar heroes";
  $("closeLeaderboardBtn").textContent = final || boardContext.after === "lobby" ? "BACK TO CLASS" : "BACK TO GAME";
  $("leaderboardList").innerHTML = leaderboardRows();
  animatePodium();
  const cls = getCurrentClass();
  if (cls) {
    cls.leaderboardRanks = Object.fromEntries(rankedPlayers().map((student, index) => [student.id, index + 1]));
    saveDB();
  }
  sfx.board();
  const seconds = final ? 15 : 10;
  let left = seconds;
  $("lbCount").textContent = String(left);
  const tick = () => {
    if (revision !== boardRevision || $("leaderboardOverlay").classList.contains("hidden")) return;
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
  renderTeacherRoster();
  renderTeacherMeta();
  renderSettings();
  renderClassSelect();
}

function closeTeacherPanel() {
  document.body.classList.remove("teacher-open");
  $("teacherPanel").setAttribute("aria-hidden", "true");
  $("drawerScrim").classList.add("hidden");
  resumeQuestionTimer();
}

function frame(now) {
  requestAnimationFrame(frame);
  if (phase === "play") {
    updateTilt(now);
    updatePalmFeedback(now);
    maybeShowLost();
  }
}

function bindEvents() {
  document.addEventListener("pointerdown", ensureAudio, { capture: true });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (pendingFaceCapture) closeFaceConfirmation();
      else if (!document.querySelector("#leaderboardOverlay").classList.contains("hidden")) closeLeaderboard();
      else if (isTeacherOpen()) closeTeacherPanel();
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

  $("classModeBtn").addEventListener("click", () => changePlayMode("class"));
  $("singleModeBtn").addEventListener("click", () => changePlayMode("single"));
  ["difficultySelect", "lobbyDifficulty"].forEach(id => $(id).addEventListener("change", () => changeDifficulty($(id).value)));
  $("startBtn").addEventListener("click", startSession);
  $("numberedPlayerBtn").addEventListener("click", startNumberedPlayer);
  $("controlModeSelect").addEventListener("change", () => setControlMode($("controlModeSelect").value));
  $("startSessionBtn").addEventListener("click", startSession);
  $("stopSessionBtn").addEventListener("click", stopSession);
  $("nextPlayerBtn").addEventListener("click", nextPlayer);
  $("roundLeaderboardBtn").addEventListener("click", closeRoundToLeaderboard);
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
  $("faceConfirmCancel").addEventListener("click", closeFaceConfirmation);
  $("faceConfirmNew").addEventListener("click", () => confirmFacePlayer(null));
  $("faceConfirmChoices").addEventListener("click", event => {
    const button = event.target.closest("[data-face-choice]");
    if (button) confirmFacePlayer(button.dataset.faceChoice);
  });
  $("startTurnBtn").addEventListener("click", () => startTurn());
  $("soundToggle").addEventListener("click", () => setSfx(!DB.settings.sfx));
  $("musicToggle").addEventListener("click", () => setMusic(!DB.settings.music));
  $("cameraToggleBtn").addEventListener("click", () => {
    if (stream) stopCamera();
    else startCamera();
  });
  $("reloadModelsBtn").addEventListener("click", () => loadModels(true));
  $("calibrateBtn").addEventListener("click", recalibrateTilt);
  $("invertTiltToggle").addEventListener("click", () => {
    DB.settings.invertTilt = !DB.settings.invertTilt;
    resetTilt();
    saveDB();
    renderSettings();
  });
  [["tiltSensitivity", "tiltThreshold"], ["tiltHold", "tiltHoldMs"]].forEach(([id, setting]) => {
    $(id).addEventListener("change", () => {
      DB.settings[setting] = Number($(id).value);
      resetTilt();
      saveDB();
    });
  });
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
  $("lbEvery").addEventListener("input", () => {
    const value = clamp(Number($("lbEvery").value) || 3, 1, 20);
    DB.settings.lbEvery = value;
    saveDB();
  });
  $("lbEvery").addEventListener("blur", () => {
    $("lbEvery").value = String(DB.settings.lbEvery);
  });
  $("lostContinueBtn").addEventListener("click", () => {
    lostContinueUntil = Date.now() + 60000;
    hideLost();
    toast("Click or use the arrow keys to answer.", "warn", 3000);
  });
  $("optionLeft").addEventListener("click", () => answer("left"));
  $("optionRight").addEventListener("click", () => answer("right"));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pauseQuestionTimer();
      resetTilt();
      if (typeof resetPalm === "function") resetPalm();
      stopMusic();
    }
    else if (session?.active) {
      resumeQuestionTimer();
      startMusic();
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
  loadModels(false);
  requestAnimationFrame(frame);
}

init();
