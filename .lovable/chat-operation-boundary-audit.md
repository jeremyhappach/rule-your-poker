# Chat-Operation Boundary Producer Audit

Scope: the 30-second post-peer-receipt observation window that follows
every plain-text `chat_send_operation`. Every producer below fans out
to the durable `chat_operation_append_boundary_event` RPC and is
persisted in `chat_send_operations.boundary_events` before finalization.

Registration lifetime: the operation is registered in
`serverChatOperation.getCurrentSessionChatOperations()` from the
moment `openChatSendOperation` returns (BEFORE optimistic insert) and
remains registered until the 30-second observation window elapses or
an A/B/C event fires. Registration is never cleared by successful DB
insert, peer realtime receipt, peer tab-attention observation, or
report creation. See `useGameChat.ts` scheduling of
`finalizeChatSendOperationCompletedObservationWindow`.

## A. Router navigation initiation

Every producer emits `ROUTER_NAVIGATION_INITIATED` **before** the
navigation actually happens.

| Producer | Location | Coverage |
|---|---|---|
| `history.pushState` monkey-patch | `chatOperationBoundary.ts` install | Catches every React Router v6 `navigate(...)`, `redirect(...)`, `<Link>` click, and shell-owned nav helper |
| `history.replaceState` monkey-patch | `chatOperationBoundary.ts` install | Catches every replace-style navigate |
| `Location.assign` / `.replace` / `.reload` / href set | `chatOperationBoundary.ts` install | Catches direct `window.location` mutations |
| `popstate` listener | `chatOperationBoundary.ts` install | Back/forward taps |
| `recordTerminalRecovery(...)` | `sessionRecoveryLease.ts` | Names the reason (`explicit-leave`, `session-ended-confirmed`, `completed-teardown`, `confirmed-unavailable`, `kick-or-removal`) at the exact site called immediately before every `navigate('/')` in `Game.tsx` (11 sites) |
| `AUTH_GUARD_REDIRECT` | `useAuthGuard.ts` (existing) | Fires before `navigate('/auth')` with reason |
| `ROUTER_ROUTE_CHANGE` | `ChatOperationInstrumentationMount.tsx` | Post-nav confirmation for pathname change (kept — used to correlate initiation → landing) |

**Reachable navigate sites** (from waiting-table route):
- `Game.tsx:2032,2230,2242,2273,2316,4703,8374,8485,8513,8535,10430,11962` — all preceded by `recordTerminalRecovery(...)`, producing `ROUTER_NAVIGATION_INITIATED` with `reason=terminal:<reason>` and `active_game_id`.
- `Auth.tsx:54,71,223` — post-authenticated navigate; also captured by history-API patch.
- `useAuthGuard.ts:214` — auth-guard eject; explicit `AUTH_GUARD_REDIRECT` + history patch.
- `Index.tsx:403` — landing → `/auth`; history patch.
- `GameLobby.tsx:400,417,432` — game join; history patch (chat op typically not open here).
- `NotEnoughPlayersCountdown.tsx:29` — countdown timeout; history patch.

## B. Abort / fetch lifecycle

Every producer records purpose (rest table or rpc name) only. Body,
message, and credentials are NEVER captured.

| Producer | Location | Coverage |
|---|---|---|
| `window.fetch` monkey-patch | `chatOperationBoundary.ts` install | `SUPABASE_FETCH_STARTED`, `SUPABASE_FETCH_RESOLVED`, `SUPABASE_FETCH_REJECTED`, `FETCH_ABORT_ERROR` for every `*.supabase.co`, `/rest/v1/`, `/rpc/` request. Covers PostgREST, RPC, storage, Edge Function invocation, and Supabase Realtime HTTP handshake. |
| `useVoiceToText` timeout abort | `useVoiceToText.ts:535` | Explicit `APP_ABORT_CONTROLLER_ABORT` with purpose `voice-to-text-invoke` immediately before `abortController.abort('timeout')`. |

**Reachable AbortController inventory**:
- `useVoiceToText.ts:533` — only application-code `AbortController.abort()` in `src/`. Wired.
- All other aborts originate inside `@supabase/*` internals (realtime channel teardown, PostgREST fetch abort on unmount). These surface via the global `fetch` wrapper as `FETCH_ABORT_ERROR`.

**Excluded — cannot fire during a waiting-table chat operation**:
- Game-variant AbortControllers: none exist. Cribbage/Holm/Gin/Yahtzee/Horses/SCC controllers do not construct AbortControllers; they teardown via `supabase.removeChannel(...)` which surfaces through the `fetch` patch (Realtime uses fetch for handshake) and via `CHAT_REALTIME_CHANNEL_STATUS` events already wired in `useGameChat`.
- Edge function client abort: only in `useVoiceToText`. Wired.

## C. Session / context teardown & replacement

All producers fan out to `chatOperationBoundary` from the durable
`sessionLifecycleLedger` and `sessionRecoveryLease` layers — meaning
every reachable teardown / replacement / eject path in the app
converges here, without touching individual game producers.

