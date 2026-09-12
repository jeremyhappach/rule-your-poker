import { CanonicalHistoryView } from './hand-history/CanonicalHistoryView';
import { useCanonicalHistory } from './hand-history/useCanonicalHistory';

interface HandHistoryProps {
  gameId: string;
  currentUserId?: string;
  currentPlayerId?: string;
  currentPlayerChips?: number;
  gameType?: string | null;
  currentRound?: number | null;
}

export function HandHistory({ gameId, currentUserId, currentRound }: HandHistoryProps) {
  const history = useCanonicalHistory(gameId, currentUserId, currentRound);
  if (history.loading) return <p className="p-6 text-center text-sm text-muted-foreground">Loading history…</p>;
  if (history.error) return <div role="alert" className="space-y-2 p-4 text-sm"><p>{history.error}</p><button type="button" onClick={history.retry} className="underline">Retry</button></div>;
  if (!history.games.length) return <p className="p-6 text-center text-sm text-muted-foreground">No hands yet.</p>;
  return <div className="h-full overflow-y-auto"><CanonicalHistoryView {...history} /></div>;
}
