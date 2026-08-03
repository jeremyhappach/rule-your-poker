# Backlog

Priority is ordered. Re-rank only for a current production blocker.

## P0 — release/correctness

### 1. Final iOS Session Ended long-list scroll

Status at handoff: accepted only after published iOS smoke.

Acceptance:

- felt-safe panel remains inside ellipse;
- one real WebKit-safe scroll owner;
- sticky Results title;
- Hap + 10 bots all reachable;
- short lists intrinsic;
- no page/HUD scroll.

### 2. Regression-proof Holm bot scheduler

Current fixes cover dropped wakes, missed realtime edges, remount, focus, visibility, and reconnect.

Codex follow-up:

- audit whether `makeBotDecisions` returns before its internal two-second delayed action commits;
- consider making promise lifecycle represent the actual authoritative attempt;
- preserve no-polling and DB exactly-once behavior;
- add a focused deterministic test only if existing test architecture supports it reliably.

### 2A. Cribbage LAST HAND win presentation bypass

Status: Fix implemented on 2026-08-03; awaiting published real-money smoke.
Durable settlement passed on both backends; live-flow presentation was the
remaining acceptance failure.

- Production smoke reported 2026-08-02 on the Vercel build at commit
  `22da08820d453186a431088520100a88672b6782`.
- Repro: two-human real-money Cribbage, game to 1, `perpetual_heels`
  harness; host selected End Session for LAST HAND, discarded, then left;
  remaining human discarded and the cut card should have produced His Heels
  and the terminal win.
- Expected: the remaining connected client sees the cut-card/win/settlement
  presentation and Session Ended table phase before choosing Back to Lobby.
- Actual: the table unmounted and the remaining human was sent directly to the
  lobby. The session correctly appeared under Completed Sessions and balances
  were correct, proving durable terminal settlement and financial writes
  completed.
- Root cause: the persisted `phase='complete'` effect added with atomic
  Cribbage settlement invokes `cribbage_settle_game` immediately, while the
  His Heels presentation path intentionally keeps `winSequencePhase='idle'`
  until the cut-card reveal and `+2` rail item retire. The parent therefore has
  not yet observed `onTerminalPresentationActiveChange(true)` when the RPC's
  realtime `session_ended` snapshot arrives. `Game.tsx` treats the client as
  non-admitted, drops the Cribbage render branch, and then follows its existing
  fresh-mount/reconnect redirect path.
- Production evidence for game `9d69b82f-6a8f-4c89-92e0-c1efc688da07`:
  persisted terminal state was a Jack of hearts / `his_heels` win; the remaining
  client mounted `Hap: His Heels (+2)` at `14:13:32.147Z`, received
  `session_ended` at `14:13:32.599Z`, and unmounted the Cribbage table at
  `14:13:32.603Z`. Exactly one `cribbage_terminal` result recorded the expected
  `+10/-10` chip changes.
- Owned-Supabase preview smoke on 2026-08-03 reproduced the same remaining-
  client boot for game `4b6fce29-de49-4c68-8ff2-71d48d6d35d9`. Authoritative
  target state is `session_ended` with one `cribbage_terminal` result and
  exactly two distinct-profile SessionResult transactions of `-10/+10`
  summing to zero. This proves the presentation failure is deterministic across
  the source and target backends while durable settlement remains correct.
- Preserve the proven atomic settlement and direct-to-lobby behavior for
  genuinely fresh mounts of already-ended sessions. The correction should
  establish the route-owned live-terminal hold before the delayed His Heels
  presentation begins; it must not delay or return settlement authority to the
  client presentation sequence.
- Required contract clarification from Jeremy: immediate authoritative
  settlement is intentional and must remain independent of client presence.
  Settlement reaching `session_ended` must not itself tear down a table that
  was already mounted and observed the live terminal event. Any such connected
  client must retain the existing table, felt, seats, HUD, and round context
  through the complete game-specific win sequence, then enter the transient
  Session Ended table phase. Only a genuinely fresh mount/reconnect after the
  session is already ended should bypass presentation and go directly to the
  lobby.
