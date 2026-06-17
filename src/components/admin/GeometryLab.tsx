/**
 * Wave 6 — Geometry Lab (MVP).
 *
 * Admin-only third tab in the Settings modal. Lets the admin pick any
 * registered anchored gameplay artifact and live-tune its geometry. Save
 * upserts a row into `geometry_overrides`; realtime + the override store
 * push the change to every open client immediately. No refresh, no
 * republish, no restart.
 *
 * v1 scope: global overrides only (no drafts, no per-session). Future
 * waves add drafts and "commit back into descriptor".
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { GEOMETRY_LAB_REGISTRY, findArtifactDefault } from "@/lib/geometryLab/artifactRegistry";
import { useGeometryOverrides, type SizeMode } from "@/lib/geometryLab/store";
import { OVERLAY_FLAGS, useOverlayFlag } from "@/lib/geometryLab/overlayFlags";
import type { AnchorOrigin } from "@/lib/wave4LayoutResolver/types";

const ANCHOR_ORIGINS: AnchorOrigin[] = [
  "center", "topLeft", "topCenter", "bottomCenter", "leftCenter", "rightCenter",
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

export function GeometryLab({ userId }: { userId: string }) {
  const overrides = useGeometryOverrides();
  const [game, setGame] = useState<string>(GEOMETRY_LAB_REGISTRY[0].game);
  const games = GEOMETRY_LAB_REGISTRY;
  const artifactsForGame = useMemo(
    () => games.find((g) => g.game === game)?.artifacts ?? [],
    [games, game],
  );
  const [artifactId, setArtifactId] = useState<string>(artifactsForGame[0]?.artifactId ?? "");

  // Keep artifact selection valid when game changes.
  useEffect(() => {
    if (!artifactsForGame.some((a) => a.artifactId === artifactId)) {
      setArtifactId(artifactsForGame[0]?.artifactId ?? "");
    }
  }, [artifactsForGame, artifactId]);

  const def = findArtifactDefault(artifactId);
  const override = overrides.get(artifactId);

  const [form, setForm] = useState<FormState>({
    anchorX: "", anchorY: "", anchorOrigin: "center",
    sizeMode: "widthDriven", widthPct: "", heightPct: "", aspectRatio: "",
  });
  const [saving, setSaving] = useState(false);

  // When artifact (or override row) changes, hydrate form from override → defaults.
  useEffect(() => {
    if (!def) return;
    const o = override;
    const sizeMode: SizeMode = o?.size_mode ?? "widthDriven";
    setForm({
      anchorX: String(o?.anchor_x ?? def.anchorX),
      anchorY: String(o?.anchor_y ?? def.anchorY),
      anchorOrigin: (o?.anchor_origin ?? def.anchorOrigin) as AnchorOrigin,
      sizeMode,
      widthPct: o?.width_pct != null ? String(o.width_pct) : (def.widthPct != null ? String(def.widthPct) : ""),
      heightPct: o?.height_pct != null ? String(o.height_pct) : (def.heightPct != null ? String(def.heightPct) : ""),
      aspectRatio: o?.aspect_ratio != null ? String(o.aspect_ratio) : (def.aspectRatio != null ? String(def.aspectRatio) : ""),
    });
  }, [artifactId, override, def]);

  if (!def) return <div className="text-muted-foreground text-sm">No artifact selected.</div>;

  // Derived (read-only) value, based on sizeMode.
  const wNum = num(form.widthPct);
  const hNum = num(form.heightPct);
  const arNum = num(form.aspectRatio);
  const derivedH = form.sizeMode === "widthDriven" && wNum != null && arNum != null && arNum > 0
    ? (wNum / arNum).toFixed(4) : "";
  const derivedW = form.sizeMode === "heightDriven" && hNum != null && arNum != null
    ? (hNum * arNum).toFixed(4) : "";

  async function handleSave() {
    setSaving(true);
    const payload: Record<string, unknown> = {
      artifact_id: artifactId,
      game,
      anchor_x: num(form.anchorX),
      anchor_y: num(form.anchorY),
      anchor_origin: form.anchorOrigin,
      size_mode: form.sizeMode,
      width_pct: form.sizeMode === "heightDriven" ? null : num(form.widthPct),
      height_pct: form.sizeMode === "widthDriven" ? null : num(form.heightPct),
      aspect_ratio: form.sizeMode === "rect" ? null : num(form.aspectRatio),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("geometry_overrides" as any)
      .upsert(payload as any, { onConflict: "artifact_id" });
    setSaving(false);
    if (error) {
      toast.error(`Save failed: ${error.message}`);
    } else {
      toast.success("Geometry saved — all clients updating.");
    }
  }

  async function handleResetToDefault() {
    if (!override) {
      toast.info("Already using canonical default.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("geometry_overrides" as any)
      .delete()
      .eq("artifact_id", artifactId);
    setSaving(false);
    if (error) {
      toast.error(`Reset failed: ${error.message}`);
    } else {
      toast.success("Override cleared.");
    }
  }

  return (
    <div className="space-y-6 pt-2">
      {/* Game + Artifact pickers */}
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Game</Label>
          <Select value={game} onValueChange={setGame}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {games.map((g) => (
                <SelectItem key={g.game} value={g.game}>{g.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Artifact</Label>
          <Select value={artifactId} onValueChange={setArtifactId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {artifactsForGame.map((a) => (
                <SelectItem key={a.artifactId} value={a.artifactId}>
                  {a.artifactId}{override?.artifact_id === a.artifactId ? " ●" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {override && <p className="text-xs text-amber-500">● override active</p>}
        </div>
      </div>

      {/* Geometry */}
      <div className="space-y-3 pt-2 border-t">
        <h3 className="font-semibold">Geometry</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>anchorX</Label>
            <Input type="number" step="0.01" min={0} max={1}
              value={form.anchorX}
              onChange={(e) => setForm((f) => ({ ...f, anchorX: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>anchorY</Label>
            <Input type="number" step="0.01" min={0} max={1}
              value={form.anchorY}
              onChange={(e) => setForm((f) => ({ ...f, anchorY: e.target.value }))} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>anchorOrigin</Label>
          <Select value={form.anchorOrigin} onValueChange={(v) => setForm((f) => ({ ...f, anchorOrigin: v as AnchorOrigin }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ANCHOR_ORIGINS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>sizeMode</Label>
          <Select value={form.sizeMode} onValueChange={(v) => setForm((f) => ({ ...f, sizeMode: v as SizeMode }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="widthDriven">widthDriven</SelectItem>
              <SelectItem value="heightDriven">heightDriven</SelectItem>
              <SelectItem value="rect">rect</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Three cannot be edited together: rect = width+height; widthDriven = width+aspect; heightDriven = height+aspect.
          </p>
        </div>

        {form.sizeMode === "widthDriven" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>widthPct</Label>
              <Input type="number" step="0.01" min={0} max={1} value={form.widthPct}
                onChange={(e) => setForm((f) => ({ ...f, widthPct: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>aspectRatio</Label>
              <Input type="number" step="0.05" value={form.aspectRatio}
                onChange={(e) => setForm((f) => ({ ...f, aspectRatio: e.target.value }))} />
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
              <Input type="number" step="0.01" min={0} max={1} value={form.heightPct}
                onChange={(e) => setForm((f) => ({ ...f, heightPct: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>aspectRatio</Label>
              <Input type="number" step="0.05" value={form.aspectRatio}
                onChange={(e) => setForm((f) => ({ ...f, aspectRatio: e.target.value }))} />
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
              <Input type="number" step="0.01" min={0} max={1} value={form.widthPct}
                onChange={(e) => setForm((f) => ({ ...f, widthPct: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>heightPct</Label>
              <Input type="number" step="0.01" min={0} max={1} value={form.heightPct}
                onChange={(e) => setForm((f) => ({ ...f, heightPct: e.target.value }))} />
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

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button variant="outline" onClick={handleResetToDefault} disabled={saving || !override}>
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
      <Checkbox id={`flag-${flag.key}`} checked={on} onCheckedChange={(v) => setOn(v === true)} />
      <Label htmlFor={`flag-${flag.key}`} className="cursor-pointer text-sm font-normal">
        {flag.label}
      </Label>
    </div>
  );
}
