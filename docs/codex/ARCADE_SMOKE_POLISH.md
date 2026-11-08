# Arcade smoke polish — November 8, 2026

Jeremy's fifteen-item handoff authorizes this scoped delivery. Work uses
`codex/arcade-smoke-polish`, isolated from the existing dirty golf checkout.

## Behavior and owners

- 357 Drop /4 keeps twelve placements, three passes, one/two printed-card carries,
  destination wilds and its paytable. Both carry selections now highlight locally
  and require Confirm before the existing authoritative command.
- Every Arcade rules renderer has How to play followed by What scores. Drop's
  examples cover kicker, wild, full-house, straight and flush comparisons. The
  secondary flush rank chooses a hand but does not change the existing 1,620
  natural ace-high flush award.
- Voyage uses the 1466 × 564 captain/6–5–4 banner with one shared gold rules target,
  compact qualification tiles, reduced-motion-aware roll warnings, and Bank left.
  Its SQL adapter owns an eight-second result boundary; the existing recovery
  dispatcher and authoritative boundary refresh deliver the next manual opening.
- `useBankOffer` presents complete quotes for Voyage and Horses, scopes comparison
  to cargo attempt/hand, dings the first bankable offer, and counts later changes
  with existing score audio. Bank continues to submit current server identity.
- Chucky's shared table reserves its decision row, hides folded private cards,
  and presents both rabbit cards from the committed Fold receipt for three seconds.
  Dealing, decisions, timing and scoring remain server-owned. The table is shared
  with multiplayer; its presentation queue retains identity and dedupe guards.
- Horses /3 preserves /1 and /2 and adds manual final banking, including zero.
  Third-roll dice stay visible and Roll disables. The hand badge scales without
  blocking input. Square die boxes and bounded pip tracks preserve all five dice.

## Qualification

Migration `20261108160027` is installed. Candidate and installed hosted rollback
proofs passed, including authorization, duplicate/late replay, terminal receipts,
recovery, nonfinancial isolation, zero/manual banks, Voyage continuation and
Chucky hidden-board boundaries. Historical Horses /1 and /2 proofs pass locally.

TypeScript, production build, 38 focused behavior tests and the 61-test rules/
offer/presentation group pass. The rules completeness fixture now includes the
three newer games; the historical November 4 audit remains untouched.

`dev/arcade-smoke/{drop,chucky,horses,voyage}-browser.mjs` use real local SQL/RPCs
inside rolled-back transactions. Evidence under `qualification.local/` covers:
both carry confirmations, three-round Drop/Voyage completion, one final receipt,
audio/mute, lobby Rules, ten Voyage layouts, 320-wide dice/pip bounds, rising and
falling quotes, mid-count banking, manual zero bank, last-fold hiding through
count-up, three-second rabbit holds, and warnings at 3/2/1 rolls with reduced motion.
Run Voyage with `--offers` for its focused quote/warning check. Nothing was installed.

## Publication and reversal

The guarded `supabase/arcade-smoke-polish/activate.sql` enables only Horses /3
after the matching production build/publication signal and healthy worker.
In-progress runs remain pinned. To reverse new Horses admission, disable /3 and
enable /2; preserve /3 functions for existing runs. The other corrections preserve
existing rules and can be reverted through ordinary source/migration delivery.
The release and verified annotated tags record exact commit/deployment evidence.

Physical iPhone speaker/motion/touch acceptance remains Jeremy's smoke step.

## Artwork

AI edited the original captain art; the generated raster was exported at exactly
1466 × 564 to `public/arcade/approved-v1/ship-cap-voyage-banner.png` and inspected
in the two-column phone lobby. Prompt: recompose the existing Ship Cap Voyage art
as an edge-to-edge wide banner; preserve the captain and clearly readable 6–5–4
dice, enlarge the title for a two-column iPhone grid, remove the baked info icon,
and leave the lower-right corner clear for the shared gold Rules control.
