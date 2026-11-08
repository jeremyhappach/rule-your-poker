# Async notification tap continuity — November 8, 2026

## Incident and established failure boundary

Jeremy reported tapping a fresh Your turn alert while actively using the installed
iPhone PWA. Production build `d3ad5f076915bdf925fd2cb9f23f5113df7b0c4e`
and its public worker matched the inspected source. Event
`ab7c6f76-58ad-418c-b2e2-db4162ff7b99`, created at 19:43:58 UTC, targeted
match `5b7479c4-28b3-4ec1-b4a7-fc177f3b18e9` for Hap. Both delivery rows were
sent on their first attempt; the account was enabled at revision 2. These are
delivery/account records, not proof of the physical tap's downstream execution.

The worker always called WindowClient.navigate before focus, destroying the live
document and its successful account-access snapshot. Its later push-navigation
message carried no match target; PushLifecycle was mounted below the access gate
and only recovered administrator-registration destinations. The new document had
to restore auth and run account_access_snapshot before mounting Delayed. The
ten-second Retry guard added earlier did not correct this forced restart.

A separate source-proven gate race counted ignored transient null auth events as
session changes. That could discard the pending getSession result even though
the null event did not admit any replacement session. A focused regression now
covers that sequence. There is no correlated physical-device trace proving
whether this race, SDK restoration, or network latency caused Jeremy's exact
request to stall; this release does not claim such proof.

## Correction and preserved authority

- Async invite/turn/last-call clicks focus the existing window and send the exact
  account, match and event UUIDs through a MessageChannel. A 1.5-second capability
  acknowledgement provides legacy/unresponsive-window fallback to the existing
  guarded URL; it does not advance gameplay or retry an access check.
- usePushMatchNavigation is mounted by AccountAccessGate above gated children.
  It validates the worker source and UUIDs, retains one destination, deduplicates
  received event identities, and waits for an existing session/access check.
  Navigation reuses enabled access only for the matching, unexpired session.
  Account switches and explicit sign-out cannot replay an old pending link.
- Cold/no-window launches still use /delayed/:matchId. Expired sessions must
  restore; pending/suspended accounts remain blocked. Authentication, membership,
  deadlines, legal actions, outcomes and money remain server-owned and unchanged.
- Retry retains the pending match. Back to Lobby clears it and navigates locally;
  a cold/unchecked account still must pass the gate before lobby content appears.
  Previously authorized content retains its existing transient-failure policy.
- A new push event refreshes delayed_home even when that same match is already
  open, replacing stale turn availability with the authoritative projection.
- The push-only worker activates immediately; it has no app-shell cache. Older
  open app bundles use the guarded fallback until updated. Table/admin push
  routes, receipt/binding checks, notification wording and financial paths remain.

No migration or production-data writes are part of this correction. The original
dirty Golf worktree remains untouched. Release branch: codex/async-push-tap.

## Automated evidence

39 focused component tests, 31 auth/onboarding regressions and 21 worker tests
pass. They cover valid-session
reuse, initial and foreground checks in flight, duplicate events, failure/Retry,
late results, expired restoration, suspension revisions, account switching,
ignored transient null auth, guarded cold destinations and stale same-match taps.
Installed TypeScript compiler and production Vite build pass; tsgo is unavailable
and no dependencies were installed.

`node dev/web-push/tap-browser.mjs` runs the compiled App in desktop Edge with
native service-worker, MessageChannel and WindowClient APIs. Eight fixture-backed
cases pass: foreground, background desktop tab, pending check, Retry, lobby exit,
suspension, cold direct URL, stale same-match tap. Warm/pending each make one
account check total and one exact-match read. Duplicate taps do not reread the
match. The document identity is preserved and no page errors occur. A playable
projection exposes the exact child's Take Turn link; a stale projection removes
it. This does not prove a real turn can be completed on an iPhone.

Screenshots and request counts: `qualification.local/push-tap/`. Notificationclick
is synthetic; HTTP responses are controlled fixtures. No physical device, APNs,
real background suspension, force-closed PWA launch or real gameplay is claimed.

## Release and physical acceptance

Checkpoint: `async-push-tap-2026-11-08`; the corresponding `-verified` annotated tag
records the exact production SHA, deployment and public worker verification.

All physical iPhone acceptance remains pending. After loading the published app:

1. While signed in and actively using the installed PWA, tap a fresh real Your
   turn push. Confirm the exact match/opponent, enter its available turn and
   successfully submit a legal action without the account-check stall.
2. Repeat from a backgrounded PWA, then with the PWA fully closed.
3. Tap an older notification after that turn has been completed/expired. Confirm
   current match/results or opponent-turn state and no obsolete playable turn.
4. Record iOS version, app build, match/event and observed results separately from
   automated evidence. Jeremy's production smoke remains acceptance truth.
