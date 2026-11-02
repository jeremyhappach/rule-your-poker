# Sound Pass 2 — authoritative approval and implementation audit

2026-11-02. This audit supersedes the proposal statuses in
`SOUND_PASS2_COVERAGE.md`. All sound decisions are resolved. The owner's conditional
production GO covers publication after validation and clean main reconciliation.

## Approval evidence

Explicit user messages in “Add gameplay sound effects”
(`01a19990-88c0-77c3-bc61-83bb68115612`) approve seven recordings and subsequently
the Cribbage scoring highlight. The same instruction says **do not automatically
integrate unselected effects**. No chip selection appears there.

“Build Sound Studio V2 candidates”
(`01a199bd-4e05-7c60-a78f-e1e4633e7867`) approves the first option in each of the
original nine categories, followed by explicit integration and production
authorization. That predates the additional 24 candidates and does not approve them.

“Sound Effect Ideas” (`6ae7d145-b7a0-83ea-ba3c-2435477dd957`) and the current
request approve Yahtzee Cup C, request a revised Quintzee B, and permit suitable
reuse of already approved sounds for Box Drop and Words.

Jeremy then confirmed “I have made my selections.” The review page's saved DOM
record showed all seven: Quintzee B2, Cup C reuse, countdown B, Farkle A, Upper
Bonus B, All Filled B and Single Chip. These exact choices are now recorded in
`dev/sound-studio-v2/pass2-approved-selection.json`; none was chosen on his behalf.
The nine prior selections in `owner-selection.json` retain their original hashes.

**Count: 24 distinct approved sounds** = 8 Pass 1 + 9 V2 + Cup C + 6 final additions.
Additional reuse mappings do not inflate the sound count. Existing Run21 and other
baseline procedural effects are preserved, not counted as newly approved selections.

## Event → asset → approval → implementation

| Event | Asset / cue | Approval state | Implementation state |
|---|---|---|---|
| Visible card deal/play transport | Paper Slide B / deal-paper.wav | Approved | Integrated; canonical transport; preserved |
| HOLM visible fold | Same Paper Slide B | Approved reuse authorized | Added locally at fold commit; this path bypasses transport |
| Visible resolved card flip, including HOLM community | Soft Card Clip / flip-soft.wav | Approved | Integrated; native transition admission; preserved |
| Multiple physical dice land | Dice Landing A / dice-land.wav | Approved | Integrated; actual animated dice count |
| One physical die lands | Dice Landing B / dice-land-soft.wav | Approved | Integrated; held dice excluded |
| Cribbage peg move | Wooden Peg A / peg-wood.wav | Approved | Integrated |
| Cribbage scoring highlight | Existing quiet mallet dyad | Approved | Integrated; preserved |
| HOLM cracked | Recorded Glass / holm-glass-recorded.wav | Approved | Integrated; preserved |
| Settled winner | Winner A / winner-a.wav | Approved | Integrated; existing outcome ownership |
| SCC no qualifier | no-qualify-a.wav | Approved | Integrated; original V2 A |
| SCC Midnight | midnight-a.wav | Approved | Integrated; qualified 6/5/4 + cargo 12 |
| Horses actual Five Ones | five-ones-a.wav | Approved | Integrated; existing landing replacement preserved |
| Routine score post | score-post-a.wav | Approved | Integrated; score presentation owner |
| Yahtzee / qualifying Quintzee achievement | yahtzee-a.wav | Approved | Integrated; existing authority |
| Own leg | my-leg-a.wav | Approved | Integrated; UUID award receipt |
| Opponent leg | opponent-leg-a.wav | Approved | Integrated; UUID award receipt |
| Sweep | sweep-a.wav | Approved | Integrated; terminal precedence |
| Chucky wins | chucky-a.wav | Approved | Integrated; cooldown preserved |
| Yahtzee physical roll | Exact cup-roll-c.wav | Approved | First motion → landing, A/B follows |
| Horses / SCC physical roll | Same Cup C | Approved | Same physical roll owner and held-die landing rules |
| Quintzee electronic roll | quintzee-roll-b2.wav | Approved | Actual rumble start/stop; held tiles silent; no landing |
| 357 3–2–1 Drop | drop-countdown-b.wav | Approved | Exact tone slices at visible 3/2/1; DROP silent |
| Run21 Pass | Existing approved pass/flip mapping | Approved baseline | Preserved, including fresh Async event adapter |
| Run21 exact 21 / bust | Existing feedback cues | Approved baseline | Preserved; optional replacements not selected or needed |
| Farkle bust | farkle-bust-a.wav | Approved | At admitted blocking overlay after dice settle |
| Quintzee Upper Bonus +35 | upper-bonus-b.wav | Approved | Fresh authoritative award at its banner |
| Quintzee All Filled +35 | all-filled-b.wav | Approved | Fresh positive clear award; after any Upper Bonus banner |
| Taxes, reantes, chip transfers | chip-single.wav | Approved | Native chip flight start; one identity per ledger presentation batch |
| Box Drop ordinary visible placement | Exact Wooden Peg A | Approved reuse authorized | Added locally at accepted box DOM commit |
| Words successful local tile placement (live + Async) | Exact Wooden Peg A | Approved reuse authorized | Added locally after staged tile commits |
| Hold toggles, rejected target/placement, drag, restored draft, history | None | Intentionally silent | No new audio |
| Muted, hidden, disconnected, replay, Session Ended restoration | None | Intentionally silent | Existing manager/visibility ownership preserved |

