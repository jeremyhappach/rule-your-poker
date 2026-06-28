/**
 * NoTimersAdminSection — Geometry Lab "No Timers" global harness.
 *
 *   Smoke-test everything without a single timer expiring.
 *
 * GLOBAL — flipping this affects every player, observer, and device in
 * realtime. Edit requires admin role (enforced by RLS on
 * `public.system_settings`).
 *
 * Persistence contract:
 *   This panel edits the modal-wide draft only. Per-section Save/Reset
 *   buttons are forbidden — the footer **Apply Changes** is the only
 *   commit path. **Cancel / X** discards the draft.
 */

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useDomainDraft } from '@/lib/geometryLab/GeometryLabDraftProvider';
import {
  NO_TIMERS_DEFAULTS,
  NO_TIMERS_KEY,
  type NoTimersConfig,
  useNoTimersEnabled,
} from '@/lib/geometryLab/noTimersStore';

export function NoTimersAdminSection() {
  const liveEnabled = useNoTimersEnabled();
  const { value: draft, setValue, dirty } = useDomainDraft<NoTimersConfig>(
    NO_TIMERS_KEY,
    NO_TIMERS_DEFAULTS,
  );
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3 py-2 border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="space-y-0.5">
          <Label className="text-sm font-semibold cursor-pointer">
            ▼ No Timers{' '}
            {liveEnabled && <span className="ml-2 text-[10px] text-amber-500">(ON · global)</span>}
            {dirty && <span className="ml-2 text-[10px] text-amber-500">(draft)</span>}
          </Label>
          {!open && (
            <p className="text-[11px] text-muted-foreground">
              Disable every timer / deadline-driven auto-advance globally.
            </p>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <>
          <p className="text-xs text-muted-foreground">
            Geometry Lab values are shared globally. Edits stage to the
            modal draft — use the footer <strong>Apply Changes</strong> to
            commit to every player, observer, and device.
          </p>

          <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label className="text-sm">No Timers</Label>
              <p className="text-[11px] text-muted-foreground">
                Hides all countdowns, suppresses client auto-submit /
                timer-expiry paths, blocks time-elapsed bot scheduling,
                and short-circuits server enforce-deadlines / cron
                before any mutation. Deadlines are still written so
                turning this OFF restores normal behavior on the next
                round. Presentation-only delays continue normally.
              </p>
            </div>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(v) => setValue((d) => ({ ...d, enabled: v === true }))}
            />
          </div>
        </>
      )}
    </div>
  );
}
