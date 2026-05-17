# Unified Game Table Architecture — Audit & Plan

This is an audit + migration plan only. No implementation is proposed yet for approval.

---

## 1. Current architecture audit

### 1.1 Shell ownership today

`src/pages/Game.tsx` is the de-facto shell, but ownership is split:

- **Top chrome** (PlayerOptionsMenu, VisualBugReportButton, Last Hand badge, game name, $): owned directly in Game.tsx (desktop 7952–8073, mobile 8076–8144). This part **is persistent across all statuses** — good.
- **Bottom nav / chat panel / mobile tabs / active-HUD container**: owned **inside** `MobileGameTable` (MobileChatPanel at MobileGameTable:6804, PlayerHand mounts at 4082/4978/6526/6547/6563).
- Because the bottom shell lives inside the game table component, chat input, unread state, tab state, chat watermarks, showdown cache, and community cache had to be **lifted** to Game.tsx (state declared at Game.tsx 883–897) just to survive the table's remounts. That lifting is a workaround, not an abstraction.
- Per-game tables (`CribbageMobileGameTable` 5192L, `GinRummyGameTable` 1884L, `YahtzeeGameTable` 2221L, `TriviaGameTable`) each own their **own** felt geometry, their own HUD wiring, and their own bottom-area concept. There is no single shared table contract.

### 1.2 Render routing / mount churn — exact locations

The render tree in Game.tsx is a long if/else ladder (8146–8830) with multiple **distinct top-level mount points** keyed differently:

| Branch | File:line | `key` | Mounts |
|---|---|---|---|
| Waiting | Game.tsx:8147 | implicit | `WaitingForPlayersTable` (entirely separate component) |
| Non-gin dealer selection background | Game.tsx:8171 | `${gameId}-dealer-selection` | `MobileGameTable` + sibling `HighCardDealerSelection` (8217) |
| game_selection / configuring / game_over-no-config | Game.tsx:8239 | **`${gameId}-${game.status}`** — REMOUNTS every status change | `MobileGameTable` + `DealerGameSetup` (8283) |
| game_over / win-anim (non-cribbage) | Game.tsx:8388 | `${gameId}` | `MobileGameTable` |
| Cribbage unified | Game.tsx:8537 | none | `CribbageMobileGameTable` (single instance ✓) |
| Gin Rummy unified | Game.tsx:8637 | none | `GinRummyGameTable` (single instance ✓) + overlay `HighCardDealerSelection` (8655) |
| Horses / SCC | Game.tsx:8682 | `${gameId}` | `MobileGameTable` |
| Yahtzee unified | Game.tsx:8753 | none | `YahtzeeGameTable` (single instance ✓) |
| Trivia | Game.tsx:8781 | none | `TriviaGameTable` |
| Default in_progress (Holm / 3-5-7) | Game.tsx:8799 | `${gameId}` | `MobileGameTable` |

**Churn hotspots:**

1. **`MobileGameTable key=${gameId}-${game.status}`** at 8239 — this is the worst offender. Every status flip (`game_selection` → `configuring` → `game_over`) physically unmounts and remounts the table. All non-lifted internal state is lost.
2. **`WaitingForPlayersTable` ↔ `MobileGameTable`** swap (8147 ↔ 8171/8239/8388/8682/8799) — when a session falls back to `waiting` and restarts, the entire visible surface is destroyed and a different component is mounted in its place. This is the dominant "a different app loaded" event.
3. **`MobileGameTable` ↔ `CribbageMobileGameTable` / `GinRummyGameTable` / `YahtzeeGameTable`** swap on cross-game transitions inside the same session — different geometries, different mount trees.
4. **`HighCardDealerSelection` is mounted in three different parents** (8217, 8572, 8655) with three different `onComplete` callbacks and three different ownership stories. This is the same kind of seam that produced the recent stale dealer-selection cards bug.
5. **`DealerGameSetup`** (8283) is rendered inline inside the status-keyed branch, so it remounts on every status change inside game_selection/configuring.

### 1.3 Ownership of continuity-sensitive surfaces

