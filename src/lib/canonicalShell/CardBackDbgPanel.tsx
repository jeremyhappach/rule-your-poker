/**
 * CardBackDbgPanel — live DOM inventory of every hidden-card surface.
 *
 * Proves the invariant:
 *     ONE TABLE · ONE DEAL · ONE CARD BACK
 *
 * For every element painting a card back currently visible on screen,
 * the pill answers four questions:
 *
 *   1. component=  CanonicalCardBack | LEGACY
 *   2. source=     VisualPreferences | bespoke gradient | unknown
 *   3. colors=     the actual {color,darkColor} the DOM is rendering
 *   4. owner=      nearest [data-canonical-shell-*], [data-card-anchor],
 *                  [data-game-*] ancestor — so we can name the consumer
 *                  without source-diving.
 *
 * Canonical entries:
 *   any element with [data-canonical-card-back] attribute.
 *
 * Legacy detection:
 *   any element whose computed background-image starts with
 *   `linear-gradient(135deg` AND whose computed aspect ratio is within
 *   ±20% of the canonical 2:3 playing-card ratio AND whose width is
 *   between 8px and 200px, that is NOT itself or a descendant of a
 *   [data-canonical-card-back] subtree. These are the bespoke offenders.
 *
 * The pill scans on rAF tick + after any DOM mutation in document.body.
 * It is gated by the 'cardBackDbg' debug pill toggle.
 */

import { useEffect, useState } from 'react';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import { useDebugPillEnabled } from '@/lib/debugTray/debugPillsStore';
import { useVisualPreferences } from '@/hooks/useVisualPreferences';

interface InventoryRow {
  uid: string;
  kind: 'canonical' | 'legacy';
  variant: string | null;
  color: string;
  darkColor: string;
  width: number;
  height: number;
  // Full style fingerprint — exposes drift between variants of the same
  // canonical component. Two rows with the same `kind=canonical` but
  // different `borderColor`/`gradient`/`radiusPctW` are a design-language
  // violation, even though both pass the "is canonical?" check.
  borderWidthPx: number;
  borderColor: string;
  radiusPx: number;
  radiusPctW: number;       // radius as % of width — must be ~same across variants
  boxShadow: string;
  backgroundImage: string;  // raw computed gradient string
  accent: 'logo' | 'frame' | 'none';
  owner: string;
  tag: string;
  className: string;
  cardAnchor: string | null;
}

const PLAYING_CARD_ASPECT = 1.5; // height/width
const ASPECT_TOLERANCE = 0.3;     // ±30% so transient resized cards still flag

function parseGradientStops(bg: string): { color: string; darkColor: string } | null {
  // Matches `linear-gradient(135deg, #aabbcc 0%, #001122 100%)` or `rgb(...)` colors.
  // We pull the first two color tokens.
  if (!bg || bg === 'none') return null;
  if (!bg.includes('135deg') && !bg.includes('linear-gradient')) return null;
  const colorRegex = /#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)/g;
  const matches = bg.match(colorRegex);
  if (!matches || matches.length < 2) return null;
  return { color: matches[0], darkColor: matches[1] };
}

function ownerLabel(el: Element): string {
  // Walk up to find an identifying ancestor.
  let cur: Element | null = el.parentElement;
  const hops: string[] = [];
  while (cur && hops.length < 8) {
    for (const attr of Array.from(cur.attributes)) {
      if (
        attr.name.startsWith('data-canonical-shell-') ||
        attr.name === 'data-canonical-felt-surface' ||
        attr.name.startsWith('data-game-') ||
        attr.name.startsWith('data-card-anchor') ||
        attr.name === 'data-card-transport-intent'
      ) {
        return `${attr.name}${attr.value ? `=${attr.value}` : ''}`;
      }
    }
    cur = cur.parentElement;
  }
  return '(no labeled ancestor)';
}

function nearestCardAnchor(el: Element): string | null {
  const a = el.closest('[data-card-anchor]');
  return a ? a.getAttribute('data-card-anchor') : null;
}

function isVisible(el: Element): boolean {
  const r = (el as HTMLElement).getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const cs = window.getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.display === 'none') return false;
  if (parseFloat(cs.opacity || '1') < 0.05) return false;
  return true;
}

function parsePxTopValue(v: string): number {
  // border-width / border-radius can come back as "1px" or "1px 1px 1px 1px".
  if (!v) return 0;
  const first = v.split(' ')[0];
  const n = parseFloat(first);
  return Number.isFinite(n) ? n : 0;
}

function detectAccent(el: Element): 'logo' | 'frame' | 'none' {
  const img = el.querySelector('img[aria-hidden="true"]');
  if (img) return 'logo';
  // inset frame = absolute child with border styling and no children/text
  const frame = Array.from(el.children).find((c) => {
    if (c.tagName.toLowerCase() !== 'div') return false;
    const cs = window.getComputedStyle(c);
    return cs.position === 'absolute' && parsePxTopValue(cs.borderTopWidth) > 0;
  });
  return frame ? 'frame' : 'none';
}

