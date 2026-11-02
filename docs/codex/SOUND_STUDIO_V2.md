# Sound Studio V2 — audition and event audit

November 1, 2026. Local studio only. 27 new candidates across nine categories,
seven exact approved Pass 1 comparisons, favorites/export and four context
examples. No gameplay integration, migration, production deployment or push.

Branch: `codex/sound-effects-pass2`.
Worktree: `C:/Users/jerem/.codex/worktrees/sound-effects-pass2/rule-your-poker`.
Base: frozen Sound Lab commit `487f98df2828b8048b44dfe87eb136e54ee7043d`, whose
parent is main/origin/main `dbc57dbe85f75265d4d5d60d5f67ce5e7fb24659` at start.
The Pass 1 working tree was neither read nor modified. Its approval message was
read to identify exact approved reference assets. No coordination message was
sent and no wait for that work was introduced.

## Ownership and preserve list

Only `dev/sound-studio-v2/`, this document and an isolated release-note entry
are changed. Existing Sound Lab files, `src/`, `public/`, migrations, game
components, audio manager, account preferences, package/lock files and timers
remain byte-identical to the base. The studio reuses the frozen AudioManager,
GameplaySoundButton, PCM decoder and Pass 1 conductor design. Its local adapter
has a different synthetic user UUID and preference/receipt namespace. This is
one development entry, not another gameplay audio owner. It makes no account
or database calls. Installed dependencies are shared through an ignored junction;
none were installed or changed.

## Evidence scope

Inspected actual client source and deployed function definitions read-only on
Supabase project `xvhmbuppghwmwpwrkzao`. Three bounded metadata queries inspected
`public.horses_scc_apply_action`, `private.horses_scc_player_result`,
`public.yahtzee_apply_action`, `private.quintzee_v{1,2,3}_category_score`,
`private.quintzee_v3_board_reduce`, `public.three_five_seven_settle_game`,
`private.three_five_seven_settle_core` and the configured-target branch in
`private.three_five_seven_resolve_round`. No player/session rows were queried or
mutated. Deployed definitions outrank old prose: Horses/SCC actions are server
owned; their historical client setters in GAME_RULES are not integration owners.

## Common future admission contract

These are researched integration requirements, not implemented gameplay hooks.

1. A newly admitted live, visible presentation is required before requesting
   audio. Initial snapshots, late snapshots, refresh/reconnect, restored tabs,
   historical async results and completed-session entry seed silent baselines.
2. Keys contain session/game, dealer-game, hand/round, action/roll/award/result
   identity and recipient player UUID as appropriate. Authenticate preference
   with the viewer user UUID, but compare recipients using seated player UUIDs.
   Display names and raw `show` booleans are not event identities.
3. Reuse the existing manager's receipts, global Sounds setting and cancellable
   timelines. Consume expired, suppressed and muted events; never replay a queue
   on unmute or foreground. Reset presentation state at exact scope boundaries.
4. One celebration family owns a committed event. Sweep (120) outranks terminal
   victory (100), Yahtzee (75), five ones (70), Midnight (65), character laugh
   (60), my leg (50), opponent leg (40), NQ (30) and score post (20).
   Numeric priorities here are a studio proposal; reconcile with finished Pass 1.
5. Suppression must last for the event identity, not only while a WAV is playing.
   A terminal sweep reserves its family before the final-leg prelude: silence
   both routine leg and later Winner A for that terminal generation. An instant
   sweep with no admitted legs sweep uses the terminal winner policy instead.
   Preserve all existing visual order and financial prerequisites.

## A — SCC No Qualify

- Authority: completed `rounds.horses_state.playerStates[playerId]` with
  `isComplete=true`, `result.isQualified=false`, `rank=0`, `cargoSum=0`, committed
  by Horses/SCC action/recovery authority. Never an intermediate unqualified roll.
- Presentation: `useHorsesMobileController.ts:1144` calls
  `useNoQualifyPresentation`; wait for `resultPresentation.resultReady(playerId)`.
  Start at the first admitted NoQualifyAnimation beat after dice settle.
- Attribution: existing overlay is local player only. Preserve that scope;
  observers/opponents get no negative personal cue by default.
- Identity/recovery: existing live receipt uses dealer-game + round + player +
  rollKey and seeds an initial completed result as consumed. Reuse that receipt
  rather than re-deriving NQ from screen text. Extend audio persistence for remounts.
- Suppression: replaces routine score post for the same turn, below victories.

## B — SCC Midnight

- Authority: a complete qualified Ship/Captain/Crew hand (6 then 5 then 4), with
  two cargo dice summing to 12. The action RPC auto-completes cargo 12. This is
  not any two sixes, and not necessarily a unique winner: multiple Midnights tie.