| Surface | Owner today | Continuity status |
|---|---|---|
| Top chrome (PPL, options, $) | Game.tsx | Persistent ✓ |
| Bottom nav + chat panel | Inside `MobileGameTable` | Lost on table remount; mitigated by lifted state |
| Active player HUD (PlayerHand / actions) | Inside each game table | Lost on cross-game swap |
| Announcement ribbon | Each table has its own (DealerAnnouncement, AnteUpAnimation, win overlays) | No cross-game continuity |
| Chip animations | Inside each table (`HolmWinPotAnimation`, `HorsesWinPotAnimation`, `CribbageChipTransferAnimation`, 357 win, Chucky hand) | Cannot animate across a cross-game swap; cached only via refs lifted to Game.tsx |
| Dealer selection overlay | `HighCardDealerSelection` (3 mount sites) | Stale-state regressions have already happened here |
| Waiting/config overlays | `WaitingForPlayersTable` is a sibling component, `DealerGameSetup` is inline inside a remount-heavy branch | Discontinuous |
| Timer / status | Mostly inside game tables; deadlines computed in Game.tsx | OK functionally, no visual continuity |
| Observer↔Active seat projection | Inside each table independently | Each table reimplements the contract |

### 1.4 Continuity-breaking transition hotspots (ranked)

1. **waiting ↔ any active status** — full component swap.
2. **status-keyed remount at 8239** — every `game_selection`/`configuring`/`game_over` step destroys the table.
3. **Cross-game transitions** (Holm → Cribbage, etc.) — different table component entirely.
4. **Dealer-selection mount/unmount** at 3 sites, each with their own state plumbing.
5. **Game-over → next-game** — currently mediated by `handleGameOverComplete` which flips status, causing multiple of the above swaps in sequence.

---

## 2. Target architecture (north star)

A single canonical, always-mounted shell that owns geometry; games provide swappable artifact layers.

```text
<GameRoom>                          ← always mounted for the whole session
  <TopChrome />                     ← already persistent; small refactor
  <SharedTableSurface>              ← NEW: one geometry, one seat projector,
    <SeatLayer />                   ←      one observer/relative projection
    <FeltLayer />                   ←      games render into named slots:
    <ArtifactSlot name="center" /> ←      community, dice, cut card, pegs
    <ArtifactSlot name="player-N" /> ←   per-seat artifacts
    <AnnouncementLayer />           ← persistent ribbon, latched by phase
    <ChipFlightLayer />             ← persistent; owns ALL pot/win/leg/peg animations
    <OverlayLayer />                ← dealer-selection, ante-up, game-over,
                                     waiting-for-players — all OVERLAYS, never swap
  </SharedTableSurface>
  <ActiveHUDSlot />                 ← bottom cockpit; persistent container, swappable contents
  <BottomNav />                     ← already conceptually persistent; just hoist out
</GameRoom>

<GameAdapter game={game.game_type}>  ← thin per-game module that:
  - declares which artifacts to render into which slots
  - declares HUD contents
  - reads from its existing sync framework
  - NEVER owns geometry or shell
```

Key contracts:

- **Shell is never unmounted** for the life of a session. Status changes flip props/slot contents, not React component identity.
- **Per-game tables become "GameAdapters"** that hand artifact React nodes to slots, not page-sized components.
- **Existing observer/active seat projector becomes a single `<SeatLayer />`**, fed by the same data it gets today. No semantics change.
- **Existing sync framework (authoritative / optimistic / presentation)** is untouched. Adapters still derive from `viewState`. The `Single Legality-State Rule`, identity wiring, framework cutovers, and progress vectors all keep working as-is.
- **Lifecycle reset invariant**: artifact slots are keyed by `(dealer_game_id, hand_number, round_number)` so transient state still resets at boundaries via the existing context-based reset pattern. No new hidden truth surface.

---

## 3. Phased migration plan (surgical, no rewrite)

Each phase ships independently, is independently revertible, and does not destabilize sync.

### Phase 0 — Instrumentation (1 small PR)
- Add a mount/unmount logger keyed to component + reason at the existing churn sites (8147/8171/8239/8388/8682/8753/8799 and the three HighCardDealerSelection sites). Persist to `sync_debug_events` using existing telemetry infrastructure.
- Goal: baseline measurement of churn before/after each later phase.
- Zero behavior change. Risk: none.

