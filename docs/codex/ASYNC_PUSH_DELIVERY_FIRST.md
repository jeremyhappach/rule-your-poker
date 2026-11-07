# Async push re-alert hotfix — November 7, 2026

## Scope and evidence

Jeremy authorized recreating scratch commit `0d1cb74` if unavailable, publishing
through the Windows helper, and verifying actual display on Hap's installed
iPhone app. The scratch object was unavailable. The isolated task branch starts
at current main `169734bfb3d8caf9765d1af1e113aa95f2547ab1`; the unrelated Golf
checkout and its uncommitted work are preserved.

`public/ptown-push-sw.js` now sets `renotify` for fresh, unexpired `invite`,
`turn`, and `last_call` events. Same-event retries and expired events remain
silent with `renotify=false`. Existing match tags, receipt serialization/cache,
account binding, guarded tap destinations, titles/bodies and table/registration
alert behavior are preserved. This repairs the known same-match replacement
behavior; it does not establish the cause of the November 7, 8:00 AM Central miss.

`node --test dev/web-push/*.test.mjs`: **37 passed**, zero failed. Regression
coverage includes a fresh event replacing an earlier same-match alert, a retry
of that new event, a distinct expired event, all three async kinds, and unchanged
table/registration replacement behavior. These are service-worker harness tests,
not evidence of physical iPhone delivery.

## Production SQL discrepancy — unresolved

Read-only production inspection of project `xvhmbuppghwmwpwrkzao` confirmed
migration `20261107024144_async_push_delivery_first` in the migration ledger.
Its exact stored SQL is now tracked in source. **It was not reapplied.**

The later installed migration `20261107034130_async_turn_notification_opponents`
replaced both `public.async_push_claim()` and
`public.async_push_authorize(uuid,uuid,uuid)` with definitions containing:

```sql
e.kind IN('table_open','turn','last_call') AND private.push_user_active(e.user_id)
```

Both live function definitions still contain that predicate. Active-account turn
and Last Call dispatch therefore remains suppressed despite the earlier migration
receipt. Quiet Hours and opt-out/binding eligibility checks are still present.
The installed `private.push_sync(uuid)` retains zero-to-positive availability,
`turn_epoch`, and one turn event per match/recipient availability cycle.

A separately approved forward migration is needed to replace only that presence
predicate with `e.kind='table_open' AND private.push_user_active(e.user_id)` in
both functions, preserving the opponent-name payload and every other guard.
Do not replay the historical migration or rewrite its ledger. No production
function or application data was changed during this hotfix investigation.

## Publication and physical acceptance

Checkpoint tag: `async-push-realert-2026-11-07`. Exact deployed commit and served
worker verification are reported with the release. The foreground test remains
blocked by the SQL discrepancy above until its correction is approved and proved.

No connected physical-iPhone tool is available. Actual display remains pending
Jeremy/Hap's observations; provider acceptance alone is not display evidence.
Reopen the installed app after publication and ensure the updated worker has
activated (an already-open app can retain the old active worker during update).

1. Use an opted-in match/device outside Quiet Hours. Produce a genuine new turn
   availability cycle with Hap backgrounded and record the event UUID and time.
   Observe the iPhone alert and leave it in Notification Center.
2. Clear all actionable turns, then create another availability cycle in that
   same match. Keep the first notification present. Observe the second alert.
3. Once the production presence regression is corrected, include a fresh cycle
   while the installed app is open. Observe the actual OS notification.
4. Retry an identical event under a scoped test; expect no new audible/banner
   alert. Do not fabricate a new event UUID and call it a retry.
5. If a fresh alert is absent, correlate its server receipt and Apple subscription
   with worker receipt, local binding decision and `showNotification` resolution.
   Current worker code has no durable diagnostic receipt for those phone stages;
   add scoped diagnostics if the device cannot expose them directly. Do not claim
   the November 7 miss explained, or the end-to-end issue fixed, without evidence.
