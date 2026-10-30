# Combined async polish and finale review gate — October 30, 2026

Owner approved production publication of the existing Words/Quintzee/presence
candidate plus the diagnosed finale correction, then separately approved the
exact scoped Presence permission expansion. No customer ACK, settlement,
balance, session repair, admission expansion or unrelated platform work is included.
Baseline `57edaabb15296fc6f2a145dcac9b2321264d3019` remains an ancestor.

## Scope and incident

The package preserves the local candidate through `15d714b7b`: actual gameplay-start
Presence, whole-container amber opponent pulse, server-confirmed turn cards, Words
full/medium/close scales with tile-action precedence, hidden async bells, immediate
Quintzee objective states, aligned upper counter and white reused Yahtzee pace.

The selected child review route always presents its saved attempt before the
child overlay. The deployed post-overlay handoff previously checked only for a
parent settlement receipt, so reviewing Tri-Towers could jump to the finale while
Run21 was still unseen. The production event sequence corroborated that path;
there is no historical browser click trace. Financial completion was correct.

`private.delayed_reviews_complete(parent,viewer)` now derives eligibility from all
terminal children, their immutable child events and every relevant unseen opponent
attempt/child event. `delayed_home` and history expose `reviewsComplete`.
`ChildResults` refreshes that projection after its ACK. `MatchFinale` gates every
entry, including direct/archive URLs, and `delayed_finale_ack` checks under the
existing parent lock before its idempotent insert. Missing qualification fails closed.
Old premature finale ACKs remain immutable and do not bypass the gate. A child
with an ACK but an unseen attempt still offers View Results; `finished=1` cannot
skip an outstanding attempt. Child route identity resets presentation ownership.

## Installed migration and qualification

`20261030192550_async_presence_finale_reviews` is registered once on project
`xvhmbuppghwmwpwrkzao`; the repository file uses that actual registered version.
The Supabase CLI was unavailable, so the existing connector registration workflow
was used without installing tools. Candidate and installed BEGIN/ROLLBACK proofs
pass against the hosted database. No synthetic proof profiles remain.

The only new persistent access is the approved Presence-only SELECT/INSERT policies
on `realtime.messages`: current participants read; only the current actor publishes;
the topic binds match, child, actor and exact availability deadline. Anonymous,
outsider, expired/terminal/held/removed/mismatched access is denied. No Broadcast or
general private-table access is granted.

Authenticated hosted Realtime proof passes actor-to-observer delivery, observer
publish denial, outsider/anonymous/wrong-child/wrong-deadline rejection, Broadcast
denial, untrack, a fresh authenticated connection and actor/deadline handoff.
Existing old-topic authorization can remain cached (`track` returned `ok`), but
fresh old-topic joins and former-actor writes to the new topic are denied. The UI
uses the authoritative new identity and ignores cached old-topic state.
The proof uses existing qualification logins with credentials retained only in
memory, two new synthetic matches and one temporary outsider-membership profile.
Cleanup verified zero synthetic matches, profiles, Auth users, update rows,
notifications or canonical financial games. Existing customer rows were untouched.

The initial wire harness tried immediately reusing its sole-channel client while
the SDK was disconnecting; qualification instead explicitly establishes a fresh
authenticated socket. This proves hosted transport reentry, not physical-device
background/foreground behavior. A synthetic handoff initially violated the existing
36-hour timestamp constraint; the coherent available/Last Call/expiry triplet was
then used and the complete wire proof passed. No production rules were changed.

The existing `gameplay_transfer_pending_changes` RLS advisor predates this release.
No unrelated security/configuration cleanup was performed.

## Validation

- 3,331 source/server Vitest tests across 466 files; eight dictionary tests under
  Node's test runner; 241 harness tests. Initial broad filename filters incorrectly
  collected a Playwright browser spec and the Node-only dictionary suite; corrected
  runner selection passes without changing tests or timeouts.
- 151 focused async tests, application typecheck and production build pass.
- Nine isolated local SQL proof groups cover old ACKs, per-viewer isolation,
  authorization, retained snapshots, duplicate ACKs, rollback and independent-tab
  races. Early finale fails; a queued finale observes the committed last review;
  concurrent duplicates produce one ACK and no financial changes.
- Hosted candidate/installed proof includes negative canonical chips, balanced
  transfers, final snapshots, injected failure/retry, zero-net settlement and
  immutable financial-owner hashes using the existing canonical proof.
- Six browser groups pass actual Tri-Towers and Run21 renderer sequencing, phone
  direct entry/reload, desktop archive entry and two independent browser tabs.
  Pending-result phone screenshot was inspected. No gameplay/financial calls.
- Earlier Words gestures, amber pulse and 27 Quintzee pace/objective browser cases
  remain applicable; see `ASYNC_LIVE_WORDS_ZOOM_LOCAL.md`.

Evidence is under `qualification.local/async-combined/`: `finale-gate-*`,
`presence-finale-hosted-*`, `presence-hosted-*`, `combined-release-*`.
Proof sources are `dev/async-combined/finale-gate-proof.mjs`,
`finale-gate-browser.mjs`, `presence-hosted-proof.mjs` and
`supabase/delayed/finale-review-gate-proof.sql`.

## Publication checkpoint

The task owns `.git/ptown-publication.lock` in the shared Git directory. The main
integration worktree is clean at the baseline. Source scope excludes unpublished
platform/357/Holm work. Client integration, publication and exact-SHA receipt
verification are the remaining release steps; production smoke remains owner-pending.
No prior publisher rerun denial may be bypassed, and migration must not be reapplied
to repair a publisher receipt.
