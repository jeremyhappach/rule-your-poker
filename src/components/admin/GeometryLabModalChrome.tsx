/**
 * Geometry Lab — shared modal chrome (Phase 1).
 *
 * Single Apply / Cancel footer for the entire modal session. Per-panel
 * Save UI is forbidden; per-section Reset lives inside each panel.
 *
 * Cancel/X/Esc/outside-close discards every draft across every section
 * via the provider's cancelAll(). If there are unsaved changes, a
 * confirm-discard step protects against accidental loss.
 */

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useGeometryLabDraft } from '@/lib/geometryLab/GeometryLabDraftProvider';

export function GeometryLabModalChrome({ children }: { children: React.ReactNode }) {
  const { dirtyKeys, isDirty, applying, applyAll, cancelAll } =
    useGeometryLabDraft();


  const handleApply = async () => {
    const res = await applyAll();
    if (res.ok) {
      toast.success(
        dirtyKeys.length === 1
          ? 'Geometry Lab defaults applied.'
          : `Geometry Lab defaults applied (${dirtyKeys.length} sections).`,
      );
    } else {
      toast.error(`Apply failed: ${res.error ?? 'unknown error'}`);
    }
  };

  const handleCancel = () => {
    if (isDirty) {
      const ok = typeof window === 'undefined'
        ? true
        : window.confirm(
            `Discard unsaved Geometry Lab changes in ${dirtyKeys.length} section(s)?`,
          );
      if (!ok) return;
    }
    cancelAll();
    toast.message('Geometry Lab draft discarded.');
  };

  return (
    <div className="flex flex-col gap-3">
      <div>{children}</div>


      <div className="sticky bottom-0 z-10 -mx-1 mt-2 flex items-center justify-end gap-2 border-t bg-background/95 px-1 py-2 backdrop-blur">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          disabled={applying}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleApply}
          disabled={!isDirty || applying}
        >
          {applying ? 'Applying…' : `Apply Changes${isDirty ? ` (${dirtyKeys.length})` : ''}`}
        </Button>
      </div>
    </div>
  );
}
