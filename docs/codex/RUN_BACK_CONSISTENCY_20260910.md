# Run Back consistency — September 10, 2026

Status: Jeremy approved fixing Run Back and checking all seven games. Implementation, typecheck, production build, 1,564 app tests and 131 harness tests pass. Live qualification pending.

The retained Yahtzee failure on c83fc7485 submitted $3 instead of the saved $10 stake. Jeremy also reported that a custom-target Cribbage game may have restarted at 121 points. Both are explained by the same source boundary: handleRunBack sets React form state and immediately calls a submit closure holding the previous render's values. Cribbage's Run Back path also never restored its saved mode/target. Holm, 3-5-7 and all three simple dice games used the same stale-form approach. Gin's direct exact-config submission was the accepted reference.

All seven now submit the exact committed dealer_games.config snapshot through the existing configure_dealer_game owner. Game.tsx reads it once per confirmed dealer-game identity, cancels stale reads and clears the prior snapshot when a new identity arrives. Cribbage preserves the stored mode even when a custom target equals a preset number. Missing/mismatched snapshots fail closed; no form defaults substitute for saved settings. Ordinary editable setup, bots, game rules, settlement and database definitions remain unchanged. The click still makes one configuration request; there is no per-turn read or delay.

Verification levels are explicit:

- Actual rendered Run Back button tests cover all seven games with intentionally different form defaults, every stored option, duplicate clicks, failed-submit retry and missing/mismatched snapshots. Cribbage includes custom 37, custom 121 and standard 121 with skunks. Twenty-one focused tests pass.
- The deployed PostgreSQL setup RPC passes nine rollback-only configurations across all seven games, including a changed dealer and duplicate submission. Source and successor normalized configs compare exactly. All synthetic database proof rows rolled back. Proof: supabase/tests/run_back_config_rollback_proof.sql.
- Live two-browser qualification reuses Yahtzee's legal final scores/full payout/Run Back/two successor turns and adds cribbage-run-back-custom-win: a legal custom-target win, full payout, unchanged Run Back settings, fresh hands and both successor discards. This is not a new full-match campaign for the other five games.

Keep the previous Yahtzee traces and cleanup proof under artifacts/yahtzee-presentation/. New build, tests, runtime evidence and independent cleanup belong under artifacts/run-back-20260910/. Jeremy's production smoke is separate acceptance.
