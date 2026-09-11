# September 11 interim usage check

Read-only snapshot approximately 11:05–11:08 CDT / 16:05–16:08 UTC.
Jeremy reports clean cross-country play on both preceding nights and leaving
the lobby open afterward. This check updates the September 8 baseline;
it does not start another test campaign or change hosting/billing.

## Observed usage

Supabase current billing cycle: September 8–October 8, partially elapsed.
The dashboard warns of up to one hour of reporting lag.

| Metric | Poker | Organization, both apps |
| --- | ---: | ---: |
| Uncached egress | 0.438 GB | 0.450 GB / 250 GB |
| Realtime messages | 35,168 | 35,172 / 5,000,000 |
| Peak realtime connections | 7 | 8 / 500 |
| Edge Function invocations | 9 | 9 / 2,000,000 |
| Monthly active users | 8 | 8 / 100,000 |
| Average object storage displayed | 0.004 GB | 0.004 GB / 100 GB |

The project filter explicitly selected ptown-poker-prod after reading the
organization totals. Recipe traffic accounts for about 0.012 GB of the
rounded difference. No observed quota overage is reported.

Poker daily chart tooltip values (dashboard labels use MB):

| Chart date | Auth | PostgREST | Realtime | Sum, approximately |
| --- | ---: | ---: | ---: | ---: |
| September 9 | 3.328 | 34.369 | 48.466 | 86.164 MB |
| September 10 | 2.014 | 23.827 | 27.989 | 53.830 MB |
| September 11, partial | 2.788 | 51.430 | 68.694 | 122.912 MB |

Function egress adds only 514 and 478 bytes on September 9 and 11.
Daily chart labels and rounded summary GB are retained as displayed; do not
assume identical byte-unit conventions when reconciling their sums. UTC game
timestamps cross the local calendar boundary: the two real-money sessions
were created September 10 00:08 UTC and September 11 00:55 UTC. Both now have
session_ended status. Today is partial and must not be compared as a full day.

## Interpretation and cost

Since the September 8 approximately 21:40 UTC baseline, organization egress
increased from 0.088 GB to 0.450 GB over roughly 66.5 hours. A simple extension
of that short-window rate is about **3.9 GB per 30 days**, close to our existing
4 GB/month organization-wide safety target. It includes ordinary games, open
lobbies, engineering tests and the September 10 diagnostic-toast incident.
It is not an isolated lobby rate, clean-week forecast or Free qualification.
Continue the existing clean-week review before deciding on a smaller plan.

Supabase still shows Pro, poker Small and recipes Micro. Current costs are
$25.07; projected costs are **$41.98**, including both projects. The $0.07
branch line remains the earlier testing charge. Lower traffic does not itself
reduce the fixed plan and compute charges. No plan/compute changes were made.

Vercel All Projects / Last 30 Days (August 12–September 11) shows Hobby:
4.4 GB / 100 GB Fast Data Transfer, 74K / 1M Edge Requests,
15K / 1M Function Invocations and 2.87 GB / 10 GB Deployment Storage.
Build CPU usage is 34h 36m without a comparable allowance in that table;
do not treat the separate 0s/0s Build Minutes display as a capacity result.
This window includes engineering builds and is different from Supabase's cycle.

## Current idle and recovery evidence

At 16:06:40 UTC the poker database is 162,901,139 bytes (about 163 decimal MB;
September 8 baseline 148,343,955 bytes). There are 39 connections and zero
connections waiting on locks. These are point samples, not CPU/RAM capacity
tests. Historical non-ended game rows are not a count of connected players.

Between 16:07:22.340 and 16:08:22.713 UTC, the existing presence-upsert
pg_stat_statements counter remained 156,242: **zero new calls or execution
time** over 60.373 seconds. Recent Jeremy presence rows identify lobby `/`
with no game ID. This shows a quiet current spot check; it does not measure
the entire overnight interval or every lobby request. Source still contains
the approximately four-second presence timer and ten-second lobby refresh.

At 16:08:22 UTC recovery last completed 0.474 seconds earlier, with zero
consecutive partial failures and zero task/unit failure records. The last
48 hours of the canonical scheduled job show 4,057 succeeded, zero failed,
and one running batch. No game action, timer or data was modified for the check.

## Sources and durable status

- [Supabase organization usage](https://supabase.com/dashboard/org/fctcvjjjpybsvywoqbac/usage)
- [Supabase billing](https://supabase.com/dashboard/org/fctcvjjjpybsvywoqbac/billing)
- [Vercel usage](https://vercel.com/jeremy-8e2b/~/usage)
- Local snapshot: artifacts/usage-check-20260911/usage-summary.json.
- Baseline: CAPACITY_USAGE_ASSESSMENT_20260908.md.

Jeremy's report and ended session rows establish that the previous real-money
play has ended. The diagnostic-import correction remains proposed and has not
been approved or implemented. This usage request authorizes no publication,
resize, downgrade, migration, production mutation or new scheduled monitor.

## Unfinished lobby sessions and next optimization candidates

Read-only follow-up at 16:54-16:55 UTC September 11 finds six unfinished
real-money sessions among the latest 50 records fetched by the lobby. Five
are paused; the unpaused Sep 3 - Jefferson Avenue Cribbage session is in
human discarding with no scheduled timer. No presence rows are fresh within
two minutes. Across all historical unfinished real-money sessions, the six
remaining scheduled timers belong to paused games; none is due and unpaused.
The broader status-not-session-ended query returns 42 rows, including waiting,
game-selection and game-over records. This is not a connected-player or
displayed-lobby count; the earlier 29-row figure is not used for this assessment
because its exact predicate was not re-established.

The deployed read-only recovery admission function reports false for all
eight tasks. There are no abandonment watches, task failures or unit failures,
and no slow-task records in the preceding hour (logging threshold 500 ms).
Two dispatcher samples took 4 ms and 15 ms. Rotating safety checks still run;
these observations rule out a currently due-work loop, not every possible
historical cost or smaller-instance pressure. Ending old sessions is not an
evidenced performance fix and does not remove them from the newest-50 query.
No historical session or balance was changed.

The clearest next source-backed candidate is
`src/lib/runtimeInstrumentation/voicePresenceHeartbeat.ts:writeHeartbeat`:
every nominal four-second heartbeat first calls network-backed `auth.getUser`,
then upserts the presence lease. Reusing current auth identity safely could
remove approximately 900 identity lookups per foreground tab-hour, or 4,500
for five tabs. These are cadence estimates, not measured savings; browser
throttling and the existing single-flight guard reduce actual counts. Preserve
the four-second server-stamped lease, auth changes/sign-out, RLS, route context,
and existing in-flight coalescing. This remains a proposed correction.

The next measurement candidate is `GameLobby.tsx`: ten-second periodic list
refresh plus games/players realtime refreshes. `lobbyFetch.ts` loads up to 50
games, their players, and snapshots for ended games. Potential savings are
coalescing redundant refreshes and avoiding repeated unchanged history reads,
while preserving fresh lobby admission, reconnect catch-up and current results.
The earlier quiet hidden-tab sample does not establish a large overnight cost.
No additional RAM saving or Free readiness is claimed from these candidates.

Evidence: artifacts/usage-check-20260911/unfinished-session-cost.json.
Official API behavior: https://supabase.com/docs/reference/javascript/auth-getuser.
