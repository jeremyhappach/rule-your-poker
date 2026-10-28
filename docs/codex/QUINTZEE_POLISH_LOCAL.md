# Quintzee local polish — owner review, 2026-10-26

Publication is explicitly held. No push, merge into main, production migration, deployment, or admission change occurred in this pass. The prior /1 release is already complete per owner smoke; historical release notes remain preserved in stash `quintzee-published-evidence-before-local-polish`.

Candidate branch: `codex/quintzee-polish-local`, based on `03dbc92a1`. The Cribbage snapshot and old validation evidence are unrelated and excluded. See this checkpoint's commit for the exact local candidate.

## Implemented for review

- Arcade Classic Mode switch defaults off, remembers a per-user browser preference, and freezes cosmetic theme at admission. Actual GameBoard, authenticated service path, SQL run/results and leaderboard are used in the local harness.
- Existing Roll button says Start before each player's round, in the same location. Dice area is empty. No extra screen or overlay. Start begins the full 180-second gameplay clock; a separate fixed 30-second ready deadline prevents stuck admission. No extra wait between categories.
- New /2 shared rules preserve /1 functions byte-for-byte. Scoring formulas, bonuses and x100–x300 remain unchanged. /2 permits intentional zeros and removes the old automatic no-match ending. Historical /1 games retain their old authoritative rules.
- 1500ms aggressive rumble in both themes, transitional faces independent of final values, held dice stationary, category actions gated during animation. No prospective scores, legal-category hints or green checkmarks. Filled categories remain dimmed and disabled.
- Confirm 0 captures scope/revision, cancel sends nothing, confirmation is guarded against duplicate clicks and stale revisions.
- Current Golf/Battle31 admitted-fake-money policy governs timeout: mark canonical automatic/sit-out intent, start legally at the original deadline, then complete the active match even all humans away. No all-away pause or repeatedly renewed ready deadline. Explicit pause/reclaim is preserved; canonical postgame retains next-dealer eligibility. Real money remains rejected.

## Verified locally

- 16 focused tests passed, 0 failed, 0 skipped; application TypeScript and Vite production build passed. Final logs: qualification.local/quintzee/polish-{unit,types,build}.log.
- Transaction-contained database proof passed and rolled back: frozen /1 and settlement function hashes unchanged; ready/start clock separation, duplicate Start, stale zero rejection, legal positive/zero bot decisions, real-bot ready recovery, historical /1 action replay, takeover/reclaim, explicit pause, all-away autonomous settlement, real-money configuration rejection, solo expiry without a result, and 2/3/4-player winner/tie settlement/replay.
- Actual browser checks passed for both themes and real production components: remembered switch, empty Start, reload deadline preservation, 1500ms rumble/held die, zero cancel/commit, dim filled categories, multiplayer Start, paused reclaim without clock/state change, and solo startup expiry returning to the actual unranked leaderboard. Screenshots and receipts: dev/quintzee/evidence/polish/.
- Harness authentication uses synthetic local actors against an isolated PostgreSQL clone. It does not claim deployed authentication qualification. Broad unrelated suites and hosted /2 qualification were not run for this local review pass.

## Review

http://127.0.0.1:15298/dev/quintzee/production.html?user=b2fd1dc4-0c48-403f-8e8e-03bf4d139ef2&mode=pregame

The preview is loopback-only on JeremyLaptop and remains running. Choose Classic Mode on the pregame page to compare themes. Ready timer begins when Play admits the run, not while browsing this pregame page. Screenshots include pregame, blank Start, Confirm 0 and gameplay for both themes.

## Publication hold / next step

Owner preview acceptance is next. The SQL in supabase/quintzee/polish-v2.sql is a local qualification candidate, not an applied production migration. A future authorized publication must package a guarded /2 migration/admission transition, qualify installed/deployed authority and use normal exact-SHA CI/deployment/release-signal gates. No current runtime approval is pending and no action has an uncertain production outcome.
