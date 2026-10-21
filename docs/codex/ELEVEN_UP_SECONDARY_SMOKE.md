# 11 Up secondary smoke — locally qualified, unreleased

Base: 55a896b1f84fcd31d32a1a135622af99fca1a3c9. Branch: codex/eleven-up-secondary-smoke.
Release remains behind every currently queued game (including Golf, Canasta and
Battle31). This candidate reserves no release slot and blocks no other game.

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

## Release blockers

supabase/eleven-up/secondary-ready.sql is an UNREGISTERED local forward artifact.
After the other queued releases, establish a release slot, reconcile current main,
inspect hosted definition parity, register/qualify the forward migration and publish
the matching client. Physical phone/audio and production owner smoke remain pending.
Broader policy application to other games is separately queued, not implemented here.
No production access, migration, main integration, push, deployment, admission/grant
change or live-session repair occurred for this secondary candidate.
