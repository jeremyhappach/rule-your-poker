/**
 * Wave 6 — Geometry Lab (single-source refactor).
 *
 * Admin-only third tab in the Settings modal. The Lab no longer maintains
 * a parallel registry of geometry defaults. Instead it enumerates anchored
 * artifacts straight from the per-game descriptor factories
 * (`ARTIFACT_DESCRIPTOR_FACTORIES` / `enumerateAnchoredArtifacts`) and
 * derives the form's default values from each descriptor.
 *
 * Flow:
 *   ArtifactDescriptor (truth)
 *     ├── applyGeometryOverrides ─► Resolver ─► Renderer
 *     └── deriveSizeMode + read anchorX/Y/Origin, widthPct/heightPct/aspectRatio
 *           ↓
 *         GeometryLab form  ─►  upsert into geometry_overrides
 *           ↓
 *         realtime override store loop closes
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  useGeometryOverrides,
  setOverrideOptimistic,
  setDraftedOverride,
  clearAllDraftedOverrides,
  type GeometryOverride,
  type SizeMode,
} from "@/lib/geometryLab/store";

import { OVERLAY_FLAGS, useOverlayFlag } from "@/lib/geometryLab/overlayFlags";
import {
  ARTIFACT_DESCRIPTOR_FACTORIES,
  GAME_KEYS,
  GAME_LABELS,
  enumerateAnchoredArtifacts,
  deriveSizeMode,
  type GameKey,
} from "@/lib/geometryLab/descriptorIndex";
import { getArtifactPresentation } from "@/lib/geometryLab/artifactRegistry";
import type {
  AnchorOrigin,
  ArtifactDescriptor,
} from "@/lib/wave4LayoutResolver/types";
import {
  logGeometryLab,
  recordGeometryLabContext,
} from "./GeometryLabCrashBoundary";
import { useGeometryLabDraft } from "@/lib/geometryLab/GeometryLabDraftProvider";
import { LayoutTuningAdminSection } from "./LayoutTuningAdminSection";
import { DealTimingAdminSection } from "./DealTimingAdminSection";
import { TableDemoAdminSection } from "./TableDemoAdminSection";
// NoTimersAdminSection lives in Admin Settings; not mounted here.
import { ThreeFiveSevenShowdownRulesPanel } from "./ThreeFiveSevenShowdownRulesPanel";
import { HolmShowdownRulesPanel } from "./HolmShowdownRulesPanel";
import { CardFrontDesignPanel } from "./CardFrontDesignPanel";
import { ShellNameplateAdminSection } from "./ShellNameplateAdminSection";
import { ShellChipBalanceAdminSection } from "./ShellChipBalanceAdminSection";
import { HolmBuckIndicatorPanel } from "./HolmBuckIndicatorPanel";
import { BufferedRatioInput } from "./BufferedRatioInput";
import {
  INDEPENDENT_OVERLAP_DOMAINS,
  type CardOverlapDomain,
} from "@/lib/geometryLab/cardArtifactOverlap";
import { useDomainDraft } from "@/lib/geometryLab/GeometryLabDraftProvider";
import {
  DEFAULT_SHOWDOWN_RULES,
  SHOWDOWN_RULES_DOMAIN_KEY,
  type RoundGeometry,
  type RoundGeometryR3,
  type ShowdownRulesState,
} from "@/lib/threeFiveSeven/showdownConfig";
import {
  CRIBBAGE_PEGGING_ROW_SETTINGS_DEFAULTS,
  CRIBBAGE_PEGGING_ROW_SETTINGS_KEY,
  type CribbagePeggingRowSettings,
} from "@/lib/cribbage/peggingRowSettings";

// Non-anchored artifacts that the Lab picker still needs to surface so
// their per-artifact overlap controls have a host section. The geometry
// editor (anchor/size) auto-hides for these. (cribbage.countingRow is
// now anchored — Wave 6 — so it no longer needs to live here.)
const LAB_EXTRA_ARTIFACT_IDS: Partial<Record<GameKey, string[]>> = {};



const ANCHOR_ORIGINS: AnchorOrigin[] = [
  "center",
  "topLeft",
  "topCenter",
  "bottomCenter",
  "leftCenter",
  "rightCenter",
];

interface FormState {
  anchorX: string;
  anchorY: string;
  anchorOrigin: AnchorOrigin;
  sizeMode: SizeMode;
  widthPct: string;
  heightPct: string;
  aspectRatio: string;
}

function num(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function stringifyOptional(v: number | undefined): string {
  return v == null ? "" : String(v);
}

type LabSelection = "__shell__" | GameKey;

const EMPTY_FORM: FormState = {
  anchorX: "",
  anchorY: "",
  anchorOrigin: "center",
  sizeMode: "widthDriven",
  widthPct: "",
  heightPct: "",
  aspectRatio: "",
};

function artifactDraftKey(artifactId: string): string {
  return `geometry_overrides:${artifactId}`;
}

function buildSeedForm(
  d: ArtifactDescriptor,
  o: GeometryOverride | undefined,
): FormState {
  const descSizeMode = deriveSizeMode(d);
  const sizeMode: SizeMode = o?.size_mode ?? descSizeMode;
  return {
    anchorX: String(o?.anchor_x ?? d.anchorX ?? 0.5),
    anchorY: String(o?.anchor_y ?? d.anchorY ?? 0.5),
    anchorOrigin: (o?.anchor_origin ?? d.anchorOrigin ?? "center") as AnchorOrigin,
    sizeMode,
    widthPct:
      o?.width_pct != null
        ? String(o.width_pct)
        : stringifyOptional(d.widthPct),
    heightPct:
      o?.height_pct != null
        ? String(o.height_pct)
        : stringifyOptional(d.heightPct),
    aspectRatio:
      o?.aspect_ratio != null
        ? String(o.aspect_ratio)
        : stringifyOptional(d.aspectRatio),
  };
}

/**
 * Derive the canonical `GeometryOverride` payload a FormState would commit.
 * Shared by the commit adapter (Apply) and the live-preview mirror effect
 * so both paths resolve to byte-identical overrides — guaranteeing zero
 * visual jump between draft preview and post-Apply committed state.
 */
