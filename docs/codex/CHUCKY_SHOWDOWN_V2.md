# Chucky Showdown v2 — November 6, 2026

One solo Arcade release on `codex/chucky-showdown-v2` revises the original game. Its approved banner, native Rules control, score history and leaderboard remain in the existing catalog.

## Frozen rules and authority

New standard runs use `chucky-showdown/2`. Each round begins with three Folds, three Cracks, two uses of each level and zero at risk. Every Fold, win or continuing Crack deals a fresh four-card player hand and a fresh board. Only two community cards cross the projection boundary before Stay. Stay reveals the last two individually and commits the player to choosing Chucky. Expiration folds at the first decision and selects the lowest available level at the second.

Each committed level consumes a use. A win earns 100 points per Chucky card. Every loss or tie clears the at-risk round score. The last Fold banks, the last Crack busts, and exhaustion banks the remaining points after the fourteenth resolution. A third Crack on the last use busts. Completed rounds remain secure. Final score sums three round ledgers. Timers add no points.

Game Defaults freezes both timers (5–60 seconds each) and both allowances (1–7 each) at admission. Default values are 30 seconds, 30 seconds, 3 Folds and 3 Cracks. Nonstandard configurations receive separate leaderboard keys. Active and historical v1 runs retain their v1 reducer, projection, help, settlement guard and leaderboard. The signed-in player can still read completed scores of either version in personal history.

The existing locked Arcade step owns authorization, revision checks, request fingerprints, automatic progression and atomic results. The public recovery-worker contract is unchanged. V2 uses the HOLM five-card evaluator to select the best five physical Chucky/community cards. Equal-valued selections break ties by stable deal ordinal. The result projection discloses the winning five and hand name after the final flip. Live presentation can drain missed reveal prefixes and retained result frames. Recovery seeks the persisted timeline silently.

## Smoke corrections

The v1 presentation discarded a Crack cue when its frame arrived over 175 ms late. The score presentation also excluded falling totals, and the shared count generator skipped decreasing steps. V2 admits the recorded glass cue when the highlighted result announcement appears. After the glass, an opt-in descending count follows the actual loss for one second. A zero-point loss still gets glass and a highlighted five. Existing score-audio callers keep their ascending behavior.

Face-down Chucky placement remains 180 ms per card. Face-up reveals are spaced 720 ms apart with an 850 ms final hold. Both community reveals and every Chucky reveal use the approved soft flip. Chucky Showdown no longer requests heartbeat or laugh audio. In v2, the card face enlarges the suit and preserves its glyph in four-color mode. The final Crack pulses every two seconds and becomes static under reduced motion.

## Qualification

The local rollback matrix and installed proof cover integrated v1/v2 admission, frozen defaults, all three round endings, both timeout actions, level reuse, fresh hands, private prefixes, the nine poker categories and deterministic best-five ties. They exercise actual Arcade receipts, immutable scores, version-separated leaderboard reads, authorization and verification of zero gameplay writes to non-Arcade tables. The exact worker bundle and an independent-connection race proof cover unattended completion, lost/duplicate commits, a competing press, injected terminal failure and late replay.

Browser qualification uses Edge at 320 × 568, 390 × 844, 667 × 375 and 844 × 390. Local authentication and subscription acknowledgements are fixtures. The Arcade route, service, installed SQL, shared cards and audio manager are real. The browser follows three rounds, forces a lost acknowledgement and a delayed Crack frame, checks losses and ties, measures the seven deal/flip beats, counts actual scheduled cues, mutes a win and reloads a Crack. The original v1 browser run is also exercised. Screenshots and timing receipts are under `qualification.local/chucky-v2/browser/`.

The release uses the exact hosted authority digest from both rollback proofs, the public build manifest, the database publication receipt, and a healthy recovery heartbeat. Admission switches v1 to v2 atomically for new runs. The release check excludes non-ended real-money tables and started, nonterminal real-money async turns. Already-admitted async gameplay is protected by the existing release gate. This release writes no async match or multiplayer financial state.

## Release evidence

Hosted migration `20261106210547` passed candidate and installed rollback proofs with digest `9e762a20a529e10ab6642417bc3132a5`. Both proofs left zero fixture users and zero v2 runs or open v2 boards. The v2 step uses the existing production worker v19. Its downloaded byte-for-byte bundle passed the zero-client test without a worker redeployment.

The release branch is `codex/chucky-showdown-v2` and the checkpoint tag is `chucky-showdown-v2-2026-11-06`. The production Vite build and app typecheck passed. The app suite passed 3,866 cases with ten previously documented Defaults failures matching the base by name. All 241 harness cases passed. The v1 and v2 browser runs both passed. Seven v2 face-down placements spanned 1,083 ms from first to last. The six face-up gaps measured 690–754 ms. Three losses/ties produced three glass cues, and only the two positive losses produced descending counts.

## Approved Arcade presentation polish

The lobby uses the portrait-left Chucky banner with the existing independent Rules control. Chucky v2 and Crib Lab opt into the same white card face with conventional red and black suits. Each rank is centered from its visible glyph bounds. Other card styles and the canonical hidden-card renderer keep their own presentation.

Fold/Stay displays one filled pip per remaining use and grays exhausted levels. Stay admits the lobby portrait during the two community flips and level choice. At commitment the portrait clears before the first Chucky card lands. A live Crack detaches its header heart after the score count, then shatters with a short explosion. Each first deal of a round reuses the Run21/TriTowers artwork and bell cue. Live-frame admission and the existing audio manager guard mute, recovery and replay. The release uses the existing Chucky and Crib Lab rulesets.

## Owner iPhone smoke

1. Open Chucky Showdown in Arcade with Sounds on. Check the round-opening bell, remaining-use strip, three Crack icons, readable suits on all four player cards and two face-down community cards.
2. Tap Stay. Check the Chucky portrait through the two community flips and level choice. Select level 7 and compare the quick face-down deal with the slower seven face-up flips. Verify its use count decreases and the next hand is fresh.
3. After winning points, watch a loss. Verify the five highlighted cards and hand name, one glass sound, the falling score and the delayed Crack indicator update. Listen for the small explosion when the drifting heart breaks. A zero-point loss skips the descending count. Check the last-Crack pulse and Reduced Motion.
4. Fold three times in a round. Confirm the final button says **FOLD (Bank Total)** and the banked amount joins completed rounds. Let each decision clock expire once. Background and return across a reveal and check for duplicate sounds or extra time.
5. Finish all three rounds. Compare the final score and achieved time in personal history and both leaderboard windows. Use the Rules selector to check the legacy v1 board separately.
