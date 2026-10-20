# Grammar Tilt

Live app: https://hedarchion.github.io/tiltgrammarform2/

A static classroom game with 1,000 questions across 20 grammar topics, eight
questions per turn and a redemption question after exactly one error. Thirty
students can play three turns each: 720 main questions plus up to 90 redemptions.

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

## Face-first classroom flow

1. Create or select a class and start the game. No names or separate enrollment.
2. Enable the camera with just one player in frame. Recognition uses several
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
`styles.css`, `glass.css`, `glass.js`, `vendor/face-api.min.js` and all tiny detector,
68-point landmark and recognition model files under `models/`. `vendor/hands/`
is unused. Published camera access requires HTTPS; localhost supports development.

There is no backend or account. Class names, portraits, face descriptors, settings,
scores and used-question IDs remain in browser localStorage. Only confirmed player
registration or selection updates a profile. Video is never saved or uploaded.
Publishing the source does not publish browser records. The site address and browser
profile must remain the same to resume: devices do not sync, a deployed site does
not inherit localhost records, and clearing site data deletes these records. Private
browsing may remove records when closed. Google Fonts requests only load typefaces.

Local server: `python3 -m http.server 8766`.

Checks:

- `node tests/tilt.test.cjs`
- `node tests/player-flow.test.cjs`
- `node tests/question-bank.test.cjs`