## Failure boundaries and preserve list

Yahtzee/Horses/SCC's production roll renderer is `DiceRollAnimation`, mounted by
`DiceTableLayout`; it supplies game type + cache identity + roll key. The roll
starts on its first RAF, stops synchronously before its landing commit, and
cancels on replacement, unmount, offline, mute, or page interruption. A new
optional manager cancellation callback exposes its existing graph stop; it creates
no second context or preference owner. No queued unlock replay is introduced.

Quintzee B2 follows the existing rumble identity and duration. A populated new
round does not re-admit an old roll. The four-second recordings cover the existing
900ms physical roll and all configured Quintzee durations (300–2500ms); the owner
cancels them at the actual motion end. No gameplay timer changes or added landing.
Fresh authoritative upper/clear awards own bonus audio; stale/recovered results
are silent. If both awards occur together, their visible presentations sequence
the cues instead of stacking them with routine score posting.

357 arms at the existing locked lead-in and observes the real 3/2/1 frames.
Hidden/offline/interrupted windows and mid-count mounts cannot replay missed beats.
The exact B recording is sliced at its approved onsets; DROP remains silent.
Farkle follows the existing admitted bust overlay after the dice presentation.
Chip audio observes native flight start with a shared presentation batch identity;
the low-priority cue cannot duplicate per player or compete with stronger outcomes.
No amount, endpoint, ledger dispatch or settlement behavior changes.

Box Drop's placed boxes currently appear atomically; only the next conveyor box
has an arrival animation. A sound on the place button or on that conveyor animation
would be wrong. Ordinary/partial accepted placements now use the existing box's
visible scale node and scope/revision identity. Order completion/overload chimes
remain unchanged. Recovery epoch, historical replay and hidden tabs stay silent.

Words stages legal local tiles before Submit Word. The click follows that actual
local visual placement; it does not announce word validity. Invalid targets,
dragging, rack selection, undo and restore have no placement event. A later
dictionary rejection emits no additional click. All three placement paths
(board, automatic next square, chosen blank) share the same presentation edge.
No server score or action authority changes.

HOLM's own hand dims and opponent backs retire directly at a fold; its dormant
fold animation is excluded by the same `showCardBacks` condition. Therefore the
generic transport cue did not cover folds. `useHolmFoldAudio` observes the visible
commit of a newly folded, already-mounted UUID in the exact hand. Initial history,
new participants, repeats, hidden tabs and interrupted hands stay silent. No
animation or gameplay state was added. Community and Chucky flip refs were already
connected and remain unchanged.

Preserved: all original recording bytes; all nine V2 hashes; global Sounds setting;
AudioManager/mobile session ownership; round/dealer/roll identities; landing A/B;
existing fresh Async sequencing, hidden/history suppression and baseline Run21
sounds; rules, RPCs, chips, wallets, ledgers, settlement, eligibility and lifecycle.

## Final owner decisions

The isolated review is `http://localhost:4318/review.html`, also available on the
same Wi-Fi at `http://192.168.1.242:4318/review.html`.

1. `#quintzee`: **B2 approved**; keeps 264Hz and harmonic mix, changes 44 → 34 pulses/sec,
   narrows the envelope and lowers the gaps. Stop follows the real rumble, no landing.
2. `#cup`: **Cup C reuse approved** for Horses and SCC.
3. `#drop-countdown`: **B approved**.
4. `#farkle-bust`: **A approved**.
5. `#upper-bonus`: **B approved**.
6. `#all-filled`: **B approved**.
7. `#chips`: **Single Chip approved**.

No sound approvals remain. Box Drop and Words reuse the approved Wooden Peg A.
Run21 retains its existing approved pass/21/bust mappings. No mandatory gap remains.

## Validation

Passed: final application typecheck, 3,606 application tests across 496 files,
241 harness tests across 12 files, and production Vite bundle (`npm run build`).
The focused sound/placement/Cribbage rerun also passed all 81 tests. Studio
typecheck and build passed. All 51 prior audition hashes remain exact; the shipped
Cup C copy matches its approved SHA-256. B2 has its own immutable manifest hash.

An initial full test run passed all assertions but caught one unhandled
Undici WebSocket/Event-realm exception. The named Cribbage test passed in the
focused rerun, and the complete build/validation rerun passed without that error.
No unrelated runtime or test-harness changes were made.

The actual local review UI completed B2 with a clean stop/no landing, Cup C with
Landing A, and Cup C with four held dice/Landing B. No saved selection was made
on the owner's behalf. Financial/liveness/authority regression suites ran as part
of the application tests; no rules, RPCs, migrations, wallet/ledger or settlement
code changed and no database writes were performed. This is presentation-only
regression evidence, not a new production financial proof.

The preceding validation covers the initial 18-sound audit commit. The final
selected integration adds focused roll/cancellation, countdown, bonus, Farkle and
chip-animation checks. All selected production WAVs match their audition hashes.
Final release validation and publication are recorded in CURRENT_RELEASE.md and
the `release-sound-pass2-final-20261102` / matching `-verified` checkpoint tags.
All **24 distinct approved sounds are integrated**. Physical iPhone/Android
listening and Jeremy's production smoke remain acceptance steps; neither is
inferred from automated checks. No database or historical-session writes occurred.
