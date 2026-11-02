# V2 selected sound integration — November 1, 2026

Jeremy provisionally selected Take A in all nine categories, then explicitly
authorized gameplay integration and production publication (option 1). Listening
acceptance remains pending. The earlier studio-only restriction is superseded
for these nine selections. The standalone studio remains development-only.

Release work is isolated on `codex/sound-effects-pass2-release`, based on
`b618e69b5` (published Pass 1). Studio assets/audit were imported from `da8f6b8d3`
without replacing current release documentation or touching either original
worktree. The original studio remains on port 4318; release qualification uses
4328, also available on the local Wi-Fi address shown by Vite.

## Ownership and admission

| Sound | Authoritative fact and presentation boundary | Attribution / suppression |
|---|---|---|
| SCC No Qualify | Completed server result `isQualified=false`; existing result queue must receive its landed receipt. Local player also waits for the admitted No Qualify rollover. | Seated UUID, never name; local and observer result presentations use the restrained cue. Replaces score-post. |
| SCC Midnight | Completed qualified result with cargo sum 12. Landed result plus existing Midnight visual admission. | Any visible actor; replaces routine posting. Does not imply game victory. |
| Horses Five Ones | Five actual values of 1 in the admitted roll renderer, at its existing landing frame. | Any visible actor; replaces dice impact. Wild-assisted five of another value does not qualify. Completion may subsequently post a score normally. |
| Dice score posting | Horses/SCC completed result landing; Yahtzee accepted score ACK or admitted committed score narration; Quintzee newly filled category in an accepted revision; Farkle admitted `banked` overlay receipt. | Includes zero scores. Exactly one short sound per receipt, including ACK/realtime duplication. No new count-up. Special SCC/Yahtzee results replace ordinary posting. |
| Yahtzee / Quintzee | Yahtzee committed 50, or accepted five-alike scoring action with the already-qualified Yahtzee box (legal repeat bonus). Quintzee newly filled `yahtzee=50` category only. | Same cue for visible local/opponent scoring. Quintzee has no repeat bonus or joker; its existing numeric/banner presentation remains. |
| My Leg | Existing live individual leg-award admission from UUID player-row delta; exact dealer/hand/player/count key. Native `flyToTarget` animation start. | Award recipient equals the seated local player UUID. Terminal award is silent in this family. |
| Opponent Leg | Same authoritative award and native animation boundary. | Different UUID, including observers with no local seat; quieter separate file. |
| Sweep the Legs | Immutable terminal descriptor with authoritative legs; native start of the canonical sweep overlay. Normal wins and eligible instant 357 use their existing owners. | One signature cue for all viewers. Suppresses final-leg audio and reserves the whole terminal generation against Winner A, not just the 1.6-second sample. Instant 357 with no opening legs retains existing final Winner A behavior. |
| Chucky | Existing Holm Chucky hand-wide manifest reconciliation, only when all cards are owned and at least one intent is newly accepted. | Once at pre-flight dispatch for the whole Chucky wave, never per card; 30-second audio-only cooldown. Existing solo/deal-settled gates and card timings are unchanged. |

No new victory is derived from a leg count. The existing session-configured
`legsToWin` and immutable descriptor remain authoritative. Two-, three- and
five-leg configurations follow the same sound selection. No rule, RPC, timer,
settlement, chip movement, transport destination or terminal progression changes.
Cribbage retains Pass 1's peg and discrete scoring-highlight sounds.

## Playback and recovery

The original AudioManager, Sounds preference, native context lifecycle and PCM
cache remain the only playback owners. Nine exact WAV imports extend its approved
catalog. Baked audition levels are unchanged: routine post -30 dBFS, opponent leg
-29, no-qualify -28, personal leg/Chucky -24, Midnight -22, Five Ones/Yahtzee -21,
Sweep -19. Durations and SHA-256 values remain in the studio catalog/selection.

`useLiveSoundEvent` consumes initial state silently, waits for an existing visual
receipt, and retires pending audio plus the first recovery snapshot after hidden
or offline interruption. This is deliberately conservative: a first post-recovery
event can be silent. Invisible, muted, unavailable and duplicate cues are consumed
without replay. Quintzee seeds its existing score baseline on scope replacement,
pause, replay and recovery. Yahtzee local ACK and remote narration share one key;
late ACKs from a replaced round cannot sound.

Sweep priority 110 dominates winner 100, special dice 85, personal/opponent leg
75/70, No Qualify 65, Chucky 60 and score-post 55. Existing transport sounds retain
their lower priorities. Chucky cooldown is enforced by the shared audio manager;
it changes no gameplay timing. Unselected alternatives are excluded from the
production bundle. All V2 files are project-original procedural synthesis with
retained recipes/provenance; no external recording or character actor imitation.

The existing leg presentation still lacks a separate durable award UUID, and
Chucky lacks a persisted pre-deal audio event. This integration uses their existing
scoped live presentation receipts. It does not fabricate gameplay events or
replay compressed historical awards. The original deployed-rule audit and known
identity boundaries are preserved in `SOUND_STUDIO_V2.md`.

## Qualification and acceptance

TypeScript, 3,569 source tests in 491 files, 241 harness tests, and production build
passed. Final focused changes passed 97 tests. Twenty native desktop/iPhone-sized
browser checks passed with zero page errors, covering all nine exact durations,
real leg/sweep starts, actual five-ones landing, Chucky cooldown, mute/hidden
consumption, refresh silence and a single Quintzee cue. The release checkpoint
is release-sound-effects-v2-20261101; its -verified annotated tag records the exact
published SHA and deployment evidence. Evidence lives in ignored
`qualification.local/`; repeatable native fixtures are `runtime.html` and
`verify-runtime.mjs` in `dev/sound-studio-v2/`.

Production smoke: listen on desktop and physical iPhone; check each of the nine
events, two clients plus observer attribution, session targets 2/3/5, normal and
instant sweep with/without opening legs, rapid Chucky deals, mute, tab changes,
background/lock, reconnect and refresh. Confirm visual/financial progression is
unchanged. Browser emulation does not establish acoustic quality or iOS audio
session behavior. Owner gameplay and physical-device smoke are pending.
