import { Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getBugTypesForGame, CORRELATION_REQUIRED_BUG_TYPES } from "@/lib/visualBugTypes";
import { buildMetaPayload, BUILD_META } from "@/lib/buildMeta";
import { getClientId, getClientTimestamp, getShortGameId } from "@/lib/clientContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { captureCribbageActiveHandSnapshot } from "@/lib/cribbage/activeHandSnapshotStore";


interface VisualBugReportButtonProps {
  gameId: string;
  gameType?: string | null;
  dealerGameId?: string | null;
  roundId?: string | null;
  handNumber?: number | null;
  phase?: string | null;
  currentTurnPlayerId?: string | null;
  viewerPlayerId?: string | null;
  activeTab?: string | null;
  isPaused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  /** Does the current dealer game have an active countdown? */
  hasActiveTimer?: boolean;
  /** Extra context snapshot (render keys, progress vectors, recent events) */
  extraContext?: Record<string, unknown>;
  variant?: 'mobile' | 'desktop';
  /** Reporter's display name for the chat announcement */
  reporterUsername?: string;
}

function getPlatformInfo(): Record<string, string> {
  try {
    return {
      userAgent: navigator.userAgent.slice(0, 200),
      platform: navigator.platform || 'unknown',
      language: navigator.language || 'unknown',
      screenWidth: String(window.screen?.width ?? 0),
      screenHeight: String(window.screen?.height ?? 0),
      viewportWidth: String(window.innerWidth),
      viewportHeight: String(window.innerHeight),
      devicePixelRatio: String(window.devicePixelRatio ?? 1),
    };
  } catch {
    return { error: 'failed to collect' };
  }
}

