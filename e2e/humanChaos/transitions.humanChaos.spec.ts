import { expect, type Locator } from '@playwright/test';

import { test } from '../../playwright-fixture';
import { runOfflineBurst } from '../liveness/support/crossCountryNetwork';
import { requireTwoPlayerEnvironment } from '../liveness/support/env';
import {
  configureDealerGameUnderChaos,
  createTwoClientSession,
  blastFakeMoneySession,
  closeTwoClientSession,
  enterDealerGameUnderChaos,
  submitOutstandingAnteUnderChaos,
  type DealerGameType,
  waitForDealerGameSetupOwner,
} from '../liveness/support/twoClientSession';
import {
  expectCanonicalContinuity,
  waitForBothClientsAction,
  waitForBothClientsInLiveGame,
  waitForEitherClientAction,
} from '../liveness/support/livenessAssertions';
import {
  authoritativeDealerGameId,
  configureShortestTerminal,
  playDealerGameToTerminal,
  requestLastHand,
  TERMINAL_EXPECTATIONS,
} from '../terminal/support/terminalActors';
import { TerminalSettlementProbe } from '../terminal/support/terminalSettlementProbe';
import { HUMAN_CHAOS_MANIFEST, THREE_FIVE_SEVEN_PRESENTATION_MANIFEST, CRIBBAGE_PRESENTATION_MANIFEST, YAHTZEE_PRESENTATION_MANIFEST, GIN_PRESENTATION_MANIFEST, HOLM_PRESENTATION_MANIFEST, isHealthyPresentation, type ChaosScenario } from './manifest';
import { finalizeScenarioObserver, observerEvidenceSummary } from './support/scenarioObserver';
import { capturePreCleanupScreenshots, persistScenarioEvidence } from '../liveness/support/scenarioArtifacts';
import { TransitionPresentationObserver } from './support/transitionPresentation';
import { playDecidingLegPresentation, playSuccessorDecisionPair } from './support/threeFiveSevenPresentationDriver';
import { playCribbagePresentation, playCribbageSuccessor } from './support/cribbagePresentation';
import { armYahtzeePresentation, clearYahtzeePresentationFixture, playYahtzeePresentation, playYahtzeeSuccessor } from './support/yahtzeePresentation';
import { armGinPresentation, clearGinPresentationFixture, playGinPresentation, playGinSuccessor } from './support/ginPresentation';
import { armHolmPresentation, clearHolmPresentationFixture, configureHolmPresentation, playHolmPresentation, playHolmSuccessor } from './support/holmPresentation';

function selectedTransition(): ChaosScenario {
  const id = process.env.PTOWN_E2E_CAMPAIGN_SCENARIO?.trim();
  if (!id) throw new Error('Set PTOWN_E2E_CAMPAIGN_SCENARIO to one human-chaos transition id.');
  const scenario = [...HUMAN_CHAOS_MANIFEST, ...THREE_FIVE_SEVEN_PRESENTATION_MANIFEST, ...CRIBBAGE_PRESENTATION_MANIFEST, ...YAHTZEE_PRESENTATION_MANIFEST, ...GIN_PRESENTATION_MANIFEST, ...HOLM_PRESENTATION_MANIFEST].find((candidate) => candidate.id === id);
  if (!scenario || scenario.family !== 'transition') {
    throw new Error(`Unknown human-chaos transition scenario: ${id}`);
  }
  return scenario;
}

function differentWholeNumber(sourceConfig: unknown, key: string, preferred: number): string {
  const sourceValue = Number(configRecord(sourceConfig)[key]);
  expect(Number.isFinite(sourceValue)).toBe(true);
  return String(sourceValue === preferred ? preferred + 1 : preferred);
}

async function configureChangedParameters(
  gameType: DealerGameType,
  surface: Locator,
  sourceConfig: unknown,
): Promise<void> {
  switch (gameType) {
    case 'holm-game':
      await surface.locator('#ante-holm').fill(differentWholeNumber(sourceConfig, 'ante_amount', 2));
      return;
    case '3-5-7':
      await surface.locator('#legs-to-win').fill('2');
      return;
    case 'cribbage':
      await surface.getByRole('combobox').click();
      await surface.page().getByRole('option', { name: /Custom/ }).click();
      await surface.locator('input[type="number"]').fill('2');
      return;
    case 'gin-rummy':
      await surface.getByRole('button', { name: /Short.*50 pts/ }).click();
      await surface
        .getByText('Per-Point Value ($)', { exact: true })
        .locator('..')
        .locator('input')
        .fill('1');
      return;
    case 'horses':
    case 'ship-captain-crew':
    case 'yahtzee':
      await surface.locator('#ante-simple').fill(differentWholeNumber(sourceConfig, 'ante_amount', 2));
      return;
  }
}

