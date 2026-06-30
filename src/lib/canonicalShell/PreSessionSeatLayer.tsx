/**
 * PreSessionSeatLayer — single shell-mounted seat/chip cluster set for
 * the pre-session lifecycle (WaitingTable → NeutralInterstitial →
 * WaitingSlot → DealerSelection → DealerConfig).
 *
 * Wartime FIX #1 (chip continuity): previously each pre-session phase
 * surface (CanonicalShellWaitingSurface, NeutralInterstitial, and
 * MobileGameTable's pre-session branch) rendered its OWN
 * CanonicalSeatCluster nodes inside its OWN JSX subtree. Because those
 * surfaces mount/unmount as phases change, the cluster nodes (and
 * their `clusterInstanceId` / `chipDomNodeId`) were re-created on
 * every transition — visible as a chip flicker / re-paint.
 *
 * This layer hoists the seat-cluster set to a single, stable React
 * tree position inside PersistentTableShell, so the same cluster
 * instances survive every pre-session phase swap underneath. Phase
 * surfaces become content-only during pre-session and consult
 * `usePreSessionSeatOwned()` to skip their local cluster JSX.
 *
 * SCOPE — strictly pre-session continuity ONLY:
 *   - identity pill + chip bubble + dealer pip suppressed
 *   - status palette via `derivePlayerStatus`
 *   - no gameplay decorators (turn pulse, leg pips, auto-roll,
 *     emoticons, ValueChangeFlash, card backs)
 *   - layer UNMOUNTS the moment gameplay takes ownership; gameplay
 *     surfaces (Cribbage / Gin / Yahtzee / Horses / Holm / 3-5-7)
 *     keep their existing seat & chip ownership unchanged.
 *
 * Consumes the shell-owned SeatAnchorLayer (mounted in
 * PersistentTableShell). Same providerInstanceId / projectionMode /
 * placement contract as every other canonical consumer.
 */

import { createContext, useContext, type ReactNode } from 'react';
import { CanonicalSeatCluster } from './CanonicalSeatCluster';
import { useSeatAnchorsOptional } from './SeatAnchorLayer';
import { derivePlayerStatus } from './participantStatus';
import { getDisplayName } from '@/lib/botAlias';
import { formatChipBalance } from '@/lib/canonicalShell/chipBalanceFormat';

export interface PreSessionParticipant {
  id: string;
  position: number;
  chips?: number | null;
  status?: string;
  user_id?: string | null;
  is_bot?: boolean | null;
  waiting?: boolean | null;
  sitting_out?: boolean | null;
  auto_fold?: boolean | null;
  profiles?: { username?: string };
}

/** True when the shell-owned PreSessionSeatLayer is mounted above the
 *  consumer. Phase surfaces use this to skip their local pre-session
 *  cluster JSX so a single set of cluster nodes survives the
 *  transition. */
const PreSessionSeatOwnedContext = createContext<boolean>(false);

export function usePreSessionSeatOwned(): boolean {
  return useContext(PreSessionSeatOwnedContext);
}

export function PreSessionSeatOwnershipProvider({
  active,
  children,
}: { active: boolean; children: ReactNode }) {
  return (
    <PreSessionSeatOwnedContext.Provider value={active}>
      {children}
    </PreSessionSeatOwnedContext.Provider>
  );
}

export interface PreSessionSeatLayerProps {
  participants: PreSessionParticipant[];
  currentUserId?: string | null;
}

export function PreSessionSeatLayer({
  participants,
  currentUserId,
}: PreSessionSeatLayerProps) {
  const ambient = useSeatAnchorsOptional();
  if (!ambient) return null;
  const { byPosition } = ambient;

  return (
    <div
      data-canonical-shell-pre-session-seat-layer=""
      className="absolute inset-0 z-20 pointer-events-none"
    >
      {participants.map(player => {
        const anchor = byPosition.get(player.position);
        if (!anchor) return null;
        // Self-suppression is handled inside CanonicalSeatCluster
        // (returns null when viewerPosition === position).
        const actualUsername =
          player.profiles?.username ?? (player.is_bot ? 'Bot' : 'Player');
        const label = getDisplayName(participants as any, player as any, actualUsername);
        const status = derivePlayerStatus(player as any, null, {
          hasStayDecision: false,
        });
        return (
          <CanonicalSeatCluster
            key={player.id}
            slot={anchor.slot}
            position={player.position}
            name={label}
            chipValue={formatChipBalance(player.chips ?? 0)}
            status={status}
            statusRing={status}
            isDealer={false}
            ownerLabel="Shell:PreSessionSeatLayer"
            playerId={player.id}
          />
        );
      })}
    </div>
  );
}
