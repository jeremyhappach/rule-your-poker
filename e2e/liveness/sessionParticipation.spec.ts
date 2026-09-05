import { expect } from '@playwright/test';
import { test } from '../../playwright-fixture';
import { requireTwoPlayerEnvironment } from './support/env';
import { blastFakeMoneySession, closeTwoClientSession, createTwoClientSession } from './support/twoClientSession';

test('stand up and rejoin preserve the participant and use versioned server commands', async ({ browser }, info) => {
  test.setTimeout(180_000);
  const credentials = requireTwoPlayerEnvironment();
  const session = await createTwoClientSession(browser, credentials.player1, credentials.player2);
  const page = session.peerPage;
  try {
    await page.getByRole('button', { name: 'Player options', exact: true }).click();
    const departed = page.waitForResponse(r => r.url().includes('/rpc/session_leave') && r.request().method() === 'POST');
    await page.getByRole('menuitem', { name: 'Stand Up Now', exact: true }).click();
    const leaveResponse = await departed;
    expect(leaveResponse.ok()).toBe(true);
    const leave = leaveResponse.request().postDataJSON();
    expect(Object.keys(leave).sort()).toEqual(['p_expected_version', 'p_game_id', 'p_player_id']);
    const { data: before, error: beforeError } = await session.cleanupClient.from('players')
      .select('*').eq('id', leave.p_player_id).single();
    expect(beforeError).toBeNull();
    expect(before?.status).toBe('left');
    const seat = page.locator('[data-waiting-seat-open] button').first();
    await expect(seat).toBeVisible();
    const seated = page.waitForResponse(r => r.url().includes('/rpc/session_take_seat') && r.request().method() === 'POST');
    await seat.click();
    const seatResponse = await seated;
    expect(seatResponse.ok()).toBe(true);
    expect((await seatResponse.json()).outcome).toBe('seated');
    const command = seatResponse.request().postDataJSON();
    expect(command.p_player_id).toBe(leave.p_player_id);
    expect(command).not.toHaveProperty('chips');
    const { data: after, error: afterError } = await session.cleanupClient.from('players')
      .select('*').eq('id', leave.p_player_id).single();
    expect(afterError).toBeNull();
    expect(after?.status).toBe('active');
    expect(after?.chips).toBe(before?.chips);
    await expect(session.hostPage.locator('[data-start-game-btn]')).toBeVisible();
    await page.screenshot({ path: info.outputPath('rejoined-table.png') });
  } finally {
    try { await blastFakeMoneySession(session); }
    finally { await closeTwoClientSession(session); }
  }
});
