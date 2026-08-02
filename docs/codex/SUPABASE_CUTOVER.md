# Owned Supabase cutover

Date: 2026-08-02

## Current boundary

- Source/production backend: Lovable-backed Supabase project
  `ehccrxumpibuoehfsmms`.
- Owned rehearsal target: `ptown-poker-prod`, project
  `xvhmbuppghwmwpwrkzao`.
- Frontend publication: GitHub `main` -> Vercel production.
- Production Vercel environment: unchanged; still points to the source backend.

Nothing in the core rehearsal is authorization to change Vercel's backend
variables or modify/delete source data.

## Rehearsal evidence

### Schema and migrations

- Reconciled all 245 deployed source migration versions and normalized SQL
  hashes against local files.
- Recovered 19 exact deployed migrations that were absent from Git.
- Applied the resulting source schema to the owned target with historical
  non-replay-safe cron mutations sanitized only for the baseline replay.
- Recorded the original 244 source versions/statements in target migration
  history, then applied the common cutover-readiness migration to both source
  and target as version `20260802184800`.
- Applied target migrations `20260802152940_bound_diagnostic_retention.sql`
  and `20260802165743_preserve_audit_session_history.sql`; the latter makes the
  audit/session-history exclusion explicit in the live purge definition.
- Applied target migration
  `20260802174956_restore_public_data_api_grants.sql`, restoring the source's
  current-object Data API grants while preserving RLS and anonymous read-only
  access to `games`. Default privileges remain unchanged so future public
  tables must declare their grants explicitly.
- Applied `20260802184800_cutover_readiness.sql` to both backends. Its lock is
  off by default; 47 public-table statement triggers plus restrictive Storage
  policies block writes when enabled, while an explicit session-local bypass
  supports the controlled final import. Rollback proofs showed both schemas
  install the same guards and that normal writes block before any row mutation.
- Proved pre-retention schema hashes equal for columns, constraints, indexes,
  policies, routines, triggers, and Realtime publication membership.
- Current target: 248 migration records, 20/20 application triggers enabled,
  47 inert cutover guards, no nonstandard application-trigger states, and 18
  Realtime tables.

Gameplay cron remains disabled. Target cron contains only
`purge-expired-diagnostics-daily` at `15 4 * * *`.

### Auth

- 11/11 users copied with source password hashes unchanged.
- 11/11 identities match source.
- Sessions and refresh tokens are zero by design. Existing users sign in again
  after cutover; they do not reset passwords.
- MFA assurance claims, one-time tokens, and old sessions are not portable
  authority and were not copied.

### Retained application data

The initial rehearsal proved source row-count and per-row manifests for these
20 retained tables before the approved fake-money cleanup:

`chat_messages`, `chip_stack_emoticons`, `cribbage_events`,
`cribbage_hand_archive`, `custom_game_names`, `dealer_games`,
`dice_roll_audit`, `game_defaults`, `game_results`, `games`,
`geometry_overrides`, `player_actions`, `player_cards`,
`player_transactions`, `players`, `profiles`, `rounds`,
`session_player_snapshots`, `system_settings`, and `user_roles`.

The owned target now intentionally diverges from source session history. The
verified purge deleted all 177 fake-money games plus 20 fake-linked and 135
orphan Cribbage archives. It retained 179 real-money games, 168 real-money
Cribbage archives, 331 financial transactions, 4,847 profiles, and all 11 auth
users. The source backend was not purged and remains the rollback authority.

`chat_messages.chat_operation_id` is intentionally null on the target because
the associated operation/diagnostic pipeline was excluded; message content and
history remain intact.

Persisted chat diagnostics, client-runtime incidents/events, debug logs,
network simulations, dice/performance/timing traces, voice operation telemetry,
and `session_events` are not part of the core data copy. A small set of baseline
verification rows remains retention-bound and will expire through the normal
seven-day purge.

### Storage and size

- Public bucket `chat-images` exists with the source policies.
- Five object paths, MIME types, and byte sizes match source.
- Object bytes total 4,526,239.
- Entire target database size after readiness cleanup: 31 MB.

### Edge Functions

Active on target:

- `enforce-deadlines` (`verify_jwt=false`), non-mutating missing-game boot check
  passed.
- `enforce-all-deadlines` (`verify_jwt=false`), deployed but deliberately not
  invoked against copied sessions.
- `generate-incident-report` (`verify_jwt=true`), retained emergency no-op.
- `generate-music` (`verify_jwt=false`).
- `generate-trivia` (`verify_jwt=true`) is a 410 retired tombstone with no
  external-provider call; trivia source/routes/components were removed.
- `reset-password` (`verify_jwt=true`).
- `voice-to-text` (`verify_jwt=true`) calls OpenAI's audio transcription API
  with `gpt-transcribe` and persists no diagnostic or audio data.

`finalize-voice-operations` is retired and is not deployed on the target.

Custom third-party secrets were not copied. `OPENAI_API_KEY`, the production
email/SMTP credentials, and any retained music-provider secret must be entered
directly in their owning service and must not be put in Git. Voice will return
503 until `OPENAI_API_KEY` is present.

## Diagnostic posture

- Dice snapshots are off by default; explicit `dice` debug-channel or URL
  enablement is required.
- The canonical in-memory lifecycle ledger remains available, while persistent
  lifecycle events require the explicit `events` debug channel.
- `purge_expired_diagnostics(interval)` is service-role-only and clamps
  retention to at least one day. The scheduled production value is seven days.
- Gameplay, chip, financial, audit, snapshot, and session-result records are
  outside the purge function.

## Advisor baseline

The target exactly inherits broad source-schema advisor debt. The rehearsal did
not change RLS/RPC authority to silence warnings because that would be a
separate security/behavior migration.

- Security: 106 warnings (mutable search path, permissive RLS, public bucket
  listing, exposed SECURITY DEFINER functions, and leaked-password protection).
- Performance: 218 notices/warnings (unindexed foreign keys, auth RLS initplans,
  unused indexes on the fresh target, and multiple permissive policies).

Reference remediation:

- <https://supabase.com/docs/guides/database/database-linter>
- <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection>

## Gates before production cutover

1. Enter `OPENAI_API_KEY` directly in the owned Supabase project and configure
   production email/SMTP credentials; then smoke voice transcription and
   password reset. The direct OpenAI voice path is approved and deployed.
2. Decide whether `generate-music` remains in the initial cutover and, if so,
   enter/test its provider secret. Trivia and its provider dependency are
   retired.
3. **Complete 2026-08-02:** Vercel branch `codex/supabase-preview` is scoped to
   the owned target with the client-safe legacy anon key. The protected preview
   is
   <https://ptown-poker-git-codex-supabase-preview-jeremy-8e2b.vercel.app>,
   and its exact hostname is allowed in Supabase Auth. Production remains on
   the source backend.
4. Smoke Auth sign-in, lobby/history, one fake-money game, one real-money game,
   Storage image rendering, deadline enforcement, and the Cribbage disconnect
   settlement contract against the target. Signed-in lobby loading is complete;
   the create-game failure caused by missing new-project Data API grants was
   corrected, and Jeremy reported the create-game/game-entry rerun clean on
   2026-08-02. The remaining enumerated coverage is still required before this
   gate is complete.
5. Enable the common source/target write lock, copy the final real-money data
   delta through the explicit import bypass, repeat manifests, and record
   database/Auth/Storage counts. Keep fake-money session history excluded.
6. With explicit approval, change Vercel production environment variables,
   redeploy, and run the same production smoke.
7. Keep the source project unchanged for rollback until the owned deployment is
   accepted and a stable checkpoint is recorded.
