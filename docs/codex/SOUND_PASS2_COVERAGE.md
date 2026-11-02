# Sound Pass 2 — consolidated audition and coverage, November 2, 2026

This pass is studio-only. No new gameplay integration, database mutation, push,
or production deployment is authorized. New choices require audition approval;
publication requires a separate explicit GO.

## Reconciliation and evidence

Remote main was checked at `5037d7fdf01d1ad4d6e28d926c3b50ac210f3168`.
It already contains Pass 1, the nine selected V2 Take A integrations, and the
November 2 Async audio correction. The isolated `codex/sound-effects-pass2`
branch now includes that baseline. The five overlapping studio/document files
had only newer release authorization, runtime-fixture configuration and release
notes on main; those newer records were retained. All original 27 WAVs and the
exact nine owner-selected hashes remain intact. No current gameplay source was
changed by this extension.

Published evidence: annotated tag `release-async-sounds-20261102-verified` records
the exact main SHA, READY deployment `dpl_EG7YFwyuR2KaWotwgAgpVTvGcrJ3`, and
`index-BoBjW6R0.js` / `Delayed-BYjG4zwR.js`. Prior qualification covered 339
tests and eight native browser flows, including Run21 Pass in Arcade and Async,
repeat fresh actions, mute, resume and historical silence. A fresh read-only HTTPS check again returned 200 for holm357.com and the same
index bundle with the full published SHA. Physical hosted owner
smoke remains pending; source coverage is not a claim of completed phone smoke.

