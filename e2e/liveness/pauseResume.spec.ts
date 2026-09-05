import { expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { test } from '../../playwright-fixture';
import { requireTwoPlayerEnvironment } from './support/env';
import { expectCanonicalContinuity, waitForBothClientsInLiveGame } from './support/livenessAssertions';
import { blastFakeMoneySession, closeTwoClientSession, createTwoClientSession, enterDealerGameUnderChaos, type DealerGameType } from './support/twoClientSession';

for (const gameType of ['holm-game', '3-5-7', 'horses', 'ship-captain-crew', 'cribbage', 'gin-rummy', 'yahtzee'] as DealerGameType[]) {
  test(gameType + ': host pause survives peer reconnect and resumes the same round', async ({ browser }, info) => {
    test.setTimeout(180_000);
    const credentials = requireTwoPlayerEnvironment();
    const session = await createTwoClientSession(browser, credentials.player1, credentials.player2);
    try {
      await enterDealerGameUnderChaos(session, gameType);
      await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, gameType);
      const before = await session.cleanupClient.from('games').select('current_game_uuid,total_hands,current_round,pot').eq('id', session.gameId).single();
      expect(before.error).toBeNull();
      for (const paused of [true, false]) {
        await session.hostPage.getByRole('button', { name: 'Player options', exact: true }).click();
        const response = session.hostPage.waitForResponse(r => r.url().includes('/rpc/set_game_paused') && r.request().method() === 'POST');
        await session.hostPage.getByRole('menuitem', { name: paused ? /Pause Game/ : /Resume Game/ }).click();
        const receipt = await response;
        expect(receipt.ok()).toBe(true);
        expect((await receipt.json()).outcome).toBe(paused ? 'paused' : 'resumed');
        await expect.poll(async () => {
          const result = await session.cleanupClient.from('games').select('is_paused').eq('id', session.gameId).single();
          expect(result.error).toBeNull();
          return result.data?.is_paused;
        }).toBe(paused);
        if (paused) {
          await session.peerPage.reload({ waitUntil: 'domcontentloaded' });
          await expect(session.peerPage.getByText(/Game is paused/i).first()).toBeVisible({ timeout: 20_000 });
          await expectCanonicalContinuity(session.hostPage);
          await expectCanonicalContinuity(session.peerPage);
          await session.peerPage.screenshot({ path: info.outputPath('paused-reconnect.png') });
        }
      }
      const after = await session.cleanupClient.from('games').select('current_game_uuid,total_hands,current_round,pot').eq('id', session.gameId).single();
      expect(after.error).toBeNull();
      expect(after.data).toEqual(before.data);
      if (gameType === 'horses') {
        const current = await session.cleanupClient.from('rounds').select('id,horses_state')
          .eq('game_id', session.gameId).eq('dealer_game_id', before.data!.current_game_uuid!)
          .eq('hand_number', before.data!.total_hands!).eq('round_number', before.data!.current_round!).single();
        expect(current.error).toBeNull();
        const state = current.data!.horses_state as any;
        const sequence = state.actionSequence ?? 0;
        const actorId = state.currentTurnPlayerId as string;
        const actor = await session.cleanupClient.from('players').select('user_id').eq('id', actorId).single();
        const host = await session.cleanupClient.auth.getUser();
        let actorClient = session.cleanupClient;
        if (actor.data!.user_id !== host.data.user!.id) {
          const runtime = await session.hostNetwork.waitForRuntimeConfig();
          actorClient = createClient(runtime.url, runtime.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } }) as typeof actorClient;
          const auth = await actorClient.auth.signInWithPassword(credentials.player2);
          expect(auth.error).toBeNull();
        }
        const identity = await session.cleanupClient.from('games').select('pause_version,current_game_uuid' as any).eq('id', session.gameId).single();
        const version = (identity.data as any).pause_version;
        const [pause, roll] = await Promise.all([
          session.cleanupClient.rpc('set_game_paused' as any, { p_game_id: session.gameId, p_paused: true, p_expected_dealer_game_id: before.data!.current_game_uuid, p_expected_pause_version: version } as any),
          actorClient.rpc('horses_scc_apply_action' as any, { _round_id: current.data!.id, _player_id: actorId, _action: 'roll', _expected_action_sequence: sequence, _hold_mask: null } as any),
        ]);
        expect(pause.error).toBeNull();
        expect(roll.error).toBeNull();
        const pauseResult = pause.data as any;
        const rollResult = roll.data as any;
        expect(['paused', 'busy']).toContain(pauseResult.outcome);
        expect(['applied', 'rejected']).toContain(rollResult.outcome);
        const afterRoll = await session.cleanupClient.from('rounds').select('horses_state').eq('id', current.data!.id).single();
        const next = afterRoll.data!.horses_state as any;
        expect(next.actionSequence ?? 0).toBe(sequence + (rollResult.outcome === 'applied' ? 1 : 0));
        if (rollResult.outcome === 'rejected') {
          expect(rollResult.reason).toBe('round_not_current');
          expect(pauseResult.outcome).toBe('paused');
          expect(next.playerStates[actorId].dice).toEqual(state.playerStates[actorId].dice);
        }
        if (pauseResult.outcome === 'paused') {
          const resume = await session.cleanupClient.rpc('set_game_paused' as any, { p_game_id: session.gameId, p_paused: false, p_expected_dealer_game_id: before.data!.current_game_uuid, p_expected_pause_version: pauseResult.pause_version } as any);
          expect(resume.error).toBeNull();
          expect((resume.data as any).outcome).toBe('resumed');
        }
        actorClient.auth.stopAutoRefresh();
      }
    } finally {
      try { await blastFakeMoneySession(session); }
      finally { await closeTwoClientSession(session); }
    }
  });
}
