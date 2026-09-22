import { CanonicalHistoryView } from './hand-history/CanonicalHistoryView';
import { useCanonicalHistory } from './hand-history/useCanonicalHistory';
import { Run21History } from './run21/Run21History';
import type { ReplayPackageV1 } from '@/lib/replay/contractV1';

interface HandHistoryProps {
  gameId: string;
  currentUserId?: string;
  currentPlayerId?: string;
  currentPlayerChips?: number;
  gameType?: string | null;
  currentRound?: number | null;
  onRun21Replay?: (replay: ReplayPackageV1) => void;
}

export function HandHistory(props: HandHistoryProps) {
  if (props.gameType === 'run21') return <Run21History gameId={props.gameId} onReplay={props.onRun21Replay}/>;
  return <ExistingHandHistory {...props}/>;
}
function ExistingHandHistory({ gameId, currentUserId, currentRound }: HandHistoryProps) {
  const history = useCanonicalHistory(gameId, currentUserId, currentRound);
  if (history.loading) return <p className="p-6 text-center text-sm text-muted-foreground">Loading history…</p>;
  if (history.error) return <div role="alert" className="space-y-2 p-4 text-sm"><p>{history.error}</p><button type="button" onClick={history.retry} className="underline">Retry</button></div>;
  if (!history.games.length) return <p className="p-6 text-center text-sm text-muted-foreground">No hands yet.</p>;
  return <div className="h-full overflow-y-auto"><CanonicalHistoryView {...history} /></div>;
}
