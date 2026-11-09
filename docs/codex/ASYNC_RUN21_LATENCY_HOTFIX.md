# Async Run21 latency hotfix — November 9, 2026

Status: regional candidate published, awaiting production comparison. Do not
treat the pending-label change as a measured latency improvement.

Candidate `8415395b545f16a94542cdcb9925237e715fedf0` is READY on deployment
`dpl_HtEQZ3FbutxpeYfZYunrr1DgbzVo`, serving `holm357.com`. An unauthenticated
request to the new route returned the expected 401 and an `x-vercel-id` beginning
`cle1::cle1`, confirming function placement without weakening authentication.
The signed-in test match is waiting for Hap's third round (segment 5); Hap Gmail's
segment 6 must remain unstarted until the comparison probe is ready.

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

Physical iPhone acceptance, regional before/after comparison, and candidate
browser recovery checks remain pending. Samples are exploratory, not percentiles.
Temporary server timing must be removed after measurement; its header window
also expires automatically at 16:00 UTC on November 9.
