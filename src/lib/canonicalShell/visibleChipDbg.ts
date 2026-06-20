/**
 * VISIBLE CHIP DBG — DOM inventory of every
 * `[data-chip-reaction-target="N"]` candidate at chip-transport
 * arrival (and dispatch), so we can prove WHO owns the visible
 * winner chip during settlement.
 *
 * Failure mode this targets:
 *   reactionTargetFound=true (selector matched something)
 *   destinationReactionApplied=true (animation attached + fired)
 *   BUT no visible bounce
 *
 * Hypothesis: the visible winner chip is rendered by a different
 * render path (legacy HUD / chipstack / cluster-fallback) than the
 * CanonicalChipDisc that owns `data-chip-reaction-target`. The
 * reaction therefore animates a hidden / sibling node.
 *
 * This recorder is read-only and dev-only.
 */

export interface ChipReactionTargetNode {
  index: number;
  position: string | null;           // data-chip-reaction-target value
  tagName: string;
  className: string;
  isConnected: boolean;
  rect: { x: number; y: number; w: number; h: number } | null;
  visibility: string;
  display: string;
  opacity: string;
  transform: string;
  parentChain: string[];             // up to 6 ancestors (tag + key data-* attrs)
  ownerHint: string | null;          // closest ancestor data-* describing render path
}

export interface ChipCenterNode {
  index: number;
  position: string | null;           // data-chip-center value
  tagName: string;
  className: string;
  rect: { x: number; y: number; w: number; h: number } | null;
}

export interface VisibleChipDbgRecord {
  ts: number;
  intentId: string;
  site: 'dispatch' | 'arrival' | 'manual';
  winnerSeat: number | null;
  winnerPlayerId: string | null;

  // Query results.
  reactionTargetSelector: string;
  reactionTargetCount: number;
  reactionTargets: ChipReactionTargetNode[];

  chipCenterCount: number;
  chipCenters: ChipCenterNode[];

  // Convenience flags.
  visibleWinnerChipFound: boolean;
  visibleWinnerChipRect: { x: number; y: number; w: number; h: number } | null;
  visibleWinnerChipOwner: string | null;

  // Render-path inference (best-effort, dev hint only).
  selfRenderPath: boolean | null;
  hudRenderPath: boolean | null;
  canonicalChipDiscRenderPath: boolean | null;

  // Cluster diagnosis (Asymmetric mount failure).
  winnerClusterPresent: boolean;
  winnerClusterMissingReason: string | null;

  note?: string;
}

const MAX = 30;
let records: VisibleChipDbgRecord[] = [];
const listeners = new Set<() => void>();
const emit = () => { listeners.forEach((l) => { try { l(); } catch { /* */ } }); };

