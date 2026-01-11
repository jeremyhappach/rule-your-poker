import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Trash2 } from "lucide-react";

interface SittingOutDebugLog {
  id: string;
  created_at: string;
  player_id: string;
  user_id: string;
  game_id: string;
  username: string | null;
  is_bot: boolean;
  field_changed: string;
  old_value: boolean | null;
  new_value: boolean;
  reason: string;
  source_location: string;
  additional_context: Record<string, unknown> | null;
}

interface SittingOutDebugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameId?: string;
  userId?: string;
}

export const SittingOutDebugDialog = ({
  open,
  onOpenChange,
  gameId,
  userId,
}: SittingOutDebugDialogProps) => {
  const [logs, setLogs] = useState<SittingOutDebugLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('sitting_out_debug_log' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      // Filter by game if provided
      if (gameId) {
        query = query.eq('game_id', gameId);
      }

      // Filter by user if provided  
      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[SITTING OUT DEBUG] Error fetching logs:', error);
      } else {
        setLogs((data || []) as unknown as SittingOutDebugLog[]);
      }
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    try {
      let query = supabase.from('sitting_out_debug_log' as any).delete();
      
      if (gameId) {
        query = query.eq('game_id', gameId);
      }
      if (userId) {
        query = query.eq('user_id', userId);
      }
      
      // If no filters, clear all (need a condition for delete)
      if (!gameId && !userId) {
        query = query.neq('id', '00000000-0000-0000-0000-000000000000');
      }

      await query;
      setLogs([]);
    } catch (err) {
      console.error('[SITTING OUT DEBUG] Error clearing logs:', err);
    }
  };

  useEffect(() => {
    if (open) {
      fetchLogs();
    }
  }, [open, gameId, userId]);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: false 
    });
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric'
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>🔍 Sitting Out Debug Log</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchLogs}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={clearLogs}
                disabled={logs.length === 0}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[400px] pr-4">
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {loading ? 'Loading...' : 'No sitting out status changes logged yet'}
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-lg border bg-card text-card-foreground"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={log.field_changed === 'sitting_out' ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {log.field_changed}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {String(log.old_value)} → {String(log.new_value)}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(log.created_at)} {formatTime(log.created_at)}
                    </span>
                  </div>
                  
                  <div className="text-sm font-medium mb-1">
                    {log.username || log.user_id.slice(0, 8)}
                    {log.is_bot && ' 🤖'}
                  </div>
                  
                  <div className="text-sm text-foreground mb-2">
                    {log.reason}
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-mono">{log.source_location}</span>
                  </div>
                  
                  {log.additional_context && Object.keys(log.additional_context).length > 0 && (
                    <div className="mt-2 p-2 rounded bg-muted text-xs font-mono overflow-x-auto">
                      {JSON.stringify(log.additional_context, null, 2)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
