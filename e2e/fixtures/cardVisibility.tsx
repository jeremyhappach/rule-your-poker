import React from 'react';
import { createRoot } from 'react-dom/client';
import { observeCardVisibility, type CardVisibilityContract, type CardVisibilitySample } from '../../src/lib/cardVisibilityMonitor';
import { retainCardVisibilityIncident, flushCardVisibilityIncidents } from '../../src/lib/cardVisibilityIncident';
import { supabase } from '../../src/integrations/supabase/client';

const contract: CardVisibilityContract = { gameId: crypto.randomUUID(), dealerGameId: crypto.randomUUID(), roundId: crypto.randomUUID(),
  viewerId: '', handNumber: 1, roundNumber: 1, handContextId: 'h1', runtimeHandContextId: 'h1', gameType: 'holm-game', phase: 'GAMEPLAY', active: true,
  selfExpected: 4, communityExpected: 4, communityFaces: 2, selfDataCount: 4, communityDataCount: 4, settledCount: 12, pendingIntents: 0, paused: false, canAct: true };
function Fixture() {
  return <main id="table" style={{ width: 360, height: 600 }}>
    <button id="action" onClick={e => e.currentTarget.textContent = String(Number(e.currentTarget.textContent) + 1)}>0</button>
    <section id="board" data-holm-canonical-community-row="" style={{ display: 'flex', height: 100 }} />
    <section id="hand" data-holm-active-hand-region="" style={{ display: 'flex', height: 100 }} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
const events: unknown[] = [], costs: number[] = [];
let watcher: ReturnType<typeof observeCardVisibility> | undefined;
function render() {
  for (const [id, count, faces] of [['hand', contract.selfExpected, contract.selfExpected], ['board', contract.communityExpected, contract.communityFaces]] as const) {
    document.getElementById(id)!.innerHTML = Array.from({ length: count }, (_, i) => `<div ${i < faces ? 'data-playing-card-face' : 'data-canonical-card-back'} style="width:40px;height:70px;background:${i < faces ? 'white' : 'navy'};border:1px solid gray"></div>`).join('');
  }
}
function capture(sample: CardVisibilitySample, preceding: CardVisibilitySample[]) {
  events.push({ sample, preceding });
  if (contract.viewerId) retainCardVisibilityIncident(sample, preceding);
}
Object.assign(window, { cardTest: {
  contract, events, costs, render,
  start() { watcher?.stop(); render(); watcher = observeCardVisibility(document.getElementById('table')!, () => contract, capture, ms => costs.push(ms)); },
  stop() { watcher?.stop(); }, update() { watcher?.update(); },
  async login(email: string, password: string) { const { data, error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; contract.viewerId = data.user!.id; return data.user!.id; },
  flush: flushCardVisibilityIncidents,
  async rows() { const { data, error } = await supabase.from('debug_events').select('id,payload').eq('game_id', contract.gameId).eq('event_type', 'card-visibility-invariant'); if (error) throw error; return data; },
  async clean() { const { error } = await supabase.from('debug_events').delete().eq('game_id', contract.gameId).eq('event_type', 'card-visibility-invariant'); if (error) throw error; },
} });
