# Chess hotfix and held-turn replenishment — November 14, 2026

Jeremy explicitly requested publication of the client hotfix and replenishment of
all active turn timers before resume. This supersedes the earlier client publication
hold; it does not authorize resuming any real-money game. Physical iPhone/PWA
acceptance remains outstanding. All production games stay held during release.

## Release candidate

Branch `codex/chess-hotfix-release` starts from current main `05a9927e6`, retaining
the Words five-minute release and frozen legacy timing. The focused Chess runtime
changes from local `b20ce1a72` apply cleanly without the older release-document
overwrites. No original commit/history is rewritten.

Chess cancels stalled transport waits on background/reconnect/pageshow and replays
the original pending UUID. Canonical validation still owns legal moves. Live host
pause/resume uses the existing versioned RPC; guests request/cancel independently
of the active turn. The original $2 correction remains unchanged; details and all
identities are in CHESS_INCIDENT_20261113.md.

## Production clocks — applied and still held

Installed migration `20261114163234_audited_held_turn_clock_replenishment` adds
admin-only `admin_replenish_held_turns` with immutable private audit records. Request
`9e951957-bdc2-43dd-a6d4-81d7d8b482ce` recorded exactly seven entries:

| Game/child | Current actor | Full clock available |
|---|---|---|
| Live Chess `a29afbbb-4703-4cd3-8f7d-6dfda3c936c6` | mcru81 | 5 minutes, frozen |
| Restored Chess `8a4353ad-e06e-4fec-8131-094043c2c95b` | Hap | 5 minutes, frozen |
| Async Chess `8664c23c-2f3f-4d13-9415-46a431e964be` | TheOG | 36 hours to open, then 5 minutes |
| Legacy Words `38318206-7bd4-497d-8744-44af80c17a00` | TheOG | 36 hours to open, then frozen legacy 3 minutes |
| Quintzee `e5c6ddff-2129-49b7-9add-7183ec8816ca` | Hap | 36 hours to open, then 4 minutes |
| Quintzee `20699f74-72a4-44eb-9202-14d1cc8201dd` | TheOG | 36 hours to open, then 4 minutes |
| Quintzee `b3eaa096-8c36-472d-9982-c13f21cb307a` | TheOG | 36 hours to open, then 4 minutes |

Clocks are anchored to the existing hold time, so later canonical resume preserves
the full replenishment. Future turns receive their ordinary configured durations.
Existing time-bank usage, board positions, moves, scores, completed children,
balances and original settlement correction are untouched. No hold was closed.
The operation rejects changed identities, unheld/finished games and started scored
attempts. A unique hold/turn key prevents a second replenishment under another UUID;
same-UUID late replay returns the receipt without changing an active clock.

Candidate and installed rollback proofs passed: admin authorization, exact inventory,
atomic rollback after earlier targets updated, duplicate/conflicting/late replay,
immutable board/banks/history, completed-child preservation, canonical live/Async
resume with full clocks, and zero financial/result writes. Production verification
returned seven audit entries, zero unpaused active live money games and zero unheld
active Async money matches. Private audit tables intentionally have no client RLS
policies or table grants; security advisors were inspected.

## Validation and release evidence

The mobile Chrome fixture passed live/Async x drag/tap after resume on the incident
FEN, including pending-UUID recovery, Undo, legal commit and live pause/resume.
No physical iPhone or PWA has been represented as tested.

The initial full suite hit default five-second runner timeouts in animation-heavy
Words replay tests, cascading into later empty-DOM assertions. Both suites pass
with a longer execution allowance. Only their runner limit is now 20 seconds;
all gameplay timing and assertion boundaries remain unchanged. The complete
standard `npm run build` passed: TypeScript, 4,163 application tests, 241 harness
tests, 46 release-tooling tests, Vite and 89,949,461 static bytes under the unchanged
90 MB limit. Four mobile browser cases passed again on the integrated candidate.
No assertions were skipped. Deployment evidence is recorded below after publication.

Timer source/proof: `supabase/chess/replenish-held-turns.sql` and
`supabase/chess/replenish-held-turns-proof.sql`. The frozen proof requires the
pre-replenishment revisions and must not be rerun against the corrected inventory.