### Phase 1 — Kill the status-keyed remount (highest ROI, smallest blast)
- Change the key at Game.tsx:8239 from `${gameId}-${game.status}` to `${gameId}`.
- Audit `MobileGameTable` for any logic that relies on remount-as-reset for game_selection/configuring/game_over; convert those resets to the existing context-based reset pattern keyed on `handContextId`/`game.status`.
- Outcome: `game_selection` ↔ `configuring` ↔ `game_over` no longer destroys the table for Holm/Horses/SCC/3-5-7.
- Risk: medium-low. Mitigation: ship behind a `unifiedShell.killStatusKey` debug flag; flip per session.

### Phase 2 — Lift the bottom nav + chat panel out of `MobileGameTable`
- Move `MobileChatPanel` and bottom tab bar from `MobileGameTable` (MobileChatPanel at 6804) up to Game.tsx as a sibling of the game-area branches.
- The already-lifted state (Game.tsx 883–897) becomes its natural state, no longer a workaround.
- Outcome: bottom shell stops blinking across any table swap, including waiting ↔ active.
- Risk: low. Pure relocation; no logic change. Visual-only.

### Phase 3 — Make `WaitingForPlayersTable` an overlay, not a swap
- Replace the `status === 'waiting'` branch (8147) with: keep the active game-area branch mounted at all times, render `WaitingForPlayersTable` content as an overlay on top of the persistent table when `status === 'waiting'`.
- Apply the existing "Game tables persist across phases; use overlays, do not unmount" Core rule (already in memory for Cribbage/Gin/Yahtzee) to Holm/Horses/SCC/3-5-7 as well.
- Outcome: session fall-back-to-waiting → restart no longer feels like a new app load.
- Risk: medium. Mitigation: render the active branch with empty/zero data when `waiting`, matching what `MobileGameTable` already does at lines 8171–8215 (the "dealer-selection-bg" branch is exactly this pattern, just for one status).

### Phase 4 — Consolidate `HighCardDealerSelection` to ONE mount site
- Lift `HighCardDealerSelection` out of all three branches (8217, 8572, 8655) into a single shell-owned overlay, fed by `(game as any).dealer_selection_state`, gated on `status in {dealer_selection, cribbage_dealer_selection}` and `game_type` for the variant.
- `onComplete` routes by game type (existing `selectDealer` vs `handleCribbageDealerSelectionComplete`).
- Outcome: one render path, one reset path. Eliminates the recent class of stale-card regressions.
- Risk: low. Logic preserved verbatim; just hoist + dispatch.

### Phase 5 — Introduce `<SharedTableSurface />` + artifact slots (the actual unification)
- Extract the table geometry currently in `MobileGameTable` into a new `SharedTableSurface` that owns: seat projection (relative/absolute), felt, chip flight layer, announcement layer, overlay layer, active-HUD slot.
- Rewrite `MobileGameTable`, `CribbageMobileGameTable`, `GinRummyGameTable`, `YahtzeeGameTable` as **adapters** that render their artifacts into named slots of the shared surface. They no longer own geometry.
- Adapters are mounted in parallel; only the matching one renders artifacts for the current `game_type`. The surface stays mounted always.
- Outcome: Holm → Cribbage becomes "cards animate out of player-N slots, cribbage pegs/cut-card animate into center slot" with no remount.
- Risk: highest of any phase. Strategy:
  - Migrate one game at a time behind a per-game flag (`unifiedShell.holm`, `unifiedShell.cribbage`, …).
  - Cribbage/Gin/Yahtzee already follow "single persistent instance" so they're partially there; do those last as validation.
  - Run the existing sync invariants + race harness on each rollout.

### Phase 6 — Centralize chip-flight + announcement layers
- Move per-game animations (`HolmWinPotAnimation`, `HorsesWinPotAnimation`, 357 win, Cribbage chip transfer, AnteUp) into the persistent `ChipFlightLayer` / `AnnouncementLayer`, dispatched by adapters.
- Outcome: cross-game animation continuity ("chips settle, then cribbage surfaces animate in").
- Risk: medium; do per-animation, not all at once.

---

## 4. What stays persistent vs what becomes shell

**Stays persistent (becomes shell infrastructure):**
- Top chrome (already persistent — minor cleanup).
- Bottom nav + MobileChatPanel + tab state + unread/read watermarks.
- Active-HUD slot container (contents swap per game; container does not).
- Seat projector + felt geometry + overlay container + chip-flight + announcement layer.
- Dealer-selection overlay (one mount).
- Waiting/seat-selection overlay (one mount).
- DealerGameSetup overlay.
- All currently lifted caches (showdown, community, dealer-selection cards).

