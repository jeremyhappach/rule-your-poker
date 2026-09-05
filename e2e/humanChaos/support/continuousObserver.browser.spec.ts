import { expect, test } from '@playwright/test';

import { continuousObserverFailure, HumanChaosContinuousObserver } from './continuousObserver';

const HEALTHY_TIMED_TABLE = `
  <div
    data-lifecycle-branch="loaded-inner"
    data-authoritative-game-id="game-1"
    data-authoritative-game-status="in_progress"
    data-authoritative-game-type="holm-game"
    data-authoritative-dealer-game-id="dealer-1"
    data-authoritative-round-id="round-1"
  >
    <div data-canonical-shell-root>
      <div data-canonical-felt-surface></div>
      <div data-canonical-shell-timer-rail style="width:10px;height:10px"></div>
      <div data-authoritative-action-surface="holm-357-decision"><button>Stay</button></div>
      <div data-canonical-announcement-content style="width:10px;height:10px">Before</div>
      <div data-card-anchor="opp-stack-2"><div data-canonical-card-back></div></div>
      <div data-playing-card-face data-card-id="A-spades" style="width:40px;height:60px"></div>
      <div data-playing-card-face data-card-id="K-hearts" style="width:40px;height:60px"></div>
    </div>
  </div>
  <div style="position:fixed;z-index:40">
    <div data-canonical-shell-tabbar style="width:100px;height:20px"></div>
  </div>
`;

test('continuous observer survives two contexts and retains transient defects', async ({ browser }) => {
  const observer = new HumanChaosContinuousObserver();
  const hostContext = await browser.newContext();
  const peerContext = await browser.newContext();

  try {
    await Promise.all([
      observer.attachContext(hostContext, 'host'),
      observer.attachContext(peerContext, 'peer'),
    ]);
    const [hostPage, peerPage] = await Promise.all([
      hostContext.newPage(),
      peerContext.newPage(),
    ]);
    const url = `data:text/html,${encodeURIComponent(HEALTHY_TIMED_TABLE)}`;
    await Promise.all([hostPage.goto(url), peerPage.goto(url)]);
    await hostPage.waitForTimeout(150);

    await hostPage.evaluate(() => {
      (window as unknown as Record<string, unknown>)
        .__PTOWN_CHAOS_EXPECTED_PEER_DELAY_ONCE__ = 'synthetic-request-timeout';
    });
    await hostPage.getByRole('button', { name: 'Stay' }).click();
    await hostPage.evaluate(() => {
      const announcement = document.querySelector('[data-canonical-announcement-content]');
      if (announcement) announcement.textContent = 'After';
      document.querySelector('[data-lifecycle-branch]')?.setAttribute('data-authoritative-round-status', 'completed');
    });
    await peerPage.evaluate(() => {
      const opponentStack = document.querySelector('[data-card-anchor="opp-stack-2"]');
      const dealtCardBack = document.createElement('div');
      dealtCardBack.setAttribute('data-canonical-card-back', '');
      opponentStack?.append(dealtCardBack);
    });
    await peerPage.waitForTimeout(250);
    await peerPage.evaluate(() => {
      document.querySelector('[data-canonical-shell-timer-rail]')?.remove();
      document.querySelector('[data-lifecycle-branch="loaded-inner"]')
        ?.setAttribute('data-authoritative-dealer-game-id', 'dealer-2');
      const maskedCard = document.createElement('div');
      maskedCard.setAttribute('data-playing-card-face', '');
      maskedCard.setAttribute('data-card-id', '?-?');
      maskedCard.style.cssText = 'display:block;width:40px;height:60px';
      document.body.append(maskedCard);
      const setup = document.createElement('div');
      setup.setAttribute('data-dealer-game-setup-step', 'config');
      setup.style.cssText = 'position:fixed;z-index:30;width:100px;height:100px';
      document.body.append(setup);
      const duplicateShell = document.createElement('div');
      duplicateShell.setAttribute('data-canonical-shell-root', '');
      document.body.append(duplicateShell);
      const duplicateFelt = document.createElement('div');
      duplicateFelt.setAttribute('data-canonical-felt-surface', '');
      document.body.append(duplicateFelt);
      setTimeout(() => { throw new Error('synthetic observer page error'); }, 0);
    });
    await peerPage.waitForTimeout(1_200);

    const evidence = observer.finish();
    const action = evidence.actionReceipts[0];
    const violationCodes = evidence.violations.map((violation) => violation.code);
    expect(action).toEqual(expect.objectContaining({
      actor: 'host',
      actionSurface: 'holm-357-decision',
      buttonText: 'Stay',
      expectedPeerDelayReason: 'synthetic-request-timeout',
    }));
    expect(action.actorProgressMs).not.toBeNull();
    expect(action.peerProgressMs).not.toBeNull();
    expect(evidence.finalSnapshots.peer?.opponentCardBackCounts).toContain('opp-stack-2:2');
    expect(violationCodes).toContain('masked-visible-card-face');
    expect(violationCodes).toContain('timed-action-without-visible-timer');
    expect(violationCodes).toContain('dealer-setup-below-tab-rail');
    expect(violationCodes).toContain('stale-gameplay-artifact-across-dealer-game');
    expect(violationCodes).toContain('duplicate-canonical-shell');
    expect(violationCodes).toContain('duplicate-canonical-felt');
    expect(violationCodes).toContain('loaded-table-missing-canonical-owner');
    expect(violationCodes).toContain('page-error');
  } finally {
    await Promise.allSettled([hostContext.close(), peerContext.close()]);
  }
});

