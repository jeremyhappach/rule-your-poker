# 357 Drop second smoke correction — November 7, 2026

Owner smoke found small lane type and an automatic exit immediately after the
third tally. The approved correction keeps existing scoring and round timing.

## Ownership and behavior

The reserved lane row now uses a compact line directly beneath the cards:
16px minimum bold hand names and 22px minimum bold scores in portrait, with the
natural badge secondary. Narrow 320px portraits retain all three lanes without
completion moving their positions.

SoloDrop357 retains the standard third-round count-up and return home, then
reuses ArcadeCompletion with an opt-in persistent results layout. Final Score
is the largest number; each round has its awarded total and additive hand,
natural, all-lanes and time contributions. Back to Arcade navigates to /arcade.
It never submits or changes a score. Reloading the completed run restores
results immediately and silently. Existing ArcadeCompletion callers retain
their transient presentation and lifecycle.

Migration 20261107215455 adds private.drop357_round_scores and the roundScores
projection field. It selects only six numeric summary fields from already
banked evidence. Decks, cards, configuration and other private state stay private.
The existing server completion transaction, unique run result, command receipts,
frozen rules, recovery worker and admission flags are unchanged.

## Evidence

Local v1/v2 and hosted candidate/installed rollback proofs cover authorization,
duplicate/stale/late commands, terminal rollback, round sums and additive bonuses,
summary privacy, refresh, autonomous recovery, ties, continuation and zero
multiplayer/financial writes. Installed helper access is private; no synthetic
profiles remain. The helper digest is 1ca4e54941af8d1a50cb00f43011eb76.

Browser → actual Arcade service → disposable PostgreSQL qualification covers
three rounds, a middle-round timeout, natural and wild-assisted lane readability,
six layouts, three bells/count-ups returning home, one final record, persistent
results, completed-route reload, Back without score submission and abandonment.
Screenshots and the browser receipt are in ignored
qualification.local/drop357/browser-second/. Focused presentation/shared-result
tests (22), TypeScript and the production build validate the client. Physical iPhone
Safari and speaker acceptance remain Jeremy's smoke.

The release is based on Horses Blitz 62c839ed5 after its publication completed.
No Horses client, rules, admission or worker is changed. Checkpoint:
357-drop-final-results-2026-11-07; its verified tag records final publication.

## Owner smoke

Refresh, play three rounds, and compare a natural and wild-assisted result.
Confirm the final total equals the three listed totals, each bonus breakdown
adds to its round, results remain open after waiting and refreshing, and only
Back to Arcade exits. Check the leaderboard contains one result.
