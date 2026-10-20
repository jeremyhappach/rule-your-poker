# Six-Card Golf — local candidate, not release qualified

The implementation approval remains in force. The later coordinated-release instruction limits this pass to an isolated local candidate: **no merge, push, deployment, production migration, or admission activation**.

Current worktree: `codex/six-card-golf-candidate`, based on current main `44dbd5a7d4de4635b258f731558fe346473d82b9`. Only the earlier Golf SQL/proofs/checkpoint were copied from `codex/six-card-golf-v1`; unrelated original edits remain untouched. The lobby catalog integration follows the new main implementation.

## Frozen product contract

| Area | six-card-golf/1 |
|---|---|
| Mode | Canonical multiplayer table only; no Arcade |
| Admission | 2–4 accepted participants including strategic bots; at least one human; existing approved-account eligibility |
| Match | One dealer-game, frozen accepted roster/rules/stake, nine predecessor-linked holes |
| Table | Six fixed positions, two rows of three; retain exposed/cancelled cards |
| Deal | Fresh securely shuffled 52-card deck per hole; no jokers |
| Opening | Reveal any two distinct positions; no peeking/rearrangement |
| Order | Canonical clockwise; first left of hole dealer; rotate hole dealer, independently of session caller |
| Stock | Persist private pending draw; replace any position face up, or reject without compulsory reveal |
| Discard | Pickup must replace a tableau card; displaced card is public |
| Scores | A=1; 2=−2; 3–10 face; J/Q=10; K=0; equal ranks vertically cancel to zero; negative scores retained |
| Ordinary ending | Sixth exposed position gives each other participant exactly one final turn |
| House ending | Count completed turns without a new exposed position; reset on exposure; warn at 4N; at 5N queue all N from next actor through trigger actor |
| Final queue | Once started, subsequent exposure cannot restart/extend/shorten/cancel it |
| Score visibility | Completed-hole cumulative totals only in play; no partial subtotals; reveal remaining cards and score only when final queue empties |
| Timing | 30-second whole turn/opening; draw does not reset; paused time does not advance gameplay |
| Timeout | Real human timeout pauses unresolved decision; fake-money automatic play must retain canonical all-human safeguards |
| Conservation | `6N + stock + discard + pending = 52`, pending 0/1, exact unique partition; recycle all but top discard only when stock needed |
| Integrity | Impossible depleted pool rolls back or holds corrupted committed state; never redeal/score/settle to repair it |
| Privacy | Hide even own concealed positions; pending only actor; bots use whitelisted public/actor observation |
| Result | Lowest nine-hole total; shared winners, no playoff |
| Finance | Each loser pays S once; winners divide `(N−K)S` through canonical clockwise whole-chip remainder; all tie persists result with zero movement |
| Release | Candidate and installed-authority financial proofs, matching app/database, rendered qualification before any activation; Jeremy owns production smoke |

## Implemented locally

`supabase/six-card-golf/` contains the private rule reducer, secure shuffle,
conservation validation, whitelisted projection, observation-only bot policy,
consent adapter, immutable payload-bound action receipts, linked hole progression,
canonical transfer settlement, pause/recovery adapter and closed release gates.
The canonical table adapter, public six-card seat artifacts, completed-hole scoreboard, Rules dialog, stock/discard controls, persisted client intent recovery, capability-gated catalog/setup, Ante Up copy, Run Back configuration and terminal-retention wiring now exist. Browser qualification is incomplete; canonical card flight/audio is not implemented.

Only public revision notifications and authorized snapshot/action RPCs are
exposed; private cards are excluded from public history frames.

The shared ante dispatcher and frozen configuration guard are extended only in
the **uninstalled candidate SQL**. Existing shared catalog/shell/route owners have narrow additive Golf integration. Recovery dispatch/publication registration and release guards still
need their final integration.

## Evidence executed

All database execution below was in isolated local PostgreSQL databases.
`dev/six-card-golf/proof.mjs` installs candidate SQL inside BEGIN/ROLLBACK and
executes:

- Core scoring, negative totals, rank cancellation, legal opening, replacements,
  pending-draw privacy, progress reset/warning/end thresholds, both final queues,
  recycling, conservation and bot observation equivalence.
- Six complete human matches: 2/3/4 seats in both money modes, nine linked holes,
  consent, duplicate/altered/stale requests, final-action replay, actual canonical
  chip changes, deferred journal flush, final snapshots and settlement replay.
- Every co-winner count for 2/3/4 seats in both money modes (18 cases), canonical
  remainder, all-player zero-transfer ties and Session Ended disposition.
- Six injected failures after actual chip changes but before final snapshots,
  proving rollback of balances, transfer journal, result, snapshots and settlement.
