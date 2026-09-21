# Wave 2 qualification — confirmed Farkle notice defect

Tested source: `9bc4e37092bc344b20059a1bcfbb48aee1d18bf5`.
Classification: **product presentation defect**, not a proof or timing defect.
No product code or assertion changed.

The resumed remaining matrix passed its partial-Hold, Roll N, durable committed
row and ordered remote animation checks, then failed at
`e2e/farkle/remainingPlayable.local.spec.ts:72`: the canonical HOT DICE notice
never appeared. The first attempt stopped; it was not retried as qualification.

## Concrete owner and failure boundary

`FarkleGameTable.tsx:91` emits `gameplay_notice` with
`payload: { text: 'HOT DICE' }` (or `text: 'FARKLE'`). The existing canonical
renderer at `announcements/renderers.tsx:238` reads `payload.title`, falling back
only to the specific `variant: 'go'` contract; absent a title, it returns `null`.
The shell announcement layer then returns no rendered notice.

The selector used by the proof matches the actual canonical notice container.
The event's session/round scope is accepted. No scope, dedupe, late-observer,
queue-delay or missing-authoritative-event explanation accounts for this failure.

## Actual-client diagnosis

A separate diagnostic performed normal UI setup and authoritative Roll/Hold
actions using isolated TEST ONLY rules. At sequence 13 of round
`cb4ae551-4c8d-4eef-bbd7-dad00f56f44b`, the server committed `hot_dice`, THIS TURN
450, all six available indexes and scoring cycle 2.

Read-only animation-frame sampling of the existing announcement context and DOM
recorded the exact active event and complete display lifetime on both clients:

| Client | Active HOT DICE event observed, UTC | Provider disposition | Render result |
| --- | --- | --- | --- |
| Desktop | 19:10:47.693 | accepted, promoted immediately, expired after 1603 ms | `null`; no matching rail node |
| Mobile | 19:10:47.861 | accepted, promoted immediately, expired after 1601 ms | `null`; no matching rail node |

Both captured payloads were exactly `{ "text": "HOT DICE" }`. Calling the
existing renderer with each captured event returned `null`. A pure diagnostic
call with the same label under `title` returned a renderable element; this did
not change application state or the event supplied to the live provider.
The diagnostic passed in 36.7 seconds because it confirmed the defect; it is not
a passing qualification case. The same Farkle producer supplies the incorrect
key for FARKLE notices.

## Smallest proposed correction — not implemented

Change only the Farkle producer's payload property from `text` to `title`, keeping
the existing semantic ID, scope, TTL, priority, queue behavior and authoritative
event trigger. Add focused coverage that uses the canonical renderer for both
Farkle notice labels, then repeat the real-browser notice/refresh qualification.
Do not broaden the shared renderer or weaken the browser assertion.
This requires no shared-owner extension, SQL change, migration, scoring change,
Horses/SCC change or production release-setting change.

## Qualification and cleanup

Wave 2 remains unqualified and unmerged. The seven-game browser campaign did not
start; final application/harness/typecheck/build, SQL/recovery and fresh production
metadata gates were not executed after this failed browser gate. Prior passing
results do not substitute for those final gates.

All isolated games, users/profiles, transfers and test telemetry were cleaned.
Only the three pre-existing private controls and seven existing-game defaults
remain. Local Farkle creation is disabled; client and scheduler are stopped.
All 384 local function definitions and metadata match previously recorded applied
production metadata. This comparison is not a fresh production query.
Production was untouched: creation stays disabled, admin-only remains enabled,
and scoring defaults remain unapproved and unseeded.

Evidence: `supabase/farkle/wave2-qualification/20260921-hot-notice/` preserves the
original failed attempt, timestamped diagnostic, exact diagnostic source and
cleanup manifest. No credentials or browser trace archives are published.
