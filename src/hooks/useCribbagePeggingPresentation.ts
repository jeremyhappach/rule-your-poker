import {useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState} from 'react';
import type {CribbageCard, CribbageEvent, CribbageState} from '@/lib/cribbageTypes';
import {cribbageScoreDurationMs} from '@/lib/cribbage/sounds';

const cardKey = (card: CribbageCard) => `${card.rank}:${card.suit}`;
type Award = {event: CribbageEvent; card: string | null; final: boolean};
type GoDeclaration = {id: string; playerIds: string[]; card: string | null};
const goPlayers = (state: CribbageState | null) => new Set([
  ...state?.pegging.goCalledBy ?? [], ...state?.pegging.pendingGoBubblePlayerIds ?? [],
]);
type Owner = {scope: string; seen: Set<string>; landed: Set<string>; queue: Award[]; busy: boolean; final: string | null;
  goPlayers: Set<string>; pendingGo: GoDeclaration | null; interrupted?: CribbageState | null};

/** Accepted awards wait for their own card handoff. This owns no game state. */
export function useCribbagePeggingPresentation({scope, state, admitted, active}: {
  scope: string; state: CribbageState | null; admitted: boolean; active: boolean;
}) {
  const owner = useRef<Owner | null>(null);
  const latest = useRef(state); latest.current = state;
  const [shown, setShown] = useState<{scope: string; event: CribbageEvent} | null>(null);
  const [go, setGo] = useState<{scope: string; declaration: GoDeclaration} | null>(null);
  const [started, setStarted] = useState<string | null>(null);
  const [revision, update] = useReducer(n => n + 1, 0);
  const reset = useCallback(() => {
    const current = owner.current;
    if (!current) return;
    const event = latest.current?.lastEvent;
    if (event) current.seen.add(event.id);
    current.queue = []; current.busy = false; current.final = null;
    current.goPlayers = goPlayers(latest.current); current.pendingGo = null;
    current.interrupted = latest.current;
    for (const play of latest.current?.pegging.playedCards ?? []) current.landed.add(cardKey(play.card));
    setShown(null); setGo(null); update();
  }, []);
  useEffect(() => {
    const hidden = () => { if (document.hidden) reset(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('offline', reset);
    return () => {document.removeEventListener('visibilitychange', hidden); window.removeEventListener('offline', reset);};
  }, [reset]);

  useLayoutEffect(() => {
    if (!state) return;
    const event = state.lastEvent;
    if (owner.current?.scope !== scope) {
      // Hydrated events are history, never new audible awards.
      owner.current = {scope, seen: new Set(event ? [event.id] : []),
        landed: new Set(state.pegging.playedCards.map(play => cardKey(play.card))), queue: [], busy: false, final: null,
        goPlayers: goPlayers(state), pendingGo: null};
      setShown(null); setGo(null); update(); return;
    }
    const current = owner.current;
    if (!active || document.hidden || !navigator.onLine) {
      current.interrupted = state;
      current.goPlayers = goPlayers(state);
      if (event) current.seen.add(event.id);
      for (const play of state.pegging.playedCards) current.landed.add(cardKey(play.card));
      if (current.queue.length || current.busy || current.final || shown || current.pendingGo || go) reset();
      return;
    }
    if (current.interrupted !== undefined) {
      // The first fresh recovery receipt is a baseline, not a live award.
      if (event) current.seen.add(event.id);
      current.goPlayers = goPlayers(state);
      for (const play of state.pegging.playedCards) current.landed.add(cardKey(play.card));
      if (state !== current.interrupted) current.interrupted = undefined;
      return;
    }
    const declared = goPlayers(state);
    const added = [...declared].filter(id => !current.goPlayers.has(id));
    current.goPlayers = declared;
    if (state.phase !== 'pegging') current.pendingGo = null;
    else if (admitted && added.length) {
      const played = state.pegging.playedCards;
      for (const play of played.slice(0, -1)) current.landed.add(cardKey(play.card));
      current.pendingGo = {id: `${scope}:go:${state.pegging.eventSequence ?? played.map(play => cardKey(play.card)).join(',')}:${added.sort().join(':')}`, playerIds: added,
        card: played.length ? cardKey(played[played.length - 1].card) : null};
    }
    const declaration = current.pendingGo;
    if (declaration && (declaration.card === null || current.landed.has(declaration.card))) {
      current.pendingGo = null; setGo({scope, declaration});
    }
    if (event && !current.seen.has(event.id)) {
      current.seen.add(event.id);
      if (admitted && event.type !== 'hand_count' && event.points > 0) {
        const played = state.pegging.playedCards;
        const last = played.at(-1);
        // Transport presents only the newest card after a compacted receipt.
        for (const play of played.slice(0, -1)) current.landed.add(cardKey(play.card));
        current.queue.push({event, card: event.type === 'his_heels' || !last ? null : cardKey(last.card),
          final: state.phase === 'counting'});
        update();
      }
    }
    const next = current.queue[0];
    if (!current.busy && next && (next.card === null || current.landed.has(next.card))) {
      current.queue.shift(); current.busy = true;
      current.final = next.final ? next.event.id : current.final;
      setShown({scope, event: next.event});
    }
  }, [scope, state, admitted, active, revision, reset, shown, go]);

  useEffect(() => {
    const current = owner.current;
    if (!shown || !current || current.scope !== shown.scope || started !== `${shown.scope}:${shown.event.id}`) return;
    // Child audio commits before this effect. Include the final sample tail.
    const timer = setTimeout(() => {
      if (owner.current !== current) return;
      current.busy = false; update();
    }, cribbageScoreDurationMs(shown.event.points));
    return () => clearTimeout(timer);
  }, [shown, started]);

  const presented = useCallback((id: string) => {
    if (owner.current) setStarted(`${owner.current.scope}:${id}`);
  }, []);

  const landed = useCallback((handScope: string, card: CribbageCard) => {
    if (owner.current?.scope !== handScope) return;
    owner.current.landed.add(cardKey(card)); update();
  }, []);
  const retired = useCallback((id: string) => {
    if (owner.current?.final !== id) return;
    owner.current.final = null; update();
  }, []);
  const isPending = useCallback(() => {
    const current = owner.current?.scope === scope ? owner.current : null;
    return !!current && (current.queue.length > 0 || current.busy || current.final !== null);
  }, [scope]);
  return {event: shown?.scope === scope ? shown.event : null, go: go?.scope === scope ? go.declaration : null,
    landed, retired, presented, isPending,
    pending: isPending()};
}
