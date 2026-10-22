# Grammar

IdontEvenKnowHer

Live app: https://hedarchion.github.io/tiltgrammarform2/

A static classroom game with a Form 1/Form 2 selector: 1,000 easy Form 1 questions
across 10 topics and the original 1,000 Form 2 questions across 20 topics. There are eight
questions per turn and a redemption question after exactly one error. Thirty
students can play three turns each: 720 main questions plus up to 90 redemptions.

## Single player and difficulty

Choose **Class mode** or **Single player** on the home screen. Single player starts
an eight-question turn directly, without a class, enrollment or camera permission.
It keeps one personal profile, scores and question history separately from classes.
Results wait for **Play again** or **Back to menu**; there is no player rotation or
automatic class podium. Switching back restores the selected class and its records.
Everything stays in this browser on this device.

Choose difficulty on the home screen or in **Settings → Game settings** before
starting. Both mode and difficulty are locked during a session. Each class and the
personal profile remember their grammar level and difficulty independently.

- **Easy:** core topics. Form 1 covers present simple/continuous, articles, plurals,
  some/any and much/many (600 questions). Form 2 covers present simple/continuous,
  articles, countable nouns, quantifiers and subject–verb agreement (300 questions).
- **Standard:** all 1,000 questions for the selected form; the existing default.
- **Challenge:** Form 1 covers past simple/continuous and comparisons (400 questions).
  Form 2 covers passive voice, question tags, conjunctions, -ed/-ing adjectives,
  pronouns and uncountable nouns (300 questions).

Difficulty selects a topic mix, with the same eight-question format, controls and
scoring. Completed turns record their form and difficulty. Used-question history is
shared across difficulty settings within each class or personal profile, so changing
difficulty never makes a used question fresh. A smaller pool can run out sooner;
select another difficulty or form to use its remaining questions.

## Choose Glass or Lite

One app includes two UI styles. Choose **Glass / Lite** on the home screen, or
**Settings → Appearance** during a round. Phones and tablets default to Lite in both
modes. Selecting Glass on those devices asks for confirmation because it uses more
power. Desktop class mode defaults to Glass; single player defaults to Lite. Each
mode remembers its choice separately for mobile and desktop layouts.
Switching styles preserves the active question, camera controls, scores and history.

**Glass** restores the translucent panels, optical refraction and camera backdrop.
Its renderer loads only when
Glass is selected; static scenes redraw on changes, and live camera refraction is
capped at 24 fps. Selecting Lite cancels rendering callbacks, removes the optical
canvases, disconnects its observers and releases its GPU context. Browsers without
WebGL and reduced-transparency preferences retain a CSS glass fallback.

**Lite** keeps the high-contrast phone/tablet design, including on larger screens,
with simpler surfaces, restrained effects and no decorative renderer. Both styles
use the same immediate left/right palm selection and optional camera controls.

## Palm navigation

With Camera on and palm controls selected, the same hand gestures navigate the game.
The answer cards show mirrored hand illustrations with L/R markers. Result actions
stay in the same spatial order: left opens ranks (or the solo menu), right continues
to the next player (or replays solo). On player entry, left opens ranks and right
starts a new numbered player. On ranks, right returns to the game. On the home
screen, right starts the selected mode. These actions use the existing touch buttons.

One gesture triggers one action. Lower or close the hand between choices, including
between screens; there is no dwell timer. Held hands cannot skip results, create
multiple players or answer the next question. Stale camera results are discarded
when screens change. Settings, photo confirmation and hidden tabs suspend palm
input. Results and ranks wait for a gesture or tap while palm navigation is active.
Camera-off and other control modes retain their existing automatic progression.
The cues use one small local SVG, with no new image or model dependencies.

## Phone and tablet layout

Lite uses a solid, high-contrast interface with a compact header,
44-pixel minimum header controls, large answer cards, and readable question text.
Grammar level and difficulty are available directly on the home screen. Answers
stay side by side; landscape phones place the question beside them. The camera
preview is a small status strip, hidden on short phones to keep answers visible.
Results and settings scroll within the screen, respect safe areas, and use native
expandable settings groups. Glass remains available at any screen size.

## Less background work

- Lite has no decorative WebGL renderer, canvas refraction or permanent app animation loop. Glass is an explicit higher-power visual option.
- No tracking-library or model downloads on startup or during ordinary button play.
- Palm mode loads only the hand engine. Head tilt loads the detector and landmarks;
  face recognition loads separately when **Capture & Play** requests it.
