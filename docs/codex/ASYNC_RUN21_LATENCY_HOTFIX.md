# Async Run21 latency hotfix — November 9, 2026

Status: regional candidate published; same-turn comparison demonstrates lower
request latency. A clean longer run under throttling remains pending. The label
change is separate from the measured regional improvement.

Candidate `8415395b545f16a94542cdcb9925237e715fedf0` is READY on deployment
`dpl_HtEQZ3FbutxpeYfZYunrr1DgbzVo`, serving `holm357.com`. An unauthenticated
request to the new route returned the expected 401 and an `x-vercel-id` beginning
`cle1::cle1`, confirming function placement without weakening authentication.
Hap Gmail's final round exercised 12 placements, including slow acknowledgment,
response loss and timeout. That play-money match completed normally. A second
authorized play-money invitation, `ad906e4b-fdfe-4f0b-8bdf-6acbcb9865e8`, is reserved
for a clean longer sequence without injected faults consuming its gameplay clock.

The added qualified-collection test initially used the prompt's name Take Score;
the existing product label is Take Win. Correcting that test selector passed all
17 component cases, bringing the focused total to 88. No product-label change.

## Verified baseline

Signed-in Chrome, desktop mobile emulation at 390 × 844, same computer and
connection for Async and Arcade. Production baseline
`ed3dcf034038929ea279ba11951ac0cc008395fb`; temporary timing build
`4528dd7872e291dfcacec6b52133cb7b97a271c5`.

| Path | Tap to next playable card, ms |
|---|---:|
| Async, normal connection, three baseline placements | 325–445 |
| Arcade, normal connection, two placements | 319–462 |
| Async, Chrome Slow 4G, one placement | 638 |
| Arcade, Chrome Slow 4G, one placement | 638 |

The November 6 release already supplied tentative placement and directly applied
the authoritative action response. Feedback appeared in 6–27 ms. No blocking
post-action refresh was found: response to next playable frame took 7–13 ms.
Realtime sometimes issued a later background read; it did not gate the next card.

Temporary `Server-Timing` measurements on three ordinary placements:

| Tap → dispatch | Tap → response headers | Tap → playable | Auth | Load | Commit | Server total |
|---:|---:|---:|---:|---:|---:|---:|
| 27.4 | 437.4 | 442.3 | 117.4 | 100.6 | 81.1 | 301.0 |
| 61.2 | 481.2 | 491.7 | 93.5 | 116.6 | 127.1 | 338.3 |
| 28.1 | 498.2 | 508.5 | 128.4 | 111.9 | 127.5 | 368.9 |

The three serial remote calls dominate; reducer/projection/serialization and
other local work account for roughly 1–2 ms. These RPC timings include transport
and database execution; they are not isolated SQL execution measurements.

Vercel's existing API runs in `iad1`; Supabase project `xvhmbuppghwmwpwrkzao`
reports `us-east-2`. [Vercel's `cle1`](https://vercel.com/docs/regions) maps to that
region; [per-function configuration](https://vercel.com/docs/functions/configuring-functions/region)
keeps this change scoped to the new endpoint. Regional placement is a
candidate optimization until compared, not a claim that all RPC time is transit.

## Scoped candidate

`api/delayed-run21.ts` reexports the existing authenticated handler. Its function
region is `cle1`. Only requests identified as Run21 use this route; the other
Async games retain their endpoint. The handler, shared TypeScript rules, SQL
load/commit authorities, receipt identity, revisions, score and clock are unchanged.

Run21 requests now have a 10-second transport deadline, including body parsing.
A timeout remains uncertain and preserves the stored command for original-ID
replay. It does not invent a successful move or clear the pending command.

The shared felt retains immediate tentative placement. Async opts into a card
back while awaiting the next authoritative card; `Confirming…` appears after
one second. The existing 100-ms presentation clock drives this label only; no
timer releases gameplay. Other felt callers retain their existing presentation.

## Same-turn regional comparison

[Sanitized per-placement evidence](evidence/async-run21-hotfix-20261109.json).
The signed-in 390 × 844 turn alternated endpoints while keeping the same build,
handler, connection and frozen gameplay rules. Headers confirmed `cle1::cle1`
for the new route and `cle1::iad1` for the old route.

| Uninjected normal placements | Old endpoint | New endpoint |
|---|---:|---:|
| Samples | 5 | 3 |
| Tap → next playable range | 409–543 ms | 194–260 ms |
| Median | 511 ms | 226 ms |

The median decreased about 56% in this small alternating sample. New-endpoint
remote-call totals stayed 96–136 ms through placement 11, including the server
responses whose delivery was deliberately interrupted. Old-endpoint totals on
ordinary moves were 282–378 ms. The one-second status appeared at 1,042 ms during
the intentional 1,800-ms acknowledgment hold; normal new-endpoint placements
did not show it.

The response-loss retry used request `246ea5db-a3d2-495c-a8a2-ea9c1451c47b`, revision
63, and received revision 64 again. The ten-second timeout retained request
`b8c0082c-26c7-45ba-b56d-55043693273a`, revision 65, and retry received revision 66
again. Read-only database inspection confirmed exactly one receipt for each.
The timeout recovery succeeded under Slow 4G. These recovery timings are not
ordinary placement latency samples. The final old-endpoint throttled placement
took 1,307 ms; an ordinary new-endpoint throttled comparison is still required.

The round expired after placement 12 at aggregate 80. Intentional fault waits and
test-driver gaps consumed the gameplay clock; this was not a stuck pending
request. The clean follow-up should play continuously to qualification or the
last legal placement before collecting, so later-card behavior is measured.

## Validation so far

Typecheck and production bundling passed. 88 focused checks cover the adapter,
snapshot admission, sibling lifecycle, delayed status, rejection, original-ID
recovery, Pass/collect transport deadlines, stalled response bodies, and the
qualified Take Win collection flow.

Baseline production tests used the explicitly authorized play-money match
`6fe52863-a93f-4dd0-8402-d4708a024474`, child
`b64507e4-3e61-4de3-ab93-8dcaba45c9f6`:

- A response held 1,800 ms after headers became playable at 2,108 ms; only the
  known placed card was shown while awaiting acknowledgment.
- A discarded successful response retried the original request ID and original
  revision, receiving revision 10 again. Read-only receipt inspection found one
  committed move.
- Reload during an unacknowledged placement restored the confirmed board and
  next card; one receipt at revision 11. Both network attempts' IDs were not
  captured across that reload, so that narrower runtime claim is retained.
- Pass replaced the current card once, preserving the board total. Give Up
  submitted the same collect intent used by qualified Take Win and returned home.
- A deliberately stale revision returned 409, removed the tentative placement,
  and restored the confirmed board at revision 34 without advancing the card.

Physical iPhone acceptance, the clean extended sequence, ordinary new-endpoint
Slow 4G placements, and candidate reopen-during-request checks remain pending.
Samples are exploratory, not percentiles. Temporary server timing is removed in
the `async-run21-timing-removed-20261109` follow-up; the shared API handler returns
to its exact pre-investigation contents. The regional route, timeout recovery and
Async-only status behavior remain. Subsequent clean-run tap/dispatch/response/frame
measurements need no permanent production instrumentation.
