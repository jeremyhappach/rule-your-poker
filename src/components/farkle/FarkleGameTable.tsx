import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePublishShellFelt } from '@/lib/canonicalShell/ShellOwnedFeltHost';
import { ShellHudGrid } from '@/lib/canonicalShell/ShellHudGrid';
import { ShellTimerRail, useShellTimer } from '@/lib/canonicalShell/ShellTimerRail';
import { useShellTabBar, type ShellTabId } from '@/lib/canonicalShell/ShellTabBar';
import { GameplayOpponentSeatLayer } from '@/lib/canonicalShell/GameplayOpponentSeatLayer';
import { useAnnouncements } from '@/lib/canonicalShell/announcements';
import { useGameChatContext } from '@/hooks/GameChatContext';
import { MobileChatPanel } from '@/components/MobileChatPanel';
import { setAutomaticPlay } from '@/lib/sessionPlayerIntent';
import { PresentationChipBalance } from '@/lib/canonicalShell/PresentationChipBalance';
import { getBotAlias } from '@/lib/botAlias';
import { applyFarkleAction, createFarkleActionRequest, readFarkleReplay } from '@/lib/farkle/authority';
import { admitFarkleSnapshot, farkleCommittedHolds, farkleScopeKey, farkleTurnStatus } from '@/lib/farkle/presentation';
import { FarkleGameplayGeometryProvider } from '@/lib/farkle/FarkleGameplayGeometryProvider';
import type { FarkleAction, FarkleReplay, FarkleScope, FarkleState } from '@/lib/farkle/types';
import { FarkleActiveArea } from './FarkleActiveArea';
import { FarkleScoreboard } from './FarkleScoreboard';
import { FarkleAnchoredSlot } from './FarkleAnchoredSlot';
import { FarkleRemoteStage } from './FarkleRemoteStage';
import { FarkleRules } from './FarkleRules';
import { FarkleHistory } from './FarkleHistory';
import { FarkleTerminalPresentation } from './FarkleTerminalPresentation';

export interface FarkleParticipant {
  id: string; user_id: string; position: number; chips: number; is_bot: boolean;
  auto_fold?: boolean; auto_play_stop_round_id?: string | null; profiles?: { username: string } | null;
}
export interface FarkleGameTableProps {
  scope: FarkleScope; incoming: FarkleState; revision: number; players: FarkleParticipant[];
  currentUserId?: string; isPaused: boolean; isRealMoney: boolean; onRefetch: () => void;
  activeTab?: ShellTabId; onActiveTabChange?: (tab: ShellTabId) => void;
  terminalPresentationLive?: boolean;
  onTerminalPresentationActiveChange?: (active: boolean) => void;
  onTerminalPresentationComplete?: (token: string) => void;
}