function scanInventory(): InventoryRow[] {
  if (typeof document === 'undefined') return [];
  const rows: InventoryRow[] = [];
  let uid = 0;

  const pushRow = (
    el: HTMLElement,
    kind: 'canonical' | 'legacy',
    variant: string | null,
  ) => {
    const cs = window.getComputedStyle(el);
    const stops = parseGradientStops(cs.backgroundImage) ?? { color: '?', darkColor: '?' };
    const r = el.getBoundingClientRect();
    const w = Math.round(r.width);
    const radius = parsePxTopValue(cs.borderTopLeftRadius || cs.borderRadius);
    rows.push({
      uid: `${kind === 'canonical' ? 'c' : 'l'}${uid++}`,
      kind,
      variant,
      color: stops.color,
      darkColor: stops.darkColor,
      width: w,
      height: Math.round(r.height),
      borderWidthPx: parsePxTopValue(cs.borderTopWidth),
      borderColor: cs.borderTopColor || '(none)',
      radiusPx: Math.round(radius * 10) / 10,
      radiusPctW: w > 0 ? Math.round((radius / w) * 1000) / 10 : 0,
      boxShadow: cs.boxShadow && cs.boxShadow !== 'none' ? cs.boxShadow : 'none',
      backgroundImage: cs.backgroundImage,
      accent: detectAccent(el),
      owner: ownerLabel(el),
      tag: el.tagName.toLowerCase(),
      className: (el.className || '').toString().slice(0, 40),
      cardAnchor: nearestCardAnchor(el),
    });
  };

  // 1) Canonical entries.
  const canonical = Array.from(document.querySelectorAll('[data-canonical-card-back]')) as HTMLElement[];
  for (const el of canonical) {
    if (!isVisible(el)) continue;
    pushRow(el, 'canonical', el.getAttribute('data-canonical-card-back'));
  }

  // 2) Legacy detection — gradient-painted card-shaped divs that are
  //    NOT inside a CanonicalCardBack subtree.
  const allDivs = document.querySelectorAll('div, span');
  for (const el of Array.from(allDivs)) {
    if (el.hasAttribute('data-canonical-card-back')) continue;
    if (el.closest('[data-canonical-card-back]')) continue;
    if (el.closest('[data-card-back-dbg-panel]')) continue;
    if (el.closest('[data-debug-tray]')) continue;
    const cs = window.getComputedStyle(el);
    const bg = cs.backgroundImage;
    if (!bg.includes('linear-gradient')) continue;
    if (!bg.includes('135deg')) continue;
    const r = (el as HTMLElement).getBoundingClientRect();
    if (r.width < 8 || r.width > 220) continue;
    if (r.height < 8 || r.height > 320) continue;
    const aspect = r.height / r.width;
    if (Math.abs(aspect - PLAYING_CARD_ASPECT) / PLAYING_CARD_ASPECT > ASPECT_TOLERANCE) continue;
    if (!isVisible(el)) continue;
    pushRow(el as HTMLElement, 'legacy', null);
  }

  return rows;
}

