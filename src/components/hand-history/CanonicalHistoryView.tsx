import type { ReactNode } from 'react';
import { MiniCardRow } from './MiniPlayingCard';
import { actionNames, historyGameNames, peggingTotals, playerName, recordedChange, resultText } from './canonicalHistory';
import type { HistoryEvent, HistoryGame, HistoryHand, HistorySnapshot } from './canonicalHistory';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-1.5"><h4 className="text-xs font-semibold">{title}</h4>{children}</section>;
}
function Nested({ title, children }: { title: ReactNode; children: ReactNode }) {
  return <details className="rounded border border-border/50 bg-muted/10"><summary className="cursor-pointer px-3 py-2 text-xs font-medium hover:bg-muted/30">{title}</summary><div className="space-y-2 px-3 pb-3 text-xs">{children}</div></details>;
}
function Scores({ scores, hand }: { scores: Record<string, number> | null | undefined; hand: HistoryHand }) {
  if (!scores || !Object.keys(scores).length) return null;
  return <span className="block text-xs font-medium tabular-nums">{Object.entries(scores).map(([id, score]) => `${playerName(hand, id)} ${score}`).join(' · ')}</span>;
}
function Stacks({ snapshot, hand }: { snapshot: HistorySnapshot | null; hand: HistoryHand }) {
  if (!snapshot?.stacks || !Object.keys(snapshot.stacks).length) return <p className="text-muted-foreground">Stacks were not recorded for this hand.</p>;
  return <dl className="space-y-1 tabular-nums">{Object.entries(snapshot.stacks).map(([id, chips]) => <div key={id} className="flex justify-between gap-3"><dt>{playerName(hand, id)}</dt><dd>${chips.toLocaleString()}</dd></div>)}</dl>;
}
function GinDetails({ event, hand }: { event: HistoryEvent; hand: HistoryHand }) {
  const result = event.payload.result;
  if (!result) return null;
  return <Section title="Gin scoring"><p>{playerName(hand, result.winnerId)}: {result.isGin ? 'Gin' : result.isUndercut ? 'Undercut' : 'Knock'} +{result.pointsAwarded} points</p>
    {[result.knockerId, result.opponentId].map((id: string) => {
      const state = event.payload.playerStates?.[id];
      if (!state) return null;
      return <div key={id} className="space-y-1 rounded bg-muted/20 p-2"><p className="font-medium">{playerName(hand, id)} — {state.deadwoodValue} deadwood</p>
        {state.melds?.map((meld: { type: string; cards: { rank: string; suit: string }[] }, i: number) => <MiniCardRow key={i} cards={meld.cards} label={meld.type === 'set' ? 'Set' : 'Run'} />)}
        <MiniCardRow cards={state.deadwood ?? []} label="Deadwood" /><MiniCardRow cards={state.laidOffCards ?? []} label="Laid off" /></div>;
    })}</Section>;
}
function CribbageDetails({ events, hand }: { events: HistoryEvent[]; hand: HistoryHand }) {
  const plays = events.filter(e => e.type === 'pegging_play' || e.type === 'pegging_award');
  const totalText = Object.entries(peggingTotals(events)).map(([id, n]) => `${playerName(hand, id)} +${n}`).join(', ');
  const counting = events.find(e => e.type === 'counting');
  return <><Nested title={`Pegging${totalText ? ` — ${totalText}` : ''}`}>
    {!totalText && <p className="text-muted-foreground">Pegging totals were not recorded.</p>}
    {plays.map(e => <div key={e.id}>{e.type === 'pegging_play' ? <MiniCardRow cards={e.payload.cards} label={`${playerName(hand, e.actorId)} played`} /> : <p>{playerName(hand, e.actorId)} +{e.payload.points}{e.payload.reason ? ` — ${e.payload.reason}` : ''}</p>}</div>)}
    </Nested>{counting && <Section title="Counting">{Object.entries(counting.payload.awards ?? {}).map(([id, n]) => <p key={id}>{playerName(hand, id)} +{String(n)}</p>)}</Section>}</>;
}
function DiceDetails({ event, hand }: { event: HistoryEvent; hand: HistoryHand }) {
  const states = event.payload.state?.playerStates;
  if (!states) return null;
  return <Section title="Game details">{Object.entries(states as Record<string, any>).map(([id, s]) => <div key={id}><span className="font-medium">{playerName(hand, id)}</span>{s.result?.description && <span> — {s.result.description}</span>}{Array.isArray(s.dice) && <p className="tracking-widest">{s.dice.map((d: number | { value: number }) => typeof d === 'number' ? d : d.value).join(' · ')}</p>}</div>)}</Section>;
}
function RoundContents({ events, hand, gameType }: { events: HistoryEvent[]; hand: HistoryHand; gameType: string }) {
  const actions = events.filter(e => e.type === 'action');
  const board = events.filter(e => e.type === 'community').at(-1);
  const exposures = new Map<string, HistoryEvent>();
  for (const e of events.filter(e => e.type === 'exposure')) exposures.set(`${e.actorId}:${e.payload.reason === 'crib' ? 'crib' : 'hand'}`, e);
  const gin = events.find(e => e.type === 'gin_result');
  const results = events.filter(e => e.type === 'result' && e.payload.settlementKey !== 'gin_rummy_hand_history');
  return <div className="space-y-4 text-xs">
    {actions.length > 0 && <Section title="Actions"><ol className="space-y-1">{actions.map(e => <li key={e.id}>{playerName(hand, e.actorId)} {actionNames[e.payload.action] ?? String(e.payload.action).replace(/_/g, ' ')}</li>)}</ol></Section>}
    {gameType === 'cribbage' && <CribbageDetails events={events} hand={hand} />}
    {board?.payload.cards?.length > 0 && <Section title={gameType === 'cribbage' ? 'Cut Card' : 'Community Cards'}><MiniCardRow cards={board.payload.cards} /></Section>}
    {exposures.size > 0 && !gin && <Section title="Exposed Hands">{Array.from(exposures.values()).map(e => <MiniCardRow key={e.id} cards={e.payload.cards ?? []} label={`${playerName(hand, e.actorId, e.payload.name ?? 'Player')}${e.payload.reason === 'crib' ? '’s crib' : ''}:`} />)}</Section>}
    {gin && <GinDetails event={gin} hand={hand} />}
    {events.filter(e => e.type === 'heels').map(e => <p key={e.id}>{playerName(hand, e.actorId)} +{e.payload.points} — His Heels</p>)}
    {events.filter(e => e.type === 'dice_result').map(e => <DiceDetails key={e.id} event={e} hand={hand} />)}
    {results.length > 0 && <Section title="Result">{results.map(e => <div key={e.id} className="rounded bg-muted/20 p-2"><p className="font-medium">{resultText(e, hand)}</p><p className="mt-1 text-muted-foreground">{Object.entries(e.payload.deltas ?? {}).map(([id, n]) => `${playerName(hand, id)} ${Number(n) > 0 ? '+' : ''}$${Number(n).toLocaleString()}`).join(' · ')}</p></div>)}</Section>}
  </div>;
}
function HandContents({ hand, gameType }: { hand: HistoryHand; gameType: string }) {
  const rounds = new Map<string, { number: number; events: HistoryEvent[] }>();
  const unscoped: HistoryEvent[] = [];
  for (const e of hand.events) {
    if (!e.roundId) { unscoped.push(e); continue; }
    if (!rounds.has(e.roundId)) rounds.set(e.roundId, { number: e.roundNumber ?? 1, events: [] });
    rounds.get(e.roundId)!.events.push(e);
  }
  const orderedRounds = [...rounds.entries()].sort((a, b) => a[1].number - b[1].number);
  return <div className="space-y-4"><Nested title="Starting Stacks & Pot"><Stacks snapshot={hand.opening} hand={hand} /><p>Starting pot: {hand.opening.pot == null ? 'Not recorded' : `$${hand.opening.pot.toLocaleString()}`}</p><Scores scores={hand.opening.scores} hand={hand} /></Nested>
    {orderedRounds.length > 1 ? orderedRounds.map(([id, round]) => <Nested key={id} title={`Round ${round.number}${['357', '3-5-7', '3-5-7-game'].includes(gameType) ? ` — ${[3, 5, 7][round.number - 1] ?? ''} cards` : ''}`}><RoundContents hand={hand} events={round.events} gameType={gameType} /></Nested>) : <RoundContents hand={hand} events={orderedRounds[0]?.[1].events ?? []} gameType={gameType} />}
    {unscoped.some(e => e.type === 'result') && <RoundContents hand={hand} events={unscoped} gameType={gameType} />}
    {hand.scoresAfter && <Section title={hand.terminal ? 'Final Match Score' : 'Match Score After Hand'}><Scores scores={hand.scoresAfter} hand={hand} /></Section>}
    <Nested title="Ending Stacks"><Stacks snapshot={hand.closing} hand={hand} /><p>Ending pot: {hand.closing?.pot == null ? 'Not recorded' : `$${hand.closing.pot.toLocaleString()}`}</p></Nested>
    {hand.provenance === 'legacy_partial' && <p className="text-xs text-muted-foreground">Older history: only retained records are shown. Unrecorded details are unavailable.</p>}
  </div>;
}
export function CanonicalHistoryView({ games, selected, selectGame, viewerId }: { games: HistoryGame[]; selected: string | null; selectGame: (id: string | null) => void; viewerId?: string }) {
  return <div className="space-y-3 p-2" data-canonical-hand-history><p className="text-xs text-muted-foreground">{games.length} games · {games.reduce((sum, g) => sum + g.hands.length, 0)} hands</p>
    {games.map((game, index) => {
      const values = game.hands.map(h => recordedChange(h, viewerId));
      const net = values.some(n => n !== null) ? values.reduce<number>((sum, n) => sum + (n ?? 0), 0) : null;
      const terminal = game.hands.find(h => h.terminal && h.scoresAfter);
      return <section key={game.id} className="overflow-hidden rounded-lg border border-border/50 bg-card/50"><button type="button" aria-expanded={selected === game.id} className="flex w-full items-start justify-between gap-3 p-3 text-left hover:bg-muted/30" onClick={() => selectGame(selected === game.id ? null : game.id)}>
        <span className="space-y-1"><span className="block text-sm font-medium">#{games.length - index} {historyGameNames[game.gameType] ?? game.gameType}</span><span className="block text-[10px] text-muted-foreground">{new Date(game.startedAt).toLocaleString()}</span>{terminal && <Scores scores={terminal.scoresAfter} hand={terminal} />}</span>
        {net !== null && <span className={`text-right text-xs tabular-nums ${net > 0 ? 'text-poker-chip-green' : net < 0 ? 'text-poker-chip-red' : 'text-muted-foreground'}`}><span className="block text-[10px] text-muted-foreground">Recorded net</span>{net > 0 ? '+' : ''}${net.toLocaleString()}</span>}
      </button>{selected === game.id && <div className="space-y-2 px-3 pb-3">{game.hands.map(hand => <Nested key={hand.id} title={`Hand ${hand.handNumber}`}><HandContents hand={hand} gameType={game.gameType} /></Nested>)}</div>}</section>;
    })}</div>;
}