test('continuous observer recognizes Yahtzee dice-only peer progress', async ({ browser }) => {
  const observer = new HumanChaosContinuousObserver();
  const hostContext = await browser.newContext();
  const peerContext = await browser.newContext();

  try {
    await Promise.all([
      observer.attachContext(hostContext, 'host'),
      observer.attachContext(peerContext, 'peer'),
    ]);
    const [hostPage, peerPage] = await Promise.all([
      hostContext.newPage(),
      peerContext.newPage(),
    ]);
    const table = `
      <div
        data-lifecycle-branch="loaded-inner"
        data-authoritative-game-id="game-1"
        data-authoritative-game-status="in_progress"
        data-authoritative-game-type="yahtzee"
        data-authoritative-dealer-game-id="dealer-1"
        data-authoritative-round-id="round-1"
      >
        <div data-canonical-shell-root>
          <div data-canonical-felt-surface></div>
          <div data-authoritative-action-surface="yahtzee-actions"><button>Roll 1</button></div>
          <div data-die-idx="0" data-die-value="2" data-die-held="false" data-die-row="animating" data-die-phase-branch="normal" style="width:20px;height:20px"></div>
        </div>
      </div>
    `;
    const url = `data:text/html,${encodeURIComponent(table)}`;
    await Promise.all([hostPage.goto(url), peerPage.goto(url)]);
    await hostPage.waitForTimeout(150);

    await hostPage.getByRole('button', { name: 'Roll 1' }).click();
    await hostPage.evaluate(() => {
      document.querySelector('[data-die-idx="0"]')?.setAttribute('data-die-value', '6');
    });
    await peerPage.evaluate(() => {
      document.querySelector('[data-die-idx="0"]')?.setAttribute('data-die-value', '6');
    });
    await peerPage.waitForTimeout(150);

    const evidence = observer.finish();
    expect(evidence.actionReceipts[0]?.peerProgressMs).not.toBeNull();
    expect(evidence.finalSnapshots.peer?.visibleDice).toEqual([
      '0:6:false:animating:normal',
    ]);
    expect(continuousObserverFailure(evidence)).toBeNull();
  } finally {
    await Promise.allSettled([hostContext.close(), peerContext.close()]);
  }
});