- Mixed human/bot consent, autonomous opening and turn, paused-time preservation,
  and real-human timeout preserving an unresolved private pending draw.

`node dev/six-card-golf/concurrency.mjs` and its `--real` variant passed with
independent PostgreSQL connections under the authenticated role: duplicate
opening/draw, lost draw response, competing replacements, wrong actor, concurrent
settlement, and late replay. Both finish with exact balances 91/109 for stake 9.
Their evidence JSON is under `qualification.local/six-card-golf/`.

The isolated reference database predates deployed canonical pause helpers.
The proof imports the current versioned pause owner and all-human pause helper,
and supplies local-only recovery-context/timestamp helpers. These are excluded
from candidate SQL. Full production/reference parity remains a release gate;
passing this local suite is not installed-authority qualification.

## Resumed local validation — 2026-10-20

- TypeScript passed before the last presentation-container correction; a final rerun is recorded separately in qualification.local/six-card-golf/typecheck-final.log.
- Production Vite bundle passed (2,969 modules); ordinary chunk-size warnings remain.
- Four projection tests passed, plus catalog and shell tests: 34 total focused checks.
- Full application run: 2,550 passed / 9 failed. Six failures were the new access hook missing from the existing setup test mock; that mock was corrected. Three other cases timed out under the combined run. All three affected files passed in an isolated recheck (29 tests). The full suite has not been rerun green as one invocation.
- All 241 harness tests passed.
- SQL core, six complete human matches and the 18 winner/tie configurations with financial rollback passed again. Candidate SQL retains a 10-second statement timeout; the multi-match local proof explicitly uses a longer transaction-local test allowance after candidate installation. Synthetic scheduler heartbeat is refreshed between proof groups/admissions; this is not installed scheduler qualification.
- Extended recovery proof passed: deferred departure preserves the committed seat/liability, deletion is rejected, an arrival waits, and fake-money all-human automatic-play pause preserves pending draw/tableau/queue/progress. Real-human timeout and deliberate-pause preservation also pass.
- Actual browser automation passed two-human opening, private stock draw, reload retaining the same pending card, replacement and screenshots at 320×568, 390×844, 430×932, 844×390 and 390×664.
- Those browser assertions do NOT establish visual acceptance. Inspection found small landscape cards and crowded text. The first run also exposed missing canonical play-area reservation causing HUD clicks to be intercepted; the existing shell spacers corrected that. Opponent artifacts were subsequently moved into the canonical felt-height container; reinspection still shows right-edge clipping, so that change is not a claimed geometry fix.
- Local preview startup needed an isolated Vite cache, bounded entry discovery and exclusion of qualification artifacts from watching. Early fixture/navigation timeouts were not counted as successful browser evidence.

Evidence files live under ignored qualification.local/six-card-golf: browser.json, table-*.png, initial.png, regression-recheck.log, harness.log and typecheck-final.log. Earlier independent-connection concurrency evidence is preserved; it predates the latest roster/recovery changes.

This bounded pass stops at the repository execution-budget circuit breaker. No additional product choice is required; the next work is the responsive canonical artifact geometry and outstanding qualification, under the same approved contract and release hold.

## Remaining implementation and release blockers

1. Finish and visually qualify canonical two/four-seat geometry, especially landscape card readability/tap size, text collisions, opponent projection, safe areas and changing Safari chrome. Do not label the five viewport existence checks as layout approval. Implement and verify canonical card flight/deal/reveal audio without reconnect replay.
2. Finish closed-admission migration assembly, current deployed-definition guards, recovery scheduler and public revision publication registration. No Golf production authority/migration exists. Reference/installed-authority parity remains unproved.
3. Extend independent-connection proofs for timeout/final-action/successor races, old requests after continuation, earned zero-client settlement, and corrupted committed-state hold. Existing rule-level conservation rejects invalid transitions; committed corruption recovery needs explicit qualification.
4. Qualify complete mixed-bot matches, two-human nine-hole browser operation, Run Back consent, chip transport, terminal hold, Session Ended and cold-mount routing through the actual application route. Current browser harness mounts the canonical shell directly.
5. Obtain one clean final application qualification run after presentation work. The initial full regression failures and isolated rechecks are recorded separately above.
6. Installed-authority proofs and coordinated release approval remain mandatory before any publication or activation. Both money-mode admissions remain closed; Jeremy has not performed production smoke.

The accepted Boxdrop pattern supplied consent/finance ownership, but its fullscreen board does not provide Golf's shared hidden tableau, multi-hole identity or responsive canonical table artifacts. These differences require the remaining presentation and lifecycle work; no approved rule has been changed.
