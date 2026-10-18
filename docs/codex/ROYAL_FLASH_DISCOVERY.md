# Royal Flash — bounded discovery and implementation plan

Date: October 18, 2026. Status: awaiting review of the P-Town rules proposal; no product
implementation, migration, activation, or publication.

Repository baseline: `098077f9bedc4e9dede8767b829c6dfdc207bc27`.
Isolated branch: `codex/royal-flash`.
Worktree: `C:/Users/jerem/.codex/worktrees/royal-flash/rule-your-poker`.
The original main checkout's modified workflow files, AGENTS.md, snapshot and
untracked evidence/test/video files were preserved. No dependencies installed.

The pasted request authorizes both-mode implementation, qualification and
production-first delivery. It explicitly requires material original-rule gaps
to be resolved before implementation. Jeremy selected option 2: propose explicit
P-Town rules for review. The concrete proposal is in
[ROYAL_FLASH_RULES_PROPOSAL.md](ROYAL_FLASH_RULES_PROPOSAL.md). That choice
authorizes preparing the proposal, not silently choosing the missing gameplay
rules. Review of those rules is not a second delivery approval.

## Rule evidence and limits

These sources describe different releases; they do not together establish one
fully verified executable ruleset. No generic Poker Squares table or another
game's clock has been substituted.

