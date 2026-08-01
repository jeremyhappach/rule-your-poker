# Repository map

Status: bootstrap required after final Lovable clone/tag.

This file must be populated by the first Codex read-only ingestion task. Do not guess paths not verified in the final repository.

## Known high-value paths/symbols

| Area | Known path/symbol |
|---|---|
| Main game orchestration | `src/pages/Game.tsx` |
| Shared mobile table/gameplay surface | `src/components/MobileGameTable.tsx` |
| Playing card primitive | `src/components/PlayingCard.tsx` |
| Session Ended phase | `src/components/canonicalShell/SessionEndedTablePhase.tsx` |
| Canonical felt | `src/components/canonicalShell/CanonicalFeltSurface.tsx` |
| Player options/Add Bot menu | `src/components/PlayerOptionsMenu.tsx` |
| Bot creation/decision helpers | `src/lib/botPlayer.ts` |
| Bot alias helpers | `src/lib/botAlias.ts`, `src/lib/botNaming.ts` |
| Shared snapshot/game logic | `src/lib/gameLogic.ts` |
| Cribbage terminal snapshot helper | `src/lib/cribbageRoundLogic.ts` |
| Waiting-room actions | `src/hooks/useWaitingRoomActions.ts` |
| Waiting table | `src/components/WaitingForPlayersTable.tsx` |
| Holm settlement RPC | `holm_settle_hand` |
| Transactional bot creation RPC | `create_session_bot` |
| 3-5-7 round advance RPC | `advance_357_round` |

## Bootstrap deliverable

For each game add route/component entry, authoritative adapter/hooks, action controller, settlement helper/RPC, bot controller, configuration, presentation slots, terminal owner, migrations, and focused tests/harnesses.

Also map Supabase initialization, realtime subscriptions, session/lobby routes, shell components, announcements, transport/celebration owners, snapshot readers/writers, participant/seat projection, and debug harness registry.
