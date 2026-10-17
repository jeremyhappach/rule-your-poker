# 11 Up three-minute rounds — 2026-10-17

Jeremy clarified that two minutes is too short, then approved the proposed
three-minute duration with unchanged scoring. The production v1 run's second
round had lasted exactly 120,000 ms; this is a duration change, not a timer-rate
repair.

`eleven-up/2` changes only `version` and `stageMs` (180,000). The frozen v1 factory
and existing admitted configurations remain intact. The new private admission
helper and Arcade select the same enabled rules registry entry. Multiplayer
configuration freezes it into the dealer game and match. Existing Arcade runs
continue with their original version. V1 and v2 leaderboard/PB groups stay
separate because the longer clock changes completion opportunity.

The first valid eleven or Pass starts the full three minutes. The 2.5-second
bell, 30-second ready period, five-second results and extra three-second clear
fanfare remain unchanged. Speed still starts at 5,000 and loses 100 per 2.4
seconds, reaching zero after two minutes. Pass, groups, scoring, round count,
bonus qualification, financial authority and recovery are unchanged.

Migration `20261017220602_eleven_up_three_minute.sql` guards the inspected
production configure owner before replacing its two admission lookups. It
installs v2 disabled. After client publication, `supabase/eleven-up/activate-v2.sql`
enables the single shared admission default. No worker update is required.
Run21/TriTowers sources and shared Arcade RPC definitions are unchanged.

Candidate and installed production rollback proofs passed, with synthetic
fixtures rolled back: winner, mixed/all tie, actual chips and canonical journal,
setup/action/late replay, authorization/stale commands, continuation/Session
Ended, zero-client recovery, immutable solo completion and zero solo financial
writes. `production-proof.sql` now checks admitted configuration parity;
`timing-v2-proof.sql` proves v1 retention, v2 expiry at exactly 180 seconds,
deadline/action priority, two-minute speed cutoff and unchanged intro/ready/hold.
The local runner exercises both proofs in one rollback transaction.

Validation passed: TypeScript, all 2,402 source tests, 241 harness tests,
production Vite build and the updated local production-shaped SQL runner.

Checkpoint: `eleven-up-three-minute-2026-10-17`. Owner smoke: refresh and start a
new game; confirm 180 seconds after the first submitted play or Pass in Arcade
and multiplayer. Existing games retain their frozen duration. Bell and clear
fanfare should sound and run as before. Owner smoke remains pending.
