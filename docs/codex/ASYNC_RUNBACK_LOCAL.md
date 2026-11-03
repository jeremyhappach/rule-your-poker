# Async Run It Back — local candidate, 2026-11-03

Implemented on `codex/async-run-it-back`, based on `origin/main` `31df2a89d`.
The original Six-Card Golf checkout and all its local changes are untouched.
Jeremy explicitly selected reuse of existing fields and frozen rules; no new
gameplay-option or user-notes editors are included.

## Behavior and ownership

- Both completed-session navigation paths reach the existing shared archive.
  Each match card opens the existing invitation form with a fresh draft identity.
- The final-results shortcut appears only after a successful finale ACK and a
  fresh authoritative history response naming this viewer as eligible.
  The existing parent row lock serializes ACKs. A private immutable receipt
  records the second fresh viewer, once; it never limits invitation creation.
- The archive's participant-checked `delayed_history_detail` supplies the source.
  `delayed_children.ordinal/game_type/stake/config` and
  `delayed_matches.real_money/policy_version` are authoritative.
  The other participant's UUID is preselected, with current human eligibility.
- The form preserves historical rules and stakes. Games may be added, removed,
  reordered or replaced; stakes, recipient and money mode remain editable.
  Current admission only accepts its fixed configurations. Incompatible saved
  settings remain visible and block sending until explicitly replaced or removed.
  Switching money modes on a runback retains copied stakes.
- Each draft stores its edits and exact submitted payload in account-scoped
  session storage. Ambiguous sends retain the same request UUID across reloads
  and lock editing until their outcome is recovered. Definitive SQL validation
  failures unlock correction. New archive clicks create new draft/request IDs.
- Opening/cancelling a draft performs no invitation or financial writes.
  Sending reuses `delayed_create`; explicit recipient real-money consent and
  `delayed_respond` remain unchanged. No financial authority is added.

## Changed paths and schema

Client: `AsyncInvite.tsx`, `AsyncHistory.tsx`, `ResultReview.tsx`,
`RunbackLink.tsx`, `pages/Delayed.tsx`, and `lib/delayed/{client,runback}.ts`
plus scoped control styling in `delayed.css`.

SQL: `supabase/delayed/runback.candidate.sql` adds the private RLS-protected
`delayed_runback_viewers(match_id PRIMARY KEY, viewer)` receipt and guarded
updates to three existing RPCs: `delayed_finale_ack`,
`delayed_history_detail`, and `delayed_create`. Create accepts optional exact
configuration assertions and rejects mismatches instead of silently replacing
them. Existing no-config ordinary invitations retain their behavior.
There are no financial, settlement, acceptance, scheduler or recovery changes.

Qualification sources: `dev/async-runback/{preimage.json,proof.mjs,browser.mjs,
fixture.tsx,transport.ts}`; component tests are adjacent to the affected files.

## Validation and limits

- Local PostgreSQL proof: 13 groups, including simultaneous ACKs and duplicate
  sends on independent connections, both money modes, both participant archive
  access, repeated intentional invitations, current eligibility, authorization,
  historical immutability, RLS/ACLs, unchanged financial/acceptance definitions
  and verified rollback/clone cleanup.
- All 26 existing real-money financial/admission/acceptance regression groups
  pass through actual local canonical financial functions and triggers.
- Final focused component suite: 66 passing tests covering ordinary creation, final-viewer gating, exact
  reconstruction, editing, incompatibility, eligibility, cancellation and lost
  response/reload recovery.
- Ten browser groups pass at 320×568, 390×844, 844×390 and 1280×800, with touch
  and standalone/PWA simulation, screenshots and no external requests or page
  errors. These use actual route/components and loopback synthetic transport;
  SQL proofs separately exercise the database authority. Physical Safari/PWA
  and production acceptance remain owner smoke.
- Application typecheck and production build pass; the full build ran 3,651
  application tests and 241 harness tests successfully. The final focused suite
  also covers validation-rejection correction and damaged persisted drafts.
  Local logs/screenshots: `qualification.local/async-runback/`.

Historical limits: the existing async contract has no persisted user notes or
editable gameplay-options schema. Unsupported fixed configurations require an
explicit user choice; no default replacement occurs. Finale ACKs already fully
consumed before installation are not backfilled with an invented shortcut owner;
both participants retain the archive action. No historical rows are mutated.

## Release hold and manual smoke

No push, merge, deployment, production migration or production-state write is
authorized or performed. The SQL is an uninstalled candidate, not a registered
migration. Release must register/package this transaction, recheck its exact
deployed preimages, install it before publishing the client, and verify installed
authority under explicit release authorization. No new staging environment is
required.

1. Complete a match with two humans. First viewer sees Back to Lobby only;
   second viewer sees Run It Back plus Back to Lobby. Reconnect and retry ACKs.
2. Use both completed-session navigation paths as each participant. Confirm the
   selected match's opponent, game order, rules, stakes and money mode.
3. Change games/order/stakes/recipient/money mode; cancel to the originating
   results/archive. Confirm no invitation or historical changes.
4. Send in both money modes. Double-tap and reload after a lost response: one
   invitation. Reopen the archive intentionally: a separate invitation is allowed.
5. Confirm the recipient still reviews the offer and explicitly accepts real
   money. Check unavailable settings/opponent handling and fresh New Async Match.
6. Repeat finale/archive/draft actions on physical iPhone Safari and installed PWA.
