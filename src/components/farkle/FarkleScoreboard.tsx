import type { CSSProperties } from 'react';
import type { FarkleState } from '@/lib/farkle/types';
import './farkle.css';

export function FarkleScoreboard({ state, nameFor, surface }: {
  state: FarkleState; nameFor: (id: string) => string; surface: 'felt' | 'pane';
}) {
  const ids = state.turnOrder.filter(id => state.playerStates[id]);
  return <div className="farkle-scoreboard" data-farkle-scoreboard={surface} style={{ '--farkle-players': ids.length } as CSSProperties}>
    <div role="table" aria-label="Farkle scores">
      {ids.map(id => <div role="row" key={id} data-active={id === state.currentTurnPlayerId}>
        <span role="cell">{nameFor(id)}</span><strong role="cell">{state.playerStates[id].banked.toLocaleString('en-US')}</strong>
      </div>)}
    </div>
  </div>;
}