- Idle numbered-player screens do not run face recognition. Settings and hidden
  tabs stop tracking callbacks. Answer feedback stops palm inference once the hand
  has been lowered/closed, and the next question resumes it immediately.
- Camera capture requests 640×360 at up to 30 fps, rather than 1280×720. Palm
  classification still runs on fresh camera frames without a confirmation timer;
  only preview painting is capped at 12 fps. Hidden previews are not painted.
- Lite skips full-screen camera compositing, backdrop blur, screen
  flashes, callout effects and confetti particles.

These changes remove work; device-specific battery life and tracking latency have
not been measured on physical phones. To inspect layouts locally, open
`tests/mobile-preview.html` on a separate localhost port so its fixture does not
mix demo scores into normal browser records. It supports small phone, phone,
landscape phone, portrait/landscape tablet and classroom viewport sizes, plus
home, play, long-question, camera-layout, result, settings, class and ranks scenes.
The camera-layout fixture is simulated and never requests camera access.

## Continue across days

Choose the same class tomorrow. Photos, confirmed face samples, completed-round
scores and used-question history remain in this browser's localStorage.

Each class has its own permanent list of used question IDs. Questions are reserved
and saved before a round is presented, so restarting the session or reloading does
not repeat them. An interrupted turn's reserved questions stay used. New sessions
shuffle only unused questions. Exhausted banks do **not** automatically recycle:
new question content must be added before further full rounds can start. Resetting
scores does not reset question history. Content-derived question IDs remain stable
when the source bank is reordered.

Question source: `scripts/build-questions.cjs`, with five curated constructions per
topic and ten matched contexts for each construction. Rebuild with
`node scripts/build-questions.cjs`.

## Optional photo players

1. Create or select a class and start the game. No names or separate enrollment.
2. Tap **Capture & Play** to enable photo recognition, with just one player in frame.
   The face engine loads on this first request. Recognition uses several
   clear frames and checks that the best match is sufficiently distinct from
   the next candidate. A recognised returning portrait and its score appear
   before the player taps **Continue My Score**.
3. For a new player, **Capture & Play** saves a portrait and confirmed face
   samples. Existing portraits are indexed locally to support previous records.
4. If recognition is uncertain, choose the correct saved portrait or explicitly
   confirm a new player. Tapping a saved photo remains a fallback; it also teaches
   the profile the current appearance when there are clear live frames.
5. Each profile retains its first confirmed sample plus up to four recent samples.
   This supports changing lighting and appearance without silently merging players.
6. During the turn, only the lighter head-landmark tracker runs. Keep the head
   upright during the countdown to calibrate; clicks and arrow keys also work.

Recognition is heuristic and can be affected by lighting, angle and similar faces.
Ambiguous matches ask for confirmation instead of assigning a score automatically.
Multiple visible faces are not accepted for recognition. Portraits identify players
on the HUD, countdown, results, player picker and leaderboard.

## Hosting and local data

Serve this folder as a static site. Keep `index.html`, `app.js`, `questions.js`,
`styles.css`, `glass.css`, `mobile.css`, `glass.js`, `vendor/face-api.min.js` and all tiny detector,
68-point landmark and recognition model files under `models/`. Include
`palm-control.js` and the complete `vendor/hands/` directory for palm controls. Published camera access requires HTTPS; localhost supports development.

There is no backend or account. Class names, portraits, face descriptors, settings,
scores and used-question IDs remain in browser localStorage. Only confirmed player
registration or selection updates a profile. Video is never saved or uploaded.
Publishing the source does not publish browser records. The site address and browser
profile must remain the same to resume: devices do not sync, a deployed site does
not inherit localhost records, and clearing site data deletes these records. Private
browsing may remove records when closed. Google Fonts requests only load typefaces.

Local server: `python3 -m http.server 8766`.

Checks:

- `node tests/glass-renderer.test.cjs`
- `node tests/tilt.test.cjs`
- `node tests/player-flow.test.cjs`
- `node tests/question-bank.test.cjs`

## Form 1 grammar

Choose **Settings → Game settings → Grammar level** before starting. Existing classes default to
Form 2. The choice is saved per class and locked during a session. Both forms keep
their own question history through distinct IDs; switching preserves used questions.

