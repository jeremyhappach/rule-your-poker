# 11 Up secondary smoke — installed qualification PASS; publication pending

Base: 55a896b1f84fcd31d32a1a135622af99fca1a3c9. Branch: codex/eleven-up-secondary-smoke.
Coordinator cleared the incident-first hold on October 28. Reconciled against incident main 99249d8bd70dea766d21bc33c626e11354a2f0b4. 11 Up owns the publication slot; Words work remains isolated and held.

## Corrections

Automatic combination audio now waits until the witnessed ball highlights display
11, then plays once. Manual/Arcade confirmation remains immediate. Cancelled or
historical presentations cannot replay a cue. Local browser evidence records one
cue at 11 with 770 ms selection spacing and an unchanged authoritative deadline.

The Ready stall was the all-human safeguard firing during an active play-money
competition. The clarified policy puts eligible-human checks BETWEEN dealer games.
The forward SQL changes only the 11 Up branches of pause_all_humans_auto_fold and
11 Up postgame orchestration: active fake-money play can complete using the existing
legal bot policy; postgame delegates to canonical participation resolution when no
human remains eligible, even if multiple bots remain. Real-money Ready still pauses.
Expired scoring results, clocks, bonuses, settlement and real-money bot admission
are unchanged. Deferred sit-out remains at the whole-competition boundary.

Reclaim clears autoplay/deferred flags without resetting clocks or implicitly
resuming. A paused participant who has reclaimed sees an explicit Resume game
button if they are the current host; other participants see host-resume guidance.
The route uses its existing guarded canonical pause/resume callback and versioned
RPC. No alternate pause authority was introduced.

## Local validation

- 48 focused 11 Up tests and 15 canonical pause/timer/intent tests passed.
- Typecheck and Vite production build passed.
- Local SQL proof covers all-away two-human, human-plus-bot and human-plus-two-bot
  competitions, legal Ready takeover, reload, reclaim, stale rejection, settlement
  once, canonical chips/snapshots, deferred sit-out and next-game waiting.
- Completion uses bounded fixture clocks and verifies each expiry against the
  unchanged reducer; it is not a full wall-clock unattended run.
- Both-money 36-case financial matrix and prior smoke-controls proof passed.
- Independent-connection bot-first/reclaim-first races passed.
- Race Poker core/financial/injected rollback/v2 controls and Battle31 six-case
  financial proof passed. Other function definitions and ACLs are preserved.
- Actual local SQL/browser reclaim, reload and explicit authenticated Resume passed
  at 320x568, 390x844 and 667x375, with no overflow or page errors.

Evidence: dev/eleven-up/secondary-smoke-evidence.json. Reproduction script retains
the historical failing expectations; use secondary-ready-proof.mjs and
secondary-ready-races.mjs to qualify the corrected candidate.

## October 28 release qualification

Full reconciled build passed: 3119 source tests, 241 harness tests and typecheck.
Local lifecycle/36 financial-case proof, independent-connection races, displayed-eleven
audio and three phone Resume layouts passed again. Hosted baseline/installed proof
uses only rollback-contained synthetic fixtures and targets their exact identities;
it never calls global recovery or changes customer sessions. Six financial cases,
both Ready modes, persistent flags/reclaim, late settlement replay and next-game
waiting passed. Financial failure injection remains covered by local proof.

Installed once as 20261028190237_eleven_up_active_completion_resume. Exact SQL SHA256:
9887c4fc29729b9bd058814868c756552ef1a523d4e6a37efd8150a132bba7f1.
All other public/private function definitions and ACLs retain hash
f40a918846a82cafa92ea48bfbde8e93. Incident migration was not repeated.
The supported migration connector generated the registration because the local CLI
was unavailable; the repository migration records its actual hosted version/bytes.

Publication requires final READY/manifest/publisher/signal agreement. Physical phone,
audio and production owner smoke remain pending. No admission/grant changes or
customer-session repairs are included. Broad cross-game policy review remains separate.