- Initial hosting triage found the Vercel deployment `READY`, no Vercel runtime
  errors, and no application-source change in the cutover commit. Treat this as
  a client lifecycle/presentation defect unless contrary evidence appears.
- Implemented correction: `Game.tsx` now owns an identity-scoped Cribbage
  live-terminal latch before the child publishes animation liveness. The latch
  admits only the exact game/dealer-game/round/hand observed live on this mount,
  holds the existing table through the child-owned completion callback, and is
  absent on a fresh terminal mount. `liveTerminalPresentationHold.test.ts`
  covers live capture, sparse realtime rows, exact-identity rejection, fresh
  terminal mount, nonterminal release, and leaving Cribbage. No settlement,
  financial, timer, or database behavior changed.

### 3. Remaining terminal-authority migrations

Retained order:

1. Yahtzee — replayable per-mount financial settlement.
2. 3-5-7 normal terminal.
3. Gin.
4. Horses.
5. SCC.
6. 3-5-7 instant-win residual seam.

Requirements: database owns claim, payout, snapshots, disposition; idempotent settlement key; post-payout snapshot; disconnect-safe; client owns presentation only.

Source-proven ingestion findings:

- Cribbage's former multi-write terminal sequence was replaced by
  `public.cribbage_settle_game`; it is the completed atomic-settlement model,
  with the separate live-presentation acceptance tracked in 2A above.
- Yahtzee terminal result/snapshot identity uses
  `yahtzee_state.currentRound` instead of the authoritative
  `rounds.hand_number`. After a tie rollover, the new round has hand 2 or
  greater while terminal writers still pass hand 1.
- Yahtzee setup/start comments describe an ante or score-difference payout, but
  no ante enters a pot and terminal settlement transfers a fixed configured
  amount from each loser.
- Normal 3-5-7 terminal settlement remains client-owned:
  `src/lib/gameLogic.ts:handleGameOver` claims terminal status before separate
  award, result, snapshot, reset, and disposition writes.

### 3A. Source-proven rule, ledger, and harness discrepancies

These findings are separate from the broader terminal-authority migrations
above. Preserve their exact game-specific semantics during later triage.

- Cribbage three-player setup deals five cards to each player and takes one
  discard each, producing a three-card crib. The source comment expects the
  dealer to supply the standard fourth crib card, but no current path does so.
- Gin dealer setup stores configurable `gin_bonus` and `undercut_bonus`,
  while scoring uses hardcoded 25-point constants.
- Gin per-hand `game_results.player_chip_changes` records plus/minus ante
  deltas even though
  `src/lib/ginRummyRoundLogic.ts:recordGinRummyHandResult` explicitly performs
  no chip transfer.
- Yahtzee's ascending-position turn order conflicts with canonical
  `src/lib/canonicalShell/seatRing.ts:nextClockwise`, which defines
  left/clockwise as the nearest lower occupied position.
- Holm partial-tie payout uses integer division. When the pot is not divisible
  by the number of tied winners, the remainder has no proven conservation
  owner.
- The 3-5-7 admin forced-card harness assigns forced cards without removing
  them from the randomized deck, creating a duplicate-card risk.

## P1 — account access

### Password reset failure

Status: Resolved 2026-08-03.

- Reported 2026-08-01: `mcru81` is trying to reset their password, and the
  reset flow is reportedly not working correctly in the production runtime.
- Expected: the account owner can request a reset, follow the recovery link,
  set a new password, and sign in with it.
- Exact failed step, visible error, device/browser, and whether a recovery
  email arrived were not supplied with the initial report. Follow-up confirmed
  that no recovery email arrived.
- Read-only production evidence confirms the `mcru81` profile exists, is
  active, and has an email address. The live `/auth` reset request UI renders.
- Failure boundary: delivery occurs before the recovery callback. The live UI
  calls Supabase Auth `resetPasswordForEmail`; the repository contains no
  deployed SMTP configuration evidence, and its older Resend-backed
  `reset-password` Edge Function has no live caller.
