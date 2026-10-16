# Arcade Phase 1 — October 16, 2026

Approved scope: nonfinancial Arcade foundation, lobby navigation, Run21 leaderboard and solo Run21. TriTowers and Yahtzee remain Coming Soon. Their gameplay policies are deferred; current TriTowers behavior is not an Arcade baseline.

## Authority and boundaries

Routes: /arcade → /arcade/run21 → /arcade/run21/run/:runId → the same leaderboard. Authentication and the existing release gate protect live runs. The existing fullscreen shell receives optional Arcade navigation/announcement content; multiplayer defaults remain unchanged. No PersistentTableShell, seat, session, dealer, wallet, stake or settlement provider is mounted.

The Vercel API validates the current Supabase user and active profile. Service-only RPCs own private runs, immutable frozen rulesets, idempotency receipts and immutable verified results. UUID ownership, revision CAS, request fingerprints and one active run per user/game prevent competing tabs from forking authority. The public realtime table contains only owner/run/revision. The response allowlist exposes the current card and already presented cards, never the deck.

The shared Run21 extraction is limited to pure scoreBoard, cryptographic shuffleCards and the board presentation type. Multiplayer match initialization, opponents, bot pacing, tie extensions, pause, settlement and continuation remain with their existing owners.

## Frozen competitive policy

A run freezes its entire configuration and immutable ruleset identity at creation: exactly three rounds, five columns, target 21, one pass, existing multipliers and speed scoring, 250-second started-round duration, 30-second first-placement allowance after each 2.5-second intro, and a five-second result hold. The existing 104/105 medals receive their full 2.8/3.8 seconds before the five-second score presentation.

The server catches up at persisted boundary times. A started-round timeout retains existing Run21 timeout scoring. After the result hold the next round starts automatically with its normal intro. No Next Round or pause commands exist. First-placement expiry ends the entire run unranked without playing remaining rounds. Explicit abandonment is unranked. Ordinary automatic progression does not disqualify a run. The third result atomically completes the run without a tie extension or browser callback.

A five-second database dispatch invokes arcade-recovery with a short-lived, single-use private token. The worker runs the same reducer as the API. New runs require a recent successful recovery heartbeat. Existing runs catch up from their real deadlines after worker interruption; elapsed time is never reset. Browser focus/online/realtime events and a single fetch at each persisted deadline reload authority, keeping connected intros timely. Display animation never advances gameplay and no browser is required for progression.

## Leaderboards

Only immutable completed results qualify. The default rolling 30-day window uses server completion time. Each player contributes their best eligible score; ties share rank, with completion time and UUID giving deterministic display order. Top 10 plus the current player's rank outside that list. The permanent personal best is for the current competitive version, and previous-version bests remain visible separately. Incompatible rules never share a board. Lower subsequent scores do not overwrite a personal best.

## Qualification

- dev/arcade/proof.mjs: disposable loopback clone of deployed canonical schema, candidate DDL rollback check, actual roles, private access denial, disabled-user authorization, immutable rules, create/action replay, mismatched and stale commands, independent-connection CAS, atomic finalization with injected failure, successor isolation, first-placement expiry, explicit abandonment, worker token replay, fresh-process third-round recovery, ties, rolling windows, version separation and outside-top-10 rank.
- All 97 preexisting public/private tables are guarded against writes during Arcade flows; existing canonical financial triggers remain enabled. Fixtures are disposable and historical production rows are untouched.
- src/lib/arcade/run21.test.ts compares solo and multiplayer scoring over 50 deterministic decks and proves timeout/intro/progression/privacy boundaries.
- dev/arcade/browser.mjs exercises the real client/page/reducer with loopback SQL and substitute auth/realtime. Phone, desktop, landscape, reload, automatic three-round progression and abandonment.
- Production publication and Jeremy's subsequent authenticated smoke are tracked in CURRENT_RELEASE.md. Local qualification does not claim production gameplay acceptance.

The local runner uses the existing ignored qualification.local PostgreSQL installation on port 55439; it installs no dependencies. Its cron stub replaces scheduling only. Production uses pg_cron and pg_net plus the deployed Edge worker. Recovery deployment source is bundled from supabase/functions/arcade-recovery/index.ts, sharing the exact reducer.