- Presentation: controller `:1154` admits completed results after dice completion;
  `MidnightAnimation.tsx:53` starts its first flash, then reveal at 350 ms.
  Cue onset should share that first flash admission, without new gameplay timing.
- Attribution: neutral achievement for any visible participant. Carry recipient
  UUID; current component's name-only prop is display data, not enough for audio.
- Identity/recovery: current `midnightShownForRef` uses round + player in memory.
  It can rediscover completed players on remount. Add a fresh-baseline admission
  and exact completed-turn receipt before future integration.
- Suppression: replace score post; final victory may follow its existing later
  presentation, never mix on the same beat. No repeated observer snapshot cue.

## C — Horses Five Ones

- Authority: exact newly accepted roll contains five actual face values of 1.
  `private.horses_scc_player_result` confirms rank 100, highValue 1, ofAKindCount 5.
  Five of another value made with wild ones is a different result.
- Presentation: after the admitted roll's last moving die settles, using the
  shared controller's rollKey/result-ready boundary. This can precede lock-in;
  do not delay the achievement until the whole game settles.
- Attribution: neutral rare-event flourish for the visible roller, local or peer.
- Identity/recovery: round + player + immutable roll/action identity, plus a
  once-per-turn achievement receipt so retaining all five 1s cannot celebrate
  again. No dedicated five-ones animation/event was found; future hook belongs
  at the existing dice presentation owner, not a second dice owner.
- Suppression: landing finishes first; skip ordinary score post if the same
  completion beat carries this flourish. No winner inference from top rank.

## D — Dice score posting; Cribbage boundary

- Horses/SCC: committed completed-turn `result` becomes visible after the roll
  presentation. Key dealer-game + round + player + completed roll/action sequence.
- Yahtzee: accepted score/category action, authoritative scorecard cell changes
  from unset to value (including zero), with exact actor/category/action sequence.
  A hold or roll does not post a score. `yahtzeeAuthority.ts` returns action and
  actionSequence; remote viewers need equivalent snapshot delta identity.
- Quintzee: accepted `score`/`score_zero` category commit in its frozen reducer,
  scope + player + category + revision/command identity. A revision can also
  represent holds/start/recovery, so revision change alone is insufficient.
- Sync/attribution: one neutral quiet cue when the visible score lands; local
  and visible opponent supported, hidden opponents silent. No count-up loop.
- Recovery: compare against a live baseline, not an initial populated scorecard.
  Special achievement/bonus/terminal owner suppresses routine posting.
- Cribbage is not a target for this category. Pass 1's custom sound follows
  discrete highlighted combinations in `CribbageCountingPhase.tsx`, and the
  approved Wooden Peg A follows `CribbagePegBoard.tsx` movement. Neither total
  count-up nor this dice score-post cue replaces that separately approved work.

## E — Yahtzee / Quintzee

- Yahtzee authority: committed Yahtzee category value 50, or a new repeat-bonus
  increment when the old Yahtzee cell was already 50. Each valid repeat grants
  100; joker category rules still apply. A five-alike preview or a scratched
  Yahtzee cell is not evidence of an earned scoring achievement.
- Quintzee authority: an unset `yahtzee`/Five alike cell becomes 50 in the
  versioned server reducer. Its 12 categories exclude Small Straight, and it
  has no Yahtzee joker/repeat-100 path. Upper bonus and speed/round awards are
  distinct. Use exact frozen rules; never reuse Yahtzee bonus assumptions.
- Sync: admit at committed scoring highlight/banner, after dice settle. Existing
  `useQuintzeeScorePresentation.ts` already plays celebrationCue for a newly
  scored five-alike banner in its local sequence; v3 server-owned celebration
  records are for Upper Bonus +35. Future integration must choose one owner and
  replace/suppress the matching existing cue, not layer V2 over it.
- Attribution: neutral special acknowledgment for the visible scorer. Receipt
  includes actor, category/bonus ordinal, round scope and accepted action.
- Recovery/suppression: baseline populated scorecards silently; consume each
  committed score once. Suppress score post for the same event, serialize any
  simultaneous upper bonus, and preserve existing score presentation timing.

## F/G — My leg / opponent leg; configurable finish line

- Authority: `private.three_five_seven_resolve_round` buys one leg for the sole
  stayer and publishes the exact resolution. Multi-stayer hand wins are not leg
  awards. Recipient is `winner_player_id`, not the displayed name.
- Terminal rule in deployed authority is `new_legs >= greatest(1,
  coalesce(game.legs_to_win,3))`. The 3 is a legacy server fallback, not an audio
  trigger. Audio must use the session's admitted target and committed terminal
  result. Leg 3 of 5 stays an ordinary award; terminal leg 2 of 2 can win.