function configRecord(config: unknown): Record<string, unknown> {
  expect(config).not.toBeNull();
  expect(Array.isArray(config)).toBe(false);
  expect(typeof config).toBe('object');
  return config as Record<string, unknown>;
}

function expectCommittedSuccessorConfig(
  scenario: ChaosScenario,
  sourceConfig: unknown,
  successorConfig: unknown,
): void {
  if (scenario.variant === 'unchanged') {
    expect(successorConfig).toEqual(sourceConfig);
    return;
  }
  if (scenario.variant !== 'changed') return;

  expect(successorConfig).not.toEqual(sourceConfig);
  if (scenario.presentationGame === 'cribbage') {
    expect(configRecord(sourceConfig)).toMatchObject({ points_to_win: 1, custom_points_to_win: 1 });
    expect(configRecord(successorConfig)).toEqual({ ...configRecord(sourceConfig), points_to_win: 2, custom_points_to_win: 2 });
  }
  if (scenario.target === 'gin-rummy') {
    const sourceGinConfig = configRecord(sourceConfig);
    expect(sourceGinConfig).toMatchObject({
      points_to_win: 50,
      per_point_value: 0,
    });
    expect(configRecord(successorConfig)).toEqual({
      ...sourceGinConfig,
      per_point_value: 1,
    });
  }
}

async function startSuccessor(
  scenario: ChaosScenario,
  session: Awaited<ReturnType<typeof createTwoClientSession>>,
  sourceConfig: unknown,
): Promise<void> {
  if (scenario.variant === 'unchanged') {
    const owner = await waitForDealerGameSetupOwner(session.hostPage, session.peerPage);
    await owner.getByRole('button', { name: /Run Back/ }).click();
    await submitOutstandingAnteUnderChaos(session, !isHealthyPresentation(scenario));
    return;
  }
  const target = scenario.target;
  if (!target) throw new Error(`Transition has no target: ${scenario.id}`);
  await configureDealerGameUnderChaos(session, target, {
    networkFaults: !isHealthyPresentation(scenario),
    configure: async (surface) => {
      if (scenario.variant === 'changed') await configureChangedParameters(target, surface, sourceConfig);
      else await configureShortestTerminal(target, surface);
    },
  });
}

async function waitForBothClientsAtDealerGame(
  session: Awaited<ReturnType<typeof createTwoClientSession>>,
  gameType: DealerGameType,
): Promise<string> {
  // A dealer-game id is allocated at ante. Transition coverage must not treat
  // that allocation as permission to request LAST HAND or drive gameplay: the
  // successor has to be authoritatively live on both browsers first.
  await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, gameType);
  let dealerGameId = '';
  await expect.poll(async () => {
    const [host, peer] = await Promise.all([
      authoritativeDealerGameId(session),
      session.peerPage.locator('[data-lifecycle-branch="loaded-inner"]').getAttribute('data-authoritative-dealer-game-id'),
    ]);
    dealerGameId = host;
    return host === peer && host.length > 0;
  }, { timeout: 60_000, intervals: [250, 500, 1_000] }).toBe(true);
  return dealerGameId;
}

async function waitForPlayableTransitionAction(
  session: Awaited<ReturnType<typeof createTwoClientSession>>,
  gameType: DealerGameType,
): Promise<void> {
  // 3-5-7 deals cards to both players before either decision. Requiring both
  // decision surfaces here prevents a dealer-host presentation deadlock from
  // being hidden by the peer's healthy controls.
  if (gameType === '3-5-7') {
    await waitForBothClientsAction(
      session.hostPage,
      session.peerPage,
      '[data-authoritative-action-surface="holm-357-decision"]',
    );
    if (session.chaosObserver) {
      const selector = '[data-authoritative-action-surface="holm-357-decision"] button:not([disabled])';
      await Promise.all([
        session.chaosObserver.requireActionableControl('host', session.hostPage, selector),
        session.chaosObserver.requireActionableControl('peer', session.peerPage, selector),
      ]);
    }
    return;
  }
  await waitForEitherClientAction(session.hostPage, session.peerPage);
}

