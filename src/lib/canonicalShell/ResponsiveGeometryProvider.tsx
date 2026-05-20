/**
 * ResponsiveGeometryProvider — canonical shell geometry tokens (Phase 3).
 *
 * Single source of truth for device-class-driven geometry tokens used
 * by the persistent table shell and game bodies. Consumers read tokens
 * via useGeometryTokens() instead of calling useDeviceSize and the
 * sizing helpers directly.
 *
 * Phase 3 scope (snap-only, zero behavioral drift):
 *   - Module exists with a stable canonical token shape.
 *   - Internally delegates to existing useDeviceSize + SIZE_MULTIPLIERS
 *     + getDeviceClasses / getCardSizeForDevice helpers — token VALUES
 *     are not introduced or changed in this phase.
 *   - Provider is mounted at the app root so it's available app-wide,
 *     but no existing consumer is migrated in this phase. Consumer
 *     migration happens in later phases alongside shell extraction.
 *
 * Responsive contract (locked):
 *   - Same architecture across phone/tablet/desktop.
 *   - Only token VALUES adapt by device class — never the structure.
 *   - Hidden classes / per-game exceptions are NOT a substitute for
 *     declaring a token here.
 */

import { createContext, useContext, useMemo, useEffect, useRef, type ReactNode } from 'react';
import {
  useDeviceSize,
  SIZE_MULTIPLIERS,
  getCardSizeForDevice,
  getDeviceClasses,
  type DeviceType,
} from '@/hooks/useDeviceSize';
import { recordShellEvent } from './diagnostics';

// ── Token shape ────────────────────────────────────────────────

export interface GeometryScale {
  /** Playing card scale multiplier. */
  card: number;
  /** Gap / margin scale multiplier. */
  spacing: number;
  /** Font size scale multiplier. */
  text: number;
  /** Player avatar scale multiplier. */
  avatar: number;
}

export interface GeometryClassTokens {
  cardGap: string;
  playerGap: string;
  containerPadding: string;
}

/**
 * P8.0 (Visual Unification): provisional center-content size hint.
 * Cribbage-dense and Yahtzee-dense are expected to diverge in tuning;
 * this token graduates to named sub-modes only if real reuse emerges.
 * Default is 'standard'; no consumer reads this in P8.0.
 */
export type CenterSize = 'compact' | 'standard' | 'dense';

export interface GeometryTokens {
  deviceType: DeviceType;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  screenWidth: number;
  scale: GeometryScale;
  classes: GeometryClassTokens;
  /**
   * P8.0 provisional: declared by gameplay slot children to hint at
   * required center real estate. No production consumer in P8.0.
   * Defaults to 'standard' at the provider level.
   */
  centerSize: CenterSize;
  /**
   * Canonical max height of the active table-surface region (felt + game
   * content). Promoted from the inline `55vh` previously hardcoded across
   * gameplay surfaces (Cribbage, Yahtzee, Mobile, Gin) and the neutral
   * interstitial. Consumers read this so neutral→active transitions are
   * geometrically continuous without per-game magic constants.
   *
   * Future: graduate to per-`surfaceProfile` overrides (card-standard,
   * dice-standard, ergonomic-2p) via a declared profile prop. Today a
   * single value covers every active surface.
   */
  tableSurfaceMaxHeight: string;
  /** Resolve a base card size symbol to its device-appropriate size. */
  resolveCardSize: (base?: 'sm' | 'md' | 'lg' | 'xl') => 'sm' | 'md' | 'lg' | 'xl';
}

// ── Context ────────────────────────────────────────────────────

const GeometryTokensContext = createContext<GeometryTokens | null>(null);

interface ResponsiveGeometryProviderProps {
  children: ReactNode;
}

export function ResponsiveGeometryProvider({ children }: ResponsiveGeometryProviderProps) {
  const { deviceType, isPhone, isTablet, isDesktop, screenWidth } = useDeviceSize();

  const value = useMemo<GeometryTokens>(() => {
    const scale = SIZE_MULTIPLIERS[deviceType];
    const classes = getDeviceClasses(deviceType);
    return {
      deviceType,
      isPhone,
      isTablet,
      isDesktop,
      screenWidth,
      scale,
      classes,
      centerSize: 'standard',
      tableSurfaceMaxHeight: '55vh',
      resolveCardSize: (base = 'md') => getCardSizeForDevice(deviceType, base),
    };
  }, [deviceType, isPhone, isTablet, isDesktop, screenWidth]);

  // Diagnostic: record device-class transitions once per change.
  const lastDeviceRef = useRef<DeviceType | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (lastDeviceRef.current !== deviceType) {
      recordShellEvent('overlay-enter', {
        detail: {
          surface: 'responsive-geometry',
          from: lastDeviceRef.current,
          to: deviceType,
          screenWidth,
        },
      });
      lastDeviceRef.current = deviceType;
    }
  }, [deviceType, screenWidth]);

  return (
    <GeometryTokensContext.Provider value={value}>
      {children}
    </GeometryTokensContext.Provider>
  );
}

/**
 * Read canonical geometry tokens. Throws if used outside the provider.
 * Prefer this over calling useDeviceSize / SIZE_MULTIPLIERS directly
 * once consumers are migrated in later phases.
 */
export function useGeometryTokens(): GeometryTokens {
  const v = useContext(GeometryTokensContext);
  if (!v) {
    throw new Error('useGeometryTokens must be used inside <ResponsiveGeometryProvider>');
  }
  return v;
}

/** Optional variant for gradual adoption: returns null instead of throwing. */
export function useGeometryTokensOptional(): GeometryTokens | null {
  return useContext(GeometryTokensContext);
}
