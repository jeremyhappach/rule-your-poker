# Async entry continuity — approved release candidate — 2026-10-29

The owner authorized this correction pass: remove entry/loading detours, preserve the complete opponent-result review and handoff, and display actual inviter names for new and existing pending invitations. At 23:40 UTC the owner requested “Straight to production please,” superseding the initial local-only publication hold for these three fixes. Hosted migrations, customer-state changes and the separate platform transition audit remain excluded. The previous production checkpoint is `c26cf799da0e539d31e304fc38c457f5dd3ea0f6`, publisher receipt `40965854739-2`.

## Diagnosis and correction

The real entry path had several independent presentation fallbacks: App lazy-route loading, release admission checking, auth/home loading, review loading/begin, then adapter state and Start loading. Previous component previews bypassed App/auth/release/lazy boundaries, so they could pass while real navigation still flashed intermediate text.

`AsyncTurnEntry` now renders the existing canonical felt through those async entry boundaries. A match/child-keyed route hint can carry the known opponent's display name and pending-review status; it carries no board or gameplay authority. Cold entry with no identity waits on the felt without invented names. `ReviewGate` and `AttemptReview` retain the named introduction while review data loads. After the saved board/count-up and full three-second settled hold, the existing two-second Your turn handoff continues through slow adapter state/Start requests until the own board is ready. Consumed route hints are cleared so refreshing a resumed attempt does not replay an opponent introduction.

The literal “Preparing next hand” belongs to Cribbage in current source, outside the async route. No Cribbage change was made. The verified async detours were “Preparing your turn,” saved-result loading, route/auth/release loading and the redundant Begin round/availability surface; the real-entry test rejects all these texts, including the reported literal.

One read-only inspection of deployed notification functions confirmed invitation rows contain `opponentId`, but no `opponentName`. Earlier UI fixtures incorrectly supplied a name. The notification provider now resolves each invitation's existing `delayed_home` projection, validates match ID, recipient ID and organizer ID, and displays `Pending invite from [actual name]`. New and old rows work without backfill. Unresolved/failed identity shows `Pending invite`, never a placeholder person. Lookups are deduplicated per match within a refresh and protected by the existing request generation guard.

## Preserved boundaries

- All release, authentication, participant, review ACK and fresh turn-admission checks still run. Other release-protected routes keep their original fallback.
- No gameplay tree starts behind the review. Quintzee still requires explicit Start and does not roll or deal early. Resumed attempts keep their original deadline and do not send another Start.
- Review timing, shared scoring/rules, action idempotency, persistent notifications, 36-hour turns, Last Call, forfeitures and parent settlement are unchanged. No SQL, service or financial code changed.

## Evidence

Affected tests: **146 pass across 13 files**, including slow state/Start, real invitation payload shapes, mismatched identity, review/ACK, resume and explicit Start cases. Final aggregate: **3,265 pass across 461 files**. Harness: **241 pass across 12 files**. Application typecheck and ordinary production build pass; the build retains existing large-chunk/Browserslist warnings.

`dev/async-combined/entry-app-browser.mjs` runs the compiled production App through notification → match home → Take Turn → unseen review → handoff → own board. All **eight cases pass**: Run21, Tri-Towers, Quintzee and Box Drop at 390px normal motion and 320px reduced motion. It delays the cold lazy chunk, build manifest, home/review/ACK and state/Start responses; observes the DOM for unwanted text and handoff gaps; verifies named new/old invitations, full settled hold, no actions during review, no unsolicited rolls, explicit Quintzee Start, refresh before Start, refresh during unseen review, resumed deadlines and single Start. No page errors, external HTTP requests or horizontal overflow were observed.

This is the real application entry with synthetic HTTP authority, not live backend or physical-device acceptance. Supabase auth/client code and release checks run; transport is fulfilled at loopback and WebSockets are closed. The fixture production build uses a loopback Supabase URL and public test key. An ordinary production build is run afterward. No hosted mutations are part of this qualification.

Local evidence is in `qualification.local/async-combined/`: `entry-focused-final.log`, `entry-all-tests.log`, `entry-typecheck-final.log`, `entry-production-build.log`, `entry-app-browser.json`, and eight `entry-app-*.png` screenshots. Evidence is local/ignored; the reproducible browser script is versioned.

## Owner acceptance

After verified publication, open a pending invitation and confirm the inviter name. Enter an available round with an unseen opponent result from the notification/match screen. Confirm the named intro, saved board/count-up, three-second settled hold, Your turn, then the own board without another loading screen. For Quintzee, wait and refresh before pressing Start: no dice should appear until Start. Refresh an active attempt and confirm the same board/deadline with no repeated result review. Owner production smoke remains acceptance truth.
