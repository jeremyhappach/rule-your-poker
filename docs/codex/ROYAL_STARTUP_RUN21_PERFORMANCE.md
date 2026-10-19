# Royal Flash startup and Run21 performance — October 19, 2026

Owner requested production-first polish and a bounded performance investigation. No schema, rule version, scoring, financial, record, deck, audio cue or gameplay-duration changes.

## Confirmed Royal Flash corrections

- Initial subscription state was false and therefore displayed Reconnecting before any connection failure. Both adapters also returned a bare paragraph before their first snapshot. They now retain the canonical fullscreen styling while loading, distinguish the initial handshake from an interruption, and keep the existing board during recovery.
- Ordinary state reads used the same pending/flight gate as an immutable play. Reads no longer display Confirming play or suppress a simultaneous legal action. Commands retain their UUID, payload, revision, uncertainty protection and server validation. One redundant subscribed refresh was removed; ordinary revision refreshes remain coalesced.
- The 2.5-second intro deadline is already the multiplayer SQL reducer's first-placement gate. The client previously waited for the background worker to change the phase. The shared play-window helper derives permission from that persisted deadline and frozen Ready duration without modifying the snapshot. Arcade instead fetches once at the deadline and waits for its committed Ready revision, because its RPC commits that revision separately before admission. There is no polling, local gameplay advance or early input.
- A browser outage is tracked separately from subscription status. A brief offline/online cycle no longer leaves input stuck when the underlying subscription survives and does not issue another subscribed callback.
- The shared view removes Next card and cards-left text in both modes. Card faces, placement targets, Ready instructions, clocks, scoring timeline, audio and terminal presentation remain.

The original intermittent production messages cannot be assigned to socket failure, request failure or churn without a timestamped reproduction. The stable memoized transports and hook tests show no revision-driven resubscription. Actual connection errors still disable input and report recovery above the retained board.

## Validation

- Inspected deployed royal_flash_snapshot, arcade_royal_step and royal_flash_recover. A rollback-contained proof against all three deployed frozen board rules rejected placement at intro deadline minus 1 ms, accepted exactly at the deadline, and enforced Ready timeout. No production rows or definitions changed.
- Seven Royal Flash hook cases cover initial loading, both-mode first input, boundary fetch, retained outage board, normal reads, immutable uncertain-command retry, stable subscription cleanup and brief outage recovery.
- Real browser/API/local-PostgreSQL checks passed in Arcade and the actual RoyalFlashTable multiplayer wrapper: delayed first fetch still displays the shell without a false reconnect, legal first placement, absent helper labels, offline input lock with the exact board DOM retained, automatic recovery, portrait and landscape. First placement took 2,174 / 2,094 ms after grid appearance, including the remaining intentional intro and request time. Images and detailed evidence remain under qualification.local/royal-startup/.
- TypeScript, the full application and harness suites, focused Run21 authority/presentation/audio/recovery tests, and production build passed. The preferred bunx tsgo command was unavailable (package lookup 404); the repository's installed TypeScript compiler passed instead. No dependency changes.
- The final offline-state change additionally passed the 14-test focused Royal Flash/Run21 hook and diagnostic set, typecheck and a fresh Vite production build.

## Run21 measurement and unresolved issue

The uninterrupted browser run used the real Arcade service, PostgreSQL authority, React hook, space scene, board and audio, on an isolated local database clone. It played all three rounds without reload, issued 49 commands, waited until 12 seconds before the round-3 deadline before resuming play, persisted exactly one result and removed the clone afterward. HMR was disabled. An earlier development run affected by HMR was discarded. Local auth is an adapter; this does not measure production authentication, WAN latency, physical touch-to-screen delay or iPhone Safari.

| Measurement | Round 1 | Round 2 | Round 3 |
| --- | ---: | ---: | ---: |
| Intent to fetch, median ms | 1.7 | 1.6 | 1.8 |
| Fetch to parsed response, median ms | 82.2 | 94.2 | 101.0 |
| Local server operation, median ms | 80.1 | 90.2 | 98.3 |
| Parsed response to paint opportunity, median ms | 29.7 | 29.5 | 24.7 |
| Intent to paint opportunity, p95 ms | 211.3 | 242.0 | 228.4 |
| Frame interval, p95 ms | 17.0 | 17.0 | 17.0 |
| Active subscriptions | 1 | 1 | 1 |
| Retained listeners after boundary GC | 225 | 222 | 219 |
| Retained DOM nodes after boundary GC | 523 | 511 | 507 |
| Audio contexts / unfinished oscillators at boundary | 1 / 0 | 1 / 0 | 1 / 0 |
| JS heap after boundary GC, MiB | 10.86 | 11.05 | 11.54 |
| Maximum response bytes | 4,643 | 4,551 | 4,649 |

No comparable late-game slowdown or accumulating subscriptions/listeners/audio sources was reproduced. Heap increased modestly; this single run does not establish a leak. Source inspection confirms cleanup of hook clocks, boundary timers and subscriptions; audio tracks retire/disconnect. Solo state retains the current board and at most three results; projected placement history is one current event. Multiplayer hook/authority regression tests passed, but a live production multiplayer performance run was not measured. No speculative performance or engine change was made.

Reproduction harness: dev/run21/continuous-performance.mjs accepts an idle local qualification database as its template argument. Aggregate evidence is committed in dev/run21/continuous-performance.evidence.json. Raw request/server spans, frame samples and Chrome metrics remain in qualification.local/continuous-performance/evidence.json.

## Next-occurrence diagnostics

The existing opt-in Run21 capture now correlates request UUIDs with authoritative board revisions and DOM/paint opportunities, including realtime arriving before the HTTP response. It records round, projection size, event count and supported long-task durations. Multiplayer opt-in requests now actually request the existing server timing header and carry request IDs through session/fetch marks. Disabled capture retains no samples; enabled capture is bounded to 2,400 samples and 64 revision correlations. No permanent badge or gameplay timer was added.

Start at /arcade/run21?run21Timing=1 (or add run21Timing=1 when first opening the multiplayer page). The flag stays in session storage across navigation. After the occurrence, window.downloadRun21Timing() exports the bounded JSON in a desktop browser console. Open with run21Timing=0 to disable session capture. A paint opportunity is a browser animation-frame timestamp, not physical display measurement. Production network/server delay and device-specific rendering remain hypotheses pending capture.

## Production smoke

1. Start Royal Flash in Arcade and multiplayer: shell stays visible, no initial Reconnecting, intentional intro completes, first card is playable promptly, no stockpile helper labels.
2. Place several cards; briefly interrupt connectivity and restore it. The same board remains, input is protected offline, and recovery resumes without a blank screen or a stuck lock.
3. Complete a grid and check accepted scoring highlights/audio, totals, balances and continuation.
4. Play all three Run21 rounds, especially late round 3, with opt-in timing enabled if practical. Report the mode and approximate time of any lag/reconnect.

Checkpoint tag: royal-startup-run21-diagnostics-2026-10-19. Jeremy's production/iPhone smoke remains acceptance truth; this record does not mark it passed.
