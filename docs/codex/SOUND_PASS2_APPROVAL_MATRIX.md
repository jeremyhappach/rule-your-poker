# Sound Pass 2 — authoritative approval and implementation audit

2026-11-02. This audit supersedes the proposal statuses in
`SOUND_PASS2_COVERAGE.md`. No production push is authorized while the owner's
conditional approval gates remain unresolved.

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
reuse of already approved sounds for Box Drop and Words. Reusing Cup C in Horses
and SCC was an assistant suggestion, not an owner selection.

The available in-app studio profile shows zero saved favorites. Inspection of the
existing Chrome studio was interrupted by user input; Chrome-only favorites remain
**unverified**, not disproved. No persisted record was rewritten. The nine committed
selections in `owner-selection.json` agree with their original audition hashes.

**Count: 18 distinct approved sounds** = 8 Pass 1 + 9 V2 + Yahtzee Cup C.
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
| Yahtzee physical roll | Exact cup-roll-c.wav | Approved | Added locally; first motion → landing, A/B follows |
| Horses / SCC physical roll | Proposed same Cup C | Requires approval | Intentionally no new shake until selected |
| Quintzee electronic roll | New quintzee-roll-b2.wav | Revision requested | Studio only; revised asset needs approval |
| 357 3–2–1 Drop | drop-countdown A/B/C | Requires approval | Studio only; 900ms beat, DROP silent |
| Run21 Pass | Existing approved pass/flip mapping | Approved baseline | Preserved, including fresh Async event adapter |
| Run21 exact 21 / bust | Existing feedback cues | Approved baseline | Preserved; optional replacements not selected or needed |
| Farkle bust | farkle-bust A/B/C | Requires approval | Studio only; existing roll/landing unchanged |
| Quintzee Upper Bonus +35 | upper-bonus A/B/C | Requires approval | Studio only |
| Quintzee All Filled +35 | all-filled A/B/C | Requires approval | Studio only |
| Taxes, reantes, chip transfers | chip-single / pot-gather candidates | Requires approval | No approved chip mapping found; no substitution |
| Box Drop ordinary visible placement | Exact Wooden Peg A | Approved reuse authorized | Added locally at accepted box DOM commit |
| Words successful local tile placement (live + Async) | Exact Wooden Peg A | Approved reuse authorized | Added locally after staged tile commits |
| Hold toggles, rejected target/placement, drag, restored draft, history | None | Intentionally silent | No new audio |
| Muted, hidden, disconnected, replay, Session Ended restoration | None | Intentionally silent | Existing manager/visibility ownership preserved |

## Failure boundaries and preserve list

Yahtzee's only production roll renderer is `DiceRollAnimation`, mounted by
`DiceTableLayout`; it supplies game type + cache identity + roll key. The roll
starts on its first RAF, stops synchronously before its landing commit, and
cancels on replacement, unmount, offline, mute, or page interruption. A new
optional manager cancellation callback exposes its existing graph stop; it creates
no second context or preference owner. No queued unlock replay is introduced.

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

## Remaining owner decisions

The isolated review is `http://localhost:4318/review.html`, also available on the
same Wi-Fi at `http://192.168.1.242:4318/review.html`.

1. `#quintzee`: B2 keeps 264Hz and harmonic mix, changes 44 → 34 pulses/sec,
   narrows the envelope and lowers the gaps. Stop follows the real rumble, no landing.
2. `#cup`: reuse approved Yahtzee Cup C for Horses and SCC.
3. `#drop-countdown`: 357 descending countdown.
4. `#farkle-bust`: Farkle bust.
5. `#upper-bonus`: Quintzee Upper Bonus.
6. `#all-filled`: Quintzee All Filled.
7. `#chips`: chip transfer recording. Original Pass 1 left both candidates unselected.

These are missing/unverified approvals, not a request to reconsider the seventeen
published choices. If a Chrome favorite already captures one, its exact exported
selection resolves that row without re-audition. Production remains blocked until
these are resolved, mapped, tested and merged onto clean synchronized main.

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

**18 distinct approved sounds are integrated and locally validated.** Four
presentation mappings were added: Yahtzee roll, HOLM fold, Box Drop placement and
Words placement. The seven unverified decisions above remain unintegrated.
Physical iPhone/Android listening and Jeremy's production smoke are not inferred
from local automated checks. Production remains at `5037d7fdf`; no push/deployment.
