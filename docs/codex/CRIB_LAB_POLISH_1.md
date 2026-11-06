# Crib Lab Polish Pass 1 · production qualification

Branch `codex/crib-lab-polish-1` is based on the Chucky Showdown v2 release `3b0702053`. The first preview checkpoint is `crib-lab-polish-1-local-2026-11-06`. The latest owner-smoke checkpoint is `crib-lab-polish-1-smoke-3-2026-11-06`. Jeremy approved preview 3. The release branch integrates it on Chucky polish commit `b8c893aca`. The migration adds a disabled `crib-lab/2` registration and keeps separate duration-specific leaderboards. Changing the v1 default before v2 admission continues to admit v1. Existing runs continue using their frozen version and duration.

## Playfield

Five full-width hand rows retain accessible hand and card names. Crib Lab uses the centered Arcade Classic rank and suit face published with Chucky Showdown on November 6. The stock and shared starter occupy the same centered slot. The upper-left badge includes the current offer and counts from five to one. The round sits beside the central score pill, the dotted timer sits below the last hand, and the upper-right Abandon action requires confirmation. Sound and Rules remain accessible during phase introductions.

Selection uses the gold card highlight. Picking the first swap card replaces the instruction with Cancel and Stand Pat with Confirm. Confirm becomes available after selecting the second hand. The starter, timer and five rows keep their positions throughout selection and cancellation.

[Preview 2 discard selection](../../dev/crib-lab/evidence/polish-1/smoke-2-discard.png) · [Preview 2 swap selection](../../dev/crib-lab/evidence/polish-1/smoke-2-swap.png)

[First preview phase screenshots](../../dev/crib-lab/evidence/polish-1/overview.png) · [Stock Phase introduction](../../dev/crib-lab/evidence/polish-1/stock-phase.png) · [Landscape](../../dev/crib-lab/evidence/polish-1/discard-844.png)

In preview 3 the central pill always shows the game total. During counting, points fly to a separate Base score counter beside the starter. When the count finishes, an overlay shows the frozen base × time bonus = round score. Once it clears, the pill counts from the previous game total to the new total. Count-up audio follows that one transfer.

The browser checked the pill against the exact previous total throughout counting and the equation, then observed a single increasing tally to the stored cumulative score in all three rounds, for both the combination and hand-based presentation. Typecheck, the production bundle and 12 focused tests passed. [Base counter](../../dev/crib-lab/evidence/polish-1/smoke-3-base.png) · [Score equation](../../dev/crib-lab/evidence/polish-1/smoke-3-equation.png)

## Timing and counting

The existing locked Arcade step still owns admission, revision checks, command receipts, settlement-free results and recovery. V2 persists a transition identity, start and end in the private run. Entering Discard, Stock or Swap adds exactly 1,100 ms to the round deadline. Cut uses the same accounting for its 1,000 ms reveal. The server rejects gameplay commands throughout each hold. The scheduled boundary or the next authorized read releases it using its stored end. Late reads can pass several boundaries without granting extra decision time. Scoring uses the authoritative remaining decision time and the original ×100–×300 formula.

The original Cribbage scorer awards each hand. After the award, v2 freezes a presentation sequence with exact card-position masks. Bits 0–3 refer to the hand and bit 4 to the shared starter. Each fifteen, constituent pair, maximal run, flush and nobs earns its own highlight. The script must reconcile to each authoritative subtotal. New scoring receipts use 450 ms per combination, up from the first preview’s 360 ms, a hand subtotal 480 ms and an empty hand 240 ms. The server reserves the complete script plus 3,950 ms for the equation and cumulative result. The next deal starts at that stored boundary. Reopening a count seeks to the current beat silently. Later unseen beats can play when the device permits audio.

For a hand-by-hand smoke variant, set the internal SQL function `private.crib_lab_count_policy()` to return `hands` in the local fixture. The existing ten-second hand sequence is selected for subsequent awards. Previously frozen combination receipts retain their original presentation and deadline. Both policies produce the same awarded points. There is no new player setting.

## Local evidence