for (const peerSequence of [3, 4]) {
  test(`binds a real browser mutation receipt to rendered sequence ${peerSequence}`, async ({ browser }) => {
    const observer = new HumanChaosContinuousObserver({ peerBudgetMs: 500 });
    const host = await browser.newContext(), peer = await browser.newContext();
    const table = `<div data-lifecycle-branch="loaded-inner" data-authoritative-game-id="game-1"
      data-authoritative-game-type="holm-game" data-authoritative-game-status="in_progress"
      data-authoritative-dealer-game-id="dealer-1" data-authoritative-round-id="round-1"
      data-authoritative-round-status="betting" data-authoritative-holm-turn-sequence="3">
      <div data-canonical-shell-root><div data-canonical-felt-surface></div>
      <div data-canonical-shell-timer-rail>30</div>
      <div data-authoritative-action-surface="holm-357-decision"><button>Stay</button></div></div></div>
      <script>document.querySelector('button').onclick=async()=>{
        const response=await fetch('/rest/v1/rpc/holm_submit_decision',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({p_game_id:'game-1',p_round_id:'round-1',p_player_id:'player-1',p_decision:'stay'})});
        const receipt=await response.json();
        document.querySelector('[data-lifecycle-branch]').setAttribute('data-authoritative-holm-turn-sequence',receipt.turn_sequence);
      };</script>`;
    try {
      for (const context of [host, peer]) {
        await context.route('**/*', route => route.fulfill({ status: 200,
          contentType: route.request().method() === 'POST' ? 'application/json' : 'text/html',
          body: route.request().method() === 'POST' ? JSON.stringify({round_id:'round-1',turn_sequence:4}) : table }));
      }
      await observer.attachContext(host, 'host');
      await observer.attachContext(peer, 'peer');
      const hostPage = await host.newPage(), peerPage = await peer.newPage();
      await Promise.all([hostPage.goto('https://harness.supabase.co/game/game-1'), peerPage.goto('https://harness.supabase.co/game/game-1')]);
      await hostPage.waitForTimeout(120);
      await hostPage.getByRole('button', {name:'Stay', exact:true}).click();
      await expect(hostPage.locator('[data-lifecycle-branch]')).toHaveAttribute('data-authoritative-holm-turn-sequence','4');
      await peerPage.locator('[data-lifecycle-branch]').evaluate((node, value) => node.setAttribute('data-authoritative-holm-turn-sequence',String(value)), peerSequence);
      await peerPage.waitForTimeout(650);
      const evidence = observer.finish();
      expect(evidence.actionReceipts[0]?.mutationTarget).toEqual({field:'holmTurnSequence',roundId:'round-1',value:4});
      if (peerSequence === 4) expect(continuousObserverFailure(evidence)).toBeNull();
      else expect(continuousObserverFailure(evidence)?.message).toContain('peer-no-progress');
    } finally {
      await Promise.allSettled([host.close(),peer.close()]);
    }
  });
}

