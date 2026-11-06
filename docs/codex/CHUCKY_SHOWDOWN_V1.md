# Chucky Showdown v1 — local qualification

Solo Arcade candidate on `codex/chucky-showdown-v1`, based on `670f5a9f5`. This checkpoint is local. The approved 1466 × 564 master has SHA-256 `7fd28f0b57950140ededb82aff44f02e36be335a5aa4fff3f00af3212edb306b`. The two WebP banners preserve its full frame and P-Town Original ribbon. The catalog supplies its standard native Rules button.

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

## Publication steps requiring Jeremy's approval

1. Finish the Crib Lab release first. Compare the final main tip with this candidate's base, then reconcile the shared catalog, Defaults, Arcade API, and recovery dispatcher in an isolated integration worktree. Retain both games' registrations. Re-run the proofs and application checks against that exact integrated revision. Resolve the existing app-suite release gate under the normal repository workflow.
2. Capture the deployed definitions and indexes in a disposable release-equivalent database. Run the rollback proof with `20261106184346_chucky_showdown_arcade_v1.sql` as the candidate, install it there, and repeat the installed proof, concurrency test and worker test. Record the qualified authority digest. Shared-function changes since this local base require a new digest.
3. With explicit hosted-schema approval, apply that single migration with Chucky admission closed. Verify the HOLM dependencies, service-only step grants, disabled rules, Game Defaults row and qualified authority digest. Existing runs and results require no backfill.
4. Publish the matching bundled `supabase/functions/arcade-recovery/index.ts` worker while admission is closed. Integrate the validated application revision, use the repository's approved main push helper, and verify the Vercel deployment and recorded publication SHA. Verify a healthy recovery heartbeat.
5. With activation approval, run `supabase/chucky-showdown/activate.sql` in one transaction with `app.chucky_showdown_release_sha` set to that verified 40-character SHA and `app.chucky_showdown_authority_hash` to the independently qualified digest. The script checks the SHA, definitions, heartbeat and frozen configuration before opening admission.
6. Smoke on installed iPhone and Android PWAs. Check the banner, all five rows, audible riffle and seven flips, immediate mute, a crack after a win, an explicit bank, resume across a deadline and one timestamped result after nine hands. Record the accepted checkpoint after that smoke.
