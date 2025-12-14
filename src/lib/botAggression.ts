export type AggressionLevel = 'very_conservative' | 'conservative' | 'normal' | 'aggressive' | 'very_aggressive';

// Abbreviations for display next to bot names
export const AGGRESSION_ABBREVIATIONS: Record<AggressionLevel, string> = {
  'very_conservative': 'VC',
  'conservative': 'C',
  'normal': 'N',
  'aggressive': 'A',
  'very_aggressive': 'VA',
};

/**
 * Get the abbreviation for a bot's aggression level
 */
export function getAggressionAbbreviation(level: string | null | undefined): string {
  if (!level) return 'N';
  return AGGRESSION_ABBREVIATIONS[level as AggressionLevel] || 'N';
}
