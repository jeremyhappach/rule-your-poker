# 11 Up smoke controls — local candidate

Base: `bb1ec308030065d1aa30fc79a18efd493315291e` (published combined release).
Branch: `codex/eleven-up-smoke-controls`. No main integration, push, production
migration, deployment, or admission changes are authorized in this phase.

Jeremy's direct clarification supersedes the earlier Ready-only control rule:
gameplay expiry still finalizes its exact existing result, including zero when
earned. It now marks a human away through persistent `auto_fold` and
`sit_out_next_hand`; their frozen seat remains in the competition. Fake-money
recovery plays later rounds using the existing policy. Real money pauses through
the canonical versioned pause owner upon entering that human's next Ready phase.
There is no skipped round, replacement score, clock extension or second timer.
Reclaim clears both flags, invalidates pending bot actions and never resumes a
paused table. Reclaim before the next round prevents the away-triggered pause.
Late zero-client arrival at the next Ready phase reuses the existing canonical
Ready allowance/pause helper; the finalized scoring result/clock stays untouched.
The checked Auto-play checkbox persists through reload/results and disappears
after successful reclaim; it is never an unchecked opt-in. Actual table sit-out
still applies at the canonical next-game boundary if the human has not returned.

`supabase/eleven-up/smoke-controls.sql` is an unregistered local forward candidate,
layered after both released migrations. An AFTER state trigger observes completed
timeout results and next-Ready transitions, covering scheduler and late RPC paths.
It changes no reducer, financial owner, frozen participant or global default.
Existing revision publication/control and all-human inactivity safeguards remain.

`useElevenBotSelection` presents a witnessed automatic group by retaining only
the previously visible board and highlighting its selected balls at 750ms
intervals using the exact human `aria-pressed` CSS. It sends no commands, replays
no history on mount/reconnect, and drops presentation on reclaim, pause, hidden
tab, scope change or scoring expiry. The bot scheduler delays its next decision
by 750ms per selected ball; the original deadline always preempts that due time.
This is bot decision pacing, not additional gameplay time. Group animation may
be cut short at expiry or a scope boundary; missed network history is not queued.
Arcade and manual selection remain unchanged.

## Qualification

- `node dev/eleven-up/smoke-controls-proof.mjs`: rollback-only disposable local
  SQL proof for both money modes and scheduler/late-RPC expiry, exact zero result,
  earned nonzero points, persistent flags/reload, normal subsequent rounds,
  real-money next-Ready pause, early/paused reclaim, stale actions and deadline
  precedence over presentation pacing. Includes 36 canonical financial cases
  and literal unchanged reducer, settlement and Race function definitions.
- `node dev/eleven-up/smoke-controls-local.mjs`: installs only into the fixed
  loopback qualification database for browser/independent-connection checks.
- `node dev/eleven-up/human-ready-proof.mjs --smoke-controls`: existing Ready,
  all-human pause, authorization, next-game eligibility and bot/reclaim race
  regressions. Bot race waits for its authoritative due time, not a fixed delay.
- `node dev/eleven-up/smoke-controls-browser.mjs`: actual SQL/browser highlights,
  observed zero-point expiry, checked-only away/reload/reclaim, no automatic
  resume, and six phone layouts. Measured selection spacing and screenshots are
  retained in `qualification.local/eleven-up-timeout/smoke-browser/`.
- Focused component tests verify sequential highlighting, result clearing,
  cancellation and the authoritative Ready-to-playing clock. Full build results
  are recorded in `supabase/eleven-up/smoke-controls-evidence.json`.

The original bot and Ready migration files are untouched. Production qualification,
registration of a new forward migration, coordinated publication and physical
phone/owner acceptance require a later release phase. This is not a deployed fix.
