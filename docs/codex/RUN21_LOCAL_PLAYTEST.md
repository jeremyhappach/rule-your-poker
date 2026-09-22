# Run21 local playable checkpoint

This work is on `codex/run21-app-test-reconciled`, following reconciliation commit `8353b340f4da43d5a884cd5c3376152cecc69bfb` and the accepted qualified baseline `fce43e29a4419f06908f7694d81782ae67d7d2b1`. It is ready for local play-testing, **not broad release qualification**. The archived app-test branch, isolated Run21, main, Farkle branches and production were not integrated or deployed.

## Start the prepared local worktree

Keep Docker Desktop running. In PowerShell:

```powershell
Set-Location 'C:\Users\jerem\Desktop\poker\run21-app-test-reconciled'
npm run dev:run21 -- --enable-local-run21
```

Open **http://127.0.0.1:4322/**. Sign in as `run21@local.test` using the password in the ignored local file `qualification.local/playtest-login.json`. The account exists only in this disposable database. Passwords and service keys are not committed.

The launcher uses the already installed CLI and the prepared, unlinked `qualification.local/local-stack` project `run21-reconciled` (API 65321, database 65322). It refuses a migration-history mismatch and does not install tools, repair history or replay migrations. `npm run dev:run21 -- --check` checks the prepared stack. After the first explicit local opt-in, `npm run dev:run21` restarts it. If port 4322 is already serving this checkpoint, use that server instead of launching a second copy.

`--enable-local-run21` opts in **only this disposable local admin fixture**; it also prevents a bot from automatically choosing Holm during the initial dealer setup. Tracked creation defaults remain disabled. The local gate's `qualified` bit is an operator prerequisite for this sandbox, not a claim of release qualification. Real-money sessions, non-admin creation, known production projects and deployment execution remain excluded. Only the existing recovery cron command is enabled locally; historical outbound jobs remain inactive.

## Play

1. Create a new **fake-money** session, use **Add Bot**, then **Start Game**.
2. Choose **Other → Run21**, enter the normal match stake, and start.
3. Tap a column to place the face-up card. The first placement starts that player's timer; the opening card and Pass do not. The deck uses the canonical back. Pass is available once per round, with no discarded-card display. Collect Win becomes available at an aggregate of 97 or more.
4. After both players finish, inspect the revealed boards and choose **Next round**. Three rounds determine the winner; a tied total continues into sudden death. Busts and expired boards score zero.
5. Use the standard History tab to inspect the recorded match and open its replay in the same felt. After settlement, **Finish match** enters the shared Session Ended phase with the isolated result; refreshing an ended session returns to the lobby.

The initial slice supports one authenticated local human administrator and one bot in a fresh session. Other human/observer participation and continuation into another dealer game are not exposed in this checkpoint. Close the match and create a new session to play again.

From the lobby, **Profile Settings → Geometry Lab → Section: Run21 → Gameplay Artifacts** exposes the same five `run21.*` descriptors used by the live felt. It uses the existing draft/save workflow.

## Authority and isolation

The Vite development-only Node server authenticates the real local JWT and admin/participant identity before every request. It owns time, cryptographic shuffling, engine commands and autonomous bot scheduling. The bot sees only its own projection. PostgreSQL stores private state and deadlines, serializes commits by revision, and atomically records the single settlement receipt and isolated balance changes. Clients submit intent, round identity, revision and request UUID; they cannot supply authority time or another player's identity. Reconnect and server restart recover persisted state and missed deadlines.

The browser receives only the authorized projection. Opponent cards stay private until the round reveal. SSE transports committed updates; reconnect timers do not advance gameplay. The canonical `Game.tsx` shell owns the table, seat ring, announcements, HUD, history tabs and terminal admission. Run21 fills those slots without mounting another table.

Migrations `20260921213310_run21_local_authority.sql` and `20260921221208_run21_local_fixture_cleanup.sql` add the private Run21 store, service-only commit/read/close RPCs, guarded admin setup and cleanup dependencies. They do not replace existing functions or write account/player-transaction/gameplay-transfer ledgers. Settlement is one isolated stake credit/debit with one unique receipt. The existing fake-session cleanup API removes these fixtures; its complete deletion and rollback were proved. Replay contains authentic recorded game frames and the isolated receipt; it deliberately declares `settlement_receipt_only`, not complete financial-ledger evidence.

## September 21, 2026 evidence

- Reconciliation: one fresh **392/392** replay, **1,760 application tests**, **226 harness tests**, typecheck/build, gate proof and zero-error lint/advisors. The accepted two-replay baseline and 67-proof campaign were not repeated.
- Local slice: head **394/394**, exact ordered migration history. All **391** qualified migration files remain byte-identical; all **501** function catalog fingerprints from reconciliation remain identical. Both `.gitattributes` files and protected Farkle SHA-256 `c6a971f55b79765ef7659d7803e0408925df86b9d9b7d2a2cd8379863c5771d7` are preserved.
- **172 focused tests** passed for Run21 engine, server authority, privacy, dedupe, persisted expiry, bot, reveal, replay, sudden death, routing and setup. Additional handoff, isolated-seat balance, local target and Geometry Lab tests pass. The terminal regression refreshes the same receipt after close and proves it cannot reopen the presentation hold; existing Gin/Cribbage/Yahtzee seat-money inputs remain intact.
- Real authenticated API match `7697b991-5654-4cca-ae78-f3904068698a`: canonical session/bot/setup paths, autonomous bot commits with no client input, duplicate Pass, impersonation rejection, collect at 97, three rounds, one receipt `d669d025-5bb7-4b08-8ecc-4f7cdf536355`, matching recorded replay, isolated -5/+5 and unchanged public money rows.
- Real browser match `81a4b17b-2431-4228-bed7-598627e6987b`: normal Other/stake/bot setup, 20 button actions over all three rounds, persisted reload, genuine deadline expiry, one canonical shell, recorded History/replay, Session Ended and ended-refresh-to-lobby. No page errors. An additional browser pass verified the final result and seat balances agree at -5/+5. Automated UI play expired; the separate API match exercised real collect scoring. No clocks or results were fabricated.
- Browser checks also opened all five Run21 artifacts in the shared Geometry Lab without saving changes. Existing Holm and Yahtzee sessions reached `in_progress` with one canonical shell, no Run21 gameplay mount and no page errors.
- Final application and server typechecks, production asset build and `git diff --check` pass. The existing bundle-size warning remains. The documented launcher successfully restarted the prepared stack and server; its independent check reports 394/394. The staged SQL matches the applied source bytes with LF endings; built assets and the staged diff contain no private service key.
- The SQL rollback proof passes private-table RLS/client denial, service-only grants, fake-money isolation, receipt agreement, no account transactions, fail-closed gate and canonical fixture cleanup. Its rollback restores the retained play-test fixtures.
- The authentic local `advance-due-game-state-1s` job ran `CALL private.run_game_recovery_batch();` successfully. No scheduler history was synthesized.
- Database lint: **zero errors**, 311 existing warnings, no Run21 function findings. Advisors: **zero errors**, 300 findings at capture. Run21 informational findings are intentional RLS with no browser policies and an unindexed first-round cleanup foreign key; no broad baseline-warning work was undertaken.

Ignored receipts are under `qualification.local/`: reconciliation reports, `vertical-focused.log`, `vertical-ui-tests.log` / `vertical-ui-retry.log`, `live-run21-proof.json`, `browser-full-match.log`, `browser-ended-balance.log`, `vertical-checkpoint-evidence.json`, exact catalogs and screenshots. Local fixture credentials and raw operational state stay ignored. This checkpoint stops before broad release qualification and production deployment.
