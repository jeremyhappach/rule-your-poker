import { resolveExactGinRummyRunBackConfig } from '../ginRummyRunBackConfig';

/** Validate the committed snapshot; never fill missing values from form defaults. */
export function resolveExactRunBackConfig(gameType: string, value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const config = value as Record<string, unknown>;
  const integer = (key: string, min: number) => Number.isInteger(config[key]) && Number(config[key]) >= min;
  const bool = (key: string) => typeof config[key] === 'boolean';
  if (!integer('ante_amount', 1)) return null;
  if (gameType === 'gin-rummy') return resolveExactGinRummyRunBackConfig(config);
  if (['horses', 'ship-captain-crew', 'yahtzee'].includes(gameType)) return { ante_amount: config.ante_amount };
  if (gameType === 'cribbage') {
    if (!integer('points_to_win', 1) || !bool('skunk_enabled') || !bool('double_skunk_enabled')
      || !integer('skunk_threshold', 0) || !integer('double_skunk_threshold', 0)
      || !['full', 'half', 'super_quick', 'sprint', 'custom'].includes(String(config.game_mode))) return null;
    if (config.game_mode === 'custom' && config.custom_points_to_win !== config.points_to_win) return null;
    return { ...config };
  }
  if (gameType !== 'holm-game' && gameType !== '3-5-7') return null;
  if (!integer('leg_value', 1) || !integer('legs_to_win', 1)
    || !bool('pussy_tax_enabled') || !bool('pot_max_enabled')
    || !integer('pussy_tax_value', config.pussy_tax_enabled ? 1 : 0)
    || !integer('pot_max_value', config.pot_max_enabled ? 1 : 0)) return null;
  if (gameType === '3-5-7' && (!integer('rollover_amount', 1) || !bool('reveal_at_showdown'))) return null;
  if (gameType === 'holm-game' && (!integer('chucky_cards', 2) || Number(config.chucky_cards) > 7 || !bool('rabbit_hunt'))) return null;
  return { ...config };
}
