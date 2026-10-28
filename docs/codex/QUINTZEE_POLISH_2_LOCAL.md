# Quintzee second local polish — review checkpoint, 2026-10-26

Branch: `codex/quintzee-polish-local`. Base: `4b18a196f36346717dca4d042e6ba7fa0497feae`. The checkpoint commit identifies this exact local candidate. No push, merge, production migration, deployment or admission change is authorized or performed. Unrelated Cribbage snapshot, old evidence and named release-evidence stash remain preserved.

## Ready for review

1. Moderate dice motion: approximately 5–7% travel, 22–32 degree rotation, near-unit scale. Still concealed independent transitional faces, fixed 1500ms presentation, held dice stationary.
2. Classic Mode text precedes its switch. Off is gray/left; on is filled gold/right. Browser computed styles, thumb transforms and remembered per-user state pass. Local specificity fixes the shared Tailwind style overriding the intended track colors.
3. Final browser timing: Modern 120.4ms request latency +1506.2ms visible rumble, Classic 126.1ms +1512.6ms. Unlock follows landing within 0.1ms in these captures. The remaining ~one-frame variance is rendering, not an extra timer. No RNG/result is fabricated before authority responds.
4. Ready shows only its separate 30s timer. Gameplay bar is absent from the DOM until accepted first roll. Same existing button/location says Start; no Start screen or overlay.
5. Expiry paths pass: solo startup becomes expired/unranked and returns to leaderboard; gameplay timeout shows Time’s up, banks via existing authority, then proceeds to the next round/player; fake startup begins canonical autoplay. Explicit pause, reclaim, no deadline renewal and all-away settlement remain covered by rollback proofs. The reported unknown-mode timeout was not uniquely reproduced as an authority stall. A separate concrete bug was reproduced: an action clicked during a background read was silently dropped. Its failing regression now passes; the original command/revision is queued through the existing durable request owner, without duplication. Expired-start copy now explicitly says unranked.
6. Running current-round BASE SCORE is separate from multiplied cumulative TOTAL SCORE. A private read-only projection invokes each version’s frozen finish scorer to obtain the base and earned upper bonus; it does not award points or mutate gameplay. Upper bonus and Quintzee each show a 1500ms banner/audio cue, then a 600ms base count-up. Quintzee adds only its recorded 50. Existing round finishes use TriScorePill/useTriRoundPresentation and canonical count audio, after any pending base sequence. Result overlay waits until count-up/motion finish, within the existing 9s result window. No clock or settlement change. Reconnect/rerender/replay do not repeat celebrations.

## Pending rule clarification

Quintzee has no Take Score action. Owner was asked whether to add an early-end action that banks earned points and follows normal next/bonus-round flow. No such new rule or button is invented while the answer is pending. Existing finish presentation is complete. Publication remains explicitly held for preview review.

## Evidence

- 23 focused tests pass, 0 failed/skipped; application TypeScript and production bundle pass.
- Complete rollback regression passes, including /1 replay, real-money rejection, 2–4-player settlement, actual bot startup, all-away completion, pause/reclaim, zero confirmation and projection totals. /1 and /2 core scoring files are unchanged in this pass.
- Both-theme real-browser checks pass: switch, timers, held dice, measured roll/unlock, upper bonus, Quintzee, base/final count ordering, score-pill motion and reload suppression. Actual canonical audio played receipts accompany exactly-once cue audits. A separate multiplayer browser check verifies the same Quintzee/base sequence with the authenticated user’s audio identity.
- Four browser timeout paths pass through visible outcomes and gameplay continuation. Fixture deadlines were accelerated only in isolated test data; production clocks were untouched.
- Receipts/screenshots: dev/quintzee/evidence/polish-2/. Logs: qualification.local/quintzee/polish-2-*.log.
- Broad unrelated tests and hosted/deployed qualification were not run for this local review.

## Working preview

http://127.0.0.1:15298/dev/quintzee/production.html?user=f7a938cd-df4d-4827-835f-fe7a111c62cd&mode=pregame

Loopback preview on JeremyLaptop, started as a hidden background process; PID/logs are recorded in qualification.local/quintzee/polish-2-preview.*. It uses real production components and SQL authority with synthetic local authentication. Classic Mode can be changed before Play. No hosted account or money is used.

A future authorized migration must advance canonical projection revisions for already-mounted /1 and /2 runs when adding the derived presentation fields; this local qualification creates fresh preview fixtures. Installed/deployed qualification remains a publication gate.
