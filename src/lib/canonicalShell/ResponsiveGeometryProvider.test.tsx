import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import {
  ResponsiveGeometryProvider,
  useGeometryTokens,
  useGeometryTokensOptional,
} from './ResponsiveGeometryProvider';
import { SIZE_MULTIPLIERS, getDeviceClasses } from '@/hooks/useDeviceSize';

const wrapper = ({ children }: { children: ReactNode }) => (
  <ResponsiveGeometryProvider>{children}</ResponsiveGeometryProvider>
);

describe('ResponsiveGeometryProvider', () => {
  it('throws when useGeometryTokens used outside provider', () => {
    expect(() => renderHook(() => useGeometryTokens())).toThrow(
      /must be used inside <ResponsiveGeometryProvider>/,
    );
  });

  it('optional variant returns null outside provider', () => {
    const { result } = renderHook(() => useGeometryTokensOptional());
    expect(result.current).toBeNull();
  });

  it('exposes tokens that snap to the existing device-class sources', () => {
    const { result } = renderHook(() => useGeometryTokens(), { wrapper });
    const t = result.current;
    expect(t.deviceType).toBeDefined();
    // Token values must come directly from existing sources (snap-only).
    expect(t.scale).toBe(SIZE_MULTIPLIERS[t.deviceType]);
    expect(t.classes).toEqual(getDeviceClasses(t.deviceType));
    // Card-size resolver round-trips for every base symbol.
    for (const base of ['sm', 'md', 'lg', 'xl'] as const) {
      expect(['sm', 'md', 'lg', 'xl']).toContain(t.resolveCardSize(base));
    }
  });

  it('phone/tablet/desktop booleans agree with deviceType', () => {
    const { result } = renderHook(() => useGeometryTokens(), { wrapper });
    const t = result.current;
    const count = [t.isPhone, t.isTablet, t.isDesktop].filter(Boolean).length;
    expect(count).toBe(1);
    if (t.isPhone) expect(t.deviceType).toBe('phone');
    if (t.isTablet) expect(t.deviceType).toBe('tablet');
    if (t.isDesktop) expect(t.deviceType).toBe('desktop');
  });
});
