/**
 * Shared, cached `env(safe-area-inset-bottom)` probe. One measurement
 * per document; consumers of the canonical action-reservation model
 * read the same value so reservation math never diverges by owner.
 */
let cached: number | null = null;

export function readSafeAreaBottomPx(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  if (cached !== null) return cached;
  try {
    const probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.width = '0';
    probe.style.height = 'env(safe-area-inset-bottom, 0px)';
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    document.body.removeChild(probe);
    cached = Number.isFinite(h) ? h : 0;
  } catch {
    cached = 0;
  }
  return cached;
}
