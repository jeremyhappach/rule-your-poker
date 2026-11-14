# P-Town Chess bots — November 13, 2026

Approved: one human versus one bot in live fake-money Chess. Game Defaults offers
Easy / Medium / Expert, default Medium. Configuration freezes bot policy version
`ptown-chess-bot/1` and difficulty before ante; later defaults edits cannot change
an active game. Human-only live/Async, real-money rules and existing clocks remain.

## Ownership

`server/chess/bot.ts` searches legal actions through the existing `playChess`
reducer, including captured-piece revival, castling, en passant and draw rules.
Easy searches one ply, Medium up to two, Expert up to four, with 120/900/3500 node
limits and a 600 ms work budget. Only completed search depths replace the chosen
move. These are relative policy levels, not rated Elo or a grandmaster claim.
Search has no authoritative write or financial result of its own.

The five-second `chess-bot-recovery` scheduler adapts the existing Canasta lease:
database-issued expiring token, one claimed due match, service-only load/commit,
successful completion heartbeat. `supabase/functions/chess-recovery` runs the same
server policy/reducer without a connected browser. Work is bounded to one match
per wake. Expected reply delay includes the scheduler and queue; no client timer
advances the bot. Pause, stale revisions and expired turns are rechecked in SQL.

Human and bot commits share `private.chess_commit_impl`, extracted from the exact
installed human commit. Human authorization remains in the public wrapper;
the bot wrapper requires its live lease, exact bot player UUID and fake money.
Identity, history, rules, frozen difficulty, revision and request receipts remain
guarded. Existing Chess settlement/postgame functions are unchanged.

New bot admission requires the enabled flag and a healthy scheduled worker.
Closing admission does not stop already-admitted bots. Async bots and all-bot
games remain rejected. The existing Add Bot, consent, seat identity, Chess board,
move animation and Session Ended owners are reused.

## Qualification and release

Migration `20261114024027_chess_fake_money_bots.sql` is installed. Candidate and
installed hosted rollback proofs passed without retaining synthetic rows or
changing customer games. They cover human fake/real winner/tie/ledger and Async,
all three bot levels, frozen defaults, closed/real-money rejection, canonical bot
consent, lease authorization/claim/replay, pause, stale/conflicting/late requests,
actual 95/105 or 100/100 chips, balanced transfers, snapshots and continuation.
The unchanged human proof also injects failure after chip writes to prove rollback.

Disposable local PostgreSQL tests run the actual server worker and human authority:
legal openings, human reply, autonomous bot reply and checkmate for all levels.
Independent connections race the same commit; exactly one move and payout result.
The disposable database is removed after each run.

Focused tests: 59 across bot policy/worker, shared rules, human operation and
catalog. Full build: 4,156 application tests in 569 files, 241 harness tests,
46 release-tooling checks, TypeScript, Vite and unchanged 90 MB static gate
(89,946,190 bytes). No dependency installation or rule/clock/settlement change.

Browser evidence uses the actual Game Defaults component and worker-generated
positions at 390×844, 844×390 and 1440×900. It checks all levels save/reopen and
the board remains within the viewport. Local browser requests are fixture-only.
Evidence: `qualification.local/chess-bots/{local,browser}.json`, screenshots and
`release-build.log`. Physical phone/production gameplay smoke remains Jeremy's.

Worker version 1 is deployed and completing successful scheduled health checks.
Bot admission is enabled and the stored default is Medium. Client publication is
pending.
Smoke: set each level in Game Defaults; add one bot to a fake-money table, select
Chess, play and reload during a bot turn; verify a legal reply, unchanged pause,
move animation and payout/Session Ended. Human live/Async still works normally.

## Files

- Defaults/catalog: `src/components/GameDefaultsConfig.tsx`,
  `src/lib/gameCatalog/games/chess.ts`.
- Shared policy configuration/admission: `src/lib/chess/botConfig.ts`, `rules.ts`;
  tests: `src/lib/chess/bot.test.ts`.
- Server: `server/chess/{bot,recovery}.ts`,
  `supabase/functions/chess-recovery/index.ts`.
- Database: installed migration above, `supabase/chess/{bot-recovery.sql,
  bots.candidate.sql,bots-proof.sql}`.
- Qualification: `dev/chess/{bots-installed.json,prepare-bots.mjs,bots-local.mjs}`,
  `dev/chess-bots/{index.html,preview.tsx,client.ts,browser.mjs}`.
- Release memory: this report, `CURRENT_RELEASE.md`, `REPO_MAP.md`.

The separately committed Words five-minute request is queued in BACKLOG.md.
