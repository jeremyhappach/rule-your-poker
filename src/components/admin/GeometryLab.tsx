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

import { useEffect, useMemo, useState } from "react";
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
import { useGeometryOverrides, type SizeMode } from "@/lib/geometryLab/store";
import { OVERLAY_FLAGS, useOverlayFlag } from "@/lib/geometryLab/overlayFlags";
import {
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
import { LayoutTuningAdminSection } from "./LayoutTuningAdminSection";
import { DealTimingAdminSection } from "./DealTimingAdminSection";

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

export function GeometryLab({ userId }: { userId: string }) {
  const overrides = useGeometryOverrides();

  const [game, setGame] = useState<GameKey>(GAME_KEYS[0]);

  // Enumerate anchored descriptors for the selected game directly from the
  // descriptor factories — no parallel defaults table.
  const artifacts: ArtifactDescriptor[] = useMemo(
    () => enumerateAnchoredArtifacts(game),
    [game],
  );

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

  const [form, setForm] = useState<FormState>({
    anchorX: "",
    anchorY: "",
    anchorOrigin: "center",
    sizeMode: "widthDriven",
    widthPct: "",
    heightPct: "",
    aspectRatio: "",
  });
  const [saving, setSaving] = useState(false);

  // Hydrate form from override (if any) layered over the canonical descriptor.
  useEffect(() => {
    if (!descriptor) return;
    try {
      const o = override;
      const descSizeMode = deriveSizeMode(descriptor);
      const sizeMode: SizeMode = o?.size_mode ?? descSizeMode;

      setForm({
        anchorX: String(o?.anchor_x ?? descriptor.anchorX ?? 0.5),
        anchorY: String(o?.anchor_y ?? descriptor.anchorY ?? 0.5),
        anchorOrigin: (o?.anchor_origin ??
          descriptor.anchorOrigin ??
          "center") as AnchorOrigin,
        sizeMode,
        widthPct:
          o?.width_pct != null
            ? String(o.width_pct)
            : stringifyOptional(descriptor.widthPct),
        heightPct:
          o?.height_pct != null
            ? String(o.height_pct)
            : stringifyOptional(descriptor.heightPct),
        aspectRatio:
          o?.aspect_ratio != null
            ? String(o.aspect_ratio)
            : stringifyOptional(descriptor.aspectRatio),
      });
    } catch (err) {
      logGeometryLab("hydrate_failed", {
        artifactId,
        error: (err as Error)?.message ?? String(err),
      });
      throw err;
    }
  }, [artifactId, override, descriptor]);

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

  async function handleSave() {
    setSaving(true);
    const payload: Record<string, unknown> = {
      artifact_id: artifactId,
      game,
      anchor_x: num(form.anchorX),
      anchor_y: num(form.anchorY),
      anchor_origin: form.anchorOrigin,
      size_mode: form.sizeMode,
      width_pct:
        form.sizeMode === "heightDriven" ? null : num(form.widthPct),
      height_pct:
        form.sizeMode === "widthDriven" ? null : num(form.heightPct),
      aspect_ratio: form.sizeMode === "rect" ? null : num(form.aspectRatio),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    logGeometryLab("save_attempt", { artifactId, payload });
    const { error } = await supabase
      .from("geometry_overrides" as any)
      .upsert(payload as any, { onConflict: "artifact_id" });
    setSaving(false);
    if (error) {
      logGeometryLab("save_failed", {
        artifactId,
        code: (error as { code?: string }).code,
        message: error.message,
      });
      toast.error(`Save failed: ${error.message}`);
    } else {
      logGeometryLab("save_succeeded", { artifactId });
      toast.success("Geometry saved — all clients updating.");
    }
  }

  async function handleResetToDefault() {
    if (!override) {
      toast.info("Already using canonical descriptor.");
      return;
    }
    setSaving(true);
    logGeometryLab("reset_attempt", { artifactId });
    const { error } = await supabase
      .from("geometry_overrides" as any)
      .delete()
      .eq("artifact_id", artifactId);
    setSaving(false);
    if (error) {
      logGeometryLab("reset_failed", { artifactId, message: error.message });
      toast.error(`Reset failed: ${error.message}`);
    } else {
      logGeometryLab("reset_succeeded", { artifactId });
      toast.success("Override cleared — descriptor defaults restored.");
    }
  }

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
    toast.success(`Converted to ${target}. aspectRatio = ${ar.toFixed(4)}. Press Save to persist.`);
  }

  return (
    <div className="space-y-6 pt-2">
      {/* Game + Artifact pickers */}
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Game</Label>
          <Select
            value={game}
            onValueChange={(v) => setGame(v as GameKey)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GAME_KEYS.map((g) => (
                <SelectItem key={g} value={g}>
                  {GAME_LABELS[g]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
        </div>
      </div>

      {/* Geometry — defaults shown are the live ArtifactDescriptor values */}
      <div className="space-y-3 pt-2 border-t">
        <h3 className="font-semibold">Geometry</h3>
        <p className="text-xs text-muted-foreground">
          Defaults read live from the canonical descriptor. Saving writes an
          override row; the runtime merges it via{" "}
          <code>applyGeometryOverrides</code>.
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

      {/* Visualization toggles */}
      <div className="space-y-2 pt-2 border-t">
        <h3 className="font-semibold">Visualization</h3>
        {OVERLAY_FLAGS.map((flag) => (
          <OverlayFlagRow key={flag.key} flag={flag} />
        ))}
      </div>

      {/* Safe Areas — global canonical-shell layout (moved from Admin). */}
      <LayoutTuningAdminSection />

      {/* Deal Timing — per-device motion knobs for ONE DEAL. */}
      <DealTimingAdminSection />

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="outline"
          onClick={handleResetToDefault}
          disabled={saving || !override}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}

function OverlayFlagRow({ flag }: { flag: typeof OVERLAY_FLAGS[number] }) {
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
