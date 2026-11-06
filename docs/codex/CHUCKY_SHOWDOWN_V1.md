# Chucky Showdown v1 — release qualification

Solo Arcade candidate on `codex/chucky-showdown-v1`, based on `670f5a9f5`. The original local checkpoint is tagged `chucky-showdown-v1-local-qualification-2026-11-06`. The approved 1466 × 564 master has SHA-256 `7fd28f0b57950140ededb82aff44f02e36be335a5aa4fff3f00af3212edb306b`. The two WebP banners preserve its full frame and P-Town Original ribbon. The catalog supplies its standard native Rules button.

## Run and score ownership

The Arcade run UUID identifies the game. The run UUID plus a hand number from 1 through 9 identifies the four private cards. The locked revision identifies the current board and the decision on it. A repeated request UUID can acknowledge only its original command fingerprint. The API, a resumed tab, and the zero-client recovery worker call the same database step.

HOLM supplies the cryptographic draw without replacement and the best-five evaluator. A press commits one private draw from the remaining 44. The projection releases its cards one at a time at persisted server boundaries. Strictly greater wins, including the five-card evaluation at level one. A successful press keeps the four private cards and draws a fresh board from the other 48. Any remaining level is legal. The seventh victory banks 2,800.

The 30-second decision clock starts at the end of the board deal. Game Defaults accepts whole seconds from 5 through 60 and freezes the setting for new runs. Each duration has a distinct ruleset and leaderboard. Bank and timeout transfer the current hand's At Risk points, including zero. Getting cracked pays zero. The ninth payout atomically records the score with three round totals, each containing three hand payouts.

The screen seeks the server timeline on entry and reconnect. It uses the shared cards, sound preference, countdown dots, score pill, final score presentation, leaderboard and achieved-time renderer. Personal score history reads only the signed-in player's completed Chucky runs. The new game uses the existing nonfinancial Arcade tables.

## Local evidence

- The candidate passed in a rollback transaction before installation and again on the installed disposable PostgreSQL schema. Tests exercise the real HOLM and Arcade functions, the private and public ACL boundary, and triggers that reject writes outside Arcade or to other games' runs and results.
- The 448 valid subset-to-level choices span all 5,040 orders. Additional fixtures cover the five- through eleven-card evaluator, ties, disjoint draws, visible prefixes, stable private cards, repeated-level rejection, the seven-win auto-bank, bank at zero, a nonzero timeout, a cracked hand with secured points, nine hand payouts, both leaderboard windows, and personal history.
- Separate PostgreSQL connections raced starts, identical presses, competing presses and a terminal action against recovery. An injected failure after result insertion rolled back the result and run revision together. The bundled recovery worker completed nine unattended hands and rejected a consumed token.
- Edge drove the actual Arcade switchboard, native Rules, Play, Resume, persisted action replay, card selection, win, crack, bank, timeout, final result, both leaderboard periods and personal history. The test substitutes local authentication and subscription acknowledgements. Deterministic deals and a shortened final timeout exercise the scoring paths. The interactive preview uses normal secure draws and the ordinary clock.
- Portrait checks use 320 × 568 and 390 × 844. Landscape checks use 667 × 375 and 844 × 390. The browser measures all five rows, all eight buttons and each card, and exercises seven simultaneous Chucky cards. It observes the actual audio scheduler for each placement and flip, the shuffle, heartbeat, score count, bank transfer, crack, mute and duplicate suppression. Installed-device speaker and touch acceptance remains Jeremy's smoke step.
- The app typecheck and production Vite bundle passed. The full application run passed 3,859 tests. Its ten failures in dealer stake Defaults and Mega Golf Defaults reproduced by name on the base commit. The release harness passed all 241 tests.

## Reproduce on this machine

Use this candidate's worktree as the working directory. The dedicated database is `chucky_showdown_v1_1793990800` on `127.0.0.1:55439`. The fixture uses the repository's local PostgreSQL connector. Its base was cloned from the existing local access/Arcade schema, with the canonical HOLM evaluator, secure shuffle, Chucky draw and Arcade artwork table restored from repository migrations. The candidate migration is installed there with admission disabled.

```powershell
node dev/chucky-showdown/proof.mjs chucky_showdown_v1_1793990800 --installed
node dev/chucky-showdown/races.mjs chucky_showdown_v1_1793990800
node dev/chucky-showdown/worker.mjs chucky_showdown_v1_1793990800
node dev/chucky-showdown/browser.mjs chucky_showdown_v1_1793990800
node dev/chucky-showdown/browser.mjs chucky_showdown_v1_1793990800 --preview
```

Run these commands individually. The last command serves the game at `http://127.0.0.1:15474/arcade/chucky-showdown`. It uses a synthetic account and rollback transaction. Stop it before running the database proofs. Screenshots and the browser receipt log are under `qualification.local/chucky-showdown/browser/`.

## Hosted release — November 6, 2026

The release combines Chucky with published Crib Lab commit `176c70659`. The combined app passed typecheck, the Chucky browser smoke with all seven placements and flips, the 241-test harness and 3,862 application tests. The ten existing Defaults test failures matched the base by name.

Migration `20261106191752` was installed with Chucky admission closed. Candidate and installed hosted rollback proofs returned the independently qualified digest `6894ecd3a16a5fcb75917359b8d0060a`, zero fixture users, zero Chucky runs and zero enabled Chucky boards after rollback. The disposable PostgreSQL qualification used the hosted HOLM evaluator and private draw, and the hosted Arcade start, commit and leaderboard definitions. It passed both migration proofs and independent-connection races. Hosted coverage is reproducible with `supabase/tests/chucky_showdown_hosted_proof.sql`, inserting the migration at CANDIDATE_DDL for the pre-install pass.

Arcade recovery v19 adds the Chucky dispatch to production v18. Its exact upload passed the loopback worker proof, including nine unattended hands and consumed-token rejection. The downloaded production worker matched the tested source and retained v18's dispatch authentication and Crib Lab route.

The release tag is `chucky-showdown-v1-2026-11-06`. Admission opens through `supabase/chucky-showdown/activate.sql` after the verified Vercel SHA, database publication receipt, authority digest and recovery heartbeat agree. Jeremy's installed iPhone and Android PWA smoke covers the audible riffle and seven flips, immediate mute, a crack after a win, banking, returning across a deadline, and one timestamped result after nine hands.
