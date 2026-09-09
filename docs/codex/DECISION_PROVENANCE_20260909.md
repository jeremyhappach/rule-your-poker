# 3-5-7 decision provenance — September 9, 2026

Jeremy approved this diagnostic change before further game testing, requiring
preservation of current responsiveness. Status: database migration, rollback
proofs, typecheck, 1,538 application tests, 106 harness tests and production
build and published two-browser correlation/timing validation pass.
Release tag: `357-decision-provenance-20260909`.

## Evidence gap and correction

Two disputed Fold reports remain unresolved. The historical action journal
records the decision, not whether a person activated a button. The actual Drop
button and the 3-5-7 automatic-fold effect converge on `Game.tsx:handleFold` and
the same authenticated RPC. Existing Holm traces do not establish 3-5-7 input.
No historical result, decision or balance is modified by this correction.

The button now captures activation time, input modality and the browser's trust
flag before calling the shared handler. The automatic effect supplies
`auto_fold`; a missing origin remains `unknown`. Both Stay and Fold carry a
request UUID, exact game/dealer-game/round/player UUIDs and build identifier.
These are client claims, not proof of a physical human or deliberate intent.
Browser automation and assistive input can also produce trusted events.

`withDecisionProvenance` attaches that small envelope to the existing RPC,
using the existing `x-client-info` header name with a `ptown-decision/1 ` prefix.
This replaces the SDK client label for this request only, avoiding a new CORS
header-name preflight-cache key. The shared client's headers are not changed.
No new request, synchronous storage, gameplay counter or UI is introduced.

The server's AFTER UPDATE trigger independently records the actual decision
transition and auto-fold preference changes in `private.decision_provenance`.
It stores the authenticated caller, server request path, exact game/round,
deadline, recovery context, bot flag, decision and old/new auto-fold preference.
It classifies authenticated decision RPC, server deadline, bot recovery and
authenticated preference RPC separately. Other producers remain unknown.
Client metadata is size-bounded, whitelisted and matched to the exact identity
and decision. It cannot override any server field. Existing clients continue
to work with unknown client provenance. The private table is outside public
projections and Realtime publication; anon/authenticated access is revoked and
RLS has no allow policies. No gameplay/RPC/settlement definition changes.

## Storage and interpretation

Read the private journal with an authorized administrative SQL connection,
filtering `game_id`, `round_id` and `player_id`. Join the existing action row by
`round_id` and `player_id`; that key is unique in `public.player_actions`.
`client_claim.request_id` links to the browser's corresponding request outcome.
`server_context.producer` describes the server entry path;
`client_claim.source` distinguishes the reported button versus auto-fold path.
Compare `auto_fold_before` / `auto_fold` and the separate preference events when
investigating unexpected automatic decisions. Absence of a record is not proof
of either manual action or automation.

Committed decision and preference records remain with their session and cascade
when its game, round or participant is deleted. There is no new scheduled
retention job. Replays do not create a second committed-decision row or replace
the original attribution. Refused/replayed requests and transport failures are
recorded in a bounded, best-effort browser history, not a second server action.
The browser keeps at most 64 local entries at
`ptown:decision-provenance:v1`; it writes only after a response during idle time
(a deferred task on browsers without idle callbacks). Clearing browser data,
an unavailable store or navigation before a flush can lose those local outcomes.
No cards, passwords, tokens or display aliases are logged.

The trigger has a 25 ms diagnostic lock-wait limit and catches diagnostic write
errors, leaving the existing action intact. Such a gap emits a SQL warning and
must be reported as unavailable evidence. Client metadata/persistence failures
likewise preserve the ordinary request/result. This does not promise zero cost.

## Validation and performance

The complete existing 3-5-7 rollback authority proof passed before and after
applying the migration: winner, tie, duplicate, replay, late replay,
authorization, continuation, terminal and scheduled-recovery cases. New proofs
cover button/auto claims, missing/malformed/wrong-identity metadata, forged
server-source labels, replay, authorization, preference, early/due deadline,
bot recovery, private access and an intentionally failed private write that
still commits the valid decision. All synthetic changes were rolled back;
independent SQL confirmed zero remaining provenance proof sessions.

