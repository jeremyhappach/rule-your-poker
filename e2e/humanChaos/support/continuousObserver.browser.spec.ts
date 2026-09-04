import { expect, test } from '@playwright/test';

import { HumanChaosContinuousObserver } from './continuousObserver';

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
    await peerPage.evaluate(() => {
      document.querySelector('[data-die-idx="0"]')?.setAttribute('data-die-value', '6');
    });
    await peerPage.waitForTimeout(150);

    const evidence = observer.finish();
    expect(evidence.actionReceipts[0]?.peerProgressMs).not.toBeNull();
    expect(evidence.finalSnapshots.peer?.visibleDice).toEqual([
      '0:6:false:animating:normal',
    ]);
  } finally {
    await Promise.allSettled([hostContext.close(), peerContext.close()]);
  }
});
