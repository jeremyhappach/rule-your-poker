# Focused pause/resume pass — 2026-11-02 — local only

Base: main `6411bb674a592d49cc6ed87fc0ae49a56a2f5361`.
Branch: `codex/focused-pause-resume`. The shipped `b64a2d75` recovery
owners were retained. No production connection, migration, cron change, push,
merge or deployment was performed. All edits are in this isolated worktree.

## Reproduced and corrected

- Setup uses a body-portaled modal above the table header. Browser hit-testing
  confirmed that its scrim intercepts the original options button, while keyboard
  focus can still open that menu. All four setup forms now expose the **same
  host-only route pause callback** inside the modal. Modal blocking, high-card
  layering, consent, and non-host restrictions remain intact.
- Setup had no pause input. Its visible countdown and fallback timeout continued
  while paused. Both now stop; resume uses the authoritative config deadline.
  A late deadline read from a retired pause/deadline scope is ignored.
- Gin and Cribbage likewise had no session-pause input. Their actual table
  components continued publishing enabled hand controls. Both now receive the
  route's authoritative flag, disable existing controls, and reject captured
  action callbacks before optimistic presentation or RPC submission. Cribbage's
  existing automatic Go effect re-arms on resume without another card snapshot.

The new component regressions failed before these corrections. Gameplay rules,
private card projections, action identities, settlement owners, receipt retries,
committed presentation continuity and shell geometry are preserved.

## Evidence and limits

| Coverage | What was exercised |
|---|---|
| Existing pause audit | All 153 baseline tests passed before changes. |
| Expanded pause audit | 182 cases: existing recovery/terminal tests plus 29 focused cases. The final Battle 31 fixture correction uses its legal Pass intent; its five-case file passes alongside the other 177 cases. |
| Nine adapters | Battle 31, Boxdrop, 11 Up, Golf, Ptown Words, Race Poker, Royal Flash, Take 2 and Trip Flip: actor/observer input gates, missed resume, reconnect acknowledgement and a second live pause/resume cycle. Actual hooks with synthetic snapshots/transport; no legal-play or financial claim. |
| Gin / Cribbage | Actual parent components: active controls disable/re-enable, paused handlers send no request, existing continuation/counting retry receipts remain valid; Cribbage automatic Go resumes once. Children/transport are controlled test substitutes. |
| Horses / SCC | Actual controller actor/observer Roll gating and existing delayed completion rejection/identity tests. |
| Farkle | Existing actual-table active input and timer pause/resume checks. |
| Run21 / TriTowers / Quintzee / Canasta | Existing focused actor/observer snapshot recovery checks retained. These do not establish fresh full active-turn phone flows. |
| Holm / 3-5-7 | Existing authority, timer and prior shipped recovery behavior retained; seven-game SQL pause proof rerun. No exhaustive transition campaign. |
| Shared presentation | 119 focused setup, authoritative snapshot, timer-rail, terminal-hold and chip-ledger lifecycle tests passed. These prove local callback ownership, not all game animations on phones. |
| Setup browser | 12 passes: four real setup form variants × 390×844, 844×390 and 1280×800. Installed Edge/Chromium, actual components/CSS, pointer hit-testing, keyboard menu and touchscreen-emulated taps. Non-host cannot see the control. No page errors or external network allowed. See [browser evidence](evidence/focused-browser.json). |
| Build/typecheck | TypeScript app project and production bundle passed. Installed TypeScript used; no tools/dependencies installed. |
| Full application suite | Attempted, then stopped after it stopped making progress. No full-suite pass is claimed. A separate bounded card-owner run passed 173 tests across 28 files. |

### Local SQL

`scripts/focused-local-sql.mjs` clones only the existing synthetic PostgreSQL
template on `127.0.0.1:55439`, wraps each proof in rollback and drops its own
copy. The captured local auth stub is adapted to accept claims-only subjects;
no product or financial function is replaced. Function hashes, original SQL
hashes and before/inside/after counts are in [SQL evidence](evidence/focused-sql.json).
This is captured local authority, not verification of current deployed schema.

- Seven-game pause proof passes: non-host rejection, duplicate/stale/wrong
  identity, paused action/financial write rejection, authoritative deadline
  shifts, and no financial change.
- Yahtzee proof passes: authority, replay/late replay, settlement and recovery.
  Deferred canonical triggers produce two additional result rows, two transfer
  batches and six snapshots inside the transaction; rollback restores every
  recorded count.
- **Horses/SCC financial requalification is incomplete.** The old connected
  proof violates `games_current_dealer_session_fkey` with its fixture order.
  The disconnect proof passed on one run but failed the
  `partial_turn_received_extra_roll` assertion on repeat. It predicts
  PostgreSQL `random()` with `setseed`, while the current roll owner uses
  `private.secure_random_int`. Its accidental pass is not accepted as proof.
  The failed repeat is retained in [legacy evidence](evidence/focused-legacy-sql.json).
  `--legacy` explicitly reruns those old proofs; they are excluded from the
  default qualified subset. No financial release is authorized by this pass.

## Remaining checks

1. On physical iPhone Safari and Android Chrome, tap Pause/Resume in dealer game
   selection and each setup form, including short landscape. Check that the
   form, host menu and scrolling remain usable.
2. For each of the 21 supported multiplayer games, pause an active human turn,
   wait beyond its original budget, then resume. Confirm server time is
   preserved and only the actor can act. Repeat with actor and observer losing
   resume delivery, reconnecting, and returning from actual OS suspension.
3. Give Gin and Cribbage particular attention: paused card/stock/discard/knock/
   layoff controls, automatic Go after resume, then counting and continuation.
   Complete a legal hand; the new tests are component-boundary evidence.
4. Verify in-flight animation continuity, one visible payout, balanced canonical
   balances/ledger and one result through replay and continuation. Modernize the
   two legacy Horses/SCC SQL fixtures before claiming fresh financial coverage.
5. Complete the full application-suite run before publication. No production
   acceptance, physical-device pass or all-game settlement qualification is
   implied by the local checks.