An 80-call-per-condition comparison, including full metadata parsing and the
existing decision RPC/journal, measured:

| Condition | Median | p95 | Maximum |
|---|---:|---:|---:|
| Existing RPC | 2.758 ms | 4.108 ms | 9.591 ms |
| RPC with provenance | 3.095 ms | 3.737 ms | 4.050 ms |
| Applied-schema repeat | 3.071 ms | 3.810 ms | 4.551 ms |

The measured median increment is about 0.34 ms. These are database timings in
one controlled rollback comparison, not an internet-latency guarantee. The
browser check must separately verify actual header delivery and peer progress.
Nine client controls pass for input modality/trust, distinct origins, one
existing request, no pre-response I/O, header/storage failures, replay/refusal/
transport outcomes and bounded history. Supabase's only new advisory is the
expected informational RLS-with-no-policy notice for a deliberately private
table; no policy should be added to expose the journal.

Migration: `20260909222801_decision_provenance.sql` (filename aligned to the
actual applied migration version). Evidence: `artifacts/decision-provenance/`.
The first proof attempts exposed a test CASE-expression syntax issue and a
synthetic bot's missing required user UUID; corrected proof attempts retain
their original failure records. No migration was applied before the full proof
passed. The first full build found unsupported `findLast` in the new test;
the test now uses the repository's supported array operations.

Request metadata follows PostgREST's documented transaction-scoped request
settings: [PostgREST transactions](https://docs.postgrest.org/en/stable/references/transactions.html#request-headers-cookies-and-jwt-claims).

## Published browser validation

Production `d5228d16d63d844fe0f4b128bac030c1315fe8ee` was READY and independently
verified in the public manifest and bundle `assets/index-D2butWDi.js` before
the run. Namespace `provenance-host-20260909-2239` passed in 2.1 minutes, with
one browser pair and zero retries. Fake session:
`4f5712d3-99f0-4071-8199-ba66bddc3e71`; source dealer game:
`5633e2ec-d870-423e-9200-a75a015e2387`; successor:
`9a904655-fa59-4126-b15b-df6d99746865`.

Both browsers passed the five-round buildup, full terminal presentation,
conserved settlement, unchanged Run Back and legal successor actions. The
continuous observer recorded 17 receipts, zero violations, zero coverage gaps
and zero progress failures under the unchanged six-second limit. Both final
screenshots were visually inspected and contained only successor artifacts.

All 12 actual decision POSTs contained matching game/dealer/round/player/decision
metadata and returned HTTP 200. Independent SQL captured all ten source-game
decision records before cleanup, including the final-leg pair. Each matched
its browser request UUID, button activation and build, while the server
separately recorded authenticated actor, deadline and auto-fold=false. The two
successor requests were verified from the trace; they were not included in the
pre-cleanup SQL snapshot. Automatic, deadline and bot attribution were proved
by the rollback tests, not by this manual-button browser row.

| Same host-win scenario, decision actions only | Before logging | With logging |
|---|---:|---:|
| Decision actions | 12 | 12 |
| RPC median / maximum | 119 / 162 ms | 120.5 / 140 ms |
| Peer progress median / maximum | 986 / 1,201 ms | 639.5 / 1,023 ms |
| Progress failures | 0 | 0 |

The baseline is the final healthy host run `transition-host-20260909-2159`.
These sequential samples show no material responsiveness regression; the lower
peer latency is not attributed to logging. Across all 17 actions in the new
run, maximum RPC / actor / peer times were 176 / 1,090 / 1,513 ms.

Guarded cleanup succeeded. Independent SQL confirmed zero rows for this exact
session in games, players, rounds, dealer_games, game_results,
gameplay_transfer_batches and private.decision_provenance. Saved evidence:
`live-summary.json`, `live-journal-before-cleanup.json`,
`live-independent-cleanup.json`, `publication-manifest.json` and the unchanged
run folder/log under `artifacts/decision-provenance/`. Trace SHA256:
`E7018C2AFAF7764239D6938EEF452449B0498E0085B0D2ED7BFFCB6897C2323C`.

This completes the logging prerequisite. Cribbage, then Yahtzee, remain the
next win-sequence targets; no other game or fault branch is qualified here.