function buildOverrideFromForm(
  artifactId: string,
  game: string,
  f: FormState,
): GeometryOverride {
  const anchorX = num(f.anchorX);
  const anchorY = num(f.anchorY);
  const widthPct =
    f.sizeMode === "heightDriven" ? null : num(f.widthPct);
  const heightPct =
    f.sizeMode === "widthDriven" ? null : num(f.heightPct);
  const aspectRatio =
    f.sizeMode === "rect" ? null : num(f.aspectRatio);
  return {
    artifact_id: artifactId,
    game,
    anchor_x: anchorX,
    anchor_y: anchorY,
    anchor_origin: f.anchorOrigin,
    size_mode: f.sizeMode,
    width_pct: widthPct,
    height_pct: heightPct,
    aspect_ratio: aspectRatio,
  };
}

const GEOMETRY_OVERRIDE_DRAFT_PREFIX = "geometry_overrides:";



export function GeometryLab({ userId }: { userId: string }) {
  const overrides = useGeometryOverrides();

  const [selection, setSelection] = useState<LabSelection>("__shell__");
  const isShell = selection === "__shell__";
  const game: GameKey = (isShell ? GAME_KEYS[0] : selection) as GameKey;

  // Enumerate anchored descriptors for the selected game directly from the
  // descriptor factories — no parallel defaults table.
  const artifacts: ArtifactDescriptor[] = useMemo(() => {
    const anchored = enumerateAnchoredArtifacts(game);
    const extras = LAB_EXTRA_ARTIFACT_IDS[game] ?? [];
    if (!extras.length) return anchored;
    const anchoredIds = new Set(anchored.map((a) => a.id));
    const extraDs = ARTIFACT_DESCRIPTOR_FACTORIES[game]
      .enumerate()
      .filter((d) => extras.includes(d.id) && !anchoredIds.has(d.id));
    return [...anchored, ...extraDs];
  }, [game]);

  // Sort by registry sortOrder (when present), then label, then id.
  const sortedArtifacts = useMemo(() => {
    return [...artifacts].sort((a, b) => {
      const pa = getArtifactPresentation(a.id);
      const pb = getArtifactPresentation(b.id);
      const oa = pa.sortOrder ?? 1000;
      const ob = pb.sortOrder ?? 1000;
      if (oa !== ob) return oa - ob;
      return pa.label.localeCompare(pb.label);
    });
  }, [artifacts]);

  const [artifactId, setArtifactIdRaw] = useState<string>(
    sortedArtifacts[0]?.id ?? "",
  );
  const setArtifactId = (id: string) => {
    logGeometryLab("artifact_changed", { from: artifactId, to: id, game });
    setArtifactIdRaw(id);
  };

  useEffect(() => {
    logGeometryLab("game_changed", { game });
  }, [game]);

  useEffect(() => {
    if (!sortedArtifacts.some((a) => a.id === artifactId)) {
      const next = sortedArtifacts[0]?.id ?? "";
      logGeometryLab("artifact_auto_reset", {
        previous: artifactId,
        next,
        reason: "not in sorted list for current game",
      });
      setArtifactIdRaw(next);
    }
  }, [sortedArtifacts, artifactId]);

  const descriptor = useMemo<ArtifactDescriptor | null>(
    () => sortedArtifacts.find((a) => a.id === artifactId) ?? null,
    [sortedArtifacts, artifactId],
  );

  const override = overrides.get(artifactId);

  // -------------------------------------------------------------------------
  // Draft pipeline — Gameplay Artifacts is wired to the modal-wide draft
  // contract via per-artifact seed + commit adapters on
  // GeometryLabDraftProvider. Every edit flows: input → setDraft →
  // dirtyKeys → footer Apply enabled → commit adapter upsert into
  // geometry_overrides → realtime echo refreshes the override store.
  // No section-level Save/Reset persistence remains.
  // -------------------------------------------------------------------------
  const {
    getDraft,
    setDraft,
    resetDomain,
    isDomainDirty,
    dirtyKeys,
    registerSeed,
    unregisterSeed,
    registerCommitAdapter,
    unregisterCommitAdapter,
  } = useGeometryLabDraft();


  // Refs let the seed/commit adapters always read the latest descriptor
  // and override snapshot without re-registering on every render.
  const descriptorByIdRef = useRef<Map<string, { desc: ArtifactDescriptor; game: GameKey }>>(new Map());
  for (const a of sortedArtifacts) {
    descriptorByIdRef.current.set(a.id, { desc: a, game });
  }
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // Register seed + commit adapter for any artifact the user has selected
  // at least once. Registrations accumulate across artifact switches so a
  // dirty draft for a previously-selected artifact still has its commit
  // adapter wired when the admin clicks Apply Changes.
  const registeredRef = useRef<Set<string>>(new Set());
  const ensureRegistered = (id: string) => {
    const k = artifactDraftKey(id);
    if (registeredRef.current.has(k)) return;
    registeredRef.current.add(k);
    registerSeed(k, () => {
      const info = descriptorByIdRef.current.get(id);
      const d = info?.desc;
      if (!d) return EMPTY_FORM;
      return buildSeedForm(d, overridesRef.current.get(id));
    });
    registerCommitAdapter(k, async (value) => {
      const info = descriptorByIdRef.current.get(id);
      const g = info?.game ?? game;
      const f = value as FormState;
      const override = buildOverrideFromForm(id, g, f);
      const payload: Record<string, unknown> = {
        ...override,
        updated_by: userIdRef.current,
        updated_at: new Date().toISOString(),
      };
      logGeometryLab("draft_commit_attempt", { artifactId: id, payload });
      const { error } = await supabase
        .from("geometry_overrides" as any)
        .upsert(payload as any, { onConflict: "artifact_id" });
      if (error) {
        logGeometryLab("draft_commit_failed", {
          artifactId: id,
          code: (error as { code?: string }).code,
          message: error.message,
        });
        return { ok: false, error: error.message };
      }
      // Optimistically merge the committed row into the local override
      // snapshot so the panel re-seeds with the just-applied value
      // without waiting for the realtime echo. The async refresh that
      // follows is idempotent.
      setOverrideOptimistic(id, override);
      logGeometryLab("draft_commit_succeeded", { artifactId: id });
      return { ok: true };
    });
  };

  // Register synchronously during render so getDraft below never falls
  // through to defaultsRegistry (these keys are external-table backed,
  // not system_settings backed, and would otherwise throw).
  if (descriptor) ensureRegistered(artifactId);

  // Unregister all on unmount so a closed modal does not leak adapters.
  // Also clear any live drafted-overrides previews so the renderer
  // collapses back to the committed snapshot on close/cancel/X.
  useEffect(() => {
    const set = registeredRef.current;
    return () => {
      set.forEach((k) => {
        unregisterSeed(k);
        unregisterCommitAdapter(k);
      });
      set.clear();
      clearAllDraftedOverrides();
    };
  }, [unregisterSeed, unregisterCommitAdapter]);

  // Mirror dirty geometry_overrides:* drafts into the module-level
  // drafted-overrides store so every gameplay-geometry provider that
  // consumes `useDraftedGeometryOverrides()` re-resolves to the in-edit
  // rect immediately — restoring the live-preview contract that the
  // modal-wide draft refactor severed. Drafts win per artifact id. When
  // a key stops being dirty (Cancel / Apply / Reset / value equals
  // committed) we clear its drafted entry so the renderer collapses to
  // the committed snapshot with zero visual jump.
  const draftedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const nextIds = new Set<string>();
    for (const key of dirtyKeys) {
      if (!key.startsWith(GEOMETRY_OVERRIDE_DRAFT_PREFIX)) continue;
      const id = key.slice(GEOMETRY_OVERRIDE_DRAFT_PREFIX.length);
      const info = descriptorByIdRef.current.get(id);
      if (!info) continue;
      const f = getDraft<FormState>(key);
      setDraftedOverride(id, buildOverrideFromForm(id, info.game, f));
      nextIds.add(id);
    }
    for (const prevId of draftedIdsRef.current) {
      if (!nextIds.has(prevId)) setDraftedOverride(prevId, null);
    }
    draftedIdsRef.current = nextIds;
  }, [dirtyKeys, getDraft]);



  // When the realtime override store changes for the selected artifact
  // and the user has no dirty edits, drop the cached draft so the next
  // read re-seeds from the fresh override. Mirrors the previous hydrate
  // effect's behaviour without overwriting in-flight edits.
  const draftKey = descriptor ? artifactDraftKey(artifactId) : "";
  useEffect(() => {
    if (!descriptor) return;
    if (isDomainDirty(draftKey)) return;
    resetDomain(draftKey);
  }, [override, descriptor, draftKey, isDomainDirty, resetDomain]);

  const form: FormState = descriptor
    ? getDraft<FormState>(draftKey)
    : EMPTY_FORM;
  const setForm = (updater: FormState | ((prev: FormState) => FormState)) => {
    if (!descriptor) return;
    setDraft<FormState>(draftKey, updater);
  };

  // Record snapshot for the crash boundary on every render.
  recordGeometryLabContext({
    game,
    artifactId,
    routeBeforeCrash:
      typeof window !== "undefined" ? window.location.pathname : "(ssr)",
    unsavedForm: { ...form },
  });


  if (!descriptor) {
    return (
      <div className="text-muted-foreground text-sm">
        No artifact selected.
      </div>
    );
  }

  const presentation = getArtifactPresentation(artifactId);

  // Derived (read-only) helper based on current form sizeMode.
  const wNum = num(form.widthPct);
  const hNum = num(form.heightPct);
  const arNum = num(form.aspectRatio);
  const derivedH =
    form.sizeMode === "widthDriven" && wNum != null && arNum != null && arNum > 0
      ? (wNum / arNum).toFixed(4)
      : "";
  const derivedW =
    form.sizeMode === "heightDriven" && hNum != null && arNum != null
      ? (hNum * arNum).toFixed(4)
      : "";

  function handleConvertTo(target: "widthDriven" | "heightDriven") {
    const w = num(form.widthPct);
    const h = num(form.heightPct);
    if (w == null || h == null || h <= 0 || w <= 0) {
      toast.error("Need both widthPct and heightPct > 0 to compute aspectRatio.");
      logGeometryLab("convert_blocked", { artifactId, target, w, h });
      return;
    }
    const ar = w / h;
    logGeometryLab("convert_applied", { artifactId, target, derivedAspectRatio: ar });
    setForm((f) => ({ ...f, sizeMode: target, aspectRatio: ar.toFixed(4) }));
    toast.success(`Converted to ${target}. aspectRatio = ${ar.toFixed(4)}. Apply Changes to persist.`);
  }


  return (
    <div className="space-y-6 pt-2">
      {/* Top-level selection: Shell / Global vs per-game */}
      <div className="space-y-1">
        <Label>Section</Label>
        <Select
          value={selection}
          onValueChange={(v) => setSelection(v as LabSelection)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__shell__">Shell / Global</SelectItem>
            {GAME_KEYS.map((g) => (
              <SelectItem key={g} value={g}>
                {GAME_LABELS[g]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isShell ? (
        <ShellGlobalSections />
      ) : (
        <GameSections
          game={game}
          artifactId={artifactId}
          setArtifactId={setArtifactId}
          sortedArtifacts={sortedArtifacts}
          overrides={overrides}
          presentation={presentation}
          override={override}
          descriptor={descriptor}
          form={form}
          setForm={setForm}
          derivedH={derivedH}
          derivedW={derivedW}
          dirty={isDomainDirty(draftKey)}

          handleConvertTo={handleConvertTo}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell / Global sections — render once, independent of any selected game.
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="border rounded-md group/section">
      <summary className="cursor-pointer select-none px-3 py-2 font-semibold text-sm flex items-center justify-between">
        <span>{title}</span>
        <span className="text-base leading-none text-muted-foreground group-[[open]]/section:hidden">+</span>
        <span className="text-base leading-none text-muted-foreground hidden group-[[open]]/section:inline">−</span>
      </summary>
      <div className="px-3 pb-3 pt-1 space-y-3">{children}</div>
    </details>
  );
}


function ShellGlobalSections() {
  return (
    <div className="space-y-3">
      <CollapsibleSection title="Layout Tuning">
        <LayoutTuningAdminSection />
      </CollapsibleSection>
      <CollapsibleSection title="Deal Timing">
        <DealTimingAdminSection />
      </CollapsibleSection>
      <CollapsibleSection title="Table Demo">
        <TableDemoAdminSection />
      </CollapsibleSection>
      {/* No Timers moved to Admin Settings (near Under Maintenance). */}
      <CollapsibleSection title="Card Front Design">
        <CardFrontDesignPanel />
      </CollapsibleSection>
      <CollapsibleSection title="Seat Cluster">
        <div className="space-y-3">
          <div className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Nameplate
            </h4>
            <ShellNameplateAdminSection />
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Chip Balance
            </h4>
            <ShellChipBalanceAdminSection />
          </div>
        </div>
      </CollapsibleSection>
      <CollapsibleSection title="HUD Stack">
        <p className="text-xs text-muted-foreground">
          Placeholder. Future Geometry Lab work: shell-owned HUD stack
          composition, ordering, and spacing.
        </p>
      </CollapsibleSection>
      <CollapsibleSection title="Gameplay Area">
        <p className="text-xs text-muted-foreground">
          Placeholder. Future Geometry Lab work: shared playfield bounds,
          safe-area insets, and shell-owned gameplay region geometry.
        </p>
      </CollapsibleSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-game sections — Gameplay Artifacts / Chip Ring Artifacts / Showdown Rules
// ---------------------------------------------------------------------------

interface GameSectionsProps {
  game: GameKey;
  artifactId: string;
  setArtifactId: (id: string) => void;
  sortedArtifacts: ArtifactDescriptor[];
  overrides: ReturnType<typeof useGeometryOverrides>;
  presentation: ReturnType<typeof getArtifactPresentation>;
  override: ReturnType<ReturnType<typeof useGeometryOverrides>["get"]>;
  descriptor: ArtifactDescriptor;
  form: FormState;
  setForm: (updater: FormState | ((prev: FormState) => FormState)) => void;
  derivedH: string;
  derivedW: string;
  dirty: boolean;
  handleConvertTo: (target: "widthDriven" | "heightDriven") => void;
}

function GameSections(props: GameSectionsProps) {
  const {
    artifactId,
    setArtifactId,
    sortedArtifacts,
    overrides,
    presentation,
    override,
    descriptor,
    form,
    setForm,
    derivedH,
    derivedW,
    dirty,
    handleConvertTo,
  } = props;


  return (
    <div className="space-y-3">
      <CollapsibleSection title="Gameplay Artifacts">
        <div className="space-y-1">
          <Label>Artifact</Label>
          <Select value={artifactId} onValueChange={setArtifactId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortedArtifacts.map((a) => {
                const p = getArtifactPresentation(a.id);
                const hasOverride = overrides.has(a.id);
                return (
                  <SelectItem key={a.id} value={a.id}>
                    {p.label}
                    {hasOverride ? " ●" : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            <code>{artifactId}</code>
            {presentation.category ? ` · ${presentation.category}` : ""}
          </p>
          {override && (
            <p className="text-xs text-amber-500">● override active</p>
          )}
          {dirty && (
            <p className="text-xs text-sky-500">
              ● unsaved draft — click footer Apply Changes to persist
            </p>
          )}
        </div>

        {/* Geometry — defaults shown are the live ArtifactDescriptor values.
            Hidden for non-anchored artifacts (no anchor/size fields apply). */}
        {descriptor.composeMode === "anchored" && (
        <div className="space-y-3 pt-2 border-t">
          <h3 className="font-semibold">Geometry</h3>
          <p className="text-xs text-muted-foreground">
            Defaults read live from the canonical descriptor. Edits stage
            into the modal-wide draft and persist only when the footer
            Apply Changes button is pressed; the runtime then merges the
            committed override row via <code>applyGeometryOverrides</code>.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>anchorX</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={form.anchorX}
                onChange={(e) =>
                  setForm((f) => ({ ...f, anchorX: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>anchorY</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={form.anchorY}
                onChange={(e) =>
                  setForm((f) => ({ ...f, anchorY: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>anchorOrigin</Label>
            <Select
              value={form.anchorOrigin}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, anchorOrigin: v as AnchorOrigin }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANCHOR_ORIGINS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>sizeMode</Label>
            <Select
              value={form.sizeMode}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, sizeMode: v as SizeMode }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="widthDriven">widthDriven</SelectItem>
                <SelectItem value="heightDriven">heightDriven</SelectItem>
                <SelectItem value="rect">rect</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Descriptor sizeMode: <code>{deriveSizeMode(descriptor)}</code>.
              Three cannot be edited together: rect = width+height; widthDriven
              = width+aspect; heightDriven = height+aspect.
            </p>
          </div>

          {form.sizeMode === "widthDriven" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>widthPct</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  value={form.widthPct}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, widthPct: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>aspectRatio</Label>
                <Input
                  type="number"
                  step="0.05"
                  value={form.aspectRatio}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, aspectRatio: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>heightPct (derived)</Label>
                <Input value={derivedH} readOnly disabled />
              </div>
            </div>
          )}

          {form.sizeMode === "heightDriven" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>heightPct</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  value={form.heightPct}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, heightPct: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>aspectRatio</Label>
                <Input
                  type="number"
                  step="0.05"
                  value={form.aspectRatio}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, aspectRatio: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>widthPct (derived)</Label>
                <Input value={derivedW} readOnly disabled />
              </div>
            </div>
          )}

          {form.sizeMode === "rect" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>widthPct</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  value={form.widthPct}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, widthPct: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>heightPct</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  value={form.heightPct}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, heightPct: e.target.value }))
                  }
                />
              </div>
              <div className="col-span-2 space-y-2 pt-2 border-t border-dashed">
                <p className="text-xs text-muted-foreground">
                  Rect mode keeps width and height independent. To resize while
                  preserving proportions, convert this artifact to a driven mode —
                  the current widthPct/heightPct ratio becomes its aspectRatio.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleConvertTo("widthDriven")}
                  >
                    Convert To Width Driven
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleConvertTo("heightDriven")}
                  >
                    Convert To Height Driven
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Per-artifact felt-overlap controls — visible only for the
            artifacts that own a persisted fan-overlap value. */}
        <ArtifactOverlapControls artifactId={artifactId} />


        {/* Visualization toggles */}
        <div className="space-y-2 pt-2 border-t">
          <h3 className="font-semibold">Visualization</h3>
          {OVERLAY_FLAGS.map((flag) => (
            <OverlayFlagRow key={flag.key} flag={flag} />
          ))}
        </div>

      </CollapsibleSection>


      <CollapsibleSection title="Chip Ring Artifacts">
        {props.game === "holm" ? (
          <HolmBuckIndicatorPanel />
        ) : (
          <p className="text-xs text-muted-foreground">
            Future Geometry Lab work: dealer/buck/leg/chip-ring artifacts.
          </p>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Showdown Rules">
        {props.game === "threeFiveSeven" ? (
          <ThreeFiveSevenShowdownRulesPanel />
        ) : props.game === "holm" ? (
          <HolmShowdownRulesPanel />
        ) : (
          <p className="text-xs text-muted-foreground">
            Future Geometry Lab work: showdown card ownership, placement,
            visibility, and projection rules.
          </p>
        )}
      </CollapsibleSection>
    </div>
  );
}

function OverlayFlagRow({ flag }: { flag: typeof OVERLAY_FLAGS[number] }) {
  // Route through the modal-wide draft so visualization toggles light
  // up the Apply Changes button like every other Lab control.
  const [on, setOn] = useOverlayFlag(flag);
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={`flag-${flag.key}`}
        checked={on}
        onCheckedChange={(v) => setOn(v === true)}
      />
      <Label
        htmlFor={`flag-${flag.key}`}
        className="cursor-pointer text-sm font-normal"
      >
        {flag.label}
      </Label>
    </div>
  );
}

function CardOverlapRow({ domain }: { domain: CardOverlapDomain }) {
  const { value, setValue } = useDomainDraft<number>(domain.key, domain.default);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm font-medium">{domain.label}</Label>
        <BufferedRatioInput
          value={value}
          min={domain.min}
          max={domain.max}
          ariaLabel={domain.label}
          onCommit={(n) => setValue(n)}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {domain.help} Range [{domain.min}, {domain.max}].
      </p>
    </div>
  );
}

// Map ArtifactDescriptor.id → persisted cardOverlap domain key(s) that
// belong inside that artifact's geometry section. Artifacts not listed
// here render no overlap controls (the picker's game-scoping then
// gates visibility automatically).
const ARTIFACT_OVERLAP_KEYS: Record<string, string[]> = {
  "holm.communityCardsStage": ["cardOverlap.holm.community"],
  "holm.lonePlayerTabledCardsStage": ["cardOverlap.holm.lonePlayerFan"],
  "cribbage.countingRow": [
    "cardOverlap.cribbage.scoringHand",
    "cardOverlap.cribbage.scoringHandToCutGap",
  ],
  "cribbage.cribCutGroup": [
    "cardOverlap.cribbage.cribFan",
    "cardOverlap.cribbage.cribToCutGap",
  ],
  // Pegging Row: explicit overlap is gated on Adaptive Fan being OFF.
  // The render logic in ArtifactOverlapControls handles the gating.
  "cribbage.peggingRow": ["cardOverlap.cribbage.pegging"],
};


// Artifacts whose overlap is owned by a non-cardOverlap.* persisted
// source. Render a bespoke bridge editor that mutates that source
// through its existing draft hook — no duplicate persisted state.
const ARTIFACT_BRIDGE_OVERLAPS: Record<string, "threeFiveSevenRoundRowOverlap"> = {
  "threeFiveSeven.winnerTabledCardsStage": "threeFiveSevenRoundRowOverlap",
};

function ArtifactOverlapControls({ artifactId }: { artifactId: string }) {
  const keys = ARTIFACT_OVERLAP_KEYS[artifactId];
  const bridge = ARTIFACT_BRIDGE_OVERLAPS[artifactId];
  const domains = (keys ?? [])
    .map((k) => INDEPENDENT_OVERLAP_DOMAINS.find((d) => d.key === k))
    .filter((d): d is CardOverlapDomain => !!d);
  const isPeggingRow = artifactId === "cribbage.peggingRow";
  if (domains.length === 0 && !bridge && !isPeggingRow) return null;
  return (
    <div className="space-y-3 pt-2 border-t">
      <h3 className="font-semibold">Fan Overlap</h3>
      <p className="text-xs text-muted-foreground">
        Normalized to card width. <code>0.00</code> = edges touch ·{" "}
        <code>&gt; 0</code> overlap · <code>&lt; 0</code> gap.
      </p>
      {isPeggingRow ? (
        <PeggingRowAdaptiveFanControls domains={domains} />
      ) : (
        domains.map((d) => <CardOverlapRow key={d.key} domain={d} />)
      )}
      {bridge === "threeFiveSevenRoundRowOverlap" && (
        <ThreeFiveSevenWinnerOverlapBridge />
      )}
    </div>
  );
}

function PeggingRowAdaptiveFanControls({
  domains,
}: {
  domains: CardOverlapDomain[];
}) {
  const { value, setValue } = useDomainDraft<CribbagePeggingRowSettings>(
    CRIBBAGE_PEGGING_ROW_SETTINGS_KEY,
    CRIBBAGE_PEGGING_ROW_SETTINGS_DEFAULTS,
  );
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Checkbox
          id="cribbage-peggingrow-adaptive-fan"
          checked={value.adaptiveFan}
          onCheckedChange={(v) =>
            setValue({ ...value, adaptiveFan: v === true })
          }
        />
        <div className="space-y-1">
          <Label
            htmlFor="cribbage-peggingrow-adaptive-fan"
            className="cursor-pointer text-sm font-medium"
          >
            Adaptive Fan
          </Label>
          <p className="text-[11px] text-muted-foreground">
            When ON, the pegging row uses the adaptive HUDStack resolver
            (current behaviour — overlap varies with viewport to fit the
            row; cards keep their fixed proportional size). When OFF,
            the explicit Fan Overlap below is the persisted setting.
            Runtime consumption of this preference is deferred — see
            <code> peggingRowSettings.ts</code>.
          </p>
        </div>
      </div>
      {!value.adaptiveFan &&
        domains.map((d) => <CardOverlapRow key={d.key} domain={d} />)}
    </div>
  );
}


function ThreeFiveSevenWinnerOverlapBridge() {
  const { value, setValue } = useDomainDraft<ShowdownRulesState>(
    SHOWDOWN_RULES_DOMAIN_KEY,
    DEFAULT_SHOWDOWN_RULES,
  );
  const rounds: Array<{ k: "r1" | "r2" | "r3"; label: string }> = [
    { k: "r1", label: "Round 1 (3-card)" },
    { k: "r2", label: "Round 2 (5-card)" },
    { k: "r3", label: "Round 3 (7-card)" },
  ];
  const patch = (k: "r1" | "r2" | "r3", overlap: number) => {
    if (k === "r3") {
      const r3: RoundGeometryR3 = {
        ...value.rounds.r3,
        row: { ...value.rounds.r3.row, overlap },
      };
      setValue({ ...value, rounds: { ...value.rounds, r3 } });
    } else {
      const next: RoundGeometry = {
        ...value.rounds[k],
        row: { ...value.rounds[k].row, overlap },
      };
      setValue({ ...value, rounds: { ...value.rounds, [k]: next } });
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Edits <code>three_five_seven_showdown_rules.rounds.r{`{1,2,3}`}.row.overlap</code>{" "}
        directly — same persisted source as the Showdown Rules panel.
      </p>
      {rounds.map(({ k, label }) => {
        const v = value.rounds[k].row.overlap;
        return (
          <div key={k} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <Label className="text-sm font-medium">{label}</Label>
              <BufferedRatioInput
                value={v}
                min={-0.5}
                max={0.9}
                ariaLabel={`${label} fan overlap`}
                onCommit={(n) => patch(k, n)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}



