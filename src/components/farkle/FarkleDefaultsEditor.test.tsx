// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FarkleDefaultsEditor } from './FarkleDefaultsEditor';
import { loadFarkleAdminDefaults, saveFarkleAdminDefaults } from '@/lib/farkle/dealerDefaults';

vi.mock('@/lib/farkle/dealerDefaults', () => ({
  loadFarkleAdminDefaults: vi.fn(),
  saveFarkleAdminDefaults: vi.fn(),
}));
const seeded = {
  ante_amount: 1, points_to_win: 10000, decision_timer_seconds: 60, bot_decision_delay_seconds: 2,
  farkle_rules: {
    endgame: 'equal_turns', botPolicy: 'balanced', botBankThreshold: 500,
    scoring: {
      version: 1, singles: { '1': 100, '5': 50 },
      ofAKind: { '3': [1000, 200, 300, 400, 500, 600], '4': [1000, 1000, 1000, 1000, 1000, 1000],
        '5': [2000, 2000, 2000, 2000, 2000, 2000], '6': [3000, 3000, 3000, 3000, 3000, 3000] },
      straight: 1500, threePairs: 1500, twoTriplets: 2500, fourPlusPair: 1500,
    },
  },
} as const;
beforeEach(() => {
  vi.mocked(loadFarkleAdminDefaults).mockResolvedValue(structuredClone(seeded) as never);
  vi.mocked(saveFarkleAdminDefaults).mockImplementation(async value => value);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('saves only Farkle Admin Defaults and reloads the server response for future games', async () => {
  render(<FarkleDefaultsEditor />);
  await screen.findByLabelText('Target score');
  fireEvent.change(screen.getByLabelText('Target score'), { target: { value: '12000' } });
  fireEvent.change(screen.getByLabelText('Default endgame'), { target: { value: 'one_last_turn' } });
  fireEvent.change(screen.getByLabelText('Bot bank threshold'), { target: { value: '650' } });
  fireEvent.change(screen.getByLabelText('Human turn seconds'), { target: { value: '55' } });
  fireEvent.change(screen.getByLabelText('3 × 1'), { target: { value: '1100' } });
  fireEvent.click(screen.getByLabelText('Three pairs enabled'));
  fireEvent.click(screen.getByRole('button', { name: 'Save Farkle Defaults' }));
  await waitFor(() => expect(saveFarkleAdminDefaults).toHaveBeenCalledOnce());
  const saved = vi.mocked(saveFarkleAdminDefaults).mock.calls[0][0];
  expect(saved.points_to_win).toBe(12000);
  expect(saved.farkle_rules.endgame).toBe('one_last_turn');
  expect(saved.farkle_rules.botBankThreshold).toBe(650);
  expect(saved.decision_timer_seconds).toBe(55);
  expect(saved.farkle_rules.scoring.ofAKind['3'][0]).toBe(1100);
  expect(saved.farkle_rules.scoring.threePairs).toBe(0);
  expect(await screen.findByText('Farkle defaults saved for future games.')).toBeTruthy();
});
