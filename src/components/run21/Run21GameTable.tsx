import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useCanonicalFeltInteractionLayerElement } from '@/lib/canonicalShell/useCanonicalFeltInteractionLayerElement';
import { GameplayOpponentSeatLayer } from '@/lib/canonicalShell/GameplayOpponentSeatLayer';
import { ShellHudGrid } from '@/lib/canonicalShell/ShellHudGrid';
import { useShellTabBar, type ShellTabId } from '@/lib/canonicalShell/ShellTabBar';
import { HandHistory } from '@/components/HandHistory';
import { MobileChatPanel } from '@/components/MobileChatPanel';
import { useGameChatContext } from '@/hooks/GameChatContext';
import { useRun21Local } from '@/hooks/useRun21Local';
import { useSafeFelt } from '@/hooks/useRun21SafeFelt';
import { RUN21_GEOMETRY_DEFAULTS } from '@/lib/run21/geometry';
import {CanonicalPlayerIdentityRow} from '@/lib/canonicalShell/CanonicalPlayerIdentityRow';
import {Run21Scoreboard} from './Run21Scoreboard';
import {useRun21Terminal} from './useRun21Terminal';
import type { Intent, Projection } from '@/lib/run21/model';
import type { ReplayPackageV1 } from '@/lib/replay/contractV1';
import { Run21Felt } from './Run21Felt';
import { Run21PlayerPane, Run21Timer } from './Run21PlayerPane';
import { Run21Announcement } from './Run21Announcement';
import { Run21Replay } from './Run21Replay';
import type {VisibleEvent} from '@/lib/run21/history';
import {displayedPlayerId} from '@/lib/run21/presentation';
import {Run21ScoreCelebration} from './Run21ScoreCelebration';
import { Run21FullscreenView } from './Run21FullscreenView';
import { Run21ScoringReference } from './Run21ScoringHelp';
import type { PresentationMode } from '@/lib/canonicalShell/presentationMode';
import {setAutomaticPlay, setSessionPlayerIntent} from '@/lib/sessionPlayerIntent';