test.describe('two-human cross-country dealer-game transition campaign', () => {
  test('selected transition retains only successor state', async ({ browser }, info) => {
    const scenario = selectedTransition();
    const healthyPresentation = isHealthyPresentation(scenario);
    test.setTimeout((healthyPresentation ? 15 : 45) * 60_000);
    const credentials = requireTwoPlayerEnvironment();
    const session = await createTwoClientSession(browser, credentials.player1, credentials.player2);
    const runtime = await session.hostNetwork.waitForRuntimeConfig();
    const probe = await TerminalSettlementProbe.create(runtime.url, runtime.publishableKey, credentials.player1);
    const source = scenario.source!;
    const target = scenario.target!;
    const evidence: Record<string, unknown> = { scenario: scenario.id, status: 'started' };
    const presentation = { host: new TransitionPresentationObserver(), peer: new TransitionPresentationObserver() };
    let primaryError: unknown = null;
    let teardownFailure: AggregateError | null = null;
    let fixtureArmed = false;
    let ginFixtureArmed = false;
    let holmFixtureArmed = false;

    try {
      if (healthyPresentation) {
        await Promise.all([
          presentation.host.attach(session.hostContext, session.hostPage),
          presentation.peer.attach(session.peerContext, session.peerPage),
        ]);
        evidence.builds = await Promise.all([session.hostPage, session.peerPage].map(page => page.evaluate(async () => {
          const response = await fetch('/build-manifest.json', { cache: 'no-store' });
          if (!response.ok) throw new Error('Missing published build identity');
          const manifest = await response.json();
          return { manifest, browserSha: (window as unknown as { __APP_BUILD_SHA__?: string }).__APP_BUILD_SHA__ };
        })));
        const builds = evidence.builds as Array<{ browserSha?: string }>;
        expect(builds[0].browserSha).toMatch(/^[a-f0-9]{40}$/);
        expect(builds[1].browserSha).toBe(builds[0].browserSha);
        if (process.env.PTOWN_E2E_EXPECTED_BUILD_SHA) expect(builds[0].browserSha).toBe(process.env.PTOWN_E2E_EXPECTED_BUILD_SHA);
      }
      if (scenario.presentationGame === 'yahtzee') {
        evidence.fixtureArm = await armYahtzeePresentation(session);
        fixtureArmed = true;
      }
      if (scenario.presentationGame === 'gin-rummy') {
        evidence.fixtureArm = await armGinPresentation(session);
        ginFixtureArmed = true;
      }
      if (scenario.presentationGame === 'holm-game') {
        evidence.fixtureArm = await armHolmPresentation(session);
        holmFixtureArmed = true;
      }
      await enterDealerGameUnderChaos(session, source, {
        networkFaults: !healthyPresentation,
        configure: async (surface) => {
          if (scenario.presentationGame === 'holm-game') return configureHolmPresentation(surface);
          if (scenario.presentationGame === 'yahtzee') { await surface.locator('#ante-simple').fill('10'); return; }
          if (scenario.presentationGame === 'gin-rummy') {
            await configureShortestTerminal(source, surface);
            await surface.locator('#ante-simple').fill('10');
            await surface.getByText('Per-Point Value ($)', { exact: true }).locator('..').locator('input').fill('1');
            return;
          }
          if (!scenario.presentationWinner) return configureShortestTerminal(source, surface);
          await surface.locator('#legs-to-win').fill('3');
          await surface.locator('#leg-value').fill('2');
        },
      });
      const sourceDealerGameId = await waitForBothClientsAtDealerGame(session, source);
      evidence.sourceDealerGameId = sourceDealerGameId;
      const sourceConfig = await probe.readDealerGameConfig(sourceDealerGameId);
      evidence.sourceConfig = sourceConfig;
      await waitForPlayableTransitionAction(session, source);
      if (scenario.presentationWinner) {
        await playDecidingLegPresentation(session, scenario.presentationWinner, probe, presentation, evidence);
      } else if (scenario.presentationGame === 'cribbage') {
        await playCribbagePresentation(session, sourceDealerGameId, probe, presentation, evidence);
      } else if (scenario.presentationGame === 'yahtzee') {
        await playYahtzeePresentation(session, sourceDealerGameId, probe, presentation, evidence);
        evidence.fixtureClear = await clearYahtzeePresentationFixture(session);
        fixtureArmed = false;
      } else if (scenario.presentationGame === 'gin-rummy') {
        await playGinPresentation(session, sourceDealerGameId, probe, presentation, evidence);
        evidence.fixtureClear = await clearGinPresentationFixture(session);
        ginFixtureArmed = false;
      } else if (scenario.presentationGame === 'holm-game') {
        await playHolmPresentation(session, sourceDealerGameId, probe, presentation, evidence);
        evidence.fixtureClear = await clearHolmPresentationFixture(session);
        holmFixtureArmed = false;
      } else {
        await playDealerGameToTerminal(session, source, probe, sourceDealerGameId);
      }

      await startSuccessor(scenario, session, sourceConfig);
      const successorDealerGameId = await waitForBothClientsAtDealerGame(session, target);
      evidence.successorDealerGameId = successorDealerGameId;
      expect(successorDealerGameId).not.toBe(sourceDealerGameId);
      const successorConfig = await probe.readDealerGameConfig(successorDealerGameId);
      evidence.successorConfig = successorConfig;
      expectCommittedSuccessorConfig(scenario, sourceConfig, successorConfig);
      if (!healthyPresentation) await runOfflineBurst(session.peerContext, 1_250);
      await Promise.all([
        expectCanonicalContinuity(session.hostPage),
        expectCanonicalContinuity(session.peerPage),
      ]);
      await waitForBothClientsAtDealerGame(session, target);
      await waitForPlayableTransitionAction(session, target);

      if (scenario.presentationWinner) {
        evidence.successorCaptures = await playSuccessorDecisionPair(session, successorDealerGameId);
        evidence.status = 'passed';
      } else if (scenario.presentationGame === 'cribbage') {
        evidence.successorCaptures = await playCribbageSuccessor(session, successorDealerGameId);
        evidence.status = 'passed';
      } else if (scenario.presentationGame === 'yahtzee') {
        evidence.successorCaptures = await playYahtzeeSuccessor(session, successorDealerGameId);
        evidence.status = 'passed';
      } else if (scenario.presentationGame === 'gin-rummy') {
        evidence.successorCaptures = await playGinSuccessor(session, successorDealerGameId, evidence);
        // Finish independent successor checks before reporting a banner-only
        // mismatch; neither correct settlement nor continuation conceals it.
        for (const role of ['host', 'peer'] as const) {
          expect(evidence[`${role}GinWinnerLabel`], 'Gin winner banner must display the full recorded payout').toMatchObject({ matches: true });
        }
        evidence.status = 'passed';
      } else if (scenario.presentationGame === 'holm-game') {
        evidence.successorCaptures = await playHolmSuccessor(session, successorDealerGameId, evidence);
        evidence.status = 'passed';
      } else {
        await requestLastHand(session, probe);
        const successorResult = await playDealerGameToTerminal(
          session,
          target,
          probe,
          successorDealerGameId,
        );
        evidence.successorResultId = successorResult.id;
        await probe.assertTerminalProof(
          session.gameId,
          successorDealerGameId,
          TERMINAL_EXPECTATIONS[target],
          successorResult,
        );
        evidence.status = 'passed';
      }
    } catch (error) {
      evidence.status = 'failed';
      evidence.error = error instanceof Error ? error.message : String(error);
      primaryError = error;
    } finally {
      const teardownErrors: unknown[] = [];
      if (holmFixtureArmed) {
        try { evidence.fixtureClear = await clearHolmPresentationFixture(session); }
        catch (error) { teardownErrors.push(error); }
      }
      if (ginFixtureArmed) {
        try { evidence.fixtureClear = await clearGinPresentationFixture(session); }
        catch (error) { teardownErrors.push(error); }
      }
      if (fixtureArmed) {
        try { evidence.fixtureClear = await clearYahtzeePresentationFixture(session); }
        catch (error) { teardownErrors.push(error); }
      }
      if (healthyPresentation) {
        evidence.presentation = { host: [...presentation.host.samples], peer: [...presentation.peer.samples],
          overflow: presentation.host.overflow || presentation.peer.overflow };
        if (!primaryError && (presentation.host.overflow || presentation.peer.overflow)) {
          primaryError = new Error('Transition observation overflow; evidence is incomplete');
          evidence.status = 'failed';
          evidence.error = (primaryError as Error).message;
        }
      }
      try {
        const observation = await finalizeScenarioObserver(session, info);
        evidence.continuousObserver = observerEvidenceSummary(observation.evidence);
        if (!primaryError && observation.failure) {
          primaryError = observation.failure;
          evidence.status = 'failed';
          evidence.error = observation.failure.message;
        }
      } catch (error) {
        teardownErrors.push(error);
      }
      try {
        if (primaryError || healthyPresentation) await capturePreCleanupScreenshots(info, [
          { label: 'host', page: session.hostPage }, { label: 'peer', page: session.peerPage },
        ]);
      } catch (error) {
        teardownErrors.push(error);
      }
      try {
        evidence.cleanup = await blastFakeMoneySession(session);
      } catch (error) {
        evidence.cleanup = { verified: false, error: error instanceof Error ? error.message : String(error) };
        teardownErrors.push(error);
      }
      try {
        await persistScenarioEvidence(info, 'human-chaos-transition-evidence.json', evidence);
      } catch (error) {
        teardownErrors.push(error);
      } finally {
        await closeTwoClientSession(session);
      }
      if (teardownErrors.length) {
        teardownFailure = new AggregateError(
          primaryError ? [primaryError, ...teardownErrors] : teardownErrors,
          primaryError ? `${scenario.id} failed and teardown also failed` : `${scenario.id} teardown failed`,
        );
      }
    }
    if (teardownFailure) throw teardownFailure;
    if (primaryError) throw primaryError;
  });
});
