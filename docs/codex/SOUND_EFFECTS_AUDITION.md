# Sound effects — Phase 1 audition, November 1, 2026

Status: isolated local audition, awaiting Jeremy's sound selection. No push,
production publication, database migration, game integration or rollout approval.
Branch `codex/sound-effects-lab`, based on `origin/main` at `dbc57dbe8`.
Worktree: `C:/Users/jerem/.codex/worktrees/sound-effects-lab/rule-your-poker`.
The supplied initiative explicitly authorized discovery, sourcing, prototype and
initial commit; it explicitly withheld production deployment and broad integration.

## Existing ownership and coordination

The original working folder is a dirty Six-Card Golf worktree. None of those
changes were copied, edited, staged or reset. Current main includes the separate
audio-controls and engine-recovery releases. Read `AUDIO_ENGINE_RECOVERY.md` and
the `Improve gameplay audio controls` chat; sent that chat a coordination notice
at Jeremy's explicit request. The latest recovery changes are already in this
base; its files remain byte-identical. Physical phone acceptance is still open.

| Owner / existing behavior | Evidence and implications |
|---|---|
| Application audio graph | `src/lib/audio/audioManager.ts`: one current native context, trusted-gesture priming, preference subscription, request deadlines, cancellable timelines, sessionStorage + in-memory receipts keyed by user and event. `request` cancellation removes pending work only; `follow` cancellation retires the live timeline after the React rehearsal microtask. New cancellable/rolling cues should use `follow`. |
| Sounds and speaker | `platformAudio.ts` reads/writes the existing `profiles.play_sounds`; `VisualPreferences.tsx` and `GameplaySoundButton.tsx` share the same manager. Unknown preference is silent. Save applies locally before network I/O and restores on failure. Do not create a second production preference. |
| Recovery / platform behavior | `playbackSession.ts` and the manager retain the current recovery architecture: retire contexts on mute, background, interruption and final gameplay exit; fresh gesture/unmute resumes a fresh device; receipts survive. Do not revive retired sequences. |
| Approved card pair | `cardActionCues.ts`: Run21/TriTowers play (150 ms) and pass/draw (130 ms), with admission in `useRun21PlacementAudio` / `useTriCardAudio`. These have already been owner-auditioned. They are comparison references, not replacement targets. |
| Canonical card flight | `CardTransportRuntime.tsx` requests the existing 98 ms swoosh at actual admitted flight start, only when `intent.soundUserId` exists. Current supplying adapters are Battle31 and Golf. Canasta and TriTowers also have their own presentation hooks using the shared cue. Thus not every canonical deal currently makes sound. Avoid double scheduling a shared flight and adapter cue. |
| Scores and fanfares | `usePresentedScoreAudio` follows the visible timeline using `scoreCountCue` at a bounded 20 Hz; Run21, TriTowers, Take 2, Trip Flip and Quintzee reuse this. `celebrationCue.ts` is the existing approved three-second brass fanfare, with seekable envelopes. Royal Flash has its dedicated score cue. Preserve these unchanged. |
| Mega Card Golf | `megaCardGolf/audio.ts` owns cup (390 ms), hole (650 ms), tee (720 ms), final (4200 ms). `MegaArcade` admits only a fresh presentation cue with an event id through the injected shared manager. All four are available as unchanged references. |
| Other existing effects | 11 Up group ding; Take 2 all-clear; Trip Flip clear/special; Boxdrop score; Race Poker audio; Run21 bell/failure; Battle31 knock; waiting-table doorbell/knock; Gin scratch. Their existing amplitudes differ and there is no shared perceptual normalization pass. |
| Separate background music | `useBackgroundMusic.ts` uses an HTMLAudioElement and independent music toggle/volume. It references five `/music/bluegrass-*.mp3` URLs; the tracked public asset inventory contains no matching music files. Leave this separate music path untouched. It is not a new gameplay-effect owner. |

## Gaps and minimal future correction

The existing manager already provides lifecycle, mute and dedupe; do not replace
it. It has no catalog-wide priority, category cooldown, voice budget, sample cache,
normalization metadata or shared final mix bus. `play()` has no event receipt and
must not become the API for recovered gameplay results. A sessionStorage receipt
alone is not an async/history admission policy, especially across devices or new
sessions: callers must first establish a newly admitted live presentation.

The dev-only registry and conductor demonstrate priorities (routine 10, signature
50, victory 100), category cooldown and one voice, with no delayed queue. Production
integration should add a bounded policy layer to the existing manager, reuse its
tracked graph and cancellation, and explicitly decide how existing score/fanfare
cues participate. Do not quietly put a competing manager alongside existing cues.
The local audition's bounded cold-device grace applies only to deliberate Listen
clicks. It must not be copied to live card/peg/landing admission.

## Proposed palette and real event mapping

Every row is playable in the lab. `dev/sound-lab/catalog.json` is the complete
per-file catalog with actual duration, peak/RMS, provenance and SHA-256 hashes.
All proposed amplitudes are intentionally tiered; these are not LUFS measurements.

