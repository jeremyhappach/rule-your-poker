# 11 Up secondary smoke — local only

Base: 55a896b1f84fcd31d32a1a135622af99fca1a3c9. Branch: codex/eleven-up-secondary-smoke.
Release goes behind every currently queued game deployment (Golf, Canasta, Battle31
and the rest of that queue). This work reserves no release slot and blocks no game.

## Ding correction

The audio hook previously sounded on the confirmed group-count increase, while
the presentation hook had only highlighted the first ball. Automatic groups now
retain their confirmed identity until the same witnessed presentation displays
a total of 11. The cue is consumed once. Manual/Arcade confirmation remains
immediate; reconnect, scope change, pause, tab change, expiry and reclaim cannot
replay a cancelled automatic cue. No action, timer, rule or financial owner changes.

47 focused tests pass. Actual local SQL/browser playback records one cue at
displayed total 11, 770ms selection spacing, no page errors and unchanged deadline.
TypeScript and Vite build pass. Physical audio/phone acceptance remains pending.

## Ready pause — reproduced; policy decision pending

Run: node dev/eleven-up/secondary-ready-repro.mjs (loopback, rolled back).
The exact pre-first-placement round-one boundary reproduces as follows:

- Play money, one human plus bot: timeout flags autoplay/deferred sit-out;
  canonical all-human safeguard pauses in Ready before any bot action. Reclaim
  clears both flags and deliberately keeps the pause and Ready state unchanged.
- Play money, two humans with the other human active: legal takeover starts
  playing without pausing; reclaim clears flags without changing state/clocks.
- Real money, two humans: timeout pauses in Ready without admitting a bot or
  setting fake-money autoplay flags.

This explains the reported behavior when the timed-out player is the sole active
human; the production session identity/roster has not been inspected or altered.
The request to never pause fake money conflicts with the earlier explicit order
to preserve the canonical all-human safeguard. Reclaim also must not implicitly
resume a pause. The smallest compatible correction is an explicit canonical
Resume affordance after reclaim, preserving the safeguard. The alternative is a
new 11 Up fake-money exception to that policy, requiring a direct owner decision.
The question is pending; no SQL, pause, resume or admission behavior was changed.
The current fullscreen 11 Up Session panel supplies rules/history/chat but no
canonical pause/resume callback, explaining the missing in-surface affordance.

## Remaining release steps

Resolve the Ready policy decision and implement/test that correction locally.
After all currently queued game deployments, obtain an explicit release slot,
reconcile current main/shared authority, qualify any resulting forward migration,
and publish the matching client. Audio alone requires no database migration.
No production queries/writes, main integration, push, deployment, grants or live
session repairs occurred for this secondary candidate.
