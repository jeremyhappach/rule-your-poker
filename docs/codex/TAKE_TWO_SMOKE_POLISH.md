# Take 2 production-smoke corrections — 2026-10-19

Scope: shared Arcade/multiplayer selection feedback and layout, plus removal of
redundant Arcade action reads. Rules remain `take-two/1`; no migration, new
authority, score/bonus/timer/audio change, settlement change or record rewrite.
Checkpoint: `take-two-smoke-polish-2026-10-19`. Owner phone smoke remains pending.

## Diagnosis and correction

The shared view cleared its selection immediately on submission and disabled
every card until the command finished. Its additional submitted flag depended
on a revision change to unlock, even when a rejected action changed no revision.
There was no clearing animation or deliberate response-to-removal delay.

Both submitted cards now stay highlighted until authoritative state removes
them. Another exposed card can be selected during the request, but no second
command is queued or submitted. Selection survives an acknowledgement only if
the same card remains exposed in the same round. The view flag retires with the
promise, while the unchanged hook retains the exact uncertain UUID/intent and
continues to block submissions until resolved. Scope, connection, pause and
phase guards remain. Memoized canonical card faces avoid clock-driven redraws.
Confirmed removal has no animation wait or arbitrary timer.

Arcade previously awaited a display-name query and `arcade_load` before
`arcade_take_two_step`. The qualified action/state path now directly calls the
existing locked step, following the accepted TriTowers shortcut. Fresh HTTP
bearer authentication remains. The deployed step was inspected: it independently
checks account access, stored game, owner, round, revision and immutable receipt
fingerprint. Malformed/old-version requests retain validation. Multiplayer
already used one action RPC. Take 2 HTTP responses now include Server-Timing.

The fixed, vertically centered 4:3 cabinet and side columns are removed. Score,
best, round, counts, timer and horizontal bonus meter form a compact top region;
Take Score, stock and current card sit below the tableau. Only an empty canonical
announcement rail collapses; active announcements retain their owner and space.
Player scores/chips use one horizontal strip with the active player brought into
view. The tableau uses the largest proportional size fitting its canonical slot.
Wide containers compact the top region into one row. No viewport measurements,
device media-query patches, card stretching or new shell are introduced.

## Measured evidence

No new phone screenshot or viewport dimensions arrived with the smoke report;
the available attachment is the original Megatouch screen. Before/after browser
screenshots use 390×844 and reduced heights, plus the matrix below. These are
local Chromium measurements against the real SQL/service harness, not physical
iPhone or production WAN latency. Eight valid pairs per mode per baseline/final
run; click capture → fetch dispatch → parsed authoritative response → next
animation-frame observation of removed DOM cards. The final run had no competing
build/test process. The baseline and final deals are independently shuffled.

| Median milliseconds | Arcade before | Arcade after | Multiplayer before | Multiplayer after |
|---|---:|---:|---:|---:|
| Second tap → request | 0.3 | 0.2 | 0.2 | 0.3 |
| Request → response | 73.1 | 42.9 | 48.4 | 48.0 |
| Response → visible removal | 6.0 | 3.0 | 11.5 | 14.1 |
| Second tap → visible removal | 78.9 | 45.7 | 61.9 | 62.7 |

Pending-pair feedback was absent before; after, it appeared in 12.1–13.6 ms.
Final maximum response-to-visible removal was 15.2 ms. Multiplayer transport
latency is effectively unchanged; the improvement there is immediate feedback,
safe preselection and removal of the revision-dependent view lock. The local
harness omits the HTTP profile query, so its avoided WAN cost is not included.

| Two-player, 33-card layout | Card width before → after |
|---|---:|
| 390×844 portrait | 42.1 → 62.5 px (+48%) |
| 390×664 reduced portrait | 42.1 → 62.5 px |
| 844×390 landscape | 34.5 → 55.8 px (+62%) |
| 844×300 reduced landscape | 20.5 → 29.4 px; previous clipping removed |
| 1440×900 desktop | 110.6 → 187.6 px (+70%) |

Height limits the tableau in short landscape; widening it further would require
changing overlap or clipping. Portrait is width-limited by the preserved six-card
geometry, so remaining vertical room is not filled by stretching or spreading.
The very short 300-pixel viewport still has smaller tap targets and needs owner
phone acceptance. Card faces retain 1:1.5 proportions and the half-card stagger.

`dev/take-two/responsiveness.mjs` checks 42 combinations: 320×568, 390×844,
390×664, 393×587, 844×390, 844×300, 1440×900; one/two/seven players; 28/33 cards.
It asserts no page scrolling/clipping, card proportions, normalized stagger/row
overlap, tableau containment and exposed-card/control hit testing. Actual images
and raw timing samples are in `qualification.local/take-two/before/` and `after/`.

Validation passed: 2,502 application tests, 241 harness tests, TypeScript and
production build; focused pending/invalid/unchanged-rejection/scope-reset tests;
shortcut/auth/replay tests; actual browser pair/draw/reload, all three Arcade
rounds and leaderboard, both-player ownership, all six multiplayer turns and
terminal continuation. Existing build/chunk/browser-data warnings remain.

## Owner smoke

1. In both modes, select a pair and consecutive cards quickly. Both should
   highlight immediately, then disappear together when confirmed. Select the
   next exposed card during confirmation; no duplicate score or draw should occur.
2. Rotate portrait/landscape with browser bars visible. Check full card faces,
   exposed rank/suit strips, horizontal meter, stock, Take Score and player chips.
3. Complete a round and a multiplayer match. Confirm unchanged bonuses, timing,
   audio, records, settlement and continuation.