- The exact provider/log error remains unverified because the current operator
  sign-in did not grant access to the Supabase project dashboard. Do not claim
  a specific SMTP error until deployed Auth configuration/logs are available.
- The owned target now uses verified custom SMTP through Resend. Native recovery
  delivery, callback, password update, sign-out, and sign-in with the new
  password passed against the owned preview on 2026-08-03.
- The same complete recovery flow passed on production `holm357.com` on
  2026-08-03, closing the account-access acceptance item.

## P1 — canonical architecture integrity

### 4. Platform-wide bespoke-artifact audit

This is not Holm-only. Audit all seven games for unjustified game-specific implementations overlapping canonical owners:

- card faces and active-hand fans;
- tabled/revealed cards and dice;
- seat clusters/chip stacks/dealer markers;
- pot/transports/celebrations;
- announcements/HUD/tabs;
- active panes/action strips/spotlights;
- table/felt geometry;
- setup/configuration;
- terminal and Session Ended presentation.

Classify each as a necessary narrow exception built on canonical primitives, or unjustified duplication to migrate/delete.

Acceptance invariant: a shared visual/lifecycle change is made once and reaches every applicable game automatically.

Run read-only inventory/plan before implementation. This is also a reasonable Claude Code analysis task.

### 5. Holm active-hand canonicalization

Audit Holm `PlayerHand`/self-hand against shared `ActiveHandFan`.

Preserve four-card geometry, Fold/Stay interaction, highlights, tap behavior, responsive sizing, and tabled transitions. Migrate fully when possible; otherwise isolate only irreducible behavior while sharing canonical `PlayingCard` theme/face treatment.

### 6. Formalize or remove misleading host state

`games.current_host` was null across inspected games and was not Holm bot-controller ownership.

Prove remaining reads/writes, then remove or clearly debug-scope it. Do not conflate it with production ownership.

### 7. Retire legacy bot alias allocator

The standalone `allocate_bot_alias_number` path can burn ordinals outside transactional `create_session_bot`.

Prove no callers; revoke/remove or mark migration-only; preserve transactional creation.

## P1 — cross-game presentation

### 8. Canonical win celebration

3-5-7, Horses, and SCC historically completed pot-to-player transfer but missed canonical destination bounce/confetti. Apply the shared celebration owner without reopening settlement.

### 9. Dealer Configuration modal cleanup

Historical Lovable backlog path:

`.lovable/backlog/dealer-configuration-modal-cleanup.md`

Goals: viewport-safe layout, scrollable body, fixed footer, compact selectors, no game-specific modal fork.

### 10. Geometry Lab/polish

- felt aspect ratio and safe gutters;
- shared safe frame;
- active-player spacing;
- card rank/suit gap;
- opponent nameplate offsets;
- 3-5-7 round-3 group semantics;
- Gin score-rail collision;
- Holm long-tail visuals;
- Yahtzee held-dice reorder/scatter.

## P2 — known low-severity defects

### 11. 3-5-7 refresh transport

Refreshing during later rounds can suppress later-round deal transport for the rest of the hand. Authoritative play remains intact.

### 12. 3-5-7 timeout/sitting-out card scaling

After timeout/sitting-out transition, local active cards may grow/overlap after initially rendering correctly.

### 13. Post-match visual residue

Audit only with a current repro:

- duplicate chip stack;
- stale title/stakes;
- Horses transition delay.

### 13A. Yahtzee static music assets

Status: Queued; discovered during owned-Supabase music-provider retirement on
2026-08-03.

- `MusicToggleButton` is mounted only by Yahtzee and uses
  `useBackgroundMusic`.
- The hook references five `/music/bluegrass-*.mp3` files, but no matching
  audio assets are tracked in the repository.
- The hook reports `hasMusic=true` from the non-empty hardcoded path list, so
  the control renders even when every referenced asset is absent.
- The retired `generate-music` Edge Function was never a caller or fallback for
  this UI. Decide separately whether to supply licensed static assets or hide
  and remove the nonfunctional control.

### 13B. Chat image upload acceptance on redeployment