Form 1 uses short sentences and familiar vocabulary for present simple, present
continuous, past simple, past continuous, comparatives, superlatives, a/an, some/any,
much/many and countable plurals. This is an easy practice subset of the
[KSSM Form 1 DSKP textbook scope](https://anyflip.com/iowpp/goxm/basic/51-76)
(Pulse 2 Units 1–5, printed pages 50–55), rather than exhaustive syllabus coverage.
Each topic has five constructions with twenty named contexts. Rebuild using
`node scripts/build-form1.cjs`. Include `questions-form1.js` when hosting.

## Classroom controls

Open-palm control is the default; choose buttons/arrow keys or optional head tilt
under **Settings → Game settings → Answer controls**. Raise your physical left
hand for the left answer or your right hand for the right answer, anywhere in the
camera frame. The first detected, sufficiently visible open palm with a left/right
classification submits immediately. There is no hold duration, confirmation dwell,
or position guide. Old saved palm-hold durations are discarded during settings
migration. The mirrored preview shows landmarks and identifies each hand.

Lower or close your hand between answers. One clear frame rearms input immediately;
a continuously raised palm cannot answer several questions. Palms shown during
countdown, feedback or blocking overlays must also be lowered or closed. Two open
palms block selection until only one remains; uncertain hand identity never falls
back to screen position. Small background hands remain excluded. This cannot
identify who owns a hand; keep only the active player near the camera.

The bundled legacy MediaPipe Hands model assumes mirrored input when reporting
handedness. We feed unmirrored video with `selfieMode: false`, then swap its output
labels to recover physical left/right, as specified in the
[MediaPipe Hands documentation](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/hands.md#multi_handedness).
Inference uses the lite model, detects up to two hands to catch ambiguous input,
and runs on fresh video frames with no added wait between inference calls.

**New player** starts without a portrait or face recognition. Returning
numbered players tap their numbered card to keep their score. Photo enrollment
remains available. Face loss does not pause palm/button play. Hand inference runs
locally with the bundled MediaPipe Hands 0.4.1675469240 runtime and lite model
(Apache 2.0); video is not uploaded. Camera permission is needed only for gestures
or photo capture. `node tests/palm-control.test.cjs` checks input gating.

## Scoring

Correct answers earn 100 points, plus 25 for each preceding correct answer in the
current streak, plus a speed bonus: `round(100 × max(0, 1 − seconds / 10))`.
For example, answering in 2 seconds earns 80 speed points; 5 seconds earns 50;
10 seconds or longer earns zero. There is no answer deadline or time penalty.
Timing starts when each question appears and includes gesture detection time. Teacher
settings, the leaderboard, the hidden browser tab and the face-loss pause stop
the clock. Feedback and countdown time do not count toward the next question.
Wrong answers earn no points and reset the streak. A successful redemption earns
250 points plus the same speed bonus. A perfect main round earns another 300.
Marks remain out of eight; speed affects arcade points and leaderboard totals.
Each completed turn saves its speed bonus and per-question answer times locally,
and the result screen shows the speed points included in the total. Existing saved
scores remain unchanged.

## Podium leaderboard

The leaderboard opens after every three completed player turns by default
(configurable in Teacher → Session). There is no time-based interruption; opening
Ranks manually does not reset that count. Only players who finished a turn join
the standings. The top three have portrait heads attached to jersey characters
on second/first/third-place podium steps. When ranks change, characters move from
their previous positions, including down off the podium. Previous ranks are saved
per class; numbered players use their number as the head. Reduced-motion settings
show the final positions immediately. The full standings continue below the podium.

## Question spacing and settings

The selector balances topic use and rotates sentence constructions, with random
tie-breaking instead of a fixed topic cycle. Questions with only a name changed
share a construction ID. The same construction is kept out of the next 24 reserved
questions whenever alternatives remain; the rule uses saved class history and also
covers redemption questions. Topic coverage and exact-question non-repetition are
preserved. Near exhaustion, the spacing rule relaxes rather than recycling content.
Existing question IDs and used histories remain unchanged.

Grammar level, answer mode, calibration, sound, leaderboard
frequency and session controls live in the Teacher Console. The player screen
keeps large answers, hand tracking feedback and the instant hand-selection instruction.
**Enable camera / Stop camera** stays in the game header; enabling it requests
browser camera permission when needed.

## Prompt to build a similar app

Copy the prompt below into your coding assistant to build a similar classroom game.
Change the app name, subject, and age group to suit your classroom. This is a build
brief for a new app; it includes suggested features and implementation choices
rather than a statement that every feature is implemented in Grammar.

```text
Build a complete, working classroom learning game called “Grammar Arcade”.

Act as an experienced educational app developer and UI designer. Create a polished browser app that a teacher can use on a laptop connected to a classroom projector. Students take turns answering questions using large buttons, keyboard arrows, or camera-based gestures.

The experience should feel like a lively arcade game while keeping the learning content clear and easy to read.

PURPOSE AND AUDIENCE

Design for Malaysian lower-secondary English learners, with separate Form 1 and Form 2 question banks.

A teacher should be able to open the app, select a class, and begin within a minute. Students should be able to participate without accounts, email addresses, or typing their names.

Support approximately 30 students taking multiple turns, with scores and question history continuing across different days on the same browser.

CORE CLASSROOM FLOW

1. The teacher creates or selects a class.
2. The teacher chooses the grammar level and answer controls.
3. A student selects an existing player card or creates a new numbered player.
4. Optionally, the student captures a photo to use as their avatar.
5. A three-second countdown introduces the turn.
6. The student answers eight grammar questions.
7. If the student makes exactly one mistake across those eight questions, offer one additional redemption question. A correct redemption restores the lost mark, up to 8/8.
8. Show the student’s results and add their points to their saved total.
9. Move smoothly to the next student.
10. Show the class leaderboard after every three completed turns by default.

Keep this flow quick enough for a real classroom.

QUESTION FORMAT AND QUALITY

Each question displays:
- One short sentence containing a clearly underlined grammatical error.
- Two possible replacements, presented as large left and right answer cards.
- Exactly one unambiguously correct answer.
- A short explanation after the answer.

Example:
Sentence: “Much people came to the school fair.”
Underlined error: “Much”
Choices: “Many” and “A little”
Correct answer: “Many”
Explanation: “Use ‘many’ with plural countable nouns such as ‘people’.”

For Form 1, cover:
- Present simple
- Present continuous
- Past simple
- Past continuous
- Comparatives
- Superlatives
- A/an
- Some/any
- Much/many
- Countable plurals

For Form 2, provide a broader selection of suitable lower-secondary grammar topics.

Use familiar school, home, hobby, food, sport, and community contexts. Keep vocabulary appropriate to the selected level. Avoid ambiguous sentences and unnatural distractors.

Use a structured question format containing:
- Stable question ID
- Level
- Topic
- Construction ID
- Sentence
- Underlined error
- Two answer options
- Correct answer
- Explanation

Construction IDs should group questions that test the same sentence pattern, including variants where only a name or object changes.

Target 1,000 questions per level. Build and validate a smaller representative bank first, then expand it systematically. Do not fill the bank with superficial duplicates or claim syllabus approval without supporting references.

QUESTION SELECTION

Maintain separate, persistent used-question histories for each class and level.

- Balance topic coverage.
- Randomise which side contains the correct answer.
- Avoid repeating the same sentence construction within the next 24 reserved questions whenever alternatives exist.
- Reserve and save question IDs before displaying a turn.
- Reloading or interrupting a turn must not make its reserved questions available again.
- Include redemption questions in the used history.
- Resetting scores must preserve question history.
- When the bank is exhausted, explain that more content is needed. Do not silently recycle old questions.
- Keep IDs stable if the question bank is reordered.

ANSWER CONTROLS

Provide three modes:

A. Buttons and keyboard
- Large, clickable or tappable answer cards.
- Left and right arrow keys.
- Fully playable without camera permission.

B. Open-palm gestures
- Process camera frames locally in the browser.
- Show a mirrored preview with visible landmarks and physical left/right hand labels.
- Left hand selects the left answer; right hand selects the right answer, anywhere in frame.
- Select on the first recognised open palm, without a hold timer.
- Correct handedness labels for the model's mirror convention.
- Require a lower/closed hand before another answer, without a timed release delay.
- Block selection when two open palms are visible or hand identity is uncertain.
- Ignore hands too small to identify reliably and show useful guidance.
- Prevent a continuously raised palm from answering the next question.

C. Optional head tilt
- Calibrate the neutral head position during the countdown.
- Tilt left or right and hold to confirm.
- Include adjustable sensitivity, hold duration, recalibration, and direction inversion.
- Require a return to neutral before another answer.

Buttons must remain available when gesture tracking struggles. Camera failure must never prevent ordinary button play.

PLAYER PROFILES

Make numbered players the simplest entry method:
- “New player” creates Player 1, Player 2, and so on.
- Returning students tap their saved card.
- Keep cumulative scores across turns and days.

Offer optional photo avatars.

If implementing returning-player face matching:
- Perform recognition locally.
- Require explicit confirmation before continuing a matched player’s score.
- Ask the user to choose a saved profile when recognition is uncertain.
- Never silently merge profiles or transfer scores.
- Reject recognition when multiple faces are visible.
- Keep manual player selection available.
- Treat face matching as optional and fallible.

SCORING AND FEEDBACK

Track:
- Round marks out of eight
- Cumulative points
- Current streak
- Best streak
- Completed turns
- Successful redemptions

Use a simple, documented scoring formula with a modest streak bonus. Display marks and arcade points separately.

Provide immediate feedback with text, colour, and optional sound. Show the correct replacement and explanation after mistakes. Keep the tone encouraging.

Celebrate strong results with brief animations, stars, and confetti.

LEADERBOARD

Create an attractive podium:
- First place in the centre, second on the left, third on the right.
- Use each player’s photo or number as the character’s head.
- Animate position changes when ranks change.
- List all other players below.
- Include only players who have completed a turn.
- Define consistent tie-breaking rules.
- Respect reduced-motion preferences.

Open the leaderboard after every three completed turns, configurable by the teacher. Allow manual opening between turns. Do not interrupt an active question.

TEACHER CONSOLE

Put teacher controls in a side drawer:
- Create, select, and delete classes
- View player cards and scores
- Select grammar level before a session
- Select answer mode
- Start and stop sessions
- Set leaderboard frequency
- Explain instant palm selection and adjust tilt settings
- Recalibrate tracking
- Toggle music and sound effects
- Reset scores
- View remaining question counts and camera/model status

Confirm destructive actions. Clearly explain what each reset deletes.

VISUAL DESIGN

Combine a modern glass interface with a restrained retro arcade style:
- Deep navy background
- Translucent panels with subtle borders and highlights
- Mint, gold, coral, and lavender accents
- Pixel-style headings used sparingly
- Rounded, highly readable typography for sentences and answers
- Large answer cards and generous spacing
- Clear player identity, question progress, score, and streak indicators
- Subtle transitions and responsive button feedback

Prioritise projector readability over decoration. Keep question text large, contrast strong, and settings away from the main play area.

Support desktop, tablet, smaller screens, and fullscreen mode. Avoid clipping and horizontal scrolling.

ACCESSIBILITY

- Full keyboard access and visible focus indicators.
- Real buttons and labelled inputs.
- Feedback that does not rely on colour alone.
- Reduced-motion support.
- Sound can be disabled.
- Camera use is optional.
- Clear instructions that match the selected control mode.

TECHNICAL APPROACH AND STORAGE

Prefer a lightweight static web app using HTML, CSS, and JavaScript, with no required backend or paid services. If an existing project has a suitable framework, follow its conventions.

Separate question data, game state, storage, gesture tracking, and rendering into maintainable modules.

Persist:
- Classes
- Player profiles and optional photos
- Completed-turn scores
- Class settings
- Used-question history
- Previous leaderboard positions

Use localStorage for small records and IndexedDB if photos or model-related records need more space. Handle unavailable or full storage gracefully.

Request camera access only after an explicit user action. Stop camera tracks when the user disables the camera.

Do not save or upload live video. Keep photos and any face descriptors on the device. Explain that records belong to this browser and site address, do not sync between devices, and may be lost if browser data is cleared.

Bundle required tracking assets where practical. Provide useful loading, permission-denied, unsupported-browser, and model-failure states. Document HTTPS requirements for deployed camera access.

DELIVERY AND VERIFICATION

Build the actual app, not just a visual mockup. All visible controls must work.

Implement in stages:
1. Complete button-based classroom gameplay and persistence.
2. Add polished results, leaderboard, and teacher settings.
3. Add palm control and optional head tilt.
4. Add optional photo recognition.
5. Expand and validate the question banks.

Verify:
- Eight-question turns and the exact redemption rule
- Score persistence after reload
- Isolation between classes and levels
- Stable question IDs and non-repetition
- Exhausted-bank behaviour
- Prevention of duplicate gesture submissions
- Camera-denied fallback
- Safe handling of uncertain player matches
- Keyboard operation and responsive layouts

Provide the complete source, a README with local-run and static-hosting instructions, and a concise account of what works and any remaining limitations.

Make reasonable implementation decisions and proceed. Ask only when an essential requirement cannot be inferred. Do not present simulated tracking or unfinished features as working functionality.
```