export const VisualBugReportButton = ({
  gameId,
  gameType,
  dealerGameId,
  roundId,
  handNumber,
  phase,
  currentTurnPlayerId,
  viewerPlayerId,
  activeTab,
  isPaused,
  onPause,
  onResume,
  hasActiveTimer,
  extraContext,
  variant = 'mobile',
  reporterUsername,
}: VisualBugReportButtonProps) => {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pausedByBugReport = useRef(false);
  const { toast } = useToast();

  const bugTypes = getBugTypesForGame(gameType);

  /** Shared context for all telemetry events */
  const telemetryContext = useCallback(() => ({
    game_id: gameId,
    dealer_game_id: dealerGameId || null,
    round_id: roundId || null,
    hand_number: handNumber ?? null,
    phase: phase || null,
  }), [gameId, dealerGameId, roundId, handNumber, phase]);

  /** Fire-and-forget debug_sync_events telemetry */
  const emitTelemetry = useCallback((
    eventName: string,
    extra: Record<string, unknown> = {},
  ) => {
    supabase
      .from('debug_sync_events')
      .insert({
        game_id: gameId,
        game_type: gameType || 'unknown',
        hand_number: handNumber ?? 0,
        round_id: roundId || null,
        event_type: 'transition',
        severity: 'info',
        event_name: eventName,
        payload: {
          ...telemetryContext(),
          ...buildMetaPayload(),
          ...extra,
        },
      } as any)
      .then(({ error }) => {
        if (error) console.warn('[BUG_REPORT] telemetry write failed:', error.message);
      });
  }, [gameId, gameType, handNumber, roundId, telemetryContext]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    setSelectedType(null);
    setNote('');

    const didPause = !!(hasActiveTimer && !isPaused && onPause);

    emitTelemetry('ui:visual_bug_modal_opened', {
      has_active_timer: !!hasActiveTimer,
      was_already_paused: !!isPaused,
      will_pause: didPause,
    });

    if (didPause) {
      onPause!();
      pausedByBugReport.current = true;

      emitTelemetry('ui:visual_bug_pause_applied', {
        has_active_timer: true,
        pause_source: 'bug-report',
      });
    }
  }, [hasActiveTimer, isPaused, onPause, emitTelemetry]);

  const handleClose = useCallback(() => {
    setOpen(false);
    const didResume = !!(pausedByBugReport.current && onResume);

    emitTelemetry('ui:visual_bug_modal_cancelled', {
      did_resume: didResume,
      pause_was_from_bug_report: pausedByBugReport.current,
    });

    if (didResume) {
      onResume!();
      pausedByBugReport.current = false;

      emitTelemetry('ui:visual_bug_pause_resumed', {
        resume_trigger: 'cancel',
      });
    }
  }, [onResume, emitTelemetry]);

  const handleSubmit = useCallback(async () => {
    if (!selectedType) return;

    const entry = bugTypes.find(bt => bt.value === selectedType);
    if (!entry) return;

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
        return;
      }

      const payload = {
        reporter_user_id: user.id,
        bug_type: entry.value,
        bug_label: entry.label,
        note: note.trim() || null,
        game_id: gameId,
        dealer_game_id: dealerGameId || null,
        round_id: roundId || null,
        hand_number: handNumber ?? null,
        phase: phase || null,
        current_turn_player_id: currentTurnPlayerId || null,
        viewer_player_id: viewerPlayerId || null,
        active_tab: activeTab || null,
        platform_info: getPlatformInfo(),
        build_meta: {
          ...buildMetaPayload(),
          appVersion: BUILD_META.appVersion,
        },
        extra_context: {
          ...(extraContext ?? {}),
          client_id: getClientId(),
          client_timestamp: getClientTimestamp(),
          short_game_id: getShortGameId(gameId),
          requires_debug_events_correlation: CORRELATION_REQUIRED_BUG_TYPES.has(entry.value),
        },
      };

      const { error } = await supabase
        .from('visual_bug_reports' as any)
        .insert(payload as any);

      if (error) {
        console.error('[BUG_REPORT] Insert error:', error);
        toast({ title: "Error", description: "Failed to submit report", variant: "destructive" });
        return;
      }

      // Enriched debug sync event for correlation
      await supabase
        .from('debug_sync_events')
        .insert({
          game_id: gameId,
          game_type: gameType || 'unknown',
          hand_number: handNumber ?? 0,
          round_id: roundId || null,
          event_type: 'transition',
          severity: 'warn',
          event_name: 'ui:visual_bug_reported',
          payload: {
            bug_type: entry.value,
            bug_label: entry.label,
            note: note.trim() || null,
            reporter_user_id: user.id,
            phase: phase || null,
            dealer_game_id: dealerGameId || null,
            viewer_player_id: viewerPlayerId || null,
            active_tab: activeTab || null,
            client_id: getClientId(),
            client_timestamp: getClientTimestamp(),
            short_game_id: getShortGameId(gameId),
            animationPath: `bug-report:${entry.value}`,
            requires_debug_events_correlation: CORRELATION_REQUIRED_BUG_TYPES.has(entry.value),
            ...buildMetaPayload(),
          },
        });

      // Telemetry: submission event
      emitTelemetry('ui:visual_bug_report_submitted', {
        bug_type: entry.value,
        bug_label: entry.label,
        had_note: !!(note.trim()),
        reporter_user_id: user.id,
      });

      setOpen(false);

      // Resume if we paused
      const didResume = !!(pausedByBugReport.current && onResume);
      if (didResume) {
        onResume!();
        pausedByBugReport.current = false;

        emitTelemetry('ui:visual_bug_pause_resumed', {
          resume_trigger: 'submit',
        });
      }
    } catch (err) {
      console.error('[BUG_REPORT] Submit error:', err);
      toast({ title: "Error", description: "Unexpected error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }, [selectedType, note, gameId, dealerGameId, roundId, handNumber, phase, currentTurnPlayerId, viewerPlayerId, activeTab, gameType, extraContext, bugTypes, toast, onResume, emitTelemetry]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleOpen}
        className={cn(
          variant === 'mobile'
            ? "h-8 w-8 text-slate-900 hover:text-slate-700 hover:bg-slate-200/50"
            : "h-9 w-9 text-muted-foreground hover:text-foreground"
        )}
        title="Report visual bug"
      >
        <Bug className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Report Visual Bug</DialogTitle>
            <DialogDescription className="text-xs">
              Select what you saw. Game context is captured automatically.
            </DialogDescription>
          </DialogHeader>

          {pausedByBugReport.current && (
            <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 rounded px-2 py-1">
              ⏸️ Visual bug report being submitted — game timer paused
            </div>
          )}

          <div className="grid grid-cols-1 gap-1.5 max-h-[240px] overflow-y-auto">
            {bugTypes.map(bt => (
              <button
                key={bt.value}
                onClick={() => setSelectedType(bt.value)}
                className={cn(
                  "text-left px-3 py-2 rounded-md text-sm transition-colors",
                  selectedType === bt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 hover:bg-muted text-foreground"
                )}
              >
                {bt.label}
              </button>
            ))}
          </div>

          <Textarea
            placeholder="Optional: describe what you saw..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-16 text-sm resize-none"
            maxLength={500}
          />

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!selectedType || submitting}
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
