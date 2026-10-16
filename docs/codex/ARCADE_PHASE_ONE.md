# Arcade Phase 1 — October 16, 2026

Approved scope: nonfinancial Arcade foundation, lobby navigation, Run21 leaderboard and solo Run21. TriTowers and Yahtzee remain Coming Soon. Their gameplay policies are deferred; current TriTowers behavior is not an Arcade baseline.

## Authority and boundaries

Routes: /arcade → /arcade/run21 → /arcade/run21/run/:runId → the same leaderboard. Authentication and the existing release gate protect live runs. The existing fullscreen shell receives optional Arcade navigation/announcement content; multiplayer defaults remain unchanged. No PersistentTableShell, seat, session, dealer, wallet, stake or settlement provider is mounted.

The Vercel API validates the current Supabase user and active profile. Service-only RPCs own private runs, immutable frozen rulesets, idempotency receipts and immutable verified results. UUID ownership, revision CAS, request fingerprints and one active run per user/game prevent competing tabs from forking authority. The public realtime table contains only owner/run/revision. The response allowlist exposes the current card and already presented cards, never the deck.

The shared Run21 extraction is limited to pure scoreBoard, cryptographic shuffleCards and the board presentation type. Multiplayer match initialization, opponents, bot pacing, tie extensions, pause, settlement and continuation remain with their existing owners.

## Current shared policy — run21/2

Both new Arcade runs and multiplayer matches now freeze the mode-neutral `run21/2`
gameplay definition. Common board actions, card drawing, CSPRNG shuffle, scoring
and gameplay timing live under `src/lib/run21`; Arcade owns solo progression only.
The earlier Arcade board versions below remain separately readable and unchanged.
See [shared gameplay contract](SHARED_GAMEPLAY_RULES.md) for the standing rule and
qualification. This supersedes the earlier Arcade-only default without changing
the approved segmented clock or multipliers.

## Prior frozen competitive policy — run21/arcade-2

Accepted P-Town timing approximation, not a claim of recovered Merit machine timing: the clock begins when the 2.5-second intro ends, before any placement. Speed starts at 280, loses 2 per completed 420 ms tick until 200 at 16,800 ms, then loses 2 per completed 900 ms tick until zero at 106,800 ms. Shared configuration-driven `speedAt` drives both display and scoring; animation never pauses this clock. Multipliers remain 97→50, 98→100, 99→150, 100→200, 101→250, 102→300, 103→400, 104→500, 105→1,000.

The database checks the saved deadline after acquiring the run lock. A new action arriving at or beyond that deadline cannot earn points or replace the timeout; the service catches up to a zero-point timeout. Three rounds progress automatically, including untouched rounds, with the existing result hold and intro. No pause, first-placement allowance/expiry branch, or tie extension applies. Explicit Abandon remains the existing unranked exit.

The migration stages arcade-2 disabled. Publish the compatible app and bundled recovery worker, then execute `supabase/arcade/activate-run21-scoring.sql`. This switches defaults atomically while preserving frozen historical and active arcade-1 runs. The leaderboard defaults to the enabled version and provides an explicit legacy selector. No multiplayer ruleset or admission default changes.

Qualification: `node dev/arcade/proof.mjs --installed --scoring --scoring-installed` covers the installed definitions, rollback/idempotence, history preservation, deadline races, cold recovery, replay and board separation; `node dev/arcade/browser.mjs --scoring` covers the real page flow. Evidence is stored in `dev/arcade/scoring.*.json` and `dev/arcade/scoring-browser.evidence.json`.

Owner smoke: start a new Arcade run and confirm arcade-2, speed 280 after the intro, no first-placement allowance, speed 200 at 16.8 seconds, and automatic zero at 106.8 seconds. Reload mid-round and verify the same clock; leave the run unattended and confirm exactly three results. Switch to the legacy leaderboard and verify prior scores remain there. Presentation/artwork changes are deferred.

## Legacy frozen competitive policy — run21/arcade-1

