# Approved production defaults — blocked before apply

Jeremy approved the production scoring/defaults and admin-only enablement on
September 21, 2026. Main remains `3d8a5f3db22f3e865fec9386840b9b90bf082199`,
published and READY. The current uncommitted candidate is on
`codex/farkle-production-defaults`.

The data-only candidate is
`supabase/migrations/20260922011029_farkle_approved_production_defaults.sql`.
It uses the existing creation/recovery advisory lock, seeds the approved scores,
target 10000, Equal Turns, Balanced/500, and inherits the schema timing defaults
(10 seconds, 2.0 seconds) without changing other game defaults. The small client
candidate admits admin production setup through the existing configuration RPC
and displays server defaults. None of this candidate has been published/applied.

## Reproduced authority boundary

The rollback proof reached the actual `configure_dealer_game` insertion and
failed with `farkle:invalid_frozen_config` in
`private.farkle_config_guard_v1()`.

The deployed `private.farkle_resolve_config_v1(public.games,jsonb)` builds
`botDelayMs` from `defaults.bot_decision_delay_seconds * 1000`.
The source column is numeric with scale: `2.0 * 1000` yields JSON numeric
`2000.0`. PostgreSQL `->>` returns the exact text `2000.0`.
The frozen-config guard requires `^[1-9][0-9]*$`, so it rejects that value.
A direct read-only expression check returned `integer_text_valid=false`.
This is a production-resolution defect, not a scoring or browser assertion defect.
Prior TEST ONLY configurations supplied integer milliseconds and did not expose it.

The proof transaction rolled back. Subsequent inspection confirmed:
creation_enabled=false, admin_only=true, production_defaults_approved=false,
and zero Farkle game-default rows. No migration history was changed.

## Smallest proposed correction

Use a new additive Farkle-only migration to normalize an exactly integral
millisecond delay to integer JSON inside the production branch of
`private.farkle_resolve_config_v1`. Preserve its identity/release/configuration
checks, the strict frozen-config guard, and the numeric delay's duration.
Do not change shared owners or historical migrations.

Capture the existing definition/metadata and executable restoration, then rerun
the focused defaults proof including production-shaped numeric timing,
canonical admin setup, nonadmin rejection, frozen rules and idempotency. Continue
focused client tests, typecheck/build, apply and admin browser smoke only after
that correction is approved and the proof passes.

The current focused SQL proof is incomplete/failed; no tests or release gates are
claimed green. No further authority implementation or production apply was attempted.