export function CardBackDbgPanel() {
  const inTray = useInDebugTray();
  const enabled = useDebugPillEnabled('cardBackDbg');
  const { getCardBackColors, getCardBackId } = useVisualPreferences();
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [tick, setTick] = useState(0);
  const [copied, setCopied] = useState(false);

  // Poll the DOM once per 500ms while enabled. Mutation-observer would be
  // more efficient but card backs mount/unmount inside transport intervals
  // anyway, so a half-second tick is more than enough to surface drift.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    setRows(scanInventory());
  }, [enabled, tick]);

  if (!enabled) return null;

  const prefs = getCardBackColors();
  const prefId = getCardBackId();
  const canonicalCount = rows.filter((r) => r.kind === 'canonical').length;
  const legacyCount = rows.filter((r) => r.kind === 'legacy').length;
  const headerColor = legacyCount > 0 ? '#ff7777' : '#7CFC00';
  const summary = `${canonicalCount}✓ ${legacyCount > 0 ? `· ${legacyCount}✗` : ''}`.trim();

  return (
    <div
      data-card-back-dbg-panel=""
      style={{
        ...(inTray
          ? { position: 'relative' as const }
          : { position: 'fixed' as const, left: 4, bottom: 4, zIndex: 2147483645 }),
        width: expanded ? 'min(96vw, 720px)' : 'auto',
        maxWidth: expanded ? undefined : 360,
        background: 'rgba(0,0,0,0.88)',
        color: '#fff',
        border: `1px solid ${legacyCount > 0 ? '#a33' : '#444'}`,
        borderRadius: 4,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 10,
        lineHeight: 1.3,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '3px 6px',
          borderBottom: expanded ? '1px solid #333' : 'none',
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            font: 'inherit',
            color: '#fff',
            padding: 0,
            fontWeight: 700,
          }}
        >
          {expanded ? '▼' : '▶'} CB DBG{' '}
          <span style={{ color: headerColor }}>{summary}</span>
          {!expanded && (
            <span style={{ fontWeight: 400, opacity: 0.8 }}>
              {' '}· pref={prefId} {prefs.color}/{prefs.darkColor}
            </span>
          )}
        </button>

        {expanded && (
          <button
            type="button"
            onClick={() => {
              const lines: string[] = [];
              lines.push(`CB DBG INVENTORY — ${new Date().toLocaleTimeString()}`);
              lines.push(`preference: ${prefId}  ${prefs.color} / ${prefs.darkColor}`);
              lines.push(`canonical: ${canonicalCount}  legacy: ${legacyCount}`);
              lines.push('');
              lines.push('uid | kind | variant | colors | size | radius (px / %w) | border (px / color) | shadow | accent | bg | owner | cardAnchor');
              for (const r of rows) {
                lines.push(
                  `${r.uid} | ${r.kind} | ${r.variant ?? '-'} | ${r.color}/${r.darkColor} | ${r.width}x${r.height} | ${r.radiusPx}px ${r.radiusPctW}%w | ${r.borderWidthPx}px ${r.borderColor} | ${r.boxShadow} | ${r.accent} | ${r.backgroundImage} | ${r.owner} | ${r.cardAnchor ?? '-'}`,
                );
              }
              const text = lines.join('\n');
              if (navigator?.clipboard?.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            }}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 4,
              padding: '2px 6px',
              color: '#fff',
              font: 'inherit',
              fontSize: 10,
              cursor: 'pointer',
            }}
          >
            {copied ? 'COPIED' : 'COPY'}
          </button>
        )}
      </div>

      {expanded && (
        <div style={{ padding: '4px 6px', maxHeight: '60vh', overflowY: 'auto' }}>
          {/* Preference vs DOM proof */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontWeight: 700, color: '#FFD580' }}>USER PREFERENCE</div>
            <div>id=<b>{prefId}</b></div>
            <div>colors=<span style={{ color: prefs.color }}>{prefs.color}</span> / <span style={{ color: prefs.darkColor }}>{prefs.darkColor}</span></div>
            <div style={{ opacity: 0.7 }}>
              every CanonicalCardBack should be painting EXACTLY these colors.
              mismatches below = stale React state or non-canonical renderer.
            </div>
          </div>

          {/* Drift summary */}
          {(() => {
            const driftRows = rows.filter(
              (r) =>
                r.kind === 'canonical' &&
                (r.color.toLowerCase() !== prefs.color.toLowerCase() ||
                  r.darkColor.toLowerCase() !== prefs.darkColor.toLowerCase()),
            );
            if (driftRows.length === 0) return null;
            return (
              <div style={{ marginBottom: 6, color: '#ff7777' }}>
                ⚠ {driftRows.length} canonical back(s) painting a color different from preference.
                Likely cause: VisualPreferencesProvider state not refreshed after save.
              </div>
            );
          })()}

          {/* Legacy offenders */}
          {legacyCount > 0 && (
            <div style={{ marginBottom: 6, color: '#ff7777' }}>
              ⚠ {legacyCount} LEGACY hidden-card surface(s) detected — must be migrated to
              CanonicalCardBack to honor the ONE TABLE · ONE DEAL · ONE CARD BACK invariant.
            </div>
          )}

          {/* Inventory table */}
          <div style={{ fontWeight: 700, color: '#FFD580', marginTop: 4 }}>
            DOM INVENTORY ({rows.length})
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '14px 70px 80px 60px 1fr',
              columnGap: 4,
              rowGap: 2,
              marginTop: 2,
            }}
          >
            <b></b>
            <b>kind</b>
            <b>colors</b>
            <b>size</b>
            <b>owner / anchor</b>
            {rows.length === 0 && (
              <div style={{ gridColumn: '1 / -1', opacity: 0.7 }}>
                no hidden-card surfaces visible right now.
              </div>
            )}
            {rows.map((r) => {
              const drift =
                r.kind === 'canonical' &&
                (r.color.toLowerCase() !== prefs.color.toLowerCase() ||
                  r.darkColor.toLowerCase() !== prefs.darkColor.toLowerCase());
              const color =
                r.kind === 'legacy' ? '#ff7777' : drift ? '#FFA500' : '#7CFC00';
              return (
                <div key={r.uid} style={{ display: 'contents', color }}>
                  <div>{r.kind === 'legacy' ? '✗' : drift ? '!' : '✓'}</div>
                  <div>
                    {r.kind === 'canonical' ? `Canon[${r.variant ?? '?'}]` : 'LEGACY'}
                  </div>
                  <div title={`${r.color} / ${r.darkColor}`} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.color}/{r.darkColor}
                  </div>
                  <div>{r.width}×{r.height}</div>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.cardAnchor ? `[${r.cardAnchor}] ` : ''}
                    {r.owner}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