export function subscribeVisibleChipDbg(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export function getVisibleChipDbg(): VisibleChipDbgRecord[] { return records; }
export function clearVisibleChipDbg(): void { records = []; emit(); }

function rectOf(el: Element | null): { x: number; y: number; w: number; h: number } | null {
  if (!el) return null;
  try {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  } catch { return null; }
}

function describeDataAttrs(el: Element): string {
  try {
    const out: string[] = [];
    for (const a of Array.from(el.attributes)) {
      if (!a.name.startsWith('data-')) continue;
      // Keep short for readability.
      out.push(`${a.name}=${(a.value || '').slice(0, 24)}`);
      if (out.length >= 5) break;
    }
    return out.join(' ');
  } catch { return ''; }
}

function describeNodeShort(el: Element): string {
  const da = describeDataAttrs(el);
  return `${el.tagName}${da ? `[${da}]` : ''}`;
}

function buildParentChain(el: Element, depth = 6): string[] {
  const chain: string[] = [];
  let cur: Element | null = el.parentElement;
  while (cur && chain.length < depth) {
    chain.push(describeNodeShort(cur));
    cur = cur.parentElement;
  }
  return chain;
}

function findOwnerHint(el: Element): string | null {
  let cur: Element | null = el;
  const hintAttrs = [
    'data-canonical-viewer-hud-chip',
    'data-canonical-seat-cluster',
    'data-canonical-chip-disc',
    'data-canonical-chipstack',
    'data-chip-stack-owner',
    'data-active-player-hud',
    'data-canonical-shell-viewer-chip-endpoint',
    'data-shell-viewer-chip-endpoint',
    'data-seat-position',
    'data-felt-content',
  ];
  while (cur) {
    for (const a of hintAttrs) {
      const v = cur.getAttribute?.(a);
      if (v != null) return `${a}=${v}`;
    }
    cur = cur.parentElement;
  }
  return null;
}

function snapshotReactionTarget(el: Element, index: number): ChipReactionTargetNode {
  let visibility = '?'; let display = '?'; let opacity = '?'; let transform = '?';
  try {
    const cs = window.getComputedStyle(el);
    visibility = cs.visibility; display = cs.display; opacity = cs.opacity; transform = cs.transform;
  } catch { /* */ }
  return {
    index,
    position: el.getAttribute('data-chip-reaction-target'),
    tagName: el.tagName,
    className: typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : '',
    isConnected: el.isConnected,
    rect: rectOf(el),
    visibility, display, opacity, transform,
    parentChain: buildParentChain(el),
    ownerHint: findOwnerHint(el),
  };
}

function snapshotChipCenter(el: Element, index: number): ChipCenterNode {
  return {
    index,
    position: el.getAttribute('data-chip-center'),
    tagName: el.tagName,
    className: typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : '',
    rect: rectOf(el),
  };
}

export interface RecordVisibleChipScanArgs {
  intentId: string;
  site: VisibleChipDbgRecord['site'];
  winnerSeat: number | null;
  winnerPlayerId?: string | null;
  container?: Element | null;
  note?: string;
}

export function recordVisibleChipScan(args: RecordVisibleChipScanArgs): void {
  if (typeof document === 'undefined') return;
  const root: ParentNode = (args.container as ParentNode | null) ?? document;
  const winnerSeat = args.winnerSeat;
  const sel = winnerSeat != null
    ? `[data-chip-reaction-target="${winnerSeat}"]`
    : `[data-chip-reaction-target]`;

  const allTargets = Array.from(root.querySelectorAll('[data-chip-reaction-target]'));
  const matched = winnerSeat != null
    ? allTargets.filter((el) => el.getAttribute('data-chip-reaction-target') === String(winnerSeat))
    : allTargets;
  const reactionTargets = matched.map((el, i) => snapshotReactionTarget(el, i));

  const allCenters = Array.from(root.querySelectorAll('[data-chip-center]'));
  const chipCenters = allCenters.map((el, i) => snapshotChipCenter(el, i));

  // Visible winner chip = first matching reaction-target with w/h > 0
  // and visibility=visible / display!=none / opacity!=0.
  const visible = reactionTargets.find((n) =>
    n.rect && n.rect.w > 0 && n.rect.h > 0
    && n.visibility !== 'hidden' && n.display !== 'none' && Number(n.opacity || '1') > 0,
  ) ?? null;

  // Cluster present check.
  const winnerClusterEl = winnerSeat != null
    ? root.querySelector(`[data-canonical-seat-cluster][data-seat-position="${winnerSeat}"], [data-seat-position="${winnerSeat}"]`)
    : null;
  const winnerClusterPresent = !!winnerClusterEl;
  let winnerClusterMissingReason: string | null = null;
  if (!winnerClusterPresent) {
    if (winnerSeat == null) {
      winnerClusterMissingReason = 'no-winner-seat-known';
    } else {
      const anyCluster = root.querySelector('[data-canonical-seat-cluster]');
      const anyPos = root.querySelector('[data-seat-position]');
      winnerClusterMissingReason = `no [data-seat-position="${winnerSeat}"] in DOM`
        + ` (anyCluster=${!!anyCluster} anySeatPosNode=${!!anyPos})`;
    }
  }

  // Render-path inference from ownerHint of the first visible target.
  let canonicalChipDiscRenderPath: boolean | null = null;
  let hudRenderPath: boolean | null = null;
  let selfRenderPath: boolean | null = null;
  if (visible) {
    const owner = visible.ownerHint ?? '';
    canonicalChipDiscRenderPath = /canonical-chip-disc|canonical-chipstack/i.test(owner);
    hudRenderPath = /active-player-hud|shell-viewer-chip-endpoint/i.test(owner);
    selfRenderPath = !canonicalChipDiscRenderPath && !hudRenderPath;
  }

  const rec: VisibleChipDbgRecord = {
    ts: Date.now(),
    intentId: args.intentId,
    site: args.site,
    winnerSeat,
    winnerPlayerId: args.winnerPlayerId ?? null,
    reactionTargetSelector: sel,
    reactionTargetCount: reactionTargets.length,
    reactionTargets,
    chipCenterCount: chipCenters.length,
    chipCenters,
    visibleWinnerChipFound: !!visible,
    visibleWinnerChipRect: visible?.rect ?? null,
    visibleWinnerChipOwner: visible?.ownerHint ?? null,
    selfRenderPath,
    hudRenderPath,
    canonicalChipDiscRenderPath,
    winnerClusterPresent,
    winnerClusterMissingReason,
    note: args.note,
  };

  const next = records.concat(rec);
  records = next.length > MAX ? next.slice(next.length - MAX) : next;
  emit();
}

export function formatVisibleChipDbgAsText(): string {
  if (records.length === 0) return 'VISIBLE CHIP DBG (empty)\n';
  const lines: string[] = ['VISIBLE CHIP DBG'];
  for (const r of records) {
    lines.push(
      `${new Date(r.ts).toISOString()} ${r.site} intent=${r.intentId} winnerSeat=${r.winnerSeat}`,
      `  selector=${r.reactionTargetSelector} count=${r.reactionTargetCount} chipCenters=${r.chipCenterCount}`,
      `  visibleWinnerChipFound=${r.visibleWinnerChipFound} rect=${r.visibleWinnerChipRect ? `${r.visibleWinnerChipRect.x},${r.visibleWinnerChipRect.y} ${r.visibleWinnerChipRect.w}x${r.visibleWinnerChipRect.h}` : '∅'}`,
      `  owner=${r.visibleWinnerChipOwner ?? '∅'} canonical=${r.canonicalChipDiscRenderPath} hud=${r.hudRenderPath} self=${r.selfRenderPath}`,
      `  cluster=${r.winnerClusterPresent}${r.winnerClusterMissingReason ? ` (${r.winnerClusterMissingReason})` : ''}`,
    );
    r.reactionTargets.forEach((n) => {
      lines.push(
        `    [${n.index}] pos=${n.position} ${n.tagName}.${(n.className || '').slice(0, 50)} conn=${n.isConnected}`,
        `        rect=${n.rect ? `${n.rect.x},${n.rect.y} ${n.rect.w}x${n.rect.h}` : '∅'} vis=${n.visibility} disp=${n.display} op=${n.opacity}`,
        `        transform=${(n.transform || '').slice(0, 60)}`,
        `        owner=${n.ownerHint ?? '∅'}`,
        `        parents=${n.parentChain.join(' < ')}`,
      );
    });
    r.chipCenters.forEach((n) => {
      lines.push(`    center[${n.index}] pos=${n.position} rect=${n.rect ? `${n.rect.x},${n.rect.y} ${n.rect.w}x${n.rect.h}` : '∅'}`);
    });
    if (r.note) lines.push(`  note=${r.note}`);
  }
  return lines.join('\n') + '\n';
}