/** Isolated consumer of server facts. No bots, random rolls, score calculator or settlement writer. */
export function FarkleGameTable(props: FarkleGameTableProps) {
  const { scope, incoming, revision, players, currentUserId, isPaused, isRealMoney, onRefetch } = props;
  const scopeKey = farkleScopeKey(scope);
  const liveScope = useRef(scopeKey); liveScope.current = scopeKey;
  const [accepted, setAccepted] = useState({ state: incoming, revision, scopeKey });
  const [replay, setReplay] = useState<FarkleReplay | null>(null);
  const [pending, setPending] = useState(false);
  const actionInFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [scoringFlash, setScoringFlash] = useState<{ key: string; indexes: number[] } | null>(null);
  const [localTab, setLocalTab] = useState<ShellTabId>('cards');
  const tab = props.activeTab ?? localTab;
  const setTab = props.onActiveTabChange ?? setLocalTab;
  const chat = useGameChatContext();
  const { emit } = useAnnouncements();
  const state = accepted.scopeKey === scopeKey ? accepted.state : incoming;
  const self = players.find(p => p.user_id === currentUserId && !p.is_bot);
  const nameFor = (id: string) => { const player = players.find(p => p.id === id);
    return player?.is_bot ? getBotAlias(players, player.user_id) : player?.profiles?.username ?? 'Player'; };
  const selfTurn = !!self && self.id === state.currentTurnPlayerId && state.gamePhase === 'playing';
  const controlled = selfTurn && !self.auto_fold && !isPaused;
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 500); return () => clearInterval(timer); }, []);
  const seconds = state.turnDeadline ? Math.max(0, Math.ceil((Date.parse(state.turnDeadline) - clock) / 1000)) : null;
  useShellTimer(state.gamePhase === 'playing' && (seconds !== null || isPaused) ? {
    secondsRemaining: seconds ?? 0, totalSeconds: state.config.turnSeconds, paused: isPaused,
    actorLabel: nameFor(state.currentTurnPlayerId), activePlayerId: state.currentTurnPlayerId,
    identityKey: `${scopeKey}/${state.currentTurnPlayerId}/${state.turnDeadline}`,
  } : null);
  usePublishShellFelt({ gameKind: 'farkle', anteAmount: state.config.ante_amount, pointsToWin: state.config.targetScore, publisherLabel: 'FarkleGameTable' });
  useShellTabBar({ cardsIcon: 'dice', activeTab: tab, setActiveTab: setTab, cardsFlashing: controlled ? 'green' : null, isPaused });

  useEffect(() => {
    setAccepted(previous => admitFarkleSnapshot(previous.scopeKey === scopeKey ? previous.state : null, incoming, scope.roundId,
      previous.scopeKey === scopeKey ? { previous: previous.revision, incoming: revision } : undefined)
      ? { state: incoming, revision, scopeKey } : previous);
  }, [incoming, revision, scopeKey, scope.roundId]);
  useEffect(() => { setReplay(null); setError(null); setPending(false); actionInFlight.current = false; }, [scopeKey]);
  useEffect(() => {
    let cancelled = false;
    void readFarkleReplay(scope).then(value => { if (!cancelled && liveScope.current === scopeKey) setReplay(value); })
      .catch(() => { if (!cancelled) setError('Recorded actions could not be loaded. Refresh to reconnect.'); });
    return () => { cancelled = true; };
  }, [scopeKey, state.actionSequence]);

  const lastPresented = useRef({ scopeKey, sequence: incoming.actionSequence });
  const entry = useRef({ scopeKey, sequence: incoming.actionSequence });
  if (entry.current.scopeKey !== scopeKey) entry.current = { scopeKey, sequence: incoming.actionSequence };
  const animate = state.actionSequence > entry.current.sequence;
  useEffect(() => {
    const prior = lastPresented.current;
    lastPresented.current = { scopeKey, sequence: state.actionSequence };
    if (prior.scopeKey !== scopeKey || state.actionSequence <= prior.sequence) return;
    for (const event of state.events ?? []) {
      const title = event.type === 'farkle' ? 'FARKLE' : event.type === 'hot_dice' ? 'HOT DICE'
        : event.type === 'dice_held' ? `THIS TURN +${(event.points ?? 0).toLocaleString('en-US')}`
        : event.type === 'banked' ? `${nameFor(event.playerId ?? '')} BANKS ${(event.points ?? 0).toLocaleString('en-US')}` : null;
      if (title) emit({
        id: `farkle/${scopeKey}/${state.actionSequence}/${event.type}`, type: 'gameplay_notice',
        scope: { dealerGameId: scope.gameId, roundId: scope.roundId },
        payload: { title }, ttlMs: event.type === 'dice_held' ? 900 : 1600, behavior: 'enqueue',
      });
    }
  }, [scopeKey, state.actionSequence, emit]);
  useEffect(() => {
    const held = state.events?.find(event => event.type === 'dice_held');
    if (!animate || !held) { setScoringFlash(null); return; }
    setScoringFlash({ key: `${scopeKey}/${state.actionSequence}`, indexes: held.indexes ?? [] });
    const timer = setTimeout(() => setScoringFlash(null), 900);
    return () => clearTimeout(timer);
  }, [scopeKey, state.actionSequence, animate]);

  const act = useCallback(async (action: FarkleAction, selection: number[] = []) => {
    if (!controlled || !self || actionInFlight.current) return;
    const request = createFarkleActionRequest(scope, self.id, state, action, selection);
    actionInFlight.current = true; setPending(true); setError(null);
    try {
      const result = await applyFarkleAction(request);
      if (liveScope.current !== scopeKey) return;
      setAccepted(previous => admitFarkleSnapshot(previous.state, result.state, scope.roundId)
        ? { ...previous, state: result.state } : previous);
      if (result.outcome !== 'applied') setError('The table changed. Your latest action was not applied.');
      onRefetch();
    } catch (cause) {
      if (liveScope.current === scopeKey) { setError(cause instanceof Error ? cause.message : 'Could not confirm the action. Reconnecting…'); onRefetch(); }
    } finally { if (liveScope.current === scopeKey) { actionInFlight.current = false; setPending(false); } }
  }, [controlled, self, state, scopeKey, scope, onRefetch]);
  const reclaim = async () => {
    if (!self || pending || self.auto_play_stop_round_id) return;
    setPending(true);
    try { await setAutomaticPlay(scope.gameId, scope.roundId, scope.dealerGameId, self.id, false); onRefetch(); }
    catch (cause) { if (liveScope.current === scopeKey) setError(cause instanceof Error ? cause.message : 'Could not request control.'); }
    finally { if (liveScope.current === scopeKey) setPending(false); }
  };
  const currentReplay = replay?.roundId === scope.roundId ? replay : null;
  const roll = state.events?.find(event => event.type === 'dice_rolled');
  const remoteDice = roll?.dice ?? state.dice;
  const committed = farkleCommittedHolds(currentReplay?.events ?? [], state);
  const heldEvent = state.events?.find(event => event.type === 'dice_held');
  const retired = [...new Set([...state.dice.filter(d => !state.available.includes(d.index)).map(d => d.index),
    ...committed.filter(group => group.rollNumber === state.rollNumber).flatMap(group => group.dice.map(d => d.index)), ...(heldEvent?.indexes ?? [])])];
  const scoring = scoringFlash?.key === `${scopeKey}/${state.actionSequence}` ? scoringFlash.indexes : [];
  return <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-transparent" data-farkle-scope={scopeKey}>
    <FarkleTerminalPresentation scope={scope} state={state} live={props.terminalPresentationLive === true}
      winnerName={nameFor(state.winnerPlayerId ?? '')} winnerIsSelf={self?.id === state.winnerPlayerId}
      onActive={props.onTerminalPresentationActiveChange} onComplete={props.onTerminalPresentationComplete} />
    <div style={{ height: 'var(--shell-play-h)', flex: '0 0 var(--shell-play-h)' }}>
      <FarkleGameplayGeometryProvider>
        {selfTurn || state.gamePhase === 'complete' ? <FarkleAnchoredSlot artifactId="farkle.scoreboard"><FarkleScoreboard state={state} nameFor={nameFor} surface="felt" /></FarkleAnchoredSlot>
          : <FarkleAnchoredSlot artifactId="farkle.remoteDice"><FarkleRemoteStage dice={remoteDice}
          receiptKey={`${scopeKey}/${state.currentTurnPlayerId}/${state.rollNumber}`} animate={animate && !!roll} retired={retired} scoring={scoring} /></FarkleAnchoredSlot>}
        <FarkleAnchoredSlot artifactId="farkle.thisTurn"><div className="flex h-full items-center justify-center font-bold text-amber-100">THIS TURN {state.thisTurn}</div></FarkleAnchoredSlot>
        <FarkleAnchoredSlot artifactId="farkle.turnStatus"><div className="flex h-full items-center justify-center text-sm font-bold text-amber-300">{farkleTurnStatus(state)}</div></FarkleAnchoredSlot>
      </FarkleGameplayGeometryProvider>
      <GameplayOpponentSeatLayer family="farkle" participants={players.filter(p => state.playerStates[p.id] && p.id !== self?.id).map(p => ({ id: p.id, position: p.position, name: nameFor(p.id), chips: p.chips }))}
        presentation={{ dealerPip: () => false, scoreLine: p => state.playerStates[p.id].banked.toLocaleString('en-US'),
          autoRoll: p => !isRealMoney && players.some(row => row.id === p.id && row.auto_fold && !row.is_bot),
          activeTimer: p => !isPaused && seconds !== null && p.id === state.currentTurnPlayerId ? { timeLeft: seconds, maxTime: state.config.turnSeconds, activePlayerId: p.id } : null }} />
    </div>
    <div aria-hidden style={{ flex: '0 0 var(--play-bottom-safe-area, 0px)' }} />
    <ShellHudGrid timer={<div className="flex h-full items-center text-xs text-foreground"><ShellTimerRail /><span className="shrink-0 pr-2 tabular-nums">{isPaused ? 'Paused' : seconds !== null && state.gamePhase === 'playing' ? `${seconds}s` : ''}</span></div>}
      pane={error ? <div role="alert" className="p-2 text-sm text-foreground">{error}<Button size="sm" onClick={() => { setError(null); onRefetch(); }}>Reconnect</Button></div>
      : tab === 'history' ? <FarkleHistory replay={currentReplay} nameFor={nameFor} />
      : tab === 'chat' ? <MobileChatPanel messages={chat.allMessages} onSend={chat.sendMessage} isSending={chat.isSending} currentUserId={currentUserId} diagnosticGameId={scope.gameId} diagnosticDealerGameId={scope.dealerGameId} />
      : tab === 'lobby' ? <div className="h-full overflow-auto p-2 text-sm">{players.map(p => <p key={p.id}>{nameFor(p.id)} · <PresentationChipBalance playerId={p.id} rawBalance={p.chips} /></p>)}</div>
      : selfTurn ? <FarkleActiveArea state={state} controllable={controlled} pending={pending} committed={committed} onAction={act} animate={animate && !!roll} retired={retired} scoring={scoring} />
      : <FarkleScoreboard state={state} nameFor={nameFor} surface="pane" />}
      identity={<div className="flex h-full items-center justify-center gap-2 text-xs text-foreground">
        {self ? <><span>{nameFor(self.id)} · <PresentationChipBalance playerId={self.id} rawBalance={self.chips} /> · {(state.playerStates[self.id]?.banked ?? 0).toLocaleString('en-US')} points</span>
          {!isRealMoney && self.auto_fold && <><Bot className="h-4 w-4" aria-label="Bot control" /><Button size="sm" disabled={pending || !!self.auto_play_stop_round_id} onClick={reclaim}>{self.auto_play_stop_round_id ? 'Rejoining after this turn' : 'Rejoin'}</Button></>}</> : <span>Observing</span>}
        <button type="button" aria-label="Frozen Farkle rules" onClick={() => setHelp(true)}>?</button>
      </div>} />
    <Dialog open={help} onOpenChange={setHelp}><DialogContent className="max-h-full overflow-auto"><DialogHeader><DialogTitle>Farkle rules</DialogTitle></DialogHeader><FarkleRules config={state.config} /></DialogContent></Dialog>
  </div>;
}