Rule semantics retain the read-only deployed-definition evidence in
[the original audit](SOUND_STUDIO_V2.md#evidence-scope), reconciled against the
[published integration](SOUND_STUDIO_V2_INTEGRATION.md). No fresh database query
or historical-session mutation was needed for this non-gameplay extension.

## The library

51 candidates, three per category: 27 preserved in nine categories plus 24 new
in eight categories. Existing selections are never silently replaced.

| New category | Takes A / B / C | Nominal level / duration |
|---|---|---|
| Quintzee constant-pitch roll | Velvet motor / Pocket arcade / Soft electric purr | -29 dBFS peak; 4 s loop material; actual demo stops at 1.5 s |
| Physical dice in cup | Soft cup / Dry cup / Deep cup | -27 dBFS; 4 s loop material; actual landing near 900 ms |
| 357 descending countdown | Descending felt / Three soft bells / Mellow steps | -29 dBFS; 2.7 s sequence; 180 ms tones at 0/0.9/1.8 s |
| Run21 exactly 21, optional | Twenty-one glow / Little orbit / Clear answer | -28 dBFS; 450 ms |
| Run21 bust, optional | Soft landing / Low orbit / Dusk tap | -30 dBFS; 380 ms |
| Farkle bust | Empty cup / Felt pause / Quiet tumble | -29 dBFS; 420 ms |
| Quintzee Upper Bonus | Upper glint / Warm thirty-five / Bonus bloom | -27 dBFS; 550 ms |
| Quintzee All Filled | Full card / All in place / Final square | -26 dBFS; 650 ms |

Cup takes are three edits of the retained real Kenney dice-shake recording,
not three independent recordings or a verified leather/plastic provenance claim.
Random overlapping windows vary the contact texture without recurring initial
attacks. New tonal sounds are original deterministic synthesis. Catalogs record
hash, duration, peak, RMS, recipe and source. Peak/RMS are not perceptual LUFS.
The original Chucky takes remain explicitly synthetic character vocals, 1.08–1.42 s.

## Trigger and synchronization handoff

| Event | Exact owner / identity and boundary | Preserve / admission requirements |
|---|---|---|
| Quintzee roll | `useQuintzeeRumble`: scope + authoritative rollSerial; only a new admitted animation. Default 1500 ms, configurable 300–2500 via `quintzeeRollTiming` | Future loop starts with actual rumble, cancels on its cleanup, and stops with the same visible endpoint. Suppress `QuintzeeView` landing request for this roll. Do not add a landing or tail. Held set is frozen for that roll. |
| Yahtzee/Horses/SCC shake | `DiceRollAnimation`: exact game/round/roll `audioIdentity`, runKey and actual animating indices | Start at first moving frame; stop at its `phase='landing'` commit (900 ms default), not its onComplete callback 100 ms later. Then A for multiple unique animated dice, B for one; zero animated dice is silent. Do not sound held dice. |
| Physical preview | Real `DiceRollAnimation`; development-only MutationObserver observes its final-face commit. Real Quintzee die + rumble hook | Observer is only a studio adapter; integration should use an explicit callback from the existing animation owner. Never use a DOM observer as gameplay authority. Cancellation unmounts animation and retires the audio owner. |
| SCC No Qualify | Server-completed `isQualified=false`, landed receipt plus existing result/overlay admission | Existing selected A stays. No intermediate unqualified-roll sound. Replaces ordinary score post. |
| SCC Midnight | Complete qualified 6/5/4 with two cargo totaling 12; existing Midnight flash admission | Two sixes alone are insufficient. Multiple Midnights can tie. Keep the selected cue separate from final victory. |
| Horses Five Ones | New admitted roll with all five actual values equal to 1 | Wild-assisted five of another value is not Five Ones. Published cue currently replaces landing. Reconcile shake → landing → achievement sequencing explicitly after audition, without altering result authority. |
| Dice score post | Horses/SCC completed result; Yahtzee accepted category/action sequence; Quintzee new category revision; Farkle banked overlay receipt | Zero counts as posted. No sound from totals rerendering, rolls or holds. Special result replaces routine posting. No new count-up. |
| Yahtzee achievement | Committed Yahtzee 50 or valid accepted repeat bonus with the already-qualified box | A preview is not a score; scratch does not qualify. Quintzee only newly scored Five alike 50, no joker/repeat bonus. |
| My/opponent leg | Existing live UUID award receipt; `LegEarnedAnimation` native movement start | Compare player UUIDs; exact dealer/hand/player/count identity. Terminal preludes suppress ordinary awards. |
| Sweep | Immutable `Terminal357Descriptor` generation and admitted sweep animation | Configured legsToWin, never third-leg inference. Reserve whole terminal family against Winner A and ordinary leg, even after sample ends. Instant 357 without opening legs does not manufacture a sweep animation. |
| Chucky | Published `HolmDealOrchestrator` accepted hand-wide Chucky manifest, pre-flight dispatch | Existing solo/deal gates; once per wave/hand receipt and 30 s cooldown. This is Chucky's actual dealing wave, not every card or initial generic dealer PRE_DEAL. Preserve until owner contextual audition. |
| 357 3/2/1 | `threeFiveSeven/decisionReveal` authoritative reveal schedule and the displayed number transition in the shared decision presentation | Exact round/reveal generation + displayed beat; one short tone per fresh beat. No catch-up of skipped numbers, no sound at DROP, no gameplay delay. Studio uses the existing 900 ms countBeatMs; integration follows the actual server reveal window. |
| Run21 Pass | `useRun21PlacementAudio` + `cardPassCue`; Async `turnAudio` exact accepted request/actor/segment/revision | Preserve approved effect and fresh-event adapters. No replacement proposed. |
| Run21 exactly 21 / bust | Existing accepted placement feedback/outcome classifier and visible accent | Optional alternatives only. Retire matching existing outcome cue if selected, avoid layering. No scoring changes. |
| Farkle bust | Committed farkle result and admitted bust overlay | New optional outcome cue only. Existing Farkle rolling/landing stays unchanged. |
| Quintzee Upper Bonus | Frozen version's `celebration.id`, startedAt/countAt/endsAt; first visible bonus highlight | Current v3 authority already owns +35 and timing. Recovered/historical celebration is silent; routine posting and larger result cues must not stack. |
| Quintzee All Filled | Authoritative completed board/result clearBonus and actual all-filled highlight | Do not infer a fixed +35 for historical configurations; read frozen rules/result. No extra delay before final score/victory. |
| HOLM folds / reveals | Actual canonical fold transport / community CSS flip | Reuse Paper Slide B / Soft Card Clip. Confirm every fold path reaches canonical flight; never cue a fold button before accepted action. Preserve Recorded Glass. HOLM has no Async adapter. |
| Taxes/re-antes | Committed canonical chip batch + actual native chip movement in `ChipTransportRuntime` | No audio call exists in this owner today. Existing lab chip/pot samples exist but no published approved chip-transfer mapping was found. Selection/identity must be reconciled before integration. One event per transfer batch, not each chip. Audio never writes finance or controls completion. |

## Complete game/mode coverage matrix

Legend: **C** = Covered and working in the cited source/local qualification;
**R** = Existing approved sound can be reused (mapping still needs qualification);
**N** = New candidate required (provided above, awaiting selection);
**S** = Intentionally silent; **—** = Not applicable. C never implies physical
iPhone/Android or all hosted multiplayer smoke has been performed this pass.
Modes are from `gameCatalog`, with Async support from `delayed/client.ts`.

| Game | Canonical multiplayer | Arcade | Async | Meaningful events / classification |
|---|---|---|---|---|
| HOLM | Yes | — | — | C deal, community/Chucky reveal, Cracked, settled victory, Chucky wave; R confirm fold-path coverage; R chip taxes/re-antes (catalog approval discrepancy above); S ordinary button/menu presses |
| 3-5-7 | Yes | — | — | C deal, personal/opponent leg, eligible sweep, settled winner; N 3/2/1; R taxes/re-antes; S DROP extra impact and terminal ordinary-leg duplicate |
| Cribbage | Yes | — | — | C deal, cut reveal, peg landing, discrete combination highlight, settled victory; S count-up replacement and routine menu clicks |
| Gin Rummy | Yes | — | — | C canonical deal/card transport, existing knock, settled match victory; R any nontransport visible discard/reveal gaps; S hidden opponent card changes |
| Canasta | Yes | — | — | C canonical card transport and settled victory; R visible nontransport card changes if any; S a new meld fanfare (no request) |
| Six-Card Golf | Implemented; admission qualified separately | — | — | C source transport, reveal/scoring flips, existing scoring, final winner; S new per-card flourish. Audio coverage does not authorize game activation |
| Battle 31 | Yes | — | — | C card transport, existing knock/round cues and settled victory; S additional routine clicks |
| Horses | Yes | — | — | C landing A/B, Five Ones, score post, final winner; N continuous cup shake; S hold toggles |
| SCC | Yes | — | — | C landing A/B, confirmed No Qualify, Midnight, score post, final winner; N continuous cup shake; S interim unqualified state and hold toggles |
| Yahtzee | Yes | — | — | C landing A/B, committed category post and Yahtzee/repeat bonus, winner; N continuous cup shake; S held dice and score previews |
| Farkle | Yes | — | — | C existing landing, banked score post, winner; N restrained bust; S shake change (outside scope), hold toggles |
| Run21 | Yes | Yes | Yes | C fresh bell, accepted placement, approved Pass, existing failures/score/medal/final winner where applicable; N optional exactly-21/bust alternatives; S Async historical review and hidden opponent actions |
| TriTowers | Yes | Yes | Yes | C fresh bell, opening deal/upcard, play/draw, tower clear, score/fanfare and eligible final winner; S historical Async replay, new replacement palette |
| 11 Up | Yes | Yes | — | C confirmed groups, existing intro/scoring, canonical final winner; R inspect any visible card movement bypassing transport before adding Paper Slide; S new arbitrary click sounds |
| Boxdrop | Yes | Yes | Yes | C existing block/clear accents, score/result audio, fresh bell (including Async), eligible final winner; S historical reviews and every routine box click. No new blanket sound set needed |
| Trip Flip | Yes | Yes | — | C board moves, Trips/Runs/Special clear cue, shared count-up and final winner; S new redundant per-tile clicks |
| Take 2 | Yes | Yes | — | C visible card changes, existing intro/result/count-up and final winner; S extra stock penalty sound unless separately requested |
| Royal Flash | Yes | Yes | — | C accepted placements, existing synchronized score presentation and final winner; S blanket menu/action sounds |
| Race Poker | Yes | — | — | C card selection, existing hoof/warning cues, settled final winner; S duplicate pre-settlement victory. Arcade/Async do not exist in current catalog |
| Ptown Words | Yes | — | Yes | C existing accepted word/tile/score/result paths and final winner; S hidden peer work and historical reviews; R new meaningful interaction only if later smoke identifies a gap |
| Mega Card Golf | — | Yes | — | C card flight/reveal, tee, cup, hole, course finale, scoring; S duplicate Winner A layered over its existing course celebration |
| Quintzee | Yes | Yes | Yes | C score post, Five alike, existing final results and landing; N continuous fixed-pitch roll replacing landing, Upper Bonus/All Filled accents; S old landing after new roll integration, hold toggles and historical reviews |

Common to all applicable modes: global Sounds, mobile gesture unlock, immediate
mute, context retirement, replay receipts and silent recovery remain the existing
AudioManager's responsibility. Menus, repeated score paints, opponent private
actions, resume catch-up and historical result views stay silent. No ambient bed
is added. This matrix covers every catalog game; it does not invent unavailable modes.

## Priority and implementation order after selection

1. Integrate the selected two roll families at their existing presentation owners;
   prove starts, exact landing/stop, held dice, canceled rolls, changed scope,
   repeated snapshots, mute and background. Quintzee landing suppression is part
   of that change; Farkle is excluded.
2. Add descending countdown at displayed beats. Preserve accepted Run21 Pass;
   optional Run21/Farkle/bonus cues replace competing cues for one result identity.
3. Audit HOLM fold paths and resolve the chip-transfer catalog discrepancy, then
   attach one approved chip cue per live admitted financial presentation batch.
4. Requalify the nine existing signature integrations, configurable 2/3/5+ legs,
   Chucky contextual timing, local/peer/spectator attribution and sweep reservation.
5. Desktop native audio plus iPhone/Android PWA listening/recovery smoke, followed
   by a separate explicit production GO. No DB migration is proposed.

Keep published priorities: sweep 110 / winner 100; specials 85; legs 75/70;
No Qualify 65; Chucky 60; post 55; movement below these. Do not simply raise
new cues above every old one. Stop a roll at its visible boundary, play the
matching landing, and serialize or duck an achievement only when its actual
presentation allows it. Receipts cover the whole result, not just WAV duration.

## Audition

Desktop: http://localhost:4318/#rolling-demos
Phone on the PC's Wi-Fi: http://192.168.1.242:4318/#rolling-demos

The PC and local server must stay running. Favorites persist per browser and
export exact candidate hashes. No account or production Sounds setting is changed
by this isolated local preference adapter. Playback uses the same central manager
and speaker component. Physical phone reachability and acoustic judgment require
owner smoke; mobile-sized browser checks are recorded separately in the README.
