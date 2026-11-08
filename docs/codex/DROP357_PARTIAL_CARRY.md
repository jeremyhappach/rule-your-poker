# 357 Drop partial carry playtest — November 8, 2026

## Rules and authority

357-drop/4 is the active-playtest candidate. Its frozen config uses 3/4/5 new-card
slots plus 0/1/2 reserved carry slots, three shared passes and twelve placements
(up to fifteen exposed cards). Any new slot accepts the first draw. The 3 lane
scores before one printed card is selected; the 5 lane scores before two distinct
cards are confirmed, including its inherited card. Zero-point lanes still carry.
The destination independently reevaluates wild ranks, natural eligibility and
best-five selection through the existing paytable. Source hands remain visible.

The private v4 action owner validates immutable carry indices, reconstructs each
lane and resolves each result once. Carry actions consume neither cards nor
passes. After twelve placements current is null: the clock stays live until
all three results resolve or timeout. Timeout banks only resolved lanes without
a time bonus. Filled means all three results resolved, including a final carry
confirmation. ALL FILLED is independent of the +200 all-three-scoring bonus.

The administrative switch private.drop357_select_ruleset(true) selects /4;
false restores frozen /2 (15 placements, three passes). The text overload accepts
357-drop/2, /3 or /4; /3 remains the seven-placement full-carry trial. Ruleset and
config stay pinned at admission; existing active games survive switching. Each
version retains a separate leaderboard and personal records.

Migration 20261108133655 installs /4 disabled until matching client publication.
Authority digest: 7c8d2d219814d3c6d143e934ee3871cf. activate-v4.sql requires the
verified SHA release signal, matching authority and healthy recovery. The existing
v22 worker dispatches the shared step RPC; this release does not replace it.

## Presentation and lobby correction

Inline carry choices share reserved space. The first carry is a single source
card tap; the second supports toggle/replace selection and an explicit Confirm.
The draft is round-scoped presentation state and survives unrelated placements.
New slots remain playable while a choice is pending. Exact server receipts still
release input; effects never own gameplay or the timer. Natty +20%, bold results,
bar-only timer, opening bells, three standard tallies and persistent Final Score
remain shared across boards. Final submission is server-owned and independent
of Back to Arcade.

Ship Cap Voyage alone supplied a 16:9 aspect override on the shared Arcade tile,
which made that tile taller than the standard 1466:564 banners. The outer tile
now uses the shared ratio. An inner frame fits the complete approved artwork and
its existing Rules hit target together. Artwork is unchanged and not cropped.
All other tile call sites use the same component and keep their full-width frame.

## Qualification

Candidate and installed rollback proofs cover all four versions: authorization,
private deck projection, replay/late replay, stale commands, final-result atomic
rollback, three-round additive totals, ties, successor and zero-client recovery,
and zero multiplayer/financial writes. Partial-specific proof covers later-slot
prefill, zero-score carry, destination wilds, printed inheritance, distinct choices,
pending-choice timeout, the exposure bound, tamper rejection, pinned admission
and reversal. Independent connections test duplicate carry commands and worker
races. SQL-backed Edge mobile emulation completes three rounds with pending choices,
adjusted pairs, placements during selection, natural/wild results, audio order,
score-pill return and persistent/reloaded final totals with one result. Frozen /2
also receives the three-round regression. These are browser checks at iPhone sizes;
physical Safari, speaker and touch acceptance remain Jeremy's smoke.

Evidence lives in ignored qualification.local/drop357/browser-partial and
browser-original; six board viewports and 320/390/1280 lobby checks cover geometry.
Focused hook/audio/transport/final-result tests, application TypeScript and build
qualify the client. The delayed-response latency harness protects exact-receipt
input release and stale-card rejection. Partial-board loopback feedback measured
10.7–13.5ms, and 8.5ms with the reply held; these are not physical-device timings.

Checkpoint: 357-drop-partial-carry-2026-11-08; its verified tag records publication
and activation. This release starts from 7785845e3 and preserves the published
Horses Blitz and Ship Cap Voyage publication lane.

## Owner smoke

On iPhone, fill later new slots first, finish a zero-score 3 lane, tap one carry
card, then choose/adjust/confirm two from the 5 lane. Check destination wilds,
zero-lane bonus withholding, one ALL FILLED sound before tally, open slots during
choices, bar-only timer, all three bells, and additive Final Score held until Back.
Check the Ship Cap Voyage tile matches neighbors and its Rules target opens.
The switch false restores /2 for newly admitted games, without changing a live /4.