- Presentation: `LegEarnedAnimation.tsx` has presentationCycleId generation,
  cancellation and consumed-generation guards. Attach to first visible award
  start; do not play from an account balance change or every numeric leg delta.
- Attribution: match recipient player UUID to the viewer's seated player UUID.
  Opponents/spectators get the neutral lower-level option. Never username/alias.
- Identity: normal nonterminal awards need a stable resolution/award key passed
  through their existing caller; the animation's Date.now fallback is unsuitable
  as an audio event. Terminal uses the immutable descriptor generation.
- Recovery/suppression: ignore initial legs and terminal reset-to-zero snapshots.
  An admitted terminal sweep suppresses both ordinary leg cues for that result;
  do not play the local rise simply because a terminal prelude shows a leg.

## H — Sweep the Legs

- Authority: instant Round 1 holding with exact ranks 3, 5, 7 settles through
  the canonical resolution; normal configured-leg terminal wins also use the
  shared terminal sweep choreography. This is not a three-leg sound rule.
- `Terminal357Descriptor` is the authoritative-derived presentation boundary:
  source `normal-win` has `hadAuthoritativeLegs=true`; source `instant-357` uses
  `rounds.three_five_seven_legs_at_start.some(legs > 0)`. Instant sweep with no
  opening legs skips SweepTheLegsAnimation. Honor that actual eligibility.
- `ThreeFiveSevenTerminalController.tsx` waits for real deal settlement, runs
  proof cards or final-leg prelude, admits sweep, then the canonical pot/victory
  phases. Synchronize the signature cue with the admitted sweep start. Preserve
  proof/reveal, payout gates, callbacks and transport timing exactly.
- Attribution: winnerId from the immutable descriptor; shared signature for all
  viewers, not personal victory audio for an opponent's win.
- Dedupe: descriptor.terminalGenerationId + sweep phase. Reserve this family
  before its prelude, suppress routine leg and Winner A for the entire terminal
  generation, including after the short sweep WAV ends. Hydration is silent.

## I — Chucky laugh: assets ready, future trigger gap

- Three original synthesized `mwa-ha-ha-ha` candidates: 1.30, 1.08 and 1.42 s.
  Listen for playful mischief and naturalness; these are not actor recordings.
- Inspected `HolmDealOrchestrator.tsx`, `ChuckyHand.tsx`, the
  `MobileGameTable.tsx` Chucky stage and canonical `DealRuntime.tsx`.
  The existing Chucky card wave is gated by solo declaration and community
  settlement. The devil avatar is shown in the later solo showdown/reveal stage.
  Those are not proof that Chucky is the dealer at initial PRE_DEAL.
- Therefore a safe explicit **Chucky-character pre-deal admission** is missing
  from this snapshot. Do not bind to every `chucky-*` card, chuckyActive, an alias,
  every PRE_DEAL render, or the reveal loop. Future integration must identify the
  intended existing character gesture and supply a hand-scoped entry event.
- Proposed key: session + dealer-game + handContextId + deal generation +
  character-role key. At the admitted anticipatory gesture, before the first
  flight, start once; never delay the deal to finish a laugh. If the gesture has
  already passed or recovery skips to READY/GAMEPLAY, stay silent.
- Attribution: shared character cue, not a player achievement. Cancel on scope
  change/background/mute. Proposed fatigue policy: at most once per hand,
  minimum 30 seconds between laughs, and only every third eligible hand after
  the first; choose variation deterministically from event identity. This is an
  audio-only throttle proposal, not a gameplay timer or implemented rule.
- Coordinate with actual character motion and Pass 1 card flights in the later
  integration. This studio's Chucky → deal sequence is labeled a concept.

## Audition and acceptance

Run `bunx --no-install vite --config dev/sound-studio-v2/vite.config.ts`.
Desktop: http://localhost:4318. Same Wi-Fi: http://192.168.1.242:4318.
Strict port 4318 cannot take Pass 1's 4317. The PC/server must stay awake.
No tunnel, firewall edit, credential or production server is involved.

Audition at 100% proposed level, compare against approved dice/peg/Winner A,
star candidates, replay, and export the shortlist. Favorites are per browser.
Test phone speaker, headphones and repeated Chucky/sweep playback before final
selection. Physical iPhone Safari access/playback cannot be certified from the
desktop; browser viewport tests are not physical-device smoke.

Automated checks and evidence are documented in the studio README. Future
gameplay acceptance must cover variable targets (2, 3, 5 and more), local/peer
attribution, duplicate snapshots, winning-leg suppression, instant sweeps with
and without prior legs, background/mute/reconnect and async history. No runtime
gameplay fix or financial release qualification is claimed by this studio.