| Event | Preferred audition / alternatives | Proposed duration, peak | Integration boundary and identity |
|---|---|---|---|
| Deal | Felt slide A / Paper slide B; compare approved brush | 190 / 180 ms, -30 dBFS | Canonical admitted flight start; `handContextId + intent.id`, group closely spaced flight starts. Do not replace the approved Run21/TriTowers action pair. |
| Flip / reveal | Soft flip A / Crisp flip B | 140 / 130 ms, -28 dBFS | Face-admitted visible flip midpoint; exact round/card/reveal generation. Snapshot arrival is not the trigger. |
| Chip | Single chip clack | 148 ms, -26 dBFS | `ChipTransportRuntime` live landing, keyed by immutable transfer batch/intent; one clack per grouped flight, not per numerical balance update. |
| Pot | Pot gathering | 227 ms, -23 dBFS | Same canonical financial presentation, after its reveal prerequisite. Never add audio to legacy game-owned pot animators. |
| Dice roll / landing | Dice in cup; landing A / softer B | 1200 ms / 380 / 340 ms; -27 / -23 / -25 dBFS | Yahtzee/Horses/SCC rolling + immutable turn/roll key; Quintzee admitted rumble revision. Held dice excluded. A cancellable rattle ends at visual completion and landing fires once. These are candidate clip lengths, not new gameplay timers. |
| Cribbage peg | Wooden peg A / deeper B | 120 / 150 ms, -26 dBFS | `CribbagePegBoard` visible peg landing, with dealer game, hand, authoritative action, player UUID and score-event key. The recording is a wood impact proxy; authenticity requires listening. |
| Cribbage hand score | Existing shared count-up; mellow alternative | timeline-driven; alternate 1300 ms, -29 dBFS | `CribbageCountingPhase` deterministic combo/target beats and animated score changes. Use persisted hand/target/beat identity; skip pre-applied resume beats. Never play one fixed clip across a variable score sequence. |
| HOLM cracked | Designed glass / recorded glass | 780 / 800 ms, -14 / -16 dBFS | `ChoppedAnimation` first visible crack/text frame; Chucky reveal must already be admitted. Current caller at `MobileGameTable.tsx:8804` detects loss through username-containing result text and a local string ref. That is unsuitable as a new audio identity. Resolve structured result + player UUID + round identity before wiring this sound. |
| 357 leg | Three mallet levels | 720 ms each, -21 dBFS | `LegEarnedAnimation` admitted `presentationCycleId`, with authoritative leg count selecting pitch. Its generation/cancellation guard is reusable; a raw `show` rerender or alias is not an identity. Winning leg still respects award → sweep → pot ordering. |
| Game victory | Winner A warm mallets / B jazz resolve / C silver sparkle | 1250 / 1400 / 1200 ms; -17 / -17 / -19 dBFS | Shared live winner presentation admission after the game's existing reveal/settlement ordering. Immutable result key. Variation selected once from event identity and held, not randomized each render. |
| Major match victory | Full resolution | 2100 ms, -15 dBFS | Only shared final match result admission; definition of “major” requires Jeremy's choice. Do not add to every hand or ordinary Arcade round. |

Higher-value later possibilities: reuse the existing Mega hole mallet family for
small achievements; a single restrained skunk/perfect-game distinction; a quiet
newly-admitted draw confirmation where transport is otherwise silent. Do not add
button clicks, countdown ticks, opponent-turn loops or notification sounds merely
to fill every action. No additional sounds were integrated for these ideas.

## Audition and licensing

Open [local Sound Lab](http://localhost:4317), or
[phone on the same Wi-Fi](http://192.168.1.242:4317) while the local server runs.
Startup and fallback sample access are in `dev/sound-lab/README.md`. The lab
reuses the actual manager/speaker with an explicitly local preference adapter;
it does not connect to Supabase or alter account Sounds. No new public route or
production asset import is added. Original WAVs can also be opened directly.

Kenney Casino Audio and Impact Sounds are CC0; their original license files are
retained. Recorded glass is Joseph Sardin's CC0 Glass Burst, which the source
describes as slightly saturated, so it remains an alternative. Designed glass,
chimes and stings are reproducible original procedural synthesis. No new tool or
dependency was installed. See `dev/sound-lab/licenses/SOURCES.md` for primary
source links, permitted use, processing and provenance. The 21 output WAVs total
909,440 bytes and load once before audition; runtime playback uses memory.

## Evidence and limits

Application TypeScript (`bun run typecheck`) and isolated lab TypeScript pass;
preferred `tsgo` is absent, so the existing compiler was used without installing
anything. All 80 focused audio/recovery/speaker/TriTowers/Mega/score tests pass.
Both the standalone lab and normal production builds pass; the production output
contains none of the lab audio assets. `dev/sound-lab/verify.mjs` exercises actual Edge
Web Audio source scheduling for all 21 candidates and nine unchanged generators,
active mute/fresh unmute without backlog, cancellation, exact duplicate/reload
receipt suppression, priority over 12 competing requests, pagehide cancellation
of dice + pending landing, and four viewport widths. No external/API/database
requests or browser errors were observed. Evidence and screenshots are under
`qualification.local/sound-lab`; desktop and phone-width layouts were inspected.

This proves the local audition path, not human listening quality, real game
synchronization, installed iOS/Android PWA behavior, cross-device async receipt
handling or extended-session fatigue. Those remain explicit release gates.
Financial state, rules, timers, recovery owners, settlement and terminal flows
are untouched; database mutation/proofs are neither necessary nor performed here.

Next checkpoint: Jeremy auditions the samples and chooses the palette. Then
propose a bounded routine-events integration using the existing owner, including
priority participation and exact live-event admission for every affected caller.
HOLM's structured identity and the meaning of major victory are decisions to
resolve before their signature/celebration phases. Production remains withheld.
