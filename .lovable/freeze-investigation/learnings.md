# Dealer-Selection Freeze Investigation — Preserved Learnings

Status: Investigation paused. Branch reverted to last stable baseline before
geometry-contract rollout / realtime callback hardening. Reapply in validated
slices per the recovery plan.

## Confirmed findings

1. **Realtime callbacks must not do heavy synchronous work.**
   Supabase `postgres_changes` callbacks run on the realtime socket stack.
   Doing React state updates + fetches + tracing inside the callback body
   serializes the entire transition pipeline against socket delivery and
   creates the freeze surface.

2. **`games` realtime callback must be enqueue/defer-only.**
   The callback should push the payload into a queue (microtask, `setTimeout(…,0)`,
   or `requestIdleCallback`) and return immediately. All React state, fetches,
   and trace emission happen on the deferred tick.

3. **Latest-fetch-wins guard caused self-starvation under fetch pressure.**
   The in-flight `seq` comparison rejected its own follow-up fetches when
   multiple status transitions overlapped, leaving the UI on a stale row
   forever. Symptom: route stuck on `dealer_selection` after DB row already
   moved to `game_selection`.

4. **Stale-fetch suppression should compare applied `updated_at`, not in-flight seq.**
   Replace the seq-based guard with: "drop the response if its row's
   `updated_at` is ≤ the `updated_at` of the row currently committed to
   React state." This is monotonic, idempotent, and immune to overlap.

5. **Fetch pressure / overlapping queries are dangerous during status transitions.**
   `dealer_selection → game_selection` fires multiple parallel reads
   (games, dealer_games, players, current_round). Coalesce on `current_game_uuid`
   change, not on every `games` UPDATE.

## Instrumentation worth keeping (temporarily)

- **Freeze recorder** (`src/lib/wartimeDebug/freezeRecorder.ts`) — persists a
  scoped trace + heartbeat to `debug_events`, survives main-thread halt.
- **Raw fetch mirror** — dual-channel transport (SDK + raw `fetch` keepalive)
  with shared `seq` for dedupe. Proved the SDK-vs-main-thread discriminator.
- **`LAST_BEAT_KEY` + `LAST_EMIT_KEY` localStorage breadcrumbs** — surface in
  `freeze.PAGE_BOOT` on next load. Definitively distinguished SDK wedge from
  main-thread halt this round.
- **`tracedRealtimeCallback`** wrapper (BEGIN / END / END_ASYNC / threw markers)
  — pinpointed the callback boundary that owned the freeze.
- **PSC render-cycle trace** (`pcs.*` events on the PlayfieldSlotController +
  DealerSetupInner mount path) — narrowed the halt to the post-commit phase of
  `DealerSetupInner`'s first mount under the `poker-shell-overlay` branch.

Retain these until the freeze class is fully closed, then remove behind the
`[FREEZE_REC]` sentinel.

## Verdict at time of pause

- **Phase B: main-thread halt** (not an SDK / `navigator.locks` deadlock).
  `LAST_BEAT_KEY` stopped at the same `n` as the SDK heartbeat in the final
  repro — the `setInterval` callback itself stopped firing.
- **Halt site:** post-commit work of `DealerSetupInner`'s first mount on the
  `game_selection` re-render, under the `poker-shell-overlay` PSC branch.
  Render returned (`RENDER_END` fired); the halt is in a layout effect /
  synchronous subscribe / child commit phase that was not yet traced.

## Reapply order (no step proceeds until prior validates)

1. Last stable baseline (revert target).
2. Realtime callback defer/enqueue pattern — **`games` only**.
3. Validate `dealer_selection → game_selection`.
4. Add `players` + `rounds` realtime defer wrappers.
5. Validate.
6. Reapply stale-fetch guard fix (compare `updated_at`, not seq).
7. Validate.
8. Reapply geometry Wave 1 read-only hooks.
9. Validate.
10. Reapply Wave 2 `useCardRowLayout` hook with no consumer.
11. Validate.
12. Reapply 3-5-7 consumer.
13. Validate 3 / 5 / 7 card rounds.

If a freeze returns, the last applied slice is the culprit.
