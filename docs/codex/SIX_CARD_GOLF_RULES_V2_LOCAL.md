# Golf rules and display — October 22 local candidate

Base: published `bd6418ed884e2c517d095e4cde3b2846fc66fffe`.
Branch: `codex/golf-rules-display-v2`.
Owner approved implementation of six smoke observations and answered the queue
question: finish the triggering turn normally, then give everyone a final turn,
including that actor. This pass permits local tests and preview only.

## Rules and authority

| Contract | Candidate behavior |
| --- | --- |
| Version | Future admission chooses `six-card-golf/2`; existing `/1` offers and matches remain valid and unchanged. |
| Core game | Canonical multiplayer table; 2–4 participants, strategic bots; one 52-card deck, no jokers; fixed six-card tableaux; nine holes. Scoring, stake consent, shared ties and one atomic match settlement remain unchanged. |
| Ordinary ending | Exposing all six gives each opponent one final turn; finisher excluded. |
| Stock ending | On a stock draw, compare the remaining stock count with the number of participants whose tableau still contains at least one concealed card. Exact equality latches the actor in authoritative `stockFinalTrigger`. The pending draw is not stock. |
| Triggering turn | Finish it normally by replace or reject. Then queue every participant clockwise, next player first and triggering actor last. |
| Simultaneous six-exposed ending | Ordinary opponents-only ending takes precedence if that triggering turn exposes the actor's final concealed card. |
| Existing final queue | Neither stock equality nor another full exposure can restart, extend or replace it. Each completed queued turn consumes one entry. |
| Warning | During the pending threshold draw: “Finish this turn · then one final turn each.” On queue admission, the existing persistent FINAL TURN affordance applies. Warning uses only public stock count and exposure masks; the database owns the latch and queue. |
| No-reveal restriction | Removed only for `/2`. No turn cap, compulsory reveal, wall-clock scoring or bot-only termination substitute is introduced. Repeated discard pickups can prolong human play indefinitely under the approved rule. |
| Pause/recovery | Preserve the pending draw, latch, queue and turn allowance; pause duration never resolves gameplay. Existing recovery, control and timeout policy remains. |
| Scoring/privacy | In-play totals use completed holes. After a queue ends, authoritative reveal/scoring remains atomic; presentation holds that new hole out of leaderboard, Info, history and manual scorecard until counting finishes. Reconnect seeks the same persisted presentation boundary. No concealed value contributes to any in-play subtotal. |
| Timing | Frozen Scoring Delay and Results Duration remain 1200/5000 ms by default. Pencil writing uses 3000 ms, capped to leave 200 ms within a shorter configured results hold. Only the newly completed hole animates. |
| Finance | Settlement, canonical balances, receipts, ledger and immutable results are unchanged; visual counting does not delay financial authority. |

The stock invariant remains `6N + S + D + P = 52`, where pending draw `P` is 0
or 1. With an empty stock at four participants, discard count is at least 27;
stock empty with only one protected discard is an invariant violation. No new
normal-play resolution is added for that impossible partition.

`supabase/six-card-golf/rules-v2.candidate.sql` is an unapplied review candidate,
not a registered migration. It introduces private `golf_rules_v2` and replaces
only `golf_supported_rules`, `golf_admission_rules`, `golf_integrity`,
`golf_reduce`, and `golf_bot_choice`. The reducer branches on the frozen version;
scoring/dealing/financial formulas are not copied into a new mode. The builder
asserts its bounded substitutions against the existing source. No release flags,
public RPC signatures, tables, indexes, grants to clients or financial owners
are changed. The new private helper explicitly revokes browser execution.

## Presentation findings

- Early totals came from using the newly authoritative `scores` and `holes`
  directly on summary surfaces while the counting sequence was still running.
  All those surfaces now share a presentation-only completed-hole projection.
- Fast pencil writing used a fixed dash length of 100 for shorter numeral paths.
  Normalize each path length to one so the visible stroke occupies the full
  animation duration. Keep the existing hand-drawn double pencil strokes.
- Opponent seat strips previously used only backs and hid the active opponent's
  strip. Golf now supplies public exposure masks: blank white exposed indicators,
  canonical backs for concealed ones, no ranks. The optional shared prop leaves
  Cribbage, Gin, Yahtzee, Farkle and Run21 defaults unchanged.
- Stable opponent felt cards already use the canonical small face tier. The
  temporarily displaced card used the medium default; it now uses the same tier
  as the destination. Own tableau sizing stays unchanged.
- Blank opponent backs were **not reproduced** in this local run. Four concealed
  backs rendered with the selected canonical design and matched their anchors
  in portrait and landscape. No speculative card-back renderer change is made;
  owner recheck remains necessary for the reported production symptom.

## Local evidence and remaining gates

Review directory:
`qualification.local/six-card-golf/review-20261022-v2/`.
The served gallery is
`http://127.0.0.1:5202/qualification.local/six-card-golf/review-20261022-v2/smoke-review.html`.

- `score-evidence.json`: actual local hole plus explicitly labelled public-card
  ninth-hole fixture. Previous totals during counting, updated totals at results,
  pencil progress frames, then winner; no browser errors.
- `geometry.json`, `opponent-390.png`, `opponent-844.png`: actual canonical
  opponent cards at portrait/landscape; no blank backs reproduced.
- `database-proof.json`: rollback-only local candidate rehearsal. `/1` core
  regression; `/2` exact 2–4 threshold, ordinary precedence, pending conservation,
  no cap, bot policy, actual threshold RPC/replay/pause/recovery; complete human
  matches and canonical settlement/ties/failure rollback; mixed-bot continuation;
  legacy presentation regression.
- `threshold-public-frames.json` and threshold screenshots: actual public RPC
  snapshots exported before rollback, rendered by the existing Golf shell.
- Focused tests include actual Game route counting → scorecard → winner →
  Session Ended, stale/repeated snapshots, score masking, legacy/new warning,
  and shared seat-strip compatibility. TypeScript and local build are required.

No production migration or hosted proof has run for `/2`; no candidate migration
has been applied even to the local preview database. All rule rehearsals roll
back and compare reducer hashes before/after. Local presentation previews still
play the installed `/1`; threshold images use exported rollback snapshots.
Before publication: owner visual acceptance, an explicitly authorized hosted
qualification/migration and coordinated client release, existing-match/Canasta
preservation, financial/replay/concurrency qualification and production smoke.
The blank-back symptom requires owner recheck or a reproducible failing capture.
No general local-file Library upload tool is available; use the exact local
gallery and artifacts above.
