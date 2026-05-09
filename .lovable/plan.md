## Sync Framework Compliance Bundle

Single bundled cleanup applying the framework contract uniformly across all games. Scoring, rules, animations, visual contracts, and timeouts are untouched. No new instrumentation.

### Scope (strict allowlist)

1. **Eliminate `?? raw` / `?? currentRound` fallbacks** in render paths
   - Holm: `Game.tsx` ~7937, 7944, 8230 (and any sibling occurrences)
   - 3-5-7: `Game.tsx` ~8330, 8337
   - Cribbage: `CribbageMobileGameTable.tsx` ~431–435
   - Yahtzee: `YahtzeeGameTable.tsx` ~340–345
   - Horses/SCC: `HorsesPlayerArea.tsx` ~260+
   - Rule: when `presentationState` exists, render reads MUST come from it. No raw fallback. If presentation is null/undefined at first paint, render the empty/loading branch the game already has — do not paper over it with `currentRound`.

2. **Identity source unification**
   - Cribbage: replace remaining raw `currentRoundId-${currentHandNumber}` keys passed into presentation-driven children with `renderHandKey` (already in scope). Audit `CribbageMobileGameTable.tsx` for any other handBoundaryKey/effect-key sourced from raw.
   - Yahtzee: reset/turn-transition effects keyed on raw `currentRoundId` → key on presentation-derived round identity (`viewState`-derived).
   - Horses/SCC: bot/timeout/cleanup effects use raw `currentRoundId` while turn identity is derived from `horsesState` (presentation). Compute a single `presentationRoundId` once per render and use it for ALL effect deps that are paired with presentation-derived reads. DB target IDs (for write payloads) keep raw round — only the *gating identity* unifies.
   - Holm: timer effect keyed on raw round → presentation-derived identity.

3. **Callback/effect read cleanup**
   - Effects and bot callbacks that read state at fire time must use `presentationRefValue` (sync ref) instead of stale closure over `presentationState`, where the read is paired with a presentation-derived identity check.
   - Yahtzee bot/timeout effects: read `yahtzeeView`-equivalent via `presentationRefValue` at callback fire time.
   - Horses/SCC bot/timeout effects: same.
   - Do NOT touch DB write payload construction — only the gating reads.

4. **Cribbage remaining identity cleanup**
   - Audit any `useEffect` in `CribbageMobileGameTable.tsx` whose dep array contains `currentRoundId` or `currentHandNumber` while the body reads `viewState`. Replace deps with `renderHandKey` (or presentation-derived equivalent).

### Out of scope (will reject during review)

- Scoring math, game rules, animation timing, visual contract logic, timeouts, new logs, speculative fixes.

### Operational

- Single branch, single deploy.
- Revert path: this is a localized read/key-source swap; reverting the bundle restores the prior `?? raw` fallbacks and raw effect keys exactly.
- Validation: next cross-country session. If any regression, revert bundle.

### Technical notes

- Pattern for fallback removal:
  ```ts
  // BEFORE
  const x = viewState?.foo ?? currentRound?.foo;
  // AFTER
  const x = viewState?.foo;
  if (x == null) return <EmptyOrLoading />;
  ```
  Use the game's existing empty/loading branch; do not invent new ones.

- Pattern for identity unification (Horses/SCC):
  ```ts
  const presentationRoundId = horsesView?.roundId ?? null;
  // all effects gating on presentation reads:
  useEffect(() => { ... }, [presentationRoundId, ...]);
  ```

- `presentationRefValue` usage stays narrow: only inside callbacks/timers where closure staleness is the actual bug surface.