for (const mode of ['stuck-peer', 'cosmetic-only', 'wrong-session', 'blocked-control', 'valid-retry', 'local-only'] as const) {
  test(`progress detector negative control: ${mode}`, async ({ browser }, info) => {
    const observer = new HumanChaosContinuousObserver({ peerBudgetMs: 350 });
    const host = await browser.newContext();
    const peer = await browser.newContext();
    let requests = 0;
    try {
      for (const [context, client] of [[host, 'host'], [peer, 'peer']] as const) {
        await observer.attachContext(context, client);
        // All traffic is fulfilled locally: these tests never create a session,
        // authenticate an account or contact a Supabase project.
        await context.route('**/*', async (route) => {
          if (new URL(route.request().url()).pathname.startsWith('/rest/v1/rpc/')) {
            requests += 1;
            if (mode === 'valid-retry' && requests === 1) await route.abort('failed');
            else await route.fulfill({ status: 200, contentType: 'application/json', body: '{"round_id":"round-1","turn_sequence":4}' });
          } else {
            await route.fulfill({ status: 200, contentType: 'text/html', body: HEALTHY_TIMED_TABLE.replace(
              'data-authoritative-round-id="round-1"', 'data-authoritative-round-id="round-1" data-authoritative-holm-turn-sequence="3"',
            ) });
          }
        });
      }
      const hostPage = await host.newPage();
      const peerPage = await peer.newPage();
      await Promise.all([hostPage.goto('https://harness-proof.supabase.co/table'), peerPage.goto('https://harness-proof.supabase.co/table')]);
      await hostPage.waitForTimeout(150);
      await hostPage.evaluate((testMode) => {
        if (testMode === 'local-only') {
          (window as unknown as Record<string, unknown>).__PTOWN_CHAOS_PROGRESS_CONTRACT_ONCE__ = {
            progressExpectation: 'none', progressExemptionReason: 'local card selection',
          };
        }
        document.querySelector('button')!.addEventListener('click', async () => {
          if (testMode === 'local-only') return;
          const options = { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_round_id: 'round-1', p_player_id: 'host', p_decision: 'stay' }) };
          await fetch('/rest/v1/rpc/holm_submit_decision', options).catch(() =>
            fetch('/rest/v1/rpc/holm_submit_decision', options));
          document.querySelector('[data-lifecycle-branch]')!.setAttribute('data-authoritative-round-status', 'completed');
          document.querySelector('[data-lifecycle-branch]')!.setAttribute('data-authoritative-holm-turn-sequence', '4');
        });
      }, mode);
      await hostPage.getByRole('button', { name: 'Stay' }).click();
      if (mode !== 'local-only') {
        await expect(hostPage.locator('[data-lifecycle-branch]')).toHaveAttribute('data-authoritative-round-status', 'completed');
      }
      await peerPage.evaluate((testMode) => {
        if (testMode === 'cosmetic-only') {
          document.querySelector('[data-canonical-announcement-content]')!.textContent = 'Still animating';
          document.querySelector('button')!.disabled = true;
        }
        if (testMode === 'wrong-session' || testMode === 'valid-retry' || testMode === 'blocked-control') {
          const root = document.querySelector('[data-lifecycle-branch]')!;
          if (testMode === 'wrong-session') root.setAttribute('data-authoritative-game-id', 'another-session');
          root.setAttribute('data-authoritative-round-status', 'completed');
          root.setAttribute('data-authoritative-holm-turn-sequence', '4');
        }
        if (testMode === 'blocked-control') {
          const cover = document.createElement('div');
          cover.style.cssText = 'position:fixed;inset:0;z-index:99999;background:white';
          document.body.append(cover);
        }
      }, mode);
      if (mode === 'blocked-control') {
        await expect(observer.requireActionableControl('peer', peerPage, 'button', 250)).rejects.toThrow('not actionable');
      } else if (mode === 'valid-retry') {
        await observer.requireActionableControl('peer', peerPage, 'button', 350);
      }
      await peerPage.waitForTimeout(450);
      const evidence = observer.finish();
      await info.attach('progress-proof.json', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
      const failure = continuousObserverFailure(evidence);
      if (mode === 'valid-retry' || mode === 'local-only') {
        expect(failure).toBeNull();
        expect(requests).toBe(mode === 'valid-retry' ? 2 : 0);
      } else if (mode === 'blocked-control') {
        expect(evidence.actionReceipts[0].peerProgressMs).not.toBeNull();
        expect(failure?.message).toContain('required-control-not-actionable');
        expect(requests).toBe(1);
      } else {
        expect(evidence.actionReceipts[0].peerProgressMs).toBeNull();
        expect(failure?.message).toContain('peer-no-progress');
        expect(requests).toBe(1);
      }
    } finally {
      await Promise.allSettled([host.close(), peer.close()]);
    }
  });
}