| Producer | Location | Emits |
|---|---|---|
| `releaseRecoveryLease(reason, ...)` | `sessionRecoveryLease.ts` | `RECOVERY_LEASE_RELEASED` + `ACTIVE_SESSION_CLEARED` (with prior `gameId`, `userId`, `mountId`, `reason`) |
| `recordTerminalRecovery(reason, ...)` | `sessionRecoveryLease.ts` | `TERMINAL_RECOVERY_RECORDED` + `ROUTER_NAVIGATION_INITIATED` (with `active_game_id`, `reason`) |
| `recordShellUnmount(component, ...)` | `sessionLifecycleLedger.ts` | `SHELL_UNMOUNT_CONTEXT` (with `component`, `detail`) — covers `PersistentTableShell`, `MobileGameTable`, and every game-variant wrapper that opts in |
| `recordSessionIncident("ACTIVE_SESSION_ROUTE_EJECTED", ...)` | any | `ACTIVE_SESSION_ROUTE_EJECTED` |
| `recordSessionIncident("ACTIVE_SESSION_LEGACY_JOIN_FALLBACK", ...)` | any | `ACTIVE_SESSION_LEGACY_JOIN_FALLBACK` |
| `recordSessionIncident("ACTIVE_SESSION_SHELL_UNMOUNTED", ...)` | shell unmount | `SHELL_UNMOUNT_CONTEXT` |
| `recordSessionIncident("ACTIVE_SESSION_MEMBERSHIP_REJECTED", ...)` | session guard | `ACTIVE_SESSION_CLEARED` |
| `recordSessionIncident("ACTIVE_SESSION_TABLE_NOT_FOUND_OR_STALE", ...)` | session guard | `GAME_CONTEXT_TEARDOWN` |
| `recordSessionIncident("ACTIVE_SESSION_AUTH_REDIRECT", ...)` | auth guard | `ACTIVE_SESSION_CLEARED` |

**Excluded — impossible during a waiting-table chat operation**:
- **Game rounds/hands/dealer-game rollovers** (Cribbage `cribbage_events`, Holm hand boundary, Gin knock/gin, Yahtzee scoring turn transition, Horses/SCC rollover). The waiting-table route runs BEFORE any dealer_game exists — no round/hand identity ever transitions here. File evidence: `Game.tsx:2032` waiting-only path; `WaitingForPlayersTable.tsx` never mounts a dealer game. Any rollover mid-chat would require crossing into an active game route, which itself triggers `ROUTER_NAVIGATION_INITIATED`.
- **Game-variant provider unmount** (`CribbageDealOrchestrator`, `HolmDealOrchestrator`, etc.). None of these mount on the waiting-table route.
- **`ChipTransport`/`CardTransport`/`SeatCluster` teardown**: waiting-table route does not mount seats, chips, or cards.

## D. 30-second observation window invariant

Proof the operation stays registered:
- `useGameChat.ts` no longer finalizes on optimistic-send success, peer realtime receipt, tab-attention change, or report creation. Instead it calls `markChatOperationDeliveryConfirmed(operationId)` and schedules a single `setTimeout(finalizeCompletedObservationWindow, 30_000)`.
- `shellTabAttentionInstrumentation.ts` no longer finalizes durable operations for peers.
- `chatOperationHeartbeat.ts` extends the `HARD_CAP_MS` from 30s → 60s to cover the full observation window plus buffer.
- A/B/C events do NOT unregister the operation early. Each fires its boundary evidence via `chat_operation_append_boundary_event` and either (a) is followed by the natural 30-second finalization, or (b) is followed by immediate finalization only when one of `TERMINAL_RECOVERY_RECORDED`, `SHELL_UNMOUNT_CONTEXT`, `ACTIVE_SESSION_CLEARED`, `ACTIVE_SESSION_REPLACED`, `AUTH_SIGN_OUT_COMPLETED` fires — and in that case only after the boundary event is persisted (RPC awaited via fan-out).
- Peer TXT: `finalize_chat_send_operation` sorts `boundary_events` by `sequence` and includes them in the report, so the first post-receipt event among navigation, abort/fetch, teardown, auth, realtime, lifecycle, or sender staleness is trivially readable.

## Preflight evidence

Ready for the final repro:
- Durable incident row opens BEFORE optimistic send (`useGameChat.ts` `openChatSendOperation` → `writeChatOperationSenderHeartbeat` → optimistic append).
- All lifecycle/auth/navigation listeners register at boot in `ChatOperationInstrumentationMount.tsx` (mounted from `App.tsx` at the router root, above `<Routes>`).
- Peer/server heartbeat rows write every 3s while the operation is open.
- Peer export filter (`IncidentExportPill.loadChatReport`) accepts the normalized report shape (`chatOperationReportNormalizer.ts`) — the fix from the prior turn.
- No synthetic or `/` route reports are producible; strict filter is unchanged.
