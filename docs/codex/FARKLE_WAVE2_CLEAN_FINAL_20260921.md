# Wave 2 final qualification

**Qualified SHA:** `3d8a5f3db22f3e865fec9386840b9b90bf082199`

Branch: `codex/farkle-playable`. Product/proof source is unchanged from the
3-5-7 correction at `bb9b9ea3ff8fb4e7b385f2eaa108afd730ffbea6`; the intervening
commit records evidence only. This qualification pass made no product, test
assertion, migration, scoring-default, or production-setting changes. Evidence
commits after this SHA do not change the qualified executable state.

## Clean deterministic gate

The four files that failed in the previous full run each passed once in a fresh
isolated process, without inspecting or modifying their implementations:

| File | Passed tests | Run duration |
| --- | ---: | ---: |
| card-face contract | 2 | 13.20 s |
| Ante Up | 5 | 33.81 s |
| Run Back | 21 | 32.57 s |
| Add Transaction | 2 | 19.62 s |

The one clean complete application retry then passed **1,685 tests / 249 files**
in 191.10 seconds, using the existing runner settings and unchanged timeouts.
The prior six failures are classified as **likely suite-level contention/leakage**,
not individual demonstrated product defects. No deeper per-file investigation or
global-runner repair was needed after that full pass.

At the same SHA, the complete harness suite passed **241 tests / 12 files** in
7.08 seconds, `npm run typecheck` passed, and the Vite production build passed in
35.93 seconds. The existing chunk-size warning remains informational.

## Browser coverage and retry history

The five previously unrun terminal cases all passed at the qualified SHA:

| Game | Terminal/client/observer/cleanup result |
| --- | --- |
| Cribbage | Passed after the focused timing retry described below |
| Gin | Passed on its first reached-live attempt |
| Horses | Passed after one focused peer-capture retry |
| SCC | Passed |
| Yahtzee | Passed |

Cribbage first timed out during cold `/auth` navigation before game creation.
Its next attempt passed settlement, terminal UI, reconnect and cleanup, but one
peer-progress observation took 18,610 ms against the existing 15,000 ms limit.
The single focused retry of that reached-live timing failure passed unchanged;
maximum peer progress was 3,912 ms, with zero observer violations or progress
problems. Both distinct failures are retained in the timing history.

Horses first timed out observing the exact dice row for accepted roll 7. Its
general observer recorded all nine action receipts, zero violations/progress
problems and maximum peer progress of 2,771 ms. The one unchanged focused retry
passed exact dice capture, terminal settlement, both client assertions, observer
and cleanup. No contradictory authoritative evidence was observed. Both browser
failures are accepted as timing/observation flakes under the explicit policy;
no expectations were weakened.

The user explicitly authorized retaining the 15 unaffected seven-game passes at
`51ce9ffab7d2521f342f58f244237a22ae031611` and the passing corrected 3-5-7 terminal
proof on the `bb9b9ea3f` product/proof bytes. Together with these five cases, that
covers all **21 seven-game cases**. This is a documented risk-based qualification,
not a claim that all 21 were restarted together at this SHA.

The **13-case Farkle matrix** remains covered by its ten passing cases at
`852c22349` and three synchronized timeout/reclaim cases at `51ce9ffab` under
the same authorized reuse policy. See FARKLE_RISK_QUALIFICATION_20260921.md and
THREE_FIVE_SEVEN_TERMINAL_CORRECTION_20260921.md for the preserved prior evidence.

## Authority, release state and cleanup

The final isolated SQL run passed **158 assertions**, including seven-game
authority regressions and recovery/restoration, plus both commit-boundary
metadata verification executions. It ran between completed browser cases with
zero live game fixtures. No migration was applied or changed.

Read-only production verification matched all **384 function fingerprints,
owners, SECURITY DEFINER attributes, configuration and grants**. Production:

- `creation_enabled=false`
- `admin_only=true`
- `production_defaults_approved=false`
- Farkle defaults, games and terminal handoffs: zero

Every browser fixture was deleted by the canonical cleanup. Gin's append-only
replay stream was independently bound to exact session
`64fdfae4-38ba-45fe-9371-887c5418a014`, fake-money mode and both current synthetic
test users. Its one stream and 161 steps were deleted only in the isolated Docker
database, inside a locked transaction. Both immutable triggers were re-enabled
and asserted before commit; zero replay rows remain.

Final cleanup verified zero synthetic auth users, profiles and game fixtures.
Only the three expected private control rows and seven existing-game defaults
remain. All 384 local function definitions/security metadata match afterward.
This task's local frontend and scheduler are stopped. Preserved unrelated
generated snapshot/cache files remain uncommitted.

The remaining browser/cleanup/evidence work used the existing qualification-only
execution-budget exception. No product changes, new test assertions, migrations,
refactors, main integration or public enablement occurred under that exception.

## Evidence and handoff

Machine-readable manifest and sanitized proofs:
`supabase/farkle/wave2-qualification/20260921-clean-final/qualified-manifest.json`.
The directory includes isolated-test results, deterministic results, all five
terminal proofs, retry histories, SQL results, production metadata and cleanup.
Raw browser traces and full local logs remain ignored because traces can contain
authentication traffic.

**Wave 2 is qualified. Main integration remains held.** Production scoring
defaults remain unapproved and unseeded; creation remains disabled and admin-only.