interface Props {
  presentationMode?: PresentationMode;
  sittingOut?: boolean;
  gameId: string; dealerGameId: string; userId: string; dealerPosition: number;
  firstRoundId?: string;
  authoritativeComplete?: boolean;
  activeTab: ShellTabId; setActiveTab: (tab: ShellTabId) => void; sessionEnded: boolean;
  onTerminalActive: (active: boolean) => void; onTerminalComplete: (identity: string) => void;
}
function Felt({view, now, onIntent, pending, events,hideScoring}: {events?: VisibleEvent[]; view: Projection; now: number; onIntent?: (intent: Intent) => void; pending?: boolean;hideScoring?:boolean}) {
  const layer = useCanonicalFeltInteractionLayerElement(true);
  const {area, draw} = useSafeFelt(layer, `${displayedPlayerId(view)}:${view.roundId}:${view.revealed}`, RUN21_GEOMETRY_DEFAULTS, !!view.viewerId);
  return layer && area.width > 0 ? createPortal(<div className="run21-felt-safe-area" data-run21-deadline={view.boards[displayedPlayerId(view)]?.deadline ?? undefined}
    style={{left: `${area.x * 100}%`, top: `${area.y * 100}%`, width: `${area.width * 100}%`, height: `${area.height * 100}%`}}>
    <Run21Felt acceptedEvents={events} view={view} now={now} onIntent={onIntent} pending={pending} drawLayer={layer} drawRect={draw} hideScoring={hideScoring}/>
  </div>, layer) : null;
}
/** Game.tsx owns the only PersistentTableShell. This component fills its canonical slots. */
export function Run21GameTable(props: Props) {
  const {snapshot, now, error, pending, onIntent, reconnect, phase,celebration,retireCelebration} = useRun21Local(props.gameId, props.dealerGameId,props.authoritativeComplete);
  const chat = useGameChatContext();
  const [replay, setReplay] = useState<ReplayPackageV1 | null>(null);
  const [participationPending, setParticipationPending] = useState(false);
  const [participationError, setParticipationError] = useState<string | null>(null);
  const view = snapshot?.view;
  const {onTerminalActive, onTerminalComplete} = props;
  useShellTabBar({cardsIcon: 'spade', activeTab: props.activeTab, setActiveTab: props.setActiveTab});
  const {error:closeError,retry:retryTerminal}=useRun21Terminal(view,props.sessionEnded,onTerminalActive,onTerminalComplete,props.firstRoundId);
  useEffect(()=>{if(props.sessionEnded)setReplay(null);},[props.sessionEnded]);
  const returnToPlay = async () => {
    if (!view?.viewerId || participationPending) return;
    setParticipationPending(true); setParticipationError(null);
    try {
      if (props.sittingOut) await setSessionPlayerIntent(view.viewerId, 'rejoin');
      else await setAutomaticPlay(props.gameId, view.roundId, props.dealerGameId, view.viewerId, false);
    } catch (error) {
      setParticipationError(error instanceof Error ? error.message : 'Unable to return. Please try again.');
    } finally {setParticipationPending(false);}
  };
  const errorPane = <div className="text-center text-xs" role="status">{error || closeError}
    {(error || closeError) && <button className="ml-2 underline" onClick={()=>{reconnect();retryTerminal();}}>Reconnect</button>}</div>;
  const participationPane = view && <>
    {view.pausedAt != null && <p role="status">Session paused. {props.sittingOut ? 'Return when you are ready.' : 'Waiting for the host to resume.'}</p>}
    {!view.settlement && view.viewerId && (props.sittingOut || view.automaticPlayers?.includes(view.viewerId)) &&
      <button type="button" disabled={participationPending} onClick={() => void returnToPlay()} className="underline">
        {participationPending ? 'Returning…' : props.sittingOut ? 'Return to match' : 'Take back control'}
      </button>}
    {participationError && <p role="alert">{participationError}</p>}
  </>;
  let pane: ReactNode = errorPane;
  let felt: ReactNode = null, timer: ReactNode = null, identity: ReactNode = null;
  if (view && snapshot) {
    const self = view.players.find(p => p.id === view.viewerId)!;
    pane = props.activeTab === 'history' ? <HandHistory gameId={props.gameId} currentUserId={props.userId} gameType="run21" onRun21Replay={setReplay}/>
      : props.activeTab === 'chat' ? <MobileChatPanel messages={chat.allMessages} onSend={chat.sendMessage} isSending={chat.isSending} currentUserId={props.userId}/>
      : props.activeTab === 'lobby' ? <div className="p-3 text-sm">{view.players.map(p => <p key={p.id}>{p.name} · {snapshot.balances[p.id]}</p>)}
          {props.presentationMode === 'fullscreen' && <div className="mt-4 space-y-3"><h3 className="font-semibold">Run21 rules</h3>
            <p>Place each card into one of five columns. Aim for 21 in every column without going over.</p><Run21ScoringReference/></div>}</div>
      : props.sessionEnded ? null
      : <div className="run21-player-pane">
          {errorPane}
          {participationPane}
          <Run21Scoreboard view={view} now={now}/>
          {!view.revealed&&<Run21PlayerPane view={view} now={now} onIntent={onIntent} pending={pending}/>}
        </div>;
    felt = <>
        <GameplayOpponentSeatLayer family="run21" participants={view.players.filter(p => p.id !== view.viewerId).map(p => ({id: p.id, position: p.seat, name: p.name, chips: snapshot.balances[p.id]}))}
          presentation={{dealerPip: p => p.position === props.dealerPosition,
            isolatedBalance: p => snapshot.balances[p.id]}}/>
        {!props.sessionEnded && (replay ? <Run21Replay replay={replay} renderFrame={(frame, at, controls) => <>
          <Felt view={frame} now={at}/><div className="sr-only">Recorded replay</div>
          {createPortal(<div className="run21-replay-controls">{controls}<button onClick={() => setReplay(null)}>Return to live match</button></div>,
            document.querySelector('[data-hud-row="pane"]') ?? document.createDocumentFragment())}
        </>}/> : <Felt events={snapshot.events} view={view} now={now} onIntent={onIntent} pending={pending} hideScoring={!!celebration}/>)}
</>;
    timer = !props.sessionEnded && !replay ? <Run21Timer view={view} now={now}/> : null;
    identity = self ? <CanonicalPlayerIdentityRow playerId={self.id} name={self.name} chips={snapshot.balances[self.id]} active={view.active_player_id===self.id}/> : null;
  }
  return <div className="h-full min-h-0 flex flex-col relative" data-run21-live data-run21-phase={phase ?? 'turn_preparation'}>
    {!celebration && view && !view.settlement && !props.sessionEnded && <Run21Announcement view={view} dealerGameScope={props.gameId}/>}
    {celebration&&!props.sessionEnded&&<Run21ScoreCelebration key={celebration.key} receipt={celebration} onRetire={retireCelebration}/>}
    {props.presentationMode === 'fullscreen' ? <Run21FullscreenView snapshot={snapshot} now={now} pending={pending}
      onIntent={onIntent} hideScoring={!!celebration} sessionEnded={props.sessionEnded}
      participationControls={participationPane}
      activeTab={props.activeTab} setActiveTab={props.setActiveTab} panel={pane}
      error={(error || closeError) ? <div className="run21-fullscreen-error">{errorPane}</div> : null}
      replay={replay} onReturnLive={() => setReplay(null)}/> : <>
    <div aria-hidden style={{flex: '0 0 var(--play-top-safe-area, 0px)', pointerEvents: 'none'}}/>
    <div className="relative overflow-visible" style={{height: 'var(--shell-felt-h)', flex: '0 0 var(--shell-felt-h)', pointerEvents: 'none'}}>
      {felt ?? <div className="absolute inset-0 flex items-center justify-center" role="status">Preparing Run21…</div>}
    </div>
    <div aria-hidden style={{flex: '0 0 var(--play-bottom-safe-area, 0px)', pointerEvents: 'none'}}/>
    <ShellHudGrid timer={timer} pane={replay ? null : pane} identity={identity}/>
    </>}
  </div>;
}
