# 357 Drop reversible carry-forward playtest — November 7, 2026

## Rules and switch

357-drop/3 reuses the existing shared poker evaluator, paytable, natural bonus,
board bonus and three-round Arcade orchestration. Its private newCards has 3/2/2
permanent slots; the public lanes distinguish inherited printed cards. All seven
new slots accept placements from the first draw. Each command resolves newly
eligible stages in 3 → 5 → 7 order, including zero-score inheritance. Wilds and
best-five/natural eligibility are reevaluated per stage. Five passes reset per
round; a filled board exposes at most twelve cards. Full-board celebration does
not imply the +200 all-three-scoring bonus.

The administrative switch is SELECT private.drop357_select_ruleset(true) for the
playtest, false for the original. Only database administration can execute it.
It atomically selects one enabled version. Existing arcade_start pins ruleset
and config at admission and returns an already-active run across switch changes.
Frozen /1 and /2 remain supported; /2 retains 15 placements and three passes.
Existing score-group authority keeps /3 separate from /2, including records and
personal bests. UI identifies the playtest and its separate leaderboard.

## Responsiveness and presentation

Before: the hook held a request-wide busy lock and showed no card landing until
HTTP completed. Local iPhone-size tap-to-paint was 28–32ms, and a controlled 400ms
reply delay disabled all lanes. Ordinary row effects never owned this delay.

After: a pending presentation lands the known card immediately without scoring or
revealing private cards. The next known card unlocks on the exact immutable
request receipt from an authoritative snapshot, even before its HTTP reply.
Each UI tap also binds to the displayed revision. Stale taps cannot consume an
unseen card; new accepted taps stay ordered. Lost responses retain and replay the
same UUID. A delayed old reply cannot retire a newer pending command. Server-Timing
now exposes the existing API auth/RPC/total durations for physical-device diagnosis.

Measured loopback paint was 9.5–12.6ms (9.3ms with the reply held). The burst proof
accepted the next confirmed card while the prior response was still held, rejected
an intervening stale-card tap, and preserved both placements. These are desktop
Edge measurements at iPhone dimensions, not physical Safari/network measurements.

Both boards reserve space for a readable 11px Natty +20% badge (accessible name:
Natural bonus, 20 percent), gold scoring-card borders and existing bold result
names/scores. ALL FILLED appears at 180ms with the distinct 850ms 357 cadence;
ordinary final-row sounds are suppressed, including cascades. Standard count-up
starts at 1200ms, ends at 4000ms and returns home by 4300ms within the existing
5000ms server hold. No effect owns input or advances the clock. Final Score remains
until Back to Arcade; the server submits one result independently of navigation.
All user-facing Abandon run wording was already removed; the source audit stays clear.

## Qualification and publication

Migration 20261107225845 is installed with /3 initially disabled. Hosted candidate
and installed rollback proofs cover /1, /2 and /3: authorization, duplicates,
stale and late commands, injected terminal rollback, separate scores/ties,
successor admission, switching with an active run, zero-client recovery, additive
three-round summaries, and zero multiplayer/financial writes. V3 additionally
proves later-stage prefill, zero-score cascading, printed-card/wild reevaluation,
all five passes at the last slot, seven placements/twelve exposures and tamper
rejection. Authority digest: f8b2ed7ec6fcc9f9544f29d82088811c.

Independent connections pass admission/action/worker races and terminal rollback.
The existing worker passes unattended three-round completion. Browser → actual
Arcade service → disposable PostgreSQL runs both boards through three rounds,
including timeout, bells, natural/wild readability, ALL FILLED before count-up,
no competing ordinary final-row cue, score-pill return, persistent/reloaded final
results and exactly one score. Six layouts include 320/375/390 portraits.
Evidence is ignored qualification.local/drop357/browser-{original,carry}/ and
latency-{before,after}/. Focused hook tests exercise delayed replies, early exact
receipts, stale displayed revisions, ambiguous responses and immutable replay.

Checkpoint: 357-drop-carry-playtest-2026-11-07. Its verified tag records production
publication and activation. This release includes the already-published Arcade
ordering a24ddfe79 and preserves Horses Blitz. The previous ordering deployment
was READY although its release-signal job failed; this release must receive its
own verified signal before enabling /3.

## Owner smoke

Physical iPhone Safari/speaker acceptance remains Jeremy's smoke. Prefill the 5/7
new slots, finish a zero-score 3 hand, and verify the ordered cascade, no +200,
ALL FILLED beat and sound, then count-up/home. Check rapid cross-lane taps and a
row-lock tap, readable natural/wild results, bar-only clock, three bells, and
three additive final totals held until Back to Arcade. Switching false is reversible
for new admissions; an existing playtest continues under /3.
