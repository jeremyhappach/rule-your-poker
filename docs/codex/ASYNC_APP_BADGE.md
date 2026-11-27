# Async app-icon badge — November 27, 2026

Jeremy approved implementation, the count migration and publication. Physical
iPhone Home Screen acceptance remains owner smoke. Checkpoint:
`async-app-badge-20261127`.

## Behavior and ownership

The app-icon number is pending own turns + unread final game results + eligible
unread match finales. Invitations and historical turn-review events do not add
to it. Each game/result is counted; the existing in-app Async indicator still
counts actionable matches, including invitations, exactly as before.

`private.async_badge_snapshot(uuid)` reads current participant-owned state and
existing review/settlement/ACK projections. It preserves held/removed matches,
deadlines, untimed play-money Chess and Five Alive's simultaneous eligibility.
It returns an absolute count and a server statement-time ordering token in
microseconds. The private invoker helper is not callable by API roles.
`delayed_lobby()` and `async_push_authorize()` both attach that same snapshot.
Existing RPC authorization and payload filtering remain intact.

`AsyncActivityProvider` forwards confirmed snapshots through
`src/lib/webPush/appBadge.ts`. Successful commands/ACKs, realtime, reconnect,
visibility, worker activation, lobby return and known deadline boundaries
refresh the existing read. Authentication loading is distinct from sign-out;
loading and failed reads never become a fabricated zero.

`public/ptown-push-sw.js` serializes foreground and push writes through its
existing queue. Its local cache stores the account and last applied snapshot.
Older snapshots and conflicting equal-version snapshots cannot restore cleared
work. Reopening can reapply the same snapshot. Account change/sign-out clears
the badge; old-account push bindings cannot set the next account's badge.
Unsupported APIs and rejected badge calls do not fail gameplay or notification
delivery. A document-API fallback covers platforms without worker badging.

No new permissions prompt, push subscription, alert kind, polling loop, game
rule, settlement, financial mutation or historical repair is introduced.
The service worker continues to have no application fetch/cache handler.

## Background limits

Installed iPhone/iPad Home Screen web apps support badging from iOS/iPadOS 16.4.
The user must allow notifications and Badges in system settings. Supported
desktop installations use the same feature-detected API.

Existing eligible visible pushes carry the current total, even while the app is
closed. Push delivery is best effort and subject to existing preferences, quiet
hours, foreground suppression and expiration. The existing flow has no
result-only or acknowledgement-only event. Completing work on another device
may therefore leave a closed device's badge stale until another eligible push
or reopening. Apple does not permit silent badge-only web pushes. Notification
click/dismiss does not acknowledge game results or clear the badge by itself.

Sources: [WebKit iPhone badging](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
and [WebKit visible-push requirement](https://webkit.org/blog/16535/meet-declarative-web-push/).

## Qualification

Migration `20261127212304_async_app_badge` is installed. The repository filename
matches the version assigned by the migration service. Candidate installation
twice and installed-authority rollback proofs both pass:

- exact parity with existing turn/result/finale projections;
- multi-game totals, invitation exclusion, held matches, untimed Chess and
  simultaneous Five Alive eligibility;
- real admission, winner/tie outcomes in both money modes, game/finale ACKs,
  duplicate/late replay and zero after acknowledgement;
- unchanged canonical chips and balanced transfers, outsider isolation and
  private-helper/service-only RPC grants;
- actual authorized push payload, invalid lease and quiet-hour suppression;
- read-only counts and zero remaining synthetic push subscriptions.

Run `supabase/web-push/app-badge-proof.sql` inside BEGIN/ROLLBACK. Candidate
proof prepends `app-badge.sql` twice; installed proof omits that DDL. Never run
the global push claim/sender for qualification. Security-advisor comparison
has no new findings. A read-only count on Hap's current history took 47 ms
including execution overhead; it adds no per-move database writes.

All 53 push tests and 34 focused application tests passed. Worker regressions
cover persistence/restart, stale/expired/malformed payloads, account/logout,
permission failure, retry and overlapping foreground/background calls.
The native Edge browser proof uses the real provider, HTTP transport, service
worker, Cache Storage and native Badging API with isolated authenticated
fixtures: 3 items while the tab counts 1 match; taking a turn leaves 1;
failed refresh preserves it; viewing the final item clears to 0; reload
recovers a new count of 2. No page errors. This does not prove iPhone icon UI.

The complete release build passed TypeScript, 4,459 application tests, 241
harness tests, 46 release-tool tests and the 90 MB cap (89,855,993 bytes).

Commands: `node --test dev/web-push/*.test.mjs`,
`node dev/web-push/app-badge-browser.mjs`, `npm run build`.
Local logs and browser receipt: `qualification.local/app-badge/`.

## Owner smoke

1. Reopen the installed iPhone app once to load the new worker. With
   Notifications and Badges enabled, check the icon against pending turns and
   unread game/match results. The Async tab retains its per-match count.
2. Take a turn, then view game and match results. Return to Home Screen after
   each; the combined count decreases and disappears when no work remains.
3. Close/suspend the app and receive an ordinary eligible turn push. Confirm
   the icon updates without opening it. Duplicate/older pushes must not restore
   work already cleared by a newer snapshot.
4. Reopen after a missed push or another-device action; confirm correction.
   Check a temporary failed/offline refresh preserves the last known number.
5. Sign out or switch accounts; confirm no prior-account badge remains. Badges
   disabled or unsupported must leave ordinary app/notification behavior intact.
