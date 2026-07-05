# Chat-operation boundary audit — waiting-table reachability classification

Scope: every code site capable of ending, replacing, or ejecting the sender
session (navigation, auth, realtime, abort, service-worker, error boundary,
shell/game teardown). Classification per site:

- **R** = reachable during a waiting-table chat operation
- **S** = shared/global (therefore reachable)
- **U** = game-specific, cannot execute from the waiting-table shell

Every R and S site is now covered by a durable boundary-event producer
(`chat_operation_append_boundary_event`) fanned out from
`chatOperationBoundary.ts` or by an explicit call to
`recordChatBoundaryEvent()`.

---

## Router navigation / redirect

| File / function | Cls | Producer |
|---|---|---|
| `src/App.tsx` `<BrowserRouter>` — every location change | S | `ChatOperationInstrumentationMount` `ROUTER_ROUTE_CHANGE` on `useLocation` change |
| `src/hooks/useAuthGuard.ts` `performRedirectToAuth` → `navigate("/auth")` | S | `recordChatBoundaryEvent('AUTH_GUARD_REDIRECT')` inline before navigate |
| `src/pages/Auth.tsx` post-sign-in `navigate(...)` | S | Follows via `AUTH_STATE_CHANGE` + `ROUTER_ROUTE_CHANGE` |
| `src/pages/Game.tsx` `navigate('/')` on missing game | R | Captured by `ROUTER_ROUTE_CHANGE` |
| Game-controller `navigate(...)` after end-of-session (Cribbage/Holm/Gin/Yahtzee/Horses/SCC) | U (post-shell-active only) | Not reachable from waiting-table chat op; controller only mounts after `game_status != 'waiting'` |

## window.location / reload

| File / function | Cls | Producer |
|---|---|---|
| `src/components/RouteErrorBoundary.tsx` `handleReload` `window.location.reload()` | S | Monkey-patched `Location.prototype.reload` → `WINDOW_LOCATION_RELOAD` |
| Any `location.assign(...)` / `location.replace(...)` / `location.href = ...` anywhere | S | Monkey-patched `assign`/`replace` prototypes → `WINDOW_LOCATION_ASSIGN` / `WINDOW_LOCATION_REPLACE` |
| PWA / capacitor-triggered reload | S | Same monkey-patch |

## Auth guard, token refresh, sign-out

| File / function | Cls | Producer |
|---|---|---|
| `src/main.tsx` global `supabase.auth.onAuthStateChange` | S | `AUTH_STATE_CHANGE` (all events) + `AUTH_TOKEN_REFRESHED` + `AUTH_SIGN_OUT_COMPLETED` from boundary listener |
| `src/hooks/useAuthGuard.ts` `onAuthStateChange` transient recheck | S | `AUTH_STATE_CHANGE` covers; explicit `AUTH_GUARD_REDIRECT` on eject |
| `src/pages/Auth.tsx` `signOut` invocations | S | `AUTH_STATE_CHANGE` (`SIGNED_OUT`) + `AUTH_SIGN_OUT_COMPLETED` |

## Global error boundary / reset

| File / function | Cls | Producer |
|---|---|---|
| `src/components/RouteErrorBoundary.tsx` `componentDidCatch` | S | `recordChatBoundaryEvent('ERROR_BOUNDARY_CAUGHT')` inline |
| `src/App.tsx` `unhandledrejection` handler | S | Global `unhandledrejection` listener → `UNHANDLED_REJECTION` |
| Any `throw` reaching window `error` | S | Global `error` listener → `WINDOW_ERROR` |

## Shell / game / session teardown

| File / function | Cls | Producer |
|---|---|---|
| Waiting-shell unmount on `game_status` transition (Game.tsx) | R | Follows from `ROUTER_ROUTE_CHANGE` + `AUTH_STATE_CHANGE`; the operation registry is bounded per operation, not per shell |
| MobileGameTable felt-tab unmount | R | Registry lifetime independent of tab-bar mount; heartbeat continues until hard cap or terminal |
| Cribbage/Holm/Gin/Yahtzee/Horses/SCC game-shell mount/unmount | U | Never mounted while `shell_phase='waiting'` |

## Shared realtime channel unsubscribe / remove

| File / function | Cls | Producer |
|---|---|---|
| `useGameChat.ts` chat channel `removeChannel` on unmount | R | Only fires if the chat hook itself unmounts (route change / auth logout) — captured by `ROUTER_ROUTE_CHANGE` / `AUTH_STATE_CHANGE` |
| Waiting-table player-presence realtime | R | Same as above |
| Cribbage `cribbage_events`, Holm `holm_events`, Gin/Yahtzee/Horses/SCC channels | U | Only mount inside their respective game shells |

The full ~200 `supabase.removeChannel(...)` sites are unreachable during
`shell_phase='waiting'` because each is gated by its game-shell mount
condition (`gameType === 'cribbage'` etc.). Excluded as U with reason:
"channel is opened by <GameName>{Felt,Controller,Sync} which does not
mount while `game_status IN ('waiting','pre_game')`".

## Shared AbortController cancellation

| File / function | Cls | Producer |
|---|---|---|
| `useGameChat.ts` optimistic mutation — no explicit AbortController | R | N/A |
| Global `fetch` — Supabase client owns AbortController internally per request; a network failure surfaces as `REALTIME_CHANNEL_ERROR` (via realtime callbacks) or per-request rejection recorded by sender milestone `DB_INSERT_ERROR` | R | Existing sender milestones + `NETWORK_OFFLINE` boundary |
| Game-specific abort controllers (Horses/SCC animation cancels, Gin draw abort) | U | Only reachable in game shells |

## Service worker

| File / function | Cls | Producer |
|---|---|---|
| PWA service worker registration (auto by Vite/Capacitor at boot) | S | `SERVICE_WORKER_REGISTERED` on `navigator.serviceWorker.ready` |
| SW update-found event | S | `SERVICE_WORKER_UPDATE_FOUND` via `reg.addEventListener('updatefound')` |
| SW controllerchange (new SW activated) | S | `SERVICE_WORKER_CONTROLLER_CHANGED` global listener |
| SW postMessage to client | S | `SERVICE_WORKER_MESSAGE` global listener |

## Page lifecycle / online / offline

| File / function | Cls | Producer |
|---|---|---|
| `visibilitychange` | S | `PAGE_VISIBILITY_CHANGE` |
| `pagehide` | S | `PAGE_HIDE` (`persisted` captured) |
| `pageshow` | S | `PAGE_SHOW` + `PAGE_SHOW_WAS_DISCARDED` when `document.wasDiscarded` |
| Chrome `freeze` / `resume` | S | `PAGE_FREEZE` / `PAGE_RESUME` |
| `beforeunload` | S | `BEFORE_UNLOAD` |
| `online` / `offline` | S | `NETWORK_ONLINE` / `NETWORK_OFFLINE` |

## Legacy join / fallback

| File / function | Cls | Producer |
|---|---|---|
| `recordActiveSessionMarker('ACTIVE_SESSION_ROUTE_EJECTED')` in `useAuthGuard.ts` | S | Followed inline by `recordChatBoundaryEvent('AUTH_GUARD_REDIRECT')` |
| `recordActiveSessionMarker('ACTIVE_SESSION_LEGACY_JOIN_FALLBACK')` — if reintroduced | S | Wrap the call site with `recordChatBoundaryEvent('ACTIVE_SESSION_LEGACY_JOIN_FALLBACK')`. No current call sites in codebase (audited). |
