# TriTowers ordered input and presentation — 2026-10-17

Owner-approved correction of `ee9a5609aab1df013c083022684ae17b945f0ace`.
Checkpoint: `tri-towers-input-polish-2026-10-17`.
Jeremy's production smoke, including physical iPhone input/audio and rotation,
remains acceptance. Automated results below do not establish that acceptance.

## Shared presentation

- The missing title had an outer opacity fade ending at 550 ms, hiding the
  existing RoundIntroArtwork for most of the authoritative 2.5-second intro.
  Removed that fade. The compact, upper title stays visible through the deal,
  fading only in its final 200 ms. Multiplayer retains viewer turn wording;
  Arcade has no turn wording. Bell admission/recovery guards are unchanged.
- Original synthesized fanfare expands to 1.7 seconds: rising brass/low horn
  layers, a fuller final major chord, high chime and low timpani-like accents.
  No reference transcription or melody-match claim. Existing shared audio
  manager owns mute, cancellation and once-only live admission.
- All-clear result timeline: shield/swords and fanfare 0–1.7 s; score count-up,
  count audio and timer drain 1.8–4.0 s; pill returns home by 4.3 s. The existing
  five-second authoritative hold remains. Other results retain their 1.2–4.0 s
  count window. Remaining cards and persistent tower awards stay visible.
- Confirmed exposed-card removals travel from cached actual source bounds to
  actual upcard bounds over 120 ms. The original card is already removed by
  the confirmed snapshot; only the matching destination face is suppressed
  during flight. New confirmations replace old flights safely. Input never
  waits for motion/audio. Reduced motion, recovery and resize cancel flights;
  resize also refreshes source geometry. No hidden face is synthesized.

## Input authority and recovery

`src/lib/triTowers/intentBuffer.ts` and `src/hooks/useTriIntentBuffer.ts` serve
both v3 adapters. This is an intent buffer, not a client gameplay reducer.
PostgreSQL remains the single versioned rules/scoring/dealing/timing authority.
Legacy v1/v2 action paths and frozen rules are retained.

One request may be in flight with up to three further exposed-card intentions.
Dashed pending feedback is distinct from confirmed removal. Each intention
retains its card identity, index, round/actor scope and expected predecessor
upcard. Expected upcard changes preserve dependencies. Only after confirmation
does the next intention receive the latest confirmed revision and immutable
request ID. The server validates every action in order. Unexpected state,
rejection, phase changes or interruption cancel dependents with visible feedback;
overflow and duplicate taps are reported. No retargeting or silent reordering.

Introduction input is unavailable. Ready accepts an immediate player action but
never buffers another action behind it. Stock draws and other actions are queue
barriers because their resulting faces are unknown until authorized.

Before dispatch, the immutable command is retained in sessionStorage. Storage
failure prevents dispatch with an explanation. Unsent intentions do not persist.
Lost/malformed/server-failure responses mark the sent outcome uncertain. Fresh
input remains blocked until the same request is resolved by receipt-aware retry.
An authentication failure during recovery does not prove non-application.
Focus/network/visibility recovery or Resolve play retries the same request;
the existing server receipt and stale-revision protections determine the result.
Refresh/remount restores the unresolved command. No extra Ready/playing time,
bell, celebration or completion animation is granted/replayed by recovery.
Multiplayer observers and Arcade recovery consume confirmed snapshots only.

Moving all gameplay locally and submitting once at round end was not adopted:
it would weaken continuous recovery, deadline enforcement, concurrency and
verified-score integrity, and would require a different authority design.

## Arcade transport shortcut and deployed proof

Before: fresh JWT getUser validation, unused profile username lookup,
arcade_load, then arcade_tri_step. After: getUser then arcade_tri_step for
well-formed v3-hinted TriTowers state/action requests. The hint grants no access.
Malformed, legacy-presentation and other-game requests retain the existing path.
Start/admission behavior is unchanged. The removed profile lookup supplied only
a display name; its errors were not an access gate. The retained RPC checks
active-account access, owner, actual game, frozen version, revision/round,
deadlines and idempotent receipts under the existing lock. Stale/error mapping
is preserved; uncertain transport/server failures remain recoverable.

Read-only deployed inspection established these function hashes:

- arcade_allowed: `13dfa2faecc106360ca1270d0ca5cb96`
- arcade_load: `f06be670696b821e9e2e1dcbd88345f7`
- arcade_tri_step: `a9be3ead3be16416c5afd07318c24fcd`

