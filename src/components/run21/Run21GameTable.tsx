import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useCanonicalFeltInteractionLayerElement } from '@/lib/canonicalShell/useCanonicalFeltInteractionLayerElement';
import { GameplayOpponentSeatLayer } from '@/lib/canonicalShell/GameplayOpponentSeatLayer';
import { ShellHudGrid } from '@/lib/canonicalShell/ShellHudGrid';
import { useShellTabBar, type ShellTabId } from '@/lib/canonicalShell/ShellTabBar';
import { CanonicalChipDisc } from '@/components/canonicalShell/CanonicalChipDisc';
import { HandHistory } from '@/components/HandHistory';
import { MobileChatPanel } from '@/components/MobileChatPanel';
import { useGameChatContext } from '@/hooks/GameChatContext';
import { useRun21Local } from '@/hooks/useRun21Local';
import { useSafeFelt } from '@/hooks/useRun21SafeFelt';
import { RUN21_GEOMETRY_DEFAULTS } from '@/lib/run21/geometry';
import { run21Request } from '@/lib/run21/localClient';
import type { Intent, Projection } from '@/lib/run21/model';
import type { ReplayPackageV1 } from '@/lib/replay/contractV1';
import { Run21Felt } from './Run21Felt';
import { Run21PlayerPane, Run21Timer } from './Run21PlayerPane';
import { Run21Announcement } from './Run21Announcement';
import { Run21Replay } from './Run21Replay';