A run freezes its entire configuration and immutable ruleset identity at creation: exactly three rounds, five columns, target 21, one pass, existing multipliers and speed scoring, 250-second started-round duration, 30-second first-placement allowance after each 2.5-second intro, and a five-second result hold. The existing 104/105 medals receive their full 2.8/3.8 seconds before the five-second score presentation.

The server catches up at persisted boundary times. A started-round timeout retains existing Run21 timeout scoring. After the result hold the next round starts automatically with its normal intro. No Next Round or pause commands exist. First-placement expiry ends the entire run unranked without playing remaining rounds. Explicit abandonment is unranked. Ordinary automatic progression does not disqualify a run. The third result atomically completes the run without a tie extension or browser callback.

A five-second database dispatch invokes arcade-recovery with a short-lived, single-use private token. The worker runs the same reducer as the API. New runs require a recent successful recovery heartbeat. Existing runs catch up from their real deadlines after worker interruption; elapsed time is never reset. Browser focus/online/realtime events and a single fetch at each persisted deadline reload authority, keeping connected intros timely. Display animation never advances gameplay and no browser is required for progression.

## Leaderboards

Only immutable completed results qualify. The default rolling 30-day window uses server completion time. All Arcade games rank individual verified results, including multiple entries from one player. Show at most ten entries, ordered by score descending, then completion time ascending and run UUID. Equal scores share competition rank (1, 1, 3); the same deterministic ordering resolves a tie crossing the ten-entry display cutoff. Outside the top ten, show the current user's highest-ranked qualifying entry, identified by run UUID. Completion feedback reports that run's rank separately from the user's best-entry rank. The permanent personal best is for the current competitive version, and previous-version bests remain visible separately. Incompatible rules never share a board. Lower subsequent scores do not overwrite a personal best.

## Completion presentation and records

The completion transaction freezes a record receipt against the prior compatible all-time maximum, explicitly excluding the current run. First scores establish the baseline; equal scores match but do not break a record. Only a strictly higher score with an existing prior best earns NEW PERSONAL BEST. Old immutable results retain null metadata and still qualify for ranking and future comparisons.

Solo Run21 finalizes immediately at round three. After the existing medal/score transfer, live connected presentation shows TOTAL SCORE for 2.5 seconds, with a prominent record treatment when applicable. Refresh/reconnect catch-up skips this presentation; interruption retires it. It never gates persistence or recovery. Shared Run21 count-up audio follows the displayed score phase through the application audio manager, honors saved sound/unlock policy, and cancels on unmount, mute, backgrounding or interruption. Missed ticks are never replayed.

## Qualification

- dev/arcade/proof.mjs: disposable loopback clone of deployed canonical schema, candidate DDL rollback check, actual roles, private access denial, disabled-user authorization, immutable rules, create/action replay, mismatched and stale commands, independent-connection CAS, atomic finalization with injected failure, successor isolation, first-placement expiry, explicit abandonment, worker token replay, fresh-process third-round recovery, ties, rolling windows, version separation and outside-top-10 rank.
- All 97 preexisting public/private tables are guarded against writes during Arcade flows; existing canonical financial triggers remain enabled. Fixtures are disposable and historical production rows are untouched.
- src/lib/arcade/run21.test.ts compares solo and multiplayer scoring over 50 deterministic decks and proves timeout/intro/progression/privacy boundaries.
- dev/arcade/browser.mjs exercises the real client/page/reducer with loopback SQL and substitute auth/realtime. Phone, desktop, landscape, reload, automatic three-round progression and abandonment.
- Production publication and Jeremy's subsequent authenticated smoke are tracked in CURRENT_RELEASE.md. Local qualification does not claim production gameplay acceptance.

The local runner uses the existing ignored qualification.local PostgreSQL installation on port 55439; it installs no dependencies. Its cron stub replaces scheduling only. Production uses pg_cron and pg_net plus the deployed Edge worker. Recovery deployment source is bundled from supabase/functions/arcade-recovery/index.ts, sharing the exact reducer.
