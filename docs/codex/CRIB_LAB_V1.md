# Crib Lab v1 qualification · November 6, 2026

Crib Lab is a solo Arcade game. The candidate is on `codex/crib-lab-v1` from main `670f5a9f5`. Production release is pending. The approved 1466 × 564 PNG was resized without cropping into the existing 480w and 960w banner slots. Source SHA-256 is `C995D0F039FE43F164ECE18A7245E5003FE189DC074E885DE457254B7B9126C8`.

## Owners and timing

The run and round identities are the Arcade run UUID and `<run UUID>:<round number>`. The locked step checks the actor, revision, round and request UUID before applying a command. Discard marks are saved on the server as they are accepted. Swap proposals stay on the device until confirmed. The server uses the existing private cryptographic Cribbage shuffle and exact hand scorer. It publishes only the five visible rows, currently offered stock card and, after the fifth offer, the shared starter.

Every run has three rounds. The administrator's duration is frozen at admission. Like Quintzee, each distinct duration has an immutable leaderboard configuration. Returning to a previously used duration selects its existing board. The multiplier is the integer from 100 through 300 computed at the server's round deadline or accepted finish.

At expiry the server fills missing discard positions from right to left, skips unconsumed stock and scores confirmed hands. The cut has a one-second reveal inside the running round. A ten-second scoring interval lets each hand count into the base, then shows the multiplication and cumulative award. The next round starts at the end of that interval. Reload seeks the authoritative phase silently. The shared recovery worker can finish all three rounds with zero clients.

## Qualification

- Candidate and installed proofs passed on disposable loopback PostgreSQL with deployed Arcade start, commit, leaderboard and Cribbage scoring definitions. The database tests run inside rollback. A separate disposable clone exercised real independent connections.
- Known hands included 29, double, triple and double-double runs, ace-low runs, four- and five-card hand flushes, a broken flush, and matching and nonmatching jacks. Exact multiplier boundaries passed at the start, midpoint, final millisecond and expiration.
- Proofs covered private deck uniqueness, editable and incomplete discards, wholly untouched timeout, repeated replacements in one hand, all five passes, cut expiry, stand pat, three exchanges, rejection of a fourth, reconnect, stale commands, duplicate and late replay, owner checks, equal leaderboard ranks, both date windows, timestamped immutable results and frozen defaults.
- An injected failure after result insertion rolled the entire terminal transition back. Competing commands, duplicate starts and worker/action races produced one winning revision and one final result. Database guards rejected writes to non-Arcade application tables and other games' run/result rows during the proof.
- The bundled recovery worker passed a loopback test from dispatch token through claim, game step, three unattended rounds and completion. The bridge restricted the real claim response to the synthetic run. Reusing the token was rejected.
- Edge drove the actual switchboard, rules dialog, Play, game route, Arcade service, PostgreSQL step and both leaderboard tabs. The harness supplies a loopback identity and subscription acknowledgements. Refresh retained a partial discard and restored the scoring phase silently. All seven cue families scheduled through the platform audio manager. Mute and duplicate suppression passed. This exercised browser audio scheduling. Physical speaker acceptance remains open.
- Five hand rows and actions fit at 320 × 568, 390 × 844, 667 × 375, 844 × 390, 768 × 1024 and 1280 × 720. On 390 × 844, six-card rows used approximately 50 × 70 pixel cards.
- App typecheck and the production Vite bundle passed. The focused catalog, rules, Defaults and Arcade API suite passed 103 tests. The app suite passed 3,859 with ten failures in existing dealer-stake/Mega Defaults tests. Both failing files reproduced the same ten failures and one unhandled Defaults error on the base commit. All 241 release harness tests passed.

Reproduction uses the existing `dev/quintzee/database.mjs` loopback connector and a disposable database named `crib_lab_v1_<digits>` with the current Arcade schema, private Cribbage owners and account access gates. Run `node dev/crib-lab/proof.mjs <database>` before installation, install the candidate in that disposable database and rerun with `--installed`. Run `dev/crib-lab/races.mjs`, `dev/crib-lab/worker.mjs` and `dev/crib-lab/browser.mjs` with the same database name. The browser writes screenshots and its receipt summary under `qualification.local/crib-lab/browser/`.

## Release gates and owner smoke

The migration creates disabled rules. For an approved production release, verify the hosted candidate and installed proofs, publish the matching recovery worker and client, verify the publication SHA and worker health, and only then run the guarded `supabase/crib-lab/activate.sql` with the verified SHA and installed definition hash. Hosted schema, worker and client publication are pending.

1. On an installed iPhone and Android PWA, open Arcade. Check the two-column tile, complete ribbon and separate gold Rules button. Tap Play with Sounds enabled and listen as the rows arrive.
2. Mark one discard, refresh, then finish two per row. Lock them. Replace two successive offers in the same hand, pass the others and watch for the shared starter after offer five. Mute during stock, then unmute.
3. Select cards from different hands. Cancel once, confirm once and verify the remaining count. Stand Pat. In another round use all three exchanges. Check the two-part swap sound and that the starter applies to each hand.
4. Watch all five hand subtotals, the base, multiplier and final cumulative award. Check portrait and landscape. Open Rules, return to the same run and background the PWA across a deadline.
5. Finish round three and compare the final score and achievement time on both leaderboard tabs. In a second run, let an untouched round expire. Verify ×100, a single result and automatic continuation. Change the default on the test environment and confirm a new run uses it while the earlier result still appears under its original rules.