| Topic | Evidence | Implementation status |
|---|---|---|
| Board and scoring directions | Merit's Game Descriptions specifies a 5×5 grid and poker hands in rows and columns. [Manufacturer document](https://www.meritgames.com/service%20center/GameDescriptions.pdf) | Confirmed mechanic; do not invent diagonal scoring. |
| Standard round count | Merit's Tournament Megatouch manual distinguishes two standard Royal Flash rounds from four tournament rounds. [PM8804](https://www.meritgames.com/Support_Center/manuals/TOURNAMENT.pdf) | Two standard rounds supported for that release; recommend standard play as the target. |
| Bonus qualification | Maxx Classic's manual gives 180,000 in Easy Mode and 200,000 otherwise. [PM0220-08](https://www.meritgames.com/manuals/Support_Center%7CMegatouch%2520Blue%2520Maxx%7Cmanuals%7CPM0220-08.pdf) | Thresholds documented; recommend normal difficulty. Qualification timing, number and special behavior of bonus rounds still need verification. |
| Free replay | The same manual lists 300,000 for an initial bonus replay. | This is a separate operator feature, not the bonus-round threshold. No arcade-credit system is proposed. |
| Hand values | A court record reproducing inspection of a Merit Megatouch Maxx cabinet lists royal flush 500, straight flush 400, four of a kind 300, full house 200, flush 100, straight 90, three of a kind 80, two pair 70. [Cabinet observation, factual findings 2 and 10](https://jurisprudencia.pt/acordao/79407/) | Corroborating evidence for that cabinet, not a complete target score specification. Single-pair/high-card treatment, ace handling, incomplete lines and score conversion remain unresolved. |
| Dealing and placement | That observation describes random card order, one visible top card and placement into the grid. | Exact deck composition, uniqueness, redeal policy and any pass/discard mechanism unverified. |
| Card changes | The observed game displays a hint about changing any card to improve a hand. | Replacement versus swapping, when allowed, limits and costs are unresolved. Do not assume cards become permanently locked on placement. |
| Timing and speed | No retrieved manufacturer source specifies the full clock/scoring algorithm. | Start trigger, Ready allowance, round duration, ticks/multiplier, bonus calculation and per-round reset are blockers. |
| End conditions | Filling the grid is described, but the change-card hint leaves the complete finish sequence unspecified. | Take Score availability, full-grid behavior, stock exhaustion, partial-board timeout scoring and bonus termination need verification. |

Research also followed the historical Royal Flash demonstration link from
[this cabinet page](https://toonzjukebox.com/forsale/megatouch/megatouch.htm).
Its manufacturer target `https://www.meritgames.com/products/Games/royal%20flash.mpg`
returned 404. No gameplay video was verified. The existing local video frame
inspected in `temp videos` shows TriTowers, not Royal Flash.

The next decision is approval or correction of the explicit P-Town proposal.
Its added rules must be labeled as such in help and the frozen specification;
they cannot be described as verified Megatouch behavior.

## Current repository and deployed ownership

Read the required index/release context, architecture, shared-rule contract,
financial release gate, relevant stable checkpoints and recent smoke evidence.
The October 18 release entries supersede older historical notes. In particular,
Run21 source currently defines `run21/3`; the older shared-rule document's
`run21/2` description is historical, not a current admission default.

A single read-only production inspection of project `xvhmbuppghwmwpwrkzao`
retrieved relevant deployed function definitions, indexes and latest migrations.
It confirmed installation through `20261018180003`, including stake consent
`20261018171604`, smoke corrections `20261018161030`, and unified TriTowers
records `20261018173541`. This was inspection, not a new financial proof.

| Concern | Existing owner/reference | Royal Flash application |
|---|---|---|
| Shared gameplay | `supabase/tri-towers/v2.sql`, later version dispatch; `supabase/eleven-up/rules.sql`; Run21 `src/lib/run21/{rulesets,rules,board}.ts` | Prefer the accepted SQL core pattern: deal/reduce/finish/redact/qualify functions independent of sessions and mode. Freeze `royal-flash/1` at admission. |
| Stake consent | Deployed configure RPCs; `private.advance_ante_phase_exact`, `private.megatouch_begin`; `supabase/eleven-up/continued-smoke.sql` | Configure an offer first; only the caller is accepted initially. Create no live round/match until all remaining accepted participants have resolved consent. |
| Changed stake | `private.megatouch_frozen_stake` rejects changing the offered configuration; bootstrap verifies offer stake equals session stake | Never mutate an accepted offer in place. A replacement offer must have fresh identity and invalidate all prior noncaller acceptances. Prove delayed old accepts cannot start it. |
| Multiplayer identity | Match primary key `dealer_game_id`; requests `(dealer_game_id, request_id)`; state includes session/round/player/stage | Preserve exact immutable identity, payload fingerprints, revision checks and replay receipts. Reset local transients on run/dealer/round/actor changes. |
| Financial outcome | Deployed `private.eleven_up_settle`; `public.settle_gameplay_chip_transfers`; terminal result unique index `(dealer_game_id, hand_number, settlement_key)` | Server chooses winner(s), splits whole chips canonically, writes real player balances/ledger/results/snapshots and terminal disposition atomically. No alternate balances or settlement owner. |
| Bots/recovery | `supabase/tri-towers/authority.sql` and versioned overrides: redacted policy, durable `bot_due_at`, locked revision checks and recovery | Adapt scheduling and redacted input, not TriTowers move heuristics/timing. 11 Up explicitly rejects bots and is insufficient as a wholesale template. |
| Arcade | `supabase/eleven-up/arcade.sql`, `server/arcade/service.ts`, `api/arcade.ts`, existing run/receipt/result tables and recovery worker | Call the exact same Royal Flash core. Keep ownership, private deck and immutable results; zero multiplayer/session/financial writes. |
| Score accumulation | Deployed `arcade_eleven_finish_round` and `arcade_eleven_valid_completion` | Store round delta and cumulative total separately. Final total is the last cumulative value, never the sum of cumulative snapshots. |
| Transport/recovery | `src/hooks/useElevenUp.ts`, `src/lib/elevenUp/model.ts`; Run21 immutable pending intent pattern | Persist one UUID/payload through uncertainty, reject stale/regressive/conflicting snapshots, reconcile on realtime/focus/reconnect; no repair polling. |
| Presentation | `FullscreenGameShell`, `CountdownDots`, `TriTowersPresentation`; shared table retention/financial adapters | One fullscreen surface, existing header/navigation and interaction layer. Use container-relative geometry, fixed card aspect ratio and genuinely centered score. |
| Introductions | `useTriRoundPresentation`, round scope/recovery epoch and authoritative deadline | Render intro in a visible layer; seek on reconnect. No animation callback may advance the game or settlement. |
| Audio | `src/lib/audio/audioManager.ts`, `platformAudio`, shared placement/count/celebration hooks | One application context. Current code already includes trusted-gesture resume/priming, unplayed timeline preservation and interruption cleanup. Add game-scoped cues; qualify cross-mode lifecycle before claiming reliability. |
| Records | `supabase/eleven-up/smoke.sql`, `private.score_record`, `private.all_score_results`, `scoreAchievements.ts` | New Royal Flash identity only. Record eligible human performances and use immutable winning-score facts. Existing 11 Up record insertion rejects a match containing any bot; assess eligibility per human for Royal Flash rather than inheriting that blanket exclusion. |

The scoped ownership search found no Royal Flash implementation. Existing code
and installed definitions provide reusable orchestration, not the missing game
rules. Known presentation/audio issues are acceptance targets, not presumed new
root causes requiring speculative shared rewrites.

## Implementation plan once rules are resolved

1. **Freeze rules and qualify database authority.** Record every legal action,
   score component, deck rule, deadline and finish condition. Implement one
   private versioned core and thin multiplayer/Arcade adapters. Stage admission
   disabled. Prove both modes produce identical board outcomes from identical
   state, action and authoritative time.
2. **Complete multiplayer orchestration.** Extend canonical setup/consent dispatch,
   spectator projection, bot scheduling, recovery, history and terminal
   continuation. Use canonical atomic settlement and chip presentation. Keep
   approved-account/fake-money gates; real-money activation is out of scope.
3. **Complete Arcade and records.** Register catalog/routing, run creation,
   resume/abandon, worker dispatch, immutable score results, personal bests and
   leaderboard return. Keep historical game versions and compatibility groups.
4. **Build the shared view and audio.** Both modes render the same grid/current
   card/controls/help. The top band is round / centered score / rule-supported
   Take Score. Active play uses dots driven by the Royal Flash deadline; numeric
   countdown appears only if the verified rules include Ready. Immediate pending
   placement feedback cannot expose future cards or calculate authoritative
   scores. Round, scoring and celebration sounds use cancellable shared receipts.
5. **Qualify and release.** Run candidate rollback and independent-connection
   proofs, focused app/harness checks, TypeScript and one production build/browser
   pass. Apply only qualified migrations, rerun installed proofs, deploy compatible
   workers and activate qualified admission. Review/commit/tag/integrate/push using
   the existing helper. Verify one production deployment after an appropriate wait.
   Report exact commit/deployment and separate owner smoke from automated evidence.

## Required proof and acceptance matrix

- Every hand category/overlap, ace edge, incomplete line and verified replacement
  rule; deterministic same-input mode parity; deck uniqueness/private future cards.
- Before/at/after every clock boundary; invalid first action cannot start a clock;
  expired input cannot outrun timeout; bonus eligibility and cumulative score once.
- Duplicate/retried/changed-payload/stale placement, two competing commands,
  reconnect during uncertainty, recovery after no clients and interrupted workers.
- Setup default/edit, noncaller explicit acceptance, changed-offer invalidation,
  decline/leave/timeout, spectators, bot turns and replay/history redaction.
- Actual before/after canonical balances and balanced ledger transfers for winner,
  multiple winners and all-player tie. Inject transaction failure. Verify one
  result/snapshot/receipt for replay, late replay and concurrent settlement, plus
  authorization, successor isolation, continuation and Session Ended.
- Arcade write guards over multiplayer/financial tables, immutable completion,
  top-ten and personal-best facts; all existing games' score rows and leaderboard
  compatibility unchanged. Winner announcements exclude losers' record positions.
- Full games in both modes at 320×568, 390×844, 844×390 and desktop: full grid,
  readable ranks, visible introductions, no stretching/clipping/scrolling, live
  input during decoration, all table/HUD artifacts retired at Session Ended.
- Desktop audio checks for fresh launch, both mode-switch directions, new game,
  navigation, reload/reconnect, background/foreground, mute and context interruption.
  Physical iPhone Safari verification must be reported separately and remains
  Jeremy's device smoke unless an actual device session becomes available.

Preserve list: all existing Run21/TriTowers/11 Up rules and admitted configurations;
their records/history/leaderboard mappings; frozen sessions; canonical financial
and shell owners; unrelated main-checkout changes; push helper and approval rules.

The discovery above preceded Jeremy's rule approval. Implementation and current
qualification are recorded in `ROYAL_FLASH_QUALIFICATION.md`; the production
migration and recovery worker are installed, with admission controlled separately.
Physical iPhone Safari acceptance remains outstanding.
