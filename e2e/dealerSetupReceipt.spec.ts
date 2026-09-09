import { expect, test } from '@playwright/test';

for (const order of ['snapshot-first', 'realtime-first', 'cold-later-mount']) {
  test(`dealer setup stays stable with ${order}`, async ({ page, baseURL }) => {
    test.setTimeout(60_000);
    // This fixture must never run against or send writes to a live backend.
    expect(new URL(baseURL!).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
    const errors: string[] = [];
    const commits: any[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.routeWebSocket('**/*', socket => socket.close());
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === new URL(baseURL!).origin) return route.continue();
      if (url.pathname.endsWith('/rpc/configure_dealer_game')) {
        const input = request.postDataJSON();
        commits.push(input);
        const dealerGameId = 'cc4f5c49-106f-4922-bb74-bbe8388c4b4e';
        return route.fulfill({ json: {
          outcome: 'configured', deduped: false,
          setup_identity: { game_id: input.p_game_id, dealer_position: input.p_expected_dealer_position,
            expected_config_deadline: input.p_expected_config_deadline },
          game: { id: input.p_game_id, status: 'ante_decision', config_complete: true, current_game_uuid: dealerGameId },
          dealer_game: { id: dealerGameId, session_id: input.p_game_id, game_type: input.p_game_type },
          players: [{ id: input.p_dealer_player_id, position: input.p_expected_dealer_position,
            ante_decision: 'ante_up', sitting_out: false }],
        } });
      }
      if (url.pathname.endsWith('/game_defaults')) return route.fulfill({ json: {
        game_type: url.searchParams.get('game_type')?.replace('eq.', ''), ante_amount: 5,
        harness_profile: 'none', harness_enabled: false,
      } });
      return route.fulfill({ json: [] });
    });
    await page.goto(`/e2e/fixtures/dealerSetupReceipt.html${order === 'cold-later-mount' ? '?cold' : ''}`);
    await page.waitForFunction(() => !!(window as any).dealerSetupControl);
    const deliver = (phase: string) => page.evaluate(value => (window as any).dealerSetupControl.deliver(value), phase);
    if (order !== 'cold-later-mount') {
      if (order === 'realtime-first') await deliver('selection');
      await deliver('setup');
      await expect(page.getByTestId('pending-draw')).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Dice Games', exact: true })).toHaveCount(0);
      await deliver('selection');
      await deliver('setup');
      await expect(page.getByTestId('pending-draw')).toBeVisible();
      await page.evaluate(() => (window as any).dealerSetupControl.complete());
    }
    await page.getByRole('tab', { name: 'Dice Games', exact: true }).click();
    const diceId = await page.getByRole('tab', { name: 'Dice Games', exact: true }).getAttribute('id');
    await deliver('selection');
    await deliver('setup');
    await expect(page.getByTestId('pending-draw')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Dice Games', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Dice Games', exact: true })).toHaveAttribute('id', diceId!);
    await page.locator('[data-dealer-game-option="yahtzee"]').click();
    await page.getByLabel('Ante ($)', { exact: true }).fill('7');
    await deliver('setup');
    await expect(page.getByLabel('Ante ($)', { exact: true })).toHaveValue('7');
    await page.screenshot({ path: test.info().outputPath('setup-stable.png') });
    await page.getByRole('button', { name: 'Start Yahtzee', exact: true }).click();
    await expect(page.getByTestId('configured')).toBeVisible();
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({ p_game_type: 'yahtzee', p_config: { ante_amount: 7 } });
    expect(errors).toEqual([]);
  });
}
