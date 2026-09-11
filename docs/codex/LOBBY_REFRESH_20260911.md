# Lobby refresh cost reduction — September 11, 2026

Jeremy requested lobby refresh optimization after the published presence change.
This scope includes lobby read scheduling, focused checks and publication. It does
not include billing changes, historical game cleanup or gameplay mutations.

## Finding and correction

GameLobby unconditionally reread the newest 50 games, their players/profile
names and ended-session participant snapshots every 10 seconds. It also reread
on games/player events, focus and visibility. Its subscriptions had no join
catch-up. The prior b98d25dfa production sample recorded 14 lobby GETs per
browser over 44.049 seconds; interval boundaries affect short sample totals.

The mounted useLobbyGames hook now owns the existing serialized, abortable
request lifecycle and one channel covering all four contributing tables. All
four tables were verified in the deployed supabase_realtime publication.
Realtime events and cold subscription/rejoin invalidate the list immediately.
Visible healthy reconciliation is 60 seconds after a completed refresh; a
subscription or primary-read failure retains the 10-second fallback. Hidden
lobbies perform no new reads and refresh on return. Focus and online events
also refresh. Concurrent signals retain one follow-up read, and synchronous
signals coalesce. Retired accounts and unmounted lobbies cannot apply replies.

The 12-second abort, deduplicated errors, last-good list, bounded queries and
canonical authorization remain. No cache, migration, financial writes or game
timing changes were introduced. The existing helper's treatment of non-abort
supplemental query errors was not changed by this scheduling correction.

## Validation

Ten tests exercise the actual mounted hook: idle cadence, every contributing
table, event coalescing, initial subscription and three failure statuses,
hidden return/focus/online, in-flight follow-up, failure/retry, timeout and
account/unmount retirement. Existing lobby query tests also pass.

App typecheck, 1,580 app tests (231 files), 150 harness tests (10 files),
and the production Vite build pass. The first two-browser candidate sample
against the owned production backend had zero lobby GETs per browser in
44.024 seconds, zero Auth user lookups, 22/22 successful presence writes and
no page errors. Its later fault-injection step required a harness correction
to support the installed SDK's array wire protocol; no product correction
was required. The corrected candidate rerun passed in 1.3 minutes: zero lobby GETs per
browser over 44.023 seconds, 22/22 presence writes, zero Auth lookups and
zero page errors. All four server-confirmed table bindings triggered live DB
reads after synthetic invalidation. Focus catch-up, a browser-only realtime
interruption with HTTP fallback, and rejoin catch-up passed. Exact test-tab
presence rows were removed and absence verified. No game rows were mutated.
Published 1d42d7df8409993416c745d769291eb6e70479de is Vercel READY and the holm357.com manifest matches.
The production browser verification passes; see the published benchmark log
in artifacts/lobby-refresh-20260911/. Test-owned presence cleanup and both
lobby screenshots passed inspection. No production game rows were changed.
The expected steady idle periodic-read reduction is about 83% (six refreshes
per minute become one). This is not a reduction estimate for realtime-active
lobbies or proof that Supabase Free has sufficient memory or capacity.

The production sample had zero lobby reads per browser over 44.012 seconds,
22/22 presence writes, zero Auth lookups and zero page errors. The first
forced-disconnect check exceeded its 20-second rejoin assertion. A rerun
allowing the SDK 60 seconds to reconnect passed all paths in 1.7 minutes;
the 10-second HTTP fallback remained available during the interruption.
The harness now observes the post-rejoin read without racing the reply.
No product code changed after the first validated candidate.