**Stays per-game (becomes adapter):**
- Game-specific artifact rendering (cards, dice, pegs, scoreboards).
- Game-specific HUD contents (PlayerHand for card games, dice controls for dice games, score sheet for Yahtzee).
- Game-specific sync hooks, controllers, bots, scoring — untouched.

---

## 5. Regression risk analysis

| Risk | Probability | Mitigation |
|---|---|---|
| Lost reset semantics from removing the status key | Medium | Phase 1 audits each remount-as-reset and converts to context-based reset keyed on existing IDs; ships behind a flag |
| Animation triggers double-firing in persistent layers | Medium | Reuse existing `useRef` source-level animation-trigger guards; tie animation identity to `(dealer_game_id, hand_number, round_number)` |
| Sync framework drift (presentation/authoritative) | Low | Adapters don't touch sync; they only render slots. All Core rules (DB-first round/hand sync, viewState-only legality, no observer ack, no polling) remain in adapter scope |
| Stale transient state leaking across boundaries | Medium-high (this is the historical regression class) | Every shell-owned overlay gets an explicit boundary-reset effect keyed on authoritative IDs, matching the existing presentation-reset protocol. Phase 0 instrumentation catches leaks early |
| Cron / edge function progression broken | None | Server side untouched; active-human guard, pause enforcement, grace period unchanged |
| Mobile-only constraint violated | Low | Memory Core rule "Focus only on mobile/unified components; desktop deprecated" — desktop branch (7952) gets the same shell treatment but is not the primary target |
| User-visible regressions during rollout | Medium | Per-phase + per-game feature flags; ship one game type at a time in Phase 5/6 |

---

## 6. Recommended first low-risk implementation slice

**Phase 0 + Phase 1 + Phase 4**, shipped together as a single PR set:

1. Add mount/unmount instrumentation at the 8 churn sites.
2. Drop the `${game.status}` segment from the key at 8239 (behind a flag).
3. Consolidate `HighCardDealerSelection` to a single shell-owned overlay.

These three together:
- Are pure plumbing — no new state, no sync changes.
- Touch one file (Game.tsx) plus light changes to `HighCardDealerSelection` and `MobileGameTable` reset effects.
- Deliver immediate continuity wins on the most-visible transitions.
- Establish the measurement baseline needed for Phases 2–6.
- Are independently revertible per change.

After verification in production, proceed Phase 2 → 3 → 5 → 6 in order. Phase 5 is the only one that should be done one game at a time.

---

## 7. Code hotspots to inspect first

Priority order for the implementation slice above:

1. `src/pages/Game.tsx` 8146–8830 — the render ladder. The whole initiative pivots on this region.
2. `src/pages/Game.tsx` 1850–1910 — the realtime status handler that already does context-based clearing on status boundaries (the model for Phase 1 resets).
3. `src/components/MobileGameTable.tsx` — find every place that uses mount as a reset; specifically scan for `useEffect(() => { ... }, [])` and `useState(initial)` that assume fresh mount per status.
4. `src/components/HighCardDealerSelection.tsx` — already self-contained and DB-synced; minor refactor to accept a `variant` and a typed `onComplete` dispatcher.
5. `src/components/WaitingForPlayersTable.tsx` — confirm it can render as an overlay over the persistent table (Phase 3 prep).
6. `src/components/DealerGameSetup.tsx` — confirm it tolerates being mounted persistently and gated by `config_complete` (Phase 3 prep).
7. `src/components/CribbageMobileGameTable.tsx` / `GinRummyGameTable.tsx` / `YahtzeeGameTable.tsx` — already follow the single-persistent-instance pattern; treat as the reference for Phase 5 adapters.

---

## 8. Out of scope (explicit)

- No changes to: timeout/deadline architecture, server enforcement, cron, edge functions, RLS, sync framework internals, progress vectors, race harness, bot controllers, scoring, accounting.
- No giant rewrites. No replacement of the seat model. No replacement of the active-HUD concept. No changes to the no-blind-spot / single-legality-state / triple-key-scoping rules.

Awaiting approval before any implementation.