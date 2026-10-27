# Quintzee owner-smoke polish - approved publication, 2026-10-27

## Superseding owner instruction and release candidate

The owner explicitly approved publishing this polish without another preview gate,
then added the two-column bonus arrangement before publication. The upper column
shows UPPER BONUS, its configured award, and right-aligned x/63 progress; the other
column shows ALL FILLED and its configured award aligned right. Both columns use
the same enlarged type scale and reserve two lines at phone widths. The base
readout remains visible in neutral, secondary type while the canonical score pill
retains its primary highlight and unchanged motion/audio.

The isolated branch merged current main `9d3bc508061678aa968d12b811f5ac405e3eb7a6`
without conflicts, preserving the installed Golf release. The separate Words
checkout is untouched and its publisher is idle pending its own test correction.
No hosted migration, configuration, admission or customer-data write is needed.
A read-only installed check confirms the previously qualified authority digest
`6a90419c36d6e87058d1219b86ba7583`, /3 rules matching installed authority, /3 enabled,
and /1 and /2 disabled for new admission. Existing fake-only admission remains on.

The new browser proof is `dev/quintzee/score-hierarchy-browser.mjs`, with screenshots
and measured geometry in `dev/quintzee/evidence/score-hierarchy/`. It checks both
themes and modes at 320x568, 390x844 and 844x390, including the maximum legal upper
subtotal, Start and actual final-score presentation. TypeScript, 48 focused tests (including all three corrected Golf expectations),
241 harness tests and the production bundle pass. The full source run passed
3,044 tests; its only three failures were those stale expectations, now covered
by the successful focused rerun. No assertion was removed or weakened.
Exact-SHA production verification must pass before this is called live.

The owner attachment could not be imported through the Library helper because
Windows Python lacks its required `os.setxattr` operation. Actual local browser
screenshots were inspected instead; the failed import was not bypassed.

## Earlier local review checkpoint (superseded)

Owner authorized four corrections and a new local preview. Publication is held for
owner review. This isolated branch starts at released `07a08ea8788ae94595ec35c495ee6c7cd9f424ec`;
it does not include or alter concurrent Golf or Words work. No push, deployment,
hosted migration or admission change is part of this pass.

## Changes

- Upper Bonus and Quintzee banners are direct children of the actual felt plane,
  centered in both axes with a 68% black backdrop. They no longer inherit the
  bottom dice-area bounds. Existing audio, count-up, input gating, server pause
  and event/reconnect ownership are unchanged.
- Upper-score progress is at least 18px, high contrast and bold. The bonus row
  reserves enough height at narrow and landscape sizes.
- Authoritative `all_categories` completion reads `Round Complete`. Only
  authoritative `timeout` reads `Time's Up`; historical `no_matches` is preserved.
- A zero category asks for confirmation only if another unfilled category scores
  positively using the canonical dice scorer. Otherwise it sends the existing
  `score_zero` command directly. No scoring hints, server rules or payouts change.

## End-reason diagnosis

The one recent Arcade record returned by the read-only investigation was `/3`,
with an authoritative timeout, 11 categories, Full House unfilled, zero remaining
milliseconds and multiplier 100. Its round completed at 2026-10-27 18:05:20 UTC.
The prompt does not identify a run ID, so this is evidence about that recent run,
not proof that it is the exact round the owner meant. No false-timeout mapping
was found: the existing view already restricted Time's Up to the timeout reason.

Local unchanged-authority proof confirms a last score at deadline minus 1ms
produces `all_categories`; at the deadline or 1ms after it produces `timeout`
without adding the category. A completed card remains complete if an expiry tick
arrives afterward. Presentation projection preserves the authoritative result.

## Validation and preview

TypeScript and 38 focused assertions pass, including confirmation/cancellation,
locks, authoritative celebration timing/deduplication and the 1500ms roll default.
The local production bundle passes. Browser evidence is saved under
`dev/quintzee/evidence/smoke-polish/`: both themes, Arcade/fake multiplayer, 320x568,
390x844 and 844x390; exact field centering/coverage, dimming, readable progress,
no clipping, zero acceptance and completed-card wording. The preview launcher
creates fresh fixtures when selected; Start and legal interaction are checked.

Laptop preview: http://127.0.0.1:15318/dev/quintzee/smoke-preview.html
The loopback URL does not provide phone access. Production remains unchanged.
Physical owner preview review is the next step; this is not release approval.
