# Async notification identity and Run21 control release

Jeremy selected the notification and Run21 fixes only from the Originals checkpoint on November 6, 2026. This release is based on 4a72affb6475f43318756a8c5c612eb127d9f6c2, branch codex/async-notification-run21-release, with checkpoint tag async-notification-run21-2026-11-06. Crib Lab/Chucky competitive code, schema, catalog entries and admissions are excluded; their incomplete work remains at f5b3ac766 on codex/originals-competitive-release.

## Behavior and authority

Existing turn pushes and bell rows now identify the recipient-specific opponent. UUID membership in the authoritative match selects the other participant; unavailable names use a generic fallback. The existing event, availability-cycle dedupe, notification revision/read state, match destination, subscriptions and preferences are retained. Active-user suppression applies to turn/last_call at both worker claim and final authorization. Quiet hours remain enforced.

Run21's Take Win/Give Up control keeps its eligibility styling while an action is pending. The native disabled state still prevents duplicate actions. Genuine rule, pause, deadline and result changes retain their previous eligibility behavior. Rules and scoring are unchanged. Shared component call sites cover Arcade, Live and Async.

## Validation

- 45 focused Vitest tests: bell notifications and Run21 presentation.
- 12 service-worker tests: two distinct opponents, duplicate receipts, match navigation, preferences/account binding and existing notification types.
- Edge browser proof, dev/run21/collect-stability.browser.mjs: three canonical placements retain the same button element, gold RGB(237,197,110), opacity 1 and no animation during pending. A real pause removes eligibility and dims the control.
- App TypeScript check and Vite production build passed. Existing chunk-size/mixed-import/Browserslist warnings remain.
- Candidate and installed hosted rollback proofs passed using supabase/notification-opponents/rollback-proof.sql. Both recipient positions, two opponents, push/bell identity, one availability cycle, safe outsider fallback, unchanged bell revision, quiet hours and active-user suppression were exercised. Additional checks confirmed service-only push RPC and private helper access.
- Installed migration: 20261107034130_async_turn_notification_opponents.
- Installed function hashes: claim f31e92f1a8d14c7488be104db801f458; authorize c36efb19988c7b0c911d7333cced3e04; bell edc0200b3b3069b9a5c6f1495a78ea67.
- Post-proof cleanup returned zero synthetic profiles and confirmed private.originals_release is absent.
- Supabase CLI is unavailable. The connector applied the approved migration; the local filename uses its actual server-generated migration version.
- Security advisor categories/counts were unchanged before/after. The existing [RLS-disabled policy advisory](https://supabase.com/docs/guides/database/database-linter?lint=0007_policy_exists_rls_disabled) for public.gameplay_transfer_pending_changes is unrelated to these function/presentation changes.

## Publication and owner smoke

Publication target is Vercel project prj_ZvtOJ7ybERSObtP2WuhackqaS8Ds, team team_nQciG8fmHnUCogRJ7jaWawHq, production branch main. The release must be verified by READY status and /build-manifest.json matching the checkpoint tag commit. The Git push uses the unchanged .codex/scripts/push-origin-main.cmd helper.

Owner smoke remains: reload the app, verify two Async opponents are named correctly in the bell and iPhone/Android pushes, tap to the correct match, then make repeated Run21 placements while Take Win is available. Confirm quiet hours and active-app suppression during normal use. No competitive game activation is included.