- Candidate and installed rollback proofs passed against disposable PostgreSQL. The v1 step preimage matched the read-only production check. The proofs cover closed admission, v1 history and continuation, frozen defaults, authorization, duplicate and late replay, both leaderboard windows and tied ranks. Gameplay wrote only to Arcade tables.
- All four holds conserved the remaining decision time, including a stock choice with one millisecond left. Refresh, delayed boundaries, timeouts, independent-connection races, an injected terminal failure and a bundled worker completing three unattended rounds passed.
- Exact masks passed for a 29-point hand, three and six distinct pairs, triple and double-double runs, four- and five-card flushes, and starter participation. A 21-distinct-card stress deal produced a count exceeding 16 seconds. Its next deal waited for the full script. The hand-policy fallback preserved the award.
- Edge exercised the actual Arcade route, service, local PostgreSQL, audio manager and leaderboard. V2 passed 320×568, 390×844, 667×375, 844×390, 768×1024 and 1280×720. At 390×844, six-card rows measured about 57×79 px. Tests checked centered stock and cut, the five badge values, all nine introductions, exact visible score masks, Abandon cancellation, background freeze/resume, reduced motion and refresh during stock and scoring.
- Preview 2 completed three rounds to a 20,153-point leaderboard result. The browser measured identical controls, starter, timer and hand-row rectangles for zero, one and two picks and after cancellation on five viewport sizes. All new combination receipts used 450 ms. The database rollback proof, typecheck and focused presentation tests passed.
- The first preview’s recorded v2 run awarded 6,670, 7,104 and 6,534 points. Its final leaderboard score was 20,308. The three counts took 10.31, 10.07 and 10.31 seconds. All 22 combination cues in the two uninterrupted rounds were scheduled exactly once. The recovery round skipped elapsed beats. V1 Crib Lab and Chucky Showdown v2 also completed their browser regression runs.
- TypeScript and the production Vite build passed. The focused suite passed 73 tests, and all 241 harness tests passed. The full app run passed 3,871 tests and retained the ten existing dealer-stake/Mega Defaults failures and the associated Defaults error. Physical installed-iPhone acceptance remains open.

To reproduce, use a disposable loopback Crib Lab database with the v1 release installed. Run `node dev/crib-lab/polish-proof.mjs <database>`, install the candidate migration locally, and rerun with `--installed`. Run `races.mjs`, `worker.mjs` and `browser.mjs` in the same directory with the database argument and `--polish`. For manual workstation play, use `node dev/crib-lab/browser.mjs <database> --polish --preview` and open `http://127.0.0.1:15370/arcade/crib-lab`. Set `CRIB_LAB_PREVIEW_PORT` to use a separate local port. Preview 3 is served on port 15373 with its own synthetic player and rollback transaction.

## iPhone smoke

1. Check all four suits in a six-card row. Open Rules and cancel Abandon from the header. Confirm all five rows and the dotted clock fit in portrait.
2. Lock the discards. Watch the Stock Phase title, then replace and pass through badges 5, 4, 3, 2, 1. Check the centered flip and its sound, followed by Swap Phase on the same centerline.
3. Cancel one exchange, confirm another and stand pat. Follow a fifteen, pair or run from its exact cards, including the starter when used, into the Base score counter. Check the equation and watch the central pill add the round once, starting from its previous total.
4. Background or refresh across an introduction and again during a count. Check the current position, then finish round three and compare the total with the leaderboard. Listen for repeated cues and repeat with reduced motion enabled.

## Hosted release

Migration `20261106232247` passed the hosted candidate and installed rollback proofs with the same authority digest, `c82461365ec9924de307804d4b14ffb5`. Both proofs returned zero synthetic users and zero v2 runs after rollback, with v1 still admitting new runs. The service-only Crib Lab RPC and the deployed Arcade recovery worker v19 handle both versions. The guarded activation script checks the exact production client receipt, authority digest, recent recovery heartbeat and real-money gates before switching the current duration board. The release checkpoint is `crib-lab-polish-1-2026-11-06`.