Inspected existing receipt primary key `(user_id, request_id)`, run primary key,
and active-game uniqueness. `dev/arcade/tri-shortcut.proof.sql` passed against
the deployed database inside ROLLBACK: inactive access, foreign ownership, wrong
game, introduction denial, hidden removal without starting Ready's playing clock,
valid first draw preserving the full 120 seconds, private-card redaction,
duplicate/conflicting receipts, stale revision, deadline precedence and recovery
of an already-applied request after timeout. An initial proof variable ambiguity
was corrected before the passing rollback run. No migration, historical mutation
or financial behavior change occurred.

## Measured latency and limits

Historical database execution aggregates found Arcade step mean 7.314 ms / max
34.957 ms over 1,788 calls; multiplayer's older direct action mean 16.212 ms / max
40.974 ms over 145 calls. These are not end-to-end timings or current multiplayer
wrapper measurements and do not establish a 500 ms root cause.

Comparable local browser fixture uses real HTTP, actual Arcade service routing,
shared current React rendering, and a controlled 40 ms delay per remote hop.
The baseline selects the former routing; it is not the old production binary.
Five sequential removals per condition, same browser and board:

| Mode / path | Response ms (five samples) | Click-to-paint opportunity ms (five samples) | Median paint ms |
| --- | --- | --- | --- |
| Arcade baseline | 205.8, 208.7, 203.9, 184.6, 192.4 | 220.9, 221.6, 218.6, 219.2, 226.6 | 220.9 |
| Arcade shortcut | 98.7, 105.6, 106.9, 89.1, 103.8 | 129.8, 135.9, 137.7, 123.7, 133.8 | 133.8 |
| Multiplayer baseline | 47.4, 45.4, 57.6, 44.9, 54.5 | 80.9, 78.6, 90.5, 78.2, 86.8 | 80.9 |
| Multiplayer buffer | 46.6, 46.0, 46.7, 50.2, 46.1 | 70.2, 76.8, 78.6, 82.1, 78.5 | 78.5 |

This supports the bounded Arcade round-trip reduction. Multiplayer's single
request path is essentially unchanged; the buffer retains rapid dependent taps.
Immediate pressed/pending feedback precedes authoritative completion. No claim
is made that physical iPhone touch latency or the reported 500 ms is eliminated.
Reproduce with `node dev/tri-towers/input-server.mjs`, then
`/dev/tri-towers/input-motion.html` with `baseline=1` and/or `mode=multiplayer`.
The fixture has synthetic acceptance, no production data and no scoring authority.

Opt in using `?triTiming=1` on the production page before entering the game.
This persists for the tab. Rules → Download timing report exports a bounded
local-memory trace; `?triTiming=0` disables it. No database telemetry writes or
permanent gameplay badges. Samples cover pointer event age, click handler,
queue wait/dispatch, session acquisition, HTTP headers/parsed response,
server auth/RPC/total timings in Arcade, confirmed snapshot, React commit and
two-frame paint opportunity. The browser timestamp is not physical touch onset;
paint opportunity is not proof of physical screen presentation. iPhone network,
OS event delivery and display latency still require Jeremy's device smoke.

## Validation and owner smoke

- Full `npm run build`: 2,341 application tests, 241 harness tests, TypeScript
  and production bundle passed before the final bounded recovery refinements.
- Final focused suite: 117 tests in 19 files, covering queue dependencies,
  Ready/intro/stock barriers, rejection, uncertain outcomes, immutable recovery,
  transport retry/authentication, shortcut authorization/error routing, visible
  title, 120 ms flight, newer-flight safety and synchronized audio/timeline.
- Final installed TypeScript check and production bundle passed. The repository
  default `bunx tsgo --noEmit` was unavailable (registry 404); used the installed
  `npm run typecheck` compiler without adding dependencies.
- Browser title visible at 1 s into introduction at portrait 390×844 and
  landscape 844×390. Multiplayer includes turn wording; Arcade excludes it.
  Browser latency comparisons above cover both modes.
- Deployed rollback proof passed as described above. Financial/settlement SQL,
  scoring, qualification, round counts, randomness, v2/v3 leaderboard/PB
  compatibility and frozen result versions are unchanged.

Jeremy: check first/next/bonus title and bell; rapid legal dependent taps and
rejected intentions; draw barriers and Ready's first valid action; confirmed
card flight and physical rotation; fuller fanfare distinct from count audio;
muting/reduced motion; background/offline/refresh with a pending action and no
replay; compare optional timing reports in both modes. Confirm remaining cards,
tower badges, final score/timer synchronization and normal progression.