Status: Queued; runtime entry point intentionally absent as of 2026-08-03.

- Voice-to-text replaced the attachment icon in the current chat UI, so the
  owned-Supabase preview has no user path for a fresh image upload/render smoke.
- Do not remove the existing `chat-images` bucket, Storage policies, or dormant
  upload/render code solely because the entry point is absent.
- When attachment UI is redeployed, require an owned-target preview smoke that
  uploads a new image and renders it in chat, then repeat in production before
  calling the capability live.

### 13C. Holm timer initial-fill regression

Status: Queued; non-blocking presentation regression reproduced in owned-
Supabase preview smoke on 2026-08-03.

- Runtime: commit `a7a52d1d1f4541cfae1c71521e1a3fa77a69c220`, fake-money
  Holm game `25662485-03b6-434b-85f0-f96e983dfe7e`.
- Actual: when the human turn begins, the visible timer first appears roughly
  70% full, animates upward to full, and only then begins counting down.
- Expected: after the deal-settled gate releases, the timer's first visible
  frame is full and all subsequent movement is a monotonic countdown.
- This is a known defect that had previously been corrected and has regressed.
  Preserve the newly accepted rule that no visible Holm timer appears while
  card transports are still active.

### 13D. Holm timeout rebound and transient card reactivation

Status: Queued; new non-blocking presentation defect first observed in owned-
Supabase preview smoke on 2026-08-03.

- Runtime: commit `a7a52d1d1f4541cfae1c71521e1a3fa77a69c220`, fake-money
  Holm game `25662485-03b6-434b-85f0-f96e983dfe7e`.
- Actual: deadline expiry folded the human and showed auto-fold for about one
  second; the clock then rebounded to roughly one second and the folded cards
  briefly reactivated before a second visible fold/auto-fold transition became
  stable.
- Expected: one monotonic terminal timer transition. Once the authoritative
  fold arrives, the timer stays retired, the cards remain inactive, and the
  auto-fold/sitting-out presentation does not flicker or replay.
- Authoritative progression was not harmed: the game advanced, auto-folded the
  player for subsequent hands, allowed rejoin, and completed normally. Do not
  reopen the accepted atomic Holm resolver or add a second action owner while
  correcting this presentation seam.

### 13E. Retire residual Lovable social metadata

Status: Queued; discovered during final owned-Supabase production verification
on 2026-08-03.

- The application and production bundle no longer reference the
  Lovable-backed Supabase project, but root `index.html` still declares a
  Lovable-hosted `og:image` and the `@Lovable` Twitter account.
- This is social-preview metadata, not a gameplay, Auth, database, publication,
  or runtime dependency; it does not block the completed backend cutover.
- Replace it with an owned image/domain and P-Town Poker social metadata, then
  verify the published HTML contains no `lovable.dev` or Lovable-branded
  social tag.

### 13F. Player Balances list escapes its modal

Status: Queued; reproduced in owned-Supabase production on 2026-08-03.

- Runtime: `holm357.com`, immediately after the clean production sign-in and
  lobby smoke.
- Actual: with the full player list open, balance rows continue below the white
  Player Balances dialog and render over the dark page overlay. The screenshot
  shows the `mcru81` row crossing the dialog's lower edge and the next row
  beginning entirely outside it.
- Expected: the dialog remains viewport-safe; its title, close control, sort
  control, and description stay contained while one internal list body scrolls
  through every player. No player row or name may render outside the dialog.
- Current source owner:
  `src/components/AdminPlayerListDialog.tsx`. Its `DialogContent` declares
  `max-h-[80vh]` while the nested `ScrollArea` has an independent
  `max-h-[400px]`; preserve sorting, balance colors, row selection, and the
  transition into transaction history when correcting the containment.

## Documentation/bootstrap

### 14. Complete exact game-rule documentation

Run a read-only source audit to document legal actions, state machines, scoring, dealer/hand/session terminal rules, settlement owners, bot behavior, and source paths. No product changes during the documentation pass.

### 15. Complete repository map

Populate `REPO_MAP.md` from the final tagged source after cutover.
