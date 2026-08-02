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

- Reconciled all 244 deployed source migration versions and normalized SQL
  hashes against local files.
- Recovered 19 exact deployed migrations that were absent from Git.
- Applied the resulting source schema to the owned target with historical
  non-replay-safe cron mutations sanitized only for the baseline replay.
- Recorded the exact 244 source versions/statements in target migration history.
- Applied target migrations `20260802152940_bound_diagnostic_retention.sql`
  and `20260802165743_preserve_audit_session_history.sql`; the latter makes the
  audit/session-history exclusion explicit in the live purge definition.
- Proved pre-retention schema hashes equal for columns, constraints, indexes,
  policies, routines, triggers, and Realtime publication membership.
- Current target: 246 migration records, 20/20 application triggers enabled,
  no nonstandard trigger states, and 18 Realtime tables.

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

The following 20 tables match source counts and row-content manifests:

`chat_messages`, `chip_stack_emoticons`, `cribbage_events`,
`cribbage_hand_archive`, `custom_game_names`, `dealer_games`,
`dice_roll_audit`, `game_defaults`, `game_results`, `games`,
`geometry_overrides`, `player_actions`, `player_cards`,
`player_transactions`, `players`, `profiles`, `rounds`,
`session_player_snapshots`, `system_settings`, and `user_roles`.

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
- Entire target database size after the rehearsal: 26 MB.

### Edge Functions

Active on target:

- `enforce-deadlines` (`verify_jwt=false`), non-mutating missing-game boot check
  passed.
- `enforce-all-deadlines` (`verify_jwt=false`), deployed but deliberately not
  invoked against copied sessions.
- `generate-incident-report` (`verify_jwt=true`), retained emergency no-op.
- `generate-music` (`verify_jwt=false`).
- `generate-trivia` (`verify_jwt=false`).
- `reset-password` (`verify_jwt=true`).

Deferred:

- `voice-to-text`: still forwards user audio through `LOVABLE_API_KEY` and
  writes the excluded voice/runtime diagnostic pipeline.
- `finalize-voice-operations`: mutates the excluded voice diagnostic pipeline.

Custom third-party secrets were not copied. `LOVABLE_API_KEY`,
`ELEVENLABS_API_KEY`, and `RESEND_API_KEY` must not be put in Git. Provider
selection/secret entry is a later explicit gate; Lovable AI must be replaced
to meet the independence goal.

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

1. Decide providers and enter required function secrets directly in the owned
   Supabase project; replace the Lovable AI dependency.
2. Decide whether voice is in the initial cutover. If yes, explicitly approve
   its external-audio/data path and deploy/test the two deferred functions.
3. Create a preview runtime pointed at the owned target with the target's
   client-safe legacy anon key where current Bearer usage requires a JWT.
4. Smoke Auth sign-in, lobby/history, one fake-money game, one real-money game,
   Storage image rendering, deadline enforcement, and the Cribbage disconnect
   settlement contract against the target.
5. Freeze source writes, copy the final data delta, repeat manifests, and record
   database/Auth/Storage counts.
6. With explicit approval, change Vercel production environment variables,
   redeploy, and run the same production smoke.
7. Keep the source project unchanged for rollback until the owned deployment is
   accepted and a stable checkpoint is recorded.