interface Props {
  gameId: string; dealerGameId: string; userId: string; dealerPosition: number;
  activeTab: ShellTabId; setActiveTab: (tab: ShellTabId) => void; sessionEnded: boolean;
  onTerminalActive: (active: boolean) => void; onTerminalComplete: (identity: string) => void;
}
function Felt({view, now, onIntent, pending}: {view: Projection; now: number; onIntent?: (intent: Intent) => void; pending?: boolean}) {
  const layer = useCanonicalFeltInteractionLayerElement(true);
  const {area, draw} = useSafeFelt(layer, `${view.viewerId}:${view.roundId}:${view.revealed}`, RUN21_GEOMETRY_DEFAULTS, !!view.viewerId);
  return layer && area.width > 0 ? createPortal(<div className="run21-felt-safe-area" data-run21-deadline={view.viewerId ? view.boards[view.viewerId]?.deadline : undefined}
    style={{left: `${area.x * 100}%`, top: `${area.y * 100}%`, width: `${area.width * 100}%`, height: `${area.height * 100}%`}}>
    <Run21Felt view={view} now={now} onIntent={onIntent} pending={pending} drawLayer={layer} drawRect={draw}/>
  </div>, layer) : null;
}
/** Game.tsx owns the only PersistentTableShell. This component fills its canonical slots. */
export function Run21GameTable(props: Props) {
  const {snapshot, now, error, pending, connected, onIntent, reconnect} = useRun21Local(props.gameId, props.dealerGameId);
  const chat = useGameChatContext();
  const [replay, setReplay] = useState<ReplayPackageV1 | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState('');
  const view = snapshot?.view;
  const {onTerminalActive, onTerminalComplete} = props;
  useShellTabBar({cardsIcon: 'spade', activeTab: props.activeTab, setActiveTab: props.setActiveTab});
  useEffect(() => {
    if (view?.settlement && !props.sessionEnded && !closing) onTerminalActive(true);
  }, [view?.settlement?.resultId, props.sessionEnded, closing, onTerminalActive]);
  useEffect(() => {if (props.sessionEnded) {setReplay(null); onTerminalActive(false);}}, [props.sessionEnded, onTerminalActive]);
  async function finish() {
    if (!view?.settlement || closing) return;
    setClosing(true); setCloseError('');
    try {
      await run21Request(props.gameId, 'close', {});
      onTerminalComplete(`run21|winseq|${props.gameId}|${props.dealerGameId}|1`);
      onTerminalActive(false);
    } catch (e) {setCloseError(e instanceof Error ? e.message : 'Could not finish.'); setClosing(false);}
  }
  const errorPane = <div className="text-center text-xs" role="status">{error || closeError || (!connected ? 'Reconnecting…' : '')}
    {(!connected || error) && <button className="ml-2 underline" onClick={reconnect}>Reconnect</button>}</div>;
  let pane: ReactNode = errorPane;
  if (view && snapshot) {
    const self = view.players.find(p => p.id === view.viewerId)!;
    const winner = view.players.find(p => p.id === view.winnerId);
    pane = props.activeTab === 'history' ? <HandHistory gameId={props.gameId} currentUserId={props.userId} gameType="run21" onRun21Replay={setReplay}/>
      : props.activeTab === 'chat' ? <MobileChatPanel messages={chat.allMessages} onSend={chat.sendMessage} isSending={chat.isSending} currentUserId={props.userId}/>
      : props.activeTab === 'lobby' ? <div className="p-3 text-sm">{view.players.map(p => <p key={p.id}>{p.name} · {snapshot.balances[p.id]}</p>)}</div>
      : props.sessionEnded ? null
      : <div className="run21-player-pane">
          {errorPane}
          {view.revealed ? <div className="text-center text-sm">
            <p>{view.players.map(p => `${p.name}: ${view.boards[p.id]?.result?.score ?? 0}`).join(' · ')}</p>
            {winner ? <><p>{winner.name} wins the match · {view.stake} stake</p><button className="underline" onClick={finish} disabled={closing}>Finish match</button></>
              : <button className="underline" disabled={pending || !connected} onClick={() => void onIntent({type: 'acknowledge'})}>{view.roundNumber >= 3 ? 'Continue sudden death' : 'Next round'}</button>}
          </div> : <Run21PlayerPane view={view} now={now} onIntent={onIntent} pending={pending || !connected}/>}
        </div>;
    return <div className="h-full min-h-0 flex flex-col relative" data-run21-live>
      {!props.sessionEnded && <Run21Announcement view={view} dealerGameScope={props.gameId}/>}
      <div aria-hidden style={{flex: '0 0 var(--play-top-safe-area, 0px)', pointerEvents: 'none'}}/>
      <div className="relative overflow-visible" style={{height: 'var(--shell-felt-h)', flex: '0 0 var(--shell-felt-h)', pointerEvents: 'none'}}>
        <GameplayOpponentSeatLayer family="run21" participants={view.players.filter(p => p.id !== view.viewerId).map(p => ({id: p.id, position: p.seat, name: p.name, chips: snapshot.balances[p.id]}))}
          presentation={{scoreLine: p => view.cumulative[p.id].toLocaleString(), dealerPip: p => p.position === props.dealerPosition,
            isolatedBalance: p => snapshot.balances[p.id],
            passAvailable: p => !props.sessionEnded && !view.passUsed[p.id]}}/>
        {!props.sessionEnded && (replay ? <Run21Replay replay={replay} renderFrame={(frame, at, controls) => <>
          <Felt view={frame} now={at}/><div className="sr-only">Recorded replay</div>
          {createPortal(<div className="run21-replay-controls">{controls}<button onClick={() => setReplay(null)}>Return to live match</button></div>,
            document.querySelector('[data-hud-row="pane"]') ?? document.createDocumentFragment())}
        </>}/> : <Felt view={view} now={now} onIntent={onIntent} pending={pending || !connected}/>)}
      </div>
      <div aria-hidden style={{flex: '0 0 var(--play-bottom-safe-area, 0px)', pointerEvents: 'none'}}/>
      <ShellHudGrid timer={!props.sessionEnded && !replay ? <Run21Timer view={view} now={now}/> : null}
        pane={replay ? null : pane}
        identity={<div className="run21-self-identity"><strong>{self.name}</strong><CanonicalChipDisc amount={snapshot.balances[self.id]} positionAnchor={self.seat} size="cluster"/>
          <span aria-label={`Score ${view.cumulative[self.id]}`}>{view.cumulative[self.id].toLocaleString()}</span></div>}/>
    </div>;
  }
  return <div className="h-full flex flex-col"><div className="flex-1"/><ShellHudGrid timer={null} pane={pane} identity={null}/></div>;
}
