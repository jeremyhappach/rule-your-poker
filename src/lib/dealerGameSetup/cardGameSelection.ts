export type CardSetupGameType = 'holm-game' | '3-5-7';

export interface CardGameDefaults {
  ante_amount: number;
  rollover_amount: number;
  leg_value: number;
  legs_to_win: number;
  pussy_tax_enabled: boolean;
  pussy_tax_value: number;
  pot_max_enabled: boolean;
  pot_max_value: number;
  chucky_cards: number;
  rabbit_hunt: boolean;
  reveal_at_showdown: boolean;
}

export interface CardGameSetupSnapshot extends CardGameDefaults {
  game_type: string | null;
}

/**
 * A previous dealer-game snapshot is valid only for the same game type.
 * Keeping this decision pure prevents a completed non-card game from seeding
 * the next card game's form with non-applicable zero-valued fields.
 */
export function resolveSelectedCardGameConfig(
  gameType: CardSetupGameType,
  sessionConfig: CardGameSetupSnapshot | null | undefined,
  defaults: CardGameDefaults | null | undefined,
): CardGameDefaults | null {
  if (sessionConfig?.game_type === gameType) return sessionConfig;
  return defaults ?? null;
}
