# Async navigation and Words recovery — November 22, 2026

Jeremy approved correction of Async lobby destinations and the Words reconnecting
cycle. Implementation starts from published `d3125ff02` on the isolated
`codex/async-nav-words-recovery` branch. No database, rule, financial or dependency
change is included. Physical production/iPhone acceptance remains owner smoke.

## Traced failures

- The Async setup/match header and match-finale Back to Lobby links explicitly
  targeted `/`. Completed Async records also returned to the Live archive.
- The shared subscription owner bounded recovery to three attempts but exposed
  only a connected boolean. With no subscription acknowledgement, all three
  channels were retired and no retry remained, while Words still rendered
  “Reconnecting…”. Successful snapshot reads could clear the shared error field
  without restoring the subscription. The deterministic pre-fix reproduction
  recorded three successful reads, three closed channels, no error and no
  scheduled recovery after 30 seconds.
- Online, focus and visibility signals could replace a joining channel before
  its acknowledgement. Words discarded the subscription's status/error details.
- A lost command reply retained its correct request UUID, but the connected
  error UI offered no Reconnect button to resolve that pending command.

The original cause of Jeremy's network interruption was not captured. Hosted
read-only inspection confirmed the Words and Async update tables are published
to Realtime with participant policies; it did not establish a service outage.

## Correction and preservation

Lobby returns use `/delayed`. Match Home and game/setup back navigation retain
their existing scopes. The separate Live archive exit is explicitly named.

The existing authoritative subscription owner now reports connecting, recovering,
connected, offline and failed states. It coalesces foreground signals while a
join is pending, retains bounded retries, cancels obsolete retry timers after
success, and requires an ACK followed by an accepted authoritative snapshot.
An exhausted recovery stays failed until an explicit retry or foreground/online
recovery, including while a game is paused. Old channel/read callbacks remain
generation-fenced. Existing non-Words action-error messaging is preserved.

Words connection state is separate from command/dictionary errors. The board
stays mounted; failed recovery offers Retry. Uncertain pending commands offer
Reconnect even if the subscription remains healthy. Commands are disabled until
connected; permitted local Async tile drafting remains available. Request UUIDs,
revision/identity guards, private racks, presentation receipts, authored clocks,
view-only entry, turn progression and server settlement ownership are preserved.

## Verification

Focused tests cover nested setup/match/Words returns, completed records and
finale navigation; initial joins, overlapping foreground events, bounded failures,
paused recovery exhaustion, stale callbacks, snapshot catch-up, lost-reply UUID
reconciliation, preserved drafting and static completed-word presentation.
The full release build output is retained in
`qualification.local/async-words-recovery/final-build.log`.
`npm run build` passed: TypeScript, 4,390 application tests, 241 harness tests,
46 release-tooling tests, production bundling and the distribution size gate.

Start the isolated browser fixture with:

```text
node dev/async-words-recovery/serve.mjs
```

The real Delayed route, Words adapter, hook and view run with a local fixture
transport; no production RPC or financial mutation is made. Browser checks:

1. `/delayed/match/play/words`: retain all 225 cells and the committed H8 tile
   across Brief interruption. Commands disable, then recover automatically;
   overlapping online/focus/visibility signals create just one replacement.
2. Block subscription: Reconnecting becomes a recoverable error after the finite
   attempts. The board stays visible and commands stay disabled. Restore
   transport, then Retry: the current state and command controls recover.
3. Lose next action reply, then use a time bank. Reconnect reuses the original
   UUID: the fixture records **two sends, one commit**, revision 2, and retires
   the used bank once.
4. Words → Match Home → Back to Lobby lands on `/delayed`. Setup → choose Words
   → configuration → Back to Lobby also lands on `/delayed`. Explicit Leave
   Async reaches `/`. Browser console errors: none.

These are local transport/recovery proofs. Repeat a brief network interruption
and nested returns in the published app on Jeremy's device for owner acceptance.
